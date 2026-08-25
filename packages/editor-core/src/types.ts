import { Transaction } from '@barocss/model';
import { Schema } from '@barocss/schema';
import type { Editor } from './editor';

export interface DocumentState {
  type: 'document';
  content: Node[];
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface Node {
  id: string;
  type: string;
  attributes?: Record<string, any>;
  content?: Node[];
  text?: string;
  marks?: Mark[];
}

export interface Mark {
  type: string;
  attributes?: Record<string, any>;
  range?: [number, number];
}

export interface SelectionState {
  // DOM Selection information (original)
  anchorNode: globalThis.Node | null;
  anchorOffset: number;
  focusNode: globalThis.Node | null;
  focusOffset: number;
  empty: boolean;
  textContent: string;
  
  // Model information (ID found via closest() + type queried from Model)
  nodeId: string;
  nodeType: string;
  
  // Computed information for convenience
  from: number;
  to: number;
  length: number;
}

export type SelectionType = 'range' | 'node' | 'cell' | 'table';

/**
 * Model Selection type - represents selection/range within the editor
 * Always guarantees start ≤ end (normalized)
 */
export interface ModelSelection {
  type: SelectionType;
  startNodeId: string;
  startOffset: number;
  endNodeId: string;
  endOffset: number;
  collapsed?: boolean;  // Cursor is represented as a range with collapsed: true
  direction?: 'forward' | 'backward' | 'none';
  /**
   * Every node in the selection, when what is selected is nodes rather than a
   * span of text.
   *
   * A range says "from here to there", which is the right shape for text and the
   * wrong one for three shapes on a board or two cells in different rows: those
   * are a set, and a set with holes in it cannot be described by its endpoints.
   *
   * `startNodeId`/`endNodeId` stay populated with the first and last of them, so
   * that code written before this existed keeps working on one of the selected
   * nodes rather than on nothing. Anything that means "all of them" should ask
   * `selectedNodeIds()`.
   */
  nodeIds?: string[];
}

/**
 * The nodes a selection covers, for the kinds that select whole nodes.
 *
 * Returns an empty array for a text range: a range covers *parts* of nodes, and
 * treating its endpoints as a node set is how a caret in a paragraph turns into
 * "the paragraph is selected".
 */
export function selectedNodeIds(selection: ModelSelection | null | undefined): string[] {
  if (!selection) return [];
  if (selection.type === 'range') return [];
  if (selection.nodeIds && selection.nodeIds.length > 0) return [...selection.nodeIds];

  // A selection made before this field existed, or one that covers a single node
  return selection.startNodeId === selection.endNodeId
    ? [selection.startNodeId]
    : [selection.startNodeId, selection.endNodeId];
}

/**
 * A selection of whole nodes.
 *
 * Order is the caller's: it is the order the nodes were selected in, which is
 * not always document order and is what a user expects when a command reports
 * on them.
 */
export function createNodeSelection(
  nodeIds: string[],
  type: SelectionType = 'node'
): ModelSelection | null {
  if (nodeIds.length === 0) return null;
  return {
    type,
    nodeIds: [...nodeIds],
    startNodeId: nodeIds[0],
    startOffset: 0,
    endNodeId: nodeIds[nodeIds.length - 1],
    endOffset: 0,
    collapsed: false,
    direction: 'none'
  };
}

/**
 * The same selection with the nodes that are **gone** taken out of it.
 *
 * Measured: selecting three shapes and deleting the middle one left all three selected. The check
 * that guards a selection against a deleted node asks only about `startNodeId` and `endNodeId` —
 * right for a range, which is what it was written for, and blind to a set, where the deleted node
 * is usually neither end. The next command then acted on a node the store no longer has.
 *
 * Pruned rather than cleared, because that is what a reader means: two of my three shapes are still
 * here and still selected. Cleared only when *nothing* survives, which is the same "no nodes and no
 * selection are one state" rule `createNodeSelection` follows.
 *
 * A **range** is handed back untouched: it covers parts of nodes rather than a set of them, and its
 * endpoints are what the alive check is for.
 */
export function withLiveNodes(
  getNode: (id: string) => unknown,
  selection: ModelSelection | null | undefined
): ModelSelection | null {
  if (!selection) return null;
  if (selection.type === 'range') return selection;

  const nodes = selectedNodeIds(selection);
  if (nodes.length === 0) return selection;

  const alive = nodes.filter((id) => !!getNode(id));
  if (alive.length === nodes.length) return selection;
  if (alive.length === 0) return null;

  // The endpoints follow the survivors, or they would keep naming what has gone.
  return {
    ...selection,
    nodeIds: alive,
    startNodeId: alive[0],
    endNodeId: alive[alive.length - 1]
  };
}

export interface EditorSelectionModelEventPayload {
  selection: ModelSelection | null;
  applySelectionToView?: boolean;
  source?: string;
  metadata?: Record<string, any>;
}

export type EditorSelectionModelPayload = ModelSelection | EditorSelectionModelEventPayload;

export interface NoSelection {
  type: 'none';
}

export type Selection = ModelSelection | NoSelection;

/**
 * Convert DOM Selection (anchor/focus) to ModelSelection
 * Normalizes anchor/focus to start/end and preserves direction information
 */
export function fromDOMSelection(
  anchorId: string,
  anchorOffset: number,
  focusId: string,
  focusOffset: number,
  selectionType: SelectionType = 'range',
  compareNodeOrder?: (a: string, b: string) => number
): ModelSelection {
  // Single node case
  if (anchorId === focusId) {
    const isForward = anchorOffset <= focusOffset;
    const start = Math.min(anchorOffset, focusOffset);
    const end = Math.max(anchorOffset, focusOffset);
    return {
      type: selectionType,
      startNodeId: anchorId,
      startOffset: start,
      endNodeId: focusId,
      endOffset: end,
      collapsed: start === end,
      direction: start === end ? 'none' : (isForward ? 'forward' : 'backward')
    };
  }
  
  // Multiple nodes case
  const compare = compareNodeOrder ?? ((a, b) => a.localeCompare(b));
  const order = compare(anchorId, focusId);
  const isForward = order <= 0;
  const startNodeId = isForward ? anchorId : focusId;
  const startOffset = isForward ? anchorOffset : focusOffset;
  const endNodeId = isForward ? focusId : anchorId;
  const endOffset = isForward ? focusOffset : anchorOffset;

  return {
    type: selectionType,
    startNodeId,
    startOffset,
    endNodeId,
    endOffset,
    collapsed: false,
    direction: isForward ? 'forward' : 'backward'
  };
}

/**
 * Type guard: Check if selection is ModelSelection
 */
export function isModelSelection(selection: Selection): selection is ModelSelection {
  return selection.type !== 'none';
}

/**
 * Type guard: Check if selection is Range Selection
 */
export function isRangeSelection(selection: Selection): selection is ModelSelection {
  return selection.type === 'range';
}

/**
 * Type guard: Check if selection is Node Selection
 */
export function isNodeSelection(selection: Selection): selection is ModelSelection {
  return selection.type === 'node';
}

/**
 * Type guard: Check if selection is Cursor (collapsed range)
 */
export function isCursor(selection: Selection): selection is ModelSelection {
  return isRangeSelection(selection) && selection.collapsed === true;
}

export interface ModelNodeSelection {
  nodeId: string;
  selectAll: boolean;
}

export interface ModelAbsoluteSelection {
  anchor: number;
  head: number;
}

export class SelectionError extends Error {
  constructor(message: string, public code: string, public context?: any) {
    super(message);
    this.name = 'SelectionError';
  }
}

export class NodeNotFoundError extends SelectionError {
  constructor(nodeId: string) {
    super(`Node not found: ${nodeId}`, 'NODE_NOT_FOUND', { nodeId });
  }
}

export class InvalidOffsetError extends SelectionError {
  constructor(nodeId: string, offset: number, maxOffset: number) {
    super(`Invalid offset ${offset} for node ${nodeId}. Max: ${maxOffset}`, 'INVALID_OFFSET', { nodeId, offset, maxOffset });
  }
}

export class ConversionError extends SelectionError {
  constructor(from: string, to: string, reason: string) {
    super(`Failed to convert from ${from} to ${to}: ${reason}`, 'CONVERSION_ERROR', { from, to, reason });
  }
}

export class DOMAccessError extends SelectionError {
  constructor(operation: string, reason: string) {
    super(`DOM access failed during ${operation}: ${reason}`, 'DOM_ACCESS_ERROR', { operation, reason });
  }
}

export interface EditorOptions {
  content?: DocumentState;
  extensions?: Extension[];
  editable?: boolean;
  history?: HistoryManagerOptions;
  model?: ModelOptions;
  contentEditableElement?: HTMLElement;
  dataStore?: any; // Temporarily using any for DataStore type
  schema?: any; // Temporarily using any for Schema type
}

export interface HistoryOptions {
  maxSize?: number;
  enabled?: boolean;
}

export interface ModelOptions {
  schema?: Schema;
  initialContent?: DocumentState;
}

export interface Command {
  name: string;
  execute: (editor: Editor, payload?: any) => boolean | Promise<boolean>;
  canExecute?: (editor: Editor, payload?: any) => boolean;
  before?: (editor: Editor, payload?: any) => void;
  after?: (editor: Editor, payload?: any) => void;
}

export interface Extension {
  name: string;
  priority?: number;
  dependencies?: string[];
  
