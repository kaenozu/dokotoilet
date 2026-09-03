import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { REAL_OSM_SEED } from "./src/data/realOsmSeed";

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // Health check
  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
  });

  // In-memory cache for live OpenStreetMap Overpass queries (15-minute TTL)
  const osmCache = new Map<string, { timestamp: number; data: any }>();
  const OSM_CACHE_TTL = 15 * 60 * 1000;

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

      // Lightweight and indexed node query for public restrooms (completes in ~1.5s vs 10s+ for polygons)
      const overpassQuery = `[out:json][timeout:6];node["amenity"="toilets"](around:${radius},${lat},${lng});out body 45;`;

      // Fast, resilient mirrors
      const mirrors = [
        "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
        "https://overpass.kumi.systems/api/interpreter",
        "https://overpass-api.de/api/interpreter",
      ];

      let rawElements: any[] = [];
      let fetchSuccess = false;

      for (const mirrorUrl of mirrors) {
        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 4500);

          const osmResponse = await fetch(mirrorUrl, {
            method: "POST",
            body: "data=" + encodeURIComponent(overpassQuery),
            headers: {
              "Content-Type": "application/x-www-form-urlencoded",
              "User-Agent": "CleanToiletMap/1.0",
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
        const isFree = tags.fee === "no" || !tags.fee;
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
            hasSoap: tags.soap !== "no",
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
          aiSummary: isTheTokyoToilet
            ? "著名建築家が設計した渋谷区の最新デザイン公衆トイレ。設備充実。"
            : "OpenStreetMapに実在登録されている公衆トイレ。利用者の最新口コミ募集中。",
          pros,
          cons,
          tips: tags["contact:website"] ? `公式情報: ${tags["contact:website"]}` : undefined,
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
        osmCache.set(cacheKey, { timestamp: Date.now(), data: responsePayload });
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
