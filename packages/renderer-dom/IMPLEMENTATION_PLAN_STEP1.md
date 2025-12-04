# 1단계 구현 계획: Props vs Context 분리 (Model/Decorator 포함)

## 목표

컴포넌트에서 `props`와 `model`을 명확히 분리하고, `decorator` 정보도 구조적으로 정리하여:
- stype/sid 전파 문제 해결
- 컴포넌트 API 명확화
- model과 decorator 정보를 컴포넌트에서 접근 가능하게

## 현재 문제점

### 1. Props에 Model 데이터가 섞임
```typescript
// VNodeBuilder._buildComponent (1571줄)
const effectiveProps = Object.keys(props).length === 0 ? { ...data } : props;
// props가 없으면 전체 data(stype/sid 포함)를 props로 사용
```

### 2. ComponentInstance에 model 필드 없음
```typescript
// types.ts
interface ComponentInstance {
  id: string;
  element: HTMLElement;
  component: ExternalComponent;
  state: ComponentState;
  props: ComponentProps;  // model 정보가 섞여 있음
  // model 필드 없음
}
```

### 3. ComponentContext에 model 필드 없음
```typescript
// types.ts
interface ComponentContext {
  id: string;
  state: ComponentState;
  props: ComponentProps;  // model 정보가 섞여 있음
  registry: {...};
  // model 필드 없음
  // decorator 정보 없음
}
```

### 4. Decorator 정보가 컴포넌트에 전달되지 않음
- Decorator는 별도로 처리되지만 컴포넌트 context에서 접근 불가
- 컴포넌트가 자신에게 적용된 decorator를 확인할 수 없음

## 구현 계획

### Step 1.1: 타입 정의 업데이트

**파일: `packages/renderer-dom/src/types.ts`**

```typescript
// ComponentInstance에 model 필드 추가
export interface ComponentInstance {
  id: string;
  element: HTMLElement;
  component: ExternalComponent;
  state: ComponentState;
  props: ComponentProps;      // 순수 props (stype/sid/type 제외)
  model: ModelData;           // 원본 모델 데이터 (stype/sid 포함) ✨ 추가
  decorators?: DecoratorData[]; // 적용된 decorator 목록 ✨ 추가
  vnode?: VNode;
  template?: ContextualComponent;
  parentElement?: HTMLElement;
  renderer?: any;
}

// ComponentContext에 model 필드 추가
export interface ComponentContext {
  id: string;
  state: ComponentState;
  props: ComponentProps;      // 순수 props (stype/sid/type 제외)
  model: ModelData;           // 원본 모델 데이터 (stype/sid 포함) ✨ 추가
  decorators?: DecoratorData[]; // 적용된 decorator 목록 ✨ 추가
  registry: {
    get: (name: string) => any;
    getComponent: (name: string) => any;
    register: (definition: any) => void;
    setState: (id: string, state: Record<string, any>) => boolean;
    getState: (id: string) => ComponentState;
    toggleState: (id: string, key: string) => boolean;
  };
  // State management methods
  initState: (initial: Record<string, any>) => void;
  getState: (key: string) => DataValue;
  setState: (newState: Record<string, any>) => void;
  toggleState: (key: string) => void;
}
```

**변경 사항:**
- `ComponentInstance`에 `model: ModelData` 필드 추가
- `ComponentInstance`에 `decorators?: DecoratorData[]` 필드 추가 (선택적)
- `ComponentContext`에 `model: ModelData` 필드 추가
- `ComponentContext`에 `decorators?: DecoratorData[]` 필드 추가 (선택적)

### Step 1.2: Props Sanitization 유틸리티 함수 추가

**파일: `packages/renderer-dom/src/component-manager.ts`**

