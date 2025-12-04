# BaroCSS Editor API Reference

## Portal API

### portal(target, template, portalId?)

Portal을 생성하는 DSL 함수입니다. 지정된 DOM 컨테이너에 템플릿을 렌더링하며, 여러 Portal이 같은 target을 공유할 수 있도록 독립적인 컨테이너를 생성합니다.

**매개변수:**
- `target: HTMLElement` - Portal이 렌더링될 DOM 컨테이너
- `template: RenderTemplate` - Portal에 렌더링할 템플릿
- `portalId?: string` - 선택적 Portal 고유 식별자 (자동 생성됨)

**반환값:**
- `PortalTemplate` - Portal 템플릿 객체

**특징:**
- **독립적 컨테이너**: 각 Portal은 고유한 컨테이너를 가져 서로 간섭하지 않음
- **기존 DOM 보존**: Portal target의 기존 내용을 건드리지 않음
- **상태 보존**: Portal 업데이트 시 DOM 상태(포커스, 스크롤 등) 보존
- **성능 최적화**: reconcile 알고리즘을 사용한 효율적인 업데이트

**예시:**
```typescript
// 기본 사용법
const tooltip = portal(document.body, element('div', {
  className: 'tooltip',
  style: {
    position: 'fixed',
    zIndex: 1000,
    opacity: 0
  }
}, [text('Tooltip content')]), 'tooltip-portal');

// 상태와 연동
defineDecorator('comment', (ctx) => {
  ctx.initState('showTooltip', false);
  
  return element('div', {
    onMouseEnter: () => ctx.setState('showTooltip', true),
    onMouseLeave: () => ctx.setState('showTooltip', false)
  }, [
    text('💬'),
    portal(document.body, element('div', {
      className: 'comment-tooltip',
      style: {
        position: 'fixed',
        zIndex: 1001,
        opacity: ctx.getState('showTooltip') ? 1 : 0,
        transition: 'opacity 0.2s ease'
      }
    }, [text('Tooltip content')]), 'comment-tooltip')
  ]);
});

// 여러 Portal이 같은 target 공유
define('multi-portal-component', (props, ctx) => {
  return element('div', [
    text('Main App'),
    
    // 각 Portal에 고유 ID 지정
    portal(document.body, element('div', { 
      className: 'notification',
      style: { position: 'fixed', top: '10px', right: '10px' }
    }, [text('Notification')]), 'notification'),
    
    portal(document.body, element('div', { 
      className: 'modal',
      style: { position: 'fixed', top: '50%', left: '50%' }
    }, [text('Modal')]), 'modal'),
    
    portal(document.body, element('div', { 
      className: 'tooltip',
      style: { position: 'fixed', bottom: '10px', left: '10px' }
    }, [text('Tooltip')]), 'tooltip')
  ]);
});

// 조건부 Portal
define('conditional-portal-component', (props, ctx) => {
  return element('div', {}, [
    text('Main content'),
    when(
      (data) => !!data.showPortal,
      portal(
        document.body,
        element('div', { 
          'data-testid': 'conditional-portal',
          style: { position: 'fixed', top: '0', right: '0' }
        }, [text('Conditional portal content')])
      )
    )
  ]);
});

// 데이터 바인딩 Portal
define('data-bound-portal-component', (props, ctx) => {
  return element('div', {}, [
    portal(
      document.body,
      element('div', { 
        'data-testid': 'data-bound-portal',
        style: { 
          backgroundColor: data('backgroundColor'),
          color: data('textColor')
        }
      }, [
        data('message')
      ])
    )
  ]);
});

// 중첩 컴포넌트 Portal
define('portal-child', (props, ctx) => {
  return element('div', { 
    'data-testid': 'portal-child',
    style: { border: '1px solid red' }
  }, [
    text(`Child content: ${props.message}`)
  ]);
});

define('portal-parent', (props, ctx) => {
  return element('div', {}, [
    portal(
      document.body,
      element('div', { 'data-testid': 'portal-parent' }, [
        element('portal-child', { message: props.childMessage })
      ])
    )
  ]);
});
```

