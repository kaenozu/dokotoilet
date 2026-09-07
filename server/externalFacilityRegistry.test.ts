import { describe, expect, it } from "vitest";
import {
  canonicalizeExternalFacilityId,
  ExternalFacilityRegistry,
  isExternalFacilityIdFormat,
} from "./externalFacilityRegistry";
import { INITIAL_TOILETS } from "../src/data/toilets";
import { GOOGLE_SEED } from "../src/data/googleSeed";
import { KUMAGAYA_SEED } from "../src/data/kumagayaSeed";
import { canonicalizeSeedOsmFacility } from "../src/lib/osmIds";
// ルーターは community.ts 側の再輸出（isExternalFacilityId）を使うため、
// ここで両経路の一致も全行で固定する（二重実装への再分裂を防止）。
import { isExternalFacilityId } from "./community";

describe("ExternalFacilityRegistry", () => {
  it("accepts only supported external facility id formats", () => {
    expect(isExternalFacilityIdFormat("osm-node-123")).toBe(true);
    expect(isExternalFacilityIdFormat("google-ChIJabc")).toBe(true);
    expect(isExternalFacilityIdFormat("od-kumagaya-001")).toBe(true);
    expect(isExternalFacilityIdFormat("toilet-user-abc")).toBe(false);
    expect(isExternalFacilityIdFormat("google-bad id")).toBe(false);
  });

  it("tracks only registered known facilities", () => {
    const registry = new ExternalFacilityRegistry([
      "google-ChIJknown",
      "od-kumagaya-001",
      "not-external",
    ]);

    expect(registry.has("google-ChIJknown")).toBe(true);
    expect(registry.has("od-kumagaya-001")).toBe(true);
    expect(registry.has("google-ChIJunknown")).toBe(false);
    expect(registry.size).toBe(2);

    registry.register("osm-way-42");
    expect(registry.has("osm-way-42")).toBe(true);
  });

  it("registers the canonical typed id for legacy static OSM seed ids", () => {
    const registry = new ExternalFacilityRegistry(["osm-2198890502"]);

    expect(registry.has("osm-2198890502")).toBe(true);
    expect(registry.has("osm-node-2198890502")).toBe(true);
    expect(registry.has("osm-way-2198890502")).toBe(false);
  });
});

// ── 敵対的入力のテーブルテスト（挙動の固定） ──
//
// ポリシー: 施設IDは不透明な識別子。Unicode文字（\p{L} / \p{N}）と _ - は
// プレフィックス以外そのまま許す（自治体ODの日本語・アラビア語・ヘブライ語等の
// 実在IDを受け止めるため）。拒否対象は「可視文字に化ける不可視の制御」
// （双方向制御・結合文字・変種セレクタ・ZWSP/ZWJ など。スプーフィングに使われる）
// と空白・制御文字・長さ超過。
// NFC正準化ポリシー: 検証前に正準形（NFC）へ写像する。IDは externalReviews のキー/
// Firestore ドキュメントIDとしてそのまま使うため、見た目が同じでも符号化が違う
// 文字列（Jamo vs 合成済みハングル等）が別施設として登録されるのを防ぐ。文字セットに
// 結合文字（\p{M}）が含まれないため、正準化で長さが増える分解型入力は存在しない。

const ACCEPTED: Array<[string, string]> = [
  ["alphanumeric osm id", "osm-node-123"],
  ["underscore allowed", "od-kumagaya_001"],
  ["consecutive hyphens", "google-x--y"],
  ["japanese od seed class", "od-熊谷駅"],
  ["mixed rtl+cjk scripts", "google-العربيةאבג中文"],
  ["pure rtl script letters", "google-אבג"],
  ["precomposed accent", "google-café"],
  // 分解型は拒否ではなく正準形へ写像した上で受理される（同じIDに合流）
  ["decomposed accent (NFD, canonicalized to google-café)", "google-cafe\u0301"],
  ["decomposed katakana dakuten (canonicalized to ガ)", "od-\u30AB\u3099\u30D5\u30A7"],
  ["hangul jamo L+V (canonicalized to composed 가)", "google-\u1100\u1161"],
  ["typographic ligature", "google-ﬁn"],
  ["fullwidth latin letter", "google-Ａ"],
  ["superscript number (No)", "od-²"],
  ["arabic-indic digits (Nd)", "od-١٢٣"],
  ["boundary: 80 cjk code points", "od-" + "あ".repeat(80)],
  ["boundary: 80 astral code points (160 utf-16 units)", "google-" + "\u{29B3D}".repeat(80)],
  ["boundary: 80 hyphens", "od-" + "-".repeat(80)],
];

