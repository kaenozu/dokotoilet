// Adversarial Unicode audit for the user-facing text validators:
// validateReviewInput (userName / comment) and validateReportInput (reason).
//
// Same method as PR #61's external-facility-id table tests: probe the real
// implementation empirically, then pin the observed behavior row by row. This
// suite deliberately does NOT change validator behavior — it freezes what is
// and is not protected today, so any future hardening is a conscious, reviewed
// change that updates these tables deliberately.
//
// ─── Audit summary ──────────────────────────────────────────────
// Protections in place today:
//   P1 UTF-16 length caps per field (MAX.userName/comment/reason)
//   P2 trim() emptiness check (Unicode White_Space only)
//   P3 URL_RE blocks plain/case-variant/RLO-prefixed URLs
//   P4 lone surrogates survive the JSON round-trip used by persistence
//
// Known gaps (pinned below, intentionally unchanged):
//   G1 URL_RE evasion — ZWSP-split (https:\u200B//) and fullwidth-colon forms were
//      originally accepted; the broadened URL_RE (h\s*t\s*t\s*p + TLD patterns)
//      now rejects them. Still open: LRM inside the scheme (h\u200Ettps://) and
//      fullwidth scheme letters — the literal-ASCII pattern cannot see them
//   G2 invisible-only content (ZWSP/LRM) passes the non-empty checks;
//      a ZWSP-only userName is stored verbatim instead of 匿名の利用者
//   G3 control (NUL/BEL/DEL), bidi, tag characters and lone surrogates are
//      stored verbatim (spoofing / log-injection surface)
//   G4 length limits count UTF-16 code units — astral glyphs cost 2 units,
//      so emoji-heavy names get half the perceived budget
//   G5 no NFC normalization: NFD input passes through un-normalized
// ────────────────────────────────────────────────────────────────

import { describe, expect, it } from "vitest";
import { validateReviewInput, validateReportInput } from "./community";

const goodReview = () => ({
  userName: "たろう",
  overallScore: 4,
  cleanlinessScore: 4,
  odorScore: 4,
  suppliesScore: 4,
  comment: "普通のトイレでした",
});

describe("adversarial Unicode: URL filter (URL_RE)", () => {
  it.each([
    ["https URL", "see https://spam.example"],
    ["uppercase HTTPS URL", "see HTTPS://SPAM.EXAMPLE"],
    ["www host", "see www.spam.example"],
    ["uppercase WWW host", "see WWW.SPAM.EXAMPLE"],
    // RLO *before* the scheme does not help the spammer: URL_RE still sees
    // the literal "https://" — pinned so this stays true.
    ["RLO-prefixed https URL", "\u202Ehttps://spam.example"],
    // 以下は元監査（PR #62）で「G1: 見逃す」と固定されていた行。URL_RE の拡張
    // （h\s*t\s*t\s*p は任意の ASCII "http" に一致、加えてTLDパターン）により
    // 拒否に変わった。意図的な強化であり、この固定により検知された。
    ["ZWSP between ':' and '//' (https:\\u200B//)", "https:\u200B//spam.example"],
    ["fullwidth colon", "https\uFF1A//spam.example"],
    // 副作用として、URLでない本文中の "http" やTLD風表記も拒否される（過剰拒否）
    ["bare word http in prose", "これはhttpです"],
    ["TLD-like mention without scheme", "見て spam.example.com"],
  ])("rejects %s", (_label, comment) => {
    const r = validateReviewInput({ ...goodReview(), comment });
    expect(r.ok).toBe(false);
    expect(r.error).toBe("comment must not contain URLs");
  });

  it.each([
    // 残る G1: 非ASCII文字を挟む/置き換える形は、ASCIIを前提とする URL_RE が
    // 本来のURLとして認識できないため見逃される（レンダリング上はURLに見える）。
    ["LRM inside the scheme (h\\u200Ettps://)", "h\u200Ettps://spam.example"],
    ["fullwidth scheme letters", "\uFF48\uFF54\uFF54\uFF50\uFF53://spam.example"],
  ])("does NOT catch %s (G1, remaining)", (_label, comment) => {
    const r = validateReviewInput({ ...goodReview(), comment });
    expect(r.ok).toBe(true);
  });

  it("does not catch the LRM-obfuscated URL in report reason either (G1)", () => {
    const r = validateReportInput({ reason: "h\u200Ettps://spam.example" });
    expect(r.ok).toBe(true);
    // The invisible character is stored verbatim.
    expect(r.value?.reason).toBe("h\u200Ettps://spam.example");
  });
});

