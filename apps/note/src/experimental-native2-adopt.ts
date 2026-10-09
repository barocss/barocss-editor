import { isRegistryUuid, parseRegistryJson, parseRegistryDefinition, validateRegistryBundle, REGISTRY_DIGEST,
  type RegistryReference, type RegistryDefinition, type RegistryBundle } from '@barocss/schema/registry-contract';
import { serializeNoteFile } from '@barocss/office-note/file';
import { createExperimentalNative2NoteReader, decodeExperimentalNative2Head, type ExperimentalNative2Read } from './experimental-native2-reader';
import { freezeNative2Value, native2Equal, native2Exact, native2Record, native2Digest, requireNative2Writable,
  validateNative2Scope, validateNative2Base, validateNative2Draft, readPreserveNative2, type Native2PreserveBase } from './experimental-native2-preserve';
import type { PendingNoteScope } from './server-pending';

export interface RegisteredNative2Version extends RegistryReference {
  readonly digestAlgorithm: typeof REGISTRY_DIGEST; readonly definitionText: string; readonly canonicalText: string;
  readonly definition: RegistryDefinition; readonly actorIdentityId: string; readonly createdAt: string;
}
export interface ResolvedNative2Version {
  readonly reference: RegistryReference; readonly record: RegisteredNative2Version;
  readonly dependencies: readonly RegisteredNative2Version[];
}
export interface Native2AdoptAttempt {
  readonly version: 1; readonly operation: 'update'; readonly schemaAction: 'adopt';
  readonly scope: PendingNoteScope & { documentId: string }; readonly generation: number;
  readonly base: Native2PreserveBase; readonly sourceSnapshotText: string; readonly datasetPath: readonly number[];
  readonly choice: ResolvedNative2Version; readonly snapshotText: string; readonly snapshotHash: string;
  readonly expectedPriorPinDigest: string; readonly idempotencyKey: string; readonly bodyText: string;
}
export interface Native2AdoptReceipt {
  readonly operation: 'update'; readonly idempotencyKey: string; readonly requestHash: string;
  readonly document: ExperimentalNative2Read['document']; readonly snapshotText: string;
}
export interface Native2AdoptConfirmation {
  readonly status: 'adoption-fixed-confirmed'; readonly attempt: Native2AdoptAttempt;
  readonly receipt: Native2AdoptReceipt; readonly read: ExperimentalNative2Read;
}
export class Native2AdoptError extends Error {
  constructor(public readonly status: number | null, public readonly code: string) { super(code); }
}
const fail = (code: string): never => { throw new Native2AdoptError(null, code); };
const positive = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v > 0;
function reference(value: unknown): RegistryReference {
  const v = native2Exact(value, ['schemaId', 'version', 'digest']);
  if (!isRegistryUuid(v.schemaId) || !positive(v.version) || v.version > 2147483647 || !native2Digest(v.digest)) return fail('invalid_native2_version');
  return { schemaId: v.schemaId, version: v.version, digest: v.digest };
}
async function hash(text: string, current: () => boolean): Promise<string> {
  requireNative2Writable(current); const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)); requireNative2Writable(current);
  return Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, '0')).join('');
}
async function registered(value: unknown, scope: PendingNoteScope, current: () => boolean): Promise<RegisteredNative2Version> {
  requireNative2Writable(current);
  const v = native2Exact(value, ['schemaId', 'version', 'digest', 'digestAlgorithm', 'definitionText', 'canonicalText', 'definition', 'actorIdentityId', 'createdAt']);
  const ref = reference({ schemaId: v.schemaId, version: v.version, digest: v.digest });
  if (v.digestAlgorithm !== REGISTRY_DIGEST || typeof v.definitionText !== 'string' || typeof v.canonicalText !== 'string' ||
    !isRegistryUuid(v.actorIdentityId) || typeof v.createdAt !== 'string' || !/^\d{4}-\d{2}-\d{2}T/.test(v.createdAt) || !Number.isFinite(Date.parse(v.createdAt))) return fail('invalid_native2_version');
  const parsed = parseRegistryDefinition(v.definitionText), d = parsed.definition;
  if (d.scope.tenantId !== scope.tenantId || d.scope.workspaceId !== scope.workspaceId || d.schemaId !== ref.schemaId || d.version !== ref.version ||
    parsed.canonicalText !== v.canonicalText || !native2Equal(d, v.definition) || await hash(parsed.canonicalText, current) !== ref.digest) return fail('native2_version_conflict');
  return freezeNative2Value({ ...ref, digestAlgorithm: REGISTRY_DIGEST, definitionText: v.definitionText, canonicalText: parsed.canonicalText,
    definition: d, actorIdentityId: v.actorIdentityId, createdAt: v.createdAt });
}
export async function decodeNative2AdoptChoice(value: unknown, expected: RegistryReference, scope: PendingNoteScope, current: () => boolean): Promise<ResolvedNative2Version> {
  requireNative2Writable(current); reference(expected); const v = native2Exact(value, ['reference', 'record', 'dependencies']);
  if (!native2Equal(v.reference, expected) || !Array.isArray(v.dependencies) || v.dependencies.length >= 32) return fail('native2_version_conflict');
  const root = await registered(v.record, scope, current); requireNative2Writable(current);
  if (!native2Equal({ schemaId: root.schemaId, version: root.version, digest: root.digest }, expected)) return fail('native2_version_conflict');
  const dependencies: RegisteredNative2Version[] = [];
  for (const entry of v.dependencies) { dependencies.push(await registered(entry, scope, current)); requireNative2Writable(current); }
  validateRegistryBundle({ bundleVersion: 1, digestAlgorithm: REGISTRY_DIGEST, selected: [expected],
    definitions: [root, ...dependencies].map(r => ({ reference: { schemaId: r.schemaId, version: r.version, digest: r.digest }, definitionText: r.definitionText })) });
  return freezeNative2Value({ reference: { ...expected }, record: root, dependencies });
}
function atPath(document: unknown, path: readonly number[]): Record<string, unknown> {
  if (!Array.isArray(path) || !path.length || path.length > 32 || path.some(i => !Number.isSafeInteger(i) || i < 0)) return fail('invalid_native2_dataset_path');
  let node: unknown = document;
  for (const index of path) {
    if (!native2Record(node) || !Array.isArray(node.content) || index >= node.content.length) return fail('invalid_native2_dataset_path');
    node = node.content[index];
  }
  if (!native2Record(node) || node.stype !== 'dataset' || !native2Record(node.attributes)) return fail('invalid_native2_dataset_path');
  return node;
}
/** Pure native declaration plan. Parsed definition data never grants remote writing. */
export function planNative2OwnerDeclaration(document: ReturnType<typeof readPreserveNative2>['document'],
  previous: RegistryReference, original: RegistryDefinition, next: RegistryDefinition, path: readonly number[]) {
  if (next.schemaId !== previous.schemaId || next.version !== previous.version + 1 ||
    !native2Equal(next.parent, previous) || !native2Equal(next.scope, original.scope)) return fail('unsupported_native2_adoption');
  const fields = next.dataset.fields, priorFields = original.dataset.fields;
  if (next.dataset.name !== original.dataset.name || fields.length !== priorFields.length + 1 ||
    !native2Equal(fields.slice(0, priorFields.length), priorFields) || !native2Equal(fields.at(-1), { name: 'Owner', kind: 'text', label: '담당자' })) return fail('unsupported_native2_adoption');
  const planned = structuredClone(document), node = atPath(planned, path), attrs = node.attributes;
  if (!native2Record(attrs) || attrs.name !== original.dataset.name || !native2Equal(attrs.fields, priorFields)) return fail('native2_dataset_binding_conflict');
  attrs.fields = structuredClone(fields);
  return planned;
}
function target(source: string, base: Native2PreserveBase, choice: ResolvedNative2Version, path: readonly number[], scope: PendingNoteScope): string {
  validateNative2Draft(base, source, scope); const file = readPreserveNative2(source, scope), old = file.schemaBundle;
  if (old.selected.length !== 1) return fail('unsupported_native2_adoption');
  const previous = old.selected[0]; if (native2Equal(previous, choice.reference)) return fail('native2_already_selected');
  const next = choice.record.definition;
  if (choice.reference.schemaId !== previous.schemaId || choice.reference.version !== previous.version + 1 || !native2Equal(next.parent, previous)) return fail('unsupported_native2_adoption');
  const oldEntry = old.definitions.find(e => native2Equal(e.reference, previous)); if (!oldEntry) return fail('native2_version_conflict');
  const original = parseRegistryDefinition(oldEntry.definitionText).definition;
  const document = planNative2OwnerDeclaration(file.document, previous, original, next, path);
  const records = [choice.record, ...choice.dependencies];
  const definitions: RegistryBundle['definitions'][number][] = old.definitions.map(entry => {
    const r = records.find(r => r.schemaId === entry.reference.schemaId && r.version === entry.reference.version);
    if (!r || r.digest !== entry.reference.digest || parseRegistryDefinition(entry.definitionText).canonicalText !== r.canonicalText) return fail('native2_version_conflict');
    return { reference: { ...entry.reference }, definitionText: entry.definitionText };
  });
  for (const r of records) if (!definitions.some(e => e.reference.schemaId === r.schemaId && e.reference.version === r.version)) {
    definitions.push({ reference: { schemaId: r.schemaId, version: r.version, digest: r.digest }, definitionText: r.definitionText });
  }
  const bundle = validateRegistryBundle({ bundleVersion: 1, digestAlgorithm: REGISTRY_DIGEST, selected: [choice.reference], definitions }).bundle;
  return serializeNoteFile(document, { fileVersion: 2, schemaBundle: bundle, ...(file.savedAt !== undefined ? { savedAt: file.savedAt } : {}) });
}
async function frozen(scope: PendingNoteScope, baseValue: unknown, source: string, choice: ResolvedNative2Version, path: readonly number[], key: string, generation: number, current: () => boolean): Promise<Native2AdoptAttempt> {
  requireNative2Writable(current); validateNative2Scope(scope);
  if (typeof source !== 'string' || typeof key !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,119}$/.test(key) || !positive(generation)) return fail('invalid_native2_adoption');
  const base = await validateNative2Base(baseValue, scope, current); requireNative2Writable(current);
  const snapshotText = target(source, base, choice, path, scope), prior = readPreserveNative2(base.snapshotText, scope);
  const expectedPriorPinDigest = await hash(JSON.stringify(['wonffice.note.snapshot-pins.cas.v1', scope.tenantId, scope.workspaceId,
    base.document.documentId, 'pinned', prior.schemaBundle.selected.map(r => [r.schemaId, r.version, r.digest])]), current);
  const snapshotHash = await hash(snapshotText, current);
  const bodyText = JSON.stringify({ schemaAction: 'adopt', expectedRevision: base.document.revision, expectedSnapshotHash: base.document.snapshotHash,
    expectedPriorPinDigest, snapshotText, idempotencyKey: key });
  return freezeNative2Value({ version: 1, operation: 'update', schemaAction: 'adopt', scope: { ...scope, documentId: base.document.documentId }, generation,
    base, sourceSnapshotText: source, datasetPath: [...path], choice, snapshotText, snapshotHash, expectedPriorPinDigest, idempotencyKey: key, bodyText });
}
export async function recoverNative2AdoptAttempt(value: unknown, scope: PendingNoteScope, current: () => boolean): Promise<Native2AdoptAttempt> {
  requireNative2Writable(current);
  try {
    const v = native2Exact(value, ['version', 'operation', 'schemaAction', 'scope', 'generation', 'base', 'sourceSnapshotText', 'datasetPath', 'choice', 'snapshotText', 'snapshotHash', 'expectedPriorPinDigest', 'idempotencyKey', 'bodyText']);
    if (v.version !== 1 || v.operation !== 'update' || v.schemaAction !== 'adopt' || typeof v.sourceSnapshotText !== 'string' || typeof v.idempotencyKey !== 'string' ||
      !positive(v.generation) || !Array.isArray(v.datasetPath) || !v.datasetPath.every((i): i is number => typeof i === 'number') || !native2Record(v.choice)) return fail('invalid_native2_adoption');
    const ref = reference(v.choice.reference), choice = await decodeNative2AdoptChoice(v.choice, ref, scope, current);
    const expected = await frozen(scope, v.base, v.sourceSnapshotText, choice, v.datasetPath, v.idempotencyKey, v.generation, current);
    if (!native2Equal(expected, v)) return fail('invalid_native2_adoption'); return expected;
  } catch { requireNative2Writable(current); return fail('invalid_native2_adoption'); }
}
const direct = new WeakMap<Native2AdoptReceipt, { attempt: Native2AdoptAttempt; current: () => boolean }>();
const confirmed = new WeakMap<Native2AdoptConfirmation, () => boolean>();
export function isNative2AdoptDirect(receipt: Native2AdoptReceipt, attempt: Native2AdoptAttempt): boolean {
  const v = direct.get(receipt); try { return !!v && v.current() && native2Equal(v.attempt, attempt); } catch { return false; }
}
export function isNative2AdoptConfirmation(proof: Native2AdoptConfirmation): boolean {
  const current = confirmed.get(proof); try { return !!current && current(); } catch { return false; }
}

