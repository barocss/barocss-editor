import { DocumentSaveStatus } from '@barocss/office-editor-ui';
import { DocxImport } from './docx-import';
import { DocxExport } from './docx-export';
import { WordAutosave, wordDrafts, wordStore } from './autosave';
import { ProductDocumentTrashedError, downloadDocumentArchive, isProductDocumentTrashed, productLibraryArchive, type DocumentSessionStatus } from '@barocss/shared';
import type { LibraryRow } from '@barocss/shared';
import { forwardRef, useImperativeHandle, useEffect, useRef, useState, type MouseEvent } from 'react';
import type { Editor } from '@barocss/editor-core';
import { Button, Dialog, EmptyState, Icon, NavigationItem, StatusIndicator, StatusNotice, TextField } from '@barocss/office-ui';
import { wordLibraryRows, keepWordDocument, wordFileText, type WordLibraryRow } from '@barocss/office-word';

/** The host owns document navigation; shared UI and Word's file/library adapters do the work. */
export interface DocumentLibraryHandle { open: (kind: 'library' | 'actions') => void }
export const DocumentLibrary = forwardRef<DocumentLibraryHandle, { editor: Editor }>(function DocumentLibrary({ editor }, ref) {
  const [actions, setActions] = useState(false);
  const [open, setOpen] = useState(false), [busy, setBusy] = useState(false);
  const [query, setQuery] = useState(''), [loaded, setLoaded] = useState(false);
  const pending = useRef(false);
  const libraryOpener = useRef<HTMLElement | null>(null);
  const libraryButton = useRef<HTMLButtonElement | null>(null);
  const restoreLibraryFocus = () => {
    const target = libraryOpener.current;
    (target?.isConnected && target !== document.body && !target.matches(':disabled') ? target : libraryButton.current)?.focus();
  };
  const [rows, setRows] = useState<WordLibraryRow[]>([]);
  const [problem, setProblem] = useState(''), [status, setStatus] = useState('');
  const [confirmRecovery, setConfirmRecovery] = useState(false);
  const recoveryButtonRef = useRef<HTMLButtonElement>(null);
  const autosave = useRef<WordAutosave | null>(null);
  const [drafts, setDrafts] = useState<LibraryRow[]>([]);
  const [autoStatus, setAutoStatus] = useState<DocumentSessionStatus>('불러오는 중');
  const recoveryRequired = autoStatus === '복구 필요';
  useEffect(() => { if (recoveryRequired && open) recoveryButtonRef.current?.focus(); }, [recoveryRequired, open]);
  useEffect(() => {
    const controller = new WordAutosave(editor, (status, error) => { setAutoStatus(status); setProblem(error ?? ''); });
    autosave.current = controller;
    void controller.start();
    return () => { controller.stop(); autosave.current = null; };
  }, [editor]);
  const save = async () => {
    if (!await autosave.current?.flush()) throw new Error('Unsaved work');
    // Save independent snapshots: opening/importing a different document must never overwrite
    // the previously opened entry through a stale active-library identifier.
    const row = await keepWordDocument(editor.dataStore, wordFileText(editor.exportDocument()));
    setStatus(`“${row.title || '제목 없는 문서'}” 보관함에 저장됨`);
    return row;
  };
  const perform = async (action: () => Promise<void>, onError?: (error: unknown) => string) => {
    if (pending.current) return;
    pending.current = true; setBusy(true); setProblem('');
    try { await action(); } catch (error) { setProblem(autosave.current?.recoveryRequired
      ? '저장본을 다시 열지 못했습니다. 자동 저장은 중지돼 있습니다. 화면 내용을 별도로 보관하세요.'
      : onError?.(error) ?? '문서 보관함 작업을 완료하지 못했습니다. 현재 문서는 유지됩니다. 다시 시도하세요.'); }
    finally { pending.current = false; setBusy(false); }
  };
  const availableRows = async () => {
    const saved = await wordLibraryRows();
    const available = await Promise.all(saved.map(async row => !await isProductDocumentTrashed('word', row.name)));
    return saved.filter((_, index) => available[index]);
  };
  const openLibrary = (event?: MouseEvent<HTMLButtonElement>) => {
    if (pending.current) return;
    if (!open) {
      const target = event?.currentTarget ?? document.activeElement;
      libraryOpener.current = target instanceof HTMLElement && target !== document.body && target !== document.documentElement ? target : null;
    }
    void perform(async () => {
      setOpen(true); setLoaded(false); setQuery('');
      if (!await autosave.current?.flush()) throw new Error('Unsaved work');
      setRows(await availableRows()); setDrafts(await wordDrafts.rows()); setLoaded(true); setOpen(true);
    });
  };
  useImperativeHandle(ref, () => ({ open: kind => { if (kind === 'library') openLibrary(); else setActions(true); } }));
  const titleOf = (row: { title?: string }) => row.title || '제목 없는 문서';
  const matching = (row: { title?: string }) => titleOf(row).toLocaleLowerCase().includes(query.trim().toLocaleLowerCase());
  const visibleRows = rows.filter(matching), visibleDrafts = drafts.filter(matching);
  const reopenSaved = () => void perform(async () => {
    const session = autosave.current;
    const id = new URLSearchParams(location.hash.slice(1)).get('word');
    if (!session || !id || !await session.open(id)) throw new Error('Saved copy is unavailable');
    setConfirmRecovery(false);
    setOpen(false);
  });
  const recoveryButton = <Button ref={recoveryButtonRef} disabled={busy} onClick={() => setConfirmRecovery(true)}>저장본 다시 열기</Button>;
  const recoveryConfirmation = <StatusNotice tone="danger" title="현재 화면의 저장되지 않은 내용이 사라집니다"
    actions={<><Button disabled={busy} onClick={() => setConfirmRecovery(false)}>취소</Button>
      <Button disabled={busy} onClick={reopenSaved}>화면 버리고 저장본 열기</Button></>}>
    자동 저장이 중지돼 있습니다. 필요한 내용을 복사하거나 DOCX로 내보낸 뒤 저장본을 다시 여세요.
  </StatusNotice>;
  return <div className="w-document-library">
    <Button tone="quiet" onClick={() => setActions(true)}>문서 작업</Button>
    <Button ref={libraryButton} disabled={busy} onClick={openLibrary}>문서 보관함</Button>
    <Dialog open={actions} onOpenChange={value => { if (!pending.current) setActions(value); }} title="문서 작업" description="문서를 보관하거나 DOCX 파일을 가져오고 내보냅니다.">
      <div className="w-file-action-list">
        <Button disabled={busy || recoveryRequired} onClick={() => void perform(async () => { await save(); })}>보관함에 사본 저장</Button>
        <DocxExport editor={editor} />
        <DocxImport editor={editor} onOpened={() => setActions(false)} beforeOpen={async () => { if (!await autosave.current?.flush()) throw new Error('저장 실패'); }} />
      </div>
      {status && <StatusIndicator tone="success">{status}</StatusIndicator>}
      {problem && <StatusNotice tone="danger" title="작업을 완료하지 못했습니다">{problem}</StatusNotice>}
    </Dialog>
    <DocumentSaveStatus status={autoStatus} title={problem || undefined} data-word-save-status />
    {recoveryRequired && !open && <>
      <StatusNotice tone="danger" title="복구 필요">문서 화면이 저장본과 다를 수 있어 자동 저장을 멈췄습니다. 저장본을 다시 열기 전에 필요한 내용을 보관하세요.</StatusNotice>
      {recoveryButton}
      {confirmRecovery && recoveryConfirmation}
    </>}
    {(autoStatus === '저장 실패' || autoStatus === '복원 실패') && <Button disabled={busy} onClick={() => void perform(async () => {
      const session = autosave.current;
      if (!session) return;
      if (autoStatus === '복원 실패') {
        const id = new URLSearchParams(location.hash.slice(1)).get('word');
        if (id) await session.open(id);
      } else await session.flush();
    })}>{autoStatus === '복원 실패' ? '복원 다시 시도' : '저장 다시 시도'}</Button>}
    {autoStatus === '충돌한 초안 보관됨' && <Button disabled={busy} onClick={event => {
      if (pending.current) return;
      libraryOpener.current = event.currentTarget;
      void perform(async () => {
        setRows(await availableRows()); setDrafts(await wordDrafts.rows()); setLoaded(true); setOpen(true);
      });
    }}>복구 초안 보기</Button>}
    {problem && autoStatus !== '저장 실패' && autoStatus !== '복원 실패' && !recoveryRequired && <span role="alert">{problem}</span>}
    <Dialog open={open} onClosed={restoreLibraryFocus} onOpenChange={value => { if (!pending.current) { setOpen(value); if (!value) setProblem(''); } }} title="문서 보관함" description="이 브라우저에 저장한 문서와 복구 초안입니다."
      footer={<Button disabled={busy || !loaded || recoveryRequired} onClick={() => void perform(async () => {
        if (!await autosave.current?.beforeReplace()) throw new Error('Pending input');
        downloadDocumentArchive(await productLibraryArchive('word', wordStore, wordDrafts), 'wonffice-word-library.json');
      })}>보관함 전체 백업</Button>}>
      <div className="w-library-content" aria-busy={busy || undefined}>
        {recoveryRequired && <StatusNotice tone="danger" title="복구 필요">현재 화면의 저장 상태를 확인할 수 없습니다. 저장본을 다시 열기 전에는 다른 문서를 열 수 없습니다.</StatusNotice>}
        {recoveryRequired && recoveryButton}
        {recoveryRequired && confirmRecovery && recoveryConfirmation}
        <TextField type="search" ariaLabel="보관함에서 찾기" placeholder="문서 제목으로 찾기" value={query} onChange={setQuery} disabled={busy} />
        {busy && <StatusIndicator busy>{loaded ? '문서를 처리하고 있습니다.' : '보관함을 불러오고 있습니다.'}</StatusIndicator>}
        {problem && <StatusNotice tone="danger" title="작업을 완료하지 못했습니다"
          actions={!loaded && <Button disabled={busy} onClick={openLibrary}>다시 불러오기</Button>}>{problem}</StatusNotice>}
        {loaded && <>
          {drafts.length > 0 && <StatusNotice tone="warning" title="복구할 초안이 있습니다">초안을 새 문서로 복구한 뒤 최신 문서와 비교하세요.</StatusNotice>}
          <div className="w-library-list" aria-label="보관한 문서">
            {visibleDrafts.map(row => <NavigationItem className="w-library-row" key={row.name} disabled={busy || recoveryRequired}
              leading={<Icon name="type-page" size={16} />} trailing="복구"
              aria-label={`${titleOf(row)} 초안 복구`} onClick={() => void perform(async () => {
                if (!await autosave.current?.recover(row)) throw new Error('Pending input'); setOpen(false);
              })}><strong>{titleOf(row)}</strong><small>복구 초안 · 새 문서로 복구</small></NavigationItem>)}
            {visibleRows.map(row => <NavigationItem className="w-library-row" key={row.name} disabled={busy || recoveryRequired}
              leading={<Icon name="type-page" size={16} />} trailing="열기"
              aria-label={`${titleOf(row)} 열기`} onClick={() => void perform(async () => {
                if (!await autosave.current?.open(row.name, true)) throw new Error('Pending input');
                setStatus(`“${titleOf(row)}” 열림`); setOpen(false);
              }, error => {
                if (error instanceof ProductDocumentTrashedError) {
                  setRows(current => current.filter(item => item.name !== row.name));
                  return `“${titleOf(row)}”는 휴지통에 있습니다. 자료함에서 복원한 뒤 다시 여세요. 현재 문서는 유지됩니다.`;
                }
                return `“${titleOf(row)}”를 열지 못했습니다. 현재 문서를 확인하세요. 필요하면 같은 문서에서 다시 시도하세요.`;
              })}><strong>{titleOf(row)}</strong><small>{new Date(row.savedAt).toLocaleString()} · {row.surfaces}개 구역</small></NavigationItem>)}
          </div>
          {!visibleRows.length && !visibleDrafts.length && (rows.length || drafts.length
            ? <EmptyState title="검색 결과가 없습니다" action={<Button tone="quiet" onClick={() => setQuery('')}>검색 지우기</Button>}>다른 문서 제목으로 찾아보세요.</EmptyState>
            : <EmptyState title="보관한 문서가 없습니다">문서 작업에서 ‘보관함에 사본 저장’을 선택하세요.</EmptyState>)}
        </>}
      </div>
    </Dialog>
  </div>;
});
