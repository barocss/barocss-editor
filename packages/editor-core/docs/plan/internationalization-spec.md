# Internationalization (i18n) Specification

## 1. Overview

Barocss Editor is designed with reference to VS Code's localization system for multilingual support. It can provide user interface text, error messages, help text, etc. in various languages.

## 2. VS Code's Multilingual Support Approach

### 2.1 Language Packs

VS Code officially provides various language packs:
- Provided as separate extension programs for each language
- Users install desired language packs to change UI language
- Managed by community through GitHub's [vscode-loc repository](https://github.com/microsoft/vscode-loc)

### 2.2 Localization File Structure

VS Code uses the following structure:

```
extension/
  package.json          # Default language definition
  package.nls.json      # English (default)
  package.nls.ko.json   # Korean
  package.nls.ja.json   # Japanese
  ...
```

### 2.3 Translation Key System

VS Code manages translations using message IDs:

```json
// package.nls.json (English)
{
  "extension.description": "My Extension Description",
  "command.title": "Execute Command"
}

// package.nls.ko.json (Korean)
{
  "extension.description": "내 확장 프로그램 설명",
  "command.title": "명령 실행"
}
```

### 2.4 Usage

```typescript
import * as nls from 'vscode-nls';

const localize = nls.loadMessageBundle();
const message = localize('extension.description', 'Default Description');
```

## 3. Barocss Editor's Multilingual Support Proposal

### 3.1 Structure Proposal

Reference VS Code approach but start with simpler structure:

```
packages/editor-core/
  src/
    i18n/
      messages.json          # English (default, message ID definitions)
      messages.ko.json       # Korean
      messages.ja.json       # Japanese
      messages.zh-CN.json    # Chinese (Simplified)
      ...
    context/
      default-context.ts     # Default context definitions
```

### 3.2 Message ID Naming Rules

Use hierarchical naming for grouping:

```
{category}.{subcategory}.{key}

Examples:
- context.editorFocus.description
- context.editorEditable.description
- error.invalidSelection.message
- command.toggleBold.label
```

### 3.3 Implementation Approach

#### Option 1: JSON-based Localization (VS Code Style)

**Advantages**:
- Familiar pattern, same as VS Code
- Can use same approach in extensions
- Easy translation work with JSON files

**Disadvantages**:
- Need to load JSON files at runtime
- Possible bundle size increase

```typescript
// packages/editor-core/src/i18n/messages.json
{
  "context.editorFocus.description": "Whether the editor has focus",
  "context.editorEditable.description": "Whether the editor is editable",
  "context.selectionEmpty.description": "Whether the selection is empty (collapsed)"
}

// packages/editor-core/src/i18n/messages.ko.json
{
  "context.editorFocus.description": "에디터가 포커스를 가지고 있는지 여부",
  "context.editorEditable.description": "에디터가 편집 가능한 상태인지 여부",
  "context.selectionEmpty.description": "선택이 비어있는지 여부 (collapsed)"
}
```

#### Option 2: TypeScript Object-based (Simple Approach)

**Advantages**:
- Type safety
- Bundle optimization possible
- No runtime overhead

**Disadvantages**:
- Must include all languages in bundle
- Difficult to change languages dynamically

```typescript
// packages/editor-core/src/i18n/messages.ts
export const messages = {
  en: {
    'context.editorFocus.description': 'Whether the editor has focus',
    'context.editorEditable.description': 'Whether the editor is editable'
  },
  ko: {
    'context.editorFocus.description': '에디터가 포커스를 가지고 있는지 여부',
    'context.editorEditable.description': '에디터가 편집 가능한 상태인지 여부'
  }
};
```

#### Option 3: Hybrid Approach (Recommended)

**Structure**:
- Basic languages (en, ko) embedded as TypeScript files
- Other languages can be registered externally
- Extensions or host applications can provide language packs

**Advantages**:
- Basic languages included in bundle, immediately usable
- Type safety (for basic languages)
- Can extend language packs externally
- No need for dynamic `require()` or `import()` calls
- Bundle size optimization (only include needed languages)

