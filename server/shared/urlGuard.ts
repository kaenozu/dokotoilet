// URL風文字列の検出。community.ts の各テキスト欄（施設名・住所・フロア・説明・
// コメント・通報理由）でスパム誘導をブロックするために使う。
//
// 従来の URL_RE 直テストには2つの盲点があった（unicode監査 PR #62 の G1）:
//   1. 不可視文字（LRM/U+200E, ZWSP/U+200B など \p{Cf}）を URL の途中に挟むと
//      正規表現がスキームとして認識できない（h\u200Ettps:// が通る）
//   2. 全角英字（ｈｔｔｐｓ://）や全角コロン（https：//）は ASCII 前提の
//      パターンに一致しない（見た目はURLのまま）
// 対策として、判定前に Unicode 正規化 NFKC（互換分解で全角→ASCIIに畳む）と
// 書式/制御文字（\p{Cf} \p{Cc}）の除去を行い、その上で URL_RE を適用する。
// 検出対象を広げない（むしろ既存パターンが見えるようにするだけ）ので、
// URL_RE 自体の過剰拒否性質（本文中の "http" という語や TLD 風表記への反応）は
// そのまま引き継ぐ。これは PR #63 のポリシー判断であり、ここでは変更しない。

const URL_RE =
  /(https?:\/\/|www\.|[a-z0-9-]+\.(com|net|org|io|jp|co|me|info|biz|dev|app|xyz|top|site|online|shop|click|link|tokyo|osaka)|h\s*t\s*t\s*p)/i;

/** URL_RE 本体。検出根拠の提示やテストのために公開する。 */
export function urlPattern(): RegExp {
  return URL_RE;
}

/**
 * 判定用の正規化: NFKC で互換文字（全角英数字など）を畳み込み、
 * 書式文字（不可視の双方向制御・ZWSP等）と制御文字を取り除く。
 * 単独サロゲートを含む文字列でも例外にはならない（NFKCは寛容）。
 */
export function normalizeForUrlScan(value: string): string {
  return value.normalize("NFKC").replace(/[\p{Cf}\p{Cc}]/gu, "");
}

/**
 * 文字列が URL 風（スキーム・www・TLD風ドメイン・ASCII綴りの "http"）を
 * 含むかを、正規化した上で判定する。文字列以外は常に false。
 */
export function containsUrlLike(value: unknown): boolean {
  if (typeof value !== "string") return false;
  return URL_RE.test(normalizeForUrlScan(value));
}
