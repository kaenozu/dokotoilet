import { describe, expect, it, vi } from "vitest";
import type { NextFunction, Request, Response } from "express";
import { asyncRoute, isExternalFacilityId } from "./community";

describe("asyncRoute", () => {
  it("forwards rejected promises to next()", async () => {
    const error = new Error("boom");
    const next = vi.fn() as unknown as NextFunction;
    const handler = asyncRoute(async () => {
      throw error;
    });

    handler({} as Request, {} as Response, next);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(next).toHaveBeenCalledTimes(1);
    expect(next).toHaveBeenCalledWith(error);
  });

  it("does not call next() for a resolved handler", async () => {
    const next = vi.fn() as unknown as NextFunction;
    const handler = asyncRoute(async () => {});

    handler({} as Request, {} as Response, next);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(next).not.toHaveBeenCalled();
  });
});

describe("isExternalFacilityId", () => {
  it("matches only supported external id prefixes", () => {
    expect(isExternalFacilityId("osm-node-123")).toBe(true);
    expect(isExternalFacilityId("google-ChIJabc")).toBe(true);
    expect(isExternalFacilityId("od-kumagaya-1")).toBe(true);
    expect(isExternalFacilityId("toilet-user-abc")).toBe(false);
    expect(isExternalFacilityId("google-bad id")).toBe(false);
  });
});
