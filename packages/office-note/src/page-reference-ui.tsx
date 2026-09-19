import { useEffect, useRef, useState, type RefObject } from 'react';
import type { Editor, ModelSelection } from '@barocss/editor-core';
import { ownsEditorSelection, useEditorRevision, useSelectionRect } from '@barocss/office-editor-ui';
import { FloatingSurface, Icon, MenuAction } from '@barocss/office-ui';
import './page-reference-ui.css';

export interface NotePageReferenceDestination { source: string; rowId: string; next?: NotePageReferenceDestination }

/** A child body receives only the remaining route belonging to this exact parent item. */
export function pageReferenceChildDestination(destination: NotePageReferenceDestination | undefined, source: string | undefined, rowId: string | undefined): NotePageReferenceDestination | undefined {
  return destination?.source === source && destination?.rowId === rowId ? destination?.next : undefined;
}

export interface NotePageReferences {
  pages: { id: string; title: string; trashed?: boolean }[];
  currentPageId: string;
  revealItem?: NotePageReferenceDestination;
  registerBeforeNavigate?: (flush: () => Promise<boolean>) => () => void;
  onNavigate: (pageId: string) => void | boolean | Promise<void | boolean>;
}
export interface PageReferenceQuery { query: string; replaceRange: ModelSelection }

/** Search order must not change when library records are saved or loaded in a different order. */
export function matchingReferencePages(pages: NotePageReferences['pages'], query: string): NotePageReferences['pages'] {
  const normalized = query.toLocaleLowerCase();
  return pages.filter(page => !page.trashed && page.title.toLocaleLowerCase().includes(normalized))
    .sort((a, b) => a.title.localeCompare(b.title, 'ko', { numeric: true }) || a.id.localeCompare(b.id))
    .slice(0, 30);
}


