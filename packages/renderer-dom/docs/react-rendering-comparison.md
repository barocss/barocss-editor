# React vs 우리 시스템: 렌더링 동작 비교

## React의 렌더링 동작

### 핵심 원칙

**React는 변경된 컴포넌트부터 하위로만 렌더링합니다.**

```
App (Root)
├─ Header
├─ Content
│  ├─ Sidebar
│  └─ Main
│     └─ Counter (setState 호출)
│        └─ Button
└─ Footer
```

**Counter 컴포넌트에서 `setState` 호출 시:**
- ✅ **Counter와 그 하위만 렌더링**: Counter → Button
- ❌ **상위 컴포넌트는 렌더링 안 됨**: App, Header, Content, Sidebar, Main, Footer는 렌더링 안 됨

### React의 렌더링 범위

1. **상태 변경이 발생한 컴포넌트**
2. **그 컴포넌트의 모든 하위 컴포넌트**

**예외:**
- `React.memo`로 감싼 컴포넌트는 props가 변경되지 않으면 스킵
- `useMemo`, `useCallback`으로 최적화된 부분은 재계산 안 됨

### React의 렌더링 프로세스

```
1. setState 호출
   ↓
2. 해당 컴포넌트부터 하위로 Virtual DOM 재생성
   - Counter 컴포넌트 함수 재실행
   - Counter의 자식 컴포넌트들도 재실행
   ↓
3. 이전 Virtual DOM과 비교 (diffing)
   ↓
4. 변경된 부분만 실제 DOM 업데이트
```

**중요**: React도 Virtual DOM은 재생성하지만, **변경된 컴포넌트부터 하위만** 재생성합니다.

---

## 우리 시스템의 렌더링 동작

### 핵심 원칙

**우리는 항상 root부터 전체 VNode 트리를 빌드합니다.**

```
App (Root)
├─ Header
├─ Content
│  ├─ Sidebar
│  └─ Main
│     └─ Counter (setState 호출)
│        └─ Button
└─ Footer
```

**Counter 컴포넌트에서 `setState` 호출 시:**
- ✅ **전체 VNode 트리 재빌드**: App → Header → Content → Sidebar → Main → Counter → Button → Footer
- ✅ **Fiber reconciler로 실제 DOM은 변경된 부분만 업데이트**

### 우리 시스템의 렌더링 프로세스

```
1. setState 호출
   ↓
2. changeState 이벤트 발생
   ↓
3. DOMRenderer.render() 호출
   ↓
4. VNodeBuilder.build() - root부터 전체 VNode 트리 재생성
   - 모든 컴포넌트 템플릿 함수 재실행
   - ComponentManager에서 기존 state 참조
   ↓
5. Fiber reconciler로 이전 VNode와 비교
   ↓
6. 변경된 부분만 실제 DOM 업데이트
```

**중요**: 우리는 VNode 빌드는 전체를 하지만, **Fiber reconciler가 실제 DOM 업데이트는 효율적으로 처리**합니다.

---

## 비교 분석

### 렌더링 범위

| 항목 | React | 우리 시스템 |
|------|-------|------------|
| **Virtual DOM/VNode 빌드** | 변경된 컴포넌트부터 하위만 | Root부터 전체 |
| **실제 DOM 업데이트** | 변경된 부분만 | 변경된 부분만 (Fiber reconciler) |
| **컴포넌트 함수 실행** | 변경된 컴포넌트부터 하위만 | 전체 컴포넌트 |

### 성능 특성

**React:**
- ✅ Virtual DOM 빌드 비용: O(k) (k = 변경된 컴포넌트 수)
- ✅ DOM 업데이트 비용: O(m) (m = 변경된 노드 수)
- ⚠️ React.memo 등 최적화 필요 (선택적)

**우리 시스템:**
- ⚠️ VNode 빌드 비용: O(n) (n = 전체 컴포넌트 수)
- ✅ DOM 업데이트 비용: O(m) (m = 변경된 노드 수, Fiber reconciler)
- ✅ 일관성 보장 (항상 전체 빌드)

### 장단점 비교

