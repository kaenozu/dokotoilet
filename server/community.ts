import { Router, type Request, type Response } from "express";
import rateLimit from "express-rate-limit";
import { promises as fs } from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import type { CleanlinessGrade, ToiletFacility, ToiletReview, TriState } from "../src/types";
import { gradeForScore, summarizeReviews } from "../src/lib/scoring";

const MAX = {
  name: 100,
  address: 200,
  floor: 50,
  description: 2000,
  comment: 1000,
  userName: 30,
  reason: 500,
} as const;

const CATEGORIES = [
  "department",
  "station",
  "convenience",
  "park",
  "hotel",
  "cafe",
] as const;

const TOILET_ID_RE = /^toilet-user-[A-Za-z0-9-]{1,64}$/;
const EXTERNAL_FACILITY_ID_RE = /^(osm|google|od)-[A-Za-z0-9_-]{1,80}$/;
const URL_RE = /https?:\/\/|www\.[a-z0-9-]+\.[a-z]{2,}/i;

export interface ValidationResult<T> {
  ok: boolean;
  value?: T;
  error?: string;
}

function isInt1to5(n: unknown): n is number {
  return typeof n === "number" && Number.isInteger(n) && n >= 1 && n <= 5;
}

function isShortString(v: unknown, max: number): v is string {
  return typeof v === "string" && v.length <= max;
}

export interface ToiletInput {
  id: string;
  name: string;
  category: (typeof CATEGORIES)[number];
  address: string;
  floorInfo?: string;
  cleanlinessScore: number;
  description: string;
  lat: number;
  lng: number;
  attributes: {
    hasWashlet: TriState;
    hasMultipurpose: TriState;
    hasBabyTable: TriState;
    hasPowderRoom: TriState;
    isOpen24h: TriState;
  };
}

export function validateToiletInput(body: any): ValidationResult<ToiletInput> {
  if (!body || typeof body !== "object") return { ok: false, error: "invalid body" };
  if (typeof body.id !== "string" || !TOILET_ID_RE.test(body.id))
    return { ok: false, error: "invalid id" };
  if (!isShortString(body.name, MAX.name) || !body.name.trim())
    return { ok: false, error: "invalid name" };
  if (!CATEGORIES.includes(body.category)) return { ok: false, error: "invalid category" };
  if (typeof body.lat !== "number" || body.lat < -90 || body.lat > 90)
    return { ok: false, error: "invalid lat" };
  if (typeof body.lng !== "number" || body.lng < -180 || body.lng > 180)
    return { ok: false, error: "invalid lng" };
  if (body.address !== undefined && !isShortString(body.address, MAX.address))
    return { ok: false, error: "invalid address" };
  if (body.floorInfo !== undefined && !isShortString(body.floorInfo, MAX.floor))
    return { ok: false, error: "invalid floorInfo" };
  if (body.description !== undefined && !isShortString(body.description, MAX.description))
    return { ok: false, error: "invalid description" };
  if (typeof body.cleanlinessScore !== "number" || body.cleanlinessScore < 1 || body.cleanlinessScore > 5)
    return { ok: false, error: "invalid cleanlinessScore" };
  const a = body.attributes;
  for (const k of ["hasWashlet", "hasMultipurpose", "hasBabyTable", "hasPowderRoom", "isOpen24h"] as const) {
    if (a !== undefined && a[k] !== undefined && a[k] !== null && typeof a[k] !== "boolean")
      return { ok: false, error: `invalid attributes.${k}` };
  }
  return {
    ok: true,
    value: {
      id: body.id,
      name: body.name.trim(),
      category: body.category,
      address: typeof body.address === "string" && body.address.trim() ? body.address.trim() : "現在地周辺",
      floorInfo: typeof body.floorInfo === "string" && body.floorInfo.trim() ? body.floorInfo.trim() : undefined,
      cleanlinessScore: body.cleanlinessScore,
      description:
        typeof body.description === "string" && body.description.trim()
          ? body.description.trim()
          : "ユーザーによって登録されたトイレ情報です。",
      lat: body.lat,
      lng: body.lng,
      attributes: {
        hasWashlet: a?.hasWashlet ?? null,
        hasMultipurpose: a?.hasMultipurpose ?? null,
        hasBabyTable: a?.hasBabyTable ?? null,
        hasPowderRoom: a?.hasPowderRoom ?? null,
        isOpen24h: a?.isOpen24h ?? null,
      },
    },
  };
}

