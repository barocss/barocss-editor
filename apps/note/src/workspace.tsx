import { AdaptiveWorkspace, WorkspaceSidePanel, EditorHeader, ProductMenu, PanelHeader, NavigationItem, EmptyState, StatusIndicator, StatusNotice } from '@barocss/office-ui';
import { importNoteExchange, exportNoteExchange, type NoteExchangeFormat } from '@barocss/office-note';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Button, Choice, Icon, TextField, MenuBar, Dialog, IconButton } from '@barocss/office-ui';
import { documentLibrary, LibraryRevisionConflict, registerProductDocumentHost, type LibraryRow } from '@barocss/shared';
import { NoteEditor } from '@barocss/office-note/view';
import { noteLibrary, noteFileText, noteFileName, readNoteFile, openNoteTree, noteTreeOf, type NoteDocument, type NoteSession } from '@barocss/office-note';

import { pageMeta, pageTemplate, normalizeHierarchy, canMovePage, pageInTrash, orderedPages, searchPages, type PageMeta, type PageTemplate, type WorkspacePage } from './workspace-library';
import { backlinksTo, importedPage } from './workspace-references';
import { planWorkspaceRestore, readWorkspaceBackup, workspaceBackupText, type WorkspaceBackup, type WorkspaceRestorePlan } from './workspace-backup';
import { WorkspaceBackupControls } from './workspace-backup-ui';
type ReferenceItem = { source: string; rowId: string; next?: ReferenceItem };
type HistoryDestination = { id: string; item?: ReferenceItem };
const pageInHash = () => { try { return decodeURIComponent(location.hash.slice(1)); } catch { return ''; } };
type StoredNote = WorkspacePage & { revision?: number };
const recoveryLibrary = documentLibrary({ db: 'barocss-note-recovery', store: 'drafts' });
type UnreadableNote = { id: string; title: string; reason: string; source?: string };
type LibrarySnapshot = { notes: StoredNote[]; unreadable: UnreadableNote[] };
let opening: Promise<LibrarySnapshot> | undefined;
function loadNotes() {
  return opening ??= (async () => {
    const rows = await noteLibrary.rows();
    if (!rows.length) {
      const first = { id: crypto.randomUUID(), document: pageTemplate('meeting', true), meta: pageMeta() };
      first.document.attributes.pageId = first.id;
      const saved = await noteLibrary.keep({ name: first.id, title: first.document.attributes.title, metadata: { ...first.meta } }, noteFileText(first.document), { expectedRevision: null });
      return { notes: [{ ...first, revision: saved.revision }], unreadable: [] };
    }
    // One unreadable file must not prevent the others from opening or being backed up.
    const loaded = await Promise.all(rows.map(async (row): Promise<StoredNote | UnreadableNote> => {
      let source: string | undefined;
      try {
        const snapshot = await noteLibrary.read(row.name);
        source = snapshot?.text;
        if (source === undefined) throw new Error('보관한 노트를 읽을 수 없습니다.');
        const read = readNoteFile(source);
        if ('error' in read) throw new Error(read.error);
        return { id: row.name, document: { ...read.document, attributes: { ...read.document.attributes, pageId: row.name } }, meta: pageMeta(snapshot?.row.metadata, snapshot?.row.savedAt), revision: snapshot?.row.revision ?? 0 };
      } catch (error) {
        return { id: row.name, title: row.title || '제목 없는 노트', source,
          reason: error instanceof Error ? error.message : '보관한 노트를 읽을 수 없습니다.' };
      }
    }));
    return {
      notes: normalizeHierarchy(loaded.filter((row): row is StoredNote => 'document' in row)),
      unreadable: loaded.filter((row): row is UnreadableNote => 'reason' in row)
    };
  })().catch(error => { opening = undefined; throw error; });
}

