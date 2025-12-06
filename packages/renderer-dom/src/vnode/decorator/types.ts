/**
 * @barocss/vnode - Decorator Types
 * 
 * Types specific to decorator processing
 * 
 * Note: These types are defined in renderer-dom to avoid circular dependencies.
 * editor-view-dom should use these types or define compatible types.
 */

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
 * Decorator type
 * - Decorator type used in renderer-dom
 * - Must be compatible with Decorator type in editor-view-dom
 */
export interface Decorator {
  sid: string;
  stype: string; // decorator type (comment, highlight, color-picker, etc.)
  category: 'layer' | 'inline' | 'block';
  data?: Record<string, any>;
  target: DecoratorTarget;
  /**
   * Layer target to render
   * - 'content': Content layer (default for inline/block decorator)
   * - 'decorator': Decorator layer (default for layer decorator)
   * - 'selection': Selection layer
   * - 'context': Context layer
   * - 'custom': Custom layer
   */
  layerTarget?: 'content' | 'decorator' | 'selection' | 'context' | 'custom';
  enabled?: boolean; // Whether enabled (default: true)
  decoratorType?: 'target' | 'pattern' | 'custom'; // decorator kind: 'target' (general), 'pattern' (pattern-based), 'custom' (function-based, default: 'target')
  position?: DecoratorPosition; // Rendering position (optional)
  
  // Metadata (optional)
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
   * SelectionContext: inject selection info at render time (read-only)
   * - sid: identifier of model node that selection belongs to
   * - modelOffset: offset based on text within that sid (grapheme-safe)
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
  decorator?: Decorator;  // Single decorator (backward compatibility)
  decorators?: Decorator[];  // Multiple decorators (before/after, etc.)
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

