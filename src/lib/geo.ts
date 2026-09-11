/**
 * 地理座標（緯度・経度）に関する計算ユーティリティ
 */

/**
 * 2地点間の直線距離をメートル単位で計算（Haversine Formula）
 */
export function calculateDistanceMeters(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const R = 6371000; // 地球の平均半径 (m)
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c);
}

/**
 * 距離を見やすい文字列（m / km）にフォーマット
 */
export function formatDistance(meters: number): string {
  if (meters < 1000) {
    return `${meters}m`;
  }
  const km = meters / 1000;
  return `${km.toFixed(1)}km`;
}

/**
 * 徒歩所要時間の目安（分速80mとして計算）
 */
export function formatWalkingTime(meters: number): string {
  const minutes = Math.max(1, Math.round(meters / 80));
  if (minutes < 60) {
    return `徒歩${minutes}分`;
  }
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return `徒歩${hours}時間${remainingMinutes > 0 ? `${remainingMinutes}分` : ''}`;
}
