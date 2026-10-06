import type { RequestHandler } from "express";
import type { HistoryRequest } from "../schemas/request.schemas.js";
import type { HistoryService } from "../services/history.service.js";
import { toClientResponse } from "../services/response-shaper.js";

export function makeHistoryController(service: HistoryService): RequestHandler {
  return async (req, res, next) => {
    try {
      const body = req.body as HistoryRequest;
      const out = await service.run(body, req.id);
      res.json(toClientResponse(req.id, out.location, out.result));
    } catch (err) {
      next(err);
    }
  };
}