**Disadvantages**:
- External language packs need to be registered at runtime

**Important: Language Pack Loading Timing**
- Language packs must be **registered before Editor creation**
- All messages must be ready before Editor renders to prevent flicker (FOUC)
- If async loading is needed, create Editor after `await loadLanguagePack()`

```typescript
// packages/editor-core/src/i18n/messages.en.ts
export const messagesEn = {
  'context.editorFocus.description': 'Whether the editor has focus',
  'context.editorEditable.description': 'Whether the editor is editable'
};

// packages/editor-core/src/i18n/messages.ko.ts
export const messagesKo = {
  'context.editorFocus.description': '에디터가 포커스를 가지고 있는지 여부',
  'context.editorEditable.description': '에디터가 편집 가능한 상태인지 여부'
};

// packages/editor-core/src/i18n/index.ts
import { messagesEn } from './messages.en';
import { messagesKo } from './messages.ko';

// Built-in languages (provided by default)
const builtinMessages: Record<string, Record<string, string>> = {
  en: messagesEn,
  ko: messagesKo
};

// Externally registered language packs
const externalMessages: Record<string, Record<string, string>> = {};

/**
 * Register language pack (called from external)
 * 
 * Multiple Extensions or host applications can register messages for the same locale.
 * Messages are merged, so each Extension only needs to register its own messages.
 * 
 * **Terminology**:
 * - `locale`: Identifier representing language and region settings (e.g., 'en', 'ko', 'ja', 'zh-CN')
 * - `localize`: Action of translating/adjusting to match specific locale (verb)
 * 
 * @param locale - Language code (e.g., 'ja', 'zh-CN')
 * @param messages - Message object to register
 * 
 * @example
 * ```typescript
 * // Extension A
 * registerLocaleMessages('ja', {
 *   'command.toggleBold.label': '太字'
 * });
 * 
 * // Extension B (register additional messages for same locale)
 * registerLocaleMessages('ja', {
 *   'command.toggleItalic.label': '斜体'
 * });
 * 
 * // Result: Messages from both Extensions are registered
 * ```
 */
export function registerLocaleMessages(locale: string, messages: Record<string, string>): void {
  if (!externalMessages[locale]) {
    externalMessages[locale] = {};
  }
  
  // Merge with existing messages (prevent overwriting)
  Object.assign(externalMessages[locale], messages);
}

/**
 * Get message (supports placeholder replacement)
 * 
 * **Function name explanation**:
 * - `getLocalizedMessage`: Gets message that is already translated (localized) for specific locale
 * - Difference from `getLocaleMessage`: "localized" means already translated state
 * 
 * **Parameter order**:
 * - `id`: Message ID (required)
 * - `params`: Parameters for placeholder replacement (optional, frequently used)
 * - `locale`: Language code (optional, defaults to global locale setting)
 * 
 * @param id - Message ID
 * @param params - Parameters for placeholder replacement (optional)
 * @param locale - Language code (optional, defaults to global locale or 'en')
 * @returns Translated message (with placeholders replaced)
 * 
 * @example
 * ```typescript
 * // Basic usage (use global locale)
 * getLocalizedMessage('context.editorFocus.description');
 * // If current locale is 'ko': "에디터가 포커스를 가지고 있는지 여부"
 * 
 * // Specify specific locale
 * getLocalizedMessage('context.editorFocus.description', undefined, 'ko');
 * 
 * // Placeholder replacement (most common usage)
 * getLocalizedMessage('error.invalidSelection', { 
 *   start: 10, 
 *   end: 20 
 * });
 * // Message: "선택 범위가 유효하지 않습니다: {start} ~ {end}"
 * // Result: "선택 범위가 유효하지 않습니다: 10 ~ 20"
 * 
 * // Placeholder + specific locale
 * getLocalizedMessage('error.invalidSelection', { start: 10, end: 20 }, 'ko');
 * ```
 */
export function getLocalizedMessage(
  id: string,
  params?: Record<string, string | number>,
  locale?: string
): string {
  // Use global locale if locale not provided
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
 * Placeholder replacement
 * 
 * Replaces {key} patterns in message strings with values from params.
 * 
 * @param message - Original message
 * @param params - Parameters to replace
 * @returns Replaced message
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
function replacePlaceholders(
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

/**
 * Global locale setting
 */
let defaultLocale: string = 'en';

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
 * Check if messages for specific locale are registered
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
    throw new Error(`Failed to load language pack for ${locale}: ${response.statusText}`);
  }
  const messages = await response.json();
  registerLocaleMessages(locale, messages);
}
```

