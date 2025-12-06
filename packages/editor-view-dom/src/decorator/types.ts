/**
 * Decorator Target type
 * - Single node target or range target
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
 * Decorator type
 * - Managed by DecoratorManager
 * - Supports both regular decorator and pattern decorator
 */
export interface Decorator {
  sid: string;
  stype: string; // Decorator type (comment, highlight, color-picker, etc.)
  category: 'layer' | 'inline' | 'block';
  data?: Record<string, any>;
  /**
   * Decorator target
   * - inline/block: Required (specify which node/range to apply to)
   * - layer: Optional (works as overlay, so target is not required)
   *   - Overlays like cursor, selection specify position only with data.position without target
   */
  target?: DecoratorTarget;
  /**
   * Layer target for rendering
   * - 'content': Content layer (default for inline/block decorator)
   * - 'decorator': Decorator layer (default for layer decorator)
   * - 'selection': Selection layer
   * - 'context': Context layer
   * - 'custom': Custom layer
   */
  layerTarget?: 'content' | 'decorator' | 'selection' | 'context' | 'custom';
  enabled?: boolean; // Enabled status (default: true)
  decoratorType?: 'target' | 'pattern' | 'custom'; // Decorator type: 'target' (regular), 'pattern' (pattern-based), 'custom' (function-based, default: 'target')
  position?: DecoratorPosition; // Rendering position (optional)
  
  // Metadata (optional)
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

// BUILTIN_*_TYPES must be defined in schema
// editor-view-dom must know decorator types through schema

/**
 * Decorator query options
 */
export interface DecoratorQueryOptions {
  type?: string;
  category?: 'layer' | 'inline' | 'block';
  nodeId?: string;
  sortBy?: 'id' | 'type' | 'category';
  sortOrder?: 'asc' | 'desc';
  enabledOnly?: boolean; // If true, only return enabled ones (default: true)
}

/**
 * Decorator update options
 */
export interface DecoratorUpdateOptions {
  partial?: boolean; // If true, partial update, if false, full replacement
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
 * Layer Decorator type
 * - Works as overlay (position: absolute)
 * - target is optional (for cases like cursor, selection, use only data.position without target)
 */
export interface LayerDecorator extends Decorator {
  category: 'layer';
  target?: DecoratorTarget; // Layer is overlay, so target is optional
}

/**
 * Inline Decorator type
 * - Decorator applied to text range
 * - target required (specify which text range to apply to)
 */
export interface InlineDecorator extends Decorator {
  category: 'inline';
  target: DecoratorTarget; // Inline requires target
}

/**
 * Block Decorator type
 * - Decorator applied to block node
 * - target required (specify which block node to apply to)
 */
export interface BlockDecorator extends Decorator {
  category: 'block';
  target: DecoratorTarget; // Block requires target
}