import { loadEnv } from "../../config/env.js";
import { TavilySearchProvider } from "./tavily.provider.js";
import type { SearchProvider } from "./search.interface.js";

let singleton: SearchProvider | null = null;

export function getSearchProvider(): SearchProvider {
  if (!singleton) {
    const env = loadEnv();
    singleton = new TavilySearchProvider(
      env.TAVILY_API_KEY,
      env.TOOL_TIMEOUT_MS,
    );
  }
  return singleton;
}

export function setSearchProvider(p: SearchProvider): void {
  singleton = p;
}
