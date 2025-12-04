/**
 * DOM Observer Types
 * 
 * DOM 변경사항 감지와 관련된 타입 정의들
 */

/**
 * MutationObserver 관리자 인터페이스
 * 
 * @interface MutationObserverManager
 */
export interface MutationObserverManager {
  /** MutationObserver 설정 */
  setup(contentEditableElement: HTMLElement): void;
  
  /** MutationObserver 연결 해제 */
  disconnect(): void;
  
  /** 개별 mutation 처리 */
  handleMutation(mutation: MutationRecord): void;
}

/**
 * DOM 구조 변경 이벤트 데이터
 * 
 * @interface DOMStructureChangeEvent
 */
export interface DOMStructureChangeEvent {
  /** 변경 타입 */
  type: 'structure';
  
  /** 추가된 노드들 */
  addedNodes: Node[];
  
  /** 제거된 노드들 */
  removedNodes: Node[];
  
  /** 변경이 발생한 타겟 노드 */
  target: Node;
}

/**
 * 노드 업데이트 이벤트 데이터
 * 
 * @interface NodeUpdateEvent
 */
export interface NodeUpdateEvent {
  /** 변경 타입 */
  type: 'attribute';
  
  /** 변경된 속성명 */
  attributeName: string;
  
  /** 이전 값 */
  oldValue: string | null;
  
  /** 새로운 값 */
  newValue: string | null;
  
  /** 변경된 요소 */
  target: Element;
  
  /** 노드 ID */
  nodeId: string | null;
}

/**
 * 텍스트 변경 이벤트 데이터
 * 
 * @interface TextChangeEvent
 */
export interface TextChangeEvent {
  /** 이전 텍스트 */
  oldText: string | null;
  
  /** 새로운 텍스트 */
  newText: string | null;
  
  /** 변경된 노드 */
  target: Node;
}

/**
 * MutationObserver 옵션
 * 
 * @interface MutationObserverOptions
 */
export interface MutationObserverOptions {
  /** 자식 노드 변경 감지 */
  childList?: boolean;
  
  /** 하위 트리 변경 감지 */
  subtree?: boolean;
  
  /** 텍스트 노드 변경 감지 */
  characterData?: boolean;
  
  /** 속성 변경 감지 */
  attributes?: boolean;
  
  /** 감지할 속성 필터 */
  attributeFilter?: string[];
  
  /** 이전 값 저장 */
  characterDataOldValue?: boolean;
  
  /** 속성 이전 값 저장 */
  attributeOldValue?: boolean;
}
