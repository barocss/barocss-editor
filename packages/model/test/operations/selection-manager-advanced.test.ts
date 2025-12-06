import { describe, it, expect, beforeEach } from 'vitest';
import { SelectionManager } from '@barocss/editor-core';
import { DataStore } from '@barocss/datastore';
import { Schema } from '@barocss/schema';

describe('SelectionManager Advanced Features', () => {
  let dataStore: DataStore;
  let selectionManager: SelectionManager;
  let schema: Schema;

  beforeEach(() => {
    schema = new Schema('test-schema', {
      nodes: {
        'inline-text': {
          content: 'text*',
          marks: ['bold', 'italic'],
          attrs: {
            class: { default: null }
          }
        },
        'paragraph': {
          content: 'inline-text*',
          attrs: {
            class: { default: null }
          }
        },
        'document': {
          content: 'block+',
          attrs: {
            class: { default: null }
          }
        }
      },
      marks: {
        bold: {},
        italic: {}
      }
    });

    dataStore = new DataStore();
    selectionManager = new SelectionManager({ dataStore });

    // Set up test nodes
    dataStore.setNode({ id: 'doc-1', type: 'document', content: ['para-1', 'para-2'] });
    dataStore.setNode({ id: 'para-1', type: 'paragraph', content: ['text-1'] });
    dataStore.setNode({ id: 'text-1', type: 'inline-text', text: 'Hello World', parentId: 'para-1' });
    dataStore.setNode({ id: 'para-2', type: 'paragraph', content: ['text-2'] });
    dataStore.setNode({ id: 'text-2', type: 'inline-text', text: 'Goodbye Universe', parentId: 'para-2' });
    
    // Clear selection before each test
    selectionManager.clearSelection();
  });

  describe('selectNode', () => {
    it('should select entire text node', () => {
      selectionManager.selectNode('text-1');
      
      const selection = selectionManager.getCurrentSelection();
      expect(selection).toEqual({
        startNodeId: 'text-1',
        startOffset: 0,
        endNodeId: 'text-1',
        endOffset: 11 // "Hello World".length
      });
    });

    it('should throw error for non-existent node', () => {
      expect(() => {
        selectionManager.selectNode('non-existent');
      }).toThrow('Node not found: non-existent');
    });
  });

  describe('selectAll', () => {
    it('should select all text from first to last node', () => {
      selectionManager.selectAll();
      const selection = selectionManager.getCurrentSelection();
      // selectAll behavior: select from first to last node
      expect(selection).toEqual({
        startNodeId: 'text-1',
        startOffset: 0,
        endNodeId: 'text-2',
        endOffset: 16 // "Another text".length
      });
    });
  });

  describe('selectToStart and selectToEnd', () => {
    it('should select from current position to start', () => {
      selectionManager.moveTo('text-1', 5);
      selectionManager.selectToStart();
      
      const selection = selectionManager.getCurrentSelection();
      expect(selection).toEqual({
        startNodeId: 'text-1',
        startOffset: 0,
        endNodeId: 'text-1',
        endOffset: 5
      });
    });

    it('should select from current position to end', () => {
      selectionManager.moveTo('text-1', 5);
      selectionManager.selectToEnd();
      
      const selection = selectionManager.getCurrentSelection();
      expect(selection).toEqual({
        startNodeId: 'text-1',
        startOffset: 5,
        endNodeId: 'text-1',
        endOffset: 11 // "Hello World".length
      });
    });
  });

  describe('moveToStart and moveToEnd', () => {
    it('should move to start of node', () => {
      selectionManager.moveTo('text-1', 5);
      selectionManager.moveToStart('text-1');
      
      const selection = selectionManager.getCurrentSelection();
      expect(selection).toEqual({
        startNodeId: 'text-1',
        startOffset: 0,
        endNodeId: 'text-1',
        endOffset: 0
      });
    });

    it('should move to end of node', () => {
      selectionManager.moveTo('text-1', 5);
      selectionManager.moveToEnd('text-1');
      
      const selection = selectionManager.getCurrentSelection();
      expect(selection).toEqual({
        startNodeId: 'text-1',
        startOffset: 11, // "Hello World".length
        endNodeId: 'text-1',
        endOffset: 11
      });
    });
  });

  describe('moveBy and extendBy', () => {
    it('should move by relative offset', () => {
      selectionManager.moveTo('text-1', 5);
      selectionManager.moveBy(3);
      
      const selection = selectionManager.getCurrentSelection();
      expect(selection).toEqual({
        startNodeId: 'text-1',
        startOffset: 8,
        endNodeId: 'text-1',
        endOffset: 8
      });
    });

    it('should extend by relative offset', () => {
      selectionManager.moveTo('text-1', 5);
      selectionManager.extendBy(3);
      
      const selection = selectionManager.getCurrentSelection();
      expect(selection).toEqual({
        startNodeId: 'text-1',
        startOffset: 5,
        endNodeId: 'text-1',
        endOffset: 8
      });
    });
  });

  describe('selectWord', () => {
    it('should select word at position', () => {
      selectionManager.selectWord('text-1', 1); // 'H' in "Hello"
      
      const selection = selectionManager.getCurrentSelection();
      expect(selection).toEqual({
        startNodeId: 'text-1',
        startOffset: 0,
        endNodeId: 'text-1',
        endOffset: 5 // "Hello".length
      });
    });

    it('should select word at middle position', () => {
      selectionManager.selectWord('text-1', 3); // 'l' in "Hello"
      
      const selection = selectionManager.getCurrentSelection();
      expect(selection).toEqual({
        startNodeId: 'text-1',
        startOffset: 0,
        endNodeId: 'text-1',
        endOffset: 5 // "Hello".length
      });
    });

    it('should collapse to position if no word found', () => {
      // Clear previous selection
      selectionManager.clearSelection();
      selectionManager.selectWord('text-1', 5); // space between "Hello" and "World"
      
      const selection = selectionManager.getCurrentSelection();
      expect(selection).toEqual({
        startNodeId: 'text-1',
        startOffset: 5,
        endNodeId: 'text-1',
        endOffset: 5
      });
    });
  });

  describe('selectLine', () => {
    it('should select line containing position', () => {
      // Add line breaks to text
      dataStore.setNode({ id: 'text-3', type: 'inline-text', text: 'Line 1\nLine 2\nLine 3', parentId: 'para-1' });
      
      selectionManager.selectLine('text-3', 8); // Inside "Line 2"
      
      const selection = selectionManager.getCurrentSelection();
      expect(selection).toEqual({
        startNodeId: 'text-3',
        startOffset: 7, // Start of "Line 2"
        endNodeId: 'text-3',
        endOffset: 13 // End of "Line 2"
      });
    });
  });

  describe('Utility methods', () => {
    it('should check if fully in node', () => {
      selectionManager.selectRange('text-1', 2, 8);
      
      expect(selectionManager.isFullyInNode('text-1')).toBe(true);
      expect(selectionManager.isFullyInNode('text-2')).toBe(false);
    });

    it('should check if overlaps with node', () => {
      selectionManager.selectRange('text-1', 2, 8);
      
      expect(selectionManager.overlapsWithNode('text-1')).toBe(true);
      expect(selectionManager.overlapsWithNode('text-2')).toBe(false);
    });

    it('should get start and end positions', () => {
      selectionManager.selectRange('text-1', 2, 8);
      
      const startPos = selectionManager.getStartPosition();
      const endPos = selectionManager.getEndPosition();
      
      expect(startPos).toEqual({ nodeId: 'text-1', offset: 2 });
      expect(endPos).toEqual({ nodeId: 'text-1', offset: 8 });
    });

    it('should detect reversed selection', () => {
      // Reversed selection (anchor is after focus)
      selectionManager.setSelection({
        startNodeId: 'text-1',
        startOffset: 8,
        endNodeId: 'text-1',
        endOffset: 2
      });
      
      expect(selectionManager.isReversed()).toBe(true);
    });

    it('should normalize reversed selection', () => {
      selectionManager.setSelection({
        startNodeId: 'text-1',
        startOffset: 8,
        endNodeId: 'text-1',
        endOffset: 2
      });
      
      selectionManager.normalize();
      
      const selection = selectionManager.getCurrentSelection();
      expect(selection).toEqual({
        startNodeId: 'text-1',
        startOffset: 2,
        endNodeId: 'text-1',
        endOffset: 8
      });
    });

    it('should get selected text', () => {
      selectionManager.selectRange('text-1', 2, 8);
      
      const selectedText = selectionManager.getSelectedText();
      expect(selectedText).toBe('llo Wo'); // "Hello World"[2:8]
    });

    it('should return null for multi-node selection', () => {
      selectionManager.setSelection({
        startNodeId: 'text-1',
        startOffset: 5,
        endNodeId: 'text-2',
        endOffset: 3
      });
      
      const selectedText = selectionManager.getSelectedText();
      expect(selectedText).toBeNull();
    });
  });
});