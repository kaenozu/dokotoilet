import React from 'react';

/**
 * ユーザー提供テキストの読み出し側防御（read-path defense）。
 *
 * <bdi>（bidi isolate）は内容自身の双方向制御を隔離し、RLO/LRI 等の制御文字が
 * 周囲の UI レイアウト（ラベル・ボタン・リストの順序）を反転させるのを防ぐ。
 * 入力側では textPolicy が制御文字をサニタイズするが、旧データや将来の回帰に
 * 備えた二重防御。LTR/中立なテキストには見た目上の影響はない。
 */
export const BdiText: React.FC<{ text: string; className?: string }> = ({
  text,
  className,
}) => (
  <bdi className={className}>{text}</bdi>
);
