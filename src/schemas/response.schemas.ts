import { z } from "zod";
import { ResolvedLocationSchema } from "./location.schemas.js";

export const ConfidenceSchema = z.enum(["high", "medium", "low"]);

export const ClaimSchema = z.object({
  claim: z.string().min(1),
  sourceIds: z.array(z.string()).default([]),
});

export const StorySchema = z.object({
  heading: z.string().min(1),
  narration: z.string().min(1),
  relevance: z.string().min(1),
  confidence: ConfidenceSchema,
  claims: z.array(ClaimSchema).default([]),
});

export const NearbyPlaceSchema = z.object({
  name: z.string().min(1),
  reasonRelevant: z.string().min(1),
  distanceMeters: z.number().nonnegative().optional(),
});

export const SourceSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  url: z.string().url(),
  publisher: z.string().optional(),
  publishedAt: z.string().optional(),
});

export const HistoryResultSchema = z.object({
  title: z.string().min(1),
  summary: z.string().min(1),
  timeRange: z.object({
    fromYear: z.number().int().optional(),
    toYear: z.number().int().optional(),
    label: z.string().min(1),
  }),
  stories: z.array(StorySchema).min(1),
  nearbyPlaces: z.array(NearbyPlaceSchema).default([]),
  sources: z.array(SourceSchema).default([]),
  caveats: z.array(z.string()).default([]),
});

export type HistoryResult = z.infer<typeof HistoryResultSchema>;

export const HistoryResponseEnvelopeSchema = z.object({
  requestId: z.string(),
  runId: z.string(),
  location: ResolvedLocationSchema,
  result: HistoryResultSchema,
  meta: z
    .object({
      toolCallCount: z.number().int().nonnegative(),
      cached: z.boolean(),
    })
    .optional(),
});

export const LlmSourceSchema = SourceSchema.extend({
  id: z.string().optional(),
});

export const LlmHistoryResultSchema = HistoryResultSchema.extend({
  sources: z.array(LlmSourceSchema).default([]),
});
