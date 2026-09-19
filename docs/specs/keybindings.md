# 키 — 어느 층이 그 키를 갖는가

**한 줄로: 키가 하는 일이 *문서에 남으면* 레지스트리가 갖고, *화면에만 남으면* 앱이 갖는다.**

이 문서는 결함 목록이 아니라 **기준**이다. 새 제품을 만드는 사람이 키를 어디에 적을지 이것만 보고
정할 수 있어야 한다.

## 판단하는 질문 둘

```
이 키가 하는 일이 문서에 남는가?
├─ 아니오 → 크롬 키.  앱이 갖는다.  자기 요소에 붙인다.
└─ 예 → 다른 제품에서도 같은 뜻인가?
        ├─ 예 → 엔진 키.  editor-core 의 DEFAULT_KEYBINDINGS.
        └─ 아니오 → 제품 키.  <제품>_KEYBINDINGS.
```

*문서에 남는다* 는 되돌리기(undo)로 되돌아가는 것을 말한다. 이것이 갈라내는 선이 정확히
*그 키의 결과를 다른 사람이 나중에 보게 되는가* 이기 때문이다.

## 세 층

| 층 | 어디 | 출처 | 예 |
|---|---|---|---|
| **엔진** | `editor-core/keybinding/default-keybindings.ts` | `'core'` | Enter · Backspace · 화살표 · ⌘B/I/U · ⌘Z · ⌘C/V/X · ⌘A · 목록 · 들여쓰기 · 제목 |
| **제품** | `office-<제품>/…-keymap.ts` | `'product'` | Word 의 ⌘⌥F(각주) · 표의 `Tab` · 데크의 `Delete`(도형) |
| **크롬** | `apps/<제품>/…` | — | 팝오버의 `Escape` · 목록의 화살표 · 발표 모드의 `Home`/`End` · 발표자 창 |

**엔진 층은 마흔이고 모든 제품이 그것을 받는다.** 제품이 아무것도 안 적어도 ⌘B 는 된다 — 이것이
*"기본 기능을 공유한다"* 의 구체적 내용이고, 이미 그렇게 되어 있다.

## 규칙 여섯

### 1. 제품은 엔진 키를 **다시 적지 않는다**

레지스트리는 **출처로 충돌을 풀고 제품 바인딩이 엔진 것을 이긴다.** 그러므로 같은 키·같은 명령을
다시 적는 것은 *같은 것을 두 번 말하는 것* 이 아니라 **그 자리의 규칙을 제품 것으로 갈아치우는
것**이다.

재본 것: `WORD_KEYBINDINGS` 70개 중 **18개**가 엔진 것을 다시 적고 있었고, 다시 적힌 것이 더
약했다 —

| | 엔진 | Word |
|---|---|---|
| ⌘B·⌘I·⌘U·제목·목록·붙여넣기 | `editorFocus && editorEditable` | `editorFocus` |
| ⌘C·⌘X | `+ !selectionEmpty` | `editorFocus` |

`conformance` 가 아니라 `office-controls/no-product-restates-an-engine-key.test.ts` 가 이것을 센다.

### 2. 한 키의 뜻은 **`when` 으로 갈린다**, 목록으로 갈리지 않는다

Word 의 `Tab` 이 본보기다 — 다섯 갈래가 서로를 배제한다:

```
Tab → nextCell           when: inTable
Tab → nextMathSlot       when: inEquation
Tab → indentText         when: inList && !inTable && !inEquation
Tab → indentFirstLine    when: !inList && atBlockStart && !inTable && !inEquation
Tab → insertTab          when: !inList && !atBlockStart && !inTable && !inEquation
```

**제품이 엔진 키를 *좁히는* 것은 정당하다.** 엔진의 `Tab → indentText` 는 `canIndentText` 로 묻고
Word 는 목록 안인지로 묻는다 — 갈래를 만들려면 그래야 한다. 금지된 것은 좁히는 것이 아니라
**떨어뜨리는 것**이다(규칙 3).

### 3. 문서를 바꾸는 키는 **`editorEditable` 을 건다**. 읽는 키는 안 건다

`executeCommand` 도 `canExecute` 도 편집 가능 여부를 안 묻는다 — 재봤다. **키의 유일한 편집
가드가 `when` 이다.**

