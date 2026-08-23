import type { Editor } from '@barocss/editor-core';
import { TransactionManager, type TransactionResult, type Transaction } from './transaction';
import type { INode } from '@barocss/datastore';
import type { IMark } from '@barocss/datastore';
import type { TransactionContext } from './types';

// ---- Spec Types (minimal) ----
export type HandleOrId = string;

export type MarkDescriptor = { type: string; attrs?: Record<string, any>; range?: [number, number] };

export type DirectOperation = { type: string; payload?: Record<string, any> };

export type TransactionOperation = DirectOperation;

// ---- Core DSL helpers ----

export function control(target: HandleOrId, actions: Array<{ type: string; payload?: any }>): TransactionOperation[] {
  return actions.map(a => ({ type: a.type, payload: {
    ...a.payload,
    nodeId: target
  } }));
}


/**
 * 컨테이너 노드 생성 (paragraph, heading, list 등)
 * - attributes: 노드의 속성
 * - content: 자식 노드들의 배열
 */
export function node(stype: string, attributes?: Record<string, any>, content?: INode[]): INode {
  return { stype, attributes, content } as INode;
}

/**
 * 텍스트 노드 생성 (inline-text, codeBlock 등)
 * 오버로드된 함수로 다양한 패턴 지원:
 * - textNode(type, text) - 기본 텍스트 노드
 * - textNode(type, text, marks) - 마크만 있는 텍스트 노드
 * - textNode(type, text, attributes) - 속성만 있는 텍스트 노드
 * - textNode(type, text, marks, attributes) - 마크와 속성 모두 있는 텍스트 노드
 */
export function textNode(stype: string, text: string): INode;
export function textNode(stype: string, text: string, marks: MarkDescriptor[]): INode;
export function textNode(stype: string, text: string, attributes: Record<string, any>): INode;
export function textNode(stype: string, text: string, marks: MarkDescriptor[], attributes: Record<string, any>): INode;
export function textNode(
  stype: string, 
  text: string, 
  marksOrAttributes?: MarkDescriptor[] | Record<string, any>, 
  attributes?: Record<string, any>
): INode {
  const result: INode = { stype, text } as INode;
  
  // If third parameter is array, it's marks; if object, it's attributes
  if (Array.isArray(marksOrAttributes)) {
    // If marks exist (IMark uses stype)
    result.marks = marksOrAttributes.map((mark: MarkDescriptor & { stype?: string }) => ({
      stype: mark.stype ?? mark.type,
      attrs: mark.attrs,
      range: mark.range
    })) as IMark[];
    
    // If fourth parameter exists, it's attributes
    if (attributes) {
      result.attributes = attributes;
    }
  } else if (marksOrAttributes && typeof marksOrAttributes === 'object') {
    // If only attributes exist
    result.attributes = marksOrAttributes;
  }
  
  return result;
}

export function mark(stype: string, attrs?: Record<string, any>): MarkDescriptor {
  // Extract range from attrs if present (MarkDescriptor uses type for DSL)
  const { range, ...otherAttrs } = attrs || {};
  return { type: stype, attrs: otherAttrs, range };
}

// ---- Transaction (per spec) ----

/** Options for transaction execution. */
export interface TransactionOptions {
  /**
   * When true (default), selectionAfter is applied to View (SelectionManager + DOM/React).
   * When false, selection is not applied to View (e.g. remote sync, programmatic change).
   */
  applySelectionToView?: boolean;

  /**
   * When false (default: true), selection snapshots are omitted from history metadata.
   * This allows local operations that should keep selection as-is on undo/redo.
   */
  preserveSelectionInHistory?: boolean;

  /**
   * When false, the transaction is **not recorded in the history**.
   *
   * For a write that maintains *derived* state — a reaction, not an edit. A connector's
   * remembered end points, a laid-out frame's children: nobody asked for them and nobody
   * should have to undo them.
   *
   * ## Why this is not a nicety
   *
   * The connector reaction runs on every document change and writes the ends whenever a
   * shape has moved — so every drag put **two** entries in the history: the reader's
   * move, and the reaction's. Undo then undid the reaction; the reaction ran again
   * (an undo is a document change) and wrote the same numbers back. Measured: undo
   * pressed twice, `historyUndo` reporting success both times, and the slide unchanged —
   * the reader could not undo their own move at all.
   *
   * Recomputing is what makes this safe: derived state does not need to be *restored*
   * by an undo, because the reaction that owns it runs again afterwards and works it out
   * from what the document now says.
   */
  recordInHistory?: boolean;

