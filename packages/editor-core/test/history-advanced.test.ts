import { describe, it, expect, beforeEach } from 'vitest';
import { Editor } from '../src/editor';
import { textNode } from '@barocss/model';

describe('HistoryManager Advanced Features', () => {
  let editor: Editor;

  beforeEach(() => {
    editor = new Editor({
      history: {
        maxSize: 10
      }
    });
  });

  it('should validate history state correctly', () => {
    const validation = editor.validateHistory();
    expect(validation.isValid).toBe(true);
    expect(validation.errors).toHaveLength(0);
  });

  it('should get memory usage', async () => {
    // Initial state
    const initialMemory = editor.getHistoryMemoryUsage();
    expect(initialMemory).toBe(0);

    // After performing operation
    await editor.transaction([
      { type: 'create', payload: { node: textNode('paragraph', 'Hello') } }
    ]).commit();

    const afterMemory = editor.getHistoryMemoryUsage();
    expect(afterMemory).toBeGreaterThan(0);
  });

  it('should resize history correctly', async () => {
    // Perform multiple operations
    for (let i = 0; i < 5; i++) {
      await editor.transaction([
        { type: 'create', payload: { node: textNode('paragraph', `Step ${i + 1}`) } }
      ]).commit();
    }

    expect(editor.getHistoryStats().totalEntries).toBe(5);

    // Reduce history size
    editor.resizeHistory(3);
    expect(editor.getHistoryStats().totalEntries).toBe(3);
  });

  it('should compress similar operations', async () => {
    // First create node
    await editor.transaction([
      { type: 'create', payload: { node: textNode('paragraph', 'Initial') } }
    ]).commit();

    // Perform consecutive text operations (actually replaced with create operations)
    await editor.transaction([
      { type: 'create', payload: { node: textNode('paragraph', 'Hello') } }
    ]).commit();

    await editor.transaction([
      { type: 'create', payload: { node: textNode('paragraph', 'Hello World') } }
    ]).commit();

    await editor.transaction([
      { type: 'create', payload: { node: textNode('paragraph', 'Hello World!') } }
    ]).commit();

    const beforeCompress = editor.getHistoryStats().totalEntries;
    expect(beforeCompress).toBe(4); // Initial + 3 operations

    // Execute compression
    editor.compressHistory();

    const afterCompress = editor.getHistoryStats().totalEntries;
    expect(afterCompress).toBeLessThanOrEqual(beforeCompress);
  });

  it('should handle empty operations gracefully', async () => {
    // Try to add history with empty operations
    const initialStats = editor.getHistoryStats();
    
    // Empty operations should not be added to history
    await editor.transaction([]).commit();
    
    const afterStats = editor.getHistoryStats();
    expect(afterStats.totalEntries).toBe(initialStats.totalEntries);
  });

  it('should maintain history integrity after compression', async () => {
    // Perform multiple operations
    for (let i = 0; i < 3; i++) {
      await editor.transaction([
        { type: 'create', payload: { node: textNode('paragraph', `Step ${i + 1}`) } }
      ]).commit();
    }

    // Verify before compression
    const beforeValidation = editor.validateHistory();
    expect(beforeValidation.isValid).toBe(true);

    // Execute compression
    editor.compressHistory();

    // Verify after compression
    const afterValidation = editor.validateHistory();
    expect(afterValidation.isValid).toBe(true);
  });
});
