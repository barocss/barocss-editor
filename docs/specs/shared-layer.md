# 아래로 내려갈 것과, 겉만 같은 것

**이 문서의 표는 두 개이고, 두 번째가 첫 번째보다 길다.** 제품 넷을 가로질러 같은 일을 하는 코드를
찾으면 대부분은 *같은 이름* 이 나오고, 그중 절반은 **같은 이름의 다른 질문** 이다. 겉이 같다고 내리면
그때부터 두 제품이 하나의 답에 묶이고, 그건 제품→제품 의존을 걷어낸 이유를 다시 만드는 일이다.

측정: **2026-09-05 · 제품 4 · 부품 6 · 앱 9**. 방법은 §어떻게 쟀나에 적었다.

이 문서가 붙잡는 주장은 `docs/specs/architecture.md` 의 것과 같은 것들이다 —
`no-product-depends-on-a-product`, `dependency-graph`, `every-product-is-built-the-same-way`.

---

## 어떻게 쟀나 — 그리고 재면서 세 번 틀렸다

렌즈를 여섯 개 썼다. 이름으로 찾는 것은 하나뿐이다.

| 렌즈 | 무엇을 묻나 | 나온 것 |
|---|---|---|
| **줄 단위 클론** (주석·공백 제거, 6줄 창) | 그대로 베낀 것이 있나 | **3곳** — 그중 하나는 재내보내기 목록 |
| **구조 클론** (식별자→`I`, 문자열→`S`, 12줄 창) | 이름만 바꿔 베낀 것이 있나 | **3쌍**, 최대 34줄 |
| **같은 상수 표** (문자열만 든 배열) | 같은 목록을 두 곳이 적었나 | **1개** |
| **같은 이름 선언** (`export` 만) | 두 제품이 같은 이름을 선언했나 | **9개** |
| **어간 대조** (제품 접두사 제거) | 이름만 다르고 같은 것이 있나 | **24개** |
| **같은 CSS 클래스** (17개 스타일시트) | 같은 클래스를 여러 패키지가 정의하나 | **7개**(잡음 제외) |

**줄 단위 클론이 3곳뿐인 것이 첫 결과다.** 이 저장소는 베끼지 않는다 — 다시 *발명* 한다. 그래서
남은 렌즈 넷이 일을 다 했고, 가장 많이 찾은 것은 어간 대조였다.

### 그리고 분류기가 세 번 틀렸다 — 세 번 다 표본을 손으로 열어서 알았다

1. **import 파서가 앞 문장까지 삼켰다.** `import ... from '@barocss/X'` 를
   `[\s\S]{0,600}?` 로 잡았더니 **앞의 import 들이 통째로** 딸려 왔다. `office-slides` 가
   `office-editor-ui` 에서 **57개** 를 가져온다고 나왔고, 실제로는 **3개**(`ControlRows`,
   `useEditorRevision`, `useDocumentRevision`)다. `office-editor-ui` 는 문이 6개뿐인 패키지다 —
   눈으로 보고 이상해서 열었다. 고친 뒤 표본 5개를 손으로 대조했다.
2. **템플릿 문자열로 만드는 클래스를 죽었다고 셌다.** `apps/word/src/style.css` 에서 *아무도 안
   쓰는* 클래스가 16개라고 나왔는데, 전부
   ``className={`w-drawing-handle w-drawing-handle-${handle}`}`` 꼴이었다. **죽은 클래스는 0개**이고,
   패키지만 쓰는 것은 71이 아니라 **87** 이고, 앱만 쓰는 것은 21이다.
3. **주석을 코드로 셌다.** `apps/site/src/ribbon.tsx` 가 `onApple` 을 복제한다고 나왔는데, 걸린 줄은
   *주석 안의 `userAgentData`* 였다. 그 파일은 `office-ui` 의 `onApple()` 을 제대로 부른다. 실제
   복제는 `office-slides` 안에만 둘 있다.

세 번 다 **숫자가 이상해서 열어 봤을 때** 드러났다. 도구가 맞는지는 도구가 말해 주지 않는다.

---

## 표 1 — 내려가야 할 것

순서는 **살아 있는 결함이 있는가** 로 정했다. 이름을 통일하는 일은 뒤다.

