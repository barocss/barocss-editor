import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { Editor } from '@barocss/editor-core';
import type { EditorViewDOM } from '@barocss/editor-view-dom';
import { MathInlineInput } from '@barocss/office-editor-ui';
import { createMathDocument, type MathDocument } from '@barocss/math-editor/core';
import { mathEditorToWord, wordToMathEditor, wordMathExcludedStructures } from './math-editor-bridge';
import { applyWordMathDraft, captureWordMathTarget, mathTree, type WordMathTarget } from './math-editor-session';
import { WordMathContextToolbar } from './math-context-toolbar';
import { useWordMathDisplay } from './math-display';

interface Session {
  target: WordMathTarget;
  initial: MathDocument;
  owner: HTMLElement;
  host: HTMLSpanElement;
  cleanup: () => void;
}

/** Word keeps its OMML tree and renderer. Only the temporary draft belongs to React. */
export function useWordMathInplace(editor: Editor, view: EditorViewDOM) {
  const [session, setSession] = useState<Session>();
  const current = useRef<Session | undefined>(undefined);
  const [error, setError] = useState('');
  const close = (focus = true) => {
    const value = current.current;
    current.current = undefined;
    setSession(undefined);
    // Let React unmount the nested editor before removing its portal host.
    requestAnimationFrame(() => {
      value?.cleanup();
      if (focus && value && editor.getRootId() === value.target.rootId) {
        view.contentEditableElement.focus({ preventScroll: true });
        if (!value.target.math) editor.setRange({ type: 'range', startNodeId: value.target.id,
          endNodeId: value.target.id, startOffset: value.target.offset!, endOffset: value.target.offset!, collapsed: true });
      }
    });
  };
  const open = (explicit?: WordMathTarget) => {
    if (current.current) return;
    const target = explicit ?? captureWordMathTarget(editor);
    if (!target || !editor.isEditable) return;
    setError('');
    try {
      // Refuse unknown Word constructs before changing any DOM or model state.
      const initial = target.math ? wordToMathEditor(target.math) : createMathDocument();
      const owner = view.contentEditableElement.querySelector<HTMLElement>(`[data-bc-sid="${CSS.escape(target.id)}"]`);
      if (!owner) throw new Error('본문에서 수식 위치를 선택해 주세요.');
      const host = document.createElement('span');
      host.className = 'w-math-draft';
      host.contentEditable = 'false';
      host.dataset.editorInputOwner = 'word-math';
      const displayedMath = owner.querySelector<HTMLElement>('.w-math-display .katex');
      host.style.setProperty('--me-font-size', displayedMath
        ? getComputedStyle(displayedMath).fontSize
        : `${parseFloat(getComputedStyle(owner).fontSize) * 1.25}px`);
      const previousOwner = owner.getAttribute('data-editor-input-owner');
      owner.setAttribute('data-editor-input-owner', 'word-math');
      if (target.math) {
        owner.classList.add('w-math-editing');
        owner.append(host);
      } else {
        // A draft is not a document node. The owner boundary excludes these DOM
        // changes from text import; the model changes only on explicit Apply.
        const walker = document.createTreeWalker(owner, NodeFilter.SHOW_TEXT);
        let remaining = target.offset ?? 0, text = walker.nextNode();
        while (text && remaining > (text.textContent?.length ?? 0)) {
          remaining -= text.textContent?.length ?? 0; text = walker.nextNode();
        }
        if (text) { const range = document.createRange(); range.setStart(text, remaining); range.collapse(true); range.insertNode(host); }
        else owner.append(host);
      }
      const cleanup = () => {
        host.remove(); owner.classList.remove('w-math-editing'); owner.normalize();
        // Keep the input boundary until MutationObserver has consumed cleanup.
        queueMicrotask(() => {
          if (previousOwner === null) owner.removeAttribute('data-editor-input-owner');
          else owner.setAttribute('data-editor-input-owner', previousOwner);
        });
      };
      const value = { target, initial, owner, host, cleanup };
      current.current = value; setSession(value);
    } catch (e) {
      // Display-only formatting must stay editable without a lossy conversion.
      if (target.math && revealNative(target.id)) return;
      setError((e as Error).message);
    }
  };
  const openRef = useRef(open); openRef.current = open;
  const revealNative = useWordMathDisplay(editor, view, open);
  useEffect(() => {
    const dblclick = (event: MouseEvent) => {
      const element = (event.target as Element)?.closest<HTMLElement>('.w-math');
      if (!element || current.current) return;
      const id = element.dataset.bcSid;
      if (!id) return;
      event.preventDefault(); event.stopPropagation();
      const math = mathTree(editor, id);
      openRef.current({ id, rootId: editor.getRootId()!, before: JSON.stringify(math), math });
    };
    view.contentEditableElement.addEventListener('dblclick', dblclick, true);
    return () => { view.contentEditableElement.removeEventListener('dblclick', dblclick, true); current.current?.cleanup(); current.current = undefined; };
  }, [editor, view]);
  // A reload, undo or external edit must not leave a draft attached to stale DOM.
  useEffect(() => {
    const changed = () => {
      const active = current.current;
      if (active && (!active.host.isConnected || editor.getRootId() !== active.target.rootId)) close(false);
    };
    editor.on('editor:content.change', changed);
    return () => editor.off('editor:content.change', changed);
  }, [editor, view]);
  return {
    open: () => open(),
    active: !!session,
    available: !!captureWordMathTarget(editor),
    surface: <>
      <WordMathContextToolbar editor={editor} view={view} editing={!!session} onEdit={open} />
      {error && <span role="alert">{error}</span>}
      {session && createPortal(<MathInlineInput initial={session.initial} excludedStructures={wordMathExcludedStructures}
        keepOpenOnOutsidePointerDown={target => !!target.closest('.w-zoom-control, .w-ribbon [role="tab"][id$="-view"], [data-menu="view"], [data-menu-item^="view.zoom."]')}
        onCancel={() => close()}
        onApply={async draft => {
          mathEditorToWord(draft); // Validate before unmounting the draft surface.
          await applyWordMathDraft(editor, session.target, draft, { caretAfter: true });
          const after = editor.selection?.type === 'range' ? { ...editor.selection } : undefined;
          close(false);
          requestAnimationFrame(() => {
            view.contentEditableElement.focus({ preventScroll: true });
            // Browser focus can restore the old caret inside the replaced equation.
            if (after) editor.updateSelection({ selection: after, applySelectionToView: true });
          });
        }} />, session.host)}
    </>,
  };
}
