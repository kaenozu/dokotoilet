import { describe, expect, it } from "vitest";
import {
  displayScore,
  filterAndSortToilets,
  matchesFilter,
  sortToiletsForDisplay,
} from "./filter";
import type { FilterState, ToiletFacility } from "../types";

const baseFilter = (over: Partial<FilterState> = {}): FilterState => ({
  dataSource: "all",
  onlyHighCleanliness: false,
  onlyWashlet: false,
  onlyMultipurpose: false,
  onlyPowderRoom: false,
  only24h: false,
  searchQuery: "",
  ...over,
});

function mk(id: string, over: Partial<ToiletFacility> = {}): ToiletFacility {
  return {
    id,
    name: "テストトイレ",
    facilityType: "公衆トイレ",
    category: "park",
    dataSource: "osm",
    lat: 35.66,
    lng: 139.7,
    address: "東京都渋谷区",
    cleanlinessGrade: "B",
    cleanlinessScore: 3.0,
    equipmentGrade: "B",
    equipmentScore: 3.0,
    subScores: { cleanliness: 3.0, odor: 3.0, supplies: 3.0, comfort: 3.0 },
    attributes: {
      hasWashlet: false,
      hasMultipurpose: false,
      hasBabyTable: false,
      hasNursingRoom: false,
      hasPowderRoom: false,
      hasOstomate: false,
      isFree: true,
      isOpen24h: false,
      hasSoap: false,
      hasAlcohol: false,
      hasPaperTowelOrDryer: false,
      toiletStyle: "western",
    },
    openingHours: "常時開放",
    description: "",
    reviewCount: 0,
    reviews: [],
    ...over,
  };
}

const evaluated = (id: string, score: number, extra: Partial<ToiletFacility> = {}) =>
  mk(id, {
    reviewCount: 3,
    cleanlinessScore: score,
    cleanlinessGrade: score >= 4.6 ? "S" : "A",
    ...extra,
  });

describe("matchesFilter", () => {
  it("keeps everything with an empty (all) filter", () => {
    const t = mk("a");
    expect(matchesFilter(t, baseFilter())).toBe(true);
  });

  it("filters by name / facilityType / floorInfo, case-insensitive", () => {
    const t = mk("a", { name: "渋谷ヒカリエ", floorInfo: "3F 南側" });
    expect(matchesFilter(t, baseFilter({ searchQuery: "ヒカリエ" }))).toBe(true);
    expect(matchesFilter(t, baseFilter({ searchQuery: "3f" }))).toBe(true);
    expect(matchesFilter(t, baseFilter({ searchQuery: "新宿" }))).toBe(false);
  });

  it("filters by data source", () => {
    const t = mk("a", { dataSource: "community" });
    expect(matchesFilter(t, baseFilter({ dataSource: "community" }))).toBe(true);
    expect(matchesFilter(t, baseFilter({ dataSource: "osm" }))).toBe(false);
  });

  it("applies equipment toggles", () => {
    const washlet = mk("a", { attributes: { ...mk("x").attributes, hasWashlet: true } });
    expect(matchesFilter(washlet, baseFilter({ onlyWashlet: true }))).toBe(true);
    expect(matchesFilter(washlet, baseFilter({ onlyMultipurpose: true }))).toBe(false);
    // 未確認(null)は「あり」フィルタに一致させない（不明を「あり」と断定しない）
    const unknown = mk("u", {
      attributes: { ...mk("x").attributes, hasWashlet: null as boolean | null },
    });
    expect(matchesFilter(unknown, baseFilter({ onlyWashlet: true }))).toBe(false);
    expect(matchesFilter(unknown, baseFilter({}))).toBe(true);
    expect(
      matchesFilter(
        mk("b", {
          attributes: { ...mk("x").attributes, hasMultipurpose: true, hasPowderRoom: true, isOpen24h: true },
        }),
        baseFilter({ onlyMultipurpose: true, onlyPowderRoom: true, only24h: true })
      )
    ).toBe(true);
  });

  it("onlyHighCleanliness keeps S/A (score >= 4.0) and drops the rest", () => {
    expect(matchesFilter(evaluated("s", 4.0), baseFilter({ onlyHighCleanliness: true }))).toBe(true);
    expect(matchesFilter(evaluated("a", 3.9), baseFilter({ onlyHighCleanliness: true }))).toBe(false);
  });
});

describe("displayScore", () => {
  it("uses the real review average when evaluated, else the equipment estimate", () => {
    expect(displayScore(evaluated("x", 4.2))).toBe(4.2);
    expect(displayScore(mk("y", { equipmentScore: 3.6 }))).toBe(3.6);
  });
});

describe("sortToiletsForDisplay / filterAndSortToilets", () => {
  it("puts evaluated toilets first (score desc), then unevaluated by estimate", () => {
    const toilets = [
      mk("unrated-3.4", { equipmentScore: 3.4 }),
      evaluated("rated-4.2", 4.2),
      evaluated("rated-4.8", 4.8),
      mk("unrated-4.1", { equipmentScore: 4.1 }),
    ];
    expect(sortToiletsForDisplay(toilets).map((t) => t.id)).toEqual([
      "rated-4.8",
      "rated-4.2",
      "unrated-4.1",
      "unrated-3.4",
    ]);
  });

  it("stays deterministic for equal scores (id asc)", () => {
    const toilets = [mk("z", { equipmentScore: 3.5 }), mk("a", { equipmentScore: 3.5 })];
    expect(sortToiletsForDisplay(toilets).map((t) => t.id)).toEqual(["a", "z"]);
  });

  it("filters then sorts (one combined call)", () => {
    const washletAttrs = { ...mk("x").attributes, hasWashlet: true };
    const toilets = [
      evaluated("keep-low", 3.0, { attributes: washletAttrs }), // 清潔度3.0: S・A級で除外
      evaluated("keep-high", 4.8, { attributes: washletAttrs }),
      mk("drop-unrated", { attributes: washletAttrs }), // 未評価: reviewCount 0 でも清潔度スコア条件で除外
    ];
    const out = filterAndSortToilets(
      toilets,
      baseFilter({ onlyHighCleanliness: true, onlyWashlet: true })
    );
    expect(out.map((t) => t.id)).toEqual(["keep-high"]);
  });
});
