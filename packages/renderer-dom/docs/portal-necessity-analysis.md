# Portal 필요성 분석

## 일반적인 에디터에서 Portal 사용 여부

대부분의 일반적인 텍스트 에디터(예: VS Code, Notion, Google Docs)에서는 **Portal 문법이 없습니다**. 대신 다음과 같은 방법을 사용합니다:

1. **레이어링 시스템**: 에디터 컨테이너 내부에 여러 레이어를 만들어 오버레이 UI를 처리
2. **직접 DOM 조작**: JavaScript로 직접 DOM 요소를 생성하고 배치
3. **CSS position**: `position: fixed` 또는 `absolute`를 사용한 오버레이

## 우리 시스템에서 Portal의 필요성

### 현재 아키텍처: 레이어링 시스템

`EditorViewDOM`은 이미 5개의 레이어를 제공합니다:

```typescript
view.layers.content      // z-index: 1 (ContentEditable)
view.layers.decorator    // z-index: 10-50 (Decorators)
view.layers.selection    // z-index: 100 (Selection UI)
view.layers.context      // z-index: 200 (Tooltips, Context menus)
view.layers.custom       // z-index: 1000+ (Custom overlays)
```

**대부분의 오버레이 UI는 레이어로 처리 가능합니다:**

```typescript
// 툴팁 예제 (레이어 사용)
const tooltip = document.createElement('div');
tooltip.className = 'tooltip';
tooltip.textContent = 'This is a tooltip';
tooltip.style.position = 'absolute';
tooltip.style.left = '30px';
tooltip.style.top = '25px';
view.layers.context.appendChild(tooltip);

// 모달 예제 (레이어 사용)
const modal = document.createElement('div');
modal.className = 'modal-overlay';
modal.style.position = 'absolute';
modal.style.top = '0';
modal.style.left = '0';
modal.style.width = '100%';
modal.style.height = '100%';
view.layers.custom.appendChild(modal);
```

### Portal이 필요한 경우

Portal은 **다음과 같은 특수한 상황에서만 필요**합니다:

#### 1. 에디터 컨테이너 밖에 렌더링해야 할 때

```typescript
// ❌ 문제: 에디터 컨테이너에 overflow: hidden이 있어서
//          position: fixed가 컨테이너 내부에서만 작동함
<div id="editor" style="overflow: hidden; position: relative;">
  <!-- 이 안에서 position: fixed는 컨테이너를 벗어날 수 없음 -->
</div>

// ✅ 해결: Portal을 사용하여 document.body에 직접 렌더링
portal(document.body, element('div', {
  style: { position: 'fixed', top: '50%', left: '50%' }
}, [/* modal content */]))
```

#### 2. z-index 스택 컨텍스트 문제

에디터 컨테이너가 `transform`, `opacity`, `filter` 등의 CSS 속성을 가지고 있으면 새로운 stacking context가 생성되어 z-index가 제대로 작동하지 않을 수 있습니다.

```typescript
// ❌ 문제: 스택 컨텍스트 문제
<div id="editor" style="transform: translateZ(0);">
  <!-- z-index: 9999여도 다른 스택 컨텍스트 요소보다 위로 올라갈 수 없음 -->
</div>

// ✅ 해결: Portal로 document.body에 렌더링하면
//          에디터의 스택 컨텍스트와 독립적으로 동작
```

#### 3. 전체 화면 모달/오버레이

에디터를 포함한 전체 페이지를 덮는 오버레이가 필요할 때:

```typescript
// ✅ 전체 화면 모달
portal(document.body, element('div', {
  style: {
    position: 'fixed',
    top: '0',
    left: '0',
    width: '100vw',
    height: '100vh',
    backgroundColor: 'rgba(0,0,0,0.5)',
    zIndex: 10000
  }
}, [/* modal content */]))
```

## Portal 사용 범위

### Model 렌더러 vs Decorator

**Model 렌더러 (`define('paragraph', ...)`)**: ❌ Portal 거의 사용 안 함
- 문서의 실제 콘텐츠를 렌더링
- 일반적으로 Portal이 필요 없음

**Mark 렌더러 (`defineMark('bold', ...)`)**: ❌ Portal 사용 안 함
- 텍스트 스타일만 적용
- Portal이 필요 없음

**Decorator 렌더러 (`defineDecorator('comment', ...)`)**: ✅ Portal 주로 사용
- 부가 UI 요소 (주석 툴팁, 팝업, 모달 등)
- 에디터 컨테이너 밖에 렌더링해야 할 때 Portal 사용

### 실제 사용 예시

```typescript
// ✅ Decorator에서 Portal 사용 (일반적)
defineDecorator('comment', (props, ctx) => {
  ctx.initState('showTooltip', false);
  
  return element('div', {
    onMouseEnter: () => ctx.setState('showTooltip', true),
    onMouseLeave: () => ctx.setState('showTooltip', false)
  }, [
    text('💬'),
    portal(document.body, element('div', {
      className: 'tooltip',
      style: {
        position: 'fixed',
        opacity: ctx.getState('showTooltip') ? 1 : 0
      }
    }, [text('Tooltip content')]))
  ]);
});

// ❌ Model 렌더러에서 Portal 사용 (드물게)
define('paragraph', element('p', {}, [
  portal(...)  // 일반적으로 불필요
]));
```

## 결론: Portal vs 레이어

### 레이어로 충분한 경우 (대부분)

- ✅ **툴팁**: `view.layers.context` 사용
- ✅ **컨텍스트 메뉴**: `view.layers.context` 사용
- ✅ **인라인 위젯**: `view.layers.decorator` 사용
- ✅ **선택 하이라이트**: `view.layers.selection` 사용 (자동)
- ✅ **에디터 내부 모달**: `view.layers.custom` 사용

### Portal이 필요한 경우 (드물게)

- ❗ **전체 화면 모달**: 에디터를 포함한 전체 페이지를 덮어야 할 때
- ❗ **스택 컨텍스트 문제**: z-index가 제대로 작동하지 않을 때
- ❗ **컨테이너 overflow 문제**: position: fixed가 컨테이너 내부에서만 작동할 때

## 권장사항

1. **기본적으로는 레이어 사용**: 대부분의 오버레이 UI는 레이어 시스템으로 처리
2. **Portal은 선택적 기능**: 특수한 상황에서만 사용
3. **선언적 접근**: Portal을 사용할 때도 DSL의 `portal()` 함수를 통해 선언적으로 처리

## 실제 사용 통계 (예상)

- **레이어 사용**: 90% 이상
- **Portal 사용**: 10% 미만 (전체 화면 모달, 특수한 오버레이 등)

Portal은 유용하지만 **필수적이지 않은 선택적 기능**입니다. 대부분의 경우 레이어 시스템으로 충분합니다.

