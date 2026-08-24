import { describe, it, expect } from 'vitest';
import { instanceParts, nestingOf, NEST_LIMIT } from '../src/canvas-instance';
import type { CanvasAccess } from '../src/canvas-access';

/**
 * What a placement **draws**.
 *
 * This is where the whole component/instance design now lives, and it is the second answer. The
 * first one copied the definition's parts into every placement and had a button to carry a
 * change across — which is what a *template* is (a document you copy and then own), and not what
 * anybody means by a component. A component follows its definition as it is edited.
 *
 * The measurement that made it possible: children are resolved in exactly one place, the proxy
 * the view reads them through (`DataStore.setContentResolver`), and a resolver there can hand
 * back nodes that are not in the document. The save walks the stored nodes, so a file still says
 * what a reader has — a placement, and the values it was given.
 *
 * Tested here rather than through a render because it is arithmetic: substitution, the slot, the
 * arrangement, and the refusal of a card inside itself. Milliseconds instead of a browser.
 */
const doc = (nodes: Record<string, Record<string, unknown>>): CanvasAccess =>
  ({ rootId: 'root', getNode: (sid: string) => nodes[sid] as never }) as CanvasAccess;

/** A card that takes three variables, binds them to three different kinds of thing, and has a slot. */
const bound = () =>
  doc({
    root: { sid: 'root', stype: 'document', content: ['slide', 'lib'] },
    slide: { sid: 'slide', stype: 'surface', attributes: { kind: 'slide' }, content: ['one'] },
    lib: { sid: 'lib', stype: 'components', attributes: {}, content: ['card'] },
    card: {
      sid: 'card',
      stype: 'component',
      attributes: { id: 'card', name: '카드' },
      content: [
        'v-title',
        'v-accent',
        'v-badge',
        'b-title',
        'b-accent',
        'b-badge',
        'def-title',
        'def-badge',
        'def-items'
      ]
    },
    'v-title': { sid: 'v-title', stype: 'componentVar', attributes: { name: 'title', value: '제목' } },
    'v-accent': {
      sid: 'v-accent',
      stype: 'componentVar',
      attributes: { name: 'accent', kind: 'color', value: '#111111' }
    },
    'v-badge': {
      sid: 'v-badge',
      stype: 'componentVar',
      attributes: { name: 'showBadge', kind: 'boolean', value: 'true' }
    },
    /*
     * The bindings are the **definition's**, not the part's: three attributes on a part meant a
     * variable could drive exactly three things, and a `number` could only ever be text (§10g-2).
     */
    'b-title': {
      sid: 'b-title',
      stype: 'componentBind',
      attributes: { part: 'title', attr: 'text', var: 'title' }
    },
    'b-accent': {
      sid: 'b-accent',
      stype: 'componentBind',
      attributes: { part: 'title', attr: 'fill', var: 'accent' }
    },
    'b-badge': {
      sid: 'b-badge',
      stype: 'componentBind',
      attributes: { part: 'badge', attr: 'visible', var: 'showBadge' }
    },
    'def-title': {
      sid: 'def-title',
      stype: 'textFrame',
      attributes: { partId: 'title', x: 100, y: 100, width: 2000, height: 400 },
      content: ['def-line']
    },
    'def-line': { sid: 'def-line', stype: 'paragraph', attributes: { fontSize: 44 }, content: ['def-run'] },
    'def-run': { sid: 'def-run', stype: 'inline-text', attributes: {}, text: '제목' },
    'def-badge': { sid: 'def-badge', stype: 'rectangle', attributes: { partId: 'badge' } },
    'def-items': {
      sid: 'def-items',
      stype: 'frame',
      attributes: { partId: 'items', slot: 'items', layoutMode: 'column', gap: 100, padding: 100 },
      content: []
    },
    one: {
      sid: 'one',
      stype: 'instance',
      attributes: { componentId: 'card', x: 5000, y: 3000 },
      content: ['said-title', 'said-badge', 'one-own']
    },
    'said-title': {
      sid: 'said-title',
      stype: 'componentValue',
      attributes: { name: 'title', value: '매출' }
    },
    'said-badge': {
      sid: 'said-badge',
      stype: 'componentValue',
      attributes: { name: 'showBadge', value: 'false' }
    },
    /** The reader's own box, which belongs **in the slot**. */
    'one-own': { sid: 'one-own', stype: 'textFrame', attributes: { width: 500, height: 200 } }
  });

