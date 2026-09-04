# 口コミ件数バックフィル用プロンプト（軽量版）

既存30件のlistingに表示される口コミ件数だけを記録する。本文取得は不要。
出力JSONを受け取ったら各入力ファイルの `externalReviewCount` に反映し、
`bun scripts/manual-import/run.ts` で再生成する。

---

以下の30件について、各Google Maps listingに表示されている口コミ件数と星評価を
調べてJSONで出力してください。本文の取得は不要です。

## 厳守ルール

- 件数と星はlisting表示のまま転記する。推測・概算は禁止。不明・非公開は null
- 施設全体の口コミ件数であり、トイレ単体の件数ではないことを理解して記録する
  （アプリ側で「未取込」表示の根拠として使う）
- 出力はJSONのみ（コードブロック1つ）

## 出力スキーマ

```json
[
  { "name": "施設名（下表のまま）", "externalReviewCount": 114, "externalReviewSource": "Google Maps" }
]
```

## 対象30件

### 渋谷

1. 神宮通公園トイレ「あまやどり」 — https://www.google.com/maps/place/?q=place_id:ChIJHXtAN-6NGGARLL6RIDLFPXo
2. 鍋島松濤公園 ﾊﾞﾘｱﾌﾘｰ公衆トイレ — https://www.google.com/maps/place/?q=place_id:ChIJoXN2SauMGGAR17MwL12sXS8
3. 渋谷駅東口 公衆トイレ — https://www.google.com/maps/place/?q=place_id:ChIJn7NPqQWLGGARN8o1-fJF74o
4. 京王井の頭線 渋谷駅 — https://www.google.com/maps/place/?q=place_id:ChIJe3fBYgCLGGARb1EaXbqbbc4
5. 渋谷ヒカリエ — https://www.google.com/maps/place/?q=place_id:ChIJP6jlUFiLGGAR5fwuswd1KXA
6. 渋谷スクランブルスクエア — https://www.google.com/maps/place/?q=place_id:ChIJscDhJ4SLGGARbx0GlzPi9ng
7. 渋谷PARCO — https://www.google.com/maps/place/?q=place_id:ChIJcyH-4qiMGGARGzk4lZCx2xo
8. ローソン 渋谷一丁目店 — https://www.google.com/maps/place/?q=place_id:ChIJMaI731OLGGARRjpKM-IoEkA
9. 喫茶室ルノアール 渋谷宮下公園店 — https://www.google.com/maps/place/?q=place_id:ChIJn-8w66eMGGAReKy7V_Fuh8g
10. ドトールコーヒーショップ 渋谷１丁目店 — https://www.google.com/maps/place/?q=place_id:ChIJ0_O8DFiLGGARIMS75pBB_ug

### 熊谷

