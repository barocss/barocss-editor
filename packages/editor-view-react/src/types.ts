import type { Editor } from '@barocss/editor-core';
import type { RendererRegistry } from '@barocss/dsl';

export type EditorViewLayerType = 'decorator' | 'selection' | 'context' | 'custom';

/** Options for the content layer (document rendering). */
export interface EditorViewContentLayerOptions {
  /** Renderer registry. If omitted, uses getGlobalRegistry(). */
  registry?: RendererRegistry;
  /** Class name for the contenteditable wrapper. */
  className?: string;
  /** Whether the content is editable. Default true. */
  editable?: boolean;
}

/** Options for overlay layers (decorator, selection, context, custom). */
export interface EditorViewLayerOptions {
  /** Class name for the layer wrapper. */
  className?: string;
  /** Inline styles. */
  style?: React.CSSProperties;
}

/** Layer configuration for EditorView (optional per-layer classNames/styles). */
export interface EditorViewLayersConfig {
  content?: EditorViewContentLayerOptions;
  decorator?: EditorViewLayerOptions;
  selection?: EditorViewLayerOptions;
  context?: EditorViewLayerOptions;
  custom?: EditorViewLayerOptions;
}

export interface EditorViewOptions {
  /** Renderer registry (used by content layer if layers.content not set). */
  registry?: RendererRegistry;
  /** Class name for the root container. */
  className?: string;
  /** Per-layer configuration. */
  layers?: EditorViewLayersConfig;
}

export interface EditorViewProps {
  /** Editor instance. */
  editor: Editor;
  /** Optional options (registry, className, layers). */
  options?: EditorViewOptions;
  /** Optional children (e.g. custom layer content). Rendered inside the custom layer slot when present. */
  children?: React.ReactNode;
}

export interface EditorViewContentLayerProps {
  /** Options (registry, className, editable). Editor is taken from EditorViewContext only. */
  options?: EditorViewContentLayerOptions;
}

export interface EditorViewLayerProps {
  /** Layer type (data-bc-layer value). */
  layer: EditorViewLayerType;
  /** Optional className. */
  className?: string;
  /** Optional style. */
  style?: React.CSSProperties;
  children?: React.ReactNode;
}

/** Props for named overlay layers (DecoratorLayer, SelectionLayer, ContextLayer, CustomLayer). */
export interface EditorViewOverlayLayerProps {
  className?: string;
  style?: React.CSSProperties;
  children?: React.ReactNode;
}
