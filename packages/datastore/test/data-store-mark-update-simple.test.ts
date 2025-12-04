import { describe, it, expect, beforeEach } from 'vitest';
import { DataStore } from '../src/data-store';
import { createSchema } from '@barocss/schema';
import type { INode } from '../src/types';

describe('DataStore Mark Update Operations (Simplified)', () => {
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
          group: 'inline'
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

    it('should add multiple marks via updateNode', () => {
      const textNode: INode = {
        sid: 'text-1',
        stype: 'inline-text',
        text: 'Hello World',
        parentId: 'para-1'
      };
      dataStore.setNode(textNode);

      const marks = [
        { stype: 'bold', range: [0, 5] as [number, number] },
        { stype: 'italic', range: [6, 11] as [number, number] }
      ];
      const result = dataStore.updateNode('text-1', { marks });
      expect(result?.valid).toBe(true);

      const updatedNode = dataStore.getNode('text-1');
      expect(updatedNode?.marks).toEqual(marks);
    });

    it('should update existing marks via updateNode', () => {
      const textNode: INode = {
        sid: 'text-1',
        stype: 'inline-text',
        text: 'Hello World',
        marks: [{ stype: 'bold', range: [0, 5] as [number, number] }],
        parentId: 'para-1'
      };
      dataStore.setNode(textNode);

      const newMarks = [
        { stype: 'bold', range: [0, 5] as [number, number] },
        { stype: 'italic', range: [6, 11] as [number, number] }
      ];
      const result = dataStore.updateNode('text-1', { marks: newMarks });
      expect(result?.valid).toBe(true);

      const updatedNode = dataStore.getNode('text-1');
      expect(updatedNode?.marks).toEqual(newMarks);
    });

    it('should clear marks via updateNode', () => {
      const textNode: INode = {
        sid: 'text-1',
        stype: 'inline-text',
        text: 'Hello World',
        marks: [{ stype: 'bold', range: [0, 5] as [number, number] }],
        parentId: 'para-1'
      };
      dataStore.setNode(textNode);

      const result = dataStore.updateNode('text-1', { marks: [] });
      expect(result?.valid).toBe(true);

      const updatedNode = dataStore.getNode('text-1');
      expect(updatedNode?.marks).toEqual([]);
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
      // Spec: normalizeMarks persists explicit empty marks []
      expect(updatedNode?.marks).toEqual([]);
    });
  });

  describe('Mark Operations with Transaction Overlay', () => {
    it('should update marks within transaction overlay', () => {
      const textNode: INode = {
        sid: 'text-1',
        stype: 'inline-text',
        text: 'Hello World',
        parentId: 'para-1'
      };
      dataStore.setNode(textNode);

      dataStore.begin();
      
      const mark = { stype: 'bold', range: [0, 5] as [number, number] };
      const result = dataStore.updateNode('text-1', { marks: [mark] });
      expect(result?.valid).toBe(true);

      // Check overlay has the mark
      const overlayNode = dataStore.getNode('text-1');
      expect(overlayNode?.marks).toEqual([mark]);

      // Check base still has original (no marks) after rollback
      dataStore.rollback();
      const baseNode = dataStore.getNode('text-1');
      expect(baseNode?.marks).toBeUndefined(); // Should be undefined after rollback
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
      dataStore.updateNode('text-1', { marks: [mark] });
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
      dataStore.updateNode('text-1', { marks: [boldMark] });

      // Apply italic mark
      const italicMark = { stype: 'italic', range: [6, 11] as [number, number] };
      dataStore.updateNode('text-1', { marks: [boldMark, italicMark] });

      const node = dataStore.getNode('text-1');
      expect(node?.marks).toEqual([boldMark, italicMark]);

      dataStore.end();
      dataStore.commit();

      const finalNode = dataStore.getNode('text-1');
      expect(finalNode?.marks).toEqual([boldMark, italicMark]);
    });
  });

  describe('Mark Operations with $alias', () => {
    it('should update marks using alias in transaction', () => {
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
      const result = dataStore.updateNode('myText', { marks: [mark] });
      expect(result?.valid).toBe(true);

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
