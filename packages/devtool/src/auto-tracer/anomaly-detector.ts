/**
 * 이상 징후 자동 감지
 * 
 * 예상값 없이도 "뭔가 이상하다"를 감지하여 디버깅을 돕습니다.
 */

export enum AnomalySeverity {
  CRITICAL = 'critical',  // 🔴 심각한 문제 (데이터 손실, 크래시 가능성)
  WARNING = 'warning',    // 🟡 경고 (예상치 못한 동작)
  INFO = 'info'           // 🔵 정보 (참고사항)
}

export interface Anomaly {
  severity: AnomalySeverity;
  type: string;
  message: string;
  details?: any;
}

export class AnomalyDetector {
  private lastSelections: Map<string, { selection: any; timestamp: number }> = new Map();
  private lastModelState: Map<string, any> = new Map();
  private renderTimestamp: number = 0;
  private selectionUpdateAfterRender: boolean = false;

  /**
   * Span 실행 후 이상 징후 감지
   */
  detectAnomalies(
    methodName: string,
    className: string,
    input: any,
    output: any,
    timestamp: number
  ): Anomaly[] {
    const anomalies: Anomaly[] = [];

    // Selection 관련 이상 징후
    if (methodName === 'updateSelection' || methodName === 'convertModelSelectionToDOM') {
      anomalies.push(...this._detectSelectionAnomalies(input, output, timestamp));
    }

    // 텍스트 변경 관련 이상 징후
    if (methodName === 'deleteText' || methodName === 'replaceText' || methodName === 'setNode') {
      anomalies.push(...this._detectTextChangeAnomalies(methodName, input, output));
    }

    // Render 관련 이상 징후
    if (methodName === 'render') {
      this.renderTimestamp = timestamp;
      this.selectionUpdateAfterRender = false;
    }

    // Selection 복구 누락 감지
    if (methodName === 'updateSelection' && this.renderTimestamp > 0) {
      const timeSinceRender = timestamp - this.renderTimestamp;
      if (timeSinceRender < 100) {
        this.selectionUpdateAfterRender = true;
      }
    }

    // DOM-Model 동기화 이상 징후
    if (methodName === 'reconcile') {
      anomalies.push(...this._detectSyncAnomalies(input, output));
    }

    return anomalies;
  }

  /**
   * Trace 종료 시 전체 흐름 검증
   */
  validateTraceFlow(spans: any[]): Anomaly[] {
    const anomalies: Anomaly[] = [];

    // render 후 Selection 복구 누락 감지
    const hasRender = spans.some(s => s.methodName === 'render');
    const hasSelectionUpdate = spans.some(s => 
      s.methodName === 'updateSelection' || s.methodName === 'convertModelSelectionToDOM'
    );

    if (hasRender && !hasSelectionUpdate) {
      anomalies.push({
        severity: AnomalySeverity.WARNING,
        type: 'SELECTION_NOT_RESTORED',
        message: 'Render 후 Selection 복구가 누락되었습니다',
        details: {
          suggestion: 'render 후 convertModelSelectionToDOM 또는 updateSelection을 호출해야 합니다'
        }
      });
    }

    // Transaction 없이 DataStore 직접 수정 감지
    const hasDataStoreChange = spans.some(s => 
      s.className === 'CoreOperations' || s.className === 'RangeOperations'
    );
    const hasTransaction = spans.some(s => s.className === 'TransactionManager');

    if (hasDataStoreChange && !hasTransaction) {
      anomalies.push({
        severity: AnomalySeverity.WARNING,
        type: 'NO_TRANSACTION',
        message: 'Transaction 없이 DataStore를 직접 수정했습니다',
        details: {
          suggestion: 'Command → Transaction → Operation 패턴을 사용하세요'
        }
      });
    }

    return anomalies;
  }

