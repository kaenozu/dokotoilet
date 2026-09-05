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