| # | 무엇 | 몇 곳 | 몇 줄 | 어디로 | 옮기면 무엇이 깨지나 |
|---|---|---|---|---|---|
| **1** | **캐럿에서 삽입 지점**, 그리고 *여기에 블록이 들어가나* | **5벌 / 3제품** + 맨 조상 걷기 **33곳 / 8패키지** | ≈140 + 33×5 | `office-text`(걷기) · `holdsABlock` 은 스키마 질문이므로 `office-text` 또는 `editor-core` | Word 의 `insertFrame`·`insertShape` 가 지금 표 안에서 **행에 넣으려 한다**(§1 참조). 옮기면 그 자리에서 *거부* 가 아니라 *비활성* 이 되어야 하고, Word 의 브라우저 회차가 그 버튼을 눌러 본 적이 없으므로 단위 검사를 먼저 써야 한다 |
| **2** | **줌 사다리** — `stepZoom` | 3벌(`office-slides` 사다리, `office-word` 사다리+자기 `ZoomControl` 143줄, `office-ui` 곱셈 ×1.25) | 20 + 143 + 107 | `office-ui` — `zoomIn`/`zoomOut` 옆 | `apps/slide` 와 `apps/site` 의 ± 단추가 **지금 1.25배씩 곱한다**. 옮기면 100%→150%→200% 로 바뀌고, `data-zoom` 을 읽는 브라우저 검사가 있으면 그 값이 달라진다 |
| **3** | **Mac 인가** | `office-ui/platform.ts` 의 `onApple()` 22줄 + `office-slides` 안의 인라인 복제 **2곳** + `shared/platform.ts` 의 `IS_MAC` 33줄(**다른 판정식**) | 22 / 9 / 33 | 이미 `office-ui` 에 있다 — **닿기만 하면 된다.** `IS_MAC` 과 어느 쪽이 정답인지는 결정이 필요하다 | `IS_MAC` 은 `editor-core` 가 `when: 'isMac'` 을 푸는 데 쓰고, `onApple()` 은 화음을 *인쇄* 하는 데 쓴다. 둘이 갈리면 **⌘B 를 인쇄하고 Ctrl+B 가 발동한다.** 합칠 때 `editor-core` 의 컨텍스트가 모듈 로드 시점 상수에서 함수 호출로 바뀐다 |
| **4** | **Word 의 크롬 CSS 가 앱에 남아 있다** | `apps/word/src/style.css` **1,248줄 / 클래스 121개** 중 **87개를 패키지만** 쓴다 (`office-word` 가 56개, `office-text` 가 36개를 그린다 — 겹치는 이름이 있다) | 1,248 | `office-word/src/ui.css`(새 문) + `office-text/src/text.css`(수식·표) | `office-word` 는 지금 **`.css` 문이 하나도 없다**(넷 중 유일). `office-text/math-renderers.ts` 가 그리는 `w-math-*` **31개** 의 규칙이 전부 앱에만 있으므로, `apps/word` 밖에서 수식을 그리면 분수·근호·행렬이 **평범한 인라인 span** 이다. `@source` 와 `publishConfig.exports` 를 함께 고쳐야 한다(architecture.md §셸을 옮길 때 1·2) |
| **5** | **목록 마커 CSS** | 2곳 — `office-text/text.css:44–82` 와 `office-slides/slides.css:31–63`. **주석까지 같은 문장** | 39 / 33 | `office-text/text.css` | 선택자 접두사가 다른 것이 베낀 이유다(`.w-list` vs `.sl-list`), 그리고 counter 이름도(`w-item`/`sl-item`). `office-text` 쪽만 `[data-marker='']` 로 좁혀 두어 **Word 의 번호가 이기게** 되어 있다 — 합칠 때 그 가드를 잃으면 Word 의 목록이 번호를 두 번 그린다 |
| **6** | **각도 → 방향 벡터** (`{x: sin θ, y: −cos θ}`, 위에서 시계 방향) | 4곳 / 2패키지 — `slides/svg-paint.ts:76` · `slides/gradient-axis.ts:60` · `slides/paints.ts:543` · `site/paint.ts:179` | 2줄 × 4 | `office-canvas` | 넷 중 셋이 `-0` 을 따로 막는다(`cos(90°)` 가 6.1e-17). 하나로 만들면서 그 처리를 빠뜨리면 문서에 `-0` 이 **저장** 된다 — `slides/paints.ts:530` 이 그렇게 적어 두었다 |
| **7** | **그림자 산술** — 거리·각도 → `box-shadow` | 2곳. `site/paint.ts:166–181` 이 *"The deck's arithmetic, exactly … Copied rather than reinvented"* 라고 스스로 적어 두었다 | 16 / 33 | `office-canvas` (6번과 같은 자리) | 없다 — 두 판이 이미 같은 값을 낸다. 이건 **지금이 옮기기 가장 싼 순간** 이라는 뜻이다 |
| **8** | **슬래시 항목을 컨트롤 목록에서 뽑기** | 2곳 — `site/toolbar-model.ts:381` · `note/note-kit.ts:107`. 반환 타입이 글자까지 같다 | 17 × 2 | `office-controls` | 설명 칸이 다르다(`makes` vs `title`). 인자로 받으면 된다. **Word 와 Slides 에는 슬래시 메뉴가 아직 없다** — 세 번째가 쓰기 전에 옮기는 것이 요점이다 |
| **9** | **평평한 컨트롤 목록에서 필드 뽑기** | 1곳 — `site/toolbar-model.ts:351–359` 가 `iconsIn`/`commandsIn` 을 다시 적었다. `SITE_TOOLBAR` 가 그룹이 아니라 배열이기 때문 | 9 | `office-controls` — `iconsIn`/`commandsIn` 에 평평한 목록 오버로드 | 없다. 가장 싼 줄 |
| **10** | **넛지의 어휘** | 3제품 3이름 2모양 — `moveShapes {dx,dy}`(word, `args`) · `nudgeBoxes {dx,dy}`(slides, `payload`) · `nudgeBlock {axis,by}`(site, `payload`) | — | 커맨드는 제품의 것이다. **payload 모양만** `office-canvas` 의 것으로 | 이름을 합치면 안 된다(§표 2). 모양만 합쳐도 메뉴·키맵이 하나의 문장으로 그 제스처를 말할 수 있게 된다 |

