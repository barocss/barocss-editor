# 컴포넌트 상태 관리 아키텍처 분석

## 현재 문제점

### 1. Props vs Model 누적 문제

**현재 구조:**
```typescript
// VNodeBuilder._buildComponent
const effectiveProps = Object.keys(props).length === 0 ? { ...data } : props;
// props가 없으면 전체 data(stype/sid 포함)를 props로 사용

// ComponentManager.mountComponent
instance.props = vnode.component.props || {};  // data가 props로 전파됨

// componentContext
const componentContext = {
  props: instance.props,  // stype/sid가 포함된 전체 모델 데이터
  state: instance.state,
  // model이 별도로 분리되지 않음
};
```

**문제점:**
- `props`와 `model`이 분리되지 않아 `props`에 모델 메타데이터(stype/sid/type)가 누적
- 컴포넌트 템플릿 함수에서 `props`와 `model`을 구분할 수 없음
- 내부 element 빌드 시 sanitize로 제거하지만, 근본 원인은 해결되지 않음
- `effectiveProps`로 통합하여 전달하면 더욱 혼란스러움

### 2. 컴포넌트 상태 변경 시 동기화 문제

**현재 구조:**
```typescript
// ComponentManager.setState (103-146줄)
setState: (newState) => {
  instance.state = { ...instance.state, ...newState };
  // 로컬 reconcile만 수행
  reconcileFunc(prevVNode, nextVNode, instance.element, reconcileContext);
}
```

**문제점:**
- 컴포넌트 내부 상태 변경 시 로컬 reconcile만 수행
- 외부 모델 변경과 동기화되지 않음
- 예: 컴포넌트가 `count: 1`로 변경했는데, 외부에서 `items` 배열이 바뀌면 반영 안 됨

**사용자 제안 시나리오:**
```
컴포넌트 내부 상태 변경:
  props + model + state → 하나로 구조화 → 해당 영역만 렌더링

외부 모델 변경:
  상위/하위 모델이 바뀌면 컴포넌트 내부 상태와 충돌 가능
  → 전체 재렌더링이 필요
```

## 제안된 해결책

### 1. Props vs Context 분리

**핵심 개념:**
- `props`: 순수 전달 데이터만 (컴포넌트 API 인터페이스)
- `context`: 모델 데이터 + 상태 관리 (내부 사용)
- 컴포넌트 정의: `(props, context) => ElementTemplate`

**구조 변경:**
```typescript
// ComponentManager.mountComponent
const componentContext = {
  id: componentId,
  state: instance.state,
  // props는 순수 전달 데이터만 (stype/sid 제외)
  props: sanitizedProps,  // stype/sid/type 제거된 순수 props
  // context.model에만 모델 데이터 담기
  model: instance.model,  // 원본 모델 데이터 (stype/sid 포함)
  registry: context.registry,
  setState: (newState) => { /* ... */ },
  getState: () => instance.state,
  // ...
};

// 컴포넌트 템플릿 함수
define('counter', (props, context) => {
  // props: 순수 전달 데이터 (예: { label: 'Count' })
  // context.model: 모델 데이터 (예: { stype: 'counter', sid: 'c1', items: [...] })
  // context.state: 컴포넌트 내부 상태 (예: { count: 0 })
  return element('div', [text(String(context.state.count))]);
});
```

**장점:**
- 명확한 책임 분리: props는 API, model은 데이터 소스
- stype/sid 전파 방지: props는 순수 데이터만
- 컴포넌트 재사용성 향상: props 인터페이스가 명확

**단점:**
- 기존 코드 마이그레이션 필요
- 컴포넌트 템플릿에서 `context.model` 접근 필요

### 2. 전체 재렌더링 전략

**핵심 개념:**
- 컴포넌트 내부 상태 변경 시 전체 앱을 다시 렌더링
- 외부 모델 변경과 내부 상태를 하나로 통합하여 일관성 보장
- Reconcile 알고리즘으로 실제 변경된 부분만 DOM 업데이트 (성능 최적화)

#### 2.1 전체 재렌더링 플로우