/** App-private first adoption prerequisite. Confirmation never installs a live source schema. */
export function createExperimentalNative2Adopter({ scope: supplied, apiBase, authorizedFetch, isCurrent, isAdoptWritableCurrent, readDurableAttempt, hasUnresolvedPrior }: {
  scope: PendingNoteScope; apiBase: string; authorizedFetch: typeof fetch; isCurrent: () => boolean; isAdoptWritableCurrent: () => boolean;
  readDurableAttempt: () => Promise<Native2AdoptAttempt | undefined>; hasUnresolvedPrior: () => Promise<boolean>;
}) {
  validateNative2Scope(supplied); const scope = freezeNative2Value({ ...supplied }), current = () => isCurrent() && isAdoptWritableCurrent();
  if (!apiBase || /[?#]/.test(apiBase)) return fail('invalid_native2_context');
  const api = apiBase.replace(/\/$/, ''), prefix = `${api}/v1/tenants/${scope.tenantId}/note-native2`;
  const choices = new WeakSet<ResolvedNative2Version>();
  const reader = createExperimentalNative2NoteReader({ ...scope, apiBase, authorizedFetch, isCurrent: current });
  const prior = async () => { requireNative2Writable(current); const unresolved = await hasUnresolvedPrior(); requireNative2Writable(current); if (unresolved) fail('native2_prior_recovery_unresolved'); };
  const request = async (url: string, options: RequestInit): Promise<unknown> => {
    requireNative2Writable(current); let response: Response;
    try { response = await authorizedFetch(url, options); }
    catch (error) { requireNative2Writable(current);
      if (native2Record(error) && (error.kind === 'unauthorized' || error.kind === 'forbidden')) throw new Native2AdoptError(error.kind === 'unauthorized' ? 401 : 403, error.kind);
      throw new Native2AdoptError(null, 'network_error'); }
    requireNative2Writable(current); let text: string;
    try { text = await response.text(); } catch { requireNative2Writable(current); throw new Native2AdoptError(null, 'network_error'); }
    requireNative2Writable(current); let body: unknown;
    try { body = parseRegistryJson(text, 1048576); } catch { throw new Native2AdoptError(response.ok ? null : response.status, response.ok ? 'invalid_native2_adoption_response' : 'http_error'); }
    if (!response.ok) throw new Native2AdoptError(response.status, native2Record(body) && typeof body.status === 'string' ? body.status : 'http_error'); return body;
  };
  const durable = async (value: Native2AdoptAttempt) => {
    await prior(); const attempt = await recoverNative2AdoptAttempt(value, scope, current), stored = await readDurableAttempt(); requireNative2Writable(current);
    if (!native2Equal(stored, attempt)) return fail('native2_adopt_attempt_not_durable'); return attempt;
  };
  const receipt = async (value: unknown, attempt: Native2AdoptAttempt): Promise<Native2AdoptReceipt> => {
    requireNative2Writable(current); const v = native2Exact(value, ['operation', 'idempotencyKey', 'requestHash', 'document', 'snapshotText']);
    if (v.operation !== 'update' || v.idempotencyKey !== attempt.idempotencyKey || !native2Digest(v.requestHash) || v.snapshotText !== attempt.snapshotText) return fail('native2_adopt_receipt_conflict');
    const document = decodeExperimentalNative2Head(v.document, scope.tenantId, scope.workspaceId, attempt.scope.documentId);
    if (document.revision !== attempt.base.document.revision + 1 || document.pageId !== attempt.base.document.pageId || document.snapshotHash !== attempt.snapshotHash ||
      await hash(v.snapshotText, current) !== attempt.snapshotHash) return fail('native2_adopt_receipt_conflict');
    readPreserveNative2(v.snapshotText, scope);
    return freezeNative2Value({ operation: 'update', idempotencyKey: v.idempotencyKey, requestHash: v.requestHash, document, snapshotText: v.snapshotText });
  };
  return Object.freeze({
    resolveExact: async (ref: RegistryReference): Promise<ResolvedNative2Version> => {
      requireNative2Writable(current); const selected = reference(ref);
      const v = native2Exact(await request(`${api}/v1/tenants/${scope.tenantId}/workspaces/${scope.workspaceId}/schemas/${selected.schemaId}/versions/${selected.version}`, { method: 'GET', cache: 'no-store' }), ['record', 'dependencies']);
      const choice = await decodeNative2AdoptChoice({ reference: selected, ...v }, selected, scope, current); requireNative2Writable(current); choices.add(choice); return choice;
    },
    freeze: async (base: Native2PreserveBase, source: string, choice: ResolvedNative2Version, path: readonly number[], key: string, generation: number) => {
      await prior(); if (!choices.has(choice)) return fail('native2_adopt_choice_not_current'); return frozen(scope, base, source, choice, path, key, generation, current);
    },
    recoverAttempt: (value: unknown) => recoverNative2AdoptAttempt(value, scope, current),
    send: async (value: Native2AdoptAttempt) => {
      const attempt = await durable(value), r = await receipt(await request(`${prefix}/documents/${attempt.scope.documentId}/snapshot`, {
        method: 'PUT', cache: 'no-store', headers: { 'Content-Type': 'application/json' }, body: attempt.bodyText }), attempt);
      requireNative2Writable(current); direct.set(r, { attempt, current }); return r;
    },
    checkReceipt: async (value: Native2AdoptAttempt) => {
      const attempt = await durable(value); return receipt(await request(`${prefix}/receipts/update/${encodeURIComponent(attempt.idempotencyKey)}`, { method: 'GET', cache: 'no-store' }), attempt);
    },
    confirm: async (value: Native2AdoptAttempt, response: Native2AdoptReceipt, knownHash?: string): Promise<Native2AdoptConfirmation | { status: 'unconfirmed'; reason: string }> => {
      const attempt = await durable(value), r = await receipt(response, attempt);
      if (knownHash !== undefined && (!native2Digest(knownHash) || knownHash !== r.requestHash)) return fail('native2_adopt_receipt_conflict');
      if (!isNative2AdoptDirect(response, attempt) && knownHash === undefined) return { status: 'unconfirmed', reason: 'adoption_receipt_not_correlated' };
      const read = await reader.open(attempt.scope.documentId); requireNative2Writable(current);
      if (!native2Equal(read.document, r.document) || read.snapshotText !== attempt.snapshotText ||
        !native2Equal(read.file.schemaBundle, readPreserveNative2(attempt.snapshotText, scope).schemaBundle)) return { status: 'unconfirmed', reason: 'current_target_head_differs' };
      const proof = freezeNative2Value({ status: 'adoption-fixed-confirmed' as const, attempt, receipt: r, read }); confirmed.set(proof, current); return proof;
    },
  });
}
