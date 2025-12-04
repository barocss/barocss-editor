import { describe, it, expect } from 'vitest';
import { analyzeTextChanges } from '../src/smart-text-analyzer';

describe('Smart Text Analyzer', () => {
  describe('기본 텍스트 변경 감지', () => {
    it('should detect simple insertion', () => {
      const changes = analyzeTextChanges({
        oldText: 'Hello world',
        newText: 'Hello beautiful world',
        selectionOffset: 6,
        selectionLength: 0
      });

      expect(changes).toHaveLength(1);
      expect(changes[0]).toEqual({
        type: 'insert',
        start: 6,
        end: 6,
        text: 'beautiful ',
        confidence: 1.0
      });
    });

    it('should detect simple deletion', () => {
      const changes = analyzeTextChanges({
        oldText: 'Hello beautiful world',
        newText: 'Hello world',
        selectionOffset: 6,
        selectionLength: 10
      });

      expect(changes).toHaveLength(1);
      expect(changes[0]).toEqual({
        type: 'delete',
        start: 6,
        end: 16,
        text: '',
        confidence: 1.0
      });
    });

    it('should detect simple replacement', () => {
      const changes = analyzeTextChanges({
        oldText: 'Hello world',
        newText: 'Hello universe',
        selectionOffset: 6,
        selectionLength: 5
      });

      expect(changes).toHaveLength(1);
      expect(changes[0]).toEqual({
        type: 'replace',
        start: 6,
        end: 11,
        text: 'universe',
        confidence: 1.0
      });
    });

    it('should return empty array for identical texts', () => {
      const changes = analyzeTextChanges({
        oldText: 'Hello world',
        newText: 'Hello world',
        selectionOffset: 0,
        selectionLength: 0
      });

      expect(changes).toHaveLength(0);
    });
  });

  describe('Selection Bias 적용', () => {
    it('should prefer changes near selection for ambiguous cases', () => {
      // "aa" -> "aaa" 에서 selection이 끝에 있으면 끝에 삽입으로 감지
      const changes = analyzeTextChanges({
        oldText: 'aa',
        newText: 'aaa',
        selectionOffset: 2,
        selectionLength: 0
      });

      expect(changes).toHaveLength(1);
      expect(changes[0].start).toBe(2);
      expect(changes[0].type).toBe('insert');
    });

    it('should handle 1x1 character replacement with selection bias', () => {
      const changes = analyzeTextChanges({
        oldText: 'abcdef',
        newText: 'abXdef',
        selectionOffset: 2,
        selectionLength: 1
      });

      expect(changes).toHaveLength(1);
      expect(changes[0]).toEqual({
        type: 'replace',
        start: 2,
        end: 3,
        text: 'X',
        confidence: 1.0
      });
    });

    it('should handle deletion with selection overlap', () => {
      const changes = analyzeTextChanges({
        oldText: 'Hello beautiful world',
        newText: 'Hello world',
        selectionOffset: 8,
        selectionLength: 5 // "tiful" 선택
      });

      expect(changes).toHaveLength(1);
      expect(changes[0].type).toBe('delete');
      expect(changes[0].start).toBeGreaterThanOrEqual(6);
      expect(changes[0].end).toBeLessThanOrEqual(16);
    });
  });

  describe('Unicode 및 복합 문자 처리', () => {
    it('should handle emoji correctly', () => {
      const changes = analyzeTextChanges({
        oldText: 'Hello 👋',
        newText: 'Hello 👋 world',
        selectionOffset: 8,
        selectionLength: 0
      });

      expect(changes).toHaveLength(1);
      expect(changes[0].type).toBe('insert');
      expect(changes[0].text).toBe(' world');
    });

    it('should handle combining characters', () => {
      const changes = analyzeTextChanges({
        oldText: 'café', // é = e + ́
        newText: 'cafés',
        selectionOffset: 4,
        selectionLength: 0
      });

      expect(changes).toHaveLength(1);
      expect(changes[0].type).toBe('insert');
      expect(changes[0].text).toBe('s');
    });

    it('should normalize unicode before processing', () => {
      const oldText = 'cafe\u0301'; // e + combining acute accent
      const newText = 'café'; // precomposed é
      
      const changes = analyzeTextChanges({
        oldText,
        newText,
        selectionOffset: 0,
        selectionLength: 0
      });

      // 정규화 후 동일하므로 변경사항 없음
      expect(changes).toHaveLength(0);
    });
  });

  describe('LCP/LCS 알고리즘', () => {
    it('should find longest common prefix correctly', () => {
      const changes = analyzeTextChanges({
        oldText: 'The quick brown fox',
        newText: 'The quick red fox',
        selectionOffset: 10,
        selectionLength: 5
      });

      expect(changes).toHaveLength(1);
      expect(changes[0]).toEqual({
        type: 'replace',
        start: 10,
        end: 15,
        text: 'red',
        confidence: 1.0
      });
    });

    it('should find longest common suffix correctly', () => {
      const changes = analyzeTextChanges({
        oldText: 'prefix_old_suffix',
        newText: 'prefix_new_suffix',
        selectionOffset: 7,
        selectionLength: 3
      });

      expect(changes).toHaveLength(1);
      expect(changes[0]).toEqual({
        type: 'replace',
        start: 7,
        end: 10,
        text: 'new',
        confidence: 1.0
      });
    });

    it('should handle complex multi-change scenarios', () => {
      const changes = analyzeTextChanges({
        oldText: 'abc',
        newText: 'axyzc',
        selectionOffset: 1,
        selectionLength: 1
      });

      expect(changes).toHaveLength(1);
      expect(changes[0]).toEqual({
        type: 'replace',
        start: 1,
        end: 2,
        text: 'xyz',
        confidence: 1.0
      });
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty old text', () => {
      const changes = analyzeTextChanges({
        oldText: '',
        newText: 'Hello',
        selectionOffset: 0,
        selectionLength: 0
      });

      expect(changes).toHaveLength(1);
      expect(changes[0]).toEqual({
        type: 'insert',
        start: 0,
        end: 0,
        text: 'Hello',
        confidence: 1.0
      });
    });

    it('should handle empty new text', () => {
      const changes = analyzeTextChanges({
        oldText: 'Hello',
        newText: '',
        selectionOffset: 0,
        selectionLength: 5
      });

      expect(changes).toHaveLength(1);
      expect(changes[0]).toEqual({
        type: 'delete',
        start: 0,
        end: 5,
        text: '',
        confidence: 1.0
      });
    });

    it('should handle single character changes', () => {
      const changes = analyzeTextChanges({
        oldText: 'a',
        newText: 'b',
        selectionOffset: 0,
        selectionLength: 1
      });

      expect(changes).toHaveLength(1);
      expect(changes[0]).toEqual({
        type: 'replace',
        start: 0,
        end: 1,
        text: 'b',
        confidence: 1.0
      });
    });

    it('should handle very long texts efficiently', () => {
      const longText = 'a'.repeat(10000);
      const modifiedText = 'a'.repeat(5000) + 'X' + 'a'.repeat(4999);
      
      const start = performance.now();
      const changes = analyzeTextChanges({
        oldText: longText,
        newText: modifiedText,
        selectionOffset: 5000,
        selectionLength: 0
      });
      const end = performance.now();

      expect(changes).toHaveLength(1);
      expect(changes[0].type).toBe('replace');
      expect(end - start).toBeLessThan(100); // 100ms 이내
    });
  });
});
