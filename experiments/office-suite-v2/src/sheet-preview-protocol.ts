import type { WorkbookContext, EventIdentity } from './contracts.ts';

/** Shared HTTP contract. No Node, store, framework or provider runtime imports. */
export const SHEET_RELAY_PROTOCOL = 1;
export const SHEET_RELAY_PATH = '/api/sheet-relay/v1';
export const SHEET_RELAY_LIMITS = Object.freeze({ updateBytes: 1_000_000, httpBodyBytes: 1_500_000, frontierBytes: 64_000, sessions: 128 });
export type SheetRelayIdentity = Readonly<Pick<EventIdentity, 'actorId' | 'sessionId'>>;
export type SheetRelayAdmission = Readonly<Omit<WorkbookContext, 'workbookId'> & { engineId: 'sheet-v1' }>;
export type SheetRelaySessionRequest = Readonly<{ protocolVersion: 1; resumeCredential?: string }>;
export type SheetRelayAccess = 'read-write' | 'read-only';
export type SheetRelaySession = Readonly<{ protocolVersion: 1; controlled: true; credential: string; identity: SheetRelayIdentity; context: WorkbookContext }>;
export type SheetRelayWsSession = SheetRelaySession & Readonly<{ access: SheetRelayAccess }>;
/** P3 account scope is separate from the preserved controlled P1 session. */
export type SheetRelayAccountBinding = Readonly<{
  issuer: string; subject: string; userId: string; loginBindingId: string;
  tenantId: string; workspaceId: string; documentId: string;
}>;
export type SheetRelayAccountSession = Readonly<Omit<SheetRelayWsSession, 'controlled'> & {
  controlled: false; accountBinding: SheetRelayAccountBinding;
  /** Verified login expiry, Unix milliseconds. Never part of stable owner binding. */
  expiresAt: number;
}>;
export type SheetRelayAccountAdmissionRequest = SheetRelaySessionRequest;
export type SheetRelayAccountAdmissionResponse = Readonly<{
  protocolVersion: 1; ticket: string;
  /** Single-use ticket expiry and verified login expiry, both Unix milliseconds. */
  expiresAt: number; grantExpiresAt: number; accountBinding: SheetRelayAccountBinding;
}>;
export const SHEET_RELAY_ACCOUNT_LIMITS = Object.freeze({ ticketMs: 5_000, tickets: 128, authorizationMs: 5_000, queuedOperations: 128, tokenBytes: 8_192 });
export function sheetRelayAccountAdmissionPath(tenantId: string, documentId: string): string {
  if (!uuid(tenantId) || !uuid(documentId)) throw new Error('invalid-account-scope');
  return `/api/v1/tenants/${tenantId}/sheets/${documentId}/admission`;
}
export type SheetRelayPacket = Readonly<{ updateId: string; bytesBase64: string; byteLength: number; sha256: string }>;
export type SheetRelayAppendRequest = Readonly<{ protocolVersion: 1; context: WorkbookContext; admission: SheetRelayAdmission; packet: SheetRelayPacket; loseAck?: boolean }>;
export type SheetRelayReceipt = Readonly<{ context: WorkbookContext; admission: SheetRelayAdmission; updateId: string; sha256: string; sequence: number; frontierBase64: string }>;
export type SheetRelayRejection = Readonly<{ protocolVersion: 1; status: 'rejected'; code: string; updateId?: string }>;
export type SheetRelayAppendResult = Readonly<{ protocolVersion: 1; status: 'durable'; receipt: SheetRelayReceipt }> |
  Readonly<{ protocolVersion: 1; status: 'acknowledgment-unknown'; updateId: string }> | SheetRelayRejection;
export type SheetRelayState = Readonly<{
  protocolVersion: 1; context: WorkbookContext; admission: SheetRelayAdmission; latestSequence: number;
  state: Readonly<{ bytesBase64: string; byteLength: number; sha256: string; frontierBase64: string }>;
  bootstrap: Readonly<{ updateId: string; sha256: string; byteLength: number; identity: SheetRelayIdentity }>;
}>;
export type SheetRelayCheckpoint = Readonly<{ protocolVersion: 1; throughSequence: number; includedCount: number; frontierBase64: string; stateSha256: string }>;

