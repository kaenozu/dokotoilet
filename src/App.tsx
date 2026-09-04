import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  ToiletFacility,
  FilterState,
  CityPreset,
  ToiletReview,
} from './types';
import { INITIAL_TOILETS, CITY_PRESETS } from './data/toilets';
import { GOOGLE_SEED } from './data/googleSeed';
import { KUMAGAYA_SEED } from './data/kumagayaSeed';
import { mergeSeedLists } from './lib/seed';
import { filterAndSortToilets } from './lib/filter';
import { gradeForScore } from './lib/scoring';
import { osmAttributesFromTags } from './lib/osm';
import { overlayExternalReviews } from './lib/externalReviews';
import {
  applyDeltaToSeeds,
  emptyDelta,
  extractDelta,
  LOCAL_DELTA_KEY,
  LEGACY_TOILETS_V2_KEY,
  LEGACY_TOILETS_V3_KEY,
  mergeFacilityLists,
  migrateLegacyArray,
  OSM_CACHE_KEY,
  OSM_CACHE_MAX,
  parseLocalDelta,
  parseToiletArray,
  recomputeFromReviews,
  unionServerToilet,
} from './lib/localDeltas';

// Google手動調査・熊谷市ODを優先し、OSM側の重複は設備フラグをOR統合して落とす
const SEED_TOILETS = mergeSeedLists(
  GOOGLE_SEED,
  mergeSeedLists(KUMAGAYA_SEED, INITIAL_TOILETS)
);
import { Header } from './components/Header';
import { ToiletMap } from './components/ToiletMap';
import { ToiletList } from './components/ToiletList';
import { ToiletDetails } from './components/ToiletDetails';
import { DataSourceModal } from './components/DataSourceModal';
import { ReviewModal } from './components/ReviewModal';
import { AddToiletModal } from './components/AddToiletModal';
import {
  List,
  Map as MapIcon,
  Sparkles,
  SlidersHorizontal,
  Info,
} from 'lucide-react';

// M6: シードは保存せず、ユーザーデルタとOSMキャッシュだけを localStorage に残す
const SEED_ID_SET = new Set(SEED_TOILETS.map((t) => t.id));

export function sanitizeToiletFacility(raw: any): ToiletFacility {
  const cleanlinessScore =
    typeof raw?.cleanlinessScore === 'number' && !isNaN(raw.cleanlinessScore)
      ? raw.cleanlinessScore
      : typeof raw?.equipmentScore === 'number' && !isNaN(raw.equipmentScore)
      ? raw.equipmentScore
      : 3.0;

  const cleanlinessGrade =
    raw?.cleanlinessGrade || gradeForScore(cleanlinessScore);

  const equipmentScore =
    typeof raw?.equipmentScore === 'number' && !isNaN(raw.equipmentScore)
      ? raw.equipmentScore
      : cleanlinessScore;

  const equipmentGrade =
    raw?.equipmentGrade || gradeForScore(equipmentScore);

  const subScores = {
    cleanliness:
      typeof raw?.subScores?.cleanliness === 'number' && !isNaN(raw.subScores.cleanliness)
        ? raw.subScores.cleanliness
        : cleanlinessScore,
    odor:
      typeof raw?.subScores?.odor === 'number' && !isNaN(raw.subScores.odor)
        ? raw.subScores.odor
        : cleanlinessScore,
    supplies:
      typeof raw?.subScores?.supplies === 'number' && !isNaN(raw.subScores.supplies)
        ? raw.subScores.supplies
        : cleanlinessScore,
    comfort:
      typeof raw?.subScores?.comfort === 'number' && !isNaN(raw.subScores.comfort)
        ? raw.subScores.comfort
        : cleanlinessScore,
  };

  // 設備フラグは3値（true/false/null）を維持する。欠落・非booleanは null（未確認）。
  // 旧v2データの楽観デフォルト（isFree=true / toiletStyle=western 等）は信用しない
  const rawAttrs = (raw?.attributes ?? {}) as Record<string, unknown>;
  const tri = (v: unknown): boolean | null => (typeof v === 'boolean' ? v : null);
  const attributes = {
    hasWashlet: tri(rawAttrs.hasWashlet),
    hasMultipurpose: tri(rawAttrs.hasMultipurpose),
    hasBabyTable: tri(rawAttrs.hasBabyTable),
    hasNursingRoom: tri(rawAttrs.hasNursingRoom),
    hasPowderRoom: tri(rawAttrs.hasPowderRoom),
    hasOstomate: tri(rawAttrs.hasOstomate),
    isFree: tri(rawAttrs.isFree),
    isOpen24h: tri(rawAttrs.isOpen24h),
    hasSoap: tri(rawAttrs.hasSoap),
    hasAlcohol: tri(rawAttrs.hasAlcohol),
    hasPaperTowelOrDryer: tri(rawAttrs.hasPaperTowelOrDryer),
    toiletStyle:
      rawAttrs.toiletStyle === 'western' ||
      rawAttrs.toiletStyle === 'both' ||
      rawAttrs.toiletStyle === 'japanese'
        ? rawAttrs.toiletStyle
        : null,
  };

  const reviews = Array.isArray(raw?.reviews) ? raw.reviews : [];
  const reviewCount =
    typeof raw?.reviewCount === 'number' && !isNaN(raw.reviewCount)
      ? raw.reviewCount
      : reviews.length;

  return {
    ...raw,
    cleanlinessScore,
    cleanlinessGrade,
    equipmentScore,
    equipmentGrade,
    subScores,
    attributes,
    reviewCount,
    reviews,
  };
}

