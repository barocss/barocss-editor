import { describe, beforeEach, it, expect } from 'vitest';
import { DataStore } from '../src/data-store';
import { Schema } from '@barocss/schema';

describe('getPreviousNode', () => {
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

  describe('단순한 구조', () => {
    beforeEach(() => {
      // document > paragraph > [text-1, text-2]
      dataStore.createNodeWithChildren({
        stype: 'document',
        content: [
          {
            stype: 'paragraph',
            content: [
              { stype: 'inline-text', text: 'First text' },
              { stype: 'inline-text', text: 'Second text' }
            ]
          }
        ]
      });
    });

    it('should return previous sibling if sibling exists', () => {
      const textNodes = dataStore.findNodesByType('inline-text');
      const firstText = textNodes[0];
      const secondText = textNodes[1];
      
      // Previous of second text is first text
      expect(dataStore.getPreviousNode(secondText.sid!)).toBe(firstText.sid);
    });

    it('should return parent for first sibling', () => {
      const textNodes = dataStore.findNodesByType('inline-text');
      const paragraph = dataStore.findNodesByType('paragraph')[0];
      const firstText = textNodes[0];
      
      // Previous of first text is parent paragraph
      expect(dataStore.getPreviousNode(firstText.sid!)).toBe(paragraph.sid);
    });

    it('previous of parent node is its parent', () => {
      const paragraph = dataStore.findNodesByType('paragraph')[0];
      const document = dataStore.findNodesByType('document')[0];
      
      // Previous of paragraph is document
      expect(dataStore.getPreviousNode(paragraph.sid!)).toBe(document.sid);
    });

    it('should return null for root node', () => {
      const document = dataStore.findNodesByType('document')[0];
      
      // Previous of document is null
      expect(dataStore.getPreviousNode(document.sid!)).toBeNull();
    });
  });

  describe('Complex nested structure', () => {
    beforeEach(() => {
      // document > [paragraph-1, paragraph-2]
      // paragraph-1 > [text-1, text-2]
      // paragraph-2 > [text-3]
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
          }
        ]
      });
    });

    it('movement between paragraphs', () => {
      const textNodes = dataStore.findNodesByType('inline-text');
      const paragraphs = dataStore.findNodesByType('paragraph');
      
      // Previous of Para2-Text1 is paragraph-2 (parent)
      expect(dataStore.getPreviousNode(textNodes[2].sid!)).toBe(paragraphs[1].sid);
      
      // Previous of Para1-Text2 is Para1-Text1
      expect(dataStore.getPreviousNode(textNodes[1].sid!)).toBe(textNodes[0].sid);
    });

    it('move from paragraph node to last child of previous paragraph', () => {
      const paragraphs = dataStore.findNodesByType('paragraph');
      const textNodes = dataStore.findNodesByType('inline-text');
      
      // Previous of paragraph-2 is last child of paragraph-1 (Para1-Text2)
      expect(dataStore.getPreviousNode(paragraphs[1].sid!)).toBe(textNodes[1].sid);
    });

    it('should return parent for first node of first paragraph', () => {
      const paragraphs = dataStore.findNodesByType('paragraph');
      const textNodes = dataStore.findNodesByType('inline-text');
      
      // Previous of Para1-Text1 is paragraph-1
      expect(dataStore.getPreviousNode(textNodes[0].sid!)).toBe(paragraphs[0].sid);
    });
  });

  describe('Deep nested structure', () => {
    beforeEach(() => {
      // document > paragraph > [text-1, text-2, text-3]
      dataStore.createNodeWithChildren({
        stype: 'document',
        content: [
          {
            stype: 'paragraph',
            content: [
              { stype: 'inline-text', text: 'Text-1' },
              { stype: 'inline-text', text: 'Text-2' },
              { stype: 'inline-text', text: 'Text-3' }
            ]
          }
        ]
      });
    });

    it('reverse movement in order in deep nesting', () => {
      const textNodes = dataStore.findNodesByType('inline-text');
      
      // Text-3 -> Text-2
      expect(dataStore.getPreviousNode(textNodes[2].sid!)).toBe(textNodes[1].sid);
      
      // Text-2 -> Text-1
      expect(dataStore.getPreviousNode(textNodes[1].sid!)).toBe(textNodes[0].sid);
      
      // Text-1 -> paragraph
      const paragraph = dataStore.findNodesByType('paragraph')[0];
      expect(dataStore.getPreviousNode(textNodes[0].sid!)).toBe(paragraph.sid);
    });
  });

  describe('Edge cases', () => {
    beforeEach(() => {
      dataStore.createNodeWithChildren({
        stype: 'document',
        content: [
          {
            stype: 'paragraph',
            content: [
              { stype: 'inline-text', text: 'Single text' }
            ]
          }
        ]
      });
    });

    it('존재하지 않는 노드 ID로 호출 시 에러 발생', () => {
      expect(() => {
        dataStore.getPreviousNode('non-existent-sid');
      }).toThrow('Node not found: non-existent-sid');
    });

    it('빈 문서에서 호출 시 에러 발생', () => {
      const emptyDataStore = new DataStore(undefined, schema);
      expect(() => {
        emptyDataStore.getPreviousNode('any-sid');
      }).toThrow('Node not found: any-sid');
    });

    it('behavior with single node', () => {
      const textNode = dataStore.findNodesByType('inline-text')[0];
      const paragraph = dataStore.findNodesByType('paragraph')[0];
      
      // Previous of single text is parent paragraph
      expect(dataStore.getPreviousNode(textNode.sid!)).toBe(paragraph.sid);
    });
  });

  describe('inline-text nodes with various marks applied', () => {
    beforeEach(() => {
      // document > paragraph > [text, bold-text, italic-text, link-text, code-text, text]
      dataStore.createNodeWithChildren({
        stype: 'document',
        content: [
          {
            stype: 'paragraph',
            content: [
              { stype: 'inline-text', text: 'Hello ' },
              { stype: 'inline-text', text: 'World', marks: [{ stype: 'bold', range: [0, 5] }] },
              { stype: 'inline-text', text: ' and ' },
              { stype: 'inline-text', text: 'Click here', marks: [{ stype: 'link', range: [0, 10], attrs: { href: 'https://example.com' } }] },
              { stype: 'inline-text', text: 'const x = 1;', marks: [{ stype: 'code', range: [0, 11] }] },
              { stype: 'inline-text', text: ' end' }
            ]
          }
        ]
      });
    });

    it('reverse movement between inline-text nodes with various marks applied', () => {
      const allNodes = dataStore.getAllNodes();
      const inlineTextNodes = allNodes.filter(node => node.stype === 'inline-text');
      
      // Verify reverse movement
      expect(dataStore.getPreviousNode(inlineTextNodes[5].sid!)).toBe(inlineTextNodes[4].sid);
      expect(dataStore.getPreviousNode(inlineTextNodes[4].sid!)).toBe(inlineTextNodes[3].sid);
      expect(dataStore.getPreviousNode(inlineTextNodes[3].sid!)).toBe(inlineTextNodes[2].sid);
      expect(dataStore.getPreviousNode(inlineTextNodes[2].sid!)).toBe(inlineTextNodes[1].sid);
      expect(dataStore.getPreviousNode(inlineTextNodes[1].sid!)).toBe(inlineTextNodes[0].sid);
      expect(dataStore.getPreviousNode(inlineTextNodes[0].sid!)).toBeTruthy(); // paragraph
    });
  });

  describe('heading and paragraph mix', () => {
    beforeEach(() => {
      // document > [heading, paragraph, heading, paragraph]
      dataStore.createNodeWithChildren({
        stype: 'document',
        content: [
          {
            stype: 'heading',
            attributes: { level: 1 },
            content: [
              { stype: 'inline-text', text: 'Chapter 1' }
            ]
          },
          {
            stype: 'paragraph',
            content: [
              { stype: 'inline-text', text: 'This is the first paragraph.' }
            ]
          },
          {
            stype: 'heading',
            attributes: { level: 2 },
            content: [
              { stype: 'inline-text', text: 'Subsection', marks: [{ stype: 'bold', range: [0, 10] }] }
            ]
          },
          {
            stype: 'paragraph',
            content: [
              { stype: 'inline-text', text: 'This is the second paragraph.' }
            ]
          }
        ]
      });
    });

    it('reverse movement between heading and paragraph', () => {
      const headings = dataStore.findNodesByType('heading');
      const paragraphs = dataStore.findNodesByType('paragraph');
      const textNodes = dataStore.findNodesByType('inline-text');
      
      // Previous of paragraph-2 is last descendant of heading-2 (text)
      expect(dataStore.getPreviousNode(paragraphs[1].sid!)).toBe(textNodes[2].sid);
      
      // Previous of heading-2 is last descendant of paragraph-1 (text)
      expect(dataStore.getPreviousNode(headings[1].sid!)).toBe(textNodes[1].sid);
      
      // Previous of paragraph-1 is last descendant of heading-1 (text)
      expect(dataStore.getPreviousNode(paragraphs[0].sid!)).toBe(textNodes[0].sid);
    });

    it('reverse movement of inline-text node inside heading', () => {
      const heading2 = dataStore.findNodesByType('heading')[1];
      const textNode = dataStore.findNodesByType('inline-text')[2];
      
      // Previous of heading-2 is paragraph-1
      expect(dataStore.getPreviousNode(heading2.sid!)).toBeTruthy();
    });
  });

  describe('복합 마크가 적용된 inline-text 노드들', () => {
    beforeEach(() => {
      // document > paragraph > [text, bold+italic text, link text, text]
      dataStore.createNodeWithChildren({
        stype: 'document',
        content: [
          {
            stype: 'paragraph',
            content: [
              { stype: 'inline-text', text: 'Start ' },
              { 
                stype: 'inline-text', 
                text: 'nested text', 
                marks: [
                  { stype: 'bold', range: [0, 12] },
                  { stype: 'italic', range: [0, 12] }
                ]
              },
              { 
                stype: 'inline-text', 
                text: 'click me', 
                marks: [
                  { stype: 'link', range: [0, 8], attrs: { href: 'https://example.com' } }
                ]
              },
              { stype: 'inline-text', text: ' end' }
            ]
          }
        ]
      });
    });

    it('복합 마크가 적용된 구조에서 역순 이동', () => {
      const allNodes = dataStore.getAllNodes();
      const inlineTextNodes = allNodes.filter(node => node.stype === 'inline-text');
      
      // Verify reverse order movement
      expect(dataStore.getPreviousNode(inlineTextNodes[3].sid!)).toBe(inlineTextNodes[2].sid);
      expect(dataStore.getPreviousNode(inlineTextNodes[2].sid!)).toBe(inlineTextNodes[1].sid);
      expect(dataStore.getPreviousNode(inlineTextNodes[1].sid!)).toBe(inlineTextNodes[0].sid);
      expect(dataStore.getPreviousNode(inlineTextNodes[0].sid!)).toBeTruthy(); // paragraph
    });
  });

  describe('getNextNode와의 대칭성 검증', () => {
    beforeEach(() => {
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

    it('getNextNode와 getPreviousNode는 대칭적', () => {
      const textNodes = dataStore.findNodesByType('inline-text');
      
      // If A -> B, then B -> A must be true
      const firstToSecond = dataStore.getNextNode(textNodes[0].sid!);
      expect(firstToSecond).toBe(textNodes[1].sid);
      
      const secondToFirst = dataStore.getPreviousNode(textNodes[1].sid!);
      expect(secondToFirst).toBe(textNodes[0].sid);
      
      // If B -> C, then C -> B must be true
      const secondToThird = dataStore.getNextNode(textNodes[1].sid!);
      expect(secondToThird).toBe(textNodes[2].sid);
      
      const thirdToSecond = dataStore.getPreviousNode(textNodes[2].sid!);
      expect(thirdToSecond).toBe(textNodes[1].sid);
    });
  });
});
