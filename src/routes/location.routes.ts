import { Router } from "express";
import { ResolveLocationRequestSchema } from "../schemas/request.schemas.js";
import { validateBody } from "../middleware/validate.js";
import { makeLocationController } from "../controllers/location.controller.js";
import type { LocationService } from "../services/location.service.js";

export function createLocationRouter(service: LocationService): Router {
  const router = Router();
  router.post(
    "/location/resolve",
    validateBody(ResolveLocationRequestSchema),
    makeLocationController(service),
  );
  return router;
}
