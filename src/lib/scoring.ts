import type { CleanlinessGrade, ToiletFacility, ToiletReview } from "../types";

/**
 * スコア（1.0〜5.0）→ グレード判定の唯一の実装。
 * App / AddToiletModal / 生成スクリプトはこの関数を使うこと
 *（3箇所分散していた判定ロジックの乖離防止）。
 */
export function gradeForScore(score: number): CleanlinessGrade {
  if (score >= 4.6) return 'S';
  if (score >= 4.0) return 'A';
  if (score >= 3.0) return 'B';
  if (score >= 2.0) return 'C';
  return 'D';
}

/** 小数第1位へ丸める（口コミ集計の共通丸め） */
export function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/**
 * 口コミ1件の「総合満足度」を取り出す。overallScore が新しい正式フィールド。
 * 過去データ互換のため無ければ rating（旧名の別名）へフォールバックする。
 */
export function reviewOverallScore(r: { rating: number; overallScore?: number }): number {
  return r.overallScore ?? r.rating;
}

export interface ReviewScoreSummary {
  /** 総合満足度の平均 */
  overallScore: number;
  /** 便器・床の清潔さの平均 */
  cleanlinessScore: number;
  /** におい・換気状態の平均 */
  odorScore: number;
  /** 備品（石鹸・ペーパー・除菌）の平均 */
  suppliesScore: number;
  /** 清潔さの平均から導出するグレード */
  cleanlinessGrade: CleanlinessGrade;
}

/**
 * 口コミ一覧を「次元別」に独立して平均する（P1: スコア集計の修正）。
 * 総合→ overallScore / 清潔さ→ cleanlinessScore / におい→ odorScore /
 * 備品→ suppliesScore。グレード（cleanlinessGrade）は集計後の
 * cleanlinessScore からのみ導出する。0件なら null。
 */
export function summarizeReviews(reviews: ToiletReview[]): ReviewScoreSummary | null {
  if (reviews.length === 0) return null;
  const mean = (pick: (r: ToiletReview) => number): number =>
    round1(reviews.reduce((s, r) => s + pick(r), 0) / reviews.length);
  const cleanlinessScore = mean((r) => r.cleanlinessScore);
  return {
    overallScore: mean(reviewOverallScore),
    cleanlinessScore,
    odorScore: mean((r) => r.odorScore),
    suppliesScore: mean((r) => r.suppliesScore),
    cleanlinessGrade: gradeForScore(cleanlinessScore),
  };
}

export interface ScoreFields {
  cleanlinessScore: number;
  cleanlinessGrade: CleanlinessGrade;
  /** 口コミ0件（未評価）のときは未定義＝設備推定値表示に戻す */
  overallScore?: number;
}

/**
 * 集計結果を施設の表示フィールドへ変換する。summary が null（口コミ0件）なら
 * 従来どおり設備推定値（equipmentScore / equipmentGrade）へフォールバックし、
 * overallScore は落とす（「未評価」状態を保つ）。
 */
export function reviewScoreFields(
  summary: ReviewScoreSummary | null,
  fallback: Pick<ToiletFacility, 'equipmentScore' | 'equipmentGrade'>
): ScoreFields {
  if (!summary) {
    return {
      cleanlinessScore: fallback.equipmentScore,
      cleanlinessGrade: fallback.equipmentGrade,
      // 明示的に undefined を書いて、既存の overallScore を spread で引き継がない
      overallScore: undefined,
    };
  }
  return {
    cleanlinessScore: summary.cleanlinessScore,
    cleanlinessGrade: summary.cleanlinessGrade,
    overallScore: summary.overallScore,
  };
}
