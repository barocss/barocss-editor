import { useCallback, useEffect, useRef, useState, type MouseEvent } from 'react';
import { DocumentSession, ProductDocumentTrashedError, downloadDocumentArchive, isProductDocumentTrashed, productLibraryArchive, type ProductDocumentHost, type DocumentSessionOptions, type DocumentSessionStatus, type LibraryRow } from '@barocss/shared';
import { Button, Dialog, StatusNotice, Tip } from '@barocss/office-ui';
import { Icon } from '@barocss/office-icons';
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
export function LocalDocuments({ persistence, title, prefix, onOpened, iconOnly = false }: {
  persistence: ReturnType<typeof useLocalDocuments>; title: string; prefix: string; onOpened: () => void; iconOnly?: boolean;
}) {
  const [open, setOpen] = useState(false), [busy, setBusy] = useState(false);
  const [rows, setRows] = useState<LibraryRow[]>([]), [drafts, setDrafts] = useState<LibraryRow[]>([]);
  const [problem, setProblem] = useState('');
  const [confirmRecovery, setConfirmRecovery] = useState(false);
  const lock = useRef(false);
  const opener = useRef<HTMLButtonElement | null>(null);
  const recent = useRef<HTMLButtonElement | null>(null);
  const restoreFocus = () => {
    const target = opener.current;
    (target?.isConnected && !target.disabled ? target : recent.current)?.focus();
  };
  const recoveryButtonRef = useRef<HTMLButtonElement>(null);
  const recoveryRequired = persistence.status === '복구 필요';
  useEffect(() => { if (recoveryRequired && open) recoveryButtonRef.current?.focus(); }, [recoveryRequired, open]);
  const perform = async (action: () => Promise<void>, onError?: (error: unknown) => string) => {
    if (lock.current) return;
    lock.current = true; setBusy(true); setProblem('');
    try { await action(); }
    catch (error) { setProblem(persistence.session.current?.recoveryRequired
      ? '저장본을 다시 열지 못했습니다. 자동 저장은 중지돼 있습니다. 화면 내용을 별도로 보관하세요.'
      : onError?.(error) ?? '작업을 완료하지 못했습니다. 현재 자료는 유지됩니다. 다시 시도하세요.'); }
    finally { lock.current = false; setBusy(false); }
  };
  const show = async () => {
    const session = persistence.session.current;
    if (!session) return;
    const savedCurrent = await session.flush();
    if (!savedCurrent && !session.recoveryRequired)
      setProblem('현재 자료의 저장을 확인하지 못했습니다. 다른 자료를 열기 전에 저장을 다시 시도하세요.');
    const [saved, recovered] = await Promise.all([session.options.documents.rows(), session.options.drafts.rows()]);
    const available = await Promise.all(saved.map(async row => !await isProductDocumentTrashed(session.options.key, row.name)));
    setRows(saved.filter((_, index) => available[index])); setDrafts(recovered); setOpen(true);
  };
  const openLibrary = (event: MouseEvent<HTMLButtonElement>) => {
    if (lock.current) return;
    // Disabling the trigger can blur it before the asynchronous library read finishes.
    opener.current = event.currentTarget;
    void perform(show);
  };
  const failure = persistence.status === '저장 실패' || persistence.status === '복원 실패' || recoveryRequired;
  const reopenSaved = () => void perform(async () => {
    const session = persistence.session.current;
    const id = session && new URLSearchParams(location.hash.slice(1)).get(session.options.key);
    if (!session || !id || !await session.open(id)) throw new Error('Saved copy is unavailable');
    setConfirmRecovery(false);
    if (open) { onOpened(); setOpen(false); }
  });
  const recoveryButton = <Button ref={recoveryButtonRef} disabled={busy} onClick={() => setConfirmRecovery(true)}>저장본 다시 열기</Button>;
  const recoveryConfirmation = <StatusNotice tone="danger" title="현재 화면의 저장되지 않은 내용이 사라집니다"
    actions={<><Button disabled={busy} onClick={() => setConfirmRecovery(false)}>취소</Button>
      <Button disabled={busy} onClick={reopenSaved}>화면 버리고 저장본 열기</Button></>}>
    자동 저장이 중지돼 있습니다. 화면에서 필요한 내용을 복사하세요. 보관함 백업에는 이 화면이 포함되지 않습니다.
  </StatusNotice>;
  return <>
    <Tip label={iconOnly ? persistence.status : undefined}><DocumentSaveStatus status={persistence.status} tabIndex={iconOnly ? 0 : undefined} className="office-save-status" data-icon-only={iconOnly || undefined} {...{ [`data-${prefix}-save-status`]: true }} /></Tip>
    {recoveryRequired && !open && recoveryButton}
    {recoveryRequired && !open && confirmRecovery && recoveryConfirmation}
    {failure && !recoveryRequired && <Button disabled={busy} onClick={() => void perform(async () => {
        const session = persistence.session.current;
        if (!session) return;
        if (persistence.status === '복원 실패') {
          const id = new URLSearchParams(location.hash.slice(1)).get(session.options.key);
          if (!id || !await session.open(id)) throw new Error('Saved copy is unavailable');
        } else await session.flush();
      })}>{persistence.status === '복원 실패' ? '복원 다시 시도' : '저장 다시 시도'}</Button>}
    {persistence.status === '충돌한 초안 보관됨' && <Button disabled={busy} onClick={openLibrary}>복구 초안 보기</Button>}
    <Tip label={iconOnly ? (busy && !open ? '최근 자료 불러오는 중' : '최근 자료') : undefined}><Button ref={recent} square={iconOnly} tone={iconOnly ? 'quiet' : 'plain'} ariaLabel={iconOnly ? '최근 자료' : undefined} aria-busy={busy || undefined} onClick={openLibrary} disabled={busy}>{iconOnly ? <Icon name="recent-documents" /> : busy && !open ? '처리 중…' : '최근 자료'}</Button></Tip>
    {problem && !open && <span role="alert">{problem}</span>}
    <Dialog open={open} onClosed={restoreFocus} onOpenChange={value => { if (!busy) { setOpen(value); if (!value) setProblem(''); } }} title={title}
      description="이 브라우저에 자동 저장한 자료입니다. 다른 탭과 충돌한 작업은 복구 초안으로 보관합니다.">
      {failure && <StatusNotice tone="danger" title={persistence.status}>{recoveryRequired
        ? '화면 내용이 저장본과 다를 수 있어 자동 저장을 멈췄습니다. 저장본을 다시 열기 전에는 다른 자료와 초안을 열 수 없습니다.'
        : '저장 또는 복원을 완료하지 못했습니다. 이 창을 유지하고 다시 시도하거나 파일로 저장하세요.'}</StatusNotice>}
      {recoveryRequired && recoveryButton}
      {recoveryRequired && confirmRecovery && recoveryConfirmation}
      {problem && <StatusNotice tone="danger" title="작업을 완료하지 못했습니다">{problem}</StatusNotice>}
      {drafts.length > 0 && <StatusNotice tone="warning" title="복구할 초안이 있습니다">{recoveryRequired
        ? '먼저 현재 저장본을 다시 열어 상태를 확인하세요. 그다음 초안을 새 자료로 복구하고 내용을 비교하세요.'
        : '다른 창의 최신본은 유지됩니다. 초안을 새 자료로 복구한 뒤 내용을 비교하세요.'}</StatusNotice>}
      <Button disabled={busy || recoveryRequired} onClick={() => void perform(async () => {
        const session = persistence.session.current;
        if (!session || !await session.beforeReplace()) throw new Error('Pending input');
        const product = session.options.key as ProductDocumentHost['product'];
        downloadDocumentArchive(await productLibraryArchive(product, session.options.documents, session.options.drafts), `wonffice-${product}-library.json`);
      })}>보관함 전체 백업</Button>
      <div style={{ maxHeight: '55vh', overflowY: 'auto' }}>
        {drafts.map(row => <div key={row.name} className="office-recovery-row" {...{ [`data-${prefix}-draft`]: row.name }}>
          <span>{row.title} · 복구 초안</span>
          <Button disabled={busy || recoveryRequired} onClick={() => void perform(async () => {
            if (await persistence.session.current?.recover(row)) { onOpened(); setOpen(false); }
            else throw new Error('Pending edit');
          })}>새 자료로 복구</Button>
        </div>)}
        {!rows.length && <p>저장한 자료가 없습니다.</p>}
        {rows.map(row => <div key={row.name} className="flex items-center justify-between gap-3 py-2" {...{ [`data-${prefix}-document`]: row.name }}>
          <span>{row.title || '제목 없는 자료'}</span>
          <Button disabled={busy || recoveryRequired} ariaLabel={`${row.title || '제목 없는 자료'} 열기`} onClick={() => void perform(async () => {
            if (await persistence.session.current?.open(row.name, true)) { onOpened(); setOpen(false); }
            else throw new Error('Pending edit');
          }, error => {
            if (error instanceof ProductDocumentTrashedError) {
              setRows(current => current.filter(item => item.name !== row.name));
              return `“${row.title || '제목 없는 자료'}”는 휴지통에 있습니다. 자료함에서 복원한 뒤 다시 여세요. 현재 자료는 유지됩니다.`;
            }
            return `“${row.title || '제목 없는 자료'}”를 열지 못했습니다. 현재 자료를 확인하세요. 필요하면 같은 자료에서 다시 시도하세요.`;
          })}>열기</Button>
        </div>)}
      </div>
    </Dialog>
  </>;
}