### §1 — Word 는 표 안에서 도형을 넣지 못한다

표 1의 1번이 왜 맨 위인지.

`office-site` 가 이 걷기를 **두 번** 고쳤고, 두 번 다 자기 파일에 적어 두었다
(`office-site/src/selection.ts:656–673`):

> `_blockAt`(스택의 삽입)과 `_atCaret`(요소의 삽입)이 둘 다 캐럿에서 올라가다 **표 칸에서 멈췄다**
> — 그 부모는 `bTableRow` 이고 칸만 담는다. 그래서 **이 제품의 모든 삽입** 이 표 행 안에 블록을 넣으려
> 했고, 검증기가 트랜잭션을 거부했고, 커맨드는 단추가 켜진 채 false 를 돌려줬다.

고친 방법은 **목록 대신 스키마에게 묻는 것** 이고, 그것이 `holdsABlock`(31줄,
`office-site/src/selection.ts:675`)이다. 같은 파일이 왜 목록이면 안 되는지도 적어 두었다 —
*"a list of 'types a block cannot go inside' is a second place to remember the schema and would be
wrong the first time one was added."*

**Word 는 아직 그 목록이다.** `office-word/src/frame-commands.ts:133` 과
`office-word/src/canvas-insert-commands.ts:117` 의 조건이 그대로 이렇다:

```ts
parent.stype !== 'paragraph' &&
parent.stype !== 'heading'
```

`bTableCell` 의 content 는 표준 스키마에서 `'inline*'`(`schema/src/standard-schema.ts:162`)이므로,
표 칸 안의 캐럿에서 이 걷기는 `inline-text` 를 지나 `bTableCell` 에서 멈추고
`{ parentId: <bTableRow>, at }` 을 돌려준다. 그 자리에 `addChild` 로 `frame` 을 넣는다 —
`bTableRow` 의 content 는 `'bTableCell*'` 이다.

**즉 사이트 빌더가 두 번 고친 결함이 Word 에 두 파일로 살아 있다.** 이것은 스키마와 코드를 읽어
세운 결론이고 **아직 돌려서 확인하지 않았다** — 브라우저 회차 대신 단위 검사로 먼저 확인해야 한다
(`docs/specs/testing.md` 의 순서).

---

## 표 2 — 내려가면 안 되는 것

**겉이 같고 답이 다른 것.** 이 표가 첫 표보다 긴 것이 이 회차의 결과다.

