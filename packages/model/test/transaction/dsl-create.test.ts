import { describe, it, expect, beforeEach } from 'vitest';
import { DataStore } from '@barocss/datastore';
import { Schema } from '@barocss/schema';
import { transaction, node, textNode, mark } from '../../src/transaction-dsl';
import { create } from '../../src/operations-dsl/create';
// Import operations to register them
import '../../src/operations/register-operations';

describe('DSL Create Operations', () => {
  let dataStore: DataStore;
  let mockEditor: any;

  beforeEach(() => {
    // Create a schema matching main.ts structure
    const schema = new Schema('test-schema', {
      nodes: {
        document: { name: 'document', content: 'block+', group: 'document' },
        paragraph: { name: 'paragraph', content: 'inline*', group: 'block' },
        heading: { name: 'heading', content: 'inline*', group: 'block', attrs: { level: { type: 'number', required: true } } },
        'inline-text': { name: 'inline-text', group: 'inline' },
        list: { name: 'list', content: 'listItem+', group: 'block', attrs: { type: { type: 'string', default: 'bullet' } } },
        listItem: { name: 'listItem', content: 'block+', group: 'block' },
        codeBlock: { name: 'codeBlock', group: 'block', atom: true, attrs: { language: { type: 'string', required: false } } },
        pageBreak: { name: 'pageBreak', group: 'block', atom: true },
        'inline-image': { name: 'inline-image', group: 'inline', atom: true, attrs: { src: { type: 'string', required: true }, alt: { type: 'string', required: false } } }
      },
      marks: {
        bold: { name: 'bold', group: 'text-style', attrs: { weight: { type: 'string', default: 'bold' } } },
        italic: { name: 'italic', group: 'text-style', attrs: { style: { type: 'string', default: 'italic' } } },
        link: { name: 'link', group: 'text-style', attrs: { href: { type: 'string', required: true }, title: { type: 'string', required: false } } }
      },
      topNode: 'document'
    });

    dataStore = new DataStore(undefined, schema);
    dataStore.setActiveSchema(schema);

    mockEditor = {
      dataStore,
      _dataStore: dataStore,
      getActiveSchema: () => schema,
      selectionManager: {
        clone: () => ({
          getCurrentSelection: () => null,
          selectRange: () => {},
          selectNode: () => {},
          clearSelection: () => {}
        })
      }
    };
  });

  describe('Basic Node Creation', () => {
    it('should create a simple text node', async () => {
      const result = await transaction(mockEditor, [
        create(node('paragraph', {}, [
          textNode('inline-text', 'Hello World')
        ]))
      ]).commit();

      expect(result.success).toBe(true);
      expect(result.operations).toHaveLength(1);
      expect(result.operations?.[0].type).toBe('create');
      expect(result.operations?.[0].result.data.type).toBe('paragraph');
      // Filter out undefined values from content array
      const validContent = result.operations?.[0].result.data.content.filter((item: any) => item !== undefined);
      expect(validContent).toHaveLength(1);
      
      // The content array contains node IDs, not node objects
      // We need to get the actual node from DataStore
      const childNodeId = validContent[0];
      expect(typeof childNodeId).toBe('string');
      
      // Get the actual child node from DataStore
      const childNode = dataStore.getNode(childNodeId);
      expect(childNode).toBeDefined();
      expect(childNode?.type).toBe('inline-text');
      expect(childNode?.text).toBe('Hello World');
      expect(childNode?.sid).toBeDefined();
    });

    it('should create a paragraph with single inline-text child', async () => {
      const result = await transaction(mockEditor, [
        create(node('paragraph', {}, [
          textNode('inline-text', 'text text')
        ]))
      ]).commit();

      if (!result.success) {
        console.log('Transaction failed:', result.errors);
      }
      expect(result.success).toBe(true);
      expect(result.operations).toHaveLength(1);
      expect(result.operations?.[0].type).toBe('create');
      expect(result.operations?.[0].result.data.type).toBe('paragraph');
      
      // Filter out undefined values from content array
      const validContent = result.operations?.[0].result.data.content.filter((item: any) => item !== undefined);
      expect(validContent).toHaveLength(1);
      
      // The content array contains node IDs, not node objects
      const childNodeId = validContent[0];
      expect(typeof childNodeId).toBe('string');
      
      // Get the actual child node from DataStore
      const childNode = dataStore.getNode(childNodeId);
      expect(childNode).toBeDefined();
      expect(childNode?.type).toBe('inline-text');
      expect(childNode?.text).toBe('text text');
    });

    it('should create paragraph with multiple inline-text children and marks', async () => {
      const result = await transaction(mockEditor, [
        create(node('paragraph', {}, [
          textNode('inline-text', 'Hello ', [mark('italic')]),
          textNode('inline-text', 'World', [mark('bold')]),
          textNode('inline-text', '!', [])
        ]))
      ]).commit();

      if (!result.success) {
        console.log('Transaction failed:', result.errors);
      }
      expect(result.success).toBe(true);
      expect(result.operations).toHaveLength(1);
      expect(result.operations?.[0].type).toBe('create');
      expect(result.operations?.[0].result.data.type).toBe('paragraph');
      
      // Filter out undefined values from content array
      const validContent = result.operations?.[0].result.data.content.filter((item: any) => item !== undefined);
      expect(validContent).toHaveLength(3);
      
      // Get the actual child nodes from DataStore
      const child1 = dataStore.getNode(validContent[0]);
      const child2 = dataStore.getNode(validContent[1]);
      const child3 = dataStore.getNode(validContent[2]);
      
      expect(child1?.text).toBe('Hello ');
      expect(child1?.marks).toEqual([{ type: 'italic', attrs: {}, range: undefined }]);
      expect(child2?.text).toBe('World');
      expect(child2?.marks).toEqual([{ type: 'bold', attrs: {}, range: undefined }]);
      expect(child3?.text).toBe('!');
      expect(child3?.marks).toEqual([]);
    });
  });

  describe('Node with Attributes', () => {
    it('should create heading with level attribute', async () => {
      const result = await transaction(mockEditor, [
        create(node('heading', { level: 1 }, [
          textNode('inline-text', 'Document Title')
        ]))
      ]).commit();

      if (!result.success) {
        console.log('Transaction failed:', result.errors);
      }
      expect(result.success).toBe(true);
      expect(result.operations).toHaveLength(1);
      expect(result.operations?.[0].type).toBe('create');
      expect(result.operations?.[0].result.data.type).toBe('heading');
      expect(result.operations?.[0].result.data.attributes.level).toBe(1);
    });

    it('should create code block with language attribute', async () => {
      const result = await transaction(mockEditor, [
        create(textNode('codeBlock', 'const x = 1;', { language: 'typescript' }))
      ]).commit();

      if (!result.success) {
        console.log('Transaction failed:', result.errors);
      }
      expect(result.success).toBe(true);
      expect(result.operations).toHaveLength(1);
      expect(result.operations?.[0].type).toBe('create');
      expect(result.operations?.[0].result.data.type).toBe('codeBlock');
      expect(result.operations?.[0].result.data.attributes.language).toBe('typescript');
      expect(result.operations?.[0].result.data.text).toBe('const x = 1;');
    });

    it('should create list with type attribute', async () => {
      const result = await transaction(mockEditor, [
        create(node('list', { type: 'bullet' }, [
          node('listItem', {}, [
            node('paragraph', {}, [
              textNode('inline-text', 'First item')
            ])
          ])
        ]))
      ]).commit();

      if (!result.success) {
        console.log('Transaction failed:', result.errors);
      }
      expect(result.success).toBe(true);
      expect(result.operations).toHaveLength(1);
      expect(result.operations?.[0].type).toBe('create');
      expect(result.operations?.[0].result.data.type).toBe('list');
      expect(result.operations?.[0].result.data.attributes.type).toBe('bullet');
    });
  });

  describe('Deep Nested Structures', () => {
    it('should create heading with inline-text content', async () => {
      const result = await transaction(mockEditor, [
        create(node('heading', { level: 1 }, [
          textNode('inline-text', 'Deep Heading Text')
        ]))
      ]).commit();

      if (!result.success) {
        console.log('Transaction failed:', result.errors);
      }
      expect(result.success).toBe(true);
      expect(result.operations).toHaveLength(1);
      expect(result.operations?.[0].type).toBe('create');
      expect(result.operations?.[0].result.data.type).toBe('heading');
      expect(result.operations?.[0].result.data.attributes.level).toBe(1);
      
      // Filter out undefined values from content array
      const validContent = result.operations?.[0].result.data.content.filter((item: any) => item !== undefined);
      expect(validContent).toHaveLength(1);
      
      // Get the actual child node from DataStore
      const childNode = dataStore.getNode(validContent[0]);
      expect(childNode?.type).toBe('inline-text');
      expect(childNode?.text).toBe('Deep Heading Text');
    });

    it('should create complex nested list structure', async () => {
      const result = await transaction(mockEditor, [
        create(node('list', { type: 'ordered' }, [
          node('listItem', {}, [
            node('paragraph', {}, [
              textNode('inline-text', 'First item')
            ])
          ]),
          node('listItem', {}, [
            node('list', { type: 'bullet' }, [
              node('listItem', {}, [
                node('paragraph', {}, [
                  textNode('inline-text', 'Nested item')
                ])
              ])
            ])
          ])
        ]))
      ]).commit();

      if (!result.success) {
        console.log('Transaction failed:', result.errors);
      }
      expect(result.success).toBe(true);
      expect(result.operations).toHaveLength(1);
      expect(result.operations?.[0].type).toBe('create');
      expect(result.operations?.[0].result.data.type).toBe('list');
      
      // Filter out undefined values from content array
      const validContent = result.operations?.[0].result.data.content.filter((item: any) => item !== undefined);
      expect(validContent).toHaveLength(2);
      
      // Get the second list item and verify it contains a nested list
      const secondListItem = dataStore.getNode(validContent[1]);
      expect(secondListItem?.type).toBe('listItem');
      
      const nestedContent = secondListItem?.content?.filter((item: any) => item !== undefined);
      expect(nestedContent).toHaveLength(1);
      
      const nestedList = dataStore.getNode(nestedContent?.[0] as unknown as string);
      expect(nestedList?.type).toBe('list');
    });
  });

  describe('Marks and Styling', () => {
    it('should preserve marks on inline-text including ranges/attrs', async () => {
      const result = await transaction(mockEditor, [
        create(node('paragraph', {}, [
          textNode('inline-text', 'Hello', [mark('bold')])
        ]))
      ]).commit();

      if (!result.success) {
        console.log('Transaction failed:', result.errors);
      }
      expect(result.success).toBe(true);
      expect(result.operations).toHaveLength(1);
      expect(result.operations?.[0].type).toBe('create');
      
      // Filter out undefined values from content array
      const validContent = result.operations?.[0].result.data.content.filter((item: any) => item !== undefined);
      expect(validContent).toHaveLength(1);
      
      // Get the actual child node from DataStore
      const childNode = dataStore.getNode(validContent[0]);
      expect(childNode?.text).toBe('Hello');
      expect(childNode?.marks).toEqual([{ type: 'bold', attrs: {}, range: undefined }]);
    });

    it('should create text with multiple marks', async () => {
      const result = await transaction(mockEditor, [
        create(node('paragraph', {}, [
          textNode('inline-text', 'Bold and italic', [
            mark('bold', { weight: 'bold' }),
            mark('italic', { style: 'italic' })
          ])
        ]))
      ]).commit();

      if (!result.success) {
        console.log('Transaction failed:', result.errors);
      }
      expect(result.success).toBe(true);
      expect(result.operations).toHaveLength(1);
      
      // Filter out undefined values from content array
      const validContent = result.operations?.[0].result.data.content.filter((item: any) => item !== undefined);
      expect(validContent).toHaveLength(1);
      
      // Get the actual child node from DataStore
      const childNode = dataStore.getNode(validContent[0]);
      expect(childNode?.marks).toHaveLength(2);
      expect(childNode?.marks?.[0]?.type).toBe('bold');
      expect(childNode?.marks?.[0]?.attrs?.weight).toBe('bold');
      expect(childNode?.marks?.[1]?.type).toBe('italic');
      expect(childNode?.marks?.[1]?.attrs?.style).toBe('italic');
    });

    it('should create link with href attribute', async () => {
      const result = await transaction(mockEditor, [
        create(node('paragraph', {}, [
          textNode('inline-text', 'Click here', [
            mark('link', { href: 'https://example.com', title: 'Example' })
          ])
        ]))
      ]).commit();

      if (!result.success) {
        console.log('Transaction failed:', result.errors);
      }
      expect(result.success).toBe(true);
      expect(result.operations).toHaveLength(1);
      
      // Filter out undefined values from content array
      const validContent = result.operations?.[0].result.data.content.filter((item: any) => item !== undefined);
      expect(validContent).toHaveLength(1);
      
      // Get the actual child node from DataStore
      const childNode = dataStore.getNode(validContent[0]);
      expect(childNode?.marks?.[0]?.type).toBe('link');
      expect(childNode?.marks?.[0]?.attrs?.href).toBe('https://example.com');
      expect(childNode?.marks?.[0]?.attrs?.title).toBe('Example');
    });
  });

  describe('Atom Nodes', () => {
    it('should create page break atom node', async () => {
      const result = await transaction(mockEditor, [
        create(node('pageBreak'))
      ]).commit();

      if (!result.success) {
        console.log('Transaction failed:', result.errors);
      }
      expect(result.success).toBe(true);
      expect(result.operations).toHaveLength(1);
      expect(result.operations?.[0].result.data.type).toBe('pageBreak');
    });

    it('should create inline image with attributes', async () => {
      const result = await transaction(mockEditor, [
        create(node('paragraph', {}, [
          node('inline-image', { src: 'image.jpg', alt: 'Sample image' })
        ]))
      ]).commit();

      if (!result.success) {
        console.log('Transaction failed:', result.errors);
      }
      expect(result.success).toBe(true);
      expect(result.operations).toHaveLength(1);
      
      // Filter out undefined values from content array
      const validContent = result.operations?.[0].result.data.content.filter((item: any) => item !== undefined);
      expect(validContent).toHaveLength(1);
      
      // Get the actual child node from DataStore
      const childNode = dataStore.getNode(validContent[0]);
      expect(childNode?.type).toBe('inline-image');
      expect(childNode?.attributes?.src).toBe('image.jpg');
      expect(childNode?.attributes?.alt).toBe('Sample image');
    });
  });

  describe('Large Scale Creation', () => {
    it('should create paragraph with many inline-text children', async () => {
      const children = Array.from({ length: 10 }, (_, i) => 
        textNode('inline-text', `Text ${i}`)
      );
      
      const result = await transaction(mockEditor, [
        create(node('paragraph', {}, children))
      ]).commit();

      if (!result.success) {
        console.log('Transaction failed:', result.errors);
      }
      expect(result.success).toBe(true);
      expect(result.operations).toHaveLength(1);
      
      // Filter out undefined values from content array
      const validContent = result.operations?.[0].result.data.content.filter((item: any) => item !== undefined);
      expect(validContent).toHaveLength(10);
      
      // Get the first and last child nodes from DataStore
      const firstChild = dataStore.getNode(validContent[0]);
      const lastChild = dataStore.getNode(validContent[9]);
      expect(firstChild?.text).toBe('Text 0');
      expect(lastChild?.text).toBe('Text 9');
    });

    it('should create multiple paragraphs in one transaction', async () => {
      const result = await transaction(mockEditor, [
        create(node('paragraph', {}, [textNode('inline-text', 'First paragraph')])),
        create(node('paragraph', {}, [textNode('inline-text', 'Second paragraph')])),
        create(node('paragraph', {}, [textNode('inline-text', 'Third paragraph')]))
      ]).commit();

      if (!result.success) {
        console.log('Transaction failed:', result.errors);
      }
      expect(result.success).toBe(true);
      expect(result.operations).toHaveLength(3);
      
      // Check each operation result
      const validContent1 = result.operations?.[0].result.data.content.filter((item: any) => item !== undefined);
      const validContent2 = result.operations?.[1].result.data.content.filter((item: any) => item !== undefined);
      const validContent3 = result.operations?.[2].result.data.content.filter((item: any) => item !== undefined);
      
      const child1 = dataStore.getNode(validContent1[0]);
      const child2 = dataStore.getNode(validContent2[0]);
      const child3 = dataStore.getNode(validContent3[0]);
      
      expect(child1?.text).toBe('First paragraph');
      expect(child2?.text).toBe('Second paragraph');
      expect(child3?.text).toBe('Third paragraph');
    });
  });

  describe('Edge Cases', () => {
    it('should create node with empty content array', async () => {
      const result = await transaction(mockEditor, [
        create(node('paragraph', {}, []))
      ]).commit();

      if (!result.success) {
        console.log('Transaction failed:', result.errors);
      }
      expect(result.success).toBe(true);
      expect(result.operations).toHaveLength(1);
      expect(result.operations?.[0].result.data.content).toEqual([]);
    });

    it('should create node with empty text', async () => {
      const result = await transaction(mockEditor, [
        create(textNode('inline-text', ''))
      ]).commit();

      if (!result.success) {
        console.log('Transaction failed:', result.errors);
      }
      expect(result.success).toBe(true);
      expect(result.operations).toHaveLength(1);
      expect(result.operations?.[0].result.data.text).toBe('');
    });

    it('should create node with undefined attributes', async () => {
      const result = await transaction(mockEditor, [
        create(node('paragraph', undefined, [
          textNode('inline-text', 'Text')
        ]))
      ]).commit();

      if (!result.success) {
        console.log('Transaction failed:', result.errors);
      }
      expect(result.success).toBe(true);
      expect(result.operations).toHaveLength(1);
      expect(result.operations?.[0].result.data.attributes).toBeUndefined();
    });
  });
});
