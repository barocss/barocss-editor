# Internationalization (i18n) 스펙

## 1. 개요

Barocss Editor는 다국어 지원을 위해 VS Code의 로컬라이제이션 시스템을 참고하여 설계되었습니다. 사용자 인터페이스 텍스트, 에러 메시지, 도움말 텍스트 등을 다양한 언어로 제공할 수 있습니다.

## 2. VS Code의 다국어 지원 방식

### 2.1 언어 팩 (Language Packs)

VS Code는 공식적으로 다양한 언어 팩을 제공합니다:
- 각 언어별로 별도의 확장 프로그램으로 제공
- 사용자가 원하는 언어 팩을 설치하여 UI 언어 변경
- GitHub의 [vscode-loc 저장소](https://github.com/microsoft/vscode-loc)를 통해 커뮤니티가 관리

### 2.2 로컬라이제이션 파일 구조

VS Code는 다음 구조를 사용합니다:

```
extension/
  package.json          # 기본 언어 정의
  package.nls.json      # 영어 (기본)
  package.nls.ko.json   # 한국어
  package.nls.ja.json   # 일본어
  ...
```

### 2.3 번역 키 시스템

VS Code는 메시지 ID를 사용하여 번역을 관리합니다:

```json
// package.nls.json (영어)
{
  "extension.description": "My Extension Description",
  "command.title": "Execute Command"
}

// package.nls.ko.json (한국어)
{
  "extension.description": "내 확장 프로그램 설명",
  "command.title": "명령 실행"
}
```

### 2.4 사용 방법

```typescript
import * as nls from 'vscode-nls';

const localize = nls.loadMessageBundle();
const message = localize('extension.description', 'Default Description');
```

## 3. Barocss Editor의 다국어 지원 제안

### 3.1 구조 제안

VS Code 방식을 참고하되, 더 간단한 구조로 시작:

```
packages/editor-core/
  src/
    i18n/
      messages.json          # 영어 (기본, 메시지 ID 정의)
      messages.ko.json       # 한국어
      messages.ja.json       # 일본어
      messages.zh-CN.json    # 중국어 (간체)
      ...
    context/
      default-context.ts     # 기본 context 정의
```

### 3.2 메시지 ID 네이밍 규칙

계층적 네이밍을 사용하여 그룹화:

```
{category}.{subcategory}.{key}

예시:
- context.editorFocus.description
- context.editorEditable.description
- error.invalidSelection.message
- command.toggleBold.label
```

### 3.3 구현 방식

#### 옵션 1: JSON 기반 로컬라이제이션 (VS Code 스타일)

**장점**:
- VS Code와 동일한 패턴으로 친숙함
- 확장 프로그램에서도 동일한 방식 사용 가능
- JSON 파일로 관리하여 번역 작업이 쉬움

**단점**:
- 런타임에 JSON 파일 로드 필요
- 번들 크기 증가 가능성

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

#### 옵션 2: TypeScript 객체 기반 (간단한 방식)

**장점**:
- 타입 안정성
- 번들 최적화 가능
- 런타임 오버헤드 없음

**단점**:
- 모든 언어를 번들에 포함해야 함
- 동적 언어 변경이 어려움

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

#### 옵션 3: 하이브리드 방식 (권장)

**구조**:
- 기본 언어(en, ko)는 TypeScript 파일로 내장
- 다른 언어는 외부에서 등록 가능
- Extension이나 호스트 애플리케이션에서 언어 팩 제공 가능

**장점**:
- 기본 언어는 번들에 포함되어 즉시 사용 가능
- 타입 안정성 (기본 언어)
- 외부에서 언어 팩 확장 가능
- `require()`나 `import()` 동적 호출 불필요
- 번들 크기 최적화 (필요한 언어만 포함)

**단점**:
- 외부 언어 팩은 런타임에 등록 필요

**중요: 언어 팩 로딩 타이밍**
- 언어 팩은 **Editor 생성 전에 등록**되어야 함
- Editor가 렌더링되기 전에 모든 메시지가 준비되어야 깜빡임(FOUC) 방지
- Async 로딩이 필요한 경우, `await loadLanguagePack()` 후에 Editor 생성

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

// 내장 언어 (기본 제공)
const builtinMessages: Record<string, Record<string, string>> = {
  en: messagesEn,
  ko: messagesKo
};

// 외부에서 등록된 언어 팩
const externalMessages: Record<string, Record<string, string>> = {};

/**
 * 언어 팩 등록 (외부에서 호출)
 * 
 * 여러 Extension이나 호스트 애플리케이션에서 같은 locale에 메시지를 등록할 수 있습니다.
 * 기존 메시지와 병합되므로, 각 Extension은 자신의 메시지만 등록하면 됩니다.
 * 
 * **용어 설명**:
 * - `locale`: 언어 및 지역 설정을 나타내는 식별자 (예: 'en', 'ko', 'ja', 'zh-CN')
 * - `localize`: 특정 locale에 맞게 번역/조정하는 동작 (동사)
 * 
 * @param locale - 언어 코드 (예: 'ja', 'zh-CN')
 * @param messages - 등록할 메시지 객체
 * 
 * @example
 * ```typescript
 * // Extension A
 * registerLocaleMessages('ja', {
 *   'command.toggleBold.label': '太字'
 * });
 * 
 * // Extension B (같은 locale에 추가 메시지 등록)
 * registerLocaleMessages('ja', {
 *   'command.toggleItalic.label': '斜体'
 * });
 * 
 * // 결과: 두 Extension의 메시지가 모두 등록됨
 * ```
 */
export function registerLocaleMessages(locale: string, messages: Record<string, string>): void {
  if (!externalMessages[locale]) {
    externalMessages[locale] = {};
  }
  
  // 기존 메시지와 병합 (덮어쓰기 방지)
  Object.assign(externalMessages[locale], messages);
}

/**
 * 메시지 조회 (플레이스홀더 치환 지원)
 * 
 * **함수명 설명**:
 * - `getLocalizedMessage`: 특정 locale에 맞게 번역된(localized) 메시지를 가져옴
 * - `getLocaleMessage`와의 차이: "localized"는 이미 번역된 상태를 의미
 * 
 * **파라미터 순서**:
 * - `id`: 메시지 ID (필수)
 * - `params`: 플레이스홀더 치환용 파라미터 (선택, 자주 사용)
 * - `locale`: 언어 코드 (선택, 기본값은 전역 locale 설정 사용)
 * 
 * @param id - 메시지 ID
 * @param params - 플레이스홀더 치환용 파라미터 (선택)
 * @param locale - 언어 코드 (선택, 기본값은 전역 locale 또는 'en')
 * @returns 번역된 메시지 (플레이스홀더 치환됨)
 * 
 * @example
 * ```typescript
 * // 기본 사용 (전역 locale 사용)
 * getLocalizedMessage('context.editorFocus.description');
 * // 현재 locale이 'ko'면: "에디터가 포커스를 가지고 있는지 여부"
 * 
 * // 특정 locale 지정
 * getLocalizedMessage('context.editorFocus.description', undefined, 'ko');
 * 
 * // 플레이스홀더 치환 (가장 일반적인 사용)
 * getLocalizedMessage('error.invalidSelection', { 
 *   start: 10, 
 *   end: 20 
 * });
 * // 메시지: "선택 범위가 유효하지 않습니다: {start} ~ {end}"
 * // 결과: "선택 범위가 유효하지 않습니다: 10 ~ 20"
 * 
 * // 플레이스홀더 + 특정 locale
 * getLocalizedMessage('error.invalidSelection', { start: 10, end: 20 }, 'ko');
 * ```
 */
export function getLocalizedMessage(
  id: string,
  params?: Record<string, string | number>,
  locale?: string
): string {
  // locale이 제공되지 않으면 전역 locale 사용
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
 * 플레이스홀더 치환
 * 
 * 메시지 문자열의 {key} 형태를 params의 값으로 치환합니다.
 * 
 * @param message - 원본 메시지
 * @param params - 치환할 파라미터
 * @returns 치환된 메시지
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
 * 전역 locale 설정
 */
let defaultLocale: string = 'en';

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
    throw new Error(`Failed to load language pack for ${locale}: ${response.statusText}`);
  }
  const messages = await response.json();
  registerLocaleMessages(locale, messages);
}
```

### 3.4 사용 예시

#### 기본 사용 (내장 언어)

```typescript
import { getLocalizedMessage } from '@barocss/editor-core/i18n';

