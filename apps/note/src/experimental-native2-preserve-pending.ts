import type { PendingNoteScope } from './server-pending';
import {
  freezeNative2Value, isNative2DirectReceipt, isNative2FixedConfirmation, native2Digest, native2Equal, native2Exact,
  requireNative2Writable, recoverNative2PreserveAttempt, validateNative2Base, validateNative2Draft, validateNative2Scope,
  type Native2PreserveAttempt, type Native2PreserveBase, type Native2PreserveReceipt, type Native2FixedConfirmation,
} from './experimental-native2-preserve';
import { isRegistryUuid, parseRegistryJson } from '@barocss/schema/registry-contract';

export interface Native2RecoveryDraft { readonly generation: number; readonly snapshotText: string }
export interface Native2RecoveryRecord {
  readonly version: 1; readonly kind: 'experimental-native2-preserve';
  readonly scope: PendingNoteScope & { documentId: string }; readonly base: Native2PreserveBase;
  readonly latestDraft: Native2RecoveryDraft; readonly phase: 'draft' | 'pending' | 'unknown' | 'fixed-confirmed';
  readonly fixed?: Native2PreserveAttempt; readonly directRequestHash?: string;
  readonly lineage?: ReadonlyArray<{ readonly fixed: Native2PreserveAttempt; readonly requestHash: string }>;
}
const prefix = 'wonffice.note.experimental-native2-preserve.v1:';
const positive = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value > 0;

