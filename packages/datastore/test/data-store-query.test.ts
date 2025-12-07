import { describe, it, expect, beforeEach } from 'vitest';
import { DataStore } from '../src/data-store';
import type { INode } from '../src/types';
import { Schema } from '@barocss/schema';

describe('DataStore Query Functions', () => {
  let dataStore: DataStore;
  let schema: Schema;

  beforeEach(() => {
    schema = new Schema('test-schema', {
      nodes: {
        'inline-text': {
          name: 'inline-text',
          group: 'inline',
          content: 'text*',
          attrs: {
            class: { type: 'string', default: null }
          }
        },
        'paragraph': {
          name: 'paragraph',
          group: 'block',
          content: 'inline*',
          attrs: {
            class: { type: 'string', default: null }
          }
        },
        'document': {
          name: 'document',
          group: 'document',
          content: 'block+',
          attrs: {
            class: { type: 'string', default: null }
          }
        }
      },
      marks: {
        bold: {
          name: 'bold',
          group: 'text-style',
          attrs: {
            class: { type: 'string', default: null }
          }
        }
      }
    });
    dataStore = new DataStore(undefined, schema);

    // Create test data
    const document = {
      stype: 'document',
      content: [
        {
          stype: 'paragraph',
          content: [
            { stype: 'inline-text', text: 'Hello World' }
          ]
        },
        {
          stype: 'paragraph',
          content: [
            { stype: 'inline-text', text: 'Test Content' }
          ]
        }
      ]
    };

    dataStore.createNodeWithChildren(document);
  });

  describe('findNodes', () => {
    it('should find nodes by predicate', () => {
      const textNodes = dataStore.findNodes(node => node.stype === 'inline-text');
      expect(textNodes).toHaveLength(2);
      expect(textNodes.every(node => node.stype === 'inline-text')).toBe(true);
    });

    it('should return empty array when no nodes match', () => {
      const invalidNodes = dataStore.findNodes(node => node.stype === 'invalid');
      expect(invalidNodes).toHaveLength(0);
    });
  });

  describe('findNodesByType', () => {
    it('should find nodes by type', () => {
      const paragraphNodes = dataStore.findNodesByType('paragraph');
      expect(paragraphNodes).toHaveLength(2);
      expect(paragraphNodes.every(node => node.stype === 'paragraph')).toBe(true);
    });

    it('should find document nodes', () => {
      const documentNodes = dataStore.findNodesByType('document');
      expect(documentNodes).toHaveLength(1);
      expect(documentNodes[0].stype).toBe('document');
    });
  });

  describe('findNodesByAttribute', () => {
    it('should find nodes by attribute', () => {
      // Add attribute to node
      const nodes = dataStore.getAllNodes();
      const firstNode = nodes[0];
      if (firstNode) {
        firstNode.attributes = { class: 'test-class' };
        dataStore.setNodeInternal(firstNode);
      }

      const nodesWithClass = dataStore.findNodesByAttribute('class', 'test-class');
      expect(nodesWithClass).toHaveLength(1);
      expect(nodesWithClass[0].attributes?.class).toBe('test-class');
    });

    it('should return empty array when no nodes have attribute', () => {
      const nodesWithInvalidAttr = dataStore.findNodesByAttribute('invalid', 'value');
      expect(nodesWithInvalidAttr).toHaveLength(0);
    });
  });

  describe('findNodesByText', () => {
    it('should find nodes by text content', () => {
      const helloNodes = dataStore.findNodesByText('Hello');
      expect(helloNodes).toHaveLength(1);
      expect(helloNodes[0].text).toContain('Hello');
    });

    it('should find nodes by partial text', () => {
      const worldNodes = dataStore.findNodesByText('World');
      expect(worldNodes).toHaveLength(1);
      expect(worldNodes[0].text).toContain('World');
    });

    it('should return empty array when no nodes contain text', () => {
      const invalidTextNodes = dataStore.findNodesByText('Invalid');
      expect(invalidTextNodes).toHaveLength(0);
    });
  });

  describe('findChildrenByParentId', () => {
    it('should find children by parent ID', () => {
      const documentNodes = dataStore.findNodesByType('document');
      expect(documentNodes).toHaveLength(1);
      
      const documentId = documentNodes[0].sid!;
      const children = dataStore.findChildrenByParentId(documentId);
      expect(children).toHaveLength(2);
      expect(children.every(child => child.parentId === documentId)).toBe(true);
    });

    it('should return empty array when parent has no children', () => {
      const textNodes = dataStore.findNodesByType('inline-text');
      const textNodeId = textNodes[0].sid!;
      const children = dataStore.findChildrenByParentId(textNodeId);
      expect(children).toHaveLength(0);
    });
  });

  describe('findRootNodes', () => {
    it('should find root nodes', () => {
      const rootNodes = dataStore.findRootNodes();
      expect(rootNodes).toHaveLength(1);
      expect(rootNodes[0].stype).toBe('document');
      expect(rootNodes[0].parentId).toBeUndefined();
    });
  });
});
