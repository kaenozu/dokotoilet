import path from 'path';
import {defineConfig} from 'vitest/config';

// テストインフラの集中設定。
//
// - testTimeout: fs ロック・動的 import・spawn を含むテスト（community-ops、
//   routerFuzz の実HTTP、persistence 系）は並列ワーカー下で 5s 既定を超えることが
//   ある（Windows の fs 非同期 + withFileLock のポーリング）。デフォルトを 15s に
//   引き上げ、個別テストは必要に応じて上書きする。
// - pool: 'forks': withFileLock はクロスプロセスのファイルロックを前提とする。
//   スレッドプールだとワーカー内の fs タイマーが相互に干渉し、ロック待ちが
//   タイムアウトしやすいため、プロセス分離で安定させる。
// - fileParallelism: 40+ ファイル規模では並列のままで十分（forks は各ファイルを
//   独立プロセスで実行するため、fs-heavy なファイル同士の干渉もプロセス境界で吸収）。
// - sequence.concurrent は使わない（ファイル内は直列のまま。ロック取得順の
//   再現性を保つため）。
export default defineConfig(() => {
  return {
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    test: {
      testTimeout: 15_000,
      hookTimeout: 15_000,
      pool: 'forks',
    },
  };
});
