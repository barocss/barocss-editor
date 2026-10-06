import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Button, DocumentMenu, Icon, IconButton, StatusNotice, useOfficeLocale } from '@barocss/office-ui';
import { createProjectComment, requestProjectWork, productDocumentHost, productFeedbackHost, prepareProductNavigation, captureProductNavigation,
  type ProductFeedbackTarget, type ProductFeedbackHost, type Pin, type ProjectComment } from '@barocss/shared';
import type { Product } from './products';
import { type ProjectRepository, type ProjectSnapshot, type WordFeedbackRecovery, PinnedSource } from './project-ui';
import { ConnectedWorkControl } from './connected-work-control';

export interface PreparedFeedbackInput { isCurrent(): boolean; }
export type FeedbackBeforeLeave = (() => Promise<boolean>) & {
  isPrepared?: () => boolean;
  /** Input-only completion proof. It never grants native navigation authority. */
  capturePreparedInput?: () => PreparedFeedbackInput | undefined;
};
interface InputPreparation {
  matches(): boolean;
  protectedAtRetirement?: Readonly<{ version: number; text: string; durable: string }>;
  version: number; text: string; durable: string;
}


export function ProjectFeedback({ repository, projectId, document: address, beforeLeave, actor, presentation = 'feedback' }: {
  presentation?: 'feedback' | 'task';
  repository: ProjectRepository; projectId: string; document: { product: Product; id: string };
  beforeLeave?: { current?: FeedbackBeforeLeave }; actor?: { kind: 'local' | 'human'; id: string; label: string }
}) {
  const { t } = useOfficeLocale();
  const noteTask = presentation === 'task' && address.product === 'note';
  const inputElement = useRef<HTMLTextAreaElement>(null);
  const menuAnchor = useRef<HTMLSpanElement>(null);
  const restoreMenuFocus = () => menuAnchor.current?.querySelector<HTMLElement>(noteTask ? 'button' : '[role="menuitem"]')?.focus({ preventScroll: true });
  const [snapshot, setSnapshot] = useState<ProjectSnapshot | null>(null), [open, setOpen] = useState(noteTask), [error, setError] = useState('');
  const [draft, setDraft] = useState(''), [target, setTarget] = useState<ProductFeedbackTarget>(), [busy, setBusy] = useState(false);
  const [reading, setReading] = useState(new URLSearchParams(location.search).get('mode') === 'read');
  const [viewing, setViewing] = useState<string>();
  const [recovery, setRecovery] = useState<WordFeedbackRecovery | null>(null);
  const [excerpt, setExcerpt] = useState<ReturnType<NonNullable<ProductFeedbackHost['excerpt']>>>([]);
  const [source, setSource] = useState<Pin>(), [hasReading, setHasReading] = useState(!!productFeedbackHost()?.reading);
  const inputVersion = useRef(0);
  const composing = useRef(false), latest = useRef(''), savedDraft = useRef(''), queue = useRef(Promise.resolve());
  const lock = useRef(false), mounted = useRef(true), successfulNative = useRef<ProductFeedbackTarget | undefined>(undefined);
  const pendingComment = useRef<ProjectComment | undefined>(undefined), capturedPin = useRef<Pin | undefined>(undefined);
  const pendingActivity = useRef<{ id: string; at: string; label: string } | undefined>(undefined);
  const pendingRequest = useRef<{ record: ReturnType<typeof requestProjectWork>; revision: number; commentId: string } | undefined>(undefined);
  const identity = `${projectId}:${address.product}:${address.id}`;
  const hostEpochRef = useRef(0);
  const [hostEpoch, setHostEpoch] = useState(0), mountedHost = productDocumentHost();
  useEffect(() => { const changed = () => { hostEpochRef.current++; setHostEpoch(hostEpochRef.current); }; window.addEventListener('wonffice:host-change', changed); return () => window.removeEventListener('wonffice:host-change', changed); }, []);
  const inputLifetime = useMemo(() => ({ mounted: false, epoch: 0, retired: false,
    sourceHost: mountedHost, sourceId: mountedHost?.id(), sourceEpoch: mountedHost?.identityEpoch?.(), preparations: new Set<InputPreparation>() }), [identity, repository]);
  const currentInputLifetime = useRef(inputLifetime); currentInputLifetime.current = inputLifetime;
  useLayoutEffect(() => {
    inputLifetime.mounted = true; inputLifetime.epoch++;
    return () => { retireInput(); inputLifetime.mounted = false; inputLifetime.epoch++; };
  }, [inputLifetime]);
  const retireInput = () => {
    const sourceHost = inputLifetime.sourceHost;
    if (currentInputLifetime.current !== inputLifetime || !inputLifetime.mounted || inputLifetime.retired || !sourceHost || (productDocumentHost() === sourceHost &&
      sourceHost.id() === inputLifetime.sourceId && sourceHost.identityEpoch?.() === inputLifetime.sourceEpoch)) return;
    // Freeze only input already prepared at this exact native identity retirement.
    for (const preparation of inputLifetime.preparations) {
      if (preparation.matches()) preparation.protectedAtRetirement = Object.freeze({ version: inputVersion.current, text: latest.current, durable: savedDraft.current });
    }
    inputLifetime.retired = true;
    if (inputElement.current) inputElement.current.disabled = true;
  };
  useEffect(() => {
    window.addEventListener('wonffice:host-change', retireInput);
    window.addEventListener('wonffice:feedback-host-change', retireInput);
    return () => {
      window.removeEventListener('wonffice:host-change', retireInput);
      window.removeEventListener('wonffice:feedback-host-change', retireInput);
    };
  }, [inputLifetime]);
  const generation = useMemo(() => ({ hostEpoch }), [identity, repository, mountedHost, hostEpoch]);
  const currentGeneration = useRef(generation); currentGeneration.current = generation;
  const owner = useRef(identity); owner.current = identity;
  const result = snapshot?.record.results.find(one => one.document.product === address.product && one.document.id === address.id);
  const key = `feedback:${address.product}:${address.id}`;
  const owns = () => mounted.current && hostEpochRef.current === generation.hostEpoch && currentGeneration.current === generation && owner.current === identity && (productDocumentHost() === mountedHost && (!mountedHost || (mountedHost.product === address.product && mountedHost.id() === address.id)));
  const requireOwn = () => { if (!owns()) throw new Error('문서 또는 계정이 바뀌었습니다. 이전 작업을 이어가지 않습니다.'); };
  const menuCapture = useRef<{ host: ProductFeedbackHost; target: ProductFeedbackTarget | null | undefined; generation: typeof generation } | undefined>(undefined);
  // Capture before the menu moves keyboard focus away from the native selection.
  const captureMenuSelection = () => {
    menuCapture.current = undefined;
    const host = productFeedbackHost();
    if (!owns() || !host || host.product !== address.product || host.id() !== address.id || !host.editable()) return;
    menuCapture.current = { host, target: host.capture(), generation };
  };
  const perform = async (action: () => Promise<void>) => {
    if (lock.current || !owns()) return;
    lock.current = true; setBusy(true); setError('');
    try { await action(); } catch (cause) {
      if (owns()) {
        setOpen(true); setError(cause instanceof Error ? cause.message : '의견을 저장하지 못했습니다.');
        if (address.product === 'word' && repository.feedbackRecovery) {
          try { const pending = await repository.feedbackRecovery.read(projectId, address.id); if (owns()) setRecovery(pending); } catch { /* Keep the original failure and draft when authority or recovery reads fail. */ }
        }
      }
    }
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
    setTarget(undefined); setExcerpt([]); setRecovery(null); successfulNative.current = undefined; pendingComment.current = undefined; pendingActivity.current = undefined; pendingRequest.current = undefined; capturedPin.current = undefined;
    const startingInput = inputVersion.current;
    void repository.read(projectId).then(async value => {
      if (!owns()) return; setSnapshot(value); const text = value?.record.drafts[key] ?? ''; savedDraft.current = text;
      if (inputVersion.current === startingInput && !composing.current) { latest.current = text; setDraft(text); }
      if (address.product === 'word' && repository.feedbackRecovery) {
        const pending = await repository.feedbackRecovery.read(projectId, address.id);
        if (owns()) { setRecovery(pending); if (pending) setOpen(true); }
      }
    }).catch(cause => owns() && setError(cause instanceof Error ? cause.message : '프로젝트를 열지 못했습니다.'));
    const host = productFeedbackHost(); if (host?.product === address.product && host.id() === address.id) host.reading?.(reading);
    const change = () => { const next = productFeedbackHost(); if (owns() && next?.product === address.product && next.id() === address.id) { next.reading?.(reading); setHasReading(!!next.reading); } };
    window.addEventListener('wonffice:feedback-host-change', change);
    const unload = (event: BeforeUnloadEvent) => { if (latest.current !== savedDraft.current) { event.preventDefault(); event.returnValue = ''; } };
    window.addEventListener('beforeunload', unload);
    let preparedVersion: number | undefined;
    const prepare: FeedbackBeforeLeave = async () => {
      preparedVersion = undefined;
      const version = inputVersion.current;
      if (composing.current || !owns()) return false;
      try {
        await saveDraft();
        if (!owns() || composing.current || inputVersion.current !== version || latest.current !== savedDraft.current) return false;
        preparedVersion = version;
        return true;
      } catch (cause) {
        if (owns()) setError(cause instanceof Error ? cause.message : '초안을 저장하지 못했습니다.');
        return false;
      }
    };
    prepare.isPrepared = () => preparedVersion !== undefined && owns() && !composing.current && inputVersion.current === preparedVersion && latest.current === savedDraft.current;
    prepare.capturePreparedInput = () => {
      if (!prepare.isPrepared!() || inputLifetime.retired || !inputLifetime.mounted || currentInputLifetime.current !== inputLifetime) return;
      const version = inputVersion.current, text = latest.current, durable = savedDraft.current, epoch = inputLifetime.epoch;
      const matchesInput = () => currentInputLifetime.current === inputLifetime && inputVersion.current === version &&
        !composing.current && latest.current === text && savedDraft.current === durable && text === durable;
      const preparation: InputPreparation = { version, text, durable, matches: () => matchesInput() && inputLifetime.mounted && inputLifetime.epoch === epoch && preparedVersion === version };
      inputLifetime.sourceHost = mountedHost;
      inputLifetime.sourceId = mountedHost?.id(); inputLifetime.sourceEpoch = mountedHost?.identityEpoch?.();
      inputLifetime.preparations.add(preparation);
      return { isCurrent: () => {
        retireInput();
        if (currentInputLifetime.current !== inputLifetime) return false;
        if (!inputLifetime.retired) return preparation.matches();
        const frozen = preparation.protectedAtRetirement;
        return !!frozen && inputVersion.current === frozen.version && !composing.current &&
          latest.current === frozen.text && savedDraft.current === frozen.durable;
      } };
    };

    if (beforeLeave) beforeLeave.current = prepare;
    return () => { mounted.current = false; window.removeEventListener('wonffice:feedback-host-change', change); window.removeEventListener('beforeunload', unload); if (beforeLeave?.current === prepare) beforeLeave.current = undefined; };
  }, [identity, repository, generation]);
  const refresh = async () => { const value = await repository.read(projectId); if (!owns()) throw new Error('문서가 바뀌었습니다.'); setSnapshot(value); return value; };
  const requestWork = async (commentId: string, body: string) => {
    if (address.product === 'word' && repository.feedbackRecovery) {
      const current = await repository.read(projectId); requireOwn();
      const comment = current?.record.comments.find(one => one.id === commentId);
      const host = productFeedbackHost();
      if (!comment || comment.target.kind !== 'word-comment' || host?.product !== 'word' || host.id() !== address.id || !host.editable() || host.committedComment?.(comment.target, body) !== 'located') throw new Error('원래 댓글과 대상 영역을 확인하지 못했습니다. 입력을 유지합니다.');
      await repository.feedbackRecovery.begin(projectId, { documentId: address.id, resultId: comment.resultId, target: comment.target, body, requestWork: true }); requireOwn();
      const fingerprint = await host.commentFingerprint?.(comment.target, body); requireOwn();
      if (!fingerprint) throw new Error('원본 상태가 바뀌었습니다. 새 요청을 만들지 않습니다.');
      await repository.feedbackRecovery.nativeSnapshot(projectId, address.id, fingerprint); requireOwn();
      const stored = await repository.feedbackRecovery.request(projectId, address.id, commentId, body); requireOwn();
      await repository.feedbackRecovery.clear(projectId, address.id); requireOwn();
      setRecovery(null); setSnapshot(stored); await refresh(); return;
    }
    if (pendingRequest.current && pendingRequest.current.commentId !== commentId) throw new Error('저장 응답을 확인 중인 수정 요청이 있습니다. 같은 요청을 먼저 확인하세요.');
    if (!pendingRequest.current) {
      const current = await repository.read(projectId); requireOwn();
      if (!current) throw new Error('프로젝트가 없습니다.');
      pendingRequest.current = { record: requestProjectWork(current.record, commentId, body), revision: current.revision, commentId };
    }
    const frozen = pendingRequest.current;
    let stored: ProjectSnapshot;
    try { stored = await repository.save(frozen.record, frozen.revision); }
    catch (cause) {
      if (owns() && cause instanceof Error && 'code' in cause && cause.code === 'project_revision_conflict') pendingRequest.current = undefined;
      throw cause;
    }
    requireOwn();
    pendingRequest.current = undefined; setSnapshot(stored);
  };
  const start = async () => {
    if (recovery) throw new Error('이전 저장 응답을 먼저 확인하세요. 의견 초안은 유지합니다.');
    const host = productFeedbackHost();
    if (host && (host.product !== address.product || host.id() !== address.id || !host.editable())) throw new Error('현재 문서에 의견을 남길 권한이 없습니다.');
    const prepared = menuCapture.current; menuCapture.current = undefined;
    if (prepared && (prepared.host !== host || prepared.generation !== generation || !owns())) throw new Error('문서 또는 선택 영역이 바뀌었습니다. 대상 영역을 다시 선택하세요.');
    const captured = host ? prepared ? prepared.target : host.capture() : { kind: 'document' as const, id: address.id, quote: '' };
    if (!captured) throw new Error('이 선택 영역은 아직 의견 연결을 지원하지 않습니다. 한 문단의 텍스트를 선택하세요.');
    if (!noteTask && !await prepareProductNavigation() || !owns()) throw new Error('마지막 입력을 저장하지 못했습니다.');
    await refresh();
    if (host && (host !== productFeedbackHost() || !host.ownsCapture?.(captured))) throw new Error('선택 영역이 바뀌었습니다. 의견 초안은 유지합니다. 대상 영역을 다시 선택하세요.');
    const capturedSource = await repository.pin(address);
    if (!owns() || (host && !host.ownsCapture?.(captured))) throw new Error('선택 영역이 바뀌었습니다. 대상 영역을 다시 선택하세요.');
    capturedPin.current = capturedSource; pendingComment.current = undefined; pendingActivity.current = undefined; successfulNative.current = undefined; setTarget(captured); setExcerpt(host?.excerpt?.(captured) ?? []); setOpen(true);
  };
  const submit = async (request: boolean) => {
    if (!result || !target || composing.current || !draft.trim()) throw new Error('대상과 의견을 확인하세요.');
    const submittedDraft = draft, submittedBody = draft.trim();
    await saveDraft(); requireOwn();
    const ready = await repository.read(projectId);
    if (!owns() || !ready || ready.record.archived || !ready.record.results.some(one => one.id === result.id && one.document.product === address.product && one.document.id === address.id)) throw new Error('프로젝트 또는 결과물 연결이 바뀌었습니다. 의견 초안은 유지합니다.');
    const native = productFeedbackHost();
    const currentSave = target.kind === 'word-comment' ? captureProductNavigation() : undefined;
    const durable = target.kind === 'word-comment' ? repository.feedbackRecovery : undefined;
    if (durable) { await durable.begin(projectId, { documentId: address.id, resultId: result.id, target, body: submittedBody, requestWork: request }); requireOwn(); }
    if (target.kind === 'word-comment') {
      if (!native || native.product !== address.product || native.id() !== address.id || !native.editable()) throw new Error('현재 문서에 의견을 남길 권한이 없습니다.');
      if (!successfulNative.current) { const savedTarget = await native.comment(target, submittedBody); requireOwn(); successfulNative.current = savedTarget; }
      if (durable) {
        const fingerprint = await native.commentFingerprint?.(target, submittedBody); requireOwn();
        if (!fingerprint) throw new Error('원래 댓글의 저장 상태를 확인하지 못했습니다. 입력을 유지합니다.');
        await durable.nativeSnapshot(projectId, address.id, fingerprint); requireOwn();
      }
    }
    if (target.kind === 'note-paragraph' && (!native || native.product !== 'note' || native.id() !== address.id || !native.ownsCapture?.(target))) throw new Error(t('workspace.task.captureRetired'));
    if (target.kind !== 'note-paragraph') {
      const nativeCurrent = () => owns() && !!native && native === productFeedbackHost() &&
        native.product === address.product && native.id() === address.id && native.editable();
      const saved = currentSave?.saveCurrentSnapshot
        ? currentSave.product === 'word' && currentSave.id === address.id && await currentSave.saveCurrentSnapshot(nativeCurrent)
        : await prepareProductNavigation();
      if (!saved || !owns()) throw new Error('원본 댓글을 저장하지 못했습니다. 입력한 의견을 유지합니다.');
    } else requireOwn();
    const pin = pendingComment.current?.pin ?? (target.kind === 'word-comment' ? await repository.pin(address) : capturedPin.current);
    requireOwn(); if (!pin) throw new Error('의견의 원본 버전을 다시 확인하세요.');
    if (durable) {
      const stored = await durable.comment(projectId, address.id, pin); requireOwn();
      const inserted = stored.record.comments.find(one => one.id === stored.commentId || one.target.id === target.id && one.target.kind === 'word-comment');
      if (!inserted) throw new Error('저장한 의견의 식별자를 확인하지 못했습니다.');
      if (request) { await durable.request(projectId, address.id, inserted.id, submittedBody); requireOwn(); }
      await durable.clear(projectId, address.id); requireOwn(); setRecovery(null);
      if (!composing.current && latest.current === submittedDraft) { latest.current = ''; setDraft(''); }
      await saveDraft(); requireOwn(); await refresh(); setTarget(undefined); setExcerpt([]); successfulNative.current = undefined; pendingComment.current = undefined; return;
    }
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
      await requestWork(persisted.id, submittedBody);
    } else { const stored = await repository.read(projectId); requireOwn(); setSnapshot(stored); }
    if (!composing.current && latest.current === submittedDraft) { latest.current = ''; setDraft(''); }
    await saveDraft(); requireOwn(); setTarget(undefined); setExcerpt([]); successfulNative.current = undefined; pendingComment.current = undefined;
  };
  const cancelRecovery = async () => {
    const durable = repository.feedbackRecovery;
    if (!durable?.cancel || composing.current) return;
    const pending = await durable.read(projectId, address.id); requireOwn();
    if (!pending) { setRecovery(null); return; }
    const host = productFeedbackHost();
    if (pending.phase !== 'native' || pending.nativeHash || pending.commentId || host?.product !== 'word' || host.id() !== address.id ||
      !host.editable() || host.commentAbsent?.(pending.target) !== true) throw new Error('원본 댓글 또는 미확인 저장이 남아 있습니다. 이전 요청을 취소하지 않습니다.');
    await durable.cancel(projectId, address.id, pending.target.id); requireOwn();
    setRecovery(null); setTarget(undefined); setExcerpt([]); successfulNative.current = undefined; pendingComment.current = undefined;
    setError('이전 요청을 취소했습니다. 초안은 유지합니다. 대상 영역을 다시 선택하세요.');
  };
  const recover = async () => {
    const durable = repository.feedbackRecovery;
    if (!durable || composing.current || !recovery) return;
    const pending = await durable.read(projectId, address.id); requireOwn();
    if (!pending) { setRecovery(null); await refresh(); return; }
    const host = productFeedbackHost();
    const state = host?.product === 'word' && host.id() === address.id && host.editable() ? host.committedComment?.(pending.target, pending.body) : 'missing';
    if (state !== 'located') throw new Error(state === 'ambiguous' ? '원래 대상이 중복되어 저장을 이어가지 않습니다. 초안을 유지합니다.' : state === 'changed' ? '원본 댓글 또는 텍스트가 바뀌었습니다. 초안을 유지합니다.' : '원래 댓글을 찾지 못했습니다. 이전 선택으로 새 댓글을 만들지 않습니다. 초안을 유지합니다.');
    const fingerprint = await host!.commentFingerprint?.(pending.target, pending.body); requireOwn();
    if (!pending.nativeHash || fingerprint !== pending.nativeHash) throw new Error('미확인 저장 이후 원본이 바뀌었습니다. 같은 요청을 다시 만들지 않습니다. 초안을 유지합니다.');
    if (!await prepareProductNavigation() || !owns()) throw new Error('원본 저장 응답을 확인하지 못했습니다. 초안을 유지합니다.');
    const pin = await repository.pin(address); requireOwn();
    const stored = await durable.comment(projectId, address.id, pin); requireOwn();
    const comment = stored.record.comments.find(one => one.id === stored.commentId || one.target.kind === 'word-comment' && one.target.id === pending.target.id);
    if (!comment) throw new Error('원래 의견의 저장 응답을 확인하지 못했습니다.');
    if (pending.requestWork || pending.phase === 'request') { await durable.request(projectId, address.id, comment.id, pending.body); requireOwn(); }
    await durable.clear(projectId, address.id); requireOwn(); setRecovery(null);
    if (!composing.current && latest.current.trim() === pending.body) { latest.current = ''; setDraft(''); }
    await saveDraft(); requireOwn(); await refresh(); setTarget(undefined); setExcerpt([]); successfulNative.current = undefined; pendingComment.current = undefined;
  };
  const comments = snapshot?.record.comments.filter(one => one.resultId === result?.id) ?? [];
  return <>
    {result && noteTask && <span ref={menuAnchor}><IconButton label={t('workspace.task.open')} pressed={open} onClick={() => setOpen(value => !value)}><Icon name="comments" /></IconButton></span>}
    {result && !noteTask && <span ref={menuAnchor} className="ow-project-feedback-controls" onPointerDownCapture={event => {
      const trigger = (event.target as HTMLElement).closest('[data-menu="document"]');
      if (event.button === 0 && trigger?.getAttribute('aria-expanded') === 'false') captureMenuSelection();
    }} onKeyDownCapture={event => {
      if (event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229) return;
      const trigger = (event.target as HTMLElement).closest('[data-menu="document"]');
      if (['Enter', ' ', 'ArrowDown'].includes(event.key) && trigger?.getAttribute('aria-expanded') === 'false') captureMenuSelection();
    }}><DocumentMenu label={t('workspace.feedback.menu')} icon={<Icon name="comments" />} menus={[
      { id: 'feedback', label: t('workspace.feedback.section'), blocks: [{ id: 'feedback', items: [
        { id: 'feedback.add', label: t('workspace.feedback.add'), disabled: busy || !repository.writable || !!snapshot?.record.archived },
        { id: 'feedback.list', label: t('workspace.feedback.count', { count: comments.length }), checked: open }
      ] }] },
      ...(hasReading ? [{ id: 'view', label: t('workspace.feedback.view'), blocks: [{ id: 'view', items: [
        { id: 'feedback.reading', label: t(reading ? 'workspace.feedback.edit' : 'workspace.feedback.read'), disabled: busy, checked: reading }
      ] }] }] : [])
    ]} onPick={id => {
      if (id === 'feedback.add') void perform(start);
      else if (id === 'feedback.list') setOpen(value => !value);
      else if (id === 'feedback.reading') void perform(async () => {
        const host = productFeedbackHost(); if (host?.product !== address.product || host.id() !== address.id) return;
        if (reading && !await prepareProductNavigation()) throw new Error('직접 편집 전에 원본 저장을 확인하지 못했습니다.');
        requireOwn(); if (host !== productFeedbackHost()) throw new Error('문서가 바뀌었습니다. 다시 여세요.');
        const next = !reading; host.reading?.(next); setReading(next);
      });
    }} /></span>}
    {error && !open && <span role="alert">{error}</span>}
    {open && <aside className={`ow-feedback-panel${noteTask ? ' ow-note-task-panel' : ''}`} aria-label={noteTask ? t('workspace.task.open') : '프로젝트 의견'}><header><h2>{noteTask ? t('workspace.task.open') : '프로젝트 의견'}</h2><IconButton label={noteTask ? t('workspace.task.close') : '의견 닫기'} onClick={() => void perform(async () => { await saveDraft(); requireOwn(); setOpen(false); restoreMenuFocus(); })}><Icon name="close" /></IconButton></header>
      {recovery && <div className="ow-feedback-recovery"><StatusNotice tone="warning" title="저장 응답을 확인해야 합니다">원래 댓글과 같은 요청만 확인합니다. 초안은 유지합니다.</StatusNotice><Button disabled={busy || !repository.writable} onClick={() => void perform(recover)}>저장 응답 확인</Button>{recovery.phase === 'native' && !recovery.nativeHash && !recovery.commentId && repository.feedbackRecovery?.cancel && <Button disabled={busy || !repository.writable} onClick={() => void perform(cancelRecovery)}>이전 요청 취소하고 대상 다시 선택</Button>}</div>}
      {noteTask && <div className="ow-note-task-intro"><p>{t('workspace.task.captureDescription')}</p>
        <Button disabled={busy || !repository.writable || !!snapshot?.record.archived} onMouseDown={event => { event.preventDefault(); captureMenuSelection(); }}
          onClick={() => void perform(start)}>{t('workspace.task.capture')}</Button></div>}
      {error && <StatusNotice tone="danger" title={noteTask ? t('workspace.task.requestError') : '의견을 저장하지 못했습니다'}>{error}</StatusNotice>}
      {!target && draft && <p className="ow-feedback-note">{noteTask ? t('workspace.task.draftDescription') : '작성 중인 의견을 보관했습니다. 문서의 대상 영역을 선택한 뒤 의견 남기기를 누르세요.'}</p>}
      {(target || draft) && <div className="ow-feedback-composer"><p>{!target ? noteTask ? t('workspace.task.draft') : '보관한 초안' : target.kind === 'document' ? '문서 전체' : noteTask ? t('workspace.task.selection') : '선택한 텍스트 영역'}</p>{target?.quote && <blockquote>{excerpt.length ? excerpt.map((part, index) => <span key={index} style={{ fontWeight: part.bold ? 650 : undefined, fontStyle: part.italic ? 'italic' : undefined, textDecoration: part.underline || part.link ? 'underline' : undefined }} className={part.link ? 'ow-feedback-excerpt-link' : undefined}>{part.text}</span>) : target.quote}</blockquote>}
        {target && capturedPin.current && <small className="ow-feedback-note">{capturedPin.current.title} · {noteTask ? t('workspace.task.version') : '버전'} {capturedPin.current.revision}</small>}
        <textarea ref={inputElement} aria-label={noteTask ? t('workspace.task.requestInput') : '프로젝트 의견 입력'} disabled={inputLifetime.retired || !owns()} value={draft} onChange={event => { if (inputLifetime.retired || !owns()) { event.currentTarget.value = latest.current; return; } const text = event.target.value; inputVersion.current++; latest.current = text; setDraft(text); void saveDraft().catch(cause => owns() && setError(cause instanceof Error ? cause.message : '초안을 저장하지 못했습니다.')); }} onCompositionStart={() => { if (inputLifetime.retired || !owns()) return; inputVersion.current++; composing.current = true; }} onCompositionEnd={() => { if (inputLifetime.retired || !owns()) return; composing.current = false; }} onKeyDown={event => {
          if (inputLifetime.retired || !owns()) { event.preventDefault(); return; }
          if (composing.current || event.nativeEvent.isComposing || event.keyCode === 229) { if (event.key === 'Enter' || event.key === 'Escape') event.stopPropagation(); return; }
          if (event.key === 'Escape') { event.stopPropagation(); void perform(async () => { await saveDraft(); requireOwn(); setOpen(false); restoreMenuFocus(); }); }
        }} />
        <div className="ow-actions">{!noteTask && <Button disabled={busy || !!recovery || !target || !draft.trim()} onClick={() => void perform(() => submit(false))}>댓글만 남기기</Button>}<Button tone="accent" disabled={busy || !!recovery || !target || !draft.trim()} onClick={() => void perform(() => submit(true))}>{noteTask ? t('workspace.task.submit') : '수정 요청'}</Button></div><p className="ow-feedback-note">{noteTask ? t('workspace.task.requestDescription') : '수정 요청은 작업을 연결합니다. 모델 실행과 원본 변경 승인은 별도 단계입니다.'}</p>
      </div>}
      {comments.map(comment => <article className="ow-feedback-thread" key={comment.id}><small>{comment.actor.label} · {noteTask ? t('workspace.task.version') : '버전'} {comment.pin.revision}</small><p>{comment.body}</p>
        <Button disabled={busy} onClick={() => { const host = productFeedbackHost(); if (comment.target.kind === 'document') return; const state = host?.product === address.product && host.id() === address.id ? host.locate(comment.target) : 'missing'; if (state !== 'located') setError(state === 'ambiguous' ? '대상 영역이 중복되어 이동하지 않습니다.' : '대상 영역을 찾을 수 없습니다.'); }}>{noteTask ? t('workspace.task.locate') : '대상 영역'}</Button>
        <Button disabled={busy} onClick={() => void perform(async () => { if (viewing === comment.id) { setViewing(undefined); return; } const stored = await repository.readPin(projectId, comment.pin.id); requireOwn(); setSource(stored); setViewing(comment.id); })}>{noteTask ? t('workspace.task.source') : '참고한 버전'}</Button>
        <Button disabled={busy || !repository.writable || !!comment.workId} onClick={() => void perform(() => requestWork(comment.id, comment.body))}>{comment.workId ? noteTask ? t('workspace.task.linked') : '작업에 연결됨' : noteTask ? t('workspace.task.link') : '수정 작업 연결'}</Button>
        {comment.workId && snapshot && <ConnectedWorkControl repository={repository} project={projectId} work={comment.workId} revision={snapshot.revision} document={address} results={snapshot.record.results} />}{viewing === comment.id && source && <PinnedSource pin={source} />}
      </article>)}
    </aside>}
  </>;
}
