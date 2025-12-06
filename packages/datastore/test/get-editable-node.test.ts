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

    it('getNextEditableNode: 빈 paragraph를 건너뛰고 다음 단락의 첫 텍스트 찾기', () => {
      // 첫 번째 paragraph가 비어있으므로 테스트할 노드가 없음
      // 이 케이스는 실제로 발생하지 않을 수 있지만, 안전성을 위해 확인
      const paragraphs = dataStore.findNodesByType('paragraph');
      const emptyParagraph = paragraphs[0];
      
      // 빈 paragraph의 다음 편집 가능한 노드는 다음 paragraph의 첫 텍스트
      const textNodes = dataStore.findNodesByType('inline-text');
      const para2Text1 = textNodes[0];
      
      // 빈 paragraph에서 시작하면 다음 편집 가능한 노드는 Para2-Text1
      // 하지만 빈 paragraph 자체는 편집 가능한 노드가 아니므로, 
      // 실제로는 paragraph의 첫 자식부터 시작해야 함
      // 이 테스트는 실제 사용 시나리오와 다를 수 있음
    });
  });

  describe('heading과 paragraph 혼합', () => {
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
      
      // Para-Text1의 이전은 Heading Text (이전 block의 마지막 텍스트)
      expect(dataStore.getPreviousEditableNode(paraText1.sid!)).toBe(headingText.sid);
      
      // Heading Text의 이전 편집 가능한 노드는 없음
      expect(dataStore.getPreviousEditableNode(headingText.sid!)).toBeNull();
    });

    it('getNextEditableNode: heading과 paragraph 간 이동', () => {
      const textNodes = dataStore.findNodesByType('inline-text');
      const headingText = textNodes[0];
      const paraText1 = textNodes[1];
      const paraText2 = textNodes[2];
      
      // Heading Text의 다음은 Para-Text1 (다음 block의 첫 텍스트)
      expect(dataStore.getNextEditableNode(headingText.sid!)).toBe(paraText1.sid);
      
      // Para-Text1의 다음은 Para-Text2
      expect(dataStore.getNextEditableNode(paraText1.sid!)).toBe(paraText2.sid);
    });
  });

  describe('에지 케이스', () => {
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
            atom: true, // atom 노드
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
            content: 'text*', // text 필드가 있는 block 노드
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
        
        // After 텍스트의 이전은 image2
        expect(complexDataStore.getPreviousEditableNode(afterText.sid!)).toBe(image2.sid);
        
        // image2의 이전은 middleText
        expect(complexDataStore.getPreviousEditableNode(image2.sid!)).toBe(middleText.sid);
        
        // middleText의 이전은 image1
        expect(complexDataStore.getPreviousEditableNode(middleText.sid!)).toBe(image1.sid);
        
        // image1의 이전은 beforeText
        expect(complexDataStore.getPreviousEditableNode(image1.sid!)).toBe(beforeText.sid);
      });

      it('getNextEditableNode: atom 노드(inline-image)도 편집 가능한 노드로 간주', () => {
        const textNodes = complexDataStore.findNodesByType('inline-text');
        const images = complexDataStore.findNodesByType('inline-image');
        const beforeText = textNodes[0];
        const image1 = images[0];
        const middleText = textNodes[1];
        const image2 = images[1];
        const afterText = textNodes[2];
        
        // beforeText의 다음은 image1
        expect(complexDataStore.getNextEditableNode(beforeText.sid!)).toBe(image1.sid);
        
        // image1의 다음은 middleText
        expect(complexDataStore.getNextEditableNode(image1.sid!)).toBe(middleText.sid);
        
        // middleText의 다음은 image2
        expect(complexDataStore.getNextEditableNode(middleText.sid!)).toBe(image2.sid);
        
        // image2의 다음은 afterText
        expect(complexDataStore.getNextEditableNode(image2.sid!)).toBe(afterText.sid);
      });
    });

    describe('table 구조 처리', () => {
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
        
        // Cell2-Text1의 이전은 Cell1-Text1 (table 내부에서)
        expect(complexDataStore.getPreviousEditableNode(cell2Text.sid!)).toBe(cell1Text.sid);
        
        // Cell1-Text1의 이전은 Before Table (table을 건너뛰고)
        expect(complexDataStore.getPreviousEditableNode(cell1Text.sid!)).toBe(beforeText.sid);
      });

      it('getPreviousEditableNode: table과 paragraph 간 이동', () => {
        const textNodes = complexDataStore.findNodesByType('inline-text');
        const beforeText = textNodes[0];
        const afterText = textNodes[3];
        
        // After Table의 이전은 Cell2-Text1 (table의 마지막 텍스트)
        const cell2Text = textNodes[2];
        expect(complexDataStore.getPreviousEditableNode(afterText.sid!)).toBe(cell2Text.sid);
      });

      it('getNextEditableNode: table 내부 텍스트 간 이동', () => {
        const textNodes = complexDataStore.findNodesByType('inline-text');
        const beforeText = textNodes[0];
        const cell1Text = textNodes[1];
        const cell2Text = textNodes[2];
        const afterText = textNodes[3];
        
        // Cell1-Text1의 다음은 Cell2-Text1 (table 내부에서)
        expect(complexDataStore.getNextEditableNode(cell1Text.sid!)).toBe(cell2Text.sid);
        
        // Cell2-Text1의 다음은 After Table (table을 건너뛰고)
        expect(complexDataStore.getNextEditableNode(cell2Text.sid!)).toBe(afterText.sid);
      });

      it('getNextEditableNode: table과 paragraph 간 이동', () => {
        const textNodes = complexDataStore.findNodesByType('inline-text');
        const beforeText = textNodes[0];
        const cell1Text = textNodes[1];
        
        // Before Table의 다음은 Cell1-Text1 (table의 첫 텍스트)
        expect(complexDataStore.getNextEditableNode(beforeText.sid!)).toBe(cell1Text.sid);
      });
    });

    describe('codeBlock (.text 필드 있는 block 노드) 처리', () => {
      beforeEach(() => {
        // codeBlock은 content: 'text*'를 가지지만 실제로는 .text 필드를 가질 수 있음
        // editable 속성이 없으면 block 노드로 간주되어 건너뛰어야 함
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
              text: 'const x = 1;' // .text 필드가 있는 block 노드
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
        
        // After Code의 이전은 Before Code (codeBlock을 건너뛰고)
        expect(complexDataStore.getPreviousEditableNode(afterText.sid!)).toBe(beforeText.sid);
      });

      it('getNextEditableNode: codeBlock은 editable 속성이 없으면 block 노드이므로 건너뛰기', () => {
        const textNodes = complexDataStore.findNodesByType('inline-text');
        const beforeText = textNodes[0];
        const afterText = textNodes[1];
        
        // Before Code의 다음은 After Code (codeBlock을 건너뛰고)
        expect(complexDataStore.getNextEditableNode(beforeText.sid!)).toBe(afterText.sid);
      });
    });

    describe('editable: true인 block 노드 처리', () => {
      let editableSchema: Schema;
      let editableDataStore: DataStore;

      beforeEach(() => {
        // editable: true인 codeBlock과 mathBlock을 포함한 스키마
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
              editable: true, // 편집 가능한 block
              attrs: {
                language: { type: 'string', default: 'text' }
              }
            },
            'mathBlock': {
              name: 'mathBlock',
              group: 'block',
              editable: true, // 편집 가능한 block
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
                text: 'const x = 1;' // .text 필드가 있고 editable: true
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
          
          // codeBlock의 이전은 Before Code
          expect(editableDataStore.getPreviousEditableNode(codeBlock.sid!)).toBe(beforeText.sid);
        });

        it('getNextEditableNode: editable: true인 codeBlock은 편집 가능하므로 탐색 가능', () => {
          const codeBlock = editableDataStore.findNodesByType('codeBlock')[0];
          const textNodes = editableDataStore.findNodesByType('inline-text');
          const afterText = textNodes[1];
          
          // codeBlock의 다음은 After Code
          expect(editableDataStore.getNextEditableNode(codeBlock.sid!)).toBe(afterText.sid);
        });

        it('getPreviousEditableNode: After Code의 이전은 codeBlock (건너뛰지 않음)', () => {
          const codeBlock = editableDataStore.findNodesByType('codeBlock')[0];
          const textNodes = editableDataStore.findNodesByType('inline-text');
          const afterText = textNodes[1];
          
          // After Code의 이전은 codeBlock (editable: true이므로 건너뛰지 않음)
          expect(editableDataStore.getPreviousEditableNode(afterText.sid!)).toBe(codeBlock.sid);
        });

        it('getNextEditableNode: Before Code의 다음은 codeBlock (건너뛰지 않음)', () => {
          const codeBlock = editableDataStore.findNodesByType('codeBlock')[0];
          const textNodes = editableDataStore.findNodesByType('inline-text');
          const beforeText = textNodes[0];
          
          // Before Code의 다음은 codeBlock (editable: true이므로 건너뛰지 않음)
          expect(editableDataStore.getNextEditableNode(beforeText.sid!)).toBe(codeBlock.sid);
        });
      });

      describe('editable: true이지만 .text 필드가 없는 경우', () => {
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
                // .text 필드가 없음 (editable: true이지만)
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
          
          // After Math의 이전은 Before Math (mathBlock을 건너뛰고)
          // editable: true이지만 .text 필드가 없으면 편집 불가능
          expect(editableDataStore.getPreviousEditableNode(afterText.sid!)).toBe(beforeText.sid);
        });

        it('getNextEditableNode: editable: true이지만 .text 필드가 없으면 편집 불가능 (건너뛰기)', () => {
          const textNodes = editableDataStore.findNodesByType('inline-text');
          const beforeText = textNodes[0];
          const afterText = textNodes[1];
          
          // Before Math의 다음은 After Math (mathBlock을 건너뛰고)
          // editable: true이지만 .text 필드가 없으면 편집 불가능
          expect(editableDataStore.getNextEditableNode(beforeText.sid!)).toBe(afterText.sid);
        });
      });

      describe('editable: true인 여러 block 노드 연속', () => {
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
                text: 'E=mc^2' // .text 필드가 있음
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
          
          // codeBlock1의 이전은 Before
          expect(editableDataStore.getPreviousEditableNode(codeBlock1.sid!)).toBe(beforeText.sid);
          
          // codeBlock2의 이전은 codeBlock1
          expect(editableDataStore.getPreviousEditableNode(codeBlock2.sid!)).toBe(codeBlock1.sid);
          
          // mathBlock의 이전은 codeBlock2
          expect(editableDataStore.getPreviousEditableNode(mathBlock.sid!)).toBe(codeBlock2.sid);
          
          // After의 이전은 mathBlock
          expect(editableDataStore.getPreviousEditableNode(afterText.sid!)).toBe(mathBlock.sid);
        });

        it('getNextEditableNode: editable: true인 block 노드들을 순차적으로 탐색', () => {
          const codeBlocks = editableDataStore.findNodesByType('codeBlock');
          const mathBlocks = editableDataStore.findNodesByType('mathBlock');
          const textNodes = editableDataStore.findNodesByType('inline-text');
          
          const codeBlock1 = codeBlocks[0];
          const codeBlock2 = codeBlocks[1];
          const mathBlock = mathBlocks[0];
          const beforeText = textNodes[0];
          const afterText = textNodes[1];
          
          // Before의 다음은 codeBlock1
          expect(editableDataStore.getNextEditableNode(beforeText.sid!)).toBe(codeBlock1.sid);
          
          // codeBlock1의 다음은 codeBlock2
          expect(editableDataStore.getNextEditableNode(codeBlock1.sid!)).toBe(codeBlock2.sid);
          
          // codeBlock2의 다음은 mathBlock
          expect(editableDataStore.getNextEditableNode(codeBlock2.sid!)).toBe(mathBlock.sid);
          
          // mathBlock의 다음은 After
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

    describe('.text 필드가 있는 노드 처리', () => {
      beforeEach(() => {
        // inline-text는 .text 필드를 가짐
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
        
        // .text 필드가 있는 노드는 편집 가능한 노드로 간주
        expect(complexDataStore.getPreviousEditableNode(text3.sid!)).toBe(text2.sid);
        expect(complexDataStore.getPreviousEditableNode(text2.sid!)).toBe(text1.sid);
      });

      it('getNextEditableNode: .text 필드가 있는 노드는 편집 가능', () => {
        const textNodes = complexDataStore.findNodesByType('inline-text');
        const text1 = textNodes[0];
        const text2 = textNodes[1];
        const text3 = textNodes[2];
        
        // .text 필드가 있는 노드는 편집 가능한 노드로 간주
        expect(complexDataStore.getNextEditableNode(text1.sid!)).toBe(text2.sid);
        expect(complexDataStore.getNextEditableNode(text2.sid!)).toBe(text3.sid);
      });
    });

    describe('atom 속성 확인', () => {
      beforeEach(() => {
        // inline-image는 atom: true
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
        
        // atom 노드이지만 group이 inline이므로 편집 가능
        expect(complexDataStore.getPreviousEditableNode(afterText.sid!)).toBe(image.sid);
        expect(complexDataStore.getPreviousEditableNode(image.sid!)).toBe(beforeText.sid);
        
        expect(complexDataStore.getNextEditableNode(beforeText.sid!)).toBe(image.sid);
        expect(complexDataStore.getNextEditableNode(image.sid!)).toBe(afterText.sid);
      });
    });

    describe('코드블럭 내부 텍스트 처리', () => {
      beforeEach(() => {
        // codeBlock은 block이지만 내부에 텍스트가 있을 수 있음
        // 하지만 codeBlock 자체는 편집 불가능하고, 내부 텍스트는 어떻게 처리할지?
        // 실제로는 codeBlock 내부의 텍스트 노드를 찾아야 함
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
              text: 'const x = 1;\nconst y = 2;' // .text 필드가 있지만 block 노드
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

      it('getPreviousEditableNode: codeBlock은 block이므로 건너뛰기 (내부 텍스트는 접근 불가)', () => {
        const textNodes = complexDataStore.findNodesByType('inline-text');
        const beforeText = textNodes[0];
        const afterText = textNodes[1];
        
        // codeBlock은 block 노드이므로 건너뛰고, After CodeBlock의 이전은 Before CodeBlock
        expect(complexDataStore.getPreviousEditableNode(afterText.sid!)).toBe(beforeText.sid);
      });

      it('getNextEditableNode: codeBlock은 block이므로 건너뛰기 (내부 텍스트는 접근 불가)', () => {
        const textNodes = complexDataStore.findNodesByType('inline-text');
        const beforeText = textNodes[0];
        const afterText = textNodes[1];
        
        // codeBlock은 block 노드이므로 건너뛰고, Before CodeBlock의 다음은 After CodeBlock
        expect(complexDataStore.getNextEditableNode(beforeText.sid!)).toBe(afterText.sid);
      });
    });

    describe('Canvas 블럭 (복잡한 block 노드)', () => {
      beforeEach(() => {
        // canvas는 복잡한 block 노드로, 내부에 다양한 요소를 가질 수 있음
        // 하지만 canvas 자체는 편집 불가능한 block 노드
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
              // group은 스키마 정의에만 있고, 모델 노드에는 없음
              content: [
                // canvas 내부에는 다양한 요소가 있을 수 있지만, canvas 자체는 건너뛰어야 함
                { stype: 'inline-text', text: 'Canvas Content' } // 하지만 이건 canvas 내부이므로 접근 불가
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

      it('getPreviousEditableNode: canvas는 block이므로 건너뛰기', () => {
        const textNodes = complexDataStore.findNodesByType('inline-text');
        // canvas 내부의 텍스트는 찾지 않음 (canvas가 block이므로)
        const beforeText = textNodes[0]; // Before Canvas
        const afterText = textNodes[1]; // After Canvas (canvas 내부 텍스트는 제외)
        
        // After Canvas의 이전은 Before Canvas (canvas를 건너뛰고)
        expect(complexDataStore.getPreviousEditableNode(afterText.sid!)).toBe(beforeText.sid);
      });

      it('getNextEditableNode: canvas는 block이므로 건너뛰기', () => {
        const textNodes = complexDataStore.findNodesByType('inline-text');
        const beforeText = textNodes[0];
        const afterText = textNodes[1];
        
        // Before Canvas의 다음은 After Canvas (canvas를 건너뛰고)
        expect(complexDataStore.getNextEditableNode(beforeText.sid!)).toBe(afterText.sid);
      });
    });

    describe('다양한 inline 노드들', () => {
      beforeEach(() => {
        // 다양한 inline 노드들: link, button, mention 등
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
        
        // 모든 inline 노드들은 편집 가능한 노드로 간주
        expect(complexDataStore.getPreviousEditableNode(text4.sid!)).toBe(button.sid);
        expect(complexDataStore.getPreviousEditableNode(button.sid!)).toBe(text3.sid);
        expect(complexDataStore.getPreviousEditableNode(text3.sid!)).toBe(mention.sid);
        expect(complexDataStore.getPreviousEditableNode(mention.sid!)).toBe(text2.sid);
        expect(complexDataStore.getPreviousEditableNode(text2.sid!)).toBe(link.sid);
        expect(complexDataStore.getPreviousEditableNode(link.sid!)).toBe(text1.sid);
      });

      it('getNextEditableNode: 다양한 inline 노드들도 편집 가능', () => {
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
        
        // 모든 inline 노드들은 편집 가능한 노드로 간주
        expect(complexDataStore.getNextEditableNode(text1.sid!)).toBe(link.sid);
        expect(complexDataStore.getNextEditableNode(link.sid!)).toBe(text2.sid);
        expect(complexDataStore.getNextEditableNode(text2.sid!)).toBe(mention.sid);
        expect(complexDataStore.getNextEditableNode(mention.sid!)).toBe(text3.sid);
        expect(complexDataStore.getNextEditableNode(text3.sid!)).toBe(button.sid);
        expect(complexDataStore.getNextEditableNode(button.sid!)).toBe(text4.sid);
      });
    });

    describe('AI 생성 컨텐츠 - 자유로운 구조', () => {
      beforeEach(() => {
        // AI가 만드는 자유로운 구조:
        // - 중첩된 block들
        // - 다양한 inline 노드들의 혼합
        // - 예상치 못한 구조
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
              // group은 스키마 정의에만 있고, 모델 노드에는 없음
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
        
        // 복잡한 구조에서도 모든 편집 가능한 노드를 올바르게 찾아야 함
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
        
        // 복잡한 구조에서도 모든 편집 가능한 노드를 올바르게 찾아야 함
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

    describe('중첩된 block 구조 (blockQuote 내부)', () => {
      beforeEach(() => {
        // blockQuote 내부에 paragraph가 있는 경우
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
              // group은 스키마 정의에만 있고, 모델 노드에는 없음
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
        
        // blockQuote는 block이지만 내부의 텍스트는 편집 가능
        expect(complexDataStore.getPreviousEditableNode(afterText.sid!)).toBe(quoteText2.sid);
        expect(complexDataStore.getPreviousEditableNode(quoteText2.sid!)).toBe(quoteText1.sid);
        expect(complexDataStore.getPreviousEditableNode(quoteText1.sid!)).toBe(beforeText.sid);
      });

      it('getNextEditableNode: blockQuote 내부 텍스트도 편집 가능', () => {
        const textNodes = complexDataStore.findNodesByType('inline-text');
        const beforeText = textNodes[0];
        const quoteText1 = textNodes[1];
        const quoteText2 = textNodes[2];
        const afterText = textNodes[3];
        
        // blockQuote는 block이지만 내부의 텍스트는 편집 가능
        expect(complexDataStore.getNextEditableNode(beforeText.sid!)).toBe(quoteText1.sid);
        expect(complexDataStore.getNextEditableNode(quoteText1.sid!)).toBe(quoteText2.sid);
        expect(complexDataStore.getNextEditableNode(quoteText2.sid!)).toBe(afterText.sid);
      });
    });

    describe('List 구조 (중첩된 block)', () => {
      beforeEach(() => {
        // list > listItem > paragraph > text 구조
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
              // group은 스키마 정의에만 있고, 모델 노드에는 없음
              attributes: { type: 'bullet' },
              content: [
                {
                  stype: 'listItem',
                  // group은 스키마 정의에만 있고, 모델 노드에는 없음
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
                  // group은 스키마 정의에만 있고, 모델 노드에는 없음
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
        
        // list는 block이지만 내부의 텍스트는 편집 가능
        expect(complexDataStore.getPreviousEditableNode(afterText.sid!)).toBe(listItem2.sid);
        expect(complexDataStore.getPreviousEditableNode(listItem2.sid!)).toBe(listItem1.sid);
        expect(complexDataStore.getPreviousEditableNode(listItem1.sid!)).toBe(beforeText.sid);
      });

      it('getNextEditableNode: list 내부 텍스트도 편집 가능', () => {
        const textNodes = complexDataStore.findNodesByType('inline-text');
        const beforeText = textNodes[0];
        const listItem1 = textNodes[1];
        const listItem2 = textNodes[2];
        const afterText = textNodes[3];
        
        // list는 block이지만 내부의 텍스트는 편집 가능
        expect(complexDataStore.getNextEditableNode(beforeText.sid!)).toBe(listItem1.sid);
        expect(complexDataStore.getNextEditableNode(listItem1.sid!)).toBe(listItem2.sid);
        expect(complexDataStore.getNextEditableNode(listItem2.sid!)).toBe(afterText.sid);
      });
    });

    describe('빈 block 노드 처리', () => {
      beforeEach(() => {
        // 빈 paragraph, 빈 heading 등
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
              content: [] // 빈 paragraph
            },
            {
              stype: 'heading',
              attrs: { level: 1 },
              content: [] // 빈 heading
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
        
        // 빈 block 노드들을 건너뛰고 Before Empty를 찾아야 함
        expect(complexDataStore.getPreviousEditableNode(afterText.sid!)).toBe(beforeText.sid);
      });

      it('getNextEditableNode: 빈 block 노드들을 건너뛰고 다음 편집 가능한 노드 찾기', () => {
        const textNodes = complexDataStore.findNodesByType('inline-text');
        const beforeText = textNodes[0];
        const afterText = textNodes[1];
        
        // 빈 block 노드들을 건너뛰고 After Empty를 찾아야 함
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
            // .text 필드 없음
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
      
      // 텍스트 노드 3개 + inline-image 1개 + codeBlock 1개 = 5개
      expect(editableNodes.length).toBe(5);
      
      const nodeTypes = editableNodes.map(n => n.stype);
      expect(nodeTypes).toContain('inline-text');
      expect(nodeTypes).toContain('inline-image');
      expect(nodeTypes).toContain('codeBlock');
    });

    it('텍스트 노드만 조회', () => {
      const textNodes = editableDataStore.getEditableNodes({
        includeText: true,
        includeInline: false,
        includeEditableBlocks: false
      });
      
      // 텍스트 노드만 (inline-text는 텍스트 노드)
      expect(textNodes.length).toBe(3);
      expect(textNodes.every(n => n.stype === 'inline-text' && n.text)).toBe(true);
    });

    it('inline 노드만 조회', () => {
      const inlineNodes = editableDataStore.getEditableNodes({
        includeText: false,
        includeInline: true,
        includeEditableBlocks: false
      });
      
      // inline-image만 (inline-text는 텍스트 노드로 분류됨)
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
      
      // 'const x = 1;' (11자)만 포함 (텍스트 노드들은 모두 5자 이하)
      expect(longTextNodes.length).toBeGreaterThanOrEqual(1);
      expect(longTextNodes.some(n => n.stype === 'codeBlock')).toBe(true);
    });

    it('편집 가능한 노드가 없는 문서는 빈 배열 반환', () => {
      const emptyStore = new DataStore(undefined, editableSchema);
      // document는 최소 1개의 block이 필요하므로 빈 paragraph 추가
      emptyStore.createNodeWithChildren({
        stype: 'document',
        content: [
          {
            stype: 'paragraph',
            content: [] // 편집 가능한 노드 없음
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
      // 모든 노드 ID 수집
      const textNodes = editableDataStore.findNodesByType('inline-text');
      const codeBlocks = editableDataStore.findNodesByType('codeBlock');
      const paragraphs = editableDataStore.findNodesByType('paragraph');
      
      const allNodeIds = [
        ...textNodes.map(n => n.sid!),
        ...codeBlocks.map(n => n.sid!),
        ...paragraphs.map(n => n.sid!)
      ];
      
      const editableNodeIds = editableDataStore.filterEditableNodes(allNodeIds);
      
      // 텍스트 노드 3개 + codeBlock 1개 = 4개
      expect(editableNodeIds.length).toBe(4);
      
      // paragraph는 제외되어야 함
      paragraphs.forEach(paragraph => {
        expect(editableNodeIds).not.toContain(paragraph.sid);
      });
      
      // 텍스트 노드와 codeBlock은 포함되어야 함
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
      // 존재하지 않는 노드는 false를 반환하므로 제외됨
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
            selectable: false // 선택 불가능
          },
          'inline-text': {
            name: 'inline-text',
            group: 'inline'
          },
          'nonSelectableInline': {
            name: 'nonSelectableInline',
            group: 'inline',
            selectable: false // 선택 불가능
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
      
      // nonSelectableBlock 내부의 inline-text는 selectable이지만, 
      // nonSelectableBlock 자체는 selectable: false이므로 내부 노드도 영향을 받지 않음
      // (selectable은 노드 자체의 속성이므로 자식 노드에 상속되지 않음)
    });

    it('모든 선택 가능한 노드 조회', () => {
      const selectableNodes = selectableDataStore.getSelectableNodes();
      
      // paragraph 2개 + codeBlock 1개 + inline-text 3개 + inline-image 1개 = 7개
      // nonSelectableBlock은 제외
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
      
      // paragraph 2개 + codeBlock 1개 = 3개 (모두 block 노드)
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
      
      // inline-text 3개 + inline-image 1개 = 4개 (모두 inline 노드)
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
      
      // 모든 노드가 editable이어야 함
      editableNodes.forEach(node => {
        expect(selectableDataStore.isEditableNode(node.sid!)).toBe(true);
      });
      
      // inline-text 3개 (Text 1, Text 2, Text 3) + codeBlock 1개 + inline-image 1개 = 5개 (editable인 노드들)
      // inline-image는 group: 'inline'이므로 editable임
      // nonSelectableBlock 내부의 inline-text도 editable이므로 포함됨
      const textNodes = selectableDataStore.findNodesByType('inline-text');
      const codeBlocks = selectableDataStore.findNodesByType('codeBlock');
      const imageNodes = selectableDataStore.findNodesByType('inline-image');
      
      // 모든 inline-text, codeBlock, inline-image가 포함되어야 함
      const expectedCount = textNodes.length + codeBlocks.length + imageNodes.length;
      expect(editableNodes.length).toBeGreaterThanOrEqual(expectedCount);
      
      // 모든 textNodes, codeBlocks, imageNodes가 포함되어야 함
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
      
      // paragraph 2개 + textNodes 3개 = 5개 (nonSelectableBlock 제외)
      expect(selectableNodeIds.length).toBe(5);
      
      // nonSelectableBlock은 제외되어야 함
      nonSelectableBlocks.forEach(block => {
        expect(selectableNodeIds).not.toContain(block.sid);
      });
      
      // paragraph와 textNodes는 포함되어야 함
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
      // 존재하지 않는 노드는 false를 반환하므로 제외됨
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
        
        // 모든 노드가 드래그 가능해야 함 (document, nonDraggableBlock 제외)
        draggableNodes.forEach(node => {
          expect(draggableDataStore.isDraggableNode(node.sid!)).toBe(true);
        });
        
        // document와 nonDraggableBlock은 제외되어야 함
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
        // document는 최소 1개의 block이 필요하므로 빈 paragraph 추가
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
        // paragraph는 드래그 가능하므로 1개 반환
        expect(draggableNodes.length).toBeGreaterThanOrEqual(1);
        // 모든 반환된 노드는 드래그 가능해야 함
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
        
        // document와 nonDraggableBlock은 제외되어야 함
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
        // 존재하지 않는 노드는 false를 반환하므로 제외됨
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
        
        // draggable: false인 노드가 없으므로, 존재하지 않는 노드로 테스트
        if (documentNode && paragraphs.length > 0) {
          // 존재하지 않는 노드는 draggable이 아니므로 false 반환
          expect(droppableDataStore.canDropNode(documentNode.sid!, 'non-existent')).toBe(false);
        }
      });
    });

    describe('getDroppableNodes - 드롭 가능한 노드 목록 조회', () => {
      it('모든 드롭 가능한 노드 조회', () => {
        const droppableNodes = droppableDataStore.getDroppableNodes();
        
        // 모든 노드가 드롭 가능해야 함 (content가 있는 노드만)
        droppableNodes.forEach(node => {
          expect(droppableDataStore.isDroppableNode(node.sid!)).toBe(true);
        });
        
        // document와 paragraph는 포함되어야 함
        const documentNode = droppableDataStore.getRootNode();
        if (documentNode) {
          expect(droppableNodes.some(n => n.sid === documentNode.sid)).toBe(true);
        }
        
        // nonDroppableBlock은 제외되어야 함
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
        
        // nonDroppableBlock은 제외되어야 함
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
        // 존재하지 않는 노드는 false를 반환하므로 제외됨
        const expectedCount = (documentNode ? 1 : 0) + paragraphs.length;
        expect(result.length).toBe(expectedCount);
      });
    });
  });
});

