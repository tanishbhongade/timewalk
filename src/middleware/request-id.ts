import { randomUUID } from "node:crypto";
import type { Request, Response, NextFunction } from "express";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      id: string;
    }
  }
}

export function requestId(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const incoming = req.header("x-request-id");
  req.id =
    incoming && incoming.length <= 128 && /^[\w\-:.]+$/.test(incoming)
      ? incoming
      : `req_${randomUUID()}`;
  res.setHeader("x-request-id", req.id);
  next();
}
