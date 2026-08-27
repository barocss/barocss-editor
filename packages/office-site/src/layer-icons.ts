/**
 * What a block **looks like** in a list of them.
 *
 * ## Why a list of names is not enough
 *
 * The layer list said `세로 스택`, `제목 3`, `가로 스택`, `세로 스택`, `본문` down a 240px column, and a
 * reader looking for the picture they just placed had to read every line. Every tool of this kind
 * puts a small picture at the head of the row for the same reason a file browser does: **the shape
 * is recognised before the word is read**, and a list of forty rows is scanned rather than read.
 *
 * ## Why the mapping lives here and not in the rail
 *
 * Because it is a fact about the *document* — which node type, and which arrangement it is in — and
 * the rail is a drawing. It is also the answer `every-icon-has-a-picture` needs: a product asking
 * for an icon the suite does not draw gets a control labelled with its own name, and the check can
 * only ask if the asking is written down.
 */
import { layoutModeOf } from '@barocss/office-canvas';

type Node = { stype?: unknown; attributes?: Record<string, unknown> };

/** The picture for one block, by what it is and how it arranges what is in it. */
export function iconForBlock(node: Node | undefined): string {
  const stype = String(node?.stype ?? '');
  const attrs = node?.attributes ?? {};

  if (stype === 'frame' || stype === 'collection') {
    const mode = layoutModeOf({ mode: attrs.layoutMode });
    if (stype === 'collection') return 'data-list';
    if (mode === 'row') return 'frame-row';
    if (mode === 'grid') return 'frame-grid';
    if (mode === 'column') return 'frame-column';
    return 'insert-frame';
  }

  switch (stype) {
    case 'heading':
      return 'heading';
    case 'paragraph':
      return 'paragraph';
    case 'picture':
      return 'insert-image';
    case 'instance':
      return 'component';
    case 'list':
      // Which kind, because a reader scanning a column of rows is looking for the numbered one.
      return attrs.type === 'ordered' ? 'ordered-list' : 'bullet-list';
    case 'blockQuote':
      return 'quote';
    case 'codeBlock':
      return 'code';
    case 'horizontalRule':
      return 'divider';
    case 'surface':
      return 'insert-frame';
    default:
      // A block this product has not met: a picture that says "a block" beats a blank column.
      return 'insert-frame';
  }
}

/** Every icon a layer row can ask for — the list `every-icon-has-a-picture` is given. */
export function siteLayerIcons(): string[] {
  return [
    'frame-row',
    'frame-column',
    'frame-grid',
    'insert-frame',
    'data-list',
    'heading',
    'paragraph',
    'insert-image',
    'component',
    'bullet-list',
    'ordered-list',
    'quote',
    'code',
    'divider'
  ];
}
