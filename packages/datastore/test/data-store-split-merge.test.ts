import { describe, it, expect, beforeEach } from 'vitest';
import { DataStore } from '../src/data-store';
import { Schema } from '@barocss/schema';

describe('DataStore Split & Merge Functions', () => {
  let dataStore: DataStore;
  let schema: Schema;

  beforeEach(() => {
    // 테스트용 schema 생성
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
      // 텍스트 노드 생성
      const textNode = {
        sid: 'text-1',
        stype: 'inline-text',
        text: 'Hello World',
        attributes: { class: 'test' }
      };
      dataStore.setNode(textNode);

      // 5번째 위치에서 분할
      const newNodeId = dataStore.splitTextNode('text-1', 5);

      // 원본 노드 확인
      const originalNode = dataStore.getNode('text-1');
      expect(originalNode!.text).toBe('Hello');

      // 새 노드 확인
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
          { stype: 'bold', range: [2, 8] } // "llo Wo" 부분이 분할점을 가로지름
        ]
      };
      dataStore.setNode(textNode);

      const newNodeId = dataStore.splitTextNode('text-1', 5);

      const originalNode = dataStore.getNode('text-1');
      const newNode = dataStore.getNode(newNodeId);

      // 왼쪽 노드: "Hello"에서 "llo" 부분만 bold
      expect(originalNode!.marks).toEqual([{ stype: 'bold', range: [2, 5] }]);
      // 오른쪽 노드: " World"에서 " Wo" 부분만 bold
      expect(newNode!.marks).toEqual([{ stype: 'bold', range: [0, 3] }]);
    });

    it('should handle marks without range (applied to entire text)', () => {
      const textNode = {
        sid: 'text-1',
        stype: 'inline-text',
        text: 'Hello World',
        marks: [
          { stype: 'bold' }, // 전체 텍스트에 적용
          { stype: 'italic' } // 전체 텍스트에 적용
        ]
      };
      dataStore.setNode(textNode);

      const newNodeId = dataStore.splitTextNode('text-1', 5);

      const originalNode = dataStore.getNode('text-1');
      const newNode = dataStore.getNode(newNodeId);

      // 왼쪽 노드: "Hello" 전체에 bold, italic 적용
      expect(originalNode!.marks).toEqual([
        { stype: 'bold', range: [0, 5] },
        { stype: 'italic', range: [0, 5] }
      ]);
      // 오른쪽 노드: " World" 전체에 bold, italic 적용
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
          { stype: 'bold' }, // 전체 텍스트
          { stype: 'italic', range: [2, 8] }, // "llo Wo" 부분만
          { stype: 'fontColor', attrs: { color: '#ff0000' } } // 전체 텍스트
        ]
      };
      dataStore.setNode(textNode);

      const newNodeId = dataStore.splitTextNode('text-1', 5);

      const originalNode = dataStore.getNode('text-1');
      const newNode = dataStore.getNode(newNodeId);

      // 왼쪽 노드: "Hello"
      expect(originalNode!.marks).toEqual([
        { stype: 'bold', range: [0, 5] }, // 전체 텍스트에서 왼쪽 부분
        { stype: 'italic', range: [2, 5] }, // 범위가 분할점을 가로지름
        { stype: 'fontColor', range: [0, 5], attrs: { color: '#ff0000' } } // 전체 텍스트에서 왼쪽 부분
      ]);
      
      // 오른쪽 노드: " World"
      expect(newNode!.marks).toEqual([
        { stype: 'bold', range: [0, 6] }, // 전체 텍스트에서 오른쪽 부분
        { stype: 'italic', range: [0, 3] }, // 범위가 분할점을 가로지름
        { stype: 'fontColor', range: [0, 6], attrs: { color: '#ff0000' } } // 전체 텍스트에서 오른쪽 부분
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
        marks: [{ stype: 'italic', range: [1, 5] }] // "World" 부분만 italic
      };
      dataStore.setNode(leftNode);
      dataStore.setNode(rightNode);

      dataStore.mergeTextNodes('text-1', 'text-2');

      const mergedNode = dataStore.getNode('text-1');
      expect(mergedNode!.marks).toHaveLength(2);
      expect(mergedNode!.marks![0]).toEqual({ stype: 'bold', range: [0, 5] });
      // 오른쪽 노드의 마크는 왼쪽 텍스트 길이(5)만큼 오프셋되어야 함
      expect(mergedNode!.marks![1]).toEqual({ stype: 'italic', range: [6, 10] });
    });

    it('should merge marks without range (applied to entire text)', () => {
      const leftNode = {
        sid: 'text-1',
        stype: 'inline-text',
        text: 'Hello',
        marks: [{ stype: 'bold' }] // 전체 텍스트에 적용
      };
      const rightNode = {
        sid: 'text-2',
        stype: 'inline-text',
        text: ' World',
        marks: [{ stype: 'italic' }] // 전체 텍스트에 적용
      };
      dataStore.setNode(leftNode);
      dataStore.setNode(rightNode);

      dataStore.mergeTextNodes('text-1', 'text-2');

      const mergedNode = dataStore.getNode('text-1');
      expect(mergedNode!.marks).toHaveLength(2);
      // 왼쪽 노드의 마크는 그대로 유지
      expect(mergedNode!.marks![0]).toEqual({ stype: 'bold', range: [0, 5] });
      // 오른쪽 노드의 마크는 오프셋되어 추가됨
      expect(mergedNode!.marks![1]).toEqual({ stype: 'italic', range: [5, 11] });
    });

    it('should merge mixed marks (some with range, some without)', () => {
      const leftNode = {
        sid: 'text-1',
        stype: 'inline-text',
        text: 'Hello',
        marks: [
          { stype: 'bold' }, // 전체 텍스트
          { stype: 'italic', range: [0, 3] } // "Hel" 부분만
        ]
      };
      const rightNode = {
        sid: 'text-2',
        stype: 'inline-text',
        text: ' World',
        marks: [
          { stype: 'fontColor', attrs: { color: '#ff0000' } }, // 전체 텍스트
          { stype: 'underline', range: [1, 4] } // "Wor" 부분만
        ]
      };
      dataStore.setNode(leftNode);
      dataStore.setNode(rightNode);

      dataStore.mergeTextNodes('text-1', 'text-2');

      const mergedNode = dataStore.getNode('text-1');
      expect(mergedNode!.marks).toHaveLength(4);
      
      // 왼쪽 노드의 마크들
      expect(mergedNode!.marks![0]).toEqual({ stype: 'bold', range: [0, 5] });
      expect(mergedNode!.marks![1]).toEqual({ stype: 'italic', range: [0, 3] });
      
      // 오른쪽 노드의 마크들 (오프셋 적용됨)
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
      // 부모 노드 생성
      const parentNode = {
        sid: 'parent-1',
        stype: 'paragraph',
        content: ['child-1', 'child-2', 'child-3', 'child-4'],
        attributes: { class: 'parent' }
      };
      dataStore.setNode(parentNode);

      // 자식 노드들 생성
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

      // 원본 노드 확인
      const originalNode = dataStore.getNode('parent-1');
      expect(originalNode!.content).toEqual(['child-1', 'child-2']);

      // 새 노드 확인
      const newNode = dataStore.getNode(newNodeId);
      expect(newNode!.content).toEqual(['child-3', 'child-4']);
      expect(newNode!.stype).toBe('paragraph');
      expect(newNode!.attributes?.class).toBe('parent');

      // 자식들의 부모 ID 업데이트 확인
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
      // 두 개의 블록 노드 생성
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

      // 자식 노드들 생성
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
      
      // 왼쪽 노드에 모든 자식이 병합되었는지 확인
      const mergedNode = dataStore.getNode('left-1');
      expect(mergedNode!.content).toEqual(['child-1', 'child-2', 'child-3', 'child-4']);

      // 오른쪽 노드는 삭제되었는지 확인
      expect(dataStore.getNode('right-1')).toBeUndefined();

      // 자식들의 부모 ID가 업데이트되었는지 확인
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
      // 부모 노드 생성
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

      // "lo Wo" 부분을 분할 (3-8)
      const middleNodeId = dataStore.splitTextRange('text-1', 3, 8);

      // 원본 노드 확인
      const originalNode = dataStore.getNode('text-1');
      expect(originalNode!.text).toBe('Hel');

      // 중간 노드 확인
      const middleNode = dataStore.getNode(middleNodeId);
      expect(middleNode!.text).toBe('lo Wo');

      // 마지막 노드 확인 (자동으로 생성됨)
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
      // 부모 노드 생성
      const parentNode = {
        sid: 'parent-1',
        stype: 'paragraph',
        content: ['text-1', 'text-2', 'text-3'],
        attributes: { class: 'parent' }
      };
      dataStore.setNode(parentNode);

      // 텍스트 노드들 생성
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
      
      // 모든 텍스트가 병합되었는지 확인
      const mergedNode = dataStore.getNode('text-1');
      expect(mergedNode!.text).toBe('Hello World');

      // 중간 노드들이 삭제되었는지 확인
      expect(dataStore.getNode('text-2')).toBeUndefined();
      expect(dataStore.getNode('text-3')).toBeUndefined();

      // 부모의 content가 업데이트되었는지 확인
      const parent = dataStore.getNode('parent-1');
      expect(parent!.content).toEqual(['text-1']);
    });

    it('should not merge non-text nodes', () => {
      // paragraph 노드 추가
      const paragraphNode = {
        sid: 'para-1',
        stype: 'paragraph',
        content: [],
        parentId: 'parent-1'
      };
      dataStore.setNode(paragraphNode);

      // 부모의 content 업데이트
      const parent = dataStore.getNode('parent-1');
      parent!.content = ['text-1', 'para-1', 'text-3'];
      dataStore.setNode(parent);

      const mergedNodeId = dataStore.autoMergeTextNodes('para-1');

      // paragraph 노드는 병합되지 않아야 함
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
