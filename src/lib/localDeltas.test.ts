import { describe, expect, it } from "vitest";
import type { ToiletFacility, ToiletReview } from "../types";
import {
  applyDeltaToSeeds,
  emptyDelta,
  extractDelta,
  mergeFacilityLists,
  mergeReviewLists,
  migrateLegacyArray,
  parseLocalDelta,
  parseToiletArray,
  recomputeFromReviews,
  unionServerToilet,
  type ServerKnowledge,
} from "./localDeltas";

const mkSeed = (id: string, over: Partial<ToiletFacility> = {}): ToiletFacility => ({
  id,
  name: `seed-${id}`,
  facilityType: "公衆トイレ",
  category: "park",
  dataSource: "osm",
  lat: 35.66,
  lng: 139.7,
  address: "東京都",
  cleanlinessGrade: "B",
  cleanlinessScore: 3.0,
  equipmentGrade: "B",
  equipmentScore: 3.0,
  subScores: { cleanliness: 3.0, odor: 3.0, supplies: 3.0, comfort: 3.0 },
  attributes: {
    hasWashlet: false, hasMultipurpose: false, hasBabyTable: false,
    hasNursingRoom: false, hasPowderRoom: false, hasOstomate: false,
    isFree: true, isOpen24h: false, hasSoap: false, hasAlcohol: false,
    hasPaperTowelOrDryer: false, toiletStyle: "western",
  },
  openingHours: "常時開放",
  description: "",
  reviewCount: 0,
  reviews: [],
  ...over,
});

const mkReview = (id: string, rating: number, userName = "たろう"): ToiletReview => ({
  id,
  userName,
  rating,
  cleanlinessScore: rating,
  odorScore: rating,
  suppliesScore: rating,
  comment: "きれいでした",
  createdAt: "2026-09-04",
  helpfulCount: 0,
});

const emptyServer: ServerKnowledge = {
  facilityIds: new Set<string>(),
  reviewIdsByFacility: new Map<string, ReadonlySet<string>>(),
};

describe("migrateLegacyArray", () => {
  it("extracts user toilets and review deltas, dropping seed copies", () => {
    const legacy = [
      mkSeed("osm-1"), // シード（口コミなし）→ 破棄
      mkSeed("google-9", { reviews: [mkReview("rev-gmaps-x", 5, "Google口コミより引用")], reviewCount: 1 }), // 引用のみ → 差分なし
      mkSeed("osm-2", { reviews: [mkReview("rev-local-1", 4)], reviewCount: 1 }), // 実ユーザー口コミ → 差分に残る
      mkSeed("toilet-user-1", {
        id: "toilet-user-1",
        dataSource: "community",
        reviews: [mkReview("rev-init-old", 4, "情報登録者")], // 自動生成初期レビューも除く
        reviewCount: 1,
      } as ToiletFacility),
    ];
    const delta = migrateLegacyArray(legacy);
    expect(delta.v).toBe(1);
    expect(delta.userToilets.map((t) => t.id)).toEqual(["toilet-user-1"]);
    expect(delta.userToilets[0].reviews).toEqual([]);
    expect(Object.keys(delta.reviewDeltas)).toEqual(["osm-2"]);
    expect(delta.reviewDeltas["osm-2"].map((r) => r.id)).toEqual(["rev-local-1"]);
  });

  it("returns empty delta for non-array / garbage", () => {
    expect(migrateLegacyArray(null)).toEqual(emptyDelta());
    expect(migrateLegacyArray({ a: 1 })).toEqual(emptyDelta());
  });
});

describe("parseLocalDelta", () => {
  it("parses a valid delta", () => {
    const delta = {
      v: 1,
      userToilets: [mkSeed("toilet-user-1")],
      reviewDeltas: { "osm-2": [mkReview("r1", 5)] },
    };
    const parsed = parseLocalDelta(JSON.stringify(delta));
    expect(parsed).not.toBeNull();
    expect(parsed!.userToilets.map((t) => t.id)).toEqual(["toilet-user-1"]);
    expect(parsed!.reviewDeltas["osm-2"]).toHaveLength(1);
  });

  it("rejects malformed / wrong-version data and strips synthetic reviews", () => {
    expect(parseLocalDelta(null)).toBeNull();
    expect(parseLocalDelta("not json")).toBeNull();
    expect(parseLocalDelta(JSON.stringify({ v: 99 }))).toBeNull();
    const withQuotes = parseLocalDelta(
      JSON.stringify({
        v: 1,
        userToilets: [],
        reviewDeltas: { "osm-1": [mkReview("rev-gmaps-1", 5, "Google口コミより引用")] },
      })
    );
    expect(withQuotes!.reviewDeltas["osm-1"]).toBeUndefined();
  });
});

