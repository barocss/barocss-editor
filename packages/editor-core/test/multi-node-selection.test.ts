import { describe, it, expect, beforeEach } from 'vitest';
import { SelectionManager } from '../src/selection-manager';
import {
  createNodeSelection,
  selectedNodeIds,
  withLiveNodes,
  type ModelSelection
} from '../src/types';

/**
 * A range says "from here to there". That is the right shape for text and the
 * wrong one for three shapes on a board or two cells in different rows: those
 * are a set, and a set with holes in it cannot be described by its endpoints.
 *
 * `startNodeId`/`endNodeId` stay populated so that code written before this
 * existed keeps working on one of the selected nodes rather than on nothing.
 */
describe('selecting nodes rather than a span of text', () => {
  let selection: SelectionManager;

  beforeEach(() => {
    selection = new SelectionManager({ dataStore: undefined as any });
  });

  it('holds every selected node, not just the ends', () => {
    selection.setNodeSelection(['a', 'b', 'c']);
    expect(selection.getSelectedNodeIds()).toEqual(['a', 'b', 'c']);
  });

  it('keeps the endpoints pointing at real nodes, for code that predates it', () => {
    selection.setNodeSelection(['a', 'b', 'c']);
    const current = selection.getCurrentSelection()!;

    expect(current.startNodeId).toBe('a');
    expect(current.endNodeId).toBe('c');
    // ...and the middle one is only visible through nodeIds
    expect(current.nodeIds).toEqual(['a', 'b', 'c']);
  });

  it('treats no nodes as no selection', () => {
    selection.setNodeSelection(['a']);
    selection.setNodeSelection([]);

    // Otherwise every caller would have to check for both states
    expect(selection.getCurrentSelection()).toBeNull();
    expect(selection.isEmpty()).toBe(true);
  });

  it('adds and removes a node, as ctrl-clicking does', () => {
    selection.toggleNodeInSelection('a');
    selection.toggleNodeInSelection('b');
    expect(selection.getSelectedNodeIds()).toEqual(['a', 'b']);

    selection.toggleNodeInSelection('a');
    expect(selection.getSelectedNodeIds()).toEqual(['b']);
    expect(selection.isNodeSelected('a')).toBe(false);
  });

  it('starts fresh when toggling out of a text selection', () => {
    // A caret in a paragraph is not a selection of the paragraph, and combining
    // the two would silently widen what the next command acts on.
    selection.setSelection({
      type: 'range',
      startNodeId: 'para',
      startOffset: 2,
      endNodeId: 'para',
      endOffset: 2,
      collapsed: true
    } as ModelSelection);

    selection.toggleNodeInSelection('shape');
    expect(selection.getSelectedNodeIds()).toEqual(['shape']);
  });

  it('survives normalisation, which is about spans and not about sets', () => {
    selection.setNodeSelection(['c', 'a', 'b']);
    selection.normalize();

    // Order is the order they were selected in, and the type still says nodes
    expect(selection.getSelectedNodeIds()).toEqual(['c', 'a', 'b']);
    expect(selection.getCurrentSelection()!.type).toBe('node');
  });

  it('still normalises a reversed text selection that carries no type', () => {
    // Selections are built without a type all over the editor, and everything
    // treats those as ranges; the guard above must not catch them.
    selection.setSelection({
      startNodeId: 'text-1',
      startOffset: 8,
      endNodeId: 'text-1',
      endOffset: 2
    } as ModelSelection);

    selection.normalize();

    const current = selection.getCurrentSelection()!;
    expect(current.startOffset).toBe(2);
    expect(current.endOffset).toBe(8);
  });

  it('survives being cloned into a transaction', () => {
    selection.setNodeSelection(['a', 'b']);
    expect(selection.clone().getSelectedNodeIds()).toEqual(['a', 'b']);
  });

  it('carries a kind, so table cells are not shapes', () => {
    selection.setNodeSelection(['cell-1', 'cell-2'], 'cell');
    expect(selection.getCurrentSelection()!.type).toBe('cell');
    expect(selection.getSelectedNodeIds()).toEqual(['cell-1', 'cell-2']);
  });
});

