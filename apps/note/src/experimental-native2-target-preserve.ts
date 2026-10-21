import { isRegistryUuid } from '@barocss/schema/registry-contract';
import type { PendingNoteScope } from './server-pending';
import { createExperimentalNative2Preserver, validateNative2Scope, native2Digest, requireNative2Writable, type Native2PreserveBase, type Native2FixedConfirmation } from './experimental-native2-preserve';
import { createExperimentalNative2PendingJournal } from './experimental-native2-preserve-pending';

/** One virtual existing journal key; never expose/delete another owner's physical record. */
export function createNative2TargetStorage({ scope, documentId, adoptionKey, targetSeedHash, storage: supplied, isCurrent }: {
  scope: PendingNoteScope; documentId: string; adoptionKey: string; targetSeedHash: string; storage: Storage; isCurrent: () => boolean;
}) {
  validateNative2Scope(scope);
  if (!isRegistryUuid(documentId) || typeof adoptionKey !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,119}$/.test(adoptionKey) || !native2Digest(targetSeedHash)) throw new Error('invalid_native2_target_recovery_scope');
  const parts = [scope.issuer, scope.subject, scope.tenantId, scope.workspaceId, documentId];
  const virtualKey = 'wonffice.note.experimental-native2-preserve.v1:' + encodeURIComponent(JSON.stringify(parts));
  const physicalKey = 'wonffice.note.experimental-native2-target-preserve.v1:' + encodeURIComponent(JSON.stringify([...parts, adoptionKey, targetSeedHash]));
  const current = () => requireNative2Writable(isCurrent);
  const one: Storage = {
    get length() { current(); const value = supplied.getItem(physicalKey); current(); return value === null ? 0 : 1; },
    key: index => { current(); const value = index === 0 && supplied.getItem(physicalKey) !== null ? virtualKey : null; current(); return value; },
    getItem: key => { current(); const value = key === virtualKey ? supplied.getItem(physicalKey) : null; current(); return value; },
    setItem: (key, value) => { current(); if (key !== virtualKey || typeof value !== 'string') throw new Error('native2_target_virtual_key_conflict'); supplied.setItem(physicalKey, value); current(); },
    removeItem: () => { throw new Error('native2_target_recovery_removal_refused'); },
    clear: () => { throw new Error('native2_target_recovery_removal_refused'); },
  };
  return Object.freeze({ virtualKey, physicalKey, storage: one });
}

/** Separate explicit target save. This never touches the old adoption request or source journal. */
export function createNative2TargetPreserve({ scope, documentId, adoptionKey, targetSeedHash, storage, apiBase, authorizedFetch, isCurrent }: {
  scope: PendingNoteScope; documentId: string; adoptionKey: string; targetSeedHash: string; storage: Storage;
  apiBase: string; authorizedFetch: typeof fetch; isCurrent: () => boolean;
}) {
  const mapped = createNative2TargetStorage({ scope, documentId, adoptionKey, targetSeedHash, storage, isCurrent });
  const journal = createExperimentalNative2PendingJournal({ scope, documentId, storage: mapped.storage, isWritableCurrent: isCurrent });
  const read = async () => {
    const record = await journal.read(); requireNative2Writable(isCurrent);
    const seed = record?.lineage?.[0]?.fixed.base ?? record?.base;
    if (seed && (seed.document.documentId !== documentId || seed.document.snapshotHash !== targetSeedHash)) throw new Error('native2_target_seed_conflict');
    return record;
  };
  const writer = createExperimentalNative2Preserver({ scope, apiBase, authorizedFetch, isCurrent, isWritableCurrent: isCurrent, readDurableAttempt: async () => (await read())?.fixed });
  return Object.freeze({ ...mapped, journal: Object.freeze({ ...journal, read }), writer,
    protect: async (base: Native2PreserveBase, snapshotText: string, generation: number) => {
      const old = await read(); requireNative2Writable(isCurrent);
      if (base.document.documentId !== documentId || !old && base.document.snapshotHash !== targetSeedHash) throw new Error('native2_target_seed_conflict');
      return journal.writeDraft(base, { snapshotText, generation });
    },
    freeze: async (base: Native2PreserveBase, snapshotText: string, generation: number, key: string) => {
      requireNative2Writable(isCurrent); if (base.document.documentId !== documentId || key === adoptionKey) throw new Error('native2_target_save_identity_conflict');
      const existing = await read(); requireNative2Writable(isCurrent);
      if (!existing && base.document.snapshotHash !== targetSeedHash) throw new Error('native2_target_seed_conflict');
      if (existing?.fixed) throw new Error('native2_target_fixed_requires_explicit_retry');
      await journal.writeDraft(base, { snapshotText, generation }); requireNative2Writable(isCurrent);
      const attempt = await writer.freeze(base, snapshotText, key, generation); requireNative2Writable(isCurrent);
      await journal.fix(attempt); requireNative2Writable(isCurrent); return attempt;
    },
    nextFixed: (proof: Native2FixedConfirmation, next: Parameters<typeof journal.nextFixed>[1]) => {
      requireNative2Writable(isCurrent); if (next.idempotencyKey === adoptionKey || next.scope.documentId !== documentId) throw new Error('native2_target_save_identity_conflict');
      return journal.nextFixed(proof, next);
    },
  });
}
