# @barocss/renderer-dom

DOM 렌더러 패키지. 모델 데이터를 DOM으로 변환하고, `sid` 기반으로 안정적인 DOM 업데이트를 제공합니다.

## 설치

```bash
pnpm add @barocss/renderer-dom
```

## 기본 사용법

```typescript
import { DOMRenderer } from '@barocss/renderer-dom';
import { define, element, slot } from '@barocss/dsl';

// 템플릿 정의
define('paragraph', element('p', { className: 'para' }, [slot('content')]));

// 렌더러 생성 및 렌더링
const renderer = new DOMRenderer();
const container = document.getElementById('app');

const model = {
  sid: 'p1',
  stype: 'paragraph',
  content: [
    { sid: 't1', stype: 'text', text: 'Hello World' }
  ]
};

renderer.render(container, model);
```

## 아키텍처 개요

renderer-dom은 다음과 같은 흐름으로 동작합니다:

1. **모델 → VNode**: `VNodeBuilder`가 모델을 순수한 VNode 트리로 변환
2. **VNode → DOM**: `Reconciler`가 이전 VNode와 새 VNode를 비교하여 최소 변경만 DOM에 적용
3. **상태 관리**: `ComponentManager`가 `sid` 기반으로 컴포넌트 인스턴스와 상태를 전역 관리

핵심 원칙:
- VNode는 순수한 표현 (DOM 표식 포함 안 함)
- `sid` 기반 DOM 안정성 (React의 `key`와 유사)
- 전체 문서 재빌드 + prev/next 비교로 최소 변경 보장

## DSL 규칙

### 템플릿 정의

`define()`으로 컴포넌트 템플릿을 등록합니다.

```typescript
// 엘리먼트 템플릿
define('heading', element('h1', { className: 'title' }, [slot('content')]));

// 함수 컴포넌트 (시그니처: (props, model, context) => ElementTemplate)
define('counter', (props, model, ctx) => {
  const count = ctx.instance?.get('count') ?? 0;
  return element('div', {}, [
    element('button', { onClick: () => ctx.instance?.set({ count: count + 1 }) }, ['+']),
    element('span', {}, [String(count)])
  ]);
});

// 제네릭 타입 지원
define<MyProps, MyModel, MyContext>('typed-component', (props, model, ctx) => {
  // 타입 안전성 보장
});
```

**중요**: 
- 템플릿 함수는 항상 `ElementTemplate`을 반환해야 합니다
- `props`와 `model`은 절대 혼합하지 않습니다
- `context.model`은 원본 모델을 가리킵니다

### `element(tag, attrs?, children?)`

엘리먼트 템플릿을 생성합니다.

```typescript
// 정적 속성
element('div', { className: 'container', id: 'app' }, [])

// 동적 속성 (함수)
element('div', { 
  className: (model) => model.active ? 'active' : 'inactive' 
}, [])

// 네임스페이스는 자동 처리 (SVG/MathML)
element('svg', { width: 100, height: 100 }, [
  element('circle', { cx: 50, cy: 50, r: 40 })
])
```

### `slot('content')` - 자식 확장의 유일한 경로

자식 모델을 렌더링하려면 **반드시** `slot('content')`를 사용합니다.

```typescript
define('list', element('ul', {}, [slot('content')]));

const model = {
  sid: 'list1',
  stype: 'list',
  content: [
    { sid: 'item1', stype: 'listItem', text: 'Item 1' },
    { sid: 'item2', stype: 'listItem', text: 'Item 2' }
  ]
};
```

**주의**: `data('content')`는 배열 원본 접근만 제공하며, children 확장에는 사용하지 않습니다.

### `when()` - 조건부 렌더링

```typescript
import { when } from '@barocss/dsl';

define('conditional', (props, model, ctx) => {
  return element('div', {}, [
    when(
      () => model.show,
      element('span', {}, ['Visible']),
      element('span', {}, ['Hidden']) // elseTemplate (선택)
    )
  ]);
});
```

