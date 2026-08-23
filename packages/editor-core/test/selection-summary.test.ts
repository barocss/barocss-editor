import { describe, it, expect } from 'vitest';
import { markAttribute, markState, readSelectionSummary } from '../src/selection-summary';
import type { ModelSelection } from '../src/types';

/**
 * What a toolbar, a status bar or a screen reader needs to know about the
 * selection.
 *
 * The answer is three-valued. A selection across text that is partly bold is
 * neither bold nor not bold, and a control that renders that as "off" turns one
 * click into a silent reformat of everything the user had selected.
 */
const store = (nodes: Record<string, any>) =>
  ({
    getNode: (sid: string) => nodes[sid],
    getNodesInRange: (start: string, end: string) => {
      const order = Object.keys(nodes);
      const from = order.indexOf(start);
      const to = order.indexOf(end);
      return from < 0 || to < 0 ? [] : order.slice(from, to + 1);
    }
  }) as any;

const range = (
  startNodeId: string,
  startOffset: number,
  endNodeId: string,
  endOffset: number
): ModelSelection =>
  ({
    type: 'range',
    startNodeId,
    startOffset,
    endNodeId,
    endOffset,
    collapsed: startNodeId === endNodeId && startOffset === endOffset
  }) as ModelSelection;

describe('marks under the selection', () => {
  const bolded = store({
    p: { sid: 'p', stype: 'paragraph', attributes: { styleId: 'Body' } },
    t: {
      sid: 't',
      stype: 'inline-text',
      parentId: 'p',
      text: 'Hello brave world',
      marks: [
        { stype: 'bold', range: [0, 11] },
        { stype: 'italic', range: [6, 11] }
      ]
    }
  });

  it('reports a mark that covers the whole selection', () => {
    const state = readSelectionSummary(bolded, range('t', 0, 't', 5));
    expect(state.marks).toContain('bold');
    expect(markState(state, 'bold')).toBe('on');
  });

  it('reports a mark that covers only part of it as mixed', () => {
    // "Hello brave" is bold; "world" is not
    const state = readSelectionSummary(bolded, range('t', 0, 't', 17));
    expect(state.mixedMarks).toContain('bold');
    expect(markState(state, 'bold')).toBe('mixed');
  });

  it('reports a mark that covers none of it as off', () => {
    const state = readSelectionSummary(bolded, range('t', 12, 't', 17));
    expect(markState(state, 'bold')).toBe('off');
    expect(markState(state, 'italic')).toBe('off');
  });

  it('distinguishes two marks over the same text', () => {
    const state = readSelectionSummary(bolded, range('t', 6, 't', 11));
    expect(state.marks).toEqual(['bold', 'italic']);
  });

  it('treats a mark with no range as covering the node', () => {
    const whole = store({
      p: { sid: 'p', stype: 'paragraph' },
      t: { sid: 't', stype: 'inline-text', parentId: 'p', text: 'Hello', marks: [{ stype: 'code' }] }
    });
    expect(markState(readSelectionSummary(whole, range('t', 1, 't', 4)), 'code')).toBe('on');
  });
});

describe('a caret rather than a span', () => {
  const doc = store({
    p: { sid: 'p', stype: 'paragraph' },
    t: {
      sid: 't',
      stype: 'inline-text',
      parentId: 'p',
      text: 'bold plain',
      marks: [{ stype: 'bold', range: [0, 4] }]
    }
  });

  it('reports the marks behind it, which decide what is typed next', () => {
    // Put the caret after a bold word and the bold button lights up — the
    // convention every word processor follows.
    expect(markState(readSelectionSummary(doc, range('t', 4, 't', 4)), 'bold')).toBe('on');
  });

  it('reports the marks ahead of it at the start of a node', () => {
    // There is nothing behind, so the only sensible answer is what follows
    expect(markState(readSelectionSummary(doc, range('t', 0, 't', 0)), 'bold')).toBe('on');
  });

  it('says it is a caret', () => {
    expect(readSelectionSummary(doc, range('t', 4, 't', 4)).collapsed).toBe(true);
    expect(readSelectionSummary(doc, range('t', 0, 't', 4)).collapsed).toBe(false);
  });
});

