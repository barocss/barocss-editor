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

/** Serializable decorator export shape (target decorators + pattern configs without functions). */
export interface DecoratorExportData {
  version: string;
  targetDecorators: Array<{
    sid: string;
    stype: string;
    category: 'layer' | 'inline' | 'block';
    data?: Record<string, unknown>;
    target?: unknown;
    enabled?: boolean;
  }>;
  patternDecorators: Array<{
    sid: string;
    stype: string;
    category: 'inline' | 'block' | 'layer';
    pattern: { source: string; flags: string };
    priority?: number;
    enabled?: boolean;
  }>;
}

/** Schema for a decorator type (description + optional dataSchema for validation/defaults). */
export interface DecoratorTypeSchema {
  description?: string;
  dataSchema?: Record<string, {
    type: 'string' | 'number' | 'boolean' | 'array' | 'object';
    required?: boolean;
    default?: unknown;
  }>;
}

/** Pattern functions for loadDecorators (extractData/createDecorator per sid). */
export interface LoadDecoratorsPatternFunctions {
  [sid: string]: {
    extractData: (match: RegExpMatchArray) => Record<string, unknown>;
    createDecorator: (
      nodeId: string,
      startOffset: number,
      endOffset: number,
      extractedData: Record<string, unknown>
    ) => {
      sid: string;
      target: { sid: string; startOffset: number; endOffset: number };
      data?: Record<string, unknown>;
      category?: 'inline' | 'block' | 'layer';
      layerTarget?: 'content' | 'decorator' | 'selection' | 'context' | 'custom';
    };
  };
}
