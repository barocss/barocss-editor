/**
 * Text Change Analysis Types
 * 
 * Type definitions needed for text change analysis
 */

/**
 * Interface representing text change
 * 
 * @interface TextChange
 */
export interface TextChange {
  /** Change type: insert, delete, replace */
  type: 'insert' | 'delete' | 'replace';
  
  /** Change start position (based on oldText) */
  start: number;
  
  /** Change end position (based on oldText) */
  end: number;
  
  /** Text to change
   * - insert: text to insert
   * - delete: empty string
   * - replace: text to replace
   */
  text: string;
  
  /** Analysis confidence (0-1) */
  confidence: number;
}

/**
 * Text change analysis options
 * 
 * @interface TextChangeAnalysisOptions
 */
export interface TextChangeAnalysisOptions {
  /** Text before change */
  oldText: string;
  
  /** Text after change */
  newText: string;
  
  /** User Selection start position */
  selectionOffset: number;
  
  /** Selected text length (0 if cursor) */
  selectionLength?: number;
  
  /** Additional context info (optional) */
  context?: {
    /** Context before */
    beforeText?: string;
    
    /** Context after */
    afterText?: string;
  };
}

/**
 * LCP/LCS algorithm result
 * 
 * @interface TextDifference
 */
export interface TextDifference {
  /** Change kind */
  kind: 'none' | 'insert' | 'delete' | 'replace';
  
  /** Change start position */
  start: number;
  
  /** Change end position */
  end: number;
  
  /** Inserted text */
  inserted: string;
  
  /** Deleted text */
  deleted: string;
}
