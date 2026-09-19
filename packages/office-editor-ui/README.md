# @barocss/office-editor-ui

**에디터를 아는 UI** — 제품의 선언을 읽어, 사람이 조작할 표면으로 그리는 층.

## 이름이 곧 경계입니다

`office-ui` 는 에디터를 **모릅니다** — props 로 받고 callback 으로 내보내는 것이 그 패키지의 규칙이고,
그래서 어느 제품에나 붙습니다. 이 패키지는 에디터를 **압니다**: 구독하고, 선택에 상태를 묻고, 명령을
실행합니다. 둘을 가르는 사실이 그것뿐이라 이름이 그것을 말합니다.

`office-chrome` 이었습니다. *Chrome* 은 UI 용어이지만 브라우저와 겹쳐서, 문서를 읽지 않은 사람에게는
브라우저 지원 패키지로 읽힙니다 — 이름이 설명을 필요로 하면 이름이 진 것입니다. `surface` 와 `panel` 은
이미 스키마의 낱말이라(11회, 12회) 쓰면 한 낱말이 두 뜻이 됩니다.

## 이 패키지가 채우는 빈 칸

```
office-controls      선언의 모양 — Control, MenuModel, PanelRow
office-ui            원시 부품 — 에디터를 모름
office-editor-ui     ← 선언을 읽어 표면으로 — 에디터를 앎
office-site / word / slides / note   제품의 선언
```

Between the primitives and the declarations there was nothing, so every app wrote its own wiring:
**세 개의 리본, 634 + 366 + 454줄**, doing the same five things.

```
1. 에디터를 구독한다     useRevision(watchAnswers(editor))    제품 무관
2. 선언을 읽는다         SITE_TOOLBAR / WORD_TOOLBAR / …       제품마다 다름
3. 상태와 가능 여부       markState, canExecuteCommand          제품 무관
4. 원시 부품으로 그린다   office-ui                             제품 무관
5. 실행한다              preventDefault → executeCommand       제품 무관
```

Four of the five are the same in every product. The one that is not is *which list*, and that is the
prop.

## 쓰는 법

```tsx
const rows = useControls(editor, SITE_TOOLBAR, { keys: SITE_KEYS, apple });

<ToolbarGroup id="text">
  {rows.map((one) => (
    <ToolbarToggle key={one.key} id={one.key} label={one.says}
      shortcut={one.shortcut} state={one.state} disabled={one.disabled} onActivate={one.run}>
      <Icon name={one.control.icon ?? 'bold'} />
    </ToolbarToggle>
  ))}
</ToolbarGroup>
```

훅이지 컴포넌트가 아닌 이유: **단추는 공유되지 않고 로직이 공유됩니다.** 사이트의 리본은
`RadixToolbar.Button` 인 `ToolbarToggle` 로 그리고 — Radix 툴바 안에서만 삽니다 — 노트의 바는 자기
스타일시트를 가진 평범한 `<button>` 한 줄입니다. 둘 다 각자의 크롬에 맞고, 둘 중 하나를 그리는 공유
컴포넌트는 문제를 옮길 뿐입니다.

평범한 단추 한 줄이면 되는 경우를 위해 `Controls` 컴포넌트도 있습니다. 상자는 만들지 않고 fragment 를
돌려줍니다 — 배치는 부르는 쪽의 몫이니까요.

## 세 가지 탈출구, 그리고 그것이 경계입니다

| 옵션 | 누가 왜 필요했나 |
|---|---|
| `can` / `onRun` | 사이트는 **열린 페이지**를 모든 명령에 실어 보냅니다. 데크의 몇 컨트롤은 **파일**을 먼저 받아야 실행됩니다. 사이트의 이모지는 어느 것인지 먼저 묻습니다 |
| `state` | Word 는 상태를 네 갈래로 읽습니다 — 목록 정의, 표 룩 플래그, 셀 속성, 컨트롤 자신의 함수. 어느 것도 마크가 아닙니다 |

규칙으로 적으면: **공유 표면은 제품의 답을 인자로 받지, 분기로 갖지 않습니다.** 여기에
`if (product === 'word')` 가 생기면 그것은 양방향으로 결합된 것이고, `docs/SHARED-LAYER.md` 가 여는
문장이 바로 그 실패입니다.

## 무엇이 안 들어오나

**제품의 어휘를 아는 것.** 이 패키지는 제품을 하나도 의존하지 않습니다 — 그래야 제품이 이것을 의존할 수
있습니다. 네 제품은 **devDependency** 이고, 검사에서만 씁니다.

**제품 좌표 계산.** 페이지·캔버스 좌표, 회전 핸들, 표 병합 경계는 제품에 둡니다. DOM 노드의 화면 위치와
잘림 여부는 `useNodeAnchor`가 공유합니다. 문서 노드 ID를 DOM 요소에 연결하며, DOM 측정 자체는 office-ui가 맡습니다.

## 지금 들어 있는 것