```
[컴포넌트 내부 상태 변경]
  ↓
ComponentManager.setState({ count: 1 })
  ↓
instance.state = { ...instance.state, count: 1 }
  ↓
onRerenderCallback() 호출
  ↓
DOMRenderer.rerender()
  ↓
[전체 재빌드]
  lastModel + lastDecorators 사용
  ↓
DOMRenderer.build(lastModel, lastDecorators)
  ↓
VNodeBuilder.build() - 전체 VNode 트리 재생성
  ├─ ComponentManager에서 기존 인스턴스 상태 참조
  ├─ props + model + state 통합
  └─ 컴포넌트 템플릿 함수 재실행 (최신 상태 반영)
  ↓
DOMRenderer.render(container, newVNode)
  ↓
DOMReconcile.reconcile(prevVNode, newVNode, container)
  ├─ Virtual DOM diffing
  ├─ 실제 변경된 부분만 DOM 업데이트
  ├─ 컴포넌트 인스턴스 재사용 (id 기반 매칭)
  └─ 불필요한 업데이트 최소화
  ↓
[DOM 업데이트 완료]
```

#### 2.2 구현 구조

**ComponentManager.setState 변경:**
```typescript
// ComponentManager.mountComponent 내부
const componentContext = {
  id: componentId,
  state: instance.state,
  props: sanitizedProps,
  model: instance.model,  // 원본 모델 데이터 저장
  registry: context.registry,
  setState: (newState: Record<string, any>) => {
    // 상태 업데이트
    instance.state = { ...instance.state, ...newState };
    
    // 전체 재렌더링 트리거
    if (this.onRerenderCallback) {
      this.onRerenderCallback();  // DOMRenderer.rerender() 호출
    }
  },
  // ...
};
```

**DOMRenderer.rerender() 복원:**
```typescript
// DOMRenderer 클래스에 추가
private rerenderCallback: (() => void) | null = null;

constructor(registry?: RendererRegistry, _options?: DOMRendererOptions) {
  // ... 기존 초기화 코드 ...
  
  // ComponentManager에 rerender 콜백 등록
  this.componentManager.setOnRerenderCallback(() => {
    this.rerender();
  });
}

/**
 * 전체 재렌더링 수행
 * 저장된 lastModel과 lastDecorators를 사용하여 전체 앱을 다시 렌더링
 */
rerender(): void {
  if (!this.lastModel || !this.rootElement) {
    console.warn('[DOMRenderer] rerender: lastModel or rootElement not available');
    return;
  }
  
  // 전체 VNode 트리 재빌드 (컴포넌트 상태 반영)
  const newVNode = this.build(this.lastModel, this.lastDecorators || []);
  
  // Reconcile을 통한 효율적 DOM 업데이트
  this.render(this.rootElement, newVNode);
}
```

**VNodeBuilder에서 컴포넌트 빌드 시 상태 통합:**
```typescript
// VNodeBuilder._buildComponent 내부
private _buildComponent(template: ComponentTemplate, data: ModelData, ...): VNode {
  // 컴포넌트 인스턴스 ID 생성
  const componentId = this.generateComponentId(vnode);
  
  // ComponentManager에서 기존 인스턴스 가져오기 (있으면)
  const existingInstance = this.componentStateProvider?.getComponentInstance?.(componentId);
  
  // Props와 Model 분리
  const sanitizedProps = this.sanitizeProps(props);  // stype/sid/type 제거
  const modelData = { ...data };  // 원본 모델 데이터 (stype/sid 포함)
  
  // 인스턴스가 있으면 기존 상태 사용, 없으면 새로 생성
  const instance = existingInstance || {
    id: componentId,
    props: sanitizedProps,
    model: modelData,
    state: {},
    element: null,
    mounted: false
  };
  
  // Context 생성 (props, model, state 분리)
  const ctx = {
    id: componentId,
    props: sanitizedProps,      // 순수 props (stype/sid 제외)
    model: instance.model,       // 원본 모델 (stype/sid 포함)
    state: instance.state,       // 내부 상태
    registry: this.registry,
    setState: (newState) => { /* ComponentManager에서 처리 */ },
    getState: () => instance.state,
    // ...
  };
  
  // 컴포넌트 템플릿 함수 실행 (props, context만 전달)
  const elementTemplate = component.template(sanitizedProps, ctx);
  
  // 내부 element 빌드 (stype/sid 제거된 safeData 사용)
  const safeData = sanitizedProps;  // props만 사용 (stype/sid 이미 제거됨)
  const internalVNode = this._buildElement(elementTemplate, safeData);
  
  // 컴포넌트 래퍼 VNode 반환
  return {
    tag: 'div',
    attrs: {
      'data-bc-stype': 'component',
      'data-bc-component': template.name,
      'data-bc-sid': componentId
    },
    component: {
      name: template.name,
      props: sanitizedProps,  // 순수 props만 저장
      model: modelData        // 원본 모델 별도 저장
    },
    children: [internalVNode]
  };
}
```

