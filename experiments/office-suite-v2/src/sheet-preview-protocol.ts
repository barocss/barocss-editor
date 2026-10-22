import type { WorkbookContext, EventIdentity } from './contracts.ts';

/** Shared HTTP contract. No Node, store, framework or provider runtime imports. */
export const SHEET_RELAY_PROTOCOL = 1;
export const SHEET_RELAY_PATH = '/api/sheet-relay/v1';
export const SHEET_RELAY_LIMITS = Object.freeze({ updateBytes: 1_000_000, httpBodyBytes: 1_500_000, frontierBytes: 64_000, sessions: 128 });
export type SheetRelayIdentity = Readonly<Pick<EventIdentity, 'actorId' | 'sessionId'>>;
export type SheetRelayAdmission = Readonly<Omit<WorkbookContext, 'workbookId'> & { engineId: 'sheet-v1' }>;
export type SheetRelaySessionRequest = Readonly<{ protocolVersion: 1; resumeCredential?: string }>;
export type SheetRelaySession = Readonly<{ protocolVersion: 1; controlled: true; credential: string; identity: SheetRelayIdentity; context: WorkbookContext }>;
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
export function bytesToBase64(bytes: Uint8Array, limit = SHEET_RELAY_LIMITS.updateBytes): string {
  if (!(bytes instanceof Uint8Array) || bytes.length > limit) throw new Error('binary-limit');
  const chunks: string[] = [];
  for (let i = 0; i < bytes.length; i += 16_384) chunks.push(String.fromCharCode(...bytes.subarray(i, i + 16_384)));
  return btoa(chunks.join(''));
}
export function base64ToBytes(value: unknown, limit = SHEET_RELAY_LIMITS.updateBytes): Uint8Array {
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
