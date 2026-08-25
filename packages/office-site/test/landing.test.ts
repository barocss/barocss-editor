import { describe, it, expect, beforeEach } from 'vitest';
import { DataStore } from '@barocss/datastore';
import { createSchema } from '@barocss/schema';
import { createSiteEditor } from '../src/site-kit';
import { getSiteSchemaDefinition } from '../src/site-schema';
import { createSampleSite } from '../src/sample-site';
import { blocksIn, pagesOf } from '../src/selection';
import { landingFor, type Box } from '../src/landing';

/**
 * Where a carried block would land.
 *
 * Written after the browser said a card dragged along its own row came out as a child of the page,
 * and finding out why was going to cost a screenshot, a `console.log` and three runs of a
 * twenty-second suite. Every part of the decision is arithmetic; the only thing the DOM knows is
 * where each block is drawn, and that arrives as a function — so the row of cards below is laid out
 * by hand and asked the same questions a pointer asks.
 */
describe('where a carried block would land', () => {
  let doc: any;
  let page: string;
  let cardRow: string;
  let cards: string[];
  let hero: string;

  /** A row of three 300-wide cards at y=100, inside a row that starts at x=0. */
  const boxes = new Map<string, Box>();
  const boxOf = (sid: string) => boxes.get(sid);

  beforeEach(() => {
    const schema = createSchema('site', getSiteSchemaDefinition());
    const store = new DataStore(undefined as never, schema as never);
    const editor: any = createSiteEditor({ editable: true, schema, dataStore: store } as never);
    editor.loadDocument(createSampleSite(), 'site');
    doc = { rootId: editor.getRootId(), getNode: (sid: string) => store.getNode(sid) };

    page = pagesOf(doc)[0].sid;
    cardRow = blocksIn(doc, page).find((sid: string) => blocksIn(doc, sid).length === 3)!;
    cards = blocksIn(doc, cardRow);
    hero = blocksIn(doc, page)[1];

    boxes.clear();
    boxes.set(page, { left: 0, top: 0, width: 1280, height: 1400 });
    boxes.set(cardRow, { left: 0, top: 100, width: 1280, height: 300 });
    cards.forEach((sid, at) => boxes.set(sid, { left: at * 400, top: 120, width: 300, height: 260 }));
    boxes.set(hero, { left: 0, top: 0, width: 1280, height: 100 });
    for (const sid of blocksIn(doc, page)) if (!boxes.has(sid)) boxes.set(sid, { left: 0, top: 400, width: 1280, height: 200 });
  });

  const at = (x: number, y: number, hit: string, moving: string) =>
    landingFor(doc, { hit, at: { x, y }, page, moving, breakpoint: 'desktop', boxOf });

  it('puts a card after the ones whose middles it has passed', () => {
    // Carried to the far right of the third card: past all three middles but its own.
    const land = at(1090, 250, cards[2], cards[0]);
    expect(land?.parentId).toBe(cardRow);
    expect(land?.among).toBe(2);
  });

  it('puts it back at the front when it is carried to the left', () => {
    const land = at(20, 250, cards[0], cards[2]);
    expect(land?.parentId).toBe(cardRow);
    expect(land?.among).toBe(0);
  });

  it('draws the line along the row, at the edge it would go before', () => {
    const land = at(420, 250, cards[1], cards[0]);
    // A row: a vertical line, as tall as the row, at the leading edge of the block it precedes.
    expect(land?.line.width).toBe(2);
    expect(land?.line.height).toBe(300);
    expect(land?.line.left).toBe(boxes.get(cards[1])!.left - 1);
  });

  it('draws the line across the page when a section is carried', () => {
    const land = at(600, 90, cardRow, hero);
    expect(land?.parentId).toBe(page);
    // A column: a horizontal line, as wide as the page.
    expect(land?.line.height).toBe(2);
    expect(land?.line.width).toBe(1280);
  });

  it('gives the page an arrangement, because its renderer has one and the document does not', () => {
    /*
     * The page carries no `layoutMode` and is drawn as a column. Without saying so, a drag onto the
     * page asks about an arrangement nobody wrote down and gets "no order" — which leaves a reader
     * holding a block they cannot put down.
     */
    expect(doc.getNode(page).attributes.layoutMode).toBeUndefined();
    expect(at(600, 90, cardRow, hero)).not.toBeNull();
  });

  it('answers nothing when the pointer is over a stack that is not drawn', () => {
    // A width that has the block turned off, a board scrolled away from it: no box, no line, and
    // certainly no move.
    boxes.delete(cardRow);
    expect(at(420, 250, cards[1], cards[0])).toBeNull();
  });

  it('keeps a card in its row when the pointer is over the card being carried', () => {
    // The pointer is always over what is being carried, because the block follows it.
    const land = at(60, 250, cards[0], cards[0]);
    expect(land?.parentId).toBe(cardRow);
  });
});
