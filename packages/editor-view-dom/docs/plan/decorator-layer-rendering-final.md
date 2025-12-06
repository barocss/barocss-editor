# Decorator Layer 렌더링 최종 설계

## 개요

이 문서는 Content 레이어 이외의 Decorator 레이어들(decorator, selection, context, custom)을 렌더링하는 최종 설계를 정리합니다.

## 핵심 원칙

1. **렌더링은 renderer-dom에서**: DOMRenderer와 reconcile 알고리즘 재사용
2. **Layer별 DOMRenderer 분리**: 각 Layer가 독립적인 상태 관리
3. **Content 먼저, Decorator 나중**: DOM 위치 계산을 위해 Content 렌더링 완료 필요
4. **Root 없이 렌더링**: `renderChildren()` 사용하여 불필요한 wrapper 제거

## 아키텍처

### 1. Layer별 DOMRenderer 구조

```typescript
// packages/editor-view-dom/src/editor-view-dom.ts

export class EditorViewDOM {
  // Layer별 DOMRenderer (각각 독립적인 prevVNodeTree)
  private contentRenderer: DOMRenderer;      // Content 레이어용
  private decoratorRenderer: DOMRenderer;    // Decorator 레이어용
  private selectionRenderer: DOMRenderer;    // Selection 레이어용
  private contextRenderer: DOMRenderer;     // Context 레이어용
  private customRenderer: DOMRenderer;       // Custom 레이어용
  
  // Decorator Prebuilder (데이터 변환)
  private decoratorPrebuilder: DecoratorPrebuilder;
  
  constructor(editor: Editor, options: EditorViewDOMOptions) {
    const registry = options.registry || getGlobalRegistry();
    
    // 각 Layer별로 DOMRenderer 생성
    this.contentRenderer = new DOMRenderer(registry);
    this.decoratorRenderer = new DOMRenderer(registry);
    this.selectionRenderer = new DOMRenderer(registry);
    this.contextRenderer = new DOMRenderer(registry);
    this.customRenderer = new DOMRenderer(registry);
    
    // Decorator Prebuilder (contentRenderer 전달하여 ComponentManager 접근)
    this.decoratorPrebuilder = new DecoratorPrebuilder(
      registry,
      this.layers.content,
      this.contentRenderer
    );
  }
}
```

### 2. DecoratorPrebuilder (데이터 변환)

```typescript
// packages/editor-view-dom/src/decorator/decorator-prebuilder.ts

/**
 * DecoratorPrebuilder
 * 
 * 모든 decorator (target, pattern, custom)를 DecoratorModel로 변환
 * Content 렌더링 완료 후 실행 (DOM 위치 계산 가능)
 */
export class DecoratorPrebuilder {
  private positionCalculator: PositionCalculator;
  private domQuery: DOMQuery;
  private contentRenderer: DOMRenderer; // ComponentManager 접근용
  
  constructor(
    registry: RendererRegistry,
    contentLayer: HTMLElement,
    contentRenderer: DOMRenderer
  ) {
    this.contentRenderer = contentRenderer;
    this.domQuery = new DOMQuery(contentLayer, contentRenderer);
    this.positionCalculator = new PositionCalculator(this.domQuery);
  }
  
  /**
   * 모든 decorator를 DecoratorModel로 변환
   */
  buildAll(
    decorators: Decorator[],
    modelData: ModelData
  ): DecoratorModel[] {
    const decoratorModels: DecoratorModel[] = [];
    
    for (const decorator of decorators) {
      const models = this.buildDecorator(decorator, modelData);
      decoratorModels.push(...models);
    }
    
    return decoratorModels;
  }
  
  /**
   * 단일 decorator를 DecoratorModel로 변환
   */
  private buildDecorator(
    decorator: Decorator,
    modelData: ModelData
  ): DecoratorModel[] {
    // 1. Custom decorator 처리
    if (decorator.decoratorType === 'custom' && decorator.generate) {
      const generatedDecorators = decorator.generate(modelData, null, {});
      return generatedDecorators.flatMap(d => 
        this.buildDecorator(d, modelData)
      );
    }
    
    // 2. Target decorator 처리
    return [this.buildTargetDecorator(decorator, modelData)];
  }
  
  /**
   * Target decorator를 DecoratorModel로 변환
   */
  private buildTargetDecorator(
    decorator: Decorator,
    modelData: ModelData
  ): DecoratorModel {
    // 위치 계산 (layer decorator인 경우)
    let position: DecoratorModel['position'];
    if (decorator.category === 'layer' || decorator.layerTarget !== 'content') {
      position = this.positionCalculator.calculatePosition(decorator);
    }
    
    // DecoratorModel 생성
    // 템플릿 렌더링은 DOMRenderer가 처리하므로 기본 정보만 포함
    return {
      sid: decorator.sid,
      stype: decorator.stype, // defineDecorator로 정의된 타입
      category: decorator.category,
      layerTarget: decorator.layerTarget || this.getDefaultLayerTarget(decorator),
      position, // 위치 정보 (layer decorator인 경우)
      data: decorator.data // decorator 데이터 (템플릿에서 사용)
    };
  }
}
```

