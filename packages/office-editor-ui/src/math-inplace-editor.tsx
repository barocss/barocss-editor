import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import type { Editor } from '@barocss/editor-core';
import { MathEditor } from '@barocss/math-editor/react';
import { createMathDocument, parseLatex, parseMathDocument, toLatex } from '@barocss/math-editor/core';
import { Button, Choice, FloatingSurface } from '@barocss/office-ui';
import katex from 'katex';

export interface MathInplaceDraft { tex: string; mathDocument: string; fontSize?: number; alignment?: string }

/** One local draft and one host transaction; keystrokes remain owned by math-editor. */
export function MathInplaceEditor({ editor, nodeId, onClose, onExpand, registerBeforeLeave, onFocusChange }: {
  onFocusChange?: (focused: boolean) => void;
  editor: Editor;
  nodeId: string;
  onClose: (showTools?: boolean) => void;
  onExpand: (draft: MathInplaceDraft) => void;
  registerBeforeLeave?: (flush: () => Promise<boolean>) => () => void;
}) {
  const host = useRef<HTMLSpanElement>(null), tools = useRef<HTMLDivElement>(null);
  const [initial] = useState(() => {
    const node = editor.dataStore.getNode(nodeId)!;
    const tex = String(node.attributes?.tex ?? '');
    const mathDocument = String(node.attributes?.mathDocument ?? '');
    const saved = parseMathDocument(mathDocument);
    const parsed = parseLatex(tex, { multiline: node.stype !== 'mathInline' });
    return { tex, mathDocument, inline: node.stype === 'mathInline',
      fontSize: Number(node.attributes?.fontSize) || (node.stype === 'mathInline' ? 18 : 24),
      alignment: String(node.attributes?.alignment ?? 'center'),
      document: !tex.trim() ? createMathDocument() : saved && toLatex(saved) === tex ? saved : parsed.ok ? parsed.document : undefined };
  });
  const draft = useRef<MathInplaceDraft>({ tex: initial.tex, mathDocument: initial.mathDocument });
  const composing = useRef(false);
  const finishAfterComposition = useRef<boolean | undefined>(undefined);
  const pending = useRef<Promise<boolean> | undefined>(undefined);
  const mounted = useRef(true);
  const [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const [size, setSize] = useState(initial.fontSize), [alignment, setAlignment] = useState(initial.alignment);
  const [focused, setFocused] = useState(true);
  const [rect, setRect] = useState<DOMRect | null>(null);
  useLayoutEffect(() => {
    const update = () => setRect(host.current?.getBoundingClientRect() ?? null);
    update();
    const observer = new ResizeObserver(update);
    if (host.current) observer.observe(host.current);
    window.addEventListener('scroll', update, true);
    window.addEventListener('resize', update);
    return () => { observer.disconnect(); window.removeEventListener('scroll', update, true); window.removeEventListener('resize', update); };
  }, []);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const finish = (restore = false): Promise<boolean> => {
    if (composing.current) { finishAfterComposition.current = restore; return Promise.resolve(false); }
    if (pending.current) return pending.current;
    const value = draft.current;
    if (!value.tex.trim()) { setError('수식을 입력하거나 취소하세요.'); return Promise.resolve(false); }
    try { katex.renderToString(value.tex, { throwOnError: true, trust: false, maxExpand: 1000, maxSize: 20 }); }
    catch { setError('수식을 완성한 뒤 적용하세요. 크게 편집에서 원문을 확인할 수 있습니다.'); return Promise.resolve(false); }
    setBusy(true);
    const atom = host.current?.closest('[data-latex-node]');
    pending.current = (async () => {
      try {
        const unchanged = value.tex === initial.tex && value.mathDocument === initial.mathDocument && size === initial.fontSize && alignment === initial.alignment;
        const success = unchanged || await editor.executeCommand('setMathSource', {
          nodeId, ...value, fontSize: size, ...(!initial.inline ? { alignment } : {}),
        });
        if (!success) { if (mounted.current) setError('수식을 적용하지 못했습니다.'); return false; }
        onClose(!restore);
        if (restore) requestAnimationFrame(() => {
          const node = editor.dataStore.getNode(nodeId);
          const siblings = node?.parentId ? editor.dataStore.getNode(node.parentId)?.content ?? [] : [];
          const firstText = (id: string): ReturnType<typeof editor.dataStore.getNode> => {
            const candidate = editor.dataStore.getNode(id);
            if (typeof candidate?.text === 'string') return candidate;
            for (const child of candidate?.content ?? []) {
              if (typeof child !== 'string') continue;
              const text = firstText(child); if (text) return text;
            }
          };
          const next = firstText(String(siblings[siblings.indexOf(nodeId) + 1]));
          if (typeof next?.text === 'string') {
            (atom?.closest('[contenteditable="true"]') as HTMLElement | null)?.focus({ preventScroll: true });
            editor.setRange({ type: 'range', startNodeId: next.sid, endNodeId: next.sid, startOffset: 0, endOffset: 0, collapsed: true });
          }
        });
        return true;
      } catch { if (mounted.current) setError('수식을 저장하지 못했습니다. 다시 시도하세요.'); return false; }
      finally { pending.current = undefined; if (mounted.current) setBusy(false); }
    })();
    return pending.current;
  };
  useEffect(() => {
    const update = () => {
      if (!host.current) return;
      const active = document.activeElement;
      const owner = host.current?.querySelector('[data-math-editor-owner]')?.getAttribute('data-math-editor-owner');
      const value = !!(active instanceof Element && owner && active.closest('[data-math-editor-owner]')?.getAttribute('data-math-editor-owner') === owner);
      setFocused(value); onFocusChange?.(value);
    };
    const blur = () => queueMicrotask(update);
    update();
    document.addEventListener('focusin', update);
    document.addEventListener('focusout', blur);
    return () => { document.removeEventListener('focusin', update); document.removeEventListener('focusout', blur); onFocusChange?.(false); };
  }, [onFocusChange]);
  const latest = useRef(finish); latest.current = finish;
  useEffect(() => registerBeforeLeave?.(() => latest.current()), [registerBeforeLeave]);
  useEffect(() => {
    const outside = (event: PointerEvent) => {
      const target = event.target as Element;
      if (host.current?.contains(target) || tools.current?.contains(target)) return;
      const owner = host.current?.querySelector('[data-math-editor-owner]')?.getAttribute('data-math-editor-owner');
      if (owner && target.closest('[data-math-editor-owner]')?.getAttribute('data-math-editor-owner') === owner) return;
      void latest.current();
    };
    document.addEventListener('pointerdown', outside, true);
    return () => document.removeEventListener('pointerdown', outside, true);
  }, []);

  return <span ref={host} className="oe-math-inplace" data-inline={initial.inline} data-editor-input-owner="math" contentEditable={false}
    style={{ fontSize: size, "--me-font-size": `${size}px` } as CSSProperties} onKeyDown={event => event.stopPropagation()}
    onCompositionStartCapture={() => { composing.current = true; }}
    onCompositionEndCapture={() => {
      composing.current = false;
      const restore = finishAfterComposition.current;
      finishAfterComposition.current = undefined;
      if (restore !== undefined) queueMicrotask(() => { if (mounted.current) void latest.current(restore); });
    }}
    onBeforeInput={event => event.stopPropagation()} onPaste={event => event.stopPropagation()}>
    {initial.document ? <MathEditor autoFocus defaultValue={initial.document}
      multiline={!initial.inline} toolbar={false} showTokenLegend={false} showLineNumbers={false}
      enterBehavior="commit" onCommit={() => void finish(true)} onCancel={() => onClose()}
      onChange={(document, tex) => { draft.current = { tex, mathDocument: JSON.stringify(document) }; setError(''); }}
    /> : <span>이 수식은 원문 편집이 필요합니다.</span>}
    {focused && error && <span role="alert">{error}</span>}
    <FloatingSurface open={!focused} at={rect} aria-label="본문 수식 도구" ownedElements={[host, tools]}>
      <div ref={tools} className="oe-math-inplace-tools">
        <Choice ariaLabel="수식 크기 바로 변경" value={String(size)} disabled={busy} onChange={value => setSize(Number(value))}>
          {[16, 18, 20, 24, 32, 40, 48].map(value => <option key={value} value={value}>{value}px</option>)}
        </Choice>
        {!initial.inline && <Choice ariaLabel="수식 정렬" value={alignment} disabled={busy} onChange={setAlignment}>
          <option value="left">왼쪽</option><option value="center">가운데</option><option value="right">오른쪽</option>
        </Choice>}
        <Button disabled={busy} onClick={() => onExpand({ ...draft.current, fontSize: size, ...(!initial.inline ? { alignment } : {}) })}>크게 편집</Button>
        <Button disabled={busy} onClick={() => onClose()}>취소</Button>
        <Button disabled={busy} onClick={() => void finish(true)}>완료</Button>
        {error && <span role="alert">{error}</span>}
      </div>
    </FloatingSurface>
  </span>;
}
