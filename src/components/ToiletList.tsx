import React from 'react';
import { ToiletFacility } from '../types';
import { getGradeColor, isEvaluated } from './ToiletMap';
import {
  Sparkles,
  MapPin,
  Search,
  CheckCircle2,
  Building2,
  Store,
  Trees,
  Train,
  Clock,
  Star,
} from 'lucide-react';

interface ToiletListProps {
  toilets: ToiletFacility[];
  selectedToilet: ToiletFacility | null;
  onSelectToilet: (toilet: ToiletFacility) => void;
  searchQuery: string;
  setSearchQuery: (query: string) => void;
}

export const ToiletList: React.FC<ToiletListProps> = ({
  toilets,
  selectedToilet,
  onSelectToilet,
  searchQuery,
  setSearchQuery,
}) => {
  const getCategoryIcon = (cat: string) => {
    switch (cat) {
      case 'department':
        return <Building2 className="w-3.5 h-3.5 text-purple-500" />;
      case 'station':
        return <Train className="w-3.5 h-3.5 text-sky-500" />;
      case 'convenience':
        return <Store className="w-3.5 h-3.5 text-emerald-600" />;
      case 'park':
        return <Trees className="w-3.5 h-3.5 text-emerald-500" />;
      default:
        return <Building2 className="w-3.5 h-3.5 text-muted" />;
    }
  };

  return (
    <div className="flex flex-col h-full bg-canvas border-r border-line">
      {/* Search Header */}
      <div className="p-3 bg-surface border-b border-line">
        <div className="relative">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-faint" />
          <input
            type="text"
            placeholder="施設名・駅名・地名で検索..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 text-xs bg-surface-2 border border-line rounded-lg text-ink placeholder-faint focus:bg-white focus:outline-none focus:ring-1 focus:ring-accent focus:border-accent transition-colors"
          />
        </div>
        <div className="flex items-center justify-between text-[11px] text-faint mt-2 px-1">
          <span>該当件数: <strong className="text-ink font-semibold">{toilets.length}</strong> 件</span>
          <span className="text-accent font-medium">清潔度順にソート</span>
        </div>
      </div>

      {/* Toilet Card List */}
      <div className="flex-1 overflow-y-auto p-2 space-y-2">
        {toilets.length === 0 ? (
          <div className="text-center py-10 px-4 text-xs text-faint">
            <p className="font-semibold text-ink-soft">該当するトイレが見つかりません</p>
            <p className="mt-1 text-faint">検索条件を変更するか、マップの「この周辺の公衆トイレをOSM取得」をお試しください。</p>
          </div>
        ) : (
          toilets.map((toilet) => {
            const evaluated = isEvaluated(toilet);
            const gradeColor = getGradeColor(evaluated ? toilet.cleanlinessGrade : undefined);
            const isSelected = selectedToilet?.id === toilet.id;
            const attrs = toilet.attributes || ({} as any);

            return (
              <div
                key={toilet.id}
                onClick={() => onSelectToilet(toilet)}
                className={`p-3 rounded-xl border cursor-pointer transition-all duration-150 text-xs ${
                  isSelected
                    ? 'bg-surface border-accent shadow-[0_4px_14px_rgba(11,110,82,0.14)] ring-1 ring-accent'
                    : 'bg-surface border-line hover:border-line-strong hover:shadow-sm'
                }`}
              >
                <div className="flex items-start justify-between gap-2.5">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 mb-1">
                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-surface-2 text-muted">
                        {getCategoryIcon(toilet.category)}
                        {toilet.facilityType}
                      </span>
                      {attrs.isOpen24h && (
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-50 text-amber-700 border border-amber-200">
                          24h
                        </span>
                      )}
                    </div>
                    <h3 className="font-bold text-ink text-xs leading-snug line-clamp-1">
                      {toilet.name}
                    </h3>
                    <p className="text-[11px] text-faint line-clamp-1 mt-0.5">
                      {toilet.address}
                    </p>
                  </div>

                  {/* Cleanliness Grade Box（未評価は推定値を出さない） */}
                  <div
                    className={`stamp-plate w-9 h-9 ${gradeColor.bg} text-white shrink-0`}
                    title={evaluated ? gradeColor.label : '未評価（口コミ募集中）'}
                  >
                    <span className="text-base font-black leading-none">
                      {evaluated ? (toilet.cleanlinessGrade || '–') : '–'}
                    </span>
                  </div>
                </div>

                {/* Score & Attributes Chips */}
                <div className="flex items-center justify-between mt-2 pt-2 border-t border-line text-[11px]">
                  <div className="flex items-center gap-1 text-ink-soft">
                    <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
                    <span className="font-bold">
                      {evaluated
                        ? (toilet.cleanlinessScore != null ? Number(toilet.cleanlinessScore).toFixed(1) : '–')
                        : `推定 ${toilet.equipmentScore != null ? Number(toilet.equipmentScore).toFixed(1) : (toilet.cleanlinessScore != null ? Number(toilet.cleanlinessScore).toFixed(1) : '–')}`}
                    </span>
                    <span className="text-faint">({toilet.reviewCount ?? 0})</span>
                  </div>

                  <div className="flex items-center gap-1 text-[10px] text-faint">
                    {attrs.hasWashlet && (
                      <span className="px-1.5 py-0.5 rounded bg-sky-50 text-sky-700 font-medium border border-sky-200">
                        洗浄便座
                      </span>
                    )}
                    {attrs.hasMultipurpose && (
                      <span className="px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-700 font-medium border border-indigo-200">
                        多機能
                      </span>
                    )}
                    {attrs.hasPowderRoom && (
                      <span className="px-1.5 py-0.5 rounded bg-pink-50 text-pink-700 font-medium border border-pink-200">
                        パウダー
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
