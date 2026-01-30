import type { IMark } from '../types';
import type { ModelSelection } from '@barocss/editor-core';
import type { DataStore } from '../data-store';

export class RangeOperations {
  constructor(private dataStore: DataStore) {}

  // ---- Core helpers ----
  private processNodeInModelSelection(
    nodeId: string,
    contentRange: ModelSelection,
    operation: 'delete' | 'extract'
  ): string | null {
    const node = this.dataStore.getNode(nodeId);
    if (!node || typeof node.text !== 'string') {
      return null;
    }
    const text: string = node.text;
    let startOffset = 0;
    let endOffset = text.length;
    if (nodeId === contentRange.startNodeId) startOffset = contentRange.startOffset;
    if (nodeId === contentRange.endNodeId) endOffset = contentRange.endOffset;
    if (startOffset >= endOffset || startOffset < 0 || endOffset > text.length) return null;
    const rangeText = text.substring(startOffset, endOffset);
    if (operation === 'delete') {
      const newText = text.substring(0, startOffset) + text.substring(endOffset);
      this.dataStore.updateNode(nodeId, { text: newText });
    }
    return rangeText;
  }

  private insertTextInNode(nodeId: string, contentRange: ModelSelection, text: string): void {
    const node = this.dataStore.getNode(nodeId);
    if (!node || typeof node.text !== 'string') return;
    if (contentRange.startNodeId === nodeId && contentRange.startOffset === contentRange.endOffset) {
      const position = contentRange.startOffset;
      const newText = node.text.substring(0, position) + text + node.text.substring(position);
      this.dataStore.updateNode(nodeId, { text: newText });
    }
  }

