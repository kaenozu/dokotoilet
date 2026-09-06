import crypto from "node:crypto";
import type { CommunityDB } from "./community";

function stableObject(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableObject);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => [k, stableObject(v)])
    );
  }
  return value;
}

export function normalizeCommunitySnapshot(db: CommunityDB): CommunityDB {
  const toilets = db.toilets
    .map((toilet) => ({
      ...toilet,
      reviews: [...(toilet.reviews ?? [])].sort((a, b) => a.id.localeCompare(b.id)),
    }))
    .sort((a, b) => a.id.localeCompare(b.id));

  const externalReviews = Object.fromEntries(
    Object.entries(db.externalReviews ?? {})
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([facilityId, reviews]) => [
        facilityId,
        [...reviews].sort((a, b) => a.id.localeCompare(b.id)),
      ])
  );

  const helpfulVotes = Object.fromEntries(
    Object.entries(db.helpfulVotes ?? {})
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([reviewId, voters]) => [reviewId, [...voters].sort()])
  );

  const reports = [...(db.reports ?? [])].sort((a, b) => a.id.localeCompare(b.id));
  const reviewKeys = Object.fromEntries(
    Object.entries(db.reviewKeys ?? {}).sort(([a], [b]) => a.localeCompare(b))
  );

  return {
    version: 2,
    toilets,
    helpfulVotes,
    reports,
    reviewKeys,
    externalReviews,
  };
}

export function communitySemanticDigest(db: CommunityDB): string {
  return crypto
    .createHash("sha256")
    .update(JSON.stringify(stableObject(normalizeCommunitySnapshot(db))))
    .digest("hex");
}
