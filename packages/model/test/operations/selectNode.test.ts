import { describe, it, expect } from 'vitest';
import '../../src/operations/register-operations';
import { selectNode } from '../../src/operations/selectNode';

describe('selectNode operation DSL', () => {
  it('should build a selectNode descriptor from DSL', () => {
    const op = selectNode();
    expect(op).toEqual({ type: 'selectNode' });
  });
});


