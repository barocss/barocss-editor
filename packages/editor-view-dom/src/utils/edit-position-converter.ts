/**
 * ContentEditable 편집 위치 변환 유틸리티
 * 
 * DOM 편집 위치를 모델 위치로 변환하고,
 * 텍스트 편집에 따라 mark/decorator 범위를 조정합니다.
 */

import { buildTextRunIndex, type ContainerRuns } from '@barocss/renderer-dom';
import type { ModelSelection } from '@barocss/editor-core';

export interface DOMEditPosition {
  textNode: Text;
  offset: number;  // textNode 내부 offset
}

export interface ModelEditPosition {
  nodeId: string;  // inline-text 노드의 sid
  offset: number;  // inline-text 노드 내부의 모델 offset
}

export interface MarkRange {
  type: string;
  range: [number, number];  // [start, end]
  attrs?: Record<string, any>;
}

export interface DecoratorRange {
  sid: string;
  stype: string;
  category: 'inline' | 'block' | 'layer';
  target: {
    sid: string;           // 대상 inline-text 노드의 sid
    startOffset: number;   // 시작 offset
    endOffset: number;     // 끝 offset
  };
}

export interface TextEdit {
  nodeId: string;        // 편집된 inline-text 노드의 sid
  oldText: string;       // 편집 전 텍스트
  newText: string;       // 편집 후 텍스트
  editPosition: number;  // 편집이 시작된 모델 offset
  editType: 'insert' | 'delete' | 'replace';
  insertedLength: number;
  deletedLength: number;
  insertedText: string;  // 삽입/교체할 텍스트 내용 (textChange.text)
}

/**
 * Text node가 속한 inline-text 노드 찾기
 */
export function findInlineTextNode(textNode: Node): Element | null {
  // 가장 가까운 data-bc-sid를 가진 요소 찾기
  // schema에 정의되어 있으므로 타입 체크 불필요
  let current: Node | null = textNode;
  
  while (current) {
    if (current.nodeType === Node.ELEMENT_NODE) {
      const el = current as Element;
      const sid = el.getAttribute('data-bc-sid');
      if (sid) {
        return el;
      }
    }
    current = current.parentElement;
  }
  
  return null;
}

/**
 * DOM 편집 위치를 모델 위치로 변환
 * 
 * @param domPosition - DOM에서의 편집 위치 (textNode + offset)
 * @param container - 편집이 발생한 컨테이너 (paragraph 등)
 * @returns 모델 위치 (nodeId + offset)
 */
export function convertDOMToModelPosition(
  domPosition: DOMEditPosition,
  container: Element
): ModelEditPosition | null {
  // 1. textNode가 속한 inline-text 노드 찾기
  const inlineTextNode = findInlineTextNode(domPosition.textNode);
  if (!inlineTextNode) return null;
  
  const nodeId = inlineTextNode.getAttribute('data-bc-sid');
  if (!nodeId) return null;
  
  // 2. Text Run Index 구축
  const runs = buildTextRunIndex(inlineTextNode, nodeId);
  
  // 3. DOM offset을 모델 offset으로 변환
  const modelOffset = convertDOMOffsetToModelOffset(
    domPosition.textNode,
    domPosition.offset,
    runs
  );
  
  return {
    nodeId,
    offset: modelOffset
  };
}

/**
 * DOM offset을 모델 offset으로 변환
 * 
 * Text Run Index를 사용하여 정확한 변환 수행
 */
export function convertDOMOffsetToModelOffset(
  textNode: Text,
  domOffset: number,
  runs: ContainerRuns
): number {
  // textNode가 속한 run 찾기
  const runIndex = runs.runs.findIndex(run => run.domTextNode === textNode);
  if (runIndex === -1) {
    // textNode를 찾을 수 없으면 가장 가까운 run 사용
    // 또는 byNode 맵 사용 (buildReverseMap 옵션이 활성화된 경우)
    if (runs.byNode) {
      const runInfo = runs.byNode.get(textNode);
      if (runInfo) {
        return runInfo.start + domOffset;
      }
    }
    return 0;
  }
  
  const run = runs.runs[runIndex];
  
  // run의 시작 offset + textNode 내부 offset
  return run.start + domOffset;
}

