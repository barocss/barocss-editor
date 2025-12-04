import { describe, it, expect, beforeEach } from 'vitest';
import { DataStore } from '@barocss/datastore';
import { Schema } from '@barocss/schema';
import { transaction, control, node, textNode, mark } from '../../src/transaction-dsl';
import { create } from '../../src/operations-dsl/create';
// Import operations to register them
import '../../src/operations/register-operations';
import { SelectionManager } from '@barocss/editor-core';

describe('DSL Scenarios', () => {
  let dataStore: DataStore;
  let mockEditor: any;

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
        blockquote: { name: 'blockquote', content: 'block+', group: 'block' },
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

    const selectionManager = new SelectionManager({ dataStore });

    mockEditor = {
      dataStore,
      _dataStore: dataStore,
      getActiveSchema: () => schema,
      selectionManager
    };
  });

  describe('Basic Document Creation', () => {
    it('should create a simple paragraph with text', async () => {
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
      
      // Get the actual child node from DataStore
      const childNode = dataStore.getNode(validContent[0]);
      expect(childNode?.type).toBe('inline-text');
      expect(childNode?.text).toBe('Hello World');
    });

    it('should create heading with level attribute', async () => {
      const result = await transaction(mockEditor, [
        create(node('heading', { level: 1 }, [
          textNode('inline-text', 'Document Title')
        ]))
      ]).commit();

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
      expect(childNode?.text).toBe('Document Title');
    });

    it('should create paragraph with marks', async () => {
      const result = await transaction(mockEditor, [
        create(node('paragraph', {}, [
          textNode('inline-text', 'Bold text', [
            mark('bold', { weight: 'bold' })
          ])
        ]))
      ]).commit();

      expect(result.success).toBe(true);
      expect(result.operations).toHaveLength(1);
      expect(result.operations?.[0].type).toBe('create');
      expect(result.operations?.[0].result.data.type).toBe('paragraph');
      
      // Filter out undefined values from content array
      const validContent = result.operations?.[0].result.data.content.filter((item: any) => item !== undefined);
      expect(validContent).toHaveLength(1);
      
      // Get the actual child node from DataStore
      const childNode = dataStore.getNode(validContent[0]);
      expect(childNode?.type).toBe('inline-text');
      expect(childNode?.text).toBe('Bold text');
      expect(childNode?.marks).toHaveLength(1);
      expect(childNode?.marks?.[0].type).toBe('bold');
    });
  });

  describe('Control Operations', () => {
    it('should use control to set text on existing node', async () => {
      // First create a node
      const createResult = await transaction(mockEditor, [
        create(node('paragraph', {}, [
          textNode('inline-text', 'Original Text')
        ]))
      ]).commit();

      expect(createResult.success).toBe(true);
      const nodeId = createResult.operations?.[0].result.data.sid;

      // Then control it
      const result = await transaction(mockEditor, [
        control(nodeId, [
          { type: 'setText', payload: { text: 'Updated Text' } }
        ])
      ]).commit();

      expect(result.success).toBe(true);
      expect(result.operations).toHaveLength(1);
      expect(result.operations?.[0].type).toBe('setText');
      expect(result.operations?.[0].payload.nodeId).toBe(nodeId);
      expect(result.operations?.[0].payload.text).toBe('Updated Text');
    });

    it('should use control to set attributes', async () => {
      // First create a node
      const createResult = await transaction(mockEditor, [
        create(node('paragraph', {}, [
          textNode('inline-text', 'Text')
        ]))
      ]).commit();

      expect(createResult.success).toBe(true);
      const nodeId = createResult.operations?.[0].result.data.sid;

      // Then control it
      const result = await transaction(mockEditor, [
        control(nodeId, [
          { type: 'setAttrs', payload: { attrs: { class: 'highlight' } } }
        ])
      ]).commit();

      expect(result.success).toBe(true);
      expect(result.operations).toHaveLength(1);
      expect(result.operations?.[0].type).toBe('setAttrs');
      expect(result.operations?.[0].payload.nodeId).toBe(nodeId);
      expect(result.operations?.[0].payload.attrs.class).toBe('highlight');
    });

    it('should use control to set marks', async () => {
      // First create a node
      const createResult = await transaction(mockEditor, [
        create(node('paragraph', {}, [
          textNode('inline-text', 'Text')
        ]))
      ]).commit();

      expect(createResult.success).toBe(true);
      const nodeId = createResult.operations?.[0].result.data.sid;

      // Then control it
      const result = await transaction(mockEditor, [
        control(nodeId, [
          { type: 'setMarks', payload: { marks: [mark('bold', { weight: 'bold' })] } }
        ])
      ]).commit();

      expect(result.success).toBe(true);
      expect(result.operations).toHaveLength(1);
      expect(result.operations?.[0].type).toBe('setMarks');
      expect(result.operations?.[0].payload.nodeId).toBe(nodeId);
      expect(result.operations?.[0].payload.marks).toHaveLength(1);
      expect(result.operations?.[0].payload.marks[0].type).toBe('bold');
    });
  });

  describe('Complex Document Structures', () => {
    it('should create nested list structure', async () => {
      const result = await transaction(mockEditor, [
        create(node('list', { type: 'bullet' }, [
          node('listItem', {}, [
            node('paragraph', {}, [
              textNode('inline-text', 'First item')
            ])
          ]),
          node('listItem', {}, [
            node('paragraph', {}, [
              textNode('inline-text', 'Second item')
            ])
          ])
        ]))
      ]).commit();

      expect(result.success).toBe(true);
      expect(result.operations).toHaveLength(1);
      expect(result.operations?.[0].type).toBe('create');
      expect(result.operations?.[0].result.data.type).toBe('list');
      expect(result.operations?.[0].result.data.attributes.type).toBe('bullet');
      
      // Filter out undefined values from content array
      const validContent = result.operations?.[0].result.data.content.filter((item: any) => item !== undefined);
      expect(validContent).toHaveLength(2);
      
      // Get the actual child nodes from DataStore
      const firstListItem = dataStore.getNode(validContent[0]);
      expect(firstListItem?.type).toBe('listItem');
      
      const firstListItemContent = firstListItem?.content?.filter((item: any) => item !== undefined);
      expect(firstListItemContent).toHaveLength(1);
      
      const firstParagraph = dataStore.getNode(firstListItemContent?.[0] as string);
      expect(firstParagraph?.type).toBe('paragraph');
      const firstParagraphContent = firstParagraph?.content?.filter((item: any) => item !== undefined);
      expect(firstParagraphContent).toHaveLength(1);
      
      const firstInlineText = dataStore.getNode(firstParagraphContent?.[0] as string);
      expect(firstInlineText?.type).toBe('inline-text');
      expect(firstInlineText?.text).toBe('First item');
    });

    it('should create blockquote with nested content', async () => {
      const result = await transaction(mockEditor, [
        create(node('blockquote', {}, [
          node('paragraph', {}, [
            textNode('inline-text', 'Quote text with '),
            textNode('inline-text', 'emphasis', [
              mark('italic', { style: 'italic' })
            ])
          ])
        ]))
      ]).commit();

      expect(result.success).toBe(true);
      expect(result.operations).toHaveLength(1);
      expect(result.operations?.[0].type).toBe('create');
      expect(result.operations?.[0].result.data.type).toBe('blockquote');
      
      // Filter out undefined values from content array
      const validContent = result.operations?.[0].result.data.content.filter((item: any) => item !== undefined);
      expect(validContent).toHaveLength(1);
      
      // Get the actual child node from DataStore
      const paragraphNode = dataStore.getNode(validContent[0]);
      expect(paragraphNode?.type).toBe('paragraph');
      
      const paragraphContent = paragraphNode?.content?.filter((item: any) => item !== undefined);
      expect(paragraphContent).toHaveLength(2);
      
      const firstInlineText = dataStore.getNode(paragraphContent?.[0] as string);
      expect(firstInlineText?.type).toBe('inline-text');
      expect(firstInlineText?.text).toBe('Quote text with ');
      
      const secondInlineText = dataStore.getNode(paragraphContent?.[1] as string);
      expect(secondInlineText?.type).toBe('inline-text');
      expect(secondInlineText?.text).toBe('emphasis');
    });

    it('should create code block with language attribute', async () => {
      const result = await transaction(mockEditor, [
        create(textNode('codeBlock', 'const x = 1;', { language: 'typescript' }))
      ]).commit();

      expect(result.success).toBe(true);
      expect(result.operations).toHaveLength(1);
      expect(result.operations?.[0].type).toBe('create');
      expect(result.operations?.[0].result.data.type).toBe('codeBlock');
      expect(result.operations?.[0].result.data.attributes.language).toBe('typescript');
      expect(result.operations?.[0].result.data.text).toBe('const x = 1;');
    });
  });

  describe('Multiple Operations', () => {
    it('should handle multiple create operations', async () => {
      const result = await transaction(mockEditor, [
        create(node('paragraph', {}, [textNode('inline-text', 'First')])),
        create(node('paragraph', {}, [textNode('inline-text', 'Second')])),
        create(node('paragraph', {}, [textNode('inline-text', 'Third')]))
      ]).commit();

      expect(result.success).toBe(true);
      expect(result.operations).toHaveLength(3);
      expect(result.operations?.[0].type).toBe('create');
      expect(result.operations?.[0].result.data.type).toBe('paragraph');
      
      // Filter out undefined values from content array
      const validContent0 = result.operations?.[0].result.data.content.filter((item: any) => item !== undefined);
      expect(validContent0).toHaveLength(1);
      
      // Get the actual child node from DataStore
      const childNode0 = dataStore.getNode(validContent0[0]);
      expect(childNode0?.type).toBe('inline-text');
      expect(childNode0?.text).toBe('First');
      expect(result.operations?.[1].type).toBe('create');
      expect(result.operations?.[1].result.data.type).toBe('paragraph');
      
      // Filter out undefined values from content array
      const validContent1 = result.operations?.[1].result.data.content.filter((item: any) => item !== undefined);
      expect(validContent1).toHaveLength(1);
      
      // Get the actual child node from DataStore
      const childNode1 = dataStore.getNode(validContent1[0]);
      expect(childNode1?.type).toBe('inline-text');
      expect(childNode1?.text).toBe('Second');
      expect(result.operations?.[2].type).toBe('create');
      expect(result.operations?.[2].result.data.type).toBe('paragraph');
      
      // Filter out undefined values from content array
      const validContent2 = result.operations?.[2].result.data.content.filter((item: any) => item !== undefined);
      expect(validContent2).toHaveLength(1);
      
      // Get the actual child node from DataStore
      const childNode2 = dataStore.getNode(validContent2[0]);
      expect(childNode2?.type).toBe('inline-text');
      expect(childNode2?.text).toBe('Third');
    });

    it('should mix create and control operations', async () => {
      // First create a node to control
      const createResult = await transaction(mockEditor, [
        create(node('paragraph', {}, [textNode('inline-text', 'Original text')]))
      ]).commit();

      expect(createResult.success).toBe(true);
      const nodeId = createResult.operations?.[0].result.data.sid;

      // Then mix create and control operations
      const result = await transaction(mockEditor, [
        create(node('paragraph', {}, [textNode('inline-text', 'New paragraph')])),
        control(nodeId, [
          { type: 'setText', payload: { text: 'Updated' } }
        ])
      ]).commit();

      expect(result.success).toBe(true);
      expect(result.operations).toHaveLength(2);
      expect(result.operations?.[0].type).toBe('create');
      expect(result.operations?.[0].result.data.type).toBe('paragraph');
      
      // Filter out undefined values from content array
      const validContent = result.operations?.[0].result.data.content.filter((item: any) => item !== undefined);
      expect(validContent).toHaveLength(1);
      
      // Get the actual child node from DataStore
      const childNode = dataStore.getNode(validContent[0]);
      expect(childNode?.type).toBe('inline-text');
      expect(childNode?.text).toBe('New paragraph');
      
      expect(result.operations?.[1].type).toBe('setText');
      expect(result.operations?.[1].payload.nodeId).toBe(nodeId);
      expect(result.operations?.[1].payload.text).toBe('Updated');
    });
  });

  describe('Mark Operations', () => {
    it('should create text with multiple marks', async () => {
      const result = await transaction(mockEditor, [
        create(node('paragraph', {}, [
          textNode('inline-text', 'Bold and italic text', [
            mark('bold', { weight: 'bold' }),
            mark('italic', { style: 'italic' })
          ])
        ]))
      ]).commit();

      expect(result.success).toBe(true);
      expect(result.operations).toHaveLength(1);
      expect(result.operations?.[0].type).toBe('create');
      expect(result.operations?.[0].result.data.type).toBe('paragraph');
      
      // Filter out undefined values from content array
      const validContent = result.operations?.[0].result.data.content.filter((item: any) => item !== undefined);
      expect(validContent).toHaveLength(1);
      
      // Get the actual child node from DataStore
      const childNode = dataStore.getNode(validContent[0]);
      expect(childNode?.type).toBe('inline-text');
      expect(childNode?.text).toBe('Bold and italic text');
      expect(childNode?.marks).toHaveLength(2);
      expect(childNode?.marks?.[0].type).toBe('bold');
      expect(childNode?.marks?.[1].type).toBe('italic');
    });

    it('should create link with href attribute', async () => {
      const result = await transaction(mockEditor, [
        create(node('paragraph', {}, [
          textNode('inline-text', 'Click here', [
            mark('link', { href: 'https://example.com', title: 'Example' })
          ])
        ]))
      ]).commit();

      expect(result.success).toBe(true);
      expect(result.operations).toHaveLength(1);
      expect(result.operations?.[0].type).toBe('create');
      expect(result.operations?.[0].result.data.type).toBe('paragraph');
      // Filter out undefined values from content array
      const validContent = result.operations?.[0].result.data.content.filter((item: any) => item !== undefined);
      expect(validContent).toHaveLength(1);
      
      // Get the actual child node from DataStore
      const childNode = dataStore.getNode(validContent[0]);
      expect(childNode?.type).toBe('inline-text');
      expect(childNode?.text).toBe('Click here');
      expect(childNode?.marks).toHaveLength(1);
      expect(childNode?.marks?.[0].type).toBe('link');
      expect(childNode?.marks?.[0]?.attrs?.href).toBe('https://example.com');
      expect(childNode?.marks?.[0]?.attrs?.title).toBe('Example');
    });

    it('should create text with range-based marks', async () => {
      const result = await transaction(mockEditor, [
        create(node('paragraph', {}, [
          textNode('inline-text', 'This is bold text', [
            mark('bold', { range: [8, 12] })
          ])
        ]))
      ]).commit();

      expect(result.success).toBe(true);
      expect(result.operations).toHaveLength(1);
      expect(result.operations?.[0].type).toBe('create');
      expect(result.operations?.[0].result.data.type).toBe('paragraph');
      
      // Filter out undefined values from content array
      const validContent = result.operations?.[0].result.data.content.filter((item: any) => item !== undefined);
      expect(validContent).toHaveLength(1);
      
      // Get the actual child node from DataStore
      const childNode = dataStore.getNode(validContent[0]);
      expect(childNode?.type).toBe('inline-text');
      expect(childNode?.text).toBe('This is bold text');
      expect(childNode?.marks).toHaveLength(1);
      expect(childNode?.marks?.[0].type).toBe('bold');
      expect(childNode?.marks?.[0].range).toEqual([8, 12]);
    });
  });

  describe('Error Scenarios', () => {
    it('should handle empty operations array', async () => {
      const result = await transaction(mockEditor, []).commit();

      expect(result.success).toBe(true);
      expect(result.operations).toHaveLength(0);
    });

    it('should handle nested operations arrays', async () => {
      const result = await transaction(mockEditor, [
        [create(node('paragraph', {}, [textNode('inline-text', 'First')]))],
        [create(node('paragraph', {}, [textNode('inline-text', 'Second')]))]
      ]).commit();

      expect(result.success).toBe(true);
      expect(result.operations).toHaveLength(2);
      expect(result.operations?.[0].type).toBe('create');
      expect(result.operations?.[0].result.data.type).toBe('paragraph');
      
      // Filter out undefined values from content array
      const validContent0 = result.operations?.[0].result.data.content.filter((item: any) => item !== undefined);
      expect(validContent0).toHaveLength(1);
      
      // Get the actual child node from DataStore
      const childNode0 = dataStore.getNode(validContent0[0]);
      expect(childNode0?.type).toBe('inline-text');
      expect(childNode0?.text).toBe('First');
      expect(result.operations?.[1].type).toBe('create');
      expect(result.operations?.[1].result.data.type).toBe('paragraph');
      
      // Filter out undefined values from content array
      const validContent1 = result.operations?.[1].result.data.content.filter((item: any) => item !== undefined);
      expect(validContent1).toHaveLength(1);
      
      // Get the actual child node from DataStore
      const childNode1 = dataStore.getNode(validContent1[0]);
      expect(childNode1?.type).toBe('inline-text');
      expect(childNode1?.text).toBe('Second');
    });
  });

  describe('Real-world Scenarios', () => {
    it('should create a complete article structure', async () => {
      const result = await transaction(mockEditor, [
        create(node('heading', { level: 1 }, [
          textNode('inline-text', 'Article Title')
        ])),
        create(node('paragraph', {}, [
          textNode('inline-text', 'This is an '),
          textNode('inline-text', 'important', [
            mark('bold', { weight: 'bold' })
          ]),
          textNode('inline-text', ' paragraph with a '),
          textNode('inline-text', 'link', [
            mark('link', { href: 'https://example.com' })
          ]),
          textNode('inline-text', '.')
        ])),
        create(node('list', { type: 'bullet' }, [
          node('listItem', {}, [
            node('paragraph', {}, [
              textNode('inline-text', 'First point')
            ])
          ]),
          node('listItem', {}, [
            node('paragraph', {}, [
              textNode('inline-text', 'Second point')
            ])
          ])
        ]))
      ]).commit();

      expect(result.success).toBe(true);
      expect(result.operations).toHaveLength(3);
      expect(result.operations?.[0].result.data.type).toBe('heading');
      
      // Filter out undefined values from content array
      const validContent0 = result.operations?.[0].result.data.content.filter((item: any) => item !== undefined);
      expect(validContent0).toHaveLength(1);
      
      // Get the actual child node from DataStore
      const childNode0 = dataStore.getNode(validContent0[0]);
      expect(childNode0?.type).toBe('inline-text');
      expect(childNode0?.text).toBe('Article Title');
      expect(result.operations?.[1].result.data.type).toBe('paragraph');
      
      // Filter out undefined values from content array
      const validContent1 = result.operations?.[1].result.data.content.filter((item: any) => item !== undefined);
      expect(validContent1).toHaveLength(5); // This paragraph has 5 inline-text nodes
      
      // Get the actual child nodes from DataStore
      const childNode1_0 = dataStore.getNode(validContent1[0]);
      expect(childNode1_0?.type).toBe('inline-text');
      expect(childNode1_0?.text).toBe('This is an ');
      const childNode1_1 = dataStore.getNode(validContent1[1]);
      expect(childNode1_1?.type).toBe('inline-text');
      expect(childNode1_1?.text).toBe('important');
      
      const childNode1_2 = dataStore.getNode(validContent1[2]);
      expect(childNode1_2?.type).toBe('inline-text');
      expect(childNode1_2?.text).toBe(' paragraph with a ');
      
      const childNode1_3 = dataStore.getNode(validContent1[3]);
      expect(childNode1_3?.type).toBe('inline-text');
      expect(childNode1_3?.text).toBe('link');
      
      const childNode1_4 = dataStore.getNode(validContent1[4]);
      expect(childNode1_4?.type).toBe('inline-text');
      expect(childNode1_4?.text).toBe('.');
      expect(result.operations?.[2].result.data.type).toBe('list');
      expect(result.operations?.[2].result.data.attributes.type).toBe('bullet');
      
      // Filter out undefined values from content array
      const validContent2 = result.operations?.[2].result.data.content.filter((item: any) => item !== undefined);
      expect(validContent2).toHaveLength(2);
      // Get the actual child nodes from DataStore
      const firstListItem = dataStore.getNode(validContent2[0]);
      expect(firstListItem?.type).toBe('listItem');
      
      const firstListItemContent = firstListItem?.content?.filter((item: any) => item !== undefined);
      expect(firstListItemContent).toHaveLength(1);
      
      const firstParagraph = dataStore.getNode(firstListItemContent?.[0] as string);
      expect(firstParagraph?.type).toBe('paragraph');
      
      const firstParagraphContent = firstParagraph?.content?.filter((item: any) => item !== undefined);
      expect(firstParagraphContent).toHaveLength(1);
      
      const firstInlineText = dataStore.getNode(firstParagraphContent?.[0] as string  );
      expect(firstInlineText?.type).toBe('inline-text');
    });

    it('should create a code tutorial structure', async () => {
      const result = await transaction(mockEditor, [
        create(node('heading', { level: 2 }, [
          textNode('inline-text', 'JavaScript Tutorial')
        ])),
        create(node('paragraph', {}, [
          textNode('inline-text', 'Here is a simple function:')
        ])),
        create(textNode('codeBlock', 'function hello() {\n  console.log("Hello World");\n}', { language: 'javascript' })),
        create(node('paragraph', {}, [
          textNode('inline-text', 'This function will output '),
          textNode('inline-text', 'Hello World', [
            mark('code', { style: 'font-family: monospace' })
          ]),
          textNode('inline-text', ' to the console.')
        ]))
      ]).commit();

      expect(result.success).toBe(true);
      expect(result.operations).toHaveLength(4);
      expect(result.operations?.[0].result.data.type).toBe('heading');
      
      // Filter out undefined values from content array
      const validContent0 = result.operations?.[0].result.data.content.filter((item: any) => item !== undefined);
      expect(validContent0).toHaveLength(1);
      
      // Get the actual child node from DataStore
      const childNode0 = dataStore.getNode(validContent0[0]);
      expect(childNode0?.type).toBe('inline-text');
      expect(childNode0?.text).toBe('JavaScript Tutorial');
      expect(result.operations?.[1].result.data.type).toBe('paragraph');
      
      // Filter out undefined values from content array
      const validContent1 = result.operations?.[1].result.data.content.filter((item: any) => item !== undefined);
      expect(validContent1).toHaveLength(1);
      
      // Get the actual child node from DataStore
      const childNode1 = dataStore.getNode(validContent1[0]);
      expect(childNode1?.type).toBe('inline-text');
      expect(childNode1?.text).toBe('Here is a simple function:');
      expect(result.operations?.[2].result.data.type).toBe('codeBlock');
      expect(result.operations?.[2].result.data.text).toBe('function hello() {\n  console.log("Hello World");\n}');
      expect(result.operations?.[3].result.data.type).toBe('paragraph');
      
      // Filter out undefined values from content array
      const validContent3 = result.operations?.[3].result.data.content.filter((item: any) => item !== undefined);
      expect(validContent3).toHaveLength(3); // This paragraph has 3 inline-text nodes
      
      // Get the actual child nodes from DataStore
      const childNode3_0 = dataStore.getNode(validContent3[0]);
      expect(childNode3_0?.type).toBe('inline-text');
      expect(childNode3_0?.text).toBe('This function will output ');
      const childNode3_1 = dataStore.getNode(validContent3[1]);
      expect(childNode3_1?.type).toBe('inline-text');
      expect(childNode3_1?.text).toBe('Hello World');
      
      const childNode3_2 = dataStore.getNode(validContent3[2]);
      expect(childNode3_2?.type).toBe('inline-text');
      expect(childNode3_2?.text).toBe(' to the console.');
    });
  });
});