// Editor 초기화 시 언어 설정 (내장 언어: en, ko)
const editor = new Editor({
  locale: 'ko', // 또는 'en'
  // ...
});

// 메시지 조회
const description = getLocalizedMessage('context.editorFocus.description', undefined, 'ko');
// 한국어: "에디터가 포커스를 가지고 있는지 여부"
```

#### 외부 언어 팩 등록

```typescript
import { registerLocaleMessages, getLocalizedMessage } from '@barocss/editor-core/i18n';

// 외부에서 언어 팩 등록 (예: 일본어)
registerLocaleMessages('ja', {
  'context.editorFocus.description': 'エディターがフォーカスを持っているかどうか',
  'context.editorEditable.description': 'エディターが編集可能な状態かどうか'
});

// 여러 Extension에서 같은 locale에 메시지 추가 가능
registerLocaleMessages('ja', {
  'command.toggleBold.label': '太字',
  'command.toggleItalic.label': '斜体'
});

// Editor 초기화 시 등록된 언어 사용
const editor = new Editor({
  locale: 'ja',
  // ...
});

// 메시지 조회
const description = getLocalizedMessage('context.editorFocus.description', undefined, 'ja');
// 일본어: "エディターがフォーカスを持っているかどうか"
```

#### 플레이스홀더 치환

```typescript
// 메시지에 플레이스홀더 포함
registerLocaleMessages('ko', {
  'error.invalidSelection': '선택 범위가 유효하지 않습니다: {start} ~ {end}',
  'command.deleteNode': '{count}개의 노드를 삭제했습니다'
});

