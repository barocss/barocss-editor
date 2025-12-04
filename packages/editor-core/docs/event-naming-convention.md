# 이벤트 네이밍 컨벤션

Barocss Editor는 체계적이고 확장 가능한 이벤트 시스템을 위해 네임스페이스 기반의 이벤트 네이밍 컨벤션을 사용합니다.

## 📋 기본 구조

```
[namespace]:[category].[action]
```

## 🏷️ 네임스페이스 분류

### 1. Editor Core 이벤트 (`editor:`)
에디터의 핵심 기능과 관련된 이벤트들입니다.

```typescript
// 콘텐츠 관련
'editor:content.change'     // 콘텐츠 변경
'editor:node.create'        // 노드 생성
'editor:node.update'        // 노드 업데이트
'editor:node.delete'        // 노드 삭제

// 선택 관련
'editor:selection.change'   // 선택 변경
'editor:selection.focus'    // 선택 포커스
'editor:selection.blur'     // 선택 블러

// 명령어 관련
'editor:command.execute'    // 명령어 실행
'editor:command.before'     // 명령어 실행 전
'editor:command.after'      // 명령어 실행 후

// 히스토리 관련
'editor:history.change'     // 히스토리 변경
'editor:history.undo'       // 실행 취소
'editor:history.redo'       // 다시 실행

// 기타
'editor:editable.change'    // 편집 가능 상태 변경
'editor:create'             // 에디터 생성
'editor:destroy'            // 에디터 파괴
```

### 2. Error 이벤트 (`error:`)
에러와 관련된 이벤트들입니다.

```typescript
'error:selection'    // 선택 관련 에러
'error:command'      // 명령어 관련 에러
'error:extension'    // 확장 관련 에러
```

### 3. Extension 이벤트 (`extension:`)
확장 기능과 관련된 이벤트들입니다.

```typescript
'extension:add'      // 확장 추가
'extension:remove'   // 확장 제거
'extension:enable'   // 확장 활성화
'extension:disable'  // 확장 비활성화
```

### 4. Plugin 이벤트 (`plugin:`)
플러그인과 관련된 커스텀 이벤트들입니다.

```typescript
'plugin:custom'           // 커스텀 플러그인
'plugin:myPlugin.action'  // 특정 플러그인의 액션
'plugin:save.auto'        // 자동 저장 플러그인
```

### 5. User 이벤트 (`user:`)
사용자 액션과 관련된 커스텀 이벤트들입니다.

```typescript
'user:save'        // 사용자 저장
'user:action'      // 사용자 액션
'user:keyboard'    // 키보드 입력
'user:mouse'       // 마우스 액션
```

## 🎯 사용 예시

### 기본 사용법

```typescript
import { Editor } from '@barocss/editor-core';

const editor = new Editor({
  contentEditableElement: document.getElementById('editor'),
  dataStore: dataStore,
  schema: schema
});

// Editor Core 이벤트
editor.on('editor:content.change', (data) => {
  console.log('Content changed:', data.content);
});

editor.on('editor:selection.change', (data) => {
  console.log('Selection changed:', data.selection);
});

// Error 이벤트
editor.on('error:selection', (data) => {
  console.error('Selection error:', data.error);
});

// Extension 이벤트
editor.on('extension:add', (data) => {
  console.log('Extension added:', data.extension.name);
});

// Plugin 이벤트 (커스텀)
editor.on('plugin:myPlugin.save', (data) => {
  console.log('Plugin save:', data);
});

// User 이벤트 (커스텀)
editor.on('user:customAction', (data) => {
  console.log('User action:', data);
});
```

### 타입 안전성

```typescript
// TypeScript에서 타입 안전성 보장
editor.on('editor:selection.change', (data) => {
  // data는 자동으로 { selection: SelectionState; oldSelection: SelectionState } 타입
  console.log(data.selection.textContent);
  console.log(data.oldSelection.textContent);
});

editor.on('error:selection', (data) => {
  // data는 자동으로 { error: SelectionError } 타입
  console.error(data.error.code, data.error.message);
});
```

## 🔧 확장 방법

### 새로운 네임스페이스 추가

```typescript
// types.ts에서 새로운 네임스페이스 추가
export type EditorEventType = 
  | 'editor:content.change'
  | 'myapp:feature.action'  // 새로운 네임스페이스
  | `myapp:${string}`       // 동적 네임스페이스
  | string;

// EditorEvents 인터페이스에 타입 정의
export interface EditorEvents {
  'editor:content.change': { content: DocumentState; transaction: Transaction };
  'myapp:feature.action': { feature: string; action: string; data: any };
  [K: `myapp:${string}`]: any;
  [K: string]: any;
}
```

### 커스텀 이벤트 사용

```typescript
// 완전히 자유로운 커스텀 이벤트
editor.on('myCustomEvent', (data) => {
  console.log('Custom event:', data);
});

editor.emit('myCustomEvent', { message: 'Hello World' });
```

## 📝 네이밍 규칙

1. **네임스페이스**: 소문자, 콜론으로 구분
2. **카테고리**: 소문자, 점으로 구분
3. **액션**: 소문자, 점으로 구분
4. **일관성**: 동일한 카테고리의 이벤트는 동일한 네임스페이스 사용
5. **명확성**: 이벤트 이름만 봐도 무엇을 하는지 알 수 있어야 함

## 🚀 장점

- **체계적**: 네임스페이스로 이벤트 그룹화
- **확장 가능**: 새로운 네임스페이스 쉽게 추가
- **타입 안전**: TypeScript 타입 체크
- **직관적**: 이벤트 이름만 봐도 용도 파악 가능
- **유연성**: 커스텀 이벤트 자유롭게 사용
