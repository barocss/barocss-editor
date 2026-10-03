import { readProjectRecord, type ProjectRecord, type Pin, type ProjectExecution } from '@barocss/shared';
import type { ProjectRepository, ProjectSnapshot, ProjectDocument, WordFeedbackRecovery } from '@barocss/office-workspace/project';
import { captureAuthorizedFetch, listSnapshotDocuments, type TenantRole, type SnapshotProduct } from './auth-client';

type Action = Record<string, unknown>;
export class ProjectRevisionConflict extends Error { readonly code = 'project_revision_conflict'; }
const equal = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
export function serverProjectRepository(tenant: string, workspace: string, role: TenantRole): ProjectRepository {
  const requestFetch = captureAuthorizedFetch();
  const base = `/api/v1/tenants/${tenant}/projects`;
  const records = new Map<string, ProjectSnapshot>();
  const sources = new Map<string, { documentId: string; revision: number; snapshotHash: string }>();
  const receipts = new Map<string, string>();
  const pendingOperations = new Map<string, { expectedRevision: number; idempotencyKey: string; action: Action; commentBefore: string[]; frozenRequest?: { projectId: string; recordText: string } }>();
  let actorId = '';
  const request = async (path: string, init?: RequestInit) => {
    const response = await requestFetch(new URL(path, location.origin).href, init);
    if (!response.ok) {
      const raw = await response.json().catch(() => ({}));
      if (response.status === 409 && raw.status === 'revision_conflict') throw new ProjectRevisionConflict('다른 변경이 먼저 저장되었습니다. 입력을 유지하고 프로젝트를 다시 불러온 뒤 저장하세요.');
      if (response.status === 409) throw new Error('대상 또는 참고 버전이 바뀌었습니다. 보관한 입력을 유지하고 원본을 다시 확인하세요.');
      throw new Error(raw.status === 'source_unavailable' ? '원본 버전에 접근할 수 없습니다.' : '프로젝트 작업을 완료하지 못했습니다. 서버 상태를 확인하세요.');
    }
    return response.json();
  };
  const view = (value: unknown): ProjectSnapshot => {
    const raw = value as { tenantId?: unknown; workspaceId?: unknown; actor?: { kind?: unknown; id?: unknown }; project?: { revision?: unknown; record?: unknown } } | null;
    if (!raw || raw.tenantId !== tenant || raw.workspaceId !== workspace || !raw.actor || raw.actor.kind !== 'human' || typeof raw.actor.id !== 'string' || !Number.isSafeInteger(raw.project?.revision)) throw new Error('프로젝트 응답을 확인하지 못했습니다.');
    actorId = raw.actor.id;
    const record = readProjectRecord(raw.project!.record);
    // Only the current verified member's persisted drafts enter the composer.
    record.drafts = Object.fromEntries(Object.entries(record.drafts).filter(([key]) => key.startsWith(`${actorId}:`)).map(([key, value]) => [key.slice(actorId.length + 1), value]));
    const snapshot = { record, revision: raw.project!.revision as number }; records.set(record.id, structuredClone(snapshot)); return snapshot;
  };
  const post = (path: string, body: unknown, method = 'POST') => request(path, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const executionPath = (project: string, work: string) => `${base}/${project}/works/${work}/execution`;
  const executionView = (value: unknown, project: string, work: string): ProjectExecution | null => {
    const execution = (value as { execution?: ProjectExecution } | null)?.execution;
    if (execution === null) return null;
    if (!execution || execution.tenantId !== tenant || execution.workspaceId !== workspace || execution.projectId !== project || execution.workId !== work ||
      !['unknown', 'proposal', 'blocked', 'failed', 'accepted', 'applied', 'rejected', 'unsupported'].includes(execution.phase) ||
      typeof execution.id !== 'string' || typeof execution.input?.snapshotText !== 'string') throw new Error('실행 기록을 확인하지 못했습니다.');
    return execution;
  };
  const executionPost = async (project: string, work: string, path: string, body: unknown) => {
    const execution = executionView(await post(`${executionPath(project, work)}${path}`, body), project, work);
    if (!execution) throw new Error('실행 기록이 없습니다.'); return execution;
  };
  const getSource = async (pin: Pin) => {
    const known = sources.get(pin.id); if (known) return known;
    const raw = await request(`/api/v1/tenants/${tenant}/documents/${pin.document.id}`);
    if (raw.document?.workspaceId !== workspace || raw.document?.product !== pin.document.product || raw.document?.revision !== pin.revision || raw.snapshotText !== pin.text) throw new Error('참고 원본이 바뀌었습니다. 기존 버전을 유지하고 다시 확인하세요.');
    const bytes = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(pin.text)));
    return { documentId: pin.document.id, revision: pin.revision, snapshotHash: Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('') };
  };
  const transmit = async (signature: string, operation: NonNullable<ReturnType<typeof pendingOperations.get>>, projectId: string) => {
    let saved: ProjectSnapshot;
    try { saved = view(await post(`${base}/${projectId}`, { expectedRevision: operation.expectedRevision, idempotencyKey: operation.idempotencyKey, action: operation.action }, 'PATCH')); }
    catch (cause) {
      // A confirmed CAS rejection committed nothing. A later explicit retry may use the freshly read revision.
      // Unknown transport/acknowledgement failures must keep the original receipt and payload.
      if (cause instanceof ProjectRevisionConflict) pendingOperations.delete(signature);
      throw cause;
    }
    if (operation.action.type === 'comment') {
      const created = saved.record.comments.filter(one => !operation.commentBefore.includes(one.id));
      if (created.length !== 1) throw new Error('의견 저장 결과를 확인하지 못했습니다.');
      return { ...saved, commentId: created[0].id };
    }
    if (operation.action.type === 'request') pendingOperations.delete(signature);
    return saved;
  };
  const save = async (next: ProjectRecord, revision: number) => {
    // Only an explicit retry of the exact captured request may recover an unknown ACK.
    // A refreshed cache can contain its canonical work and a later project revision.
    const recordText = JSON.stringify(next);
    for (const [signature, operation] of pendingOperations) {
      if (operation.action.type === 'request' && operation.expectedRevision === revision &&
        operation.frozenRequest?.projectId === next.id && operation.frozenRequest.recordText === recordText) {
        return transmit(signature, operation, next.id);
      }
    }
    const previous = records.get(next.id);
    if (!previous || previous.revision !== revision) throw new Error('프로젝트 버전을 다시 확인하세요.');
    const old = previous.record;
    let action: Action | undefined;
    if (next.title !== old.title || next.goal !== old.goal || next.archived !== old.archived) action = { type: 'metadata', title: next.title, goal: next.goal, archived: next.archived };
    else if (next.results.length > old.results.length) { const one = next.results.find(row => !old.results.some(oldRow => oldRow.id === row.id)); if (one) action = { type: 'link-result', name: one.name, document: one.document }; }
    else if (next.results.length < old.results.length) { const one = old.results.find(row => !next.results.some(newRow => newRow.id === row.id)); if (one) action = { type: 'unlink-result', resultId: one.id }; }
    else if (next.comments.length > old.comments.length) { const one = next.comments.find(row => !old.comments.some(oldRow => oldRow.id === row.id)); if (one) action = { type: 'comment', resultId: one.resultId, target: one.target, body: one.body, source: await getSource(one.pin) }; }
    else if (next.works.length > old.works.length) { const one = next.works.find(row => !old.works.some(oldRow => oldRow.id === row.id)); if (one) action = { type: 'request', commentId: one.commentId, request: one.request }; }
    else {
      const paused = next.works.find(row => row.state !== old.works.find(oldRow => oldRow.id === row.id)?.state);
      const draft = Object.keys(next.drafts).find(key => next.drafts[key] !== old.drafts[key]);
      const pinned = next.results.find(row => row.inputs.length > (old.results.find(oldRow => oldRow.id === row.id)?.inputs.length ?? 0));
      if (paused) action = { type: 'pause', workId: paused.id, paused: paused.state === 'paused' };
      else if (draft) action = { type: 'draft', key: draft, text: next.drafts[draft] };
      else if (pinned) { const pin = pinned.inputs.find(one => !old.results.find(row => row.id === pinned.id)?.inputs.some(oldPin => oldPin.id === one.id)); if (pin) action = { type: 'pin-input', resultId: pinned.id, source: await getSource(pin), ...(pinned.request ? { requestId: pinned.request } : {}) }; }
    }
    if (!action) { if (equal(old, next)) return previous; throw new Error('지원하지 않는 프로젝트 변경입니다.'); }
    const newComment = next.comments.find(one => !old.comments.some(before => before.id === one.id));
    const signature = action.type === 'comment' && newComment
      ? `comment:${next.id}:${newComment.id}` : JSON.stringify({ id: next.id, revision, action });
    const operation = pendingOperations.get(signature) ?? { expectedRevision: revision, idempotencyKey: crypto.randomUUID(), action, commentBefore: old.comments.map(one => one.id), ...(action.type === 'request' ? { frozenRequest: { projectId: next.id, recordText } } : {}) };
    if (operation.action.type === 'request' && operation.frozenRequest?.recordText !== recordText) throw new Error('보관한 요청 입력을 다시 확인하세요.');
    pendingOperations.set(signature, operation);
    return transmit(signature, operation, next.id);
  };
  type RecoveryEnvelope = { expectedRevision: number; idempotencyKey: string; action: Action };
  type RecoveryMeta = { schemaVersion: 1; generation: string; bodyHash: string; quoteHash: string; actorId: string; documentId: string; resultId: string;
    target: { kind: 'word-comment'; id: string }; phase: WordFeedbackRecovery['phase']; requestWork: boolean;
    nativeHash?: string; commentId?: string; envelope?: RecoveryEnvelope };
  const recoveryKeys = (documentId: string) => {
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/.test(documentId)) throw new Error('복구 문서 식별자를 확인하세요.');
    return { body: `word-feedback:${documentId}:body`, quote: `word-feedback:${documentId}:quote`, meta: `word-feedback:${documentId}:meta` };
  };
  const recoveryError = () => new Error('보관한 의견 복구 기록을 확인하세요.');
  const boundedText = (value: unknown, empty = false): value is string => typeof value === 'string' &&
    [...value].length <= 8000 && (empty || !!value.trim()) && ![...value].some(char => char.charCodeAt(0) < 32 && !'\t\n\r'.includes(char));
  const exactKeys = (value: object, keys: string[]) => Object.keys(value).every(key => keys.includes(key));
  const recoveryHash = async (text: string) => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))), one => one.toString(16).padStart(2, '0')).join('');
  const readRecovery = async (project: string, documentId: string) => {
    const snapshot = view(await request(`${base}/${project}`)), keys = recoveryKeys(documentId);
    const raw = snapshot.record.drafts[keys.meta]; if (!raw) return { snapshot, pending: null };
    let meta: RecoveryMeta;
    try { meta = JSON.parse(raw); } catch { throw recoveryError(); }
    const body = snapshot.record.drafts[keys.body], quote = snapshot.record.drafts[keys.quote] ?? '';
    if (!meta || !exactKeys(meta, ['schemaVersion', 'generation', 'bodyHash', 'quoteHash', 'actorId', 'documentId', 'resultId', 'target', 'phase', 'requestWork', 'nativeHash', 'commentId', 'envelope']) ||
      meta.schemaVersion !== 1 || typeof meta.generation !== 'string' || !/^[a-f0-9-]{36}$/.test(meta.generation) ||
      !/^[a-f0-9]{64}$/.test(meta.bodyHash) || !/^[a-f0-9]{64}$/.test(meta.quoteHash) || meta.actorId !== actorId || meta.documentId !== documentId || typeof meta.resultId !== 'string' ||
      !meta.target || !exactKeys(meta.target, ['kind', 'id']) || meta.target.kind !== 'word-comment' || typeof meta.target.id !== 'string' || !meta.target.id ||
      !['native', 'comment', 'request'].includes(meta.phase) || typeof meta.requestWork !== 'boolean' ||
      (meta.nativeHash !== undefined && !/^[a-f0-9]{64}$/.test(meta.nativeHash)) ||
      (meta.commentId !== undefined && typeof meta.commentId !== 'string') || !boundedText(body) || !boundedText(quote, true)) throw recoveryError();
    if (await recoveryHash(body) !== meta.bodyHash || await recoveryHash(quote) !== meta.quoteHash) throw recoveryError();
    const result = snapshot.record.results.find(one => one.id === meta.resultId);
    if (!result || result.document.product !== 'word' || result.document.id !== documentId) throw recoveryError();
    if (meta.envelope) {
      const e = meta.envelope, a = e.action;
      if (!exactKeys(e, ['expectedRevision', 'idempotencyKey', 'action']) || !Number.isSafeInteger(e.expectedRevision) || e.expectedRevision < 1 ||
        typeof e.idempotencyKey !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,119}$/.test(e.idempotencyKey) || !a || typeof a !== 'object') throw recoveryError();
      if (meta.phase === 'comment') {
        const source = a.source as { documentId: string; revision: number; snapshotHash: string } | undefined;
        if (!exactKeys(a, ['type', 'resultId', 'target', 'source']) || a.type !== 'comment' || a.resultId !== meta.resultId || !equal(a.target, meta.target) ||
          !source || !exactKeys(source, ['documentId', 'revision', 'snapshotHash']) || source.documentId !== documentId ||
          !Number.isSafeInteger(source.revision) || source.revision < 1 || !/^[a-f0-9]{64}$/.test(source.snapshotHash)) throw recoveryError();
      } else if (meta.phase !== 'request' || !exactKeys(a, ['type', 'commentId']) || a.type !== 'request' || a.commentId !== meta.commentId) throw recoveryError();
    }
    return { snapshot, pending: { meta, body, quote } };
  };
  const writeRecoveryDraft = async (project: string, key: string, text: string, guard?: { metaKey: string; expected: string }) => {
    if (!boundedText(text, true)) throw recoveryError();
    const current = view(await request(`${base}/${project}`));
    if (guard && (current.record.drafts[guard.metaKey] ?? '') !== guard.expected && (key !== guard.metaKey || current.record.drafts[key] !== text)) throw recoveryError();
    if ((current.record.drafts[key] ?? '') === text) return current;
    try { return view(await post(`${base}/${project}`, { expectedRevision: current.revision, idempotencyKey: crypto.randomUUID(), action: { type: 'draft', key, text } }, 'PATCH')); }
    catch (cause) {
      if (cause instanceof ProjectRevisionConflict) throw cause;
      // A lost preparation ACK cannot authorize an effect until the server confirms the exact draft.
      const verified = view(await request(`${base}/${project}`));
      if ((verified.record.drafts[key] ?? '') !== text) throw cause;
      return verified;
    }
  };
  const persistRecovery = async (project: string, meta: RecoveryMeta, previous?: RecoveryMeta) => {
    const raw = JSON.stringify(meta), metaKey = recoveryKeys(meta.documentId).meta;
    await writeRecoveryDraft(project, metaKey, raw, { metaKey, expected: previous ? JSON.stringify(previous) : '' });
    const checked = await readRecovery(project, meta.documentId);
    if (!checked.pending || !equal(checked.pending.meta, meta) ||
      (meta.envelope && checked.snapshot.revision < meta.envelope.expectedRevision)) throw recoveryError();
    return checked;
  };
  const prepareRecovery = async (project: string, meta: RecoveryMeta, action: Action) => {
    const captured = await readRecovery(project, meta.documentId);
    if (!captured.pending || !equal({ ...captured.pending.meta, phase: meta.phase, commentId: meta.commentId }, meta)) throw recoveryError();
    const current = captured.snapshot;
    const prepared: RecoveryMeta = { ...meta, envelope: { expectedRevision: current.revision + 1, idempotencyKey: crypto.randomUUID(), action } };
    // Preparation and its future action are bound to this exact CAS; do not infer a future revision.
    const text = JSON.stringify(prepared); if (!boundedText(text)) throw recoveryError();
    try { view(await post(`${base}/${project}`, { expectedRevision: current.revision, idempotencyKey: crypto.randomUUID(), action: { type: 'draft', key: recoveryKeys(meta.documentId).meta, text } }, 'PATCH')); }
    catch (cause) {
      if (cause instanceof ProjectRevisionConflict) throw cause;
      const verified = await readRecovery(project, meta.documentId);
      if (!verified.pending || !equal(verified.pending.meta, prepared) || verified.snapshot.revision < prepared.envelope!.expectedRevision) throw cause;
    }
    const verified = await readRecovery(project, meta.documentId);
    if (!verified.pending || !equal(verified.pending.meta, prepared) || verified.snapshot.revision < prepared.envelope!.expectedRevision) throw recoveryError();
    return verified.pending;
  };
  const recoveryComment = (snapshot: ProjectSnapshot, meta: RecoveryMeta, body: string, quote: string, commentId?: string) => {
    const matches = snapshot.record.comments.filter(one => (!commentId || one.id === commentId) && one.actor.kind === 'human' && one.actor.id === actorId &&
      one.resultId === meta.resultId && equal(one.target, { ...meta.target, quote }) && one.body === body &&
      one.pin.document.product === 'word' && one.pin.document.id === meta.documentId);
    if (matches.length !== 1) throw recoveryError(); return matches[0]!;
  };
  const transmitRecovery = async (project: string, pending: { meta: RecoveryMeta; body: string; quote: string }) => {
    const { meta, body, quote } = pending, e = meta.envelope!;
    const action = e.action.type === 'comment' ? { ...e.action, target: { ...meta.target, quote }, body } : { ...e.action, request: body };
    try { return view(await post(`${base}/${project}`, { expectedRevision: e.expectedRevision, idempotencyKey: e.idempotencyKey, action }, 'PATCH')); }
    catch (cause) {
      if (cause instanceof ProjectRevisionConflict) {
        const reset = { ...meta }; delete reset.envelope;
        await persistRecovery(project, { ...reset, phase: meta.phase === 'comment' ? 'native' : 'comment' }, meta);
      }
      throw cause;
    }
  };
  const retireRecovery = async (project: string, documentId: string, snapshot: ProjectSnapshot) => {
    // One captured CAS retires this generation. Separate buffers stay bounded and private;
    // deleting them later could erase a newer begin. Its hashes must validate before any effect.
    const metaKey = recoveryKeys(documentId).meta;
    try { view(await post(`${base}/${project}`, { expectedRevision: snapshot.revision, idempotencyKey: crypto.randomUUID(), action: { type: 'draft', key: metaKey, text: '' } }, 'PATCH')); }
    catch (cause) {
      if (cause instanceof ProjectRevisionConflict) throw cause;
      const current = view(await request(`${base}/${project}`));
      if (current.record.drafts[metaKey]) throw cause;
    }
  };
  const feedbackRecovery: NonNullable<ProjectRepository['feedbackRecovery']> & { cancel(project: string, documentId: string, targetId: string): Promise<void> } = {
    begin: async (project, intent) => {
      const existing = await readRecovery(project, intent.documentId);
      if (existing.pending) {
        const one = existing.pending;
        if (!equal({ documentId: one.meta.documentId, resultId: one.meta.resultId, target: { ...one.meta.target, quote: one.quote }, body: one.body, requestWork: one.meta.requestWork },
          { ...intent, requestWork: (intent as typeof intent & { requestWork?: boolean }).requestWork ?? false })) throw recoveryError();
        return;
      }
      if (intent.target.kind !== 'word-comment' || !boundedText(intent.body) || intent.body !== intent.body.trim() || !boundedText(intent.target.quote, true)) throw recoveryError();
      const keys = recoveryKeys(intent.documentId);
      const guard = { metaKey: keys.meta, expected: '' };
      await writeRecoveryDraft(project, keys.body, intent.body, guard); await writeRecoveryDraft(project, keys.quote, intent.target.quote, guard);
      await persistRecovery(project, { schemaVersion: 1, generation: crypto.randomUUID(), bodyHash: await recoveryHash(intent.body), quoteHash: await recoveryHash(intent.target.quote), actorId, documentId: intent.documentId, resultId: intent.resultId,
        target: { kind: 'word-comment', id: intent.target.id }, phase: 'native', requestWork: (intent as typeof intent & { requestWork?: boolean }).requestWork ?? false });
    },
    read: async (project, documentId) => {
      const { pending } = await readRecovery(project, documentId); if (!pending) return null;
      return { documentId, resultId: pending.meta.resultId, target: { ...pending.meta.target, quote: pending.quote }, body: pending.body,
        phase: pending.meta.phase, requestWork: pending.meta.requestWork, ...(pending.meta.nativeHash ? { nativeHash: pending.meta.nativeHash } : {}), ...(pending.meta.commentId ? { commentId: pending.meta.commentId } : {}) };
    },
    nativeSnapshot: async (project, documentId, snapshotHash) => {
      const { pending } = await readRecovery(project, documentId);
      if (!pending || !/^[a-f0-9]{64}$/.test(snapshotHash) || (pending.meta.nativeHash && pending.meta.nativeHash !== snapshotHash)) throw recoveryError();
      await persistRecovery(project, { ...pending.meta, nativeHash: snapshotHash }, pending.meta);
    },
    comment: async (project, documentId, pin) => {
      const captured = await readRecovery(project, documentId), snapshot = captured.snapshot; let pending = captured.pending; if (!pending || pin.document.product !== 'word' || pin.document.id !== documentId) throw recoveryError();
      const source = await getSource(pin);
      if (!pending.meta.nativeHash || pending.meta.nativeHash !== source.snapshotHash) throw recoveryError();
      if (pending.meta.phase === 'request' || pending.meta.commentId) {
        const comment = recoveryComment(snapshot, pending.meta, pending.body, pending.quote, pending.meta.commentId);
        if (comment.pin.revision !== pin.revision || comment.pin.text !== pin.text) throw recoveryError();
        return { ...snapshot, commentId: comment.id };
      }
      if (pending.meta.envelope) { if (!equal(pending.meta.envelope.action.source, source)) throw recoveryError(); }
      else pending = await prepareRecovery(project, { ...pending.meta, phase: 'comment' }, { type: 'comment', resultId: pending.meta.resultId, target: pending.meta.target, source });
      const saved = await transmitRecovery(project, pending), comment = recoveryComment(saved, pending.meta, pending.body, pending.quote);
      if (comment.pin.revision !== pin.revision || comment.pin.text !== pin.text) throw recoveryError();
      const done = { ...pending.meta }; delete done.envelope; await persistRecovery(project, { ...done, commentId: comment.id }, pending.meta);
      return { ...saved, commentId: comment.id };
    },
    request: async (project, documentId, commentId, body) => {
      const captured = await readRecovery(project, documentId), snapshot = captured.snapshot; let pending = captured.pending; if (!pending || pending.body !== body) throw recoveryError();
      const comment = recoveryComment(snapshot, pending.meta, body, pending.quote, commentId);
      const source = await getSource(comment.pin);
      if (!pending.meta.nativeHash || pending.meta.nativeHash !== source.snapshotHash) throw recoveryError();
      if (pending.meta.commentId && pending.meta.commentId !== commentId) throw recoveryError();
      if (!pending.meta.envelope || pending.meta.envelope.action.type !== 'request') pending = await prepareRecovery(project,
        { ...pending.meta, phase: 'request', commentId }, { type: 'request', commentId });
      const saved = await transmitRecovery(project, pending), committed = recoveryComment(saved, pending.meta, body, pending.quote, comment.id);
      const works = saved.record.works.filter(one => one.commentId === comment.id && one.request === body && one.id === committed.workId);
      if (works.length !== 1 || !works[0]!.inputs.some(one => one.id === committed.pin.id && one.revision === committed.pin.revision && one.text === committed.pin.text)) throw recoveryError();
      return saved;
    },
    cancel: async (project, documentId, targetId) => {
      const { snapshot, pending } = await readRecovery(project, documentId);
      if (!pending || pending.meta.target.id !== targetId || pending.meta.phase !== 'native' || pending.meta.nativeHash || pending.meta.envelope || pending.meta.commentId ||
        snapshot.record.comments.some(one => one.target.kind === 'word-comment' && one.target.id === targetId)) throw recoveryError();
      await retireRecovery(project, documentId, snapshot);
    },
    clear: async (project, documentId) => {
      const { snapshot, pending } = await readRecovery(project, documentId);
      if (pending) {
        if (!pending.meta.commentId || pending.meta.phase === 'native') throw recoveryError();
        const comment = recoveryComment(snapshot, pending.meta, pending.body, pending.quote, pending.meta.commentId);
        if (pending.meta.phase === 'request' && snapshot.record.works.filter(one => one.commentId === comment.id && one.id === comment.workId && one.request === pending.body).length !== 1) throw recoveryError();
      }
      if (!pending) return;
      await retireRecovery(project, documentId, snapshot);
    }
  };
  return {
    writable: role !== 'viewer', canCreateDocument: false, save, feedbackRecovery,
    execution: async (project, work) => executionView(await request(executionPath(project, work)), project, work),
    execute: (project, work, expectedRevision) => executionPost(project, work, '', { expectedRevision }),
    acceptExecution: (project, work, attempt) => executionPost(project, work, `/${attempt}/accept`, {}),
    acknowledgeExecution: (project, work, attempt, revision, snapshotHash) => executionPost(project, work, `/${attempt}/ack`, { revision, snapshotHash }),
    rejectExecution: (project, work, attempt) => executionPost(project, work, `/${attempt}/reject`, {}),
    list: async () => {
      const results: ProjectSnapshot[] = []; let after: string | null = null;
      do {
        const page = await request(`${base}?${new URLSearchParams({ workspaceId: workspace, ...(after ? { after } : {}) })}`);
        if (!Array.isArray(page.projects)) throw new Error('프로젝트 목록을 확인하지 못했습니다.');
        for (const raw of page.projects) { const one = view(raw); if (results.some(old => old.record.id === one.record.id)) throw new Error('프로젝트 목록이 중복되었습니다.'); results.push(one); }
        if (page.nextCursor === after && after) throw new Error('프로젝트 목록을 끝까지 읽지 못했습니다.');
        after = page.nextCursor ?? null;
      } while (after);
      return results;
    },
    read: async id => view(await request(`${base}/${id}`)),
    create: async (title, goal) => {
      const signature = JSON.stringify({ create: true, workspace, title, goal });
      const idempotencyKey = receipts.get(signature) ?? crypto.randomUUID(); receipts.set(signature, idempotencyKey);
      const created = view(await post(base, { workspaceId: workspace, title, goal, idempotencyKey })); receipts.delete(signature); return created;
    },
    documents: async () => {
      const docs: ProjectDocument[] = [];
      for (const product of ['note', 'word', 'slides'] as SnapshotProduct[]) {
        let after: string | undefined;
        do { const page = await listSnapshotDocuments(tenant, workspace, product, after, requestFetch); docs.push(...page.items.map(one => ({ product, id: one.documentId, title: one.title }))); if (page.nextCursor === after) throw new Error('자료 목록을 끝까지 읽지 못했습니다.'); after = page.nextCursor ?? undefined; } while (after);
      }
      return docs;
    },
    createDocument: async () => { throw new Error('새 인증 자료는 기존 자료함에서 만드세요. Site 인증 편집은 아직 연결되지 않았습니다.'); },
    pin: async document => {
      const raw = await request(`/api/v1/tenants/${tenant}/documents/${document.id}`);
      if (raw.document?.workspaceId !== workspace || raw.document?.product !== document.product || raw.document?.mode !== 'snapshot' || typeof raw.snapshotText !== 'string') throw new Error('저장된 원본을 확인하지 못했습니다.');
      const pin: Pin = { id: crypto.randomUUID(), document, revision: raw.document.revision, text: raw.snapshotText, title: raw.document.title };
      sources.set(pin.id, await getSource(pin)); return pin;
    },
    readPin: async (project, pin) => {
      const raw = await request(`${base}/${project}/pins/${pin}`);
      if (!raw.pin || !['current', 'changed', 'unavailable'].includes(raw.sourceState)) throw new Error('보관한 원본을 확인하지 못했습니다.');
      return { ...raw.pin, sourceState: raw.sourceState };
    }
  };
}
