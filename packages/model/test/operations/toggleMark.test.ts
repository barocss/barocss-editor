import { describe, it, expect } from 'vitest';
import '../../src/operations/register-operations';
import { toggleMark } from '../../src/operations-dsl/toggleMark';

describe('toggleMark operation DSL', () => {
  it('should build a toggleMark descriptor from DSL', () => {
    const op = toggleMark('underline', [1, 4], { color: 'blue' });
    expect(op).toEqual({
      type: 'toggleMark',
      payload: { markType: 'underline', range: [1, 4], attrs: { color: 'blue' } }
    });
  });
});