// 파라미터와 함께 조회
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

#### Extension에서 언어 팩 제공

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

// Extension의 onCreate에서 등록
export class JapaneseLanguagePackExtension implements Extension {
  onCreate(editor: Editor): void {
    registerJapaneseMessages();
  }
}
```

#### 여러 Extension에서 메시지 등록

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

// Extension B (같은 locale에 추가 메시지 등록)
export class ItalicExtension implements Extension {
  onCreate(editor: Editor): void {
    registerLocaleMessages('ja', {
      'command.toggleItalic.label': '斜体',
      'command.toggleItalic.description': 'テキストを斜体にする'
    });
  }
}

// 결과: 두 Extension의 메시지가 모두 등록되어 사용 가능
```

### 3.5 Context Description 다국어 지원

```typescript
// packages/editor-core/src/context/default-context.ts
import { getLocalizedMessage } from '../i18n';

export function getContextDescription(key: keyof DefaultContext, locale?: string): string {
  const messageId = `context.${key}.description`;
  return getLocalizedMessage(messageId, undefined, locale) || DEFAULT_CONTEXT_DESCRIPTIONS[key];
}

// 사용 예시
const description = getContextDescription('editorFocus', 'ko');
```

## 4. Extension에서의 다국어 지원

Extension도 동일한 방식으로 다국어를 지원할 수 있습니다:

```
packages/extensions/
  src/
    bold/
      i18n/
        messages.json
        messages.ko.json
        ...
```

## 5. Locale 설정 및 관리

### 5.1 Locale 기본값 설정

Locale 기본값은 다음 순서로 결정됩니다:

1. **Editor 옵션에서 명시적으로 설정**: `new Editor({ locale: 'ko' })`
2. **전역 locale 설정**: `setDefaultLocale('ko')`
3. **브라우저 언어 자동 감지**: `navigator.language` (옵션)
4. **기본값**: `'en'`

