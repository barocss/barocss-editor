import { describe, it, expect, beforeEach } from 'vitest';
import { SchemaRegistry, registerSchema, getSchema, getAllSchemas, getNodeTypesByGroup, getNodeTypesByGroupInSchema, removeSchema, hasSchema, clearSchemas } from '../src/registry.js';
import { createSchema } from '../src/schema.js';
import type { SchemaDefinition } from '../src/types';

describe('SchemaRegistry', () => {
  let registry: SchemaRegistry;

  beforeEach(() => {
    registry = new SchemaRegistry();
  });

  describe('register', () => {
    it('should register a schema', () => {
      const testSchemaDefinition: SchemaDefinition = {
        topNode: 'doc',
        nodes: {
          doc: {
            name: 'doc',
            content: 'block+',
            group: 'document',
            attrs: {
              title: { type: 'string', required: true }
            }
          },
          paragraph: {
            name: 'paragraph',
            content: 'inline*',
            group: 'block'
          }
        }
      };
      
      const testSchema = createSchema('test', testSchemaDefinition);
      registry.register(testSchema);
      
      expect(registry.has('test')).toBe(true);
      expect(registry.get('test')).toBe(testSchema);
    });

    it('should warn when overwriting existing schema', () => {
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      
      const schema1Definition: SchemaDefinition = {
        topNode: 'doc',
        nodes: {
          doc: { name: 'doc', group: 'document', attrs: { title: { type: 'string', required: true } } }
        }
      };
      const schema2Definition: SchemaDefinition = {
        topNode: 'doc',
        nodes: {
          doc: { name: 'doc', group: 'document', attrs: { count: { type: 'number', required: true } } }
        }
      };
      
      const schema1 = createSchema('test', schema1Definition);
      const schema2 = createSchema('test', schema2Definition);
      
      registry.register(schema1);
      registry.register(schema2);
      
      expect(consoleSpy).toHaveBeenCalledWith("Schema 'test' is already registered. Overwriting.");
      consoleSpy.mockRestore();
    });

    it('should register node types by group', () => {
      const testSchemaDefinition: SchemaDefinition = {
        topNode: 'doc',
        nodes: {
          doc: { name: 'doc', group: 'document' },
          paragraph: { name: 'paragraph', group: 'block' },
          heading: { name: 'heading', group: 'block' },
          text: { name: 'text', group: 'inline' }
        }
      };
      
      const testSchema = createSchema('test', testSchemaDefinition);
      registry.register(testSchema);
      
      const blockNodes = registry.getNodeTypesByGroup('block');
      expect(blockNodes).toContain('paragraph');
      expect(blockNodes).toContain('heading');
      
      const inlineNodes = registry.getNodeTypesByGroup('inline');
      expect(inlineNodes).toContain('text');
    });
  });

  describe('get', () => {
    it('should return registered schema', () => {
      const testSchemaDefinition: SchemaDefinition = {
        topNode: 'doc',
        nodes: {
          doc: { name: 'doc', group: 'document', attrs: { title: { type: 'string', required: true } } }
        }
      };
      
      const testSchema = createSchema('test', testSchemaDefinition);
      registry.register(testSchema);
      
      expect(registry.get('test')).toBe(testSchema);
      expect(registry.get('nonexistent')).toBeUndefined();
    });
  });

  describe('getAll', () => {
    it('should return all registered schemas', () => {
      const schema1Definition: SchemaDefinition = {
        topNode: 'doc',
        nodes: { doc: { name: 'doc', group: 'document' } }
      };
      const schema2Definition: SchemaDefinition = {
        topNode: 'doc',
        nodes: { doc: { name: 'doc', group: 'document' } }
      };
      
      const schema1 = createSchema('test1', schema1Definition);
      const schema2 = createSchema('test2', schema2Definition);
      
      registry.register(schema1);
      registry.register(schema2);
      
      const allSchemas = registry.getAll();
      expect(allSchemas).toHaveLength(2);
      expect(allSchemas).toContain(schema1);
      expect(allSchemas).toContain(schema2);
    });
  });

  describe('has', () => {
    it('should return true for registered schema', () => {
      const testSchemaDefinition: SchemaDefinition = {
        topNode: 'doc',
        nodes: { doc: { name: 'doc', group: 'document' } }
      };
      
      const testSchema = createSchema('test', testSchemaDefinition);
      registry.register(testSchema);
      
      expect(registry.has('test')).toBe(true);
      expect(registry.has('nonexistent')).toBe(false);
    });
  });

  describe('remove', () => {
    it('should remove registered schema', () => {
      const testSchemaDefinition: SchemaDefinition = {
        topNode: 'doc',
        nodes: { doc: { name: 'doc', group: 'document' } }
      };
      
      const testSchema = createSchema('test', testSchemaDefinition);
      registry.register(testSchema);
      
      expect(registry.has('test')).toBe(true);
      
      const removed = registry.remove('test');
      expect(removed).toBe(true);
      expect(registry.has('test')).toBe(false);
    });

    it('should remove schema from group when removing', () => {
      const testSchemaDefinition: SchemaDefinition = {
        topNode: 'doc',
        nodes: {
          doc: { name: 'doc', group: 'document' },
          paragraph: { name: 'paragraph', group: 'block' }
        }
      };
      
      const testSchema = createSchema('test', testSchemaDefinition);
      registry.register(testSchema);
      
      expect(registry.getNodeTypesByGroup('block')).toContain('paragraph');
      
      registry.remove('test');
      
      expect(registry.getNodeTypesByGroup('block')).not.toContain('paragraph');
    });
  });

  describe('getNodeTypesByGroup', () => {
    it('should return node types in specific group', () => {
      const testSchemaDefinition: SchemaDefinition = {
        topNode: 'doc',
        nodes: {
          doc: { name: 'doc', group: 'document' },
          paragraph: { name: 'paragraph', group: 'block' },
          heading: { name: 'heading', group: 'block' },
          text: { name: 'text', group: 'inline' }
        }
      };
      
      const testSchema = createSchema('test', testSchemaDefinition);
      registry.register(testSchema);
      
      const blockNodes = registry.getNodeTypesByGroup('block');
      expect(blockNodes).toContain('paragraph');
      expect(blockNodes).toContain('heading');
      expect(blockNodes).not.toContain('text');
    });

    it('should return empty array for non-existent group', () => {
      const nodes = registry.getNodeTypesByGroup('nonExistent');
      expect(nodes).toHaveLength(0);
    });
  });

  describe('getNodeTypesByGroupInSchema', () => {
    it('should return node types by group in specific schema', () => {
      const testSchemaDefinition: SchemaDefinition = {
        topNode: 'doc',
        nodes: {
          doc: { name: 'doc', group: 'document' },
          paragraph: { name: 'paragraph', group: 'block' },
          text: { name: 'text', group: 'inline' }
        }
      };
      
      const testSchema = createSchema('test', testSchemaDefinition);
      registry.register(testSchema);
      
      const blockNodes = registry.getNodeTypesByGroupInSchema('test', 'block');
      expect(blockNodes).toContain('paragraph');
      expect(blockNodes).not.toContain('text');
    });

    it('should return empty array for non-existent schema', () => {
      const nodes = registry.getNodeTypesByGroupInSchema('nonexistent', 'block');
      expect(nodes).toHaveLength(0);
    });
  });

  describe('clear', () => {
    it('should clear all schemas and groups', () => {
      const testSchemaDefinition: SchemaDefinition = {
        topNode: 'doc',
        nodes: {
          doc: { name: 'doc', group: 'document' },
          paragraph: { name: 'paragraph', group: 'block' }
        }
      };
      
      const testSchema = createSchema('test', testSchemaDefinition);
      registry.register(testSchema);
      
      expect(registry.getAll()).toHaveLength(1);
      expect(registry.getNodeTypesByGroup('block')).toContain('paragraph');
      
      registry.clear();
      
      expect(registry.getAll()).toHaveLength(0);
      expect(registry.getNodeTypesByGroup('block')).toHaveLength(0);
    });
  });
});