## 상태 관리 API

### ComponentContext

컴포넌트와 데코레이터에서 사용할 수 있는 상태 관리 Context입니다.

#### initState(key, value)

상태를 초기화합니다.

**매개변수:**
- `key: string` - 상태 키
- `value: any` - 초기값

**예시:**
```typescript
define('my-component', (ctx) => {
  ctx.initState('count', 0);
  ctx.initState('showModal', false);
  
  return element('div', [text(`Count: ${ctx.getState('count')}`)]);
});
```

#### getState(key)

상태 값을 가져옵니다.

**매개변수:**
- `key: string` - 상태 키

**반환값:**
- `any` - 상태 값

**예시:**
```typescript
const count = ctx.getState('count');
const showModal = ctx.getState('showModal');
```

#### setState(key, value)

상태 값을 설정합니다.

**매개변수:**
- `key: string` - 상태 키
- `value: any` - 새로운 값

**예시:**
```typescript
ctx.setState('count', 5);
ctx.setState('showModal', true);
```

#### toggleState(key)

상태 값을 토글합니다.

**매개변수:**
- `key: string` - 상태 키

**예시:**
```typescript
ctx.toggleState('showModal'); // true -> false, false -> true
```

## 템플릿 시스템 API

### isDSLTemplate(obj)

DSL 템플릿 객체와 일반 HTML 속성 객체를 구분합니다.

**매개변수:**
- `obj: any` - 검사할 객체

**반환값:**
- `boolean` - DSL 템플릿 객체이면 `true`, 그렇지 않으면 `false`

**예시:**
```typescript
// DSL 템플릿 객체 (true 반환)
isDSLTemplate(text('Hello'))           // true
isDSLTemplate(data('name'))            // true
isDSLTemplate(element('div'))          // true
isDSLTemplate(component('button'))     // true
isDSLTemplate(when(true, text('ok')))  // true

// 일반 객체 (false 반환)
isDSLTemplate({ type: 'text', placeholder: 'Enter text' })  // false - HTML input 속성
isDSLTemplate({ className: 'btn', disabled: true })        // false - HTML 요소 속성
isDSLTemplate({ href: '#home', target: '_blank' })         // false - HTML 링크 속성
```

**용도:**
- `element()` 함수 내부에서 매개변수 해석 시 사용
- DSL 템플릿 객체는 자식으로 처리
- HTML 속성 객체는 속성으로 처리

### define(name, template)

컴포넌트를 정의합니다.

**매개변수:**
- `name: string` - 컴포넌트 이름
- `template: RenderTemplate | Function` - 템플릿 또는 템플릿 함수

**예시:**
```typescript
// 정적 템플릿
define('button', element('button', { className: 'btn' }, [text('Click me')]));

// 동적 템플릿 (상태 관리)
define('counter', (props, context) => {
  context.initState('count', 0);
  
  return element('div', [
    text(`Count: ${context.getState('count')}`),
    element('button', {
      onClick: () => context.setState('count', context.getState('count') + 1)
    }, [text('Increment')])
  ]);
});

// 함수형 컴포넌트 (전체 데이터 접근)
define('bTable', (props, context) => {
  // props에는 전체 모델 데이터가 포함됨
  return element('table', { className: 'table' }, [
    // 중첩된 속성에 접근 가능
    ...(props?.attributes?.caption ? [
      element('caption', { className: 'table-caption' }, [
        data('attributes.caption') // props.attributes.caption에 접근
      ])
    ] : []),
    slot('content')
  ]);
});
```