읽는 키는 걸지 않는다: `copy` · `selectAll` · 화살표 이동은 읽기 전용 문서에서 **되어야 한다.**

*현재 상태:* 엔진 40 중 23. **Word 49 중 46, note 2 중 0.**

Word 가 걸지 않는 셋에는 각각 이유가 있고, 그 이유가 `word-keymap.ts` 에 적혀 있다:

| 키 | 왜 |
|---|---|
| `Escape → leaveDrawing` | **읽는 키다.** 캐럿만 옮긴다 — 읽기 전용에서도 그림에서 나올 수 있어야 한다 |
| `Tab`·`Shift+Tab → nextCell`·`previousCell` | **제품의 것이 아니다.** `TABLE_CELL_KEYBINDINGS`(공용 `TableExtension`)이고 표를 가진 제품이 다 받는다 |

**note 의 0은 결함이 아니다.** note 가 가진 둘이 바로 그 공용 둘이므로 **자기 이름으로 적은 키가
없다.** 걸 것이 없어서 0이다.

그리고 그 공용 둘은 **읽는 키가 아니다** — `nextCell` 은 마지막 칸에서 `insertRowBelow` 를 부른다
(`extensions/src/table.ts:291`). 읽기 전용 문서에서 `Tab` 이 행을 만든다. **열린 결함이고 고칠 자리는
`packages/extensions` 다.**

*일괄로 거는 것이 답이 아니었던 이유는 그대로다* — 어느 명령이 읽기 전용에서 살아야 하는가는 제품의
결정이다. 그래서 검사는 *전부 걸어라* 가 아니라 **전부 분류되어 있어라** 이다:
`office-controls/test/document-keys-gate-on-editable.test.ts`. 걸었거나, 왜 안 거는지 적혀 있거나.
분류되지 않은 새 바인딩은 빨갛다.

*재보고 바뀐 것 하나:* `nextMathSlot` 을 처음엔 읽는 키로 분류했다 — 캐럿을 다음 칸으로 옮기니까.
그런데 빈 칸을 만나면 `_fillEmptySlot` 이 `addChild` 를 커밋한다(`math-commands.ts:234`). **한
갈래에서만 쓰는 명령도 쓰는 명령이다.**

### 4. 레지스트리가 **유일한 선언**이다. 듣는 자리는 **다른 질문**이다

이 둘을 한 문장으로 묶으면 틀린다 — 첫 판에서 그렇게 적었고 틀렸다.

**선언:** 어느 키가 무슨 뜻인지는 레지스트리 한 곳에 있다. 앱은 문서 키의 목록을 스스로 갖지
않는다.

**듣기:** 그 키가 *어느 요소에서* 잡히는가는 제품마다 다르다. 그리고 **캐럿이 있는 곳이 아니다.**

#### 표면이 둘이다

| 표면 | 무엇 | 무엇이 여기서 일어나나 |
|---|---|---|
| **글자 표면** | `contentEditableElement` = 콘텐츠 층 | 타이핑 · IME · `beforeinput` · 캐럿 |
| **문서 표면** | *읽는 사람이 이 문서를 만지고 있는 가장 바깥 요소* | **키 해석** |

`Delete` 로 도형을 지울 때 캐럿은 **없다.** 슬라이드를 골라 놓고 `Delete`, ⌘S, F5 도 마찬가지다.
그러므로 키를 글자 표면에서만 들으면 **문서에 남는 키의 절반을 못 듣는다.**

두 표면이 같은 제품도 있다:

| 제품 | 문서 표면 | 글자 표면과 같은가 |
|---|---|---|
| word | 콘텐츠 층 (`.w-canvas` 가 그 **안**에 있다) | **같다** |
| note | 콘텐츠 층 | **같다** |
| slides | **무대** (`.sl-stage-frame`) — `.sl-host` 가 그 안이고, 오버레이·눈금자는 콘텐츠 층 **밖**이다 | 다르다 |
| site | **캔버스** — 오버레이가 포인터를 먼저 받는다 | 다르다 |