describe('the blocks the selection touches', () => {
  const doc = store({
    h: { sid: 'h', stype: 'heading', attributes: { level: 1, styleId: 'Heading1' } },
    ht: { sid: 'ht', stype: 'inline-text', parentId: 'h', text: 'Title' },
    p: { sid: 'p', stype: 'paragraph', attributes: { styleId: 'Body', alignment: 'left' } },
    pt: { sid: 'pt', stype: 'inline-text', parentId: 'p', text: 'Body text' },
    q: { sid: 'q', stype: 'paragraph', attributes: { styleId: 'Body', alignment: 'center' } },
    qt: { sid: 'qt', stype: 'inline-text', parentId: 'q', text: 'More text' }
  });

  it('reports the block a caret is in, not the text node', () => {
    // A style applies to the paragraph; the text node is where the caret is
    const state = readSelectionSummary(doc, range('pt', 2, 'pt', 2));
    expect(state.blocks.map((b) => b.sid)).toEqual(['p']);
    expect(state.blockAttributes.styleId).toBe('Body');
    expect(state.blockAttributes.stype).toBe('paragraph');
  });

  it('reports every block a span covers', () => {
    const state = readSelectionSummary(doc, range('ht', 0, 'qt', 4));
    expect(state.blocks.map((b) => b.sid)).toEqual(['h', 'p', 'q']);
  });

  it('reports an attribute the blocks agree on', () => {
    const state = readSelectionSummary(doc, range('pt', 0, 'qt', 4));
    expect(state.blockAttributes.styleId).toBe('Body');
  });

  it('reports one they disagree about as mixed, not as a value', () => {
    // Reporting it as a value is how a dropdown applies one style to a
    // selection that had two.
    const state = readSelectionSummary(doc, range('pt', 0, 'qt', 4));
    expect(state.mixedAttributes).toContain('alignment');
    expect(state.blockAttributes.alignment).toBeUndefined();
  });

  it('treats the block type the same way', () => {
    const mixed = readSelectionSummary(doc, range('ht', 0, 'pt', 4));
    expect(mixed.mixedAttributes).toContain('stype');

    const same = readSelectionSummary(doc, range('pt', 0, 'qt', 4));
    expect(same.blockAttributes.stype).toBe('paragraph');
  });
});

describe('a selection of whole nodes', () => {
  const doc = store({
    a: { sid: 'a', stype: 'rectangle', attributes: { fill: 'red' } },
    b: { sid: 'b', stype: 'rectangle', attributes: { fill: 'red' } },
    c: { sid: 'c', stype: 'ellipse', attributes: { fill: 'blue' } }
  });

  const nodes = (ids: string[]): ModelSelection =>
    ({
      type: 'node',
      nodeIds: ids,
      startNodeId: ids[0],
      startOffset: 0,
      endNodeId: ids[ids.length - 1],
      endOffset: 0,
      collapsed: false
    }) as ModelSelection;

  it('reports the nodes and no marks, which is the honest answer', () => {
    const state = readSelectionSummary(doc, nodes(['a', 'b']));
    expect(state.blocks.map((b) => b.sid)).toEqual(['a', 'b']);
    expect(state.marks).toEqual([]);
  });

  it('reports what they share and what they do not', () => {
    const same = readSelectionSummary(doc, nodes(['a', 'b']));
    expect(same.blockAttributes.fill).toBe('red');
    expect(same.blockAttributes.stype).toBe('rectangle');

    const differing = readSelectionSummary(doc, nodes(['a', 'c']));
    expect(differing.mixedAttributes).toContain('fill');
    expect(differing.mixedAttributes).toContain('stype');
  });
});

describe('nothing selected', () => {
  it('is empty rather than an error', () => {
    const state = readSelectionSummary(store({}), null);
    expect(state.empty).toBe(true);
    expect(state.marks).toEqual([]);
    expect(state.blocks).toEqual([]);
  });

  it('is empty without a store to ask', () => {
    expect(readSelectionSummary(undefined, range('t', 0, 't', 1)).empty).toBe(true);
  });
});

describe('asking whether a command could run', () => {
  it('fills in the selection, which is what almost every command requires', async () => {
    const { Editor } = await import('../src/editor');
    const editor = new Editor({}) as any;

    editor.registerCommand({
      name: 'needsSelection',
      execute: () => true,
      canExecute: (_e: any, payload: any) => !!payload?.selection
    });

    // Asking directly gets a flat no, which is how a toolbar ends up showing
    // every button disabled — the key map had this bug too.
    expect(editor.canExecuteCommand('needsSelection')).toBe(false);

    // The selection has to name something that exists: one that points at a
    // node the store does not have is not filled in, because a command given it
    // could only fail. That is not hypothetical — undo leaves exactly such a
    // selection behind.
    editor.dataStore.getNode = (sid: string) => (sid === 't' ? { sid, stype: 'inline-text' } : undefined);

    editor.selectionManager.setSelection({
      type: 'range',
      startNodeId: 't',
      startOffset: 0,
      endNodeId: 't',
      endOffset: 1,
      collapsed: false
    });
    expect(editor.canRun('needsSelection')).toBe(true);
  });

  it('lets a caller add what is particular to the command', async () => {
    const { Editor } = await import('../src/editor');
    const editor = new Editor({}) as any;

    let seen: any = null;
    editor.registerCommand({
      name: 'takesLevel',
      execute: (_e: any, payload: any) => {
        seen = payload;
        return true;
      },
      canExecute: () => true
    });

    await editor.run('takesLevel', { level: 2 });
    expect(seen.level).toBe(2);
  });

  it('says no for a command nobody registered', () => {
    const editor = { canExecuteCommand: () => false } as any;
    expect(editor.canExecuteCommand('nope')).toBe(false);
  });
});