**템플릿 타입:**
- **ElementTemplate** (자동 변환): 상태 없는 순수 템플릿 - `define()`에 전달 시 자동으로 `ComponentTemplate`으로 변환됨 (`(props, ctx) => ElementTemplate`)
- **ContextualComponent**: `(props, context)` 매개변수를 가진 상태 관리 함수 - 명시적으로 함수로 정의
- **Function-based Component**: 전체 모델 데이터에 접근하고 `data()` DSL로 중첩 속성을 사용할 수 있는 함수
- **ExternalComponent**: 외부 라이브러리 통합을 위한 `mount`, `update`, `unmount` 메서드를 가진 객체

**중요**: `define()` 함수는 모든 템플릿을 자동으로 컴포넌트로 변환합니다:
```typescript
// ElementTemplate (자동 변환)
define('card', element('div', { className: 'card' }))
// 내부적으로는: define('card', (props, ctx) => element('div', { className: 'card' }))
```

### defineMark(type, template)

텍스트 마크를 정의합니다. 마크는 텍스트에 서식을 적용하기 위한 기능입니다.

**중요**: `defineMark()`는 내부적으로 `define()`을 사용하므로 모든 마크 템플릿이 자동으로 컴포넌트로 변환됩니다.

**매개변수:**
- `type: string` - 마크 타입 (예: 'bold', 'italic', 'underline')
- `template: RenderTemplate` - 마크가 적용될 때 렌더링할 템플릿

**반환값:**
- `RendererDefinition` - 마크 정의 객체

**예시:**
```typescript
// 기본 마크 정의
defineMark('bold', element('strong', [data('text')]));
defineMark('italic', element('em', [data('text')]));
defineMark('underline', element('u', [data('text')]));
defineMark('code', element('code', [data('text')]));

// 사용법
const model = {
  type: 'text',
  text: 'Hello World',
  marks: [
    { type: 'bold', range: [0, 5] },      // "Hello"를 <strong>으로
    { type: 'italic', range: [6, 11] }    // "World"를 <em>으로
  ]
};

// 렌더링 결과: <strong>Hello</strong> <em>World</em>
```

**마크 시스템 특징:**
- 마크는 `marks` 속성으로 텍스트에 적용됩니다
- `range: [start, end]` 형태로 적용 범위를 지정합니다
- 여러 마크가 겹칠 수 있습니다
- 마크는 자동으로 적절한 HTML 요소로 래핑됩니다

### defineDecorator(name, template)

데코레이터를 정의합니다.

**중요**: `defineDecorator()`는 내부적으로 `define()`을 사용하므로 모든 데코레이터 템플릿이 자동으로 컴포넌트로 변환됩니다. 또한 `data-decorator="true"` 속성이 자동으로 추가됩니다.

**매개변수:**
- `name: string` - 데코레이터 이름
- `template: RenderTemplate | Function` - 템플릿 또는 템플릿 함수

**예시:**
```typescript
// 정적 데코레이터
defineDecorator('highlight', element('div', {
  className: 'highlight',
  style: { backgroundColor: 'yellow' }
}, [text(' ')]));

// 동적 데코레이터
defineDecorator('comment', (ctx) => {
  ctx.initState('showTooltip', false);
  
  return element('div', {
    className: 'comment-indicator',
    onMouseEnter: () => ctx.setState('showTooltip', true),
    onMouseLeave: () => ctx.setState('showTooltip', false)
  }, [
    text('💬'),
    portal(document.body, element('div', {
      className: 'comment-tooltip',
      style: {
        position: 'fixed',
        opacity: ctx.getState('showTooltip') ? 1 : 0
      }
    }, [text('Tooltip content')]))
  ]);
});
```

### element(tag, attributes?, children?)

HTML 요소를 생성합니다. 동적 속성과 함수 자식을 지원합니다.

**매개변수:**
- `tag: string | Function` - HTML 태그 또는 동적 태그 함수
- `attributes?: ElementAttributes | Function` - 요소 속성 또는 동적 속성 함수 (선택사항)
- `children?: ElementChild[]` - 자식 요소들 (선택사항)

**반환값:**
- `ElementTemplate` - 요소 템플릿