/** Read the real inline text before the caret, including boundaries between marked runs. */
export function pageReferenceQuery(editor: Editor): PageReferenceQuery | undefined {
  const selection = editor.selection;
  if (!selection || selection.type !== 'range' || selection.startNodeId !== selection.endNodeId || selection.startOffset !== selection.endOffset) return;
  const run = editor.dataStore.getNode(selection.startNodeId);
  const parent = run?.parentId ? editor.dataStore.getNode(run.parentId) : undefined;
  if (typeof run?.text !== 'string' || !parent || parent.stype === 'codeBlock') return;
  const pieces: { id: string; text: string; at: number }[] = [];
  let before = '';
  for (const child of parent.content ?? []) {
    const node = typeof child === 'string' ? editor.dataStore.getNode(child) : child;
    if (!node?.sid) continue;
    const text = typeof node.text === 'string' ? node.text.slice(0, node.sid === run.sid ? selection.startOffset : undefined) : '\uFFFC';
    pieces.push({ id: node.sid, text, at: before.length }); before += text;
    if (node.sid === run.sid) break;
  }
  const bracket = /\[\[([^\[\]\n\uFFFC]*)$/.exec(before);
  // A mention starts at a word boundary; addresses such as name@example.com stay text.
  const mention = /(?:^|[\s(（])@([^@\[\]\n\uFFFC]*)$/.exec(before);
  const hit = bracket ?? mention;
  if (!hit) return;
  const start = bracket ? before.length - hit[0].length : before.length - hit[1].length - 1;
  // Escaped syntax and code-formatted ranges must remain literal.
  let escapes = 0;
  for (let i = start - 1; i >= 0 && before[i] === '\\'; i--) escapes++;
  if (escapes % 2) return;
  for (const piece of pieces) {
    const node = editor.dataStore.getNode(piece.id);
    if (node?.marks?.some(mark => mark.stype === 'code' && mark.range
      && piece.at + mark.range[0] < before.length && piece.at + mark.range[1] > start)) return;
  }
  const piece = pieces.find(piece => start >= piece.at && start < piece.at + piece.text.length);
  if (!piece) return;
  return { query: hit[1], replaceRange: { type: 'range', startNodeId: piece.id, startOffset: start - piece.at, endNodeId: run.sid!, endOffset: selection.startOffset, collapsed: false } };
}

export function PageReferenceUI({ editor, scope, references }: {
  editor: Editor; scope: RefObject<HTMLElement | null>; references: NotePageReferences;
}) {
  const revision = useEditorRevision(editor);
  const [selectionRevision, setSelectionRevision] = useState(0);
  const [composing, setComposing] = useState(false);
  const [dismissed, setDismissed] = useState('');
  const [current, setCurrent] = useState(0);
  const [problem, setProblem] = useState('');
  const busy = useRef(false);
  const currentOption = useRef<HTMLSpanElement>(null);
  const latest = useRef(references); latest.current = references;
  const doc = scope.current?.ownerDocument ?? document;
  const candidate = editor.isEditable && !composing && ownsEditorSelection(editor, doc.getSelection(), scope.current) ? pageReferenceQuery(editor) : undefined;
  const key = candidate ? JSON.stringify(candidate) : '';
  const open = !!candidate && key !== dismissed;
  const rows = matchingReferencePages(references.pages, candidate?.query ?? '');
  const at = useSelectionRect(editor, open, scope);
  useEffect(() => { setCurrent(0); setDismissed(value => value && value !== key ? '' : value); }, [key]);
  useEffect(() => { if (open && at) currentOption.current?.closest('[role="option"]')?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' }); }, [current, key, open, at]);
  useEffect(() => {
    const update = () => setSelectionRevision(value => value + 1);
    const start = (event: Event) => { if (event.target instanceof Node && scope.current?.contains(event.target)) setComposing(true); };
    const end = () => { setComposing(false); update(); };
    doc.addEventListener('selectionchange', update); doc.addEventListener('focusin', update);
    doc.addEventListener('compositionstart', start, true); doc.addEventListener('compositionend', end, true);
    return () => { doc.removeEventListener('selectionchange', update); doc.removeEventListener('focusin', update); doc.removeEventListener('compositionstart', start, true); doc.removeEventListener('compositionend', end, true); };
  }, [doc, scope]);
  // Marked as dependencies for the DOM/model snapshots read above.
  void revision; void selectionRevision;
  const insert = async (page: NotePageReferences['pages'][number]) => {
    if (!candidate || busy.current) return;
    busy.current = true; setProblem(''); setDismissed(key);
    try {
      const ok = await editor.executeCommand('insertNotePageReference', { pageId: page.id, title: page.title, replaceRange: candidate.replaceRange });
      if (!ok) setProblem('페이지 참조를 삽입하지 못했습니다. 다시 시도하세요.');
    } catch { setProblem('페이지 참조를 삽입하지 못했습니다.'); }
    finally { busy.current = false; }
  };
  useEffect(() => {
    if (!open) return;
    const typed = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.isComposing || event.keyCode === 229 || !(event.target instanceof Node) || !scope.current?.contains(event.target)) return;
      if (!['ArrowDown', 'ArrowUp', 'Enter', 'Escape'].includes(event.key)) return;
      event.preventDefault(); event.stopImmediatePropagation();
      if (event.key === 'Escape') { setDismissed(key); return; }
      if (event.key === 'Enter') { if (rows.length) void insert(rows[Math.min(current, rows.length - 1)]); return; }
      setCurrent(value => rows.length ? (value + (event.key === 'ArrowDown' ? 1 : -1) + rows.length) % rows.length : 0);
    };
    doc.addEventListener('keydown', typed, true);
    return () => doc.removeEventListener('keydown', typed, true);
  }, [doc, editor, scope, open, key, current, rows.map(row => row.id).join('\0')]);

  useEffect(() => {
    const host = scope.current;
    if (!host) return;
    const decorate = () => {
      for (const atom of host.querySelectorAll<HTMLElement>('[data-note-page-reference]')) {
        const page = latest.current.pages.find(page => page.id === atom.dataset.pageId);
        const title = page?.title || atom.dataset.pageTitle || '제목 없음';
        const label = atom.querySelector<HTMLElement>('[data-note-page-reference-title]');
        if (label && label.textContent !== title) label.textContent = title;
        const state = !page ? 'missing' : page.trashed ? 'trashed' : 'available';
        atom.dataset.pageState = state;
        atom.setAttribute('aria-disabled', page ? 'false' : 'true');
        atom.setAttribute('aria-label', `${title}${!page ? ' · 찾을 수 없는 페이지' : page.trashed ? ' · 휴지통의 페이지' : ' · 페이지 열기'}`);
        atom.title = !page ? '이 페이지를 찾을 수 없습니다.' : page.trashed ? '휴지통에 있는 페이지입니다. 열어서 복원할 수 있습니다.' : title;
      }
    };
    const navigate = async (event: Event) => {
      if (event instanceof KeyboardEvent && !['Enter', ' '].includes(event.key)) return;
      const target = event.target instanceof Element ? event.target.closest<HTMLElement>('[data-note-page-reference]') : null;
      if (!target || !host.contains(target)) return;
      event.preventDefault(); event.stopImmediatePropagation();
      const page = latest.current.pages.find(page => page.id === target.dataset.pageId);
      if (!page) { setProblem('이 페이지를 찾을 수 없습니다. 원본 페이지를 복원하거나 참조를 수정하세요.'); return; }
      setProblem('');
      try { const ok = await latest.current.onNavigate(page.id); if (ok === false) setProblem('변경 내용을 저장한 뒤 다시 페이지를 열어주세요.'); }
      catch { setProblem('페이지를 열지 못했습니다. 변경 내용을 확인하고 다시 시도하세요.'); }
    };
    decorate();
    const observer = new MutationObserver(decorate); observer.observe(host, { childList: true, subtree: true, characterData: true });
    host.addEventListener('click', navigate, true); host.addEventListener('keydown', navigate, true);
    return () => { observer.disconnect(); host.removeEventListener('click', navigate, true); host.removeEventListener('keydown', navigate, true); };
  }, [editor, scope, references.pages]);
  return <>{problem && <div className="on-page-reference-error" role="alert">{problem}</div>}
    <FloatingSurface open={open && !!at} at={at} variant="menu" role="listbox" aria-label="페이지 연결" data-note-page-picker prefer="below" align="start" className="on-page-reference-picker" onDismiss={() => setDismissed(key)}>
      <div className="on-page-reference-picker-label">페이지 연결</div>
      {!rows.length && <p className="on-page-reference-empty">일치하는 페이지가 없습니다.</p>}
      {rows.map((page, index) => <MenuAction key={page.id} role="option" aria-selected={index === current} selected={index === current} data-note-page-option={page.id} onMouseDown={event => event.preventDefault()} onClick={() => void insert(page)}><Icon name="type-page" /><span ref={index === current ? currentOption : undefined}>{page.title || '제목 없음'}</span>{page.id === references.currentPageId && <small>현재 페이지</small>}</MenuAction>)}
    </FloatingSurface>
  </>;
}