| | 무엇 |
|---|---|
| `useControls` | 선언 한 줄을 그릴 수 있는 줄로 — 구독, 키, 코드, 상태, 실행 가능 여부, 실행 |
| `controlRows` | 같은 답, **React 없이**. 훅은 *언제* 물을지, 이것은 *답이 무엇인지* |
| `ControlRows` | 렌더 프롭 — 훅을 `.map` 안에서 못 부르니 |
| `Controls` | 평범한 단추 한 줄이면 되는 경우 |
| `useEditorRevision` | 선택이나 문서가 움직였을 때 다시 그림 |
| `useDocumentRevision` | 문서만 — 개요, 발표자 노트, 글자 수 |
| `SlashMenu` | `/` 를 치면 뜨는 메뉴 |

`useEditorRevision` 은 Word 와 데크의 `revision.ts` 에 같은 파일로 있었고, **주석이 조건을 미리
적어뒀습니다** — *세 번째 제품이 이 줄을 원하면 그때가 패키지가 추측 대신 데이터 두 개를 갖는 지점*.
그리고 옮기고 나서 세어 보니 같은 줄이 **여섯 곳 더** 손으로 쓰여 있었습니다: 노트에 셋, 사이트의
`app.tsx` 에 하나, `inspector.tsx` 에 둘. **공유할 자리가 없으면 공유물이 있어도 안 쓰입니다.**

### `SlashMenu` — 이름이 달라 놓칠 뻔한 것

`apps/site/src/slash-surface.tsx` (195줄) 와 `packages/office-note/src/note-slash.tsx` (182줄) 는
**이름이 달랐습니다.** 그래서 이름으로 세는 훑기에는 안 잡혔고, 주석과 빈 줄을 뺀 본문을 줄 집합으로
대보고서야 나왔습니다 — **129줄 중 다른 것이 여덟 줄**, 그 여덟이 전부 사이트의 `mode` 가드.

같았던 것: 캐럿 앞 글자에서 `/질의` 를 읽는 정규식, 열려 있을 때의 Escape · 화살표 · Enter,
`selectionRectIn` 으로 캐럿 재기, 스크롤·리사이즈에 다시 재기, `FloatingSurface` 로 목록 그리기.

사이트의 가드는 `active` 옵션이 됐습니다 — 페이지 빌더의 포인터에는 `/` 가 글자인 선택 모드가 있고
본문에는 없습니다.

이것이 두 개의 의존을 더 데려왔고, 검사가 그것을 잡아서 이유를 적게 했습니다: `editor-view-dom`
(`selectionRectIn` — 캐럿이 화면 어디인지는 그린 쪽만 압니다) 과 `extensions`
(`SlashCommandExtension.state` — 슬래시 항목이 모델 파일이 아니라 확장에 사는 것에 대한 사실). 둘 다
엔진이지 제품이 아니라, 이름이 말하는 규칙은 그대로입니다.

## 무엇이 여기 오지 *않았나*

측정해 보고 안 옮긴 것들이고, 이유가 각각 다릅니다:

- **패널.** 중복이 아니었습니다. `office-ui` 의 `PropertySheet` 가 그리기를, `office-controls` 의
  `panelRowsFor`/`panelGroupsFor` 가 거르기와 묶기를 이미 하고 있었습니다. 두 앱이 남긴 배선 넷 중
  셋은 진짜로 다릅니다(단위 변환, payload 모양). 하나만 같았고 — `when` — **답이 서로 달랐습니다**.
  `office-controls` 의 `panelRowShown` 으로 갔습니다.
- **오버레이.** 선언이 아니라 좌표를 읽습니다. 사이트 1,852줄과 데크 3,605줄이 각각 함수 하나이고,
  이름이 하나도 겹치지 않습니다.
- **`Ruler`.** 이름만 같습니다 — Word 것은 문서 눈금자(들여쓰기·탭), 데크 것은 시간 눈금자.
- **팝오버 자리잡기.** 세 곳에 있고 서로 달랐지만 **에디터를 모릅니다** — 사각형 둘과 낱말 둘이
  들어가고 좌표가 나오는 순수 기하입니다. `office-ui` 의 `placeNear` 로 갔습니다. 이 패키지가 아닌
  이유가 곧 이 패키지의 정의입니다.

## 설정 창의 초안과 적용

`useEditorSettings`는 창을 열 때 값과 선택을 보관합니다. Word의 문단 간격·테두리·페이지 설정과 Slides의 크기·레이아웃·테마 설정에서 사용합니다. 새 문서를 여는 템플릿 작업은 제품의 문서 교체 흐름으로 처리합니다.

```tsx
const { state, setState, selection, busy, problem, close, apply } =
  useEditorSettings(editor, open, readSettings, onClose, {
    context: targetId,
    isEqual: (a, b) => a.width === b.width,
  });

// 제품이 입력값을 검사하고 명령 payload를 만듭니다.
const submit = () => {
  if (editor && isValid(state)) {
    void apply(() => editor.executeCommand(commandId, { ...state, selection }));
  }
};
// 입력: setState(previous => ({ ...previous, width }))
// Dialog 닫기: onOpenChange={next => !next && close()}
// 적용·취소 버튼과 입력은 busy 동안 비활성화합니다.
// problem은 office-ui StatusNotice로 표시합니다.
```

