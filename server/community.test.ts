import { describe, expect, it, beforeEach } from "vitest";
import express from "express";
import { createServer } from "node:http";
import os from "node:os";
import path from "node:path";
import { promises as fs } from "node:fs";
import { GOOGLE_SEED } from "../src/data/googleSeed";
import {
  validateToiletInput,
  validateReviewInput,
  validateReportInput,
  CommunityStore,
  createCommunityRouter,
  hashIp,
  publicToilets,
} from "./community";
import { applyReportResolution } from "../scripts/community-ops/curate";

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
  rating: 5, // 旧名（別名）。新クライアントは overallScore も同時に送る
  overallScore: 5,
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
    [{ ...goodToilet(), attributes: { hasWashlet: "yes" } }, "invalid attributes.hasWashlet"],
    [null, "invalid body"],
  ])("rejects %j", (body, expected) => {
    const r = validateToiletInput(body);
    expect(r.ok).toBe(false);
    expect(r.error).toBe(expected);
  });

  it("accepts tri-state attributes (null=未確認) and defaults missing ones to null", () => {
    const r = validateToiletInput({
      ...goodToilet(),
      attributes: { hasWashlet: null, hasMultipurpose: true, hasBabyTable: false },
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.attributes.hasWashlet).toBeNull();
      expect(r.value.attributes.hasMultipurpose).toBe(true);
      expect(r.value.attributes.hasBabyTable).toBe(false);
      // 未送信の項目も「なし」ではなく「未確認(null)」として保存する
      expect(r.value.attributes.hasPowderRoom).toBeNull();
      expect(r.value.attributes.isOpen24h).toBeNull();
    }
  });

  it("rejects a non-object attributes value without throwing", () => {
    expect(() => validateToiletInput({ ...goodToilet(), attributes: null })).not.toThrow();
    expect(validateToiletInput({ ...goodToilet(), attributes: null }).ok).toBe(false);
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
  it("accepts overallScore-only reviews (new field) and validates it", () => {
    const { rating: _dropped, overallScore: _dropped2, ...withoutBoth } = goodReview();
    expect(validateReviewInput({ ...withoutBoth, overallScore: 4 }).ok).toBe(true);
    expect(validateReviewInput({ ...withoutBoth, overallScore: 0 }).ok).toBe(false);
    expect(validateReviewInput({ ...withoutBoth, overallScore: 6 }).ok).toBe(false);
    expect(validateReviewInput({ ...withoutBoth, overallScore: 4.5 }).ok).toBe(false);
    // rating も overallScore も無ければ無効
    expect(validateReviewInput(withoutBoth).ok).toBe(false);
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
    expect(r1.toilet?.overallScore).toBe(5);
    // 保存されるレビューには overallScore と rating の両方が入る（旧クライアント互換）
    expect(r1.toilet?.reviews[0]).toMatchObject({ rating: 5, overallScore: 5 });
    // same IP + same comment within 24h -> duplicate
    const dup = await store.addReview("toilet-user-r1", { ...goodReview(), rating: 1 } as any, "ipA");
    expect(dup.error).toBe("duplicate");
    // different IP -> accepted, per-dimension averages recomputed
    const r2 = await store.addReview(
      "toilet-user-r1",
      { ...goodReview(), rating: 4, overallScore: 4, cleanlinessScore: 3, comment: "普通でした" } as any,
      "ipB"
    );
    expect(r2.toilet?.reviewCount).toBe(2);
    expect(r2.toilet?.cleanlinessScore).toBe(4); // 清潔さ次元の平均 (5+3)/2
    expect(r2.toilet?.cleanlinessGrade).toBe("A");
    expect(r2.toilet?.overallScore).toBe(4.5); // 総合次元の平均 (5+4)/2
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

  it("accepts reviews for external facility ids (osm/google/od) and persists them", async () => {
    const r1 = await store.addReview("osm-2198890502", goodReview() as any, "ipA");
    expect(r1.error).toBeUndefined();
    expect(r1.facilityId).toBe("osm-2198890502");
    expect(r1.toilet).toBeUndefined();
    expect(r1.reviewCount).toBe(1);
    expect(r1.reviews).toHaveLength(1);
    expect(r1.cleanlinessScore).toBe(5);
    expect(r1.cleanlinessGrade).toBe("S");
    expect(r1.overallScore).toBe(5);
    // 同一IP＋同一コメントは重複扱い
    const dup = await store.addReview("osm-2198890502", { ...goodReview(), rating: 1 } as any, "ipA");
    expect(dup.error).toBe("duplicate");
    // 別施設（google / od 形式）も受付。同一IPでも施設が違えばOK
    const r2 = await store.addReview("google-ChIJxyz", { ...goodReview(), comment: "Google施設です" } as any, "ipA");
    expect(r2.facilityId).toBe("google-ChIJxyz");
    const r3 = await store.addReview("od-kumagaya-0019002", goodReview() as any, "ipB");
    expect(r3.facilityId).toBe("od-kumagaya-0019002");
    // ID形式不一致（コミュニティ登録外かつ接頭辞なし）は従来どおり not_found
    expect((await store.addReview("nope", goodReview() as any, "ipA")).error).toBe("not_found");
    // 再読込しても残っている
    const store2 = new CommunityStore(path.join(dir, "community.json"));
    const ext = await store2.getExternalReviews();
    expect(Object.keys(ext).sort()).toEqual(["google-ChIJxyz", "od-kumagaya-0019002", "osm-2198890502"]);
    expect(ext["osm-2198890502"]).toHaveLength(1);
  });

  it("accepts every real Google seed id, including Japanese names", async () => {
    for (const [i, facility] of GOOGLE_SEED.entries()) {
      const r = await store.addReview(facility.id, { ...goodReview(), comment: `施設 ${i}` } as any, `ip-${i}`);
      expect(r.error, facility.id).toBeUndefined();
    }
    expect(Object.keys(await store.getExternalReviews())).toHaveLength(GOOGLE_SEED.length);
  });

  it("retains both toilets when cold stores add concurrently", async () => {
    const storeA = new CommunityStore(path.join(dir, "community.json"));
    const storeB = new CommunityStore(path.join(dir, "community.json"));
    const t1 = { ...seedToilet(), id: "toilet-user-a" };
    const t2 = { ...seedToilet(), id: "toilet-user-b" };
    const results = await Promise.all([storeA.addToilet(t1), storeB.addToilet(t2)]);
    expect(results.every((r) => r.added)).toBe(true);
    expect((await new CommunityStore(path.join(dir, "community.json")).getToilets()).map((t) => t.id).sort()).toEqual(["toilet-user-a", "toilet-user-b"]);
  });

  it("does not resurrect a curator deletion through a live store cache", async () => {
    const reviewResult = await store.addReview("osm-live-curator", goodReview() as any, "ip-live");
    const reviewId = reviewResult.reviews![0].id;
    await store.addReport("osm-live-curator", reviewId, "削除テスト");
    const dbPath = path.join(dir, "community.json");
    await applyReportResolution(dbPath, (await store.load()).reports[0].id);
    expect((await store.getExternalReviews())["osm-live-curator"]).toBeUndefined();
    const next = await store.addReview("osm-live-curator", { ...goodReview(), comment: "次の投稿" } as any, "ip-next");
    expect(next.reviews).toHaveLength(1);
    expect((await store.getExternalReviews())["osm-live-curator"]).toHaveLength(1);
  });

  it("preserves concurrent cold store review updates", async () => {
    const file = path.join(dir, "community.json");
    const stores = Array.from({ length: 4 }, () => new CommunityStore(file));
    const results = await Promise.all(stores.map((s, i) => s.addReview(
      "google-concurrent",
      { ...goodReview(), comment: `同時投稿 ${i}` } as any,
      `ip-${i}`,
    )));
    expect(results.every((r) => r.error === undefined)).toBe(true);
    expect((await new CommunityStore(file).getExternalReviews())["google-concurrent"]).toHaveLength(4);
  });

  it("does not overwrite a malformed database", async () => {
    const file = path.join(dir, "community.json");
    await fs.writeFile(file, "{broken database");
    await expect(store.addToilet(seedToilet())).rejects.toThrow();
    expect(await fs.readFile(file, "utf8")).toBe("{broken database");
  });

  it("votes and reports external-facility reviews", async () => {
    await store.addReview("google-ChIJvote", goodReview() as any, "ipA");
    const { "google-ChIJvote": list } = await store.getExternalReviews();
    const reviewId = list[0].id;
    const v1 = await store.voteHelpful(reviewId, "ipX");
    expect(v1).toEqual({ helpfulCount: 1, voted: true, found: true });
    expect((await store.voteHelpful(reviewId, "ipX")).voted).toBe(false);
    const rep = await store.addReport("google-ChIJvote", reviewId, "スパムの疑い");
    expect(rep).toEqual({ ok: true, found: true });
    expect((await store.addReport("google-ChIJvote", "rev-nope", "x")).found).toBe(false);
    expect((await store.voteHelpful("rev-nope", "ipX")).found).toBe(false);
  });
});

describe("community router async errors", () => {
  it("returns 500 and remains usable when persistence fails", async () => {
    const failing = { getToilets: async () => { throw new Error("disk failure"); }, getExternalReviews: async () => ({}) } as any;
    const app = express();
    app.use("/api/community", createCommunityRouter(failing, "test"));
    const server = createServer(app);
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const port = (server.address() as any).port;
    const first = await fetch(`http://127.0.0.1:${port}/api/community/toilets`);
    expect(first.status).toBe(500);
    const second = await fetch(`http://127.0.0.1:${port}/api/community/toilets`);
    expect(second.status).toBe(500);
    await new Promise<void>((resolve, reject) => server.close((e) => e ? reject(e) : resolve()));
  });
});
