import { readProjectRecord, type ProjectRecord, type Pin } from '@barocss/shared';
import type { ProjectRepository, ProjectSnapshot, ProjectDocument } from '@barocss/office-workspace/project';
import { captureAuthorizedFetch, listSnapshotDocuments, type TenantRole, type SnapshotProduct } from './auth-client';

type Action = Record<string, unknown>;
class ProjectRevisionConflict extends Error {}
const equal = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
export function serverProjectRepository(tenant: string, workspace: string, role: TenantRole): ProjectRepository {
  const requestFetch = captureAuthorizedFetch();
  const base = `/api/v1/tenants/${tenant}/projects`;
  const records = new Map<string, ProjectSnapshot>();
  const sources = new Map<string, { documentId: string; revision: number; snapshotHash: string }>();
  const receipts = new Map<string, string>();
  const pendingOperations = new Map<string, { expectedRevision: number; idempotencyKey: string; action: Action; commentBefore: string[] }>();
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
  const getSource = async (pin: Pin) => {
    const known = sources.get(pin.id); if (known) return known;
    const raw = await request(`/api/v1/tenants/${tenant}/documents/${pin.document.id}`);
    if (raw.document?.workspaceId !== workspace || raw.document?.product !== pin.document.product || raw.document?.revision !== pin.revision || raw.snapshotText !== pin.text) throw new Error('참고 원본이 바뀌었습니다. 기존 버전을 유지하고 다시 확인하세요.');
    const bytes = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(pin.text)));
    return { documentId: pin.document.id, revision: pin.revision, snapshotHash: Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('') };
  };
  const save = async (next: ProjectRecord, revision: number) => {
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
    const operation = pendingOperations.get(signature) ?? { expectedRevision: revision, idempotencyKey: crypto.randomUUID(), action, commentBefore: old.comments.map(one => one.id) };
    pendingOperations.set(signature, operation);
    let saved: ProjectSnapshot;
    try { saved = view(await post(`${base}/${next.id}`, { expectedRevision: operation.expectedRevision, idempotencyKey: operation.idempotencyKey, action: operation.action }, 'PATCH')); }
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
    return saved;
  };
  return {
    writable: role !== 'viewer', canCreateDocument: false, save,
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
