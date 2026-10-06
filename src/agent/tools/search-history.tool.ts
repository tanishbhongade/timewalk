import { DynamicStructuredTool } from "@langchain/core/tools";
import { z } from "zod";
import type { SearchProvider } from "../../providers/search/search.interface.js";

const InputSchema = z.object({
  query: z
    .string()
    .min(2)
    .max(300)
    .describe("The historical research question or topic."),
  locationContext: z
    .string()
    .min(1)
    .max(300)
    .describe("Human-readable place context such as city, region, country."),
  fromYear: z.number().int().optional(),
  toYear: z.number().int().optional(),
  maxResults: z.number().int().min(1).max(10).optional(),
});

export function createSearchHistoryTool(search: SearchProvider) {
  return new DynamicStructuredTool({
    name: "search_history",
    description:
      'Search the web for broad historical context about a place. Use this first for open-ended "history of this place" questions.',
    schema: InputSchema,
    func: async (input) => {
      const results = await search.search({
        query: input.query,
        locationContext: input.locationContext,
        period: { fromYear: input.fromYear, toYear: input.toYear },
        maxResults: input.maxResults ?? 5,
        preferWikipedia: true,
      });
      return JSON.stringify({ results });
    },
  });
}
