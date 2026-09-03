import { Router, type Request, type Response } from "express";
import rateLimit from "express-rate-limit";
import { promises as fs } from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import type { ToiletFacility, ToiletReview } from "../src/types";
import { gradeForScore } from "../src/lib/scoring";

// ── バリデーション（pure・単体テスト対象） ──

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
// スパム対策: コメント・通報文内のURLを拒否
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
    hasWashlet: boolean;
    hasMultipurpose: boolean;
    hasBabyTable: boolean;
    hasPowderRoom: boolean;
    isOpen24h: boolean;
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
    if (a !== undefined && a[k] !== undefined && typeof a[k] !== "boolean")
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
        hasWashlet: a?.hasWashlet ?? false,
        hasMultipurpose: a?.hasMultipurpose ?? false,
        hasBabyTable: a?.hasBabyTable ?? false,
        hasPowderRoom: a?.hasPowderRoom ?? false,
        isOpen24h: a?.isOpen24h ?? false,
      },
    },
  };
}

export interface ReviewInput {
  userName: string;
  rating: number;
  cleanlinessScore: number;
  odorScore: number;
  suppliesScore: number;
  comment: string;
  hasWashletConfirmed: boolean;
}

export function validateReviewInput(body: any): ValidationResult<ReviewInput> {
  if (!body || typeof body !== "object") return { ok: false, error: "invalid body" };
  const r = body.review ?? body;
  if (!isInt1to5(r.rating)) return { ok: false, error: "invalid rating" };
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
      rating: r.rating,
      cleanlinessScore: r.cleanlinessScore,
      odorScore: r.odorScore,
      suppliesScore: r.suppliesScore,
      comment: r.comment.trim(),
      hasWashletConfirmed: r.hasWashletConfirmed !== false,
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

// ── IPハッシュ（投票の重複防止用。不可逆） ──

export function hashIp(ip: string, salt: string): string {
  return crypto.createHash("sha256").update(`${salt}|${ip}`).digest("hex");
}

// ── ファイルストア（JSON・Atomic write・直列化） ──
// Cloud Run等の ephemeral FS では再起動で消える。本格運用は Firestore/Postgres
// への差し替えを想定（README参照）。

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
  version: 1;
  toilets: ToiletFacility[];
  helpfulVotes: Record<string, string[]>;
  reports: StoredReport[];
  // 重複投稿ガード用（クライアントには返さない）
  reviewKeys: Record<string, ReviewKey>;
}

// クライアント返却用に秘密情報（ipHash等）を落とす
export function publicToilets(toilets: ToiletFacility[]): ToiletFacility[] {
  return toilets.map((t) => ({
    ...t,
    reviews: t.reviews.map((r: any) => {
      const { ipHash: _dropped, ...pub } = r;
      return pub;
    }),
  }));
}

