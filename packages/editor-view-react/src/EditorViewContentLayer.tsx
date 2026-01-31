import { useEffect, useMemo, useRef, useState } from 'react';
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
  const { editor, selectionHandler, viewStateRef, setContentEditableElement } = useEditorViewContext();
  const { className = '', editable = true, registry } = options;

  const [documentSnapshot, setDocumentSnapshot] = useState<unknown>(() => editor.getDocumentProxy?.() ?? null);
  const contentRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const onContentChange = (e: { content?: unknown }) => {
      const next = e?.content ?? editor.getDocumentProxy?.() ?? null;
      setDocumentSnapshot(next);
    };
    editor.on?.('editor:content.change', onContentChange);
    setDocumentSnapshot(editor.getDocumentProxy?.() ?? null);
    return () => {
      editor.off?.('editor:content.change', onContentChange);
    };
  }, [editor]);

  useEffect(() => {
    const el = contentRef.current;
    setContentEditableElement(el);
    return () => setContentEditableElement(null);
  }, [setContentEditableElement]);

  useEffect(() => {
    const onModelSelection = (sel: unknown) => {
      if (viewStateRef?.current?.skipApplyModelSelectionToDOM) return;
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          selectionHandler.convertModelSelectionToDOM(sel as Parameters<typeof selectionHandler.convertModelSelectionToDOM>[0]);
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

  const content = useMemo(() => {
    if (documentSnapshot == null) return null;
    const model = documentSnapshot as { stype?: string };
    if (!model.stype) return null;
    return renderer.build(model);
  }, [documentSnapshot, renderer]);

  return (
    <div
      ref={contentRef}
      className={className}
      contentEditable={editable}
      suppressContentEditableWarning
      data-bc-layer="content"
      data-testid="editor-content"
    >
      {content}
    </div>
  );
}