/** The drawn parts of the placement, by the name the definition gave them. */
const drawn = (access: CanvasAccess, sid = 'one') => {
  const parts = instanceParts(access, access.getNode(sid) as never) as never as {
    sid: string;
    stype: string;
    text?: string;
    attributes?: Record<string, unknown>;
    content?: unknown[];
  }[];
  return {
    all: parts,
    of: (partId: string) => parts.find((part) => part.attributes?.partId === partId)!
  };
};

describe('a part bound to a variable', () => {
  it('draws the value and nothing else', () => {
    const title = drawn(bound()).of('title') as never as {
      content: [{ attributes: Record<string, unknown>; content: [{ text: string }] }];
    };
    // The first run's formatting is kept — the definition's font survives — and the rest go.
    // Writing into the first and leaving the others would put the value on the page followed
    // by whatever the definition said next.
    expect(title.content[0].attributes.fontSize).toBe(44);
    expect(title.content[0].content[0].text).toBe('매출');
  });

  it('takes a colour by name, so one decision is not three copies', () => {
    expect(drawn(bound()).of('title').attributes?.fill).toBe('#111111');
  });

  it('is not there when its state says so, and writes only the falsy half', () => {
    const access = bound();
    // `visible: true` beside no `visible` at all is the same drawing — the asymmetry the
    // conformance probe finds in every boolean — so only `false` is ever written.
    expect(drawn(access).of('badge').attributes?.visible).toBe(false);

    (access.getNode('said-badge') as never as { attributes: Record<string, unknown> }).attributes = {
      name: 'showBadge',
      value: 'true'
    };
    expect('visible' in (drawn(access).of('badge').attributes ?? {})).toBe(false);
  });

  it('falls back to the declaration’s own value when the placement said nothing', () => {
    const access = bound();
    (access.getNode('slide') as never as { content: string[] }).content = ['one'];
    (access.getNode('one') as never as { content: string[] }).content = [];
    const title = drawn(access).of('title') as never as {
      content: [{ content: [{ text: string }] }];
    };
    // A card with no value written on it draws the default it declares, which is what makes a
    // freshly placed card look like the card in the library rather than like nothing.
    expect(title.content[0].content[0].text).toBe('제목');
  });
});

describe('what a reader puts in a card', () => {
  it('goes inside the slot, not beside the parts', () => {
    const parts = drawn(bound());
    expect(parts.all.map((part) => part.attributes?.partId)).toEqual(['title', 'badge', 'items']);
    // The reader's own box is *in* the slot part, and it is still the reader's node — its own
    // sid, so a click selects it and typing into it writes to the document.
    expect((parts.of('items').content ?? []).map((child) => (child as { sid: string }).sid)).toEqual([
      'one-own'
    ]);
  });

  it('leaves the value nodes out of the drawing', () => {
    // A `componentValue` is an answer, not a shape. Drawn, it would be an empty box on the slide
    // for every field the card takes.
    const parts = drawn(bound());
    for (const part of parts.all) {
      for (const child of part.content ?? []) {
        expect((child as { stype?: string }).stype).not.toBe('componentValue');
      }
    }
  });
});

describe('a drawn part is not a node in the document', () => {
  it('says so in its sid, so nothing mistakes it for one', () => {
    /*
     * `~` never appears in a store's own ids, so a reader of the DOM can tell a piece of a placement
     * from a node in the document — which is what makes a click select the placement rather than
     * something nobody can edit.
     */
    for (const part of drawn(bound()).all) {
      expect(part.sid.includes('~')).toBe(true);
    }
  });

  it('is its **own** thing in each placement of the card', () => {
    /*
     * Measured as the opposite first, which is why this test exists: the sid was made of the
     * *definition's* id, so the sample deck's three placements of one card each drew
     * `metric-card~slides:138` — three elements claiming one identity, and `querySelector` answering
     * the first for all three. Any motion, hit test or lookup aimed at the third reached the first.
     *
     * The placement's own sid is the prefix now, so a part drawn twice is two things.
     */
    const access = bound();
    (access.getNode('slide') as never as { content: string[] }).content = ['one', 'two'];
    (access as never as { getNode: (sid: string) => unknown }).getNode('one');
    const twin = {
      ...(access.getNode('one') as never as Record<string, unknown>),
      sid: 'two'
    };
    const doubled = {
      rootId: 'root',
      getNode: (sid: string) => (sid === 'two' ? twin : access.getNode(sid))
    } as never;

    const first = instanceParts(doubled, access.getNode('one') as never) as never as { sid: string }[];
    const second = instanceParts(doubled, twin as never) as never as { sid: string }[];
    expect(first[0].sid).not.toBe(second[0].sid);
    expect(first[0].sid.startsWith('one~')).toBe(true);
    expect(second[0].sid.startsWith('two~')).toBe(true);
  });
});

