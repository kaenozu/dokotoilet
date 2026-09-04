import { describe, expect, it } from "vitest";
import type { DbFile, FacilityEntry, ReportEntry, ReviewEntry } from "./store";
import {
  buildCommitBody,
  buildCommitSubject,
  diffStores,
  emptyDb,
  formatDiff,
  formatStats,
  isDiffEmpty,
  loadDbFile,
  parseDb,
  stats,
} from "./store";

// ── フィクスチャ ──

const rev = (id: string, over: Partial<ReviewEntry> = {}): ReviewEntry => ({
  id,
  userName: "たろう",
  rating: 5,
  comment: "きれいでした",
  createdAt: "2026-09-04",
  ...over,
});

const facility = (
  id: string,
  name: string,
  reviews: ReviewEntry[] = []
): FacilityEntry => ({ id, name, reviews });

const report = (id: string, over: Partial<ReportEntry> = {}): ReportEntry => ({
  id,
  reviewId: "rev-x",
  reason: "スパム",
  createdAt: "2026-09-04",
  ...over,
});

const db = (over: Partial<DbFile> = {}): DbFile => ({
  version: 2,
  toilets: [],
  helpfulVotes: {},
  reports: [],
  reviewKeys: {},
  externalReviews: {},
  ...over,
});

// ── parseDb / loadDbFile ──

describe("parseDb", () => {
  it("parses a valid file tolerantly and drops junk entries", () => {
    const raw = {
      version: 2,
      toilets: [
        {
          id: "toilet-user-1",
          name: "渋谷トイレ",
          reviews: [
            {
              id: "rev-1",
              userName: "たろう",
              rating: 4,
              comment: "きれい",
              createdAt: "2026-09-01",
              ipHash: "deadbeefcafe", // 保存ファイルに含まれる秘密フィールド
            },
          ],
        },
        null, // 壊れた要素 → 捨てる
        { id: "toilet-user-2" }, // name欠落 → id を name に
        { reviews: [] }, // idなし → 捨てる
      ],
      helpfulVotes: { "rev-1": ["aabbccddee"] },
      reports: [{ id: "rep-1", reviewId: "rev-1", reason: "不適切", createdAt: "2026-09-02" }],
      externalReviews: { "osm-1": [{ id: "e1", userName: "はなこ", rating: 3 }] },
    };
    const d = parseDb(JSON.stringify(raw));
    expect(d.toilets).toHaveLength(2);
    expect(d.toilets[0].reviews[0].comment).toBe("きれい");
    expect(d.toilets[1].name).toBe("toilet-user-2");
    expect(d.helpfulVotes["rev-1"]).toEqual(["aabbccddee"]);
    expect(d.reports).toHaveLength(1);
    expect(d.externalReviews["osm-1"]).toHaveLength(1);
  });

  it("treats a v1 file (externalReviewsなし) as empty externalReviews", () => {
    const d = parseDb(JSON.stringify({ version: 1, toilets: [] }));
    expect(d.version).toBe(1);
    expect(d.externalReviews).toEqual({});
    expect(d.helpfulVotes).toEqual({});
    expect(d.reports).toEqual([]);
  });

  it("throws on broken JSON or a missing toilets array", () => {
    expect(() => parseDb("{not json")).toThrow();
    expect(() => parseDb(JSON.stringify({ version: 2 }))).toThrow();
    expect(() => parseDb("[]")).toThrow();
  });

  it("emptyDb is a valid, empty database", () => {
    const e = emptyDb();
    expect(e.toilets).toEqual([]);
    expect(e.externalReviews).toEqual({});
    expect(() => parseDb(JSON.stringify(e))).not.toThrow();
  });
});

describe("loadDbFile", () => {
  it("throws a readable error for a missing file", async () => {
    await expect(loadDbFile("data/__no_such_community__.json")).rejects.toThrow();
  });
});

// ── stats ──

describe("stats", () => {
  it("counts facilities, reviews, reports and votes", () => {
    const d = db({
      toilets: [
        facility("toilet-user-1", "A", [rev("r1")]),
        facility("toilet-user-2", "B", [rev("r2"), rev("r3")]),
        facility("osm-x", "C", []), // 通常は無いが念のためother扱い
      ],
      helpfulVotes: { r1: ["h1", "h2"], r2: ["h3"] },
      reports: [report("rep-1")],
      externalReviews: { "osm-1": [rev("e1")], "osm-2": [rev("e2"), rev("e3")] },
    });
    const s = stats(d);
    expect(s.communityToilets).toBe(2);
    expect(s.otherToilets).toBe(1);
    expect(s.toiletReviews).toBe(3);
    expect(s.externalReviewFacilities).toBe(2);
    expect(s.externalReviews).toBe(3);
    expect(s.reports).toBe(1);
    expect(s.voteReviews).toBe(2);
    expect(s.votes).toBe(3);
  });
});

describe("formatStats", () => {
  it("renders a one-line summary", () => {
    const line = formatStats(db({ toilets: [facility("toilet-user-1", "A", [rev("r1")])] }), "data/community.json");
    expect(line).toContain("data/community.json");
    expect(line).toContain("施設 1");
    expect(line).toContain("口コミ 1");
  });
});

// ── diffStores ──

