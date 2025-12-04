/**
 * DOM → 모델 동기화 케이스 분류기
 * 
 * MutationObserver가 감지한 DOM 변경을 분석하여
 * C1/C2/C3/C4 케이스로 분류하고, 적절한 DataStore 연산을 결정한다.
 * 
 * 참고 문서:
 * - `dom-to-model-sync-cases.md`: 케이스별 상세 정의
 * - `input-handling-implementation-guide.md`: 구현 가이드
 */

import { Editor } from '@barocss/editor-core';
import type { ModelSelection } from '@barocss/editor-core';
import { reconstructModelTextFromDOM, extractModelTextFromRange } from '../utils/edit-position-converter';

/**
 * DOM 변경 케이스 타입
 */
export type DomChangeCase = 
  | 'C1'  // 단일 inline-text 내부의 순수 텍스트 변경
  | 'C2'  // 여러 inline-text에 걸친 텍스트 변경
  | 'C3'  // 블록 구조 변경
  | 'C4'  // 마크/스타일/데코레이터 변경
  | 'C4_AUTO_CORRECT'  // 자동 교정
  | 'C4_AUTO_LINK'     // 자동 링크
  | 'C4_DND'           // 드래그 앤 드롭
  | 'IME_INTERMEDIATE' // IME 조합 중간 상태
  | 'UNKNOWN';          // 알 수 없는 변경

/**
 * 분류 결과
 */
export interface ClassifiedChange {
  case: DomChangeCase;
  nodeId?: string;  // 변경된 모델 노드 ID (C1, C2의 경우)
  contentRange?: ModelSelection;  // 텍스트 변경 범위 (C1, C2의 경우)
  prevText?: string;  // 변경 전 텍스트 (C1, C2의 경우)
  newText?: string;   // 변경 후 텍스트 (C1, C2의 경우)
  insertedText?: string;  // 삽입된 텍스트
  deletedLength?: number;  // 삭제된 길이
  editPosition?: number;   // 편집 위치
  mutations: MutationRecord[];  // 원본 mutations
  metadata?: Record<string, any>;  // 케이스별 추가 정보
}

/**
 * beforeinput 단계에서 수집한 Insert Range 힌트
 * - 입력 타입, 대상 ModelSelection, 입력 텍스트(선택), 타임스탬프를 포함한다.
 * - C1/C2에서 contentRange 계산을 보정하는 데 사용된다.
 */
export interface InputHint {
  inputType: string;
  contentRange: ModelSelection;
  text?: string;
  timestamp: number;
}

/**
 * DOM 변경 분류 옵션
 */
export interface ClassifyOptions {
  editor: Editor;
  selection?: Selection;  // 현재 DOM selection
  modelSelection?: ModelSelection;  // 변환된 모델 selection (선택적)
  inputHint?: InputHint;  // beforeinput에서 수집한 Insert Range 힌트 (선택적)
  isComposing?: boolean;   // IME 조합 중 여부
}

/**
 * DOM 변경을 케이스별로 분류
 * 
 * @param mutations MutationObserver가 감지한 변경사항
 * @param options 분류 옵션
 * @returns 분류 결과
 */
export function classifyDomChange(
  mutations: MutationRecord[],
  options: ClassifyOptions
): ClassifiedChange {
  console.log('[DomChangeClassifier] classifyDomChange: CALLED', {
    mutationsCount: mutations.length,
    isComposing: options.isComposing
  });

  // 빈 mutations 처리
  if (mutations.length === 0) {
    console.log('[DomChangeClassifier] classifyDomChange: EMPTY mutations');
    return {
      case: 'UNKNOWN',
      mutations: []
    };
  }

  // NOTE: isComposing 여부와 관계없이 텍스트 변경은 C1/C2로 처리
  // selection만 정확하면 됨 (IME 중간 상태도 모델에 반영)

  // C1: 단일 inline-text 내부의 순수 텍스트 변경
  const c1Result = classifyC1(mutations, options);
  if (c1Result) {
    console.log('[DomChangeClassifier] classifyDomChange: C1 detected', c1Result);
    return c1Result;
  }

  // C2: 여러 inline-text에 걸친 텍스트 변경
  const c2Result = classifyC2(mutations, options);
  if (c2Result) {
    console.log('[DomChangeClassifier] classifyDomChange: C2 detected', c2Result);
    return c2Result;
  }

  // C3: 블록 구조 변경
  const c3Result = classifyC3(mutations, options);
  if (c3Result) {
    console.log('[DomChangeClassifier] classifyDomChange: C3 detected', c3Result);
    return c3Result;
  }

  // C4: 마크/스타일/데코레이터 변경
  const c4Result = classifyC4(mutations, options);
  if (c4Result) {
    console.log('[DomChangeClassifier] classifyDomChange: C4 detected', c4Result);
    return c4Result;
  }

  // 알 수 없는 변경
  console.warn('[DomChangeClassifier] classifyDomChange: UNKNOWN', { mutations });
  return {
    case: 'UNKNOWN',
    mutations
  };
}

