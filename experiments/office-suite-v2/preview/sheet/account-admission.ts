import { SHEET_RELAY_ACCOUNT_LIMITS, parseSheetRelayAccountAdmissionResponse, parseSheetRelaySessionRequest,
  sameSheetRelayAccountBinding, sheetRelayAccountAdmissionPath } from '../../src/sheet-preview-protocol.ts';
import type { SheetRelayAccountAdmissionResponse, SheetRelayAccountBinding } from '../../src/sheet-preview-protocol.ts';
import { AccountBindingGuard } from './account-binding.ts';
import type { SheetAccountIdentity, SheetAccountLease } from './account-login.ts';

const RESPONSE_BYTES = 32_768;
export type RequestedSheetAccountScope = { tenantId: string; documentId: string; workspaceId?: string };
export type AccountAdmission = {
  binding: SheetRelayAccountBinding;
  guard: AccountBindingGuard;
  admit: (resumeCredential?: string) => Promise<SheetRelayAccountAdmissionResponse>;
};

/** Read a bounded response through the captured login. Never publish partial JSON. */
async function readAdmission(response: Response, check: () => void): Promise<SheetRelayAccountAdmissionResponse> {
  check();
  if (!response.ok || response.redirected) {
    void response.body?.cancel().catch(() => {});
    throw new Error(`account-admission-http-${response.status}`);
  }
  const declared = response.headers.get('content-length');
  if (declared !== null && (!/^(?:0|[1-9][0-9]*)$/.test(declared) || !Number.isSafeInteger(Number(declared)) || Number(declared) > RESPONSE_BYTES)) {
    void response.body?.cancel().catch(() => {});
    throw new Error('account-admission-response-limit');
  }
  if (!response.body) throw new Error('account-admission-empty-response');
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    for (;;) {
      check();
      const chunk = await reader.read();
      check();
      if (chunk.done) break;
      if (!(chunk.value instanceof Uint8Array) || chunk.value.byteLength > RESPONSE_BYTES - length) throw new Error('account-admission-response-limit');
      length += chunk.value.byteLength;
      chunks.push(chunk.value.slice());
    }
  } catch (error) {
    void reader.cancel().catch(() => {});
    throw error;
  } finally { reader.releaseLock(); }
  check();
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  let decoded: unknown;
  try { decoded = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)) as unknown; }
  catch { check(); throw new Error('account-admission-invalid-json'); }
  check();
  return structuredClone(parseSheetRelayAccountAdmissionResponse(decoded));
}

function validateExpiry(admission: SheetRelayAccountAdmissionResponse): void {
  const now = Date.now();
  if (!Number.isFinite(now) || admission.expiresAt <= now || admission.expiresAt > now + SHEET_RELAY_ACCOUNT_LIMITS.ticketMs || admission.grantExpiresAt <= now) {
    throw new Error('account-admission-expired-or-unbounded');
  }
}

/** The probe verifies account scope before its caller can open private IndexedDB. Its ticket is discarded. */
export async function createAccountAdmission(lease: SheetAccountLease, requested: RequestedSheetAccountScope, identity: SheetAccountIdentity): Promise<AccountAdmission> {
  const path = sheetRelayAccountAdmissionPath(requested.tenantId, requested.documentId);
  const scope = { ...requested };
  const principal = { issuer: identity.issuer, subject: identity.subject, userId: identity.currentUserId };
  if (typeof principal.userId !== 'string' || !principal.userId || typeof principal.issuer !== 'string' || !principal.issuer || typeof principal.subject !== 'string' || !principal.subject) {
    throw new Error('account-admission-canonical-identity-required');
  }
  const checkLease = (): void => { if (!lease.isCurrent()) throw new Error('account-admission-session-retired'); };
  const fetchAdmission = async (resumeCredential: string | undefined, check: () => void): Promise<SheetRelayAccountAdmissionResponse> => {
    check();
    const body = parseSheetRelaySessionRequest(resumeCredential === undefined ? { protocolVersion: 1 } : { protocolVersion: 1, resumeCredential });
    const response = await lease.requestFetch(path, { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify(body), cache: 'no-store', credentials: 'same-origin', redirect: 'error' });
    try {
      check();
      const admission = await readAdmission(response, check);
      check(); validateExpiry(admission); check();
      return admission;
    } catch (error) {
      if (!response.body?.locked) void response.body?.cancel().catch(() => {});
      throw error;
    }
  };
  checkLease();
  const probe = await fetchAdmission(undefined, checkLease);
  const binding = probe.accountBinding;
  if (binding.issuer !== principal.issuer || binding.subject !== principal.subject || binding.userId !== principal.userId ||
      binding.tenantId !== scope.tenantId || binding.documentId !== scope.documentId || (scope.workspaceId !== undefined && binding.workspaceId !== scope.workspaceId)) {
    lease.retire();
    throw new Error('account-admission-identity-or-scope-mismatch');
  }
  checkLease(); lease.setExpiresAt(probe.grantExpiresAt); checkLease();
  const guard = new AccountBindingGuard({ binding, proofExpiresAt: probe.grantExpiresAt, isCurrent: lease.isCurrent });
  guard.assertCurrent();
  let originalCredential: string | undefined;
  const admit = async (resumeCredential?: string): Promise<SheetRelayAccountAdmissionResponse> => {
    const token = guard.capture();
    const check = (): void => { checkLease(); guard.assertCurrent(token); };
    check();
    parseSheetRelaySessionRequest(resumeCredential === undefined ? { protocolVersion: 1 } : { protocolVersion: 1, resumeCredential });
    if (originalCredential !== undefined && resumeCredential !== originalCredential) throw new Error('account-admission-original-credential-required');
    if (resumeCredential !== undefined) originalCredential = resumeCredential;
    const admission = await fetchAdmission(resumeCredential, check);
    check();
    if (!sameSheetRelayAccountBinding(admission.accountBinding, guard.binding) || admission.grantExpiresAt !== guard.proofExpiresAt) {
      guard.retire('account-switch'); lease.retire();
      throw new Error('account-admission-original-binding-required');
    }
    check();
    return admission;
  };
  return Object.freeze({ binding: guard.binding, guard, admit });
}
