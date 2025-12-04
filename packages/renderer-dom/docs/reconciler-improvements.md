# Reconciler 개선 가능한 부분

## 개요

현재 Reconciler 구현을 분석하여 성능, 메모리, 코드 품질 측면에서 개선할 수 있는 부분들을 정리합니다.

---

## 1. 성능 최적화

### 1.1 DOM 쿼리 최적화

**현재 문제**:
```typescript
// host-finding.ts: 여러 번 querySelector 호출
const global = parent.ownerDocument?.querySelector(`[data-bc-sid="${childVNode.sid}"]`);
const globalDeco = parent.ownerDocument?.querySelector(`[data-decorator-sid="${childVNode.decoratorSid}"]`);

// dom-utils.ts: Array.from으로 children을 매번 가져옴
const bySid = Array.from(parent.children).find((el: Element) => 
  el.getAttribute('data-bc-sid') === sid
);
```

**개선 방안**:
- **SID 기반 인덱스 맵 구축**: reconcile 시작 시 `sid → element` 맵을 한 번만 구축
- **캐싱**: 자주 사용되는 DOM 쿼리 결과를 캐시
- **querySelector 대신 직접 순회**: 작은 children 배열에서는 직접 순회가 더 빠름

**예상 성능 향상**: 10-20% (큰 트리에서)

---

### 1.2 prevChildToElement 맵 구축 최적화

**현재 문제**:
```typescript
// reconciler.ts: 매번 Array.from으로 childNodes 가져옴
const parentChildren = Array.from(parent.childNodes);
for (let i = 0; i < prevChildVNodes.length && i < parentChildren.length; i++) {
  prevChildToElement.set(prevChildVNodes[i], parentChildren[i]);
}
```

**개선 방안**:
- **Lazy evaluation**: 필요한 경우에만 맵 구축
- **인덱스 기반 직접 접근**: `parent.childNodes[i]` 직접 사용 (Array.from 제거)

**예상 성능 향상**: 5-10% (많은 children이 있을 때)

---

### 1.3 reorder 함수 최적화

**현재 문제**:
```typescript
// dom-utils.ts: 매번 Array.from으로 childNodes를 다시 가져옴
for (let i = 0; i < ordered.length; i++) {
  const currentNow = Array.from(parent.childNodes); // 매번 새로 가져옴
  if (currentNow[i] !== want) {
    parent.insertBefore(want, referenceNode);
  }
}
```

**개선 방안**:
- **변경 추적**: 실제로 이동이 필요한 요소만 이동
- **배치 이동**: 여러 요소를 한 번에 이동
- **현재 위치 캐싱**: 이동 전에 현재 위치를 한 번만 계산

**예상 성능 향상**: 15-25% (순서 변경이 많을 때)

---

### 1.4 console.log 제거 또는 조건부 실행

**현재 문제**:
```typescript
// reconciler.ts: 프로덕션에서도 항상 실행
console.log('[Reconciler] reconcileVNodeChildren: START', {...});
console.log('[Reconciler] reconcileVNodeChildren: processing child', {...});
```

**개선 방안**:
- **개발 모드에서만 실행**: `if (__DEV__)` 조건 추가
- **로깅 레벨**: 로깅 레벨에 따라 선택적 실행
- **성능 측정**: 성능 측정용 로그는 별도로 분리

**예상 성능 향상**: 5-15% (많은 로그가 있을 때)

---

### 1.5 중복 계산 제거

**현재 문제**:
```typescript
// child-processing.ts: prevChildVNode를 여러 번 찾음
const prevChildVNode = findPrevChildVNode(...); // 한 번 찾음
updateHostElement(..., prevChildVNode, ...);
// 하지만 updateHostElement 내부에서도 다시 찾을 수 있음
```

**개선 방안**:
- **이미 최적화됨**: `prevChildVNode`를 한 번만 찾아서 재사용 ✅
- **추가 최적화**: 자주 사용되는 값들을 변수에 저장

---

## 2. 메모리 최적화

### 2.1 prevVNodeTree 메모리 누수 방지

**현재 문제**:
```typescript
// reconciler.ts: prevVNodeTree가 계속 커질 수 있음
private prevVNodeTree: Map<string, VNode> = new Map();
// 언마운트된 컴포넌트의 prevVNode가 계속 남아있을 수 있음
```

**개선 방안**:
- **WeakMap 사용**: DOM 요소가 제거되면 자동으로 가비지 컬렉션
- **정기적 클린업**: 사용하지 않는 prevVNode 정기적으로 제거
- **언마운트 시 정리**: unmountRoot에서 prevVNodeTree 정리

**예상 메모리 절약**: 20-30% (장시간 실행 시)

---

### 2.2 prevChildToElement 맵 크기 제한

**현재 문제**:
```typescript
// reconciler.ts: 모든 prevChildVNode에 대해 맵 구축
const prevChildToElement = new Map();
for (let i = 0; i < prevChildVNodes.length && i < parentChildren.length; i++) {
  prevChildToElement.set(prevChildVNodes[i], parentChildren[i]);
}
// 큰 트리에서는 맵이 매우 커질 수 있음
```

**개선 방안**:
- **Lazy 맵 구축**: 필요한 경우에만 맵 구축
- **WeakMap 사용**: 가능한 경우 WeakMap 사용
- **맵 크기 제한**: 일정 크기 이상이면 맵을 정리

---

## 3. 코드 품질 개선

### 3.1 타입 안정성 향상

