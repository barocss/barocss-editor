/**
 * Public API Surface
 * - Re-exports builders/registry/reconcile/scheduler/measurement utilities
 * - Upper layers (editor-view-dom) should depend on this surface only
 */
export * from './types';
export * from './node-cache';
export * from './dom-renderer';
export * from './scheduler';
export * from './measure';
export * from './utils/text-run-index';

// Export VNode types and utilities for external consumers
export * from './vnode';

// Export component state management APIs
export { defineState } from './api/define-state';
export { BaseComponentState } from './state/base-component-state';

// Export logger utilities for debugging
export { logger, testLogger, LogCategory, setCategoryEnabled, enableAllCategories, disableAllCategories } from './utils/logger';
export { __DEV__, __TEST__ } from './utils/dev';