import type { Native2OriginalUpdate, Native2HistoricalAcknowledgment } from '../../office/src/native2-authenticated-receipt-recovery';
import { verifyNative2UpdateReceipt } from '../../office/src/native2-authenticated-mutation';
import { createNative2SchemaAdoptionPreview } from './native2-schema-adoption-preview';
import { readPreserveNative2 } from './experimental-native2-preserve';
import type { PendingNoteScope } from './server-pending';
import { isRegistryUuid, parseRegistryJson } from '@barocss/schema/registry-contract';
import { freezeNative2Value, native2Equal, native2Exact, native2Digest, validateNative2Base, validateNative2Draft,
  validateNative2Scope, requireNative2Writable, type Native2PreserveBase } from './experimental-native2-preserve';
import { recoverNative2AdoptAttempt, isNative2AdoptDirect, isNative2AdoptConfirmation,
  type Native2AdoptAttempt, type Native2AdoptReceipt, type Native2AdoptConfirmation } from './experimental-native2-adopt';

export interface Native2AdoptDraft { readonly generation: number; readonly snapshotText: string }
export interface Native2AdoptRecovery {
  readonly version: 1; readonly kind: 'experimental-native2-adopt'; readonly scope: PendingNoteScope & { documentId: string };
  readonly base: Native2PreserveBase; readonly latestSourceDraft: Native2AdoptDraft;
  readonly phase: 'draft' | 'pending' | 'unknown' | 'adoption-fixed-confirmed';
  readonly fixed?: Native2AdoptAttempt; readonly directRequestHash?: string;
}
/** Untrusted recovery data only. JSON cannot restore a private Office attempt or a native grant. */
export interface Native2OfficeAdoptFixed {
  readonly generation: number; readonly datasetPath: readonly number[]; readonly original: Native2OriginalUpdate;
  readonly requestHash: string; readonly candidateSnapshotHash: string;
}
export interface Native2OfficeAdoptRecovery {
  readonly version: 2; readonly kind: 'native2-office-adopt-original'; readonly scope: PendingNoteScope & { documentId: string };
  readonly base: Native2PreserveBase; readonly latestCandidate: Native2AdoptDraft;
  readonly phase: 'draft' | 'pending' | 'unknown' | 'historical-acknowledgment';
  readonly fixed?: Native2OfficeAdoptFixed;
}
const positive = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v > 0;

