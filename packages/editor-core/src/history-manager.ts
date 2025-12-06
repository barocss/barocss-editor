import { TransactionOperation } from '@barocss/model';

/**
 * History Entry
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
  maxSize?: number;           // Maximum history size (default: 100)
}

/**
 * History Manager - manages editor undo/redo functionality
 * 
 * Main features:
 * - Add/remove history entries
 * - Undo/redo
 * - History size management
 */
export class HistoryManager {
  private history: HistoryEntry[] = [];
  private currentIndex: number = -1;
  private maxSize: number;

  constructor(options: HistoryManagerOptions = {}) {
    this.maxSize = options.maxSize || 100;
  }

  /**
   * Add new entry to history
   */
  push(entry: Omit<HistoryEntry, 'id' | 'timestamp'>): void {
    // Validation
    if (!entry.operations || entry.operations.length === 0) {
      console.warn('[HistoryManager] Empty operations array, skipping history entry');
      return;
    }

    const newEntry: HistoryEntry = {
      id: `history-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date(),
      ...entry
    };

    // Remove history after current index (when new changes occur)
    this.history = this.history.slice(0, this.currentIndex + 1);
    
    this.history.push(newEntry);
    this.currentIndex = this.history.length - 1;
    
    this.limit(this.maxSize);
  }

  /**
   * Undo - revert to previous state
   */
  undo(): HistoryEntry | null {
    if (!this.canUndo()) return null;
    
    const entry = this.history[this.currentIndex];
    this.currentIndex--;
    return entry;
  }

  /**
   * Redo - re-execute cancelled operation
   */
  redo(): HistoryEntry | null {
    if (!this.canRedo()) return null;
    
    this.currentIndex++;
    return this.history[this.currentIndex];
  }

  /**
   * Check if undo is possible
   */
  canUndo(): boolean {
    return this.currentIndex >= 0;
  }

  /**
   * Check if redo is possible
   */
  canRedo(): boolean {
    return this.currentIndex < this.history.length - 1;
  }

  /**
   * Get current history index
   */
  getCurrentIndex(): number {
    return this.currentIndex;
  }

  /**
   * Get full history
   */
  getHistory(): readonly HistoryEntry[] {
    return [...this.history];
  }

  /**
   * Limit history size
   */
  limit(maxSize: number): void {
    if (this.history.length <= maxSize) return;
    
    // Remove old history entries (keep only recent ones)
    const removeCount = this.history.length - maxSize;
    this.history = this.history.slice(removeCount);
    
    // Adjust currentIndex: subtract removed count
    this.currentIndex = Math.max(0, this.currentIndex - removeCount);
  }

  /**
   * Dynamically resize history
   */
  resize(newMaxSize: number): void {
    this.maxSize = newMaxSize;
    this.limit(newMaxSize);
  }

  /**
   * Estimate memory usage (approximate)
   */
  getMemoryUsage(): number {
    return this.history.reduce((total, entry) => {
      return total + JSON.stringify(entry).length;
    }, 0);
  }

  /**
   * Clear history
   */
  clear(): void {
    this.history = [];
    this.currentIndex = -1;
  }

  /**
   * Get history statistics
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
   * Get history entry at specific index
   */
  getEntry(index: number): HistoryEntry | null {
    if (index < 0 || index >= this.history.length) return null;
    return this.history[index];
  }

  /**
   * Search history entries
   */
  findEntries(predicate: (entry: HistoryEntry) => boolean): HistoryEntry[] {
    return this.history.filter(predicate);
  }

  /**
   * Get history entries within specific time range
   */
  getEntriesByTimeRange(startTime: Date, endTime: Date): HistoryEntry[] {
    return this.history.filter(entry => 
      entry.timestamp >= startTime && entry.timestamp <= endTime
    );
  }

  /**
   * Remove history entry
   */
  removeEntry(entryId: string): boolean {
    const index = this.history.findIndex(entry => entry.id === entryId);
    if (index === -1) return false;
    
    this.history.splice(index, 1);
    
    // Adjust current index
    if (this.currentIndex >= index) {
      this.currentIndex = Math.max(0, this.currentIndex - 1);
    }
    
    return true;
  }

  /**
   * Compress history (merge consecutive similar operations into one)
   */
  compress(): void {
    if (this.history.length < 2) return;

    const compressed: HistoryEntry[] = [];
    let current = this.history[0];

    for (let i = 1; i < this.history.length; i++) {
      const next = this.history[i];
      
      // Check if consecutive text operations
      if (this._canCompress(current, next)) {
        // Merge if compressible
        current = {
          ...current,
          operations: [...current.operations, ...next.operations],
          inverseOperations: [...next.inverseOperations, ...current.inverseOperations],
          description: current.description || next.description
        };
      } else {
        // Add current entry if not compressible
        compressed.push(current);
        current = next;
      }
    }
    
    compressed.push(current);
    
    // Replace with compressed history
    this.history = compressed;
    this.currentIndex = Math.min(this.currentIndex, this.history.length - 1);
  }

  /**
   * Check if two history entries can be compressed
   */
  private _canCompress(entry1: HistoryEntry, entry2: HistoryEntry): boolean {
    // Simple compression logic: consecutive text operations on the same node
    if (entry1.operations.length !== 1 || entry2.operations.length !== 1) return false;
    
    const op1 = entry1.operations[0];
    const op2 = entry2.operations[0];
    
    return op1.type === 'setText' && 
           op2.type === 'setText' && 
           op1.payload?.nodeId === op2.payload?.nodeId;
  }

  /**
   * Validate history state
   */
  validate(): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];
    
    // Check index range
    if (this.currentIndex < -1 || this.currentIndex >= this.history.length) {
      errors.push(`Invalid currentIndex: ${this.currentIndex}, history length: ${this.history.length}`);
    }
    
    // Check history entries
    this.history.forEach((entry, index) => {
      if (!entry.id || !entry.timestamp || !entry.operations) {
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
