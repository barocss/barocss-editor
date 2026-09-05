# 선택 — range 와 block 은 어떻게 다른가

**한 줄로: `range` 는 두 지점 사이의 *글자*이고, `node` 는 *것들의 목록*이다.** 둘은 같은 필드에 담기고
서로 다른 질문에 답하며, 이 저장소가 이 해에 찾은 선택 관련 결함의 대부분은 둘 중 하나를 다른 하나로
읽은 것이었다.

## 네 가지 타입, 그리고 실제로 무엇을 뜻하나

`ModelSelection.type` 은 `'range' | 'node' | 'cell' | 'table'` 이다.

| 타입 | 무엇 | `startNodeId`/`endNodeId` | `nodeIds` |
|---|---|---|---|
| `range` | 두 지점 사이의 **글자** | 런의 sid, 오프셋이 뜻을 가짐 | 없음 |
| `node` | **고른 것들** — 그림, 도형, 카드 | 첫 노드가 두 자리에 들어감 | 목록 |
| `cell` | 표의 **칸 여럿** | 위와 같음 | 칸들 |
| `table` | 표 **전체** | 위와 같음 | 표 |

뒤의 셋은 *집합*이고 `selectedNodeIds()` 로 읽는다. `startNodeId`/`endOffset` 이 채워져 있어도 뜻이 없다
— 첫 노드를 넣어 둔 것이고, 그 자리에 오프셋 산수를 하면 아무 데도 아닌 곳을 가리킨다.

`selectedNodeIds()` 는 `range` 에 **빈 배열**을 돌려준다. 그게 이 함수의 요점이다: *무엇이 고려졌나* 를
묻는 코드가 `range` 를 만나면 답은 *아무 노드도* 이지 *두 개* 가 아니다.

## 규칙 하나: **명령은 자기가 다루는 종류를 물어야 한다**

```ts
// 틀림 — 노드 선택이 통과한다
canExecute: (ed) => !!ed.selection

// 맞음 — 글자를 지우는 명령은 range 만
canExecute: (ed, p) => hasRange(ed, p)
```

`packages/extensions/src/guards.ts` 의 `hasRange` 가 그것이고, 주석이 값을 치른 이야기를 담고 있다:
데크에서 도형을 하나 잡은 채로 서식 단추가 **켜지고, 눌리고, 아무 일도 안 일어났다**. 이 저장소가
*guard says yes, then does nothing* 이라 부르는 종류이고 세 번 기록됐다.

그리고 `hasRange` 는 두 가지를 묻는다:

```ts
hasRange(ed, payload)              // 'caret' — 캐럿이든 범위든, range 이기만 하면
hasRange(ed, payload, 'something') // 접힌 캐럿은 거부 — 고른 글자가 있어야 하는 명령
```

`toggleBold` 는 앞의 것이면 된다(캐럿에 마크를 걸어 두면 다음 글자가 그렇게 나온다). `deleteText` 는
뒤의 것이 필요하다.

## `range` 안에서 다시 둘로 갈린다 — 그리고 이게 비싼 쪽이었다

```
한 런 안        startNodeId === endNodeId, startOffset !== endOffset
블록을 가로질러  startNodeId !== endNodeId
```

**거의 모든 코드가 앞의 것만 상대로 쓰였다.** 2026-09-04 에 이 하나에서 결함 넷이 나왔고, 한 파일에
두 개도 없었다:

| 어디 | 무엇 |
|---|---|
| `extensions/delete.ts` + `text.ts` | *두 지점 사이를 지운다* 가 **세 벌**, 하는 일이 달랐다 |
| `extensions/text.ts` | *선택이 비었나* 를 **오프셋만** 비교 — 다른 블록의 같은 오프셋을 빈 것으로 읽음 |
| `datastore/range-operations.ts` | `toggleMark` 이 **양 끝만** 칠하고 사이를 안 돎 |
| `editor-view-dom/input-handler.ts` | 명령이 마크를 쓰면 뷰가 다시 그리고, MutationObserver 가 그 출력을 서식 제스처로 읽어 **되돌림** |

증상은 셋이었다 — 굵게가 마지막 문단만 빼먹고, Backspace 가 블록을 안 합치고, 타이핑이 선택을 안
지운다. 밖에서 보면 *selection 이 제대로 없다* 로 읽힌다. 안에서 보면 **선택은 정확히 만들어지고, 그것을
쓰는 것들이 전부 틀렸다.**

### 그리고 `Shift+→` 가 만드는 모양이 하나 더 있다

