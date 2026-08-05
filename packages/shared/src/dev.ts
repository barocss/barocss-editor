/**
 * Development mode utilities
 * 
 * Similar to React's __DEV__ flag pattern, but with runtime flexibility
 */

/**
 * Development mode flag
 * 
 * - In development: true (default)
 * - In production: false (should be replaced by build tools)
 * - Can be overridden at runtime via globalThis.__DEV__
 * 
 * Usage:
 *   if (__DEV__) {
 *     console.warn('Development warning');
 *   }
 */
export const __DEV__: boolean = 
  typeof globalThis !== 'undefined' && (globalThis as any).__DEV__ !== undefined
    ? (globalThis as any).__DEV__
    : process.env.NODE_ENV !== 'production';

/**
 * Test mode flag
 * 
 * True when running in test environment
 */
export const __TEST__: boolean = 
  process.env.NODE_ENV === 'test' || 
  (typeof globalThis !== 'undefined' && (globalThis as any).vitest !== undefined);

