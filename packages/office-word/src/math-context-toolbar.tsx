import { useEffect, useMemo, useRef, useState } from 'react';
import { useEditorContextVisibility, useNodeAnchor } from '@barocss/office-editor-ui';
import type { Editor } from '@barocss/editor-core';
import type { EditorViewDOM } from '@barocss/editor-view-dom';
import { Button, FloatingSurface, Icon, NumberField } from '@barocss/office-ui';
import { mathFontScale } from '@barocss/office-text';
import { setWordMathScale } from './math-size';
import { enclosingMath } from './math-navigation';
import { captureWordMathTarget, type WordMathTarget } from './math-editor-session';

/** Word chooses the equation; office-ui owns placement, focus and surface styling. */
export function WordMathContextToolbar({ editor, view, editing, onEdit }: {
  editor: Editor;
  view: EditorViewDOM;
  editing: boolean;
  onEdit: (target: WordMathTarget) => void;
}) {
  const tools = useRef<HTMLDivElement>(null);
  const scopeRef = useMemo(() => ({ current: view.contentEditableElement }), [view]);
  const [error, setError] = useState('');
  const [context, setContext] = useState<{ target: WordMathTarget }>();
  const anchor = useNodeAnchor(editor, scopeRef, context?.target.id);
  const { open, dismiss, reopen } = useEditorContextVisibility(editor, context?.target.id ?? null,
    { scope: scopeRef, retainWithin: tools, active: !editing });
  const reopenRef = useRef(reopen); reopenRef.current = reopen;
  useEffect(() => {
    const scope = view.contentEditableElement, doc = scope.ownerDocument, win = doc.defaultView!;
    let frame = 0;
    const measure = () => {
      if (editing || !editor.isEditable) { setContext(undefined); return; }
      const target = captureWordMathTarget(editor), selection = editor.selection;
      const endMath = selection?.type === 'range' ? enclosingMath({ rootId: editor.getRootId()!,
        getNode: id => editor.dataStore.getNode(id) }, selection.endNodeId) : undefined;
      // Do not offer one equation's actions for a selection spanning the paragraph.
      if (!target?.math || (selection?.type !== 'node' && endMath?.sid !== target.id)) {
        reopenRef.current(); setContext(undefined); return;
      }
      setContext({ target });
    };
    const schedule = () => { win.cancelAnimationFrame(frame); frame = win.requestAnimationFrame(measure); };
    const pointer = (event: PointerEvent) => {
      // KaTeX's read-only display has an input-owner marker to exclude it from
      // text editing. Clicking that display still explicitly selects this equation.
      if (event.target instanceof Element && scope.contains(event.target) && event.target.closest('.w-math')
        && !event.target.closest('[data-editor-input-owner]:not([data-editor-input-owner="word-math-display"])')) reopenRef.current();
      schedule();
    };
    measure();
    editor.on('editor:selection.model', schedule);
    editor.on('editor:content.change', schedule);
    doc.addEventListener('focusin', schedule);
    doc.addEventListener('pointerdown', pointer, true);
    return () => {
      win.cancelAnimationFrame(frame);
      editor.off('editor:selection.model', schedule);
      editor.off('editor:content.change', schedule);
      doc.removeEventListener('focusin', schedule);
      doc.removeEventListener('pointerdown', pointer, true);
    };
  }, [editor, view, editing]);

  return <FloatingSurface open={!!context && !!anchor && open} at={anchor?.at ?? null}
    variant="toolbar" align="start" aria-label="Word 수식 도구" data-word-math-toolbar
    ownedElements={[anchor?.element ?? null]}
    onDismiss={dismiss}>
    <div ref={tools} className="w-math-context-actions" onMouseDown={event => {
      if ((event.target as Element).closest('button')) event.preventDefault();
    }}>
      <Button tone="quiet" onClick={() => {
        if (!context) return;
        dismiss();
        onEdit(context.target); setContext(undefined);
      }}><Icon name="math" size={16} />수식 바로 편집</Button>
      <NumberField ariaLabel="수식 크기" className="w-math-size-field" prefix="크기" suffix="%" min={50} max={300} step={25} decimals={0}
        value={Math.round(mathFontScale(context?.target.math?.attributes?.fontScale) * 100)}
        onCommit={value => { if (context) void resize(value); }} />
      <Button tone="quiet" disabled={mathFontScale(context?.target.math?.attributes?.fontScale) === 1}
        onClick={() => void resize(100)}>기본 크기</Button>
      {error && <span role="alert">{error}</span>}
    </div>
  </FloatingSurface>;

  async function resize(percent: number) {
    if (!context) return;
    setError('');
    try {
      await setWordMathScale(editor, context.target, percent);
      // A renderer may replace the equation element. Keep typing in the size
      // field, or restore the selected equation for subsequent keyboard actions.
      if (!tools.current?.contains(view.contentEditableElement.ownerDocument.activeElement))
        view.contentEditableElement.querySelector<HTMLElement>(`[data-bc-sid="${CSS.escape(context.target.id)}"]`)?.focus({ preventScroll: true });
    } catch (cause) { setError((cause as Error).message); }
  }
}
