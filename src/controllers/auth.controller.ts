import type { RequestHandler } from "express";
import { AuthError, getAuthService } from "../services/auth.service.js";
import type {
  AnonymousAuthRequest,
  LogoutRequest,
  RefreshRequest,
} from "../schemas/auth.schemas.js";
import { logger } from "../utils/logger.js";

export const anonymousAuth: RequestHandler = async (req, res, next) => {
  try {
    const { deviceId } = req.body as AnonymousAuthRequest;
    const pair = await getAuthService().issueAnonymous(deviceId);
    logger.info({ requestId: req.id, deviceId }, "issued anonymous token pair");
    res.json(pair);
  } catch (err) {
    next(err);
  }
};

export const refreshAuth: RequestHandler = async (req, res, next) => {
  try {
    const { refreshToken } = req.body as RefreshRequest;
    const pair = await getAuthService().rotate(refreshToken);
    res.json(pair);
  } catch (err) {
    if (err instanceof AuthError) {
      res.status(401).json({
        error: { code: err.code, message: err.message },
        requestId: req.id,
      });
      return;
    }
    next(err);
  }
};

export const logoutAuth: RequestHandler = async (req, res, next) => {
  try {
    const { refreshToken } = req.body as LogoutRequest;
    await getAuthService().revoke(refreshToken);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
};