```
startNodeId !== endNodeId, 그리고 startOffset === 그 런의 길이
```

런의 **끝**에서 한 칸 더 가면 이렇게 된다. 첫 조각이 빈 범위(`[64, 64]`)이고 실제 글자는 전부 끝 런에
있다. 이 모양에서 굵게가 **아무 일도 안 했다** — 명령은 `true` 를 돌려주고, 모델은 마크를 오십 밀리초 동안
갖고 있다가 비었다.

원인은 앞의 네 번째와 같은 것이고 가드가 빗나간 것이었다: 명령이 `[0,5]` 를 칠하면 뷰가 다시 그리고,
MutationObserver 가 **런 전체**를 보고한다. *기존 마크가 보고된 범위를 덮는가* 로 물으면 `[0,5]` 는
`[0, len]` 을 안 덮으므로 통과하고, 토글이 마크를 도로 가져간다.

물어야 할 것은 하나다: **이 런이 이미 이 마크를 갖고 있는가.** 렌더의 출력은 모델이 방금 쓴 것을 다시
보고하는 것뿐이고, 이 편집기에서 마크는 명령이 쓴다.

### 그래서 검사는 둘을 따로 기다려야 한다

```ts
const rangeIn      = …  // startNodeId === endNodeId && startOffset !== endOffset
const crossRangeIn = …  // startNodeId !== endNodeId
```

`apps/note/tests/note.spec.ts` 에 둘 다 있다. 하나만 있던 동안 넷이 숨어 있었다 — **아무도 기다리지
않는 모양은 아무도 검사하지 않는 모양이다.**

### 그리고 단추 훑기는 선택의 모양마다 다시 해야 한다

*every button on the bar does what it says* 는 각 컨트롤을 **캐럿**에서 한 번씩 누른다. 쓰인 날 죽은
단추 다섯을 찾고 그 뒤로 아무것도 못 찾았다 — 캐럿은 모든 명령이 상대로 쓰인 그 하나이기 때문이다.

같은 훑기를 **블록을 가로지르는 범위**로 다시 돌리자 마크 넷 중 셋이 죽은 채로 나왔다. 그래서 이제
`shape(control)` 로 나눠 두 번 돈다.

세는 법에도 함정이 있다: 마크는 **하나씩 세야 한다.** 한 span 에 굵게와 기울임이 겹치면 원소 수는 그대로라,
합계로는 두 번째가 오는 것을 못 본다.

## 블록 선택은 제품마다 다른 낱말을 쓴다

같은 개념인데 이름이 셋이다. 옮길 때 헷갈리므로 적어 둔다.

| | 무엇을 고를 수 있나 | 무엇에 캐럿이 들어가나 |
|---|---|---|
| `office-site` | `SELECTABLE` | `TEXTUAL` |
| `office-note` | `NOTE_PICKED` | `NOTE_WRITTEN` |

규칙은 한 문장이다: **글자를 고치는 블록은 캐럿을 받고, 나머지는 가리킨다.** 그림·영상·임베드·구분선·
코드는 가리키는 것이고, 문단·제목·목록·인용은 캐럿을 받는다.

### 그리고 **둘 다인 것**이 하나 있다 — 표

`bTable` 은 하나로 잡히면서 안에서 쓴다. 이 둘이 다른 사실이라는 것을 알기까지 값을 치렀다: 표를 넣고
셀을 눌러 이름을 치고 Backspace 를 누르면 **표 전체가 사라졌다.** 잡혔다는 것과 글이 없다는 것을 하나로
다룬 결과다.

`office-note` 의 `holdsWriting()` 이 그 구분이고, 두 가지를 낳는다:

- 표를 누를 때 `preventDefault` 하지 않는다 — 캐럿이 셀로 들어가야 하니까.
- 잡힌 블록의 Backspace 가 표에는 듣지 않는다 — 그 키는 글자의 것이다.

## 캐럿이 갈 수 없는 곳은 갈 수 있는 곳이 아니다

같은 날 Word 에서 나온 두 결함이 이 한 문장이다:

- **숨은 칸.** 근호의 차수는 `m:degHide` 로 숨는데 Tab 은 계속 거기 섰다. 읽는 사람이 **3** 을 치면
  `display: none` 안으로 들어가 문서에는 있고 어느 페이지에도 없다. 고침은 CSS 가 아니라 `slotsOf` 에서
  숨은 칸을 빼는 것.
