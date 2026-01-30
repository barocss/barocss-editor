/**
 * SelectionManager that manages Selection only at the Model level
 * Completely separated from DOM, DOM ↔ Model conversion is handled in editor-view-dom.
 * 
 * This class purely manages Selection state at the Model level only,
 * and does not perform DOM manipulation or event handling.
 */

import { DataStore } from "@barocss/datastore";
import type { ModelSelection } from './types';

export interface SelectionManagerOptions {
  dataStore?: DataStore;
}

export class SelectionManager {
  private _currentSelection: ModelSelection | null = null;
  private _dataStore: any | null = null;

  constructor(options: SelectionManagerOptions = {}) {
    if (options.dataStore) {
      this._dataStore = options.dataStore;
    }
  }

  // ===== Basic Selection Management =====

  get startNodeId(): string | null {
    return this._currentSelection?.startNodeId || null;
  }

  get startOffset(): number | null {
    return this._currentSelection?.startOffset || null;
  }
  
  get endNodeId(): string | null {
    return this._currentSelection?.endNodeId || null;
  }

  get endOffset(): number | null {
    return this._currentSelection?.endOffset || null;
  }

  /**
   * Get current Selection
   */
  getCurrentSelection(): ModelSelection | null {
    return this._currentSelection;
  }

  /**
   * Set Selection
   */
  setSelection(selection: ModelSelection | null): void {
    this._currentSelection = selection;
  }

  /**
   * Clear Selection
   */
  clearSelection(): void {
    this._currentSelection = null;
  }

  // ===== Selection State Check =====

  /**
   * Check if Selection is empty
   */
  isEmpty(): boolean {
    return this._currentSelection === null;
  }

  /**
   * Check if Selection is in a specific node (anchor or focus is in that node)
   */
  isInNode(nodeId: string): boolean {
    if (!this._currentSelection) return false;
    return this._currentSelection.startNodeId === nodeId || this._currentSelection.endNodeId === nodeId;
  }

  /**
   * Check if Selection is at a specific position (collapsed)
   */
  isAtPosition(nodeId: string, position: number): boolean {
    if (!this._currentSelection) return false;
    return this._currentSelection.startNodeId === nodeId && 
           this._currentSelection.startOffset === position && 
           this._currentSelection.endNodeId === nodeId &&
           this._currentSelection.endOffset === position;
  }

  /**
   * Check if Selection is in a specific range (within a single node)
   */
  isInRange(nodeId: string, start: number, end: number): boolean {
    if (!this._currentSelection) return false;
    
    // Range check only possible within a single node
    if (this._currentSelection.startNodeId !== nodeId || this._currentSelection.endNodeId !== nodeId) {
      return false;
    }
    
    const selectionStart = Math.min(this._currentSelection.startOffset, this._currentSelection.endOffset);
    const selectionEnd = Math.max(this._currentSelection.startOffset, this._currentSelection.endOffset);
    
    return selectionStart >= start && selectionEnd <= end;
  }

  /**
   * Check if Selection overlaps with a specific range (within a single node)
   */
  overlapsWith(nodeId: string, start: number, end: number): boolean {
    if (!this._currentSelection) return false;
    
    // Overlap check only possible within a single node
    if (this._currentSelection.startNodeId !== nodeId || this._currentSelection.endNodeId !== nodeId) {
      return false;
    }
    
    const selectionStart = Math.min(this._currentSelection.startOffset, this._currentSelection.endOffset);
    const selectionEnd = Math.max(this._currentSelection.startOffset, this._currentSelection.endOffset);
    
    return !(selectionEnd <= start || selectionStart >= end);
  }

  /**
   * Get Selection length (only within a single node)
   */
  getLength(): number {
    if (!this._currentSelection) return 0;
    
    // Length calculation only possible within a single node
    if (this._currentSelection.startNodeId !== this._currentSelection.endNodeId) {
      return 0;
    }
    
    return Math.abs(this._currentSelection.endOffset - this._currentSelection.startOffset);
  }

