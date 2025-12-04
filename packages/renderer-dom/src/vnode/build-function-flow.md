# build() 함수 분기 흐름 가이드

## 핵심 원칙

**`build()` 함수의 첫 번째 호출은 무조건 component만 가능합니다.**
- `build(nodeType, data, options)`에서 `nodeType`은 항상 등록된 component 이름
- `define('paragraph', element(...))`는 DSL에서 자동으로 ComponentTemplate으로 변환됨
- Function-based renderer: `define('xxxx', (props, model, context) => element())`도 ComponentTemplate

**재귀 호출에서만 ElementTemplate이 직접 처리됩니다.**
- `_buildElement()` 내부에서 children 처리 시
- `_renderSlotGetChildren()` 내부에서
- `_processChild()` 내부에서

## 분기 흐름도

```
build(nodeType, data, options)  ← 첫 호출: 항상 component
│
├─ [1] component = registry.getComponent(nodeType)
│   │
│   ├─ [1-1] component 없음 → Error
│   │
│   └─ [1-2] component 있음 (ExternalComponent 타입)
│       │
│       ├─ [2] component.managesDOM 확인
│       │
│       ├─ [2-1] managesDOM === true
│       │   └─ External Component 경로
│       │       └─ createComponentVNode (isExternal: true)
│       │
│       └─ [2-2] managesDOM === false 또는 undefined
│           └─ Context Component 경로
│               ├─ component.template (ContextualComponent 함수) 실행
│               │   └─ component(props, model, context) → ElementTemplate 반환
│               └─ _buildElement(elementTemplate, model) (재귀적)
│
└─ 재귀 호출 (내부에서)
    ├─ _buildElement() → children 처리 시 build() 재귀 호출
    ├─ _renderSlotGetChildren() → build() 재귀 호출
    └─ _processChild() → build() 재귀 호출
```

**중요**: `registry.get()`은 레거시이고 사용하지 않음. `define()`으로 정의된 모든 것은 `getComponent()`로만 가져올 수 있음.

## 실제 예시별 분기

### 예시 1: ElementTemplate 정의 (가장 일반적)

**정의:**
```typescript
define('paragraph', element('p', { className: 'para' }, [data('text')]));
```

**DSL 변환:**
- `define()`이 ElementTemplate을 자동으로 ComponentTemplate으로 변환
- `renderer.template = { type: 'component', component: (props, ctx) => elementTemplate }`

**호출:**
```typescript
const model = { stype: 'paragraph', sid: 'p1', text: 'Hello' };
const vnode = builder.build('paragraph', model);
```

**실행 경로:**
1. `component = registry.getComponent('paragraph')` → component 있음 (ExternalComponent)
2. `component.managesDOM` → false 또는 undefined
3. **→ [2-2] Context Component 경로**
   - `component.template` → ContextualComponent 함수
   - `props = {}` (템플릿에서 정의되지 않음)
   - `model = data`
   - `elementTemplate = component.template(props, model, minimalCtx)`
   - `elementTemplate.type === 'element'` → **true**
   - **→ _buildElement(elementTemplate, model)** (재귀적)
     - `elementTemplate.attributes = { className: 'para' }` → props
     - `model = { stype: 'paragraph', sid: 'p1', text: 'Hello' }` → model

**결과:**
- `vnode.tag = 'p'`
- `vnode.attrs.className = 'para'`
- `vnode.children`에 text VNode 포함

---

### 예시 2: ContextualComponent (함수형 컴포넌트)

**정의:**
```typescript
define('greeting', (props: any, model: any, ctx: any) => {
  return element('div', { className: 'greeting' }, [
    text(`Hello, ${props.name || 'Guest'}!`)
  ]);
});
```

**DSL 변환:**
- `define()`이 함수를 ComponentTemplate으로 변환
- `renderer.template = { type: 'component', component: (props, model, ctx) => ... }`

**호출:**
```typescript
const model = { stype: 'greeting', sid: 'g1', name: 'World' };
const vnode = builder.build('greeting', model);
```

**실행 경로:**
1. `component = registry.getComponent('greeting')` → component 있음 (ExternalComponent)
2. `component.managesDOM` → false 또는 undefined
3. **→ [2-2] Context Component 경로**
   - `component.template` → ContextualComponent 함수
   - `props = {}` (템플릿에서 정의되지 않음)
   - `model = data`
   - `elementTemplate = component.template(props, model, minimalCtx)`
   - `elementTemplate.type === 'element'` → **true**
   - **→ _buildElement(elementTemplate, model)** (재귀적)
     - `elementTemplate.attributes = {}` → props (템플릿에서 정의되지 않음)
     - `model = { stype: 'greeting', sid: 'g1', name: 'World' }` → model

