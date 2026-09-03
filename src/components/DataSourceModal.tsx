import React from 'react';
import { DATA_SOURCES_INFO } from '../data/dataSourcesInfo';
import {
  Database,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  Sparkles,
  ShieldCheck,
  Zap,
  Globe2,
  Users,
  Building,
} from 'lucide-react';

interface DataSourceModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const DataSourceModal: React.FC<DataSourceModalProps> = ({
  isOpen,
  onClose,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md">
      <div className="bg-[#111111] border border-[#262626] rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="p-5 border-b border-[#222222] flex items-center justify-between bg-[#141414]">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-[#00d1b2] text-[#0a0a0a] flex items-center justify-center shadow-[0_0_12px_rgba(0,209,178,0.3)]">
              <Database className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-[#f5f5f5]">
                きれいトイレのデータ元 徹底比較ガイド
              </h2>
              <p className="text-xs text-[#888888]">
                各データソースの特徴・ライセンス・きれい度抽出手法（Google Mapsは有料のため不採用）
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-[#888888] hover:text-[#ffffff] p-1.5 rounded-lg text-sm transition-colors"
          >
            ✕
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-6 text-xs text-[#e0e0e0]">
          {/* Executive Summary Recommendation */}
          <div className="bg-[#00d1b2]/10 border border-[#00d1b2]/30 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-1.5 text-[#00d1b2] font-bold">
              <Sparkles className="w-4 h-4" />
              <span>おすすめのハイブリッド構築戦略</span>
            </div>
            <p className="text-[#c7f5ee] leading-relaxed">
              「きれい度」を正確に評価するマップを作る場合、単一のデータ元だけに頼るのではなく、
              <strong className="text-white">「OpenStreetMap（街頭・公園の無料オープンデータ）」＋「ユーザーのリアルタイム評価投稿（CGM）」</strong>
              を組み合わせる構成が最も費用対効果と鮮度が高くなります。本アプリではGoogle Maps（有料）を採用せず、この2層構造を標準実装しています。
            </p>
          </div>

          {/* Cards of Data Sources */}
          <div className="space-y-4">
            {DATA_SOURCES_INFO.map((source) => (
              <div
                key={source.id}
                className="border border-[#262626] rounded-xl p-4 bg-[#161616] hover:border-[#3a3a3a] transition-colors shadow-lg"
              >
                <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                  <div className="flex items-center gap-2">
                    <h3 className="font-bold text-sm text-[#f5f5f5]">
                      {source.name}
                    </h3>
                    <span className="px-2 py-0.5 rounded-full text-[11px] font-medium bg-[#1e1b4b] text-[#a5b4fc] border border-[#4338ca]/40">
                      {source.badge}
                    </span>
                  </div>
                  <span className="text-[11px] text-[#888888] font-mono">
                    きれい度データ親和性: <strong className="text-[#e0e0e0]">{source.cleanlinessDataLevel}</strong>
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px] mb-3 bg-[#1c1c1c] p-2.5 rounded-lg border border-[#2a2a2a]">
                  <div>
                    <span className="text-[#888888]">カバー範囲:</span>{' '}
                    <span className="font-medium text-[#f5f5f5]">{source.coverage}</span>
                  </div>
                  <div>
                    <span className="text-[#888888]">コスト / 利用条件:</span>{' '}
                    <span className="font-medium text-[#f5f5f5]">{source.cost}</span>
                  </div>
                  <div className="sm:col-span-2">
                    <span className="text-[#888888]">おすすめの役割:</span>{' '}
                    <span className="font-semibold text-[#00d1b2]">{source.recommendedRole}</span>
                  </div>
                </div>

                {/* Pros and Cons */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <h4 className="font-semibold text-[#34d399] flex items-center gap-1 mb-1">
                      <CheckCircle2 className="w-3.5 h-3.5 text-[#10b981]" />
                      メリット・強み
                    </h4>
                    <ul className="space-y-1 text-[#b8b8b8]">
                      {source.pros.map((p, i) => (
                        <li key={i} className="flex items-start gap-1">
                          <span className="text-[#00d1b2]">•</span>
                          <span>{p}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div>
                    <h4 className="font-semibold text-[#f87171] flex items-center gap-1 mb-1">
                      <AlertCircle className="w-3.5 h-3.5 text-[#ef4444]" />
                      注意点・制約
                    </h4>
                    <ul className="space-y-1 text-[#b8b8b8]">
                      {source.cons.map((c, i) => (
                        <li key={i} className="flex items-start gap-1">
                          <span className="text-[#f87171]">•</span>
                          <span>{c}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* How Cleanliness Evaluation Works */}
          <div className="border border-[#262626] rounded-xl p-4 bg-[#161616]">
            <h3 className="font-bold text-[#f5f5f5] mb-2 flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4 text-[#00d1b2]" />
              「トイレのきれい度」はどうやって判定・算出するか？
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-[11px]">
              <div className="bg-[#1c1c1c] p-3 rounded-lg border border-[#2a2a2a]">
                <h4 className="font-bold text-[#f5f5f5] mb-1">1. ユーザー口コミの集計</h4>
                <p className="text-[#a0a0a0] leading-relaxed">
                  アプリ内のきれい度評価投稿（清潔さ・におい・備品の3軸＋コメント）を集計し、1.0〜5.0点にスコア化。将来的にLLMによる自然言語解析の導入も検討中。
                </p>
              </div>

              <div className="bg-[#1c1c1c] p-3 rounded-lg border border-[#2a2a2a]">
                <h4 className="font-bold text-[#f5f5f5] mb-1">2. 施設カテゴリのベース配点</h4>
                <p className="text-[#a0a0a0] leading-relaxed">
                  百貨店上層階・高級複合施設は定期巡回清掃があるため初期評点高め（S/A）。古い公園公衆トイレは清掃頻度に応じた評点に設定。
                </p>
              </div>

              <div className="bg-[#1c1c1c] p-3 rounded-lg border border-[#2a2a2a]">
                <h4 className="font-bold text-[#f5f5f5] mb-1">3. ユーザー確認（CGM投票）</h4>
                <p className="text-[#a0a0a0] leading-relaxed">
                  「今使ったら綺麗だった」「石鹸があった」のリアルタイムチェックインを集計し、最新の清潔度を動的に更新。
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-[#222222] bg-[#141414] flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-[#1f1f1f] hover:bg-[#2a2a2a] text-[#f5f5f5] border border-[#333333] rounded-lg text-xs font-semibold transition-colors"
          >
            閉じる
          </button>
        </div>
      </div>
    </div>
  );
};
