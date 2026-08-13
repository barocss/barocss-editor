/**
 * Headers, footers and the fields inside them.
 *
 * Drawn rather than rendered as content, for the same reason the page sheets
 * are. A header is one thing in the model and many on screen — it repeats on
 * every page — and page numbers are the clearest case of why that matters: the
 * same node has to read "2" on one page and "3" on the next. Rendering the
 * subtree through the node renderers would give every page a copy carrying the
 * same ids, all of them editable, all of them saying the same number.
 *
 * So this walks the header's blocks and emits templates directly. What it gives
 * up is editing — a header drawn this way cannot be typed into, and Word's own
 * answer to that is a separate header editing mode, which is where this would
 * grow next. What it gets is that the thing is inert: no duplicate ids, nothing
 * for the caret to land in, nothing carried into a copy.
 */
import { element, type ElementTemplate } from '@barocss/dsl';
import { formatCounter, type NumberFormatValue } from '@barocss/shared';
import { twipToPx } from './css';
import { childrenOf, type DocumentAccess, type DocumentNode } from './document-access';
import type { SheetMetrics } from './layout';
import type { LineNumberMark } from './line-numbers';
import type { EffectiveFormat } from './style-resolver';

/** Which header or footer a page gets, in Word's order of preference. */
export interface FurnitureBinding {
  first?: string;
  even?: string;
  default?: string;
}

export interface PageContext {
  /** Zero-based, as the layout counts them. */
  index: number;
  /** What the reader sees, after the section's `pageNumberStart`. */
  number: number;
  total: number;
}

/**
 * Pick the header for a page.
 *
 * Word asks three questions in order — is this the first page, is it an even
 * one, and otherwise use the ordinary header — and each variant is optional, so
 * a section with only a default header uses it everywhere.
 */
export function furnitureFor(binding: FurnitureBinding, page: PageContext): string | undefined {
  if (page.index === 0 && binding.first) return binding.first;
  if (page.number % 2 === 0 && binding.even) return binding.even;
  return binding.default;
}

/** The page number a page shows, honouring the section's restart. */
export function pageNumberFor(index: number, format: EffectiveFormat): number {
  const start = typeof format.pageNumberStart === 'number' ? format.pageNumberStart : 1;
  return start + index;
}

/** The page number as text, in the section's numbering format. */
export function pageNumberText(value: number, format: EffectiveFormat): string {
  const style = typeof format.pageNumberFormat === 'string' ? format.pageNumberFormat : 'decimal';
  return formatCounter(value, style as NumberFormatValue);
}

/**
 * Flatten a block to plain text, substituting the fields that depend on the page.
 *
 * Only the fields whose value *is* the page are resolved here. A cross-reference
 * or a sequence number is a document-wide question, and answering it from inside
 * a per-page draw would give a different answer on each page.
 */
function textOf(doc: DocumentAccess, node: DocumentNode, page: PageContext, format: EffectiveFormat): string {
  if (node.stype === 'fieldPageNumber') return pageNumberText(page.number, format);
  if (node.stype === 'fieldPageCount') return pageNumberText(page.total, format);
  if (node.stype === 'tab') return '\t';
  if (typeof node.text === 'string') return node.text;

  return childrenOf(doc, node)
    .map((child) => textOf(doc, child, page, format))
    .join('');
}

const ALIGNMENT: Record<string, string> = {
  left: 'flex-start',
  start: 'flex-start',
  center: 'center',
  right: 'flex-end',
  end: 'flex-end',
  both: 'space-between',
  justify: 'space-between'
};

/**
 * A header or footer block as a row.
 *
 * A tab in page furniture means "move to the next tab stop", which in practice
 * is what centres a title and pushes a page number to the right margin. Laying
 * the parts out as a row reproduces the effect without implementing tab stops:
 * one part is left, two are left and right, three are left, centre and right —
 * which is the arrangement Word's default header tab stops produce.
 */
function furnitureBlock(
  doc: DocumentAccess,
  block: DocumentNode,
  page: PageContext,
  format: EffectiveFormat
): ElementTemplate {
  const parts = textOf(doc, block, page, format).split('\t');
  const alignment = String(block.attributes?.alignment ?? 'left');

  if (parts.length === 1) {
    return element('div', {
      className: 'w-furniture-line',
      style: { display: 'flex', justifyContent: ALIGNMENT[alignment] ?? 'flex-start' }
    }, [element('span', { className: 'w-furniture-part' }, parts[0])]);
  }

  return element(
    'div',
    {
      className: 'w-furniture-line',
      style: { display: 'flex', justifyContent: 'space-between', gap: '1em' }
    },
    parts.map((part, index) =>
      element(
        'span',
        {
          className: 'w-furniture-part',
          key: `part-${index}`,
          style: { textAlign: index === 0 ? 'left' : index === parts.length - 1 ? 'right' : 'center' }
        },
        part
      )
    )
  );
}

export interface FurnitureOptions {
  doc: DocumentAccess;
  /** The header or footer node to draw, already chosen for this page. */
  node: DocumentNode | undefined;
  page: PageContext;
  metrics: SheetMetrics;
  format: EffectiveFormat;
  placement: 'header' | 'footer';
}

