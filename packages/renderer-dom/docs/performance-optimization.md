# 성능 최적화 방안: setState 시 전체 재빌드 최적화

## 현재 상황

### 문제점
`context.setState()` 호출 시:
1. `changeState` 이벤트 발생
2. `DOMRenderer.render()` 호출
3. **전체 VNode 트리를 root부터 다시 빌드**
4. Fiber reconciler로 실제 변경된 부분만 DOM 업데이트

**성능 이슈:**
- VNode 빌드 자체는 전체를 다시 수행 (비용이 큼)
- 큰 앱에서 컴포넌트 하나만 변경해도 전체 재빌드
- React도 비슷하지만 `React.memo`, `useMemo` 등으로 최적화

### 현재 최적화
✅ **Fiber reconciler**: 실제 DOM 업데이트는 효율적 (변경된 부분만)
✅ **배치 업데이트**: `queueMicrotask`로 여러 `setState`를 한 번에 처리
✅ **컴포넌트 인스턴스 재사용**: `sid` 기반으로 인스턴스 유지

## 최적화 방안

### 방안 1: 컴포넌트 메모이제이션 (React.memo 패턴) ⭐ **추천**

**개념:**
- 컴포넌트의 `props`, `model`, `state`가 변경되지 않으면 VNode 재빌드 스킵
- 이전 VNode를 재사용하여 빌드 비용 절감

**구현:**

```typescript
// VNodeBuilder에 메모이제이션 추가
class VNodeBuilder {
  private componentMemoCache: Map<string, {
    vnode: VNode;
    props: any;
    model: any;
    state: any;
    timestamp: number;
  }> = new Map();

  private _buildComponent(...): VNode {
    const componentId = this.generateComponentId(vnode);
    
    // 기존 인스턴스에서 state 가져오기
    const existingInstance = this.componentStateProvider?.getComponentInstance?.(componentId);
    const currentState = existingInstance?.state || {};
    
    // 메모이제이션 체크
    const memoKey = `${componentId}:${JSON.stringify(props)}:${JSON.stringify(model)}:${JSON.stringify(currentState)}`;
    const cached = this.componentMemoCache.get(memoKey);
    
    if (cached && this._shouldUseMemo(cached, props, model, currentState)) {
      // 이전 VNode 재사용 (얕은 복사로 참조 유지)
      return this._cloneVNode(cached.vnode);
    }
    
    // 실제 빌드 수행
    const vnode = this._buildComponentInternal(...);
    
    // 캐시 저장
    this.componentMemoCache.set(memoKey, {
      vnode,
      props: { ...props },
      model: { ...model },
      state: { ...currentState },
      timestamp: Date.now()
    });
    
    return vnode;
  }
  
  private _shouldUseMemo(
    cached: any,
    props: any,
    model: any,
    state: any
  ): boolean {
    // 얕은 비교로 변경 여부 확인
    return (
      shallowEqual(cached.props, props) &&
      shallowEqual(cached.model, model) &&
      shallowEqual(cached.state, state)
    );
  }
}
```

**장점:**
- ✅ 빌드 비용 대폭 감소 (변경되지 않은 컴포넌트는 스킵)
- ✅ React와 유사한 패턴 (개발자 친화적)
- ✅ 기존 구조와 호환 (점진적 적용 가능)

**단점:**
- ⚠️ 메모리 사용량 증가 (캐시 저장)
- ⚠️ 얕은 비교 한계 (깊은 객체 변경 감지 어려움)

**개선:**
- WeakMap 사용으로 메모리 누수 방지
- 깊은 비교 옵션 제공 (선택적)

---

### 방안 2: 부분 재빌드 (Sub-tree Rebuild)

**개념:**
- 변경된 컴포넌트와 그 하위만 재빌드
- 나머지는 이전 VNode 재사용

**구현:**

