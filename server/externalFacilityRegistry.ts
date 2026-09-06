const EXTERNAL_FACILITY_ID_RE = /^(osm|google|od)-[A-Za-z0-9_-]{1,80}$/;

export function isExternalFacilityIdFormat(id: unknown): id is string {
  return typeof id === "string" && EXTERNAL_FACILITY_ID_RE.test(id);
}

export class ExternalFacilityRegistry {
  private readonly ids = new Set<string>();

  constructor(initialIds: Iterable<unknown> = []) {
    this.registerMany(initialIds);
  }

  register(id: unknown): boolean {
    if (!isExternalFacilityIdFormat(id)) return false;
    this.ids.add(id);
    return true;
  }

  registerMany(ids: Iterable<unknown>): void {
    for (const id of ids) this.register(id);
  }

  has(id: string): boolean {
    return this.ids.has(id);
  }

  get size(): number {
    return this.ids.size;
  }
}
