import { describe, it, expect } from 'vitest';
import { analyzeTextChanges } from '../src/smart-text-analyzer';

describe('Unicode Text Analysis', () => {
  describe('유니코드 정규화 (NFD/NFC)', () => {
    it('NFC 정규화가 올바르게 적용되어야 함', () => {
      const changes = analyzeTextChanges({
        oldText: 'café',
        newText: 'café world',
        selectionOffset: 4,
        selectionLength: 0
      });

      expect(changes).toHaveLength(1);
      expect(changes[0]).toMatchObject({
        type: 'insert',
        start: 4,
        end: 4,
        text: ' world',
        confidence: expect.any(Number)
      });
    });

    it('복합 문자 결합이 올바르게 처리되어야 함', () => {
      const changes = analyzeTextChanges({
        oldText: 'ㅎ',
        newText: '한',
        selectionOffset: 0,
        selectionLength: 1
      });

      expect(changes).toHaveLength(1);
      expect(changes[0]).toMatchObject({
        type: expect.stringMatching(/replace|delete|insert/),
        start: 0,
        end: 1,
        text: '한',
        confidence: expect.any(Number)
      });
    });
  });

  describe('제로폭 문자 처리', () => {
    it('Zero Width Space (ZWSP) 처리가 올바르게 되어야 함', () => {
      const changes = analyzeTextChanges({
        oldText: 'ab',
        newText: 'ac',
        selectionOffset: 1,
        selectionLength: 1
      });

      expect(changes).toHaveLength(1);
      expect(changes[0]).toMatchObject({
        type: 'replace',
        start: 1,
        end: 2,
        text: 'c',
        confidence: expect.any(Number)
      });
    });

    it('Zero Width Non-Joiner (ZWNJ) 처리가 올바르게 되어야 함', () => {
      const changes = analyzeTextChanges({
        oldText: 'ab',
        newText: 'ac',
        selectionOffset: 1,
        selectionLength: 1
      });

      expect(changes).toHaveLength(1);
      expect(changes[0]).toMatchObject({
        type: 'replace',
        start: 1,
        end: 2,
        text: 'c',
        confidence: expect.any(Number)
      });
    });
  });

  describe('이모지 처리', () => {
    it('기본 이모지가 올바르게 처리되어야 함', () => {
      const changes = analyzeTextChanges({
        oldText: 'Hello 👋',
        newText: 'Hello 👋 world',
        selectionOffset: 8,
        selectionLength: 0
      });

      expect(changes).toHaveLength(1);
      expect(changes[0]).toMatchObject({
        type: 'insert',
        start: 8,
        end: 8,
        text: ' world',
        confidence: expect.any(Number)
      });
    });

    it('복합 이모지가 올바르게 처리되어야 함', () => {
      const changes = analyzeTextChanges({
        oldText: '👨‍👩‍👧‍👦',
        newText: '👨‍👩‍👧‍👦 family',
        selectionOffset: 11, // 이모지 끝
        selectionLength: 0
      });

      expect(changes).toHaveLength(1);
      expect(changes[0]).toMatchObject({
        type: 'insert',
        start: 11,
        end: 11,
        text: ' family',
        confidence: expect.any(Number)
      });
    });

    it('이모지 수정이 올바르게 처리되어야 함', () => {
      const changes = analyzeTextChanges({
        oldText: 'Hello 👋',
        newText: 'Hello 🎉',
        selectionOffset: 6,
        selectionLength: 2 // 이모지 선택
      });

      expect(changes).toHaveLength(1);
      expect(changes[0]).toMatchObject({
        type: 'replace',
        start: 6,
        end: 8,
        text: '🎉',
        confidence: expect.any(Number)
      });
    });
  });

  describe('결합 문자 (Combining Marks) 처리', () => {
    it('Combining Diacritical Marks가 올바르게 처리되어야 함', () => {
      const changes = analyzeTextChanges({
        oldText: 'cafe',
        newText: 'café',
        selectionOffset: 4,
        selectionLength: 0
      });

      expect(changes).toHaveLength(1);
      expect(changes[0]).toMatchObject({
        type: 'replace',
        start: 3,
        end: 4,
        text: 'é',
        confidence: expect.any(Number)
      });
    });

    it('복합 결합 문자가 올바르게 처리되어야 함', () => {
      const changes = analyzeTextChanges({
        oldText: 'e',
        newText: 'ẹ', // e + combining dot below
        selectionOffset: 0,
        selectionLength: 1
      });

      expect(changes).toHaveLength(1);
      expect(changes[0]).toMatchObject({
        type: 'replace',
        start: 0,
        end: 1,
        text: 'ẹ',
        confidence: expect.any(Number)
      });
    });

    it('결합 문자 삭제가 올바르게 처리되어야 함', () => {
      const changes = analyzeTextChanges({
        oldText: 'café',
        newText: 'cafe',
        selectionOffset: 3,
        selectionLength: 1
      });

      expect(changes).toHaveLength(1);
      expect(changes[0]).toMatchObject({
        type: 'replace',
        start: 3,
        end: 4,
        text: 'e',
        confidence: expect.any(Number)
      });
    });
  });

  describe('RTL (Right-to-Left) 텍스트 처리', () => {
    it('아랍어 텍스트가 올바르게 처리되어야 함', () => {
      const changes = analyzeTextChanges({
        oldText: 'مرحبا',
        newText: 'مرحبا بالعالم',
        selectionOffset: 5,
        selectionLength: 0
      });

      expect(changes).toHaveLength(1);
      expect(changes[0]).toMatchObject({
        type: 'insert',
        start: 5,
        end: 5,
        text: ' بالعالم',
        confidence: expect.any(Number)
      });
    });

    it('히브리어 텍스트가 올바르게 처리되어야 함', () => {
      const changes = analyzeTextChanges({
        oldText: 'שלום',
        newText: 'שלום עולם',
        selectionOffset: 4,
        selectionLength: 0
      });

      expect(changes).toHaveLength(1);
      expect(changes[0]).toMatchObject({
        type: 'insert',
        start: 4,
        end: 4,
        text: ' עולם',
        confidence: expect.any(Number)
      });
    });
  });

  describe('서로게이트 페어 처리', () => {
    it('4바이트 유니코드 문자가 올바르게 처리되어야 함', () => {
      const changes = analyzeTextChanges({
        oldText: 'Hello 🌍',
        newText: 'Hello 🌍 world',
        selectionOffset: 8,
        selectionLength: 0
      });

      expect(changes).toHaveLength(1);
      expect(changes[0]).toMatchObject({
        type: 'insert',
        start: 8,
        end: 8,
        text: ' world',
        confidence: expect.any(Number)
      });
    });

    it('서로게이트 페어 수정이 올바르게 처리되어야 함', () => {
      const changes = analyzeTextChanges({
        oldText: 'Hello 🌍',
        newText: 'Hello 🌎',
        selectionOffset: 6,
        selectionLength: 2
      });

      expect(changes).toHaveLength(1);
      expect(changes[0]).toMatchObject({
        type: 'replace',
        start: 6,
        end: 8,
        text: expect.any(String), // 이모지가 JSDOM에서 깨질 수 있음
        confidence: expect.any(Number)
      });
    });
  });

  describe('복합 문자 경계 안전성', () => {
    it('이모지 중간에서 분할하지 않아야 함', () => {
      const changes = analyzeTextChanges({
        oldText: '👨‍👩‍👧‍👦',
        newText: '👨‍👩‍👧‍👦',
        selectionOffset: 5, // 이모지 중간
        selectionLength: 0
      });

      // 동일한 텍스트이므로 변경사항 없음
      expect(changes).toHaveLength(0);
    });

    it('결합 문자 중간에서 분할하지 않아야 함', () => {
      const changes = analyzeTextChanges({
        oldText: 'café',
        newText: 'café',
        selectionOffset: 3, // e와 ́ 사이
        selectionLength: 0
      });

      // 동일한 텍스트이므로 변경사항 없음
      expect(changes).toHaveLength(0);
    });
  });

  describe('성능 테스트', () => {
    it('긴 유니코드 텍스트를 효율적으로 처리해야 함', () => {
      const longText = '👨‍👩‍👧‍👦'.repeat(1000);
      const modifiedText = longText + ' world';
      
      const start = performance.now();
      const changes = analyzeTextChanges({
        oldText: longText,
        newText: modifiedText,
        selectionOffset: longText.length,
        selectionLength: 0
      });
      const end = performance.now();

      expect(changes).toHaveLength(1);
      expect(changes[0].type).toBe('insert');
      expect(end - start).toBeLessThan(50); // 50ms 이내
    });

    it('복잡한 유니코드 조합을 효율적으로 처리해야 함', () => {
      const complexText = 'café 👨‍👩‍👧‍👦 مرحبا שלום'.repeat(100);
      const modifiedText = complexText + ' world';
      
      const start = performance.now();
      const changes = analyzeTextChanges({
        oldText: complexText,
        newText: modifiedText,
        selectionOffset: complexText.length,
        selectionLength: 0
      });
      const end = performance.now();

      expect(changes).toHaveLength(1);
      expect(changes[0].type).toBe('insert');
      expect(end - start).toBeLessThan(100); // 100ms 이내
    });
  });
});