| 무엇 | 어디 | 왜 하나가 아닌가 |
|---|---|---|
| `paintCss` · `backgroundCss` · `effectsCss` | `office-site/paint.ts`(321줄) · `office-slides/paints.ts`(642줄) | **서명부터 다르다.** 사이트는 `(attrs, resolve) → Css` 이고 덱은 `(Paint[], box?) → string`. 덱은 상자의 폭·높이를 **문서가 말해 주므로** 그라디언트 축을 자기가 계산하고, 페이지는 브라우저가 눕히기 전까지 상자가 없어서 CSS 그라디언트를 넘긴다. `office-site/paint.ts` 가 그 이유와 **옮길 조건** 을 스스로 적어 뒀다 — *"The day this is wanted a third time it moves to `office-canvas`."* 지금은 둘이다 |
| `ZOOM_MIN` · `ZOOM_MAX` · `ZOOM_STEPS` | `office-word/zoom.tsx:45–48` · `office-slides/geometry.ts:202–206` | **같은 이름, 다른 값.** 문서는 0.25–4 에 [0.5 … 2], 덱은 0.1–8 에 [0.25 … 4]. 문서의 줌 범위는 캔버스의 것이 아니다. **사다리를 *거니는 함수* 는 내려가고(표 1-2) 표는 제품에 남는다** |
| `slotOf` | `office-word/math-navigation.ts:74` · `office-slides/theme.ts:87` | 하나는 수식 트리를 올라가 **감싸는 슬롯 노드** 를 찾고, 하나는 문자열에서 `theme:` 접두사를 뗀다. 같은 이름, 관계없는 질문 |
| `boxOf` | `office-canvas/canvas-box.ts:54` · `office-site/carried.ts:274` | 하나는 placement 의 `x/y/w/h` 를 정규화한 **사각형**, 하나는 문서 뿌리에서 stype 으로 **컨테이너 노드** 를 찾는다. 그리고 **두 클립보드 파일이 각각 다른 쪽을 부른다** — 어휘가 공유된다고 가정하면 걸리는 자리 |
| `Ribbon` · `RibbonProps` | `office-word/ribbon.tsx:85` · `office-slides/ribbon.tsx:65` | 부품(`office-ui`)과 갱신 훅(`useEditorRevision`)은 이미 공유한다. 남은 것은 **모델** 이고, 그건 제품의 것이다 — 워드는 `panes`·`fonts`·`zoom`, 덱은 `slides`·`current` |
| `insertPageBreak` | `office-word/word-commands.ts:40` · `extensions/page-break.ts:11` | **저장소 전체에서 두 패키지가 같은 커맨드 id 를 선언하는 유일한 자리이고, 의도된 것이다.** 키트의 것은 블록 뒤에 마커를 놓고 캐럿을 두고, 워드의 것은 캐럿에서 쪼갠다 — *레이아웃이 페이지인* 제품의 답이다. 재고 나서 바꾼 것이라고 그 자리에 적혀 있다 |
| **키맵 자체** | `KeyModel`(slides · site) vs `Keybinding`(word · note) | **두 개의 다른 발동 구조다.** `Keybinding` 은 엔진의 `KeybindingRegistry` 가 `when` 문자열로 푼다. `KeyModel` 은 어디에도 등록되지 않고 제품의 `keydown` 이 직접 훑는다. 페이로드 칸 이름도 `args` vs `payload`. `office-controls/keys.ts` 가 `when` 을 **번역 대신 같은 낱말로** 들고 있는 것이 이 둘을 잇는 유일한 다리다 |
| `Escape` | site → `selectParent` · word → `leaveDrawing` · slides → 안 묶음 | 하나의 제스처가 아니라 제품마다 *지금 있는 데서 나가기* 를 자기 개념으로 덮어쓴 것 |
| `Mod+z` | slides → `historyUndo`(포커스 밖을 잡으려고) · site → `undo`(`mode:'any'`) · word·note → **안 묶음**(엔진 기본) | 셋이 *누가 undo 를 소유하는가* 에 다르게 답했다. Word 는 예전에 엔진의 16개를 더 약한 `when` 으로 다시 적었고 그게 결함이었다고 `word-keymap.ts` 헤더가 적어 뒀다 |
| **붙여넣기의 이름 충돌** | slides → 새 이름으로 **바꾼다** · site → **안 바꾼다**(목적지의 같은 이름에 붙인다) | 두 파일이 각각 그 결정을 적어 두었고 서로 반대다. 덱의 카드는 정의를 들고 오고, 페이지의 데이터셋은 목적지의 것을 가리켜야 한다 |
| **붙여넣기의 목적지** | slides → 컨테이너 + 절대 `x/y`(+144 트윕 밀기) · site → 부모 + **정수 색인** | 페이지에는 x 도 y 도 z 도 없다. `office-site/clipboard-commands.ts:33` — *"There is nothing to convert."* |
| `childrenOf` | `office-canvas`(sid 를 준다) · `office-text`(노드를 준다) | 캔버스는 **id 로** 주소를 매기고(배치가 정의를 이름으로 부르고, 연결선이 끝을 기억한다), 문서 스택은 노드를 준다. `office-word` 가 `canvasChildrenOf` 로 별칭을 붙여 쓰는 것이 옳은 처리다 |
| `SELECTABLE`/`TEXTUAL`(site) vs `NOTE_PICKED`/`NOTE_WRITTEN`(note) | `office-site/selection.ts:41` · `office-note/selection.ts:28` | **규칙은 하나고 목록은 제품의 것이다.** 노트가 그 자리에 그렇게 적어 뒀다 — *"The site builder has the same split and reached it the same way, six recorded times over. This is that lesson taken rather than repeated."* 규칙(*글을 고치는 블록은 캐럿을 받고 나머지는 가리켜진다*)은 이미 공유되어 있고, 옮길 것은 목록이 아니라 **문장** 이다 |
| **툴바·메뉴·패널의 *내용*** | `WORD_TOOLBAR`·`SLIDES_TOOLBAR`·`SITE_TOOLBAR`·`NOTE_TOOLBAR`, `*_MENUS`, `*_PANEL` | **모양은 이미 내려가 있다** — `office-controls` 의 `Control`·`ControlGroup`·`MenuEntryModel`·`PanelRow`. 남은 제품별 함수(`xMenuCommands`·`xPanelRows` 등 12개)는 기본 목록을 묶는 한 줄짜리 껍데기다. 이름값이지 복제가 아니다 |
| `office-note` 의 `_where` | `office-note/element-commands.ts:284` | 노트의 답은 *뿌리의 아이 하나 아래* 이고 걷기가 거기서 멈춘다. 표 1-1 이 옮기는 것은 **걷기와 스키마 질문** 이지 이 답이 아니다 |

