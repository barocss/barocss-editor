# skipNodes와 핸들러 통합 가이드

## 핵심 질문

**editor-view-dom에서 여러 핸들러들(InputHandler, SelectionHandler, MutationObserverManager 등)도 skipNodes에 대한 처리가 필요한가?**

---

## 현재 EditorViewDOM의 핸들러 구조

### 주요 핸들러들

1. **InputHandler** (`InputHandlerImpl`)
   - 역할: 사용자 입력 처리 (텍스트 입력, IME 조합)
   - 위치: `event-handlers/input-handler.ts`
   - 주요 메서드:
     - `handleInput()`: input 이벤트 처리
     - `handleTextContentChange()`: MutationObserver에서 호출, 모델 업데이트
     - `handleCompositionStart/End()`: IME 조합 처리

2. **SelectionHandler** (`DOMSelectionHandlerImpl`)
   - 역할: DOM Selection ↔ Model Selection 변환
   - 위치: `event-handlers/selection-handler.ts`
   - 주요 메서드:
     - `convertDOMSelectionToModel()`: DOM → Model 변환
     - `convertModelSelectionToDOM()`: Model → DOM 변환

3. **MutationObserverManager** (`MutationObserverManagerImpl`)
   - 역할: DOM 변경 감지
   - 위치: `mutation-observer/mutation-observer-manager.ts`
   - 주요 메서드:
     - `handleTextContentChange()`: 텍스트 변경 감지 → InputHandler 호출

4. **NativeCommands** (`NativeCommands`)
   - 역할: 브라우저 네이티브 명령 처리
   - 위치: `native-commands/native-commands.ts`

---

## skipNodes의 역할과 범위

### skipNodes는 렌더링 단계의 개념

**핵심:**
- skipNodes는 **DOM 업데이트를 스킵**하는 것
- **모델 업데이트는 별개**로 진행됨
- **렌더링(reconcile) 단계**에서만 적용됨

**동작:**
```
모델 업데이트 (항상 수행)
  ↓
VNode 빌드 (항상 수행)
  ↓
Reconcile (skipNodes 체크)
  ↓
DOM 업데이트 (skipNodes에 포함되면 스킵)
```

---

## 각 핸들러별 skipNodes 필요성 분석

### 1. InputHandler ❌ **skipNodes 처리 불필요**

**이유:**
- InputHandler는 **사용자 입력을 모델로 변환**하는 역할
- 모델 업데이트는 **항상 수행**되어야 함 (skipNodes와 무관)
- skipNodes는 렌더링 단계에서만 적용됨

**현재 동작:**
```typescript
// InputHandler.handleTextContentChange()
// 1. DOM 변경 감지
// 2. 모델 업데이트 (항상 수행)
editor.executeTransaction(...)
// 3. editor:content.change 이벤트 발생
// 4. EditorViewDOM.render() 호출 → 여기서 skipNodes 적용
```

**결론:**
- ✅ InputHandler는 그대로 두면 됨
- ✅ 모델 업데이트는 항상 수행
- ✅ 렌더링 단계에서만 skipNodes 적용

---

### 2. SelectionHandler ❌ **skipNodes 처리 불필요**

**이유:**
- SelectionHandler는 **Selection 변환**만 담당
- skipNodes와 무관한 기능

**현재 동작:**
```typescript
// SelectionHandler는 단순히 변환만 수행
convertDOMSelectionToModel() // DOM → Model
convertModelSelectionToDOM() // Model → DOM
```

**결론:**
- ✅ SelectionHandler는 그대로 두면 됨
- ✅ skipNodes와 무관

---

### 3. MutationObserverManager ❌ **skipNodes 처리 불필요**

**이유:**
- MutationObserverManager는 **DOM 변경 감지**만 담당
- 이미 `_isRendering` 플래그로 렌더링 중 변경은 무시함
- skipNodes는 렌더링 단계의 개념이므로 MutationObserver와 무관

**현재 동작:**
```typescript
// MutationObserverManager
// 1. DOM 변경 감지
// 2. _isRendering 체크 (렌더링 중이면 무시)
// 3. InputHandler.handleTextContentChange() 호출
```

**결론:**
- ✅ MutationObserverManager는 그대로 두면 됨
- ✅ `_isRendering` 플래그로 이미 보호됨
- ✅ skipNodes와 무관

---

### 4. NativeCommands ❌ **skipNodes 처리 불필요**

**이유:**
- NativeCommands는 **브라우저 네이티브 명령** 처리
- skipNodes와 무관한 기능

**결론:**
- ✅ NativeCommands는 그대로 두면 됨

---

## 핸들러별 정리 표

| 핸들러 | skipNodes 처리 필요? | 이유 |
|--------|---------------------|------|
| **InputHandler** | ❌ 불필요 | 모델 업데이트는 항상 수행, 렌더링 단계에서만 skipNodes 적용 |
| **SelectionHandler** | ❌ 불필요 | Selection 변환만 담당, skipNodes와 무관 |
| **MutationObserverManager** | ❌ 불필요 | DOM 변경 감지만 담당, `_isRendering` 플래그로 이미 보호 |
| **NativeCommands** | ❌ 불필요 | 네이티브 명령 처리, skipNodes와 무관 |

---

## skipNodes가 적용되는 시점

