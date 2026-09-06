import { describe, expect, it } from 'vitest';
import type { ToiletFacility } from '../types';
import { mergeOsmBatch } from './osmMerge';

const facility = (id: string, lat: number, lng: number): ToiletFacility =>
  ({
    id,
    name: `facility ${id}`,
    facilityType: '公衆便所',
    category: 'park',
    dataSource: 'osm',
    lat,
    lng,
    address: 'address',
    cleanlinessGrade: 'B',
    cleanlinessScore: 3.4,
    equipmentGrade: 'B',
    equipmentScore: 3.4,
    subScores: { cleanliness: 3.4, odor: 3.4, supplies: 3.4, comfort: 3.4 },
    attributes: {},
    reviewCount: 0,
    reviews: [],
  }) as ToiletFacility;

describe('mergeOsmBatch', () => {
  it('adds new facilities and reports the added count', () => {
    const existing = [facility('osm-node-1', 35.0, 139.0)];
    const incoming = [facility('osm-node-2', 35.1, 139.1)];

    const { facilities, addedCount } = mergeOsmBatch(existing, incoming);

    expect(addedCount).toBe(1);
    expect(facilities.map((t) => t.id)).toEqual(['osm-node-1', 'osm-node-2']);
  });

  it('skips facilities already present and reports addedCount 0', () => {
    const existing = [facility('osm-node-1', 35.0, 139.0)];
    const incoming = [facility('osm-node-1', 35.0, 139.0)];

    const { facilities, addedCount } = mergeOsmBatch(existing, incoming);

    expect(addedCount).toBe(0);
    expect(facilities).toHaveLength(1);
  });

  it('migrates a legacy osm-N facility to the unique typed id, keeping its position', () => {
    const existing = [facility('osm-node-1', 35.0, 139.0), facility('osm-42', 35.2, 139.2)];
    const incoming = [facility('osm-node-42', 35.2, 139.2)];

    const { facilities, addedCount } = mergeOsmBatch(existing, incoming);

    expect(addedCount).toBe(1);
    expect(facilities.map((t) => t.id)).toEqual(['osm-node-1', 'osm-node-42']);
  });

  it('does not migrate when the typed alias is ambiguous (node/way share a numeric id)', () => {
    const existing = [facility('osm-42', 35.2, 139.2)];
    const incoming = [
      facility('osm-node-42', 35.2, 139.2),
      facility('osm-way-42', 35.3, 139.3),
    ];

    const { facilities, addedCount } = mergeOsmBatch(existing, incoming);

    // osm-42 stays (ambiguity), osm-way-42 is a fresh add
    expect(addedCount).toBe(1);
    expect(facilities.map((t) => t.id)).toEqual(['osm-42', 'osm-way-42']);
  });

  it('skips near-duplicate coordinates (~30m) instead of adding', () => {
    const existing = [facility('osm-node-1', 35.0, 139.0)];
    // 0.0001 degrees ≈ 11m — within the duplicate guard
    const incoming = [facility('osm-node-9', 35.0001, 139.0001)];

    const { facilities, addedCount } = mergeOsmBatch(existing, incoming);

    expect(addedCount).toBe(0);
    expect(facilities).toHaveLength(1);
  });

  it('lets the overlay callback replace the stored facility (shared review layer)', () => {
    const existing: ToiletFacility[] = [];
    const incoming = [facility('osm-node-1', 35.0, 139.0)];
    const overlay = (t: ToiletFacility): ToiletFacility => ({
      ...t,
      name: `${t.name} (reviewed)`,
    });

    const { facilities } = mergeOsmBatch(existing, incoming, overlay);

    expect(facilities[0].name).toContain('(reviewed)');
  });

  it('does not mutate the input arrays', () => {
    const existing = [facility('osm-node-1', 35.0, 139.0)];
    const incoming = [facility('osm-node-2', 35.1, 139.1)];
    const existingSnapshot = [...existing];

    mergeOsmBatch(existing, incoming);

    expect(existing).toEqual(existingSnapshot);
  });
});
