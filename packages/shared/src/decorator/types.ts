/**
 * Shared decorator types used by editor-view-dom, editor-view-react, and renderers.
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
  decoratorType?: 'target' | 'pattern' | 'custom';
  position?: DecoratorPosition;
  createdAt?: number;
  updatedAt?: number;
  author?: string;
  version?: number;
}

export interface DecoratorQueryOptions {
  type?: string;
  category?: 'layer' | 'inline' | 'block';
  nodeId?: string;
  sortBy?: 'id' | 'type' | 'category';
  sortOrder?: 'asc' | 'desc';
  enabledOnly?: boolean;
}

export interface DecoratorUpdateOptions {
  partial?: boolean;
}

export interface DecoratorEvents {
  [key: string]: (...args: any[]) => void;
  'decorator:added': (decorator: Decorator) => void;
  'decorator:updated': (decorator: Decorator) => void;
  'decorator:removed': (id: string) => void;
}

export interface LayerDecorator extends Decorator {
  category: 'layer';
  target?: DecoratorTarget;
}

export interface InlineDecorator extends Decorator {
  category: 'inline';
  target: DecoratorTarget;
}

export interface BlockDecorator extends Decorator {
  category: 'block';
  target: DecoratorTarget;
}
