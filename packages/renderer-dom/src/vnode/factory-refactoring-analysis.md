# Factory.ts 리팩토링 분석 - 분리 가능한 복잡한 부분

## 1. `build()` 메소드 (289-438줄, 약 150줄)

### 분리 가능한 부분:

#### 1.1 Component State 가져오기 (342-363줄)
```typescript
// 현재: build() 메소드 내부에 인라인
// 제안: _getComponentStateForBuild()로 이미 분리되어 있지만, 
//       build() 내부에서도 사용되는 부분을 별도 함수로
```
**제안 함수**: `_resolveComponentStateForBuild(nodeType, data, componentId)`

#### 1.2 Component Function 실행 및 ElementTemplate 체크 (367-420줄)
```typescript
// 현재: build() 메소드 내부에 긴 try-catch 블록
// 제안: 별도 함수로 분리
```
**제안 함수**: `_tryExecuteComponentFunction(componentTemplate, data, options)`

---

## 2. `_processChild()` 메소드 (1049-1296줄, 약 250줄) ⭐ 가장 복잡

### 분리 가능한 부분:

#### 2.1 Function Child 처리 (1076-1114줄)
```typescript
// 현재: _processChild() 내부에 긴 조건문
// 제안: 별도 함수로 분리
```
**제안 함수**: `_processFunctionChild(child, data, orderedChildren, currentTextParts, flushTextParts, buildOptions)`

#### 2.2 DataTemplate 처리 및 Marks/Decorators 처리 (1159-1220줄)
```typescript
// 현재: _processChild() 내부에 매우 긴 로직
// 제안: 별도 함수로 분리
```
**제안 함수**: `_processDataTemplateChild(child, data, orderedChildren, currentTextParts, flushTextParts, buildOptions, hasDataTextProcessed)`

#### 2.3 EachTemplate 처리 (1229-1248줄)
```typescript
// 현재: _processChild() 내부에 인라인
// 제안: 별도 함수로 분리
```
**제안 함수**: `_processEachTemplateChild(child, data, orderedChildren, buildOptions)`

#### 2.4 ConditionalTemplate 처리 (1249-1275줄)
```typescript
// 현재: _processChild() 내부에 인라인
// 제안: 별도 함수로 분리
```
**제안 함수**: `_processConditionalTemplateChild(child, data, orderedChildren, currentTextParts, flushTextParts, buildOptions)`

---

## 3. `_setAttributes()` 메소드 (1387-1461줄, 약 75줄)

### 분리 가능한 부분:

#### 3.1 Style 객체 처리 (1409-1427줄)
```typescript
// 현재: _setAttributes() 내부에 중첩된 forEach
// 제안: 별도 함수로 분리
```
**제안 함수**: `_resolveStyleObject(styleValue, data): Record<string, any>`

#### 3.2 className 처리 (1431-1442줄)
```typescript
// 현재: _setAttributes() 내부에 인라인
// 제안: 별도 함수로 분리
```
**제안 함수**: `_resolveClassName(classNameValue, data): string`

#### 3.3 속성 값 해결 (1391-1407줄)
```typescript
// 현재: _setAttributes() 내부에 여러 조건문
// 제안: 별도 함수로 분리
```
**제안 함수**: `_resolveAttributeValue(key, value, data): any`

---

## 4. `_buildComponent()` 메소드 (1751-2087줄, 약 350줄) ⭐ 가장 복잡

### 분리 가능한 부분:

#### 4.1 Props/Key 해결 (1975-2000줄)
```typescript
// 현재: _buildComponent() 내부에 긴 조건문
// 제안: 별도 함수로 분리
```
**제안 함수**: `_resolveComponentPropsAndKey(template, data): { props: Record<string, any>, key: string }`

#### 4.2 Children 렌더링 (2027-2052줄)
```typescript
// 현재: _buildComponent() 내부에 forEach
// 제안: 별도 함수로 분리
```
**제안 함수**: `_renderComponentChildren(template, data, buildOptions): VNode[]`

