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
export interface TransactionBuilder {
  commit(): Promise<TransactionResult>;
}

class TransactionBuilderImpl implements TransactionBuilder {
  private editor: Editor;
  private ops: (TransactionOperation | OpFunction)[];
  constructor(editor: Editor, ops: (TransactionOperation | OpFunction)[]) {
    this.editor = editor;
    this.ops = ops;
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
    // Let TransactionManager handle them at execution time
    const tm = new TransactionManager(this.editor);
    return tm.execute(finalOps);
  }
}

export function transaction(editor: Editor, operations: (TransactionOperation | TransactionOperation[] | OpFunction)[]): TransactionBuilder {
  // Flatten array using flat()
  const flattenedOps = operations.flat();
  return new TransactionBuilderImpl(editor, flattenedOps);
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