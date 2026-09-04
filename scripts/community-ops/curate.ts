// 通報（data/community.json の reports）への対応: 該当レビューの削除を安全に実行する。
// git運用のためのスクリプト。「何を・いつ削除したか」の監査履歴はコミットログが担うため、
// report エントリはレビューと一緒に削除し、ファイルは常に「未処理の通報のみ」を保つ。
//
// 使い方（リポジトリ直下から）:
//   bun scripts/community-ops/curate.ts list                            # 通報一覧（レビュー本文つき）
//   bun scripts/community-ops/curate.ts resolve <reportId>              # dry-run: 削除プレビュー（変更なし）
//   bun scripts/community-ops/curate.ts resolve <reportId> --apply      # 適用して data/community.json へ書き込み
//   bun scripts/community-ops/curate.ts ... --store <path>              # 対象ファイル変更（既定 data/community.json）
//
// 削除時の挙動（クライアント側 recomputeFromReviews と同じ意味論）:
//   - コミュニティ施設: 残レビューの「清潔さ次元」平均で cleanlinessScore/grade、
//     総合次元の平均で overallScore を独立再計算（rating 平均は使わない）。0件に
//     なったら設備推定値（equipmentScore/equipmentGrade）へ戻し overallScore と
//     lastCleaned を削除。
//   - 外部施設（osm-*/google-*/od-*）: スコアは施設側に保持されないため配列からの除去のみ。
//   - 対象レビューを指す全 report（兄弟通報含む）を削除。helpfulVotes / reviewKeys も掃除。
// 書き込みはサーバーと同じ compact JSON（JSON.stringify のまま）で、将来のサーバー書き込みと
// 差分ノイズが出ないようにする。プライバシー: ipHash 等のハッシュ値は一切出力しない。
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { gradeForScore } from "../../src/lib/scoring";

// ── 生JSON型（未知フィールドは保持しつつ、操作に必要なものだけ型を持つ） ──

export interface RawReview {
  id: string;
  userName?: string;
  /** 総合満足度（新フィールド。旧データは rating のみ） */
  overallScore?: number;
  /** 総合満足度の旧名（別名） */
  rating?: number;
  /** 便器・床の清潔さ 1-5 */
  cleanlinessScore?: number;
  odorScore?: number;
  suppliesScore?: number;
  comment?: string;
  createdAt?: string;
  [k: string]: unknown;
}

export interface RawFacility {
  id: string;
  name?: string;
  reviews?: RawReview[];
  cleanlinessScore?: unknown;
  cleanlinessGrade?: unknown;
  equipmentScore?: unknown;
  equipmentGrade?: unknown;
  reviewCount?: number;
  lastCleaned?: unknown;
  [k: string]: unknown;
}

export interface RawReport {
  id: string;
  toiletId?: string;
  reviewId?: string;
  reason?: string;
  createdAt?: string;
  [k: string]: unknown;
}

export interface RawDb {
  version?: number;
  toilets: RawFacility[];
  helpfulVotes?: Record<string, string[]>;
  reports?: RawReport[];
  reviewKeys?: Record<string, unknown>;
  externalReviews?: Record<string, RawReview[]>;
}

// ── 読み書き ──

export function parseRawDb(text: string, label: string): RawDb {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (e) {
    throw new Error(`JSONパース失敗: ${label}: ${(e as Error).message}`);
  }
  if (!parsed || typeof parsed !== "object") {
    throw new Error(`不正なDBファイル: ${label}（オブジェクトではない）`);
  }
  const p = parsed as Partial<RawDb>;
  if (!Array.isArray(p.toilets)) {
    throw new Error(`不正なDBファイル: ${label}（toilets が配列ではない）`);
  }
  return {
    version: typeof p.version === "number" ? p.version : 2,
    toilets: p.toilets,
    helpfulVotes: p.helpfulVotes ?? {},
    reports: p.reports ?? [],
    reviewKeys: p.reviewKeys ?? {},
    externalReviews: p.externalReviews ?? {},
  };
}

export async function loadRawDb(filePath: string): Promise<RawDb> {
  let text: string;
  try {
    text = await readFile(filePath, "utf-8");
  } catch (e) {
    throw new Error(`読み込み失敗: ${filePath}: ${(e as Error).message}`);
  }
  return parseRawDb(text, filePath);
}

