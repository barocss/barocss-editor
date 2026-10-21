import type { NoteParagraphTarget } from './document-save/product-feedback';
/** Execution evidence is separate from coordination receipts and native documents. */
export interface ProjectExecution {
  id: string; projectId: string; workId: string; resultId: string; documentId: string;
  tenantId: string; workspaceId: string; actorId: string;
  phase: 'unknown' | 'proposal' | 'blocked' | 'failed' | 'accepted' | 'applied' | 'rejected' | 'unsupported';
  reason: string | null;
  /** Server-derived operation binding; the model cannot choose native coordinates or schema. */
  binding?: { product: 'note'; operation: 'note.paragraph.replace/v1'; schema: 'barocss-note@1'; target: NoteParagraphTarget };
  input: {
    request: string; revision: number; snapshotHash: string; snapshotText: string;
    target: { nodeId: string; text: string; from: number; to: number };
    inputs: { id: string; documentId: string; revision: number; snapshotHash: string; snapshotText: string }[];
  };
  pendingOutputs: { resultId: string; reason: string; inputs?: { id: string; documentId: string; revision: number; snapshotHash: string; snapshotText: string }[] }[];
  proposal?: { replacement: string; reason: string; assumptions: string[] };
  provenance?: { kind: string; model: string; modelDigest: string; [key: string]: unknown };
  expectedSnapshotText?: string; expectedSnapshotHash?: string; appliedRevision?: number;
}
