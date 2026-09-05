import { Transaction } from '@barocss/model';
import { Schema } from '@barocss/schema';
import type { Editor } from './editor';
import type { Keybinding } from './keybinding';

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
  type MaybeSelection,
  type SelectionType
} from '@barocss/shared';
import type { MaybeSelection, ModelSelection } from '@barocss/shared';

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

/*
 * **여기 있던 `SelectionState` 를 지웠다 — 그리고 그것은 `ModelNodeSelection` 과 같은 모양이었다.**
 *
 * DOM 스냅샷(`anchorNode`·`focusNode`·`from`·`to`)이었고, **아무것도 그것을 만들지 않았다.**
 * 2026-09-05 에 재본 것:
 *
 * | 자리 | 선언 | 실제로 |
 * |---|---|---|
 * | `updateSelection(sel: SelectionState \| any)` | 두 모양 | 넘기는 호출자 **0** (54곳을 셌다) |
 * | `isModelSelection` | `type !== 'none'` | `SelectionState` 는 `type` 이 **없으므로** 참이 된다 — 그 분기로 갈 수가 없다 |
 * | `// SelectionState format` 이라 적힌 분기 | | 실제로 거기 오는 것은 **`{type:'none'}`** 이다 |
 * | 확장 훅 둘 | `SelectionState` | 구현하는 확장 **0**. 넘기는 값은 `ModelSelection` |
 * | `editor:selection.change` payload | `SelectionState` | 듣는 셋이 payload 를 **안 읽고** `editor.selection` 을 다시 읽는다 |
 * | `editor:selection.focus`·`.blur` payload | `{ selection: SelectionState }` | **payload 없이** emit 된다 — 인자가 하나다 |
 * | `SetSelectionCommand` | 공개 export | 아무도 안 쓴다. `void this._selection` |
 * | `devtool.getSelectionInfo` | `nodeId`/`from`/`to` 분기 | 오지 않는 모양이다 |
 *
 * 아래 `ModelNodeSelection` 에 대해 적힌 문장이 그대로 다시 성립한다 — *"의도를 적은 타입이
 * 배선되지 않은 채 남고, 읽는 쪽이 그 의도를 향해 읽고 있었다."* 그때는 두 뷰 층이
 * `nodeSelection.nodeId` 를 읽고 있었고, 이번에는 devtool 이 `from`/`to` 를 읽고 있었다.
 *
 * DOM 선택은 뷰 층이 읽어서 **바로 모델 자리로 옮긴다**(`@barocss/shared` 의 `text-position`).
 * 그 사이의 스냅샷을 편집기의 어휘로 들일 이유가 없다.
 */

export interface EditorSelectionModelEventPayload {
  selection: ModelSelection | null;
  applySelectionToView?: boolean;
  source?: string;
  metadata?: Record<string, any>;
}

/**
 * 선택의 문을 지나는 것 전부.
 *
 * **`NoSelection` 이 여기 있는 이유:** `{type:'none'}` 은 뷰 층이 *고른 것이 없다* 를 말하는 방법이고
 * (`convertDOMSelectionToModel` 이 범위가 없을 때 그것을 돌려준다) 그것도 이 문을 지난다. 타입을
 * 좁히자 컴파일러가 바로 찾았다 — 그 전에는 `SelectionState | any` 여서 무엇이든 지났다.
 */
export type EditorSelectionModelPayload =
  | MaybeSelection
  | EditorSelectionModelEventPayload;

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

/**
 * **이 모음의 제품이 편집기를 만들 때 받는 것.**
 *
 * ## 왜 선언하나 — 계약은 이미 있었고 넷째가 벗어났다
 *
 * `word` · `slides` · `site` 의 옵션 타입이 **글자까지 같았다**: `extends EditorOptions` 에
 * `kit?: Extension[]` 과 `keybindings?: Keybinding[]`(word 만 `author` 를 더 받는다). 세 벌이 같으면
 * 그건 한 제품의 의견이 아니라 *이 모음의 제품은 이렇게 만들어진다* 이다.
 *
 * 그런데 **가장 최근 제품인 `note` 가 그것을 안 따랐다** — `EditorOptions` 를 안 물려받고,
 * `keybindings` 를 아예 못 받고, `dataStore`·`schema` 를 `unknown` 으로 받는다. 아무도 그것을
 * 막지 않았다. 선언이 없었기 때문이다.
 *
 * **다섯째 제품이 걸릴 자리가 정확히 여기다.** 그래서 추론이 아니라 **기록**이다.
 *
 * ## `keybindings` 는 **더하는 것**이지 **대체**가 아니다
 *
 * 재보니 이 필드를 넘기는 호출자가 **0** 이다 — 세 제품이 선언하고 아무도 안 쓴다. 그래서 그
 * 의미가 한 번도 시험된 적이 없고, 셋의 구현은 **대체** 였다: `keybindings ?? WORD_KEYBINDINGS`
 * 는 하나라도 주면 제품의 71개가 통째로 사라진다는 뜻이다.
 *
 * 그게 원하는 것일 리 없고, 이 저장소는 같은 논증을 이미 적어 뒀다 — `note-kit.ts`: *"대체가 아니라
 * 층이다 … 레지스트리를 비우면 Enter·Backspace·화살표까지 사라져서 문서가 브라우저가 하는 대로만
 * 편집된다."* 제품의 키에 대해서도 같다.
 *
 * 그러므로 **제품의 키는 늘 실리고, 이것은 그 위에 얹힌다.** 넘기는 호출자가 0이므로 이 결정은
 * 오늘 아무것도 바꾸지 않는다 — 바꾸는 것은 다음에 넘기는 사람이 얻는 답이다.
 */
export interface ProductEditorOptions extends EditorOptions {
  /**
   * 이 제품의 기본 확장 **대신** 실을 것. 안 주면 제품이 자기 것을 싣는다.
   *
   * `extensions` 와 다르다: `extensions` 는 그 위에 *더* 얹히고, `kit` 은 기본을 *갈아낀다*.
   * 호스트가 자기 제스처를 가진 드문 경우를 위한 것이고, 들어오는 문이 아니다.
   */
  kit?: Extension[];

  /** 제품의 키 **위에** 얹을 키. 제품의 것을 지우지 않는다 — 출처로 충돌을 푼다. */
  keybindings?: Keybinding[];
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
  
  onBeforeSelectionChange?(editor: Editor, selection: ModelSelection): ModelSelection | null | void;
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
  onSelectionChange?(editor: Editor, selection: MaybeSelection): void;
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
  /* `{type:'none'}` 도 여기로 온다 — 선택이 없어진 것도 선택이 바뀐 것이다. */
  'editor:selection.change': {
    selection: MaybeSelection | null;
    oldSelection: MaybeSelection | null;
  };
  'editor:selection.model': EditorSelectionModelPayload;
  /* 둘 다 **인자 없이** emit 된다 — 초점이 어디로 갔는지는 듣는 쪽이 편집기에 다시 묻는다. */
  'editor:selection.focus': void;
  'editor:selection.blur': void;
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
