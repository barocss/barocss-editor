// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { DocumentNavigation } from '../src/document-navigation';

let root: Root;
let frames: Map<number, FrameRequestCallback>;
let serial: number;
const render = (portalRoot?: HTMLElement) => act(() => root.render(createElement(DocumentNavigation, {
  mode: 'find', at: new DOMRect(400, 100, 40, 30), query: 'fictional', current: 0, count: 1,
  caseSensitive: false, headings: [], onMode: vi.fn(), onQuery: vi.fn(), onCaseSensitive: vi.fn(),
  onStep: vi.fn(), onHeading: vi.fn(), onClose: vi.fn(), onDismiss: vi.fn(), portalRoot,
})));
const field = () => document.querySelector<HTMLInputElement>('input[aria-label="본문에서 찾기"]')!;
const flush = () => act(() => {
  const pending = [...frames.values()]; frames.clear();
  pending.forEach(callback => callback(0));
});
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  frames = new Map(); serial = 0;
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    const id = ++serial; frames.set(id, callback); return id;
  });
  vi.stubGlobal('cancelAnimationFrame', (id: number) => frames.delete(id));
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 300, 160));
  const container = document.createElement('div'); document.body.append(container); root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount()); document.body.replaceChildren(); vi.restoreAllMocks(); vi.unstubAllGlobals();
});

it('initial find focus selects the retained query when no user has intervened', () => {
  render(); flush();
  expect(document.activeElement).toBe(field());
  expect([field().selectionStart, field().selectionEnd]).toEqual([0, 9]);
});
it('delayed initial focus preserves a caret the user already placed in the query', () => {
  render(); const input = field(); input.focus(); input.setSelectionRange(9, 9);
  flush();
  expect(document.activeElement).toBe(input);
  expect(input.value).toBe('fictional');
  expect([input.selectionStart, input.selectionEnd]).toEqual([9, 9]);
});
it('delayed initial focus does not steal focus from another navigation action', () => {
  render(); const action = document.querySelector<HTMLButtonElement>('button[aria-label="대소문자 구분"]')!;
  action.focus(); flush();
  expect(document.activeElement).toBe(action);
});

it.each(['hidden', 'inert'])('delayed initial focus does not enter a newly %s owning host', attribute => {
  const host = document.createElement('section'); document.body.append(host);
  render(host);
  expect(host.contains(field())).toBe(true);
  host.setAttribute(attribute, '');
  flush();
  expect(document.activeElement).not.toBe(field());
});
it('delayed initial focus does not enter a detached owning host', () => {
  const host = document.createElement('section'); document.body.append(host);
  render(host); const input = field();
  host.remove(); flush();
  expect(document.activeElement).not.toBe(input);
});
