/**
 * DOM → Model sync case classifier
 * 
 * Analyzes DOM changes detected by MutationObserver
 * and classifies them into C1/C2/C3/C4 cases, determining appropriate DataStore operations.
 * 
 * Reference documents:
 * - `dom-to-model-sync-cases.md`: Detailed case definitions
 * - `input-handling-implementation-guide.md`: Implementation guide
 */

import { Editor } from '@barocss/editor-core';
import type { ModelSelection } from '@barocss/editor-core';
import { reconstructModelTextFromDOM, extractModelTextFromRange } from '../utils/edit-position-converter';

/**
 * DOM change case type
 */
export type DomChangeCase = 
  | 'C1'  // Pure text change within single inline-text
  | 'C2'  // Text change across multiple inline-text
  | 'C3'  // Block structure change
  | 'C4'  // Mark/style/decorator change
  | 'C4_AUTO_CORRECT'  // Auto correct
  | 'C4_AUTO_LINK'     // Auto link
  | 'C4_DND'           // Drag and drop
  | 'IME_INTERMEDIATE' // IME composition intermediate state
  | 'UNKNOWN';          // Unknown change

/**
 * Classification result
 */
export interface ClassifiedChange {
  case: DomChangeCase;
  nodeId?: string;  // Changed model node ID (for C1, C2)
  contentRange?: ModelSelection;  // Text change range (for C1, C2)
  prevText?: string;  // Text before change (for C1, C2)
  newText?: string;   // Text after change (for C1, C2)
  insertedText?: string;  // Inserted text
  deletedLength?: number;  // Deleted length
  editPosition?: number;   // Edit position
  mutations: MutationRecord[];  // Original mutations
  metadata?: Record<string, any>;  // Additional case-specific info
}

/**
 * Insert Range hint collected at beforeinput stage
 * - Includes input type, target ModelSelection, input text (optional), timestamp.
 * - Used to correct contentRange calculation in C1/C2.
 */
export interface InputHint {
  inputType: string;
  contentRange: ModelSelection;
  text?: string;
  timestamp: number;
}

/**
 * DOM change classification options
 */
export interface ClassifyOptions {
  editor: Editor;
  selection?: Selection;  // Current DOM selection
  modelSelection?: ModelSelection;  // Converted model selection (optional)
  inputHint?: InputHint;  // Insert Range hint collected from beforeinput (optional)
  isComposing?: boolean;   // Whether IME is composing
}

/**
 * Classify DOM changes by case
 * 
 * @param mutations Changes detected by MutationObserver
 * @param options Classification options
 * @returns Classification result
 */
export function classifyDomChange(
  mutations: MutationRecord[],
  options: ClassifyOptions
): ClassifiedChange {
  console.log('[DomChangeClassifier] classifyDomChange: CALLED', {
    mutationsCount: mutations.length,
    isComposing: options.isComposing
  });

  // Handle empty mutations
  if (mutations.length === 0) {
    console.log('[DomChangeClassifier] classifyDomChange: EMPTY mutations');
    return {
      case: 'UNKNOWN',
      mutations: []
    };
  }

  // NOTE: text changes are handled as C1/C2 regardless of isComposing
  // only selection needs to be accurate (IME intermediate state is also reflected in model)

  // C1: Pure text change within single inline-text
  const c1Result = classifyC1(mutations, options);
  if (c1Result) {
    console.log('[DomChangeClassifier] classifyDomChange: C1 detected', c1Result);
    return c1Result;
  }

  // C2: Text change across multiple inline-text
  const c2Result = classifyC2(mutations, options);
  if (c2Result) {
    console.log('[DomChangeClassifier] classifyDomChange: C2 detected', c2Result);
    return c2Result;
  }

  // C3: Block structure change
  const c3Result = classifyC3(mutations, options);
  if (c3Result) {
    console.log('[DomChangeClassifier] classifyDomChange: C3 detected', c3Result);
    return c3Result;
  }

  // C4: Mark/style/decorator change
  const c4Result = classifyC4(mutations, options);
  if (c4Result) {
    console.log('[DomChangeClassifier] classifyDomChange: C4 detected', c4Result);
    return c4Result;
  }

  // Unknown change
  console.warn('[DomChangeClassifier] classifyDomChange: UNKNOWN', { mutations });
  return {
    case: 'UNKNOWN',
    mutations
  };
}

