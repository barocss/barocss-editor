# editor-view-dom과 renderer-dom 연동 명세

## 개요

`editor-view-dom`은 `renderer-dom`을 사용하여 문서를 DOM에 렌더링합니다. 이 문서는 두 패키지 간의 연동 방식과 데이터 흐름을 상세히 설명합니다.

**핵심 원칙**:
- 모든 데이터는 `sid`, `stype` 형식 사용 (변환 불필요)
- 템플릿은 외부에서 `define()`으로 등록
- Component State 변경 시 자동 재렌더링
- Decorator 변경 시 수동 재렌더링 필요

## 아키텍처 개요

```
┌─────────────────────────────────────────────────────────────┐
│                    EditorViewDOM                             │
│                                                              │
│  ┌────────────────────────────────────────────────────┐    │
│  │  Editor (editor-core)                              │    │
│  │  - getDocumentProxy() → Proxy<INode> (권장)        │    │
│  │  - exportDocument() → INode                        │    │
│  │  - dataStore.getAllDecorators() → Decorator[]      │    │
│  └────────────────────────────────────────────────────┘    │
│                          │                                   │
│                          ▼                                   │
│  ┌────────────────────────────────────────────────────┐    │
│  │  Data Processing Layer                            │    │
│  │  - ModelData 형식: 변환 없이 직접 사용             │    │
│  │  - convertToDecoratorData()                       │    │
│  └────────────────────────────────────────────────────┘    │
│                          │                                   │
│                          ▼                                   │
│  ┌────────────────────────────────────────────────────┐    │
│  │  renderer-dom Integration                          │    │
│  │  - DOMRenderer                                     │    │
│  │  - RendererRegistry                                │    │
│  │  - ComponentManager (changeState 이벤트 구독)      │    │
│  └────────────────────────────────────────────────────┘    │
│                          │                                   │
│                          ▼                                   │
│  ┌────────────────────────────────────────────────────┐    │
│  │  Layer System (5 layers)                           │    │
│  │  - content (contentEditable)                       │    │
│  │  - decorator, selection, context, custom          │    │
│  └────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
```

## 데이터 흐름

### 1. 렌더링 요청

```typescript
// EditorViewDOM.render() 호출
view.render(modelData);  // modelData가 있으면 사용
// 또는
view.render();  // editor.getDocumentProxy() 사용 (lazy evaluation)
```

### 2. 데이터 형식

**중요**: 모든 데이터는 이미 `sid`, `stype` 형식을 사용합니다.

```
ModelData 형식 (변환 없이 직접 사용)
    │
    ├─ stype (필수) - 노드 타입
    ├─ sid (필수) - 노드 식별자 (개별 component 관리에 필수)
    ├─ content (ModelData[]) - 자식 노드 배열
    ├─ text - 텍스트 내용
    ├─ marks (Array<{ type, range: [number, number] }>) - 텍스트 마크
    ├─ attributes - 노드 속성 (병합되어 모델 최상위에 위치)
    └─ 기타 속성들
```

**데이터 흐름**:

```
editor.getDocumentProxy() 또는 외부 전달 모델
    │
    ├─ DataStoreExporter.toProxy() (lazy evaluation)
    │  └─ INode를 Proxy로 래핑
    │  └─ content 배열이 ID인 경우, 접근 시에만 실제 노드로 변환
    │
    ▼
ModelData (변환 없이 직접 사용)
    │
    ├─ stype, sid, content, text, marks, attributes 등
    │  모든 필드가 이미 ModelData 형식
    │
    ▼
renderer-dom으로 직접 전달
```

**핵심 사항**:
- **변환 불필요**: 모든 데이터는 이미 `sid`, `stype` 형식을 사용하므로 변환 없이 직접 사용
- **`sid`는 필수**: 개별 component 관리에 필수이며, `stype`과 매칭되어야 함
- **`stype`은 필수**: 노드 타입 식별에 필수
- Proxy를 사용하면 초기 로딩 시간과 메모리 사용량 최적화

### 3. 렌더링 실행

```typescript
// renderer-dom의 DOMRenderer.render() 호출
domRenderer.render(
  container: HTMLElement,      // layers.content
  model: ModelData,              // 모델 (변환 없이 직접 사용)
  decorators: DecoratorData[]    // 데코레이터
);
```

### 4. DOM 업데이트

