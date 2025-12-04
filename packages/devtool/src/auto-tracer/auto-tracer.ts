import { Editor } from '@barocss/editor-core';
import { INSTRUMENTATION_TARGETS, InstrumentationTarget } from './instrumentation-targets';
import { TraceContextManager, TraceContext } from './trace-context';
import { TransactionManager } from '@barocss/model';
import { AnomalyDetector } from './anomaly-detector';

export interface AutoTracerOptions {
  enabled?: boolean;
  samplingRate?: number;
  maxTraces?: number;
  excludePatterns?: string[];
}

/**
 * AutoTracer
 * 
 * 고정된 모니터링 대상을 자동으로 계측하여 실행 플로우를 추적합니다.
 */
export class AutoTracer {
  private editor: Editor;
  private enabled: boolean = false;
  private options: AutoTracerOptions;
  private contextManager: TraceContextManager;
  private anomalyDetector: AnomalyDetector;
  private originalMethods: Map<string, Function> = new Map();
  private currentTraceSpans: Map<string, any[]> = new Map(); // traceId -> spans[]

  constructor(editor: Editor, options: AutoTracerOptions = {}) {
    this.editor = editor;
    this.options = {
      enabled: options.enabled ?? false,
      samplingRate: options.samplingRate ?? 1.0,
      maxTraces: options.maxTraces ?? 1000,
      excludePatterns: options.excludePatterns ?? []
    };
    this.contextManager = new TraceContextManager();
    this.anomalyDetector = new AnomalyDetector();
  }

  /**
   * 자동 추적 활성화
   */
  enable(): void {
    if (this.enabled) return;
    this.enabled = true;
    this._instrumentTargets(INSTRUMENTATION_TARGETS);
  }

  /**
   * 자동 추적 비활성화
   */
  disable(): void {
    if (!this.enabled) return;
    this.enabled = false;
    this._uninstrumentAll();
  }

  /**
   * 활성화 여부 확인
   */
  isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * 고정된 대상 계측
   */
  private _instrumentTargets(targets: InstrumentationTarget[]): void {
    targets.forEach(target => {
      this._instrumentTarget(target);
    });
    
    // TransactionManager는 매번 새로 생성되므로 prototype 레벨에서 계측
    this._instrumentTransactionManagerPrototype();
  }

  /**
   * 단일 대상 계측
   */
  private _instrumentTarget(target: InstrumentationTarget): void {
    // Editor의 executeCommand는 특별 처리
    if (target.className === 'Editor' && target.methods.includes('executeCommand')) {
      this._instrumentEditorExecuteCommand();
      // executeCommand를 제외한 다른 메서드들만 처리
      const otherMethods = target.methods.filter(m => m !== 'executeCommand');
      if (otherMethods.length > 0) {
        const instance = this._findInstance(target.className);
        if (instance) {
          otherMethods.forEach(methodName => {
            const original = instance[methodName];
            if (original && typeof original === 'function') {
              const key = `${target.className}.${methodName}`;
              this.originalMethods.set(key, original);
              instance[methodName] = this._wrapFunction(
                original,
                methodName,
                target.className,
                target.package,
                instance
              );
            }
          });
        }
      }
      return;
    }

    const instance = this._findInstance(target.className);
    if (!instance) {
      console.warn(`[AutoTracer] Instance not found: ${target.className}`);
      return;
    }

    // 각 메서드 계측
    target.methods.forEach(methodName => {
      const original = instance[methodName];
      if (original && typeof original === 'function') {
        // 원본 메서드 저장 (나중에 복원용)
        const key = `${target.className}.${methodName}`;
        this.originalMethods.set(key, original);

        // 메서드 래핑 (this 바인딩 보존)
        instance[methodName] = this._wrapFunction(
          original,
          methodName,
          target.className,
          target.package,
          instance,
          target.inputSerializer,
          target.outputSerializer
        );
      }
    });
  }

  /**
   * Editor.executeCommand 특별 계측
   * Editor 인스턴스의 executeCommand 메서드를 직접 래핑
   */
  private _instrumentEditorExecuteCommand(): void {
    const editor = this.editor as any;
    const original = editor.executeCommand;
    
    if (!original || typeof original !== 'function') {
      console.warn('[AutoTracer] Editor.executeCommand not found');
      return;
    }

    // 원본 메서드 저장
    const key = 'Editor.executeCommand';
    this.originalMethods.set(key, original);

    // executeCommand 래핑 (this 바인딩 유지)
    const self = this;
    editor.executeCommand = async function(command: string, payload?: any): Promise<boolean> {
      if (!self.enabled || !self._shouldTrace('executeCommand')) {
        return original.call(this, command, payload);
      }

      const parentContext = self.contextManager.getCurrentContext();
      const traceContext = self.contextManager.createContext(
        'executeCommand',
        'Editor',
        '@barocss/editor-core',
        parentContext?.spanId
      );

      const startTime = performance.now();

      try {
        // Trace 시작 이벤트
        self._emitTraceStart(traceContext, { command, payload });

        // 원본 함수 실행 (this 바인딩 유지)
        const result = await original.call(this, command, payload);

        // Trace 종료 이벤트
        self._emitTraceEnd(traceContext, result, performance.now() - startTime);
        self.contextManager.cleanupContext(traceContext.spanId);

        return result;
      } catch (error) {
        self._emitTraceError(traceContext, error as Error, performance.now() - startTime);
        self.contextManager.cleanupContext(traceContext.spanId);
        throw error;
      }
    };
  }

