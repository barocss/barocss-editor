import { describe, it, expect } from 'vitest';
import {
  boundAttrs,
  boundGeometry,
  importVariablePlan,
  placeIsBound,
  turnIsBound,
  variableBehindSource,
  variableSourceOf,
  boundText,
  sizeIsBound,
  surfaceOf,
  surfaceVars,
  varInScope,
  documentVar,
  documentVars,
  isVarRef,
  resolveVarValue,
  varBindsOf,
  varRef,
  varUses,
  varSites,
  renameVarPlan,
  UNBINDABLE
} from '../src/canvas-variable';
import { componentsOf, instanceValues } from '../src/canvas-component';
import { contentWithWords, instanceParts } from '../src/canvas-instance';
import type { CanvasAccess } from '../src/canvas-access';

/**
 * The document's own named values.
 *
 * Three things can name a value in this model and they are not each other, which is what most of
 * this file is about: a **theme slot** is one of a fixed set that round-trips with PowerPoint, a
 * **document variable** is named by the author, and a **component variable** is a question a card
 * asks and a placement answers.
 */
const doc = (nodes: Record<string, Record<string, unknown>>): CanvasAccess =>
  ({ rootId: 'root', getNode: (sid: string) => nodes[sid] as never }) as CanvasAccess;

const deck = () =>
  doc({
    root: { sid: 'root', stype: 'document', content: ['slide', 'vars'] },
    slide: { sid: 'slide', stype: 'surface', attributes: { kind: 'slide' }, content: ['box'] },
    // A shape that names one where a colour goes — the theme's shape, for the theme's reason.
    box: { sid: 'box', stype: 'rectangle', attributes: { fill: 'var:강조', x: 0, y: 0 } },
    vars: { sid: 'vars', stype: 'variables', attributes: {}, content: ['v1', 'v2', 'v3', 'nameless'] },
    v1: {
      sid: 'v1',
      stype: 'variable',
      attributes: { name: '강조', kind: 'color', label: '강조색', value: '#0f766e' }
    },
    v2: { sid: 'v2', stype: 'variable', attributes: { name: '회사', value: '바로씨에스' } },
    v3: {
      sid: 'v3',
      stype: 'variable',
      attributes: { name: '분기', kind: 'choice', choices: ['1Q', '2Q'], value: '2Q' }
    },
    // Nothing could refer to it, so it is not a declaration — the rule a card with no id follows.
    nameless: { sid: 'nameless', stype: 'variable', attributes: { value: '유령' } }
  });

describe('reading what a document declares', () => {
  it('lists them in the author’s order, with a label to draw beside each', () => {
    expect(documentVars(deck()).map((one) => [one.name, one.kind, one.label, one.value])).toEqual([
      ['강조', 'color', '강조색', '#0f766e'],
      // No label of its own: the name, so a panel always has something to write in the gutter.
      ['회사', 'text', '회사', '바로씨에스'],
      ['분기', 'choice', '분기', '2Q']
    ]);
  });

  it('keeps a choice’s options, and drops a kind it does not have', () => {
    const access = deck();
    expect(documentVar(access, '분기')?.choices).toEqual(['1Q', '2Q']);
    (access.getNode('v2') as never as { attributes: Record<string, unknown> }).attributes = {
      name: '회사',
      kind: 'colour'
    };
    // A document from a tool with more kinds than this one: read as text rather than refused, which
    // is the same fallback a theme slot this product does not have gets.
    expect(documentVar(access, '회사')?.kind).toBe('text');
  });
});

describe('a reference to one', () => {
  it('is told apart from a value by its prefix', () => {
    // No CSS colour and no font name begins with `var:`, which is the whole reason for the prefix.
    expect(isVarRef(varRef('강조'))).toBe(true);
    expect(isVarRef('#0f766e')).toBe(false);
    expect(isVarRef('var:')).toBe(false);
    expect(isVarRef(120)).toBe(false);
  });

  it('resolves to the value, and leaves anything else alone', () => {
    const access = deck();
    expect(resolveVarValue(access, 'var:강조')).toBe('#0f766e');
    // Every document written before variables reads exactly as it did.
    expect(resolveVarValue(access, '#111111')).toBe('#111111');
  });

  it('resolves to nothing when the name is gone, rather than to a guess', () => {
    // So the caller draws nothing. Drawing the literal `var:없음` would put the reference on the
    // slide, and drawing black would hide that the document has lost something.
    expect(resolveVarValue(deck(), 'var:없음')).toBeUndefined();
  });
});

