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

  describe('복잡한 실제 문서 구조', () => {
    beforeEach(() => {
      // main.ts를 참고한 실제 문서 구조
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

    it('전체 문서 순회 - 모든 노드', () => {
      const iterator = dataStore.createDocumentIterator();
      const allNodes: string[] = [];
      
      for (const nodeId of iterator) {
        allNodes.push(nodeId);
      }
      
      console.log('=== 전체 문서 순회 결과 ===');
      allNodes.forEach((id, index) => {
        const node = dataStore.getNode(id);
        const depth = dataStore.getNodePath(id).length;
        console.log(`${index + 1}. ${id} (${node?.type}) - 깊이: ${depth} - ${node?.text || ''}`);
      });
      
      expect(allNodes.length).toBeGreaterThan(50); // 복잡한 문서이므로 많은 노드
      expect(allNodes[0]).toBe(dataStore.getRootNodeId());
    });

    it('테이블 관련 노드만 필터링', () => {
      const iterator = dataStore.createDocumentIterator({
        filter: { 
          stypes: ['bTable', 'bTableHeader', 'bTableBody', 'bTableRow', 'bTableHeaderCell', 'bTableCell'] 
        }
      });
      
      const tableNodes: string[] = [];
      for (const nodeId of iterator) {
        tableNodes.push(nodeId);
      }
      
      console.log('=== 테이블 관련 노드만 필터링 ===');
      tableNodes.forEach((id, index) => {
        const node = dataStore.getNode(id);
        const depth = dataStore.getNodePath(id).length;
        console.log(`${index + 1}. ${id} (${node?.stype}) - 깊이: ${depth} - ${node?.text || ''}`);
      });
      
      expect(tableNodes.length).toBeGreaterThan(20); // 두 개의 테이블과 그 내용들
      tableNodes.forEach(id => {
        const nodeType = dataStore.getNode(id)?.stype;
        expect(['bTable', 'bTableHeader', 'bTableBody', 'bTableRow', 'bTableHeaderCell', 'bTableCell']).toContain(nodeType);
      });
    });

    it('리스트 관련 노드만 필터링', () => {
      const iterator = dataStore.createDocumentIterator({
        filter: { 
          stypes: ['list', 'listItem'] 
        }
      });
      
      const listNodes: string[] = [];
      for (const nodeId of iterator) {
        listNodes.push(nodeId);
      }
      
      console.log('=== 리스트 관련 노드만 필터링 ===');
      listNodes.forEach((id, index) => {
        const node = dataStore.getNode(id);
        const depth = dataStore.getNodePath(id).length;
        console.log(`${index + 1}. ${id} (${node?.stype}) - 깊이: ${depth} - ${node?.text || ''}`);
      });
      
      expect(listNodes.length).toBe(4); // 리스트 1개, 리스트 아이템 3개
      listNodes.forEach(id => {
        const nodeType = dataStore.getNode(id)?.stype;
        expect(['list', 'listItem']).toContain(nodeType);
      });
    });

    it('마크가 적용된 텍스트 노드만 필터링', () => {
      const iterator = dataStore.createDocumentIterator({
        customFilter: (nodeId, node) => {
          return node?.stype === 'inline-text' && node?.marks && node.marks.length > 0;
        }
      });
      
      const markedNodes: string[] = [];
      for (const nodeId of iterator) {
        markedNodes.push(nodeId);
      }
      
      console.log('=== 마크가 적용된 텍스트 노드만 필터링 ===');
      markedNodes.forEach((id, index) => {
        const node = dataStore.getNode(id);
        const marks = node?.marks?.map(m => m.stype).join(', ') || '';
        console.log(`${index + 1}. ${id} - "${node?.text}" [${marks}]`);
      });
      
      expect(markedNodes.length).toBe(8); // 8개의 마크가 적용된 텍스트들
      markedNodes.forEach(id => {
        const node = dataStore.getNode(id);
        expect(node?.marks).toBeTruthy();
        expect(node?.marks.length).toBeGreaterThan(0);
      });
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
        console.log(`${index + 1}. ${id} (${node?.type}) - ${node?.text || ''}`);
      });
      
      expect(depth3Nodes.length).toBeGreaterThan(5);
      depth3Nodes.forEach(id => {
        expect(dataStore.getNodePath(id).length).toBe(3);
      });
    });

    it('테이블 셀 내부의 텍스트만 필터링', () => {
      const iterator = dataStore.createDocumentIterator({
        customFilter: (nodeId, node) => {
          if (node?.stype !== 'inline-text') return false;
          
          // 부모가 테이블 셀인지 확인
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
      
      console.log('=== 테이블 셀 내부의 텍스트만 필터링 ===');
      tableTextNodes.forEach((id, index) => {
        const node = dataStore.getNode(id);
        console.log(`${index + 1}. ${id} - "${node?.text}"`);
      });
      
      expect(tableTextNodes.length).toBeGreaterThan(10); // 테이블 셀들의 텍스트
      tableTextNodes.forEach(id => {
        const node = dataStore.getNode(id);
        expect(node?.stype).toBe('inline-text');
        
        // 부모 경로에 테이블 셀이 있는지 확인
        const path = dataStore.getNodePath(id);
        const hasTableCell = path.some(pathId => {
          const pathNode = dataStore.getNode(pathId);
          return pathNode?.stype === 'bTableCell' || pathNode?.stype === 'bTableHeaderCell';
        });
        expect(hasTableCell).toBe(true);
      });
    });

    it('코드 관련 노드만 필터링', () => {
      const iterator = dataStore.createDocumentIterator({
        filter: { 
          stypes: ['codeBlock'] 
        }
      });
      
      const codeNodes: string[] = [];
      for (const nodeId of iterator) {
        codeNodes.push(nodeId);
      }
      
      console.log('=== 코드 관련 노드만 필터링 ===');
      codeNodes.forEach((id, index) => {
        const node = dataStore.getNode(id);
        console.log(`${index + 1}. ${id} (${node?.type}) - 언어: ${node?.attributes?.language || 'text'}`);
        console.log(`   코드: ${node?.text?.substring(0, 50)}...`);
      });
      
      expect(codeNodes.length).toBe(1); // 하나의 코드 블록
      const codeNode = dataStore.getNode(codeNodes[0]);
      expect(codeNode?.stype).toBe('codeBlock');
      expect(codeNode?.attributes?.language).toBe('typescript');
    });

    it('역순 순회 - 복잡한 문서', () => {
      const iterator = dataStore.createDocumentIterator({ reverse: true });
      const reverseNodes: string[] = [];
      
      for (const nodeId of iterator) {
        reverseNodes.push(nodeId);
        if (reverseNodes.length >= 20) break; // 처음 20개만
      }
      
      console.log('=== 역순 순회 (처음 20개) ===');
      reverseNodes.forEach((id, index) => {
        const node = dataStore.getNode(id);
        console.log(`${index + 1}. ${id} (${node?.type}) - ${node?.text || ''}`);
      });
      
      expect(reverseNodes.length).toBe(20);
      // 역순이므로 마지막 노드가 첫 번째로 나와야 함
      let lastNodeId = dataStore.getRootNodeId() as string;
      let currentId = lastNodeId;
      while (currentId) {
        lastNodeId = currentId;
        currentId = dataStore.getNextNode(currentId) as string;
      }
      expect(reverseNodes[0]).toBe(lastNodeId);
    });

    it('특정 섹션 내에서만 순회', () => {
      // "주요 기능" 섹션부터 시작 (실제 노드 ID 사용)
      const headings = dataStore.findNodesByType('heading');
      const mainFeaturesHeading = headings.find(h => {
        // heading 노드의 자식 텍스트 노드에서 텍스트 확인
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
          // 다음 제목을 만나면 중단
          return node?.stype === 'heading' && nodeId !== mainFeaturesHeading!.sid;
        }
      });
      
      const sectionNodes: string[] = [];
      for (const nodeId of iterator) {
        sectionNodes.push(nodeId);
      }
      
      console.log('=== "주요 기능" 섹션 내에서만 순회 ===');
      sectionNodes.forEach((id, index) => {
        const node = dataStore.getNode(id);
        console.log(`${index + 1}. ${id} (${node?.type}) - ${node?.text || ''}`);
      });
      
      expect(sectionNodes.length).toBeGreaterThan(5);
      // 첫 번째 노드는 "주요 기능" 제목이어야 함
      const firstNode = dataStore.getNode(sectionNodes[0]);
      expect(firstNode?.stype).toBe('heading');
      
      // heading 노드의 자식 텍스트 노드 확인
      if (firstNode?.content && firstNode.content.length > 0) {
        const textNode = dataStore.getNode(firstNode.content[0] as string);
        expect(textNode?.text).toBe('주요 기능');
      }
    });

    it('통계 정보 수집', () => {
      const iterator = dataStore.createDocumentIterator();
      const stats = iterator.getStats();
      
      console.log('=== 문서 통계 정보 ===');
      console.log(`총 노드 수: ${stats.total}`);
      console.log('타입별 노드 수:', stats.byType);
      console.log('깊이별 노드 수:', stats.byDepth);
      
      expect(stats.total).toBeGreaterThan(50);
      expect(stats.byType['document']).toBe(1);
      expect(stats.byType['heading']).toBeGreaterThan(3);
      expect(stats.byType['paragraph']).toBeGreaterThan(5);
      expect(stats.byType['bTable']).toBe(2);
      expect(stats.byType['inline-text']).toBeGreaterThan(20);
    });

    it('성능 테스트 - 대용량 순회', () => {
      const startTime = performance.now();
      
      const iterator = dataStore.createDocumentIterator();
      let count = 0;
      
      for (const nodeId of iterator) {
        count++;
        if (count > 1000) break; // 무한 루프 방지
      }
      
      const endTime = performance.now();
      const duration = endTime - startTime;
      
      console.log(`\n=== 복잡한 문서 Iterator 성능 테스트 ===`);
      console.log(`순회한 노드 수: ${count}`);
      console.log(`소요 시간: ${duration.toFixed(2)}ms`);
      console.log(`노드당 평균 시간: ${(duration / count).toFixed(4)}ms`);
      
      expect(duration).toBeLessThan(50); // 50ms 이내
      expect(count).toBeGreaterThan(50); // 최소 50개 노드는 순회
    });

    it('조건부 순회 - 특정 조건에서 중단', () => {
      const iterator = dataStore.createDocumentIterator({
        shouldStop: (nodeId, node) => {
          // 테이블을 만나면 중단
          return node?.stype === 'bTable';
        }
      });
      
      const beforeTableNodes: string[] = [];
      for (const nodeId of iterator) {
        beforeTableNodes.push(nodeId);
      }
      
      console.log('=== 테이블 이전까지 순회 ===');
      beforeTableNodes.forEach((id, index) => {
        const node = dataStore.getNode(id);
        console.log(`${index + 1}. ${id} (${node?.type}) - ${node?.text || ''}`);
      });
      
      // 마지막 노드는 테이블이 아니어야 함
      const lastNode = dataStore.getNode(beforeTableNodes[beforeTableNodes.length - 1]);
      expect(lastNode?.stype).not.toBe('bTable');
    });

    it('유틸리티 메서드 테스트', () => {
      // find() - 첫 번째 테이블 찾기
      const iterator1 = dataStore.createDocumentIterator();
      const firstTable = iterator1.find((nodeId, node) => node?.stype === 'bTable');
      expect(firstTable).toBeTruthy();
      const tableNode = dataStore.getNode(firstTable!);
      expect(tableNode?.stype).toBe('bTable');
      
      // findAll() - 모든 제목 찾기 (새로운 Iterator 사용)
      const iterator2 = dataStore.createDocumentIterator();
      const allHeadings = iterator2.findAll((nodeId, node) => node?.stype === 'heading');
      expect(allHeadings.length).toBe(5); // 5개의 제목
      allHeadings.forEach(id => {
        expect(dataStore.getNode(id)?.stype).toBe('heading');
      });
      
      // takeWhile() - 첫 번째 테이블까지 (새로운 Iterator 사용)
      const iterator3 = dataStore.createDocumentIterator();
      const beforeFirstTable = iterator3.takeWhile((nodeId, node) => node?.stype !== 'bTable');
      expect(beforeFirstTable.length).toBeGreaterThan(0);
      const lastNode = dataStore.getNode(beforeFirstTable[beforeFirstTable.length - 1]);
      expect(lastNode?.stype).not.toBe('bTable');
    });
  });

  describe('극도로 복잡한 문서 구조', () => {
    beforeEach(() => {
      // 극도로 복잡한 문서 구조 생성
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
      
      // 깊이별 분포 확인
      const depthStats: Record<number, number> = {};
      allNodes.forEach(id => {
        const depth = dataStore.getNodePath(id).length;
        depthStats[depth] = (depthStats[depth] || 0) + 1;
      });
      
      console.log('깊이별 분포:', depthStats);
      expect(depthStats[1]).toBe(1); // document
      expect(depthStats[2]).toBeGreaterThan(0); // 최상위 블록들
      expect(depthStats[3]).toBeGreaterThan(0); // 중첩된 블록들
      expect(depthStats[4]).toBeGreaterThan(0); // 더 깊이 중첩된 블록들
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
