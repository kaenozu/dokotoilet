import React, { useState } from "react";
import { Download, Share, X, Smartphone } from "lucide-react";
import { usePWAInstall } from "../hooks/usePWAInstall";

export const PWAInstallButton: React.FC = () => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  // If already running as an installed PWA, hide the button
  if (isInstalled) {
    return null;
  }

  // Chromium / Android / Desktop flow
  if (isInstallable) {
    return (
      <button
        id="btn-pwa-install"
        type="button"
        onClick={install}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm transition-all active:scale-95"
        title="アプリを端末にインストール"
      >
        <Download className="w-3.5 h-3.5" />
        <span>アプリ追加</span>
      </button>
    );
  }

  // iOS Safari flow (beforeinstallprompt is not supported by WebKit)
  if (isIOS) {
    return (
      <>
        <button
          id="btn-pwa-install-ios"
          type="button"
          onClick={() => setShowIOSGuide(true)}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200 transition-all"
          title="iPhone/iPadのホーム画面に追加"
        >
          <Smartphone className="w-3.5 h-3.5" />
          <span>ホームに追加</span>
        </button>

        {showIOSGuide && (
          <div
            id="modal-ios-install"
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs"
            onClick={() => setShowIOSGuide(false)}
          >
            <div
              className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl space-y-4"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between pb-2 border-b border-gray-100">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-xl bg-emerald-500 flex items-center justify-center text-white font-bold text-sm">
                    潔
                  </div>
                  <h3 className="text-base font-bold text-gray-900">ホーム画面に追加</h3>
                </div>
                <button
                  type="button"
                  onClick={() => setShowIOSGuide(false)}
                  className="p-1.5 text-gray-400 hover:text-gray-600 rounded-full hover:bg-gray-100"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="space-y-3 text-sm text-gray-600">
                <p className="flex items-start gap-2.5">
                  <span className="flex-shrink-0 w-6 h-6 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold text-xs">
                    1
                  </span>
                  <span>
                    Safari 画面下の <Share className="w-4 h-4 inline-block text-blue-500 mx-0.5" /> <strong>共有</strong> ボタンをタップします。
                  </span>
                </p>
                <p className="flex items-start gap-2.5">
                  <span className="flex-shrink-0 w-6 h-6 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold text-xs">
                    2
                  </span>
                  <span>
                    メニューをスクロールし、<strong>「ホーム画面に追加」</strong> を選択します。
                  </span>
                </p>
                <p className="text-xs text-gray-500 bg-gray-50 p-2.5 rounded-lg">
                  💡 アプリとして全画面で素早く起動でき、オフライン時も保存データが閲覧可能になります。
                </p>
              </div>

              <button
                type="button"
                onClick={() => setShowIOSGuide(false)}
                className="w-full rounded-xl bg-emerald-600 py-2.5 text-sm font-bold text-white hover:bg-emerald-700 shadow-sm"
              >
                とじる
              </button>
            </div>
          </div>
        )}
      </>
    );
  }

  return null;
};
