import { Transaction } from '@barocss/model';
import { Schema } from '@barocss/schema';
import type { Editor } from './editor';
// 문서 상태
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

// 선택 상태 (DOM Selection 정보 중심)
export interface SelectionState {
  // DOM Selection 정보 (원본)
  anchorNode: globalThis.Node | null;
  anchorOffset: number;
  focusNode: globalThis.Node | null;
  focusOffset: number;
  empty: boolean;
  textContent: string;
  
  // Model 정보 (closest()로 찾은 ID + Model에서 조회한 타입)
  nodeId: string;               // closest()로 찾은 노드 ID
  nodeType: string;             // Model에서 조회한 노드 타입
  
  // 편의를 위한 계산된 정보
  from: number;                 // 텍스트 시작 위치
  to: number;                   // 텍스트 끝 위치
  length: number;               // 선택된 텍스트 길이
}

// Selection 타입 정의
export type SelectionType = 'range' | 'node' | 'cell' | 'table';

// Model Selection 타입 - 에디터 내부의 선택/범위를 표현
// start ≤ end를 항상 보장 (정규화됨)
export interface ModelSelection {
  type: SelectionType;  // Selection 타입 (기본: 'range')
  startNodeId: string;
  startOffset: number;
  endNodeId: string;
  endOffset: number;
  collapsed?: boolean;  // cursor는 collapsed: true인 range로 표현
  direction?: 'forward' | 'backward' | 'none';  // 선택 방향 (선택 사항)
}

// Selection이 없는 경우
export interface NoSelection {
  type: 'none';
}

// Union type
export type Selection = ModelSelection | NoSelection;

/**
 * DOM Selection(anchor/focus)을 ModelSelection으로 변환
 * anchor/focus를 start/end로 정규화하고 방향 정보를 보존
 */
export function fromDOMSelection(
  anchorId: string,
  anchorOffset: number,
  focusId: string,
  focusOffset: number,
  selectionType: SelectionType = 'range'
): ModelSelection {
  // 단일 노드인 경우
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
  
  // 여러 노드인 경우
  // TODO: 문서 순서 기반 정규화 및 방향 판단 필요
  return {
    type: selectionType,
    startNodeId: anchorId,
    startOffset: anchorOffset,
    endNodeId: focusId,
    endOffset: focusOffset,
    collapsed: false,
    direction: 'forward'  // 기본값
  };
}

/**
 * 타입 가드: ModelSelection인지 확인
 */
export function isModelSelection(selection: Selection): selection is ModelSelection {
  return selection.type !== 'none';
}

/**
 * 타입 가드: Range Selection인지 확인
 */
export function isRangeSelection(selection: Selection): selection is ModelSelection {
  return selection.type === 'range';
}

/**
 * 타입 가드: Node Selection인지 확인
 */
export function isNodeSelection(selection: Selection): selection is ModelSelection {
  return selection.type === 'node';
}

/**
 * 타입 가드: Cursor (collapsed range)인지 확인
 */
export function isCursor(selection: Selection): selection is ModelSelection {
  return isRangeSelection(selection) && selection.collapsed === true;
}

// 특수 Selection 타입들
export interface ModelNodeSelection {
  nodeId: string;
  selectAll: boolean;
}

export interface ModelAbsoluteSelection {
  anchor: number;
  head: number;
}

// Selection 관련 에러 타입들
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

// 에디터 옵션
export interface EditorOptions {
  content?: DocumentState;
  extensions?: Extension[]; // 모든 Extension (기본 편집 기능 포함)
  editable?: boolean;
  history?: HistoryManagerOptions;
  model?: ModelOptions;
  contentEditableElement?: HTMLElement;
  dataStore?: any; // DataStore 타입 임시로 any 사용
  schema?: any; // Schema 타입 임시로 any 사용
}

export interface HistoryOptions {
  maxSize?: number;
  enabled?: boolean;
}

export interface ModelOptions {
  schema?: Schema;
  initialContent?: DocumentState;
}

// 명령어 시스템
export interface Command {
  name: string;
  execute: (editor: Editor, payload?: any) => boolean | Promise<boolean>;
  canExecute?: (editor: Editor, payload?: any) => boolean;
  before?: (editor: Editor, payload?: any) => void;
  after?: (editor: Editor, payload?: any) => void;
}

// 확장 시스템
export interface Extension {
  name: string;
  priority?: number;
  dependencies?: string[];
  
  // 생명주기
  onBeforeCreate?(editor: Editor): void;
  onCreate?(editor: Editor): void;
  onDestroy?(editor: Editor): void;
  
  // 명령어 등록
  commands?: Command[];
  
  // 이벤트 처리
  onTransaction?(editor: Editor, transaction: Transaction): void;
  onSelectionChange?(editor: Editor, selection: SelectionState): void;
  onContentChange?(editor: Editor, content: DocumentState): void;
  
  // 상태 확장
  addState?: (editor: Editor) => void;
  addStorage?: (editor: Editor) => void;
}

// 이벤트 네이밍 컨벤션: [namespace]:[category].[action]
export type EditorEventType = 
  // Editor Core 이벤트
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
  
  // Error 이벤트
  | 'error:selection'
  | 'error:command'
  | 'error:extension'
  
  // Extension 이벤트
  | 'extension:add'
  | 'extension:remove'
  | 'extension:enable'
  | 'extension:disable'
  
  // Plugin 이벤트 (커스텀)
  | `plugin:${string}`
  
  // User 이벤트 (커스텀)
  | `user:${string}`
  
  // 기타 커스텀 이벤트
  | string;

// 이벤트 타입 (새로운 네이밍 컨벤션)
export interface EditorEvents {
  // Editor Core 이벤트
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
  
  // Error 이벤트
  'error:selection': { error: SelectionError };
  'error:command': { command: string; payload?: any; error: Error };
  'error:extension': { extension: string; error: Error };
  
  // Extension 이벤트
  'extension:add': { extension: Extension };
  'extension:remove': { extension: Extension };
  'extension:enable': { extension: Extension };
  'extension:disable': { extension: Extension };
  
  // Plugin 이벤트 (커스텀)
  [K: `plugin:${string}`]: any;
  
  // User 이벤트 (커스텀)
  [K: `user:${string}`]: any;
  
  // 기타 커스텀 이벤트
  [K: string]: any;
}

// Editor 클래스 타입을 그대로 re-export (순환 참조는 타입 수준에서만 발생)


// CommandChain 클래스 타입
export interface CommandChain {
  insertText(text: string): CommandChain;
  deleteSelection(): CommandChain;
  toggleBold(): CommandChain;
  toggleItalic(): CommandChain;
  setHeading(level: number): CommandChain;
  insertParagraph(): CommandChain;
  focus(): CommandChain;
  run(): Promise<boolean>;
  canRun(): boolean;
}

// History 관련 타입들
export interface HistoryEntry {
  id: string;
  timestamp: Date;
  operations: any[]; // TransactionOperation 타입은 model 패키지에서 import
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
