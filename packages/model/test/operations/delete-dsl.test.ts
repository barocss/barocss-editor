import { describe, it, expect } from 'vitest';
import '../../src/operations/register-operations';
import { deleteOp } from '../../src/operations-dsl/delete';

describe('delete operation DSL (descriptor only)', () => {
  it('should build a delete descriptor from DSL', () => {
    const op = deleteOp();
    expect(op).toEqual({ type: 'delete', payload: {} });
  });
});
