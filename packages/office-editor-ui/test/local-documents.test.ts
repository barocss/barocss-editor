// @vitest-environment jsdom
import { act, createElement, type ComponentProps } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { LocalDocuments } from '../src/local-documents';

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

it('returns to recent documents when the recovery opener disappears after its status changes', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  const flush = vi.fn(async () => true);
  const rows = vi.fn(async () => []);
  type Persistence = ComponentProps<typeof LocalDocuments>['persistence'];
  const session = { current: { flush, options: { documents: { rows }, drafts: { rows } } } } as unknown as Persistence['session'];
  const render = async (status: Persistence['status']) => {
    await act(async () => root!.render(createElement(LocalDocuments, {
      persistence: { session, status, beforeReplace: async () => true },
      title: '저장한 자료', prefix: 'test', onOpened: vi.fn(),
    })));
  };
  await render('충돌한 초안 보관됨');
  const opener = button('복구 초안 보기');
  await act(async () => { opener.focus(); opener.click(); });
  await act(async () => { await tick(); });
  const dialog = document.querySelector('[role="dialog"]')!;
  expect(dialog).not.toBeNull();
  expect(dialog.contains(document.activeElement)).toBe(true);
  expect(flush).toHaveBeenCalledTimes(1);
  expect(rows).toHaveBeenCalledTimes(2);

  // Recovery changes the session status and removes this conditional opener.
  await render('저장됨');
  expect(opener.isConnected).toBe(false);
  const recent = button('최근 자료');
  expect(recent.disabled).toBe(false);
  await act(async () => { dialog.querySelector<HTMLButtonElement>('button[aria-label="닫기"]')!.click(); });
  await act(async () => { await tick(); });
  expect(document.querySelector('[role="dialog"]')).toBeNull();
  await vi.waitFor(() => expect(document.activeElement).toBe(recent));
});