describe('how many places use one', () => {
  it('counts a reference in an attribute, and inside a paint', () => {
    const access = deck();
    expect(varUses(access, '강조')).toBe(1);

    (access.getNode('box') as never as { attributes: Record<string, unknown> }).attributes = {
      fills: [
        { kind: 'solid', color: 'var:강조' },
        { kind: 'gradient', stops: [{ color: 'var:강조' }, { color: '#fff' }] }
      ]
    };
    /*
     * A reference inside a paint or a gradient stop is as much a reference as an attribute holding
     * one — the same traversal the theme's resolution has to do, and the place it was missed first.
     *
     * **One** place, not two, and the number changed when the count and the rename were made one
     * walk: a place is a node's attribute, so a gradient naming it in two stops is one thing a
     * reader can go and look at. It was two while the walk counted references, which told a reader
     * their one fill was two places.
     */
    expect(varUses(access, '강조')).toBe(1);
    expect(varSites(access, '강조')).toEqual([{ sid: 'box', how: 'attr', attr: 'fills' }]);
  });

  it('counts a card’s binding, unless that card declares the name itself', () => {
    const access = doc({
      root: { sid: 'root', stype: 'document', content: ['lib', 'vars'] },
      vars: { sid: 'vars', stype: 'variables', attributes: {}, content: ['v1'] },
      v1: { sid: 'v1', stype: 'variable', attributes: { name: '강조', value: '#0f766e' } },
      lib: { sid: 'lib', stype: 'components', attributes: {}, content: ['open', 'shadowed'] },
      open: {
        sid: 'open',
        stype: 'component',
        attributes: { id: 'open' },
        content: ['b1', 'p1']
      },
      b1: {
        sid: 'b1',
        stype: 'componentBind',
        attributes: { part: 'back', attr: 'fill', var: '강조' }
      },
      p1: { sid: 'p1', stype: 'rectangle', attributes: { partId: 'back' } },
      shadowed: {
        sid: 'shadowed',
        stype: 'component',
        attributes: { id: 'shadowed' },
        content: ['v-own', 'b2', 'p2']
      },
      // The card declares the same name, so its binding was never pointing at the document's.
      'v-own': { sid: 'v-own', stype: 'componentVar', attributes: { name: '강조', value: '#ef4444' } },
      b2: {
        sid: 'b2',
        stype: 'componentBind',
        attributes: { part: 'back', attr: 'fill', var: '강조' }
      },
      p2: { sid: 'p2', stype: 'rectangle', attributes: { partId: 'back' } }
    });
    expect(varUses(access, '강조')).toBe(1);
  });
});