```typescript
// packages/editor-core/src/i18n/index.ts

// 전역 locale 기본값
let defaultLocale: string = 'en';

// 브라우저 언어 자동 감지
function detectBrowserLocale(): string {
  if (typeof navigator !== 'undefined') {
    const browserLang = navigator.language || navigator.languages?.[0];
    return normalizeLocale(browserLang); // 'ko-KR' -> 'ko'
  }
  return 'en';
}

// 초기화 시 브라우저 언어로 설정 (옵션)
export function initializeI18n(options?: { autoDetect?: boolean }): void {
  if (options?.autoDetect !== false) {
    defaultLocale = detectBrowserLocale();
  }
}
```

### 5.2 Locale 설정 및 조회

```typescript
import { setDefaultLocale, getDefaultLocale } from '@barocss/editor-core/i18n';

// 전역 locale 설정
setDefaultLocale('ko');

// 전역 locale 조회
const currentLocale = getDefaultLocale(); // 'ko'

// Editor 옵션으로 설정 (전역 설정보다 우선)
const editor = new Editor({
  locale: 'ja', // 이 Editor 인스턴스만 'ja' 사용
  // ...
});

// Editor 인스턴스에서 locale 변경
editor.setLocale('ko');
```

### 5.3 용어 정리

- **`locale`**: 언어 및 지역 설정을 나타내는 식별자 (명사)
  - 예: `'en'`, `'ko'`, `'ja'`, `'zh-CN'`
  - 사용: `setDefaultLocale('ko')`, `getDefaultLocale()`

- **`localize`**: 특정 locale에 맞게 번역/조정하는 동작 (동사)
  - 예: "localize the message" (메시지를 번역하다)
  - 사용: `getLocalizedMessage()` (이미 번역된 메시지를 가져옴)

- **`localized`**: 이미 번역된 상태를 나타내는 형용사
  - 예: "localized message" (번역된 메시지)
  - 사용: `getLocalizedMessage()` (localized message를 가져옴)

**함수명 설명**:
- `getLocalizedMessage()`: 특정 locale에 맞게 번역된(localized) 메시지를 가져옴
- `getLocaleMessage()`와의 차이: "localized"는 이미 번역된 상태를 의미

### 5.4 외부 언어 팩 등록

기본 제공되지 않는 언어는 외부에서 등록할 수 있습니다:

```typescript
import { registerLocaleMessages } from '@barocss/editor-core/i18n';

// 언어 팩 등록 (병합 방식)
registerLocaleMessages('ja', {
  'context.editorFocus.description': 'エディターがフォーカスを持っているかどうか',
  'context.editorEditable.description': 'エディターが編集可能な状態かどうか',
  // ... 메시지 ID에 대한 번역
});

// 여러 Extension에서 같은 locale에 메시지 추가 가능
registerLocaleMessages('ja', {
  'command.toggleBold.label': '太字'
});

// 등록 후 사용
const editor = new Editor({
  locale: 'ja',
  // ...
});
```

**언어 팩 등록 특징**:
- **병합 방식**: 같은 locale에 여러 번 등록해도 기존 메시지와 병합됨
- **덮어쓰기**: 같은 메시지 ID를 다시 등록하면 나중에 등록한 것이 우선
- **등록 시점**: Editor 생성 전에 등록해야 해당 언어를 사용할 수 있음
- **Extension 등록**: Extension의 `onCreate`에서 등록하는 것이 일반적
- **호스트 등록**: 호스트 애플리케이션에서도 등록 가능

**⚠️ 중요: 깜빡임(FOUC) 방지**

언어 파일을 async로 로드하는 경우, **Editor가 렌더링되기 전에 모든 메시지가 준비되어야 합니다**. 그렇지 않으면 영어로 먼저 표시되었다가 나중에 일본어로 바뀌는 깜빡임 현상이 발생합니다.

**올바른 사용법**:
```typescript
// ✅ 올바른 방법: 언어 팩 로드 후 Editor 생성
async function initEditor() {
  // 1. 언어 팩 먼저 로드
  const japaneseMessages = await fetch('/i18n/messages.ja.json').then(r => r.json());
  registerLocaleMessages('ja', japaneseMessages);
  
  // 2. 언어 팩 로드 완료 후 Editor 생성
  const editor = new Editor({
    locale: 'ja',
    // ...
  });
  
  return editor;
}

// ❌ 잘못된 방법: Editor 생성 후 언어 팩 로드
const editor = new Editor({ locale: 'ja' }); // 영어로 먼저 표시됨
const messages = await fetch('/i18n/messages.ja.json').then(r => r.json());
registerLocaleMessages('ja', messages); // 나중에 일본어로 바뀜 (깜빡임 발생)
```