  /**
   * Check if Selection is collapsed (anchor === focus)
   */
  isCollapsed(): boolean {
    if (!this._currentSelection) return true;
    return this._currentSelection.startNodeId === this._currentSelection.endNodeId && 
           this._currentSelection.startOffset === this._currentSelection.endOffset;
  }

  // ===== Selection Manipulation =====

  /**
   * Move Selection to a specific position (collapsed)
   */
  moveTo(nodeId: string, position: number): void {
    this._currentSelection = {
      type: 'range',
      startNodeId: nodeId,
      startOffset: position,
      endNodeId: nodeId,
      endOffset: position
    };
  }

  /**
   * Set Selection to a specific range (within a single node)
   */
  selectRange(nodeId: string, start: number, end: number): void {
    this._currentSelection = {
      type: 'range',
      startNodeId: nodeId,
      startOffset: start,
      endNodeId: nodeId,
      endOffset: end
    };
  }

  /**
   * Set Selection to a specific range (supports multiple nodes)
   */
  selectRangeMulti(startNodeId: string, startOffset: number, endNodeId: string, endOffset: number): void {
    this._currentSelection = {
      type: 'range',
      startNodeId,
      startOffset,
      endNodeId,
      endOffset
    };
  }

  /**
   * Extend Selection (move only focus)
   */
  extendTo(nodeId: string, position: number): void {
    if (!this._currentSelection) {
      this.moveTo(nodeId, position);
      return;
    }

    this._currentSelection = {
      type: 'range',
      startNodeId: this._currentSelection.startNodeId,
      startOffset: this._currentSelection.startOffset,
      endNodeId: nodeId,
      endOffset: position
    };
  }

  /**
   * Collapse Selection (anchor to focus)
   */
  collapseToStart(): void {
    if (!this._currentSelection) return;
    
    this._currentSelection = {
      type: 'range',
      startNodeId: this._currentSelection.startNodeId,
      startOffset: this._currentSelection.startOffset,
      endNodeId: this._currentSelection.startNodeId,
      endOffset: this._currentSelection.startOffset
    };
  }

  /**
   * Collapse Selection (focus to anchor)
   */
  collapseToEnd(): void {
    if (!this._currentSelection) return;
    
    this._currentSelection = {
      type: 'range',
      startNodeId: this._currentSelection.endNodeId,
      startOffset: this._currentSelection.endOffset,
      endNodeId: this._currentSelection.endNodeId,
      endOffset: this._currentSelection.endOffset
    };
  }

  // ===== Advanced Selection Features =====

  /**
   * Select entire node
   */
  selectNode(nodeId: string): void {
    // Select entire content of node (need to know text length)
    // Need to get node information from DataStore
    if (!this._dataStore) {
      throw new Error('DataStore not set');
    }
    
    const node = this._dataStore.getNode(nodeId);
    if (!node) {
      throw new Error(`Node not found: ${nodeId}`);
    }
    
    // Use text length for text nodes
    const textLength = node.text ? node.text.length : 0;
    
    this._currentSelection = {
      type: 'range',
      startNodeId: nodeId,
      startOffset: 0,
      endNodeId: nodeId,
      endOffset: textLength
    };
  }

  /**
   * Select all text (from root node)
   */
  selectAll(): void {
      if (!this._dataStore) {
      throw new Error('DataStore not set');
    }
    
    const rootNode = this._dataStore.getRootNode();
    if (!rootNode) {
      return;
    }
    
    // Select from first text node to last in root node
    const allNodes = this._dataStore.getAllNodes();
    const textNodes = allNodes.filter((node: { text?: string }) => node.text !== undefined);
    
    if (textNodes.length === 0) {
      return;
    }
    
    const firstNode = textNodes[0];
    const lastNode = textNodes[textNodes.length - 1];
    
    this._currentSelection = {
      type: 'range',
      startNodeId: firstNode.sid!,
      startOffset: 0,
      endNodeId: lastNode.sid!,
      endOffset: lastNode.text!.length
    };
  }

