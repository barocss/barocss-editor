import { describe, it, expect } from 'vitest';
import { analyzeTextChanges } from '@barocss/text-analyzer';

describe('Correct Test Cases', () => {
  describe('Selection 기반 변경사항', () => {
    it('Selection 영역 삭제 (올바른 케이스)', () => {
      const result = analyzeTextChanges({
        oldText: 'hello beautiful world',
        newText: 'hello world',
        selectionOffset: 6,
        selectionLength: 10 // 'beautiful ' 선택
      });

      console.log('Selection 영역 삭제 결과:', result);
      
      /**
       * 스마트 분석기 분석 과정:
       * 1. LCP 계산: "hello " (6자) 공통 접두사 발견
       * 2. LCS 계산: "world" (5자) 공통 접미사 발견
       * 3. 변경 영역 식별: oldText[6:16] vs newText[6:6] = "beautiful " vs ""
       * 4. Selection 바이어싱: selectionOffset=6이 변경 영역 시작점과 일치
       * 5. 변경 타입 결정: 삭제 (newText 부분이 비어있음)
       * 6. 신뢰도 계산: Selection 기반이므로 confidence=1.0
       */
      
      // 스마트 분석기는 LCP/LCS 기반으로 최적해를 찾으므로 여러 변경사항이 감지될 수 있음
      expect(result.length).toBeGreaterThan(0);
      // 첫 번째 변경사항이 주요 변경사항 (스마트 분석기는 replace로 감지할 수 있음)
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
        selectionLength: 10 // 'beautiful ' 선택
      });

      console.log('Selection 영역 교체 결과:', result);
      // 스마트 분석기는 LCP/LCS 기반으로 최적해를 찾으므로 여러 변경사항이 감지될 수 있음
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
        selectionLength: 0 // 커서 위치
      });

      console.log('Selection 영역 삽입 결과:', result);
      // 스마트 분석기는 LCP/LCS 기반으로 최적해를 찾으므로 여러 변경사항이 감지될 수 있음
      expect(result.length).toBeGreaterThan(0);
      // 첫 번째 변경사항이 주요 변경사항
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
      // 스마트 분석기는 LCP/LCS 기반으로 최적해를 찾으므로 여러 변경사항이 감지될 수 있음
      expect(result.length).toBeGreaterThan(0);
      // 첫 번째 변경사항이 주요 변경사항
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
      // 스마트 분석기는 LCP/LCS 기반으로 최적해를 찾으므로 여러 변경사항이 감지될 수 있음
      expect(result.length).toBeGreaterThan(0);
      // 첫 번째 변경사항이 주요 변경사항
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
      // 스마트 분석기는 LCP/LCS 기반으로 최적해를 찾으므로 여러 변경사항이 감지될 수 있음
      expect(result.length).toBeGreaterThan(0);
      // 첫 번째 변경사항이 주요 변경사항
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
      // 스마트 분석기는 LCP/LCS 기반으로 최적해를 찾으므로 여러 변경사항이 감지될 수 있음
      expect(result.length).toBeGreaterThan(0);
      // 첫 번째 변경사항이 주요 변경사항
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
      // 스마트 분석기는 LCP/LCS 기반으로 최적해를 찾으므로 여러 변경사항이 감지될 수 있음
      expect(result.length).toBeGreaterThan(0);
      // 첫 번째 변경사항이 주요 변경사항
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
        selectionLength: 1 // 중간의 'a' 선택
      });

      console.log('연속된 문자에서 Selection 기반 변경 결과:', result);
      // 스마트 분석기는 LCP/LCS 기반으로 최적해를 찾으므로 여러 변경사항이 감지될 수 있음
      expect(result.length).toBeGreaterThan(0);
      // 첫 번째 변경사항이 주요 변경사항
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
      // 스마트 분석기는 LCP/LCS 기반으로 최적해를 찾으므로 여러 변경사항이 감지될 수 있음
      expect(result.length).toBeGreaterThan(0);
      // 첫 번째 변경사항이 주요 변경사항
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