```
renderer-dom의 Reconciler
    │
    ├─ VNodeBuilder: ModelData → VNode 트리
    ├─ Reconciler: VNode 트리 → DOM diff
    └─ DOMOperations: DOM 업데이트
    │
    ▼
layers.content (contentEditable)
    ├─ data-bc-sid 속성으로 노드 식별
    ├─ data-bc-stype 속성으로 타입 식별
    └─ sid 기반 DOM 재사용 (안정성)
```

## 주요 컴포넌트

### 1. EditorViewDOM 클래스

**역할**: editor-core와 renderer-dom 사이의 브리지

**주요 메서드**:
- `render(tree?: ModelData)`: 문서 렌더링 (전체 재렌더링)
  - `tree`가 없으면 `editor.getDocumentProxy()` 사용
  - `tree`가 있으면 직접 사용
- `destroy()`: 리소스 정리 (이벤트 리스너, MutationObserver, Decorator 등)

**내부 상태**:
- `_rendererRegistry`: RendererRegistry 인스턴스 (외부에서 전달 또는 새로 생성)
- `_domRenderer`: DOMRenderer 인스턴스 (Component State 변경 시 자동 재렌더링)
- `layers.content`: 렌더링 대상 컨테이너

**자동 재렌더링**:
- Component State 변경 시 `changeState` 이벤트가 발생하면 자동으로 전체 재렌더링
- `DOMRenderer`가 `changeState` 이벤트를 구독하여 `queueMicrotask`로 스로틀된 재렌더링 수행
- 모델은 동일하고 상태만 변경된 경우에도 전체 재렌더링 (renderer-dom의 full reconcile)

### 2. 데이터 처리

#### 데이터 형식

**모든 데이터는 이미 ModelData 형식입니다**:

```typescript
{
  sid: 'doc-1',           // 노드 식별자 (필수) - 개별 component 관리에 필수
  stype: 'document',    // 노드 타입 (필수)
  content: [...],         // 자식 노드 배열 (재귀적으로 ModelData 형식)
  text: '...',            // 텍스트 내용 (선택적)
  marks: [...],           // 텍스트 마크 (range 형식)
  attributes: {...},      // 노드 속성 (병합되어 모델 최상위에 위치)
  // attributes의 모든 필드는 모델 최상위에서도 접근 가능
}
```

#### `EditorViewDOM.render()` 처리 로직

```typescript
if (tree) {
  // 외부에서 전달된 모델 - 이미 ModelData 형식 (sid, stype 사용)
  // 변환 없이 직접 사용
  modelData = tree as ModelData;
} else {
  // editor에서 직접 가져오기 - getDocumentProxy() 사용 (lazy evaluation)
  const exported = this.editor.getDocumentProxy?.();
  if (exported) {
    // Proxy로 래핑된 INode (이미 ModelData 호환: sid, stype 사용)
    modelData = exported as ModelData;
  }
}
```

**중요**:
- 모든 데이터는 이미 `sid`, `stype` 형식을 사용하므로 **변환 불필요**
- `sid`는 **필수** - 개별 component 관리에 필수이며, `stype`과 매칭되어야 함
- `stype`은 **필수** - 노드 타입 식별에 필수
- `main.ts`에서 생성하는 모든 모델은 `sid`, `stype` 형식을 사용

#### `convertToDecoratorData(decorator: any): DecoratorData`

**변환 규칙**:

```typescript
{
  sid: decorator.sid || decorator.id,
  stype: decorator.stype || decorator.type,
  category: decorator.category || 'inline',
  position: decorator.position, // 'before' | 'after' | 'inside'
  target: {
    sid: decorator.target.sid || decorator.target.nodeId,
    startOffset: decorator.target.startOffset,
    endOffset: decorator.target.endOffset
  },
  data: decorator.data || {}  // 템플릿에 전달할 데이터
}
```


## 사용 방법

### 기본 사용

