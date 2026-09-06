import { describe, expect, it } from 'vitest';
import { canSubmitReview, isValidComment, isValidScore } from './reviewForm';

describe('isValidScore', () => {
  it('accepts integers 1..5 only', () => {
    for (const v of [1, 2, 3, 4, 5]) expect(isValidScore(v)).toBe(true);
  });

  it('rejects out-of-range, fractional and non-number values', () => {
    for (const v of [0, 6, 3.5, -1, NaN, null, '4']) {
      expect(isValidScore(v)).toBe(false);
    }
  });
});

describe('isValidComment', () => {
  it('rejects empty and whitespace-only comments', () => {
    expect(isValidComment('')).toBe(false);
    expect(isValidComment('   ')).toBe(false);
  });

  it('accepts non-empty comments within 600 chars', () => {
    expect(isValidComment('清潔で快適でした')).toBe(true);
    expect(isValidComment('あ'.repeat(600))).toBe(true);
  });

  it('rejects comments longer than 600 chars', () => {
    expect(isValidComment('あ'.repeat(601))).toBe(false);
  });
});

describe('canSubmitReview', () => {
  it('requires an explicitly selected rating (no default)', () => {
    expect(canSubmitReview(null, '良い')).toBe(false);
    expect(canSubmitReview(5, '良い')).toBe(true);
  });

  it('requires a valid comment even when rated', () => {
    expect(canSubmitReview(4, '')).toBe(false);
    expect(canSubmitReview(4, '   ')).toBe(false);
  });
});
