# トイレ評価の取り直しプロンプト（既存32件の再調査用）

ChatGPT（Deep Research またはブラウジング有効）に貼って、登録済み32件の
スコア・設備・口コミ件数を取り直す。出力JSONは `scripts/manual-import/inputs/`
に保存し、`bun scripts/manual-import/run.ts` で `src/data/googleSeed.ts` を再生成する。

## 使い方

1. 下の「共通指示」と「施設リスト（渋谷編 / 熊谷編）」をセットで1回分として貼る
   （32件まとめてより、渋谷10件・熊谷22件の2回に分けると精度が上がる）
2. 出力JSONを保存する（例: `inputs/reevaluate-shibuya-01.json`、`inputs/reevaluate-kumagaya-01.json`）
3. 既存入力と差し替えて再生成する:
   ```bash
   bun scripts/manual-import/run.ts --in scripts/manual-import/inputs/reevaluate-shibuya-01.json --in scripts/manual-import/inputs/reevaluate-kumagaya-01.json
   ```
   - `googleMapsUrl` が同じなら同じ施設IDになるため、差分はスコア・設備・件数の更新だけになる
   - 住所・座標は listing で確認できれば記入、なければ `null`（取込時に Nominatim 補完）
4. 生成後に `git diff src/data/googleSeed.ts` でスコア差分をレビューする

---

## 共通指示（ここから貼る）

あなたは公衆トイレ調査のリサーチャーです。「きれいトイレ」アプリに登録済みの
トイレについて、最新情報を調べ直して評価を取り直してください。
新規施設の発掘は不要です。下の施設リストの全件を再調査してください。

### 調査手順（1件ごと）

1. 添付の Google Maps URL の listing を開き、実在・営業中であることを確認する
2. 口コミを新しい順・評価順の両方で読み、トイレの清潔さに関する直近の「傾向」を要約する
   （例：「直近の口コミN件中M件が清潔さに好意的」。施設全体への評価とトイレ単体への言及は区別する）
3. 営業時間・設備（ウォシュレット・多機能・ベビー・パウダー・24時間）は listing・公式サイトで裏取りする
4. listing に表示される口コミ総件数を記録する（トイレ単体ではなく施設全体の件数でよい。「口コミなし」と「未取込」の区別に使う。0件なら0と書く）

### スコア基準（1.0〜5.0。前回スコアは目安であり、最新情報で付け直す）

- 5.0: 複数口コミで「とても綺麗」等、否定的言及なし
- 4.0: おおむね清潔、一部指摘あり
- 3.0: 可もなく不可もなく
- 2.0: 汚い・臭い等の指摘が複数
- 1.0: 利用を避けるべきとの声が支配的
- 情報不足で判定不能な場合は `cleanlinessScore` に `null` を入れ、`confidence` を `"low"` にする
  （取込時に中立値3.0＋要確認メモになる。安易な3.0入れは禁止）

### 厳守ルール

- 実在しない施設を作らない。`googleMapsUrl` は下表のものをそのまま使う（変えない）
- `name`・`category` は下表のものをそのまま使う（変えない）
- 口コミ本文の転載は禁止（原文ママはもちろん、ほぼ同一の書き換え・翻案も不可）。
  要約は必ず自分の文章で書き、件数と傾向は `scoreBasis` に記録する
- `scoreBasis` には必ず (a) 直近口コミの件数と傾向、(b) 前回スコアからの変更理由
  （例：「前回3.0→4.2：直近1年の口コミで清掃好評が増加」）を書く
- 設備は `true`（あり）/ `false`（なし）/ `null`（未確認）の3値。未確認を `false` にしない
- 住所・座標は listing 記載のまま。推測で補完しない。不明は `null`
- 出力は下記スキーマのJSONのみ（コードブロック1つ）。余計な説明は不要
- JSONの後に、カバレッジの限界（調べ切れていない点）を3行以内で別に書く

### 出力スキーマ

```json
[
  {
    "name": "施設名（下表のまま）",
    "category": "park | station | department | convenience | hotel | cafe のいずれか（下表のまま）",
    "lat": 35.66,
    "lng": 139.7,
    "address": "住所（不明ならnull）",
    "openingHours": "営業時間（不明ならnull）",
    "cleanlinessScore": 4.2,
    "confidence": "high | medium | low のいずれか",
    "scoreBasis": "根拠（直近口コミ何件中何件が肯定的か＋前回スコアからの変更理由）",
    "externalReviewCount": 114,
    "externalReviewSource": "Google Maps",
    "equipment": {
      "hasWashlet": true,
      "hasMultipurpose": false,
      "hasBabyTable": null,
      "hasPowderRoom": null,
      "isOpen24h": true
    },
    "googleMapsUrl": "https://...（下表のまま）"
  }
]
```

### 施設リスト（ここまで貼る。渋谷編 / 熊谷編は下表を切り替える）