const REJECTED: Array<[string, string]> = [
  ["community toilet id", "toilet-user-abc"],
  ["uppercase prefix", "OSM-x"],
  ["empty body", "google-"],
  ["missing prefix", "node-123"],
  ["space", "google-bad id"],
  ["trailing space", "google-x "],
  ["newline", "google-a\nb"],
  ["tab", "google-a\tb"],
  ["nul", "google-a\u0000b"],
  ["bidi LRM (U+200E)", "google-\u200Eoffice"],
  ["bidi RLO (U+202E) embedded", "google-a\u202Eb"],
  ["bidi LRO (U+202D)", "google-\u202Da"],
  ["bidi PDF (U+202C)", "google-a\u202C"],
  ["bidi LRI/PDI (U+2066/U+2069)", "google-\u2066a\u2069"],
  ["bidi ALM (U+061C)", "google-\u061Ca"],
  ["combining mark only", "google-\u0301"],
  ["non-composable accent (q + combining)", "google-q\u0301"],
  ["decomposed katakana with doubled dakuten", "od-\u30CF\u309A\u309A"],
  ["variation selector", "google-あ\uFE0F"],
  ["zero width space", "google-a\u200Bb"],
  ["zero width joiner", "google-a\u200Db"],
  ["unicode tag character", "google-\u{E0041}"],
  ["circled letter (So)", "google-\u249C"],
  ["non-breaking space", "google-a\u00A0b"],
  ["boundary: 81 cjk code points", "od-" + "あ".repeat(81)],
  ["boundary: 81 astral code points", "google-" + "\u{29B3D}".repeat(81)],
];

describe("isExternalFacilityIdFormat adversarial table", () => {
  it.each(ACCEPTED)("%s", (_label, id) => {
    expect(isExternalFacilityIdFormat(id)).toBe(true);
  });

  it.each(REJECTED)("%s", (_label, id) => {
    expect(isExternalFacilityIdFormat(id)).toBe(false);
  });

  it("counts code points, not utf-16 code units (u flag semantics)", () => {
    // {1,80} は本文部分のコードポイント数を数える（u フラグ）。UTF-16 単位ではない:
    // astral 40 文字は UTF-16 では 80 単位だが 40 コードポイントなので余裕で受理。
    // さらに astral 80 文字（UTF-16 で 160 単位）でも受理される。実質上限は
    // 「本文 80 コードポイント」であり、UTF-16 長での見た目の長さとは一致しない。
    const astral = "\u{29B3D}";
    expect(("google-" + astral.repeat(40)).length).toBe(87); // 7 + 40×2
    expect(isExternalFacilityIdFormat("google-" + astral.repeat(40))).toBe(true);
    expect(("google-" + astral.repeat(80)).length).toBe(167); // 7 + 80×2
    expect(isExternalFacilityIdFormat("google-" + astral.repeat(80))).toBe(true);
    expect(isExternalFacilityIdFormat("google-" + astral.repeat(81))).toBe(false);
    // BMP（CJK）でも同じコードポイント境界で切れる
    expect(isExternalFacilityIdFormat("od-" + "あ".repeat(80))).toBe(true);
    expect(isExternalFacilityIdFormat("od-" + "あ".repeat(81))).toBe(false);
  });
});

