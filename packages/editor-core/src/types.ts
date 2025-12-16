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
}

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
  selectionType: SelectionType = 'range'
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
  // TODO: Normalize based on document order and determine direction
  return {
    type: selectionType,
    startNodeId: anchorId,
    startOffset: anchorOffset,
    endNodeId: focusId,
    endOffset: focusOffset,
    collapsed: false,
    direction: 'forward'
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
  onSelectionChange?(editor: Editor, selection: SelectionState): void;
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
  'editor:content.change': { content: DocumentState; transaction: Transaction };
  'editor:node.create': { node: Node; position: number };
  'editor:node.update': { node: Node; oldNode: Node };
  'editor:node.delete': { node: Node; position: number };
  'editor:selection.change': { selection: SelectionState; oldSelection: SelectionState };
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