  /**
   * Select from current position to node start
   */
  selectToStart(): void {
    if (!this._currentSelection) return;
    
    this._currentSelection = {
      type: 'range',
      startNodeId: this._currentSelection.startNodeId,
      startOffset: 0,
      endNodeId: this._currentSelection.startNodeId,
      endOffset: this._currentSelection.startOffset
    };
  }

  /**
   * Select from current position to node end
   */
  selectToEnd(): void {
    if (!this._currentSelection || !this._dataStore) return;
    
    const node = this._dataStore.getNode(this._currentSelection.startNodeId);
    if (!node || !node.text) return;
    
    this._currentSelection = {
      type: 'range',
      startNodeId: this._currentSelection.startNodeId,
      startOffset: this._currentSelection.startOffset,
      endNodeId: this._currentSelection.startNodeId,
      endOffset: node.text.length
    };
  }

  /**
   * Move to node start
   */
  moveToStart(nodeId: string): void {
    this.moveTo(nodeId, 0);
  }

  /**
   * Move to node end
   */
  moveToEnd(nodeId: string): void {
    if (!this._dataStore) {
      throw new Error('DataStore not set');
    }
    
    const node = this._dataStore.getNode(nodeId);
    if (!node || !node.text) {
      throw new Error(`Text node not found: ${nodeId}`);
    }
    
    this.moveTo(nodeId, node.text.length);
  }

  /**
   * Move by relative position
   */
  moveBy(offset: number): void {
    if (!this._currentSelection) return;
    
    const newOffset = Math.max(0, this._currentSelection.startOffset + offset);
    this.moveTo(this._currentSelection.startNodeId, newOffset);
  }

  /**
   * Extend by relative range
   */
  extendBy(offset: number): void {
    if (!this._currentSelection) return;
    
    const newOffset = Math.max(0, this._currentSelection.endOffset + offset);
    this.extendTo(this._currentSelection.endNodeId, newOffset);
  }

  /**
   * Select word (based on current position)
   */
  selectWord(nodeId: string, position: number): void {
    if (!this._dataStore) {
      throw new Error('DataStore not set');
    }
    
    const node = this._dataStore.getNode(nodeId);
    if (!node || !node.text) {
      throw new Error(`Text node not found: ${nodeId}`);
    }
    
    const text = node.text;
    const wordRegex = /\w+/g;
    let match;
    let wordStart = -1;
    let wordEnd = -1;
    
    // Find word containing current position
    while ((match = wordRegex.exec(text)) !== null) {
      if (position >= match.index && position < match.index + match[0].length) {
        wordStart = match.index;
        wordEnd = match.index + match[0].length;
        break;
      }
    }
    
    if (wordStart !== -1 && wordEnd !== -1) {
      this.selectRange(nodeId, wordStart, wordEnd);
    } else {
      // If no word, collapse to current position
      this._currentSelection = {
      type: 'range',
        startNodeId: nodeId,
        startOffset: position,
        endNodeId: nodeId,
        endOffset: position
      };
    }
  }

  /**
   * Select line (based on current position)
   */
  selectLine(nodeId: string, position: number): void {
    if (!this._dataStore) {
      throw new Error('DataStore not set');
    }
    
    const node = this._dataStore.getNode(nodeId);
    if (!node || !node.text) {
      throw new Error(`Text node not found: ${nodeId}`);
    }
    
    const text = node.text;
    const lines = text.split('\n');
    let currentPos = 0;
    let lineStart = 0;
    let lineEnd = 0;
    
    // Find line containing current position
    for (let i = 0; i < lines.length; i++) {
      const lineLength = lines[i].length;
      lineEnd = currentPos + lineLength;
      
      if (position >= currentPos && position <= lineEnd) {
        lineStart = currentPos;
        break;
      }
      
      currentPos = lineEnd + 1; // +1 for newline character
    }
    
    this.selectRange(nodeId, lineStart, lineEnd);
  }

  // ===== Selection Transformation =====

