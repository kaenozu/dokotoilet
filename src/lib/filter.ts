import type { FilterState, ToiletFacility } from "../types";

/**
 * 一覧・地図共通の「絞り込み → 清潔度順ソート」純関数（App の useMemo から切り出し）。
 * ToiletList は「清潔度順にソート」と表示しているため、フィルタ後は必ず
 * sortToiletsForDisplay（filterAndSortToilets）を通すこと。
 * FilterState の全フィールドがここで参照される（未使用フィールドの混入防止）。
 */

/** 実測口コミがあるか（0件のトイレは設備推定値しかないため「未評価」扱い） */
function isEvaluated(t: ToiletFacility): boolean {
  return t.reviewCount > 0;
}

/** 一覧の整列・推定表示に使うスコア: 評価済みは実測平均、未評価は設備推定値 */
export function displayScore(t: ToiletFacility): number {
  return isEvaluated(t) ? t.cleanlinessScore : t.equipmentScore;
}

/** フィルタ1件分の判定（検索・清潔度・設備・データ元） */
export function matchesFilter(t: ToiletFacility, f: FilterState): boolean {
  // Search query（施設名・住所・種別・フロア。大文字小文字は区別しない）
  const q = f.searchQuery.trim().toLowerCase();
  if (q) {
    const haystack = [t.name, t.address, t.facilityType, t.floorInfo]
      .filter((s): s is string => typeof s === "string")
      .map((s) => s.toLowerCase());
    if (!haystack.some((s) => s.includes(q))) return false;
  }

  // High cleanliness (Grade S & A, score >= 4.0): 実測口コミがある施設（reviewCount > 0）のみ対象。
  // 未評価（reviewCount 0）の cleanlinessScore は設備推定値/手動判断値のため S・A級とは断定せず、
  // UI の「未評価（グレード非表示）」表示とも一貫させる（実測と推定を混ぜない）。
  if (f.onlyHighCleanliness && (t.reviewCount <= 0 || t.cleanlinessScore < 4.0)) return false;

  // Equipment attributes: 「あり」を明示（true）した施設のみ一致。
  // 未確認（null）は「なし」同様に候補から外す（不明を「あり」と断定しない）
  if (f.onlyWashlet && t.attributes.hasWashlet !== true) return false;
  if (f.onlyMultipurpose && t.attributes.hasMultipurpose !== true) return false;
  if (f.onlyPowderRoom && t.attributes.hasPowderRoom !== true) return false;
  if (f.only24h && t.attributes.isOpen24h !== true) return false;

  // Data source
  if (f.dataSource !== "all" && t.dataSource !== f.dataSource) return false;

  return true;
}

export function filterToilets(
  toilets: ToiletFacility[],
  f: FilterState
): ToiletFacility[] {
  return toilets.filter((t) => matchesFilter(t, f));
}

/**
 * 清潔度順ソート: 評価済み（実測口コミあり）を先頭に実測平均の降順、
 * 続いて未評価を設備推定値の降順で並べる。同点は id で安定化。
 */
export function sortToiletsForDisplay(
  toilets: ToiletFacility[]
): ToiletFacility[] {
  return [...toilets].sort((a, b) => {
    const aEval = isEvaluated(a);
    const bEval = isEvaluated(b);
    if (aEval !== bEval) return aEval ? -1 : 1;
    const scoreDiff = displayScore(b) - displayScore(a);
    if (scoreDiff !== 0) return scoreDiff;
    return a.id.localeCompare(b.id);
  });
}

/** フィルタ → 清潔度順ソートを1本化したエントリポイント */
export function filterAndSortToilets(
  toilets: ToiletFacility[],
  f: FilterState
): ToiletFacility[] {
  return sortToiletsForDisplay(filterToilets(toilets, f));
}
