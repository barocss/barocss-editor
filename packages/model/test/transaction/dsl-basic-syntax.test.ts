import { describe, it, expect } from 'vitest';
import { node, textNode, mark, control } from '../../src/transaction-dsl';
import { create } from '../../src/operations-dsl/create';

describe('DSL Basic Syntax', () => {
  describe('node() helper', () => {
    it('should create simple container node', () => {
      const result = node('paragraph');
      
      expect(result).toEqual({
        type: 'paragraph'
      });
    });

    it('should create container node with attributes', () => {
      const result = node('paragraph', { class: 'content' });
      
      expect(result).toEqual({
        type: 'paragraph',
        attributes: { class: 'content' }
      });
    });

    it('should create container node with content', () => {
      const result = node('paragraph', {}, [
        textNode('inline-text', 'Hello'),
        textNode('inline-text', 'World')
      ]);
      
      expect(result).toEqual({
        type: 'paragraph',
        attributes: {},
        content: [
          { type: 'inline-text', text: 'Hello' },
          { type: 'inline-text', text: 'World' }
        ]
      });
    });

    it('should create container node with attributes and content', () => {
      const result = node('heading', { level: 1 }, [
        textNode('inline-text', 'Title')
      ]);
      
      expect(result).toEqual({
        type: 'heading',
        attributes: { level: 1 },
        content: [
          { type: 'inline-text', text: 'Title' }
        ]
      });
    });

    it('should handle empty content array', () => {
      const result = node('paragraph', {}, []);
      
      expect(result).toEqual({
        type: 'paragraph',
        attributes: {},
        content: []
      });
    });

    it('should handle undefined attributes', () => {
      const result = node('paragraph', undefined, [
        textNode('inline-text', 'Text')
      ]);
      
      expect(result).toEqual({
        type: 'paragraph',
        content: [
          { type: 'inline-text', text: 'Text' }
        ]
      });
    });

    it('should create nested container nodes', () => {
      const result = node('list', { type: 'ordered' }, [
        node('listItem', {}, [
          textNode('inline-text', 'First item')
        ]),
        node('listItem', {}, [
          textNode('inline-text', 'Second item')
        ])
      ]);
      
      expect(result).toEqual({
        type: 'list',
        attributes: { type: 'ordered' },
        content: [
          {
            type: 'listItem',
            attributes: {},
            content: [{ type: 'inline-text', text: 'First item' }]
          },
          {
            type: 'listItem',
            attributes: {},
            content: [{ type: 'inline-text', text: 'Second item' }]
          }
        ]
      });
    });
  });

  describe('textNode() helper', () => {
    it('should create simple text node', () => {
      const result = textNode('inline-text', 'Hello World');
      
      expect(result).toEqual({
        type: 'inline-text',
        text: 'Hello World'
      });
    });

    it('should create text node with attributes', () => {
      const result = textNode('inline-text', 'Hello', { class: 'highlight' });
      
      expect(result).toEqual({
        type: 'inline-text',
        text: 'Hello',
        attributes: { class: 'highlight' }
      });
    });

    it('should create text node with marks', () => {
      const result = textNode('inline-text', 'Bold text', [mark('bold')]);
      
      expect(result).toEqual({
        type: 'inline-text',
        text: 'Bold text',
        marks: [{ type: 'bold', attrs: {}, range: undefined }]
      });
    });

    it('should create text node with attributes and marks', () => {
      const result = textNode('inline-text', 'Styled text', [mark('bold')], { class: 'highlight' });
      
      expect(result).toEqual({
        type: 'inline-text',
        text: 'Styled text',
        attributes: { class: 'highlight' },
        marks: [{ type: 'bold', attrs: {}, range: undefined }]
      });
    });

    it('should create atom node with text', () => {
      const result = textNode('codeBlock', 'const x = 1;', { language: 'javascript' });
      
      expect(result).toEqual({
        type: 'codeBlock',
        text: 'const x = 1;',
        attributes: { language: 'javascript' }
      });
    });

    it('should create text node with multiple marks', () => {
      const result = textNode('inline-text', 'Bold and italic', [
        mark('bold'),
        mark('italic')
      ]);
      
      expect(result).toEqual({
        type: 'inline-text',
        text: 'Bold and italic',
        marks: [
          { type: 'bold', attrs: {}, range: undefined },
          { type: 'italic', attrs: {}, range: undefined }
        ]
      });
    });
  });

  describe('mark() helper', () => {
    it('should create simple mark', () => {
      const result = mark('bold');
      
      expect(result).toEqual({
        type: 'bold',
        attrs: {},
        range: undefined
      });
    });

    it('should create mark with attributes', () => {
      const result = mark('bold', { weight: 'bold' });
      
      expect(result).toEqual({
        type: 'bold',
        attrs: { weight: 'bold' },
        range: undefined
      });
    });

    it('should create mark with range', () => {
      const result = mark('bold', { range: [0, 5] });
      
      expect(result).toEqual({
        type: 'bold',
        attrs: {},
        range: [0, 5]
      });
    });

    it('should create mark with attributes and range', () => {
      const result = mark('link', { href: 'https://example.com', range: [0, 10] });
      
      expect(result).toEqual({
        type: 'link',
        attrs: { href: 'https://example.com' },
        range: [0, 10]
      });
    });

    it('should handle empty attributes object', () => {
      const result = mark('italic', {});
      
      expect(result).toEqual({
        type: 'italic',
        attrs: {},
        range: undefined
      });
    });
  });

  describe('control() helper', () => {
    it('should create single control operation', () => {
      const result = control('node-sid', [
        { type: 'setText', payload: { text: 'New text' } }
      ]);
      
      expect(result).toEqual([
        {
          type: 'setText',
          payload: {
            text: 'New text',
            nodeId: 'node-sid'
          }
        }
      ]);
    });

    it('should create multiple control operations', () => {
      const result = control('node-sid', [
        { type: 'setText', payload: { text: 'New text' } },
        { type: 'setAttrs', payload: { attrs: { class: 'highlight' } } }
      ]);
      
      expect(result).toEqual([
        {
          type: 'setText',
          payload: {
            text: 'New text',
            nodeId: 'node-sid'
          }
        },
        {
          type: 'setAttrs',
          payload: {
            attrs: { class: 'highlight' },
            nodeId: 'node-sid'
          }
        }
      ]);
    });

    it('should handle operations without payload', () => {
      const result = control('node-sid', [
        { type: 'clearSelection' }
      ]);
      
      expect(result).toEqual([
        {
          type: 'clearSelection',
          payload: {
            nodeId: 'node-sid'
          }
        }
      ]);
    });

    it('should handle empty operations array', () => {
      const result = control('node-sid', []);
      
      expect(result).toEqual([]);
    });

    it('should merge existing payload with nodeId', () => {
      const result = control('node-sid', [
        { type: 'replaceText', payload: { start: 0, end: 5, newText: 'Hello' } }
      ]);
      
      expect(result).toEqual([
        {
          type: 'replaceText',
          payload: {
            start: 0,
            end: 5,
            newText: 'Hello',
            nodeId: 'node-sid'
          }
        }
      ]);
    });
  });

  describe('create() helper', () => {
    it('should create create operation with simple text node', () => {
      const nodeObj = textNode('inline-text', 'Hello');
      const result = create(nodeObj);
      
      expect(result).toEqual({
        type: 'create',
        payload: {
          node: {
            type: 'inline-text',
            text: 'Hello'
          },
          options: undefined
        }
      });
    });

    it('should create create operation with complex container node', () => {
      const nodeObj = node('paragraph', { class: 'content' }, [
        textNode('inline-text', 'Hello'),
        textNode('inline-text', 'World')
      ]);
      const result = create(nodeObj);
      
      expect(result).toEqual({
        type: 'create',
        payload: {
          node: {
            type: 'paragraph',
            attributes: { class: 'content' },
            content: [
              { type: 'inline-text', text: 'Hello' },
              { type: 'inline-text', text: 'World' }
            ]
          },
          options: undefined
        }
      });
    });

    it('should create create operation with options', () => {
      const nodeObj = textNode('inline-text', 'Hello');
      const result = create(nodeObj, { position: 'after' });
      
      expect(result).toEqual({
        type: 'create',
        payload: {
          node: {
            type: 'inline-text',
            text: 'Hello'
          },
          options: { position: 'after' }
        }
      });
    });

    it('should handle text node with marks', () => {
      const nodeObj = textNode('inline-text', 'Bold text', [mark('bold')]);
      const result = create(nodeObj);
      
      expect(result).toEqual({
        type: 'create',
        payload: {
          node: {
            type: 'inline-text',
            text: 'Bold text',
            marks: [{ type: 'bold', attrs: {}, range: undefined }]
          },
          options: undefined
        }
      });
    });
  });

  describe('Complex combinations', () => {
    it('should handle nested node structures', () => {
      const result = node('document', {}, [
        node('heading', { level: 1 }, [
          textNode('inline-text', 'Title')
        ]),
        node('paragraph', {}, [
          textNode('inline-text', 'Content with '),
          textNode('inline-text', 'bold', [mark('bold')]),
          textNode('inline-text', ' text')
        ])
      ]);
      
      expect(result).toEqual({
        type: 'document',
        attributes: {},
        content: [
          {
            type: 'heading',
            attributes: { level: 1 },
            content: [
              { type: 'inline-text', text: 'Title' }
            ]
          },
          {
            type: 'paragraph',
            attributes: {},
            content: [
              { type: 'inline-text', text: 'Content with ' },
              {
                type: 'inline-text',
                text: 'bold',
                marks: [{ type: 'bold', attrs: {}, range: undefined }]
              },
              { type: 'inline-text', text: ' text' }
            ]
          }
        ]
      });
    });

    it('should handle multiple marks on same text', () => {
      const result = textNode('inline-text', 'Styled text', [
        mark('bold', { weight: 'bold' }),
        mark('italic', { style: 'italic' })
      ]);
      
      expect(result).toEqual({
        type: 'inline-text',
        text: 'Styled text',
        marks: [
          { type: 'bold', attrs: { weight: 'bold' }, range: undefined },
          { type: 'italic', attrs: { style: 'italic' }, range: undefined }
        ]
      });
    });

    it('should handle control with complex operations', () => {
      const result = control('node-sid', [
        { type: 'setText', payload: { text: 'New text' } },
        { type: 'setMarks', payload: { marks: [mark('bold')] } },
        { type: 'setAttrs', payload: { attrs: { class: 'updated' } } }
      ]);
      
      expect(result).toEqual([
        {
          type: 'setText',
          payload: { text: 'New text', nodeId: 'node-sid' }
        },
        {
          type: 'setMarks',
          payload: { 
            marks: [{ type: 'bold', attrs: {}, range: undefined }],
            nodeId: 'node-sid'
          }
        },
        {
          type: 'setAttrs',
          payload: { attrs: { class: 'updated' }, nodeId: 'node-sid' }
        }
      ]);
    });
  });
});
