// @vitest-environment jsdom
import { act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SidePeek } from '../src/side-peek';
import { FloatingSurface } from '../src/floating';

let root: Root;
let container: HTMLDivElement;
const outsideClick = vi.fn();
const pane = () => document.querySelector<HTMLElement>('[data-side-peek]')!;
const button = (label: string) => document.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)!;
const tick = () => new Promise(resolve => setTimeout(resolve, 0));
function Example() {
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  return <>
    <button aria-label="항목 열기" onClick={() => setOpen(true)}>항목 열기</button>
    <button aria-label="다른 행 선택" onClick={outsideClick}>다른 행 선택</button>
    <SidePeek open={open} onOpenChange={setOpen} title="실행 계획" breadcrumb="제품 / 실행 계획"
      expanded={expanded} onExpandedChange={setExpanded}>
      <input aria-label="항목 제목" defaultValue="실행 계획" />
      <p>항목의 본문</p>
    </SidePeek>
  </>;
}
async function open() {
  await act(async () => { root.render(<Example />); });
  await act(async () => { button('항목 열기').focus(); button('항목 열기').click(); });
  // Radix installs its document pointer handler on the next task to exclude the opening press.
  await act(async () => { await tick(); });
}
function press(target: Element, key: string) {
  act(() => { target.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true })); });
}
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.stubGlobal('innerWidth', 1200);
  outsideClick.mockClear();
  container = document.createElement('div'); document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => { root.unmount(); await tick(); });
  document.body.replaceChildren(); vi.restoreAllMocks(); vi.unstubAllGlobals();
});

