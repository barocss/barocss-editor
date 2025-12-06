# Decorator 브라우저 테스트 결과 분석

## 테스트 환경
- URL: http://localhost:5177/
- 테스트 앱: `apps/editor-decorator-test`

## 성공한 기능

### 1. Pattern Decorator
- ✅ URL 링크 (`https://example.com`) 정상 렌더링
- ✅ 이메일 링크 (`user@example.com`) 정상 렌더링
- ✅ Color chip (`#ff0000` 앞에 `position: 'before'`) 정상 렌더링

**확인된 구조:**
```html
<span data-bc-sid="text-13" ...>
  <span>Pattern decorator 테스트: </span>
  <a data-decorator-sid="pattern-url-text-13-23-42" ...>https://example.com</a>
  <span> 및 </span>
  <a data-decorator-sid="pattern-email-text-13-45-61" ...>user@example.com</a>
  <span> 그리고 </span>
  <span data-decorator-sid="pattern-color-text-13-66-73" data-decorator-position="before" ...></span>
  <span>#ff0000 색상 코드</span>
</span>
```

### 2. Layer Decorator
- ✅ 6개의 layer decorator가 `decorator` 레이어에 정상 렌더링
  - `comment-1`, `highlight-1`, `highlight-2`, `comment-2`, `highlight-3`, `comment-3`

**레이어 구조:**
- `content` 레이어: 1개 자식 (문서 콘텐츠)
- `decorator` 레이어: 6개 자식 (layer decorator들)
- `selection`, `context`, `custom` 레이어: 0개 자식

## 문제점

### 1. Inline Before/After Decorator 미렌더링

**문제:**
- `chip-before`와 `chip-after` decorator가 추가되었지만 렌더링되지 않음
- 콘솔 경고: `Target container not found for decorator chip-before`

**로그 분석:**
```
[LOG] [editor-decorator-test] Added inline position decorator: chip-before
[DecoratorRenderer] renderDecorator:start {decoratorId: chip-before, type: chip}
[WARNING] Target container not found for decorator chip-before
```

**원인 분석:**
1. `addDecorator()`가 호출될 때 `DecoratorRenderer.renderDecorator()`가 호출되고 있음
2. 하지만 현재 구조에서는 inline decorator는 `renderer-dom`의 `_buildMarkedRunsWithDecorators`에서 처리되어야 함
3. `addDecorator()` → `render()` 호출 시 decorator가 `renderer-dom`에 전달되지 않고 있음

**예상 동작:**
- `addDecorator()` → `decoratorManager.add()` → `render()` 호출
- `render()` → `_domRenderer.render(modelData, allDecorators)` 호출
- `renderer-dom`의 `_buildMarkedRunsWithDecorators`에서 inline decorator 처리
- `position: 'before'` 또는 `position: 'after'`인 경우 텍스트 앞/뒤에 삽입

**실제 동작:**
- `addDecorator()` → `decoratorManager.add()` → `render()` 호출
- `render()` 호출 전에 `DecoratorRenderer.renderDecorator()`가 호출됨
- `DecoratorRenderer`가 target container를 찾지 못함

### 2. Custom Generator Decorator 미렌더링

**문제:**
- `ai-status-generator`가 등록되었지만 생성된 decorator가 보이지 않음
- `text-14`에 "테스트"라는 단어가 있지만 chip이 렌더링되지 않음

**로그 분석:**
```
[LOG] [editor-decorator-test] Added custom generator: ai-status-generator
```

**원인 분석:**
1. Custom generator는 `_generateGeneratorDecorators()`에서 처리되어야 함
2. `render()` 호출 시 `_generateGeneratorDecorators()`가 호출되어야 함
3. 생성된 decorator가 `renderer-dom`에 전달되어야 함

## 테스트 케이스

### 작성된 테스트
- `packages/editor-view-dom/test/integration/inline-position-decorator.test.ts`
  - `inline decorator with position "before" should be inserted before text`
  - `inline decorator with position "after" should be inserted after text`
  - `multiple inline decorators with before/after positions should work correctly`

### 테스트 결과
- ❌ 모든 테스트 실패
- 원인: `DecoratorRenderer`가 여전히 호출되고 있어 inline decorator가 렌더링되지 않음

## 해결 방안

### 1. `addDecorator()` 수정
- `DecoratorRenderer.renderDecorator()` 호출 제거
- `render()` 호출 시 decorator를 `renderer-dom`에 전달

### 2. `render()` 메서드 확인
- `_domRenderer.render(modelData, allDecorators)` 호출 확인
- `allDecorators`에 `decoratorManager.getAll()` 결과 포함 확인

### 3. `_generateGeneratorDecorators()` 확인
- Custom generator decorator 생성 확인
- 생성된 decorator가 `allDecorators`에 포함되는지 확인

## 다음 단계

1. `addDecorator()` 메서드에서 `DecoratorRenderer` 호출 제거
2. `render()` 메서드에서 decorator 전달 확인
3. `_generateGeneratorDecorators()` 동작 확인
4. 테스트 재실행 및 검증

