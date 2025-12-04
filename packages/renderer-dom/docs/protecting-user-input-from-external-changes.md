# 사용자 입력 보호: AI/동시편집으로부터 입력 중인 노드 보호

## 문제 상황

### 시나리오

```
1. 사용자가 노드 A에서 입력 중 (typing...)
   - activeTextNodeId = 'nodeA'
   - 사용자가 "Hello" 입력 중

2. AI가 노드 A를 수정 (외부 변경)
   - 모델: nodeA.text = "Hello AI"
   - editor:content.change 이벤트 발생
   - 렌더링 시스템이 DOM 재생성

3. 문제: 사용자의 입력이 사라지거나 방해받음
   - 사용자가 입력 중인데 DOM이 재생성됨
   - 커서 위치가 변경됨
   - 입력이 중단됨
```

**핵심 문제:**
- 사용자가 입력 중인 노드가 외부 변경으로부터 보호되지 않음
- 렌더링이 사용자 입력을 방해할 수 있음

---

## 현재 구현 상태

### 현재 보호 메커니즘

**1. activeTextNodeId 추적**
```typescript
// input-handler.ts
class InputHandlerImpl {
  private activeTextNodeId: string | null = null;
  
  handleTextContentChange(textNodeId: string) {
    // 다른 노드에서의 변경은 무시
    if (this.activeTextNodeId && textNodeId !== this.activeTextNodeId) {
      return; // 활성 노드가 아니면 무시
    }
  }
}
```

**2. IME 조합 상태 추적**
```typescript
class InputHandlerImpl {
  private isComposing = false;
  private pendingTextNodeId: string | null = null;
  
  handleCompositionStart() {
    this.isComposing = true;
  }
  
  handleTextContentChange() {
    if (this.isComposing) {
      // 조합 중 변경사항을 pending에 저장
      this.pendingTextNodeId = textNodeId;
      return;
    }
  }
}
```

**3. 렌더링 플래그**
```typescript
class EditorViewDOM {
  private _isRendering = false;
  
  render() {
    this._isRendering = true;
    try {
      // 렌더링 수행
    } finally {
      this._isRendering = false;
    }
  }
  
  // MutationObserver 콜백
  onDOMChange() {
    if (this._isRendering) {
      // 렌더링 중 발생한 변경은 무시
      return;
    }
  }
}
```

### 현재 문제점

**1. 입력 중인 노드 보호 부족**
- `activeTextNodeId`는 다른 노드 변경만 차단
- **같은 노드에 대한 외부 변경은 차단하지 않음**
- AI가 같은 노드를 수정하면 사용자 입력이 방해받음

**2. 렌더링 타이밍 문제**
- 외부 변경 시 즉시 렌더링
- 사용자 입력 중에도 렌더링 발생
- 입력과 렌더링이 충돌

**3. 모델-DOM 불일치**
- 사용자가 입력 중: DOM은 변경됨, 모델은 아직 업데이트 안 됨
- AI가 변경: 모델은 변경됨, DOM은 아직 업데이트 안 됨
- 두 변경이 충돌

---

## 해결 방안

### 방안 1: 입력 중인 노드 보호 (Reconcile 레벨) ⭐ **추천**

**개념:**
- Reconcile 시 입력 중인 노드는 업데이트하지 않음
- sid 기반으로 입력 중인 노드 추적
- 입력 완료 후에만 업데이트

**구현:**

```typescript
class EditorViewDOM {
  // 입력 중인 노드 추적
  private editingNodes: Set<string> = new Set();
  
  // 사용자 입력 시작
  onUserInputStart(nodeId: string) {
    this.editingNodes.add(nodeId);
  }
  
  // 사용자 입력 완료
  onUserInputEnd(nodeId: string) {
    this.editingNodes.delete(nodeId);
    // 입력 완료 후 즉시 동기화
    this.syncNodeAfterEdit(nodeId);
  }
  
  // 외부 변경 시 렌더링
  onExternalChange() {
    // 입력 중인 노드는 제외하고 렌더링
    this.render({ skipNodes: this.editingNodes });
  }
}

class Reconciler {
  reconcile(container: HTMLElement, vnode: VNode, options?: {
    skipNodes?: Set<string>  // 입력 중인 노드 목록
  }) {
    // 입력 중인 노드는 reconcile 스킵
    if (options?.skipNodes?.has(vnode.sid || '')) {
      // 이전 VNode와 DOM 유지
      return;
    }
    
    // 일반 reconcile 수행
    this.reconcileInternal(container, vnode);
  }
}
```

**장점:**
- ✅ 입력 중인 노드가 완전히 보호됨
- ✅ Reconcile 레벨에서 처리 (명확한 책임 분리)
- ✅ sid 기반으로 정확한 노드 식별