describe('a card that holds itself', () => {
  const looped = () =>
    doc({
      root: { sid: 'root', stype: 'document', content: ['slide', 'lib'] },
      slide: { sid: 'slide', stype: 'surface', attributes: { kind: 'slide' }, content: ['one'] },
      lib: { sid: 'lib', stype: 'components', attributes: {}, content: ['card'] },
      card: {
        sid: 'card',
        stype: 'component',
        attributes: { id: 'card' },
        content: ['def-inner']
      },
      // A placement of the card, inside the card. Every drawing of it is one level deeper.
      'def-inner': {
        sid: 'def-inner',
        stype: 'instance',
        attributes: { componentId: 'card', partId: 'inner' }
      },
      one: { sid: 'one', stype: 'instance', attributes: { componentId: 'card' }, content: [] }
    });

  it('is refused rather than drawn for ever', () => {
    const parts = instanceParts(looped(), looped().getNode('one') as never);
    // One level: the card's own part is drawn, and the placement of itself inside it draws
    // nothing. A card holding a badge is the ordinary case, so this cannot be refused outright —
    // only where it comes back to a definition already being drawn.
    expect(parts).toHaveLength(1);
    expect((parts[0] as { content?: unknown[] }).content).toEqual([]);
  });
});

/**
 * How deep a card may hold a card, and why the number is honest.
 *
 * The limit is the **cycle guard**: a card holding a badge is ordinary, a card holding *itself* is an
 * infinite descent, and a depth catches the mutual case a visited set alone does not. What makes an
 * arbitrary number acceptable is that the deck's own check reports a document that reaches it —
 * measured, a chain twelve deep drew nine levels and lost the rest in silence.
 */
describe('cards inside cards', () => {
  /** A chain of cards, each holding a placement of the next. */
  const chain = (depth: number) => {
    const nodes: Record<string, Record<string, unknown>> = {
      root: { sid: 'root', stype: 'document', content: ['slide', 'lib'] },
      slide: { sid: 'slide', stype: 'surface', attributes: { kind: 'slide' }, content: ['one'] },
      one: {
        sid: 'one',
        stype: 'instance',
        attributes: { componentId: 'c0' },
        content: [],
        parentId: 'slide'
      },
      lib: { sid: 'lib', stype: 'components', attributes: {}, content: [] }
    };
    const library: string[] = [];
    for (let at = 0; at < depth; at += 1) {
      const card = `c${at}`;
      library.push(card);
      const kids = [`${card}-box`];
      if (at + 1 < depth) kids.push(`${card}-inner`);
      nodes[card] = { sid: card, stype: 'component', attributes: { id: card }, content: kids };
      nodes[`${card}-box`] = {
        sid: `${card}-box`,
        stype: 'rectangle',
        attributes: { partId: `box${at}` },
        parentId: card
      };
      if (at + 1 < depth) {
        nodes[`${card}-inner`] = {
          sid: `${card}-inner`,
          stype: 'instance',
          attributes: { partId: `inner${at}`, componentId: `c${at + 1}` },
          parentId: card
        };
      }
    }
    nodes.lib.content = library;
    return doc(nodes);
  };

  const deepest = (parts: unknown[], level = 1): number => {
    let found = level;
    for (const part of parts as { content?: unknown[] }[]) {
      if (Array.isArray(part.content) && part.content.length > 0) {
        found = Math.max(found, deepest(part.content, level + 1));
      }
    }
    return found;
  };

  it('draws a chain of cards to the limit and no further', () => {
    const shallow = chain(3);
    expect(deepest(instanceParts(shallow, shallow.getNode('one') as never))).toBe(3);

    // Nine levels for a limit of eight, and the twelfth card's contents are simply not drawn.
    const deep = chain(12);
    expect(deepest(instanceParts(deep, deep.getNode('one') as never))).toBe(NEST_LIMIT + 1);
  });

  it('says how deep it goes, and why it stopped', () => {
    /*
     * Answered by walking the **definitions**, which is the only way to see past the point the
     * resolution gave up: from the outside, a placement that drew nothing because of a cycle and one
     * whose card has no parts look exactly alike.
     */
    expect(nestingOf(chain(3), chain(3).getNode('one') as never)).toEqual({ depth: 3 });

    const deep = chain(12);
    expect(nestingOf(deep, deep.getNode('one') as never)).toEqual({
      depth: NEST_LIMIT + 1,
      cut: 'deep'
    });
  });

  it('calls a card that holds itself a cycle, not a depth', () => {
    const looped = doc({
      root: { sid: 'root', stype: 'document', content: ['slide', 'lib'] },
      slide: { sid: 'slide', stype: 'surface', attributes: { kind: 'slide' }, content: ['one'] },
      one: { sid: 'one', stype: 'instance', attributes: { componentId: 'card' }, content: [], parentId: 'slide' },
      lib: { sid: 'lib', stype: 'components', attributes: {}, content: ['card'] },
      card: { sid: 'card', stype: 'component', attributes: { id: 'card' }, content: ['inner'] },
      inner: {
        sid: 'inner',
        stype: 'instance',
        attributes: { partId: 'inner', componentId: 'card' },
        parentId: 'card'
      }
    });
    /*
     * Two different sentences for a reader: a cycle is something a document cannot mean, where the
     * limit is a fact about this product. The check says 고칠 것 for the first and 볼 것 for the second.
     */
    expect(nestingOf(looped, looped.getNode('one') as never)).toEqual({ depth: 1, cut: 'cycle' });
  });
});