describe("ExternalFacilityRegistry adversarial ids", () => {
  it("stores accepted ids and silently skips rejected ones", () => {
    const registry = new ExternalFacilityRegistry();
    expect(registry.register("google-אבג")).toBe(true);
    expect(registry.has("google-אבג")).toBe(true);

    expect(registry.register("google-a\u202Eb")).toBe(false);
    expect(registry.register("google-q\u0301")).toBe(false);
    expect(registry.register("google-\u200Eoffice")).toBe(false);
    expect(registry.has("google-a\u202Eb")).toBe(false);
    expect(registry.size).toBe(1);

    // registerMany も拒否行を無視して続行する（起動時のシード登録で投げない）
    registry.registerMany(["od-熊谷駅", "google-\u202Cb", "google-b"]);
    expect(registry.has("od-熊谷駅")).toBe(true);
    expect(registry.has("google-b")).toBe(true);
    expect(registry.size).toBe(3);
  });

  it("stores the canonical (NFC) form: decomposed input aliases to the composed id", () => {
    const registry = new ExternalFacilityRegistry();
    expect(registry.register("google-cafe\u0301")).toBe(true);
    // 正準形で登録され、正準形の問い合わせにヒットする
    expect(registry.has("google-café")).toBe(true);
    expect(registry.register("google-\u1100\u1161")).toBe(true);
    expect(registry.has("google-가")).toBe(true);
    // 同一正準形の再登録は冪等（Set なので増えない）
    expect(registry.register("google-café")).toBe(true);
    expect(registry.size).toBe(2);
  });

  it("non-composable decomposed forms stay rejected after canonicalization", () => {
    const registry = new ExternalFacilityRegistry();
    expect(registry.register("google-q\u0301")).toBe(false);
    expect(registry.register("od-\u30CF\u309A\u309A")).toBe(false);
    expect(registry.register("google-\u0301")).toBe(false);
    expect(registry.size).toBe(0);
  });

  it("treats bidi/whitespace lookalikes as different ids, never as aliases", () => {
    const registry = new ExternalFacilityRegistry(["google-office"]);
    expect(registry.has("google-office")).toBe(true);
    expect(registry.has("google-\u200Eoffice")).toBe(false);
    expect(registry.has("google-office ")).toBe(false);
    expect(registry.has("google-office\u202B")).toBe(false);
  });
});

describe("community.isExternalFacilityId parity with registry predicate", () => {
  // ルーターの施設検証（community.ts）と registry（runtime・CLI）が
  // 常に同じ判定を返すことを、受理・拒否の全行で固定する。
  it.each([...ACCEPTED, ...REJECTED])("%s", (_label, id) => {
    expect(isExternalFacilityId(id)).toBe(isExternalFacilityIdFormat(id));
  });
});

describe("canonicalizeExternalFacilityId", () => {
  it("maps decomposed forms to their composed canonical id", () => {
    expect(canonicalizeExternalFacilityId("google-cafe\u0301")).toBe("google-café");
    expect(canonicalizeExternalFacilityId("google-\u1100\u1161")).toBe("google-가");
    expect(canonicalizeExternalFacilityId("od-\u30AB\u3099")).toBe("od-ガ");
  });

  it("is idempotent and leaves canonical ids untouched", () => {
    const once = canonicalizeExternalFacilityId("google-café");
    expect(once).toBe("google-café");
    expect(canonicalizeExternalFacilityId(once)).toBe(once);
    // Jamo も1回で合成済みに収束する
    const jamo = canonicalizeExternalFacilityId("google-\u1100\u1161");
    expect(canonicalizeExternalFacilityId(jamo)).toBe(jamo);
  });

  it("passes non-external ids through unchanged (community toilet ids)", () => {
    // toilet-user-* は外部施設IDではないので正準化しない（既存キーを保護）
    expect(canonicalizeExternalFacilityId("toilet-user-cafe\u0301")).toBe(
      "toilet-user-cafe\u0301"
    );
    expect(canonicalizeExternalFacilityId("toilet-user-abc123")).toBe("toilet-user-abc123");
  });

  it("length boundary counts canonical (composed) code points, not raw units", () => {
    // 80CPの分解型「か+濁点」は正準化で40CPになり受理される
    const decomposed80 = "od-" + "\u304B\u3099".repeat(40);
    expect(isExternalFacilityIdFormat(decomposed80)).toBe(true);
    // 逆に、正準形が81CPを超える分解型入力は受理されない
    const growsOver = "od-" + "\u304B\u3099".repeat(40) + "\u304B\u3099\u3099";
    expect(isExternalFacilityIdFormat(growsOver)).toBe(false);
  });

  it("never canonicalizes away a real id: every seed id is NFC-stable and accepted", () => {
    const seedIds = [
      ...INITIAL_TOILETS.map((t) => t.id),
      ...INITIAL_TOILETS.map((t) => canonicalizeSeedOsmFacility(t).id),
      ...GOOGLE_SEED.map((t) => t.id),
      ...KUMAGAYA_SEED.map((t) => t.id),
    ].filter((id) => /^(osm|google|od)-/u.test(id));
    expect(seedIds.length).toBeGreaterThan(0);
    for (const id of new Set(seedIds)) {
      expect(canonicalizeExternalFacilityId(id)).toBe(id); // すでに正準形
      expect(isExternalFacilityIdFormat(id)).toBe(true);
    }
  });
});