```typescript
/**
 * Props에서 모델 메타데이터 제거 (stype/sid/type)
 * 순수 전달 데이터만 반환
 */
private sanitizeProps(props: any): ComponentProps {
  if (!props || typeof props !== 'object') return {};
  const { stype, sid, type, ...sanitized } = props;
  return sanitized;
}

/**
 * Model 데이터에서 decorator 정보 추출
 * 현재 노드에 적용된 decorator 목록 반환
 */
private getDecoratorsForNode(
  nodeSid: string,
  decorators: DecoratorData[] = []
): DecoratorData[] {
  return decorators.filter(d => 
    d.target?.sid === nodeSid || 
    d.target?.nodeId === nodeSid
  );
}
```

### Step 1.3: VNodeBuilder._buildComponent 수정

**파일: `packages/renderer-dom/src/vnode/factory.ts`**

**변경 전:**
```typescript
// Resolve props
let props: Record<string, any> = {};
if (typeof template.props === 'function') {
  props = template.props(data);
} else if (template.props) {
  props = template.props;
}

// ...

if (component.managesDOM === false && typeof component.template === 'function') {
  const effectiveProps = Object.keys(props).length === 0 ? { ...data } : props;
  const vnode: VNode = {
    tag: 'div',
    attrs: wrapperAttrs,
    component: {
      name: template.name,
      props: effectiveProps  // 문제: stype/sid 포함
    }
  };
  return vnode;
}
```

**변경 후:**
```typescript
// Resolve props
let resolvedProps: Record<string, any> = {};
if (typeof template.props === 'function') {
  resolvedProps = template.props(data);
} else if (template.props) {
  resolvedProps = template.props;
}

// Props와 Model 분리
// props가 없으면 빈 객체 사용 (전체 data를 props로 사용하지 않음)
const sanitizedProps = this.sanitizeProps(resolvedProps);
const modelData = { ...data };  // 원본 모델 데이터 보존

// Decorator 정보 추출 (buildOptions에서)
const decorators = buildOptions?.decorators || [];

// ...

if (component.managesDOM === false && typeof component.template === 'function') {
  const vnode: VNode = {
    tag: 'div',
    attrs: wrapperAttrs,
    component: {
      name: template.name,
      props: sanitizedProps,  // 순수 props만 저장
      model: modelData,        // 원본 모델 별도 저장 ✨ 추가
      decorators: decorators  // decorator 정보 저장 ✨ 추가
    }
  };
  return vnode;
}
```

**변경 사항:**
- `effectiveProps` 제거
- `sanitizeProps()`로 props 정제
- `vnode.component.props`에 sanitized props만 저장
- `vnode.component.model`에 원본 모델 데이터 저장 (새로 추가)
- `vnode.component.decorators`에 decorator 정보 저장 (새로 추가)

### Step 1.4: ComponentManager.mountComponent 수정

**파일: `packages/renderer-dom/src/component-manager.ts`**

**변경 전:**
```typescript
const instance: ComponentInstance = {
  id: componentId,
  component: component,
  props: vnode.component.props || {},
  state: {},
  element: null,
  mounted: false
};

const componentContext = {
  id: componentId,
  state: instance.state,
  props: instance.props,  // 문제: stype/sid 포함될 수 있음
  registry: context.registry,
  // ...
};
```

**변경 후:**
```typescript
// Props와 Model 분리
const sanitizedProps = this.sanitizeProps(vnode.component?.props || {});
const modelData = vnode.component?.model || vnode.component?.props || {};  // fallback
const decorators = vnode.component?.decorators || [];

const instance: ComponentInstance = {
  id: componentId,
  component: component,
  props: sanitizedProps,      // 순수 props
  model: modelData,            // 원본 모델
  decorators: decorators,      // decorator 정보
  state: {},
  element: null,
  mounted: false
};

const componentContext: ComponentContext = {
  id: componentId,
  state: instance.state,
  props: sanitizedProps,       // 순수 props
  model: instance.model,        // 원본 모델 ✨ 추가
  decorators: instance.decorators, // decorator 정보 ✨ 추가
  registry: context.registry,
  // ...
};
```

