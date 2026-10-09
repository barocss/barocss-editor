import { createExperimentalNative2NoteReader, type ExperimentalNative2Read } from '../../note/src/experimental-native2-reader';
import { AuthError, captureNative2ReadSession, confirmTenant, listWorkspaces, loadIdentity,
  type Identity, type TenantRole } from './auth-client';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export interface Native2ReadScope { tenantId: string; workspaceId: string; documentId: string }
export interface Native2ReadProvenance {
  readonly issuer: string; readonly subject: string; readonly currentUserId: string | null | undefined;
  readonly tenantId: string; readonly workspaceId: string; readonly documentId: string; readonly role: TenantRole;
}
export interface AuthenticatedNative2Read {
  readonly read: ExperimentalNative2Read;
  readonly provenance: Native2ReadProvenance;
  /** Local lease currentness only. Unobserved server role ABA is not detectable here. */
  readonly isCurrent: () => boolean;
  readonly retire: () => void;
  readonly subscribeRetirement: (callback: () => void) => () => void;
}

/** Terminal subscriptions are local lifetime signals, not server authority evidence. */
function retirementSignal() {
  let retired = false;
  const callbacks = new Set<() => void>();
  const notify = (callback: () => void) => {
    try { callback(); } catch { /* Keep every consumer's retirement independent. */ }
  };
  return {
    isRetired: () => retired,
    retire: () => {
      if (retired) return;
      retired = true;
      const pending = [...callbacks];
      callbacks.clear();
      for (const callback of pending) notify(callback);
    },
    subscribeRetirement: (callback: () => void) => {
      if (retired) { notify(callback); return () => {}; }
      callbacks.add(callback);
      return () => { callbacks.delete(callback); };
    },
  };
}

function requireCurrent(isCurrent: () => boolean): void {
  if (!isCurrent()) throw new AuthError('cancelled', '문서 읽기 요청이 바뀌었습니다. 다시 확인해 주세요.');
}

async function currentScope(tenantId: string, workspaceId: string, isCurrent: () => boolean):
  Promise<{ identity: Identity; role: TenantRole }> {
  requireCurrent(isCurrent);
  const identity = await loadIdentity();
  requireCurrent(isCurrent);
  const listed = identity.tenants.find(tenant => tenant.tenantId === tenantId);
  if (!listed) throw new AuthError('forbidden', '현재 회사 접근 권한이 없습니다.');
  const role = await confirmTenant(tenantId);
  requireCurrent(isCurrent);
  if (role !== listed.role) throw new AuthError('cancelled', '회사 권한이 바뀌었습니다. 다시 확인해 주세요.');

  let after: string | undefined;
  const seen = new Set<string>();
  let found = false;
  for (let page = 0; page < 100; page++) {
    requireCurrent(isCurrent);
    const listing = await listWorkspaces(tenantId, after);
    requireCurrent(isCurrent);
    for (const workspace of listing.items) {
      if (seen.has(workspace.id)) throw new AuthError('unavailable', '작업 공간 목록이 중복되었습니다.');
      seen.add(workspace.id);
      if (workspace.id === workspaceId) found = true;
    }
    if (listing.nextCursor === null) {
      if (!found) throw new AuthError('forbidden', '현재 작업 공간 접근 권한이 없습니다.');
      return { identity, role };
    }
    if (listing.nextCursor === after) throw new AuthError('unavailable', '작업 공간 목록을 끝까지 확인하지 못했습니다.');
    after = listing.nextCursor;
  }
  throw new AuthError('unavailable', '작업 공간 목록을 끝까지 확인하지 못했습니다.');
}

/** One Office-host-private reader per login/host intent. It never installs an editor or grants writing. */
export function createAuthenticatedNative2Reader() {
  const session = captureNative2ReadSession();
  let generation = 0, retired = false;
  const lifetime = retirementSignal();
  let resultLifetime: ReturnType<typeof retirementSignal> | undefined;
  let unsubscribeSession: (() => void) | undefined;
  const retire = () => {
    if (retired) return;
    retired = true;
    ++generation;
    lifetime.retire();
    resultLifetime?.retire();
    resultLifetime = undefined;
    const stopSession = unsubscribeSession;
    unsubscribeSession = undefined;
    stopSession?.();
    session.retire();
  };
  const current = () => {
    if (!retired && !session.isCurrent()) retire();
    return !retired;
  };
  unsubscribeSession = session.subscribeRetirement(retire);
  if (retired) unsubscribeSession();
  const open = async ({ tenantId, workspaceId, documentId }: Native2ReadScope): Promise<AuthenticatedNative2Read> => {
    requireCurrent(current);
    if (![tenantId, workspaceId, documentId].every(value => uuid.test(value))) {
      throw new AuthError('configuration', '잘못된 문서 주소입니다.');
    }
    const requestGeneration = ++generation;
    resultLifetime?.retire();
    resultLifetime = undefined;
    const resultSignal = retirementSignal();
    const isCurrent = () => {
      if (!resultSignal.isRetired() && (!current() || generation !== requestGeneration)) resultSignal.retire();
      return !resultSignal.isRetired();
    };
    const first = await currentScope(tenantId, workspaceId, isCurrent);
    requireCurrent(isCurrent);
    const reader = createExperimentalNative2NoteReader({ tenantId, workspaceId, apiBase: '/api',
      authorizedFetch: async (input, init) => {
        requireCurrent(isCurrent);
        const response = await session.requestFetch(input, init);
        requireCurrent(isCurrent);
        return response;
      }, isCurrent });
    const read = await reader.open(documentId);
    requireCurrent(isCurrent);
    const second = await currentScope(tenantId, workspaceId, isCurrent);
    requireCurrent(isCurrent);
    if (first.identity.issuer !== second.identity.issuer || first.identity.subject !== second.identity.subject ||
      first.identity.currentUserId !== second.identity.currentUserId || first.role !== second.role) {
      throw new AuthError('cancelled', '현재 계정이나 회사 권한이 바뀌었습니다. 다시 확인해 주세요.');
    }
    const provenance: Native2ReadProvenance = Object.freeze({ issuer: second.identity.issuer,
      subject: second.identity.subject, currentUserId: second.identity.currentUserId,
      tenantId, workspaceId, documentId, role: second.role });
    const result: AuthenticatedNative2Read = Object.freeze({ read, provenance, isCurrent,
      retire: resultSignal.retire, subscribeRetirement: (callback: () => void) => {
        isCurrent();
        return resultSignal.subscribeRetirement(callback);
      } });
    requireCurrent(isCurrent);
    resultLifetime = resultSignal;
    return result;
  };
  return Object.freeze({ open, isCurrent: current, retire, subscribeRetirement: (callback: () => void) => {
    current();
    return lifetime.subscribeRetirement(callback);
  } });
}
