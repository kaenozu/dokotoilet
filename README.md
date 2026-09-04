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

## Google手動調査データの取込（`scripts/manual-import/`）

Places APIは使わず、ChatGPT等による手動リサーチ結果（JSON）を取込む。

1. `docs/manual-research-prompt.md` をChatGPT（Deep Research推奨）に貼って調査する
2. 出力JSONを `scripts/manual-import/inputs/{エリア}.json` に保存する
3. 取込実行（座標欠落分はNominatimで補完、1.2秒間隔）:

   ```bash
   bun scripts/manual-import/run.ts --in scripts/manual-import/inputs/shibuya-01.json
   ```

   `src/data/googleSeed.ts` が生成される。スキップ理由はコンソールに出る
   （座標特定不能・形式不正は取込不可）。
4. 判定不能（score null）は中立値3.0＋要確認メモで取込む。UI上は未評価表示。
5. 設備の不明値は `false`（未確認）として格納する。

## 自治体オープンデータの取込（`scripts/opendata-import/`）

初弾として熊谷市「公衆トイレ一覧」（くまっぷオープンデータ、2023年10月2日掲載、126件）を取込済み。
出典表記は各施設の `facilityNote` と本READMEで行う（CC-BY 相当の帰属表示）。

```bash
bun scripts/opendata-import/run-kumagaya.ts            # inputs のCSVから生成
bun scripts/opendata-import/run-kumagaya.ts --fetch    # 公式URLから再取得して生成
```

注意：公式CSVは緯度/経度列が重複している（前半は空、後半に実値）。
`mapKumagayaRows` は最終出現を採用する。他自治体を追加する際は列定義を確認すること。

## データ方針

- `cleanlinessScore` / `cleanlinessGrade` は実測レビュー平均。
  `reviewCount === 0` の施設は設備推定値（`equipmentScore` / `equipmentGrade`）を
  表示用に入れるが、UI上は「未評価」としてランク表示しない。
- スコア→グレード判定は `src/lib/scoring.ts` の `gradeForScore` に一本化すること。
- OSM タグ欠落時は楽観的に true にしない
  （`hasSoap` は `soap=yes` のみ、`isFree` は `fee=yes` 以外）。
