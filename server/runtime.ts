import crypto from "node:crypto";

export function resolveCommunitySalt(
  nodeEnv: string | undefined,
  configured: string | undefined
): string {
  const trimmed = configured?.trim();
  if (trimmed) return trimmed;
  if (nodeEnv === "production") {
    throw new Error("COMMUNITY_SALT is required in production");
  }
  return crypto.randomUUID();
}

export function osmCacheKey(lat: number, lng: number, radius: number): string {
  return `${lat.toFixed(4)}_${lng.toFixed(4)}_${radius}`;
}

/** Great-circle distance used to keep fallback seed results inside the requested radius. */
export function distanceMeters(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const toRad = (degrees: number) => (degrees * Math.PI) / 180;
  const earthRadiusMeters = 6_371_000;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return earthRadiusMeters * c;
}

export function isWithinRadius(
  centerLat: number,
  centerLng: number,
  itemLat: number,
  itemLng: number,
  radiusMeters: number
): boolean {
  return distanceMeters(centerLat, centerLng, itemLat, itemLng) <= radiusMeters;
}