/**
 * 텍스트 편집에 따라 mark 범위를 조정
 * 
 * @param marks - 조정할 mark 배열
 * @param edit - 텍스트 편집 정보
 * @returns 조정된 mark 배열
 */
export function adjustMarkRanges(
  marks: MarkRange[],
  edit: TextEdit
): MarkRange[] {
  if (!marks || marks.length === 0) return marks;
  
  const { editPosition, insertedLength, deletedLength } = edit;
  const delta = insertedLength - deletedLength;
  const editEnd = editPosition + deletedLength;  // 삭제 끝 위치
  
  return marks
    .filter(mark => {
      // range가 없거나 유효하지 않은 mark는 제거
      if (!mark || !mark.range || !Array.isArray(mark.range) || mark.range.length !== 2) {
        return false;
      }
      return true;
    })
    .map(mark => {
      const [start, end] = mark.range!; // filter 후이므로 non-null
    
    // 편집이 mark 범위를 완전히 지우는 경우
    if (editPosition <= start && editEnd >= end) {
      // mark 범위가 완전히 삭제됨 → 제거 (filter에서 처리)
      return {
        ...mark,
        range: [0, 0]  // 무효한 범위로 설정하여 filter에서 제거
      };
    }
    
    // 편집 위치가 mark 범위 앞에 있는 경우
    if (editPosition <= start) {
      // mark 범위 전체를 이동
      return {
        ...mark,
        range: [start + delta, end + delta]
      };
    }
    
    // 편집 위치가 mark 범위 안에 있는 경우
    if (editPosition < end) {
      // 삭제가 mark 범위의 일부를 지우는 경우
      if (deletedLength > 0 && editEnd > start && editEnd < end) {
        // 삭제된 부분만큼 end를 줄임
        // 예: mark [5, 15], 삭제 [8, 12] → [5, 11] (4자 삭제, 4자 삽입 없으면)
        const deletedInMark = Math.min(editEnd, end) - Math.max(editPosition, start);
        return {
          ...mark,
          range: [start, end + delta]
        };
      }
      // 삽입만 있는 경우 또는 삭제가 mark 범위 밖에서 끝나는 경우
      return {
        ...mark,
        range: [start, end + delta]
      };
    }
    
    // 편집 위치가 mark 범위 뒤에 있는 경우
    // mark 범위는 변경 없음
    return mark;
  }).filter(mark => {
    // 유효하지 않은 범위 제거 (start >= end 또는 음수)
    const [start, end] = mark.range;
    return start >= 0 && end > start;
  });
}

/**
 * 텍스트 편집에 따라 decorator 범위를 조정
 * 
 * @param decorators - 조정할 decorator 배열
 * @param nodeId - 편집된 inline-text 노드의 sid
 * @param edit - 텍스트 편집 정보
 * @returns 조정된 decorator 배열
 */
