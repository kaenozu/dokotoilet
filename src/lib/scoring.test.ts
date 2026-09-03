import { describe, expect, it } from 'vitest';
import { gradeForScore } from './scoring';

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
