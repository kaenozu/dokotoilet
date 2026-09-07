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
const CELL = 0.0003;

const cellKey = (lat: number, lng: number) =>
  `${Math.floor(lat / CELL)}:${Math.floor(lng / CELL)}`;

function buildSpatialGrid(list: ToiletFacility[]): Map<string, ToiletFacility[]> {
  const grid = new Map<string, ToiletFacility[]>();
  for (const t of list) {
    if (!Number.isFinite(t.lat) || !Number.isFinite(t.lng)) continue;
    const key = cellKey(t.lat, t.lng);
    const bucket = grid.get(key);
    if (bucket) bucket.push(t);
    else grid.set(key, [t]);
  }
  return grid;
}

function hasNearbyDuplicate(
  grid: Map<string, ToiletFacility[]>,
  lat: number,
  lng: number
): boolean {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
  const cx = Math.floor(lat / CELL);
  const cy = Math.floor(lng / CELL);
  for (let dx = -1; dx <= 1; dx += 1) {
    for (let dy = -1; dy <= 1; dy += 1) {
      const bucket = grid.get(`${cx + dx}:${cy + dy}`);
      if (!bucket) continue;
      for (const p of bucket) {
        if (Math.abs(p.lat - lat) < CELL && Math.abs(p.lng - lng) < CELL) {
          return true;
        }
      }
    }
  }
  return false;
}

function addToGrid(grid: Map<string, ToiletFacility[]>, t: ToiletFacility): void {
  if (!Number.isFinite(t.lat) || !Number.isFinite(t.lng)) return;
  const key = cellKey(t.lat, t.lng);
  const bucket = grid.get(key);
  if (bucket) bucket.push(t);
  else grid.set(key, [t]);
}

export function mergeOsmBatch(
  existing: ToiletFacility[],
  incoming: ToiletFacility[],
  overlayShared?: (facility: ToiletFacility) => ToiletFacility
): MergeOsmBatchResult {
  const next = [...existing];
  const existingIds = new Set(next.map((t) => t.id));
  const knownTypedIds = [...next.map((t) => t.id), ...incoming.map((t) => t.id)];
  const grid = buildSpatialGrid(next);
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
      addToGrid(grid, next[legacyIndex]);
      addedCount += 1;
      continue;
    }

    // 近接座標の重複は追加しない（緯度経度差 < 0.0003 ≈ 30m 以内。近傍9セルのみ比較）
    if (!hasNearbyDuplicate(grid, item.lat, item.lng)) {
      const resolved = overlayShared ? overlayShared(item) : item;
      next.push(resolved);
      existingIds.add(item.id);
      addToGrid(grid, resolved);
      addedCount += 1;
    }
  }

  return { facilities: next, addedCount };
}
