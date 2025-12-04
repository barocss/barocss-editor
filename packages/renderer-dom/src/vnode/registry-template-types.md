# Registry.get() 반환 타입 분석

## 개요

`registry.get(nodeType)`은 `RendererDefinition | undefined`를 반환합니다.

```typescript
interface RendererDefinition {
  type: 'renderer';
  nodeType: string;
  template: RenderTemplate | ExternalComponent;
}
```

## template 타입 분석

### 타입 정의

```typescript
type RenderTemplate = ElementTemplate | ComponentTemplate | PortalTemplate;
type template = RenderTemplate | ExternalComponent;
```

### 실제 저장되는 타입

`registry.register()` 로직을 보면:

1. **ExternalComponent** (line 24-27):
   - `managesDOM` 속성이 있으면 → `_components`에만 저장, `_renderers`에는 저장 안 함
   - **→ `registry.get()`으로는 반환되지 않음**
   - `registry.getComponent()`로만 접근 가능

2. **ComponentTemplate** (line 31-38):
   - `type === 'component'`이고 `component` 함수가 있으면
   - `_components`에 저장 (registerContextComponent)
   - **그리고 `_renderers`에도 저장** (line 36)
   - **→ `registry.get()`으로 반환됨**

3. **ElementTemplate** (line 41-42):
   - 그 외의 경우 `_renderers`에 저장
   - **→ `registry.get()`으로 반환됨**

### define() 함수의 변환

`define()` 함수는 모든 템플릿을 ComponentTemplate으로 변환합니다:

1. **Function** → ComponentTemplate (line 357-362)
2. **ElementTemplate** → ComponentTemplate (line 368-381)
3. **ExternalComponent** → ExternalComponent (type: 'external' 추가, line 388-389)

## 결론

### `registry.get(nodeType)`이 반환할 수 있는 것:

1. **ComponentTemplate** (대부분)
   - `define('paragraph', element(...))` → ComponentTemplate으로 변환되어 저장
   - `define('greeting', (props, model, ctx) => ...)` → ComponentTemplate으로 변환되어 저장

2. **ExternalTemplate** (type: 'external')
   - `define('chart', { type: 'external', mount: ..., update: ... })` → ExternalTemplate
   - 하지만 `define()`이 `type: 'external'`을 추가하므로 실제로는 ExternalComponent

3. **레거시 ElementTemplate** (드물게)
   - `define()`을 거치지 않고 직접 `registry.register()`로 등록한 경우
   - 하지만 `define()`을 사용하면 모두 ComponentTemplate으로 변환됨

### `registry.get()`으로 반환되지 않는 것:

- **ExternalComponent** (managesDOM 속성 있음)
  - `_renderers`에 저장되지 않음
  - `registry.getComponent()`로만 접근 가능

## build() 함수에서의 처리

```typescript
const renderer = this.registry.get(nodeType);
if (!renderer) {
  // Fallback: registry.getComponent()로 시도
  const component = this.registry.getComponent?.(nodeType);
  // ...
}

const tmpl = renderer.template;

// 가능한 타입:
// 1. ComponentTemplate (대부분)
// 2. ExternalTemplate (type: 'external')
// 3. ElementTemplate (레거시, 드물게)
```

## 실제 사용 패턴

### 일반적인 경우 (define() 사용)

```typescript
// 모두 ComponentTemplate으로 변환되어 저장됨
define('paragraph', element('p', {}, []));
define('greeting', (props, model, ctx) => element('div', {}, []));
define('chart', { type: 'external', mount: ..., update: ... });

// registry.get()은 모두 ComponentTemplate 반환
const renderer = registry.get('paragraph');  // ComponentTemplate
const renderer2 = registry.get('greeting');  // ComponentTemplate
const renderer3 = registry.get('chart');    // ExternalTemplate (type: 'external')
```

### 특수한 경우 (직접 등록)

```typescript
// 직접 registry.register()로 등록하면 ElementTemplate도 가능
registry.register({
  type: 'renderer',
  nodeType: 'custom',
  template: element('div', {}, [])  // ElementTemplate 직접 저장
});

// 하지만 define()을 사용하면 ComponentTemplate으로 변환됨
```

