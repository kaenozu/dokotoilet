import {
  Router,
  type NextFunction,
  type Request,
  type RequestHandler,
  type Response,
} from "express";
import rateLimit from "express-rate-limit";
import { promises as fs } from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import type {
  ToiletFacility,
  ToiletReview,
  TriState,
} from "../src/types";
import { gradeForScore, summarizeReviews } from "../src/lib/scoring";
import { atomicWriteFile, withFileLock } from "./shared/persistence";
import type {
  AddReviewResult,
  CommunityRepository,
  ExternalFacilityObservation,
} from "./communityRepository";
import { isExternalFacilityIdFormat } from "./externalFacilityRegistry";

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

/** 外部施設ID形式の判定は shared モジュールに一本化（二重管理の廃止）。 */
export function isExternalFacilityId(id: string): boolean {
  return isExternalFacilityIdFormat(id);
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
  if (!body || typeof body !== "object")
    return { ok: false, error: "invalid body" };
  if (typeof body.id !== "string" || !TOILET_ID_RE.test(body.id))
    return { ok: false, error: "invalid id" };
  if (!isShortString(body.name, MAX.name) || !body.name.trim())
    return { ok: false, error: "invalid name" };
  if (!CATEGORIES.includes(body.category))
    return { ok: false, error: "invalid category" };
  if (typeof body.lat !== "number" || body.lat < -90 || body.lat > 90)
    return { ok: false, error: "invalid lat" };
  if (typeof body.lng !== "number" || body.lng < -180 || body.lng > 180)
    return { ok: false, error: "invalid lng" };
  if (body.address !== undefined && !isShortString(body.address, MAX.address))
    return { ok: false, error: "invalid address" };
  if (body.floorInfo !== undefined && !isShortString(body.floorInfo, MAX.floor))
    return { ok: false, error: "invalid floorInfo" };
  if (
    body.description !== undefined &&
    !isShortString(body.description, MAX.description)
  )
    return { ok: false, error: "invalid description" };
  if (
    typeof body.cleanlinessScore !== "number" ||
    body.cleanlinessScore < 1 ||
    body.cleanlinessScore > 5
  )
    return { ok: false, error: "invalid cleanlinessScore" };

  const a = body.attributes;
  if (a !== undefined && (a === null || typeof a !== "object" || Array.isArray(a)))
    return { ok: false, error: "invalid attributes" };
  for (const k of [
    "hasWashlet",
    "hasMultipurpose",
    "hasBabyTable",
    "hasPowderRoom",
    "isOpen24h",
  ] as const) {
    if (
      a !== undefined &&
      a[k] !== undefined &&
      a[k] !== null &&
      typeof a[k] !== "boolean"
    )
      return { ok: false, error: `invalid attributes.${k}` };
  }

  return {
    ok: true,
    value: {
      id: body.id,
      name: body.name.trim(),
      category: body.category,
      address:
        typeof body.address === "string" && body.address.trim()
          ? body.address.trim()
          : "現在地周辺",
      floorInfo:
        typeof body.floorInfo === "string" && body.floorInfo.trim()
          ? body.floorInfo.trim()
          : undefined,
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
  if (!body || typeof body !== "object")
    return { ok: false, error: "invalid body" };
  const r = body.review ?? body;
  if (r.rating !== undefined && !isInt1to5(r.rating))
    return { ok: false, error: "invalid rating" };
  if (r.overallScore !== undefined && !isInt1to5(r.overallScore))
    return { ok: false, error: "invalid overallScore" };
  const overall = r.overallScore ?? r.rating;
  if (!isInt1to5(overall))
    return {
      ok: false,
      error: r.rating === undefined ? "invalid overallScore" : "invalid rating",
    };
  if (!isInt1to5(r.cleanlinessScore))
    return { ok: false, error: "invalid cleanlinessScore" };
  if (!isInt1to5(r.odorScore))
    return { ok: false, error: "invalid odorScore" };
  if (!isInt1to5(r.suppliesScore))
    return { ok: false, error: "invalid suppliesScore" };
  if (!isShortString(r.comment, MAX.comment) || !r.comment.trim())
    return { ok: false, error: "invalid comment" };
  if (URL_RE.test(r.comment))
    return { ok: false, error: "comment must not contain URLs" };
  if (r.userName !== undefined && !isShortString(r.userName, MAX.userName))
    return { ok: false, error: "invalid userName" };

  return {
    ok: true,
    value: {
      userName:
        typeof r.userName === "string" && r.userName.trim()
          ? r.userName.trim()
          : "匿名の利用者",
      overallScore: overall,
      cleanlinessScore: r.cleanlinessScore,
      odorScore: r.odorScore,
      suppliesScore: r.suppliesScore,
      comment: r.comment.trim(),
    },
  };
}

export function validateReportInput(
  body: any
): ValidationResult<{ reason: string }> {
  if (!body || typeof body !== "object")
    return { ok: false, error: "invalid body" };
  if (!isShortString(body.reason, MAX.reason) || !body.reason.trim())
    return { ok: false, error: "invalid reason" };
  if (URL_RE.test(body.reason))
    return { ok: false, error: "reason must not contain URLs" };
  return { ok: true, value: { reason: body.reason.trim() } };
}

export function hashIp(ip: string, salt: string): string {
  return crypto.createHash("sha256").update(`${salt}|${ip}`).digest("hex");
}

export type AsyncRouteHandler = (
  req: Request,
  res: Response,
  next: NextFunction
) => void | Promise<void>;

export function asyncRoute(handler: AsyncRouteHandler): RequestHandler {
  return (req, res, next) => {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
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

interface MutationResult<T> {
  result: T;
  changed: boolean;
}

// コミュニティ登録トイレ＋外部施設レビューの JSON ファイルストア。
// マルチプロセス（CI・キュレーション CLI との同時実行）でも欠落が出ないよう、
// クロスプロセスのファイルロック下で毎回ディスクから読み直して更新する。
// Cloud Run 等の ephemeral FS では再起動で消える。本格運用は Firestore/Postgres
// への差し替えを想定（README参照）。
export class CommunityStore {
  constructor(private filePath: string) {}

  private parse(raw: string): CommunityDB {
    const parsed = JSON.parse(raw) as CommunityDB;
    if (!Array.isArray(parsed.toilets)) throw new Error("corrupt db");
    return {
      version: 2,
      toilets: parsed.toilets,
      helpfulVotes: parsed.helpfulVotes ?? {},
      reports: parsed.reports ?? [],
      reviewKeys:
        parsed.reviewKeys && typeof parsed.reviewKeys === "object"
          ? parsed.reviewKeys
          : {},
      externalReviews:
        parsed.externalReviews && typeof parsed.externalReviews === "object"
          ? (parsed.externalReviews as Record<string, ToiletReview[]>)
          : {},
    };
  }

  private async readDisk(): Promise<CommunityDB> {
    try {
      return this.parse(await fs.readFile(this.filePath, "utf-8"));
    } catch (e: any) {
      if (e?.code === "ENOENT") return structuredClone(EMPTY_DB);
      throw e;
    }
  }

  async load(): Promise<CommunityDB> {
    return withFileLock(this.filePath, () => this.readDisk());
  }

  async getToilets(): Promise<ToiletFacility[]> {
    return (await this.load()).toilets;
  }

  async addToilet(t: ToiletFacility): Promise<{ added: boolean }> {
    return withFileLock(this.filePath, async () => {
      const db = await this.readDisk();
      if (db.toilets.some((x) => x.id === t.id)) return { added: false };
      db.toilets.unshift(t);
      await atomicWriteFile(this.filePath, JSON.stringify(db));
      return { added: true };
    });
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

  // 重複投稿ガード: 同一IP＋同一コメントが24h以内は拒否
  private hasDuplicate(
    db: CommunityDB,
    reviews: ToiletReview[],
    comment: string,
    ipHash: string
  ): boolean {
    const dayAgo = Date.now() - 24 * 60 * 60 * 1000;
    return reviews.some((r) => {
      const key = db.reviewKeys[r.id];
      return (
        key !== undefined &&
        key.ipHash === ipHash &&
        r.comment === comment &&
        key.at >= dayAgo
      );
    });
  }

  // コミュニティ登録トイレに加え、外部施設（OSM/Google/自治体OD）のレビューも共有対象（M5）
  async addReview(
    toiletId: string,
    input: ReviewInput,
    ipHash: string
  ): Promise<AddReviewResult> {
    return withFileLock(this.filePath, async () => {
      const db = await this.readDisk();
      const t = db.toilets.find((x) => x.id === toiletId);

      if (t) {
        if (this.hasDuplicate(db, t.reviews, input.comment, ipHash)) {
          return { error: "duplicate" as const };
        }
        const review = this.buildReview(input);
        db.reviewKeys[review.id] = { ipHash, at: Date.now() };
        const reviews = [review, ...t.reviews];
        const summary = summarizeReviews(reviews)!; // reviews.length >= 1
        t.reviews = reviews;
        t.reviewCount = reviews.length;
        t.cleanlinessScore = summary.cleanlinessScore;
        t.cleanlinessGrade = summary.cleanlinessGrade;
        t.overallScore = summary.overallScore;
        t.lastCleaned = "たった今（利用者が確認）";
        await atomicWriteFile(this.filePath, JSON.stringify(db));
        return { toilet: t };
      }

      // コミュニティ登録外は施設ID形式（osm-* / google-* / od-*）でのみ受け付ける
      if (!isExternalFacilityId(toiletId)) return { error: "not_found" as const };
      const existing = db.externalReviews[toiletId] ?? [];
      if (this.hasDuplicate(db, existing, input.comment, ipHash)) {
        return { error: "duplicate" as const };
      }
      const review = this.buildReview(input);
      db.reviewKeys[review.id] = { ipHash, at: Date.now() };
      const reviews = [review, ...existing];
      db.externalReviews[toiletId] = reviews;
      const summary = summarizeReviews(reviews);
      await atomicWriteFile(this.filePath, JSON.stringify(db));
      return {
        facilityId: toiletId,
        reviews,
        reviewCount: reviews.length,
        cleanlinessScore: summary?.cleanlinessScore,
        cleanlinessGrade: summary?.cleanlinessGrade,
        overallScore: summary?.overallScore,
      };
    });
  }

  // コミュニティ登録トイレ＋外部施設の両方からレビューを探す
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

  // 外部施設（OSM/Google/OD）への共有レビュー一覧（クライアントがシード施設に重ねる用）
  async getExternalReviews(): Promise<Record<string, ToiletReview[]>> {
    const db = await this.load();
    return Object.fromEntries(
      Object.entries(db.externalReviews).map(([k, v]) => [k, structuredClone(v)])
    );
  }

  async voteHelpful(
    reviewId: string,
    ipHash: string
  ): Promise<{ helpfulCount: number; voted: boolean; found: boolean }> {
    return withFileLock(this.filePath, async () => {
      const db = await this.readDisk();
      const hit = this.findReview(db, reviewId);
      if (!hit) return { helpfulCount: 0, voted: false, found: false };
      const { review } = hit;
      const voters = db.helpfulVotes[reviewId] ?? [];
      if (voters.includes(ipHash)) {
        return { helpfulCount: review.helpfulCount, voted: false, found: true };
      }
      voters.push(ipHash);
      db.helpfulVotes[reviewId] = voters;
      review.helpfulCount += 1;
      await atomicWriteFile(this.filePath, JSON.stringify(db));
      return { helpfulCount: review.helpfulCount, voted: true, found: true };
    });
  }

  async addReport(
    toiletId: string,
    reviewId: string,
    reason: string
  ): Promise<{ ok: boolean; found: boolean }> {
    return withFileLock(this.filePath, async () => {
      const db = await this.readDisk();
      const t = db.toilets.find((x) => x.id === toiletId);
      const reviews = t ? t.reviews : db.externalReviews[toiletId];
      if (!reviews || !reviews.some((r) => r.id === reviewId)) {
        return { ok: false, found: false };
      }
      db.reports.push({
        id: `report-${crypto.randomUUID()}`,
        toiletId,
        reviewId,
        reason,
        createdAt: new Date().toISOString(),
      });
      await atomicWriteFile(this.filePath, JSON.stringify(db));
      return { ok: true, found: true };
    });
  }

  // 外部施設（OSM/Google/OD）の既知IDを登録する。レビュー0件でもキーを残すことで、
  // 再起動後も server.ts の起動時 registration（externalReviews のキー一覧）で
  // 施設のレビュー可否が復元される（#53 で失われた OSM リストア経路の代替）。
  async registerExternalFacilities(facilities: ExternalFacilityObservation[]): Promise<void> {
    await withFileLock(this.filePath, async () => {
      const db = await this.readDisk();
      let changed = false;
      for (const facility of facilities) {
        if (!isExternalFacilityId(facility.id)) continue;
        if (db.externalReviews[facility.id]) continue;
        db.externalReviews[facility.id] = [];
        changed = true;
      }
      if (changed) {
        await atomicWriteFile(this.filePath, JSON.stringify(db));
      }
    });
  }

  // 既知の外部施設ID一覧（レビュー有無に関係なく、externalReviews にキーがあるもの）。
  // 運用CLI（restore.ts）が curation 後の再登録に使う。
  async listKnownExternalFacilityIds(): Promise<string[]> {
    return Object.keys((await this.load()).externalReviews).sort();
  }
}

export function defaultStorePath(): string {
  return (
    process.env.COMMUNITY_STORE_PATH ||
    path.join(process.cwd(), "data", "community.json")
  );
}

export type ExternalFacilityValidator = (facilityId: string) => boolean | Promise<boolean>;

// ルーターはストレージの実装（JSON / Firestore / テスト用フェイク）に依存せず、
// CommunityRepository 契約のみを要求する（docs/durable-community-backend.md）。
export function createCommunityRouter(
  store: CommunityRepository,
  salt: string,
  isKnownExternalFacility: ExternalFacilityValidator = () => true
): Router {
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

  router.get(
    "/toilets",
    asyncRoute(async (_req: Request, res: Response) => {
      // toilets: コミュニティ登録トイレ。externalReviews: 外部施設（OSM/Google/OD）の
      // 共有レビュー（M5）。クライアントがローカルのシード施設に重ねて表示する
      res.json({
        toilets: publicToilets(await store.getToilets()),
        externalReviews: await store.getExternalReviews(),
      });
    })
  );

  router.post(
    "/toilets",
    postLimiter,
    asyncRoute(async (req: Request, res: Response) => {
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
        openingHours: v.value.attributes.isOpen24h
          ? "24時間営業"
          : "施設営業時間に準ずる",
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
    })
  );

  router.post(
    "/toilets/:id/reviews",
    postLimiter,
    asyncRoute(async (req: Request, res: Response) => {
      const v = validateReviewInput(req.body);
      if (!v.ok || !v.value) {
        res.status(400).json({ error: v.error });
        return;
      }

      const facilityId = req.params.id;
      if (
        isExternalFacilityId(facilityId) &&
        !(await isKnownExternalFacility(facilityId))
      ) {
        res.status(404).json({ error: "toilet not found" });
        return;
      }

      const r = await store.addReview(facilityId, v.value, ipHashOf(req));
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
      // 外部施設（OSM/Google/OD）: 施設ごとレビュー一覧を返し、クライアントが重ねる
      res.status(201).json({
        facilityId: r.facilityId,
        reviewCount: r.reviewCount,
        cleanlinessScore: r.cleanlinessScore,
        cleanlinessGrade: r.cleanlinessGrade,
        reviews: r.reviews,
      });
    })
  );

  router.post(
    "/reviews/:reviewId/helpful",
    voteLimiter,
    asyncRoute(async (req: Request, res: Response) => {
      const r = await store.voteHelpful(req.params.reviewId, ipHashOf(req));
      if (!r.found) {
        res.status(404).json({ error: "review not found" });
        return;
      }
      res.json({ helpfulCount: r.helpfulCount, voted: r.voted });
    })
  );

  router.post(
    "/reviews/:reviewId/report",
    postLimiter,
    asyncRoute(async (req: Request, res: Response) => {
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
      const r = await store.addReport(
        toiletId,
        req.params.reviewId,
        v.value.reason
      );
      if (!r.found) {
        res.status(404).json({ error: "review not found" });
        return;
      }
      res.status(201).json({ ok: true });
    })
  );

  router.use((err: unknown, _req: Request, res: Response, _next: (err?: unknown) => void) => {
    console.error("[community] request failed:", err);
    if (!res.headersSent) res.status(500).json({ error: "internal server error" });
  });

  return router;
}
