import { randomUUID } from "node:crypto";
import { HistoryAgent } from "../agent/agent.js";
import { createSearchHistoryTool } from "../agent/tools/search-history.tool.js";
import { createSearchSpecificTool } from "../agent/tools/search-specific.tool.js";
import { createNearbyContextTool } from "../agent/tools/nearby-context.tool.js";
import { getSearchProvider } from "../providers/search/index.js";
import { getChatModel } from "../providers/llm/llm.factory.js";
import { LocationService } from "./location.service.js";
import { getCache, type Cache } from "./cache.service.js";
import type { HistoryRequest } from "../schemas/request.schemas.js";
import type { HistoryResult } from "../schemas/response.schemas.js";
import type { ResolvedLocation } from "../schemas/location.schemas.js";
import { loadEnv } from "../config/env.js";
import { logger } from "../utils/logger.js";
import { roundCoord } from "../utils/geo.js";

export interface HistoryRunResult {
  runId: string;
  location: ResolvedLocation;
  result: HistoryResult;
  toolCallCount: number;
  cached: boolean;
}

export interface HistoryServiceDeps {
  locationService: LocationService;
  cache?: Cache;
  createAgent?: () => HistoryAgent;
}

export class HistoryService {
  private readonly cache: Cache;
  private readonly createAgent: () => HistoryAgent;

  constructor(private readonly deps: HistoryServiceDeps) {
    this.cache = deps.cache ?? getCache();
    this.createAgent =
      deps.createAgent ??
      (() => {
        const env = loadEnv();
        const search = getSearchProvider();
        return new HistoryAgent({
          model: getChatModel(),
          tools: [
            createSearchHistoryTool(search),
            createSearchSpecificTool(search),
            createNearbyContextTool(search),
          ],
          maxToolCalls: env.AGENT_MAX_TOOL_CALLS,
        });
      });
  }

  async run(req: HistoryRequest, requestId: string): Promise<HistoryRunResult> {
    const runId = `run_${randomUUID()}`;
    const env = loadEnv();

    const location = await this.deps.locationService.resolve(
      req.location.latitude,
      req.location.longitude,
      req.location.accuracyMeters,
    );

    const cacheKey = buildCacheKey(req, location);
    const cached = await this.cache.get<HistoryResult>(cacheKey);
    if (cached) {
      logger.info({ requestId, runId, cached: true }, "history cache hit");
      return {
        runId,
        location,
        result: cached,
        toolCallCount: 0,
        cached: true,
      };
    }

    const agent = this.createAgent();
    const { result, toolCallCount } = await agent.run({
      question: req.question,
      location,
      period: req.period,
      language: req.language,
    });

    if (env.CACHE_TTL_SECONDS > 0) {
      await this.cache.set(cacheKey, result, env.CACHE_TTL_SECONDS);
    }

    logger.info(
      {
        requestId,
        runId,
        toolCallCount,
        stories: result.stories.length,
        sources: result.sources.length,
        lat: roundCoord(req.location.latitude),
        lng: roundCoord(req.location.longitude),
      },
      "history run complete",
    );

    return { runId, location, result, toolCallCount, cached: false };
  }
}

function buildCacheKey(req: HistoryRequest, loc: ResolvedLocation): string {
  const lat = loc.latitude.toFixed(3);
  const lng = loc.longitude.toFixed(3);
  return [
    "history",
    lat,
    lng,
    req.period?.fromYear ?? "",
    req.period?.toYear ?? "",
    req.language ?? "",
    req.question.trim().toLowerCase(),
  ].join("|");
}