const object = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);
const id = (value: unknown): value is string => typeof value === 'string' && value.length > 0 && value.length <= 128;
export const isSha256 = (value: unknown): value is string => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
export const isRelayCredential = isSha256;
function fields(value: Record<string, unknown>, required: readonly string[], optional: readonly string[] = []): boolean {
  return required.every(key => Object.hasOwn(value, key)) && Object.keys(value).every(key => required.includes(key) || optional.includes(key));
}
export function isSheetRelayContext(value: unknown): value is WorkbookContext {
  return object(value) && fields(value, ['documentId', 'workbookId', 'generation', 'contractVersion', 'engineVersion', 'schemaVersion', 'adapterVersion']) &&
    id(value.documentId) && id(value.workbookId) && id(value.generation) && value.contractVersion === 1 && value.engineVersion === 1 && value.schemaVersion === 1 && value.adapterVersion === 1;
}
export function relayAdmission(context: WorkbookContext): SheetRelayAdmission {
  return Object.freeze({ documentId: context.documentId, generation: context.generation, contractVersion: context.contractVersion,
    engineVersion: context.engineVersion, schemaVersion: context.schemaVersion, adapterVersion: context.adapterVersion, engineId: 'sheet-v1' });
}
export function sameRelayContext(left: WorkbookContext, right: WorkbookContext): boolean {
  return left.documentId === right.documentId && left.workbookId === right.workbookId && left.generation === right.generation &&
    left.contractVersion === right.contractVersion && left.engineVersion === right.engineVersion && left.schemaVersion === right.schemaVersion && left.adapterVersion === right.adapterVersion;
}
export function isSheetRelayAdmission(value: unknown): value is SheetRelayAdmission {
  return object(value) && fields(value, ['documentId', 'generation', 'engineId', 'contractVersion', 'engineVersion', 'schemaVersion', 'adapterVersion']) &&
    id(value.documentId) && id(value.generation) && value.engineId === 'sheet-v1' && value.contractVersion === 1 && value.engineVersion === 1 && value.schemaVersion === 1 && value.adapterVersion === 1;
}
export function sameRelayAdmission(left: SheetRelayAdmission, right: SheetRelayAdmission): boolean {
  return left.documentId === right.documentId && left.generation === right.generation && left.engineId === right.engineId &&
    left.contractVersion === right.contractVersion && left.engineVersion === right.engineVersion && left.schemaVersion === right.schemaVersion && left.adapterVersion === right.adapterVersion;
}
export function bytesToBase64(bytes: Uint8Array, limit: number = SHEET_RELAY_LIMITS.updateBytes): string {
  if (!(bytes instanceof Uint8Array) || bytes.length > limit) throw new Error('binary-limit');
  const chunks: string[] = [];
  for (let i = 0; i < bytes.length; i += 16_384) chunks.push(String.fromCharCode(...bytes.subarray(i, i + 16_384)));
  return btoa(chunks.join(''));
}
export function base64ToBytes(value: unknown, limit: number = SHEET_RELAY_LIMITS.updateBytes): Uint8Array {
  if (typeof value !== 'string' || value.length > 4 * Math.ceil(limit / 3) || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)) throw new Error('invalid-base64');
  const raw = atob(value);
  if (raw.length > limit || btoa(raw) !== value) throw new Error('binary-limit-or-noncanonical');
  return Uint8Array.from(raw, character => character.charCodeAt(0));
}
export function parseSheetRelaySessionRequest(value: unknown): SheetRelaySessionRequest {
  if (!object(value) || !fields(value, ['protocolVersion'], ['resumeCredential']) || value.protocolVersion !== 1 ||
      (Object.hasOwn(value, 'resumeCredential') && !isRelayCredential(value.resumeCredential))) throw new Error('invalid-session-request');
  return typeof value.resumeCredential === 'string' ? { protocolVersion: 1, resumeCredential: value.resumeCredential } : { protocolVersion: 1 };
}
export function parseSheetRelayAppendRequest(value: unknown): SheetRelayAppendRequest {
  if (!object(value) || !fields(value, ['protocolVersion', 'context', 'admission', 'packet'], ['loseAck']) || value.protocolVersion !== 1 ||
      !isSheetRelayContext(value.context) || !isSheetRelayAdmission(value.admission) ||
      !sameRelayAdmission(relayAdmission(value.context), value.admission) || !object(value.packet) ||
      !fields(value.packet, ['updateId', 'bytesBase64', 'byteLength', 'sha256']) || !id(value.packet.updateId) || !isSha256(value.packet.sha256) ||
      typeof value.packet.byteLength !== 'number' || !Number.isSafeInteger(value.packet.byteLength) || value.packet.byteLength < 1 || value.packet.byteLength > SHEET_RELAY_LIMITS.updateBytes ||
      (Object.hasOwn(value, 'loseAck') && typeof value.loseAck !== 'boolean')) throw new Error('invalid-append-request');
  const bytes = base64ToBytes(value.packet.bytesBase64);
  if (bytes.length !== value.packet.byteLength || typeof value.packet.bytesBase64 !== 'string') throw new Error('packet-length-mismatch');
  const packet = { updateId: value.packet.updateId, bytesBase64: value.packet.bytesBase64, byteLength: value.packet.byteLength, sha256: value.packet.sha256 };
  const request = { protocolVersion: 1 as const, context: value.context, admission: value.admission, packet };
  return typeof value.loseAck === 'boolean' ? { ...request, loseAck: value.loseAck } : request;
}