const EMPTY_DB: CommunityDB = { version: 1, toilets: [], helpfulVotes: {}, reports: [], reviewKeys: {} };

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
        version: 1,
        toilets: parsed.toilets,
        helpfulVotes: parsed.helpfulVotes ?? {},
        reports: parsed.reports ?? [],
        reviewKeys: parsed.reviewKeys ?? {},
      };
    } catch (e: any) {
      if (e?.code !== "ENOENT") console.warn("community store load failed, starting empty:", e?.message);
      this.data = { ...EMPTY_DB, toilets: [], helpfulVotes: {}, reports: [] };
    }
    return this.data;
  }

  private save(): Promise<void> {
    this.queue = this.queue.then(async () => {
      const db = this.data ?? EMPTY_DB;
      await fs.mkdir(path.dirname(this.filePath), { recursive: true });
      const tmp = `${this.filePath}.${process.pid}.tmp`;
      await fs.writeFile(tmp, JSON.stringify(db), "utf-8");
      await fs.rename(tmp, this.filePath);
    });
    return this.queue;
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

  async addReview(
    toiletId: string,
    input: ReviewInput,
    ipHash: string
  ): Promise<{ toilet?: ToiletFacility; error?: "not_found" | "duplicate" }> {
    const db = await this.load();
    const t = db.toilets.find((x) => x.id === toiletId);
    if (!t) return { error: "not_found" };
    // 重複投稿ガード: 同一IP＋同一コメントが24h以内は拒否
    const dayAgo = Date.now() - 24 * 60 * 60 * 1000;
    const dup = t.reviews.some((r) => {
      const key = db.reviewKeys[r.id];
      return key !== undefined && key.ipHash === ipHash && r.comment === input.comment && key.at >= dayAgo;
    });
    if (dup) return { error: "duplicate" };
    const reviewId = `rev-${crypto.randomUUID()}`;
    const review: ToiletReview = {
      id: reviewId,
      userName: input.userName,
      rating: input.rating,
      cleanlinessScore: input.cleanlinessScore,
      odorScore: input.odorScore,
      suppliesScore: input.suppliesScore,
      comment: input.comment,
      createdAt: new Date().toISOString().split("T")[0],
      helpfulCount: 0,
      hasWashletConfirmed: input.hasWashletConfirmed,
      isCleanConfirmed: input.cleanlinessScore >= 4,
    };
    db.reviewKeys[reviewId] = { ipHash, at: Date.now() };
    const reviews = [review, ...t.reviews];
    const avg = parseFloat(
      (reviews.reduce((s, r) => s + r.rating, 0) / reviews.length).toFixed(1)
    );
    t.reviews = reviews;
    t.reviewCount = reviews.length;
    t.cleanlinessScore = avg;
    t.cleanlinessGrade = gradeForScore(avg);
    t.lastCleaned = "たった今（利用者が確認）";
    await this.save();
    return { toilet: t };
  }

  async voteHelpful(
    reviewId: string,
    ipHash: string
  ): Promise<{ helpfulCount: number; voted: boolean; found: boolean }> {
    const db = await this.load();
    for (const t of db.toilets) {
      const r = t.reviews.find((x) => x.id === reviewId);
      if (!r) continue;
      const voters = db.helpfulVotes[reviewId] ?? [];
      if (voters.includes(ipHash)) return { helpfulCount: r.helpfulCount, voted: false, found: true };
      voters.push(ipHash);
      db.helpfulVotes[reviewId] = voters;
      r.helpfulCount += 1;
      await this.save();
      return { helpfulCount: r.helpfulCount, voted: true, found: true };
    }
    return { helpfulCount: 0, voted: false, found: false };
  }

  async addReport(
    toiletId: string,
    reviewId: string,
    reason: string
  ): Promise<{ ok: boolean; found: boolean }> {
    const db = await this.load();
    const t = db.toilets.find((x) => x.id === toiletId);
    if (!t || !t.reviews.some((r) => r.id === reviewId)) return { ok: false, found: false };
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

// ── ルーター ──

export function defaultStorePath(): string {
  return (
    process.env.COMMUNITY_STORE_PATH || path.join(process.cwd(), "data", "community.json")
  );
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
    res.json({ toilets: publicToilets(await store.getToilets()) });
  });

  router.post("/toilets", postLimiter, async (req: Request, res: Response) => {
    const v = validateToiletInput(req.body);
    if (!v.ok || !v.value) {
      res.status(400).json({ error: v.error });
      return;
    }
    const now = new Date().toISOString().split("T")[0];
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
        hasNursingRoom: false,
        hasPowderRoom: v.value.attributes.hasPowderRoom,
        hasOstomate: false,
        isFree: true,
        isOpen24h: v.value.attributes.isOpen24h,
        hasSoap: true,
        hasAlcohol: true,
        hasPaperTowelOrDryer: true,
        toiletStyle: "western",
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
    res.status(201).json({ toilet: publicToilets([r.toilet!])[0] });
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