describe('SidePeek keeps the collection and its item usable together', () => {
  it('opens an accessible page without a modal overlay, inert background or scroll lock', async () => {
    await open();
    expect(pane().getAttribute('role')).toBe('dialog');
    expect(document.getElementById(pane().getAttribute('aria-labelledby')!)?.textContent).toBe('실행 계획');
    expect(pane().getAttribute('aria-modal')).not.toBe('true');
    expect(container.closest('[inert],[aria-hidden="true"]')).toBeNull();
    expect(document.querySelector('[data-radix-dialog-overlay]')).toBeNull();
    expect([...document.querySelectorAll('[data-state="open"]')]).toEqual([pane()]);
    expect(document.body.style.pointerEvents).not.toBe('none');
    expect(document.body.getAttribute('data-scroll-locked')).toBeNull();
    expect(document.activeElement).toBe(pane());
  });

  it('allows background interaction and focus without closing the item', async () => {
    await open();
    const other = button('다른 행 선택');
    act(() => {
      other.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, cancelable: true, button: 0 }));
      other.focus(); other.click();
    });
    expect(outsideClick).toHaveBeenCalledOnce();
    expect(document.activeElement).toBe(other);
    expect(pane()).not.toBeNull();
    expect(pane().textContent).toContain('항목의 본문');
  });

  it('closes with Escape and restores focus to the row that opened it', async () => {
    await open();
    const close = button('닫기');
    act(() => close.focus());
    press(close, 'Escape');
    await act(async () => { await tick(); });
    expect(pane()).toBeNull();
    expect(document.activeElement).toBe(button('항목 열기'));
  });

  it('resizes from the keyboard within bounds and preserves content and width across expansion', async () => {
    await open();
    let resize = pane().querySelector<HTMLElement>('[role="separator"]')!;
    expect(resize.getAttribute('aria-orientation')).toBe('vertical');
    expect(resize.getAttribute('aria-valuenow')).toBe('680');
    press(resize, 'ArrowLeft');
    expect(resize.getAttribute('aria-valuenow')).toBe('720');
    for (let count = 0; count < 30; count++) press(resize, 'ArrowRight');
    expect(resize.getAttribute('aria-valuenow')).toBe(resize.getAttribute('aria-valuemin'));
    for (let count = 0; count < 30; count++) press(resize, 'ArrowLeft');
    expect(resize.getAttribute('aria-valuenow')).toBe(resize.getAttribute('aria-valuemax'));
    const widthBefore = pane().style.width;
    const field = pane().querySelector<HTMLInputElement>('input')!;
    field.value = '작성 중인 제목';
    act(() => button('전체 너비로 보기').click());
    expect(pane().dataset.expanded).toBe('true');
    expect(pane().style.width).toBe('100vw');
    expect(pane().querySelector('[role="separator"]')).toBeNull();
    expect(pane().querySelector('input')).toBe(field);
    expect(field.value).toBe('작성 중인 제목');
    act(() => button('옆으로 보기').click());
    expect(pane().hasAttribute('data-expanded')).toBe(false);
    expect(pane().style.width).toBe(widthBefore);
    resize = pane().querySelector<HTMLElement>('[role="separator"]')!;
    expect(resize.getAttribute('aria-valuenow')).toBe(resize.getAttribute('aria-valuemax'));
    expect(field.value).toBe('작성 중인 제목');
  });
  it('fits a narrow desktop and adapts to viewport changes and mobile full width', async () => {
    vi.stubGlobal('innerWidth', 700);
    await open();
    const resize = pane().querySelector<HTMLElement>('[role="separator"]')!;
    expect(pane().style.width).toBe('620px');
    expect(resize.getAttribute('aria-valuemax')).toBe('620');
    expect(resize.getAttribute('aria-valuenow')).toBe('620');
    act(() => { vi.stubGlobal('innerWidth', 640); window.dispatchEvent(new Event('resize')); });
    expect(pane().style.width).toBe('560px');
    expect(resize.getAttribute('aria-valuemax')).toBe('560');
    expect(resize.getAttribute('aria-valuenow')).toBe('560');
    act(() => { vi.stubGlobal('innerWidth', 390); window.dispatchEvent(new Event('resize')); });
    expect(pane().style.width).toBe('390px');
    expect(pane().hasAttribute('data-expanded')).toBe(false);
    // Returning to a wider desktop restores the preferred width rather than the temporary clamp.
    act(() => { vi.stubGlobal('innerWidth', 1200); window.dispatchEvent(new Event('resize')); });
    expect(pane().style.width).toBe('680px');
    expect(resize.getAttribute('aria-valuenow')).toBe('680');
  });

  it.each(['input', 'textarea', 'contenteditable'])('leaves Escape to the active %s editor without closing the page', async kind => {
    await open();
    const field = document.createElement(kind === 'input' ? 'input' : kind === 'textarea' ? 'textarea' : 'div');
    if (kind === 'contenteditable') { field.setAttribute('contenteditable', 'true'); field.tabIndex = 0; }
    const handled = vi.fn();
    field.addEventListener('keydown', event => { if ((event as KeyboardEvent).key === 'Escape') handled(); });
    pane().append(field);
    act(() => field.focus());
    press(field, 'Escape');
    await act(async () => { await tick(); });
    expect(handled).toHaveBeenCalledOnce();
    expect(pane()).not.toBeNull();
  });

  it.each(['button', 'input'])('closes a portalled property popup from its %s before its containing item page', async kind => {
    vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
    function Layers() {
      const [open, setOpen] = useState(false), [popup, setPopup] = useState(false);
      return <>
        <button aria-label="항목 열기" onClick={() => setOpen(true)}>Open</button>
        <SidePeek open={open} onOpenChange={setOpen} title="Item"><button aria-label="필드 설정" onClick={() => setPopup(true)}>Field</button></SidePeek>
        {popup && <FloatingSurface open at={new DOMRect(800, 100, 80, 30)} variant="panel" role="dialog" aria-label="필드 편집" onDismiss={() => setPopup(false)}>
          <button aria-label="필드 유형 선택">Type</button><input aria-label="필드 이름" />
        </FloatingSurface>}
      </>;
    }
    await act(async () => { root.render(<Layers />); });
    await act(async () => { button('항목 열기').focus(); button('항목 열기').click(); });
    await act(async () => { await tick(); button('필드 설정').click(); });
    const target = kind === 'button' ? button('필드 유형 선택') : document.querySelector<HTMLInputElement>('input[aria-label="필드 이름"]')!;
    act(() => target.focus());
    press(target, 'Escape');
    await act(async () => { await tick(); });
    expect(pane()).not.toBeNull();
    expect(document.querySelector('[data-floating-surface]')).toBeNull();
    act(() => button('닫기').focus());
    press(button('닫기'), 'Escape');
    await act(async () => { await tick(); });
    expect(pane()).toBeNull();
    expect(document.activeElement).toBe(button('항목 열기'));
  });

});
