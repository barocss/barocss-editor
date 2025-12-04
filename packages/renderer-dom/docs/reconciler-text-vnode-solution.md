# Reconciler Text VNode 처리 해결 방안

> **참고**: 이 문서는 해결 과정을 기록한 문서입니다. 최종 해결 방안과 전체적인 개념은 [`text-vnode-bug-fix.md`](./text-vnode-bug-fix.md)를 참고하세요.

## 최종 해결 방안

### 핵심 아이디어
**모든 텍스트를 항상 `<span>`으로 감싸기**

이렇게 하면:
1. reconciler가 text node를 찾을 때 더 단순해짐
2. 항상 Element VNode로 처리되어 순서 문제가 없음
3. text node는 항상 span 안에 하나만 존재
4. 에디터에 집중한 최적화
5. VNode 구조가 일관적이고 예측 가능해짐

## 수정 내용

### 1. VNode Builder 수정

#### `_buildMarkedRunVNode` (line 443-565)
- **변경 전**: innermost를 text-only VNode로 생성
  ```typescript
  let inner: VNode = {
    text: String(run?.text ?? '')
  };
  ```

- **변경 후**: innermost를 span으로 감싸서 생성
  ```typescript
  let inner: VNode = {
    tag: 'span',
    children: [
      {
        text: String(run?.text ?? '')
      }
    ]
  };
  ```

#### `_buildMarkedRunsWithDecorators` (line 2307-2318)
- **변경 전**: 일반 텍스트를 `{ tag: 'span', text: '...' }`로 생성
- **변경 후**: 일반 텍스트를 `{ tag: 'span', children: [{ text: '...' }] }`로 생성

### 2. VNode 구조 변화

#### 변경 전
```json
{
  "tag": "strong",
  "children": [
    {
      "text": "Bold",
      "children": []
    }
  ]
}
```

#### 변경 후
```json
{
  "tag": "strong",
  "children": [
    {
      "tag": "span",
      "children": [
        {
          "text": "Bold",
          "children": []
        }
      ]
    }
  ]
}
```

### 3. 테스트 수정

모든 테스트의 기대값을 실제 VNode 구조에 맞게 수정:
- `<strong class="mark-bold">Bold</strong>` → `<strong class="mark-bold"><span>Bold</span></strong>`
- `<span>text</span>` → `<span>text</span>` (span 안에 직접 텍스트)

## 결과

### 테스트 결과
- ✅ `reconciler-text-vnode.test.ts` - 4/4 통과
- ✅ `dom-renderer-multiple-render.test.ts` - 6/6 통과
- ✅ `mark-decorator-complex.test.ts` - 16/16 통과

### 장점
1. **단순화**: reconciler가 text-only VNode를 직접 처리할 필요 없음
2. **일관성**: 모든 text는 span 안에 있음
3. **최적화**: 에디터에 집중한 구조
4. **유지보수**: reconciler 로직이 더 단순해짐

## 최종 상태

✅ **모든 테스트 통과**: 주요 테스트 파일들이 모두 통과함
✅ **버그 해결**: `inline-text` 모델의 mark/decorator 적용 문제 완전 해결
✅ **텍스트 렌더링 버그 해결**: `element('span', {}, ['Test Component'])` 및 `text()` 함수 사용 시 텍스트가 정상 렌더링됨
✅ **코드 단순화**: Reconciler의 text-only VNode 처리 로직 제거
✅ **성능 향상**: 불필요한 조건 분기 제거로 처리 속도 향상
✅ **테스트 커버리지 향상**: 텍스트 렌더링 전용 테스트 추가 (`vnode-builder-text-rendering.test.ts`)

## 최근 추가 수정 (2024)

### 텍스트 렌더링 버그 수정

**문제**: `element('span', {}, ['Test Component'])`에서 텍스트가 렌더링되지 않음

**해결**: `reconcileVNodeChildren`에 `vnode.text` 처리 로직 추가

```typescript
// reconcileVNodeChildren 시작 부분
if (nextVNode.text !== undefined && (!nextVNode.children || nextVNode.children.length === 0)) {
  // vnode.text를 텍스트 노드로 렌더링
  // ...
}
```

이제 다음이 모두 정상 작동합니다:
- ✅ `element('span', {}, ['Test Component'])` - 문자열 배열 직접 사용
- ✅ `element('span', {}, [text('Test Component')])` - text() 함수 사용
- ✅ `element('span', 'Test Component')` - 문자열 직접 사용 (오버로드)

## 참고

- text-only VNode를 span으로 감싸는 것은 에디터에 특화된 최적화
- 일반적인 reconciler와는 다를 수 있지만, 에디터 사용 사례에 더 적합
- **중요**: reconciler의 text-only VNode 처리 로직은 제거되었음 (더 이상 필요 없음)
- **추가**: `vnode.text`로 collapse된 텍스트는 reconciler에서 직접 처리됨
- 전체적인 개념과 아키텍처 결정의 이유는 [`text-vnode-bug-fix.md`](./text-vnode-bug-fix.md) 참고