#### 2.3 컴포넌트 인스턴스 재사용 메커니즘

**인스턴스 ID 기반 매칭:**
```typescript
// ComponentManager.generateComponentId
private generateComponentId(vnode: VNode): string {
  const componentName = vnode.component?.name || 'unknown';
  const sid = (vnode.attrs as any)?.['data-bc-sid'];
  const key = (vnode.component as any)?.key;
  
  // 안정적인 ID 생성: key > sid > name + props hash
  if (key) {
    return `${componentName}-${key}`;
  }
  if (sid) {
    return `${componentName}-${sid}`;
  }
  
  // Props 기반 해시 (동일한 props면 동일한 인스턴스)
  const propsHash = this.generatePropsHash(vnode.component?.props || {});
  return `${componentName}-${propsHash}`;
}

// 인스턴스 저장 및 조회
private componentInstances: Map<string, ComponentInstance> = new Map();

getComponentInstance(id: string): ComponentInstance | undefined {
  const ref = this.componentInstances.get(id);
  return ref?.deref?.() || ref;  // WeakRef 지원
}

setComponentInstance(id: string, instance: ComponentInstance): void {
  this.componentInstances.set(id, instance);
}
```

**Reconcile 시 인스턴스 재사용:**
```typescript
// DOMReconcile.reconcile 내부
if (detectVNodeType(nextVNode) === 'component') {
  const componentId = this.generateComponentId(nextVNode);
  const existingInstance = this.componentManager.getComponentInstance(componentId);
  
  if (existingInstance && prevVNode) {
    // 기존 인스턴스 업데이트 (상태 유지)
    this.componentManager.updateComponent(prevVNode, nextVNode, container, context, wip);
  } else {
    // 새 인스턴스 마운트
    const host = this.componentManager.mountComponent(nextVNode, container, context);
  }
}
```

#### 2.4 상태 통합 전략

**데이터 흐름:**
```
[외부 모델]
model = { stype: 'counter', sid: 'c1', items: [...] }
  ↓
[Props 분리]
sanitizedProps = { items: [...] }  // stype/sid 제거
modelData = { stype: 'counter', sid: 'c1', items: [...] }  // 원본 보존
  ↓
[컴포넌트 인스턴스]
instance = {
  props: sanitizedProps,
  model: modelData,
  state: { count: 0 }  // 내부 상태
}
  ↓
[템플릿 함수에 전달]
props = sanitizedProps  // { items: [...] }
context = {
  props: sanitizedProps,   // 순수 props
  model: instance.model,    // 원본 모델 (stype/sid 포함)
  state: instance.state     // 내부 상태
}
  ↓
[템플릿 함수]
define('counter', (props, context) => {
  // props: 순수 전달 데이터 (stype/sid 제외)
  // context.props: 순수 props (동일)
  // context.model: 원본 모델 (stype/sid 포함)
  // context.state: 내부 상태
  
  return element('div', [
    text(String(context.state.count)),  // 내부 상태
    text(context.model.items.length)    // 외부 모델
  ]);
});
```

#### 2.5 성능 최적화 전략

**1. Reconcile 알고리즘 활용:**
- Virtual DOM diffing으로 실제 변경된 부분만 DOM 업데이트
- 컴포넌트 인스턴스는 재사용 (상태 유지)
- 불필요한 DOM 조작 최소화

