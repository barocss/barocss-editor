import { describe, it, expect, beforeEach, vi } from 'vitest';
import { DataStore } from '@barocss/datastore';
import { Schema } from '@barocss/schema';
import { transaction, node, textNode, control } from '../../src/transaction-dsl';
import { create } from '../../src/operations-dsl/create';
import '../../src/operations/register-operations';

describe('DSL Control Operations', () => {
  let dataStore: DataStore;
  let mockEditor: any;

  beforeEach(() => {
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
        italic: { name: 'italic', group: 'text-style', attrs: { style: { type: 'string', default: 'italic' } } }
      }
    });

    dataStore = new DataStore(undefined, schema);
    dataStore.setActiveSchema(schema);

    mockEditor = {
      dataStore: dataStore,
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

  describe('Basic Control Operations', () => {
    it('should control text operations on existing nodes', async () => {
      // First create a node to control
      const createResult = await transaction(mockEditor, [
        create(node('paragraph', {}, [
          textNode('inline-text', 'Text')
        ]))
      ]).commit();

      expect(createResult.success).toBe(true);
      const createdNode = createResult.operations?.[0].result.data;
      const nodeId = createdNode.sid;

      // Now control the node
      const controlResult = await transaction(mockEditor, [
        ...control(nodeId, [
          { type: 'setText', payload: { text: 'Updated Text' } }
        ])
      ]).commit();

      expect(controlResult.success).toBe(true);
      expect(controlResult.operations).toHaveLength(1);
      expect(controlResult.operations?.[0].type).toBe('setText');
      expect(controlResult.operations?.[0].payload.nodeId).toBe(nodeId);
      expect(controlResult.operations?.[0].payload.text).toBe('Updated Text');
    });

    it('should control attribute operations on existing nodes', async () => {
      // First create a node to control
      const createResult = await transaction(mockEditor, [
        create(node('heading', { level: 1 }, [
          textNode('inline-text', 'Heading')
        ]))
      ]).commit();

      expect(createResult.success).toBe(true);
      const createdNode = createResult.operations?.[0].result.data;
      const nodeId = createdNode.sid;

      // Now control the node
      const controlResult = await transaction(mockEditor, [
        ...control(nodeId, [
          { type: 'setAttrs', payload: { attrs: { level: 2 } } }
        ])
      ]).commit();

      expect(controlResult.success).toBe(true);
      expect(controlResult.operations).toHaveLength(1);
      expect(controlResult.operations?.[0].type).toBe('setAttrs');
      expect(controlResult.operations?.[0].payload.nodeId).toBe(nodeId);
      expect(controlResult.operations?.[0].payload.attrs.level).toBe(2);
    });

    it('should control mark operations on existing nodes', async () => {
      // First create a node to control
      const createResult = await transaction(mockEditor, [
        create(node('paragraph', {}, [
          textNode('inline-text', 'Text with marks')
        ]))
      ]).commit();

      expect(createResult.success).toBe(true);
      const createdNode = createResult.operations?.[0].result.data;
      const nodeId = createdNode.sid;

      // Now control the node
      const controlResult = await transaction(mockEditor, [
        ...control(nodeId, [
          { type: 'setMarks', payload: { marks: [{ type: 'bold' }] } }
        ])
      ]).commit();

      expect(controlResult.success).toBe(true);
      expect(controlResult.operations).toHaveLength(1);
      expect(controlResult.operations?.[0].type).toBe('setMarks');
      expect(controlResult.operations?.[0].payload.nodeId).toBe(nodeId);
      expect(controlResult.operations?.[0].payload.marks).toEqual([{ type: 'bold' }]);
    });
  });

  describe('Text Operations', () => {
    it('should insert text at specified position', async () => {
      const createResult = await transaction(mockEditor, [
        create(node('paragraph', {}, [
          textNode('inline-text', 'Hello World')
        ]))
      ]).commit();

      const nodeId = createResult.operations?.[0].result.data.sid;

      const controlResult = await transaction(mockEditor, [
        ...control(nodeId, [
          { type: 'insertText', payload: { pos: 5, text: ' Beautiful' } }
        ])
      ]).commit();

      expect(controlResult.success).toBe(true);
      expect(controlResult.operations?.[0].type).toBe('insertText');
      expect(controlResult.operations?.[0].payload.nodeId).toBe(nodeId);
      expect(controlResult.operations?.[0].payload.pos).toBe(5);
      expect(controlResult.operations?.[0].payload.text).toBe(' Beautiful');
    });

    it('should delete text range', async () => {
      const createResult = await transaction(mockEditor, [
        create(node('paragraph', {}, [
          textNode('inline-text', 'Hello World')
        ]))
      ]).commit();

      const nodeId = createResult.operations?.[0].result.data.sid;

      const controlResult = await transaction(mockEditor, [
        ...control(nodeId, [
          { type: 'deleteTextRange', payload: { startPos: 5, endPos: 11 } }
        ])
      ]).commit();

      expect(controlResult.success).toBe(true);
      expect(controlResult.operations?.[0].type).toBe('deleteTextRange');
      expect(controlResult.operations?.[0].payload.nodeId).toBe(nodeId);
      expect(controlResult.operations?.[0].payload.startPos).toBe(5);
      expect(controlResult.operations?.[0].payload.endPos).toBe(11);
    });

    it('should replace text range', async () => {
      const createResult = await transaction(mockEditor, [
        create(node('paragraph', {}, [
          textNode('inline-text', 'Hello World')
        ]))
      ]).commit();

      const paragraphId = createResult.operations?.[0].result.data.sid;
      const inlineTextId = createResult.operations?.[0].result.data.content[0];

      const controlResult = await transaction(mockEditor, [
        ...control(inlineTextId, [
          { type: 'replaceText', payload: { start: 6, end: 11, newText: 'Universe' } }
        ])
      ]).commit();

      expect(controlResult.success).toBe(true);
      expect(controlResult.operations?.[0].type).toBe('replaceText');
      expect(controlResult.operations?.[0].payload.nodeId).toBe(inlineTextId);
      expect(controlResult.operations?.[0].payload.start).toBe(6);
      expect(controlResult.operations?.[0].payload.end).toBe(11);
      expect(controlResult.operations?.[0].payload.newText).toBe('Universe');
    });
  });

  describe('Attribute Operations', () => {
    it('should update node attributes', async () => {
      const createResult = await transaction(mockEditor, [
        create(node('heading', { level: 1 }, [
          textNode('inline-text', 'Heading')
        ]))
      ]).commit();

      const nodeId = createResult.operations?.[0].result.data.sid;

      const controlResult = await transaction(mockEditor, [
        ...control(nodeId, [
          { type: 'setAttrs', payload: { attrs: { level: 3 } } }
        ])
      ]).commit();

      expect(controlResult.success).toBe(true);
      expect(controlResult.operations?.[0].type).toBe('setAttrs');
      expect(controlResult.operations?.[0].payload.nodeId).toBe(nodeId);
      expect(controlResult.operations?.[0].payload.attrs.level).toBe(3);
    });

    it('should merge node attributes', async () => {
      const createResult = await transaction(mockEditor, [
        create(node('list', { type: 'bullet' }, [
          node('listItem', {}, [
            node('paragraph', {}, [
              textNode('inline-text', 'Item')
            ])
          ])
        ]))
      ]).commit();

      const nodeId = createResult.operations?.[0].result.data.sid;

      const controlResult = await transaction(mockEditor, [
        ...control(nodeId, [
          { type: 'setAttrs', payload: { attrs: { type: 'ordered' } } }
        ])
      ]).commit();

      expect(controlResult.success).toBe(true);
      expect(controlResult.operations?.[0].type).toBe('setAttrs');
      expect(controlResult.operations?.[0].payload.nodeId).toBe(nodeId);
      expect(controlResult.operations?.[0].payload.attrs.type).toBe('ordered');
    });
  });

  describe('Mark Operations', () => {
    it('should apply marks to text', async () => {
      const createResult = await transaction(mockEditor, [
        create(node('paragraph', {}, [
          textNode('inline-text', 'Bold text')
        ]))
      ]).commit();

      const paragraphId = createResult.operations?.[0].result.data.sid;
      const paragraphNode = dataStore.getNode(paragraphId);
      const textNodeId = paragraphNode?.content?.[0];

      const controlResult = await transaction(mockEditor, [
        ...control(textNodeId, [
          { type: 'applyMark', payload: { markType: 'bold', start: 0, end: 4 } }
        ])
      ]).commit();

      if (!controlResult.success) {
        console.log('Control result errors:', controlResult.errors);
      }
      expect(controlResult.success).toBe(true);
      expect(controlResult.operations?.[0].type).toBe('applyMark');
      expect(controlResult.operations?.[0].payload.nodeId).toBe(textNodeId);
      expect(controlResult.operations?.[0].payload.markType).toBe('bold');
      expect(controlResult.operations?.[0].payload.start).toBe(0);
      expect(controlResult.operations?.[0].payload.end).toBe(4);
    });

    it('should remove marks from text', async () => {
      const createResult = await transaction(mockEditor, [
        create(node('paragraph', {}, [
          textNode('inline-text', 'Text with marks', [
            { type: 'bold', range: [0, 4] }
          ])
        ]))
      ]).commit();

      const paragraphId = createResult.operations?.[0].result.data.sid;
      const paragraphNode = dataStore.getNode(paragraphId);
      const textNodeId = paragraphNode?.content?.[0];

      const controlResult = await transaction(mockEditor, [
        ...control(textNodeId, [
          { type: 'removeMark', payload: { markType: 'bold', range: [0, 4] } }
        ])
      ]).commit();

      expect(controlResult.success).toBe(true);
      expect(controlResult.operations?.[0].type).toBe('removeMark');
      expect(controlResult.operations?.[0].payload.nodeId).toBe(textNodeId);
      expect(controlResult.operations?.[0].payload.markType).toBe('bold');
    });

    it('should toggle marks on text', async () => {
      const createResult = await transaction(mockEditor, [
        create(node('paragraph', {}, [
          textNode('inline-text', 'Toggle text')
        ]))
      ]).commit();

      const paragraphId = createResult.operations?.[0].result.data.sid;
      const paragraphNode = dataStore.getNode(paragraphId);
      const textNodeId = paragraphNode?.content?.[0];

      const controlResult = await transaction(mockEditor, [
        ...control(textNodeId, [
          { type: 'toggleMark', payload: { markType: 'italic', range: [0, 6] } }
        ])
      ]).commit();

      expect(controlResult.success).toBe(true);
      expect(controlResult.operations?.[0].type).toBe('toggleMark');
      expect(controlResult.operations?.[0].payload.nodeId).toBe(textNodeId);
      expect(controlResult.operations?.[0].payload.markType).toBe('italic');
    });
  });

  describe('Content Operations', () => {
    it('should wrap content with new node', async () => {
      const createResult = await transaction(mockEditor, [
        create(node('paragraph', {}, [
          textNode('inline-text', 'Text to wrap')
        ]))
      ]).commit();

      const paragraphId = createResult.operations?.[0].result.data.sid;
      const paragraphNode = dataStore.getNode(paragraphId);
      const textNodeId = paragraphNode?.content?.[0];

      const controlResult = await transaction(mockEditor, [
        ...control(textNodeId, [
          { type: 'wrap', payload: { start: 0, end: 4, prefix: '[', suffix: ']' } }
        ])
      ]).commit();

      expect(controlResult.success).toBe(true);
      expect(controlResult.operations?.[0].type).toBe('wrap');
      expect(controlResult.operations?.[0].payload.nodeId).toBe(textNodeId);
      expect(controlResult.operations?.[0].payload.start).toBe(0);
      expect(controlResult.operations?.[0].payload.end).toBe(4);
      expect(controlResult.operations?.[0].payload.prefix).toBe('[');
      expect(controlResult.operations?.[0].payload.suffix).toBe(']');
    });

    it('should unwrap content from parent', async () => {
      const createResult = await transaction(mockEditor, [
        create(node('heading', { level: 1 }, [
          textNode('inline-text', 'Wrapped text')
        ]))
      ]).commit();

      const headingId = createResult.operations?.[0].result.data.sid;
      const headingNode = dataStore.getNode(headingId);
      const textNodeId = headingNode?.content?.[0];

      const controlResult = await transaction(mockEditor, [
        ...control(textNodeId, [
          { type: 'unwrap', payload: { start: 0, end: 6, prefix: 'Wrap', suffix: 'text' } }
        ])
      ]).commit();

      expect(controlResult.success).toBe(true);
      expect(controlResult.operations?.[0].type).toBe('unwrap');
      expect(controlResult.operations?.[0].payload.nodeId).toBe(textNodeId);
    });

    it('should add child to node', async () => {
      const createResult = await transaction(mockEditor, [
        create(node('paragraph', {}, [
          textNode('inline-text', 'Existing text')
        ]))
      ]).commit();

      const paragraphId = createResult.operations?.[0].result.data.sid;

      const controlResult = await transaction(mockEditor, [
        ...control(paragraphId, [
          { type: 'addChild', payload: { child: { type: 'inline-text', text: 'New child' } } }
        ])
      ]).commit();

      expect(controlResult.success).toBe(true);
      expect(controlResult.operations?.[0].type).toBe('addChild');
      expect(controlResult.operations?.[0].payload.nodeId).toBe(paragraphId);
      expect(controlResult.operations?.[0].payload.child.type).toBe('inline-text');
      expect(controlResult.operations?.[0].payload.child.text).toBe('New child');
    });

    it('should remove child from node', async () => {
      const createResult = await transaction(mockEditor, [
        create(node('paragraph', {}, [
          textNode('inline-text', 'Child to remove')
        ]))
      ]).commit();

      const nodeId = createResult.operations?.[0].result.data.sid;
      const childId = createResult.operations?.[0].result.data.content[0];

      const controlResult = await transaction(mockEditor, [
        ...control(nodeId, [
          { type: 'removeChild', payload: { childId } }
        ])
      ]).commit();

      expect(controlResult.success).toBe(true);
      expect(controlResult.operations?.[0].type).toBe('removeChild');
      expect(controlResult.operations?.[0].payload.nodeId).toBe(nodeId);
      expect(controlResult.operations?.[0].payload.childId).toBe(childId);
    });
  });

  describe('Complex Control Scenarios', () => {
    it('should perform multiple operations on same node', async () => {
      const createResult = await transaction(mockEditor, [
        create(node('paragraph', {}, [
          textNode('inline-text', 'Original text')
        ]))
      ]).commit();

      const paragraphId = createResult.operations?.[0].result.data.sid;
      const paragraphNode = dataStore.getNode(paragraphId);
      const textNodeId = paragraphNode?.content?.[0];

      const controlResult = await transaction(mockEditor, [
        ...control(textNodeId, [
          { type: 'setText', payload: { text: 'Updated text' } }
        ]),
        ...control(paragraphId, [
          { type: 'setAttrs', payload: { attrs: { class: 'highlighted' } } }
        ]),
        ...control(textNodeId, [
          { type: 'applyMark', payload: { markType: 'bold', start: 0, end: 7 } }
        ])
      ]).commit();

      expect(controlResult.success).toBe(true);
      expect(controlResult.operations).toHaveLength(3);
      expect(controlResult.operations?.[0].type).toBe('setText');
      expect(controlResult.operations?.[1].type).toBe('setAttrs');
      expect(controlResult.operations?.[2].type).toBe('applyMark');
    });

    it('should control nested node operations', async () => {
      const createResult = await transaction(mockEditor, [
        create(node('list', { type: 'bullet' }, [
          node('listItem', {}, [
            node('paragraph', {}, [
              textNode('inline-text', 'List item text')
            ])
          ])
        ]))
      ]).commit();

      const listId = createResult.operations?.[0].result.data.sid;
      const listItemId = createResult.operations?.[0].result.data.content[0];
      const paragraphId = dataStore.getNode(listItemId)?.content?.[0];

      const controlResult = await transaction(mockEditor, [
        ...control(listId, [
          { type: 'setAttrs', payload: { attrs: { type: 'ordered' } } }
        ]),
        ...control(paragraphId, [
          { type: 'setText', payload: { text: 'Updated list item' } }
        ])
      ]).commit();

      expect(controlResult.success).toBe(true);
      expect(controlResult.operations).toHaveLength(2);
      expect(controlResult.operations?.[0].type).toBe('setAttrs');
      expect(controlResult.operations?.[1].type).toBe('setText');
    });

    it('should handle control operations with non-existent nodes', async () => {
      const controlResult = await transaction(mockEditor, [
        ...control('non-existent-sid', [
          { type: 'setText', payload: { text: 'This should fail' } }
        ])
      ]).commit();

      expect(controlResult.success).toBe(false);
      expect(controlResult.errors.length).toBeGreaterThan(0);
    });
  });

  describe('Multiple Control Operations', () => {
    it('should control multiple different nodes', async () => {
      const createResult = await transaction(mockEditor, [
        create(node('paragraph', {}, [
          textNode('inline-text', 'First paragraph')
        ])),
        create(node('paragraph', {}, [
          textNode('inline-text', 'Second paragraph')
        ]))
      ]).commit();

      const firstNodeId = createResult.operations?.[0].result.data.sid;
      const secondNodeId = createResult.operations?.[1].result.data.sid;

      const controlResult = await transaction(mockEditor, [
        ...control(firstNodeId, [
          { type: 'setText', payload: { text: 'Updated first' } }
        ]),
        ...control(secondNodeId, [
          { type: 'setText', payload: { text: 'Updated second' } }
        ])
      ]).commit();

      expect(controlResult.success).toBe(true);
      expect(controlResult.operations).toHaveLength(2);
      expect(controlResult.operations?.[0].payload.nodeId).toBe(firstNodeId);
      expect(controlResult.operations?.[1].payload.nodeId).toBe(secondNodeId);
    });

    it('should control operations with mixed success and failure', async () => {
      const createResult = await transaction(mockEditor, [
        create(node('paragraph', {}, [
          textNode('inline-text', 'Valid node')
        ]))
      ]).commit();

      const paragraphId = createResult.operations?.[0].result.data.sid;
      const paragraphNode = dataStore.getNode(paragraphId);
      const textNodeId = paragraphNode?.content?.[0];

      const controlResult = await transaction(mockEditor, [
        ...control(textNodeId, [
          { type: 'setText', payload: { text: 'Updated text' } }
        ]),
        ...control('invalid-sid', [
          { type: 'setText', payload: { text: 'This should fail' } }
        ])
      ]).commit();

      // This should fail because of the invalid node ID
      if (controlResult.success) {
        console.log('Unexpected success. Errors:', controlResult.errors);
        console.log('Operations:', controlResult.operations?.map(op => ({ type: op.type, nodeId: op.payload?.nodeId })));
      }
      expect(controlResult.success).toBe(false);
      expect(controlResult.errors.length).toBeGreaterThan(0);
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty control operations array', async () => {
      const createResult = await transaction(mockEditor, [
        create(node('paragraph', {}, [
          textNode('inline-text', 'Text')
        ]))
      ]).commit();

      const nodeId = createResult.operations?.[0].result.data.sid;

      const controlResult = await transaction(mockEditor, [
        ...control(nodeId, [])
      ]).commit();

      expect(controlResult.success).toBe(true);
      expect(controlResult.operations).toHaveLength(0);
    });

    it('should handle control operations with invalid operation types', async () => {
      const createResult = await transaction(mockEditor, [
        create(node('paragraph', {}, [
          textNode('inline-text', 'Text')
        ]))
      ]).commit();

      const nodeId = createResult.operations?.[0].result.data.sid;

      const controlResult = await transaction(mockEditor, [
        ...control(nodeId, [
          { type: 'invalidOperation', payload: { data: 'test' } }
        ])
      ]).commit();

      expect(controlResult.success).toBe(false);
      expect(controlResult.errors.length).toBeGreaterThan(0);
    });

    it('should handle control operations with missing payload', async () => {
      const createResult = await transaction(mockEditor, [
        create(node('paragraph', {}, [
          textNode('inline-text', 'Text')
        ]))
      ]).commit();

      const nodeId = createResult.operations?.[0].result.data.sid;

      const controlResult = await transaction(mockEditor, [
        ...control(nodeId, [
          { type: 'setText' } // Missing payload
        ])
      ]).commit();

      if (controlResult.success) {
        console.log('Unexpected success. Errors:', controlResult.errors);
        console.log('Operations:', controlResult.operations?.map(op => ({ type: op.type, payload: op.payload })));
      }
      expect(controlResult.success).toBe(false);
      expect(controlResult.errors.length).toBeGreaterThan(0);
    });
  });
});
