import "dotenv/config";
import { z } from "zod";

const EnvSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  PORT: z.coerce.number().int().positive().default(3000),
  LOG_LEVEL: z
    .enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"])
    .default("info"),

  // Bedrock
  AWS_REGION: z.string().min(1),
  AWS_LLM_MODEL: z.string().min(1),
  AWS_BEARER_TOKEN_BEDROCK: z.string().min(1),

  // Web research
  TAVILY_API_KEY: z.string().min(1),

  // Geocoder
  GEOCODER_BASE_URL: z
    .string()
    .url()
    .default("https://nominatim.openstreetmap.org"),
  GEOCODER_USER_AGENT: z
    .string()
    .default("TimeWalk/0.1 (contact: dev@example.com)"),

  // Agent
  AGENT_MAX_TOOL_CALLS: z.coerce.number().int().positive().default(6),
  REQUEST_TIMEOUT_MS: z.coerce.number().int().positive().default(45000),
  TOOL_TIMEOUT_MS: z.coerce.number().int().positive().default(12000),
  CACHE_TTL_SECONDS: z.coerce.number().int().nonnegative().default(900),

  // JWT
  JWT_SECRET: z.string().min(32, "JWT_SECRET must be at least 32 characters"),
  JWT_ACCESS_TTL_SECONDS: z.coerce.number().int().positive().default(3600),
  JWT_REFRESH_TTL_SECONDS: z.coerce.number().int().positive().default(2592000),

  // Rate limiting
  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(60000),
  RATE_LIMIT_IP_MAX: z.coerce.number().int().positive().default(120),
  RATE_LIMIT_DEVICE_RESOLVE_MAX: z.coerce.number().int().positive().default(60),
  RATE_LIMIT_DEVICE_HISTORY_MAX: z.coerce.number().int().positive().default(20),
  AUTH_RATE_LIMIT_PER_HOUR: z.coerce.number().int().positive().default(10),
});

export type Env = z.infer<typeof EnvSchema>;

let cached: Env | null = null;

export function loadEnv(): Env {
  if (cached) return cached;
  const parsed = EnvSchema.safeParse(process.env);
  if (!parsed.success) {
    // eslint-disable-next-line no-console
    console.error(
      "Invalid environment configuration:",
      parsed.error.flatten().fieldErrors,
    );
    throw new Error("Invalid environment configuration");
  }
  cached = parsed.data;
  return cached;
}