Word 의 도형 키(`Delete → deleteShapes when shapesSelected`)가 레지스트리로 도는 이유가 이것이다:
그 제품에서는 캔버스가 콘텐츠 층 안이라 두 표면이 우연히 같다. **슬라이드가 호스트 디스패처를
쓴 것은 게으름이 아니라 그 자리에 다른 답이 없었기 때문이다.**

#### 엔진 쪽은 이미 열렸다 — 그리고 아무도 안 쓴다

`EditorViewDOM` 은 `keySurface` 를 받는다(기본값 = 콘텐츠 층). 그래서 word·note 는 한 글자도 안
바뀌었고 slides·site 가 레지스트리로 올 길이 생겼다.

| | 어디 |
|---|---|
| 선언 | `editor-view-dom/src/types.ts:73` |
| 기본값 | `editor-view-dom.ts:178` — `options.keySurface ?? this.layers.content` |
| 듣는 자리 | `editor-view-dom.ts:377` (해제 1406) |
| 검사 | `editor-view-dom/test/core/key-surface.test.ts` — 기본값 / 안의 키가 닿는가 / **밖은 안 닿는가** |

**`EditorViewDOM` 을 만드는 자리 넷 중 `keySurface` 를 넘기는 곳은 0이다**
(`apps/slide/src/main.tsx:91` · `office-slides/src/notes.tsx:101` · `apps/site/src/main.tsx:70` ·
`office-site/src/page-frame.tsx:150`). 문은 열려 있고 아무도 안 지났다 — 남은 것은 결정이지 엔진이
아니다.

**초점은 아직 안 열렸다.** `focus`/`blur` 는 여전히 콘텐츠 층에 붙는다(`editor-view-dom.ts:581`),
그러므로 더 넓은 표면을 건네면 `editorFocus` 가 거짓이다. 아래 *"`editorFocus` 가 뜻하지 않는 것"*
을 보라 — 이주하는 바인딩은 `editorFocus` 를 쓸 수 없다.

#### 크롬 입력칸은 어떻게 막나

*"오직 호스트만 사용자가 상자 안에서 타이핑 중인지 안다"* 는 논증이 `slides/keymap.ts` 에 적혀
있다. **문서 표면에 붙이면 그 질문이 사라진다** — 사이드바의 입력칸은 문서 표면 **밖**이므로
애초에 도달하지 않는다. `activeElement` 를 묻는 것은 `window` 에 붙였을 때만 필요하고, 그건
붙이는 자리를 잘못 고른 대가다.

### 5. **인쇄되는 것은 도는 것에서 나온다**

메뉴와 도움말이 보여주는 키는 실제로 등록된 키에서 파생된다. Word 가 이미 그렇게 한다:

```ts
export const WORD_KEYS: KeyModel[] = [...WORD_VIEW_KEYS, ...WORD_KEYBINDINGS];
```

`WORD_VIEW_KEYS` 는 크롬 키(⌘F 같은, 명령이 아니라 화면을 여는 것)이고 나머지는 도는 것 그대로다.
**두 목록을 손으로 맞추면 반드시 어긋난다** — 이 저장소가 그 모양으로 찾은 결함이 여럿이다.

### 6. 모든 키는 **자기 요소에 붙인다** — `window` 는 마지막 수단이다

문서 키는 문서 표면에, 크롬 키는 그 UI 의 요소에. 그러면 *지금 어디에 있나* 를 물을 필요가
없어진다 — **DOM 이 이미 답한다.**

`window` 는 붙일 요소가 정말 없을 때만 쓴다: 발표 모드(화면 전체가 그 모드다), 발표자 창(다른
창이다). 그때도 **그 모드가 켜져 있는 동안만** 붙인다.

재본 것: 앱이 손으로 듣는 keydown 열셋 중 **셋이 문서 키**이고(전부 `apps/slide/src/app.tsx`:
`SLIDES_KEYS` 의 view 절반 · ⌘Z/⇧⌘Z · PageUp/PageDown) 열은 크롬·모드 지역이다. 그 셋이 규칙 4의
이주 대상이다.

