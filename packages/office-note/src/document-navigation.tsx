import { useEffect, useId, useMemo, useRef, useState, type RefObject } from 'react';
import type { Editor } from '@barocss/editor-core';
import { buildTextRunIndex } from '@barocss/shared';
import { findTextRanges, step, type DocumentAccess, type Match } from '@barocss/office-text';
import { useEditorRevision } from '@barocss/office-editor-ui';
import { DocumentNavigation, type DocumentNavigationMode } from '@barocss/office-ui';
import { noteHeadings } from './document-outline';
import './document-navigation.css';

export interface NoteNavigationRequest { mode: DocumentNavigationMode; id: number }
function textPoint(scope: HTMLElement, match: Match, end: boolean): [Text, number] | undefined {
  const el = scope.querySelector(`[data-bc-sid="${CSS.escape(match.sid)}"]`);
  if (!el) return;
  const index = buildTextRunIndex(el), offset = end ? match.end : match.start;
  const run = index.runs.find(run => offset >= run.start && offset <= run.end);
  if (run) return [run.domTextNode, run.domStart + offset - run.start];
}
export function NoteDocumentNavigation({ editor, rootId, scope, request }: { editor: Editor; rootId: string; scope: RefObject<HTMLDivElement | null>; request?: NoteNavigationRequest }) {
  const [mode, setMode] = useState<DocumentNavigationMode>();
  const [query, setQuery] = useState('');
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [current, setCurrent] = useState(0);
  const [activeHeading, setActiveHeading] = useState<string>();
  const [at, setAt] = useState<DOMRect | null>(null);
  const [draw, setDraw] = useState(0);
  const [opened, setOpened] = useState(0);
  const previousFocus = useRef<HTMLElement | null>(null);
  const token = `note-find-${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const revision = useEditorRevision(editor);
  const doc: DocumentAccess = useMemo(() => ({ rootId, getNode: id => editor.dataStore.getNode(id) as ReturnType<DocumentAccess['getNode']> }), [editor, rootId]);
  const matches = useMemo(() => mode === 'find' ? findTextRanges(doc, query, { caseSensitive }) : [], [doc, query, caseSensitive, revision, mode]);
  const headings = useMemo(() => mode ? noteHeadings(doc) : [], [doc, revision, mode]);
  const selected = matches.length ? Math.min(current, matches.length - 1) : -1;
  const close = () => { setMode(undefined); previousFocus.current?.isConnected && previousFocus.current.focus({ preventScroll: true }); };
  const open = (next: DocumentNavigationMode) => { previousFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null; setMode(next); setOpened(n => n + 1); };
  useEffect(() => { if (request) open(request.mode); }, [request?.id]);
  useEffect(() => {
    const keys = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.isComposing || event.keyCode === 229 || !(event.ctrlKey || event.metaKey) || event.altKey || event.key.toLowerCase() !== 'f') return;
      if (!(event.target instanceof Element) || event.target.closest('[data-note-editor]') !== scope.current?.closest('[data-note-editor]')) return;
      event.preventDefault(); event.stopPropagation(); open('find');
    };
    document.addEventListener('keydown', keys);
    return () => document.removeEventListener('keydown', keys);
  }, [scope]);
  useEffect(() => {
    if (!mode) return;
    const measure = () => {
      const box = scope.current?.closest('[data-side-peek]')?.getBoundingClientRect();
      setAt(new DOMRect(Math.min(window.innerWidth - 16, box?.right ?? window.innerWidth - 16), box ? box.top + 48 : 58, 0, 0));
    };
    measure(); window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [mode, scope]);
  useEffect(() => { setCurrent(0); }, [query, caseSensitive]);
  // DOM rendering can finish after the model event. Rebuild ranges from the actual new text nodes.
  useEffect(() => {
    const host = scope.current;
    if (!mode || !host) return;
    let frame = 0;
    const observer = new MutationObserver(() => { cancelAnimationFrame(frame); frame = requestAnimationFrame(() => setDraw(n => n + 1)); });
    observer.observe(host, { childList: true, subtree: true, characterData: true });
    return () => { observer.disconnect(); cancelAnimationFrame(frame); };
  }, [mode, scope]);
  const reveal = (target: Element) => {
    let parent = target.parentElement;
    while (parent && scope.current?.contains(parent)) {
      if (parent instanceof HTMLDetailsElement && !parent.open) { parent.dataset.noteNavigationOpen = 'true'; parent.open = true; }
      parent = parent.parentElement;
    }
    target.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'instant' });
  };
  useEffect(() => {
    const host = scope.current;
    if (!host || !mode) return;
    return () => {
      for (const detail of host.querySelectorAll<HTMLDetailsElement>('details[data-note-navigation-open]')) {
        const sid = detail.getAttribute('data-bc-sid');
        detail.open = sid ? editor.dataStore.getNode(sid)?.attributes?.open !== false : false;
        delete detail.dataset.noteNavigationOpen;
      }
    };
  }, [!!mode, scope, editor]);
  useEffect(() => {
    const host = scope.current;
    if (!host) return;
    const api = window as unknown as { Highlight?: new (...ranges: Range[]) => unknown; CSS?: { highlights?: { set(name: string, value: unknown): void; delete(name: string): void } } };
    const ranges = matches.map(match => {
      const start = textPoint(host, match.parts[0], false), end = textPoint(host, match.parts.at(-1)!, true);
      if (!start || !end) return;
      const range = document.createRange(); range.setStart(...start); range.setEnd(...end); return range;
    });
    const style = document.createElement('style');
    style.textContent = `::highlight(${token}){background:var(--ou-search-match);color:var(--ou-search-ink)}::highlight(${token}-current){background:var(--ou-search-current);color:var(--ou-search-ink)}`;
    if (api.Highlight && api.CSS?.highlights && mode === 'find') {
      document.head.append(style);
      api.CSS.highlights.set(token, new api.Highlight(...ranges.filter((range): range is Range => !!range)));
      api.CSS.highlights.set(`${token}-current`, new api.Highlight(...(ranges[selected] ? [ranges[selected]!] : [])));
    }
    const match = matches[selected];
    const target = match && host.querySelector<HTMLElement>(`[data-bc-sid="${CSS.escape(match.blockId)}"]`);
    if (target) { target.dataset.noteFindCurrent = 'true'; reveal(target); }
    return () => { style.remove(); api.CSS?.highlights?.delete(token); api.CSS?.highlights?.delete(`${token}-current`); if (target) delete target.dataset.noteFindCurrent; };
  }, [matches, selected, token, mode, draw, scope]);
  const heading = (id: string) => {
    const target = scope.current?.querySelector<HTMLElement>(`[data-bc-sid="${CSS.escape(id)}"]`);
    if (!target) return;
    setActiveHeading(id); reveal(target);
    // Navigation does not replace the writer's selection or add an undo entry.
  };
  if (!mode) return null;
  return <DocumentNavigation key={opened} mode={mode} at={at} query={query} current={selected} count={matches.length} caseSensitive={caseSensitive} headings={headings} activeHeading={activeHeading} onMode={setMode} onQuery={setQuery} onCaseSensitive={setCaseSensitive} onStep={direction => setCurrent(step(matches.length, selected, direction))} onHeading={heading} onClose={close} onDismiss={(reason, event) => {
    if (reason === 'escape') close();
    else if (event.target instanceof Element && !scope.current?.closest('[data-note-editor]')?.contains(event.target)) setMode(undefined);
  }} />;
}