### `each()` - 반복 렌더링

```typescript
import { each } from '@barocss/dsl';

define('list', (props, model, ctx) => {
  return element('ul', {}, [
    each(
      () => model.items,
      (item, index) => element('li', {}, [item.text]),
      (item) => item.id // key 함수 (선택, sid 대체용)
    )
  ]);
});
```

## VNode 구조

VNode는 DOM의 순수한 표현입니다. DOM 표식(`data-bc-*`, `data-decorator-*`)은 VNode에 포함되지 않습니다.

```typescript
interface VNode {
  // 기본 필드
  tag?: string;
  text?: string | number;
  attrs?: Record<string, any>;
  style?: Record<string, any>;
  children?: Array<string | number | VNode>;
  
  // 컴포넌트 식별자
  sid?: string;
  stype?: string;
  props?: Record<string, any>;
  model?: Record<string, any>;
  
  // 데코레이터 참조
  decorators?: unknown[];
  
  // 데코레이터 VNode 전용
  decoratorSid?: string;
  decoratorStype?: string;
  decoratorCategory?: 'inline' | 'block' | 'layer' | string;
  decoratorPosition?: 'before' | 'after' | 'inside' | string;
  decoratorModel?: Record<string, any>;
  
  // 포털 VNode 전용
  portal?: { 
    target: HTMLElement | (() => HTMLElement) | string; 
    template: any; 
    portalId?: string 
  };
}
```

## 데이터 속성(data-*) 처리

- `data-bc-sid`, `data-bc-stype` 등 모든 `data-*` 표식은 **Reconciler가 DOM에서만** 부착/갱신합니다
- VNode에는 `sid`, `stype` 등 식별 정보만 최상위로 가집니다
- `data-component-*` 속성은 사용하지 않습니다 (제거됨)

## Reconciler 동작 원리

### prevVNode vs nextVNode 비교

Reconciler는 이전 VNode와 새 VNode를 비교하여 최소 변경만 DOM에 적용합니다.

```typescript
// 첫 렌더
renderer.render(container, { sid: 'p1', stype: 'paragraph', text: 'Hello' });
// → prevVNodeTree에 저장

// 두 번째 렌더
renderer.render(container, { sid: 'p1', stype: 'paragraph', text: 'World' });
// → prevVNode와 nextVNode 비교 → 텍스트만 업데이트
```

### 루트 호스트 처리

- `model.sid`로 container 직하에서 host를 찾거나 생성
- 태그가 다르면 교체
- `data-bc-sid`, `data-bc-stype`를 DOM에만 설정

### 속성/스타일 업데이트

- `updateAttributes(element, prevAttrs, nextAttrs)`: 이전 속성과 비교하여 추가/수정/제거
- `updateStyles(element, prevStyles, nextStyles)`: 이전 스타일과 비교하여 추가/수정/제거

**제거 처리**: 이전에 있던 속성/스타일이 새 VNode에 없으면 DOM에서 제거됩니다.

### 자식 재조정

- `slot('content')`로 확장된 children을 재귀적으로 reconcile
- 매칭 우선순위: `sid`(컴포넌트) / `decoratorSid`(데코레이터) → 동일 DOM 재사용
- 텍스트/엘리먼트 혼합에서도 최소 변경 목표
- 깊은 중첩 구조에서 부모 경로가 크게 변경될 때 DOM 요소가 교체될 수 있으나, `sid` 기준 인스턴스는 보존됨

### 텍스트 노드 처리

텍스트 노드는 부모의 다른 엘리먼트 자식에 영향을 주지 않도록 별도 갱신합니다.

### 삭제/정리

방문되지 않은 호스트/포털 호스트는 렌더 종료 시 정리됩니다.

## 네임스페이스 처리

SVG, MathML 등 네임스페이스가 필요한 요소는 자동으로 처리됩니다.

