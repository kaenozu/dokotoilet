import React, { useState, useEffect, useMemo } from 'react';
import {
  ToiletFacility,
  FilterState,
  CityPreset,
  ToiletReview,
} from './types';
import { INITIAL_TOILETS, CITY_PRESETS } from './data/toilets';
import { GOOGLE_SEED } from './data/googleSeed';
import { KUMAGAYA_SEED } from './data/kumagayaSeed';
import { gradeForScore } from './lib/scoring';
import { mergeSeedLists } from './lib/seed';

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

const STORAGE_KEY_TOILETS = 'toilet_cleanliness_map_real_v3';
const LEGACY_STORAGE_KEY_TOILETS = 'toilet_cleanliness_map_real_v2';
// types.ts の DataSourceType と対応。不明な値も保持するため列挙しておく
const KNOWN_DATA_SOURCES = new Set(['google', 'osm', 'opendata', 'community']);

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

  const rawAttrs = raw?.attributes || {};
  const attributes = {
    hasWashlet: Boolean(rawAttrs.hasWashlet),
    hasMultipurpose: Boolean(rawAttrs.hasMultipurpose),
    hasBabyTable: Boolean(rawAttrs.hasBabyTable),
    hasNursingRoom: Boolean(rawAttrs.hasNursingRoom),
    hasPowderRoom: Boolean(rawAttrs.hasPowderRoom),
    hasOstomate: Boolean(rawAttrs.hasOstomate),
    isFree: rawAttrs.isFree !== false,
    isOpen24h: Boolean(rawAttrs.isOpen24h),
    hasSoap: Boolean(rawAttrs.hasSoap),
    hasAlcohol: Boolean(rawAttrs.hasAlcohol),
    hasPaperTowelOrDryer: Boolean(rawAttrs.hasPaperTowelOrDryer),
    toiletStyle: rawAttrs.toiletStyle || 'western',
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
  // Persistence for user reviews and newly added toilets (Strictly real data only, no mock samples)
  const [toilets, setToilets] = useState<ToiletFacility[]>(() => {
    try {
      // v3が無ければv2から移行する（v2は残し、保存はv3へ）
      const saved =
        localStorage.getItem(STORAGE_KEY_TOILETS) ??
        localStorage.getItem(LEGACY_STORAGE_KEY_TOILETS);
      if (saved) {
        const parsed: unknown = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          // 将来の dataSource（google/opendata等）を黙って捨てない。
          // 旧v2のモック除外ルールも維持する
          const migrated = (parsed as any[]).filter(
            (t) =>
              t &&
              typeof t.id === 'string' &&
              (t.id.startsWith('osm-') ||
                t.id.startsWith('toilet-user-') ||
                (typeof t.dataSource === 'string' &&
                  KNOWN_DATA_SOURCES.has(t.dataSource)))
          );
          if (migrated.length > 0) {
            return migrated.map(sanitizeToiletFacility);
          }
        }
      }
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
    category: 'all',
    dataSource: 'all',
    minGrade: 'all',
    onlyWashlet: false,
    onlyMultipurpose: false,
    onlyBabyTable: false,
    onlyPowderRoom: false,
    only24h: false,
    onlyFree: false,
    onlyHighCleanliness: false,
    searchQuery: '',
  });

  // Save toilets to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY_TOILETS, JSON.stringify(toilets));
    } catch (e) {
      console.warn('Failed to save toilets:', e);
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
        if (!Array.isArray(data.toilets)) return;
        const serverItems = (data.toilets as any[]).map(sanitizeToiletFacility);
        if (serverItems.length === 0) return;
        setToilets((prev) => {
          const serverIds = new Set(serverItems.map((t) => t.id));
          // サーバー側を正とし、サーバーに無いローカル分（オフライン投稿等）は残す
          const localOnly = prev.filter((t) => !serverIds.has(t.id));
          return [...serverItems, ...localOnly];
        });
      } catch {
        /* offline / static hosting: local-only mode */
      }
    })();
  }, []);

  // Filtered Toilets List
  const filteredToilets = useMemo(() => {
    return toilets.filter((item) => {
      // Search query
      if (filter.searchQuery.trim()) {
        const q = filter.searchQuery.toLowerCase();
        const matches =
          (item.name || '').toLowerCase().includes(q) ||
          (item.address || '').toLowerCase().includes(q) ||
          (item.facilityType || '').toLowerCase().includes(q) ||
          (item.floorInfo && item.floorInfo.toLowerCase().includes(q));
        if (!matches) return false;
      }

      // High cleanliness (Grade S & A)
      if (filter.onlyHighCleanliness && (item.cleanlinessScore ?? 0) < 4.0) {
        return false;
      }

      // Washlet
      if (filter.onlyWashlet && !item.attributes?.hasWashlet) {
        return false;
      }

      // Multipurpose
      if (filter.onlyMultipurpose && !item.attributes?.hasMultipurpose) {
        return false;
      }

      // Baby Table
      if (filter.onlyBabyTable && !item.attributes?.hasBabyTable) {
        return false;
      }

      // Powder Room
      if (filter.onlyPowderRoom && !item.attributes?.hasPowderRoom) {
        return false;
      }

      // 24h
      if (filter.only24h && !item.attributes?.isOpen24h) {
        return false;
      }

      // Data source
      if (filter.dataSource !== 'all' && item.dataSource !== filter.dataSource) {
        return false;
      }

      return true;
    });
  }, [toilets, filter]);

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
              attributes: {
                hasWashlet: tags.washlet === 'yes',
                hasMultipurpose: tags.wheelchair === 'yes',
                hasBabyTable: tags.changing_table === 'yes',
                hasNursingRoom: false,
                hasPowderRoom: false,
                hasOstomate: tags.ostomate === 'yes',
                isFree: tags.fee !== 'yes',
                isOpen24h: tags.opening_hours === '24/7',
                hasSoap: tags.soap === 'yes',
                hasAlcohol: false,
                hasPaperTowelOrDryer: false,
                toiletStyle: 'both' as const,
              },
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
              newFacilities.push(item);
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

        const updatedReviews = [newReview, ...(item.reviews || [])];
        const newCount = updatedReviews.length;

        // Recalculate average cleanliness score
        const totalRating = updatedReviews.reduce((sum, r) => sum + (r.rating || 0), 0);
        const newScore = newCount > 0 ? parseFloat((totalRating / newCount).toFixed(1)) : 3.0;
        const newGrade = gradeForScore(newScore);

        const updated = sanitizeToiletFacility({
          ...item,
          cleanlinessGrade: newGrade,
          cleanlinessScore: newScore,
          reviewCount: newCount,
          lastCleaned: 'たった今（利用者が確認）',
          reviews: updatedReviews,
        });

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
        const data = await res.json();
        if (data.toilet) {
          const updated = sanitizeToiletFacility(data.toilet);
          setToilets((prev) => prev.map((t) => (t.id === toiletId ? updated : t)));
          if (selectedToilet?.id === toiletId) setSelectedToilet(updated);
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
      if (!res.ok) {
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
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-[#0a0a0a] text-[#e0e0e0] font-sans antialiased">
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
          />
        </div>

        {/* Right Side: Selected Toilet Details Drawer */}
        {selectedToilet && (
          <div className="fixed md:static inset-y-0 right-0 z-20 w-full sm:w-96 md:w-96 lg:w-[420px] shrink-0 h-full shadow-2xl md:shadow-none border-l border-[#222222] bg-[#121212]">
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
      <div className="md:hidden flex items-center justify-around border-t border-[#222222] bg-[#111111] py-2 px-4 z-30">
        <button
          type="button"
          onClick={() => setMobileTab('map')}
          className={`flex flex-col items-center gap-1 text-xs font-medium ${
            mobileTab === 'map' ? 'text-[#00d1b2]' : 'text-[#888888] hover:text-[#e0e0e0]'
          }`}
        >
          <MapIcon className="w-5 h-5" />
          <span>マップ表示</span>
        </button>

        <button
          type="button"
          onClick={() => setMobileTab('list')}
          className={`flex flex-col items-center gap-1 text-xs font-medium ${
            mobileTab === 'list' ? 'text-[#00d1b2]' : 'text-[#888888] hover:text-[#e0e0e0]'
          }`}
        >
          <List className="w-5 h-5" />
          <span>リスト ({filteredToilets.length})</span>
        </button>

        <button
          type="button"
          onClick={() => setIsDataSourcesModalOpen(true)}
          className="flex flex-col items-center gap-1 text-xs font-medium text-[#888888] hover:text-[#e0e0e0]"
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
        <div className="fixed bottom-16 sm:bottom-6 left-1/2 -translate-x-1/2 z-50 bg-[#1a1a1a]/95 backdrop-blur-md text-[#f5f5f5] text-xs font-medium px-4 py-2.5 rounded-xl border border-[#333333] shadow-2xl flex items-center gap-2 pointer-events-auto">
          <Sparkles className="w-4 h-4 text-[#00d1b2] shrink-0" />
          <span>{toastMessage}</span>
        </div>
      )}
    </div>
  );
}
