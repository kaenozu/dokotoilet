import { describe, expect, it } from "vitest";
import type { RawDb, RawFacility, RawReport, RawReview } from "./curate";
import {
  cloneDb,
  formatList,
  formatPlan,
  locateReview,
  parseRawDb,
  removeReview,
} from "./curate";

// ── フィクスチャ ──

const review = (id: string, rating: number, over: Partial<RawReview> = {}): RawReview => ({
  id,
  userName: "たろう",
  rating,
  comment: "きれいでした",
  createdAt: "2026-09-04",
  ipHash: "deadbeefcafe", // 保存ファイルに含まれる秘密フィールド（出力してはならない）
  ...over,
});

const facility = (id: string, name: string, over: Partial<RawFacility> = {}): RawFacility => ({
  id,
  name,
  reviews: [],
  cleanlinessScore: 3.0,
  cleanlinessGrade: "B",
  equipmentScore: 3.0,
  equipmentGrade: "B",
  reviewCount: 0,
  ...over,
});

const report = (id: string, reviewId: string, over: Partial<RawReport> = {}): RawReport => ({
  id,
  toiletId: "toilet-user-1",
  reviewId,
  reason: "スパム",
  createdAt: "2026-09-04T10:00:00.000Z",
  ...over,
});

const db = (over: Partial<RawDb> = {}): RawDb => ({
  version: 2,
  toilets: [],
  helpfulVotes: {},
  reports: [],
  reviewKeys: {},
  externalReviews: {},
  ...over,
});

// ── parse ──

describe("parseRawDb", () => {
  it("parses valid JSON and defaults missing sections", () => {
    const d = parseRawDb(JSON.stringify({ version: 2, toilets: [{ id: "x", reviews: [] }] }), "test");
    expect(d.toilets).toHaveLength(1);
    expect(d.reports).toEqual([]);
    expect(d.helpfulVotes).toEqual({});
    expect(d.externalReviews).toEqual({});
  });

  it("throws on broken JSON or missing toilets", () => {
    expect(() => parseRawDb("{oops", "t")).toThrow();
    expect(() => parseRawDb(JSON.stringify({ version: 2 }), "t")).toThrow();
  });
});

// ── locate / remove ──

