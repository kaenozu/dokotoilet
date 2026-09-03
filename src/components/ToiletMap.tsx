import React, { useEffect, useRef, useState } from 'react';
import { ToiletFacility, CleanlinessGrade } from '../types';
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
  isLoadingOsm: boolean;
}

// 実測レビューが1件でもあるか。無い場合は設備推定値しかないため「未評価」扱い
export const isEvaluated = (toilet: { reviewCount: number }) =>
  toilet.reviewCount > 0;

export const getGradeColor = (grade: CleanlinessGrade | null | undefined) => {
  switch (grade) {
    case 'S':
      return {
        bg: 'bg-emerald-500',
        text: 'text-emerald-700',
        badge: 'bg-emerald-50 text-emerald-700 border-emerald-300',
        hex: '#10B981',
        label: 'S級 (極上・超清潔)',
      };
    case 'A':
      return {
        bg: 'bg-sky-500',
        text: 'text-sky-700',
        badge: 'bg-sky-50 text-sky-700 border-sky-300',
        hex: '#0284C7',
        label: 'A級 (清潔・快適)',
      };
    case 'B':
      return {
        bg: 'bg-amber-500',
        text: 'text-amber-700',
        badge: 'bg-amber-50 text-amber-700 border-amber-300',
        hex: '#F59E0B',
        label: 'B級 (標準・利用可)',
      };
    case 'C':
      return {
        bg: 'bg-orange-500',
        text: 'text-orange-700',
        badge: 'bg-orange-50 text-orange-700 border-orange-300',
        hex: '#EA580C',
        label: 'C級 (やや難あり)',
      };
    case 'D':
      return {
        bg: 'bg-rose-500',
        text: 'text-rose-700',
        badge: 'bg-rose-50 text-rose-700 border-rose-300',
        hex: '#EF4444',
        label: 'D級 (緊急用)',
      };
    default:
      return {
        bg: 'bg-slate-500',
        text: 'text-slate-700',
        badge: 'bg-slate-50 text-slate-700 border-slate-300',
        hex: '#64748B',
        label: '未評価',
      };
  }
};

