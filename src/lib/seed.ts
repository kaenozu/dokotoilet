import type { ToiletFacility } from "../types";

function toRad(d: number): number {
  return (d * Math.PI) / 180;
}

export interface AreaGuard {
  center: [number, number];
  maxKm: number;
}

/** 同名異地の誤配置防止（例：中央公園→NY）。範囲外は false */
export function passesGuard(lat: number, lng: number, guard?: AreaGuard): boolean {
  if (!guard) return true;
  return haversineM(lat, lng, guard.center[0], guard.center[1]) / 1000 <= guard.maxKm;
}

/** 2点間の距離（m）。シード重複排除用 */
export function haversineM(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

const UNION_BOOL_KEYS = [
  "hasWashlet",
  "hasMultipurpose",
  "hasBabyTable",
  "hasNursingRoom",
  "hasPowderRoom",
  "hasOstomate",
  "isFree",
  "isOpen24h",
  "hasSoap",
  "hasAlcohol",
  "hasPaperTowelOrDryer",
] as const;

/**
 * シードリストの結合。primary を優先し、secondary 側で primary のいずれかと
 * radiusM 以内にあるものは重複として落とす（例：OSMとGoogleの同一施設）。
 * ただし設備フラグは両者のORを残す（どちらかが確認した設備は活かす）。
 */
export function mergeSeedLists(
  primary: ToiletFacility[],
  secondary: ToiletFacility[],
  radiusM = 30
): ToiletFacility[] {
  const merged: ToiletFacility[] = [...primary];
  for (const cand of secondary) {
    const dup = merged.find(
      (m) => haversineM(m.lat, m.lng, cand.lat, cand.lng) <= radiusM
    );
    if (!dup) {
      merged.push(cand);
      continue;
    }
    const dupAttrs = (dup.attributes ?? {}) as any;
    const candAttrs = (cand.attributes ?? {}) as any;
    for (const k of UNION_BOOL_KEYS) {
      dupAttrs[k] = Boolean(dupAttrs[k] || candAttrs[k]);
    }
    if (!dup.attributes) dup.attributes = dupAttrs;
  }
  return merged;
}
