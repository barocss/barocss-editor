# Factory.ts 추가 개선 가능한 부분 상세 분석

## 1. `_processChild` 메서드 (662-782줄, 약 120줄) ⭐⭐⭐ 높은 우선순위

### 현재 문제점

1. **복잡한 조건문 체인**: 10개 이상의 `if-else if` 분기
   - Function, VNode, String/Number, ComponentTemplate, ElementTemplate, DataTemplate, SlotTemplate, EachTemplate, ConditionalTemplate, PortalTemplate 등
   - 각 분기가 서로 독립적이지만 하나의 메서드에 모두 집중

2. **중복된 로직**:
   - `flushTextParts()` 호출이 여러 분기에서 반복
   - `componentVNode` 생성 로직이 중복 (696-702줄, 714-717줄, 765-768줄)
   - ElementTemplate 처리 시 component 체크 로직 (706-717줄)이 복잡

3. **복잡한 sid 처리 로직** (723-733줄):
   ```typescript
   const childSid = (child as ElementTemplate).attributes?.['data-bc-sid'] ||
     (child as ElementTemplate).attributes?.sid;
   const childBuildOptions = {
     ...buildOptions,
     sid: childSid !== undefined ? childSid : (buildOptions.sid !== undefined ? buildOptions.sid : undefined)
   };
   const childData = childSid !== undefined ? data : { ...data };
   ```
   - 이 로직이 복잡하고 주석이 많아 가독성이 떨어짐

4. **책임이 너무 많음**: 
   - 라우터 역할 (어떤 타입인지 판단)
   - 각 타입별 처리
   - sid 전파 로직
   - buildOptions 병합

### 개선 방안

#### 방안 1: 타입별 핸들러로 분리 (추천)
```typescript
private _processChild(...) {
  // 타입 판단만 수행
  const handler = this._getChildHandler(child);
  if (handler) {
    handler.process(child, data, ...);
  }
}

private _getChildHandler(child: any): ChildHandler | null {
  if (isFunction(child)) return this._functionHandler;
  if (isVNode(child)) return this._vnodeHandler;
  if (isStringOrNumber(child)) return this._textHandler;
  if (isComponentTemplate(child)) return this._componentTemplateHandler;
  if (isElementTemplate(child)) return this._elementTemplateHandler;
  // ...
}
```

#### 방안 2: ElementTemplate 처리 로직 분리
```typescript
private _processElementTemplateChild(
  child: ElementTemplate,
  data: ModelData,
  orderedChildren: VNode[],
  buildOptions: VNodeBuildOptions
): void {
  const tag = child.tag;
  
  // Component tag 체크
  if (isString(tag) && this.registry.getComponent(tag)) {
    this._processComponentTag(child, tag, data, orderedChildren, buildOptions);
    return;
  }
  
  // Regular element 처리
  this._processRegularElement(child, data, orderedChildren, buildOptions);
}

private _processComponentTag(...): void {
  const componentTemplate = {
    type: 'component',
    name: tag,
    props: child.attributes || {}
  } as ComponentTemplate;
  flushTextParts();
  const componentVNode = this._buildComponent(componentTemplate, data, buildOptions);
  if (componentVNode) {
    orderedChildren.push(componentVNode);
  }
}

private _processRegularElement(...): void {
  flushTextParts();
  const { childSid, childBuildOptions, childData } = this._resolveChildSidAndData(child, data, buildOptions);
  orderedChildren.push(this._buildElement(child, childData, childBuildOptions));
}

private _resolveChildSidAndData(
  child: ElementTemplate,
  data: ModelData,
  buildOptions: VNodeBuildOptions
): { childSid?: string; childBuildOptions: VNodeBuildOptions; childData: ModelData } {
  const childSid = child.attributes?.['data-bc-sid'] || child.attributes?.sid;
  const childBuildOptions = {
    ...buildOptions,
    sid: childSid !== undefined ? childSid : buildOptions.sid
  };
  const childData = childSid !== undefined ? data : { ...data };
  return { childSid, childBuildOptions, childData };
}
```

#### 방안 3: buildOptions 병합 로직 분리
```typescript
private _mergeBuildOptions(
  options?: { ... },
  sid?: string
): VNodeBuildOptions {
  return {
    ...this.currentBuildOptions,
    ...options,
    decorators: this._resolveDecoratorsFromOptions(options?.decorators),
    sid: sid !== undefined ? sid : this.currentBuildOptions?.sid
  };
}
```

### 우선순위: 높음
- 가장 복잡한 메서드
- 자주 호출됨 (모든 element children 처리 시)
- 가독성과 유지보수성에 큰 영향

---

## 2. `_processDecoratorsForChildren` 메서드 (1536-1640줄, 약 104줄) ⭐⭐ 중간 우선순위

### 현재 문제점

1. **긴 메서드**: 104줄로 하나의 메서드가 너무 많은 일을 함
   - Decorator 필터링
   - Decorator 분류
   - Block decorator 빌드
   - Before/After 분리
   - Inline decorator 처리
   - 재귀 처리