export const ToiletMap: React.FC<ToiletMapProps> = ({
  toilets,
  selectedToilet,
  onSelectToilet,
  center,
  zoom,
  onFetchOsmNearCenter,
  isLoadingOsm,
}) => {
  const leafletContainerRef = useRef<HTMLDivElement>(null);
  const leafletMapRef = useRef<L.Map | null>(null);
  const markersGroupRef = useRef<L.LayerGroup | null>(null);
  const currentTileLayerRef = useRef<L.TileLayer | null>(null);
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
        setCurrentMapCenter({ lat: c.lat, lng: c.lng });
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
      leafletMapRef.current.flyTo([center.lat, center.lng], zoom, {
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
      const evaluated = isEvaluated(toilet);
      const colorInfo = getGradeColor(evaluated ? toilet.cleanlinessGrade : undefined);
      const gradeLetter = evaluated ? toilet.cleanlinessGrade : '–';

      const customIcon = L.divIcon({
        className: 'custom-toilet-marker',
        html: `
          <div class="relative group cursor-pointer transition-transform duration-200 ${
            isSelected ? 'scale-125 z-50' : 'hover:scale-110 z-10'
          }">
            <div class="flex items-center justify-center w-8 h-8 rounded-full shadow-lg text-white font-bold text-xs ${
              colorInfo.bg
            } ring-2 ${
          isSelected
            ? 'ring-[#00d1b2] ring-offset-2 ring-offset-[#0a0a0a] shadow-[0_0_12px_rgba(0,209,178,0.4)]'
            : 'ring-[#1a1a1a]'
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

      const marker = L.marker([toilet.lat, toilet.lng], { icon: customIcon });
      marker.on('click', () => {
        onSelectToilet(toilet);
      });
      markersGroupRef.current?.addLayer(marker);
    });
  }, [toilets, selectedToilet, onSelectToilet]);

  const activeTileConfig =
    TILE_STYLES.find((s) => s.id === currentTileStyle) || TILE_STYLES[0];

  return (
    <div className="relative w-full h-full min-h-[420px] bg-[#0a0a0a] overflow-hidden">
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
          className="pointer-events-auto inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[#161616]/95 backdrop-blur-md text-[#f5f5f5] text-xs font-semibold shadow-xl border border-[#2e2e2e] hover:bg-[#222222] hover:border-[#3e3e3e] transition-all disabled:opacity-50"
        >
          <RefreshCw
            className={`w-3.5 h-3.5 text-[#00d1b2] ${
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
              className="inline-flex items-center gap-1.5 px-2.5 py-2 rounded-lg bg-[#161616]/95 backdrop-blur-md text-[#e0e0e0] text-xs font-medium shadow-xl border border-[#2e2e2e] hover:bg-[#222222] hover:border-[#3e3e3e] transition-all"
              title="地図の種類を切り替え (すべて完全無料・APIキー不要)"
            >
              <Layers className="w-3.5 h-3.5 text-[#38bdf8]" />
              <span>{activeTileConfig.shortLabel}</span>
              <ChevronDown className="w-3 h-3 text-[#888888]" />
            </button>

            {showTileSelector && (
              <div className="absolute top-full left-0 mt-1.5 w-64 bg-[#141414] border border-[#2e2e2e] rounded-xl shadow-2xl p-1.5 z-50 text-xs space-y-1">
                <div className="px-2 py-1 text-[10px] text-[#888888] font-medium border-b border-[#222222] flex items-center justify-between">
                  <span>地図スタイル (キー不要・無料)</span>
                  <span className="text-[#34d399]">No Key Needed</span>
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
                          ? 'bg-[#00d1b2]/15 text-[#00d1b2] font-semibold'
                          : 'text-[#d4d4d4] hover:bg-[#222222] hover:text-white'
                      }`}
                    >
                      <div>
                        <div className="flex items-center gap-1.5 text-xs">
                          {style.id === 'osm' && <Globe className="w-3 h-3 text-[#38bdf8]" />}
                          {style.id.startsWith('gsi') && (
                            <MapIcon className="w-3 h-3 text-[#34d399]" />
                          )}
                          {style.id === 'osm_dark' && (
                            <Moon className="w-3 h-3 text-[#c084fc]" />
                          )}
                          <span>{style.label}</span>
                        </div>
                        <p className="text-[10px] text-[#888888] mt-0.5 font-normal leading-tight">
                          {style.description}
                        </p>
                      </div>
                      {isCurrent && (
                        <Check className="w-4 h-4 text-[#00d1b2] shrink-0 mt-0.5" />
                      )}
                    </button>
                  );
                })}
              </div>
            )}
        </div>
      </div>

      {/* Grade Legend in Bottom Left */}
      <div className="absolute bottom-4 left-3 z-10 pointer-events-auto bg-[#141414]/95 backdrop-blur-md border border-[#262626] rounded-xl p-2.5 shadow-xl text-xs">
        <div className="text-[11px] font-bold text-[#e0e0e0] mb-1.5 flex items-center justify-between gap-2">
          <span>きれい度ランク判定</span>
          <span className="text-[10px] text-[#888888] font-normal">基準</span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-1.5">
          <div className="flex items-center gap-1.5">
            <span className="w-4 h-4 rounded-full bg-emerald-500 text-white font-bold text-[10px] flex items-center justify-center shadow-xs">
              S
            </span>
            <span className="text-[#cccccc] text-[11px]">極上 (4.6+)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-4 h-4 rounded-full bg-sky-500 text-white font-bold text-[10px] flex items-center justify-center shadow-xs">
              A
            </span>
            <span className="text-[#cccccc] text-[11px]">清潔 (4.0+)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-4 h-4 rounded-full bg-amber-500 text-white font-bold text-[10px] flex items-center justify-center shadow-xs">
              B
            </span>
            <span className="text-[#cccccc] text-[11px]">普通 (3.0+)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-4 h-4 rounded-full bg-orange-500 text-white font-bold text-[10px] flex items-center justify-center shadow-xs">
              C
            </span>
            <span className="text-[#cccccc] text-[11px]">要注意 (2.0+)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-4 h-4 rounded-full bg-rose-500 text-white font-bold text-[10px] flex items-center justify-center shadow-xs">
              D
            </span>
            <span className="text-[#cccccc] text-[11px]">緊急用 (&lt;2.0)</span>
          </div>
        </div>
      </div>
    </div>
  );
};
