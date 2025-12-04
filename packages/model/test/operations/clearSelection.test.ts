import { describe, it, expect } from 'vitest';
import '../../src/operations/register-operations';
import { clearSelection } from '../../src/operations/clearSelection';

describe('clearSelection operation DSL', () => {
  it('should build a clearSelection descriptor from DSL', () => {
    const op = clearSelection();
    expect(op).toEqual({ type: 'clearSelection' });
  });
});


