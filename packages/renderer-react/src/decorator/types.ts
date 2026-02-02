/**
 * Decorator types for renderer-react.
 * Shape is compatible with renderer-dom so the same Decorator[] can be passed from editor-view.
 */

export type DecoratorTarget =
  | { sid: string; startOffset?: number; endOffset?: number }
  | { startSid: string; startOffset?: number; endSid: string; endOffset?: number };

export type DecoratorPosition =
  | 'before'
  | 'after'
  | 'inside-start'
  | 'inside-end'
  | 'overlay'
  | 'absolute';

export interface Decorator {
  sid: string;
  stype: string;
  category: 'layer' | 'inline' | 'block';
  data?: Record<string, unknown>;
  /** inline/block: required; layer: optional (overlay). */
  target?: DecoratorTarget;
  layerTarget?: 'content' | 'decorator' | 'selection' | 'context' | 'custom';
  enabled?: boolean;
  position?: DecoratorPosition;
}

export interface DecoratorTextRun {
  text: string;
  decorator?: Decorator;
  decorators?: Decorator[];
  start: number;
  end: number;
}

export interface CategorizedDecorators {
  block: Decorator[];
  layer: Decorator[];
  inline: Decorator[];
}
