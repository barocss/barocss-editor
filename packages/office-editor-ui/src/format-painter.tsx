import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import type { Editor, ModelSelection } from '@barocss/editor-core';
import type { EditorViewDOM } from '@barocss/editor-view-dom';
import { Button } from '@barocss/office-ui';
import { captureTextSelection } from './capture-text-selection';

/** Shared painting interaction; the product owns the format payload and scope. */
export function useFormatPainter<T>(editor: Editor | null, view: EditorViewDOM | null,
  capture: (editor: Editor) => T | undefined,
  apply: (editor: Editor, sample: T, selection: ModelSelection) => Promise<boolean>,
  options?: { renderOptions?: (value: T, update: (value: T) => void) => ReactNode;
    canApplyCollapsed?: (value: T) => boolean; description?: (value: T) => string }) {
  const [sample, setSample] = useState<{ value: T; root: string | null | undefined }>();
  const held = useRef(sample); held.current = sample;
  const locked = useRef(false);
  const [message, setMessage] = useState('');
  const [repeat, setRepeat] = useState(false);
  const repeating = useRef(false);
  const settings = useRef(options); settings.current = options;
  const cancel = useCallback(() => { held.current = undefined; setSample(undefined); setMessage(''); repeating.current = false; setRepeat(false); }, []);
  const updateSample = useCallback((value: T) => {
    if (!held.current || locked.current) return;
    const next = { ...held.current, value }; held.current = next; setSample(next); setMessage('');
  }, []);
  const applySelection = useCallback(async () => {
    const current = held.current;
    if (!editor || !view || !current || locked.current) return;
    if (!editor.isEditable) { cancel(); return; }
    if (current.root !== editor.getRootId()) { cancel(); return; }
    const at = captureTextSelection(editor, view, { allowBlurred: true }) ?? editor.selection;
    if (at?.type !== 'range' || (at.startNodeId === at.endNodeId && at.startOffset === at.endOffset
      && !settings.current?.canApplyCollapsed?.(current.value))) return;
    locked.current = true;
    try {
      editor.updateSelection({ selection: at, applySelectionToView: false });
      editor.historyManager.closeGroup();
      if (await apply(editor, current.value, structuredClone(at))) {
        if (held.current !== current) return;
        view.contentEditableElement.focus({ preventScroll: true });
        editor.updateSelection({ selection: at, applySelectionToView: true });
        if (!repeating.current) cancel();
        setMessage(repeating.current ? '서식을 적용했습니다. 다음 위치를 선택하세요. Esc로 마칩니다.' : '서식을 적용했습니다.');
      }
      else setMessage('이 선택에는 서식을 적용할 수 없습니다. 다른 텍스트를 선택하세요.');
    } finally { editor.historyManager.closeGroup(); locked.current = false; }
  }, [editor, view, apply, cancel]);
  const activate = useCallback(() => {
    if (!editor || !view || locked.current || !editor.isEditable) return;
    if (held.current) { void applySelection(); return; }
    const at = captureTextSelection(editor, view, { allowBlurred: true });
    if (at) editor.updateSelection({ selection: at, applySelectionToView: false });
    const value = capture(editor);
    if (!value) return;
    const next = { value, root: editor.getRootId() }; held.current = next; setSample(next); setMessage('');
  }, [editor, view, capture, applySelection]);
  useEffect(() => {
    if (!sample || !editor || !view) return;
    const scope = view.contentEditableElement, doc = scope.ownerDocument;
    let frame = 0;
    const pointer = (event: PointerEvent) => {
      if ((event.target as Element)?.closest('[data-editor-input-owner]')) return;
      // The editor completes click-to-caret mapping after pointerup. Capture
      // the destination after those handlers, rather than reusing the source.
      doc.defaultView!.cancelAnimationFrame(frame);
      frame = doc.defaultView!.requestAnimationFrame(() => { void applySelection(); });
    };
    const key = (event: KeyboardEvent) => { if (event.key === 'Escape') { event.preventDefault(); cancel(); } };
    const changed = (event?: { transaction?: unknown }) => {
      if (event?.transaction === null || held.current?.root !== editor.getRootId()) cancel();
    };
    scope.addEventListener('pointerup', pointer);
    scope.addEventListener('beforeinput', cancel, true);
    doc.addEventListener('keydown', key, true);
    editor.on('editor:content.change', changed);
    return () => {
      doc.defaultView!.cancelAnimationFrame(frame);
      scope.removeEventListener('pointerup', pointer); scope.removeEventListener('beforeinput', cancel, true);
      doc.removeEventListener('keydown', key, true); editor.off('editor:content.change', changed);
    };
  }, [sample, editor, view, applySelection, cancel]);
  const feedback = sample ? <div className="office-format-painter-status" role="status">
    <span>{message || options?.description?.(sample.value) || '적용할 텍스트를 드래그하세요. 키보드로 선택한 뒤 서식 복사 버튼을 다시 눌러도 됩니다.'}</span>
    {options?.renderOptions?.(sample.value, updateSample)}
    <Button pressed={repeat} onClick={() => { repeating.current = !repeating.current; setRepeat(repeating.current); setMessage(''); }}>연속 적용</Button>
    <Button onClick={cancel}>서식 복사 취소</Button>
  </div> : <span className="sr-only" role="status">{message}</span>;
  return { active: !!sample, activate, cancel, feedback };
}
