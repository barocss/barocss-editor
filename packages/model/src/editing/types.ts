import type { EditingNode } from '@barocss/schema';

export interface FragmentNode extends Omit<EditingNode, 'content'> {
  /** Identity in the source document. Never an instruction to reuse a target ID. */
  sourceId?: string;
  content?: FragmentNode[];
}
export interface FragmentOrigin {
  format: string;
  schemaId: string;
  schemaRevision: string;
  documentId?: string;
}
export interface FragmentReference {
  sourceId: string;
  attribute: string;
  target: string;
  kind: 'node' | 'external';
}
export interface DocumentFragment {
  version: 1;
  selection: 'range' | 'nodes';
  origin: FragmentOrigin;
  content: FragmentNode[];
  openStart: number;
  openEnd: number;
  references: FragmentReference[];
  /** Resource transport is explicit; the initial flow consumer refuses nonempty resources. */
  resources: { id: string; type: string; data: unknown }[];
}
export interface EditingLoss {
  kind: 'structure' | 'attribute' | 'mark' | 'reference';
  reason: string;
}
export interface ReferencePolicy {
  kind: 'node' | 'external';
  /** Node references within a copied fragment always remap. This governs everything else. */
  outside: 'reject' | 'preserve' | 'same-document';
}
/** Rules select a supported strategy. They never write nodes or bypass schema checks. */
export interface EditingRule {
  id: string;
  priority?: number;
  match: {
    sourceType: string;
    targetType: string;
    boundary: 'open' | 'closed';
    attributes: 'equal' | 'any';
    targetKind?: EditingTarget['kind'];
  };
  effect: 'join-inline' | 'preserve' | 'reject';
  reason: string;
}
export interface EditingRuleTrace {
  ruleIds: string[];
  sourceType: string;
  targetType: string;
  boundary: 'open' | 'closed';
  targetKind: EditingTarget['kind'];
  effect: EditingRule['effect'];
  reason: string;
}
export interface EditingPolicy {
  /** Source identifier for adapter lookup. Direct acceptance also requires the same schema revision. */
  schemaId?: string;
  /** Optional portable contract version. Set with schemaId and bump when compatibility changes. */
  schemaRevision?: string;
  defaultBlock?: string;
  /** Opt into inline range replacement across target roles while retaining required empty containers. */
  rangeReplacement?: 'preserve-boundaries';
  /** Exact type names or '*'. Registrations belong to this editor, not a global registry. */
  rules?: EditingRule[];
  references?: Record<string, Record<string, ReferencePolicy>>;
  adapters?: {
    format: string;
    schemaId: string;
    /** Pure conversion. Report each known loss; structural validation still follows. */
    convert(fragment: DocumentFragment): { content: DocumentFragment; outcome: 'converted' | 'preserved'; losses: EditingLoss[] };
  }[];
}
export type EditingTarget =
  | { kind: 'children'; parentId: string; index: number; deleteCount?: number }
  | { kind: 'text'; nodeId: string; from: number; to: number; endNodeId?: string };
export type EditingSource = { kind: 'nodes'; nodeIds: string[] } | { kind: 'text'; nodeId: string; from: number; to: number };
export interface EditingRequest {
  intent: 'copy' | 'move';
  /** Local source authorization. Clipboard metadata alone must never populate this field. */
  source?: EditingSource;
  target: EditingTarget;
  fragment: DocumentFragment;
}
export interface EditingBasis {
  owner: string;
  document: string;
  revision: number;
  snapshot: string;
  schema: string;
  policy: number;
  selection: string;
}
export interface EditingPlan {
  basis: EditingBasis;
  outcome: 'direct' | 'converted' | 'preserved';
  losses: EditingLoss[];
  trace: EditingRuleTrace[];
  noop?: boolean;
  actions: ('move' | 'insert' | 'replace' | 'split' | 'join' | 'wrap' | 'transform')[];
  parentId: string;
  index: number;
  removeIds: string[];
  content: FragmentNode[];
  /** Existing identities retained in a split or text edit. Source identities are separate. */
  retainIds: Record<string, string>;
  references: FragmentReference[];
  caret: { path: number[]; offset: number } | null;
}
export type EditingDecision = { ok: true; plan: EditingPlan } | { ok: false; reason: string; losses: EditingLoss[]; trace: EditingRuleTrace[] };
