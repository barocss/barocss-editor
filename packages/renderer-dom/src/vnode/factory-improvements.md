# Factory.ts 개선 제안

## 현재 상태 분석

### 파일 크기
- **총 라인 수**: 2270줄
- **메서드 수**: 약 44개 (private/public)

### 주요 문제점

#### 1. 긴 메서드들 (100줄 이상)
- `_buildRegisteredRenderer` (1945-2072): **약 127줄** ⚠️
  - ElementTemplate 처리와 Function-based 처리가 혼재
  - Component state 가져오기 로직이 중복
  - Children을 content로 변환하는 로직이 중복

- `_processDecoratorsForChildren` (1609-1713): **약 104줄** ⚠️
  - Decorator 필터링, 분류, 빌드 로직이 모두 한 메서드에
  - 재귀 처리 로직도 포함

#### 2. 중복 패턴

**패턴 1: Component State 가져오기**
```typescript
// _buildRegisteredRenderer (1982-1998)
let componentState: Record<string, any> = {};
let stateInstance: any = undefined;
if (this.componentStateProvider) {
  try {
    const tempVNode = createComponentVNode({...});
    componentState = this.componentStateProvider.getComponentStateByVNode(tempVNode) || {};
    if (this.componentManager) {
      const instance = this.componentManager.getInstance(...);
      if (instance) {
        stateInstance = (instance as any).__stateInstance;
      }
    }
  } catch (error) {
    componentState = {};
  }
}
```
이 패턴이 `_buildRegisteredRenderer`와 `_buildRegisteredComponent`에서 반복됨.

**패턴 2: Children을 content로 변환**
```typescript
// _buildRegisteredRenderer (2041-2054)
if (template.children && template.children.length > 0) {
  const contentVNodes: VNode[] = [];
  for (const child of template.children) {
    if ((child as any).type === 'element') {
      contentVNodes.push(this._buildElement(child as ElementTemplate, mergedData, buildOptions));
    } else if (isComponentTemplate(child)) {
      const childProps = (child as ComponentTemplate).props || {};
      const childData = { ...mergedData, ...childProps };
      const childVNode = this._buildComponent(child as ComponentTemplate, childData, buildOptions);
      if (childVNode) contentVNodes.push(childVNode);
    }
  }
  (resolvedPropsForRenderer as any).content = contentVNodes;
}
```
이 패턴이 `_buildRegisteredRenderer`와 `_buildRegisteredComponent`에서 거의 동일하게 반복됨.

**패턴 3: ElementTemplate 기반 VNode 빌드 및 identity 설정**
```typescript
// _buildRegisteredRenderer (2015-2023)
const vnode = this._buildElement(mergedTemplate, mergedData, buildOptions);
if ((mergedData as any)?.sid) {
  const uniqueId = this.ensureUniqueId((mergedData as any).sid);
  if (uniqueId) (vnode.attrs as any)['data-bc-sid'] = uniqueId;
}
if ((mergedData as any)?.stype) (vnode.attrs as any)['data-bc-stype'] = (mergedData as any).stype;
```
이 패턴이 여러 곳에서 반복됨.

#### 3. 복잡한 분기 로직

**`_buildRegisteredRenderer` 내부:**
- ElementTemplate 처리 (1955-1971)
- Function-based 처리 (1974-2069)
  - Component function 실행 및 ElementTemplate 체크 (1977-2027)
  - Component VNode 생성 (2032-2068)

## 개선 제안

### 우선순위 1: 중복 패턴 추출 (High Impact, Low Risk)

#### 1.1 Component State 가져오기 함수 추출
```typescript
/**
 * Get component state and instance for component building
 * @param template - ComponentTemplate
 * @param mergedData - Merged model data
 * @param componentId - Component ID
 * @returns { componentState, stateInstance }
 */
private _getComponentStateAndInstanceForBuild(
  template: ComponentTemplate,
  mergedData: ModelData,
  componentId: string
): { componentState: Record<string, any>; stateInstance: any } {
  let componentState: Record<string, any> = {};
  let stateInstance: any = undefined;
  
  if (this.componentStateProvider) {
    try {
      const tempVNode = createComponentVNode({
        stype: template.name,
        props: sanitizePropsUtil(template.props || {})
      });
      componentState = this.componentStateProvider.getComponentStateByVNode(tempVNode) || {};
      if (this.componentManager) {
        const instance = this.componentManager.getInstance((mergedData as any)?.sid || componentId);
        if (instance) {
          stateInstance = (instance as any).__stateInstance;
        }
      }
    } catch (error) {
      componentState = {};
    }
  }
  
  return { componentState, stateInstance };
}
```

#### 1.2 Children을 content로 변환 함수 추출
```typescript
/**
 * Convert template children to content VNodes
 * @param children - Template children
 * @param data - Model data
 * @param buildOptions - Build options
 * @returns Array of VNodes
 */
private _convertChildrenToContentVNodes(
  children: any[],
  data: ModelData,
  buildOptions: VNodeBuildOptions
): VNode[] {
  const contentVNodes: VNode[] = [];
  
  for (const child of children) {
    if ((child as any).type === 'element') {
      contentVNodes.push(this._buildElement(child as ElementTemplate, data, buildOptions));
    } else if (isComponentTemplate(child)) {
      const childProps = (child as ComponentTemplate).props || {};
      const childData = { ...data, ...childProps };
      const childVNode = this._buildComponent(child as ComponentTemplate, childData, buildOptions);
      if (childVNode) contentVNodes.push(childVNode);
    }
  }
  
  return contentVNodes;
}
```

