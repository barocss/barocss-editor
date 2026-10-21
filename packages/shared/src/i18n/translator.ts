import { messagesEn, messagesKo, type MessageKey, type MessageArguments } from './catalogs';
import { normalizeLocale } from './locale';
import { replacePlaceholders } from './placeholder';

export type MessageLocale = 'en' | 'ko';
export type Translator = <Key extends MessageKey>(key: Key, ...args: MessageArguments<Key>) => string;

/** Hosts select their locale. There is no process-wide or editor-wide mutation. */
export function messageLocale(locale: string): MessageLocale {
  return normalizeLocale(locale) === 'ko' ? 'ko' : 'en';
}

export function translateMessage<Key extends MessageKey>(key: Key, locale = 'en', ...args: MessageArguments<Key>): string {
  const catalog = messageLocale(locale) === 'ko' ? messagesKo : messagesEn;
  return replacePlaceholders(catalog[key], args[0] as Record<string, string | number> | undefined);
}

export function createTranslator(locale = 'en'): Translator {
  return <Key extends MessageKey>(key: Key, ...args: MessageArguments<Key>) => translateMessage(key, locale, ...args);
}