**2. 컴포넌트 인스턴스 캐싱:**
```typescript
// ComponentManager
private componentInstances: Map<string, WeakRef<ComponentInstance>> = new Map();

// WeakRef 사용으로 메모리 누수 방지
setComponentInstance(id: string, instance: ComponentInstance): void {
  this.componentInstances.set(id, new WeakRef(instance));
}

getComponentInstance(id: string): ComponentInstance | undefined {
  const ref = this.componentInstances.get(id);
  if (!ref) return undefined;
  
  const instance = ref.deref?.() || ref;
  if (!instance) {
    // WeakRef가 해제된 경우 제거
    this.componentInstances.delete(id);
    return undefined;
  }
  return instance;
}
```

**3. 배치 업데이트:**
```typescript
// 여러 컴포넌트의 setState가 연속 호출되면 한 번만 재렌더링
private rerenderScheduled: boolean = false;

setState: (newState) => {
  instance.state = { ...instance.state, ...newState };
  
  // 배치 업데이트 스케줄링
  if (!this.rerenderScheduled) {
    this.rerenderScheduled = true;
    // 다음 프레임에 한 번만 실행
    requestAnimationFrame(() => {
      if (this.onRerenderCallback) {
        this.onRerenderCallback();
      }
      this.rerenderScheduled = false;
    });
  }
};
```

**4. 불필요한 재빌드 방지:**
```typescript
// VNodeBuilder에서 props/model/state가 실제로 변경되었는지 확인
private shouldRebuildComponent(
  prevProps: any,
  nextProps: any,
  prevModel: any,
  nextModel: any,
  prevState: any,
  nextState: any
): boolean {
  // 얕은 비교로 변경 여부 확인
  return (
    !shallowEqual(prevProps, nextProps) ||
    !shallowEqual(prevModel, nextModel) ||
    !shallowEqual(prevState, nextState)
  );
}
```

#### 2.6 시나리오별 동작 예시

**시나리오 1: 컴포넌트 내부 상태 변경**
```typescript
// 초기 렌더링
const model = { stype: 'counter', sid: 'c1' };
const vnode = renderer.build(model, []);
renderer.render(container, vnode);
// DOM: <div data-bc-sid="c1">0</div>

// 컴포넌트 내부에서 setState
ctx.setState({ count: 1 });
// → ComponentManager.setState 호출
// → onRerenderCallback() 호출
// → DOMRenderer.rerender() 호출
// → 전체 VNode 트리 재빌드 (instance.state.count = 1 반영)
// → Reconcile로 실제 변경된 부분만 DOM 업데이트
// DOM: <div data-bc-sid="c1">1</div>
```

**시나리오 2: 외부 모델 변경과 내부 상태 동기화**
```typescript
// 초기 상태
const model1 = { stype: 'list', sid: 'l1', items: [1, 2, 3] };
const vnode1 = renderer.build(model1, []);
renderer.render(container, vnode1);
// 컴포넌트 내부 상태: { selected: 0 }

// 컴포넌트 내부에서 setState
ctx.setState({ selected: 1 });
// → 전체 재렌더링 트리거

// 동시에 외부 모델도 변경
const model2 = { stype: 'list', sid: 'l1', items: [4, 5, 6] };
const vnode2 = renderer.build(model2, []);
renderer.render(container, vnode2);
// → 전체 재렌더링 (model2 + 내부 상태 { selected: 1 } 모두 반영)
// → 외부 모델 변경과 내부 상태가 완전히 동기화됨
```

**시나리오 3: 여러 컴포넌트 인스턴스**
```typescript
// 여러 컴포넌트가 동시에 상태 변경
counter1.setState({ count: 1 });
counter2.setState({ count: 2 });
counter3.setState({ count: 3 });

// 배치 업데이트로 한 번만 재렌더링
// → requestAnimationFrame으로 스케줄링
// → 한 번의 reconcile로 모든 변경사항 반영
```

#### 2.7 트레이드오프 분석

