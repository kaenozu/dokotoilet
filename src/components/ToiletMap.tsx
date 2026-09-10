import React, { useEffect, useRef, useState } from 'react';
import { ToiletFacility } from '../types';
import {
  RefreshCw,
  Layers,
  MapPin,
  Check,
  Globe,
  Map as MapIcon,
  Moon,
  ChevronDown,
} from 'lucide-react';
import L from 'leaflet';
import { isViewportAlreadyAt } from '../lib/uiState';

export type MapTileStyle = 'osm' | 'gsi' | 'gsi_pale' | 'osm_dark';

interface TileConfig {
  id: MapTileStyle;
  label: string;
  shortLabel: string;
  description: string;
  url: string;
  attribution: string;
  maxZoom: number;
  isDarkFilter: boolean;
}

const TILE_STYLES: TileConfig[] = [
  {
    id: 'osm',
    label: 'OpenStreetMap (標準公式)',
    shortLabel: 'OSM標準',
    description: '公式OSMタイル・全世界対応・完全無料・APIキー不要',
    url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> contributors',
    maxZoom: 19,
    isDarkFilter: false,
  },
  {
    id: 'gsi',
    label: '国土地理院 (日本詳細地図)',
    shortLabel: '国土地理院',
    description: '日本の公的機関による詳細地図・建物/番地明瞭・キー不要',
    url: 'https://cyberjapandata.gsi.go.jp/xyz/std/{z}/{x}/{y}.png',
    attribution:
      '&copy; <a href="https://maps.gsi.go.jp/development/ichiran.html" target="_blank" rel="noreferrer">国土地理院</a>',
    maxZoom: 18,
    isDarkFilter: false,
  },
  {
    id: 'gsi_pale',
    label: '国土地理院 (淡色地図)',
    shortLabel: '地理院(淡色)',
    description: '目に優しいすっきりとした淡色・トイレピンが見やすい',
    url: 'https://cyberjapandata.gsi.go.jp/xyz/pale/{z}/{x}/{y}.png',
    attribution:
      '&copy; <a href="https://maps.gsi.go.jp/development/ichiran.html" target="_blank" rel="noreferrer">国土地理院</a>',
    maxZoom: 18,
    isDarkFilter: false,
  },
  {
    id: 'osm_dark',
    label: 'OSM (ダーク調)',
    shortLabel: 'OSMダーク',
    description: '公式OSMに安全なCSS夜間フィルターを適用・キー不要',
    url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> contributors',
    maxZoom: 19,
    isDarkFilter: true,
  },
];

interface ToiletMapProps {
  toilets: ToiletFacility[];
  selectedToilet: ToiletFacility | null;
  onSelectToilet: (toilet: ToiletFacility) => void;
  center: { lat: number; lng: number };
  zoom: number;
  onFetchOsmNearCenter: (lat: number, lng: number) => void;
  onViewportChange?: (center: { lat: number; lng: number }, zoom: number) => void;
  isLoadingOsm: boolean;
  /** 詳細パネル（drawer）が開いているか。開閉で地図コンテナ幅が変わるため
   *  Leaflet に invalidateSize を伝える（灰色タイル欠けの防止） */
  detailsOpen?: boolean;
  /** モバイルタブ切替等のレイアウト変化キー。変化時にも invalidateSize を走らせる */
  layoutKey?: string;
}

// 実測評価判定とグレード配色は src/lib/grade.ts へ移動（ToiletList / ToiletDetails と共有）
import { displayGrade, evaluationKindLabel, getGradeColor } from '../lib/grade';