### 3. DecoratorModel 타입

```typescript
// packages/editor-view-dom/src/decorator/types.ts

interface DecoratorModel extends ModelData {
  sid: string;
  stype: string; // defineDecorator로 정의된 타입
  category: 'layer' | 'inline' | 'block';
  layerTarget?: 'content' | 'decorator' | 'selection' | 'context' | 'custom';
  position?: {
    top: number;
    left: number;
    width?: number;
    height?: number;
  };
  data?: Record<string, any>; // 템플릿에서 data()로 접근
}
```

## 렌더링 시점 및 순서

### 시나리오 분석

#### 시나리오 1: Content 먼저, Decorator 바로

```typescript
render() {
  // 1. Content 렌더링
  this.contentRenderer.render(layers.content, modelData);
  
  // 2. Decorator 바로 렌더링 (동기)
  this.renderDecoratorLayers(modelData);
}
```

**문제점**:
- Content 렌더링이 완료되지 않았을 수 있음
- DOM 위치 계산이 실패할 수 있음

#### 시나리오 2: Content 먼저, Decorator requestAnimationFrame 이후

```typescript
render() {
  // 1. Content 렌더링
  this.contentRenderer.render(layers.content, modelData);
  
  // 2. Decorator 렌더링 (다음 프레임)
  requestAnimationFrame(() => {
    this.renderDecoratorLayers(modelData);
  });
}
```

**장점**:
- Content 렌더링 완료 보장
- DOM 위치 계산 가능
- 브라우저 렌더링 사이클과 동기화

**단점**:
- 1프레임 지연

#### 시나리오 3: requestAnimationFrame을 계속 수행

```typescript
render() {
  // 1. Content 렌더링
  this.contentRenderer.render(layers.content, modelData);
  
  // 2. Decorator 렌더링 (지속적)
  this.scheduleDecoratorRender(modelData);
}

private scheduleDecoratorRender(modelData: ModelData): void {
  requestAnimationFrame(() => {
    this.renderDecoratorLayers(modelData);
    // 필요시 다시 스케줄링
  });
}
```

**문제점**:
- 불필요한 렌더링 발생 가능
- 성능 저하

### 최종 결정: requestAnimationFrame 1회 사용

**이유**:
1. Content 렌더링 완료 보장 필요
2. DOM 위치 계산을 위해 DOM이 준비되어야 함
3. 1프레임 지연은 사용자 경험에 큰 영향 없음
4. 지속적인 requestAnimationFrame은 불필요

## 최종 렌더링 구조

### 1. 전체 렌더링 흐름

