import crypto from "node:crypto";
import type { ToiletFacility, ToiletReview } from "../src/types";
import { gradeForScore } from "../src/lib/scoring";
import type { ReviewInput } from "./community";
import type {
  AddReviewResult,
  CommunityRepository,
  ExternalFacilityObservation,
} from "./communityRepository";

type Plain = Record<string, any>;

export interface FirestoreDocumentSnapshotLike {
  exists: boolean;
  id: string;
  data(): Plain | undefined;
}

export interface FirestoreQuerySnapshotLike {
  docs: FirestoreDocumentSnapshotLike[];
}

export interface FirestoreDocumentRefLike {
  id: string;
  get(): Promise<FirestoreDocumentSnapshotLike>;
  create(data: Plain): Promise<unknown>;
  set(data: Plain, options?: Plain): Promise<unknown>;
}

export interface FirestoreQueryLike {
  where(field: string, op: "==", value: unknown): FirestoreQueryLike;
  get(): Promise<FirestoreQuerySnapshotLike>;
}

export interface FirestoreCollectionLike extends FirestoreQueryLike {
  doc(id?: string): FirestoreDocumentRefLike;
}

export interface FirestoreTransactionLike {
  get(ref: FirestoreDocumentRefLike): Promise<FirestoreDocumentSnapshotLike>;
  create(ref: FirestoreDocumentRefLike, data: Plain): FirestoreTransactionLike;
  set(ref: FirestoreDocumentRefLike, data: Plain, options?: Plain): FirestoreTransactionLike;
  update(ref: FirestoreDocumentRefLike, data: Plain): FirestoreTransactionLike;
}

export interface FirestoreLike {
  collection(name: string): FirestoreCollectionLike;
  runTransaction<T>(fn: (tx: FirestoreTransactionLike) => Promise<T>): Promise<T>;
}

interface AggregateDoc {
  reviewCount: number;
  overallSum: number;
  cleanlinessSum: number;
  odorSum: number;
  suppliesSum: number;
}

const EMPTY_AGGREGATE: AggregateDoc = {
  reviewCount: 0,
  overallSum: 0,
  cleanlinessSum: 0,
  odorSum: 0,
  suppliesSum: 0,
};

function asAggregate(raw: Plain | undefined): AggregateDoc {
  return {
    reviewCount: Number(raw?.reviewCount) || 0,
    overallSum: Number(raw?.overallSum) || 0,
    cleanlinessSum: Number(raw?.cleanlinessSum) || 0,
    odorSum: Number(raw?.odorSum) || 0,
    suppliesSum: Number(raw?.suppliesSum) || 0,
  };
}

function nextAggregate(a: AggregateDoc, r: ReviewInput): AggregateDoc {
  return {
    reviewCount: a.reviewCount + 1,
    overallSum: a.overallSum + r.overallScore,
    cleanlinessSum: a.cleanlinessSum + r.cleanlinessScore,
    odorSum: a.odorSum + r.odorScore,
    suppliesSum: a.suppliesSum + r.suppliesScore,
  };
}

function average(sum: number, count: number): number {
  return count > 0 ? Math.round((sum / count) * 10) / 10 : 0;
}

function publicFacilityFromDoc(raw: Plain, reviews: ToiletReview[]): ToiletFacility {
  return { ...(raw as ToiletFacility), reviews, reviewCount: reviews.length };
}

function reviewFromDoc(s: FirestoreDocumentSnapshotLike): ToiletReview {
  const data = s.data() ?? {};
  const { facilityId: _facilityId, facilityKind: _facilityKind, ...review } = data;
  return { ...review, id: data.id ?? s.id } as ToiletReview;
}

function isAlreadyExists(error: unknown): boolean {
  const e = error as { code?: unknown; message?: unknown };
  return e?.code === 6 || e?.code === "already-exists" || /already exists/i.test(String(e?.message ?? ""));
}

export class FirestoreCommunityStore implements CommunityRepository {
  constructor(private readonly db: FirestoreLike) {}

  private col(name: string) {
    return this.db.collection(name);
  }

  private reviewId(): string {
    return `rev-${crypto.randomUUID()}`;
  }

