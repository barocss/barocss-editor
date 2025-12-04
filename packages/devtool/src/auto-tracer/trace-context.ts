/**
 * Trace Context 관리
 * 
 * 스택 기반으로 호출 체인을 추적하고, traceId/spanId를 자동으로 부여합니다.
 */

export interface TraceContext {
  traceId: string;              // 전체 플로우 ID
  spanId: string;               // 현재 실행 단위 ID
  parentSpanId?: string;         // 부모 실행 단위 ID
  operationName: string;         // 함수/명령 이름
  startTime: number;            // 시작 시간
  tags?: Record<string, any>;   // 추가 메타데이터
}

export class TraceContextManager {
  private activeTraces: Map<string, TraceContext> = new Map();
  private contextStack: TraceContext[] = [];

  /**
   * Trace Context 생성
   */
  createContext(
    operationName: string,
    className?: string,
    packageName?: string,
    parentSpanId?: string
  ): TraceContext {
    // 부모 컨텍스트 확인
    const parentContext = parentSpanId 
      ? this.activeTraces.get(parentSpanId)
      : this._getCurrentContext();
    
    // traceId 결정: 부모가 있으면 같은 traceId 사용, 없으면 새로 생성
    const traceId = parentContext?.traceId || this._generateTraceId();
    
    // spanId 생성: 고유한 실행 단위 ID
    const spanId = this._generateSpanId();

    // 컨텍스트 생성
    const context: TraceContext = {
      traceId,
      spanId,
      parentSpanId: parentContext?.spanId,
      operationName,
      startTime: performance.now(),
      tags: {
        className,
        package: packageName,
        timestamp: Date.now()
      }
    };

    // 활성 컨텍스트 스택에 추가
    this._pushContext(context);
    this.activeTraces.set(spanId, context);
    
    return context;
  }

  /**
   * 현재 활성 컨텍스트 가져오기 (스택 최상단)
   */
  getCurrentContext(): TraceContext | null {
    return this._getCurrentContext();
  }

  /**
   * 컨텍스트 정리
   */
  cleanupContext(spanId: string): void {
    this._popContext(spanId);
    this.activeTraces.delete(spanId);
  }

  /**
   * 컨텍스트 스택에 추가
   */
  private _pushContext(context: TraceContext): void {
    this.contextStack.push(context);
  }

  /**
   * 현재 활성 컨텍스트 가져오기
   */
  private _getCurrentContext(): TraceContext | null {
    return this.contextStack.length > 0 
      ? this.contextStack[this.contextStack.length - 1]
      : null;
  }

  /**
   * 컨텍스트 스택에서 제거
   */
  private _popContext(spanId: string): void {
    const index = this.contextStack.findIndex(ctx => ctx.spanId === spanId);
    if (index !== -1) {
      this.contextStack.splice(index, 1);
    }
  }

  /**
   * Trace ID 생성
   */
  private _generateTraceId(): string {
    return `trace-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  }

  /**
   * Span ID 생성
   */
  private _generateSpanId(): string {
    return `span-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  }
}