```typescript
// packages/editor-view-dom/src/editor-view-dom.ts

export class EditorViewDOM {
  render(tree?: ModelData | any): void {
    const modelData = tree || this.editor.exportToTree();
    
    // 1. Content 레이어 먼저 렌더링
    const contentDecorators = allDecorators.filter(d => 
      d.category !== 'layer' || d.layerTarget === 'content'
    );
    this.contentRenderer.render(
      this.layers.content, 
      modelData, 
      contentDecorators
    );
    
    // 2. Content 렌더링 완료 후 Decorator 레이어들 렌더링
    // requestAnimationFrame으로 DOM 준비 보장
    requestAnimationFrame(() => {
      this.renderDecoratorLayers(modelData);
    });
  }
  
  /**
   * Decorator 레이어들 렌더링
   */
  private renderDecoratorLayers(modelData: ModelData): void {
    // 1. 모든 decorator를 DecoratorModel로 변환 (Prebuilder)
    const allDecoratorModels = this.decoratorPrebuilder.buildAll(
      allDecorators,
      modelData
    );
    
    // 2. Layer별로 분리
    const decoratorModelsByLayer = this.separateByLayer(allDecoratorModels);
    
    // 3. 각 Layer에 해당하는 DOMRenderer로 렌더링
    this.renderLayer('decorator', decoratorModelsByLayer.get('decorator') || []);
    this.renderLayer('selection', decoratorModelsByLayer.get('selection') || []);
    this.renderLayer('context', decoratorModelsByLayer.get('context') || []);
    this.renderLayer('custom', decoratorModelsByLayer.get('custom') || []);
  }
  
  /**
   * Layer별로 DecoratorModel 분리
   */
  private separateByLayer(
    decoratorModels: DecoratorModel[]
  ): Map<LayerTarget, DecoratorModel[]> {
    const map = new Map<LayerTarget, DecoratorModel[]>();
    
    for (const model of decoratorModels) {
      const layerTarget = model.layerTarget || 
        (model.category === 'layer' ? 'decorator' : 'content');
      
      if (!map.has(layerTarget)) {
        map.set(layerTarget, []);
      }
      map.get(layerTarget)!.push(model);
    }
    
    return map;
  }
  
  /**
   * 단일 Layer 렌더링
   */
  private renderLayer(
    layerTarget: 'decorator' | 'selection' | 'context' | 'custom',
    decoratorModels: DecoratorModel[]
  ): void {
    const container = this.layers[layerTarget];
    if (!container) return;
    
    // 해당 Layer의 DOMRenderer 가져오기
    const renderer = this.getLayerRenderer(layerTarget);
    
    if (decoratorModels.length === 0) {
      // 빈 레이어는 클리어
      container.innerHTML = '';
      return;
    }
    
    // renderChildren 사용 (root 없이 children만)
    renderer.renderChildren(container, decoratorModels);
  }
  
  /**
   * Layer별 DOMRenderer 가져오기
   */
  private getLayerRenderer(
    layerTarget: 'decorator' | 'selection' | 'context' | 'custom'
  ): DOMRenderer {
    switch (layerTarget) {
      case 'decorator':
        return this.decoratorRenderer;
      case 'selection':
        return this.selectionRenderer;
      case 'context':
        return this.contextRenderer;
      case 'custom':
        return this.customRenderer;
      default:
        throw new Error(`Unknown layer target: ${layerTarget}`);
    }
  }
}
```

### 2. DOMRenderer에 renderChildren 추가

```typescript
// packages/renderer-dom/src/dom-renderer.ts

export class DOMRenderer {
  // ...
  
  /**
   * Children만 렌더링 (root 없이)
   * Decorator 레이어처럼 root가 필요 없는 경우 사용
   */
  renderChildren(
    container: HTMLElement,
    models: ModelData[],
    options?: {
      decorators?: Decorator[];
      runtime?: Record<string, any>;
    }
  ): void {
    // reconcileChildren을 직접 사용
    this.reconciler.reconcileChildren(
      container,
      models,
      { decorators: options?.decorators || [] },
      options?.runtime
    );
  }
}
```

## 렌더링 시나리오

### 시나리오 1: 초기 렌더링

