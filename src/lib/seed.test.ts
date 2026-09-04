import { describe, expect, it } from "vitest";
import { haversineM, mergeSeedLists, passesGuard } from "./seed";
import type { ToiletFacility } from "../types";

const mk = (id: string, lat: number, lng: number): ToiletFacility =>
  ({ id, lat, lng, reviewCount: 0 } as ToiletFacility);

describe("haversineM", () => {
  it("is ~0 for the same point and ~sane for Shibuya", () => {
    expect(haversineM(35.66, 139.7, 35.66, 139.7)).toBe(0);
    // 渋谷駅〜神宮通公園は約500m
    const d = haversineM(35.659, 139.7006, 35.6642, 139.7021);
    expect(d).toBeGreaterThan(400);
    expect(d).toBeLessThan(700);
  });
});

describe("passesGuard", () => {
  it("rejects homonym misplacements", () => {
    const kumagaya = { center: [36.1477, 139.3889] as [number, number], maxKm: 12 };
    expect(passesGuard(36.14, 139.39, kumagaya)).toBe(true);
    expect(passesGuard(40.7827725, -73.9653627, kumagaya)).toBe(false); // NYの中央公園
    expect(passesGuard(0, 0, undefined)).toBe(true);
  });
});

describe("mergeSeedLists", () => {
  it("prefers primary and drops nearby secondary duplicates", () => {
    const primary = [mk("google-a", 35.66, 139.7)];
    const secondary = [
      mk("osm-near", 35.66005, 139.70005), // ~7m: 重複
      mk("osm-far", 35.67, 139.71), // ~1.4km: 保持
    ];
    const merged = mergeSeedLists(primary, secondary, 30);
    expect(merged.map((t) => t.id)).toEqual(["google-a", "osm-far"]);
  });

  it("unions equipment flags on duplicates", () => {
    const primary = [
      { ...mk("google-a", 35.66, 139.7), attributes: { hasWashlet: false, hasOstomate: false } },
    ];
    const secondary = [
      { ...mk("osm-a", 35.66, 139.7), attributes: { hasWashlet: true, hasOstomate: true } },
    ];
    const merged = mergeSeedLists(primary as any, secondary as any, 30);
    expect(merged).toHaveLength(1);
    expect(merged[0].id).toBe("google-a");
    expect(merged[0].attributes.hasWashlet).toBe(true);
    expect(merged[0].attributes.hasOstomate).toBe(true);
  });
});