```typescript
import { Editor } from '@barocss/editor-core';
import { EditorViewDOM } from '@barocss/editor-view-dom';
import { DataStore } from '@barocss/datastore';

// 1. Editor 인스턴스 생성
const dataStore = new DataStore();
const editor = new Editor({ dataStore });

// 2. 템플릿 등록 (EditorViewDOM 생성 전에)
import { define, element, slot, data, getGlobalRegistry } from '@barocss/dsl';

define('document', element('div', { className: 'document' }, [slot('content')]));
define('paragraph', element('p', { className: 'paragraph' }, [slot('content')]));
define('heading', (props, model) => {
  const level = model.attributes?.level || 1;
  return element(`h${level}`, { className: 'heading' }, [slot('content')]);
});
// ... 필요한 모든 템플릿 등록

// 3. EditorViewDOM 인스턴스 생성
const container = document.getElementById('editor');
const view = new EditorViewDOM(editor, {
  container,
  registry: getGlobalRegistry(),  // 글로벌 레지스트리 사용 (권장)
  autoRender: true,  // 기본값: true - initialTree가 있으면 자동 렌더링
  // initialTree: { ... }  // 선택적: 초기 문서 (autoRender가 true일 때 자동 렌더링)
});

// 3. 문서 렌더링
// 방법 1: Proxy 기반 (권장 - lazy evaluation)
view.render();  // editor.getDocumentProxy() 사용

// 방법 2: ModelData 직접 전달
view.render({
  sid: 'doc1',
  stype: 'document',
  content: [...]
});
```

### 템플릿 등록

템플릿은 `EditorViewDOM` 생성 **전에** 외부에서 `define()`으로 등록합니다:

```typescript
import { define, element, slot, data, getGlobalRegistry } from '@barocss/dsl';

// 템플릿 등록 (EditorViewDOM 생성 전에)
define('document', element('div', { className: 'document' }, [slot('content')]));
define('paragraph', element('p', { className: 'paragraph' }, [slot('content')]));
define('heading', (props, model) => {
  const level = model.attributes?.level || 1;
  return element(`h${level}`, { className: 'heading' }, [slot('content')]);
});
// ... 필요한 모든 템플릿 등록

// EditorViewDOM 생성 시 글로벌 레지스트리 사용
const view = new EditorViewDOM(editor, {
  container,
  registry: getGlobalRegistry()  // 글로벌 레지스트리 사용 (권장)
});
```

**중요**:
- 템플릿은 `EditorViewDOM` 생성 전에 등록해야 함
- `getGlobalRegistry()`를 사용하면 모든 템플릿이 자동으로 공유됨
- 커스텀 registry를 사용하려면 `new RendererRegistry({ global: false })`로 생성하고 템플릿을 등록한 후 전달
- `global: false` 옵션: local registry에 없는 템플릿은 글로벌 레지스트리에서 자동으로 조회
- `EditorViewDOM` 내부에서 `registerDefaultTemplates()`를 호출하여 기본 템플릿(document, paragraph, heading 등)을 자동 등록하지만, 외부에서 이미 등록된 템플릿은 덮어쓰지 않음

### 문서 업데이트

```typescript
// 전체 문서 업데이트
view.render({
  sid: 'doc1',
  stype: 'document',
  content: [
    {
      sid: 'p1',
      stype: 'paragraph',
      content: [
        { sid: 't1', stype: 'inline-text', text: 'Updated content' }
      ]
    }
  ]
});

// 또는 editor에서 직접 가져오기 (tree 없이)
view.render();  // editor.getDocumentProxy() 사용
```

**중요**: 
- `render()`는 전체 문서를 재렌더링합니다
- renderer-dom의 full reconcile을 수행하므로 sid 기반 DOM 재사용으로 최적화됩니다
- Component State 변경은 자동으로 재렌더링됩니다 (별도 호출 불필요)

## 실제 사용 예시

### 기본 예시

```typescript
import { Editor } from '@barocss/editor-core';
import { EditorViewDOM } from '@barocss/editor-view-dom';
import { DataStore } from '@barocss/datastore';
import { define, element, slot, data, getGlobalRegistry } from '@barocss/dsl';

// 1. 템플릿 등록
define('document', element('div', { className: 'document' }, [slot('content')]));
define('paragraph', element('p', { className: 'paragraph' }, [slot('content')]));
define('inline-text', element('span', { className: 'text' }, [data('text')]));

// 2. Editor 및 EditorViewDOM 생성
const dataStore = new DataStore();
const editor = new Editor({ dataStore });
const container = document.getElementById('editor');
const view = new EditorViewDOM(editor, {
  container,
  registry: getGlobalRegistry()
});

// 3. 문서 로드 및 렌더링
editor.loadDocument({
  sid: 'doc1',
  stype: 'document',
  content: [
    {
      sid: 'p1',
      stype: 'paragraph',
      content: [
        { sid: 't1', stype: 'inline-text', text: 'Hello World' }
      ]
    }
  ]
}, 'session1');

view.render();  // Proxy 기반 렌더링
```

### Component State를 사용하는 복잡한 예시