/**
 * C1: 단일 inline-text 내부의 순수 텍스트 변경 분류
 * 
 * 감지 기준:
 * - 한 개의 inline-text 노드 안에서 텍스트만 변경됨
 * - mark wrapper / 스타일 / childList 여부는 무시하고, sid 기준 전체 텍스트만 비교
 * - block-level 요소(p, div, li 등)의 추가/삭제가 없을 것
 */
function classifyC1(
  mutations: MutationRecord[],
  options: ClassifyOptions
): ClassifiedChange | null {
  console.log('[DomChangeClassifier] classifyC1: CHECKING');

  // 1. 모든 mutation 에 대해, 가장 가까운 inline-text 노드를 찾는다.
  //    - characterData/childList/attributes 를 가리지 않고 sid 기준으로만 본다.
  for (const mutation of mutations) {
    const target = mutation.target;
    const inlineTextNode = findClosestInlineTextNode(target);
    if (!inlineTextNode) {
      // 이 mutation 에서는 inline-text 를 찾지 못했으므로 다음 mutation 으로
      continue;
    }

    const nodeId = inlineTextNode.getAttribute('data-bc-sid');
    if (!nodeId) {
      continue;
    }

    // 모델 노드 확인
    const modelNode = options.editor.dataStore?.getNode?.(nodeId);
    if (!modelNode || modelNode.stype !== 'inline-text') {
      console.log('[DomChangeClassifier] classifyC1: SKIP - not inline-text node', { nodeId, stype: modelNode?.stype });
      continue;
    }

    // 2. block-level 구조 변경이 섞여 있는지 가볍게 필터링
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
        // block 구조가 섞여 있으면 C1 이 아니라 C3 후보이므로 패스
        console.log('[DomChangeClassifier] classifyC1: SKIP - block-like element in childList');
        continue;
      }
    }

    // 3. 모델에서 prevText 가져오기 (sid 기준 전체 텍스트)
    const prevText = modelNode.text || '';
    
    // 4. DOM에서 newText 재구성 (sid 기준 전체 텍스트)
    //    mark/decorator 로 인해 여러 text node 로 분리될 수 있으므로, sid 기준으로 전부 합친다.
    const newText = reconstructModelTextFromDOM(inlineTextNode);

    console.log('[DomChangeClassifier] classifyC1: FOUND', {
      nodeId,
      prevText,
      newText,
      prevTextLength: prevText.length,
      newTextLength: newText.length
    });

    // 5. contentRange 계산
    //    - InputHint 가 있으면 사용
    //    - 없으면 handleC1 에서 analyzeTextChanges 로 정확한 범위 계산
    let startOffset: number | undefined = undefined;
    let endOffset: number | undefined = undefined;
    let usedInputHint = false;

    // beforeinput 에서 수집한 Insert Range 힌트가 있으면 보정
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
      // InputHint가 없으면 contentRange를 설정하지 않음
      // handleC1에서 analyzeTextChanges를 사용하여 정확한 범위 계산
      console.log('[DomChangeClassifier] classifyC1: no InputHint, contentRange will be calculated by analyzeTextChanges');
    }

    return {
      case: 'C1',
      nodeId,
      prevText,
      newText,
      // InputHint가 있을 때만 contentRange 설정, 없으면 undefined
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
 * C2: 여러 inline-text에 걸친 텍스트 변경 분류
 * 
 * 감지 기준:
 * - 연속 인라인 영역의 childList + characterData 패턴
 * - selection 기반 contentRange + 평탄화된 newText 생성
 */
function classifyC2(
  mutations: MutationRecord[],
  options: ClassifyOptions
): ClassifiedChange | null {
  console.log('[DomChangeClassifier] classifyC2: CHECKING');

  // childList와 characterData가 함께 있는지 확인
  const hasChildList = mutations.some(m => m.type === 'childList');
  const hasCharacterData = mutations.some(m => m.type === 'characterData');

  if (!hasChildList || !hasCharacterData) {
    console.log('[DomChangeClassifier] classifyC2: SKIP - no childList+characterData');
    return null;
  }

  // selection이 필요함 (여러 노드에 걸친 범위를 알기 위해)
  if (!options.selection || options.selection.rangeCount === 0) {
    console.log('[DomChangeClassifier] classifyC2: SKIP - no selection');
    return null;
  }

  const range = options.selection.getRangeAt(0);
  
  // selection의 시작/끝 노드에서 inline-text 찾기
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

  // 모델 노드 확인
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

  // 같은 노드인 경우 C1로 처리
  if (startNodeId === endNodeId) {
    console.log('[DomChangeClassifier] classifyC2: SKIP - same node (should be C1)');
    return null;
  }

  // block-level 변경이 있는지 확인 (C3일 수 있음)
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

  // selection 범위의 평탄화된 텍스트 추출
  // DOM selection의 범위를 추출하여 하나의 문자열로 만듦
  const flatText = extractFlatTextFromSelection(range);
  
  // 모델에서 이전 텍스트 추출 (selection 범위)
  // 여러 노드에 걸친 범위의 모델 텍스트 추출
  let prevText = '';
  if (options.editor.dataStore) {
    // contentRange는 나중에 계산되므로, 임시로 startNodeId와 endNodeId 사용
    const tempRange = {
      startNodeId,
      startOffset: 0, // 임시, 나중에 정확한 offset으로 업데이트
      endNodeId,
      endOffset: endModelNode.text?.length || 0 // 임시
    };
    prevText = extractModelTextFromRange(options.editor.dataStore, tempRange);
  }
  
  // fallback: 추출 실패 시 첫 번째 노드의 텍스트만 사용
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

  // contentRange 계산
  // 1순위: InputHint, 2순위: 모델 selection, 3순위: DOM selection 기반 계산
  let startOffset = 0;
  let endOffset = 0;
  let usedInputHint = false;

  const hint = options.inputHint;
  if (hint &&
      hint.contentRange.startNodeId === startNodeId &&
      hint.contentRange.endNodeId === endNodeId) {
    // InputHint를 우선 사용
    startOffset = hint.contentRange.startOffset;
    endOffset = hint.contentRange.endOffset;
    usedInputHint = true;

    console.log('[DomChangeClassifier] classifyC2: using InputHint for offsets', {
      inputType: hint.inputType,
      startOffset,
      endOffset
    });
  } else if (options.modelSelection) {
    // 모델 selection을 사용하여 정확한 offset 계산
    if (options.modelSelection.startNodeId === startNodeId) {
      startOffset = options.modelSelection.startOffset;
    } else {
      // 시작 노드가 다르면 0부터 시작
      startOffset = 0;
    }
    
    if (options.modelSelection.endNodeId === endNodeId) {
      endOffset = options.modelSelection.endOffset;
    } else {
      // 끝 노드가 다르면 끝 노드의 전체 길이
      endOffset = endModelNode.text?.length || 0;
    }
    
    console.log('[DomChangeClassifier] classifyC2: using model selection for offsets', {
      modelSelection: options.modelSelection,
      calculatedOffsets: { startOffset, endOffset }
    });
  } else {
    // DOM selection 기반으로 offset 계산 (fallback)
    // 
    // TODO: DOM offset을 모델 offset으로 정확히 변환하는 로직 필요
    // 
    // 현재 제한사항:
    // - 단일 노드 내에서만 정확한 변환 가능 (convertDOMOffsetToModelOffset 사용)
    // - 여러 노드에 걸친 범위는 정확한 변환 어려움
    // 
    // 향후 개선 방향:
    // 1. range.startContainer와 range.endContainer를 각각 inline-text 노드로 변환
    // 2. 각 노드 내부에서 convertDOMOffsetToModelOffset 사용
    // 3. 중간 노드들의 텍스트 길이를 합산하여 정확한 offset 계산
    // 
    // 현재는 간단히 0과 끝 노드 길이 사용 (부정확하지만 fallback)
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
  
  // prevText 재계산 (정확한 offset 사용)
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
    nodeId: startNodeId, // 주 노드 (나중에 확장 가능)
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

  // block-level childList 변화 확인
  const blockLevelMutations: MutationRecord[] = [];
  
  for (const mutation of mutations) {
    if (mutation.type !== 'childList') continue;
    
    // block 노드의 childList 변경인지 확인
    const target = mutation.target as Element;
    const sid = target.getAttribute('data-bc-sid');
    if (!sid) continue;

    const modelNode = options.editor.dataStore?.getNode?.(sid);
    if (!modelNode) continue;

    // block 타입인지 확인 (paragraph, heading, list 등)
    const blockTypes = ['paragraph', 'heading', 'list', 'list-item', 'blockquote', 'code-block'];
    if (blockTypes.includes(modelNode.stype)) {
      blockLevelMutations.push(mutation);
    }
  }

  if (blockLevelMutations.length === 0) {
    console.log('[DomChangeClassifier] classifyC3: SKIP - no block-level change');
    return null;
  }

  // 구조 변경 패턴 분석
  // 예: paragraph가 둘로 나뉘었는지, 병합되었는지 등
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
      command: pattern.command // 가능한 command (예: 'insertParagraph', 'mergeBlock')
    }
  };
}

