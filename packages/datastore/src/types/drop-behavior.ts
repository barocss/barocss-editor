import type { INode } from '../types';

/**
 * Drop Behavior 타입
 * 
 * 드롭 타겟에 소스 노드를 드롭했을 때의 행위를 정의합니다.
 */
export type DropBehavior = 'move' | 'copy' | 'merge' | 'transform' | 'wrap' | 'replace' | 'insert';

/**
 * Drop Context
 * 
 * 드롭 시 UI 컨텍스트 정보를 담습니다.
 */
export interface DropContext {
  /**
   * 키보드 수정자 키 상태
   */
  modifiers?: {
    ctrlKey?: boolean;  // Ctrl key (Windows/Linux)
    metaKey?: boolean;  // Cmd key (Mac)
    shiftKey?: boolean; // Shift key
    altKey?: boolean;   // Alt key
  };
  
  /**
   * 드롭 위치 (노드 내부에서의 위치)
   */
  position?: number;
  
  /**
   * 드롭 영역
   */
  dropZone?: 'before' | 'after' | 'inside';
  
  /**
   * 드래그 소스의 출처
   */
  sourceOrigin?: 'internal' | 'external';
}

/**
 * Drop Behavior Definition
 * 
 * defineDropBehavior로 등록되는 규칙 정의입니다.
 */
export interface DropBehaviorDefinition {
  /**
   * 타겟 노드 타입 (stype 또는 group) 또는 배열
   */
  targetType: string | string[];
  
  /**
   * 소스 노드 타입 (선택적, 없으면 모든 소스)
   */
  sourceType?: string | string[];
  
  /**
   * 드롭 행위 또는 함수
   * 
   * 함수인 경우:
   * - null을 반환하면 다음 우선순위 규칙 확인
   * - DropBehavior를 반환하면 해당 행위 사용
   */
  behavior: DropBehavior | 
    ((targetNode: INode, sourceNode: INode, context: DropContext) => DropBehavior | null);
  
  /**
   * 우선순위 (높을수록 우선, 기본값: 0)
   */
  priority?: number;
}

