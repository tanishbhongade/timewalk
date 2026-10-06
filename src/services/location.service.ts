import type { Geocoder } from "../providers/geocoder/geocoder.interface.js";
import type { ResolvedLocation } from "../schemas/location.schemas.js";
import { logger } from "../utils/logger.js";
import { withRetry } from "../utils/retry.js";
import { roundCoord } from "../utils/geo.js";

export class LocationService {
  constructor(private readonly geocoder: Geocoder) {}

  async resolve(
    latitude: number,
    longitude: number,
    accuracyMeters?: number,
  ): Promise<ResolvedLocation> {
    try {
      return await withRetry(
        () =>
          this.geocoder.reverseGeocode({ latitude, longitude, accuracyMeters }),
        { retries: 1, label: "geocoder.reverse" },
      );
    } catch (err) {
      logger.warn(
        {
          err: (err as Error).message,
          lat: roundCoord(latitude),
          lng: roundCoord(longitude),
        },
        "geocoding failed; continuing with raw coordinates",
      );
      return { latitude, longitude, accuracyMeters };
    }
  }
}