---

## 施設リスト：渋谷編（10件）

| # | 施設名 | category | 前回スコア | Google Maps URL |
|---|--------|----------|-----------|-----------------|
| 1 | 神宮通公園トイレ「あまやどり」 | park | 4.5 | https://www.google.com/maps/place/?q=place_id:ChIJHXtAN-6NGGARLL6RIDLFPXo |
| 2 | 鍋島松濤公園 ﾊﾞﾘｱﾌﾘｰ公衆トイレ | park | 4.3 | https://www.google.com/maps/place/?q=place_id:ChIJoXN2SauMGGAR17MwL12sXS8 |
| 3 | 渋谷駅東口 公衆トイレ | station | 3.0 | https://www.google.com/maps/place/?q=place_id:ChIJn7NPqQWLGGARN8o1-fJF74o |
| 4 | 京王井の頭線 渋谷駅 | station | 2.5 | https://www.google.com/maps/place/?q=place_id:ChIJe3fBYgCLGGARb1EaXbqbbc4 |
| 5 | 渋谷ヒカリエ | department | 4.6 | https://www.google.com/maps/place/?q=place_id:ChIJP6jlUFiLGGAR5fwuswd1KXA |
| 6 | 渋谷スクランブルスクエア | department | 4.4 | https://www.google.com/maps/place/?q=place_id:ChIJscDhJ4SLGGARbx0GlzPi9ng |
| 7 | 渋谷PARCO | department | 4.4 | https://www.google.com/maps/place/?q=place_id:ChIJcyH-4qiMGGARGzk4lZCx2xo |
| 8 | ローソン 渋谷一丁目店 | convenience | 3.0 | https://www.google.com/maps/place/?q=place_id:ChIJMaI731OLGGARRjpKM-IoEkA |
| 9 | 喫茶室ルノアール 渋谷宮下公園店 | cafe | 3.0 | https://www.google.com/maps/place/?q=place_id:ChIJn-8w66eMGGAReKy7V_Fuh8g |
| 10 | ドトールコーヒーショップ 渋谷１丁目店 | cafe | 3.0 | https://www.google.com/maps/place/?q=place_id:ChIJ0_O8DFiLGGARIMS75pBB_ug |

## 施設リスト：熊谷編（22件）