**ElementChild 타입:**
```typescript
type ElementChild = 
  | string 
  | number 
  | ElementTemplate 
  | SlotTemplate 
  | DataTemplate 
  | ConditionalTemplate 
  | ComponentTemplate 
  | PortalTemplate 
  | ((data: any) => ElementChild)  // 함수 자식
  | ElementChild[]
```

**예시:**
```typescript
// 기본 요소
element('div', { className: 'container' }, [text('Hello')]);

// 동적 태그
element((model) => `h${model.level}`, { className: 'heading' }, [text('Title')]);

// 동적 속성 (함수)
element('div', {
  className: (d) => d.active ? 'active' : 'inactive',
  style: (d) => ({ color: d.color || 'black' })
}, [text('Dynamic content')]);

// 함수 자식
element('li', { className: 'feature' }, [
  (d) => d.name + (d.enabled ? ' ✓' : '')
]);

// 혼합 콘텐츠 (텍스트 + 함수 자식)
element('div', { className: 'header' }, [
  text('Title: '),
  (d) => d.title,
  text(' by '),
  (d) => d.author
]);

// 배열 반환 함수 자식 (each 대체)
element('ul', { className: 'list' }, [
  (d) => d.items.map(item => 
    element('li', { className: 'item' }, [text(item.name)])
  )
]);

// 이벤트 핸들러
element('button', {
  onClick: (e) => console.log('clicked'),
  onMouseEnter: (e) => console.log('hovered')
}, [text('Click me')]);

// 스타일
element('div', {
  style: {
    position: 'fixed',
    top: '10px',
    left: '10px',
    zIndex: 1000,
    opacity: 0.8
  }
}, [text('Fixed element')]);
```

**함수 자식 특징:**
- 함수는 현재 데이터 컨텍스트를 매개변수로 받습니다
- 문자열, 숫자, 템플릿 객체, 배열을 반환할 수 있습니다
- 배열을 반환하면 각 항목이 개별 VNode로 처리됩니다

**함수 속성 특징:**
- 함수는 현재 데이터 컨텍스트를 매개변수로 받습니다
- 속성 값(문자열, 숫자, 객체 등)을 반환해야 합니다

### text(content)

텍스트 노드를 생성합니다.

**매개변수:**
- `content: string | number` - 텍스트 내용

**반환값:**
- `TextTemplate` - 텍스트 템플릿

**예시:**
```typescript
text('Hello World');
text(42);
text(data('user.name', 'Unknown'));
```

### data(path, defaultValue?)

데이터 바인딩을 생성합니다.

**매개변수:**
- `path: string` - 데이터 경로
- `defaultValue?: any` - 기본값 (선택사항)

**반환값:**
- `DataTemplate` - 데이터 템플릿

**예시:**
```typescript
data('user.name', 'Unknown');
data('count');
data('settings.theme', 'light');
```

## ExternalComponent API

### ExternalComponent Interface

외부 라이브러리와 통합하기 위한 컴포넌트 인터페이스입니다.

**인터페이스:**
```typescript
interface ExternalComponent {
  // 템플릿 함수 (registerContextComponent에서 사용)
  template?: ContextualComponent;
  
  // 컴포넌트 마운트 (DOM에 추가) - 상태 관리를 위해 context 선택적 제공
  mount(container: HTMLElement, props: Record<string, any>, id: string, context?: ComponentContext): HTMLElement;
  
  // 컴포넌트 업데이트 (props 변경) - instance.state를 통한 읽기 전용 상태 접근
  update?(instance: ComponentInstance, prevProps: Record<string, any>, nextProps: Record<string, any>): void;
  
  // 컴포넌트 언마운트 (DOM에서 제거) - 정리를 위해 context 선택적 제공
  unmount(instance: ComponentInstance, context?: ComponentContext): void;
  
  // 컴포넌트가 DOM을 직접 관리하는지 여부
  managesDOM?: boolean;
}
```