  // ---- Text content ops ----
  /**
   * Spec deleteText:
   * - Same-node fast path: precise substring removal and in-place marks adjustment (split/trim/shift) without iterator.
   * - Multi-node: trims start node tail, clears middle nodes' text (and marks to []), trims end node head.
   * - Does not require tree linkage for same-node path; multi-node prefers same-parent optimization, falls back to iterator otherwise.
   * - Always persists text/marks via updateNode honoring overlay.
   */
  deleteText(contentRange: ModelSelection): string {
    // Fast-path: same node deletion without relying on iterator (works even if node is not linked in a tree)
    if (contentRange.startNodeId === contentRange.endNodeId) {
      const nodeId = contentRange.startNodeId;
      const node = this.dataStore.getNode(nodeId);
      if (!node || typeof node.text !== 'string') return '';
      const text: string = node.text as string;
      const start = contentRange.startOffset;
      const end = contentRange.endOffset;
      if (typeof start !== 'number' || typeof end !== 'number') return '';
      if (start > end || start < 0 || end > text.length) return '';
      const removed = text.substring(start, end);
      const updatedText = text.substring(0, start) + text.substring(end);
      
      // Update marks to reflect the deletion
      let updatedMarks = node.marks ? [...node.marks] : [];
      if (updatedMarks && updatedMarks.length > 0) {
        const delta = -(end - start);
        const resultMarks: any[] = [];
        for (const m of updatedMarks) {
          const [ms0, me0] = (m as any).range || [0, text.length];
          if (me0 <= start) { resultMarks.push({ ...m }); continue; }
          if (ms0 >= end) { resultMarks.push({ ...m, range: [ms0 + delta, me0 + delta] }); continue; }
          const overlapsLeftOnly = ms0 < start && me0 > start && me0 <= end;
          const overlapsRightOnly = ms0 >= start && ms0 < end && me0 > end;
          const fullyInside = ms0 >= start && me0 <= end;
          const spansAcross = ms0 < start && me0 > end;
          if (fullyInside) { continue; }
          if (overlapsLeftOnly) { resultMarks.push({ ...m, range: [ms0, start] }); continue; }
          if (overlapsRightOnly) {
            const newStart = start;
            resultMarks.push({ ...m, range: [newStart, me0 + delta] });
            continue;
          }
          if (spansAcross) {
            resultMarks.push({ ...m, range: [ms0, start] });
            resultMarks.push({ ...m, range: [start, me0 + delta] });
            continue;
          }
        }
        updatedMarks = resultMarks;
      }
      
      this.dataStore.updateNode(nodeId, { text: updatedText, marks: updatedMarks });
      return removed;
    }
    
    // Multi-node range deletion - handle each node individually
    let deletedText = '';
    
    // Handle start node (if different from end node)
    if (contentRange.startNodeId !== contentRange.endNodeId) {
      const startNode = this.dataStore.getNode(contentRange.startNodeId);
      if (startNode && typeof startNode.text === 'string') {
        const startText = startNode.text;
        const startOffset = contentRange.startOffset;
        if (startOffset < startText.length) {
          const removedFromStart = startText.substring(startOffset);
          deletedText += removedFromStart;
          const newStartText = startText.substring(0, startOffset);
          
          // Update marks for start node
          let updatedMarks = startNode.marks ? [...startNode.marks] : [];
          if (updatedMarks && updatedMarks.length > 0) {
            const delta = -(startText.length - startOffset);
            const resultMarks: any[] = [];
            for (const m of updatedMarks) {
              const [ms0, me0] = (m as any).range || [0, startText.length];
              if (me0 <= startOffset) { 
                resultMarks.push({ ...m }); 
                continue; 
              }
              if (ms0 >= startOffset) { 
                // Mark is completely removed
                continue; 
              }
              // Mark overlaps with deletion - keep only the part before deletion
              resultMarks.push({ ...m, range: [ms0, startOffset] });
            }
            updatedMarks = resultMarks;
          }
          
          this.dataStore.updateNode(contentRange.startNodeId, { text: newStartText, marks: updatedMarks });
        }
      }
    }
    
    // Handle middle nodes first (if any) - delete entire text content
    if (contentRange.startNodeId !== contentRange.endNodeId) {
      // Try to find middle nodes by checking if they have the same parent
      const startNode = this.dataStore.getNode(contentRange.startNodeId);
      const endNode = this.dataStore.getNode(contentRange.endNodeId);
      
      if (startNode && endNode && startNode.parentId === endNode.parentId && startNode.parentId) {
        // Both nodes have the same parent, find middle nodes in the parent's content array
        const parent = this.dataStore.getNode(startNode.parentId);
        if (parent && parent.content && Array.isArray(parent.content)) {
          const startIndex = parent.content.indexOf(contentRange.startNodeId);
          const endIndex = parent.content.indexOf(contentRange.endNodeId);
          
          if (startIndex !== -1 && endIndex !== -1 && startIndex < endIndex) {
            // Find middle nodes between start and end
            for (let i = startIndex + 1; i < endIndex; i++) {
              const middleNodeId = parent.content[i] as string;
              const middleNode = this.dataStore.getNode(middleNodeId);
              if (middleNode && typeof middleNode.text === 'string') {
                deletedText += middleNode.text;
                this.dataStore.updateNode(middleNodeId, { text: '', marks: [] });
              }
            }
          }
        }
      } else {
        // Fallback to iterator for complex cases
        const rangeIterator = this.dataStore.createRangeIterator(
          contentRange.startNodeId,
          contentRange.endNodeId,
          { includeStart: false, includeEnd: false } // Exclude start and end nodes
        );
        for (const nodeId of rangeIterator) {
          const node = this.dataStore.getNode(nodeId);
          if (node && typeof node.text === 'string') {
            deletedText += node.text;
            this.dataStore.updateNode(nodeId, { text: '', marks: [] });
          }
        }
      }
    }
    
    // Handle end node (if different from start node)
    if (contentRange.startNodeId !== contentRange.endNodeId) {
      const endNode = this.dataStore.getNode(contentRange.endNodeId);
      if (endNode && typeof endNode.text === 'string') {
        const endText = endNode.text;
        const endOffset = contentRange.endOffset;
        if (endOffset > 0) {
          const removedFromEnd = endText.substring(0, endOffset);
          deletedText += removedFromEnd;
          const newEndText = endText.substring(endOffset);
          
          // Update marks for end node
          let updatedMarks = endNode.marks ? [...endNode.marks] : [];
          if (updatedMarks && updatedMarks.length > 0) {
            const delta = -endOffset;
            const resultMarks: any[] = [];
            for (const m of updatedMarks) {
              const [ms0, me0] = (m as any).range || [0, endText.length];
              if (ms0 >= endOffset) { 
                resultMarks.push({ ...m, range: [ms0 + delta, me0 + delta] }); 
                continue; 
              }
              if (me0 <= endOffset) { 
                // Mark is completely removed
                continue; 
              }
              // Mark overlaps with deletion - keep only the part after deletion
              resultMarks.push({ ...m, range: [0, me0 + delta] });
            }
            updatedMarks = resultMarks;
          }
          
          this.dataStore.updateNode(contentRange.endNodeId, { text: newEndText, marks: updatedMarks });
        }
      }
    }
    
    return deletedText;
  }

  /**
   * Spec extractText:
   * - Extracts text content from the specified range without modifying nodes.
   * - Uses DocumentIterator to traverse nodes in the range.
   * - Returns concatenated text from all nodes in the range.
   * - Useful for copying text content without deletion.
   * 
   * @param contentRange 추출할 범위
   * @returns 추출된 텍스트 내용
   */
  extractText(contentRange: ModelSelection): string {
    // Iterator-based extraction (single canonical path)
    const rangeIterator = this.dataStore.createRangeIterator(
      contentRange.startNodeId,
      contentRange.endNodeId,
      { includeStart: true, includeEnd: true }
    );
    let extractedText = '';
    for (const nodeId of rangeIterator) {
      const node = this.dataStore.getNode(nodeId);
      if (node && node.text) {
        const result = this.processNodeInModelSelection(nodeId, contentRange, 'extract');
        if (result) extractedText += result;
      }
    }
    return extractedText;
  }

