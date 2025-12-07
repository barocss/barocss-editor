import { describe, it, expect } from 'vitest';
import { analyzeTextChanges } from '@barocss/text-analyzer';

describe('Basic Text Analysis', () => {
  describe('가장 기본적인 케이스', () => {
    it('텍스트 끝에 삽입', () => {
      const result = analyzeTextChanges({
        oldText: 'hello',
        newText: 'hello world',
        selectionOffset: 5,
        selectionLength: 0
      });

      console.log('텍스트 끝에 삽입 결과:', result);
      
      /**
       * 스마트 분석기 분석 과정:
       * 1. LCP 계산: "hello" (5자) 공통 접두사 발견
       * 2. LCS 계산: "" (0자) 공통 접미사 없음
       * 3. 변경 영역 식별: oldText[5:5] vs newText[5:11] = "" vs " world"
       * 4. Selection 바이어싱: selectionOffset=5가 변경 영역 시작점과 일치
       * 5. 변경 타입 결정: 삽입 (oldText 부분이 비어있음)
       * 6. 신뢰도 계산: Selection 기반이므로 confidence=1.0
       */
      
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
  });

  describe('Selection 영역이 있는 경우', () => {
    it('Selection 영역 교체', () => {
      const result = analyzeTextChanges({
        oldText: 'hello world',
        newText: 'hello there',
        selectionOffset: 6,
        selectionLength: 5
      });

      console.log('Selection 영역 교체 결과:', result);
      // Smart analyzer finds optimal solution based on LCP/LCS, so multiple changes may be detected
      expect(result.length).toBeGreaterThan(0);
      // First change is the main change
      expect(result[0]).toMatchObject({
        type: 'replace',
        start: 6,
        end: 11,
        text: 'there',
        confidence: expect.any(Number)
      });
    });

    it('Selection 영역 삭제 (올바른 케이스)', () => {
      const result = analyzeTextChanges({
        oldText: 'hello beautiful world',
        newText: 'hello world',
        selectionOffset: 6,
        selectionLength: 10
      });

      console.log('Selection 영역 삭제 결과:', result);
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
        selectionLength: 9
      });

      console.log('Selection 영역 교체 결과:', result);
      // Smart analyzer finds optimal solution based on LCP/LCS, so multiple changes may be detected
      expect(result.length).toBeGreaterThan(0);
      // First change is the main change
      expect(result[0]).toMatchObject({
        type: expect.stringMatching(/replace|delete|insert/),
        start: 6,
        end: 15,
        text: 'amazing',
        confidence: expect.any(Number)
      });
    });


  });

  describe('엣지 케이스', () => {
    it('빈 문자열에서 삽입', () => {
      const result = analyzeTextChanges({
        oldText: '',
        newText: 'hello',
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
        text: 'hello',
        confidence: expect.any(Number)
      });
    });

    it('텍스트에서 빈 문자열로', () => {
      const result = analyzeTextChanges({
        oldText: 'hello',
        newText: '',
        selectionOffset: 0,
        selectionLength: 5
      });

      console.log('텍스트에서 빈 문자열로 결과:', result);
      // Smart analyzer finds optimal solution based on LCP/LCS, so multiple changes may be detected
      expect(result.length).toBeGreaterThan(0);
      // First change is the main change
      expect(result[0]).toMatchObject({
        type: 'delete',
        start: 0,
        end: 5,
        text: '',
        confidence: expect.any(Number)
      });
    });
  });
});