**장점:**
1. **완전한 동기화**: 외부 모델 변경과 내부 상태가 항상 일관성 유지
2. **단순한 아키텍처**: 부분 렌더링 경계 관리 불필요
3. **예측 가능성**: 전체 모델이 단일 소스 (Single Source of Truth)
4. **디버깅 용이**: 전체 상태를 한 번에 확인 가능

**단점:**
1. **성능 오버헤드**: 전체 VNode 트리 재빌드 (하지만 reconcile로 최적화)
2. **상태 관리 복잡성**: 컴포넌트 인스턴스 재사용 보장 필수
3. **메모리 사용**: 전체 VNode 트리를 메모리에 유지

**성능 측정:**
- Reconcile 알고리즘으로 실제 변경된 부분만 DOM 업데이트
- 컴포넌트 인스턴스 재사용으로 상태 유지 (메모리 효율적)
- 배치 업데이트로 불필요한 재렌더링 방지
- 예상 성능: 일반적인 앱에서 충분히 빠름 (React/Vue와 유사한 수준)

#### 2.8 구현 체크리스트

- [ ] `DOMRenderer.rerender()` 메서드 복원
- [ ] `ComponentManager.setOnRerenderCallback()` 구현
- [ ] `ComponentManager.setState`에서 `onRerenderCallback()` 호출
- [ ] 컴포넌트 인스턴스 재사용 메커니즘 (id 기반 매칭)
- [ ] Props와 Model 분리 (인스턴스에 별도 저장)
- [ ] 배치 업데이트 스케줄링 (requestAnimationFrame)
- [ ] 불필요한 재빌드 방지 (shallowEqual 비교)
- [ ] 성능 테스트 및 최적화

## 비교 분석

### 현재 구조 (로컬 reconcile)

**장점:**
- 성능: 부분 업데이트만 수행
- 빠른 반응: 컴포넌트 내부 변경만 즉시 반영

**단점:**
- 동기화 문제: 외부 모델 변경과 충돌
- 복잡성: props/model/state 경계 관리 어려움
- 상태 불일치: 내부 상태와 외부 모델이 따로 놈

### 제안된 구조 (전체 재렌더링)

**장점:**
- 일관성: props + model + state가 항상 동기화
- 단순성: 부분 렌더링 경계 관리 불필요
- 예측 가능성: 전체 모델이 단일 소스

**단점:**
- 성능: 전체 앱 재렌더링 (하지만 reconcile로 최적화)
- 상태 관리: 컴포넌트 인스턴스 재사용 필수

## 권장 방향

### 1단계: Props vs Context 분리 (즉시 적용 가능)

**변경 사항:**
- `componentContext`에서 `props`와 `model` 분리
- `props`: 순수 전달 데이터만 (stype/sid 제외)
- `context.model`: 원본 모델 데이터 (stype/sid 포함)
- 컴포넌트 템플릿에서 `context.model` 접근

**효과:**
- stype/sid 전파 문제 해결
- 컴포넌트 API 인터페이스 명확화
- 기존 로컬 reconcile 유지 가능

### 2단계: 전체 재렌더링 전략 (선택적)

**조건:**
- 성능이 충분히 좋은 경우 (reconcile 최적화 확인)
- 외부 모델 변경과 내부 상태 동기화가 중요한 경우

**변경 사항:**
- `setState`에서 `onRerenderCallback()` 호출
- `DOMRenderer.rerender()` 복원
- 컴포넌트 인스턴스 재사용 보장 (id 기반 매칭)

**효과:**
- 완전한 동기화 보장
- 단순한 아키텍처
- 예측 가능한 동작

## 결론

1. **Props vs Context 분리는 필수**: stype/sid 전파 문제를 근본적으로 해결
2. **전체 재렌더링은 선택적**: 성능과 동기화 요구사항에 따라 결정
3. **하이브리드 접근 가능**: 초기에는 로컬 reconcile 유지, 필요 시 전체 재렌더링으로 전환

## 전역 상태 및 서비스 접근 설계

### 문제 정의