export interface ReviewInput {
  userName: string;
  overallScore: number;
  cleanlinessScore: number;
  odorScore: number;
  suppliesScore: number;
  comment: string;
}

export function validateReviewInput(body: any): ValidationResult<ReviewInput> {
  if (!body || typeof body !== "object") return { ok: false, error: "invalid body" };
  const r = body.review ?? body;
  if (r.rating !== undefined && !isInt1to5(r.rating))
    return { ok: false, error: "invalid rating" };
  if (r.overallScore !== undefined && !isInt1to5(r.overallScore))
    return { ok: false, error: "invalid overallScore" };
  const overall = r.overallScore ?? r.rating;
  if (!isInt1to5(overall))
    return { ok: false, error: r.rating === undefined ? "invalid overallScore" : "invalid rating" };
  if (!isInt1to5(r.cleanlinessScore)) return { ok: false, error: "invalid cleanlinessScore" };
  if (!isInt1to5(r.odorScore)) return { ok: false, error: "invalid odorScore" };
  if (!isInt1to5(r.suppliesScore)) return { ok: false, error: "invalid suppliesScore" };
  if (!isShortString(r.comment, MAX.comment) || !r.comment.trim())
    return { ok: false, error: "invalid comment" };
  if (URL_RE.test(r.comment)) return { ok: false, error: "comment must not contain URLs" };
  if (r.userName !== undefined && !isShortString(r.userName, MAX.userName))
    return { ok: false, error: "invalid userName" };
  return {
    ok: true,
    value: {
      userName: typeof r.userName === "string" && r.userName.trim() ? r.userName.trim() : "匿名の利用者",
      overallScore: overall,
      cleanlinessScore: r.cleanlinessScore,
      odorScore: r.odorScore,
      suppliesScore: r.suppliesScore,
      comment: r.comment.trim(),
    },
  };
}

export function validateReportInput(body: any): ValidationResult<{ reason: string }> {
  if (!body || typeof body !== "object") return { ok: false, error: "invalid body" };
  if (!isShortString(body.reason, MAX.reason) || !body.reason.trim())
    return { ok: false, error: "invalid reason" };
  if (URL_RE.test(body.reason)) return { ok: false, error: "reason must not contain URLs" };
  return { ok: true, value: { reason: body.reason.trim() } };
}

export function hashIp(ip: string, salt: string): string {
  return crypto.createHash("sha256").update(`${salt}|${ip}`).digest("hex");
}

export interface StoredReport {
  id: string;
  toiletId: string;
  reviewId: string;
  reason: string;
  createdAt: string;
}

export interface ReviewKey {
  ipHash: string;
  at: number;
}

export interface CommunityDB {
  version: 2;
  toilets: ToiletFacility[];
  helpfulVotes: Record<string, string[]>;
  reports: StoredReport[];
  reviewKeys: Record<string, ReviewKey>;
  externalReviews: Record<string, ToiletReview[]>;
}

export function publicToilets(toilets: ToiletFacility[]): ToiletFacility[] {
  return toilets.map((t) => ({
    ...t,
    reviews: t.reviews.map((r: any) => {
      const { ipHash: _dropped, ...pub } = r;
      return pub;
    }),
  }));
}

const EMPTY_DB: CommunityDB = {
  version: 2,
  toilets: [],
  helpfulVotes: {},
  reports: [],
  reviewKeys: {},
  externalReviews: {},
};

export class CommunityStore {
  private data: CommunityDB | null = null;
  private queue: Promise<void> = Promise.resolve();