describe('a card built to be resized', () => {
  const filled = (width: number, height: number) =>
    doc({
      root: { sid: 'root', stype: 'document', content: ['slide', 'lib'] },
      slide: { sid: 'slide', stype: 'surface', attributes: { kind: 'slide' }, content: ['one'] },
      lib: { sid: 'lib', stype: 'components', attributes: {}, content: ['card'] },
      card: {
        sid: 'card',
        stype: 'component',
        attributes: { id: 'card', width: 3000, height: 2000 },
        content: ['body', 'corner']
      },
      body: {
        sid: 'body',
        stype: 'frame',
        attributes: {
          partId: 'body',
          x: 0,
          y: 0,
          width: 3000,
          height: 2000,
          layoutStretch: true,
          layoutMode: 'column',
          gap: 100,
          padding: 100
        },
        content: ['row-a', 'row-b']
      },
      'row-a': {
        sid: 'row-a',
        stype: 'rectangle',
        attributes: { x: 100, y: 100, width: 2800, height: 400, layoutStretch: true }
      },
      'row-b': {
        sid: 'row-b',
        stype: 'rectangle',
        attributes: { x: 100, y: 600, width: 2800, height: 400, layoutStretch: true }
      },
      // A part that says nothing about filling: it keeps its own box, whatever the card's is.
      corner: {
        sid: 'corner',
        stype: 'rectangle',
        attributes: { partId: 'corner', x: 2600, y: 100, width: 300, height: 300 }
      },
      one: {
        sid: 'one',
        stype: 'instance',
        attributes: { componentId: 'card', x: 1000, y: 1000, width, height },
        content: []
      }
    });

  it('gives the filling part the placement’s box', () => {
    const parts = drawn(filled(8000, 5000));
    expect(parts.of('body').attributes?.width).toBe(8000);
    expect(parts.of('body').attributes?.height).toBe(5000);
    expect(parts.of('body').attributes?.x).toBe(0);
  });

  it('arranges that part’s own children against the size it has just been given', () => {
    /*
     * Parent before child, and this is the fault it was measured as: reading the document here
     * gives the width the *definition* stores, so the rows came out 2800 wide inside a frame that
     * was becoming 7800 — a card that grew with its contents still the size of the library's copy.
     */
    const body = drawn(filled(8000, 5000)).of('body') as never as {
      content: { attributes: Record<string, unknown> }[];
    };
    for (const row of body.content) expect(row.attributes.width).toBe(8000 - 200);
    // Stacked, not stretched down the axis: the padding, the first row's own height, the gap.
    // Nothing shares out what is left along the axis without `layoutGrow`, which is a separate
    // decision with its own minimum-size question.
    expect(body.content[1].attributes.y).toBe(100 + 400 + 100);
  });

  it('leaves a part that was not told to fill alone', () => {
    const parts = drawn(filled(8000, 5000));
    expect(parts.of('corner').attributes?.width).toBe(300);
    expect(parts.of('corner').attributes?.x).toBe(2600);
  });

  it('says nothing new when the placement is the card’s own size', () => {
    // The whole convergence argument, at draw time: an arrangement that answers "what differs"
    // answers nothing here, so a card drawn at its natural size is the definition unchanged.
    const parts = drawn(filled(3000, 2000));
    expect(parts.of('body').attributes?.width).toBe(3000);
    expect((parts.of('body') as never as { content: { attributes: Record<string, unknown> }[] }).content[0]
      .attributes.width).toBe(2800);
  });
});
