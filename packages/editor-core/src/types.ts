import { Transaction } from '@barocss/model';
import { Schema } from '@barocss/schema';
import type { Editor } from './editor';

/**
 * **선택은 `@barocss/shared` 가 선언한다** — 그리고 여기서 그대로 다시 내보낸다.
 *
 * 옮긴 이유는 `shared/src/selection.ts` 에 있다. 요약: 두 뷰 층의 DOM↔모델 변환을 그 둘 **아래**에
 * 두려면 그것이 다루는 타입도 아래에 있어야 하고, 그 변환이 쓰는 런 색인은 이미 `shared` 에 있다.
 *
 * **다시 내보내는 것은 남겨 둘 값이 있다.** 이 타입을 참조하는 파일이 118개이고, 그 대부분은 제품과
 * 확장이다 — 그들이 *편집기의 어휘* 로 선택을 배우는 것이 맞다. `shared` 에서 직접 가져가야 하는
 * 것은 뷰 층 둘뿐이고, 그 둘은 편집기를 만드는 쪽이 아니라 그리는 쪽이다.
 */
export {
  createNodeSelection,
  fromDOMSelection,
  isCursor,
  isModelSelection,
  isNodeSelection,
  isRangeSelection,
  selectedNodeIds,
  withLiveNodes,
  type ModelSelection,
  type NoSelection,
  type Selection,
  type SelectionType
} from '@barocss/shared';
import type { ModelSelection } from '@barocss/shared';

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

export interface EditorSelectionModelEventPayload {
  selection: ModelSelection | null;
  applySelectionToView?: boolean;
  source?: string;
  metadata?: Record<string, any>;
}

export type EditorSelectionModelPayload = ModelSelection | EditorSelectionModelEventPayload;

/*
 * **여기 있던 `ModelNodeSelection` 과 `ModelAbsoluteSelection` 을 지웠다 — 그리고 앞의 것이 이
 * 저장소가 오래 갖고 있던 결함의 출처였다.**
 *
 * `ModelNodeSelection` 은 `{ nodeId: string; selectAll: boolean }` 이었고 **아무 데서도 쓰이지
 * 않았다.** 그런데 두 뷰 층의 `convertNodeSelectionToDOM` 이 `nodeSelection.nodeId` 를 읽고 있었다 —
 * 이 타입이 말하는 모양대로다. 구현은 다른 쪽으로 갔다: `createNodeSelection` 은 `nodeIds`(복수)를
 * 세우고 `selectNode` 는 아예 `range` 를 만든다. **의도를 적은 타입이 배선되지 않은 채 남고, 읽는
 * 쪽이 그 의도를 향해 읽고 있었다.** 그래서 그 분기는 한 번도 아무 일을 한 적이 없다.
 *
 * 검사도 그 모양을 세웠다 — `{ type: 'node', nodeId: 'text-1' }` — 그래서 통과했고 제품에 대해
 * 아무것도 증명하지 않았다.
 *
 * 노드의 집합인 선택은 `ModelSelection` 의 `nodeIds` 로 적고 `selectedNodeIds()` 로 읽는다.
 * `ModelAbsoluteSelection`(`{ anchor, head }`)도 쓰이지 않았고, 절대 오프셋은 이 문서 모델의
 * 좌표계가 아니다 — 노드와 오프셋이다.
 */

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
