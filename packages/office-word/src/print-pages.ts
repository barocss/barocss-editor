/**
 * Turning the paginated flow into pages, for printing.
 *
 * The document on screen is one continuous flow with sheets drawn behind it.
 * That is right for reading and editing — the text is one thing, and a caret
 * moves through it — but paper is not continuous, and a browser asked to
 * paginate it a second time disagrees with the layout that was already
 * measured. It especially cannot be told to break *inside* a paragraph, which
 * is where three of this document's pages begin.
 *
 * So printing does not describe the pages to the browser. It builds them.
 *
 * Each page is a box the size of a sheet with its intersecting complete paint
 * blocks inside it, shifted so exactly that sheet's worth shows through. The
 * text is never cut: a paragraph crossing a boundary appears in both pages, the
 * top of it in one and the bottom in the other, which is what a paragraph
 * crossing a page boundary looks like on paper. Line breaking is identical in
 * every copy because the width is, so the two halves meet exactly.
 *
 * Nothing about the document changes to do this. The copies exist only while
 * the print dialog is open, and they are copies — the model has one paragraph,
 * and the caret still lives in the one on screen. That is the whole reason this
 * is safe here and would not be on screen: two DOM copies of one node would be
 * two places to type into, and the input path reads text back out of the DOM.
 */
export interface PrintPages {
  /** Build the pages. Idempotent: building twice replaces the first set. */
  build(): number;
  /** Remove them. */
  clear(): void;
  /** Build and clear around the browser's own print, and stop doing so. */
  attach(): () => void;
}

const CONTAINER_CLASS = 'w-print-pages';
let printerSequence = 0;

type Box = { left: number; top: number; right: number; bottom: number; width: number; height: number };
type Snapshot = { box: Box; paint?: Box; style: CSSStyleDeclaration };
type Unit = { element: HTMLElement; surface?: HTMLElement; sheets: boolean };
const intersects = (a: Box, b: Box) => a.top < b.bottom && a.bottom > b.top && a.left < b.right && a.right > b.left;
const px = (value: string): number => parseFloat(value) || 0;
const usedWidth = (element: HTMLElement, style: CSSStyleDeclaration): number => {
  const width = parseFloat(style.width);
  if (!Number.isFinite(width)) return element.offsetWidth;
  return style.boxSizing === 'border-box' ? width : width + px(style.paddingLeft) + px(style.paddingRight) + px(style.borderLeftWidth) + px(style.borderRightWidth);
};

/** Read each source box once, including paint overflowing a block's own box. */
function snapshot(root: HTMLElement): Map<Element, Snapshot> {
  const result = new Map<Element, Snapshot>();
  const visit = (element: Element): Box | undefined => {
    const style = root.ownerDocument.defaultView!.getComputedStyle(element);
    const box = element.getBoundingClientRect();
    let paint: Box | undefined;
    if (style.display !== 'none') {
      if (box.width > 0 && box.height > 0) paint = box;
      for (const child of element.children) {
        const drawn = visit(child);
        if (!drawn) continue;
        if (!paint) paint = drawn;
        else {
          const left = Math.min(paint.left, drawn.left), top = Math.min(paint.top, drawn.top);
          const right = Math.max(paint.right, drawn.right), bottom = Math.max(paint.bottom, drawn.bottom);
          paint = { left, top, right, bottom, width: right - left, height: bottom - top };
        }
      }
    }
    result.set(element, { box, paint, style });
    return paint;
  };
  visit(root);
  return result;
}

/** Inherited type comes from the live host, which is not an ancestor of print pages. */
function inherit(copy: HTMLElement, style: CSSStyleDeclaration): void {
  for (const property of ['font-family', 'font-size', 'font-weight', 'font-style', 'font-stretch', 'font-variant',
    'line-height', 'letter-spacing', 'word-spacing', 'white-space', 'direction', 'writing-mode', 'color', 'text-align']) {
    copy.style.setProperty(property, style.getPropertyValue(property));
  }
  for (let i = 0; i < style.length; i++) {
    const property = style.item(i);
    if (property.startsWith('--')) copy.style.setProperty(property, style.getPropertyValue(property));
  }
}

