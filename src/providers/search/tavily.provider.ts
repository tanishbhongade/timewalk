import { tavily } from "@tavily/core";
import type {
  SearchProvider,
  SearchQuery,
  SearchResult,
} from "./search.interface.js";
import { UpstreamError } from "../../utils/errors.js";
import { withTimeout } from "../../utils/timeout.js";
import { withRetry } from "../../utils/retry.js";
import { logger } from "../../utils/logger.js";

const WIKIPEDIA_DOMAINS = ["en.wikipedia.org"];

// Fall through to a broad search below this many Wikipedia hits.
const MIN_WIKI_RESULTS = 1;

interface RawResult {
  url: string;
  title?: string;
  content?: string;
  score?: number;
}

export class TavilySearchProvider implements SearchProvider {
  private readonly client: ReturnType<typeof tavily>;

  constructor(
    apiKey: string,
    private readonly timeoutMs: number,
  ) {
    this.client = tavily({ apiKey });
  }

  async search(q: SearchQuery): Promise<SearchResult[]> {
    const max = q.maxResults ?? 5;
    const preferWikipedia = q.preferWikipedia ?? true;

    const periodHint =
      q.period && (q.period.fromYear != null || q.period.toYear != null)
        ? `history ${q.period.fromYear ?? "?"}..${q.period.toYear ?? "?"}`
        : "";

    const fullQuery = [q.query, q.locationContext, periodHint]
      .filter(Boolean)
      .join(" ");

    const callTavily = async (
      includeDomains: string[] | undefined,
    ): Promise<RawResult[]> => {
      const run = () =>
        withTimeout(
          this.client.search(fullQuery, {
            maxResults: max,
            searchDepth: "advanced",
            includeAnswer: false,
            includeRawContent: false,
            includeDomains,
          }),
          this.timeoutMs,
          "tavily.search",
        );

      const resp = await withRetry(run, {
        retries: 1,
        label: "tavily.search",
        shouldRetry: (err) =>
          !(err instanceof Error) || !/^\s*4\d\d/.test(err.message),
      });

      return (resp.results ?? []) as RawResult[];
    };

    // Phase 1 — Wikipedia-restricted search.
    let results: RawResult[] = [];
    let wikiPhaseUsed = false;

    if (preferWikipedia) {
      try {
        results = await callTavily(WIKIPEDIA_DOMAINS);
        wikiPhaseUsed = results.length > 0;
        logger.debug(
          { query: fullQuery, wikiHits: results.length },
          "tavily wikipedia phase",
        );
      } catch (err) {
        logger.warn(
          { err: (err as Error).message, query: fullQuery },
          "wikipedia phase failed; falling through to broad search",
        );
        results = [];
      }
    }

    // Phase 2 — broad search if Wikipedia was thin or skipped.
    if (results.length < MIN_WIKI_RESULTS) {
      try {
        const broad = await callTavily(undefined);
        // Wikipedia hits come first, then broad hits not already seen.
        const seen = new Set(results.map((r) => r.url));
        for (const r of broad) {
          if (!r.url || seen.has(r.url)) continue;
          seen.add(r.url);
          results.push(r);
        }
        logger.debug(
          { query: fullQuery, totalHits: results.length },
          "tavily broad phase",
        );
      } catch (err) {
        throw new UpstreamError(
          "SEARCH_FAILED",
          `Tavily search failed: ${(err as Error).message}`,
        );
      }
    }

    // Final dedupe (preserves Wikipedia-first ordering).
    const seen = new Set<string>();
    const deduped: RawResult[] = [];
    for (const r of results) {
      if (!r.url || seen.has(r.url)) continue;
      seen.add(r.url);
      deduped.push(r);
    }

    return deduped.map((r) => ({
      id: `src_${hashUrl(canonicalizeUrl(r.url))}`,
      title: r.title ?? "Untitled",
      url: r.url,
      publisher: safeHost(r.url),
      // Tag Wikipedia results tier 1 so the model can weight them
      // even before the general classifier is wired up.
      tier: wikiPhaseUsed && isWikipediaUrl(r.url) ? 1 : undefined,
      snippet: (r.content ?? "").slice(0, 800),
      content: r.content,
      score: r.score,
    }));
  }
}

function isWikipediaUrl(url: string): boolean {
  try {
    const host = new URL(url).hostname.replace(/^www\./, "");
    return host === "en.wikipedia.org" || host.endsWith(".wikipedia.org");
  } catch {
    return false;
  }
}

// Strip common mirror subdomains and locale prefixes so `beta.esamskriti.com`
// and `www.esamskriti.com` hash to the same source ID.
function canonicalizeUrl(url: string): string {
  try {
    const u = new URL(url);
    const host = u.hostname
      .replace(/^www\./, "")
      .replace(/^beta\./, "")
      .replace(/^m\./, "");
    return `${host}${u.pathname}`;
  } catch {
    return url;
  }
}

function safeHost(url: string): string | undefined {
  try {
    return new URL(url).hostname;
  } catch {
    return undefined;
  }
}

function hashUrl(url: string): string {
  let h = 2166136261;
  for (let i = 0; i < url.length; i++) {
    h ^= url.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36).slice(0, 8);
}
