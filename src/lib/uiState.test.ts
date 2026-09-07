import { describe, expect, it } from 'vitest';
import {
  classifyReviewResponse,
  findSelectedToilet,
  isViewportAlreadyAt,
  reviewHttpOutcome,
} from './uiState';
import { ToiletFacility } from '../types';

const toilet = (id: string, name: string): ToiletFacility => ({
  id, name, facilityType: 'public', category: 'park', dataSource: 'osm',
  lat: 35.6, lng: 139.7, address: '東京', openingHours: '常時開放', description: '', cleanlinessGrade: 'B', cleanlinessScore: 3,
  equipmentGrade: 'B', equipmentScore: 3,
  subScores: { cleanliness: 3, odor: 3, supplies: 3, comfort: 3 },
  attributes: { hasWashlet: null, hasMultipurpose: null, hasBabyTable: null, hasNursingRoom: null, hasPowderRoom: null, hasOstomate: null, isFree: null, isOpen24h: null, hasSoap: null, hasAlcohol: null, hasPaperTowelOrDryer: null, toiletStyle: null },
  reviewCount: 0, reviews: [],
});

describe('classifyReviewResponse with canonical facilityId', () => {
  it('accepts a server response whose canonical facilityId matches a decomposed request id', async () => {
    // 分解型（ハングル Jamo）で投稿したが、サーバーは正準形（合成済み）を返す（PR #64）
    const rawId = 'google-\u1100\u1161';
    const canonicalId = 'google-\uAC00';
    const body = { facilityId: canonicalId, reviews: [{ id: 'r1' }] };
    const res = new Response(JSON.stringify(body), {
      status: 201,
      headers: { 'content-type': 'application/json' },
    });
    const result = await classifyReviewResponse(res, rawId);
    expect(result.kind).toBe('server-external');
  });

  it('still rejects a facilityId that does not match canonically', async () => {
    const body = { facilityId: 'od-別の施設', reviews: [{ id: 'r1' }] };
    const res = new Response(JSON.stringify(body), {
      status: 201,
      headers: { 'content-type': 'application/json' },
    });
    const result = await classifyReviewResponse(res, 'od-未知の施設');
    expect(result.kind).toBe('invalid');
  });
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

  it('accepts a structured 201 community response and returns the server snapshot', async () => {
    const serverToilet = toilet('a', 'server');
    const result = await classifyReviewResponse(
      new Response(JSON.stringify({ toilet: serverToilet }), {
        status: 201,
        headers: { 'content-type': 'application/json' },
      }),
      'a'
    );
    expect(result).toEqual({ kind: 'server-toilet', toilet: serverToilet });
  });

  it('recognizes a static host HTML response as local-only fallback', async () => {
    const result = await classifyReviewResponse(
      new Response('<!doctype html><html><body>app</body></html>', {
        status: 200,
        headers: { 'content-type': 'text/html' },
      }),
      'a'
    );
    expect(result.kind).toBe('local');
  });

  it.each([
    [204, ''],
    [200, '{broken'],
  ])('rejects HTTP %s without silently accepting a review', async (status, body) => {
    const result = await classifyReviewResponse(
      new Response(status === 204 ? null : body, { status, headers: { 'content-type': 'application/json' } }),
      'a'
    );
    expect(result.kind).toBe('invalid');
  });

  it.each([400, 404, 409, 429])('keeps explicit HTTP %s API rejection', async (status) => {
    const result = await classifyReviewResponse(
      new Response(JSON.stringify({ error: '拒否理由' }), {
        status,
        headers: { 'content-type': 'application/json' },
      }),
      'a'
    );
    expect(result).toEqual({ kind: 'rejected', message: '投稿できませんでした: 拒否理由' });
  });
});