- **잠긴 영역.** `contentControl` 이 `lockContent` 를 선언하면 그 안은 `contenteditable="false"` 다.
  검사 둘이 거기 캐럿을 놓고 시작해서 *프레임에 타이핑이 안 된다* 로 실패했다. 제품이 옳았다.

두 경우 모두 **조상 사슬을 찍어야** 갈렸다:

```
P.w-paragraph < DIV.w-frame < DIV.w-content-control[ce=false] < …
```

## 여러 인스턴스에서

선택은 **인스턴스마다 하나**다. 열두 노트를 띄우고 재봤다: `document.activeElement` 는 하나뿐이고,
초점을 가진 몸통의 모델만 선택을 갖고 나머지 열하나는 `null` 이다. 모델은 DOM 을 정확히 따라가며, 하나일
때나 열둘일 때나 같다.

`apps/note/tests/note.spec.ts` 의 두 검사가 이것을 잡고 있다 — 한 몸통에 글자를 넣으면 그 몸통에만
들어가고(`....Y.......`), **블록을 가로지르는 범위**로 굵게와 Backspace 를 해도 나머지 열하나의 블록 수가
그대로다.

한동안 이것이 첫 번째 가설이었고 **아니었다**. 기록해 둔다: 선택 결함을 만나면 인스턴스를 먼저 의심할
이유가 없다.

## 경계가 요소일 때 — 뒤집힘의 원인 둘

`Shift+→` 로 블록을 넘어가면 모델 범위가 **뒤집혀** 나왔다(`:10` → `:6`, `direction` 은 `forward`,
DOM 선택은 비어 있음). 2026-09-04 에 고쳤고, 원인이 둘이었으며 **둘 다 *어느 쪽인가* 를 잘못된 것에게
물은 것**이다. 같은 실수를 다시 하지 않기 위해 적는다.

### 브라우저는 블록을 넘을 때 focus 를 요소에 둔다

문단 끝에서 `Shift+→` 를 한 번 더 누르면 `focusNode` 가 **텍스트 노드가 아니라** 다음 문단의 요소이고
`focusOffset` 은 `0` 이다 — *첫 자식 앞* 이라는 뜻이다. 여기서 나와야 하는 모델 오프셋은 `0` 이다.

**틀린 것 하나:** `convertOffsetWithRuns` 가 그 답을 `isEnd ? 런의 끝 : 런의 시작` 으로 정했다.
`isEnd` 는 *범위의 어느 쪽인가* 이고 *요소 안의 어디인가* 가 아니다 — 그건 `offset` 이 이미 말한다.
그래서 다음 문단의 맨 앞이 그 문단의 **끝**(28)이 됐고 범위는 `1:25 → 2:28` 이 됐다.

같은 함수의 비교도 틀렸다. `t.compareDocumentPosition(child)` 로 *`t` 가 경계 앞인가* 를 물었는데,
요소 오프셋 0의 자식이 런의 `<span>` 이고 텍스트 노드가 **그 안에** 있는 흔한 경우에 `FOLLOWING` 이
서지 않는다. 그래서 안에 있는 텍스트가 *앞* 으로 세어졌고 `firstAtOrAfter` 는 한 번도 정해지지 않았다.
`child` 쪽에서 물으면 포함이 `CONTAINED_BY | FOLLOWING` 이라 한 번에 답이 된다.

**지금의 규칙:** 경계가 어떤 런의 **앞**이면 그 런의 시작, 모든 런의 **뒤**면 마지막 런의 끝. `isEnd`
는 글자가 하나도 없는 그릇에서만 쓰인다 — 그때는 *요소 안의 어디* 라는 말 자체가 성립하지 않는다.

### 그리고 문서 순서를 sid 문자열로 정하고 있었다

**틀린 것 둘:** `fromDOMSelection` 의 기본 비교자가 `(a, b) => a.localeCompare(b)` 였다. sid 는
`note-c0huyw:9` 처럼 접두어와 숫자여서 자리수가 넘어가는 순간 사전순이 뒤집힌다 — `"9"` 가 `"11"`
보다 크다. 그 결과가 `startNodeId` 와 `endNodeId` 를 **맞바꾼다.** 서른세 번째 누름에서 모델이
`3:0 → 1:25` 이 됐고 `direction` 은 여전히 `forward` 였다.