```typescript
class VNodeBuilder {
  private _buildWithPartialRebuild(
    rootVNode: VNode,
    changedComponentIds: Set<string>
  ): VNode {
    // 변경된 컴포넌트만 재빌드
    return this._rebuildSubtree(rootVNode, changedComponentIds);
  }
  
  private _rebuildSubtree(
    vnode: VNode,
    changedIds: Set<string>
  ): VNode {
    const componentId = this.generateComponentId(vnode);
    
    // 변경되지 않은 컴포넌트는 이전 VNode 재사용
    if (!changedIds.has(componentId)) {
      return vnode; // 이전 VNode 그대로 반환
    }
    
    // 변경된 컴포넌트만 재빌드
    const newVNode = this._buildComponent(...);
    
    // 자식도 재귀적으로 처리
    if (Array.isArray(newVNode.children)) {
      newVNode.children = newVNode.children.map(child =>
        this._rebuildSubtree(child, changedIds)
      );
    }
    
    return newVNode;
  }
}
```

**장점:**
- ✅ 빌드 범위 최소화
- ✅ 성능 향상 (변경된 부분만)

**단점:**
- ⚠️ **일관성 문제**: 전체 모델과 동기화 어려움
- ⚠️ 복잡성 증가 (부분 업데이트 경계 관리)
- ⚠️ 버그 위험 (상태 불일치 가능)

**결론:** 현재 아키텍처의 "전체 빌드" 원칙과 충돌하므로 **비추천**

---

### 방안 3: Lazy Evaluation (지연 평가)

**개념:**
- VNode 빌드를 지연하여 필요한 부분만 빌드
- 화면에 보이는 부분만 먼저 빌드

**구현:**

```typescript
class VNodeBuilder {
  private _buildLazy(vnode: VNode, depth: number = 0): VNode {
    // 깊이가 깊으면 지연 빌드
    if (depth > MAX_DEPTH) {
      return this._createLazyVNode(vnode);
    }
    
    // 일반 빌드
    return this._buildComponent(...);
  }
  
  private _createLazyVNode(vnode: VNode): VNode {
    return {
      ...vnode,
      _lazy: true,
      _buildFn: () => this._buildComponent(...)
    };
  }
}
```

**장점:**
- ✅ 초기 렌더링 속도 향상
- ✅ 메모리 사용량 감소

**단점:**
- ⚠️ 복잡성 증가
- ⚠️ 스크롤/인터랙션 시 추가 빌드 필요
- ⚠️ 현재 구조와 맞지 않음

**결론:** 에디터 특성상 모든 노드가 필요하므로 **비추천**

---

### 방안 4: Props 비교 최적화 (현재 구조 개선)

**개념:**
- 컴포넌트 빌드 전에 props/model/state 비교
- 변경되지 않으면 템플릿 함수 실행 스킵

**구현:**

```typescript
class VNodeBuilder {
  private _buildComponent(...): VNode {
    const componentId = this.generateComponentId(vnode);
    const existingInstance = this.componentStateProvider?.getComponentInstance?.(componentId);
    
    // Props/Model/State 비교
    const prevProps = existingInstance?.props || {};
    const prevModel = existingInstance?.model || {};
    const prevState = existingInstance?.state || {};
    
    // 얕은 비교로 변경 여부 확인
    const propsChanged = !shallowEqual(prevProps, props);
    const modelChanged = !shallowEqual(prevModel, model);
    const stateChanged = !shallowEqual(prevState, currentState);
    
    if (!propsChanged && !modelChanged && !stateChanged) {
      // 변경되지 않았으면 이전 VNode 재사용
      return existingInstance.vnode;
    }
    
    // 실제 빌드 수행
    return this._buildComponentInternal(...);
  }
}
```

**장점:**
- ✅ 간단한 구현
- ✅ 기존 구조와 호환
- ✅ 즉시 적용 가능

**단점:**
- ⚠️ 얕은 비교 한계
- ⚠️ 컴포넌트 인스턴스에 이전 VNode 저장 필요

---

## 권장 방안: 하이브리드 접근

### 1단계: Props 비교 최적화 (즉시 적용)
- 방안 4 구현
- 간단하고 효과적

