import { DynamicStructuredTool } from "@langchain/core/tools";
import { z } from "zod";
import type { SearchProvider } from "../../providers/search/search.interface.js";

const InputSchema = z.object({
  query: z
    .string()
    .min(2)
    .max(300)
    .describe(
      "A precise question about a claim, landmark, person, event, or date.",
    ),
  locationContext: z.string().min(1).max(300),
  target: z
    .string()
    .max(120)
    .optional()
    .describe(
      "Specific entity to investigate (e.g. a building, person, or event name).",
    ),
  maxResults: z.number().int().min(1).max(10).optional(),
});

export function createSearchSpecificTool(search: SearchProvider) {
  return new DynamicStructuredTool({
    name: "search_specific",
    description:
      "Search the web for a specific historical claim, landmark, person, event, or date. Use to verify or narrow a fact.",
    schema: InputSchema,
    func: async (input) => {
      const q = input.target ? `${input.target}: ${input.query}` : input.query;
      const results = await search.search({
        query: q,
        locationContext: input.locationContext,
        maxResults: input.maxResults ?? 5,
        preferWikipedia: true,
      });
      return JSON.stringify({ results });
    },
  });
}
