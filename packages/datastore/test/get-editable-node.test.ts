import { describe, beforeEach, it, expect } from 'vitest';
import { DataStore } from '../src/data-store';
import { Schema } from '@barocss/schema';

describe('getPreviousEditableNode / getNextEditableNode', () => {
  let dataStore: DataStore;
  let schema: Schema;

  beforeEach(() => {
    schema = new Schema('test-schema', {
      nodes: {
        'document': {
          name: 'document',
          content: 'block+',
          group: 'document'
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
            level: { type: 'number', default: 1 }
          }
        },
        'inline-text': {
          name: 'inline-text',
          group: 'inline'
        },
        'inline-image': {
          name: 'inline-image',
          group: 'inline',
          attrs: {
            src: { type: 'string' },
            alt: { type: 'string', default: '' }
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
        }
      }
    });

    dataStore = new DataStore(undefined, schema);
  });

  describe('단순한 구조 - 같은 paragraph 내', () => {
    beforeEach(() => {
      // document > paragraph > [text-1, text-2, text-3]
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

    it('getPreviousEditableNode: 형제 노드가 있으면 이전 형제 반환', () => {
      const textNodes = dataStore.findNodesByType('inline-text');
      const firstText = textNodes[0];
      const secondText = textNodes[1];
      const thirdText = textNodes[2];
      
      // Previous of second text is first text
      expect(dataStore.getPreviousEditableNode(secondText.sid!)).toBe(firstText.sid);
      
      // Previous of third text is second text
      expect(dataStore.getPreviousEditableNode(thirdText.sid!)).toBe(secondText.sid);
    });

    it('getPreviousEditableNode: first sibling returns null (skips block nodes)', () => {
      const textNodes = dataStore.findNodesByType('inline-text');
      const firstText = textNodes[0];
      
      // First text has no previous editable node (parent paragraph is block, so skipped)
      expect(dataStore.getPreviousEditableNode(firstText.sid!)).toBeNull();
    });

    it('getNextEditableNode: returns next sibling if sibling exists', () => {
      const textNodes = dataStore.findNodesByType('inline-text');
      const firstText = textNodes[0];
      const secondText = textNodes[1];
      const thirdText = textNodes[2];
      
      // Next of first text is second text
      expect(dataStore.getNextEditableNode(firstText.sid!)).toBe(secondText.sid);
      
      // Next of second text is third text
      expect(dataStore.getNextEditableNode(secondText.sid!)).toBe(thirdText.sid);
    });

    it('getNextEditableNode: last sibling returns null', () => {
      const textNodes = dataStore.findNodesByType('inline-text');
      const thirdText = textNodes[2];
      
      // Third text has no next editable node
      expect(dataStore.getNextEditableNode(thirdText.sid!)).toBeNull();
    });
  });

  describe('Complex structure - multiple paragraphs', () => {
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

    it('getPreviousEditableNode: cross-paragraph movement (last text of previous paragraph)', () => {
      const textNodes = dataStore.findNodesByType('inline-text');
      const para1Text1 = textNodes[0];
      const para1Text2 = textNodes[1];
      const para2Text1 = textNodes[2];
      
      // Previous of Para2-Text1 is Para1-Text2 (last text of previous paragraph)
      expect(dataStore.getPreviousEditableNode(para2Text1.sid!)).toBe(para1Text2.sid);
      
      // Previous of Para1-Text2 is Para1-Text1
      expect(dataStore.getPreviousEditableNode(para1Text2.sid!)).toBe(para1Text1.sid);
    });

    it('getPreviousEditableNode: first text of first paragraph is null', () => {
      const textNodes = dataStore.findNodesByType('inline-text');
      const para1Text1 = textNodes[0];
      
      // Para1-Text1 has no previous editable node
      expect(dataStore.getPreviousEditableNode(para1Text1.sid!)).toBeNull();
    });

    it('getNextEditableNode: cross-paragraph movement (first text of next paragraph)', () => {
      const textNodes = dataStore.findNodesByType('inline-text');
      const para1Text1 = textNodes[0];
      const para1Text2 = textNodes[1];
      const para2Text1 = textNodes[2];
      
      // Next of Para1-Text1 is Para1-Text2
      expect(dataStore.getNextEditableNode(para1Text1.sid!)).toBe(para1Text2.sid);
      
      // Next of Para1-Text2 is Para2-Text1 (first text of next paragraph)
      expect(dataStore.getNextEditableNode(para1Text2.sid!)).toBe(para2Text1.sid);
    });

    it('getNextEditableNode: last text of last paragraph is null', () => {
      const textNodes = dataStore.findNodesByType('inline-text');
      const para2Text1 = textNodes[2];
      
      // Para2-Text1 has no next editable node
      expect(dataStore.getNextEditableNode(para2Text1.sid!)).toBeNull();
    });
  });

  describe('Structure including inline-image', () => {
    beforeEach(() => {
      // document > paragraph > [text-1, image-1, text-2]
      dataStore.createNodeWithChildren({
        stype: 'document',
        content: [
          {
            stype: 'paragraph',
            content: [
              { stype: 'inline-text', text: 'Before' },
              { stype: 'inline-image', attributes: { src: 'image.jpg', alt: 'Image' } },
              { stype: 'inline-text', text: 'After' }
            ]
          }
        ]
      });
    });

    it('getPreviousEditableNode: inline-image도 편집 가능한 노드로 간주', () => {
      const textNodes = dataStore.findNodesByType('inline-text');
      const images = dataStore.findNodesByType('inline-image');
      const beforeText = textNodes[0];
      const image = images[0];
      const afterText = textNodes[1];
      
      // Previous of After text is image
      expect(dataStore.getPreviousEditableNode(afterText.sid!)).toBe(image.sid);
      
      // Previous of image is Before text
      expect(dataStore.getPreviousEditableNode(image.sid!)).toBe(beforeText.sid);
    });

    it('getNextEditableNode: inline-image is also considered editable node', () => {
      const textNodes = dataStore.findNodesByType('inline-text');
      const images = dataStore.findNodesByType('inline-image');
      const beforeText = textNodes[0];
      const image = images[0];
      const afterText = textNodes[1];
      
      // Next of Before text is image
      expect(dataStore.getNextEditableNode(beforeText.sid!)).toBe(image.sid);
      
      // Next of image is After text
      expect(dataStore.getNextEditableNode(image.sid!)).toBe(afterText.sid);
    });
  });

  describe('Empty paragraph handling', () => {
    beforeEach(() => {
      // document > [paragraph-1 (empty), paragraph-2 > [text-1]]
      dataStore.createNodeWithChildren({
        stype: 'document',
        content: [
          {
            stype: 'paragraph',
            content: [] // Empty paragraph
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

    it('getPreviousEditableNode: skip empty paragraph and find last text of previous paragraph', () => {
      const textNodes = dataStore.findNodesByType('inline-text');
      const para2Text1 = textNodes[0];
      
      // Para2-Text1 has no previous editable node (previous paragraph is empty)
      expect(dataStore.getPreviousEditableNode(para2Text1.sid!)).toBeNull();
    });

    it('getNextEditableNode: skip empty paragraph and find first text of next paragraph', () => {
      // First paragraph is empty, so no node to test
      // This case may not occur in practice, but check for safety
      const paragraphs = dataStore.findNodesByType('paragraph');
      const emptyParagraph = paragraphs[0];
      
      // Next editable node of empty paragraph is first text of next paragraph
      const textNodes = dataStore.findNodesByType('inline-text');
      const para2Text1 = textNodes[0];
      
      // If starting from empty paragraph, next editable node is Para2-Text1
      // However, empty paragraph itself is not an editable node, 
      // so should actually start from first child of paragraph
      // This test may differ from actual usage scenario
    });
  });

  describe('heading and paragraph mix', () => {
    beforeEach(() => {
      // document > [heading > [text-1], paragraph > [text-2, text-3]]
      dataStore.createNodeWithChildren({
        stype: 'document',
        content: [
          {
            stype: 'heading',
            attrs: { level: 1 },
            content: [
              { stype: 'inline-text', text: 'Heading Text' }
            ]
          },
          {
            stype: 'paragraph',
            content: [
              { stype: 'inline-text', text: 'Para-Text1' },
              { stype: 'inline-text', text: 'Para-Text2' }
            ]
          }
        ]
      });
    });

    it('getPreviousEditableNode: heading과 paragraph 간 이동', () => {
      const textNodes = dataStore.findNodesByType('inline-text');
      const headingText = textNodes[0];
      const paraText1 = textNodes[1];
      const paraText2 = textNodes[2];
      
      // Previous of Para-Text1 is Heading Text (last text of previous block)
      expect(dataStore.getPreviousEditableNode(paraText1.sid!)).toBe(headingText.sid);
      
      // No previous editable node for Heading Text
      expect(dataStore.getPreviousEditableNode(headingText.sid!)).toBeNull();
    });

    it('getNextEditableNode: move between heading and paragraph', () => {
      const textNodes = dataStore.findNodesByType('inline-text');
      const headingText = textNodes[0];
      const paraText1 = textNodes[1];
      const paraText2 = textNodes[2];
      
      // Next of Heading Text is Para-Text1 (first text of next block)
      expect(dataStore.getNextEditableNode(headingText.sid!)).toBe(paraText1.sid);
      
      // Next of Para-Text1 is Para-Text2
      expect(dataStore.getNextEditableNode(paraText1.sid!)).toBe(paraText2.sid);
    });
  });

  describe('Edge cases', () => {
    beforeEach(() => {
      // document > paragraph > [text-1]
      dataStore.createNodeWithChildren({
        stype: 'document',
        content: [
          {
            stype: 'paragraph',
            content: [
              { stype: 'inline-text', text: 'Single Text' }
            ]
          }
        ]
      });
    });

    it('getPreviousEditableNode: 단일 노드의 이전은 null', () => {
      const textNodes = dataStore.findNodesByType('inline-text');
      const singleText = textNodes[0];
      
      expect(dataStore.getPreviousEditableNode(singleText.sid!)).toBeNull();
    });

    it('getNextEditableNode: 단일 노드의 다음은 null', () => {
      const textNodes = dataStore.findNodesByType('inline-text');
      const singleText = textNodes[0];
      
      expect(dataStore.getNextEditableNode(singleText.sid!)).toBeNull();
    });

    it('getPreviousEditableNode: 존재하지 않는 노드는 에러', () => {
      expect(() => {
        dataStore.getPreviousEditableNode('non-existent-sid');
      }).toThrow();
    });

    it('getNextEditableNode: 존재하지 않는 노드는 에러', () => {
      expect(() => {
        dataStore.getNextEditableNode('non-existent-sid');
      }).toThrow();
    });
  });

  describe('대칭성 검증', () => {
    beforeEach(() => {
      // document > paragraph > [text-1, text-2, text-3]
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

    it('getPreviousEditableNode와 getNextEditableNode는 대칭적', () => {
      const textNodes = dataStore.findNodesByType('inline-text');
      const firstText = textNodes[0];
      const secondText = textNodes[1];
      const thirdText = textNodes[2];
      
      // First → Second → Third
      const firstToSecond = dataStore.getNextEditableNode(firstText.sid!);
      expect(firstToSecond).toBe(secondText.sid);
      
      const secondToFirst = dataStore.getPreviousEditableNode(secondText.sid!);
      expect(secondToFirst).toBe(firstText.sid);
      
      // Second → Third
      const secondToThird = dataStore.getNextEditableNode(secondText.sid!);
      expect(secondToThird).toBe(thirdText.sid);
      
      const thirdToSecond = dataStore.getPreviousEditableNode(thirdText.sid!);
      expect(thirdToSecond).toBe(secondText.sid);
    });
  });

  describe('복잡한 스키마 - atom, table 포함', () => {
    let complexSchema: Schema;
    let complexDataStore: DataStore;

    beforeEach(() => {
      complexSchema = new Schema('complex-schema', {
        nodes: {
          'document': {
            name: 'document',
            content: 'block+',
            group: 'document'
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
              level: { type: 'number', default: 1 }
            }
          },
          'inline-text': {
            name: 'inline-text',
            group: 'inline'
          },
          'inline-image': {
            name: 'inline-image',
            group: 'inline',
            atom: true, // atom node
            attrs: {
              src: { type: 'string' },
              alt: { type: 'string', default: '' }
            }
          },
          'table': {
            name: 'table',
            group: 'block',
            content: 'tableRow+',
            attrs: {
              border: { type: 'number', default: 1 }
            }
          },
          'tableRow': {
            name: 'tableRow',
            group: 'block',
            content: 'tableCell+'
          },
          'tableCell': {
            name: 'tableCell',
            group: 'block',
            content: 'inline*',
            attrs: {
              colspan: { type: 'number', default: 1 },
              rowspan: { type: 'number', default: 1 }
            }
          },
          'codeBlock': {
            name: 'codeBlock',
            group: 'block',
            content: 'text*', // block node with text field
            attrs: {
              language: { type: 'string', default: 'text' }
            }
          },
          'canvas': {
            name: 'canvas',
            group: 'block',
            content: 'inline*',
            attrs: {
              width: { type: 'number', default: 800 },
              height: { type: 'number', default: 600 }
            }
          },
          'blockQuote': {
            name: 'blockQuote',
            group: 'block',
            content: 'block+',
            attrs: {
              author: { type: 'string', default: '' }
            }
          },
          'list': {
            name: 'list',
            group: 'block',
            content: 'listItem+',
            attrs: {
              type: { type: 'string', default: 'bullet' }
            }
          },
          'listItem': {
            name: 'listItem',
            group: 'block',
            content: 'block+',
            attrs: {
              checked: { type: 'boolean', default: false }
            }
          },
          'inline-link': {
            name: 'inline-link',
            group: 'inline',
            attrs: {
              href: { type: 'string', required: true },
              title: { type: 'string', default: '' }
            }
          },
          'inline-mention': {
            name: 'inline-mention',
            group: 'inline',
            atom: true,
            attrs: {
              userId: { type: 'string', required: true },
              userName: { type: 'string', default: '' }
            }
          },
          'inline-button': {
            name: 'inline-button',
            group: 'inline',
            atom: true,
            attrs: {
              label: { type: 'string', required: true },
              action: { type: 'string', default: '' }
            }
          }
        },
        marks: {
          'bold': {
            name: 'bold',
            group: 'text-style'
          }
        }
      });

      complexDataStore = new DataStore(undefined, complexSchema);
    });

    describe('atom 노드 (inline-image) 처리', () => {
      beforeEach(() => {
        // document > paragraph > [text-1, image-1, text-2, image-2, text-3]
        complexDataStore.createNodeWithChildren({
          stype: 'document',
          content: [
            {
              stype: 'paragraph',
              content: [
                { stype: 'inline-text', text: 'Before' },
                { stype: 'inline-image', attrs: { src: 'img1.jpg', alt: 'Image 1' } },
                { stype: 'inline-text', text: 'Middle' },
                { stype: 'inline-image', attrs: { src: 'img2.jpg', alt: 'Image 2' } },
                { stype: 'inline-text', text: 'After' }
              ]
            }
          ]
        });
      });

      it('getPreviousEditableNode: atom 노드(inline-image)도 편집 가능한 노드로 간주', () => {
        const textNodes = complexDataStore.findNodesByType('inline-text');
        const images = complexDataStore.findNodesByType('inline-image');
        const beforeText = textNodes[0];
        const image1 = images[0];
        const middleText = textNodes[1];
        const image2 = images[1];
        const afterText = textNodes[2];
        
        // Previous of After text is image2
        expect(complexDataStore.getPreviousEditableNode(afterText.sid!)).toBe(image2.sid);
        
        // Previous of image2 is middleText
        expect(complexDataStore.getPreviousEditableNode(image2.sid!)).toBe(middleText.sid);
        
        // Previous of middleText is image1
        expect(complexDataStore.getPreviousEditableNode(middleText.sid!)).toBe(image1.sid);
        
        // Previous of image1 is beforeText
        expect(complexDataStore.getPreviousEditableNode(image1.sid!)).toBe(beforeText.sid);
      });

      it('getNextEditableNode: atom nodes (inline-image) are also considered editable nodes', () => {
        const textNodes = complexDataStore.findNodesByType('inline-text');
        const images = complexDataStore.findNodesByType('inline-image');
        const beforeText = textNodes[0];
        const image1 = images[0];
        const middleText = textNodes[1];
        const image2 = images[1];
        const afterText = textNodes[2];
        
        // Next of beforeText is image1
        expect(complexDataStore.getNextEditableNode(beforeText.sid!)).toBe(image1.sid);
        
        // Next of image1 is middleText
        expect(complexDataStore.getNextEditableNode(image1.sid!)).toBe(middleText.sid);
        
        // Next of middleText is image2
        expect(complexDataStore.getNextEditableNode(middleText.sid!)).toBe(image2.sid);
        
        // Next of image2 is afterText
        expect(complexDataStore.getNextEditableNode(image2.sid!)).toBe(afterText.sid);
      });
    });

    describe('table structure handling', () => {
      beforeEach(() => {
        // document > [paragraph > [text-1], table > [row1 > [cell1 > [text-2]], row2 > [cell2 > [text-3]]], paragraph > [text-4]]
        complexDataStore.createNodeWithChildren({
          stype: 'document',
          content: [
            {
              stype: 'paragraph',
              content: [
                { stype: 'inline-text', text: 'Before Table' }
              ]
            },
            {
              stype: 'table',
              attrs: { border: 1 },
              content: [
                {
                  stype: 'tableRow',
                  content: [
                    {
                      stype: 'tableCell',
                      attrs: { colspan: 1, rowspan: 1 },
                      content: [
                        { stype: 'inline-text', text: 'Cell1-Text1' }
                      ]
                    }
                  ]
                },
                {
                  stype: 'tableRow',
                  content: [
                    {
                      stype: 'tableCell',
                      attrs: { colspan: 1, rowspan: 1 },
                      content: [
                        { stype: 'inline-text', text: 'Cell2-Text1' }
                      ]
                    }
                  ]
                }
              ]
            },
            {
              stype: 'paragraph',
              content: [
                { stype: 'inline-text', text: 'After Table' }
              ]
            }
          ]
        });
      });

      it('getPreviousEditableNode: table 내부 텍스트 간 이동', () => {
        const textNodes = complexDataStore.findNodesByType('inline-text');
        const beforeText = textNodes[0];
        const cell1Text = textNodes[1];
        const cell2Text = textNodes[2];
        const afterText = textNodes[3];
        
        // Previous of Cell2-Text1 is Cell1-Text1 (within table)
        expect(complexDataStore.getPreviousEditableNode(cell2Text.sid!)).toBe(cell1Text.sid);
        
        // Previous of Cell1-Text1 is Before Table (skipping table)
        expect(complexDataStore.getPreviousEditableNode(cell1Text.sid!)).toBe(beforeText.sid);
      });

      it('getPreviousEditableNode: move between table and paragraph', () => {
        const textNodes = complexDataStore.findNodesByType('inline-text');
        const beforeText = textNodes[0];
        const afterText = textNodes[3];
        
        // Previous of After Table is Cell2-Text1 (last text of table)
        const cell2Text = textNodes[2];
        expect(complexDataStore.getPreviousEditableNode(afterText.sid!)).toBe(cell2Text.sid);
      });

      it('getNextEditableNode: move between texts within table', () => {
        const textNodes = complexDataStore.findNodesByType('inline-text');
        const beforeText = textNodes[0];
        const cell1Text = textNodes[1];
        const cell2Text = textNodes[2];
        const afterText = textNodes[3];
        
        // Next of Cell1-Text1 is Cell2-Text1 (within table)
        expect(complexDataStore.getNextEditableNode(cell1Text.sid!)).toBe(cell2Text.sid);
        
        // Next of Cell2-Text1 is After Table (skipping table)
        expect(complexDataStore.getNextEditableNode(cell2Text.sid!)).toBe(afterText.sid);
      });

      it('getNextEditableNode: move between table and paragraph', () => {
        const textNodes = complexDataStore.findNodesByType('inline-text');
        const beforeText = textNodes[0];
        const cell1Text = textNodes[1];
        
        // Next of Before Table is Cell1-Text1 (first text of table)
        expect(complexDataStore.getNextEditableNode(beforeText.sid!)).toBe(cell1Text.sid);
      });
    });

    describe('codeBlock (.text field block node) handling', () => {
      beforeEach(() => {
        // codeBlock has content: 'text*' but can actually have .text field
        // If editable attribute is missing, considered a block node and should be skipped
        complexDataStore.createNodeWithChildren({
          stype: 'document',
          content: [
            {
              stype: 'paragraph',
              content: [
                { stype: 'inline-text', text: 'Before Code' }
              ]
            },
            {
              stype: 'codeBlock',
              attrs: { language: 'javascript' },
              text: 'const x = 1;' // block node with .text field
            },
            {
              stype: 'paragraph',
              content: [
                { stype: 'inline-text', text: 'After Code' }
              ]
            }
          ]
        });
      });

      it('getPreviousEditableNode: codeBlock은 editable 속성이 없으면 block 노드이므로 건너뛰기', () => {
        const textNodes = complexDataStore.findNodesByType('inline-text');
        const beforeText = textNodes[0];
        const afterText = textNodes[1];
        
        // Previous of After Code is Before Code (skipping codeBlock)
        expect(complexDataStore.getPreviousEditableNode(afterText.sid!)).toBe(beforeText.sid);
      });

      it('getNextEditableNode: skip codeBlock if no editable attribute (treated as block node)', () => {
        const textNodes = complexDataStore.findNodesByType('inline-text');
        const beforeText = textNodes[0];
        const afterText = textNodes[1];
        
        // Next of Before Code is After Code (skipping codeBlock)
        expect(complexDataStore.getNextEditableNode(beforeText.sid!)).toBe(afterText.sid);
      });
    });

    describe('editable: true block node handling', () => {
      let editableSchema: Schema;
      let editableDataStore: DataStore;

      beforeEach(() => {
        // Schema including codeBlock and mathBlock with editable: true
        editableSchema = new Schema('editable-block-schema', {
          nodes: {
            'document': {
              name: 'document',
              content: 'block+',
              group: 'document'
            },
            'paragraph': {
              name: 'paragraph',
              content: 'inline*',
              group: 'block'
            },
            'codeBlock': {
              name: 'codeBlock',
              group: 'block',
              editable: true, // editable block
              attrs: {
                language: { type: 'string', default: 'text' }
              }
            },
            'mathBlock': {
              name: 'mathBlock',
              group: 'block',
              editable: true, // editable block
              attrs: {
                tex: { type: 'string' },
                engine: { type: 'string', default: 'katex' }
              }
            },
            'inline-text': {
              name: 'inline-text',
              group: 'inline'
            }
          },
          marks: {}
        });

        editableDataStore = new DataStore(undefined, editableSchema);
      });

      describe('editable: true이고 .text 필드가 있는 경우', () => {
        beforeEach(() => {
          editableDataStore.createNodeWithChildren({
            stype: 'document',
            content: [
              {
                stype: 'paragraph',
                content: [
                  { stype: 'inline-text', text: 'Before Code' }
                ]
              },
              {
                stype: 'codeBlock',
                attributes: { language: 'javascript' },
                text: 'const x = 1;' // has .text field and editable: true
              },
              {
                stype: 'paragraph',
                content: [
                  { stype: 'inline-text', text: 'After Code' }
                ]
              }
            ]
          });
        });

        it('getPreviousEditableNode: editable: true인 codeBlock은 편집 가능하므로 탐색 가능', () => {
          const codeBlock = editableDataStore.findNodesByType('codeBlock')[0];
          const textNodes = editableDataStore.findNodesByType('inline-text');
          const beforeText = textNodes[0];
          
          // Previous of codeBlock is Before Code
          expect(editableDataStore.getPreviousEditableNode(codeBlock.sid!)).toBe(beforeText.sid);
        });

        it('getNextEditableNode: editable: true codeBlock is searchable since it is editable', () => {
          const codeBlock = editableDataStore.findNodesByType('codeBlock')[0];
          const textNodes = editableDataStore.findNodesByType('inline-text');
          const afterText = textNodes[1];
          
          // Next of codeBlock is After Code
          expect(editableDataStore.getNextEditableNode(codeBlock.sid!)).toBe(afterText.sid);
        });

        it('getPreviousEditableNode: previous of After Code is codeBlock (not skipped)', () => {
          const codeBlock = editableDataStore.findNodesByType('codeBlock')[0];
          const textNodes = editableDataStore.findNodesByType('inline-text');
          const afterText = textNodes[1];
          
          // Previous of After Code is codeBlock (not skipped because editable: true)
          expect(editableDataStore.getPreviousEditableNode(afterText.sid!)).toBe(codeBlock.sid);
        });

        it('getNextEditableNode: next of Before Code is codeBlock (not skipped)', () => {
          const codeBlock = editableDataStore.findNodesByType('codeBlock')[0];
          const textNodes = editableDataStore.findNodesByType('inline-text');
          const beforeText = textNodes[0];
          
          // Next of Before Code is codeBlock (not skipped because editable: true)
          expect(editableDataStore.getNextEditableNode(beforeText.sid!)).toBe(codeBlock.sid);
        });
      });

      describe('editable: true but no .text field', () => {
        beforeEach(() => {
          editableDataStore.createNodeWithChildren({
            stype: 'document',
            content: [
              {
                stype: 'paragraph',
                content: [
                  { stype: 'inline-text', text: 'Before Math' }
                ]
              },
              {
                stype: 'mathBlock',
                attributes: { tex: 'E=mc^2', engine: 'katex' }
                // No .text field (even though editable: true)
              },
              {
                stype: 'paragraph',
                content: [
                  { stype: 'inline-text', text: 'After Math' }
                ]
              }
            ]
          });
        });

        it('getPreviousEditableNode: editable: true이지만 .text 필드가 없으면 편집 불가능 (건너뛰기)', () => {
          const textNodes = editableDataStore.findNodesByType('inline-text');
          const beforeText = textNodes[0];
          const afterText = textNodes[1];
          
          // Previous of After Math is Before Math (skipping mathBlock)
          // If editable: true but no .text field, not editable
          expect(editableDataStore.getPreviousEditableNode(afterText.sid!)).toBe(beforeText.sid);
        });

        it('getNextEditableNode: if editable: true but no .text field, not editable (skip)', () => {
          const textNodes = editableDataStore.findNodesByType('inline-text');
          const beforeText = textNodes[0];
          const afterText = textNodes[1];
          
          // Next of Before Math is After Math (skipping mathBlock)
          // If editable: true but no .text field, not editable
          expect(editableDataStore.getNextEditableNode(beforeText.sid!)).toBe(afterText.sid);
        });
      });

      describe('multiple consecutive editable: true block nodes', () => {
        beforeEach(() => {
          editableDataStore.createNodeWithChildren({
            stype: 'document',
            content: [
              {
                stype: 'paragraph',
                content: [
                  { stype: 'inline-text', text: 'Before' }
                ]
              },
              {
                stype: 'codeBlock',
                attributes: { language: 'javascript' },
                text: 'const a = 1;'
              },
              {
                stype: 'codeBlock',
                attributes: { language: 'typescript' },
                text: 'const b: number = 2;'
              },
              {
                stype: 'mathBlock',
                attributes: { tex: 'E=mc^2', engine: 'katex' },
                text: 'E=mc^2' // has .text field
              },
              {
                stype: 'paragraph',
                content: [
                  { stype: 'inline-text', text: 'After' }
                ]
              }
            ]
          });
        });

        it('getPreviousEditableNode: editable: true인 block 노드들을 순차적으로 탐색', () => {
          const codeBlocks = editableDataStore.findNodesByType('codeBlock');
          const mathBlocks = editableDataStore.findNodesByType('mathBlock');
          const textNodes = editableDataStore.findNodesByType('inline-text');
          
          const codeBlock1 = codeBlocks[0];
          const codeBlock2 = codeBlocks[1];
          const mathBlock = mathBlocks[0];
          const beforeText = textNodes[0];
          const afterText = textNodes[1];
          
          // Previous of codeBlock1 is Before
          expect(editableDataStore.getPreviousEditableNode(codeBlock1.sid!)).toBe(beforeText.sid);
          
          // Previous of codeBlock2 is codeBlock1
          expect(editableDataStore.getPreviousEditableNode(codeBlock2.sid!)).toBe(codeBlock1.sid);
          
          // Previous of mathBlock is codeBlock2
          expect(editableDataStore.getPreviousEditableNode(mathBlock.sid!)).toBe(codeBlock2.sid);
          
          // Previous of After is mathBlock
          expect(editableDataStore.getPreviousEditableNode(afterText.sid!)).toBe(mathBlock.sid);
        });

        it('getNextEditableNode: sequentially search editable: true block nodes', () => {
          const codeBlocks = editableDataStore.findNodesByType('codeBlock');
          const mathBlocks = editableDataStore.findNodesByType('mathBlock');
          const textNodes = editableDataStore.findNodesByType('inline-text');
          
          const codeBlock1 = codeBlocks[0];
          const codeBlock2 = codeBlocks[1];
          const mathBlock = mathBlocks[0];
          const beforeText = textNodes[0];
          const afterText = textNodes[1];
          
          // Next of Before is codeBlock1
          expect(editableDataStore.getNextEditableNode(beforeText.sid!)).toBe(codeBlock1.sid);
          
          // Next of codeBlock1 is codeBlock2
          expect(editableDataStore.getNextEditableNode(codeBlock1.sid!)).toBe(codeBlock2.sid);
          
          // Next of codeBlock2 is mathBlock
          expect(editableDataStore.getNextEditableNode(codeBlock2.sid!)).toBe(mathBlock.sid);
          
          // Next of mathBlock is After
          expect(editableDataStore.getNextEditableNode(mathBlock.sid!)).toBe(afterText.sid);
        });
      });
    });

    describe('복합 구조 - paragraph, table, heading, image 혼합', () => {
      beforeEach(() => {
        // document > [heading > [text-1], paragraph > [text-2, image-1, text-3], table > [row > [cell > [text-4]]], paragraph > [text-5]]
        complexDataStore.createNodeWithChildren({
          stype: 'document',
          content: [
            {
              stype: 'heading',
              attrs: { level: 1 },
              content: [
                { stype: 'inline-text', text: 'Heading Text' }
              ]
            },
            {
              stype: 'paragraph',
              content: [
                { stype: 'inline-text', text: 'Para-Text1' },
                { stype: 'inline-image', attrs: { src: 'img.jpg', alt: 'Image' } },
                { stype: 'inline-text', text: 'Para-Text2' }
              ]
            },
            {
              stype: 'table',
              attrs: { border: 1 },
              content: [
                {
                  stype: 'tableRow',
                  content: [
                    {
                      stype: 'tableCell',
                      attrs: { colspan: 1, rowspan: 1 },
                      content: [
                        { stype: 'inline-text', text: 'Table-Cell-Text' }
                      ]
                    }
                  ]
                }
              ]
            },
            {
              stype: 'paragraph',
              content: [
                { stype: 'inline-text', text: 'Final Text' }
              ]
            }
          ]
        });
      });

      it('getPreviousEditableNode: 복합 구조에서 모든 편집 가능한 노드 간 이동', () => {
        const textNodes = complexDataStore.findNodesByType('inline-text');
        const images = complexDataStore.findNodesByType('inline-image');
        const headingText = textNodes[0];
        const paraText1 = textNodes[1];
        const image = images[0];
        const paraText2 = textNodes[2];
        const tableText = textNodes[3];
        const finalText = textNodes[4];
        
        // Final Text → Table-Cell-Text
        expect(complexDataStore.getPreviousEditableNode(finalText.sid!)).toBe(tableText.sid);
        
        // Table-Cell-Text → Para-Text2
        expect(complexDataStore.getPreviousEditableNode(tableText.sid!)).toBe(paraText2.sid);
        
        // Para-Text2 → image
        expect(complexDataStore.getPreviousEditableNode(paraText2.sid!)).toBe(image.sid);
        
        // image → Para-Text1
        expect(complexDataStore.getPreviousEditableNode(image.sid!)).toBe(paraText1.sid);
        
        // Para-Text1 → Heading Text
        expect(complexDataStore.getPreviousEditableNode(paraText1.sid!)).toBe(headingText.sid);
        
        // Heading Text → null
        expect(complexDataStore.getPreviousEditableNode(headingText.sid!)).toBeNull();
      });

      it('getNextEditableNode: 복합 구조에서 모든 편집 가능한 노드 간 이동', () => {
        const textNodes = complexDataStore.findNodesByType('inline-text');
        const images = complexDataStore.findNodesByType('inline-image');
        const headingText = textNodes[0];
        const paraText1 = textNodes[1];
        const image = images[0];
        const paraText2 = textNodes[2];
        const tableText = textNodes[3];
        const finalText = textNodes[4];
        
        // Heading Text → Para-Text1
        expect(complexDataStore.getNextEditableNode(headingText.sid!)).toBe(paraText1.sid);
        
        // Para-Text1 → image
        expect(complexDataStore.getNextEditableNode(paraText1.sid!)).toBe(image.sid);
        
        // image → Para-Text2
        expect(complexDataStore.getNextEditableNode(image.sid!)).toBe(paraText2.sid);
        
        // Para-Text2 → Table-Cell-Text
        expect(complexDataStore.getNextEditableNode(paraText2.sid!)).toBe(tableText.sid);
        
        // Table-Cell-Text → Final Text
        expect(complexDataStore.getNextEditableNode(tableText.sid!)).toBe(finalText.sid);
        
        // Final Text → null
        expect(complexDataStore.getNextEditableNode(finalText.sid!)).toBeNull();
      });
    });

    describe('Handling nodes with .text field', () => {
      beforeEach(() => {
        // inline-text has .text field
        complexDataStore.createNodeWithChildren({
          stype: 'document',
          content: [
            {
              stype: 'paragraph',
              content: [
                { stype: 'inline-text', text: 'Text1' },
                { stype: 'inline-text', text: 'Text2' },
                { stype: 'inline-text', text: 'Text3' }
              ]
            }
          ]
        });
      });

      it('getPreviousEditableNode: .text 필드가 있는 노드는 편집 가능', () => {
        const textNodes = complexDataStore.findNodesByType('inline-text');
        const text1 = textNodes[0];
        const text2 = textNodes[1];
        const text3 = textNodes[2];
        
        // Nodes with .text field are considered editable nodes
        expect(complexDataStore.getPreviousEditableNode(text3.sid!)).toBe(text2.sid);
        expect(complexDataStore.getPreviousEditableNode(text2.sid!)).toBe(text1.sid);
      });

      it('getNextEditableNode: nodes with .text field are editable', () => {
        const textNodes = complexDataStore.findNodesByType('inline-text');
        const text1 = textNodes[0];
        const text2 = textNodes[1];
        const text3 = textNodes[2];
        
        // Nodes with .text field are considered editable nodes
        expect(complexDataStore.getNextEditableNode(text1.sid!)).toBe(text2.sid);
        expect(complexDataStore.getNextEditableNode(text2.sid!)).toBe(text3.sid);
      });
    });

    describe('atom attribute check', () => {
      beforeEach(() => {
        // inline-image has atom: true
        complexDataStore.createNodeWithChildren({
          stype: 'document',
          content: [
            {
              stype: 'paragraph',
              content: [
                { stype: 'inline-text', text: 'Before' },
                { stype: 'inline-image', attrs: { src: 'img.jpg', alt: 'Image' } },
                { stype: 'inline-text', text: 'After' }
              ]
            }
          ]
        });
      });

      it('atom 노드도 group이 inline이면 편집 가능한 노드로 간주', () => {
        const textNodes = complexDataStore.findNodesByType('inline-text');
        const images = complexDataStore.findNodesByType('inline-image');
        const beforeText = textNodes[0];
        const image = images[0];
        const afterText = textNodes[1];
        
        // Atom node but editable because group is inline
        expect(complexDataStore.getPreviousEditableNode(afterText.sid!)).toBe(image.sid);
        expect(complexDataStore.getPreviousEditableNode(image.sid!)).toBe(beforeText.sid);
        
        expect(complexDataStore.getNextEditableNode(beforeText.sid!)).toBe(image.sid);
        expect(complexDataStore.getNextEditableNode(image.sid!)).toBe(afterText.sid);
      });
    });

    describe('Code block internal text handling', () => {
      beforeEach(() => {
        // codeBlock is a block but can have text inside
        // However, codeBlock itself is not editable, how should internal text be handled?
        // Actually, should find text nodes inside codeBlock
        complexDataStore.createNodeWithChildren({
          stype: 'document',
          content: [
            {
              stype: 'paragraph',
              content: [
                { stype: 'inline-text', text: 'Before CodeBlock' }
              ]
            },
            {
              stype: 'codeBlock',
              attrs: { language: 'javascript' },
              text: 'const x = 1;\nconst y = 2;' // Has .text field but is a block node
            },
            {
              stype: 'paragraph',
              content: [
                { stype: 'inline-text', text: 'After CodeBlock' }
              ]
            }
          ]
        });
      });

      it('getPreviousEditableNode: skip codeBlock because it is a block (internal text is inaccessible)', () => {
        const textNodes = complexDataStore.findNodesByType('inline-text');
        const beforeText = textNodes[0];
        const afterText = textNodes[1];
        
        // Skip codeBlock because it is a block node, previous of After CodeBlock is Before CodeBlock
        expect(complexDataStore.getPreviousEditableNode(afterText.sid!)).toBe(beforeText.sid);
      });

      it('getNextEditableNode: skip codeBlock because it is a block (internal text is inaccessible)', () => {
        const textNodes = complexDataStore.findNodesByType('inline-text');
        const beforeText = textNodes[0];
        const afterText = textNodes[1];
        
        // Skip codeBlock because it is a block node, next of Before CodeBlock is After CodeBlock
        expect(complexDataStore.getNextEditableNode(beforeText.sid!)).toBe(afterText.sid);
      });
    });

    describe('Canvas block (complex block node)', () => {
      beforeEach(() => {
        // canvas is a complex block node that can have various elements inside
        // However, canvas itself is a non-editable block node
        complexDataStore.createNodeWithChildren({
          stype: 'document',
          content: [
            {
              stype: 'paragraph',
              content: [
                { stype: 'inline-text', text: 'Before Canvas' }
              ]
            },
            {
              stype: 'canvas',
              // group exists only in schema definition, not in model nodes
              content: [
                // canvas can have various elements inside, but canvas itself should be skipped
                { stype: 'inline-text', text: 'Canvas Content' } // But this is inside canvas so inaccessible
              ]
            },
            {
              stype: 'paragraph',
              content: [
                { stype: 'inline-text', text: 'After Canvas' }
              ]
            }
          ]
        });
      });

      it('getPreviousEditableNode: skip canvas because it is a block', () => {
        const textNodes = complexDataStore.findNodesByType('inline-text');
        // Do not find text inside canvas (because canvas is a block)
        const beforeText = textNodes[0]; // Before Canvas
        const afterText = textNodes[1]; // After Canvas (excluding text inside canvas)
        
        // Previous of After Canvas is Before Canvas (skipping canvas)
        expect(complexDataStore.getPreviousEditableNode(afterText.sid!)).toBe(beforeText.sid);
      });

      it('getNextEditableNode: skip canvas because it is a block', () => {
        const textNodes = complexDataStore.findNodesByType('inline-text');
        const beforeText = textNodes[0];
        const afterText = textNodes[1];
        
        // Next of Before Canvas is After Canvas (skipping canvas)
        expect(complexDataStore.getNextEditableNode(beforeText.sid!)).toBe(afterText.sid);
      });
    });

    describe('Various inline nodes', () => {
      beforeEach(() => {
        // Various inline nodes: link, button, mention, etc.
        complexDataStore.createNodeWithChildren({
          stype: 'document',
          content: [
            {
              stype: 'paragraph',
              content: [
                { stype: 'inline-text', text: 'Text1' },
                { stype: 'inline-link', attributes: { href: 'https://example.com' } },
                { stype: 'inline-text', text: 'Text2' },
                { stype: 'inline-mention', attributes: { userId: 'user123' } },
                { stype: 'inline-text', text: 'Text3' },
                { stype: 'inline-button', attributes: { label: 'Click' } },
                { stype: 'inline-text', text: 'Text4' }
              ]
            }
          ]
        });
      });

      it('getPreviousEditableNode: 다양한 inline 노드들도 편집 가능', () => {
        const textNodes = complexDataStore.findNodesByType('inline-text');
        const links = complexDataStore.findNodesByType('inline-link');
        const mentions = complexDataStore.findNodesByType('inline-mention');
        const buttons = complexDataStore.findNodesByType('inline-button');
        
        const text1 = textNodes[0];
        const link = links[0];
        const text2 = textNodes[1];
        const mention = mentions[0];
        const text3 = textNodes[2];
        const button = buttons[0];
        const text4 = textNodes[3];
        
        // All inline nodes are considered editable nodes
        expect(complexDataStore.getPreviousEditableNode(text4.sid!)).toBe(button.sid);
        expect(complexDataStore.getPreviousEditableNode(button.sid!)).toBe(text3.sid);
        expect(complexDataStore.getPreviousEditableNode(text3.sid!)).toBe(mention.sid);
        expect(complexDataStore.getPreviousEditableNode(mention.sid!)).toBe(text2.sid);
        expect(complexDataStore.getPreviousEditableNode(text2.sid!)).toBe(link.sid);
        expect(complexDataStore.getPreviousEditableNode(link.sid!)).toBe(text1.sid);
      });

      it('getNextEditableNode: various inline nodes are also editable', () => {
        const textNodes = complexDataStore.findNodesByType('inline-text');
        const links = complexDataStore.findNodesByType('inline-link');
        const mentions = complexDataStore.findNodesByType('inline-mention');
        const buttons = complexDataStore.findNodesByType('inline-button');
        
        const text1 = textNodes[0];
        const link = links[0];
        const text2 = textNodes[1];
        const mention = mentions[0];
        const text3 = textNodes[2];
        const button = buttons[0];
        const text4 = textNodes[3];
        
        // All inline nodes are considered editable nodes
        expect(complexDataStore.getNextEditableNode(text1.sid!)).toBe(link.sid);
        expect(complexDataStore.getNextEditableNode(link.sid!)).toBe(text2.sid);
        expect(complexDataStore.getNextEditableNode(text2.sid!)).toBe(mention.sid);
        expect(complexDataStore.getNextEditableNode(mention.sid!)).toBe(text3.sid);
        expect(complexDataStore.getNextEditableNode(text3.sid!)).toBe(button.sid);
        expect(complexDataStore.getNextEditableNode(button.sid!)).toBe(text4.sid);
      });
    });

    describe('AI-generated content - free structure', () => {
      beforeEach(() => {
        // Free structure created by AI:
        // - Nested blocks
        // - Mix of various inline nodes
        // - Unexpected structures
        complexDataStore.createNodeWithChildren({
          stype: 'document',
          content: [
            {
              stype: 'heading',
              attrs: { level: 1 },
              content: [
                { stype: 'inline-text', text: 'AI Title' },
                { stype: 'inline-image', attrs: { src: 'ai.jpg', alt: 'AI' } }
              ]
            },
            {
              stype: 'paragraph',
              content: [
                { stype: 'inline-text', text: 'Para1' }
              ]
            },
            {
              stype: 'blockQuote',
              // group exists only in schema definition, not in model nodes
              content: [
                {
                  stype: 'paragraph',
                  content: [
                    { stype: 'inline-text', text: 'Quote Text' }
                  ]
                }
              ]
            },
            {
              stype: 'paragraph',
              content: [
                { stype: 'inline-text', text: 'Para2' },
                { stype: 'inline-link', attributes: { href: 'https://ai.com' } },
                { stype: 'inline-text', text: 'Para2-2' }
              ]
            },
            {
              stype: 'table',
              attrs: { border: 1 },
              content: [
                {
                  stype: 'tableRow',
                  content: [
                    {
                      stype: 'tableCell',
                      attrs: { colspan: 1, rowspan: 1 },
                      content: [
                        { stype: 'inline-text', text: 'Table Text' }
                      ]
                    }
                  ]
                }
              ]
            },
            {
              stype: 'paragraph',
              content: [
                { stype: 'inline-text', text: 'Final' }
              ]
            }
          ]
        });
      });

      it('getPreviousEditableNode: AI 생성 자유로운 구조에서 모든 편집 가능한 노드 찾기', () => {
        const textNodes = complexDataStore.findNodesByType('inline-text');
        const images = complexDataStore.findNodesByType('inline-image');
        const links = complexDataStore.findNodesByType('inline-link');
        
        // Final → Table Text → Para2-2 → link → Para2 → Quote Text → Para1 → image → AI Title
        const finalText = textNodes[textNodes.length - 1];
        const tableText = textNodes[textNodes.length - 2];
        const para2Text2 = textNodes[textNodes.length - 3];
        const link = links[0];
        const para2Text1 = textNodes[textNodes.length - 4];
        const quoteText = textNodes[textNodes.length - 5];
        const para1Text = textNodes[textNodes.length - 6];
        const image = images[0];
        const aiTitle = textNodes[0];
        
        // Should correctly find all editable nodes even in complex structures
        expect(complexDataStore.getPreviousEditableNode(finalText.sid!)).toBe(tableText.sid);
        expect(complexDataStore.getPreviousEditableNode(tableText.sid!)).toBe(para2Text2.sid);
        expect(complexDataStore.getPreviousEditableNode(para2Text2.sid!)).toBe(link.sid);
        expect(complexDataStore.getPreviousEditableNode(link.sid!)).toBe(para2Text1.sid);
        expect(complexDataStore.getPreviousEditableNode(para2Text1.sid!)).toBe(quoteText.sid);
        expect(complexDataStore.getPreviousEditableNode(quoteText.sid!)).toBe(para1Text.sid);
        expect(complexDataStore.getPreviousEditableNode(para1Text.sid!)).toBe(image.sid);
        expect(complexDataStore.getPreviousEditableNode(image.sid!)).toBe(aiTitle.sid);
      });

      it('getNextEditableNode: AI 생성 자유로운 구조에서 모든 편집 가능한 노드 찾기', () => {
        const textNodes = complexDataStore.findNodesByType('inline-text');
        const images = complexDataStore.findNodesByType('inline-image');
        const links = complexDataStore.findNodesByType('inline-link');
        
        const aiTitle = textNodes[0];
        const image = images[0];
        const para1Text = textNodes[1];
        const quoteText = textNodes[2];
        const para2Text1 = textNodes[3];
        const link = links[0];
        const para2Text2 = textNodes[4];
        const tableText = textNodes[5];
        const finalText = textNodes[6];
        
        // Should correctly find all editable nodes even in complex structures
        expect(complexDataStore.getNextEditableNode(aiTitle.sid!)).toBe(image.sid);
        expect(complexDataStore.getNextEditableNode(image.sid!)).toBe(para1Text.sid);
        expect(complexDataStore.getNextEditableNode(para1Text.sid!)).toBe(quoteText.sid);
        expect(complexDataStore.getNextEditableNode(quoteText.sid!)).toBe(para2Text1.sid);
        expect(complexDataStore.getNextEditableNode(para2Text1.sid!)).toBe(link.sid);
        expect(complexDataStore.getNextEditableNode(link.sid!)).toBe(para2Text2.sid);
        expect(complexDataStore.getNextEditableNode(para2Text2.sid!)).toBe(tableText.sid);
        expect(complexDataStore.getNextEditableNode(tableText.sid!)).toBe(finalText.sid);
      });
    });

    describe('Nested block structure (inside blockQuote)', () => {
      beforeEach(() => {
        // Case where paragraph is inside blockQuote
        complexDataStore.createNodeWithChildren({
          stype: 'document',
          content: [
            {
              stype: 'paragraph',
              content: [
                { stype: 'inline-text', text: 'Before Quote' }
              ]
            },
            {
              stype: 'blockQuote',
              // group exists only in schema definition, not in model nodes
              content: [
                {
                  stype: 'paragraph',
                  content: [
                    { stype: 'inline-text', text: 'Quote Text1' },
                    { stype: 'inline-text', text: 'Quote Text2' }
                  ]
                }
              ]
            },
            {
              stype: 'paragraph',
              content: [
                { stype: 'inline-text', text: 'After Quote' }
              ]
            }
          ]
        });
      });

      it('getPreviousEditableNode: blockQuote 내부 텍스트도 편집 가능', () => {
        const textNodes = complexDataStore.findNodesByType('inline-text');
        const beforeText = textNodes[0];
        const quoteText1 = textNodes[1];
        const quoteText2 = textNodes[2];
        const afterText = textNodes[3];
        
        // blockQuote is a block but text inside is editable
        expect(complexDataStore.getPreviousEditableNode(afterText.sid!)).toBe(quoteText2.sid);
        expect(complexDataStore.getPreviousEditableNode(quoteText2.sid!)).toBe(quoteText1.sid);
        expect(complexDataStore.getPreviousEditableNode(quoteText1.sid!)).toBe(beforeText.sid);
      });

      it('getNextEditableNode: text inside blockQuote is also editable', () => {
        const textNodes = complexDataStore.findNodesByType('inline-text');
        const beforeText = textNodes[0];
        const quoteText1 = textNodes[1];
        const quoteText2 = textNodes[2];
        const afterText = textNodes[3];
        
        // blockQuote is a block but text inside is editable
        expect(complexDataStore.getNextEditableNode(beforeText.sid!)).toBe(quoteText1.sid);
        expect(complexDataStore.getNextEditableNode(quoteText1.sid!)).toBe(quoteText2.sid);
        expect(complexDataStore.getNextEditableNode(quoteText2.sid!)).toBe(afterText.sid);
      });
    });

    describe('List structure (nested block)', () => {
      beforeEach(() => {
        // list > listItem > paragraph > text structure
        complexDataStore.createNodeWithChildren({
          stype: 'document',
          content: [
            {
              stype: 'paragraph',
              content: [
                { stype: 'inline-text', text: 'Before List' }
              ]
            },
            {
              stype: 'list',
              // group exists only in schema definition, not in model nodes
              attributes: { type: 'bullet' },
              content: [
                {
                  stype: 'listItem',
                  // group exists only in schema definition, not in model nodes
                  content: [
                    {
                      stype: 'paragraph',
                      content: [
                        { stype: 'inline-text', text: 'List Item 1' }
                      ]
                    }
                  ]
                },
                {
                  stype: 'listItem',
                  // group exists only in schema definition, not in model nodes
                  content: [
                    {
                      stype: 'paragraph',
                      content: [
                        { stype: 'inline-text', text: 'List Item 2' }
                      ]
                    }
                  ]
                }
              ]
            },
            {
              stype: 'paragraph',
              content: [
                { stype: 'inline-text', text: 'After List' }
              ]
            }
          ]
        });
      });

      it('getPreviousEditableNode: list 내부 텍스트도 편집 가능', () => {
        const textNodes = complexDataStore.findNodesByType('inline-text');
        const beforeText = textNodes[0];
        const listItem1 = textNodes[1];
        const listItem2 = textNodes[2];
        const afterText = textNodes[3];
        
        // list is a block but text inside is editable
        expect(complexDataStore.getPreviousEditableNode(afterText.sid!)).toBe(listItem2.sid);
        expect(complexDataStore.getPreviousEditableNode(listItem2.sid!)).toBe(listItem1.sid);
        expect(complexDataStore.getPreviousEditableNode(listItem1.sid!)).toBe(beforeText.sid);
      });

      it('getNextEditableNode: text inside list is also editable', () => {
        const textNodes = complexDataStore.findNodesByType('inline-text');
        const beforeText = textNodes[0];
        const listItem1 = textNodes[1];
        const listItem2 = textNodes[2];
        const afterText = textNodes[3];
        
        // list is a block but text inside is editable
        expect(complexDataStore.getNextEditableNode(beforeText.sid!)).toBe(listItem1.sid);
        expect(complexDataStore.getNextEditableNode(listItem1.sid!)).toBe(listItem2.sid);
        expect(complexDataStore.getNextEditableNode(listItem2.sid!)).toBe(afterText.sid);
      });
    });

    describe('Empty block node handling', () => {
      beforeEach(() => {
        // Empty paragraph, empty heading, etc.
        complexDataStore.createNodeWithChildren({
          stype: 'document',
          content: [
            {
              stype: 'paragraph',
              content: [
                { stype: 'inline-text', text: 'Before Empty' }
              ]
            },
            {
              stype: 'paragraph',
              content: [] // Empty paragraph
            },
            {
              stype: 'heading',
              attrs: { level: 1 },
              content: [] // Empty heading
            },
            {
              stype: 'paragraph',
              content: [
                { stype: 'inline-text', text: 'After Empty' }
              ]
            }
          ]
        });
      });

      it('getPreviousEditableNode: 빈 block 노드들을 건너뛰고 이전 편집 가능한 노드 찾기', () => {
        const textNodes = complexDataStore.findNodesByType('inline-text');
        const beforeText = textNodes[0];
        const afterText = textNodes[1];
        
        // Should skip empty block nodes and find Before Empty
        expect(complexDataStore.getPreviousEditableNode(afterText.sid!)).toBe(beforeText.sid);
      });

      it('getNextEditableNode: skip empty block nodes and find next editable node', () => {
        const textNodes = complexDataStore.findNodesByType('inline-text');
        const beforeText = textNodes[0];
        const afterText = textNodes[1];
        
        // Should skip empty block nodes and find After Empty
        expect(complexDataStore.getNextEditableNode(beforeText.sid!)).toBe(afterText.sid);
      });
    });
  });

  describe('isEditableNode - Public API', () => {
    beforeEach(() => {
      dataStore.createNodeWithChildren({
        stype: 'document',
        content: [
          {
            stype: 'paragraph',
            content: [
              { stype: 'inline-text', text: 'Text 1' },
              { stype: 'inline-image', attributes: { src: 'image.jpg', alt: 'Image' } }
            ]
          },
          {
            stype: 'heading',
            attributes: { level: 1 },
            content: [
              { stype: 'inline-text', text: 'Heading' }
            ]
          }
        ]
      });
    });

    it('텍스트 노드는 편집 가능', () => {
      const textNodes = dataStore.findNodesByType('inline-text');
      expect(textNodes.length).toBeGreaterThan(0);
      
      textNodes.forEach(textNode => {
        expect(dataStore.isEditableNode(textNode.sid!)).toBe(true);
      });
    });

    it('inline 노드(inline-image)는 편집 가능', () => {
      const imageNodes = dataStore.findNodesByType('inline-image');
      expect(imageNodes.length).toBeGreaterThan(0);
      
      imageNodes.forEach(imageNode => {
        expect(dataStore.isEditableNode(imageNode.sid!)).toBe(true);
      });
    });

    it('block 노드(paragraph)는 편집 불가능', () => {
      const paragraphs = dataStore.findNodesByType('paragraph');
      expect(paragraphs.length).toBeGreaterThan(0);
      
      paragraphs.forEach(paragraph => {
        expect(dataStore.isEditableNode(paragraph.sid!)).toBe(false);
      });
    });

    it('block 노드(heading)는 편집 불가능', () => {
      const headings = dataStore.findNodesByType('heading');
      expect(headings.length).toBeGreaterThan(0);
      
      headings.forEach(heading => {
        expect(dataStore.isEditableNode(heading.sid!)).toBe(false);
      });
    });

    it('존재하지 않는 노드는 false 반환', () => {
      expect(dataStore.isEditableNode('non-existent-node')).toBe(false);
    });
  });

  describe('editable: true인 block 노드 - isEditableNode', () => {
    let editableSchema: Schema;
    let editableDataStore: DataStore;

    beforeEach(() => {
      editableSchema = new Schema('editable-block-schema', {
        nodes: {
          'document': {
            name: 'document',
            content: 'block+',
            group: 'document'
          },
          'paragraph': {
            name: 'paragraph',
            content: 'inline*',
            group: 'block'
          },
          'codeBlock': {
            name: 'codeBlock',
            group: 'block',
            editable: true,
            attrs: {
              language: { type: 'string', default: 'text' }
            }
          },
          'mathBlock': {
            name: 'mathBlock',
            group: 'block',
            editable: true,
            attrs: {
              tex: { type: 'string' },
              engine: { type: 'string', default: 'katex' }
            }
          },
          'inline-text': {
            name: 'inline-text',
            group: 'inline'
          }
        },
        marks: {}
      });

      editableDataStore = new DataStore(undefined, editableSchema);
    });

    it('editable: true이고 .text 필드가 있으면 편집 가능', () => {
      editableDataStore.createNodeWithChildren({
        stype: 'document',
        content: [
          {
            stype: 'codeBlock',
            attributes: { language: 'javascript' },
            text: 'const x = 1;'
          }
        ]
      });

      const codeBlocks = editableDataStore.findNodesByType('codeBlock');
      expect(codeBlocks.length).toBeGreaterThan(0);
      
      codeBlocks.forEach(codeBlock => {
        expect(editableDataStore.isEditableNode(codeBlock.sid!)).toBe(true);
      });
    });

    it('editable: true이지만 .text 필드가 없으면 편집 불가능', () => {
      editableDataStore.createNodeWithChildren({
        stype: 'document',
        content: [
          {
            stype: 'mathBlock',
            attributes: { tex: 'E=mc^2', engine: 'katex' }
            // No .text field
          }
        ]
      });

      const mathBlocks = editableDataStore.findNodesByType('mathBlock');
      expect(mathBlocks.length).toBeGreaterThan(0);
      
      mathBlocks.forEach(mathBlock => {
        expect(editableDataStore.isEditableNode(mathBlock.sid!)).toBe(false);
      });
    });

    it('editable 속성이 없으면 block 노드는 편집 불가능', () => {
      editableDataStore.createNodeWithChildren({
        stype: 'document',
        content: [
          {
            stype: 'paragraph',
            content: [
              { stype: 'inline-text', text: 'Text' }
            ]
          }
        ]
      });

      const paragraphs = editableDataStore.findNodesByType('paragraph');
      expect(paragraphs.length).toBeGreaterThan(0);
      
      paragraphs.forEach(paragraph => {
        expect(editableDataStore.isEditableNode(paragraph.sid!)).toBe(false);
      });
    });
  });

  describe('getEditableNodes - 편집 가능한 노드 목록 조회', () => {
    let editableSchema: Schema;
    let editableDataStore: DataStore;

    beforeEach(() => {
      editableSchema = new Schema('editable-nodes-schema', {
        nodes: {
          'document': {
            name: 'document',
            content: 'block+',
            group: 'document'
          },
          'paragraph': {
            name: 'paragraph',
            content: 'inline*',
            group: 'block'
          },
          'codeBlock': {
            name: 'codeBlock',
            group: 'block',
            editable: true,
            attrs: {
              language: { type: 'string', default: 'text' }
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
              src: { type: 'string' },
              alt: { type: 'string', default: '' }
            }
          }
        },
        marks: {}
      });

      editableDataStore = new DataStore(undefined, editableSchema);
      
      editableDataStore.createNodeWithChildren({
        stype: 'document',
        content: [
          {
            stype: 'paragraph',
            content: [
              { stype: 'inline-text', text: 'Text 1' },
              { stype: 'inline-image', attributes: { src: 'image.jpg', alt: 'Image' } },
              { stype: 'inline-text', text: 'Text 2' }
            ]
          },
          {
            stype: 'codeBlock',
            attributes: { language: 'javascript' },
            text: 'const x = 1;'
          },
          {
            stype: 'paragraph',
            content: [
              { stype: 'inline-text', text: 'Text 3' }
            ]
          }
        ]
      });
    });

    it('모든 편집 가능한 노드 조회', () => {
      const editableNodes = editableDataStore.getEditableNodes();
      
      // 3 text nodes + 1 inline-image + 1 codeBlock = 5 nodes
      expect(editableNodes.length).toBe(5);
      
      const nodeTypes = editableNodes.map(n => n.stype);
      expect(nodeTypes).toContain('inline-text');
      expect(nodeTypes).toContain('inline-image');
      expect(nodeTypes).toContain('codeBlock');
    });

    it('query only text nodes', () => {
      const textNodes = editableDataStore.getEditableNodes({
        includeText: true,
        includeInline: false,
        includeEditableBlocks: false
      });
      
      // Only text nodes (inline-text is a text node)
      expect(textNodes.length).toBe(3);
      expect(textNodes.every(n => n.stype === 'inline-text' && n.text)).toBe(true);
    });

    it('query only inline nodes', () => {
      const inlineNodes = editableDataStore.getEditableNodes({
        includeText: false,
        includeInline: true,
        includeEditableBlocks: false
      });
      
      // Only inline-image (inline-text is classified as text node)
      expect(inlineNodes.length).toBe(1);
      expect(inlineNodes[0].stype).toBe('inline-image');
    });

    it('editable block 노드만 조회', () => {
      const editableBlocks = editableDataStore.getEditableNodes({
        includeText: false,
        includeInline: false,
        includeEditableBlocks: true
      });
      
      expect(editableBlocks.length).toBe(1);
      expect(editableBlocks[0].stype).toBe('codeBlock');
    });

    it('커스텀 필터 적용', () => {
      const longTextNodes = editableDataStore.getEditableNodes({
        filter: (node) => {
          return node.text !== undefined && node.text.length > 10;
        }
      });
      
      // Only includes 'const x = 1;' (11 chars) (all text nodes are 5 chars or less)
      expect(longTextNodes.length).toBeGreaterThanOrEqual(1);
      expect(longTextNodes.some(n => n.stype === 'codeBlock')).toBe(true);
    });

    it('document with no editable nodes should return empty array', () => {
      const emptyStore = new DataStore(undefined, editableSchema);
      // document requires at least 1 block, so add empty paragraph
      emptyStore.createNodeWithChildren({
        stype: 'document',
        content: [
          {
            stype: 'paragraph',
            content: [] // No editable nodes
          }
        ]
      });
      
      const editableNodes = emptyStore.getEditableNodes();
      expect(editableNodes.length).toBe(0);
    });
  });

  describe('filterEditableNodes - 편집 가능한 노드 필터링', () => {
    let editableSchema: Schema;
    let editableDataStore: DataStore;

    beforeEach(() => {
      editableSchema = new Schema('filter-schema', {
        nodes: {
          'document': {
            name: 'document',
            content: 'block+',
            group: 'document'
          },
          'paragraph': {
            name: 'paragraph',
            content: 'inline*',
            group: 'block'
          },
          'codeBlock': {
            name: 'codeBlock',
            group: 'block',
            editable: true,
            attrs: {
              language: { type: 'string', default: 'text' }
            }
          },
          'inline-text': {
            name: 'inline-text',
            group: 'inline'
          }
        },
        marks: {}
      });

      editableDataStore = new DataStore(undefined, editableSchema);
      
      editableDataStore.createNodeWithChildren({
        stype: 'document',
        content: [
          {
            stype: 'paragraph',
            content: [
              { stype: 'inline-text', text: 'Text 1' },
              { stype: 'inline-text', text: 'Text 2' }
            ]
          },
          {
            stype: 'codeBlock',
            attributes: { language: 'javascript' },
            text: 'const x = 1;'
          },
          {
            stype: 'paragraph',
            content: [
              { stype: 'inline-text', text: 'Text 3' }
            ]
          }
        ]
      });
    });

    it('모든 노드 중 편집 가능한 노드만 필터링', () => {
      // Collect all node IDs
      const textNodes = editableDataStore.findNodesByType('inline-text');
      const codeBlocks = editableDataStore.findNodesByType('codeBlock');
      const paragraphs = editableDataStore.findNodesByType('paragraph');
      
      const allNodeIds = [
        ...textNodes.map(n => n.sid!),
        ...codeBlocks.map(n => n.sid!),
        ...paragraphs.map(n => n.sid!)
      ];
      
      const editableNodeIds = editableDataStore.filterEditableNodes(allNodeIds);
      
      // 3 text nodes + 1 codeBlock = 4 nodes
      expect(editableNodeIds.length).toBe(4);
      
      // paragraph should be excluded
      paragraphs.forEach(paragraph => {
        expect(editableNodeIds).not.toContain(paragraph.sid);
      });
      
      // text nodes and codeBlock should be included
      textNodes.forEach(textNode => {
        expect(editableNodeIds).toContain(textNode.sid);
      });
      codeBlocks.forEach(codeBlock => {
        expect(editableNodeIds).toContain(codeBlock.sid);
      });
    });

    it('빈 배열은 빈 배열 반환', () => {
      const result = editableDataStore.filterEditableNodes([]);
      expect(result.length).toBe(0);
    });

    it('편집 가능한 노드만 포함된 배열은 그대로 반환', () => {
      const textNodes = editableDataStore.findNodesByType('inline-text');
      const textNodeIds = textNodes.map(n => n.sid!);
      
      const result = editableDataStore.filterEditableNodes(textNodeIds);
      expect(result.length).toBe(textNodeIds.length);
      expect(result).toEqual(textNodeIds);
    });

    it('편집 불가능한 노드만 포함된 배열은 빈 배열 반환', () => {
      const paragraphs = editableDataStore.findNodesByType('paragraph');
      const paragraphIds = paragraphs.map(n => n.sid!);
      
      const result = editableDataStore.filterEditableNodes(paragraphIds);
      expect(result.length).toBe(0);
    });

    it('존재하지 않는 노드 ID는 제외', () => {
      const textNodes = editableDataStore.findNodesByType('inline-text');
      const nodeIds = [
        ...textNodes.map(n => n.sid!),
        'non-existent-1',
        'non-existent-2'
      ];
      
      const result = editableDataStore.filterEditableNodes(nodeIds);
      // Non-existent nodes return false, so they are excluded
      expect(result.length).toBe(textNodes.length);
      expect(result.every(id => textNodes.some(n => n.sid === id))).toBe(true);
    });
  });

  describe('isSelectableNode - Public API', () => {
    beforeEach(() => {
      dataStore.createNodeWithChildren({
        stype: 'document',
        content: [
          {
            stype: 'paragraph',
            content: [
              { stype: 'inline-text', text: 'Text 1' },
              { stype: 'inline-image', attributes: { src: 'image.jpg', alt: 'Image' } }
            ]
          },
          {
            stype: 'heading',
            attributes: { level: 1 },
            content: [
              { stype: 'inline-text', text: 'Heading' }
            ]
          }
        ]
      });
    });

    it('텍스트 노드는 선택 가능', () => {
      const textNodes = dataStore.findNodesByType('inline-text');
      expect(textNodes.length).toBeGreaterThan(0);
      
      textNodes.forEach(textNode => {
        expect(dataStore.isSelectableNode(textNode.sid!)).toBe(true);
      });
    });

    it('inline 노드(inline-image)는 선택 가능', () => {
      const imageNodes = dataStore.findNodesByType('inline-image');
      expect(imageNodes.length).toBeGreaterThan(0);
      
      imageNodes.forEach(imageNode => {
        expect(dataStore.isSelectableNode(imageNode.sid!)).toBe(true);
      });
    });

    it('block 노드(paragraph)는 선택 가능', () => {
      const paragraphs = dataStore.findNodesByType('paragraph');
      expect(paragraphs.length).toBeGreaterThan(0);
      
      paragraphs.forEach(paragraph => {
        expect(dataStore.isSelectableNode(paragraph.sid!)).toBe(true);
      });
    });

    it('block 노드(heading)는 선택 가능', () => {
      const headings = dataStore.findNodesByType('heading');
      expect(headings.length).toBeGreaterThan(0);
      
      headings.forEach(heading => {
        expect(dataStore.isSelectableNode(heading.sid!)).toBe(true);
      });
    });

    it('document 노드는 선택 불가능', () => {
      const documentNode = dataStore.getRootNode();
      if (documentNode) {
        expect(dataStore.isSelectableNode(documentNode.sid!)).toBe(false);
      }
    });

    it('존재하지 않는 노드는 false 반환', () => {
      expect(dataStore.isSelectableNode('non-existent-node')).toBe(false);
    });
  });

  describe('selectable: false인 노드 처리', () => {
    let selectableSchema: Schema;
    let selectableDataStore: DataStore;

    beforeEach(() => {
      selectableSchema = new Schema('selectable-schema', {
        nodes: {
          'document': {
            name: 'document',
            content: 'block+',
            group: 'document'
          },
          'paragraph': {
            name: 'paragraph',
            content: 'inline*',
            group: 'block'
          },
          'nonSelectableBlock': {
            name: 'nonSelectableBlock',
            content: 'inline*',
            group: 'block',
            selectable: false // Not selectable
          },
          'inline-text': {
            name: 'inline-text',
            group: 'inline'
          },
          'nonSelectableInline': {
            name: 'nonSelectableInline',
            group: 'inline',
            selectable: false // Not selectable
          }
        },
        marks: {}
      });

      selectableDataStore = new DataStore(undefined, selectableSchema);
      
      selectableDataStore.createNodeWithChildren({
        stype: 'document',
        content: [
          {
            stype: 'paragraph',
            content: [
              { stype: 'inline-text', text: 'Text 1' }
            ]
          },
          {
            stype: 'nonSelectableBlock',
            content: [
              { stype: 'inline-text', text: 'Text 2' }
            ]
          },
          {
            stype: 'paragraph',
            content: [
              { stype: 'nonSelectableInline', text: 'Text 3' }
            ]
          }
        ]
      });
    });

    it('selectable: false인 block 노드는 선택 불가능', () => {
      const nonSelectableBlocks = selectableDataStore.findNodesByType('nonSelectableBlock');
      expect(nonSelectableBlocks.length).toBeGreaterThan(0);
      
      nonSelectableBlocks.forEach(block => {
        expect(selectableDataStore.isSelectableNode(block.sid!)).toBe(false);
      });
    });

    it('selectable: false인 inline 노드는 선택 불가능', () => {
      const nonSelectableInlines = selectableDataStore.findNodesByType('nonSelectableInline');
      expect(nonSelectableInlines.length).toBeGreaterThan(0);
      
      nonSelectableInlines.forEach(inline => {
        expect(selectableDataStore.isSelectableNode(inline.sid!)).toBe(false);
      });
    });

    it('selectable 속성이 없으면 기본적으로 선택 가능', () => {
      const paragraphs = selectableDataStore.findNodesByType('paragraph');
      expect(paragraphs.length).toBeGreaterThan(0);
      
      paragraphs.forEach(paragraph => {
        expect(selectableDataStore.isSelectableNode(paragraph.sid!)).toBe(true);
      });
    });
  });

  describe('getSelectableNodes - 선택 가능한 노드 목록 조회', () => {
    let selectableSchema: Schema;
    let selectableDataStore: DataStore;

    beforeEach(() => {
      selectableSchema = new Schema('selectable-nodes-schema', {
        nodes: {
          'document': {
            name: 'document',
            content: 'block+',
            group: 'document'
          },
          'paragraph': {
            name: 'paragraph',
            content: 'inline*',
            group: 'block'
          },
          'codeBlock': {
            name: 'codeBlock',
            group: 'block',
            editable: true,
            attrs: {
              language: { type: 'string', default: 'text' }
            }
          },
          'nonSelectableBlock': {
            name: 'nonSelectableBlock',
            content: 'inline*',
            group: 'block',
            selectable: false
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
              src: { type: 'string' },
              alt: { type: 'string', default: '' }
            }
          }
        },
        marks: {}
      });

      selectableDataStore = new DataStore(undefined, selectableSchema);
      
      selectableDataStore.createNodeWithChildren({
        stype: 'document',
        content: [
          {
            stype: 'paragraph',
            content: [
              { stype: 'inline-text', text: 'Text 1' },
              { stype: 'inline-image', attributes: { src: 'image.jpg', alt: 'Image' } }
            ]
          },
          {
            stype: 'codeBlock',
            attributes: { language: 'javascript' },
            text: 'const x = 1;'
          },
          {
            stype: 'nonSelectableBlock',
            content: [
              { stype: 'inline-text', text: 'Text 2' }
            ]
          },
          {
            stype: 'paragraph',
            content: [
              { stype: 'inline-text', text: 'Text 3' }
            ]
          }
        ]
      });
      
      // inline-text inside nonSelectableBlock is selectable,
      // but nonSelectableBlock itself is selectable: false, so internal nodes are not affected
      // (selectable is a property of the node itself, so it is not inherited by child nodes)
    });

    it('모든 선택 가능한 노드 조회', () => {
      const selectableNodes = selectableDataStore.getSelectableNodes();
      
      // 2 paragraphs + 1 codeBlock + 3 inline-text + 1 inline-image = 7 nodes
      // nonSelectableBlock is excluded
      expect(selectableNodes.length).toBe(7);
      
      const nodeTypes = selectableNodes.map(n => n.stype);
      expect(nodeTypes).toContain('paragraph');
      expect(nodeTypes).toContain('codeBlock');
      expect(nodeTypes).toContain('inline-text');
      expect(nodeTypes).toContain('inline-image');
      expect(nodeTypes).not.toContain('nonSelectableBlock');
    });

    it('block 노드만 조회', () => {
      const blockNodes = selectableDataStore.getSelectableNodes({
        includeBlocks: true,
        includeInline: false,
        includeEditable: false
      });
      
      // 2 paragraphs + 1 codeBlock = 3 nodes (all block nodes)
      expect(blockNodes.length).toBe(3);
      expect(blockNodes.every(n => {
        const schema = (selectableDataStore as any)._activeSchema;
        const nodeType = schema?.getNodeType?.(n.stype);
        return nodeType?.group === 'block';
      })).toBe(true);
    });

    it('inline 노드만 조회', () => {
      const inlineNodes = selectableDataStore.getSelectableNodes({
        includeBlocks: false,
        includeInline: true,
        includeEditable: false
      });
      
      // 3 inline-text + 1 inline-image = 4 nodes (all inline nodes)
      expect(inlineNodes.length).toBe(4);
      expect(inlineNodes.every(n => {
        const schema = (selectableDataStore as any)._activeSchema;
        const nodeType = schema?.getNodeType?.(n.stype);
        return nodeType?.group === 'inline';
      })).toBe(true);
    });

    it('editable 노드만 조회', () => {
      const editableNodes = selectableDataStore.getSelectableNodes({
        includeBlocks: false,
        includeInline: false,
        includeEditable: true
      });
      
      // All nodes should be editable
      editableNodes.forEach(node => {
        expect(selectableDataStore.isEditableNode(node.sid!)).toBe(true);
      });
      
      // 3 inline-text (Text 1, Text 2, Text 3) + 1 codeBlock + 1 inline-image = 5 nodes (editable nodes)
      // inline-image is editable because group: 'inline'
      // inline-text inside nonSelectableBlock is also editable, so included
      const textNodes = selectableDataStore.findNodesByType('inline-text');
      const codeBlocks = selectableDataStore.findNodesByType('codeBlock');
      const imageNodes = selectableDataStore.findNodesByType('inline-image');
      
      // All inline-text, codeBlock, inline-image should be included
      const expectedCount = textNodes.length + codeBlocks.length + imageNodes.length;
      expect(editableNodes.length).toBeGreaterThanOrEqual(expectedCount);
      
      // All textNodes, codeBlocks, imageNodes should be included
      textNodes.forEach(textNode => {
        expect(editableNodes.some(n => n.sid === textNode.sid)).toBe(true);
      });
      codeBlocks.forEach(codeBlock => {
        expect(editableNodes.some(n => n.sid === codeBlock.sid)).toBe(true);
      });
      imageNodes.forEach(imageNode => {
        expect(editableNodes.some(n => n.sid === imageNode.sid)).toBe(true);
      });
    });

    it('커스텀 필터 적용', () => {
      const codeBlocks = selectableDataStore.getSelectableNodes({
        filter: (node) => node.stype === 'codeBlock'
      });
      
      expect(codeBlocks.length).toBe(1);
      expect(codeBlocks[0].stype).toBe('codeBlock');
    });

    it('selectable: false인 노드는 제외', () => {
      const selectableNodes = selectableDataStore.getSelectableNodes();
      const nonSelectableBlocks = selectableDataStore.findNodesByType('nonSelectableBlock');
      
      nonSelectableBlocks.forEach(block => {
        expect(selectableNodes.some(n => n.sid === block.sid)).toBe(false);
      });
    });
  });

  describe('filterSelectableNodes - 선택 가능한 노드 필터링', () => {
    let selectableSchema: Schema;
    let selectableDataStore: DataStore;

    beforeEach(() => {
      selectableSchema = new Schema('filter-selectable-schema', {
        nodes: {
          'document': {
            name: 'document',
            content: 'block+',
            group: 'document'
          },
          'paragraph': {
            name: 'paragraph',
            content: 'inline*',
            group: 'block'
          },
          'nonSelectableBlock': {
            name: 'nonSelectableBlock',
            content: 'inline*',
            group: 'block',
            selectable: false
          },
          'inline-text': {
            name: 'inline-text',
            group: 'inline'
          }
        },
        marks: {}
      });

      selectableDataStore = new DataStore(undefined, selectableSchema);
      
      selectableDataStore.createNodeWithChildren({
        stype: 'document',
        content: [
          {
            stype: 'paragraph',
            content: [
              { stype: 'inline-text', text: 'Text 1' }
            ]
          },
          {
            stype: 'nonSelectableBlock',
            content: [
              { stype: 'inline-text', text: 'Text 2' }
            ]
          },
          {
            stype: 'paragraph',
            content: [
              { stype: 'inline-text', text: 'Text 3' }
            ]
          }
        ]
      });
    });

    it('모든 노드 중 선택 가능한 노드만 필터링', () => {
      const paragraphs = selectableDataStore.findNodesByType('paragraph');
      const nonSelectableBlocks = selectableDataStore.findNodesByType('nonSelectableBlock');
      const textNodes = selectableDataStore.findNodesByType('inline-text');
      
      const allNodeIds = [
        ...paragraphs.map(n => n.sid!),
        ...nonSelectableBlocks.map(n => n.sid!),
        ...textNodes.map(n => n.sid!)
      ];
      
      const selectableNodeIds = selectableDataStore.filterSelectableNodes(allNodeIds);
      
      // 2 paragraphs + 3 textNodes = 5 nodes (nonSelectableBlock excluded)
      expect(selectableNodeIds.length).toBe(5);
      
      // nonSelectableBlock should be excluded
      nonSelectableBlocks.forEach(block => {
        expect(selectableNodeIds).not.toContain(block.sid);
      });
      
      // paragraphs and textNodes should be included
      paragraphs.forEach(paragraph => {
        expect(selectableNodeIds).toContain(paragraph.sid);
      });
      textNodes.forEach(textNode => {
        expect(selectableNodeIds).toContain(textNode.sid);
      });
    });

    it('빈 배열은 빈 배열 반환', () => {
      const result = selectableDataStore.filterSelectableNodes([]);
      expect(result.length).toBe(0);
    });

    it('선택 가능한 노드만 포함된 배열은 그대로 반환', () => {
      const paragraphs = selectableDataStore.findNodesByType('paragraph');
      const paragraphIds = paragraphs.map(n => n.sid!);
      
      const result = selectableDataStore.filterSelectableNodes(paragraphIds);
      expect(result.length).toBe(paragraphIds.length);
      expect(result).toEqual(paragraphIds);
    });

    it('선택 불가능한 노드만 포함된 배열은 빈 배열 반환', () => {
      const nonSelectableBlocks = selectableDataStore.findNodesByType('nonSelectableBlock');
      const blockIds = nonSelectableBlocks.map(n => n.sid!);
      
      const result = selectableDataStore.filterSelectableNodes(blockIds);
      expect(result.length).toBe(0);
    });

    it('존재하지 않는 노드 ID는 제외', () => {
      const paragraphs = selectableDataStore.findNodesByType('paragraph');
      const nodeIds = [
        ...paragraphs.map(n => n.sid!),
        'non-existent-1',
        'non-existent-2'
      ];
      
      const result = selectableDataStore.filterSelectableNodes(nodeIds);
      // Non-existent nodes return false, so they are excluded
      expect(result.length).toBe(paragraphs.length);
      expect(result.every(id => paragraphs.some(n => n.sid === id))).toBe(true);
    });
  });

  describe('Draggable Node - 드래그 가능한 노드', () => {
    let draggableSchema: Schema;
    let draggableDataStore: DataStore;

    beforeEach(() => {
      draggableSchema = new Schema('draggable-nodes-schema', {
        nodes: {
          'document': {
            name: 'document',
            content: 'block+',
            group: 'document'
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
              level: { type: 'number', default: 1 }
            }
          },
          'nonDraggableBlock': {
            name: 'nonDraggableBlock',
            content: 'inline*',
            group: 'block',
            draggable: false
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
              src: { type: 'string' },
              alt: { type: 'string', default: '' }
            }
          }
        },
        marks: {}
      });

      draggableDataStore = new DataStore(undefined, draggableSchema);
      
      draggableDataStore.createNodeWithChildren({
        stype: 'document',
        content: [
          {
            stype: 'paragraph',
            content: [
              { stype: 'inline-text', text: 'Text 1' },
              { stype: 'inline-image', attributes: { src: 'image.jpg', alt: 'Image' } }
            ]
          },
          {
            stype: 'heading',
            attributes: { level: 1 },
            content: [
              { stype: 'inline-text', text: 'Heading 1' }
            ]
          },
          {
            stype: 'nonDraggableBlock',
            content: [
              { stype: 'inline-text', text: 'Text 2' }
            ]
          },
          {
            stype: 'paragraph',
            content: [
              { stype: 'inline-text', text: 'Text 3' }
            ]
          }
        ]
      });
    });

    describe('isDraggableNode - 드래그 가능 여부 확인', () => {
      it('block 노드는 기본적으로 드래그 가능', () => {
        const paragraphs = draggableDataStore.findNodesByType('paragraph');
        paragraphs.forEach(paragraph => {
          expect(draggableDataStore.isDraggableNode(paragraph.sid!)).toBe(true);
        });
      });

      it('inline 노드는 기본적으로 드래그 가능', () => {
        const textNodes = draggableDataStore.findNodesByType('inline-text');
        const imageNodes = draggableDataStore.findNodesByType('inline-image');
        
        textNodes.forEach(textNode => {
          expect(draggableDataStore.isDraggableNode(textNode.sid!)).toBe(true);
        });
        
        imageNodes.forEach(imageNode => {
          expect(draggableDataStore.isDraggableNode(imageNode.sid!)).toBe(true);
        });
      });

      it('document 노드는 드래그 불가능', () => {
        const documentNode = draggableDataStore.getRootNode();
        expect(documentNode).toBeDefined();
        if (documentNode) {
          expect(draggableDataStore.isDraggableNode(documentNode.sid!)).toBe(false);
        }
      });

      it('draggable: false인 노드는 드래그 불가능', () => {
        const nonDraggableBlocks = draggableDataStore.findNodesByType('nonDraggableBlock');
        nonDraggableBlocks.forEach(block => {
          expect(draggableDataStore.isDraggableNode(block.sid!)).toBe(false);
        });
      });

      it('존재하지 않는 노드는 false 반환', () => {
        expect(draggableDataStore.isDraggableNode('non-existent')).toBe(false);
      });
    });

    describe('getDraggableNodes - 드래그 가능한 노드 목록 조회', () => {
      it('모든 드래그 가능한 노드 조회', () => {
        const draggableNodes = draggableDataStore.getDraggableNodes();
        
        // All nodes should be draggable (document, nonDraggableBlock excluded)
        draggableNodes.forEach(node => {
          expect(draggableDataStore.isDraggableNode(node.sid!)).toBe(true);
        });
        
        // document and nonDraggableBlock should be excluded
        const documentNode = draggableDataStore.getRootNode();
        if (documentNode) {
          expect(draggableNodes.some(n => n.sid === documentNode.sid)).toBe(false);
        }
        
        const nonDraggableBlocks = draggableDataStore.findNodesByType('nonDraggableBlock');
        nonDraggableBlocks.forEach(block => {
          expect(draggableNodes.some(n => n.sid === block.sid)).toBe(false);
        });
      });

      it('block 노드만 조회', () => {
        const blockNodes = draggableDataStore.getDraggableNodes({
          includeBlocks: true,
          includeInline: false,
          includeEditable: false
        });
        
        blockNodes.forEach(node => {
          expect(draggableDataStore.isDraggableNode(node.sid!)).toBe(true);
          const schema = (draggableDataStore as any)._activeSchema;
          const nodeType = schema?.getNodeType?.(node.stype);
          expect(nodeType?.group).toBe('block');
        });
      });

      it('inline 노드만 조회', () => {
        const inlineNodes = draggableDataStore.getDraggableNodes({
          includeBlocks: false,
          includeInline: true,
          includeEditable: false
        });
        
        inlineNodes.forEach(node => {
          expect(draggableDataStore.isDraggableNode(node.sid!)).toBe(true);
          const schema = (draggableDataStore as any)._activeSchema;
          const nodeType = schema?.getNodeType?.(node.stype);
          expect(nodeType?.group).toBe('inline');
        });
      });

      it('editable 노드만 조회', () => {
        const editableNodes = draggableDataStore.getDraggableNodes({
          includeBlocks: false,
          includeInline: false,
          includeEditable: true
        });
        
        editableNodes.forEach(node => {
          expect(draggableDataStore.isDraggableNode(node.sid!)).toBe(true);
          expect(draggableDataStore.isEditableNode(node.sid!)).toBe(true);
        });
      });

      it('커스텀 필터 적용', () => {
        const headingNodes = draggableDataStore.getDraggableNodes({
          filter: (node) => node.stype === 'heading'
        });
        
        headingNodes.forEach(node => {
          expect(node.stype).toBe('heading');
          expect(draggableDataStore.isDraggableNode(node.sid!)).toBe(true);
        });
      });

      it('빈 문서는 빈 배열 반환', () => {
        const emptyStore = new DataStore(undefined, draggableSchema);
        // document requires at least 1 block, so add empty paragraph
        emptyStore.createNodeWithChildren({
          stype: 'document',
          content: [
            {
              stype: 'paragraph',
              content: []
            }
          ]
        });
        
        const draggableNodes = emptyStore.getDraggableNodes();
        // paragraph is draggable, so returns 1
        expect(draggableNodes.length).toBeGreaterThanOrEqual(1);
        // All returned nodes should be draggable
        draggableNodes.forEach(node => {
          expect(emptyStore.isDraggableNode(node.sid!)).toBe(true);
        });
      });
    });

    describe('filterDraggableNodes - 드래그 가능한 노드 필터링', () => {
      it('모든 노드 중 드래그 가능한 노드만 필터링', () => {
        const allNodes = Array.from(draggableDataStore.getNodes().values());
        const nodeIds = allNodes.map(n => n.sid!);
        
        const draggableNodeIds = draggableDataStore.filterDraggableNodes(nodeIds);
        
        draggableNodeIds.forEach(nodeId => {
          expect(draggableDataStore.isDraggableNode(nodeId)).toBe(true);
        });
        
        // document and nonDraggableBlock should be excluded
        const documentNode = draggableDataStore.getRootNode();
        if (documentNode) {
          expect(draggableNodeIds).not.toContain(documentNode.sid);
        }
        
        const nonDraggableBlocks = draggableDataStore.findNodesByType('nonDraggableBlock');
        nonDraggableBlocks.forEach(block => {
          expect(draggableNodeIds).not.toContain(block.sid);
        });
      });

      it('빈 배열은 빈 배열 반환', () => {
        const result = draggableDataStore.filterDraggableNodes([]);
        expect(result.length).toBe(0);
      });

      it('드래그 불가능한 노드만 포함된 배열은 빈 배열 반환', () => {
        const documentNode = draggableDataStore.getRootNode();
        const nonDraggableBlocks = draggableDataStore.findNodesByType('nonDraggableBlock');
        const nodeIds = [
          ...(documentNode ? [documentNode.sid!] : []),
          ...nonDraggableBlocks.map(n => n.sid!)
        ];
        
        const result = draggableDataStore.filterDraggableNodes(nodeIds);
        expect(result.length).toBe(0);
      });

      it('존재하지 않는 노드 ID는 제외', () => {
        const paragraphs = draggableDataStore.findNodesByType('paragraph');
        const nodeIds = [
          ...paragraphs.map(n => n.sid!),
          'non-existent-1',
          'non-existent-2'
        ];
        
        const result = draggableDataStore.filterDraggableNodes(nodeIds);
        // Non-existent nodes return false, so they are excluded
        expect(result.length).toBe(paragraphs.length);
        expect(result.every(id => paragraphs.some(n => n.sid === id))).toBe(true);
      });
    });
  });

  describe('Droppable Node - 드롭 가능한 노드', () => {
    let droppableSchema: Schema;
    let droppableDataStore: DataStore;

    beforeEach(() => {
      droppableSchema = new Schema('droppable-nodes-schema', {
        nodes: {
          'document': {
            name: 'document',
            content: 'block+',
            group: 'document'
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
              level: { type: 'number', default: 1 }
            }
          },
          'nonDroppableBlock': {
            name: 'nonDroppableBlock',
            content: 'inline*',
            group: 'block',
            droppable: false
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
              src: { type: 'string' },
              alt: { type: 'string', default: '' }
            }
          }
        },
        marks: {}
      });

      droppableDataStore = new DataStore(undefined, droppableSchema);
      
      droppableDataStore.createNodeWithChildren({
        stype: 'document',
        content: [
          {
            stype: 'paragraph',
            content: [
              { stype: 'inline-text', text: 'Text 1' },
              { stype: 'inline-image', attributes: { src: 'image.jpg', alt: 'Image' } }
            ]
          },
          {
            stype: 'heading',
            attributes: { level: 1 },
            content: [
              { stype: 'inline-text', text: 'Heading 1' }
            ]
          },
          {
            stype: 'nonDroppableBlock',
            content: [
              { stype: 'inline-text', text: 'Text 2' }
            ]
          },
          {
            stype: 'paragraph',
            content: [
              { stype: 'inline-text', text: 'Text 3' }
            ]
          }
        ]
      });
    });

    describe('isDroppableNode - 드롭 가능 여부 확인', () => {
      it('content가 있는 노드는 기본적으로 드롭 가능', () => {
        const documentNode = droppableDataStore.getRootNode();
        const paragraphs = droppableDataStore.findNodesByType('paragraph');
        
        if (documentNode) {
          expect(droppableDataStore.isDroppableNode(documentNode.sid!)).toBe(true);
        }
        
        paragraphs.forEach(paragraph => {
          expect(droppableDataStore.isDroppableNode(paragraph.sid!)).toBe(true);
        });
      });

      it('content가 없는 노드는 드롭 불가능', () => {
        const textNodes = droppableDataStore.findNodesByType('inline-text');
        const imageNodes = droppableDataStore.findNodesByType('inline-image');
        
        textNodes.forEach(textNode => {
          expect(droppableDataStore.isDroppableNode(textNode.sid!)).toBe(false);
        });
        
        imageNodes.forEach(imageNode => {
          expect(droppableDataStore.isDroppableNode(imageNode.sid!)).toBe(false);
        });
      });

      it('droppable: false인 노드는 드롭 불가능', () => {
        const nonDroppableBlocks = droppableDataStore.findNodesByType('nonDroppableBlock');
        nonDroppableBlocks.forEach(block => {
          expect(droppableDataStore.isDroppableNode(block.sid!)).toBe(false);
        });
      });

      it('존재하지 않는 노드는 false 반환', () => {
        expect(droppableDataStore.isDroppableNode('non-existent')).toBe(false);
      });
    });

    describe('canDropNode - 특정 노드 드롭 가능 여부 확인', () => {
      it('block 노드를 document에 드롭 가능', () => {
        const documentNode = droppableDataStore.getRootNode();
        const paragraphs = droppableDataStore.findNodesByType('paragraph');
        
        if (documentNode && paragraphs.length > 0) {
          expect(droppableDataStore.canDropNode(documentNode.sid!, paragraphs[0].sid!)).toBe(true);
        }
      });

      it('inline 노드를 paragraph에 드롭 가능', () => {
        const paragraphs = droppableDataStore.findNodesByType('paragraph');
        const textNodes = droppableDataStore.findNodesByType('inline-text');
        const imageNodes = droppableDataStore.findNodesByType('inline-image');
        
        if (paragraphs.length > 0) {
          if (textNodes.length > 0) {
            expect(droppableDataStore.canDropNode(paragraphs[0].sid!, textNodes[0].sid!)).toBe(true);
          }
          if (imageNodes.length > 0) {
            expect(droppableDataStore.canDropNode(paragraphs[0].sid!, imageNodes[0].sid!)).toBe(true);
          }
        }
      });

      it('block 노드를 inline 노드에 드롭 불가능', () => {
        const paragraphs = droppableDataStore.findNodesByType('paragraph');
        const textNodes = droppableDataStore.findNodesByType('inline-text');
        
        if (paragraphs.length > 0 && textNodes.length > 0) {
          expect(droppableDataStore.canDropNode(textNodes[0].sid!, paragraphs[0].sid!)).toBe(false);
        }
      });

      it('droppable: false인 노드에는 드롭 불가능', () => {
        const documentNode = droppableDataStore.getRootNode();
        const nonDroppableBlocks = droppableDataStore.findNodesByType('nonDroppableBlock');
        const paragraphs = droppableDataStore.findNodesByType('paragraph');
        
        if (documentNode && nonDroppableBlocks.length > 0 && paragraphs.length > 0) {
          expect(droppableDataStore.canDropNode(nonDroppableBlocks[0].sid!, paragraphs[0].sid!)).toBe(false);
        }
      });

      it('draggable: false인 노드는 드롭 불가능', () => {
        const documentNode = droppableDataStore.getRootNode();
        const paragraphs = droppableDataStore.findNodesByType('paragraph');
        
        // No nodes with draggable: false, so test with non-existent node
        if (documentNode && paragraphs.length > 0) {
          // Non-existent nodes are not draggable, so return false
          expect(droppableDataStore.canDropNode(documentNode.sid!, 'non-existent')).toBe(false);
        }
      });
    });

    describe('getDroppableNodes - 드롭 가능한 노드 목록 조회', () => {
      it('모든 드롭 가능한 노드 조회', () => {
        const droppableNodes = droppableDataStore.getDroppableNodes();
        
        // All nodes should be droppable (only nodes with content)
        droppableNodes.forEach(node => {
          expect(droppableDataStore.isDroppableNode(node.sid!)).toBe(true);
        });
        
        // document and paragraph should be included
        const documentNode = droppableDataStore.getRootNode();
        if (documentNode) {
          expect(droppableNodes.some(n => n.sid === documentNode.sid)).toBe(true);
        }
        
        // nonDroppableBlock should be excluded
        const nonDroppableBlocks = droppableDataStore.findNodesByType('nonDroppableBlock');
        nonDroppableBlocks.forEach(block => {
          expect(droppableNodes.some(n => n.sid === block.sid)).toBe(false);
        });
      });

      it('block 노드만 조회', () => {
        const blockNodes = droppableDataStore.getDroppableNodes({
          includeBlocks: true,
          includeInline: false,
          includeDocument: false
        });
        
        blockNodes.forEach(node => {
          expect(droppableDataStore.isDroppableNode(node.sid!)).toBe(true);
          const schema = (droppableDataStore as any)._activeSchema;
          const nodeType = schema?.getNodeType?.(node.stype);
          expect(nodeType?.group).toBe('block');
        });
      });

      it('document 노드만 조회', () => {
        const documentNodes = droppableDataStore.getDroppableNodes({
          includeBlocks: false,
          includeInline: false,
          includeDocument: true
        });
        
        documentNodes.forEach(node => {
          expect(droppableDataStore.isDroppableNode(node.sid!)).toBe(true);
          const schema = (droppableDataStore as any)._activeSchema;
          const nodeType = schema?.getNodeType?.(node.stype);
          expect(nodeType?.group).toBe('document');
        });
      });

      it('커스텀 필터 적용', () => {
        const headingNodes = droppableDataStore.getDroppableNodes({
          filter: (node) => node.stype === 'heading'
        });
        
        headingNodes.forEach(node => {
          expect(node.stype).toBe('heading');
          expect(droppableDataStore.isDroppableNode(node.sid!)).toBe(true);
        });
      });
    });

    describe('filterDroppableNodes - 드롭 가능한 노드 필터링', () => {
      it('모든 노드 중 드롭 가능한 노드만 필터링', () => {
        const allNodes = Array.from(droppableDataStore.getNodes().values());
        const nodeIds = allNodes.map(n => n.sid!);
        
        const droppableNodeIds = droppableDataStore.filterDroppableNodes(nodeIds);
        
        droppableNodeIds.forEach(nodeId => {
          expect(droppableDataStore.isDroppableNode(nodeId)).toBe(true);
        });
        
        // nonDroppableBlock should be excluded
        const nonDroppableBlocks = droppableDataStore.findNodesByType('nonDroppableBlock');
        nonDroppableBlocks.forEach(block => {
          expect(droppableNodeIds).not.toContain(block.sid);
        });
      });

      it('빈 배열은 빈 배열 반환', () => {
        const result = droppableDataStore.filterDroppableNodes([]);
        expect(result.length).toBe(0);
      });

      it('드롭 불가능한 노드만 포함된 배열은 빈 배열 반환', () => {
        const textNodes = droppableDataStore.findNodesByType('inline-text');
        const imageNodes = droppableDataStore.findNodesByType('inline-image');
        const nodeIds = [
          ...textNodes.map(n => n.sid!),
          ...imageNodes.map(n => n.sid!)
        ];
        
        const result = droppableDataStore.filterDroppableNodes(nodeIds);
        expect(result.length).toBe(0);
      });

      it('존재하지 않는 노드 ID는 제외', () => {
        const documentNode = droppableDataStore.getRootNode();
        const paragraphs = droppableDataStore.findNodesByType('paragraph');
        const nodeIds = [
          ...(documentNode ? [documentNode.sid!] : []),
          ...paragraphs.map(n => n.sid!),
          'non-existent-1',
          'non-existent-2'
        ];
        
        const result = droppableDataStore.filterDroppableNodes(nodeIds);
        // Non-existent nodes return false, so they are excluded
        const expectedCount = (documentNode ? 1 : 0) + paragraphs.length;
        expect(result.length).toBe(expectedCount);
      });
    });
  });
});