  /**
   * 모든 계측 해제
   */
  private _uninstrumentAll(): void {
    // 원본 메서드 복원
    this.originalMethods.forEach((original, key) => {
      if (key === 'Editor.executeCommand') {
        // Editor.executeCommand 특별 처리
        const editor = this.editor as any;
        editor.executeCommand = original;
      } else if (key === 'TransactionManager.prototype.execute') {
        // TransactionManager.prototype.execute 특별 처리
        TransactionManager.prototype.execute = original as any;
      } else {
        const [className, methodName] = key.split('.');
        const instance = this._findInstance(className);
        if (instance) {
          instance[methodName] = original;
        }
      }
    });
    this.originalMethods.clear();
  }

  /**
   * 함수 래핑
   */
  private _wrapFunction<T extends (...args: any[]) => any>(
    fn: T,
    name: string,
    className: string,
    packageName: string,
    instance?: any,
    inputSerializer?: (methodName: string, args: any[]) => any
  ): T {
    return ((...args: any[]) => {
      if (!this.enabled || !this._shouldTrace(name)) {
        // this 바인딩 보존
        return instance ? fn.call(instance, ...args) : fn(...args);
      }

      const parentContext = this.contextManager.getCurrentContext();
      const traceContext = this.contextManager.createContext(
        name,
        className,
        packageName,
        parentContext?.spanId
      );

      const startTime = performance.now();

      try {
        // Trace 시작 이벤트
        // Serializer 적용
        const serializedArgs = inputSerializer ? inputSerializer(name, args) : args;
        this._emitTraceStart(traceContext, serializedArgs);

        // 원본 함수 실행 (this 바인딩 보존)
        const result = instance ? fn.call(instance, ...args) : fn(...args);

        // Promise인 경우
        if (result instanceof Promise) {
          return result.then(
            (value) => {
              this._emitTraceEnd(traceContext, value, performance.now() - startTime);
              this.contextManager.cleanupContext(traceContext.spanId);
              return value;
            },
            (error) => {
              this._emitTraceError(traceContext, error, performance.now() - startTime);
              this.contextManager.cleanupContext(traceContext.spanId);
              throw error;
            }
          ) as any;
        }

        // 동기 함수인 경우
        this._emitTraceEnd(traceContext, result, performance.now() - startTime);
        this.contextManager.cleanupContext(traceContext.spanId);

        return result;
      } catch (error) {
        this._emitTraceError(traceContext, error as Error, performance.now() - startTime);
        this.contextManager.cleanupContext(traceContext.spanId);
        throw error;
      }
    }) as T;
  }

  /**
   * 추적 여부 결정 (샘플링)
   */
  private _shouldTrace(operationName: string): boolean {
    // 제외 패턴 확인
    if (this.options.excludePatterns) {
      for (const pattern of this.options.excludePatterns) {
        if (operationName.includes(pattern)) {
          return false;
        }
      }
    }

    // 샘플링
    return Math.random() < (this.options.samplingRate || 1.0);
  }

  /**
   * Trace 시작 이벤트 발생
   */
  private _emitTraceStart(
    context: TraceContext,
    input?: any
  ): void {
    // Trace 시작 시 Span 목록 초기화
    if (!this.currentTraceSpans.has(context.traceId)) {
      this.currentTraceSpans.set(context.traceId, []);
      this.anomalyDetector.reset();
    }

    // input을 context에 저장 (나중에 이상 징후 감지 시 사용)
    (context as any).input = input;

    this.editor.emit('editor:trace.start', {
      traceId: context.traceId,
      spanId: context.spanId,
      parentSpanId: context.parentSpanId,
      operationName: context.operationName,
      className: context.className,
      package: context.package,
      input,
      timestamp: Date.now()
    });
  }

