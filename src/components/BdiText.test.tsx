// bdi ラッピング（read-path defense）のトリップワイヤテスト。
// react-dom/server の renderToStaticMarkup で SSR し、ユーザー提供テキストが
// <bdi>（bidi isolate）で包まれて出力されることを固定する。testing-library は
// 使わず react-dom のみで検証する（新規依存なし）。
//
// 防御の目的: RLO/LRI 等の双方向制御文字（textPolicy で入力側は除去するが、
// 旧データや将来の回帰に備えた二重防御）が周囲の UI レイアウトを反転させるのを防ぐ。
// 新しいレンダー箇所で BdiText を使い忘れたら、このテストの assert 包まれ確認が
// 失敗するのではなく「書き足す」運用。最低限、既知の全箇所が bdi であることを固定。
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { BdiText } from './BdiText';
import { ToiletDetails } from './ToiletDetails';
import type { ToiletFacility } from '../types';

describe('BdiText', () => {
  it('wraps text in <bdi> (bidi isolate)', () => {
    const html = renderToStaticMarkup(<BdiText text="トイレ" />);
    expect(html).toBe('<bdi>トイレ</bdi>');
  });

  it('keeps the bidi control characters inside the isolate', () => {
    // RLO を含むテキストでも <bdi> の内側に留まる（外へ影響しない）
    const html = renderToStaticMarkup(<BdiText text={'abc\u202Edef'} />);
    expect(html).toBe('<bdi>abc\u202Edef</bdi>');
    expect(html.startsWith('<bdi>')).toBe(true);
    expect(html.endsWith('</bdi>')).toBe(true);
  });
});

const fixtureToilet: ToiletFacility = {
  id: 'toilet-user-bdi',
  name: 'テストトイレ',
  facilityType: '公衆トイレ',
  category: 'park',
  dataSource: 'community',
  lat: 35,
  lng: 139,
  address: '現在地周辺',
  cleanlinessGrade: 'A',
  cleanlinessScore: 4,
  equipmentGrade: 'A',
  equipmentScore: 4,
  subScores: { cleanliness: 4, odor: 4, supplies: 4, comfort: 4 },
  attributes: {
    hasWashlet: null,
    hasMultipurpose: null,
    hasBabyTable: null,
    hasNursingRoom: null,
    hasPowderRoom: null,
    hasOstomate: null,
    isFree: null,
    isOpen24h: false,
    hasSoap: null,
    hasAlcohol: null,
    hasPaperTowelOrDryer: null,
    toiletStyle: null,
  },
  openingHours: '施設営業時間に準ずる',
  description: 'ユーザーによって登録されたトイレ情報です。',
  reviewCount: 1,
  reviews: [
    {
      id: 'rev-1',
      userName: 'たろう\u202E',
      rating: 5,
      overallScore: 5,
      comment: 'きれいでした\u202E',
      createdAt: '2026-09-07',
      helpfulCount: 0,
    },
  ],
} as unknown as ToiletFacility;

describe('ToiletDetails renders user-provided text inside bidi isolates', () => {
  const html = renderToStaticMarkup(
    <ToiletDetails toilet={fixtureToilet} onClose={() => {}} onOpenReviewModal={() => {}} />
  );

  it('wraps the facility name', () => {
    expect(html).toContain('<bdi>テストトイレ</bdi>');
  });

  it('wraps the facility address and description', () => {
    expect(html).toContain('<bdi>現在地周辺</bdi>');
    expect(html).toContain(`<bdi>ユーザーによって登録されたトイレ情報です。</bdi>`);
  });

  it('wraps review userName and comment (RLO が混ざっていても isolate 内)', () => {
    expect(html).toContain('<bdi>たろう\u202E</bdi>');
    expect(html).toContain('<bdi>きれいでした\u202E</bdi>');
  });

  it('never renders a bare review text node outside an isolate', () => {
    // レビュー本文・名前が bdi を経由せず直接出力されていないか
    expect(html).not.toMatch(/>\s*\{?たろう\\u202E/);
    expect(html).toContain('たろう\u202E</bdi>');
  });
});

// 回帰テスト（ホワイトアウト防止）: AddToiletModal / server POST /toilets が生成する
// 「未スコアのコミュニティ登録トイレ」を表示しても React ツリー全体が落ちないこと。
// 旧実装は shown.score.toFixed(1) で TypeError を投げ、ErrorBoundary も無いため
// 画面全体が真っ白になっていた。
const unscoredToilet: ToiletFacility = {
  ...fixtureToilet,
  reviewCount: 0,
  reviews: [],
  cleanlinessGrade: null as unknown as ToiletFacility['cleanlinessGrade'],
  cleanlinessScore: null as unknown as number,
  equipmentGrade: null as unknown as ToiletFacility['equipmentGrade'],
  equipmentScore: null as unknown as number,
  subScores: { cleanliness: null, odor: null, supplies: null, comfort: null } as unknown as ToiletFacility['subScores'],
  lastCleaned: undefined,
};

describe('ToiletDetails renders unscored community registrations without crashing', () => {
  const html = renderToStaticMarkup(
    <ToiletDetails toilet={unscoredToilet} onClose={() => {}} onOpenReviewModal={() => {}} />
  );

  it('renders at all (no TypeError from null scores)', () => {
    expect(html).toContain('テストトイレ');
  });

  it('shows the 未評価 display instead of a fabricated score', () => {
    expect(html).toContain('未評価');
    expect(html).toContain('–');
    expect(html).not.toContain('0.0');
  });

  it('never leaks the literal "null" into the UI', () => {
    expect(html).not.toContain('>null<');
    expect(html).not.toContain('null相当');
  });
});
