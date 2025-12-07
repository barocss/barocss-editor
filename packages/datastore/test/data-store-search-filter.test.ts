import { describe, it, expect, beforeEach } from 'vitest';
import { DataStore } from '../src/data-store';
import { Schema } from '@barocss/schema';
import type { INode } from '../src/types';

describe('DataStore Search & Filter Functions', () => {
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
            class: { type: 'string', default: null },
            id: { type: 'string', default: null }
          } 
        },
        'paragraph': { 
          name: 'paragraph', 
          group: 'block', 
          content: 'inline*', 
          attrs: { 
            class: { type: 'string', default: null },
            id: { type: 'string', default: null }
          } 
        },
        'document': { 
          name: 'document', 
          group: 'document', 
          content: 'block+', 
          attrs: { 
            class: { type: 'string', default: null },
            id: { type: 'string', default: null }
          } 
        }
      },
      marks: {}
    });
    dataStore = new DataStore(undefined, schema);

    // Create document structure for testing
    const document: INode = {
      stype: 'document',
      attributes: { class: 'main-doc', id: 'doc-1' },
      content: [
        {
          stype: 'paragraph',
          attributes: { class: 'intro', id: 'para-1' },
          content: [
            { 
              stype: 'inline-text', 
              text: 'Hello World', 
              attributes: { class: 'bold', id: 'text-1' } 
            },
            { 
              stype: 'inline-text', 
              text: 'Second Text', 
              attributes: { class: 'normal', id: 'text-2' } 
            }
          ]
        },
        {
          stype: 'paragraph',
          attributes: { class: 'conclusion', id: 'para-2' },
          content: [
            { 
              stype: 'inline-text', 
              text: 'Final thoughts', 
              attributes: { class: 'italic', id: 'text-3' } 
            }
          ]
        }
      ]
    };

    dataStore.createNodeWithChildren(document);
  });

  describe('searchText', () => {
    it('should find nodes containing exact text', () => {
      const results = dataStore.searchText('Hello');
      expect(results).toHaveLength(1);
      expect(results[0].text).toContain('Hello');
      expect(results[0].attributes.id).toBe('text-1');
    });

    it('should find nodes containing partial text', () => {
      const results = dataStore.searchText('World');
      expect(results).toHaveLength(1);
      expect(results[0].text).toContain('World');
    });

    it('should be case insensitive', () => {
      const results = dataStore.searchText('hello');
      expect(results).toHaveLength(1);
      expect(results[0].text).toContain('Hello');
    });

    it('should find multiple nodes with same text', () => {
      // Add node with same text
      const duplicateText: INode = {
        stype: 'inline-text',
        text: 'Hello World',
        attributes: { class: 'duplicate', sid: 'text-4' }
      };
      dataStore.setNode(duplicateText);

      const results = dataStore.searchText('Hello World');
      expect(results).toHaveLength(2);
    });

    it('should return empty array when no matches found', () => {
      const results = dataStore.searchText('NonExistentText');
      expect(results).toHaveLength(0);
    });

    it('should handle empty query', () => {
      const results = dataStore.searchText('');
      expect(results).toHaveLength(0);
    });
  });

  describe('findByAttribute', () => {
    it('should find nodes by class attribute', () => {
      const results = dataStore.findByAttribute('class', 'bold');
      expect(results).toHaveLength(1);
      expect(results[0].attributes.class).toBe('bold');
      expect(results[0].attributes.id).toBe('text-1');
    });

    it('should find nodes by id attribute', () => {
      const results = dataStore.findByAttribute('id', 'para-1');
      expect(results).toHaveLength(1);
      expect(results[0].attributes.id).toBe('para-1');
      expect(results[0].stype).toBe('paragraph');
    });

    it('should find multiple nodes with same attribute value', () => {
      // Add node with same class
      const duplicateClass: INode = {
        stype: 'inline-text',
        text: 'Another text',
        attributes: { class: 'bold', sid: 'text-5' }
      };
      dataStore.setNode(duplicateClass);

      const results = dataStore.findByAttribute('class', 'bold');
      expect(results).toHaveLength(2);
    });

    it('should return empty array when no nodes have attribute', () => {
      const results = dataStore.findByAttribute('non-existent-attr', 'value');
      expect(results).toHaveLength(0);
    });

    it('should return empty array when attribute value not found', () => {
      const results = dataStore.findByAttribute('class', 'non-existent-class');
      expect(results).toHaveLength(0);
    });

    it('should handle null values', () => {
      const results = dataStore.findByAttribute('class', null);
      expect(results).toHaveLength(0); // All nodes have class values
    });
  });

  describe('Integration with existing query functions', () => {
    it('should work with findNodesByType', () => {
      const textNodes = dataStore.findNodesByType('inline-text');
      const boldNodes = dataStore.findByAttribute('class', 'bold');
      
      expect(textNodes).toHaveLength(3); // 3 inline-text nodes
      expect(boldNodes).toHaveLength(1); // 1 bold class node
      
      // Verify bold class node is inline-text type
      const boldTextNodes = textNodes.filter(node => 
        boldNodes.some(boldNode => boldNode.sid === node.sid)
      );
      expect(boldTextNodes).toHaveLength(1);
    });

    it('should work with findNodesByText', () => {
      const helloNodes = dataStore.findNodesByText('Hello');
      const searchResults = dataStore.searchText('Hello');
      
      expect(helloNodes).toHaveLength(1);
      expect(searchResults).toHaveLength(1);
      expect(helloNodes[0].sid).toBe(searchResults[0].sid);
    });
  });
});
