/**
 * Development logger
 * 
 * Provides consistent logging interface following React's pattern
 * with additional category-based filtering support
 */

import { __DEV__, __TEST__ } from './dev';

/**
 * Logger categories
 * 
 * Each category can be enabled/disabled independently
 */
export const LogCategory = {
  RECONCILE: 'Reconcile',
  FIBER: 'Fiber',
  VNODE: 'VNode',
  MARK: 'Mark',
  DECORATOR: 'Decorator',
  COMPONENT: 'Component',
  SELECTION: 'Selection',
  TEXT_INPUT: 'TextInput',
  DOM: 'DOM',
} as const;

export type LogCategoryType = typeof LogCategory[keyof typeof LogCategory];

/**
 * Category enable/disable flags (runtime configuration)
 * 
 * Categories are disabled by default and can be enabled at runtime
 */
const categoryFlags: Record<string, boolean> = {
  [LogCategory.RECONCILE]: false,
  [LogCategory.FIBER]: false,
  [LogCategory.VNODE]: false,
  [LogCategory.MARK]: false,
  [LogCategory.DECORATOR]: false,
  [LogCategory.COMPONENT]: false,
  [LogCategory.SELECTION]: false,
  [LogCategory.TEXT_INPUT]: false,
  [LogCategory.DOM]: false,
};

function parseBooleanFlag(value: string | undefined): boolean {
  if (!value) return false;
  const normalized = value.toLowerCase();
  return normalized === '1' || normalized === 'true' || normalized === 'yes';
}

/**
 * Enable/disable logging for a specific category
 * 
 * @example
 *   setCategoryEnabled(LogCategory.RECONCILE, true);
 */
export function setCategoryEnabled(category: string, enabled: boolean): void {
  categoryFlags[category] = enabled;
}

/**
 * Check if a category is enabled
 */
export function isCategoryEnabled(category: string): boolean {
  return categoryFlags[category] ?? false;
}

/**
 * Enable all categories (useful for debugging)
 */
export function enableAllCategories(): void {
  Object.values(LogCategory).forEach(category => {
    setCategoryEnabled(category, true);
  });
}

/**
 * Disable all categories
 */
export function disableAllCategories(): void {
  Object.values(LogCategory).forEach(category => {
    setCategoryEnabled(category, false);
  });
}

/**
 * Development logger with category support
 * 
 * Follows React's logging pattern:
 * - debug/info: Only in development mode
 * - warn: Always shown (but can be filtered by category)
 * - error: Always shown (critical issues)
 */
export const logger = {
  /**
   * Debug log - detailed information for development
   * Only shown in development mode and when category is enabled
   * 
   * @example
   *   logger.debug(LogCategory.RECONCILE, 'prevVNode 정보', { vnodeSid, prevVNodeExists });
   */
  debug: (category: LogCategoryType, message: string, data?: any): void => {
    if (__DEV__ && isCategoryEnabled(category)) {
      console.log(`[${category}] ${message}`, data || '');
    }
  },

  /**
   * Info log - important information
   * Only shown in development mode and when category is enabled
   */
  info: (category: LogCategoryType, message: string, data?: any): void => {
    if (__DEV__ && isCategoryEnabled(category)) {
      console.info(`[${category}] ${message}`, data || '');
    }
  },

  /**
   * Warning - potential issues that should be addressed
   * Always shown (even in production), but can be filtered by category
   * 
   * @example
   *   logger.warn(LogCategory.RECONCILE, 'prevVNode를 찾지 못함', { vnodeSid });
   */
  warn: (category: LogCategoryType, message: string, data?: any): void => {
    if (isCategoryEnabled(category)) {
      console.warn(`[${category}] ${message}`, data || '');
    }
  },

  /**
   * Error - critical issues that need immediate attention
   * Always shown (cannot be filtered)
   * 
   * @example
   *   logger.error(LogCategory.RECONCILE, 'Failed to reconcile', error);
   */
  error: (category: LogCategoryType, message: string, error?: any): void => {
    console.error(`[${category}] ${message}`, error || '');
  },
};

/**
 * Test-only logger
 * 
 * Logs that should only appear during tests
 */
export const testLogger = {
  debug: (category: LogCategoryType, message: string, data?: any): void => {
    if (__TEST__ && isCategoryEnabled(category)) {
      console.log(`[TEST:${category}] ${message}`, data || '');
    }
  },
  warn: (category: LogCategoryType, message: string, data?: any): void => {
    if (__TEST__ && isCategoryEnabled(category)) {
      console.warn(`[TEST:${category}] ${message}`, data || '');
    }
  },
};

/**
 * Check if legacy debug flag is enabled
 * 
 * These can be set via globalThis for backward compatibility
 * 
 * @deprecated Use logger.debug() with category instead
 */
export function isLegacyDebugEnabled(flag: string): boolean {
  if (typeof globalThis === 'undefined') return false;
  return Boolean((globalThis as any)[flag]);
}

/**
 * Enable category via legacy flag name
 * 
 * @deprecated Use setCategoryEnabled() instead
 */
export function enableCategoryFromLegacyFlag(flag: string, category: LogCategoryType): void {
  if (isLegacyDebugEnabled(flag)) {
    setCategoryEnabled(category, true);
  }
}

function enableCategoryFromEnvVar(envName: string, category: LogCategoryType): void {
  if (typeof process === 'undefined' || !process.env) {
    return;
  }
  if (parseBooleanFlag(process.env[envName])) {
    setCategoryEnabled(category, true);
  }
}

// Auto-enable categories from legacy flags (for backward compatibility)
if (typeof globalThis !== 'undefined') {
  if ((globalThis as any).__DEBUG_RECONCILE__) {
    setCategoryEnabled(LogCategory.RECONCILE, true);
  }
  if ((globalThis as any).__DEBUG_MARKS__) {
    setCategoryEnabled(LogCategory.MARK, true);
  }
  if ((globalThis as any).__DEBUG_VNODE__ || (globalThis as any).__BAROCSS_DEBUG_VNODE__) {
    setCategoryEnabled(LogCategory.VNODE, true);
  }
}

enableCategoryFromEnvVar('BAROCSS_DEBUG_VNODE', LogCategory.VNODE);