describe('reading the nodes out of a selection', () => {
  it('reports nothing for a text range', () => {
    // A range covers *parts* of nodes; treating its endpoints as a node set is
    // how a caret in a paragraph turns into "the paragraph is selected".
    expect(
      selectedNodeIds({
        type: 'range',
        startNodeId: 'a',
        startOffset: 0,
        endNodeId: 'b',
        endOffset: 3
      } as ModelSelection)
    ).toEqual([]);
  });

  it('reports nothing for no selection', () => {
    expect(selectedNodeIds(null)).toEqual([]);
    expect(selectedNodeIds(undefined)).toEqual([]);
  });

  it('falls back to the endpoints for a selection made before nodeIds existed', () => {
    expect(
      selectedNodeIds({
        type: 'node',
        startNodeId: 'a',
        startOffset: 0,
        endNodeId: 'b',
        endOffset: 0
      } as ModelSelection)
    ).toEqual(['a', 'b']);
  });

  it('does not report a single node twice', () => {
    expect(
      selectedNodeIds({
        type: 'node',
        startNodeId: 'a',
        startOffset: 0,
        endNodeId: 'a',
        endOffset: 0
      } as ModelSelection)
    ).toEqual(['a']);
  });

  it('returns a copy, so a caller cannot edit the selection by accident', () => {
    const selection = createNodeSelection(['a', 'b'])!;
    selectedNodeIds(selection).push('c');
    expect(selection.nodeIds).toEqual(['a', 'b']);
  });
});

/**
 * The way in.
 *
 * `SelectionManager` has held a set since sets were described, and
 * `Editor.setNode` — the only public route to a node selection, and the one a
 * `setNode` command runs — took `nodeId ?? startNodeId` and dropped `nodeIds`.
 * So a set could be described and not made. A slide editor is the first thing
 * to need one: the whole point of selecting three shapes is to move them
 * together.
 */
