import type { ToiletFacility, ToiletReview } from "../types";
import { reviewScoreFields, summarizeReviews } from "./scoring";

/**
 * M6: localStorage へ保存するのは「ユーザーデルタ」だけにする。
 *
 * - シード（googleSeed / kumagayaSeed / 初期OSM）は保存せず、起動時に常に最新の
 *   バンドル版シードへデルタを重ねる → シード更新が既存ユーザーにも届く
 * - サーバーが保持するデータ（community 登録トイレ・externalReviews）はデルタに含めない
 *   （サーバー同期済みレビューがローカルに残って、git運用での削除を巻き戻さないように）
 * - OSMリアルタイム取得分はユーザーデルタではなく別キーの上限付きキャッシュ（OSM_CACHE_KEY）
 */

export const LOCAL_DELTA_KEY = "kirei-toilet-delta-v1";
export const OSM_CACHE_KEY = "kirei-toilet-osm-cache-v1";
// 旧バージョン（トイレ全体スナップショット）のキー。移行後は削除する
export const LEGACY_TOILETS_V3_KEY = "toilet_cleanliness_map_real_v3";
export const LEGACY_TOILETS_V2_KEY = "toilet_cleanliness_map_real_v2";

export const OSM_CACHE_MAX = 600;

export interface LocalDeltaV1 {
  v: 1;
  /** この端末で追加登録したトイレ（サーバー未同期のオフライン登録を含む） */
  userToilets: ToiletFacility[];
  /** シード/OSM取得施設に付けたローカル口コミ（サーバー同期済みのレビューは含めない） */
  reviewDeltas: Record<string, ToiletReview[]>;
}

export function emptyDelta(): LocalDeltaV1 {
  return { v: 1, userToilets: [], reviewDeltas: {} };
}

export function isUserToiletId(id: string): boolean {
  return id.startsWith("toilet-user-");
}

// 旧ビルドのシードに含まれていた引用・自動生成レビュー（移行時・読込時に除外）
function isSeedSyntheticReview(r: ToiletReview): boolean {
  return (
    r.id.startsWith("rev-gmaps-") ||
    r.id.startsWith("rev-init-") ||
    r.userName === "Google口コミより引用"
  );
}

function cleanReviews(reviews: unknown): ToiletReview[] {
  if (!Array.isArray(reviews)) return [];
  return (reviews as ToiletReview[]).filter(
    (r) => r && typeof r.id === "string" && typeof r.rating === "number" && !isSeedSyntheticReview(r)
  );
}

/**
 * 口コミ一覧を次元別に平均して施設へ反映したものを作る（0件は設備推定値へ戻す）。
 * 総合→overallScore / 清潔さ→cleanlinessScore（グレードも清潔さから）を独立集計。
 * subScores は書き換えない（設備推定ベースライン。表示側で口コミから導出する）。
 */
export function recomputeFromReviews(
  t: ToiletFacility,
  reviews: ToiletReview[]
): ToiletFacility {
  const hadReviews = t.reviewCount > 0 || t.reviews.length > 0;
  if (reviews.length === 0) {
    return {
      ...t,
      reviews: [],
      reviewCount: 0,
      ...reviewScoreFields(null, t),
      lastCleaned: undefined,
    };
  }
  return {
    ...t,
    reviews,
    reviewCount: reviews.length,
    ...reviewScoreFields(summarizeReviews(reviews), t),
    ...(hadReviews ? {} : { lastCleaned: "たった今（利用者が確認）" }),
  };
}

/** base 優先で id 重複なしにレビューを結合（base=サーバー/既存、additions=ローカル未同期分） */
export function mergeReviewLists(
  base: ToiletReview[],
  additions: ToiletReview[]
): ToiletReview[] {
  const byId = new Map<string, ToiletReview>();
  for (const r of [...base, ...additions]) {
    // 先勝ち: base（サーバー・既存）が同一IDの重複で優先される
    if (r && typeof r.id === "string" && !byId.has(r.id)) byId.set(r.id, r);
  }
  return [...byId.values()];
}

/** ローカル未同期レビューを失わずに、サーバーのトイレ情報を正として統合する */
export function unionServerToilet(
  local: ToiletFacility,
  server: ToiletFacility
): ToiletFacility {
  const merged = mergeReviewLists(server.reviews, local.reviews);
  return recomputeFromReviews({ ...server, reviews: server.reviews }, merged);
}

/** id 重複なしに施設リストを結合（base 優先。例: シード + OSMキャッシュ） */
export function mergeFacilityLists(
  base: ToiletFacility[],
  additions: ToiletFacility[]
): ToiletFacility[] {
  const seen = new Set(base.map((t) => t.id));
  const out = [...base];
  for (const t of additions) {
    if (t && typeof t.id === "string" && !seen.has(t.id)) {
      seen.add(t.id);
      out.push(t);
    }
  }
  return out;
}

/** localStorage の生文字列 → 安全な施設配列（不正データは捨てる）。無ければ空配列 */
export function parseToiletArray(raw: string | null): ToiletFacility[] {
  if (!raw) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  return (parsed as ToiletFacility[]).filter(
    (t) =>
      t &&
      typeof t === "object" &&
      typeof (t as ToiletFacility).id === "string" &&
      typeof (t as ToiletFacility).lat === "number" &&
      typeof (t as ToiletFacility).lng === "number"
  );
}

