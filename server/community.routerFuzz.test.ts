// ルーターレベルのプロパティファズテスト（fast-check + supertest）。
//
// 例示・バリデータ単体のファズ（community.fuzz.test.ts）を補完し、HTTP 境界と
// ストレージキー空間の普遍的保証を検証する:
//   1. ストアキー空間不変条件: どんなクライアント入力でも externalReviews /
//      toilets のキーは osm-* / google-* / od-* / toilet-user-* の4プレフィックス
//      から逸脱しない（新しいキー空間への脱出・任意キー生成を普遍的に否定）
//   2. 重複 JSON キー: JSON.parse は最後の値で上書きするため、{"comment":"ok",
//      "comment":"https://spam"} は後勝ち。バリデータが受ける「最終値」に対して
//      保証が成立することを確認（前の値にURLがあっても採用されない）
//   3. supertest × 任意 body: 3ルートが任意の JSON で例外を投げず、必ず
//      400/2xx/404/409 の契約内ステータスで応答し、2xx 時は契約どおりの形状
import fc from "fast-check";
import request from "supertest";
import express from "express";
import { createServer } from "node:http";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { CommunityStore, createCommunityRouter } from "./community";
import { sanitizeText } from "../src/lib/textPolicy";
import {
  canonicalizeExternalFacilityId,
  isExternalFacilityIdFormat,
} from "./externalFacilityRegistry";

// ── 任意Unicode文字列（fuzz スイートと同じアービトラリ）
const anyUnicode: fc.Arbitrary<string> = fc
  .uint8Array({ minLength: 0, maxLength: 120 })
  .map((bytes) => new TextDecoder("utf-8", { fatal: false }).decode(bytes));

// ストアが生成するキーの正規形（登録経路で取り得るすべて）
const KEY_RE = /^(osm|google|od)-[\p{L}\p{N}_-]{1,80}$|^toilet-user-[A-Za-z0-9-]{1,64}$/u;

// ── supertest アプリ（テストごとに隔離ストア）
let dir: string;
let file: string;

beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), "community-fuzz-router-"));
  file = path.join(dir, "community.json");
});

afterEach(async () => {
  await fs.rm(dir, { recursive: true, force: true });
});

const buildApp = () => {
  const store = new CommunityStore(file);
  const app = express();
  app.use(express.json());
  app.use(
    "/api/community",
    createCommunityRouter(store, "test", async (id) => {
      const ids = new Set(await store.listKnownExternalFacilityIds());
      return ids.has(id);
    })
  );
  return { app, store };
};

