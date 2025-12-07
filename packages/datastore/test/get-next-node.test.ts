import { describe, beforeEach, it, expect } from 'vitest';
import { DataStore } from '../src/data-store';
import { Schema } from '@barocss/schema';

describe('getNextNode', () => {
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
          group: 'text-style',
          attrs: {
            weight: { type: 'string', default: 'bold' }
          }
        },
        'italic': {
          name: 'italic',
          group: 'text-style',
          attrs: {
            style: { type: 'string', default: 'italic' }
          }
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

  describe('단순한 구조', () => {
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

    it('자식 노드가 있으면 첫 번째 자식 반환', () => {
      const document = dataStore.getRootNode()!;
      const paragraph = dataStore.findNodesByType('paragraph')[0];
      const text1 = dataStore.findNodesByType('inline-text')[0];
      
      expect(dataStore.getNextNode(document.sid!)).toBe(paragraph.sid);
      expect(dataStore.getNextNode(paragraph.sid!)).toBe(text1.sid);
    });

    it('형제 노드가 있으면 다음 형제 반환', () => {
      const textNodes = dataStore.findNodesByType('inline-text');
      const text1 = textNodes[0];
      const text2 = textNodes[1];
      
      expect(dataStore.getNextNode(text1.sid!)).toBe(text2.sid);
    });

    it('should return null for last node', () => {
      const textNodes = dataStore.findNodesByType('inline-text');
      const text2 = textNodes[1]; // Last text node
      
      expect(dataStore.getNextNode(text2.sid!)).toBeNull();
    });
  });

  describe('Complex nested structure', () => {
    beforeEach(() => {
      // document > [paragraph-1, paragraph-2, paragraph-3]
      // paragraph-1 > [text-1, text-2]
      // paragraph-2 > [text-3]
      // paragraph-3 > [text-4, text-5]
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
              { stype: 'inline-text', text: 'Para3-Text2' }
            ]
          }
        ]
      });
    });

    it('movement between paragraphs', () => {
      const textNodes = dataStore.findNodesByType('inline-text');
      const paragraphs = dataStore.findNodesByType('paragraph');
      const para1Text2 = textNodes[1]; // Para1-Text2
      const para2 = paragraphs[1]; // paragraph-2
      
      // Next of para1Text2 is paragraph-2
      expect(dataStore.getNextNode(para1Text2.sid!)).toBe(para2.sid);
    });

    it('move from paragraph node to first child', () => {
      const paragraphs = dataStore.findNodesByType('paragraph');
      const textNodes = dataStore.findNodesByType('inline-text');
      const para1 = paragraphs[0];
      const para1Text1 = textNodes[0];
      
      expect(dataStore.getNextNode(para1.sid!)).toBe(para1Text1.sid);
    });

    it('should return null for last node of document', () => {
      const textNodes = dataStore.findNodesByType('inline-text');
      const lastText = textNodes[4]; // Para3-Text2 (index 4)
      
      expect(dataStore.getNextNode(lastText.sid!)).toBeNull();
    });

    it('move from last node of paragraph to next paragraph', () => {
      const textNodes = dataStore.findNodesByType('inline-text');
      const paragraphs = dataStore.findNodesByType('paragraph');
      const para2Text1 = textNodes[2]; // Para2-Text1
      const para3 = paragraphs[2]; // paragraph-3
      
      // Next of para2Text1 is paragraph-3
      expect(dataStore.getNextNode(para2Text1.sid!)).toBe(para3.sid);
    });
  });

  describe('Deep nested structure', () => {
    beforeEach(() => {
      // document > paragraph-1 > [text-1, text-2, text-3]
      // document > paragraph-2 > [text-4]
      dataStore.createNodeWithChildren({
        stype: 'document',
        content: [
          {
            stype: 'paragraph',
            content: [
              { stype: 'inline-text', text: 'Para1-Text1' },
              { stype: 'inline-text', text: 'Para1-Text2' },
              { stype: 'inline-text', text: 'Para1-Text3' }
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

    it('movement in order in deep nesting', () => {
      const textNodes = dataStore.findNodesByType('inline-text');
      const paragraphs = dataStore.findNodesByType('paragraph');
      const para1Text1 = textNodes[0];
      const para1Text2 = textNodes[1];
      const para1Text3 = textNodes[2];
      const para2 = paragraphs[1]; // paragraph-2
      
      expect(dataStore.getNextNode(para1Text1.sid!)).toBe(para1Text2.sid);
      expect(dataStore.getNextNode(para1Text2.sid!)).toBe(para1Text3.sid);
      expect(dataStore.getNextNode(para1Text3.sid!)).toBe(para2.sid);
    });
  });

  describe('Edge cases', () => {
    it('존재하지 않는 노드 ID로 호출 시 에러 발생', () => {
      expect(() => {
        dataStore.getNextNode('non-existent');
      }).toThrow('Node not found: non-existent');
    });

    it('빈 문서에서 호출 시 에러 발생', () => {
      dataStore.createNodeWithChildren({ stype: 'document' });
      const document = dataStore.getRootNode()!;
      
      expect(dataStore.getNextNode(document.sid!)).toBeNull();
    });

    it('자식이 없는 리프 노드', () => {
      // document > paragraph > text
      dataStore.createNodeWithChildren({
        stype: 'document',
        content: [
          {
            stype: 'paragraph',
            content: [
              { stype: 'inline-text', text: 'Only text' }
            ]
          }
        ]
      });

      const textNode = dataStore.findNodesByType('inline-text')[0];
      expect(dataStore.getNextNode(textNode.sid!)).toBeNull();
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

    it('movement in order between inline-text nodes with various marks applied', () => {
      const allNodes = dataStore.getAllNodes();
      const inlineTextNodes = allNodes.filter(node => node.stype === 'inline-text');
      
      // Verify movement in order
      expect(dataStore.getNextNode(inlineTextNodes[0].sid!)).toBe(inlineTextNodes[1].sid);
      expect(dataStore.getNextNode(inlineTextNodes[1].sid!)).toBe(inlineTextNodes[2].sid);
      expect(dataStore.getNextNode(inlineTextNodes[2].sid!)).toBe(inlineTextNodes[3].sid);
      expect(dataStore.getNextNode(inlineTextNodes[3].sid!)).toBe(inlineTextNodes[4].sid);
      expect(dataStore.getNextNode(inlineTextNodes[4].sid!)).toBe(inlineTextNodes[5].sid);
      expect(dataStore.getNextNode(inlineTextNodes[5].sid!)).toBeNull();
    });

    it('paragraph에서 첫 번째 inline-text 노드로 이동', () => {
      const paragraph = dataStore.findNodesByType('paragraph')[0];
      const firstInline = dataStore.findNodesByType('inline-text')[0];
      
      expect(dataStore.getNextNode(paragraph.sid!)).toBe(firstInline.sid);
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

    it('movement between heading and paragraph', () => {
      const headings = dataStore.findNodesByType('heading');
      const paragraphs = dataStore.findNodesByType('paragraph');
      const textNodes = dataStore.findNodesByType('inline-text');
      
      // heading-1 -> text (child)
      expect(dataStore.getNextNode(headings[0].sid!)).toBe(textNodes[0].sid);
      
      // paragraph-1 -> text (child)
      expect(dataStore.getNextNode(paragraphs[0].sid!)).toBe(textNodes[1].sid);
      
      // heading-2 -> text (child)
      expect(dataStore.getNextNode(headings[1].sid!)).toBe(textNodes[2].sid);
    });

    it('movement of inline-text node inside heading', () => {
      const heading2 = dataStore.findNodesByType('heading')[1];
      const textNode = dataStore.findNodesByType('inline-text')[2];
      
      // heading-2 -> text
      expect(dataStore.getNextNode(heading2.sid!)).toBe(textNode.sid);
    });
  });

  describe('inline-text nodes with composite marks applied', () => {
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

    it('movement in order in structure with composite marks applied', () => {
      const allNodes = dataStore.getAllNodes();
      const inlineTextNodes = allNodes.filter(node => node.stype === 'inline-text');
      
      // Verify movement in order
      expect(dataStore.getNextNode(inlineTextNodes[0].sid!)).toBe(inlineTextNodes[1].sid);
      expect(dataStore.getNextNode(inlineTextNodes[1].sid!)).toBe(inlineTextNodes[2].sid);
      expect(dataStore.getNextNode(inlineTextNodes[2].sid!)).toBe(inlineTextNodes[3].sid);
      expect(dataStore.getNextNode(inlineTextNodes[3].sid!)).toBeNull();
    });
  });

  describe('Performance test', () => {
    beforeEach(() => {
      // Structure with many nodes
      const textNodes = Array.from({ length: 20 }, (_, i) => ({
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

    it('movement in order with many nodes', () => {
      const textNodes = dataStore.findNodesByType('inline-text');
      
      // Move in order from first to last
      let currentId = textNodes[0].sid!;
      for (let i = 1; i < textNodes.length; i++) {
        const nextId = dataStore.getNextNode(currentId);
        expect(nextId).toBe(textNodes[i].sid);
        currentId = nextId!;
      }
      
      // Last node is null
      expect(dataStore.getNextNode(currentId)).toBeNull();
    });
  });
});
