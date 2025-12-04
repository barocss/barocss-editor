import { describe, it, expect } from 'vitest';
import { transformNode } from '../../src/operations/transformNode';

describe('transformNode operation DSL', () => {
  it('should build a transformNode descriptor from DSL (with nodeId)', () => {
    const op = transformNode('para-1', 'heading', { level: 1 });
    expect(op).toEqual({
      type: 'transformNode',
      payload: { nodeId: 'para-1', newType: 'heading', newAttrs: { level: 1 } }
    });
  });

  it('should build a transformNode descriptor from DSL (without attrs)', () => {
    const op = transformNode('para-1', 'heading');
    expect(op).toEqual({
      type: 'transformNode',
      payload: { nodeId: 'para-1', newType: 'heading', newAttrs: undefined }
    });
  });

  it('should build a transformNode descriptor for control context (without nodeId)', () => {
    const op = transformNode('heading', { level: 2 });
    expect(op).toEqual({
      type: 'transformNode',
      payload: { newType: 'heading', newAttrs: { level: 2 } }
    });
  });
});

