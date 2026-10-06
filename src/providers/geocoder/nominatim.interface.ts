import type { Geocoder, GeocoderInput } from "./geocoder.interface.js";
import type { ResolvedLocation } from "../../schemas/location.schemas.js";
import { UpstreamError } from "../../utils/errors.js";
import { withTimeout } from "../../utils/timeout.js";
import { loadEnv } from "../../config/env.js";

interface NominatimAddress {
  country?: string;
  state?: string;
  region?: string;
  county?: string;
  city?: string;
  town?: string;
  village?: string;
  suburb?: string;
  neighbourhood?: string;
  city_district?: string;
  district?: string;
  postcode?: string;
  road?: string;
  [k: string]: string | undefined;
}

interface NominatimResponse {
  display_name?: string;
  address?: NominatimAddress;
  name?: string;
  error?: string;
}

export class NominatimGeocoder implements Geocoder {
  constructor(
    private readonly baseUrl: string,
    private readonly userAgent: string,
    private readonly timeoutMs: number,
  ) {}

  async reverseGeocode(input: GeocoderInput): Promise<ResolvedLocation> {
    const url = new URL("/reverse", this.baseUrl);
    url.searchParams.set("lat", String(input.latitude));
    url.searchParams.set("lon", String(input.longitude));
    url.searchParams.set("format", "jsonv2");
    url.searchParams.set("addressdetails", "1");
    url.searchParams.set("zoom", "18");

    const res = await withTimeout(
      fetch(url, {
        headers: {
          "User-Agent": this.userAgent,
          Accept: "application/json",
        },
      }),
      this.timeoutMs,
      "nominatim.reverse",
    );

    if (!res.ok) {
      throw new UpstreamError(
        "GEOCODER_HTTP_ERROR",
        `Geocoder responded with ${res.status}`,
      );
    }

    const data = (await res.json()) as NominatimResponse;
    if (data.error) {
      throw new UpstreamError("GEOCODER_ERROR", data.error);
    }

    const addr = data.address ?? {};
    const city = addr.city ?? addr.town ?? addr.village ?? addr.city_district;
    const locality = addr.suburb ?? addr.neighbourhood ?? addr.city_district;
    const landmark = addr.road
      ? [addr.road, addr.suburb].filter(Boolean).join(", ")
      : undefined;

    return {
      latitude: input.latitude,
      longitude: input.longitude,
      country: addr.country,
      region: addr.state ?? addr.region,
      city,
      locality,
      district: addr.district ?? addr.county,
      postalCode: addr.postcode,
      landmark,
      displayName: data.display_name,
      accuracyMeters: input.accuracyMeters,
    };
  }
}

export function createGeocoder(): Geocoder {
  const env = loadEnv();
  return new NominatimGeocoder(
    env.GEOCODER_BASE_URL,
    env.GEOCODER_USER_AGENT,
    env.TOOL_TIMEOUT_MS,
  );
}