  /**
   * Put this write **into the entry of the edit that caused it**, rather than in one of
   * its own or nowhere.
   *
   * The third answer, and the one the two above cannot give. `recordInHistory: false` is
   * right for state derived from nothing the reader writes — a connector's route, a
   * laid-out frame's children. It is *wrong* when the maintenance rewrites the reader's
   * own numbers, and one place does: a group's rectangle is the bounds of its children
   * **and** the origin their coordinates are relative to, so keeping it honest re-origins
   * them — the group moves right by 3000 and every child moves left by 3000, which
   * together change nothing on screen.
   *
   * Unrecorded, that pairing comes apart at the first undo: the reader's `x` is restored
   * into a coordinate space that has since moved, and the shape lands somewhere it has
   * never been (measured — and with the write *recorded* instead, three presses of undo
   * changed nothing at all). The maintenance is a consequence of the edit, so it belongs
   * in the edit's entry, where one undo takes back both halves exactly.
   *
   * Refused when there is no edit to belong to, or when the top of the stack is an entry
   * the reader may still redo; then nothing is recorded, which is safe because an undo
   * restores a state the maintenance already agrees with.
   */
  appendToPreviousEntry?: boolean;
}

export interface TransactionBuilder {
  commit(): Promise<TransactionResult>;
}

class TransactionBuilderImpl implements TransactionBuilder {
  private editor: Editor;
  private ops: (TransactionOperation | OpFunction)[];
  private options: TransactionOptions | undefined;
  constructor(editor: Editor, ops: (TransactionOperation | OpFunction)[], options?: TransactionOptions) {
    this.editor = editor;
    this.ops = ops;
    this.options = options;
  }
  async commit(): Promise<TransactionResult> {
    // Before hooks: Allow extensions to intercept and modify transaction
    let finalOps = this.ops;
    
    // Get extensions sorted by priority
    const extensions = (this.editor as any).getSortedExtensions?.() || [];
    
    for (const ext of extensions) {
      if (ext.onBeforeTransaction) {
        // Create Transaction object for extension
        const transaction: Transaction = {
          sid: `tx-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          operations: finalOps,
          timestamp: new Date()
        };
        
        const result = ext.onBeforeTransaction(this.editor, transaction);
        
        // Check if cancelled
        if (result === null) {
          return {
            success: false,
            errors: [`Transaction cancelled by extension: ${ext.name}`],
            operations: [],
            data: undefined,
            transactionId: undefined
          };
        }
        
        // Use modified operations if provided
        if (result && result.operations) {
          finalOps = result.operations as (TransactionOperation | OpFunction)[];
        }
      }
    }
    
    // Pass OpFunction and regular operations directly to TransactionManager
    const tm = new TransactionManager(this.editor);
    return tm.execute(finalOps, this.options);
  }
}

export function transaction(
  editor: Editor,
  operations: (TransactionOperation | TransactionOperation[] | OpFunction)[] | OpFunction,
  options?: TransactionOptions
): TransactionBuilder {
  const ops = Array.isArray(operations) ? operations : [operations];
  const flattenedOps = ops.flat();
  return new TransactionBuilderImpl(editor, flattenedOps, options);
}

// ---- Functional DSL ----

/**
 * 함수형 DSL을 위한 operation 정의 함수
 * transaction commit 시 실행됨
 */
export function op(operationFn: (context: TransactionContext) => OpResult | void | Promise<OpResult | void>): OpFunction {
  return {
    type: 'op-function',
    execute: operationFn
  };
}

/**
 * OpResult - op 함수의 반환 타입
 */
export interface OpResult {
  success: boolean;
  data?: any;
  error?: string;
  inverse?: TransactionOperation; // Can specify inverse operation
}

/**
 * OpFunction - 함수형 operation의 타입
 */
export interface OpFunction {
  type: 'op-function';
  execute: (context: TransactionContext) => OpResult | void | Promise<OpResult | void>;
}
