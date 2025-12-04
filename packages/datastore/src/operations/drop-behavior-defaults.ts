import { defineDropBehavior } from './drop-behavior-registry';

/**
 * 기본 드롭 행위 규칙을 등록합니다.
 * 이 함수는 DataStore 초기화 시 호출됩니다.
 * 
 * 기본 규칙:
 * - 텍스트 노드 → 텍스트 노드: merge
 * - 같은 타입의 block: move
 * - 기본값: move (내부 드래그)
 */
export function registerDefaultDropBehaviors(): void {
  // 기본 규칙은 UtilityOperations._getDefaultDropBehavior 안에서 처리한다.
}