### 3.4 Usage Examples

#### Basic Usage (Built-in Languages)

```typescript
import { getLocalizedMessage } from '@barocss/editor-core/i18n';

// Set language when initializing Editor (built-in languages: en, ko)
const editor = new Editor({
  locale: 'ko', // or 'en'
  // ...
});

// Get message
const description = getLocalizedMessage('context.editorFocus.description', undefined, 'ko');
// Korean: "에디터가 포커스를 가지고 있는지 여부"
```

#### External Language Pack Registration

```typescript
import { registerLocaleMessages, getLocalizedMessage } from '@barocss/editor-core/i18n';

// Register language pack from external (e.g., Japanese)
registerLocaleMessages('ja', {
  'context.editorFocus.description': 'エディターがフォーカスを持っているかどうか',
  'context.editorEditable.description': 'エディターが編集可能な状態かどうか'
});

// Multiple Extensions can add messages to same locale
registerLocaleMessages('ja', {
  'command.toggleBold.label': '太字',
  'command.toggleItalic.label': '斜体'
});

// Use registered language when initializing Editor
const editor = new Editor({
  locale: 'ja',
  // ...
});

// Get message
const description = getLocalizedMessage('context.editorFocus.description', undefined, 'ja');
// Japanese: "エディターがフォーカスを持っているかどうか"
```

#### Placeholder Replacement

```typescript
// Messages with placeholders
registerLocaleMessages('ko', {
  'error.invalidSelection': '선택 범위가 유효하지 않습니다: {start} ~ {end}',
  'command.deleteNode': '{count}개의 노드를 삭제했습니다'
});

// Get with parameters
const errorMsg = getLocalizedMessage('error.invalidSelection', {
  start: 10,
  end: 20
});
// "선택 범위가 유효하지 않습니다: 10 ~ 20"

const deleteMsg = getLocalizedMessage('command.deleteNode', {
  count: 5
}, 'ko');
// "5개의 노드를 삭제했습니다"
```

#### Providing Language Pack from Extension

```typescript
// packages/extensions/src/japanese-language-pack.ts
import { registerLocaleMessages } from '@barocss/editor-core/i18n';

export function registerJapaneseMessages(): void {
  registerLocaleMessages('ja', {
    'context.editorFocus.description': 'エディターがフォーカスを持っているかどうか',
    'command.toggleBold.label': '太字',
    // ...
  });
}

// Register in Extension's onCreate
export class JapaneseLanguagePackExtension implements Extension {
  onCreate(editor: Editor): void {
    registerJapaneseMessages();
  }
}
```

#### Registering Messages from Multiple Extensions

```typescript
// Extension A
export class BoldExtension implements Extension {
  onCreate(editor: Editor): void {
    registerLocaleMessages('ja', {
      'command.toggleBold.label': '太字',
      'command.toggleBold.description': 'テキストを太字にする'
    });
  }
}

// Extension B (register additional messages for same locale)
export class ItalicExtension implements Extension {
  onCreate(editor: Editor): void {
    registerLocaleMessages('ja', {
      'command.toggleItalic.label': '斜体',
      'command.toggleItalic.description': 'テキストを斜体にする'
    });
  }
}

// Result: Messages from both Extensions are registered and available
```

### 3.5 Context Description Multilingual Support

```typescript
// packages/editor-core/src/context/default-context.ts
import { getLocalizedMessage } from '../i18n';

export function getContextDescription(key: keyof DefaultContext, locale?: string): string {
  const messageId = `context.${key}.description`;
  return getLocalizedMessage(messageId, undefined, locale) || DEFAULT_CONTEXT_DESCRIPTIONS[key];
}

// Usage example
const description = getContextDescription('editorFocus', 'ko');
```

