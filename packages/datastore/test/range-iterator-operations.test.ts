import { describe, it, expect, beforeEach } from 'vitest';
import { DataStore } from '../src/data-store';
import type { ModelSelection } from '@barocss/editor-core';
import { Schema } from '@barocss/schema';

describe('Range Iterator Operations', () => {
  let dataStore: DataStore;
  let schema: Schema;

  beforeEach(() => {
    schema = new Schema('test-schema', {
      nodes: {
        'document': {
          name: 'document',
          content: 'block+'
        },
        'paragraph': {
          name: 'paragraph',
          content: 'inline*',
          group: 'block'
        },
        'inline-text': {
          name: 'inline-text',
          group: 'inline'
        }
      }
    });

    dataStore = new DataStore(undefined, schema);
  });

  describe('deleteText (ModelSelection based)', () => {
    beforeEach(() => {
      // Create simple document structure
      dataStore.createNodeWithChildren({
        stype: 'document',
        content: [
          {
            stype: 'paragraph',
            content: [
              { stype: 'inline-text', text: 'Hello World' }
            ]
          }
        ]
      });
    });

    it('단일 노드 내에서 텍스트 범위 삭제', () => {
      const allNodes = dataStore.getAllNodes();
      const textNode = allNodes.find(n => n.stype === 'inline-text');
      
      expect(textNode).toBeTruthy();
      expect(textNode!.text).toBe('Hello World');

      // Delete "llo Wo" (from 2nd to 7th position)
      const contentRange: ModelSelection = {
        startNodeId: textNode!.sid!,
        startOffset: 2,
        endNodeId: textNode!.sid!,
        endOffset: 7
      };

      const deletedText = dataStore.deleteText(contentRange);
      
      expect(deletedText).toBe('llo W');
      
      // Verify node update
      const updatedNode = dataStore.getNode(textNode!.sid!);
      expect(updatedNode!.text).toBe('Heorld');
    });

    it('delete entire text', () => {
      const allNodes = dataStore.getAllNodes();
      const textNode = allNodes.find(n => n.stype === 'inline-text');
      
      expect(textNode).toBeTruthy();

      // Delete entire text
      const contentRange: ModelSelection = {
        startNodeId: textNode!.sid!,
        startOffset: 0,
        endNodeId: textNode!.sid!,
        endOffset: textNode!.text!.length
      };

      const deletedText = dataStore.deleteText(contentRange);
      
      expect(deletedText).toBe('Hello World');
      
      // Verify node update
      const updatedNode = dataStore.getNode(textNode!.sid!);
      expect(updatedNode!.text).toBe('');
    });

    it('delete same position range (empty range)', () => {
      const allNodes = dataStore.getAllNodes();
      const textNode = allNodes.find(n => n.stype === 'inline-text');
      
      expect(textNode).toBeTruthy();

      // Same position range (5, 5)
      const contentRange: ModelSelection = {
        startNodeId: textNode!.sid!,
        startOffset: 5,
        endNodeId: textNode!.sid!,
        endOffset: 5
      };

      const deletedText = dataStore.deleteText(contentRange);
      
      expect(deletedText).toBe('');
      
      // Verify node has not changed
      const updatedNode = dataStore.getNode(textNode!.sid!);
      expect(updatedNode!.text).toBe('Hello World');
    });

    it('handle invalid range', () => {
      const allNodes = dataStore.getAllNodes();
      const textNode = allNodes.find(n => n.stype === 'inline-text');
      
      expect(textNode).toBeTruthy();

      // Invalid range (startOffset > endOffset)
      const contentRange: ModelSelection = {
        startNodeId: textNode!.sid!,
        startOffset: 7,
        endNodeId: textNode!.sid!,
        endOffset: 2
      };

      const deletedText = dataStore.deleteText(contentRange);
      
      expect(deletedText).toBe('');
      
      // Verify node has not changed
      const updatedNode = dataStore.getNode(textNode!.sid!);
      expect(updatedNode!.text).toBe('Hello World');
    });
  });

  describe('Multi-node range deletion', () => {
    beforeEach(() => {
      // Create document structure with multiple text nodes
      dataStore.createNodeWithChildren({
        stype: 'document',
        content: [
          {
            stype: 'paragraph',
            content: [
              { stype: 'inline-text', text: 'Hello ' },
              { stype: 'inline-text', text: 'Beautiful ' },
              { stype: 'inline-text', text: 'World' }
            ]
          }
        ]
      });
    });

    it('여러 노드에 걸친 텍스트 범위 삭제', () => {
      const allNodes = dataStore.getAllNodes();
      const textNodes = allNodes.filter(n => n.stype === 'inline-text');
      
      expect(textNodes).toHaveLength(3);
      expect(textNodes[0].text).toBe('Hello ');
      expect(textNodes[1].text).toBe('Beautiful ');
      expect(textNodes[2].text).toBe('World');

      // Delete "llo Beautifu" (from 2nd position of first node to 9th position of third node)
      const contentRange: ModelSelection = {
        startNodeId: textNodes[0].sid!,
        startOffset: 2,
        endNodeId: textNodes[2].sid!,
        endOffset: 2  // Up to "W" of "Wo"
      };

      const deletedText = dataStore.deleteText(contentRange);
      
      expect(deletedText).toBe('llo Beautiful Wo');
      
      // Verify node updates
      const updatedNode1 = dataStore.getNode(textNodes[0].sid!);
      const updatedNode2 = dataStore.getNode(textNodes[1].sid!);
      const updatedNode3 = dataStore.getNode(textNodes[2].sid!);
      
      expect(updatedNode1!.text).toBe('He');  // "Hello " -> "He"
      expect(updatedNode2!.text).toBe('');    // "Beautiful " -> ""
      expect(updatedNode3!.text).toBe('rld'); // "World" -> "rld"
    });
  });

  describe('insertText (ModelSelection based)', () => {
    beforeEach(() => {
      // Create simple document structure
      dataStore.createNodeWithChildren({
        stype: 'document',
        content: [
          {
            stype: 'paragraph',
            content: [
              { stype: 'inline-text', text: 'Hello World' }
            ]
          }
        ]
      });
    });

    it('단일 노드 내에서 텍스트 삽입', () => {
      const allNodes = dataStore.getAllNodes();
      const textNode = allNodes.find(n => n.stype === 'inline-text');
      
      expect(textNode).toBeTruthy();
      expect(textNode!.text).toBe('Hello World');

      // Insert " Amazing" at 5th position
      const contentRange: ModelSelection = {
        startNodeId: textNode!.sid!,
        startOffset: 5,
        endNodeId: textNode!.sid!,
        endOffset: 5
      };

      const insertedText = dataStore.insertText(contentRange, ' Amazing');
      
      expect(insertedText).toBe(' Amazing');
      
      // Verify node update
      const updatedNode = dataStore.getNode(textNode!.sid!);
      expect(updatedNode!.text).toBe('Hello Amazing World');
    });
  });

  describe('replaceText (ModelSelection 기반)', () => {
    beforeEach(() => {
      // Create simple document structure
      dataStore.createNodeWithChildren({
        stype: 'document',
        content: [
          {
            stype: 'paragraph',
            content: [
              { stype: 'inline-text', text: 'Hello World' }
            ]
          }
        ]
      });
    });

    it('단일 노드 내에서 텍스트 교체', () => {
      const allNodes = dataStore.getAllNodes();
      const textNode = allNodes.find(n => n.stype === 'inline-text');
      
      expect(textNode).toBeTruthy();
      expect(textNode!.text).toBe('Hello World');

      // Replace "llo Wo" with " Amazing"
      const contentRange: ModelSelection = {
        startNodeId: textNode!.sid!,
        startOffset: 2,
        endNodeId: textNode!.sid!,
        endOffset: 7
      };

      const replacedText = dataStore.replaceText(contentRange, ' Amazing');
      
      expect(replacedText).toBe('llo W');
      
      // Verify node update
      const updatedNode = dataStore.getNode(textNode!.sid!);
      expect(updatedNode!.text).toBe('He Amazingorld');
    });
  });

  describe('extractText (ModelSelection 기반)', () => {
    beforeEach(() => {
      // Create simple document structure
      dataStore.createNodeWithChildren({
        stype: 'document',
        content: [
          {
            stype: 'paragraph',
            content: [
              { stype: 'inline-text', text: 'Hello World' }
            ]
          }
        ]
      });
    });

    it('단일 노드 내에서 텍스트 추출 (삭제하지 않음)', () => {
      const allNodes = dataStore.getAllNodes();
      const textNode = allNodes.find(n => n.stype === 'inline-text');
      
      expect(textNode).toBeTruthy();
      expect(textNode!.text).toBe('Hello World');

      // Extract "llo Wo" (from 2nd to 7th position)
      const contentRange: ModelSelection = {
        startNodeId: textNode!.sid!,
        startOffset: 2,
        endNodeId: textNode!.sid!,
        endOffset: 7
      };

      const extractedText = dataStore.extractText(contentRange);
      
      expect(extractedText).toBe('llo W');
      
      // Verify node is not changed (only extracted, not deleted)
      const updatedNode = dataStore.getNode(textNode!.sid!);
      expect(updatedNode!.text).toBe('Hello World');
    });

    it('전체 텍스트 추출', () => {
      const allNodes = dataStore.getAllNodes();
      const textNode = allNodes.find(n => n.stype === 'inline-text');
      
      expect(textNode).toBeTruthy();

      // Extract full text
      const contentRange: ModelSelection = {
        startNodeId: textNode!.sid!,
        startOffset: 0,
        endNodeId: textNode!.sid!,
        endOffset: textNode!.text!.length
      };

      const extractedText = dataStore.extractText(contentRange);
      
      expect(extractedText).toBe('Hello World');
      
      // Verify node is not changed
      const updatedNode = dataStore.getNode(textNode!.sid!);
      expect(updatedNode!.text).toBe('Hello World');
    });

    it('같은 위치 범위 추출 (빈 범위)', () => {
      const allNodes = dataStore.getAllNodes();
      const textNode = allNodes.find(n => n.stype === 'inline-text');
      
      expect(textNode).toBeTruthy();

      // Same position range (5, 5)
      const contentRange: ModelSelection = {
        startNodeId: textNode!.sid!,
        startOffset: 5,
        endNodeId: textNode!.sid!,
        endOffset: 5
      };

      const extractedText = dataStore.extractText(contentRange);
      
      expect(extractedText).toBe('');
      
      // Verify node is not changed
      const updatedNode = dataStore.getNode(textNode!.sid!);
      expect(updatedNode!.text).toBe('Hello World');
    });
  });

  describe('copyText (ModelSelection 기반)', () => {
    beforeEach(() => {
      // Create simple document structure
      dataStore.createNodeWithChildren({
        stype: 'document',
        content: [
          {
            stype: 'paragraph',
            content: [
              { stype: 'inline-text', text: 'Hello World' }
            ]
          }
        ]
      });
    });

    it('단일 노드 내에서 텍스트 복사', () => {
      const allNodes = dataStore.getAllNodes();
      const textNode = allNodes.find(n => n.stype === 'inline-text');
      
      expect(textNode).toBeTruthy();
      expect(textNode!.text).toBe('Hello World');

      // Copy "llo Wo" (from 2nd to 7th position)
      const contentRange: ModelSelection = {
        startNodeId: textNode!.sid!,
        startOffset: 2,
        endNodeId: textNode!.sid!,
        endOffset: 7
      };

      const copiedText = dataStore.copyText(contentRange);
      
      expect(copiedText).toBe('llo W');
      
      // Verify node is not changed (only copied, not deleted)
      const updatedNode = dataStore.getNode(textNode!.sid!);
      expect(updatedNode!.text).toBe('Hello World');
    });
  });

  describe('moveText (ModelSelection 기반)', () => {
    beforeEach(() => {
      // Create simple document structure
      dataStore.createNodeWithChildren({
        stype: 'document',
        content: [
          {
            stype: 'paragraph',
            content: [
              { stype: 'inline-text', text: 'Hello World' }
            ]
          }
        ]
      });
    });

    it('단일 노드 내에서 텍스트 이동', () => {
      const allNodes = dataStore.getAllNodes();
      const textNode = allNodes.find(n => n.stype === 'inline-text');
      
      expect(textNode).toBeTruthy();
      expect(textNode!.text).toBe('Hello World');

      // Move "llo Wo" to end (from 2nd to 7th position to end)
      const fromRange: ModelSelection = {
        startNodeId: textNode!.sid!,
        startOffset: 2,
        endNodeId: textNode!.sid!,
        endOffset: 7
      };

      const toRange: ModelSelection = {
        startNodeId: textNode!.sid!,
        startOffset: 11, // End position
        endNodeId: textNode!.sid!,
        endOffset: 11
      };

      const movedText = dataStore.moveText(fromRange, toRange);
      
      expect(movedText).toBe('llo W');
      
      // Verify node update
      const updatedNode = dataStore.getNode(textNode!.sid!);
      expect(updatedNode!.text).toBe('Heorldllo W');
    });
  });

  describe('duplicateText (ModelSelection 기반)', () => {
    beforeEach(() => {
      // Create simple document structure
      dataStore.createNodeWithChildren({
        stype: 'document',
        content: [
          {
            stype: 'paragraph',
            content: [
              { stype: 'inline-text', text: 'Hello World' }
            ]
          }
        ]
      });
    });

    it('단일 노드 내에서 텍스트 복제', () => {
      const allNodes = dataStore.getAllNodes();
      const textNode = allNodes.find(n => n.stype === 'inline-text');
      
      expect(textNode).toBeTruthy();
      expect(textNode!.text).toBe('Hello World');

      // Duplicate "llo Wo" (from 2nd to 7th position)
      const contentRange: ModelSelection = {
        startNodeId: textNode!.sid!,
        startOffset: 2,
        endNodeId: textNode!.sid!,
        endOffset: 7
      };

      const duplicatedText = dataStore.duplicateText(contentRange);
      
      expect(duplicatedText).toBe('llo W');
      
      // Verify node update (original + duplicate)
      const updatedNode = dataStore.getNode(textNode!.sid!);
      expect(updatedNode!.text).toBe('Hello Wllo World');
    });
  });

  describe('applyMark (ModelSelection 기반)', () => {
    beforeEach(() => {
      // Create simple document structure
      dataStore.createNodeWithChildren({
        stype: 'document',
        content: [
          {
            stype: 'paragraph',
            content: [
              { stype: 'inline-text', text: 'Hello World' }
            ]
          }
        ]
      });
    });

    it('단일 노드 내에서 마크 적용', () => {
      const allNodes = dataStore.getAllNodes();
      const textNode = allNodes.find(n => n.stype === 'inline-text');
      
      expect(textNode).toBeTruthy();
      expect(textNode!.text).toBe('Hello World');
      expect(textNode!.marks).toBeUndefined();

      // Apply bold mark to "llo Wo" (from 2nd to 7th position)
      const contentRange: ModelSelection = {
        startNodeId: textNode!.sid!,
        startOffset: 2,
        endNodeId: textNode!.sid!,
        endOffset: 7
      };

      const boldMark = {
        stype: 'bold',
        attrs: {}
      };

      const appliedMark = dataStore.applyMark(contentRange, boldMark);
      
      expect(appliedMark).toEqual(boldMark);
      
      // Verify node update
      const updatedNode = dataStore.getNode(textNode!.sid!);
      expect(updatedNode!.text).toBe('Hello World');
      expect(updatedNode!.marks).toHaveLength(1);
      expect(updatedNode!.marks![0]).toEqual({
        stype: 'bold',
        attrs: {},
        range: [2, 7]
      });
    });
  });

  describe('removeMark (ModelSelection 기반)', () => {
    beforeEach(() => {
      // Create document structure with marks
      dataStore.createNodeWithChildren({
        stype: 'document',
        content: [
          {
            stype: 'paragraph',
            content: [
              { 
                stype: 'inline-text', 
                text: 'Hello World',
                marks: [
                  { stype: 'bold', range: [0, 5] },
                  { stype: 'italic', range: [2, 7] },
                  { stype: 'bold', range: [6, 11] }
                ]
              }
            ]
          }
        ]
      });
    });

    it('단일 노드 내에서 특정 마크 제거', () => {
      const allNodes = dataStore.getAllNodes();
      const textNode = allNodes.find(n => n.stype === 'inline-text');
      
      expect(textNode).toBeTruthy();
      expect(textNode!.marks).toHaveLength(3);

      // Remove bold mark from "llo Wo" (from 2nd to 7th position)
      const contentRange: ModelSelection = {
        startNodeId: textNode!.sid!,
        startOffset: 2,
        endNodeId: textNode!.sid!,
        endOffset: 7
      };

      const removedCount = dataStore.removeMark(contentRange, 'bold');
      
      expect(removedCount).toBe(2); // 2 bold marks removed
      
      // Verify node update
      const updatedNode = dataStore.getNode(textNode!.sid!);
      expect(updatedNode!.marks).toHaveLength(1);
      expect(updatedNode!.marks!.find(m => m.stype === 'italic')).toBeTruthy(); // Only italic remains
      expect(updatedNode!.marks!.find(m => m.stype === 'bold')).toBeFalsy(); // All bold removed
    });
  });

  describe('findText (ModelSelection 기반)', () => {
    beforeEach(() => {
      // Create simple document structure
      dataStore.createNodeWithChildren({
        stype: 'document',
        content: [
          {
            stype: 'paragraph',
            content: [
              { stype: 'inline-text', text: 'Hello World' }
            ]
          }
        ]
      });
    });

    it('단일 노드 내에서 텍스트 검색', () => {
      const allNodes = dataStore.getAllNodes();
      const textNode = allNodes.find(n => n.stype === 'inline-text');
      
      expect(textNode).toBeTruthy();
      expect(textNode!.text).toBe('Hello World');

      // Search for "World" in full text
      const contentRange: ModelSelection = {
        startNodeId: textNode!.sid!,
        startOffset: 0,
        endNodeId: textNode!.sid!,
        endOffset: textNode!.text!.length
      };

      const position = dataStore.findText(contentRange, 'World');
      
      expect(position).toBe(6); // "World" starts at 6th position
    });

    it('부분 범위에서 텍스트 검색', () => {
      const allNodes = dataStore.getAllNodes();
      const textNode = allNodes.find(n => n.stype === 'inline-text');
      
      expect(textNode).toBeTruthy();

      // Search for "lo" in "llo Wo" range (from 2nd to 7th position)
      const contentRange: ModelSelection = {
        startNodeId: textNode!.sid!,
        startOffset: 2,
        endNodeId: textNode!.sid!,
        endOffset: 7
      };

      const position = dataStore.findText(contentRange, 'lo');
      
      expect(position).toBe(3); // "lo" in "llo Wo" starts at 3rd position
    });

    it('존재하지 않는 텍스트 검색', () => {
      const allNodes = dataStore.getAllNodes();
      const textNode = allNodes.find(n => n.stype === 'inline-text');
      
      expect(textNode).toBeTruthy();

      const contentRange: ModelSelection = {
        startNodeId: textNode!.sid!,
        startOffset: 0,
        endNodeId: textNode!.sid!,
        endOffset: textNode!.text!.length
      };

      const position = dataStore.findText(contentRange, 'xyz');
      
      expect(position).toBe(-1); // Not found
    });
  });

  describe('getTextLength (ModelSelection 기반)', () => {
    beforeEach(() => {
      // Create simple document structure
      dataStore.createNodeWithChildren({
        stype: 'document',
        content: [
          {
            stype: 'paragraph',
            content: [
              { stype: 'inline-text', text: 'Hello World' }
            ]
          }
        ]
      });
    });

    it('전체 텍스트 길이 계산', () => {
      const allNodes = dataStore.getAllNodes();
      const textNode = allNodes.find(n => n.stype === 'inline-text');
      
      expect(textNode).toBeTruthy();
      expect(textNode!.text).toBe('Hello World');

      const contentRange: ModelSelection = {
        startNodeId: textNode!.sid!,
        startOffset: 0,
        endNodeId: textNode!.sid!,
        endOffset: textNode!.text!.length
      };

      const length = dataStore.getTextLength(contentRange);
      
      expect(length).toBe(11); // "Hello World" is 11 characters
    });

    it('부분 범위 텍스트 길이 계산', () => {
      const allNodes = dataStore.getAllNodes();
      const textNode = allNodes.find(n => n.stype === 'inline-text');
      
      expect(textNode).toBeTruthy();

      // "llo Wo" range (from 2nd to 7th position)
      const contentRange: ModelSelection = {
        startNodeId: textNode!.sid!,
        startOffset: 2,
        endNodeId: textNode!.sid!,
        endOffset: 7
      };

      const length = dataStore.getTextLength(contentRange);
      
      expect(length).toBe(5); // "llo Wo" is 5 characters
    });
  });

  describe('trimText (ModelSelection 기반)', () => {
    beforeEach(() => {
      // Create document structure with spaces
      dataStore.createNodeWithChildren({
        stype: 'document',
        content: [
          {
            stype: 'paragraph',
            content: [
              { stype: 'inline-text', text: '  Hello World  ' }
            ]
          }
        ]
      });
    });

    it('앞뒤 공백 제거', () => {
      const allNodes = dataStore.getAllNodes();
      const textNode = allNodes.find(n => n.stype === 'inline-text');
      
      expect(textNode).toBeTruthy();
      expect(textNode!.text).toBe('  Hello World  ');

      const contentRange: ModelSelection = {
        startNodeId: textNode!.sid!,
        startOffset: 0,
        endNodeId: textNode!.sid!,
        endOffset: textNode!.text!.length
      };

      const removedSpaces = dataStore.trimText(contentRange);
      
      expect(removedSpaces).toBe(4); // 4 leading/trailing spaces removed
      
      // Verify node update
      const updatedNode = dataStore.getNode(textNode!.sid!);
      expect(updatedNode!.text).toBe('Hello World');
    });
  });

  describe('normalizeWhitespace (ModelSelection 기반)', () => {
    beforeEach(() => {
      // Create document structure with irregular spaces
      dataStore.createNodeWithChildren({
        stype: 'document',
        content: [
          {
            stype: 'paragraph',
            content: [
              { stype: 'inline-text', text: '  Hello    World  ' }
            ]
          }
        ]
      });
    });

    it('공백 정규화', () => {
      const allNodes = dataStore.getAllNodes();
      const textNode = allNodes.find(n => n.stype === 'inline-text');
      
      expect(textNode).toBeTruthy();
      expect(textNode!.text).toBe('  Hello    World  ');

      const contentRange: ModelSelection = {
        startNodeId: textNode!.sid!,
        startOffset: 0,
        endNodeId: textNode!.sid!,
        endOffset: textNode!.text!.length
      };

      const normalizedText = dataStore.normalizeWhitespace(contentRange);
      
      expect(normalizedText).toBe('Hello World'); // Consecutive spaces become one, leading/trailing spaces removed
      
      // Verify node update
      const updatedNode = dataStore.getNode(textNode!.sid!);
      expect(updatedNode!.text).toBe('Hello World');
    });
  });

  describe('wrap/unwrap & expand utilities', () => {
    beforeEach(() => {
      dataStore.createNodeWithChildren({
        stype: 'document',
        content: [
          {
            stype: 'paragraph',
            content: [
              { stype: 'inline-text', text: 'hello world' }
            ]
          }
        ]
      });
    });

    it('wrap/unwrap 동작', () => {
      const textNode = dataStore.getAllNodes().find(n => n.stype === 'inline-text')!;
      const range: ModelSelection = { stype: 'range' as const, startNodeId: textNode.sid!, startOffset: 0, endNodeId: textNode.sid!, endOffset: textNode.text!.length };
      const wrapped = dataStore.wrap(range, '(', ')');
      expect(wrapped).toBe('(hello world)');
      const unwrapped = dataStore.unwrap(range, '(', ')');
      expect(unwrapped).toBe('hello world');
      const updated = dataStore.getNode(textNode.sid!)!;
      expect(updated.text).toBe('hello world');
    });

    it('expandToWord/normalizeRange 동작', () => {
      const textNode = dataStore.getAllNodes().find(n => n.stype === 'inline-text')!;
      const range: ModelSelection = { stype: 'range' as const, startNodeId: textNode.sid!, startOffset: 0, endNodeId: textNode.sid!, endOffset: 5 };
      const expanded = dataStore.expandToWord(range);
      // 양 끝 공백이 없으므로 동일해야 함
      expect(expanded).toEqual(range);
      const swapped = dataStore.normalizeRange({ stype: 'range' as const, startNodeId: textNode.sid!, startOffset: 5, endNodeId: textNode.sid!, endOffset: 0 });
      expect(swapped).toEqual(range);
    });
  });

  describe('replace/findAll/indent/outdent/toggleMark/constrainMarksToRange', () => {
    beforeEach(() => {
      dataStore.createNodeWithChildren({
        stype: 'document',
        content: [
          {
            stype: 'paragraph',
            content: [
              { stype: 'inline-text', text: 'Hello  Hello\n  World' }
            ]
          }
        ]
      });
    });

    it('findAll: 모든 패턴 매칭 위치 반환', () => {
      const textNode = dataStore.getAllNodes().find(n => n.stype === 'inline-text')!;
      const range: ModelSelection = { stype: 'range' as const, startNodeId: textNode.sid!, startOffset: 0, endNodeId: textNode.sid!, endOffset: textNode.text!.length };
      const matches = dataStore.findAll(range, /Hello/g);
      expect(matches.length).toBe(2);
      expect(matches[0]).toEqual({ start: 0, end: 5 });
      expect(matches[1]).toEqual({ start: 7, end: 12 });
    });

    it('replace: 패턴 치환 및 치환 횟수 반환', () => {
      const textNode = dataStore.getAllNodes().find(n => n.stype === 'inline-text')!;
      const range: ModelSelection = { stype: 'range' as const, startNodeId: textNode.sid!, startOffset: 0, endNodeId: textNode.sid!, endOffset: textNode.text!.length };
      const count = dataStore.replace(range, /Hello/g, 'Hi');
      expect(count).toBe(2);
      const updated = dataStore.getNode(textNode.sid!)!;
      expect(updated.text).toBe('Hi  Hi\n  World');
    });

    it('indent/outdent: 라인 단위 들여쓰기/내어쓰기', () => {
      const textNode = dataStore.getAllNodes().find(n => n.stype === 'inline-text')!;
      const range: ModelSelection = { stype: 'range' as const, startNodeId: textNode.sid!, startOffset: 0, endNodeId: textNode.sid!, endOffset: textNode.text!.length };
      const indented = dataStore.indent(range, '  ');
      expect(indented).toBe('  Hello  Hello\n    World');
      const outdented = dataStore.outdent(range, '  ');
      // Should restore to original form
      const updated = dataStore.getNode(textNode.sid!)!;
      expect(updated.text).toBe('Hello  Hello\n  World');
    });

    it('toggleMark/constrainMarksToRange: 토글 후 범위 내로 클램프', () => {
      const textNode = dataStore.getAllNodes().find(n => n.stype === 'inline-text')!;
      const range: ModelSelection = { stype: 'range' as const, startNodeId: textNode.sid!, startOffset: 0, endNodeId: textNode.sid!, endOffset: 5 };
      dataStore.toggleMark(range, 'bold');
      let updated = dataStore.getNode(textNode.sid!)!;
      expect(updated.marks!.some(m => m.stype === 'bold' && m.range![0] === 0 && m.range![1] === 5)).toBe(true);

      // Remove by toggle
      dataStore.toggleMark(range, 'bold');
      updated = dataStore.getNode(textNode.sid!)!;
      // Spec: exact same-range toggle removes; if different impl path leaves it, accept either [] or no bold
      expect(updated.marks?.some(m => m.stype === 'bold')).toBeFalsy();

      // Re-apply, then extend beyond range and verify clamp
      dataStore.applyMark({ ...range, endOffset: 7 }, { stype: 'italic' });
      const clampCount = dataStore.constrainMarksToRange(range);
      updated = dataStore.getNode(textNode.sid!)!;
      expect(clampCount).toBeGreaterThan(0);
      expect(updated.marks!.every(m => (m.range![0] >= 0 && m.range![1] <= 5))).toBe(true);
    });
  });
});
