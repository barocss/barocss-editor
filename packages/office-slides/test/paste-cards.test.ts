import { describe, it, expect } from 'vitest';
import { cardsFor, pasteCardsPlan } from '../src/paste-cards';
import type { DeckAccess, DeckNode } from '../src/deck';

/**
 * What a copied card travels with.
 *
 * Measured before any of this existed: a placement copied into a deck that does not define its card
 * pasted an **invisible empty box**. The paste reported success, the placement drew 0 parts, and the
 * deck's own check said nothing — which is the worst shape a fault can take, because it looks like
 * it worked.
 *
 * So the clipboard carries what the boxes *need*, and the paste adds what the destination has not
 * got. The interesting half is the clash: a destination that already has that name, saying
 * something else.
 */
const doc = (nodes: Record<string, Record<string, unknown>>): DeckAccess =>
  ({ rootId: 'root', getNode: (sid: string) => nodes[sid] as never }) as DeckAccess;

/** A deck with one card, one document variable, and a placement of the card on its slide. */
const source = () =>
  doc({
    root: { sid: 'root', stype: 'document', content: ['slide', 'lib', 'vars'] },
    slide: { sid: 'slide', stype: 'surface', attributes: { kind: 'slide' }, content: ['one', 'plain'] },

    one: {
      sid: 'one',
      stype: 'instance',
      attributes: { componentId: 'card', x: 1000, y: 1000 },
      content: ['said'],
      parentId: 'slide'
    },
    said: { sid: 'said', stype: 'componentValue', attributes: { name: 'title', value: '매출' } },
    // An ordinary shape that names the variable directly, which is the other way one is needed.
    plain: {
      sid: 'plain',
      stype: 'rectangle',
      attributes: { x: 0, y: 0, width: 500, height: 400, fill: 'var:주의' },
      parentId: 'slide'
    },

    lib: { sid: 'lib', stype: 'components', attributes: {}, content: ['card', 'badge'] },
    card: {
      sid: 'card',
      stype: 'component',
      attributes: { id: 'card', name: '카드' },
      content: ['v-title', 'b-title', 'b-fill', 'p-title', 'p-badge']
    },
    'v-title': {
      sid: 'v-title',
      stype: 'componentVar',
      attributes: { name: 'title', kind: 'text', value: '지표' }
    },
    'b-title': {
      sid: 'b-title',
      stype: 'componentBind',
      attributes: { part: 'title', attr: 'text', var: 'title' }
    },
    // A binding naming a *document* variable — the card does not declare 주의.
    'b-fill': {
      sid: 'b-fill',
      stype: 'componentBind',
      attributes: { part: 'title', attr: 'fill', var: '주의' }
    },
    'p-title': { sid: 'p-title', stype: 'textFrame', attributes: { partId: 'title' }, parentId: 'card' },
    // And a card that holds a placement of *another* card, which is the ordinary badge case.
    'p-badge': {
      sid: 'p-badge',
      stype: 'instance',
      attributes: { partId: 'badge', componentId: 'badge' },
      parentId: 'card'
    },
    badge: {
      sid: 'badge',
      stype: 'component',
      attributes: { id: 'badge', name: '배지' },
      content: ['p-dot']
    },
    'p-dot': { sid: 'p-dot', stype: 'ellipse', attributes: { partId: 'dot' }, parentId: 'badge' },

    vars: { sid: 'vars', stype: 'variables', attributes: {}, content: ['v1'] },
    v1: { sid: 'v1', stype: 'variable', attributes: { name: '주의', kind: 'color', value: '#ef4444' } }
  });

/** What the clipboard would hold for the slide's two boxes. */
const copied = (): DeckNode[] => [
  {
    stype: 'instance',
    attributes: { componentId: 'card', x: 1000, y: 1000 },
    content: [{ stype: 'componentValue', attributes: { name: 'title', value: '매출' } }]
  } as never as DeckNode,
  {
    stype: 'rectangle',
    attributes: { x: 0, y: 0, width: 500, height: 400, fill: 'var:주의' }
  } as never as DeckNode
];

