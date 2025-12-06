# Proxy 기반 Lazy Evaluation 성능 분석

## 현재 상황

### Proxy 동작 방식

```typescript
// DataStoreExporter.toProxy()가 반환하는 Proxy
const proxy = editor.getDocumentProxy();

// content 접근 시에만 실제 노드로 변환
proxy.content[0]  // ← 이 시점에 ID → INode 변환 발생
```

### VNodeBuilder의 동작

```typescript
// slot('content') 처리
slot('content') → data.content 배열 순회
  → 각 아이템에 대해 재귀적으로 build() 호출
  → 결국 전체 트리 순회
```

## 성능 영향 분석

### ✅ 이점이 있는 경우

1. **메모리 효율성**
   - `exportToTree()`는 전체 트리를 한 번에 변환하여 메모리에 저장
   - Proxy는 접근 시에만 변환하므로 변환된 객체를 캐싱하지 않음
   - **메모리 사용량 감소**

2. **초기 로딩 시간**
   - `exportToTree()`는 전체 트리를 즉시 변환 (O(n) 시간)
   - Proxy는 접근 시에만 변환하므로 초기 로딩이 빠름
   - **초기 로딩 시간 단축**

3. **부분 업데이트**
   - 특정 노드만 업데이트할 때 불필요한 변환을 피할 수 있음
   - 예: 뷰포트 밖의 노드는 변환하지 않음
   - **부분 렌더링 시 이점**

### ⚠️ 제한적인 경우

1. **전체 트리 순회**
   - `VNodeBuilder`가 `slot('content')`를 통해 전체 트리를 순회
   - 결국 모든 노드에 접근하게 되므로 모든 노드가 변환됨
   - **전체 렌더링 시 변환 부하는 동일**

2. **재변환 오버헤드**
   - Proxy는 매번 접근 시 변환을 수행
   - 같은 노드를 여러 번 접근하면 재변환 발생
   - **캐싱이 없어 재변환 오버헤드 가능**

## 실제 성능 비교

### 시나리오 1: 전체 문서 렌더링

```typescript
// exportToTree() 방식
const tree = editor.exportDocument();  // 전체 변환 (O(n))
renderer.render(tree);                 // 렌더링 (O(n))
// 총 시간: O(n) 변환 + O(n) 렌더링

// getDocumentProxy() 방식
const proxy = editor.getDocumentProxy(); // Proxy 생성 (O(1))
renderer.render(proxy);                  // 렌더링 중 변환 (O(n))
// 총 시간: O(1) Proxy 생성 + O(n) 변환+렌더링
```

**결론**: 전체 렌더링 시 변환 부하는 비슷하지만, **초기 로딩 시간은 Proxy가 더 빠름**

### 시나리오 2: 부분 업데이트

```typescript
// exportToTree() 방식
const tree = editor.exportDocument();  // 전체 변환 (O(n))
// 특정 노드만 업데이트해도 전체 트리 변환 필요

// getDocumentProxy() 방식
const proxy = editor.getDocumentProxy(); // Proxy 생성 (O(1))
// 특정 노드만 접근하면 해당 노드만 변환 (O(1))
```

**결론**: 부분 업데이트 시 Proxy가 **명확한 이점**

### 시나리오 3: 대용량 문서

```typescript
// 10,000개 노드 문서

// exportToTree() 방식
// - 메모리: 10,000개 노드 객체 모두 메모리에 저장
// - 초기 로딩: 10,000개 노드 변환 필요

// getDocumentProxy() 방식
// - 메모리: Proxy만 저장, 실제 노드는 접근 시에만 생성
// - 초기 로딩: Proxy 생성만 (거의 즉시)
```

**결론**: 대용량 문서에서 Proxy가 **메모리 효율성과 초기 로딩 시간에서 이점**

## 최종 결론

### 변환 부하 감소?

**부분적으로 맞습니다:**

1. ✅ **초기 로딩 시간**: 크게 감소 (Proxy 생성만)
2. ✅ **메모리 사용량**: 감소 (변환된 객체 캐싱 없음)
3. ⚠️ **전체 렌더링 시 변환 부하**: 비슷함 (전체 트리 순회)
4. ✅ **부분 업데이트 시 변환 부하**: 크게 감소

### 권장사항

- **전체 문서 렌더링**: Proxy 사용 권장 (초기 로딩 시간 단축)
- **부분 업데이트**: Proxy 사용 권장 (불필요한 변환 방지)
- **대용량 문서**: Proxy 사용 강력 권장 (메모리 효율성)

### 주의사항

- Proxy는 매번 접근 시 변환하므로, 같은 노드를 여러 번 접근하면 재변환 발생
- 캐싱이 없어 재변환 오버헤드가 있을 수 있음
- 하지만 일반적으로 렌더링은 한 번만 수행되므로 문제 없음

## 실제 측정 필요

이론적 분석이므로, 실제 성능 측정을 통해 검증하는 것이 좋습니다:

```typescript
// 성능 측정 예시
console.time('exportToTree');
const tree = editor.exportDocument();
console.timeEnd('exportToTree');

console.time('getDocumentProxy');
const proxy = editor.getDocumentProxy();
console.timeEnd('getDocumentProxy');

console.time('render with tree');
renderer.render(tree);
console.timeEnd('render with tree');

console.time('render with proxy');
renderer.render(proxy);
console.timeEnd('render with proxy');
```

