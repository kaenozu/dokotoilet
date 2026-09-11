// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import type { ReactElement } from "react";
import { createRoot } from "react-dom/client";
import { ErrorBoundary } from "./ErrorBoundary";

/**
 * ErrorBoundary はクライアント専用ライフサイクル（getDerivedStateFromError /
 * componentDidCatch）に依存するため、SSR の renderToStaticMarkup では
 * 検証できない（SSR は境界を発火させず例外がそのまま伝播する）。
 * そこでこのファイルだけ happy-dom 環境で実DOMをマウントして検証する。
 * React 19 の createRoot は並行レンダリングのため、render は act() で
 * フラッシュする。
 */

// react の act() をテスト環境で有効化（未設定だと console.error が出る）
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

function Bomb(): never {
  throw new Error("boom");
}

function ThrowNonError(): never {
  // React は Error 以外も投げ得る（文字列・オブジェクト等）
  throw "not-an-error-object";
}

async function mount(ui: ReactElement): Promise<{
  container: HTMLDivElement;
  unmount: () => void;
}> {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(ui);
  });
  return { container, unmount: () => root.unmount() };
}

beforeEach(() => {
  // componentDidCatch の運用ログ（意図的な console.error）をテスト出力から消しつつ、
  // 発火したこと自体は individual テストで検証する
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  document.body.textContent = "";
});

describe("ErrorBoundary", () => {
  it("renders children when nothing throws", async () => {
    const { container, unmount } = await mount(
      <ErrorBoundary region="テスト">
        <div>ok</div>
      </ErrorBoundary>
    );
    expect(container.textContent).toContain("ok");
    expect(console.error).not.toHaveBeenCalled();
    unmount();
  });

  it("renders the regional fallback instead of crashing (no blank page)", async () => {
    const { container, unmount } = await mount(
      <ErrorBoundary region="一覧パネル">
        <Bomb />
      </ErrorBoundary>
    );
    expect(container.textContent).toContain("一覧パネルの表示中に問題が発生しました");
    expect(container.textContent).toContain("再表示を試す");
    expect(container.textContent).toContain("端末データを初期化して再読み込み");
    // 例外メッセージ（末端の施設データ由来の文字列）が画面へ漏れない
    expect(container.textContent).not.toContain("boom");
    // 運用ログには領域名が付く（componentDidCatch の副作用）
    expect(vi.mocked(console.error).mock.calls.some((args) => String(args[0]).includes("[ErrorBoundary] region=一覧パネル"))).toBe(true);
    unmount();
  });

  it("normalizes non-Error throwables into the fallback", async () => {
    const { container, unmount } = await mount(
      <ErrorBoundary region="地図">
        <ThrowNonError />
      </ErrorBoundary>
    );
    expect(container.textContent).toContain("地図の表示中に問題が発生しました");
    unmount();
  });

  it("recovers via 再表示を試す button (falls back again if child still throws)", async () => {
    const { container, unmount } = await mount(
      <ErrorBoundary region="詳細パネル">
        <Bomb />
      </ErrorBoundary>
    );
    expect(container.textContent).toContain("問題が発生しました");
    const retry = Array.from(container.querySelectorAll("button")).find((b) =>
      b.textContent?.includes("再表示を試す")
    );
    expect(retry).toBeDefined();
    await act(async () => {
      retry!.click();
    });
    // 子はまた投げるので fallback のまま。真っ白にもクラッシュループにもならない
    expect(container.textContent).toContain("問題が発生しました");
    unmount();
  });
});
