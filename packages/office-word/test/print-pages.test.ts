import { afterEach, describe, expect, it, vi } from 'vitest';
import { createPrintPages } from '../src/print-pages';

afterEach(() => { vi.restoreAllMocks(); document.body.replaceChildren(); });
function bounds(el: Element, top: number, height: number, left = 0, width = 600) {
  return vi.spyOn(el, 'getBoundingClientRect').mockReturnValue({ x: left, y: top, top, bottom: top + height,
    left, right: left + width, width, height, toJSON: () => ({}) });
}
function fixture() {
  const source = document.createElement('div'); source.className = 'w-document';
  source.innerHTML = `<section class="w-surface" style="position:relative;display:flex;flex-direction:column;width:600px">
    <div class="w-sheets" style="position:absolute;inset:0"><div class="w-sheet" data-page="1"></div><div class="w-sheet" data-page="2"></div>
    <div class="w-footer" style="position:absolute;top:780px;transform:translateY(-100%)">Footer one</div>
    <div class="w-footer" style="position:absolute;top:1600px;transform:translateY(-100%)">Footer two</div>
    <div class="w-line-numbers"><span class="w-line-number" style="position:absolute;top:900px">9</span></div></div>
    <p id="first" class="w-paragraph" style="margin:20px 0">FIRST<span id="nested"> text</span></p>
    <p id="seam" class="w-paragraph">Complete seam paragraph</p>
    <table id="table"><colgroup><col style="width:200px"></colgroup><tbody><tr><td rowspan="2">Merged</td></tr><tr></tr></tbody></table>
    <ol id="last" class="w-list"><li>Last item</li></ol></section>`;
  document.body.append(source);
  bounds(source, 0, 1620); bounds(source.querySelector('.w-surface')!, 0, 1620);
  bounds(source.querySelector('.w-sheets')!, 0, 1620);
  [...source.querySelectorAll('.w-sheet')].forEach((sheet, i) => bounds(sheet, i * 820, 800));
  [...source.querySelectorAll('.w-footer')].forEach((footer, i) => bounds(footer, 760 + i * 820, 20));
  bounds(source.querySelector('.w-line-numbers')!, 0, 0, 0, 0);
  bounds(source.querySelector('.w-line-number')!, 900, 15, 0, 20);
  bounds(source.querySelector('#first')!, 100, 30, 60, 480);
  bounds(source.querySelector('#nested')!, 100, 20, 110, 30);
  bounds(source.querySelector('#seam')!, 750, 130, 60, 480);
  bounds(source.querySelector('#table')!, 780, 150, 60, 480);
  bounds(source.querySelector('#last')!, 1000, 40, 60, 480);
  return source;
}

