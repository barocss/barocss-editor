# 부분 업데이트 구현 방안

## 현재 상황

### 현재 구조
```typescript
// changeState 이벤트에 sid가 전달됨
this.componentManager.on('changeState', (_sid: string) => {
  // 하지만 _sid를 무시하고 전체 재렌더링
  this.render(this.rootElement, this.lastModel, ...);
});
```

### 문제점
- `changeState` 이벤트에 `sid`가 전달되지만 사용하지 않음
- 항상 전체 재렌더링
- 성능 이슈 가능성

---

## 부분 업데이트 구현 방안

### 방안 1: 변경된 컴포넌트부터 하위만 재빌드 ⭐ **추천**

**개념:**
- 변경된 컴포넌트의 `sid`를 사용하여 해당 컴포넌트부터 하위만 재빌드
- React와 유사한 방식

**구현:**

```typescript
// DOMRenderer에 부분 업데이트 메서드 추가
class DOMRenderer {
  /**
   * 부분 업데이트: 변경된 컴포넌트부터 하위만 재빌드
   */
  private renderPartial(sid: string): void {
    if (!this.rootElement || !this.currentVNode) return;
    
    // 변경된 컴포넌트의 VNode 찾기
    const targetVNode = this.findVNodeBySid(this.currentVNode, sid);
    if (!targetVNode) {
      // 찾지 못하면 전체 재렌더링 (fallback)
      this.render(this.rootElement, this.lastModel, ...);
      return;
    }
    
    // 해당 컴포넌트부터 하위만 재빌드
    const newSubTree = this.builder.buildSubTree(
      targetVNode,
      this.lastModel,
      this.lastDecorators || []
    );
    
    // 부분 reconcile
    this.reconciler.reconcilePartial(
      targetVNode,
      newSubTree,
      targetVNode.meta?.domElement as HTMLElement
    );
  }
  
  /**
   * VNode 트리에서 sid로 VNode 찾기
   */
  private findVNodeBySid(vnode: VNode, sid: string): VNode | null {
    if (vnode.sid === sid) return vnode;
    
    if (Array.isArray(vnode.children)) {
      for (const child of vnode.children) {
        if (typeof child === 'object' && child !== null) {
          const found = this.findVNodeBySid(child as VNode, sid);
          if (found) return found;
        }
      }
    }
    
    return null;
  }
}

// changeState 이벤트 핸들러 수정
this.componentManager.on('changeState', (sid: string) => {
  if (!this.rootElement || !this.lastModel) return;
  if (this.renderScheduled) return;
  this.renderScheduled = true;
  queueMicrotask(() => {
    this.renderScheduled = false;
    try {
      // 부분 업데이트 시도
      this.renderPartial(sid);
    } catch (err) {
      // 실패하면 전체 재렌더링 (fallback)
      this.render(this.rootElement, this.lastModel, ...);
    }
  });
});
```

**VNodeBuilder에 부분 빌드 메서드 추가:**

```typescript
class VNodeBuilder {
  /**
   * 부분 빌드: 특정 컴포넌트부터 하위만 재빌드
   */
  buildSubTree(
    targetVNode: VNode,
    rootModel: ModelData,
    decorators: Decorator[]
  ): VNode {
    if (!targetVNode.stype) {
      // 컴포넌트가 아니면 그대로 반환
      return targetVNode;
    }
    
    // 컴포넌트의 모델 데이터 찾기
    const componentModel = this.findModelBySid(rootModel, targetVNode.sid);
    if (!componentModel) {
      return targetVNode;
    }
    
    // 컴포넌트 템플릿 가져오기
    const component = this.registry.getComponent(targetVNode.stype);
    if (!component) {
      return targetVNode;
    }
    
    // 컴포넌트 재빌드
    const template: ComponentTemplate = {
      name: targetVNode.stype,
      props: targetVNode.props || {},
      children: []
    };
    
    const newVNode = this._buildComponent(template, componentModel, {
      decorators: decorators.filter(d => d.target?.nodeId === targetVNode.sid)
    });
    
    if (!newVNode) {
      return targetVNode;
    }
    
    // 하위도 재귀적으로 재빌드
    if (Array.isArray(newVNode.children)) {
      newVNode.children = newVNode.children.map(child => {
        if (typeof child === 'object' && child !== null) {
          const childVNode = child as VNode;
          // 하위 컴포넌트도 재빌드
          if (childVNode.stype) {
            return this.buildSubTree(childVNode, rootModel, decorators);
          }
        }
        return child;
      });
    }
    
    return newVNode;
  }
  
  /**
   * 모델에서 sid로 데이터 찾기
   */
  private findModelBySid(model: ModelData, sid: string): ModelData | null {
    if ((model as any)?.sid === sid) {
      return model;
    }
    
    // children을 재귀적으로 검색
    if (Array.isArray((model as any)?.children)) {
      for (const child of (model as any).children) {
        const found = this.findModelBySid(child, sid);
        if (found) return found;
      }
    }
    
    return null;
  }
}
```