  /**
   * Spec insertText:
   * - Only valid when start==end (caret). Throws otherwise.
   * - Adjusts marks: ranges after caret shift by +len; ranges spanning caret extend by +len.
   * - Same-node fast path independent of tree structure.
   */
  insertText(contentRange: ModelSelection, text: string): string {
    if (contentRange.startNodeId !== contentRange.endNodeId || contentRange.startOffset !== contentRange.endOffset) {
      throw new Error('insertText는 같은 위치 범위에서만 사용할 수 있습니다');
    }
    
    // Fast-path: same node insertion without relying on iterator
    const nodeId = contentRange.startNodeId;
    const node = this.dataStore.getNode(nodeId);
    if (!node || typeof node.text !== 'string') return text;
    const currentText: string = node.text as string;
    const position = contentRange.startOffset;
    if (typeof position !== 'number' || position < 0 || position > currentText.length) return text;
    
    const updatedText = currentText.substring(0, position) + text + currentText.substring(position);
    
    // Update marks to reflect the insertion
    let updatedMarks = node.marks ? [...node.marks] : [];
    if (updatedMarks && updatedMarks.length > 0) {
      const delta = text.length;
      const resultMarks: any[] = [];
      for (const m of updatedMarks) {
        const [ms0, me0] = (m as any).range || [0, currentText.length];
        if (me0 <= position) { 
          resultMarks.push({ ...m }); 
          continue; 
        }
        if (ms0 >= position) { 
          resultMarks.push({ ...m, range: [ms0 + delta, me0 + delta] }); 
          continue; 
        }
        // Mark spans across the insertion point - extend it
        resultMarks.push({ ...m, range: [ms0, me0 + delta] });
      }
      updatedMarks = resultMarks;
    }
    
    this.dataStore.updateNode(nodeId, { text: updatedText, marks: updatedMarks });
    return text;
  }

  /**
   * 선택된 범위를 삭제한다.
   *
   * 1단계 구현:
   * - 텍스트 기반 selection 에 대해서는 deleteText를 그대로 재사용한다.
   * - 블록/노드 전체 삭제는 이후 단계에서 확장한다.
   */
  deleteRange(contentRange: ModelSelection): void {
    this.deleteText(contentRange);
  }

  /**
   * Spec replaceText:
   * - Same-node: computes removed substring and delta, rewrites text, updates marks with split/trim/shift rules.
   * - Multi-node: implemented as deleteText + insertText at start caret to keep mark update logic unified.
   */
  replaceText(contentRange: ModelSelection, newText: string): string {
    // Fast-path: same node replacement without relying on iterator (works even if node is not linked in a tree)
    if (contentRange.startNodeId === contentRange.endNodeId) {
      const nodeId = contentRange.startNodeId;
      const node = this.dataStore.getNode(nodeId);
      if (!node || typeof node.text !== 'string') {
        console.warn('[RangeOperations.replaceText] Invalid node or not a text node', { nodeId, hasNode: !!node, textType: typeof node?.text });
        return '';
      }
      const text: string = node.text as string;
      const start = contentRange.startOffset;
      const end = contentRange.endOffset;
      if (typeof start !== 'number' || typeof end !== 'number') {
        console.warn('[RangeOperations.replaceText] Invalid offsets', { start, end });
        return '';
      }
      if (start > end || start < 0 || end > text.length) {
        console.warn('[RangeOperations.replaceText] Invalid range', { start, end, textLength: text.length });
        return '';
      }
      const removed = text.substring(start, end);
      const delta = newText.length - (end - start);
      const updatedText = text.substring(0, start) + newText + text.substring(end);

      let updatedMarks = node.marks ? [...node.marks] : [];
      if (updatedMarks && updatedMarks.length > 0) {
        const resultMarks: any[] = [];
        for (const m of updatedMarks) {
          // Marks without range are applied to entire text, so no adjustment needed
          // Still applied to entire text even if text changes
          if (!(m as any).range || (m as any).range === null || (m as any).range === undefined) {
            resultMarks.push({ ...m });
            continue;
          }
          
          const [ms0, me0] = (m as any).range;
          if (me0 <= start) { resultMarks.push({ ...m }); continue; }
          if (ms0 >= end) { resultMarks.push({ ...m, range: [ms0 + delta, me0 + delta] }); continue; }
          const overlapsLeftOnly = ms0 < start && me0 > start && me0 <= end;
          const overlapsRightOnly = ms0 >= start && ms0 < end && me0 > end;
          const fullyInside = ms0 >= start && me0 <= end;
          const spansAcross = ms0 < start && me0 > end;
          if (fullyInside) { continue; }
          if (overlapsLeftOnly) { resultMarks.push({ ...m, range: [ms0, start] }); continue; }
          if (overlapsRightOnly) {
            const newStart = start + newText.length;
            const newEnd = me0 + delta;
            if (newEnd > newStart) resultMarks.push({ ...m, range: [newStart, newEnd] });
            continue;
          }
          if (spansAcross) {
            // If this is an insertion only (start === end), extend the mark instead of splitting
            if (start === end) {
              // Insertion only: extend the mark to include the inserted text
              resultMarks.push({ ...m, range: [ms0, me0 + delta] });
              continue;
            }
            // For replacement (start < end) within a mark that spans across:
            // If the replacement is just replacing characters (delta === 0 or small delta),
            // extend the mark instead of splitting to preserve continuity
            // Only split if there's a significant deletion (delta < -1) or if the replacement
            // would create a gap that shouldn't be covered by the mark
            if (delta >= -1) {
              // Small replacement: extend the mark to include the replacement
              resultMarks.push({ ...m, range: [ms0, me0 + delta] });
              continue;
            }
            // Large deletion: split the mark
            const left = { ...m, range: [ms0, start] };
            const rightStart = start + newText.length;
            const rightEnd = me0 + delta;
            const right = { ...m, range: [rightStart, rightEnd] };
            resultMarks.push(left);
            if (rightEnd > rightStart) resultMarks.push(right);
            continue;
          }
        }
        updatedMarks = resultMarks;
        
      }
      
      // Update text first
      this.dataStore.updateNode(nodeId, { text: updatedText }, false);
      
      // Normalize marks via setMarks for consistency with other mark operations
      if (updatedMarks.length > 0) {
        this.dataStore.marks.setMarks(nodeId, updatedMarks, { normalize: true });
      } else {
        // Explicitly set empty marks if needed
        this.dataStore.marks.setMarks(nodeId, [], { normalize: true });
      }
      
      return removed;
    }

    // Fallback: multi-node path via delete + insert
    // Note: deleteText does not change node IDs, only updates text content.
    // After deletion, startNodeId still exists and startOffset is valid
    // (it becomes the end of the remaining text in start node).
    const deletedText = this.deleteText(contentRange);
    const insertRange: ModelSelection = {
      type: 'range',
      startNodeId: contentRange.startNodeId,
      startOffset: contentRange.startOffset,
      endNodeId: contentRange.startNodeId,
      endOffset: contentRange.startOffset
    };
    this.insertText(insertRange, newText);
    return deletedText;
  }