describe('what the count was missing, and renaming one', () => {
  /**
   * A deck where the same name means two different things, which is the case a rename must get
   * right or it corrupts a slide: the document declares 강조, and one page declares its own.
   */
  const twoScopes = () =>
    doc({
      root: { sid: 'root', stype: 'document', content: ['vars', 'page', 'other'] },
      vars: { sid: 'vars', stype: 'variables', attributes: {}, content: ['v'] },
      v: { sid: 'v', stype: 'variable', attributes: { name: '강조', kind: 'color', value: '#0f766e' } },

      page: {
        sid: 'page',
        stype: 'surface',
        attributes: { kind: 'slide' },
        content: ['ref', 'bound', 'deep']
      },
      ref: { sid: 'ref', stype: 'rectangle', attributes: { fill: 'var:강조' }, parentId: 'page' },
      bound: {
        sid: 'bound',
        stype: 'rectangle',
        attributes: { varBinds: [{ attr: 'width', var: '강조' }, { attr: 'text', var: '회사' }] },
        parentId: 'page'
      },
      deep: {
        sid: 'deep',
        stype: 'rectangle',
        attributes: { fills: [{ kind: 'gradient', stops: [{ color: 'var:강조' }, { color: '#fff' }] }] },
        parentId: 'page'
      },

      other: { sid: 'other', stype: 'surface', attributes: { kind: 'slide' }, content: ['own', 'mine'] },
      own: { sid: 'own', stype: 'variable', attributes: { name: '강조', value: '#ef4444' }, parentId: 'other' },
      mine: { sid: 'mine', stype: 'rectangle', attributes: { fill: 'var:강조' }, parentId: 'other' }
    });

  /**
   * Measured before it was fixed: a variable three shapes took their width from reported **zero**
   * uses, because the walk looked for `var:` references and a `varBinds` entry holds a bare name.
   * The panel offered to delete it with a shrug.
   */
  it('counts a shape’s own binding, which it did not', () => {
    const access = twoScopes();
    const bind = varSites(access, '강조').filter((site) => site.how === 'bind');
    expect(bind).toEqual([{ sid: 'bound', how: 'bind', attr: 'width' }]);
  });

  /**
   * And the other half: a page that declares the same name means *its* variable there. Counting
   * those as the document's overstates the uses; rewriting them would change what a shape draws.
   */
  it('leaves alone the page that declares the same name', () => {
    const access = twoScopes();
    // The document's: the reference, the gradient stop, and the shape's binding — not `mine`.
    expect(varUses(access, '강조')).toBe(3);
    expect(varSites(access, '강조').map((site) => site.sid).sort()).toEqual(['bound', 'deep', 'ref']);

    // The page's own, asked by its declaration: only the shape on that page.
    expect(varUses(access, '강조', 'own')).toBe(1);
    expect(varSites(access, '강조', 'own')).toEqual([{ sid: 'mine', how: 'attr', attr: 'fill' }]);
  });

  it('writes every place that names it, and nothing that does not', () => {
    const access = twoScopes();
    const plan = renameVarPlan(access, '강조', '포인트')!;

    expect(plan.declaration).toBe('v');
    const written = new Map(plan.writes.map((write) => [write.sid, write.attributes]));
    expect([...written.keys()].sort()).toEqual(['bound', 'deep', 'ref']);

    expect(written.get('ref')).toEqual({ fill: 'var:포인트' });
    // A reference inside a paint is rewritten where it sits, and the value around it is copied
    // rather than edited: the document is what the store holds, and a plan is a proposal.
    expect(written.get('deep')).toEqual({
      fills: [{ kind: 'gradient', stops: [{ color: 'var:포인트' }, { color: '#fff' }] }]
    });
    expect((access.getNode('deep') as never as { attributes: any }).attributes.fills[0].stops[0].color).toBe(
      'var:강조'
    );
    // The whole list, because an attribute is written as a value — and the other binding is left
    // exactly as it was.
    expect(written.get('bound')).toEqual({
      varBinds: [{ attr: 'width', var: '포인트' }, { attr: 'text', var: '회사' }]
    });
  });

  it('renames a card’s binding, unless the card declares the name itself', () => {
    const access = doc({
      root: { sid: 'root', stype: 'document', content: ['vars', 'lib'] },
      vars: { sid: 'vars', stype: 'variables', attributes: {}, content: ['v'] },
      v: { sid: 'v', stype: 'variable', attributes: { name: '강조', value: '#0f766e' } },
      lib: { sid: 'lib', stype: 'components', attributes: {}, content: ['open', 'closed'] },
      open: { sid: 'open', stype: 'component', attributes: { id: 'open' }, content: ['b1'] },
      b1: { sid: 'b1', stype: 'componentBind', attributes: { part: 'back', attr: 'fill', var: '강조' } },
      closed: { sid: 'closed', stype: 'component', attributes: { id: 'closed' }, content: ['own', 'b2'] },
      own: { sid: 'own', stype: 'componentVar', attributes: { name: '강조', value: '#ef4444' } },
      b2: { sid: 'b2', stype: 'componentBind', attributes: { part: 'back', attr: 'fill', var: '강조' } }
    });

    const plan = renameVarPlan(access, '강조', '포인트')!;
    expect(plan.writes).toEqual([{ sid: 'b1', attributes: { var: '포인트' } }]);
  });

  it('refuses the renames that would quietly merge or do nothing', () => {
    const access = twoScopes();
    // Onto itself, onto nothing, and from a name this scope does not declare.
    expect(renameVarPlan(access, '강조', '강조')).toBeUndefined();
    expect(renameVarPlan(access, '강조', '')).toBeUndefined();
    expect(renameVarPlan(access, '없는이름', '포인트')).toBeUndefined();
  });
});

