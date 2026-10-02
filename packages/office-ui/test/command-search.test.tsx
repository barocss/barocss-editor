// @vitest-environment jsdom
import { act, createElement, Fragment, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { CommandSearch, CommandSearchTrigger } from '../src/command-search';

let host: HTMLDivElement, root: Root;
const pick = vi.fn(), accepted = vi.fn();
let intent: ((id: string) => (() => void) | undefined) | undefined;
function Harness() {
  const [open, setOpen] = useState(false);
  return createElement(Fragment, null,
    createElement(CommandSearchTrigger, { onClick: () => setOpen(true) }),
    createElement(CommandSearch, { open, onOpenChange: setOpen, onPick: pick,
      onPickIntent: intent, commands: [{ id: 'duplicate', label: 'Duplicate', category: 'Edit' }] }));
}
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => setTimeout(() => callback(0), 0));
  vi.stubGlobal('cancelAnimationFrame', clearTimeout);
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
  intent = undefined; pick.mockClear(); accepted.mockClear();
});
afterEach(() => { act(() => root.unmount()); host.remove(); vi.unstubAllGlobals(); });
function openSearch() {
  act(() => root.render(createElement(Harness)));
  const trigger = host.querySelector<HTMLButtonElement>('button')!;
  act(() => { trigger.focus(); trigger.click(); });
  expect(document.querySelector('[role="dialog"]')).not.toBeNull();
  return trigger;
}
const settleClose = async () => act(async () => { await new Promise(resolve => setTimeout(resolve, 50)); });

it('keeps ordinary consumers on the ID callback after dismissal and focus return', async () => {
  const trigger = openSearch();
  act(() => document.querySelector<HTMLButtonElement>('[role="option"]')!.click());
  expect(pick).not.toHaveBeenCalled();
  await settleClose();
  expect(document.querySelector('[role="dialog"]')).toBeNull();
  expect(document.activeElement).toBe(trigger);
  expect(pick).toHaveBeenCalledTimes(1); expect(pick).toHaveBeenCalledWith('duplicate');
});

it('captures an admitted action while open and delivers it once after focus return', async () => {
  intent = vi.fn(id => {
    expect(id).toBe('duplicate');
    expect(document.querySelector('[role="dialog"]')).not.toBeNull();
    return accepted;
  });
  const trigger = openSearch();
  act(() => document.querySelector<HTMLButtonElement>('[role="option"]')!.click());
  expect(accepted).not.toHaveBeenCalled();
  await settleClose();
  expect(document.activeElement).toBe(trigger);
  expect(accepted).toHaveBeenCalledTimes(1); expect(pick).not.toHaveBeenCalled();
});

it('keeps a refused choice open and discards dismissal without a command', async () => {
  intent = vi.fn(() => undefined);
  const trigger = openSearch();
  act(() => document.querySelector<HTMLButtonElement>('[role="option"]')!.click());
  expect(document.querySelector('[role="dialog"]')).not.toBeNull();
  act(() => document.querySelector<HTMLButtonElement>('button[aria-label="닫기"]')!.click());
  await settleClose();
  expect(document.querySelector('[role="dialog"]')).toBeNull();
  expect(document.activeElement).toBe(trigger);
  expect(pick).not.toHaveBeenCalled(); expect(accepted).not.toHaveBeenCalled();
});
