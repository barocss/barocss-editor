# Barocss Architecture - Practical Examples

## 실제 사용 예제

### 1. 기본 템플릿 정의

```typescript
import { element, data, when, component } from '@barocss/dsl';
import { renderer, define } from '@barocss/dsl';

// 1. DSL로 템플릿 정의 (순수 함수)
const paragraphTemplate = element('p', 
  { className: data('className') }, 
  [data('text')]
);

// 2. 조건부 렌더링
const conditionalTemplate = when(
  (data) => data('show') === true,
  element('div', {}, [data('content')]),
  element('div', {}, [data('elseContent')])
);

// 3. 컴포넌트 정의
const buttonComponent = element('button',
  { 
    className: data('className'),
    onClick: data('onClick')
  },
  [data('label')]
);

// 4. Registry에 등록
define('paragraph', paragraphTemplate);
define('button', buttonComponent);
```

### 2. 실제 렌더링 과정

```typescript
import { DOMRenderer } from '@barocss/renderer-dom';
import { define, element, data } from '@barocss/dsl';

// 템플릿 정의
define('paragraph', element('p', {}, [data('text')]));

// Renderer 생성
const renderer = new DOMRenderer();

// Model 데이터
const model = { stype: 'paragraph', text: 'Hello World' };

// 첫 렌더링
const container = document.getElementById('app');
renderer.render(container, model);
// 결과: <p>Hello World</p>

// 업데이트
model.text = 'Updated Text';
renderer.render(container, model);
// 결과: <p>Updated Text</p> (이전 텍스트를 업데이트)
```

### 3. 복잡한 템플릿 예제

```typescript
import { element, data, component, when, slot } from '@barocss/dsl';
import { define } from '@barocss/dsl';

// 리스트 아이템
define('listItem', element('li', 
  { className: data('className') },
  [data('content')]
));

// 리스트
define('list', element('ul',
  { className: data('className') },
  [
    element('each', {}, [
      data('items'),
      element('listItem', 
        { className: data('item.className') },
        [data('item.content')]
      )
    ])
  ]
));

// 조건부 카드
define('card', when(
  (data) => data('expanded') === true,
  element('div', 
    { className: 'card expanded' },
    [
      element('h2', {}, [data('title')]),
      element('p', {}, [data('description')]),
      element('div', {}, [slot('extra')])
    ]
  ),
  element('div',
    { className: 'card collapsed' },
    [element('h2', {}, [data('title')])]
  )
));

// 컴포넌트
define('modal', component('dialog', 
  {
    open: data('isOpen'),
    onClose: data('handleClose')
  },
  [
    element('div', { className: 'modal-overlay' }, [
      element('div', { className: 'modal-content' }, [
        slot('header'),
        slot('body'),
        slot('footer')
      ])
    ])
  ]
));
```

### 4. 데이터 흐름 예제

```typescript
// Model
const blogPost = {
  stype: 'article',
  title: 'Understanding Reconcile',
  author: 'John Doe',
  content: '...',
  published: true
};

// 템플릿 (Registry에 등록됨)
define('article', element('article',
  {
    className: 'blog-post',
    'data-author': data('author')
  },
  [
    // 조건부 퍼블리시 표시
    when(
      (d) => d('published') === true,
      element('span', { className: 'published' }, ['Published'])
    ),
    element('h1', {}, [data('title')]),
    element('p', {}, [data('content')])
  ]
));

// 렌더링
const renderer = new DOMRenderer();
renderer.render(container, blogPost);

// 결과 DOM:
// <article class="blog-post" data-author="John Doe">
//   <span class="published">Published</span>
//   <h1>Understanding Reconcile</h1>
//   <p>...</p>
// </article>
```

### 5. 업데이트 시나리오

```typescript
// 첫 렌더링
const initialModel = { stype: 'paragraph', text: 'First' };
renderer.render(container, initialModel);
// DOM: <p>First</p>

// 데이터 변경
const updatedModel = { stype: 'paragraph', text: 'Second' };
renderer.render(container, updatedModel);

// Reconcile 과정:
// 1. prevVNode: { tag: 'p', text: 'First' }
// 2. nextVNode: { tag: 'p', text: 'Second' }
// 3. detectChanges(): ['text']
// 4. processElementNode(): domNode.textContent = 'Second'
// 5. finalizeDOMUpdate(): isAlreadyInDOM = true, skip append
// DOM: <p>Second</p>
```