## 4. Multilingual Support in Extensions

Extensions can also support multiple languages in the same way:

```
packages/extensions/
  src/
    bold/
      i18n/
        messages.json
        messages.ko.json
        ...
```

## 5. Locale Settings and Management

### 5.1 Default Locale Setting

Default locale is determined in the following order:

1. **Explicitly set in Editor options**: `new Editor({ locale: 'ko' })`
2. **Global locale setting**: `setDefaultLocale('ko')`
3. **Browser language auto-detection**: `navigator.language` (optional)
4. **Default**: `'en'`

```typescript
// packages/editor-core/src/i18n/index.ts

// Global locale default
let defaultLocale: string = 'en';

// Browser language auto-detection
function detectBrowserLocale(): string {
  if (typeof navigator !== 'undefined') {
    const browserLang = navigator.language || navigator.languages?.[0];
    return normalizeLocale(browserLang); // 'ko-KR' -> 'ko'
  }
  return 'en';
}

// Set to browser language on initialization (optional)
export function initializeI18n(options?: { autoDetect?: boolean }): void {
  if (options?.autoDetect !== false) {
    defaultLocale = detectBrowserLocale();
  }
}
```

### 5.2 Locale Setting and Retrieval

```typescript
import { setDefaultLocale, getDefaultLocale } from '@barocss/editor-core/i18n';

// Set global locale
setDefaultLocale('ko');

// Get global locale
const currentLocale = getDefaultLocale(); // 'ko'

// Set via Editor options (takes precedence over global setting)
const editor = new Editor({
  locale: 'ja', // This Editor instance only uses 'ja'
  // ...
});

// Change locale from Editor instance
editor.setLocale('ko');
```

### 5.3 Terminology

- **`locale`**: Identifier representing language and region settings (noun)
  - Examples: `'en'`, `'ko'`, `'ja'`, `'zh-CN'`
  - Usage: `setDefaultLocale('ko')`, `getDefaultLocale()`

- **`localize`**: Action of translating/adjusting to match specific locale (verb)
  - Example: "localize the message" (translate the message)
  - Usage: `getLocalizedMessage()` (gets already translated message)

- **`localized`**: Adjective indicating already translated state
  - Example: "localized message" (translated message)
  - Usage: `getLocalizedMessage()` (gets localized message)

**Function name explanation**:
- `getLocalizedMessage()`: Gets message that is already translated (localized) for specific locale
- Difference from `getLocaleMessage()`: "localized" means already translated state

### 5.4 External Language Pack Registration

Languages not provided by default can be registered externally:

```typescript
import { registerLocaleMessages } from '@barocss/editor-core/i18n';

// Register language pack (merge method)
registerLocaleMessages('ja', {
  'context.editorFocus.description': 'エディターがフォーカスを持っているかどうか',
  'context.editorEditable.description': 'エディターが編集可能な状態かどうか',
  // ... translations for message IDs
});

// Multiple Extensions can add messages to same locale
registerLocaleMessages('ja', {
  'command.toggleBold.label': '太字'
});

// Use after registration
const editor = new Editor({
  locale: 'ja',
  // ...
});
```

**Language pack registration characteristics**:
- **Merge method**: Multiple registrations for same locale merge with existing messages
- **Overwriting**: If same message ID is registered again, later registration takes precedence
- **Registration timing**: Must register before Editor creation to use that language
- **Extension registration**: Common to register in Extension's `onCreate`
- **Host registration**: Host applications can also register

**⚠️ Important: Preventing Flicker (FOUC)**

If language files are loaded asynchronously, **all messages must be ready before Editor renders**. Otherwise, English will be displayed first and then change to Japanese, causing flicker.

