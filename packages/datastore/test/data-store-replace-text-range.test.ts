import { describe, it, expect, beforeEach } from 'vitest';
import { DataStore } from '../src/data-store';
import { Schema } from '@barocss/schema';
import { INode } from '../src/types';

describe('DataStore replaceText (ContentRange)', () => {
  let dataStore: DataStore;
  let schema: Schema;

  beforeEach(() => {
    // 테스트용 스키마 생성 (apps/editor-test/src/main.ts 스타일에 맞춤)
    schema = new Schema('test-schema', {
      nodes: {
        document: { name: 'document', group: 'document', content: 'block+' },
        paragraph: { name: 'paragraph', group: 'block', content: 'inline*', attrs: { class: { type: 'string', default: null } } },
        'inline-text': { name: 'inline-text', group: 'inline', attrs: { class: { type: 'string', default: null } } }
      },
      marks: {
        bold: { name: 'bold', group: 'text-style', attrs: { weight: { type: 'string', default: 'bold' } } },
        italic: { name: 'italic', group: 'text-style', attrs: { style: { type: 'string', default: 'italic' } } }
      }
    });

    dataStore = new DataStore(undefined, schema);
  });

  describe('기본 텍스트 교체', () => {
    it('should replace text in the middle of a text node', () => {
      // 텍스트 노드 생성
      const textNode = {
        sid: 'text-1',
        stype: 'inline-text',
        text: 'Hello World',
        parentId: 'para-1'
      };
      dataStore.setNode(textNode);

      // 텍스트 교체
      const replacedText = dataStore.replaceText({ stype: 'range' as const, startNodeId: 'text-1', startOffset: 6, endNodeId: 'text-1', endOffset: 11 }, 'Universe');
      
      expect(replacedText).toBe('World');
      
      const updatedNode = dataStore.getNode('text-1');
      expect(updatedNode!.text).toBe('Hello Universe');
    });

    it('should replace text at the beginning of a text node', () => {
      const textNode = {
        sid: 'text-1',
        stype: 'inline-text',
        text: 'Hello World',
        parentId: 'para-1'
      };
      dataStore.setNode(textNode);

      const replacedText = dataStore.replaceText({ stype: 'range' as const, startNodeId: 'text-1', startOffset: 0, endNodeId: 'text-1', endOffset: 5 }, 'Hi');
      
      expect(replacedText).toBe('Hello');
      
      const updatedNode = dataStore.getNode('text-1');
      expect(updatedNode!.text).toBe('Hi World');
    });

    it('should replace text at the end of a text node', () => {
      const textNode = {
        sid: 'text-1',
        stype: 'inline-text',
        text: 'Hello World',
        parentId: 'para-1'
      };
      dataStore.setNode(textNode);

      const replacedText = dataStore.replaceText({ stype: 'range' as const, startNodeId: 'text-1', startOffset: 6, endNodeId: 'text-1', endOffset: 11 }, 'Universe');
      
      expect(replacedText).toBe('World');
      
      const updatedNode = dataStore.getNode('text-1');
      expect(updatedNode!.text).toBe('Hello Universe');
    });

    it('should replace entire text', () => {
      const textNode = {
        sid: 'text-1',
        stype: 'inline-text',
        text: 'Hello World',
        parentId: 'para-1'
      };
      dataStore.setNode(textNode);

      const replacedText = dataStore.replaceText({ stype: 'range' as const, startNodeId: 'text-1', startOffset: 0, endNodeId: 'text-1', endOffset: 11 }, 'New Text');
      
      expect(replacedText).toBe('Hello World');
      
      const updatedNode = dataStore.getNode('text-1');
      expect(updatedNode!.text).toBe('New Text');
    });

    it('should replace with empty string (delete)', () => {
      const textNode = {
        sid: 'text-1',
        stype: 'inline-text',
        text: 'Hello World',
        parentId: 'para-1'
      };
      dataStore.setNode(textNode);

      const replacedText = dataStore.replaceText({ stype: 'range' as const, startNodeId: 'text-1', startOffset: 5, endNodeId: 'text-1', endOffset: 11 }, '');
      
      expect(replacedText).toBe(' World');
      
      const updatedNode = dataStore.getNode('text-1');
      expect(updatedNode!.text).toBe('Hello');
    });

    it('should replace with longer text', () => {
      const textNode = {
        sid: 'text-1',
        stype: 'inline-text',
        text: 'Hi',
        parentId: 'para-1'
      };
      dataStore.setNode(textNode as INode);

      const replacedText = dataStore.replaceText({ stype: 'range' as const, startNodeId: 'text-1', startOffset: 0, endNodeId: 'text-1', endOffset: 2 }, 'Hello World');
      
      expect(replacedText).toBe('Hi');
      
      const updatedNode = dataStore.getNode('text-1');
      expect(updatedNode!.text).toBe('Hello World');
    });
  });

  describe('마크가 있는 텍스트 교체', () => {
    it('should handle marks when replacing text', () => {
      const textNode = {
        sid: 'text-1',
        stype: 'inline-text',
        text: 'Hello World',
        marks: [
          { stype: 'bold', range: [0, 5] },    // "Hello"
          { stype: 'italic', range: [6, 11] }  // "World"
        ],
        parentId: 'para-1'
      };
      dataStore.setNode(textNode as INode);

      // "World"를 "Universe"로 교체
      const replacedText = dataStore.replaceText({ stype: 'range' as const, startNodeId: 'text-1', startOffset: 6, endNodeId: 'text-1', endOffset: 11 }, 'Universe');
      
      expect(replacedText).toBe('World');
      
      const updatedNode = dataStore.getNode('text-1');
      expect(updatedNode!.text).toBe('Hello Universe');
      expect(updatedNode!.marks).toHaveLength(1); // "Hello"의 bold 마크만 남음
      expect(updatedNode!.marks![0]).toEqual({ stype: 'bold', range: [0, 5] });
    });

    it('should handle marks that span across replacement range', () => {
      const textNode = {
        sid: 'text-1',
        stype: 'inline-text',
        text: 'Hello Beautiful World',
        marks: [
          { stype: 'bold', range: [0, 20] }  // 전체 텍스트
        ],
        parentId: 'para-1'
      };
      dataStore.setNode(textNode as INode);

      // "Beautiful"을 "Amazing"으로 교체
      const replacedText = dataStore.replaceText({ stype: 'range' as const, startNodeId: 'text-1', startOffset: 6, endNodeId: 'text-1', endOffset: 15 }, 'Amazing');
      
      expect(replacedText).toBe('Beautiful');
      
      const updatedNode = dataStore.getNode('text-1');
      expect(updatedNode!.text).toBe('Hello Amazing World');
      expect(updatedNode!.marks).toHaveLength(2); // 분할된 마크
      expect(updatedNode!.marks![0]).toEqual({ stype: 'bold', range: [0, 6] });
      expect(updatedNode!.marks![1]).toEqual({ stype: 'bold', range: [13, 18] });
    });

    it('should handle marks that are completely within replacement range', () => {
      const textNode = {
        sid: 'text-1',
        stype: 'inline-text',
        text: 'Hello Beautiful World',
        marks: [
          { stype: 'bold', range: [6, 15] },    // "Beautiful"
          { stype: 'italic', range: [0, 5] }    // "Hello"
        ],
        parentId: 'para-1'
      };
      dataStore.setNode(textNode as INode);

      // "Beautiful"을 "Amazing"으로 교체
      const replacedText = dataStore.replaceText({ stype: 'range' as const, startNodeId: 'text-1', startOffset: 6, endNodeId: 'text-1', endOffset: 15 }, 'Amazing');
      
      expect(replacedText).toBe('Beautiful');
      
      const updatedNode = dataStore.getNode('text-1');
      expect(updatedNode!.text).toBe('Hello Amazing World');
      expect(updatedNode!.marks).toHaveLength(1); // "Hello"의 italic 마크만 남음
      expect(updatedNode!.marks![0]).toEqual({ stype: 'italic', range: [0, 5] });
    });

    it('should adjust marks after replacement range', () => {
      const textNode = {
        sid: 'text-1',
        stype: 'inline-text',
        text: 'Hello Beautiful World',
        marks: [
          { stype: 'bold', range: [16, 21] }  // "World"
        ],
        parentId: 'para-1'
      };
      dataStore.setNode(textNode as INode);

      // "Beautiful"을 "Amazing"으로 교체 (길이가 다름)
      const replacedText = dataStore.replaceText({ stype: 'range' as const, startNodeId: 'text-1', startOffset: 6, endNodeId: 'text-1', endOffset: 15 }, 'Amazing');
      
      expect(replacedText).toBe('Beautiful');
      
      const updatedNode = dataStore.getNode('text-1');
      expect(updatedNode!.text).toBe('Hello Amazing World');
      expect(updatedNode!.marks).toHaveLength(1);
      // "World"의 마크 범위가 조정됨 (길이 차이만큼)
      expect(updatedNode!.marks![0]).toEqual({ stype: 'bold', range: [14, 19] });
    });
  });

  describe('경계 및 에러 처리(범위 API에서는 예외 미발생)', () => {
    it('should return empty string for non-existent node', () => {
      const replacedText = dataStore.replaceText({ stype: 'range' as const, startNodeId: 'non-existent', startOffset: 0, endNodeId: 'non-existent', endOffset: 5 }, 'New text');
      expect(replacedText).toBe('');
    });

    it('should ignore replacement for non-text node and return empty string', () => {
      const paragraphNode = {
        sid: 'para-1',
        stype: 'paragraph',
        content: [],
        parentId: 'doc-1'
      };
      dataStore.setNode(paragraphNode as INode);

      const replacedText = dataStore.replaceText({ stype: 'range' as const, startNodeId: 'para-1', startOffset: 0, endNodeId: 'para-1', endOffset: 5 }, 'New text');
      expect(replacedText).toBe('');
      const updated = dataStore.getNode('para-1');
      expect(updated!.stype).toBe('paragraph');
    });

    it('should return empty string for invalid range (start > end / out of bounds)', () => {
      const textNode = {
        sid: 'text-1',
        stype: 'inline-text',
        text: 'Hello',
        parentId: 'para-1'
      };
      dataStore.setNode(textNode as INode);

      const r1 = dataStore.replaceText({ stype: 'range' as const, startNodeId: 'text-1', startOffset: 3, endNodeId: 'text-1', endOffset: 2 }, 'New text');
      expect(r1).toBe('');
      const r2 = dataStore.replaceText({ stype: 'range' as const, startNodeId: 'text-1', startOffset: -1 as any, endNodeId: 'text-1', endOffset: 3 }, 'New text');
      expect(r2).toBe('');
      const r3 = dataStore.replaceText({ stype: 'range' as const, startNodeId: 'text-1', startOffset: 0, endNodeId: 'text-1', endOffset: 10 }, 'New text');
      expect(r3).toBe('');
    });
  });

  describe('경계 케이스', () => {
    it('should handle replacement at position 0', () => {
      const textNode = {
        sid: 'text-1',
        stype: 'inline-text',
        text: 'Hello',
        parentId: 'para-1'
      };
      dataStore.setNode(textNode as INode);

      const replacedText = dataStore.replaceText({ stype: 'range' as const, startNodeId: 'text-1', startOffset: 0, endNodeId: 'text-1', endOffset: 0 }, 'Hi ');
      
      expect(replacedText).toBe('');
      
      const updatedNode = dataStore.getNode('text-1');
      expect(updatedNode!.text).toBe('Hi Hello');
    });

    it('should handle replacement at end position', () => {
      const textNode = {
        sid: 'text-1',
        stype: 'inline-text',
        text: 'Hello',
        parentId: 'para-1'
      };
      dataStore.setNode(textNode);

      const replacedText = dataStore.replaceText({ stype: 'range' as const, startNodeId: 'text-1', startOffset: 5, endNodeId: 'text-1', endOffset: 5 }, ' World');
      
      expect(replacedText).toBe('');
      
      const updatedNode = dataStore.getNode('text-1');
      expect(updatedNode!.text).toBe('Hello World');
    });

    it('should handle empty text node', () => {
      const textNode = {
        sid: 'text-1',
        stype: 'inline-text',
        text: '',
        parentId: 'para-1'
      };
      dataStore.setNode(textNode);

      const replacedText = dataStore.replaceText({ stype: 'range' as const, startNodeId: 'text-1', startOffset: 0, endNodeId: 'text-1', endOffset: 0 }, 'Hello');
      
      expect(replacedText).toBe('');
      
      const updatedNode = dataStore.getNode('text-1');
      expect(updatedNode!.text).toBe('Hello');
    });
  });
});
