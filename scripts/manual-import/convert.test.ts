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
  reviewExcerpts: [{ text: "とても綺麗", rating: 5 }],
};

const noGeo = async () => {
  throw new Error("geocode must not be called");
};

describe("convertItems", () => {
  it("maps a full item with google id and excerpt reviews", async () => {
    const { facilities, skipped } = await convertItems([base], { geocode: noGeo, today: "2026-09-04" });
    expect(skipped).toEqual([]);
    expect(facilities).toHaveLength(1);
    const f = facilities[0];
    expect(f.id).toBe("google-ChIJTEST123");
    expect(f.dataSource).toBe("google");
    expect(f.cleanlinessScore).toBe(4.2);
    expect(f.equipmentScore).toBe(4.2);
    expect(f.attributes.hasWashlet).toBe(true);
    expect(f.attributes.hasBabyTable).toBe(false); // null -> false
    expect(f.reviewCount).toBe(1);
    expect(f.reviews[0].userName).toBe("Google口コミより引用");
    expect(f.reviews[0].createdAt).toBe("2026-09-04");
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

  it("records coordSource in facilityNote", async () => {
    const { facilities } = await convertItems(
      [{ ...base, coordSource: "マピオン電話帳" }],
      { geocode: noGeo }
    );
    expect(facilities[0].facilityNote).toContain("マピオン電話帳");
  });

  it("caps excerpts at maxExcerpts", async () => {
    const many = Array.from({ length: 8 }, (_, i) => ({ text: `口コミ${i}`, rating: 4 }));
    const { facilities } = await convertItems(
      [{ ...base, reviewExcerpts: many }],
      { geocode: noGeo, maxExcerpts: 5 }
    );
    expect(facilities[0].reviews).toHaveLength(5);
    expect(facilities[0].reviewCount).toBe(5);
  });
});
