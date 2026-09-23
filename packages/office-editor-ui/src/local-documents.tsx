import { useCallback, useEffect, useRef, useState, type MouseEvent } from 'react';
import { DocumentSession, downloadDocumentArchive, productLibraryArchive, type ProductDocumentHost, type DocumentSessionOptions, type DocumentSessionStatus, type LibraryRow } from '@barocss/shared';
import { Button, Dialog, StatusNotice } from '@barocss/office-ui';
import { DocumentSaveStatus } from './document-save-status';

export function useLocalDocuments(options: DocumentSessionOptions | null) {
  const session = useRef<DocumentSession | null>(null);
  const [status, setStatus] = useState<DocumentSessionStatus>('불러오는 중');
  useEffect(() => {
    if (!options) return;
    const controller = new DocumentSession(options, setStatus);
    session.current = controller;
    void controller.start();
    return () => { controller.stop(); if (session.current === controller) session.current = null; };
  }, [options]);
  const beforeReplace = useCallback(async () => !!await session.current?.beforeReplace(), []);
  return { session, status, beforeReplace };
}

/** Local storage and recovery controls shared by product shells. */
export function LocalDocuments({ persistence, title, prefix, onOpened }: {
  persistence: ReturnType<typeof useLocalDocuments>; title: string; prefix: string; onOpened: () => void;
}) {
  const [open, setOpen] = useState(false), [busy, setBusy] = useState(false);
  const [rows, setRows] = useState<LibraryRow[]>([]), [drafts, setDrafts] = useState<LibraryRow[]>([]);
  const [problem, setProblem] = useState('');
  const lock = useRef(false);
  const opener = useRef<HTMLButtonElement | null>(null);
  const recent = useRef<HTMLButtonElement | null>(null);
  const restoreFocus = () => {
    const target = opener.current;
    (target?.isConnected && !target.disabled ? target : recent.current)?.focus();
  };
  const perform = async (action: () => Promise<void>) => {
    if (lock.current) return;
    lock.current = true; setBusy(true); setProblem('');
    try { await action(); }
    catch { setProblem('작업을 완료하지 못했습니다. 현재 자료는 유지됩니다. 다시 시도하세요.'); }
    finally { lock.current = false; setBusy(false); }
  };
  const show = async () => {
    const session = persistence.session.current;
    if (!session) return;
    await session.flush();
    const [saved, recovered] = await Promise.all([session.options.documents.rows(), session.options.drafts.rows()]);
    setRows(saved); setDrafts(recovered); setOpen(true);
  };
  const openLibrary = (event: MouseEvent<HTMLButtonElement>) => {
    if (lock.current) return;
    // Disabling the trigger can blur it before the asynchronous library read finishes.
    opener.current = event.currentTarget;
    void perform(show);
  };
  const failure = persistence.status === '저장 실패' || persistence.status === '복원 실패';
  return <>
    <DocumentSaveStatus status={persistence.status} className="office-save-status" {...{ [`data-${prefix}-save-status`]: true }} />
    {failure && <Button disabled={busy} onClick={() => void perform(async () => {
      const session = persistence.session.current;
      if (!session) return;
      if (persistence.status === '복원 실패') {
        const id = new URLSearchParams(location.hash.slice(1)).get(session.options.key);
        if (id) await session.open(id);
      } else await session.flush();
    })}>{persistence.status === '복원 실패' ? '복원 다시 시도' : '저장 다시 시도'}</Button>}
    {persistence.status === '충돌한 초안 보관됨' && <Button disabled={busy} onClick={openLibrary}>복구 초안 보기</Button>}
    <Button ref={recent} onClick={openLibrary} disabled={busy}>{busy && !open ? '처리 중…' : '최근 자료'}</Button>
    {problem && !open && <span role="alert">{problem}</span>}
    <Dialog open={open} onClosed={restoreFocus} onOpenChange={value => { if (!busy) setOpen(value); }} title={title}
      description="이 브라우저에 자동 저장한 자료입니다. 다른 탭과 충돌한 작업은 복구 초안으로 보관합니다.">
      {failure && <StatusNotice tone="danger" title={persistence.status}>저장 또는 복원을 완료하지 못했습니다. 이 창을 유지하고 다시 시도하거나 파일로 저장하세요.</StatusNotice>}
      {problem && <StatusNotice tone="danger" title="작업을 완료하지 못했습니다">{problem}</StatusNotice>}
      {drafts.length > 0 && <StatusNotice tone="warning" title="복구할 초안이 있습니다">다른 창의 최신본은 유지됩니다. 초안을 새 자료로 복구한 뒤 내용을 비교하세요.</StatusNotice>}
      <Button disabled={busy} onClick={() => void perform(async () => {
        const session = persistence.session.current;
        if (!session || !await session.beforeReplace()) throw new Error('Pending input');
        const product = session.options.key as ProductDocumentHost['product'];
        downloadDocumentArchive(await productLibraryArchive(product, session.options.documents, session.options.drafts), `wonffice-${product}-library.json`);
      })}>보관함 전체 백업</Button>
      <div style={{ maxHeight: '55vh', overflowY: 'auto' }}>
        {drafts.map(row => <div key={row.name} className="office-recovery-row" {...{ [`data-${prefix}-draft`]: row.name }}>
          <span>{row.title} · 복구 초안</span>
          <Button disabled={busy} onClick={() => void perform(async () => {
            if (await persistence.session.current?.recover(row)) { onOpened(); setOpen(false); }
            else throw new Error('Pending edit');
          })}>새 자료로 복구</Button>
        </div>)}
        {!rows.length && <p>저장한 자료가 없습니다.</p>}
        {rows.map(row => <div key={row.name} className="flex items-center justify-between gap-3 py-2" {...{ [`data-${prefix}-document`]: row.name }}>
          <span>{row.title || '제목 없는 자료'}</span>
          <Button disabled={busy} ariaLabel={`${row.title || '제목 없는 자료'} 열기`} onClick={() => void perform(async () => {
            if (await persistence.session.current?.open(row.name)) { onOpened(); setOpen(false); }
            else throw new Error('Pending edit');
          })}>열기</Button>
        </div>)}
      </div>
    </Dialog>
  </>;
}