11. アズ熊谷 — https://www.google.com/maps/search/?api=1&query=%E3%82%A2%E3%82%BA%E7%86%8A%E8%B0%B7&query_place_id=ChIJSztt874pH2ARj5k4UVuSjrE
12. ティアラ21 — https://www.google.com/maps/search/?api=1&query=%E3%83%86%E3%82%A3%E3%82%A2%E3%83%A921&query_place_id=ChIJ61SKxr0pH2ARwsFdwlCifZM
13. ニットーモール — https://www.google.com/maps/search/?api=1&query=%E3%83%8B%E3%83%83%E3%83%88%E3%83%BC%E3%83%A2%E3%83%BC%E3%83%AB&query_place_id=ChIJQ9Ntfb0pH2ARRUyCmYl82XY
14. 八木橋百貨店 — https://www.google.com/maps/search/?api=1&query=%E5%85%AB%E6%9C%A8%E6%A9%8B%E7%99%BE%E8%B2%A8%E5%BA%97&query_place_id=ChIJ1YwZF8kpH2AR5jQWinl_TXg
15. イオン熊谷店 — https://www.google.com/maps/search/?api=1&query=%E3%82%A4%E3%82%AA%E3%83%B3%E7%86%8A%E8%B0%B7%E5%BA%97&query_place_id=ChIJEUxRkc4pH2ARjlKPFoWQMZo
16. 旬鮮魚市場クルベ熊谷銀座店 — https://www.google.com/maps/search/?api=1&query=%E6%97%AC%E9%AE%AE%E9%AD%9A%E5%B8%82%E5%A0%B4%E3%82%AF%E3%83%AB%E3%83%99%E7%86%8A%E8%B0%B7%E9%8A%80%E5%BA%A7%E5%BA%97&query_place_id=ChIJvemYjqMpH2AR-ZsdyAk0s3c
17. 熊谷駅 — https://www.google.com/maps/search/?api=1&query=%E7%86%8A%E8%B0%B7%E9%A7%85&query_place_id=ChIJk36DiL4pH2ARMjZ0E478A2w
18. 上熊谷駅 — https://www.google.com/maps/search/?api=1&query=%E4%B8%8A%E7%86%8A%E8%B0%B7%E9%A7%85&query_place_id=ChIJidAGHcYpH2AR_WKyE-wCgJI
19. 石原駅 — https://www.google.com/maps/search/?api=1&query=%E7%9F%B3%E5%8E%9F%E9%A7%85&query_place_id=ChIJ-_kGFysoH2ARsTiRodGp19I
20. セブン-イレブン 熊谷市役所前店 — https://www.google.com/maps/search/?api=1&query=%E3%82%BB%E3%83%96%E3%83%B3-%E3%82%A4%E3%83%AC%E3%83%96%E3%83%B3%20%E7%86%8A%E8%B0%B7%E5%B8%82%E5%BD%B9%E6%89%80%E5%89%8D%E5%BA%97&query_place_id=ChIJpYeinbcpH2ARr0Lwy2y8RJA
21. セブン-イレブン 熊谷銀座3丁目店 — https://www.google.com/maps/search/?api=1&query=%E3%82%BB%E3%83%96%E3%83%B3-%E3%82%A4%E3%83%AC%E3%83%96%E3%83%B3%20%E7%86%8A%E8%B0%B7%E9%8A%80%E5%BA%A73%E4%B8%81%E7%9B%AE%E5%BA%97&query_place_id=ChIJzVY72qIpH2ARf93fTkKLIHI
22. ミニストップ 熊谷上之店 — https://www.google.com/maps/search/?api=1&query=%E3%83%9F%E3%83%8B%E3%82%B9%E3%83%88%E3%83%83%E3%83%97%20%E7%86%8A%E8%B0%B7%E4%B8%8A%E4%B9%8B%E5%BA%97&query_place_id=ChIJpfPlhA4pH2ARlk8QA1Ie0D4
23. 星乃珈琲店 熊谷店 — https://www.google.com/maps/search/?api=1&query=%E6%98%9F%E4%B9%83%E7%8F%88%E7%90%B2%E5%BA%97%20%E7%86%8A%E8%B0%B7%E5%BA%97&query_place_id=ChIJxWJbbKApH2ARNBWxTnIDkTg
24. 珈琲館 熊谷店 — https://www.google.com/maps/search/?api=1&query=%E7%8F%88%E7%90%B2%E9%A4%A8%20%E7%86%8A%E8%B0%B7%E5%BA%97&query_place_id=ChIJy8iIodQpH2ARxI9cGByZJ0Q
25. 珈琲所 コメダ珈琲店 熊谷店 — https://www.google.com/maps/search/?api=1&query=%E7%8F%88%E7%90%B2%E6%89%80%20%E3%82%B3%E3%83%A1%E3%83%80%E7%8F%88%E7%90%B2%E5%BA%97%20%E7%86%8A%E8%B0%B7%E5%BA%97&query_place_id=ChIJLVyEeLMpH2ARJwwQp_LV7XI
26. ジョイフル 熊谷店 — https://www.google.com/maps/search/?api=1&query=%E3%82%B8%E3%83%A7%E3%82%A4%E3%83%95%E3%83%AB%20%E7%86%8A%E8%B0%B7%E5%BA%97&query_place_id=ChIJUZuleGQpH2AR8dIOmruLgjc
27. 中央公園 — https://www.google.com/maps/search/?api=1&query=%E4%B8%AD%E5%A4%AE%E5%85%AC%E5%9C%92&query_place_id=ChIJb8C6N7cpH2AR_vzU9BON8lQ
28. 万平公園 — https://www.google.com/maps/search/?api=1&query=%E4%B8%87%E5%B9%B3%E5%85%AC%E5%9C%92&query_place_id=ChIJjZImeJYpH2ARVuBiHYXaG0o
29. 伊勢町ふれあい公園 — https://www.google.com/maps/search/?api=1&query=%E4%B8%AD%E5%A4%AE%E5%85%AC%E5%9C%92&query_place_id=ChIJs1h-0tMpH2ARHMye0CJTuhM
30. 荒川公園 — https://www.google.com/maps/search/?api=1&query=%E8%8D%92%E5%B7%9D%E5%85%AC%E5%9C%92&query_place_id=ChIJsU0pbsApH2AR4ijf6m89rFg
