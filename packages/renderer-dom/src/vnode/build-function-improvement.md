# build() 함수 개선 제안

## 현재 구조 분석

### 현재 흐름
```
build(nodeType, data, options)
  ├─ registry.get(nodeType) → renderer 찾기
  │   ├─ 없으면 → registry.getComponent(nodeType) → component 찾기 (fallback)
  │   │   └─ component 있으면 → _buildComponent() 경로
  │   └─ 있으면 → renderer.template 타입 확인
  │       ├─ ExternalTemplate → createComponentVNode()
  │       ├─ ComponentTemplate → component 함수 실행 → ElementTemplate이면 _buildElement(), 아니면 _buildComponent()
  │       ├─ Function → 함수 실행 → _buildElement()
  │       └─ ElementTemplate → _buildElement()
  └─ decorator 처리 (children만, root는 불가)

⚠️ 문제점: Reconciler.reconcileChildren()에서 builder.build()를 호출하고 있음
  → VNodeBuilder가 전체 트리를 한 번에 빌드해야 하므로 Reconciler에서 build() 호출 제거 필요
```

### 문제점
1. **복잡한 분기 로직**: renderer를 먼저 찾고, 없으면 component를 찾는 fallback 구조
2. **타입 판단이 늦음**: renderer.template의 타입을 확인한 후 분기
3. **중복된 props/model 분리**: 여러 곳에서 `separatePropsAndModel` 호출
4. **가독성 저하**: 긴 if-else 체인으로 인한 복잡도 증가
5. **⚠️ Reconciler에서 build() 호출**: `reconcileChildren()`에서 `builder.build()`를 호출하고 있음
   - VNodeBuilder가 전체 트리를 한 번에 빌드해야 하는데, Reconciler에서 다시 빌드하고 있음
   - 이는 책임 분리 위반이며, 중복 빌드로 인한 성능 문제 가능성
   - **해결**: `reconcileChildren()`이 models 대신 이미 빌드된 VNode 배열을 받도록 변경 필요

## 개선 제안

### 핵심 개념: Decorator는 Model 관점에서 처리
⚠️ **중요**: Decorator는 VNode 관점이 아니라 **Model 관점**에서 처리되어야 함
- Decorator는 model의 특정 노드(sid)에 대한 것이므로, 빌드 함수 내부에서 model과 함께 처리해야 함
- Block decorator는 sibling으로 추가되므로, 빌드 함수는 배열을 반환해야 함
- 구조: `[before decorators..., main VNode, after decorators...]`

### 목표 구조
```
build(nodeType, data, options)
  ├─ registry에서 renderer와 component 동시 확인
  ├─ component가 있으면 → _buildFromComponent()
  │   └─ 내부에서 decorator 처리 → VNode[] 반환
  └─ renderer가 있으면 → _buildFromRenderer()
      └─ 내부에서 decorator 처리 → VNode[] 반환
  └─ 배열에서 메인 VNode 추출하여 반환 (또는 배열 그대로 반환)
```

### 개선 방안

#### 1. 명확한 분기 구조
```typescript
build(nodeType: string, data: ModelData, options?: VNodeBuildOptions): VNode {
  // 1. 초기화
  this.currentBuildOptions = options;
  this.usedIds.clear();
  
  // 2. 데이터 검증
  if (isNullOrUndefined(data)) {
    throw new Error('Data cannot be null or undefined');
  }
  
  // 3. Props와 Model 분리 (한 번만 수행)
  const { props, model } = separatePropsAndModel(data, options?.decorators || []);
  
  // 4. Registry에서 renderer와 component 동시 확인
  const renderer = this.registry.get(nodeType);
  const component = this.registry.getComponent?.(nodeType);
  
  // 5. 명확한 분기: component 우선, 그 다음 renderer
  // 각 빌드 함수는 decorator를 model 관점에서 처리하고 배열을 반환
  let vnodes: VNode[];
  
  if (component) {
    // Component 경로: component가 있으면 무조건 component 빌드
    // 내부에서 decorator 처리 (model 관점)
    vnodes = this._buildFromComponent(nodeType, component, props, model, data, options);
  } else if (renderer) {
    // Renderer 경로: template 타입에 따라 element 또는 component 빌드
    // 내부에서 decorator 처리 (model 관점)
    vnodes = this._buildFromRenderer(nodeType, renderer, props, model, data, options);
  } else {
    throw new Error(`Renderer or component for node type '${nodeType}' not found`);
  }
  
  // 6. 배열에서 메인 VNode 추출 (첫 번째가 메인, 나머지는 decorator)
  // 또는 root의 경우 배열 전체를 반환할 수도 있음
  const mainVNode = vnodes[0];
  if (!mainVNode) {
    throw new Error(`Failed to build VNode for node type '${nodeType}'`);
  }
  
  // 7. 정리 및 반환
  this.currentBuildOptions = undefined;
  return mainVNode;
}
```