  /**
   * Selection 이상 징후 감지
   */
  private _detectSelectionAnomalies(input: any, output: any, timestamp: number): Anomaly[] {
    const anomalies: Anomaly[] = [];

    // Selection 데이터 추출
    let selection: any = null;
    if (Array.isArray(input) && input[0]) {
      selection = input[0];
    } else if (input && typeof input === 'object') {
      selection = input;
    }

    if (!selection || !selection.anchor) {
      return anomalies;
    }

    // Selection이 짧은 시간에 여러 번 변경됨 (튐 현상)
    const lastSel = this.lastSelections.get('current');
    if (lastSel) {
      const timeDiff = timestamp - lastSel.timestamp;
      if (timeDiff < 50) { // 50ms 이내 재변경
        anomalies.push({
          severity: AnomalySeverity.WARNING,
          type: 'SELECTION_FLICKER',
          message: 'Selection이 짧은 시간에 여러 번 변경되었습니다 (커서 튐 가능성)',
          details: {
            timeDiff: `${timeDiff}ms`,
            previous: lastSel.selection,
            current: selection
          }
        });
      }
    }

    this.lastSelections.set('current', { selection, timestamp });

    // Selection offset 범위 검증 (nodeId에서 추출 가능한 경우)
    const anchorStr = selection.anchor;
    if (typeof anchorStr === 'string' && anchorStr.includes(':')) {
      const [nodeId, offsetStr] = anchorStr.split(':');
      const offset = parseInt(offsetStr, 10);
      
      // 음수 offset
      if (offset < 0) {
        anomalies.push({
          severity: AnomalySeverity.CRITICAL,
          type: 'INVALID_SELECTION_OFFSET',
          message: 'Selection offset이 음수입니다',
          details: { nodeId, offset }
        });
      }

      // 매우 큰 offset (1000자 이상은 비정상적)
      if (offset > 1000) {
        anomalies.push({
          severity: AnomalySeverity.WARNING,
          type: 'SUSPICIOUS_SELECTION_OFFSET',
          message: 'Selection offset이 비정상적으로 큽니다',
          details: { nodeId, offset }
        });
      }
    }

    return anomalies;
  }

  /**
   * 텍스트 변경 이상 징후 감지
   */
  private _detectTextChangeAnomalies(methodName: string, input: any, output: any): Anomaly[] {
    const anomalies: Anomaly[] = [];

    // setNode의 경우 텍스트 길이와 Mark 범위 검증
    if (methodName === 'setNode' && Array.isArray(input) && input[0]) {
      const node = input[0];
      const text = node.text;
      const marks = node.marks;

      if (typeof text === 'string' && Array.isArray(marks)) {
        const textLength = text.length;

        marks.forEach((mark: any, index: number) => {
          if (!mark.range) return; // range 없는 mark는 전체 적용이므로 OK

          const [start, end] = mark.range;

          // Mark 범위가 텍스트 길이를 초과
          if (end > textLength) {
            anomalies.push({
              severity: AnomalySeverity.CRITICAL,
              type: 'MARK_OUT_OF_BOUNDS',
              message: `Mark 범위가 텍스트 길이를 초과합니다`,
              details: {
                nodeId: node.sid,
                markType: mark.stype,
                markRange: [start, end],
                textLength
              }
            });
          }

          // Mark 범위가 역순 (start > end)
          if (start > end) {
            anomalies.push({
              severity: AnomalySeverity.CRITICAL,
              type: 'INVALID_MARK_RANGE',
              message: `Mark 범위가 역순입니다 (start > end)`,
              details: {
                nodeId: node.sid,
                markType: mark.stype,
                markRange: [start, end]
              }
            });
          }

          // 음수 범위
          if (start < 0 || end < 0) {
            anomalies.push({
              severity: AnomalySeverity.CRITICAL,
              type: 'NEGATIVE_MARK_RANGE',
              message: `Mark 범위에 음수가 포함되어 있습니다`,
              details: {
                nodeId: node.sid,
                markType: mark.stype,
                markRange: [start, end]
              }
            });
          }
        });

        // 중복 Mark 감지 (같은 타입의 Mark가 여러 개)
        const markTypes = marks.map((m: any) => m.stype);
        const duplicates = markTypes.filter((type: string, index: number) => 
          markTypes.indexOf(type) !== index
        );
        if (duplicates.length > 0) {
          anomalies.push({
            severity: AnomalySeverity.WARNING,
            type: 'DUPLICATE_MARKS',
            message: `중복된 Mark가 있습니다 (normalization 필요)`,
            details: {
              nodeId: node.sid,
              duplicateTypes: [...new Set(duplicates)]
            }
          });
        }
      }
    }

    return anomalies;
  }

  /**
   * DOM-Model 동기화 이상 징후 감지
   */
  private _detectSyncAnomalies(input: any, output: any): Anomaly[] {
    const anomalies: Anomaly[] = [];

    // TODO: DOM과 Model의 텍스트 비교는 실제 DOM 접근이 필요하므로
    // 현재는 구조적 검증만 수행
    // 향후 개선: Reconciler에서 실제 DOM 텍스트를 읽어서 비교

    return anomalies;
  }

  /**
   * 상태 초기화 (새 Trace 시작 시)
   */
  reset(): void {
    this.lastSelections.clear();
    this.lastModelState.clear();
    this.renderTimestamp = 0;
    this.selectionUpdateAfterRender = false;
  }
}

