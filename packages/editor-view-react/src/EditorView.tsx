import { forwardRef, useImperativeHandle, useRef } from 'react';
import type { RendererRegistry } from '@barocss/dsl';
import type { EditorViewProps, EditorViewOverlayLayerProps, EditorViewRef } from './types';
import { EditorViewContentLayer } from './EditorViewContentLayer';
import { EditorViewLayer } from './EditorViewLayer';
import { EditorViewOverlayLayerContent } from './EditorViewOverlayLayerContent';
import { EditorViewContextProvider, useEditorViewContext } from './EditorViewContext';

interface OverlaySlotProps {
  registry?: RendererRegistry;
  className?: string;
  style?: React.CSSProperties;
}

function DecoratorLayerSlot({ registry, className, style }: OverlaySlotProps) {
  return (
    <EditorViewLayer layer="decorator" className={className} style={style}>
      <EditorViewOverlayLayerContent layer="decorator" registry={registry} />
    </EditorViewLayer>
  );
}
function SelectionLayerSlot({ registry, className, style }: OverlaySlotProps) {
  return (
    <EditorViewLayer layer="selection" className={className} style={style}>
      <EditorViewOverlayLayerContent layer="selection" registry={registry} />
    </EditorViewLayer>
  );
}
function ContextLayerSlot({ registry, className, style }: OverlaySlotProps) {
  return (
    <EditorViewLayer layer="context" className={className} style={style}>
      <EditorViewOverlayLayerContent layer="context" registry={registry} />
    </EditorViewLayer>
  );
}
function CustomLayerSlot({
  registry,
  className,
  style,
  children,
}: OverlaySlotProps & { children?: React.ReactNode }) {
  return (
    <EditorViewLayer layer="custom" className={className} style={style}>
      <EditorViewOverlayLayerContent layer="custom" registry={registry} />
      {children}
    </EditorViewLayer>
  );
}

/**
 * Inner root: lives inside EditorViewContextProvider, exposes ref API (addDecorator, removeDecorator, getDecorators).
 */
const EditorViewRoot = forwardRef<EditorViewRef, { options: EditorViewProps['options']; children: EditorViewProps['children'] }>(
  function EditorViewRoot({ options = {}, children }, ref) {
    const { decoratorManagerRef } = useEditorViewContext();
    const apiRef = useRef<EditorViewRef | null>(null);

    useImperativeHandle(
      ref,
      () => {
        if (!apiRef.current) {
          apiRef.current = {
            addDecorator(decorator) {
              decoratorManagerRef.current?.add(decorator);
            },
            removeDecorator(id) {
              try {
                decoratorManagerRef.current?.remove(id);
              } catch {
                // ignore if not found
              }
            },
            updateDecorator(id, updates) {
              decoratorManagerRef.current?.update(id, updates);
            },
            getDecorators() {
              return decoratorManagerRef.current?.getAll() ?? [];
            },
            get decoratorManager() {
              return decoratorManagerRef.current ?? null;
            },
          };
        }
        return apiRef.current;
      },
      [decoratorManagerRef]
    );

    const { className: containerClassName = '', layers: layersConfig } = options;
    const contentOptions = {
      registry: options.registry,
      className: 'barocss-editor-content',
      editable: true,
      ...layersConfig?.content,
    };

    return (
      <div
        className={containerClassName}
        style={{ position: 'relative', overflow: 'hidden' }}
        data-editor-view="true"
      >
        <EditorViewContentLayer options={contentOptions} />
        <DecoratorLayerSlot
          registry={options.registry}
          className={layersConfig?.decorator?.className}
          style={layersConfig?.decorator?.style}
        />
        <SelectionLayerSlot
          registry={options.registry}
          className={layersConfig?.selection?.className}
          style={layersConfig?.selection?.style}
        />
        <ContextLayerSlot
          registry={options.registry}
          className={layersConfig?.context?.className}
          style={layersConfig?.context?.style}
        />
        <CustomLayerSlot
          registry={options.registry}
          className={layersConfig?.custom?.className}
          style={layersConfig?.custom?.style}
        >
          {children}
        </CustomLayerSlot>
      </div>
    );
  }
);

const EditorViewBase = forwardRef<EditorViewRef, EditorViewProps>(function EditorView(
  { editor, options = {}, children },
  ref
) {
  return (
    <EditorViewContextProvider editor={editor}>
      <EditorViewRoot ref={ref} options={options} children={children} />
    </EditorViewContextProvider>
  );
});

function createOverlayLayer(layer: 'decorator' | 'selection' | 'context' | 'custom') {
  return function OverlayLayer({ className, style, children }: EditorViewOverlayLayerProps) {
    return (
      <EditorViewLayer layer={layer} className={className} style={style}>
        {children}
      </EditorViewLayer>
    );
  };
}

/** EditorView with ref (addDecorator, removeDecorator, getDecorators) and static layer components. */
export const EditorView = Object.assign(EditorViewBase, {
  ContentLayer: EditorViewContentLayer,
  DecoratorLayer: createOverlayLayer('decorator'),
  SelectionLayer: createOverlayLayer('selection'),
  ContextLayer: createOverlayLayer('context'),
  CustomLayer: createOverlayLayer('custom'),
  Layer: EditorViewLayer,
});
