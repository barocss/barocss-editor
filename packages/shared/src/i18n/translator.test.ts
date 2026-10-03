import { describe, expect, expectTypeOf, it } from 'vitest';
import { createTranslator, messageLocale, messageParameters, messagesEn, messagesKo, translateMessage, type MessageKey, type MessageArguments } from './index';

describe('the centralized host-owned message catalogs', () => {
  it('keeps exact key and placeholder parity for every supported locale', () => {
    expect(Object.keys(messagesKo).sort()).toEqual(Object.keys(messagesEn).sort());
    for (const key of Object.keys(messagesEn) as MessageKey[]) {
      const placeholders = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map(match => match[1]).sort();
      expect(placeholders(messagesKo[key]), key).toEqual(placeholders(messagesEn[key]));
      const schema = messageParameters as Partial<Record<MessageKey, readonly string[]>>;
      expect([...new Set(placeholders(messagesEn[key]))].sort(), key).toEqual([...(schema[key] ?? [])].sort());
      expect(messagesEn[key].length, key).toBeGreaterThan(0);
      expect(messagesKo[key].length, key).toBeGreaterThan(0);
    }
    expect(Object.keys(messagesEn)).toHaveLength(130);
  });

  it.each([['ko', 'ko'], ['ko-KR', 'ko'], ['KO-kr', 'ko'], ['en-US', 'en'], ['fr-FR', 'en'], ['', 'en']])(
    'normalizes host locale %s to the supported catalog %s', (locale, normalized) => {
      expect(messageLocale(locale)).toBe(normalized);
      expect(translateMessage('document.save.status.saved', locale)).toBe(normalized === 'ko' ? '저장됨' : 'Saved');
    }
  );

  it('keeps concurrent hosts independent, including later unsupported locale fallback', () => {
    const korean = createTranslator('ko-KR'), english = createTranslator('en-US'), fallback = createTranslator('ja-JP');
    expect(korean('document.save.status.save-error')).toBe('저장 실패');
    expect(english('document.save.status.save-error')).toBe('Save failed');
    expect(fallback('document.save.action.retryRestore')).toBe('Retry restore');
    expect(korean('context.historyCanUndo.description')).toBe('Undo가 가능한지 여부');
    expect(english('context.historyCanUndo.description')).toBe('Whether undo is available');
    expect(korean('document.save.action.openDraft')).toBe('복구 초안 보기');
  });

  it('renders typed catalog placeholders without evaluating title values', () => {
    const korean = createTranslator('ko'), english = createTranslator('en');
    expect(english('site.inspector.selectionCount', { count: 2 })).toBe('2 selected');
    expect(korean('site.inspector.selectionCount', { count: 2 })).toBe('2개 선택됨');
    expect(english('document.library.openLabel', { title: '<script>fictional</script>' })).toBe('Open <script>fictional</script>');
    expect(korean('document.library.draftLabel', { title: '가상 문서' })).toBe('가상 문서 · 복구 초안');
    expect(translateMessage('document.library.openLabel', 'en-US', { title: 0 })).toBe('Open 0');
    expect(english('document.library.trashed', { title: 'Fictional' })).toContain('“Fictional”');
    expect(korean('document.library.openFailed', { title: '가상 문서' })).toContain('“가상 문서”');
    expectTypeOf<MessageArguments<'document.library.openLabel'>>().toEqualTypeOf<[params: { title: string | number }]>();
    expectTypeOf<MessageArguments<'document.save.status.saved'>>().toEqualTypeOf<[]>();
    expectTypeOf<MessageKey>().toEqualTypeOf<keyof typeof messagesEn>();
  });
});