#### 4.3 Wrapper Attrs 생성 (2060-2068줄)
```typescript
// 현재: _buildComponent() 내부에 인라인
// 제안: 별도 함수로 분리
```
**제안 함수**: `_createComponentWrapperAttrs(templateName, data): Record<string, any>`

#### 4.4 Registered Component 처리 (1864-1967줄)
```typescript
// 현재: _buildComponent() 내부에 매우 긴 블록
// 제안: 별도 함수로 분리
```
**제안 함수**: `_buildRegisteredComponent(registeredComponent, template, data, buildOptions): VNode | null`

#### 4.5 Registered Renderer 처리 (1792-1861줄)
```typescript
// 현재: _buildComponent() 내부에 긴 블록
// 제안: 별도 함수로 분리
```
**제안 함수**: `_buildRegisteredRenderer(registeredRenderer, template, data, buildOptions): VNode | null`

---

## 5. `_buildMarkedRunsWithDecorators()` 메소드 (2168-2297줄, 약 130줄)

### 분리 가능한 부분:

#### 5.1 Decorator Range 변환 (2182-2205줄)
```typescript
// 현재: _buildMarkedRunsWithDecorators() 내부에 map().filter()
// 제안: 별도 함수로 분리
```
**제안 함수**: `_convertDecoratorRangesToMarkRunRelative(inlineDecorators, markRun): Decorator[]`

#### 5.2 Decorator 분류 및 처리 (2242-2292줄)
```typescript
// 현재: _buildMarkedRunsWithDecorators() 내부에 긴 블록
// 제안: 별도 함수로 분리
```
**제안 함수**: `_processDecoratorRuns(decoratorRuns, inner, nodes, buildElementFn): void`

---

## 6. `_buildElement()` 메소드 (772-972줄, 약 200줄)

### 분리 가능한 부분:

#### 6.1 Collapse 로직 (892-941줄)
```typescript
// 현재: _buildElement() 내부에 긴 조건문
// 제안: 별도 함수로 분리
```
**제안 함수**: `_shouldCollapseTextChild(orderedChildren, hasDataTextProcessed): boolean`
**제안 함수**: `_applyTextCollapse(vnode, orderedChildren, shouldCollapse): void`

#### 6.2 Sid/Marks 설정 (951-969줄)
```typescript
// 현재: _buildElement() 내부에 인라인
// 제안: 별도 함수로 분리
```
**제안 함수**: `_applyComponentIdentity(vnode, data, options): void`

---

## 7. `_buildInlineComponent()` 메소드 (1607-1728줄, 약 120줄)

### 분리 가능한 부분:

#### 7.1 Props/Key/InitialState 해결 (1612-1646줄)
```typescript
// 현재: _buildInlineComponent() 내부에 긴 조건문
// 제안: 별도 함수로 분리
```
**제안 함수**: `_resolveInlineComponentConfig(template, data): { props, key, initialState }`

#### 7.2 State Getter 생성 (1671-1681줄)
```typescript
// 현재: _buildInlineComponent() 내부에 함수 정의
// 제안: 별도 함수로 분리
```
**제안 함수**: `_createStateGetter(stateInstance, buildTimeState, initStateCalled, initStateValue): () => Record<string, any>`

---

## 우선순위 추천

### 높은 우선순위 (복잡도가 높고 자주 사용됨):
1. **`_processChild()` 메소드 분리** - 가장 복잡하고 여러 책임을 가짐
2. **`_buildComponent()` 메소드 분리** - 가장 긴 메소드, 여러 케이스 처리
3. **`_setAttributes()` 메소드 분리** - 중첩된 로직이 많음

### 중간 우선순위:
4. **`_buildElement()` 메소드 분리** - Collapse 로직이 복잡함
5. **`_buildMarkedRunsWithDecorators()` 메소드 분리** - Decorator 처리 로직이 복잡함

### 낮은 우선순위:
6. **`build()` 메소드 분리** - 상대적으로 단순함
7. **`_buildInlineComponent()` 메소드 분리** - 상대적으로 단순함

