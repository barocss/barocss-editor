import { describe, it, expect } from 'vitest';
import { markState, readSelectionSummary } from '../src/selection-summary';
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
