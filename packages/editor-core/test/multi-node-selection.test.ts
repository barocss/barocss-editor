import { describe, it, expect, beforeEach } from 'vitest';
import { SelectionManager } from '../src/selection-manager';
import { createNodeSelection, selectedNodeIds, type ModelSelection } from '../src/types';

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
