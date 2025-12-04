import { describe, it, expect, beforeEach } from 'vitest';
import { EditorSchemaManager, createNamespacedSchema } from '../src/editor-manager.js';
import type { SchemaDefinition } from '../src/types';

describe('EditorSchemaManager', () => {
  let manager: EditorSchemaManager;

  beforeEach(() => {
    manager = new EditorSchemaManager();
  });

  describe('createEditor', () => {
    it('should create a new editor with unique ID', () => {
      const editor1 = manager.createEditor('editor1');
      const editor2 = manager.createEditor('editor2');
      
      expect(editor1).toBeDefined();
      expect(editor2).toBeDefined();
      expect(editor1).not.toBe(editor2);
    });

    it('should throw error for duplicate editor ID', () => {
      manager.createEditor('editor1');
      
      expect(() => {
        manager.createEditor('editor1');
      }).toThrow("Editor with ID 'editor1' already exists");
    });
  });

  describe('getEditor', () => {
    it('should return existing editor', () => {
      const editor = manager.createEditor('editor1');
      const retrieved = manager.getEditor('editor1');
      
      expect(retrieved).toBe(editor);
    });

    it('should return undefined for non-existent editor', () => {
      const retrieved = manager.getEditor('nonexistent');
      expect(retrieved).toBeUndefined();
    });
  });

  describe('removeEditor', () => {
    it('should remove existing editor', () => {
      manager.createEditor('editor1');
      
      const removed = manager.removeEditor('editor1');
      expect(removed).toBe(true);
      expect(manager.getEditor('editor1')).toBeUndefined();
    });

    it('should return false for non-existent editor', () => {
      const removed = manager.removeEditor('nonexistent');
      expect(removed).toBe(false);
    });
  });

  describe('getAllEditorIds', () => {
    it('should return all editor IDs', () => {
      const editor1 = manager.createEditor('editor1');
      const editor2 = manager.createEditor('editor2');
      
      const allIds = manager.getAllEditorIds();
      expect(allIds).toHaveLength(2);
      expect(allIds).toContain('editor1');
      expect(allIds).toContain('editor2');
    });
  });
});

describe('createNamespacedSchema', () => {
  it('should create schema with namespaced name', () => {
    const definition: SchemaDefinition = {
      topNode: 'doc',
      nodes: {
        doc: { name: 'doc', group: 'document' },
        paragraph: { name: 'paragraph', group: 'block' }
      }
    };
    
    const schema = createNamespacedSchema('test', 'article', definition);
    expect(schema.name).toBe('test:article');
  });

  it('should create namespaced schema from unified schema definition', () => {
    const unifiedDef: SchemaDefinition = {
      topNode: 'doc',
      nodes: {
        doc: { name: 'doc', group: 'document' },
        paragraph: {
          name: 'paragraph',
          group: 'block',
          content: 'inline*',
          attrs: {
            level: { type: 'number', default: 1 }
          }
        }
      }
    };
    
    const schema = createNamespacedSchema('test', 'article', unifiedDef);
    expect(schema.name).toBe('test:article');
    expect(schema.hasNodeType('paragraph')).toBe(true);
  });
});