**단점:**
- ⚠️ 입력 완료 후 동기화 필요
- ⚠️ 입력 중인 노드 추적 로직 필요

---

### 방안 2: 렌더링 지연 (Debouncing)

**개념:**
- 외부 변경 시 즉시 렌더링하지 않음
- 입력이 완료될 때까지 대기
- 입력 완료 후 일괄 렌더링

**구현:**

```typescript
class EditorViewDOM {
  private pendingRenders: Map<string, any> = new Map();
  private renderDebounceTimer: NodeJS.Timeout | null = null;
  
  onExternalChange(nodeId: string, newModel: any) {
    // 입력 중인 노드면 렌더링 지연
    if (this.editingNodes.has(nodeId)) {
      this.pendingRenders.set(nodeId, newModel);
      
      // 입력 완료 후 렌더링 (디바운싱)
      if (this.renderDebounceTimer) {
        clearTimeout(this.renderDebounceTimer);
      }
      
      this.renderDebounceTimer = setTimeout(() => {
        // 입력이 완료되었는지 확인
        if (!this.editingNodes.has(nodeId)) {
          this.render();
          this.pendingRenders.clear();
        }
      }, 500); // 500ms 대기
      return;
    }
    
    // 입력 중이 아니면 즉시 렌더링
    this.render();
  }
  
  onUserInputEnd(nodeId: string) {
    this.editingNodes.delete(nodeId);
    
    // pending 렌더링이 있으면 즉시 수행
    if (this.pendingRenders.has(nodeId)) {
      this.render();
      this.pendingRenders.delete(nodeId);
    }
  }
}
```

**장점:**
- ✅ 입력 중에는 렌더링 안 함
- ✅ 입력 완료 후 자동 동기화

**단점:**
- ⚠️ 외부 변경이 지연됨 (사용자 경험 저하 가능)
- ⚠️ 입력 완료 시점 판단 어려움

---

### 방안 3: 충돌 해결 (Conflict Resolution)

**개념:**
- 사용자 입력과 외부 변경이 충돌하면 해결
- 사용자 입력을 우선
- 외부 변경은 병합 또는 거부

**구현:**

```typescript
class EditorViewDOM {
  onExternalChange(nodeId: string, externalChange: any) {
    // 입력 중인 노드면 충돌 해결
    if (this.editingNodes.has(nodeId)) {
      const userInput = this.getCurrentUserInput(nodeId);
      const resolved = this.resolveConflict(userInput, externalChange);
      
      // 해결된 결과로 모델 업데이트
      this.updateModel(nodeId, resolved);
      
      // 입력 완료 후 렌더링
      this.onUserInputEnd(nodeId);
      return;
    }
    
    // 충돌 없으면 즉시 렌더링
    this.render();
  }
  
  resolveConflict(userInput: any, externalChange: any): any {
    // 사용자 입력을 우선
    // 외부 변경은 사용자 입력 이후에 적용
    return {
      ...externalChange,
      text: userInput.text,  // 사용자 입력 우선
      // 또는 병합 로직
    };
  }
}
```

**장점:**
- ✅ 사용자 입력 보호
- ✅ 외부 변경도 반영 (병합)

**단점:**
- ⚠️ 복잡한 충돌 해결 로직 필요
- ⚠️ 병합 로직이 복잡할 수 있음

---

### 방안 4: 하이브리드 접근 (Reconcile + 지연) ⭐ **최종 추천**

**개념:**
- Reconcile 레벨에서 입력 중인 노드 보호
- 외부 변경은 지연 렌더링
- 입력 완료 후 즉시 동기화

**구현:**