/** サーバー（server/community.ts save()）と同じ compact 形式で書き込む */
export async function saveRawDb(filePath: string, db: RawDb): Promise<void> {
  await writeFile(filePath, JSON.stringify(db), "utf-8");
}

export function cloneDb(db: RawDb): RawDb {
  return JSON.parse(JSON.stringify(db)) as RawDb;
}

// ── レビュー位置の特定と削除 ──

export interface ReviewLocation {
  kind: "community" | "external";
  facilityId: string;
  facilityName?: string;
  /** レビューを保持する配列そのもの（削除はここを書き換える） */
  reviews: RawReview[];
}

export function locateReview(db: RawDb, reviewId: string): ReviewLocation | null {
  for (const t of db.toilets) {
    const reviews = Array.isArray(t.reviews) ? t.reviews : [];
    if (reviews.some((r) => r && r.id === reviewId)) {
      return { kind: "community", facilityId: t.id, facilityName: t.name, reviews };
    }
  }
  for (const [facilityId, revs] of Object.entries(db.externalReviews ?? {})) {
    if (Array.isArray(revs) && revs.some((r) => r && r.id === reviewId)) {
      return { kind: "external", facilityId, reviews: revs };
    }
  }
  return null;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function num(v: unknown): number | null {
  return typeof v === "number" ? v : null;
}

/** 総合満足度: overallScore ?? rating（旧データ互換） */
function overallOf(r: RawReview): number | null {
  return num(r.overallScore) ?? num(r.rating);
}

/** 清潔さ次元: cleanlinessScore ?? rating（旧データは rating を清潔さの代理にしていた） */
function cleanlinessOf(r: RawReview): number | null {
  return num(r.cleanlinessScore) ?? num(r.rating);
}

function meanOf(reviews: RawReview[], pick: (r: RawReview) => number | null): number | null {
  const vals: number[] = [];
  for (const r of reviews) {
    const v = pick(r);
    if (v !== null) vals.push(v);
  }
  if (vals.length === 0) return null;
  return round1(vals.reduce((s, n) => s + n, 0) / vals.length);
}

function scoreLabel(score: unknown, grade: unknown): string {
  if (typeof score === "number") {
    return `${score}${typeof grade === "string" ? `(${grade})` : ""}`;
  }
  return "未評価";
}

export interface RemovalPlan {
  review: RawReview;
  facilityId: string;
  facilityName?: string;
  kind: "community" | "external";
  /** 対象レビューを指す全通報（兄弟通報を含む。削除対象） */
  reportIds: string[];
  reviewsBefore: number;
  reviewsAfter: number;
  scoreBefore: number | null;
  gradeBefore?: unknown;
  scoreAfter: number | null;
  gradeAfter?: unknown;
  hadVotes: boolean;
  hadReviewKey: boolean;
}

/**
 * レビュー1件を削除して整合を取る（db をその場で書き換える）。
 * dry-run には事前に cloneDb(db) を渡すこと。見つからなければ null。
 */
export function removeReview(db: RawDb, reviewId: string): RemovalPlan | null {
  const loc = locateReview(db, reviewId);
  if (!loc) return null;
  const review = loc.reviews.find((r) => r.id === reviewId);
  if (!review) return null;

  const reports = Array.isArray(db.reports) ? db.reports : [];
  const reportIds = reports.filter((r) => r.reviewId === reviewId).map((r) => r.id);

  const t = db.toilets.find((x) => x.id === loc.facilityId);
  const scoreBefore =
    loc.kind === "community"
      ? typeof t?.cleanlinessScore === "number"
        ? t.cleanlinessScore
        : meanOf(loc.reviews, cleanlinessOf)
      : meanOf(loc.reviews, cleanlinessOf);
  const gradeBefore = loc.kind === "community" ? t?.cleanlinessGrade : undefined;
  const reviewsBefore = loc.reviews.length;

  // 配列から除去
  const idx = loc.reviews.findIndex((r) => r.id === reviewId);
  loc.reviews.splice(idx, 1);
  const reviewsAfter = loc.reviews.length;

  // コミュニティ施設: 表示スコア・グレードを次元別に再計算（0件 → 設備推定値へ戻す）
  let scoreAfter: number | null = null;
  let gradeAfter: unknown;
  if (loc.kind === "community" && t) {
    t.reviewCount = reviewsAfter;
    const remainingClean = meanOf(loc.reviews, cleanlinessOf);
    const remainingOverall = meanOf(loc.reviews, overallOf);
    if (reviewsAfter === 0) {
      t.cleanlinessScore = t.equipmentScore;
      t.cleanlinessGrade = t.equipmentGrade;
      delete t.overallScore;
      delete t.lastCleaned;
      scoreAfter = typeof t.equipmentScore === "number" ? t.equipmentScore : null;
      gradeAfter = t.equipmentGrade;
    } else {
      if (remainingClean !== null) {
        t.cleanlinessScore = remainingClean;
        t.cleanlinessGrade = gradeForScore(remainingClean);
        scoreAfter = remainingClean;
        gradeAfter = t.cleanlinessGrade;
      }
      if (remainingOverall !== null) t.overallScore = remainingOverall;
      else delete t.overallScore;
    }
  } else {
    scoreAfter = meanOf(loc.reviews, cleanlinessOf);
  }

  // 付随データの掃除
  const hadVotes = !!(db.helpfulVotes && reviewId in db.helpfulVotes);
  if (hadVotes && db.helpfulVotes) delete db.helpfulVotes[reviewId];
  const hadReviewKey = !!(db.reviewKeys && reviewId in db.reviewKeys);
  if (hadReviewKey && db.reviewKeys) delete db.reviewKeys[reviewId];

  // 対象レビューを指す通報は（兄弟含め）すべて削除
  db.reports = reports.filter((r) => r.reviewId !== reviewId);

  return {
    review,
    facilityId: loc.facilityId,
    facilityName: loc.facilityName,
    kind: loc.kind,
    reportIds,
    reviewsBefore,
    reviewsAfter,
    scoreBefore,
    gradeBefore,
    scoreAfter,
    gradeAfter,
    hadVotes,
    hadReviewKey,
  };
}

// ── 表示 ──

function oneLine(v: unknown, max = 100): string {
  if (typeof v !== "string" || !v) return "";
  const t = v.replace(/\s+/g, " ").trim();
  return t.length > max ? `${t.slice(0, max)}…` : t;
}

function fmtReview(r: RawReview): string {
  const name = typeof r.userName === "string" && r.userName.trim() ? ` ${r.userName}` : "";
  const stars = num(r.overallScore) ?? num(r.rating);
  const rating = stars !== null ? ` ★${stars}` : "";
  const at = typeof r.createdAt === "string" ? ` (${r.createdAt})` : "";
  return `${name}${rating}${at}: ${oneLine(r.comment, 120)}`.trim();
}

export function formatList(db: RawDb): string {
  const reports = Array.isArray(db.reports) ? db.reports : [];
  if (reports.length === 0) return "通報なし（未処理の通報はありません）\n";
  const out: string[] = [];
  out.push(`=== 未処理の通報 ${reports.length}件 ===`);
  for (const rp of reports) {
    const loc = locateReview(db, rp.reviewId ?? "");
    const target = loc
      ? `  対象: ${fmtReview(loc.reviews.find((r) => r.id === rp.reviewId)!)}\n` +
        `  所在: ${loc.facilityName ? `「${oneLine(loc.facilityName, 60)}」` : ""} ${loc.facilityId} (${loc.kind})`
      : "  対象レビュー: 見つかりません（すでに削除済み？）";
    out.push(
      [
        `- ${rp.id}${typeof rp.createdAt === "string" ? ` (${rp.createdAt})` : ""}`,
        target,
        `  理由: ${oneLine(rp.reason, 120) || "(なし)"}`,
      ].join("\n")
    );
  }
  out.push("");
  out.push(`対応: bun scripts/community-ops/curate.ts resolve <reportId>`);
  return out.join("\n");
}

export function formatPlan(plan: RemovalPlan, applied: boolean): string {
  const title = applied ? "=== レビュー削除を適用しました ===" : "=== レビュー削除プレビュー（dry-run・変更なし） ===";
  const kindLabel = plan.kind === "community" ? "コミュニティ施設" : "外部施設（osm-*/google-*/od-*）";
  const locName = plan.facilityName ? `「${oneLine(plan.facilityName, 60)}」 ` : "";
  const before =
    typeof plan.scoreBefore === "number"
      ? scoreLabel(plan.scoreBefore, plan.gradeBefore)
      : plan.reviewsBefore > 0
        ? `平均 ${plan.scoreBefore}`
        : "未評価";
  const after =
    typeof plan.scoreAfter === "number"
      ? scoreLabel(plan.scoreAfter, plan.gradeAfter)
      : "未評価（レビュー0件）";
  const out: string[] = [];
  out.push(title);
  out.push(`  対象レビュー: ${fmtReview(plan.review)}`);
  out.push(`  所在: ${locName}${plan.facilityId} (${kindLabel})`);
  out.push(`  削除する通報: ${plan.reportIds.length > 0 ? plan.reportIds.join(", ") : "なし"}`);
  out.push(`  helpfulVotes 掃除: ${plan.hadVotes ? "あり" : "なし"} / reviewKeys 掃除: ${plan.hadReviewKey ? "あり" : "なし"}`);
  if (plan.kind === "community") {
    out.push(
      `  スコア: 清潔度 ${before} → ${after}（レビュー ${plan.reviewsBefore}件 → ${plan.reviewsAfter}件）`
    );
  } else {
    out.push(`  レビュー ${plan.reviewsBefore}件 → ${plan.reviewsAfter}件（外部施設はスコア未保持のため除去のみ）`);
  }
  out.push("");
  if (!applied) {
    out.push(`実行する場合: bun scripts/community-ops/curate.ts resolve ${plan.reportIds[0] ?? "<reportId>"} --apply`);
  } else {
    out.push(`次の確認: bun scripts/community-ops/summarize.ts`);
    out.push(`コミット: bun scripts/community-ops/commit.ts --commit`);
  }
  return out.join("\n");
}

// ── CLI ──

function storePathFlag(): string {
  const i = process.argv.indexOf("--store");
  const v = i >= 0 ? process.argv[i + 1] : undefined;
  return (
    v ||
    process.env.COMMUNITY_STORE_PATH ||
    path.join(process.cwd(), "data", "community.json")
  );
}

function usage(): void {
  process.stdout.write(
    [
      "使い方:",
      "  bun scripts/community-ops/curate.ts list",
      "  bun scripts/community-ops/curate.ts resolve <reportId> [--apply] [--store <path>]",
      "（既定は dry-run。--apply で data/community.json へ書き込み）",
    ].join("\n") + "\n"
  );
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const cmd = args[0];
  const file = storePathFlag();
  if (cmd === "list") {
    const db = await loadRawDb(file);
    process.stdout.write(formatList(db));
    process.stdout.write("\n");
    return;
  }
  if (cmd === "resolve") {
    const reportId = args[1];
    if (!reportId || reportId.startsWith("--")) {
      process.stderr.write("エラー: reportId を指定してください\n");
      usage();
      process.exit(1);
      return;
    }
    const db = await loadRawDb(file);
    const report = (db.reports ?? []).find((r) => r.id === reportId);
    if (!report) {
      process.stderr.write(`エラー: 通報が見つかりません: ${reportId}\n`);
      process.exit(1);
      return;
    }
    const reviewId = report.reviewId;
    if (!reviewId) {
      process.stderr.write(`エラー: 通報 ${reportId} に reviewId がありません\n`);
      process.exit(1);
      return;
    }
    const apply = args.includes("--apply");
    const target = apply ? db : cloneDb(db);
    const plan = removeReview(target, reviewId);
    if (!plan) {
      process.stderr.write(
        `エラー: 対象レビュー ${reviewId} がファイル内に見つかりません（すでに削除済み？）\n`
      );
      process.exit(1);
      return;
    }
    process.stdout.write(formatPlan(plan, apply) + "\n");
    if (apply) {
      await saveRawDb(file, target);
      process.stdout.write(`保存先: ${file}\n`);
    }
    return;
  }
  process.stderr.write(`エラー: 不明なコマンド: ${cmd ?? "(なし)"}\n`);
  usage();
  process.exit(1);
}

const isMain =
  typeof process.argv[1] === "string" && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  main().catch((e: unknown) => {
    process.stderr.write(`エラー: ${(e as Error).message}\n`);
    process.exit(1);
  });
}
