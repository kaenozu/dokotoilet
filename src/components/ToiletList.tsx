import React from 'react';
import { ToiletFacility } from '../types';
import { getGradeColor } from './ToiletMap';
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
        return <Building2 className="w-3.5 h-3.5 text-[#c084fc]" />;
      case 'station':
        return <Train className="w-3.5 h-3.5 text-[#60a5fa]" />;
      case 'convenience':
        return <Store className="w-3.5 h-3.5 text-[#34d399]" />;
      case 'park':
        return <Trees className="w-3.5 h-3.5 text-[#4ade80]" />;
      default:
        return <Building2 className="w-3.5 h-3.5 text-[#a0a0a0]" />;
    }
  };

  return (
    <div className="flex flex-col h-full bg-[#0d0d0d] border-r border-[#222222]">
      {/* Search Header */}
      <div className="p-3 bg-[#111111] border-b border-[#222222]">
        <div className="relative">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[#666666]" />
          <input
            type="text"
            placeholder="施設名・駅名・地名で検索..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 text-xs bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg text-[#f5f5f5] placeholder-[#666666] focus:bg-[#202020] focus:outline-none focus:ring-1 focus:ring-[#00d1b2] focus:border-[#00d1b2] transition-colors"
          />
        </div>
        <div className="flex items-center justify-between text-[11px] text-[#888888] mt-2 px-1">
          <span>該当件数: <strong className="text-[#f5f5f5] font-semibold">{toilets.length}</strong> 件</span>
          <span className="text-[#00d1b2] font-medium">清潔度順にソート</span>
        </div>
      </div>

      {/* Toilet Card List */}
      <div className="flex-1 overflow-y-auto p-2 space-y-2">
        {toilets.length === 0 ? (
          <div className="text-center py-10 px-4 text-xs text-[#888888]">
            <p className="font-semibold text-[#e0e0e0]">該当するトイレが見つかりません</p>
            <p className="mt-1 text-[#666666]">検索条件を変更するか、マップの「この周辺の公衆トイレをOSM取得」をお試しください。</p>
          </div>
        ) : (
          toilets.map((toilet) => {
            const gradeColor = getGradeColor(toilet.cleanlinessGrade);
            const isSelected = selectedToilet?.id === toilet.id;

            return (
              <div
                key={toilet.id}
                onClick={() => onSelectToilet(toilet)}
                className={`p-3 rounded-xl border cursor-pointer transition-all duration-150 text-xs ${
                  isSelected
                    ? 'bg-[#181818] border-[#00d1b2] shadow-[0_0_15px_rgba(0,209,178,0.15)] ring-1 ring-[#00d1b2]'
                    : 'bg-[#141414] border-[#222222] hover:border-[#333333] hover:bg-[#181818]'
                }`}
              >
                <div className="flex items-start justify-between gap-2.5">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 mb-1">
                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-[#222222] text-[#a0a0a0]">
                        {getCategoryIcon(toilet.category)}
                        {toilet.facilityType}
                      </span>
                      {toilet.attributes.isOpen24h && (
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-[#78350f]/40 text-[#fbbf24] border border-[#d97706]/40">
                          24h
                        </span>
                      )}
                    </div>
                    <h3 className="font-bold text-[#f5f5f5] text-xs leading-snug line-clamp-1">
                      {toilet.name}
                    </h3>
                    <p className="text-[11px] text-[#888888] line-clamp-1 mt-0.5">
                      {toilet.address}
                    </p>
                  </div>

                  {/* Cleanliness Grade Box */}
                  <div
                    className={`w-9 h-9 rounded-xl ${gradeColor.bg} text-white flex flex-col items-center justify-center shrink-0 shadow-xs`}
                  >
                    <span className="text-base font-black leading-none">{toilet.cleanlinessGrade}</span>
                    <span className="text-[7px] font-bold">GRADE</span>
                  </div>
                </div>

                {/* Score & Attributes Chips */}
                <div className="flex items-center justify-between mt-2 pt-2 border-t border-[#222222] text-[11px]">
                  <div className="flex items-center gap-1 text-[#e0e0e0]">
                    <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
                    <span className="font-bold">{toilet.cleanlinessScore.toFixed(1)}</span>
                    <span className="text-[#666666]">({toilet.reviewCount})</span>
                  </div>

                  <div className="flex items-center gap-1 text-[10px] text-[#888888]">
                    {toilet.attributes.hasWashlet && (
                      <span className="px-1.5 py-0.5 rounded bg-[#0369a1]/30 text-[#38bdf8] font-medium border border-[#0284c7]/30">
                        洗浄便座
                      </span>
                    )}
                    {toilet.attributes.hasMultipurpose && (
                      <span className="px-1.5 py-0.5 rounded bg-[#4338ca]/30 text-[#818cf8] font-medium border border-[#4f46e5]/30">
                        多機能
                      </span>
                    )}
                    {toilet.attributes.hasPowderRoom && (
                      <span className="px-1.5 py-0.5 rounded bg-[#831843]/30 text-[#f472b6] font-medium border border-[#db2777]/30">
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