#### 1.3 ElementTemplate VNode 빌드 및 identity 설정 함수 추출
```typescript
/**
 * Build ElementTemplate VNode and apply identity attributes
 * @param template - ElementTemplate
 * @param data - Model data
 * @param buildOptions - Build options
 * @returns VNode with identity attributes
 */
private _buildElementWithIdentity(
  template: ElementTemplate,
  data: ModelData,
  buildOptions: VNodeBuildOptions
): VNode {
  const vnode = this._buildElement(template, data, buildOptions);
  
  if ((data as any)?.sid) {
    const uniqueId = this.ensureUniqueId((data as any).sid);
    if (uniqueId) (vnode.attrs as any)['data-bc-sid'] = uniqueId;
  }
  if ((data as any)?.stype) {
    (vnode.attrs as any)['data-bc-stype'] = (data as any).stype;
  }
  
  return vnode;
}
```

### 우선순위 2: 긴 메서드 분리 (Medium Priority)

#### 2.1 `_buildRegisteredRenderer` 분리

**현재 구조:**
```typescript
_buildRegisteredRenderer() {
  // ElementTemplate 처리 (1955-1971)
  if (isElementTemplate(regTmpl)) { ... }
  
  // Function-based 처리 (1974-2069)
  if (isComponentTemplateWithFunc(regTmpl)) {
    // Component function 실행 및 ElementTemplate 체크 (1977-2027)
    // Component VNode 생성 (2032-2068)
  }
}
```

**개선 후:**
```typescript
_buildRegisteredRenderer() {
  if (isElementTemplate(regTmpl)) {
    return this._buildElementTemplateRenderer(...);
  }
  
  if (isComponentTemplateWithFunc(regTmpl)) {
    return this._buildFunctionBasedRenderer(...);
  }
  
  return null;
}

private _buildElementTemplateRenderer(...) { ... }
private _buildFunctionBasedRenderer(...) { ... }
```

#### 2.2 `_processDecoratorsForChildren` 분리

**현재 구조:**
```typescript
_processDecoratorsForChildren() {
  // Decorator 필터링 (1620-1626)
  // Decorator 분류 및 빌드 (1630-1687)
  // 재귀 처리 (1693-1712)
}
```

**개선 후:**
```typescript
_processDecoratorsForChildren() {
  const originalChildren = this._filterDecoratorNodes(vnode.children);
  const newChildren = this._buildChildrenWithDecorators(originalChildren, decorators, data);
  vnode.children = newChildren;
  this._processNestedDecorators(newChildren, decorators, data);
}

private _filterDecoratorNodes(children: any[]): VNode[] { ... }
private _buildChildrenWithDecorators(...): VNode[] { ... }
private _processNestedDecorators(...): void { ... }
```

### 우선순위 3: 네이밍 일관성 (Low Priority)

#### 3.1 메서드 이름 규칙 정리
- `_build*`: Template → VNode 변환 (최종 결과물 생성)
- `_process*`: 데이터 처리 및 변환 (중간 단계)
- `_resolve*`: 값 해결 및 계산 (값 추출)
- `_apply*`: VNode에 변경사항 적용 (수정)
- `_render*`: 자식 요소 렌더링 (특정 컨텍스트에서의 렌더링)

#### 3.2 일관성 개선 예시
- `_setAttributes` → `_applyAttributesToVNode` (apply 패턴)
- `_processDecorators` → `_applyDecoratorsToVNode` (apply 패턴)

## 예상 효과

### 코드 품질
- **중복 제거**: 약 50-70줄의 중복 코드 제거
- **가독성 향상**: 긴 메서드 분리로 이해하기 쉬워짐
- **유지보수성 향상**: 변경 시 한 곳만 수정하면 됨

### 테스트 용이성
- 작은 함수 단위로 테스트 가능
- Mock 및 테스트 작성이 쉬워짐

### 성능
- 영향 없음 (함수 호출 오버헤드는 무시 가능)

## 실행 계획

### Phase 1: 중복 패턴 추출 (1-2시간)
1. `_getComponentStateAndInstanceForBuild` 추출
2. `_convertChildrenToContentVNodes` 추출
3. `_buildElementWithIdentity` 추출
4. 테스트 실행

### Phase 2: 긴 메서드 분리 (2-3시간)
1. `_buildRegisteredRenderer` 분리
2. `_processDecoratorsForChildren` 분리
3. 테스트 실행

### Phase 3: 네이밍 일관성 (선택적, 1-2시간)
1. 메서드 이름 리팩토링
2. 테스트 실행

## 주의사항

1. **한 번에 하나씩**: 각 개선 사항을 독립적으로 진행하고 테스트
2. **기존 동작 유지**: 리팩토링 후 동일한 동작 보장
3. **테스트 커버리지**: 기존 테스트가 모든 케이스를 커버하는지 확인

