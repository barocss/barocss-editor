import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { SelectionManager } from '../src/selection-manager';
import { DataStore } from '@barocss/datastore';

describe('SelectionManager', () => {
  let selectionManager: SelectionManager;
  let dataStore: DataStore;

  beforeEach(() => {
    document.body.innerHTML = '';

    dataStore = {
      getNode: vi.fn(),
      getNodes: vi.fn(),
      addNode: vi.fn(),
      updateNode: vi.fn(),
      deleteNode: vi.fn(),
      getRoot: vi.fn(),
      subscribe: vi.fn(),
      unsubscribe: vi.fn()
    } as any;

    selectionManager = new SelectionManager({ dataStore });

    (dataStore.getNode as any).mockImplementation((nodeId: string) => {
      const mockNodes: Record<string, any> = {
        'root-1': { sid: 'root-1', stype: 'document' },
        'p-1': { sid: 'p-1', stype: 'paragraph', text: 'Hello World' },
        'h1-1': { sid: 'h1-1', stype: 'heading', text: 'Title' }
      };
      return mockNodes[nodeId] || null;
    });
  });

  afterEach(() => {
    selectionManager.destroy();
    document.body.innerHTML = '';
  });

  describe('Initialization', () => {
    it('should initialize with empty selection', () => {
      expect(selectionManager.getCurrentSelection()).toBeNull();
      expect(selectionManager.isEmpty()).toBe(true);
    });
  });

  describe('setSelection / getCurrentSelection', () => {
    it('should set and get range selection', () => {
      const range = {
        type: 'range' as const,
        startNodeId: 'p-1',
        startOffset: 0,
        endNodeId: 'p-1',
        endOffset: 5
      };
      selectionManager.setSelection(range);
      expect(selectionManager.getCurrentSelection()).toEqual(range);
      expect(selectionManager.isEmpty()).toBe(false);
    });

    it('should set and get null selection', () => {
      selectionManager.setSelection({
        type: 'range',
        startNodeId: 'p-1',
        startOffset: 0,
        endNodeId: 'p-1',
        endOffset: 5
      });
      selectionManager.setSelection(null);
      expect(selectionManager.getCurrentSelection()).toBeNull();
      expect(selectionManager.isEmpty()).toBe(true);
    });
  });

  describe('setRange', () => {
    it('should set range selection via setRange', () => {
      const rangeSelection = {
        type: 'range' as const,
        startNodeId: 'p-1',
        startOffset: 0,
        endNodeId: 'p-1',
        endOffset: 5
      };
      selectionManager.setRange(rangeSelection);
      expect(selectionManager.getCurrentSelection()).toEqual(rangeSelection);
    });
  });

  describe('setNode', () => {
    it('should set node selection via setNode', () => {
      // As the API is written: `setNode` takes a node selection and reads `nodeId`
      // (or `startNodeId`) — there is no `selectAll`, and the `type` is not optional.
      // The old call passed one and omitted the other, and worked by accident.
      selectionManager.setNode({ type: 'node', nodeId: 'p-1' });
      const sel = selectionManager.getCurrentSelection();
      expect(sel).not.toBeNull();
      expect(sel!.type).toBe('node');
      expect(sel!.startNodeId).toBe('p-1');
      expect(sel!.endNodeId).toBe('p-1');
    });

    it('should clear selection when setNode(null)', () => {
      selectionManager.setNode({ type: 'node', nodeId: 'p-1' });
      selectionManager.setNode(null);
      expect(selectionManager.getCurrentSelection()).toBeNull();
    });
  });

  describe('setAbsolutePos', () => {
    it('should set selection via setAbsolutePos', () => {
      const absoluteSelection = {
        type: 'range' as const,
        startNodeId: 'p-1',
        startOffset: 0,
        endNodeId: 'p-1',
        endOffset: 5
      };
      selectionManager.setAbsolutePos(absoluteSelection);
      expect(selectionManager.getCurrentSelection()).toEqual(absoluteSelection);
    });
  });

  describe('clearSelection', () => {
    it('should clear model selection', () => {
      selectionManager.setSelection({
        type: 'range',
        startNodeId: 'p-1',
        startOffset: 0,
        endNodeId: 'p-1',
        endOffset: 5
      });
      selectionManager.clearSelection();
      expect(selectionManager.getCurrentSelection()).toBeNull();
      expect(selectionManager.isEmpty()).toBe(true);
    });
  });

  describe('isSelectionInContentEditable', () => {
    it('should return true when selection exists', () => {
      selectionManager.setSelection({
        type: 'range',
        startNodeId: 'p-1',
        startOffset: 0,
        endNodeId: 'p-1',
        endOffset: 5
      });
      expect(selectionManager.isSelectionInContentEditable()).toBe(true);
    });

    it('should return false when selection is empty', () => {
      selectionManager.clearSelection();
      expect(selectionManager.isSelectionInContentEditable()).toBe(false);
    });
  });

  describe('State checks', () => {
    it('should report isInNode correctly', () => {
      selectionManager.setSelection({
        type: 'range',
        startNodeId: 'p-1',
        startOffset: 0,
        endNodeId: 'p-1',
        endOffset: 5
      });
      expect(selectionManager.isInNode('p-1')).toBe(true);
      expect(selectionManager.isInNode('h1-1')).toBe(false);
    });

    it('should report isAtPosition correctly', () => {
      selectionManager.setSelection({
        type: 'range',
        startNodeId: 'p-1',
        startOffset: 3,
        endNodeId: 'p-1',
        endOffset: 3
      });
      expect(selectionManager.isAtPosition('p-1', 3)).toBe(true);
      expect(selectionManager.isAtPosition('p-1', 0)).toBe(false);
    });

    it('should report isInRange correctly', () => {
      selectionManager.setSelection({
        type: 'range',
        startNodeId: 'p-1',
        startOffset: 2,
        endNodeId: 'p-1',
        endOffset: 5
      });
      expect(selectionManager.isInRange('p-1', 0, 10)).toBe(true);
      expect(selectionManager.isInRange('p-1', 0, 3)).toBe(false);
    });

    it('should report getLength and isCollapsed correctly', () => {
      selectionManager.setSelection({
        type: 'range',
        startNodeId: 'p-1',
        startOffset: 0,
        endNodeId: 'p-1',
        endOffset: 5
      });
      expect(selectionManager.getLength()).toBe(5);
      expect(selectionManager.isCollapsed()).toBe(false);

      selectionManager.moveTo('p-1', 3);
      expect(selectionManager.getLength()).toBe(0);
      expect(selectionManager.isCollapsed()).toBe(true);
    });
  });

  describe('moveTo / selectRange / extendTo', () => {
    it('should moveTo collapsed position', () => {
      selectionManager.moveTo('p-1', 2);
      const sel = selectionManager.getCurrentSelection();
      expect(sel).not.toBeNull();
      expect(sel!.startNodeId).toBe('p-1');
      expect(sel!.startOffset).toBe(2);
      expect(sel!.endNodeId).toBe('p-1');
      expect(sel!.endOffset).toBe(2);
    });

    it('should selectRange', () => {
      selectionManager.selectRange('p-1', 0, 5);
      const sel = selectionManager.getCurrentSelection();
      expect(sel).not.toBeNull();
      expect(sel!.startOffset).toBe(0);
      expect(sel!.endOffset).toBe(5);
    });

    it('should extendTo', () => {
      selectionManager.moveTo('p-1', 0);
      selectionManager.extendTo('p-1', 5);
      const sel = selectionManager.getCurrentSelection();
      expect(sel).not.toBeNull();
      expect(sel!.startOffset).toBe(0);
      expect(sel!.endOffset).toBe(5);
    });
  });

  describe('collapseToStart / collapseToEnd', () => {
    it('should collapseToStart', () => {
      selectionManager.selectRange('p-1', 2, 5);
      selectionManager.collapseToStart();
      const sel = selectionManager.getCurrentSelection();
      expect(sel!.startOffset).toBe(2);
      expect(sel!.endOffset).toBe(2);
    });

    it('should collapseToEnd', () => {
      selectionManager.selectRange('p-1', 2, 5);
      selectionManager.collapseToEnd();
      const sel = selectionManager.getCurrentSelection();
      expect(sel!.startOffset).toBe(5);
      expect(sel!.endOffset).toBe(5);
    });
  });

  describe('selectNode', () => {
    it('should select entire node text', () => {
      selectionManager.selectNode('p-1');
      const sel = selectionManager.getCurrentSelection();
      expect(sel).not.toBeNull();
      expect(sel!.startNodeId).toBe('p-1');
      expect(sel!.endNodeId).toBe('p-1');
      expect(sel!.startOffset).toBe(0);
      expect(sel!.endOffset).toBe(11); // "Hello World".length
    });

    it('should throw when node not found', () => {
      expect(() => selectionManager.selectNode('non-existent')).toThrow('Node not found');
    });
  });

  describe('clone', () => {
    it('should clone selection state', () => {
      selectionManager.setSelection({
        type: 'range',
        startNodeId: 'p-1',
        startOffset: 0,
        endNodeId: 'p-1',
        endOffset: 5
      });
      const cloned = selectionManager.clone();
      expect(cloned.getCurrentSelection()).toEqual(selectionManager.getCurrentSelection());
      cloned.clearSelection();
      expect(selectionManager.getCurrentSelection()).not.toBeNull();
      expect(cloned.getCurrentSelection()).toBeNull();
    });
  });

  describe('destroy', () => {
    it('should clear selection on destroy', () => {
      selectionManager.setSelection({
        type: 'range',
        startNodeId: 'p-1',
        startOffset: 0,
        endNodeId: 'p-1',
        endOffset: 5
      });
      selectionManager.destroy();
      expect(selectionManager.getCurrentSelection()).toBeNull();
    });
  });
});