```typescript
import { defineState, BaseComponentState } from '@barocss/renderer-dom';
import { define, element, slot, data } from '@barocss/dsl';

// Counter 컴포넌트 State 정의
class CounterState extends BaseComponentState {
  initState(initial: Record<string, any>): void {
    this.data.count = initial.count || 0;
  }
}

// Counter 컴포넌트 템플릿 정의
defineState('counter', CounterState);
define('counter', (_props, model, ctx) => {
  // State 초기화 (첫 렌더링 시에만)
  if (!ctx.getState('count')) {
    const initialCount = model.attributes?.count || 0;
    ctx.initState({ count: Number(initialCount) });
  }
  
  const count = ctx.instance?.get('count') ?? ctx.getState('count') ?? 0;
  
  return element('div', { className: 'counter' }, [
    element('span', { className: 'count' }, [String(count)]),
    element('button', {
      className: 'increment',
      onClick: () => {
        // State 변경 (자동 재렌더링 트리거)
        ctx.instance?.set({ count: count + 1 });
      }
    }, ['+'])
  ]);
});

// 문서에 Counter 컴포넌트 포함
editor.loadDocument({
  sid: 'doc1',
  stype: 'document',
  content: [
    {
      sid: 'counter1',
      stype: 'counter',
      attributes: { count: 5 }
    }
  ]
}, 'session1');

view.render();
// State 변경 시 자동으로 재렌더링됨
```

### Marks와 Decorator가 함께 사용되는 예시

```typescript
// Mark 템플릿 등록
import { defineMark } from '@barocss/dsl';

defineMark('bold', element('strong', {}, [data('text')]));
defineMark('italic', element('em', {}, [data('text')]));
defineMark('link', element('a', { 
  href: (d: any) => d?.attributes?.href || '#',
  target: '_blank'
}, [data('text')]));

// 문서에 Marks가 있는 텍스트
editor.loadDocument({
  sid: 'doc1',
  stype: 'document',
  content: [
    {
      sid: 'p1',
      stype: 'paragraph',
      content: [
        {
          sid: 't1',
          stype: 'inline-text',
          text: 'Hello World',
          marks: [
            { type: 'bold', range: [0, 5] },
            { type: 'link', range: [6, 11], attrs: { href: 'https://example.com' } }
          ]
        }
      ]
    }
  ]
}, 'session1');

// Decorator 추가
const dataStore = editor.dataStore;
dataStore.addDecorator({
  sid: 'decorator1',
  stype: 'highlight',
  category: 'inline',
  target: { sid: 't1', startOffset: 0, endOffset: 5 },
  data: { color: '#ffff00' }
});

view.render();  // Marks와 Decorator가 함께 렌더링됨
```

### 동적 리스트 업데이트 예시

```typescript
import { when, each } from '@barocss/dsl';

// 리스트 템플릿 정의
define('list', (props, model) => {
  const type = model.attributes?.type || 'bullet';
  return element(type === 'ordered' ? 'ol' : 'ul', {}, [slot('content')]);
});

define('listItem', element('li', {}, [slot('content')]));

// 동적 리스트 렌더링
let items = [
  { sid: 'item1', stype: 'listItem', content: [{ sid: 't1', stype: 'inline-text', text: 'Item 1' }] },
  { sid: 'item2', stype: 'listItem', content: [{ sid: 't2', stype: 'inline-text', text: 'Item 2' }] }
];

editor.loadDocument({
  sid: 'doc1',
  stype: 'document',
  content: [
    {
      sid: 'list1',
      stype: 'list',
      attributes: { type: 'bullet' },
      content: items
    }
  ]
}, 'session1');

view.render();

// 리스트 아이템 추가
items.push({
  sid: 'item3',
  stype: 'listItem',
  content: [{ sid: 't3', stype: 'inline-text', text: 'Item 3' }]
});

// 업데이트 (sid 기반 DOM 재사용으로 최적화)
view.render({
  sid: 'doc1',
  stype: 'document',
  content: [
    {
      sid: 'list1',
      stype: 'list',
      attributes: { type: 'bullet' },
      content: items
    }
  ]
});
```

### Portal을 사용하는 예시