export default function App() {
  // サーバーが保持している施設ID・レビューID（差分保存からの除外判定に使う）
  const serverFacilityIdsRef = useRef<Set<string>>(new Set());
  const serverKnownReviewsRef = useRef<Map<string, Set<string>>>(new Map());
  // 直近の GET /api/community/toilets で取得した共有レビュー（外部施設向け）。
  // 起動後に新規取得した OSM 施設にも既存の共有レビューを重ねるために保持する
  const externalReviewsRef = useRef<Record<string, ToiletReview[]>>({});
  const noteServerFacility = (facilityId: string, reviewIds: string[]) => {
    serverFacilityIdsRef.current.add(facilityId);
    const set = serverKnownReviewsRef.current.get(facilityId) ?? new Set<string>();
    for (const rid of reviewIds) set.add(rid);
    serverKnownReviewsRef.current.set(facilityId, set);
  };
  const noteReviewsKnown = (facilityId: string, reviewIds: string[]) => {
    const set = serverKnownReviewsRef.current.get(facilityId) ?? new Set<string>();
    for (const rid of reviewIds) set.add(rid);
    serverKnownReviewsRef.current.set(facilityId, set);
  };

  // M6: 起動時は常に「最新バンドル版シード」へ差分を重ねる（シード自体は保存しない）
  const [toilets, setToilets] = useState<ToiletFacility[]>(() => {
    try {
      let delta = parseLocalDelta(localStorage.getItem(LOCAL_DELTA_KEY));
      if (!delta) {
        // 旧形式（v3 → v2 の全体スナップショット）からユーザーデルタへ移行する
        const legacy =
          localStorage.getItem(LEGACY_TOILETS_V3_KEY) ??
          localStorage.getItem(LEGACY_TOILETS_V2_KEY);
        if (legacy) {
          delta = migrateLegacyArray(JSON.parse(legacy));
          localStorage.removeItem(LEGACY_TOILETS_V3_KEY);
          localStorage.removeItem(LEGACY_TOILETS_V2_KEY);
        }
      }
      // OSMリアルタイム取得分は別キーの上限付きキャッシュ
      const cachedOsm = parseToiletArray(localStorage.getItem(OSM_CACHE_KEY));
      const seeded = applyDeltaToSeeds(SEED_TOILETS, delta ?? emptyDelta());
      return mergeFacilityLists(seeded, cachedOsm);
    } catch (e) {
      console.warn('Failed to load saved toilets from localStorage:', e);
    }
    return SEED_TOILETS.map(sanitizeToiletFacility);
  });

  const [selectedToilet, setSelectedToilet] = useState<ToiletFacility | null>(() =>
    SEED_TOILETS[0] ? sanitizeToiletFacility(SEED_TOILETS[0]) : null
  );
  const [mapCenter, setMapCenter] = useState<{ lat: number; lng: number }>({
    lat: 35.6590,
    lng: 139.7034,
  });
  const [mapZoom, setMapZoom] = useState<number>(15);
  const [isLocating, setIsLocating] = useState<boolean>(false);
  const [isLoadingOsm, setIsLoadingOsm] = useState<boolean>(false);

  // Mobile view tab ('map' | 'list')
  const [mobileTab, setMobileTab] = useState<'map' | 'list'>('map');

  // Modals state
  const [isDataSourcesModalOpen, setIsDataSourcesModalOpen] = useState(false);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isReviewModalOpen, setIsReviewModalOpen] = useState(false);

  // Non-blocking toast notifications
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const showToast = (message: string) => {
    setToastMessage(message);
    setTimeout(() => {
      setToastMessage((current) => (current === message ? null : current));
    }, 4000);
  };

  // Filters
  const [filter, setFilter] = useState<FilterState>({
    dataSource: 'all',
    onlyHighCleanliness: false,
    onlyWashlet: false,
    onlyMultipurpose: false,
    onlyPowderRoom: false,
    only24h: false,
    searchQuery: '',
  });

  // M6: localStorage へは「ユーザーデルタ」と「OSMキャッシュ」だけを保存する
  useEffect(() => {
    try {
      localStorage.setItem(
        LOCAL_DELTA_KEY,
        JSON.stringify(
          extractDelta(toilets, {
            facilityIds: serverFacilityIdsRef.current,
            reviewIdsByFacility: serverKnownReviewsRef.current,
          })
        )
      );
      // OSMキャッシュも「再取得可能なデータ」なので、サーバー同期済みレビューは
      // 含めない（git運用でサーバー側から削除されたレビューが復活しないように）。
      const known = serverKnownReviewsRef.current;
      const osmCache = toilets
        .filter((t) => t.dataSource === 'osm' && !SEED_ID_SET.has(t.id))
        .map((t) => {
          const knownIds = known.get(t.id);
          const reviews = t.reviews ?? [];
          if (!knownIds || knownIds.size === 0 || reviews.length === 0) return t;
          const kept = reviews.filter((r) => !knownIds.has(r.id));
          // 共有レビューだけを除いたらスコアも再計算（0件なら設備推定値＝未評価に戻す）
          return kept.length === reviews.length
            ? t
            : recomputeFromReviews(t, kept);
        })
        .slice(-OSM_CACHE_MAX);
      localStorage.setItem(OSM_CACHE_KEY, JSON.stringify(osmCache));
    } catch (e) {
      console.warn('Failed to save user data:', e);
    }
  }, [toilets]);

  // 投票済みレビューID（localStorage。サーバー側はIPハッシュで重複防止）
  const [votedReviewIds, setVotedReviewIds] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('kirei-toilet-voted-reviews');
      const parsed = saved ? JSON.parse(saved) : [];
      return Array.isArray(parsed) ? parsed.filter((x) => typeof x === 'string') : [];
    } catch {
      return [];
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem('kirei-toilet-voted-reviews', JSON.stringify(votedReviewIds));
    } catch {
      /* ignore */
    }
  }, [votedReviewIds]);

  // Fetch shared community toilets from the server (fail-soft: static hosting etc.)
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/community/toilets');
        if (!res.ok) return;
        const data = await res.json();
        const serverItems = Array.isArray(data.toilets)
          ? (data.toilets as any[]).map(sanitizeToiletFacility)
          : [];
        const externalReviews =
          data.externalReviews && typeof data.externalReviews === 'object'
            ? (data.externalReviews as Record<string, ToiletReview[]>)
            : {};
        // 直近スナップショットとして保持（OSM施設の新規取得時に再利用）
        externalReviewsRef.current = externalReviews;
        // M6: サーバーが保持している施設・レビューIDを記録（差分保存から除外する）
        for (const s of serverItems) {
          noteServerFacility(s.id, (s.reviews ?? []).map((r) => r.id));
        }
        for (const [fid, revs] of Object.entries(externalReviews)) {
          if (revs && revs.length > 0) noteReviewsKnown(fid, revs.map((r) => r.id));
        }
        if (serverItems.length === 0 && Object.keys(externalReviews).length === 0) {
          return;
        }
        setToilets((prev) => {
          const prevById = new Map<string, ToiletFacility>(prev.map((t) => [t.id, t]));
          const serverIds = new Set(serverItems.map((t) => t.id));
          // コミュニティトイレはサーバーを正としつつ、ローカル未同期レビューは保持する
          const merged = serverItems.map((s) => {
            const local = prevById.get(s.id);
            return local ? unionServerToilet(local, s) : s;
          });
          const localOnly = prev.filter((t) => !serverIds.has(t.id));
          const base = [...merged, ...localOnly];
          // 外部施設（OSM/Google/OD）の共有レビューをローカル施設へ重ねる（M5）
          return base.map((t) => {
            const reviews = externalReviews[t.id];
            return reviews && reviews.length > 0
              ? overlayExternalReviews(t, reviews)
              : t;
          });
        });
      } catch {
        /* offline / static hosting: local-only mode */
      }
    })();
  }, []);

  // Filtered Toilets List（絞り込み＋ソートは純関数に切り出し: src/lib/filter.ts）
  // ソートは「清潔度順」＝評価済み（口コミあり）をスコア降順→未評価は推定スコア降順。
  const filteredToilets = useMemo(
    () => filterAndSortToilets(toilets, filter),
    [toilets, filter]
  );

  // Live fetch OpenStreetMap toilets around coordinates
  const handleFetchOsmNearCenter = async (
    lat: number,
    lng: number,
    notifyUser: boolean = true
  ) => {
    setIsLoadingOsm(true);
    try {
      const res = await fetch(`/api/osm/toilets?lat=${lat}&lng=${lng}&radius=2000`);
      const data = await res.json();

      let incoming: ToiletFacility[] = [];
      if (Array.isArray(data.toilets) && data.toilets.length > 0) {
        incoming = (data.toilets as any[]).map(sanitizeToiletFacility);
      } else if (Array.isArray(data.elements) && data.elements.length > 0) {
        // Fallback mapper if raw elements returned
        incoming = data.elements
          .map((el: any) => {
            const itemLat = el.lat || el.center?.lat;
            const itemLng = el.lon || el.center?.lon;
            const tags = el.tags || {};
            if (!itemLat || !itemLng) return null;
            return sanitizeToiletFacility({
              id: `osm-${el.id}`,
              name: tags.name || `公衆便所 (OSM #${el.id})`,
              facilityType: '公衆便所 (OpenStreetMap実在登録)',
              category: 'park' as const,
              dataSource: 'osm' as const,
              lat: itemLat,
              lng: itemLng,
              address: tags['addr:full'] || '周辺道路・公園内',
              cleanlinessGrade: 'B' as const,
              cleanlinessScore: 3.4,
              equipmentGrade: 'B' as const,
              equipmentScore: 3.4,
              subScores: { cleanliness: 3.4, odor: 3.3, supplies: 3.5, comfort: 3.4 },
              // タグ欠落は null=未確認（true/false/null の3値。fee 欠落を「無料」と断定しない）
              attributes: osmAttributesFromTags(tags),
              openingHours: tags.opening_hours || '常時開放',
              description: `OpenStreetMap登録の実在公衆便所。`,
              reviewCount: 0,
              reviews: [],
              facilityNote: '実在の公衆トイレ。利用者の最新きれい度口コミ募集中。',
            });
          })
          .filter(Boolean) as ToiletFacility[];
      }

      if (incoming.length === 0) {
        if (notifyUser) {
          showToast('この周辺（半径2km）のOpenStreetMap公衆トイレは見つかりませんでした。');
        }
        return;
      }

      // Merge and deduplicate
      setToilets((prev) => {
        const existingIds = new Set(prev.map((t) => t.id));
        const newFacilities: ToiletFacility[] = [];

        for (const item of incoming) {
          if (!existingIds.has(item.id)) {
            // Coordinate distance check (< 30m)
            const isDuplicateCoord = prev.some(
              (p) => Math.abs(p.lat - item.lat) < 0.0003 && Math.abs(p.lng - item.lng) < 0.0003
            );
            if (!isDuplicateCoord) {
              // 既存のサーバー共有レビュー（externalReviews）があれば新規取得時点で重ねる
              const shared = externalReviewsRef.current[item.id];
              newFacilities.push(
                shared && shared.length > 0
                  ? overlayExternalReviews(item, shared)
                  : item
              );
              existingIds.add(item.id);
            }
          }
        }

        if (newFacilities.length > 0) {
          if (notifyUser) {
            showToast(`新たに ${newFacilities.length} 件の実在公衆トイレをOpenStreetMapから取得しました！`);
          }
          return [...prev, ...newFacilities];
        } else {
          if (notifyUser) {
            showToast('この周辺の実在公衆トイレはすでに取得済みです。');
          }
          return prev;
        }
      });
    } catch {
      if (notifyUser) {
        showToast('実在公衆トイレ（OSM）の取得を完了しました。');
      }
    } finally {
      setIsLoadingOsm(false);
    }
  };

  // Auto-fetch real live OSM toilets on initial mount
  useEffect(() => {
    handleFetchOsmNearCenter(mapCenter.lat, mapCenter.lng, false);
  }, []);

  // Handle City Preset Jump
  const handleCitySelect = (city: CityPreset) => {
    setMapCenter({ lat: city.lat, lng: city.lng });
    setMapZoom(city.zoom);
    handleFetchOsmNearCenter(city.lat, city.lng, false);

    // Find nearest toilet in this city to select
    const nearest = toilets.find(
      (t) =>
        Math.abs(t.lat - city.lat) < 0.05 && Math.abs(t.lng - city.lng) < 0.05
    );
    if (nearest) {
      setSelectedToilet(nearest);
    }
  };

  // Handle User Geolocation
  const handleLocateUser = () => {
    if (!navigator.geolocation) {
      alert('お使いのブラウザは位置情報に対応していません。');
      return;
    }
    setIsLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setIsLocating(false);
        const { latitude, longitude } = pos.coords;
        setMapCenter({ lat: latitude, lng: longitude });
        setMapZoom(16);
        handleFetchOsmNearCenter(latitude, longitude, false);
      },
      (err) => {
        setIsLocating(false);
        console.warn('Geolocation error:', err);
        alert('現在地を取得できませんでした。ブラウザの位置情報権限をご確認ください。');
      },
      { timeout: 10000, enableHighAccuracy: true }
    );
  };

  const applyLocalReview = (toiletId: string, newReview: ToiletReview) => {
    setToilets((prev) =>
      prev.map((item) => {
        if (item.id !== toiletId) return item;

        const updatedReviews = [newReview, ...item.reviews];
        // 次元別に独立集計（総合→overallScore / 清潔さ→cleanlinessScore）
        const updated = {
          ...recomputeFromReviews(item, updatedReviews),
          // 利用者が投稿時に清潔さを確認した旨（base〜上流の挙動を維持）
          lastCleaned: 'たった今（利用者が確認）',
        };

        if (selectedToilet?.id === toiletId) {
          setSelectedToilet(updated);
        }

        return updated;
      })
    );
  };

  // Submit new review (server first, local fallback for offline/static hosting)
  const handleSubmitReview = async (toiletId: string, newReview: ToiletReview) => {
    try {
      const res = await fetch(`/api/community/toilets/${encodeURIComponent(toiletId)}/reviews`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ review: newReview }),
      });
      if (res.ok) {
        const data = await res.json().catch(() => null);
        if (data?.toilet) {
          const updated = data.toilet as ToiletFacility;
          noteServerFacility(updated.id, (updated.reviews ?? []).map((r) => r.id));
          setToilets((prev) =>
            prev.map((t) => (t.id === toiletId ? unionServerToilet(t, updated) : t))
          );
          if (selectedToilet?.id === toiletId) {
            setSelectedToilet((cur) => (cur ? unionServerToilet(cur, updated) : cur));
          }
          return;
        }
        // 外部施設（OSM/Google/OD）: サーバーが共有レビュー一覧を返すので重ねる（M5）
        if (data?.facilityId === toiletId && Array.isArray(data.reviews)) {
          const serverReviews = data.reviews as ToiletReview[];
          // この施設の最新スナップショットを反映（同じ施設の再取得時にも使えるように）
          externalReviewsRef.current = {
            ...externalReviewsRef.current,
            [toiletId]: serverReviews,
          };
          noteReviewsKnown(toiletId, serverReviews.map((r) => r.id));
          setToilets((prev) =>
            prev.map((t) =>
              t.id === toiletId ? overlayExternalReviews(t, serverReviews) : t
            )
          );
          if (selectedToilet?.id === toiletId) {
            setSelectedToilet(overlayExternalReviews(selectedToilet, serverReviews));
          }
          return;
        }
      } else {
        const err = await res.json().catch(() => null);
        if (err?.error) showToast(`投稿できませんでした: ${err.error}`);
      }
    } catch {
      /* offline: fall through to local */
    }
    applyLocalReview(toiletId, newReview);
  };

  // Add new toilet (server first, local fallback)
  const handleAddToilet = async (newFacility: ToiletFacility) => {
    const sanitized = sanitizeToiletFacility(newFacility);
    setToilets((prev) => [sanitized, ...prev]);
    setSelectedToilet(sanitized);
    setMapCenter({ lat: sanitized.lat, lng: sanitized.lng });
    setMapZoom(16);
    try {
      const res = await fetch('/api/community/toilets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: newFacility.id,
          name: newFacility.name,
          category: newFacility.category,
          address: newFacility.address,
          floorInfo: newFacility.floorInfo,
          cleanlinessScore: newFacility.cleanlinessScore,
          description: newFacility.description,
          lat: newFacility.lat,
          lng: newFacility.lng,
          attributes: {
            hasWashlet: newFacility.attributes.hasWashlet,
            hasMultipurpose: newFacility.attributes.hasMultipurpose,
            hasBabyTable: newFacility.attributes.hasBabyTable,
            hasPowderRoom: newFacility.attributes.hasPowderRoom,
            isOpen24h: newFacility.attributes.isOpen24h,
          },
        }),
      });
      if (res.ok) {
        const data = (await res.json().catch(() => null)) as {
          toilet?: ToiletFacility;
        } | null;
        const serverToilet = data?.toilet;
        if (serverToilet) {
          noteServerFacility(serverToilet.id, []);
          // サーバー保存版（reviewCount: 0 / reviews: [] に正規化済み）を正として同期する
          setToilets((prev) =>
            prev.map((t) =>
              t.id === serverToilet.id ? unionServerToilet(t, serverToilet) : t
            )
          );
          setSelectedToilet((cur) =>
            cur?.id === serverToilet.id ? unionServerToilet(cur, serverToilet) : cur
          );
          return;
        }
      } else {
        const err = await res.json().catch(() => null);
        if (err?.error) showToast(`共有登録できませんでした: ${err.error}（この端末のみに保存）`);
      }
    } catch {
      /* offline: local-only */
    }
  };

  // Helpful vote (once per browser; server enforces once per IP)
  const handleVoteHelpful = async (toiletId: string, reviewId: string) => {
    if (votedReviewIds.includes(reviewId)) return;
    setVotedReviewIds((prev) => [...prev, reviewId]);
    setToilets((prev) =>
      prev.map((t) =>
        t.id === toiletId
          ? {
              ...t,
              reviews: t.reviews.map((r) =>
                r.id === reviewId ? { ...r, helpfulCount: r.helpfulCount + 1 } : r
              ),
            }
          : t
      )
    );
    try {
      const res = await fetch(`/api/community/reviews/${encodeURIComponent(reviewId)}/helpful`, {
        method: 'POST',
      });
      if (res.ok) {
        const data = await res.json();
        setToilets((prev) =>
          prev.map((t) =>
            t.id === toiletId
              ? {
                  ...t,
                  reviews: t.reviews.map((r) =>
                    r.id === reviewId ? { ...r, helpfulCount: data.helpfulCount } : r
                  ),
                }
              : t
          )
        );
      }
    } catch {
      /* offline: local count only */
    }
  };

  // Report a review (moderation queue on the server)
  const handleReportReview = async (toiletId: string, reviewId: string) => {
    const reason = window.prompt('通報理由を入力してください（不適切な内容・いたずら等）');
    if (!reason || !reason.trim()) return;
    try {
      const res = await fetch(`/api/community/reviews/${encodeURIComponent(reviewId)}/report`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ toiletId, reason: reason.trim() }),
      });
      showToast(res.ok ? '通報を受け付けました。確認します。' : '通報できませんでした。');
    } catch {
      showToast('通報できませんでした（オフライン）。');
    }
  };

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-canvas text-ink-soft font-sans antialiased">
      {/* App Header */}
      <Header
        filter={filter}
        setFilter={setFilter}
        onOpenAddModal={() => setIsAddModalOpen(true)}
        onOpenDataSourcesModal={() => setIsDataSourcesModalOpen(true)}
        onCitySelect={handleCitySelect}
        onLocateUser={handleLocateUser}
        isLocating={isLocating}
      />

      {/* Main Layout Body */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* Left Side: Toilet List (Desktop: always visible, Mobile: hidden if map tab) */}
        <div
          className={`w-full md:w-80 lg:w-96 shrink-0 h-full z-10 ${
            mobileTab === 'list' ? 'block' : 'hidden md:block'
          }`}
        >
          <ToiletList
            toilets={filteredToilets}
            selectedToilet={selectedToilet}
            onSelectToilet={(t) => {
              setSelectedToilet(t);
              setMapCenter({ lat: t.lat, lng: t.lng });
              if (mobileTab === 'list') {
                setMobileTab('map');
              }
            }}
            searchQuery={filter.searchQuery}
            setSearchQuery={(q) => setFilter((prev) => ({ ...prev, searchQuery: q }))}
          />
        </div>

        {/* Center: Interactive Map */}
        <div
          className={`flex-1 h-full relative ${
            mobileTab === 'map' ? 'block' : 'hidden md:block'
          }`}
        >
          <ToiletMap
            toilets={filteredToilets}
            selectedToilet={selectedToilet}
            onSelectToilet={(t) => {
              setSelectedToilet(t);
            }}
            center={mapCenter}
            zoom={mapZoom}
            onFetchOsmNearCenter={handleFetchOsmNearCenter}
            isLoadingOsm={isLoadingOsm}
            detailsOpen={selectedToilet !== null}
          />
        </div>

        {/* Right Side: Selected Toilet Details Drawer */}
        {selectedToilet && (
          <div className="fixed md:static inset-y-0 right-0 z-20 w-full sm:w-96 md:w-96 lg:w-[420px] shrink-0 h-full shadow-2xl md:shadow-none border-l border-line bg-surface">
            <ToiletDetails
              toilet={selectedToilet}
              onClose={() => setSelectedToilet(null)}
              onOpenReviewModal={() => setIsReviewModalOpen(true)}
              onVoteHelpful={handleVoteHelpful}
              onReportReview={handleReportReview}
              votedReviewIds={votedReviewIds}
            />
          </div>
        )}
      </div>

      {/* Mobile Bottom Tab Switcher (Visible only on small screens) */}
      <div className="md:hidden flex items-center justify-around border-t border-line bg-surface py-2 px-4 z-30">
        <button
          type="button"
          onClick={() => setMobileTab('map')}
          className={`flex flex-col items-center gap-1 text-xs font-medium ${
            mobileTab === 'map' ? 'text-accent' : 'text-faint hover:text-ink-soft'
          }`}
        >
          <MapIcon className="w-5 h-5" />
          <span>マップ表示</span>
        </button>

        <button
          type="button"
          onClick={() => setMobileTab('list')}
          className={`flex flex-col items-center gap-1 text-xs font-medium ${
            mobileTab === 'list' ? 'text-accent' : 'text-faint hover:text-ink-soft'
          }`}
        >
          <List className="w-5 h-5" />
          <span>リスト ({filteredToilets.length})</span>
        </button>

        <button
          type="button"
          onClick={() => setIsDataSourcesModalOpen(true)}
          className="flex flex-col items-center gap-1 text-xs font-medium text-faint hover:text-ink-soft"
        >
          <Info className="w-5 h-5" />
          <span>データ元比較</span>
        </button>
      </div>

      {/* Modals */}
      <DataSourceModal
        isOpen={isDataSourcesModalOpen}
        onClose={() => setIsDataSourcesModalOpen(false)}
      />

      <ReviewModal
        toilet={selectedToilet}
        isOpen={isReviewModalOpen}
        onClose={() => setIsReviewModalOpen(false)}
        onSubmitReview={handleSubmitReview}
      />

      <AddToiletModal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        onAddToilet={handleAddToilet}
        defaultLocation={mapCenter}
      />

      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-16 sm:bottom-6 left-1/2 -translate-x-1/2 z-50 bg-ink/95 backdrop-blur-md text-white text-xs font-medium px-4 py-2.5 rounded-xl border border-white/10 shadow-2xl flex items-center gap-2 pointer-events-auto">
          <Sparkles className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{toastMessage}</span>
        </div>
      )}
    </div>
  );
}
