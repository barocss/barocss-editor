# Model to VNode 데이터 흐름

## 개요

모델 데이터가 VNode를 거쳐 DOM에 렌더링되는 과정:

```
Model (attributes) → VNode (attrs) → DOM (attributes)
```

## 상세 흐름

### 1. Model 데이터 구조

```typescript
const model = {
  type: 'button',
  attributes: {           // ← 모델의 attributes 필드
    id: 'button-1',
    title: 'Click me'
  }
};
```

### 2. VNode 생성 과정

#### Step 1: Template 정의
```typescript
define('button', element('button', { 
  id: attr('id'),        // ← attr() 함수는 DataTemplate 객체 생성
  title: attr('title'),
}, [text('Click me')]));
```

#### Step 2: VNode 생성 (`factory.ts`)
```typescript
private _setAttributes(vnode: VNode, attributes: Record<string, any>, data: ModelData): void {
  Object.entries(attributes).forEach(([key, value]) => {
    if (value && (value as any).type === 'data') {
      // DataTemplate 객체 처리
      const dt = value as any;
      const v = dt.getter ? dt.getter(data) : this._getDataValue(data, dt.path);
      resolvedValue = v === undefined || v === null ? dt.defaultValue : v;
      
      // vnode.attrs에 저장 ← 여기서 attrs가 됨!
      vnode.attrs![key] = resolvedValue;
    }
  });
}
```

**중요**: 모델의 `attributes` 필드 → VNode의 `attrs` 필드로 변환됨

### 3. VNode 데이터 구조

```typescript
const vnode: VNode = {
  tag: 'button',
  attrs: {              // ← VNode의 attrs 필드
    id: 'button-1',
    title: 'Click me'
  },
  children: []
};
```

### 4. DOM 렌더링

VNode의 `attrs`가 DOM의 `attributes`로 변환됨:

```typescript
// DOMOperations.updateAttributes
function updateAttributes(element: HTMLElement, attrs: Record<string, any>): void {
  for (const [key, value] of Object.entries(attrs)) {
    element.setAttribute(key, value);  // ← DOM attributes로 변환
  }
}
```

## 매핑 관계

| 레벨 | 필드명 | 예시 |
|------|--------|------|
| Model | `attributes` | `{ id: 'button-1', title: 'Click me' }` |
| VNode | `attrs` | `{ id: 'button-1', title: 'Click me' }` |
| DOM | `attributes` | `HTMLButtonElement { attributes: { id: '...', title: '...' } }` |

## 변경 감지

Reconciliation 시 변경 감지:

```typescript
// DOMProcessor.processElementNode
const prevAttrs = wip.previousVNode?.attrs || {};  // ← 이전 VNode의 attrs
const nextAttrs = vnode.attrs || {};               // ← 현재 VNode의 attrs

// 변경된 속성만 추출
const changedAttrs: Record<string, any> = {};
const allKeys = new Set([...Object.keys(prevAttrs), ...Object.keys(nextAttrs)]);

for (const key of allKeys) {
  if (prevAttrs[key] !== nextAttrs[key]) {
    changedAttrs[key] = nextAttrs[key];
  }
}
```

## 핵심 정리

1. **Model**: `model.attributes` → 데이터가 오는 소스
2. **VNode**: `vnode.attrs` → VNode에 저장되는 형식
3. **DOM**: `element.attributes` → 실제 DOM 요소의 속성

모델의 `attributes`가 VNode의 `attrs`가 되고, 이것이 DOM의 `attributes`가 됩니다!

