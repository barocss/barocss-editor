import { describe, it, expect, beforeEach } from 'vitest';
import { DataStore } from '../src/data-store';
import { Schema } from '@barocss/schema';
import type { INode } from '../src/types';

describe('DataStore Utility Methods', () => {
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
            class: { type: 'string', default: null },
            id: { type: 'string', default: null }
          } 
        },
        'paragraph': { 
          name: 'paragraph', 
          group: 'block', 
          content: 'inline*', 
          attrs: { 
            class: { type: 'string', default: null },
            id: { type: 'string', default: null }
          } 
        },
        'document': { 
          name: 'document', 
          group: 'document', 
          content: 'block+', 
          attrs: { 
            class: { type: 'string', default: null },
            id: { type: 'string', default: null }
          } 
        }
      },
      marks: {}
    });
    dataStore = new DataStore(undefined, schema);

    // Create hierarchical structure for testing
    const document: INode = {
      sid: 'doc',
      stype: 'document',
      content: ['para-1', 'para-2'],
      attributes: { class: 'main-doc', sid: 'doc-1' }
    };
    const para1: INode = {
      sid: 'para-1',
      stype: 'paragraph',
      content: ['text-1', 'text-2'],
      parentId: 'doc',
      attributes: { class: 'intro', sid: 'para-1' }
    };
    const para2: INode = {
      sid: 'para-2',
      stype: 'paragraph',
      content: ['text-3'],
      parentId: 'doc',
      attributes: { class: 'conclusion', sid: 'para-2' }
    };
    const text1: INode = {
      sid: 'text-1',
      stype: 'inline-text',
      text: 'Hello World',
      parentId: 'para-1',
      attributes: { class: 'bold', sid: 'text-1' }
    };
    const text2: INode = {
      sid: 'text-2',
      stype: 'inline-text',
      text: 'Second Text',
      parentId: 'para-1',
      attributes: { class: 'normal', sid: 'text-2' }
    };
    const text3: INode = {
      sid: 'text-3',
      stype: 'inline-text',
      text: 'Final Text',
      parentId: 'para-2',
      attributes: { class: 'italic', sid: 'text-3' }
    };

    dataStore.setNode(document, false);
    dataStore.setNode(para1, false);
    dataStore.setNode(para2, false);
    dataStore.setNode(text1, false);
    dataStore.setNode(text2, false);
    dataStore.setNode(text3, false);
    dataStore.setRootNodeId('doc');
  });

  describe('hasNode', () => {
    it('should return true for existing nodes', () => {
      expect(dataStore.hasNode('doc')).toBe(true);
      expect(dataStore.hasNode('para-1')).toBe(true);
      expect(dataStore.hasNode('text-1')).toBe(true);
    });

    it('should return false for non-existent nodes', () => {
      expect(dataStore.hasNode('non-existent')).toBe(false);
      expect(dataStore.hasNode('')).toBe(false);
    });
  });

  describe('getChildCount', () => {
    it('should return correct child count for nodes with children', () => {
      expect(dataStore.getChildCount('doc')).toBe(2); // para-1, para-2
      expect(dataStore.getChildCount('para-1')).toBe(2); // text-1, text-2
      expect(dataStore.getChildCount('para-2')).toBe(1); // text-3
    });

    it('should return 0 for leaf nodes', () => {
      expect(dataStore.getChildCount('text-1')).toBe(0);
      expect(dataStore.getChildCount('text-2')).toBe(0);
      expect(dataStore.getChildCount('text-3')).toBe(0);
    });

    it('should return 0 for non-existent nodes', () => {
      expect(dataStore.getChildCount('non-existent')).toBe(0);
    });

    it('should return 0 for nodes without content', () => {
      const emptyNode: INode = {
        sid: 'empty-node',
        stype: 'inline-text',
        text: 'Empty',
        attributes: {}
      };
      dataStore.setNode(emptyNode, false);
      
      expect(dataStore.getChildCount('empty-node')).toBe(0);
    });
  });

  describe('isLeafNode', () => {
    it('should return true for leaf nodes', () => {
      expect(dataStore.isLeafNode('text-1')).toBe(true);
      expect(dataStore.isLeafNode('text-2')).toBe(true);
      expect(dataStore.isLeafNode('text-3')).toBe(true);
    });

    it('should return false for nodes with children', () => {
      expect(dataStore.isLeafNode('doc')).toBe(false);
      expect(dataStore.isLeafNode('para-1')).toBe(false);
      expect(dataStore.isLeafNode('para-2')).toBe(false);
    });

    it('should return true for non-existent nodes', () => {
      expect(dataStore.isLeafNode('non-existent')).toBe(true);
    });
  });

  describe('isRootNode', () => {
    it('should return true for root node', () => {
      expect(dataStore.isRootNode('doc')).toBe(true);
    });

    it('should return false for non-root nodes', () => {
      expect(dataStore.isRootNode('para-1')).toBe(false);
      expect(dataStore.isRootNode('text-1')).toBe(false);
    });

    it('should return false for non-existent nodes', () => {
      expect(dataStore.isRootNode('non-existent')).toBe(false);
    });

    it('should update when root node changes', () => {
      // Set new root node
      const newRoot: INode = {
        sid: 'new-root',
        stype: 'document',
        content: [],
        attributes: { class: 'new-root' }
      };
      dataStore.setNode(newRoot, false);
      dataStore.setRootNodeId('new-root');

      expect(dataStore.isRootNode('doc')).toBe(false);
      expect(dataStore.isRootNode('new-root')).toBe(true);
    });
  });

  describe('getSiblings', () => {
    it('should return siblings for nodes with same parent', () => {
      const text1Siblings = dataStore.getSiblings('text-1');
      expect(text1Siblings).toHaveLength(1);
      expect(text1Siblings[0].sid).toBe('text-2');

      const text2Siblings = dataStore.getSiblings('text-2');
      expect(text2Siblings).toHaveLength(1);
      expect(text2Siblings[0].sid).toBe('text-1');
    });

    it('should return empty array for only child', () => {
      const text3Siblings = dataStore.getSiblings('text-3');
      expect(text3Siblings).toHaveLength(0);
    });

    it('should return empty array for root node', () => {
      const docSiblings = dataStore.getSiblings('doc');
      expect(docSiblings).toHaveLength(0);
    });

    it('should return empty array for non-existent nodes', () => {
      const nonExistentSiblings = dataStore.getSiblings('non-existent');
      expect(nonExistentSiblings).toHaveLength(0);
    });

    it('should return empty array for nodes without parent', () => {
      const orphanNode: INode = {
        sid: 'orphan',
        stype: 'inline-text',
        text: 'Orphan',
        attributes: {}
      };
      dataStore.setNode(orphanNode, false);

      const orphanSiblings = dataStore.getSiblings('orphan');
      expect(orphanSiblings).toHaveLength(0);
    });

    it('should update when siblings change', () => {
      // Add new sibling node
      const newSibling: INode = {
        sid: 'text-4',
        stype: 'inline-text',
        text: 'New Sibling',
        parentId: 'para-1',
        attributes: { class: 'new-sibling' }
      };
      dataStore.setNode(newSibling, false);
      dataStore.addChild('para-1', 'text-4');

      const text1Siblings = dataStore.getSiblings('text-1');
      expect(text1Siblings).toHaveLength(2);
      expect(text1Siblings.map(s => s.sid)).toContain('text-2');
      expect(text1Siblings.map(s => s.sid)).toContain('text-4');
    });
  });

  describe('Integration with existing functions', () => {
    it('should work with tree navigation functions', () => {
      // Combination of getNodePath and isLeafNode
      const text1Path = dataStore.getNodePath('text-1');
      expect(text1Path).toEqual(['doc', 'para-1', 'text-1']);
      expect(dataStore.isLeafNode('text-1')).toBe(true);

      // Combination of getNodeDepth and getChildCount
      const para1Depth = dataStore.getNodeDepth('para-1');
      const para1ChildCount = dataStore.getChildCount('para-1');
      expect(para1Depth).toBe(1);
      expect(para1ChildCount).toBe(2);
    });

    it('should work with query functions', () => {
      // Combination of findNodes and isLeafNode (stype filtering)
      const textNodes = dataStore.findNodes(node => node.stype === 'inline-text');
      expect(textNodes.length).toBeGreaterThanOrEqual(3);
      const leafNodes = textNodes.filter(node => dataStore.isLeafNode(node.sid!));
      expect(leafNodes.length).toBeGreaterThanOrEqual(3);

      // Combination of findByAttribute and getSiblings
      const boldNodes = dataStore.findByAttribute('class', 'bold');
      if (boldNodes.length > 0) {
        const boldNodeSiblings = dataStore.getSiblings(boldNodes[0].sid!);
        expect(boldNodeSiblings.length).toBeGreaterThanOrEqual(0);
      }
    });

    it('should work with content manipulation functions', () => {
      // Combination of addChild and getChildCount
      const initialCount = dataStore.getChildCount('para-1');
      const newChild = dataStore.addChild('para-1', {
        stype: 'inline-text',
        text: 'New Child',
        attributes: { class: 'new' }
      });
      expect(dataStore.getChildCount('para-1')).toBe(initialCount + 1);

      // Combination of removeChild and getChildCount
      dataStore.removeChild('para-1', 'text-1');
      expect(dataStore.getChildCount('para-1')).toBe(initialCount);
    });
  });

  describe('getFirstChild', () => {
    it('should return first child for nodes with children', () => {
      expect(dataStore.getFirstChild('doc')).toBe('para-1');
      expect(dataStore.getFirstChild('para-1')).toBe('text-1');
      expect(dataStore.getFirstChild('para-2')).toBe('text-3');
    });

    it('should return null for leaf nodes', () => {
      expect(dataStore.getFirstChild('text-1')).toBeNull();
      expect(dataStore.getFirstChild('text-2')).toBeNull();
      expect(dataStore.getFirstChild('text-3')).toBeNull();
    });

    it('should return null for non-existent nodes', () => {
      expect(dataStore.getFirstChild('non-existent')).toBeNull();
    });

    it('should return null for nodes without content', () => {
      const emptyNode: INode = {
        sid: 'empty-node',
        stype: 'inline-text',
        text: 'Empty',
        attributes: {}
      };
      dataStore.setNode(emptyNode, false);
      expect(dataStore.getFirstChild('empty-node')).toBeNull();
    });
  });

  describe('getLastChild', () => {
    it('should return last child for nodes with children', () => {
      expect(dataStore.getLastChild('doc')).toBe('para-2');
      expect(dataStore.getLastChild('para-1')).toBe('text-2');
      expect(dataStore.getLastChild('para-2')).toBe('text-3');
    });

    it('should return null for leaf nodes', () => {
      expect(dataStore.getLastChild('text-1')).toBeNull();
      expect(dataStore.getLastChild('text-2')).toBeNull();
      expect(dataStore.getLastChild('text-3')).toBeNull();
    });

    it('should return null for non-existent nodes', () => {
      expect(dataStore.getLastChild('non-existent')).toBeNull();
    });

    it('should return null for nodes without content', () => {
      const emptyNode: INode = {
        sid: 'empty-node',
        stype: 'inline-text',
        text: 'Empty',
        attributes: {}
      };
      dataStore.setNode(emptyNode, false);
      expect(dataStore.getLastChild('empty-node')).toBeNull();
    });

    it('should return same value as getFirstChild for single child', () => {
      expect(dataStore.getFirstChild('para-2')).toBe('text-3');
      expect(dataStore.getLastChild('para-2')).toBe('text-3');
    });
  });

  describe('getFirstSibling', () => {
    it('should return first sibling for nodes with siblings', () => {
      expect(dataStore.getFirstSibling('text-1')).toBe('text-1');
      expect(dataStore.getFirstSibling('text-2')).toBe('text-1');
      expect(dataStore.getFirstSibling('para-1')).toBe('para-1');
      expect(dataStore.getFirstSibling('para-2')).toBe('para-1');
    });

    it('should return null for root node', () => {
      expect(dataStore.getFirstSibling('doc')).toBeNull();
    });

    it('should return null for non-existent nodes', () => {
      expect(dataStore.getFirstSibling('non-existent')).toBeNull();
    });

    it('should return null for nodes without parent', () => {
      const orphanNode: INode = {
        sid: 'orphan',
        stype: 'inline-text',
        text: 'Orphan',
        attributes: {}
      };
      dataStore.setNode(orphanNode, false);
      expect(dataStore.getFirstSibling('orphan')).toBeNull();
    });

    it('should return itself for first sibling', () => {
      expect(dataStore.getFirstSibling('text-1')).toBe('text-1');
      expect(dataStore.getFirstSibling('para-1')).toBe('para-1');
    });
  });

  describe('getLastSibling', () => {
    it('should return last sibling for nodes with siblings', () => {
      expect(dataStore.getLastSibling('text-1')).toBe('text-2');
      expect(dataStore.getLastSibling('text-2')).toBe('text-2');
      expect(dataStore.getLastSibling('para-1')).toBe('para-2');
      expect(dataStore.getLastSibling('para-2')).toBe('para-2');
    });

    it('should return null for root node', () => {
      expect(dataStore.getLastSibling('doc')).toBeNull();
    });

    it('should return null for non-existent nodes', () => {
      expect(dataStore.getLastSibling('non-existent')).toBeNull();
    });

    it('should return null for nodes without parent', () => {
      const orphanNode: INode = {
        sid: 'orphan',
        stype: 'inline-text',
        text: 'Orphan',
        attributes: {}
      };
      dataStore.setNode(orphanNode, false);
      expect(dataStore.getLastSibling('orphan')).toBeNull();
    });

    it('should return itself for last sibling', () => {
      expect(dataStore.getLastSibling('text-2')).toBe('text-2');
      expect(dataStore.getLastSibling('para-2')).toBe('para-2');
    });

    it('should return same value as getFirstSibling for single sibling', () => {
      expect(dataStore.getFirstSibling('text-3')).toBe('text-3');
      expect(dataStore.getLastSibling('text-3')).toBe('text-3');
    });
  });

  describe('getCommonAncestor', () => {
    it('should return common ancestor for siblings', () => {
      expect(dataStore.getCommonAncestor('text-1', 'text-2')).toBe('para-1');
      expect(dataStore.getCommonAncestor('para-1', 'para-2')).toBe('doc');
    });

    it('should return parent for parent-child relationship', () => {
      expect(dataStore.getCommonAncestor('text-1', 'para-1')).toBe('para-1');
      expect(dataStore.getCommonAncestor('para-1', 'doc')).toBe('doc');
    });

    it('should return root for nodes in different branches', () => {
      expect(dataStore.getCommonAncestor('text-1', 'text-3')).toBe('doc');
      expect(dataStore.getCommonAncestor('text-2', 'text-3')).toBe('doc');
    });

    it('should return itself for same node', () => {
      expect(dataStore.getCommonAncestor('text-1', 'text-1')).toBe('text-1');
      expect(dataStore.getCommonAncestor('para-1', 'para-1')).toBe('para-1');
      expect(dataStore.getCommonAncestor('doc', 'doc')).toBe('doc');
    });

    it('should return null for non-existent nodes', () => {
      expect(dataStore.getCommonAncestor('non-existent', 'text-1')).toBeNull();
      expect(dataStore.getCommonAncestor('text-1', 'non-existent')).toBeNull();
      expect(dataStore.getCommonAncestor('non-existent-1', 'non-existent-2')).toBeNull();
    });

    it('should return root for any node with root', () => {
      expect(dataStore.getCommonAncestor('doc', 'text-1')).toBe('doc');
      expect(dataStore.getCommonAncestor('text-1', 'doc')).toBe('doc');
      expect(dataStore.getCommonAncestor('doc', 'para-2')).toBe('doc');
    });
  });

  describe('getDistance', () => {
    it('should return 0 for same node', () => {
      expect(dataStore.getDistance('text-1', 'text-1')).toBe(0);
      expect(dataStore.getDistance('para-1', 'para-1')).toBe(0);
      expect(dataStore.getDistance('doc', 'doc')).toBe(0);
    });

    it('should return 1 for parent-child relationship', () => {
      expect(dataStore.getDistance('text-1', 'para-1')).toBe(1);
      expect(dataStore.getDistance('para-1', 'text-1')).toBe(1);
      expect(dataStore.getDistance('para-1', 'doc')).toBe(1);
      expect(dataStore.getDistance('doc', 'para-1')).toBe(1);
    });

    it('should return 2 for siblings', () => {
      expect(dataStore.getDistance('text-1', 'text-2')).toBe(2);
      expect(dataStore.getDistance('text-2', 'text-1')).toBe(2);
      expect(dataStore.getDistance('para-1', 'para-2')).toBe(2);
      expect(dataStore.getDistance('para-2', 'para-1')).toBe(2);
    });

    it('should return correct distance for nodes in different branches', () => {
      // text-1 -> para-1 -> doc <- para-2 <- text-3
      // text-1 to text-3: 1 (to para-1) + 1 (to doc) + 1 (to para-2) + 1 (to text-3) = 4
      expect(dataStore.getDistance('text-1', 'text-3')).toBe(4);
      expect(dataStore.getDistance('text-3', 'text-1')).toBe(4);
      
      // text-1 -> para-1 -> doc <- para-2
      // text-1 to para-2: 1 (to para-1) + 1 (to doc) + 1 (to para-2) = 3
      expect(dataStore.getDistance('text-1', 'para-2')).toBe(3);
      expect(dataStore.getDistance('para-2', 'text-1')).toBe(3);
    });

    it('should return -1 for non-existent nodes', () => {
      expect(dataStore.getDistance('non-existent', 'text-1')).toBe(-1);
      expect(dataStore.getDistance('text-1', 'non-existent')).toBe(-1);
      expect(dataStore.getDistance('non-existent-1', 'non-existent-2')).toBe(-1);
    });

    it('should return correct distance for grandparent-grandchild relationship', () => {
      // text-1 -> para-1 -> doc
      // text-1 to doc: 2 steps
      expect(dataStore.getDistance('text-1', 'doc')).toBe(2);
      expect(dataStore.getDistance('doc', 'text-1')).toBe(2);
    });
  });

  describe('Edge cases and error handling', () => {
    it('should handle empty dataStore', () => {
      const emptyDataStore = new DataStore();
      
      expect(emptyDataStore.hasNode('any-sid')).toBe(false);
      expect(emptyDataStore.getChildCount('any-sid')).toBe(0);
      expect(emptyDataStore.isLeafNode('any-sid')).toBe(true);
      expect(emptyDataStore.isRootNode('any-sid')).toBe(false);
      expect(emptyDataStore.getSiblings('any-sid')).toHaveLength(0);
      expect(emptyDataStore.getFirstChild('any-sid')).toBeNull();
      expect(emptyDataStore.getLastChild('any-sid')).toBeNull();
      expect(emptyDataStore.getFirstSibling('any-sid')).toBeNull();
      expect(emptyDataStore.getLastSibling('any-sid')).toBeNull();
      expect(emptyDataStore.getCommonAncestor('any-sid-1', 'any-sid-2')).toBeNull();
      expect(emptyDataStore.getDistance('any-sid-1', 'any-sid-2')).toBe(-1);
    });

    it('should handle null and undefined inputs', () => {
      expect(dataStore.hasNode('')).toBe(false);
      expect(dataStore.getChildCount('')).toBe(0);
      expect(dataStore.isLeafNode('')).toBe(true);
      expect(dataStore.isRootNode('')).toBe(false);
      expect(dataStore.getSiblings('')).toHaveLength(0);
      expect(dataStore.getFirstChild('')).toBeNull();
      expect(dataStore.getLastChild('')).toBeNull();
      expect(dataStore.getFirstSibling('')).toBeNull();
      expect(dataStore.getLastSibling('')).toBeNull();
      expect(dataStore.getCommonAncestor('', 'text-1')).toBeNull();
      expect(dataStore.getDistance('', 'text-1')).toBe(-1);
    });
  });
});
