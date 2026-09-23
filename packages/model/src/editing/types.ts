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
  /** Empty editable run to create when deleting the last inline object. No type is guessed. */
  defaultText?: string;
  /** Explicitly removable empty container types, keyed by the left type and listing right types. */
  removeEmptyBefore?: Record<string, string[]>;
  /** Per-type split policy. Missing entries preserve the type; atEnd names the next block type. */
  splits?: Record<string, { mode: 'same' | 'reject'; atEnd?: string }>;
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
  /** Preserve a host's non-text selection during a programmatic text replacement. */
  selectionAfter?: import('@barocss/editor-core').ModelSelection | null;
  actions: ('delete' | 'move' | 'insert' | 'replace' | 'split' | 'join' | 'wrap' | 'transform')[];
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

/** Host-proposed Enter strategies; only these built-in operations can be planned in isolation. */
export interface StructuralOperation {
  type: 'insertParagraph' | 'splitListItem' | 'transformNode' | 'moveChildren' | 'removeChild' | 'setAttrs' | 'addChild' | 'setSelection' | 'deleteRange' | 'deleteTextRange';
  payload?: Record<string, unknown>;
}
export type StructuralRequest =
  | { intent: 'remove'; nodeIds: string[] }
  | { intent: 'delete'; range: import('@barocss/editor-core').ModelSelection }
  | { intent: 'replace'; range: import('@barocss/editor-core').ModelSelection; text: string; preserveSelection?: boolean }
  | { intent: 'join'; leftId: string; rightId: string }
  | { intent: 'remove-gap'; leftId: string; rightId: string }
  | { intent: 'split'; range: import('@barocss/editor-core').ModelSelection; operations?: StructuralOperation[]; handlesRange?: boolean };
