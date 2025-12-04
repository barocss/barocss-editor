/**
 * 효율적인 ContentEditable 편집 처리
 * 
 * 핵심 최적화:
 * 1. Text Run Index를 매번 구축하여 항상 최신 정보 보장
 * 2. 변경된 text node의 위치만 계산하여 mark/decorator 범위 조정
 * 3. text-analyzer 패키지의 analyzeTextChanges 사용 (LCP/LCS + Selection 바이어싱)
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
 * 효율적인 편집 처리 함수
 * 
 * 핵심 원칙:
 * 1. MutationObserver는 개별 text node의 변경을 감지하지만,
 *    실제 비교는 sid 기준 전체 텍스트로 해야 함
 * 2. mark/decorator로 인해 하나의 inline-text 노드가 여러 text node로 분리됨
 * 3. 따라서 sid 기반 하위의 모든 text node를 합쳐서 비교해야 함
 * 4. Selection offset은 model 기반으로 normalize하여 변경점을 찾음
 * 
 * 알고리즘:
 * 1. sid 추출 및 모델 텍스트 가져오기 (oldModelText)
 * 2. DOM에서 sid 기준 전체 텍스트 재구성 (newText = 모든 text node 합계)
 * 3. oldModelText vs newText 비교 (sid 기준)
 * 4. Selection offset을 Model offset으로 정규화
 * 5. 편집 위치 파악 및 marks/decorators 범위 조정
 * 
 * Text Run Index는 매번 구축하여 항상 최신 정보를 보장합니다.
 * inline-text 노드 내의 text node 개수가 보통 적기 때문에
 * 성능 저하는 미미하며, 정확성이 더 중요합니다.
 * 
 * @param textNode - 변경된 DOM text node (시작점으로만 사용)
 * @param oldModelText - 모델의 전체 텍스트 (sid 기준, 비교 대상)
 * @param modelMarks - 현재 모델의 marks 배열
 * @param decorators - 현재 decorators 배열
 * @returns 모델 업데이트 정보
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
    // 1. inline-text 노드 찾기 (sid 추출)
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
    
    // 2. Text Run Index 구축 (sid 기반 하위의 모든 text node 수집)
    // buildReverseMap: textNode → offset 변환을 위해 필요
    const runs = buildTextRunIndex(inlineTextNode, nodeId, {
      buildReverseMap: true,
      normalizeWhitespace: false
    });
    
    if (!runs || runs.runs.length === 0) {
      console.warn('[handleEfficientEdit] no text runs found');
      return null;
    }
    
    // 3. DOM에서 sid 기준 전체 텍스트 재구성
    const newText = reconstructModelTextFromRuns(runs);
    
    // 4. sid 기준 텍스트 비교 (oldModelText vs newText)
    if (newText === oldModelText) {
      return null; // 변경 없음
    }
    
    // 5. Selection offset을 Model offset으로 정규화
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
        // DOM offset → Model offset 변환
        const modelPos = convertDOMToModelPosition(domPosition, inlineTextNode);
        if (modelPos) {
          selectionOffset = modelPos.offset;  // Model offset (normalized)
        }
      }
      // Selection 길이 계산 (collapsed면 0)
      if (!range.collapsed) {
        // Range의 끝 위치도 Model offset으로 변환
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
    
    // 6. text-analyzer의 analyzeTextChanges 사용 (LCP/LCS + Selection 바이어싱)
    const textChanges = analyzeTextChanges({
      oldText: oldModelText,
      newText: newText,
      selectionOffset: selectionOffset,
      selectionLength: selectionLength
    });
    
    if (textChanges.length === 0) {
      // 변경사항 없음 (유니코드 정규화 후 동일한 경우)
      return null;
    }
    
    // 첫 번째 TextChange를 TextEdit로 변환
    // (일반적으로 하나의 변경만 발생)
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
 * Text Run Index에서 전체 텍스트 재구성
 * 
 * sid 기반 하위의 모든 text node를 순서대로 합쳐서 재구성합니다.
 * mark/decorator로 인해 분리된 여러 text node를 하나의 텍스트로 합칩니다.
 * 
 * ⚡ 최적화: 캐시된 runs를 사용하므로 비용이 낮음
 * - 이미 구축된 runs를 재사용
 * - textContent 접근만 수행 (O(n) where n = number of text nodes)
 * 
 * @param runs - Text Run Index (sid 기반 하위의 모든 text node 정보)
 * @returns sid 기준 전체 텍스트 (모든 text node의 textContent 합계)
 */
function reconstructModelTextFromRuns(runs: ContainerRuns): string {
  // 모든 text node를 순서대로 합쳐서 sid 기준 전체 텍스트 재구성
  const textParts = runs.runs.map(run => run.domTextNode.textContent || '');
  const result = textParts.join('');
  
  // 디버깅: 중복 노드 감지 (경고만 출력, 건너뛰지는 않음)
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
 * TextChange를 TextEdit로 변환하여 편집 정보 생성
 * 
 * text-analyzer의 analyzeTextChanges 결과를 사용하여
 * 정확한 변경 범위를 파악하고 marks/decorators를 조정합니다.
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
  // TextChange를 TextEdit로 변환
  const editType: 'insert' | 'delete' | 'replace' = textChange.type;
  
  // 삽입/삭제 길이 계산
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
    editPosition: textChange.start,  // text-analyzer가 계산한 정확한 시작 위치
    editType,
    insertedLength,
    deletedLength,
    insertedText: textChange.text  // 삽입/교체할 텍스트 내용
  };
  
  // Mark 범위 조정은 RangeOperations.replaceText가 자동으로 처리하므로 불필요
  // Decorator 범위 조정: dataStore.decorators.adjustRanges 사용
  // dataStore.decorators는 생성자에서 항상 초기화되므로 dataStore가 있으면 항상 존재
  const adjustedDecorators = dataStore?.decorators.adjustRanges(decorators, nodeId, editInfo) ?? decorators;
  
  return {
    newText,
    adjustedMarks: modelMarks, // RangeOperations.replaceText가 자동 조정하므로 원본 반환
    adjustedDecorators,
    editInfo
  };
}


