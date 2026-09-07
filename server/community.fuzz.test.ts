// Property-based fuzz tests (fast-check) for the community validators.
//
// 例示ベースの監査スイート（community.unicode.test.ts）を補完し、「任意の
// Unicode 入力」に対する普遍的な保証を検証する:
//   1. バリデータはどんな入力でも例外を投げない（crash-proof）
//   2. 受理された入力の保存値は常に: category-C文字を含まない・長さ上限以内・
//      生入力より長くならない・不可視のみなら拒否
//   3. URLの途中にどんな不可視文字を挿入しても検出される（G1閉鎖の全挿入位置網羅）
//   4. sanitizeText は長さを増やさず・冪等で・出力に \p{C} を含まない
//   5. 施設ID正準化は冪等で、レジストリは正準形のみを格納する
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  validateToiletInput,
  validateReviewInput,
  validateReportInput,
} from "./community";
import { sanitizeText } from "./shared/textPolicy";
import {
  canonicalizeExternalFacilityId,
  ExternalFacilityRegistry,
} from "./externalFacilityRegistry";

// ── 任意Unicode文字列のアービトラリ（バイト列 → 非fatalデコード）。
//    ランダムなサロゲート断片・未割当・category-Cもすべて含む。
const anyUnicode: fc.Arbitrary<string> = fc
  .uint8Array({ minLength: 0, maxLength: 120 })
  .map((bytes) => new TextDecoder("utf-8", { fatal: false }).decode(bytes));

// 可視 ASCII（0x20〜0x7E）のみの文字列（URL の前後に挟むノイズ用）
const printableAsciiString = fc
  .array(fc.integer({ min: 0x20, max: 0x7e }).map((c) => String.fromCharCode(c)), {
    minLength: 0,
    maxLength: 60,
  })
  .map((chars) => chars.join(""));

// category-C（\p{C}）の代表コードポイント。Cn は膨大なため代表値に絞る。
// 注意: U+0085（NEL）・U+2028/U+2029（Zl/Zp）は \p{C} 以外だが sanitizer が
// 「空白に置換」する文字。空白は URL パターンを壊す（表示も崩れる）ため不可視
// 難匿ではなく本来の挙動なので、ここには含めない。U+0085 は \p{Cc} 相当の扱いで
// も空白置換される特例（PR #67 の newline-rewrite ポリシー）。
// 可視 ASCII（0x20〜0x7E）ノイズと区別するため、ここでは純粋な不可視除去対象のみ。
const categoryCChar = fc.constantFrom(
  "\u0000", "\u0007", "\u001B", "\u007F",
  "\u009F",
  "\u00AD", // SOFT HYPHEN (Cf)
  "\u200B", "\u200E", "\u202E", "\u2069", // ZWSP, LRM, RLO, PDI (Cf)
  "\u{E0041}", // tag char (Cf)
  "\u{E000}", // private use (Co)
  "\uD800", "\uDBFF" // lone surrogates (Cs)
);

const validReview = (over: Record<string, unknown> = {}) => ({
  userName: "たろう",
  overallScore: 4,
  cleanlinessScore: 4,
  odorScore: 4,
  suppliesScore: 4,
  comment: "普通のトイレでした",
  ...over,
});

const validToilet = (over: Record<string, unknown> = {}) => ({
  id: "toilet-user-fuzz",
  name: "テストトイレ",
  category: "park",
  lat: 35.66,
  lng: 139.7,
  cleanlinessScore: 4.5,
  ...over,
});

const C_RE = /\p{C}/gu;

describe("property: validators never throw on arbitrary input", () => {
  it("validateReviewInput survives arbitrary bodies", () => {
    fc.assert(
      fc.property(
        fc.dictionary(anyUnicode, anyUnicode, { minKeys: 0, maxKeys: 4 }),
        fc.option(anyUnicode, { nil: undefined }),
        fc.option(fc.integer({ min: -100, max: 100 }), { nil: undefined }),
        (strings, comment, score) => {
          const body: Record<string, unknown> = { ...strings };
          if (comment !== undefined) body.comment = comment;
          if (score !== undefined) body.overallScore = score;
          expect(() => validateReviewInput(body)).not.toThrow();
        }
      ),
      { numRuns: 500 }
    );
  });

  it("validateReportInput survives arbitrary bodies", () => {
    fc.assert(
      fc.property(
        fc.dictionary(anyUnicode, anyUnicode, { minKeys: 0, maxKeys: 4 }),
        fc.option(anyUnicode, { nil: undefined }),
        (strings, reason) => {
          const body: Record<string, unknown> = { ...strings };
          if (reason !== undefined) body.reason = reason;
          expect(() => validateReportInput(body)).not.toThrow();
        }
      ),
      { numRuns: 500 }
    );
  });

  it("validateToiletInput survives arbitrary bodies", () => {
    fc.assert(
      fc.property(
        fc.dictionary(anyUnicode, anyUnicode, { minKeys: 0, maxKeys: 4 }),
        fc.option(anyUnicode, { nil: undefined }),
        (strings, name) => {
          const body: Record<string, unknown> = { ...validToilet(), ...strings };
          if (name !== undefined) body.name = name;
          expect(() => validateToiletInput(body)).not.toThrow();
        }
      ),
      { numRuns: 500 }
    );
  });
});