**Correct usage**:
```typescript
// ✅ Correct method: Create Editor after loading language pack
async function initEditor() {
  // 1. Load language pack first
  const japaneseMessages = await fetch('/i18n/messages.ja.json').then(r => r.json());
  registerLocaleMessages('ja', japaneseMessages);
  
  // 2. Create Editor after language pack loading completes
  const editor = new Editor({
    locale: 'ja',
    // ...
  });
  
  return editor;
}

// ❌ Incorrect method: Load language pack after creating Editor
const editor = new Editor({ locale: 'ja' }); // Displays in English first
const messages = await fetch('/i18n/messages.ja.json').then(r => r.json());
registerLocaleMessages('ja', messages); // Changes to Japanese later (flicker occurs)
```

**Language pack loading helper function** (optional):
```typescript
/**
 * Load and register language pack asynchronously
 * 
 * @param locale - Language code
 * @param url - Language pack JSON file URL
 * @returns Promise<void>
 */
export async function loadLocaleMessages(
  locale: string, 
  url: string
): Promise<void> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to load language pack for ${locale}: ${response.statusText}`);
  }
  const messages = await response.json();
  registerLocaleMessages(locale, messages);
}

// Usage example
async function initEditor() {
  // Load multiple language packs in parallel
  await Promise.all([
    loadLocaleMessages('ja', '/i18n/messages.ja.json'),
    loadLocaleMessages('zh-CN', '/i18n/messages.zh-CN.json')
  ]);
  
  // Create Editor after all language packs are loaded
  const editor = new Editor({
    locale: 'ja',
    // ...
  });
  
  return editor;
}
```

**Providing language pack via Editor options** (recommended):
```typescript
// Prepare language pack in advance and pass via Editor options
const japaneseMessages = {
  'context.editorFocus.description': 'エディターがフォーカスを持っているかどうか',
  // ... all messages
};

// Register before Editor creation
registerLocaleMessages('ja', japaneseMessages);

