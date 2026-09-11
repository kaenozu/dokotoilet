import crypto from "node:crypto";
import type { ToiletReview } from "../src/types";
import type { CommunityDB, ReviewKey } from "./community";
import { assertCommunitySnapshotValid, communitySnapshotDigest } from "./communitySnapshot";
import { dedupCommentHash, reviewDedupId } from "./shared/dedup";

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
  // キーはレビュー本文の「正規形」（trim + 空白圧縮 + 小文字化）から導出する。
  // Firestore 本番経路（FirestoreCommunityStore）と同一式。docs 参照。
  return {
    collection: "review_dedup",
    id: reviewDedupId(facilityId, key.ipHash, review.comment),
    data: {
      facilityId,
      ipHash: key.ipHash,
      reviewId: review.id,
      commentHash: dedupCommentHash(review.comment),
      createdAt: new Date(key.at).toISOString(),
      validUntil: key.at + 24 * 60 * 60 * 1000,
    },
  };
}

export function buildFirestoreMigrationPlan(db: CommunityDB): FirestoreMigrationPlan {
  assertCommunitySnapshotValid(db);
  let documents: PlannedDocument[] = [];

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

  // 正規形コメントが同一の旧レビュー（正規化導入以前の大文字小文字・空白違い）は
  // 同じ review_dedup ドキュメント ID に衝突する。1つに畳み、validUntil が最も新しい
  // ものを残す（ガード窓が最も長くなる。commentHash は同一正規形から導出されるため一致）。
  // 残らなかった側の reviewId は dedup ドキュメントを持たないが、ガードの性質上
  // 「同一正規形の新しい投稿」で兼用されるため 24h 重複防止は維持される。
  const dedupById = new Map<string, PlannedDocument>();
  for (const doc of documents) {
    if (doc.collection !== "review_dedup") continue;
    const prev = dedupById.get(doc.id);
    if (!prev) {
      dedupById.set(doc.id, doc);
      continue;
    }
    const prevUntil = Number((prev.data as { validUntil?: unknown }).validUntil ?? 0);
    const nextUntil = Number((doc.data as { validUntil?: unknown }).validUntil ?? 0);
    if (nextUntil > prevUntil) dedupById.set(doc.id, doc);
  }
  documents = documents.filter(
    (doc) => doc.collection !== "review_dedup" || dedupById.get(doc.id) === doc
  );

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
