/**
 * Efficient ContentEditable edit handling
 * 
 * Key optimizations:
 * 1. Build Text Run Index every time to always guarantee latest info
 * 2. Calculate only changed text node position to adjust mark/decorator ranges
 * 3. Use analyzeTextChanges from text-analyzer package (LCP/LCS + Selection biasing)
 */

import { buildTextRunIndex, type ContainerRuns } from '@barocss/renderer-dom';
import { analyzeTextChanges, type TextChange } from '@barocss/text-analyzer';
import {
  findInlineTextNode,
  convertDOMToModelPosition,
  type MarkRange,
  type DecoratorRange,
  type TextEdit,
  type DOMEditPosition
} from './edit-position-converter';
import type { DataStore } from '@barocss/datastore';

/**
 * Efficient edit handling function
 * 
 * Key principles:
 * 1. MutationObserver detects changes in individual text nodes,
 *    but actual comparison should be done with sid-based full text
 * 2. One inline-text node is split into multiple text nodes due to mark/decorator
 * 3. Therefore, must combine all text nodes under sid-based hierarchy for comparison
 * 4. Normalize Selection offset based on model to find change point
 * 
 * Algorithm:
 * 1. Extract sid and get model text (oldModelText)
 * 2. Reconstruct full text from DOM by sid (newText = sum of all text nodes)
 * 3. Compare oldModelText vs newText (by sid)
 * 4. Normalize Selection offset to Model offset
 * 5. Identify edit position and adjust marks/decorators ranges
 * 
 * Text Run Index is built every time to always guarantee latest info.
 * Since number of text nodes within inline-text node is usually small,
 * performance impact is minimal, and accuracy is more important.
 * 
 * @param textNode - Changed DOM text node (only used as starting point)
 * @param oldModelText - Full text from model (sid-based, comparison target)
 * @param modelMarks - Current model's marks array
 * @param decorators - Current decorators array
 * @returns Model update info
 */
export function handleEfficientEdit(
  textNode: Text,
  oldModelText: string,
  modelMarks: MarkRange[],
  decorators: DecoratorRange[],
  dataStore?: DataStore
): {
  newText: string;
  adjustedMarks: MarkRange[];
  adjustedDecorators: DecoratorRange[];
  editInfo: TextEdit;
} | null {
  try {
    // 1. Find inline-text node (extract sid)
    const inlineTextNode = findInlineTextNode(textNode);
    if (!inlineTextNode) {
      console.warn('[handleEfficientEdit] inline-text node not found');
      return null;
    }
    
    const nodeId = inlineTextNode.getAttribute('data-bc-sid');
    if (!nodeId) {
      console.warn('[handleEfficientEdit] nodeId not found');
      return null;
    }
    
    // 2. Build Text Run Index (collect all text nodes under sid-based hierarchy)
    // buildReverseMap: needed for textNode → offset conversion
    const runs = buildTextRunIndex(inlineTextNode, nodeId, {
      buildReverseMap: true,
      normalizeWhitespace: false
    });
    
    if (!runs || runs.runs.length === 0) {
      console.warn('[handleEfficientEdit] no text runs found');
      return null;
    }
    
    // 3. Reconstruct full text from DOM by sid
    const newText = reconstructModelTextFromRuns(runs);
    
    // 4. Compare text by sid (oldModelText vs newText)
    if (newText === oldModelText) {
      return null; // No change
    }
    
    // 5. Normalize Selection offset to Model offset
    const selection = window.getSelection();
    let selectionOffset: number = 0;
    let selectionLength: number = 0;
    
    if (selection && selection.rangeCount > 0) {
      const range = selection.getRangeAt(0);
      if (range.startContainer.nodeType === Node.TEXT_NODE) {
        const domPosition: DOMEditPosition = {
          textNode: range.startContainer as Text,
          offset: range.startOffset  // DOM offset
        };
        // Convert DOM offset → Model offset
        const modelPos = convertDOMToModelPosition(domPosition, inlineTextNode);
        if (modelPos) {
          selectionOffset = modelPos.offset;  // Model offset (normalized)
        }
      }
      // Calculate selection length (0 if collapsed)
      if (!range.collapsed) {
        // Also convert range end position to Model offset
        if (range.endContainer.nodeType === Node.TEXT_NODE) {
          const endDomPosition: DOMEditPosition = {
            textNode: range.endContainer as Text,
            offset: range.endOffset
          };
          const endModelPos = convertDOMToModelPosition(endDomPosition, inlineTextNode);
          if (endModelPos) {
            selectionLength = endModelPos.offset - selectionOffset;
          }
        }
      }
    }
    
    // 6. Use text-analyzer's analyzeTextChanges (LCP/LCS + Selection biasing)
    const textChanges = analyzeTextChanges({
      oldText: oldModelText,
      newText: newText,
      selectionOffset: selectionOffset,
      selectionLength: selectionLength
    });
    
    if (textChanges.length === 0) {
      // No changes (same after Unicode normalization)
      return null;
    }
    
    // Convert first TextChange to TextEdit
    // (generally only one change occurs)
    const firstChange = textChanges[0];
    return createEditInfoFromTextChange(
      nodeId,
      oldModelText,
      newText,
      modelMarks,
      decorators,
      firstChange,
      dataStore
    );
  } catch (error) {
    console.error('[handleEfficientEdit] error:', error);
    return null;
  }
}