---

## 부품 층 자체 — 여섯을 떼어 보면

*"빌려 쓴 부품은 떼어 봐야 드러난다."* 그래서 부품마다 **몇 제품이 그 파일의 심볼을 이름으로 부르나** 를 셌다.

| 부품 | 줄 | 제품이 부르는 이름 | 그중 **한 제품만** 부르는 것 | 정확히 한 제품만 닿는 파일 |
|---|---|---|---|---|
| `office-controls` | 1,663 | 47 | **10 (21%)** | **0** |
| `office-editor-ui` | 623 | 7 | 3 | 2 / 303줄 |
| `office-ui` | 6,773 | 72 | 33 (46%) — slides 26 | 13 / 1,784줄 |
| `office-text` | 6,878 | 59 | 41 (69%) — **word 38** | 9 / 2,695줄 |
| `office-canvas` | 7,174 | 126 | **103 (82%)** — slides 75 | 5 / 3,697줄 |
| `office-icons` | 799 | `Icon`·`iconNames` | — | 0 |

**패키지 단위로는 여섯 다 부품이다.** 제품 하나만 쓰는 부품은 없고, `office-icons` 는 word·note 가
직접, slides·site 가 `office-ui` 의 재내보내기를 통해 닿는다 — 그래서 넷이 다 닿는다.

**심볼 단위로는 둘이 부품이 아니다.**

- `office-canvas/canvas-connector.ts` **2,058줄** 을 `office-slides` 만 읽는다. 부품 층에서 가장 큰
  단일 독자 덩어리다. 그 자리에 근거가 적혀 있고(`office-word/index.ts:539`) 근거는 **스키마** 다 —
  *"a connector is a scene node, and two products with two answers for where a line leaves a circle
  would be one document drawn two ways."* **스키마가 공유되므로 그것을 읽는 코드도 공유 자리에
  있다** 는 논증이고, 그 말이 맞다. 다만 **지금은 독자가 하나이므로 그 주장은 검사되고 있지 않다.**