/** Keep SVG paint references and labels valid without duplicating source IDs. */
function uniqueIds(root: HTMLElement, prefix: string): void {
  const elements = [root, ...root.querySelectorAll('*')];
  const ids = new Map<string, string>();
  let nextId = 0;
  for (const element of elements) {
    const id = element.getAttribute('id');
    if (id) { const replacement = `${prefix}-${nextId++}`; if (!ids.has(id)) ids.set(id, replacement); element.setAttribute('id', replacement); }
  }
  for (const element of elements) for (const attribute of [...element.attributes]) {
    if (attribute.name === 'id') continue;
    let value = attribute.value.replace(/url\(\s*['"]?#([^\s)'" ]+)['"]?\s*\)/g,
      (match, id: string) => ids.has(id) ? `url(#${ids.get(id)})` : match);
    if (['href', 'xlink:href'].includes(attribute.name) && value.startsWith('#') && ids.has(value.slice(1))) value = `#${ids.get(value.slice(1))}`;
    if (['for', 'headers', 'aria-labelledby', 'aria-describedby'].includes(attribute.name)) value = value.split(/\s+/).map(id => ids.get(id) ?? id).join(' ');
    if (value !== attribute.value) element.setAttribute(attribute.name, value);
  }
}

export interface PrintPagesOptions {
  /** Only the active native host can handle the browser's print events. */
  isActive?: () => boolean;
  /**
   * Put the document into a printable state, and hand back a way to undo it.
   *
   * What a reader is doing is not part of the document. Editing a header shows
   * the real node in place of the copy drawn on the first page and suppresses
   * the copies on every other page — which is right for editing, since several
   * copies of one node are the wrong thing to type into, and wrong for printing,
   * where it prints one header on one page and none on the rest. Word prints the
   * document whatever pane you happen to have open, and so does this.
   */
  prepare?: () => (() => void) | void;
}