**언어 팩 로딩 헬퍼 함수** (선택사항):
```typescript
/**
 * 언어 팩을 async로 로드하고 등록
 * 
 * @param locale - 언어 코드
 * @param url - 언어 팩 JSON 파일 URL
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

// 사용 예시
async function initEditor() {
  // 여러 언어 팩을 병렬로 로드
  await Promise.all([
    loadLocaleMessages('ja', '/i18n/messages.ja.json'),
    loadLocaleMessages('zh-CN', '/i18n/messages.zh-CN.json')
  ]);
  
  // 모든 언어 팩 로드 완료 후 Editor 생성
  const editor = new Editor({
    locale: 'ja',
    // ...
  });
  
  return editor;
}
```

**Editor 옵션으로 언어 팩 미리 제공** (권장):
```typescript
// 언어 팩을 미리 준비하여 Editor 옵션으로 전달
const japaneseMessages = {
  'context.editorFocus.description': 'エディターがフォーカスを持っているかどうか',
  // ... 모든 메시지
};

// Editor 생성 전에 등록
registerLocaleMessages('ja', japaneseMessages);

// 또는 Editor 생성 시점에 확실히 등록되어 있음을 보장
const editor = new Editor({
  locale: 'ja',
  // ...
});
```

**언어 팩 로딩 상태 확인**:
```typescript
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

// 사용 예시
if (!hasLocaleMessages('ja')) {
  // 언어 팩이 없으면 로드 대기
  await loadLocaleMessages('ja', '/i18n/messages.ja.json');
}

const editor = new Editor({ locale: 'ja' });
```

## 6. 구현 계획

### 6.1 1단계: 기본 구조 설정

1. `packages/editor-core/src/i18n/` 디렉토리 생성
2. 기본 메시지 정의 (영어) - TypeScript 파일로 (`messages.en.ts`)
3. `getLocalizedMessage()` 함수 구현

### 6.2 2단계: Context Description 다국어화

1. `DEFAULT_CONTEXT_DESCRIPTIONS`를 메시지 ID로 변환
2. `getContextDescription()` 함수 구현
3. 기본 언어(영어) 번역 추가

### 6.3 3단계: 언어 팩 시스템 구현

1. 한국어 번역 추가 (TypeScript 파일로 `messages.ko.ts`)
2. `registerLocaleMessages()` 함수 구현 (외부 언어 팩 등록용)
3. `getLocalizedMessage()` 함수 구현 (내장/외부 언어 팩 통합 조회)
4. 전역 locale 설정 함수 구현 (`setDefaultLocale`, `getDefaultLocale`)
5. 브라우저 언어 자동 감지 기능 구현

### 6.4 4단계: Extension 지원

1. Extension에서 i18n 사용 가이드 작성
2. Extension i18n 구조 정의
3. Extension 언어 팩 로딩 지원

## 7. 고려사항

### 7.1 번들 크기

- 모든 언어를 번들에 포함하면 크기가 커질 수 있음
- Tree-shaking을 통해 사용하지 않는 언어는 제거 가능
- 필요시 빌드 시점에 특정 언어만 포함하도록 설정 가능

### 7.2 번역 품질

- 기본 언어(영어)는 항상 제공
- 다른 언어는 커뮤니티 기여 또는 전문 번역가 필요
- 번역이 없는 경우 기본 언어로 fallback

### 7.3 타입 안정성

- 메시지 ID를 타입으로 정의하여 오타 방지
- TypeScript의 타입 시스템 활용

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

### 7.4 메시지 병합 및 중첩 구조

**병합 방식**:
- 같은 locale에 여러 번 등록해도 기존 메시지와 병합됨
- `Object.assign()`을 사용하여 덮어쓰기 방지
- 각 Extension은 자신의 메시지만 등록하면 됨

