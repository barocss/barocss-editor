import en from './locales/en.json' with { type: 'json' };
import ko from './locales/ko.json' with { type: 'json' };

/** JSON files are the single source of language content and message keys. */
export const messagesEn = en;
export type MessageKey = keyof typeof messagesEn;
export const messagesKo = ko satisfies Record<MessageKey, string>;

/** JSON values widen to string, so placeholder contracts are declared explicitly. */
export const messageParameters = {
  'workspace.tree.openOriginal': ['title'],
  'workspace.tree.openProject': ['title'],
  'site.inspector.selectionCount': ['count'],
  'document.library.draftLabel': ['title'],
  'document.library.openLabel': ['title'],
  'document.library.trashed': ['title'],
  'document.library.openFailed': ['title'],
} as const satisfies Partial<Record<MessageKey, readonly string[]>>;
export type MessageArguments<Key extends MessageKey> = Key extends keyof typeof messageParameters
  ? [params: { [Name in (typeof messageParameters)[Key][number]]: string | number }] : [];