describe('a card built against the document', () => {
  const carded = (over: Record<string, unknown> = {}) =>
    doc({
      root: { sid: 'root', stype: 'document', content: ['slide', 'lib', 'vars'] },
      vars: { sid: 'vars', stype: 'variables', attributes: {}, content: ['v1', 'v2'] },
      v1: { sid: 'v1', stype: 'variable', attributes: { name: '강조', kind: 'color', value: '#0f766e' } },
      v2: { sid: 'v2', stype: 'variable', attributes: { name: '회사', value: '바로씨에스' } },
      slide: { sid: 'slide', stype: 'surface', attributes: { kind: 'slide' }, content: ['one'] },
      lib: { sid: 'lib', stype: 'components', attributes: {}, content: ['card'] },
      card: {
        sid: 'card',
        stype: 'component',
        attributes: { id: 'card' },
        content: ['b-fill', 'b-text', ...(over.declares ? ['v-own'] : []), 'back', 'title']
      },
      'v-own': {
        sid: 'v-own',
        stype: 'componentVar',
        attributes: { name: '강조', kind: 'color', value: '#ef4444' }
      },
      'b-fill': {
        sid: 'b-fill',
        stype: 'componentBind',
        attributes: { part: 'back', attr: 'fill', var: '강조' }
      },
      'b-text': {
        sid: 'b-text',
        stype: 'componentBind',
        attributes: { part: 'title', attr: 'text', var: '회사' }
      },
      back: { sid: 'back', stype: 'rectangle', attributes: { partId: 'back' } },
      title: {
        sid: 'title',
        stype: 'textFrame',
        attributes: { partId: 'title' },
        content: ['line']
      },
      line: { sid: 'line', stype: 'paragraph', attributes: {}, content: ['run'] },
      run: { sid: 'run', stype: 'inline-text', attributes: {}, text: '이름' },
      one: {
        sid: 'one',
        stype: 'instance',
        attributes: { componentId: 'card' },
        content: (over.said as string[]) ?? []
      },
      said: { sid: 'said', stype: 'componentValue', attributes: { name: '강조', value: '#2563eb' } }
    });

  const drawn = (access: CanvasAccess) =>
    instanceParts(access, access.getNode('one') as never) as never as {
      attributes?: Record<string, unknown>;
      content?: { content?: { text?: string }[] }[];
    }[];

  it('takes a binding’s value from the document when the card declares no such thing', () => {
    const parts = drawn(carded());
    // The whole point of this step: one decision in one place, reaching a card that never had to
    // declare it and a placement that never had to answer it.
    expect(parts[0].attributes?.fill).toBe('#0f766e');
    expect(parts[1].content?.[0].content?.[0].text).toBe('바로씨에스');
  });

  it('lets the card’s own declaration win', () => {
    /*
     * Card first, and the reason is the import: a card carried into a deck that happens to have a
     * variable of the same name must not quietly change meaning. A brand kit whose cards meant
     * something different per deck is not a brand kit.
     */
    expect(drawn(carded({ declares: true }))[0].attributes?.fill).toBe('#ef4444');
  });

  it('lets a placement answer over both', () => {
    const parts = drawn(carded({ declares: true, said: ['said'] }));
    expect(parts[0].attributes?.fill).toBe('#2563eb');
  });

  it('resolves a reference written as a card’s own default', () => {
    const access = carded({ declares: true });
    (access.getNode('v-own') as never as { attributes: Record<string, unknown> }).attributes = {
      name: '강조',
      kind: 'color',
      // "Mine, unless the document says otherwise" — the theme's composition one layer along.
      value: 'var:강조'
    };
    expect(drawn(access)[0].attributes?.fill).toBe('#0f766e');
    expect(instanceValues(access, access.getNode('one'), componentsOf(access)[0]).get('강조')).toBe(
      '#0f766e'
    );
  });
});

/**
 * What a **shape** takes from a variable.
 *
 * The other half of §10h, and the one the measurement forced into a different shape: a reference in
 * the attribute works for a colour and is **refused** in a number or a boolean, so a bare shape
 * needs a *declaration* — `varBinds` on itself, for the reasons the schema's comment gives (a child
 * node would make every atom a container; a list keyed by the shape's `name` would be ambiguous,
 * because `namedBoxes` already takes the first of a name).
 */