  // Lifecycle
  onBeforeCreate?(editor: Editor): void;
  onCreate?(editor: Editor): void;
  onDestroy?(editor: Editor): void;
  
  // Command registration
  commands?: Command[];

  /**
   * What the nodes this extension introduces look like, when nothing else says.
   *
   * An extension registers *commands* — `insertCallout` makes a callout — and
   * for a long time that was all it did. Which meant an extension could put a
   * node in a document that the product had no renderer for, and the reader's
   * text would be in the model and invisible on the page. Measured in a shipped
   * product with 588 tests: ten node types were reachable that way.
   *
   * Called once, when the extension loads, and expected to register only what
   * is **not already registered** — a product's own renderer must win. The
   * point is not to decide how a callout looks; it is that a command which can
   * make one is never offered without *something* being able to draw it.
   */
  defaultRenderers?(): void;
  
  // Before hooks (intercept and modify core model changes)
  // Only core model changes (Transaction, Selection, Content) are provided as hooks.
  // Other changes (Node, Command, History, etc.) should use editor.on() events.
  onBeforeTransaction?(editor: Editor, transaction: Transaction): Transaction | null | void;
  // - Transaction 반환: 수정된 transaction 사용
  // - null 반환: transaction 취소
  // - void: 그대로 진행
  
