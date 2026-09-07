import { describe, expect, it } from "vitest";
import { ESTIMATE_MAX, estimateEquipmentScore, type EstimateInput } from "./estimate";

const base: EstimateInput = {
  category: "park",
  hasWashlet: null,
  hasMultipurpose: null,
  hasOstomate: null,
  hasBabyTable: null,
  toiletStyle: null,
  isFree: null,
  isOpen24h: null,
};

describe("estimateEquipmentScore", () => {
  it("starts at 3.0 with no information (nulls add nothing)", () => {
    const e = estimateEquipmentScore(base);
    expect(e.score).toBe(3.0);
    expect(e.grade).toBe("B");
    expect(e.capped).toBe(false);
    expect(e.basis.length).toBeGreaterThan(0);
  });

  it("rewards maintained equipment and managed categories", () => {
    const e = estimateEquipmentScore({
      ...base,
      category: "department",
      hasWashlet: true,
      hasMultipurpose: true,
      toiletStyle: "western",
    });
    // 3.0 + 0.4 + 0.2 + 0.2 + 0.4 = 4.2
    expect(e.score).toBe(4.2);
    expect(e.grade).toBe("A");
    expect(e.capped).toBe(false);
  });

  it("penalizes japanese-only toilets", () => {
    const e = estimateEquipmentScore({ ...base, toiletStyle: "japanese" });
    expect(e.score).toBe(2.7);
    expect(e.grade).toBe("C");
  });

  it(`caps the estimate at ${ESTIMATE_MAX} (S is measured-only)`, () => {
    const e = estimateEquipmentScore({
      ...base,
      category: "hotel",
      hasWashlet: true,
      hasMultipurpose: true,
      hasOstomate: true,
      hasBabyTable: true,
      toiletStyle: "western",
      isFree: false,
      isOpen24h: false,
    });
    expect(e.score).toBe(ESTIMATE_MAX);
    expect(e.grade).toBe("A");
    expect(e.capped).toBe(true);
    expect(e.basis.join("")).toContain("S級は実測のみ");
  });

  it("keeps the curated landmark exception with disclosed basis", () => {
    const e = estimateEquipmentScore({ ...base, landmark: true });
    expect(e.score).toBe(4.7);
    expect(e.grade).toBe("S");
    expect(e.capped).toBe(false);
  });
});
