import { describe, expect, it } from "vitest";
import { averageRating, overlayExternalReviews } from "./externalReviews";
import type { ToiletFacility, ToiletReview } from "../types";

function mkToilet(over: Partial<ToiletFacility> = {}): ToiletFacility {
  return {
    id: "osm-2198890502",
    name: "テストトイレ",
    facilityType: "公衆トイレ",
    category: "park",
    dataSource: "osm",
    lat: 35.66,
    lng: 139.7,
    address: "東京都渋谷区",
    cleanlinessGrade: "B",
    cleanlinessScore: 3.0,
    equipmentGrade: "B",
    equipmentScore: 3.0,
    subScores: { cleanliness: 3.0, odor: 3.0, supplies: 3.0, comfort: 3.0 },
    attributes: {
      hasWashlet: false,
      hasMultipurpose: false,
      hasBabyTable: false,
      hasNursingRoom: false,
      hasPowderRoom: false,
      hasOstomate: false,
      isFree: true,
      isOpen24h: false,
      hasSoap: false,
      hasAlcohol: false,
      hasPaperTowelOrDryer: false,
      toiletStyle: "western",
    },
    openingHours: "常時開放",
    description: "",
    reviewCount: 0,
    reviews: [],
    ...over,
  };
}

const review = (id: string, rating: number, comment = "きれいでした"): ToiletReview => ({
  id,
  userName: "たろう",
  rating,
  cleanlinessScore: rating,
  odorScore: rating,
  suppliesScore: rating,
  comment,
  createdAt: "2026-09-04",
  helpfulCount: 0,
});

describe("averageRating", () => {
  it("returns null for empty and the rounded mean otherwise", () => {
    expect(averageRating([])).toBeNull();
    expect(averageRating([review("a", 5), review("b", 4)])).toBe(4.5);
    expect(averageRating([review("a", 4), review("b", 4), review("c", 5)])).toBe(4.3);
  });
});

describe("overlayExternalReviews", () => {
  it("merges server reviews (authoritative) with local-only ones and recomputes scores", () => {
    const localReview = review("rev-local-offline", 1, "オフライン投稿");
    const toilet = mkToilet({ reviews: [localReview], reviewCount: 1, cleanlinessScore: 1 });
    const server = [review("rev-srv-1", 5), review("rev-srv-2", 4)];
    const out = overlayExternalReviews(toilet, server);
    expect(out.reviews.map((r) => r.id)).toEqual(["rev-srv-1", "rev-srv-2", "rev-local-offline"]);
    expect(out.reviewCount).toBe(3);
    expect(out.cleanlinessScore).toBe(3.3); // (5+4+1)/3 = 3.33 -> 3.3
    expect(out.cleanlinessGrade).toBe("B");
  });

  it("leaves local reviews untouched when the server has none for the facility", () => {
    const toilet = mkToilet({
      reviews: [review("rev-a", 5)],
      reviewCount: 1,
      cleanlinessScore: 5,
      cleanlinessGrade: "S",
    });
    const out = overlayExternalReviews(toilet, []);
    expect(out).toBe(toilet); // 変更なし（削除系APIが無いため空リストは「何もしない」）
    expect(out.reviewCount).toBe(1);
    expect(out.cleanlinessScore).toBe(5);
  });

  it("sets lastCleaned only when the first review appears", () => {
    const plain = mkToilet();
    expect(overlayExternalReviews(plain, [review("r", 5)]).lastCleaned).toBe(
      "たった今（利用者が確認）"
    );
    const already = mkToilet({ reviews: [review("old", 4)], reviewCount: 1 });
    expect(overlayExternalReviews(already, [review("r", 5)]).lastCleaned).toBeUndefined();
  });
});

describe("次元別集計（P1 スコア集計修正）", () => {
  const dimReview = (id: string, overall: number, cleanliness: number): ToiletReview => ({
    id,
    userName: "はなこ",
    rating: overall,
    overallScore: overall,
    cleanlinessScore: cleanliness,
    odorScore: 4,
    suppliesScore: 3,
    comment: "感想です",
    createdAt: "2026-09-04",
    helpfulCount: 0,
  });

  it("recomputes cleanliness from the cleanliness dimension, not the overall rating", () => {
    const out = overlayExternalReviews(mkToilet(), [
      dimReview("a", 5, 2),
      dimReview("b", 2, 4),
    ]);
    expect(out.cleanlinessScore).toBe(3); // (2+4)/2 ← 清潔さ次元のみ
    expect(out.cleanlinessGrade).toBe("B");
    expect(out.overallScore).toBe(3.5); // (5+2)/2 ← 総合次元
    expect(out.reviewCount).toBe(2);
  });
});
