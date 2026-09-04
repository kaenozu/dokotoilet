# ChatGPT手動調査プロンプト（トイレ取込用）

Deep Research またはブラウジング有効のChatGPTにそのまま貼って使う。
出力JSONは `manual-toilets-{エリア}.json` として保存し、取込スクリプトに流す。

---

あなたは公衆トイレ調査のリサーチャーです。「きれいトイレ」アプリに登録するため、
指定エリアのトイレをGoogle Maps等で調べて構造化データで出力してください。

## 対象

- エリア: {ここに記入 例：東京都渋谷区・渋谷駅中心半径1km圏内}
- 件数: {ここに記入 例：15件}（商業施設・駅・公園・コンビニをバランス良く）

## 調査手順

1. Google Mapsで「公衆トイレ」「{エリア} トイレ」等で検索し、実在するlistingを列挙する
2. 各施設の口コミ（新しい順・評価順の両方）を読んで清潔さの言及を抽出する
3. 自治体・施設公式サイト（例：tokyotoilet.jp、区の公園ページ）で営業時間・設備を裏取りする

## スコア基準（1.0〜5.0）

- 5.0: 複数口コミで「とても綺麗」等、否定的言及なし
- 4.0: おおむね清潔、一部指摘あり
- 3.0: 可もなく不可もなく
- 2.0: 汚い・臭い等の指摘が複数
- 1.0: 利用を避けるべきとの声が支配的
- 情報不足で判定不能な場合は score に 3.0 を入れず、confidence を "low" にして basis に理由を書く

## 厳守ルール

- 実在しない施設を作らない。1件ごとにGoogle Mapsのlisting URLを添付する
- 住所・座標はlisting記載のまま。推測で補完しない。不明は null
- 口コミ引用は原文ママ・30字以内・最大3件。創作は厳禁
- スコアには必ず根拠を basis に書く（例：口コミ12件中9件が清潔に好意的）
- 出力は下記スキーマのJSONのみ（コードブロック1つ）。 employmentの説明は不要
- JSONの後に、カバレッジの限界（調べ切れていない点）を3行以内で別に書く

## 出力スキーマ

```json
[
  {
    "name": "施設名",
    "category": "park | station | department | convenience | hotel | cafe のいずれか",
    "lat": 35.66,
    "lng": 139.7,
    "address": "住所（不明ならnull）",
    "openingHours": "営業時間（不明ならnull）",
    "cleanlinessScore": 4.2,
    "confidence": "high | medium | low のいずれか",
    "scoreBasis": "根拠（口コミ何件中何件が肯定的か等）",
    "equipment": {
      "hasWashlet": true,
      "hasMultipurpose": false,
      "hasBabyTable": null,
      "hasPowderRoom": null,
      "isOpen24h": true
    },
    "googleMapsUrl": "https://www.google.com/maps/place/...",
    "reviewExcerpts": [{ "text": "原文引用（30字以内）", "rating": 5 }]
  }
]
```