describe("parseToiletArray", () => {
  it("returns [] for missing / invalid data and filters bad items", () => {
    expect(parseToiletArray(null)).toEqual([]);
    expect(parseToiletArray("garbage")).toEqual([]);
    const ok = parseToiletArray(JSON.stringify([mkSeed("a"), { id: "no-lat" }]));
    expect(ok.map((t) => t.id)).toEqual(["a"]);
  });
});

describe("extractDelta", () => {
  it("keeps only local (unsynced) reviews and local-only user toilets", () => {
    const state = [
      mkSeed("osm-1", { reviews: [mkReview("r-srv", 5), mkReview("r-local", 3)], reviewCount: 2 }),
      mkSeed("toilet-user-9", {
        id: "toilet-user-9",
        dataSource: "community",
        reviews: [mkReview("r-offline", 4)],
        reviewCount: 1,
      }),
      mkSeed("toilet-user-8", {
        id: "toilet-user-8",
        dataSource: "community",
        reviews: [mkReview("r-srv3", 4)],
        reviewCount: 1,
      }),
      mkSeed("osm-2", { reviews: [mkReview("r-srv2", 4)], reviewCount: 1 }),
    ];
    const server: ServerKnowledge = {
      facilityIds: new Set(["toilet-user-9", "toilet-user-8"]),
      reviewIdsByFacility: new Map([
        ["osm-1", new Set(["r-srv"])],
        ["osm-2", new Set(["r-srv2"])],
        ["toilet-user-9", new Set()], // サーバー側には r-offline が無い
        ["toilet-user-8", new Set(["r-srv3"])],
      ]),
    };
    const delta = extractDelta(state, server);
    // サーバー登録済みで未同期のオフライン口コミがある施設だけをローカルに残す
    expect(delta.userToilets.map((t) => t.id)).toEqual(["toilet-user-9"]);
    expect(delta.userToilets[0].reviews.map((r) => r.id)).toEqual(["r-offline"]);
    expect(delta.userToilets[0].reviewCount).toBe(1);
    expect(delta.userToilets[0].cleanlinessScore).toBe(4);
    expect(delta.reviewDeltas["osm-1"].map((r) => r.id)).toEqual(["r-local"]);
    expect(delta.reviewDeltas["osm-2"]).toBeUndefined();
  });

  it("drops a fully-synced community toilet (no local extras)", () => {
    const state = [
      mkSeed("toilet-user-7", {
        id: "toilet-user-7",
        dataSource: "community",
        reviews: [mkReview("r-srv", 4)],
        reviewCount: 1,
      }),
    ];
    const server: ServerKnowledge = {
      facilityIds: new Set(["toilet-user-7"]),
      reviewIdsByFacility: new Map([["toilet-user-7", new Set(["r-srv"])]]),
    };
    const delta = extractDelta(state, server);
    expect(delta.userToilets).toEqual([]);
    expect(delta.reviewDeltas).toEqual({});
  });

  it("keeps a user toilet when the server does not know it", () => {
    const state = [
      mkSeed("toilet-user-1", {
        id: "toilet-user-1",
        dataSource: "community",
        reviews: [mkReview("r", 4)],
        reviewCount: 1,
      }),
    ];
    const delta = extractDelta(state, emptyServer);
    expect(delta.userToilets.map((t) => t.id)).toEqual(["toilet-user-1"]);
    expect(delta.userToilets[0].reviews).toHaveLength(1);
  });
});

describe("applyDeltaToSeeds", () => {
  it("merges deltas onto fresh seeds and ignores deltas for missing facilities", () => {
    const seeds = [mkSeed("osm-1"), mkSeed("osm-2")];
    const delta = {
      v: 1 as const,
      userToilets: [mkSeed("toilet-user-1", { id: "toilet-user-1" })],
      reviewDeltas: {
        "osm-1": [mkReview("r1", 5)],
        "osm-gone": [mkReview("rg", 1)], // シードに無い施設 → 捨てる
      },
    };
    const out = applyDeltaToSeeds(seeds, delta);
    expect(out.map((t) => t.id)).toEqual(["osm-1", "osm-2", "toilet-user-1"]);
    const osm1 = out.find((t) => t.id === "osm-1")!;
    expect(osm1.reviewCount).toBe(1);
    expect(osm1.cleanlinessScore).toBe(5);
    expect(osm1.cleanlinessGrade).toBe("S");
    expect(out.some((t) => t.id === "osm-gone")).toBe(false);
  });
});

