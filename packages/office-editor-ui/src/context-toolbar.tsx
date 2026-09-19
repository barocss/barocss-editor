import { useEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import type { Editor, ModelSelection } from '@barocss/editor-core';
import type { Control } from '@barocss/office-controls';
import { FloatingSurface, observeRangeAnchor, visibleRangeRect } from '@barocss/office-ui';
import { Controls } from './controls';
import { useEditorRevision } from './revision';
import { ownsEditorSelection, useEditorContextVisibility } from './editor-context';
export { ownsEditorSelection } from './editor-context';

type RangeIdentity = { anchorNode: Node | null; focusNode: Node | null; anchorOffset: number; focusOffset: number };
const sameRange = (a: RangeIdentity | null, b: RangeIdentity | null) => !!a && !!b &&
  a.anchorNode === b.anchorNode && a.focusNode === b.focusNode && a.anchorOffset === b.anchorOffset && a.focusOffset === b.focusOffset;

const sameRect = (a: DOMRect | null, b: DOMRect | null) => a?.x === b?.x && a?.y === b?.y &&
  a?.width === b?.width && a?.height === b?.height;

/** Tracks an editor-owned range, retaining its snapshot while a toolbar field has focus. */
export function useEditorTextSelection(editor: Editor, {
  scope, retainWithin, active = true
}: {
  scope?: RefObject<HTMLElement | null>;
  retainWithin?: RefObject<HTMLElement | null>;
  active?: boolean;
} = {}) {
  const revision = useEditorRevision(editor);
  const gesture = useRef({ dragging: false, composing: false });
  const [context, setContext] = useState<{ at: DOMRect | null; selection: ModelSelection | null; range: RangeIdentity } | null>(null);
  const retained = useRef<Range | null>(null);
  useEffect(() => {
    const doc = scope?.current?.ownerDocument ?? document;
    const win = doc.defaultView;
    const measure = () => {
      if (!active || gesture.current.dragging || gesture.current.composing) return setContext(null);
      if (doc.activeElement?.closest('[data-editor-input-owner]')) return setContext(null);
      if (retainWithin?.current?.contains(doc.activeElement)) {
        const at = retained.current ? visibleRangeRect(retained.current) : null;
        setContext(previous => previous && sameRect(previous.at, at) ? previous : previous ? { ...previous, at } : null);
        return;
      }
      if (doc.activeElement?.matches('input, textarea, select')) return setContext(null);
      const selection = doc.getSelection();
      const focused = doc.activeElement;
      if (focused && focused !== doc.body && focused !== doc.documentElement
        && !focused.contains(selection?.anchorNode ?? null) && !scope?.current?.contains(focused)) {
        setContext(null);
        return;
      }
      if (!ownsEditorSelection(editor, selection, scope?.current) || selection!.isCollapsed) {
        setContext(null);
        return;
      }
      retained.current = selection!.getRangeAt(0).cloneRange();
      const next = { at: visibleRangeRect(retained.current), selection: editor.selection ? { ...editor.selection } : null,
        range: { anchorNode: selection!.anchorNode, focusNode: selection!.focusNode, anchorOffset: selection!.anchorOffset, focusOffset: selection!.focusOffset } };
      setContext(previous => previous && sameRange(previous.range, next.range) && sameRect(previous.at, next.at) &&
        JSON.stringify(previous.selection) === JSON.stringify(next.selection) ? previous : next);
    };
    const inContent = (event: Event) => event.target instanceof Element && !retainWithin?.current?.contains(event.target) &&
      (!scope?.current || scope.current.contains(event.target)) && !!event.target.closest('[contenteditable="true"]');
    const down = (event: PointerEvent) => { if (event.button === 0 && inContent(event)) { gesture.current.dragging = true; measure(); } };
    const up = () => { if (gesture.current.dragging) { gesture.current.dragging = false; measure(); } };
    const startComposition = (event: Event) => { if (inContent(event)) { gesture.current.composing = true; measure(); } };
    const endComposition = () => { gesture.current.composing = false; measure(); };
    const blur = () => { gesture.current = { dragging: false, composing: false }; setContext(null); };
    const stopAnchor = observeRangeAnchor(scope?.current ?? doc.body, () => {
      if (retainWithin?.current?.contains(doc.activeElement)) return retained.current;
      const selection = doc.getSelection();
      return ownsEditorSelection(editor, selection, scope?.current) && selection?.rangeCount ? selection.getRangeAt(0) : null;
    }, measure);
    win?.addEventListener('blur', blur);
    win?.addEventListener('focus', measure);
    doc.addEventListener('pointerdown', down, true);
    doc.addEventListener('pointerup', up, true);
    doc.addEventListener('pointercancel', up, true);
    doc.addEventListener('compositionstart', startComposition, true);
    doc.addEventListener('compositionend', endComposition, true);
    doc.addEventListener('focusin', measure);

    return () => {
      stopAnchor();
      win?.removeEventListener('blur', blur);
      win?.removeEventListener('focus', measure);
      doc.removeEventListener('pointerdown', down, true);
      doc.removeEventListener('pointerup', up, true);
      doc.removeEventListener('pointercancel', up, true);
      doc.removeEventListener('compositionstart', startComposition, true);
      doc.removeEventListener('compositionend', endComposition, true);
      doc.removeEventListener('focusin', measure);

    };
  }, [editor, scope, retainWithin, active, revision]);
  // A retained range can outlive the blocks removed by a toolbar command.
  // Validate during render, before children inspect marks on that old range.
  const attached = (id: string) => {
    let node = editor.dataStore.getNode(id);
    const seen = new Set<string>();
    while (node?.sid && !seen.has(node.sid)) {
      if (node.sid === editor.getRootId()) return true;
      seen.add(node.sid);
      node = node.parentId ? editor.dataStore.getNode(node.parentId) : undefined;
    }
    return false;
  };
  return context?.selection && (!attached(context.selection.startNodeId) || !attached(context.selection.endNodeId)) ? null : context;
}

/** Shared selection lifecycle and command rendering; products supply their Control declarations. */
export function ContextToolbar({ editor, controls, scope, active = true, label = '선택한 글 서식', mark,
  children, onOpenChange, ...hooks
}: {
  editor: Editor;
  controls: readonly Control[];
  scope?: RefObject<HTMLElement | null>;
  active?: boolean;
  label?: string;
  mark?: string;
  children?: ReactNode | ((selection: ModelSelection | null) => ReactNode);
  onOpenChange?: (open: boolean) => void;
  [hook: `data-${string}`]: string | number | boolean | undefined;
}) {
  const chrome = useRef<HTMLDivElement>(null);
  const context = useEditorTextSelection(editor, { scope, retainWithin: chrome, active });
  const { open, dismiss } = useEditorContextVisibility(editor, context?.range ?? null,
    { scope, retainWithin: chrome, active, sameKey: sameRange });
  const visible = open && !!context?.at;
  useEffect(() => { onOpenChange?.(visible); }, [visible, onOpenChange]);
  return <FloatingSurface open={visible} at={context?.at ?? null} aria-label={label}
    portalRoot={scope?.current} onDismiss={dismiss} ownedElements={scope ? [scope] : []}
    {...hooks}>
    <div ref={chrome} className="flex min-w-0 flex-wrap items-center gap-0.5" data-editor-context-toolbar>
      <Controls editor={editor} controls={controls} mark={mark} appearance="contextual"
        onRun={control => {
          if (context?.selection) editor.selectionManager.setSelection(context.selection);
          void editor.executeCommand(control.command, control.payload);
        }} />
      {typeof children === 'function' ? children(context?.selection ?? null) : children}
    </div>
  </FloatingSurface>;
}