describe("adversarial Unicode: invisible-only content defeats non-empty checks (G2)", () => {
  it.each([
    ["comment of 10 ZWSP", () =>
      validateReviewInput({ ...goodReview(), comment: "\u200B".repeat(10) })],
    ["reason of a single LRM", () => validateReportInput({ reason: "\u200E" })],
    ["reason of two ZWSP", () => validateReportInput({ reason: "\u200B\u200B" })],
  ])("%s is accepted — trim() only strips Unicode White_Space", (_label, run) => {
    expect(run().ok).toBe(true);
  });

  it("a ZWSP-only userName passes and is stored verbatim, not replaced with the anonymous default", () => {
    const r = validateReviewInput({ ...goodReview(), userName: "\u200B\u200B" });
    expect(r.ok).toBe(true);
    expect(r.value?.userName).toBe("\u200B\u200B");
  });

  it("ZWSP padding around a userName is preserved (not trimmed)", () => {
    const r = validateReviewInput({ ...goodReview(), userName: "\u200Babc\u200B" });
    expect(r.value?.userName).toBe("\u200Babc\u200B");
  });
});

describe("adversarial Unicode: control / bidi / unpaired characters stored verbatim (G3)", () => {
  it.each([
    ["NUL", "a\u0000b"],
    ["BEL and DEL", "a\u0007b\u007F"],
    ["bidi isolate (PDI)", "a\u{A9C0}b"],
    ["Unicode tag character", "a\u{E0041}b"],
    ["lone high surrogate", "a\uD800b"],
    ["embedded RLO", "abc\u202Exyz"],
  ])("comment with %s is accepted and stored verbatim", (_label, comment) => {
    const r = validateReviewInput({ ...goodReview(), comment });
    expect(r.ok).toBe(true);
    expect(r.value?.comment).toBe(comment);
  });

  it.each([
    ["NUL", "a\u0000b"],
    ["embedded RLO", "abc\u202Exyz"],
    ["leading combining mark", "\u0301abc"],
  ])("userName with %s is accepted and stored verbatim", (_label, userName) => {
    const r = validateReviewInput({ ...goodReview(), userName });
    expect(r.ok).toBe(true);
    expect(r.value?.userName).toBe(userName);
  });

  it("a lone surrogate survives the JSON round-trip used by the persistence layer (P4)", () => {
    const parsed = JSON.parse(JSON.stringify({ comment: "a\uD800b" })) as {
      comment: string;
    };
    expect(parsed.comment).toBe("a\uD800b");
    expect(parsed.comment.length).toBe(3);
  });
});

describe("adversarial Unicode: what does work", () => {
  it("trims NBSP and ideographic space (both are Unicode White_Space)", () => {
    const nbsp = validateReviewInput({ ...goodReview(), userName: "\u00A0abc\u00A0" });
    const ideographic = validateReviewInput({ ...goodReview(), userName: "\u3000abc\u3000" });
    expect(nbsp.value?.userName).toBe("abc");
    expect(ideographic.value?.userName).toBe("abc");
  });

  it.each([
    ["userName at exactly 30 UTF-16 units", "userName", "x".repeat(30), true],
    ["userName at 31 UTF-16 units", "userName", "x".repeat(31), false],
    ["userName of 15 astral emoji (30 units)", "userName", "\u{1F600}".repeat(15), true],
    ["userName of 16 astral emoji (32 units)", "userName", "\u{1F600}".repeat(16), false],
    ["comment of 500 astral emoji (1000 units)", "comment", "\u{1F600}".repeat(500), true],
    ["comment of 501 astral emoji (1002 units)", "comment", "\u{1F600}".repeat(501), false],
  ] as const)("%s", (_label, field, value, ok) => {
    const r = validateReviewInput({ ...goodReview(), [field]: value });
    expect(r.ok).toBe(ok);
  });

  it.each([
    ["reason of 250 astral emoji (500 units)", "\u{1F600}".repeat(250), true],
    ["reason of 251 astral emoji (502 units)", "\u{1F600}".repeat(251), false],
  ] as const)("reason length: %s", (_label, reason, ok) => {
    expect(validateReportInput({ reason }).ok).toBe(ok);
  });

  it("accepts NFD text un-normalized (G5) and fullwidth characters as-is", () => {
    const nfd = validateReviewInput({ ...goodReview(), comment: "cafe\u0301 desu" });
    expect(nfd.ok).toBe(true);
    expect(nfd.value?.comment).toBe("cafe\u0301 desu");
    const fullwidth = validateReviewInput({ ...goodReview(), userName: "ＡＢＣ" });
    expect(fullwidth.value?.userName).toBe("ＡＢＣ");
  });

  it("rejects non-string text fields", () => {
    expect(validateReviewInput({ ...goodReview(), userName: 42 }).error).toBe("invalid userName");
    expect(validateReviewInput({ ...goodReview(), comment: ["x"] }).error).toBe("invalid comment");
    expect(validateReportInput({ reason: null }).error).toBe("invalid reason");
  });
});
