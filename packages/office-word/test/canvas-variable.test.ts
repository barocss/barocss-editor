import { describe, it, expect } from 'vitest';
import {
  documentVar,
  documentVars,
  isVarRef,
  resolveVarValue,
  varRef,
  varUses
} from '../src/canvas-variable';
import { componentsOf, instanceValues } from '../src/canvas-component';
import { instanceParts } from '../src/canvas-instance';
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
