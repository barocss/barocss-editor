import type { Editor } from '@barocss/editor-core';
import {
  registerPreCommitGuard,
  registerPreExecutionGuard,
  type PreCommitGuardContext,
  type TransactionOperation,
} from '@barocss/model';

/** IDs supplied by the authorized host, not by an editor document's transient sid. */
export interface NoteResourceBinding {
  issuer: string;
  subject: string;
  tenantId: string;
  workspaceId: string;
  documentId: string;
  /** Stable canonical provider node ID. A nested item body binds separately. */
  resourceId: string;
  /** Stable parent row/resource ID for a nested item body. */
  parentResourceId?: string;
  actorId: string;
  sessionId: string;
}

/** An immutable, per-transaction recovery intent. This is not provider proof. */
export interface NoteRecoveryIntent {
  version: 1;
  /** Prepared is durable before the overlay; executed adds the final operation results. */
  phase: 'prepared' | 'executed';
  binding: NoteResourceBinding;
  editId: string;
  origin: 'local' | 'history';
  baseCheckpoint: string;
  candidateRootId: string;
  /** Exact input or executed descriptors, including undefined fields. */
  operations: TransactionOperation[];
}

export interface NotePrecommitOptions {
  editor: Editor;
  binding: NoteResourceBinding;
  /** Reject unsupported operations and unauthorized writes before mutation. */
  /** Candidate validation must be synchronous while the overlay is visible. */
  validate: (context: PreCommitGuardContext, binding: Readonly<NoteResourceBinding>) => string | void;
  /** Read the authorized provider checkpoint, or throw if it is unavailable. */
  baseCheckpoint: () => string | Promise<string>;
  /**
   * Prepared may be asynchronous because no overlay exists yet. Executed must
   * be durably written synchronously, before the model can commit or be read.
   */
  journal: { append: (intent: Readonly<NoteRecoveryIntent>) => void | Promise<void> };
}

const required = (value: string | undefined, name: string): string => {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`Note precommit requires ${name}`);
  return value;
};

/**
 * Bind a real Note editor (or an independently mounted nested editor) to a
 * fail-closed pre-commit policy. This installs no provider transport and never
 * removes a recovery intent. The host must confirm an exact edit by authorized
 * fresh provider readback before clearing it.
 */
export function bindNotePrecommit(options: NotePrecommitOptions): () => void {
  const { editor, validate, baseCheckpoint, journal } = options;
  const binding = Object.freeze({ ...options.binding });
  for (const name of ['issuer', 'subject', 'tenantId', 'workspaceId', 'documentId',
    'resourceId', 'actorId', 'sessionId'] as const) required(binding[name], name);
  if (binding.parentResourceId !== undefined) required(binding.parentResourceId, 'parentResourceId');

  let preparedEditId: string | undefined;
  let preparedCheckpoint: string | undefined;
  const prepare = registerPreExecutionGuard(editor, async ({ operations, provenance, rootId }) => {
    preparedEditId = undefined;
    preparedCheckpoint = undefined;
    if (provenance.origin === 'remote') return;
    if (provenance.origin !== 'local' && provenance.origin !== 'history') return 'Unsupported Note edit origin';
    if (!operations.length || operations.some(operation => operation.type === 'op-function')) {
      return 'Note edit has no recoverable operation descriptor';
    }
    if (provenance.actorId && provenance.actorId !== binding.actorId) return 'Note actor changed';
    if (provenance.sessionId && provenance.sessionId !== binding.sessionId) return 'Note session changed';
    const checkpoint = required(await baseCheckpoint(), 'baseCheckpoint');
    const candidateRootId = required(rootId, 'candidateRootId');
    const editId = required(provenance.editId, 'editId');
    let snapshot: TransactionOperation[];
    try { snapshot = structuredClone(operations) as TransactionOperation[]; }
    catch { return 'Note edit operation cannot be recorded'; }
    await journal.append({ version: 1, phase: 'prepared', binding: { ...binding },
      editId, origin: provenance.origin, baseCheckpoint: checkpoint,
      candidateRootId, operations: snapshot });
    preparedEditId = editId;
    preparedCheckpoint = checkpoint;
  });

  const finish = registerPreCommitGuard(editor, context => {
    const { provenance, operations, candidate } = context;
    const reason = validate(context, binding);
    if (reason && typeof (reason as unknown as Promise<unknown>).then === 'function') {
      void Promise.resolve(reason).catch(() => {});
      return 'Note candidate validation must be synchronous';
    }
    if (reason) return reason;

    // A remote change belongs to the provider actor, never to this account's
    // recovery journal. The model layer checks complete remote provenance.
    if (provenance.origin === 'remote') return;
    if (provenance.origin !== 'local' && provenance.origin !== 'history') {
      return 'Unsupported Note edit origin';
    }
    if (!operations.length || preparedEditId !== provenance.editId || !preparedCheckpoint) {
      // Opaque OpFunction transactions can mutate the overlay while returning
      // no operation descriptor. Such intent cannot be recovered safely.
      return 'Note edit has no recoverable operation descriptor';
    }
    if (provenance.actorId && provenance.actorId !== binding.actorId) return 'Note actor changed';
    if (provenance.sessionId && provenance.sessionId !== binding.sessionId) return 'Note session changed';
    const rootId = required(candidate.rootId, 'candidateRootId');
    const editId = required(provenance.editId, 'editId');

    // Preserve undefined-valued attributes and generated operation results.
    // JSON would silently remove them, changing an attempted structural edit.
    // The journal owns its durable encoding and must reject any loss.
    let snapshot: TransactionOperation[];
    try {
      snapshot = structuredClone(operations) as TransactionOperation[];
    } catch {
      return 'Note edit operation cannot be recorded';
    }

    const written = journal.append({
      version: 1,
      phase: 'executed',
      binding: { ...binding },
      editId,
      origin: provenance.origin,
      baseCheckpoint: preparedCheckpoint,
      candidateRootId: rootId,
      operations: snapshot,
    });
    if (written && typeof written.then === 'function') {
      void Promise.resolve(written).catch(() => {});
      return 'Executed Note intent must be stored synchronously';
    }
  });
  return () => { finish(); prepare(); };
}
