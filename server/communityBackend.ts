export type CommunityBackend = "json" | "firestore";

export function resolveCommunityBackend(
  value: string | undefined,
  nodeEnv: string | undefined
): CommunityBackend {
  const normalized = value?.trim().toLowerCase();
  if (!normalized) {
    if (nodeEnv === "production") {
      throw new Error("COMMUNITY_BACKEND must be explicitly set in production");
    }
    return "json";
  }
  if (normalized === "json" || normalized === "firestore") return normalized;
  throw new Error(`unsupported COMMUNITY_BACKEND: ${value}`);
}
