# きれいトイレ

公衆トイレの「きれい度」を地図で共有するアプリ。
データ元は OpenStreetMap（Overpass API・リアルタイム取得）とユーザー投稿。
Google Maps / Places API は有料のため不採用（地図タイルは OSM / 国土地理院）。

## 開発

```bash
bun install
bun run dev      # http://localhost:3000（tsx + Vite）
bun run lint     # tsc --noEmit
bun run test     # vitest
bun run build    # vite build + server bundle → dist/
bun start        # 本番起動（dist/server.cjs）
```

本番起動ポートは `process.env.PORT`（未設定時は 3000）。

## シードデータ生成手順（`src/data/`）

1. Overpass API で取得する（例: 渋谷周辺の公衆トイレ）。

   ```ql
   [out:json][timeout:25];
   nwr["amenity"="toilets"](around:3000,35.6590,139.7006);
   out center 100;
   ```

   結果を `/tmp/unique_osm.json` として保存する。
2. `tmp/gen_toilets.js` で `src/data/toilets.ts` を生成する（git 管理外の手元スクリプト）。

   ```bash
   node tmp/gen_toilets.js
   ```

3. フォールバック用の生ノード抜粋は `src/data/realOsmSeed.ts` に手動で追加する
   （Overpass 3ミラー全滅時に半径約4km以内を返す）。

## コミュニティ投稿API（`server/community.ts`）

| メソッド | パス | 内容 |
|---|---|---|
| GET | `/api/community/toilets` | 共有トイレ一覧 |
| POST | `/api/community/toilets` | 新規登録（バリデーション・ID重複409） |
| POST | `/api/community/toilets/:id/reviews` | 口コミ投稿（重複409・スパムURL400） |
| POST | `/api/community/reviews/:id/helpful` | 役に立った投票（IP毎1回） |
| POST | `/api/community/reviews/:id/report` | 通報（モデレーションキュー） |

- 投稿系は 10回/分・IP、投票系は 30回/分・IP のレート制限。
- 保存先は `data/community.json`（`COMMUNITY_STORE_PATH` で変更可）。
  Cloud Run 等の ephemeral FS では再起動で消えるため、本格運用は
  Firestore / Postgres への差し替えを想定（`CommunityStore` IF維持）。
- IPはソルト付きSHA-256ハッシュのみ保存（`COMMUNITY_SALT` 未設定時は起動毎ランダム）。
  ハッシュはAPI応答に含めない。
- フロントはAPI不通時に localStorage のみのローカル動作にフォールバックする。

## データ方針

- `cleanlinessScore` / `cleanlinessGrade` は実測レビュー平均。
  `reviewCount === 0` の施設は設備推定値（`equipmentScore` / `equipmentGrade`）を
  表示用に入れるが、UI上は「未評価」としてランク表示しない。
- スコア→グレード判定は `src/lib/scoring.ts` の `gradeForScore` に一本化すること。
- OSM タグ欠落時は楽観的に true にしない
  （`hasSoap` は `soap=yes` のみ、`isFree` は `fee=yes` 以外）。
