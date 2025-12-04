import type { DataStore } from '../data-store';

/**
 * Decorator Range 인터페이스
 * editor-view-dom의 DecoratorRange와 동일한 구조
 */
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

/**
 * Text Edit 정보 인터페이스
 */
export interface TextEdit {
  nodeId: string;        // 편집된 inline-text 노드의 sid
  oldText: string;       // 편집 전 텍스트
  newText: string;       // 편집 후 텍스트
  editPosition: number;  // 편집이 시작된 모델 offset
  editType: 'insert' | 'delete' | 'replace';
  insertedLength: number;
  deletedLength: number;
  insertedText: string;  // 삽입/교체할 텍스트 내용
}

/**
 * Decorator Management 연산들
 * 
 * Decorator 범위 조정 기능을 제공합니다.
 * 실제 저장은 editor-view-dom에서 관리하지만,
 * 텍스트 편집 시 decorator 범위를 자동으로 조정하는 로직을 제공합니다.
 */
export class DecoratorOperations {
  constructor(private dataStore: DataStore) {}

  /**
   * 텍스트 편집에 따라 decorator 범위를 조정
   * 
   * @param decorators - 조정할 decorator 배열
   * @param nodeId - 편집된 inline-text 노드의 sid
   * @param edit - 텍스트 편집 정보
   * @returns 조정된 decorator 배열
   */
  adjustRanges(
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
}

