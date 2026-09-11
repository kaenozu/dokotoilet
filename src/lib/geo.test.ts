import { describe, it, expect } from 'vitest';
import { calculateDistanceMeters, formatDistance, formatWalkingTime } from './geo';

describe('geo utility', () => {
  it('calculates distance between two coordinates accurately', () => {
    // 渋谷ヒカリエ (35.6590, 139.7034) と 渋谷スクランブルスクエア (35.6583, 139.7022) は約130m
    const dist = calculateDistanceMeters(35.6590, 139.7034, 35.6583, 139.7022);
    expect(dist).toBeGreaterThan(100);
    expect(dist).toBeLessThan(200);

    // 同一地点は 0m
    expect(calculateDistanceMeters(35.6590, 139.7034, 35.6590, 139.7034)).toBe(0);
  });

  it('formats meters correctly', () => {
    expect(formatDistance(80)).toBe('80m');
    expect(formatDistance(950)).toBe('950m');
    expect(formatDistance(1000)).toBe('1.0km');
    expect(formatDistance(2450)).toBe('2.5km');
  });

  it('formats walking time correctly', () => {
    expect(formatWalkingTime(50)).toBe('徒歩1分');
    expect(formatWalkingTime(160)).toBe('徒歩2分');
    expect(formatWalkingTime(800)).toBe('徒歩10分');
  });
});
