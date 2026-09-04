import express from "express";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import path from "path";
import crypto from "node:crypto";
import { createServer as createViteServer } from "vite";
import { REAL_OSM_SEED } from "./src/data/realOsmSeed";
import {
  CommunityStore,
  createCommunityRouter,
  defaultStorePath,
} from "./server/community";

async function startServer() {
  const app = express();
  // Cloud Run / AI Studio は PORT 環境変数を注入する
  const PORT = parseInt(process.env.PORT || "3000", 10) || 3000;

  // Cloud Runはリバースプロキシ配下のため、rate-limitのIP判定用に1段だけ信頼する
  app.set("trust proxy", 1);
  // helmetの既定CSPは地図タイル（OSM/国土地理院）とVite開発サーバを壊すため調整する。
  // 開発時（Viteミドルウェア）はCSPを無効化するのが定石。
  app.use(
    helmet({
      contentSecurityPolicy:
        process.env.NODE_ENV === "production"
          ? {
              directives: {
                ...helmet.contentSecurityPolicy.getDefaultDirectives(),
                "img-src": [
                  "'self'",
                  "data:",
                  "https://tile.openstreetmap.org",
                  "https://cyberjapandata.gsi.go.jp",
                ],
              },
            }
          : false,
    })
  );
  app.use(express.json({ limit: "100kb" }));
  // OSMプロキシの踏み台化を防ぐ（/api/配下は1分60リクエスト/IP）
  const apiLimiter = rateLimit({
    windowMs: 60 * 1000,
    limit: 60,
    standardHeaders: "draft-7",
    legacyHeaders: false,
  });
  app.use("/api/", apiLimiter);

  // コミュニティ投稿API（ファイルストア。 ephemeral FS では再起動で消える点に注意）
  const communityStore = new CommunityStore(defaultStorePath());
  const communitySalt = process.env.COMMUNITY_SALT || crypto.randomUUID();
  app.use("/api/community", createCommunityRouter(communityStore, communitySalt));

  // Health check
  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
  });

  // In-memory cache for live OpenStreetMap Overpass queries (15-minute TTL, LRU cap)
  const osmCache = new Map<string, { timestamp: number; data: any }>();
  const OSM_CACHE_TTL = 15 * 60 * 1000;
  const OSM_CACHE_MAX = 200;

  function osmCacheSet(key: string, data: any) {
    // 挿入順を最新にするため既存キーは入れ直す
    if (osmCache.has(key)) osmCache.delete(key);
    // 上限超過分は古いものから捨てる
    while (osmCache.size >= OSM_CACHE_MAX) {
      const oldest = osmCache.keys().next();
      if (oldest.done) break;
      osmCache.delete(oldest.value);
    }
    osmCache.set(key, { timestamp: Date.now(), data });
  }

  // TTL切れエントリの定期掃除（5分毎）。タイマーはプロセス終了を妨げない
  const cacheSweeper = setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of osmCache) {
      if (now - entry.timestamp >= OSM_CACHE_TTL) osmCache.delete(key);
    }
  }, 5 * 60 * 1000);
  (cacheSweeper as unknown as { unref?: () => void }).unref?.();

  // OpenStreetMap Overpass API Proxy for live real toilets
  app.get("/api/osm/toilets", async (req, res) => {
    try {
      const lat = parseFloat(req.query.lat as string) || 35.6590;
      const lng = parseFloat(req.query.lng as string) || 139.7006;
      const radius = Math.min(parseInt(req.query.radius as string) || 1500, 3000);

      const cacheKey = `${lat.toFixed(2)}_${lng.toFixed(2)}_${radius}`;
      const cached = osmCache.get(cacheKey);
      if (cached && Date.now() - cached.timestamp < OSM_CACHE_TTL) {
        res.json(cached.data);
        return;
      }

      // nwr query: nodes + ways + relations (buildings etc.) with center coords.
      // Limit 100 covers dense areas (e.g. Shibuya ~98 hits); ways surface only
      // if the limit is not truncated, hence > 45.
      const overpassQuery = `[out:json][timeout:10];nwr["amenity"="toilets"](around:${radius},${lat},${lng});out center 100;`;

      // Fast, resilient mirrors（高速・安定な順）
      const mirrors = [
        "https://overpass.kumi.systems/api/interpreter",
        "https://overpass-api.de/api/interpreter",
        "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
      ];

      let rawElements: any[] = [];
      let fetchSuccess = false;

      for (const mirrorUrl of mirrors) {
        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 8000);

          const osmResponse = await fetch(mirrorUrl, {
            method: "POST",
            body: "data=" + encodeURIComponent(overpassQuery),
            headers: {
              "Content-Type": "application/x-www-form-urlencoded",
              // Overpass利用ポリシー: 連絡可能なUA必須
              "User-Agent": "kirei-toilet/1.0 (+https://github.com/kaenozu/dokotoilet)",
            },
            signal: controller.signal,
          });

          clearTimeout(timeoutId);

          if (osmResponse.ok) {
            const data = await osmResponse.json();
            if (Array.isArray(data.elements) && data.elements.length > 0) {
              rawElements = data.elements;
              fetchSuccess = true;
              break;
            }
          }
        } catch {
          // Gracefully continue to next mirror without noisy unhandled warnings
          continue;
        }
      }

      // If live Overpass endpoints are temporarily unreachable, use verified real OSM seed data
      if (!fetchSuccess || rawElements.length === 0) {
        const matchedSeed = REAL_OSM_SEED.filter((el: any) => {
          const dLat = Math.abs((el.lat || 0) - lat);
          const dLng = Math.abs((el.lon || 0) - lng);
          return dLat < 0.04 && dLng < 0.04;
        });
        if (matchedSeed.length > 0) {
          rawElements = matchedSeed;
        }
      }

      // Convert raw OSM elements into clean ToiletFacility format (Real Data, 0 Mock Reviews)
      const toilets = rawElements.map((el: any) => {
        const itemLat = el.lat || el.center?.lat;
        const itemLng = el.lon || el.center?.lon;
        const tags = el.tags || {};

        // Real name extraction
        let name = tags.name || tags["name:ja"];
        if (!name) {
          if (tags.operator) {
            name = `${tags.operator} 公衆トイレ`;
          } else if (tags.description) {
            name = `公衆トイレ (${tags.description})`;
          } else {
            name = `公衆便所 (OSM #${el.id})`;
          }
        } else if (!name.includes("トイレ") && !name.includes("便所")) {
          name = `${name} 公衆トイレ`;
        }

        const isTheTokyoToilet = tags.network === "The Tokyo Toilet" || tags.architect;
        const isWheelchair = tags.wheelchair === "yes";
        const hasDiaper = tags.diaper === "yes" || tags.changing_table === "yes";
        const hasWashlet = tags.washlet === "yes";
        // タグ欠落時は楽観的に true にしない（#5）。fee は明示的有料のみ false
        const isFree = tags.fee !== "yes";
        const isOpen24h = tags.opening_hours === "24/7";
        const isOstomate = tags.ostomate === "yes";

        // Facility category
        let category: "park" | "station" | "convenience" | "hotel" | "department" | "cafe" = "park";
        if (
          tags.operator?.includes("JR") ||
          tags.operator?.includes("メトロ") ||
          tags.operator?.includes("地下鉄") ||
          tags.location === "underground" ||
          tags.description?.includes("駅")
        ) {
          category = "station";
        }

        // Equipment-derived baseline score (clearly marked as 0 reviews yet)
        let grade: "S" | "A" | "B" | "C" | "D" = "B";
        let score = 3.3;
        if (isTheTokyoToilet) {
          grade = "S";
          score = 4.7;
        } else if (isWheelchair && (hasWashlet || hasDiaper || isOstomate)) {
          grade = "A";
          score = 4.2;
        } else if (tags.wheelchair === "no" && tags["toilets:position"] === "squat;urinal") {
          grade = "C";
          score = 2.6;
        }

        const pros: string[] = [];
        if (isTheTokyoToilet) pros.push("The Tokyo Toilet プロジェクト (有名建築家デザイン)");
        if (isWheelchair) pros.push("多機能・だれでもトイレ / 車椅子対応");
        if (hasWashlet) pros.push("温水洗浄便座 (ウォシュレット完備)");
        if (hasDiaper) pros.push("おむつ交換台・ベビーシート設置");
        if (isOstomate) pros.push("オストメイト対応設備あり");
        if (isOpen24h) pros.push("24時間利用可能");
        if (isFree) pros.push("無料利用可能");

        const cons: string[] = [];
        if (!hasWashlet) cons.push("ウォシュレット非対応または未登録");
        if (tags.wheelchair === "no") cons.push("車椅子非対応の構造");

        // OSMは誰でも編集できるため、contact:websiteはhttp(s)のみ許可する
        const rawContact = tags["contact:website"];
        const safeContact =
          typeof rawContact === "string" && /^https?:\/\/[^\\"'\s]+$/i.test(rawContact.trim())
            ? rawContact.trim()
            : undefined;

        return {
          // node/way/relationでID空間は別だが、同一半径内の数値衝突は無視できるため
          // 従来形式（osm-<id>）を維持する（保存データとの互換性優先）
          id: `osm-${el.id}`,
          name,
          facilityType: isTheTokyoToilet
            ? "THE TOKYO TOILET (渋谷区デザイン公衆トイレ)"
            : tags.operator
            ? `${tags.operator} 管理公衆便所`
            : "公衆便所 (OpenStreetMap実在登録)",
          category,
          dataSource: "osm" as const,
          lat: itemLat,
          lng: itemLng,
          address: tags["addr:full"] || tags["addr:street"] || "周辺道路・公園内",
          // 実測レビュー0件のため、設備推定値を表示用にも入れる。
          // UIは reviewCount===0 を「未評価」として扱う（isEvaluated参照）
          cleanlinessGrade: grade,
          cleanlinessScore: score,
          equipmentGrade: grade,
          equipmentScore: score,
          subScores: {
            cleanliness: score,
            odor: score,
            supplies: score,
            comfort: score,
          },
          attributes: {
            hasWashlet,
            hasMultipurpose: isWheelchair,
            hasBabyTable: hasDiaper,
            hasNursingRoom: tags.nursing_room === "yes",
            hasPowderRoom: tags.mirror === "yes",
            hasOstomate: isOstomate,
            isFree,
            isOpen24h,
            hasSoap: tags.soap === "yes",
            hasAlcohol: tags.hand_disinfectant === "yes",
            hasPaperTowelOrDryer: tags.hand_dryer === "yes",
            toiletStyle: (tags["toilets:position"] === "seated" ? "western" : "both") as "western" | "both",
          },
          openingHours: tags.opening_hours ? (isOpen24h ? "24時間" : tags.opening_hours) : "常時開放",
          description: `OpenStreetMap (Node/Way ID: ${el.id}) に登録されている実在の公衆トイレです。${
            tags.description ? tags.description : ""
          }`,
          reviewCount: 0,
          reviews: [],
          facilitySummary: isTheTokyoToilet
            ? "著名建築家が設計した渋谷区の最新デザイン公衆トイレ。設備充実。"
            : "OpenStreetMapに実在登録されている公衆トイレ。利用者の最新口コミ募集中。",
          facilityNote: isTheTokyoToilet
            ? "著名建築家が設計した渋谷区の最新デザイン公衆トイレ。設備充実。"
            : "OpenStreetMapに実在登録されている公衆トイレ。利用者の最新口コミ募集中。",
          pros,
          cons,
          tips: safeContact ? `公式情報: ${safeContact}` : undefined,
          officialOpenDataId: `osm-${el.id}`,
          googleMapsUrl: `https://www.google.com/maps/search/?api=1&query=${itemLat},${itemLng}`,
        };
      }).filter((t) => t.lat && t.lng);

      const responsePayload = {
        elements: rawElements,
        toilets,
        count: toilets.length,
        source: "OpenStreetMap",
        timestamp: new Date().toISOString(),
      };

      if (toilets.length > 0) {
        osmCacheSet(cacheKey, responsePayload);
      }

      res.json(responsePayload);
    } catch (err: any) {
      console.info("OSM Overpass API fallback served:", err?.message);
      res.json({
        elements: [],
        toilets: [],
        count: 0,
        source: "OpenStreetMap",
        timestamp: new Date().toISOString(),
      });
    }
  });

  // Vite middleware for development vs static build in production
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
