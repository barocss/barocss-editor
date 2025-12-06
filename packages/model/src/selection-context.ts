import type { ModelSelection } from '@barocss/editor-core';

/**
 * SelectionContext - Context class for managing Selection within transactions
 * 
 * Each operation directly updates context.selection.current to
 * calculate the final selectionAfter
 */
export class SelectionContext {
  // Snapshot at transaction start
  public readonly before: ModelSelection | null;
  // Current value updated by operations (final SelectionAfter)
  public current: ModelSelection | null;

  constructor(before: ModelSelection | null) {
    this.before = before;
    this.current = before ? { ...before } : null;
  }

  /**
   * Set entire Selection
   */
  setSelection(next: ModelSelection): void {
    if (this.current) {
      Object.assign(this.current, next);
    } else {
      // Create new if current is null
      this.current = { ...next };
    }
  }

  /**
   * Set single caret (cursor)
   */
  setCaret(nodeId: string, offset: number): void {
    if (this.current) {
      this.current.type = 'range';
      this.current.startNodeId = nodeId;
      this.current.startOffset = offset;
      this.current.endNodeId = nodeId;
      this.current.endOffset = offset;
      this.current.collapsed = true;
      this.current.direction = 'none';
    } else {
      // Create new if current is null
      this.current = {
        type: 'range',
        startNodeId: nodeId,
        startOffset: offset,
        endNodeId: nodeId,
        endOffset: offset,
        collapsed: true,
        direction: 'none'
      };
    }
  }

  /**
   * Set range selection
   */
  setRange(startId: string, startOff: number, endId: string, endOff: number): void {
    if (this.current) {
      this.current.type = 'range';
      this.current.startNodeId = startId;
      this.current.startOffset = startOff;
      this.current.endNodeId = endId;
      this.current.endOffset = endOff;
      this.current.collapsed = startId === endId && startOff === endOff;
      this.current.direction = 'forward';
    } else {
      // Create new if current is null
      this.current = {
        type: 'range',
        startNodeId: startId,
        startOffset: startOff,
        endNodeId: endId,
        endOffset: endOff,
        collapsed: startId === endId && startOff === endOff,
        direction: 'forward'
      };
    }
  }

  /**
   * Clear Selection
   */
  clear(): void {
    this.current = null;
  }
}

