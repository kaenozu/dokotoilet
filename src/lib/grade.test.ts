import { describe, expect, it } from 'vitest';
import {
  displayGrade,
  evaluationKind,
  evaluationKindLabel,
  facilityTypeForCategory,
  getGradeColor,
  isEvaluated,
} from './grade';

describe('isEvaluated', () => {
  it('is true only when reviewCount is positive', () => {
    expect(isEvaluated({ reviewCount: 0 })).toBe(false);
    expect(isEvaluated({ reviewCount: 1 })).toBe(true);
    expect(isEvaluated(undefined)).toBe(false);
    expect(isEvaluated(null)).toBe(false);
  });
});

describe('evaluationKind', () => {
  it('distinguishes measured / survey / estimated', () => {
    expect(evaluationKind({ reviewCount: 2 })).toBe('measured');
    expect(
      evaluationKind({ reviewCount: 0, dataSource: 'google', externalReviewCount: 114 })
    ).toBe('survey');
    expect(
      evaluationKind({ reviewCount: 0, dataSource: 'google', externalReviewCount: 0 })
    ).toBe('estimated');
    expect(
      evaluationKind({ reviewCount: 0, dataSource: 'opendata' })
    ).toBe('estimated');
    expect(evaluationKind(undefined)).toBe('estimated');
  });

  it('labels each kind distinctly from measured grades', () => {
    expect(evaluationKindLabel('measured')).toBe('実測');
    expect(evaluationKindLabel('survey')).toBe('調査');
    expect(evaluationKindLabel('estimated')).toBe('推定');
  });
});

describe('displayGrade', () => {
  const base = {
    reviewCount: 0,
    dataSource: 'opendata',
    cleanlinessGrade: 'A' as const,
    cleanlinessScore: 4.5,
    equipmentGrade: 'B' as const,
    equipmentScore: 3.4,
  };
  it('uses measured values when reviews exist', () => {
    expect(displayGrade({ ...base, reviewCount: 3 })).toEqual({
      grade: 'A',
      score: 4.5,
      kind: 'measured',
    });
  });
  it('uses the manual survey score for google seeds', () => {
    expect(
      displayGrade({ ...base, dataSource: 'google', externalReviewCount: 114 })
    ).toEqual({ grade: 'A', score: 4.5, kind: 'survey' });
  });
  it('falls back to the equipment estimate otherwise', () => {
    expect(displayGrade(base)).toEqual({ grade: 'B', score: 3.4, kind: 'estimated' });
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
