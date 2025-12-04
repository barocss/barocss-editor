# skipNodes 동작 방식

## 핵심 질문

### Q1: skipNodes로 적용되면 렌더링에서 제외되고, 문서는 업데이트 되는가?

**답:**
- ✅ **렌더링에서 제외됨** (DOM 업데이트 안 함)
- ⚠️ **문서(모델)는 별도로 업데이트될 수 있음** (하지만 DOM에는 반영 안 됨)

### Q2: 렌더링 제외를 안 시키려면 skipNodes가 없는 상태로 다시 렌더링해야 하는가?

**답:**
- ✅ **네, 맞습니다!**
- skipNodes를 제거하고 다시 렌더링하면, 업데이트된 모델이 DOM에 반영됩니다.

---

## 상세 동작

### 1. skipNodes 적용 시

**시나리오:**
```typescript
// 1. 초기 렌더링
const model1 = { sid: 'node-1', stype: 'paragraph', text: 'Hello' };
renderer.render(container, model1, []);

// 2. 모델 업데이트 (외부 변경)
const model2 = { sid: 'node-1', stype: 'paragraph', text: 'Updated' };

// 3. skipNodes와 함께 렌더링
const skipNodes = new Set(['node-1']);
renderer.render(container, model2, [], undefined, undefined, { skipNodes });
```

**결과:**
- ✅ **모델은 업데이트됨** (`model2`로 변경)
- ❌ **DOM은 업데이트 안 됨** (여전히 'Hello' 표시)
- ✅ **이전 DOM 유지** (사용자 입력 보호)

**이유:**
- `renderFiberNode`에서 skipNodes 체크 → 스킵
- `commitFiberNode`에서 skipNodes 체크 → DOM 업데이트 안 함
- 하지만 VNodeBuilder는 항상 최신 모델(`model2`)에서 VNode를 빌드함
- 결과적으로 모델과 DOM이 불일치 상태

---

### 2. skipNodes 제거 후 재렌더링

**시나리오:**
```typescript
// 1. skipNodes와 함께 렌더링 (위와 동일)
const skipNodes = new Set(['node-1']);
renderer.render(container, model2, [], undefined, undefined, { skipNodes });
// DOM: 'Hello' (업데이트 안 됨)

// 2. skipNodes 제거 후 재렌더링
renderer.render(container, model2, []); // skipNodes 없음
// DOM: 'Updated' (업데이트됨)
```

**결과:**
- ✅ **모델은 이미 업데이트됨** (`model2`)
- ✅ **DOM도 업데이트됨** ('Updated' 표시)
- ✅ **모델과 DOM 일치**

---

## 동작 흐름 다이어그램

```
┌─────────────────────────────────────────────────────────────┐
│ 1. 모델 업데이트 (외부 변경)                                  │
│    model: { sid: 'node-1', text: 'Updated' }                │
└─────────────────────────────────────────────────────────────┘
                        ↓
┌─────────────────────────────────────────────────────────────┐
│ 2. VNodeBuilder.build()                                     │
│    - 최신 모델에서 VNode 빌드                                 │
│    - vnode: { sid: 'node-1', text: 'Updated' }              │
└─────────────────────────────────────────────────────────────┘
                        ↓
┌─────────────────────────────────────────────────────────────┐
│ 3. Reconciler.reconcile(skipNodes)                          │
│    - skipNodes.has('node-1') → true                         │
│    - reconcileChildrenOnly() 호출                            │
└─────────────────────────────────────────────────────────────┘
                        ↓
┌─────────────────────────────────────────────────────────────┐
│ 4. renderFiberNode()                                         │
│    - skipNodes.has('node-1') → true                         │
│    - return (스킵)                                           │
│    - effectTag = null                                        │
└─────────────────────────────────────────────────────────────┘
                        ↓
┌─────────────────────────────────────────────────────────────┐
│ 5. commitFiberNode()                                         │
│    - skipNodes.has('node-1') → true                         │
│    - return (스킵)                                           │
│    - DOM 업데이트 안 함                                      │
└─────────────────────────────────────────────────────────────┘
                        ↓
┌─────────────────────────────────────────────────────────────┐
│ 결과:                                                         │
│ - 모델: 'Updated' ✅                                         │
│ - DOM: 'Hello' ❌ (이전 상태 유지)                           │
│ - 불일치 상태                                                 │
└─────────────────────────────────────────────────────────────┘
```

---

## 해결 방법: skipNodes 제거 후 재렌더링

