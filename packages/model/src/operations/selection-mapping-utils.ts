import type { ModelSelection } from '@barocss/editor-core';

/**
 * Selection 매핑을 위한 공통 유틸리티 함수들
 * Operation별 Selection 매핑 로직을 재사용 가능한 패턴으로 제공합니다.
 */
export class SelectionMappingUtils {
  /**
   * 삽입 후 Selection 이동
   * 텍스트 삽입 시 삽입 위치 이후의 Selection을 이동시킵니다.
   */
  static shiftAfterInsert(
    currentSelection: ModelSelection, 
    operation: { nodeId: string; position: number; text: string }
  ): ModelSelection | null {
    if (currentSelection.startNodeId !== operation.nodeId) return currentSelection;
    
    if (currentSelection.startOffset >= operation.position) {
      return {
        ...currentSelection,
        startOffset: currentSelection.startOffset + operation.text.length,
        endOffset: currentSelection.endOffset + operation.text.length
      };
    }
    return currentSelection;
  }
  
  /**
   * 삭제 후 Selection 이동
   * 텍스트 삭제 시 삭제 범위 시작으로 Selection을 이동시킵니다.
   */
  static collapseToStart(
    currentSelection: ModelSelection,
    operation: { nodeId: string; start: number; end: number }
  ): ModelSelection | null {
    if (currentSelection.startNodeId !== operation.nodeId) return currentSelection;
    
    return {
      ...currentSelection,
      startOffset: operation.start,
      endOffset: operation.start
    };
  }
  
  /**
   * 분할 후 Selection 이동
   * 텍스트 분할 시 분할 지점으로 Selection을 이동시킵니다.
   */
  static moveToSplitPoint(
    currentSelection: ModelSelection,
    operation: { nodeId: string; splitPosition: number }
  ): ModelSelection | null {
    if (currentSelection.startNodeId !== operation.nodeId) return currentSelection;
    
    return {
      ...currentSelection,
      startOffset: operation.splitPosition,
      endOffset: operation.splitPosition
    };
  }
  
  /**
   * Selection 클리어
   * 노드 삭제 시 해당 노드의 Selection을 클리어합니다.
   */
  static clearSelection(
    currentSelection: ModelSelection,
    operation: { nodeId: string }
  ): ModelSelection | null {
    if (currentSelection.startNodeId === operation.nodeId || currentSelection.endNodeId === operation.nodeId) {
      return null; // Selection 클리어
    }
    return currentSelection;
  }
  
  /**
   * Selection 유지
   * Operation이 Selection에 영향을 주지 않는 경우 사용합니다.
   */
  static preserveSelection(
    currentSelection: ModelSelection,
    operation: any
  ): ModelSelection | null {
    return currentSelection;
  }
  
  /**
   * 범위 삭제 후 Selection 조정
   * 특정 범위를 삭제한 후 Selection을 조정합니다.
   */
  static adjustForRangeDelete(
    currentSelection: Selection,
    operation: { nodeId: string; startPosition: number; endPosition: number }
  ): Selection | null {
    if (currentSelection.nodeId !== operation.nodeId) return currentSelection;
    
    const deleteLength = operation.endPosition - operation.startPosition;
    
    // Selection이 삭제 범위와 겹치는 경우
    if (currentSelection.start >= operation.startPosition && 
        currentSelection.start < operation.endPosition) {
      // 삭제 범위 시작으로 이동
      return {
        ...currentSelection,
        start: operation.startPosition,
        end: operation.startPosition
      };
    }
    
    // Selection이 삭제 범위 이후에 있는 경우 오프셋 조정
    if (currentSelection.start >= operation.endPosition) {
      return {
        ...currentSelection,
        start: currentSelection.start - deleteLength,
        end: currentSelection.end - deleteLength
      };
    }
    
    return currentSelection;
  }
}