describe('what a copy carries', () => {
  it('takes the card, the card it holds, and the variables both need', () => {
    const carried = cardsFor(source(), copied());
    /*
     * Transitive on purpose: the card holds a placement of the badge, and carrying only the first
     * would paste the same invisible hole one level down.
     */
    expect(carried.cards.map((card) => card.attributes?.id)).toEqual(['card', 'badge']);
    // 주의 twice over — a binding names it and a copied shape's fill names it — and once in the list.
    expect(carried.vars.map((one) => one.attributes?.name)).toEqual(['주의']);
  });

  it('carries the definition as a plain copy, with no sids in it', () => {
    const [card] = cardsFor(source(), copied()).cards;
    // A sid belongs to one node in one store; a copy that kept it would give two nodes one identity,
    // which every lookup by sid resolves through.
    expect((card as { sid?: string }).sid).toBeUndefined();
    expect(card.attributes?.name).toBe('카드');
  });

  it('carries nothing for a copy that names nothing', () => {
    const carried = cardsFor(source(), [
      { stype: 'rectangle', attributes: { x: 0, y: 0, fill: '#111111' } } as never as DeckNode
    ]);
    expect(carried).toEqual({ cards: [], vars: [] });
  });
});

describe('what a paste has to add', () => {
  const empty = () =>
    doc({
      root: { sid: 'root', stype: 'document', content: ['slide'] },
      slide: { sid: 'slide', stype: 'surface', attributes: { kind: 'slide' }, content: [] }
    });

  it('adds a library and the variables, in the schema’s order', () => {
    const plan = pasteCardsPlan(empty(), cardsFor(source(), copied()));
    const added = plan.steps.map((step) => (step as { payload: { child: DeckNode } }).payload.child);

    expect(added.map((child) => child.stype)).toEqual(['components', 'variables']);
    /*
     * `components? variables?` is an order, and a container appended after `variables` is refused
     * outright — measured, §10h. So both come with a position from the same list the content model
     * is written in.
     */
    expect(plan.steps.every((step) => 'position' in (step as { payload: object }).payload)).toBe(true);
    expect(plan.renames).toEqual({});
  });

  it('adds nothing when the deck already has the same card', () => {
    /*
     * The common case, and the one that must cost nothing: two slides of one deck, or two windows on
     * one file. Compared by **signature** rather than by id, because an id is a name and a name is
     * not the card.
     */
    const plan = pasteCardsPlan(source(), cardsFor(source(), copied()));
    expect(plan.steps).toEqual([]);
    expect(plan.renames).toEqual({});
  });

  it('renames an arriving card when the deck has a different one of that name', () => {
    const host = source();
    // The destination's `card` says something else: one part, no variables.
    (host.getNode('card') as never as { content: string[] }).content = ['p-title'];

    const plan = pasteCardsPlan(host, cardsFor(source(), copied()));
    /*
     * The arriving one comes in under a new name and the paste repoints its placements at it.
     * Overwriting the destination's card would change every slide that already used it — from a
     * paste, which is the same refusal find-and-replace makes about a card's own words (§10i).
     */
    expect(plan.renames).toEqual({ card: 'card-2' });
    const added = plan.steps.map((step) => (step as { payload: { child: DeckNode } }).payload.child);
    expect(added.map((child) => child.attributes?.id)).toEqual(['card-2']);
  });

  it('keeps the destination’s own value for a variable of the same name', () => {
    const host = doc({
      root: { sid: 'root', stype: 'document', content: ['slide', 'vars'] },
      slide: { sid: 'slide', stype: 'surface', attributes: { kind: 'slide' }, content: [] },
      vars: { sid: 'vars', stype: 'variables', attributes: {}, content: ['v1'] },
      // The same name, this deck's own colour.
      v1: { sid: 'v1', stype: 'variable', attributes: { name: '주의', kind: 'color', value: '#b45309' } }
    });

    const plan = pasteCardsPlan(host, cardsFor(source(), copied()));
    const added = plan.steps.flatMap((step) => {
      const child = (step as { payload: { child: DeckNode } }).payload.child;
      return child.stype === 'variables' ? [child] : [];
    });
    /*
     * Nothing: a paste that re-coloured the deck it landed in would be a paste changing slides
     * nobody was looking at. The pasted card follows the destination's decision, which is what a
     * variable is for.
     */
    expect(added).toEqual([]);
    expect(host.getNode('v1')?.attributes?.value).toBe('#b45309');
  });

  it('answers nothing for a payload written before this existed', () => {
    // A clipboard from an older version carries no `needs`, and a paste that found none has to
    // behave exactly as it used to rather than refusing.
    expect(pasteCardsPlan(empty(), undefined)).toEqual({ steps: [], renames: {} });
  });
});
