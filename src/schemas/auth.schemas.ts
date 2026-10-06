import { z } from "zod";

const DeviceIdSchema = z
  .string()
  .min(8)
  .max(128)
  .regex(
    /^[a-zA-Z0-9_-]+$/,
    "Device ID must be alphanumeric, dash, or underscore",
  );

export const AnonymousAuthRequestSchema = z.object({
  deviceId: DeviceIdSchema,
});
export type AnonymousAuthRequest = z.infer<typeof AnonymousAuthRequestSchema>;

export const RefreshRequestSchema = z.object({
  refreshToken: z.string().min(20).max(500),
});
export type RefreshRequest = z.infer<typeof RefreshRequestSchema>;

export const LogoutRequestSchema = z.object({
  refreshToken: z.string().min(20).max(500),
});
export type LogoutRequest = z.infer<typeof LogoutRequestSchema>;

export const TokenPairResponseSchema = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
  expiresIn: z.number().int().positive(),
});