/** WebSocket carries exact native packets through the same authenticated store path. */
export const SHEET_RELAY_WS_PATH = `${SHEET_RELAY_PATH}/ws`;
export const SHEET_RELAY_WS_LIMITS = Object.freeze({
  frameBytes: 2_000_000, bufferedBytes: 4_000_000, fragments: 1_024, bufferedChunks: 4_096, handshakeMs: 5_000,
  pingIntervalMs: 15_000, replyMs: 10_000, reconnectMinMs: 250, reconnectMaxMs: 5_000,
  connections: 128, pendingRequests: 32, requestsPerConnection: 4_096,
});
type Correlated = Readonly<{ protocolVersion: 1; requestId: string }>;
export type SheetRelayClientFrame =
  (Correlated & Readonly<{ type: 'authenticate'; session: SheetRelaySessionRequest }>) |
  (Correlated & Readonly<{ type: 'authenticate-account'; ticket: string }>) |
  (Correlated & Readonly<{ type: 'open' | 'checkpoint' }>) |
  (Correlated & Readonly<{ type: 'append'; request: SheetRelayAppendRequest; delayAckMs?: number }>);
export type SheetRelayServerFrame =
  (Correlated & Readonly<{ type: 'authenticated'; session: SheetRelayWsSession; state: SheetRelayState }>) |
  (Correlated & Readonly<{ type: 'account-authenticated'; session: SheetRelayAccountSession; state: SheetRelayState }>) |
  (Correlated & Readonly<{ type: 'state'; state: SheetRelayState }>) |
  (Correlated & Readonly<{ type: 'append-result'; result: SheetRelayAppendResult }>) |
  (Correlated & Readonly<{ type: 'checkpoint'; checkpoint: SheetRelayCheckpoint }>) |
  Readonly<{ protocolVersion: 1; type: 'access'; access: SheetRelayAccess }> |
  Readonly<{ protocolVersion: 1; type: 'accepted'; receipt: SheetRelayReceipt; state: SheetRelayState }> |
  Readonly<{ protocolVersion: 1; type: 'rejected'; requestId?: string; code: string; updateId?: string }>;

