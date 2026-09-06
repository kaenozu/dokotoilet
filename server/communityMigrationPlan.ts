import crypto from "node:crypto";
import type { ToiletReview } from "../src/types";
import type { CommunityDB, ReviewKey } from "./community";
import { assertCommunitySnapshotValid, communitySnapshotDigest } from "./communitySnapshot";

export interface PlannedDocument {
  collection: string;
  id: string;
  data: Record<string, unknown>;
}

export interface FirestoreMigrationPlan {
  sourceDigest: string;
  documents: PlannedDocument[];
  countsByCollection: Record<string, number>;
}

function sha(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function aggregate(reviews: ToiletReview[]) {
  return {
    reviewCount: reviews.length,
    overallSum: reviews.reduce((s, r) => s + Number(r.overallScore ?? r.rating ?? 0), 0),
    cleanlinessSum: reviews.reduce((s, r) => s + Number(r.cleanlinessScore ?? 0), 0),
    odorSum: reviews.reduce((s, r) => s + Number(r.odorScore ?? 0), 0),
    suppliesSum: reviews.reduce((s, r) => s + Number(r.suppliesScore ?? 0), 0),
  };
}

function reviewDoc(facilityId: string, kind: "community" | "external", review: ToiletReview) {
  return {
    collection: "reviews",
    id: review.id,
    data: { ...review, facilityId, facilityKind: kind },
  } satisfies PlannedDocument;
}

function dedupDoc(
  facilityId: string,
  review: ToiletReview,
  key: ReviewKey | undefined
): PlannedDocument | null {
  if (!key) return null;
  const id = sha(`${facilityId}|${key.ipHash}|${review.comment}`);
  return {
    collection: "review_dedup",
    id,
    data: {
      facilityId,
      ipHash: key.ipHash,
      reviewId: review.id,
      commentHash: sha(review.comment),
      createdAt: new Date(key.at).toISOString(),
      validUntil: key.at + 24 * 60 * 60 * 1000,
    },
  };
}

export function buildFirestoreMigrationPlan(db: CommunityDB): FirestoreMigrationPlan {
  assertCommunitySnapshotValid(db);
  const documents: PlannedDocument[] = [];

  for (const toilet of db.toilets) {
    const { reviews, ...facility } = toilet;
    documents.push({
      collection: "community_toilets",
      id: toilet.id,
      data: { ...facility, reviewCount: reviews.length },
    });
    documents.push({
      collection: "facility_aggregates",
      id: toilet.id,
      data: aggregate(reviews),
    });
    for (const review of reviews) {
      documents.push(reviewDoc(toilet.id, "community", review));
      const dedup = dedupDoc(toilet.id, review, db.reviewKeys[review.id]);
      if (dedup) documents.push(dedup);
    }
  }

  for (const [facilityId, reviews] of Object.entries(db.externalReviews)) {
    documents.push({
      collection: "external_facilities",
      id: facilityId,
      data: {
        id: facilityId,
        source: facilityId.startsWith("osm-")
          ? "osm"
          : facilityId.startsWith("google-")
          ? "google"
          : "od",
        origin: "migration",
        firstSeenAt: "migration",
      },
    });
    documents.push({
      collection: "facility_aggregates",
      id: facilityId,
      data: aggregate(reviews),
    });
    for (const review of reviews) {
      documents.push(reviewDoc(facilityId, "external", review));
      const dedup = dedupDoc(facilityId, review, db.reviewKeys[review.id]);
      if (dedup) documents.push(dedup);
    }
  }

  for (const [reviewId, voters] of Object.entries(db.helpfulVotes)) {
    for (const ipHash of voters) {
      documents.push({
        collection: "helpful_votes",
        id: sha(`${reviewId}|${ipHash}`),
        data: { reviewId, ipHash, createdAt: "migration" },
      });
    }
  }

  for (const report of db.reports) {
    documents.push({
      collection: "reports",
      id: report.id,
      data: {
        id: report.id,
        facilityId: report.toiletId,
        toiletId: report.toiletId,
        reviewId: report.reviewId,
        reason: report.reason,
        createdAt: report.createdAt,
      },
    });
  }

  documents.sort((a, b) =>
    `${a.collection}/${a.id}`.localeCompare(`${b.collection}/${b.id}`)
  );

  const countsByCollection: Record<string, number> = {};
  for (const doc of documents) {
    countsByCollection[doc.collection] = (countsByCollection[doc.collection] ?? 0) + 1;
  }

  return {
    sourceDigest: communitySnapshotDigest(db),
    documents,
    countsByCollection,
  };
}

export function migrationPlanDigest(plan: FirestoreMigrationPlan): string {
  return sha(JSON.stringify(plan.documents));
}
