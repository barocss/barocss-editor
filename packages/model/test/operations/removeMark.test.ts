import { describe, it, expect } from 'vitest';
import '../../src/operations/register-operations';
import { removeMark } from '../../src/operations-dsl/removeMark';

describe('removeMark operation DSL', () => {
  it('should build a removeMark descriptor from DSL', () => {
    const op = removeMark('italic', [3, 9]);
    expect(op).toEqual({
      type: 'removeMark',
      payload: { markType: 'italic', range: [3, 9] }
    });
  });
});