#### 2. 헬퍼 함수 분리

**`_buildFromComponent`**: Component 빌드 전용 (Decorator 처리 포함)
```typescript
private _buildFromComponent(
  nodeType: string,
  component: ExternalComponent,
  props: Record<string, any>,
  model: ModelData,
  originalData: ModelData, // decorator 처리를 위한 원본 data
  options?: VNodeBuildOptions
): VNode[] {
  const componentTemplate: ComponentTemplate = {
    type: 'component',
    name: nodeType,
    props
  };
  
  const built = this._buildComponent(componentTemplate, model, options);
  if (!built) {
    throw new Error(`Failed to build component VNode for node type '${nodeType}'`);
  }
  
  // Decorator 처리 (model 관점)
  // Block decorator가 있으면 sibling으로 추가하여 배열 반환
  return this._processDecoratorsForModel(built, originalData, options);
}
```

**`_buildFromRenderer`**: Renderer 빌드 전용 (Decorator 처리 포함)
```typescript
private _buildFromRenderer(
  nodeType: string,
  renderer: RendererDefinition,
  props: Record<string, any>,
  model: ModelData,
  originalData: ModelData, // decorator 처리를 위한 원본 data
  options?: VNodeBuildOptions
): VNode[] {
  const template = renderer.template;
  let mainVNode: VNode;
  
  // 1. ExternalTemplate 처리
  if (isExternalTemplate(template)) {
    mainVNode = this._buildExternalComponent(nodeType, props, model, options);
  }
  // 2. ElementTemplate 처리
  else if (isElementTemplate(template)) {
    mainVNode = this._buildElement(template, model, options);
  }
  // 3. ComponentTemplate 처리
  else if (isComponentTemplate(template)) {
    mainVNode = this._buildComponentFromRenderer(nodeType, template, props, model, options);
  }
  // 4. Function-based renderer 처리
  else if (isFunction(template)) {
    const elementTemplate = (template as any)(model) as ElementTemplate;
    mainVNode = this._buildElement(elementTemplate, model, options);
  }
  else {
    throw new Error(`Unsupported template type for node type '${nodeType}'`);
  }
  
  // Decorator 처리 (model 관점)
  // Block decorator가 있으면 sibling으로 추가하여 배열 반환
  return this._processDecoratorsForModel(mainVNode, originalData, options);
}
```

**`_processDecoratorsForModel`**: Model 관점에서 Decorator 처리
```typescript
private _processDecoratorsForModel(
  mainVNode: VNode,
  originalData: ModelData,
  options?: VNodeBuildOptions
): VNode[] {
  const decorators = options?.decorators || [];
  if (!isNonEmptyArray(decorators)) {
    return [mainVNode];
  }
  
  // Model의 sid를 기준으로 decorator 찾기
  const modelSid = (originalData as any)?.sid;
  if (!modelSid) {
    return [mainVNode];
  }
  
  // 해당 model에 대한 decorator 필터링
  const nodeDecorators = decorators.filter(d => d.targetSid === modelSid);
  if (!isNonEmptyArray(nodeDecorators)) {
    return [mainVNode];
  }
  
  // Block decorator 처리
  const categorized = this.decoratorProcessor.categorizeDecorators(nodeDecorators);
  const blockLayerDecorators = [...categorized.block, ...categorized.layer];
  
  if (!isNonEmptyArray(blockLayerDecorators)) {
    // Block decorator 없으면 메인 VNode만 반환
    // Inline decorator는 _buildElement 내부에서 처리됨
    return [mainVNode];
  }
  
  // Block decorator VNode 생성
  const decoratorNodes = this.decoratorProcessor.buildDecoratorVNodes(
    blockLayerDecorators,
    (template, data, opts) => this._buildElement(template, data, opts)
  );
  
  // Before/After 분리
  const beforeDecorators: VNode[] = [];
  const afterDecorators: VNode[] = [];
  
  for (const decoratorNode of decoratorNodes) {
    const position = decoratorNode.decoratorPosition || 'after';
    if (position === 'before') {
      beforeDecorators.push(decoratorNode);
    } else {
      afterDecorators.push(decoratorNode);
    }
  }
  
  // 배열 반환: [before decorators..., main VNode, after decorators...]
  return [...beforeDecorators, mainVNode, ...afterDecorators];
}
```

