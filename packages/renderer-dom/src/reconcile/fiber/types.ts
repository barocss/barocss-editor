import { VNode } from '../../vnode/types';

/**
 * Effect Tag - DOM 조작 타입
 * 
 * React의 effectTag와 동일한 개념으로, Commit Phase에서 수행할 DOM 조작을 표시
 */
export const EffectTag = {
  /** 새 DOM 요소를 삽입해야 함 (mount) */
  PLACEMENT: 'PLACEMENT',
  /** 기존 DOM 요소를 업데이트해야 함 (update) */
  UPDATE: 'UPDATE',
  /** 기존 DOM 요소를 제거해야 함 (unmount) */
  DELETION: 'DELETION',
} as const;

export type EffectTagType = typeof EffectTag[keyof typeof EffectTag] | null;

/**
 * Fiber Node - 작업 단위
 * 
 * React의 Fiber와 유사한 구조로, VNode를 작은 단위로 처리하기 위한 구조
 */
export interface FiberNode {
  // VNode 정보
  vnode: VNode;
  prevVNode: VNode | undefined;
  
  // DOM 정보
  domElement: HTMLElement | null;
  parent: HTMLElement; // 실제 DOM parent
  
  // Fiber 트리 구조
  parentFiber: FiberNode | null;      // 부모 Fiber
  child: FiberNode | null;             // 첫 번째 자식 Fiber
  sibling: FiberNode | null;           // 다음 형제 Fiber
  return: FiberNode | null;            // 작업 완료 후 돌아갈 Fiber (보통 parentFiber와 같음)
  
  // 작업 상태
  effectTag: EffectTagType;
  alternate: FiberNode | null;         // 이전 Fiber (diffing용)
  
  // 컨텍스트
  context: any;
  
  // 인덱스 (children 배열에서의 위치)
  index: number;
  
  // Primitive text children 정보 (자식 Fiber 처리 후 처리하기 위해 저장)
  primitiveTextChildren?: Array<{ text: string | number; index: number }>;
}

/**
 * Fiber 작업 우선순위
 */
export enum FiberPriority {
  Immediate = 1,    // 즉시 처리 (사용자 입력 등)
  High = 2,         // 높은 우선순위
  Normal = 3,       // 일반 우선순위
  Low = 4,          // 낮은 우선순위
  Idle = 5          // 유휴 시간에 처리
}

/**
 * Fiber 작업 상태
 */
export enum FiberWorkStatus {
  Pending = 'pending',     // 대기 중
  InProgress = 'in-progress', // 진행 중
  Completed = 'completed',     // 완료
  Cancelled = 'cancelled'      // 취소됨
}