**결과:**
- `vnode.tag = 'div'`
- `vnode.attrs.className = 'greeting'`
- `vnode.stype = 'greeting'`
- `vnode.props = {}` (sanitized, stype/sid 제거)

---

### 예시 3: External Component

**정의:**
```typescript
define('chart', {
  type: 'external',
  mount: (props, container) => { /* ... */ },
  update: (props, container) => { /* ... */ },
  unmount: (container) => { /* ... */ }
});
```

**호출:**
```typescript
const model = { stype: 'chart', sid: 'c1', data: [...] };
const vnode = builder.build('chart', model);
```

**실행 경로:**
1. `component = registry.getComponent('chart')` → component 있음 (ExternalComponent)
2. `component.managesDOM` → **true**
3. **→ [2-1] External Component 경로**
   - `props = {}` (템플릿에서 정의되지 않음)
   - `model = data`
   - `vnode = createComponentVNode({ stype, props, model, isExternal: true })`

**결과:**
- `vnode.stype = 'chart'`
- `vnode.props = {}`
- `vnode.model = { stype: 'chart', sid: 'c1', data: [...] }`
- `vnode.isExternal = true`

---

### 예시 4: 재귀 호출 (ElementTemplate 직접 처리)

**정의:**
```typescript
define('paragraph', element('p', { className: 'para' }, [data('text')]));
define('document', element('div', {}, [
  element('p', {}, [])  // ← 재귀 호출 발생
]));
```

**호출:**
```typescript
const model = { stype: 'document', sid: 'd1' };
const vnode = builder.build('document', model);
```

**실행 경로:**
1. 첫 호출: `build('document', model)`
   - `component = registry.getComponent('document')` → component 있음
   - `component.managesDOM` → false
   - `component.template(props, model, ctx)` 실행 → ElementTemplate 반환
   - `_buildElement(elementTemplate, model)` 호출
2. **재귀 호출**: `_buildElement` 내부에서 children 처리
   - `element('p', {}, [])` → ElementTemplate 직접 처리
   - `_buildElement(elementTemplate, data)` 호출 (재귀적)
   - 이때는 `build()`를 호출하지 않고 `_buildElement()`를 직접 호출

**결과:**
- 최상위: `vnode.tag = 'div'`
- 자식: `vnode.children[0].tag = 'p'`

---

### 예시 5: 레거시 (get() 사용 - 더 이상 사용하지 않음)

**참고**: `registry.get()`은 레거시입니다. `define()`으로 정의된 모든 것은 `getComponent()`로만 가져올 수 있습니다.

---

## Props와 Model의 구분

### 핵심 원칙

1. **Props는 템플릿 정의 시점에 결정됨**
   - `element('div', { className: 'test' })` → `{ className: 'test' }`가 props
   - `component('Button', { label: 'Click' })` → `{ label: 'Click' }`가 props
   - `data`에서 props를 추출하지 않음

2. **Model은 런타임 데이터**
   - `data('text')`, `data('content')` 등에서 사용
   - `slot('content')`에서 매핑
   - decorator 매칭에 사용 (model.sid)

### 각 경로별 Props/Model 처리

| 경로 | Props 소스 | Model 소스 | 비고 |
|------|-----------|-----------|------|
| Context Component (managesDOM === false) | component.template() 반환 ElementTemplate의 `attributes` | `data` | component(props, model, ctx) 실행 후 |
| External Component (managesDOM === true) | `{}` | `data` | props는 템플릿에서 정의되지 않음 |
| Element (재귀 호출) | `template.attributes` | `data` | `_buildElement()` 직접 호출 시 |

---

## 재귀 호출

`build()` 함수는 내부에서 재귀적으로 호출될 수 있습니다:

1. **Slot 처리**: `_renderSlotGetChildren`에서 `this.build()` 호출
2. **Children 처리**: `_processChild`에서 `this.build()` 호출
3. **Decorator 처리**: decorator VNode 생성 시 `_buildElement` 호출

재귀 호출 시에도 동일한 분기 로직이 적용됩니다.

---

## 주의사항

1. **Props는 data에서 추출하지 않음**: 템플릿 정의 시점에 결정
2. **Model은 항상 data**: 런타임 데이터 그대로 사용
3. **Component 함수 실행**: `component(props, model, context)` 형태로 호출
   - `props`: 템플릿에서 정의된 props 또는 빈 객체
   - `model`: data 그대로
4. **ElementTemplate의 attributes**: 항상 props로 사용