**중첩 구조 고려사항**:
- 현재는 평면 구조 (`'context.editorFocus.description'`) 사용
- 중첩 구조가 필요한 경우, 메시지 ID에 점(.)을 사용하여 계층 표현
- 예: `'context.editorFocus.description'`, `'context.editorFocus.tooltip'`

**다른 에디터들의 방식**:
- **VS Code**: JSON 기반, 병합 방식 지원 (Extension별 언어 팩)
- **i18next**: 네임스페이스 기반, 병합 및 중첩 구조 지원
- **React Intl**: 메시지 ID 기반, 플레이스홀더 치환 지원

**우리 방식**:
- 평면 구조 + 점(.) 구분자로 계층 표현
- `registerLocaleMessages()`로 병합 지원
- `getLocalizedMessage()`로 플레이스홀더 치환 지원

## 8. 숫자/날짜 포맷팅 고려사항

### 8.1 현재 접근 방식

현재 Barocss Editor는 **텍스트 메시지 번역에만 집중**합니다. 이는 VS Code와 동일한 접근 방식입니다.

**이유**:
- 가장 기본적이고 필수적인 기능
- 에디터 코어의 복잡도 최소화
- VS Code도 텍스트 번역에만 집중

### 8.2 숫자/날짜 포맷팅이 필요한 경우

에디터에서 숫자나 날짜를 표시해야 하는 경우:
- **페이지 번호**: "Page 1,234"
- **날짜/시간**: "January 15, 2024"
- **통계 정보**: "1,234 words"

### 8.3 권장 해결 방법

**브라우저의 `Intl` API 직접 사용** (별도 라이브러리 불필요):

```typescript
// 숫자 포맷팅
const pageNumber = new Intl.NumberFormat('ko-KR').format(1234);
// "1,234"

// 날짜 포맷팅
const date = new Intl.DateTimeFormat('ko-KR', {
  year: 'numeric',
  month: 'long',
  day: 'numeric'
}).format(new Date());
// "2024년 1월 15일"
```

**필요시 유틸리티 함수 제공** (향후):
- `@barocss/shared`에 `Intl` API 래퍼 함수 추가 가능
- 현재는 직접 `Intl` API 사용 권장

자세한 내용은 `i18n-number-formatting-analysis.md` 문서를 참고하세요.

## 9. 복수형(Pluralization) 처리

### 9.1 복수형이란?

숫자에 따라 단어의 형태가 달라지는 현상입니다:
- **영어**: "0 items", "1 item", "2 items"
- **러시아어**: 더 복잡한 규칙 (1, 2-4, 5+ 등)
- **한국어**: "0개", "1개", "2개" (상대적으로 단순)

### 9.2 현재 접근 방식

Barocss Editor는 **VS Code 방식**을 따릅니다: 메시지 ID를 분리하여 조건부로 선택합니다.

**메시지 정의**:
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

**사용 방법**:
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

### 9.3 장점

- **단순함**: 현재 구조와 완벽 호환
- **VS Code와 동일**: 검증된 접근 방식
- **충분함**: 대부분의 언어에서 잘 동작

### 9.4 향후 확장 가능성

복잡한 복수형 규칙(러시아어 등)이 필요한 경우:
- `@barocss/shared`에 `Intl.PluralRules` 기반 헬퍼 함수 추가 가능
- 브라우저 네이티브 API 활용 (번들 크기 증가 없음)

자세한 내용은 `i18n-number-formatting-analysis.md` 문서를 참고하세요.

## 10. 참고 자료

- [VS Code Localization](https://code.visualstudio.com/api/advanced-topics/extension-localization)
- [VS Code Language Packs](https://marketplace.visualstudio.com/vscode)
- [vscode-loc Repository](https://github.com/microsoft/vscode-loc)
- [i18next](https://www.i18next.com/) - 인기 있는 JavaScript i18n 라이브러리
- [Format.js](https://formatjs.io/) - React Intl의 기반 라이브러리
- [MDN: Intl API](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl) - 브라우저 네이티브 국제화 API

