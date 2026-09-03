import React, { useState } from 'react';
import {
  Key,
  ExternalLink,
  ShieldCheck,
  CheckCircle2,
  Sparkles,
  Layers,
} from 'lucide-react';

interface ApiKeyModalProps {
  isOpen: boolean;
  onClose: () => void;
  apiKey: string;
  onSaveKey: (key: string) => void;
  onSwitchToLeaflet: () => void;
}

export const ApiKeyModal: React.FC<ApiKeyModalProps> = ({
  isOpen,
  onClose,
  apiKey,
  onSaveKey,
  onSwitchToLeaflet,
}) => {
  const [inputKey, setInputKey] = useState(apiKey);
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    onSaveKey(inputKey.trim());
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md">
      <div className="bg-[#111111] border border-[#262626] rounded-2xl shadow-2xl w-full max-w-xl max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-[#222222] flex items-center justify-between bg-[#141414]">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-[#2563eb]/20 text-[#60a5fa] border border-[#3b82f6]/30 flex items-center justify-center shadow-xs">
              <Key className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base font-bold text-[#f5f5f5]">
                Google Maps Platform API設定
              </h2>
              <p className="text-xs text-[#888888]">
                公式Maps JavaScript APIおよびPlaces APIの接続設定
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

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4 text-xs text-[#e0e0e0]">
          {/* Keyless reassurance notice */}
          <div className="bg-[#102419] border border-[#1b432a] rounded-xl p-3 text-[11px] text-[#a7f3d0] leading-relaxed flex items-start gap-2">
            <CheckCircle2 className="w-4 h-4 text-[#34d399] shrink-0 mt-0.5" />
            <div>
              <strong className="text-white">OpenStreetMap・国土地理院はAPIキー不要：</strong><br />
              通常モード（OpenStreetMapや国土地理院地図）をご利用の場合は、<strong>APIキーの設定は一切不要</strong>で、実在公衆トイレの検索や詳細表示、AIきれい度診断を含めすべての機能を完全無料でご利用いただけます。
            </div>
          </div>

          {/* Zero-Cost Demo Key Quickstart Info */}
          <div className="bg-[#132038] border border-[#1d3d6e] rounded-xl p-3.5">
            <div className="flex items-center gap-2 mb-1.5 font-bold text-[#60a5fa]">
              <Sparkles className="w-4 h-4 text-[#60a5fa]" />
              <span>無料でお試し！Maps Demo Key（請求設定不要）</span>
            </div>
            <p className="text-[#bfdbfe] leading-relaxed">
              Google Cloudの請求設定を行わずに今すぐGoogle Mapsを動かしたい場合、公式の<strong className="text-white">「Maps Demo Key」</strong>が利用可能です。
            </p>
            <ol className="list-decimal list-inside mt-2 space-y-1 text-[#93c5fd]">
              <li>
                <a
                  href="https://mapsplatform.google.com/maps-demo-key?utm_campaign=gmp_mcp_codeassist_v1_aistudio"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline font-semibold hover:text-white inline-flex items-center gap-1"
                >
                  Maps Demo Key 取得ページを開く <ExternalLink className="w-3 h-3" />
                </a>
              </li>
              <li>Googleアカウントでログイン（クレジットカード不要）</li>
              <li>「規約に同意」してデモキーを生成</li>
              <li>生成されたキーを下の入力欄に入力</li>
            </ol>
          </div>

          {/* Form to enter key */}
          <form onSubmit={handleSave} className="space-y-3">
            <div>
              <label className="block text-[#cccccc] font-semibold mb-1">
                Google Maps API Key
              </label>
              <input
                type="text"
                value={inputKey}
                onChange={(e) => setInputKey(e.target.value)}
                placeholder="AIzaSy..."
                className="w-full px-3 py-2 bg-[#181818] border border-[#2e2e2e] rounded-lg text-[#f5f5f5] placeholder-[#666666] font-mono text-xs focus:bg-[#1f1f1f] focus:outline-none focus:ring-1 focus:ring-[#00d1b2] focus:border-[#00d1b2] transition-colors"
              />
              <p className="text-[11px] text-[#888888] mt-1">
                環境変数 <code className="text-[#00d1b2]">VITE_GOOGLE_MAPS_API_KEY</code> に設定するか、ブラウザに直接保存できます。
              </p>
            </div>

            <div className="flex gap-2 pt-1">
              <button
                type="submit"
                className="flex-1 py-2 px-3 bg-[#00d1b2] hover:bg-[#00bfa5] text-[#0a0a0a] font-bold rounded-lg shadow-[0_0_12px_rgba(0,209,178,0.25)] transition-all flex items-center justify-center gap-1.5"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>Google Mapsモードを適用</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  onSwitchToLeaflet();
                  onClose();
                }}
                className="py-2 px-3 bg-[#1f1f1f] hover:bg-[#282828] text-[#cccccc] hover:text-[#ffffff] border border-[#333333] font-medium rounded-lg transition-colors"
              >
                OpenStreetMapのまま使う
              </button>
            </div>
          </form>

          {/* Production Key Guidelines */}
          <div className="border border-[#262626] rounded-xl p-3 bg-[#161616] text-[11px]">
            <h4 className="font-bold text-[#f5f5f5] mb-1 flex items-center gap-1">
              <ShieldCheck className="w-3.5 h-3.5 text-[#00d1b2]" />
              本番用APIキーの制限設定について
            </h4>
            <p className="text-[#a0a0a0] leading-relaxed mb-1.5">
              本番環境でGoogle Cloud Consoleからキーを発行する場合、不正利用を防ぐために
              <strong className="text-[#e0e0e0]">HTTPリファラー制限</strong>および<strong className="text-[#e0e0e0]">有効APIの制限（Maps JavaScript API, Places API (New)）</strong>
              を設定してください。
            </p>
            <a
              href="https://docs.cloud.google.com/api-keys/docs/add-restrictions-api-keys"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[#00d1b2] hover:underline inline-flex items-center gap-1 font-medium"
            >
              APIキーの制限設定ドキュメント <ExternalLink className="w-3 h-3" />
            </a>
          </div>
        </div>
      </div>
    </div>
  );
};
