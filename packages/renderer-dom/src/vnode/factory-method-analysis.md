# VNodeBuilder 메서드 구조 분석 및 개선 제안

## 현재 메서드 구조

### 1. Public API 메서드
- `build(nodeType, data, options)` - 메인 진입점
- `buildFromElementTemplate(template, data, options)` - ElementTemplate 직접 빌드
- `buildFromComponentTemplate(template, data, options)` - ComponentTemplate 직접 빌드
- `getRegistry()` - Registry 접근

### 2. Core Build 메서드 (템플릿 타입별)
- `_buildElement(template, data, options)` - ElementTemplate → VNode
- `_buildComponent(template, data, options)` - ComponentTemplate → VNode
- `_buildPortal(template, data)` - PortalTemplate → VNode
- `_buildMarkedRunVNode(run, model)` - TextRun → VNode (마크 처리된 텍스트)

### 3. Component 빌드 세부 처리
- `_buildInlineComponent(template, data, options)` - 인라인 컴포넌트 빌드
- `_buildRegisteredRenderer(renderer, template, data, options)` - 등록된 렌더러 빌드
- `_buildRegisteredComponent(component, template, data, options)` - 등록된 컴포넌트 빌드
- `_buildElementTemplateComponent(elementTemplate, template, resolvedProps, mergedData, buildOptions)` - ElementTemplate 기반 컴포넌트 빌드

### 4. Child 처리 메서드
- `_processChild(child, data, vnode, orderedChildren, currentTextParts, flushTextParts, injectedUsedRef, buildOptions, hasDataTextProcessed)` - 자식 요소 처리 (라우터)
- `_processFunctionChild(child, data, orderedChildren, currentTextParts, flushTextParts, buildOptions)` - Function 자식 처리
- `_processDataTemplateChild(child, data, orderedChildren, currentTextParts, flushTextParts, buildOptions, options, injectedUsedRef, hasDataTextProcessed)` - DataTemplate 자식 처리
- `_processEachTemplateChild(child, data, orderedChildren, flushTextParts, buildOptions)` - EachTemplate 자식 처리
- `_processConditionalTemplateChild(child, data, orderedChildren, currentTextParts, flushTextParts, buildOptions)` - ConditionalTemplate 자식 처리
- `_processComponentChild(child, data, buildOptions)` - ComponentTemplate 자식 처리

### 5. Component 관련 헬퍼
- `_resolveComponentPropsAndKey(template, data)` - 컴포넌트 props와 key 해결
- `_renderComponentChildren(template, data, props, buildOptions)` - 컴포넌트 자식 렌더링
- `_createComponentWrapperAttrs(componentName, data)` - 컴포넌트 래퍼 속성 생성

### 6. Attribute/Style 처리
- `_setAttributes(vnode, attributes, data)` - VNode에 속성 설정
- `_resolveAttributeValue(key, value, data)` - 단일 속성 값 해결
- `_resolveStyleObject(styleValue, data)` - 스타일 객체 해결
- `_resolveClassName(classNameValue, data)` - className 해결

### 7. Text 처리
- `_shouldCollapseTextChild(orderedChildren, hasDataTextProcessed)` - 텍스트 자식 collapse 여부 결정
- `_applyTextCollapse(vnode, orderedChildren, shouldCollapse)` - 텍스트 collapse 적용
- `_buildMarkedRunsWithDecorators(text, marks, decorators, sid, model)` - 마크와 데코레이터가 있는 텍스트 빌드
- `_convertDecoratorRangesToMarkRunRelative(inlineDecorators, markRun)` - 데코레이터 범위를 마크 런 기준으로 변환
- `_processDecoratorRuns(decoratorRun, inner, nodes, markRun)` - 데코레이터 런 처리

### 8. Decorator 처리
- `_processDecorators(vnode, decorators, sid, model, parentVNode)` - 데코레이터 처리 (메인)
- `_processInlineDecorators(vnode, decorators, sid, model)` - 인라인 데코레이터 처리

### 9. Slot 처리
- `_renderSlotGetChildren(vnode, slot, data)` - Slot 자식 렌더링
- `_buildExternalComponentForSlot(child, childType, index)` - Slot용 외부 컴포넌트 빌드

### 10. Context/State 관리
- `_makeContext(id, state, props, model, overrides)` - 컴포넌트 컨텍스트 생성
- `_getComponentStateForBuild(template, data, props)` - 빌드 시 컴포넌트 상태 가져오기
- `ensureUniqueId(id)` - 고유 ID 보장