**그리고 앱 밖에 하나가 더 있다.** slides 의 `SLIDES_KEYS` 디스패처는 **둘로 쪼개져 있다** —
`view` 절반은 앱(`app.tsx:987-1012`, `window`, 버블), `command` 절반은 패키지
(`office-slides/src/overlay.tsx:2259-2414`, `window`, **캡처**). 한 목록을 두 곳에서 돌리고 있고,
*크롬 입력칸인가* 를 한쪽은 `document.activeElement` 로 다른 쪽은 `event.target.closest(…)` 로
묻는다. **같은 질문의 답이 둘이면 언젠가 갈린다** — 이 저장소가 계속 찾는 모양이다.

덱 전체로는 `window` keydown 리스너가 **여덟** 살아 있다(위 둘 + 크롭 Escape · 텍스트 편집
Escape · Space 팬 · 발표 모드 · 발표자 창 · PageUp/PageDown).

## 지금 어긋나 있는 곳 — 잰 것

| 제품 | 제품 키 | 인쇄 목록 | 도는 방법 | 앱의 손 keydown |
|---|---|---|---|---|
| word | `WORD_KEYBINDINGS` 49 | `WORD_KEYS` 55(파생) | **레지스트리** | 8 (전부 크롬) |
| note | `NOTE_KEYBINDINGS` 2 | 없음 | **레지스트리** | **0** |
| slides | 없음 | `SLIDES_KEYS` 24 (명령 22 · view 2) | **호스트 디스패처 둘** | 3 (app.tsx) |
| site | 없음 | `SITE_KEYS` 26 (명령 20 · view 6) | **호스트 디스패처** | 3 |

**둘 대 둘이다.** `office-controls/test/keybindings-spec-numbers.test.ts` 가 이 숫자들을 코드에서
다시 센다.

> **이 표의 숫자 하나가 틀려 있었다.** 앞 판은 site 를 *"`SITE_KEYS` 5"* 라고 적었다. 5는 `view`
> 항목의 수이고 전체는 **25, 그중 명령이 20**이다. 그 위에 *"site 는 문서 키 0이므로 slides 보다
> 작은 이주"* 라는 **순서 결정**이 얹혀 있었다 — 실제로는 site 가 slides 보다 **크다**. 숫자를
> 붙잡는 것이 없으면 결정이 조용히 틀린다(`docs/specs/agents.md`).

## 결정이 필요하다 — 두 갈래

기준(규칙 4)은 *선언은 레지스트리로 간다* 이지만, **그 값이 얼마인지는 재기 전에는 주장이었다.**
아래가 잰 것이다. 고르는 것은 사람이다.

공통으로 참인 것 셋 — 어느 쪽을 골라도 바뀌지 않는다:

- **엔진 마흔은 이미 네 제품에서 다 돈다.** 이 결정은 *제품이 자기 키를 어디에 적는가* 하나다.
- **인쇄 목록은 이미 파생이다.** `taughtKeys` 가 두 모양을 합쳐서 메뉴에 준다 — 메뉴의 정직함은
  이 결정에 걸려 있지 않다.
- **미등록 명령은 0이다.** slides 13 · site 12 고유 명령이 전부 `registerCommand` 된다.

### 갈래 A — 레지스트리가 유일한 디스패처

slides·site 의 `KeyModel` 명령 항목을 `Keybinding[]` 으로 옮기고, 앱의 디스패처를 지운다.

**어디가 바뀌나**

| 무엇 | 어디 | 크기 |
|---|---|---|
| 지우는 것 | `apps/slide/src/app.tsx` 987–1012 (view 절반) | 26줄 |
| | `office-slides/src/overlay.tsx` 2259–2414 (command 절반) | 156줄 |
| | `apps/site/src/app.tsx` 1010–1130 + `elsewhere()` 987–1008 | 143줄 |
| 옮기는 것 | `SLIDES_KEYS` 의 명령 22 → 문서 키 20 + 엔진 재진술 2 | |
| | `SITE_KEYS` 의 명령 20 | |
| 남는 것 | `view` 7(slides 2 · site 5) — 크롬 키다. 앱에 남되 `window` 대신 뿌리 요소에 | |
| 새로 필요한 것 | 무대와 오버레이만 감싸는 요소(아래) · site 의 `mode` 맥락 하나 | |

**무엇이 따라오나**

