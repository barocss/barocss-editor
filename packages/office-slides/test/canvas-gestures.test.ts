import { act, createElement, createRef } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Stage, type StageProps } from '../src/stage';

const board = { sid: 'slide-a', label: 'First slide', x: 100, y: 200, width: 1280, height: 720 };
const bounds = { x: 100, y: 80, left: 100, top: 80, right: 1100, bottom: 730, width: 1000, height: 650, toJSON() {} };
let root: Root;
let container: HTMLDivElement;
let owner: HTMLDivElement;
let overlay: HTMLDivElement;
let panel: HTMLDivElement;
let props: StageProps;
const pointer = (target: EventTarget, type: string, x: number, y: number, button = 0) => {
  const event = new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, button });
  act(() => { target.dispatchEvent(event); });
  return event;
};
const wheel = (target: EventTarget, ctrlKey = false) => {
  const event = new WheelEvent('wheel', { bubbles: true, cancelable: true, clientX: 400, clientY: 300, deltaX: 20, deltaY: 30, ctrlKey });
  act(() => { target.dispatchEvent(event); });
  return event;
};
const stage = () => container.querySelector<HTMLDivElement>('.sl-stage')!;
const label = () => container.querySelector<HTMLButtonElement>('[data-board-label]')!;
const camera = () => container.querySelector<HTMLElement>('.sl-stage-frame')!.style.transform;
const render = (changes: Partial<StageProps> = {}) => {
  props = { ...props, ...changes };
  act(() => { root.render(createElement(Stage, props)); });
};

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} unobserve() {} });
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue(bounds);
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(1000);
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(650);
  owner = document.createElement('div');
  container = document.createElement('div');
  overlay = document.createElement('div');
  overlay.className = 'sl-overlay';
  panel = document.createElement('div');
  panel.className = 'floating-panel';
  owner.append(container, overlay, panel);
  document.body.append(owner);
  root = createRoot(container);
  props = { host: createRef<HTMLDivElement>(), boards: [board], zoom: 0.5, editable: true,
    lifetimeKey: 'document-1', interactionRoot: { current: owner }, onMoveSlide: vi.fn(), onZoom: vi.fn() };
  render();
});
afterEach(() => {
  act(() => { root.unmount(); });
  pointer(window, 'pointercancel', 0, 0);
  owner.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('freeboard camera ownership', () => {
  it('pans the Stage and its owned overlay, while leaving floating controls and inputs alone', () => {
    const initial = camera();
    expect(wheel(panel).defaultPrevented).toBe(false);
    expect(camera()).toBe(initial);
    const input = document.createElement('textarea');
    stage().append(input);
    expect(wheel(input).defaultPrevented).toBe(false);
    expect(camera()).toBe(initial);
    const native = document.createElement('div');
    native.contentEditable = 'true';
    native.className = 'w-document';
    stage().append(native);
    expect(wheel(native).defaultPrevented).toBe(true);
    expect(camera()).not.toBe(initial);
    const moved = camera();
    expect(wheel(overlay).defaultPrevented).toBe(true);
    expect(camera()).not.toBe(moved);
  });

  it('does not claim an unrelated overlay or an already consumed event', () => {
    const initial = camera();
    const other = document.createElement('div');
    other.className = 'sl-overlay';
    document.body.append(other);
    expect(wheel(other).defaultPrevented).toBe(false);
    other.remove();
    const consume = (event: Event) => event.preventDefault();
    stage().addEventListener('wheel', consume);
    wheel(stage());
    expect(camera()).toBe(initial);
    stage().removeEventListener('wheel', consume);
    render({ interactionRoot: undefined });
    expect(wheel(overlay).defaultPrevented).toBe(false);
    expect(wheel(stage()).defaultPrevented).toBe(true);
  });

  it('zooms only from the owned canvas', () => {
    wheel(panel, true);
    expect(props.onZoom).not.toHaveBeenCalled();
    wheel(overlay, true);
    expect(props.onZoom).toHaveBeenCalledWith(0.5 * Math.exp(-30 * 0.002));
  });

  it('middle-button and Space drags pan the canvas, but not floating controls', () => {
    const initial = camera();
    pointer(panel, 'pointerdown', 300, 300, 1);
    pointer(window, 'pointermove', 340, 320, 1);
    pointer(window, 'pointerup', 340, 320, 1);
    expect(camera()).toBe(initial);
    pointer(overlay, 'pointerdown', 300, 300, 1);
    pointer(window, 'pointermove', 340, 320, 1);
    pointer(window, 'pointerup', 340, 320, 1);
    expect(camera()).not.toBe(initial);
    const moved = camera();
    act(() => { document.body.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space', bubbles: true, cancelable: true })); });
    pointer(panel, 'pointerdown', 300, 300);
    pointer(window, 'pointermove', 340, 320);
    pointer(window, 'pointerup', 340, 320);
    expect(camera()).toBe(moved);
    pointer(stage(), 'pointerdown', 300, 300);
    pointer(window, 'pointermove', 340, 320);
    pointer(window, 'pointerup', 340, 320);
    expect(camera()).not.toBe(moved);
    act(() => { window.dispatchEvent(new KeyboardEvent('keyup', { code: 'Space' })); });
  });

  it.each(['hidden', 'inert', 'aria-hidden'])('ignores a Stage under %s and cancels an existing pan', async attribute => {
    pointer(overlay, 'pointerdown', 300, 300, 1);
    await act(async () => { owner.setAttribute(attribute, attribute === 'aria-hidden' ? 'true' : ''); });
    const initial = camera();
    expect(wheel(stage()).defaultPrevented).toBe(false);
    pointer(window, 'pointermove', 350, 350, 1);
    expect(camera()).toBe(initial);
    await act(async () => { owner.removeAttribute(attribute); });
    pointer(window, 'pointermove', 390, 390, 1);
    pointer(window, 'pointerup', 390, 390, 1);
    expect(camera()).toBe(initial);
  });
});

describe('board title drag authority and lifetime', () => {
  it('commits a real drag in board coordinates, but never a title click', () => {
    pointer(label(), 'pointerdown', 300, 300);
    pointer(window, 'pointerup', 300, 300);
    expect(props.onMoveSlide).not.toHaveBeenCalled();
    pointer(label(), 'pointerdown', 300, 300);
    pointer(window, 'pointermove', 340, 320);
    expect(label().style.left).toBe('90px');
    pointer(window, 'pointerup', 340, 320);
    expect(props.onMoveSlide).toHaveBeenCalledTimes(1);
    expect(props.onMoveSlide).toHaveBeenCalledWith('slide-a', 180, 240);
    expect(label().style.left).toBe('50px');
  });

  it('keeps viewer selection available without a position preview or write', () => {
    const activate = vi.fn();
    render({ editable: false, onActivateSlide: activate });
    expect(label().title).toBe('슬라이드 선택');
    expect(container.querySelector('.sl-canvas-help')?.textContent).not.toContain('배치 이동');
    pointer(label(), 'pointerdown', 300, 300);
    pointer(window, 'pointermove', 340, 320);
    expect(activate).toHaveBeenCalledWith('slide-a');
    expect(label().style.left).toBe('50px');
    pointer(window, 'pointerup', 340, 320);
    expect(props.onMoveSlide).not.toHaveBeenCalled();
    const before = camera();
    wheel(stage());
    expect(camera()).not.toBe(before);
  });

  it.each(['authority', 'document', 'position'])('cancels the preview when %s changes and never revives the old drag', change => {
    pointer(label(), 'pointerdown', 300, 300);
    pointer(window, 'pointermove', 340, 320);
    expect(label().style.left).toBe('90px');
    if (change === 'authority') { render({ editable: false }); render({ editable: true }); }
    if (change === 'document') render({ lifetimeKey: { sid: 'same-root-id' } });
    if (change === 'position') render({ boards: [{ ...board, x: 400 }] });
    pointer(window, 'pointermove', 360, 350);
    pointer(window, 'pointerup', 360, 350);
    expect(props.onMoveSlide).not.toHaveBeenCalled();
    expect(label().style.left).toBe(change === 'position' ? '200px' : '50px');
  });

  it('cancels a board drag when its owner is hidden then shown', async () => {
    pointer(label(), 'pointerdown', 300, 300);
    pointer(window, 'pointermove', 340, 320);
    await act(async () => { owner.hidden = true; owner.hidden = false; });
    expect(label().style.left).toBe('50px');
    pointer(window, 'pointerup', 340, 320);
    expect(props.onMoveSlide).not.toHaveBeenCalled();
  });

  it.each(['Escape', 'pointercancel'])('abandons a position preview on %s', reason => {
    pointer(label(), 'pointerdown', 300, 300);
    pointer(window, 'pointermove', 340, 320);
    if (reason === 'Escape') act(() => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); });
    else pointer(window, 'pointercancel', 340, 320);
    pointer(window, 'pointerup', 340, 320);
    expect(label().style.left).toBe('50px');
    expect(props.onMoveSlide).not.toHaveBeenCalled();
  });

  it('does not commit a drag after Stage unmounts', () => {
    pointer(label(), 'pointerdown', 300, 300);
    pointer(window, 'pointermove', 340, 320);
    act(() => { root.render(null); });
    pointer(window, 'pointerup', 340, 320);
    expect(props.onMoveSlide).not.toHaveBeenCalled();
  });
});
