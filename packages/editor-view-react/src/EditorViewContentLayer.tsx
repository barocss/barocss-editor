import { useEffect, useMemo, useRef, useState } from 'react';
import type {
  ClipboardEventHandler,
  DragEventHandler,
  FormEvent,
  FormEventHandler,
  KeyboardEventHandler,
} from 'react';
import { getGlobalRegistry } from '@barocss/dsl';
import { ReactRenderer } from '@barocss/renderer-react';
import { useEditorViewContext } from './EditorViewContext';
import type { EditorViewContentLayerProps } from './types';

/**
 * EditorViewContentLayer: renders the editor document with ReactRenderer in a contenteditable div.
 * Subscribes to editor:content.change and editor:selection.model.
 * Must be used inside EditorView (EditorViewContextProvider); editor is taken from context only.
 */
export function EditorViewContentLayer({ options = {} }: EditorViewContentLayerProps) {
  const {
    editor,
    inputHandler,
    viewStateRef,
    setContentEditableElement,
    selectionHandler,
    getMergedDecorators,
    decoratorVersion,
  } = useEditorViewContext();
  const { className = '', editable = true, registry } = options;

  const [documentSnapshot, setDocumentSnapshot] = useState<unknown>(() => editor.getDocumentProxy?.() ?? null);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const modelRenderGuardFrameRef = useRef<number | null>(null);

  useEffect(() => {
    const onContentChange = (e: { content?: unknown; skipRender?: boolean }) => {
      if (e?.skipRender) return;

      if (viewStateRef?.current?.skipNextRenderFromMO) {
        viewStateRef.current.skipNextRenderFromMO = false;
        return;
      }

      if (modelRenderGuardFrameRef.current !== null) {
        window.cancelAnimationFrame(modelRenderGuardFrameRef.current);
      }

      if (viewStateRef.current) {
        viewStateRef.current.isModelDrivenChange = true;
        viewStateRef.current.isRendering = true;
      }

      const next = e?.content ?? editor.getDocumentProxy?.() ?? null;
      setDocumentSnapshot(next);

      modelRenderGuardFrameRef.current = window.requestAnimationFrame(() => {
        modelRenderGuardFrameRef.current = null;
        if (viewStateRef.current) {
          viewStateRef.current.isModelDrivenChange = false;
          viewStateRef.current.isRendering = false;
        }
      });
    };
    editor.on?.('editor:content.change', onContentChange);
    setDocumentSnapshot(editor.getDocumentProxy?.() ?? null);
    return () => {
      editor.off?.('editor:content.change', onContentChange);
      if (modelRenderGuardFrameRef.current !== null) {
        window.cancelAnimationFrame(modelRenderGuardFrameRef.current);
      }
      if (viewStateRef.current) {
        viewStateRef.current.isModelDrivenChange = false;
        viewStateRef.current.isRendering = false;
      }
    };
  }, [editor, viewStateRef]);

  useEffect(() => {
    const el = contentRef.current;
    setContentEditableElement(el);
    return () => setContentEditableElement(null);
  }, [setContentEditableElement]);

  useEffect(() => {
    const onModelSelection = (eventPayload: unknown) => {
      const hasSelectionField =
        typeof eventPayload === 'object' &&
        eventPayload !== null &&
        Object.prototype.hasOwnProperty.call(eventPayload, 'selection');
      const source = typeof eventPayload === 'object' && eventPayload !== null && Object.prototype.hasOwnProperty.call(eventPayload, 'source')
        ? (eventPayload as { source?: string }).source
        : undefined;
      const selectionFromEvent = hasSelectionField
        ? (eventPayload as { selection: unknown }).selection
        : eventPayload;
      const applySelectionToView = hasSelectionField
        ? source === 'remote'
          ? false
          : (eventPayload as { applySelectionToView?: boolean }).applySelectionToView !== false
        : true;
      const shouldApplySelectionToView = source === 'remote' ? false : applySelectionToView;

      if (!shouldApplySelectionToView) return;

      if (viewStateRef?.current?.skipApplyModelSelectionToDOM) return;
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          selectionHandler.convertModelSelectionToDOM(
            selectionFromEvent as Parameters<typeof selectionHandler.convertModelSelectionToDOM>[0]
          );
        });
      });
    };
    editor.on?.('editor:selection.model', onModelSelection);
    return () => editor.off?.('editor:selection.model', onModelSelection);
  }, [editor, selectionHandler, viewStateRef]);

  const renderer = useMemo(
    () => new ReactRenderer(registry ?? getGlobalRegistry()),
    [registry]
  );

  const decorators = useMemo(
    () => getMergedDecorators(documentSnapshot),
    [documentSnapshot, getMergedDecorators, decoratorVersion]
  );

  const content = useMemo(() => {
    if (documentSnapshot == null) return null;
    const model = documentSnapshot as { stype?: string };
    if (!model.stype) return null;
    return renderer.build(model, decorators);
  }, [documentSnapshot, renderer, decorators]);

  const handleBeforeInput: FormEventHandler<HTMLDivElement> = (event: FormEvent<HTMLDivElement>) => {
    const inputEvent = event.nativeEvent as InputEvent;
    inputHandler.handleBeforeInput(inputEvent);
  };

  const handleInput: FormEventHandler<HTMLDivElement> = (event: FormEvent<HTMLDivElement>) => {
    const inputEvent = event.nativeEvent as InputEvent;
    inputHandler.handleInput(inputEvent);
  };

  const handleKeyDown: KeyboardEventHandler<HTMLDivElement> = (event) => {
    inputHandler.handleKeydown(event.nativeEvent);
  };

  const handlePaste: ClipboardEventHandler<HTMLDivElement> = (event) => {
    const clipboardEvent = event.nativeEvent as ClipboardEvent;
    inputHandler.handlePaste(clipboardEvent);
  };

  const handleDrop: DragEventHandler<HTMLDivElement> = (event) => {
    const dropEvent = event.nativeEvent as DragEvent;
    inputHandler.handleDrop(dropEvent);
  };

  return (
    <div
      ref={contentRef}
      className={className}
      contentEditable={editable}
      suppressContentEditableWarning
      data-bc-layer="content"
      data-testid="editor-content"
      onInput={handleInput}
      onBeforeInput={handleBeforeInput}
      onKeyDown={handleKeyDown}
      onPaste={handlePaste}
      onDrop={handleDrop}
    >
      {content}
    </div>
  );
}