```typescript
class EditorViewDOM {
  // 입력 중인 노드 추적
  private editingNodes: Set<string> = new Set();
  private pendingExternalChanges: Map<string, any> = new Map();
  
  // 사용자 입력 시작
  onUserInputStart(nodeId: string) {
    this.editingNodes.add(nodeId);
  }
  
  // 사용자 입력 완료
  onUserInputEnd(nodeId: string) {
    this.editingNodes.delete(nodeId);
    
    // pending 외부 변경이 있으면 즉시 렌더링
    if (this.pendingExternalChanges.has(nodeId)) {
      const change = this.pendingExternalChanges.get(nodeId);
      this.pendingExternalChanges.delete(nodeId);
      this.render();
    }
  }
  
  // 외부 변경 (AI/동시편집)
  onExternalChange(nodeId: string, change: any) {
    // 입력 중인 노드면 pending에 저장
    if (this.editingNodes.has(nodeId)) {
      this.pendingExternalChanges.set(nodeId, change);
      return; // 렌더링 안 함
    }
    
    // 입력 중이 아니면 즉시 렌더링
    this.render();
  }
  
  render(options?: { skipNodes?: Set<string> }) {
    // Reconcile에 입력 중인 노드 전달
    this.domRenderer.render(this.container, this.vnode, {
      skipNodes: this.editingNodes  // 입력 중인 노드는 스킵
    });
  }
}

class Reconciler {
  reconcile(container: HTMLElement, vnode: VNode, options?: {
    skipNodes?: Set<string>  // 입력 중인 노드 목록 (sid 기반)
  }) {
    const sid = vnode.sid || '';
    
    // 입력 중인 노드는 reconcile 스킵
    if (options?.skipNodes?.has(sid)) {
      // ⚠️ 중요: 이 노드 자체는 reconcile하지 않음
      // - 이전 VNode와 DOM을 그대로 유지
      // - DOM 업데이트 안 함
      // - 속성/스타일/자식 모두 업데이트 안 함
      
      // 하지만 자식 노드들은 업데이트 가능
      // (입력 중인 노드만 보호, 자식은 외부 변경 반영 가능)
      this.reconcileChildrenOnly(vnode, options.skipNodes);
      return;
    }
    
    // 일반 reconcile 수행
    this.reconcileInternal(container, vnode, options);
  }
  
  /**
   * 자식 노드만 reconcile (부모는 스킵)
   * 입력 중인 노드의 자식은 업데이트 가능하도록
   */
  reconcileChildrenOnly(vnode: VNode, skipNodes: Set<string>) {
    const parentDom = vnode.meta?.domElement as HTMLElement;
    if (!parentDom) return;
    
    // 자식 노드들은 일반 reconcile
    // 단, skipNodes에 포함된 자식은 스킵
    for (const child of vnode.children || []) {
      if (typeof child === 'object' && child !== null) {
        const childVNode = child as VNode;
        const childSid = childVNode.sid || '';
        
        if (skipNodes.has(childSid)) {
          // 입력 중인 자식도 스킵
          continue;
        }
        
        // 일반 reconcile (자식은 업데이트)
        this.reconcileInternal(parentDom, childVNode, { skipNodes });
      }
    }
  }
}
```

**장점:**
- ✅ 입력 중인 노드 완전 보호 (Reconcile 레벨)
- ✅ 외부 변경도 보존 (pending에 저장)
- ✅ 입력 완료 후 자동 동기화
- ✅ 자식 노드는 업데이트 가능 (유연성)

**단점:**
- ⚠️ 입력 중인 노드 추적 로직 필요
- ⚠️ pending 변경 관리 필요

---

## 구현 체크리스트

### Phase 1: 입력 중인 노드 추적
- [ ] `editingNodes` Set 추가
- [ ] `onUserInputStart()` 메서드 추가
- [ ] `onUserInputEnd()` 메서드 추가
- [ ] 입력 이벤트에서 자동 추적

### Phase 2: Reconcile 레벨 보호
- [ ] `Reconciler.reconcile()`에 `skipNodes` 옵션 추가
- [ ] 입력 중인 노드는 reconcile 스킵
- [ ] 자식 노드는 업데이트 가능하도록 처리

### Phase 3: 외부 변경 처리
- [ ] `onExternalChange()` 메서드 추가
- [ ] 입력 중인 노드면 pending에 저장
- [ ] 입력 완료 후 자동 렌더링

### Phase 4: 동기화
- [ ] 입력 완료 후 모델-DOM 동기화
- [ ] pending 변경 적용
- [ ] Selection 복원

---

## 시나리오별 동작

### 시나리오 1: 사용자 입력 중 AI 변경

```
1. 사용자가 노드 A에서 "Hello" 입력 중
   - editingNodes.add('nodeA')
   - activeTextNodeId = 'nodeA'

2. AI가 노드 A를 "Hello AI"로 변경
   - onExternalChange('nodeA', { text: 'Hello AI' })
   - editingNodes.has('nodeA') === true
   - pendingExternalChanges.set('nodeA', change)
   - 렌더링 안 함 ✅

3. 사용자가 입력 완료
   - onUserInputEnd('nodeA')
   - editingNodes.delete('nodeA')
   - pendingExternalChanges.has('nodeA') === true
   - 즉시 렌더링하여 AI 변경 반영 ✅
```

### 시나리오 2: 사용자 입력 중 다른 노드 변경

```
1. 사용자가 노드 A에서 입력 중
   - editingNodes.add('nodeA')

2. AI가 노드 B를 변경
   - onExternalChange('nodeB', change)
   - editingNodes.has('nodeB') === false
   - 즉시 렌더링 ✅
   - 노드 A는 reconcile에서 스킵되어 보호됨 ✅
```

### 시나리오 3: 사용자 입력 완료 후 외부 변경

```
1. 사용자가 노드 A 입력 완료
   - editingNodes.delete('nodeA')

2. AI가 노드 A를 변경
   - onExternalChange('nodeA', change)
   - editingNodes.has('nodeA') === false
   - 즉시 렌더링 ✅
```

