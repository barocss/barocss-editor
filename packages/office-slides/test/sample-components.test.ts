import { describe, it, expect, beforeEach } from 'vitest';
import { DataStore } from '@barocss/datastore';
import { createSchema } from '@barocss/schema';
import type { Editor } from '@barocss/editor-core';
import { createSlidesEditor } from '../src/slides-kit';
import { getSlidesSchemaDefinition } from '../src/slides-schema';
import { createSampleDeck } from '../src/sample-deck';
import { childrenOf, deckSlides, type DeckAccess } from '../src/deck';
import {
  componentApplyPlan,
  componentOf,
  componentStale,
  deckComponents,
  instanceSlot,
  instanceState,
  instanceVars
} from '../src/components';

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
    const [card] = deckComponents(doc);
    expect(card.id).toBe('metric-card');
    expect(card.name).toBe('지표 카드');
    // A definition is not a page: the filmstrip, the presenter and the count all read
    // `deckSlides`, and a definition that had been a surface leaked into two of them.
    expect(deckSlides(doc).some((one) => one.sid === card.sid)).toBe(false);
  });

  it('declares what a card can be asked for, and does not count that as a part', () => {
    const [card] = deckComponents(doc);
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
    const [card] = deckComponents(doc);
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

  it('pairs every part with the definition, by durable name', () => {
    const [card] = deckComponents(doc);
    for (const sid of placements()) {
      const state = instanceState(doc, doc.getNode(sid), card);
      expect(state.map((part) => part.origin)).toEqual([
        'back',
        'badge',
        'title',
        'value',
        'items'
      ]);
      // And the placement's `componentValue` children are not in that list: they are what it
      // *says*, not what it is made of.
      expect(state).toHaveLength(5);
    }
  });

  it('knows which parts a reader edited and which are still the definition’s', () => {
    const [card] = deckComponents(doc);
    const changed = (sid: string) =>
      instanceState(doc, doc.getNode(sid), card)
        .filter((part) => part.changed)
        .map((part) => part.origin);

    /*
     * Every substituted part differs from the definition — that is what substitution *is* —
     * so what this really shows is the cost stated in §10b: with materialised placements, the
     * granularity of an override is a whole part. The third card's value says `1.8% ↓`, which
     * the reader typed; the first card's says `1,240만`, which apply wrote. The model cannot
     * tell those two apart, and the product does not pretend to: what it can tell apart is
     * "the definition has moved on" (`componentStale`), which is the question a badge answers.
     */
    expect(changed(placements()[0])).toContain('title');
    expect(changed(placements()[2])).toContain('value');
    // The slot is compared *without its contents*, so the two rows the reader added inside the
    // third card do not make it an override — otherwise a change to the frame itself could
    // never reach a placement anybody had used.
    expect(changed(placements()[2])).not.toContain('items');
  });

  it('is not behind, because nothing has been applied to it yet', () => {
    const [card] = deckComponents(doc);
    // A placement with no `appliedFrom` is not stale: it is a placement from before this was
    // written, and calling every one of them behind would put a badge on the whole deck.
    for (const sid of placements()) {
      expect(componentStale(doc, doc.getNode(sid), card)).toBe(false);
      expect(componentOf(doc, doc.getNode(sid))?.id).toBe('metric-card');
    }
  });

  it('has a slot the reader has already put things in, and apply keeps them', () => {
    const [card] = deckComponents(doc);
    const third = doc.getNode(placements()[2]);
    const slot = instanceSlot(doc, third, card);
    expect(slot).toBeTruthy();
    expect(childrenOf(doc.getNode(slot as string))).toHaveLength(2);

    const plan = componentApplyPlan(doc, third, card);
    // Nothing to add and nothing to take out: the placement holds a copy of every part the
    // definition has, which is what apply leaves behind.
    expect(plan?.add).toEqual([]);
    expect(plan?.remove).toEqual([]);
    expect(plan?.rewrite.find((part) => part.sid === slot)?.keepChildren).toBe(true);
  });
});