기본값은 이제 **준 순서를 믿는 것**이다. 실제 호출자 셋은 모두 `range.startContainer` 와
`range.endContainer` 를 넘기고, DOM `Range` 의 두 끝은 정의상 문서 순서다. anchor/focus 를 넘기는
호출자는 `compareNodeOrder` 를 주면 되고, 그것이 그 인자가 있는 이유다. 문자열 비교로 돌아가지
않는다 — 모르는 채로 틀리게 정렬하는 것보다 준 대로 두는 것이 낫다.

### 왜 이게 두 번째 시도였나

첫 번째 시도는 `isTextContainer` 였다. 그 함수가 `data-text-container` 라는, **아무 렌더러도 쓰지
않는** 속성을 물어서 한 번도 참이 아니었고 — 그것도 사실이었고 고칠 값이 있었지만 — **이 결함의
원인은 아니었다.** 고치고 나서 로드맵에 *"원인을 찾아 고쳤다, 브라우저 확인은 남음"* 이라고 적었고,
확인해 보니 다섯 번째 누름에서 그대로 뒤집혔다.

*원인을 찾았다* 와 *고쳐졌다* 는 다른 문장이고, 그 사이를 잇는 것은 단정하는 검사뿐이다.
`apps/note/tests/selection.spec.ts` 가 지금 그 자리를 지킨다 — 예순 번을 누르며 매번 두 가지를 묻는다:
문서 순서로 시작이 끝보다 앞인가, 그리고 골랐다면 DOM 에 표시가 남는가.

## 선언은 하나다 — 그리고 사본은 어긋남을 **강제한다**

`ModelSelection` 이 **다섯 번, 두 패키지, 세 이름**으로 적혀 있었다.

| 어디 | 이름 | 무엇이 달랐나 |
|---|---|---|
| `editor-core/types.ts:53` | `ModelSelection` | 진짜 — `range \| node \| cell \| table`, `nodeIds?` |
| `editor-core/types.ts` | `NoSelection` · `Selection` | **아무도 안 썼다** |
| `editor-core/types.ts` | `ModelNodeSelection` | `{ nodeId, selectAll }` — **아무도 안 썼다** |
| `editor-view-react/types.ts` | `ModelSelection` | `none \| range \| node`, **`cell`·`table` 없음**, `nodeId` 단수 |
| `editor-view-react/selection-handler.ts` | `ModelSelection` | 위와 글자까지 같음 |
| `editor-view-react/input-handler.ts` | `ModelSelectionRange` | `range` 만, `direction` 없음 |

대가는 **React 경로로는 셀을 고를 수 없다** 였다. 모델은 `cell` 과 `table` 을 오래 전부터 갖고 있다.

### `nodeId` 의 출처

`ModelNodeSelection = { nodeId: string; selectAll: boolean }` 이 쓰이지 않은 채 남아 있었고, **두 뷰
층의 `convertNodeSelectionToDOM` 이 `nodeSelection.nodeId` 를 읽고 있었다** — 그 타입이 말하는 모양
그대로다. 구현은 다른 쪽으로 갔다: `createNodeSelection` 은 `nodeIds`(복수)를 세우고 `selectNode` 는
아예 `range` 를 만든다.

**의도를 적은 타입이 배선되지 않은 채 남고, 읽는 쪽이 그 의도를 향해 읽었다.** 그래서 그 분기는 한
번도 아무 일을 한 적이 없고, 하던 일은 *이전 DOM 선택을 그대로 두는 것* 이었다 — 도형을 고르면
직전의 글자 강조가 화면에 남는다. 그리고 `editor-view-dom` 쪽에서 `cell`·`table` 은
`console.warn('Unsupported selection type')` 으로 갔다. 브라우저에서 셌다: **셀 드래그 한 번에
경고 한 번.**

### 사본이 검사를 실제로부터 밀어냈다

`editor-view-react/test/selection-handler.test.ts` 에 이런 주석이 있었다:

> *"A node selection is a node and nothing else — the four range fields were here as well, which
> `convertNodeSelectionToDOM` never looks at. **The compiler said so** the first time it was allowed
> to read this file."*

그 컴파일러가 읽던 것은 이 패키지가 자기 손으로 선언한 좁은 사본이었다. 모델의 노드 선택은 두 끝을
**채워서** 준다 — 검사를 고치던 사람이 그걸 적었는데 사본이 *그런 필드는 없다* 고 해서 지웠다.
**사본은 어긋남을 못 잡은 것이 아니라 어긋남을 강제했다.**

교훈이 둘이다. 하나는 *같은 개념을 두 번 선언하지 않는다*. 둘은 **타입 오류를 없애는 방향으로 검사를
고치기 전에, 그 타입이 실제를 적은 것인지 묻는다.**

