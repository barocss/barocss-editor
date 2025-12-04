/**
 * 플레이스홀더 치환
 * 
 * 메시지 문자열의 {key} 형태를 params의 값으로 치환합니다.
 * 
 * @param message - 원본 메시지
 * @param params - 치환할 파라미터
 * @returns 치환된 메시지
 * 
 * @example
 * ```typescript
 * replacePlaceholders('Hello, {name}!', { name: 'World' });
 * // "Hello, World!"
 * 
 * replacePlaceholders('Count: {count}', { count: 42 });
 * // "Count: 42"
 * ```
 */
export function replacePlaceholders(
  message: string,
  params?: Record<string, string | number>
): string {
  if (!params) {
    return message;
  }
  
  return message.replace(/\{(\w+)\}/g, (match, key) => {
    const value = params[key];
    return value !== undefined ? String(value) : match;
  });
}

