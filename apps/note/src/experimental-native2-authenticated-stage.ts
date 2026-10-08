import { createNoteNative2Context, openNoteNativeSnapshot, type NativeNoteSession, type NoteSession } from '@barocss/office-note';
import { native2Equal } from './experimental-native2-preserve';
import type { ExperimentalNative2Read } from './experimental-native2-reader';

type Scope = Readonly<{ issuer: string; subject: string; currentUserId: string | null | undefined;
  tenantId: string; workspaceId: string; documentId: string }>;

/** Supplied only by the private Office authenticated reader. This data lease grants no editing rights. */
export interface Native2StageReadLease {
  readonly read: ExperimentalNative2Read;
  readonly provenance: Scope & Readonly<{ role: 'owner' | 'admin' | 'editor' | 'viewer' }>;
  readonly isCurrent: () => boolean;
  readonly retire: () => void;
}

export interface Native2StageReadFactory {
  readonly open: (scope: Readonly<{ tenantId: string; workspaceId: string; documentId: string }>) => Promise<Native2StageReadLease>;
  readonly isCurrent: () => boolean;
  readonly retire: () => void;
}

export interface Native2StageSource {
  readonly session: NoteSession;
  readonly authority: NoteSession;
  readonly resourceIds: readonly string[];
  readonly scope: Scope;
  /** Exact retained source bytes verified against the current model, or refusal. Never acknowledge pending input. */
  readonly sourceSnapshot: () => string;
  readonly isCurrent: () => boolean;
  readonly subscribeAuthority: (retire: () => void) => () => void;
}

export interface Native2ReadonlyStage {
  readonly session: NativeNoteSession;
  readonly read: ExperimentalNative2Read;
  readonly isCurrent: () => boolean;
  readonly dispose: () => void;
}

const changed = (): never => { throw new Error('native2_stage_source_changed'); };
const invalid = (): never => { throw new Error('native2_stage_read_invalid'); };
const readRetired = (): never => { throw new Error('native2_stage_read_retired'); };

function captureSource(source: Native2StageSource): () => boolean {
  const { session, authority } = source;
  const root = session.rootId, sid = session.session, epoch = session.editor.dataStore.getDocumentEpoch();
  const rootNode = session.editor.dataStore.getNode(root);
  const resourceIds = [...source.resourceIds];
  const resources = resourceIds.map(id => ({ id, node: session.editor.dataStore.getNode(id) }));
  const authorityRoot = authority.rootId, authoritySid = authority.session;
  const authorityEpoch = authority.editor.dataStore.getDocumentEpoch();
  const manager = session.editor.historyManager, index = manager.getCurrentIndex();
  const entries = manager.getHistory().map(entry => ({ entry, operations: entry.operations,
    inverse: entry.inverseOperations, forward: [...entry.operations], backward: [...entry.inverseOperations] }));
  if (!rootNode || new Set(resourceIds).size !== resourceIds.length ||
    resources.some(resource => !resource.node || resource.node.stype !== 'richText')) changed();
  let raw: string;
  try { raw = source.sourceSnapshot(); } catch { return changed(); }
  return () => {
    try {
      if (!source.isCurrent() || session.rootId !== root || session.session !== sid ||
        session.editor.dataStore.getDocumentEpoch() !== epoch || session.editor.dataStore.getNode(root) !== rootNode ||
        resources.some(resource => session.editor.dataStore.getNode(resource.id) !== resource.node) ||
        authority.rootId !== authorityRoot ||
        authority.session !== authoritySid || authority.editor.dataStore.getDocumentEpoch() !== authorityEpoch ||
        session.editor.historyManager !== manager || manager.getCurrentIndex() !== index || source.sourceSnapshot() !== raw) return false;
      const now = manager.getHistory();
      return now.length === entries.length && entries.every((before, at) => {
        const one = now[at];
        return one === before.entry && one.operations === before.operations && one.inverseOperations === before.inverse &&
          one.operations.length === before.forward.length && one.operations.every((operation, i) => operation === before.forward[i]) &&
          one.inverseOperations.length === before.backward.length && one.inverseOperations.every((operation, i) => operation === before.backward[i]);
      });
    } catch { return false; }
  };
}

/** Explicit, non-mounting Note staging. The Office host alone supplies a real read lease and authority subscription. */
export function createExperimentalNative2ReadStage({ source, readFresh }: {
  source: Native2StageSource;
  readFresh: () => Promise<Native2StageReadLease>;
}) {
  let disposed = false, generation = 0, active: Native2ReadonlyStage | undefined;
  const retire = () => { disposed = true; ++generation; active?.dispose(); active = undefined; };
  const unsubscribe = source.subscribeAuthority(retire);
  const stage = async (): Promise<Native2ReadonlyStage> => {
    if (disposed) changed();
    active?.dispose(); active = undefined;
    const own = ++generation;
    const sourceCurrent = captureSource(source);
    if (!sourceCurrent()) changed();
    let lease: Native2StageReadLease | undefined;
    let candidate: NativeNoteSession | undefined;
    const current = () => {
      try { return !disposed && generation === own && sourceCurrent() && !!lease?.isCurrent(); }
      catch { return false; }
    };
    try {
      lease = await readFresh();
      if (!sourceCurrent() || disposed || generation !== own) changed();
      if (!lease.isCurrent()) readRetired();
      const { read, provenance } = lease;
      if (provenance.issuer !== source.scope.issuer || provenance.subject !== source.scope.subject ||
        provenance.currentUserId !== source.scope.currentUserId ||
        provenance.tenantId !== source.scope.tenantId || provenance.workspaceId !== source.scope.workspaceId ||
        provenance.documentId !== source.scope.documentId ||
        read.document.documentId !== source.scope.documentId || read.document.tenantId !== source.scope.tenantId ||
        read.document.workspaceId !== source.scope.workspaceId) invalid();
      const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(read.snapshotText));
      if (!sourceCurrent() || disposed || generation !== own) changed();
      if (!lease.isCurrent()) readRetired();
      const hash = Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, '0')).join('');
      if (hash !== read.document.snapshotHash) invalid();
      const context = createNoteNative2Context(read.snapshotText);
      const parsed = { fileVersion: 2, document: context.document, schemaBundle: context.schemaBundle,
        ...(context.savedAt !== undefined ? { savedAt: context.savedAt } : {}) };
      if (!native2Equal(parsed, read.file) || context.document.attributes?.pageId !== read.document.pageId) invalid();
      candidate = openNoteNativeSnapshot(context);
      if (!current()) changed();
      if (candidate.editor.isEditable || candidate.exportSnapshot() !== read.snapshotText ||
        !native2Equal(candidate.exportNativeDocument(), context.document)) invalid();
      const session = candidate, held = lease;
      let retired = false;
      const dispose = () => { if (retired) return; retired = true; held.retire(); session.close(); };
      const result: Native2ReadonlyStage = Object.freeze({ session, read,
        isCurrent: () => {
          if (retired) return false;
          if (!current() || session.editor.isEditable) { dispose(); return false; }
          return true;
        }, dispose });
      active = result;
      return result;
    } catch (error) {
      candidate?.close();
      lease?.retire();
      throw error;
    }
  };
  return Object.freeze({ stage, dispose: () => { retire(); unsubscribe(); } });
}
