import { useEffect, useMemo, useReducer, useRef, useState, type RefObject } from 'react';
import type { Editor } from '@barocss/editor-core';

/** Both DOM endpoints must belong to this editor, excluding nested input owners. */
export function ownsEditorSelection(editor: Editor, selection: Selection | null, scope?: HTMLElement | null): boolean {
  if (!selection?.rangeCount) return false;
  return [selection.anchorNode, selection.focusNode].every(node => {
    if (!node || (scope && !scope.contains(node))) return false;
    const element = node.nodeType === 1 ? node as Element : node.parentElement;
    if (element?.closest('[data-editor-input-owner]')) return false;
    const sid = element?.closest('[data-bc-sid]')?.getAttribute('data-bc-sid');
    return !!sid && !!editor.dataStore.getNode(sid);
  });
}

/** Shared focus and dismissal rules. Products retain target detection and geometry. */
export function useEditorContextVisibility<K>(editor: Editor, key: K | null, {
  scope, retainWithin, relatedChrome, active = true, sameKey = Object.is
}: {
  scope?: RefObject<HTMLElement | null>;
  retainWithin?: RefObject<HTMLElement | null>;
  /** A separately mounted inspector for this same current selection. */
  relatedChrome?: RefObject<HTMLElement | null>;
  active?: boolean;
  sameKey?: (a: K, b: K) => boolean;
} = {}) {
  const root = editor.getRootId();
  const session = useMemo(() => ({ dismissed: null as K | null }), [editor, root]);
  const current = useRef(session); current.current = session;
  const [focused, setFocused] = useState(false);
  const [, refresh] = useReducer(value => value + 1, 0);
  // A missing anchor can mean temporary focus loss, scrolling or an editor rerender.
  // Only a different target or an explicit new gesture clears an Escape dismissal.
  useEffect(() => {
    if (key !== null && session.dismissed !== null && !sameKey(key, session.dismissed)) session.dismissed = null;
  }, [key, session, sameKey]);
  useEffect(() => {
    const doc = scope?.current?.ownerDocument ?? document;
    const win = doc.defaultView;
    let windowActive = true;
    let alive = true;
    const measureElement = (element: Element | null) => {
      if (!windowActive || !element || element.closest('[data-editor-input-owner]')) { setFocused(false); return; }
      if ((retainWithin?.current?.contains(element) || relatedChrome?.current?.contains(element))) { setFocused(true); return; }
      if (element.matches('input, textarea, select')) { setFocused(false); return; }
      setFocused(scope?.current ? scope.current.contains(element)
        : ownsEditorSelection(editor, doc.getSelection()) && element.contains(doc.getSelection()?.anchorNode ?? null));
    };
    const measure = () => measureElement(doc.activeElement);
    const focusout = (event: FocusEvent) => {
      // activeElement is temporarily BODY during focusout. Prefer the known next owner.
      if (event.relatedTarget instanceof Element) measureElement(event.relatedTarget);
      else queueMicrotask(() => { if (alive) measure(); });
    };
    const blur = () => { windowActive = false; setFocused(false); };
    const focus = () => { windowActive = true; measure(); };
    measure();
    doc.addEventListener('focusin', measure);
    doc.addEventListener('focusout', focusout);
    doc.addEventListener('selectionchange', measure);
    win?.addEventListener('blur', blur);
    win?.addEventListener('focus', focus);
    return () => {
      alive = false;
      doc.removeEventListener('focusin', measure);
      doc.removeEventListener('focusout', focusout);
      doc.removeEventListener('selectionchange', measure);
      win?.removeEventListener('blur', blur);
      win?.removeEventListener('focus', focus);
    };
  }, [editor, root, scope, retainWithin, relatedChrome]);
  const dismiss = (reason?: 'escape' | 'outside') => {
    if (current.current !== session || key === null || editor.getRootId() !== root) return;
    session.dismissed = key;
    if (reason === 'escape' && editor.isEditable) {
      const doc = scope?.current?.ownerDocument ?? document;
      if ((retainWithin?.current?.contains(doc.activeElement) || relatedChrome?.current?.contains(doc.activeElement))) {
        const anchor = doc.getSelection()?.anchorNode;
        const element = anchor?.nodeType === 1 ? anchor as Element : anchor?.parentElement;
        const selected = element?.closest<HTMLElement>('[contenteditable="true"]');
        const target = selected && (!scope?.current || scope.current.contains(selected))
          ? selected : scope?.current?.querySelector<HTMLElement>('[contenteditable="true"]');
        if (target && !target.closest('[data-editor-input-owner]') &&
            (scope?.current || ownsEditorSelection(editor, doc.getSelection()))) {
          target.focus({ preventScroll: true });
        }
      }
    }
    refresh();
  };
  const reopen = () => {
    if (current.current !== session || session.dismissed === null) return;
    session.dismissed = null; refresh();
  };
  return { open: active && editor.isEditable && focused && key !== null &&
    (session.dismissed === null || !sameKey(key, session.dismissed)), dismiss, reopen };
}
