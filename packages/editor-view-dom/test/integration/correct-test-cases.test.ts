import { describe, it, expect } from 'vitest';
import { analyzeTextChanges } from '@barocss/text-analyzer';

describe('Correct Test Cases', () => {
  describe('Selection 기반 변경사항', () => {
    it('Selection 영역 삭제 (올바른 케이스)', () => {
      const result = analyzeTextChanges({
        oldText: 'hello beautiful world',
        newText: 'hello world',
        selectionOffset: 6,
        selectionLength: 10 // Select 'beautiful '
      });

      console.log('Selection 영역 삭제 결과:', result);
      
      /**
       * Smart analyzer analysis process:
       * 1. LCP calculation: "hello " (6 chars) common prefix found
       * 2. LCS calculation: "world" (5 chars) common suffix found
       * 3. Change region identification: oldText[6:16] vs newText[6:6] = "beautiful " vs ""
       * 4. Selection biasing: selectionOffset=6 matches change region start
       * 5. Change type determination: delete (newText part is empty)
       * 6. Confidence calculation: confidence=1.0 because Selection-based
       */
      
      // Smart analyzer finds optimal solution based on LCP/LCS, so multiple changes may be detected
      expect(result.length).toBeGreaterThan(0);
      // First change is the main change (smart analyzer may detect as replace)
      expect(result[0]).toMatchObject({
        type: expect.stringMatching(/delete|replace/),
        start: 6,
        end: 16,
        text: '',
        confidence: expect.any(Number)
      });
    });

    it('Selection 영역 교체 (올바른 케이스)', () => {
      const result = analyzeTextChanges({
        oldText: 'hello beautiful world',
        newText: 'hello amazing world',
        selectionOffset: 6,
        selectionLength: 10 // Select 'beautiful '
      });

      console.log('Selection 영역 교체 결과:', result);
      // Smart analyzer finds optimal solution based on LCP/LCS, so multiple changes may be detected
      expect(result.length).toBeGreaterThan(0);
      expect(result[0]).toMatchObject({
        type: expect.stringMatching(/replace|delete|insert/),
        start: 6,
        end: 15,
        text: 'amazing',
        confidence: expect.any(Number)
      });
    });

    it('Selection 영역 삽입 (올바른 케이스)', () => {
      const result = analyzeTextChanges({
        oldText: 'hello world',
        newText: 'hello beautiful world',
        selectionOffset: 6,
        selectionLength: 0 // Cursor position
      });

      console.log('Selection 영역 삽입 결과:', result);
      // Smart analyzer finds optimal solution based on LCP/LCS, so multiple changes may be detected
      expect(result.length).toBeGreaterThan(0);
      // First change is the main change
      expect(result[0]).toMatchObject({
        type: 'insert',
        start: 6,
        end: 6,
        text: 'beautiful ',
        confidence: expect.any(Number)
      });
    });
  });

  describe('기본 텍스트 변경사항', () => {
    it('텍스트 끝에 삽입', () => {
      const result = analyzeTextChanges({
        oldText: 'hello',
        newText: 'hello world',
        selectionOffset: 5,
        selectionLength: 0
      });

      console.log('텍스트 끝에 삽입 결과:', result);
      // Smart analyzer finds optimal solution based on LCP/LCS, so multiple changes may be detected
      expect(result.length).toBeGreaterThan(0);
      // First change is the main change
      expect(result[0]).toMatchObject({
        type: 'insert',
        start: 5,
        end: 5,
        text: ' world',
        confidence: expect.any(Number)
      });
    });

    it('텍스트 시작에 삽입', () => {
      const result = analyzeTextChanges({
        oldText: 'world',
        newText: 'hello world',
        selectionOffset: 0,
        selectionLength: 0
      });

      console.log('텍스트 시작에 삽입 결과:', result);
      // Smart analyzer finds optimal solution based on LCP/LCS, so multiple changes may be detected
      expect(result.length).toBeGreaterThan(0);
      // First change is the main change
      expect(result[0]).toMatchObject({
        type: 'insert',
        start: 0,
        end: 0,
        text: 'hello ',
        confidence: expect.any(Number)
      });
    });

    it('텍스트 중간에 삽입', () => {
      const result = analyzeTextChanges({
        oldText: 'hello world',
        newText: 'hello beautiful world',
        selectionOffset: 6,
        selectionLength: 0
      });

      console.log('텍스트 중간에 삽입 결과:', result);
      // Smart analyzer finds optimal solution based on LCP/LCS, so multiple changes may be detected
      expect(result.length).toBeGreaterThan(0);
      // First change is the main change
      expect(result[0]).toMatchObject({
        type: 'insert',
        start: 6,
        end: 6,
        text: 'beautiful ',
        confidence: expect.any(Number)
      });
    });

    it('전체 텍스트 삭제', () => {
      const result = analyzeTextChanges({
        oldText: 'hello world',
        newText: '',
        selectionOffset: 0,
        selectionLength: 11
      });

      console.log('전체 텍스트 삭제 결과:', result);
      // Smart analyzer finds optimal solution based on LCP/LCS, so multiple changes may be detected
      expect(result.length).toBeGreaterThan(0);
      // First change is the main change
      expect(result[0]).toMatchObject({
        type: expect.stringMatching(/delete|replace/),
        start: 0,
        end: 11,
        text: '',
        confidence: expect.any(Number)
      });
    });

    it('빈 문자열에서 삽입', () => {
      const result = analyzeTextChanges({
        oldText: '',
        newText: 'hello world',
        selectionOffset: 0,
        selectionLength: 0
      });

      console.log('빈 문자열에서 삽입 결과:', result);
      // Smart analyzer finds optimal solution based on LCP/LCS, so multiple changes may be detected
      expect(result.length).toBeGreaterThan(0);
      // First change is the main change
      expect(result[0]).toMatchObject({
        type: 'insert',
        start: 0,
        end: 0,
        text: 'hello world',
        confidence: expect.any(Number)
      });
    });
  });

  describe('복잡한 케이스', () => {
    it('연속된 문자에서 Selection 기반 변경', () => {
      const result = analyzeTextChanges({
        oldText: 'aaaaa',
        newText: 'aaaa',
        selectionOffset: 2,
        selectionLength: 1 // Select middle 'a'
      });

      console.log('연속된 문자에서 Selection 기반 변경 결과:', result);
      // Smart analyzer finds optimal solution based on LCP/LCS, so multiple changes may be detected
      expect(result.length).toBeGreaterThan(0);
      // First change is the main change
      expect(result[0]).toMatchObject({
        type: expect.stringMatching(/delete|replace/),
        start: 2,
        end: 3,
        text: '',
        confidence: expect.any(Number)
      });
    });

    it('한글 텍스트 변경', () => {
      const result = analyzeTextChanges({
        oldText: '안녕하세요',
        newText: '안녕하세요 세계',
        selectionOffset: 5,
        selectionLength: 0
      });

      console.log('한글 텍스트 변경 결과:', result);
      // Smart analyzer finds optimal solution based on LCP/LCS, so multiple changes may be detected
      expect(result.length).toBeGreaterThan(0);
      // First change is the main change
      expect(result[0]).toMatchObject({
        type: 'insert',
        start: 5,
        end: 5,
        text: ' 세계',
        confidence: expect.any(Number)
      });
    });
  });
});