### 걷고 나서 타입 검사가 두 결함을 바로 찾았다

- `'none'` 은 `SelectionType` 이 아니다 — `convertDOMSelectionToModel` 이 `ModelSelection` 을
  돌려준다고 적고 `{ type: 'none' }` 을 돌려주고 있었다. 지금은 `MaybeSelection` 이다.
- `ModelSelection` 에 `nodeId` 가 없다 — 위의 죽은 분기를 컴파일러가 가리켰다.

### 그래서 DOM 으로 나가는 규칙 — 그리고 첫 판이 틀렸다

| 모델 | DOM |
|---|---|
| `range` | 그 범위를 세운다 |
| `cell` · `table` | **지운다** |
| `node` | **건드리지 않는다** |
| 없음 | 지운다 |

`cell` 은 *지원되지 않는* 것이 아니라 **DOM 이 말할 수 없는** 것이다. DOM 선택은 *여기서 저기까지*
하나만 표현한다. `installCellSelection` 은 이미 손으로 DOM 선택을 지우고 있었다 — 답이 그 파일에
있는데 뷰 층은 경고를 찍고 있었다.

**첫 판은 셋을 다 지웠고 브라우저가 반박했다.** 논거는 *집합에는 두 끝이 없으니 DOM 은 아무것도
말하지 않는다* 였고 그럴듯했다. 슬라이드 검사 **여덟 개**가 `range` 를 기대하고 `node` 를 받았다:
텍스트 상자를 더블클릭하면 첫 누름이 도형을 고르고(→ `node`) 둘째 누름이 안으로 들어가 캐럿을
놓는데, 첫 누름에서 DOM 선택을 지우면 그 길이 끊긴다.

그래서 구별은 *집합인가* 가 아니라 **그 선택을 만든 제스처가 글자 선택을 대신하려는 것인가** 다.

| 제스처 | 글자 선택을 | 그래서 |
|---|---|---|
| 셀을 가로질러 끌기 | **대신한다** — 일부러 걷어내고 셀 집합으로 바꾼다 | 지운다 |
| 도형을 고르기 | **가는 중일 수 있다** — 더블클릭의 첫 절반이다 | 건드리지 않는다 |

`node` 는 *이 도형이 골라졌다* 를 말할 뿐 *아무것도 타이핑되지 않는다* 를 말하지 않는다.

**남는 값:** 도형을 고른 뒤 직전의 글자 강조가 화면에 남을 수 있다. 그건 아직 잰 적 없는 불편이고,
재서 나오면 제품 쪽 제스처가 답할 일이다 — 추측으로 지우지 않는다.

**교훈:** 논거가 단정보다 앞서 있었다. *DOM 선택은 두 끝만 표현한다* 는 사실이고, *그러므로 집합일
때는 지워야 한다* 는 그 사실에서 따라오지 않는다. 사실과 결론 사이에 브라우저가 한 번 들어와야 했다.
그리고 내가 쓴 단위 검사도 같은 논거를 담고 있었으므로 **검사가 나를 막아 주지 못했다.**

되돌린 뒤 슬라이드 스위트는 **407/407** 이다 — 여덟 실패가 다 그 하나에서 왔다.

`conformance/test/one-selection-type.test.ts` 가 이제 하나임을 지킨다. **이름으로 세면 열아홉**이
나오고(`SelectionSummary`, `SelectionState`, `CellSelectionHandle` … 다 다른 것이다) **의미로 세면
열셋**이 나온다(연산의 payload 는 범위를 *받는다*). 둘을 겹쳐야 개념 자신만 남는다.

### 편집기의 문에서도 답이 둘이었다 — 걷었다

`Editor.updateSelection(selection: SelectionState | any)` 이었고 `EditorState.modelSelection` 은
`SelectionState | ModelSelection | null` 이었다. `SelectionState` 는 **DOM 스냅샷**(`anchorNode`,
`focusNode`, `textContent`)이고 `ModelSelection` 은 모델의 것인데, 둘 다 *선택* 이라는 이름으로 같은
문을 지났다.

**`SelectionState` 는 이제 없다.** 재보니 그 타입을 **만드는 곳이 하나도 없었다** — 넘기는 호출자 0,
구현하는 확장 0, 그것을 싣는 이벤트 0. `updateSelection` 은
`EditorSelectionModelPayload | null` 로, 확장 훅 둘은 `ModelSelection`/`MaybeSelection` 로,
`editor:selection.change` 는 `MaybeSelection` 로 좁혔고, `editor:selection.focus`·`.blur` 는 payload
자체가 없다(인자 없이 emit 된다). `SetSelectionCommand` 는 클래스째 지웠다.

