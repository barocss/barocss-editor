import { afterEach, expect, it, vi } from 'vitest';
import { createPrintPages } from '../src/print-pages';

const cleanups: (() => void)[] = [];

afterEach(() => {
  for (const cleanup of cleanups.splice(0).reverse()) cleanup();
  vi.restoreAllMocks();
  document.getSelection()?.removeAllRanges();
  document.body.replaceChildren();
});

function rect(element: HTMLElement, top: number, height: number): void {
  vi.spyOn(element, 'getBoundingClientRect').mockReturnValue({
    x: 0, y: top, left: 0, right: 600, top, bottom: top + height,
    width: 600, height, toJSON: () => ({})
  });
}

function sourceDocument(text = 'Original text'): HTMLElement {
  const source = document.createElement('div');
  source.className = 'w-document';
  source.innerHTML = `<section class="w-surface"><div class="w-sheets"><div class="w-sheet"></div></div><p class="w-paragraph">${text}</p><p class="w-paragraph">Second paragraph</p></section>`;
  document.body.append(source);
  rect(source, 0, 800);
  rect(source.querySelector<HTMLElement>('.w-surface')!, 0, 800);
  rect(source.querySelector<HTMLElement>('.w-sheets')!, 0, 800);
  rect(source.querySelector<HTMLElement>('.w-sheet')!, 0, 800);
  source.querySelectorAll<HTMLElement>('.w-paragraph').forEach((paragraph, index) => rect(paragraph, 60 + index * 40, 30));
  return source;
}

it('keeps a prepared inactive editor out of browser printing until it becomes active', () => {
  const source = sourceDocument();
  const before = source.innerHTML;
  let active = false;
  const restore = vi.fn(), prepare = vi.fn(() => restore);
  const printer = createPrintPages(() => source, document, { isActive: () => active, prepare });
  cleanups.push(printer.attach());

  window.dispatchEvent(new Event('beforeprint'));
  expect(prepare).not.toHaveBeenCalled();
  expect(document.querySelector('.w-print-pages')).toBeNull();
  expect(source.innerHTML).toBe(before);
  active = true;
  window.dispatchEvent(new Event('beforeprint'));
  expect(prepare).toHaveBeenCalledTimes(1);
  expect(restore).toHaveBeenCalledTimes(1);
  expect(document.querySelector('.w-print-page')?.textContent).toContain('Original text');
  expect(source.innerHTML).toBe(before);
  window.dispatchEvent(new Event('afterprint'));
  expect(document.querySelector('.w-print-pages')).toBeNull();
});

it('replaces only its own pages when built twice and clears repeatedly', () => {
  const firstSource = sourceDocument('First editor');
  const first = createPrintPages(() => firstSource);
  const secondSource = sourceDocument('Second editor');
  const second = createPrintPages(() => secondSource);
  cleanups.push(first.clear, second.clear);

  expect(first.build()).toBe(1);
  const firstContainer = document.querySelector('.w-print-pages');
  expect(second.build()).toBe(1);
  const secondContainer = [...document.querySelectorAll('.w-print-pages')].find((container) => container !== firstContainer);
  expect(firstContainer?.isConnected).toBe(true);
  expect(secondContainer?.textContent).toContain('Second editor');

  expect(first.build()).toBe(1);
  expect(firstContainer?.isConnected).toBe(false);
  expect(secondContainer?.isConnected).toBe(true);
  expect(document.querySelectorAll('.w-print-pages')).toHaveLength(2);
  first.clear();
  first.clear();
  expect(secondContainer?.isConnected).toBe(true);
  expect(document.querySelectorAll('.w-print-pages')).toHaveLength(1);
  second.clear();
  second.clear();
  expect(document.querySelector('.w-print-pages')).toBeNull();
});