**React 방식 (부분 렌더링):**

**장점:**
- ✅ 빌드 비용이 적음 (변경된 부분만)
- ✅ 큰 앱에서 성능 우수

**단점:**
- ⚠️ 최적화 필요 (React.memo 등)
- ⚠️ 복잡한 상태 관리 시 버그 가능성
- ⚠️ Context 변경 시 많은 컴포넌트 렌더링

**우리 방식 (전체 빌드):**

**장점:**
- ✅ 일관성 보장 (항상 전체 모델 반영)
- ✅ 최적화 불필요 (항상 정확)
- ✅ 단순한 구조

**단점:**
- ⚠️ 빌드 비용이 큼 (전체 컴포넌트)
- ⚠️ 큰 앱에서 성능 이슈 가능

---

## 실제 성능 비교

### 시나리오: 1000개 컴포넌트, 1개만 변경

**React:**
```
Virtual DOM 빌드: 1개 컴포넌트 + 하위 (평균 10개) = 11개
DOM 업데이트: 1개 노드
총 비용: O(11) + O(1) = O(12)
```

**우리 시스템:**
```
VNode 빌드: 1000개 컴포넌트 = 1000개
DOM 업데이트: 1개 노드 (Fiber reconciler)
총 비용: O(1000) + O(1) = O(1001)
```

**하지만:**
- VNode 빌드는 JavaScript 함수 실행 (빠름)
- DOM 업데이트는 실제 브라우저 작업 (느림)
- **실제 사용자 체감 성능은 DOM 업데이트가 더 중요**

### 실제 측정 필요

**가설:**
- VNode 빌드: 1ms (1000개 컴포넌트)
- DOM 업데이트: 10ms (1개 노드)
- **총 시간: 11ms (사용자 체감: 거의 동일)**

**결론**: 실제 프로파일링으로 확인 필요

---

## 왜 우리는 전체 빌드를 하는가?

### 1. 일관성 보장

**문제 시나리오 (부분 렌더링):**
```
1. Counter 컴포넌트에서 setState({ count: 1 })
2. Counter만 재렌더링
3. 하지만 부모 모델이 변경되었는데 Counter는 모르는 상태
4. 상태 불일치 발생 가능
```

**우리 방식:**
```
1. Counter 컴포넌트에서 setState({ count: 1 })
2. 전체 재빌드 (부모 모델도 함께 반영)
3. 항상 일관된 상태 보장
```

### 2. data('text'), slot('content') 의존성

**문제:**
- `data('text')`, `slot('content')`는 부모 모델에 의존
- 부분 렌더링 시 부모 모델 변경을 놓칠 수 있음

**해결:**
- 전체 빌드로 항상 최신 모델 반영

### 3. 단순성

**React:**
- React.memo, useMemo, useCallback 등 최적화 필요
- 복잡한 의존성 관리

**우리:**
- 최적화 불필요
- 항상 정확한 결과

---

## 결론

### React의 렌더링 동작

**정확한 답변:**
- ❌ **아니요, React는 전체를 다 돌지 않습니다**
- ✅ **변경된 컴포넌트부터 하위만 렌더링합니다**
- ✅ **하지만 상위가 렌더링되면 하위도 모두 렌더링됩니다**

### 우리 시스템과의 차이

| 항목 | React | 우리 |
|------|-------|------|
| **렌더링 범위** | 변경된 컴포넌트부터 하위만 | Root부터 전체 |
| **빌드 비용** | 낮음 (부분) | 높음 (전체) |
| **DOM 업데이트** | 효율적 (diffing) | 효율적 (Fiber reconciler) |
| **일관성** | 최적화 필요 | 항상 보장 |
| **복잡성** | 높음 (최적화 필요) | 낮음 (단순) |

### 권장 사항

**현재 구조 유지:**
- ✅ 일관성 보장
- ✅ 단순한 구조
- ✅ Fiber reconciler로 DOM 업데이트는 효율적

**성능 문제 발생 시:**
- 프로파일링으로 실제 병목 확인
- 필요하면 타겟팅 최적화 적용

