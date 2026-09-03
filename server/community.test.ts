import { describe, expect, it, beforeEach } from "vitest";
import os from "node:os";
import path from "node:path";
import { promises as fs } from "node:fs";
import {
  validateToiletInput,
  validateReviewInput,
  validateReportInput,
  CommunityStore,
  hashIp,
  publicToilets,
} from "./community";

const goodToilet = () => ({
  id: "toilet-user-abc123",
  name: "テストトイレ",
  category: "park",
  lat: 35.66,
  lng: 139.7,
  cleanlinessScore: 4.5,
});

const goodReview = () => ({
  userName: "たろう",
  rating: 5,
  cleanlinessScore: 5,
  odorScore: 4,
  suppliesScore: 4,
  comment: "とても綺麗でした",
});

describe("validateToiletInput", () => {
  it("accepts a valid input", () => {
    expect(validateToiletInput(goodToilet()).ok).toBe(true);
  });
  it.each([
    [{ ...goodToilet(), id: "bad id!" }, "invalid id"],
    [{ ...goodToilet(), name: "" }, "invalid name"],
    [{ ...goodToilet(), name: "x".repeat(101) }, "invalid name"],
    [{ ...goodToilet(), category: "mars" }, "invalid category"],
    [{ ...goodToilet(), lat: 100 }, "invalid lat"],
    [{ ...goodToilet(), lng: 200 }, "invalid lng"],
    [{ ...goodToilet(), cleanlinessScore: 0 }, "invalid cleanlinessScore"],
    [{ ...goodToilet(), cleanlinessScore: 5.5 }, "invalid cleanlinessScore"],
    [null, "invalid body"],
  ])("rejects %j", (body, expected) => {
    const r = validateToiletInput(body);
    expect(r.ok).toBe(false);
    expect(r.error).toBe(expected);
  });
});

describe("validateReviewInput", () => {
  it("accepts a valid input with default name", () => {
    const { userName, ...rest } = goodReview();
    const r = validateReviewInput(rest);
    expect(r.ok).toBe(true);
    expect(r.value?.userName).toBe("匿名の利用者");
  });
  it.each([
    [{ ...goodReview(), rating: 0 }, "invalid rating"],
    [{ ...goodReview(), rating: 6 }, "invalid rating"],
    [{ ...goodReview(), rating: 4.5 }, "invalid rating"],
    [{ ...goodReview(), comment: "" }, "invalid comment"],
    [{ ...goodReview(), comment: "x".repeat(1001) }, "invalid comment"],
    [{ ...goodReview(), comment: "see https://spam.example.com" }, "comment must not contain URLs"],
    [{ ...goodReview(), userName: "x".repeat(31) }, "invalid userName"],
  ])("rejects %j", (body, expected) => {
    const r = validateReviewInput(body);
    expect(r.ok).toBe(false);
    expect(r.error).toBe(expected);
  });
});

describe("validateReportInput", () => {
  it("accepts a reason", () => {
    expect(validateReportInput({ reason: "いたずら投稿です" }).ok).toBe(true);
  });
  it("rejects empty/URL reasons", () => {
    expect(validateReportInput({ reason: "" }).ok).toBe(false);
    expect(validateReportInput({ reason: "see http://x.example" }).ok).toBe(false);
  });
});

describe("publicToilets", () => {
  it("strips ipHash from reviews", () => {
    const out = publicToilets([
      { id: "t", reviews: [{ id: "r", ipHash: "secret", comment: "x" }] } as any,
    ]);
    expect(out[0].reviews[0]).not.toHaveProperty("ipHash");
    expect(out[0].reviews[0].comment).toBe("x");
  });
});

describe("hashIp", () => {
  it("is deterministic and salted", () => {
    expect(hashIp("1.2.3.4", "s")).toBe(hashIp("1.2.3.4", "s"));
    expect(hashIp("1.2.3.4", "s")).not.toBe(hashIp("1.2.3.4", "t"));
    expect(hashIp("1.2.3.4", "s")).not.toContain("1.2.3.4");
  });
});