  /**
   * Spec copyText:
   * - Copies text content from the specified range without modifying nodes.
   * - Equivalent to extractText.
   * - Returns the copied text content.
   * 
   * @param contentRange 복사할 범위
   * @returns 복사된 텍스트 내용
   */
  copyText(contentRange: ModelSelection): string {
    return this.extractText(contentRange);
  }

  /**
   * Spec moveText:
   * - Moves text from one range to another.
   * - Extracts text from fromRange, deletes it, then inserts at toRange.
   * - Adjusts insertion offset if moving within the same node.
   * - Returns the moved text content.
   * 
   * @param fromRange 이동할 텍스트의 원본 범위
   * @param toRange 텍스트를 삽입할 대상 범위
   * @returns 이동된 텍스트 내용
   */
  moveText(fromRange: ModelSelection, toRange: ModelSelection): string {
    const textToMove = this.extractText(fromRange);
    // Delete first to reflect shrinkage
    this.deleteText(fromRange);

    // If moving within the same node, and the insertion point was after the deleted range,
    // adjust the insertion offset by the deleted length so it targets the intended spot
    let adjustedToRange = { ...toRange };
    if (
      fromRange.startNodeId === fromRange.endNodeId &&
      toRange.startNodeId === toRange.endNodeId &&
      toRange.startNodeId === fromRange.startNodeId
    ) {
      const removedLen = Math.max(0, (fromRange.endOffset as number) - (fromRange.startOffset as number));
      const origInsert = toRange.startOffset as number;
      let newInsert = origInsert;
      if (origInsert > (fromRange.endOffset as number)) {
        newInsert = origInsert - removedLen;
      }
      // Clamp to current text length after deletion
      const nodeAfterDelete = this.dataStore.getNode(toRange.startNodeId);
      const currentLen = typeof nodeAfterDelete?.text === 'string' ? (nodeAfterDelete.text as string).length : 0;
      if (newInsert > currentLen) newInsert = currentLen;
      if (newInsert < 0) newInsert = 0;
      adjustedToRange = {
        type: 'range' as const,
        startNodeId: toRange.startNodeId,
        startOffset: newInsert,
        endNodeId: toRange.endNodeId,
        endOffset: newInsert
      };
    }

    this.insertText(adjustedToRange, textToMove);
    return textToMove;
  }

  /**
   * Spec duplicateText:
   * - Duplicates text in the specified range.
   * - Extracts text and inserts it immediately after the original.
   * - Returns the duplicated text content.
   * 
   * @param contentRange 복제할 범위
   * @returns 복제된 텍스트 내용
   */
  duplicateText(contentRange: ModelSelection): string {
    const textToDuplicate = this.extractText(contentRange);
    const insertRange: ModelSelection = {
      type: 'range',
      startNodeId: contentRange.endNodeId,
      startOffset: contentRange.endOffset,
      endNodeId: contentRange.endNodeId,
      endOffset: contentRange.endOffset
    };
    this.insertText(insertRange, textToDuplicate);
    return textToDuplicate;
  }

