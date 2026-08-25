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