export function Workspace() {
  const [panel, setPanel] = useState<'export' | 'page' | 'template' | null>(null);
  const [exchangeFormat, setExchangeFormat] = useState<'json' | NoteExchangeFormat>('json');
  const [notes, setNotes] = useState<StoredNote[]>([]);
  const [unreadable, setUnreadable] = useState<UnreadableNote[]>([]);
  const documents = useRef(new Map<string, NoteDocument>());
  const metadata = useRef(new Map<string, PageMeta>());
  const [query, setQuery] = useState('');
  const [view, setView] = useState<'all' | 'favorites' | 'trash'>('all');
  const [template, setTemplate] = useState<PageTemplate>('blank');
  const [selected, setSelected] = useState('');
  const [session, setSession] = useState<{ id: string; value: NoteSession; generation: number }>();
  const [navigationRequest, setNavigationRequest] = useState<{ mode: 'find' | 'outline'; id: number; pageId: string }>();
  const openNavigation = (mode: 'find' | 'outline') => setNavigationRequest(previous => ({ mode, id: (previous?.id ?? 0) + 1, pageId: selected }));
  const [ready, setReady] = useState(false);
  const [problem, setProblem] = useState('');
  const [saving, setSaving] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const pending = useRef(new Set<string>());
  const versions = useRef(new Map<string, number>());
  const storageRevisions = useRef(new Map<string, number | null>());
  const conflictDrafts = useRef(new Map<string, string>());
  const [conflicts, setConflicts] = useState<string[]>([]);
  const [drafts, setDrafts] = useState<LibraryRow[]>([]);
  const [recovering, setRecovering] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const archiveBusy = useRef(false);
  const deferredHistory = useRef<HistoryDestination | undefined>(undefined);
  const moveFromHistory = useRef<((target: HistoryDestination) => void) | undefined>(undefined);
  const restoreSource = useRef<WorkspaceBackup | undefined>(undefined);
  const [reloadSession, setReloadSession] = useState(0);
  const sessionGeneration = useRef(0);
  const currentSession = useRef(session); currentSession.current = session;
  const queue = useRef(Promise.resolve());
  const picker = useRef<HTMLInputElement>(null);
  const [referenceDestination, setReferenceDestination] = useState<ReferenceItem>();
  const navigationFlushes = useRef(new Set<() => Promise<boolean>>());
  const navigating = useRef(false);
  const registerBeforeNavigate = useCallback((flush: () => Promise<boolean>) => {
    navigationFlushes.current.add(flush);
    return () => { navigationFlushes.current.delete(flush); };
  }, []);

  const showNotes = () => setNotes(Array.from(documents.current, ([id, document]) => ({ id, document, meta: metadata.current.get(id) ?? pageMeta() })));
  const selectedTrashed = pageInTrash(selected, metadata.current);
  const flushNavigation = async () => {
    // Inner item sessions publish into their parents, so flush the deepest mounted body first.
    for (const flush of [...navigationFlushes.current].reverse()) if (!await flush()) return false;
    return true;
  };
  const navigatePage = async (id: string, push = true, item?: ReferenceItem, keepSearch = false): Promise<boolean> => {
    if (!documents.current.has(id) || navigating.current || archiveBusy.current) return false;
    navigating.current = true;
    try {
      if (!await flushNavigation()) return false;
      setNavigationRequest(undefined);
      setReferenceDestination(item);
      setView(pageInTrash(id, metadata.current) ? 'trash' : 'all'); if (!keepSearch) setQuery('');
      if (push && id !== selected) history.pushState({ noteItem: item }, '', `${location.pathname}${location.search}#${encodeURIComponent(id)}`);
      setSelected(id);
      return true;
    } catch { setProblem('마지막 입력을 저장하지 못해 페이지 이동을 멈췄습니다. 다시 시도하세요.'); return false; }
    finally { navigating.current = false; }
  };
  const navigate = useRef(navigatePage); navigate.current = navigatePage;
  useEffect(() => {
    const move = ({ id, item }: HistoryDestination) => {
      void navigate.current(id, false, item).then(ok => {
        if (!ok && documents.current.size) history.replaceState(null, '', `${location.pathname}${location.search}#${encodeURIComponent(selectedPage.current)}`);
      });
    };
    moveFromHistory.current = move;
    const pop = (event: PopStateEvent) => {
      const id = pageInHash();
      const item = event.state?.noteItem;
      const destination = item && typeof item.source === 'string' && typeof item.rowId === 'string' ? item as ReferenceItem : undefined;
      if (archiveBusy.current) deferredHistory.current = { id, item: destination };
      else move({ id, item: destination });
    };
    window.addEventListener('popstate', pop);
    return () => { window.removeEventListener('popstate', pop); moveFromHistory.current = undefined; };
  }, []);
  const selectedPage = useRef(selected); selectedPage.current = selected;
  const dirty = (id: string) => {
    pending.current.add(id);
    versions.current.set(id, (versions.current.get(id) ?? 0) + 1);
    setSaving(true);
  };
  const refreshDrafts = async () => setDrafts(await recoveryLibrary.rows());
  const persist = (id: string) => {
    const document = documents.current.get(id);
    if (!document) return;
    const version = versions.current.get(id) ?? 0;
    const text = noteFileText(document);
    const title = document.attributes.title;
    const meta = { ...metadata.current.get(id) };
    queue.current = queue.current.then(async () => {
      try {
        if (!conflictDrafts.current.has(id)) {
          try {
            const saved = await noteLibrary.keep({ name: id, title, metadata: meta }, text,
              { expectedRevision: storageRevisions.current.get(id) ?? null });
            storageRevisions.current.set(id, saved.revision ?? 0);
          } catch (error) {
            if (!(error instanceof LibraryRevisionConflict)) throw error;
            conflictDrafts.current.set(id, crypto.randomUUID());
            setConflicts([...conflictDrafts.current.keys()]);
          }
        }
        const draftId = conflictDrafts.current.get(id);
        if (draftId) {
          await recoveryLibrary.keep({ name: draftId, title, metadata: { originalId: id, page: meta } }, text);
          await refreshDrafts();
        }
        if (versions.current.get(id) === version) pending.current.delete(id);
        if (!pending.current.size) setProblem('');
      } catch {
        setProblem(conflictDrafts.current.has(id)
          ? '최신본은 유지했지만 내 초안을 보관하지 못했습니다. 이 창을 유지하고 다시 시도하거나 파일로 내보내세요.'
          : '노트를 이 브라우저에 저장하지 못했습니다. 다시 시도하거나 파일로 내보내세요.');
      }
      setSaving(pending.current.size > 0);
    });
  };

  useEffect(() => {
    let cancelled = false;
    void loadNotes().then(({ notes: rows, unreadable }) => {
      if (cancelled) return;
      documents.current = new Map(rows.map(row => [row.id, row.document]));
      metadata.current = new Map(rows.map(row => [row.id, row.meta]));
      storageRevisions.current = new Map(rows.map(row => [row.id, row.revision ?? 0]));
      void refreshDrafts().catch(() => setProblem('복구 초안 목록을 읽지 못했습니다. 다시 시도하세요.'));
      setNotes(rows);
      setUnreadable(unreadable);
      const remembered = pageInHash();
      const active = rows.filter(row => !pageInTrash(row.id, metadata.current));
      setSelected(active.some(row => row.id === remembered) ? remembered : active[0]?.id ?? '');
      setProblem('');
      setReady(true);
    }).catch(error => { if (!cancelled) setProblem(error instanceof Error ? error.message : '노트 보관함을 열 수 없습니다.'); });
    return () => { cancelled = true; };
  }, [attempt]);

  useEffect(() => {
    if (!selected || selectedTrashed) { setSession(undefined); return; }
    const document = documents.current.get(selected);
    if (!document) return;
    const one = openNoteTree(document, {
      onChange: blocks => {
        const current = documents.current.get(selected);
        if (!current) return;
        documents.current.set(selected, { ...current, content: blocks });
        showNotes();
        persist(selected);
      }, after: 150
    });
    const changed = () => {
      const tree = noteTreeOf({ getNode: id => one.editor.dataStore.getNode(id) as never }, one.rootId);
      const current = documents.current.get(selected);
      if (tree && current) documents.current.set(selected, { ...current, content: tree.content as unknown[] });
      dirty(selected);
    };
    one.editor.on('editor:content.change' as never, changed);
    setSession({ id: selected, value: one, generation: ++sessionGeneration.current });
    history.replaceState(history.state, '', `${location.pathname}${location.search}#${encodeURIComponent(selected)}`);
    return () => {
      one.editor.off('editor:content.change' as never, changed);
      one.close();
    };
  }, [selected, selectedTrashed, reloadSession]);

  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (!pending.current.size) return;
      for (const id of pending.current) persist(id);
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, []);

  const add = async (document: NoteDocument, parentId: string | null = null) => {
    if (!await flushNavigation()) return;
    const imported = importedPage(document, new Set([...documents.current.keys(), ...unreadable.map(note => note.id)]), () => crypto.randomUUID());
    const id = imported.id;
    documents.current.set(id, imported.document);
    storageRevisions.current.set(id, null);
    metadata.current.set(id, { ...pageMeta(), parentId });
    setView('all');
    setQuery('');
    showNotes();
    dirty(id);
    persist(id);
    setReferenceDestination(undefined);
    setSelected(id);
  };
  const updateMeta = (id: string, patch: Partial<PageMeta>) => {
    const current = metadata.current.get(id);
    if (!current) return;
    metadata.current.set(id, { ...current, ...patch });
    showNotes(); dirty(id); persist(id);
  };
  const trash = async () => {
    if (!await flushNavigation()) return;
    updateMeta(selected, { trashedAt: Date.now() });
    setSelected(notes.find(note => !pageInTrash(note.id, metadata.current))?.id ?? '');
  };
  const restore = () => {
    const meta = metadata.current.get(selected);
    if (!meta) return;
    const parentId = meta.parentId && pageInTrash(meta.parentId, metadata.current) ? null : meta.parentId;
    updateMeta(selected, { trashedAt: null, parentId });
    setView('all'); setQuery('');
  };
  const move = (parentId: string | null) => {
    if (!canMovePage(selected, parentId, metadata.current) || (parentId && pageInTrash(parentId, metadata.current))) return;
    updateMeta(selected, { parentId });
  };
  const pageTitles = new Map(notes.map(note => [note.id, note.document.attributes.title]));
  const filtered = searchPages(notes.filter(note => view === 'trash' ? pageInTrash(note.id, metadata.current) : !pageInTrash(note.id, metadata.current) && (view !== 'favorites' || note.meta.favorite)), query, pageTitles);
  const backlinks = backlinksTo(notes, selected);
  const referencePages = notes.map(note => ({ id: note.id, title: note.document.attributes.title || '제목 없는 노트', trashed: pageInTrash(note.id, metadata.current) }));
  const visibleRows = orderedPages(filtered);
  const switchView = (next: typeof view) => {
    setNavigationRequest(undefined);
    setView(next); setQuery('');
    if (next === 'trash') setSelected(notes.find(note => pageInTrash(note.id, metadata.current))?.id ?? '');
    else if (selectedTrashed) setSelected(notes.find(note => !pageInTrash(note.id, metadata.current) && (next !== 'favorites' || note.meta.favorite))?.id ?? '');
  };
  const title = notes.find(note => note.id === selected)?.document.attributes.title ?? '';
  const rename = (title: string) => {
    const current = documents.current.get(selected);
    if (!current) return;
    documents.current.set(selected, { ...current, attributes: { ...current.attributes, title } });
    showNotes();
    dirty(selected);
    persist(selected);
  };
  const downloadText = (text: string, name: string, mime = 'application/json') => {
    const url = URL.createObjectURL(new Blob([text], { type: mime }));
    const link = window.document.createElement('a');
    link.href = url;
    link.download = name;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const download = async () => {
    try {
      if (!await flushNavigation()) throw new Error('마지막 입력을 반영하지 못했습니다. 다시 시도하세요.');
      currentSession.current?.value.flush();
      const document = documents.current.get(selected);
      if (document) {
        if (exchangeFormat === 'json') downloadText(noteFileText(document), noteFileName(document.attributes.title));
        else { const output = exportNoteExchange(document, exchangeFormat); downloadText(output.text, noteFileName(document.attributes.title).replace(/\.note\.json$/, '.' + output.extension), output.mime); }
      }
    } catch (error) { setProblem(error instanceof Error ? error.message : '파일을 내보내지 못했습니다.'); }
  };
  const withArchive = async <T,>(work: () => Promise<T>): Promise<T> => {
    if (archiveBusy.current) throw new Error('보관함 작업이 진행 중입니다. 잠시 후 다시 시도하세요.');
    archiveBusy.current = true; setArchiving(true);
    try { return await work(); }
    finally {
      archiveBusy.current = false; setArchiving(false);
      const deferred = deferredHistory.current;
      deferredHistory.current = undefined;
      if (deferred) moveFromHistory.current?.(deferred);
    }
  };
  const flushArchive = async () => {
    if (!await flushNavigation()) throw new Error('마지막 입력을 반영하지 못했습니다. 다시 시도하세요.');
    currentSession.current?.value.flush();
    for (const id of pending.current) persist(id);
    await queue.current;
    if (pending.current.size) throw new Error('마지막 입력을 보관하지 못했습니다. 저장을 다시 시도한 뒤 진행하세요.');
  };
  const hostFlush = useRef(flushArchive); hostFlush.current = flushArchive;
  useEffect(() => {
    if (!ready) return;
    return registerProductDocumentHost({ product: 'note', id: () => selectedPage.current, beforeNavigate: async () => {
      try { await hostFlush.current(); return true; } catch { return false; }
    } });
  }, [ready]);
  const backupWorkspace = () => withArchive(async () => {
    await flushArchive();
    // Recovery moves draft → durable page → draft deletion. Read drafts first so a concurrent
    // recovery may appear twice, but cannot disappear between these separate databases.
    const held = await recoveryLibrary.snapshots();
    const pages = await noteLibrary.snapshots();
    downloadText(workspaceBackupText(pages, held), `Note-${new Date().toISOString().slice(0, 10)}.note-workspace.json`);
  });
  const previewWorkspace = async (file: File) => {
    restoreSource.current = undefined;
    const read = readWorkspaceBackup(await file.text());
    if ('error' in read) throw new Error(read.error);
    const rows = await noteLibrary.rows();
    const plan = planWorkspaceRestore(read.backup, new Set([...rows.map(row => row.name), ...documents.current.keys(), ...unreadable.map(note => note.id)]));
    restoreSource.current = read.backup;
    return plan;
  };
  const restoreWorkspace = (plan: WorkspaceRestorePlan) => withArchive(async (): Promise<{ restored: number } | { changed: WorkspaceRestorePlan }> => {
    await flushArchive();
    let rows: LibraryRow[];
    try { rows = await noteLibrary.keepMany(plan.writes); }
    catch (error) {
      if (!(error instanceof LibraryRevisionConflict) || !restoreSource.current) throw error;
      const latest = await noteLibrary.rows();
      return { changed: planWorkspaceRestore(restoreSource.current, new Set([...latest.map(row => row.name), ...documents.current.keys(), ...unreadable.map(note => note.id)])) };
    }
    const revisions = new Map(rows.map(row => [row.name, row.revision ?? 0]));
    const originals: UnreadableNote[] = [];
    for (const [index, page] of plan.pages.entries()) {
      if (page.document) {
        documents.current.set(page.id, page.document);
        metadata.current.set(page.id, page.meta);
        storageRevisions.current.set(page.id, revisions.get(page.id) ?? 0);
      } else originals.push({ id: page.id, title: page.title, reason: page.reason ?? '노트를 읽을 수 없습니다.', source: plan.writes[index].text });
    }
    if (originals.length) setUnreadable(current => [...current, ...originals]);
    const active = plan.pages.find(page => page.document && !pageInTrash(page.id, metadata.current)) ?? plan.pages.find(page => page.document);
    showNotes(); setQuery(''); setProblem('');
    if (active) { setReferenceDestination(undefined); setView(pageInTrash(active.id, metadata.current) ? 'trash' : 'all'); setSelected(active.id); }
    restoreSource.current = undefined;
    return { restored: rows.length };
  });
  const importFile = async (file: File) => {
    try {
      const source = await file.text();
      const read = /\.json$/i.test(file.name) ? readNoteFile(source) : { document: importNoteExchange(source, file.name) };
      if ('error' in read) return setProblem(read.error);
      await add(read.document);
    } catch (error) { setProblem(error instanceof Error ? error.message : '파일을 읽을 수 없습니다.'); }
  };

  // Keep a draft until the replacement page has reached durable storage.
  const recoverDraft = async (draftId: string) => {
    if (recovering) return;
    setRecovering(true);
    let closed = false;
    try {
      if (!await flushNavigation()) return;
      currentSession.current?.value.close();
      closed = true;
      await queue.current;
      if (pending.current.size) throw new Error('마지막 입력을 보관하지 못했습니다. 다시 시도한 뒤 초안을 복구하세요.');
      const held = await recoveryLibrary.read(draftId);
      if (!held) throw new Error('복구 초안을 찾을 수 없습니다.');
      const read = readNoteFile(held.text);
      if ('error' in read) throw new Error(read.error);
      const originalId = typeof held.row.metadata?.originalId === 'string' ? held.row.metadata.originalId : '';
      const taken = new Set([...documents.current.keys(), ...unreadable.map(note => note.id), read.document.attributes.pageId ?? '']);
      const copy = importedPage(read.document, taken, () => crypto.randomUUID());
      copy.document.attributes.title = `${copy.document.attributes.title || '제목 없는 노트'} (복구한 초안)`;
      const meta = pageMeta(held.row.metadata?.page as Record<string, unknown> | undefined);
      meta.trashedAt = null;
      if (meta.parentId && (!metadata.current.has(meta.parentId) || pageInTrash(meta.parentId, metadata.current))) meta.parentId = null;
      const saved = await noteLibrary.keep({ name: copy.id, title: copy.document.attributes.title, metadata: { ...meta } }, noteFileText(copy.document), { expectedRevision: null });
      documents.current.set(copy.id, copy.document); metadata.current.set(copy.id, meta); storageRevisions.current.set(copy.id, saved.revision ?? 0);
      if (originalId && conflictDrafts.current.get(originalId) === draftId) {
        const latest = await noteLibrary.read(originalId);
        const parsed = latest && readNoteFile(latest.text);
        if (latest && parsed && 'document' in parsed) {
          documents.current.set(originalId, { ...parsed.document, attributes: { ...parsed.document.attributes, pageId: originalId } });
          metadata.current.set(originalId, pageMeta(latest.row.metadata, latest.row.savedAt));
          storageRevisions.current.set(originalId, latest.row.revision ?? 0);
          conflictDrafts.current.delete(originalId); pending.current.delete(originalId);
        }
      }
      await recoveryLibrary.drop(draftId);
      setConflicts([...conflictDrafts.current.keys()]); await refreshDrafts();
      showNotes(); setView('all'); setQuery(''); setReferenceDestination(undefined); setSelected(copy.id); setProblem('');
    } catch (error) { setProblem(error instanceof Error ? error.message : '초안을 복구하지 못했습니다. 원래 초안은 보관됩니다.'); }
    finally { setRecovering(false); if (closed) setReloadSession(value => value + 1); }
  };
  const openLatest = async (id: string) => {
    if (recovering) return;
    setRecovering(true);
    let closed = false;
    try {
      if (!await flushNavigation()) return;
      currentSession.current?.value.close();
      closed = true;
      await queue.current;
      if (pending.current.size) throw new Error('마지막 입력을 보관하지 못했습니다. 다시 시도한 뒤 최신본을 여세요.');
      const latest = await noteLibrary.read(id);
      if (!latest) throw new Error('최신 문서가 삭제되었습니다. 초안을 새 페이지로 복구할 수 있습니다.');
      const parsed = readNoteFile(latest.text);
      if ('error' in parsed) throw new Error(parsed.error);
      documents.current.set(id, { ...parsed.document, attributes: { ...parsed.document.attributes, pageId: id } });
      metadata.current.set(id, pageMeta(latest.row.metadata, latest.row.savedAt));
      storageRevisions.current.set(id, latest.row.revision ?? 0); conflictDrafts.current.delete(id); pending.current.delete(id);
      setConflicts([...conflictDrafts.current.keys()]); setSaving(pending.current.size > 0);
      showNotes(); setView(pageInTrash(id, metadata.current) ? 'trash' : 'all'); setQuery(''); setReferenceDestination(undefined); setSelected(id); setProblem('');
    } catch (error) { setProblem(error instanceof Error ? error.message : '최신본을 열지 못했습니다.'); }
    finally { setRecovering(false); if (closed) setReloadSession(value => value + 1); }
  };

  return <div className="nw-shell" inert={recovering || archiving || undefined} aria-busy={recovering || archiving} onKeyDown={event => {
    if (event.defaultPrevented || event.nativeEvent.isComposing || event.altKey || !(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== 'f' || !session || selectedTrashed) return;
    if (!(event.target instanceof Element) || event.target.closest('[data-note-editor], [data-document-navigation], [role="dialog"]')) return;
    event.preventDefault(); openNavigation('find');
  }}>
      <EditorHeader product="Note" className="nw-header" title={title || '제목 없는 노트'}
        fallbackNavigation={<ProductMenu product="Note" blocks={[{ id: 'pages', items: [
          { id: 'template', label: '새 페이지', disabled: !ready },
          { id: 'open', label: '파일 열기', disabled: !ready },
          { id: 'export', label: '내보내기', disabled: !ready || !selected }
        ] }]} onPick={id => { if (id === 'open') picker.current?.click(); else setPanel(id as 'template' | 'export'); }} />}
        menus={<MenuBar label="노트 메뉴" menus={[
          { id: 'file', label: '파일', blocks: [{ id: 'file', items: [
            { id: 'open', label: '파일 열기', disabled: !ready },
            { id: 'export', label: '내보내기', disabled: !ready || !selected }
          ] }] },
          { id: 'edit', label: '편집', blocks: [{ id: 'edit', items: [
            { id: 'find', label: '본문 찾기', disabled: !session || selectedTrashed }
          ] }] },
          { id: 'view', label: '보기', blocks: [{ id: 'view', items: [
            { id: 'outline', label: '목차', disabled: !session || selectedTrashed }
          ] }] }
        ]} onPick={id => {
          if (id === 'open') picker.current?.click();
          else if (id === 'export') setPanel('export');
          else if (id === 'find' || id === 'outline') openNavigation(id);
        }} />} actions={<><StatusIndicator data-save-status busy={!problem && (!ready || saving)} tone={problem ? 'danger' : conflicts.includes(selected) ? 'warning' : selected ? 'success' : 'neutral'}>{!ready ? '보관함 여는 중…' : problem ? '확인이 필요합니다' : saving ? '저장 중…' : conflicts.includes(selected) ? '충돌한 초안 보관됨' : selected ? '저장됨' : '노트를 만들어 시작하세요'}</StatusIndicator>
        <Button disabled={!ready || !selected} onClick={() => setPanel('export')}>내보내기</Button>
        <Button tone="quiet" disabled={!ready || !selected || selectedTrashed} onClick={() => setPanel('page')}>페이지 설정</Button>
        <input ref={picker} hidden disabled={!ready} type="file" accept=".json,.md,.markdown,.html,.htm,.csv" aria-label="노트 파일" onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; if (file) void importFile(file); }} />
        </>} />
    <AdaptiveWorkspace className="nw-workspace" panelSides={['navigation']} locationKey={selected}>
    <WorkspaceSidePanel side="navigation" width={240}>
    <aside className="nw-sidebar" aria-label="노트 보관함">
      <PanelHeader title="페이지" actions={<IconButton label="새 노트" disabled={!ready} onClick={() => add(pageTemplate(template))}><Icon name="add" size={16} /></IconButton>} />
      <TextField className="nw-search" type="search" ariaLabel="노트 검색" placeholder="제목과 본문 검색" value={query} onChange={setQuery} />
      <div className="nw-views" aria-label="보관함 보기">
        <button type="button" aria-pressed={view === 'all'} onClick={() => switchView('all')}>모든 페이지</button>
        <button type="button" aria-pressed={view === 'favorites'} onClick={() => switchView('favorites')}>즐겨찾기</button>
        <button type="button" aria-pressed={view === 'trash'} onClick={() => switchView('trash')}>휴지통</button>
      </div>
      <Button className="nw-template-action" tone="quiet" disabled={!ready} onClick={() => setPanel('template')}><Icon name="type-page" size={16} />템플릿으로 만들기</Button>
      <nav aria-label="노트 목록" className="nw-list">
        {visibleRows.map(({ page: note, depth }) => <NavigationItem key={note.id} selected={selected === note.id} leading={<Icon name="type-page" size={16} />} trailing={note.meta.favorite ? <Icon name="favorite" size={12} /> : undefined} data-page-id={note.id} aria-label={note.document.attributes.title || '제목 없는 노트'} data-page-depth={depth} data-page-favorite={note.meta.favorite || undefined} style={{ paddingLeft: 12 + Math.min(depth, 12) * 14 }} aria-current={selected === note.id ? 'page' : undefined} onClick={() => void navigatePage(note.id, true, undefined, true)}>{note.document.attributes.title || '제목 없는 노트'}</NavigationItem>)}
        {!visibleRows.length && <EmptyState title={query ? '검색 결과가 없습니다' : view === 'trash' ? '휴지통이 비어 있습니다' : view === 'favorites' ? '즐겨찾는 페이지가 없습니다' : '첫 노트를 만들어보세요'}
          action={query ? <Button onClick={() => setQuery('')}>검색 지우기</Button> : view === 'all' ? <Button disabled={!ready} onClick={() => add(pageTemplate(template))}>새 노트</Button> : undefined}>
          {query ? '다른 검색어를 입력하거나 검색을 지우세요.' : view === 'favorites' ? '페이지 설정에서 즐겨찾기에 추가하세요.' : view === 'trash' ? '삭제한 페이지는 여기에 보관됩니다.' : '팀의 아이디어와 회의 내용을 한곳에 기록하세요.'}
        </EmptyState>}
      </nav>
      {unreadable.length > 0 && <section className="nw-unreadable" aria-label="열 수 없는 노트">
        <h2>열 수 없는 노트</h2>
        {unreadable.map(note => <div key={note.id} data-unreadable-note>
          <strong>{note.title}</strong><p>{note.reason}</p>
          <Button disabled={note.source === undefined} ariaLabel={`${note.title} 원본 내보내기`}
            onClick={() => downloadText(note.source!, noteFileName(`${note.title} 원본`))}>원본 내보내기</Button>
        </div>)}
      </section>}
      <div className="nw-library-tools"><WorkspaceBackupControls disabled={!ready || recovering} onBackup={backupWorkspace} onPreview={previewWorkspace} onRestore={restoreWorkspace} /></div>
      <p className="nw-local">이 브라우저에 자동 저장됩니다.<br />보관함 백업으로 다른 기기에 옮길 수 있습니다.</p>
    </aside>
    </WorkspaceSidePanel>
    <main className="nw-main" data-workspace-main tabIndex={-1}>

      {unreadable.length > 0 && <div className="nw-problem" role="alert">노트 {unreadable.length}개를 열 수 없습니다. 원본은 보관함에 그대로 있습니다. 읽을 수 있는 원본 파일은 왼쪽에서 내보내세요.</div>}
      {problem && <StatusNotice className="nw-operation-notice" tone="danger" title="작업을 완료하지 못했습니다" actions={<Button onClick={() => { if (!ready) setAttempt(n => n + 1); else { setProblem(''); for (const id of pending.current) persist(id); } }}>다시 시도</Button>}>{problem}</StatusNotice>}
      {conflicts.includes(selected) && <div className="nw-problem" role="alert" data-note-conflict>
        <span>다른 창에서 이 페이지가 변경되었습니다. 최신본을 덮어쓰지 않고 내 편집을 복구 초안으로 보관합니다.</span>
        <Button disabled={recovering || saving} onClick={() => void openLatest(selected)}>최신본 열기</Button>
      </div>}
      {drafts.length > 0 && <section className="nw-problem" aria-label="복구할 초안" data-note-recovery>
        <strong>복구할 초안</strong>
        {drafts.map(draft => <div key={draft.name} data-recovery-draft={draft.name}>
          <span>{draft.title || '제목 없는 노트'}</span>
          <Button disabled={recovering || saving} onClick={() => void recoverDraft(draft.name)}>내 초안을 새 페이지로 저장</Button>
          <Button disabled={recovering} onClick={async () => { const held = await recoveryLibrary.read(draft.name); if (held) downloadText(held.text, noteFileName(`${draft.title || '노트'} 초안`)); }}>초안 파일 내보내기</Button>
        </div>)}
      </section>}
      {ready && !selected && <p className="nw-document">열 수 있는 노트가 없습니다. 새 노트를 만들거나 다른 노트 파일을 열어주세요.</p>}
      {ready && selected && <section className="nw-document" aria-label="노트 편집">
        {selectedTrashed ? <div className="nw-trash-banner" data-page-trashed><span>휴지통에 있는 페이지입니다. 복원하면 다시 편집할 수 있습니다.</span><Button onClick={restore}>페이지 복원</Button></div> : null}
        <TextField className="nw-title" readOnly={selectedTrashed} ariaLabel="노트 제목" placeholder="제목 없는 노트" value={title} onChange={rename} />
        {!selectedTrashed && backlinks.length > 0 && <details key={`backlinks-${selected}`} className="nw-backlinks" aria-label="이 페이지를 참조한 페이지">
          <summary>백링크 <span>{backlinks.length}</span></summary>
          <div>{backlinks.map(({ page, references }) => <button key={page.id} type="button" className="nw-backlink" aria-label={`${page.document.attributes.title || '제목 없는 노트'} 참조 페이지 열기`} onClick={() => void navigatePage(page.id, true, references[0]?.item)}>
            <span className="nw-backlink-title"><Icon name="type-page" size={15} />{page.document.attributes.title || '제목 없는 노트'}{references.length > 1 && <small>{references.length}곳에서 참조</small>}</span>
            <span className="nw-backlink-excerpt">{references[0]?.item ? `${references[0].item.title} · ` : ''}{references[0]?.excerpt || '페이지 참조'}</span>
          </button>)}</div>
        </details>}
        {!selectedTrashed && <p className="nw-hint">/ 로 블록을 추가하고, [[ 로 다른 페이지를 연결하세요.</p>}
        {!selectedTrashed && session?.id === selected && <NoteEditor key={session.generation} editor={session.value.editor} rootId={session.value.rootId} navigationRequest={navigationRequest?.pageId === selected ? navigationRequest : undefined} pageReferences={{ pages: referencePages, currentPageId: selected, onNavigate: id => navigatePage(id), revealItem: referenceDestination, registerBeforeNavigate }} />}
      </section>}
    </main>
    </AdaptiveWorkspace>
    <Dialog open={panel === 'page'} onOpenChange={open => !open && setPanel(null)} title="페이지 설정" description="페이지의 위치와 보관 상태를 관리합니다." footer={<Button onClick={() => setPanel(null)}>완료</Button>}>
<div className="nw-page-actions">
          <Button tone="quiet" ariaLabel={metadata.current.get(selected)?.favorite ? '즐겨찾기 해제' : '즐겨찾기 추가'} onClick={() => updateMeta(selected, { favorite: !metadata.current.get(selected)?.favorite })}>{metadata.current.get(selected)?.favorite ? '즐겨찾는 페이지' : '즐겨찾기 추가'}</Button>
          <Button tone="quiet" onClick={() => { setPanel(null); add(pageTemplate(template), selected); }}>하위 페이지 만들기</Button>
          <label className="nw-move-label">상위 페이지<Choice ariaLabel="상위 페이지" value={metadata.current.get(selected)?.parentId ?? ''} onChange={value => move(value || null)}>
            <option value="">최상위</option>
            {notes.filter(note => canMovePage(selected, note.id, metadata.current) && !pageInTrash(note.id, metadata.current)).map(note => <option key={note.id} value={note.id}>{note.document.attributes.title || '제목 없는 노트'}</option>)}
          </Choice></label>
          <Button tone="quiet" onClick={() => { setPanel(null); trash(); }}>휴지통으로 이동</Button>
        </div>
    </Dialog>
    <Dialog open={panel === 'export'} onOpenChange={open => !open && setPanel(null)} title="노트 내보내기" description="내려받을 파일 형식을 선택하세요." footer={<Button tone="accent" onClick={async () => { await download(); setPanel(null); }}>파일 내려받기</Button>}>
      <label className="nw-dialog-field">파일 형식<Choice ariaLabel="내보내기 형식" value={exchangeFormat} onChange={value => setExchangeFormat(value as 'json' | NoteExchangeFormat)}>
        <option value="json">Note JSON · 전체 보존</option><option value="markdown">Markdown · 기본 문서</option><option value="html">HTML · 서식 문서</option><option value="csv">CSV · 단일 표</option>
      </Choice></label>
    </Dialog>
    <Dialog open={panel === 'template'} onOpenChange={open => !open && setPanel(null)} title="템플릿으로 만들기" description="새 페이지에 사용할 문서 틀을 선택하세요." footer={<Button tone="accent" onClick={() => { setPanel(null); add(pageTemplate(template)); }}>페이지 만들기</Button>}>
      <label className="nw-dialog-field">템플릿<Choice ariaLabel="새 페이지 템플릿" value={template} onChange={value => setTemplate(value as PageTemplate)}>
        <option value="blank">빈 문서</option><option value="meeting">회의록</option><option value="project">프로젝트 계획</option>
      </Choice></label>
    </Dialog>
  </div>;
}
