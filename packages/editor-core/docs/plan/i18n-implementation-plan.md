# i18n 구현 계획

## 1. 구조 설계

### 1.1 패키지 분리

#### `@barocss/shared` (공용 유틸리티)
- `replacePlaceholders()` - 플레이스홀더 치환 함수 (범용)
- `normalizeLocale()` - locale 정규화 함수 (예: 'ko-KR' -> 'ko')

#### `@barocss/editor-core` (i18n 구현)
- `src/i18n/messages.en.ts` - 영어 메시지 정의
- `src/i18n/messages.ko.ts` - 한국어 메시지 정의
- `src/i18n/index.ts` - 메인 구현 (메시지 저장소, API 함수들)

### 1.2 파일 구조

```
packages/
  shared/
    src/
      i18n/
        placeholder.ts          # replacePlaceholders 함수
        locale.ts               # normalizeLocale 함수
        index.ts                # export
      index.ts                  # shared export에 추가
  
  editor-core/
    src/
      i18n/
        messages.en.ts          # 영어 메시지
        messages.ko.ts          # 한국어 메시지
        index.ts               # 메인 구현
      index.ts                  # editor-core export에 추가
```

## 2. 구현 단계

### 2.1 1단계: Shared 패키지에 공용 함수 추가

**파일**: `packages/shared/src/i18n/placeholder.ts`
```typescript
/**
 * 플레이스홀더 치환
 * 
 * 메시지 문자열의 {key} 형태를 params의 값으로 치환합니다.
 * 
 * @param message - 원본 메시지
 * @param params - 치환할 파라미터
 * @returns 치환된 메시지
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

**파일**: `packages/shared/src/i18n/locale.ts`
```typescript
/**
 * Locale 정규화
 * 
 * 브라우저 언어 코드를 간단한 locale 코드로 변환합니다.
 * 예: 'ko-KR' -> 'ko', 'en-US' -> 'en'
 * 
 * @param locale - 언어 코드 (예: 'ko-KR', 'en-US')
 * @returns 정규화된 locale 코드 (예: 'ko', 'en')
 */
export function normalizeLocale(locale: string): string {
  // 'ko-KR' -> 'ko', 'en-US' -> 'en'
  const parts = locale.split('-');
  return parts[0]?.toLowerCase() || 'en';
}
```

**파일**: `packages/shared/src/i18n/index.ts`
```typescript
export { replacePlaceholders } from './placeholder';
export { normalizeLocale } from './locale';
```

**파일**: `packages/shared/src/index.ts` (수정)
```typescript
export { IS_MAC, IS_LINUX, IS_WINDOWS } from './platform';
export { getKeyString } from './key-string';
export { normalizeKeyString, expandModKey } from './key-binding';
export { replacePlaceholders, normalizeLocale } from './i18n';
```

### 2.2 2단계: Editor-Core에 기본 메시지 파일 생성

**파일**: `packages/editor-core/src/i18n/messages.en.ts`
```typescript
/**
 * 영어 메시지 정의
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

**파일**: `packages/editor-core/src/i18n/messages.ko.ts`
```typescript
/**
 * 한국어 메시지 정의
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

### 2.3 3단계: Editor-Core에 메인 구현

**파일**: `packages/editor-core/src/i18n/index.ts`
```typescript
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
 */
export function setDefaultLocale(locale: string): void {
  defaultLocale = locale;
}

/**
 * 전역 locale 조회
 */
export function getDefaultLocale(): string {
  return defaultLocale;
}

/**
 * 특정 locale의 메시지가 등록되어 있는지 확인
 */
export function hasLocaleMessages(locale: string): boolean {
  return (
    builtinMessages[locale] !== undefined ||
    externalMessages[locale] !== undefined
  );
}

/**
 * 언어 팩을 async로 로드하고 등록
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
 */
export function initializeI18n(options?: { autoDetect?: boolean }): void {
  if (options?.autoDetect !== false) {
    defaultLocale = detectBrowserLocale();
  }
}
```

### 2.4 4단계: Export 추가

**파일**: `packages/editor-core/src/index.ts` (수정)
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

### 2.5 5단계: 테스트 코드 작성

**파일**: `packages/shared/src/i18n/placeholder.test.ts`
- `replacePlaceholders` 함수 테스트

**파일**: `packages/shared/src/i18n/locale.test.ts`
- `normalizeLocale` 함수 테스트

**파일**: `packages/editor-core/test/i18n.test.ts`
- `getLocalizedMessage` 테스트
- `registerLocaleMessages` 테스트
- `setDefaultLocale` / `getDefaultLocale` 테스트
- `hasLocaleMessages` 테스트
- `loadLocaleMessages` 테스트 (mock fetch)
- fallback 동작 테스트
- 플레이스홀더 치환 테스트

## 3. 구현 순서

1. ✅ Shared 패키지에 공용 함수 추가
   - `replacePlaceholders`
   - `normalizeLocale`
   - 테스트 코드

2. ✅ Editor-Core에 기본 메시지 파일 생성
   - `messages.en.ts`
   - `messages.ko.ts`

3. ✅ Editor-Core에 메인 구현
   - `i18n/index.ts`

4. ✅ Export 추가
   - `shared/src/index.ts`
   - `editor-core/src/index.ts`

5. ✅ 테스트 코드 작성
   - Shared 테스트
   - Editor-Core 테스트

## 4. 주의사항

- `loadLocaleMessages`는 `fetch` API를 사용하므로 브라우저 환경에서만 동작
- Node.js 환경에서는 `node-fetch` 같은 polyfill 필요할 수 있음
- 테스트에서는 `fetch`를 mock해야 함
- `initializeI18n`은 Editor 생성 전에 호출하는 것이 좋음

