# 口コミ引用追加プロンプト（未取込→評価済み化）

未評価（口コミ未取込）の16件について、トイレ清潔さに言及した口コミ本文を
最大5件ずつ収集する。出力を受け取ったら各入力ファイルの `reviewExcerpts` に
追記（新しい引用を先頭に）し、スコア改訂があれば `cleanlinessScore` /
`confidence` / `scoreBasis` を更新して再生成する。

---

以下の16件について、トイレの清潔さに直接言及した口コミ本文を各最大5件収集し、
JSONで出力してください。口コミが見つからない施設は無理に埋めず、その施設は
出力から除外してください（こちらで「未取込」のまま残します）。

## 厳守ルール

- トイレ・清潔さ・におい・備品（ペーパー・石鹸）への直接言及があるもののみ。
  店舗総合評価や料理の感想は除外
- 引用は原文ママ・30字以内。創作厳禁
- ratingはその口コミの星（不明なら null）
- ついでに清潔さの判定ができる材料が揃った施設は、scoreRevision に
  cleanlinessScore（1.0〜5.0）・confidence・scoreBasis（根拠）を付ける。
  材料不足なら scoreRevision は付けない（nullスコアのまま残す）

## 出力スキーマ

```json
[
  {
    "name": "施設名（下表のまま）",
    "excerpts": [{ "text": "原文引用（30字以内）", "rating": 4, "source": "Google Maps" }],
    "scoreRevision": {
      "cleanlinessScore": 4.2,
      "confidence": "medium",
      "scoreBasis": "根拠（口コミ何件中何件が肯定的か等）"
    }
  }
]
```

## 出所ルール（厳守）

- 各引用に `source` を付ける（どこで確認した原文か。例：「Google Maps」「Yahoo!マップ」「食べログ」）
- Google Mapsの口コミ欄で直接確認した原文だけ `source` を「Google Maps」にする。
  転載サイト・まとめ記事で見たものはそのサイト名を書く。不明なら `source` を付けない
- アプリには出所どおりに表示される（「Google Mapsより引用」等）。未確認のものを
  Google表記してはならない

## 対象16件

### 渋谷

1. 神宮通公園トイレ「あまやどり」 — https://www.google.com/maps/place/?q=place_id:ChIJHXtAN-6NGGARLL6RIDLFPXo
2. 鍋島松濤公園 ﾊﾞﾘｱﾌﾘｰ公衆トイレ — https://www.google.com/maps/place/?q=place_id:ChIJoXN2SauMGGAR17MwL12sXS8
3. 渋谷駅東口 公衆トイレ — https://www.google.com/maps/place/?q=place_id:ChIJn7NPqQWLGGARN8o1-fJF74o
4. 京王井の頭線 渋谷駅 — https://www.google.com/maps/place/?q=place_id:ChIJe3fBYgCLGGARb1EaXbqbbc4
5. 喫茶室ルノアール 渋谷宮下公園店 — https://www.google.com/maps/place/?q=place_id:ChIJn-8w66eMGGAReKy7V_Fuh8g

### 熊谷

6. 八木橋百貨店 — https://www.google.com/maps/search/?api=1&query=%E5%85%AB%E6%9C%A8%E6%A9%8B%E7%99%BE%E8%B2%A8%E5%BA%97&query_place_id=ChIJ1YwZF8kpH2AR5jQWinl_TXg
7. イオン熊谷店 — https://www.google.com/maps/search/?api=1&query=%E3%82%A4%E3%82%AA%E3%83%B3%E7%86%8A%E8%B0%B7%E5%BA%97&query_place_id=ChIJEUxRkc4pH2ARjlKPFoWQMZo
8. 旬鮮魚市場クルベ熊谷銀座店 — https://www.google.com/maps/search/?api=1&query=%E6%97%AC%E9%AE%AE%E9%AD%9A%E5%B8%82%E5%A0%B4%E3%82%AF%E3%83%AB%E3%83%99%E7%86%8A%E8%B0%B7%E9%8A%80%E5%BA%A7%E5%BA%97&query_place_id=ChIJvemYjqMpH2AR-ZsdyAk0s3c
9. 上熊谷駅 — https://www.google.com/maps/search/?api=1&query=%E4%B8%8A%E7%86%8A%E8%B0%B7%E9%A7%85&query_place_id=ChIJidAGHcYpH2AR_WKyE-wCgJI
10. 石原駅 — https://www.google.com/maps/search/?api=1&query=%E7%9F%B3%E5%8E%9F%E9%A7%85&query_place_id=ChIJ-_kGFysoH2ARsTiRodGp19I
11. 星乃珈琲店 熊谷店 — https://www.google.com/maps/search/?api=1&query=%E6%98%9F%E4%B9%83%E7%8F%88%E7%90%B2%E5%BA%97%20%E7%86%8A%E8%B0%B7%E5%BA%97&query_place_id=ChIJxWJbbKApH2ARNBWxTnIDkTg
12. 珈琲館 熊谷店 — https://www.google.com/maps/search/?api=1&query=%E7%8F%88%E7%90%B2%E9%A4%A8%20%E7%86%8A%E8%B0%B7%E5%BA%97&query_place_id=ChIJy8iIodQpH2ARxI9cGByZJ0Q
13. 珈琲所 コメダ珈琲店 熊谷店 — https://www.google.com/maps/search/?api=1&query=%E7%8F%88%E7%90%B2%E6%89%80%20%E3%82%B3%E3%83%A1%E3%83%80%E7%8F%88%E7%90%B2%E5%BA%97%20%E7%86%8A%E8%B0%B7%E5%BA%97&query_place_id=ChIJLVyEeLMpH2ARJwwQp_LV7XI
14. ジョイフル 熊谷店 — https://www.google.com/maps/search/?api=1&query=%E3%82%B8%E3%83%A7%E3%82%A4%E3%83%95%E3%83%AB%20%E7%86%8A%E8%B0%B7%E5%BA%97&query_place_id=ChIJUZuleGQpH2AR8dIOmruLgjc
15. 万平公園 — https://www.google.com/maps/search/?api=1&query=%E4%B8%87%E5%B9%B3%E5%85%AC%E5%9C%92&query_place_id=ChIJjZImeJYpH2ARVuBiHYXaG0o
16. 伊勢町ふれあい公園 — https://www.google.com/maps/search/?api=1&query=%E4%B8%AD%E5%A4%AE%E5%85%AC%E5%9C%92&query_place_id=ChIJs1h-0tMpH2ARHMye0CJTuhM