/** Recovery-only Storage journal. Prefix separation is not encryption or an account confidentiality boundary. */
export function createExperimentalNative2PendingJournal({ scope: inputScope, documentId, storage: suppliedStorage, isWritableCurrent }: {
  scope: PendingNoteScope; documentId: string; storage?: Storage; isWritableCurrent: () => boolean;
}) {
  validateNative2Scope(inputScope);
  if (!isRegistryUuid(documentId)) throw new Error('invalid_native2_journal_identity');
  const scope = freezeNative2Value({ ...inputScope }), ownedScope = freezeNative2Value({ ...scope, documentId });
  const key = prefix + encodeURIComponent(JSON.stringify([scope.issuer, scope.subject, scope.tenantId, scope.workspaceId, documentId]));
  const storage = () => suppliedStorage ?? window.localStorage;
  const current = () => requireNative2Writable(isWritableCurrent);
  const decode = async (raw: string): Promise<Native2RecoveryRecord> => {
    current();
    try {
      const v = native2Exact(parseRegistryJson(raw, 1048576), ['version', 'kind', 'scope', 'base', 'latestDraft', 'phase'], ['fixed', 'directRequestHash', 'lineage']);
      if (v.version !== 1 || v.kind !== 'experimental-native2-preserve' || !native2Equal(v.scope, ownedScope) ||
        !['draft', 'pending', 'unknown', 'fixed-confirmed'].includes(String(v.phase))) throw new Error('Invalid journal');
      const base = await validateNative2Base(v.base, scope, isWritableCurrent); current();
      if (base.document.documentId !== documentId) throw new Error('Foreign document');
      const draft = native2Exact(v.latestDraft, ['generation', 'snapshotText']);
      if (!positive(draft.generation) || typeof draft.snapshotText !== 'string') throw new Error('Invalid draft');
      validateNative2Draft(base, draft.snapshotText, scope);
      const fixed = v.fixed === undefined ? undefined : await recoverNative2PreserveAttempt(v.fixed, scope, isWritableCurrent); current();
      if ((v.phase === 'draft') === !!fixed || fixed && (!native2Equal(fixed.base, base) || fixed.scope.documentId !== documentId ||
        fixed.generation > draft.generation || fixed.generation === draft.generation && fixed.snapshotText !== draft.snapshotText)) throw new Error('Invalid fixed lineage');
      if (v.directRequestHash !== undefined && (!fixed || !native2Digest(v.directRequestHash)) || v.phase === 'fixed-confirmed' && !native2Digest(v.directRequestHash)) throw new Error('Invalid receipt lineage');
      const lineage: Array<{ fixed: Native2PreserveAttempt; requestHash: string }> = [];
      if (v.lineage !== undefined) {
        if (!Array.isArray(v.lineage) || !v.lineage.length || v.lineage.length > 256) throw new Error('Invalid lineage');
        let generation = 0;
        for (const entry of v.lineage) {
          const l = native2Exact(entry, ['fixed', 'requestHash']);
          const prior = await recoverNative2PreserveAttempt(l.fixed, scope, isWritableCurrent); current();
          if (!native2Digest(l.requestHash) || prior.scope.documentId !== documentId || prior.base.document.pageId !== base.document.pageId ||
            prior.generation <= generation || prior.generation >= (fixed?.generation ?? draft.generation) || prior.base.document.revision >= base.document.revision) throw new Error('Invalid lineage');
          generation = prior.generation; lineage.push({ fixed: prior, requestHash: l.requestHash });
        }
      }
      return freezeNative2Value({ version: 1, kind: 'experimental-native2-preserve', scope: ownedScope, base,
        latestDraft: { generation: draft.generation, snapshotText: draft.snapshotText }, phase: v.phase as Native2RecoveryRecord['phase'],
        ...(fixed ? { fixed } : {}), ...(v.directRequestHash !== undefined ? { directRequestHash: v.directRequestHash } : {}),
        ...(lineage.length ? { lineage } : {}) });
    } catch { current(); throw new Error('corrupt_native2_pending_record'); }
  };
  const read = async (): Promise<Native2RecoveryRecord | undefined> => {
    current(); const raw = storage().getItem(key); current();
    if (raw === null) return undefined;
    const value = await decode(raw); current();
    if (storage().getItem(key) !== raw) throw new Error('native2_pending_changed_during_read'); return value;
  };
  const write = async (record: Native2RecoveryRecord, previousRaw: string | null, originValid: () => boolean = () => true) => {
    const origin = () => { if (!originValid()) throw new Error('native2_origin_proof_retired'); };
    current(); origin(); const raw = JSON.stringify(record); const decoded = await decode(raw); current(); origin();
    const one = storage(); if (one.getItem(key) !== previousRaw) throw new Error('native2_pending_changed_before_write');
    current(); origin(); one.setItem(key, raw); current(); origin();
    if (one.getItem(key) !== raw) throw new Error('native2_pending_write_not_verified'); origin(); return decoded;
  };
  const captured = async () => {
    current(); const raw = storage().getItem(key); current(); const record = raw === null ? undefined : await decode(raw); current();
    if (storage().getItem(key) !== raw) throw new Error('native2_pending_changed_during_read'); return { raw, record };
  };
  const writeDraft = async (baseValue: Native2PreserveBase, draft: Native2RecoveryDraft) => {
    current(); const prior = await captured(), base = await validateNative2Base(baseValue, scope, isWritableCurrent); current();
    if (base.document.documentId !== documentId || !positive(draft.generation) || typeof draft.snapshotText !== 'string') throw new Error('invalid_native2_pending_draft');
    validateNative2Draft(base, draft.snapshotText, scope);
    if (prior.record && !native2Equal(prior.record.base, base)) throw new Error('native2_base_cannot_advance_implicitly');
    if (prior.record && (draft.generation < prior.record.latestDraft.generation || draft.generation === prior.record.latestDraft.generation &&
      draft.snapshotText !== prior.record.latestDraft.snapshotText)) throw new Error('native2_draft_generation_conflict');
    return write({ ...(prior.record ?? { version: 1, kind: 'experimental-native2-preserve', scope: ownedScope, phase: 'draft' }),
      base, latestDraft: { generation: draft.generation, snapshotText: draft.snapshotText } }, prior.raw);
  };
  const fix = async (value: Native2PreserveAttempt) => {
    current(); const prior = await captured(); const fixed = await recoverNative2PreserveAttempt(value, scope, isWritableCurrent); current();
    if (!prior.record || !native2Equal(prior.record.base, fixed.base) || !native2Equal(fixed.scope, ownedScope) ||
      fixed.generation !== prior.record.latestDraft.generation || fixed.snapshotText !== prior.record.latestDraft.snapshotText) throw new Error('native2_fixed_draft_mismatch');
    if (prior.record.fixed && !native2Equal(prior.record.fixed, fixed)) throw new Error('fixed_native2_attempt_cannot_be_replaced');
    return write({ ...prior.record, fixed, phase: prior.record.fixed ? prior.record.phase : 'pending' }, prior.raw);
  };
  const transition = async (attempt: Native2PreserveAttempt, transform: (record: Native2RecoveryRecord) => Native2RecoveryRecord, originValid?: () => boolean) => {
    current(); const prior = await captured();
    if (!prior.record?.fixed || !native2Equal(prior.record.fixed, attempt)) throw new Error('native2_fixed_draft_mismatch');
    return write(transform(prior.record), prior.raw, originValid);
  };
  const markUnknown = (attempt: Native2PreserveAttempt) => transition(attempt, record => {
    if (record.phase === 'fixed-confirmed') throw new Error('native2_confirmation_cannot_regress'); return { ...record, phase: 'unknown' };
  });
  const observeDirect = (attempt: Native2PreserveAttempt, receipt: Native2PreserveReceipt) => transition(attempt, record => {
    if (!isNative2DirectReceipt(receipt, attempt) || record.directRequestHash !== undefined && record.directRequestHash !== receipt.requestHash) throw new Error('native2_receipt_not_correlated');
    return { ...record, directRequestHash: receipt.requestHash };
  }, () => isNative2DirectReceipt(receipt, attempt));
  const confirmFixed = (proof: Native2FixedConfirmation) => {
    current(); if (!isNative2FixedConfirmation(proof)) throw new Error('native2_confirmation_not_verified');
    return transition(proof.attempt, record => {
      if (record.directRequestHash !== proof.receipt.requestHash) throw new Error('native2_receipt_not_durable');
      return { ...record, phase: 'fixed-confirmed' };
    }, () => isNative2FixedConfirmation(proof));
  };
  /** Explicit subsequent freeze only after this owner's own verified fixed confirmation; never a foreign latest head. */
  const nextFixed = async (proof: Native2FixedConfirmation, next: Native2PreserveAttempt) => {
    current(); if (!isNative2FixedConfirmation(proof)) throw new Error('native2_confirmation_not_verified');
    const prior = await captured(), fixed = await recoverNative2PreserveAttempt(next, scope, isWritableCurrent); current();
    const record = prior.record;
    if (!record || record.phase !== 'fixed-confirmed' || !native2Equal(record.fixed, proof.attempt) || record.directRequestHash !== proof.receipt.requestHash ||
      !native2Equal(fixed.base, { document: proof.read.document, snapshotText: proof.read.snapshotText }) || !native2Equal(fixed.scope, ownedScope) ||
      fixed.generation <= proof.generation || fixed.generation !== record.latestDraft.generation || fixed.snapshotText !== record.latestDraft.snapshotText) throw new Error('native2_next_fixed_conflict');
    return write({ version: 1, kind: 'experimental-native2-preserve', scope: ownedScope, base: fixed.base,
      latestDraft: record.latestDraft, fixed, phase: 'pending', lineage: [...(record.lineage ?? []), { fixed: proof.attempt, requestHash: proof.receipt.requestHash }] },
      prior.raw, () => isNative2FixedConfirmation(proof));
  };
  return Object.freeze({ key, read, writeDraft, fix, markUnknown, observeDirect, confirmFixed, nextFixed });
}
