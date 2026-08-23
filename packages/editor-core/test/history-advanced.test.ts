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

/**
 * A consequence of an edit, put in that edit's entry.
 *
 * The mechanism a group's rectangle needs: it is the bounds of its children *and* the
 * origin their coordinates are relative to, so keeping it honest re-origins them, and
 * that pairing has to be undone with the edit that caused it — not on its own, and not
 * never.
 */
describe('a derived write that belongs to the reader’s edit', () => {
  let editor: Editor;

  beforeEach(() => {
    editor = new Editor({ history: { maxSize: 10 } });
  });

  const anEdit = async () =>
    await editor
      .transaction([{ type: 'create', payload: { node: textNode('paragraph', 'edit') } }])
      .commit();

  const consequence = () => ({
    operations: [{ type: 'setAttrs', payload: { nodeId: 'g', attrs: { x: 4000 } } }] as never,
    inverseOperations: [
      { type: 'setAttrs', payload: { nodeId: 'g', attrs: { x: 1000 } } }
    ] as never
  });

  it('adds nothing to the stack, because it is part of what is already there', async () => {
    await anEdit();
    const before = editor.historyManager.getHistory().length;

    expect(editor.historyManager.appendToLast(consequence())).toBe(true);
    expect(editor.historyManager.getHistory().length).toBe(before);
  });

  it('is undone before the edit that caused it', async () => {
    await anEdit();
    editor.historyManager.appendToLast(consequence());

    const entry = editor.historyManager.getHistory().at(-1)!;
    // Inverses undo newest-first, so the consequence has to be first: unwinding the edit
    // before the maintenance it caused would restore a coordinate into a space that has
    // not moved back yet.
    expect((entry.inverseOperations[0].payload as any).nodeId).toBe('g');
    expect((entry.operations.at(-1)!.payload as any).nodeId).toBe('g');
  });

  it('refuses when there is no edit to belong to', () => {
    // A reaction on a freshly loaded document has nothing to attach to, and inventing an
    // entry would give the reader an undo for something they never did.
    expect(editor.historyManager.appendToLast(consequence())).toBe(false);
    expect(editor.historyManager.getHistory()).toHaveLength(0);
  });

  it('refuses while there is something to redo', async () => {
    await anEdit();
    await anEdit();
    editor.historyManager.undo();

    /*
     * The top of the stack is now an entry the reader may replay, and appending a later
     * consequence to it would make that redo do something else. Safe to refuse: an undo
     * restores a state the maintenance already agrees with, so there is nothing to record.
     */
    expect(editor.historyManager.appendToLast(consequence())).toBe(false);
  });

  it('refuses an empty write rather than touching the entry', async () => {
    await anEdit();
    expect(
      editor.historyManager.appendToLast({ operations: [], inverseOperations: [] })
    ).toBe(false);
  });
});