export function adjustDecoratorRanges(
  decorators: DecoratorRange[],
  nodeId: string,
  edit: TextEdit
): DecoratorRange[] {
  if (!decorators || decorators.length === 0) return decorators;
  
  const { editPosition, insertedLength, deletedLength } = edit;
  const delta = insertedLength - deletedLength;
  const editEnd = editPosition + deletedLength;  // 삭제 끝 위치
  
  return decorators.map(decorator => {
    // 해당 노드에 적용된 decorator만 조정
    if (decorator.target.sid !== nodeId) {
      return decorator;
    }
    
    const { startOffset, endOffset } = decorator.target;
    
    // 편집이 decorator 범위를 완전히 지우는 경우
    if (editPosition <= startOffset && editEnd >= endOffset) {
      // decorator 범위가 완전히 삭제됨 → 제거 (filter에서 처리)
      return {
        ...decorator,
        target: {
          ...decorator.target,
          startOffset: 0,
          endOffset: 0  // 무효한 범위로 설정하여 filter에서 제거
        }
      };
    }
    
    // 편집 위치가 decorator 범위 앞에 있는 경우
    if (editPosition <= startOffset) {
      return {
        ...decorator,
        target: {
          ...decorator.target,
          startOffset: startOffset + delta,
          endOffset: endOffset + delta
        }
      };
    }
    
    // 편집 위치가 decorator 범위 안에 있는 경우
    if (editPosition < endOffset) {
      // 삭제가 decorator 범위의 일부를 지우는 경우
      if (deletedLength > 0 && editEnd > startOffset && editEnd < endOffset) {
        // 삭제된 부분만큼 end를 줄임
        return {
          ...decorator,
          target: {
            ...decorator.target,
            endOffset: endOffset + delta
          }
        };
      }
      // 삽입만 있는 경우 또는 삭제가 decorator 범위 밖에서 끝나는 경우
      return {
        ...decorator,
        target: {
          ...decorator.target,
          endOffset: endOffset + delta
        }
      };
    }
    
    // 편집 위치가 decorator 범위 뒤에 있는 경우
    // decorator 범위는 변경 없음
    return decorator;
  }).filter(decorator => {
    // 유효하지 않은 범위 제거
    const { startOffset, endOffset } = decorator.target;
    return startOffset >= 0 && endOffset > startOffset;
  });
}

/**
 * 현재 Selection에서 DOM 편집 위치 추출
 */
export function getDOMEditPositionFromSelection(): DOMEditPosition | null {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return null;
  
  const range = selection.getRangeAt(0);
  const textNode = range.startContainer;
  
  if (textNode.nodeType !== Node.TEXT_NODE) {
    return null;
  }
  
  return {
    textNode: textNode as Text,
    offset: range.startOffset
  };
}

/**
 * inline-text 노드의 모든 text node를 합쳐서 model text 재구성
 * 
 * ⚠️ 주의: 이 함수는 전체 DOM을 순회하므로 비용이 큽니다.
 * 가능하면 MutationObserver의 oldValue/newValue를 사용하세요.
 * 
 * @param inlineTextNode - inline-text 노드 (data-bc-sid가 있는 span)
 * @returns 재구성된 model text
 */
/**
 * 여러 노드에 걸친 범위의 모델 텍스트 추출
 * 
 * @param dataStore - DataStore 인스턴스
 * @param contentRange - 여러 노드에 걸친 범위
 * @returns 추출된 텍스트
 */
export function extractModelTextFromRange(
  dataStore: any,
  contentRange: ModelSelection
): string {
  const { startNodeId, startOffset, endNodeId, endOffset } = contentRange;
  
  // 같은 노드인 경우
  if (startNodeId === endNodeId) {
    const node = dataStore.getNode(startNodeId);
    if (!node || typeof node.text !== 'string') return '';
    const text = node.text;
    return text.substring(startOffset, endOffset);
  }
  
  // 여러 노드에 걸친 경우
  let result = '';
  
  // 시작 노드의 끝 부분
  const startNode = dataStore.getNode(startNodeId);
  if (startNode && typeof startNode.text === 'string') {
    const startText = startNode.text;
    result += startText.substring(startOffset);
  }
  
  // 중간 노드들 (부모가 같은 경우 순회)
  // TODO: 더 정확한 순회 로직 필요 (현재는 간단히 처리)
  // 실제로는 dataStore에서 노드 간 관계를 확인해야 함
  
  // 끝 노드의 시작 부분
  const endNode = dataStore.getNode(endNodeId);
  if (endNode && typeof endNode.text === 'string') {
    const endText = endNode.text;
    result += endText.substring(0, endOffset);
  }
  
  return result;
}

