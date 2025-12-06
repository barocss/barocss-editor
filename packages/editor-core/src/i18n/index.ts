import { messagesEn } from './messages.en';
import { messagesKo } from './messages.ko';
import { replacePlaceholders, normalizeLocale } from '@barocss/shared';

// Built-in languages (provided by default)
const builtinMessages: Record<string, Record<string, string>> = {
  en: messagesEn,
  ko: messagesKo,
};

// Externally registered language packs
const externalMessages: Record<string, Record<string, string>> = {};

// Global locale setting
let defaultLocale: string = 'en';

/**
 * Register language pack (called externally)
 * 
 * Multiple Extensions or host applications can register messages for the same locale.
 * Messages are merged with existing ones, so each Extension only needs to register its own messages.
 * 
 * @param locale - Language code (e.g., 'ja', 'zh-CN')
 * @param messages - Message object to register
 */
export function registerLocaleMessages(
  locale: string,
  messages: Record<string, string>
): void {
  if (!externalMessages[locale]) {
    externalMessages[locale] = {};
  }
  
  // Merge with existing messages
  Object.assign(externalMessages[locale], messages);
}

/**
 * Get message (with placeholder replacement support)
 * 
 * @param id - Message ID
 * @param params - Parameters for placeholder replacement (optional)
 * @param locale - Language code (optional, defaults to global locale or 'en')
 * @returns Translated message (with placeholders replaced)
 */
export function getLocalizedMessage(
  id: string,
  params?: Record<string, string | number>,
  locale?: string
): string {
  const effectiveLocale = locale || getDefaultLocale();
  let message: string | undefined;
  
  // 1. Check externally registered language pack
  if (externalMessages[effectiveLocale]) {
    message = externalMessages[effectiveLocale][id];
    if (message) {
      return replacePlaceholders(message, params);
    }
  }
  
  // 2. Check built-in language pack
  const builtin = builtinMessages[effectiveLocale];
  if (builtin) {
    message = builtin[id];
    if (message) {
      return replacePlaceholders(message, params);
    }
  }
  
  // 3. Fallback to English
  message = builtinMessages.en[id];
  if (message) {
    return replacePlaceholders(message, params);
  }
  
  // 4. Return ID if message not found
  return id;
}

/**
 * Set global locale
 * 
 * @param locale - Language code
 */
export function setDefaultLocale(locale: string): void {
  defaultLocale = locale;
}

/**
 * Get global locale
 * 
 * @returns Currently set locale
 */
export function getDefaultLocale(): string {
  return defaultLocale;
}

/**
 * Check if messages for a specific locale are registered
 * 
 * @param locale - Language code
 * @returns boolean
 */
export function hasLocaleMessages(locale: string): boolean {
  return (
    builtinMessages[locale] !== undefined ||
    externalMessages[locale] !== undefined
  );
}

/**
 * Auto-detect browser language
 */
function detectBrowserLocale(): string {
  if (typeof navigator !== 'undefined') {
    const browserLang = navigator.language || navigator.languages?.[0];
    return normalizeLocale(browserLang);
  }
  return 'en';
}

/**
 * Initialize i18n (auto-detect browser language)
 * 
 * @param options - Initialization options
 * @param options.autoDetect - Whether to auto-detect browser language (default: true)
 */
export function initializeI18n(options?: { autoDetect?: boolean }): void {
  if (options?.autoDetect !== false) {
    defaultLocale = detectBrowserLocale();
  }
}

/**
 * Load and register language pack asynchronously
 * 
 * @param locale - Language code
 * @param url - Language pack JSON file URL
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

