import { describe, it, expect, beforeEach } from 'vitest';
import { DataStore } from '../src/data-store';
import { Schema } from '@barocss/schema';
import type { INode } from '../src/types';

describe('DataStore Move/Copy Functions', () => {
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

  describe('moveNode', () => {
    let parent1: INode;
    let parent2: INode;
    let child: INode;

    beforeEach(() => {
      parent1 = {
        sid: 'parent-1',
        stype: 'paragraph',
        content: ['child-1'],
        attributes: {}
      };

      parent2 = {
        sid: 'parent-2',
        stype: 'paragraph',
        content: ['child-2'],
        attributes: {}
      };

      child = {
        sid: 'child-1',
        stype: 'inline-text',
        text: 'Child 1',
        parentId: 'parent-1',
        attributes: {}
      };

      const child2 = {
        sid: 'child-2',
        stype: 'inline-text',
        text: 'Child 2',
        parentId: 'parent-2',
        attributes: {}
      };

      dataStore.setNode(parent1, false);
      dataStore.setNode(parent2, false);
      dataStore.setNode(child, false);
      dataStore.setNode(child2, false);
    });

    it('should move node to different parent', () => {
      dataStore.moveNode('child-1', 'parent-2');

      // child-1이 parent-2로 이동되었는지 확인
      const updatedChild = dataStore.getNode('child-1');
      expect(updatedChild!.parentId).toBe('parent-2');

      // parent-1에서 child-1이 제거되었는지 확인
      const updatedParent1 = dataStore.getNode('parent-1');
      expect(updatedParent1!.content).toHaveLength(0);

      // parent-2에 child-1이 추가되었는지 확인
      const updatedParent2 = dataStore.getNode('parent-2');
      expect(updatedParent2!.content).toContain('child-1');
      expect(updatedParent2!.content).toHaveLength(2);
    });

    it('should emit move op with target parent and position', () => {
      dataStore.begin();
      dataStore.moveNode('child-1', 'parent-2', 1);
      const ops = dataStore.end();
      const moveOps = ops.filter(o => o.type === 'move');
      expect(moveOps.length).toBeGreaterThanOrEqual(1);
      const lastMove = moveOps[moveOps.length - 1] as any;
      expect(lastMove.nodeId).toBe('child-1');
      expect(lastMove.parentId).toBe('parent-2');
      expect(lastMove.position).toBe(1);
    });

    it('should move node to specific position', () => {
      dataStore.moveNode('child-1', 'parent-2', 0);

      const updatedParent2 = dataStore.getNode('parent-2');
      expect(updatedParent2!.content[0]).toBe('child-1');
      expect(updatedParent2!.content[1]).toBe('child-2');
    });

    it('should throw error if node not found', () => {
      expect(() => {
        dataStore.moveNode('non-existent', 'parent-2');
      }).toThrow('Node not found: non-existent');
    });

    it('should throw error if parent not found', () => {
      expect(() => {
        dataStore.moveNode('child-1', 'non-existent');
      }).toThrow('Parent node not found: non-existent');
    });
  });

  describe('copyNode', () => {
    let parent: INode;
    let original: INode;

    beforeEach(() => {
      parent = {
        sid: 'parent',
        stype: 'paragraph',
        content: [],
        attributes: {}
      };

      original = {
        sid: 'original',
        stype: 'inline-text',
        text: 'Original text',
        attributes: { class: 'original-class' },
        marks: [
          { stype: 'bold', attrs: {}, range: [0, 5] }
        ]
      };

      dataStore.setNode(parent, false);
      dataStore.setNode(original, false);
    });

    it('should copy node with new ID', () => {
      const newId = dataStore.copyNode('original', 'parent');

      expect(newId).toBeDefined();
      expect(newId).not.toBe('original');

      const copiedNode = dataStore.getNode(newId);
      expect(copiedNode).toBeDefined();
      expect(copiedNode!.text).toBe('Original text');
      expect(copiedNode!.attributes.class).toBe('original-class');
      expect(copiedNode!.parentId).toBe('parent');
      expect(copiedNode!.marks).toHaveLength(1);
    });

    it('should add copied node to parent content', () => {
      const newId = dataStore.copyNode('original', 'parent');

      const updatedParent = dataStore.getNode('parent');
      expect(updatedParent!.content).toContain(newId);
    });

    it('should emit create + parent update (no move) on copy', () => {
      dataStore.begin();
      dataStore.copyNode('original', 'parent');
      const ops = dataStore.end();
      const types = ops.map(o => o.type);
      expect(types).toContain('create');
      // Spec: parent content update should be emitted as update op
      expect(types).toContain('update');
      expect(types).not.toContain('move');
    });

    it('should copy node without changing parent if not specified', () => {
      const newId = dataStore.copyNode('original');

      const copiedNode = dataStore.getNode(newId);
      expect(copiedNode!.parentId).toBe(original.parentId);
    });

    it('should throw error if node not found', () => {
      expect(() => {
        dataStore.copyNode('non-existent');
      }).toThrow('Node not found: non-existent');
    });

    it('should validate copied node', () => {
      // 먼저 유효한 노드 생성
      const validNode = {
        sid: 'valid-node',
        stype: 'inline-text',
        text: 'Valid text',
        attributes: {}
      };
      dataStore.setNode(validNode, false); // validation 없이 생성

      // 복사 시 validation 수행
      const copiedId = dataStore.copyNode('valid-node', 'parent');
      
      expect(copiedId).toBeDefined();
      const copiedNode = dataStore.getNode(copiedId);
      expect(copiedNode!.stype).toBe('inline-text');
      expect(copiedNode!.text).toBe('Valid text');
    });
  });

  describe('cloneNodeWithChildren', () => {
    let parent: INode;
    let originalParent: INode;
    let child1: INode;
    let child2: INode;

    beforeEach(() => {
      parent = {
        sid: 'parent',
        stype: 'document',
        content: [],
        attributes: {}
      };

      originalParent = {
        sid: 'original-parent',
        stype: 'paragraph',
        content: ['child-1', 'child-2'],
        attributes: { class: 'original' }
      };

      child1 = {
        sid: 'child-1',
        stype: 'inline-text',
        text: 'Child 1',
        parentId: 'original-parent',
        attributes: { class: 'child-1' }
      };

      child2 = {
        sid: 'child-2',
        stype: 'inline-text',
        text: 'Child 2',
        parentId: 'original-parent',
        attributes: { class: 'child-2' }
      };

      dataStore.setNode(parent, false);
      dataStore.setNode(originalParent, false);
      dataStore.setNode(child1, false);
      dataStore.setNode(child2, false);
    });

    it('should clone node with all children', () => {
      const newId = dataStore.cloneNodeWithChildren('original-parent', 'parent');

      expect(newId).toBeDefined();
      expect(newId).not.toBe('original-parent');

      const clonedParent = dataStore.getNode(newId);
      expect(clonedParent).toBeDefined();
      expect(clonedParent!.stype).toBe('paragraph');
      expect(clonedParent!.attributes.class).toBe('original');
      expect(clonedParent!.parentId).toBe('parent');
      expect(clonedParent!.content).toHaveLength(2);

      // 자식들도 복사되었는지 확인
      const clonedChild1Id = clonedParent!.content![0] as string;
      const clonedChild2Id = clonedParent!.content![1] as string;

      const clonedChild1 = dataStore.getNode(clonedChild1Id);
      const clonedChild2 = dataStore.getNode(clonedChild2Id);

      expect(clonedChild1).toBeDefined();
      expect(clonedChild1!.text).toBe('Child 1');
      expect(clonedChild1!.attributes.class).toBe('child-1');
      expect(clonedChild1!.parentId).toBe(newId);

      expect(clonedChild2).toBeDefined();
      expect(clonedChild2!.text).toBe('Child 2');
      expect(clonedChild2!.attributes.class).toBe('child-2');
      expect(clonedChild2!.parentId).toBe(newId);
    });

    it('should add cloned subtree to parent content', () => {
      const newId = dataStore.cloneNodeWithChildren('original-parent', 'parent');

      const updatedParent = dataStore.getNode('parent');
      expect(updatedParent!.content).toContain(newId);
    });

    it('should throw error if node not found', () => {
      expect(() => {
        dataStore.cloneNodeWithChildren('non-existent');
      }).toThrow('Node not found: non-existent');
    });

    it('should validate cloned nodes', () => {
      // 먼저 유효한 서브트리 생성
      const validParent = {
        sid: 'valid-parent',
        stype: 'paragraph',
        content: ['valid-child'],
        attributes: {}
      };
      const validChild = {
        sid: 'valid-child',
        stype: 'inline-text',
        text: 'Valid child',
        parentId: 'valid-parent',
        attributes: {}
      };
      
      dataStore.setNode(validParent, false);
      dataStore.setNode(validChild, false);

      // 복제 시 validation 수행
      const clonedId = dataStore.cloneNodeWithChildren('valid-parent', 'parent');
      
      expect(clonedId).toBeDefined();
      const clonedParent = dataStore.getNode(clonedId);
      expect(clonedParent!.stype).toBe('paragraph');
      expect(clonedParent!.content).toHaveLength(1);
      
      const clonedChildId = clonedParent!.content![0] as string;
      const clonedChild = dataStore.getNode(clonedChildId);
      expect(clonedChild!.stype).toBe('inline-text');
      expect(clonedChild!.text).toBe('Valid child');
    });
  });
});