/**
 * Draw one page's header or footer, positioned against its sheet.
 *
 * Returns nothing when there is no header to draw, rather than an empty box:
 * an empty box still occupies its distance from the page edge, and a reader
 * would see the body text start lower on pages that happen to have no header.
 */
export function furnitureTemplate(options: FurnitureOptions): ElementTemplate | null {
  const { doc, node, page, metrics, format, placement } = options;
  if (!node) return null;

  const blocks = childrenOf(doc, node);
  if (blocks.length === 0) return null;

  const distance = twipToPx(
    typeof format[placement === 'header' ? 'marginHeader' : 'marginFooter'] === 'number'
      ? (format[placement === 'header' ? 'marginHeader' : 'marginFooter'] as number)
      : 720
  );
  const sheetTop = page.index * (metrics.height + metrics.gap);

  return element(
    'div',
    {
      className: `w-furniture w-${placement}`,
      key: `${placement}-${page.index}`,
      // Which resource this copy is showing, so a double-click knows what to open
      'data-furniture': String(node.attributes?.id ?? ''),
      style: {
        position: 'absolute',
        left: `${metrics.marginLeft}px`,
        right: `${metrics.marginRight}px`,
        width: `${metrics.width - metrics.marginLeft - metrics.marginRight}px`,
        ...(placement === 'header'
          ? { top: `${sheetTop + distance}px` }
          : { top: `${sheetTop + metrics.height - distance}px`, transform: 'translateY(-100%)' })
      }
    },
    blocks.map((block) => furnitureBlock(doc, block, page, format))
  );
}

/**
 * The numbers down the margin of one page.
 *
 * Right-aligned into the margin and stopped `distance` short of the text, which
 * is how Word measures it: the gap between the number and the line it counts is
 * what the setting names, not where the number starts. They are drawn per page
 * with the rest of the furniture because that is what they are — the count is a
 * fact about the page, and the lines they sit against are content that knows
 * nothing about them.
 */
export function lineNumberTemplate(options: {
  marks: LineNumberMark[];
  pageIndex: number;
  metrics: SheetMetrics;
  distance: number;
}): ElementTemplate | null {
  const { marks, pageIndex, metrics, distance } = options;
  if (marks.length === 0) return null;

  const gap = twipToPx(distance);
  const width = Math.max(0, metrics.marginLeft - gap);

  return element(
    'div',
    { className: 'w-line-numbers', key: `line-numbers-${pageIndex}`, 'data-bc-chrome': 'true' },
    marks.map((mark) =>
      element(
        'span',
        {
          className: 'w-line-number',
          key: `line-number-${mark.number}`,
          style: {
            position: 'absolute',
            left: '0',
            top: `${mark.top}px`,
            width: `${width}px`,
            textAlign: 'right',
            // Never selectable: the numbers are drawn beside the text and are no
            // part of it, and a copy that carried them would paste a column of
            // digits into whatever it was pasted into.
            userSelect: 'none',
            pointerEvents: 'none'
          }
        },
        String(mark.number)
      )
    )
  );
}

/** Height of the rule drawn above a page's notes, plus the space around it. */
export const FOOTNOTE_SEPARATOR = 12;

export interface FootnoteAreaOptions {
  doc: DocumentAccess;
  /**
   * Resource definitions by their `id` attribute.
   *
   * A footnote is referenced by the id its author gave it, not by the node id
   * the store assigned — which is what lets a reference survive a round trip
   * through a file format that has never heard of our ids.
   */
  resources: Map<string, DocumentNode>;
  /** Footnote ids on this page, in reading order. */
  ids: string[];
  /** The number each footnote shows. */
  numbers: Map<string, number>;
  pageIndex: number;
  metrics: SheetMetrics;
}

/**
 * The notes at the foot of one page.
 *
 * Anchored to the bottom of the page's content area and grown upwards, because
 * that is where the reader expects them and because the space they occupy is
 * what pagination already reserved: growing downwards would put them over the
 * page edge whenever the body happened to be short.
 */
export function footnoteAreaTemplate(options: FootnoteAreaOptions): ElementTemplate | null {
  const { doc, resources, ids, numbers, pageIndex, metrics } = options;
  if (ids.length === 0) return null;

  const sheetTop = pageIndex * (metrics.height + metrics.gap);
  const contentBottom = sheetTop + metrics.height - metrics.marginBottom;

  const notes = ids.flatMap((id) => {
    const body = resources.get(id);
    if (!body) return [];
    const text = childrenOf(doc, body)
      .map((block) => textOf(doc, block, { index: pageIndex, number: 0, total: 0 }, {}))
      .join(' ');

    return [
      element('div', { className: 'w-footnote', key: `note-${id}`, 'data-footnote': id }, [
        element('sup', { className: 'w-footnote-number' }, String(numbers.get(id) ?? '')),
        element('span', { className: 'w-footnote-body' }, text)
      ])
    ];
  });

  if (notes.length === 0) return null;

  return element(
    'div',
    {
      className: 'w-footnotes',
      key: `notes-${pageIndex}`,
      style: {
        position: 'absolute',
        left: `${metrics.marginLeft}px`,
        width: `${metrics.width - metrics.marginLeft - metrics.marginRight}px`,
        top: `${contentBottom}px`,
        transform: 'translateY(-100%)'
      }
    },
    notes
  );
}
