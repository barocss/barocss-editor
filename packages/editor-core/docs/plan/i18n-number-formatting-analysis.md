# i18n Pluralization Processing Analysis and Proposal

## 1. What is Pluralization?

A phenomenon where word forms change based on numbers.

### 1.1 Pluralization Rules by Language

**English** (simple):
- 0 items
- 1 item
- 2 items

**Russian** (complex):
- 1 яблоко (yabloko) - singular
- 2-4 яблока (yabloka) - few
- 5+ яблок (yablok) - plural
- 21 яблоко (singular again)
- 22-24 яблока (few)
- 25+ яблок (plural)

**Korean** (relatively simple):
- 0개, 1개, 2개 (all use "개")
- But may differ by unit like "0명", "1명", "2명"

### 1.2 Cases Where Pluralization is Needed in Editor

**Expected use cases in current codebase**:
- **Word count**: "1 word" vs "2 words"
- **Character count**: "1 character" vs "2 characters"
- **History entries**: "1 entry" vs "2 entries"
- **Error messages**: "1 error" vs "2 errors"
- **Selected items**: "1 item selected" vs "2 items selected"

## 2. Pluralization Processing Methods in Other Editors/Libraries

### 2.1 VS Code
- **vscode-nls**: Does not support pluralization by default
- **Solution**: Handle by separating message IDs
  ```json
  {
    "item.singular": "1 item",
    "item.plural": "{count} items"
  }
  ```
- **Approach**: Developers manually select message IDs conditionally

### 2.2 ICU MessageFormat (Standard)
- **ICU (International Components for Unicode)**: Standard for pluralization processing
- **Format**: `{count, plural, one {1 item} other {# items}}`
- **Support**: Most i18n libraries support ICU format
- **Example**:
  ```
  {count, plural,
    =0 {no items}
    =1 {1 item}
    other {# items}
  }
  ```

### 2.3 i18next
- **Basic**: Supports simple pluralization
  ```json
  {
    "item_one": "1 item",
    "item_other": "{{count}} items"
  }
  ```
- **Extension**: Supports ICU MessageFormat via `i18next-icu` plugin
- **Approach**: Use `_one`, `_other` suffixes in message keys

### 2.4 React Intl / Format.js
- **Comprehensive support**: Full ICU MessageFormat support
- **Use cases**: All UI elements in React applications
- **Characteristics**: Very powerful but heavy, may be excessive for editor core

## 3. Proposal: Pluralization Implementation Approach

### 3.1 Option A: Simple Pluralization Processing (Recommended)

**VS Code approach**: Handle by separating message IDs

```typescript
// messages.en.ts
export const messagesEn = {
  'word.count.zero': '0 words',
  'word.count.one': '1 word',
  'word.count.other': '{count} words',
};

// Usage
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

**Advantages**:
- Simple implementation
- Perfect compatibility with current structure
- Same approach as VS Code

**Disadvantages**:
- Developers need to write conditional logic manually
- Difficult to handle complex pluralization rules (Russian, etc.)

### 3.2 Option B: ICU MessageFormat Support (Advanced)

**ICU format support**:

```typescript
// messages.en.ts
export const messagesEn = {
  'word.count': '{count, plural, =0 {0 words} =1 {1 word} other {# words}}',
};

// Implementation
function parseICUPlural(message: string, count: number, locale: string): string {
  // ICU MessageFormat parser needed
  // {count, plural, =0 {...} =1 {...} other {...}}
}
```

**Advantages**:
- Supports standard format
- Can handle complex pluralization rules
- Compatible with other i18n libraries

**Disadvantages**:
- Parser implementation needed (complex)
- Possible bundle size increase
- Learning curve exists

### 3.3 Option C: Provide Utility Functions (Intermediate)

**Pluralization selection helper functions**:

```typescript
// packages/shared/src/i18n/plural.ts
/**
 * Determine plural category (based on ICU rules)
 */
export function getPluralCategory(count: number, locale: string): 'zero' | 'one' | 'two' | 'few' | 'many' | 'other' {
  // Use Intl.PluralRules (browser native)
  const rules = new Intl.PluralRules(locale);
  return rules.select(count) as 'zero' | 'one' | 'two' | 'few' | 'many' | 'other';
}

/**
 * Select plural message
 */