```
┌─────────────────────────────────────────────────────────────┐
│ 1. 입력 종료 (사용자가 타이핑 완료)                            │
│    editingNodes.delete('node-1')                            │
└─────────────────────────────────────────────────────────────┘
                        ↓
┌─────────────────────────────────────────────────────────────┐
│ 2. skipNodes 없이 재렌더링                                   │
│    renderer.render(container, model2, []);                  │
│    // skipNodes 없음                                         │
└─────────────────────────────────────────────────────────────┘
                        ↓
┌─────────────────────────────────────────────────────────────┐
│ 3. 정상 reconcile                                            │
│    - renderFiberNode() → effectTag = UPDATE                  │
│    - commitFiberNode() → DOM 업데이트                        │
└─────────────────────────────────────────────────────────────┘
                        ↓
┌─────────────────────────────────────────────────────────────┐
│ 결과:                                                         │
│ - 모델: 'Updated' ✅                                         │
│ - DOM: 'Updated' ✅                                          │
│ - 일치 상태                                                   │
└─────────────────────────────────────────────────────────────┘
```

---

## EditorViewDOM에서의 활용

### 입력 중인 노드 추적

```typescript
class EditorViewDOM {
  private editingNodes: Set<string> = new Set();
  
  // 입력 시작
  onInputStart(nodeId: string) {
    this.editingNodes.add(nodeId);
  }
  
  // 입력 종료
  onInputEnd(nodeId: string) {
    this.editingNodes.delete(nodeId);
    
    // 입력 종료 후 재렌더링 (skipNodes 없이)
    this.render();
  }
  
  // 외부 변경 시 렌더링
  onExternalChange() {
    // skipNodes와 함께 렌더링 (입력 중인 노드 보호)
    this.render({ skipNodes: this.editingNodes });
  }
  
  render(options?: { skipNodes?: Set<string> }) {
    this.domRenderer.render(
      this.container,
      this.model,
      this.decorators,
      this.runtime,
      undefined,
      options // skipNodes 전달
    );
  }
}
```

### 시나리오별 동작

**시나리오 1: 사용자 입력 중 외부 변경**
```typescript
// 1. 사용자 입력 시작
editorViewDOM.onInputStart('node-1');
// editingNodes: ['node-1']

// 2. 외부 변경 발생 (AI, 동시편집)
model.text = 'Updated by AI';
editorViewDOM.onExternalChange();
// render({ skipNodes: ['node-1'] })
// → DOM 업데이트 안 됨 (사용자 입력 보호)

// 3. 사용자 입력 종료
editorViewDOM.onInputEnd('node-1');
// editingNodes: []
// render() // skipNodes 없음
// → DOM 업데이트됨 (최신 모델 반영)
```

**시나리오 2: 입력 중이 아닐 때 외부 변경**
```typescript
// 1. 외부 변경 발생
model.text = 'Updated by AI';
editorViewDOM.onExternalChange();
// render({ skipNodes: [] }) // editingNodes가 비어있음
// → DOM 즉시 업데이트됨
```

---

## 주의사항

### 1. 모델과 DOM 불일치

**문제:**
- skipNodes 적용 시 모델은 업데이트되지만 DOM은 업데이트 안 됨
- 일시적으로 불일치 상태

**해결:**
- 입력 종료 시 skipNodes 제거 후 재렌더링
- 또는 pending 변경을 저장했다가 입력 종료 시 적용

### 2. 자식 노드 처리

**현재 동작:**
- 부모가 skipNodes에 포함되면 부모는 스킵
- 하지만 자식 노드는 계속 reconcile 가능

**주의:**
- 자식 노드도 skipNodes에 포함시키면 자식도 스킵됨
- 입력 중인 노드만 보호하려면 해당 노드만 skipNodes에 추가

### 3. 입력 종료 시점 판단

**고려사항:**
- `blur` 이벤트: 포커스가 벗어날 때
- `compositionend` 이벤트: IME 입력 완료 시
- Debounce: 일정 시간 입력이 없을 때

**권장:**
- 여러 시점을 조합하여 안전하게 판단
- 입력 종료 후 즉시 재렌더링

---

## 요약

### skipNodes의 역할

1. **렌더링 제외**: DOM 업데이트 안 함
2. **모델 업데이트**: 별도로 가능 (하지만 DOM에는 반영 안 됨)
3. **재렌더링 필요**: skipNodes 제거 후 재렌더링하여 동기화

### 사용 패턴

```typescript
// 입력 중: skipNodes와 함께 렌더링
render({ skipNodes: editingNodes });

// 입력 종료: skipNodes 없이 재렌더링
render(); // skipNodes 없음
```

### 핵심 원칙

- **skipNodes = DOM 업데이트 스킵**
- **모델 업데이트는 별개**
- **동기화를 위해 재렌더링 필요**

