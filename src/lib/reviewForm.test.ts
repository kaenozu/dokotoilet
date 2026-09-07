import { describe, expect, it } from 'vitest';
import {
  canSubmitReview,
  commentFeedback,
  isValidComment,
  isValidScore,
  toiletFormFeedback,
  userNameFeedback,
} from './reviewForm';
import { TEXT_FIELDS } from './textPolicy';

describe('isValidScore', () => {
  it('accepts integers 1..5 only', () => {
    for (const v of [1, 2, 3, 4, 5]) expect(isValidScore(v)).toBe(true);
  });

  it('rejects out-of-range, fractional and non-number values', () => {
    for (const v of [0, 6, 3.5, -1, NaN, null, '4']) {
      expect(isValidScore(v)).toBe(false);
    }
  });
});

describe('isValidComment / commentFeedback (textPolicy 準拠)', () => {
  it('rejects empty and whitespace-only comments', () => {
    expect(isValidComment('')).toBe(false);
    expect(isValidComment('   ')).toBe(false);
  });

  it('accepts non-empty comments up to the shared policy cap', () => {
    expect(isValidComment('清潔で快適でした')).toBe(true);
    expect(isValidComment('あ'.repeat(TEXT_FIELDS.comment.max))).toBe(true);
    // サーバー MAX.comment と同一であること（二重実装の分裂防止）
    expect(TEXT_FIELDS.comment.max).toBe(1000);
  });

  it('rejects comments longer than the policy cap', () => {
    expect(isValidComment('あ'.repeat(TEXT_FIELDS.comment.max + 1))).toBe(false);
  });

  it('rejects URL-bearing comments before submit (server 400 と同一判定)', () => {
    expect(isValidComment('詳細は https://spam.example')).toBe(false);
    expect(commentFeedback('see www.spam.example')).toBe(
      '口コミにURLは含められません'
    );
  });

  it('rejects invisible-only comments (ZWSP 連打)', () => {
    expect(isValidComment('\u200B'.repeat(10))).toBe(false);
    expect(commentFeedback('\u200B'.repeat(10))).toBe('口コミを入力してください');
  });
});

describe('userNameFeedback', () => {
  it('accepts empty (匿名フォールバック) and normal names', () => {
    expect(userNameFeedback('')).toBe(null);
    expect(userNameFeedback('たろう')).toBe(null);
  });

  it('rejects over-limit names with copy', () => {
    expect(userNameFeedback('あ'.repeat(TEXT_FIELDS.userName.max))).toBe(null);
    expect(userNameFeedback('あ'.repeat(TEXT_FIELDS.userName.max + 1))).toBe(
      `ニックネームは${TEXT_FIELDS.userName.max}文字以内にしてください`
    );
  });
});

describe('toiletFormFeedback', () => {
  const ok = {
    name: 'テストトイレ',
    address: '',
    floorInfo: '',
    description: '',
  };

  it('accepts a valid form (空の任意欄はフォールバック)', () => {
    expect(toiletFormFeedback(ok)).toBe(null);
  });

  it('rejects invisible-only names like the server', () => {
    expect(toiletFormFeedback({ ...ok, name: '\u200B'.repeat(10) })).toBe(
      '施設名を入力してください'
    );
  });

  it('rejects URL-bearing fields before submit', () => {
    expect(toiletFormFeedback({ ...ok, name: 'h\u200Ettps://spam.example' })).toBe(
      '施設名にURLは含められません'
    );
    expect(toiletFormFeedback({ ...ok, address: 'www.spam.example' })).toBe(
      '住所にURLは含められません'
    );
    expect(toiletFormFeedback({ ...ok, floorInfo: '2階 https://x.example' })).toBe(
      'フロア・場所情報にURLは含められません'
    );
  });

  it('rejects over-length names', () => {
    expect(toiletFormFeedback({ ...ok, name: 'あ'.repeat(TEXT_FIELDS.toiletName.max + 1) })).toBe(
      '施設名を入力してください'
    );
  });
});

describe('canSubmitReview', () => {
  it('requires an explicitly selected rating (no default)', () => {
    expect(canSubmitReview(null, '良い')).toBe(false);
    expect(canSubmitReview(5, '良い')).toBe(true);
  });

  it('requires a valid comment even when rated', () => {
    expect(canSubmitReview(4, '')).toBe(false);
    expect(canSubmitReview(4, '   ')).toBe(false);
    expect(canSubmitReview(4, 'https://spam.example')).toBe(false);
    expect(canSubmitReview(4, '良いトイレでした')).toBe(true);
  });
});