  private buildReview(id: string, input: ReviewInput): ToiletReview {
    return {
      id,
      userName: input.userName,
      rating: input.overallScore,
      overallScore: input.overallScore,
      cleanlinessScore: input.cleanlinessScore,
      odorScore: input.odorScore,
      suppliesScore: input.suppliesScore,
      comment: input.comment,
      createdAt: new Date().toISOString().split("T")[0],
      helpfulCount: 0,
    };
  }

  private dedupId(facilityId: string, ipHash: string, comment: string): string {
    return crypto
      .createHash("sha256")
      .update(`${facilityId}|${ipHash}|${comment}`)
      .digest("hex");
  }

  private voteId(reviewId: string, ipHash: string): string {
    return crypto.createHash("sha256").update(`${reviewId}|${ipHash}`).digest("hex");
  }

  private async reviewsForFacility(facilityId: string): Promise<ToiletReview[]> {
    const snap = await this.col("reviews").where("facilityId", "==", facilityId).get();
    return snap.docs
      .map(reviewFromDoc)
      .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  }

  async getToilets(): Promise<ToiletFacility[]> {
    const [facilities, communityReviews] = await Promise.all([
      this.col("community_toilets").get(),
      this.col("reviews").where("facilityKind", "==", "community").get(),
    ]);
    const reviewsByFacility = new Map<string, ToiletReview[]>();
    for (const doc of communityReviews.docs) {
      const data = doc.data() ?? {};
      const facilityId = String(data.facilityId ?? "");
      if (!facilityId) continue;
      const list = reviewsByFacility.get(facilityId) ?? [];
      list.push(reviewFromDoc(doc));
      reviewsByFacility.set(facilityId, list);
    }
    for (const list of reviewsByFacility.values()) {
      list.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
    }
    return facilities.docs.map((doc) =>
      publicFacilityFromDoc(doc.data() ?? {}, reviewsByFacility.get(doc.id) ?? [])
    );
  }

  async getExternalReviews(): Promise<Record<string, ToiletReview[]>> {
    const snap = await this.col("reviews").where("facilityKind", "==", "external").get();
    const out: Record<string, ToiletReview[]> = {};
    for (const doc of snap.docs) {
      const data = doc.data() ?? {};
      const facilityId = String(data.facilityId ?? "");
      if (!facilityId) continue;
      (out[facilityId] ??= []).push(reviewFromDoc(doc));
    }
    for (const list of Object.values(out)) {
      list.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
    }
    return out;
  }

  async addToilet(toilet: ToiletFacility): Promise<{ added: boolean }> {
    const ref = this.col("community_toilets").doc(toilet.id);
    return this.db.runTransaction(async (tx) => {
      const existing = await tx.get(ref);
      if (existing.exists) return { added: false };
      const { reviews: _reviews, ...stored } = toilet;
      tx.create(ref, { ...stored, reviewCount: 0 });
      tx.create(this.col("facility_aggregates").doc(toilet.id), EMPTY_AGGREGATE);
      return { added: true };
    });
  }

