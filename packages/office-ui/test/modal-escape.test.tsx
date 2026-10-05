// @vitest-environment jsdom
import { act, createElement, useRef, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { CommandSearch, CommandSearchTrigger } from '../src/command-search';
import { Dialog } from '../src/dialog';
import { FloatingSurface } from '../src/floating';
import { OfficePortalOwner } from '../src/portal-owner';
import { useDismiss } from '../src/stack';

let root: Root;
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => setTimeout(() => callback(0), 0));
  vi.stubGlobal('cancelAnimationFrame', clearTimeout);
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(() => new DOMRect(0, 0, 160, 40));
  const host = document.createElement('div'); document.body.append(host); root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount()); document.body.replaceChildren();
  vi.restoreAllMocks(); vi.unstubAllGlobals();
});
const escape = (element: Element, composing = false) => act(() => {
  element.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true, isComposing: composing }));
});

it.each(['control', 'floating'] as const)('keeps the background %s editor and draft while CommandSearch owns Escape', async kind => {
  const dismiss = vi.fn(), pick = vi.fn();
  function Background() {
    const [search, setSearch] = useState(false), owner = useRef<HTMLElement>(null);
    const control = useDismiss(kind === 'control', dismiss);
    return createElement(OfficePortalOwner, null, createElement('div', { ref: (element: HTMLDivElement | null) => { owner.current = element?.parentElement ?? null; } },
      createElement('div', { ref: control }, createElement('input', { 'aria-label': 'Property draft', defaultValue: 'Unfinished value' })),
      createElement(FloatingSurface, { open: kind === 'floating', at: new DOMRect(0, 0, 10, 10),
        ownedElements: [owner], onDismiss: dismiss, children: 'Background selection tools' }),
      createElement(CommandSearchTrigger, { onClick: () => setSearch(true) }),
      createElement(CommandSearch, { open: search, onOpenChange: setSearch, onPick: pick,
        commands: [{ id: 'find', label: 'Find', category: 'View' }] })
    ));
  }
  await act(async () => root.render(createElement(Background)));
  const draft = document.querySelector<HTMLInputElement>('[aria-label="Property draft"]')!;
  act(() => { draft.value = 'Unaccepted new value'; draft.dispatchEvent(new Event('input', { bubbles: true })); });
  const trigger = document.querySelector<HTMLButtonElement>('.office-command-trigger')!;
  await act(async () => { trigger.focus(); trigger.click(); });
  const query = document.querySelector<HTMLInputElement>('[role="combobox"]')!;
  expect(query).not.toBeNull();
  expect(document.activeElement).toBe(query);
  escape(query, true);
  expect(document.querySelector('[role="combobox"]')).toBe(query);
  expect(dismiss).not.toHaveBeenCalled();
  await act(async () => escape(query));
  expect(document.querySelector('[role="combobox"]')).toBeNull();
  expect(dismiss).not.toHaveBeenCalled(); expect(pick).not.toHaveBeenCalled();
  await vi.waitFor(() => expect(document.activeElement).toBe(trigger));
  expect(document.querySelector('[aria-label="Property draft"]')).toBe(draft);
  expect(draft.value).toBe('Unaccepted new value');
  // Once the dialog has closed, the native background editor still owns Escape.
  escape(draft);
  expect(dismiss).toHaveBeenCalledOnce();
});

it('lets a control inside the current dialog consume one Escape before its modal and preserves composing input', async () => {
  function ChildControl() {
    const [open, setOpen] = useState(true);
    const host = useDismiss(open, () => setOpen(false));
    return createElement('div', { ref: host }, open && createElement('button', { id: 'child' }, 'Child picker'),
      createElement('input', { id: 'modal-draft', defaultValue: 'Unaccepted link' }));
  }
  function Owner() {
    const [open, setOpen] = useState(true);
    return createElement(Dialog, { open, onOpenChange: setOpen, title: 'Native properties', children: createElement(ChildControl) });
  }
  await act(async () => root.render(createElement(Owner)));
  const child = document.querySelector<HTMLButtonElement>('#child')!;
  const draft = document.querySelector<HTMLInputElement>('#modal-draft')!;
  escape(child, true);
  expect(document.querySelector('#child')).toBe(child);
  expect(document.querySelector('[role="dialog"]')).not.toBeNull();
  escape(child);
  expect(document.querySelector('#child')).toBeNull();
  expect(document.querySelector('[role="dialog"]')).not.toBeNull();
  expect(document.querySelector('#modal-draft')).toBe(draft);
  expect(draft.value).toBe('Unaccepted link');
  await act(async () => { draft.focus(); escape(draft); });
  expect(document.querySelector('[role="dialog"]')).toBeNull();
});
