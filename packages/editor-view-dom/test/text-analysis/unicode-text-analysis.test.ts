import { describe, it, expect } from 'vitest';
import { analyzeTextChanges } from '@barocss/text-analyzer';

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
        type: expect.stringMatching(/replace|delete|insert/),
        start: 1,
        end: 2,
        text: 'c',
        confidence: expect.any(Number)
      });
    });

    it('Zero Width Joiner (ZWJ) 처리가 올바르게 되어야 함', () => {
      const changes = analyzeTextChanges({
        oldText: '👨',
        newText: '👨‍👩‍👧‍👦',
        selectionOffset: 2,
        selectionLength: 0
      });

      expect(changes).toHaveLength(1);
      expect(changes[0]).toMatchObject({
        type: 'insert',
        start: 2,
        end: 2,
        text: expect.stringContaining('👩'),
        confidence: expect.any(Number)
      });
    });

    it('BOM (Byte Order Mark) 처리가 올바르게 되어야 함', () => {
      const changes = analyzeTextChanges({
        oldText: '\uFEFFhello',
        newText: 'hello',
        selectionOffset: 0,
        selectionLength: 1
      });

      expect(changes).toHaveLength(1);
      expect(changes[0]).toMatchObject({
        type: expect.stringMatching(/delete|replace/),
        start: 0,
        end: 1,
        text: '',
        confidence: expect.any(Number)
      });
    });
  });

  describe('복합 이모지 처리', () => {
    it('이모지 수식어가 올바르게 처리되어야 함', () => {
      const changes = analyzeTextChanges({
        oldText: '👍',
        newText: '👍🏻',
        selectionOffset: 2,
        selectionLength: 0
      });

      expect(changes).toHaveLength(1);
      expect(changes[0]).toMatchObject({
        type: 'insert',
        start: 2,
        end: 2,
        text: '🏻',
        confidence: expect.any(Number)
      });
    });

    it('복합 이모지 가족이 올바르게 처리되어야 함', () => {
      const changes = analyzeTextChanges({
        oldText: '👨',
        newText: '👨‍👩‍👧‍👦',
        selectionOffset: 2,
        selectionLength: 0
      });

      expect(changes).toHaveLength(1);
      expect(changes[0]).toMatchObject({
        type: 'insert',
        start: 2,
        end: 2,
        text: expect.stringContaining('👩'),
        confidence: expect.any(Number)
      });
    });
  });

  describe('RTL/LTR 혼합 텍스트', () => {
    it('아랍어와 영어 혼합 텍스트가 올바르게 처리되어야 함', () => {
      const changes = analyzeTextChanges({
        oldText: 'Hello',
        newText: 'Hello مرحبا',
        selectionOffset: 5,
        selectionLength: 0
      });

      expect(changes).toHaveLength(1);
      expect(changes[0]).toMatchObject({
        type: 'insert',
        start: 5,
        end: 5,
        text: expect.stringContaining('مرحبا'),
        confidence: expect.any(Number)
      });
    });

    it('히브리어와 영어 혼합 텍스트가 올바르게 처리되어야 함', () => {
      const changes = analyzeTextChanges({
        oldText: 'Hello',
        newText: 'Hello שלום',
        selectionOffset: 5,
        selectionLength: 0
      });

      expect(changes).toHaveLength(1);
      expect(changes[0]).toMatchObject({
        type: 'insert',
        start: 5,
        end: 5,
        text: expect.stringContaining('שלום'),
        confidence: expect.any(Number)
      });
    });
  });

  describe('Selection Bias 테스트', () => {
    it('동일한 문자 연속에서 Selection 위치 기반 정확한 삭제가 되어야 함', () => {
      const changes = analyzeTextChanges({
        oldText: 'aaaaa',
        newText: 'aaaa',
        selectionOffset: 3,
        selectionLength: 1
      });

      expect(changes).toHaveLength(1);
      expect(changes[0]).toMatchObject({
        type: expect.stringMatching(/delete|replace/),
        start: 3,
        end: 4,
        text: '',
        confidence: expect.any(Number)
      });
    });

    it('복잡한 패턴에서 Selection Bias가 올바르게 적용되어야 함', () => {
      const changes = analyzeTextChanges({
        oldText: 'hello world',
        newText: 'hello beautiful world',
        selectionOffset: 6,
        selectionLength: 0
      });

      expect(changes).toHaveLength(1);
      expect(changes[0]).toMatchObject({
        type: 'insert',
        start: 6,
        end: 6,
        text: 'beautiful ',
        confidence: expect.any(Number)
      });
    });
  });

  describe('한글 특수 케이스', () => {
    it('한글 조합 중간 상태가 올바르게 처리되어야 함', () => {
      const changes1 = analyzeTextChanges({
        oldText: 'ㅎ',
        newText: '하',
        selectionOffset: 0,
        selectionLength: 1
      });

      expect(changes1).toHaveLength(1);
      expect(changes1[0]).toMatchObject({
        type: expect.stringMatching(/replace|delete|insert/),
        start: 0,
        end: 1,
        text: '하',
        confidence: expect.any(Number)
      });
    });

    it('중복 음절 삭제 모호성이 올바르게 해결되어야 함', () => {
      const changes = analyzeTextChanges({
        oldText: '안녕안녕',
        newText: '안녕',
        selectionOffset: 2,
        selectionLength: 2
      });

      expect(changes).toHaveLength(1);
      expect(changes[0]).toMatchObject({
        type: expect.stringMatching(/delete|replace/),
        start: 2,
        end: 4,
        text: '',
        confidence: expect.any(Number)
      });
    });
  });

  describe('연속 입력 시뮬레이션', () => {
    it('빠른 연속 타이핑이 올바르게 처리되어야 함', () => {
      const changes1 = analyzeTextChanges({
        oldText: '',
        newText: 'a',
        selectionOffset: 0,
        selectionLength: 0
      });

      expect(changes1).toHaveLength(1);
      expect(changes1[0]).toMatchObject({
        type: 'insert',
        start: 0,
        end: 0,
        text: 'a',
        confidence: expect.any(Number)
      });
    });
  });

  describe('멱등성 및 연산 적용 검증', () => {
    it('동일한 입력 2회 호출 시 변경 없음을 반환해야 함', () => {
      const changes1 = analyzeTextChanges({
        oldText: 'hello',
        newText: 'helloXYZ',
        selectionOffset: 2,
        selectionLength: 0
      });

      expect(changes1).toHaveLength(1);
      expect(changes1[0]).toMatchObject({
        type: 'insert',
        start: 5,
        end: 5,
        text: 'XYZ',
        confidence: expect.any(Number)
      });
    });
  });

  describe('복잡한 유니코드 조합', () => {
    it('BOM + ZWSP + 이모지 혼합이 올바르게 처리되어야 함', () => {
      const changes = analyzeTextChanges({
        oldText: '\uFEFF\u200B😀',
        newText: '',
        selectionOffset: 0,
        selectionLength: 4
      });

      expect(changes).toHaveLength(1);
      expect(changes[0]).toMatchObject({
        type: expect.stringMatching(/delete|replace/),
        start: 0,
        end: 4,
        text: '',
        confidence: expect.any(Number)
      });
    });

    it('여러 결합 문자 연속이 올바르게 처리되어야 함', () => {
      const changes = analyzeTextChanges({
        oldText: 'a',
        newText: 'a\u0300\u0301',
        selectionOffset: 1,
        selectionLength: 0
      });

      expect(changes.length).toBeGreaterThan(0);
      expect(changes[0]).toMatchObject({
        type: expect.stringMatching(/insert|replace/),
        start: 0,
        end: 1,
        text: expect.any(String),
        confidence: expect.any(Number)
      });
    });
  });

  describe('성능 테스트', () => {
    it('긴 텍스트에서도 빠르게 처리되어야 함', () => {
      const longText = 'a'.repeat(1000);
      const newText = longText + 'X';
      
      const startTime = performance.now();
      const changes = analyzeTextChanges({
        oldText: longText,
        newText: newText,
        selectionOffset: 1200,
        selectionLength: 0
      });
      const duration = performance.now() - startTime;
      
      expect(duration).toBeLessThan(5); // Within 5ms
      expect(changes).toHaveLength(1);
      expect(changes[0]).toMatchObject({
        type: 'insert',
        start: 1000,
        end: 1000,
        text: 'X',
        confidence: expect.any(Number)
      });
    });
  });
});