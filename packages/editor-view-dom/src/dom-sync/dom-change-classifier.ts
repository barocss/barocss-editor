/**
 * DOM → Model sync case classifier
 * 
 * Analyzes DOM changes detected by MutationObserver
 * and classifies them into text-in-one-run / text-across-runs / block-structure / inline-markup cases, determining appropriate DataStore operations.
 * 
 * Reference documents:
 * - `dom-to-model-sync-cases.md`: Detailed case definitions
 * - `input-handling-implementation-guide.md`: Implementation guide
 */

import { Editor } from '@barocss/editor-core';
import type { ModelSelection } from '@barocss/editor-core';
import { reconstructModelTextFromDOM, extractModelTextFromRange } from '../utils/edit-position-converter';
import { holdsText, stripFiller } from '@barocss/shared';
import { logger, LogCategory } from '@barocss/renderer-dom';

const BLOCK_TYPES = new Set(['paragraph', 'heading', 'list', 'list-item', 'blockquote', 'code-block']);

/**
 * DOM change case type
 */
export type DomChangeCase = 
  | 'text-in-one-run'  // Pure text change within single inline-text
  | 'text-across-runs'  // Text change across multiple inline-text
  | 'block-structure'  // Block structure change
  | 'inline-markup'  // Mark/style/decorator change
  | 'auto-correct'  // Auto correct
  | 'auto-link'     // Auto link
  | 'drag-and-drop'           // Drag and drop
  | 'ime-intermediate' // IME composition intermediate state
  | 'unknown';          // Unknown change

/**
 * Classification result
 */
export interface ClassifiedChange {
  case: DomChangeCase;
  nodeId?: string;  // Changed model node ID (for the text cases)
  contentRange?: ModelSelection;  // Text change range (for the text cases)
  prevText?: string;  // Text before change (for the text cases)
  newText?: string;   // Text after change (for the text cases)
  insertedText?: string;  // Inserted text
  deletedLength?: number;  // Deleted length
  editPosition?: number;   // Edit position
  mutations: MutationRecord[];  // Original mutations
  metadata?: Record<string, any>;  // Additional case-specific info
}

/**
 * Insert Range hint collected at beforeinput stage
 * - Includes input type, target ModelSelection, input text (optional), timestamp.
 * - Used to correct contentRange calculation in text-in-one-run and text-across-runs.
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
  logger.debug(LogCategory.TEXT_INPUT, 'classifyDomChange: CALLED', {
    mutationsCount: mutations.length,
    isComposing: options.isComposing
  });

  // Handle empty mutations
  if (mutations.length === 0) {
    logger.debug(LogCategory.TEXT_INPUT, 'classifyDomChange: EMPTY mutations');
    return {
      case: 'unknown',
      mutations: []
    };
  }

  // NOTE: text changes are handled as text-in-one-run and text-across-runs regardless of isComposing
  // only selection needs to be accurate (IME intermediate state is also reflected in model)

  // text-in-one-run: Pure text change within single inline-text
  const textInOneRun = classifyTextInOneRun(mutations, options);
  if (textInOneRun) {
    logger.debug(LogCategory.TEXT_INPUT, 'classifyDomChange: text-in-one-run detected', textInOneRun);
    return textInOneRun;
  }

  // text-across-runs: Text change across multiple inline-text
  const textAcrossRuns = classifyTextAcrossRuns(mutations, options);
  if (textAcrossRuns) {
    logger.debug(LogCategory.TEXT_INPUT, 'classifyDomChange: text-across-runs detected', textAcrossRuns);
    return textAcrossRuns;
  }

  // block-structure: Block structure change
  const blockStructure = classifyBlockStructure(mutations, options);
  if (blockStructure) {
    logger.debug(LogCategory.TEXT_INPUT, 'classifyDomChange: block-structure detected', blockStructure);
    return blockStructure;
  }

  // inline-markup: Mark/style/decorator change
  const inlineMarkup = classifyInlineMarkup(mutations, options);
  if (inlineMarkup) {
    logger.debug(LogCategory.TEXT_INPUT, 'classifyDomChange: inline-markup detected', inlineMarkup);
    return inlineMarkup;
  }

  // Unknown change
  console.warn('[DomChangeClassifier] classifyDomChange: UNKNOWN', { mutations });
  return {
    case: 'unknown',
    mutations
  };
}

/**
 * text-in-one-run: Classify pure text change within single inline-text
 * 
 * Detection criteria:
 * - Only text changed within a single inline-text node
 * - Ignore mark wrapper / style / childList, compare only sid-based full text
 * - No addition/deletion of block-level elements (p, div, li, etc.)
 */
