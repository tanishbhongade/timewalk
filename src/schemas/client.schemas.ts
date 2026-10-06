import { z } from "zod";

export const ClientStorySchema = z.object({
  title: z.string(),
  summary: z.string(),
  sections: z.array(
    z.object({
      heading: z.string(),
      body: z.string(),
      whyHere: z.string(),
      confidence: z.enum(["high", "medium", "low"]).optional(),
    }),
  ),
  nearby: z.array(
    z.object({
      name: z.string(),
      whyGo: z.string(),
      distanceMeters: z.number().optional(),
    }),
  ),
  sources: z.array(
    z.object({
      title: z.string(),
      url: z.string().url(),
    }),
  ),
  uncertainty: z.array(z.string()),
});

export const ClientResponseSchema = z.object({
  requestId: z.string(),
  location: z.object({
    locality: z.string().optional(),
    city: z.string().optional(),
    region: z.string().optional(),
    country: z.string().optional(),
    coordinates: z.object({
      latitude: z.number(),
      longitude: z.number(),
    }),
    displayName: z.string().optional(),
  }),
  story: ClientStorySchema,
});
