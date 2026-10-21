// @vitest-environment jsdom
import { act, createElement, type ComponentProps } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { DocumentMenu } from '../src/document-bar';
let host: HTMLDivElement, root: Root;
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.stubGlobal('CSS', { escape: (value: string) => value });
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
});
afterEach(() => { act(() => root.unmount()); host.remove(); vi.unstubAllGlobals(); });
const menus = [
  { id: 'file', label: 'File', blocks: [{ id: 'document', items: [{ id: 'file.open', label: 'Open original' }] }] },
  { id: 'insert', label: 'Insert', blocks: [{ id: 'content', items: [{ id: 'insert.text', label: 'Insert text' }] }] }
];
it('keeps document choices short without changing the complete product command model or IDs', () => {
  const pick = vi.fn(), original = JSON.stringify(menus);
  const props = { menus, menuIds: ['file'], label: 'Document', onPick: pick } as ComponentProps<typeof DocumentMenu>;
  act(() => root.render(createElement(DocumentMenu, props)));
  const opener = host.querySelector<HTMLButtonElement>('[data-menu="document"]')!;
  act(() => { opener.focus(); opener.click(); });
  const shown = document.querySelector('[role="menu"]')!;
  expect(shown.textContent).toContain('Open original');
  expect(shown.textContent).not.toContain('Insert text');
  act(() => shown.querySelector<HTMLButtonElement>('[data-menu-item="file.open"]')!.click());
  expect(pick).toHaveBeenCalledTimes(1);
  expect(pick).toHaveBeenCalledWith('file.open');
  expect(document.activeElement).toBe(opener);
  expect(JSON.stringify(menus)).toBe(original);
});
it('preserves the full menu for existing consumers that do not request a presentation scope', () => {
  act(() => root.render(createElement(DocumentMenu, { menus, label: 'Document', onPick: () => {} })));
  act(() => host.querySelector<HTMLButtonElement>('[data-menu="document"]')!.click());
  expect(document.querySelector('[role="menu"]')!.textContent).toContain('Insert text');
});
