import { messagesEn } from './messages.en';
import { messagesKo } from './messages.ko';
import { replacePlaceholders, normalizeLocale } from '@barocss/shared';

// 내장 언어 (기본 제공)
const builtinMessages: Record<string, Record<string, string>> = {
  en: messagesEn,
  ko: messagesKo,
};

// 외부에서 등록된 언어 팩
const externalMessages: Record<string, Record<string, string>> = {};

// 전역 locale 설정
let defaultLocale: string = 'en';

/**
 * 언어 팩 등록 (외부에서 호출)
 * 
 * 여러 Extension이나 호스트 애플리케이션에서 같은 locale에 메시지를 등록할 수 있습니다.
 * 기존 메시지와 병합되므로, 각 Extension은 자신의 메시지만 등록하면 됩니다.
 * 
 * @param locale - 언어 코드 (예: 'ja', 'zh-CN')
 * @param messages - 등록할 메시지 객체
 */
export function registerLocaleMessages(
  locale: string,
  messages: Record<string, string>
): void {
  if (!externalMessages[locale]) {
    externalMessages[locale] = {};
  }
  
  // 기존 메시지와 병합
  Object.assign(externalMessages[locale], messages);
}

/**
 * 메시지 조회 (플레이스홀더 치환 지원)
 * 
 * @param id - 메시지 ID
 * @param params - 플레이스홀더 치환용 파라미터 (선택)
 * @param locale - 언어 코드 (선택, 기본값은 전역 locale 또는 'en')
 * @returns 번역된 메시지 (플레이스홀더 치환됨)
 */
export function getLocalizedMessage(
  id: string,
  params?: Record<string, string | number>,
  locale?: string
): string {
  const effectiveLocale = locale || getDefaultLocale();
  let message: string | undefined;
  
  // 1. 외부 등록된 언어 팩 확인
  if (externalMessages[effectiveLocale]) {
    message = externalMessages[effectiveLocale][id];
    if (message) {
      return replacePlaceholders(message, params);
    }
  }
  
  // 2. 내장 언어 팩 확인
  const builtin = builtinMessages[effectiveLocale];
  if (builtin) {
    message = builtin[id];
    if (message) {
      return replacePlaceholders(message, params);
    }
  }
  
  // 3. 영어로 fallback
  message = builtinMessages.en[id];
  if (message) {
    return replacePlaceholders(message, params);
  }
  
  // 4. 메시지를 찾을 수 없으면 ID 반환
  return id;
}

/**
 * 전역 locale 설정
 * 
 * @param locale - 언어 코드
 */
export function setDefaultLocale(locale: string): void {
  defaultLocale = locale;
}

/**
 * 전역 locale 조회
 * 
 * @returns 현재 설정된 locale
 */
export function getDefaultLocale(): string {
  return defaultLocale;
}

/**
 * 특정 locale의 메시지가 등록되어 있는지 확인
 * 
 * @param locale - 언어 코드
 * @returns boolean
 */
export function hasLocaleMessages(locale: string): boolean {
  return (
    builtinMessages[locale] !== undefined ||
    externalMessages[locale] !== undefined
  );
}

/**
 * 브라우저 언어 자동 감지
 */
function detectBrowserLocale(): string {
  if (typeof navigator !== 'undefined') {
    const browserLang = navigator.language || navigator.languages?.[0];
    return normalizeLocale(browserLang);
  }
  return 'en';
}

/**
 * i18n 초기화 (브라우저 언어 자동 감지)
 * 
 * @param options - 초기화 옵션
 * @param options.autoDetect - 브라우저 언어 자동 감지 여부 (기본값: true)
 */
export function initializeI18n(options?: { autoDetect?: boolean }): void {
  if (options?.autoDetect !== false) {
    defaultLocale = detectBrowserLocale();
  }
}

/**
 * 언어 팩을 async로 로드하고 등록
 * 
 * @param locale - 언어 코드
 * @param url - 언어 팩 JSON 파일 URL
 * @returns Promise<void>
 * 
 * @example
 * ```typescript
 * await loadLocaleMessages('ja', '/i18n/messages.ja.json');
 * const editor = new Editor({ locale: 'ja' });
 * ```
 */
export async function loadLocaleMessages(
  locale: string,
  url: string
): Promise<void> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(
      `Failed to load language pack for ${locale}: ${response.statusText}`
    );
  }
  const messages = await response.json();
  registerLocaleMessages(locale, messages);
}

