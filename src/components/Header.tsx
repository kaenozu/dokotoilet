import React from 'react';
import {
  Sparkles,
  MapPin,
  PlusCircle,
  Database,
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
  onOpenAddModal: () => void;
  onOpenDataSourcesModal: () => void;
  onCitySelect: (city: CityPreset) => void;
  onLocateUser: () => void;
  isLocating: boolean;
}

export const Header: React.FC<HeaderProps> = ({
  filter,
  setFilter,
  onOpenAddModal,
  onOpenDataSourcesModal,
  onCitySelect,
  onLocateUser,
  isLocating,
}) => {
  return (
    <header className="bg-surface border-b border-line-strong sticky top-0 z-30 shadow-sm">
      {/* Top Bar */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 flex flex-wrap items-center justify-between gap-3">
        {/* Logo & Title */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-accent text-white flex items-center justify-center shadow-[0_3px_10px_rgba(11,110,82,0.28)] ring-1 ring-inset ring-white/50">
            <Sparkles className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg sm:text-xl font-bold text-ink tracking-tight font-display">
                きれいトイレ
              </h1>
              <span className="hidden sm:inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-accent-soft text-accent border border-accent/30">
                <CheckCircle2 className="w-3.5 h-3.5" /> 実在データ (OSM & 口コミ)
              </span>
            </div>
            <p className="text-xs text-faint hidden md:block">
              実在する公衆便所オープンデータ（OpenStreetMap）と実際の利用者の清潔度評価
            </p>
          </div>
        </div>

        {/* Quick Actions */}
        <div className="flex items-center flex-wrap gap-2">
          {/* Action Buttons */}
          <button
            type="button"
            onClick={onOpenDataSourcesModal}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-ink-soft bg-surface border border-line rounded-lg hover:bg-surface-2 hover:border-line-strong transition-colors"
          >
            <Database className="w-3.5 h-3.5 text-indigo-500" />
            <span className="hidden sm:inline">データ元比較</span>
          </button>

          <button
            type="button"
            onClick={onOpenAddModal}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-accent rounded-lg hover:bg-accent-strong shadow-[0_3px_10px_rgba(11,110,82,0.25)] transition-all"
          >
            <PlusCircle className="w-3.5 h-3.5" />
            <span>きれい度を投稿</span>
          </button>

        </div>
      </div>

      {/* Filter & City Bar */}
      <div className="bg-canvas border-t border-line px-4 sm:px-6 py-2.5">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-center justify-between gap-2.5">
          {/* City Presets & GPS Locate */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 md:pb-0 text-xs scrollbar-none">
            <button
              type="button"
              onClick={onLocateUser}
              disabled={isLocating}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-surface border border-line text-ink-soft hover:bg-surface-2 hover:border-line-strong font-medium whitespace-nowrap shrink-0 transition-colors"
            >
              <Navigation className={`w-3 h-3 text-sky-500 ${isLocating ? 'animate-spin' : ''}`} />
              {isLocating ? '測位中...' : '現在地'}
            </button>
            <span className="text-line-strong mx-0.5">|</span>
            {CITY_PRESETS.map((city) => (
              <button
                key={city.name}
                type="button"
                onClick={() => onCitySelect(city)}
                className="px-2.5 py-1 rounded-md bg-surface border border-line text-muted hover:border-line-strong hover:text-ink hover:bg-surface-2 whitespace-nowrap shrink-0 transition-colors"
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
                  ? 'bg-accent text-white font-semibold shadow-sm'
                  : 'bg-surface border border-line text-muted hover:text-ink hover:border-line-strong hover:bg-surface-2'
              }`}
            >
              <Sparkles className="w-3 h-3" />
              S・A級 (実測のみ)
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
                  : 'bg-surface border border-line text-muted hover:text-ink hover:border-line-strong hover:bg-surface-2'
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
                  : 'bg-surface border border-line text-muted hover:text-ink hover:border-line-strong hover:bg-surface-2'
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
                  : 'bg-surface border border-line text-muted hover:text-ink hover:border-line-strong hover:bg-surface-2'
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
                  ? 'bg-[#f59e0b] text-[#5b3a00] font-semibold'
                  : 'bg-surface border border-line text-muted hover:text-ink hover:border-line-strong hover:bg-surface-2'
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
              className="bg-surface border border-line text-ink-soft rounded-md px-2 py-1 text-xs focus:ring-1 focus:ring-accent focus:outline-none"
            >
              <option value="all">全データ元</option>
              <option value="osm">OpenStreetMap</option>
              <option value="google">Google（手動調査）</option>
              <option value="opendata">自治体オープンデータ</option>
              <option value="community">ユーザー投稿</option>
            </select>
          </div>
        </div>
      </div>
    </header>
  );
};