/**
 * Reconstruct full text from Text Run Index
 * 
 * Reconstructs by combining all text nodes under sid in order.
 * Combines multiple text nodes separated by marks/decorators into one text.
 * 
 * ⚡ Optimization: Low cost because cached runs are used
 * - Reuse already built runs
 * - Only perform textContent access (O(n) where n = number of text nodes)
 * 
 * @param runs - Text Run Index (all text node information under sid)
 * @returns Full text for sid (sum of all text nodes' textContent)
 */
function reconstructModelTextFromRuns(runs: ContainerRuns): string {
  // Reconstruct full text for sid by combining all text nodes in order
  const textParts = runs.runs.map(run => run.domTextNode.textContent || '');
  const result = textParts.join('');
  
  // Debugging: detect duplicate nodes (only warn, don't skip)
  const seenNodes = new Set<Text>();
  const duplicates: Array<{ index: number; text: string }> = [];
  
  runs.runs.forEach((run, idx) => {
    if (seenNodes.has(run.domTextNode)) {
      duplicates.push({
        index: idx,
        text: run.domTextNode.textContent?.slice(0, 20) || ''
      });
    }
    seenNodes.add(run.domTextNode);
  });
  
  if (duplicates.length > 0) {
    console.warn('[reconstructModelTextFromRuns] Duplicate text nodes detected in runs!', {
      duplicates,
      totalRuns: runs.runs.length,
      uniqueNodes: seenNodes.size,
      resultLength: result.length
    });
  }
  
  return result;
}

/**
 * Convert TextChange to TextEdit and create edit information
 * 
 * Uses text-analyzer's analyzeTextChanges result to
 * identify accurate change range and adjust marks/decorators.
 */
function createEditInfoFromTextChange(
  nodeId: string,
  oldText: string,
  newText: string,
  modelMarks: MarkRange[],
  decorators: DecoratorRange[],
  textChange: TextChange,
  dataStore?: DataStore
): {
  newText: string;
  adjustedMarks: MarkRange[];
  adjustedDecorators: DecoratorRange[];
  editInfo: TextEdit;
} {
  // Convert TextChange to TextEdit
  const editType: 'insert' | 'delete' | 'replace' = textChange.type;
  
  // Calculate insert/delete length
  let insertedLength = 0;
  let deletedLength = 0;
  
  if (editType === 'insert') {
    insertedLength = textChange.text.length;
  } else if (editType === 'delete') {
    deletedLength = textChange.end - textChange.start;
  } else if (editType === 'replace') {
    deletedLength = textChange.end - textChange.start;
    insertedLength = textChange.text.length;
  }
  
  const editInfo: TextEdit = {
    nodeId,
    oldText,
    newText,
    editPosition: textChange.start,  // Accurate start position calculated by text-analyzer
    editType,
    insertedLength,
    deletedLength,
    insertedText: textChange.text  // Text content to insert/replace
  };
  
  // Mark range adjustment is automatically handled by RangeOperations.replaceText, so not needed
  // Decorator range adjustment: use dataStore.decorators.adjustRanges
  // dataStore.decorators is always initialized in constructor, so always exists if dataStore exists
  const adjustedDecorators = dataStore?.decorators.adjustRanges(decorators, nodeId, editInfo) ?? decorators;
  
  return {
    newText,
    adjustedMarks: modelMarks, // Return original as RangeOperations.replaceText automatically adjusts
    adjustedDecorators,
    editInfo
  };
}


