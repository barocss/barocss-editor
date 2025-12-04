import { describe, beforeEach, it, expect } from 'vitest';
import { DataStore } from '../src/data-store';
import { Schema } from '@barocss/schema';

describe('compareDocumentOrder', () => {
  let dataStore: DataStore;
  let schema: Schema;

  beforeEach(() => {
    // 간단한 스키마 정의
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
        'inline-text': {
          name: 'inline-text',
          content: 'text*',
          group: 'inline',
          attrs: {
            text: { type: 'string', default: '' }
          }
        }
      }
    });

    dataStore = new DataStore(undefined, schema);
  });

  describe('같은 부모 내 형제 노드들', () => {
    beforeEach(() => {
      // document > paragraph-1 > [text-1, text-2, text-3]
      dataStore.createNodeWithChildren({
        stype: 'document',
        content: [
          {
            stype: 'paragraph',
            content: [
              { stype: 'inline-text', text: 'First' },
              { stype: 'inline-text', text: 'Second' },
              { stype: 'inline-text', text: 'Third' }
            ]
          }
        ]
      });
    });

    it('같은 노드는 0을 반환해야 함', () => {
      const text1 = dataStore.findNodesByType('inline-text')[0];
      expect(dataStore.compareDocumentOrder(text1.sid!, text1.sid!)).toBe(0);
    });

    it('첫 번째 노드가 두 번째 노드보다 앞에 있으면 -1을 반환해야 함', () => {
      const textNodes = dataStore.findNodesByType('inline-text');
      const text1 = textNodes[0];
      const text2 = textNodes[1];
      
      expect(dataStore.compareDocumentOrder(text1.sid!, text2.sid!)).toBe(-1);
    });

    it('첫 번째 노드가 두 번째 노드보다 뒤에 있으면 1을 반환해야 함', () => {
      const textNodes = dataStore.findNodesByType('inline-text');
      const text1 = textNodes[0];
      const text2 = textNodes[1];
      
      expect(dataStore.compareDocumentOrder(text2.sid!, text1.sid!)).toBe(1);
    });

    it('첫 번째와 세 번째 노드 비교', () => {
      const textNodes = dataStore.findNodesByType('inline-text');
      const text1 = textNodes[0];
      const text3 = textNodes[2];
      
      expect(dataStore.compareDocumentOrder(text1.sid!, text3.sid!)).toBe(-2); // 인덱스 차이
      expect(dataStore.compareDocumentOrder(text3.sid!, text1.sid!)).toBe(2);
    });
  });

  describe('다른 부모의 노드들', () => {
    beforeEach(() => {
      // document > [paragraph-1, paragraph-2]
      // paragraph-1 > [text-1, text-2]
      // paragraph-2 > [text-3, text-4]
      dataStore.createNodeWithChildren({
        stype: 'document',
        content: [
          {
            stype: 'paragraph',
            content: [
              { stype: 'inline-text', text: 'Para1-Text1' },
              { stype: 'inline-text', text: 'Para1-Text2' }
            ]
          },
          {
            stype: 'paragraph',
            content: [
              { stype: 'inline-text', text: 'Para2-Text1' },
              { stype: 'inline-text', text: 'Para2-Text2' }
            ]
          }
        ]
      });
    });

    it('다른 단락의 노드들 비교', () => {
      const textNodes = dataStore.findNodesByType('inline-text');
      const para1Text1 = textNodes[0]; // Para1-Text1
      const para2Text1 = textNodes[2]; // Para2-Text1
      
      expect(dataStore.compareDocumentOrder(para1Text1.sid!, para2Text1.sid!)).toBe(-1);
      expect(dataStore.compareDocumentOrder(para2Text1.sid!, para1Text1.sid!)).toBe(1);
    });

    it('같은 단락 내의 노드들 비교', () => {
      const textNodes = dataStore.findNodesByType('inline-text');
      const para1Text1 = textNodes[0]; // Para1-Text1
      const para1Text2 = textNodes[1]; // Para1-Text2
      
      expect(dataStore.compareDocumentOrder(para1Text1.sid!, para1Text2.sid!)).toBe(-1);
      expect(dataStore.compareDocumentOrder(para1Text2.sid!, para1Text1.sid!)).toBe(1);
    });
  });

  describe('조상-후손 관계', () => {
    beforeEach(() => {
      // document > paragraph-1 > text-1
      dataStore.createNodeWithChildren({
        stype: 'document',
        content: [
          {
            stype: 'paragraph',
            content: [
              { stype: 'inline-text', text: 'Text in paragraph' }
            ]
          }
        ]
      });
    });

    it('조상이 후손보다 앞에 있음', () => {
      const document = dataStore.getRootNode()!;
      const paragraph = dataStore.findNodesByType('paragraph')[0];
      
      expect(dataStore.compareDocumentOrder(document.sid!, paragraph.sid!)).toBe(-1);
      expect(dataStore.compareDocumentOrder(paragraph.sid!, document.sid!)).toBe(1);
    });
  });

  describe('에러 케이스', () => {
    it('존재하지 않는 노드 ID로 비교 시 에러 발생', () => {
      expect(() => {
        dataStore.compareDocumentOrder('non-existent-1', 'non-existent-2');
      }).toThrow('Node not found: non-existent-1');
    });

    it('하나만 존재하지 않는 노드 ID로 비교 시 에러 발생', () => {
      dataStore.createNodeWithChildren({ stype: 'document' });
      const document = dataStore.getRootNode()!;
      
      expect(() => {
        dataStore.compareDocumentOrder(document.sid!, 'non-existent');
      }).toThrow('Node not found: non-existent');
    });
  });

  describe('복잡한 중첩 구조', () => {
    beforeEach(() => {
      // document > [paragraph-1, paragraph-2, paragraph-3]
      // paragraph-1 > [text-1, text-2]
      // paragraph-2 > [text-3]
      // paragraph-3 > [text-4, text-5, text-6]
      dataStore.createNodeWithChildren({
        stype: 'document',
        content: [
          {
            stype: 'paragraph',
            content: [
              { stype: 'inline-text', text: 'Para1-Text1' },
              { stype: 'inline-text', text: 'Para1-Text2' }
            ]
          },
          {
            stype: 'paragraph',
            content: [
              { stype: 'inline-text', text: 'Para2-Text1' }
            ]
          },
          {
            stype: 'paragraph',
            content: [
              { stype: 'inline-text', text: 'Para3-Text1' },
              { stype: 'inline-text', text: 'Para3-Text2' },
              { stype: 'inline-text', text: 'Para3-Text3' }
            ]
          }
        ]
      });
    });

    it('다른 단락의 첫 번째와 마지막 노드 비교', () => {
      const textNodes = dataStore.findNodesByType('inline-text');
      const firstText = textNodes[0]; // Para1-Text1
      const lastText = textNodes[5];  // Para3-Text3
      
      expect(dataStore.compareDocumentOrder(firstText.sid!, lastText.sid!)).toBeLessThan(0);
      expect(dataStore.compareDocumentOrder(lastText.sid!, firstText.sid!)).toBeGreaterThan(0);
    });

    it('같은 단락의 첫 번째와 마지막 노드 비교', () => {
      const textNodes = dataStore.findNodesByType('inline-text');
      const para3First = textNodes[3]; // Para3-Text1
      const para3Last = textNodes[5];  // Para3-Text3
      
      expect(dataStore.compareDocumentOrder(para3First.sid!, para3Last.sid!)).toBeLessThan(0);
      expect(dataStore.compareDocumentOrder(para3Last.sid!, para3First.sid!)).toBeGreaterThan(0);
    });

    it('인접한 단락의 노드들 비교', () => {
      const textNodes = dataStore.findNodesByType('inline-text');
      const para1Last = textNodes[1];  // Para1-Text2
      const para2First = textNodes[2]; // Para2-Text1
      
      expect(dataStore.compareDocumentOrder(para1Last.sid!, para2First.sid!)).toBe(-1);
      expect(dataStore.compareDocumentOrder(para2First.sid!, para1Last.sid!)).toBe(1);
    });

    it('단락 노드들 간의 비교', () => {
      const paragraphs = dataStore.findNodesByType('paragraph');
      const para1 = paragraphs[0];
      const para2 = paragraphs[1];
      const para3 = paragraphs[2];
      
      expect(dataStore.compareDocumentOrder(para1.sid!, para2.sid!)).toBeLessThan(0);
      expect(dataStore.compareDocumentOrder(para2.sid!, para3.sid!)).toBeLessThan(0);
      expect(dataStore.compareDocumentOrder(para1.sid!, para3.sid!)).toBeLessThan(0);
    });
  });

  describe('경계 케이스', () => {
    beforeEach(() => {
      // document > paragraph > [text-1, text-2]
      dataStore.createNodeWithChildren({
        stype: 'document',
        content: [
          {
            stype: 'paragraph',
            content: [
              { stype: 'inline-text', text: 'First' },
              { stype: 'inline-text', text: 'Second' }
            ]
          }
        ]
      });
    });

    it('빈 문자열 노드 ID로 비교 시 에러 발생', () => {
      const textNodes = dataStore.findNodesByType('inline-text');
      const text1 = textNodes[0];
      
      expect(() => {
        dataStore.compareDocumentOrder('', text1.sid!);
      }).toThrow('Node not found: ');
      
      expect(() => {
        dataStore.compareDocumentOrder(text1.sid!, '');
      }).toThrow('Node not found: ');
    });

    it('null/undefined 노드 ID로 비교 시 에러 발생', () => {
      const textNodes = dataStore.findNodesByType('inline-text');
      const text1 = textNodes[0];
      
      expect(() => {
        dataStore.compareDocumentOrder(null as any, text1.sid!);
      }).toThrow();
      
      expect(() => {
        dataStore.compareDocumentOrder(text1.sid!, undefined as any);
      }).toThrow();
    });

    it('자기 자신과의 비교는 항상 0', () => {
      const textNodes = dataStore.findNodesByType('inline-text');
      const text1 = textNodes[0];
      
      expect(dataStore.compareDocumentOrder(text1.sid!, text1.sid!)).toBe(0);
    });
  });

  describe('성능 테스트', () => {
    beforeEach(() => {
      // 깊은 중첩 구조 생성
      // document > paragraph-1 > [text-1, text-2, ..., text-10]
      const textNodes = Array.from({ length: 10 }, (_, i) => ({
        stype: 'inline-text',
        text: `Text-${i + 1}`
      }));
      
      dataStore.createNodeWithChildren({
        stype: 'document',
        content: [
          {
            stype: 'paragraph',
            content: textNodes
          }
        ]
      });
    });

    it('많은 형제 노드들 간의 비교', () => {
      const textNodes = dataStore.findNodesByType('inline-text');
      const firstText = textNodes[0];
      const lastText = textNodes[9];
      
      expect(dataStore.compareDocumentOrder(firstText.sid!, lastText.sid!)).toBe(-9);
      expect(dataStore.compareDocumentOrder(lastText.sid!, firstText.sid!)).toBe(9);
    });

    it('중간 노드들 간의 비교', () => {
      const textNodes = dataStore.findNodesByType('inline-text');
      const text3 = textNodes[2];
      const text7 = textNodes[6];
      
      expect(dataStore.compareDocumentOrder(text3.sid!, text7.sid!)).toBe(-4);
      expect(dataStore.compareDocumentOrder(text7.sid!, text3.sid!)).toBe(4);
    });
  });

  describe('에러 메시지 검증', () => {
    it('존재하지 않는 첫 번째 노드에 대한 명확한 에러 메시지', () => {
      dataStore.createNodeWithChildren({ stype: 'document' });
      const document = dataStore.getRootNode()!;
      
      expect(() => {
        dataStore.compareDocumentOrder('invalid-node-1', document.sid!);
      }).toThrow('Node not found: invalid-node-1');
    });

    it('존재하지 않는 두 번째 노드에 대한 명확한 에러 메시지', () => {
      dataStore.createNodeWithChildren({ stype: 'document' });
      const document = dataStore.getRootNode()!;
      
      expect(() => {
        dataStore.compareDocumentOrder(document.sid!, 'invalid-node-2');
      }).toThrow('Node not found: invalid-node-2');
    });

    it('존재하지 않는 두 노드에 대한 에러 메시지 (첫 번째 노드 우선)', () => {
      expect(() => {
        dataStore.compareDocumentOrder('invalid-node-1', 'invalid-node-2');
      }).toThrow('Node not found: invalid-node-1');
    });
  });
});
