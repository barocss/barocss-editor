# i18n 복수형(Pluralization) 처리 분석 및 제안

## 1. 복수형(Pluralization)이란?

숫자에 따라 단어의 형태가 달라지는 현상입니다.

### 1.1 언어별 복수형 규칙

**영어** (단순):
- 0 items
- 1 item
- 2 items

**러시아어** (복잡):
- 1 яблоко (yabloko) - 단수
- 2-4 яблока (yabloka) - 소수
- 5+ яблок (yablok) - 복수
- 21 яблоко (단수로 다시)
- 22-24 яблока (소수)
- 25+ яблок (복수)

**한국어** (상대적으로 단순):
- 0개, 1개, 2개 (모두 "개" 사용)
- 하지만 "0명", "1명", "2명" 등 단위에 따라 다를 수 있음

### 1.2 에디터에서 복수형이 필요한 경우

**현재 코드베이스에서 예상되는 사용 사례**:
- **단어 수**: "1 word" vs "2 words"
- **문자 수**: "1 character" vs "2 characters"
- **히스토리 엔트리**: "1 entry" vs "2 entries"
- **에러 메시지**: "1 error" vs "2 errors"
- **선택된 항목**: "1 item selected" vs "2 items selected"

## 2. 다른 에디터/라이브러리들의 복수형 처리 방식

### 2.1 VS Code
- **vscode-nls**: 기본적으로 복수형 처리 지원하지 않음
- **해결 방법**: 메시지 ID를 분리하여 처리
  ```json
  {
    "item.singular": "1 item",
    "item.plural": "{count} items"
  }
  ```
- **접근 방식**: 개발자가 직접 조건부로 메시지 ID 선택

### 2.2 ICU MessageFormat (표준)
- **ICU (International Components for Unicode)**: 복수형 처리의 표준
- **형식**: `{count, plural, one {1 item} other {# items}}`
- **지원**: 대부분의 i18n 라이브러리가 ICU 형식 지원
- **예시**:
  ```
  {count, plural,
    =0 {no items}
    =1 {1 item}
    other {# items}
  }
  ```

### 2.3 i18next
- **기본**: 간단한 복수형 처리 지원
  ```json
  {
    "item_one": "1 item",
    "item_other": "{{count}} items"
  }
  ```
- **확장**: `i18next-icu` 플러그인으로 ICU MessageFormat 지원
- **접근 방식**: 메시지 키에 `_one`, `_other` 접미사 사용

### 2.4 React Intl / Format.js
- **포괄적 지원**: ICU MessageFormat 완전 지원
- **사용 사례**: React 애플리케이션의 모든 UI 요소
- **특징**: 매우 강력하지만 무겁고, 에디터 코어에는 과할 수 있음

## 3. 제안: 복수형 처리 구현 방안

### 3.1 옵션 A: 간단한 복수형 처리 (권장)

**VS Code 방식**: 메시지 ID를 분리하여 처리

```typescript
// messages.en.ts
export const messagesEn = {
  'word.count.zero': '0 words',
  'word.count.one': '1 word',
  'word.count.other': '{count} words',
};

// 사용
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

**장점**:
- 구현이 단순함
- 현재 구조와 완벽 호환
- VS Code와 동일한 접근 방식

**단점**:
- 개발자가 직접 조건부 로직 작성 필요
- 복잡한 복수형 규칙(러시아어 등) 처리 어려움

### 3.2 옵션 B: ICU MessageFormat 지원 (고급)

**ICU 형식 지원**:

```typescript
// messages.en.ts
export const messagesEn = {
  'word.count': '{count, plural, =0 {0 words} =1 {1 word} other {# words}}',
};

// 구현
function parseICUPlural(message: string, count: number, locale: string): string {
  // ICU MessageFormat 파서 필요
  // {count, plural, =0 {...} =1 {...} other {...}}
}
```

**장점**:
- 표준 형식 지원
- 복잡한 복수형 규칙 처리 가능
- 다른 i18n 라이브러리와 호환

**단점**:
- 파서 구현 필요 (복잡함)
- 번들 크기 증가 가능
- 학습 곡선 존재

### 3.3 옵션 C: 유틸리티 함수 제공 (중간)

**복수형 선택 헬퍼 함수**:

```typescript
// packages/shared/src/i18n/plural.ts
/**
 * 복수형 카테고리 결정 (ICU 규칙 기반)
 */
