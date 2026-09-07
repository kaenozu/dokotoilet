import type { ToiletReview } from '../types';
import {
  TEXT_FIELDS,
  validateFallbackText,
  validateOptionalText,
  validateRequiredText,
} from './textPolicy';

/** 1〜5 の整数スコアか（フォームの星星・スライダー入力値を検証） */
export const isValidScore = (v: unknown): v is number =>
  Number.isInteger(v) && (v as number) >= 1 && (v as number) <= 5;

/**
 * サーバー textPolicy と同じ判定をクライアントで先回りして行う（事前バリデーション）。
 * エラーコードはサーバーの 400 レスポンスと同じ文字列なので、送信前に弾けたら
 * サーバーも必ず同じ判定をする（二重実装の再分裂は tripwire テストで検知）。
 */

/** サーバーのエラーコード → フォーム内に表示する日本語 copy */
const FEEDBACK_COPY: Record<string, string> = {
  'invalid comment': '口コミを入力してください',
  'comment must not contain URLs': '口コミにURLは含められません',
  'invalid userName': `ニックネームは${TEXT_FIELDS.userName.max}文字以内にしてください`,
  'invalid name': '施設名を入力してください',
  'name must not contain URLs': '施設名にURLは含められません',
  'invalid address': '住所にURLは含められません',
  'address must not contain URLs': '住所にURLは含められません',
  'invalid floorInfo': 'フロア・場所情報にURLは含められません',
  'floorInfo must not contain URLs': 'フロア・場所情報にURLは含められません',
  'invalid description': '説明にURLは含められません',
  'description must not contain URLs': '説明にURLは含められません',
};

export const feedbackCopy = (serverError: string): string =>
  FEEDBACK_COPY[serverError] ?? serverError;

/** 口コミ本文の事前検証。問題なければ null、あれば日本語 copy を返す。 */
export const commentFeedback = (comment: string): string | null => {
  const r = validateRequiredText(comment, TEXT_FIELDS.comment);
  // non-strict tsconfig では ok の truthy チェックが判別子を窄めないため === false
  return r.ok === false ? feedbackCopy(r.error) : null;
};

/** ニックネームの事前検証（30文字上限。不可視のみはサーバー側で匿名フォールバック） */
export const userNameFeedback = (userName: string): string | null => {
  if (userName === '') return null; // 任意欄。空なら匿名フォールバック
  const r = validateFallbackText(userName, TEXT_FIELDS.userName);
  return r.ok === false ? feedbackCopy(r.error) : null;
};

/**
 * 口コミ本文が投稿可能か（textPolicy の comment ポリシー準拠:
 * 可視本文あり・URL を含まない・上限文字数以内）。
 */
export const isValidComment = (comment: string): boolean =>
  commentFeedback(comment) === null;

/**
 * 送信可能条件: 総合満足度が明示選択済み、かつ本文が有効。
 * スコアの初期値を持たせず、総合満足度が未選択のままの「惰性満点投稿」を防ぐ。
 */
export const canSubmitReview = (rating: number | null, comment: string): boolean =>
  rating !== null && isValidComment(comment);

/**
 * 施設登録フォームの事前検証。最初に見つかった問題の日本語 copy、なければ null。
 * サーバー validateToiletInput と同じポリシー（TEXT_FIELDS）で判定する。
 */
export const toiletFormFeedback = (fields: {
  name: string;
  address: string;
  floorInfo: string;
  description: string;
}): string | null => {
  const nameR = validateRequiredText(fields.name, TEXT_FIELDS.toiletName);
  if (nameR.ok === false) return feedbackCopy(nameR.error);
  const addressR = validateFallbackText(fields.address, TEXT_FIELDS.toiletAddress);
  if (addressR.ok === false) return feedbackCopy(addressR.error);
  const floorR = validateOptionalText(fields.floorInfo, TEXT_FIELDS.toiletFloorInfo);
  if (floorR.ok === false) return feedbackCopy(floorR.error);
  const descR = validateFallbackText(fields.description, TEXT_FIELDS.toiletDescription);
  if (descR.ok === false) return feedbackCopy(descR.error);
  return null;
};
