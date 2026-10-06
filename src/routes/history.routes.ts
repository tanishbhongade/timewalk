import { Router } from "express";
import { HistoryRequestSchema } from "../schemas/request.schemas.js";
import { validateBody } from "../middleware/validate.js";
import { makeHistoryController } from "../controllers/history.controller.js";
import type { HistoryService } from "../services/history.service.js";

export function createHistoryRouter(service: HistoryService): Router {
  const router = Router();
  router.post(
    "/history",
    validateBody(HistoryRequestSchema),
    makeHistoryController(service),
  );
  return router;
}