/**
 * C1: Classify pure text change within single inline-text
 * 
 * Detection criteria:
 * - Only text changed within a single inline-text node
 * - Ignore mark wrapper / style / childList, compare only sid-based full text
 * - No addition/deletion of block-level elements (p, div, li, etc.)
 */
function classifyC1(
  mutations: MutationRecord[],
  options: ClassifyOptions
): ClassifiedChange | null {
  console.log('[DomChangeClassifier] classifyC1: CHECKING');

  // 1. For all mutations, find closest inline-text node.
  //    - Don't distinguish characterData/childList/attributes, only look by sid.
  for (const mutation of mutations) {
    const target = mutation.target;
    const inlineTextNode = findClosestInlineTextNode(target);
    if (!inlineTextNode) {
      // Couldn't find inline-text in this mutation, so move to next mutation
      continue;
    }

    const nodeId = inlineTextNode.getAttribute('data-bc-sid');
    if (!nodeId) {
      continue;
    }

    // Check model node
    const modelNode = options.editor.dataStore?.getNode?.(nodeId);
    if (!modelNode || modelNode.stype !== 'inline-text') {
      console.log('[DomChangeClassifier] classifyC1: SKIP - not inline-text node', { nodeId, stype: modelNode?.stype });
      continue;
    }

    // 2. Lightly filter if block-level structure changes are mixed in
    if (mutation.type === 'childList') {
      const addedOrRemovedNodes = [
        ...Array.from(mutation.addedNodes || []),
        ...Array.from(mutation.removedNodes || [])
      ];
      const hasBlockLikeElement = addedOrRemovedNodes.some(n => {
        if (n.nodeType !== Node.ELEMENT_NODE) return false;
        const el = n as Element;
        const tag = el.tagName.toLowerCase();
        return ['p', 'div', 'li', 'ul', 'ol', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote'].includes(tag);
      });
      if (hasBlockLikeElement) {
        // If block structure is mixed in, it's a C3 candidate, not C1, so skip
        console.log('[DomChangeClassifier] classifyC1: SKIP - block-like element in childList');
        continue;
      }
    }

    // 3. Get prevText from model (sid-based full text)
    const prevText = modelNode.text || '';
    
    // 4. Reconstruct newText from DOM (sid-based full text)
    //    May be split into multiple text nodes due to mark/decorator, so combine all by sid.
    const newText = reconstructModelTextFromDOM(inlineTextNode);

    console.log('[DomChangeClassifier] classifyC1: FOUND', {
      nodeId,
      prevText,
      newText,
      prevTextLength: prevText.length,
      newTextLength: newText.length
    });

    // 5. Calculate contentRange
    //    - Use if InputHint exists
    //    - Otherwise, calculate accurate range with analyzeTextChanges in handleC1
    let startOffset: number | undefined = undefined;
    let endOffset: number | undefined = undefined;
    let usedInputHint = false;

    // Correct if Insert Range hint collected from beforeinput exists
    const hint = options.inputHint;
    if (hint && hint.contentRange.startNodeId === nodeId && hint.contentRange.endNodeId === nodeId) {
      const hintedStart = Math.max(0, Math.min(prevText.length, hint.contentRange.startOffset));
      const hintedEnd = Math.max(hintedStart, Math.min(prevText.length, hint.contentRange.endOffset));
      startOffset = hintedStart;
      endOffset = hintedEnd;
      usedInputHint = true;

      console.log('[DomChangeClassifier] classifyC1: using InputHint for contentRange', {
        hintedStart,
        hintedEnd,
        inputType: hint.inputType
      });
    } else {
      // If InputHint is missing, don't set contentRange
      // Calculate accurate range using analyzeTextChanges in handleC1
      console.log('[DomChangeClassifier] classifyC1: no InputHint, contentRange will be calculated by analyzeTextChanges');
    }

    return {
      case: 'C1',
      nodeId,
      prevText,
      newText,
      // Set contentRange only when InputHint exists, undefined otherwise
      contentRange: startOffset !== undefined && endOffset !== undefined ? {
        startNodeId: nodeId,
        startOffset,
        endNodeId: nodeId,
        endOffset
      } : undefined,
      mutations: [mutation],
      metadata: usedInputHint ? { usedInputHint: true } : undefined
    };
  }

  return null;
}

/**
 * C2: Classify text change across multiple inline-text
 * 
 * Detection criteria:
 * - childList + characterData pattern in consecutive inline area
 * - Generate selection-based contentRange + flattened newText
 */
function classifyC2(
  mutations: MutationRecord[],
  options: ClassifyOptions
): ClassifiedChange | null {
  console.log('[DomChangeClassifier] classifyC2: CHECKING');

  // Check if childList and characterData are present together
  const hasChildList = mutations.some(m => m.type === 'childList');
  const hasCharacterData = mutations.some(m => m.type === 'characterData');

  if (!hasChildList || !hasCharacterData) {
    console.log('[DomChangeClassifier] classifyC2: SKIP - no childList+characterData');
    return null;
  }

  // Selection is needed (to know range across multiple nodes)
  if (!options.selection || options.selection.rangeCount === 0) {
    console.log('[DomChangeClassifier] classifyC2: SKIP - no selection');
    return null;
  }

  const range = options.selection.getRangeAt(0);
  
  // Find inline-text from selection's start/end nodes
  const startInlineText = findClosestInlineTextNode(range.startContainer);
  const endInlineText = findClosestInlineTextNode(range.endContainer);

  if (!startInlineText || !endInlineText) {
    console.log('[DomChangeClassifier] classifyC2: SKIP - no inline-text nodes found');
    return null;
  }

  const startNodeId = startInlineText.getAttribute('data-bc-sid');
  const endNodeId = endInlineText.getAttribute('data-bc-sid');

  if (!startNodeId || !endNodeId) {
    console.log('[DomChangeClassifier] classifyC2: SKIP - no sid attributes');
    return null;
  }

  // Check model nodes
  const startModelNode = options.editor.dataStore?.getNode?.(startNodeId);
  const endModelNode = options.editor.dataStore?.getNode?.(endNodeId);

  if (!startModelNode || !endModelNode || 
      startModelNode.stype !== 'inline-text' || endModelNode.stype !== 'inline-text') {
    console.log('[DomChangeClassifier] classifyC2: SKIP - not inline-text nodes', {
      startStype: startModelNode?.stype,
      endStype: endModelNode?.stype
    });
    return null;
  }

  // If same node, handle as C1
  if (startNodeId === endNodeId) {
    console.log('[DomChangeClassifier] classifyC2: SKIP - same node (should be C1)');
    return null;
  }

  // Check if block-level change exists (may be C3)
  const hasBlockLevelChange = mutations.some(m => {
    if (m.type !== 'childList') return false;
    const target = m.target as Element;
    const sid = target.getAttribute('data-bc-sid');
    if (!sid) return false;
    const modelNode = options.editor.dataStore?.getNode?.(sid);
    if (!modelNode) return false;
    const blockTypes = ['paragraph', 'heading', 'list', 'list-item', 'blockquote', 'code-block'];
    return blockTypes.includes(modelNode.stype);
  });

  if (hasBlockLevelChange) {
    console.log('[DomChangeClassifier] classifyC2: SKIP - has block-level change (should be C3)');
    return null;
  }

  // Extract flattened text from selection range
  // Extract DOM selection range and make it a single string
  const flatText = extractFlatTextFromSelection(range);
  
  // Extract previous text from model (selection range)
  // Extract model text for range across multiple nodes
  let prevText = '';
  if (options.editor.dataStore) {
    // contentRange is calculated later, so use startNodeId and endNodeId temporarily
    const tempRange = {
      startNodeId,
      startOffset: 0, // Temporary, will update with accurate offset later
      endNodeId,
      endOffset: endModelNode.text?.length || 0 // Temporary
    };
    prevText = extractModelTextFromRange(options.editor.dataStore, tempRange);
  }
  
  // fallback: if extraction fails, use only first node's text
  if (!prevText) {
    prevText = startModelNode.text || '';
  }

  console.log('[DomChangeClassifier] classifyC2: FOUND', {
    startNodeId,
    endNodeId,
    prevTextLength: prevText.length,
    flatTextLength: flatText.length,
    flatTextPreview: flatText.slice(0, 50)
  });

  // Calculate contentRange
  // Priority 1: InputHint, Priority 2: model selection, Priority 3: DOM selection-based calculation
  let startOffset = 0;
  let endOffset = 0;
  let usedInputHint = false;

  const hint = options.inputHint;
  if (hint &&
      hint.contentRange.startNodeId === startNodeId &&
      hint.contentRange.endNodeId === endNodeId) {
    // Use InputHint first
    startOffset = hint.contentRange.startOffset;
    endOffset = hint.contentRange.endOffset;
    usedInputHint = true;

    console.log('[DomChangeClassifier] classifyC2: using InputHint for offsets', {
      inputType: hint.inputType,
      startOffset,
      endOffset
    });
  } else if (options.modelSelection) {
    // Calculate accurate offset using model selection
    if (options.modelSelection.startNodeId === startNodeId) {
      startOffset = options.modelSelection.startOffset;
    } else {
      // If start node is different, start from 0
      startOffset = 0;
    }
    
    if (options.modelSelection.endNodeId === endNodeId) {
      endOffset = options.modelSelection.endOffset;
    } else {
      // If end node is different, use full length of end node
      endOffset = endModelNode.text?.length || 0;
    }
    
    console.log('[DomChangeClassifier] classifyC2: using model selection for offsets', {
      modelSelection: options.modelSelection,
      calculatedOffsets: { startOffset, endOffset }
    });
  } else {
    // Calculate offset based on DOM selection (fallback)
    // 
    // TODO: Need logic to accurately convert DOM offset to model offset
    // 
    // Current limitations:
    // - Accurate conversion only possible within single node (use convertDOMOffsetToModelOffset)
    // - Accurate conversion difficult for ranges across multiple nodes
    // 
    // Future improvement direction:
    // 1. Convert range.startContainer and range.endContainer to inline-text nodes respectively
    // 2. Use convertDOMOffsetToModelOffset within each node
    // 3. Sum text lengths of intermediate nodes to calculate accurate offset
    // 
    // Currently use 0 and end node length simply (inaccurate but fallback)
    startOffset = 0;
    endOffset = endModelNode.text?.length || 0;
    
    console.log('[DomChangeClassifier] classifyC2: using DOM selection (less accurate - fallback)', {
      startNodeId,
      endNodeId,
      startOffset,
      endOffset,
      note: 'DOM offset to model offset conversion for multi-node ranges not yet implemented'
    });
  }
  
  // Recalculate prevText (using accurate offset)
  if (options.editor.dataStore && startOffset !== undefined && endOffset !== undefined) {
    const accurateRange = {
      startNodeId,
      startOffset,
      endNodeId,
      endOffset
    };
    const recalculatedPrevText = extractModelTextFromRange(options.editor.dataStore, accurateRange);
    if (recalculatedPrevText) {
      prevText = recalculatedPrevText;
    }
  }

  return {
    case: 'C2',
    nodeId: startNodeId, // Primary node (can be extended later)
    prevText,
    newText: flatText,
    contentRange: {
      startNodeId,
      startOffset,
      endNodeId,
      endOffset
    },
    mutations,
    metadata: {
      multiNode: true,
      startNodeId,
      endNodeId,
      usedModelSelection: !!options.modelSelection,
      usedInputHint: usedInputHint || undefined
    }
  };
}

/**
 * DOM selection 범위에서 평탄화된 텍스트 추출
 */
function extractFlatTextFromSelection(range: Range): string {
  const contents = range.cloneContents();
  const textNodes: Text[] = [];
  const walker = document.createTreeWalker(
    contents,
    NodeFilter.SHOW_TEXT,
    null
  );

  let node;
  while (node = walker.nextNode()) {
    textNodes.push(node as Text);
  }

  return textNodes.map(tn => tn.textContent || '').join('');
}

/**
 * C3: 블록 구조 변경 분류
 * 
 * 감지 기준:
 * - block-level childList 변화 패턴
 * - insertParagraph/mergeBlock 등 command로 매핑 가능한지 여부 포함
 * 
 * 참고: 원칙적으로 beforeinput에서 처리하지만,
 * 브라우저/플랫폼 차이로 beforeinput이 오지 않은 경우를 대비
 */
function classifyC3(
  mutations: MutationRecord[],
  options: ClassifyOptions
): ClassifiedChange | null {
  console.log('[DomChangeClassifier] classifyC3: CHECKING');

  // Check for block-level childList changes
  const blockLevelMutations: MutationRecord[] = [];
  
  for (const mutation of mutations) {
    if (mutation.type !== 'childList') continue;
    
    // Check if it's a childList change of block node
    const target = mutation.target as Element;
    const sid = target.getAttribute('data-bc-sid');
    if (!sid) continue;

    const modelNode = options.editor.dataStore?.getNode?.(sid);
    if (!modelNode) continue;

    // Check if block type (paragraph, heading, list, etc.)
    const blockTypes = ['paragraph', 'heading', 'list', 'list-item', 'blockquote', 'code-block'];
    if (blockTypes.includes(modelNode.stype)) {
      blockLevelMutations.push(mutation);
    }
  }

  if (blockLevelMutations.length === 0) {
    console.log('[DomChangeClassifier] classifyC3: SKIP - no block-level change');
    return null;
  }

  // Analyze structure change pattern
  // e.g., whether paragraph was split into two, merged, etc.
  const pattern = analyzeBlockStructureChange(blockLevelMutations, options);
  
  if (!pattern) {
    console.log('[DomChangeClassifier] classifyC3: SKIP - cannot analyze pattern');
    return null;
  }

  console.log('[DomChangeClassifier] classifyC3: FOUND', {
    pattern: pattern.type,
    affectedNodes: pattern.affectedNodeIds
  });

  return {
    case: 'C3',
    mutations: blockLevelMutations,
    metadata: {
      pattern: pattern.type,
      affectedNodeIds: pattern.affectedNodeIds,
      command: pattern.command // Possible command (e.g., 'insertParagraph', 'mergeBlock')
    }
  };
}

/**
 * Block structure change pattern analysis
 */
interface BlockStructurePattern {
  type: 'split' | 'merge' | 'insert' | 'delete' | 'unknown';
  affectedNodeIds: string[];
  command?: string; // Possible command
}

function analyzeBlockStructureChange(
  mutations: MutationRecord[],
  options: ClassifyOptions
): BlockStructurePattern | null {
  // Simple pattern analysis
  // TODO: Need to implement more sophisticated pattern analysis
  
  for (const mutation of mutations) {
    const addedNodes = Array.from(mutation.addedNodes);
    const removedNodes = Array.from(mutation.removedNodes);
    
    // Check if block node was added
    const addedBlocks = addedNodes.filter(node => {
      if (node.nodeType !== Node.ELEMENT_NODE) return false;
      const el = node as Element;
      const sid = el.getAttribute('data-bc-sid');
      if (!sid) return false;
      const modelNode = options.editor.dataStore?.getNode?.(sid);
      if (!modelNode) return false;
      const blockTypes = ['paragraph', 'heading', 'list', 'list-item', 'blockquote', 'code-block'];
      return blockTypes.includes(modelNode.stype);
    });

    // Check if block node was removed
    const removedBlocks = removedNodes.filter(node => {
      if (node.nodeType !== Node.ELEMENT_NODE) return false;
      const el = node as Element;
      const sid = el.getAttribute('data-bc-sid');
      if (!sid) return false;
      const modelNode = options.editor.dataStore?.getNode?.(sid);
      if (!modelNode) return false;
      const blockTypes = ['paragraph', 'heading', 'list', 'list-item', 'blockquote', 'code-block'];
      return blockTypes.includes(modelNode.stype);
    });

    const target = mutation.target as Element;
    const targetSid = target.getAttribute('data-bc-sid');
    const affectedNodeIds: string[] = [];
    
    if (targetSid) {
      affectedNodeIds.push(targetSid);
    }
    addedBlocks.forEach(block => {
      const sid = (block as Element).getAttribute('data-bc-sid');
      if (sid) affectedNodeIds.push(sid);
    });
    removedBlocks.forEach(block => {
      const sid = (block as Element).getAttribute('data-bc-sid');
      if (sid) affectedNodeIds.push(sid);
    });

    // Pattern determination
    if (addedBlocks.length > 0 && removedBlocks.length === 0) {
      // Block added (split or insert)
      if (addedBlocks.length === 1) {
        return {
          type: 'split',
          affectedNodeIds,
          command: 'insertParagraph' // Estimated
        };
      }
      return {
        type: 'insert',
        affectedNodeIds
      };
    } else if (removedBlocks.length > 0 && addedBlocks.length === 0) {
      // Block removed (merge or delete)
      return {
        type: 'merge',
        affectedNodeIds
      };
    } else if (addedBlocks.length > 0 && removedBlocks.length > 0) {
      // Block replaced
      return {
        type: 'unknown',
        affectedNodeIds
      };
    }
  }

  return {
    type: 'unknown',
    affectedNodeIds: []
  };
}

/**
 * C4: 마크/스타일/데코레이터 변경 분류
 * 
 * 감지 기준:
 * - 인라인 스타일/태그 변경 → marks/decorators 후보로 분류
 * - 자동 교정/스마트 인용/자동 링크/DnD/IME 특수 케이스용 태그 추가
 * 
 * 참고: 원칙적으로 keydown에서 preventDefault()하지만,
 * 브라우저/플랫폼 차이로 발생할 수 있는 경우를 대비
 */
function classifyC4(
  mutations: MutationRecord[],
  options: ClassifyOptions
): ClassifiedChange | null {
  console.log('[DomChangeClassifier] classifyC4: CHECKING');

  // Check attributes changes (style changes)
  const attributeMutations = mutations.filter(m => m.type === 'attributes');
  const childListMutations = mutations.filter(m => m.type === 'childList');

  // Detect inline style/tag changes
  const markChanges: Array<{
    nodeId: string;
    markType: string;
    range?: [number, number];
  }> = [];

  // Detect style/tag changes from attributes changes
  for (const mutation of attributeMutations) {
    const target = mutation.target as Element;
    if (target.nodeType !== Node.ELEMENT_NODE) continue;

    // Check if node has data-bc-sid (nodes we manage)
    const sid = target.getAttribute('data-bc-sid');
    if (sid) {
      // Ignore attribute changes on nodes we manage (normalized structure)
      continue;
    }

    // Check if style/tag added by browser
    const markType = detectMarkFromElement(target);
    if (markType) {
      // Find parent inline-text node
      const inlineTextNode = findClosestInlineTextNode(target);
      if (inlineTextNode) {
        const nodeId = inlineTextNode.getAttribute('data-bc-sid');
        if (nodeId) {
          markChanges.push({
            nodeId,
            markType
          });
        }
      }
    }
  }

  // Detect mark tag add/remove from childList changes
  for (const mutation of childListMutations) {
    const addedNodes = Array.from(mutation.addedNodes);
    const removedNodes = Array.from(mutation.removedNodes);

    // Check mark tags in added nodes
    for (const node of addedNodes) {
      if (node.nodeType !== Node.ELEMENT_NODE) continue;
      const el = node as Element;
      const markType = detectMarkFromElement(el);
      if (markType) {
        const inlineTextNode = findClosestInlineTextNode(el);
        if (inlineTextNode) {
          const nodeId = inlineTextNode.getAttribute('data-bc-sid');
          if (nodeId) {
            markChanges.push({
              nodeId,
              markType
            });
          }
        }
      }
    }

    // Check mark tags in removed nodes
    for (const node of removedNodes) {
      if (node.nodeType !== Node.ELEMENT_NODE) continue;
      const el = node as Element;
      const markType = detectMarkFromElement(el);
      if (markType) {
        const inlineTextNode = findClosestInlineTextNode(el);
        if (inlineTextNode) {
          const nodeId = inlineTextNode.getAttribute('data-bc-sid');
          if (nodeId) {
            markChanges.push({
              nodeId,
              markType
            });
          }
        }
      }
    }
  }

  if (markChanges.length === 0) {
    console.log('[DomChangeClassifier] classifyC4: SKIP - no mark changes detected');
    return null;
  }

  console.log('[DomChangeClassifier] classifyC4: FOUND', {
    markChangesCount: markChanges.length,
    markChanges
  });

  // Check special cases like auto-correction, smart quotes, auto-link, etc.
  const specialCase = detectSpecialCase(mutations, options);
  
  return {
    case: specialCase || 'C4',
    mutations,
    metadata: {
      markChanges,
      specialCase
    }
  };
}

/**
 * Detect mark type from element
 * Extract mark from <b>, <strong>, <i>, <em>, <u>, style attribute, etc.
 */
function detectMarkFromElement(element: Element): string | null {
  const tagName = element.tagName.toLowerCase();
  
  // Tag-based mark detection
  const tagMarkMap: Record<string, string> = {
    'b': 'bold',
    'strong': 'bold',
    'i': 'italic',
    'em': 'italic',
    'u': 'underline',
    's': 'strikeThrough',
    'strike': 'strikeThrough',
    'del': 'strikeThrough',
    'sub': 'subscript',
    'sup': 'superscript'
  };

  if (tagMarkMap[tagName]) {
    return tagMarkMap[tagName];
  }

  // Style attribute-based mark detection
  const style = element.getAttribute('style');
  if (style) {
    if (style.includes('font-weight') && (style.includes('bold') || style.includes('700'))) {
      return 'bold';
    }
    if (style.includes('font-style') && style.includes('italic')) {
      return 'italic';
    }
    if (style.includes('text-decoration') && style.includes('underline')) {
      return 'underline';
    }
    if (style.includes('text-decoration') && style.includes('line-through')) {
      return 'strikeThrough';
    }
  }

  return null;
}

/**
 * Detect special cases (auto-correction, smart quotes, auto-link, DnD, etc.)
 */
function detectSpecialCase(
  mutations: MutationRecord[],
  options: ClassifyOptions
): DomChangeCase | null {
  // TODO: Implement special case detection logic
  // - Auto-correction: specific class or attribute patterns
  // - Smart quotes: special character patterns
  // - Auto-link: automatic <a> tag generation
  // - DnD: drag/drop related attributes
  
  return null; // Default C4
}

/**
 * Find closest inline-text node in parent chain
 */
function findClosestInlineTextNode(node: Node): Element | null {
  let current: Node | null = node;

  while (current) {
    if (current.nodeType === Node.ELEMENT_NODE) {
      const element = current as Element;
      const sid = element.getAttribute('data-bc-sid');
      if (sid) {
        // Model node verification is performed by caller
        return element;
      }
    }
    current = current.parentNode;
  }

  return null;
}


