// ユーザー入力テキスト（userName・comment・reason）のサニタイザー。
// unicode監査（PR #62、community.unicode.test.ts）で固定された G2/G3 ギャップを
// 閉じるために導入:
//   G3 制御文字（NUL/BEL/DEL）、双方向制御（RLO/LRO/PDI等）、Unicodeタグ文字、
//      プライベート用域、単独サロゲートがそのまま保存される
//   G2 不可視文字のみの入力（ZWSP連打・LRM1文字）が非空チェックを素通しする
//
// 方針:
//   - 改行・タブ等の「空白として機能する制御文字」は半角スペースに置換する
//     （本文の語の連結を壊さないため。\r\n は先に \n へ統一して1スペースにする）
//   - それ以外の Unicode カテゴリ C（Other: 制御・書式・サロゲート・私用）は除去
//   - 結合記号（\p{M}）・全角文字・絵文字など「見える文字」は一切いじらない
//     （NFC正規化は行わない = external facility id と同じ non-normalizing ポリシー。
//      全角→ASCIIの畳み込みは URL 検出専用で、こちらは urlGuard.ts の担当）
//
// 保存値と検証値の関係: sanitize は長さを増やさない（置換は1:1、それ以外は削除）
// ので、生入力に対する長さ上限チェックがサニタイズ後の値も律する。

// 空白として機能する制御文字（\p{Zs} には含まれないが、語の区切りに使われるもの）
const LINE_CONTROLS = /[\t\n\r\f\v\u0085\u2028\u2029]/g;
// Unicode カテゴリ C の全種（Cc 制御 / Cf 書式 / Cs サロゲート / Co 私用 / Cn 非割当）
const INVISIBLE = /\p{C}/gu;

/**
 * 制御・書式文字を取り除き、改行系は半角スペースに置換した本文を返す。
 * 見える文字（結合記号・全角・絵文字を含む）はそのまま保持する。
 */
export function sanitizeText(value: string): string {
  return value
    .replace(/\r\n?/g, "\n")
    .replace(LINE_CONTROLS, " ")
    .replace(INVISIBLE, "");
}

/**
 * サニタイズ後に1文字でも「見える」本文が残るか。
 * 不可視文字のみの入力（ZWSP・LRM 等）は false になる — G2 の拒否根拠。
 */
export function hasVisibleContent(value: string): boolean {
  return sanitizeText(value).trim().length > 0;
}
