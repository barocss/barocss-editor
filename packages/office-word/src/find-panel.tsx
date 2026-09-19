import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Editor } from '@barocss/editor-core';
import type { EditorViewDOM } from '@barocss/editor-view-dom';
import { findMatches, replaceMatches, step, type Match } from '@barocss/office-text';
/* Importing the type also registers how it is drawn — see `highlight-decorators.ts`. */
import { MATCH_STYPE } from './highlight-decorators';
import { Button, FloatingPanelHeader, FloatingPanelFooter, TextField, PropertyToggle, SearchResultNavigation, StatusNotice } from '@barocss/office-ui';

/**
 * Find and replace.
 *
 * The searching is the product's and lives there; this is the window onto it.
 * The shared kit ships a find that builds its own panel with
 * `document.createElement` and fixed positioning — which decides what every
 * host's search box looks like, and forces every host to have a DOM. This is
 * the same split the toolbar has: the product says what a match is and where
 * they are, and the app decides how to show them.
 *
 * The state lives here rather than in the editor for the same reason. What a
 * reader is searching for is not part of their document: it survives no edit,
 * belongs in no undo step, and two people reading the same document are not
 * searching for the same thing.
 */

/** 찾기 상자에게 필요한 것 — 문서, 그 문서를 그리는 뷰, 그리고 열려 있는가. */
export interface FindPanelProps {
  editor: Editor;
  /** 찾은 자리를 데코레이터로 칠하는 곳. */
  view: EditorViewDOM;
  open: boolean;
  initialField?: 'find' | 'replace';
  onClose: () => void;
}

