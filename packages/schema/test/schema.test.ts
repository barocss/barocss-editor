import { describe, it, expect } from 'vitest';
import { createSchema, Schema } from '../src/schema.js';
import { SchemaDefinition } from '../src/types';

describe('Unified Schema', () => {
  const testSchemaDefinition: SchemaDefinition = {
    topNode: 'doc',
    nodes: {
      doc: {
        name: 'doc',
        content: 'block+',
        group: 'document',
        attrs: {
          title: { type: 'string', required: true },
          version: { type: 'string', default: '1.0.0' }
        }
      },
      paragraph: {
        name: 'paragraph',
        content: 'inline*',
        group: 'block',
        attrs: {
          level: { type: 'number', default: 1 }
        }
      },
      heading: {
        name: 'heading',
        content: 'inline*',
        group: 'block',
        attrs: {
          level: { type: 'number', required: true, validator: (value: number) => value >= 1 && value <= 6 }
        }
      },
      text: {
        name: 'text',
        group: 'inline'
      }
    },
    marks: {
      bold: {
        name: 'bold',
        attrs: {
          weight: { type: 'string', default: 'bold' }
        },
        group: 'text-style'
      },
      italic: {
        name: 'italic',
        attrs: {
          style: { type: 'string', default: 'italic' }
        },
        group: 'text-style',
        excludes: ['bold']
      },
      link: {
        name: 'link',
        attrs: {
          href: { type: 'string', required: true },
          title: { type: 'string', required: false }
        },
        group: 'link'
      }
    }
  };

  let schema: Schema;

  beforeEach(() => {
    schema = createSchema('test', testSchemaDefinition);
  });

  describe('constructor', () => {
    it('should create a unified schema with nodes and marks', () => {
      expect(schema.name).toBe('test');
      expect(schema.topNode).toBe('doc');
      expect(schema.nodes.size).toBe(4);
      expect(schema.marks.size).toBe(3);
    });

    it('should set default topNode to doc if not specified', () => {
      const definitionWithoutTopNode: SchemaDefinition = {
        nodes: {
          doc: { name: 'doc', group: 'document' }
        }
      };
      
      const schemaWithoutTopNode = createSchema('test2', definitionWithoutTopNode);
      expect(schemaWithoutTopNode.topNode).toBe('doc');
    });
  });

  describe('node type management', () => {
    it('should get node type by name', () => {
      const docType = schema.getNodeType('doc');
      expect(docType).toBeDefined();
      expect(docType?.name).toBe('doc');
      expect(docType?.group).toBe('document');
    });

    it('should check if node type exists', () => {
      expect(schema.hasNodeType('doc')).toBe(true);
      expect(schema.hasNodeType('paragraph')).toBe(true);
      expect(schema.hasNodeType('nonexistent')).toBe(false);
    });

    it('should get node types by group', () => {
      const blockNodes = schema.getNodeTypesByGroup('block');
      expect(blockNodes).toHaveLength(2);
      expect(blockNodes.map(n => n.name)).toContain('paragraph');
      expect(blockNodes.map(n => n.name)).toContain('heading');
    });
  });

  describe('mark management', () => {
    it('should get mark type by name', () => {
      const boldMark = schema.getMarkType('bold');
      expect(boldMark).toBeDefined();
      expect(boldMark?.name).toBe('bold');
      expect(boldMark?.group).toBe('text-style');
    });

    it('should check if mark type exists', () => {
      expect(schema.hasMarkType('bold')).toBe(true);
      expect(schema.hasMarkType('italic')).toBe(true);
      expect(schema.hasMarkType('nonexistent')).toBe(false);
    });

    it('should get mark types by group', () => {
      const textStyleMarks = schema.getMarkTypesByGroup('text-style');
      expect(textStyleMarks).toHaveLength(2);
      expect(textStyleMarks.map(m => m.name)).toContain('bold');
      expect(textStyleMarks.map(m => m.name)).toContain('italic');
    });
  });

  describe('attribute validation', () => {
    it('should validate node attributes correctly', () => {
      const validAttrs = { level: 2 };
      const result = schema.validateAttributes('heading', validAttrs);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject invalid node attributes', () => {
      const invalidAttrs = { level: 7 }; // heading level should be 1-6
      const result = schema.validateAttributes('heading', invalidAttrs);
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should handle missing required attributes', () => {
      const missingAttrs = {};
      const result = schema.validateAttributes('heading', missingAttrs);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain("Required attribute 'level' is missing or empty.");
    });

    it('should apply default values', () => {
      const attrsWithDefaults = {};
      const result = schema.validateAttributes('paragraph', attrsWithDefaults);
      expect(result.valid).toBe(true);
    });
  });

  describe('content validation', () => {
    it('should validate content model correctly', () => {
      const validContent = [
        { stype: 'paragraph', content: [] },
        { stype: 'heading', attrs: { level: 1 }, content: [] }
      ];
      const result = schema.validateContent('doc', validContent);
      expect(result.valid).toBe(true);
    });

    it('should reject content that does not match model', () => {
      const invalidContent = []; // doc requires block+ (at least one block)
      const result = schema.validateContent('doc', invalidContent);
      expect(result.valid).toBe(false);
    });
  });

  describe('mark validation', () => {
    it('should validate marks correctly', () => {
      const validMarks = [
        { type: 'bold', attrs: { weight: 'bold' } },
        { type: 'link', attrs: { href: 'https://example.com' } }
      ];
      const result = schema.validateMarks(validMarks);
      expect(result.valid).toBe(true);
    });

    it('should reject conflicting marks', () => {
      const conflictingMarks = [
        { type: 'bold', attrs: { weight: 'bold' } },
        { type: 'italic', attrs: { style: 'italic' } }
      ];
      const result = schema.validateMarks(conflictingMarks);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain("Mark 'italic' cannot be used with: bold");
    });

    it('should reject marks with missing required attributes', () => {
      const invalidMarks = [
        { type: 'link', attrs: {} } // missing required href attribute
      ];
      const result = schema.validateMarks(invalidMarks);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain("Required mark attribute 'href' is missing for mark 'link'");
    });
  });

  describe('node creation methods', () => {
    it('should create document nodes', () => {
      const doc = schema.doc([
        schema.node('paragraph', { level: 1 }, [])
      ]);
      
      expect(doc.type).toBe('doc');
      expect(doc.content).toHaveLength(1);
    });

    it('should create regular nodes', () => {
      const paragraph = schema.node('paragraph', { level: 2 }, []);
      
      expect(paragraph.type).toBe('paragraph');
      expect(paragraph.attrs).toEqual({ level: 2 });
      expect(paragraph.content).toEqual([]);
    });

    it('should create text nodes with marks', () => {
      const text = schema.text('Hello World', {}, [
        { type: 'bold', attrs: { weight: 'bold' } }
      ]);
      
      expect(text.type).toBe('text');
      expect(text.content).toBe('Hello World');
      expect(text.marks).toHaveLength(1);
      expect(text.marks[0].type).toBe('bold');
    });

    it('should throw error for unknown node types', () => {
      expect(() => {
        schema.node('unknown', {}, []);
      }).toThrow('Unknown node type: unknown');
    });

    it('should throw error for invalid marks', () => {
      expect(() => {
        schema.text('Hello', {}, [
          { type: 'bold', attrs: { weight: 'bold' } },
          { type: 'italic', attrs: { style: 'italic' } }
        ]);
      }).toThrow('Invalid marks');
    });
  });

  describe('data transformation', () => {
    it('should transform node data', () => {
      const nodeData = {
        type: 'heading',
        attrs: { level: 1 },
        content: []
      };
      
      const transformed = schema.transform('heading', nodeData);
      expect(transformed).toEqual(nodeData); // No transformation defined, should return as-is
    });

    it('should throw error for unknown node type in transform', () => {
      expect(() => {
        schema.transform('unknown', {});
      }).toThrow('Unknown node type: unknown');
    });
  });
});