describe("removeReview", () => {
  it("removes a review from a community toilet and recomputes scores", () => {
    const d = db({
      toilets: [
        facility("toilet-user-1", "渋谷トイレ", {
          reviews: [review("r1", 5), review("r2", 3)],
          cleanlinessScore: 4.0,
          cleanlinessGrade: "A",
          reviewCount: 2,
          lastCleaned: "たった今（利用者が確認）",
        }),
      ],
      helpfulVotes: { r2: ["hash-1", "hash-2"] },
      reviewKeys: { r2: { ipHash: "hash-1", at: 1 } },
      reports: [report("rep-1", "r2"), report("rep-2", "r2"), report("rep-3", "r1")],
    });
    const plan = removeReview(d, "r2");

    expect(plan).not.toBeNull();
    expect(plan!.kind).toBe("community");
    expect(plan!.reportIds).toEqual(["rep-1", "rep-2"]); // 兄弟通報も削除
    expect(plan!.reviewsBefore).toBe(2);
    expect(plan!.reviewsAfter).toBe(1);
    expect(plan!.scoreBefore).toBe(4.0);
    expect(plan!.scoreAfter).toBe(5); // 残り r1 の rating のみ
    expect(plan!.hadVotes).toBe(true);
    expect(plan!.hadReviewKey).toBe(true);

    const t = d.toilets[0];
    expect(t.reviews!.map((r) => r.id)).toEqual(["r1"]);
    expect(t.reviewCount).toBe(1);
    expect(t.cleanlinessScore).toBe(5);
    expect(t.cleanlinessGrade).toBe("S");
    expect(t.lastCleaned).toBe("たった今（利用者が確認）"); // 0件でないので維持
    expect(d.reports!.map((r) => r.id)).toEqual(["rep-3"]);
    expect("r2" in (d.helpfulVotes ?? {})).toBe(false);
    expect("r2" in (d.reviewKeys ?? {})).toBe(false);
  });

  it("reverts to equipment estimate when the last review is removed", () => {
    const d = db({
      toilets: [
        facility("toilet-user-1", "渋谷トイレ", {
          reviews: [review("r1", 5)],
          cleanlinessScore: 5,
          cleanlinessGrade: "S",
          equipmentScore: 3.0,
          equipmentGrade: "B",
          reviewCount: 1,
          overallScore: 5,
          lastCleaned: "たった今（利用者が確認）",
        }),
      ],
      reports: [report("rep-1", "r1")],
    });
    const plan = removeReview(d, "r1");

    expect(plan!.scoreAfter).toBe(3.0);
    expect(plan!.gradeAfter).toBe("B");
    const t = d.toilets[0];
    expect(t.reviews).toEqual([]);
    expect(t.reviewCount).toBe(0);
    expect(t.cleanlinessScore).toBe(3.0);
    expect(t.cleanlinessGrade).toBe("B");
    expect("overallScore" in t).toBe(false); // 未評価へ戻すため除去
    expect("lastCleaned" in t).toBe(false); // 設備推定表示に戻すため除去
    expect(d.reports).toEqual([]);
  });

  it("removes an external facility review without touching facility scores", () => {
    const d = db({
      toilets: [],
      externalReviews: { "osm-1": [review("e1", 4), review("e2", 2)] },
      helpfulVotes: { e1: ["h1"] },
      reports: [report("rep-1", "e1", { toiletId: "osm-1" })],
    });
    const plan = removeReview(d, "e1");
    expect(plan!.kind).toBe("external");
    expect(plan!.scoreBefore).toBe(3); // (4+2)/2
    expect(plan!.scoreAfter).toBe(2); // 残り e2
    expect(d.externalReviews["osm-1"].map((r) => r.id)).toEqual(["e2"]);
    expect(d.reports).toEqual([]);
    expect("e1" in (d.helpfulVotes ?? {})).toBe(false);
  });

  it("recomputes cleanliness from the cleanliness dimension, not the rating", () => {
    const d = db({
      toilets: [
        facility("toilet-user-1", "A", {
          reviews: [
            review("r1", 5, { cleanlinessScore: 2, overallScore: 5 }),
            review("r2", 3, { cleanlinessScore: 4, overallScore: 3 }),
          ],
          cleanlinessScore: 3.0,
          cleanlinessGrade: "B",
          reviewCount: 2,
          overallScore: 4,
        }),
      ],
      reports: [report("rep-1", "r2")],
    });
    const plan = removeReview(d, "r2");

    expect(plan!.scoreBefore).toBe(3.0);
    expect(plan!.scoreAfter).toBe(2); // 残り r1 の清潔さ次元 2（rating 5 ではない）
    expect(plan!.gradeAfter).toBe("C"); // gradeForScore(2.0) = C
    const t = d.toilets[0];
    expect(t.reviews!.map((r) => r.id)).toEqual(["r1"]);
    expect(t.cleanlinessScore).toBe(2);
    expect(t.cleanlinessGrade).toBe("C");
    expect(t.overallScore).toBe(5); // 残り r1 の総合次元（rating と同値）
  });

  it("returns null for an unknown review and leaves the db untouched", () => {
    const d = db({ toilets: [facility("toilet-user-1", "A", { reviews: [review("r1", 5)] })] });
    const before = JSON.stringify(d);
    expect(removeReview(d, "no-such-review")).toBeNull();
    expect(JSON.stringify(d)).toBe(before);
  });

  it("dry-run on a clone does not modify the original", () => {
    const d = db({
      toilets: [facility("toilet-user-1", "A", { reviews: [review("r1", 5)] })],
      reports: [report("rep-1", "r1")],
    });
    const before = JSON.stringify(d);
    const plan = removeReview(cloneDb(d), "r1");
    expect(plan).not.toBeNull();
    expect(JSON.stringify(d)).toBe(before); // 元は無傷
    expect(d.toilets[0].reviews).toHaveLength(1);
  });
});

describe("locateReview", () => {
  it("finds reviews in community toilets and external reviews", () => {
    const d = db({
      toilets: [facility("toilet-user-1", "A", { reviews: [review("r1", 5)] })],
      externalReviews: { "osm-1": [review("e1", 4)] },
    });
    const community = locateReview(d, "r1");
    expect(community?.kind).toBe("community");
    expect(community?.facilityName).toBe("A");
    const external = locateReview(d, "e1");
    expect(external?.kind).toBe("external");
    expect(external?.facilityId).toBe("osm-1");
    expect(locateReview(d, "zzz")).toBeNull();
  });
});

// ── 表示（プライバシー） ──

describe("formatList / formatPlan", () => {
  it("never prints ipHash values", () => {
    const d = db({
      toilets: [facility("toilet-user-1", "渋谷トイレ", { reviews: [review("r1", 5)] })],
      reports: [report("rep-1", "r1")],
    });
    const list = formatList(d);
    expect(list).toContain("rep-1");
    expect(list).toContain("スパム");
    expect(list).not.toContain("deadbeefcafe");
    expect(list).not.toContain("ipHash");

    const plan = removeReview(cloneDb(d), "r1")!;
    const preview = formatPlan(plan, false);
    expect(preview).toContain("dry-run");
    expect(preview).toContain("rep-1");
    expect(preview).not.toContain("deadbeefcafe");
    expect(preview).not.toContain("ipHash");
  });

  it("marks reports whose review is already gone", () => {
    const d = db({ reports: [report("rep-1", "rev-gone")] });
    const list = formatList(d);
    expect(list).toContain("見つかりません");
  });
});
