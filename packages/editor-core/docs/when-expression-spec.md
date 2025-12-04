# When Expression Parser Spec (`@barocss/editor-core`)

## 개요

`when-expression` 파서는 VS Code의 when clause 스펙을 기반으로 구현된 조건식 평가 엔진입니다. Keybinding의 `when` 속성에서 사용되며, context key를 기반으로 불리언 표현식을 평가합니다.

**참고**: [VS Code When Clause Contexts](https://code.visualstudio.com/api/references/when-clause-contexts)

---

## API

### `evaluateWhenExpression(expr: string, context: Record<string, unknown>): boolean`

when 표현식을 평가하여 불리언 값을 반환합니다.

```typescript
import { evaluateWhenExpression } from '@barocss/editor-core';

const context = {
  editorFocus: true,
  editorEditable: true,
  selectionEmpty: false
};

const result = evaluateWhenExpression('editorFocus && editorEditable', context);
// true
```

**파라미터**:
- `expr`: 평가할 when 표현식 문자열
- `context`: context key와 값의 맵핑 객체

**반환값**: 표현식 평가 결과 (`true` 또는 `false`)

**특수 케이스**:
- 빈 문자열 또는 공백만 있는 경우: 항상 `true` 반환
- 정의되지 않은 context key: `false`로 간주

---

## 지원하는 연산자

### 1. Logical Operators (논리 연산자)

| 연산자 | 기호 | 예시 | 우선순위 |
|--------|------|------|----------|
| Not | `!` | `!editorFocus` | 높음 |
| And | `&&` | `editorFocus && editorEditable` | 중간 |
| Or | `\|\|` | `editorFocus \|\| editorEditable` | 낮음 |

**우선순위 규칙**:
- `!` > `&&` > `||`
- 예: `!foo && bar` → `(!foo) && bar`
- 예: `foo || bar && baz` → `foo || (bar && baz)`

**예시**:
```typescript
evaluateWhenExpression('editorFocus && editorEditable', {
  editorFocus: true,
  editorEditable: true
}); // true

evaluateWhenExpression('!editorReadonly', {
  editorReadonly: false
}); // true

evaluateWhenExpression('editorFocus || editorEditable', {
  editorFocus: false,
  editorEditable: true
}); // true
```

---

### 2. Equality Operators (동등 연산자)

| 연산자 | 기호 | 예시 |
|--------|------|------|
| Equality | `==` | `selectionType == 'range'` |
| Inequality | `!=` | `selectionType != 'node'` |

**참고**: `===`와 `!==`도 지원하며, `==`와 `!=`와 동일하게 동작합니다.

**문자열 리터럴**:
- 단일 따옴표(`'`)로 감싸야 합니다
- 공백이 포함된 문자열도 따옴표로 감싸야 합니다
- 이스케이프: `\'` (따옴표), `\\` (백슬래시)

**예시**:
```typescript
evaluateWhenExpression("selectionType == 'range'", {
  selectionType: 'range'
}); // true

evaluateWhenExpression("resourceFilename == 'My New File.md'", {
  resourceFilename: 'My New File.md'
}); // true

evaluateWhenExpression("selectionType == 'It\\'s a test'", {
  selectionType: "It's a test"
}); // true
```

---

### 3. Comparison Operators (비교 연산자)

| 연산자 | 기호 | 예시 | 주의사항 |
|--------|------|------|----------|
| Greater than | `>` | `workspaceFolderCount > 1` | 좌우 공백 필요 |
| Greater than or equal | `>=` | `workspaceFolderCount >= 1` | 좌우 공백 필요 |
| Less than | `<` | `workspaceFolderCount < 2` | 좌우 공백 필요 |
| Less than or equal | `<=` | `workspaceFolderCount <= 2` | 좌우 공백 필요 |

**동작**:
- 좌우 피연산자를 숫자로 변환하여 비교합니다
- 숫자가 아닌 경우 `false`를 반환합니다

**숫자 리터럴 지원**:
- 정수: `1`, `42`, `100`
- 소수점: `0.5`, `1.5`, `10.99`
- `.5` 형식 (0 생략): `.5`는 `0.5`로 해석됩니다
- context 값도 소수점 숫자를 지원합니다

**예시**:
```typescript
evaluateWhenExpression('workspaceFolderCount > 1', {
  workspaceFolderCount: 2
}); // true

evaluateWhenExpression('workspaceFolderCount >= 1', {
  workspaceFolderCount: 1
}); // true

// 소수점 숫자 리터럴
evaluateWhenExpression('progress > 0.5', {
  progress: 0.75
}); // true

evaluateWhenExpression('progress > .5', {
  progress: 0.6
}); // true (.5는 0.5로 해석)

// context 값이 소수점인 경우
evaluateWhenExpression('progress > 0', {
  progress: 0.1
}); // true

evaluateWhenExpression('0.5 < progress', {
  progress: 0.75
}); // true

evaluateWhenExpression('workspaceFolderCount < 2', {
  workspaceFolderCount: 1
}); // true

evaluateWhenExpression('editorFocus > 1', {
  editorFocus: true
}); // false (비숫자 비교)
```

---

### 4. Match Operator (정규식 매칭)

| 연산자 | 기호 | 예시 |
|--------|------|------|
| Matches | `=~` | `resourceFilename =~ /docker/` |

**정규식 리터럴 형식**:
- `/pattern/flags` 형식
- 플래그: `i` (case-insensitive), `s` (dotall), `m` (multiline), `u` (unicode)
- `g`, `y` 플래그는 무시됩니다

**이스케이프 규칙**:
- JSON 문자열에서는 백슬래시를 이중 이스케이프해야 합니다
- 예: `/file:\/\/\/` → JSON에서는 `"/file:\\/\\//"`

**예시**:
```typescript
evaluateWhenExpression("resourceFilename =~ /docker/", {
  resourceFilename: 'docker-compose.yml'
}); // true

evaluateWhenExpression("resourceFilename =~ /DOCKER/i", {
  resourceFilename: 'docker-compose.yml'
}); // true (case-insensitive)

evaluateWhenExpression("resourceScheme =~ /^untitled$|^file$/", {
  resourceScheme: 'file'
}); // true

evaluateWhenExpression("resourceScheme =~ /file:\\/\\//", {
  resourceScheme: 'file://'
}); // true
```

---

### 5. In / Not In Operators (멤버십 연산자)

| 연산자 | 기호 | 예시 |
|--------|------|------|
| In | `in` | `resourceFilename in supportedFolders` |
| Not in | `not in` | `resourceFilename not in supportedFolders` |

**동작**:
- 좌측 값이 우측 배열/객체에 포함되어 있는지 확인합니다
- 배열: `Array.includes()` 사용
- 객체: `in` 연산자 사용 (키 존재 여부)
- 배열/객체가 아닌 경우 `false` 반환

**예시**:
```typescript
// 배열
evaluateWhenExpression("resourceFilename in supportedFolders", {
  resourceFilename: 'test',
  supportedFolders: ['test', 'foo', 'bar']
}); // true

// 객체
evaluateWhenExpression("resourceFilename in supportedFolders", {
  resourceFilename: 'test',
  supportedFolders: { test: true, foo: 'anything', bar: 123 }
}); // true

// not in
evaluateWhenExpression("resourceFilename not in supportedFolders", {
  resourceFilename: 'baz',
  supportedFolders: ['test', 'foo', 'bar']
}); // true
```

---

## 리터럴

### Boolean Literals

```typescript
evaluateWhenExpression('true', {}); // true
evaluateWhenExpression('false', {}); // false
```

### String Literals

단일 따옴표로 감싼 문자열:

```typescript
evaluateWhenExpression("selectionType == 'range'", {
  selectionType: 'range'
}); // true
```

### Number Literals

정수 및 소수점 숫자를 지원합니다:

**지원 형식**:
- 정수: `1`, `42`, `100`
- 소수점: `0.5`, `1.5`, `10.99`
- `.5` 형식 (0 생략): `.5`는 `0.5`로 자동 해석됩니다 (VS Code 호환)

**예시**:
```typescript
// 정수
evaluateWhenExpression('workspaceFolderCount > 1', {
  workspaceFolderCount: 2
}); // true

// 소수점 숫자 리터럴
evaluateWhenExpression('progress > 0.5', {
  progress: 0.75
}); // true

evaluateWhenExpression('progress > .5', {
  progress: 0.6
}); // true (.5는 0.5로 해석)

// context 값이 소수점인 경우
evaluateWhenExpression('progress > 0', {
  progress: 0.1
}); // true

evaluateWhenExpression('0.5 < progress', {
  progress: 0.75
}); // true

// 양쪽 모두 소수점
evaluateWhenExpression('progress > 0.3', {
  progress: 0.7
}); // true
```

---

## 괄호 (Parentheses)

괄호를 사용하여 연산자 우선순위를 조정할 수 있습니다:

```typescript
evaluateWhenExpression('(editorFocus || editorEditable) && selectionEmpty', {
  editorFocus: false,
  editorEditable: true,
  selectionEmpty: true
}); // true

evaluateWhenExpression('!(editorFocus || editorEditable)', {
  editorFocus: true,
  editorEditable: false
}); // false
```

---

## Context Keys

Context key는 `context` 객체에서 조회됩니다:

```typescript
const context = {
  editorFocus: true,
  editorEditable: true,
  selectionEmpty: false,
  selectionType: 'range',
  workspaceFolderCount: 2
};

evaluateWhenExpression('editorFocus && !selectionEmpty', context);
```

**정의되지 않은 key**:
- `undefined` 또는 존재하지 않는 key는 `false`로 간주됩니다
- `null` 값도 `false`로 간주됩니다

---

## 복잡한 표현식 예시

### VS Code 스타일 when clause

```typescript
evaluateWhenExpression("debuggersAvailable && !inDebugMode", {
  debuggersAvailable: true,
  inDebugMode: false
}); // true
```

### 에디터 포커스 및 편집 가능 여부 체크

```typescript
evaluateWhenExpression("editorFocus && editorEditable && !selectionEmpty", {
  editorFocus: true,
  editorEditable: true,
  selectionEmpty: false
}); // true
```

### 선택 타입 체크

```typescript
evaluateWhenExpression("selectionType == 'range' && editorFocus", {
  selectionType: 'range',
  editorFocus: true
}); // true

evaluateWhenExpression("selectionType == 'node' || selectionType == 'multi-node'", {
  selectionType: 'node'
}); // true
```

---

## 엣지 케이스

### 빈 문자열

```typescript
evaluateWhenExpression('', {}); // true (항상 true)
evaluateWhenExpression('   ', {}); // true (공백만 있어도 true)
```

### 정의되지 않은 context key

```typescript
evaluateWhenExpression('undefinedKey', {}); // false
evaluateWhenExpression('undefinedKey || editorFocus', {
  editorFocus: true
}); // true
```

### null 값

```typescript
evaluateWhenExpression('nullKey', {
  nullKey: null
}); // false

evaluateWhenExpression("nullKey == null", {
  nullKey: null
}); // true (문자열 'null'과 비교)
```

---

## 구현 위치

- **소스 코드**: `packages/editor-core/src/when-expression.ts`
- **테스트 코드**: `packages/editor-core/test/when-expression.test.ts`
- **사용처**: `KeybindingRegistry`의 `when` 조건 평가

---

## VS Code 스펙 호환성

이 파서는 VS Code의 when clause 스펙을 기반으로 구현되었으며, 다음 기능을 지원합니다:

✅ Logical operators (`!`, `&&`, `||`)  
✅ Equality operators (`==`, `!=`, `===`, `!==`)  
✅ Comparison operators (`>`, `>=`, `<`, `<=`)  
✅ Match operator (`=~`) with regex literals  
✅ In/Not in operators (`in`, `not in`)  
✅ Parentheses for precedence  
✅ String literals with single quotes  
✅ Number literals  
✅ Boolean literals (`true`, `false`)  

**차이점**:
- VS Code의 일부 context key (예: `editorLangId`, `resourceExtname`)는 `editor-core`에 포함되지 않습니다
- `editor-core`는 에디터 내부 상태에만 집중합니다

---

## 관련 문서

- [Keyboard Shortcut Spec](./keyboard-shortcut-spec.md) - Keybinding 시스템 전체 스펙
- [VS Code When Clause Contexts](https://code.visualstudio.com/api/references/when-clause-contexts) - VS Code 공식 문서