  async addReview(
    facilityId: string,
    input: ReviewInput,
    ipHash: string
  ): Promise<AddReviewResult> {
    const facilityRef = this.col("community_toilets").doc(facilityId);
    const externalRef = this.col("external_facilities").doc(facilityId);
    const dedupRef = this.col("review_dedup").doc(this.dedupId(facilityId, ipHash, input.comment));
    const aggregateRef = this.col("facility_aggregates").doc(facilityId);
    const reviewId = this.reviewId();
    const reviewRef = this.col("reviews").doc(reviewId);
    const now = Date.now();

    const outcome = await this.db.runTransaction(async (tx) => {
      const facility = await tx.get(facilityRef);
      const external = facility.exists ? null : await tx.get(externalRef);
      if (!facility.exists && !external?.exists) {
        return { error: "not_found" as const, kind: null as null | "community" | "external" };
      }

      const dedup = await tx.get(dedupRef);
      const validUntil = Number(dedup.data()?.validUntil ?? 0);
      if (dedup.exists && validUntil > now) {
        return { error: "duplicate" as const, kind: null as null | "community" | "external" };
      }

      const aggregateSnap = await tx.get(aggregateRef);
      const aggregate = nextAggregate(
        aggregateSnap.exists ? asAggregate(aggregateSnap.data()) : EMPTY_AGGREGATE,
        input
      );
      const kind = facility.exists ? "community" : "external";
      const review = this.buildReview(reviewId, input);

      tx.create(reviewRef, { ...review, facilityId, facilityKind: kind });
      tx.set(dedupRef, {
        facilityId,
        ipHash,
        reviewId,
        commentHash: crypto.createHash("sha256").update(input.comment).digest("hex"),
        createdAt: new Date(now).toISOString(),
        validUntil: now + 24 * 60 * 60 * 1000,
      });
      tx.set(aggregateRef, aggregate);

      if (kind === "community") {
        const cleanlinessScore = average(aggregate.cleanlinessSum, aggregate.reviewCount);
        const overallScore = average(aggregate.overallSum, aggregate.reviewCount);
        tx.update(facilityRef, {
          reviewCount: aggregate.reviewCount,
          cleanlinessScore,
          cleanlinessGrade: gradeForScore(cleanlinessScore),
          overallScore,
          lastCleaned: "たった今（利用者が確認）",
        });
      }

      return { kind, review };
    });

    if ("error" in outcome && outcome.error) return { error: outcome.error };
    const reviews = await this.reviewsForFacility(facilityId);
    if (outcome.kind === "community") {
      const facility = await facilityRef.get();
      return {
        toilet: publicFacilityFromDoc(facility.data() ?? {}, reviews),
      };
    }

    const count = reviews.length;
    const cleanlinessScore = count
      ? Math.round((reviews.reduce((s, r) => s + r.cleanlinessScore, 0) / count) * 10) / 10
      : undefined;
    const overallScore = count
      ? Math.round((reviews.reduce((s, r) => s + (r.overallScore ?? r.rating), 0) / count) * 10) / 10
      : undefined;
    return {
      facilityId,
      reviews,
      reviewCount: count,
      cleanlinessScore,
      cleanlinessGrade:
        cleanlinessScore === undefined ? undefined : gradeForScore(cleanlinessScore),
      overallScore,
    };
  }

  async voteHelpful(
    reviewId: string,
    ipHash: string
  ): Promise<{ helpfulCount: number; voted: boolean; found: boolean }> {
    const reviewRef = this.col("reviews").doc(reviewId);
    const voteRef = this.col("helpful_votes").doc(this.voteId(reviewId, ipHash));
    return this.db.runTransaction(async (tx) => {
      const review = await tx.get(reviewRef);
      if (!review.exists) return { helpfulCount: 0, voted: false, found: false };
      const vote = await tx.get(voteRef);
      const current = Number(review.data()?.helpfulCount ?? 0);
      if (vote.exists) return { helpfulCount: current, voted: false, found: true };
      tx.create(voteRef, { reviewId, ipHash, createdAt: new Date().toISOString() });
      tx.update(reviewRef, { helpfulCount: current + 1 });
      return { helpfulCount: current + 1, voted: true, found: true };
    });
  }

  async addReport(
    facilityId: string,
    reviewId: string,
    reason: string
  ): Promise<{ ok: boolean; found: boolean }> {
    const reviewRef = this.col("reviews").doc(reviewId);
    const reportId = `report-${crypto.randomUUID()}`;
    const reportRef = this.col("reports").doc(reportId);
    return this.db.runTransaction(async (tx) => {
      const review = await tx.get(reviewRef);
      if (!review.exists || review.data()?.facilityId !== facilityId) {
        return { ok: false, found: false };
      }
      tx.create(reportRef, {
        id: reportId,
        facilityId,
        toiletId: facilityId,
        reviewId,
        reason,
        createdAt: new Date().toISOString(),
      });
      return { ok: true, found: true };
    });
  }

  async registerExternalFacilities(facilities: ExternalFacilityObservation[]): Promise<void> {
    await Promise.all(
      facilities.map(async (facility) => {
        const ref = this.col("external_facilities").doc(facility.id);
        try {
          await ref.create({
            ...facility,
            firstSeenAt: new Date().toISOString(),
          });
        } catch (error) {
          if (!isAlreadyExists(error)) throw error;
        }
      })
    );
  }

  async isKnownExternalFacility(facilityId: string): Promise<boolean> {
    return (await this.col("external_facilities").doc(facilityId).get()).exists;
  }
}