```typescript
import { portal } from '@barocss/dsl';

// Portal을 사용하는 컴포넌트 정의
define('tooltip', (props, model, ctx) => {
  const text = model.text || model.attributes?.text || '';
  const targetId = model.attributes?.targetId || 'tooltip-container';
  
  return element('span', { className: 'tooltip-trigger' }, [
    data('text'),
    portal(
      () => document.getElementById(targetId) || document.body,
      element('div', { className: 'tooltip-popup' }, [text])
    )
  ]);
});

// 문서에 Portal 컴포넌트 포함
editor.loadDocument({
  sid: 'doc1',
  stype: 'document',
  content: [
    {
      sid: 'p1',
      stype: 'paragraph',
      content: [
        {
          sid: 'tooltip1',
          stype: 'tooltip',
          text: 'Hover me',
          attributes: { targetId: 'tooltip-container' }
        }
      ]
    }
  ]
}, 'session1');

// Portal 대상 컨테이너 생성
const tooltipContainer = document.createElement('div');
tooltipContainer.id = 'tooltip-container';
document.body.appendChild(tooltipContainer);

view.render();
// Portal 내용이 tooltipContainer에 렌더링됨
```

### 조건부 렌더링 (when) 예시

```typescript
import { when } from '@barocss/dsl';

// 조건부 렌더링 컴포넌트
define('conditional', (props, model, ctx) => {
  const show = model.attributes?.show !== false;
  const content = model.content || [];
  
  return when(
    show,
    element('div', { className: 'conditional-content' }, [
      slot('content')
    ]),
    element('div', { className: 'conditional-hidden' }, [])
  );
});

// 문서에 조건부 컴포넌트 포함
editor.loadDocument({
  sid: 'doc1',
  stype: 'document',
  content: [
    {
      sid: 'cond1',
      stype: 'conditional',
      attributes: { show: true },
      content: [
        { sid: 'p1', stype: 'paragraph', content: [{ sid: 't1', stype: 'inline-text', text: 'Visible' }] }
      ]
    }
  ]
}, 'session1');

view.render();

// 조건 변경
view.render({
  sid: 'doc1',
  stype: 'document',
  content: [
    {
      sid: 'cond1',
      stype: 'conditional',
      attributes: { show: false },  // 숨김
      content: [
        { sid: 'p1', stype: 'paragraph', content: [{ sid: 't1', stype: 'inline-text', text: 'Hidden' }] }
      ]
    }
  ]
});
```

### 반복 렌더링 (each) 예시

```typescript
import { each } from '@barocss/dsl';

// 반복 렌더링 컴포넌트
define('itemList', (props, model, ctx) => {
  const items = model.attributes?.items || [];
  
  return element('ul', { className: 'item-list' }, [
    each(items, (item: any) => 
      element('li', { className: 'item' }, [
        element('span', {}, [item.name || ''])
      ])
    )
  ]);
});

// 문서에 반복 컴포넌트 포함
editor.loadDocument({
  sid: 'doc1',
  stype: 'document',
  content: [
    {
      sid: 'list1',
      stype: 'itemList',
      attributes: {
        items: [
          { name: 'Item A' },
          { name: 'Item B' },
          { name: 'Item C' }
        ]
      }
    }
  ]
}, 'session1');

view.render();
```

### 복합 시나리오: Component State + Decorator + Marks

```typescript
// 복잡한 에디터 컴포넌트
class EditorState extends BaseComponentState {
  initState(initial: Record<string, any>): void {
    this.data.mode = initial.mode || 'view';
    this.data.selectedText = initial.selectedText || '';
  }
}

defineState('rich-editor', EditorState);
define('rich-editor', (_props, model, ctx) => {
  // State 초기화
  if (!ctx.getState('mode')) {
    ctx.initState({
      mode: model.attributes?.mode || 'view',
      selectedText: ''
    });
  }
  
  const mode = ctx.instance?.get('mode') ?? ctx.getState('mode') ?? 'view';
  const isEditMode = mode === 'edit';
  
  return element('div', { className: `rich-editor ${mode}` }, [
    element('div', { className: 'toolbar' }, [
      element('button', {
        onClick: () => {
          ctx.instance?.set({ mode: isEditMode ? 'view' : 'edit' });
        }
      }, [isEditMode ? 'View' : 'Edit'])
    ]),
    element('div', { className: 'content', contentEditable: isEditMode }, [
      slot('content')
    ])
  ]);
});

// 문서에 복합 컴포넌트 포함
editor.loadDocument({
  sid: 'doc1',
  stype: 'document',
  content: [
    {
      sid: 'editor1',
      stype: 'rich-editor',
      attributes: { mode: 'view' },
      content: [
        {
          sid: 'p1',
          stype: 'paragraph',
          content: [
            {
              sid: 't1',
              stype: 'inline-text',
              text: 'Rich Text Content',
              marks: [
                { type: 'bold', range: [0, 4] },
                { type: 'italic', range: [5, 9] }
              ]
            }
          ]
        }
      ]
    }
  ]
}, 'session1');

// Decorator 추가
dataStore.addDecorator({
  sid: 'decorator1',
  stype: 'comment',
  category: 'inline',
  target: { sid: 't1', startOffset: 0, endOffset: 4 },
  data: { comment: 'This is bold text' }
});

view.render();
// Component State 변경 시 자동 재렌더링
// Decorator 변경 시 수동 재렌더링 필요
```

