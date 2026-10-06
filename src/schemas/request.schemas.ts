import { z } from "zod";

export const HistoryRequestSchema = z.object({
  location: z.object({
    latitude: z.number().gte(-90).lte(90),
    longitude: z.number().gte(-180).lte(180),
    accuracyMeters: z.number().positive().max(100_000).optional(),
  }),
  question: z.string().min(1).max(500),
  period: z
    .object({
      fromYear: z.number().int().gte(-10_000).lte(3_000).optional(),
      toYear: z.number().int().gte(-10_000).lte(3_000).optional(),
    })
    .refine(
      (p) => p.fromYear == null || p.toYear == null || p.fromYear <= p.toYear,
      { message: "fromYear must be less than or equal to toYear" },
    )
    .optional(),
  language: z.string().min(2).max(10).optional(),
});

export type HistoryRequest = z.infer<typeof HistoryRequestSchema>;

export const ResolveLocationRequestSchema = z.object({
  latitude: z.number().gte(-90).lte(90),
  longitude: z.number().gte(-180).lte(180),
  accuracyMeters: z.number().positive().max(100_000).optional(),
});

export type ResolveLocationRequest = z.infer<
  typeof ResolveLocationRequestSchema
>;
