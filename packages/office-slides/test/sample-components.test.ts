import { describe, it, expect, beforeEach } from 'vitest';
import { DataStore } from '@barocss/datastore';
import { createSchema } from '@barocss/schema';
import type { Editor } from '@barocss/editor-core';
import { createSlidesEditor } from '../src/slides-kit';
import { getSlidesSchemaDefinition } from '../src/slides-schema';
import { createSampleDeck } from '../src/sample-deck';
import { childrenOf, deckSlides, type DeckAccess } from '../src/deck';
import {
  componentOf,
  componentsOf,
  instanceParts,
  instanceResizable,
  instanceVars
} from '@barocss/office-word';

/**
 * The deck this product ships, read as a **component document**.
 *
 * Why the sample and not a fixture: every design in this repository that was decided against a
 * fixture had to be decided twice. The connector's pairing, the group fitter's undo, the
 * scroll show's stops — each looked right in a hand-made three-node document and was wrong the
 * first time it met a real one. A sample the product loads at start-up is the smallest thing
 * that is not a special case: it goes through the loader, gets real sids, is validated against
 * the schema (`sample-deck-valid.test.ts`) and is drawn by the renderers (`render.test.ts`).
 *
 * So this asks the model the questions the *product* will ask it, about the document a reader
 * actually opens — and it costs milliseconds, which is the whole reason the model holds the
 * arithmetic and the browser only confirms it.
 */
describe('the deck’s own components', () => {
  let doc: DeckAccess;
  let editor: Editor;

  beforeEach(() => {
    const schema = createSchema('slides', getSlidesSchemaDefinition());
    const store = new DataStore(undefined, schema);
    editor = createSlidesEditor({ editable: true, schema, dataStore: store });
    editor.loadDocument(createSampleDeck() as never, 'slides');
    doc = {
      rootId: (editor as never as { getRootId: () => string }).getRootId(),
      getNode: (sid: string) => store.getNode(sid) as never
    };
  });

  /** The three placements on the card slide, in the order the slide holds them. */
  const placements = () => {
    const slide = deckSlides(doc).find((one) => one.name === 'One card, three places');
    return childrenOf(doc.getNode(slide?.sid as string)).filter(
      (sid) => doc.getNode(sid)?.stype === 'instance'
    );
  };

  it('keeps its definition in the library, out of the page sequence', () => {
    const [card] = componentsOf(doc);
    expect(card.id).toBe('metric-card');
    expect(card.name).toBe('지표 카드');
    // A definition is not a page: the filmstrip, the presenter and the count all read
    // `deckSlides`, and a definition that had been a surface leaked into two of them.
    expect(deckSlides(doc).some((one) => one.sid === card.sid)).toBe(false);
  });

  it('declares what a card can be asked for, and does not count that as a part', () => {
    const [card] = componentsOf(doc);
    expect(card.vars.map((one) => [one.name, one.kind])).toEqual([
      ['title', 'text'],
      ['value', 'text'],
      ['accent', 'color'],
      ['showBadge', 'boolean']
    ]);
    // Five parts: the back, the badge, the two texts and the slot.
    expect(card.parts).toHaveLength(5);
  });

  it('answers each placement’s own values, and falls back to the declaration', () => {
    const [card] = componentsOf(doc);
    const said = placements().map((sid) =>
      Object.fromEntries(
        instanceVars(doc, doc.getNode(sid), card).map((one) => [one.name, one.value])
      )
    );
    /*
     * The colour is a **slot**, not a hex — found by the theme test, which asserts that nothing
     * in the document repeats the theme's colour: a card holding `#2563eb` is an off-brand card
     * the moment the deck is re-themed, and a definition holding one makes more of them.
     */
    expect(said[0]).toEqual({
      title: '매출',
      value: '1,240만',
      accent: 'theme:accent1',
      showBadge: 'true'
    });
    expect(said[1].showBadge).toBe('false');
    expect(said[2].accent).toBe('#ef4444');
    // The first card never mentions its colour, and still has one: a declaration's default is
    // what makes a field a reader can set the *first* value in.
    expect(instanceVars(doc, doc.getNode(placements()[0]), card)[2].set).toBe(false);
  });

  it('holds no parts at all: it draws the definition’s', () => {
    for (const sid of placements()) {
      const kids = childrenOf(doc.getNode(sid)).map((one: string) => doc.getNode(one)?.stype);
      /*
       * A placement says what its variables are and holds whatever the reader put in its slot.
       * Nothing else. Copying the parts in would make it a *template* — a document you copy and
       * then own — and a component follows its definition as the definition is edited.
       */
      for (const stype of kids) expect(['componentValue', 'textFrame']).toContain(stype);
    }
  });

  it('resolves the definition’s parts, with this placement’s values in them', () => {
    const [first, , third] = placements();

    const drawnBy = (sid: string) => instanceParts(doc, doc.getNode(sid));
    // Five parts, from the card: the back, the badge, the two texts and the slot.
    expect(drawnBy(first)).toHaveLength(5);

    /** The words in a resolved part, however deep they sit. */
    const words = (node: any): string => {
      if (typeof node?.text === 'string') return node.text;
      return (node?.content ?? []).map(words).join('');
    };
    const titleOf = (sid: string) =>
      words(drawnBy(sid).find((part: any) => part.attributes?.partId === 'title'));

    // Each placement's own value, live: nothing was applied and nothing was copied.
    expect(titleOf(first)).toBe('매출');
    expect(titleOf(third)).toBe('이탈');
  });

  it('puts the reader’s own things inside the slot', () => {
    const third = placements()[2];
    const parts = instanceParts(doc, doc.getNode(third));
    const slot = parts.find((part: any) => typeof part.attributes?.slot === 'string');
    /*
     * The two rows this placement holds are drawn *inside* the definition's frame, so the
     * arrangement belongs to the card and the rows belong to the reader.
     */
    expect((slot?.content ?? []).length).toBe(2);
  });

  it('is never behind its definition, because it draws it', () => {
    /*
     * There is no such state left to be in. A placement holds no copy of the card, so "has the
     * definition moved on since this was applied" is a question about a mechanism that no longer
     * exists — and the sample is the document that has to prove it, because it is what the product
     * really opens.
     */
    for (const sid of placements()) {
      expect(componentOf(doc, doc.getNode(sid))?.id).toBe('metric-card');
      expect(childrenOf(doc.getNode(sid)).every((child) => doc.getNode(child)?.stype !== 'rectangle')).toBe(
        true
      );
    }
  });

  it('needs no apply at all, because there is nothing to carry', () => {
    /*
     * The machinery this replaces: with copied parts, a definition's change had to be *carried*
     * into every placement, so there was a plan (rewrite these, add those, remove the rest), a
     * recorded signature per part, and a badge offering the work. A placement that draws the
     * definition has none of that: the change is already on the screen.
     *
     * What is left of "apply" belongs to the **brand kit** (§10f), where a copy really is a copy:
     * another deck's definition is not in this document, so it is brought in and can fall behind.
     */
    const [card] = componentsOf(doc);
    for (const sid of placements()) {
      const parts = instanceParts(doc, doc.getNode(sid));
      expect(parts).toHaveLength(card.parts.length);
    }
  });

});
