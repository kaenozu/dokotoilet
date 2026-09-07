/** 非セキュアコンテキストでも動作するID生成ヘルパー。 */
export function newReviewId(): string {
  const uuid = globalThis.crypto?.randomUUID?.();
  if (typeof uuid === "string" && uuid.length > 0) return uuid;
  return `${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
}

export function newFacilityId(prefix: string): string {
  return `${prefix}${newReviewId()}`;
}