export function getPluralCategory(count: number, locale: string): 'zero' | 'one' | 'two' | 'few' | 'many' | 'other' {
  // Intl.PluralRules 사용 (브라우저 네이티브)
  const rules = new Intl.PluralRules(locale);
  return rules.select(count) as 'zero' | 'one' | 'two' | 'few' | 'many' | 'other';
}

/**
 * 복수형 메시지 선택
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

**사용 예시**:

```typescript
// messages.en.ts
export const messagesEn = {
  'word.count.zero': '0 words',
  'word.count.one': '1 word',
  'word.count.other': '{count} words',
};

// 사용
import { selectPluralMessage, getPluralCategory } from '@barocss/shared/i18n';

function getWordCountMessage(count: number, locale: string): string {
  const category = getPluralCategory(count, locale);
  const messageId = `word.count.${category}`;
  return getLocalizedMessage(messageId, { count }, locale);
}
```

**장점**:
- 브라우저 네이티브 API 활용 (`Intl.PluralRules`)
- 번들 크기 증가 없음
- 표준 규칙 자동 적용

**단점**:
- 여전히 메시지 ID 분리 필요
- 하지만 자동으로 올바른 카테고리 선택
```typescript
// packages/shared/src/i18n/format.ts
import { getDefaultLocale } from '@barocss/editor-core/i18n';

/**
 * 숫자 포맷팅
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
 * 날짜 포맷팅
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
 * 시간 포맷팅
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
 * 통화 포맷팅
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

**장점**:
- 브라우저 네이티브 API 활용 (번들 크기 증가 없음)
- 모든 locale 자동 지원
- 표준 API 사용

**사용 예시**:
```typescript
import { formatNumber, formatDate } from '@barocss/shared/i18n';

// 페이지 번호 표시
const pageNumber = formatNumber(1234, { useGrouping: true }); 
// en: "1,234", ko: "1,234", de: "1.234"

// 날짜 표시
const date = formatDate(new Date(), { year: 'numeric', month: 'long', day: 'numeric' });
// en: "January 15, 2024", ko: "2024년 1월 15일"
```

#### 옵션 B: Extension으로 제공
- 숫자/날짜 포맷팅이 필요한 Extension에서만 사용
- 코어는 텍스트 번역에만 집중
- 필요시 Extension에서 `Intl` API 직접 사용

## 4. 권장 사항

### 4.1 현재는 텍스트 번역에만 집중 ✅
**이유**:
1. **VS Code와 동일한 접근**: VS Code도 텍스트 번역에 집중
2. **필수 기능 우선**: 가장 많이 사용되는 기능
3. **단순성**: 복잡도 최소화
4. **확장 가능**: 나중에 필요시 추가 가능

### 4.2 숫자/날짜 포맷팅은 필요시 추가
**추가 조건**:
- 실제 사용 사례가 명확할 때
- Extension이나 호스트 애플리케이션에서 요청이 있을 때
- VS Code처럼 `Intl` API 래핑으로 제공 (별도 라이브러리 불필요)

### 4.3 구현 우선순위
1. ✅ **텍스트 메시지 번역** (완료)
2. ⏸️ **숫자 포맷팅** (필요시)
3. ⏸️ **날짜/시간 포맷팅** (필요시)
4. ⏸️ **통화 포맷팅** (필요시, 에디터에서는 거의 불필요)

## 5. 결론

**현재는 숫자/날짜 포맷팅을 추가하지 않는 것을 권장합니다.**

**이유**:
1. VS Code도 텍스트 번역에만 집중
2. 브라우저의 `Intl` API를 직접 사용할 수 있음
3. 에디터 코어의 복잡도 증가 방지
4. 필요시 Extension이나 호스트 애플리케이션에서 처리 가능

**향후 필요시**:
- `@barocss/shared`에 `Intl` API 래퍼 함수 추가
- 또는 Extension에서 직접 `Intl` API 사용
- 별도의 포맷팅 라이브러리 도입 불필요

