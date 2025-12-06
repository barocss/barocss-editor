import { IS_MAC } from './platform';

/**
 * Normalize key name
 * 
 * Convert browser key names to consistent format.
 * - Special keys remain uppercase (Enter, Escape, etc.)
 * - Alphabet keys are normalized to lowercase (case-insensitive)
 */
function normalizeKeyName(key: string): string {
  // Special key mapping
  const keyMap: Record<string, string> = {
    ' ': 'Space',
    'ArrowUp': 'Up',
    'ArrowDown': 'Down',
    'ArrowLeft': 'Left',
    'ArrowRight': 'Right'
  };
  
  if (keyMap[key]) {
    return keyMap[key];
  }
  
  // Normalize alphabet keys to lowercase (case-insensitive)
  // Example: 'B' → 'b', 'b' → 'b'
  if (key.length === 1 && /[A-Za-z]/.test(key)) {
    return key.toLowerCase();
  }
  
  // Return the rest as is (Enter, Escape, F1, etc.)
  return key;
}

/**
 * Convert KeyboardEvent to normalized key string
 * 
 * Standard: Uses `event.key` (same as VS Code, ProseMirror, Slate, etc.).
 * - `event.key`: string ('Enter', 'a', 'A', etc.) - recommended, standard
 * - `event.keyCode`: number (deprecated, not used)
 * - `event.code`: physical key position (generally not used)
 * 
 * @param event - KeyboardEvent object
 * @returns Normalized key string (e.g., 'Ctrl+b', 'Cmd+i', 'Enter', 'Shift+Enter')
 * 
 * @example
 * ```ts
 * document.addEventListener('keydown', (event) => {
 *   const key = getKeyString(event);
 *   // On Mac: Cmd+b → 'Cmd+b'
 *   // On Windows: Ctrl+b → 'Ctrl+b'
 *   // Enter → 'Enter'
 *   // Shift+Enter → 'Shift+Enter'
 * });
 * ```
 */
export function getKeyString(event: KeyboardEvent): string {
  const parts: string[] = [];
  
  // Handle Cmd/Ctrl by platform
  if (IS_MAC) {
    if (event.metaKey) parts.push('Cmd');
    if (event.ctrlKey) parts.push('Ctrl');
  } else {
    if (event.ctrlKey) parts.push('Ctrl');
    if (event.metaKey) parts.push('Meta');
  }
  
  if (event.altKey) parts.push('Alt');
  if (event.shiftKey) parts.push('Shift');
  
  // Use event.key (standard, supported by all modern browsers)
  // event.keyCode is deprecated, so not used
  let keyName = event.key;
  
  // If event.key is not available (very rare case, old browsers)
  // Use event.code as fallback (physical key position)
  if (!keyName || keyName === 'Unidentified') {
    // event.code represents physical key position, convert to key name
    // Example: 'KeyA' → 'a', 'Enter' → 'Enter'
    if (event.code) {
      keyName = normalizeCodeToKey(event.code);
    } else {
      // Last resort: return empty string (no match)
      return '';
    }
  }
  
  // Normalize key name
  const normalizedKeyName = normalizeKeyName(keyName);
  parts.push(normalizedKeyName);
  
  return parts.join('+');
}

/**
 * Convert event.code to event.key format (for fallback)
 * 
 * event.code represents physical key position, convert it to logical key name.
 * Examples: 'KeyA' → 'a', 'Digit1' → '1', 'Enter' → 'Enter'
 */
function normalizeCodeToKey(code: string): string {
  // Remove 'Key' prefix (e.g., 'KeyA' → 'A' → 'a')
  if (code.startsWith('Key')) {
    return code.substring(3).toLowerCase();
  }
  
  // Remove 'Digit' prefix (e.g., 'Digit1' → '1')
  if (code.startsWith('Digit')) {
    return code.substring(5);
  }
  
  // Handle 'Numpad' prefix (e.g., 'NumpadEnter' → 'Enter')
  if (code.startsWith('Numpad')) {
    const numpadKey = code.substring(6);
    // Numpad keys are treated the same as regular keys
    return numpadKey;
  }
  
  // Return the rest as is (Enter, Escape, ArrowUp, etc.)
  return code;
}