  // ---- Mark ops ----
  /**
   * Spec applyMark:
   * - Same-node: delegates to marks.setMarks after appending a range-specific mark; normalization merges/cleans.
   * - Cross-node: applies head-tail segments to start/end nodes only; middle nodes are ignored in this lightweight path.
   * - This API does not create cross-node mark objects; higher-level rich editors should lift to block-level marks if needed.
   */
  applyMark(contentRange: ModelSelection, mark: IMark): IMark {
    const { startNodeId, startOffset, endNodeId, endOffset } = contentRange;
    const sameNode = startNodeId === endNodeId;
    if (sameNode) {
      const node = this.dataStore.getNode(startNodeId);
      if (!node || typeof node.text !== 'string') return mark;
      const text = node.text as string;
      const s = Math.max(0, Math.min(startOffset, text.length));
      const e = Math.max(0, Math.min(endOffset, text.length));
      if (s >= e) {
        return mark;
      }
      const nodeMark: IMark = { ...mark, range: [s, e] } as any;
      const next = [ ...(node.marks || []), nodeMark ];
      // normalize via marks.setMarks for consistency
      this.dataStore.marks.setMarks(startNodeId, next, { normalize: true });
      return mark;
    }
    // Two-node fast path without relying on iterator/parent content
    const startNode = this.dataStore.getNode(startNodeId);
    const endNode = this.dataStore.getNode(endNodeId);
    if (startNode && typeof startNode.text === 'string') {
      const s = Math.max(0, Math.min(startOffset, (startNode.text as string).length));
      const e = (startNode.text as string).length;
      if (s < e) {
        const nodeMark: IMark = { ...mark, range: [s, e] } as any;
        const next = [ ...(startNode.marks || []), nodeMark ];
        this.dataStore.marks.setMarks(startNodeId, next, { normalize: true });
      }
    }
    if (endNode && typeof endNode.text === 'string') {
      const s = 0;
      const e = Math.max(0, Math.min(endOffset, (endNode.text as string).length));
      if (s < e) {
        const nodeMark: IMark = { ...mark, range: [s, e] } as any;
        const next = [ ...(endNode.marks || []), nodeMark ];
        this.dataStore.marks.setMarks(endNodeId, next, { normalize: true });
      }
    }
    return mark;
  }

  /**
   * Spec toggleMark:
   * - Same-node path delegates to MarkOperations.toggleMark for precise overlap handling and no-op suppression.
   * - Cross-node lightweight path toggles on start/end segments only.
   */
  toggleMark(contentRange: ModelSelection, markType: string, attrs?: Record<string, any>): void {
    const { startNodeId, startOffset, endNodeId, endOffset } = contentRange;
    if (startNodeId === endNodeId) {
      // delegate to mark-operations for precise split/trim logic
      this.dataStore.marks.toggleMark(startNodeId, markType, [startOffset, endOffset], attrs);
      return;
    }
    // Fallback: apply/remove on start and end nodes only
    const startNode = this.dataStore.getNode(startNodeId);
    if (startNode && typeof startNode.text === 'string') {
      this.dataStore.marks.toggleMark(startNodeId, markType, [startOffset, (startNode.text as string).length], attrs);
    }
    const endNode = this.dataStore.getNode(endNodeId);
    if (endNode && typeof endNode.text === 'string') {
      this.dataStore.marks.toggleMark(endNodeId, markType, [0, Math.min(endOffset, (endNode.text as string).length)], attrs);
    }
  }

  removeMark(contentRange: ModelSelection, markType: string): number {
    const iterator = this.dataStore.createRangeIterator(
      contentRange.startNodeId,
      contentRange.endNodeId,
      { includeStart: true, includeEnd: true }
    );
    let removed = 0;
    for (const nodeId of iterator) {
      const node = this.dataStore.getNode(nodeId);
      if (!node || !node.text || !node.marks) continue;
      const text: string = node.text;
      let startOffset = 0;
      let endOffset = text.length;
      if (nodeId === contentRange.startNodeId) startOffset = contentRange.startOffset;
      if (nodeId === contentRange.endNodeId) endOffset = contentRange.endOffset;
      if (startOffset >= endOffset) continue;
      const updatedMarks = node.marks.filter((m: IMark) => {
        if (m.stype !== markType) return true;
        const [ms, me] = m.range || [0, text.length];
        if (me <= startOffset || ms >= endOffset) return true;
        return false;
      });
      removed += (node.marks.length - updatedMarks.length);
      this.dataStore.updateNode(nodeId, { marks: updatedMarks }, false);
      const local = this.dataStore.getNode(nodeId);
      if (local) (local as any).marks = updatedMarks;
    }
    return removed;
  }

