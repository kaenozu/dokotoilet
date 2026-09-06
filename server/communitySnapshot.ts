import crypto from "node:crypto";
import type { CommunityDB } from "./community";

export interface CommunitySnapshotCounts {
  toilets: number;
  communityReviews: number;
  externalFacilities: number;
  externalReviews: number;
  helpfulVoteReviews: number;
  helpfulVotes: number;
  reports: number;
  reviewKeys: number;
}

export interface CommunitySnapshotAnalysis {
  counts: CommunitySnapshotCounts;
  digest: string;
  errors: string[];
}

function stable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => [k, stable(v)])
    );
  }
  return value;
}

export function communitySnapshotDigest(db: CommunityDB): string {
  return crypto
    .createHash("sha256")
    .update(JSON.stringify(stable(db)))
    .digest("hex");
}

export function analyzeCommunitySnapshot(db: CommunityDB): CommunitySnapshotAnalysis {
  const errors: string[] = [];
  if (db.version !== 2) errors.push(`unsupported version: ${String(db.version)}`);

  const facilityIds = new Set<string>();
  const reviewFacility = new Map<string, string>();
  const reviewHelpfulCount = new Map<string, number>();
  let communityReviews = 0;

  for (const toilet of db.toilets) {
    if (facilityIds.has(toilet.id)) errors.push(`duplicate facility id: ${toilet.id}`);
    facilityIds.add(toilet.id);
    for (const review of toilet.reviews ?? []) {
      communityReviews += 1;
      if (reviewFacility.has(review.id)) errors.push(`duplicate review id: ${review.id}`);
      reviewFacility.set(review.id, toilet.id);
      reviewHelpfulCount.set(review.id, Number(review.helpfulCount ?? 0));
    }
  }

  let externalReviews = 0;
  for (const [facilityId, reviews] of Object.entries(db.externalReviews ?? {})) {
    for (const review of reviews ?? []) {
      externalReviews += 1;
      if (reviewFacility.has(review.id)) errors.push(`duplicate review id: ${review.id}`);
      reviewFacility.set(review.id, facilityId);
      reviewHelpfulCount.set(review.id, Number(review.helpfulCount ?? 0));
    }
  }

  let helpfulVotes = 0;
  for (const [reviewId, voters] of Object.entries(db.helpfulVotes ?? {})) {
    if (!reviewFacility.has(reviewId)) {
      errors.push(`helpful vote references missing review: ${reviewId}`);
      helpfulVotes += Array.isArray(voters) ? voters.length : 0;
      continue;
    }
    const voteCount = Array.isArray(voters) ? voters.length : 0;
    helpfulVotes += voteCount;
    const storedCount = reviewHelpfulCount.get(reviewId) ?? 0;
    if (storedCount !== voteCount) {
      errors.push(
        `helpful count mismatch for ${reviewId}: review=${storedCount} votes=${voteCount}`
      );
    }
  }

  for (const [reviewId, storedCount] of reviewHelpfulCount) {
    if (storedCount > 0 && !(reviewId in (db.helpfulVotes ?? {}))) {
      errors.push(
        `helpful count mismatch for ${reviewId}: review=${storedCount} votes=0`
      );
    }
  }

  for (const report of db.reports ?? []) {
    const actualFacility = reviewFacility.get(report.reviewId);
    if (!actualFacility) {
      errors.push(`report ${report.id} references missing review: ${report.reviewId}`);
    } else if (actualFacility !== report.toiletId) {
      errors.push(
        `report ${report.id} facility mismatch: ${report.toiletId} != ${actualFacility}`
      );
    }
  }

  for (const reviewId of Object.keys(db.reviewKeys ?? {})) {
    if (!reviewFacility.has(reviewId)) errors.push(`review key references missing review: ${reviewId}`);
  }

  return {
    counts: {
      toilets: db.toilets.length,
      communityReviews,
      externalFacilities: Object.keys(db.externalReviews ?? {}).length,
      externalReviews,
      helpfulVoteReviews: Object.keys(db.helpfulVotes ?? {}).length,
      helpfulVotes,
      reports: db.reports?.length ?? 0,
      reviewKeys: Object.keys(db.reviewKeys ?? {}).length,
    },
    digest: communitySnapshotDigest(db),
    errors,
  };
}

export function assertCommunitySnapshotValid(db: CommunityDB): CommunitySnapshotAnalysis {
  const analysis = analyzeCommunitySnapshot(db);
  if (analysis.errors.length > 0) {
    throw new Error(`invalid community snapshot:\n${analysis.errors.join("\n")}`);
  }
  return analysis;
}
