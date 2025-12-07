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

    it('movement in correct order in deep nesting', () => {
      const allNodes = dataStore.getAllNodes();
      const nodeMap = new Map(allNodes.map(node => [node.sid!, node]));
      
      // Collect node IDs in document order
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
      
      // Expected order: document > heading > text > paragraph > text > list > listItem-1 > paragraph > text > paragraph > text > listItem-2 > paragraph > text > paragraph > text
      expect(documentOrder.length).toBeGreaterThan(10);
      
      // First is document
      expect(nodeMap.get(documentOrder[0])?.stype).toBe('document');
      
      // Last is text of conclusion paragraph
      const lastNode = nodeMap.get(documentOrder[documentOrder.length - 1]);
      expect(lastNode?.stype).toBe('inline-text');
      expect(lastNode?.text).toBe('Conclusion paragraph');
    });

    it('correct order inside listItem', () => {
      const listItems = dataStore.findNodesByType('listItem');
      const firstListItem = listItems[0];
      
      // First child of listItem-1 (paragraph)
      const firstChild = dataStore.getNextNode(firstListItem.sid!);
      expect(firstChild).toBeTruthy();
      
      const firstChildNode = dataStore.getNode(firstChild!);
      expect(firstChildNode?.stype).toBe('paragraph');
      
      // First child of that paragraph (text)
      const firstText = dataStore.getNextNode(firstChild!);
      expect(firstText).toBeTruthy();
      
      const firstTextNode = dataStore.getNode(firstText!);
      expect(firstTextNode?.stype).toBe('inline-text');
      expect(firstTextNode?.text).toBe('First list item paragraph 1');
    });
  });

  describe('Edge case deep validation', () => {
    beforeEach(() => {
      // Single node document
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

    it('behavior with single node', () => {
      const document = dataStore.findNodesByType('document')[0];
      const paragraph = dataStore.findNodesByType('paragraph')[0];
      const text = dataStore.findNodesByType('inline-text')[0];
      
      // document -> paragraph
      expect(dataStore.getNextNode(document.sid!)).toBe(paragraph.sid);
      
      // paragraph -> text
      expect(dataStore.getNextNode(paragraph.sid!)).toBe(text.sid);
      
      // text -> null (last)
      expect(dataStore.getNextNode(text.sid!)).toBeNull();
    });
  });

  describe('Empty content node validation', () => {
    beforeEach(() => {
      // Document with empty paragraph
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
            content: [] // Empty paragraph
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

    it('handle empty content node', () => {
      const paragraphs = dataStore.findNodesByType('paragraph');
      const emptyParagraph = paragraphs[1];
      
      // Empty paragraph has no children, so move to next sibling
      const nextAfterEmpty = dataStore.getNextNode(emptyParagraph.sid!);
      expect(nextAfterEmpty).toBeTruthy();
      
      const nextNode = dataStore.getNode(nextAfterEmpty!);
      expect(nextNode?.stype).toBe('paragraph');
      expect(nextNode?.content?.length).toBe(1); // Third paragraph
    });
  });

  describe('Performance and complexity validation', () => {
    beforeEach(() => {
      // Deep nested structure (3 levels) - using createNodeWithChildren
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

    it('performance test in deep nesting', () => {
      const startTime = performance.now();
      
      // Traverse all nodes
      let currentId = dataStore.getRootNodeId() as string;
      let count = 0;
      
      while (currentId && count < 100) { // Prevent infinite loop
        currentId = dataStore.getNextNode(currentId) as string;
        count++;
      }
      
      const endTime = performance.now();
      const duration = endTime - startTime;
      
      console.log(`Traversed ${count} nodes in ${duration.toFixed(2)}ms`);
      
      // Performance criteria: traverse 100 nodes within 10ms
      expect(duration).toBeLessThan(10);
      expect(count).toBeGreaterThan(5); // Must traverse at least 5 nodes
    });
  });

  describe('Error case validation', () => {
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

    it('call with non-existent node ID', () => {
      expect(() => {
        dataStore.getNextNode('non-existent-sid');
      }).toThrow('Node not found: non-existent-sid');
    });

    it('call with empty string', () => {
      expect(() => {
        dataStore.getNextNode('');
      }).toThrow('Node not found: ');
    });

    it('call with null', () => {
      expect(() => {
        dataStore.getNextNode(null as any);
      }).toThrow();
    });

    it('call with undefined', () => {
      expect(() => {
        dataStore.getNextNode(undefined as any);
      }).toThrow();
    });
  });

  describe('Real editor scenario validation', () => {
    beforeEach(() => {
      // Complex document structure similar to main.ts
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

    it('validate order in real editor document', () => {
      const allNodes = dataStore.getAllNodes();
      const textNodes = allNodes.filter(node => node.stype === 'inline-text');
      
      // Start from first heading's text
      const firstHeading = dataStore.findNodesByType('heading')[0];
      const firstText = dataStore.getNextNode(firstHeading.sid!);
      
      expect(firstText).toBeTruthy();
      const firstTextNode = dataStore.getNode(firstText!);
      expect(firstTextNode?.text).toBe('BaroCSS Editor Demo');
      
      // Traverse all text nodes in order
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
      
      // Verify expected order
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

    it('move between text nodes with marks applied', () => {
      const textNodes = dataStore.findNodesByType('inline-text');
      const boldText = textNodes.find(node => node.text === 'bold text');
      const italicText = textNodes.find(node => node.text === 'italic text');
      
      expect(boldText).toBeTruthy();
      expect(italicText).toBeTruthy();
      
      // Next after bold text is " and this is "
      const nextAfterBold = dataStore.getNextNode(boldText!.sid!);
      const nextNode = dataStore.getNode(nextAfterBold!);
      expect(nextNode?.text).toBe(' and this is ');
      
      // Next after " and this is " is italic text
      const nextAfterSpace = dataStore.getNextNode(nextAfterBold!);
      const italicNode = dataStore.getNode(nextAfterSpace!);
      expect(italicNode?.text).toBe('italic text');
    });
  });

  describe('Memory and reference integrity validation', () => {
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

    it('getNextNode behavior after node deletion', () => {
      const textNodes = dataStore.findNodesByType('inline-text');
      const middleNode = textNodes[1]; // "Node 2"
      
      // Delete middle node
      dataStore.deleteNode(middleNode.sid!);
      
      // Next after first node is now third node
      const firstNode = textNodes[0];
      const nextAfterFirst = dataStore.getNextNode(firstNode.sid!);
      const thirdNode = textNodes[2];
      
      expect(nextAfterFirst).toBe(thirdNode.sid);
    });

    it('getNextNode behavior after node addition', () => {
      const textNodes = dataStore.findNodesByType('inline-text');
      const firstNode = textNodes[0];
      const parent = dataStore.getNode(textNodes[0].parentId!);
      
      // Create new node (using createNodeWithChildren)
      const newDocument = dataStore.createNodeWithChildren({
        stype: 'paragraph',
        content: [
          { stype: 'inline-text', text: 'New Node' }
        ]
      });
      
      const newTextId = newDocument.content[0] as string;
      
      // Add new node to parent's content array
      if (parent?.content) {
        const firstIndex = parent.content.indexOf(firstNode.sid!);
        parent.content.splice(firstIndex + 1, 0, newTextId);
        dataStore.updateNode(parent.sid!, { content: parent.content });
        
        // Update new node's parentId
        dataStore.updateNode(newTextId, { parentId: parent.sid });
      }
      
      // Next of first node should be newly added node
      const nextAfterFirst = dataStore.getNextNode(firstNode.sid!);
      expect(nextAfterFirst).toBe(newTextId);
      
      // Next of new node should be original second node
      const nextAfterNew = dataStore.getNextNode(newTextId);
      expect(nextAfterNew).toBe(textNodes[1].sid);
    });
  });
});
