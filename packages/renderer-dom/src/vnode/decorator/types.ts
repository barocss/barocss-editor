/**
 * @barocss/vnode - Decorator Types
 * 
 * Types specific to decorator processing
 * 
 * Note: These types are defined in renderer-dom to avoid circular dependencies.
 * editor-view-dom should use these types or define compatible types.
 */

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
 * Decorator Position 타입
 */
export type DecoratorPosition = 
  | 'before'        // insert before target
  | 'after'         // insert after target
  | 'inside-start'  // inside target at start
  | 'inside-end'    // inside target at end
  | 'overlay'       // overlay on top of target
  | 'absolute';     // absolute position in container

/**
 * Decorator 타입
 * - renderer-dom에서 사용하는 decorator 타입
 * - editor-view-dom의 Decorator 타입과 호환되어야 함
 */
export interface Decorator {
  sid: string;
  stype: string; // decorator 타입 (comment, highlight, color-picker 등)
  category: 'layer' | 'inline' | 'block';
  data?: Record<string, any>;
  target: DecoratorTarget;
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

/**
 * Options for building VNodes with decorators
 */
export interface VNodeBuildOptions {
  decorators?: Decorator[];
  sid?: string; // Current node's sid for decorator matching
  /**
   * SelectionContext: 렌더 시점의 선택 정보를 주입 (읽기 전용)
   * - sid: 선택이 속한 모델 노드 식별자
   * - modelOffset: 해당 sid 내 텍스트 기준 오프셋 (grapheme-safe)
   */
  selectionContext?: {
    sid: string;
    modelOffset: number;
  };
}

/**
 * Result of splitting text by decorator ranges
 */
export interface DecoratorTextRun {
  text: string;
  decorator?: Decorator;  // 단일 decorator (하위 호환성)
  decorators?: Decorator[];  // 여러 decorator (before/after 등)
  start: number;
  end: number;
}

/**
 * Categorized decorators by type
 */
export interface CategorizedDecorators {
  block: Decorator[];
  layer: Decorator[];
  inline: Decorator[];
}