- **크롬 입력칸 질문이 사라진다.** 지금 그 질문이 **세 군데에서 서로 다르게** 물어진다:
  `apps/slide` 는 `document.activeElement` 의 `tagName`, `overlay.tsx` 는
  `event.target.closest('input, textarea, …')`, `apps/site` 는 22줄짜리 `elsewhere()` + `fieldKeeps`.
  문서 표면에 붙이면 셋 다 필요 없다 — 사이드바는 그 밖이다.
- **`needsSelection` 31개(slides 15 · site 16)가 공짜가 된다.** `selectionType == 'node'` 는 내장
  맥락이고 문법도 검사도 이미 있다. 지금은 그 규칙이 `keymap.ts` 와 앱 양쪽에 두 번 적혀 있다
  (`apps/site/src/app.tsx:1098`, `overlay.tsx:2366`).
- **site 의 `mode` 는 공짜가 아니다.** `SiteKey` 는 `mode` 를 **필수 필드**로 만들고 26개 전부가
  그것을 쓴다(`select` 18 · `any` 7). 엔진에 대응하는 내장 맥락이 없으므로 **새 맥락 하나**를
  세워야 하고, 그것이 이 갈래의 유일한 새 `setContext` 다. slides 는 `mode` 를 안 쓴다(0).
- **`needs: 'page'` 둘**(site 의 `pasteBlocks` · `selectAllBlocks`)도 같은 자리에 온다.
- **오버레이만 아는 것 하나:** `parentId: inside ?? slideSid`. `Keybinding.args` 는 정적이라 못
  싣는다. 실제로 읽는 명령이 **하나(`pasteBoxes`)** 이므로 오버레이가 맥락으로 세우고 명령이
  거기서 읽는다.
- **무대를 그대로 건넬 수 없다.** `<Stage>`(app.tsx:2018)와 `<SelectionOverlay>`(2085)는
  **형제**이고 공통 조상은 `.sl-main`(1883–2121)인데 그 안에 **`NotesPane`(2118)** 이 있다 —
  발표자 노트는 *두 번째 `EditorViewDOM`* 이다. `.sl-main` 을 표면으로 삼으면 노트에 타이핑하는
  키가 덱의 문서 키로 읽힌다. **둘만 감싸는 요소가 필요하고 그것이 레이아웃 변경**이다(407개
  브라우저 검사가 걸린다). 다만 `Stage` 가 `frame={stage}`, `SelectionOverlay` 가 `host={stage}`
  로 **이미 같은 ref 를 공유하므로** 그 요소를 표면으로 쓸 여지도 있다 — 재보지 않았다.
- **순서가 있다.** 엔진 재진술 둘(⌘Z·⌘⇧Z)은 `keySurface` 이주 **뒤에** 걷어야 한다. 먼저 걷으면
  도형을 고른 채 누르는 ⌘Z 가 죽는다 — 그 자리에서 엔진이 아직 못 듣기 때문이다.
- **`editorFocus` 를 못 쓴다.** 이주하는 바인딩은 `selectionType` 과 제품 맥락으로만 묻는다.
  아래 절이 그 이유이고, 그것이 **이 갈래의 미해결 항목**이다.
- **`office-slides` 에는 keymap 전용 검사가 없다** — 메뉴·컨텍스트메뉴 검사에 얹혀 있다. 옮기면
  `no-product-restates-an-engine-key` 와 `document-keys-gate-on-editable` 이 그 둘에도 걸린다.
  **지금은 안 걸린다**(그 둘은 `Keybinding[]` 을 읽는다). 그것이 이 갈래가 사 오는 것이다.

### 갈래 B — 데이터 목록을 유지하고, 디스패처를 **하나로** 만든다

`KeyModel` + 호스트 디스패치를 그대로 두되, 잰 결함 둘만 고친다: 같은 질문을 서로 다르게 묻는
디스패처 셋과, 앱마다 다시 구현된 `needsSelection`.

**어디가 바뀌나**

| 무엇 | 어디 | 크기 |
|---|---|---|
| 더하는 것 | `office-controls/src/keys.ts` 에 공용 디스패처 하나 — 매칭 · 입력칸 질문 · `needsSelection` · `preventDefault` | 새 함수 하나 |
| 지우는 것 | slides 의 디스패처 **둘**을 그것의 호출로 | 182줄 → 두 자릿수 |
| | site 의 `elsewhere()` + 손 매칭 | 143줄 → 두 자릿수 |
| 안 바뀌는 것 | 레이아웃 · `keySurface` · 맥락 · `Keybinding` | **0** |

