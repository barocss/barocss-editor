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

    // Expected result: insert "beautiful " at 6th position of oldText
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

    // Expected result: delete "beautiful " from 6th position of oldText
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