  constructor(private filePath: string) {}

  async load(): Promise<CommunityDB> {
    if (this.data) return this.data;
    try {
      const raw = await fs.readFile(this.filePath, "utf-8");
      const parsed = JSON.parse(raw) as CommunityDB;
      if (!Array.isArray(parsed.toilets)) throw new Error("corrupt db");
      this.data = {
        version: 2,
        toilets: parsed.toilets,
        helpfulVotes: parsed.helpfulVotes ?? {},
        reports: parsed.reports ?? [],
        reviewKeys: parsed.reviewKeys ?? {},
        externalReviews:
          parsed.externalReviews && typeof parsed.externalReviews === "object"
            ? (parsed.externalReviews as Record<string, ToiletReview[]>)
            : {},
      };
      return this.data;
    } catch (e: any) {
      if (e?.code === "ENOENT") {
        this.data = { ...EMPTY_DB, toilets: [], helpfulVotes: {}, reports: [], reviewKeys: {}, externalReviews: {} };
        return this.data;
      }
      console.error("community store load failed; refusing to continue with an empty store:", e?.message ?? e);
      throw e;
    }
  }

  private save(): Promise<void> {
    const operation = this.queue.catch(() => undefined).then(async () => {
      if (!this.data) throw new Error("community store is not loaded");
      const db = this.data;
      await fs.mkdir(path.dirname(this.filePath), { recursive: true });
      const tmp = `${this.filePath}.${process.pid}.${crypto.randomUUID()}.tmp`;
      try {
        await fs.writeFile(tmp, JSON.stringify(db), "utf-8");
        await fs.rename(tmp, this.filePath);
      } finally {
        await fs.rm(tmp, { force: true }).catch(() => undefined);
      }
    });
    // 呼び出し元には今回の失敗を返す一方、内部キューは常に復旧させる。
    this.queue = operation.catch(() => undefined);
    return operation;
  }

  async getToilets(): Promise<ToiletFacility[]> {
    return (await this.load()).toilets;
  }

  async addToilet(t: ToiletFacility): Promise<{ added: boolean }> {
    const db = await this.load();
    if (db.toilets.some((x) => x.id === t.id)) return { added: false };
    db.toilets.unshift(t);
    await this.save();
    return { added: true };
  }

