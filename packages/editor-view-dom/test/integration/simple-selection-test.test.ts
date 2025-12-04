import { describe, it, expect } from 'vitest';
import { analyzeTextChanges } from '@barocss/text-analyzer';

describe('Simple Selection Test', () => {
  it('간단한 삽입 케이스', () => {
    const result = analyzeTextChanges({
      oldText: 'hello world',
      newText: 'hello beautiful world',
      selectionOffset: 6,
      selectionLength: 0
    });

    // 기대 결과: oldText의 6번째 위치에 "beautiful " 삽입
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      type: 'insert',
      start: 6,
      end: 6,
      text: 'beautiful ',
      confidence: 1
    });
  });

  it('간단한 삭제 케이스', () => {
    const result = analyzeTextChanges({
      oldText: 'hello beautiful world',
      newText: 'hello world',
      selectionOffset: 6,
      selectionLength: 10
    });

    // 기대 결과: oldText의 6번째 위치에서 "beautiful " 삭제
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      type: 'delete',
      start: 6,
      end: 16,
      text: '',
      confidence: 1
    });
  });
});