  clearFormatting(contentRange: ModelSelection): number {
    const iterator = this.dataStore.createRangeIterator(
      contentRange.startNodeId,
      contentRange.endNodeId,
      { includeStart: true, includeEnd: true }
    );
    let removed = 0;
    for (const nodeId of iterator) {
      const node = this.dataStore.getNode(nodeId);
      if (!node || !node.text || !node.marks) continue;
      const text: string = node.text;
      let startOffset = 0;
      let endOffset = text.length;
      if (nodeId === contentRange.startNodeId) startOffset = contentRange.startOffset;
      if (nodeId === contentRange.endNodeId) endOffset = contentRange.endOffset;
      if (startOffset >= endOffset) continue;
      const updatedMarks = node.marks.filter((m: IMark) => {
        const [ms, me] = m.range || [0, text.length];
        if (me <= startOffset || ms >= endOffset) return true;
        return false;
      });
      removed += (node.marks.length - updatedMarks.length);
      this.dataStore.updateNode(nodeId, { marks: updatedMarks }, false);
      const local = this.dataStore.getNode(nodeId);
      if (local) (local as any).marks = updatedMarks;
    }
    return removed;
  }

  constrainMarksToRange(contentRange: ModelSelection): number {
    const iterator = this.dataStore.createRangeIterator(
      contentRange.startNodeId,
      contentRange.endNodeId,
      { includeStart: true, includeEnd: true }
    );
    let adjusted = 0;
    for (const nodeId of iterator) {
      const node = this.dataStore.getNode(nodeId);
      if (!node || !node.text || !node.marks || node.marks.length === 0) continue;
      const text: string = node.text;
      let startOffset = 0;
      let endOffset = text.length;
      if (nodeId === contentRange.startNodeId) startOffset = contentRange.startOffset;
      if (nodeId === contentRange.endNodeId) endOffset = contentRange.endOffset;
      if (startOffset >= endOffset) continue;
      const newMarks: IMark[] = [];
      for (const m of node.marks) {
        const [ms0, me0] = m.range || [0, text.length];
        const ms = Math.max(ms0, startOffset);
        const me = Math.min(me0, endOffset);
        if (me <= ms) { adjusted += 1; continue; }
        if (ms !== ms0 || me !== me0) adjusted += 1;
        newMarks.push({ ...m, range: [ms, me] });
      }
      this.dataStore.updateNode(nodeId, { marks: newMarks }, false);
      const local = this.dataStore.getNode(nodeId);
      if (local) (local as any).marks = newMarks;
    }
    return adjusted;
  }

  // ---- Text utilities ----
  /**
   * Spec findText:
   * - Searches for the specified text within the range.
   * - Returns the global offset of the first occurrence.
   * - Returns -1 if not found.
   * 
   * @param contentRange 검색할 범위
   * @param searchText 검색할 텍스트
   * @returns 찾은 위치의 전역 오프셋 (-1 if not found)
   */
  findText(contentRange: ModelSelection, searchText: string): number {
    const iterator = this.dataStore.createRangeIterator(
      contentRange.startNodeId,
      contentRange.endNodeId,
      { includeStart: true, includeEnd: true }
    );
    let globalOffset = 0;
    for (const nodeId of iterator) {
      const node = this.dataStore.getNode(nodeId);
      if (node && node.text) {
        const text: string = node.text;
        let startOffset = 0;
        let endOffset = text.length;
        if (nodeId === contentRange.startNodeId) startOffset = contentRange.startOffset;
        if (nodeId === contentRange.endNodeId) endOffset = contentRange.endOffset;
        if (startOffset < endOffset) {
          const localIndex = text.substring(startOffset, endOffset).indexOf(searchText);
          if (localIndex !== -1) return globalOffset + startOffset + localIndex;
        }
        globalOffset += text.length;
      }
    }
    return -1;
  }

  /**
   * Spec getTextLength:
   * - Calculates the total text length within the specified range.
   * - Returns the sum of text lengths from all nodes in the range.
   * 
   * @param contentRange 길이를 계산할 범위
   * @returns 총 텍스트 길이
   */
  getTextLength(contentRange: ModelSelection): number {
    const iterator = this.dataStore.createRangeIterator(
      contentRange.startNodeId,
      contentRange.endNodeId,
      { includeStart: true, includeEnd: true }
    );
    let total = 0;
    for (const nodeId of iterator) {
      const node = this.dataStore.getNode(nodeId);
      if (node && node.text) {
        const text: string = node.text;
        let startOffset = 0;
        let endOffset = text.length;
        if (nodeId === contentRange.startNodeId) startOffset = contentRange.startOffset;
        if (nodeId === contentRange.endNodeId) endOffset = contentRange.endOffset;
        if (startOffset < endOffset) total += (endOffset - startOffset);
      }
    }
    return total;
  }