- `office-text/css.ts`(688) · `table-style.ts`(572) · `numbering-resolver.ts`(175) · `tabs.ts`(141)
  등 **2,695줄을 한 제품만** 읽는다(그중 2,316줄이 `office-word`). 여기의 논증은 연결선만큼 강하지 않다 — 워드 서식의
  해석이지 *글의 낱말* 이 아닌 것이 섞여 있다.

**그러나 `office-text/css.ts` 가 왜 그 자리여야 하는지의 증거도 그 파일에 있다.** `twipToPx` 가
`office-text/css.ts` 와 `office-slides/geometry.ts` 에 각각 있었고 **두 판이 다른 답을 냈다** —
`(twip/1440)*96` 대 `twip*(96/1440)`. **20만 개 중 58,306개가 다른 CSS 문자열** 이었고, 두 곳 다 자기
주석에 *exact* 라고 적어 두었다. `shared/units/units.ts` 로 합쳤다.

> **다시 적힌 것은 반드시 갈라진다.** 이 숫자가 그 문장의 값이다.

### 검사만 읽는 API — 41개

부품·제품을 통틀어 **`export` 되어 있고, 그 패키지의 검사 말고는 아무도 안 읽는** 심볼이 41개다.

**대부분은 그러라고 만든 것이다.** `toolbarCommands`·`sitePanelIcons`·`slidesMenuCommands` 같은
24개는 하네스가 *선언* 에게 물으려고 있는 문이고, 그 자리에 그렇게 적혀 있다.

**나머지가 문제다.** 표 1-2 가 거기서 나왔다:

| 무엇 | 어디 | 무엇이 그 대신 도나 |
|---|---|---|
| `stepZoom` (+단위 검사 9개) | `office-slides/geometry.ts:229` | `office-ui` 의 `zoomIn = zoom * 1.25`. **덱의 ± 단추는 100%→125%→156% 로 간다** — `stepZoom` 이 막으려고 쓰인 바로 그 행동이고, 그 검사는 통과한다 |
| `hintFor` · `hintOf` | `office-site/keymap.ts:236·241` | 리본과 inspector 는 `onApple()` 을 넘겨 제대로 그린다. 이 둘은 `keyLabel(chord)` 를 **인자 없이** 부르는데 그 기본값이 `apple = true` 다 — 부르는 쪽이 잊으면 **조용히 애플 표기** 가 된다 |

`keyLabel(chord, apple = true)` 의 기본값은 *느슨함이 결함* 의 모양이다. 넘기지 않아도 되게 만든
순간, 플랫폼을 안 물어본 호출이 컴파일된다.

---

## 진행 중 — 손대지 않은 것

- **`dsl` ↔ `renderer-dom` 타입 16개** (8개는 같고 8개는 **갈라져 있다**). `docs/BACKLOG.md` 에 5단계
  계획과 함께 있고 **다른 에이전트가 작업 중** 이다. 이 회차에서는 세지 않았다.

---

## 이 측정이 답하지 못하는 것

- **표 1의 1번은 읽어서 세운 결론이다.** Word 의 표 칸에서 도형 삽입을 눌러 본 회차가 없다. 단위
  검사가 먼저다.
- **오버레이 두 개(3,829 + 2,028줄)를 줄 단위로 대조하지 않았다.** 겹치는 행동은 여섯 —
  히트 테스트 · 마키 · Shift 다중 선택 · 드래그 재배치 · 포인터 캡처 · 스냅 가이드 — 이고, 그중
  **포인터 캡처는 이미 `shared/gesture.ts` 의 `dragGesture` 로 공유되어 있다.** 나머지 다섯은 좌표계가
  다르다(트윕 모델 상자 vs DOM 사각형). 이건 표 하나가 아니라 **회차 하나** 짜리다.
- **각 부품이 *왜* 그 자리인가는 심볼 수로 답할 수 없다.** `canvas-connector` 의 논증은 독자 수가
  아니라 스키마이고, 그 주장을 붙잡는 검사는 없다.
- **`office-note` 의 문이 `./view` 이고 나머지 셋은 `./ui` 다.** architecture.md 가 경계는 *React 가
  필요한가* 라고 정했으므로 노트가 뒤처진 쪽이다. 조각이 하나뿐이라 아직 값이 안 든다.
