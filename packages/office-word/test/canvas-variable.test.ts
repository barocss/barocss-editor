import { describe, it, expect } from 'vitest';
import {
  boundAttrs,
  boundText,
  documentVar,
  documentVars,
  isVarRef,
  resolveVarValue,
  varBindsOf,
  varRef,
  varUses,
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
    // A reference inside a paint or a gradient stop is as much a reference as an attribute holding
    // one — the same traversal the theme's resolution has to do, and the place it was missed first.
    expect(varUses(access, '강조')).toBe(2);
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

  it('refuses geometry, in the model rather than in a panel', () => {
    const access = shaped([
      { attr: 'width', var: '둥글기' },
      { attr: 'x', var: '둥글기' },
      { attr: 'rotation', var: '둥글기' }
    ]);
    /*
     * Measured rather than chosen: a bound size is *drawn* where the resolution says and *answered*
     * where the document says, and the overlay, the guides, the snapping and every command read the
     * answer — so the handles would sit where the shape is not. In the model so the panel and the
     * command cannot disagree about the list.
     */
    expect(boundAttrs(access, access.getNode('box'))).toBeUndefined();
    expect([...UNBINDABLE]).toContain('width');
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