export function createPrintPages(
  root: () => HTMLElement | null,
  document_: Document = document,
  options: PrintPagesOptions = {}
): PrintPages {
  const printerId = ++printerSequence;
  let output: HTMLElement | undefined;
  const clear = (): void => {
    output?.remove();
    output = undefined;
  };

  const build = (): number => {
    clear();
    const source = root();
    if (!source) return 0;

    const sheets = [...source.querySelectorAll<HTMLElement>('.w-sheet')];
    if (sheets.length === 0) return 0;

    // Offsets are taken against the element being copied. A sheet's position
    // inside its own section says nothing about where that section sits in the
    // flow, and a document with two sections has both.
    const measured = snapshot(source);
    const origin = measured.get(source)!;
    const width = usedWidth(source, origin.style);
    const scale = width > 0 && origin.box.width > 0 ? origin.box.width / width : 1;
    const units: Unit[] = [];
    for (const child of source.children) {
      if (child.matches('.w-surface')) {
        for (const block of child.children) {
          if (block.matches('.w-sheets')) {
            for (const drawing of block.children) units.push({ element: drawing as HTMLElement, surface: child as HTMLElement, sheets: true });
          } else units.push({ element: block as HTMLElement, surface: child as HTMLElement, sheets: false });
        }
      } else units.push({ element: child as HTMLElement, sheets: false });
    }
    // Page intervals are ordered once. Each unit visits only pages its paint can
    // reach, rather than scanning every block for every page.
    const ordered = sheets.map((sheet, index) => ({ sheet, index, box: measured.get(sheet)!.box })).sort((a, b) => a.box.top - b.box.top);
    const buckets: Unit[][] = sheets.map(() => []);
    for (const unit of units) {
      const paint = measured.get(unit.element)?.paint;
      if (!paint) continue;
      let low = 0, high = ordered.length;
      while (low < high) { const middle = (low + high) >>> 1; if (ordered[middle].box.bottom <= paint.top) low = middle + 1; else high = middle; }
      for (let i = low; i < ordered.length && ordered[i].box.top < paint.bottom; i++) {
        if (intersects(paint, ordered[i].box)) buckets[ordered[i].index].push(unit);
      }
    }
    const container = document_.createElement('div');
    container.className = CONTAINER_CLASS;

    for (const [index, sheet] of sheets.entries()) {
      const box = measured.get(sheet)!.box;
      const page = document_.createElement('div');
      page.className = 'w-print-page';
      page.style.width = `${box.width / scale}px`;
      page.style.height = `${box.height / scale}px`;

      const copy = source.cloneNode(false) as HTMLElement;
      copy.classList.add('w-print-copy');
      inherit(copy, origin.style);
      copy.style.width = `${origin.box.width / scale}px`;
      copy.style.left = `${-(box.left - origin.box.left) / scale}px`;
      copy.style.top = `${-(box.top - origin.box.top) / scale}px`;
      const surfaces = new Map<HTMLElement, { clone: HTMLElement; sheets?: HTMLElement; cursor: number }>();
      for (const unit of buckets[index]) {
        const drawn = unit.element.cloneNode(true) as HTMLElement;
        if (!unit.surface) {
          const at = measured.get(unit.element)!;
          drawn.style.position = 'absolute';
          drawn.style.margin = '0';
          drawn.style.boxSizing = 'border-box';
          drawn.style.width = `${at.box.width / scale}px`;
          drawn.style.left = `${(at.box.left - origin.box.left) / scale}px`;
          drawn.style.top = `${(at.box.top - origin.box.top) / scale}px`;
          copy.append(drawn);
          continue;
        }
        let surface = surfaces.get(unit.surface);
        const at = measured.get(unit.surface)!;
        if (!surface) {
          const clone = unit.surface.cloneNode(false) as HTMLElement;
          inherit(clone, at.style);
          Object.assign(clone.style, { position: 'absolute', margin: '0',
            left: `${(at.box.left - origin.box.left) / scale}px`, top: `${(at.box.top - origin.box.top) / scale}px`,
            width: `${at.box.width / scale}px`, height: `${at.box.height / scale}px`, boxSizing: 'border-box' });
          surface = { clone, cursor: px(at.style.paddingTop) + px(at.style.borderTopWidth) };
          surfaces.set(unit.surface, surface);
          copy.append(clone);
        }
        if (unit.sheets) {
          if (!surface.sheets) {
            surface.sheets = unit.element.parentElement!.cloneNode(false) as HTMLElement;
            surface.clone.append(surface.sheets);
          }
          // Furniture retains its original top/transform and containing block.
          surface.sheets.append(drawn);
        } else {
          const block = measured.get(unit.element)!;
          if (!['absolute', 'fixed'].includes(block.style.position)) {
            const top = (block.box.top - at.box.top) / scale;
            const gap = top - surface.cursor - px(block.style.marginTop);
            const spacer = document_.createElement('div');
            spacer.setAttribute('data-word-print-space', '');
            spacer.style.cssText = `flex:none;height:${Math.max(0, gap)}px;margin:${Math.min(0, gap)}px 0 0;padding:0;border:0;`;
            surface.clone.append(spacer);
            surface.cursor = top + block.box.height / scale + px(block.style.marginBottom);
          }
          // Static blocks stay static: changing their position would re-anchor
          // absolutely positioned images that currently belong to the section.
          surface.clone.append(drawn);
        }
      }
      uniqueIds(copy, `word-print-${printerId}-${index}`);

      page.appendChild(copy);
      container.appendChild(page);
    }

    document_.body.appendChild(container);
    output = container;
    return sheets.length;
  };

  return {
    build,
    clear,
    attach() {
      // The browser's own events, so this works for the print dialog and for a
      // PDF asked for programmatically alike. Building has to be synchronous:
      // by the time beforeprint returns, the browser is laying out the pages.
      const view = document_.defaultView;
      if (!view) return () => {};

      const before = () => {
        if (options.isActive?.() === false) return;
        // Synchronous throughout: by the time beforeprint returns, the browser
        // is laying out the pages. The state is restored as soon as the copies
        // are made — they are what gets printed, and the reader gets their
        // header pane back when the dialog closes.
        const restore = options.prepare?.();
        try { build(); } catch (error) { clear(); throw error; } finally { restore?.(); }
      };
      const after = () => { clear(); };
      view.addEventListener('beforeprint', before);
      view.addEventListener('afterprint', after);
      return () => {
        view.removeEventListener('beforeprint', before);
        view.removeEventListener('afterprint', after);
        clear();
      };
    }
  };
}
