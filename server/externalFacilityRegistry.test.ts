import { describe, expect, it } from "vitest";
import {
  ExternalFacilityRegistry,
  isExternalFacilityIdFormat,
} from "./externalFacilityRegistry";

describe("ExternalFacilityRegistry", () => {
  it("accepts only supported external facility id formats", () => {
    expect(isExternalFacilityIdFormat("osm-node-123")).toBe(true);
    expect(isExternalFacilityIdFormat("google-ChIJabc")).toBe(true);
    expect(isExternalFacilityIdFormat("od-kumagaya-001")).toBe(true);
    expect(isExternalFacilityIdFormat("toilet-user-abc")).toBe(false);
    expect(isExternalFacilityIdFormat("google-bad id")).toBe(false);
  });

  it("tracks only registered known facilities", () => {
    const registry = new ExternalFacilityRegistry([
      "google-ChIJknown",
      "od-kumagaya-001",
      "not-external",
    ]);

    expect(registry.has("google-ChIJknown")).toBe(true);
    expect(registry.has("od-kumagaya-001")).toBe(true);
    expect(registry.has("google-ChIJunknown")).toBe(false);
    expect(registry.size).toBe(2);

    registry.register("osm-way-42");
    expect(registry.has("osm-way-42")).toBe(true);
  });

  it("registers the canonical typed id for legacy static OSM seed ids", () => {
    const registry = new ExternalFacilityRegistry(["osm-2198890502"]);

    expect(registry.has("osm-2198890502")).toBe(true);
    expect(registry.has("osm-node-2198890502")).toBe(true);
    expect(registry.has("osm-way-2198890502")).toBe(false);
  });
});