describe("diffStores", () => {
  const before = db({
    toilets: [
      facility("toilet-user-A", "既存A", [rev("r1")]),
      facility("toilet-user-B", "消えるB", [rev("r2")]),
    ],
    helpfulVotes: { rv1: ["hash-old-1"] },
    reports: [report("rep-1")],
    externalReviews: { "osm-1": [rev("e1")], "osm-2": [rev("e2")] },
  });

  it("reports added/removed toilets, review deltas, reports and votes", () => {
    const after = db({
      toilets: [
        facility("toilet-user-A", "既存A", [rev("r1"), rev("r3", { userName: "はなこ", rating: 4, comment: "追加コメント", createdAt: "2026-09-05" })]),
        facility("toilet-user-C", "新しいC", []),
      ],
      helpfulVotes: { rv1: ["hash-old-1", "hash-new-2"], rv2: ["hash-new-3"] },
      reports: [report("rep-1"), report("rep-2", { reviewId: "r3", reason: "いたずら" })],
      externalReviews: {
        "osm-1": [rev("e1"), rev("e4", { userName: "じろう", comment: "外部追加" })],
        "osm-3": [rev("e5")],
      },
    });
    const diff = diffStores(before, after);

    expect(diff.addedToilets.map((t) => t.id)).toEqual(["toilet-user-C"]);
    expect(diff.removedToilets.map((t) => t.id)).toEqual(["toilet-user-B"]);
    expect(diff.toiletReviewChanges["toilet-user-A"].added.map((r) => r.id)).toEqual(["r3"]);
    expect(diff.toiletReviewChanges["toilet-user-A"].removed).toEqual([]);

    expect(diff.externalReviewChanges["osm-1"].added.map((r) => r.id)).toEqual(["e4"]);
    // osm-2 のレビューが消えた（＝手動キュレーションによる外部レビュー削除）
    expect(diff.externalReviewChanges["osm-2"].removed.map((r) => r.id)).toEqual(["e2"]);
    expect(diff.externalReviewChanges["osm-3"].added.map((r) => r.id)).toEqual(["e5"]);

    expect(diff.addedReports.map((r) => r.id)).toEqual(["rep-2"]);
    expect(diff.removedReports).toEqual([]);

    expect(diff.addedVotes).toBe(2); // rv1 に1票 + rv2 に1票
    expect(diff.removedVotes).toBe(0);
    expect(diff.addedVoteReviewIds).toContain("rv1");
    expect(diff.addedVoteReviewIds).toContain("rv2");
    expect(isDiffEmpty(diff)).toBe(false);
  });

  it("is empty when the databases are identical", () => {
    const d = db({ toilets: [facility("toilet-user-A", "A", [rev("r1")])] });
    const diff = diffStores(d, d);
    expect(isDiffEmpty(diff)).toBe(true);
    expect(buildCommitSubject(diff)).toBeNull();
  });

  it("detects vote removal (manual curation)", () => {
    const after = db({
      helpfulVotes: {},
      toilets: [facility("toilet-user-A", "A", [rev("r1")])],
    });
    const diff = diffStores(before, after);
    expect(diff.removedVotes).toBe(1);
    expect(diff.addedVotes).toBe(0);
  });
});

// ── formatDiff / buildCommit ──

describe("formatDiff / buildCommit", () => {
  const after = db({
    toilets: [
      facility("toilet-user-A", "既存A", [
        rev("r1"),
        rev("r3", { userName: "はなこ", rating: 4, comment: "先週よりきれい", createdAt: "2026-09-05" }),
      ]),
      facility("toilet-user-C", "新しいC", []),
    ],
    helpfulVotes: { rv1: ["iphash-aaaaaaaaaaaaaaaa"] },
    reports: [report("rep-9", { reviewId: "r3", reason: "不適切な表現" })],
  });
  const diff = diffStores(db({ toilets: [facility("toilet-user-A", "既存A", [rev("r1")])] }), after);

  it("shows review text by default and never leaks ipHash values", () => {
    const text = formatDiff(diff);
    expect(text).toContain("=== コミュニティデータ差分 ===");
    expect(text).toContain("はなこ");
    expect(text).toContain("先週よりきれい");
    expect(text).toContain("不適切な表現"); // 通報理由
    expect(text).toContain("追加施設");
    expect(text).not.toContain("iphash-aaaaaaaaaaaaaaaa"); // ipHash は出力しない
    expect(text).not.toContain("hash");
  });

  it("counts-only mode hides bodies but keeps counts", () => {
    const text = formatDiff(diff, { countsOnly: true });
    expect(text).toContain("施設: +1 / -0");
    expect(text).toContain("口コミ: +1 / -0");
    expect(text).toContain("通報: +1 / -0");
    expect(text).not.toContain("はなこ");
    expect(text).not.toContain("先週よりきれい");
    expect(text).not.toContain("不適切な表現");
  });

  it("builds a conventional commit message from the diff", () => {
    const subject = buildCommitSubject(diff);
    expect(subject).toBe("chore(data): コミュニティデータ更新（施設+1/-0, 口コミ+1/-0, 通報+1/-0, 投票+1/-0）");
    const body = buildCommitBody(diff);
    expect(body).toContain("追加施設: toilet-user-C");
    expect(body).toContain("新規通報: rep-9");
  });
});
