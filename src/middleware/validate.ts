import type { RequestHandler } from "express";
import type { ZodTypeAny } from "zod";

export function validateBody<T extends ZodTypeAny>(schema: T): RequestHandler {
  return (req, _res, next) => {
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return next(
        Object.assign(new Error("Invalid request body"), {
          statusCode: 400,
          code: "VALIDATION_ERROR",
          details: parsed.error.flatten(),
        }),
      );
    }
    req.body = parsed.data;
    next();
  };
}