export function reconstructModelTextFromDOM(inlineTextNode: Element): string {
  // buildTextRunIndex를 사용하여 모든 text node를 순회하고 합침
  const runs = buildTextRunIndex(inlineTextNode, undefined, {
    normalizeWhitespace: false  // 공백도 그대로 유지
  });
  
  // 모든 text node의 텍스트를 순서대로 합침
  return runs.runs
    .map(run => run.domTextNode.textContent || '')
    .join('');
}

/**
 * 텍스트 편집 후 inline-text 노드의 DOM을 분석하여 모델 업데이트
 * 
 * 이 함수는 편집이 발생한 후 호출되어:
 * 1. DOM에서 실제 텍스트를 재구성
 * 2. 편집 위치를 찾아서 mark/decorator 범위 조정
 * 3. 모델 업데이트 정보 반환
 * 
 * @param inlineTextNode - 편집된 inline-text 노드
 * @param oldModelText - 편집 전 모델 텍스트 (비교용)
 * @param editPosition - 편집이 발생한 모델 offset (선택적, 없으면 자동 감지)
 * @returns 모델 업데이트 정보
 */
export function analyzeDOMEditAndAdjustRanges(
  inlineTextNode: Element,
  oldModelText: string,
  editPosition?: number
): {
  newText: string;
  adjustedMarks: MarkRange[];
  adjustedDecorators: DecoratorRange[];
  editInfo: TextEdit;
} | null {
  const nodeId = inlineTextNode.getAttribute('data-bc-sid');
  if (!nodeId) return null;
  
  // 1. DOM에서 실제 텍스트 재구성
  const newText = reconstructModelTextFromDOM(inlineTextNode);
  
  if (newText === oldModelText) {
    // 변경 없음
    return null;
  }
  
  // 2. 편집 위치 자동 감지 (LCS 알고리즘 사용)
  const selection = window.getSelection();
  let detectedEditPosition = editPosition;
  
  if (detectedEditPosition === undefined && selection && selection.rangeCount > 0) {
    const range = selection.getRangeAt(0);
    if (range.startContainer.nodeType === Node.TEXT_NODE) {
      const domPosition = {
        textNode: range.startContainer as Text,
        offset: range.startOffset
      };
      const modelPos = convertDOMToModelPosition(domPosition, inlineTextNode);
      if (modelPos) {
        detectedEditPosition = modelPos.offset;
      }
    }
  }
  
  // 편집 위치를 찾을 수 없으면 텍스트 변경 분석으로 추정
  if (detectedEditPosition === undefined) {
    // 간단한 휴리스틱: 텍스트 길이 차이로 추정
    const lengthDiff = newText.length - oldModelText.length;
    if (lengthDiff > 0) {
      // 삽입: 새 텍스트가 더 길면, 공통 접두사 이후에 삽입된 것으로 간주
      let commonPrefix = 0;
      while (
        commonPrefix < oldModelText.length &&
        commonPrefix < newText.length &&
        oldModelText[commonPrefix] === newText[commonPrefix]
      ) {
        commonPrefix++;
      }
      detectedEditPosition = commonPrefix;
    } else {
      // 삭제: 공통 접두사 이후에 삭제된 것으로 간주
      let commonPrefix = 0;
      while (
        commonPrefix < oldModelText.length &&
        commonPrefix < newText.length &&
        oldModelText[commonPrefix] === newText[commonPrefix]
      ) {
        commonPrefix++;
      }
      detectedEditPosition = commonPrefix;
    }
  }
  
  // 3. 편집 정보 생성
  const insertedLength = Math.max(0, newText.length - oldModelText.length);
  const deletedLength = Math.max(0, oldModelText.length - newText.length);
  const editType: 'insert' | 'delete' | 'replace' = 
    insertedLength > 0 && deletedLength > 0 ? 'replace' :
    insertedLength > 0 ? 'insert' : 'delete';
  
  const editInfo: TextEdit = {
    nodeId,
    oldText: oldModelText,
    newText,
    editPosition: detectedEditPosition || 0,
    editType,
    insertedLength,
    deletedLength
  };
  
  // 4. Mark 범위 조정은 호출자가 제공해야 함 (editor.dataStore에서 marks 가져와야 함)
  // 5. Decorator 범위 조정도 호출자가 제공해야 함 (editor.getDecorators()에서 가져와야 함)
  
  return {
    newText,
    adjustedMarks: [], // 호출자가 adjustMarkRanges로 조정해야 함
    adjustedDecorators: [], // 호출자가 adjustDecoratorRanges로 조정해야 함
    editInfo
  };
}

