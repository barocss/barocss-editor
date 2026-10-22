import { rmSync } from 'node:fs';
import { AccountAuthority } from './account-authority.ts';
import type { AccountTokenClaims } from './account-authority.ts';
import { AccountSheetRelay } from './account-service.ts';
import type { AccountRelayOptions } from './account-service.ts';
import { SheetAccessError, SheetAccessOperationUncertainError } from '../../../../apps/office-service/src/sheet-access-store.ts';
import type { CurrentSheetGrant } from '../../../../apps/office-service/src/sheet-access-store.ts';
import { createWorkbookContext } from '../../src/workbook.ts';
import { bytesToBase64, relayAdmission } from '../../src/sheet-preview-protocol.ts';
import type { SheetRelayAccess, SheetRelayAccountSession, SheetRelayAppendRequest } from '../../src/sheet-preview-protocol.ts';
import { updateHash } from '../../src/durable-store.ts';

export const accountSignal = (): AbortSignal => new AbortController().signal;
export function accountPacket(session: SheetRelayAccountSession, bytes: Uint8Array, updateId: string): SheetRelayAppendRequest {
  return { protocolVersion: 1, context: session.context, admission: relayAdmission(session.context),
    packet: { updateId, bytesBase64: bytesToBase64(bytes), byteLength: bytes.length, sha256: updateHash(bytes) } };
}

/** MODEL OIDC/current-IdP + MODEL PG authority; ACTUAL native relay/SQLite/bootstrap.
 * No network, external IdP, PostgreSQL, or browser is accessed by this fixture.
 */
export function createAccountFixture() {
  const origin = 'http://127.0.0.1:55555', issuer = 'https://sheet-account-model.invalid';
  const users = Object.freeze({ a: '00000000-0000-4000-8000-00000000000a', b: '00000000-0000-4000-8000-00000000000b' });
  const scope = Object.freeze({ tenantId: '00000000-0000-4000-8000-000000000011', workspaceId: '00000000-0000-4000-8000-000000000012', documentId: '00000000-0000-4000-8000-000000000013' });
  const context = createWorkbookContext({ documentId: scope.documentId, workbookId: '00000000-0000-4000-8000-000000000014', generation: '00000000-0000-4000-8000-000000000015' });
  const tokens = Object.freeze({ a: 'modelA.payload.signature', b: 'modelB.payload.signature', aOtherSid: 'modelOtherSid.payload.signature', aRenewed: 'modelRenewed.payload.signature' });
  const now = Date.now(), expiresAt = Math.floor(now / 1000) + 3600;
  const claims = new Map<string, AccountTokenClaims>([
    [tokens.a, { issuer, subject: 'account-a', sessionId: 'model-login-a', expiresAt }],
    [tokens.b, { issuer, subject: 'account-b', sessionId: 'model-login-b', expiresAt }],
    [tokens.aOtherSid, { issuer, subject: 'account-a', sessionId: 'model-login-a-other', expiresAt }],
    [tokens.aRenewed, { issuer, subject: 'account-a', sessionId: 'model-login-a', expiresAt: expiresAt + 3600 }],
  ]);
  const model: {
    now: number; lockHeld: boolean; accessA: SheetRelayAccess; accessB: SheetRelayAccess;
    revokedA: boolean; revokedB: boolean; active: Map<string, boolean>; pgCommitFailure: boolean;
    beforePG?: (() => Promise<void>) | undefined; beforeGate?: (() => Promise<void>) | undefined; pgCalls: number; gateCalls: number;
  } = { now, lockHeld: false, accessA: 'read-write', accessB: 'read-write', revokedA: false, revokedB: false,
    active: new Map([...claims.values()].map(value => [value.sessionId, true])), pgCommitFailure: false, pgCalls: 0, gateCalls: 0 };
  const authority = new AccountAuthority({
    clock: () => model.now,
    verifier: { async verifySession(token) {
      const value = claims.get(token); if (!value) throw new Error('invalid_access_token');
      return { ...value };
    } },
    sessionGate: async input => {
      model.gateCalls++; await model.beforeGate?.();
      return claims.get(input.accessToken)?.sessionId === input.sessionId && model.active.get(input.sessionId) === true;
    },
    logoutSession: async input => {
      const value = claims.get(input.accessToken);
      if (!value || value.issuer !== input.issuer || value.subject !== input.subject || value.sessionId !== input.sessionId) return false;
      model.active.set(input.sessionId, false); return true;
    },
  });
  const options: AccountRelayOptions = { scope, context, authority, clock: () => model.now, allowedOrigins: [origin],
    accessStore: { async withCurrentAccess(principal, requested, intent, operation) {
      model.pgCalls++; await model.beforePG?.();
      const person = principal.subject === 'account-a' ? 'a' : principal.subject === 'account-b' ? 'b' : undefined;
      if (principal.issuer !== issuer || !person || requested.tenantId !== scope.tenantId || requested.workspaceId !== scope.workspaceId || requested.documentId !== scope.documentId ||
          (person === 'a' ? model.revokedA : model.revokedB)) throw new SheetAccessError('current-access-denied');
      const access = person === 'a' ? model.accessA : model.accessB;
      if (intent === 'write' && access !== 'read-write') throw new SheetAccessError('read-only-denied');
      const grant: CurrentSheetGrant = { ...scope, userId: users[person], access, workbookId: context.workbookId, generation: context.generation, grantVersion: 1, documentVersion: 1 };
      if (model.lockHeld) throw new Error('model-lock-overlap');
      model.lockHeld = true;
      try {
        const result = operation(grant);
        if (result && (typeof result === 'object' || typeof result === 'function') && typeof Reflect.get(result, 'then') === 'function') throw new Error('model-sync-operation-required');
        if (model.pgCommitFailure) throw new SheetAccessOperationUncertainError(true);
        return result;
      } finally { model.lockHeld = false; }
    } },
  };
  const relay = AccountSheetRelay.create({ ...options, bootstrapActorId: users.a });
  async function authenticate(token: string = tokens.a, resumeCredential?: string) {
    const admission = await relay.admit({ tenantId: scope.tenantId, documentId: scope.documentId, bearer: token, origin,
      ...(resumeCredential === undefined ? {} : { resumeCredential }) }, accountSignal());
    const bound = await relay.consumeTicket(admission.ticket, origin, accountSignal(), () => {});
    return relay.withAuthorized(bound, 'read', accountSignal(), () => {}, (native, session) => ({ bound, session, state: native.open(session.credential) }));
  }
  return { relay, options, scope, context, origin, tokens, users, model, authenticate,
    close() { relay.close(); rmSync(relay.directory, { recursive: true, force: true }); } };
}