export function FindPanel({ editor, view, open, onClose, initialField = 'find' }: FindPanelProps) {
  const [query, setQuery] = useState('');
  const [replacement, setReplacement] = useState('');
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [wholeWord, setWholeWord] = useState(false);
  const [current, setCurrent] = useState(-1);
  const [revision, setRevision] = useState(0);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ error: boolean; message: string } | null>(null);
  const pending = useRef(false);
  const anchor = useRef<HTMLDivElement>(null);
  const field = useRef<HTMLInputElement>(null);
  const replacementField = useRef<HTMLInputElement>(null);

  const doc = useMemo(
    () => ({
      getNode: (id: string) => (editor as unknown as { dataStore: { getNode(id: string): unknown } }).dataStore.getNode(id),
      get rootId() { return editor.getRootId() ?? ''; }
    }),
    [editor]
  );

  // Re-run whenever the document changes: a search whose answers are older than
  // the text is a search that offers to replace something that has moved.
  useEffect(() => {
    const bump = () => setRevision((n) => n + 1);
    editor.on('editor:content.change', bump);
    return () => editor.off('editor:content.change', bump);
  }, [editor]);

  const matches: Match[] = useMemo(
    () => (open ? findMatches(doc as never, query, { caseSensitive, wholeWord }) : []),
    [doc, query, caseSensitive, wholeWord, open, revision]
  );

  /**
   * Draw the matches, with the current one told apart from the rest.
   *
   * All of them in one call: adding them one by one renders the document once
   * per match, which for forty matches is eighty renders to show and hide them
   * and a page that stops answering.
   */
  const hits = useMemo(
    () =>
      matches.map((match, index) => ({
        sid: `find-${index}`,
        stype: MATCH_STYPE,
        category: 'inline',
        target: { sid: match.sid, startOffset: match.start, endOffset: match.end },
        data: { current: index === current }
      })),
    [matches, current]
  );

  /**
   * **What the marks are, not which array they arrived in.**
   *
   * `matches` is rebuilt on every `editor:content.change` — it has `revision` in its own deps — so
   * it is a new array after every keystroke even when the same words still match in the same
   * places. With it in this effect's deps, typing with the find bar open cleared the marks and drew
   * them again on every character: two renders of the whole document to arrive back at the picture
   * already on screen.
   *
   * The comments pane had the identical shape and it cost Word **six renders for one keystroke**
   * against a budget of three (`apps/word/tests/input-pipeline.spec.ts:122`), which read as IME and
   * pagination flakiness for a whole round. This one has never shown up because **nothing types
   * with the find bar open** — the same silence, waiting.
   *
   * The cleanup stays on this effect. Giving it one of its own looked tidier and emptied the marks:
   * under StrictMode a lone cleanup fires once on mount, and an effect keyed on an unchanged string
   * never puts them back.
   */
  const hitKey = JSON.stringify(
    hits.map((one) => [one.sid, one.target.sid, one.target.startOffset, one.target.endOffset, one.data.current])
  );

  useEffect(() => {
    view.setDecorators(MATCH_STYPE, hits as never);
    return () => view.setDecorators(MATCH_STYPE, []);
    // `hits` is rebuilt with `matches`; `hitKey` is what actually changed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, hitKey]);

  // New searches start at the top; edits clamp the active result to the remaining matches.
  useEffect(() => {
    setCurrent(matches.length > 0 ? 0 : -1);
    setFeedback(null);
  }, [query, caseSensitive, wholeWord, open]);
  useEffect(() => {
    setCurrent(index => matches.length ? Math.max(0, Math.min(index, matches.length - 1)) : -1);
  }, [matches.length]);

  useEffect(() => {
    if (!open || current < 0) return;
    const frame = requestAnimationFrame(() => {
      const hit = view.container.querySelector('.w-find-hit.is-current');
      hit?.scrollIntoView({ block: 'center', inline: 'nearest' });
      const pane = anchor.current?.parentElement;
      const panel = anchor.current?.firstElementChild;
      if (!hit || !pane || !panel) return;
      const result = hit.getBoundingClientRect(), popup = panel.getBoundingClientRect(), viewport = pane.getBoundingClientRect();
      if (result.right > popup.left && result.left < popup.right && result.bottom > popup.top && result.top < popup.bottom) {
        // Keep the active match below the panel when the compact layout overlays the page.
        const below = popup.bottom + 16;
        if (below + result.height < viewport.bottom) pane.scrollTop += result.top - below;
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [view, current, query, caseSensitive, wholeWord, open]);

  useEffect(() => {
    if (open) (initialField === 'replace' ? replacementField : field).current?.focus();
  }, [open, initialField]);

  const go = useCallback(
    (direction: 1 | -1) => setCurrent((index) => step(matches.length, index, direction)),
    [matches.length]
  );

  const replace = useCallback(async (all: boolean) => {
    const targets = all ? matches : matches[current] ? [matches[current]] : [];
    if (!targets.length || pending.current) return;
    pending.current = true;
    setBusy(true);
    setFeedback(null);
    try {
      if (!await replaceMatches(editor, targets, replacement)) throw new Error('Replacement rejected');
      setFeedback({ error: false, message: `${targets.length}개를 바꿨습니다.` });
      setRevision(value => value + 1);
    } catch {
      setFeedback({ error: true, message: '텍스트를 바꾸지 못했습니다.' });
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }, [editor, matches, current, replacement]);

  if (!open) return null;

  return (
    <div className="w-find-anchor" ref={anchor}>
      <div className="w-find-panel" role="search" aria-label="찾기 및 바꾸기" aria-busy={busy || undefined}
        onKeyDown={event => {
          if (event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229) return;
          if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); onClose(); }
        }}>
        <FloatingPanelHeader title="찾기 및 바꾸기" closeLabel="찾기 닫기" onClose={onClose} />
        <TextField inputRef={field} testClass="w-find-query" type="search" ariaLabel="찾을 내용"
          placeholder="문서에서 찾기" value={query} onChange={setQuery} disabled={busy}
          onKeys={event => {
            if (event.key === 'Enter') { event.preventDefault(); go(event.shiftKey ? -1 : 1); }
          }} />
        <SearchResultNavigation query={query} current={current} count={matches.length} onStep={go}
          disabled={busy} countClassName="w-find-count" />
        <div className="w-find-options">
          <PropertyToggle ariaLabel="대소문자 구분" label="대소문자 구분" value={caseSensitive} onChange={setCaseSensitive} disabled={busy} />
          <PropertyToggle ariaLabel="단어 단위로" label="단어 단위로" value={wholeWord} onChange={setWholeWord} disabled={busy} />
        </div>
        <div className="w-find-replace">
          <label className="w-find-label">
            <span>바꿀 내용</span>
            <TextField inputRef={replacementField} testClass="w-find-replacement" ariaLabel="바꿀 내용"
              placeholder="비워 두면 찾은 내용을 삭제합니다" value={replacement} onChange={setReplacement} disabled={busy}
              onKeys={event => {
                if (event.key === 'Enter') { event.preventDefault(); void replace(false); }
              }} />
          </label>
          <FloatingPanelFooter>
            <Button disabled={busy || current < 0 || !matches.length} onClick={() => void replace(false)}>하나 바꾸기</Button>
            <Button tone="accent" disabled={busy || !matches.length} onClick={() => void replace(true)}>모두 바꾸기</Button>
          </FloatingPanelFooter>
        </div>
        {feedback && <StatusNotice tone={feedback.error ? 'danger' : 'success'} title={feedback.message}>
          {feedback.error ? '입력한 내용은 유지됩니다. 바꾸기 버튼으로 다시 시도하세요.' : undefined}
        </StatusNotice>}
      </div>
    </div>
  );
}

export { MATCH_STYPE };
