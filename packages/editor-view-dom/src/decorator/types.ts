/**
 * Decorator Target 타입
 * - 단일 노드 타겟 또는 범위 타겟
 */
export type DecoratorTarget = 
  | {
      sid: string;
      startOffset?: number;
      endOffset?: number;
    }
  | {
      startSid: string;
      startOffset?: number;
      endSid: string;
      endOffset?: number;
    };

/**
 * Decorator 타입
 * - DecoratorManager에서 관리
 * - 일반 decorator와 패턴 decorator 모두 지원
 */
export interface Decorator {
  sid: string;
  stype: string; // decorator 타입 (comment, highlight, color-picker 등)
  category: 'layer' | 'inline' | 'block';
  data?: Record<string, any>;
  /**
   * Decorator 타겟
   * - inline/block: 필수 (어떤 노드/범위에 적용할지 지정)
   * - layer: 선택사항 (overlay 형태로 동작하므로 target이 없어도 됨)
   *   - 커서, selection 같은 overlay는 target 없이 data.position으로만 위치 지정
   */
  target?: DecoratorTarget;
  /**
   * 렌더링할 레이어 타겟
   * - 'content': Content 레이어 (inline/block decorator 기본값)
   * - 'decorator': Decorator 레이어 (layer decorator 기본값)
   * - 'selection': Selection 레이어
   * - 'context': Context 레이어
   * - 'custom': Custom 레이어
   */
  layerTarget?: 'content' | 'decorator' | 'selection' | 'context' | 'custom';
  enabled?: boolean; // 활성화 여부 (기본값: true)
  decoratorType?: 'target' | 'pattern' | 'custom'; // decorator 종류: 'target' (일반), 'pattern' (패턴 기반), 'custom' (함수 기반, 기본값: 'target')
  position?: DecoratorPosition; // 렌더링 위치 (선택사항)
  
  // 메타데이터 (선택사항)
  createdAt?: number;
  updatedAt?: number;
  author?: string;
  version?: number;
}

export type DecoratorPosition = 
  | 'before'        // insert before target
  | 'after'         // insert after target
  | 'inside-start'  // inside target at start
  | 'inside-end'    // inside target at end
  | 'overlay'       // overlay on top of target
  | 'absolute';     // absolute position in container

// BUILTIN_*_TYPES는 스키마에서 정의되어야 함
// editor-view-dom은 스키마를 통해 decorator 타입을 알아야 함

/**
 * Decorator 조회 옵션
 */
export interface DecoratorQueryOptions {
  type?: string;
  category?: 'layer' | 'inline' | 'block';
  nodeId?: string;
  sortBy?: 'id' | 'type' | 'category';
  sortOrder?: 'asc' | 'desc';
  enabledOnly?: boolean; // true면 enabled된 것만 반환 (기본값: true)
}

/**
 * Decorator 업데이트 옵션
 */
export interface DecoratorUpdateOptions {
  partial?: boolean; // true면 부분 업데이트, false면 전체 교체
}

/**
 * Decorator 이벤트 타입
 */
export interface DecoratorEvents extends Record<string, (...args: any[]) => void> {
  'decorator:added': (decorator: Decorator) => void;
  'decorator:updated': (decorator: Decorator) => void;
  'decorator:removed': (id: string) => void;
}

/**
 * Decorator 타입 스키마
 */
export interface DecoratorTypeSchema {
  description?: string;
  defaultRenderer?: string;
  dataSchema?: Record<string, {
    type: 'string' | 'number' | 'boolean' | 'array' | 'object';
    required?: boolean;
    default?: any;
  }>;
}

/**
 * Decorator 렌더러
 */
export type DecoratorRenderer = (decorator: Decorator, container: HTMLElement) => void;

/**
 * Layer Decorator 타입
 * - Overlay 형태로 동작 (position: absolute)
 * - target은 선택사항 (커서, selection 같은 경우 target 없이 data.position만 사용)
 */
export interface LayerDecorator extends Decorator {
  category: 'layer';
  target?: DecoratorTarget; // Layer는 overlay이므로 target이 선택사항
}

/**
 * Inline Decorator 타입
 * - 텍스트 범위에 적용되는 decorator
 * - target 필수 (어떤 텍스트 범위에 적용할지 지정)
 */
export interface InlineDecorator extends Decorator {
  category: 'inline';
  target: DecoratorTarget; // Inline은 target 필수
}

/**
 * Block Decorator 타입
 * - 블록 노드에 적용되는 decorator
 * - target 필수 (어떤 블록 노드에 적용할지 지정)
 */
export interface BlockDecorator extends Decorator {
  category: 'block';
  target: DecoratorTarget; // Block은 target 필수
}