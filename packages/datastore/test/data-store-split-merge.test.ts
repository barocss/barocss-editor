import { describe, it, expect, beforeEach } from 'vitest';
import { DataStore } from '../src/data-store';
import { Schema } from '@barocss/schema';

describe('DataStore Split & Merge Functions', () => {
  let dataStore: DataStore;
  let schema: Schema;

  beforeEach(() => {
    // Create schema for testing
    schema = new Schema('test-schema', {
      nodes: {
        'inline-text': {
          content: 'text*',
          marks: ['bold', 'italic'],
          attrs: {
            class: { type: 'string', default: null }
          }
        },
        'paragraph': {
          content: 'inline-text*',
          attrs: {
            class: { type: 'string', default: null }
          }
        },
        'heading': {
          content: 'inline-text*',
          attrs: {
            class: { type: 'string', default: null },
            level: { type: 'number', default: 1 }
          }
        }
      },
      marks: {
        bold: {},
        italic: {}
      }
    });

    dataStore = new DataStore(undefined, schema);
  });

  describe('splitTextNode', () => {
    it('should split text node at specified position', () => {
      // Create text node
      const textNode = {
        sid: 'text-1',
        stype: 'inline-text',
        text: 'Hello World',
        attributes: { class: 'test' }
      };
      dataStore.setNode(textNode);

      // Split at 5th position
      const newNodeId = dataStore.splitTextNode('text-1', 5);

      // Verify original node
      const originalNode = dataStore.getNode('text-1');
      expect(originalNode!.text).toBe('Hello');

      // Verify new node
      const newNode = dataStore.getNode(newNodeId);
      expect(newNode!.text).toBe(' World');
      expect(newNode!.stype).toBe('inline-text');
      expect(newNode!.attributes?.class).toBe('test');
    });

    it('should emit update+create+update ops when splitting', () => {
      const textNode = {
        sid: 'text-1',
        stype: 'inline-text',
        text: 'Hello World',
        attributes: { class: 'test' }
      } as any;
      dataStore.setNode(textNode);
      dataStore.begin();
      dataStore.splitTextNode('text-1', 5);
      const ops = dataStore.end();
      const types = ops.map(o => o.type);
      expect(types).toContain('update'); // left node update
      expect(types).toContain('create'); // right node create
      // parent update may exist if parent/content affected
    });

    it('should preserve marks when splitting', () => {
      const textNode = {
        sid: 'text-1',
        stype: 'inline-text',
        text: 'Hello World',
        marks: [
          { stype: 'bold', range: [0, 5] },
          { stype: 'italic', range: [6, 11] }
        ]
      };
      dataStore.setNode(textNode);

      const newNodeId = dataStore.splitTextNode('text-1', 5);

      const originalNode = dataStore.getNode('text-1');
      const newNode = dataStore.getNode(newNodeId);

      expect(originalNode!.marks).toEqual([{ stype: 'bold', range: [0, 5] }]);
      expect(newNode!.marks).toEqual([{ stype: 'italic', range: [1, 6] }]);
    });

    it('should handle marks that span across split position', () => {
      const textNode = {
        sid: 'text-1',
        stype: 'inline-text',
        text: 'Hello World',
        marks: [
          { stype: 'bold', range: [2, 8] } // "llo Wo" part crosses the split point
        ]
      };
      dataStore.setNode(textNode);

      const newNodeId = dataStore.splitTextNode('text-1', 5);

      const originalNode = dataStore.getNode('text-1');
      const newNode = dataStore.getNode(newNodeId);

      // Left node: only "llo" part in "Hello" is bold
      expect(originalNode!.marks).toEqual([{ stype: 'bold', range: [2, 5] }]);
      // Right node: only " Wo" part in " World" is bold
      expect(newNode!.marks).toEqual([{ stype: 'bold', range: [0, 3] }]);
    });

    it('should handle marks without range (applied to entire text)', () => {
      const textNode = {
        sid: 'text-1',
        stype: 'inline-text',
        text: 'Hello World',
        marks: [
          { stype: 'bold' }, // Applied to entire text
          { stype: 'italic' } // Applied to entire text
        ]
      };
      dataStore.setNode(textNode);

      const newNodeId = dataStore.splitTextNode('text-1', 5);

      const originalNode = dataStore.getNode('text-1');
      const newNode = dataStore.getNode(newNodeId);

      // Left node: bold and italic applied to entire "Hello"
      expect(originalNode!.marks).toEqual([
        { stype: 'bold', range: [0, 5] },
        { stype: 'italic', range: [0, 5] }
      ]);
      // Right node: bold and italic applied to entire " World"
      expect(newNode!.marks).toEqual([
        { stype: 'bold', range: [0, 6] },
        { stype: 'italic', range: [0, 6] }
      ]);
    });

    it('should handle mixed marks (some with range, some without)', () => {
      const textNode = {
        sid: 'text-1',
        stype: 'inline-text',
        text: 'Hello World',
        marks: [
          { stype: 'bold' }, // Full text
          { stype: 'italic', range: [2, 8] }, // Only "llo Wo" part
          { stype: 'fontColor', attrs: { color: '#ff0000' } } // Full text
        ]
      };
      dataStore.setNode(textNode);

      const newNodeId = dataStore.splitTextNode('text-1', 5);

      const originalNode = dataStore.getNode('text-1');
      const newNode = dataStore.getNode(newNodeId);

      // Left node: "Hello"
      expect(originalNode!.marks).toEqual([
        { stype: 'bold', range: [0, 5] }, // Left part from full text
        { stype: 'italic', range: [2, 5] }, // Range crosses split point
        { stype: 'fontColor', range: [0, 5], attrs: { color: '#ff0000' } } // Left part from full text
      ]);
      
      // Right node: " World"
      expect(newNode!.marks).toEqual([
        { stype: 'bold', range: [0, 6] }, // Right part from full text
        { stype: 'italic', range: [0, 3] }, // Range crosses split point
        { stype: 'fontColor', range: [0, 6], attrs: { color: '#ff0000' } } // Right part from full text
      ]);
    });

    it('should throw error for invalid split position', () => {
      const textNode = {
        sid: 'text-1',
        stype: 'inline-text',
        text: 'Hello'
      };
      dataStore.setNode(textNode);

      expect(() => dataStore.splitTextNode('text-1', 0)).toThrow('Split position must be between 0 and 5');
      expect(() => dataStore.splitTextNode('text-1', 5)).toThrow('Split position must be between 0 and 5');
      expect(() => dataStore.splitTextNode('text-1', -1)).toThrow('Invalid split position: -1');
      expect(() => dataStore.splitTextNode('text-1', 10)).toThrow('Invalid split position: 10');
    });

    it('should throw error for non-text node', () => {
      const paragraphNode = {
        sid: 'para-1',
        stype: 'paragraph',
        content: []
      };
      dataStore.setNode(paragraphNode);

      expect(() => dataStore.splitTextNode('para-1', 1)).toThrow('Node is not a text node: paragraph');
    });
  });

  describe('mergeTextNodes', () => {
    it('should merge two text nodes', () => {
      const leftNode = {
        sid: 'text-1',
        stype: 'inline-text',
        text: 'Hello',
        attributes: { class: 'left' }
      };
      const rightNode = {
        sid: 'text-2',
        stype: 'inline-text',
        text: ' World',
        attributes: { class: 'right' }
      };
      dataStore.setNode(leftNode);
      dataStore.setNode(rightNode);

      const mergedNodeId = dataStore.mergeTextNodes('text-1', 'text-2');

      expect(mergedNodeId).toBe('text-1');
      const mergedNode = dataStore.getNode('text-1');
      expect(mergedNode!.text).toBe('Hello World');
      expect(dataStore.getNode('text-2')).toBeUndefined();
    });

    it('should emit update+delete ops when merging', () => {
      dataStore.setNode({ sid: 'text-1', stype: 'inline-text', text: 'Hello' } as any);
      dataStore.setNode({ sid: 'text-2', stype: 'inline-text', text: ' World' } as any);
      dataStore.begin();
      dataStore.mergeTextNodes('text-1', 'text-2');
      const ops = dataStore.end();
      const types = ops.map(o => o.type);
      expect(types).toContain('update');
      expect(types).toContain('delete');
    });

    it('should merge marks from both nodes with correct range adjustment', () => {
      const leftNode = {
        sid: 'text-1',
        stype: 'inline-text',
        text: 'Hello',
        marks: [{ stype: 'bold', range: [0, 5] }]
      };
      const rightNode = {
        sid: 'text-2',
        stype: 'inline-text',
        text: ' World',
        marks: [{ stype: 'italic', range: [1, 5] }] // Only "World" part is italic
      };
      dataStore.setNode(leftNode);
      dataStore.setNode(rightNode);

      dataStore.mergeTextNodes('text-1', 'text-2');

      const mergedNode = dataStore.getNode('text-1');
      expect(mergedNode!.marks).toHaveLength(2);
      expect(mergedNode!.marks![0]).toEqual({ stype: 'bold', range: [0, 5] });
      // Right node's mark should be offset by left text length (5)
      expect(mergedNode!.marks![1]).toEqual({ stype: 'italic', range: [6, 10] });
    });

    it('should merge marks without range (applied to entire text)', () => {
      const leftNode = {
        sid: 'text-1',
        stype: 'inline-text',
        text: 'Hello',
        marks: [{ stype: 'bold' }] // Applied to full text
      };
      const rightNode = {
        sid: 'text-2',
        stype: 'inline-text',
        text: ' World',
        marks: [{ stype: 'italic' }] // Applied to full text
      };
      dataStore.setNode(leftNode);
      dataStore.setNode(rightNode);

      dataStore.mergeTextNodes('text-1', 'text-2');

      const mergedNode = dataStore.getNode('text-1');
      expect(mergedNode!.marks).toHaveLength(2);
      // Left node's mark is preserved as-is
      expect(mergedNode!.marks![0]).toEqual({ stype: 'bold', range: [0, 5] });
      // Right node's mark is offset and added
      expect(mergedNode!.marks![1]).toEqual({ stype: 'italic', range: [5, 11] });
    });

    it('should merge mixed marks (some with range, some without)', () => {
      const leftNode = {
        sid: 'text-1',
        stype: 'inline-text',
        text: 'Hello',
        marks: [
          { stype: 'bold' }, // Full text
          { stype: 'italic', range: [0, 3] } // Only "Hel" part
        ]
      };
      const rightNode = {
        sid: 'text-2',
        stype: 'inline-text',
        text: ' World',
        marks: [
          { stype: 'fontColor', attrs: { color: '#ff0000' } }, // Full text
          { stype: 'underline', range: [1, 4] } // Only "Wor" part
        ]
      };
      dataStore.setNode(leftNode);
      dataStore.setNode(rightNode);

      dataStore.mergeTextNodes('text-1', 'text-2');

      const mergedNode = dataStore.getNode('text-1');
      expect(mergedNode!.marks).toHaveLength(4);
      
      // Left node's marks
      expect(mergedNode!.marks![0]).toEqual({ stype: 'bold', range: [0, 5] });
      expect(mergedNode!.marks![1]).toEqual({ stype: 'italic', range: [0, 3] });
      
      // Right node's marks (offset applied)
      expect(mergedNode!.marks![2]).toEqual({ stype: 'fontColor', range: [5, 11], attrs: { color: '#ff0000' } });
      expect(mergedNode!.marks![3]).toEqual({ stype: 'underline', range: [6, 9] });
    });

    it('should throw error for non-text nodes', () => {
      const paragraphNode = {
        sid: 'para-1',
        stype: 'paragraph',
        content: []
      };
      const textNode = {
        sid: 'text-1',
        stype: 'inline-text',
        text: 'Hello'
      };
      dataStore.setNode(paragraphNode);
      dataStore.setNode(textNode);

      expect(() => dataStore.mergeTextNodes('para-1', 'text-1')).toThrow('Left node is not a text node: paragraph');
      expect(() => dataStore.mergeTextNodes('text-1', 'para-1')).toThrow('Right node is not a text node: paragraph');
    });
  });

  describe('splitBlockNode', () => {
    beforeEach(() => {
      // Create parent node
      const parentNode = {
        sid: 'parent-1',
        stype: 'paragraph',
        content: ['child-1', 'child-2', 'child-3', 'child-4'],
        attributes: { class: 'parent' }
      };
      dataStore.setNode(parentNode);

      // Create child nodes
      const children = [
        { sid: 'child-1', stype: 'inline-text', text: 'Child 1', parentId: 'parent-1' },
        { sid: 'child-2', stype: 'inline-text', text: 'Child 2', parentId: 'parent-1' },
        { sid: 'child-3', stype: 'inline-text', text: 'Child 3', parentId: 'parent-1' },
        { sid: 'child-4', stype: 'inline-text', text: 'Child 4', parentId: 'parent-1' }
      ];
      children.forEach(child => dataStore.setNode(child));
    });

    it('should split block node at specified position', () => {
      const newNodeId = dataStore.splitBlockNode('parent-1', 2);

      // Verify original node
      const originalNode = dataStore.getNode('parent-1');
      expect(originalNode!.content).toEqual(['child-1', 'child-2']);

      // Verify new node
      const newNode = dataStore.getNode(newNodeId);
      expect(newNode!.content).toEqual(['child-3', 'child-4']);
      expect(newNode!.stype).toBe('paragraph');
      expect(newNode!.attributes?.class).toBe('parent');

      // Verify children's parent IDs are updated
      const child3 = dataStore.getNode('child-3');
      const child4 = dataStore.getNode('child-4');
      expect(child3!.parentId).toBe(newNodeId);
      expect(child4!.parentId).toBe(newNodeId);
    });

    it('should throw error for invalid split position', () => {
      expect(() => dataStore.splitBlockNode('parent-1', 0)).toThrow('Split position must be between 0 and 4');
      expect(() => dataStore.splitBlockNode('parent-1', 4)).toThrow('Split position must be between 0 and 4');
      expect(() => dataStore.splitBlockNode('parent-1', -1)).toThrow('Invalid split position: -1');
      expect(() => dataStore.splitBlockNode('parent-1', 10)).toThrow('Invalid split position: 10');
    });

    it('should throw error for node with no content', () => {
      const emptyNode = {
        sid: 'empty-1',
        stype: 'paragraph',
        content: []
      };
      dataStore.setNode(emptyNode);

      expect(() => dataStore.splitBlockNode('empty-1', 1)).toThrow('Node has no content to split: empty-1');
    });
  });

  describe('mergeBlockNodes', () => {
    beforeEach(() => {
      // Create two block nodes
      const leftNode = {
        sid: 'left-1',
        stype: 'paragraph',
        content: ['child-1', 'child-2'],
        attributes: { class: 'left' }
      };
      const rightNode = {
        sid: 'right-1',
        stype: 'paragraph',
        content: ['child-3', 'child-4'],
        attributes: { class: 'right' }
      };
      dataStore.setNode(leftNode);
      dataStore.setNode(rightNode);

      // Create child nodes
      const children = [
        { sid: 'child-1', stype: 'inline-text', text: 'Left 1', parentId: 'left-1' },
        { sid: 'child-2', stype: 'inline-text', text: 'Left 2', parentId: 'left-1' },
        { sid: 'child-3', stype: 'inline-text', text: 'Right 1', parentId: 'right-1' },
        { sid: 'child-4', stype: 'inline-text', text: 'Right 2', parentId: 'right-1' }
      ];
      children.forEach(child => dataStore.setNode(child));
    });

    it('should merge two block nodes', () => {
      const mergedNodeId = dataStore.mergeBlockNodes('left-1', 'right-1');

      expect(mergedNodeId).toBe('left-1');
      
      // Verify all children are merged into left node
      const mergedNode = dataStore.getNode('left-1');
      expect(mergedNode!.content).toEqual(['child-1', 'child-2', 'child-3', 'child-4']);

      // Verify right node is deleted
      expect(dataStore.getNode('right-1')).toBeUndefined();

      // Verify children's parent IDs are updated
      const child3 = dataStore.getNode('child-3');
      const child4 = dataStore.getNode('child-4');
      expect(child3!.parentId).toBe('left-1');
      expect(child4!.parentId).toBe('left-1');
    });

    it('should throw error for different node types', () => {
      const headingNode = {
        sid: 'heading-1',
        stype: 'heading',
        content: ['child-5'],
        attributes: { level: 1 }
      };
      dataStore.setNode(headingNode);

      expect(() => dataStore.mergeBlockNodes('left-1', 'heading-1')).toThrow('Cannot merge different node types: paragraph and heading');
    });
  });

  describe('splitTextRange', () => {
    it('should split text range and return middle node', () => {
      // Create parent node
      const parentNode = {
        sid: 'parent-1',
        stype: 'paragraph',
        content: ['text-1'],
        attributes: { class: 'parent' }
      };
      dataStore.setNode(parentNode);

      const textNode = {
        sid: 'text-1',
        stype: 'inline-text',
        text: 'Hello World',
        attributes: { class: 'test' },
        parentId: 'parent-1'
      };
      dataStore.setNode(textNode);

      // Split "lo Wo" part (3-8)
      const middleNodeId = dataStore.splitTextRange('text-1', 3, 8);

      // Verify original node
      const originalNode = dataStore.getNode('text-1');
      expect(originalNode!.text).toBe('Hel');

      // Verify middle node
      const middleNode = dataStore.getNode(middleNodeId);
      expect(middleNode!.text).toBe('lo Wo');

      // Verify last node (automatically created)
      const parent = dataStore.getNode(originalNode!.parentId!);
      const lastNodeId = parent!.content![2];
      const lastNode = dataStore.getNode(lastNodeId);
      expect(lastNode!.text).toBe('rld');
    });

    it('should throw error for invalid range', () => {
      const textNode = {
        sid: 'text-1',
        stype: 'inline-text',
        text: 'Hello'
      };
      dataStore.setNode(textNode);

      expect(() => dataStore.splitTextRange('text-1', 3, 2)).toThrow('Invalid range: 3-2');
      expect(() => dataStore.splitTextRange('text-1', -1, 3)).toThrow('Invalid range: -1-3');
      expect(() => dataStore.splitTextRange('text-1', 3, 10)).toThrow('Invalid range: 3-10');
    });
  });

  describe('autoMergeTextNodes', () => {
    beforeEach(() => {
      // Create parent node
      const parentNode = {
        sid: 'parent-1',
        stype: 'paragraph',
        content: ['text-1', 'text-2', 'text-3'],
        attributes: { class: 'parent' }
      };
      dataStore.setNode(parentNode);

      // Create text nodes
      const textNodes = [
        { sid: 'text-1', stype: 'inline-text', text: 'Hello', parentId: 'parent-1' },
        { sid: 'text-2', stype: 'inline-text', text: ' ', parentId: 'parent-1' },
        { sid: 'text-3', stype: 'inline-text', text: 'World', parentId: 'parent-1' }
      ];
      textNodes.forEach(node => dataStore.setNode(node));
    });

    it('should merge adjacent text nodes', () => {
      const mergedNodeId = dataStore.autoMergeTextNodes('text-2');

      expect(mergedNodeId).toBe('text-1');
      
      // Verify all text is merged
      const mergedNode = dataStore.getNode('text-1');
      expect(mergedNode!.text).toBe('Hello World');

      // Verify middle nodes are deleted
      expect(dataStore.getNode('text-2')).toBeUndefined();
      expect(dataStore.getNode('text-3')).toBeUndefined();

      // Verify parent's content is updated
      const parent = dataStore.getNode('parent-1');
      expect(parent!.content).toEqual(['text-1']);
    });

    it('should not merge non-text nodes', () => {
      // Add paragraph node
      const paragraphNode = {
        sid: 'para-1',
        stype: 'paragraph',
        content: [],
        parentId: 'parent-1'
      };
      dataStore.setNode(paragraphNode);

      // Update parent's content
      const parent = dataStore.getNode('parent-1');
      parent!.content = ['text-1', 'para-1', 'text-3'];
      dataStore.setNode(parent);

      const mergedNodeId = dataStore.autoMergeTextNodes('para-1');

      // Paragraph node should not be merged
      expect(mergedNodeId).toBe('para-1');
      expect(dataStore.getNode('text-1')).toBeDefined();
      expect(dataStore.getNode('text-3')).toBeDefined();
    });

    it('should handle node without parent', () => {
      const orphanNode = {
        sid: 'orphan-1',
        stype: 'inline-text',
        text: 'Orphan'
      };
      dataStore.setNode(orphanNode);

      const mergedNodeId = dataStore.autoMergeTextNodes('orphan-1');

      expect(mergedNodeId).toBe('orphan-1');
    });
  });
});
