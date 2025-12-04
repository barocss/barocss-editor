import { describe, beforeEach, it, expect } from 'vitest';
import { DataStore } from '../src/data-store';
import { Schema } from '@barocss/schema';

describe('getNextNode - Comprehensive Validation', () => {
  let dataStore: DataStore;
  let schema: Schema;

  beforeEach(() => {
    schema = new Schema('test-schema', {
      nodes: {
        'document': {
          name: 'document',
          content: 'block+'
        },
        'paragraph': {
          name: 'paragraph',
          content: 'inline*',
          group: 'block'
        },
        'heading': {
          name: 'heading',
          content: 'inline*',
          group: 'block',
          attrs: {
            level: { stype: 'number', default: 1 }
          }
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
        ,
        'inline-image': {
          name: 'inline-image',
          group: 'inline',
          attrs: { src: { type: 'string' }, alt: { type: 'string', default: '' } }
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

  describe('복잡한 중첩 구조 검증', () => {
    beforeEach(() => {
      // document > [heading, paragraph, list, paragraph]
      // list > [listItem-1, listItem-2]
      // listItem-1 > [paragraph-1, paragraph-2]
      // listItem-2 > [paragraph-3]
      dataStore.createNodeWithChildren({
        stype: 'document',
        content: [
          {
            stype: 'heading',
            attributes: { level: 1 },
            content: [
              { stype: 'inline-text', text: 'Main Title' }
            ]
          },
          {
            stype: 'paragraph',
            content: [
              { stype: 'inline-text', text: 'Introduction paragraph' }
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
                      { stype: 'inline-text', text: 'First list item paragraph 1' }
                    ]
                  },
                  {
                    stype: 'paragraph',
                    content: [
                      { stype: 'inline-text', text: 'First list item paragraph 2' }
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
                      { stype: 'inline-text', text: 'Second list item paragraph' }
                    ]
                  }
                ]
              }
            ]
          },
          {
            stype: 'paragraph',
            content: [
              { stype: 'inline-text', text: 'Conclusion paragraph' }
            ]
          }
        ]
      });
    });

    it('깊은 중첩에서 올바른 순서로 이동', () => {
      const allNodes = dataStore.getAllNodes();
      const nodeMap = new Map(allNodes.map(node => [node.sid!, node]));
      
      // 문서 순서대로 노드 ID 수집
      const documentOrder: string[] = [];
      let currentId = dataStore.getRootNodeId() as string;
      
      while (currentId) {
        documentOrder.push(currentId);
        currentId = dataStore.getNextNode(currentId) as string;
      }
      
      console.log('Document order:', documentOrder.map(id => {
        const node = nodeMap.get(id);
        return `${id} (${node?.type})`;
      }));
      
      // 예상 순서: document > heading > text > paragraph > text > list > listItem-1 > paragraph > text > paragraph > text > listItem-2 > paragraph > text > paragraph > text
      expect(documentOrder.length).toBeGreaterThan(10);
      
      // 첫 번째는 document
      expect(nodeMap.get(documentOrder[0])?.stype).toBe('document');
      
      // 마지막은 conclusion paragraph의 text
      const lastNode = nodeMap.get(documentOrder[documentOrder.length - 1]);
      expect(lastNode?.stype).toBe('inline-text');
      expect(lastNode?.text).toBe('Conclusion paragraph');
    });

    it('listItem 내부에서 올바른 순서', () => {
      const listItems = dataStore.findNodesByType('listItem');
      const firstListItem = listItems[0];
      
      // listItem-1의 첫 번째 자식 (paragraph)
      const firstChild = dataStore.getNextNode(firstListItem.sid!);
      expect(firstChild).toBeTruthy();
      
      const firstChildNode = dataStore.getNode(firstChild!);
      expect(firstChildNode?.stype).toBe('paragraph');
      
      // 그 paragraph의 첫 번째 자식 (text)
      const firstText = dataStore.getNextNode(firstChild!);
      expect(firstText).toBeTruthy();
      
      const firstTextNode = dataStore.getNode(firstText!);
      expect(firstTextNode?.stype).toBe('inline-text');
      expect(firstTextNode?.text).toBe('First list item paragraph 1');
    });
  });

  describe('경계 케이스 심화 검증', () => {
    beforeEach(() => {
      // 단일 노드 문서
      dataStore.createNodeWithChildren({
        stype: 'document',
        content: [
          {
            stype: 'paragraph',
            content: [
              { stype: 'inline-text', text: 'Single text node' }
            ]
          }
        ]
      });
    });

    it('단일 노드에서의 동작', () => {
      const document = dataStore.findNodesByType('document')[0];
      const paragraph = dataStore.findNodesByType('paragraph')[0];
      const text = dataStore.findNodesByType('inline-text')[0];
      
      // document -> paragraph
      expect(dataStore.getNextNode(document.sid!)).toBe(paragraph.sid);
      
      // paragraph -> text
      expect(dataStore.getNextNode(paragraph.sid!)).toBe(text.sid);
      
      // text -> null (마지막)
      expect(dataStore.getNextNode(text.sid!)).toBeNull();
    });
  });

  describe('빈 콘텐츠 노드 검증', () => {
    beforeEach(() => {
      // 빈 paragraph가 있는 문서
      dataStore.createNodeWithChildren({
        stype: 'document',
        content: [
          {
            stype: 'paragraph',
            content: [
              { stype: 'inline-text', text: 'First paragraph' }
            ]
          },
          {
            stype: 'paragraph',
            content: [] // 빈 paragraph
          },
          {
            stype: 'paragraph',
            content: [
              { stype: 'inline-text', text: 'Third paragraph' }
            ]
          }
        ]
      });
    });

    it('빈 콘텐츠 노드 처리', () => {
      const paragraphs = dataStore.findNodesByType('paragraph');
      const emptyParagraph = paragraphs[1];
      
      // 빈 paragraph는 자식이 없으므로 다음 형제로 이동
      const nextAfterEmpty = dataStore.getNextNode(emptyParagraph.sid!);
      expect(nextAfterEmpty).toBeTruthy();
      
      const nextNode = dataStore.getNode(nextAfterEmpty!);
      expect(nextNode?.stype).toBe('paragraph');
      expect(nextNode?.content?.length).toBe(1); // 세 번째 paragraph
    });
  });

  describe('성능 및 복잡성 검증', () => {
    beforeEach(() => {
      // 깊은 중첩 구조 (3레벨) - createNodeWithChildren 사용
      dataStore.createNodeWithChildren({
        stype: 'document',
        content: [
          {
            stype: 'paragraph',
            content: [
              { stype: 'inline-text', text: 'Level 1' }
            ]
          },
          {
            stype: 'paragraph',
            content: [
              { stype: 'inline-text', text: 'Level 2' }
            ]
          },
          {
            stype: 'paragraph',
            content: [
              { stype: 'inline-text', text: 'Level 3' }
            ]
          },
          {
            stype: 'paragraph',
            content: [
              { stype: 'inline-text', text: 'Level 4' }
            ]
          },
          {
            stype: 'paragraph',
            content: [
              { stype: 'inline-text', text: 'Level 5' }
            ]
          }
        ]
      });
    });

    it('깊은 중첩에서 성능 테스트', () => {
      const startTime = performance.now();
      
      // 모든 노드를 순회
      let currentId = dataStore.getRootNodeId() as string;
      let count = 0;
      
      while (currentId && count < 100) { // 무한 루프 방지
        currentId = dataStore.getNextNode(currentId) as string;
        count++;
      }
      
      const endTime = performance.now();
      const duration = endTime - startTime;
      
      console.log(`Traversed ${count} nodes in ${duration.toFixed(2)}ms`);
      
      // 성능 기준: 100개 노드를 10ms 이내에 순회
      expect(duration).toBeLessThan(10);
      expect(count).toBeGreaterThan(5); // 최소 5개 노드는 순회해야 함
    });
  });

  describe('에러 케이스 검증', () => {
    beforeEach(() => {
      dataStore.createNodeWithChildren({
        stype: 'document',
        content: [
          {
            stype: 'paragraph',
            content: [
              { stype: 'inline-text', text: 'Test' }
            ]
          }
        ]
      });
    });

    it('존재하지 않는 노드 ID로 호출', () => {
      expect(() => {
        dataStore.getNextNode('non-existent-sid');
      }).toThrow('Node not found: non-existent-sid');
    });

    it('빈 문자열로 호출', () => {
      expect(() => {
        dataStore.getNextNode('');
      }).toThrow('Node not found: ');
    });

    it('null로 호출', () => {
      expect(() => {
        dataStore.getNextNode(null as any);
      }).toThrow();
    });

    it('undefined로 호출', () => {
      expect(() => {
        dataStore.getNextNode(undefined as any);
      }).toThrow();
    });
  });

  describe('실제 에디터 시나리오 검증', () => {
    beforeEach(() => {
      // main.ts와 유사한 복잡한 문서 구조
      dataStore.createNodeWithChildren({
        stype: 'document',
        content: [
          {
            stype: 'heading',
            attributes: { level: 1 },
            content: [
              { stype: 'inline-text', text: 'BaroCSS Editor Demo' }
            ]
          },
          {
            stype: 'paragraph',
            content: [
              { stype: 'inline-text', text: 'This is a ' },
              { stype: 'inline-text', text: 'bold text', marks: [{ stype: 'bold', range: [0, 9] }] },
              { stype: 'inline-text', text: ' and this is ' },
              { stype: 'inline-text', text: 'italic text', marks: [{ stype: 'italic', range: [0, 11] }] },
              { stype: 'inline-text', text: '.' }
            ]
          },
          {
            stype: 'heading',
            attributes: { level: 2 },
            content: [
              { stype: 'inline-text', text: 'Rich Text Features' }
            ]
          },
          {
            stype: 'paragraph',
            content: [
              { stype: 'inline-text', text: 'Here is an inline image: ' },
              { stype: 'inline-image', attributes: { src: 'https://example.com/image.png', alt: 'example' } },
              { stype: 'inline-text', text: ' and some text after.' }
            ]
          }
        ]
      });
    });

    it('실제 에디터 문서에서 순서 검증', () => {
      const allNodes = dataStore.getAllNodes();
      const textNodes = allNodes.filter(node => node.stype === 'inline-text');
      
      // 첫 번째 heading의 text부터 시작
      const firstHeading = dataStore.findNodesByType('heading')[0];
      const firstText = dataStore.getNextNode(firstHeading.sid!);
      
      expect(firstText).toBeTruthy();
      const firstTextNode = dataStore.getNode(firstText!);
      expect(firstTextNode?.text).toBe('BaroCSS Editor Demo');
      
      // 순서대로 모든 text 노드 순회
      let currentId = firstText;
      const visitedTexts: string[] = [];
      
      while (currentId) {
        const node = dataStore.getNode(currentId);
        if (node?.stype === 'inline-text') {
          visitedTexts.push(node.text || '');
        }
        currentId = dataStore.getNextNode(currentId);
      }
      
      console.log('Visited texts in order:', visitedTexts);
      
      // 예상 순서 확인
      expect(visitedTexts[0]).toBe('BaroCSS Editor Demo');
      expect(visitedTexts[1]).toBe('This is a ');
      expect(visitedTexts[2]).toBe('bold text');
      expect(visitedTexts[3]).toBe(' and this is ');
      expect(visitedTexts[4]).toBe('italic text');
      expect(visitedTexts[5]).toBe('.');
      expect(visitedTexts[6]).toBe('Rich Text Features');
      expect(visitedTexts[7]).toBe('Here is an inline image: ');
      expect(visitedTexts[8]).toBe(' and some text after.');
    });

    it('마크가 적용된 텍스트 노드들 간 이동', () => {
      const textNodes = dataStore.findNodesByType('inline-text');
      const boldText = textNodes.find(node => node.text === 'bold text');
      const italicText = textNodes.find(node => node.text === 'italic text');
      
      expect(boldText).toBeTruthy();
      expect(italicText).toBeTruthy();
      
      // bold text의 다음은 " and this is "
      const nextAfterBold = dataStore.getNextNode(boldText!.sid!);
      const nextNode = dataStore.getNode(nextAfterBold!);
      expect(nextNode?.text).toBe(' and this is ');
      
      // " and this is "의 다음은 italic text
      const nextAfterSpace = dataStore.getNextNode(nextAfterBold!);
      const italicNode = dataStore.getNode(nextAfterSpace!);
      expect(italicNode?.text).toBe('italic text');
    });
  });

  describe('메모리 및 참조 무결성 검증', () => {
    beforeEach(() => {
      dataStore.createNodeWithChildren({
        stype: 'document',
        content: [
          {
            stype: 'paragraph',
            content: [
              { stype: 'inline-text', text: 'Node 1' },
              { stype: 'inline-text', text: 'Node 2' },
              { stype: 'inline-text', text: 'Node 3' }
            ]
          }
        ]
      });
    });

    it('노드 삭제 후 getNextNode 동작', () => {
      const textNodes = dataStore.findNodesByType('inline-text');
      const middleNode = textNodes[1]; // "Node 2"
      
      // 중간 노드 삭제
      dataStore.deleteNode(middleNode.sid!);
      
      // 첫 번째 노드의 다음은 이제 세 번째 노드
      const firstNode = textNodes[0];
      const nextAfterFirst = dataStore.getNextNode(firstNode.sid!);
      const thirdNode = textNodes[2];
      
      expect(nextAfterFirst).toBe(thirdNode.sid);
    });

    it('노드 추가 후 getNextNode 동작', () => {
      const textNodes = dataStore.findNodesByType('inline-text');
      const firstNode = textNodes[0];
      const parent = dataStore.getNode(textNodes[0].parentId!);
      
      // 새 노드 생성 (createNodeWithChildren 사용)
      const newDocument = dataStore.createNodeWithChildren({
        stype: 'paragraph',
        content: [
          { stype: 'inline-text', text: 'New Node' }
        ]
      });
      
      const newTextId = newDocument.content[0] as string;
      
      // 부모의 content 배열에 새 노드 추가
      if (parent?.content) {
        const firstIndex = parent.content.indexOf(firstNode.sid!);
        parent.content.splice(firstIndex + 1, 0, newTextId);
        dataStore.updateNode(parent.sid!, { content: parent.content });
        
        // 새 노드의 parentId 업데이트
        dataStore.updateNode(newTextId, { parentId: parent.sid });
      }
      
      // 첫 번째 노드의 다음은 새로 추가된 노드
      const nextAfterFirst = dataStore.getNextNode(firstNode.sid!);
      expect(nextAfterFirst).toBe(newTextId);
      
      // 새 노드의 다음은 원래 두 번째 노드
      const nextAfterNew = dataStore.getNextNode(newTextId);
      expect(nextAfterNew).toBe(textNodes[1].sid);
    });
  });
});
