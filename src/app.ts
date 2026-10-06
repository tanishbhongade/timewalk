import express, { type Express } from "express";
import cors from "cors";
import helmet from "helmet";
import { requestId } from "./middleware/request-id.js";
import { errorHandler, notFoundHandler } from "./middleware/error-handler.js";
import { createIpRateLimiter } from "./middleware/rate-limit.js";
import { requireAuth } from "./middleware/auth.js";
import { createApiRouter } from "./routes/index.js";
import { createAuthRouter } from "./routes/auth.routes.js";
import { healthRouter } from "./routes/health.routes.js";
import { createGeocoder } from "./providers/geocoder/nominatim.interface.js";
import { LocationService } from "./services/location.service.js";
import { HistoryService } from "./services/history.service.js";
import { getCache } from "./services/cache.service.js";
import { loadEnv } from "./config/env.js";
import { logger } from "./utils/logger.js";

export interface AppDeps {
  historyService?: HistoryService;
  locationService?: LocationService;
}

export function createApp(deps: AppDeps = {}): Express {
  loadEnv();
  const app = express();

  app.disable("x-powered-by");
  app.use(helmet());
  app.use(cors());
  app.use(express.json({ limit: "64kb" }));
  app.use(requestId);

  app.use((req, res, next) => {
    const start = Date.now();
    res.on("finish", () => {
      logger.info(
        {
          requestId: req.id,
          method: req.method,
          path: req.path,
          status: res.statusCode,
          ms: Date.now() - start,
        },
        "http",
      );
    });
    next();
  });

  const locationService =
    deps.locationService ?? new LocationService(createGeocoder());
  const historyService =
    deps.historyService ??
    new HistoryService({ locationService, cache: getCache() });

  app.use(healthRouter);

  // Auth endpoints — IP rate limited, no bearer required.
  app.use("/auth", createAuthRouter());

  // Authenticated API — bearer required.
  app.use(
    "/api/v1",
    createIpRateLimiter(),
    requireAuth(),
    createApiRouter({ history: historyService, location: locationService }),
  );

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
