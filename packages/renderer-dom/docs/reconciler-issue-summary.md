# Reconciler Text VNode 처리 이슈 정리

## 문제 확인

### 1. VNode Builder 확인 (✅ 정상)
- VNode builder는 올바른 VNode 구조를 생성함
- 테스트: `vnode-builder-mark-check.test.ts` 통과
- Mark VNode 구조:
  ```json
  {
    "tag": "strong",
    "attrs": { "className": "mark-bold" },
    "children": [
      {
        "text": "Bold",
        "children": []
      }
    ]
  }
  ```

### 2. Reconciler 문제 (❌ 문제 발생)
- VNode 구조는 올바르지만, DOM 렌더링 시 문제 발생
- 증상:
  - Mark VNode의 children에 있는 text VNode가 DOM에 렌더링되지 않음
  - 예: `<strong class="mark-bold">Bold</strong>` → `<strong class="mark-bold"></strong>`
  - Decorator VNode의 text content가 중복됨

## 현재 테스트 상황

### 통과한 테스트
- ✅ `vnode-data-text-concept.test.ts` - VNode 구조 확인
- ✅ `dom-renderer-multiple-render.test.ts` - 5/6 통과

### 실패한 테스트
- ❌ `dom-renderer-multiple-render.test.ts` - 1개 실패 (decorator 중복)
- ❌ `mark-decorator-complex.test.ts` - 16개 실패 (mark VNode children 처리)

## 문제 분석

### 문제 1: Mark VNode의 children에 있는 text VNode 처리

**VNode 구조 (정상)**:
```typescript
{
  tag: 'strong',
  children: [
    {
      text: 'Bold',  // text-only VNode
      children: []
    }
  ]
}
```

**예상 DOM**:
```html
<strong class="mark-bold">Bold</strong>
```

**실제 DOM**:
```html
<strong class="mark-bold"></strong>
```

**원인**:
- `reconcileVNodeChildren`에서 재귀 호출 시 text-only VNode를 처리하는 로직이 제대로 작동하지 않음
- 재귀 호출에서 `parent.childNodes`와 `childVNodes`의 순서가 일치하지 않을 수 있음

### 문제 2: Decorator VNode의 text content 중복

**증상**:
- "CHIPCHIP" (예상: "CHIP")

**원인**:
- Decorator VNode의 children에 있는 text VNode가 중복 처리됨

## 해결 방안

### 1. Reconciler만 테스트하는 것이 맞는가?
- ✅ VNode builder는 이미 올바른 구조를 생성하는 것을 확인
- ✅ Reconciler만 테스트하면 됨
- 하지만 현재 테스트는 전체 렌더링 플로우를 테스트하고 있음

### 2. 테스트 개선 방안
- Reconciler만 테스트하는 단위 테스트 작성
- VNode 구조를 직접 생성하고 reconciler에 전달
- DOM 결과만 확인

### 3. 해결 방안
- 재귀 호출에서 text-only VNode를 처리할 때 순서 문제 해결
- `parent.childNodes`와 `childVNodes`의 순서를 정확히 매칭
- 또는 text-only VNode를 처리할 때 더 단순한 로직 사용

## 테스트 결과

### Reconciler 단위 테스트 (`reconciler-text-vnode.test.ts`)

**통과한 테스트**:
- ✅ 단일 text VNode inside mark VNode
- ✅ 단일 text VNode inside decorator VNode

**실패한 테스트**:
- ❌ 여러 text VNode inside mark VNode - 두 번째 text VNode가 렌더링되지 않음
- ❌ 중첩 구조에서 text VNode - 두 번째 text VNode가 렌더링되지 않음

### 문제 명확화

**핵심 문제**: 여러 text VNode가 있을 때 두 번째 이후의 text VNode가 렌더링되지 않음

**원인 추정**:
- `reconcileVNodeChildren`에서 text-only VNode를 처리할 때, `nextDomChildren`에 추가는 하지만
- `reorder`와 `removeStale`에서 제대로 처리되지 않을 수 있음
- 또는 text VNode를 찾는 로직이 첫 번째만 찾고 있을 수 있음

## 다음 단계

1. ✅ Reconciler만 테스트하는 단위 테스트 작성 완료
2. 여러 text VNode 처리 로직 수정
3. `reorder`와 `removeStale`에서 text VNode 처리 확인

