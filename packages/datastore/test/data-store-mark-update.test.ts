import { describe, it, expect, beforeEach } from 'vitest';
import { DataStore } from '../src/data-store';
import { createSchema } from '@barocss/schema';
import type { INode } from '../src/types';

describe('DataStore Mark Update Operations', () => {
  let dataStore: DataStore;
  let schema: any;

  beforeEach(() => {
    dataStore = new DataStore();
    schema = createSchema('test', {
      topNode: 'document',
      nodes: {
        document: { name: 'document', group: 'document', content: 'paragraph+' },
        paragraph: { name: 'paragraph', group: 'block', content: 'inline-text+' },
        'inline-text': { 
          name: 'inline-text', 
          group: 'inline', 
          attrs: { 
            content: { type: 'string', required: false }
          }
        }
      }
    });
    dataStore.registerSchema(schema);
  });

  describe('Mark Update via updateNode', () => {
    it('should update marks array via updateNode', () => {
      const textNode: INode = {
        sid: 'text-1',
        stype: 'inline-text',
        text: 'Hello World',
        parentId: 'para-1'
      };
      dataStore.setNode(textNode);

      const mark = { stype: 'bold', range: [0, 5] as [number, number] };
      const result = dataStore.updateNode('text-1', { marks: [mark] });
      expect(result?.valid).toBe(true);

      const updatedNode = dataStore.getNode('text-1');
      expect(updatedNode?.marks).toEqual([mark]);
    });

    it('should apply mark to multiple nodes in range', () => {
      const textNode1: INode = {
        sid: 'text-1',
        stype: 'inline-text',
        text: 'Hello ',
        parentId: 'para-1'
      };
      const textNode2: INode = {
        sid: 'text-2',
        stype: 'inline-text',
        text: 'World',
        parentId: 'para-1'
      };
      dataStore.setNode(textNode1);
      dataStore.setNode(textNode2);

      const mark = { stype: 'italic', range: [0, 5] as [number, number] };
      const contentRange = {
        startNodeId: 'text-1',
        startOffset: 0,
        endNodeId: 'text-2',
        endOffset: 5
      };

      dataStore.range.applyMark(contentRange, mark);

      const updatedNode1 = dataStore.getNode('text-1');
      const updatedNode2 = dataStore.getNode('text-2');
      
      expect(updatedNode1?.marks).toEqual([{ stype: 'italic', range: [0, 6] }]);
      expect(updatedNode2?.marks).toEqual([{ stype: 'italic', range: [0, 5] }]);
    });

    it('should add mark to existing marks array', () => {
      const textNode: INode = {
        sid: 'text-1',
        stype: 'inline-text',
        text: 'Hello World',
        marks: [{ stype: 'bold', range: [0, 5] as [number, number] }],
        parentId: 'para-1'
      };
      dataStore.setNode(textNode);

      const newMark = { stype: 'italic', range: [6, 11] as [number, number] };
      const contentRange = {
        startNodeId: 'text-1',
        startOffset: 6,
        endNodeId: 'text-1',
        endOffset: 11
      };

      dataStore.range.applyMark(contentRange, newMark);

      const updatedNode = dataStore.getNode('text-1');
      expect(updatedNode?.marks).toEqual([
        { stype: 'bold', range: [0, 5] },
        { stype: 'italic', range: [6, 11] }
      ]);
    });

    it('should handle invalid range gracefully', () => {
      const textNode: INode = {
        sid: 'text-1',
        stype: 'inline-text',
        text: 'Hello',
        parentId: 'para-1'
      };
      dataStore.setNode(textNode);

      const mark = { stype: 'bold', range: [0, 5] as [number, number] };
      const contentRange = {
        startNodeId: 'text-1',
        startOffset: 10, // Beyond text length
        endNodeId: 'text-1',
        endOffset: 15
      };

      dataStore.range.applyMark(contentRange, mark);

      const updatedNode = dataStore.getNode('text-1');
      // Spec: invalid range no-op; no implicit []
      expect(updatedNode?.marks).toBeUndefined();
    });
  });

  describe('normalizeMarks Operations', () => {
    it('should normalize marks with missing ranges', () => {
      const textNode: INode = {
        sid: 'text-1',
        stype: 'inline-text',
        text: 'Hello World',
        marks: [
          { stype: 'bold' }, // Missing range
          { stype: 'italic', range: [0, 5] as [number, number] }
        ],
        parentId: 'para-1'
      };
      dataStore.setNode(textNode);

      dataStore.marks.normalizeMarks('text-1');

      const updatedNode = dataStore.getNode('text-1');
      expect(updatedNode?.marks).toEqual([
        { stype: 'bold', range: [0, 11] }, // Should get full text range
        { stype: 'italic', range: [0, 5] }
      ]);
    });

    it('should normalize marks with invalid ranges', () => {
      const textNode: INode = {
        sid: 'text-1',
        stype: 'inline-text',
        text: 'Hello',
        marks: [
          { stype: 'bold', range: [-1, 3] as [number, number] }, // Negative start
          { stype: 'italic', range: [2, 10] as [number, number] }, // End beyond text
          { stype: 'underline', range: [1, 1] as [number, number] } // Empty range
        ],
        parentId: 'para-1'
      };
      dataStore.setNode(textNode);

      dataStore.marks.normalizeMarks('text-1');

      const updatedNode = dataStore.getNode('text-1');
      expect(updatedNode?.marks).toEqual([
        { stype: 'bold', range: [0, 3] }, // Clamped to valid range
        { stype: 'italic', range: [2, 5] } // Clamped to text length
        // Empty range should be removed
      ]);
    });

    it('should remove duplicate marks', () => {
      const textNode: INode = {
        sid: 'text-1',
        stype: 'inline-text',
        text: 'Hello',
        marks: [
          { stype: 'bold', range: [0, 3] as [number, number] },
          { stype: 'bold', range: [0, 3] as [number, number] }, // Duplicate
          { stype: 'italic', range: [1, 4] as [number, number] }
        ],
        parentId: 'para-1'
      };
      dataStore.setNode(textNode);

      dataStore.marks.normalizeMarks('text-1');

      const updatedNode = dataStore.getNode('text-1');
      expect(updatedNode?.marks).toEqual([
        { stype: 'bold', range: [0, 3] },
        { stype: 'italic', range: [1, 4] }
      ]);
    });

    it('should merge overlapping marks of same type', () => {
      const textNode: INode = {
        sid: 'text-1',
        stype: 'inline-text',
        text: 'Hello World',
        marks: [
          { stype: 'bold', range: [0, 5] as [number, number] },
          { stype: 'bold', range: [3, 8] as [number, number] }, // Overlapping
          { stype: 'italic', range: [6, 11] as [number, number] }
        ],
        parentId: 'para-1'
      };
      dataStore.setNode(textNode);

      dataStore.marks.normalizeMarks('text-1');

      const updatedNode = dataStore.getNode('text-1');
      expect(updatedNode?.marks).toEqual([
        { stype: 'bold', range: [0, 8] }, // Merged
        { stype: 'italic', range: [6, 11] }
      ]);
    });

    it('should clear marks for empty text', () => {
      const textNode: INode = {
        sid: 'text-1',
        stype: 'inline-text',
        text: '',
        marks: [
          { stype: 'bold', range: [0, 5] as [number, number] }
        ],
        parentId: 'para-1'
      };
      dataStore.setNode(textNode);

      dataStore.marks.normalizeMarks('text-1');

      const updatedNode = dataStore.getNode('text-1');
      expect(updatedNode?.marks).toEqual([]);
    });

    it('should handle node without marks', () => {
      const textNode: INode = {
        sid: 'text-1',
        stype: 'inline-text',
        text: 'Hello',
        parentId: 'para-1'
      };
      dataStore.setNode(textNode);

      dataStore.marks.normalizeMarks('text-1');

      const updatedNode = dataStore.getNode('text-1');
      expect(updatedNode?.marks).toEqual([]);
    });
  });

  describe('toggleMark Operations', () => {
    it('should add mark when not present', () => {
      const textNode: INode = {
        sid: 'text-1',
        stype: 'inline-text',
        text: 'Hello World',
        parentId: 'para-1'
      };
      dataStore.setNode(textNode);

      const contentRange = {
        startNodeId: 'text-1',
        startOffset: 0,
        endNodeId: 'text-1',
        endOffset: 5
      };

      dataStore.range.toggleMark(contentRange, 'bold');

      const updatedNode = dataStore.getNode('text-1');
      expect(updatedNode?.marks).toEqual([
        { stype: 'bold', range: [0, 5] }
      ]);
    });

    it('should remove mark when present', () => {
      const textNode: INode = {
        sid: 'text-1',
        stype: 'inline-text',
        text: 'Hello World',
        marks: [{ stype: 'bold', range: [0, 5] as [number, number] }],
        parentId: 'para-1'
      };
      dataStore.setNode(textNode);

      const contentRange = {
        startNodeId: 'text-1',
        startOffset: 0,
        endNodeId: 'text-1',
        endOffset: 5
      };

      dataStore.range.toggleMark(contentRange, 'bold');

      const updatedNode = dataStore.getNode('text-1');
      expect(updatedNode?.marks).toEqual([]);
    });

    it('should toggle mark with attributes', () => {
      const textNode: INode = {
        sid: 'text-1',
        stype: 'inline-text',
        text: 'Hello World',
        parentId: 'para-1'
      };
      dataStore.setNode(textNode);

      const contentRange = {
        startNodeId: 'text-1',
        startOffset: 0,
        endNodeId: 'text-1',
        endOffset: 5
      };

      dataStore.range.toggleMark(contentRange, 'link', { href: 'https://example.com' });

      const updatedNode = dataStore.getNode('text-1');
      expect(updatedNode?.marks).toEqual([
        { stype: 'link', range: [0, 5], attrs: { href: 'https://example.com' } }
      ]);
    });

    it('should handle partial mark removal', () => {
      const textNode: INode = {
        sid: 'text-1',
        stype: 'inline-text',
        text: 'Hello World',
        marks: [{ stype: 'bold', range: [0, 11] as [number, number] }],
        parentId: 'para-1'
      };
      dataStore.setNode(textNode);

      const contentRange = {
        startNodeId: 'text-1',
        startOffset: 0,
        endNodeId: 'text-1',
        endOffset: 5
      };

      dataStore.range.toggleMark(contentRange, 'bold');

      const updatedNode = dataStore.getNode('text-1');
      expect(updatedNode?.marks).toEqual([
        { stype: 'bold', range: [5, 11] } // Should split the mark
      ]);
    });
  });

  describe('Mark Operations with Transaction Overlay', () => {
    it('should apply mark within transaction overlay', () => {
      const textNode: INode = {
        sid: 'text-1',
        stype: 'inline-text',
        text: 'Hello World',
        parentId: 'para-1'
      };
      dataStore.setNode(textNode);

      dataStore.begin();
      
      const mark = { stype: 'bold', range: [0, 5] as [number, number] };
      const contentRange = {
        startNodeId: 'text-1',
        startOffset: 0,
        endNodeId: 'text-1',
        endOffset: 5
      };

      dataStore.range.applyMark(contentRange, mark);

      // Check overlay has the mark
      const overlayNode = dataStore.getNode('text-1');
      expect(overlayNode?.marks).toEqual([mark]);

      // Check base still has original (no marks)
      dataStore.rollback();
      const baseNode = dataStore.getNode('text-1');
      // Spec: base should remain unchanged (no marks persisted)
      expect(baseNode?.marks).toBeUndefined();
    });

    it('should commit mark changes to base', () => {
      const textNode: INode = {
        sid: 'text-1',
        stype: 'inline-text',
        text: 'Hello World',
        parentId: 'para-1'
      };
      dataStore.setNode(textNode);

      dataStore.begin();
      
      const mark = { stype: 'italic', range: [6, 11] as [number, number] };
      const contentRange = {
        startNodeId: 'text-1',
        startOffset: 6,
        endNodeId: 'text-1',
        endOffset: 11
      };

      dataStore.range.applyMark(contentRange, mark);
      dataStore.end();
      dataStore.commit();

      const committedNode = dataStore.getNode('text-1');
      expect(committedNode?.marks).toEqual([mark]);
    });

    it('should handle multiple mark operations in same transaction', () => {
      const textNode: INode = {
        sid: 'text-1',
        stype: 'inline-text',
        text: 'Hello World',
        parentId: 'para-1'
      };
      dataStore.setNode(textNode);

      dataStore.begin();
      
      // Apply bold mark
      const boldMark = { stype: 'bold', range: [0, 5] as [number, number] };
      dataStore.range.applyMark({
        startNodeId: 'text-1',
        startOffset: 0,
        endNodeId: 'text-1',
        endOffset: 5
      }, boldMark);

      // Apply italic mark
      const italicMark = { stype: 'italic', range: [6, 11] as [number, number] };
      dataStore.range.applyMark({
        startNodeId: 'text-1',
        startOffset: 6,
        endNodeId: 'text-1',
        endOffset: 11
      }, italicMark);

      const node = dataStore.getNode('text-1');
      expect(node?.marks).toEqual([boldMark, italicMark]);

      dataStore.end();
      dataStore.commit();

      const finalNode = dataStore.getNode('text-1');
      expect(finalNode?.marks).toEqual([boldMark, italicMark]);
    });
  });

  describe('Mark Operations with $alias', () => {
    it('should apply mark using alias in transaction', () => {
      const textNode: INode = {
        sid: 'text-1',
        stype: 'inline-text',
        text: 'Hello World',
        attributes: { $alias: 'myText' },
        parentId: 'para-1'
      };
      dataStore.setNode(textNode);

      dataStore.begin();
      dataStore.setAlias('myText', 'text-1');
      
      const mark = { stype: 'bold', range: [0, 5] as [number, number] };
      const contentRange = {
        startNodeId: 'myText',
        startOffset: 0,
        endNodeId: 'myText',
        endOffset: 5
      };

      dataStore.range.applyMark(contentRange, mark);

      const updatedNode = dataStore.getNode('myText');
      expect(updatedNode?.marks).toEqual([mark]);

      dataStore.end();
      dataStore.commit();
    });

    it('should normalize marks using alias', () => {
      const textNode: INode = {
        sid: 'text-1',
        stype: 'inline-text',
        text: 'Hello',
        marks: [{ stype: 'bold' }], // Missing range
        attributes: { $alias: 'myText' },
        parentId: 'para-1'
      };
      dataStore.setNode(textNode);

      dataStore.begin();
      dataStore.setAlias('myText', 'text-1');

      dataStore.marks.normalizeMarks('myText');

      const updatedNode = dataStore.getNode('myText');
      expect(updatedNode?.marks).toEqual([
        { stype: 'bold', range: [0, 5] }
      ]);

      dataStore.end();
      dataStore.commit();
    });
  });

  describe('Mark Operations Edge Cases', () => {
    it('should handle non-existent node gracefully', () => {
      expect(() => {
        dataStore.marks.normalizeMarks('non-existent');
      }).not.toThrow();
    });

    it('should handle node without text property', () => {
      const node: INode = {
        sid: 'node-1',
        stype: 'paragraph',
        content: [],
        marks: [{ stype: 'bold', range: [0, 5] as [number, number] }],
        parentId: 'doc-1'
      };
      dataStore.setNode(node);

      dataStore.marks.normalizeMarks('node-1');

      const updatedNode = dataStore.getNode('node-1');
      expect(updatedNode?.marks).toEqual([]); // Should clear marks for non-text nodes
    });

    it('should handle complex mark overlapping scenarios', () => {
      const textNode: INode = {
        sid: 'text-1',
        stype: 'inline-text',
        text: 'Hello World',
        marks: [
          { stype: 'bold', range: [0, 8] as [number, number] },
          { stype: 'italic', range: [2, 6] as [number, number] },
          { stype: 'underline', range: [4, 10] as [number, number] }
        ],
        parentId: 'para-1'
      };
      dataStore.setNode(textNode);

      dataStore.marks.normalizeMarks('text-1');

      const updatedNode = dataStore.getNode('text-1');
      // Should have sorted, non-overlapping marks
      expect(updatedNode?.marks).toEqual([
        { stype: 'bold', range: [0, 8] },
        { stype: 'italic', range: [2, 6] },
        { stype: 'underline', range: [4, 10] }
      ]);
    });
  });
});