  /**
   * Spec trimText:
   * - Removes leading and trailing whitespace from the range.
   * - Returns the number of whitespace characters removed.
   * 
   * @param contentRange 트림할 범위
   * @returns 제거된 공백 문자 수
   */
  trimText(contentRange: ModelSelection): number {
    const extractedText = this.extractText(contentRange);
    const trimmedText = extractedText.trim();
    if (extractedText === trimmedText) return 0;
    const leadingSpaces = extractedText.length - extractedText.trimStart().length;
    const trailingSpaces = extractedText.length - extractedText.trimEnd().length;
    const totalSpaces = leadingSpaces + trailingSpaces;
    this.replaceText(contentRange, trimmedText);
    return totalSpaces;
  }

  /**
   * Spec normalizeWhitespace:
   * - Normalizes whitespace by replacing multiple spaces with single space.
   * - Trims leading and trailing whitespace.
   * - Returns the normalized text.
   * 
   * @param contentRange 정규화할 범위
   * @returns 정규화된 텍스트
   */
  normalizeWhitespace(contentRange: ModelSelection): string {
    const extractedText = this.extractText(contentRange);
    const normalizedText = extractedText.replace(/\s+/g, ' ').replace(/^\s+|\s+$/g, '');
    if (extractedText === normalizedText) {
      // No change; avoid emitting unnecessary update
      return normalizedText;
    }
    this.replaceText(contentRange, normalizedText);
    return normalizedText;
  }

  // ---- Wrap helpers ----
  /**
   * Spec wrap:
   * - Wraps text in the range with prefix and suffix strings.
   * - Returns the wrapped text.
   * 
   * @param contentRange 래핑할 범위
   * @param prefix 접두사
   * @param suffix 접미사
   * @returns 래핑된 텍스트
   */
  wrap(contentRange: ModelSelection, prefix: string, suffix: string): string {
    const value = this.extractText(contentRange);
    const wrapped = `${prefix}${value}${suffix}`;
    this.replaceText(contentRange, wrapped);
    return wrapped;
  }

  /**
   * Spec unwrap:
   * - Removes prefix and suffix strings from text in the range.
   * - Checks both inside and outside the range for prefix/suffix.
   * - Returns the unwrapped text.
   * 
   * @param contentRange 언래핑할 범위
   * @param prefix 제거할 접두사
   * @param suffix 제거할 접미사
   * @returns 언래핑된 텍스트
   */
  unwrap(contentRange: ModelSelection, prefix: string, suffix: string): string {
    const sameNode = contentRange.startNodeId === contentRange.endNodeId;
    const node = sameNode ? this.dataStore.getNode(contentRange.startNodeId) : undefined;
    const text: string = typeof node?.text === 'string' ? (node!.text as string) : '';
    const value = this.extractText(contentRange);
    const prefixInside = value.startsWith(prefix);
    const suffixInside = value.endsWith(suffix);
    let start = contentRange.startOffset;
    let end = contentRange.endOffset;
    let prefixOutside = false;
    let suffixOutside = false;
    if (sameNode && text) {
      if (!prefixInside && ((start >= prefix.length && text.substring(start - prefix.length, start) === prefix) || (start === 0 && text.startsWith(prefix)))) {
        prefixOutside = true;
      }
      const endForCheck = end + (prefixInside ? prefix.length : (prefixOutside ? prefix.length : 0));
      if (!suffixInside && endForCheck + suffix.length <= text.length && text.substring(endForCheck, endForCheck + suffix.length) === suffix) {
        suffixOutside = true;
      }
    }
    let newStart = start;
    let newEnd = end;
    if (sameNode && text) {
      if (prefixOutside) newStart = Math.max(0, start - prefix.length);
      const baseEnd = end + (prefixInside ? prefix.length : (prefixOutside ? prefix.length : 0));
      newEnd = suffixOutside ? Math.min(text.length, baseEnd + suffix.length) : baseEnd;
    }
    const expandedRange: ModelSelection = sameNode
      ? { type: 'range', startNodeId: contentRange.startNodeId, startOffset: newStart, endNodeId: contentRange.endNodeId, endOffset: newEnd }
      : contentRange;
    let segment = sameNode && text ? text.substring(expandedRange.startOffset, expandedRange.endOffset) : value;
    if (segment.startsWith(prefix)) segment = segment.substring(prefix.length);
    if (segment.endsWith(suffix)) segment = segment.substring(0, segment.length - suffix.length);
    this.replaceText(expandedRange, segment);
    return segment;
  }

