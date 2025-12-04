import type { ModelSelection } from '@barocss/editor-core';

/**
 * SelectionContext - 트랜잭션 내에서 Selection을 관리하는 컨텍스트 클래스
 * 
 * 각 operation이 context.selection.current를 직접 갱신하여
 * 최종 selectionAfter를 계산할 수 있도록 함
 */
export class SelectionContext {
  // 트랜잭션 시작 시점의 스냅샷
  public readonly before: ModelSelection | null;
  // 오퍼레이션들이 갱신하는 현재 값(최종 SelectionAfter)
  public current: ModelSelection | null;

  constructor(before: ModelSelection | null) {
    this.before = before;
    this.current = before ? { ...before } : null;
  }

  /**
   * Selection 전체를 설정
   */
  setSelection(next: ModelSelection): void {
    if (this.current) {
      Object.assign(this.current, next);
    } else {
      // current가 null이면 새로 생성
      this.current = { ...next };
    }
  }

  /**
   * 단일 캐럿(커서) 설정
   */
  setCaret(nodeId: string, offset: number): void {
    if (this.current) {
      this.current.type = 'range';
      this.current.startNodeId = nodeId;
      this.current.startOffset = offset;
      this.current.endNodeId = nodeId;
      this.current.endOffset = offset;
      this.current.collapsed = true;
      this.current.direction = 'none';
    } else {
      // current가 null이면 새로 생성
      this.current = {
        type: 'range',
        startNodeId: nodeId,
        startOffset: offset,
        endNodeId: nodeId,
        endOffset: offset,
        collapsed: true,
        direction: 'none'
      };
    }
  }

  /**
   * 범위 선택 설정
   */
  setRange(startId: string, startOff: number, endId: string, endOff: number): void {
    if (this.current) {
      this.current.type = 'range';
      this.current.startNodeId = startId;
      this.current.startOffset = startOff;
      this.current.endNodeId = endId;
      this.current.endOffset = endOff;
      this.current.collapsed = startId === endId && startOff === endOff;
      this.current.direction = 'forward';
    } else {
      // current가 null이면 새로 생성
      this.current = {
        type: 'range',
        startNodeId: startId,
        startOffset: startOff,
        endNodeId: endId,
        endOffset: endOff,
        collapsed: startId === endId && startOff === endOff,
        direction: 'forward'
      };
    }
  }

  /**
   * Selection 클리어
   */
  clear(): void {
    this.current = null;
  }
}

