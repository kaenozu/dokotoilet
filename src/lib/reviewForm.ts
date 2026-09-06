import type { ToiletReview } from '../types';

/** 1〜5 の整数スコアか（フォームの星星・スライダー入力値を検証） */
export const isValidScore = (v: unknown): v is number =>
  Number.isInteger(v) && (v as number) >= 1 && (v as number) <= 5;

/**
 * 口コミ本文が投稿可能か（1〜600文字。サーバー validateReviewInput と同じ上限）。
 */
export const isValidComment = (comment: string): boolean => {
  const trimmed = comment.trim();
  return trimmed.length > 0 && trimmed.length <= 600;
};

/**
 * 送信可能条件: 総合満足度が明示選択済み、かつ本文が有効。
 * スコアの初期値を持たせず、総合満足度が未選択のままの「惰性満点投稿」を防ぐ。
 */
export const canSubmitReview = (rating: number | null, comment: string): boolean =>
  rating !== null && isValidComment(comment);
