# Operations DSL Syntax Guide

## 개요

Barocss Editor의 Operations DSL은 선언적 방식으로 에디터 작업을 수행할 수 있는 도메인 특화 언어입니다. 이 가이드는 모든 DSL 함수들의 문법과 사용법을 정리합니다.

## 목차

1. [기본 구조](#1-기본-구조)
2. [노드 생성 DSL](#2-노드-생성-dsl)
3. [노드 조작 DSL](#3-노드-조작-dsl)
4. [텍스트 조작 DSL](#4-텍스트-조작-dsl)
5. [마크 조작 DSL](#5-마크-조작-dsl)
6. [구조 조작 DSL](#6-구조-조작-dsl)
7. [선택 영역 DSL](#7-선택-영역-dsl)
8. [Control DSL](#8-control-dsl)
9. [사용 예시](#9-사용-예시)

## 1. 기본 구조

### 1.1 Transaction 내에서 사용

```typescript
const result = await transaction(editor, [
  // DSL operations here
]).commit();
```

### 1.2 DSL 함수 분류

- **직접 호출**: `operationName(params)` - 모든 DSL 함수 지원
- **Control 체인**: `control(target, [operationName(params)])` - 일부 DSL 함수만 지원

### 1.3 Control 체인 지원 여부

**Control 체인을 지원하는 DSL**:
- 노드 조작: `moveNode`, `copyNode`, `cloneNodeWithChildren`
- 텍스트 조작: `insertText`, `replaceText`, `deleteTextRange`, `wrap`, `unwrap`, `indent`, `outdent`
- 마크 조작: `applyMark`, `removeMark`, `toggleMark`, `updateMark`
- 구조 조작: `addChild`, `removeChild`, `removeChildren`, `reorderChildren`, `moveChildren`
- 선택 영역: `selectRange`, `selectNode`

**Control 체인을 지원하지 않는 DSL**:
- 노드 생성: `create`, `deleteOp` - 새 노드 생성/삭제이므로 특정 노드를 대상으로 하지 않음
- 선택 영역: `clearSelection` - 전역적인 선택 영역 해제이므로 특정 노드를 대상으로 하지 않음

## 2. 노드 생성 DSL

### 2.1 `create(node, options?)`

**목적**: 새 노드 생성

**문법**:
```typescript
create(node: INode, options?: any)
```

**매개변수**:
- `node`: 생성할 노드 객체
- `options`: 선택적 옵션

**특징**: 
- `control` 체인을 지원하지 않음 (직접 호출만 가능)
- 새 노드를 생성하므로 특정 노드를 대상으로 하지 않음

**사용 예시**:
```typescript
// 기본 사용
create(textNode('inline-text', 'Hello World'))

// 옵션과 함께
create(textNode('inline-text', 'Hello'), { autoFocus: true })
```

### 2.2 `deleteOp(nodeId)`

**목적**: 노드 삭제

**문법**:
```typescript
deleteOp(nodeId: string)
```

**매개변수**:
- `nodeId`: 삭제할 노드의 ID

**특징**: 
- `control` 체인을 지원하지 않음 (직접 호출만 가능)
- 삭제할 노드 ID를 직접 지정해야 함

**사용 예시**:
```typescript
deleteOp('node-123')
```

## 3. 노드 조작 DSL

### 3.1 `moveNode(nodeId, newParentId, position?)`

**목적**: 노드를 다른 부모로 이동

**문법**:
```typescript
moveNode(nodeId: string, newParentId: string, position?: number)
```

**매개변수**:
- `nodeId`: 이동할 노드 ID
- `newParentId`: 새로운 부모 노드 ID
- `position`: 삽입 위치 (선택)

**사용 예시**:
```typescript
// Control 체인: child-sid를 new-parent-sid로 이동
control('child-sid', [moveNode('new-parent-sid', 0)])

// 직접 호출: node-123을 parent-456로 이동
moveNode('node-123', 'parent-456', 2)
```

### 3.2 `copyNode(nodeId, newParentId?)`

**목적**: 노드 복사

**문법**:
```typescript
copyNode(nodeId: string, newParentId?: string)
```

**매개변수**:
- `nodeId`: 복사할 노드 ID
- `newParentId`: 새로운 부모 노드 ID (선택)

**사용 예시**:
```typescript
// Control 체인: source-node-sid를 복사해서 target-parent-sid에 추가
control('source-node-sid', [copyNode('target-parent-sid')])

// 직접 호출: node-123을 복사해서 parent-456에 추가
copyNode('node-123', 'parent-456')
```

### 3.3 `cloneNodeWithChildren(nodeId, newParentId?)`

**목적**: 노드와 자식들을 모두 복사

**문법**:
```typescript
cloneNodeWithChildren(nodeId: string, newParentId?: string)
```

**매개변수**:
- `nodeId`: 복사할 노드 ID
- `newParentId`: 새로운 부모 노드 ID (선택)

**사용 예시**:
```typescript
// Control 체인: source-node-sid를 자식들과 함께 복사해서 target-parent-sid에 추가
control('source-node-sid', [cloneNodeWithChildren('target-parent-sid')])

// 직접 호출: node-123을 자식들과 함께 복사해서 parent-456에 추가
cloneNodeWithChildren('node-123', 'parent-456')
```

## 4. 텍스트 조작 DSL

### 4.1 `insertText(pos, text)` / `insertText(nodeId, pos, text)`

**목적**: 텍스트 삽입

**문법**:
```typescript
// Control 체인에서 사용
insertText(pos: number, text: string)

// 직접 호출
insertText(nodeId: string, pos: number, text: string)
```

**매개변수**:
- `pos`: 삽입 위치
- `text`: 삽입할 텍스트
- `nodeId`: 대상 노드 ID (직접 호출 시)

**사용 예시**:
```typescript
// Control 체인
control('node-sid', [insertText(5, 'Hello')])

// 직접 호출
insertText('node-123', 5, 'Hello')
```

### 4.2 `replaceText(start, end, newText)` / `replaceText(nodeId, start, end, newText)`

**목적**: 텍스트 교체

**문법**:
```typescript
// Control 체인에서 사용
replaceText(start: number, end: number, newText: string)

// 직접 호출
replaceText(nodeId: string, start: number, end: number, newText: string)
```

**매개변수**:
- `start`: 시작 위치
- `end`: 끝 위치
- `newText`: 새로운 텍스트
- `nodeId`: 대상 노드 ID (직접 호출 시)

**사용 예시**:
```typescript
// Control 체인
control('node-sid', [replaceText(0, 5, 'Hello')])

// 직접 호출
replaceText('node-123', 0, 5, 'Hello')
```

### 4.3 `deleteTextRange(start, end)` / `deleteTextRange(nodeId, start, end)`

**목적**: 텍스트 범위 삭제

**문법**:
```typescript
// Control 체인에서 사용
deleteTextRange(start: number, end: number)

// 직접 호출
deleteTextRange(nodeId: string, start: number, end: number)
```

**매개변수**:
- `start`: 시작 위치
- `end`: 끝 위치
- `nodeId`: 대상 노드 ID (직접 호출 시)

**사용 예시**:
```typescript
// Control 체인
control('node-sid', [deleteTextRange(0, 5)])

// 직접 호출
deleteTextRange('node-123', 0, 5)
```

### 4.4 `wrap(start, end, prefix, suffix)` / `wrap(nodeId, start, end, prefix, suffix)`

**목적**: 텍스트를 접두/접미 문자열로 감싸기

**문법**:
```typescript
// Control 체인에서 사용
wrap(start: number, end: number, prefix: string, suffix: string)

// 직접 호출
wrap(nodeId: string, start: number, end: number, prefix: string, suffix: string)
```

**매개변수**:
- `start`: 시작 위치
- `end`: 끝 위치
- `prefix`: 접두 문자열
- `suffix`: 접미 문자열
- `nodeId`: 대상 노드 ID (직접 호출 시)

**사용 예시**:
```typescript
// Control 체인
control('node-sid', [wrap(0, 5, '**', '**')])

// 직접 호출
wrap('node-123', 0, 5, '**', '**')
```

### 4.5 `unwrap(start, end, prefix, suffix)` / `unwrap(nodeId, start, end, prefix, suffix)`

**목적**: 텍스트에서 접두/접미 문자열 제거

**문법**:
```typescript
// Control 체인에서 사용
unwrap(start: number, end: number, prefix: string, suffix: string)

// 직접 호출
unwrap(nodeId: string, start: number, end: number, prefix: string, suffix: string)
```

**매개변수**:
- `start`: 시작 위치
- `end`: 끝 위치
- `prefix`: 제거할 접두 문자열
- `suffix`: 제거할 접미 문자열
- `nodeId`: 대상 노드 ID (직접 호출 시)

**사용 예시**:
```typescript
// Control 체인
control('node-sid', [unwrap(0, 7, '**', '**')])

// 직접 호출
unwrap('node-123', 0, 7, '**', '**')
```

### 4.6 `indent(start, end, indentStr?)` / `indent(nodeId, start, end, indentStr?)`

**목적**: 텍스트 들여쓰기

**문법**:
```typescript
// Control 체인에서 사용
indent(start: number, end: number, indentStr?: string)

// 직접 호출
indent(nodeId: string, start: number, end: number, indentStr?: string)
```

**매개변수**:
- `start`: 시작 위치
- `end`: 끝 위치
- `indentStr`: 들여쓰기 문자열 (기본값: '  ')
- `nodeId`: 대상 노드 ID (직접 호출 시)

**사용 예시**:
```typescript
// Control 체인
control('node-sid', [indent(0, 10, '  ')])

// 직접 호출
indent('node-123', 0, 10, '  ')
```

### 4.7 `outdent(start, end, indentStr?)` / `outdent(nodeId, start, end, indentStr?)`

**목적**: 텍스트 내어쓰기

**문법**:
```typescript
// Control 체인에서 사용
outdent(start: number, end: number, indentStr?: string)

// 직접 호출
outdent(nodeId: string, start: number, end: number, indentStr?: string)
```

**매개변수**:
- `start`: 시작 위치
- `end`: 끝 위치
- `indentStr`: 제거할 들여쓰기 문자열 (기본값: '  ')
- `nodeId`: 대상 노드 ID (직접 호출 시)

**사용 예시**:
```typescript
// Control 체인
control('node-sid', [outdent(0, 10, '  ')])

// 직접 호출
outdent('node-123', 0, 10, '  ')
```

## 5. 마크 조작 DSL

### 5.1 `applyMark(start, end, markType, attrs?)` / `applyMark(nodeId, start, end, markType, attrs?)`

**목적**: 텍스트에 마크 적용

**문법**:
```typescript
// Control 체인에서 사용
applyMark(start: number, end: number, markType: string, attrs?: any)

// 직접 호출
applyMark(nodeId: string, start: number, end: number, markType: string, attrs?: any)
```

**매개변수**:
- `start`: 시작 위치
- `end`: 끝 위치
- `markType`: 마크 타입
- `attrs`: 마크 속성 (선택)
- `nodeId`: 대상 노드 ID (직접 호출 시)

**사용 예시**:
```typescript
// Control 체인
control('node-sid', [applyMark(0, 5, 'bold', { weight: 'bold' })])

// 직접 호출
applyMark('node-123', 0, 5, 'bold', { weight: 'bold' })
```

### 5.2 `removeMark(markType, range)` / `removeMark(nodeId, markType, range)`

**목적**: 텍스트에서 마크 제거

**문법**:
```typescript
// Control 체인에서 사용
removeMark(markType: string, range: { start: number; end: number })

// 직접 호출
removeMark(nodeId: string, markType: string, range: { start: number; end: number })
```

**매개변수**:
- `markType`: 제거할 마크 타입
- `range`: 마크 제거 범위
- `nodeId`: 대상 노드 ID (직접 호출 시)

**사용 예시**:
```typescript
// Control 체인
control('node-sid', [removeMark('bold', { start: 0, end: 5 })])

// 직접 호출
removeMark('node-123', 'bold', { start: 0, end: 5 })
```

### 5.3 `toggleMark(markType, range, attrs?)` / `toggleMark(nodeId, markType, range, attrs?)`

**목적**: 마크 토글 (있으면 제거, 없으면 적용)

**문법**:
```typescript
// Control 체인에서 사용
toggleMark(markType: string, range: { start: number; end: number }, attrs?: any)

// 직접 호출
toggleMark(nodeId: string, markType: string, range: { start: number; end: number }, attrs?: any)
```

**매개변수**:
- `markType`: 토글할 마크 타입
- `range`: 토글 범위
- `attrs`: 마크 속성 (선택)
- `nodeId`: 대상 노드 ID (직접 호출 시)

**사용 예시**:
```typescript
// Control 체인
control('node-sid', [toggleMark('bold', { start: 0, end: 5 })])

// 직접 호출
toggleMark('node-123', 'bold', { start: 0, end: 5 })
```

### 5.4 `updateMark(markType, range, newAttrs)` / `updateMark(nodeId, markType, range, newAttrs)`

**목적**: 기존 마크의 속성 업데이트

**문법**:
```typescript
// Control 체인에서 사용
updateMark(markType: string, range: { start: number; end: number }, newAttrs: any)

// 직접 호출
updateMark(nodeId: string, markType: string, range: { start: number; end: number }, newAttrs: any)
```

**매개변수**:
- `markType`: 업데이트할 마크 타입
- `range`: 마크 범위
- `newAttrs`: 새로운 마크 속성
- `nodeId`: 대상 노드 ID (직접 호출 시)

**사용 예시**:
```typescript
// Control 체인
control('node-sid', [updateMark('bold', { start: 0, end: 5 }, { weight: 'bolder' })])

// 직접 호출
updateMark('node-123', 'bold', { start: 0, end: 5 }, { weight: 'bolder' })
```

## 6. 구조 조작 DSL

### 6.1 `addChild(child, position?)` / `addChild(parentId, child, position?)`

**목적**: 자식 노드 추가

**문법**:
```typescript
// Control 체인에서 사용
addChild(child: INode, position?: number)

// 직접 호출
addChild(parentId: string, child: INode, position?: number)
```

**매개변수**:
- `child`: 추가할 자식 노드
- `position`: 삽입 위치 (선택)
- `parentId`: 부모 노드 ID (직접 호출 시)

**사용 예시**:
```typescript
// Control 체인
control('parent-sid', [addChild(textNode('inline-text', 'New child'), 0)])

// 직접 호출
addChild('parent-123', textNode('inline-text', 'New child'), 0)
```

### 6.2 `removeChild(childId)` / `removeChild(parentId, childId)`

**목적**: 자식 노드 제거

**문법**:
```typescript
// Control 체인에서 사용
removeChild(childId: string)

// 직접 호출
removeChild(parentId: string, childId: string)
```

**매개변수**:
- `childId`: 제거할 자식 노드 ID
- `parentId`: 부모 노드 ID (직접 호출 시)

**사용 예시**:
```typescript
// Control 체인
control('parent-sid', [removeChild('child-123')])

// 직접 호출
removeChild('parent-123', 'child-123')
```

### 6.3 `removeChildren(childIds)` / `removeChildren(parentId, childIds)`

**목적**: 여러 자식 노드 제거

**문법**:
```typescript
// Control 체인에서 사용
removeChildren(childIds: string[])

// 직접 호출
removeChildren(parentId: string, childIds: string[])
```

**매개변수**:
- `childIds`: 제거할 자식 노드 ID 배열
- `parentId`: 부모 노드 ID (직접 호출 시)

**사용 예시**:
```typescript
// Control 체인
control('parent-sid', [removeChildren(['child-1', 'child-2', 'child-3'])])

// 직접 호출
removeChildren('parent-123', ['child-1', 'child-2', 'child-3'])
```

### 6.4 `reorderChildren(childIds)` / `reorderChildren(parentId, childIds)`

**목적**: 자식 노드 순서 변경

**문법**:
```typescript
// Control 체인에서 사용
reorderChildren(childIds: string[])

// 직접 호출
reorderChildren(parentId: string, childIds: string[])
```

**매개변수**:
- `childIds`: 새로운 순서의 자식 노드 ID 배열
- `parentId`: 부모 노드 ID (직접 호출 시)

**사용 예시**:
```typescript
// Control 체인
control('parent-sid', [reorderChildren(['child-3', 'child-1', 'child-2'])])

// 직접 호출
reorderChildren('parent-123', ['child-3', 'child-1', 'child-2'])
```

### 6.5 `moveChildren(toParentId, childIds, position?)` / `moveChildren(fromParentId, toParentId, childIds, position?)`

**목적**: 자식 노드들을 다른 부모로 이동

**문법**:
```typescript
// Control 체인에서 사용
moveChildren(toParentId: string, childIds: string[], position?: number)

// 직접 호출
moveChildren(fromParentId: string, toParentId: string, childIds: string[], position?: number)
```

**매개변수**:
- `toParentId`: 대상 부모 노드 ID
- `childIds`: 이동할 자식 노드 ID 배열
- `position`: 삽입 위치 (선택)
- `fromParentId`: 원본 부모 노드 ID (직접 호출 시)

**사용 예시**:
```typescript
// Control 체인
control('from-parent-sid', [moveChildren('to-parent-sid', ['child-1', 'child-2'], 0)])

// 직접 호출
moveChildren('from-parent-123', 'to-parent-456', ['child-1', 'child-2'], 0)
```

## 7. 선택 영역 DSL

### 7.1 `selectRange(anchor, focus)` / `selectRange(nodeId, anchor, focus)`

**목적**: 텍스트 범위 선택

**문법**:
```typescript
// Control 체인에서 사용
selectRange(anchor: { nodeId: string; offset: number }, focus: { nodeId: string; offset: number })

// 직접 호출
selectRange(nodeId: string, anchor: { nodeId: string; offset: number }, focus: { nodeId: string; offset: number })
```

**매개변수**:
- `anchor`: 선택 시작점
- `focus`: 선택 끝점
- `nodeId`: 대상 노드 ID (직접 호출 시)

**사용 예시**:
```typescript
// Control 체인
control('node-sid', [selectRange(
  { nodeId: 'node-1', offset: 0 },
  { nodeId: 'node-1', offset: 5 }
)])

// 직접 호출
selectRange('node-123', 
  { nodeId: 'node-1', offset: 0 },
  { nodeId: 'node-1', offset: 5 }
)
```

### 7.2 `selectNode()` / `selectNode(nodeId)`

**목적**: 노드 전체 선택

**문법**:
```typescript
// Control 체인에서 사용
selectNode()

// 직접 호출
selectNode(nodeId: string)
```

**매개변수**:
- `nodeId`: 선택할 노드 ID (직접 호출 시)

**사용 예시**:
```typescript
// Control 체인
control('node-sid', [selectNode()])

// 직접 호출
selectNode('node-123')
```

### 7.3 `clearSelection()`

**목적**: 선택 영역 해제

**문법**:
```typescript
clearSelection()
```

**매개변수**: 없음

**특징**: 
- `control` 체인을 지원하지 않음 (직접 호출만 가능)
- 전역적인 선택 영역 해제이므로 특정 노드를 대상으로 하지 않음

**사용 예시**:
```typescript
clearSelection()
```

## 8. Control DSL

### 8.1 `control(target, actions)`

**목적**: 여러 작업을 특정 노드에 대해 연속 실행

**문법**:
```typescript
control(target: string, actions: Array<{ type: string; payload?: any }>)
```

**매개변수**:
- `target`: 대상 노드 ID
- `actions`: 실행할 작업 배열

**사용 예시**:
```typescript
// 여러 작업을 한 번에
control('node-sid', [
  setText('New text'),
  setAttrs({ color: 'red' }),
  applyMark(0, 5, 'bold')
])

// 복잡한 작업 체인
control('parent-sid', [
  addChild(textNode('inline-text', 'New child'), 0),
  removeChild('old-child-sid'),
  reorderChildren(['child-1', 'child-2', 'child-3'])
])
```

## 9. 사용 예시

### 9.1 기본 텍스트 편집

```typescript
const result = await transaction(editor, [
  // 텍스트 삽입
  insertText('node-123', 5, 'Hello'),
  
  // 텍스트 교체
  replaceText('node-123', 0, 5, 'Hi'),
  
  // 마크 적용
  applyMark('node-123', 0, 2, 'bold', { weight: 'bold' })
]).commit();
```

### 9.2 Control 체인 사용

```typescript
const result = await transaction(editor, [
  // 여러 작업을 한 노드에 대해 연속 실행
  control('node-123', [
    setText('Updated text'),
    setAttrs({ color: 'blue', size: 'large' }),
    applyMark(0, 5, 'italic'),
    wrap(0, 5, '**', '**')
  ])
]).commit();
```

### 9.3 구조 조작

```typescript
const result = await transaction(editor, [
  // 노드 생성
  create(textNode('inline-text', 'New node')),
  
  // 자식 추가
  control('parent-123', [
    addChild(textNode('inline-text', 'Child 1'), 0),
    addChild(textNode('inline-text', 'Child 2'), 1)
  ]),
  
  // 자식 순서 변경
  control('parent-123', [
    reorderChildren(['child-2', 'child-1'])
  ])
]).commit();
```

### 9.4 복합 작업

```typescript
const result = await transaction(editor, [
  // 텍스트 편집
  control('text-node-123', [
    replaceText(0, 10, 'New content'),
    applyMark(0, 4, 'bold'),
    wrap(0, 4, '**', '**')
  ]),
  
  // 구조 변경
  control('parent-456', [
    removeChild('old-child'),
    addChild(textNode('inline-text', 'New child'), 0)
  ]),
  
  // 선택 영역 설정
  selectRange(
    { nodeId: 'text-node-123', offset: 0 },
    { nodeId: 'text-node-123', offset: 4 }
  )
]).commit();
```

---

이 가이드는 Barocss Editor의 모든 Operations DSL 문법을 정리한 것입니다. 각 DSL 함수의 목적, 문법, 매개변수, 사용 예시를 포함하여 개발자가 쉽게 참조할 수 있도록 구성했습니다.
