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
import { stripFiller } from '@barocss/shared';
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

      // Only take `e.content` when it is actually renderable model data.
      // Emitters put different shapes in this field (a DocumentState from
      // setContent, the internal document from the input path), and anything
      // without `stype` makes the render below bail to null — wiping the whole
      // document off screen. The document proxy is the canonical model, so fall
      // back to it rather than trusting the payload.
      const fromEvent = e?.content as { stype?: string } | undefined;
      const next = fromEvent?.stype ? fromEvent : editor.getDocumentProxy?.() ?? null;
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

  // beforeinput MUST be a native listener, not React's onBeforeInput.
  //
  // React does not observe the native `beforeinput` event at all: its
  // onBeforeInput is a synthetic event registered on compositionend / keypress /
  // textInput / paste. The object it hands over therefore has no `inputType` and
  // no `getTargetRanges()`, so every branch of the model-first input path fell
  // through and nothing was ever prevented — deletes, Enter, undo and the format
  // commands were all silently left to the browser. Measured in Chrome with the
  // synthetic event, `defaultPrevented` stayed false for insertText,
  // deleteContentBackward and insertParagraph alike.
  useEffect(() => {
    const el = contentRef.current;
    if (!el) return;
    const onBeforeInput = (event: Event) => {
      inputHandler.handleBeforeInput(event as InputEvent);
    };
    // Strip the caret filler out of anything leaving the editor. The zero-width
    // character is renderer bookkeeping, not content, and a native copy reads the
    // DOM directly — without this it rides along into other applications.
    const onCopy = (event: Event) => {
      const e = event as ClipboardEvent;
      const selection = window.getSelection();
      if (!selection || selection.rangeCount === 0 || !e.clipboardData) return;
      const holder = el.ownerDocument.createElement('div');
      holder.appendChild(selection.getRangeAt(0).cloneContents());
      const plain = stripFiller(selection.toString());
      const markup = stripFiller(holder.innerHTML);
      if (plain === selection.toString() && markup === holder.innerHTML) return;
      e.preventDefault();
      e.clipboardData.setData('text/plain', plain);
      e.clipboardData.setData('text/html', markup);
    };

    el.addEventListener('beforeinput', onBeforeInput);
    el.addEventListener('copy', onCopy);
    el.addEventListener('cut', onCopy);
    return () => {
      el.removeEventListener('beforeinput', onBeforeInput);
      el.removeEventListener('copy', onCopy);
      el.removeEventListener('cut', onCopy);
    };
  }, [inputHandler]);

  // Every default keybinding is gated on the `editorFocus` context, so without
  // these the context stays false and no shortcut resolves — bold, headings,
  // lists and undo all silently do nothing from the keyboard.
  const handleFocus = () => {
    editor.emit?.('editor:selection.focus');
  };

  const handleBlur = () => {
    editor.emit?.('editor:selection.blur');
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
      onKeyDown={handleKeyDown}
      onPaste={handlePaste}
      onDrop={handleDrop}
      onFocus={handleFocus}
      onBlur={handleBlur}
    >
      {content}
    </div>
  );
}
