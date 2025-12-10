# i18n Implementation Plan

## 1. Structure Design

### 1.1 Package Separation

#### `@barocss/shared` (Common Utilities)
- `replacePlaceholders()` - Placeholder replacement function (generic)
- `normalizeLocale()` - Locale normalization function (e.g., 'ko-KR' -> 'ko')

#### `@barocss/editor-core` (i18n Implementation)
- `src/i18n/messages.en.ts` - English message definitions
- `src/i18n/messages.ko.ts` - Korean message definitions
- `src/i18n/index.ts` - Main implementation (message store, API functions)

### 1.2 File Structure

```
packages/
  shared/
    src/
      i18n/
        placeholder.ts          # replacePlaceholders function
        locale.ts               # normalizeLocale function
        index.ts                # export
      index.ts                  # Add to shared export
  
  editor-core/
    src/
      i18n/
        messages.en.ts          # English messages
        messages.ko.ts          # Korean messages
        index.ts               # Main implementation
      index.ts                  # Add to editor-core export
```

## 2. Implementation Steps

### 2.1 Step 1: Add Common Functions to Shared Package

**File**: `packages/shared/src/i18n/placeholder.ts`
```typescript
/**
 * Placeholder replacement
 * 
 * Replaces {key} patterns in message strings with values from params.
 * 
 * @param message - Original message
 * @param params - Parameters to replace
 * @returns Replaced message
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
```

**File**: `packages/shared/src/i18n/locale.ts`
```typescript
/**
 * Locale normalization
 * 
 * Converts browser language code to simple locale code.
 * Example: 'ko-KR' -> 'ko', 'en-US' -> 'en'
 * 
 * @param locale - Language code (e.g., 'ko-KR', 'en-US')
 * @returns Normalized locale code (e.g., 'ko', 'en')
 */
export function normalizeLocale(locale: string): string {
  // 'ko-KR' -> 'ko', 'en-US' -> 'en'
  const parts = locale.split('-');
  return parts[0]?.toLowerCase() || 'en';
}
```

**File**: `packages/shared/src/i18n/index.ts`
```typescript
export { replacePlaceholders } from './placeholder';
export { normalizeLocale } from './locale';
```

**File**: `packages/shared/src/index.ts` (modify)
```typescript
export { IS_MAC, IS_LINUX, IS_WINDOWS } from './platform';
export { getKeyString } from './key-string';
export { normalizeKeyString, expandModKey } from './key-binding';
export { replacePlaceholders, normalizeLocale } from './i18n';
```

### 2.2 Step 2: Create Basic Message Files in Editor-Core

**File**: `packages/editor-core/src/i18n/messages.en.ts`
```typescript
/**
 * English message definitions
 */
export const messagesEn: Record<string, string> = {
  // Context descriptions
  'context.editorFocus.description': 'Whether the editor has focus',
  'context.editorEditable.description': 'Whether the editor is editable',
  'context.selectionEmpty.description': 'Whether the selection is empty (collapsed)',
  'context.selectionType.description': 'Selection type (range, node, multi-node, cell, table, null)',
  'context.selectionDirection.description': 'Selection direction (forward, backward, null)',
  'context.historyCanUndo.description': 'Whether undo is available',
  'context.historyCanRedo.description': 'Whether redo is available',
};
```

**File**: `packages/editor-core/src/i18n/messages.ko.ts`
```typescript
/**
 * Korean message definitions
 */
export const messagesKo: Record<string, string> = {
  // Context descriptions
  'context.editorFocus.description': '에디터가 포커스를 가지고 있는지 여부',
  'context.editorEditable.description': '에디터가 편집 가능한 상태인지 여부',
  'context.selectionEmpty.description': '선택이 비어있는지 여부 (collapsed)',
  'context.selectionType.description': '선택 타입 (range, node, multi-node, cell, table, null)',
  'context.selectionDirection.description': '선택 방향 (forward, backward, null)',
  'context.historyCanUndo.description': 'Undo가 가능한지 여부',
  'context.historyCanRedo.description': 'Redo가 가능한지 여부',
};
```

### 2.3 Step 3: Main Implementation in Editor-Core

**File**: `packages/editor-core/src/i18n/index.ts`
```typescript
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
 * Register language pack (called from external)
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
 * Get message (supports placeholder replacement)
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
  
  // 4. If message not found, return ID
  return id;
}

/**
 * Set global locale
 */
export function setDefaultLocale(locale: string): void {
  defaultLocale = locale;
}

/**
 * Get global locale
 */
export function getDefaultLocale(): string {
  return defaultLocale;
}

/**
 * Check if messages for specific locale are registered
 */
export function hasLocaleMessages(locale: string): boolean {
  return (
    builtinMessages[locale] !== undefined ||
    externalMessages[locale] !== undefined
  );
}

/**
 * Load and register language pack asynchronously
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
 */
export function initializeI18n(options?: { autoDetect?: boolean }): void {
  if (options?.autoDetect !== false) {
    defaultLocale = detectBrowserLocale();
  }
}
```

### 2.4 Step 4: Add Exports

**File**: `packages/editor-core/src/index.ts` (modify)
```typescript
export * from './types';
export { Editor, CommandChain } from './editor';
export { CommandManager, InsertTextCommand, InsertNodeCommand, DeleteNodeCommand, SetSelectionCommand } from './commands';
export { PluginManager, AutoSavePlugin } from './plugins';
export * from './keybinding';
export { evaluateWhenExpression } from './when-expression';
export * from './context/default-context';
export { SelectionManager } from './selection-manager';
export { HistoryManager } from './history-manager';
// i18n exports
export {
  getLocalizedMessage,
  registerLocaleMessages,
  setDefaultLocale,
  getDefaultLocale,
  hasLocaleMessages,
  loadLocaleMessages,
  initializeI18n,
} from './i18n';
```

### 2.5 Step 5: Write Test Code

**File**: `packages/shared/src/i18n/placeholder.test.ts`
- Test `replacePlaceholders` function

**File**: `packages/shared/src/i18n/locale.test.ts`
- Test `normalizeLocale` function

**File**: `packages/editor-core/test/i18n.test.ts`
- Test `getLocalizedMessage`
- Test `registerLocaleMessages`
- Test `setDefaultLocale` / `getDefaultLocale`
- Test `hasLocaleMessages`
- Test `loadLocaleMessages` (mock fetch)
- Test fallback behavior
- Test placeholder replacement

## 3. Implementation Order

1. ✅ Add common functions to Shared package
   - `replacePlaceholders`
   - `normalizeLocale`
   - Test code

2. ✅ Create basic message files in Editor-Core
   - `messages.en.ts`
   - `messages.ko.ts`

3. ✅ Main implementation in Editor-Core
   - `i18n/index.ts`

4. ✅ Add exports
   - `shared/src/index.ts`
   - `editor-core/src/index.ts`

5. ✅ Write test code
   - Shared tests
   - Editor-Core tests

## 4. Notes

- `loadLocaleMessages` uses `fetch` API, so only works in browser environment
- May need polyfill like `node-fetch` in Node.js environment
- Must mock `fetch` in tests
- Good to call `initializeI18n` before creating Editor
