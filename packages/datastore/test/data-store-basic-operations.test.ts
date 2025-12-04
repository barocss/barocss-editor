import { describe, it, expect, beforeEach } from 'vitest';
import { DataStore } from '../src/data-store';
import { Schema } from '@barocss/schema';
import type { INode } from '../src/types';

describe('DataStore Basic Operations', () => {
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
      marks: {
        bold: {
          name: 'bold',
          group: 'text-style',
          attrs: {
            class: { type: 'string', default: null }
          }
        }
      }
    });
    
    dataStore = new DataStore(undefined, schema);
  });

  describe('Basic CRUD Operations', () => {
    it('should get and set nodes', () => {
      const node: INode = {
        sid: 'test-node',
        stype: 'inline-text',
        text: 'Hello World',
        attributes: {}
      };

      dataStore.setNode(node);
      const retrievedNode = dataStore.getNode('test-node');

      expect(retrievedNode).toBeDefined();
      expect(retrievedNode!.sid).toBe('test-node');
      expect(retrievedNode!.stype).toBe('inline-text');
      expect(retrievedNode!.text).toBe('Hello World');
    });

    it('should delete nodes', () => {
      const node: INode = {
        sid: 'test-node',
        stype: 'inline-text',
        text: 'Hello World',
        attributes: {}
      };

      dataStore.setNode(node);
      expect(dataStore.getNode('test-node')).toBeDefined();

      const deleted = dataStore.deleteNode('test-node');
      expect(deleted).toBe(true);
      expect(dataStore.getNode('test-node')).toBeUndefined();
    });

    it('should return false when deleting non-existent node', () => {
      const deleted = dataStore.deleteNode('non-existent');
      expect(deleted).toBe(false);
    });

    it('should get all nodes', () => {
      const node1: INode = {
        sid: 'node1',
        stype: 'inline-text',
        text: 'Text 1',
        attributes: {}
      };
      const node2: INode = {
        sid: 'node2',
        stype: 'inline-text',
        text: 'Text 2',
        attributes: {}
      };

      dataStore.setNode(node1);
      dataStore.setNode(node2);

      const allNodes = dataStore.getAllNodes();
      expect(allNodes).toHaveLength(2);
      expect(allNodes.map(n => n.sid)).toContain('node1');
      expect(allNodes.map(n => n.sid)).toContain('node2');
    });

    it('should get all nodes as map', () => {
      const node: INode = {
        sid: 'test-node',
        stype: 'inline-text',
        text: 'Hello World',
        attributes: {}
      };

      dataStore.setNode(node);
      const nodesMap = dataStore.getAllNodesMap();

      expect(nodesMap.size).toBe(1);
      expect(nodesMap.get('test-node')).toBeDefined();
    });

    it('should get node count', () => {
      expect(dataStore.getNodeCount()).toBe(0);

      const node: INode = {
        sid: 'test-node',
        stype: 'inline-text',
        text: 'Hello World',
        attributes: {}
      };

      dataStore.setNode(node);
      expect(dataStore.getNodeCount()).toBe(1);
    });
  });

  describe('Root Node Management', () => {
    it('should set and get root node', () => {
      const rootNode: INode = {
        sid: 'root',
        stype: 'document',
        content: ['child'],
        attributes: {}
      };

      const childNode: INode = {
        sid: 'child',
        stype: 'paragraph',
        content: [],
        attributes: {}
      };

      dataStore.setNode(childNode);

      dataStore.setNode(rootNode);
      dataStore.setRootNodeId('root');

      const retrievedRoot = dataStore.getRootNode();
      expect(retrievedRoot).toBeDefined();
      expect(retrievedRoot!.sid).toBe('root');
    });

    it('should get root node ID', () => {
      expect(dataStore.getRootNodeId()).toBeUndefined();

      dataStore.setRootNodeId('test-root');
      expect(dataStore.getRootNodeId()).toBe('test-root');
    });

    it('should return undefined for non-existent root node', () => {
      dataStore.setRootNodeId('non-existent');
      expect(dataStore.getRootNode()).toBeUndefined();
    });
  });

  describe('Parent-Child Relationships', () => {
    let parentNode: INode;
    let childNode1: INode;
    let childNode2: INode;

    beforeEach(() => {
      parentNode = {
        sid: 'parent',
        stype: 'paragraph',
        content: ['child1', 'child2'],
        attributes: {}
      };

      childNode1 = {
        sid: 'child1',
        stype: 'inline-text',
        text: 'Child 1',
        parentId: 'parent',
        attributes: {}
      };

      childNode2 = {
        sid: 'child2',
        stype: 'inline-text',
        text: 'Child 2',
        parentId: 'parent',
        attributes: {}
      };

      dataStore.setNode(parentNode, false);
      dataStore.setNode(childNode1, false);
      dataStore.setNode(childNode2, false);
    });

    it('should get children of a node', () => {
      const children = dataStore.getChildren('parent');
      expect(children).toHaveLength(2);
      expect(children.map(c => c.sid)).toContain('child1');
      expect(children.map(c => c.sid)).toContain('child2');
    });

    it('should get parent of a node', () => {
      const parent = dataStore.getParent('child1');
      expect(parent).toBeDefined();
      expect(parent!.sid).toBe('parent');
    });

    it('should get siblings of a node', () => {
      const siblings = dataStore.getSiblings('child1');
      expect(siblings).toHaveLength(1);
      expect(siblings.map(s => s.sid)).toContain('child2');
      expect(siblings.map(s => s.sid)).not.toContain('child1'); // 자신은 제외
    });

    it('should get sibling index', () => {
      const index1 = dataStore.getSiblingIndex('child1');
      const index2 = dataStore.getSiblingIndex('child2');

      expect(index1).toBe(0);
      expect(index2).toBe(1);
    });

    it('should add child to parent', () => {
      const newChild: INode = {
        sid: 'new-child',
        stype: 'inline-text',
        text: 'New Child',
        attributes: {}
      };

      dataStore.addChild('parent', newChild);

      const children = dataStore.getChildren('parent');
      expect(children).toHaveLength(3);
      expect(children.map(c => c.sid)).toContain('new-child');
      expect(newChild.parentId).toBe('parent');
    });

    it('should remove child from parent', () => {
      const removed = dataStore.removeChild('parent', 'child1');
      expect(removed).toBe(true);

      const children = dataStore.getChildren('parent');
      expect(children).toHaveLength(1);
      expect(children.map(c => c.sid)).toContain('child2');
    });

    it('should return false when removing non-existent child', () => {
      const removed = dataStore.removeChild('parent', 'non-existent');
      expect(removed).toBe(false);
    });

    it('should move node to new parent', () => {
      const newParent: INode = {
        sid: 'new-parent',
        stype: 'paragraph',
        content: [],
        attributes: {}
      };
      dataStore.setNode(newParent, false);

      dataStore.moveNode('child1', 'new-parent');

      const oldParentChildren = dataStore.getChildren('parent');
      const newParentChildren = dataStore.getChildren('new-parent');

      expect(oldParentChildren).toHaveLength(1);
      expect(newParentChildren).toHaveLength(1);
      expect(newParentChildren[0].sid).toBe('child1');
      const moved = dataStore.getNode('child1');
      expect(moved?.parentId).toBe('new-parent');
    });
  });

  describe('Node Path and Depth', () => {
    let grandParent: INode;
    let parent: INode;
    let child: INode;

    beforeEach(() => {
      grandParent = {
        sid: 'grandparent',
        stype: 'document',
        content: ['parent'],
        attributes: {}
      };

      parent = {
        sid: 'parent',
        stype: 'paragraph',
        content: ['child'],
        parentId: 'grandparent',
        attributes: {}
      };

      child = {
        sid: 'child',
        stype: 'inline-text',
        text: 'Child',
        parentId: 'parent',
        attributes: {}
      };

      dataStore.setNode(grandParent, false);
      dataStore.setNode(parent, false);
      dataStore.setNode(child, false);
    });

    it('should get node path', () => {
      const path = dataStore.getNodePath('child');
      expect(path).toEqual(['grandparent', 'parent', 'child']);
    });

    it('should get node depth', () => {
      expect(dataStore.getNodeDepth('grandparent')).toBe(0);
      expect(dataStore.getNodeDepth('parent')).toBe(1);
      expect(dataStore.getNodeDepth('child')).toBe(2);
    });

    it('should check if node is descendant', () => {
      expect(dataStore.isDescendant('child', 'grandparent')).toBe(true);
      expect(dataStore.isDescendant('child', 'parent')).toBe(true);
      expect(dataStore.isDescendant('parent', 'child')).toBe(false);
    });

    it('should get all descendants', () => {
      const descendants = dataStore.getAllDescendants('grandparent');
      expect(descendants).toHaveLength(2);
      expect(descendants.map(d => d.sid)).toContain('parent');
      expect(descendants.map(d => d.sid)).toContain('child');
    });

    it('should get all ancestors', () => {
      const ancestors = dataStore.getAllAncestors('child');
      expect(ancestors).toHaveLength(2);
      expect(ancestors.map(a => a.sid)).toContain('parent');
      expect(ancestors.map(a => a.sid)).toContain('grandparent');
    });
  });

  describe('Version Management', () => {
    it('should get version', () => {
      expect(dataStore.getVersion()).toBe(1);
    });

    it('should clear all data', () => {
      const node: INode = {
        sid: 'test-node',
        stype: 'inline-text',
        text: 'Hello World',
        attributes: {}
      };

      dataStore.setNode(node);
      dataStore.setRootNodeId('test-node');
      expect(dataStore.getNodeCount()).toBe(1);

      dataStore.clear();
      expect(dataStore.getNodeCount()).toBe(0);
      expect(dataStore.getRootNodeId()).toBeUndefined();
      expect(dataStore.getVersion()).toBe(1);
    });

    it('should restore from snapshot', () => {
      const node1: INode = {
        sid: 'node1',
        stype: 'inline-text',
        text: 'Node 1',
        attributes: {}
      };
      const node2: INode = {
        sid: 'node2',
        stype: 'inline-text',
        text: 'Node 2',
        attributes: {}
      };

      const nodesMap = new Map([
        ['node1', node1],
        ['node2', node2]
      ]);

      dataStore.restoreFromSnapshot(nodesMap, 'node1', 5);

      expect(dataStore.getNodeCount()).toBe(2);
      expect(dataStore.getRootNodeId()).toBe('node1');
      expect(dataStore.getVersion()).toBe(5);
    });
  });

  describe('Clone Operations', () => {
    it('should clone dataStore', () => {
      const node: INode = {
        sid: 'test-node',
        stype: 'inline-text',
        text: 'Hello World',
        attributes: {}
      };

      dataStore.setNode(node);
      dataStore.setRootNodeId('test-node');

      const cloned = dataStore.clone();
      expect(cloned.getNodeCount()).toBe(1);
      expect(cloned.getRootNodeId()).toBe('test-node');
      expect(cloned.getNode('test-node')).toBeDefined();
    });
  });
});
