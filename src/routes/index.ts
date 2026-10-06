import { Router } from "express";
import type { HistoryService } from "../services/history.service.js";
import type { LocationService } from "../services/location.service.js";
import { createHistoryRouter } from "./history.routes.js";
import { createLocationRouter } from "./location.routes.js";

export function createApiRouter(deps: {
  history: HistoryService;
  location: LocationService;
}): Router {
  const router = Router();
  router.use(createHistoryRouter(deps.history));
  router.use(createLocationRouter(deps.location));
  return router;
}