/**
 * 블록 구조 변경 패턴 분석
 */
interface BlockStructurePattern {
  type: 'split' | 'merge' | 'insert' | 'delete' | 'unknown';
  affectedNodeIds: string[];
  command?: string; // 가능한 command
}

function analyzeBlockStructureChange(
  mutations: MutationRecord[],
  options: ClassifyOptions
): BlockStructurePattern | null {
  // 간단한 패턴 분석
  // TODO: 더 정교한 패턴 분석 구현 필요
  
  for (const mutation of mutations) {
    const addedNodes = Array.from(mutation.addedNodes);
    const removedNodes = Array.from(mutation.removedNodes);
    
    // block 노드가 추가되었는지 확인
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

    // block 노드가 제거되었는지 확인
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

    // 패턴 판정
    if (addedBlocks.length > 0 && removedBlocks.length === 0) {
      // block이 추가됨 (split 또는 insert)
      if (addedBlocks.length === 1) {
        return {
          type: 'split',
          affectedNodeIds,
          command: 'insertParagraph' // 추정
        };
      }
      return {
        type: 'insert',
        affectedNodeIds
      };
    } else if (removedBlocks.length > 0 && addedBlocks.length === 0) {
      // block이 제거됨 (merge 또는 delete)
      return {
        type: 'merge',
        affectedNodeIds
      };
    } else if (addedBlocks.length > 0 && removedBlocks.length > 0) {
      // block이 교체됨
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

  // attributes 변경 확인 (스타일 변경)
  const attributeMutations = mutations.filter(m => m.type === 'attributes');
  const childListMutations = mutations.filter(m => m.type === 'childList');

  // 인라인 스타일/태그 변경 감지
  const markChanges: Array<{
    nodeId: string;
    markType: string;
    range?: [number, number];
  }> = [];

  // attributes 변경에서 스타일/태그 변경 감지
  for (const mutation of attributeMutations) {
    const target = mutation.target as Element;
    if (target.nodeType !== Node.ELEMENT_NODE) continue;

    // data-bc-sid가 있는 노드인지 확인 (우리가 관리하는 노드)
    const sid = target.getAttribute('data-bc-sid');
    if (sid) {
      // 우리가 관리하는 노드의 속성 변경은 무시 (정규화된 구조)
      continue;
    }

    // 브라우저가 추가한 스타일/태그인지 확인
    const markType = detectMarkFromElement(target);
    if (markType) {
      // 상위 inline-text 노드 찾기
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

  // childList 변경에서 mark 태그 추가/제거 감지
  for (const mutation of childListMutations) {
    const addedNodes = Array.from(mutation.addedNodes);
    const removedNodes = Array.from(mutation.removedNodes);

    // 추가된 노드에서 mark 태그 확인
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

    // 제거된 노드에서 mark 태그 확인
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

  // 자동 교정/스마트 인용/자동 링크 등 특수 케이스 확인
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
 * 요소에서 mark 타입 감지
 * <b>, <strong>, <i>, <em>, <u>, style 속성 등에서 mark 추출
 */
function detectMarkFromElement(element: Element): string | null {
  const tagName = element.tagName.toLowerCase();
  
  // 태그 기반 mark 감지
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

  // style 속성 기반 mark 감지
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
 * 특수 케이스 감지 (자동 교정, 스마트 인용, 자동 링크, DnD 등)
 */
function detectSpecialCase(
  mutations: MutationRecord[],
  options: ClassifyOptions
): DomChangeCase | null {
  // TODO: 특수 케이스 감지 로직 구현
  // - 자동 교정: 특정 클래스나 속성 패턴
  // - 스마트 인용: 특수 문자 패턴
  // - 자동 링크: <a> 태그 자동 생성
  // - DnD: drag/drop 관련 속성
  
  return null; // 기본 C4
}

/**
 * 상위 체인에서 가장 가까운 inline-text 노드 찾기
 */
function findClosestInlineTextNode(node: Node): Element | null {
  let current: Node | null = node;

  while (current) {
    if (current.nodeType === Node.ELEMENT_NODE) {
      const element = current as Element;
      const sid = element.getAttribute('data-bc-sid');
      if (sid) {
        // 모델 노드 확인은 호출자에서 수행
        return element;
      }
    }
    current = current.parentNode;
  }

  return null;
}


