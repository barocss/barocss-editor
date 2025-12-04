# Block Decorator 스펙

## 개요

Block Decorator는 block-level 요소에 적용되는 decorator로, target 요소의 형제 요소로 before/after 위치에 렌더링됩니다.

## 스펙

### 기본 속성

- **category**: `'block'` (필수)
- **position**: `'before' | 'after'` (block decorator는 주로 before/after 사용)
- **target**: `{ sid: string }` (startOffset/endOffset 없음 - 전체 요소 대상)
- **렌더링 위치**: target 요소의 형제 요소로 before/after에 삽입

### 동작 원리

1. **VNode 생성**: Block decorator는 target VNode의 `children` 배열에 추가됩니다
   - `position: 'before'` → `vnode.children.unshift(decoratorNode)`
   - `position: 'after'` → `vnode.children.push(decoratorNode)`

2. **DOM 렌더링**: Block decorator는 target 요소의 형제 요소로 렌더링됩니다
   - `position: 'before'` → target 요소 앞에 삽입
   - `position: 'after'` → target 요소 뒤에 삽입

3. **텍스트 처리**: Block decorator가 추가되어도 target 요소의 텍스트는 유지되어야 합니다
   - `vnode.text`가 설정된 경우에도 decorator가 children에 추가되면 텍스트가 유지되어야 함
   - 현재 구현에서는 이 부분에 문제가 있을 수 있음

## 현재 문제점

### 텍스트 렌더링 문제 (버그)

Block decorator가 추가될 때 paragraph의 텍스트가 사라지는 문제가 있습니다.

**원인 분석**:
1. `_buildElement`에서 `data('text')`를 처리할 때:
   - `orderedChildren.length === 1 && !orderedChildren[0].tag`이면 `vnode.text`로 설정
   - `vnode.children = []`로 설정
2. 그 후 `_processDecorators`가 호출되어 block decorator를 `vnode.children`에 추가
3. `reconciler.ts`의 `reconcileVNodeChildren`에서:
   - `vnode.text !== undefined && (!vnode.children || vnode.children.length === 0)`일 때만 텍스트를 설정
   - 하지만 block decorator가 children에 추가되면 `vnode.children.length > 0`이 되어 텍스트가 설정되지 않음

**현재 동작**:
- Block decorator가 추가되면 paragraph의 텍스트가 렌더링되지 않음
- Block decorator는 형제 요소로 올바르게 렌더링됨
- Paragraph 요소는 생성되지만 텍스트가 비어있음

**해결 방안**:
- `reconcileVNodeChildren`에서 `vnode.text`가 있고 children에 decorator만 있는 경우 텍스트를 설정하도록 수정
- 또는 `_processDecorators`에서 `vnode.text`가 있는 경우 텍스트를 children에 추가
- 또는 `_buildElement`에서 `_processDecorators` 호출 전에 텍스트를 children에 추가

## 테스트 시나리오

### 기본 시나리오

1. **before position**: Block decorator가 target 요소 앞에 렌더링
2. **after position**: Block decorator가 target 요소 뒤에 렌더링
3. **텍스트 유지**: Block decorator가 있어도 target 요소의 텍스트가 유지되어야 함

### 복잡한 시나리오

1. **여러 block decorator**: 여러 block decorator가 올바른 순서로 렌더링
2. **추가/제거**: Block decorator 추가/제거 시 target 요소의 텍스트가 유지
3. **Document 구조**: Document 내부의 paragraph에 block decorator 적용

## 실제 DOM 구조 (현재 구현)

```html
<!-- before position (현재 버그: paragraph 텍스트가 비어있음) -->
<p class="paragraph" data-bc-sid="p-1" data-bc-stype="paragraph"></p>
<div class="comment-decorator" data-decorator="true" data-decorator-category="block" data-decorator-position="before" data-decorator-sid="comment-1">COMMENT</div>
<p></p>

<!-- after position (현재 버그: paragraph 텍스트가 비어있음) -->
<p class="paragraph" data-bc-sid="p-1" data-bc-stype="paragraph"></p>
<div class="comment-decorator" data-decorator="true" data-decorator-category="block" data-decorator-position="after" data-decorator-sid="comment-1">COMMENT</div>
<p></p>
```

## 예상 DOM 구조 (수정 후)

```html
<!-- before position -->
<div class="comment-decorator" data-decorator="true" data-decorator-category="block" data-decorator-position="before" data-decorator-sid="comment-1">COMMENT</div>
<p class="paragraph" data-bc-sid="p-1" data-bc-stype="paragraph">Paragraph text</p>

<!-- after position -->
<p class="paragraph" data-bc-sid="p-1" data-bc-stype="paragraph">Paragraph text</p>
<div class="comment-decorator" data-decorator="true" data-decorator-category="block" data-decorator-position="after" data-decorator-sid="comment-1">COMMENT</div>
```

## 참고

- `packages/renderer-dom/src/vnode/factory.ts`: `_processDecorators` 메서드
- `packages/renderer-dom/src/vnode/decorator/processor.ts`: `insertDecoratorsIntoChildren` 메서드
- `packages/renderer-dom/src/reconcile/reconciler.ts`: `reconcileVNodeChildren` 메서드

