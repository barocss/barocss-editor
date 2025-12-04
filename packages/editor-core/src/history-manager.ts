import { TransactionOperation } from '@barocss/model';

/**
 * History Entry - 히스토리 항목
 */
export interface HistoryEntry {
  id: string;
  timestamp: Date;
  operations: TransactionOperation[];
  inverseOperations: TransactionOperation[];
  description?: string;
  metadata?: Record<string, any>;
}

/**
 * History Manager Options
 */
export interface HistoryManagerOptions {
  maxSize?: number;           // 최대 히스토리 크기 (기본값: 100)
}

/**
 * History Manager - 에디터의 실행 취소/다시 실행 기능을 관리
 * 
 * 주요 기능:
 * - 히스토리 엔트리 추가/제거
 * - 실행 취소/다시 실행
 * - 히스토리 크기 관리
 */
export class HistoryManager {
  private history: HistoryEntry[] = [];
  private currentIndex: number = -1;
  private maxSize: number;

  constructor(options: HistoryManagerOptions = {}) {
    this.maxSize = options.maxSize || 100;
  }

  /**
   * 히스토리에 새 엔트리 추가
   */
  push(entry: Omit<HistoryEntry, 'id' | 'timestamp'>): void {
    // 유효성 검사
    if (!entry.operations || entry.operations.length === 0) {
      console.warn('[HistoryManager] Empty operations array, skipping history entry');
      return;
    }

    const newEntry: HistoryEntry = {
      id: `history-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date(),
      ...entry
    };

    // 현재 인덱스 이후의 히스토리 제거 (새로운 변경사항이 있을 때)
    this.history = this.history.slice(0, this.currentIndex + 1);
    
    // 새 엔트리 추가
    this.history.push(newEntry);
    this.currentIndex = this.history.length - 1;
    
    // 최대 크기 제한
    this.limit(this.maxSize);
  }

  /**
   * 실행 취소 - 이전 상태로 되돌리기
   */
  undo(): HistoryEntry | null {
    if (!this.canUndo()) return null;
    
    const entry = this.history[this.currentIndex];
    this.currentIndex--;
    return entry;
  }

  /**
   * 다시 실행 - 취소한 작업 다시 실행
   */
  redo(): HistoryEntry | null {
    if (!this.canRedo()) return null;
    
    this.currentIndex++;
    return this.history[this.currentIndex];
  }

  /**
   * 실행 취소 가능 여부
   */
  canUndo(): boolean {
    return this.currentIndex >= 0;
  }

  /**
   * 다시 실행 가능 여부
   */
  canRedo(): boolean {
    return this.currentIndex < this.history.length - 1;
  }

  /**
   * 현재 히스토리 인덱스
   */
  getCurrentIndex(): number {
    return this.currentIndex;
  }

  /**
   * 전체 히스토리 가져오기
   */
  getHistory(): readonly HistoryEntry[] {
    return [...this.history];
  }

  /**
   * 히스토리 크기 제한
   */
  limit(maxSize: number): void {
    if (this.history.length <= maxSize) return;
    
    // 오래된 히스토리부터 제거 (최신 것들만 유지)
    const removeCount = this.history.length - maxSize;
    this.history = this.history.slice(removeCount);
    
    // currentIndex 조정: 제거된 개수만큼 빼기
    this.currentIndex = Math.max(0, this.currentIndex - removeCount);
  }

  /**
   * 히스토리 크기 동적 조정
   */
  resize(newMaxSize: number): void {
    this.maxSize = newMaxSize;
    this.limit(newMaxSize);
  }

  /**
   * 메모리 사용량 추정 (대략적)
   */
  getMemoryUsage(): number {
    return this.history.reduce((total, entry) => {
      return total + JSON.stringify(entry).length;
    }, 0);
  }

  /**
   * 히스토리 초기화
   */
  clear(): void {
    this.history = [];
    this.currentIndex = -1;
  }

  /**
   * 히스토리 통계 정보
   */
  getStats(): {
    totalEntries: number;
    currentIndex: number;
    canUndo: boolean;
    canRedo: boolean;
  } {
    return {
      totalEntries: this.history.length,
      currentIndex: this.currentIndex,
      canUndo: this.canUndo(),
      canRedo: this.canRedo()
    };
  }

  /**
   * 특정 인덱스의 히스토리 엔트리 가져오기
   */
  getEntry(index: number): HistoryEntry | null {
    if (index < 0 || index >= this.history.length) return null;
    return this.history[index];
  }

  /**
   * 히스토리 엔트리 검색
   */
  findEntries(predicate: (entry: HistoryEntry) => boolean): HistoryEntry[] {
    return this.history.filter(predicate);
  }

  /**
   * 특정 시간 범위의 히스토리 엔트리 가져오기
   */
  getEntriesByTimeRange(startTime: Date, endTime: Date): HistoryEntry[] {
    return this.history.filter(entry => 
      entry.timestamp >= startTime && entry.timestamp <= endTime
    );
  }

  /**
   * 히스토리 엔트리 삭제
   */
  removeEntry(entryId: string): boolean {
    const index = this.history.findIndex(entry => entry.sid === entryId);
    if (index === -1) return false;
    
    this.history.splice(index, 1);
    
    // 현재 인덱스 조정
    if (this.currentIndex >= index) {
      this.currentIndex = Math.max(0, this.currentIndex - 1);
    }
    
    return true;
  }

  /**
   * 히스토리 압축 (연속된 유사한 작업들을 하나로 합침)
   */
  compress(): void {
    if (this.history.length < 2) return;

    const compressed: HistoryEntry[] = [];
    let current = this.history[0];

    for (let i = 1; i < this.history.length; i++) {
      const next = this.history[i];
      
      // 연속된 텍스트 작업인지 확인
      if (this._canCompress(current, next)) {
        // 압축 가능한 경우 합침
        current = {
          ...current,
          operations: [...current.operations, ...next.operations],
          inverseOperations: [...next.inverseOperations, ...current.inverseOperations],
          description: current.description || next.description
        };
      } else {
        // 압축 불가능한 경우 현재 엔트리 추가
        compressed.push(current);
        current = next;
      }
    }
    
    compressed.push(current);
    
    // 압축된 히스토리로 교체
    this.history = compressed;
    this.currentIndex = Math.min(this.currentIndex, this.history.length - 1);
  }

  /**
   * 두 히스토리 엔트리가 압축 가능한지 확인
   */
  private _canCompress(entry1: HistoryEntry, entry2: HistoryEntry): boolean {
    // 간단한 압축 로직: 같은 노드에 대한 연속된 텍스트 작업
    if (entry1.operations.length !== 1 || entry2.operations.length !== 1) return false;
    
    const op1 = entry1.operations[0];
    const op2 = entry2.operations[0];
    
    return op1.type === 'setText' && 
           op2.type === 'setText' && 
           op1.payload?.nodeId === op2.payload?.nodeId;
  }

  /**
   * 히스토리 상태 검증
   */
  validate(): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];
    
    // 인덱스 범위 검사
    if (this.currentIndex < -1 || this.currentIndex >= this.history.length) {
      errors.push(`Invalid currentIndex: ${this.currentIndex}, history length: ${this.history.length}`);
    }
    
    // 히스토리 엔트리 검사
    this.history.forEach((entry, index) => {
      if (!entry.sid || !entry.timestamp || !entry.operations) {
        errors.push(`Invalid entry at index ${index}: missing required fields`);
      }
      
      if (entry.operations.length !== entry.inverseOperations.length) {
        errors.push(`Entry at index ${index}: operations and inverseOperations length mismatch`);
      }
    });
    
    return {
      isValid: errors.length === 0,
      errors
    };
  }
}
