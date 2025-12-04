/**
 * @barocss/text-analyzer
 * 
 * Smart text change analyzer with LCP/LCS algorithm and selection bias
 * 
 * Features:
 * - LCP/LCS algorithm for O(n) time complexity text difference calculation
 * - Selection bias for accurate change position detection
 * - Unicode safety handling for complex characters (emojis, combining marks)
 * - NFC normalization for consistent text processing
 */

// Main analyzer function
export { analyzeTextChanges } from './smart-text-analyzer';

// Types
export type {
  TextChange,
  TextChangeAnalysisOptions,
  TextDifference
} from './types';

// Re-export for convenience
export { analyzeTextChanges as analyze } from './smart-text-analyzer';