### DOM 생성 방식

ExternalComponent는 **3가지 방식**으로 DOM을 생성할 수 있습니다:

#### 1. DOM API 방식
```typescript
const TraditionalComponent: ExternalComponent = {
  mount: (container, props, id) => {
    const div = document.createElement('div');
    const span = document.createElement('span');
    const button = document.createElement('button');
    
    span.textContent = props.count || '0';
    button.textContent = '+';
    
    div.appendChild(span);
    div.appendChild(button);
    container.appendChild(div);
    
    return div;
  }
};
```

#### 2. innerHTML 방식
```typescript
const InnerHTMLComponent: ExternalComponent = {
  mount: (container, props, id) => {
    const div = document.createElement('div');
    div.innerHTML = `
      <div class="counter">
        <span class="count">${props.count || 0}</span>
        <button class="increment">+</button>
      </div>
    `;
    
    container.appendChild(div);
    return div;
  }
};
```

#### 3. DSL 방식
```typescript
const DSLComponent: ExternalComponent = {
  mount: (container, props, id) => {
    // DSL을 사용한 선언적 DOM 생성
    const template = element('div', { className: 'counter' }, [
      element('span', { className: 'count' }, [text(`${props.count || 0}`)]),
      element('button', { className: 'increment' }, [text('+')])
    ]);
    
    // DSL을 DOM으로 변환
    const builder = new VNodeBuilder(registry);
    const vnode = builder.buildFromElementTemplate(template, props);
    const div = vnodeToDOM(vnode, container);
    
    container.appendChild(div);
    return div;
  }
};
```

### 방식별 비교

| 방식 | 장점 | 단점 | 사용 시기 |
|------|------|------|-----------|
| **DOM API** | 세밀한 제어, 성능 최적화 | 코드가 길고 복잡 | 복잡한 DOM 조작이 필요한 경우 |
| **innerHTML** | 간단하고 빠름, HTML 친화적 | XSS 위험, 타입 안전성 부족 | 빠른 프로토타이핑, 단순한 구조 |
| **DSL** | 타입 안전, 일관성, 선언적 | 학습 곡선, 약간의 오버헤드 | 복잡한 UI, 유지보수성 중시 |

### 사용 예시

```typescript
// DSL을 사용한 카운터 컴포넌트
const DSLCounter: ExternalComponent = {
  mount: (container, props, id) => {
    const template = element('div', { className: 'dsl-counter' }, [
      element('span', { className: 'count' }, [text(`${props.initialCount || 0}`)]),
      element('button', { className: 'increment' }, [text('+')]),
      element('button', { className: 'decrement' }, [text('-')])
    ]);
    
    const builder = new VNodeBuilder(registry);
    const vnode = builder.buildFromElementTemplate(template, props);
    const div = vnodeToDOM(vnode, container);
    
    // 이벤트 리스너 추가
    let count = props.initialCount || 0;
    const incrementBtn = div.querySelector('.increment')!;
    const decrementBtn = div.querySelector('.decrement')!;
    const countSpan = div.querySelector('.count')!;
    
    incrementBtn.addEventListener('click', () => {
      count++;
      countSpan.textContent = count.toString();
    });
    
    decrementBtn.addEventListener('click', () => {
      count--;
      countSpan.textContent = count.toString();
    });
    
    container.appendChild(div);
    return div;
  },
  
  update: (instance, prevProps, nextProps) => {
    const countSpan = instance.element.querySelector('.count')!;
    if (nextProps.initialCount !== prevProps.initialCount) {
      countSpan.textContent = nextProps.initialCount?.toString() || '0';
    }
  },
  
  unmount: (instance) => {
    instance.element.remove();
  }
};

// 컴포넌트 등록
registry.register(define('dsl-counter', DSLCounter));
```

## Portal 컨테이너 관리 API

### Portal 컨테이너 구조

Portal 시스템은 각 Portal에 대해 독립적인 컨테이너를 생성합니다:

