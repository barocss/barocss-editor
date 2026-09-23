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
import { attachFragmentDrag, stripFiller } from '@barocss/shared';
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
  const fragmentDragRef = useRef<ReturnType<typeof attachFragmentDrag> | null>(null);
  useEffect(() => {
    const root = contentRef.current; if (!root) return;
    const drag = attachFragmentDrag(root, {
      command: (name, payload) => editor.executeCommand(name, payload), selection: () => editor.selection,
      fromSelection: value => { const selected = selectionHandler.convertDOMSelectionToModel(value); return selected?.type === 'none' ? null : selected; },
      fromRange: value => selectionHandler.convertStaticRangeToModel(value), node: id => editor.dataStore.getNode(id),
      isBlock: id => editor.dataStore.getActiveSchema()?.getNodeType(editor.dataStore.getNode(id)?.stype ?? '')?.group === 'block',
      composing: () => viewStateRef.current.isComposing,
    });
    fragmentDragRef.current = drag;
    return () => { drag.destroy(); fragmentDragRef.current = null; };
  }, [editor, selectionHandler, viewStateRef]);
  const modelRenderGuardFrameRef = useRef<number | null>(null);
  const pendingModelSelectionRef = useRef<unknown>(null);
  const selectionRestoreFrameRef = useRef<number | null>(null);
  const selectionRestoreAttemptRef = useRef(0);

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

      const cancelPendingSelectionRestore = () => {
        pendingModelSelectionRef.current = null;
        selectionRestoreAttemptRef.current = 0;
        if (selectionRestoreFrameRef.current !== null) {
          window.cancelAnimationFrame(selectionRestoreFrameRef.current);
          selectionRestoreFrameRef.current = null;
        }
      };

      const hasRenderedNode = (root: ParentNode | null | undefined, sid: string) =>
        Boolean(
          root &&
          Array.from(root.querySelectorAll('[data-bc-sid]')).some(
            (node) => node.getAttribute('data-bc-sid') === sid
          )
        );

      if (!shouldApplySelectionToView) {
        cancelPendingSelectionRestore();
        return;
      }

      if (viewStateRef?.current?.skipApplyModelSelectionToDOM) {
        cancelPendingSelectionRestore();
        return;
      }

      const selectionRecord = selectionFromEvent as { type?: string } | null | undefined;
      if (!selectionRecord || selectionRecord.type === 'none') {
        cancelPendingSelectionRestore();
        selectionHandler.convertModelSelectionToDOM(
          selectionFromEvent as Parameters<typeof selectionHandler.convertModelSelectionToDOM>[0]
        );
        return;
      }

      pendingModelSelectionRef.current = selectionFromEvent;
      selectionRestoreAttemptRef.current = 0;

      const applyPendingSelection = () => {
        selectionRestoreFrameRef.current = null;
        const pendingSelection = pendingModelSelectionRef.current as
          | { type?: string; startNodeId?: string; endNodeId?: string }
          | null
          | undefined;

        if (!pendingSelection || pendingSelection.type === 'none') {
          cancelPendingSelectionRestore();
          return;
        }

        if (viewStateRef?.current?.skipApplyModelSelectionToDOM) {
          cancelPendingSelectionRestore();
          return;
        }

        const root = contentRef.current;
        const needsRenderedRange =
          pendingSelection.type === 'range' &&
          typeof pendingSelection.startNodeId === 'string' &&
          typeof pendingSelection.endNodeId === 'string';
        const hasRenderedRange =
          !needsRenderedRange ||
          (hasRenderedNode(root, pendingSelection.startNodeId as string) &&
            hasRenderedNode(root, pendingSelection.endNodeId as string));

        if (hasRenderedRange) {
          const selectionToApply = pendingModelSelectionRef.current;
          pendingModelSelectionRef.current = null;
          selectionRestoreAttemptRef.current = 0;
          selectionHandler.convertModelSelectionToDOM(
            selectionToApply as Parameters<typeof selectionHandler.convertModelSelectionToDOM>[0]
          );
          return;
        }

        // Give React up to ten animation frames to commit the content change that
        // produced this selection. After that, drop the stale restore request.
        if (selectionRestoreAttemptRef.current >= 10) {
          cancelPendingSelectionRestore();
          return;
        }

        selectionRestoreAttemptRef.current += 1;
        selectionRestoreFrameRef.current = window.requestAnimationFrame(applyPendingSelection);
      };

      if (selectionRestoreFrameRef.current !== null) {
        window.cancelAnimationFrame(selectionRestoreFrameRef.current);
      }
      selectionRestoreFrameRef.current = window.requestAnimationFrame(applyPendingSelection);
    };
    editor.on?.('editor:selection.model', onModelSelection);
    return () => {
      editor.off?.('editor:selection.model', onModelSelection);
      if (selectionRestoreFrameRef.current !== null) {
        window.cancelAnimationFrame(selectionRestoreFrameRef.current);
        selectionRestoreFrameRef.current = null;
      }
      pendingModelSelectionRef.current = null;
      selectionRestoreAttemptRef.current = 0;
    };
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
    if (event.defaultPrevented) return;
    const clipboardEvent = event.nativeEvent as ClipboardEvent;
    const domSelection = window.getSelection();
    const element = contentRef.current;
    const selection = domSelection?.anchorNode && domSelection.focusNode && element?.contains(domSelection.anchorNode)
      && element.contains(domSelection.focusNode) ? selectionHandler.convertDOMSelectionToModel(domSelection) : undefined;
    inputHandler.handlePaste(clipboardEvent, selection?.type === 'range' ? selection : undefined);
  };

  const handleDrop: DragEventHandler<HTMLDivElement> = (event) => {
    const dropEvent = event.nativeEvent as DragEvent;
    fragmentDragRef.current?.drop(dropEvent);
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
    // Some IMEs finish without a final non-composing input event.
    // Observe the native composition boundary as well as beforeinput/input.
    const onCompositionStart = () => inputHandler.setComposing(true);
    const onCompositionEnd = () => inputHandler.setComposing(false);
    // Strip the caret filler out of anything leaving the editor. The zero-width
    // character is renderer bookkeeping, not content, and a native copy reads the
    // DOM directly — without this it rides along into other applications.
    const onCopy = (event: Event) => {
      const e = event as ClipboardEvent;
      if (e.defaultPrevented) return;
      const selection = window.getSelection();
      if (!selection || selection.rangeCount === 0 || !e.clipboardData) return;
      if (e.target instanceof Element && e.target.closest('input, textarea')) return;
      if (selection.anchorNode && selection.focusNode && el.contains(selection.anchorNode) && el.contains(selection.focusNode)) {
        const model = selectionHandler.convertDOMSelectionToModel(selection);
        if (model?.type === 'range') {
          let handled = false;
          void editor.executeCommand(e.type === 'cut' ? 'cut' : 'copy', {
            selection: model, clipboardData: e.clipboardData,
            onClipboardWrite: () => { handled = true; e.preventDefault(); },
          });
          if (handled) return;
        }
      }
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
    el.addEventListener('compositionstart', onCompositionStart);
    el.addEventListener('compositionend', onCompositionEnd);
    el.addEventListener('copy', onCopy);
    el.addEventListener('cut', onCopy);
    return () => {
      el.removeEventListener('beforeinput', onBeforeInput);
      el.removeEventListener('compositionstart', onCompositionStart);
      el.removeEventListener('compositionend', onCompositionEnd);
      el.removeEventListener('copy', onCopy);
      el.removeEventListener('cut', onCopy);
    };
  }, [inputHandler, editor, selectionHandler]);

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