describe('page-local complete paint projections', () => {
  it('copies only intersecting complete blocks and each page furniture, without cloning the whole source', () => {
    const source = fixture(); const original = source.innerHTML;
    const clone = vi.spyOn(source, 'cloneNode');
    const printer = createPrintPages(() => source);
    expect(printer.build()).toBe(2);
    const pages = [...document.querySelectorAll('.w-print-page')];
    expect(pages[0].textContent).toContain('FIRST');
    expect(pages[0].textContent).not.toContain('Last item');
    expect(pages[1].textContent).not.toContain('FIRST');
    expect(pages[1].textContent).toContain('Last item');
    for (const page of pages) {
      expect(page.textContent).toContain('Complete seam paragraph');
      expect(page.querySelector('table colgroup col')).not.toBeNull();
      expect(page.querySelector('td')?.getAttribute('rowspan')).toBe('2');
    }
    expect(pages[0].querySelector('.w-footer')?.textContent).toBe('Footer one');
    expect(pages[1].querySelector('.w-footer')?.textContent).toBe('Footer two');
    expect(pages[0].querySelector('.w-line-number')).toBeNull();
    expect(pages[1].querySelector('.w-line-number')?.textContent).toBe('9');
    expect(clone.mock.calls.every(([deep]) => deep === false)).toBe(true);
    const ids = [...document.querySelectorAll('[id]')].map(element => element.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(source.innerHTML).toBe(original);
  });

  it('keeps static containing blocks and positioned furniture transforms intact', () => {
    const source = fixture(); createPrintPages(() => source).build();
    const second = document.querySelectorAll('.w-print-page')[1];
    const paragraph = second.querySelector<HTMLElement>('.w-paragraph')!;
    expect(paragraph.style.position).not.toBe('absolute');
    const footer = second.querySelector<HTMLElement>('.w-footer')!;
    expect(footer.style.top).toBe('1600px');
    expect(footer.style.transform).toBe('translateY(-100%)');
    expect(second.querySelector<HTMLElement>('.w-print-copy')?.style.top).toBe('-820px');
  });

  it('includes descendant paint outside a short paragraph and reads each source box once', () => {
    const source = fixture(); const paragraph = source.querySelector('#first')!;
    const image = document.createElement('img'); image.style.cssText = 'position:absolute;top:900px'; paragraph.append(image);
    const measured = bounds(image, 900, 40, 100, 40);
    createPrintPages(() => source).build();
    expect(document.querySelectorAll('.w-print-page')[1].querySelector('img')).not.toBeNull();
    expect(measured).toHaveBeenCalledTimes(1);
  });

  it('normalizes source ancestor zoom rather than shrinking print paper', () => {
    const source = fixture();
    Object.defineProperty(source, 'offsetWidth', { value: 1200 }); // 600px viewport at 50% zoom.
    createPrintPages(() => source).build();
    const pages = [...document.querySelectorAll<HTMLElement>('.w-print-page')];
    expect(pages[0].style.width).toBe('1200px');
    expect(pages[0].style.height).toBe('1600px');
    expect(pages[1].querySelector<HTMLElement>('.w-print-copy')?.style.top).toBe('-1640px');
  });

  it('does not treat an integer-rounded offsetWidth as a fractional zoom', () => {
    const source = fixture(); source.style.width = '600.5px';
    bounds(source, 0, 1620, 0, 600.5);
    Object.defineProperty(source, 'offsetWidth', { value: 601 });
    createPrintPages(() => source).build();
    expect(document.querySelector<HTMLElement>('.w-print-page')?.style.width).toBe('600px');
    expect(document.querySelector<HTMLElement>('.w-print-copy')?.style.width).toBe('600.5px');
  });

  it('remaps SVG paint references and labels to unique print IDs', () => {
    const source = fixture(); const paragraph = source.querySelector('#seam')!;
    paragraph.innerHTML = '<svg><defs><clipPath id="clip"><rect width="10" height="10"/></clipPath></defs><rect clip-path="url(#clip)" aria-labelledby="label"/><text id="label">Drawing</text></svg>';
    createPrintPages(() => source).build();
    for (const paper of document.querySelectorAll('.w-print-page')) {
      const clipping = paper.querySelector('clipPath')!, rectangle = paper.querySelector('rect[clip-path]')!;
      expect(rectangle.getAttribute('clip-path')).toBe(`url(#${clipping.id})`);
      expect(rectangle.getAttribute('aria-labelledby')).toBe(paper.querySelector('svg text')!.id);
    }
    const ids = [...document.querySelectorAll('[id]')].map(el => el.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('preserves external fragment references when a projection has no local IDs', () => {
    const source = fixture();
    source.querySelector('#seam')!.innerHTML = '<a href="#external" aria-describedby="external-note" data-paint="url(#external)">External reference</a>';
    source.querySelectorAll('[id]').forEach(el => el.removeAttribute('id'));
    createPrintPages(() => source).build();
    for (const paper of document.querySelectorAll('.w-print-page')) {
      const link = paper.querySelector('a')!;
      expect(link.getAttribute('href')).toBe('#external');
      expect(link.getAttribute('aria-describedby')).toBe('external-note');
      expect(link.getAttribute('data-paint')).toBe('url(#external)');
    }
  });

  it('remaps root, duplicate, label and namespaced SVG references without changing external targets', () => {
    const source = fixture(); source.id = 'root-label';
    source.querySelector('#seam')!.innerHTML = `<label for="control">Control</label><input id="control"><span id="control">Duplicate</span>
      <a href="#control" aria-labelledby="root-label control external-label" aria-describedby="control" headers="control external-header"
        data-paint="url('#control') url(#external)">Reference</a><svg><use xlink:href="#control"/></svg>`;
    createPrintPages(() => source).build();
    const printedIds: string[] = [];
    for (const paper of document.querySelectorAll('.w-print-page')) {
      const input = paper.querySelector('input')!, link = paper.querySelector('a')!;
      const copy = paper.querySelector('.w-print-copy')!;
      expect(paper.querySelector('label')!.getAttribute('for')).toBe(input.id);
      expect(link.getAttribute('href')).toBe(`#${input.id}`);
      expect(link.getAttribute('aria-labelledby')).toBe(`${copy.id} ${input.id} external-label`);
      expect(link.getAttribute('aria-describedby')).toBe(input.id);
      expect(link.getAttribute('headers')).toBe(`${input.id} external-header`);
      expect(link.getAttribute('data-paint')).toBe(`url(#${input.id}) url(#external)`);
      expect(paper.querySelector('use')!.getAttribute('xlink:href')).toBe(`#${input.id}`);
      expect(input.id).not.toBe(paper.querySelector('span[id]')!.id);
      printedIds.push(...[...paper.querySelectorAll('[id]')].map(el => el.id));
    }
    expect(new Set(printedIds).size).toBe(printedIds.length);
    expect(source.id).toBe('root-label');
    expect(source.querySelectorAll('#control')).toHaveLength(2);
  });

  it.each(['1.5', '24px'])('preserves computed line-height %s semantics for smaller page furniture', (lineHeight) => {
    const source = fixture();
    // CSSOM getComputedStyle resolves line-height to pixels. Typed computed
    // values retain the inherited number that scales with furniture font-size.
    for (const element of [source, source.querySelector('.w-surface')!]) {
      Object.defineProperty(element, 'computedStyleMap', { value: () => ({
        get: (name: string) => name === 'line-height' ? { toString: () => lineHeight } : undefined
      }) });
    }
    createPrintPages(() => source).build();
    expect(document.querySelector<HTMLElement>('.w-print-copy')?.style.lineHeight).toBe(lineHeight);
    expect(document.querySelector<HTMLElement>('.w-print-copy .w-surface')?.style.lineHeight).toBe(lineHeight);
  });

  it('reads each direct surface once while preserving inherited and fixed line-height across sections', () => {
    const source = fixture(); source.style.lineHeight = '1.5';
    const first = source.querySelector<HTMLElement>('.w-surface')!;
    const nested = document.createElement('span'); nested.className = 'w-surface';
    nested.style.lineHeight = '2.25'; nested.textContent = 'Nested text';
    source.querySelector('#first')!.append(nested); bounds(nested, 100, 10, 100, 60);
    const second = document.createElement('section'); second.className = 'w-surface';
    second.style.lineHeight = '24px';
    second.innerHTML = '<div class="w-sheets"><div class="w-sheet" data-page="3"></div></div><p>Second section</p>';
    source.append(second);
    bounds(source, 0, 2440); bounds(second, 1640, 800);
    bounds(second.querySelector('.w-sheets')!, 1640, 800);
    bounds(second.querySelector('.w-sheet')!, 1640, 800);
    bounds(second.querySelector('p')!, 1700, 30, 60, 480);
    const typedReads: Element[] = [];
    const boundaries = new Set<Element>([source, first, second]);
    for (const element of [source, ...source.querySelectorAll('*')]) {
      Object.defineProperty(element, 'computedStyleMap', { value: () => {
        typedReads.push(element);
        return { get: () => ({ toString: () => element === second ? '24px' : boundaries.has(element) ? '1.5' : '999px' }) };
      } });
    }
    const original = source.outerHTML;
    const printer = createPrintPages(() => source);
    expect(printer.build()).toBe(3);
    const pages = [...document.querySelectorAll<HTMLElement>('.w-print-page')];
    expect(pages.map(page => page.querySelector<HTMLElement>('.w-print-copy')!.style.lineHeight)).toEqual(['1.5', '1.5', '1.5']);
    expect(pages.map(page => page.querySelector<HTMLElement>('.w-print-copy > .w-surface')!.style.lineHeight)).toEqual(['1.5', '1.5', '24px']);
    expect(pages[0].querySelector<HTMLElement>('.w-surface .w-surface')!.style.lineHeight).toBe('2.25');
    expect(pages[2].textContent).toContain('Second section');
    expect(typedReads.filter(element => !boundaries.has(element))).toHaveLength(0);
    for (const boundary of boundaries) expect(typedReads.filter(element => element === boundary)).toHaveLength(1);
    expect(source.outerHTML).toBe(original);
    printer.clear();
    expect(document.querySelector('.w-print-pages')).toBeNull();
  });

  it('reads typed line-height only at inherited print boundaries without changing complete paint', () => {
    const source = fixture();
    source.style.setProperty('--print-probe', 'preserved');
    source.style.lineHeight = '1.5';
    const surface = source.querySelector<HTMLElement>('.w-surface')!;
    const image = document.createElement('img'); image.alt = 'Overflow paint';
    source.querySelector('#first')!.append(image);
    bounds(image, 900, 40, 100, 40);
    const hidden = document.createElement('p'); hidden.style.display = 'none';
    hidden.innerHTML = '<span>HIDDEN PAINT</span>'; surface.append(hidden);
    bounds(hidden, 950, 40); bounds(hidden.firstElementChild!, 960, 20);
    const typedReads: Element[] = [];
    // jsdom has no native Typed OM. This pass-through-to-value shim measures
    // production lookup work only; it does not count native allocations/bytes.
    for (const element of [source, ...source.querySelectorAll('*')]) {
      Object.defineProperty(element, 'computedStyleMap', { configurable: true, value: () => {
        typedReads.push(element);
        return { get: (name: string) => name === 'line-height' ? { toString: () => '1.5' } : undefined };
      } });
    }
    const text = source.querySelector('#first')!.firstChild!;
    const range = document.createRange(); range.setStart(text, 1); range.setEnd(text, 4);
    const selection = getSelection()!; selection.removeAllRanges(); selection.addRange(range);
    const original = source.outerHTML;
    const printer = createPrintPages(() => source);
    expect(printer.build()).toBe(2);
    const pages = [...document.querySelectorAll<HTMLElement>('.w-print-page')];
    for (const page of pages) {
      expect(page.querySelector('img')?.getAttribute('alt')).toBe('Overflow paint');
      expect(page.textContent).toContain('Complete seam paragraph');
      expect(page.textContent).not.toContain('HIDDEN PAINT');
      expect(page.querySelector<HTMLElement>('.w-print-copy')?.style.lineHeight).toBe('1.5');
      expect(page.querySelector<HTMLElement>('.w-surface')?.style.lineHeight).toBe('1.5');
      expect(page.querySelector<HTMLElement>('.w-print-copy')?.style.getPropertyValue('--print-probe')).toBe('preserved');
    }
    expect(pages[1].querySelector<HTMLElement>('.w-print-copy')?.style.top).toBe('-820px');
    expect(pages[0].querySelector<HTMLElement>('.w-footer')?.style.transform).toBe('translateY(-100%)');
    expect(source.outerHTML).toBe(original);
    expect(selection.anchorNode).toBe(text); expect(selection.anchorOffset).toBe(1);
    expect(selection.focusNode).toBe(text); expect(selection.focusOffset).toBe(4);
    const projection = pages.map(page => page.outerHTML.replace(/word-print-\d+-/g, 'word-print-INSTANCE-'));
    printer.clear();
    expect(document.querySelector('.w-print-pages')).toBeNull();
    const boundaries = new Set<Element>([source, surface]);
    const redundant = typedReads.filter(element => !boundaries.has(element));
    console.info('PRINT_TYPEDOM_PROOF', JSON.stringify({ typedOMShim: true, typedReads: typedReads.length,
      redundantReads: redundant.length, descendantReads: redundant.map(el => el.tagName), projection }));
    expect(redundant, 'descendant typed line-height is never consumed by print inheritance').toHaveLength(0);
    expect(typedReads.filter(el => el === source)).toHaveLength(1);
    expect(typedReads.filter(el => el === surface)).toHaveLength(1);
  });
});
