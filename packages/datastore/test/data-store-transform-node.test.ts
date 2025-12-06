import { describe, it, expect, beforeEach } from 'vitest';
import { DataStore } from '../src/data-store';
import { createSchema } from '@barocss/schema';
import type { INode } from '../src/types';

describe('DataStore transformNode', () => {
  let dataStore: DataStore;
  let schema: any;

  beforeEach(() => {
    dataStore = new DataStore();
    schema = createSchema('test', {
      topNode: 'document',
      nodes: {
        document: { name: 'document', group: 'document', content: 'block+' },
        paragraph: { 
          name: 'paragraph', 
          group: 'block', 
          content: 'inline-text+',
          attrs: {}
        },
        heading: { 
          name: 'heading', 
          group: 'block', 
          content: 'inline-text+',
          attrs: { level: { type: 'number', default: 1 } }
        },
        'inline-text': { 
          name: 'inline-text', 
          group: 'inline'
        }
      }
    });
    dataStore.registerSchema(schema);
  });

  describe('paragraph → heading 변환', () => {
    it('paragraph를 heading으로 변환해야 함', () => {
      const docNode: INode = {
        sid: 'doc-1',
        stype: 'document',
        content: ['para-1']
      };
      dataStore.setNode(docNode);

      const paragraphNode: INode = {
        sid: 'para-1',
        stype: 'paragraph',
        content: ['text-1'],
        parentId: 'doc-1'
      };
      dataStore.setNode(paragraphNode);

      const textNode: INode = {
        sid: 'text-1',
        stype: 'inline-text',
        text: 'Hello World',
        parentId: 'para-1'
      };
      dataStore.setNode(textNode);

      const result = dataStore.transformNode('para-1', 'heading', { level: 1 });
      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
      expect(result.newNodeId).toBe('para-1');

      const transformedNode = dataStore.getNode('para-1');
      expect(transformedNode?.stype).toBe('heading');
      expect(transformedNode?.attributes?.level).toBe(1);
      expect(transformedNode?.content).toEqual(['text-1']);

      // Position should be maintained in parent's content
      const doc = dataStore.getNode('doc-1');
      expect(doc?.content).toEqual(['para-1']);
    });

    it('heading을 paragraph로 변환해야 함', () => {
      const docNode: INode = {
        sid: 'doc-1',
        stype: 'document',
        content: ['heading-1']
      };
      dataStore.setNode(docNode);

      const headingNode: INode = {
        sid: 'heading-1',
        stype: 'heading',
        content: ['text-1'],
        attributes: { level: 2 },
        parentId: 'doc-1'
      };
      dataStore.setNode(headingNode);

      const textNode: INode = {
        sid: 'text-1',
        stype: 'inline-text',
        text: 'Heading Text',
        parentId: 'heading-1'
      };
      dataStore.setNode(textNode);

      const result = dataStore.transformNode('heading-1', 'paragraph');
      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
      expect(result.newNodeId).toBe('heading-1');

      const transformedNode = dataStore.getNode('heading-1');
      expect(transformedNode?.stype).toBe('paragraph');
      expect(transformedNode?.content).toEqual(['text-1']);
      // Attributes are maintained but level has no meaning for paragraph
    });

    it('같은 타입으로 변환하면 no-op이어야 함', () => {
      const paragraphNode: INode = {
        sid: 'para-1',
        stype: 'paragraph',
        content: ['text-1'],
        parentId: 'doc-1'
      };
      dataStore.setNode(paragraphNode);

      const result = dataStore.transformNode('para-1', 'paragraph');
      expect(result.valid).toBe(true);
      expect(result.newNodeId).toBe('para-1');

      const node = dataStore.getNode('para-1');
      expect(node?.stype).toBe('paragraph');
    });

    it('존재하지 않는 노드 변환 시 에러를 반환해야 함', () => {
      const result = dataStore.transformNode('nonexistent', 'heading');
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Node not found: nonexistent');
    });

    it('여러 노드가 있을 때 위치가 유지되어야 함', () => {
      const docNode: INode = {
        sid: 'doc-1',
        stype: 'document',
        content: ['para-1', 'para-2', 'para-3']
      };
      dataStore.setNode(docNode);

      ['para-1', 'para-2', 'para-3'].forEach((id, index) => {
        const node: INode = {
          sid: id,
          stype: 'paragraph',
          content: [],
          parentId: 'doc-1'
        };
        dataStore.setNode(node);
      });

      // Transform middle node
      const result = dataStore.transformNode('para-2', 'heading', { level: 2 });
      expect(result.valid).toBe(true);

      const doc = dataStore.getNode('doc-1');
      expect(doc?.content).toEqual(['para-1', 'para-2', 'para-3']);

      const transformed = dataStore.getNode('para-2');
      expect(transformed?.stype).toBe('heading');
      expect(transformed?.attributes?.level).toBe(2);
    });

    it('content와 attributes가 유지되어야 함', () => {
      const docNode: INode = {
        sid: 'doc-1',
        stype: 'document',
        content: ['para-1']
      };
      dataStore.setNode(docNode);

      const paragraphNode: INode = {
        sid: 'para-1',
        stype: 'paragraph',
        content: ['text-1', 'text-2'],
        attributes: { class: 'custom-class', id: 'para-1' },
        parentId: 'doc-1'
      };
      dataStore.setNode(paragraphNode);

      ['text-1', 'text-2'].forEach((id) => {
        const textNode: INode = {
          sid: id,
          stype: 'inline-text',
          text: `Text ${id}`,
          parentId: 'para-1'
        };
        dataStore.setNode(textNode);
      });

      const result = dataStore.transformNode('para-1', 'heading', { level: 3 });
      expect(result.valid).toBe(true);

      const transformed = dataStore.getNode('para-1');
      expect(transformed?.stype).toBe('heading');
      expect(transformed?.content).toEqual(['text-1', 'text-2']);
      expect(transformed?.attributes?.level).toBe(3);
      expect(transformed?.attributes?.class).toBe('custom-class');
      expect(transformed?.attributes?.id).toBe('para-1');
    });
  });
});

