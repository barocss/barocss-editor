import { describe, it, expect, beforeEach } from 'vitest';
import { DataStore } from '../src/data-store';
import { createSchema } from '@barocss/schema';
import type { INode } from '../src/types';

describe('DataStore moveBlockUp/moveBlockDown', () => {
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

  describe('moveBlockUp', () => {
    it('블록을 위로 이동해야 함', () => {
      const docNode: INode = {
        sid: 'doc-1',
        stype: 'document',
        content: ['para-1', 'para-2', 'para-3']
      };
      dataStore.setNode(docNode);

      ['para-1', 'para-2', 'para-3'].forEach((id) => {
        const node: INode = {
          sid: id,
          stype: 'paragraph',
          content: [],
          parentId: 'doc-1'
        };
        dataStore.setNode(node);
      });

      // Move para-2 up
      const result = dataStore.moveBlockUp('para-2');
      expect(result).toBe(true);

      const doc = dataStore.getNode('doc-1');
      expect(doc?.content).toEqual(['para-2', 'para-1', 'para-3']);
    });

    it('첫 번째 블록은 위로 이동할 수 없음', () => {
      const docNode: INode = {
        sid: 'doc-1',
        stype: 'document',
        content: ['para-1', 'para-2']
      };
      dataStore.setNode(docNode);

      ['para-1', 'para-2'].forEach((id) => {
        const node: INode = {
          sid: id,
          stype: 'paragraph',
          content: [],
          parentId: 'doc-1'
        };
        dataStore.setNode(node);
      });

      const result = dataStore.moveBlockUp('para-1');
      expect(result).toBe(false);

      const doc = dataStore.getNode('doc-1');
      expect(doc?.content).toEqual(['para-1', 'para-2']);
    });

    it('부모가 없는 노드는 이동할 수 없음', () => {
      const node: INode = {
        sid: 'para-1',
        stype: 'paragraph',
        content: []
      };
      dataStore.setNode(node);

      const result = dataStore.moveBlockUp('para-1');
      expect(result).toBe(false);
    });
  });

  describe('moveBlockDown', () => {
    it('블록을 아래로 이동해야 함', () => {
      const docNode: INode = {
        sid: 'doc-1',
        stype: 'document',
        content: ['para-1', 'para-2', 'para-3']
      };
      dataStore.setNode(docNode);

      ['para-1', 'para-2', 'para-3'].forEach((id) => {
        const node: INode = {
          sid: id,
          stype: 'paragraph',
          content: [],
          parentId: 'doc-1'
        };
        dataStore.setNode(node);
      });

      // Move para-2 down
      const result = dataStore.moveBlockDown('para-2');
      expect(result).toBe(true);

      const doc = dataStore.getNode('doc-1');
      expect(doc?.content).toEqual(['para-1', 'para-3', 'para-2']);
    });

    it('마지막 블록은 아래로 이동할 수 없음', () => {
      const docNode: INode = {
        sid: 'doc-1',
        stype: 'document',
        content: ['para-1', 'para-2']
      };
      dataStore.setNode(docNode);

      ['para-1', 'para-2'].forEach((id) => {
        const node: INode = {
          sid: id,
          stype: 'paragraph',
          content: [],
          parentId: 'doc-1'
        };
        dataStore.setNode(node);
      });

      const result = dataStore.moveBlockDown('para-2');
      expect(result).toBe(false);

      const doc = dataStore.getNode('doc-1');
      expect(doc?.content).toEqual(['para-1', 'para-2']);
    });

    it('여러 번 이동 가능', () => {
      const docNode: INode = {
        sid: 'doc-1',
        stype: 'document',
        content: ['para-1', 'para-2', 'para-3', 'para-4']
      };
      dataStore.setNode(docNode);

      ['para-1', 'para-2', 'para-3', 'para-4'].forEach((id) => {
        const node: INode = {
          sid: id,
          stype: 'paragraph',
          content: [],
          parentId: 'doc-1'
        };
        dataStore.setNode(node);
      });

      // Move para-3 down twice
      expect(dataStore.moveBlockDown('para-3')).toBe(true);
      expect(dataStore.getNode('doc-1')?.content).toEqual(['para-1', 'para-2', 'para-4', 'para-3']);

      expect(dataStore.moveBlockDown('para-3')).toBe(false); // Already last
      expect(dataStore.getNode('doc-1')?.content).toEqual(['para-1', 'para-2', 'para-4', 'para-3']);

      // Move para-3 up
      expect(dataStore.moveBlockUp('para-3')).toBe(true);
      expect(dataStore.getNode('doc-1')?.content).toEqual(['para-1', 'para-2', 'para-3', 'para-4']);
    });
  });
});

