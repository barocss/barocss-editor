import { defineDropBehavior as _defineDropBehavior } from './drop-behavior-registry';

/**
 * Register default drop behavior rules.
 * This function is called during DataStore initialization.
 * 
 * Default rules:
 * - Text node → Text node: merge
 * - Same type block: move
 * - Default: move (internal drag)
 */
export function registerDefaultDropBehaviors(): void {
  // Default rules are handled in UtilityOperations._getDefaultDropBehavior
}