describe('the values a mark carries', () => {
  it('reports them when every occurrence agrees', () => {
    // A name is enough for a toggle and not enough for a size control: eleven
    // points is a value, and `fontSize` alone does not say which.
    const doc = store({
      p: { sid: 'p', stype: 'paragraph' },
      t: {
        sid: 't',
        stype: 'inline-text',
        parentId: 'p',
        text: 'Hello world',
        marks: [{ stype: 'fontSize', range: [0, 11], attrs: { size: 22 } }]
      }
    });

    const state = readSelectionSummary(doc, range('t', 0, 't', 11));
    expect(state.markAttributes.fontSize).toEqual({ size: 22 });
  });

  it('leaves out a value the occurrences disagree about', () => {
    // Two runs at different sizes have no size between them, and a control that
    // showed one of the two would apply it to both on the next change.
    const doc = store({
      p: { sid: 'p', stype: 'paragraph' },
      a: {
        sid: 'a',
        stype: 'inline-text',
        parentId: 'p',
        text: 'big',
        marks: [{ stype: 'fontSize', range: [0, 3], attrs: { size: 40 } }]
      },
      b: {
        sid: 'b',
        stype: 'inline-text',
        parentId: 'p',
        text: 'small',
        marks: [{ stype: 'fontSize', range: [0, 5], attrs: { size: 20 } }]
      }
    });

    const state = readSelectionSummary(doc, range('a', 0, 'b', 5));
    expect(state.marks).toContain('fontSize');
    expect(state.markAttributes.fontSize).toEqual({});
  });

  it('reports the keys they do agree on, even when others differ', () => {
    const doc = store({
      p: { sid: 'p', stype: 'paragraph' },
      a: {
        sid: 'a',
        stype: 'inline-text',
        parentId: 'p',
        text: 'one',
        marks: [{ stype: 'border', range: [0, 3], attrs: { style: 'solid', color: 'red' } }]
      },
      b: {
        sid: 'b',
        stype: 'inline-text',
        parentId: 'p',
        text: 'two',
        marks: [{ stype: 'border', range: [0, 3], attrs: { style: 'solid', color: 'blue' } }]
      }
    });

    const state = readSelectionSummary(doc, range('a', 0, 'b', 3));
    expect(state.markAttributes.border).toEqual({ style: 'solid' });
  });

  it('says nothing about a mark that covers only part of the selection', () => {
    // Its value is not the selection's value, whatever it is
    const doc = store({
      p: { sid: 'p', stype: 'paragraph' },
      t: {
        sid: 't',
        stype: 'inline-text',
        parentId: 'p',
        text: 'Hello world',
        marks: [{ stype: 'fontSize', range: [0, 5], attrs: { size: 22 } }]
      }
    });

    const state = readSelectionSummary(doc, range('t', 0, 't', 11));
    expect(state.mixedMarks).toContain('fontSize');
    expect(state.markAttributes.fontSize).toBeUndefined();
  });
});

/**
 * The value the whole selection agrees on for one of a mark's attributes.
 *
 * Asked by every choice control and every colour palette in the suite, and it
 * was two hand-written copies of the same three lines inside one product's
 * toolbar model — one for choices and one for colours.
 */
describe('an attribute the selection agrees on', () => {
  const summary = (over: Record<string, unknown>) =>
    ({ marks: [], mixedMarks: [], markAttributes: {}, ...over }) as never;

  it('is the value, as a string', () => {
    // A string because a control shows and compares text. The document stores a
    // font size in half-points, and turning that back into points is the
    // *declaration's* business — see `labelOf` in office-controls.
    expect(markAttribute(summary({ markAttributes: { fontSize: { size: 22 } } }), 'fontSize', 'size')).toBe('22');
  });

  it('is nothing when the selection does not agree', () => {
    // Mixed is checked first, and that is the point: a selection spanning two
    // sizes still *has* a value under the mark, and answering with it would
    // apply that size to everything selected on the reader's next change.
    expect(
      markAttribute(
        summary({ mixedMarks: ['fontSize'], markAttributes: { fontSize: { size: 22 } } }),
        'fontSize',
        'size'
      )
    ).toBeNull();
  });

  it('is nothing when there is no such mark or no such attribute', () => {
    expect(markAttribute(summary({}), 'fontSize', 'size')).toBeNull();
    expect(markAttribute(summary({ markAttributes: { fontSize: {} } }), 'fontSize', 'size')).toBeNull();
  });

  it('keeps a value that is falsy but real', () => {
    // `0` and `''` are values. An `undefined`-or-null test rather than a truthy
    // one, because a zero letter-spacing is a letter-spacing.
    expect(markAttribute(summary({ markAttributes: { spacing: { value: 0 } } }), 'spacing', 'value')).toBe('0');
  });
});