  private buildReview(input: ReviewInput): ToiletReview {
    return {
      id: `rev-${crypto.randomUUID()}`,
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

  private hasDuplicate(
    db: CommunityDB,
    reviews: ToiletReview[],
    comment: string,
    ipHash: string
  ): boolean {
    const dayAgo = Date.now() - 24 * 60 * 60 * 1000;
    return reviews.some((r) => {
      const key = db.reviewKeys[r.id];
      return key !== undefined && key.ipHash === ipHash && r.comment === comment && key.at >= dayAgo;
    });
  }

  async addReview(
    toiletId: string,
    input: ReviewInput,
    ipHash: string
  ): Promise<{
    error?: "not_found" | "duplicate";
    toilet?: ToiletFacility;
    facilityId?: string;
    reviews?: ToiletReview[];
    reviewCount?: number;
    cleanlinessScore?: number;
    cleanlinessGrade?: CleanlinessGrade;
    overallScore?: number;
  }> {
    const db = await this.load();
    const t = db.toilets.find((x) => x.id === toiletId);

    if (t) {
      if (this.hasDuplicate(db, t.reviews, input.comment, ipHash)) return { error: "duplicate" };
      const review = this.buildReview(input);
      db.reviewKeys[review.id] = { ipHash, at: Date.now() };
      const reviews = [review, ...t.reviews];
      const summary = summarizeReviews(reviews)!;
      t.reviews = reviews;
      t.reviewCount = reviews.length;
      t.cleanlinessScore = summary.cleanlinessScore;
      t.cleanlinessGrade = summary.cleanlinessGrade;
      t.overallScore = summary.overallScore;
      t.lastCleaned = "たった今（利用者が確認）";
      await this.save();
      return { toilet: t };
    }

    if (!EXTERNAL_FACILITY_ID_RE.test(toiletId)) return { error: "not_found" };
    const existing = db.externalReviews[toiletId] ?? [];
    if (this.hasDuplicate(db, existing, input.comment, ipHash)) return { error: "duplicate" };
    const review = this.buildReview(input);
    db.reviewKeys[review.id] = { ipHash, at: Date.now() };
    const reviews = [review, ...existing];
    db.externalReviews[toiletId] = reviews;
    const summary = summarizeReviews(reviews);
    await this.save();
    return {
      facilityId: toiletId,
      reviews,
      reviewCount: reviews.length,
      cleanlinessScore: summary?.cleanlinessScore,
      cleanlinessGrade: summary?.cleanlinessGrade,
      overallScore: summary?.overallScore,
    };
  }

  private findReview(
    db: CommunityDB,
    reviewId: string
  ): { review: ToiletReview } | null {
    for (const t of db.toilets) {
      const r = t.reviews.find((x) => x.id === reviewId);
      if (r) return { review: r };
    }
    for (const list of Object.values(db.externalReviews)) {
      const r = list.find((x) => x.id === reviewId);
      if (r) return { review: r };
    }
    return null;
  }

  async getExternalReviews(): Promise<Record<string, ToiletReview[]>> {
    const db = await this.load();
    return Object.fromEntries(
      Object.entries(db.externalReviews).map(([k, v]) => [k, [...v]])
    );
  }

  async voteHelpful(
    reviewId: string,
    ipHash: string
  ): Promise<{ helpfulCount: number; voted: boolean; found: boolean }> {
    const db = await this.load();
    const hit = this.findReview(db, reviewId);
    if (!hit) return { helpfulCount: 0, voted: false, found: false };
    const { review } = hit;
    const voters = db.helpfulVotes[reviewId] ?? [];
    if (voters.includes(ipHash)) return { helpfulCount: review.helpfulCount, voted: false, found: true };
    voters.push(ipHash);
    db.helpfulVotes[reviewId] = voters;
    review.helpfulCount += 1;
    await this.save();
    return { helpfulCount: review.helpfulCount, voted: true, found: true };
  }

  async addReport(
    toiletId: string,
    reviewId: string,
    reason: string
  ): Promise<{ ok: boolean; found: boolean }> {
    const db = await this.load();
    const t = db.toilets.find((x) => x.id === toiletId);
    const reviews = t ? t.reviews : db.externalReviews[toiletId];
    if (!reviews || !reviews.some((r) => r.id === reviewId)) return { ok: false, found: false };
    db.reports.push({
      id: `report-${crypto.randomUUID()}`,
      toiletId,
      reviewId,
      reason,
      createdAt: new Date().toISOString(),
    });
    await this.save();
    return { ok: true, found: true };
  }
}

export function defaultStorePath(): string {
  return process.env.COMMUNITY_STORE_PATH || path.join(process.cwd(), "data", "community.json");
}

export function createCommunityRouter(store: CommunityStore, salt: string): Router {
  const router = Router();

  const postLimiter = rateLimit({
    windowMs: 60 * 1000,
    limit: 10,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    message: { error: "too many requests" },
  });
  const voteLimiter = rateLimit({
    windowMs: 60 * 1000,
    limit: 30,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    message: { error: "too many requests" },
  });

  const ipHashOf = (req: Request) => hashIp(req.ip || "?", salt);

  router.get("/toilets", async (_req: Request, res: Response) => {
    res.json({
      toilets: publicToilets(await store.getToilets()),
      externalReviews: await store.getExternalReviews(),
    });
  });

  router.post("/toilets", postLimiter, async (req: Request, res: Response) => {
    const v = validateToiletInput(req.body);
    if (!v.ok || !v.value) {
      res.status(400).json({ error: v.error });
      return;
    }
    const t: ToiletFacility = {
      id: v.value.id,
      name: v.value.name,
      facilityType:
        v.value.category === "department"
          ? "商業施設・デパート"
          : v.value.category === "station"
          ? "駅・交通施設"
          : v.value.category === "convenience"
          ? "コンビニ"
          : v.value.category === "park"
          ? "公衆トイレ"
          : "その他施設",
      category: v.value.category,
      dataSource: "community",
      lat: v.value.lat,
      lng: v.value.lng,
      address: v.value.address,
      floorInfo: v.value.floorInfo,
      cleanlinessGrade: gradeForScore(v.value.cleanlinessScore),
      cleanlinessScore: v.value.cleanlinessScore,
      equipmentGrade: gradeForScore(v.value.cleanlinessScore),
      equipmentScore: v.value.cleanlinessScore,
      subScores: {
        cleanliness: v.value.cleanlinessScore,
        odor: Math.min(5, v.value.cleanlinessScore + 0.1),
        supplies: v.value.cleanlinessScore,
        comfort: v.value.cleanlinessScore,
      },
      attributes: {
        hasWashlet: v.value.attributes.hasWashlet,
        hasMultipurpose: v.value.attributes.hasMultipurpose,
        hasBabyTable: v.value.attributes.hasBabyTable,
        hasNursingRoom: null,
        hasPowderRoom: v.value.attributes.hasPowderRoom,
        hasOstomate: null,
        isFree: null,
        isOpen24h: v.value.attributes.isOpen24h,
        hasSoap: null,
        hasAlcohol: null,
        hasPaperTowelOrDryer: null,
        toiletStyle: null,
      },
      openingHours: v.value.attributes.isOpen24h ? "24時間営業" : "施設営業時間に準ずる",
      description: v.value.description,
      reviewCount: 0,
      reviews: [],
      facilityNote: "ユーザー報告に基づく新規登録トイレ情報。",
    };
    const { added } = await store.addToilet(t);
    if (!added) {
      res.status(409).json({ error: "duplicate id" });
      return;
    }
    res.status(201).json({ toilet: t });
  });

  router.post("/toilets/:id/reviews", postLimiter, async (req: Request, res: Response) => {
    const v = validateReviewInput(req.body);
    if (!v.ok || !v.value) {
      res.status(400).json({ error: v.error });
      return;
    }
    const r = await store.addReview(req.params.id, v.value, ipHashOf(req));
    if (r.error === "not_found") {
      res.status(404).json({ error: "toilet not found" });
      return;
    }
    if (r.error === "duplicate") {
      res.status(409).json({ error: "duplicate review" });
      return;
    }
    if (r.toilet) {
      res.status(201).json({ toilet: publicToilets([r.toilet])[0] });
      return;
    }
    res.status(201).json({
      facilityId: r.facilityId,
      reviewCount: r.reviewCount,
      cleanlinessScore: r.cleanlinessScore,
      cleanlinessGrade: r.cleanlinessGrade,
      reviews: r.reviews,
    });
  });

  router.post("/reviews/:reviewId/helpful", voteLimiter, async (req: Request, res: Response) => {
    const r = await store.voteHelpful(req.params.reviewId, ipHashOf(req));
    if (!r.found) {
      res.status(404).json({ error: "review not found" });
      return;
    }
    res.json({ helpfulCount: r.helpfulCount, voted: r.voted });
  });

  router.post("/reviews/:reviewId/report", postLimiter, async (req: Request, res: Response) => {
    const v = validateReportInput(req.body);
    if (!v.ok || !v.value) {
      res.status(400).json({ error: v.error });
      return;
    }
    const { toiletId } = req.body ?? {};
    if (typeof toiletId !== "string") {
      res.status(400).json({ error: "toiletId required" });
      return;
    }
    const r = await store.addReport(toiletId, req.params.reviewId, v.value.reason);
    if (!r.found) {
      res.status(404).json({ error: "review not found" });
      return;
    }
    res.status(201).json({ ok: true });
  });

  return router;
}
