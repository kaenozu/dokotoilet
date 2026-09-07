import type { ToiletReview } from "../types";

// 施設IDの正準形（NFC）。server/externalFacilityRegistry.ts が同一実装を再輸出し、
// クライアントとサーバーで1つの実装を共有する（二重実装の再分裂防止）。
//
// サーバーは外部施設IDを externalReviews のキー / Firestore のドキュメントIDとして
// そのまま保存し、検証前に NFC へ正準化する。そのため:
//  - APIへ送るIDは正準形にしてからでないと、分解型（Jamo等）のIDが
//    「未知の施設」として扱われる可能性がある
//  - API応答の facilityId は正準形で返る（生入力と記号が違う場合がある）
// をクライアント側でも扱えるようにするのがこのモジュールの役割。

const EXTERNAL_FACILITY_ID_PREFIX_RE = /^(osm|google|od)-/u;

/**
 * 施設IDの正準形（NFC）。IDは externalReviews のキー / external_facilities の
 * ドキュメントIDとしてそのまま使われるため、見た目が同じでも符号化が違う文字列
 * （ハングル Jamo、分解済み Latin/Kana など）が別施設として扱われるのを防ぐ。
 * osm|google|od 接頭辞を持たないid（community の toilet-user-* 等）は無変更で返す。
 */
export function canonicalizeExternalFacilityId(id: string): string {
  if (!EXTERNAL_FACILITY_ID_PREFIX_RE.test(id)) return id;
  return id.normalize("NFC");
}

/**
 * externalReviews マップ（サーバー応答やローカルキャッシュ）のキーを正準形へ
 * 寄せる。同一正準形のキーが複数あった場合（旧データに分解形のキーが残っている
 * 場合など）は、レビューIDをキーに重複排除しながら1つのバケツへ統合する。
 */
export function canonicalizeExternalReviewKeys(
  externalReviews: Record<string, ToiletReview[]>
): Record<string, ToiletReview[]> {
  const out: Record<string, ToiletReview[]> = {};
  for (const [key, reviews] of Object.entries(externalReviews)) {
    const canonical = canonicalizeExternalFacilityId(key);
    const bucket = out[canonical];
    if (!bucket) {
      out[canonical] = reviews;
      continue;
    }
    const seen = new Set(bucket.map((r) => r.id));
    out[canonical] = [...bucket, ...reviews.filter((r) => !seen.has(r.id))];
  }
  return out;
}
