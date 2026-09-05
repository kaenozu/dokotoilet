import { describe, expect, it } from "vitest";
import {
  isTheTokyoToiletTags,
  osmAttributesFromTags,
  triFromFee,
  triFromOpen24h,
  triFromYesNo,
  triToiletStyle,
} from "./osm";

describe("triFromYesNo", () => {
  it("maps yes/no/missing to true/false/null", () => {
    expect(triFromYesNo("yes")).toBe(true);
    expect(triFromYesNo("no")).toBe(false);
    expect(triFromYesNo(undefined)).toBeNull();
    expect(triFromYesNo("unknown")).toBeNull();
    expect(triFromYesNo("")).toBeNull();
  });
});

describe("triFromFee", () => {
  it("fee=no is free(true), fee=yes is paid(false), missing is unknown(null)", () => {
    expect(triFromFee("no")).toBe(true);
    expect(triFromFee("yes")).toBe(false);
    expect(triFromFee(undefined)).toBeNull();
    expect(triFromFee(undefined)).not.toBe(true);
  });
});

describe("triFromOpen24h", () => {
  it("only explicit 24/7 is true; explicit hours are false; missing is null", () => {
    expect(triFromOpen24h("24/7")).toBe(true);
    expect(triFromOpen24h("Mo-Su 06:00-22:00")).toBe(false);
    expect(triFromOpen24h(undefined)).toBeNull();
  });
});

describe("triToiletStyle", () => {
  it("maps toilets:position to style or null", () => {
    expect(triToiletStyle("seated")).toBe("western");
    expect(triToiletStyle("squat")).toBe("japanese");
    expect(triToiletStyle("seated_and_squat")).toBe("both");
    expect(triToiletStyle(undefined)).toBeNull();
    expect(triToiletStyle("urinal")).toBeNull();
  });
});

describe("isTheTokyoToiletTags", () => {
  it("requires an explicit project tag and never treats architect alone as membership", () => {
    expect(isTheTokyoToiletTags({ network: "The Tokyo Toilet" })).toBe(true);
    expect(isTheTokyoToiletTags({ brand: "THE TOKYO TOILET" })).toBe(true);
    expect(isTheTokyoToiletTags({ architect: "Some Architect" })).toBe(false);
    expect(isTheTokyoToiletTags({ network: "public_toilet", architect: "Some Architect" })).toBe(false);
  });
});

describe("osmAttributesFromTags", () => {
  it("explicit tags map to tri-state values", () => {
    const attrs = osmAttributesFromTags({
      washlet: "yes",
      wheelchair: "no",
      changing_table: "yes",
      ostomate: "no",
      fee: "no",
      opening_hours: "24/7",
      soap: "yes",
      "toilets:position": "seated",
    });
    expect(attrs).toEqual({
      hasWashlet: true,
      hasMultipurpose: false,
      hasBabyTable: true,
      hasNursingRoom: null,
      hasPowderRoom: null,
      hasOstomate: false,
      isFree: true,
      isOpen24h: true,
      hasSoap: true,
      hasAlcohol: null,
      hasPaperTowelOrDryer: null,
      toiletStyle: "western",
    });
  });

  it("missing tags are null, never true (no optimistic defaults)", () => {
    const attrs = osmAttributesFromTags({});
    for (const v of Object.values(attrs)) expect(v).toBeNull();
  });

  it("fee missing is not treated as free", () => {
    const attrs = osmAttributesFromTags({});
    expect(attrs.isFree).toBeNull();
    const paid = osmAttributesFromTags({ fee: "yes" });
    expect(paid.isFree).toBe(false);
  });
});