| # | 施設名 | category | 前回スコア | Google Maps URL |
|---|--------|----------|-----------|-----------------|
| 11 | アズ熊谷 | department | 3.0 | https://www.google.com/maps/search/?api=1&query=%E3%82%A2%E3%82%BA%E7%86%8A%E8%B0%B7&query_place_id=ChIJSztt874pH2ARj5k4UVuSjrE |
| 12 | ティアラ21 | department | 3.0 | https://www.google.com/maps/search/?api=1&query=%E3%83%86%E3%82%A3%E3%82%A2%E3%83%A921&query_place_id=ChIJ61SKxr0pH2ARwsFdwlCifZM |
| 13 | ニットーモール | department | 3.8 | https://www.google.com/maps/search/?api=1&query=%E3%83%8B%E3%83%83%E3%83%88%E3%83%BC%E3%83%A2%E3%83%BC%E3%83%AB&query_place_id=ChIJQ9Ntfb0pH2ARRUyCmYl82XY |
| 14 | 八木橋百貨店 | department | 3.0 | https://www.google.com/maps/search/?api=1&query=%E5%85%AB%E6%9C%A8%E6%A9%8B%E7%99%BE%E8%B2%A8%E5%BA%97&query_place_id=ChIJ1YwZF8kpH2AR5jQWinl_TXg |
| 15 | イオン熊谷店 | department | 3.0 | https://www.google.com/maps/search/?api=1&query=%E3%82%A4%E3%82%AA%E3%83%B3%E7%86%8A%E8%B0%B7%E5%BA%97&query_place_id=ChIJEUxRkc4pH2ARjlKPFoWQMZo |
| 16 | 旬鮮魚市場クルベ熊谷銀座店 | department | 3.0 | https://www.google.com/maps/search/?api=1&query=%E6%97%AC%E9%AE%AE%E9%AD%9A%E5%B8%82%E5%A0%B4%E3%82%AF%E3%83%AB%E3%83%99%E7%86%8A%E8%B0%B7%E9%8A%80%E5%BA%A7%E5%BA%97&query_place_id=ChIJvemYjqMpH2AR-ZsdyAk0s3c |
| 17 | 熊谷駅 | station | 4.0 | https://www.google.com/maps/search/?api=1&query=%E7%86%8A%E8%B0%B7%E9%A7%85&query_place_id=ChIJk36DiL4pH2ARMjZ0E478A2w |
| 18 | 上熊谷駅 | station | 3.0 | https://www.google.com/maps/search/?api=1&query=%E4%B8%8A%E7%86%8A%E8%B0%B7%E9%A7%85&query_place_id=ChIJidAGHcYpH2AR_WKyE-wCgJI |
| 19 | 石原駅 | station | 3.0 | https://www.google.com/maps/search/?api=1&query=%E7%9F%B3%E5%8E%9F%E9%A7%85&query_place_id=ChIJ-_kGFysoH2ARsTiRodGp19I |
| 20 | セブン-イレブン 熊谷市役所前店 | convenience | 4.4 | https://www.google.com/maps/search/?api=1&query=%E3%82%BB%E3%83%96%E3%83%B3-%E3%82%A4%E3%83%AC%E3%83%96%E3%83%B3%20%E7%86%8A%E8%B0%B7%E5%B8%82%E5%BD%B9%E6%89%80%E5%89%8D%E5%BA%97&query_place_id=ChIJpYeinbcpH2ARr0Lwy2y8RJA |
| 21 | セブン-イレブン 熊谷銀座3丁目店 | convenience | 4.0 | https://www.google.com/maps/search/?api=1&query=%E3%82%BB%E3%83%96%E3%83%B3-%E3%82%A4%E3%83%AC%E3%83%96%E3%83%B3%20%E7%86%8A%E8%B0%B7%E9%8A%80%E5%BA%A73%E4%B8%81%E7%9B%AE%E5%BA%97&query_place_id=ChIJzVY72qIpH2ARf93fTkKLIHI |
| 22 | ミニストップ 熊谷上之店 | convenience | 2.8 | https://www.google.com/maps/search/?api=1&query=%E3%83%9F%E3%83%8B%E3%82%B9%E3%83%88%E3%83%83%E3%83%97%20%E7%86%8A%E8%B0%B7%E4%B8%8A%E4%B9%8B%E5%BA%97&query_place_id=ChIJpfPlhA4pH2ARlk8QA1Ie0D4 |
| 23 | 星乃珈琲店 熊谷店 | cafe | 3.0 | https://www.google.com/maps/search/?api=1&query=%E6%98%9F%E4%B9%83%E7%8F%88%E7%90%B2%E5%BA%97%20%E7%86%8A%E8%B0%B7%E5%BA%97&query_place_id=ChIJxWJbbKApH2ARNBWxTnIDkTg |
| 24 | 珈琲館 熊谷店 | cafe | 3.0 | https://www.google.com/maps/search/?api=1&query=%E7%8F%88%E7%90%B2%E9%A4%A8%20%E7%86%8A%E8%B0%B7%E5%BA%97&query_place_id=ChIJy8iIodQpH2ARxI9cGByZJ0Q |
| 25 | 珈琲所 コメダ珈琲店 熊谷店 | cafe | 3.0 | https://www.google.com/maps/search/?api=1&query=%E7%8F%88%E7%90%B2%E6%89%80%20%E3%82%B3%E3%83%A1%E3%83%80%E7%8F%88%E7%90%B2%E5%BA%97%20%E7%86%8A%E8%B0%B7%E5%BA%97&query_place_id=ChIJLVyEeLMpH2ARJwwQp_LV7XI |
| 26 | ジョイフル 熊谷店 | cafe | 3.0 | https://www.google.com/maps/search/?api=1&query=%E3%82%B8%E3%83%A7%E3%82%A4%E3%83%95%E3%83%AB%20%E7%86%8A%E8%B0%B7%E5%BA%97&query_place_id=ChIJUZuleGQpH2AR8dIOmruLgjc |
| 27 | 中央公園 | park | 2.8 | https://www.google.com/maps/search/?api=1&query=%E4%B8%AD%E5%A4%AE%E5%85%AC%E5%9C%92&query_place_id=ChIJb8C6N7cpH2AR_vzU9BON8lQ |
| 28 | 万平公園 | park | 3.0 | https://www.google.com/maps/search/?api=1&query=%E4%B8%87%E5%B9%B3%E5%85%AC%E5%9C%92&query_place_id=ChIJjZImeJYpH2ARVuBiHYXaG0o |
| 29 | 伊勢町ふれあい公園 | park | 3.0 | https://www.google.com/maps/search/?api=1&query=%E4%B8%AD%E5%A4%AE%E5%85%AC%E5%9C%92&query_place_id=ChIJs1h-0tMpH2ARHMye0CJTuhM |
| 30 | 荒川公園 | park | 2.0 | https://www.google.com/maps/search/?api=1&query=%E8%8D%92%E5%B7%9D%E5%85%AC%E5%9C%92&query_place_id=ChIJsU0pbsApH2AR4ijf6m89rFg |
| 31 | 道の駅めぬま | convenience | 4.0 | https://www.google.com/maps/search/?api=1&query=道の駅めぬま+熊谷市 |
| 32 | 熊谷スポーツ文化公園 | park | 4.0 | https://www.google.com/maps/search/?api=1&query=熊谷スポーツ文化公園+熊谷市 |
