// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { FloatingSurface, FloatingPanelHeader, type FloatingSurfaceProps } from '../src/floating';
import { IconButton } from '../src/controls';
import { MenuAction } from '../src/menu-action';

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
  it('opens explicit menus with keyboard focus and skips disabled actions', () => {
    render({ variant: 'menu', focusOnOpen: true, children: [
      createElement(MenuAction, { key: 'first' }, 'First'),
      createElement(MenuAction, { key: 'disabled', disabled: true }, 'Unavailable'),
      createElement(MenuAction, { key: 'last' }, 'Last')
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

  it('supplies tooltip context and keeps mixed state distinct from active and focus preservation optional', () => {
    render({ children: createElement(IconButton, { label: '굵게', pressed: 'mixed', preserveFocus: true, children: 'B' }) });
    const button = surface().querySelector('button')!;
    expect(button.getAttribute('aria-pressed')).toBe('mixed');
    expect(button.className).not.toContain('bg-[color:var(--ou-accent-soft)]');
    const press = new MouseEvent('mousedown', { bubbles: true, cancelable: true });
    act(() => button.dispatchEvent(press));
    expect(press.defaultPrevented).toBe(true);
    render({ children: createElement(IconButton, { label: '굵게', pressed: true, children: 'B' }) });
    const plainPress = new MouseEvent('mousedown', { bubbles: true, cancelable: true });
    act(() => surface().querySelector('button')!.dispatchEvent(plainPress));
    expect(plainPress.defaultPrevented).toBe(false);
    expect(surface().querySelector('button')!.className).toContain('bg-[color:var(--ou-accent-soft)]');
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

});
