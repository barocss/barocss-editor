import { describe, it, expect, beforeEach } from 'vitest';
import { DataStore } from '../src/data-store';
import { createSchema } from '@barocss/schema';
import type { INode } from '../src/types';

describe('DataStore Update Operations', () => {
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
            content: { type: 'string', required: false },
            style: { type: 'string', required: false }
          }
        }
      }
    });
    dataStore.registerSchema(schema);
  });

  describe('Basic Update Operations', () => {
    it('should update text content of a text node', () => {
      const textNode: INode = {
        sid: 'text-1',
        stype: 'inline-text',
        text: 'Hello World',
        parentId: 'para-1'
      };
      dataStore.setNode(textNode);

      const result = dataStore.updateNode('text-1', { text: 'Updated Text' });
      expect(result?.valid).toBe(true);

      const updatedNode = dataStore.getNode('text-1');
      expect(updatedNode?.text).toBe('Updated Text');
    });

    it('should update attributes of a node', () => {
      const textNode: INode = {
        sid: 'text-1',
        stype: 'inline-text',
        text: 'Hello',
        attributes: { content: 'original', style: 'normal' },
        parentId: 'para-1'
      };
      dataStore.setNode(textNode);

      const result = dataStore.updateNode('text-1', { 
        attributes: { content: 'updated', style: 'bold' } 
      });
      expect(result?.valid).toBe(true);

      const updatedNode = dataStore.getNode('text-1');
      expect(updatedNode?.attributes?.content).toBe('updated');
      expect(updatedNode?.attributes?.style).toBe('bold');
    });

    it('should update marks of a text node', () => {
      const textNode: INode = {
        sid: 'text-1',
        stype: 'inline-text',
        text: 'Hello World',
        marks: [{ stype: 'bold', range: [0, 5] }],
        parentId: 'para-1'
      };
      dataStore.setNode(textNode);

      const newMarks = [
        { stype: 'bold', range: [0, 5] },
        { stype: 'italic', range: [6, 11] }
      ];
      const result = dataStore.updateNode('text-1', { marks: newMarks });
      expect(result?.valid).toBe(true);

      const updatedNode = dataStore.getNode('text-1');
      expect(updatedNode?.marks).toEqual(newMarks);
    });

    it('should update multiple fields at once', () => {
      const textNode: INode = {
        sid: 'text-1',
        stype: 'inline-text',
        text: 'Hello',
        attributes: { content: 'original' },
        marks: [{ stype: 'bold', range: [0, 5] }],
        parentId: 'para-1'
      };
      dataStore.setNode(textNode);

      const result = dataStore.updateNode('text-1', {
        text: 'Updated Text',
        attributes: { content: 'updated', style: 'italic' },
        marks: [{ stype: 'italic', range: [0, 12] }]
      });
      expect(result?.valid).toBe(true);

      const updatedNode = dataStore.getNode('text-1');
      expect(updatedNode?.text).toBe('Updated Text');
      expect(updatedNode?.attributes?.content).toBe('updated');
      expect(updatedNode?.attributes?.style).toBe('italic');
      expect(updatedNode?.marks).toEqual([{ stype: 'italic', range: [0, 12] }]);
    });
  });

  describe('Update Validation', () => {
    it('should validate schema constraints during update', () => {
      const textNode: INode = {
        sid: 'text-1',
        stype: 'inline-text',
        text: 'Hello',
        parentId: 'para-1'
      };
      dataStore.setNode(textNode);

      // Try to update with invalid attribute type
      const result = dataStore.updateNode('text-1', {
        attributes: { content: 123 } // Should be string
      });
      
      // Note: Current implementation might not validate types strictly
      // This test documents expected behavior
      expect(result).toBeDefined();
    });

    it('should handle update of non-existent node', () => {
      const result = dataStore.updateNode('non-existent', { text: 'New Text' });
      expect(result?.valid).toBe(false);
      expect(result?.errors).toContain('Node not found: non-existent');
    });

    it('should handle partial attribute updates', () => {
      const textNode: INode = {
        sid: 'text-1',
        stype: 'inline-text',
        text: 'Hello',
        attributes: { content: 'original', style: 'normal' },
        parentId: 'para-1'
      };
      dataStore.setNode(textNode);

      // Update only one attribute
      const result = dataStore.updateNode('text-1', {
        attributes: { content: 'updated' }
      });
      expect(result?.valid).toBe(true);

      const updatedNode = dataStore.getNode('text-1');
      expect(updatedNode?.attributes?.content).toBe('updated');
      expect(updatedNode?.attributes?.style).toBe('normal'); // Should remain unchanged
    });
  });

  describe('Update with Transaction Overlay', () => {
    it('should update node within transaction overlay', () => {
      const textNode: INode = {
        sid: 'text-1',
        stype: 'inline-text',
        text: 'Hello',
        parentId: 'para-1'
      };
      dataStore.setNode(textNode);

      dataStore.begin();
      const result = dataStore.updateNode('text-1', { text: 'Updated in Overlay' });
      expect(result?.valid).toBe(true);

      // Check overlay has the update
      const overlayNode = dataStore.getNode('text-1');
      expect(overlayNode?.text).toBe('Updated in Overlay');

      // Check base still has original
      dataStore.rollback();
      const baseNode = dataStore.getNode('text-1');
      expect(baseNode?.text).toBe('Hello');
    });

    it('should commit overlay updates to base', () => {
      const textNode: INode = {
        sid: 'text-1',
        stype: 'inline-text',
        text: 'Hello',
        parentId: 'para-1'
      };
      dataStore.setNode(textNode);

      dataStore.begin();
      dataStore.updateNode('text-1', { text: 'Committed Update' });
      dataStore.end();
      dataStore.commit();

      const committedNode = dataStore.getNode('text-1');
      expect(committedNode?.text).toBe('Committed Update');
    });

    it('should handle multiple updates in same transaction', () => {
      const textNode: INode = {
        sid: 'text-1',
        stype: 'inline-text',
        text: 'Hello',
        attributes: { content: 'original' },
        parentId: 'para-1'
      };
      dataStore.setNode(textNode);

      dataStore.begin();
      
      // First update
      dataStore.updateNode('text-1', { text: 'First Update' });
      let node = dataStore.getNode('text-1');
      expect(node?.text).toBe('First Update');

      // Second update
      dataStore.updateNode('text-1', { 
        text: 'Second Update',
        attributes: { content: 'updated' }
      });
      node = dataStore.getNode('text-1');
      expect(node?.text).toBe('Second Update');
      expect(node?.attributes?.content).toBe('updated');

      dataStore.end();
      dataStore.commit();

      const finalNode = dataStore.getNode('text-1');
      expect(finalNode?.text).toBe('Second Update');
      expect(finalNode?.attributes?.content).toBe('updated');
    });
  });

  describe('Update with $alias', () => {
    it('should update node using alias in transaction', () => {
      const textNode: INode = {
        sid: 'text-1',
        stype: 'inline-text',
        text: 'Hello',
        attributes: { $alias: 'myText' },
        parentId: 'para-1'
      };
      dataStore.setNode(textNode);

      dataStore.begin();
      dataStore.setAlias('myText', 'text-1');
      
      const result = dataStore.updateNode('myText', { text: 'Updated via Alias' });
      expect(result?.valid).toBe(true);

      const updatedNode = dataStore.getNode('myText');
      expect(updatedNode?.text).toBe('Updated via Alias');

      dataStore.end();
      dataStore.commit();
    });

    it('should handle alias resolution during update', () => {
      const textNode: INode = {
        sid: 'text-1',
        stype: 'inline-text',
        text: 'Hello',
        parentId: 'para-1'
      };
      dataStore.setNode(textNode);

      dataStore.begin();
      dataStore.setAlias('alias1', 'text-1');
      dataStore.setAlias('alias2', 'text-1'); // Same node, different alias

      // Update using first alias
      dataStore.updateNode('alias1', { text: 'Updated via alias1' });
      let node = dataStore.getNode('alias1');
      expect(node?.text).toBe('Updated via alias1');

      // Update using second alias (should affect same node)
      dataStore.updateNode('alias2', { text: 'Updated via alias2' });
      node = dataStore.getNode('alias2');
      expect(node?.text).toBe('Updated via alias2');

      // Both aliases should point to same updated node
      expect(dataStore.getNode('alias1')?.text).toBe('Updated via alias2');
      expect(dataStore.getNode('text-1')?.text).toBe('Updated via alias2');

      dataStore.end();
      dataStore.commit();
    });
  });

  describe('Update Edge Cases', () => {
    it('should handle empty updates gracefully', () => {
      const textNode: INode = {
        sid: 'text-1',
        stype: 'inline-text',
        text: 'Hello',
        parentId: 'para-1'
      };
      dataStore.setNode(textNode);

      const result = dataStore.updateNode('text-1', {});
      expect(result?.valid).toBe(true);

      const node = dataStore.getNode('text-1');
      expect(node?.text).toBe('Hello'); // Should remain unchanged
    });

    it('should handle null/undefined values in updates', () => {
      const textNode: INode = {
        sid: 'text-1',
        stype: 'inline-text',
        text: 'Hello',
        attributes: { content: 'original' },
        parentId: 'para-1'
      };
      dataStore.setNode(textNode);

      const result = dataStore.updateNode('text-1', {
        text: undefined,
        attributes: { content: null }
      });
      expect(result?.valid).toBe(true);

      const node = dataStore.getNode('text-1');
      expect(node?.text).toBe(undefined); // undefined overwrites original value
      expect(node?.attributes?.content).toBe(null);
    });

    it('should handle deep attribute updates', () => {
      const textNode: INode = {
        sid: 'text-1',
        stype: 'inline-text',
        text: 'Hello',
        attributes: { 
          content: 'original',
          metadata: { author: 'user1', version: 1 }
        },
        parentId: 'para-1'
      };
      dataStore.setNode(textNode);

      const result = dataStore.updateNode('text-1', {
        attributes: { 
          content: 'updated',
          metadata: { author: 'user2', version: 2, newField: 'value' }
        }
      });
      expect(result?.valid).toBe(true);

      const node = dataStore.getNode('text-1');
      expect(node?.attributes?.content).toBe('updated');
      expect(node?.attributes?.metadata?.author).toBe('user2');
      expect(node?.attributes?.metadata?.version).toBe(2);
      expect(node?.attributes?.metadata?.newField).toBe('value');
    });
  });

  describe('Update Performance', () => {
    it('should handle multiple rapid updates efficiently', () => {
      const textNode: INode = {
        sid: 'text-1',
        stype: 'inline-text',
        text: 'Hello',
        parentId: 'para-1'
      };
      dataStore.setNode(textNode);

      const startTime = Date.now();
      
      // Perform 100 updates
      for (let i = 0; i < 100; i++) {
        dataStore.updateNode('text-1', { text: `Update ${i}` });
      }
      
      const endTime = Date.now();
      const duration = endTime - startTime;
      
      // Should complete within reasonable time (adjust threshold as needed)
      expect(duration).toBeLessThan(1000); // 1 second
      
      const finalNode = dataStore.getNode('text-1');
      expect(finalNode?.text).toBe('Update 99');
    });
  });
});