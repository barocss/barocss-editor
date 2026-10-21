// @vitest-environment jsdom
import { act, createElement, createRef, type ComponentProps } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { OfficeLocaleProvider } from '@barocss/office-ui';
import { LocalDocuments, type LocalDocumentActions } from '../src/local-documents';

let root: Root | undefined;
const tick = () => new Promise(resolve => setTimeout(resolve, 0));
const button = (label: string) => Array.from(document.querySelectorAll('button')).find(node => node.textContent === label)!;

afterEach(async () => {
  await act(async () => { root?.unmount(); await tick(); });
  root = undefined;
  document.body.replaceChildren();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

for (const locale of ['ko', 'en']) for (const iconOnly of [false, true]) it(`returns to ${locale} ${iconOnly ? 'icon' : 'text'} recent documents when the recovery opener disappears after its status changes`, async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  // jsdom lacks the browser observer used when the focused icon opens its tooltip.
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  const host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  const flush = vi.fn(async () => true);
  const rows = vi.fn(async () => []);
  type Persistence = ComponentProps<typeof LocalDocuments>['persistence'];
  const session = { current: { flush, options: { documents: { rows }, drafts: { rows } } } } as unknown as Persistence['session'];
  const render = async (statusCode: 'conflict' | 'saved') => {
    await act(async () => root!.render(createElement(OfficeLocaleProvider, { locale, children: createElement(LocalDocuments, {
      persistence: { session, status: statusCode, beforeReplace: async () => true },
      title: '저장한 자료', prefix: 'test', onOpened: vi.fn(), iconOnly,
    }) })));
  };
  await render('conflict');
  const opener = button(locale === 'ko' ? '복구 초안 보기' : 'View recovery draft');
  await act(async () => { opener.focus(); opener.click(); });
  await act(async () => { await tick(); });
  const dialog = document.querySelector('[role="dialog"]')!;
  expect(dialog).not.toBeNull();
  expect(dialog.contains(document.activeElement)).toBe(true);
  expect(flush).toHaveBeenCalledTimes(1);
  expect(rows).toHaveBeenCalledTimes(2);

  // Recovery changes the session status and removes this conditional opener.
  await render('saved');
  expect(opener.isConnected).toBe(false);
  const recentLabel = locale === 'ko' ? '최근 자료' : 'Recent documents';
  const recent = iconOnly ? document.querySelector<HTMLButtonElement>(`button[aria-label="${recentLabel}"]`)! : button(recentLabel);
  expect(recent.disabled).toBe(false);
  await act(async () => { dialog.querySelector<HTMLButtonElement>('button[aria-label="닫기"]')!.click(); });
  await act(async () => { await tick(); });
  expect(document.querySelector('[role="dialog"]')).toBeNull();
  await vi.waitFor(() => expect(document.activeElement).toBe(recent));
});

for (const status of ['save-error', 'restore-error'] as const) it(`changes retry language without changing the ${status} action or document identity`, async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const host = document.createElement('div'); document.body.append(host); root = createRoot(host);
  const flush = vi.fn(async () => true), open = vi.fn(async () => true);
  type Persistence = ComponentProps<typeof LocalDocuments>['persistence'];
  const session = { current: { id: 'saved-id', flush, open, options: { key: 'slides' } } } as unknown as Persistence['session'];
  history.replaceState(null, '', '#slides=saved-id');
  const render = async (locale: string) => act(async () => root!.render(createElement(OfficeLocaleProvider, {
    locale, children: createElement(LocalDocuments, { persistence: { session, status, beforeReplace: async () => true }, title: 'Library', prefix: 'test', onOpened: vi.fn() }),
  })));
  await render('ko');
  expect(button(status === 'save-error' ? '저장 다시 시도' : '복원 다시 시도')).toBeDefined();
  await render('en');
  expect(flush).not.toHaveBeenCalled(); expect(open).not.toHaveBeenCalled();
  await act(async () => { button(status === 'save-error' ? 'Retry save' : 'Retry restore').click(); await tick(); });
  if (status === 'save-error') { expect(flush).toHaveBeenCalledTimes(1); expect(open).not.toHaveBeenCalled(); }
  else { expect(open).toHaveBeenCalledTimes(1); expect(open).toHaveBeenCalledWith('saved-id'); expect(flush).not.toHaveBeenCalled(); }
  expect(session.current?.id).toBe('saved-id'); expect(location.hash).toBe('#slides=saved-id');
});