describe('Global registry functions', () => {
  beforeEach(() => {
    clearSchemas();
  });

  describe('registerSchema', () => {
    it('should register schema in global registry', () => {
      const testSchemaDefinition: SchemaDefinition = {
        topNode: 'doc',
        nodes: { doc: { name: 'doc', group: 'document' } }
      };
      
      const testSchema = createSchema('test', testSchemaDefinition);
      registerSchema(testSchema);
      
      expect(hasSchema('test')).toBe(true);
      expect(getSchema('test')).toBe(testSchema);
    });
  });

  describe('getSchema', () => {
    it('should get schema from global registry', () => {
      const testSchemaDefinition: SchemaDefinition = {
        topNode: 'doc',
        nodes: { doc: { name: 'doc', group: 'document' } }
      };
      
      const testSchema = createSchema('test', testSchemaDefinition);
      registerSchema(testSchema);
      
      expect(getSchema('test')).toBe(testSchema);
      expect(getSchema('nonexistent')).toBeUndefined();
    });
  });

  describe('getAllSchemas', () => {
    it('should get all schemas from global registry', () => {
      const schema1Definition: SchemaDefinition = {
        topNode: 'doc',
        nodes: { doc: { name: 'doc', group: 'document' } }
      };
      const schema2Definition: SchemaDefinition = {
        topNode: 'doc',
        nodes: { doc: { name: 'doc', group: 'document' } }
      };
      
      const schema1 = createSchema('test1', schema1Definition);
      const schema2 = createSchema('test2', schema2Definition);
      
      registerSchema(schema1);
      registerSchema(schema2);
      
      const allSchemas = getAllSchemas();
      expect(allSchemas).toHaveLength(2);
      expect(allSchemas).toContain(schema1);
      expect(allSchemas).toContain(schema2);
    });
  });

  describe('getNodeTypesByGroup', () => {
    it('should get node types by group from global registry', () => {
      const testSchemaDefinition: SchemaDefinition = {
        topNode: 'doc',
        nodes: {
          doc: { name: 'doc', group: 'document' },
          paragraph: { name: 'paragraph', group: 'block' },
          text: { name: 'text', group: 'inline' }
        }
      };
      
      const testSchema = createSchema('test', testSchemaDefinition);
      registerSchema(testSchema);
      
      const blockNodes = getNodeTypesByGroup('block');
      expect(blockNodes).toContain('paragraph');
      expect(blockNodes).not.toContain('text');
    });
  });

  describe('removeSchema', () => {
    it('should remove schema from global registry', () => {
      const testSchemaDefinition: SchemaDefinition = {
        topNode: 'doc',
        nodes: { doc: { name: 'doc', group: 'document' } }
      };
      
      const testSchema = createSchema('test', testSchemaDefinition);
      registerSchema(testSchema);
      
      expect(hasSchema('test')).toBe(true);
      
      const removed = removeSchema('test');
      expect(removed).toBe(true);
      expect(hasSchema('test')).toBe(false);
    });
  });

  describe('hasSchema', () => {
    it('should check if schema exists in global registry', () => {
      const testSchemaDefinition: SchemaDefinition = {
        topNode: 'doc',
        nodes: { doc: { name: 'doc', group: 'document' } }
      };
      
      const testSchema = createSchema('test', testSchemaDefinition);
      registerSchema(testSchema);
      
      expect(hasSchema('test')).toBe(true);
      expect(hasSchema('nonexistent')).toBe(false);
    });
  });

  describe('clearSchemas', () => {
    it('should clear all schemas from global registry', () => {
      const testSchemaDefinition: SchemaDefinition = {
        topNode: 'doc',
        nodes: { doc: { name: 'doc', group: 'document' } }
      };
      
      const testSchema = createSchema('test', testSchemaDefinition);
      registerSchema(testSchema);
      
      expect(getAllSchemas()).toHaveLength(1);
      
      clearSchemas();
      
      expect(getAllSchemas()).toHaveLength(0);
    });
  });
});