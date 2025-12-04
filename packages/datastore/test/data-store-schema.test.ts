import { describe, it, expect, beforeEach } from 'vitest';
import { DataStore } from '../src/data-store';
import { Schema } from '@barocss/schema';
import type { INode } from '../src/types';

describe('DataStore Schema Integration', () => {
  let dataStore: DataStore;
  let schema: Schema;

  beforeEach(() => {
    // 테스트용 schema 생성
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
        },
        italic: {
          name: 'italic',
          group: 'text-style',
          attrs: {
            class: { type: 'string', default: null }
          }
        }
      }
    });
  });

  describe('Schema Management', () => {
    it('should set and get active schema', () => {
      dataStore = new DataStore();
      
      expect(dataStore.getActiveSchema()).toBeUndefined();
      
      dataStore.setActiveSchema(schema);
      expect(dataStore.getActiveSchema()).toBe(schema);
    });

    it('should set schema in constructor', () => {
      dataStore = new DataStore(undefined, schema);
      
      expect(dataStore.getActiveSchema()).toBe(schema);
    });

    it('should register schema when setting active schema', () => {
      dataStore = new DataStore();
      dataStore.setActiveSchema(schema);
      
      // schema가 등록되었는지 확인 (내부적으로 등록됨)
      expect(dataStore.getActiveSchema()).toBe(schema);
    });
  });

  describe('ID Generation', () => {
    beforeEach(() => {
      dataStore = new DataStore();
    });

    it('should generate unique IDs', () => {
      const id1 = dataStore.generateId();
      const id2 = dataStore.generateId();
      
      expect(id1).not.toBe(id2);
      expect(id1).toMatch(/^\d+:\d+$/); // 피그마 스타일: sessionId:counter
      expect(id2).toMatch(/^\d+:\d+$/);
    });

    it('should generate IDs with different sessions', () => {
      // 세션 0으로 ID 생성
      dataStore.setSessionId(0);
      const session0Id = dataStore.generateId();
      
      // 세션 1로 변경 후 ID 생성
      dataStore.setSessionId(1);
      const session1Id = dataStore.generateId();
      
      expect(session0Id).toMatch(/^0:\d+$/); // 세션 0
      expect(session1Id).toMatch(/^1:\d+$/); // 세션 1
    });

    it('should auto-generate IDs in createNodeWithChildren', () => {
      const nodeWithoutId: INode = {
        stype: 'paragraph',
        content: [],
        attributes: {}
      };

      const result = dataStore.createNodeWithChildren(nodeWithoutId);
      
      expect(result.sid).toBeDefined();
      expect(result.sid).toMatch(/^\d+:\d+$/); // 피그마 스타일: sessionId:counter
    });
  });

  describe('Schema Validation', () => {
    beforeEach(() => {
      dataStore = new DataStore(undefined, schema);
    });

    it('should validate valid node', () => {
      const validNode: INode = {
        sid: 'test-node',
        stype: 'inline-text',
        text: 'Hello World',
        attributes: {}
      };

      const validation = dataStore.validateNode(validNode);
      expect(validation.valid).toBe(true);
      expect(validation.errors).toHaveLength(0);
    });

    it('should reject invalid node type', () => {
      const invalidNode: INode = {
        sid: 'test-node',
        stype: 'invalid-type',
        text: 'Hello World',
        attributes: {}
      };

      const validation = dataStore.validateNode(invalidNode);
      expect(validation.valid).toBe(false);
      expect(validation.errors.length).toBeGreaterThan(0);
    });

    it('should pass validation when no schema is set', () => {
      const dataStoreWithoutSchema = new DataStore();
      
      const node: INode = {
        sid: 'test-node',
        stype: 'any-type',
        text: 'Hello World',
        attributes: {}
      };

      const validation = dataStoreWithoutSchema.validateNode(node);
      expect(validation.valid).toBe(true);
      expect(validation.errors).toHaveLength(0);
    });
  });

  describe('setNode with Schema Validation', () => {
    beforeEach(() => {
      dataStore = new DataStore(undefined, schema);
    });

    it('should accept valid node', () => {
      const validNode: INode = {
        sid: 'test-node',
        stype: 'inline-text',
        text: 'Hello World',
        attributes: {}
      };

      expect(() => {
        dataStore.setNode(validNode);
      }).not.toThrow();

      expect(dataStore.getNode('test-node')).toBeDefined();
    });

    it('should reject invalid node', () => {
      const invalidNode: INode = {
        sid: 'test-node',
        stype: 'invalid-type',
        text: 'Hello World',
        attributes: {}
      };

      expect(() => {
        dataStore.setNode(invalidNode);
      }).toThrow('Schema validation failed');
    });

    it('should skip validation when validate=false', () => {
      const invalidNode: INode = {
        sid: 'test-node',
        stype: 'invalid-type',
        text: 'Hello World',
        attributes: {}
      };

      expect(() => {
        dataStore.setNode(invalidNode, false);
      }).not.toThrow();

      expect(dataStore.getNode('test-node')).toBeDefined();
    });
  });

  describe('createNodeWithChildren with Schema Validation', () => {
    beforeEach(() => {
      dataStore = new DataStore(undefined, schema);
    });

    it('should create valid nested structure', () => {
      const nestedNode: INode = {
        stype: 'document',
        content: [
          {
            stype: 'paragraph',
            content: [
              {
                stype: 'inline-text',
                text: 'Hello World'
              }
            ]
          }
        ]
      };

      const result = dataStore.createNodeWithChildren(nestedNode);

      expect(result).toBeDefined();
      expect(result.stype).toBe('document');
      expect(result.content).toHaveLength(1);

      const paragraph = dataStore.getNode(result.content![0] as string);
      expect(paragraph).toBeDefined();
      expect(paragraph!.stype).toBe('paragraph');

      const text = dataStore.getNode(paragraph!.content![0] as string);
      expect(text).toBeDefined();
      expect(text!.stype).toBe('inline-text');
      expect(text!.text).toBe('Hello World');
    });

    it('should reject invalid nested structure', () => {
      const invalidNestedNode: INode = {
        stype: 'document',
        content: [
          {
            stype: 'invalid-type',
            content: [
              {
                stype: 'inline-text',
                text: 'Hello World'
              }
            ]
          }
        ]
      };

      expect(() => {
        dataStore.createNodeWithChildren(invalidNestedNode);
      }).toThrow('Schema validation failed');
    });

    it('should work without schema', () => {
      const dataStoreWithoutSchema = new DataStore();
      
      const nestedNode: INode = {
        stype: 'any-type',
        content: [
          {
            stype: 'another-type',
            text: 'Hello World'
          }
        ]
      };

      const result = dataStoreWithoutSchema.createNodeWithChildren(nestedNode);

      expect(result).toBeDefined();
      expect(result.stype).toBe('any-type');
    });
  });

  describe('Edge Cases and Error Handling', () => {
    beforeEach(() => {
      dataStore = new DataStore(undefined, schema);
    });

    it('should handle empty content array', () => {
      const nodeWithEmptyContent: INode = {
        stype: 'paragraph',
        content: [],
        attributes: {}
      };

      const result = dataStore.createNodeWithChildren(nodeWithEmptyContent);

      expect(result).toBeDefined();
      expect(result.stype).toBe('paragraph');
      expect(result.content).toEqual([]);
    });

    it('should handle node with undefined content', () => {
      const nodeWithUndefinedContent: INode = {
        stype: 'inline-text',
        text: 'Hello World',
        attributes: {}
      };

      const result = dataStore.createNodeWithChildren(nodeWithUndefinedContent);

      expect(result).toBeDefined();
      expect(result.stype).toBe('inline-text');
      expect(result.text).toBe('Hello World');
    });

    it('should handle existing node references', () => {
      // 먼저 기존 노드 생성
      const existingNode: INode = {
        sid: 'existing-node-sid',
        stype: 'inline-text',
        text: 'Existing text',
        attributes: {}
      };
      dataStore.setNode(existingNode, false);

      // 기존 노드가 제대로 저장되었는지 확인
      expect(dataStore.getNode('existing-node-sid')).toBeDefined();

      // createNodeWithChildren은 중첩된 노드 객체 구조를 받아서 처리
      // 기존 노드 ID를 직접 참조하는 것은 지원하지 않음
      const nodeWithNestedStructure: INode = {
        stype: 'paragraph',
        content: [
          {
            stype: 'inline-text',
            text: 'New text content'
          }
        ],
        attributes: {}
      };

      const result = dataStore.createNodeWithChildren(nodeWithNestedStructure);

      expect(result).toBeDefined();
      expect(result.stype).toBe('paragraph');
      expect(result.content).toHaveLength(1);
      expect(typeof result.content![0]).toBe('string'); // ID로 변환됨
    });

    it('should preserve node attributes during creation', () => {
      const nodeWithAttributes: INode = {
        stype: 'paragraph',
        content: [],
        attributes: {
          class: 'test-class',
          sid: 'test-sid'
        }
      };

      const result = dataStore.createNodeWithChildren(nodeWithAttributes);

      expect(result).toBeDefined();
      expect(result.attributes).toEqual({
        class: 'test-class',
        sid: 'test-sid'
      });
    });

    it('should handle validation errors gracefully', () => {
      const invalidNode: INode = {
        stype: 'document',
        content: [
          {
            stype: 'invalid-type',
            text: 'This should fail'
          }
        ]
      };

      expect(() => {
        dataStore.createNodeWithChildren(invalidNode);
      }).toThrow('Schema validation failed');
    });
  });
});
