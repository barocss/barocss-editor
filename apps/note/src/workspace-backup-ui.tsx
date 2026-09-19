import { useRef, useState } from 'react';
import { Button, Dialog, Icon } from '@barocss/office-ui';
import { MAX_WORKSPACE_BACKUP_BYTES, type WorkspaceRestorePlan } from './workspace-backup';
import './workspace-backup-ui.css';

export function WorkspaceBackupControls({ disabled, onBackup, onPreview, onRestore }: {
  disabled: boolean; onBackup: () => Promise<void>; onPreview: (file: File) => Promise<WorkspaceRestorePlan>;
  onRestore: (plan: WorkspaceRestorePlan) => Promise<{ restored: number } | { changed: WorkspaceRestorePlan }>;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const [plan, setPlan] = useState<WorkspaceRestorePlan>();
  const [fileName, setFileName] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const picker = useRef<HTMLInputElement>(null);
  const run = async (operation: () => Promise<void>) => {
    if (pending.current) return;
    pending.current = true; setBusy(true); setError('');
    try { await operation(); } catch (error) { setError(error instanceof Error ? error.message : '보관함을 처리하지 못했습니다. 다시 시도하세요.'); }
    finally { pending.current = false; setBusy(false); }
  };
  return <>
    <Button tone="quiet" disabled={disabled} ariaLabel="보관함 백업 및 복원" onClick={() => { setError(''); setMessage(''); setOpen(true); }}><Icon name="type-page" size={15} />백업 및 복원</Button>
    <Dialog open={open} onOpenChange={next => { if (!busy) { setOpen(next); if (!next) { setPlan(undefined); setFileName(''); } } }} title="보관함 백업 및 복원" description="페이지와 속성, 문서 사이의 연결을 함께 보관합니다." className="nw-backup-dialog" footer={<>
      <Button tone="quiet" disabled={busy} onClick={() => { setPlan(undefined); setFileName(''); setOpen(false); }}>닫기</Button>
      {plan && <Button tone="accent" disabled={busy || !plan.writes.length} onClick={() => void run(async () => {
        const result = await onRestore(plan);
        if ('changed' in result) { setPlan(result.changed); setMessage('보관함이 변경되어 복원할 사본을 다시 준비했습니다. 아래 내용을 확인하세요.'); }
        else { setPlan(undefined); setFileName(''); setMessage(`${result.restored}개 페이지를 복원했습니다.`); }
      })}>{busy ? '복원 중…' : '보관함에 복원'}</Button>}
    </>}>
      <div className="nw-backup-actions">
        <div><strong>전체 백업</strong><p>하위 페이지, 즐겨찾기, 휴지통과 복구 초안을 포함합니다.</p></div>
        <Button disabled={busy} onClick={() => void run(async () => { await onBackup(); setMessage('전체 백업 파일을 다운로드했습니다.'); })}>백업 다운로드</Button>
      </div>
      <div className="nw-backup-actions">
        <div><strong>백업에서 복원</strong><p>기존 페이지와 ID가 겹치면 새 사본으로 추가합니다.</p></div>
        <Button disabled={busy} onClick={() => picker.current?.click()}>백업 파일 선택</Button>
        <input ref={picker} type="file" hidden disabled={busy} accept=".json,application/json" aria-label="보관함 백업 파일" onChange={event => {
          const file = event.target.files?.[0]; event.target.value = '';
          if (file) void run(async () => {
            setPlan(undefined); setMessage(''); setFileName('');
            if (file.size > MAX_WORKSPACE_BACKUP_BYTES) throw new Error('백업 파일은 100MB 이하로 열 수 있습니다.');
            const next = await onPreview(file); setPlan(next); setFileName(file.name);
          });
        }} />
      </div>
      {plan && <section className="nw-backup-preview" aria-label="복원 미리보기">
        <strong>{fileName}</strong>
        <dl><div><dt>복원할 페이지</dt><dd>{plan.pages.length}개</dd></div><div><dt>ID가 겹쳐 만드는 사본</dt><dd>{plan.copied}개</dd></div><div><dt>복구 초안</dt><dd>{plan.pages.filter(page => page.kind === 'draft').length}개</dd></div></dl>
        <ul>{plan.pages.slice(0, 100).map(page => <li key={page.id}><Icon name="type-page" size={14} /><span>{page.title}</span><small>{page.reason ? '원본 보관' : page.kind === 'draft' ? '초안 → 새 페이지' : page.copied ? '새 사본' : page.meta.trashedAt !== null ? '휴지통' : '페이지'}</small></li>)}</ul>
        {plan.pages.length > 100 && <p>외 {plan.pages.length - 100}개 페이지</p>}
        {!!plan.unreadable && <p>{plan.unreadable}개 문서는 현재 열 수 없어 원본 파일 그대로 보관합니다.</p>}
        {!!plan.repairedParents && <p>유효하지 않은 상위 페이지 연결 {plan.repairedParents}개를 최상위로 정리합니다.</p>}
        {plan.pages.some(page => page.kind === 'draft') && <p>복구 초안은 독립된 새 페이지로 추가합니다.</p>}
        {!plan.pages.length && <p>이 백업에 복원할 페이지가 없습니다.</p>}
      </section>}
      {error && <p className="nw-backup-error" role="alert">{error}</p>}
      {message && <p className="nw-backup-message" role="status">{message}</p>}
    </Dialog>
  </>;
}