**무엇이 따라오나**

- **407개 브라우저 검사가 안 걸린다.** 요소를 하나도 안 옮긴다. 이 갈래의 가장 큰 값이 이것이다.
- **입력칸 질문이 한 곳으로 모인다** — 지금 셋인 것이 하나가 된다. 다만 **사라지지는 않는다**:
  `window`/`document` 에 붙는 한 물어야 한다.
- **규칙 4의 절반이 계속 깨져 있다.** 한 키의 뜻이 **두 종류의 파일**에 산다(`Keybinding` ·
  `KeyModel`). 새 제품을 만드는 사람이 *어디에 적나* 에 답이 둘이다 — 이 문서가 없애려던 것이 그
  질문이다.
- **`when` 을 영원히 못 쓴다.** slides·site 는 엔진 맥락을 하나도 안 세우고(`setContext` 0)
  세울 이유도 안 생긴다. `Tab` 이 자리마다 다른 뜻인 Word 식 갈래는 이쪽에서 만들 수 없다.
- **한 문서에 디스패처가 둘로 남는다.** 엔진의 keydown 은 콘텐츠 층에 계속 붙어 있으므로(텍스트
  상자 안의 ⌘B 는 그것이 답한다) 제품 키는 밖, 엔진 키는 안 — **두 자리가 그대로다.**
- **검사는 지금 것을 유지한다.** `keyFaults` 가 이미 명령 실재·배타성·중복을 잡는다. 편집 가드
  (`editorEditable`)와 엔진 재진술 검사는 **계속 안 걸린다.**

### 두 갈래가 실제로 묻는 것

**A 는 레이아웃 하나(무대 감싸기)와 맥락 둘(site 의 `mode`, 덱의 `parentId`)을 사서 *한 자리*를
얻는다. B 는 아무것도 안 사고 *세 자리를 한 자리로* 줄이되, 두 종류의 선언을 영구화한다.**

그리고 A 를 고르면 **먼저 해야 할 것이 하나 더 있다** — 다음 절이다.

## `editorFocus` 가 뜻하지 않는 것

**`editorFocus` 는 *읽는 사람이 이 문서를 만지고 있다* 가 아니라 *콘텐츠 층에 초점이 있다* 를
뜻한다.** 이름이 그렇게 안 읽히는 것이 이 항목의 전부다.

재본 것(`office-word/test/editor-focus-is-about-the-content-layer.test.ts`, 밀리초에 답한다):

| 무엇을 했나 | `editorFocus` |
|---|---|
| 처음 | `false` |
| 콘텐츠 층에 `focus` | **`true`** |
| 콘텐츠 층에 `blur` | `false` |
| **문서 표면**(콘텐츠 층을 담고 있는 바깥 요소)에 `focus` | **`false`** |

세우는 자리가 `contentEditableElement` 의 `focus`/`blur` 하나뿐이고(`editor-view-dom.ts:581-582`
→ `editor:selection.focus` → `editor.ts:1528`), **`focus` 는 버블하지 않는다.** 그러므로 바깥
요소가 초점을 받는 것을 그 리스너는 볼 수 없다.

**그때 무슨 일이 나나:** `keySurface` 가 넓으면 keydown 은 도착한다. 그리고 Word 의 바인딩
**쉰넷 전부가 `editorFocus` 를 걸므로 그 자리에서 도는 것은 0이다.** 같은 검사가 실제로 세 봤다 —
`evaluateWhenExpression` 을 쉰넷에 돌려서 0. **키가 안 잡히는 것과 잡히고 죽는 것은 화면에서 구분이
안 된다.**

Word·note 가 지금 멀쩡한 이유는 하나뿐이다: `.w-canvas` 가 콘텐츠 층 **안**이라 두 표면이 우연히
같다. **우연이 이름에 안 적혀 있다.**

