import type { ResolvedLocation } from "../../schemas/location.schemas.js";

export interface GeocoderInput {
  latitude: number;
  longitude: number;
  accuracyMeters?: number;
}

export interface Geocoder {
  reverseGeocode(input: GeocoderInput): Promise<ResolvedLocation>;
}
