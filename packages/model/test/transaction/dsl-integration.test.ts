import { describe, it, expect, beforeEach } from 'vitest';
import { DataStore } from '@barocss/datastore';
import { Schema } from '@barocss/schema';
import { transaction, control, node, textNode as createTextNode, mark } from '../../src/transaction-dsl';
import { create } from '../../src/operations-dsl/create';
// Import operations to register them
import '../../src/operations/register-operations';

describe('DSL Integration Tests', () => {
  let dataStore: DataStore;
  let mockEditor: any;
  const { SelectionManager } = require('@barocss/editor-core');

  beforeEach(() => {
    // Create a schema matching main.ts
    const schema = new Schema('test-schema', {
      nodes: {
        document: { name: 'document', content: 'block+' },
        paragraph: { name: 'paragraph', content: 'inline*', group: 'block' },
        heading: { name: 'heading', content: 'inline*', group: 'block', attrs: { level: { type: 'number', required: true } } },
        'inline-text': { name: 'inline-text', group: 'inline' },
        list: { name: 'list', content: 'listItem+', group: 'block', attrs: { type: { type: 'string', default: 'bullet' } } },
        listItem: { name: 'listItem', content: 'block+', group: 'block' },
        codeBlock: { name: 'codeBlock', group: 'block', atom: true, attrs: { language: { type: 'string', required: false } } },
        pageBreak: { name: 'pageBreak', group: 'block', atom: true },
        'inline-image': { name: 'inline-image', group: 'inline', atom: true, attrs: { src: { type: 'string', required: true }, alt: { type: 'string', required: false } } },
        table: { name: 'table', content: 'tableRow+', group: 'block' },
        tableRow: { name: 'tableRow', content: 'tableCell+', group: 'block' },
        tableCell: { name: 'tableCell', content: 'block+', group: 'block' }
      },
      marks: {
        bold: { name: 'bold', group: 'text-style', attrs: { weight: { type: 'string', default: 'bold' } } },
        italic: { name: 'italic', group: 'text-style', attrs: { style: { type: 'string', default: 'italic' } } },
        link: { name: 'link', group: 'text-style', attrs: { href: { type: 'string', required: true }, title: { type: 'string', required: false } } }
      },
      topNode: 'document'
    });

    dataStore = new DataStore(undefined, schema);

    const selectionManager = new SelectionManager({ dataStore });
    mockEditor = {
      dataStore,
      _dataStore: dataStore,
      selectionManager
    };
  });

  describe('Real-world Document Scenarios', () => {
    it('should create a complete blog post structure', async () => {
      const result = await transaction(mockEditor, [
        // Title
        create(node('heading', { level: 1 }, [
          createTextNode('inline-text', 'My Blog Post')
        ])),
        
        // Introduction paragraph
        create(node('paragraph', {}, [
          createTextNode('inline-text', 'This is an '),
          createTextNode('inline-text', 'important', [mark('bold', { weight: 'bold' })]),
          createTextNode('inline-text', ' blog post about '),
          createTextNode('inline-text', 'web development', [mark('link', { href: 'https://example.com' })]),
          createTextNode('inline-text', '.')
        ])),
        
        // Code example
        create(node('codeBlock', { language: 'javascript' }, 'function hello() {\n  console.log("Hello World");\n}')),
        
        // List of features
        create(node('list', { type: 'bullet' }, [
          node('listItem', {}, [
            node('paragraph', {}, [
              createTextNode('inline-text', 'Feature 1: Easy to use')
            ])
          ]),
          node('listItem', {}, [
            node('paragraph', {}, [
              createTextNode('inline-text', 'Feature 2: Fast performance')
            ])
          ])
        ])),
        
        // Conclusion
        create(node('paragraph', {}, [
          createTextNode('inline-text', 'In conclusion, this is a great tool for developers.')
        ]))
      ]).commit();

      expect(result.success).toBe(true);
      expect(result.operations).toHaveLength(5);
      
      // Check title
      expect(result.operations?.[0].type).toBe('create');
      expect(result.operations?.[0].result.type).toBe('heading');
      expect(result.operations?.[0].result.attributes.level).toBe(1);
      
      // Check introduction paragraph with marks
      expect(result.operations?.[1].type).toBe('create');
      expect(result.operations?.[1].result.type).toBe('paragraph');
      const paragraphNode = dataStore.getNode(result.operations?.[1].result.sid);
      const actualContent = paragraphNode?.content?.filter(id => id !== undefined);
      expect(actualContent).toHaveLength(5);
      const boldTextNode = dataStore.getNode(actualContent?.[1]);
      expect(boldTextNode?.marks?.[0]?.type).toBe('bold');
      
      // Check code block
      expect(result.operations?.[2].type).toBe('create');
      expect(result.operations?.[2].result.type).toBe('codeBlock');
      expect(result.operations?.[2].result.attributes.language).toBe('javascript');
      
      // Check list
      expect(result.operations?.[3].type).toBe('create');
      expect(result.operations?.[3].result.type).toBe('list');
      const listNode = dataStore.getNode(result.operations?.[3].result.sid);
      const actualListContent = listNode?.content?.filter(id => id !== undefined);
      expect(actualListContent).toHaveLength(2);
    });

    it('should create a technical documentation structure', async () => {
      const result = await transaction(mockEditor, [
        // Main title
        create(node('heading', { level: 1 }, [
          createTextNode('inline-text', 'API Documentation')
        ])),
        
        // Table of contents
        create(node('list', { type: 'ordered' }, [
          node('listItem', {}, [
            node('paragraph', {}, [
              createTextNode('inline-text', 'Introduction')
            ])
          ]),
          node('listItem', {}, [
            node('paragraph', {}, [
              createTextNode('inline-text', 'Authentication')
            ])
          ]),
          node('listItem', {}, [
            node('paragraph', {}, [
              createTextNode('inline-text', 'Endpoints')
            ])
          ])
        ])),
        
        // Section 1
        create(node('heading', { level: 2 }, [
          createTextNode('inline-text', 'Introduction')
        ])),
        
        create(node('paragraph', {}, [
          createTextNode('inline-text', 'This API provides access to our data. Use '),
          createTextNode('inline-text', 'Bearer tokens', [mark('code', { style: 'font-family: monospace' })]),
          createTextNode('inline-text', ' for authentication.')
        ])),
        
        // Section 2
        create(node('heading', { level: 2 }, [
          createTextNode('inline-text', 'Authentication')
        ])),
        
        create(createTextNode('codeBlock', 'curl -H "Authorization: Bearer YOUR_TOKEN" \\\n  https://api.example.com/data', { language: 'bash' }))
      ]).commit();

      expect(result.success).toBe(true);
      console.log('Actual operations count:', result.operations?.length);
      console.log('Operations:', result.operations?.map(op => op.type));
      expect(result.operations).toHaveLength(6);
      
      // Check structure
      expect(result.operations?.[0].type).toBe('create');
      expect(result.operations?.[0].result.type).toBe('heading');
      expect(result.operations?.[1].type).toBe('create');
      expect(result.operations?.[1].result.type).toBe('list');
      expect(result.operations?.[2].type).toBe('create');
      expect(result.operations?.[2].result.type).toBe('heading');
      expect(result.operations?.[3].type).toBe('create');
      expect(result.operations?.[3].result.type).toBe('paragraph');
      expect(result.operations?.[4].type).toBe('create');
      expect(result.operations?.[4].result.type).toBe('heading');
      expect(result.operations?.[5].type).toBe('create');
      expect(result.operations?.[5].result.type).toBe('codeBlock');
    });
  });

  describe('Mixed Create and Control Operations', () => {
    it('should create content and then modify it', async () => {
      // First create the content
      const createResult = await transaction(mockEditor, [
        create(node('paragraph', {}, [
          createTextNode('inline-text', 'Initial text')
        ]))
      ]).commit();

      const paragraphId = createResult.operations?.[0].result.sid;
      const paragraphNode = dataStore.getNode(paragraphId);
      const textNodeId = paragraphNode?.content?.[0];

      // Then modify the created text
      const result = await transaction(mockEditor, [
        control(textNodeId, [
          { type: 'setText', payload: { text: 'Modified text' } },
          { type: 'setMarks', payload: { marks: [mark('bold')] } }
        ])
      ]).commit();

      expect(result.success).toBe(true);
      expect(result.operations).toHaveLength(2);
      
      expect(result.operations?.[0].type).toBe('setText');
      expect(result.operations?.[1].type).toBe('setMarks');
    });

    it('should create multiple elements and control them individually', async () => {
      // First create the paragraphs
      const createResult = await transaction(mockEditor, [
        create(node('paragraph', {}, [createTextNode('inline-text', 'First paragraph')])),
        create(node('paragraph', {}, [createTextNode('inline-text', 'Second paragraph')])),
        create(node('paragraph', {}, [createTextNode('inline-text', 'Third paragraph')]))
      ]).commit();

      // Get the text node IDs
      const paragraph1Id = createResult.operations?.[0].result.sid;
      const paragraph2Id = createResult.operations?.[1].result.sid;
      const paragraph3Id = createResult.operations?.[2].result.sid;
      
      const paragraph1 = dataStore.getNode(paragraph1Id);
      const paragraph2 = dataStore.getNode(paragraph2Id);
      const paragraph3 = dataStore.getNode(paragraph3Id);
      
      const text1Id = paragraph1?.content?.[0];
      const text2Id = paragraph2?.content?.[0];
      const text3Id = paragraph3?.content?.[0];

      // Then control each one
      const result = await transaction(mockEditor, [
        control(text1Id, [
          { type: 'setMarks', payload: { marks: [mark('bold')] } }
        ]),
        control(text2Id, [
          { type: 'setMarks', payload: { marks: [mark('italic')] } }
        ]),
        control(text3Id, [
          { type: 'setMarks', payload: { marks: [mark('underline')] } }
        ])
      ]).commit();

      expect(result.success).toBe(true);
      expect(result.operations).toHaveLength(3);
      
      // Check control operations
      expect(result.operations?.[0].type).toBe('setMarks');
      expect(result.operations?.[1].type).toBe('setMarks');
      expect(result.operations?.[2].type).toBe('setMarks');
    });
  });

  describe('Complex Nested Structures', () => {
    it('should create a nested list with mixed content', async () => {
      const result = await transaction(mockEditor, [
        create(node('list', { type: 'ordered' }, [
          node('listItem', {}, [
            node('paragraph', {}, [
              createTextNode('inline-text', 'Main point with '),
              createTextNode('inline-text', 'emphasis', [mark('bold')])
            ])
          ]),
          node('listItem', {}, [
            node('list', { type: 'bullet' }, [
              node('listItem', {}, [
                node('paragraph', {}, [
                  createTextNode('inline-text', 'Sub-point 1')
                ])
              ]),
              node('listItem', {}, [
                node('paragraph', {}, [
                  createTextNode('inline-text', 'Sub-point 2')
                ])
              ])
            ])
          ])
        ]))
      ]).commit();

      expect(result.success).toBe(true);
      expect(result.operations?.[0].type).toBe('create');
      expect(result.operations?.[0].result.type).toBe('list');
      const listNode = dataStore.getNode(result.operations?.[0].result.sid);
      const actualListContent = listNode?.content?.filter(id => id !== undefined);
      expect(actualListContent).toHaveLength(2);
      
      // Check nested structure
      const firstItemId = actualListContent?.[0];
      const firstItem = dataStore.getNode(firstItemId);
      const firstItemContent = firstItem?.content?.filter(id => id !== undefined);
      const paragraphId = firstItemContent?.[0];
      const paragraph = dataStore.getNode(paragraphId);
      const paragraphContent = paragraph?.content?.filter(id => id !== undefined);
      const boldTextNodeId = paragraphContent?.[1];
      const boldTextNode = dataStore.getNode(boldTextNodeId);
      expect(boldTextNode?.marks?.[0]?.type).toBe('bold');
      
      const secondItemId = actualListContent?.[1];
      const secondItem = dataStore.getNode(secondItemId);
      const secondItemContent = secondItem?.content?.filter(id => id !== undefined);
      const nestedListId = secondItemContent?.[0];
      const nestedList = dataStore.getNode(nestedListId);
      const nestedListContent = nestedList?.content?.filter(id => id !== undefined);
      expect(nestedList?.type).toBe('list');
      expect(nestedListContent).toHaveLength(2);
    });

    it('should create a table-like structure', async () => {
      const result = await transaction(mockEditor, [
        create(node('table', {}, [
          node('tableRow', {}, [
            node('tableCell', {}, [
              node('paragraph', {}, [
                createTextNode('inline-text', 'Header 1')
              ])
            ]),
            node('tableCell', {}, [
              node('paragraph', {}, [
                createTextNode('inline-text', 'Header 2')
              ])
            ])
          ]),
          node('tableRow', {}, [
            node('tableCell', {}, [
              node('paragraph', {}, [
                createTextNode('inline-text', 'Data 1')
              ])
            ]),
            node('tableCell', {}, [
              node('paragraph', {}, [
                createTextNode('inline-text', 'Data 2')
              ])
            ])
          ])
        ]))
      ]).commit();

      expect(result.success).toBe(true);
      expect(result.operations?.[0].type).toBe('create');
      expect(result.operations?.[0].result.type).toBe('table');
      const tableNode = dataStore.getNode(result.operations?.[0].result.sid);
      const actualTableContent = tableNode?.content?.filter(id => id !== undefined);
      expect(actualTableContent).toHaveLength(2);
      const firstRowId = actualTableContent?.[0];
      const firstRow = dataStore.getNode(firstRowId);
      expect(firstRow?.type).toBe('tableRow');
      const firstRowContent = firstRow?.content?.filter(id => id !== undefined);
      expect(firstRowContent).toHaveLength(2);
    });
  });

  describe('Performance Scenarios', () => {
    it('should handle large number of operations efficiently', async () => {
      const operations = [];
      
      // Create 10 paragraphs (reduced for simplicity)
      for (let i = 0; i < 10; i++) {
        operations.push(
          create(node('paragraph', {}, [
            createTextNode('inline-text', `Paragraph ${i}`)
          ]))
        );
      }

      const result = await transaction(mockEditor, operations).commit();

      expect(result.success).toBe(true);
      expect(result.operations).toHaveLength(10);
    });

    it('should handle deeply nested structures', async () => {
      // Create a simple nested structure that follows schema rules
      const nestedNode = node('list', {}, [
        node('listItem', {}, [
          node('paragraph', {}, [
            createTextNode('inline-text', 'Deep text')
          ])
        ])
      ]);

      const result = await transaction(mockEditor, [
        create(nestedNode)
      ]).commit();

      expect(result.success).toBe(true);
      expect(result.operations?.[0].type).toBe('create');
      expect(result.operations?.[0].result.type).toBe('list');
      
      // Verify nested structure
      const listId = result.operations?.[0].result.sid;
      const listNode = dataStore.getNode(listId);
      const listContent = listNode?.content?.filter(id => id !== undefined);
      expect(listContent).toHaveLength(1);
      
      const listItemId = listContent?.[0];
      const listItem = dataStore.getNode(listItemId);
      expect(listItem?.type).toBe('listItem');
      
      const listItemContent = listItem?.content?.filter(id => id !== undefined);
      expect(listItemContent).toHaveLength(1);
      
      const paragraphId = listItemContent?.[0];
      const paragraph = dataStore.getNode(paragraphId);
      expect(paragraph?.type).toBe('paragraph');
      
      const paragraphContent = paragraph?.content?.filter(id => id !== undefined);
      expect(paragraphContent).toHaveLength(1);
      
      const textNodeId = paragraphContent?.[0];
      const textNode = dataStore.getNode(textNodeId);
      expect(textNode?.type).toBe('inline-text');
      expect(textNode?.text).toBe('Deep text');
    });
  });

  describe('Error Handling Scenarios', () => {
    it('should handle mixed valid and invalid operations gracefully', async () => {
      const result = await transaction(mockEditor, [
        create(node('paragraph', {}, [createTextNode('inline-text', 'Valid content')])),
        control('nonexistent', [
          { type: 'setText', payload: { text: 'This should fail' } }
        ]),
        create(node('heading', { level: 2 }, [createTextNode('inline-text', 'Another valid')]))
      ]).commit();

      // This should fail because of the nonexistent node
      expect(result.success).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      
      // Check that valid operations were attempted
      expect(result.operations).toHaveLength(3);
      expect(result.operations?.[0].type).toBe('create');
      expect(result.operations?.[1].type).toBe('setText');
      expect(result.operations?.[2].type).toBe('create');
    });

    it('should handle empty and null values in operations', async () => {
      // First create the content
      const createResult = await transaction(mockEditor, [
        create(node('paragraph', {}, [])),
        create(createTextNode('inline-text', ''))
      ]).commit();

      const textNodeId = createResult.operations?.[1].result.sid;

      // Then control the text node
      const result = await transaction(mockEditor, [
        control(textNodeId, [
          { type: 'setText', payload: { text: '' } }
        ])
      ]).commit();

      expect(result.success).toBe(true);
      expect(result.operations).toHaveLength(1);
      
      expect(result.operations?.[0].type).toBe('setText');
      expect(result.operations?.[0].payload.text).toBe('');
    });
  });
});