it('keeps another printer output through inactive events and repeated detach', () => {
  const activeSource = sourceDocument('Active editor');
  const inactiveSource = sourceDocument('Inactive editor');
  let active = true;
  const prepare = vi.fn();
  const activePrinter = createPrintPages(() => activeSource, document, { isActive: () => active });
  const inactivePrinter = createPrintPages(() => inactiveSource, document, { isActive: () => false, prepare });
  const detachActive = activePrinter.attach();
  const detachInactive = inactivePrinter.attach();
  cleanups.push(detachActive, detachInactive);

  window.dispatchEvent(new Event('beforeprint'));
  const container = document.querySelector('.w-print-pages');
  expect(container?.textContent).toContain('Active editor');
  expect(prepare).not.toHaveBeenCalled();
  active = false;
  window.dispatchEvent(new Event('beforeprint'));
  expect(container?.isConnected).toBe(true);
  detachInactive();
  detachInactive();
  expect(container?.isConnected).toBe(true);
  detachActive();
  detachActive();
  expect(document.querySelector('.w-print-pages')).toBeNull();
  window.dispatchEvent(new Event('beforeprint'));
  expect(document.querySelector('.w-print-pages')).toBeNull();
});

it('clears its completed print after becoming inactive without clearing another printer', () => {
  const firstSource = sourceDocument('First editor');
  const secondSource = sourceDocument('Second editor');
  let active = true;
  const first = createPrintPages(() => firstSource, document, { isActive: () => active });
  const second = createPrintPages(() => secondSource);
  cleanups.push(first.attach(), second.clear);

  window.dispatchEvent(new Event('beforeprint'));
  const firstContainer = document.querySelector('.w-print-pages');
  expect(firstContainer?.textContent).toContain('First editor');
  active = false;
  expect(second.build()).toBe(1);
  const secondContainer = [...document.querySelectorAll('.w-print-pages')].find((container) => container !== firstContainer);
  expect(secondContainer?.textContent).toContain('Second editor');
  window.dispatchEvent(new Event('afterprint'));
  expect(firstContainer?.isConnected).toBe(false);
  expect(secondContainer?.isConnected).toBe(true);
  expect(document.querySelectorAll('.w-print-pages')).toHaveLength(1);
});

it('restores prepared state exactly once when building throws during beforeprint', () => {
  const failure = new Error('Source is unavailable after prepare');
  const restore = vi.fn();
  const prepare = vi.fn(() => restore);
  const printer = createPrintPages(() => { throw failure; }, document, { prepare });
  cleanups.push(printer.attach());
  const errors: unknown[] = [];
  const onError = (event: ErrorEvent) => { errors.push(event.error); event.preventDefault(); };
  window.addEventListener('error', onError);
  try {
    window.dispatchEvent(new Event('beforeprint'));
    expect(errors).toEqual([failure]);
    expect(prepare).toHaveBeenCalledTimes(1);
    expect(restore).toHaveBeenCalledTimes(1);
    expect(document.querySelector('.w-print-pages')).toBeNull();
    window.dispatchEvent(new Event('afterprint'));
    expect(restore).toHaveBeenCalledTimes(1);
  } finally {
    window.removeEventListener('error', onError);
  }
});

it('leaves no partial pages and preserves source and selection when a later content clone fails', () => {
  const source = sourceDocument();
  const paragraphs = [...source.querySelectorAll('p')];
  const range = document.createRange();
  range.setStart(paragraphs[0].firstChild!, 2);
  range.setEnd(paragraphs[0].firstChild!, 8);
  const selection = document.getSelection()!;
  selection.addRange(range);
  const before = source.innerHTML;
  const failure = new Error('Second paragraph clone failed');
  const firstClone = vi.spyOn(paragraphs[0], 'cloneNode');
  vi.spyOn(paragraphs[1], 'cloneNode').mockImplementation(() => { throw failure; });
  const printer = createPrintPages(() => source);
  cleanups.push(printer.clear);

  expect(() => printer.build()).toThrow(failure);
  expect(firstClone).toHaveBeenCalled();
  expect(document.querySelector('.w-print-pages')).toBeNull();
  expect(source.innerHTML).toBe(before);
  expect(selection.rangeCount).toBe(1);
  expect(selection.anchorNode).toBe(paragraphs[0].firstChild);
  expect(selection.anchorOffset).toBe(2);
  expect(selection.focusNode).toBe(paragraphs[0].firstChild);
  expect(selection.focusOffset).toBe(8);
  printer.clear();
  expect(source.isConnected).toBe(true);
});
