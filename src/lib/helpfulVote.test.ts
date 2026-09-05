import { describe, expect, it } from "vitest";
import { adjustHelpfulCount, setHelpfulCount } from "./helpfulVote";

const facility = (): any => ({
  id: "toilet-user-1",
  reviews: [
    { id: "rev-1", helpfulCount: 2 },
    { id: "rev-2", helpfulCount: 5 },
  ],
});

describe("helpful vote helpers", () => {
  it("increments and rolls back the target review only", () => {
    const bumped = adjustHelpfulCount(facility(), "toilet-user-1", "rev-1", 1);
    expect(bumped.reviews.map((r: any) => r.helpfulCount)).toEqual([3, 5]);
    const rolledBack = adjustHelpfulCount(bumped, "toilet-user-1", "rev-1", -1);
    expect(rolledBack.reviews.map((r: any) => r.helpfulCount)).toEqual([2, 5]);
  });

  it("never rolls below zero", () => {
    const t = facility();
    t.reviews[0].helpfulCount = 0;
    expect(adjustHelpfulCount(t, "toilet-user-1", "rev-1", -1).reviews[0].helpfulCount).toBe(0);
  });

  it("syncs to the server confirmed count", () => {
    expect(setHelpfulCount(facility(), "toilet-user-1", "rev-1", 9).reviews[0].helpfulCount).toBe(9);
  });
});
