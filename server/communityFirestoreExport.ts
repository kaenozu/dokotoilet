import type { CommunityDB, ReviewKey, StoredReport } from "./community";
import type { FirestoreLike } from "./firestoreCommunityStore";
import type { ToiletFacility, ToiletReview } from "../src/types";

function reviewFromDoc(id: string, data: Record<string, any>): ToiletReview {
  const { facilityId: _facilityId, facilityKind: _facilityKind, ...review } = data;
  return { ...review, id: data.id ?? id } as ToiletReview;
}

export async function exportCommunitySnapshotFromFirestore(
  db: FirestoreLike
): Promise<CommunityDB> {
  const toiletSnap = await db.collection("community_toilets").get();
  const reviewSnap = await db.collection("reviews").get();
  const voteSnap = await db.collection("helpful_votes").get();
  const reportSnap = await db.collection("reports").get();
  const dedupSnap = await db.collection("review_dedup").get();
  const externalSnap = await db.collection("external_facilities").get();

  const communityReviews = new Map<string, ToiletReview[]>();
  const externalReviews = new Map<string, ToiletReview[]>();

  for (const doc of reviewSnap.docs) {
    const data = doc.data() ?? {};
    const facilityId = String(data.facilityId ?? "");
    if (!facilityId) continue;
    const target = data.facilityKind === "external" ? externalReviews : communityReviews;
    const list = target.get(facilityId) ?? [];
    list.push(reviewFromDoc(doc.id, data));
    target.set(facilityId, list);
  }

  const toilets: ToiletFacility[] = toiletSnap.docs.map((doc) => {
    const data = doc.data() ?? {};
    const reviews = communityReviews.get(doc.id) ?? [];
    return {
      ...(data as ToiletFacility),
      id: data.id ?? doc.id,
      reviews,
      reviewCount: reviews.length,
    };
  });

  const externalReviewRecord: Record<string, ToiletReview[]> = {};
  for (const doc of externalSnap.docs) {
    externalReviewRecord[doc.id] = externalReviews.get(doc.id) ?? [];
  }
  for (const [facilityId, reviews] of externalReviews) {
    externalReviewRecord[facilityId] ??= reviews;
  }

  const helpfulVotes: Record<string, string[]> = {};
  for (const doc of voteSnap.docs) {
    const data = doc.data() ?? {};
    const reviewId = String(data.reviewId ?? "");
    const ipHash = String(data.ipHash ?? "");
    if (!reviewId || !ipHash) continue;
    (helpfulVotes[reviewId] ??= []).push(ipHash);
  }

  const reports: StoredReport[] = reportSnap.docs.map((doc) => {
    const data = doc.data() ?? {};
    return {
      id: String(data.id ?? doc.id),
      toiletId: String(data.toiletId ?? data.facilityId ?? ""),
      reviewId: String(data.reviewId ?? ""),
      reason: String(data.reason ?? ""),
      createdAt: String(data.createdAt ?? ""),
    };
  });

  const reviewKeys: Record<string, ReviewKey> = {};
  for (const doc of dedupSnap.docs) {
    const data = doc.data() ?? {};
    const reviewId = String(data.reviewId ?? "");
    const ipHash = String(data.ipHash ?? "");
    if (!reviewId || !ipHash) continue;
    const parsed = Date.parse(String(data.createdAt ?? ""));
    reviewKeys[reviewId] = {
      ipHash,
      at: Number.isFinite(parsed) ? parsed : Number(data.validUntil ?? 0) - 24 * 60 * 60 * 1000,
    };
  }

  return {
    version: 2,
    toilets,
    helpfulVotes,
    reports,
    reviewKeys,
    externalReviews: externalReviewRecord,
  };
}