export function selectPluralMessage(
  messages: {
    zero?: string;
    one?: string;
    two?: string;
    few?: string;
    many?: string;
    other: string;
  },
  count: number,
  locale: string
): string {
  const category = getPluralCategory(count, locale);
  return messages[category] || messages.other;
}
```

**Usage example**:

```typescript
// messages.en.ts
export const messagesEn = {
  'word.count.zero': '0 words',
  'word.count.one': '1 word',
  'word.count.other': '{count} words',
};

// Usage
import { selectPluralMessage, getPluralCategory } from '@barocss/shared/i18n';

function getWordCountMessage(count: number, locale: string): string {
  const category = getPluralCategory(count, locale);
  const messageId = `word.count.${category}`;
  return getLocalizedMessage(messageId, { count }, locale);
}
```

**Advantages**:
- Utilizes browser native API (`Intl.PluralRules`)
- No bundle size increase
- Automatically applies standard rules

**Disadvantages**:
- Still need to separate message IDs
- But automatically selects correct category
```typescript
// packages/shared/src/i18n/format.ts
import { getDefaultLocale } from '@barocss/editor-core/i18n';

/**
 * Number formatting
 */
export function formatNumber(
  value: number,
  options?: Intl.NumberFormatOptions,
  locale?: string
): string {
  const effectiveLocale = locale || getDefaultLocale();
  return new Intl.NumberFormat(effectiveLocale, options).format(value);
}

/**
 * Date formatting
 */
export function formatDate(
  date: Date,
  options?: Intl.DateTimeFormatOptions,
  locale?: string
): string {
  const effectiveLocale = locale || getDefaultLocale();
  return new Intl.DateTimeFormat(effectiveLocale, options).format(date);
}

/**
 * Time formatting
 */
export function formatTime(
  date: Date,
  options?: Intl.DateTimeFormatOptions,
  locale?: string
): string {
  const effectiveLocale = locale || getDefaultLocale();
  return new Intl.DateTimeFormat(effectiveLocale, {
    ...options,
    hour: 'numeric',
    minute: 'numeric',
  }).format(date);
}

/**
 * Currency formatting
 */
export function formatCurrency(
  value: number,
  currency: string,
  options?: Intl.NumberFormatOptions,
  locale?: string
): string {
  const effectiveLocale = locale || getDefaultLocale();
  return new Intl.NumberFormat(effectiveLocale, {
    style: 'currency',
    currency,
    ...options,
  }).format(value);
}
```

**Advantages**:
- Utilizes browser native API (no bundle size increase)
- Automatically supports all locales
- Uses standard API

**Usage examples**:
```typescript
import { formatNumber, formatDate } from '@barocss/shared/i18n';

// Display page number
const pageNumber = formatNumber(1234, { useGrouping: true }); 
// en: "1,234", ko: "1,234", de: "1.234"

// Display date
const date = formatDate(new Date(), { year: 'numeric', month: 'long', day: 'numeric' });
// en: "January 15, 2024", ko: "2024년 1월 15일"
```

#### Option B: Provide as Extension
- Use only in Extensions that need number/date formatting
- Core focuses only on text translation
- Extensions can directly use `Intl` API when needed

## 4. Recommendations

### 4.1 Currently Focus Only on Text Translation ✅
**Reasons**:
1. **Same approach as VS Code**: VS Code also focuses on text translation
2. **Prioritize essential features**: Most frequently used features
3. **Simplicity**: Minimize complexity
4. **Extensible**: Can be added later when needed

### 4.2 Add Number/Date Formatting When Needed
**Conditions for addition**:
- When actual use cases are clear
- When requested by Extensions or host applications
- Provide as `Intl` API wrapper like VS Code (no separate library needed)

### 4.3 Implementation Priority
1. ✅ **Text message translation** (completed)
2. ⏸️ **Number formatting** (when needed)
3. ⏸️ **Date/time formatting** (when needed)
4. ⏸️ **Currency formatting** (when needed, rarely needed in editor)

## 5. Conclusion

**Currently recommend not adding number/date formatting.**

**Reasons**:
1. VS Code also focuses only on text translation
2. Can directly use browser's `Intl` API
3. Prevents increase in editor core complexity
4. Can be handled by Extensions or host applications when needed

**When needed in the future**:
- Add `Intl` API wrapper functions to `@barocss/shared`
- Or Extensions directly use `Intl` API
- No need to introduce separate formatting library
