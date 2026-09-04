import { describe, expect, it } from "vitest";
import { mapKumagayaRows, parseCsv } from "./kumagaya";

const HEADER = [
  "名称", "町字ID", "所在地_連結表記", "設置位置", "緯度", "経度",
  "バリアフリートイレ数", "車椅子使用者用トイレ有無", "乳幼児用設備設置トイレ有無",
  "オストメイト設置トイレ有無", "利用開始時間", "利用終了時間", "利用可能時間特記事項",
  "男性トイレ数_和式", "男性トイレ数_洋式", "女性トイレ数_和式", "女性トイレ数_洋式",
  "男女共同トイレ数_和式", "男女共同トイレ数_洋式",
];

const row = (patch: Record<string, string> = {}): string[] => {
  const base: Record<string, string> = {
    "名称": "テスト公園便所", "町字ID": "0000001", "所在地_連結表記": "埼玉県熊谷市テスト1-1",
    "設置位置": "公園内", "緯度": "36.14", "経度": "139.38",
    "バリアフリートイレ数": "0", "車椅子使用者用トイレ有無": "無",
    "乳幼児用設備設置トイレ有無": "無", "オストメイト設置トイレ有無": "無",
    "利用開始時間": "", "利用終了時間": "", "利用可能時間特記事項": "",
    "男性トイレ数_和式": "", "男性トイレ数_洋式": "", "女性トイレ数_和式": "",
    "女性トイレ数_洋式": "", "男女共同トイレ数_和式": "", "男女共同トイレ数_洋式": "",
    ...patch,
  };
  return HEADER.map((h) => base[h] ?? "");
};

describe("parseCsv", () => {
  it("handles BOM, quotes and commas", () => {
    const rows = parseCsv('\uFEFFa,b\n"1,2",3\n');
    expect(rows).toEqual([["a", "b"], ["1,2", "3"]]);
  });
});

describe("mapKumagayaRows", () => {
  it("maps a basic row to opendata facility", () => {
    const { facilities, skipped } = mapKumagayaRows(HEADER, [row()]);
    expect(skipped).toEqual([]);
    expect(facilities).toHaveLength(1);
    const f = facilities[0];
    expect(f.id).toBe("od-kumagaya-0000001");
    expect(f.dataSource).toBe("opendata");
    expect(f.cleanlinessScore).toBe(3.4);
    expect(f.reviewCount).toBe(0);
    expect(f.attributes.isOpen24h).toBe(true);
    expect(f.openingHours).toBe("常時開放");
  });

  it("scores A with wheelchair + equipment, detects station", () => {
    const { facilities } = mapKumagayaRows(HEADER, [
      row({ "名称": "熊谷駅前便所", "車椅子使用者用トイレ有無": "有", "オストメイト設置トイレ有無": "有" }),
    ]);
    expect(facilities[0].cleanlinessScore).toBe(4.2);
    expect(facilities[0].category).toBe("station");
  });

  it("derives western style and opening hours", () => {
    const { facilities } = mapKumagayaRows(HEADER, [
      row({ "男性トイレ数_洋式": "2", "利用開始時間": "8:00:00", "利用終了時間": "17:00:00" }),
    ]);
    expect(facilities[0].attributes.toiletStyle).toBe("western");
    expect(facilities[0].attributes.isOpen24h).toBe(false);
    expect(facilities[0].openingHours).toContain("8:00:00");
  });

  it("skips rows without name or coords", () => {
    const { facilities, skipped } = mapKumagayaRows(HEADER, [
      row({ "名称": "" }),
      row({ "名称": "x", "緯度": "" }),
    ]);
    expect(facilities).toHaveLength(0);
    expect(skipped).toHaveLength(2);
  });

  it("throws on missing columns", () => {
    expect(() => mapKumagayaRows(["名称"], [row()])).toThrow();
  });

  it("uses the last occurrence of duplicated columns", () => {
    const dupHeader = [...HEADER];
    dupHeader.splice(3, 0, "緯度", "経度"); // 空の重複列を前に挿入
    const dupRow = row();
    dupRow.splice(3, 0, "", "");
    const { facilities } = mapKumagayaRows(dupHeader, [dupRow]);
    expect(facilities).toHaveLength(1);
    expect(facilities[0].lat).toBe(36.14);
  });
});
