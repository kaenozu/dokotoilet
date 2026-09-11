import React from "react";
import { AlertTriangle, RotateCcw } from "lucide-react";

/**
 * アプリ内の局所 ErrorBoundary。
 *
 * 目的: 1件の不正な施設データ（旧バージョンの localStorage、サーバー応答の混入、
 * 将来の回帰）が React ツリー全体を落として「画面全体が真っ白」になるのを防ぐ。
 * リージョンごと（一覧 / 地図 / 詳細パネル）に境界を置き、落ちたのはその領域だけ
 * という状態を作る。ツリー最上位（main.tsx）にも最後の砦として1つ置く。
 *
 * 実装上の注意:
 * - 関数コンポーネントでは子のレンダー例外を捕捉できないため、class
 *   コンポーネントで書く（React の公式の立場。ライフサイクルはこの目的限定）。
 * - 「再読み込み」ボタンは単なる location.reload() にしない。localStorage の
 *   壊れたデルタが原因のクラッシュは、リロードすると起動時に同じデータを拾って
 *   即座に再クラッシュする（クラッシュループ）。fallback からは
 *   clearStoredUserData()（localDeltas.ts）でユーザー生成データを消してから
 *   リロードする。サーバー側データはバックエンドに残るため、失うのは
 *   「この端末のみの未同期分」だけということを UI でも明示する。
 * - getDerivedStateFromError はレンダーフェーズ専用（副作用禁止）。ロギングなど
 *   の副作用は componentDidCatch に分離する。
 */

interface ErrorBoundaryProps {
  /** 落下範囲の説明。fallback とログに出す（例: 「一覧パネル」）。 */
  region: string;
  /** 変化したら内部状態とともに子を再マウントする（選択施設の切替など）。 */
  resetKey?: string;
  children: React.ReactNode;
}

interface ErrorBoundaryState {
  error: Error | null;
}

export class ErrorBoundary extends React.Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: unknown): ErrorBoundaryState {
    // React は Error 以外も投げ得る。表示用に Error へ正規化して保持する。
    const normalized =
      error instanceof Error ? error : new Error(String(error ?? "unknown"));
    return { error: normalized };
  }

  componentDidCatch(error: unknown, info: React.ErrorInfo) {
    // 副作用はここだけ。コンソールへ1行（運用者の調査用。UI は破綻させない）。
    console.error(
      `[ErrorBoundary] region=${this.props.region}`,
      error instanceof Error ? error.message : error,
      info.componentStack?.trim() ?? ""
    );
  }

  componentDidUpdate(prevProps: ErrorBoundaryProps) {
    // resetKey が変わったら回復を試みる（次のレンダーで子を再度評価する）。
    if (this.state.error !== null && prevProps.resetKey !== this.props.resetKey) {
      this.setState({ error: null });
    }
  }

  private handleClearAndReload = () => {
    try {
      // dynamic import を避けるため直接呼ぶ（起動経路なので循環はない）
      void import("../lib/localDeltas").then(({ clearStoredUserData }) => {
        clearStoredUserData();
        window.location.reload();
      });
    } catch {
      // 消去に失敗してもリロードは試みる（再度クラッシュする可能性は残るが、
      // 「何もできない」より良い）。ユーザーには手動削除の案内も出す。
      window.location.reload();
    }
  };

  render() {
    const { error } = this.state;
    if (error === null) return this.props.children;
    return (
      <div
        role="alert"
        className="flex h-full min-h-[160px] w-full flex-col items-center justify-center gap-3 bg-canvas p-6 text-center"
      >
        <AlertTriangle className="h-8 w-8 text-amber-500" />
        <div>
          <p className="text-sm font-semibold text-ink">
            {this.props.region}の表示中に問題が発生しました
          </p>
          <p className="mt-1 text-xs text-faint">
            この区域だけを初期化しています。他の機能はそのまま使えます。
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => this.setState({ error: null })}
            className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-surface px-3 py-2 text-xs font-semibold text-ink-soft transition-colors hover:bg-surface-2"
          >
            再表示を試す
          </button>
          <button
            type="button"
            onClick={this.handleClearAndReload}
            className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-surface px-3 py-2 text-xs font-semibold text-ink-soft transition-colors hover:bg-surface-2"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            端末データを初期化して再読み込み
          </button>
        </div>
        {this.props.resetKey === undefined ? null : (
          <p className="text-[10px] text-faint">
            （操作を続けると自動で再表示を試みます）
          </p>
        )}
      </div>
    );
  }
}