**현재 문제**:
```typescript
// 여러 곳에서 any 사용
const childVNode = child as VNode;
const prevChildVNode = prevChild as VNode;
```

**개선 방안**:
- **타입 가드 함수**: `isVNode`, `isStringOrNumber` 등 사용
- **타입 단언 최소화**: 가능한 한 타입 추론 활용
- **strict 모드**: TypeScript strict 모드 활성화

---

### 3.2 에러 처리 개선

**현재 문제**:
```typescript
// 여러 곳에서 try-catch로 에러를 무시
try { parent.removeChild(ch); } catch {}
```

**개선 방안**:
- **에러 로깅**: 최소한 에러를 로그로 기록
- **에러 타입별 처리**: 예상 가능한 에러와 예상 불가능한 에러 구분
- **에러 복구**: 가능한 경우 에러 복구 로직 추가

---

### 3.3 함수 분리 및 재사용성

**현재 상태**:
- 이미 많은 함수가 분리되어 있음 ✅
- 하지만 일부 함수가 여전히 길고 복잡함

**개선 방안**:
- **더 작은 함수로 분리**: 50줄 이상인 함수는 분리 고려
- **공통 로직 추출**: 중복되는 로직을 함수로 추출
- **유틸리티 함수 추가**: 자주 사용되는 패턴을 유틸리티로

---

## 4. React 스타일 개선

### 4.1 Fiber Architecture 도입 (선택적)

**현재**: 동기적으로 모든 작업 처리

**개선 방안**:
- **작업 분할**: 큰 트리를 작은 단위로 분할
- **우선순위 조정**: 중요한 업데이트를 먼저 처리
- **중단 가능**: 긴 작업을 중단하고 다른 작업 처리 가능

**장점**:
- 큰 트리에서도 반응성 유지
- 우선순위 기반 렌더링

**단점**:
- 복잡도 증가
- 오버헤드 발생 가능

**권장**: 현재는 필요 없지만, 나중에 큰 트리를 다룰 때 고려

---

### 4.2 Batching 도입 (선택적)

**현재**: 각 업데이트를 즉시 처리

**개선 방안**:
- **업데이트 큐**: 여러 업데이트를 큐에 모음
- **배치 처리**: 한 번에 여러 업데이트 처리
- **디바운싱**: 짧은 시간 내 여러 업데이트를 하나로 합침

**장점**:
- 불필요한 렌더링 감소
- 성능 향상

**단점**:
- 지연 시간 증가
- 복잡도 증가

**권장**: 현재는 필요 없지만, 나중에 많은 업데이트가 있을 때 고려

---

### 4.3 Suspense 지원 (선택적)

**현재**: 비동기 컴포넌트 지원 없음

**개선 방안**:
- **비동기 컴포넌트**: Promise를 반환하는 컴포넌트 지원
- **로딩 상태**: 로딩 중일 때 fallback UI 표시
- **에러 바운더리**: 에러 발생 시 에러 UI 표시

**권장**: 필요할 때만 도입

---

## 5. 구체적인 개선 제안

### 우선순위 높음 (즉시 개선 가능)

1. **console.log 조건부 실행**
   - 개발 모드에서만 실행
   - 즉시 적용 가능
   - 성능 향상: 5-15%

2. **DOM 쿼리 최적화**
   - SID 기반 인덱스 맵 구축
   - querySelector 대신 직접 순회
   - 성능 향상: 10-20%

3. **prevVNodeTree 메모리 관리**
   - 언마운트 시 정리
   - 정기적 클린업
   - 메모리 절약: 20-30%

### 우선순위 중간 (점진적 개선)

4. **reorder 함수 최적화**
   - 변경 추적
   - 배치 이동
   - 성능 향상: 15-25%

5. **타입 안정성 향상**
   - 타입 가드 함수 사용
   - any 제거
   - 코드 품질 향상

6. **에러 처리 개선**
   - 에러 로깅
   - 에러 타입별 처리
   - 안정성 향상

### 우선순위 낮음 (나중에 고려)

7. **Fiber Architecture**
   - 복잡도 증가
   - 현재는 필요 없음

8. **Batching**
   - 복잡도 증가
   - 현재는 필요 없음

9. **Suspense**
   - 필요할 때만 도입

---

## 6. 성능 측정

### 현재 성능 (예상)

- **시간 복잡도**: O(n) (n = VNode 수)
- **공간 복잡도**: O(n) (prevVNodeTree, 맵 등)
- **실제 성능**: 중간 크기 트리 (100-1000 노드)에서 10-50ms

### 개선 후 예상 성능

- **시간 복잡도**: O(n) (동일)
- **공간 복잡도**: O(n) (동일, 하지만 메모리 사용량 감소)
- **실제 성능**: 20-40% 향상 예상

---

## 7. 구현 계획

### Phase 1: 즉시 개선 (1-2일)
1. console.log 조건부 실행
2. DOM 쿼리 최적화 (SID 맵 구축)
3. prevVNodeTree 메모리 관리

### Phase 2: 점진적 개선 (1주)
4. reorder 함수 최적화
5. 타입 안정성 향상
6. 에러 처리 개선

### Phase 3: 장기 개선 (필요 시)
7. Fiber Architecture
8. Batching
9. Suspense

---

## 8. 참고 자료

- [React Performance Optimization](https://react.dev/learn/render-and-commit)
- [DOM Performance Best Practices](https://developer.mozilla.org/en-US/docs/Web/API/Document_Object_Model/Performance)
- [Memory Management in JavaScript](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Memory_Management)