  /**
   * Trace 종료 이벤트 발생
   */
  private _emitTraceEnd(
    context: TraceContext,
    output?: any,
    duration?: number
  ): void {
    // 이상 징후 감지
    const anomalies = this.anomalyDetector.detectAnomalies(
      context.operationName,
      context.className,
      context.input,
      output,
      Date.now()
    );

    // Span 정보 저장
    const spans = this.currentTraceSpans.get(context.traceId) || [];
    spans.push({
      spanId: context.spanId,
      methodName: context.operationName,
      className: context.className,
      package: context.package,
      input: context.input,
      output,
      anomalies: anomalies.length > 0 ? anomalies : undefined
    });

    // Root Span인 경우 전체 흐름 검증
    if (!context.parentSpanId) {
      const flowAnomalies = this.anomalyDetector.validateTraceFlow(spans);
      if (flowAnomalies.length > 0) {
        // 마지막 Span에 흐름 검증 결과 추가
        const lastSpan = spans[spans.length - 1];
        lastSpan.anomalies = [...(lastSpan.anomalies || []), ...flowAnomalies];
      }
      // Trace 종료 시 정리
      this.currentTraceSpans.delete(context.traceId);
    }

    this.editor.emit('editor:trace.end', {
      traceId: context.traceId,
      spanId: context.spanId,
      operationName: context.operationName,
      output,
      duration: duration || (performance.now() - context.startTime),
      timestamp: Date.now(),
      anomalies: anomalies.length > 0 ? anomalies : undefined
    });
  }

  /**
   * Trace 에러 이벤트 발생
   */
  private _emitTraceError(
    context: TraceContext,
    error: Error,
    duration?: number
  ): void {
    this.editor.emit('editor:trace.error', {
      traceId: context.traceId,
      spanId: context.spanId,
      operationName: context.operationName,
      error: {
        message: error.message,
        stack: error.stack,
        name: error.name
      },
      duration: duration || (performance.now() - context.startTime),
      timestamp: Date.now()
    });
  }

  /**
   * Editor 인스턴스에서 대상 찾기
   */
  private _findInstance(className: string): any {
    const editor = this.editor as any;

    if (className === 'Editor') {
      return editor;
    }
    
    // EditorViewDOM 접근
    const viewDOM = editor._viewDOM;
    if (!viewDOM) {
      return null;
    }

    if (className === 'InputHandlerImpl') {
      // InputHandlerImpl은 private inputHandler 필드
      return viewDOM.inputHandler || (viewDOM as any)._inputHandler;
    }
    
    // DataStore 접근 (private _dataStore 또는 public dataStore)
    const dataStore = editor.dataStore || (editor as any)._dataStore;
    
    if (className === 'CoreOperations') {
      return dataStore?.core;
    }
    if (className === 'RangeOperations') {
      return dataStore?.range;
    }
    if (className === 'MarkOperations') {
      return dataStore?.marks;
    }
    
    if (className === 'TransactionManager') {
      return editor.transactionManager || editor._transactionManager;
    }
    
    // DOMRenderer 접근
    const domRenderer = viewDOM._domRenderer || (viewDOM as any).domRenderer;
    
    if (className === 'DOMRenderer') {
      return domRenderer;
    }
    if (className === 'Reconciler') {
      return domRenderer?._reconciler || (domRenderer as any)?.reconciler;
    }
    if (className === 'VNodeBuilder') {
      return domRenderer?._vnodeBuilder || (domRenderer as any)?.vnodeBuilder;
    }
    if (className === 'DOMOperations') {
      return domRenderer?.domOperations || (domRenderer as any)?.domOperations;
    }

    return null;
  }

  /**
   * TransactionManager.prototype.execute 직접 계측
   * TransactionManager는 매번 새로 생성되므로 prototype 레벨에서 래핑
   */
  private _instrumentTransactionManagerPrototype(): void {
    const originalExecute = TransactionManager.prototype.execute;
    if (!originalExecute || typeof originalExecute !== 'function') {
      console.warn('[AutoTracer] TransactionManager.prototype.execute not found');
      return;
    }
    
    // 원본 메서드 저장
    const key = 'TransactionManager.prototype.execute';
    this.originalMethods.set(key, originalExecute);
    
    // TransactionManager.prototype.execute 래핑
    const self = this;
    TransactionManager.prototype.execute = async function(operations: any[]): Promise<any> {
      if (!self.enabled || !self._shouldTrace('execute')) {
        return originalExecute.call(this, operations);
      }
      
      const parentContext = self.contextManager.getCurrentContext();
      const traceContext = self.contextManager.createContext(
        'execute',
        'TransactionManager',
        '@barocss/model',
        parentContext?.spanId
      );
      
      const startTime = performance.now();
      
      try {
        // Trace 시작 이벤트
        self._emitTraceStart(traceContext, { operations });
        
        // 원본 함수 실행 (this 바인딩 유지)
        const result = await originalExecute.call(this, operations);
        
        // Trace 종료 이벤트
        self._emitTraceEnd(traceContext, result, performance.now() - startTime);
        self.contextManager.cleanupContext(traceContext.spanId);
        
        return result;
      } catch (error) {
        self._emitTraceError(traceContext, error as Error, performance.now() - startTime);
        self.contextManager.cleanupContext(traceContext.spanId);
        throw error;
      }
    };
  }
}