- `read`는 부수 효과 없이 새 초안을 반환해야 합니다. 초안은 직접 수정하지 않고 새 값으로 갱신합니다.
- 열린 동안 선택이 움직여도 초안과 저장한 선택은 유지합니다. 다른 대상의 설정으로 바꿀 때는 `context`를 변경합니다.
- 편집기·문서·context가 바뀌거나 창을 다시 열면 새 세션을 시작합니다. 이전 세션의 완료 응답은 새 창을 닫지 않습니다.
- 적용 중에는 중복 적용과 닫기를 막습니다. 명령이 `false`를 반환하거나 예외가 발생하면 초안을 유지하고 오류를 표시합니다.
- 변경이 없으면 명령 없이 닫습니다. 기본 비교는 `Object.is`이며, 값 비교가 필요하면 `isEqual`을 제공합니다.
- 같은 설정으로 재배치하는 동작은 `apply(operation, { skipUnchanged: false })`를 사용합니다. 일반 적용에는 기본값을 유지합니다.
- `close`는 문서를 변경하지 않습니다. 이미 실행 중인 문서 트랜잭션을 취소하는 기능은 아닙니다.

명령, 단위 변환, 입력 검증, 선택 대상 해석은 제품에서 맡습니다. 여러 변경을 한 번에 실행 취소하는 명령 구성도 제품의 책임입니다.

## 문맥 도구의 표시와 포커스

`useEditorContextVisibility`는 Note 글자 도구와 Word 수식 도구가 공유합니다. 대상 판정과 화면 좌표는 제품이 계산합니다.

```tsx
const { open, dismiss, reopen } = useEditorContextVisibility(editor, target?.id ?? null, {
  scope: editorElementRef,
  retainWithin: toolbarElementRef,
  active: !editingMath,
});
// FloatingSurface에는 open과 onDismiss={dismiss}를 전달합니다.
// 제품이 명시적인 재선택을 확인한 경우 reopen()을 호출합니다.
```

- 편집기나 도구 내부에 포커스가 있을 때 표시합니다. 도구의 숫자·주소 입력은 포커스를 유지할 수 있습니다.
- 편집기 밖의 필드, 별도 입력 소유자(`data-editor-input-owner`), 창 포커스 상실, 읽기 전용 상태에서는 숨깁니다.
- Escape로 닫은 대상은 잠시 위치를 잃거나 포커스가 이동해도 닫힌 상태를 유지합니다. 다른 대상이나 제품의 명시적인 재선택은 다시 열 수 있습니다.
- 대상 키는 안정적인 ID를 사용합니다. 범위 객체를 사용하는 경우 `sameKey` 비교 함수를 제공합니다. 편집기와 문서 루트가 바뀌면 닫힘 상태도 새로 시작합니다.
- KaTeX 표시와 실제 수식 입력의 구분, 좌표·스크롤·확대 측정, 실행 명령은 제품의 책임입니다.

## DOM 노드의 위치와 화면 경계

`useNodeAnchor(editor, scope, nodeId)`는 현재 문서에 붙어 있는 노드의 `{ element, at }`를 반환합니다.
대상이 없거나 화면·스크롤 조상에 완전히 가려지면 `null`입니다. 좌표만 필요하면 기존 `useNodeRect`를 사용합니다.

```tsx
const anchor = useNodeAnchor(editor, scope, selectedId);
<FloatingSurface open={open && !!anchor} at={anchor?.at ?? null}
  ownedElements={[anchor?.element ?? null]} onDismiss={dismiss}>
  {tools}
</FloatingSurface>
```

- 내부 스크롤, 창·visual viewport 변경, 대상과 조상의 크기 변경, class/style 변경, DOM 교체를 감지합니다.
- 같은 프레임의 감지를 합치고, 변화가 없으면 상태를 갱신하지 않습니다. 대상이 없는 동안에는 계속 프레임을 측정하지 않습니다.
- 일부만 보이는 대상은 전체 원래 좌표를 반환합니다. 표 너비나 핸들 위치에 잘린 너비를 사용하지 않습니다.
- Note 표·블록·코드 도구와 Word 수식 도구에서 사용합니다. 텍스트 Range 측정과 캔버스의 모델 좌표 변환은 별도입니다.
- CSS 애니메이션의 모든 중간 프레임이나 clip-path 형태를 추적하는 API는 아닙니다.

## 검사 실행 방법

`controlRows` 는 `useControls` 와 같은 답을 **React 없이** 냅니다. 훅은 언제 물을지를 정하고, 그 함수는
답이 무엇인지를 정합니다 — 검사할 가치가 있는 것은 밀리초에 검사할 수 있어야 한다는 이 저장소의 규칙
그대로입니다.