describe("CommunityStore", () => {
  let dir: string;
  let store: CommunityStore;
  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "community-test-"));
    store = new CommunityStore(path.join(dir, "community.json"));
  });

  it("starts empty and persists toilets", async () => {
    expect(await store.getToilets()).toEqual([]);
    const t: any = {
      id: "toilet-user-x1",
      name: "A",
      facilityType: "公衆トイレ",
      category: "park",
      dataSource: "community",
      lat: 35,
      lng: 139,
      address: "x",
      cleanlinessGrade: "A",
      cleanlinessScore: 4,
      equipmentGrade: "A",
      equipmentScore: 4,
      subScores: { cleanliness: 4, odor: 4, supplies: 4, comfort: 4 },
      attributes: {
        hasWashlet: true, hasMultipurpose: false, hasBabyTable: false,
        hasNursingRoom: false, hasPowderRoom: false, hasOstomate: false,
        isFree: true, isOpen24h: false, hasSoap: true, hasAlcohol: false,
        hasPaperTowelOrDryer: false, toiletStyle: "western",
      },
      openingHours: "x",
      description: "x",
      reviewCount: 0,
      reviews: [],
    };
    expect((await store.addToilet(t)).added).toBe(true);
    expect((await store.addToilet(t)).added).toBe(false);
    // reload from disk
    const store2 = new CommunityStore(path.join(dir, "community.json"));
    expect((await store2.getToilets()).map((x) => x.id)).toEqual(["toilet-user-x1"]);
  });

  const seedToilet = (): any => ({
    id: "toilet-user-r1",
    name: "B",
    facilityType: "公衆トイレ",
    category: "park",
    dataSource: "community",
    lat: 35,
    lng: 139,
    address: "x",
    cleanlinessGrade: "B",
    cleanlinessScore: 3.4,
    equipmentGrade: "B",
    equipmentScore: 3.4,
    subScores: { cleanliness: 3.4, odor: 3.4, supplies: 3.4, comfort: 3.4 },
    attributes: {
      hasWashlet: false, hasMultipurpose: false, hasBabyTable: false,
      hasNursingRoom: false, hasPowderRoom: false, hasOstomate: false,
      isFree: true, isOpen24h: false, hasSoap: false, hasAlcohol: false,
      hasPaperTowelOrDryer: false, toiletStyle: "both",
    },
    openingHours: "x",
    description: "x",
    reviewCount: 0,
    reviews: [],
  });

  it("adds reviews, recomputes score, blocks duplicates", async () => {
    await store.addToilet(seedToilet());
    const r1 = await store.addReview("toilet-user-r1", { ...goodReview(), rating: 5 } as any, "ipA");
    expect(r1.error).toBeUndefined();
    expect(r1.toilet?.reviewCount).toBe(1);
    expect(r1.toilet?.cleanlinessScore).toBe(5);
    expect(r1.toilet?.cleanlinessGrade).toBe("S");
    // same IP + same comment within 24h -> duplicate
    const dup = await store.addReview("toilet-user-r1", { ...goodReview(), rating: 1 } as any, "ipA");
    expect(dup.error).toBe("duplicate");
    // different IP -> accepted, average recomputed
    const r2 = await store.addReview("toilet-user-r1", { ...goodReview(), rating: 3, comment: "普通でした" } as any, "ipB");
    expect(r2.toilet?.reviewCount).toBe(2);
    expect(r2.toilet?.cleanlinessScore).toBe(4);
    // unknown toilet
    expect((await store.addReview("nope", goodReview() as any, "ipA")).error).toBe("not_found");
  });

  it("helpful votes are once per IP, reports are stored", async () => {
    await store.addToilet(seedToilet());
    const r = await store.addReview("toilet-user-r1", goodReview() as any, "ipA");
    const reviewId = r.toilet!.reviews[0].id;
    const v1 = await store.voteHelpful(reviewId, "ipX");
    expect(v1).toEqual({ helpfulCount: 1, voted: true, found: true });
    const v2 = await store.voteHelpful(reviewId, "ipX");
    expect(v2.voted).toBe(false);
    expect(v2.helpfulCount).toBe(1);
    expect((await store.voteHelpful("rev-nope", "ipX")).found).toBe(false);
    const rep = await store.addReport("toilet-user-r1", reviewId, "いたずらの疑い");
    expect(rep).toEqual({ ok: true, found: true });
    expect((await store.addReport("toilet-user-r1", "rev-nope", "x")).found).toBe(false);
  });
});