for (const outcome of ['complete', 'fail', 'unmount'] as const) it(`reports owned library busy state until held reads ${outcome}, without duplicate reads or retired updates`, async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const host = document.createElement('div'); document.body.append(host); root = createRoot(host);
  const opener = document.createElement('button'); opener.textContent = 'Document menu'; document.body.append(opener);
  const other = document.createElement('button'); other.textContent = 'Other action'; document.body.append(other);
  const actions = createRef<LocalDocumentActions>();
  const onBusyChange = vi.fn();
  let complete!: (rows: never[]) => void, fail!: (error: Error) => void;
  const held = new Promise<never[]>((resolve, reject) => { complete = resolve; fail = reject; });
  const rows = vi.fn(() => held), flush = vi.fn(async () => true);
  type Persistence = ComponentProps<typeof LocalDocuments>['persistence'];
  const session = { current: { id: 'saved-id', flush, options: { key: 'slides', documents: { rows }, drafts: { rows } } } } as unknown as Persistence['session'];
  await act(async () => root!.render(createElement(OfficeLocaleProvider, { locale: 'ko', children: createElement(LocalDocuments, {
    persistence: { session, status: 'saved', beforeReplace: async () => true },
    title: 'Library', prefix: 'test', onOpened: vi.fn(), showTrigger: false, ref: actions, onBusyChange,
  }) })));
  expect(onBusyChange).toHaveBeenLastCalledWith(false);
  await act(async () => { opener.focus(); actions.current!.open(opener); await tick(); });
  expect(onBusyChange).toHaveBeenLastCalledWith(true);
  expect(rows).toHaveBeenCalledTimes(2); expect(flush).toHaveBeenCalledTimes(1);
  expect(document.querySelector('[role="dialog"]')).toBeNull();
  expect(opener.disabled).toBe(false); expect(other.disabled).toBe(false);
  await act(async () => { actions.current!.open(other); actions.current!.open(other); await tick(); });
  expect(rows).toHaveBeenCalledTimes(2); expect(flush).toHaveBeenCalledTimes(1);
  expect(onBusyChange.mock.calls.map(([busy]) => busy)).toEqual([false, true]);
  if (outcome === 'unmount') {
    await act(async () => root!.unmount()); root = undefined;
    expect(actions.current).toBeNull(); expect(onBusyChange).toHaveBeenLastCalledWith(false);
    const retiredCalls = onBusyChange.mock.calls.length;
    await act(async () => { complete([]); await tick(); });
    expect(onBusyChange).toHaveBeenCalledTimes(retiredCalls);
    expect(document.querySelector('[role="dialog"]')).toBeNull();
  } else {
    await act(async () => { if (outcome === 'fail') fail(new Error('Library read failed')); else complete([]); await tick(); });
    expect(onBusyChange.mock.calls.map(([busy]) => busy)).toEqual([false, true, false]);
    if (outcome === 'fail') {
      expect(document.querySelector('[role="dialog"]')).toBeNull();
      expect(document.querySelector('[role="alert"]')).not.toBeNull();
    } else {
      const dialogs = document.querySelectorAll('[role="dialog"]'); expect(dialogs).toHaveLength(1);
      await act(async () => { dialogs[0].querySelector<HTMLButtonElement>('button[aria-label="닫기"]')!.click(); await tick(); });
      await vi.waitFor(() => expect(document.activeElement).toBe(opener));
      expect(opener.isConnected).toBe(true); expect(rows).toHaveBeenCalledTimes(2);
    }
  }
});


it('keeps compact failures and recovery readable, then quiets only confirmed saved state', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const host = document.createElement('div'); document.body.append(host); root = createRoot(host);
  type Persistence = ComponentProps<typeof LocalDocuments>['persistence'];
  const flush = vi.fn(async () => true);
  const session = { current: { id: 'quiet-original', flush } } as unknown as Persistence['session'];
  for (const status of ['loading', 'saving', 'save-error', 'restore-error', 'conflict', 'recovery-required', 'saved'] as const) {
    await act(async () => root!.render(createElement(OfficeLocaleProvider, { locale: 'en', children: createElement(LocalDocuments, {
      persistence: { session, status, beforeReplace: async () => true }, title: 'Library', prefix: 'quiet', iconOnly: true, onOpened: vi.fn(),
    }) })));
    const indicator = host.querySelector<HTMLElement>('[data-quiet-save-status]')!;
    expect(indicator.getAttribute('role')).toBe('status');
    expect(indicator.textContent!.length).toBeGreaterThan(0);
    expect(indicator.hasAttribute('data-quiet')).toBe(status === 'saved');
    expect(indicator.hasAttribute('data-icon-only')).toBe(status === 'saved');
    if (status !== 'saved') expect(indicator.tabIndex).toBe(0);
    else expect(indicator.getAttribute('title')).toBe('Saved');
    if (status === 'save-error') expect(button('Retry save').disabled).toBe(false);
    if (status === 'restore-error') expect(button('Retry restore').disabled).toBe(false);
    if (status === 'conflict') expect(button('View recovery draft').disabled).toBe(false);
    if (status === 'recovery-required') expect(button('Reopen saved copy').disabled).toBe(false);
    expect(session.current?.id).toBe('quiet-original');
    expect(flush).not.toHaveBeenCalled();
  }
});