export const ToiletMap: React.FC<ToiletMapProps> = ({
  toilets,
  selectedToilet,
  onSelectToilet,
  center,
  zoom,
  onFetchOsmNearCenter,
  onViewportChange,
  isLoadingOsm,
  detailsOpen = false,
  layoutKey,
}) => {
  const leafletContainerRef = useRef<HTMLDivElement>(null);
  const leafletMapRef = useRef<L.Map | null>(null);
  const markersGroupRef = useRef<L.LayerGroup | null>(null);
  const currentTileLayerRef = useRef<L.TileLayer | null>(null);
  // 最新のハンドラを ref で保持（マーカー再構築を親の再レンダー毎に走らせない）
  const onSelectToiletRef = useRef(onSelectToilet);
  onSelectToiletRef.current = onSelectToilet;
  const onViewportChangeRef = useRef(onViewportChange);
  onViewportChangeRef.current = onViewportChange;

  const [currentMapCenter, setCurrentMapCenter] = useState(center);
  const [currentTileStyle, setCurrentTileStyle] = useState<MapTileStyle>('osm');
  const [showTileSelector, setShowTileSelector] = useState(false);

  // Initialize Leaflet Map
  useEffect(() => {
    if (!leafletContainerRef.current) return;

    if (!leafletMapRef.current) {
      const map = L.map(leafletContainerRef.current, {
        zoomControl: false,
      }).setView([center.lat, center.lng], zoom);

      L.control.zoom({ position: 'bottomright' }).addTo(map);

      markersGroupRef.current = L.layerGroup().addTo(map);
      leafletMapRef.current = map;

      map.on('moveend', () => {
        const c = map.getCenter();
        const nextCenter = { lat: c.lat, lng: c.lng };
        setCurrentMapCenter(nextCenter);
        onViewportChangeRef.current?.(nextCenter, map.getZoom());
      });
    }

    return () => {
      // アンマウント時に破棄しないとインスタンスが残存する
      leafletMapRef.current?.remove();
      leafletMapRef.current = null;
      markersGroupRef.current = null;
      currentTileLayerRef.current = null;
    };
  }, []);

  // Handle TileLayer switching (100% Free - Official OSM & GSI Japan)
  useEffect(() => {
    if (!leafletMapRef.current) return;
    const config =
      TILE_STYLES.find((s) => s.id === currentTileStyle) || TILE_STYLES[0];

    // Remove previous tile layer
    if (currentTileLayerRef.current) {
      leafletMapRef.current.removeLayer(currentTileLayerRef.current);
    }

    // Add new authentic tile layer
    const newLayer = L.tileLayer(config.url, {
      attribution: config.attribution,
      maxZoom: config.maxZoom,
    }).addTo(leafletMapRef.current);
    currentTileLayerRef.current = newLayer;

    // Toggle dark filter class on container (only applies to tile pane, pins stay vibrant)
    if (leafletContainerRef.current) {
      if (config.isDarkFilter) {
        leafletContainerRef.current.classList.add('leaflet-dark-tiles');
      } else {
        leafletContainerRef.current.classList.remove('leaflet-dark-tiles');
      }
    }
  }, [currentTileStyle]);

  // Update center when prop changes
  useEffect(() => {
    if (leafletMapRef.current) {
      const map = leafletMapRef.current;
      const current = map.getCenter();
      const currentZoom = map.getZoom();
      if (isViewportAlreadyAt(
        { lat: current.lat, lng: current.lng, zoom: currentZoom },
        { lat: center.lat, lng: center.lng, zoom }
      )) {
        return;
      }
      map.flyTo([center.lat, center.lng], zoom, {
        duration: 1.2,
      });
    }
  }, [center.lat, center.lng, zoom]);

  // Render Leaflet Markers
  useEffect(() => {
    if (!leafletMapRef.current || !markersGroupRef.current) return;
    markersGroupRef.current.clearLayers();

    toilets.forEach((toilet) => {
      const isSelected = selectedToilet?.id === toilet.id;
      // 口コミ0件でも調査/推定グレードを表示する（初期状態のマップに意味を持たせる）。
      // 実測以外は少し薄くして出所の違いが分かるようにする
      const shown = displayGrade(toilet);
      const colorInfo = getGradeColor(shown.grade);
      const gradeLetter = shown.grade;
      const dimmed = shown.kind !== 'measured' ? 'opacity-80 saturate-[.65]' : '';

      const customIcon = L.divIcon({
        className: 'custom-toilet-marker',
        html: `
          <div class="relative group cursor-pointer transition-transform duration-200 ${dimmed} ${
            isSelected ? 'scale-125 z-50' : 'hover:scale-110 z-10'
          }">
            <div class="flex items-center justify-center w-8 h-8 rounded-full shadow-lg text-white font-bold text-xs ${
              colorInfo.bg
            } ring-2 ${
          isSelected
            ? 'ring-accent ring-offset-2 ring-offset-white shadow-[0_2px_12px_rgba(27,40,33,0.35)]'
            : shown.kind !== 'measured'
              ? 'ring-slate-200'
              : 'ring-white'
        }">
              ${gradeLetter}
            </div>
            <div class="absolute -bottom-1 left-1/2 -translate-x-1/2 w-2 h-2 rotate-45 ${
              colorInfo.bg
            }"></div>
          </div>
        `,
        iconSize: [32, 36],
        iconAnchor: [16, 36],
      });

      const marker = L.marker([toilet.lat, toilet.lng], {
        icon: customIcon,
        title: `${toilet.name}（${evaluationKindLabel(shown.kind)} ${gradeLetter}級）`,
      });
      marker.on('click', () => {
        // 最新のハンドラを使う（ref経由。effectの再実行を防ぐため deps に入れない）
        onSelectToiletRef.current(toilet);
      });
      markersGroupRef.current?.addLayer(marker);
    });
  }, [toilets, selectedToilet?.id]);

  // 詳細パネル（drawer）開閉で地図コンテナ幅が変わる → Leaflet にサイズを伝える
  useEffect(() => {
    const map = leafletMapRef.current;
    if (!map) return;
    // レイアウト確定後に再計測（描画直後と少し遅らせての2回で欠けを防ぐ）
    const raf = requestAnimationFrame(() => map.invalidateSize());
    const timer = setTimeout(() => map.invalidateSize(), 250);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(timer);
    };
  }, [detailsOpen, layoutKey]);

  const activeTileConfig =
    TILE_STYLES.find((s) => s.id === currentTileStyle) || TILE_STYLES[0];

  return (
    <div className="relative w-full h-full min-h-[420px] bg-canvas overflow-hidden isolate z-0">
      <div ref={leafletContainerRef} className="w-full h-full" />

      {/* Floating Map Controls & Overlays */}
      <div className="absolute top-3 left-3 z-10 flex flex-wrap items-center gap-2 pointer-events-none">
        {/* Fetch OpenStreetMap in this Area */}
        <button
          type="button"
          onClick={() => {
            const lat = leafletMapRef.current
              ? leafletMapRef.current.getCenter().lat
              : currentMapCenter.lat;
            const lng = leafletMapRef.current
              ? leafletMapRef.current.getCenter().lng
              : currentMapCenter.lng;
            onFetchOsmNearCenter(lat, lng);
          }}
          disabled={isLoadingOsm}
          className="pointer-events-auto inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white/95 backdrop-blur-md text-ink-soft text-xs font-semibold shadow-xl border border-line hover:bg-surface-2 hover:border-line-strong transition-all disabled:opacity-50"
        >
          <RefreshCw
            className={`w-3.5 h-3.5 text-accent ${
              isLoadingOsm ? 'animate-spin' : ''
            }`}
          />
          <span>
            {isLoadingOsm
              ? 'OSMから公衆トイレを取得中...'
              : 'この周辺の公衆トイレをOSM取得'}
          </span>
        </button>

        {/* Tile Style Selector (100% Free & No API Key) */}
        <div className="pointer-events-auto relative">
            <button
              type="button"
              onClick={() => setShowTileSelector(!showTileSelector)}
              className="inline-flex items-center gap-1.5 px-2.5 py-2 rounded-lg bg-white/95 backdrop-blur-md text-ink-soft text-xs font-medium shadow-xl border border-line hover:bg-surface-2 hover:border-line-strong transition-all"
              title="地図の種類を切り替え (すべて完全無料・APIキー不要)"
            >
              <Layers className="w-3.5 h-3.5 text-sky-500" />
              <span>{activeTileConfig.shortLabel}</span>
              <ChevronDown className="w-3 h-3 text-faint" />
            </button>

            {showTileSelector && (
              <div className="absolute top-full left-0 mt-1.5 w-64 bg-surface border border-line rounded-xl shadow-2xl p-1.5 z-50 text-xs space-y-1">
                <div className="px-2 py-1 text-[10px] text-faint font-medium border-b border-line flex items-center justify-between">
                  <span>地図スタイル (キー不要・無料)</span>
                  <span className="text-accent">No Key Needed</span>
                </div>
                {TILE_STYLES.map((style) => {
                  const isCurrent = style.id === currentTileStyle;
                  return (
                    <button
                      key={style.id}
                      type="button"
                      onClick={() => {
                        setCurrentTileStyle(style.id);
                        setShowTileSelector(false);
                      }}
                      className={`w-full text-left px-2.5 py-2 rounded-lg transition-colors flex items-start justify-between gap-2 ${
                        isCurrent
                          ? 'bg-accent-soft text-accent font-semibold'
                          : 'text-ink-soft hover:bg-surface-2 hover:text-ink'
                      }`}
                    >
                      <div>
                        <div className="flex items-center gap-1.5 text-xs">
                          {style.id === 'osm' && <Globe className="w-3 h-3 text-sky-500" />}
                          {style.id.startsWith('gsi') && (
                            <MapIcon className="w-3 h-3 text-emerald-600" />
                          )}
                          {style.id === 'osm_dark' && (
                            <Moon className="w-3 h-3 text-purple-500" />
                          )}
                          <span>{style.label}</span>
                        </div>
                        <p className="text-[10px] text-faint mt-0.5 font-normal leading-tight">
                          {style.description}
                        </p>
                      </div>
                      {isCurrent && (
                        <Check className="w-4 h-4 text-accent shrink-0 mt-0.5" />
                      )}
                    </button>
                  );
                })}
              </div>
            )}
        </div>
      </div>

      {/* Grade Legend in Bottom Left */}
      <div className="absolute bottom-4 left-3 z-10 pointer-events-auto bg-white/95 backdrop-blur-md border border-line rounded-xl p-2.5 shadow-xl text-xs">
        <div className="text-[11px] font-bold text-ink-soft mb-1.5 flex items-center justify-between gap-2">
          <span>きれい度ランク判定</span>
          <span className="text-[10px] text-faint font-normal">基準</span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-1.5">
          <div className="flex items-center gap-1.5">
            <span className="w-4 h-4 rounded-full bg-emerald-500 text-white font-bold text-[10px] flex items-center justify-center shadow-xs">
              S
            </span>
            <span className="text-ink-soft text-[11px]">極上 (4.6+)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-4 h-4 rounded-full bg-sky-500 text-white font-bold text-[10px] flex items-center justify-center shadow-xs">
              A
            </span>
            <span className="text-ink-soft text-[11px]">清潔 (4.0+)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-4 h-4 rounded-full bg-amber-500 text-white font-bold text-[10px] flex items-center justify-center shadow-xs">
              B
            </span>
            <span className="text-ink-soft text-[11px]">普通 (3.0+)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-4 h-4 rounded-full bg-orange-500 text-white font-bold text-[10px] flex items-center justify-center shadow-xs">
              C
            </span>
            <span className="text-ink-soft text-[11px]">要注意 (2.0+)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-4 h-4 rounded-full bg-rose-500 text-white font-bold text-[10px] flex items-center justify-center shadow-xs">
              D
            </span>
            <span className="text-ink-soft text-[11px]">緊急用 (&lt;2.0)</span>
          </div>
        </div>
      </div>
    </div>
  );
};
