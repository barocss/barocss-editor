import { useEffect, useMemo, useRef, useState } from 'react';
import { Button, Icon, IconButton, StatusNotice } from '@barocss/office-ui';
import { createProjectComment, requestProjectWork, productDocumentHost, productFeedbackHost, prepareProductNavigation,
  type ProductFeedbackTarget, type Pin, type ProjectComment } from '@barocss/shared';
import type { Product } from './products';
import { type ProjectRepository, type ProjectSnapshot, PinnedSource } from './project-ui';

export function ProjectFeedback({ repository, projectId, document: address, beforeLeave, actor }: {
  repository: ProjectRepository; projectId: string; document: { product: Product; id: string };
  beforeLeave?: { current?: () => Promise<boolean> }; actor?: { kind: 'local' | 'human'; id: string; label: string }
}) {
  const [snapshot, setSnapshot] = useState<ProjectSnapshot | null>(null), [open, setOpen] = useState(false), [error, setError] = useState('');
  const [draft, setDraft] = useState(''), [target, setTarget] = useState<ProductFeedbackTarget>(), [busy, setBusy] = useState(false);
  const [reading, setReading] = useState(new URLSearchParams(location.search).get('mode') === 'read');
  const [viewing, setViewing] = useState<string>();
  const [source, setSource] = useState<Pin>(), [hasReading, setHasReading] = useState(!!productFeedbackHost()?.reading);
  const inputVersion = useRef(0);
  const composing = useRef(false), latest = useRef(''), savedDraft = useRef(''), queue = useRef(Promise.resolve());
  const lock = useRef(false), mounted = useRef(true), successfulNative = useRef<ProductFeedbackTarget | undefined>(undefined);
  const pendingComment = useRef<ProjectComment | undefined>(undefined), capturedPin = useRef<Pin | undefined>(undefined);
  const pendingActivity = useRef<{ id: string; at: string; label: string } | undefined>(undefined);
  const identity = `${projectId}:${address.product}:${address.id}`;
  const hostEpochRef = useRef(0);
  const [hostEpoch, setHostEpoch] = useState(0), mountedHost = productDocumentHost();
  useEffect(() => { const changed = () => { hostEpochRef.current++; setHostEpoch(hostEpochRef.current); }; window.addEventListener('wonffice:host-change', changed); return () => window.removeEventListener('wonffice:host-change', changed); }, []);
  const generation = useMemo(() => ({ hostEpoch }), [identity, repository, mountedHost, hostEpoch]);
  const currentGeneration = useRef(generation); currentGeneration.current = generation;
  const owner = useRef(identity); owner.current = identity;
  const result = snapshot?.record.results.find(one => one.document.product === address.product && one.document.id === address.id);
  const key = `feedback:${address.product}:${address.id}`;
  const owns = () => mounted.current && hostEpochRef.current === generation.hostEpoch && currentGeneration.current === generation && owner.current === identity && (productDocumentHost() === mountedHost && (!mountedHost || (mountedHost.product === address.product && mountedHost.id() === address.id)));
  const requireOwn = () => { if (!owns()) throw new Error('문서 또는 계정이 바뀌었습니다. 이전 작업을 이어가지 않습니다.'); };
  const perform = async (action: () => Promise<void>) => {
    if (lock.current || !owns()) return;
    lock.current = true; setBusy(true); setError('');
    try { await action(); } catch (cause) { if (owns()) { setOpen(true); setError(cause instanceof Error ? cause.message : '의견을 저장하지 못했습니다.'); } }
    finally { if (owns()) { lock.current = false; setBusy(false); } }
  };
  const saveDraft = () => {
    const body = latest.current;
    queue.current = queue.current.catch(() => {}).then(async () => {
      if (body === savedDraft.current) return;
      const current = await repository.read(projectId);
      if (!current || !owns()) throw new Error('프로젝트가 바뀌었습니다. 의견 초안을 확인하세요.');
      const next = await repository.save({ ...current.record, drafts: { ...current.record.drafts, [key]: body } }, current.revision);
      requireOwn(); savedDraft.current = body; setSnapshot(next);
    });
    return queue.current;
  };
  useEffect(() => {
    mounted.current = true; lock.current = false; queue.current = Promise.resolve(); setBusy(false);
    setTarget(undefined); successfulNative.current = undefined; pendingComment.current = undefined; pendingActivity.current = undefined; capturedPin.current = undefined;
    const startingInput = inputVersion.current;
    void repository.read(projectId).then(value => {
      if (!owns()) return; setSnapshot(value); const text = value?.record.drafts[key] ?? ''; savedDraft.current = text;
      if (inputVersion.current === startingInput && !composing.current) { latest.current = text; setDraft(text); }
    }).catch(cause => owns() && setError(cause instanceof Error ? cause.message : '프로젝트를 열지 못했습니다.'));
    const host = productFeedbackHost(); if (host?.product === address.product && host.id() === address.id) host.reading?.(reading);
    const change = () => { const next = productFeedbackHost(); if (owns() && next?.product === address.product && next.id() === address.id) { next.reading?.(reading); setHasReading(!!next.reading); } };
    window.addEventListener('wonffice:feedback-host-change', change);
    const unload = (event: BeforeUnloadEvent) => { if (latest.current !== savedDraft.current) { event.preventDefault(); event.returnValue = ''; } };
    window.addEventListener('beforeunload', unload);
    if (beforeLeave) beforeLeave.current = async () => { try { await saveDraft(); return true; } catch (cause) { if (owns()) setError(cause instanceof Error ? cause.message : '초안을 저장하지 못했습니다.'); return false; } };
    return () => { mounted.current = false; window.removeEventListener('wonffice:feedback-host-change', change); window.removeEventListener('beforeunload', unload); if (beforeLeave) beforeLeave.current = undefined; };
  }, [identity, repository, generation]);
  const refresh = async () => { const value = await repository.read(projectId); if (!owns()) throw new Error('문서가 바뀌었습니다.'); setSnapshot(value); return value; };
  const start = async () => {
    const host = productFeedbackHost();
    if (host && (host.product !== address.product || host.id() !== address.id || !host.editable())) throw new Error('현재 문서에 의견을 남길 권한이 없습니다.');
    const captured = host ? host.capture() : { kind: 'document' as const, id: address.id, quote: '' };
    if (!captured) throw new Error('이 선택 영역은 아직 의견 연결을 지원하지 않습니다. 한 문단의 텍스트를 선택하세요.');
    if (!await prepareProductNavigation() || !owns()) throw new Error('마지막 입력을 저장하지 못했습니다.');
    await refresh();
    if (host && (host !== productFeedbackHost() || !host.ownsCapture?.(captured))) throw new Error('선택 영역이 바뀌었습니다. 의견 초안은 유지합니다. 대상 영역을 다시 선택하세요.');
    const capturedSource = await repository.pin(address);
    if (!owns() || (host && !host.ownsCapture?.(captured))) throw new Error('선택 영역이 바뀌었습니다. 대상 영역을 다시 선택하세요.');
    capturedPin.current = capturedSource; pendingComment.current = undefined; pendingActivity.current = undefined; successfulNative.current = undefined; setTarget(captured); setOpen(true);
  };
  const submit = async (request: boolean) => {
    if (!result || !target || composing.current || !draft.trim()) throw new Error('대상과 의견을 확인하세요.');
    const submittedDraft = draft, submittedBody = draft.trim();
    await saveDraft(); requireOwn();
    const ready = await repository.read(projectId);
    if (!owns() || !ready || ready.record.archived || !ready.record.results.some(one => one.id === result.id && one.document.product === address.product && one.document.id === address.id)) throw new Error('프로젝트 또는 결과물 연결이 바뀌었습니다. 의견 초안은 유지합니다.');
    const native = productFeedbackHost();
    if (target.kind === 'word-comment') {
      if (!native || native.product !== address.product || native.id() !== address.id || !native.editable()) throw new Error('현재 문서에 의견을 남길 권한이 없습니다.');
      if (!successfulNative.current) { const savedTarget = await native.comment(target, submittedBody); requireOwn(); successfulNative.current = savedTarget; }
    }
    if (!await prepareProductNavigation() || !owns()) throw new Error('원본 댓글을 저장하지 못했습니다. 입력한 의견을 유지합니다.');
    const pin = pendingComment.current?.pin ?? (target.kind === 'word-comment' ? await repository.pin(address) : capturedPin.current);
    requireOwn(); if (!pin) throw new Error('의견의 원본 버전을 다시 확인하세요.');
    const current = await repository.read(projectId);
    if (!current || !owns()) throw new Error('프로젝트가 바뀌었습니다.');
    const actual = successfulNative.current ?? target;
    let next = current.record;
    const existing = pendingComment.current && next.comments.find(one => one.id === pendingComment.current?.id);
    if (!pendingComment.current) {
      const created = createProjectComment(next, { resultId: result.id, target: actual, pin, body: submittedBody, actor: actor ?? { kind: 'local', id: 'local-browser', label: '이 브라우저 사용자' } });
      pendingComment.current = created.comments[created.comments.length - 1];
      pendingActivity.current = created.activities[created.activities.length - 1];
    }
    if (pendingComment.current.body !== submittedBody) throw new Error('저장 중인 의견이 있습니다. 먼저 같은 내용을 저장한 뒤 새 의견을 작성하세요.');
    if (!existing) next = { ...next, comments: [...next.comments, pendingComment.current], activities: pendingActivity.current && !next.activities.some(one => one.id === pendingActivity.current?.id) ? [...next.activities, pendingActivity.current] : next.activities };
    // One mutation per server action; comments and requests are distinct recorded operations.
    if (!existing) {
      const saved = await repository.save(next, current.revision); requireOwn(); next = saved.record;
      const canonicalId = saved.commentId ?? pendingComment.current.id;
      const inserted = next.comments.find(one => one.id === canonicalId);
      if (!inserted) throw new Error('저장한 의견의 식별자를 확인하지 못했습니다.');
      pendingComment.current = inserted;
    }
    if (request) {
      const saved = await repository.read(projectId); if (!saved || !owns()) throw new Error('프로젝트를 다시 확인하세요.');
      const persisted = saved.record.comments.find(one => one.id === pendingComment.current?.id);
      if (!persisted) throw new Error('저장한 의견을 다시 확인하세요.');
      const requested = requestProjectWork(saved.record, persisted.id, submittedBody);
      const stored = await repository.save(requested, saved.revision); requireOwn(); setSnapshot(stored);
    } else { const stored = await repository.read(projectId); requireOwn(); setSnapshot(stored); }
    if (!composing.current && latest.current === submittedDraft) { latest.current = ''; setDraft(''); }
    await saveDraft(); requireOwn(); setTarget(undefined); successfulNative.current = undefined; pendingComment.current = undefined;
  };
  const comments = snapshot?.record.comments.filter(one => one.resultId === result?.id) ?? [];
  return <>
    {result && <div className="ow-project-feedback-controls">
      <Button square ariaLabel="프로젝트 의견 남기기" onMouseDown={event => event.preventDefault()} onClick={() => void perform(start)} disabled={busy || !repository.writable || !!snapshot?.record.archived}><Icon name="comment-new" /></Button>
      <Button tone="quiet" onClick={() => setOpen(value => !value)}>의견 {comments.length}</Button>
      {hasReading && <Button tone="quiet" pressed={reading} disabled={busy} onClick={() => void perform(async () => {
        const host = productFeedbackHost(); if (host?.product !== address.product || host.id() !== address.id) return;
        if (reading && !await prepareProductNavigation()) throw new Error('직접 편집 전에 원본 저장을 확인하지 못했습니다.');
        requireOwn(); if (host !== productFeedbackHost()) throw new Error('문서가 바뀌었습니다. 다시 여세요.');
        const next = !reading; host.reading?.(next); setReading(next);
      })}> {reading ? '직접 편집' : '읽기'}</Button>}
    </div>}
    {error && !open && <span role="alert">{error}</span>}
    {open && <aside className="ow-feedback-panel" aria-label="프로젝트 의견"><header><h2>프로젝트 의견</h2><IconButton label="의견 닫기" onClick={() => void perform(async () => { await saveDraft(); requireOwn(); setOpen(false); })}><Icon name="close" /></IconButton></header>
      {error && <StatusNotice tone="danger" title="의견을 저장하지 못했습니다">{error}</StatusNotice>}
      {!target && draft && <p className="ow-feedback-note">작성 중인 의견을 보관했습니다. 문서의 대상 영역을 선택한 뒤 의견 남기기를 누르세요.</p>}
      {(target || draft) && <div className="ow-feedback-composer"><p>{!target ? '보관한 초안' : target.kind === 'document' ? '문서 전체' : '선택한 텍스트 영역'}</p>{target?.quote && <blockquote>{target.quote}</blockquote>}
        <textarea aria-label="프로젝트 의견 입력" value={draft} onChange={event => { const text = event.target.value; inputVersion.current++; latest.current = text; setDraft(text); void saveDraft().catch(cause => owns() && setError(cause instanceof Error ? cause.message : '초안을 저장하지 못했습니다.')); }} onCompositionStart={() => { composing.current = true; }} onCompositionEnd={() => { composing.current = false; }} onKeyDown={event => {
          if (composing.current || event.nativeEvent.isComposing || event.keyCode === 229) { if (event.key === 'Enter' || event.key === 'Escape') event.stopPropagation(); return; }
          if (event.key === 'Escape') { event.stopPropagation(); void perform(async () => { await saveDraft(); requireOwn(); setOpen(false); }); }
        }} />
        <div className="ow-actions"><Button disabled={busy || !target || !draft.trim()} onClick={() => void perform(() => submit(false))}>댓글만 남기기</Button><Button tone="accent" disabled={busy || !target || !draft.trim()} onClick={() => void perform(() => submit(true))}>수정 요청</Button></div><p className="ow-feedback-note">수정 요청은 작업을 연결합니다. 제품 Agent 실행기는 아직 연결되지 않았습니다.</p>
      </div>}
      {comments.map(comment => <article className="ow-feedback-thread" key={comment.id}><small>{comment.actor.label} · 버전 {comment.pin.revision}</small><p>{comment.body}</p>
        <Button disabled={busy} onClick={() => { const host = productFeedbackHost(); if (comment.target.kind === 'document') return; const state = host?.product === address.product && host.id() === address.id ? host.locate(comment.target) : 'missing'; if (state !== 'located') setError(state === 'ambiguous' ? '대상 영역이 중복되어 이동하지 않습니다.' : '대상 영역을 찾을 수 없습니다.'); }}>대상 영역</Button>
        <Button disabled={busy} onClick={() => void perform(async () => { if (viewing === comment.id) { setViewing(undefined); return; } const stored = await repository.readPin(projectId, comment.pin.id); requireOwn(); setSource(stored); setViewing(comment.id); })}>참고한 버전</Button>
        <Button disabled={busy || !repository.writable || !!comment.workId} onClick={() => void perform(async () => { const current = await refresh(); if (!current) throw new Error('프로젝트가 없습니다.'); const stored = await repository.save(requestProjectWork(current.record, comment.id, comment.body), current.revision); requireOwn(); setSnapshot(stored); })}>{comment.workId ? '작업에 연결됨' : '수정 작업 연결'}</Button>
        {comment.workId && <p className="ow-feedback-note">실행기 미연결 · 원본은 자동 변경되지 않습니다.</p>}{viewing === comment.id && source && <PinnedSource pin={source} />}
      </article>)}
    </aside>}
  </>;
}
