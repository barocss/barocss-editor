import { describe, it, expect, beforeEach } from 'vitest';
import { Validator } from '../src/validators.js';
import { createSchema } from '../src/schema.js';
import type { SchemaDefinition } from '../src/types';

describe('Schema Validators', () => {
  let schema: any;

  beforeEach(() => {
    const schemaDefinition: SchemaDefinition = {
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
        }
      }
    };

    schema = createSchema('test', schemaDefinition);
  });

  describe('Validator.validateAttributes', () => {
    it('should validate node attributes correctly', () => {
      const validAttrs = { level: 2 };
      const result = Validator.validateAttributes(schema.getNodeType('heading')?.attrs || {}, validAttrs);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject invalid node attributes', () => {
      const invalidAttrs = { level: 7 }; // heading level should be 1-6
      const result = Validator.validateAttributes(schema.getNodeType('heading')?.attrs || {}, invalidAttrs);
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should handle missing required attributes', () => {
      const missingAttrs = {};
      const result = Validator.validateAttributes(schema.getNodeType('heading')?.attrs || {}, missingAttrs);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain("Required attribute 'level' is missing or empty.");
    });

    it('should apply default values', () => {
      const attrsWithDefaults = {};
      const result = Validator.validateAttributes(schema.getNodeType('paragraph')?.attrs || {}, attrsWithDefaults);
      expect(result.valid).toBe(true);
    });
  });

  describe('Validator.validateContentModel', () => {
    it('should validate content model with * (zero or more)', () => {
      const content = [
        { stype: 'text', content: 'Hello' },
        { stype: 'text', content: 'World' }
      ];
      const result = Validator.validateContentModel(schema, 'paragraph', content);
      expect(result.valid).toBe(true);
    });

    it('should validate empty content with * (zero or more)', () => {
      const content: any[] = [];
      const result = Validator.validateContentModel(schema, 'paragraph', content);
      expect(result.valid).toBe(true);
    });

    it('should validate content model with + (one or more)', () => {
      const content = [
        { stype: 'paragraph', content: [] }
      ];
      const result = Validator.validateContentModel(schema, 'doc', content);
      expect(result.valid).toBe(true);
    });

    it('should return error for empty content with + (one or more)', () => {
      const content: any[] = [];
      const result = Validator.validateContentModel(schema, 'doc', content);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain("Content is required but empty for model 'block+'.");
    });

    it('should validate content model with ? (zero or one)', () => {
      const content = [{ stype: 'text', content: 'Hello' }];
      const result = Validator.validateContentModel(schema, 'text', content);
      expect(result.valid).toBe(true);
    });

    it('should validate empty content with ? (zero or one)', () => {
      const content: any[] = [];
      const result = Validator.validateContentModel(schema, 'text', content);
      expect(result.valid).toBe(true);
    });

    it('should return error for multiple content with ? (zero or one)', () => {
      // text 노드는 콘텐츠 모델이 없으므로 다른 노드 타입으로 테스트
      const content = [
        { stype: 'paragraph', content: [] },
        { stype: 'paragraph', content: [] }
      ];
      // paragraph 노드에 ? 모델을 임시로 설정하여 테스트
      const paragraphDef = schema.getNodeType('paragraph');
      if (paragraphDef) {
        paragraphDef.content = 'text?';
        const result = Validator.validateContentModel(schema, 'paragraph', content);
        expect(result.valid).toBe(false);
        expect(result.errors).toContain("Content for model 'text?' must be 0 or 1 node, but got 2.");
      }
    });

    it('should validate content model with | (or)', () => {
      const content = [
        { stype: 'paragraph', content: [] },
        { stype: 'heading', attrs: { level: 1 }, content: [] }
      ];
      const result = Validator.validateContentModel(schema, 'doc', content);
      expect(result.valid).toBe(true);
    });

    it('should return error for invalid content with | (or)', () => {
      const content = [
        { stype: 'text', content: 'Hello' } // text is not allowed in doc
      ];
      const result = Validator.validateContentModel(schema, 'doc', content);
      expect(result.valid).toBe(false);
    });

    it('should validate specific node type', () => {
      const content = [
        { stype: 'paragraph', content: [] }
      ];
      const result = Validator.validateContentModel(schema, 'doc', content);
      expect(result.valid).toBe(true);
    });

    it('should return error for unknown node type', () => {
      const content = [
        { stype: 'unknown', content: [] }
      ];
      const result = Validator.validateContentModel(schema, 'doc', content);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain("Node at index 0 has unknown type 'unknown'.");
    });
  });

  describe('Validator.validateNode', () => {
    it('should validate valid node', () => {
      const node = {
        stype: 'heading',
        attrs: { level: 1 },
        content: []
      };
      const result = Validator.validateNode(schema, node);
      expect(result.valid).toBe(true);
    });

    it('should reject unknown node type', () => {
      const node = {
        stype: 'unknown',
        attrs: {},
        content: []
      };
      const result = Validator.validateNode(schema, node);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain("Unknown node type: unknown");
    });

    it('should validate node attributes', () => {
      const node = {
        stype: 'heading',
        attrs: { level: 7 }, // invalid level
        content: []
      };
      const result = Validator.validateNode(schema, node);
      expect(result.valid).toBe(false);
    });

    describe('indent-related schema validation', () => {
      it('should report error when indentable block has non-block group', () => {
        const definition: SchemaDefinition = {
          topNode: 'doc',
          nodes: {
            doc: {
              name: 'doc',
              content: 'block+',
              group: 'document'
            },
            inlineIndentable: {
              name: 'inlineIndentable',
              group: 'inline',
              content: 'text*',
              indentable: true
            },
            text: {
              name: 'text',
              group: 'inline'
            }
          }
        };

        const localSchema = createSchema('indent-test', definition);
        const node = {
          stype: 'inlineIndentable',
          attrs: {},
          content: []
        };

        const result = Validator.validateNode(localSchema, node);
        expect(result.valid).toBe(false);
        expect(result.errors.some(err =>
          err.includes("Node type 'inlineIndentable' is indentable but its group is 'inline'")
        )).toBe(true);
      });

      it('should report error when maxIndentLevel is non-positive', () => {
        const definition: SchemaDefinition = {
          topNode: 'doc',
          nodes: {
            doc: {
              name: 'doc',
              content: 'block+',
              group: 'document'
            },
            paragraph: {
              name: 'paragraph',
              group: 'block',
              content: 'inline*',
              indentable: true,
              maxIndentLevel: 0
            },
            text: {
              name: 'text',
              group: 'inline'
            }
          }
        };

        const localSchema = createSchema('indent-test-max', definition);
        const node = {
          stype: 'paragraph',
          attrs: {},
          content: []
        };

        const result = Validator.validateNode(localSchema, node);
        expect(result.valid).toBe(false);
        expect(result.errors.some(err =>
          err.includes("Node type 'paragraph' has invalid maxIndentLevel '0'")
        )).toBe(true);
      });

      it('should report error when indentParentTypes is set but indentable is false', () => {
        const definition: SchemaDefinition = {
          topNode: 'doc',
          nodes: {
            doc: {
              name: 'doc',
              content: 'block+',
              group: 'document'
            },
            paragraph: {
              name: 'paragraph',
              group: 'block',
              content: 'inline*',
              // indentable: false,
              indentParentTypes: ['doc']
            },
            text: {
              name: 'text',
              group: 'inline'
            }
          }
        };

        const localSchema = createSchema('indent-test-parent', definition);
        const node = {
          stype: 'paragraph',
          attrs: {},
          content: []
        };

        const result = Validator.validateNode(localSchema, node);
        expect(result.valid).toBe(false);
        expect(result.errors.some(err =>
          err.includes("Node type 'paragraph' defines indentParentTypes but is not indentable")
        )).toBe(true);
      });

      it('should report error when indentParentTypes contains unknown node types', () => {
        const definition: SchemaDefinition = {
          topNode: 'doc',
          nodes: {
            doc: {
              name: 'doc',
              content: 'block+',
              group: 'document'
            },
            listItem: {
              name: 'listItem',
              group: 'block',
              content: 'inline*',
              indentable: true,
              indentParentTypes: ['bulletList', 'orderedList']
            },
            text: {
              name: 'text',
              group: 'inline'
            }
          }
        };

        const localSchema = createSchema('indent-test-unknown-parent', definition);
        const node = {
          stype: 'listItem',
          attrs: {},
          content: []
        };

        const result = Validator.validateNode(localSchema, node);
        expect(result.valid).toBe(false);
        expect(result.errors.some(err =>
          err.includes("Node type 'listItem' has indentParentTypes entry 'bulletList' which is not defined in the schema.")
        )).toBe(true);
      });
    });
  });

  describe('Validator.validateDocument', () => {
    it('should validate valid document', () => {
      const document = {
        stype: 'doc',
        attrs: { title: 'Test Document' },
        content: [
          {
            stype: 'paragraph',
            attrs: { level: 1 },
            content: []
          }
        ]
      };
      const result = Validator.validateDocument(schema, document);
      expect(result.valid).toBe(true);
    });

    it('should reject document with wrong type', () => {
      const document = {
        stype: 'wrong',
        attrs: {},
        content: []
      };
      const result = Validator.validateDocument(schema, document);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain("Document stype 'wrong' does not match schema topNode 'doc'");
    });

    it('should validate child nodes', () => {
      const document = {
        stype: 'doc',
        attrs: { title: 'Test Document' },
        content: [
          {
            stype: 'unknown', // invalid child node
            attrs: {},
            content: []
          }
        ]
      };
      const result = Validator.validateDocument(schema, document);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain("Child node 0: Unknown node type: unknown");
    });
  });
});
