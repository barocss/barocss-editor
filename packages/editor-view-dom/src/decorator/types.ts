/**
 * Decorator types aligned with @barocss/shared and @barocss/renderer-dom.
 * Re-export from shared for single source of truth.
 */
export type {
  Decorator,
  DecoratorTarget,
  DecoratorPosition,
  DecoratorQueryOptions,
  DecoratorUpdateOptions,
  DecoratorEvents,
  LayerDecorator,
  InlineDecorator,
  BlockDecorator
} from '@barocss/shared';

/**
 * Decorator type schema (editor-view-dom: includes defaultRenderer for registry).
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
 * Decorator renderer function signature.
 */
export type DecoratorRenderer = (decorator: import('@barocss/shared').Decorator, container: HTMLElement) => void;
