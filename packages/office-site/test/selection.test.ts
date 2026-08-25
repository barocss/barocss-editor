import { describe, it, expect, beforeAll } from 'vitest';
import { DataStore } from '@barocss/datastore';
import { createSchema } from '@barocss/schema';
import { createSiteEditor } from '../src/site-kit';
import { getSiteSchemaDefinition } from '../src/site-schema';
import { createSampleSite } from '../src/sample-site';
import {
  blocksIn,
  documentSidOf,
  childOfScope,
  contentIndexFor,
  dropTarget,
  isInside,
  enclosing,
  isTextual,
  labelOfBlock,
  outermostOf,
  pagesOf,
  pathFromPage
} from '../src/selection';

/**
 * What a click means.
 *
 * The one question a builder has and a document does not — a click in a document puts a caret and
 * that is the whole answer — so it is settled here, in words, before any of it is wired to a
 * pointer. Every assertion is a sentence about the product: *a click selects the outermost block, a
 * double-click goes one level in, Escape comes back out.*
 */
describe('what a click means on a page', () => {
  let doc: any;
  let page: string;
  let cardRow: string;
  let firstCard: string;
  let heading: string;

  beforeAll(() => {
    const schema = createSchema('site', getSiteSchemaDefinition());
    const dataStore = new DataStore(undefined as never, schema as never);
    const editor: any = createSiteEditor({ editable: true, schema, dataStore } as never);
    editor.loadDocument(createSampleSite(), 'site');
    doc = { rootId: editor.getRootId(), getNode: (sid: string) => dataStore.getNode(sid) };

    page = pagesOf(doc)[0].sid;
    // The row of three cards: the one stack on the sample page holding three stacks.
    cardRow = blocksIn(doc, page).find((sid) => blocksIn(doc, sid).length === 3)!;
    firstCard = blocksIn(doc, cardRow)[0];
    heading = blocksIn(doc, firstCard)[0];
  });

  it('knows which document node a drawn part belongs to', () => {
    // A placement's parts and a list's rows carry `${owner}~${part}`, and `~` is in no stored sid —
    // so a click inside a card selects the card, which is the only thing a reader can change.
    expect(documentSidOf('site:26~0~site:57')).toBe('site:26');
    expect(documentSidOf('site:26')).toBe('site:26');
    expect(documentSidOf(undefined)).toBeUndefined();
  });

  it('selects the outermost block, whatever was under the pointer', () => {
    // Aiming at a heading three levels down still selects the section — "the thing I see the edge
    // of" is the only rule that makes a click predictable.
    expect(outermostOf(doc, heading, page)).toBe(cardRow);
    expect(outermostOf(doc, cardRow, page)).toBe(cardRow);
  });

  it('selects inside whatever container the reader has entered', () => {
    /*
     * The scope, not the selection. A double-click is `pointerdown, click, pointerdown, click,
     * dblclick`, so a rule written against the current selection is a rule whose own first press has
     * already reset it — measured as a heading that could never be reached however many times it was
     * double-clicked.
     */
    expect(childOfScope(doc, heading, page, page)).toBe(cardRow);
    expect(childOfScope(doc, heading, page, cardRow)).toBe(firstCard);
    expect(childOfScope(doc, heading, page, firstCard)).toBe(heading);
    // And no further: a click cannot reach past the thing the reader is pointing at.
    expect(childOfScope(doc, heading, page, heading)).toBe(heading);
  });

  it('treats a click outside the entered container as a click on the page', () => {
    // Which is what it is: the reader left. Stepping back out beats selecting nothing, because
    // "nothing happened" is the one response a pointer must never give.
    const otherCard = blocksIn(doc, cardRow)[1];
    expect(childOfScope(doc, heading, page, otherCard)).toBe(cardRow);
  });

  it('comes back out one level, and never past the page', () => {
    expect(enclosing(doc, heading, page)).toBe(firstCard);
    expect(enclosing(doc, firstCard, page)).toBe(cardRow);
    // The page is the board. Selecting it would be a selection whose only meaning is "everything",
    // which is what clicking nothing already means.
    expect(enclosing(doc, cardRow, page)).toBeUndefined();
  });

  it('knows which double-click means a caret', () => {
    expect(isTextual(doc, heading)).toBe(true);
    expect(isTextual(doc, cardRow)).toBe(false);
  });

  it('refuses a node that is not on this page', () => {
    const other = pagesOf(doc)[1].sid;
    expect(pathFromPage(doc, heading, other)).toEqual([]);
    expect(outermostOf(doc, heading, other)).toBeUndefined();
  });

  it('names a block the way a reader would', () => {
    expect(labelOfBlock(doc, cardRow)).toBe('가로 스택');
    expect(labelOfBlock(doc, firstCard)).toBe('세로 스택');
    expect(labelOfBlock(doc, heading)).toBe('제목 3');

    const list = blocksIn(doc, page).find((sid) => doc.getNode(sid).stype === 'collection')!;
    expect(labelOfBlock(doc, list)).toBe('목록 · 상품');
  });

  it('leaves out what a reader cannot point at', () => {
    // A run of text and a `componentValue` are not things anybody aims at, and a selection that can
    // hold them is a panel that has to say what a run's padding is.
    expect(blocksIn(doc, heading)).toEqual([]);
  });
});

