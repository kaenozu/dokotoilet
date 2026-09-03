import React, { useState } from 'react';
import {
  ToiletFacility,
  FacilityCategory,
  CleanlinessGrade,
} from '../types';
import { PlusCircle, MapPin, Sparkles, Building2 } from 'lucide-react';

interface AddToiletModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAddToilet: (toilet: ToiletFacility) => void;
  defaultLocation: { lat: number; lng: number };
}

export const AddToiletModal: React.FC<AddToiletModalProps> = ({
  isOpen,
  onClose,
  onAddToilet,
  defaultLocation,
}) => {
  const [name, setName] = useState('');
  const [category, setCategory] = useState<FacilityCategory>('department');
  const [address, setAddress] = useState('');
  const [floorInfo, setFloorInfo] = useState('');
  const [cleanlinessScore, setCleanlinessScore] = useState(4.5);
  const [hasWashlet, setHasWashlet] = useState(true);
  const [hasMultipurpose, setHasMultipurpose] = useState(false);
  const [hasBabyTable, setHasBabyTable] = useState(false);
  const [hasPowderRoom, setHasPowderRoom] = useState(false);
  const [isOpen24h, setIsOpen24h] = useState(false);
  const [description, setDescription] = useState('');

  if (!isOpen) return null;

  const calculateGrade = (score: number): CleanlinessGrade => {
    if (score >= 4.6) return 'S';
    if (score >= 4.0) return 'A';
    if (score >= 3.0) return 'B';
    if (score >= 2.0) return 'C';
    return 'D';
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    const grade = calculateGrade(cleanlinessScore);

    const newFacility: ToiletFacility = {
      id: `toilet-user-${crypto.randomUUID()}`,
      name: name.trim(),
      facilityType:
        category === 'department'
          ? '商業施設・デパート'
          : category === 'station'
          ? '駅・交通施設'
          : category === 'convenience'
          ? 'コンビニ'
          : category === 'park'
          ? '公衆トイレ'
          : 'その他施設',
      category,
      dataSource: 'community',
      // 地図中心の正確な位置で登録する（ずらさない）
      lat: defaultLocation.lat,
      lng: defaultLocation.lng,
      address: address.trim() || '現在地周辺',
      floorInfo: floorInfo.trim() || undefined,
      cleanlinessGrade: grade,
      cleanlinessScore,
      subScores: {
        cleanliness: cleanlinessScore,
        odor: Math.min(5, cleanlinessScore + 0.1),
        supplies: cleanlinessScore,
        comfort: cleanlinessScore,
      },
      attributes: {
        hasWashlet,
        hasMultipurpose,
        hasBabyTable,
        hasNursingRoom: false,
        hasPowderRoom,
        hasOstomate: false,
        isFree: true,
        isOpen24h,
        hasSoap: true,
        hasAlcohol: true,
        hasPaperTowelOrDryer: true,
        toiletStyle: 'western',
      },
      openingHours: isOpen24h ? '24時間営業' : '施設営業時間に準ずる',
      description: description.trim() || 'ユーザーによって登録されたトイレ情報です。',
      reviewCount: 1,
      lastCleaned: '本日登録',
      reviews: [
        {
          id: `rev-init-${crypto.randomUUID()}`,
          userName: '情報登録者',
          rating: Math.round(cleanlinessScore),
          cleanlinessScore: Math.round(cleanlinessScore),
          odorScore: Math.round(cleanlinessScore),
          suppliesScore: Math.round(cleanlinessScore),
          comment: description.trim() || '新しくきれいなトイレとして登録されました。',
          createdAt: new Date().toISOString().split('T')[0],
          helpfulCount: 1,
        },
      ],
      aiSummary: 'ユーザー報告に基づく新規登録トイレ情報。',
    };

    onAddToilet(newFacility);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md">
      <div className="bg-[#111111] border border-[#262626] rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-[#222222] flex items-center justify-between bg-[#141414]">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-[#00d1b2] text-[#0a0a0a] flex items-center justify-center shadow-[0_0_10px_rgba(0,209,178,0.3)]">
              <PlusCircle className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm sm:text-base font-bold text-[#f5f5f5]">
                新しいトイレのきれい度を登録
              </h2>
              <p className="text-xs text-[#888888]">
                マップにまだない綺麗なトイレ・穴場スポットを追加
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-[#888888] hover:text-[#ffffff] p-1 rounded-md text-sm transition-colors"
          >
            ✕
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4 text-xs text-[#e0e0e0]">
          <div>
            <label className="block text-[#cccccc] font-semibold mb-1">
              施設名・場所名 <span className="text-[#ff4444]">*</span>
            </label>
            <input
              required
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="例: 新宿マルイ本館 4F レストルーム"
              className="w-full px-3 py-2 bg-[#181818] border border-[#2e2e2e] rounded-lg text-[#f5f5f5] placeholder-[#666666] focus:bg-[#1f1f1f] focus:outline-none focus:ring-1 focus:ring-[#00d1b2] focus:border-[#00d1b2] transition-colors"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[#cccccc] font-semibold mb-1">
                カテゴリ
              </label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as FacilityCategory)}
                className="w-full px-3 py-2 bg-[#181818] border border-[#2e2e2e] rounded-lg text-[#f5f5f5] focus:bg-[#1f1f1f] focus:outline-none focus:ring-1 focus:ring-[#00d1b2] focus:border-[#00d1b2] transition-colors"
              >
                <option value="department" className="bg-[#181818] text-[#f5f5f5]">百貨店・商業施設</option>
                <option value="station" className="bg-[#181818] text-[#f5f5f5]">駅・交通機関</option>
                <option value="convenience" className="bg-[#181818] text-[#f5f5f5]">コンビニ</option>
                <option value="park" className="bg-[#181818] text-[#f5f5f5]">公園・公衆トイレ</option>
                <option value="hotel" className="bg-[#181818] text-[#f5f5f5]">ホテル・オフィス</option>
              </select>
            </div>

            <div>
              <label className="block text-[#cccccc] font-semibold mb-1">
                フロア・階数 (任意)
              </label>
              <input
                type="text"
                value={floorInfo}
                onChange={(e) => setFloorInfo(e.target.value)}
                placeholder="例: 3F 南側奥"
                className="w-full px-3 py-2 bg-[#181818] border border-[#2e2e2e] rounded-lg text-[#f5f5f5] placeholder-[#666666] focus:bg-[#1f1f1f] focus:outline-none focus:ring-1 focus:ring-[#00d1b2] focus:border-[#00d1b2] transition-colors"
              />
            </div>
          </div>

          <div>
            <label className="block text-[#cccccc] font-semibold mb-1">
              住所・ランドマーク
            </label>
            <input
              type="text"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="例: 東京都新宿区新宿3-30-13"
              className="w-full px-3 py-2 bg-[#181818] border border-[#2e2e2e] rounded-lg text-[#f5f5f5] placeholder-[#666666] focus:bg-[#1f1f1f] focus:outline-none focus:ring-1 focus:ring-[#00d1b2] focus:border-[#00d1b2] transition-colors"
            />
          </div>

          {/* Cleanliness Score */}
          <div className="bg-[#161616] p-3 rounded-xl border border-[#262626]">
            <div className="flex justify-between items-center mb-1">
              <span className="font-semibold text-[#cccccc]">
                きれい度スコア: <strong className="text-[#00d1b2] text-sm">{cleanlinessScore}</strong>
              </span>
              <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-[#00d1b2]/20 text-[#00d1b2] border border-[#00d1b2]/40">
                Grade {calculateGrade(cleanlinessScore)}
              </span>
            </div>
            <input
              type="range"
              min="1"
              max="5"
              step="0.1"
              value={cleanlinessScore}
              onChange={(e) => setCleanlinessScore(parseFloat(e.target.value))}
              className="w-full accent-[#00d1b2] cursor-pointer"
            />
          </div>

          {/* Equipment Checkboxes */}
          <div>
            <label className="block text-[#cccccc] font-semibold mb-1.5">
              備え付け設備
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              <label className="flex items-center gap-1.5 p-2 bg-[#181818] border border-[#2a2a2a] rounded-lg cursor-pointer hover:bg-[#202020] transition-colors">
                <input
                  type="checkbox"
                  checked={hasWashlet}
                  onChange={(e) => setHasWashlet(e.target.checked)}
                  className="rounded accent-[#00d1b2]"
                />
                <span className="text-[#e0e0e0]">ウォシュレット</span>
              </label>

              <label className="flex items-center gap-1.5 p-2 bg-[#181818] border border-[#2a2a2a] rounded-lg cursor-pointer hover:bg-[#202020] transition-colors">
                <input
                  type="checkbox"
                  checked={hasMultipurpose}
                  onChange={(e) => setHasMultipurpose(e.target.checked)}
                  className="rounded accent-[#00d1b2]"
                />
                <span className="text-[#e0e0e0]">多目的・車椅子</span>
              </label>

              <label className="flex items-center gap-1.5 p-2 bg-[#181818] border border-[#2a2a2a] rounded-lg cursor-pointer hover:bg-[#202020] transition-colors">
                <input
                  type="checkbox"
                  checked={hasBabyTable}
                  onChange={(e) => setHasBabyTable(e.target.checked)}
                  className="rounded accent-[#00d1b2]"
                />
                <span className="text-[#e0e0e0]">おむつ替え台</span>
              </label>

              <label className="flex items-center gap-1.5 p-2 bg-[#181818] border border-[#2a2a2a] rounded-lg cursor-pointer hover:bg-[#202020] transition-colors">
                <input
                  type="checkbox"
                  checked={hasPowderRoom}
                  onChange={(e) => setHasPowderRoom(e.target.checked)}
                  className="rounded accent-[#00d1b2]"
                />
                <span className="text-[#e0e0e0]">パウダールーム</span>
              </label>

              <label className="flex items-center gap-1.5 p-2 bg-[#181818] border border-[#2a2a2a] rounded-lg cursor-pointer hover:bg-[#202020] transition-colors">
                <input
                  type="checkbox"
                  checked={isOpen24h}
                  onChange={(e) => setIsOpen24h(e.target.checked)}
                  className="rounded accent-[#00d1b2]"
                />
                <span className="text-[#e0e0e0]">24時間利用可</span>
              </label>
            </div>
          </div>

          <div>
            <label className="block text-[#cccccc] font-semibold mb-1">
              清潔感の特徴・メモ
            </label>
            <textarea
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="清掃頻度、におい、アメニティ、空いている時間帯など..."
              className="w-full px-3 py-2 bg-[#181818] border border-[#2e2e2e] rounded-lg text-[#f5f5f5] placeholder-[#666666] focus:bg-[#1f1f1f] focus:outline-none focus:ring-1 focus:ring-[#00d1b2] focus:border-[#00d1b2] transition-colors"
            />
          </div>

          <button
            type="submit"
            className="w-full py-2.5 px-4 bg-[#00d1b2] hover:bg-[#00bfa5] text-[#0a0a0a] font-bold rounded-lg shadow-[0_0_12px_rgba(0,209,178,0.25)] transition-all flex items-center justify-center gap-2"
          >
            <PlusCircle className="w-4 h-4" />
            <span>マップにトイレを追加登録</span>
          </button>
        </form>
      </div>
    </div>
  );
};
