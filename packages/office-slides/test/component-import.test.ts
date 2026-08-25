import { describe, it, expect, beforeEach } from 'vitest';
import { DataStore } from '@barocss/datastore';
import { createSchema } from '@barocss/schema';
import type { Editor } from '@barocss/editor-core';
import { createSlidesEditor } from '../src/slides-kit';
import { getSlidesSchemaDefinition } from '../src/slides-schema';
import { createSampleDeck } from '../src/sample-deck';
import { accessOfTree } from '../src/tree-access';
import { childrenOf, type DeckAccess } from '../src/deck';
import {
  componentBehindSource,
  componentSourceOf,
  componentsOf,
  importComponentPlan,
  instanceParts
} from '@barocss/office-canvas';

/**
 * A **brand kit**: a definition brought in from another deck.
 *
 * A reference was never available — a template cannot draw a foreign node (canvas-model §10b-2),
 * which is the measurement the whole materialised design rests on — so the definition is copied and
 * remembers where it came from. What makes that a library rather than a paste is the remembering:
 * bringing it in again replaces the copy, and the deck it came from can be asked whether it has
 * moved on.
 *
 * Which is the relationship Figma has across files, and for the same reason: it cannot be live
 * there either, so updates are offered and accepted.
 */
describe('a definition from another deck', () => {
  let editor: Editor;
  let store: DataStore;
  let doc: DeckAccess;

  /** The brand kit: the sample deck, read straight out of a file. */
  const kit = () => accessOfTree(createSampleDeck() as never);

  const run = async (command: string, payload?: unknown) =>
    await (editor as any).executeCommand(command, payload);

  beforeEach(() => {
    const schema = createSchema('slides', getSlidesSchemaDefinition());
    store = new DataStore(undefined, schema);
    editor = createSlidesEditor({ editable: true, schema, dataStore: store });
    // A deck of the reader's own, with no library in it at all.
    editor.loadDocument(
      {
        stype: 'document',
        attributes: {},
        content: [{ stype: 'surface', attributes: { kind: 'slide', name: '내 덱' }, content: [] }]
      } as never,
      'slides'
    );
    doc = {
      rootId: (editor as never as { getRootId: () => string }).getRootId(),
      getNode: (sid: string) => store.getNode(sid) as never
    };
  });

  it('plans a copy that remembers the deck, the id there, and what it said', () => {
    const plan = importComponentPlan(doc, kit(), 'metric-card', 'brand-kit');
    expect(plan?.id).toBe('metric-card');
    expect(plan?.node.attributes?.fromDeck).toBe('brand-kit');
    expect(plan?.node.attributes?.fromId).toBe('metric-card');
    // A signature rather than a version: a number would have to be maintained by a write on every
    // edit of the brand kit, and a signature is maintained by nobody.
    expect(typeof plan?.node.attributes?.fromSignature).toBe('string');
  });

  it('brings it in, library and all, in one press of undo', async () => {
    expect(await run('importComponent', { deck: 'brand-kit', componentId: 'metric-card', source: createSampleDeck() })).toBe(true);

    const [card] = componentsOf(doc);
    expect(card.id).toBe('metric-card');
    // Everything the definition is came with it: its variables and its parts.
    expect(card.vars.map((one) => one.name)).toEqual(['title', 'value', 'accent', 'showBadge']);
    expect(card.parts).toHaveLength(5);
    expect(componentSourceOf(doc, card)).toMatchObject({ deck: 'brand-kit', id: 'metric-card' });

    await (editor as any).undo();
    // The library was made by the import, so one press takes back "I brought a card in" rather
    // than leaving an empty container behind.
    expect(componentsOf(doc)).toEqual([]);
  });

  it('is placeable here like any other definition', async () => {
    await run('importComponent', { deck: 'brand-kit', componentId: 'metric-card', source: createSampleDeck() });
    const slide = childrenOf(doc.getNode(doc.rootId))[0];
    expect(await run('placeComponent', { componentId: 'metric-card', slideId: slide })).toBe(true);

    const placement = childrenOf(doc.getNode(slide))[0];
    // It draws the imported definition's parts, by the durable names that definition gave them —
    // nothing about a placement knows or cares that its definition came from somewhere else.
    expect(instanceParts(doc, doc.getNode(placement)).map((p) => p.attributes?.partId)).toEqual([
      'back',
      'badge',
      'title',
      'value',
      'items'
    ]);
  });

  it('renames one that would clash, and keeps the pairing', async () => {
    // A card of this deck's own, called the same thing.
    const slide = childrenOf(doc.getNode(doc.rootId))[0];
    store.addChild(doc.rootId, {
      stype: 'components',
      content: [{ stype: 'component', attributes: { id: 'metric-card', name: '내 카드' }, content: [] }]
    } as never);
    void slide;

    await run('importComponent', { deck: 'brand-kit', componentId: 'metric-card', source: createSampleDeck() });
    const ids = componentsOf(doc).map((one) => one.id);
    // Two decks can both define a `card`; the one that arrives second is renamed, and it still
    // knows what it is called *there*.
    expect(ids).toEqual(['metric-card', 'metric-card-2']);
    expect(componentSourceOf(doc, componentsOf(doc)[1])).toMatchObject({ id: 'metric-card' });
  });

  it('replaces the copy rather than making a second one', async () => {
    await run('importComponent', { deck: 'brand-kit', componentId: 'metric-card', source: createSampleDeck() });
    await run('importComponent', { deck: 'brand-kit', componentId: 'metric-card', source: createSampleDeck() });
    /*
     * Bringing the same definition in twice is not two cards: every placement goes on pointing at
     * the same `componentId`, which is the whole point of remembering where it came from.
     */
    expect(componentsOf(doc).map((one) => one.id)).toEqual(['metric-card']);
  });

  it('says when the deck it came from has moved on', async () => {
    await run('importComponent', { deck: 'brand-kit', componentId: 'metric-card', source: createSampleDeck() });
    const card = componentsOf(doc)[0];

    // The same brand kit: nothing to take.
    expect(componentBehindSource(doc, card, kit())).toBe(false);

    // The brand kit, changed — a part is a different colour there now.
    const changed = createSampleDeck() as never as {
      content: Array<{ stype: string; content: any[] }>;
    };
    const library = changed.content.find((one) => one.stype === 'components');
    /*
     * By what it *is* rather than by where it sits: the card's declarations grew (the bindings are
     * the definition's now, §10g-2) and an index into its children was a test that quietly edited
     * the wrong node the day that changed.
     */
    const back = library!.content[0].content.find(
      (one: any) => one.stype === 'rectangle' && one.attributes?.partId === 'back'
    );
    back.attributes.fill = '#ff0000';
    expect(componentBehindSource(doc, card, accessOfTree(changed as never))).toBe(true);
  });

  it('is not behind when there is nothing to compare, and not when it is this deck’s own', async () => {
    // A definition this deck made itself has no source at all: a panel can say "the brand kit's"
    // only about the ones that are.
    store.addChild(doc.rootId, {
      stype: 'components',
      content: [{ stype: 'component', attributes: { id: 'mine' }, content: [] }]
    } as never);
    const mine = componentsOf(doc).find((one) => one.id === 'mine');
    expect(componentSourceOf(doc, mine)).toBeUndefined();
    expect(componentBehindSource(doc, mine, kit())).toBe(false);
  });

  it('refuses a definition the other deck does not have', () => {
    expect(
      (editor as any).canExecuteCommand('importComponent', {
        deck: 'brand-kit',
        componentId: 'nope',
        source: createSampleDeck()
      })
    ).toBe(false);
  });
});