  /**
   * Adjust Selection position after text insertion
   */
  adjustForTextInsert(nodeId: string, position: number, insertedLength: number): void {
    if (!this._currentSelection) return;

    let newAnchorOffset = this._currentSelection.startOffset;
    let newFocusOffset = this._currentSelection.endOffset;

    // If anchor is in the node and after insertion position
    if (this._currentSelection.startNodeId === nodeId && this._currentSelection.startOffset >= position) {
      newAnchorOffset = this._currentSelection.startOffset + insertedLength;
    }

    // If focus is in the node and after insertion position
    if (this._currentSelection.endNodeId === nodeId && this._currentSelection.endOffset >= position) {
      newFocusOffset = this._currentSelection.endOffset + insertedLength;
    }

    this._currentSelection = {
      type: 'range',
      startNodeId: this._currentSelection.startNodeId,
      startOffset: newAnchorOffset,
      endNodeId: this._currentSelection.endNodeId,
      endOffset: newFocusOffset
    };
  }

  /**
   * Adjust Selection position after text deletion
   */
  adjustForTextDelete(nodeId: string, startPos: number, endPos: number): void {
    if (!this._currentSelection) return;

    const deletedLength = endPos - startPos;
    let newAnchorOffset = this._currentSelection.startOffset;
    let newFocusOffset = this._currentSelection.endOffset;

    // If anchor is in the node
    if (this._currentSelection.startNodeId === nodeId) {
      if (this._currentSelection.startOffset >= endPos) {
        // If after deletion range
        newAnchorOffset = this._currentSelection.startOffset - deletedLength;
      } else if (this._currentSelection.startOffset > startPos) {
        // If within deletion range
        newAnchorOffset = startPos;
      }
    }

    // If focus is in the node
    if (this._currentSelection.endNodeId === nodeId) {
      if (this._currentSelection.endOffset >= endPos) {
        // If after deletion range
        newFocusOffset = this._currentSelection.endOffset - deletedLength;
      } else if (this._currentSelection.endOffset > startPos) {
        // If within deletion range
        newFocusOffset = startPos;
      }
    }

    this._currentSelection = {
      type: 'range',
      startNodeId: this._currentSelection.startNodeId,
      startOffset: newAnchorOffset,
      endNodeId: this._currentSelection.endNodeId,
      endOffset: newFocusOffset
    };
  }

  /**
   * Adjust Selection position after node split
   */
  adjustForNodeSplit(nodeId: string, splitPosition: number): void {
    if (!this._currentSelection) return;

    // If anchor is in the node, move to split point
    if (this._currentSelection.startNodeId === nodeId) {
      this._currentSelection = {
      type: 'range',
        startNodeId: nodeId,
        startOffset: splitPosition,
        endNodeId: nodeId,
        endOffset: splitPosition
      };
    }
  }

  // ===== Utility Methods =====

  /**
   * Check if Selection is fully contained within a specific node
   */
  isFullyInNode(nodeId: string): boolean {
    if (!this._currentSelection) return false;
    return this._currentSelection.startNodeId === nodeId && this._currentSelection.endNodeId === nodeId;
  }

  /**
   * Check if Selection overlaps with a specific node
   */
  overlapsWithNode(nodeId: string): boolean {
    if (!this._currentSelection) return false;
    return this._currentSelection.startNodeId === nodeId || this._currentSelection.endNodeId === nodeId;
  }

  /**
   * Get Selection start position
   */
  getStartPosition(): { nodeId: string; offset: number } | null {
    if (!this._currentSelection) return null;
    
    const isReversed = this._currentSelection.startOffset > this._currentSelection.endOffset ||
                      (this._currentSelection.startOffset === this._currentSelection.endOffset && 
                       this._currentSelection.startNodeId > this._currentSelection.endNodeId);
    
    return {
      nodeId: isReversed ? this._currentSelection.endNodeId : this._currentSelection.startNodeId,
      offset: isReversed ? this._currentSelection.endOffset : this._currentSelection.startOffset
    };
  }