지운 이유의 전문은 `packages/editor-core/src/types.ts` 에 있다. 요약하면 이 저장소가 되풀이하는
결함 — *의도를 적은 타입이 배선되지 않은 채 남고, 읽는 쪽이 그 의도를 향해 읽는다.* 읽고 있던 쪽은
`devtool.getSelectionInfo` 였고, 오지 않는 모양 둘(`nodeId`/`from`/`to` 와
`anchorNode`/`focusNode`)에 분기를 갖고 있었다. 그것도 같이 걷었다.

**문은 이제 하나다:** DOM 선택은 뷰 층이 `fromDOMSelection` 으로 모델 자리로 옮기고, 편집기의 문을
지나는 것은 `MaybeSelection` 뿐이다.

### 그리고 뷰 층이 두 벌이라 선택 고치기는 두 번씩 필요하다

`editor-view-dom/event-handlers/selection-handler.ts`(751줄)와
`editor-view-react/selection-handler.ts`(485줄)에 **같은 이름의 private 메서드가 열한 개** 있다:
`convertOffsetWithRuns` · `convertRangeSelectionToDOM` · `determineSelectionDirection` · `ensureRuns`
· `findBestContainer` · `findClosestDataNode` · `findDOMRangeFromModelOffset` ·
`getTextRunsForContainer` · `isDecoratorElement` · `isTextContainer` · `nodeExistsInModel`.

**그래서 이번 회차에 고친 두 결함이 React 판에 그대로 남아 있었다** — `data-text-container`(아무도
안 쓰는 속성)와 요소 경계의 `isEnd`/비교 방향. 즉 `Shift+→` 뒤집힘이 React 경로에는 살아 있었다.
이번에 같이 고쳤지만, **두 번 고쳐야 한다는 것이 결함이다.** 다음: 그 열한 개를 뽑아낼 것. 둘의
차이는 DOM 에 닿는 길(`_getScopeRoot`)과 런 색인의 출처뿐이다.

## 두 끝이 형제가 아닌 범위 — 어느 컨테이너가 살아남나

인용문 **안**에서 바깥 본문으로 걸친 범위는 지금 글자만 맞고 블록은 떨어진 채 둔다. `joinAcross` 가
두 블록의 부모가 다르면 아무것도 하지 않는다.

*어느 컨테이너가 살아남아야 하는가* 를 **추측 대신 적어 뒀다**고 기록해 뒀는데, 다시 읽으니 그 답은
이미 저 파일 안에 있다. 형제인 경우가 이렇게 되어 있다:

> **`first` 가 살아남고**, `last` 에 남은 자식들이 그 끝으로 옮겨 오고, 사이의 블록들은 사라진다.

그리고 그게 추측이 아닌 이유가 있다: **삭제가 끝난 뒤 캐럿은 삭제가 시작된 자리에 있다.** 그건 이미
정해진 것이므로, 캐럿을 담은 블록이 살아남아야 한다는 것도 정해진 것이다. 나머지가 살아남으면 캐럿이
없어진 블록 안에 있게 된다.

### 그래서 형제가 아닐 때의 규칙도 같다

1. **`first` 가 살아남는다** — 범위의 시작을 담은 블록. 캐럿이 그리로 간다.
2. 문서 순서로 두 블록 **사이에 온전히 들어간** 블록은 사라진다.
3. `last` 에 남은 자식들이 `first` 의 끝으로 옮겨 온다.
4. 그 결과 **비게 된 컨테이너**는 위로 올라가며 사라진다 — 인용문의 마지막 문단이 옮겨 갔으면
   인용문 자체가 남을 이유가 없다.

형제인 경우와 다른 것은 **2번뿐**이다. 형제일 때는 부모의 `content` 에서 두 색인 사이가 답이고,
형제가 아니면 문서 순서 훑기가 필요하다. 4번이 새로 생기는 것도 그 때문이다 — 형제일 때는 비는
컨테이너가 없다.

**즉 남은 일은 *결정* 이 아니라 *문서 순서 훑기* 다.** 그리고 그 훑기는 이 회차에 이미 한 번 필요했다:
`fromDOMSelection` 이 문서 순서를 sid 문자열로 정하고 있었던 것(위 참조). 두 자리가 같은 것을 필요로
한다면 그것이 있어야 할 자리는 모델 쪽이다.