2. **중복된 sid 추출 로직**:
   ```typescript
   // 1567-1569줄
   const childSid = childVNode.sid ||
     (childVNode.attrs?.['data-bc-sid'] as string) ||
     extractNodeId(childVNode, data);
   
   // 1631-1633줄 (거의 동일)
   const childSid = childVNode.sid ||
     (childVNode.attrs?.['data-bc-sid'] as string) ||
     extractNodeId(childVNode, data);
   ```

3. **복잡한 중첩 로직**:
   - 원본 children 필터링
   - 각 child에 대한 decorator 찾기
   - Block decorator 빌드 및 분리
   - 새 children 배열 구성
   - 재귀 처리

### 개선 방안

#### 방안 1: 단계별 메서드 분리
```typescript
private _processDecoratorsForChildren(...): void {
  const originalChildren = this._filterDecoratorNodes(vnode.children);
  const newChildren = this._buildChildrenWithDecorators(originalChildren, decorators, data);
  vnode.children = newChildren;
  this._processNestedDecorators(newChildren, decorators, data);
}

private _filterDecoratorNodes(children: any[]): VNode[] {
  return children.filter((child: any) => {
    if (isVNode(child)) {
      return !isDecoratorNode(child);
    }
    return true;
  });
}

private _buildChildrenWithDecorators(
  originalChildren: VNode[],
  decorators: Decorator[],
  data: ModelData
): (string | number | VNode)[] {
  const newChildren: (string | number | VNode)[] = [];
  
  for (const child of originalChildren) {
    if (isVNode(child)) {
      const childWithDecorators = this._addDecoratorsToChild(child, decorators, data);
      newChildren.push(...childWithDecorators);
    } else {
      newChildren.push(child);
    }
  }
  
  return newChildren;
}

private _addDecoratorsToChild(
  child: VNode,
  decorators: Decorator[],
  data: ModelData
): VNode[] {
  const childSid = this._extractChildSid(child, data);
  if (!childSid) {
    return [child];
  }
  
  const nodeDecorators = this.decoratorProcessor.findDecoratorsForNode(String(childSid), decorators);
  const categorized = this.decoratorProcessor.categorizeDecorators(nodeDecorators);
  const blockLayerDecorators = [...categorized.block, ...categorized.layer];
  
  if (!isNonEmptyArray(blockLayerDecorators)) {
    this._processInlineDecorators(child, nodeDecorators, String(childSid), data);
    return [child];
  }
  
  const decoratorNodes = this.decoratorProcessor.buildDecoratorVNodes(
    blockLayerDecorators,
    (template, data, options) => this._buildElement(template, data, options)
  );
  
  const { before, after } = this._separateDecoratorsByPosition(decoratorNodes);
  this._processInlineDecorators(child, nodeDecorators, String(childSid), data);
  
  return [...before, child, ...after];
}

private _extractChildSid(child: VNode, data: ModelData): string | undefined {
  return child.sid ||
    (child.attrs?.['data-bc-sid'] as string) ||
    extractNodeId(child, data);
}

private _separateDecoratorsByPosition(decoratorNodes: VNode[]): { before: VNode[]; after: VNode[] } {
  const before: VNode[] = [];
  const after: VNode[] = [];
  
  for (const decoratorNode of decoratorNodes) {
    const position = decoratorNode.decoratorPosition || 'after';
    if (position === 'before') {
      before.push(decoratorNode);
    } else {
      after.push(decoratorNode);
    }
  }
  
  return { before, after };
}

private _processNestedDecorators(
  children: (string | number | VNode)[],
  decorators: Decorator[],
  data: ModelData
): void {
  for (const child of children) {
    if (isVNode(child) && !isDecoratorNode(child) && child.stype) {
      const childSid = this._extractChildSid(child, data);
      if (childSid) {
        this._processDecorators(child, decorators, String(childSid), data);
      }
    }
  }
}
```

### 우선순위: 중간
- 복잡하지만 자주 호출되지 않음 (최상위 build에서만)
- 가독성 개선에 도움

---

## 3. `_renderComponentChildren` 메서드 (1982-2010줄, 약 28줄) ⭐ 낮은 우선순위

### 현재 문제점

1. **혼재된 처리 로직**:
   - String/Number → props.children에 추가
   - ElementTemplate → children 배열에 추가
   - DataTemplate → props.children에 추가
   - ComponentTemplate → children 배열에 추가
   - 일관성 없는 처리 방식

2. **props.children 초기화 로직 중복**:
   ```typescript
   if (!props.children) props.children = [];
   ```
   - 여러 분기에서 반복

3. **주석이 부족**: 각 분기의 의도가 명확하지 않음

### 개선 방안

