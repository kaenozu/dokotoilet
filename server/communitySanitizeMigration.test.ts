// 登録欄（validateToiletInput）への textSanitizer 適用と、ストア読み込み時の
// 自己修復マイグレーション（レガシー行の浄化）のテスト。
//
// 背景は server/community.unicode.test.ts の監査ヘッダ参照:
//   - G2/G3 は PR #67 で review/report に適用されたが、登録欄は URL 検出のみだった。
//     このテストは登録欄にも同じポリシー（不可視のみは拒否/フォールバック、
//     制御・書式文字は除去）を適用したことを固定する。
//   - マイグレーションは parse() を一点経由する（全読み出し・次回書き込みが通る）。
//     sanitizeText は冪等で清浄データを変更しないため、2回目以降の読み込みで
//     データが動かないことを含めて検証する。
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { validateToiletInput } from "./community";
import { CommunityStore } from "./community";

const base = {
  id: "toilet-user-san",
  category: "park",
  lat: 35,
  lng: 139,
  cleanlinessScore: 4,
} as const;

describe("validateToiletInput sanitization (registration fields)", () => {
  it("rejects an invisible-only name", () => {
    const r = validateToiletInput({ ...base, name: "\u200B".repeat(10) });
    expect(r.ok).toBe(false);
    expect(r.error).toBe("invalid name");
  });

  it("strips control and format characters from the stored name", () => {
    const r = validateToiletInput({ ...base, name: "A\u0000B\u202Etoilet" });
    expect(r.ok).toBe(true);
    expect(r.value!.name).toBe("ABtoilet");
  });

  it("falls back to the default address when the input is invisible-only", () => {
    const r = validateToiletInput({ ...base, name: "ok", address: "\u200B".repeat(10) });
    expect(r.ok).toBe(true);
    expect(r.value!.address).toBe("現在地周辺");
  });

  it("sanitizes visible address / floorInfo / description values", () => {
    const r = validateToiletInput({
      ...base,
      name: "ok",
      address: "渋谷区\u0085神南",
      floorInfo: "2階\u202Erev",
      description: "清潔\u0000です",
    });
    expect(r.ok).toBe(true);
    expect(r.value!.address).toBe("渋谷区 神南");
    expect(r.value!.floorInfo).toBe("2階rev");
    expect(r.value!.description).toBe("清潔です");
  });

  it("keeps the URL rejections working on the sanitized values", () => {
    expect(validateToiletInput({ ...base, name: "h\u200Ettps://spam.example" }).ok).toBe(false);
    expect(validateToiletInput({ ...base, name: "ok", description: "www\u0000.spam.example" }).ok).toBe(false);
  });

  it("preserves legitimate emoji variation selectors in the name", () => {
    const r = validateToiletInput({ ...base, name: "きれいなトイレ ❤\uFE0F" });
    expect(r.ok).toBe(true);
    expect(r.value!.name).toContain("\uFE0F");
  });
});

describe("CommunityStore load-time sanitization migration", () => {
  let dir: string;
  let file: string;

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "community-mig-test-"));
    file = path.join(dir, "community.json");
  });

  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });

  const writeLegacyDb = async (db: unknown) => {
    await fs.writeFile(file, JSON.stringify(db), "utf-8");
  };

  it("sanitizes legacy toilet fields and review text on load", async () => {
    await writeLegacyDb({
      version: 2,
      toilets: [
        {
          id: "toilet-user-legacy",
          name: "A\u0000B トイレ",
          address: "渋谷区\u200B神南",
          floorInfo: "2階\u202Erev",
          description: "清潔\u0085です",
          lat: 35,
          lng: 139,
          reviews: [
            { id: "rev-1", userName: "たろ\u0000う", comment: "汚れ\u202Eてた" },
          ],
        },
      ],
      helpfulVotes: {},
      reports: [{ id: "rep-1", toiletId: "toilet-user-legacy", reviewId: "rev-1", reason: "スパム\u200Bです", createdAt: "2026-01-01T00:00:00.000Z" }],
      reviewKeys: {},
      externalReviews: {
        "osm-legacy": [
          { id: "rev-2", userName: "匿名\u200Bの利用者", comment: "ふつ\u0000う" },
        ],
      },
    });

    const store = new CommunityStore(file);
    const toilets = await store.getToilets();
    expect(toilets[0].name).toBe("AB トイレ");
    expect(toilets[0].address).toBe("渋谷区神南");
    expect(toilets[0].floorInfo).toBe("2階rev");
    expect(toilets[0].description).toBe("清潔 です");
    expect(toilets[0].reviews[0].userName).toBe("たろう");
    expect(toilets[0].reviews[0].comment).toBe("汚れてた");
    expect((await store.getExternalReviews())["osm-legacy"][0].comment).toBe("ふつう");
  });

  it("persists the sanitized form on the next write and is stable afterwards", async () => {
    await writeLegacyDb({
      version: 2,
      toilets: [
        {
          id: "toilet-user-legacy2",
          name: "A\u0000B トイレ",
          lat: 35,
          lng: 139,
          reviews: [],
        },
      ],
      helpfulVotes: {},
      reports: [],
      reviewKeys: {},
      externalReviews: {},
    });

    const store = new CommunityStore(file);
    expect((await store.getToilets())[0].name).toBe("AB トイレ");

    // 同一プロセスでの次回書き込みがサニタイズ済みスナップショットを永続化する。
    const before = await store.load();
    before.toilets[0].reviewCount = 1;
    await store.addReview("toilet-user-legacy2", {
      userName: "たろう",
      overallScore: 4,
      cleanlinessScore: 4,
      odorScore: 4,
      suppliesScore: 4,
      comment: "普通のトイレでした",
    }, "iphash-x");

    const raw = JSON.parse(await fs.readFile(file, "utf-8"));
    expect(raw.toilets[0].name).toBe("AB トイレ");
    // 書き込みで全レビューが1件になっている（既存0 + 新規1）
    expect(raw.toilets[0].reviews).toHaveLength(1);

    // 新しいストア（cold read）でも 2 回読んでも値は不変（冪等性）。
    const store2 = new CommunityStore(file);
    const first = (await store2.getToilets())[0].name;
    const second = (await store2.getToilets())[0].name;
    expect(first).toBe("AB トイレ");
    expect(second).toBe(first);
  });

  it("survives malformed legacy rows without crashing the store", async () => {
    await writeLegacyDb({
      version: 2,
      toilets: [
        { id: "toilet-user-bad", name: 42, lat: 35, lng: 139 },
        { id: "toilet-user-ok", name: "A\u0000B", lat: 35, lng: 139 },
      ],
      helpfulVotes: {},
      reports: [],
      reviewKeys: {},
      externalReviews: { "osm-bad": [null, 7, { id: "rev-9", userName: "x\u0000" }] },
    });

    const store = new CommunityStore(file);
    const toilets = await store.getToilets();
    expect(toilets.map((t) => t.id).sort()).toEqual(["toilet-user-bad", "toilet-user-ok"]);
    expect(toilets.find((t) => t.id === "toilet-user-ok")!.name).toBe("AB");
    // 非文字列の name は触られず、欠損 reviews でもクラッシュしない
    expect((toilets.find((t) => t.id === "toilet-user-bad") as any).name).toBe(42);
  });
});
