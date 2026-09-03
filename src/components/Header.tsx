import React from 'react';
import {
  Sparkles,
  MapPin,
  PlusCircle,
  Database,
  Key,
  Navigation,
  Filter,
  CheckCircle2,
  ShieldCheck,
  Search,
} from 'lucide-react';
import { CleanlinessGrade, FilterState, CityPreset } from '../types';
import { CITY_PRESETS } from '../data/toilets';

interface HeaderProps {
  filter: FilterState;
  setFilter: React.Dispatch<React.SetStateAction<FilterState>>;
  mapMode: 'leaflet' | 'google';
  setMapMode: (mode: 'leaflet' | 'google') => void;
  hasGoogleKey: boolean;
  onOpenAddModal: () => void;
  onOpenDataSourcesModal: () => void;
  onOpenApiKeyModal: () => void;
  onCitySelect: (city: CityPreset) => void;
  onLocateUser: () => void;
  isLocating: boolean;
}

export const Header: React.FC<HeaderProps> = ({
  filter,
  setFilter,
  mapMode,
  setMapMode,
  hasGoogleKey,
  onOpenAddModal,
  onOpenDataSourcesModal,
  onOpenApiKeyModal,
  onCitySelect,
  onLocateUser,
  isLocating,
}) => {
  return (
    <header className="bg-[#111111] border-b border-[#222222] sticky top-0 z-30 shadow-xs">
      {/* Top Bar */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 flex flex-wrap items-center justify-between gap-3">
        {/* Logo & Title */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[#00d1b2] text-[#0a0a0a] flex items-center justify-center shadow-[0_0_15px_rgba(0,209,178,0.3)]">
            <Sparkles className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg sm:text-xl font-bold text-[#f5f5f5] tracking-tight">
                トイレきれい度マップ
              </h1>
              <span className="hidden sm:inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-[#059669]/20 text-[#34d399] border border-[#059669]/40">
                <CheckCircle2 className="w-3.5 h-3.5" /> 実在データ (OSM & 口コミ)
              </span>
            </div>
            <p className="text-xs text-[#888888] hidden md:block">
              実在する公衆便所オープンデータ（OpenStreetMap）と実際の利用者の清潔度評価
            </p>
          </div>
        </div>

        {/* Map Engine Selector & Quick Actions */}
        <div className="flex items-center flex-wrap gap-2">
          {/* Map Engine Toggle */}
          <div className="flex items-center bg-[#1a1a1a] p-1 rounded-lg border border-[#2a2a2a] text-xs">
            <button
              type="button"
              onClick={() => setMapMode('leaflet')}
              className={`px-2.5 py-1 rounded-md font-medium transition-all ${
                mapMode === 'leaflet'
                  ? 'bg-[#282828] text-[#f5f5f5] shadow-xs'
                  : 'text-[#888888] hover:text-[#e0e0e0]'
              }`}
            >
              OpenStreetMap
            </button>
            <button
              type="button"
              onClick={() => {
                if (!hasGoogleKey) {
                  onOpenApiKeyModal();
                } else {
                  setMapMode('google');
                }
              }}
              className={`px-2.5 py-1 rounded-md font-medium transition-all flex items-center gap-1 ${
                mapMode === 'google'
                  ? 'bg-[#00d1b2] text-[#0a0a0a] shadow-xs'
                  : 'text-[#888888] hover:text-[#e0e0e0]'
              }`}
            >
              Google Maps
              {!hasGoogleKey && (
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400" title="APIキー未設定" />
              )}
            </button>
          </div>

          {/* Action Buttons */}
          <button
            type="button"
            onClick={onOpenDataSourcesModal}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-[#e0e0e0] bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg hover:bg-[#242424] hover:border-[#383838] transition-colors"
          >
            <Database className="w-3.5 h-3.5 text-[#818cf8]" />
            <span className="hidden sm:inline">データ元比較</span>
          </button>

          <button
            type="button"
            onClick={onOpenAddModal}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-[#0a0a0a] bg-[#00d1b2] rounded-lg hover:bg-[#00bfa5] shadow-[0_0_12px_rgba(0,209,178,0.25)] transition-all"
          >
            <PlusCircle className="w-3.5 h-3.5" />
            <span>きれい度を投稿</span>
          </button>

          <button
            type="button"
            onClick={onOpenApiKeyModal}
            aria-label="Google Maps APIキー設定"
            className="p-1.5 text-[#888888] hover:text-[#e0e0e0] bg-[#1a1a1a] hover:bg-[#242424] border border-[#2a2a2a] rounded-lg transition-colors"
            title="Google Maps API設定 (※OSM利用時はキー不要)"
          >
            <Key className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Filter & City Bar */}
      <div className="bg-[#141414] border-t border-[#222222] px-4 sm:px-6 py-2.5">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-center justify-between gap-2.5">
          {/* City Presets & GPS Locate */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 md:pb-0 text-xs scrollbar-none">
            <button
              type="button"
              onClick={onLocateUser}
              disabled={isLocating}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-[#1a1a1a] border border-[#2a2a2a] text-[#e0e0e0] hover:bg-[#242424] hover:border-[#383838] font-medium whitespace-nowrap shrink-0 transition-colors"
            >
              <Navigation className={`w-3 h-3 text-[#38bdf8] ${isLocating ? 'animate-spin' : ''}`} />
              {isLocating ? '測位中...' : '現在地'}
            </button>
            <span className="text-[#333333] mx-0.5">|</span>
            {CITY_PRESETS.map((city) => (
              <button
                key={city.name}
                type="button"
                onClick={() => onCitySelect(city)}
                className="px-2.5 py-1 rounded-md bg-[#1a1a1a] border border-[#262626] text-[#a0a0a0] hover:border-[#3a3a3a] hover:text-[#ffffff] hover:bg-[#222222] whitespace-nowrap shrink-0 transition-colors"
              >
                {city.name.split(' ')[0]}
              </button>
            ))}
          </div>

          {/* Quick Filter Chips */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 md:pb-0 text-xs scrollbar-none">
            {/* High cleanliness chip */}
            <button
              type="button"
              onClick={() =>
                setFilter((prev) => ({
                  ...prev,
                  onlyHighCleanliness: !prev.onlyHighCleanliness,
                }))
              }
              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full font-medium whitespace-nowrap transition-colors ${
                filter.onlyHighCleanliness
                  ? 'bg-[#00d1b2] text-[#0a0a0a] font-semibold shadow-[0_0_10px_rgba(0,209,178,0.25)]'
                  : 'bg-[#1a1a1a] border border-[#262626] text-[#a0a0a0] hover:text-[#ffffff] hover:border-[#3a3a3a] hover:bg-[#222222]'
              }`}
            >
              <Sparkles className="w-3 h-3" />
              S・A級 (清潔重視)
            </button>

            {/* Washlet */}
            <button
              type="button"
              onClick={() =>
                setFilter((prev) => ({
                  ...prev,
                  onlyWashlet: !prev.onlyWashlet,
                }))
              }
              className={`px-2.5 py-1 rounded-full whitespace-nowrap transition-colors ${
                filter.onlyWashlet
                  ? 'bg-[#0284c7] text-white font-medium'
                  : 'bg-[#1a1a1a] border border-[#262626] text-[#a0a0a0] hover:text-[#ffffff] hover:border-[#3a3a3a] hover:bg-[#222222]'
              }`}
            >
              ウォシュレット
            </button>

            {/* Multipurpose */}
            <button
              type="button"
              onClick={() =>
                setFilter((prev) => ({
                  ...prev,
                  onlyMultipurpose: !prev.onlyMultipurpose,
                }))
              }
              className={`px-2.5 py-1 rounded-full whitespace-nowrap transition-colors ${
                filter.onlyMultipurpose
                  ? 'bg-[#6366f1] text-white font-medium'
                  : 'bg-[#1a1a1a] border border-[#262626] text-[#a0a0a0] hover:text-[#ffffff] hover:border-[#3a3a3a] hover:bg-[#222222]'
              }`}
            >
              多機能・だれでも
            </button>

            {/* Powder Room */}
            <button
              type="button"
              onClick={() =>
                setFilter((prev) => ({
                  ...prev,
                  onlyPowderRoom: !prev.onlyPowderRoom,
                }))
              }
              className={`px-2.5 py-1 rounded-full whitespace-nowrap transition-colors ${
                filter.onlyPowderRoom
                  ? 'bg-[#ec4899] text-white font-medium'
                  : 'bg-[#1a1a1a] border border-[#262626] text-[#a0a0a0] hover:text-[#ffffff] hover:border-[#3a3a3a] hover:bg-[#222222]'
              }`}
            >
              パウダールーム
            </button>

            {/* 24 Hours */}
            <button
              type="button"
              onClick={() =>
                setFilter((prev) => ({
                  ...prev,
                  only24h: !prev.only24h,
                }))
              }
              className={`px-2.5 py-1 rounded-full whitespace-nowrap transition-colors ${
                filter.only24h
                  ? 'bg-[#f59e0b] text-[#0a0a0a] font-semibold'
                  : 'bg-[#1a1a1a] border border-[#262626] text-[#a0a0a0] hover:text-[#ffffff] hover:border-[#3a3a3a] hover:bg-[#222222]'
              }`}
            >
              24時間
            </button>

            {/* Data Source Filter */}
            <select
              value={filter.dataSource}
              onChange={(e) =>
                setFilter((prev) => ({ ...prev, dataSource: e.target.value }))
              }
              className="bg-[#1a1a1a] border border-[#2a2a2a] text-[#e0e0e0] rounded-md px-2 py-1 text-xs focus:ring-1 focus:ring-[#00d1b2] focus:outline-none"
            >
              <option value="all">全データ元</option>
              <option value="google">Google Maps</option>
              <option value="osm">OpenStreetMap</option>
              <option value="opendata">自治体オープンデータ</option>
              <option value="community">ユーザー投稿</option>
            </select>
          </div>
        </div>
      </div>
    </header>
  );
};
