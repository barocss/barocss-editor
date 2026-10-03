import en from './locales/en.json';
import ko from './locales/ko.json';

/** JSON files are the single source of language content and message keys. */
export const messagesEn = en;
export type MessageKey = keyof typeof messagesEn;
export const messagesKo = ko satisfies Record<MessageKey, string>;

/** JSON values widen to string, so placeholder contracts are declared explicitly. */
export const messageParameters = {
  'document.library.draftLabel': ['title'],
  'document.library.openLabel': ['title'],
  'document.library.trashed': ['title'],
  'document.library.openFailed': ['title'],
} as const satisfies Partial<Record<MessageKey, readonly string[]>>;
export type MessageArguments<Key extends MessageKey> = Key extends keyof typeof messageParameters
  ? [params: { [Name in (typeof messageParameters)[Key][number]]: string | number }] : [];
