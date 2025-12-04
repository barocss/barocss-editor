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
    
    // Modifier 키 처리 (첫 글자만 대문자)
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
      // 키 이름은 소문자로 정규화 (대소문자 구분하지 않음)
      // 단, 특수 키는 그대로 유지 (Enter, Escape 등)
      if (part.length === 1 && /[A-Za-z]/.test(part)) {
        normalized.push(part.toLowerCase());
      } else {
        // 특수 키는 그대로 유지 (Enter, Escape, F1 등)
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
  const variants: string[] = [key]; // 원본 키도 포함
  
  // Mod 키 확장
  if (key.startsWith('Mod+')) {
    // Mod+b → Ctrl+b, Cmd+b도 추가
    const rest = key.substring(4); // 'Mod+' 제거
    variants.push(`Ctrl+${rest}`);
    variants.push(`Cmd+${rest}`);
  } else if (key.startsWith('Ctrl+')) {
    // Ctrl+b → Mod+b도 추가
    const rest = key.substring(5); // 'Ctrl+' 제거
    variants.push(`Mod+${rest}`);
  } else if (key.startsWith('Cmd+')) {
    // Cmd+b → Mod+b도 추가
    const rest = key.substring(4); // 'Cmd+' 제거
    variants.push(`Mod+${rest}`);
  }
  
  return variants;
}

