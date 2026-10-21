// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { OfficeLocaleProvider, useOfficeLocale } from '@barocss/office-ui';
import { DocumentSaveStatus } from '../src/document-save-status';

it.each([
  ['loading', '불러오는 중', 'Loading', 'neutral', true],
  ['saving', '저장 중', 'Saving', 'neutral', true],
  ['saved', '저장됨', 'Saved', 'success', false],
  ['conflict', '충돌한 초안 보관됨', 'Conflict draft retained', 'warning', false],
  ['save-error', '저장 실패', 'Save failed', 'danger', false],
  ['restore-error', '복원 실패', 'Restore failed', 'danger', false],
  ['recovery-required', '복구 필요', 'Recovery required', 'danger', false],
] as const)('keeps %s role and busy state while its host changes locale', async (status, ko, en, tone, busy) => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const host = document.createElement('div'); document.body.append(host);
  const root = createRoot(host);
  try {
    for (const [locale, label] of [['ko-KR', ko], ['en-US', en], ['fr-FR', en]] as const) {
      await act(async () => root.render(createElement(OfficeLocaleProvider, { locale, children: createElement(DocumentSaveStatus, { status }) })));
      const indicator = host.querySelector('[role="status"]')!;
      expect(indicator.textContent).toBe(label);
      expect(indicator.getAttribute('data-tone')).toBe(tone);
      expect(indicator.hasAttribute('data-busy')).toBe(busy);
    }
  } finally { await act(async () => root.unmount()); host.remove(); vi.unstubAllGlobals(); }
});

it('keeps two hosts in independent locales without a global locale mutation', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const host = document.createElement('div'); document.body.append(host);
  const root = createRoot(host);
  try {
    await act(async () => root.render(createElement('div', {},
      createElement(OfficeLocaleProvider, { locale: 'ko', children: createElement(DocumentSaveStatus, { status: 'saved' }) }),
      createElement(OfficeLocaleProvider, { locale: 'en', children: createElement(DocumentSaveStatus, { status: 'saved' }) }))));
    expect([...host.querySelectorAll('[role="status"]')].map(node => node.textContent)).toEqual(['저장됨', 'Saved']);
  } finally { await act(async () => root.unmount()); host.remove(); vi.unstubAllGlobals(); }
});


it('lets the host change language without rebuilding children', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const host = document.createElement('div'); document.body.append(host);
  const root = createRoot(host);
  let changes = 0;
  function Host() {
    const { locale, setLocale } = useOfficeLocale();
    return createElement('div', {}, createElement('button', { onClick: () => { changes++; setLocale(locale === 'ko' ? 'en' : 'ko'); } }, 'Language'), createElement(DocumentSaveStatus, { status: 'saved' }));
  }
  try {
    await act(async () => root.render(createElement(OfficeLocaleProvider, { children: createElement(Host) })));
    expect(host.querySelector('[role="status"]')!.textContent).toBe('저장됨');
    await act(async () => host.querySelector('button')!.click());
    expect(host.querySelector('[role="status"]')!.textContent).toBe('Saved');
    expect(changes).toBe(1);
  } finally { await act(async () => root.unmount()); host.remove(); vi.unstubAllGlobals(); }
});
