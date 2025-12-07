import { describe, beforeEach, it, expect } from 'vitest';
import { DataStore } from '../src/data-store';
import { Schema } from '@barocss/schema';

describe('Real-World DocumentIterator', () => {
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
        'bTable': {
          name: 'bTable',
          content: '(bTableHeader)? bTableBody+ (bTableFooter)?',
          group: 'block',
          attrs: {
            caption: { type: 'string', required: false }
          }
        },
        'bTableHeader': {
          name: 'bTableHeader',
          content: 'bTableHeaderCell+',
          group: 'block'
        },
        'bTableBody': {
          name: 'bTableBody',
          content: 'bTableRow+',
          group: 'block'
        },
        'bTableRow': {
          name: 'bTableRow',
          content: 'bTableCell+',
          group: 'block'
        },
        'bTableHeaderCell': {
          name: 'bTableHeaderCell',
          content: 'inline*',
          group: 'block',
          attrs: {
            colspan: { stype: 'number', default: 1 },
            rowspan: { stype: 'number', default: 1 }
          }
        },
        'bTableCell': {
          name: 'bTableCell',
          content: 'inline*',
          group: 'block',
          attrs: {
            colspan: { stype: 'number', default: 1 },
            rowspan: { stype: 'number', default: 1 }
          }
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
        'callout': {
          name: 'callout',
          content: 'block+',
          group: 'block',
          attrs: {
            type: { type: 'string', default: 'info' },
            title: { type: 'string', required: false }
          }
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
            href: { type: 'string', required: true },
            title: { type: 'string', required: false }
          }
        },
        'code': {
          name: 'code',
          group: 'text-style',
          attrs: {
            language: { type: 'string', default: 'text' }
          }
        }
      }
    });

    dataStore = new DataStore(undefined, schema);
  });

  describe('Complex real-world document structure', () => {
    beforeEach(() => {
      // Real document structure based on main.ts
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
              { stype: 'inline-text', text: ' 기반 에디터를 설명합니다. ' },
              { stype: 'inline-text', text: 'GitHub', marks: [{ stype: 'link', range: [0, 6], attrs: { href: 'https://github.com' } }] },
              { stype: 'inline-text', text: '에서 더 많은 정보를 확인할 수 있습니다.' }
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
                      { stype: 'inline-text', text: 'code', marks: [{ stype: 'code', range: [0, 4], attrs: { language: 'javascript' } }] }
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
                      { stype: 'inline-text', text: '리스트 지원: 중첩된 리스트와 다양한 타입' }
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
                      { stype: 'inline-text', text: '테이블: 복잡한 데이터 구조 표현' }
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
              { stype: 'inline-text', text: '코드 예제' }
            ]
          },
          {
            stype: 'codeBlock',
            attributes: { language: 'typescript' },
            text: `function createEditor() {
  const editor = new Editor({
    schema: customSchema,
    extensions: [bold, italic, link]
  });
  
  return editor;
}`
          },
          {
            stype: 'callout',
            attributes: { stype: 'info', title: '팁' },
            content: [
              {
                stype: 'paragraph',
                content: [
                  { stype: 'inline-text', text: '에디터를 사용할 때는 ' },
                  { stype: 'inline-text', text: '스키마', marks: [{ stype: 'code', range: [0, 2], attrs: { language: 'text' } }] },
                  { stype: 'inline-text', text: '를 먼저 정의하는 것이 중요합니다.' }
                ]
              }
            ]
          },
          {
            stype: 'heading',
            attributes: { level: 2 },
            content: [
              { stype: 'inline-text', text: '성능 비교' }
            ]
          },
          {
            stype: 'bTable',
            attributes: { caption: '에디터 성능 비교' },
            content: [
              {
                stype: 'bTableHeader',
                content: [
                  {
                    stype: 'bTableHeaderCell',
                    content: [
                      {
                        stype: 'paragraph',
                        content: [
                          { stype: 'inline-text', text: '에디터' }
                        ]
                      }
                    ]
                  },
                  {
                    stype: 'bTableHeaderCell',
                    content: [
                      {
                        stype: 'paragraph',
                        content: [
                          { stype: 'inline-text', text: '렌더링 속도' }
                        ]
                      }
                    ]
                  },
                  {
                    stype: 'bTableHeaderCell',
                    content: [
                      {
                        stype: 'paragraph',
                        content: [
                          { stype: 'inline-text', text: '메모리 사용량' }
                        ]
                      }
                    ]
                  }
                ]
              },
              {
                stype: 'bTableBody',
                content: [
                  {
                    stype: 'bTableRow',
                    content: [
                      {
                        stype: 'bTableCell',
                        content: [
                          {
                            stype: 'paragraph',
                            content: [
                              { stype: 'inline-text', text: 'ProseMirror' }
                            ]
                          }
                        ]
                      },
                      {
                        stype: 'bTableCell',
                        content: [
                          {
                            stype: 'paragraph',
                            content: [
                              { stype: 'inline-text', text: '매우 빠름' }
                            ]
                          }
                        ]
                      },
                      {
                        stype: 'bTableCell',
                        content: [
                          {
                            stype: 'paragraph',
                            content: [
                              { stype: 'inline-text', text: '낮음' }
                            ]
                          }
                        ]
                      }
                    ]
                  },
                  {
                    stype: 'bTableRow',
                    content: [
                      {
                        stype: 'bTableCell',
                        content: [
                          {
                            stype: 'paragraph',
                            content: [
                              { stype: 'inline-text', text: 'Slate.js' }
                            ]
                          }
                        ]
                      },
                      {
                        stype: 'bTableCell',
                        content: [
                          {
                            stype: 'paragraph',
                            content: [
                              { stype: 'inline-text', text: '빠름' }
                            ]
                          }
                        ]
                      },
                      {
                        stype: 'bTableCell',
                        content: [
                          {
                            stype: 'paragraph',
                            content: [
                              { stype: 'inline-text', text: '보통' }
                            ]
                          }
                        ]
                      }
                    ]
                  },
                  {
                    stype: 'bTableRow',
                    content: [
                      {
                        stype: 'bTableCell',
                        content: [
                          {
                            stype: 'paragraph',
                            content: [
                              { stype: 'inline-text', text: 'BaroCSS' }
                            ]
                          }
                        ]
                      },
                      {
                        stype: 'bTableCell',
                        content: [
                          {
                            stype: 'paragraph',
                            content: [
                              { stype: 'inline-text', text: '매우 빠름', marks: [{ stype: 'bold', range: [0, 4] }] }
                            ]
                          }
                        ]
                      },
                      {
                        stype: 'bTableCell',
                        content: [
                          {
                            stype: 'paragraph',
                            content: [
                              { stype: 'inline-text', text: '매우 낮음', marks: [{ stype: 'bold', range: [0, 4] }] }
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
            stype: 'heading',
            attributes: { level: 2 },
            content: [
              { stype: 'inline-text', text: '고급 테이블 예제' }
            ]
          },
          {
            stype: 'bTable',
            attributes: { caption: '복잡한 테이블 구조' },
            content: [
              {
                stype: 'bTableHeader',
                content: [
                  {
                    stype: 'bTableHeaderCell',
                    content: [
                      {
                        stype: 'paragraph',
                        content: [
                          { stype: 'inline-text', text: '이름' }
                        ]
                      }
                    ]
                  },
                  {
                    stype: 'bTableHeaderCell',
                    content: [
                      {
                        stype: 'paragraph',
                        content: [
                          { stype: 'inline-text', text: '그룹' }
                        ]
                      }
                    ]
                  },
                  {
                    stype: 'bTableHeaderCell',
                    content: [
                      {
                        stype: 'paragraph',
                        content: [
                          { stype: 'inline-text', text: '설명' }
                        ]
                      }
                    ]
                  }
                ]
              },
              {
                stype: 'bTableBody',
                content: [
                  {
                    stype: 'bTableRow',
                    content: [
                      {
                        stype: 'bTableCell',
                        attributes: { rowspan: 2 },
                        content: [
                          {
                            stype: 'paragraph',
                            content: [
                              { stype: 'inline-text', text: 'Alice' }
                            ]
                          }
                        ]
                      },
                      {
                        stype: 'bTableCell',
                        content: [
                          {
                            stype: 'paragraph',
                            content: [
                              { stype: 'inline-text', text: 'A' }
                            ]
                          }
                        ]
                      },
                      {
                        stype: 'bTableCell',
                        content: [
                          {
                            stype: 'paragraph',
                            content: [
                              { stype: 'inline-text', text: '첫 번째 그룹' }
                            ]
                          }
                        ]
                      }
                    ]
                  },
                  {
                    stype: 'bTableRow',
                    content: [
                      {
                        stype: 'bTableCell',
                        content: [
                          {
                            stype: 'paragraph',
                            content: [
                              { stype: 'inline-text', text: 'A' }
                            ]
                          }
                        ]
                      },
                      {
                        stype: 'bTableCell',
                        content: [
                          {
                            stype: 'paragraph',
                            content: [
                              { stype: 'inline-text', text: 'Alice의 두 번째 항목' }
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
            stype: 'blockQuote',
            content: [
              {
                stype: 'paragraph',
                content: [
                  { stype: 'inline-text', text: '좋은 에디터는 사용자가 생각을 자유롭게 표현할 수 있도록 도와야 합니다.' }
                ]
              }
            ]
          },
          {
            stype: 'paragraph',
            content: [
              { stype: 'inline-text', text: '이미지도 지원합니다: ' },
              { stype: 'inline-image', attributes: { src: 'https://dummyimage.com/32x32/4CAF50/white?text=✓', alt: 'checkmark' } },
              { stype: 'inline-text', text: ' 다양한 미디어 타입을 처리할 수 있습니다.' }
            ]
          }
        ]
      });
    });

    it('Traverse entire document - all nodes', () => {
      const iterator = dataStore.createDocumentIterator();
      const allNodes: string[] = [];
      
      for (const nodeId of iterator) {
        allNodes.push(nodeId);
      }
      
      console.log('=== Entire document traversal result ===');
      allNodes.forEach((id, index) => {
        const node = dataStore.getNode(id);
        const depth = dataStore.getNodePath(id).length;
        console.log(`${index + 1}. ${id} (${node?.type}) - depth: ${depth} - ${node?.text || ''}`);
      });
      
      expect(allNodes.length).toBeGreaterThan(50); // Complex document, so many nodes
      expect(allNodes[0]).toBe(dataStore.getRootNodeId());
    });

    it('Filter only table-related nodes', () => {
      const iterator = dataStore.createDocumentIterator({
        filter: { 
          stypes: ['bTable', 'bTableHeader', 'bTableBody', 'bTableRow', 'bTableHeaderCell', 'bTableCell'] 
        }
      });
      
      const tableNodes: string[] = [];
      for (const nodeId of iterator) {
        tableNodes.push(nodeId);
      }
      
      console.log('=== Filter only table-related nodes ===');
      tableNodes.forEach((id, index) => {
        const node = dataStore.getNode(id);
        const depth = dataStore.getNodePath(id).length;
        console.log(`${index + 1}. ${id} (${node?.stype}) - depth: ${depth} - ${node?.text || ''}`);
      });
      
      expect(tableNodes.length).toBeGreaterThan(20); // Two tables and their contents
      tableNodes.forEach(id => {
        const nodeType = dataStore.getNode(id)?.stype;
        expect(['bTable', 'bTableHeader', 'bTableBody', 'bTableRow', 'bTableHeaderCell', 'bTableCell']).toContain(nodeType);
      });
    });

    it('Filter only list-related nodes', () => {
      const iterator = dataStore.createDocumentIterator({
        filter: { 
          stypes: ['list', 'listItem'] 
        }
      });
      
      const listNodes: string[] = [];
      for (const nodeId of iterator) {
        listNodes.push(nodeId);
      }
      
      console.log('=== Filter only list-related nodes ===');
      listNodes.forEach((id, index) => {
        const node = dataStore.getNode(id);
        const depth = dataStore.getNodePath(id).length;
        console.log(`${index + 1}. ${id} (${node?.stype}) - depth: ${depth} - ${node?.text || ''}`);
      });
      
      expect(listNodes.length).toBe(4); // 1 list, 3 list items
      listNodes.forEach(id => {
        const nodeType = dataStore.getNode(id)?.stype;
        expect(['list', 'listItem']).toContain(nodeType);
      });
    });

    it('Filter only text nodes with marks applied', () => {
      const iterator = dataStore.createDocumentIterator({
        customFilter: (nodeId, node) => {
          return node?.stype === 'inline-text' && node?.marks && node.marks.length > 0;
        }
      });
      
      const markedNodes: string[] = [];
      for (const nodeId of iterator) {
        markedNodes.push(nodeId);
      }
      
      console.log('=== Filter only text nodes with marks applied ===');
      markedNodes.forEach((id, index) => {
        const node = dataStore.getNode(id);
        const marks = node?.marks?.map(m => m.stype).join(', ') || '';
        console.log(`${index + 1}. ${id} - "${node?.text}" [${marks}]`);
      });
      
      expect(markedNodes.length).toBe(8); // 8 texts with marks applied
      markedNodes.forEach(id => {
        const node = dataStore.getNode(id);
        expect(node?.marks).toBeTruthy();
        expect(node?.marks.length).toBeGreaterThan(0);
      });
    });

    it('Traverse only nodes at specific depth', () => {
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
      
      console.log('=== Nodes at depth 3 ===');
      depth3Nodes.forEach((id, index) => {
        const node = dataStore.getNode(id);
        console.log(`${index + 1}. ${id} (${node?.type}) - ${node?.text || ''}`);
      });
      
      expect(depth3Nodes.length).toBeGreaterThan(5);
      depth3Nodes.forEach(id => {
        expect(dataStore.getNodePath(id).length).toBe(3);
      });
    });

    it('Filter only text inside table cells', () => {
      const iterator = dataStore.createDocumentIterator({
        customFilter: (nodeId, node) => {
          if (node?.stype !== 'inline-text') return false;
          
          // Check if parent is table cell
          const path = dataStore.getNodePath(nodeId);
          return path.some(id => {
            const pathNode = dataStore.getNode(id);
            return pathNode?.stype === 'bTableCell' || pathNode?.stype === 'bTableHeaderCell';
          });
        }
      });
      
      const tableTextNodes: string[] = [];
      for (const nodeId of iterator) {
        tableTextNodes.push(nodeId);
      }
      
      console.log('=== Filter only text inside table cells ===');
      tableTextNodes.forEach((id, index) => {
        const node = dataStore.getNode(id);
        console.log(`${index + 1}. ${id} - "${node?.text}"`);
      });
      
      expect(tableTextNodes.length).toBeGreaterThan(10); // Text in table cells
      tableTextNodes.forEach(id => {
        const node = dataStore.getNode(id);
        expect(node?.stype).toBe('inline-text');
        
        // Check if table cell exists in parent path
        const path = dataStore.getNodePath(id);
        const hasTableCell = path.some(pathId => {
          const pathNode = dataStore.getNode(pathId);
          return pathNode?.stype === 'bTableCell' || pathNode?.stype === 'bTableHeaderCell';
        });
        expect(hasTableCell).toBe(true);
      });
    });

    it('Filter only code-related nodes', () => {
      const iterator = dataStore.createDocumentIterator({
        filter: { 
          stypes: ['codeBlock'] 
        }
      });
      
      const codeNodes: string[] = [];
      for (const nodeId of iterator) {
        codeNodes.push(nodeId);
      }
      
      console.log('=== Filter only code-related nodes ===');
      codeNodes.forEach((id, index) => {
        const node = dataStore.getNode(id);
        console.log(`${index + 1}. ${id} (${node?.type}) - language: ${node?.attributes?.language || 'text'}`);
        console.log(`   code: ${node?.text?.substring(0, 50)}...`);
      });
      
      expect(codeNodes.length).toBe(1); // One code block
      const codeNode = dataStore.getNode(codeNodes[0]);
      expect(codeNode?.stype).toBe('codeBlock');
      expect(codeNode?.attributes?.language).toBe('typescript');
    });

    it('Reverse traversal - complex document', () => {
      const iterator = dataStore.createDocumentIterator({ reverse: true });
      const reverseNodes: string[] = [];
      
      for (const nodeId of iterator) {
        reverseNodes.push(nodeId);
        if (reverseNodes.length >= 20) break; // Only first 20
      }
      
      console.log('=== Reverse traversal (first 20) ===');
      reverseNodes.forEach((id, index) => {
        const node = dataStore.getNode(id);
        console.log(`${index + 1}. ${id} (${node?.type}) - ${node?.text || ''}`);
      });
      
      expect(reverseNodes.length).toBe(20);
      // Reverse order, so last node should appear first
      let lastNodeId = dataStore.getRootNodeId() as string;
      let currentId = lastNodeId;
      while (currentId) {
        lastNodeId = currentId;
        currentId = dataStore.getNextNode(currentId) as string;
      }
      expect(reverseNodes[0]).toBe(lastNodeId);
    });

    it('Traverse only within specific section', () => {
      // Start from "주요 기능" section (using actual node ID)
      const headings = dataStore.findNodesByType('heading');
      const mainFeaturesHeading = headings.find(h => {
        // Check text in heading node's child text node
        if (h.content && h.content.length > 0) {
          const textNode = dataStore.getNode(h.content[0] as string);
          return textNode?.text === '주요 기능';
        }
        return false;
      });
      expect(mainFeaturesHeading).toBeTruthy();
      
      const iterator = dataStore.createDocumentIterator({
        startNodeId: mainFeaturesHeading!.sid!,
        shouldStop: (nodeId, node) => {
          // Stop when next heading is encountered
          return node?.stype === 'heading' && nodeId !== mainFeaturesHeading!.sid;
        }
      });
      
      const sectionNodes: string[] = [];
      for (const nodeId of iterator) {
        sectionNodes.push(nodeId);
      }
      
      console.log('=== Traverse only within "주요 기능" section ===');
      sectionNodes.forEach((id, index) => {
        const node = dataStore.getNode(id);
        console.log(`${index + 1}. ${id} (${node?.type}) - ${node?.text || ''}`);
      });
      
      expect(sectionNodes.length).toBeGreaterThan(5);
      // First node should be "주요 기능" heading
      const firstNode = dataStore.getNode(sectionNodes[0]);
      expect(firstNode?.stype).toBe('heading');
      
      // Verify child text node of heading node
      if (firstNode?.content && firstNode.content.length > 0) {
        const textNode = dataStore.getNode(firstNode.content[0] as string);
        expect(textNode?.text).toBe('주요 기능');
      }
    });

    it('collect statistics', () => {
      const iterator = dataStore.createDocumentIterator();
      const stats = iterator.getStats();
      
      console.log('=== Document statistics ===');
      console.log(`Total nodes: ${stats.total}`);
      console.log('Nodes by type:', stats.byType);
      console.log('Nodes by depth:', stats.byDepth);
      
      expect(stats.total).toBeGreaterThan(50);
      expect(stats.byType['document']).toBe(1);
      expect(stats.byType['heading']).toBeGreaterThan(3);
      expect(stats.byType['paragraph']).toBeGreaterThan(5);
      expect(stats.byType['bTable']).toBe(2);
      expect(stats.byType['inline-text']).toBeGreaterThan(20);
    });

    it('performance test - large-scale traversal', () => {
      const startTime = performance.now();
      
      const iterator = dataStore.createDocumentIterator();
      let count = 0;
      
      for (const nodeId of iterator) {
        count++;
        if (count > 1000) break; // Prevent infinite loop
      }
      
      const endTime = performance.now();
      const duration = endTime - startTime;
      
      console.log(`\n=== Complex document Iterator performance test ===`);
      console.log(`Nodes traversed: ${count}`);
      console.log(`Time taken: ${duration.toFixed(2)}ms`);
      console.log(`Average time per node: ${(duration / count).toFixed(4)}ms`);
      
      expect(duration).toBeLessThan(50); // Within 50ms
      expect(count).toBeGreaterThan(50); // Must traverse at least 50 nodes
    });

    it('conditional traversal - stop at specific condition', () => {
      const iterator = dataStore.createDocumentIterator({
        shouldStop: (nodeId, node) => {
          // Stop when table is encountered
          return node?.stype === 'bTable';
        }
      });
      
      const beforeTableNodes: string[] = [];
      for (const nodeId of iterator) {
        beforeTableNodes.push(nodeId);
      }
      
      console.log('=== Traverse until table ===');
      beforeTableNodes.forEach((id, index) => {
        const node = dataStore.getNode(id);
        console.log(`${index + 1}. ${id} (${node?.type}) - ${node?.text || ''}`);
      });
      
      // Last node should not be a table
      const lastNode = dataStore.getNode(beforeTableNodes[beforeTableNodes.length - 1]);
      expect(lastNode?.stype).not.toBe('bTable');
    });

    it('utility method tests', () => {
      // find() - find first table
      const iterator1 = dataStore.createDocumentIterator();
      const firstTable = iterator1.find((nodeId, node) => node?.stype === 'bTable');
      expect(firstTable).toBeTruthy();
      const tableNode = dataStore.getNode(firstTable!);
      expect(tableNode?.stype).toBe('bTable');
      
      // findAll() - find all headings (using new Iterator)
      const iterator2 = dataStore.createDocumentIterator();
      const allHeadings = iterator2.findAll((nodeId, node) => node?.stype === 'heading');
      expect(allHeadings.length).toBe(5); // 5 headings
      allHeadings.forEach(id => {
        expect(dataStore.getNode(id)?.stype).toBe('heading');
      });
      
      // takeWhile() - until first table (using new Iterator)
      const iterator3 = dataStore.createDocumentIterator();
      const beforeFirstTable = iterator3.takeWhile((nodeId, node) => node?.stype !== 'bTable');
      expect(beforeFirstTable.length).toBeGreaterThan(0);
      const lastNode = dataStore.getNode(beforeFirstTable[beforeFirstTable.length - 1]);
      expect(lastNode?.stype).not.toBe('bTable');
    });
  });

  describe('Extremely complex document structure', () => {
    beforeEach(() => {
      // Create extremely complex document structure
      dataStore.createNodeWithChildren({
        stype: 'document',
        content: [
          {
            stype: 'heading',
            attributes: { level: 1 },
            content: [
              { stype: 'inline-text', text: '극도로 복잡한 문서' }
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
                      { stype: 'inline-text', text: '첫 번째 리스트 항목' }
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
                              { stype: 'inline-text', text: '중첩된 리스트 1' }
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
                              { stype: 'inline-text', text: '중첩된 리스트 2' }
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
                                      { stype: 'inline-text', text: '삼중 중첩 리스트' }
                                    ]
                                  }
                                ]
                              }
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
            stype: 'bTable',
            attributes: { caption: '복잡한 중첩 테이블' },
            content: [
              {
                stype: 'bTableHeader',
                content: [
                  {
                    stype: 'bTableHeaderCell',
                    content: [
                      {
                        stype: 'paragraph',
                        content: [
                          { stype: 'inline-text', text: '헤더 1' }
                        ]
                      }
                    ]
                  },
                  {
                    stype: 'bTableHeaderCell',
                    content: [
                      {
                        stype: 'paragraph',
                        content: [
                          { stype: 'inline-text', text: '헤더 2' }
                        ]
                      }
                    ]
                  }
                ]
              },
              {
                stype: 'bTableBody',
                content: [
                  {
                    stype: 'bTableRow',
                    content: [
                      {
                        stype: 'bTableCell',
                        content: [
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
                                      { stype: 'inline-text', text: '테이블 셀 내 리스트' }
                                    ]
                                  }
                                ]
                              }
                            ]
                          }
                        ]
                      },
                      {
                        stype: 'bTableCell',
                        content: [
                          {
                            stype: 'paragraph',
                            content: [
                              { stype: 'inline-text', text: '일반 셀' }
                            ]
                          }
                        ]
                      }
                    ]
                  }
                ]
              }
            ]
          }
        ]
      });
    });

    it('극도로 복잡한 구조에서의 순회', () => {
      const iterator = dataStore.createDocumentIterator();
      const allNodes: string[] = [];
      
      for (const nodeId of iterator) {
        allNodes.push(nodeId);
      }
      
      console.log('=== 극도로 복잡한 구조 순회 결과 ===');
      allNodes.forEach((id, index) => {
        const node = dataStore.getNode(id);
        const depth = dataStore.getNodePath(id).length;
        console.log(`${index + 1}. ${id} (${node?.type}) - 깊이: ${depth} - ${node?.text || ''}`);
      });
      
      expect(allNodes.length).toBeGreaterThan(20);
      
      // Check distribution by depth
      const depthStats: Record<number, number> = {};
      allNodes.forEach(id => {
        const depth = dataStore.getNodePath(id).length;
        depthStats[depth] = (depthStats[depth] || 0) + 1;
      });
      
      console.log('Distribution by depth:', depthStats);
      expect(depthStats[1]).toBe(1); // document
      expect(depthStats[2]).toBeGreaterThan(0); // Top-level blocks
      expect(depthStats[3]).toBeGreaterThan(0); // Nested blocks
      expect(depthStats[4]).toBeGreaterThan(0); // More deeply nested blocks
    });

    it('특정 깊이 제한으로 순회', () => {
      const iterator = dataStore.createDocumentIterator({
        maxDepth: 4
      });
      
      const limitedNodes: string[] = [];
      for (const nodeId of iterator) {
        limitedNodes.push(nodeId);
      }
      
      console.log('=== 깊이 4까지만 순회 ===');
      limitedNodes.forEach((id, index) => {
        const node = dataStore.getNode(id);
        const depth = dataStore.getNodePath(id).length;
        console.log(`${index + 1}. ${id} (${node?.type}) - 깊이: ${depth} - ${node?.text || ''}`);
      });
      
      limitedNodes.forEach(id => {
        const depth = dataStore.getNodePath(id).length;
        expect(depth).toBeLessThanOrEqual(4);
      });
    });
  });
});