**장점:**
- ✅ 빌드 비용 감소 (변경된 부분만)
- ✅ React와 유사한 패턴
- ✅ 점진적 적용 가능 (fallback으로 전체 재렌더링)

**단점:**
- ⚠️ `data('text')`, `slot('content')` 의존성 문제
- ⚠️ 부모 모델 변경 감지 어려움

---

### 방안 2: 의존성 체크 후 부분/전체 업데이트 선택

**개념:**
- 컴포넌트가 부모 모델에 의존하는지 체크
- 의존성이 없으면 부분 업데이트
- 의존성이 있으면 전체 업데이트

**구현:**

```typescript
class VNodeBuilder {
  /**
   * 컴포넌트가 부모 모델에 의존하는지 체크
   */
  private hasParentModelDependency(vnode: VNode): boolean {
    // data('text'), slot('content') 등을 사용하는지 체크
    // 템플릿을 분석하여 의존성 확인
    
    // 간단한 방법: 템플릿 함수를 실행하여 의존성 추적
    // 또는 템플릿 메타데이터에 의존성 정보 저장
    
    // TODO: 실제 구현 필요
    return false; // 기본값: 의존성 없음
  }
}

class DOMRenderer {
  private renderPartial(sid: string): void {
    const targetVNode = this.findVNodeBySid(this.currentVNode, sid);
    if (!targetVNode) {
      this.render(this.rootElement, this.lastModel, ...);
      return;
    }
    
    // 의존성 체크
    if (this.builder.hasParentModelDependency(targetVNode)) {
      // 의존성이 있으면 전체 재렌더링
      this.render(this.rootElement, this.lastModel, ...);
      return;
    }
    
    // 의존성이 없으면 부분 업데이트
    const newSubTree = this.builder.buildSubTree(...);
    this.reconciler.reconcilePartial(...);
  }
}
```

**장점:**
- ✅ 안전성 보장 (의존성 있을 때 전체 업데이트)
- ✅ 성능 최적화 (의존성 없을 때 부분 업데이트)

**단점:**
- ⚠️ 의존성 체크 로직 복잡
- ⚠️ 템플릿 분석 필요

---

### 방안 3: 하이브리드 접근 (부분 + 전체)

**개념:**
- 기본적으로 부분 업데이트 시도
- 실패하거나 의존성 문제가 있으면 전체 업데이트

**구현:**

```typescript
class DOMRenderer {
  private renderPartial(sid: string): boolean {
    try {
      // 부분 업데이트 시도
      const targetVNode = this.findVNodeBySid(this.currentVNode, sid);
      if (!targetVNode) return false;
      
      // 간단한 체크: 부모 모델 의존성 없으면 부분 업데이트
      if (this.canPartialUpdate(targetVNode)) {
        const newSubTree = this.builder.buildSubTree(...);
        this.reconciler.reconcilePartial(...);
        return true; // 성공
      }
      
      return false; // 부분 업데이트 불가능
    } catch (err) {
      logger.error(LogCategory.RECONCILE, 'Partial update failed', err);
      return false;
    }
  }
  
  private canPartialUpdate(vnode: VNode): boolean {
    // 간단한 휴리스틱:
    // 1. 컴포넌트가 data('text'), slot('content')를 사용하지 않으면 OK
    // 2. 또는 개발자가 명시적으로 표시
    
    // TODO: 실제 구현
    return true; // 기본값: 가능
  }
  
  // changeState 이벤트 핸들러
  this.componentManager.on('changeState', (sid: string) => {
    if (!this.rootElement || !this.lastModel) return;
    if (this.renderScheduled) return;
    this.renderScheduled = true;
    queueMicrotask(() => {
      this.renderScheduled = false;
      try {
        // 부분 업데이트 시도
        if (!this.renderPartial(sid)) {
          // 실패하면 전체 재렌더링
          this.render(this.rootElement, this.lastModel, ...);
        }
      } catch (err) {
        // 에러 발생 시 전체 재렌더링
        this.render(this.rootElement, this.lastModel, ...);
      }
    });
  });
}
```

**장점:**
- ✅ 안전성 보장 (fallback으로 전체 재렌더링)
- ✅ 성능 최적화 (가능할 때만 부분 업데이트)
- ✅ 점진적 적용 가능

**단점:**
- ⚠️ 의존성 체크 로직 필요

---

## 구현 체크리스트