**고치는 방법과 그 크기.** `focus`/`blur` 를 `focusin`/`focusout` 으로 바꾸고 `keySurface` 에
붙인다 — 그 둘은 버블하므로 표면 안 어디서 초점이 움직여도 도착한다(같은 검사가 그 사실을 못
박는다: `focus` 0회 · `focusin` 1회). 고칠 자리는 `editor-view-dom` 이고 1,056개 브라우저 검사가
걸린 변경이라 따로 잰다.

**그때까지의 규칙:** 문서 표면이 콘텐츠 층보다 넓은 제품의 바인딩은 **`editorFocus` 를 쓰지
않는다.** `selectionType` 과 제품 맥락으로만 묻는다.

## 제품에 없는 명령 — *"지원 항목이 다르다"* 가 실제로 어떻게 되나

엔진이 묶은 키의 명령을 제품이 안 가질 수 있다. 재본 것:

| 제품 | 엔진 키의 명령 35 중 없는 것 |
|---|---|
| word · slides · site | 0 |
| **note** | **2** — `moveBlockUp` · `moveBlockDown` |

그때 무슨 일이 나는가: `executeCommand` 가 `console.warn('Command … not found')` 를 찍고 `false`
를 돌려준다. **키는 먹혔고(`preventDefault`) 아무 일도 안 난다.**

그리고 note 는 **블록을 옮길 수 있다** — 그립을 끌면 된다(`moveNoteBlockTo`). 기능이 없는 것이
아니라 **그 이름의 명령이 없어서 키가 안 닿는 것**이다. 그러므로 답은 둘 중 하나이고, 둘 다
정당하다:

1. **제품이 그 이름으로 명령을 등록한다** — 기능이 있으면 이쪽이다. note 가 여기 해당한다.
2. **제품이 그 키를 내려놓는다** — 기능이 정말 없으면. 그러려면 레지스트리에 *이 키는 이 제품에
   없다* 를 말하는 방법이 필요하고, 지금은 없다.

**기준:** 기능이 있으면 1번이다. 2번이 필요해지는 날 레지스트리에 그 방법을 더한다 — 그전에
더하면 1번이어야 할 것이 2번으로 도망간다.

## 새 제품이 키를 놓는 순서

1. **아무것도 안 적는다.** 엔진 마흔이 이미 돈다 — ⌘B, Enter, 화살표, undo.
2. 엔진 키의 명령 중 **제품에 없는 것**을 센다. 기능이 있으면 그 이름으로 등록한다.
3. 이 제품만의 키를 `<제품>_KEYBINDINGS` 에 적는다. 문서를 바꾸는 것에는 `editorEditable` 을 건다.
4. 같은 키가 자리마다 다른 뜻이면 **`when` 으로 가른다.** 그 조건을 세우는 `setContext` 를 명령
   옆에 둔다.
5. 인쇄 목록은 3번에서 **파생한다.** 손으로 두 번 적지 않는다.
6. 화면에만 남는 키는 앱에, **자기 요소에** 붙인다.

## 이 문서를 붙잡는 검사

`docs/specs/agents.md`: *"붙잡히지 않은 주장은 주장일 뿐이다."* 이 문서의 어느 줄을 무엇이
붙잡는지.

| 이 문서의 주장 | 붙잡는 검사 |
|---|---|
| 규칙 1 — 제품이 엔진 키를 다시 안 적는다 | `office-controls/test/no-product-restates-an-engine-key.test.ts` |
| 규칙 3 — 문서 키는 `editorEditable` 을 건다 | `office-controls/test/document-keys-gate-on-editable.test.ts` |
| 규칙 5 — 인쇄되는 것은 도는 것에서 나온다 | `office-controls/test/every-menu-teaches-what-is-bound.test.ts` · `office-word/test/menu-teaches-every-key.test.ts` |
| 표면이 둘이다 — `keySurface` | `editor-view-dom/test/core/key-surface.test.ts` |
| `editorFocus` 는 콘텐츠 층에 대한 사실이다 | `office-word/test/editor-focus-is-about-the-content-layer.test.ts` |
| **이 문서의 숫자들** | `office-controls/test/keybindings-spec-numbers.test.ts` |

마지막 줄이 이번에 더해졌다. **없는 동안 이 문서가 site 를 5라고 적고 있었고, 그 5 위에 순서
결정이 얹혀 있었다.**
