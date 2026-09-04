import type { ToiletFacility, ToiletReview } from "../types";
import { reviewOverallScore, reviewScoreFields, summarizeReviews } from "./scoring";

/**
 * サーバー保存の「外部施設レビュー」（コミュニティ未登録の osm-* / google-* / od-* 向け）を
 * クライアント側のシード/取得済み施設へ重ねる純関数。
 *
 * 規則:
 * - サーバー側を正とし、サーバーに無いレビュー（オフライン投稿等）は末尾に残す
 * - cleanlinessScore / cleanlinessGrade / overallScore / reviewCount は統合後の
 *   一覧から「次元別」に再計算する（清潔さは清潔さ次元の平均。0件になった場合は
 *   設備推定値に戻す＝未評価表示）
 * - レビューが初めて付いたタイミングで lastCleaned を立てる（表示用）
 */

/** 総合満足度の平均（overallScore ?? rating）。0件は null */
export function averageRating(reviews: { rating: number; overallScore?: number }[]): number | null {
  if (reviews.length === 0) return null;
  const total = reviews.reduce((s, r) => s + reviewOverallScore(r), 0);
  return Math.round((total / reviews.length) * 10) / 10;
}

export function overlayExternalReviews(
  toilet: ToiletFacility,
  serverReviews: ToiletReview[]
): ToiletFacility {
  // サーバーに1件も無いならローカル状態をそのまま保つ（削除系APIは未実装のため）
  if (serverReviews.length === 0) return toilet;

  const serverIds = new Set(serverReviews.map((r) => r.id));
  const localOnly = toilet.reviews.filter((r) => !serverIds.has(r.id));
  const merged = [...serverReviews, ...localOnly];
  const summary = summarizeReviews(merged); // merged.length >= 1 なので非null
  const hadReviews = toilet.reviewCount > 0 || toilet.reviews.length > 0;

  return {
    ...toilet,
    reviews: merged,
    reviewCount: merged.length,
    ...reviewScoreFields(summary, toilet),
    ...(!hadReviews ? { lastCleaned: "たった今（利用者が確認）" } : {}),
  };
}
