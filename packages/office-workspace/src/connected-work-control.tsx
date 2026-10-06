import { useEffect, useMemo, useRef, useState } from 'react';
import { Button, StatusNotice, useOfficeLocale } from '@barocss/office-ui';
import { productDocumentHost, productFeedbackHost, prepareProductNavigation, type ProjectExecution, type MessageKey } from '@barocss/shared';
import type { ProjectRepository } from './project-ui';

/** JSONB preserves values, but can reorder object fields. Arrays and strings stay exact. */
function sameValue(left: unknown, right: unknown): boolean {
  if (left === right) return true;
  if (!left || !right || typeof left !== 'object' || typeof right !== 'object' || Array.isArray(left) !== Array.isArray(right)) return false;
  if (Array.isArray(left) && Array.isArray(right) && left.length !== right.length) return false;
  const a = left as Record<string, unknown>, b = right as Record<string, unknown>;
  return Object.keys(a).length === Object.keys(b).length && Object.keys(a).every(key => Object.hasOwn(b, key) && sameValue(a[key], b[key]));
}
const phaseLabel: Record<ProjectExecution['phase'], string> = {
  unknown: '실행 결과 미확인', proposal: '제안 검토', blocked: '변경 확인 필요', failed: '실행 실패',
  accepted: '승인됨 · 저장 확인 대기', applied: '원본 반영 확인', rejected: '제안 거절', unsupported: '지원 범위 밖'
};
const reasonLabel: Record<string, string> = {
  execution_outcome_unknown: '응답을 확인하지 못했습니다. 같은 요청을 자동으로 재실행하지 않습니다.',
  unsupported_target: '이 대상의 자동 편집은 아직 지원하지 않습니다.',
  adapter_unavailable: '연결한 실행기를 사용할 수 없습니다.', invalid_proposal: '모델의 제안을 안전하게 적용할 수 없습니다.',
  invalid_provenance: '실행 근거를 확인하지 못했습니다.', source_conflict: '참고 원본이 바뀌었습니다. 기존 입력과 제안을 유지합니다.',
  target_conflict: '원래 댓글 영역을 찾을 수 없습니다.', project_conflict: '프로젝트의 요청이나 연결이 바뀌었습니다.',
  authority_changed: '실행 이후 계정 권한이 바뀌었습니다.', work_paused: '같은 작업이 일시 정지되었습니다.',
  project_archived: '프로젝트가 보관되었습니다.', rejected_by_human: '사용자가 제안을 거절했습니다.'
};
/** The same persisted attempt is read after loss. Opening this control never dispatches a model. */
export function ConnectedWorkControl({ repository, project, work, revision, document, product, results = [] }: {
  repository: ProjectRepository; project: string; work: string; revision: number;
  product?: 'note' | 'word' | 'slides' | 'site';
  results?: { id: string; name: string; document: { id: string } }[];
  document?: { product: 'note' | 'word' | 'slides' | 'site'; id: string };
}) {
  const { t } = useOfficeLocale();
  const noteTask = (document?.product ?? product) === 'note';
  const message = (key: MessageKey, fallback: string) => noteTask ? t(key) : fallback;
  const [localApplied, setLocalApplied] = useState<string>();
  const [execution, setExecution] = useState<ProjectExecution | null>(), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const [hostEpoch, setHostEpoch] = useState(0), epoch = useRef(0);
  const mountedHost = document ? productDocumentHost() : undefined;
  useEffect(() => {
    const changed = () => { epoch.current++; setHostEpoch(epoch.current); };
    window.addEventListener('wonffice:host-change', changed);
    window.addEventListener('wonffice:feedback-host-change', changed);
    return () => { window.removeEventListener('wonffice:host-change', changed); window.removeEventListener('wonffice:feedback-host-change', changed); };
  }, []);
  const generation = useMemo(() => ({ hostEpoch }), [repository, project, work, revision, document?.id, document?.product, mountedHost, hostEpoch]);
  const current = useRef(generation); current.current = generation;
  const mounted = useRef(false), lock = useRef(false);
  const owns = () => mounted.current && current.current === generation && epoch.current === generation.hostEpoch &&
    (!document || (productDocumentHost() === mountedHost && mountedHost?.product === document.product && mountedHost.id() === document.id));
  const requireOwn = () => { if (!owns()) throw new Error(message('workspace.task.ownerChanged', '계정 또는 작업이 바뀌었습니다. 원본과 제안을 다시 확인하세요.')); };
  const refresh = async () => { const next = await repository.execution?.(project, work); requireOwn(); setExecution(next ?? null); };
  useEffect(() => {
    mounted.current = true; lock.current = false; setExecution(undefined); setLocalApplied(undefined); setBusy(false); setError('');
    void refresh().catch(() => owns() && setError(message('workspace.task.recordUnreadable', '실행 기록을 읽지 못했습니다. 요청을 다시 실행하지 않습니다.')));
    return () => { mounted.current = false; };
  }, [generation]);
  const perform = async (action: () => Promise<void>) => {
    if (!owns() || lock.current) return;
    lock.current = true; setBusy(true); setError('');
    try { await action(); } catch (cause) { if (owns()) setError(cause instanceof Error ? cause.message : message('workspace.task.outcomeUnreadable', '실행 결과를 확인하지 못했습니다.')); }
    finally { if (owns()) { lock.current = false; setBusy(false); } }
  };
  const acknowledge = async (one: ProjectExecution) => {
    if (!document || one.documentId !== document.id || !repository.acknowledgeExecution || !one.expectedSnapshotText || !one.expectedSnapshotHash) throw new Error(message('workspace.task.saveUnavailable', '이 원본의 저장 결과를 확인할 수 없습니다.'));
    const pin = await repository.pin(document); requireOwn();
    if (pin.text !== one.expectedSnapshotText) throw new Error(message('workspace.task.savedDifferent', '현재 저장한 원본이 제안과 다릅니다. 입력과 제안을 유지하고 변경을 확인하세요.'));
    const next = await repository.acknowledgeExecution(project, work, one.id, pin.revision, one.expectedSnapshotHash); requireOwn(); setExecution(next);
  };
  const capturePreview = (one: ProjectExecution) => {
    if (!one.proposal || !document || !one.expectedSnapshotText) return null;
    if (noteTask && (!one.binding || one.binding.product !== 'note' || one.binding.operation !== 'note.paragraph.replace/v1' || one.binding.schema !== 'barocss-note@1')) return null;
    const host = productFeedbackHost();
    if (host?.product !== document.product || host.id() !== document.id || one.documentId !== document.id || !host.previewRevision) throw new Error(message('workspace.task.openNative', '이 원본의 직접 편집 화면에서 제안을 확인하세요.'));
    const preview = host.previewRevision({ targetId: one.input.target.nodeId, snapshotText: one.input.snapshotText,
      expectedSnapshotText: one.expectedSnapshotText, replacement: one.proposal.replacement }, owns);
    return preview ? { host, preview } : null;
  };
  const requirePreview = (capture: NonNullable<ReturnType<typeof capturePreview>>) => {
    requireOwn();
    if (capture.host !== productFeedbackHost() || !capture.preview.current()) throw new Error(message('workspace.task.captureRetired', '원본, 대상 또는 선택이 바뀌었습니다. 현재 입력과 제안을 유지합니다.'));
  };
  const applyApproval = async (one: ProjectExecution, capture: NonNullable<ReturnType<typeof capturePreview>>) => {
    requirePreview(capture);
    const accepted = await repository.acceptExecution!(project, work, one.id); requireOwn();
    if (accepted.phase !== 'accepted' || accepted.id !== one.id || accepted.documentId !== one.documentId ||
      accepted.actorId !== one.actorId || accepted.expectedSnapshotText !== one.expectedSnapshotText ||
      accepted.expectedSnapshotHash !== one.expectedSnapshotHash || (noteTask ? !sameValue(accepted.input, one.input) || !sameValue(accepted.proposal, one.proposal) || !sameValue(accepted.binding, one.binding)
        : JSON.stringify(accepted.input) !== JSON.stringify(one.input) || JSON.stringify(accepted.proposal) !== JSON.stringify(one.proposal))) throw new Error(message('workspace.task.approvalChanged', '승인 중 원본 또는 권한이 바뀌었습니다. 다시 확인하세요.'));
    requirePreview(capture);
    if (!await capture.preview.apply()) throw new Error(message('workspace.task.applyUnconfirmed', '원본 적용을 확인하지 못했습니다. 현재 초안과 제안을 유지합니다.'));
    requireOwn(); setExecution(accepted);
    if (noteTask) { setLocalApplied(accepted.id); return; }
    if (!await prepareProductNavigation()) throw new Error('원본 변경은 초안에 있습니다. 기존 저장 복구를 사용한 뒤 저장 결과를 확인하세요.');
    requireOwn(); await acknowledge(accepted);
  };
  const approve = async () => {
    if (!execution?.proposal || !document || !repository.acceptExecution || !execution.expectedSnapshotText) return;
    // Capture before preparing storage. A selection or input ABA during that
    // wait retires this gesture even if its final bytes and selection match.
    const capture = capturePreview(execution);
    if (!capture) throw new Error(message('workspace.task.captureRetired', '원본, 대상 또는 선택이 바뀌었습니다. 현재 입력과 제안을 유지합니다.'));
    try {
      if (!noteTask && !await prepareProductNavigation()) throw new Error('현재 입력과 저장 복구를 먼저 완료하세요.');
      await applyApproval(execution, capture);
    } finally { capture.preview.dispose(); }
  };
  const saveNote = async () => {
    if (!execution || execution.phase !== 'accepted' || !noteTask) return;
    // This separate human Save gesture uses the existing immutable Note attempt /
    // receipt recovery. It never reconstructs or reapplies a native proposal.
    const host = productFeedbackHost();
    if (!execution.proposal || !execution.expectedSnapshotText || host?.product !== 'note' || host.id() !== document?.id || !host.saveRevision ||
      !await host.saveRevision({ targetId: execution.input.target.nodeId, snapshotText: execution.input.snapshotText,
        expectedSnapshotText: execution.expectedSnapshotText, replacement: execution.proposal.replacement }, execution.input.revision, owns))
      throw new Error(t('workspace.task.saveUnconfirmed'));
    requireOwn(); await acknowledge(execution);
  };
  const applyAcceptedNote = async () => {
    if (!execution || !noteTask || localApplied === execution.id) return;
    const capture = capturePreview(execution);
    if (!capture) throw new Error(t('workspace.task.captureRetired'));
    try { await applyApproval(execution, capture); } finally { capture.preview.dispose(); }
  };
  const recoverAccepted = async () => {
    if (!execution || !document) return;
    // Keep the existing gesture through draft reconciliation and pin reading.
    // An already-applied draft needs only its exact saved-byte ACK; it must not
    // construct or apply another preview of the original source.
    const capture = capturePreview(execution);
    try {
      if (!await prepareProductNavigation()) throw new Error('기존 문서 저장 복구를 먼저 완료하세요.');
      requireOwn();
      const pin = await repository.pin(document); requireOwn();
      if (capture) requirePreview(capture);
      if (pin.text === execution.expectedSnapshotText) return acknowledge(execution);
      if (pin.text !== execution.input.snapshotText || pin.revision !== execution.input.revision) throw new Error('승인 뒤 원본이 바뀌었습니다. 현재 입력과 제안을 유지하고 다시 확인하세요.');
      if (!capture) throw new Error(message('workspace.task.captureRetired', '원본, 대상 또는 선택이 바뀌었습니다. 현재 입력과 제안을 유지합니다.'));
      if (!repository.acceptExecution) throw new Error('이 제안의 승인을 확인할 수 없습니다.');
      await applyApproval(execution, capture);
    } finally { capture?.preview.dispose(); }
  };
  if (!repository.execution) return <p className="ow-feedback-note">{noteTask ? t('workspace.task.unavailable') : '실행기 미연결 · 원본은 자동 변경되지 않습니다.'}</p>;
  return <section className="ow-connected-work" aria-label={noteTask ? t('workspace.task.review') : '연결된 수정 작업'}>
    <p role="status">{busy ? noteTask ? t('workspace.task.loading') : '실행 결과를 확인하는 중입니다.' : execution ? noteTask ? localApplied === execution.id && execution.phase === 'accepted' ? t('workspace.task.localApplied') : t(`workspace.task.phase.${execution.phase}`) : phaseLabel[execution.phase] : execution === null ? noteTask ? t('workspace.task.recorded') : '요청 보관됨 · 아직 실행하지 않음' : noteTask ? t('workspace.task.reading') : '실행 기록을 읽는 중입니다.'}</p>
    {noteTask && !document && <p className="ow-feedback-note">{t('workspace.task.openToApply')}</p>}
    {error && <StatusNotice tone="danger" title={noteTask ? t('workspace.task.errorTitle') : '실행 확인 필요'}>{error}</StatusNotice>}
    {execution?.reason && <p>{noteTask ? t(Object.hasOwn(reasonLabel, execution.reason) ? `workspace.task.reason.${execution.reason}` as MessageKey : 'workspace.task.cannotProceed') : reasonLabel[execution.reason] ?? '작업을 진행할 수 없습니다. 원본과 요청을 다시 확인하세요.'}</p>}
    {execution?.appliedRevision !== undefined && <p>{message('workspace.task.confirmedVersion', '원본 반영을 확인한 버전')} {execution.appliedRevision}</p>}
    {execution?.provenance && <details><summary>{message('workspace.task.provenance', '실제 실행 근거')}</summary><p>{execution.provenance.kind === 'live-local-model' ? message('workspace.task.localResponse', '로컬 모델의 실제 응답') : message('workspace.task.unknownProvenance', '실행 유형 확인 필요')} · {execution.provenance.model}</p><p>{message('workspace.task.version', '기준 원본 버전')} {execution.input.revision}</p><code>{execution.provenance.modelDigest}</code></details>}
    {!!execution?.pendingOutputs?.length && <div aria-label="후속 결과물 상태"><h3>후속 결과물</h3>
      {execution.pendingOutputs.map(output => <div key={output.resultId}><p>{results.find(one => one.id === output.resultId)?.name ?? '후속 결과물'} · {output.reason === 'unsupported_target' ? '대기: 이 결과물의 자동 편집은 아직 지원하지 않습니다.' : output.reason}</p>{output.inputs?.map(pin => <p key={pin.id}>{results.find(one => one.document.id === pin.documentId)?.name ?? '참고 원본'} · 버전 {pin.revision} · <code>{pin.snapshotHash}</code></p>)}</div>)}
      <p>실행에 사용한 고정 입력</p><ul>{execution.input.inputs.map(pin => <li key={pin.id}>{results.find(one => one.document.id === pin.documentId)?.name ?? '참고 원본'} · 버전 {pin.revision} · <code>{pin.snapshotHash}</code></li>)}</ul>
    </div>}
    {execution?.proposal && <><h3>{noteTask ? t('workspace.task.before') : '원본'}</h3><p>{execution.input.target.text}</p><h3>{noteTask ? t('workspace.task.after') : '제안'}</h3><p>{execution.proposal.replacement}</p><p>{execution.proposal.reason}</p>
      {execution.proposal.assumptions.length > 0 && <details><summary>{noteTask ? t('workspace.task.assumptions') : '확인할 가정'}</summary><ul>{execution.proposal.assumptions.map((one, index) => <li key={index}>{one}</li>)}</ul></details>}
      <p className="ow-feedback-note">{noteTask ? t('workspace.task.proposalDescription') : '모델의 해석입니다. 검증한 업무 기준이나 자동 반영 결과가 아닙니다.'}</p></>}
    {execution === null && <Button disabled={busy || !repository.writable || !repository.execute} onClick={() => void perform(async () => {
      const next = await repository.execute!(project, work, revision); requireOwn(); setExecution(next);
    })}>{noteTask ? t('workspace.task.generate') : '로컬 모델에 제안 요청'}</Button>}
    <Button disabled={busy} onClick={() => void perform(refresh)}>{noteTask ? t('workspace.task.refresh') : '실행 기록 확인'}</Button>
    {(execution?.phase === 'proposal' || (execution?.phase === 'blocked' && execution.proposal && ['work_paused', 'project_conflict'].includes(execution.reason ?? ''))) && <><Button tone="accent" disabled={busy || !repository.writable || !document} onMouseDown={event => event.preventDefault()} onClick={() => void perform(approve)}>{noteTask ? t('workspace.task.apply') : '이 변경 승인 및 저장'}</Button>
      <Button disabled={busy || !repository.writable || !repository.rejectExecution} onClick={() => void perform(async () => { const next = await repository.rejectExecution!(project, work, execution.id); requireOwn(); setExecution(next); })}>{noteTask ? t('workspace.task.decline') : '제안 거절'}</Button></>}
    {execution?.phase === 'accepted' && (noteTask ? <>
      {localApplied !== execution.id && <Button disabled={busy || !repository.writable || !document} onMouseDown={event => event.preventDefault()} onClick={() => void perform(applyAcceptedNote)}>{t('workspace.task.applyAccepted')}</Button>}
      <Button disabled={busy || !repository.writable || !document} onMouseDown={event => event.preventDefault()} onClick={() => void perform(saveNote)}>{t('workspace.task.save')}</Button>
      <p className="ow-feedback-note">{t('workspace.task.saveDescription')}</p>
    </> : <Button disabled={busy || !repository.writable || !document} onMouseDown={event => event.preventDefault()} onClick={() => void perform(recoverAccepted)}>승인된 변경 이어서 확인</Button>)}
    {execution?.phase === 'unknown' && <p className="ow-feedback-note">{message('workspace.task.unknownDescription', '같은 작업을 자동으로 재실행하지 않습니다. 원본은 적용되지 않았습니다.')}</p>}
  </section>;
}
