# ComponentManager 아키텍처

## 현재 구조

### ComponentManager 생성 위치

```
DOMRenderer (인스턴스)
  └── componentManager: ComponentManager (인스턴스 변수)
  └── builder: VNodeBuilder (componentStateProvider로 ComponentManager 전달)
  └── reconciler: Reconciler (ComponentManager 전달)
```

**현재 상태:**
- `ComponentManager`는 `DOMRenderer`의 인스턴스 변수로 존재
- 각 `DOMRenderer`마다 독립적인 `ComponentManager` 인스턴스
- `VNodeBuilder`는 `componentStateProvider`로 `ComponentManager` 참조를 받음
- `Reconciler`는 `ComponentManager`를 직접 받음

### ComponentContext 생성 위치

`ComponentContext`는 `ComponentManager.mountComponent()`에서 생성됩니다:

```typescript
// ComponentManager.mountComponent()
const componentContext = {
  id: componentId,
  state: stateProxy,
  props: instance.props,
  model: instance.model,
  decorators: instance.decorators,
  registry: context.registry,
  // ... setState, getState, etc.
};
```

## context.instance 설정 위치

### 옵션 1: ComponentManager에서 설정 (권장)

**장점:**
- `ComponentManager`가 이미 `componentInstances` Map을 관리하고 있음
- `BaseComponentState` 인스턴스(`__stateInstance`)도 `ComponentManager`에서 생성/관리
- `mountComponent()`에서 `componentContext`를 생성하는 시점에 `instance` 설정 가능

**구현:**
```typescript
// ComponentManager.mountComponent()
const stateInst: BaseComponentState | undefined = (instance as any).__stateInstance;

const componentContext = {
  // ...
  instance: stateInst,  // BaseComponentState 인스턴스 직접 전달
  // ...
};
```

### 옵션 2: VNodeBuilder에서 설정

**단점:**
- `VNodeBuilder`는 VNode 생성만 담당, 컴포넌트 마운트는 모름
- `ComponentManager`의 인스턴스에 접근하기 어려움
- `componentStateProvider`는 상태 조회만 가능, 인스턴스 접근은 제한적

## 권장 구조

### ComponentManager가 context.instance 설정

```typescript
// ComponentManager.mountComponent()
const stateInst: BaseComponentState | undefined = (instance as any).__stateInstance;

const componentContext = {
  id: componentId,
  state: stateProxy,
  props: instance.props,
  model: instance.model,
  decorators: instance.decorators,
  registry: context.registry,
  instance: stateInst,  // BaseComponentState 인스턴스
  setState: (newState) => {
    // stateInst.set() 호출
    // 전체 render 트리거 (나중에 구현)
  },
  // ...
};
```

**이유:**
1. `ComponentManager`가 이미 `BaseComponentState` 인스턴스를 생성/관리
2. `componentContext` 생성 시점에 `instance` 설정 가능
3. `sid` 기반 관리로 일관성 보장

## ComponentManager의 위치

### 현재: DOMRenderer 인스턴스 변수

**장점:**
- 렌더러별로 독립적인 인스턴스 관리
- 여러 `DOMRenderer` 인스턴스가 각각 관리 가능

**단점:**
- 여러 `DOMRenderer` 인스턴스 간 상태 공유 불가

### 대안: Global Singleton

**장점:**
- 모든 곳에서 동일한 인스턴스 참조
- 상태 공유 용이

**단점:**
- 여러 에디터 인스턴스 사용 시 문제 가능
- 테스트 시 격리 어려움

## 결론

**권장:**
- `context.instance`는 `ComponentManager.mountComponent()`에서 설정
- `ComponentManager`는 현재처럼 `DOMRenderer` 인스턴스 변수로 유지
- `sid` 기반 관리로 같은 `DOMRenderer` 내에서는 일관성 보장

**나중에 구현할 것:**
- `context.instance.setState()` 호출 시 전체 `render`를 트리거 (부분 업데이트 API 없음)
- 이는 `Reconciler` 작업 시 함께 구현

