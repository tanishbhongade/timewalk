import { Router } from "express";
import rateLimit from "express-rate-limit";
import { validateBody } from "../middleware/validate.js";
import {
  AnonymousAuthRequestSchema,
  LogoutRequestSchema,
  RefreshRequestSchema,
} from "../schemas/auth.schemas.js";
import {
  anonymousAuth,
  logoutAuth,
  refreshAuth,
} from "../controllers/auth.controller.js";
import { loadEnv } from "../config/env.js";

export function createAuthRouter(): Router {
  const env = loadEnv();
  const router = Router();

  // Tighter IP limit on auth endpoints — they're the entry point.
  const authLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: env.AUTH_RATE_LIMIT_PER_HOUR,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res) => {
      res.status(429).json({
        error: {
          code: "RATE_LIMITED",
          message: "Too many authentication attempts from this network",
        },
        requestId: req.id,
      });
    },
  });

  router.post(
    "/anonymous",
    authLimiter,
    validateBody(AnonymousAuthRequestSchema),
    anonymousAuth,
  );

  router.post(
    "/refresh",
    authLimiter,
    validateBody(RefreshRequestSchema),
    refreshAuth,
  );

  router.post("/logout", validateBody(LogoutRequestSchema), logoutAuth);

  return router;
}