  /**
   * Get Selection end position
   */
  getEndPosition(): { nodeId: string; offset: number } | null {
    if (!this._currentSelection) return null;
    
    const isReversed = this._currentSelection.startOffset > this._currentSelection.endOffset ||
                      (this._currentSelection.startOffset === this._currentSelection.endOffset && 
                       this._currentSelection.startNodeId > this._currentSelection.endNodeId);
    
    return {
      nodeId: isReversed ? this._currentSelection.startNodeId : this._currentSelection.endNodeId,
      offset: isReversed ? this._currentSelection.startOffset : this._currentSelection.endOffset
    };
  }

  /**
   * Check if Selection is reversed (anchor is after focus)
   */
  isReversed(): boolean {
    if (!this._currentSelection) return false;
    
    return this._currentSelection.startOffset > this._currentSelection.endOffset ||
           (this._currentSelection.startOffset === this._currentSelection.endOffset && 
            this._currentSelection.startNodeId > this._currentSelection.endNodeId);
  }

  /**
   * Normalize Selection (anchor always comes before focus)
   */
  normalize(): void {
    if (!this._currentSelection) return;
    
    if (this.isReversed()) {
      this._currentSelection = {
      type: 'range',
        startNodeId: this._currentSelection.endNodeId,
        startOffset: this._currentSelection.endOffset,
        endNodeId: this._currentSelection.startNodeId,
        endOffset: this._currentSelection.startOffset
      };
    }
  }

  /**
   * Get Selection text content (only within a single node)
   */
  getSelectedText(): string | null {
    if (!this._currentSelection || !this._dataStore) return null;
    
    // Text return only possible within a single node
    if (this._currentSelection.startNodeId !== this._currentSelection.endNodeId) {
      return null;
    }
    
    const node = this._dataStore.getNode(this._currentSelection.startNodeId);
    if (!node || !node.text) return null;
    
    const start = Math.min(this._currentSelection.startOffset, this._currentSelection.endOffset);
    const end = Math.max(this._currentSelection.startOffset, this._currentSelection.endOffset);
    
    return node.text.substring(start, end);
  }

  // ===== DataStore Configuration =====

  /**
   * Set DataStore
   */
  setDataStore(dataStore: any): void {
    this._dataStore = dataStore;
  }

  /**
   * Set range selection (alias for setSelection with range)
   */
  setRange(rangeSelection: ModelSelection | null): void {
    this.setSelection(rangeSelection);
  }

  /**
   * Set node selection
   */
  setNode(nodeSelection: { type: 'node'; nodeId?: string; startNodeId?: string } | null): void {
    if (!nodeSelection) {
      this.setSelection(null);
      return;
    }
    const nodeId = nodeSelection.nodeId ?? nodeSelection.startNodeId;
    if (!nodeId) {
      this.setSelection(null);
      return;
    }
    this.setSelection({
      type: 'node',
      startNodeId: nodeId,
      startOffset: 0,
      endNodeId: nodeId,
      endOffset: 0
    });
  }

  /**
   * Set selection by absolute position (alias for setSelection)
   */
  setAbsolutePos(absoluteSelection: ModelSelection | null): void {
    this.setSelection(absoluteSelection);
  }

  /**
   * Set contentEditable element (no-op in model-only SelectionManager; DOM handled in editor-view-dom)
   */
  setContentEditableElement(_element: HTMLElement | null): void {
    // Model-only: DOM selection sync is handled by EditorViewDOM
  }

  /**
   * Whether current selection is inside contentEditable (model-only: true when selection exists)
   */
  isSelectionInContentEditable(): boolean {
    return !this.isEmpty();
  }

  /**
   * Clean up (clear selection; no DOM listeners in model-only)
   */
  destroy(): void {
    this.clearSelection();
  }

  /**
   * Clone current SelectionManager and return a new SelectionManager.
   * @returns new SelectionManager
   */
  clone(): SelectionManager {
    const newSelectionManager = new SelectionManager({
      dataStore: this._dataStore
    });

    const currentSelection = this._currentSelection;
    if (currentSelection) {
      newSelectionManager.setSelection(currentSelection);
    }

    return newSelectionManager;
  }
}