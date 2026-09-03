import type { CleanlinessGrade } from '../types';

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
