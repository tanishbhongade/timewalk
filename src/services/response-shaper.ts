import type { HistoryResult } from "../schemas/response.schemas.js";
import type { ResolvedLocation } from "../schemas/location.schemas.js";

const MAX_SOURCES = 5;
const MAX_NEARBY = 5;
const MAX_SECTIONS = 5;

export function toClientResponse(
  requestId: string,
  location: ResolvedLocation,
  result: HistoryResult,
) {
  // Prefer the neighborhood/city label over a long display name.
  const shortDisplay =
    location.city && location.locality
      ? `${location.locality}, ${location.city}`
      : location.displayName;

  // Only keep sources the model actually cited in a story.
  const citedIds = new Set(
    result.stories.flatMap((s) => s.claims.flatMap((c) => c.sourceIds)),
  );
  const sources = result.sources
    .filter((s) => citedIds.has(s.id))
    .slice(0, MAX_SOURCES)
    .map((s) => ({ title: s.title, url: s.url }));

  // Drop sources that had zero claims after scrub.
  const sections = result.stories.slice(0, MAX_SECTIONS).map((s) => ({
    heading: s.heading,
    body: s.narration,
    whyHere: s.relevance,
    confidence: s.confidence,
  }));

  const nearby = result.nearbyPlaces.slice(0, MAX_NEARBY).map((p) => ({
    name: p.name,
    whyGo: p.reasonRelevant,
    distanceMeters: p.distanceMeters,
  }));

  return {
    requestId,
    location: {
      locality: location.locality,
      city: location.city,
      region: location.region,
      country: location.country,
      coordinates: {
        latitude: location.latitude,
        longitude: location.longitude,
      },
      displayName: shortDisplay,
    },
    story: {
      title: result.title,
      summary: result.summary,
      sections,
      nearby,
      sources,
      uncertainty: result.caveats,
    },
  };
}
