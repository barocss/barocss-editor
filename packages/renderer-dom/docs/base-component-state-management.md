# BaseComponentState 관리 구조

## 개요

`BaseComponentState` 인스턴스는 `sid` 기반으로 관리되며, `ComponentManager`가 이를 담당합니다.

## 관리 구조

### 1. ComponentManager가 BaseComponentState를 관리

```
ComponentManager
  └── componentInstances: Map<string, ComponentInstance>
        └── key: sid (componentId)
        └── value: ComponentInstance
              └── __stateInstance: BaseComponentState
```

**중요:**
- `ComponentManager`는 `sid` 기반으로 컴포넌트 인스턴스를 관리합니다
- 각 `ComponentInstance`는 `__stateInstance`로 `BaseComponentState`를 포함합니다
- `componentId = sid` (generateComponentId가 sid를 우선 사용)

### 2. BaseComponentState 생성 시점

```typescript
// ComponentManager.mountComponent()에서
const componentId = this.generateComponentId(vnode);  // sid를 우선 사용
const existingInstance = this.componentInstances.get(componentId);

if (existingInstance) {
  // 기존 인스턴스 재사용 → __stateInstance 보존
  instance = existingInstance;
} else {
  // 새 인스턴스 생성
  const StateClass = StateRegistry.get(vnode.stype);
  if (StateClass) {
    const stateObj = new StateClass();
    instance.__stateInstance = stateObj as BaseComponentState;
  }
}
```

### 3. sid 기반 관리

```typescript
// generateComponentId 우선순위:
// 1. vnode.sid (최우선)
// 2. vnode.attrs['data-bc-sid'] (fallback)
// 3. stype + props hash (fallback)
// 4. random (fallback)

public generateComponentId(vnode: VNode): string {
  if (vnode.sid) {
    return String(vnode.sid);  // sid를 직접 사용
  }
  // ... fallback ...
}
```

## ComponentManager의 역할

### 글로벌 관리자

`ComponentManager`는 `DOMRenderer`의 인스턴스 변수로 존재하지만, 다음과 같은 역할을 합니다:

1. **sid 기반 인스턴스 관리**
   - `componentInstances: Map<sid, ComponentInstance>`
   - 동일 `sid`면 동일 인스턴스 재사용

2. **BaseComponentState 생명주기 관리**
   - 마운트: `new StateClass()` 생성
   - 업데이트: 기존 `__stateInstance` 보존
   - 언마운트: `componentInstances.delete(sid)`로 제거

3. **상태 조회 API 제공**
   - `getComponentState(componentId)`: VNodeBuilder에서 사용
   - `getComponentInstance(sid)`: 외부에서 접근

## 현재 구조의 장점

1. **sid 기반 일관성**
   - `ComponentInstance.id = sid`
   - `BaseComponentState`도 `sid` 기반으로 관리됨

2. **상태 보존**
   - 동일 `sid` 업데이트 시 `__stateInstance` 보존
   - 상태가 유지되어 안정적

3. **명확한 책임 분리**
   - `ComponentManager`: 인스턴스 및 상태 관리
   - `VNodeBuilder`: VNode 생성
   - `Reconciler`: DOM 업데이트

## 주의사항

### ComponentManager의 범위

현재 `ComponentManager`는 `DOMRenderer`의 인스턴스 변수로 존재합니다:

```typescript
class DOMRenderer {
  private componentManager: ComponentManager;  // 인스턴스 변수
}
```

**장점:**
- 렌더러별로 독립적인 인스턴스 관리 가능

**단점:**
- 여러 `DOMRenderer` 인스턴스가 있으면 각각 다른 상태 관리

**권장사항:**
- 일반적으로 단일 `DOMRenderer` 인스턴스를 사용
- `ComponentManager`는 이미 `sid` 기반으로 관리되므로, 같은 `sid`는 항상 같은 인스턴스를 참조

## 정리

1. ✅ `BaseComponentState`는 `ComponentManager`에서 `sid` 기반으로 관리됨
2. ✅ `ComponentManager`가 이미 글로벌 관리자 역할을 수행
3. ✅ `generateComponentId`가 `sid`를 우선 사용하도록 수정됨
4. ✅ 기존 인스턴스 재사용 시 `__stateInstance` 보존됨

## 결론

현재 구조는 올바르게 설계되어 있습니다:
- `ComponentManager`가 `sid` 기반으로 `BaseComponentState`를 관리
- `ComponentManager`는 `DOMRenderer`의 인스턴스 변수이지만, `sid` 기반 관리로 일관성 보장
- 추가적인 글로벌 싱글톤 패턴은 필요하지 않음 (현재 구조로 충분)

