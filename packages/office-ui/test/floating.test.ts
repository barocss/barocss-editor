// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { FloatingSurface, FloatingPanelHeader, type FloatingSurfaceProps } from '../src/floating';
import { IconButton } from '../src/controls';
import { MenuAction } from '../src/menu-action';
import { Dialog } from '../src/dialog';

let root: Root;
let width: number;
let height: number;
let resized: Array<() => void>;
const disconnected = vi.fn();
const anchor = () => new DOMRect(900, 100, 40, 20);
const render = (props: Partial<FloatingSurfaceProps> = {}) => act(() => {
  root.render(createElement(FloatingSurface, { open: true, at: anchor(), children: 'content', ...props }));
});
const surface = () => document.querySelector<HTMLDivElement>('[data-floating-surface]')!;

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  width = 100;
  height = 40;
  resized = [];
  disconnected.mockClear();
  vi.stubGlobal('ResizeObserver', class {
    constructor(callback: () => void) { resized.push(callback); }
    observe() {}
    disconnect = disconnected;
  });
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(() => new DOMRect(0, 0, width, height));
  const container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  document.body.replaceChildren();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('a shared floating surface', () => {
  it('keeps an uncommitted field draft and its DOM identity across an opted-in close and reopen', () => {
    function Draft() {
      const [value, setValue] = useState('Original');
      return createElement('input', { 'aria-label': 'Link draft', value,
        onInput: event => setValue(event.currentTarget.value) });
    }
    const kept = { keepMounted: true };
    const at = anchor();
    const children = createElement(Draft);
    render({ ...kept, at, children });
    const field = surface().querySelector('input')!;
    act(() => { field.value = 'Unaccepted link'; field.dispatchEvent(new Event('input', { bubbles: true })); });
    expect(field.value).toBe('Unaccepted link');
    render({ ...kept, at, children, open: false });
    expect(surface()?.querySelector('input')).toBe(field);
    render({ ...kept, at, children });
    expect(surface().querySelector('input')).toBe(field);
    expect(field.value).toBe('Unaccepted link');
  });

  it('hides and inerts retained fields without measuring, focusing or dismissing while closed', () => {
    const dismiss = vi.fn(), keys = vi.fn();
    const kept = { keepMounted: true };
    const at = anchor();
    const children = createElement(MenuAction, { children: 'Action' });
    render({ ...kept, at, children, variant: 'menu', focusOnOpen: true, onDismiss: dismiss, onKeyDown: keys });
    const retained = surface();
    const observerCount = resized.length;
    render({ ...kept, at, children, open: false, variant: 'menu', focusOnOpen: true, onDismiss: dismiss, onKeyDown: keys });
    expect(surface()).toBe(retained);
    expect(retained.hidden).toBe(true);
    expect(retained.hasAttribute('inert')).toBe(true);
    expect(retained.style.display).toBe('none');
    expect(retained.dataset.floatingReady).toBeUndefined();
    expect(disconnected).toHaveBeenCalled();
    act(() => {
      document.body.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }));
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
      retained.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }));
      window.dispatchEvent(new Event('resize'));
    });
    expect(dismiss).not.toHaveBeenCalled();
    expect(keys).not.toHaveBeenCalled();
    expect(resized.length).toBe(observerCount);
    const outside = document.createElement('button');
    document.body.append(outside);
    outside.focus();
    render({ ...kept, at: anchor(), children, open: false, variant: 'menu', focusOnOpen: true, onDismiss: dismiss });
    expect(document.activeElement).toBe(outside);
    expect(resized.length).toBe(observerCount);
    render({ ...kept, at, children, variant: 'menu', focusOnOpen: true, onDismiss: dismiss });
    expect(surface()).toBe(retained);
    expect(retained.hidden).toBe(false);
    expect(retained.hasAttribute('inert')).toBe(false);
    expect(document.activeElement).toBe(retained.querySelector('button'));
  });

  it('unmounts by default and does not retain a surface without a current anchor', () => {
    const child = createElement('input', { defaultValue: 'Original' });
    render({ children: child });
    const old = surface().querySelector('input')!;
    old.value = 'Unaccepted';
    render({ open: false, children: child });
    expect(surface()).toBeNull();
    render({ children: child });
    expect(surface().querySelector('input')).not.toBe(old);
    expect(surface().querySelector('input')!.value).toBe('Original');
    render({ ...{ keepMounted: true }, at: null, open: false, children: child });
    expect(surface()).toBeNull();
  });

  it.each(['menuitem', 'menuitemcheckbox', 'menuitemradio'] as const)('opens %s menus with keyboard focus and skips disabled actions', role => {
    render({ variant: 'menu', focusOnOpen: true, children: [
      createElement(MenuAction, { key: 'first', role }, 'First'),
      createElement(MenuAction, { key: 'disabled', role, disabled: true }, 'Unavailable'),
      createElement(MenuAction, { key: 'last', role }, 'Last')
    ] });
    const buttons = surface().querySelectorAll('button');
    expect(document.activeElement).toBe(buttons[0]);
    const reveal = vi.fn();
    buttons[2].scrollIntoView = reveal;
    act(() => buttons[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true })));
    expect(document.activeElement).toBe(buttons[2]);
    expect(reveal).toHaveBeenCalledWith({ block: 'nearest', inline: 'nearest' });
    act(() => buttons[2].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true })));
    expect(document.activeElement).toBe(buttons[0]);
    act(() => buttons[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true })));
    expect(document.activeElement).toBe(buttons[2]);
  });
  it('forwards semantic attributes into a themed portal root while keeping toolbar defaults', () => {
    const theme = document.createElement('section');
    theme.dataset.theme = 'dark';
    document.body.append(theme);
    render({ portalRoot: theme, role: 'dialog', 'aria-label': '링크 편집', 'data-note-formatting': 'true', variant: 'panel' });
    expect(surface().parentElement).toBe(theme);
    expect(surface().getAttribute('role')).toBe('dialog');
    expect(surface().getAttribute('aria-label')).toBe('링크 편집');
    expect(surface().dataset.noteFormatting).toBe('true');
    expect(surface().style.position).toBe('fixed');
    expect(surface().style.visibility).toBe('visible');
    render();
    expect(surface().parentElement).toBe(document.body);
    expect(surface().getAttribute('role')).toBe('toolbar');
  });

  it('remeasures changing content and viewport without changing the anchor', () => {
    const at = anchor();
    render({ at });
    expect(surface().style.top).toBe('52px');
    expect(surface().style.left).toBe('870px');
    width = 300;
    height = 150;
    act(() => resized.at(-1)!());
    expect(surface().style.top).toBe('128px');
    expect(surface().style.left).toBe(`${Math.min(770, window.innerWidth - 308)}px`);
    expect(surface().style.maxWidth).toBe('calc(100vw - 16px)');
    expect(surface().style.overflow).toBe('auto');
    width = 80;
    height = 30;
    act(() => window.dispatchEvent(new Event('resize')));
    expect(surface().style.top).toBe('62px');
    expect(surface().style.left).toBe('880px');
    render({ open: false, at });
    expect(surface()).toBeNull();
    expect(disconnected).toHaveBeenCalled();
  });

  it('limits a tall menu to the space below its anchor so every action can scroll into view', () => {
    vi.stubGlobal('innerHeight', 720);
    height = 411;
    render({ at: new DOMRect(100, 360, 40, 20), variant: 'menu', prefer: 'below' });
    expect(surface().style.top).toBe('388px');
    expect(surface().style.maxHeight).toBe('324px');
    expect(surface().style.overflow).toBe('auto');
    // Browser layout shrinks the box; its natural content still determines which side it uses.
    Object.defineProperty(surface(), 'scrollHeight', { configurable: true, value: 411 });
    height = 324;
    act(() => resized.at(-1)!());
    expect(surface().style.top).toBe('388px');
    expect(surface().style.maxHeight).toBe('324px');
  });

  it('honors placement preferences and alignment', () => {
    render({ at: new DOMRect(100, 100, 40, 20), prefer: 'below', align: 'end', gap: 12 });
    expect(surface().style.top).toBe('132px');
    expect(surface().style.left).toBe('40px');
  });

  it('keeps owned controls open and dismisses on outside pointer or Escape', () => {
    const dismiss = vi.fn();
    const trigger = document.createElement('button');
    document.body.append(trigger);
    render({ onDismiss: dismiss, ownedElements: [{ current: trigger }] });
    act(() => trigger.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true })));
    act(() => surface().dispatchEvent(new MouseEvent('pointerdown', { bubbles: true })));
    expect(dismiss).not.toHaveBeenCalled();
    act(() => document.body.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true })));
    expect(dismiss.mock.calls[0][0]).toBe('outside');
    const escape = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
    act(() => surface().dispatchEvent(escape));
    expect(dismiss.mock.calls[1][0]).toBe('escape');
    expect(escape.defaultPrevented).toBe(true);
  });

  it('dismisses only the topmost floating layer on Escape', () => {
    const outer = vi.fn();
    const inner = vi.fn();
    act(() => root.render(createElement('div', null,
      createElement(FloatingSurface, { open: true, at: anchor(), onDismiss: outer, children: 'outer' }),
      createElement(FloatingSurface, { open: true, at: anchor(), onDismiss: inner, children: 'inner' })
    )));
    act(() => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })));
    expect(inner).toHaveBeenCalledOnce();
    expect(outer).not.toHaveBeenCalled();
  });

  it('lets a separately portalled modal close and restore focus before its floating launcher', async () => {
    const dismiss = vi.fn();
    function Settings() {
      const [open, setOpen] = useState(false);
      return createElement('div', null,
        createElement(FloatingSurface, { open: true, at: anchor(), variant: 'panel', onDismiss: dismiss,
          children: createElement('button', { onClick: () => setOpen(true) }, 'Page settings') }),
        createElement(Dialog, { open, onOpenChange: setOpen, title: 'Page settings',
          children: createElement('input', { 'aria-label': 'Margin', defaultValue: '25.4' }) })
      );
    }
    await act(async () => root.render(createElement(Settings)));
    const launcher = surface().querySelector('button')!;
    launcher.focus();
    await act(async () => launcher.click());
    const modal = document.querySelector<HTMLElement>('[data-office-dialog][role="dialog"]')!;
    expect(modal).not.toBeNull();
    expect(surface().contains(modal)).toBe(false);
    expect(modal.contains(document.activeElement)).toBe(true);
    await act(async () => {
      document.activeElement!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    });
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(dismiss).not.toHaveBeenCalled();
    await vi.waitFor(() => expect(document.activeElement).toBe(launcher));
    expect(surface().querySelector('button')).toBe(launcher);
    act(() => launcher.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })));
    expect(dismiss).toHaveBeenCalledOnce();
    expect(dismiss.mock.calls[0][0]).toBe('escape');
  });

  it.each(['dialog', 'alertdialog'])('still dismisses the active floating child inside a modal %s', role => {
    const dismiss = vi.fn(), modalEscape = vi.fn();
    const modal = document.createElement('section');
    modal.setAttribute('role', role);
    modal.setAttribute('aria-modal', 'true');
    modal.addEventListener('keydown', modalEscape);
    document.body.append(modal);
    render({ portalRoot: modal, onDismiss: dismiss, children: createElement('button', null, 'Child action') });
    const child = surface().querySelector('button')!;
    child.focus();
    const escape = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
    act(() => child.dispatchEvent(escape));
    expect(dismiss).toHaveBeenCalledOnce();
    expect(dismiss.mock.calls[0][0]).toBe('escape');
    expect(modalEscape).not.toHaveBeenCalled();
    expect(escape.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(child);
  });

  it('supplies tooltip context and keeps mixed state distinct from active and focus preservation optional', () => {
    render({ children: createElement(IconButton, { label: '굵게', pressed: 'mixed', preserveFocus: true, children: 'B' }) });
    const button = surface().querySelector('button')!;
    expect(button.getAttribute('aria-pressed')).toBe('mixed');
    expect(button.matches('[aria-pressed="true"]')).toBe(false);
    const press = new MouseEvent('mousedown', { bubbles: true, cancelable: true });
    act(() => button.dispatchEvent(press));
    expect(press.defaultPrevented).toBe(true);
    render({ children: createElement(IconButton, { label: '굵게', pressed: true, children: 'B' }) });
    const plainPress = new MouseEvent('mousedown', { bubbles: true, cancelable: true });
    act(() => surface().querySelector('button')!.dispatchEvent(plainPress));
    expect(plainPress.defaultPrevented).toBe(false);
    expect(surface().querySelector('button')!.getAttribute('aria-pressed')).toBe('true');
  });

  it('shares menu row styling while forwarding native actions and preserving focus by default', () => {
    const pressed = vi.fn();
    render({ variant: 'menu', children: createElement(MenuAction, {
      selected: true, 'data-slash-item': 'insertCallout', 'aria-label': '콜아웃',
      onMouseDown: event => pressed(event.defaultPrevented), children: '콜아웃'
    }) });
    const button = surface().querySelector('button')!;
    expect(button.getAttribute('role')).toBe('menuitem');
    expect(button.dataset.slashItem).toBe('insertCallout');
    expect(button.className).toContain('bg-[color:var(--ou-accent-soft)]');
    act(() => button.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true })));
    expect(pressed).toHaveBeenCalledWith(true);
    render({ children: createElement(MenuAction, { preserveFocus: false, onMouseDown: event => pressed(event.defaultPrevented), children: '행' }) });
    act(() => surface().querySelector('button')!.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true })));
    expect(pressed).toHaveBeenLastCalledWith(false);
  });

  it('keeps a panel title and close button in the same header row above its fields', () => {
    const close = vi.fn();
    render({ variant: 'panel', children: [
      createElement(FloatingPanelHeader, { key: 'header', title: '콜아웃 속성', onClose: close, closeLabel: '속성 닫기' }),
      createElement('input', { key: 'field', 'aria-label': '제목' })
    ] });
    const header = surface().querySelector<HTMLElement>('[data-floating-panel-header]')!;
    const button = header.querySelector('button')!;
    expect(header.className.split(' ')).toEqual(expect.arrayContaining(['flex', 'items-center', 'justify-between', 'gap-3']));
    expect(header.className).not.toContain('flex-col');
    expect(header.firstElementChild?.textContent).toBe('콜아웃 속성');
    expect(button.parentElement).toBe(header);
    expect(header.lastElementChild).toBe(button);
    expect(header.nextElementSibling?.tagName).toBe('INPUT');
    expect(button.getAttribute('aria-label')).toBe('속성 닫기');
    act(() => button.click());
    expect(close).toHaveBeenCalledOnce();
  });
  it('lets a picker inside the owned surface close before the toolbar', () => {
    const dismiss = vi.fn(), innerEscape = vi.fn();
    render({ onDismiss: dismiss, children: createElement('input') });
    const picker = document.createElement('div'); picker.setAttribute('role', 'listbox');
    const option = document.createElement('button'); picker.append(option); surface().append(picker);
    picker.addEventListener('keydown', event => {
      if (event.key === 'Escape') { event.preventDefault(); innerEscape(); picker.remove(); }
    });
    act(() => option.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })));
    expect(innerEscape).toHaveBeenCalledOnce();
    expect(dismiss).not.toHaveBeenCalled();
    act(() => surface().querySelector('input')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })));
    expect(dismiss).toHaveBeenCalledOnce();
  });

  it.each(['listbox', 'menu', 'dialog'])('lets an explicitly owned portalled %s consume Escape before its parent', role => {
    const dismiss = vi.fn(), innerEscape = vi.fn();
    const picker = document.createElement('div'); picker.setAttribute('role', role);
    const item = document.createElement('button'); picker.append(item); document.body.append(picker);
    picker.addEventListener('keydown', event => { if (event.key === 'Escape') { event.preventDefault(); innerEscape(); } });
    render({ variant: 'panel', onDismiss: dismiss, ownedElements: [{ current: picker }], children: createElement('input') });
    act(() => item.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })));
    expect(innerEscape).toHaveBeenCalledOnce();
    expect(dismiss).not.toHaveBeenCalled();
    picker.remove();
    act(() => surface().querySelector('input')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })));
    expect(dismiss).toHaveBeenCalledOnce();
    expect(dismiss.mock.calls[0][0]).toBe('escape');
  });

  it.each(['listbox', 'menu', 'dialog'])('lets a portalled %s inside an owned host close before its parent', role => {
    const dismiss = vi.fn(), innerEscape = vi.fn();
    const owner = document.createElement('div');
    const picker = document.createElement('div'); picker.setAttribute('role', role);
    const item = document.createElement('button'); picker.append(item); owner.append(picker); document.body.append(owner);
    picker.addEventListener('keydown', event => {
      if (event.key === 'Escape') { event.preventDefault(); innerEscape(); picker.remove(); }
    });
    render({ variant: 'panel', onDismiss: dismiss, ownedElements: [{ current: owner }], children: createElement('input') });
    act(() => item.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })));
    expect(innerEscape).toHaveBeenCalledOnce();
    expect(dismiss).not.toHaveBeenCalled();
    act(() => surface().querySelector('input')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })));
    expect(dismiss).toHaveBeenCalledOnce();
    expect(dismiss.mock.calls[0][0]).toBe('escape');
    owner.remove();
  });

  it.each(['menu', 'dialog'])('dismisses its own %s when its portal belongs to an owned host', role => {
    const dismiss = vi.fn();
    const owner = document.createElement('div');
    document.body.append(owner);
    render({ role, variant: 'menu', portalRoot: owner, ownedElements: [{ current: owner }], onDismiss: dismiss,
      children: createElement('button', { role: 'menuitem' }, 'Formatting') });
    const escape = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
    act(() => surface().querySelector('button')!.dispatchEvent(escape));
    expect(dismiss).toHaveBeenCalledOnce();
    expect(dismiss.mock.calls[0][0]).toBe('escape');
    expect(escape.defaultPrevented).toBe(true);
    owner.remove();
  });

});