### 렌더링 단계에서만 적용

```typescript
// EditorViewDOM.render()
render(tree?: ModelData, options?: { sync?: boolean }): void {
  // 1. 모델 가져오기 (항상 수행)
  const modelData = tree || this.editor.getDocumentProxy();
  
  // 2. Decorators 가져오기 (항상 수행)
  const allDecorators = [...];
  
  // 3. 렌더링 (여기서 skipNodes 적용)
  this._domRenderer?.render(
    this.layers.content,
    modelData,
    allDecorators,
    undefined,
    selectionContext,
    { skipNodes: this._editingNodes.size > 0 ? this._editingNodes : undefined }
  );
}
```

### 모델 업데이트는 항상 수행

```typescript
// InputHandler.handleTextContentChange()
// skipNodes와 무관하게 항상 모델 업데이트
editor.executeTransaction({
  operations: [
    { type: 'updateNode', nodeId: textNodeId, text: newText }
  ]
});
// → 모델은 항상 업데이트됨
// → 렌더링 단계에서만 skipNodes 적용
```

---

## 시나리오별 동작

### 시나리오 1: 사용자 입력 중 외부 변경

```
1. 사용자 입력 시작
   → _onInputStart() → editingNodes에 추가

2. 외부 변경 발생 (AI, 동시편집)
   → 모델 업데이트 (항상 수행)
   → render({ skipNodes: editingNodes })
   → DOM 업데이트 스킵 (입력 중인 노드 보호)

3. 사용자 입력 종료
   → _onInputEnd() → editingNodes 제거
   → render() (skipNodes 없음)
   → DOM 업데이트 (최신 모델 반영)
```

**핸들러 동작:**
- ✅ InputHandler: 정상 동작 (모델 업데이트)
- ✅ MutationObserverManager: 정상 동작 (DOM 변경 감지)
- ✅ SelectionHandler: 정상 동작 (Selection 변환)
- ✅ 렌더링 단계에서만 skipNodes 적용

---

### 시나리오 2: 사용자 입력 중 사용자 입력

```
1. 사용자 입력 시작
   → _onInputStart() → editingNodes에 추가

2. 사용자 입력 계속
   → MutationObserver 감지
   → InputHandler.handleTextContentChange()
   → 모델 업데이트 (항상 수행)
   → render({ skipNodes: editingNodes })
   → DOM 업데이트 스킵 (입력 중인 노드 보호)

3. 사용자 입력 종료
   → _onInputEnd() → editingNodes 제거
   → render() (skipNodes 없음)
   → DOM 업데이트 (최신 모델 반영)
```

**핸들러 동작:**
- ✅ InputHandler: 정상 동작 (모델 업데이트)
- ✅ MutationObserverManager: 정상 동작 (DOM 변경 감지)
- ✅ 렌더링 단계에서만 skipNodes 적용

---

## 결론

### 핸들러들은 skipNodes 처리 불필요

**이유:**
1. **skipNodes는 렌더링 단계의 개념**
   - DOM 업데이트를 스킵하는 것
   - 모델 업데이트는 별개로 항상 수행

2. **각 핸들러의 역할이 명확히 분리됨**
   - InputHandler: 모델 업데이트 (항상 수행)
   - SelectionHandler: Selection 변환 (skipNodes와 무관)
   - MutationObserverManager: DOM 변경 감지 (이미 `_isRendering`으로 보호)
   - NativeCommands: 네이티브 명령 처리 (skipNodes와 무관)

3. **렌더링 단계에서만 skipNodes 적용**
   - `EditorViewDOM.render()`에서 `skipNodes` 전달
   - `DOMRenderer.render()`에서 `skipNodes` 옵션 전달
   - `Reconciler.reconcile()`에서 `skipNodes` 체크

### 현재 구현이 올바름

**현재 구조:**
```
사용자 입력
  ↓
InputHandler (모델 업데이트) ✅ 항상 수행
  ↓
editor:content.change 이벤트
  ↓
EditorViewDOM.render()
  ↓
DOMRenderer.render({ skipNodes }) ✅ 여기서만 skipNodes 적용
  ↓
Reconciler.reconcile(skipNodes) ✅ 여기서만 skipNodes 체크
```

**결론:**
- ✅ **핸들러들은 수정 불필요**
- ✅ **렌더링 단계에서만 skipNodes 적용**
- ✅ **모델 업데이트는 항상 수행**

---

## 추가 고려사항

### 향후 확장 가능성

만약 향후 **모델 업데이트도 스킵**해야 한다면:

1. **InputHandler 수정 필요**
   - `handleTextContentChange()`에서 `editingNodes` 체크
   - 입력 중인 노드면 모델 업데이트 스킵

2. **하지만 현재는 불필요**
   - 사용자 입력은 항상 모델에 반영되어야 함
   - skipNodes는 외부 변경으로부터 보호하는 용도

### 권장 사항

**현재 구현 유지:**
- ✅ 핸들러들은 그대로 두기
- ✅ 렌더링 단계에서만 skipNodes 적용
- ✅ 모델 업데이트는 항상 수행

**이유:**
- 명확한 책임 분리
- 단순하고 이해하기 쉬운 구조
- 필요한 기능만 구현 (과도한 최적화 방지)