/**
 * 통합 편집 처리 함수
 * 
 * inline-text 하위 DOM을 다시 분석하여 model text 재구성하고,
 * mark/decorator 범위를 자동으로 조정합니다.
 * 
 * @param textNode - 편집이 발생한 DOM text node
 * @param oldModelText - 편집 전 모델 텍스트
 * @param modelMarks - 현재 모델의 marks 배열
 * @param decorators - 현재 decorators 배열
 * @returns 모델 업데이트 정보
 */
export function handleContentEditableEdit(
  textNode: Text,
  oldModelText: string,
  modelMarks: MarkRange[],
  decorators: DecoratorRange[]
): {
  newText: string;
  adjustedMarks: MarkRange[];
  adjustedDecorators: DecoratorRange[];
  editInfo: TextEdit;
} | null {
  // 1. inline-text 노드 찾기
  const inlineTextNode = findInlineTextNode(textNode);
  if (!inlineTextNode) return null;
  
  const nodeId = inlineTextNode.getAttribute('data-bc-sid');
  if (!nodeId) return null;
  
  // 2. DOM에서 실제 텍스트 재구성 (편집 후)
  const newText = reconstructModelTextFromDOM(inlineTextNode);
  
  if (newText === oldModelText) {
    // 변경 없음
    return null;
  }
  
  // 3. 편집 위치 파악 (Selection에서)
  const selection = window.getSelection();
  let editPosition: number | undefined;
  
  if (selection && selection.rangeCount > 0) {
    const range = selection.getRangeAt(0);
    if (range.startContainer.nodeType === Node.TEXT_NODE) {
      const domPosition = {
        textNode: range.startContainer as Text,
        offset: range.startOffset
      };
      const modelPos = convertDOMToModelPosition(domPosition, inlineTextNode);
      if (modelPos) {
        editPosition = modelPos.offset;
      }
    }
  }
  
  // 편집 위치를 찾을 수 없으면 텍스트 변경 분석으로 추정
  if (editPosition === undefined) {
    // 공통 접두사 찾기
    let commonPrefix = 0;
    while (
      commonPrefix < oldModelText.length &&
      commonPrefix < newText.length &&
      oldModelText[commonPrefix] === newText[commonPrefix]
    ) {
      commonPrefix++;
    }
    editPosition = commonPrefix;
  }
  
  // 4. 편집 정보 생성
  const insertedLength = Math.max(0, newText.length - oldModelText.length);
  const deletedLength = Math.max(0, oldModelText.length - newText.length);
  const editType: 'insert' | 'delete' | 'replace' = 
    insertedLength > 0 && deletedLength > 0 ? 'replace' :
    insertedLength > 0 ? 'insert' : 'delete';
  
  const editInfo: TextEdit = {
    nodeId,
    oldText: oldModelText,
    newText,
    editPosition: editPosition || 0,
    editType,
    insertedLength,
    deletedLength
  };
  
  // 5. Mark 범위 조정
  const adjustedMarks = adjustMarkRanges(modelMarks, editInfo);
  
  // 6. Decorator 범위 조정
  const adjustedDecorators = adjustDecoratorRanges(decorators, nodeId, editInfo);
  
  return {
    newText,
    adjustedMarks,
    adjustedDecorators,
    editInfo
  };
}