### 2단계: 컴포넌트 메모이제이션 (선택적)
- 방안 1 구현
- 성능이 중요한 컴포넌트에만 적용

### 3단계: 메모이제이션 캐시 관리
- WeakMap 사용
- LRU 캐시로 메모리 관리

## 성능 측정

### 현재 성능
- 전체 빌드: O(n) (n = 컴포넌트 수)
- DOM 업데이트: O(m) (m = 변경된 노드 수, Fiber reconciler)

### 최적화 후 예상 성능
- 전체 빌드: O(k) (k = 변경된 컴포넌트 수, 메모이제이션 적용 시)
- DOM 업데이트: O(m) (변화 없음)

### 벤치마크 예시
```
1000개 컴포넌트, 1개만 변경:
- 현재: 1000개 빌드 + 1개 DOM 업데이트
- 최적화 후: 1개 빌드 + 1개 DOM 업데이트
```

## 구현 체크리스트

### 방안 4 (Props 비교 최적화)
- [ ] `VNodeBuilder._buildComponent`에 props/model/state 비교 로직 추가
- [ ] `ComponentInstance`에 `vnode` 저장
- [ ] 얕은 비교 유틸리티 (`shallowEqual`) 추가
- [ ] 테스트 작성

### 방안 1 (컴포넌트 메모이제이션)
- [ ] 메모이제이션 캐시 구조 설계
- [ ] 캐시 키 생성 로직
- [ ] 캐시 무효화 전략
- [ ] WeakMap 기반 메모리 관리
- [ ] 테스트 작성

## 결론

### 문제점 재검토

**방안 4 (Props 비교 최적화)의 한계:**
- `data('text')`, `slot('content')`는 중첩된 모델 구조에 의존
- 깊은 비교가 필요하지만 비용이 너무 큼
- **방안 4는 적용 불가능**

**방안 1 (메모이제이션)의 한계:**
- 같은 문제: 모델의 깊은 비교 필요
- 메모리 사용량 증가 + 비교 비용 증가

### 현실적인 접근

**현재 구조의 장점:**
- ✅ **Fiber reconciler**: DOM 업데이트는 이미 효율적 (변경된 부분만)
- ✅ **일관성 보장**: 전체 빌드로 항상 정확한 상태
- ✅ **배치 업데이트**: `queueMicrotask`로 여러 `setState`를 한 번에 처리

**React도 비슷한 패턴:**
- React도 전체 컴포넌트 트리를 다시 렌더링합니다
- Virtual DOM diffing으로 실제 DOM 업데이트만 최적화
- 우리도 Fiber reconciler로 동일한 최적화를 하고 있음

### 최종 권장 사항

**1. 현재 구조 유지 (기본 전략)**
- 전체 VNode 빌드는 유지
- Fiber reconciler가 DOM 업데이트를 효율적으로 처리
- 대부분의 앱에서 충분히 빠름

**2. 추가 최적화 (필요 시)**
- **버전 기반 비교**: 모델에 `__version` 필드 추가하여 빠른 변경 감지
- **개발자 주도 최적화**: React.memo 같은 API 제공 (선택적)
- **프로파일링**: 실제 병목 지점 확인 후 타겟팅 최적화

**3. 성능 측정**
- 실제 앱에서 프로파일링 수행
- VNode 빌드 vs DOM 업데이트 비용 비교
- 필요할 때만 추가 최적화 적용

### 성능 목표 (수정)

- ✅ **DOM 업데이트 최적화**: Fiber reconciler로 이미 완료
- ✅ **배치 업데이트**: `queueMicrotask`로 이미 완료
- ⚠️ **VNode 빌드 최적화**: 깊은 비교 문제로 어려움
- 💡 **대안**: 버전 기반 비교 또는 개발자 주도 최적화

**결론**: 현재 구조가 가장 현실적이고 안전합니다. 성능 문제가 실제로 발생하면 그때 타겟팅 최적화를 적용하는 것이 좋습니다.

