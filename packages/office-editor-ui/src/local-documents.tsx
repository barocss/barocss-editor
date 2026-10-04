import { useCallback, useEffect, useImperativeHandle, useRef, useState, type MouseEvent, type Ref } from 'react';
import { documentLocationId, DocumentSession, captureProductNavigation, ProductDocumentTrashedError, downloadDocumentArchive, isProductDocumentTrashed, productLibraryArchive, type ProductDocumentHost, type DocumentSessionOptions, type DocumentSessionStatus, type LibraryRow } from '@barocss/shared';
import { Button, Dialog, StatusNotice, Tip } from '@barocss/office-ui';
import { Icon } from '@barocss/office-icons';
import { DocumentSaveStatus } from './document-save-status';
import { useOfficeLocale } from '@barocss/office-ui';

export function useLocalDocuments(options: DocumentSessionOptions | null) {
  const session = useRef<DocumentSession | null>(null);
  const [status, setStatus] = useState<DocumentSessionStatus>('loading');
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

/** The mounted library owns reads, drafts and recovery; menus only request its existing action. */
export interface LocalDocumentActions { open(origin?: HTMLElement | null): void; }

/** Local storage and recovery controls shared by product shells. */
export function LocalDocuments({ persistence, title, prefix, onOpened, iconOnly = false, showTrigger = true, ref }: {
  persistence: ReturnType<typeof useLocalDocuments>; title: string; prefix: string; onOpened: () => void; iconOnly?: boolean; showTrigger?: boolean; ref?: Ref<LocalDocumentActions>;
}) {
  const { status } = persistence;
  const { t } = useOfficeLocale();
  const [open, setOpen] = useState(false), [busy, setBusy] = useState(false);
  const [rows, setRows] = useState<LibraryRow[]>([]), [drafts, setDrafts] = useState<LibraryRow[]>([]);
  type Problem = { code: 'recoveryOpenFailed' | 'operationFailed' | 'saveUnconfirmed' | 'trashed' | 'openFailed'; title?: string };
  const [problem, setProblem] = useState<Problem | null>(null);
  const problemText = problem && (problem.code === 'trashed' || problem.code === 'openFailed'
    ? t(`document.library.${problem.code}`, { title: problem.title ?? t('document.library.untitled') })
    : t(`document.library.${problem.code}`));
  const [confirmRecovery, setConfirmRecovery] = useState(false);
  const lock = useRef(false);
  const opener = useRef<HTMLElement | null>(null);
  const recent = useRef<HTMLButtonElement | null>(null);
  const restoreFocus = () => {
    const target = opener.current;
    (target?.isConnected && !target.hasAttribute('disabled') ? target : recent.current)?.focus();
  };
  const recoveryButtonRef = useRef<HTMLButtonElement>(null);
  const recoveryRequired = status === 'recovery-required';
  useEffect(() => { if (recoveryRequired && open) recoveryButtonRef.current?.focus(); }, [recoveryRequired, open]);
  const perform = async (action: () => Promise<void>, onError?: (error: unknown) => Problem) => {
    if (lock.current) return;
    lock.current = true; setBusy(true); setProblem(null);
    try { await action(); }
    catch (error) { setProblem(persistence.session.current?.recoveryRequired
      ? { code: 'recoveryOpenFailed' }
      : onError?.(error) ?? { code: 'operationFailed' }); }
    finally { lock.current = false; setBusy(false); }
  };
  const show = async () => {
    const session = persistence.session.current;
    if (!session) return;
    const id = session.id, navigation = captureProductNavigation();
    const owns = () => persistence.session.current === session && session.id === id &&
      (!navigation || navigation.id !== id || navigation.isCurrent());
    const savedCurrent = await session.flush();
    if (!owns()) throw new Error('Library owner changed');
    if (!savedCurrent && !session.recoveryRequired)
      setProblem({ code: 'saveUnconfirmed' });
    const [saved, recovered] = await Promise.all([session.options.documents.rows(), session.options.drafts.rows()]);
    const available = await Promise.all(saved.map(async row => !await isProductDocumentTrashed(session.options.key, row.name)));
    if (!owns()) throw new Error('Library owner changed');
    setRows(saved.filter((_, index) => available[index])); setDrafts(recovered); setOpen(true);
  };
  const requestLibrary = (origin?: HTMLElement | null) => {
    if (lock.current) return;
    // Disabling the trigger can blur it before the asynchronous library read finishes.
    opener.current = origin ?? null;
    void perform(show);
  };
  const openLibrary = (event: MouseEvent<HTMLButtonElement>) => requestLibrary(event.currentTarget);
  useImperativeHandle(ref, () => ({ open: requestLibrary }));
  const failure = status === 'save-error' || status === 'restore-error' || recoveryRequired;
  const reopenSaved = () => void perform(async () => {
    const session = persistence.session.current;
    const id = session && documentLocationId(session.options.key);
    if (!session || !id || !await session.open(id)) throw new Error('Saved copy is unavailable');
    setConfirmRecovery(false);
    if (open) { onOpened(); setOpen(false); }
  });
  const recoveryButton = <Button ref={recoveryButtonRef} disabled={busy} onClick={() => setConfirmRecovery(true)}>{t('document.library.reopenSaved')}</Button>;
  const recoveryConfirmation = <StatusNotice tone="danger" title={t('document.library.discardTitle')}
    actions={<><Button disabled={busy} onClick={() => setConfirmRecovery(false)}>{t('document.library.cancel')}</Button>
      <Button disabled={busy} onClick={reopenSaved}>{t('document.library.discardAndOpen')}</Button></>}>
    {t('document.library.recoveryWarning')}
  </StatusNotice>;
  return <>
    <Tip label={iconOnly ? t(`document.save.status.${status}`) : undefined}><DocumentSaveStatus status={status} tabIndex={iconOnly ? 0 : undefined} className="office-save-status" data-icon-only={iconOnly || undefined} {...{ [`data-${prefix}-save-status`]: true }} /></Tip>
    {recoveryRequired && !open && recoveryButton}
    {recoveryRequired && !open && confirmRecovery && recoveryConfirmation}
    {failure && !recoveryRequired && <Button disabled={busy} onClick={() => void perform(async () => {
        const session = persistence.session.current;
        if (!session) return;
        if (status === 'restore-error') {
          const id = documentLocationId(session.options.key);
          if (!id || !await session.open(id)) throw new Error('Saved copy is unavailable');
        } else await session.flush();
      })}>{t(status === 'restore-error' ? 'document.save.action.retryRestore' : 'document.save.action.retrySave')}</Button>}
    {status === 'conflict' && <Button disabled={busy} onClick={openLibrary}>{t('document.save.action.openDraft')}</Button>}
    {showTrigger && <Tip label={iconOnly ? (busy && !open ? t('document.library.recentLoading') : t('document.library.recent')) : undefined}><Button ref={recent} square={iconOnly} tone={iconOnly ? 'quiet' : 'plain'} ariaLabel={iconOnly ? t('document.library.recent') : undefined} aria-busy={busy || undefined} onClick={openLibrary} disabled={busy}>{iconOnly ? <Icon name="recent-documents" /> : busy && !open ? t('document.library.processing') : t('document.library.recent')}</Button></Tip>}
    {problem && !open && <span role="alert">{problemText}</span>}
    <Dialog open={open} onClosed={restoreFocus} onOpenChange={value => { if (!busy) { setOpen(value); if (!value) setProblem(null); } }} title={title}
      description={t('document.library.description')}>
      {failure && <StatusNotice tone="danger" title={t(`document.save.status.${status}`)}>{recoveryRequired
        ? t('document.library.recoveryRequiredHelp')
        : t('document.library.failureHelp')}</StatusNotice>}
      {recoveryRequired && recoveryButton}
      {recoveryRequired && confirmRecovery && recoveryConfirmation}
      {problem && <StatusNotice tone="danger" title={t('document.library.operationFailedTitle')}>{problemText}</StatusNotice>}
      {drafts.length > 0 && <StatusNotice tone="warning" title={t('document.library.draftAvailableTitle')}>{recoveryRequired
        ? t('document.library.draftRecoveryFirst')
        : t('document.library.draftCompare')}</StatusNotice>}
      <Button disabled={busy || recoveryRequired} onClick={() => void perform(async () => {
        const session = persistence.session.current;
        if (!session || !await session.beforeReplace()) throw new Error('Pending input');
        const product = session.options.key as ProductDocumentHost['product'];
        downloadDocumentArchive(await productLibraryArchive(product, session.options.documents, session.options.drafts), `wonffice-${product}-library.json`);
      })}>{t('document.library.backupAll')}</Button>
      <div style={{ maxHeight: '55vh', overflowY: 'auto' }}>
        {drafts.map(row => <div key={row.name} className="office-recovery-row" {...{ [`data-${prefix}-draft`]: row.name }}>
          <span>{t('document.library.draftLabel', { title: row.title || t('document.library.untitled') })}</span>
          <Button disabled={busy || recoveryRequired} onClick={() => void perform(async () => {
            if (await persistence.session.current?.recover(row)) { onOpened(); setOpen(false); }
            else throw new Error('Pending edit');
          })}>{t('document.library.restoreAsNew')}</Button>
        </div>)}
        {!rows.length && <p>{t('document.library.empty')}</p>}
        {rows.map(row => <div key={row.name} className="flex items-center justify-between gap-3 py-2" {...{ [`data-${prefix}-document`]: row.name }}>
          <span>{row.title || t('document.library.untitled')}</span>
          <Button disabled={busy || recoveryRequired} ariaLabel={t('document.library.openLabel', { title: row.title || t('document.library.untitled') })} onClick={() => void perform(async () => {
            if (await persistence.session.current?.open(row.name, true)) { onOpened(); setOpen(false); }
            else throw new Error('Pending edit');
          }, error => {
            if (error instanceof ProductDocumentTrashedError) {
              setRows(current => current.filter(item => item.name !== row.name));
              return { code: 'trashed', title: row.title };
            }
            return { code: 'openFailed', title: row.title };
          })}>{t('document.library.open')}</Button>
        </div>)}
      </div>
    </Dialog>
  </>;
}
