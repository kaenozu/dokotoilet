import React from 'react';
import {
  ToiletFacility,
  CleanlinessGrade,
  DataSourceType,
} from '../types';
import { getGradeColor } from './ToiletMap';
import {
  Sparkles,
  MapPin,
  Clock,
  Navigation,
  ThumbsUp,
  AlertTriangle,
  Lightbulb,
  CheckCircle2,
  XCircle,
  MessageSquare,
  Baby,
  Accessibility,
  HeartHandshake,
  Star,
  ExternalLink,
  ShieldCheck,
  Building2,
  Store,
  Trees,
  Train,
} from 'lucide-react';

interface ToiletDetailsProps {
  toilet: ToiletFacility;
  onClose: () => void;
  onOpenReviewModal: () => void;
}

export const ToiletDetails: React.FC<ToiletDetailsProps> = ({
  toilet,
  onClose,
  onOpenReviewModal,
}) => {
  const gradeColor = getGradeColor(toilet.cleanlinessGrade);

  const getSourceBadge = (source: DataSourceType) => {
    switch (source) {
      case 'google':
        return { label: 'Google Maps & 口コミ', bg: 'bg-[#1e3a8a]/30 text-[#60a5fa] border-[#1d4ed8]/30' };
      case 'osm':
        return { label: 'OpenStreetMap (OSM)', bg: 'bg-[#064e3b]/30 text-[#34d399] border-[#059669]/30' };
      case 'opendata':
        return { label: '自治体オープンデータ', bg: 'bg-[#312e81]/30 text-[#818cf8] border-[#4338ca]/30' };
      case 'community':
        return { label: 'コミュニティ・ユーザー投稿', bg: 'bg-[#78350f]/30 text-[#fbbf24] border-[#d97706]/30' };
    }
  };

  const sourceBadge = getSourceBadge(toilet.dataSource);

  const getCategoryIcon = (cat: string) => {
    switch (cat) {
      case 'department':
        return <Building2 className="w-4 h-4 text-[#c084fc]" />;
      case 'station':
        return <Train className="w-4 h-4 text-[#60a5fa]" />;
      case 'convenience':
        return <Store className="w-4 h-4 text-[#34d399]" />;
      case 'park':
        return <Trees className="w-4 h-4 text-[#4ade80]" />;
      default:
        return <Building2 className="w-4 h-4 text-[#a0a0a0]" />;
    }
  };

  return (
    <div className="flex flex-col h-full bg-[#121212] text-[#e0e0e0] overflow-y-auto">
      {/* Header Info */}
      <div className="p-4 sm:p-5 border-b border-[#222222]">
        <div className="flex items-start justify-between gap-3 mb-2">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium bg-[#222222] text-[#a0a0a0]">
              {getCategoryIcon(toilet.category)}
              {toilet.facilityType}
            </span>
            <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium border ${sourceBadge.bg}`}>
              {sourceBadge.label}
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-[#888888] hover:text-[#ffffff] p-1 rounded-md transition-colors"
            aria-label="閉じる"
          >
            ✕
          </button>
        </div>

        <h2 className="text-lg sm:text-xl font-bold text-[#f5f5f5] leading-snug">
          {toilet.name}
        </h2>
        {toilet.floorInfo && (
          <p className="text-xs font-medium text-[#00d1b2] mt-0.5">
            📍 {toilet.floorInfo}
          </p>
        )}
        <p className="text-xs text-[#888888] mt-1 flex items-center gap-1">
          <MapPin className="w-3.5 h-3.5 shrink-0 text-[#666666]" />
          <span>{toilet.address}</span>
        </p>
      </div>

      {/* Main Cleanliness Score Card */}
      <div className="p-4 sm:p-5 bg-gradient-to-b from-[#181818] to-[#121212] border-b border-[#222222]">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div
              className={`w-14 h-14 rounded-2xl ${gradeColor.bg} text-white flex flex-col items-center justify-center shadow-lg`}
            >
              <span className="text-2xl font-black leading-none">{toilet.cleanlinessGrade}</span>
              <span className="text-[10px] font-semibold tracking-tighter uppercase">GRADE</span>
            </div>
            <div>
              <div className="flex items-baseline gap-1.5">
                <span className="text-2xl font-bold text-[#f5f5f5]">
                  {toilet.cleanlinessScore.toFixed(1)}
                </span>
                <span className="text-xs text-[#666666]">/ 5.0</span>
                <div className="flex items-center text-amber-400 ml-1">
                  {[...Array(5)].map((_, i) => (
                    <Star
                      key={i}
                      className={`w-3.5 h-3.5 ${
                        i < Math.round(toilet.cleanlinessScore)
                          ? 'fill-amber-400 text-amber-400'
                          : 'text-[#333333]'
                      }`}
                    />
                  ))}
                </div>
              </div>
              <p className={`text-xs font-medium ${gradeColor.text}`}>
                {gradeColor.label}
              </p>
              <p className="text-[11px] text-[#888888] mt-0.5">
                口コミ・評価 {toilet.reviewCount}件
              </p>
            </div>
          </div>

          {toilet.lastCleaned && (
            <div className="text-right">
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium bg-[#00d1b2]/10 text-[#00d1b2] border border-[#00d1b2]/30">
                <ShieldCheck className="w-3 h-3" />
                清掃確認: {toilet.lastCleaned}
              </span>
            </div>
          )}
        </div>

        {/* Sub Scores Breakdown Progress Bars */}
        <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
          <div className="bg-[#181818] p-2.5 rounded-lg border border-[#262626]">
            <div className="flex justify-between text-[#a0a0a0] mb-1">
              <span>便器・床の清潔感</span>
              <span className="font-semibold text-[#f5f5f5]">{toilet.subScores.cleanliness.toFixed(1)}</span>
            </div>
            <div className="w-full bg-[#262626] rounded-full h-1.5 overflow-hidden">
              <div
                className="bg-[#00d1b2] h-1.5 rounded-full"
                style={{ width: `${(toilet.subScores.cleanliness / 5) * 100}%` }}
              />
            </div>
          </div>

          <div className="bg-[#181818] p-2.5 rounded-lg border border-[#262626]">
            <div className="flex justify-between text-[#a0a0a0] mb-1">
              <span>におい・換気状態</span>
              <span className="font-semibold text-[#f5f5f5]">{toilet.subScores.odor.toFixed(1)}</span>
            </div>
            <div className="w-full bg-[#262626] rounded-full h-1.5 overflow-hidden">
              <div
                className="bg-[#0284c7] h-1.5 rounded-full"
                style={{ width: `${(toilet.subScores.odor / 5) * 100}%` }}
              />
            </div>
          </div>

          <div className="bg-[#181818] p-2.5 rounded-lg border border-[#262626]">
            <div className="flex justify-between text-[#a0a0a0] mb-1">
              <span>石鹸・ペーパー・除菌</span>
              <span className="font-semibold text-[#f5f5f5]">{toilet.subScores.supplies.toFixed(1)}</span>
            </div>
            <div className="w-full bg-[#262626] rounded-full h-1.5 overflow-hidden">
              <div
                className="bg-[#6366f1] h-1.5 rounded-full"
                style={{ width: `${(toilet.subScores.supplies / 5) * 100}%` }}
              />
            </div>
          </div>

          <div className="bg-[#181818] p-2.5 rounded-lg border border-[#262626]">
            <div className="flex justify-between text-[#a0a0a0] mb-1">
              <span>広さ・快適性・明るさ</span>
              <span className="font-semibold text-[#f5f5f5]">{toilet.subScores.comfort.toFixed(1)}</span>
            </div>
            <div className="w-full bg-[#262626] rounded-full h-1.5 overflow-hidden">
              <div
                className="bg-[#f59e0b] h-1.5 rounded-full"
                style={{ width: `${(toilet.subScores.comfort / 5) * 100}%` }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Equipment & Amenities Matrix */}
      <div className="p-4 sm:p-5 border-b border-[#222222]">
        <h3 className="text-xs font-bold text-[#f5f5f5] uppercase tracking-wider mb-2.5">
          設備・アメニティチェック
        </h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
          <div
            className={`flex items-center gap-2 p-2 rounded-lg border ${
              toilet.attributes.hasWashlet
                ? 'bg-[#0369a1]/20 border-[#0284c7]/40 text-[#38bdf8] font-medium'
                : 'bg-[#181818] border-[#222222] text-[#666666]'
            }`}
          >
            {toilet.attributes.hasWashlet ? (
              <CheckCircle2 className="w-4 h-4 text-[#38bdf8] shrink-0" />
            ) : (
              <XCircle className="w-4 h-4 text-[#444444] shrink-0" />
            )}
            <span>温水洗浄便座</span>
          </div>

          <div
            className={`flex items-center gap-2 p-2 rounded-lg border ${
              toilet.attributes.hasMultipurpose
                ? 'bg-[#4338ca]/20 border-[#4f46e5]/40 text-[#818cf8] font-medium'
                : 'bg-[#181818] border-[#222222] text-[#666666]'
            }`}
          >
            {toilet.attributes.hasMultipurpose ? (
              <Accessibility className="w-4 h-4 text-[#818cf8] shrink-0" />
            ) : (
              <XCircle className="w-4 h-4 text-[#444444] shrink-0" />
            )}
            <span>多目的・車椅子</span>
          </div>

          <div
            className={`flex items-center gap-2 p-2 rounded-lg border ${
              toilet.attributes.hasBabyTable
                ? 'bg-[#831843]/20 border-[#db2777]/40 text-[#f472b6] font-medium'
                : 'bg-[#181818] border-[#222222] text-[#666666]'
            }`}
          >
            {toilet.attributes.hasBabyTable ? (
              <Baby className="w-4 h-4 text-[#f472b6] shrink-0" />
            ) : (
              <XCircle className="w-4 h-4 text-[#444444] shrink-0" />
            )}
            <span>おむつ替え台</span>
          </div>

          <div
            className={`flex items-center gap-2 p-2 rounded-lg border ${
              toilet.attributes.hasPowderRoom
                ? 'bg-[#581c87]/20 border-[#9333ea]/40 text-[#c084fc] font-medium'
                : 'bg-[#181818] border-[#222222] text-[#666666]'
            }`}
          >
            {toilet.attributes.hasPowderRoom ? (
              <Sparkles className="w-4 h-4 text-[#c084fc] shrink-0" />
            ) : (
              <XCircle className="w-4 h-4 text-[#444444] shrink-0" />
            )}
            <span>パウダールーム</span>
          </div>

          <div
            className={`flex items-center gap-2 p-2 rounded-lg border ${
              toilet.attributes.hasSoap
                ? 'bg-[#064e3b]/20 border-[#059669]/40 text-[#34d399] font-medium'
                : 'bg-[#181818] border-[#222222] text-[#666666]'
            }`}
          >
            {toilet.attributes.hasSoap ? (
              <CheckCircle2 className="w-4 h-4 text-[#34d399] shrink-0" />
            ) : (
              <XCircle className="w-4 h-4 text-[#444444] shrink-0" />
            )}
            <span>ハンドソープ完備</span>
          </div>

          <div
            className={`flex items-center gap-2 p-2 rounded-lg border ${
              toilet.attributes.hasAlcohol
                ? 'bg-[#064e3b]/20 border-[#059669]/40 text-[#34d399] font-medium'
                : 'bg-[#181818] border-[#222222] text-[#666666]'
            }`}
          >
            {toilet.attributes.hasAlcohol ? (
              <CheckCircle2 className="w-4 h-4 text-[#34d399] shrink-0" />
            ) : (
              <XCircle className="w-4 h-4 text-[#444444] shrink-0" />
            )}
            <span>除菌アルコール</span>
          </div>

          <div
            className={`flex items-center gap-2 p-2 rounded-lg border ${
              toilet.attributes.isOpen24h
                ? 'bg-[#78350f]/20 border-[#d97706]/40 text-[#fbbf24] font-medium'
                : 'bg-[#181818] border-[#222222] text-[#666666]'
            }`}
          >
            <Clock className="w-4 h-4 shrink-0 text-[#fbbf24]" />
            <span>{toilet.attributes.isOpen24h ? '24時間利用可' : toilet.openingHours}</span>
          </div>

          <div
            className={`flex items-center gap-2 p-2 rounded-lg border ${
              toilet.attributes.hasOstomate
                ? 'bg-[#1e3a8a]/20 border-[#2563eb]/40 text-[#60a5fa] font-medium'
                : 'bg-[#181818] border-[#222222] text-[#666666]'
            }`}
          >
            <HeartHandshake className="w-4 h-4 shrink-0 text-[#60a5fa]" />
            <span>オストメイト対応</span>
          </div>

          <div className="flex items-center gap-2 p-2 rounded-lg border bg-[#181818] border-[#222222] text-[#a0a0a0]">
            <span className="font-medium text-xs">便座様式:</span>
            <span className="text-[#e0e0e0]">{toilet.attributes.toiletStyle === 'western' ? '洋式メイン' : toilet.attributes.toiletStyle === 'both' ? '和洋両方' : '和式'}</span>
          </div>
        </div>
      </div>

      {/* Facility Summary Card */}
      {(toilet.facilitySummary || toilet.aiSummary) && (
        <div className="p-4 sm:p-5 border-b border-[#222222] bg-[#161616]">
          <div className="flex items-center gap-2 mb-2">
            <ShieldCheck className="w-4 h-4 text-[#00d1b2]" />
            <h3 className="text-xs font-bold text-[#f5f5f5]">
              施設・衛生管理ポイント
            </h3>
          </div>
          <p className="text-xs text-[#d0d0d0] leading-relaxed bg-[#1c1c1c] p-3 rounded-lg border border-[#2a2a2a]">
            {toilet.facilitySummary || toilet.aiSummary}
          </p>
        </div>
      )}

      {/* Highlights: Pros, Cons & Tips */}
      <div className="p-4 sm:p-5 border-b border-[#222222] space-y-3">
        {toilet.pros && toilet.pros.length > 0 && (
          <div>
            <h4 className="text-xs font-semibold text-[#34d399] flex items-center gap-1.5 mb-1.5">
              <ThumbsUp className="w-3.5 h-3.5 text-[#10b981]" />
              清潔・高評価ポイント
            </h4>
            <ul className="space-y-1">
              {toilet.pros.map((pro, i) => (
                <li key={i} className="text-xs text-[#e0e0e0] flex items-start gap-1.5">
                  <span className="text-[#00d1b2] font-bold">•</span>
                  <span>{pro}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {toilet.cons && toilet.cons.length > 0 && (
          <div>
            <h4 className="text-xs font-semibold text-[#fbbf24] flex items-center gap-1.5 mb-1.5">
              <AlertTriangle className="w-3.5 h-3.5 text-[#f59e0b]" />
              注意点・混雑など
            </h4>
            <ul className="space-y-1">
              {toilet.cons.map((con, i) => (
                <li key={i} className="text-xs text-[#e0e0e0] flex items-start gap-1.5">
                  <span className="text-[#f59e0b] font-bold">•</span>
                  <span>{con}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {toilet.tips && (
          <div className="bg-[#2a1d0f]/60 p-3 rounded-lg border border-[#d97706]/40 text-xs text-[#fbbf24] flex items-start gap-2">
            <Lightbulb className="w-4 h-4 text-[#fbbf24] shrink-0 mt-0.5" />
            <div>
              <span className="font-semibold text-white">利用のワンポイント: </span>
              {toilet.tips}
            </div>
          </div>
        )}
      </div>

      {/* Description */}
      <div className="p-4 sm:p-5 border-b border-[#222222]">
        <h3 className="text-xs font-bold text-[#f5f5f5] uppercase tracking-wider mb-1.5">
          施設概要・管理状況
        </h3>
        <p className="text-xs text-[#a0a0a0] leading-relaxed">
          {toilet.description}
        </p>
      </div>

      {/* Recent User Reviews */}
      <div className="p-4 sm:p-5 border-b border-[#222222]">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-xs font-bold text-[#f5f5f5] uppercase tracking-wider flex items-center gap-1.5">
            <MessageSquare className="w-3.5 h-3.5 text-[#888888]" />
            利用者のきれい度口コミ ({toilet.reviews?.length || 0})
          </h3>
          <button
            type="button"
            onClick={onOpenReviewModal}
            className="text-xs text-[#00d1b2] hover:text-[#00bfa5] font-semibold transition-colors"
          >
            ＋ 口コミを書く
          </button>
        </div>

        {toilet.reviews && toilet.reviews.length > 0 ? (
          <div className="space-y-3">
            {toilet.reviews.map((rev) => (
              <div
                key={rev.id}
                className="bg-[#181818] p-3 rounded-xl border border-[#262626] text-xs"
              >
                <div className="flex items-center justify-between gap-2 mb-1.5">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-[#f5f5f5]">{rev.userName}</span>
                    <div className="flex items-center text-amber-400">
                      {[...Array(5)].map((_, i) => (
                        <Star
                          key={i}
                          className={`w-3 h-3 ${
                            i < rev.rating ? 'fill-amber-400 text-amber-400' : 'text-[#333333]'
                          }`}
                        />
                      ))}
                    </div>
                  </div>
                  <span className="text-[11px] text-[#666666]">{rev.createdAt}</span>
                </div>
                <p className="text-[#d0d0d0] leading-relaxed">{rev.comment}</p>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-[#666666] italic py-2 text-center">
            まだ詳細な口コミはありません。最初の評価を投稿してみましょう！
          </p>
        )}
      </div>

      {/* Fixed Bottom Action Bar */}
      <div className="p-4 border-t border-[#222222] bg-[#111111] sticky bottom-0 z-10 flex gap-2">
        <a
          href={`https://www.google.com/maps/dir/?api=1&destination=${toilet.lat},${toilet.lng}`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-[#2563eb] hover:bg-[#1d4ed8] text-white font-medium text-xs shadow-xs transition-colors"
        >
          <Navigation className="w-4 h-4" />
          <span>ルート案内</span>
          <ExternalLink className="w-3 h-3 opacity-70" />
        </a>

        <button
          type="button"
          onClick={onOpenReviewModal}
          className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-[#00d1b2] hover:bg-[#00bfa5] text-[#0a0a0a] font-semibold text-xs shadow-[0_0_12px_rgba(0,209,178,0.25)] transition-all"
        >
          <Sparkles className="w-4 h-4" />
          <span>きれい度を投稿</span>
        </button>
      </div>
    </div>
  );
};
