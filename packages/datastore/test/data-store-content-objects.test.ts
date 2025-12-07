import { describe, it, expect, beforeEach } from 'vitest';
import { DataStore } from '../src/data-store';
import type { INode } from '../src/types';
import { Schema } from '@barocss/schema';

describe('DataStore Content as Objects Functions', () => {
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

    // Create test data (nested structure)
    const document = {
      stype: 'document',
      content: [
        {
          stype: 'paragraph',
          content: [
            { stype: 'inline-text', text: 'Hello World' },
            { stype: 'inline-text', text: 'Second Text' }
          ]
        },
        {
          stype: 'paragraph',
          content: [
            { stype: 'inline-text', text: 'Another Paragraph' }
          ]
        }
      ]
    };

    const result = dataStore.createNodeWithChildren(document);
    console.log('createNodeWithChildren result:', { id: result.sid, stype: result.stype });
    
    // Verify document node is actually stored
    const documentFromStore = dataStore.getNode(result.sid!);
    console.log('Document from store:', documentFromStore ? { id: documentFromStore.sid, stype: documentFromStore.stype } : 'NOT FOUND');
  });

  describe('getNodeChildren', () => {
    it('should return children as object array', () => {
      const documentNodes = dataStore.findNodesByType('document');
      expect(documentNodes).toHaveLength(1);
      
      const documentId = documentNodes[0].sid!;
      const children = dataStore.getNodeChildren(documentId);
      
      expect(children).toHaveLength(2);
      expect(children.every(node => node.stype === 'paragraph')).toBe(true);
      expect(children[0].sid).toBeDefined();
      expect(children[1].sid).toBeDefined();
    });

    it('should return empty array for node without content', () => {
      const textNodes = dataStore.findNodesByType('inline-text');
      const textNodeId = textNodes[0].sid!;
      const children = dataStore.getNodeChildren(textNodeId);
      
      expect(children).toHaveLength(0);
    });

    it('should return empty array for non-existent node', () => {
      const children = dataStore.getNodeChildren('non-existent');
      expect(children).toHaveLength(0);
    });
  });

  describe('getNodeChildrenDeep', () => {
    it('should return children as object array recursively', () => {
      const documentNodes = dataStore.findNodesByType('document');
      expect(documentNodes).toHaveLength(1);
      
      const documentId = documentNodes[0].sid!;
      const children = dataStore.getNodeChildrenDeep(documentId);
      
      expect(children).toHaveLength(2);
      expect(children.every(node => node.stype === 'paragraph')).toBe(true);
      
      // Each paragraph's content should also be an object array
      children.forEach(paragraph => {
        expect(Array.isArray(paragraph.content)).toBe(true);
        expect(paragraph.content?.every(child => typeof child === 'object')).toBe(true);
        expect(paragraph.content?.every(child => (child as INode).stype === 'inline-text')).toBe(true);
      });
    });

    it('should handle deeply nested structures', () => {
      const paragraphNodes = dataStore.findNodesByType('paragraph');
      const paragraphId = paragraphNodes[0].sid!;
      const children = dataStore.getNodeChildrenDeep(paragraphId);
      
      expect(children).toHaveLength(2);
      expect(children.every(node => node.stype === 'inline-text')).toBe(true);
      expect(children[0].text).toBe('Hello World');
      expect(children[1].text).toBe('Second Text');
    });
  });

  describe('getNodeWithChildren', () => {
    it('should return node with children as object array', () => {
      const documentNodes = dataStore.findNodesByType('document');
      expect(documentNodes).toHaveLength(1);
      
      const documentId = documentNodes[0].sid!;
      const nodeWithChildren = dataStore.getNodeWithChildren(documentId);
      
      expect(nodeWithChildren).toBeDefined();
      expect(nodeWithChildren!.stype).toBe('document');
      expect(Array.isArray(nodeWithChildren!.content)).toBe(true);
      expect(nodeWithChildren!.content).toHaveLength(2);
      expect(nodeWithChildren!.content?.every(child => typeof child === 'object')).toBe(true);
    });

    it('should return null for non-existent node', () => {
      const nodeWithChildren = dataStore.getNodeWithChildren('non-existent');
      expect(nodeWithChildren).toBeNull();
    });
  });

  describe('getAllNodesWithChildren', () => {
    it('should return all nodes with children as object arrays', () => {
      const allNodesWithChildren = dataStore.getAllNodesWithChildren();
      
      // Verify actual node count (document + 2 paragraphs + 3 text nodes = 6)
      expect(allNodesWithChildren).toHaveLength(6);
      
      // Verify actual node types
      console.log('Node types:', allNodesWithChildren.map(node => node.stype));
      console.log('All nodes:', allNodesWithChildren.map(node => ({ id: node.sid, type: node.stype })));
      
      // Also verify with getAllNodes()
      const allNodes = dataStore.getAllNodes();
      console.log('All nodes from getAllNodes():', allNodes.map(node => ({ id: node.sid, type: node.stype })));
      
      // Find document node
      const documentNode = allNodesWithChildren.find(node => node.stype === 'document');
      expect(documentNode).toBeDefined();
      expect(Array.isArray(documentNode!.content)).toBe(true);
      expect(documentNode!.content).toHaveLength(2);
      
      // Verify paragraph nodes
      const paragraphNodes = allNodesWithChildren.filter(node => node.stype === 'paragraph');
      expect(paragraphNodes).toHaveLength(2);
      
      paragraphNodes.forEach(paragraph => {
        expect(Array.isArray(paragraph.content)).toBe(true);
        expect(paragraph.content?.every(child => typeof child === 'object')).toBe(true);
      });
    });
  });

  describe('Integration with existing functionality', () => {
    it('should work with query functions', () => {
      const paragraphNodes = dataStore.findNodesByType('paragraph');
      expect(paragraphNodes).toHaveLength(2);
      
      const firstParagraphId = paragraphNodes[0].sid!;
      const children = dataStore.getNodeChildrenDeep(firstParagraphId);
      
      expect(children).toHaveLength(2);
      expect(children.every(node => node.stype === 'inline-text')).toBe(true);
    });

    it('should maintain data integrity', () => {
      const allNodesWithChildren = dataStore.getAllNodesWithChildren();
      const allNodes = dataStore.getAllNodes();
      
      // Verify actual node count
      console.log('allNodes.length:', allNodes.length);
      console.log('allNodesWithChildren.length:', allNodesWithChildren.length);
      
      // ID-based node count and object-based node count should be equal
      expect(allNodesWithChildren).toHaveLength(allNodes.length);
      
      // All IDs should be preserved
      const nodeWithChildrenIds = allNodesWithChildren.map(node => node.sid).sort();
      const nodeIds = allNodes.map(node => node.sid).sort();
      expect(nodeWithChildrenIds).toEqual(nodeIds);
    });
  });
});
