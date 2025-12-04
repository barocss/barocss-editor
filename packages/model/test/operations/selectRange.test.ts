import { describe, it, expect } from 'vitest';
import '../../src/operations/register-operations';
import { selectRange } from '../../src/operations/selectRange';

describe('selectRange operation DSL', () => {
  it('should build a selectRange descriptor from DSL', () => {
    const op = selectRange(3, 9);
    expect(op).toEqual({
      type: 'selectRange',
      payload: { anchor: 3, focus: 9 }
    });
  });
});