describe("property: accepted input never bypasses the guarantees", () => {
  it("accepted comments are category-C-free, within length, non-empty, and never longer than the raw input", () => {
    fc.assert(
      fc.property(anyUnicode, (comment) => {
        const r = validateReviewInput(validReview({ comment }));
        if (!r.ok) return;
        const stored = r.value!.comment;
        expect(stored.length).toBeLessThanOrEqual(1000);
        expect(stored.length).toBeLessThanOrEqual(comment.length);
        expect(stored).not.toMatch(C_RE);
        expect(stored.trim().length).toBeGreaterThan(0);
      }),
      { numRuns: 1000 }
    );
  });

  it("accepted reasons obey the same invariants", () => {
    fc.assert(
      fc.property(anyUnicode, (reason) => {
        const r = validateReportInput({ reason });
        if (!r.ok) return;
        const stored = r.value!.reason;
        expect(stored.length).toBeLessThanOrEqual(500);
        expect(stored.length).toBeLessThanOrEqual(reason.length);
        expect(stored).not.toMatch(C_RE);
        expect(stored.trim().length).toBeGreaterThan(0);
      }),
      { numRuns: 1000 }
    );
  });

  it("accepted userNames are sanitized, within length, or the anonymous default", () => {
    fc.assert(
      fc.property(anyUnicode, (userName) => {
        const r = validateReviewInput(validReview({ userName }));
        if (!r.ok) return;
        const stored = r.value!.userName;
        expect(stored.length).toBeLessThanOrEqual(30);
        expect(stored).not.toMatch(C_RE);
        // 不可視のみの名前は匿名フォールバックに落ちる
        if (sanitizeText(userName).trim().length === 0) {
          expect(stored).toBe("匿名の利用者");
        }
      }),
      { numRuns: 1000 }
    );
  });

  it("accepted toilet registration fields are category-C-free and never grown", () => {
    fc.assert(
      fc.property(anyUnicode, anyUnicode, (name, address) => {
        const r = validateToiletInput(validToilet({ name, address }));
        if (!r.ok) return;
        const storedName = r.value!.name;
        // 不可視のみの name は拒否されるため、受理された name は必ず非空で清浄
        expect(storedName.length).toBeGreaterThan(0);
        expect(storedName).not.toMatch(C_RE);
        expect(storedName.length).toBeLessThanOrEqual(name.length);
        // address は不可視のみの場合「現在地周辺」へフォールバックする（増え得るのは
        // その場合のみ）。それ以外は生入力以下で清浄。
        const storedAddress = r.value!.address;
        expect(storedAddress).not.toMatch(C_RE);
        expect(storedAddress.length).toBeGreaterThan(0);
        expect(storedAddress.length).toBeLessThanOrEqual(
          Math.max(address.length, "現在地周辺".length)
        );
      }),
      { numRuns: 1000 }
    );
  });

  it("URL-bearing comments are always rejected, whatever printable ASCII surrounds them", () => {
    fc.assert(
      fc.property(printableAsciiString, printableAsciiString, (pre, post) => {
        const skeletons = [
          `${pre}https://spam.example${post}`,
          `${pre}www.spam.example${post}`,
        ];
        for (const comment of skeletons) {
          const r = validateReviewInput(validReview({ comment }));
          expect(r.ok, JSON.stringify(comment)).toBe(false);
          expect(r.error).toBe("comment must not contain URLs");
        }
      }),
      { numRuns: 300 }
    );
  });
});

describe("property: invisible-character insertion cannot hide a URL (G1, all positions)", () => {
  const injections: Array<(u: string) => string> = [
    (u) => `h${u}ttp://spam.example`,
    (u) => `https:/${u}/spam.example`,
    (u) => `https${u}://spam.example`,
    (u) => `ww${u}w.spam.example`,
    (u) => `spam.example${u}.com`,
    (u) => `spam${u}.example.com`,
  ];

  for (const [i, inject] of injections.entries()) {
    it(`injection pattern #${i + 1} is always detected`, () => {
      fc.assert(
        fc.property(
          fc.array(categoryCChar, { minLength: 1, maxLength: 4 }),
          (chars) => {
            const comment = inject(chars.join(""));
            const r = validateReviewInput(validReview({ comment }));
            expect(r.ok, JSON.stringify(comment)).toBe(false);
            expect(r.error).toBe("comment must not contain URLs");
          }
        ),
        { numRuns: 500 }
      );
    });
  }
});

describe("property: sanitizeText invariants", () => {
  it("output contains no category-C characters", () => {
    fc.assert(
      fc.property(anyUnicode, (input) => {
        expect(sanitizeText(input)).not.toMatch(C_RE);
      }),
      { numRuns: 1000 }
    );
  });

  it("never grows the string and is idempotent", () => {
    fc.assert(
      fc.property(anyUnicode, (input) => {
        const once = sanitizeText(input);
        expect(once.length).toBeLessThanOrEqual(input.length);
        expect(sanitizeText(once)).toBe(once);
      }),
      { numRuns: 1000 }
    );
  });
});

describe("property: facility-id canonicalization", () => {
  it("canonical form is idempotent for every string", () => {
    fc.assert(
      fc.property(anyUnicode, (id) => {
        const once = canonicalizeExternalFacilityId(id);
        expect(canonicalizeExternalFacilityId(once)).toBe(once);
      }),
      { numRuns: 500 }
    );
  });

  it("a registered id is always found via its canonical form", () => {
    fc.assert(
      fc.property(fc.array(anyUnicode, { minLength: 0, maxLength: 8 }), (ids) => {
        const registry = new ExternalFacilityRegistry();
        for (const id of ids) {
          if (registry.register(id)) {
            const canonical = canonicalizeExternalFacilityId(id);
            expect(registry.has(canonical), JSON.stringify(id)).toBe(true);
          }
        }
      }),
      { numRuns: 200 }
    );
  });
});