```typescript
view.render();
// 1. Content 렌더링 (동기)
//    contentRenderer.render(layers.content, modelData)
// 2. Decorator 레이어들 렌더링 (requestAnimationFrame)
//    decoratorRenderer.renderChildren(layers.decorator, models)
//    selectionRenderer.renderChildren(layers.selection, models)
//    contextRenderer.renderChildren(layers.context, models)
//    customRenderer.renderChildren(layers.custom, models)
```

### 시나리오 2: Content 레이어 변경

```typescript
view.render(newModel);
// 1. Content 재렌더링
//    contentRenderer.render(layers.content, newModel)
// 2. Decorator 레이어들 재렌더링 (위치 재계산)
//    requestAnimationFrame(() => {
//      decoratorModels = prebuilder.buildAll(decorators, newModel)
//      각 Layer별로 renderChildren()
//    })
```

### 시나리오 3: 단일 Decorator 추가

```typescript
view.addDecorator({ category: 'layer', ... });
// 1. DecoratorManager에 추가
// 2. DecoratorModel로 변환
// 3. 해당 Layer의 DOMRenderer로 부분 업데이트
//    const existingModels = getExistingModels(layerTarget)
//    renderer.renderChildren(container, [...existingModels, newModel])
```

### 시나리오 4: 단일 Decorator 업데이트

```typescript
view.updateDecorator(id, updates);
// 1. DecoratorManager에서 업데이트
// 2. DecoratorModel로 변환
// 3. 해당 Layer의 DOMRenderer로 부분 업데이트
//    (reconcile이 자동으로 diff 적용)
```

### 시나리오 5: 단일 Decorator 제거

```typescript
view.removeDecorator(id);
// 1. DecoratorManager에서 제거
// 2. 해당 Layer의 DOMRenderer로 부분 업데이트
//    const remainingModels = existingModels.filter(m => m.sid !== id)
//    renderer.renderChildren(container, remainingModels)
```

## 렌더링 순서

### 전체 렌더링 순서

```
1. Content 레이어 렌더링 (동기)
   └─ contentRenderer.render(layers.content, modelData)
   └─ DOM 준비 완료
   
2. requestAnimationFrame (다음 프레임)
   └─ Decorator Prebuilder 실행
   │  └─ Decorator → DecoratorModel 변환
   │  └─ 위치 계산 (DOM 기반)
   │
   └─ Layer별로 분리
   │  └─ separateByLayer(decoratorModels)
   │
   └─ 각 Layer 렌더링 (순차 또는 병렬)
      ├─ decoratorRenderer.renderChildren(layers.decorator, models)
      ├─ selectionRenderer.renderChildren(layers.selection, models)
      ├─ contextRenderer.renderChildren(layers.context, models)
      └─ customRenderer.renderChildren(layers.custom, models)
```

### Layer 렌더링 순서

**권장 순서**: decorator → selection → context → custom

**이유**:
- z-index 순서와 일치
- 하위 레이어부터 렌더링하여 상위 레이어가 덮어쓰기 가능

## 부분 업데이트

### 단일 Decorator 추가/업데이트/제거

```typescript
// 단일 decorator 변경 시 전체 재렌더링 불필요
// 해당 Layer만 업데이트

addDecorator(decorator: Decorator): string {
  const id = this.decoratorManager.add(decorator);
  
  // Content 렌더링이 완료되었는지 확인
  if (!this._hasRendered) {
    return id; // 다음 render()에서 처리
  }
  
  // DecoratorModel로 변환
  const modelData = this.editor.exportToTree();
  const decoratorModels = this.decoratorPrebuilder.buildAll([decorator], modelData);
  
  if (decoratorModels.length === 0) return id;
  
  // Layer별로 분리
  const byLayer = this.separateByLayer(decoratorModels);
  
  // 각 Layer에 추가 (부분 업데이트)
  for (const [layerTarget, models] of byLayer.entries()) {
    if (layerTarget === 'content') continue;
    
    const existingModels = this.getExistingDecoratorModels(layerTarget);
    const renderer = this.getLayerRenderer(layerTarget);
    const container = this.layers[layerTarget];
    
    // 기존 리스트에 추가하여 재렌더링
    renderer.renderChildren(container, [...existingModels, ...models]);
  }
  
  return id;
}
```