### 1단계: 기본 부분 업데이트
- [ ] `DOMRenderer.renderPartial()` 메서드 추가
- [ ] `VNodeBuilder.buildSubTree()` 메서드 추가
- [ ] `findVNodeBySid()` 유틸리티 추가
- [ ] `changeState` 이벤트 핸들러 수정

### 2단계: 의존성 체크
- [ ] `hasParentModelDependency()` 메서드 추가
- [ ] 템플릿 분석 로직 구현
- [ ] 의존성 정보 캐싱

### 3단계: 부분 Reconcile
- [ ] `Reconciler.reconcilePartial()` 메서드 추가
- [ ] 부분 업데이트 시 Fiber 트리 처리
- [ ] 테스트 작성

### 4단계: 최적화
- [ ] 성능 측정
- [ ] 프로파일링
- [ ] 추가 최적화

---

## 주의사항

### 1. `data('text')`, `slot('content')` 의존성

**문제:**
- 부모 모델에 의존하는 경우 부분 업데이트 불가능
- 전체 재렌더링 필요

**해결:**
- 의존성 체크 로직 필수
- 안전을 위해 기본값은 전체 재렌더링

### 2. 일관성 보장

**문제:**
- 부분 업데이트 시 상태 불일치 가능성

**해결:**
- 항상 fallback으로 전체 재렌더링
- 의심스러우면 전체 재렌더링

### 3. 테스트

**필요한 테스트:**
- 부분 업데이트 성공 케이스
- 부분 업데이트 실패 케이스 (fallback)
- 의존성 체크 케이스
- 성능 측정

---

## 핵심 이해: 부분 업데이트의 실제 동작

### 중요한 사실

**부분 업데이트를 하더라도:**
- ✅ **상위 컴포넌트는 재빌드 안 함** (이것이 이점)
- ⚠️ **변경된 컴포넌트부터 하위 서브트리는 모두 재빌드해야 함**

### 왜 하위는 모두 재빌드해야 하는가?

```
App (Root)
├─ Header
├─ Content
│  └─ Main
│     └─ Counter (setState 호출) ← 여기서 변경
│        ├─ Button
│        ├─ Display
│        └─ Settings
│           └─ Option
```

**Counter에서 `setState` 호출 시:**
- ✅ **상위는 재빌드 안 함**: App, Header, Content, Main
- ⚠️ **하위는 모두 재빌드**: Counter → Button → Display → Settings → Option

**이유:**
1. **State 변경으로 구조가 달라질 수 있음**
   - `if (state.showSettings) { ... }` 같은 조건부 렌더링
   - State에 따라 자식 컴포넌트가 달라질 수 있음

2. **Props 전달**
   - State가 변경되면 하위로 전달되는 props도 변경됨
   - 하위 컴포넌트도 재렌더링 필요

3. **일관성 보장**
   - 하위 구조가 항상 최신 state를 반영해야 함

### React도 동일

**React의 동작:**
```javascript
function Counter() {
  const [count, setCount] = useState(0);
  
  return (
    <div>
      <Button />        ← 재렌더링됨
      <Display />      ← 재렌더링됨
      {count > 5 && <Settings />}  ← 재렌더링됨 (구조 변경 가능)
    </div>
  );
}
```

**Counter에서 `setCount` 호출 시:**
- Counter와 그 **모든 하위 컴포넌트** 재렌더링
- 상위 컴포넌트는 재렌더링 안 됨

### 부분 업데이트의 실제 이점

**전체 재빌드:**
```
빌드 비용: O(n)  (n = 전체 컴포넌트 수)
예: 1000개 컴포넌트 모두 빌드
```

**부분 업데이트:**
```
빌드 비용: O(k)  (k = 변경된 서브트리 크기)
예: 1000개 중 100개 서브트리만 빌드
```

**실제 예시:**
- 전체: 1000개 컴포넌트 빌드
- 부분: 100개 컴포넌트 빌드 (10배 개선)

**하지만:**
- 하위 서브트리는 여전히 모두 재빌드
- 단지 상위는 스킵하는 것

### 결론

**부분 업데이트의 핵심:**
1. ✅ **상위 컴포넌트 스킵** (주요 이점)
2. ⚠️ **변경된 컴포넌트부터 하위는 모두 재빌드** (필수)
3. ✅ **빌드 비용 감소** (상위 스킵으로 인한)

**부분 업데이트는 가능하지만 주의가 필요합니다:**

1. **기본적으로 부분 업데이트 시도**
2. **의존성 체크 필수**
3. **실패 시 전체 재렌더링 (fallback)**
4. **점진적 적용 권장**

**권장 사항:**
- 방안 3 (하이브리드 접근) 추천
- 안전성을 최우선으로
- 성능은 두 번째 우선순위
- **하위 서브트리 재빌드는 필수**라는 점 이해

