import { describe, it, expect, beforeEach } from 'vitest';
import { DataStore } from '../src/data-store';
import { Schema } from '@barocss/schema';
import type { INode } from '../src/types';

describe('DataStore Content Management Functions', () => {
  let dataStore: DataStore;
  let schema: Schema;

  beforeEach(() => {
    schema = new Schema('test-schema', {
      nodes: {
        'inline-text': {
          name: 'inline-text',
          group: 'inline',
          content: 'text*',
          attrs: {
            class: { type: 'string', default: null }
          }
        },
        'paragraph': {
          name: 'paragraph',
          group: 'block',
          content: 'inline*',
          attrs: {
            class: { type: 'string', default: null }
          }
        },
        'document': {
          name: 'document',
          group: 'document',
          content: 'block+',
          attrs: {
            class: { type: 'string', default: null }
          }
        }
      },
      marks: {}
    });
    
    dataStore = new DataStore(undefined, schema);
  });

  describe('addChild', () => {
    let parent: INode;
    let child: INode;

    beforeEach(() => {
      parent = {
        sid: 'parent',
        stype: 'paragraph',
        content: [],
        attributes: {}
      };

      child = {
        sid: 'child',
        stype: 'inline-text',
        text: 'Child text',
        attributes: {}
      };

      dataStore.setNode(parent, false);
      dataStore.setNode(child, false);
    });

    it('should add child to parent content', () => {
      dataStore.begin();
      const childId = dataStore.addChild('parent', 'child');
      const ops = dataStore.end();

      expect(childId).toBe('child');
      
      const updatedParent = dataStore.getNode('parent');
      expect(updatedParent!.content).toContain('child');
      expect(updatedParent!.content).toHaveLength(1);

      const updatedChild = dataStore.getNode('child');
      expect(updatedChild!.parentId).toBe('parent');
      const types = ops.map(o => o.type);
      expect(types).toContain('update');
    });

    it('should add new child node object to parent', () => {
      const newChild = {
        stype: 'inline-text',
        text: 'New child text',
        attributes: { class: 'new-child' }
      };

      dataStore.begin();
      const childId = dataStore.addChild('parent', newChild);
      const ops = dataStore.end();

      expect(childId).toBeDefined();
      expect(childId).toMatch(/^\d+:\d+$/); // Figma-style ID

      const updatedParent = dataStore.getNode('parent');
      expect(updatedParent!.content).toContain(childId);
      expect(updatedParent!.content).toHaveLength(1);

      const addedChild = dataStore.getNode(childId);
      expect(addedChild).toBeDefined();
      expect(addedChild!.stype).toBe('inline-text');
      expect(addedChild!.text).toBe('New child text');
      expect(addedChild!.attributes.class).toBe('new-child');
      expect(addedChild!.parentId).toBe('parent');
      const types2 = ops.map(o => o.type);
      expect(types2).toContain('create');
      expect(types2).toContain('update');
    });

    it('should add child at specific position', () => {
      // First add another child
      const child2 = {
        sid: 'child-2',
        stype: 'inline-text',
        text: 'Child 2',
        attributes: {}
      };
      dataStore.setNode(child2, false);
      dataStore.begin();
      dataStore.addChild('parent', 'child-2');
      dataStore.end();

      // Add child at first position
      dataStore.begin();
      const childId = dataStore.addChild('parent', 'child', 0);
      dataStore.end();

      expect(childId).toBe('child');
      
      const updatedParent = dataStore.getNode('parent');
      expect(updatedParent!.content[0]).toBe('child');
      expect(updatedParent!.content[1]).toBe('child-2');
    });

    it('should add child at end if position not specified', () => {
      dataStore.begin();
      const childId = dataStore.addChild('parent', 'child');
      dataStore.end();

      expect(childId).toBe('child');
      
      const updatedParent = dataStore.getNode('parent');
      expect(updatedParent!.content[0]).toBe('child');
    });

    it('should throw error if parent not found', () => {
      expect(() => {
        dataStore.addChild('non-existent', 'child');
      }).toThrow('Parent node not found: non-existent');
    });

    it('should throw error if child not found', () => {
      expect(() => {
        dataStore.addChild('parent', 'non-existent');
      }).toThrow('Child node not found: non-existent');
    });

    it('should validate new child node object', () => {
      const invalidChild = {
        stype: 'invalid-type', // Type not defined in schema
        text: 'Invalid child'
      };

      expect(() => {
        dataStore.addChild('parent', invalidChild);
      }).toThrow('Schema validation failed');
    });

    it('should pass validation for valid child node object', () => {
      const validChild = {
        stype: 'inline-text',
        text: 'Valid child',
        attributes: { class: 'valid' }
      };

      const childId = dataStore.addChild('parent', validChild);
      
      expect(childId).toBeDefined();
      expect(childId).toMatch(/^\d+:\d+$/);
      
      const addedChild = dataStore.getNode(childId);
      expect(addedChild!.stype).toBe('inline-text');
      expect(addedChild!.text).toBe('Valid child');
    });
  });

  describe('removeChild', () => {
    let parent: INode;
    let child1: INode;
    let child2: INode;

    beforeEach(() => {
      parent = {
        sid: 'parent',
        stype: 'paragraph',
        content: ['child-1', 'child-2'],
        attributes: {}
      };

      child1 = {
        sid: 'child-1',
        stype: 'inline-text',
        text: 'Child 1',
        parentId: 'parent',
        attributes: {}
      };

      child2 = {
        sid: 'child-2',
        stype: 'inline-text',
        text: 'Child 2',
        parentId: 'parent',
        attributes: {}
      };

      dataStore.setNode(parent, false);
      dataStore.setNode(child1, false);
      dataStore.setNode(child2, false);
    });

    it('should remove child from parent content', () => {
      dataStore.begin();
      dataStore.removeChild('parent', 'child-1');
      const ops = dataStore.end();

      const updatedParent = dataStore.getNode('parent');
      expect(updatedParent!.content).not.toContain('child-1');
      expect(updatedParent!.content).toContain('child-2');
      expect(updatedParent!.content).toHaveLength(1);

      const updatedChild = dataStore.getNode('child-1');
      expect(updatedChild!.parentId).toBeUndefined();
      const types3 = ops.map(o => o.type);
      expect(types3).toContain('update');
    });

    it('should handle removing non-existent child gracefully', () => {
      dataStore.removeChild('parent', 'non-existent');

      const updatedParent = dataStore.getNode('parent');
      expect(updatedParent!.content).toHaveLength(2); // Unchanged
    });

    it('should throw error if parent not found', () => {
      expect(() => {
        dataStore.removeChild('non-existent', 'child-1');
      }).toThrow('Parent node not found: non-existent');
    });

    it('should handle non-existent child gracefully', () => {
      // Should not throw error when removing non-existent child
      expect(() => {
        dataStore.removeChild('parent', 'non-existent');
      }).not.toThrow();
    });
  });

  describe('reorderChildren', () => {
    let parent: INode;
    let child1: INode;
    let child2: INode;
    let child3: INode;

    beforeEach(() => {
      parent = {
        sid: 'parent',
        stype: 'paragraph',
        content: ['child-1', 'child-2', 'child-3'],
        attributes: {}
      };

      child1 = {
        sid: 'child-1',
        stype: 'inline-text',
        text: 'Child 1',
        parentId: 'parent',
        attributes: {}
      };

      child2 = {
        sid: 'child-2',
        stype: 'inline-text',
        text: 'Child 2',
        parentId: 'parent',
        attributes: {}
      };

      child3 = {
        sid: 'child-3',
        stype: 'inline-text',
        text: 'Child 3',
        parentId: 'parent',
        attributes: {}
      };

      dataStore.setNode(parent, false);
      dataStore.setNode(child1, false);
      dataStore.setNode(child2, false);
      dataStore.setNode(child3, false);
    });

    it('should reorder children', () => {
      dataStore.begin();
      dataStore.reorderChildren('parent', ['child-3', 'child-1', 'child-2']);
      const ops = dataStore.end();

      const updatedParent = dataStore.getNode('parent');
      expect(updatedParent!.content).toEqual(['child-3', 'child-1', 'child-2']);
      const moveOps = ops.filter(o => o.type === 'move');
      expect(moveOps.length).toBeGreaterThan(0);
    });

    it('should handle partial reordering', () => {
      dataStore.begin();
      dataStore.reorderChildren('parent', ['child-2', 'child-1']);
      const ops = dataStore.end();

      const updatedParent = dataStore.getNode('parent');
      expect(updatedParent!.content).toEqual(['child-2', 'child-1']);
      const moveOps2 = ops.filter(o => o.type === 'move');
      expect(moveOps2.length).toBeGreaterThan(0);
    });

    it('should throw error if parent not found', () => {
      expect(() => {
        dataStore.reorderChildren('non-existent', ['child-1', 'child-2']);
      }).toThrow('Parent node not found: non-existent');
    });

    it('should throw error if child not found', () => {
      expect(() => {
        dataStore.reorderChildren('parent', ['child-1', 'non-existent']);
      }).toThrow('Child node not found: non-existent');
    });
  });

  describe('Complex Scenarios', () => {
    let document: INode;
    let paragraph1: INode;
    let paragraph2: INode;
    let text1: INode;
    let text2: INode;
    let text3: INode;

    beforeEach(() => {
      document = {
        sid: 'document',
        stype: 'document',
        content: ['paragraph-1', 'paragraph-2'],
        attributes: {}
      };

      paragraph1 = {
        sid: 'paragraph-1',
        stype: 'paragraph',
        content: ['text-1', 'text-2'],
        parentId: 'document',
        attributes: {}
      };

      paragraph2 = {
        sid: 'paragraph-2',
        stype: 'paragraph',
        content: ['text-3'],
        parentId: 'document',
        attributes: {}
      };

      text1 = {
        sid: 'text-1',
        stype: 'inline-text',
        text: 'Text 1',
        parentId: 'paragraph-1',
        attributes: {}
      };

      text2 = {
        sid: 'text-2',
        stype: 'inline-text',
        text: 'Text 2',
        parentId: 'paragraph-1',
        attributes: {}
      };

      text3 = {
        sid: 'text-3',
        stype: 'inline-text',
        text: 'Text 3',
        parentId: 'paragraph-2',
        attributes: {}
      };

      dataStore.setNode(document, false);
      dataStore.setNode(paragraph1, false);
      dataStore.setNode(paragraph2, false);
      dataStore.setNode(text1, false);
      dataStore.setNode(text2, false);
      dataStore.setNode(text3, false);
    });

    it('should handle complex move operations', () => {
      // Move text-1 to paragraph-2
      dataStore.moveNode('text-1', 'paragraph-2');

      const updatedParagraph1 = dataStore.getNode('paragraph-1');
      const updatedParagraph2 = dataStore.getNode('paragraph-2');
      const updatedText1 = dataStore.getNode('text-1');

      expect(updatedParagraph1!.content).toEqual(['text-2']);
      expect(updatedParagraph2!.content).toEqual(['text-3', 'text-1']);
      expect(updatedText1!.parentId).toBe('paragraph-2');
    });

    it('should handle complex copy operations', () => {
      // Copy paragraph-1
      const newParagraphId = dataStore.cloneNodeWithChildren('paragraph-1', 'document');

      const updatedDocument = dataStore.getNode('document');
      expect(updatedDocument!.content).toContain(newParagraphId);

      const newParagraph = dataStore.getNode(newParagraphId);
      expect(newParagraph!.content).toHaveLength(2);
      expect(newParagraph!.parentId).toBe('document');
    });

    it('should handle reordering with moves', () => {
      // Move text-1 to paragraph-2
      dataStore.moveNode('text-1', 'paragraph-2');
      
      // Reorder children of paragraph-2
      dataStore.reorderChildren('paragraph-2', ['text-1', 'text-3']);

      const updatedParagraph2 = dataStore.getNode('paragraph-2');
      expect(updatedParagraph2!.content).toEqual(['text-1', 'text-3']);
    });
  });
});
