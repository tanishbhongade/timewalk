import type { ErrorRequestHandler, RequestHandler } from "express";
import { ZodError } from "zod";
import { AppError } from "../utils/errors.js";
import { logger } from "../utils/logger.js";

export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  const requestId = req.id ?? "unknown";

  if (err instanceof AppError) {
    logger.warn(
      { requestId, code: err.code, status: err.statusCode },
      err.message,
    );
    res.status(err.statusCode).json({
      error: { code: err.code, message: err.message, details: err.details },
      requestId,
    });
    return;
  }

  if (err instanceof ZodError) {
    res.status(502).json({
      error: {
        code: "MODEL_OUTPUT_INVALID",
        message: "Model output failed validation",
        details: err.flatten(),
      },
      requestId,
    });
    return;
  }

  const anyErr = err as {
    statusCode?: number;
    code?: string;
    message?: string;
    details?: unknown;
  };

  if (anyErr?.statusCode) {
    res.status(anyErr.statusCode).json({
      error: {
        code: anyErr.code ?? "ERROR",
        message: anyErr.message ?? "Error",
        details: anyErr.details,
      },
      requestId,
    });
    return;
  }

  // // last-resort branch
  // console.error("=== UNHANDLED ERROR ===");
  // console.error("requestId:", requestId);
  // console.error("name:", (err as Error)?.name);
  // console.error("message:", (err as Error)?.message);
  // console.error("stack:", (err as Error)?.stack);
  // console.error("cause:", (err as Error)?.cause);
  // console.error("full:", err);
  // console.error("=======================");

  logger.error({ requestId, err }, "unhandled error");
  res.status(500).json({
    error: { code: "INTERNAL_ERROR", message: "Internal server error" },
    requestId,
  });
};

export const notFoundHandler: RequestHandler = (req, res) => {
  res.status(404).json({
    error: {
      code: "NOT_FOUND",
      message: `Route ${req.method} ${req.path} not found`,
    },
    requestId: req.id,
  });
};
