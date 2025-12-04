import { describe, it, expect } from 'vitest';
import { moveBlockUp } from '../../src/operations/moveBlockUp';
import { moveBlockDown } from '../../src/operations/moveBlockDown';

describe('moveBlockUp/moveBlockDown operation DSL', () => {
  it('should build a moveBlockUp descriptor from DSL (with nodeId)', () => {
    const op = moveBlockUp('para-1');
    expect(op).toEqual({
      type: 'moveBlockUp',
      payload: { nodeId: 'para-1' }
    });
  });

  it('should build a moveBlockUp descriptor for control context (without nodeId)', () => {
    const op = moveBlockUp();
    expect(op).toEqual({
      type: 'moveBlockUp',
      payload: {}
    });
  });

  it('should build a moveBlockDown descriptor from DSL (with nodeId)', () => {
    const op = moveBlockDown('para-1');
    expect(op).toEqual({
      type: 'moveBlockDown',
      payload: { nodeId: 'para-1' }
    });
  });

  it('should build a moveBlockDown descriptor for control context (without nodeId)', () => {
    const op = moveBlockDown();
    expect(op).toEqual({
      type: 'moveBlockDown',
      payload: {}
    });
  });
});

