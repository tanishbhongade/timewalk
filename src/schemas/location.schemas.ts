import { z } from "zod";

export const ResolvedLocationSchema = z.object({
  latitude: z.number(),
  longitude: z.number(),
  country: z.string().optional(),
  region: z.string().optional(),
  city: z.string().optional(),
  locality: z.string().optional(),
  district: z.string().optional(),
  postalCode: z.string().optional(),
  landmark: z.string().optional(),
  displayName: z.string().optional(),
  accuracyMeters: z.number().optional(),
});

export type ResolvedLocation = z.infer<typeof ResolvedLocationSchema>;
