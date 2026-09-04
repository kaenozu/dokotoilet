import { describe, expect, it } from "vitest";
import { convertItems, type ManualItem } from "./convert";

const base: ManualItem = {
  name: "テスト施設",
  category: "park",
  lat: 35.66,
  lng: 139.7,
  address: "東京都渋谷区テスト1-1",
  openingHours: "24時間営業",
  cleanlinessScore: 4.2,
  confidence: "high",
  scoreBasis: "口コミ10件中8件が好意的",
  equipment: {
    hasWashlet: true,
    hasMultipurpose: true,
    hasBabyTable: null,
    hasPowderRoom: null,
    isOpen24h: true,
  },
  googleMapsUrl: "https://www.google.com/maps/place/?q=place_id:ChIJTEST123",
};

const noGeo = async () => {
  throw new Error("geocode must not be called");
};

describe("convertItems", () => {
  it("maps a full item (google id + scores) without any review text", async () => {
    const { facilities, skipped, warnings } = await convertItems([base], { geocode: noGeo });
    expect(skipped).toEqual([]);
    expect(warnings).toEqual([]);
    expect(facilities).toHaveLength(1);
    const f = facilities[0];
    expect(f.id).toBe("google-ChIJTEST123");
    expect(f.dataSource).toBe("google");
    expect(f.cleanlinessScore).toBe(4.2);
    expect(f.equipmentScore).toBe(4.2);
    expect(f.attributes.hasWashlet).toBe(true);
    expect(f.attributes.hasBabyTable).toBeNull(); // 未調査(null)を false に潰さない
    // 調査で確認していない項目は true/false と断定せず null（未確認）
    expect(f.attributes.isFree).toBeNull();
    expect(f.attributes.hasSoap).toBeNull();
    expect(f.attributes.toiletStyle).toBeNull();
    // 口コミ本文は取り込まない: 常に未評価で reviews は空
    expect(f.reviewCount).toBe(0);
    expect(f.reviews).toEqual([]);
    expect(JSON.stringify(facilities)).not.toContain("rev-gmaps");
  });

  it("never embeds verbatim review text and warns when legacy excerpts are present", async () => {
    const legacy = {
      ...base,
      reviewExcerpts: [
        { text: "とても綺麗でした", rating: 5 },
        { text: "汚くて臭かった", rating: 2 },
      ],
    } as unknown as ManualItem;
    const { facilities, skipped, warnings } = await convertItems([legacy], { geocode: noGeo });
    expect(skipped).toEqual([]);
    expect(warnings).toHaveLength(1);
    expect(warnings[0].name).toBe("テスト施設");
    expect(warnings[0].reason).toContain("転載禁止");
    // 引用文は施設データのどこにも残らない
    const serialized = JSON.stringify(facilities);
    expect(serialized).not.toContain("とても綺麗でした");
    expect(serialized).not.toContain("汚くて臭かった");
    expect(facilities[0].reviewCount).toBe(0);
    expect(facilities[0].reviews).toEqual([]);
  });

  it("null score becomes neutral 3.0 with confirmation note", async () => {
    const { facilities } = await convertItems(
      [{ ...base, cleanlinessScore: null, confidence: "low" }],
      { geocode: noGeo }
    );
    expect(facilities[0].cleanlinessScore).toBe(3.0);
    expect(facilities[0].equipmentGrade).toBe("B");
    expect(facilities[0].description).toContain("要現地確認");
  });

  it("geocodes missing coordinates", async () => {
    const calls: Array<{ name: string; address: string }> = [];
    const { facilities, skipped } = await convertItems(
      [{ ...base, lat: null, lng: null }],
      {
        geocode: async (target) => {
          calls.push(target);
          return { lat: 35.1, lng: 139.1 };
        },
      }
    );
    expect(calls).toEqual([{ name: "テスト施設", address: "東京都渋谷区テスト1-1" }]);
    expect(skipped).toEqual([]);
    expect(facilities[0].lat).toBe(35.1);
  });

  it("skips when geocoding fails", async () => {
    const { facilities, skipped } = await convertItems(
      [{ ...base, lat: null, lng: null }],
      { geocode: async () => null }
    );
    expect(facilities).toHaveLength(0);
    expect(skipped[0].reason).toContain("座標なし");
  });

  it("skips invalid items (category, url)", async () => {
    const { skipped } = await convertItems(
      [
        { ...base, name: "x", category: "mars" },
        { ...base, name: "y", googleMapsUrl: "not-a-url" },
      ],
      { geocode: noGeo }
    );
    expect(skipped).toHaveLength(2);
  });

  it("records external review counts", async () => {
    const { facilities } = await convertItems(
      [{ ...base, externalReviewCount: 114, externalReviewSource: "Google Maps" }],
      { geocode: noGeo }
    );
    expect(facilities[0].externalReviewCount).toBe(114);
    expect(facilities[0].externalReviewSource).toBe("Google Maps");
  });

  it("drops invalid external review counts", async () => {
    const { facilities } = await convertItems(
      [{ ...base, externalReviewCount: -1 }],
      { geocode: noGeo }
    );
    expect(facilities[0].externalReviewCount).toBeUndefined();
    const zero = await convertItems([{ ...base, externalReviewCount: 0 }], { geocode: noGeo });
    expect(zero.facilities[0].externalReviewCount).toBe(0);
  });

  it("records coordSource in facilityNote", async () => {
    const { facilities } = await convertItems(
      [{ ...base, coordSource: "マピオン電話帳" }],
      { geocode: noGeo }
    );
    expect(facilities[0].facilityNote).toContain("マピオン電話帳");
  });
});