## 성능 고려사항

### 1. requestAnimationFrame 사용

**이유**:
- Content 렌더링 완료 보장
- DOM 위치 계산 가능
- 브라우저 렌더링 사이클과 동기화

**단점**:
- 1프레임 지연 (약 16ms)

### 2. 부분 업데이트

**장점**:
- 변경된 Layer만 업데이트
- 불필요한 재렌더링 방지

**구현**:
- 각 Layer별로 독립적인 DOMRenderer
- reconcile 알고리즘으로 효율적 diff

### 3. 메모리 관리

**고려사항**:
- 각 Layer별로 prevVNodeTree 저장
- 제거된 decorator의 prevVNode 정리 필요

## DOM Query 최적화

### ComponentManager 캐시 활용

Content 레이어의 DOM 요소를 찾을 때 `querySelector` 대신 `ComponentManager`의 캐시를 활용:

```typescript
// DOMQuery 개선
export class DOMQuery {
  constructor(
    private contentLayer: HTMLElement,
    private contentRenderer?: DOMRenderer
  ) {}
  
  findElementBySid(sid: string): HTMLElement | null {
    // 1. ComponentManager 캐시 활용 (우선)
    if (this.contentRenderer) {
      const instance = this.contentRenderer
        .getComponentManager()
        ?.getComponentInstance(sid);
      if (instance?.element) {
        return instance.element; // O(1) Map 조회
      }
    }
    
    // 2. Fallback: querySelector
    return this.contentLayer.querySelector(`[data-bc-sid="${sid}"]`);
  }
}
```

**장점**:
- 성능: O(1) Map 조회 vs O(n) DOM 순회
- 정확성: 실제 렌더링된 요소만 반환
- 일관성: DOMRenderer와 동일한 방식

상세 내용: `dom-query-with-component-manager.md` 참고

## 구현 체크리스트

### Phase 1: 기본 구조
- [ ] Layer별 DOMRenderer 생성
- [ ] DecoratorPrebuilder 구현
- [ ] DecoratorModel 타입 정의
- [ ] DOMRenderer.getComponentManager() 추가

### Phase 2: 렌더링 파이프라인
- [ ] DOMRenderer.renderChildren() 추가
- [ ] Content 먼저, Decorator 나중 렌더링
- [ ] requestAnimationFrame 통합

### Phase 3: 위치 계산
- [ ] DOMQuery 구현 (ComponentManager 활용)
- [ ] PositionCalculator 구현
- [ ] target 기반 위치 계산

### Phase 4: 부분 업데이트
- [ ] 단일 decorator 추가/업데이트/제거
- [ ] 기존 decorator 리스트 유지
- [ ] 효율적 재렌더링

### Phase 5: 테스트 및 최적화
- [ ] 렌더링 정확성 확인
- [ ] 성능 테스트
- [ ] 메모리 누수 확인

## 요약

### 핵심 구조

1. **Layer별 DOMRenderer 분리**: 각 Layer가 독립적인 상태 관리
2. **Content 먼저, Decorator 나중**: requestAnimationFrame으로 DOM 준비 보장
3. **Root 없이 렌더링**: `renderChildren()` 사용
4. **부분 업데이트**: 각 Layer를 독립적으로 업데이트

### 렌더링 순서

```
1. Content 렌더링 (동기)
2. requestAnimationFrame
3. Decorator Prebuilder 실행
4. Layer별로 분리
5. 각 Layer 렌더링 (renderChildren)
```

### API

```typescript
// Content
contentRenderer.render(container, modelData, decorators)

// 나머지 Layer
decoratorRenderer.renderChildren(container, decoratorModels)
selectionRenderer.renderChildren(container, selectionModels)
contextRenderer.renderChildren(container, contextModels)
customRenderer.renderChildren(container, customModels)
```

