/**
 * 키 바인딩 관련 유틸리티 함수
 */

/**
 * 키 문자열 정규화 (대소문자 무시)
 * 
 * - Modifier는 첫 글자만 대문자로 유지
 * - 키 이름은 소문자로 정규화
 * 
 * @param key - 정규화할 키 문자열 (예: 'Ctrl+B', 'CMD+SHIFT+Z')
 * @returns 정규화된 키 문자열 (예: 'Ctrl+b', 'Cmd+Shift+z')
 * 
 * @example
 * ```ts
 * normalizeKeyString('Ctrl+B') // 'Ctrl+b'
 * normalizeKeyString('CMD+SHIFT+Z') // 'Cmd+Shift+z'
 * normalizeKeyString('mod+b') // 'Mod+b'
 * ```
 */
export function normalizeKeyString(key: string): string {
  const parts = key.split('+');
  const normalized: string[] = [];
  
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i].trim();
    if (!part) continue;
    
    // Handle modifier keys (only first letter capitalized)
    const modifierMap: Record<string, string> = {
      'ctrl': 'Ctrl',
      'cmd': 'Cmd',
      'alt': 'Alt',
      'shift': 'Shift',
      'meta': 'Meta',
      'mod': 'Mod'
    };
    
    const lowerPart = part.toLowerCase();
    if (modifierMap[lowerPart]) {
      normalized.push(modifierMap[lowerPart]);
    } else {
      // Normalize key names to lowercase (case-insensitive)
      // Special keys are kept as is (Enter, Escape, etc.)
      if (part.length === 1 && /[A-Za-z]/.test(part)) {
        normalized.push(part.toLowerCase());
      } else {
        // Keep special keys as is (Enter, Escape, F1, etc.)
        normalized.push(part);
      }
    }
  }
  
  return normalized.join('+');
}

/**
 * Mod 키를 플랫폼별로 확장
 * 
 * - Mod+b → [Mod+b, Ctrl+b, Cmd+b] (모든 플랫폼에서 매칭 가능하도록)
 * - Ctrl+b → [Ctrl+b, Mod+b] (Mod+b keybinding도 매칭)
 * - Cmd+b → [Cmd+b, Mod+b] (Mod+b keybinding도 매칭)
 * 
 * @param key - 정규화된 키 문자열
 * @returns 확장된 키 문자열 배열
 * 
 * @example
 * ```ts
 * expandModKey('Mod+b') // ['Mod+b', 'Ctrl+b', 'Cmd+b']
 * expandModKey('Ctrl+b') // ['Ctrl+b', 'Mod+b']
 * expandModKey('Cmd+b') // ['Cmd+b', 'Mod+b']
 * ```
 */
export function expandModKey(key: string): string[] {
  const variants: string[] = [key]; // Include original key
  
  // Expand Mod key
  if (key.startsWith('Mod+')) {
    // Mod+b → also add Ctrl+b, Cmd+b
    const rest = key.substring(4); // Remove 'Mod+'
    variants.push(`Ctrl+${rest}`);
    variants.push(`Cmd+${rest}`);
  } else if (key.startsWith('Ctrl+')) {
    // Ctrl+b → also add Mod+b
    const rest = key.substring(5); // Remove 'Ctrl+'
    variants.push(`Mod+${rest}`);
  } else if (key.startsWith('Cmd+')) {
    // Cmd+b → also add Mod+b
    const rest = key.substring(4); // Remove 'Cmd+'
    variants.push(`Mod+${rest}`);
  }
  
  return variants;
}