## Component State 자동 재렌더링

`renderer-dom`의 `DOMRenderer`는 Component State 변경을 자동으로 감지하고 재렌더링합니다:

```
BaseComponentState.set(patch)
    │
    ├─ ComponentManager.emit('changeState', sid, { state, patch })
    │
    ▼
DOMRenderer (changeState 이벤트 구독)
    │
    ├─ queueMicrotask로 스로틀링
    ├─ lastModel, lastDecorators 사용
    └─ 전체 재렌더링 (full reconcile)
    │
    ▼
DOM 업데이트 (sid 기반 최소 변경)
```

**중요**:
- Component State 변경 시 별도 `render()` 호출 불필요
- `changeState` 이벤트가 자동으로 전체 재렌더링 트리거
- 모델은 동일하고 상태만 변경된 경우에도 전체 재렌더링 (renderer-dom의 full reconcile)
- sid 기반 DOM 재사용으로 실제 DOM 변경은 최소화됨

## Decorator 처리

### Decorator 데이터 흐름

```
DataStore.getAllDecorators()
    │
    ├─ RendererDecorator 형식
    │   ├─ id/sid
    │   ├─ type/stype
    │   ├─ category
    │   ├─ target (nodeId/sid 기반)
    │   └─ data/model
    │
    ▼
convertToDecoratorData()
    │
    ├─ DecoratorData 형식
    │   ├─ sid
    │   ├─ stype
    │   ├─ category ('inline' | 'block' | 'layer')
    │   ├─ position ('before' | 'after' | 'inside')
    │   ├─ target { sid, startOffset?, endOffset? }
    │   └─ data (템플릿에 전달할 데이터)
    │
    ▼
DOMRenderer.render(container, model, decorators)
    │
    ├─ VNodeBuilder가 decorators 처리
    ├─ 인라인: 텍스트와 함께 처리
    ├─ 블록: before/after 위치에 삽입
    └─ 레이어: 별도 레이어에 렌더링
```

### Decorator 카테고리별 처리

1. **inline**: 텍스트 내부에 삽입되는 위젯
   - `target.startOffset`, `target.endOffset` 사용
   - 텍스트와 함께 VNode로 변환

2. **block**: 블록 레벨에서 삽입되는 위젯
   - `position: 'before'` 또는 `'after'`
   - 대상 노드 앞/뒤에 삽입

3. **layer**: 오버레이 형태의 위젯
   - 별도 레이어(`layers.decorator`)에 렌더링
   - CSS positioning으로 배치

### Decorator 업데이트

Decorator가 변경되면 `render()` 또는 `update()`를 호출하여 재렌더링해야 합니다:

```typescript
// Decorator 추가/수정/삭제 후
dataStore.addDecorator({ ... });
// 또는
dataStore.updateDecorator('decorator-id', { ... });
// 또는
dataStore.removeDecorator('decorator-id');

// 재렌더링 (decorator 변경 반영)
view.render();
```

**중요**: 
- Decorator 변경은 자동으로 감지되지 않음
- `render()`를 명시적으로 호출해야 함
- `render()` 호출 시 `dataStore.getAllDecorators()`를 자동으로 가져와서 변환

## 레이어 시스템

`EditorViewDOM`은 5개의 레이어를 사용합니다:

```
Container
├─ Layer 1: Content (z-index: 1)
│  └─ contentEditable = true
│  └─ renderer-dom이 여기에 렌더링
│
├─ Layer 2: Decorator (z-index: 10)
│  └─ layer 카테고리 decorator들
│
├─ Layer 3: Selection (z-index: 100)
│  └─ 선택 영역 표시
│
├─ Layer 4: Context (z-index: 200)
│  └─ 툴팁, 컨텍스트 메뉴
│
└─ Layer 5: Custom (z-index: 1000)
   └─ 커스텀 오버레이
```

**중요**: renderer-dom은 `layers.content`에만 렌더링합니다.

## 주의사항 및 베스트 프랙티스

### 1. 템플릿 등록 순서