describe("merge / recompute helpers", () => {
  it("mergeReviewLists dedupes by id with base priority", () => {
    const base = [mkReview("a", 5)];
    const merged = mergeReviewLists(base, [mkReview("a", 1), mkReview("b", 3)]);
    expect(merged.map((r) => r.id)).toEqual(["a", "b"]);
    expect(merged[0].rating).toBe(5); // base 優先
  });

  it("recomputeFromReviews computes avg/grade and resets to estimate when empty", () => {
    const t = mkSeed("s");
    const withRev = recomputeFromReviews(t, [mkReview("a", 5), mkReview("b", 4)]);
    expect(withRev.reviewCount).toBe(2);
    expect(withRev.cleanlinessScore).toBe(4.5);
    expect(withRev.cleanlinessGrade).toBe("A");
    const reset = recomputeFromReviews(withRev, []);
    expect(reset.reviewCount).toBe(0);
    expect(reset.cleanlinessScore).toBe(3.0);
    expect(reset.cleanlinessGrade).toBe("B");
  });

  it("unionServerToilet keeps local-only reviews on top of server data", () => {
    const server = mkSeed("toilet-user-1", {
      id: "toilet-user-1",
      reviews: [mkReview("srv1", 5)],
      reviewCount: 1,
      cleanlinessScore: 5,
      cleanlinessGrade: "S",
    });
    const local = mkSeed("toilet-user-1", {
      id: "toilet-user-1",
      reviews: [mkReview("srv1", 5), mkReview("offline", 1)],
      reviewCount: 2,
    });
    const out = unionServerToilet(local, server);
    expect(out.reviews.map((r) => r.id)).toEqual(["srv1", "offline"]);
    expect(out.reviewCount).toBe(2);
    expect(out.cleanlinessScore).toBe(3);
  });

  it("mergeFacilityLists appends only unknown ids", () => {
    const out = mergeFacilityLists([mkSeed("a")], [mkSeed("a"), mkSeed("b")]);
    expect(out.map((t) => t.id)).toEqual(["a", "b"]);
  });
});

describe("次元別集計（P1 スコア集計修正）", () => {
  // 総合（overallScore）と清潔さ（cleanlinessScore）が異なるレビューを明示的に作る
  const dimReview = (
    id: string,
    overall: number,
    cleanliness: number,
    odor: number,
    supplies: number
  ): ToiletReview => ({
    id,
    userName: "たろう",
    rating: overall,
    overallScore: overall,
    cleanlinessScore: cleanliness,
    odorScore: odor,
    suppliesScore: supplies,
    comment: "きれいでした",
    createdAt: "2026-09-04",
    helpfulCount: 0,
  });

  it("recomputeFromReviews aggregates overall and cleanliness independently", () => {
    const withRev = recomputeFromReviews(mkSeed("s"), [
      dimReview("a", 5, 2, 4, 3),
      dimReview("b", 3, 4, 2, 5),
    ]);
    expect(withRev.reviewCount).toBe(2);
    expect(withRev.cleanlinessScore).toBe(3); // (2+4)/2 ← 清潔さ次元のみ
    expect(withRev.cleanlinessGrade).toBe("B");
    expect(withRev.overallScore).toBe(4); // (5+3)/2 ← 総合次元
    expect(withRev.subScores).toEqual({ cleanliness: 3.0, odor: 3.0, supplies: 3.0, comfort: 3.0 }); // 推定ベースラインは不変
  });

  it("resetting to zero reviews drops overallScore too", () => {
    const withRev = recomputeFromReviews(mkSeed("s"), [dimReview("a", 5, 2, 4, 3)]);
    expect(withRev.overallScore).toBe(5);
    const reset = recomputeFromReviews(withRev, []);
    expect(reset.reviewCount).toBe(0);
    expect(reset.overallScore).toBeUndefined();
    expect(reset.cleanlinessScore).toBe(3.0); // 設備推定値へフォールバック
    expect(reset.cleanlinessGrade).toBe("B");
    expect(reset.lastCleaned).toBeUndefined();
  });
});
