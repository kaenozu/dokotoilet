import type { ToiletAttributes, TriState } from "../types";

/**
 * OSM タグ → 設備属性（true/false/null）の変換。
 * null = タグ欠落・不明（「未確認」）。タグが無いことを「設備なし」と断定しない
 * （レビューP1: OSM 側で fee タグ欠落時に「無料」と判定していた問題の修正）。
 * クライアント（src/App.tsx）とサーバー（server.ts）で同一のマッピングを共有する。
 */

/** 汎用 yes/no タグ: "yes"→true / "no"→false / 欠落・不明→null */
export function triFromYesNo(v: string | undefined): TriState {
  if (v === "yes") return true;
  if (v === "no") return false;
  return null;
}

/** fee タグ: "no"→無料(true) / "yes"→有料(false) / 欠落→未確認(null) */
export function triFromFee(v: string | undefined): TriState {
  if (v === "no") return true;
  if (v === "yes") return false;
  return null;
}

/** opening_hours: "24/7"→true / 明示的な営業時間→false / 欠落→未確認(null) */
export function triFromOpen24h(v: string | undefined): TriState {
  if (v === "24/7") return true;
  if (v === undefined || v === "") return null;
  return false;
}

/** toilets:position: seated→western / squat→japanese / seated_and_squat→both / 欠落→null */
export function triToiletStyle(v: string | undefined): ToiletAttributes["toiletStyle"] {
  if (v === "seated") return "western";
  if (v === "squat") return "japanese";
  if (v === "seated_and_squat") return "both";
  return null;
}

/** The Tokyo Toilet は明示的な network/brand タグだけで判定する。architect 単独では判定しない。 */
export function isTheTokyoToiletTags(
  tags: Record<string, string | undefined>
): boolean {
  const values = [tags.network, tags.brand, tags.operator]
    .filter((v): v is string => typeof v === "string")
    .map((v) => v.trim().toLowerCase());
  return values.some(
    (v) => v === "the tokyo toilet" || v.includes("the tokyo toilet")
  );
}

/** OSM タグ一式 → ToiletAttributes（タグ欠落はすべて null=未確認） */
export function osmAttributesFromTags(
  tags: Record<string, string | undefined>
): ToiletAttributes {
  return {
    hasWashlet: triFromYesNo(tags.washlet),
    hasMultipurpose: triFromYesNo(tags.wheelchair),
    hasBabyTable: triFromYesNo(tags.changing_table),
    hasNursingRoom: triFromYesNo(tags.nursing_room),
    hasPowderRoom: triFromYesNo(tags.mirror),
    hasOstomate: triFromYesNo(tags.ostomate),
    isFree: triFromFee(tags.fee),
    isOpen24h: triFromOpen24h(tags.opening_hours),
    hasSoap: triFromYesNo(tags.soap),
    hasAlcohol: triFromYesNo(tags.hand_disinfectant),
    hasPaperTowelOrDryer: triFromYesNo(tags.hand_dryer),
    toiletStyle: triToiletStyle(tags["toilets:position"]),
  };
}