describe('a shape bound to a variable', () => {
  const shaped = (binds: unknown, over: Record<string, unknown> = {}) =>
    doc({
      root: { sid: 'root', stype: 'document', content: ['slide', 'vars'] },
      slide: { sid: 'slide', stype: 'surface', attributes: { kind: 'slide' }, content: ['box'] },
      box: {
        sid: 'box',
        stype: 'rectangle',
        attributes: {
          x: 100,
          y: 100,
          width: 1000,
          height: 800,
          cornerRadius: 40,
          visible: true,
          varBinds: binds,
          ...over
        }
      },
      vars: { sid: 'vars', stype: 'variables', attributes: {}, content: ['round', 'on', 'accent'] },
      round: {
        sid: 'round',
        stype: 'variable',
        attributes: { name: '둥글기', kind: 'number', value: '240' }
      },
      on: { sid: 'on', stype: 'variable', attributes: { name: '보이기', kind: 'boolean', value: 'false' } },
      accent: {
        sid: 'accent',
        stype: 'variable',
        attributes: { name: '강조', kind: 'color', value: '#0f766e' }
      }
    });

  it('reads its declarations, and ignores rubbish in the list', () => {
    const access = shaped([
      { attr: 'cornerRadius', var: '둥글기' },
      { attr: '', var: '둥글기' },
      { var: '둥글기' },
      'nonsense',
      null
    ]);
    // A document is an author's: half of a declaration is not one, and a file that holds junk must
    // not take the editor down with it.
    expect(varBindsOf(access.getNode('box')).map((one) => one.attr)).toEqual(['cornerRadius']);
  });

  it('writes a number where a number goes', () => {
    const access = shaped([{ attr: 'cornerRadius', var: '둥글기' }]);
    /*
     * The conversion a card's binding already does, for the same reason: the document keeps a value
     * as a string — one shape to write, diff and check — and a length has to be a number by the time
     * it is drawn.
     */
    expect(boundAttrs(access, access.getNode('box'))?.cornerRadius).toBe(240);
  });

  it('writes only the falsy half of a state', () => {
    const off = shaped([{ attr: 'visible', var: '보이기' }]);
    expect(boundAttrs(off, off.getNode('box'))?.visible).toBe(false);

    (off.getNode('on') as never as { attributes: Record<string, unknown> }).attributes = {
      name: '보이기',
      kind: 'boolean',
      value: 'true'
    };
    // `visible: true` beside no `visible` at all is the same drawing — the asymmetry the conformance
    // probe finds in every boolean — so only `false` is ever written.
    expect('visible' in (boundAttrs(off, off.getNode('box')) ?? {})).toBe(false);
  });

  it('answers nothing when nothing is bound, so a plain deck copies nothing', () => {
    // Asked on every read of every container, so the cheap answer matters: one array check, no copy.
    expect(boundAttrs(shaped(undefined), shaped(undefined).getNode('box'))).toBeUndefined();
    expect(boundAttrs(shaped([]), shaped([]).getNode('box'))).toBeUndefined();
  });

  it('draws no geometry at all: every bit of it is written instead', () => {
    const access = shaped([
      { attr: 'width', var: '둥글기' },
      { attr: 'x', var: '둥글기' },
      { attr: 'rotation', var: '둥글기' }
    ]);
    /*
     * Counted rather than argued: the geometry is read by `boxOf` in 31 places across 14 files — the
     * outline, the handles, the guides, the snapping, alignment, group bounds, the audit's "off the
     * edge" check — so geometry that was only *drawn* would be answered differently by every one of
     * them. So the drawing resolves none of it, and the pass that settles derived geometry writes it.
     */
    expect(boundAttrs(access, access.getNode('box'))).toBeUndefined();
    expect(boundGeometry(access, access.getNode('box'))).toEqual({
      width: 240,
      x: 240,
      rotation: 240
    });

    /*
     * And nothing is refused outright any more. `x`, `y` and `rotation` were, with a sentence about
     * behaviour rather than about the value — "a box that snaps back when you drag it" — and the
     * behaviour is what changed: the drag is refused *before* it previews, so nothing snaps back.
     */
    expect([...UNBINDABLE]).toEqual([]);
  });

  it('lets a place be negative and refuses a negative size', () => {
    // A shape at -200 hangs off the left edge, which is ordinary on a canvas. A width of -200 is a
    // shape turned inside out — `boxOf` normalises that for the drawing, so a variable meaning it
    // would mislead a reader twice.
    const access = shaped([{ attr: 'x', var: '둥글기' }, { attr: 'width', var: '보이기' }]);
    (access.getNode('round') as never as { attributes: Record<string, unknown> }).attributes = {
      name: '둥글기',
      kind: 'number',
      value: '-200'
    };
    (access.getNode('on') as never as { attributes: Record<string, unknown> }).attributes = {
      name: '보이기',
      kind: 'number',
      value: '-200'
    };
    expect(boundGeometry(access, access.getNode('box'))).toEqual({ x: -200 });
  });

  it('says which parts of a box a variable owns, one question per gesture', () => {
    /*
     * Three questions because they are three gestures, each refused in its own place: the resize
     * handles and the size fields, the move drag, and the rotate handle.
     */
    expect(sizeIsBound(shaped([{ attr: 'width', var: '둥글기' }]).getNode('box'))).toBe(true);
    expect(placeIsBound(shaped([{ attr: 'width', var: '둥글기' }]).getNode('box'))).toBe(false);
    expect(placeIsBound(shaped([{ attr: 'y', var: '둥글기' }]).getNode('box'))).toBe(true);
    expect(turnIsBound(shaped([{ attr: 'rotation', var: '둥글기' }]).getNode('box'))).toBe(true);
    expect(turnIsBound(shaped([{ attr: 'x', var: '둥글기' }]).getNode('box'))).toBe(false);
  });

  it('answers only what differs, so the pass that writes it cannot feed itself', () => {
    // The arrangement's own rule, and for the same reason: this is read by a reaction that runs on
    // every document change, so an answer already in the document has to be no answer at all.
    const settled = shaped([{ attr: 'width', var: '둥글기' }], { width: 240 });
    expect(boundGeometry(settled, settled.getNode('box'))).toBeUndefined();
  });

  it('ignores a variable that is not a number, rather than collapsing the shape', () => {
    const access = shaped([{ attr: 'width', var: '둥글기' }]);
    // The good case first, so the assertion below is about the value and not about the fixture.
    expect(boundGeometry(access, access.getNode('box'))).toEqual({ width: 240 });

    (access.getNode('round') as never as { attributes: Record<string, unknown> }).attributes = {
      name: '둥글기',
      kind: 'number',
      value: '넓게'
    };
    /*
     * `"넓게"` in a width is a document saying something this cannot act on. Writing 0 would collapse
     * the shape to nothing, and a reader would then see the fault without its cause.
     */
    expect(boundGeometry(access, access.getNode('box'))).toBeUndefined();
  });

  it('says when a shape’s size is a variable’s answer rather than the reader’s', () => {
    // What the overlay and the panel ask before offering a resize: a drag that is written back by
    // the next pass is a gesture that changes nothing, which this product refuses visibly.
    expect(sizeIsBound(shaped([{ attr: 'width', var: '둥글기' }]).getNode('box'))).toBe(true);
    expect(sizeIsBound(shaped([{ attr: 'cornerRadius', var: '둥글기' }]).getNode('box'))).toBe(false);
  });

  it('leaves the attribute alone when the variable is gone', () => {
    const access = shaped([{ attr: 'cornerRadius', var: '없는것' }]);
    /*
     * Different from a `var:` reference on purpose, and the difference is what the document *said*: a
     * reference says "this value **is** the variable", so losing it draws nothing; a binding says
     * "take it from the variable if there is one", so losing it leaves what the shape holds. Both are
     * reported by the deck's own check.
     */
    expect(boundAttrs(access, access.getNode('box'))).toBeUndefined();
    expect(access.getNode('box')?.attributes?.cornerRadius).toBe(40);
  });

  it('answers a shape’s words separately, because characters are content', () => {
    const access = doc({
      root: { sid: 'root', stype: 'document', content: ['slide', 'vars'] },
      slide: { sid: 'slide', stype: 'surface', attributes: { kind: 'slide' }, content: ['frame'] },
      frame: {
        sid: 'frame',
        stype: 'textFrame',
        attributes: { x: 0, y: 0, width: 2000, height: 400, varBinds: [{ attr: 'text', var: '회사' }] },
        content: ['line']
      },
      line: { sid: 'line', stype: 'paragraph', attributes: { fontSize: 44 }, content: ['a', 'b'] },
      a: { sid: 'a', stype: 'inline-text', attributes: {}, text: '옛 이름' },
      b: { sid: 'b', stype: 'inline-text', attributes: {}, text: ' 그리고 더' },
      vars: { sid: 'vars', stype: 'variables', attributes: {}, content: ['v'] },
      v: { sid: 'v', stype: 'variable', attributes: { name: '회사', value: '바로씨에스' } }
    });

    expect(boundText(access, access.getNode('frame'))).toBe('바로씨에스');
    // `text` is not an attribute, so it is not in the attribute answer at all.
    expect(boundAttrs(access, access.getNode('frame'))).toBeUndefined();

    const drawn = contentWithWords(access, access.getNode('frame'), '바로씨에스') as never as {
      attributes: Record<string, unknown>;
      content: { text?: string }[];
    }[];
    // One run, the first one's formatting, the variable's characters — the rule a card's bound part
    // follows, because writing into the first and leaving the rest puts the value on the page
    // followed by whatever was there next.
    expect(drawn).toHaveLength(1);
    expect(drawn[0].attributes.fontSize).toBe(44);
    expect(drawn[0].content).toEqual([{ sid: 'a', stype: 'inline-text', attributes: {}, text: '바로씨에스' }]);
  });
});