/** Returns true if node (or its element children) is inline-markup special case (e.g. <a> with href). */
function hasInlineMarkupInNodes(nodes: Node[]): boolean {
  for (const node of nodes) {
    if (node.nodeType !== Node.ELEMENT_NODE) continue;
    const el = node as Element;
    const tag = el.tagName.toLowerCase();
    if (tag === 'a' && el.getAttribute('href')) return true;
    const className = el.getAttribute('class') || '';
    const style = el.getAttribute('style') || '';
    if (className.toLowerCase().includes('autocorrect') || className.toLowerCase().includes('smart-quote') ||
        style.toLowerCase().includes('text-transform')) return true;
  }
  return false;
}

function classifyTextInOneRun(
  mutations: MutationRecord[],
  options: ClassifyOptions
): ClassifiedChange | null {
  logger.debug(LogCategory.TEXT_INPUT, 'classifyTextInOneRun: CHECKING');

  // If selection spans two different inline-text nodes, let text-across-runs handle
  if (options.selection && options.selection.rangeCount > 0) {
    const range = options.selection.getRangeAt(0);
    const startEl = findClosestInlineTextNode(range.startContainer);
    const endEl = findClosestInlineTextNode(range.endContainer);
    const startSid = startEl?.getAttribute('data-bc-sid');
    const endSid = endEl?.getAttribute('data-bc-sid');
    if (startSid && endSid && startSid !== endSid) {
      logger.debug(LogCategory.TEXT_INPUT, 'classifyTextInOneRun: SKIP - selection spans multiple inline-text (text-across-runs)');
      return null;
    }
  }

  // If inputHint range spans multiple inline-text nodes, let text-across-runs handle
  const hint = options.inputHint;
  if (hint?.contentRange && hint.contentRange.startNodeId !== hint.contentRange.endNodeId) {
    logger.debug(LogCategory.TEXT_INPUT, 'classifyTextInOneRun: SKIP - inputHint spans multiple nodes (text-across-runs)');
    return null;
  }

  // If any mutation adds/removes inline-markup-like nodes (e.g. <a>), let inline-markup handle
  for (const mutation of mutations) {
    if (mutation.type !== 'childList') continue;
    const addedOrRemoved = [
      ...Array.from(mutation.addedNodes || []),
      ...Array.from(mutation.removedNodes || [])
    ];
    if (hasInlineMarkupInNodes(addedOrRemoved)) {
      logger.debug(LogCategory.TEXT_INPUT, 'classifyTextInOneRun: SKIP - inline-markup special case in childList');
      return null;
    }
  }

  // 1. Consider only the mutations at the caret.
  //
  //    A change the user made is a change where the user is. Walking up from
  //    every mutation instead means a render's own output can lead the search
  //    somewhere else entirely — measured on a paginated document, a keystroke
  //    arrived among hundreds of mutations from the page chrome, the walk landed
  //    on the section, and the keystroke was never classified at all. text-across-runs beside
  //    this one has always started from the selection.
  //
  //    Without a caret there is nothing to compare against, so every mutation is
  //    considered, as before: that is the case where the change did not come
  //    from typing.
  const caretContainer = options.selection?.rangeCount
    ? options.selection.getRangeAt(0).startContainer
    : undefined;
  const caretSid = caretContainer
    ? findClosestInlineTextNode(caretContainer)?.getAttribute('data-bc-sid') ?? null
    : null;

  const relevant = caretSid
    ? mutations.filter((mutation) => {
        const node = findClosestInlineTextNode(mutation.target);
        return node?.getAttribute('data-bc-sid') === caretSid;
      })
    : mutations;

  for (const mutation of relevant) {
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
    if (!holdsText(modelNode)) {
      logger.debug(LogCategory.TEXT_INPUT, 'classifyTextInOneRun: SKIP - not inline-text node', { nodeId, stype: modelNode?.stype });
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
        // If block structure is mixed in, it's a block-structure candidate, not text-in-one-run, so skip
        logger.debug(LogCategory.TEXT_INPUT, 'classifyTextInOneRun: SKIP - block-like element in childList');
        continue;
      }
    }

    // 3. Get prevText from model (sid-based full text)
    const prevText = modelNode.text || '';
    
    // 4. Reconstruct newText from DOM (sid-based full text)
    //    May be split into multiple text nodes due to mark/decorator, so combine all by sid.
    const newText = reconstructModelTextFromDOM(inlineTextNode);

    logger.debug(LogCategory.TEXT_INPUT, 'classifyTextInOneRun: FOUND', {
      nodeId,
      prevText,
      newText,
      prevTextLength: prevText.length,
      newTextLength: newText.length
    });

    // 5. Calculate contentRange
    //    - Use if InputHint exists
    //    - Otherwise, calculate accurate range with analyzeTextChanges in handleTextInOneRun
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

      logger.debug(LogCategory.TEXT_INPUT, 'classifyTextInOneRun: using InputHint for contentRange', {
        hintedStart,
        hintedEnd,
        inputType: hint.inputType
      });
    } else {
      // If InputHint is missing, don't set contentRange
      // Calculate accurate range using analyzeTextChanges in handleTextInOneRun
      logger.debug(LogCategory.TEXT_INPUT, 'classifyTextInOneRun: no InputHint, contentRange will be calculated by analyzeTextChanges');
    }

    return {
      case: 'text-in-one-run',
      nodeId,
      prevText,
      newText,
      // Set contentRange only when InputHint exists, undefined otherwise
      contentRange: startOffset !== undefined && endOffset !== undefined ? {
        type: 'range' as const,
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
 * text-across-runs: Classify text change across multiple inline-text
 * 
 * Detection criteria:
 * - childList + characterData pattern in consecutive inline area
 * - Generate selection-based contentRange + flattened newText
 */
function classifyTextAcrossRuns(
  mutations: MutationRecord[],
  options: ClassifyOptions
): ClassifiedChange | null {
  logger.debug(LogCategory.TEXT_INPUT, 'classifyTextAcrossRuns: CHECKING');

  // Check if childList and characterData are present together
  const hasChildList = mutations.some(m => m.type === 'childList');
  const hasCharacterData = mutations.some(m => m.type === 'characterData');

  if (!hasChildList || !hasCharacterData) {
    logger.debug(LogCategory.TEXT_INPUT, 'classifyTextAcrossRuns: SKIP - no childList+characterData');
    return null;
  }

  // Need either DOM selection or inputHint spanning multiple nodes
  const hint = options.inputHint;
  const hasMultiNodeHint = hint?.contentRange && hint.contentRange.startNodeId !== hint.contentRange.endNodeId;
  const hasSelection = options.selection && options.selection.rangeCount > 0;

  let startNodeId: string;
  let endNodeId: string;
  let range: Range | null = null;

  if (hasSelection) {
    range = options.selection!.getRangeAt(0);
    const startInlineText = findClosestInlineTextNode(range.startContainer);
    const endInlineText = findClosestInlineTextNode(range.endContainer);
    if (!startInlineText || !endInlineText) {
      logger.debug(LogCategory.TEXT_INPUT, 'classifyTextAcrossRuns: SKIP - no inline-text nodes found');
      return null;
    }
    startNodeId = startInlineText.getAttribute('data-bc-sid')!;
    endNodeId = endInlineText.getAttribute('data-bc-sid')!;
  } else if (hasMultiNodeHint) {
    startNodeId = hint!.contentRange.startNodeId;
    endNodeId = hint!.contentRange.endNodeId;
  } else {
    logger.debug(LogCategory.TEXT_INPUT, 'classifyTextAcrossRuns: SKIP - no selection');
    return null;
  }

  if (!startNodeId || !endNodeId) {
    logger.debug(LogCategory.TEXT_INPUT, 'classifyTextAcrossRuns: SKIP - no sid attributes');
    return null;
  }

  // Check model nodes
  const startModelNode = options.editor.dataStore?.getNode?.(startNodeId);
  const endModelNode = options.editor.dataStore?.getNode?.(endNodeId);

  if (!startModelNode || !endModelNode || 
      !holdsText(startModelNode) || !holdsText(endModelNode)) {
    logger.debug(LogCategory.TEXT_INPUT, 'classifyTextAcrossRuns: SKIP - not inline-text nodes', {
      startStype: startModelNode?.stype,
      endStype: endModelNode?.stype
    });
    return null;
  }

  // If same node, handle as text-in-one-run
  if (startNodeId === endNodeId) {
    logger.debug(LogCategory.TEXT_INPUT, 'classifyTextAcrossRuns: SKIP - same node (should be text-in-one-run)');
    return null;
  }

  // Check if block-level change exists (may be block-structure)
  const hasBlockLevelChange = mutations.some(m => {
    if (m.type !== 'childList') return false;
    const target = m.target as Element;
    const sid = target.getAttribute('data-bc-sid');
    if (!sid) return false;
    const modelNode = options.editor.dataStore?.getNode?.(sid);
    if (!modelNode) return false;
    return isBlockNodeType(modelNode.stype);
  });

  if (hasBlockLevelChange) {
    logger.debug(LogCategory.TEXT_INPUT, 'classifyTextAcrossRuns: SKIP - has block-level change (should be block-structure)');
    return null;
  }

  // Extract flattened text: from DOM selection when available, else from model range
  let flatText: string;
  if (range) {
    flatText = extractFlatTextFromSelection(range);
  } else {
    flatText = '';
    if (options.editor.dataStore && hint) {
      const hintRange: import('@barocss/editor-core').ModelSelection = {
        type: 'range',
        startNodeId: hint.contentRange.startNodeId,
        startOffset: hint.contentRange.startOffset,
        endNodeId: hint.contentRange.endNodeId,
        endOffset: hint.contentRange.endOffset
      };
      flatText = extractModelTextFromRange(options.editor.dataStore, hintRange);
    }
  }

  // Extract previous text from model (selection range)
  let prevText = '';
  if (options.editor.dataStore) {
    const tempRange: import('@barocss/editor-core').ModelSelection = {
      type: 'range',
      startNodeId,
      startOffset: 0,
      endNodeId,
      endOffset: endModelNode.text?.length || 0
    };
    prevText = extractModelTextFromRange(options.editor.dataStore, tempRange);
  }

  // fallback: if extraction fails, use only first node's text
  if (!prevText) {
    prevText = startModelNode.text || '';
  }

  logger.debug(LogCategory.TEXT_INPUT, 'classifyTextAcrossRuns: FOUND', {
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
  let usedModelSelection = false;
  let usedDOMSelection = false;

  if (hint &&
      hint.contentRange.startNodeId === startNodeId &&
      hint.contentRange.endNodeId === endNodeId) {
    // Use InputHint first
    startOffset = hint.contentRange.startOffset;
    endOffset = hint.contentRange.endOffset;
    usedInputHint = true;

    logger.debug(LogCategory.TEXT_INPUT, 'classifyTextAcrossRuns: using InputHint for offsets', {
      inputType: hint.inputType,
      startOffset,
      endOffset
    });
  } else if (options.modelSelection) {
    // Calculate accurate offset using model selection
    usedModelSelection = true;
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
    
    logger.debug(LogCategory.TEXT_INPUT, 'classifyTextAcrossRuns: using model selection for offsets', {
      modelSelection: options.modelSelection,
      calculatedOffsets: { startOffset, endOffset }
    });
  } else if (range) {
    // Calculate offset based on DOM selection
    const converted = convertDOMSelectionToModelOffsets(
      range,
      startNodeId,
      endNodeId,
      startModelNode.text || '',
      endModelNode.text || '',
      options.editor.dataStore
    );

    if (converted) {
      startOffset = converted.startOffset;
      endOffset = converted.endOffset;
      usedDOMSelection = true;
    } else {
      // Fallback for cases where conversion fails
      startOffset = 0;
      endOffset = endModelNode.text?.length || 0;
    }
    
    logger.debug(LogCategory.TEXT_INPUT, 'classifyTextAcrossRuns: using DOM selection (less accurate - fallback)', {
      startNodeId,
      endNodeId,
      startOffset,
      endOffset,
      note: usedDOMSelection
        ? 'DOM offset converted to model offset using inline-text walker'
        : 'DOM offset conversion failed, fallback offsets used'
    });
  } else {
    startOffset = 0;
    endOffset = endModelNode.text?.length || 0;
  }
  
  // Recalculate prevText (using accurate offset)
  if (options.editor.dataStore && startOffset !== undefined && endOffset !== undefined) {
    const accurateRange: import('@barocss/editor-core').ModelSelection = {
      type: 'range',
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
    case: 'text-across-runs',
    nodeId: startNodeId,
    prevText,
    newText: flatText,
    contentRange: {
      type: 'range' as const,
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
      usedModelSelection,
      usedDOMSelection,
      usedInputHint: usedInputHint || undefined
    }
  };
}

function convertDOMSelectionToModelOffsets(
  range: Range,
  startNodeId: string,
  endNodeId: string,
  startNodeText: string,
  endNodeText: string,
  dataStore: any
): { startOffset: number; endOffset: number } | null {
  const startOffset = resolveDOMBoundaryOffset(range.startContainer, range.startOffset, startNodeId, dataStore);
  const endOffset = resolveDOMBoundaryOffset(range.endContainer, range.endOffset, endNodeId, dataStore);
  if (startOffset === null || endOffset === null) return null;

  return {
    startOffset: clampNumber(startOffset, 0, startNodeText.length),
    endOffset: clampNumber(endOffset, 0, endNodeText.length)
  };
}

function resolveDOMBoundaryOffset(
  container: Node,
  domOffset: number,
  expectedNodeId: string,
  dataStore: any
): number | null {
  const inlineTextNode = findClosestInlineTextNode(container);
  if (!inlineTextNode) return null;

  const nodeId = inlineTextNode.getAttribute('data-bc-sid');
  if (!nodeId || nodeId !== expectedNodeId) {
    return null;
  }

  // if direct text node, directly sum previous siblings
  if (container.nodeType === Node.TEXT_NODE) {
    const textNode = container as Text;
    const runs = collectTextRuns(inlineTextNode);
    if (!runs.length) return null;

    const target = runs.find(run => run.node === textNode);
    if (!target) return null;

    return target.start + clampNumber(domOffset, 0, target.length);
  }

  // element boundary: estimate by nearest text node around boundary
  if (container.nodeType !== Node.ELEMENT_NODE) return null;
  const boundaryChild = (container as Element).childNodes.item(domOffset) || null;
  const runs = collectTextRuns(inlineTextNode);
  if (!runs.length) return null;

  let lastBefore: TextRun | null = null;
  let firstAtOrAfter: TextRun | null = null;

  for (const run of runs) {
    if (!boundaryChild) {
      lastBefore = run;
      continue;
    }

    const cmp = run.node.compareDocumentPosition(boundaryChild);
    if (cmp & Node.DOCUMENT_POSITION_FOLLOWING) {
      firstAtOrAfter = run;
      break;
    }

    lastBefore = run;
  }

  if (!boundaryChild) {
    return runs.length > 0 ? runs[runs.length - 1].end : null;
  }

  if (firstAtOrAfter) {
    return firstAtOrAfter.start;
  }

  return lastBefore ? lastBefore.end : 0;
}

interface TextRun {
  node: Text;
  start: number;
  end: number;
  length: number;
}

function collectTextRuns(textContainer: Element): TextRun[] {
  const walker = document.createTreeWalker(textContainer, NodeFilter.SHOW_TEXT);
  const runs: TextRun[] = [];
  let cursor = walker.nextNode() as Text | null;
  let offset = 0;

  while (cursor) {
    const text = cursor.textContent || '';
    const length = text.length;
    runs.push({
      node: cursor,
      start: offset,
      end: offset + length,
      length
    });
    offset += length;
    cursor = walker.nextNode() as Text | null;
  }

  return runs;
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(value, max));
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

  // Strip renderer-owned fillers: this walks text nodes directly instead of going
  // through buildTextRunIndex, so without it the zero-width character would ride
  // along into copied/cut text and out into other applications.
  return stripFiller(textNodes.map(tn => tn.textContent || '').join(''));
}

/**
 * block-structure: 블록 구조 변경 분류
 * 
 * 감지 기준:
 * - block-level childList 변화 패턴
 * - insertParagraph/mergeBlock 등 command로 매핑 가능한지 여부 포함
 * 
 * 참고: 원칙적으로 beforeinput에서 처리하지만,
 * 브라우저/플랫폼 차이로 beforeinput이 오지 않은 경우를 대비
 */
function classifyBlockStructure(
  mutations: MutationRecord[],
  options: ClassifyOptions
): ClassifiedChange | null {
  logger.debug(LogCategory.TEXT_INPUT, 'classifyBlockStructure: CHECKING');

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
    if (isBlockNodeType(modelNode.stype)) {
      blockLevelMutations.push(mutation);
    }
  }

  if (blockLevelMutations.length === 0) {
    logger.debug(LogCategory.TEXT_INPUT, 'classifyBlockStructure: SKIP - no block-level change');
    return null;
  }

  // Analyze structure change pattern
  // e.g., whether paragraph was split into two, merged, etc.
  const pattern = analyzeBlockStructureChange(blockLevelMutations, options);
  
  if (!pattern) {
    logger.debug(LogCategory.TEXT_INPUT, 'classifyBlockStructure: SKIP - cannot analyze pattern');
    return null;
  }

  logger.debug(LogCategory.TEXT_INPUT, 'classifyBlockStructure: FOUND', {
    pattern: pattern.type,
    affectedNodes: pattern.affectedNodeIds
  });

  return {
    case: 'block-structure',
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
      return isBlockNodeType(modelNode.stype);
    });

    // Check if block node was removed
    const removedBlocks = removedNodes.filter(node => {
      if (node.nodeType !== Node.ELEMENT_NODE) return false;
      const el = node as Element;
      const sid = el.getAttribute('data-bc-sid');
      if (!sid) return false;
      const modelNode = options.editor.dataStore?.getNode?.(sid);
      if (!modelNode) return false;
      return isBlockNodeType(modelNode.stype);
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
    }

    if (removedBlocks.length > 0 && addedBlocks.length === 0) {
      // Block removed (merge or delete)
      if (removedBlocks.length === 1) {
        return {
          type: 'merge',
          affectedNodeIds,
          command: 'deleteText'
        };
      }

      return {
        type: 'merge',
        affectedNodeIds
      };
    }

    if (addedBlocks.length > 0 && removedBlocks.length > 0) {
      // Block replaced
      if (removedBlocks.length === 1 && addedBlocks.length === 1) {
        // 흔히 block boundary 이동으로 보이는 패턴
        return {
          type: 'unknown',
          affectedNodeIds,
          command: 'deleteText'
        };
      }

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

function isBlockNodeType(stype: string): boolean {
  return BLOCK_TYPES.has(stype);
}

/**
 * inline-markup: 마크/스타일/데코레이터 변경 분류
 * 
 * 감지 기준:
 * - 인라인 스타일/태그 변경 → marks/decorators 후보로 분류
 * - 자동 교정/스마트 인용/자동 링크/DnD/IME 특수 케이스용 태그 추가
 * 
 * 참고: 원칙적으로 keydown에서 preventDefault()하지만,
 * 브라우저/플랫폼 차이로 발생할 수 있는 경우를 대비
 */
function classifyInlineMarkup(
  mutations: MutationRecord[],
  options: ClassifyOptions
): ClassifiedChange | null {
  logger.debug(LogCategory.TEXT_INPUT, 'classifyInlineMarkup: CHECKING');

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

  // Check special cases like auto-correction, smart quotes, auto-link, etc.
  const specialCase = detectSpecialCase(mutations, options);

  if (markChanges.length === 0 && !specialCase) {
    logger.debug(LogCategory.TEXT_INPUT, 'classifyInlineMarkup: SKIP - no mark changes detected');
    return null;
  }

  logger.debug(LogCategory.TEXT_INPUT, 'classifyInlineMarkup: FOUND', {
    markChangesCount: markChanges.length,
    markChanges
  });

  return {
    case: specialCase || 'inline-markup',
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
  const classNameContains = (value: string | null, token: string): boolean =>
    Boolean(value?.toLowerCase().includes(token.toLowerCase()));

  const inspectNode = (node: Node): DomChangeCase | null => {
    if (node.nodeType !== Node.ELEMENT_NODE) return null;
    const el = node as Element;

    const className = el.getAttribute('class') || '';
    const href = el.getAttribute('href');
    const dataTransfer = el.getAttribute('data-transfer');
    const dataDnd = el.getAttribute('data-dnd');
    const style = el.getAttribute('style') || '';
    const tagName = el.tagName.toLowerCase();

    if (tagName === 'a' && !!href) {
      return 'auto-link';
    }

    if (classNameContains(className, 'autocorrect') ||
        classNameContains(className, 'smartlink') ||
        classNameContains(className, 'smart-quote') ||
        classNameContains(className, 'autocorrect') ||
        classNameContains(style, 'text-transform') &&
        classNameContains(style, 'none')) {
      return 'auto-correct';
    }

    if (classNameContains(className, 'drag') ||
        classNameContains(className, 'drop') ||
        !!dataTransfer || !!dataDnd ||
        classNameContains(className, 'drag-over')) {
      return 'drag-and-drop';
    }

    return null;
  };

  for (const mutation of mutations) {
    const directNodes = [mutation.target, ...Array.from(mutation.addedNodes), ...Array.from(mutation.removedNodes)];
    const directCase = directNodes
      .map(node => inspectNode(node))
      .find((value): value is DomChangeCase => value !== null);
    if (directCase) return directCase;

    if (mutation.attributeName && mutation.target instanceof Element) {
      const attr = mutation.target.getAttribute(mutation.attributeName);
      if (attr && attr.toLowerCase().includes('autocorrect')) {
        return 'auto-correct';
      }
    }

    const walker = document.createTreeWalker(mutation.target, NodeFilter.SHOW_ELEMENT, null);
    let current: Node | null = walker.nextNode();
    while (current) {
      const detected = inspectNode(current);
      if (detected) return detected;
      current = walker.nextNode();
    }
  }

  return null;
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
