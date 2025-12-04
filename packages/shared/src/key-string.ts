import { IS_MAC } from './platform';

/**
 * 키 이름 정규화
 * 
 * 브라우저의 키 이름을 일관된 형식으로 변환합니다.
 * - 특수 키는 대문자로 유지 (Enter, Escape 등)
 * - 알파벳 키는 소문자로 정규화 (대소문자 구분하지 않음)
 */
function normalizeKeyName(key: string): string {
  // 특수 키 매핑
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
  
  // 알파벳 키는 소문자로 정규화 (대소문자 구분하지 않음)
  // 예: 'B' → 'b', 'b' → 'b'
  if (key.length === 1 && /[A-Za-z]/.test(key)) {
    return key.toLowerCase();
  }
  
  // 나머지는 그대로 반환 (Enter, Escape, F1 등)
  return key;
}

/**
 * KeyboardEvent를 정규화된 키 문자열로 변환
 * 
 * 표준: `event.key`를 사용합니다 (VS Code, ProseMirror, Slate 등과 동일).
 * - `event.key`: 문자열 ('Enter', 'a', 'A' 등) - 권장, 표준
 * - `event.keyCode`: 숫자 (deprecated, 사용하지 않음)
 * - `event.code`: 물리적 키 위치 (일반적으로 사용하지 않음)
 * 
 * @param event - KeyboardEvent 객체
 * @returns 정규화된 키 문자열 (예: 'Ctrl+b', 'Cmd+i', 'Enter', 'Shift+Enter')
 * 
 * @example
 * ```ts
 * document.addEventListener('keydown', (event) => {
 *   const key = getKeyString(event);
 *   // Mac에서 Cmd+b → 'Cmd+b'
 *   // Windows에서 Ctrl+b → 'Ctrl+b'
 *   // Enter → 'Enter'
 *   // Shift+Enter → 'Shift+Enter'
 * });
 * ```
 */
export function getKeyString(event: KeyboardEvent): string {
  const parts: string[] = [];
  
  // 플랫폼별 Cmd/Ctrl 처리
  if (IS_MAC) {
    if (event.metaKey) parts.push('Cmd');
    if (event.ctrlKey) parts.push('Ctrl');
  } else {
    if (event.ctrlKey) parts.push('Ctrl');
    if (event.metaKey) parts.push('Meta');
  }
  
  if (event.altKey) parts.push('Alt');
  if (event.shiftKey) parts.push('Shift');
  
  // event.key 사용 (표준, 모든 모던 브라우저에서 지원)
  // event.keyCode는 deprecated되었으므로 사용하지 않음
  let keyName = event.key;
  
  // event.key가 없는 경우 (매우 드문 경우, 구형 브라우저)
  // event.code를 fallback으로 사용 (물리적 키 위치)
  if (!keyName || keyName === 'Unidentified') {
    // event.code는 물리적 키 위치를 나타내므로, 이를 키 이름으로 변환
    // 예: 'KeyA' → 'a', 'Enter' → 'Enter'
    if (event.code) {
      keyName = normalizeCodeToKey(event.code);
    } else {
      // 최후의 수단: 빈 문자열 반환 (매칭되지 않음)
      return '';
    }
  }
  
  // 키 이름 정규화
  const normalizedKeyName = normalizeKeyName(keyName);
  parts.push(normalizedKeyName);
  
  return parts.join('+');
}

/**
 * event.code를 event.key 형식으로 변환 (fallback용)
 * 
 * event.code는 물리적 키 위치를 나타내므로, 이를 논리적 키 이름으로 변환합니다.
 * 예: 'KeyA' → 'a', 'Digit1' → '1', 'Enter' → 'Enter'
 */
function normalizeCodeToKey(code: string): string {
  // 'Key' 접두사 제거 (예: 'KeyA' → 'A' → 'a')
  if (code.startsWith('Key')) {
    return code.substring(3).toLowerCase();
  }
  
  // 'Digit' 접두사 제거 (예: 'Digit1' → '1')
  if (code.startsWith('Digit')) {
    return code.substring(5);
  }
  
  // 'Numpad' 접두사 처리 (예: 'NumpadEnter' → 'Enter')
  if (code.startsWith('Numpad')) {
    const numpadKey = code.substring(6);
    // Numpad 키는 일반 키와 동일하게 처리
    return numpadKey;
  }
  
  // 나머지는 그대로 반환 (Enter, Escape, ArrowUp 등)
  return code;
}