```html
<!-- Target element with existing content -->
<div id="target">
  <div id="existing-content">Existing content</div>
  
  <!-- Portal containers (added by portal system) -->
  <div data-portal="portal-a" data-portal-container="true" style="position: relative;">
    <div>Portal A content</div>
  </div>
  
  <div data-portal="portal-b" data-portal-container="true" style="position: relative;">
    <div>Portal B content</div>
  </div>
</div>
```

### Portal 컨테이너 속성

- `data-portal`: Portal의 고유 식별자
- `data-portal-container="true"`: Portal 컨테이너임을 나타내는 마커
- `style="position: relative"`: Portal 콘텐츠의 위치 기준점

### Portal 컨테이너 관리 함수

```typescript
// Portal 컨테이너 찾기
function findPortalContainer(target: HTMLElement, portalId: string): HTMLElement | null {
  return target.querySelector(`[data-portal="${portalId}"]`);
}

// Portal 컨테이너 생성
function createPortalContainer(portalId: string, target: HTMLElement): HTMLElement {
  const container = document.createElement('div');
  container.setAttribute('data-portal', portalId);
  container.setAttribute('data-portal-container', 'true');
  container.style.position = 'relative';
  target.appendChild(container);
  return container;
}

// Portal 컨테이너 제거
function removePortalContainer(portalId: string, target: HTMLElement): void {
  const container = target.querySelector(`[data-portal="${portalId}"]`);
  if (container) {
    container.remove();
  }
}
```

## Portal 성능 최적화 API

### Portal 업데이트 최적화

Portal 시스템은 다음과 같은 성능 최적화를 제공합니다:

```typescript
// Portal ID 기반 컨테이너 재사용
define('optimized-portal', (props, ctx) => {
  return element('div', [
    // 고정된 Portal ID로 컨테이너 재사용
    portal(document.body, element('div', {
      className: 'optimized-portal',
      style: { position: 'fixed' }
    }, [text('Optimized content')]), 'fixed-portal-id')
  ]);
});

// 조건부 Portal로 불필요한 렌더링 방지
define('conditional-optimized-portal', (props, ctx) => {
  return element('div', [
    when(props.showPortal,
      portal(document.body, element('div', {
        className: 'conditional-portal'
      }, [text('Conditional content')]), 'conditional-portal-id')
    )
  ]);
});
```

### Portal 상태 보존

Portal 업데이트 시 DOM 상태를 보존합니다:

```typescript
// 입력 필드가 있는 Portal - 포커스 상태 보존
define('form-portal', (props, ctx) => {
  return element('div', [
    portal(document.body, element('div', {
      className: 'form-portal',
      style: { position: 'fixed' }
    }, [
      element('input', { 
        type: 'text',
        placeholder: 'Enter text...',
        // 포커스 상태가 Portal 업데이트 시 보존됨
      }),
      element('button', [text('Submit')])
    ]), 'form-portal-id')
  ]);
});
```

### Portal 메모리 관리

```typescript
// Portal 정리 함수
function cleanupPortals(target: HTMLElement): void {
  const portalContainers = target.querySelectorAll('[data-portal-container="true"]');
  portalContainers.forEach(container => {
    container.remove();
  });
}

// 특정 Portal만 정리
function cleanupPortal(portalId: string, target: HTMLElement): void {
  const container = target.querySelector(`[data-portal="${portalId}"]`);
  if (container) {
    container.remove();
  }
}
```

## 관련 문서

- [Portal System Specification](portal-system-spec.md) - Portal 시스템 상세 스펙
- [Decorator Implementation Guide](decorator-implementation-guide.md) - 데코레이터 구현 가이드
- [Renderer DOM Specification](renderer-dom-spec.md) - 렌더링 시스템 스펙
- [DSL to JSON Specification](dsl-json-specification.md) - DSL 문법과 JSON 변환 구조 상세 스펙