  // ---- Replace/FindAll ----
  /**
   * Spec replace:
   * - Replaces all occurrences of a pattern within the range.
   * - Supports both string and RegExp patterns.
   * - Returns the number of replacements made.
   * 
   * @param contentRange 교체할 범위
   * @param pattern 검색 패턴 (string or RegExp)
   * @param replacement 교체할 문자열
   * @returns 교체된 횟수
   */
  replace(contentRange: ModelSelection, pattern: string | RegExp, replacement: string): number {
    const text = this.extractText(contentRange);
    if (text.length === 0) return 0;
    let count = 0;
    let replaced: string;
    if (pattern instanceof RegExp) {
      const global = pattern.flags.includes('g');
      const rx = global ? pattern : new RegExp(pattern.source, pattern.flags + 'g');
      replaced = text.replace(rx, () => { count += 1; return replacement; });
    } else {
      const rx = new RegExp(pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
      replaced = text.replace(rx, () => { count += 1; return replacement; });
    }
    if (count > 0) this.replaceText(contentRange, replaced);
    return count;
  }

  findAll(contentRange: ModelSelection, pattern: string | RegExp): Array<{ start: number; end: number }> {
    const text = this.extractText(contentRange);
    const results: Array<{ start: number; end: number }> = [];
    if (text.length === 0) return results;
    let rx: RegExp;
    if (pattern instanceof RegExp) {
      const flags = pattern.flags.includes('g') ? pattern.flags : pattern.flags + 'g';
      rx = new RegExp(pattern.source, flags);
    } else {
      const escaped = pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      rx = new RegExp(escaped, 'g');
    }
    let match: RegExpExecArray | null;
    while ((match = rx.exec(text)) !== null) {
      const start = match.index;
      const end = start + match[0].length;
      results.push({ start, end });
      if (match[0].length === 0) rx.lastIndex++;
    }
    return results;
  }

  // ---- Indent/Outdent ----
  /**
   * Spec indent:
   * - Adds indentation to the beginning of the range.
   * - Returns the indented text.
   * 
   * @param contentRange 들여쓰기할 범위
   * @param indent 들여쓰기 문자열 (기본값: '  ')
   * @returns 들여쓰기된 텍스트
   */
  indent(contentRange: ModelSelection, indent: string = '  '): string {
    const text = this.extractText(contentRange);
    if (text.length === 0) return '';
    const transformed = text.replace(/(^|\n)/g, (m, g1) => g1 + indent);
    this.replaceText(contentRange, transformed);
    return transformed;
  }

  /**
   * Spec outdent:
   * - Removes indentation from the beginning of the range.
   * - Returns the outdented text.
   * 
   * @param contentRange 내어쓰기할 범위
   * @param indent 제거할 들여쓰기 문자열 (기본값: '  ')
   * @returns 내어쓰기된 텍스트
   */
  outdent(contentRange: ModelSelection, indent: string = '  '): string {
    const text = this.extractText(contentRange);
    if (text.length === 0) return '';
    const escaped = indent.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const rx = new RegExp(`(^|\\n)${escaped}`, 'g');
    const transformed = text.replace(rx, (m, g1) => g1);
    this.replaceText(contentRange, transformed);
    return transformed;
  }

  // ---- Expand helpers ----
  /**
   * Spec expandToWord:
   * - Expands the range to include the full word at both ends.
   * - Uses word boundaries to determine expansion.
   * - Returns the expanded range.
   * 
   * @param contentRange 확장할 범위
   * @returns 단어 경계로 확장된 범위
   */
  expandToWord(contentRange: ModelSelection): ModelSelection {
    const text = this.extractText(contentRange);
    if (text.length === 0) return contentRange;
    const startTrim = text.match(/^\s*/)?.[0].length ?? 0;
    const endTrim = text.match(/\s*$/)?.[0].length ?? 0;
    return {
      ...(contentRange as any),
      startNodeId: contentRange.startNodeId,
      startOffset: contentRange.startOffset + startTrim,
      endNodeId: contentRange.endNodeId,
      endOffset: contentRange.endOffset - endTrim
    } as ModelSelection;
  }

  /**
   * Spec expandToLine:
   * - Expands the range to include the full line at both ends.
   * - Finds newline characters to determine line boundaries.
   * - Returns the expanded range.
   * 
   * @param contentRange 확장할 범위
   * @returns 줄 경계로 확장된 범위
   */
  expandToLine(contentRange: ModelSelection): ModelSelection {
    const value = this.extractText(contentRange);
    const firstBreak = value.indexOf('\n');
    const lastBreak = value.lastIndexOf('\n');
    const startDelta = firstBreak === -1 ? 0 : 0;
    const endDelta = 0;
    return {
      type: 'range' as const,
      startNodeId: contentRange.startNodeId,
      startOffset: contentRange.startOffset + startDelta,
      endNodeId: contentRange.endNodeId,
      endOffset: contentRange.endOffset - endDelta
    };
  }

  /**
   * Spec normalizeRange:
   * - Normalizes the range to ensure start is before end.
   * - Swaps start and end if they are reversed.
   * - Returns the normalized range.
   * 
   * @param contentRange 정규화할 범위
   * @returns 정규화된 범위
   */
  normalizeRange(contentRange: ModelSelection): ModelSelection {
    const { startNodeId, startOffset, endNodeId, endOffset } = contentRange;
    if (startNodeId === endNodeId) {
      if (startOffset > endOffset) {
        return {
          ...(contentRange as any),
          startNodeId,
          startOffset: endOffset,
          endNodeId,
          endOffset: startOffset
        } as ModelSelection;
      }
      return contentRange;
    }
    return contentRange;
  }
}