```typescript
define('svg-icon', element('svg', { 
  xmlns: 'http://www.w3.org/2000/svg',
  width: 24,
  height: 24
}, [
  element('path', { d: 'M12 2L2 7v10l10 5 10-5V7z' })
]));
```

특수 속성(`xlink:href` 등)과 스타일 제거/갱신도 포함됩니다.

## 마크(Mark)와 데코레이터(Decorator)

### 마크 정의

텍스트에 스타일을 적용합니다.

```typescript
import { defineMark } from '@barocss/dsl';

defineMark('bold', element('strong', { 
  style: { fontWeight: 'bold' } 
}, [data('text')]));

defineMark('link', element('a', { 
  href: attr('href', '#'),
  className: 'mark-link'
}, [data('text')]));
```

### 데코레이터 정의

UI 오버레이를 추가합니다.

```typescript
import { defineDecorator } from '@barocss/dsl';

defineDecorator('comment', element('div', { 
  className: 'comment-block' 
}, []));
```

### 사용 예시

```typescript
// 모델에서 마크 사용
const model = {
  sid: 'p1',
  stype: 'paragraph',
  content: [
    {
      sid: 't1',
      stype: 'text',
      text: 'Hello World',
      marks: [
        { type: 'bold', range: [0, 5] },
        { type: 'link', range: [6, 11], attrs: { href: 'https://example.com' } }
      ]
    }
  ]
};

// 데코레이터 사용
const decorators = [
  {
    sid: 'dec1',
    stype: 'comment',
    category: 'block',
    position: 'before', // 'before' | 'after' | 'inside'
    model: { note: 'Comment text' }
  }
];

renderer.render(container, model, decorators);
```

### 데코레이터 규칙

- VNode 최상위에 `decoratorSid`, `decoratorStype`, `decoratorCategory`, `decoratorPosition`, `decoratorModel` 보관
- DOM에서는 대응 `data-decorator-*` 속성을 Reconciler가 부착/갱신
- **블록/레이어 데코레이터는 컴포넌트 VNode에만 적용** (마크 VNode에 적용 금지)
- 인라인 마크와 데코레이터는 동시에 처리 가능하며, 겹침/분할 케이스를 안전하게 다룸
- `decoratorPosition`을 기준으로 삽입 위치 결정 (`before`/`after`/`inside`)

## 컴포넌트 상태 관리

### 상태 클래스 정의

```typescript
import { defineState } from '@barocss/renderer-dom';
import { BaseComponentState } from '@barocss/renderer-dom';

class CounterState extends BaseComponentState {
  // 선택: 초기 상태 설정
  initState(initial: any) {
    this.data = { count: initial?.count ?? 0 };
  }
  
  // 선택: 스냅샷 생성 (미제공 시 얕은 복사 사용)
  snapshot() {
    return { ...this.data };
  }
  
  // 커스텀 메서드
  increment() {
    this.set({ count: this.get('count') + 1 });
  }
}

defineState('counter', CounterState);
```

### 상태 사용

```typescript
define('counter', (props, model, ctx) => {
  const count = ctx.instance?.get('count') ?? 0;
  return element('div', {}, [
    element('button', { 
      onClick: () => ctx.instance?.increment() 
    }, ['+']),
    element('span', {}, [String(count)])
  ]);
});
```

### 상태 관리 원칙

- `ComponentManager`가 `sid` 기반으로 `BaseComponentState` 인스턴스를 전역 관리
- `context.instance`로 상태 접근 가능
- `set(patch)` 호출 시 `ComponentManager.emit('changeState', sid, ...)` 발행
- `BaseComponentState.mount(vnode, element, context)`/`unmount()` 훅이 라이프사이클에 통합 호출
- **DOMRenderer는 `changeState` 이벤트를 구독하고 `requestAnimationFrame`으로 스로틀된 전체 re-render를 트리거**
- **부분 업데이트 API는 제공하지 않음** (`updateBySid` 제거). 항상 전체 문서 재빌드 + prev/next 비교

## 포털(Portal)