- 템플릿은 `EditorViewDOM` 생성 **전에** 외부에서 `define()`으로 등록해야 함
- 같은 `stype`의 템플릿이 이미 등록되어 있으면 덮어쓰지 않음 (안전)

```typescript
// ✅ 올바른 순서
define('custom-type', element('div', {}, []));
const view = new EditorViewDOM(editor, { 
  container,
  registry: getGlobalRegistry() 
});

// ❌ 잘못된 순서 (템플릿이 등록되지 않음)
const view = new EditorViewDOM(editor, { container });
define('custom-type', element('div', {}));
```

### 2. 데이터 형식

**모든 데이터는 ModelData 형식 (sid, stype 사용)**:
- `stype` 필드 필수 - 노드 타입
- `sid` 필드 필수 - 노드 식별자 (개별 component 관리에 필수, stype과 매칭)
- `attributes` - 노드 속성 (병합되어 모델 최상위에서 접근 가능)
- 변환 없이 직접 사용 (성능 최적화)
- Proxy 기반 lazy evaluation 지원

**사용 패턴**:
```typescript
// ✅ 권장: Proxy 사용 (lazy evaluation)
view.render();  // editor.getDocumentProxy() 사용

// ✅ 가능: ModelData 형식 직접 전달 (변환 없음)
view.render({ 
  sid: 'doc1', 
  stype: 'document', 
  content: [...],
  attributes: { ... }  // attributes는 모델 최상위에서 접근 가능
});
```

**중요**: 
- 모든 데이터는 `sid`, `stype` 형식을 사용
- 변환 함수 없이 모델을 그대로 전달

### 3. Marks 형식

- `range: [start, end]` 형식 권장
- `start/end` 형식도 지원하지만 `range`로 변환됨
- 범위는 텍스트 길이를 초과하지 않아야 함

### 4. Decorator Target

- `target.sid` 또는 `target.nodeId` 필수
- `startOffset`/`endOffset`은 inline decorator에만 필요
- block decorator는 `position`만 필요

### 5. 성능 고려사항

- **Proxy 기반 Lazy Evaluation 사용 권장**
  - `editor.getDocumentProxy()`를 사용하면 초기 로딩 시간 단축
  - content 배열이 ID인 경우, 접근 시에만 실제 노드로 변환
  - 대용량 문서에서 메모리 사용량 최적화
  
- 대용량 문서는 `render()` 호출을 최소화
- `render()`와 `update()`는 모두 전체 문서를 재렌더링 (renderer-dom의 full reconcile)
- sid 기반 DOM 재사용으로 불필요한 DOM 조작 최소화
- Component State 변경은 자동으로 재렌더링되므로 별도 `render()` 호출 불필요

- **데이터 처리 최적화**
  - 모든 데이터는 이미 ModelData 형식 (sid, stype 사용)
  - **변환 오버헤드 없음** - 모델을 그대로 전달
  - Proxy를 사용하면 부분 업데이트 시에도 메모리 효율적

### 6. 에러 처리

- `stype` 필드가 없으면 에러 발생 (필수 필드)
- `sid` 필드가 없으면 에러 발생 (필수 필드 - component 관리에 필수)
- 템플릿이 등록되지 않은 `stype`은 에러 발생
- Decorator 변환 실패는 경고만 출력하고 계속 진행

### 7. 리소스 정리

- `destroy()` 메서드를 호출하여 리소스를 정리해야 함
- 이벤트 리스너, MutationObserver, Decorator, 키맵 등 모든 리소스 해제
- 컴포넌트 인스턴스와 DOM 캐시도 정리됨

```typescript
// 사용 완료 후 정리
view.destroy();
```

### 8. 제한사항 및 알려진 이슈

**제한사항**:
- `render()`와 `update()`는 모두 전체 문서를 재렌더링 (부분 업데이트 미지원)
- Decorator 변경은 자동으로 감지되지 않음 (수동 `render()` 호출 필요)
- Component State 변경은 자동 재렌더링되지만, 모델 변경은 수동 호출 필요
- SSR(Server-Side Rendering) 미지원 (DOM API 의존)

**성능 고려사항**:
- 대용량 문서(5000+ 노드)는 렌더링 시간이 증가할 수 있음
- Proxy 기반 lazy evaluation을 사용하면 초기 로딩 시간 단축
- `render()` 호출 빈도를 최소화하여 성능 최적화