현재 컴포넌트는 다음 3가지만 접근 가능:
- `props`: 순수 전달 데이터 (컴포넌트 API)
- `context.model`: 해당 컴포넌트의 모델 데이터 (stype/sid 포함)
- `context.state`: 컴포넌트 내부 상태

**하지만 컴포넌트 내부에서 필요한 것들:**
- Editor 인스턴스 접근 (명령 실행, 이벤트 구독 등)
- 전체 모델 트리 접근 (루트 모델 조회)
- 전역 서비스 접근 (데이터 스토어, 선택 관리자, 스키마 등)
- 전역 상태 관리 (여러 컴포넌트 간 공유 상태)

**핵심 원칙:**
- 전역 상태는 Editor의 전역 서비스를 통해 관리
- 컴포넌트 간 상태 공유는 Editor/DataStore를 통해
- 상위 컴포넌트의 private state 직접 참조는 지양

### 전역 서비스 접근 설계 (권장)

#### Registry 확장을 통한 전역 서비스 접근

**핵심 개념:**
- Editor와 전역 서비스를 Registry에 확장
- 컴포넌트는 `context.registry.getService()`로 접근
- 중앙 집중식 관리로 전역 상태 일관성 보장

**구조:**
```typescript
interface ComponentContext {
  // 기존 필드들
  id: string;
  props: ComponentProps;
  model: ModelData;
  state: ComponentState;
  
  // Registry 확장 (전역 서비스)
  registry: RendererRegistry & {
    // Editor 및 전역 서비스
    getEditor(): Editor | null;
    getDataStore(): DataStore | null;
    getSelectionManager(): SelectionManager | null;
    getSchema(): Schema | null;
    getRootModel(): ModelData | null;
  };
  
  // 편의 메서드
  getEditor(): Editor | null;
}
```

**구현:**
```typescript
// DOMRenderer 생성 시
class DOMRenderer {
  private lastModel: ModelData | null = null;
  private editor?: Editor;
  
  constructor(registry?: RendererRegistry, editor?: Editor) {
    this.editor = editor;
    
    // Registry 확장
    const extendedRegistry = {
      ...registry,
      getEditor: () => this.editor || null,
      getDataStore: () => this.editor?.dataStore || null,
      getSelectionManager: () => this.editor?.selectionManager || null,
      getSchema: () => this.editor?.schema || null,
      getRootModel: () => this.lastModel || null,
    };
    
    this.builder = new VNodeBuilder(extendedRegistry, { /* ... */ });
  }
  
  build(model: ModelData, decorators: DecoratorData[] = []): VNode {
    this.lastModel = model;  // 루트 모델 저장
    return this.builder.build(model.stype, model, { decorators });
  }
}
```

**ComponentManager에서 Registry 확장 사용:**
```typescript
// ComponentManager.mountComponent
const componentContext: ComponentContext = {
  id: componentId,
  props: sanitizedProps,
  model: instance.model,
  state: instance.state,
  
  // Registry 확장 (전역 서비스)
  registry: {
    ...context.registry,
    // Registry의 확장 메서드들이 이미 포함됨
    // getEditor, getDataStore 등 사용 가능
  },
  
  // 편의 메서드
  getEditor: () => context.registry.getEditor?.(),
  
  setState: (newState) => { /* ... */ },
  // ...
};
```

**핵심 개념:**
- 전역 서비스는 Registry로 접근 (대부분의 경우 충분)
- 상위 컴포넌트 접근은 실제로 거의 필요 없음
- 필요하면 명시적으로 찾기 (React처럼 가장 가까운 것)

**사용 예시:**

