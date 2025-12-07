import { describe, beforeEach, it, expect } from 'vitest';
import { DataStore } from '../src/data-store';
import { Schema } from '@barocss/schema';

describe('DocumentIterator', () => {
  let dataStore: DataStore;
  let schema: Schema;

  beforeEach(() => {
    schema = new Schema('test-schema', {
      nodes: {
        'document': {
          name: 'document',
          content: 'block+'
        },
        'heading': {
          name: 'heading',
          content: 'inline*',
          group: 'block',
          attrs: {
            level: { stype: 'number', default: 1 }
          }
        },
        'paragraph': {
          name: 'paragraph',
          content: 'inline*',
          group: 'block'
        },
        'list': {
          name: 'list',
          content: 'listItem+',
          group: 'block',
          attrs: {
            type: { type: 'string', default: 'bullet' }
          }
        },
        'listItem': {
          name: 'listItem',
          content: 'block+',
          group: 'block'
        },
        'inline-text': {
          name: 'inline-text',
          group: 'inline'
        }
      },
      marks: {
        'bold': {
          name: 'bold',
          group: 'text-style'
        },
        'italic': {
          name: 'italic',
          group: 'text-style'
        }
      }
    });

    dataStore = new DataStore(undefined, schema);
  });

  describe('기본 Iterator 기능', () => {
    beforeEach(() => {
      dataStore.createNodeWithChildren({
        stype: 'document',
        content: [
          {
            stype: 'heading',
            attributes: { level: 1 },
            content: [
              { stype: 'inline-text', text: '제목' }
            ]
          },
          {
            stype: 'paragraph',
            content: [
              { stype: 'inline-text', text: '첫 번째 단락' }
            ]
          },
          {
            stype: 'list',
            attributes: { stype: 'bullet' },
            content: [
              {
                stype: 'listItem',
                content: [
                  {
                    stype: 'paragraph',
                    content: [
                      { stype: 'inline-text', text: '리스트 항목 1' }
                    ]
                  }
                ]
              },
              {
                stype: 'listItem',
                content: [
                  {
                    stype: 'paragraph',
                    content: [
                      { stype: 'inline-text', text: '리스트 항목 2' }
                    ]
                  }
                ]
              }
            ]
          }
        ]
      });
    });

    it('기본 순회 - 모든 노드', () => {
      const iterator = dataStore.createDocumentIterator();
      const allNodes: string[] = [];
      
      for (const nodeId of iterator) {
        allNodes.push(nodeId);
      }
      
      console.log('=== 기본 순회 결과 ===');
      allNodes.forEach((id, index) => {
        const node = dataStore.getNode(id);
        console.log(`${index + 1}. ${id} (${node?.stype}) - ${node?.text || ''}`);
      });
      
      expect(allNodes.length).toBeGreaterThan(5);
      expect(allNodes[0]).toBe(dataStore.getRootNodeId());
    });

    it('역순 순회', () => {
      const iterator = dataStore.createDocumentIterator({ reverse: true });
      const reverseNodes: string[] = [];
      
      for (const nodeId of iterator) {
        reverseNodes.push(nodeId);
      }
      
      console.log('=== 역순 순회 결과 ===');
      reverseNodes.forEach((id, index) => {
        const node = dataStore.getNode(id);
        console.log(`${index + 1}. ${id} (${node?.stype}) - ${node?.text || ''}`);
      });
      
      expect(reverseNodes.length).toBe(12);
      // Reverse order, so last node should appear first
      // getAllNodes() is in creation order, so must find last node in document order
      let lastNodeId = dataStore.getRootNodeId() as string;
      let currentId = lastNodeId;
      while (currentId) {
        lastNodeId = currentId;
        currentId = dataStore.getNextNode(currentId) as string;
      }
      expect(reverseNodes[0]).toBe(lastNodeId);
    });

    it('특정 타입만 필터링', () => {
      const iterator = dataStore.createDocumentIterator({
        filter: { stype: 'inline-text' }
      });
      
      const textNodes: string[] = [];
      for (const nodeId of iterator) {
        textNodes.push(nodeId);
      }
      
      console.log('=== inline-text 노드만 필터링 ===');
      textNodes.forEach((id, index) => {
        const node = dataStore.getNode(id);
        console.log(`${index + 1}. ${id} - "${node?.text}"`);
      });
      
      expect(textNodes.length).toBe(4); // Title, first paragraph, list item 1, list item 2
      textNodes.forEach(id => {
        expect(dataStore.getNode(id)?.stype).toBe('inline-text');
      });
    });

    it('filter multiple types', () => {
      const iterator = dataStore.createDocumentIterator({
        filter: { stypes: ['heading', 'paragraph'] }
      });
      
      const blockNodes: string[] = [];
      for (const nodeId of iterator) {
        blockNodes.push(nodeId);
      }
      
      console.log('=== Filter only heading and paragraph ===');
      blockNodes.forEach((id, index) => {
        const node = dataStore.getNode(id);
        console.log(`${index + 1}. ${id} (${node?.stype}) - ${node?.text || ''}`);
      });
      
      expect(blockNodes.length).toBe(4); // 1 heading, 3 paragraphs (including inside listItem)
      blockNodes.forEach(id => {
        const nodeType = dataStore.getNode(id)?.stype;
        expect(['heading', 'paragraph']).toContain(nodeType);
      });
    });

    it('특정 타입 제외', () => {
      const iterator = dataStore.createDocumentIterator({
        filter: { excludeStypes: ['inline-text'] }
      });
      
      const nonTextNodes: string[] = [];
      for (const nodeId of iterator) {
        nonTextNodes.push(nodeId);
      }
      
      console.log('=== inline-text 제외한 노드들 ===');
      nonTextNodes.forEach((id, index) => {
        const node = dataStore.getNode(id);
        console.log(`${index + 1}. ${id} (${node?.stype}) - ${node?.text || ''}`);
      });
      
      nonTextNodes.forEach(id => {
        expect(dataStore.getNode(id)?.stype).not.toBe('inline-text');
      });
    });

    it('최대 깊이 제한', () => {
      const iterator = dataStore.createDocumentIterator({
        maxDepth: 2
      });
      
      const shallowNodes: string[] = [];
      for (const nodeId of iterator) {
        shallowNodes.push(nodeId);
      }
      
      console.log('=== 최대 깊이 2까지만 ===');
      shallowNodes.forEach((id, index) => {
        const node = dataStore.getNode(id);
        const depth = dataStore.getNodePath(id).length;
        console.log(`${index + 1}. ${id} (${node?.stype}) - 깊이: ${depth}`);
      });
      
      shallowNodes.forEach(id => {
        const depth = dataStore.getNodePath(id).length;
        expect(depth).toBeLessThanOrEqual(2);
      });
    });

    it('사용자 정의 필터', () => {
      const iterator = dataStore.createDocumentIterator({
        customFilter: (nodeId, node) => {
          // Only nodes with text
          return node?.text && node.text.length > 0;
        }
      });
      
      const textNodes: string[] = [];
      for (const nodeId of iterator) {
        textNodes.push(nodeId);
      }
      
      console.log('=== 사용자 정의 필터 (텍스트가 있는 노드) ===');
      textNodes.forEach((id, index) => {
        const node = dataStore.getNode(id);
        console.log(`${index + 1}. ${id} - "${node?.text}"`);
      });
      
      textNodes.forEach(id => {
        const node = dataStore.getNode(id);
        expect(node?.text).toBeTruthy();
        expect(node?.text.length).toBeGreaterThan(0);
      });
    });

    it('중단 조건', () => {
      const iterator = dataStore.createDocumentIterator({
        shouldStop: (nodeId, node) => {
          // Stop when encountering list node
          return node?.stype === 'list';
        }
      });
      
      const beforeListNodes: string[] = [];
      for (const nodeId of iterator) {
        beforeListNodes.push(nodeId);
      }
      
      console.log('=== Stop at list node ===');
      beforeListNodes.forEach((id, index) => {
        const node = dataStore.getNode(id);
        console.log(`${index + 1}. ${id} (${node?.stype}) - ${node?.text || ''}`);
      });
      
      // Should traverse only up to before list node
      const lastNode = dataStore.getNode(beforeListNodes[beforeListNodes.length - 1]);
      expect(lastNode?.stype).not.toBe('list');
    });
  });

  describe('Iterator 유틸리티 메서드', () => {
    beforeEach(() => {
      dataStore.createNodeWithChildren({
        stype: 'document',
        content: [
          {
            stype: 'heading',
            attributes: { level: 1 },
            content: [
              { stype: 'inline-text', text: '메인 제목' }
            ]
          },
          {
            stype: 'paragraph',
            content: [
              { stype: 'inline-text', text: '첫 번째 단락' }
            ]
          },
          {
            stype: 'paragraph',
            content: [
              { stype: 'inline-text', text: '두 번째 단락' }
            ]
          }
        ]
      });
    });

    it('toArray() 메서드', () => {
      const iterator = dataStore.createDocumentIterator({
        filter: { stype: 'inline-text' }
      });
      
      const textNodes = iterator.toArray();
      
      console.log('=== toArray() 결과 ===');
      textNodes.forEach((id, index) => {
        const node = dataStore.getNode(id);
        console.log(`${index + 1}. ${id} - "${node?.text}"`);
      });
      
      expect(textNodes.length).toBe(3);
      expect(Array.isArray(textNodes)).toBe(true);
    });

    it('find() 메서드', () => {
      const iterator = dataStore.createDocumentIterator();
      
      const foundNodeId = iterator.find((nodeId, node) => {
        return node?.text === '두 번째 단락';
      });
      
      expect(foundNodeId).toBeTruthy();
      const foundNode = dataStore.getNode(foundNodeId!);
      expect(foundNode?.text).toBe('두 번째 단락');
    });

    it('findAll() 메서드', () => {
      const iterator = dataStore.createDocumentIterator();
      
      const paragraphNodes = iterator.findAll((nodeId, node) => {
        return node?.stype === 'paragraph';
      });
      
      console.log('=== findAll() 결과 ===');
      paragraphNodes.forEach((id, index) => {
        const node = dataStore.getNode(id);
        console.log(`${index + 1}. ${id} (${node?.stype}) - ${node?.text || ''}`);
      });
      
      expect(paragraphNodes.length).toBe(2);
      paragraphNodes.forEach(id => {
        expect(dataStore.getNode(id)?.stype).toBe('paragraph');
      });
    });

    it('takeWhile() 메서드', () => {
      const iterator = dataStore.createDocumentIterator();
      
      const nodesBeforeSecondParagraph = iterator.takeWhile((nodeId, node) => {
        return node?.text !== '두 번째 단락';
      });
      
      console.log('=== takeWhile() 결과 ===');
      nodesBeforeSecondParagraph.forEach((id, index) => {
        const node = dataStore.getNode(id);
        console.log(`${index + 1}. ${id} (${node?.stype}) - ${node?.text || ''}`);
      });
      
      expect(nodesBeforeSecondParagraph.length).toBeGreaterThan(0);
      // Last node should not be '두 번째 단락'
      const lastNode = dataStore.getNode(nodesBeforeSecondParagraph[nodesBeforeSecondParagraph.length - 1]);
      expect(lastNode?.text).not.toBe('두 번째 단락');
    });

    it('getStats() 메서드', () => {
      const iterator = dataStore.createDocumentIterator();
      
      const stats = iterator.getStats();
      
      console.log('=== getStats() 결과 ===');
      console.log(`총 노드 수: ${stats.total}`);
      console.log('타입별 노드 수:', stats.byType);
      console.log('깊이별 노드 수:', stats.byDepth);
      
      expect(stats.total).toBeGreaterThan(0);
      expect(typeof stats.byType).toBe('object');
      expect(typeof stats.byDepth).toBe('object');
      expect(stats.byType['document']).toBe(1);
      expect(stats.byType['heading']).toBe(1);
      expect(stats.byType['paragraph']).toBe(2);
      expect(stats.byType['inline-text']).toBe(3);
    });

    it('reset() 메서드', () => {
      const iterator = dataStore.createDocumentIterator();
      
      // First traversal
      const firstPass: string[] = [];
      for (const nodeId of iterator) {
        firstPass.push(nodeId);
        if (firstPass.length >= 3) break; // Only 3
      }
      
      // Second traversal after reset
      iterator.reset();
      const secondPass: string[] = [];
      for (const nodeId of iterator) {
        secondPass.push(nodeId);
        if (secondPass.length >= 3) break; // Only 3
      }
      
      expect(firstPass).toEqual(secondPass);
    });

    it('startFrom() method', () => {
      const iterator = dataStore.createDocumentIterator();
      
      // Start from specific node
      const paragraphNodes = dataStore.findNodesByType('paragraph');
      const secondParagraph = paragraphNodes[1];
      
      iterator.startFrom(secondParagraph.sid!);
      
      const fromSecondParagraph: string[] = [];
      for (const nodeId of iterator) {
        fromSecondParagraph.push(nodeId);
        if (fromSecondParagraph.length >= 3) break; // Only 3
      }
      
      console.log('=== startFrom() 결과 ===');
      fromSecondParagraph.forEach((id, index) => {
        const node = dataStore.getNode(id);
        console.log(`${index + 1}. ${id} (${node?.stype}) - ${node?.text || ''}`);
      });
      
      expect(fromSecondParagraph[0]).toBe(secondParagraph.sid);
    });
  });

  describe('Iterator in complex document', () => {
    beforeEach(() => {
      // Complex technical document structure
      dataStore.createNodeWithChildren({
        stype: 'document',
        content: [
          {
            stype: 'heading',
            attributes: { level: 1 },
            content: [
              { stype: 'inline-text', text: 'React 에디터 개발' }
            ]
          },
          {
            stype: 'paragraph',
            content: [
              { stype: 'inline-text', text: '이 문서는 ' },
              { stype: 'inline-text', text: 'React', marks: [{ stype: 'bold', range: [0, 5] }] },
              { stype: 'inline-text', text: ' 기반 에디터를 설명합니다.' }
            ]
          },
          {
            stype: 'list',
            attributes: { stype: 'bullet' },
            content: [
              {
                stype: 'listItem',
                content: [
                  {
                    stype: 'paragraph',
                    content: [
                      { stype: 'inline-text', text: '텍스트 포맷팅' }
                    ]
                  }
                ]
              },
              {
                stype: 'listItem',
                content: [
                  {
                    stype: 'paragraph',
                    content: [
                      { stype: 'inline-text', text: '리스트 지원' }
                    ]
                  }
                ]
              }
            ]
          }
        ]
      });
    });

    it('복잡한 문서에서 마크가 적용된 텍스트만 필터링', () => {
      const iterator = dataStore.createDocumentIterator({
        customFilter: (nodeId, node) => {
          return node?.stype === 'inline-text' && node?.marks && node.marks.length > 0;
        }
      });
      
      const markedNodes: string[] = [];
      for (const nodeId of iterator) {
        markedNodes.push(nodeId);
      }
      
      console.log('=== 마크가 적용된 텍스트 노드들 ===');
      markedNodes.forEach((id, index) => {
        const node = dataStore.getNode(id);
        const marks = node?.marks?.map(m => m.stype).join(', ') || '';
        console.log(`${index + 1}. ${id} - "${node?.text}" [${marks}]`);
      });
      
      expect(markedNodes.length).toBe(1);
      const markedNode = dataStore.getNode(markedNodes[0]);
      expect(markedNode?.text).toBe('React');
      expect(markedNode?.marks).toHaveLength(1);
      expect(markedNode?.marks?.[0].stype).toBe('bold');
    });

    it('특정 깊이의 노드들만 순회', () => {
      const iterator = dataStore.createDocumentIterator({
        maxDepth: 3
      });
      
      const depth3Nodes: string[] = [];
      for (const nodeId of iterator) {
        const depth = dataStore.getNodePath(nodeId).length;
        if (depth === 3) {
          depth3Nodes.push(nodeId);
        }
      }
      
      console.log('=== 깊이 3인 노드들 ===');
      depth3Nodes.forEach((id, index) => {
        const node = dataStore.getNode(id);
        console.log(`${index + 1}. ${id} (${node?.stype}) - ${node?.text || ''}`);
      });
      
      expect(depth3Nodes.length).toBeGreaterThan(0);
      depth3Nodes.forEach(id => {
        expect(dataStore.getNodePath(id).length).toBe(3);
      });
    });

    it('성능 테스트 - 대용량 순회', () => {
      const startTime = performance.now();
      
      const iterator = dataStore.createDocumentIterator();
      let count = 0;
      
      for (const nodeId of iterator) {
        count++;
        if (count > 1000) break; // Prevent infinite loop
      }
      
      const endTime = performance.now();
      const duration = endTime - startTime;
      
      console.log(`\n=== Iterator performance test ===`);
      console.log(`Nodes traversed: ${count}`);
      console.log(`Time taken: ${duration.toFixed(2)}ms`);
      console.log(`Average time per node: ${(duration / count).toFixed(4)}ms`);
      
      expect(duration).toBeLessThan(10); // Within 10ms
      expect(count).toBeGreaterThan(5); // At least 5 nodes should be traversed
    });
  });
});
