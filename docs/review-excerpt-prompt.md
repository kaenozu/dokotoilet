# 口コミ引用の収集は廃止（2026-09）

このドキュメントは以前「未取込 → 評価済み化」のために Google Maps の口コミ**本文**を
収集するプロンプトでしたが、**廃止しました**。

## 理由

- Google Maps 等のユーザー投稿本文をアプリ・リポジトリに転載することは、
  Google の利用規約と投稿者プライバシーの観点から問題がある
- 過去に `googleSeed.ts` へ取り込んだ引用（28件）は 2026-09 にすべて除去済み

## 現在のルール

- 口コミ**本文**（原文ママ・ほぼ同一の書き換え・翻案を含む）は取り込まない
- 取り込むのは次のみ:
  - listing に表示される口コミ**件数**（`externalReviewCount`）
  - 調査者が自前の文章で書いた**傾向要約**（`scoreBasis`）
  - 設備・座標・営業時間などの事実情報
- `convert.ts` は旧形式の `reviewExcerpts` を検出すると**破棄し警告**する
  （`bun run` 時に `warn:` としてコンソールへ出力）

## 代替手順（スコア改訂したい場合）

`docs/manual-research-prompt.md` の手順で再調査し、`cleanlinessScore` /
`confidence` / `scoreBasis` / `externalReviewCount` を更新して
`bun scripts/manual-import/run.ts` で再生成する。本文は不要。