**디버깅 팁**:
- 브라우저 개발자 도구에서 `data-bc-sid` 속성으로 노드 식별
- `data-bc-stype` 속성으로 노드 타입 확인
- `console.log`로 `EditorViewDOM`의 내부 상태 확인 (개발 모드)
- 템플릿이 등록되지 않은 경우 `[VNodeBuilder] Renderer not found` 에러 확인

## 통합 체크리스트

렌더링이 올바르게 동작하는지 확인:

- [x] 템플릿이 외부에서 등록됨
- [x] ModelData 형식 직접 사용 (변환 없음)
- [x] Proxy 기반 lazy evaluation 동작
- [x] Decorator 변환이 정확함
- [x] `data-bc-sid` 속성이 DOM에 설정됨
- [x] `data-bc-stype` 속성이 DOM에 설정됨
- [x] sid 기반 DOM 재사용이 동작함
- [x] contentEditable이 정상 동작함
- [x] Selection 매핑이 정확함
- [x] 마크가 있는 텍스트가 올바르게 렌더링됨
- [x] Decorator가 올바른 위치에 렌더링됨
- [x] Portal 렌더링 및 정리
- [x] Component State 관리
- [x] 성능 테스트 (1000/2000개 노드)
- [x] 에러 처리 및 엣지 케이스

## 테스트 커버리지

현재 **89개의 통합 테스트**가 모두 통과했습니다:

- **기본 통합 테스트**: 23개
- **Component State 관리**: 7개
- **Decorator 통합**: 8개
- **Portal 통합**: 8개
- **성능 및 스케일**: 6개
- **복잡한 시나리오**: 7개
- **에러 처리 및 엣지 케이스**: 8개
- **디테일한 통합**: 15개
- **기타**: 7개

자세한 내용은 `test/integration/integration-test-checklist.md`를 참조하세요.

## 문제 해결

### 템플릿을 찾을 수 없음

```
Error: [VNodeBuilder] Renderer not found for nodeType: 'custom-type'
```

**해결책**:
1. `define('custom-type', ...)` 호출 확인
2. `EditorViewDOM` 생성 전에 템플릿 등록 확인
3. 올바른 `registry`에 등록되었는지 확인

### 잘못된 데이터 형식

```
Error: [EditorViewDOM] Invalid tree format: missing stype (required)
```

**해결책**:
1. `stype` 필드 확인 (필수)
2. `sid` 필드 확인 (필수 - component 관리에 필수)
3. `content` 배열의 각 항목도 `stype`, `sid` 필드 확인
4. `marks` 형식 확인 (range 형식 권장)

### Decorator가 렌더링되지 않음

**해결책**:
1. `dataStore.getAllDecorators()` 반환값 확인
2. `convertToDecoratorData()` 변환 결과 확인
3. Decorator의 `target.sid` 또는 `target.nodeId` 확인
4. Decorator 템플릿이 등록되어 있는지 확인
5. Decorator 변경 후 `render()` 또는 `update()` 호출 확인

### Component State 변경이 반영되지 않음

**해결책**:
1. `BaseComponentState.set()` 호출 확인
2. `ComponentManager`가 `changeState` 이벤트를 emit하는지 확인
3. `DOMRenderer`가 `changeState` 이벤트를 구독하는지 확인
4. 자동 재렌더링은 `queueMicrotask`로 스로틀링되므로 약간의 지연이 있을 수 있음

## 최신 변경사항

### Proxy 기반 Lazy Evaluation (2024)

- `editor.getDocumentProxy()` 메서드 추가
- `DataStoreExporter.toProxy()`를 통한 lazy evaluation 지원
- content 배열이 ID인 경우, 접근 시에만 실제 노드로 변환
- 초기 로딩 시간 및 메모리 사용량 최적화

### ModelData 직접 사용

- 모든 데이터는 이미 ModelData 형식 (sid, stype 사용)
- 변환 없이 모델을 그대로 전달
- Proxy 기반 lazy evaluation으로 메모리 효율성 향상

### 통합 테스트 완료

- 89개의 통합 테스트 모두 통과
- Component State, Decorator, Portal, 성능, 복잡한 시나리오, 에러 처리 커버리지 완료

## 참고 자료

- [renderer-dom 명세](../../renderer-dom/docs/renderer-dom-spec.md)
- [renderer-dom README](../../renderer-dom/README.md)
- [DSL 문서](../../dsl/README.md)
- [연동 계획 문서](./renderer-dom-integration-plan.md)
- [통합 테스트 체크리스트](../test/integration/integration-test-checklist.md)
- [toProxy 아키텍처 설명](./toProxy-architecture-explanation.md)