/** Recovery bytes only. Account-scoped prefix does not provide confidentiality or canonical content storage. */
export function createExperimentalNative2AdoptJournal({ scope: supplied, documentId, storage: suppliedStorage, isWritableCurrent }: {
  scope: PendingNoteScope; documentId: string; storage?: Storage; isWritableCurrent: () => boolean;
}) {
  validateNative2Scope(supplied); if (!isRegistryUuid(documentId)) throw new Error('invalid_native2_adopt_journal_identity');
  const scope = freezeNative2Value({ ...supplied }), owned = freezeNative2Value({ ...scope, documentId });
  const key = 'wonffice.note.experimental-native2-adopt.v1:' + encodeURIComponent(JSON.stringify([scope.issuer, scope.subject, scope.tenantId, scope.workspaceId, documentId]));
  const storage = () => suppliedStorage ?? window.localStorage, current = () => requireNative2Writable(isWritableCurrent);
  const decode = async (raw: string): Promise<Native2AdoptRecovery> => {
    current();
    try {
      const v = native2Exact(parseRegistryJson(raw, 1048576), ['version', 'kind', 'scope', 'base', 'latestSourceDraft', 'phase'], ['fixed', 'directRequestHash']);
      if (v.version !== 1 || v.kind !== 'experimental-native2-adopt' || !native2Equal(v.scope, owned) ||
        typeof v.phase !== 'string' || !['draft', 'pending', 'unknown', 'adoption-fixed-confirmed'].includes(v.phase)) throw new Error('Invalid adoption journal');
      const base = await validateNative2Base(v.base, scope, isWritableCurrent); current();
      if (base.document.documentId !== documentId) throw new Error('Foreign adoption');
      const draft = native2Exact(v.latestSourceDraft, ['generation', 'snapshotText']);
      if (!positive(draft.generation) || typeof draft.snapshotText !== 'string') throw new Error('Invalid source draft');
      validateNative2Draft(base, draft.snapshotText, scope);
      const fixed = v.fixed === undefined ? undefined : await recoverNative2AdoptAttempt(v.fixed, scope, isWritableCurrent); current();
      if ((v.phase === 'draft') === !!fixed || fixed && (!native2Equal(fixed.base, base) || !native2Equal(fixed.scope, owned) ||
        fixed.generation > draft.generation || fixed.generation === draft.generation && fixed.sourceSnapshotText !== draft.snapshotText)) throw new Error('Invalid adoption lineage');
      if (v.directRequestHash !== undefined && (!fixed || !native2Digest(v.directRequestHash)) || v.phase === 'adoption-fixed-confirmed' && !native2Digest(v.directRequestHash)) throw new Error('Invalid adoption receipt');
      return freezeNative2Value({ version: 1, kind: 'experimental-native2-adopt', scope: owned, base,
        latestSourceDraft: { generation: draft.generation, snapshotText: draft.snapshotText }, phase: v.phase as Native2AdoptRecovery['phase'],
        ...(fixed ? { fixed } : {}), ...(v.directRequestHash !== undefined ? { directRequestHash: v.directRequestHash } : {}) });
    } catch { current(); throw new Error('corrupt_native2_adopt_record'); }
  };
  const captured = async () => {
    current(); const raw = storage().getItem(key); current(); const record = raw === null ? undefined : await decode(raw); current();
    if (storage().getItem(key) !== raw) throw new Error('native2_adopt_changed_during_read'); return { raw, record };
  };
  const write = async (record: Native2AdoptRecovery, previous: string | null, origin: () => boolean = () => true) => {
    const check = () => { current(); if (!origin()) throw new Error('native2_adopt_origin_retired'); };
    check(); const raw = JSON.stringify(record), result = await decode(raw); check();
    const one = storage(); if (one.getItem(key) !== previous) throw new Error('native2_adopt_changed_before_write');
    check(); one.setItem(key, raw); check();
    if (one.getItem(key) !== raw) throw new Error('native2_adopt_write_not_verified'); check(); return result;
  };
  const read = async () => (await captured()).record;
  const writeDraft = async (baseValue: Native2PreserveBase, draft: Native2AdoptDraft) => {
    current(); const old = await captured(), base = await validateNative2Base(baseValue, scope, isWritableCurrent); current();
    if (base.document.documentId !== documentId || !positive(draft.generation) || typeof draft.snapshotText !== 'string') throw new Error('invalid_native2_adopt_draft');
    validateNative2Draft(base, draft.snapshotText, scope);
    if (old.record && !native2Equal(old.record.base, base)) throw new Error('native2_adopt_base_cannot_advance');
    if (old.record && (draft.generation < old.record.latestSourceDraft.generation || draft.generation === old.record.latestSourceDraft.generation && draft.snapshotText !== old.record.latestSourceDraft.snapshotText)) throw new Error('native2_adopt_source_generation_conflict');
    return write({ ...(old.record ?? { version: 1, kind: 'experimental-native2-adopt', scope: owned, phase: 'draft' }), base,
      latestSourceDraft: { generation: draft.generation, snapshotText: draft.snapshotText } }, old.raw);
  };
  const fix = async (value: Native2AdoptAttempt) => {
    current(); const old = await captured(), fixed = await recoverNative2AdoptAttempt(value, scope, isWritableCurrent); current();
    if (!old.record || !native2Equal(fixed.base, old.record.base) || !native2Equal(fixed.scope, owned) ||
      fixed.generation !== old.record.latestSourceDraft.generation || fixed.sourceSnapshotText !== old.record.latestSourceDraft.snapshotText) throw new Error('native2_adopt_source_not_protected');
    if (old.record.fixed && !native2Equal(old.record.fixed, fixed)) throw new Error('fixed_native2_adoption_cannot_be_replaced');
    return write({ ...old.record, fixed, phase: old.record.fixed ? old.record.phase : 'pending' }, old.raw);
  };
  const transition = async (attempt: Native2AdoptAttempt, change: (record: Native2AdoptRecovery) => Native2AdoptRecovery, origin?: () => boolean) => {
    current(); const old = await captured();
    if (!old.record?.fixed || !native2Equal(old.record.fixed, attempt)) throw new Error('native2_adopt_fixed_conflict');
    return write(change(old.record), old.raw, origin);
  };
  const markUnknown = (attempt: Native2AdoptAttempt) => transition(attempt, record => {
    if (record.phase === 'adoption-fixed-confirmed') throw new Error('native2_adopt_confirmation_cannot_regress'); return { ...record, phase: 'unknown' };
  });
  const observeDirect = (attempt: Native2AdoptAttempt, receipt: Native2AdoptReceipt) => transition(attempt, record => {
    if (!isNative2AdoptDirect(receipt, attempt) || record.directRequestHash !== undefined && record.directRequestHash !== receipt.requestHash) throw new Error('native2_adopt_receipt_not_correlated');
    return { ...record, directRequestHash: receipt.requestHash };
  }, () => isNative2AdoptDirect(receipt, attempt));
  const confirmFixed = (proof: Native2AdoptConfirmation) => {
    current(); if (!isNative2AdoptConfirmation(proof)) throw new Error('native2_adopt_confirmation_not_verified');
    return transition(proof.attempt, record => {
      if (record.directRequestHash !== proof.receipt.requestHash) throw new Error('native2_adopt_receipt_not_durable');
      return { ...record, phase: 'adoption-fixed-confirmed' };
    }, () => isNative2AdoptConfirmation(proof));
  };
  // Same key and storage. Version-specific decoders refuse cross-version replacement and preserve raw bytes.
  const digest = async (text: string) => {
    current(); const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)); current();
    return Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, '0')).join('');
  };
  const candidate = (value: unknown): Native2AdoptDraft => {
    const v = native2Exact(value, ['generation', 'snapshotText']);
    if (!positive(v.generation) || typeof v.snapshotText !== 'string') throw new Error('invalid_native2_adopt_draft');
    const bytes = new TextEncoder().encode(v.snapshotText);
    if (bytes.length > 524288 || new TextDecoder('utf-8', { fatal: true }).decode(bytes) !== v.snapshotText) throw new Error('invalid_native2_adopt_draft');
    // Incomplete later edits must survive recovery, without qualifying them as a usable candidate.
    return { generation: v.generation, snapshotText: v.snapshotText };
  };
  const officeFixed = async (value: unknown, base: Native2PreserveBase): Promise<Native2OfficeAdoptFixed> => {
    const v = native2Exact(value, ['generation', 'datasetPath', 'original', 'requestHash', 'candidateSnapshotHash']);
    const o = native2Exact(v.original, ['tenantId', 'workspaceId', 'documentId', 'expectedRevision', 'expectedSnapshotHash',
      'expectedPriorPinDigest', 'snapshotText', 'schemaAction', 'idempotencyKey']);
    if (!positive(v.generation) || !Array.isArray(v.datasetPath) || !v.datasetPath.length ||
      v.datasetPath.some(n => typeof n !== 'number' || !Number.isSafeInteger(n) || n < 0) ||
      o.tenantId !== scope.tenantId || o.workspaceId !== scope.workspaceId || o.documentId !== documentId ||
      o.expectedRevision !== base.document.revision || base.document.revision >= Number.MAX_SAFE_INTEGER ||
      o.expectedSnapshotHash !== base.document.snapshotHash || typeof o.snapshotText !== 'string' ||
      o.schemaAction !== 'adopt' || typeof o.idempotencyKey !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,119}$/.test(o.idempotencyKey))
      throw new Error('invalid_native2_office_adopt_original');
    const text = candidate({ generation: v.generation, snapshotText: o.snapshotText }).snapshotText;
    const path: number[] = v.datasetPath;
    const preview = createNative2SchemaAdoptionPreview(base.snapshotText, text, path);
    preview.dispose(); current();
    const file = readPreserveNative2(base.snapshotText, scope);
    const pinDigest = await digest(JSON.stringify(['wonffice.note.snapshot-pins.cas.v1', scope.tenantId, scope.workspaceId,
      documentId, 'pinned', file.schemaBundle.selected.map(ref => [ref.schemaId, ref.version, ref.digest])]));
    if (o.expectedPriorPinDigest !== pinDigest) throw new Error('invalid_native2_office_adopt_original');
    const original: Native2OriginalUpdate = { tenantId: scope.tenantId, workspaceId: scope.workspaceId, documentId,
      expectedRevision: base.document.revision, expectedSnapshotHash: base.document.snapshotHash,
      expectedPriorPinDigest: pinDigest, snapshotText: text, schemaAction: 'adopt', idempotencyKey: o.idempotencyKey };
    const requestHash = await digest(JSON.stringify(['note-native2-snapshot-v1', original.tenantId, original.workspaceId,
      original.documentId, original.schemaAction, original.expectedRevision, original.expectedSnapshotHash,
      original.expectedPriorPinDigest, original.snapshotText]));
    const candidateSnapshotHash = await digest(text);
    if (v.requestHash !== requestHash || v.candidateSnapshotHash !== candidateSnapshotHash) throw new Error('invalid_native2_office_adopt_original');
    return freezeNative2Value({ generation: v.generation, datasetPath: [...path], original, requestHash, candidateSnapshotHash });
  };
  const decodeOffice = async (raw: string): Promise<Native2OfficeAdoptRecovery> => {
    current();
    try {
      const v = native2Exact(parseRegistryJson(raw, 1048576), ['version', 'kind', 'scope', 'base', 'latestCandidate', 'phase'], ['fixed']);
      if (v.version !== 2 || v.kind !== 'native2-office-adopt-original' || !native2Equal(v.scope, owned) ||
        typeof v.phase !== 'string' || !['draft', 'pending', 'unknown', 'historical-acknowledgment'].includes(v.phase)) throw new Error('Invalid Office journal');
      const base = await validateNative2Base(v.base, scope, isWritableCurrent); current();
      if (base.document.documentId !== documentId) throw new Error('Foreign adoption');
      const latestCandidate = candidate(v.latestCandidate);
      const fixed = v.fixed === undefined ? undefined : await officeFixed(v.fixed, base); current();
      if ((v.phase === 'draft') === !!fixed || fixed && (fixed.generation > latestCandidate.generation ||
        fixed.generation === latestCandidate.generation && fixed.original.snapshotText !== latestCandidate.snapshotText)) throw new Error('Invalid Office lineage');
      return freezeNative2Value({ version: 2, kind: 'native2-office-adopt-original', scope: owned, base, latestCandidate,
        phase: v.phase as Native2OfficeAdoptRecovery['phase'], ...(fixed ? { fixed } : {}) });
    } catch { current(); throw new Error('corrupt_native2_office_adopt_record'); }
  };
  const captureOffice = async () => {
    current(); const raw = storage().getItem(key); current(); const record = raw === null ? undefined : await decodeOffice(raw); current();
    if (storage().getItem(key) !== raw) throw new Error('native2_adopt_changed_during_read'); return { raw, record };
  };
  const writeOffice = async (record: Native2OfficeAdoptRecovery, previous: string | null, origin: () => boolean = () => true) => {
    const check = () => { current(); requireNative2Writable(origin); };
    check(); const raw = JSON.stringify(record), result = await decodeOffice(raw); check();
    const one = storage(); if (one.getItem(key) !== previous) throw new Error('native2_adopt_changed_before_write');
    check(); one.setItem(key, raw); check();
    if (one.getItem(key) !== raw) throw new Error('native2_adopt_write_not_verified'); check(); return result;
  };
  const writeCandidate = async (baseValue: Native2PreserveBase, suppliedDraft: Native2AdoptDraft, origin: () => boolean = () => true) => {
    current(); const latestCandidate = candidate(suppliedDraft), old = await captureOffice();
    const base = await validateNative2Base(baseValue, scope, isWritableCurrent); current();
    if (base.document.documentId !== documentId) throw new Error('invalid_native2_adopt_draft');
    if (old.record && !native2Equal(old.record.base, base)) throw new Error('native2_adopt_base_cannot_advance');
    if (old.record && (latestCandidate.generation < old.record.latestCandidate.generation ||
      latestCandidate.generation === old.record.latestCandidate.generation && latestCandidate.snapshotText !== old.record.latestCandidate.snapshotText))
      throw new Error('native2_adopt_source_generation_conflict');
    return writeOffice({ ...(old.record ?? { version: 2, kind: 'native2-office-adopt-original', scope: owned, phase: 'draft' }), base, latestCandidate }, old.raw, origin);
  };
  const fixOriginal = async (input: unknown, datasetPath: readonly number[], generation: number, origin: () => boolean = () => true) => {
    current();
    // Capture all caller data before any await. The result remains untrusted operation data.
    const original = native2Exact(input, ['tenantId', 'workspaceId', 'documentId', 'expectedRevision', 'expectedSnapshotHash',
      'expectedPriorPinDigest', 'snapshotText', 'schemaAction', 'idempotencyKey']);
    const copied = { ...original }, path = [...datasetPath];
    const old = await captureOffice();
    if (!old.record || generation !== old.record.latestCandidate.generation || copied.snapshotText !== old.record.latestCandidate.snapshotText)
      throw new Error('native2_adopt_source_not_protected');
    const requestHash = await digest(JSON.stringify(['note-native2-snapshot-v1', copied.tenantId, copied.workspaceId,
      copied.documentId, copied.schemaAction, copied.expectedRevision, copied.expectedSnapshotHash, copied.expectedPriorPinDigest, copied.snapshotText]));
    const candidateSnapshotHash = typeof copied.snapshotText === 'string' ? await digest(copied.snapshotText) : '';
    const fixed = await officeFixed({ generation, datasetPath: path, original: copied, requestHash, candidateSnapshotHash }, old.record.base); current();
    if (old.record.fixed && !native2Equal(old.record.fixed, fixed)) throw new Error('fixed_native2_adoption_cannot_be_replaced');
    return writeOffice({ ...old.record, fixed, phase: old.record.fixed ? old.record.phase : 'pending' }, old.raw, origin);
  };
  const transitionOffice = async (fixed: Native2OfficeAdoptFixed, phase: Native2OfficeAdoptRecovery['phase'],
    origin: () => boolean = () => true) => {
    current(); const copied = JSON.stringify(fixed), old = await captureOffice();
    if (!old.record?.fixed || JSON.stringify(old.record.fixed) !== copied) throw new Error('native2_adopt_fixed_conflict');
    if (old.record.phase === 'historical-acknowledgment' && phase !== 'historical-acknowledgment') throw new Error('native2_adopt_confirmation_cannot_regress');
    return writeOffice({ ...old.record, phase }, old.raw, origin);
  };
  const observeHistorical = async (fixed: Native2OfficeAdoptFixed, acknowledgment: Native2HistoricalAcknowledgment) => {
    current(); requireNative2Writable(acknowledgment.isCurrent);
    if (acknowledgment.kind !== 'historical_acknowledgment' || !native2Equal(acknowledgment.original, fixed.original))
      throw new Error('native2_adopt_receipt_not_correlated');
    const file = readPreserveNative2(fixed.original.snapshotText, scope);
    const pageId = file.document.attributes?.pageId;
    if (typeof pageId !== 'string') throw new Error('native2_adopt_receipt_not_correlated');
    verifyNative2UpdateReceipt(acknowledgment.receipt, { ...fixed.original, pageId,
      requestHash: fixed.requestHash, candidateSnapshotHash: fixed.candidateSnapshotHash });
    return transitionOffice(fixed, 'historical-acknowledgment', acknowledgment.isCurrent);
  };
  const office = Object.freeze({ read: async () => (await captureOffice()).record, writeCandidate, fix: fixOriginal,
    markUnknown: (fixed: Native2OfficeAdoptFixed) => transitionOffice(fixed, 'unknown'), observeHistorical });
  return Object.freeze({ key, read, writeDraft, fix, markUnknown, observeDirect, confirmFixed, office });
}