// Or ensure it's registered at Editor creation time
const editor = new Editor({
  locale: 'ja',
  // ...
});
```

**Check language pack loading status**:
```typescript
/**
 * Check if messages for specific locale are registered
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

// Usage example
if (!hasLocaleMessages('ja')) {
  // Wait to load if language pack doesn't exist
  await loadLocaleMessages('ja', '/i18n/messages.ja.json');
}

const editor = new Editor({ locale: 'ja' });
```

## 6. Implementation Plan

### 6.1 Step 1: Set Up Basic Structure

1. Create `packages/editor-core/src/i18n/` directory
2. Define basic messages (English) - as TypeScript file (`messages.en.ts`)
3. Implement `getLocalizedMessage()` function

### 6.2 Step 2: Multilingualize Context Descriptions

1. Convert `DEFAULT_CONTEXT_DESCRIPTIONS` to message IDs
2. Implement `getContextDescription()` function
3. Add translations for basic language (English)

### 6.3 Step 3: Implement Language Pack System

1. Add Korean translations (as TypeScript file `messages.ko.ts`)
2. Implement `registerLocaleMessages()` function (for external language pack registration)
3. Implement `getLocalizedMessage()` function (integrated lookup for built-in/external language packs)
4. Implement global locale setting functions (`setDefaultLocale`, `getDefaultLocale`)
5. Implement browser language auto-detection feature

### 6.4 Step 4: Extension Support

1. Write guide for using i18n in Extensions
2. Define Extension i18n structure
3. Support Extension language pack loading

## 7. Considerations

### 7.1 Bundle Size

- Including all languages in bundle can increase size
- Unused languages can be removed through tree-shaking
- Can configure to include only specific languages at build time if needed

### 7.2 Translation Quality

- Basic language (English) always provided
- Other languages need community contributions or professional translators
- Fallback to basic language if translation not available

### 7.3 Type Safety

- Define message IDs as types to prevent typos
- Utilize TypeScript's type system

```typescript
type MessageId = 
  | 'context.editorFocus.description'
  | 'context.editorEditable.description'
  | 'error.invalidSelection.message';

function getLocalizedMessage(
  id: MessageId, 
  locale?: string,
  params?: Record<string, string | number>
): string {
  // ...
}
```

### 7.4 Message Merging and Nested Structure

**Merge method**:
- Multiple registrations for same locale merge with existing messages
- Use `Object.assign()` to prevent overwriting
- Each Extension only needs to register its own messages

**Nested structure considerations**:
- Currently using flat structure (`'context.editorFocus.description'`)
- If nested structure needed, use dot(.) in message ID to represent hierarchy
- Example: `'context.editorFocus.description'`, `'context.editorFocus.tooltip'`

**Other editors' approaches**:
- **VS Code**: JSON-based, supports merge method (Extension-specific language packs)
- **i18next**: Namespace-based, supports merging and nested structures
- **React Intl**: Message ID-based, supports placeholder replacement

**Our approach**:
- Flat structure + dot(.) separator to represent hierarchy
- Support merging via `registerLocaleMessages()`
- Support placeholder replacement via `getLocalizedMessage()`

## 8. Number/Date Formatting Considerations

### 8.1 Current Approach

Currently Barocss Editor **focuses only on text message translation**. This is the same approach as VS Code.

**Reasons**:
- Most basic and essential feature
- Minimize editor core complexity
- VS Code also focuses only on text translation

### 8.2 When Number/Date Formatting is Needed

When editor needs to display numbers or dates:
- **Page numbers**: "Page 1,234"
- **Date/time**: "January 15, 2024"
- **Statistics**: "1,234 words"

### 8.3 Recommended Solution

**Use browser's `Intl` API directly** (no separate library needed):

```typescript
// Number formatting
const pageNumber = new Intl.NumberFormat('ko-KR').format(1234);
// "1,234"

// Date formatting
const date = new Intl.DateTimeFormat('ko-KR', {
  year: 'numeric',
  month: 'long',
  day: 'numeric'
}).format(new Date());
// "2024년 1월 15일"
```

**Provide utility functions if needed** (future):
- Can add `Intl` API wrapper functions to `@barocss/shared`
- Currently recommend using `Intl` API directly

See `i18n-number-formatting-analysis.md` document for details.

## 9. Pluralization Handling

### 9.1 What is Pluralization?

Phenomenon where word forms change based on numbers:
- **English**: "0 items", "1 item", "2 items"
- **Russian**: More complex rules (1, 2-4, 5+, etc.)
- **Korean**: "0개", "1개", "2개" (relatively simple)

### 9.2 Current Approach

Barocss Editor follows **VS Code approach**: Separate message IDs and conditionally select.

**Message definitions**:
```typescript
// messages.en.ts
export const messagesEn = {
  'word.count.zero': '0 words',
  'word.count.one': '1 word',
  'word.count.other': '{count} words',
};

// messages.ko.ts
export const messagesKo = {
  'word.count.zero': '0단어',
  'word.count.one': '1단어',
  'word.count.other': '{count}단어',
};
```

**Usage**:
```typescript
function getWordCountMessage(count: number, locale?: string): string {
  if (count === 0) {
    return getLocalizedMessage('word.count.zero', undefined, locale);
  } else if (count === 1) {
    return getLocalizedMessage('word.count.one', undefined, locale);
  } else {
    return getLocalizedMessage('word.count.other', { count }, locale);
  }
}
```

### 9.3 Advantages

- **Simplicity**: Perfect compatibility with current structure
- **Same as VS Code**: Proven approach
- **Sufficient**: Works well for most languages

### 9.4 Future Extensibility

If complex pluralization rules (Russian, etc.) are needed:
- Can add `Intl.PluralRules`-based helper functions to `@barocss/shared`
- Utilize browser native API (no bundle size increase)

See `i18n-number-formatting-analysis.md` document for details.

## 10. References

- [VS Code Localization](https://code.visualstudio.com/api/advanced-topics/extension-localization)
- [VS Code Language Packs](https://marketplace.visualstudio.com/vscode)
- [vscode-loc Repository](https://github.com/microsoft/vscode-loc)
- [i18next](https://www.i18next.com/) - Popular JavaScript i18n library
- [Format.js](https://formatjs.io/) - Base library for React Intl
- [MDN: Intl API](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl) - Browser native internationalization API
