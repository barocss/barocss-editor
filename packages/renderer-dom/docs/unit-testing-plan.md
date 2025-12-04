# 개별 함수 단위 테스트 계획

## 현재 문제

Text node의 순서가 잘못되어 `<span>ted texthted This</span>`로 합쳐지고 순서가 뒤바뀌는 문제가 있습니다.

## 테스트 가능한 단위

### 1. `renderFiberNode`
- **역할**: Render Phase에서 변경사항 계산만 수행
- **입력**: FiberNode, deps, context
- **출력**: effectTag 설정, fiber.domElement 설정 (기존 요소만)
- **테스트 케이스**:
  - effectTag가 올바르게 설정되는지 (PLACEMENT/UPDATE/DELETION)
  - 기존 DOM 요소를 올바르게 찾는지
  - Portal 처리가 올바르게 되는지

### 2. `commitFiberNode`
- **역할**: Commit Phase에서 DOM 조작 수행
- **입력**: FiberNode, deps, context
- **출력**: DOM 요소 생성/삽입/업데이트
- **테스트 케이스**:
  - Text node가 올바른 위치에 삽입되는지
  - Host element가 올바른 위치에 삽입되는지
  - referenceNode를 올바르게 찾는지

### 3. Text node 처리 로직
- **역할**: Text node 생성/재사용 및 올바른 위치에 삽입
- **입력**: FiberNode (text node), actualParent, referenceNode
- **출력**: Text node 생성/재사용 및 삽입
- **테스트 케이스**:
  - referenceNode를 올바르게 찾는지
  - Text node가 올바른 위치에 삽입되는지
  - 기존 Text node를 올바르게 재사용하는지

### 4. `findOrCreateHost`
- **역할**: DOM 요소 찾기 또는 생성
- **입력**: FiberNode, deps, context
- **출력**: HTMLElement
- **테스트 케이스**:
  - 기존 요소를 올바르게 재사용하는지
  - 새 요소를 올바르게 생성하는지
  - 올바른 위치에 삽입되는지

## 핵심 문제 분석

### Text node의 referenceNode 찾기

현재 구현:
```typescript
const childNodes = Array.from(actualParent.childNodes);
const referenceNode = fiber.index < childNodes.length ? childNodes[fiber.index] : null;
```

**문제**:
- `fiber.index`는 VNode children 배열의 인덱스
- `parent.childNodes`는 이미 DOM에 추가된 노드들의 배열
- Text node와 Host element가 섞여 있을 때 인덱스가 일치하지 않을 수 있음

**예시**:
- VNode children: [VNode0(text "This"), VNode1(element), VNode2(text "hted"), VNode3(element), VNode4(text "ted text")]
- commit phase 순서: Fiber0, Fiber1, Fiber2, Fiber3, Fiber4
- Fiber2를 commit할 때:
  - `fiber.index = 2`
  - `parent.childNodes[2]`는 Fiber1의 domElement일 것 (이미 commit됨)
  - 그렇다면 Fiber2의 텍스트 노드는 Fiber1의 domElement 다음에 삽입되어야 함
  - 하지만 이것은 올바르지 않을 수 있음

**해결책**:
- `fiber.index`가 아니라, 이미 commit된 이전 형제들의 개수를 세어야 함
- 또는 `parent.childNodes`에서 현재 Fiber의 위치를 직접 찾아야 함

## 테스트 작성 계획

### 1. `commitFiberNode` 단위 테스트

```typescript
describe('commitFiberNode', () => {
  it('should insert text node at correct position', () => {
    // Given: VNode children with text and elements
    // When: commitFiberNode called
    // Then: text node inserted at correct position
  });
  
  it('should find correct referenceNode for text node', () => {
    // Given: parent with existing childNodes
    // When: commitFiberNode called for text node
    // Then: referenceNode is correct
  });
});
```

### 2. Text node 처리 로직 단위 테스트

```typescript
describe('Text node processing', () => {
  it('should find correct referenceNode using parent.childNodes', () => {
    // Given: parent with existing childNodes and fiber.index
    // When: finding referenceNode
    // Then: referenceNode is correct
  });
  
  it('should insert text node before referenceNode', () => {
    // Given: text node and referenceNode
    // When: inserting text node
    // Then: text node is inserted before referenceNode
  });
});
```

## 개선 방향

1. **referenceNode 찾기 로직 개선**:
   - `fiber.index`가 아니라, 이미 commit된 이전 형제들의 개수를 세기
   - 또는 `parent.childNodes`에서 현재 Fiber의 위치를 직접 찾기

2. **단위 테스트 추가**:
   - `commitFiberNode` 테스트
   - Text node 처리 로직 테스트
   - referenceNode 찾기 로직 테스트

3. **디버깅 로그 추가**:
   - `fiber.index`와 `parent.childNodes`의 관계를 로깅
   - referenceNode를 찾는 과정을 로깅

