import { DynamicStructuredTool } from "@langchain/core/tools";
import { z } from "zod";
import type { SearchProvider } from "../../providers/search/search.interface.js";

const InputSchema = z.object({
  locationContext: z.string().min(1).max(300),
  question: z
    .string()
    .min(2)
    .max(300)
    .describe(
      "What nearby context is needed, e.g. notable landmarks near this point.",
    ),
  maxResults: z.number().int().min(1).max(8).optional(),
});

export function createNearbyContextTool(search: SearchProvider) {
  return new DynamicStructuredTool({
    name: "get_nearby_context",
    description:
      "Look up notable nearby landmarks, monuments, or historical sites relevant to the location.",
    schema: InputSchema,
    func: async (input) => {
      const results = await search.search({
        query: `notable historical landmarks near ${input.question}`,
        locationContext: input.locationContext,
        maxResults: input.maxResults ?? 5,
      });
      return JSON.stringify({ results });
    },
  });
}
