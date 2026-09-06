import { describe, expect, it } from 'vitest';
import { findSelectedToilet, isViewportAlreadyAt, reviewHttpOutcome } from './uiState';
import { ToiletFacility } from '../types';

const toilet = (id: string, name: string): ToiletFacility => ({
  id, name, facilityType: 'public', category: 'park', dataSource: 'osm',
  lat: 35.6, lng: 139.7, address: '東京', openingHours: '常時開放', description: '', cleanlinessGrade: 'B', cleanlinessScore: 3,
  equipmentGrade: 'B', equipmentScore: 3,
  subScores: { cleanliness: 3, odor: 3, supplies: 3, comfort: 3 },
  attributes: { hasWashlet: null, hasMultipurpose: null, hasBabyTable: null, hasNursingRoom: null, hasPowderRoom: null, hasOstomate: null, isFree: null, isOpen24h: null, hasSoap: null, hasAlcohol: null, hasPaperTowelOrDryer: null, toiletStyle: null },
  reviewCount: 0, reviews: [],
});

describe('UI state behavior', () => {
  it('resolves the selected facility from its current ID after list replacement', () => {
    const current = toilet('a', '更新後');
    expect(findSelectedToilet([current], 'a')?.name).toBe('更新後');
  });

  it('does not re-fly the map when viewport state already matches', () => {
    expect(isViewportAlreadyAt({ lat: 35.66, lng: 139.7, zoom: 16 }, { lat: 35.66, lng: 139.7, zoom: 16 })).toBe(true);
    expect(isViewportAlreadyAt({ lat: 35.66, lng: 139.7, zoom: 15 }, { lat: 35.66, lng: 139.7, zoom: 16 })).toBe(false);
  });

  it.each([400, 404, 409, 429])('treats HTTP %s as rejected', (status) => {
    expect(reviewHttpOutcome(status)).toBe('rejected');
  });
});
