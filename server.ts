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
import {
  isTheTokyoToiletTags,
  osmAttributesFromTags,
  triFromFee,
  triFromOpen24h,
  triFromYesNo,
} from "./src/lib/osm";

/** クエリパラメータ→数値。未指定は undefined、指定があれば数値化（数値化不能は NaN）。 */
function parseQueryNum(v: unknown): number | undefined {
  if (v === undefined) return undefined;
  if (typeof v === "number") return v;
  if (typeof v === "string" && v.trim() !== "") return Number(v);
  return NaN;
}

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
    if (osmCache.has(key)) osmCache.delete(key);
    while (osmCache.size >= OSM_CACHE_MAX) {
      const oldest = osmCache.keys().next();
      if (oldest.done) break;
      osmCache.delete(oldest.value);
    }
    osmCache.set(key, { timestamp: Date.now(), data });
  }

  const cacheSweeper = setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of osmCache) {
      if (now - entry.timestamp >= OSM_CACHE_TTL) osmCache.delete(key);
    }
  }, 5 * 60 * 1000);
  (cacheSweeper as unknown as { unref?: () => void }).unref?.();

  app.get("/api/osm/toilets", async (req, res) => {
    try {
      const q = {
        lat: parseQueryNum(req.query.lat),
        lng: parseQueryNum(req.query.lng),
        radius: parseQueryNum(req.query.radius),
      };
      if (
        (q.lat !== undefined && !(q.lat >= -90 && q.lat <= 90)) ||
        (q.lng !== undefined && !(q.lng >= -180 && q.lng <= 180)) ||
        (q.radius !== undefined && !(q.radius >= 1 && q.radius <= 3000))
      ) {
        console.warn("[osm-proxy] invalid query parameters:", req.query);
        res.status(400).json({
          error: "invalid query parameter: lat (-90..90), lng (-180..180), radius (1..3000)",
        });
        return;
      }
      const lat = q.lat ?? 35.6590;
      const lng = q.lng ?? 139.7006;
      const radius = q.radius ?? 1500;

      const cacheKey = `${lat.toFixed(2)}_${lng.toFixed(2)}_${radius}`;
      const cached = osmCache.get(cacheKey);
      if (cached && Date.now() - cached.timestamp < OSM_CACHE_TTL) {
        res.json(cached.data);
        return;
      }

      const overpassQuery = `[out:json][timeout:10];nwr["amenity"="toilets"](around:${radius},${lat},${lng});out center 100;`;
      const mirrors = [
        "https://overpass.kumi.systems/api/interpreter",
        "https://overpass-api.de/api/interpreter",
        "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
      ];

      let rawElements: any[] = [];
      let fetchSuccess = false;
      let lastMirrorError: unknown = null;

      for (const mirrorUrl of mirrors) {
        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 8000);
          const osmResponse = await fetch(mirrorUrl, {
            method: "POST",
            body: "data=" + encodeURIComponent(overpassQuery),
            headers: {
              "Content-Type": "application/x-www-form-urlencoded",
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
        } catch (e) {
          lastMirrorError = e;
          continue;
        }
      }

      if (!fetchSuccess) {
        console.error(
          "[osm-proxy] All Overpass mirrors returned no usable data; falling back to seed:",
          lastMirrorError instanceof Error
            ? lastMirrorError.message
            : "(empty / non-200 responses)"
        );
      }

      let source: "overpass" | "seed" | "none" = fetchSuccess ? "overpass" : "none";
      if (!fetchSuccess || rawElements.length === 0) {
        const matchedSeed = REAL_OSM_SEED.filter((el: any) => {
          const dLat = Math.abs((el.lat || 0) - lat);
          const dLng = Math.abs((el.lon || 0) - lng);
          return dLat < 0.04 && dLng < 0.04;
        });
        if (matchedSeed.length > 0) {
          rawElements = matchedSeed;
          source = "seed";
        }
      }

      const toilets = rawElements.map((el: any) => {
        const itemLat = el.lat || el.center?.lat;
        const itemLng = el.lon || el.center?.lon;
        const tags = el.tags || {};
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

        const isTheTokyoToilet = isTheTokyoToiletTags(tags);
        const isWheelchair = tags.wheelchair === "yes";
        const hasDiaper = tags.diaper === "yes" || tags.changing_table === "yes";
        const hasWashlet = triFromYesNo(tags.washlet);
        const isFree = triFromFee(tags.fee);
        const isOpen24h = triFromOpen24h(tags.opening_hours);
        const isOstomate = triFromYesNo(tags.ostomate);

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
        if (hasWashlet === false) cons.push("ウォシュレット非対応");
        if (tags.wheelchair === "no") cons.push("車椅子非対応の構造");

        const rawContact = tags["contact:website"];
        const safeContact =
          typeof rawContact === "string" && /^https?:\/\/[^\\"'\s]+$/i.test(rawContact.trim())
            ? rawContact.trim()
            : undefined;

        return {
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
          attributes: osmAttributesFromTags(tags),
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
        source,
        timestamp: new Date().toISOString(),
      };

      if (toilets.length > 0) osmCacheSet(cacheKey, responsePayload);
      res.json(responsePayload);
    } catch (err: any) {
      console.error("OSM Overpass API error:", err?.message ?? err);
      res.status(502).json({
        elements: [],
        toilets: [],
        count: 0,
        source: "error",
        error: err?.message ?? "unknown",
        timestamp: new Date().toISOString(),
      });
    }
  });

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
