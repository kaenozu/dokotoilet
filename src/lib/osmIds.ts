import type { ToiletFacility, ToiletReview } from "../types";

export type OsmElementType = "node" | "way" | "relation";

const TYPED_OSM_ID_RE = /^osm-(node|way|relation)-([0-9]+)$/;
const LEGACY_OSM_ID_RE = /^osm-([0-9]+)$/;

export function isOsmElementType(value: unknown): value is OsmElementType {
  return value === "node" || value === "way" || value === "relation";
}

export function osmFacilityId(type: unknown, id: unknown): string {
  if (!isOsmElementType(type)) throw new Error("invalid OSM element type");
  const numericId = typeof id === "number" ? String(id) : typeof id === "string" ? id : "";
  if (!/^[0-9]+$/.test(numericId)) throw new Error("invalid OSM element id");
  return `osm-${type}-${numericId}`;
}

export function parseTypedOsmFacilityId(id: string): { type: OsmElementType; numericId: string } | null {
  const match = TYPED_OSM_ID_RE.exec(id);
  return match ? { type: match[1] as OsmElementType, numericId: match[2] } : null;
}

export function parseLegacyOsmFacilityId(id: string): { numericId: string } | null {
  const match = LEGACY_OSM_ID_RE.exec(id);
  return match ? { numericId: match[1] } : null;
}

export function legacyOsmIdForTyped(id: string): string | null {
  const parsed = parseTypedOsmFacilityId(id);
  return parsed ? `osm-${parsed.numericId}` : null;
}

export function isTypedOsmAliasUnambiguous(
  facilityId: string,
  knownFacilityIds: Iterable<string>
): boolean {
  const parsed = parseTypedOsmFacilityId(facilityId);
  if (!parsed) return false;
  let matches = 0;
  for (const candidate of knownFacilityIds) {
    const candidateParsed = parseTypedOsmFacilityId(candidate);
    if (candidateParsed?.numericId === parsed.numericId) matches += 1;
  }
  return matches === 1;
}

/**
 * Static seed rows already carry a typed officialOpenDataId. Canonicalize only when that
 * value is valid and refers to the same numeric OSM object as the legacy id.
 */
export function canonicalizeSeedOsmFacility(t: ToiletFacility): ToiletFacility {
  if (t.dataSource !== "osm" || typeof t.officialOpenDataId !== "string") return t;
  const typed = parseTypedOsmFacilityId(t.officialOpenDataId);
  const legacy = parseLegacyOsmFacilityId(t.id);
  if (!typed || !legacy || typed.numericId !== legacy.numericId) return t;
  return { ...t, id: t.officialOpenDataId };
}

export function buildFacilityIdAliases(before: ToiletFacility[], after: ToiletFacility[]): Map<string, string> {
  const aliases = new Map<string, string>();
  for (let i = 0; i < Math.min(before.length, after.length); i += 1) {
    if (before[i]?.id && after[i]?.id && before[i].id !== after[i].id) {
      aliases.set(before[i].id, after[i].id);
    }
  }
  return aliases;
}

export function remapReviewDeltaKeys<T extends { reviewDeltas: Record<string, ToiletReview[]> }>(
  delta: T,
  aliases: ReadonlyMap<string, string>
): T {
  if (aliases.size === 0) return delta;
  const reviewDeltas: Record<string, ToiletReview[]> = {};
  for (const [facilityId, reviews] of Object.entries(delta.reviewDeltas)) {
    const target = aliases.get(facilityId) ?? facilityId;
    const existing = reviewDeltas[target] ?? [];
    const seen = new Set(existing.map((r) => r.id));
    reviewDeltas[target] = [...existing, ...reviews.filter((r) => !seen.has(r.id))];
  }
  return { ...delta, reviewDeltas };
}

/**
 * During the compatibility window, combine exact typed reviews with a legacy osm-N bucket
 * only if the numeric OSM id resolves to exactly one typed facility currently known.
 * This avoids attaching a legacy review to both node N and way N when ids collide.
 */
export function externalReviewsForFacility(
  facilityId: string,
  externalReviews: Record<string, ToiletReview[]>,
  knownFacilityIds: Iterable<string>
): ToiletReview[] | undefined {
  const exact = externalReviews[facilityId] ?? [];
  const legacyId = legacyOsmIdForTyped(facilityId);
  if (!legacyId) return exact.length > 0 ? exact : undefined;
  const legacy = externalReviews[legacyId] ?? [];
  if (legacy.length === 0) return exact.length > 0 ? exact : undefined;
  if (!isTypedOsmAliasUnambiguous(facilityId, knownFacilityIds)) {
    return exact.length > 0 ? exact : undefined;
  }

  const byId = new Map<string, ToiletReview>();
  for (const review of [...exact, ...legacy]) {
    if (!byId.has(review.id)) byId.set(review.id, review);
  }
  return [...byId.values()];
}