/**
 * Where a drop means.
 *
 * A page's stacks arrange their children, so a dragged block has no coordinate to land on and what a
 * drag can mean is the **order** — `office-canvas` answers which place, and this answers which
 * stack.
 */
describe('where a drop means', () => {
  let doc: any;
  let page: string;
  let cardRow: string;
  let firstCard: string;
  let heading: string;

  beforeAll(() => {
    const schema = createSchema('site', getSiteSchemaDefinition());
    const dataStore = new DataStore(undefined as never, schema as never);
    const editor: any = createSiteEditor({ editable: true, schema, dataStore } as never);
    editor.loadDocument(createSampleSite(), 'site');
    doc = { rootId: editor.getRootId(), getNode: (sid: string) => dataStore.getNode(sid) };
    page = pagesOf(doc)[0].sid;
    cardRow = blocksIn(doc, page).find((sid: string) => blocksIn(doc, sid).length === 3)!;
    firstCard = blocksIn(doc, cardRow)[0];
    heading = blocksIn(doc, firstCard)[0];
  });

  it('lands among the siblings of the block under the pointer', () => {
    // Over another card: next to that card. Over a heading inside a card: inside the card. One
    // sentence, and a reader can predict it from anywhere.
    expect(dropTarget(doc, firstCard, page, blocksIn(doc, cardRow)[2])).toBe(cardRow);
    expect(dropTarget(doc, heading, page, blocksIn(doc, cardRow)[2])).toBe(firstCard);
  });

  it('moves a section among sections when the pointer is on the row itself', () => {
    // Its padding, its gap, the empty part of it — which is what a hit on a container *means*,
    // because `elementsFromPoint` gives the deepest element first.
    expect(dropTarget(doc, cardRow, page, blocksIn(doc, page)[1])).toBe(page);
  });

  it('keeps the reader in the stack they are reordering inside', () => {
    /*
     * The pointer is always over what is being carried — the block follows it. The deepest node
     * outside the carried subtree is the stack the block lives in, and *its* siblings are the wrong
     * answer: the reader would be thrown out of the row they were reordering.
     */
    expect(dropTarget(doc, heading, page, firstCard)).toBe(cardRow);
    expect(isInside(doc, heading, firstCard)).toBe(true);
    expect(isInside(doc, cardRow, firstCard)).toBe(false);
  });
});

/**
 * "Before the third block" and "before the third child" are different numbers.
 *
 * A parent may hold things a reader never sees — a page's variables, a card's values — and `moveNode`
 * counts all of them while `reorderIndexAt` counts only what is drawn. An off-by-one between them is
 * a drop that lands one place from where the line was drawn.
 */
describe('the place a drop means, in the parent’s own content', () => {
  const doc = {
    getNode: (sid: string) =>
      ({
        row: { sid: 'row', stype: 'frame', content: ['value', 'a', 'b', 'c'] },
        value: { sid: 'value', stype: 'componentValue' },
        a: { sid: 'a', stype: 'frame' },
        b: { sid: 'b', stype: 'frame' },
        c: { sid: 'c', stype: 'frame' }
      })[sid]
  } as any;

  it('skips what a reader cannot see', () => {
    // Block 0 is `a`, which is child 1: the `componentValue` is in the array and on nobody's screen.
    expect(contentIndexFor(doc, 'row', 'c', 0)).toBe(1);
    expect(contentIndexFor(doc, 'row', 'c', 1)).toBe(2);
  });

  it('counts without the block being moved, because that is what the move does', () => {
    // `moveNode` removes first and inserts into the shortened array.
    expect(contentIndexFor(doc, 'row', 'a', 0)).toBe(1);
  });

  it('puts a drop past the last block at the end', () => {
    expect(contentIndexFor(doc, 'row', 'a', 2)).toBe(3);
    expect(contentIndexFor(doc, 'row', 'a', 9)).toBe(3);
  });
});
