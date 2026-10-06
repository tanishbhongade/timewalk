import rateLimit from "express-rate-limit";
import { loadEnv } from "../config/env.js";

export function createIpRateLimiter() {
  const env = loadEnv();
  return rateLimit({
    windowMs: env.RATE_LIMIT_WINDOW_MS,
    max: env.RATE_LIMIT_IP_MAX,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res) => {
      res.status(429).json({
        error: {
          code: "RATE_LIMITED",
          message: "Too many requests from this network",
        },
        requestId: req.id,
      });
    },
  });
}

export type DeviceBucket = "history" | "resolve";

export function createDeviceRateLimiter(bucket: DeviceBucket) {
  const env = loadEnv();
  const max =
    bucket === "history"
      ? env.RATE_LIMIT_DEVICE_HISTORY_MAX
      : env.RATE_LIMIT_DEVICE_RESOLVE_MAX;

  return rateLimit({
    windowMs: env.RATE_LIMIT_WINDOW_MS,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => `${bucket}:${req.deviceId ?? req.ip ?? "unknown"}`,
    handler: (req, res) => {
      res.status(429).json({
        error: {
          code: "RATE_LIMITED",
          message: "Too many requests from this device",
        },
        requestId: req.id,
      });
    },
  });
}