  onBeforeSelectionChange?(editor: Editor, selection: SelectionState): SelectionState | null | void;
  // - Selection 반환: 다른 selection으로 교체
  // - null 반환: selection 변경 취소
  // - void: 그대로 진행
  
  onBeforeContentChange?(editor: Editor, content: DocumentState): DocumentState | null | void;
  // - Content 반환: 다른 content로 교체
  // - null 반환: content 변경 취소
  // - void: 그대로 진행
  
  // After hooks (notification for core model changes)
  // For type safety. Alternatively, you can use editor.on() events for more flexibility.
  onTransaction?(editor: Editor, transaction: Transaction): void;
  onSelectionChange?(editor: Editor, selection: SelectionState | ModelSelection): void;
  onContentChange?(editor: Editor, content: DocumentState): void;
  
  // State extension
  addState?: (editor: Editor) => void;
  addStorage?: (editor: Editor) => void;
}

/**
 * Event naming convention: [namespace]:[category].[action]
 */
export type EditorEventType = 
  | 'editor:content.change'
  | 'editor:node.create'
  | 'editor:node.update'
  | 'editor:node.delete'
  | 'editor:selection.change'
  | 'editor:selection.focus'
  | 'editor:selection.blur'
  | 'editor:command.execute'
  | 'editor:command.before'
  | 'editor:command.after'
  | 'editor:history.change'
  | 'editor:history.undo'
  | 'editor:history.redo'
  | 'editor:editable.change'
  | 'editor:create'
  | 'editor:destroy'
  | 'error:selection'
  | 'error:command'
  | 'error:extension'
  | 'extension:add'
  | 'extension:remove'
  | 'extension:enable'
  | 'extension:disable'
  | `plugin:${string}`
  | `user:${string}`
  | string;

export interface EditorEvents {
  'editor:content.change': { 
    content: DocumentState; 
    transaction: Transaction | null;
    from?: string;
    skipRender?: boolean;
    rootId?: string;
    inputDebug?: any;
  };
  'editor:node.create': { node: Node; position: number };
  'editor:node.update': { node: Node; oldNode: Node };
  'editor:node.delete': { node: Node; position: number };
  'editor:selection.change': { selection: SelectionState; oldSelection: SelectionState };
  'editor:selection.model': EditorSelectionModelPayload;
  'editor:selection.focus': { selection: SelectionState };
  'editor:selection.blur': { selection: SelectionState };
  'editor:command.execute': { command: string; payload?: any; success: boolean };
  'editor:command.before': { command: string; payload?: any };
  'editor:command.after': { command: string; payload?: any; success: boolean };
  'editor:history.change': { canUndo: boolean; canRedo: boolean };
  'editor:history.undo': { document: any };
  'editor:history.redo': { document: any };
  'editor:editable.change': { editable: boolean };
  'editor:create': { editor: Editor };
  'editor:destroy': { editor: Editor };
  'error:selection': { error: SelectionError };
  'error:command': { command: string; payload?: any; error: Error };
  'error:extension': { extension: string; error: Error };
  'extension:add': { extension: Extension };
  'extension:remove': { extension: Extension };
  'extension:enable': { extension: Extension };
  'extension:disable': { extension: Extension };
  [K: `plugin:${string}`]: any;
  [K: `user:${string}`]: any;
  [K: string]: any;
}

export interface CommandChain {
  insertText(text: string): CommandChain;
  deleteSelection(): CommandChain;
  toggleBold(): CommandChain;
  toggleItalic(): CommandChain;
  toggleUnderline(): CommandChain;
  toggleStrikeThrough(): CommandChain;
  setHeading(level: number): CommandChain;
  insertParagraph(): CommandChain;
  focus(): CommandChain;
  run(): Promise<boolean>;
  canRun(): boolean;
}

export interface HistoryEntry {
  id: string;
  timestamp: Date;
  operations: any[]; // TransactionOperation type is imported from model package
  inverseOperations: any[];
  description?: string;
  metadata?: Record<string, any>;
}

export interface HistoryManagerOptions {
  maxSize?: number;
}

export interface HistoryStats {
  totalEntries: number;
  currentIndex: number;
  canUndo: boolean;
  canRedo: boolean;
}