**`_buildComponentFromRenderer`**: ComponentTemplate에서 ElementTemplate 추출 및 빌드
```typescript
private _buildComponentFromRenderer(
  nodeType: string,
  template: ComponentTemplate,
  props: Record<string, any>,
  model: ModelData,
  options?: VNodeBuildOptions
): VNode {
  // ComponentTemplate의 component 함수가 있으면 실행
  if (isFunction(template.component)) {
    try {
      const elementTemplate = this._executeComponentFunction(
        nodeType,
        template.component,
        props,
        model
      );
      
      if (elementTemplate) {
        // ElementTemplate 반환 → element 빌드
        const vnode = this._buildElement(elementTemplate, model, options);
        attachComponentInfo(vnode, nodeType, model, options?.decorators || []);
        this._applyComponentIdentityToVNode(vnode, model, options);
        return vnode;
      }
    } catch {
      // 실행 실패 시 component 빌드로 fallback
    }
  }
  
  // ComponentTemplate 그대로 빌드
  const componentTemplate: ComponentTemplate = {
    type: 'component',
    name: nodeType,
    props
  };
  
  const vnode = this._buildComponent(componentTemplate, model, options);
  if (vnode) {
    vnode.isExternal = false;
  }
  
  return vnode || throw new Error(`Failed to build component VNode for node type '${nodeType}'`);
}
```

#### 3. 장점
1. **명확한 분기**: component와 renderer를 명확히 구분
2. **가독성 향상**: 각 경로가 명확한 함수로 분리
3. **유지보수성**: 각 경로를 독립적으로 수정 가능
4. **테스트 용이성**: 각 헬퍼 함수를 독립적으로 테스트 가능
5. **중복 제거**: props/model 분리를 한 번만 수행
6. **Decorator 처리 일관성**: Model 관점에서 일관되게 처리
7. **Block Decorator 지원**: 배열 반환으로 sibling decorator 자연스럽게 처리

#### 4. 구현 순서
1. `_processDecoratorsForModel` 함수 생성 (Model 관점 decorator 처리)
2. `_buildFromComponent` 함수 생성 (배열 반환, decorator 처리 포함)
3. `_buildFromRenderer` 함수 생성 (배열 반환, decorator 처리 포함)
4. `_buildComponentFromRenderer` 함수 생성
5. `_buildExternalComponent` 함수 생성 (필요시)
6. `_executeComponentFunction` 함수 생성 (필요시)
7. `build()` 함수 리팩토링 (배열 처리)
8. **Reconciler.reconcileChildren() 수정**: models 대신 VNode 배열을 받도록 변경 (이미 완료)
9. 테스트 수행

#### 5. Reconciler 수정 사항
**현재 문제**:
- `reconcileChildren(parent, models, buildOpts)`가 models를 받아서 각각 `builder.build()` 호출
- 이는 VNodeBuilder의 책임을 Reconciler가 수행하는 것

**개선 방안**:
- `reconcileChildren(parent, vnodes, buildOpts)`로 변경하여 이미 빌드된 VNode 배열을 받도록 수정
- 또는 `reconcileChildren`을 제거하고 `reconcile`만 사용하도록 변경
- `renderLayer` 등에서 `reconcileChildren`을 사용하는 경우, 먼저 VNodeBuilder로 빌드 후 전달

