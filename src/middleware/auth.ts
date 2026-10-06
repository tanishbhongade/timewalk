import type { RequestHandler } from "express";
import { AuthError, getAuthService } from "../services/auth.service.js";
import { logger } from "../utils/logger.js";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      deviceId?: string;
    }
  }
}

export function requireAuth(): RequestHandler {
  const auth = getAuthService();

  return async (req, res, next) => {
    const header = req.header("authorization");
    if (!header || !header.toLowerCase().startsWith("bearer ")) {
      res.status(401).json({
        error: {
          code: "UNAUTHORIZED",
          message: "Missing or malformed Authorization header",
        },
        requestId: req.id,
      });
      return;
    }

    const token = header.slice(7).trim();
    try {
      const deviceId = await auth.verifyAccessToken(token);
      req.deviceId = deviceId;
      next();
    } catch (err) {
      if (err instanceof AuthError) {
        res.status(401).json({
          error: { code: err.code, message: err.message },
          requestId: req.id,
        });
        return;
      }
      logger.warn(
        { requestId: req.id, err: (err as Error).message },
        "access token verification failed",
      );
      res.status(401).json({
        error: {
          code: "INVALID_TOKEN",
          message: "Access token is invalid or expired",
        },
        requestId: req.id,
      });
    }
  };
}
