import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { HistoryManager } from '../src/history-manager';

/**
 * Consecutive typing must collapse into one undo step. Without this, Ctrl+Z
 * walks back one character at a time, which is unusable in a document editor.
 */
describe('history coalescing', () => {
  let now = 1_000_000;

  beforeEach(() => {
    now = 1_000_000;
    vi.useFakeTimers();
    vi.setSystemTime(now);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const advance = (ms: number) => {
    now += ms;
    vi.setSystemTime(now);
  };

  const typing = (nodeId: string, from: number, to: number) => ({
    operations: [{ type: 'replaceText', payload: { nodeId, start: from, end: from } }],
    inverseOperations: [{ type: 'replaceText', payload: { nodeId, start: from, end: to } }],
    metadata: {
      selectionBefore: { startNodeId: nodeId, startOffset: from } as any,
      selectionAfter: { startNodeId: nodeId, startOffset: to } as any
    }
  });

  it('merges consecutive keystrokes in the same node into one step', () => {
    const h = new HistoryManager();
    h.push(typing('t1', 0, 1));
    advance(50);
    h.push(typing('t1', 1, 2));
    advance(50);
    h.push(typing('t1', 2, 3));

    expect(h.getStats().totalEntries).toBe(1);
  });

  it('keeps the inverse operations in undo order', () => {
    const h = new HistoryManager();
    h.push(typing('t1', 0, 1));
    advance(50);
    h.push(typing('t1', 1, 2));

    const entry = h.undo()!;
    // Newest edit is undone first
    expect(entry.inverseOperations[0].payload.start).toBe(1);
    expect(entry.inverseOperations[1].payload.start).toBe(0);
  });

  it('restores the caret to where the burst started', () => {
    const h = new HistoryManager();
    h.push(typing('t1', 0, 1));
    advance(50);
    h.push(typing('t1', 1, 2));

    expect(h.undo()!.metadata!.selectionBefore).toMatchObject({ startOffset: 0 });
  });

  it('starts a new step after the time window lapses', () => {
    const h = new HistoryManager({ coalesceMs: 500 });
    h.push(typing('t1', 0, 1));
    advance(900);
    h.push(typing('t1', 1, 2));

    expect(h.getStats().totalEntries).toBe(2);
  });

  it('starts a new step when the caret jumped between edits', () => {
    const h = new HistoryManager();
    h.push(typing('t1', 5, 6));
    advance(50);
    // User clicked elsewhere in the same node before typing again
    h.push(typing('t1', 0, 1));

    expect(h.getStats().totalEntries).toBe(2);
  });

  it('starts a new step when typing moves to another node', () => {
    const h = new HistoryManager();
    h.push(typing('t1', 0, 1));
    advance(50);
    h.push(typing('t2', 0, 1));

    expect(h.getStats().totalEntries).toBe(2);
  });

  it('never merges a structural change into a typing burst', () => {
    const h = new HistoryManager();
    h.push(typing('t1', 0, 1));
    advance(50);
    h.push({
      operations: [{ type: 'splitBlockNode', payload: { nodeId: 't1' } }],
      inverseOperations: [{ type: 'mergeBlockNodes', payload: {} }]
    } as any);
    advance(50);
    h.push(typing('t1', 0, 1));

    expect(h.getStats().totalEntries).toBe(3);
  });

  it('closeGroup() forces the next edit to start a new step', () => {
    const h = new HistoryManager();
    h.push(typing('t1', 0, 1));
    h.closeGroup();
    advance(10);
    h.push(typing('t1', 1, 2));

    expect(h.getStats().totalEntries).toBe(2);
  });

  it('coalesceMs: 0 disables merging entirely', () => {
    const h = new HistoryManager({ coalesceMs: 0 });
    h.push(typing('t1', 0, 1));
    advance(10);
    h.push(typing('t1', 1, 2));

    expect(h.getStats().totalEntries).toBe(2);
  });

  it('a merged step redoes every keystroke it absorbed', () => {
    const h = new HistoryManager();
    h.push(typing('t1', 0, 1));
    advance(50);
    h.push(typing('t1', 1, 2));

    h.undo();
    const entry = h.redo()!;
    expect(entry.operations).toHaveLength(2);
  });
});