### 6. Children 추가 시나리오

```typescript
// 첫 렌더링
const initialModel = {
  stype: 'div',
  items: ['Item 1']
};

renderer.render(container, initialModel);
// DOM: <div><p>Item 1</p></div>

// 아이템 추가
updatedModel.items.push('Item 2');

renderer.render(container, {
  stype: 'div',
  items: ['Item 1', 'Item 2']
});

// Reconcile 과정:
// prevChildren: [{tag:'p', text:'Item 1'}]
// nextChildren: [{tag:'p', text:'Item 1'}, {tag:'p', text:'Item 2'}]
//
// 1. First child: Same → skip
// 2. Second child: insertBefore(newNode, referenceNode)
// 3. childWip.domNode = newNode
// 4. finalizeDOMUpdate(): isAlreadyInDOM = true, skip

// DOM: <div><p>Item 1</p><p>Item 2</p></div>
```

### 7. 컴포넌트 예제

```typescript
// Counter 컴포넌트 정의
const counterComponent = element('div', 
  { className: 'counter' },
  [
    element('button', 
      { onClick: data('decrement') }, 
      ['-']
    ),
    element('span', {}, [data('count')]),
    element('button',
      { onClick: data('increment') },
      ['+']
    )
  ]
);

define('counter', counterComponent);

// 사용
const model = {
  stype: 'counter',
  count: 0,
  increment: () => { /* ... */ },
  decrement: () => { /* ... */ }
};

renderer.render(container, model);
```

### 8. Portal 예제

```typescript
import { portal, element, data } from '@barocss/dsl';

// Portal 정의
define('modal', element('div',
  {},
  [
    portal('modal-root',
      element('div', { className: 'modal' }, [
        element('h2', {}, [data('title')]),
        element('button', 
          { onClick: data('onClose') },
          ['Close']
        )
      ])
    )
  ]
));

// 사용
const model = {
  stype: 'modal',
  title: 'My Modal',
  onClose: () => { /* ... */ }
};

renderer.render(container, model);
// Portal content는 'modal-root'로 렌더링됨
```

## 전체 파이프라인 실전 예제

```typescript
// 1. DSL로 템플릿 정의
import { define, element, data, when, component } from '@barocss/dsl';
import { DOMRenderer } from '@barocss/renderer-dom';

define('blogPost', element('article',
  { className: data('className') },
  [
    when(
      (d) => d('published'),
      element('span', { className: 'badge' }, ['Published'])
    ),
    element('h1', {}, [data('title')]),
    element('p', {}, [data('content')]),
    component('author', { name: data('author') })
  ]
));

// 2. Renderer 생성
const renderer = new DOMRenderer();

// 3. Model 준비
const blogModel = {
  stype: 'blogPost',
  className: 'post-featured',
  published: true,
  title: 'Getting Started with Barocss',
  content: '...',
  author: 'Jane Smith'
};

// 4. 렌더링
const container = document.getElementById('app');
renderer.render(container, blogModel);

// 5. 업데이트
blogModel.title = 'Advanced Barocss Patterns';
blogModel.content = 'Updated content...';
renderer.render(container, blogModel);
// → Reconcile이 변경된 부분만 업데이트
```

## 함수형 파이프라인 시각화

```typescript
// DSL 함수
const template = element('p', {}, [data('text')]);

// VNodeBuilder 함수
const vnode = f_template(template, { text: 'Hello' });
// → { tag: 'p', text: 'Hello', ... }

// DOMReconcile 함수
const dom = f_reconcile(prevVNode, vnode, container);
// → DOM 조작: <p>Hello</p>

// 전체 함수 합성
render = f_reconcile ∘ f_template ∘ f_dsl
```

## 핵심 포인트

1. **DSL은 순수 함수**: 모든 빌더 함수는 side-effect 없음
2. **합성 가능**: `element()` 안에 `data()`, `when()` 등을 중첩 가능
3. **Registry**: 템플릿은 Registry에 등록되어 재사용
4. **자동 Reconcile**: 업데이트 시 변경된 부분만 DOM 조작
5. **타입 안전성**: TypeScript로 타입 안전성 보장

