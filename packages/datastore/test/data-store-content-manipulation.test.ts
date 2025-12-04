import { describe, it, expect, beforeEach } from 'vitest';
import { DataStore } from '../src/data-store';
import { Schema } from '@barocss/schema';
import type { INode } from '../src/types';

describe('DataStore Content Manipulation Functions', () => {
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

    // 테스트용 기본 구조 생성
    const parent: INode = {
      sid: 'parent',
      stype: 'paragraph',
      content: [],
      attributes: { class: 'parent-class', sid: 'parent-1' }
    };
    const child1: INode = {
      sid: 'child-1',
      stype: 'inline-text',
      text: 'Child 1',
      parentId: 'parent',
      attributes: { class: 'child-1-class', sid: 'child-1' }
    };
    const child2: INode = {
      sid: 'child-2',
      stype: 'inline-text',
      text: 'Child 2',
      parentId: 'parent',
      attributes: { class: 'child-2-class', sid: 'child-2' }
    };

    dataStore.setNode(parent, false);
    dataStore.setNode(child1, false);
    dataStore.setNode(child2, false);
    dataStore.addChild('parent', 'child-1');
    dataStore.addChild('parent', 'child-2');
  });

  describe('addChildren', () => {
    it('should add multiple child nodes at once', () => {
      const newChildren = [
        { stype: 'inline-text', text: 'New Child 1', attributes: { class: 'new-1' } },
        { stype: 'inline-text', text: 'New Child 2', attributes: { class: 'new-2' } }
      ];

      const addedIds = dataStore.addChildren('parent', newChildren);

      expect(addedIds).toHaveLength(2);
      expect(addedIds[0]).toMatch(/^\d+:\d+$/); // 피그마 스타일 ID
      expect(addedIds[1]).toMatch(/^\d+:\d+$/);

      const updatedParent = dataStore.getNode('parent');
      expect(updatedParent!.content).toHaveLength(4); // 기존 2개 + 새로 추가된 2개

      // 새로 추가된 노드들 확인
      const newChild1 = dataStore.getNode(addedIds[0]);
      const newChild2 = dataStore.getNode(addedIds[1]);
      expect(newChild1!.text).toBe('New Child 1');
      expect(newChild1!.attributes.class).toBe('new-1');
      expect(newChild1!.parentId).toBe('parent');
      expect(newChild2!.text).toBe('New Child 2');
      expect(newChild2!.attributes.class).toBe('new-2');
      expect(newChild2!.parentId).toBe('parent');
    });

    it('should add mixed child types (INode objects and IDs)', () => {
      const newChild: INode = {
        sid: 'existing-child',
        stype: 'inline-text',
        text: 'Existing Child',
        attributes: { class: 'existing' }
      };
      dataStore.setNode(newChild, false);

      const mixedChildren = [
        { stype: 'inline-text', text: 'New Child', attributes: { class: 'new' } },
        'existing-child'
      ];

      const addedIds = dataStore.addChildren('parent', mixedChildren);

      expect(addedIds).toHaveLength(2);
      expect(addedIds[0]).toMatch(/^\d+:\d+$/); // 새로 생성된 노드
      expect(addedIds[1]).toBe('existing-child'); // 기존 노드 ID

      const updatedParent = dataStore.getNode('parent');
      expect(updatedParent!.content).toHaveLength(4);
    });

    it('should add children at specific position', () => {
      const newChildren = [
        { stype: 'inline-text', text: 'Inserted Child 1', attributes: { class: 'inserted-1' } },
        { stype: 'inline-text', text: 'Inserted Child 2', attributes: { class: 'inserted-2' } }
      ];

      dataStore.addChildren('parent', newChildren, 1); // 두 번째 위치에 삽입

      const updatedParent = dataStore.getNode('parent');
      expect(updatedParent!.content).toHaveLength(4);
      expect(updatedParent!.content[0]).toBe('child-1'); // 기존 첫 번째
      expect(updatedParent!.content[1]).toMatch(/^\d+:\d+$/); // 새로 삽입된 첫 번째
      expect(updatedParent!.content[2]).toMatch(/^\d+:\d+$/); // 새로 삽입된 두 번째
      expect(updatedParent!.content[3]).toBe('child-2'); // 기존 두 번째
    });

    it('should add children at end when position not specified', () => {
      const newChildren = [
        { stype: 'inline-text', text: 'End Child 1', attributes: { class: 'end-1' } },
        { stype: 'inline-text', text: 'End Child 2', attributes: { class: 'end-2' } }
      ];

      dataStore.addChildren('parent', newChildren);

      const updatedParent = dataStore.getNode('parent');
      expect(updatedParent!.content).toHaveLength(4);
      expect(updatedParent!.content[0]).toBe('child-1');
      expect(updatedParent!.content[1]).toBe('child-2');
      expect(updatedParent!.content[2]).toMatch(/^\d+:\d+$/);
      expect(updatedParent!.content[3]).toMatch(/^\d+:\d+$/);
    });

    it('should throw error if parent not found', () => {
      const newChildren = [
        { stype: 'inline-text', text: 'New Child', attributes: {} }
      ];

      expect(() => {
        dataStore.addChildren('non-existent-parent', newChildren);
      }).toThrow('Parent node not found: non-existent-parent');
    });

    it('should validate new child nodes', () => {
      const invalidChildren = [
        { stype: 'invalid-type', text: 'Invalid Child' }
      ];

      expect(() => {
        dataStore.addChildren('parent', invalidChildren);
      }).toThrow('Schema validation failed');
    });
  });

  describe('removeChildren', () => {
    it('should remove multiple children at once', () => {
      dataStore.removeChildren('parent', ['child-1', 'child-2']);

      const updatedParent = dataStore.getNode('parent');
      expect(updatedParent!.content).toHaveLength(0);

      // 자식 노드들이 여전히 존재하는지 확인 (removeChild는 노드를 삭제하지 않음)
      expect(dataStore.getNode('child-1')).toBeDefined();
      expect(dataStore.getNode('child-2')).toBeDefined();
    });

    it('should remove some children while keeping others', () => {
      const child3: INode = {
        sid: 'child-3',
        stype: 'inline-text',
        text: 'Child 3',
        attributes: { class: 'child-3-class' }
      };
      dataStore.setNode(child3, false);
      dataStore.addChild('parent', 'child-3');

      dataStore.removeChildren('parent', ['child-1', 'child-3']);

      const updatedParent = dataStore.getNode('parent');
      expect(updatedParent!.content).toHaveLength(1);
      expect(updatedParent!.content[0]).toBe('child-2');
    });

    it('should handle non-existent children gracefully', () => {
      // removeChild는 존재하지 않는 자식을 제거하려고 해도 에러를 던지지 않음
      expect(() => {
        dataStore.removeChildren('parent', ['non-existent-child']);
      }).not.toThrow();

      const updatedParent = dataStore.getNode('parent');
      expect(updatedParent!.content).toHaveLength(2); // 변경 없음
    });

    it('should throw error if parent not found', () => {
      expect(() => {
        dataStore.removeChildren('non-existent-parent', ['child-1']);
      }).toThrow('Parent node not found: non-existent-parent');
    });
  });

  describe('moveChildren', () => {
    let parent2: INode;

    beforeEach(() => {
      parent2 = {
        sid: 'parent-2',
        stype: 'paragraph',
        content: [],
        attributes: { class: 'parent-2-class', sid: 'parent-2' }
      };
      dataStore.setNode(parent2, false);
    });

    it('should move multiple children to another parent', () => {
      dataStore.moveChildren('parent', 'parent-2', ['child-1', 'child-2']);

      const originalParent = dataStore.getNode('parent');
      const newParent = dataStore.getNode('parent-2');

      expect(originalParent!.content).toHaveLength(0);
      expect(newParent!.content).toHaveLength(2);
      expect(newParent!.content).toContain('child-1');
      expect(newParent!.content).toContain('child-2');

      // 자식 노드들의 parentId 업데이트 확인
      const movedChild1 = dataStore.getNode('child-1');
      const movedChild2 = dataStore.getNode('child-2');
      expect(movedChild1!.parentId).toBe('parent-2');
      expect(movedChild2!.parentId).toBe('parent-2');
    });

    it('should move children to specific position in new parent', () => {
      const existingChild: INode = {
        sid: 'existing-child',
        stype: 'inline-text',
        text: 'Existing Child',
        parentId: 'parent-2',
        attributes: { class: 'existing' }
      };
      dataStore.setNode(existingChild, false);
      dataStore.addChild('parent-2', 'existing-child');

      dataStore.moveChildren('parent', 'parent-2', ['child-1', 'child-2'], 0);

      const newParent = dataStore.getNode('parent-2');
      expect(newParent!.content).toHaveLength(3);
      expect(newParent!.content[0]).toBe('child-1');
      expect(newParent!.content[1]).toBe('child-2');
      expect(newParent!.content[2]).toBe('existing-child');
    });

    it('should move children to end when position not specified', () => {
      const existingChild: INode = {
        sid: 'existing-child',
        stype: 'inline-text',
        text: 'Existing Child',
        parentId: 'parent-2',
        attributes: { class: 'existing' }
      };
      dataStore.setNode(existingChild, false);
      dataStore.addChild('parent-2', 'existing-child');

      dataStore.moveChildren('parent', 'parent-2', ['child-1', 'child-2']);

      const newParent = dataStore.getNode('parent-2');
      expect(newParent!.content).toHaveLength(3);
      expect(newParent!.content[0]).toBe('existing-child');
      expect(newParent!.content[1]).toBe('child-1');
      expect(newParent!.content[2]).toBe('child-2');
    });

    it('should throw error if from parent not found', () => {
      expect(() => {
        dataStore.moveChildren('non-existent-parent', 'parent-2', ['child-1']);
      }).toThrow('From parent node not found: non-existent-parent');
    });

    it('should throw error if to parent not found', () => {
      expect(() => {
        dataStore.moveChildren('parent', 'non-existent-parent', ['child-1']);
      }).toThrow('To parent node not found: non-existent-parent');
    });

    it('should throw error if child not found', () => {
      expect(() => {
        dataStore.moveChildren('parent', 'parent-2', ['non-existent-child']);
      }).toThrow('Child node not found: non-existent-child');
    });
  });

  describe('Integration with existing functions', () => {
    it('should work with addChild and removeChild', () => {
      // addChildren으로 추가
      const addedIds = dataStore.addChildren('parent', [
        { stype: 'inline-text', text: 'Added Child', attributes: { class: 'added' } }
      ]);

      expect(addedIds).toHaveLength(1);
      expect(dataStore.getChildCount('parent')).toBe(3);

      // removeChildren으로 제거
      dataStore.removeChildren('parent', [addedIds[0]]);
      expect(dataStore.getChildCount('parent')).toBe(2);
    });

    it('should maintain data integrity during batch operations', () => {
      const initialCount = dataStore.getChildCount('parent');
      
      // 여러 자식 추가
      const addedIds = dataStore.addChildren('parent', [
        { stype: 'inline-text', text: 'Batch 1', attributes: { class: 'batch-1' } },
        { stype: 'inline-text', text: 'Batch 2', attributes: { class: 'batch-2' } }
      ]);

      expect(dataStore.getChildCount('parent')).toBe(initialCount + 2);

      // 일부만 제거
      dataStore.removeChildren('parent', [addedIds[0]]);
      expect(dataStore.getChildCount('parent')).toBe(initialCount + 1);

      // 나머지 이동
      const parent2: INode = {
        sid: 'parent-2',
        stype: 'paragraph',
        content: [],
        attributes: { class: 'parent-2-class' }
      };
      dataStore.setNode(parent2, false);
      
      dataStore.moveChildren('parent', 'parent-2', [addedIds[1]]);
      expect(dataStore.getChildCount('parent')).toBe(initialCount);
      expect(dataStore.getChildCount('parent-2')).toBe(1);
    });
  });
});
