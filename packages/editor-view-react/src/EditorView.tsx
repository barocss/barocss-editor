import type { EditorViewProps, EditorViewOverlayLayerProps } from './types';
import { EditorViewContentLayer } from './EditorViewContentLayer';
import { EditorViewLayer } from './EditorViewLayer';
import { EditorViewContextProvider } from './EditorViewContext';

/**
 * EditorView: composite view that renders content layer and optional overlay layers.
 * Provides EditorViewContext (selectionHandler, inputHandler, mutationObserverManager, viewState) so layers share view state.
 * Layers can be configured via options.layers or composed by using EditorView.ContentLayer / EditorView.DecoratorLayer etc.
 */
export function EditorView({ editor, options = {}, children }: EditorViewProps) {
  const { className: containerClassName = '', layers: layersConfig } = options;

  const contentOptions = {
    registry: options.registry,
    className: 'barocss-editor-content',
    editable: true,
    ...layersConfig?.content,
  };

  return (
    <EditorViewContextProvider editor={editor}>
      <div
        className={containerClassName}
        style={{ position: 'relative', overflow: 'hidden' }}
        data-editor-view="true"
      >
        <EditorViewContentLayer options={contentOptions} />
      {layersConfig?.decorator && (
        <EditorView.DecoratorLayer className={layersConfig.decorator.className} style={layersConfig.decorator.style} />
      )}
      {layersConfig?.selection && (
        <EditorView.SelectionLayer className={layersConfig.selection.className} style={layersConfig.selection.style} />
      )}
      {layersConfig?.context && (
        <EditorView.ContextLayer className={layersConfig.context.className} style={layersConfig.context.style} />
      )}
      {(layersConfig?.custom || children) && (
        <EditorView.CustomLayer className={layersConfig?.custom?.className} style={layersConfig?.custom?.style}>
          {children}
        </EditorView.CustomLayer>
      )}
      </div>
    </EditorViewContextProvider>
  );
}

EditorView.ContentLayer = EditorViewContentLayer;

function createOverlayLayer(layer: 'decorator' | 'selection' | 'context' | 'custom') {
  return function OverlayLayer({ className, style, children }: EditorViewOverlayLayerProps) {
    return (
      <EditorViewLayer layer={layer} className={className} style={style}>
        {children}
      </EditorViewLayer>
    );
  };
}

EditorView.DecoratorLayer = createOverlayLayer('decorator');
EditorView.SelectionLayer = createOverlayLayer('selection');
EditorView.ContextLayer = createOverlayLayer('context');
EditorView.CustomLayer = createOverlayLayer('custom');

/** Generic overlay layer (pass layer prop when you need a dynamic type). */
EditorView.Layer = EditorViewLayer;
