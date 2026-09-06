import { describe, expect, it } from 'vitest';
import { facilityTypeForCategory, getGradeColor, isEvaluated } from './grade';

describe('isEvaluated', () => {
  it('is true only when reviewCount is positive', () => {
    expect(isEvaluated({ reviewCount: 0 })).toBe(false);
    expect(isEvaluated({ reviewCount: 1 })).toBe(true);
    expect(isEvaluated(undefined)).toBe(false);
    expect(isEvaluated(null)).toBe(false);
  });
});

describe('getGradeColor', () => {
  it('returns a color set per grade and a default for unknown', () => {
    expect(getGradeColor('S').hex).toBe('#10B981');
    expect(getGradeColor('A').hex).toBe('#0284C7');
    expect(getGradeColor('B').hex).toBe('#F59E0B');
    expect(getGradeColor('C').hex).toBe('#EA580C');
    expect(getGradeColor('D').hex).toBe('#EF4444');
    expect(getGradeColor(null).label).toBe('未評価');
    expect(getGradeColor(undefined).label).toBe('未評価');
  });
});

describe('facilityTypeForCategory', () => {
  it('maps every category to its display label', () => {
    expect(facilityTypeForCategory('department')).toBe('商業施設・デパート');
    expect(facilityTypeForCategory('station')).toBe('駅・交通施設');
    expect(facilityTypeForCategory('convenience')).toBe('コンビニ');
    expect(facilityTypeForCategory('park')).toBe('公衆トイレ');
    expect(facilityTypeForCategory('hotel')).toBe('ホテル・オフィス');
    expect(facilityTypeForCategory('cafe')).toBe('カフェ・飲食店');
  });

  it('falls back to the generic label for unknown categories', () => {
    expect(facilityTypeForCategory('unknown' as never)).toBe('その他施設');
  });
});
