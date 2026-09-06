import type { ToiletFacility } from '../types';
import {
  isTypedOsmAliasUnambiguous,
  legacyOsmIdForTyped,
} from './osmIds';

export interface MergeOsmBatchResult {
  facilities: ToiletFacility[];
  /** 今回のバッチで新規追加・移行された件数（既存のみなら 0） */
  addedCount: number;
}

/**
 * OSM 取得バッチを既存リストへマージする純関数。
 * - 型付き新ID（osm-node-N 等）が既存ならスキップ
 * - 旧ID（osm-N）の施設が一意に対応するときは新IDへ移行（レビュー・共有レビューを引き継ぐ）
 * - 近接座標（≈30m）の重複は追加しない
 *
 * overlayShared は「その施設の共有レビュー（externalReviews）」を返すコールバックで、
 * 移行・追加時にレイヤー側（App）が自分の文脈でレビューを重ねるために使う。
 */
export function mergeOsmBatch(
  existing: ToiletFacility[],
  incoming: ToiletFacility[],
  overlayShared?: (facility: ToiletFacility) => ToiletFacility
): MergeOsmBatchResult {
  const next = [...existing];
  const existingIds = new Set(next.map((t) => t.id));
  const knownTypedIds = [...next.map((t) => t.id), ...incoming.map((t) => t.id)];
  let addedCount = 0;

  for (const item of incoming) {
    if (existingIds.has(item.id)) continue;

    // 旧ID（osm-N）が同じ実体を指すなら新IDへ移行（型付きIDが一意な場合のみ）
    const legacyId = legacyOsmIdForTyped(item.id);
    const legacyIndex = legacyId ? next.findIndex((p) => p.id === legacyId) : -1;
    if (
      legacyIndex >= 0 &&
      legacyId &&
      isTypedOsmAliasUnambiguous(item.id, knownTypedIds)
    ) {
      next[legacyIndex] = overlayShared ? overlayShared(item) : item;
      existingIds.delete(legacyId);
      existingIds.add(item.id);
      addedCount += 1;
      continue;
    }

    // 近接座標の重複は追加しない（緯度経度差 < 0.0003 ≈ 30m 以内）
    const isDuplicateCoord = next.some(
      (p) => Math.abs(p.lat - item.lat) < 0.0003 && Math.abs(p.lng - item.lng) < 0.0003
    );
    if (!isDuplicateCoord) {
      next.push(overlayShared ? overlayShared(item) : item);
      existingIds.add(item.id);
      addedCount += 1;
    }
  }

  return { facilities: next, addedCount };
}
