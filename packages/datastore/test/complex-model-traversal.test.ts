import { describe, beforeEach, it, expect } from 'vitest';
import { DataStore } from '../src/data-store';
import { Schema } from '@barocss/schema';

describe('Complex Model Traversal', () => {
  let dataStore: DataStore;
  let schema: Schema;

  beforeEach(() => {
    schema = new Schema('complex-schema', {
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
        'blockQuote': {
          name: 'blockQuote',
          content: 'block+',
          group: 'block'
        },
        'codeBlock': {
          name: 'codeBlock',
          content: 'text*',
          group: 'block',
          attrs: {
            language: { type: 'string', required: false }
          }
        },
        'table': {
          name: 'table',
          content: 'tableRow+',
          group: 'block'
        },
        'tableRow': {
          name: 'tableRow',
          content: 'tableCell+',
          group: 'block'
        },
        'tableCell': {
          name: 'tableCell',
          content: 'inline*',
          group: 'block'
        },
        'inline-text': {
          name: 'inline-text',
          group: 'inline'
        },
        'inline-image': {
          name: 'inline-image',
          group: 'inline',
          atom: true,
          attrs: {
            src: { type: 'string', required: true },
            alt: { type: 'string', required: false }
          }
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
        },
        'link': {
          name: 'link',
          group: 'text-style',
          attrs: {
            href: { type: 'string', required: true }
          }
        },
        'code': {
          name: 'code',
          group: 'text-style'
        }
      }
    });

    dataStore = new DataStore(undefined, schema);
  });

  describe('Complex technical document structure', () => {
    beforeEach(() => {
      // Complex structure similar to real technical documents
      dataStore.createNodeWithChildren({
        stype: 'document',
        content: [
          {
            stype: 'heading',
            attributes: { level: 1 },
            content: [
              { stype: 'inline-text', text: 'React 에디터 개발 가이드' }
            ]
          },
          {
            stype: 'paragraph',
            content: [
              { stype: 'inline-text', text: '이 문서는 ' },
              { stype: 'inline-text', text: 'React', marks: [{ stype: 'bold', range: [0, 5] }] },
              { stype: 'inline-text', text: ' 기반의 ' },
              { stype: 'inline-text', text: '리치 텍스트 에디터', marks: [{ stype: 'italic', range: [0, 7] }] },
              { stype: 'inline-text', text: '를 개발하는 방법을 설명합니다.' }
            ]
          },
          {
            stype: 'heading',
            attributes: { level: 2 },
            content: [
              { stype: 'inline-text', text: '주요 기능' }
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
                      { stype: 'inline-text', text: '텍스트 포맷팅: ' },
                      { stype: 'inline-text', text: 'bold', marks: [{ stype: 'bold', range: [0, 4] }] },
                      { stype: 'inline-text', text: ', ' },
                      { stype: 'inline-text', text: 'italic', marks: [{ stype: 'italic', range: [0, 6] }] },
                      { stype: 'inline-text', text: ', ' },
                      { stype: 'inline-text', text: 'code', marks: [{ stype: 'code', range: [0, 4] }] }
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
                      { stype: 'inline-text', text: '링크 삽입 및 ' },
                      { stype: 'inline-text', text: '이미지', marks: [{ stype: 'bold', range: [0, 2] }] },
                      { stype: 'inline-text', text: ' 지원' }
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
                      { stype: 'inline-text', text: '테이블 및 ' },
                      { stype: 'inline-text', text: '리스트', marks: [{ stype: 'italic', range: [0, 2] }] },
                      { stype: 'inline-text', text: ' 구조' }
                    ]
                  }
                ]
              }
            ]
          },
          {
            stype: 'heading',
            attributes: { level: 2 },
            content: [
              { stype: 'inline-text', text: '코드 예시' }
            ]
          },
          {
            stype: 'codeBlock',
            attributes: { language: 'typescript' },
            text: `import { Editor } from '@barocss/editor-core';
import { DataStore } from '@barocss/datastore';

const editor = new Editor({
  schema: mySchema,
  dataStore: new DataStore()
});`
          },
          {
            stype: 'blockQuote',
            content: [
              {
                stype: 'paragraph',
                content: [
                  { stype: 'inline-text', text: '에디터는 ' },
                  { stype: 'inline-text', text: '사용자 경험', marks: [{ stype: 'bold', range: [0, 4] }] },
                  { stype: 'inline-text', text: '을 최우선으로 고려해야 합니다.' }
                ]
              }
            ]
          },
          {
            stype: 'heading',
            attributes: { level: 2 },
            content: [
              { stype: 'inline-text', text: '성능 최적화' }
            ]
          },
          {
            stype: 'table',
            content: [
              {
                stype: 'tableRow',
                content: [
                  {
                    stype: 'tableCell',
                    content: [
                      {
                        stype: 'paragraph',
                        content: [
                          { stype: 'inline-text', text: '기능' }
                        ]
                      }
                    ]
                  },
                  {
                    stype: 'tableCell',
                    content: [
                      {
                        stype: 'paragraph',
                        content: [
                          { stype: 'inline-text', text: '성능' }
                        ]
                      }
                    ]
                  }
                ]
              },
              {
                stype: 'tableRow',
                content: [
                  {
                    stype: 'tableCell',
                    content: [
                      {
                        stype: 'paragraph',
                        content: [
                          { stype: 'inline-text', text: '텍스트 입력' }
                        ]
                      }
                    ]
                  },
                  {
                    stype: 'tableCell',
                    content: [
                      {
                        stype: 'paragraph',
                        content: [
                          { stype: 'inline-text', text: 'O(1)', marks: [{ stype: 'code', range: [0, 3] }] }
                        ]
                      }
                    ]
                  }
                ]
              },
              {
                stype: 'tableRow',
                content: [
                  {
                    stype: 'tableCell',
                    content: [
                      {
                        stype: 'paragraph',
                        content: [
                          { stype: 'inline-text', text: '문서 순회' }
                        ]
                      }
                    ]
                  },
                  {
                    stype: 'tableCell',
                    content: [
                      {
                        stype: 'paragraph',
                        content: [
                          { stype: 'inline-text', text: 'O(n)', marks: [{ stype: 'code', range: [0, 3] }] }
                        ]
                      }
                    ]
                  }
                ]
              }
            ]
          },
          {
            stype: 'paragraph',
            content: [
              { stype: 'inline-text', text: '더 자세한 정보는 ' },
              { stype: 'inline-text', text: '공식 문서', marks: [{ stype: 'link', range: [0, 4], attrs: { href: 'https://docs.barocss.com' } }] },
              { stype: 'inline-text', text: '를 참조하세요.' }
            ]
          }
        ]
      });
    });

    it('full traversal in complex document structure', () => {
      const allNodes = dataStore.getAllNodes();
      console.log(`\n=== Total node count: ${allNodes.length} ===`);
      
      // Traverse all nodes in document order
      const documentOrder: string[] = [];
      let currentId = dataStore.getRootNodeId() as string;
      
      while (currentId) {
        documentOrder.push(currentId);
        currentId = dataStore.getNextNode(currentId) as string;
      }
      
      console.log('=== Document order ===');
      documentOrder.forEach((id, index) => {
        const node = dataStore.getNode(id);
        const indent = '  '.repeat((node?.parentId ? dataStore.getNodePath(id).length - 1 : 0));
        console.log(`${index + 1}. ${indent}${id} (${node?.type}) - ${node?.text || node?.attributes?.level || ''}`);
      });
      
      expect(documentOrder.length).toBeGreaterThan(20);
      
      // First is document
      expect(dataStore.getNode(documentOrder[0])?.stype).toBe('document');
      
      // Last is last text of last paragraph
      const lastNode = dataStore.getNode(documentOrder[documentOrder.length - 1]);
      expect(lastNode?.stype).toBe('inline-text');
      expect(lastNode?.text).toContain('참조하세요');
    });

    it('traversal within specific section', () => {
      const headings = dataStore.findNodesByType('heading');
      console.log('=== All heading nodes ===');
      headings.forEach(h => {
        // Find child text node of heading
        const childText = h.content && h.content.length > 0 ? 
          dataStore.getNode(h.content[0] as string)?.text : 'no text';
        console.log(`- ${h.sid} (level: ${h.attributes?.level}) - "${childText}"`);
      });
      
      // Find main title (heading with level 1)
      const mainHeading = headings.find(h => h.attributes?.level === 1);
      
      expect(mainHeading).toBeTruthy();
      
      // Traverse from main title to next title
      let currentId = dataStore.getNextNode(mainHeading!.sid!);
      const sectionNodes: string[] = [];
      
      while (currentId) {
        const node = dataStore.getNode(currentId);
        if (node?.stype === 'heading' && node.text === '주요 기능') {
          break;
        }
        sectionNodes.push(currentId);
        currentId = dataStore.getNextNode(currentId) as string;
      }
      
      console.log(`\n=== 메인 제목 섹션 노드 수: ${sectionNodes.length} ===`);
      sectionNodes.forEach(id => {
        const node = dataStore.getNode(id);
        console.log(`- ${id} (${node?.type}) - ${node?.text || ''}`);
      });
      
      expect(sectionNodes.length).toBeGreaterThan(0);
    });

    it('traversal inside list item', () => {
      const listItems = dataStore.findNodesByType('listItem');
      const firstListItem = listItems[0];
      
      // Traverse inside first list item
      let currentId = dataStore.getNextNode(firstListItem.sid!);
      const itemNodes: string[] = [];
      
      while (currentId) {
        const node = dataStore.getNode(currentId);
        // Stop when encountering next list item or other block
        if (node?.stype === 'listItem' || (node?.stype !== 'paragraph' && node?.stype !== 'inline-text')) {
          break;
        }
        itemNodes.push(currentId);
        currentId = dataStore.getNextNode(currentId) as string;
      }
      
      console.log(`\n=== Nodes inside first list item ===`);
      itemNodes.forEach(id => {
        const node = dataStore.getNode(id);
        console.log(`- ${id} (${node?.type}) - ${node?.text || ''}`);
      });
      
      expect(itemNodes.length).toBeGreaterThan(0);
    });

    it('traversal of table structure', () => {
      const tables = dataStore.findNodesByType('table');
      const table = tables[0];
      
      // Traverse inside table
      let currentId = dataStore.getNextNode(table.sid!);
      const tableNodes: string[] = [];
      
      while (currentId) {
        const node = dataStore.getNode(currentId);
        // Stop when exiting table
        if (node?.stype !== 'tableRow' && node?.stype !== 'tableCell' && node?.stype !== 'paragraph' && node?.stype !== 'inline-text') {
          break;
        }
        tableNodes.push(currentId);
        currentId = dataStore.getNextNode(currentId) as string;
      }
      
      console.log(`\n=== Table internal node count: ${tableNodes.length} ===`);
      tableNodes.forEach(id => {
        const node = dataStore.getNode(id);
        console.log(`- ${id} (${node?.type}) - ${node?.text || ''}`);
      });
      
      expect(tableNodes.length).toBeGreaterThan(10);
    });

    it('reverse traversal test', () => {
      const allNodes = dataStore.getAllNodes();
      const lastTextNode = allNodes.filter(n => n.stype === 'inline-text').pop();
      
      expect(lastTextNode).toBeTruthy();
      
      // Traverse in reverse order from last node
      const reverseOrder: string[] = [];
      let currentId = lastTextNode!.sid!;
      
      while (currentId) {
        reverseOrder.push(currentId);
        currentId = dataStore.getPreviousNode(currentId) as string;
      }
      
      console.log(`\n=== Reverse traversal node count: ${reverseOrder.length} ===`);
      reverseOrder.slice(0, 10).forEach((id, index) => {
        const node = dataStore.getNode(id);
        console.log(`${index + 1}. ${id} (${node?.type}) - ${node?.text || ''}`);
      });
      
      expect(reverseOrder.length).toBeGreaterThan(20);
      expect(reverseOrder[0]).toBe(lastTextNode!.sid);
    });

    it('traverse filtering only specific node types', () => {
      const textNodes: string[] = [];
      let currentId = dataStore.getRootNodeId() as string;
      
      while (currentId) {
        const node = dataStore.getNode(currentId);
        if (node?.stype === 'inline-text') {
          textNodes.push(currentId);
        }
        currentId = dataStore.getNextNode(currentId) as string;
      }
      
      console.log(`\n=== Filtered text nodes only: ${textNodes.length} ===`);
      textNodes.forEach((id, index) => {
        const node = dataStore.getNode(id);
        console.log(`${index + 1}. ${id} - "${node?.text}"`);
      });
      
      expect(textNodes.length).toBeGreaterThan(15);
      
      // First text node is main title
      expect(dataStore.getNode(textNodes[0])?.text).toBe('React 에디터 개발 가이드');
    });

    it('마크가 적용된 텍스트 노드들 순회', () => {
      const markedNodes: string[] = [];
      let currentId = dataStore.getRootNodeId() as string;
      
      while (currentId) {
        const node = dataStore.getNode(currentId);
        if (node?.stype === 'inline-text' && node.marks && node.marks.length > 0) {
          markedNodes.push(currentId);
        }
        currentId = dataStore.getNextNode(currentId) as string;
      }
      
      console.log(`\n=== 마크가 적용된 텍스트 노드: ${markedNodes.length}개 ===`);
      markedNodes.forEach((id, index) => {
        const node = dataStore.getNode(id);
        const marks = node?.marks?.map(m => m.stype).join(', ') || '';
        console.log(`${index + 1}. ${id} - "${node?.text}" [${marks}]`);
      });
      
      expect(markedNodes.length).toBeGreaterThan(5);
    });

    it('성능 테스트 - 대용량 순회', () => {
      const startTime = performance.now();
      
      let count = 0;
      let currentId = dataStore.getRootNodeId() as string;
      
      while (currentId && count < 1000) { // Prevent infinite loop
        currentId = dataStore.getNextNode(currentId) as string;
        count++;
      }
      
      const endTime = performance.now();
      const duration = endTime - startTime;
      
      console.log(`\n=== 성능 테스트 결과 ===`);
      console.log(`순회한 노드 수: ${count}`);
      console.log(`소요 시간: ${duration.toFixed(2)}ms`);
      console.log(`노드당 평균 시간: ${(duration / count).toFixed(4)}ms`);
      
      expect(duration).toBeLessThan(10); // Within 10ms
      expect(count).toBeGreaterThan(20); // At least 20 nodes should be traversed
    });
  });

  describe('중첩된 리스트와 블록 구조', () => {
    beforeEach(() => {
      // Deeply nested list structure
      dataStore.createNodeWithChildren({
        stype: 'document',
        content: [
          {
            stype: 'heading',
            attributes: { level: 1 },
            content: [
              { stype: 'inline-text', text: '중첩 구조 테스트' }
            ]
          },
          {
            stype: 'list',
            attributes: { stype: 'ordered' },
            content: [
              {
                stype: 'listItem',
                content: [
                  {
                    stype: 'paragraph',
                    content: [
                      { stype: 'inline-text', text: '첫 번째 항목' }
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
                              { stype: 'inline-text', text: '중첩된 항목 1' }
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
                              { stype: 'inline-text', text: '중첩된 항목 2' }
                            ]
                          },
                          {
                            stype: 'blockQuote',
                            content: [
                              {
                                stype: 'paragraph',
                                content: [
                                  { stype: 'inline-text', text: '인용문 내용' }
                                ]
                              }
                            ]
                          }
                        ]
                      }
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
                      { stype: 'inline-text', text: '두 번째 항목' }
                    ]
                  }
                ]
              }
            ]
          }
        ]
      });
    });

    it('깊게 중첩된 구조에서 순회', () => {
      const allNodes = dataStore.getAllNodes();
      console.log(`\n=== 중첩 구조 전체 노드 수: ${allNodes.length} ===`);
      
      // Output all nodes in order
      let currentId = dataStore.getRootNodeId() as string;
      const order: string[] = [];
      
      while (currentId) {
        order.push(currentId);
        currentId = dataStore.getNextNode(currentId) as string;
      }
      
      order.forEach((id, index) => {
        const node = dataStore.getNode(id);
        const path = dataStore.getNodePath(id);
        const indent = '  '.repeat(path.length - 1);
        console.log(`${index + 1}. ${indent}${id} (${node?.type}) - ${node?.text || ''}`);
      });
      
      expect(order.length).toBeGreaterThan(10);
    });

    it('특정 깊이의 노드들만 필터링', () => {
      const depth3Nodes: string[] = [];
      let currentId = dataStore.getRootNodeId() as string;
      
      while (currentId) {
        const path = dataStore.getNodePath(currentId);
        if (path.length === 3) {
          depth3Nodes.push(currentId);
        }
        currentId = dataStore.getNextNode(currentId) as string;
      }
      
      console.log(`\n=== 깊이 3인 노드들: ${depth3Nodes.length}개 ===`);
      depth3Nodes.forEach(id => {
        const node = dataStore.getNode(id);
        console.log(`- ${id} (${node?.type}) - ${node?.text || ''}`);
      });
      
      expect(depth3Nodes.length).toBeGreaterThan(0);
    });
  });
});