describe('setting a node selection through the editor', () => {
  const standUp = async () => {
    const { Editor } = await import('../src/editor');
    const { DataStore } = await import('@barocss/datastore');
    const { createSchema, getStandardSchemaDefinition } = await import('@barocss/schema');

    const schema = createSchema('standard', getStandardSchemaDefinition());
    const dataStore = new DataStore(undefined, schema);
    const editor = new Editor({ schema, dataStore } as never);

    editor.loadDocument(
      {
        stype: 'document',
        attributes: {},
        content: [
          { stype: 'paragraph', attributes: {}, content: [{ stype: 'inline-text', text: 'a' }] },
          { stype: 'paragraph', attributes: {}, content: [{ stype: 'inline-text', text: 'b' }] },
          { stype: 'paragraph', attributes: {}, content: [{ stype: 'inline-text', text: 'c' }] }
        ]
      } as never,
      'standard'
    );

    const root: any = dataStore.getNode((editor as any).getRootId());
    return { editor, ids: root.content as string[] };
  };

  it('keeps every node it was given', async () => {
    const { editor, ids } = await standUp();
    editor.setNode({ nodeIds: ids });

    expect(selectedNodeIds(editor.selection)).toEqual(ids);
    expect(editor.selection?.type).toBe('node');
  });

  it('takes a single node too, and still reports it as a set', async () => {
    // So a caller never has to ask which shape of selection it was handed.
    const { editor, ids } = await standUp();
    editor.setNode({ nodeId: ids[1] });

    expect(selectedNodeIds(editor.selection)).toEqual([ids[1]]);
  });

  it('keeps the endpoints at the first and last, for code that predates sets', async () => {
    const { editor, ids } = await standUp();
    editor.setNode({ nodeIds: ids });

    expect(editor.selection?.startNodeId).toBe(ids[0]);
    expect(editor.selection?.endNodeId).toBe(ids[2]);
  });

  it('is reachable as a command, which is how a product runs it', async () => {
    const { editor, ids } = await standUp();
    await (editor as any).executeCommand('setNode', { nodeIds: [ids[0], ids[2]] });
    expect(selectedNodeIds(editor.selection)).toEqual([ids[0], ids[2]]);
  });

  it('treats an empty set and nothing at all the same way', async () => {
    const { editor, ids } = await standUp();
    editor.setNode({ nodeIds: ids });
    editor.setNode({ nodeIds: [] });
    expect(editor.selection).toBeNull();

    editor.setNode({ nodeIds: ids });
    editor.setNode(null);
    expect(editor.selection).toBeNull();
  });

  it('ignores ids that are not strings rather than selecting undefined', async () => {
    const { editor, ids } = await standUp();
    editor.setNode({ nodeIds: [ids[0], undefined, '', 42, ids[1]] });
    expect(selectedNodeIds(editor.selection)).toEqual([ids[0], ids[1]]);
  });

  /**
   * A node that is **deleted** leaves the selection; the rest of the set stays.
   *
   * Measured, and it was live: selecting three shapes and deleting the middle one left all three
   * selected, because the guard against a dead selection asks about `startNodeId` and `endNodeId` —
   * the whole of a range, and half a story for a set, where the deleted node is usually neither
   * end. The next command then acted on a node the store no longer has.
   */
  it('loses a deleted member and keeps the others', async () => {
    const { editor, ids } = await standUp();
    const store: any = (editor as any).dataStore;

    editor.setNode({ nodeIds: ids });
    store.removeChild((editor as any).getRootId(), ids[1]);
    store.deleteNode(ids[1]);

    // Re-asked, as anything that touches the selection after an edit does.
    (editor as any).updateSelection(editor.selection);

    expect(selectedNodeIds(editor.selection)).toEqual([ids[0], ids[2]]);
    // And the ends follow the survivors rather than naming what has gone.
    expect(editor.selection?.startNodeId).toBe(ids[0]);
    expect(editor.selection?.endNodeId).toBe(ids[2]);
  });

  it('clears when nothing in the set is left', async () => {
    const { editor, ids } = await standUp();
    const store: any = (editor as any).dataStore;

    editor.setNode({ nodeIds: [ids[0], ids[1]] });
    for (const id of [ids[0], ids[1]]) {
      store.removeChild((editor as any).getRootId(), id);
      store.deleteNode(id);
    }
    (editor as any).updateSelection(editor.selection);

    // "No nodes selected" and "no selection" are one state, here as everywhere else.
    expect(editor.selection).toBeNull();
  });
});

/**
 * The pruning on its own, where it is arithmetic rather than an editor.
 */
describe('a set with a node missing from it', () => {
  const alive = (kept: string[]) => (id: string) => (kept.includes(id) ? { sid: id } : undefined);

  it('keeps what is there and moves the ends onto it', () => {
    const set = createNodeSelection(['a', 'b', 'c'])!;
    expect(withLiveNodes(alive(['a', 'c']), set)).toMatchObject({
      nodeIds: ['a', 'c'],
      startNodeId: 'a',
      endNodeId: 'c'
    });
  });

  it('hands back the very same selection when nothing is missing', () => {
    const set = createNodeSelection(['a', 'b'])!;
    // Identity, not a copy: a selection rebuilt on every read is a selection that never compares
    // equal, and the view redraws on that comparison.
    expect(withLiveNodes(alive(['a', 'b']), set)).toBe(set);
  });

  it('answers nothing when the whole set has gone', () => {
    expect(withLiveNodes(alive([]), createNodeSelection(['a', 'b'])!)).toBeNull();
  });

  it('leaves a text range alone, whatever it names', () => {
    const range: ModelSelection = {
      type: 'range',
      startNodeId: 'gone',
      startOffset: 0,
      endNodeId: 'gone',
      endOffset: 3
    };
    // A range covers *parts* of nodes; its endpoints are what the editor's own alive check is for.
    expect(withLiveNodes(alive([]), range)).toBe(range);
  });
});