/** 旧v3/v2（トイレ全体スナップショット）をユーザーデルタへ移行する */
export function migrateLegacyArray(parsed: unknown): LocalDeltaV1 {
  if (!Array.isArray(parsed)) return emptyDelta();
  const userToilets: ToiletFacility[] = [];
  const reviewDeltas: Record<string, ToiletReview[]> = {};
  for (const raw of parsed as ToiletFacility[]) {
    if (!raw || typeof raw !== "object") continue;
    const t = raw as ToiletFacility;
    if (typeof t.id !== "string") continue;
    const reviews = cleanReviews(t.reviews);
    if (isUserToiletId(t.id)) {
      // 追加トイレはレビューなしでも保持（オフライン追加の可能性）
      userToilets.push({ ...t, reviews, reviewCount: reviews.length });
    } else if (reviews.length > 0) {
      // シード・OSM取得施設は施設自体を保存せず、口コミ差分だけ残す
      reviewDeltas[t.id] = reviews;
    }
  }
  return { v: 1, userToilets, reviewDeltas };
}

export function parseLocalDelta(raw: string | null): LocalDeltaV1 | null {
  if (!raw) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;
  const p = parsed as Partial<LocalDeltaV1>;
  if (p.v !== 1) return null;
  if (!Array.isArray(p.userToilets)) return null;
  if (!p.reviewDeltas || typeof p.reviewDeltas !== "object") return null;
  const userToilets = p.userToilets
    .filter((t) => t && typeof t.id === "string")
    .map((t) => {
      const reviews = cleanReviews(t.reviews);
      return { ...t, reviews, reviewCount: reviews.length };
    });
  const reviewDeltas: Record<string, ToiletReview[]> = {};
  for (const [fid, revs] of Object.entries(p.reviewDeltas)) {
    const cleaned = cleanReviews(revs);
    if (cleaned.length > 0) reviewDeltas[fid] = cleaned;
  }
  return { v: 1, userToilets, reviewDeltas };
}

/**
 * 保存時: state 全体から「サーバーが保持していない差分」だけを抽出する。
 * serverKnowledge は boot のGET・投稿成功時に更新した「サーバーが持っている」情報。
 */
export interface ServerKnowledge {
  facilityIds: ReadonlySet<string>;
  reviewIdsByFacility: ReadonlyMap<string, ReadonlySet<string>>;
}

export function extractDelta(
  state: ToiletFacility[],
  server: ServerKnowledge
): LocalDeltaV1 {
  const userToilets: ToiletFacility[] = [];
  const reviewDeltas: Record<string, ToiletReview[]> = {};
  for (const t of state) {
    if (!t || typeof t.id !== "string") continue;
    if (isUserToiletId(t.id)) {
      const reviews = cleanReviews(t.reviews);
      if (!server.facilityIds.has(t.id)) {
        // サーバー未登録（オフライン追加など）→ 施設ごと保存
        userToilets.push({ ...t, reviews, reviewCount: reviews.length });
      } else {
        // サーバー登録済みでも、未同期のローカル口コミがあれば施設ごと保存して
        // オフライン投稿を失わない。同期済みレビューは含めない（git運用での
        // サーバー側削除がローカルで復活しないように）。完全同期済みなら保存しない。
        const knownSet = server.reviewIdsByFacility.get(t.id) ?? new Set<string>();
        const localOnly = reviews.filter((r) => !knownSet.has(r.id));
        if (localOnly.length > 0) {
          // ローカルのみの口コミでスコアを再計算し、表示と一貫させる
          userToilets.push(recomputeFromReviews(t, localOnly));
        }
      }
      continue;
    }
    const known = server.reviewIdsByFacility.get(t.id);
    const reviews = known && known.size > 0 ? cleanReviews(t.reviews).filter((r) => !known.has(r.id)) : cleanReviews(t.reviews);
    if (reviews.length > 0) reviewDeltas[t.id] = reviews;
  }
  return { v: 1, userToilets, reviewDeltas };
}

/** 起動時: 最新シードへユーザーデルタを重ねる（存在しない施設の差分は捨てる） */
export function applyDeltaToSeeds(
  seeds: ToiletFacility[],
  delta: LocalDeltaV1
): ToiletFacility[] {
  const byId = new Map(seeds.map((t) => [t.id, t]));
  const out = [...seeds];
  for (const ut of delta.userToilets) {
    if (!ut || typeof ut.id !== "string") continue;
    const existing = byId.get(ut.id);
    if (existing) {
      const idx = out.findIndex((t) => t.id === ut.id);
      if (idx >= 0) {
        const reviews = cleanReviews(ut.reviews);
        out[idx] = recomputeFromReviews(existing, mergeReviewLists(existing.reviews, reviews));
      }
    } else {
      byId.set(ut.id, ut);
      out.push(ut);
    }
  }
  for (const [fid, revs] of Object.entries(delta.reviewDeltas)) {
    const t = byId.get(fid);
    if (!t || revs.length === 0) continue;
    const idx = out.findIndex((x) => x.id === fid);
    if (idx >= 0) {
      const cleaned = cleanReviews(revs);
      out[idx] = recomputeFromReviews(out[idx], mergeReviewLists(out[idx].reviews, cleaned));
    }
  }
  return out;
}