```typescript
// 전역 서비스 접근 (일반적인 사용)
define('editor-toolbar', (props, context) => {
  const editor = context.getEditor();
  const dataStore = context.registry.getDataStore();
  const rootModel = context.registry.getRootModel();
  
  // Editor 명령 실행
  return element('div', [
    element('button', {
      onClick: () => {
        editor?.executeCommand('bold');
      }
    }, [text('Bold')]),
    element('span', [
      text(`Total nodes: ${rootModel?.children?.length || 0}`)
    ])
  ]);
});

// 전역 상태 접근 (DataStore 사용)
define('status-bar', (props, context) => {
  const editor = context.getEditor();
  const dataStore = context.registry.getDataStore();
  
  // DataStore에서 전역 상태 읽기
  const selection = dataStore?.getSelection();
  const wordCount = dataStore?.getWordCount();
  
  return element('div', [
    text(`Selected: ${selection ? 'yes' : 'no'}`),
    text(`Words: ${wordCount || 0}`)
  ]);
});

// 전역 상태 업데이트
define('button-group', (props, context) => {
  const editor = context.getEditor();
  const dataStore = context.registry.getDataStore();
  
  return element('div', [
    element('button', {
      onClick: () => {
        // Editor를 통해 전역 상태 업데이트
        editor?.executeCommand('toggleBold');
        // 또는 DataStore 직접 업데이트
        dataStore?.setState({ boldActive: true });
      }
    }, [text('Bold')])
  ]);
});
```

**전역 상태 관리 패턴:**

1. **Editor를 통한 상태 관리 (권장)**
   ```typescript
   // Editor의 명령 시스템 사용
   editor.executeCommand('bold');
   editor.executeCommand('toggleBold');
   ```

2. **DataStore를 통한 상태 관리**
   ```typescript
   // DataStore 직접 접근
   const state = dataStore.getState();
   dataStore.setState({ boldActive: true });
   ```

3. **선택 관리자 사용**
   ```typescript
   const selection = selectionManager.getSelection();
   selectionManager.setSelection(range);
   ```

**장점:**
- 단순한 구조: Registry 확장만으로 모든 전역 서비스 접근
- 중앙 집중식 관리: Editor, DataStore 등이 한 곳에서 관리
- 성능 오버헤드 적음: 컨텍스트 체인 없이 직접 접근
- 타입 안정성: TypeScript로 타입 체크 가능
- 일관성 보장: 전역 상태가 항상 동기화됨

**핵심 원칙:**
- 전역 상태는 Editor의 전역 서비스를 통해 관리
- 컴포넌트 간 상태 공유는 Editor/DataStore를 통해
- 컴포넌트의 private state는 `context.state`로 관리
- 전역 상태는 `context.registry.getService()`로 접근

### 권장 방향

**Registry 확장을 통한 전역 서비스 접근**을 권장합니다:

1. **전역 서비스 접근**: Registry 확장으로 통일
   - `context.getEditor()` - Editor 인스턴스
   - `context.registry.getDataStore()` - 데이터 스토어
   - `context.registry.getSelectionManager()` - 선택 관리자
   - `context.registry.getSchema()` - 스키마
   - `context.registry.getRootModel()` - 루트 모델
   - **대부분의 경우 이것만으로 충분**

2. **전역 상태 관리 패턴**:
   - Editor 명령 시스템 사용 (권장)
   - DataStore 직접 접근
   - 선택 관리자 사용
   - 모든 컴포넌트에서 동일한 방식으로 접근 가능

3. **컴포넌트 상태 관리**:
   - 컴포넌트 내부 상태: `context.state`, `context.setState()`
   - 전역 상태: `context.registry.getService()`를 통해 접근
   - 명확한 책임 분리: 컴포넌트 state vs 전역 state

**핵심 인사이트:**
- 전역 상태는 Editor의 전역 서비스를 통해 관리
- 컴포넌트 간 상태 공유는 Editor/DataStore를 통해
- 컴포넌트의 private state는 `context.state`로 관리
- 상위 컴포넌트의 private state 직접 참조는 지양

### 구현 우선순위

1. ✅ **Props vs Context 분리** (즉시)
   - `componentContext` 구조 변경
   - `props`와 `model` 분리
   - 컴포넌트 템플릿 업데이트

2. ⚠️ **전역 서비스 접근** (다음 단계)
   - Registry 확장 (전역 서비스)
   - DOMRenderer에서 Editor 주입
   - ComponentManager에서 Registry 확장 사용
   - 전역 상태 관리 패턴 정립

3. ⚠️ **전체 재렌더링** (검토 후 결정)
   - 성능 테스트
   - reconcile 최적화 확인
   - 필요 시 적용

