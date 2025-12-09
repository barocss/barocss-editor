import { Editor } from '@barocss/editor-core';

export interface DevtoolOptions {
  /** Editor instance to monitor */
  editor: Editor;
  /** Maximum number of events to keep in log */
  maxEvents?: number;
  /** Enable/disable debug mode (event logging) */
  debug?: boolean;
  /** Container element to mount the devtool. If not provided, mounts to document.body */
  container?: HTMLElement;
  /** Enable/disable auto tracing */
  enableAutoTracing?: boolean;
  /** Auto update interval for execution flow (ms) */
  autoUpdateInterval?: number;
}

export interface EventLog {
  id: string;
  timestamp: number;
  type: string;
  data: any;
  category: string;
}

export interface ModelTreeNode {
  id: string;
  type: string;
  text?: string;
  attributes?: Record<string, any>;
  children?: ModelTreeNode[];
  marks?: Array<{ type: string; range?: [number, number] }>;
  selection?: {
    start: number;
    end: number;
  };
  /** Separated text runs when text is split by marks/decorators */
  textRuns?: Array<{
    text: string;
    start: number;
    end: number;
    marks: string[];
    decorators: string[];
    selection?: {
      start: number;
      end: number;
    };
  }>;
}

/**
 * 입력 처리 디버그 정보를 나타내는 인터페이스
 * - beforeinput 단계의 InputHint
 * - dom-change-classifier의 contentRange
 * - 실제 DataStore 연산에 사용된 contentRange
 * 를 한 곳에 모아서 Devtool에서 비교/표시하기 위한 구조이다.
 */
export interface LastInputDebug {
  case: 'C1' | 'C2' | 'C3' | 'C4' | 'IME_INTERMEDIATE' | 'UNKNOWN';
  inputType?: string;
  usedInputHint?: boolean;
  inputHintRange?: {
    startNodeId: string;
    startOffset: number;
    endNodeId: string;
    endOffset: number;
  };
  classifiedContentRange?: {
    startNodeId: string;
    startOffset: number;
    endNodeId: string;
    endOffset: number;
  };
  appliedContentRange?: {
    startNodeId: string;
    startOffset: number;
    endNodeId: string;
    endOffset: number;
  };
  modelSelectionAtInput?: any;
  timestamp: number;
  status?: 'ok' | 'mismatch' | 'skipped';
  notes?: string[];
}

/**
 * Trace 및 Span 타입 정의
 */
export interface Trace {
  traceId: string;
  spans: Span[];
  startTime: number;
  endTime?: number;
  duration?: number;
}

export interface Span {
  spanId: string;
  parentSpanId?: string;
  operationName: string;
  className?: string;
  package?: string;
  startTime: number;
  endTime?: number;
  duration?: number;
  input?: any;
  output?: any;
  error?: Error;
  tags?: Record<string, any>;
  anomalies?: Array<{
    severity: 'critical' | 'warning' | 'info';
    type: string;
    message: string;
    details?: any;
  }>;
}

export interface ExecutionFlow extends Trace {
  command?: {
    name: string;
    payload?: any;
    success: boolean;
  };
  transaction?: {
    transactionId: string;
    operations: any[];
    selectionBefore?: any;
    selectionAfter?: any;
  };
  operations?: Array<{
    type: string;
    payload?: any;
    success: boolean;
  }>;
}

/**
 * Trace 이벤트 타입
 */
export interface TraceStartEvent {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  operationName: string;
  className?: string;
  package?: string;
  input?: any;
  timestamp: number;
}

export interface TraceEndEvent {
  traceId: string;
  spanId: string;
  operationName: string;
  output?: any;
  duration: number;
  timestamp: number;
}

export interface TraceErrorEvent {
  traceId: string;
  spanId: string;
  operationName: string;
  error: {
    message: string;
    stack?: string;
    name: string;
  };
  duration: number;
  timestamp: number;
}

