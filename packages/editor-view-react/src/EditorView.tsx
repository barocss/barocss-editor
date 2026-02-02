import { forwardRef, useImperativeHandle, useRef } from 'react';
import type { RendererRegistry } from '@barocss/dsl';
import type {
  EditorViewProps,
  EditorViewOverlayLayerProps,
  EditorViewRef,
  DecoratorExportData,
  LoadDecoratorsPatternFunctions,
  ModelSelection,
} from './types';
import type { DecoratorQueryOptions } from '@barocss/shared';
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
    const {
      editor,
      selectionHandler,
      contentEditableRef,
      decoratorManagerRef,
      decoratorSchemaRegistryRef,
      remoteDecoratorManagerRef,
      patternDecoratorConfigManagerRef,
      decoratorGeneratorManagerRef,
      getMergedDecorators,
      bumpDecoratorVersion,
    } = useEditorViewContext();
    const apiRef = useRef<EditorViewRef | null>(null);

    useImperativeHandle(
      ref,
      () => {
        if (!apiRef.current) {
          apiRef.current = {
            addDecorator(decorator) {
              if ('generate' in decorator) {
                decoratorGeneratorManagerRef.current?.registerGenerator(
                  decorator as import('@barocss/shared').DecoratorGenerator,
                  bumpDecoratorVersion
                );
                bumpDecoratorVersion();
                return;
              }
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
            getDecorators(options?: DecoratorQueryOptions) {
              const model = editor.getDocumentProxy?.() ?? null;
              let list = getMergedDecorators(model);
              if (options?.enabledOnly !== false) {
                list = list.filter((d) => d.enabled !== false);
              }
              if (options?.category) list = list.filter((d) => d.category === options.category);
              if (options?.type) list = list.filter((d) => d.stype === options.type);
              if (options?.nodeId) {
                list = list.filter((d) => {
                  const t = d.target;
                  if (!t) return false;
                  const sid = 'sid' in t ? t.sid : undefined;
                  const startSid = 'startSid' in t ? t.startSid : undefined;
                  const endSid = 'endSid' in t ? t.endSid : undefined;
                  return sid === options.nodeId || startSid === options.nodeId || endSid === options.nodeId;
                });
              }
              const sortBy = options?.sortBy ?? 'id';
              const order = options?.sortOrder ?? 'asc';
              if (sortBy) {
                const mult = order === 'desc' ? -1 : 1;
                list = [...list].sort((a, b) => {
                  const av = sortBy === 'id' ? a.sid : sortBy === 'type' ? a.stype : a.category;
                  const bv = sortBy === 'id' ? b.sid : sortBy === 'type' ? b.stype : b.category;
                  return av.localeCompare(bv) * mult;
                });
              }
              return list;
            },
            getDecorator(id) {
              const merged = getMergedDecorators(editor.getDocumentProxy?.() ?? null);
              const found = merged.find((d) => d.sid === id);
              if (found) return found;
              const local = decoratorManagerRef.current?.get(id);
              if (local) return local;
              return remoteDecoratorManagerRef.current?.get(id);
            },
            exportDecorators(): DecoratorExportData {
              const targetDecorators = (decoratorManagerRef.current?.getAll() ?? [])
                .filter((d) => d.decoratorType !== 'pattern')
                .map((d) => {
                  const { decoratorType, ...rest } = d;
                  return rest;
                }) as DecoratorExportData['targetDecorators'];
              const patternConfigs = patternDecoratorConfigManagerRef.current?.getConfigs() ?? [];
              const patternDecorators = patternConfigs
                .filter((c) => c.pattern instanceof RegExp)
                .map((c) => ({
                  sid: c.sid,
                  stype: c.stype,
                  category: c.category,
                  pattern: { source: (c.pattern as RegExp).source, flags: (c.pattern as RegExp).flags },
                  priority: c.priority,
                  enabled: c.enabled,
                }));
              return { version: '1.0.0', targetDecorators, patternDecorators };
            },
            loadDecorators(data: DecoratorExportData, patternFunctions?: LoadDecoratorsPatternFunctions) {
              decoratorManagerRef.current?.clear();
              remoteDecoratorManagerRef.current?.clear();
              patternDecoratorConfigManagerRef.current?.clear();
              decoratorGeneratorManagerRef.current?.clear();
              for (const d of data.targetDecorators) {
                decoratorManagerRef.current?.add({
                  ...d,
                  decoratorType: 'target',
                } as import('@barocss/shared').Decorator);
              }
              for (const p of data.patternDecorators) {
                const fns = patternFunctions?.[p.sid];
                if (!fns) {
                  console.warn(`[EditorView] Pattern '${p.sid}' functions not provided; skipping.`);
                  continue;
                }
                const pattern = new RegExp(p.pattern.source, p.pattern.flags);
                patternDecoratorConfigManagerRef.current?.addConfig({
                  sid: p.sid,
                  stype: p.stype,
                  category: p.category,
                  pattern,
                  extractData: fns.extractData,
                  createDecorator: fns.createDecorator,
                  priority: p.priority,
                  enabled: p.enabled,
                });
              }
              bumpDecoratorVersion();
            },
            get contentEditableElement() {
              return contentEditableRef.current ?? null;
            },
            convertModelSelectionToDOM(sel: ModelSelection | null | undefined) {
              selectionHandler.convertModelSelectionToDOM(sel as Parameters<typeof selectionHandler.convertModelSelectionToDOM>[0]);
            },
            convertDOMSelectionToModel(selection: Selection): ModelSelection {
              return selectionHandler.convertDOMSelectionToModel(selection) as ModelSelection;
            },
            convertStaticRangeToModel(staticRange: StaticRange): ModelSelection | null {
              return selectionHandler.convertStaticRangeToModel(staticRange) as ModelSelection | null;
            },
            defineDecoratorType(type, category, schema) {
              const reg = decoratorSchemaRegistryRef.current;
              if (!reg) return;
              if (category === 'layer') reg.registerLayerType(type, schema);
              else if (category === 'inline') reg.registerInlineType(type, schema);
              else reg.registerBlockType(type, schema);
            },
            get decoratorManager() {
              return decoratorManagerRef.current ?? null;
            },
            get remoteDecoratorManager() {
              return remoteDecoratorManagerRef.current ?? null;
            },
            get patternDecoratorConfigManager() {
              return patternDecoratorConfigManagerRef.current ?? null;
            },
            get decoratorGeneratorManager() {
              return decoratorGeneratorManagerRef.current ?? null;
            },
          };
        }
        return apiRef.current;
      },
      [
        editor,
        selectionHandler,
        contentEditableRef,
        decoratorManagerRef,
        decoratorSchemaRegistryRef,
        remoteDecoratorManagerRef,
        patternDecoratorConfigManagerRef,
        decoratorGeneratorManagerRef,
        getMergedDecorators,
        bumpDecoratorVersion,
      ]
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