const sequence = (value: unknown, minimum = 1): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= minimum;
const uuid = (value: unknown): value is string => typeof value === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(value);
const code = (value: unknown): value is string => typeof value === 'string' && /^[A-Za-z0-9_:#-]{1,200}$/.test(value);
function nativeBytes(value: unknown, byteLength: unknown): boolean {
  return sequence(byteLength) && byteLength <= SHEET_RELAY_LIMITS.updateBytes && base64ToBytes(value).length === byteLength;
}
function frontier(value: unknown): boolean {
  return base64ToBytes(value, SHEET_RELAY_LIMITS.frontierBytes).length > 0;
}
function isIdentity(value: unknown): value is SheetRelayIdentity {
  return object(value) && fields(value, ['actorId', 'sessionId']) && id(value.actorId) && id(value.sessionId);
}
export function parseSheetRelayReceipt(value: unknown): SheetRelayReceipt {
  if (!object(value) || !fields(value, ['context', 'admission', 'updateId', 'sha256', 'sequence', 'frontierBase64']) ||
      !isSheetRelayContext(value.context) || !isSheetRelayAdmission(value.admission) || !sameRelayAdmission(relayAdmission(value.context), value.admission) ||
      !id(value.updateId) || !isSha256(value.sha256) || !sequence(value.sequence) || !frontier(value.frontierBase64)) throw new Error('invalid-relay-receipt');
  return { context: value.context, admission: value.admission, updateId: value.updateId, sha256: value.sha256, sequence: value.sequence, frontierBase64: value.frontierBase64 as string };
}
export function parseSheetRelayState(value: unknown): SheetRelayState {
  if (!object(value) || !fields(value, ['protocolVersion', 'context', 'admission', 'latestSequence', 'state', 'bootstrap']) || value.protocolVersion !== 1 ||
      !isSheetRelayContext(value.context) || !isSheetRelayAdmission(value.admission) || !sameRelayAdmission(relayAdmission(value.context), value.admission) || !sequence(value.latestSequence) ||
      !object(value.state) || !fields(value.state, ['bytesBase64', 'byteLength', 'sha256', 'frontierBase64']) || !nativeBytes(value.state.bytesBase64, value.state.byteLength) ||
      !isSha256(value.state.sha256) || !frontier(value.state.frontierBase64) || !object(value.bootstrap) || !fields(value.bootstrap, ['updateId', 'sha256', 'byteLength', 'identity']) ||
      !id(value.bootstrap.updateId) || !isSha256(value.bootstrap.sha256) || !sequence(value.bootstrap.byteLength) || value.bootstrap.byteLength > SHEET_RELAY_LIMITS.updateBytes || !isIdentity(value.bootstrap.identity)) throw new Error('invalid-relay-state');
  return value as SheetRelayState;
}
function parseSession(value: unknown): SheetRelayWsSession {
  if (!object(value) || !fields(value, ['protocolVersion', 'controlled', 'credential', 'identity', 'context', 'access']) || value.protocolVersion !== 1 || value.controlled !== true ||
      !isRelayCredential(value.credential) || !isIdentity(value.identity) || !isSheetRelayContext(value.context) || (value.access !== 'read-write' && value.access !== 'read-only')) throw new Error('invalid-relay-session');
  return value as SheetRelayWsSession;
}
export function parseSheetRelayAccountBinding(value: unknown): SheetRelayAccountBinding {
  if (!object(value) || !fields(value, ['issuer', 'subject', 'userId', 'loginBindingId', 'tenantId', 'workspaceId', 'documentId']) ||
      typeof value.issuer !== 'string' || value.issuer.length < 1 || value.issuer.length > 2_048 || typeof value.subject !== 'string' || value.subject.length < 1 || value.subject.length > 255 ||
      !uuid(value.userId) || !isSha256(value.loginBindingId) || !uuid(value.tenantId) || !uuid(value.workspaceId) || !uuid(value.documentId)) throw new Error('invalid-account-binding');
  return value as SheetRelayAccountBinding;
}
export function sameSheetRelayAccountBinding(left: SheetRelayAccountBinding, right: SheetRelayAccountBinding): boolean {
  return left.issuer === right.issuer && left.subject === right.subject && left.userId === right.userId && left.loginBindingId === right.loginBindingId &&
    left.tenantId === right.tenantId && left.workspaceId === right.workspaceId && left.documentId === right.documentId;
}
export function parseSheetRelayAccountSession(value: unknown): SheetRelayAccountSession {
  if (!object(value) || !fields(value, ['protocolVersion', 'controlled', 'credential', 'identity', 'context', 'access', 'accountBinding', 'expiresAt']) ||
      value.protocolVersion !== 1 || value.controlled !== false || !isRelayCredential(value.credential) || !isIdentity(value.identity) || !isSheetRelayContext(value.context) ||
      (value.access !== 'read-write' && value.access !== 'read-only') || !sequence(value.expiresAt)) throw new Error('invalid-account-session');
  const accountBinding = parseSheetRelayAccountBinding(value.accountBinding);
  if (value.context.documentId !== accountBinding.documentId) throw new Error('account-document-binding');
  return value as SheetRelayAccountSession;
}
export function parseSheetRelayAccountAdmissionResponse(value: unknown): SheetRelayAccountAdmissionResponse {
  if (!object(value) || !fields(value, ['protocolVersion', 'ticket', 'expiresAt', 'grantExpiresAt', 'accountBinding']) || value.protocolVersion !== 1 || !isRelayCredential(value.ticket) ||
      !sequence(value.expiresAt) || !sequence(value.grantExpiresAt) || value.expiresAt > value.grantExpiresAt) throw new Error('invalid-account-admission');
  parseSheetRelayAccountBinding(value.accountBinding);
  return value as SheetRelayAccountAdmissionResponse;
}
function parseResult(value: unknown): SheetRelayAppendResult {
  if (!object(value) || value.protocolVersion !== 1) throw new Error('invalid-append-result');
  if (value.status === 'durable' && fields(value, ['protocolVersion', 'status', 'receipt'])) return { protocolVersion: 1, status: 'durable', receipt: parseSheetRelayReceipt(value.receipt) };
  if (value.status === 'acknowledgment-unknown' && fields(value, ['protocolVersion', 'status', 'updateId']) && id(value.updateId)) return { protocolVersion: 1, status: 'acknowledgment-unknown', updateId: value.updateId };
  if (value.status === 'rejected' && fields(value, ['protocolVersion', 'status', 'code'], ['updateId']) && code(value.code) && (!Object.hasOwn(value, 'updateId') || id(value.updateId))) return value as SheetRelayRejection;
  throw new Error('invalid-append-result');
}
function parseCheckpoint(value: unknown): SheetRelayCheckpoint {
  if (!object(value) || !fields(value, ['protocolVersion', 'throughSequence', 'includedCount', 'frontierBase64', 'stateSha256']) || value.protocolVersion !== 1 ||
      !sequence(value.throughSequence) || !sequence(value.includedCount) || value.includedCount > value.throughSequence || !frontier(value.frontierBase64) || !isSha256(value.stateSha256)) throw new Error('invalid-relay-checkpoint');
  return value as SheetRelayCheckpoint;
}
export function parseSheetRelayClientFrame(value: unknown): SheetRelayClientFrame {
  if (!object(value) || value.protocolVersion !== 1 || !id(value.requestId)) throw new Error('invalid-client-frame');
  const base = { protocolVersion: 1 as const, requestId: value.requestId };
  if (value.type === 'authenticate' && fields(value, ['protocolVersion', 'type', 'requestId', 'session'])) return { ...base, type: 'authenticate', session: parseSheetRelaySessionRequest(value.session) };
  if (value.type === 'authenticate-account' && fields(value, ['protocolVersion', 'type', 'requestId', 'ticket']) && isRelayCredential(value.ticket)) return { ...base, type: 'authenticate-account', ticket: value.ticket };
  if ((value.type === 'open' || value.type === 'checkpoint') && fields(value, ['protocolVersion', 'type', 'requestId'])) return { ...base, type: value.type };
  if (value.type === 'append' && fields(value, ['protocolVersion', 'type', 'requestId', 'request'], ['delayAckMs'])) {
    if (Object.hasOwn(value, 'delayAckMs') && (!sequence(value.delayAckMs, 0) || value.delayAckMs > 1_000)) throw new Error('invalid-delay-ack');
    const parsed = { ...base, type: 'append' as const, request: parseSheetRelayAppendRequest(value.request) };
    return typeof value.delayAckMs === 'number' ? { ...parsed, delayAckMs: value.delayAckMs } : parsed;
  }
  throw new Error('invalid-client-frame');
}
export function parseSheetRelayServerFrame(value: unknown): SheetRelayServerFrame {
  if (!object(value) || value.protocolVersion !== 1) throw new Error('invalid-server-frame');
  if (value.type === 'access' && fields(value, ['protocolVersion', 'type', 'access']) && (value.access === 'read-write' || value.access === 'read-only')) return { protocolVersion: 1, type: 'access', access: value.access };
  if (value.type === 'rejected' && fields(value, ['protocolVersion', 'type', 'code'], ['requestId', 'updateId']) && code(value.code) &&
      (!Object.hasOwn(value, 'requestId') || id(value.requestId)) && (!Object.hasOwn(value, 'updateId') || id(value.updateId))) return value as SheetRelayServerFrame;
  if (value.type === 'accepted' && fields(value, ['protocolVersion', 'type', 'receipt', 'state'])) {
    const receipt = parseSheetRelayReceipt(value.receipt), state = parseSheetRelayState(value.state);
    if (!sameRelayContext(receipt.context, state.context) || receipt.sequence > state.latestSequence) throw new Error('accepted-state-binding');
    return { protocolVersion: 1, type: 'accepted', receipt, state };
  }
  if (!id(value.requestId)) throw new Error('invalid-server-correlation');
  const base = { protocolVersion: 1 as const, requestId: value.requestId };
  if (value.type === 'account-authenticated' && fields(value, ['protocolVersion', 'type', 'requestId', 'session', 'state'])) {
    const session = parseSheetRelayAccountSession(value.session), state = parseSheetRelayState(value.state);
    if (!sameRelayContext(session.context, state.context)) throw new Error('session-state-binding');
    return { ...base, type: 'account-authenticated', session, state };
  }
  if (value.type === 'authenticated' && fields(value, ['protocolVersion', 'type', 'requestId', 'session', 'state'])) {
    const session = parseSession(value.session), state = parseSheetRelayState(value.state);
    if (!sameRelayContext(session.context, state.context)) throw new Error('session-state-binding');
    return { ...base, type: 'authenticated', session, state };
  }
  if (value.type === 'state' && fields(value, ['protocolVersion', 'type', 'requestId', 'state'])) return { ...base, type: 'state', state: parseSheetRelayState(value.state) };
  if (value.type === 'append-result' && fields(value, ['protocolVersion', 'type', 'requestId', 'result'])) return { ...base, type: 'append-result', result: parseResult(value.result) };
  if (value.type === 'checkpoint' && fields(value, ['protocolVersion', 'type', 'requestId', 'checkpoint'])) return { ...base, type: 'checkpoint', checkpoint: parseCheckpoint(value.checkpoint) };
  throw new Error('invalid-server-frame');
}
export function encodeSheetRelayWsFrame(value: SheetRelayClientFrame | SheetRelayServerFrame): string {
  const encoded = JSON.stringify(value);
  if (new TextEncoder().encode(encoded).length > SHEET_RELAY_WS_LIMITS.frameBytes) throw new Error('ws-frame-limit');
  return encoded;
}
function decodeFrame(encoded: string): unknown {
  if (typeof encoded !== 'string' || new TextEncoder().encode(encoded).length > SHEET_RELAY_WS_LIMITS.frameBytes) throw new Error('ws-frame-limit');
  return JSON.parse(encoded) as unknown;
}
export function decodeSheetRelayClientFrame(encoded: string): SheetRelayClientFrame { return parseSheetRelayClientFrame(decodeFrame(encoded)); }
export function decodeSheetRelayServerFrame(encoded: string): SheetRelayServerFrame { return parseSheetRelayServerFrame(decodeFrame(encoded)); }