**변경 사항:**
- `sanitizeProps()`로 props 정제
- `instance.model`에 원본 모델 데이터 저장
- `instance.decorators`에 decorator 정보 저장
- `componentContext.model`에 model 추가
- `componentContext.decorators`에 decorators 추가

### Step 1.5: ComponentManager.updateComponent 수정

**파일: `packages/renderer-dom/src/component-manager.ts`**

**변경 전:**
```typescript
// Update component props
instance.props = { ...instance.props, ...(nextVNode.component?.props || {}) };

const prevElementTemplate = component.template(prevVNode.component?.props || {}, {
  props: instance.props,  // 문제: stype/sid 포함될 수 있음
  // ...
});
```

**변경 후:**
```typescript
// Props와 Model 분리
const nextSanitizedProps = this.sanitizeProps(nextVNode.component?.props || {});
const nextModelData = nextVNode.component?.model || nextVNode.component?.props || {};
const nextDecorators = nextVNode.component?.decorators || [];

// Update component instance
instance.props = nextSanitizedProps;
instance.model = nextModelData;
instance.decorators = nextDecorators;

const prevElementTemplate = component.template(prevSanitizedProps, {
  id: componentId,
  state: prevState,
  props: prevSanitizedProps,     // 순수 props
  model: instance.model,          // 원본 모델 ✨ 추가
  decorators: instance.decorators, // decorator 정보 ✨ 추가
  registry: context.registry,
  // ...
});

const nextElementTemplate = component.template(nextSanitizedProps, {
  id: componentId,
  state: instance.state,
  props: nextSanitizedProps,      // 순수 props
  model: nextModelData,           // 원본 모델 ✨ 추가
  decorators: nextDecorators,     // decorator 정보 ✨ 추가
  registry: context.registry,
  // ...
});
```

**변경 사항:**
- `sanitizeProps()`로 props 정제
- `instance.model`, `instance.decorators` 업데이트
- 템플릿 함수 호출 시 `model`, `decorators` 전달

### Step 1.6: ComponentManager.setState 수정

**파일: `packages/renderer-dom/src/component-manager.ts`**

**변경 전:**
```typescript
const prevTemplate = component.template(instance.props, {
  props: instance.props,  // 문제: stype/sid 포함될 수 있음
  // ...
});
const safePrevData = (() => { const { stype, sid, type, ...rest } = (instance.props || {}) as any; return rest; })();
```

**변경 후:**
```typescript
const prevTemplate = component.template(instance.props, {
  id: componentId,
  state: prevState,
  props: instance.props,         // 이미 sanitized
  model: instance.model,          // 원본 모델 ✨ 추가
  decorators: instance.decorators, // decorator 정보 ✨ 추가
  registry: this.context?.registry,
  // ...
});

const nextTemplate = component.template(instance.props, {
  id: componentId,
  state: instance.state,
  props: instance.props,         // 이미 sanitized
  model: instance.model,          // 원본 모델 ✨ 추가
  decorators: instance.decorators, // decorator 정보 ✨ 추가
  registry: this.context?.registry,
  // ...
});

// 내부 element 빌드 시에도 sanitized props만 사용
const safeData = instance.props;  // 이미 sanitized
const prevVNode = builder.buildFromElementTemplate(prevTemplate, safeData);
const nextVNode = builder.buildFromElementTemplate(nextTemplate, safeData);
```

**변경 사항:**
- `instance.props`는 이미 sanitized이므로 추가 정제 불필요
- 템플릿 함수 호출 시 `model`, `decorators` 전달
- 내부 element 빌드 시 `instance.props` 사용 (이미 sanitized)

### Step 1.7: VNode.component 타입 확장

**파일: `packages/renderer-dom/src/vnode/types.ts` 또는 관련 타입 파일**