다른 DOM 컨테이너에 렌더링할 수 있습니다.

```typescript
import { portal } from '@barocss/dsl';

define('modal', (props, model, ctx) => {
  return element('div', {}, [
    portal(
      () => document.body, // 타겟: HTMLElement | (() => HTMLElement) | string
      element('div', { className: 'modal-overlay' }, [model.content]),
      'modal-root' // portalId (선택)
    )
  ]);
});
```

### 포털 동작 원리

- `portalId`로 대상 컨테이너 내 호스트를 식별/재사용
- 렌더 사이클에서 방문되지 않은 포털은 정리됨
- 타겟이 변경되면 이전 타겟의 호스트를 정리하고 새 타겟으로 이관
- 동일 `portalId`는 동일 DOM 호스트 재사용을 보장

## 성능 및 안정성

### DOM 안정성

- `sid`/`decoratorSid`는 React의 `key`처럼 DOM 재사용의 기준
- 동일 `sid`를 가진 컴포넌트는 DOM 요소와 상태 인스턴스가 재사용됨

### 전체 문서 재조정

- 전체 문서 리컨실도 허용됨
- VNode 생성은 순수/빠르게 유지
- 불필요한 DOM 읽기 금지 (비교는 prevVNode vs nextVNode로 수행)

### 성능 기준

- 1000 노드: < 3초
- 5000 노드: < 60초 (느린 CI 환경 기준)
- 블록 데코레이터 혼합 1000 노드: < 30초
- 반복 50회 전체 렌더 시 메모리 증가: 5MB 미만

## API 레퍼런스

### `DOMRenderer`

#### `constructor(registry?: RendererRegistry, options?: DOMRendererOptions)`

렌더러 인스턴스를 생성합니다.

#### `render(container: HTMLElement, model: ModelData, decorators?: DecoratorData[], runtime?: Record<string, any>): void`

모델을 DOM으로 렌더링합니다.

**파라미터:**
- `container`: 렌더링 대상 DOM 요소
- `model`: 루트 모델 데이터 (반드시 `sid`, `stype` 포함)
- `decorators`: 데코레이터 배열 (선택)
- `runtime`: 런타임 컨텍스트 (선택)

### `defineState(stype: string, StateClass: new (...args: any[]) => BaseComponentState): void`

상태 클래스를 등록합니다.

## 오류 처리

- **`stype` 누락 모델**: 렌더 시작 시 즉시 에러를 던짐. 렌더는 중단됨
- **`sid` 누락 모델**: 스킵하고 경고를 기록. 기존 DOM은 변경되지 않음
- **미등록 `stype`**: 에러를 던짐
- **잘못된 데코레이터 범위/포지션**: 해당 데코레이터는 무시 (크래시하지 않음)
- **포털 타겟 무효**: 해당 포털은 스킵하고 경고를 기록

## 주의사항

1. **`stype` 필수**: 모델에 `stype`이 없으면 에러가 발생합니다
2. **`sid` 권장**: `sid`가 없으면 경고가 발생하고 DOM이 업데이트되지 않을 수 있습니다
3. **`slot('content')` 사용**: 자식 렌더링에는 반드시 `slot('content')`를 사용하세요
4. **상태 변경은 자동 재렌더**: `set()` 호출 시 자동으로 전체 문서가 재렌더링됩니다
5. **포털 정리**: 포털은 렌더 사이클에서 방문되지 않으면 자동으로 정리됩니다
6. **VNode 순수성**: VNode에 DOM 표식(`data-*`)을 주입하지 마세요
7. **래퍼 금지**: 래퍼(wrapper) 도입은 금지됩니다

## 테스트/검증 원칙

- DOM 비교는 `normalizeHTML(container.firstElementChild)` 기반 정규화 문자열로 검증
- prev/next 비교로 속성/스타일 제거가 반영되어야 함
- 포털은 `portalId`로 호스트를 재사용하고, 방문되지 않으면 정리됨

## 라이선스

MIT
