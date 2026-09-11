import type { FilterState, ToiletFacility } from "../types";
import { displayGrade } from "./grade";

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

  // High cleanliness (Grade S & A, score >= 4.0): 表示グレード基準。
  // 口コミ0件の施設も調査/推定グレードで判定する（初期状態でフィルタが全件除外に
  // なるのを防ぐ。実測・調査・推定の区別はグレード表示の出所タグで行う）。
  // 未スコア（コミュニティ登録直後）はスコア自体が無いため除外する
  //（null < 4.0 は false になり、未評価施設がS・A級に紛れ込むのを防ぐ）。
  if (f.onlyHighCleanliness) {
    const shown = displayGrade(t);
    if (shown.score === null || shown.score < 4.0) return false;
  }

  // Equipment attributes: 「あり」を明示（true）した施設のみ一致。
  // 未確認（null）は「なし」同様に候補から外す（不明を「あり」と断定しない）。
  // attributes 欠落（旧 localStorage・不正なサーバー応答）でも落とさず、
  // 「設備は未確認」扱いで一覧に残す（ErrorBoundary に落とされる前にここで防御）。
  const attrs = t.attributes ?? ({} as Partial<ToiletFacility["attributes"]>);
  if (f.onlyWashlet && attrs.hasWashlet !== true) return false;
  if (f.onlyMultipurpose && attrs.hasMultipurpose !== true) return false;
  if (f.onlyPowderRoom && attrs.hasPowderRoom !== true) return false;
  if (f.only24h && attrs.isOpen24h !== true) return false;

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