---

## 주의사항

### 1. 입력 완료 시점 판단

**문제:**
- 언제 입력이 완료되었는지 판단하기 어려움
- IME 조합 완료, 타이핑 일시정지 등

**해결:**
```typescript
class EditorViewDOM {
  private inputIdleTimer: Map<string, NodeJS.Timeout> = new Map();
  private readonly INPUT_IDLE_MS = 300; // 300ms 입력 없으면 완료로 간주
  
  onUserInput(nodeId: string) {
    // 이전 타이머 취소
    const timer = this.inputIdleTimer.get(nodeId);
    if (timer) clearTimeout(timer);
    
    // 입력 시작
    this.editingNodes.add(nodeId);
    
    // 300ms 입력 없으면 완료로 간주
    const newTimer = setTimeout(() => {
      this.onUserInputEnd(nodeId);
      this.inputIdleTimer.delete(nodeId);
    }, this.INPUT_IDLE_MS);
    
    this.inputIdleTimer.set(nodeId, newTimer);
  }
}
```

### 2. 자식 노드 업데이트

**문제:**
- 입력 중인 노드는 보호하되, 자식 노드는 업데이트해야 함
- 예: 입력 중인 노드의 자식 decorator는 업데이트 가능

**해결:**
- Reconcile에서 입력 중인 노드만 스킵
- 자식 노드는 일반 reconcile 수행

### 3. Selection 보존

**문제:**
- 입력 중인 노드가 보호되면 Selection도 보존되어야 함

**해결:**
- TextNode 재사용 (TextNodePool)
- Selection 복원 로직

---

## skipNodes의 정확한 동작

### 핵심 질문: skipNodes에 있는 노드는 reconcile을 스킵하는가?

**답: 네, 맞습니다!**

### skipNodes의 동작 방식

**1. skipNodes에 포함된 노드:**
```typescript
if (skipNodes.has(sid)) {
  // ✅ 이 노드 자체는 reconcile 스킵
  // - 이전 VNode와 DOM을 그대로 유지
  // - DOM 업데이트 안 함
  // - 속성/스타일/텍스트 모두 업데이트 안 함
  // - effectTag 설정 안 함
  return; // reconcile 스킵
}
```

**2. 자식 노드 처리:**
```typescript
// 부모가 skipNodes에 있으면
if (skipNodes.has(parentSid)) {
  // 부모는 스킵하지만
  // 자식 노드들은 reconcile 가능
  // (입력 중인 노드만 보호, 자식은 외부 변경 반영)
  for (const child of vnode.children) {
    if (!skipNodes.has(childSid)) {
      // 자식은 일반 reconcile
      this.reconcile(child);
    }
  }
}
```

### 구체적인 예시

**시나리오:**
```
노드 A (입력 중)
├─ 자식 B (decorator)
└─ 자식 C (일반)

AI가 노드 A를 변경:
- 노드 A: skipNodes에 포함 → reconcile 스킵 ✅
- 자식 B: skipNodes에 없음 → reconcile 수행 ✅
- 자식 C: skipNodes에 없음 → reconcile 수행 ✅
```

**결과:**
- ✅ 노드 A는 그대로 유지 (사용자 입력 보호)
- ✅ 자식 B, C는 업데이트 (외부 변경 반영)

---

## 결론

### Reconcile로 할 수 있는가?

**답: 네, 가능합니다!**

**핵심:**
1. ✅ **sid 기반으로 입력 중인 노드 추적**
2. ✅ **Reconcile 레벨에서 입력 중인 노드 스킵**
3. ✅ **외부 변경은 pending에 저장 후 입력 완료 시 적용**

**skipNodes의 정확한 동작:**
- ✅ **skipNodes에 있는 노드 = reconcile 스킵**
- ✅ **이전 VNode와 DOM을 그대로 유지**
- ✅ **DOM 업데이트 안 함 (속성/스타일/텍스트 모두)**
- ✅ **자식 노드는 업데이트 가능** (입력 중인 노드만 보호)

**구현 방법:**
- 방안 4 (하이브리드 접근) 추천
- Reconcile에 `skipNodes` 옵션 추가
- 입력 중인 노드는 reconcile 스킵
- 자식 노드는 업데이트 가능

**장점:**
- ✅ 입력 중인 노드 완전 보호
- ✅ 외부 변경도 보존 (나중에 적용)
- ✅ Reconcile 레벨에서 처리 (명확한 책임 분리)
- ✅ sid 기반으로 정확한 노드 식별

**주의사항:**
- ⚠️ 입력 완료 시점 판단 필요
- ⚠️ 자식 노드 업데이트 처리
- ⚠️ Selection 보존

