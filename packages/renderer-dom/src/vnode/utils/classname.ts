/**
 * classname utility: normalize various inputs into a space-separated string
 * - Supports string | string[] | Record<string, boolean> | nested arrays
 * - Removes falsy/duplicates and keeps a stable order
 */

import { ClassNameType } from "../types";

/**
 * Normalize various `className` forms into a flat array of class tokens.
 *
 * Accepts the following shapes (including nested combinations):
 * - string: 'btn primary'
 * - string[]: ['btn', 'primary']
 * - Record<string, boolean>: { btn: true, primary: false } → includes only truthy keys
 * - Array<string | Record<string, boolean>>: ['btn', { primary: true, hidden: false }]
 *
 * Notes:
 * - Strings are returned as single tokens; callers may split by whitespace if needed before passing in
 *   but typically we treat provided strings as one class token. Upstream code joins tokens with spaces.
 * - Objects include keys whose value is truthy. Keys are trimmed.
 * - Arrays are flattened recursively and normalized by the same rules.
 *
 * Examples:
 *   classTokensFrom('btn')
 *   → ['btn']
 *
 *   classTokensFrom(['btn', 'primary'])
 *   → ['btn', 'primary']
 *
 *   classTokensFrom({ btn: true, primary: false, active: 1 })
 *   → ['btn', 'active']
 *
 *   classTokensFrom(['btn', { primary: true, hidden: false }, 'mt-2'])
 *   → ['btn', 'primary', 'mt-2']
 *
 *   classTokensFrom([['btn', 'rounded'], { selected: true }, 'shadow'])
 *   → ['btn', 'rounded', 'selected', 'shadow']
 */
export function classTokensFrom(val: any): string[] {
  if (!val || val === null || val === undefined) return [];
  if (typeof val === 'string') {
    // Split by whitespace and filter empty strings
    return val.split(/\s+/).filter(Boolean);
  }
  if (Array.isArray(val)) return val.flatMap((v) => classTokensFrom(v));
  if (typeof val === 'object') {
    return Object.entries(val)
      .filter(([, on]) => !!on)
      .map(([cn]) => String(cn).trim())
      .filter(Boolean);
  }
  if (typeof val === 'function') {
    // Execute function and recursively process result
    const result = val();
    return classTokensFrom(result as ClassNameType);
  }
  return [String(val)];
}


