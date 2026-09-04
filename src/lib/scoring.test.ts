import { describe, expect, it } from 'vitest';
import type { ToiletReview } from '../types';
import {
  gradeForScore,
  reviewOverallScore,
  reviewScoreFields,
  summarizeReviews,
} from './scoring';

describe('gradeForScore', () => {
  it.each([
    [5.0, 'S'],
    [4.6, 'S'],
    [4.59, 'A'],
    [4.0, 'A'],
    [3.99, 'B'],
    [3.0, 'B'],
    [2.99, 'C'],
    [2.0, 'C'],
    [1.99, 'D'],
    [1.0, 'D'],
  ])('score %s -> grade %s', (score, expected) => {
    expect(gradeForScore(score)).toBe(expected);
  });
});

// 次元を個別に指定できるレビューフィクスチャ
const review = (
  id: string,
  dims: { overall?: number; cleanliness?: number; odor?: number; supplies?: number },
  legacy = false
): ToiletReview => ({
  id,
  userName: 'たろう',
  // legacy=true のとき overallScore を書かず rating だけにする（旧保存データの形）
  ...(legacy ? { rating: dims.overall ?? 5 } : { rating: dims.overall ?? 5, overallScore: dims.overall ?? 5 }),
  cleanlinessScore: dims.cleanliness ?? 5,
  odorScore: dims.odor ?? 5,
  suppliesScore: dims.supplies ?? 5,
  comment: 'きれいでした',
  createdAt: '2026-09-04',
  helpfulCount: 0,
});

describe('reviewOverallScore', () => {
  it('prefers overallScore and falls back to the legacy rating', () => {
    expect(reviewOverallScore({ rating: 3, overallScore: 4 })).toBe(4);
    expect(reviewOverallScore({ rating: 3 })).toBe(3);
  });
});

describe('summarizeReviews (次元別独立集計)', () => {
  it('aggregates each dimension independently and derives the grade from cleanliness', () => {
    const sum = summarizeReviews([
      review('a', { overall: 5, cleanliness: 5, odor: 4, supplies: 3 }),
      review('b', { overall: 4, cleanliness: 2, odor: 5, supplies: 5 }),
    ]);
    expect(sum).not.toBeNull();
    expect(sum!.overallScore).toBe(4.5); // (5+4)/2
    expect(sum!.cleanlinessScore).toBe(3.5); // (5+2)/2 ← 清潔さ次元のみ
    expect(sum!.odorScore).toBe(4.5);
    expect(sum!.suppliesScore).toBe(4);
    expect(sum!.cleanlinessGrade).toBe('B'); // gradeForScore(3.5)
  });

  it('falls back to rating for legacy reviews without overallScore', () => {
    const sum = summarizeReviews([
      review('a', { overall: 5, cleanliness: 5 }, true),
      review('b', { overall: 2, cleanliness: 4 }, true),
    ]);
    expect(sum!.overallScore).toBe(3.5); // rating の平均
    expect(sum!.cleanlinessScore).toBe(4.5);
  });

  it('returns null for an empty list', () => {
    expect(summarizeReviews([])).toBeNull();
  });
});

describe('reviewScoreFields (施設への適用と設備推定フォールバック)', () => {
  const fallback = { equipmentScore: 3.0, equipmentGrade: 'B' as const };

  it('maps a summary onto cleanlinessScore / cleanlinessGrade / overallScore', () => {
    const fields = reviewScoreFields(
      summarizeReviews([review('a', { overall: 4, cleanliness: 5 })]),
      fallback
    );
    expect(fields.cleanlinessScore).toBe(5);
    expect(fields.cleanlinessGrade).toBe('S');
    expect(fields.overallScore).toBe(4);
  });

  it('reverts to the equipment estimate and drops overallScore when there are no reviews', () => {
    const fields = reviewScoreFields(null, fallback);
    expect(fields).toEqual({ cleanlinessScore: 3.0, cleanlinessGrade: 'B' });
    expect(fields.overallScore).toBeUndefined();
  });
});
