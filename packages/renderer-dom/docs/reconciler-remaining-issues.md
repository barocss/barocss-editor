# Reconciler 남은 문제 정리

## 현재 상태

### 완료된 수정
1. ✅ VNode 빌더: `data('text')` 처리 시 collapse 방지
2. ✅ Reconciler: text-only VNode를 text node로 직접 처리

### 남은 문제

## 문제 1: Mark VNode의 children에 있는 text VNode 처리

### 증상
- Mark VNode의 children에 있는 text-only VNode가 DOM에 렌더링되지 않음
- 예: `<strong class="mark-bold">Bold</strong>`가 `<strong class="mark-bold"></strong>`가 됨

### 원인 분석
1. **VNode 구조** (정상):
   ```typescript
   {
     tag: 'strong',
     attrs: { className: 'mark-bold' },
     children: [
       {
         text: 'Bold',  // text-only VNode
         children: []
       }
     ]
   }
   ```

2. **재귀 호출 문제**:
   - `reconcileVNodeChildren`에서 mark VNode를 처리할 때 재귀 호출 `this.reconcileVNodeChildren(host, prevChildVNode, childVNode, context)` 실행
   - 재귀 호출 내에서 text-only VNode를 체크하는 로직이 있지만, 기존 text node를 찾는 로직이 복잡해서 제대로 작동하지 않음

3. **기존 text node 찾기 로직의 문제**:
   - 현재 로직은 `childIndex`를 기준으로 이전까지의 text-only VNode 개수를 세어서 text node 인덱스를 계산
   - 하지만 재귀 호출에서는 `childIndex`가 0부터 시작하므로, 같은 로직을 사용할 수 없음

### 해결 방안
- 재귀 호출에서도 text-only VNode를 처리할 수 있도록 로직 개선
- 기존 text node를 찾는 로직을 단순화하거나, 재귀 호출 시에는 항상 새로 생성하도록 수정

## 문제 2: Decorator VNode의 text content 중복

### 증상
- Decorator VNode의 text content가 중복됨
- 예: "CHIPCHIP"이 나옴 (예상: "CHIP")

### 원인 분석
1. **Decorator VNode 구조**:
   ```typescript
   {
     tag: 'span',
     attrs: { className: 'chip' },
     children: [
       {
         text: 'CHIP',  // text-only VNode
         children: []
       }
     ]
   }
   ```

2. **중복 처리 원인**:
   - Decorator VNode의 children에 있는 text-only VNode가 중복 처리되고 있음
   - 재귀 호출에서 text-only VNode를 처리할 때, 기존 text node를 찾지 못해서 새로 생성하고, 동시에 다른 로직에서도 text node를 추가하는 것으로 보임

3. **가능한 원인**:
   - `reconcileVNodeChildren`에서 text-only VNode를 처리한 후 `nextDomChildren`에 추가
   - 재귀 호출에서도 같은 text-only VNode를 처리하여 중복 추가
   - 또는 decorator VNode의 children을 처리할 때 text node가 중복 생성됨

### 해결 방안
- Decorator VNode의 children을 처리할 때 text-only VNode 중복 처리 방지
- 재귀 호출에서 text-only VNode를 처리할 때, 이미 처리된 text node인지 확인하는 로직 추가

## 테스트 결과

### 통과한 테스트
- ✅ `test/core/vnode-data-text-concept.test.ts` - 통과
- ✅ `test/core/dom-renderer-multiple-render.test.ts` - 5/6 통과

### 실패한 테스트
- ❌ `test/core/dom-renderer-multiple-render.test.ts` - 1개 실패 (decorator 중복)
- ❌ `test/core/mark-decorator-complex.test.ts` - 16개 실패 (mark VNode children 처리)

## 다음 단계

1. **Mark VNode children 처리 개선**:
   - 재귀 호출에서 text-only VNode를 처리할 때 기존 text node를 찾는 로직 개선
   - 또는 재귀 호출 시에는 항상 새로 생성하도록 수정

2. **Decorator 중복 문제 해결**:
   - Decorator VNode의 children을 처리할 때 text-only VNode 중복 처리 방지
   - 재귀 호출에서 이미 처리된 text node인지 확인하는 로직 추가