/**
 * **Scope**: the document says what the deck's values are, and one page may say something else.
 *
 * The ordinary specificity rule — the narrower wins — with one exception that lives in
 * `instanceValues` and is tested with the cards: a **card's own** declaration beats both, so carrying
 * a card onto a page cannot change what the card means.
 */
describe('a page that declares its own', () => {
  const scoped = () =>
    doc({
      root: { sid: 'root', stype: 'document', content: ['one', 'two', 'lib', 'vars'] },

      // A page with a declaration of its own, first among its children where the schema says.
      one: {
        sid: 'one',
        stype: 'surface',
        attributes: { kind: 'slide', name: '요약' },
        content: ['v-page', 'box']
      },
      'v-page': {
        sid: 'v-page',
        stype: 'variable',
        attributes: { name: '강조', kind: 'color', value: '#b45309' }
      },
      box: {
        sid: 'box',
        stype: 'rectangle',
        attributes: { fill: 'var:강조', cornerRadius: 10, varBinds: [{ attr: 'cornerRadius', var: '둥글기' }] },
        parentId: 'one'
      },

      // A page with none: the document's is what its shapes mean.
      two: { sid: 'two', stype: 'surface', attributes: { kind: 'slide' }, content: ['other'] },
      other: { sid: 'other', stype: 'rectangle', attributes: { fill: 'var:강조' }, parentId: 'two' },

      lib: { sid: 'lib', stype: 'components', attributes: {}, content: [] },
      vars: { sid: 'vars', stype: 'variables', attributes: {}, content: ['v-doc', 'v-round'] },
      'v-doc': { sid: 'v-doc', stype: 'variable', attributes: { name: '강조', kind: 'color', value: '#0f766e' } },
      'v-round': { sid: 'v-round', stype: 'variable', attributes: { name: '둥글기', kind: 'number', value: '240' } }
    });

  it('lists what the page declares, and nothing from anywhere else', () => {
    expect(surfaceVars(scoped(), 'one').map((one) => [one.name, one.value])).toEqual([
      ['강조', '#b45309']
    ]);
    expect(surfaceVars(scoped(), 'two')).toEqual([]);
    // Asked of something that is not a page: nothing, rather than a guess about its children.
    expect(surfaceVars(scoped(), 'lib')).toEqual([]);
  });

  it('finds the page a shape is on, and nothing for a shape that is on none', () => {
    // By `parentId`, because the node knows where it is — and a card's part has no page at all,
    // which is why what a card draws takes its scope from the placement.
    expect(surfaceOf(scoped(), 'box')).toBe('one');
    expect(surfaceOf(scoped(), 'vars')).toBeUndefined();
  });

  it('lets the page win where it declares, and the document answer where it does not', () => {
    const access = scoped();
    expect(varInScope(access, 'box', '강조')?.value).toBe('#b45309');
    expect(varInScope(access, 'other', '강조')?.value).toBe('#0f766e');
    // A name only the document declares is the document's on every page.
    expect(varInScope(access, 'box', '둥글기')?.value).toBe('240');
    // And a name nobody declares is nothing, wherever it is asked from.
    expect(varInScope(access, 'box', '없음')).toBeUndefined();
  });

  it("reaches a card through the placement's page, and stops at the card's own name", () => {
    const access = doc({
      root: { sid: 'root', stype: 'document', content: ['page', 'lib', 'vars'] },

      page: {
        sid: 'page',
        stype: 'surface',
        attributes: { kind: 'slide' },
        content: ['v-page', 'one', 'two']
      },
      'v-page': {
        sid: 'v-page',
        stype: 'variable',
        attributes: { name: '강조', kind: 'color', value: '#b45309' }
      },
      one: {
        sid: 'one',
        stype: 'instance',
        attributes: { componentId: 'open' },
        content: [],
        parentId: 'page'
      },
      two: {
        sid: 'two',
        stype: 'instance',
        attributes: { componentId: 'own' },
        content: [],
        parentId: 'page'
      },

      lib: { sid: 'lib', stype: 'components', attributes: {}, content: ['open', 'own'] },
      // A card that names 강조 and declares nothing: it takes what its page says.
      open: { sid: 'open', stype: 'component', attributes: { id: 'open' }, content: ['b1', 'p1'] },
      b1: { sid: 'b1', stype: 'componentBind', attributes: { part: 'back', attr: 'fill', var: '강조' } },
      p1: { sid: 'p1', stype: 'rectangle', attributes: { partId: 'back' }, parentId: 'open' },
      // A card that declares 강조 itself: nothing outside it can change what it means.
      own: { sid: 'own', stype: 'component', attributes: { id: 'own' }, content: ['v-own', 'b2', 'p2'] },
      'v-own': {
        sid: 'v-own',
        stype: 'componentVar',
        attributes: { name: '강조', kind: 'color', value: '#ef4444' }
      },
      b2: { sid: 'b2', stype: 'componentBind', attributes: { part: 'back', attr: 'fill', var: '강조' } },
      p2: { sid: 'p2', stype: 'rectangle', attributes: { partId: 'back' }, parentId: 'own' },

      vars: { sid: 'vars', stype: 'variables', attributes: {}, content: ['v-doc'] },
      'v-doc': { sid: 'v-doc', stype: 'variable', attributes: { name: '강조', kind: 'color', value: '#0f766e' } }
    });

    const fillOf = (sid: string) =>
      (instanceParts(access, access.getNode(sid) as never) as never as {
        attributes?: Record<string, unknown>;
      }[])[0].attributes?.fill;

    /*
     * The page's, because the card asked for a name it does not declare — and it is the
     * **placement's** page, not the card's: a definition is not on a page at all.
     */
    expect(fillOf('one')).toBe('#b45309');
    /*
     * And the card's own, because carrying a card onto a page that happens to declare that name must
     * not change what the card means. A brand kit whose cards meant something different per page is
     * not a brand kit.
     */
    expect(fillOf('two')).toBe('#ef4444');
  });

  it('resolves a reference and a binding in the scope of the shape that holds it', () => {
    const access = scoped();
    expect(resolveVarValue(access, 'var:강조', 'box')).toBe('#b45309');
    expect(resolveVarValue(access, 'var:강조', 'other')).toBe('#0f766e');
    // Asked with no scope at all — a master's paint, a layout's placeholder — the document answers.
    expect(resolveVarValue(access, 'var:강조')).toBe('#0f766e');

    // A binding takes the same road: `둥글기` is only the document's, so both pages get 240.
    expect(boundAttrs(access, access.getNode('box'))?.cornerRadius).toBe(240);
  });
});

