import { useEffect, useRef, useState } from 'react';
import { MathEditor, type MathEditorProps } from '@barocss/math-editor/react';
import { toLatex, type MathDocument } from '@barocss/math-editor/core';
import { Button } from '@barocss/office-ui';
import './latex-editor.css';

/** A disposable math draft. The product owns validation, persistence and history. */
export function MathInlineInput({ initial, excludedStructures, onApply, onCancel, keepOpenOnOutsidePointerDown }: {
  initial: MathDocument;
  excludedStructures?: MathEditorProps['excludedStructures'];
  onApply: (document: MathDocument) => Promise<void>;
  onCancel: () => void;
  /** Product view controls can change the viewport without committing a draft. */
  keepOpenOnOutsidePointerDown?: (target: Element) => boolean;
}) {
  const draft = useRef(initial), pending = useRef(false), composing = useRef(false);
  const host = useRef<HTMLSpanElement>(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const keepOpen = useRef(keepOpenOnOutsidePointerDown);
  keepOpen.current = keepOpenOnOutsidePointerDown;
  const apply = async () => {
    if (pending.current || composing.current) return;
    if (!toLatex(draft.current).trim()) { setError('수식을 입력하거나 취소하세요.'); return; }
    pending.current = true; setBusy(true); setError('');
    try { await onApply(draft.current); }
    catch (e) { setError((e as Error).message); }
    finally { pending.current = false; setBusy(false); }
  };
  const leave = useRef(() => {});
  leave.current = () => {
    if (composing.current || pending.current) return;
    if (!toLatex(draft.current).trim()) onCancel();
    else void apply();
  };
  useEffect(() => {
    const outside = (event: PointerEvent) => {
      if (!(event.target instanceof Element) || host.current?.contains(event.target)) return;
      if (keepOpen.current?.(event.target)) {
        // Buttons may change the view while the math input keeps its caret.
        // Editable controls (for example a zoom percentage) still receive focus.
        if (event.target.closest('button')) event.preventDefault();
        return;
      }
      const owner = host.current?.querySelector('[data-math-editor-owner]')?.getAttribute('data-math-editor-owner');
      if (owner && event.target.closest('[data-math-editor-owner]')?.getAttribute('data-math-editor-owner') === owner) return;
      // Finish the draft before the host can read a caret in temporary DOM.
      event.preventDefault(); event.stopImmediatePropagation(); leave.current();
    };
    document.addEventListener('pointerdown', outside, true);
    return () => document.removeEventListener('pointerdown', outside, true);
  }, []);
  return <span ref={host} className="oe-math-inplace" data-editor-input-owner="math" contentEditable={false}
    onKeyDown={event => event.stopPropagation()} onBeforeInput={event => event.stopPropagation()}
    onPaste={event => event.stopPropagation()} onCut={event => event.stopPropagation()}
    onCompositionStartCapture={() => { composing.current = true; }}
    onCompositionEndCapture={() => { composing.current = false; }}>
    <MathEditor autoFocus defaultValue={initial} multiline={false} toolbar={false}
      showTokenLegend={false} showLineNumbers={false}
      excludedStructures={excludedStructures} enterBehavior="commit"
      onChange={document => { draft.current = document; setError(''); }}
      onCommit={() => void apply()} onCancel={() => { if (!pending.current && !composing.current) onCancel(); }} />
    <span className="oe-math-inline-actions">
      <span>Enter 적용 · Esc 취소</span>
      <Button disabled={busy} onClick={() => void apply()}>적용</Button>
      <Button disabled={busy} onClick={onCancel}>취소</Button>
    </span>
    {error && <span role="alert">{error}</span>}
  </span>;
}
