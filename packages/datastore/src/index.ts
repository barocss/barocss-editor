export type { INode, IMark, RootDocument, Document, ValidationResult } from './types';
export * from './data-store';
export * from './validators';
export * from './loader';
export * from './performance';
/**
 * Exported because the model's `applyMark` applies the same rule on its own
 * single-node path, and two copies of "make room for this mark" would be two
 * places to disagree about what a run's formatting is.
 */
export { clearMarkOverRange } from './operations/mark-range';
