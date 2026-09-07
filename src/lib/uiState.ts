import { ToiletFacility, ToiletReview } from '../types';
import { canonicalizeExternalFacilityId } from './facilityIds';

export const findSelectedToilet = (
  toilets: ToiletFacility[],
  selectedToiletId: string | null
) => toilets.find((toilet) => toilet.id === selectedToiletId) ?? null;

export const isViewportAlreadyAt = (
  current: { lat: number; lng: number; zoom: number },
  target: { lat: number; lng: number; zoom: number }
) =>
  Math.abs(current.lat - target.lat) < 0.000001 &&
  Math.abs(current.lng - target.lng) < 0.000001 &&
  Math.abs(current.zoom - target.zoom) < 0.01;

export const reviewHttpOutcome = (status: number) =>
  status >= 200 && status < 300 ? 'accepted' : 'rejected';

/** uiState内の軽量バリデータ（App.tsxとの循環import回避のためここで定義）。 */
export const isToiletFacilityLike = (v: unknown): v is ToiletFacility => {
  if (!v || typeof v !== 'object') return false;
  const t = v as Record<string, unknown>;
  return (
    typeof t.id === 'string' &&
    typeof t.lat === 'number' &&
    Number.isFinite(t.lat) &&
    typeof t.lng === 'number' &&
    Number.isFinite(t.lng)
  );
};

export const sanitizeReviewsLike = (v: unknown): ToiletReview[] | null => {
  if (!Array.isArray(v)) return null;
  const out: ToiletReview[] = [];
  for (const r of v) {
    if (!r || typeof r !== 'object') return null;
    const rr = r as Record<string, unknown>;
    if (typeof rr.id !== 'string') return null;
    out.push(r as ToiletReview);
  }
  return out;
};

export type ReviewResponseOutcome =
  | { kind: 'server-toilet'; toilet: ToiletFacility }
  | { kind: 'server-external'; facilityId: string; reviews: ToiletReview[] }
  | { kind: 'local'; message: string }
  | { kind: 'rejected'; message: string }
  | { kind: 'invalid'; message: string };

const isHtmlResponse = (res: Response, body: string) => {
  const contentType = res.headers.get('content-type')?.toLowerCase() ?? '';
  return contentType.includes('text/html') || /^\s*(<!doctype\s+html|<html[\s>])/i.test(body);
};

/** Classifies the review endpoint response without treating an empty/malformed success as accepted. */
export const classifyReviewResponse = async (
  res: Response,
  toiletId: string
): Promise<ReviewResponseOutcome> => {
  const body = await res.text();
  let data: unknown = null;
  if (body.trim()) {
    try {
      data = JSON.parse(body);
    } catch {
      if (res.ok && isHtmlResponse(res, body)) {
        return {
          kind: 'local',
          message: 'サーバーが利用できないため、この端末のみに保存しました。',
        };
      }
      return { kind: 'invalid', message: 'サーバーから不正な応答が返りました。入力内容を保持しています。' };
    }
  }

  if (!res.ok) {
    const error =
      typeof data === 'object' && data !== null && 'error' in data && typeof data.error === 'string'
        ? data.error
        : `サーバーがHTTP ${res.status}で拒否しました`;
    return { kind: 'rejected', message: `投稿できませんでした: ${error}` };
  }

  if (typeof data === 'object' && data !== null) {
    if ('toilet' in data && data.toilet && typeof data.toilet === 'object') {
      if (!isToiletFacilityLike(data.toilet)) {
        return { kind: 'invalid', message: 'サーバーの応答に不正な施設データが含まれています。入力内容を保持しています。' };
      }
      return { kind: 'server-toilet', toilet: data.toilet };
    }
    if (
      'facilityId' in data &&
      // サーバーは正準形（NFC）の facilityId を返す（PR #64）。分解型のIDで
      // 投稿した場合も正準形が一致していれば受理とみなす。
      data.facilityId === canonicalizeExternalFacilityId(toiletId) &&
      'reviews' in data && Array.isArray(data.reviews)
    ) {
      const reviews = sanitizeReviewsLike((data as { reviews: unknown }).reviews);
      if (reviews === null) {
        return { kind: 'invalid', message: 'サーバーの応答に不正な口コミデータが含まれています。入力内容を保持しています。' };
      }
      return { kind: 'server-external', facilityId: toiletId, reviews };
    }
  }

  return { kind: 'invalid', message: 'サーバーの応答に投稿結果が含まれていません。入力内容を保持しています。' };
};