## 문제점 및 개선 제안

### 1. 메서드 이름 일관성 문제

#### 문제:
- `_build*` vs `_process*` vs `_render*` vs `_resolve*` vs `_apply*` - 접두사가 일관되지 않음
- `_buildMarkedRunVNode` vs `_buildMarkedRunsWithDecorators` - 유사한 기능인데 이름이 다름

#### 제안:
- **`_build*`**: Template → VNode 변환 (최종 결과물 생성)
- **`_process*`**: 데이터 처리 및 변환 (중간 단계)
- **`_resolve*`**: 값 해결 및 계산 (값 추출)
- **`_apply*`**: VNode에 변경사항 적용 (수정)
- **`_render*`**: 자식 요소 렌더링 (특정 컨텍스트에서의 렌더링)

### 2. 책임 분리 문제

#### 문제:
- `_processChild`가 너무 많은 책임을 가짐 (라우터 역할 + 처리)
- `_buildElement`가 너무 길고 복잡함 (200+ 줄)
- `_buildComponent`도 매우 복잡함 (200+ 줄)

#### 제안:
- `_processChild`를 더 작은 단위로 분리
- `_buildElement`를 단계별로 분리:
  - `_initializeElementVNode` - VNode 초기화
  - `_processElementChildren` - 자식 처리
  - `_finalizeElementVNode` - 최종 정리

### 3. 네이밍 개선 제안

#### 현재 → 제안:

1. **Text 처리**
   - `_buildMarkedRunVNode` → `_buildTextRunVNode` (더 명확)
   - `_buildMarkedRunsWithDecorators` → `_buildTextWithMarksAndDecorators` (더 설명적)

2. **Component 처리**
   - `_buildElementTemplateComponent` → `_buildComponentFromElementTemplate` (더 명확한 순서)
   - `_processComponentChild` → `_buildComponentChild` (일관성)

3. **Attribute 처리**
   - `_setAttributes` → `_applyAttributesToVNode` (apply 패턴 일관성)
   - `_resolveAttributeValue` → `_resolveAttribute` (간결함)

4. **Decorator 처리**
   - `_processDecorators` → `_applyDecoratorsToVNode` (apply 패턴)
   - `_processInlineDecorators` → `_applyInlineDecoratorsToVNode` (일관성)

### 4. 메서드 그룹화 제안

#### 그룹 1: Core Build (템플릿 → VNode)
```
_buildElement
_buildComponent
_buildPortal
_buildTextRunVNode
```

#### 그룹 2: Component Build (컴포넌트 특화)
```
_buildInlineComponent
_buildRegisteredRenderer
_buildRegisteredComponent
_buildComponentFromElementTemplate
_buildComponentChild
```

#### 그룹 3: Child Processing (자식 처리)
```
_processChild (라우터)
_processFunctionChild
_processDataTemplateChild
_processEachTemplateChild
_processConditionalTemplateChild
```

#### 그룹 4: Text Processing (텍스트 처리)
```
_shouldCollapseTextChild
_applyTextCollapse
_buildTextWithMarksAndDecorators
_convertDecoratorRangesToMarkRunRelative
_processDecoratorRuns
```

#### 그룹 5: Attribute Resolution (속성 해결)
```
_applyAttributesToVNode
_resolveAttribute
_resolveStyleObject
_resolveClassName
```

#### 그룹 6: Component Helpers (컴포넌트 헬퍼)
```
_resolveComponentPropsAndKey
_renderComponentChildren
_createComponentWrapperAttrs
```

#### 그룹 7: Decorator Processing (데코레이터 처리)
```
_applyDecoratorsToVNode
_applyInlineDecoratorsToVNode
```

#### 그룹 8: Slot Processing (Slot 처리)
```
_renderSlotGetChildren
_buildExternalComponentForSlot
```

#### 그룹 9: Context/State (컨텍스트/상태)
```
_makeContext
_getComponentStateForBuild
ensureUniqueId
```

## 우선순위별 개선 사항

### High Priority (즉시 개선)
1. 메서드 이름 일관성 확보 (`_build*`, `_process*`, `_resolve*`, `_apply*` 규칙)
2. `_buildElement` 분해 (너무 복잡함)
3. `_buildComponent` 분해 (너무 복잡함)

### Medium Priority (점진적 개선)
1. `_processChild` 단순화
2. Text 처리 메서드 이름 통일
3. Decorator 처리 메서드 이름 통일

### Low Priority (선택적 개선)
1. 메서드 그룹화 및 주석 정리
2. 중복 로직 추출

