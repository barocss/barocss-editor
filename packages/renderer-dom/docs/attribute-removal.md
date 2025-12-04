# 속성 삭제 처리

## React 방식과 동일한 속성 삭제

속성도 Insert, Update, Delete 개념으로 처리됩니다.

## 속성 삭제 시점

### Commit Phase (`commitFiberNode`)

```typescript
// 속성 및 스타일 업데이트 (HTMLElement인 경우만)
if (domElement instanceof HTMLElement) {
  if (vnode.attrs) {
    dom.updateAttributes(domElement, prevVNode?.attrs, vnode.attrs);
  }
  if (vnode.style) {
    dom.updateStyles(domElement, prevVNode?.style, vnode.style as any);
  }
}
```

**동작**:
- `effectTag === 'PLACEMENT'`: 새 DOM 노드에 속성 설정 (삽입)
- `effectTag === 'UPDATE'`: 이전 속성과 비교하여 변경된 속성만 업데이트/삭제
- `effectTag === 'DELETION'`: DOM 노드 자체가 삭제되므로 속성도 함께 삭제됨

## 속성 삭제 로직 (`updateAttributes`)

### 1. 이전 속성에 있지만 새 속성에 없는 경우

```typescript
// 1. prevVNode에 있지만 nextVNode에 없는 속성 제거
if (prevAttrs) {
  for (const key of Object.keys(prevAttrs)) {
    if (!(key in nextAttrs)) {
      // 제거
      if (key === 'className' || key === 'class') {
        element.removeAttribute('class');
        (element as any).className = '';
      } else {
        removeAttributeWithNamespace(element, key);
      }
    }
  }
}
```

**동작**:
- `prevAttrs`의 모든 키를 순회
- `nextAttrs`에 해당 키가 없으면 속성 제거
- `class`/`className`은 특별 처리: `removeAttribute('class')` + `className = ''`
- 다른 속성은 `removeAttributeWithNamespace` 사용

### 2. 새 속성 값이 `undefined` 또는 `null`인 경우

```typescript
// 2. nextVNode 속성 적용/업데이트 (prevVNode와 다르면)
for (const [key, value] of Object.entries(nextAttrs)) {
  // Treat undefined/null as removal
  if (value === undefined || value === null) {
    if (key === 'className' || key === 'class') {
      element.removeAttribute('class');
      (element as any).className = '';
    } else if (prevAttrs && key in prevAttrs) {
      removeAttributeWithNamespace(element, key);
    }
    continue;
  }
  // ...
}
```

**동작**:
- `nextAttrs`의 값이 `undefined` 또는 `null`이면 속성 제거
- `prevAttrs`에 해당 키가 있었던 경우에만 제거 (이전에 없었던 속성은 무시)

## `removeAttributeWithNamespace` 구현

```typescript
export function removeAttributeWithNamespace(element: HTMLElement, key: string): void {
  const namespace = getAttributeNamespace(element, key);
  if (namespace) {
    const localName = key.includes(':') ? key.split(':')[1] : key;
    element.removeAttributeNS(namespace, localName);
  } else {
    element.removeAttribute(key);
  }
}
```

**동작**:
- Namespace가 필요한 속성: `removeAttributeNS(namespace, localName)` 사용
- 일반 속성: `removeAttribute(key)` 사용

## 속성 삭제 예시

### 예시 1: 속성이 제거된 경우

```typescript
// 이전 VNode
prevVNode = {
  attrs: {
    'data-test': 'value1',
    'class': 'old-class'
  }
}

// 새 VNode
vnode = {
  attrs: {
    'class': 'new-class'
    // 'data-test'가 없음
  }
}

// 결과: 'data-test' 속성이 제거됨
element.removeAttribute('data-test');
```

### 예시 2: 속성 값이 `null`로 설정된 경우

```typescript
// 이전 VNode
prevVNode = {
  attrs: {
    'data-test': 'value1'
  }
}

// 새 VNode
vnode = {
  attrs: {
    'data-test': null  // 명시적으로 null로 설정
  }
}

// 결과: 'data-test' 속성이 제거됨
element.removeAttribute('data-test');
```

### 예시 3: `class` 속성 제거

```typescript
// 이전 VNode
prevVNode = {
  attrs: {
    'class': 'old-class'
  }
}

// 새 VNode
vnode = {
  attrs: {
    // 'class'가 없음
  }
}

// 결과: 'class' 속성이 제거됨
element.removeAttribute('class');
element.className = '';
```

## React와의 비교

### React의 속성 삭제

React는 `commitUpdate`에서:
1. 이전 props와 새 props를 비교
2. 이전 props에 있지만 새 props에 없는 속성 제거
3. `removeAttribute` 또는 `removeAttributeNS` 사용

### 현재 구현

현재 구현은 React와 동일:
1. `updateAttributes`에서 `prevAttrs`와 `nextAttrs` 비교
2. 이전 속성에 있지만 새 속성에 없는 속성 제거
3. `removeAttributeWithNamespace` 사용 (namespace 지원)

## 스타일 삭제

스타일도 동일한 방식으로 처리:

```typescript
public updateStyles(
  element: HTMLElement,
  prevStyles: Record<string, any> | undefined,
  nextStyles: Record<string, any>
): void {
  // 1. 이전 스타일에 있지만 새 스타일에 없는 속성 제거
  if (prevStyles) {
    for (const key of Object.keys(prevStyles)) {
      if (!(key in nextStyles)) {
        element.style.removeProperty(key);
      }
    }
  }
  
  // 2. 새 스타일 적용/업데이트
  for (const [key, value] of Object.entries(nextStyles)) {
    if (value === undefined || value === null) {
      element.style.removeProperty(key);
    } else {
      element.style.setProperty(key, String(value));
    }
  }
}
```

**동작**:
- 이전 스타일에 있지만 새 스타일에 없는 속성: `style.removeProperty(key)`
- 새 스타일 값이 `undefined` 또는 `null`: `style.removeProperty(key)`
- 새 스타일 값이 있으면: `style.setProperty(key, value)`