/**
 * A value that came from **another deck**.
 *
 * The brand kit's argument (§10f) applied to a value rather than a card: twenty decks use one brand's
 * colours, another document is not in this one, and no engine trick makes it so. So it is a copy that
 * remembers its source — and remembering is the whole difference between a library and a paste.
 */
describe('bringing a value in from a library', () => {
  const brand = () =>
    doc({
      root: { sid: 'root', stype: 'document', content: ['vars'] },
      vars: { sid: 'vars', stype: 'variables', attributes: {}, content: ['v1', 'v2'] },
      v1: {
        sid: 'v1',
        stype: 'variable',
        attributes: { name: '강조', kind: 'color', label: '브랜드 강조', value: '#0f766e' }
      },
      v2: {
        sid: 'v2',
        stype: 'variable',
        attributes: { name: '분기', kind: 'choice', choices: ['1Q', '2Q'], value: '2Q' }
      }
    });

  const deckWith = (nodes: Record<string, Record<string, unknown>>) =>
    doc({ root: { sid: 'root', stype: 'document', content: Object.keys(nodes) }, ...nodes });

  it('copies the value with what a reader needs to read it', () => {
    const plan = importVariablePlan(deckWith({}), brand(), '강조', 'brand-kit');
    expect(plan?.replaces).toBeUndefined();
    // The label, the kind and the choices come too: a value whose name a reader cannot read is half
    // a declaration.
    expect(plan?.node.attributes).toEqual({
      name: '강조',
      kind: 'color',
      label: '브랜드 강조',
      value: '#0f766e',
      fromDeck: 'brand-kit',
      fromValue: '#0f766e'
    });
  });

  it('brings a choice’s options with it', () => {
    const plan = importVariablePlan(deckWith({}), brand(), '분기', 'brand-kit');
    expect(plan?.node.attributes?.choices).toEqual(['1Q', '2Q']);
  });

  it('answers nothing for a name that deck does not declare', () => {
    // A button that reports success and brings nothing is worse than one that is greyed.
    expect(importVariablePlan(deckWith({}), brand(), '없음', 'brand-kit')).toBeUndefined();
  });

  it('overwrites a name this deck already has, where a card would be renamed', () => {
    const host = doc({
      root: { sid: 'root', stype: 'document', content: ['vars'] },
      vars: { sid: 'vars', stype: 'variables', attributes: {}, content: ['mine'] },
      mine: { sid: 'mine', stype: 'variable', attributes: { name: '강조', value: '#b45309' } }
    });

    const plan = importVariablePlan(host, brand(), '강조', 'brand-kit');
    /*
     * A card that clashes is renamed and goes on being the same card. A variable cannot: its **name
     * is the reference** — every attribute and binding in the deck is written in that string — so an
     * import under another name would change nothing that already names it. So the gesture is read as
     * what it plainly is: *give me the library's value for this name*.
     */
    expect(plan?.replaces).toBe('mine');
    expect(plan?.node.attributes?.value).toBe('#0f766e');
  });

  it('says when the deck it came from has moved on, and not before', () => {
    const imported = doc({
      root: { sid: 'root', stype: 'document', content: ['vars'] },
      vars: { sid: 'vars', stype: 'variables', attributes: {}, content: ['copy', 'own'] },
      copy: {
        sid: 'copy',
        stype: 'variable',
        attributes: { name: '강조', value: '#0f766e', fromDeck: 'brand-kit', fromValue: '#0f766e' }
      },
      // This deck's own value, which came from nowhere and can never be behind anything.
      own: { sid: 'own', stype: 'variable', attributes: { name: '주의', value: '#ef4444' } }
    });

    expect(variableSourceOf(imported, '강조')).toEqual({ deck: 'brand-kit', value: '#0f766e' });
    expect(variableSourceOf(imported, '주의')).toBeUndefined();
    expect(variableBehindSource(imported, brand(), '강조')).toBe(false);

    // The brand changes its mind.
    const moved = brand();
    (moved.getNode('v1') as never as { attributes: Record<string, unknown> }).attributes = {
      name: '강조',
      kind: 'color',
      value: '#15803d'
    };
    expect(variableBehindSource(imported, moved, '강조')).toBe(true);
  });

  it('is not behind when there is nothing to compare', () => {
    // A copy from before this existed, or a value the reader typed over: not behind, because calling
    // every one of them behind would put a badge on every deck.
    const vague = doc({
      root: { sid: 'root', stype: 'document', content: ['vars'] },
      vars: { sid: 'vars', stype: 'variables', attributes: {}, content: ['copy'] },
      copy: { sid: 'copy', stype: 'variable', attributes: { name: '강조', value: '#000', fromDeck: 'brand-kit' } }
    });
    expect(variableBehindSource(vague, brand(), '강조')).toBe(false);
    expect(variableBehindSource(vague, undefined, '강조')).toBe(false);
  });
});
