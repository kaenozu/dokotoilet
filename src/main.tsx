import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import {ErrorBoundary} from './components/ErrorBoundary';
import './index.css';

// 最後の砦（アプリ全体の ErrorBoundary）。list/map/details の各リージョン境界で
// 捕まえられなかった例外だけがここへ到達するはず。この境界が発火したら
// ツリー全体が初期化されるため、コピーは「全体」向けの文言になる。
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary region="アプリ">
      <App />
    </ErrorBoundary>
  </StrictMode>,
);