```typescript
private _renderComponentChildren(...): VNode[] {
  const children: VNode[] = [];
  const textChildren: string[] = [];
  
  if (template.children) {
    for (const child of template.children) {
      if (isStringOrNumber(child)) {
        textChildren.push(String(child));
      } else if ((child as any).type === 'element') {
        children.push(this._buildElement(child as ElementTemplate, data, buildOptions));
      } else if (isDataTemplate(child)) {
        const value = this._resolveDataTemplateValue(child as DataTemplate, data);
        textChildren.push(String(value ?? ''));
      } else if (isComponentTemplate(child)) {
        const childComponent = this._buildComponent(child as ComponentTemplate, data, buildOptions);
        if (childComponent) {
          children.push(childComponent);
        }
      }
    }
  }
  
  // Add text children to props if any
  if (textChildren.length > 0) {
    if (!props.children) props.children = [];
    props.children.push(...textChildren);
  }
  
  return children;
}

private _resolveDataTemplateValue(template: DataTemplate, data: ModelData): any {
  const value = template.getter 
    ? template.getter(data) 
    : getDataValue(data, template.path!);
  return isNullOrUndefined(value) ? template.defaultValue : value;
}
```

### 우선순위: 낮음
- 상대적으로 단순
- 자주 호출되지 않음

---

## 4. `_buildComponent` 메서드 (1245-1280줄, 약 35줄) ⭐ 낮은 우선순위

### 현재 문제점

1. **buildOptions 병합 로직이 복잡**:
   ```typescript
   const buildOptions: VNodeBuildOptions = {
     ...this.currentBuildOptions,
     ...options,
     decorators: this._resolveDecoratorsFromOptions(options?.decorators),
     sid: options?.sid || this.currentBuildOptions?.sid || getSid(data)
   };
   ```
   - 이 패턴이 여러 메서드에서 반복됨

2. **분기 로직이 명확하지 않음**:
   - `_buildRegisteredComponent` → `_buildContextComponent` → `_buildDOMManagingComponent`
   - 각 분기의 조건이 명확하지 않음

### 개선 방안

```typescript
private _buildComponent(...): VNode | null {
  const buildOptions = this._mergeBuildOptions(options, getSid(data));
  const component = this.registry.getComponent(template.name);
  if (!component) {
    return null;
  }
  
  // Try registered component first
  const registeredResult = this._buildRegisteredComponent(component, template, data, buildOptions);
  if (registeredResult) return registeredResult;
  
  // Resolve props and determine component type
  const { props } = resolveComponentPropsAndKey(template, data);
  const componentType = this._determineComponentType(component);
  
  // Build based on component type
  if (componentType === 'context') {
    return this._buildContextComponent(template, component, props, data, buildOptions);
  } else {
    return this._buildDOMManagingComponent(template, component, props, data, buildOptions);
  }
}

private _determineComponentType(component: any): 'context' | 'dom-managing' {
  return (component.managesDOM === false && isFunction(component.template)) 
    ? 'context' 
    : 'dom-managing';
}

private _mergeBuildOptions(
  options?: VNodeBuildOptions & { ... },
  defaultSid?: string
): VNodeBuildOptions {
  return {
    ...this.currentBuildOptions,
    ...options,
    decorators: this._resolveDecoratorsFromOptions(options?.decorators),
    sid: options?.sid || this.currentBuildOptions?.sid || defaultSid
  };
}
```

### 우선순위: 낮음
- 상대적으로 단순
- 이미 잘 구조화되어 있음

---

## 5. 기타 개선 가능한 부분

### 5.1 buildOptions 병합 로직 통합
현재 여러 메서드에서 비슷한 buildOptions 병합 로직이 반복됨:
- `_buildComponent` (1247-1252줄)
- `_buildElement` (508-513줄)
- `_processChild` (680-687줄)

**개선**: 공통 유틸리티 메서드로 추출

### 5.2 Component VNode 생성 로직 통합
여러 곳에서 component VNode를 생성하는 로직이 중복:
- `_processChild` (696-702줄, 714-717줄, 765-768줄)
- `_processFunctionChild` (813줄, 826줄)

**개선**: 공통 메서드로 추출

### 5.3 sid 추출 로직 통합
여러 곳에서 sid를 추출하는 로직이 중복:
- `_processChild` (723-724줄)
- `_processDecoratorsForChildren` (1567-1569줄, 1631-1633줄)

**개선**: `_extractChildSid` 메서드로 통합 (이미 `extractNodeId` 유틸리티가 있지만 더 명확한 래퍼 필요)

---

## 우선순위 요약

### 높은 우선순위 (즉시 개선 권장)
1. **`_processChild` 메서드 분리** ⭐⭐⭐
   - 가장 복잡하고 자주 호출됨
   - 가독성과 유지보수성에 큰 영향

### 중간 우선순위 (시간 있을 때 개선)
2. **`_processDecoratorsForChildren` 메서드 분리** ⭐⭐
   - 복잡하지만 자주 호출되지 않음
   - 가독성 개선에 도움

### 낮은 우선순위 (선택적 개선)
3. **`_renderComponentChildren` 메서드 개선** ⭐
4. **`_buildComponent` 메서드 개선** ⭐
5. **공통 로직 통합** (buildOptions, component VNode, sid 추출)

---

## 개선 시 주의사항

1. **테스트 커버리지 유지**: 각 개선 후 반드시 테스트 실행
2. **점진적 개선**: 한 번에 하나씩 개선하고 테스트
3. **기능 변경 없음**: 리팩토링만 수행, 동작은 동일하게 유지
4. **가독성 우선**: 성능보다 가독성과 유지보수성에 집중

