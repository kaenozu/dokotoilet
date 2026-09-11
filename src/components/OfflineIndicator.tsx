import React from "react";
import { WifiOff } from "lucide-react";
import { useOnlineStatus } from "../hooks/useOnlineStatus";

export const OfflineIndicator: React.FC = () => {
  const isOnline = useOnlineStatus();

  if (isOnline) return null;

  return (
    <div
      id="banner-offline"
      className="fixed bottom-20 left-4 z-40 flex items-center gap-2 rounded-xl bg-amber-600 px-3.5 py-2 text-xs font-medium text-white shadow-lg shadow-amber-900/20 animate-fade-in"
    >
      <WifiOff className="w-4 h-4 animate-pulse text-amber-200" />
      <span>オフラインモード中（保存済みのシードデータを表示しています）</span>
    </div>
  );
};
