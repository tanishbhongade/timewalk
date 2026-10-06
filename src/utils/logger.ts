import pino from "pino";
import { loadEnv } from "../config/env.js";

const env = loadEnv();

export const logger = pino({
  level: env.LOG_LEVEL,
  redact: {
    paths: [
      "req.headers.authorization",
      "req.headers.cookie",
      "*.apiKey",
      "*.LLM_API_KEY",
      "*.TAVILY_API_KEY",
      "location.latitude",
      "location.longitude",
    ],
    remove: true,
  },
});
