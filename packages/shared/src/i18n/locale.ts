/**
 * Locale 정규화
 * 
 * 브라우저 언어 코드를 간단한 locale 코드로 변환합니다.
 * 예: 'ko-KR' -> 'ko', 'en-US' -> 'en'
 * 
 * @param locale - 언어 코드 (예: 'ko-KR', 'en-US')
 * @returns 정규화된 locale 코드 (예: 'ko', 'en')
 * 
 * @example
 * ```typescript
 * normalizeLocale('ko-KR'); // 'ko'
 * normalizeLocale('en-US'); // 'en'
 * normalizeLocale('zh-CN'); // 'zh'
 * normalizeLocale('ja'); // 'ja'
 * ```
 */
export function normalizeLocale(locale: string): string {
  // 'ko-KR' -> 'ko', 'en-US' -> 'en'
  const parts = locale.split('-');
  return parts[0]?.toLowerCase() || 'en';
}