**변경 전:**
```typescript
interface VNode {
  // ...
  component?: {
    name: string;
    props: ComponentProps;
  };
}
```

**변경 후:**
```typescript
interface VNode {
  // ...
  component?: {
    name: string;
    props: ComponentProps;      // 순수 props
    model?: ModelData;           // 원본 모델 데이터 ✨ 추가
    decorators?: DecoratorData[]; // decorator 정보 ✨ 추가
  };
}
```

**변경 사항:**
- `vnode.component.model` 필드 추가
- `vnode.component.decorators` 필드 추가

### Step 1.8: 템플릿 함수 시그니처 업데이트 (사용 예시)

**컴포넌트 템플릿 함수 사용 예시:**

```typescript
// 변경 전
define('paragraph', (props, context) => {
  // props에 stype/sid가 포함될 수 있음
  const sid = props.sid;  // ❌ 문제
  return element('p', [slot('content')]);
});

// 변경 후
define('paragraph', (props, context) => {
  // props: 순수 전달 데이터 (stype/sid 제외)
  // context.model: 원본 모델 데이터 (stype/sid 포함)
  // context.decorators: 적용된 decorator 목록
  
  const sid = context.model.sid;  // ✅ 올바름
  const stype = context.model.stype;  // ✅ 올바름
  
  // Decorator 확인
  const hasHighlight = context.decorators?.some(d => d.stype === 'highlight');
  
  return element('p', {
    'data-bc-sid': sid,
    className: hasHighlight ? 'highlighted' : ''
  }, [slot('content')]);
});
```

## 구현 순서

1. ✅ **타입 정의 업데이트** (`types.ts`)
   - `ComponentInstance`에 `model`, `decorators` 필드 추가
   - `ComponentContext`에 `model`, `decorators` 필드 추가
   - `VNode.component` 타입 확장

2. ✅ **유틸리티 함수 추가** (`component-manager.ts`)
   - `sanitizeProps()` 함수
   - `getDecoratorsForNode()` 함수 (필요시)

3. ✅ **VNodeBuilder 수정** (`vnode/factory.ts`)
   - `_buildComponent`에서 `effectiveProps` 제거
   - props/model/decorators 분리
   - `vnode.component`에 `model`, `decorators` 저장

4. ✅ **ComponentManager 수정** (`component-manager.ts`)
   - `mountComponent`: props/model/decorators 분리
   - `updateComponent`: props/model/decorators 업데이트
   - `setState`: model/decorators 전달

5. ✅ **테스트 실행 및 확인**
   - 기존 테스트 통과 확인
   - 컴포넌트 state 테스트 확인

## 예상 효과

1. **stype/sid 전파 문제 해결**
   - props는 순수 전달 데이터만 포함
   - model은 별도 필드로 관리

2. **컴포넌트 API 명확화**
   - `props`: 컴포넌트 API (순수 데이터)
   - `context.model`: 원본 모델 데이터
   - `context.decorators`: 적용된 decorator 목록

3. **Decorator 접근 가능**
   - 컴포넌트에서 자신에게 적용된 decorator 확인 가능
   - decorator 기반 조건부 렌더링 가능

4. **타입 안정성 향상**
   - 명확한 타입 분리
   - 컴파일 타임 오류 검출 가능

## 주의사항

1. **하위 호환성**
   - 기존 코드에서 `props.sid`, `props.stype` 사용하는 경우가 있을 수 있음
   - 마이그레이션 가이드 필요

2. **Decorator 전달**
   - `buildOptions.decorators`에서 decorator 정보를 가져와야 함
   - 현재 decorator 처리 방식 확인 필요

3. **테스트 업데이트**
   - 기존 테스트가 props에 stype/sid를 기대하는 경우 수정 필요

## 다음 단계 (2단계 준비)

1단계 완료 후:
- 전역 서비스 접근 (Registry 확장)
- Editor 주입
- ComponentManager에서 Registry 확장 사용