describe("property: store key-space invariant", () => {
  it("arbitrary external-facility ids never create keys outside the 4 canonical prefixes", () => {
    fc.assert(
      fc.property(
        fc.array(anyUnicode, { minLength: 0, maxLength: 6 }),
        anyUnicode,
        (ids, comment) => {
          // 各入力IDを registerExternalFacilities 相当の正準化経路に通した結果、
          // キー空間を逸脱するキーが作られないことを直接検証する。
          // （ルーターの canonicalizeExternalFacilityId → registerExternalFacilities
          //   の防御は store 側でも同一。ここでは純関数として純粋に検証）
          for (const raw of ids) {
            const canonical = canonicalizeExternalFacilityId(raw);
            // osm|google|od 接頭辞を持たない入力は無変更で返る → 登録経路では
            // isExternalFacilityIdFormat で弾かれるため、キーにはならない。
            // 接頭辞を持つ入力は正準化後も必ず KEY_RE に一致しなければならない。
            if (/^(osm|google|od)-/u.test(canonical)) {
              expect(KEY_RE.test(canonical), JSON.stringify(canonical)).toBe(true);
            }
          }
          void comment;
        }
      ),
      { numRuns: 500 }
    );
  });

  it("registered ids are always canonical and within the key regex", async () => {
    fc.assert(
      fc.asyncProperty(
        fc.array(anyUnicode, { minLength: 0, maxLength: 8 }),
        async (ids) => {
          const { app, store } = buildApp();
          void app;
          const valid = ids
            .map((id) => canonicalizeExternalFacilityId(id))
            .filter((id) => isExternalFacilityIdFormat(id));
          if (valid.length > 0) {
            await store.registerExternalFacilities(
              valid.map((id) => ({
                id,
                source: id.startsWith("osm-")
                  ? ("osm" as const)
                  : id.startsWith("google-")
                  ? ("google" as const)
                  : ("od" as const),
                origin: "restore" as const,
              }))
            );
            const known = await store.listKnownExternalFacilityIds();
            for (const id of valid) {
              expect(known, JSON.stringify(id)).toContain(id);
              expect(KEY_RE.test(id), JSON.stringify(id)).toBe(true);
            }
          }
          const known = await store.listKnownExternalFacilityIds();
          for (const key of known) {
            expect(KEY_RE.test(key), JSON.stringify(key)).toBe(true);
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});

describe("property: duplicate JSON keys", () => {
  it("the last duplicate wins and guarantees still hold for the surviving value", () => {
    fc.assert(
      fc.property(anyUnicode, anyUnicode, (first, last) => {
        // JSON.parse の後勝ちセマンティクスを再現: バリデータが見るのは最後の値。
        const parsed = JSON.parse(
          `{"comment":${JSON.stringify(first)},"comment":${JSON.stringify(last)}}`
        ) as { comment: string };
        expect(parsed.comment).toBe(last);
        // サニタイズ済み保存値の保証は「最終値」に対して成立する
        const sanitized = sanitizeText(parsed.comment);
        expect(sanitized.length).toBeLessThanOrEqual(parsed.comment.length);
        expect(sanitized).not.toMatch(/\p{C}/u);
      }),
      { numRuns: 300 }
    );
  });

  it("a URL hidden in an earlier duplicate never reaches storage", async () => {
    fc.assert(
      fc.asyncProperty(anyUnicode, async (urlInFirst) => {
        const { app } = buildApp();
        // {"comment":"<URL>","comment":"安全な本文"} — 後勝ちで安全な本文が採用される
        const raw = `{"comment":${JSON.stringify(urlInFirst)},"comment":"きれいでした"}`;
        const res = await request(app)
          .post("/api/community/toilets/toilet-user-fuzz/reviews")
          .set("Content-Type", "application/json")
          .send(raw);
        // 採用された値は「きれいでした」なので、URLで拒否されることはない。
        // ただし採用値が不可視のみ等で invalid の場合は 400 も許容（契約内）。
        expect([201, 400]).toContain(res.status);
        if (res.status === 201) {
          expect((res.body as any).review.comment).toBe("きれいでした");
        }
      }),
      { numRuns: 60 }
    );
  });
});

describe("property: supertest over arbitrary bodies", () => {
  // JSON-serializable な任意オブジェクト（循環なし・任意Unicodeキー/値）
  const anyJson: fc.Arbitrary<Record<string, unknown>> = fc.dictionary(
    anyUnicode,
    fc.oneof(
      anyUnicode,
      fc.integer(),
      fc.boolean(),
      fc.constant(null),
      fc.array(anyUnicode, { maxLength: 3 }),
      fc.record({ a: anyUnicode, b: fc.integer() })
    ),
    { minKeys: 0, maxKeys: 6 }
  );

  it("POST /toilets/:id/reviews never throws and honors the status contract", async () => {
    await fc.assert(
      fc.asyncProperty(anyJson, async (body) => {
        const { app } = buildApp();
        const res = await request(app)
          .post("/api/community/toilets/toilet-user-fuzz/reviews")
          .send(body);
        expect([400, 404, 201]).toContain(res.status);
        if (res.status === 400) {
          expect(typeof (res.body as any).error).toBe("string");
        }
        if (res.status === 201) {
          const b = res.body as any;
          expect(b.facilityId).toBe("toilet-user-fuzz");
          expect(typeof b.reviewCount).toBe("number");
          expect(b.review.comment).not.toMatch(/\p{C}/u);
        }
      }),
      { numRuns: 120 }
    );
  });

  it("POST /toilets/:id/report never throws and honors the status contract", async () => {
    await fc.assert(
      fc.asyncProperty(anyJson, fc.option(anyUnicode, { nil: undefined }), async (body, toiletId) => {
        const { app, store } = buildApp();
        // 404 を避けるためレビューを1件用意する（found 経路のテスト）
        await store.addToilet({
          id: "toilet-user-fuzz",
          name: "ファズ用",
          facilityType: "公衆トイレ",
          category: "park",
          dataSource: "community",
          lat: 35,
          lng: 139,
          address: "現在地周辺",
          cleanlinessGrade: "A",
          cleanlinessScore: 4,
          equipmentGrade: "A",
          equipmentScore: 4,
          subScores: { cleanliness: 4, odor: 4, supplies: 4, comfort: 4 },
          attributes: {
            hasWashlet: null,
            hasMultipurpose: null,
            hasBabyTable: null,
            hasNursingRoom: null,
            hasPowderRoom: null,
            hasOstomate: null,
            isFree: null,
            isOpen24h: false,
            hasSoap: null,
            hasAlcohol: null,
            hasPaperTowelOrDryer: null,
            toiletStyle: null,
          },
          openingHours: "x",
          description: "x",
          reviewCount: 1,
          reviews: [
            {
              id: "rev-fuzz",
              userName: "たろう",
              rating: 4,
              comment: "普通",
              createdAt: "2026-09-07",
              helpfulCount: 0,
            },
          ],
        } as any);
        const payload = { ...body };
        if (toiletId !== undefined) payload.toiletId = toiletId;
        const res = await request(app)
          .post("/api/community/reviews/rev-fuzz/report")
          .send(payload);
        expect([400, 404, 201, 409]).toContain(res.status);
        if (res.status === 400) {
          expect(typeof (res.body as any).error).toBe("string");
        }
      }),
      { numRuns: 80 }
    );
  });

  it("POST /toilets (registration) never throws and honors the status contract", async () => {
    await fc.assert(
      fc.asyncProperty(anyJson, async (body) => {
        const { app } = buildApp();
        const res = await request(app)
          .post("/api/community/toilets")
          .send(body);
        // 不正 body は 400、正当な新規は 201、ID重複は 409
        expect([400, 201, 409]).toContain(res.status);
        if (res.status === 400) {
          expect(typeof (res.body as any).error).toBe("string");
        }
      }),
      { numRuns: 120 }
    );
  });

  it("GET /toilets always returns the contract shape whatever was stored", async () => {
    await fc.assert(
      fc.asyncProperty(anyJson, async (noise) => {
        const { app, store } = buildApp();
        // 任意のゴミを先に書き込んでも GET 契約は壊れない（parse の自己修復も含む）
        await store.addToilet({
          id: "toilet-user-noise",
          name: sanitizeText(String(noise["x"] ?? "ノイズ")).trim() || "ノイズ",
          facilityType: "公衆トイレ",
          category: "park",
          dataSource: "community",
          lat: 35,
          lng: 139,
          address: "現在地周辺",
          cleanlinessGrade: "A",
          cleanlinessScore: 4,
          equipmentGrade: "A",
          equipmentScore: 4,
          subScores: { cleanliness: 4, odor: 4, supplies: 4, comfort: 4 },
          attributes: {
            hasWashlet: null, hasMultipurpose: null, hasBabyTable: null,
            hasNursingRoom: null, hasPowderRoom: null, hasOstomate: null,
            isFree: null, isOpen24h: false, hasSoap: null, hasAlcohol: null,
            hasPaperTowelOrDryer: null, toiletStyle: null,
          },
          openingHours: "x",
          description: "x",
          reviewCount: 0,
          reviews: [],
        } as any);
        const res = await request(app).get("/api/community/toilets");
        expect(res.status).toBe(200);
        const b = res.body as any;
        expect(Array.isArray(b.toilets)).toBe(true);
        expect(b.toilets.every((t: any) => typeof t.id === "string")).toBe(true);
        expect(b.externalReviews && typeof b.externalReviews === "object").toBe(true);
        for (const key of Object.keys(b.externalReviews)) {
          expect(KEY_RE.test(key), JSON.stringify(key)).toBe(true);
        }
      }),
      { numRuns: 40 }
    );
  });
});
