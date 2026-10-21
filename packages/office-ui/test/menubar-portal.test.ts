// @vitest-environment jsdom
import { act, createElement, createRef } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { MenuBar } from '../src/menubar';
let host: HTMLDivElement, root: Root;
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.stubGlobal('CSS', { escape: (value: string) => value });
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
});
afterEach(() => { act(() => root.unmount()); host.remove(); vi.unstubAllGlobals(); });
const menus = [{ id: 'slide', label: 'Slide', blocks: [{ id: 'actions', items: [{ id: 'new', label: 'New slide' }] }] }];
const trigger = () => host.querySelector<HTMLButtonElement>('[data-menu="slide"]')!;
it('keeps the default body portal and restores trigger focus after Escape', () => {
  act(() => root.render(createElement(MenuBar, { menus, label: 'Commands', onPick: () => {} })));
  act(() => { trigger().focus(); trigger().click(); });
  const menu = document.querySelector('[role="menu"]')!;
  expect(menu.parentElement).toBe(document.body); expect(host.contains(menu)).toBe(false);
  act(() => document.activeElement!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
  expect(document.querySelector('[role="menu"]')).toBeNull(); expect(document.activeElement).toBe(trigger());
});
it('resolves the mounted owned host at open and delivers its genuine menu choice', () => {
  const chrome = createRef<HTMLDivElement>(), pick = vi.fn();
  act(() => root.render(createElement('div', { ref: chrome }, createElement(MenuBar, { menus, label: 'Commands', onPick: pick, portalContainer: chrome }))));
  expect(chrome.current).not.toBeNull();
  act(() => trigger().click());
  const menu = chrome.current!.querySelector('[role="menu"]')!;
  expect(menu).not.toBeNull(); expect(menu.parentElement).toBe(chrome.current);
  act(() => menu.querySelector<HTMLButtonElement>('[data-menu-item="new"]')!.click());
  expect(pick).toHaveBeenCalledWith('new'); expect(document.querySelector('[role="menu"]')).toBeNull();
});
