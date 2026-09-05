# 구조 — 무엇이 무엇 위에 서 있나

**이 문서의 그림은 그린 것이 아니라 잰 것이다.** 층은 `package.json` 의 `dependencies` 에서
계산했고(`@barocss/*` 만), 숫자는 세었다. 그리는 것과 재는 것이 다르면 재는 쪽이 맞다 —
`conformance/dependency-graph.test.ts` 가 그 사실을 지킨다.

마지막 측정: **2026-09-05 · 패키지 29 · 층 7 · 순환 0 · 제품→제품 0**

## 두 축으로 읽는다 — **깊이**와 **종류**

**깊이는 종류가 아니다.** 깊이는 *내가 의존하는 것 중 가장 깊은 것 + 1* 이므로, 층 4 위에 서면
제품이든 부품이든 **똑같이 5** 다. 그래서 이 표는 두 축이다: 깊이는 **계산된 것**, 종류는
**선언된 것**.

| 깊이 | 바탕 | 부품 | 제품 |
|---|---|---|---|
| **0** | `shared` `schema` `dsl` `dom-observer` `text-analyzer` `conformance` | `office-icons` | |
| **1** | `datastore` `renderer-dom` `renderer-react` | `office-ui` | |
| **2** | `model` `converter` `collaboration` | | |
| **3** | `editor-core` `collaboration-*` | | |
| **4** | `editor-view-dom` `editor-view-react` `extensions` `devtool` | `office-controls` `office-text` `office-canvas` | |
| **5** | | `office-editor-ui` | `office-word` |
| **6** | | | `office-note` · `office-site` · `office-slides` |

`office-editor-ui`(270줄: `use-controls`·`use-selection-rect`·`revision`)가 `office-word` 와 같은
깊이인 것은 **둘 다 층 4 위에 서기 때문**이지 둘이 같은 종류라서가 아니다. 부품이 뷰를 쓰면 제품과
깊이가 같아진다 — 그건 피할 수 없고, 그래서 종류를 따로 적는다.

그리고 그 부품을 **패키지에서** 쓰는 제품은 6이 된다. **이제 셋이다.** `office-note` 가 먼저였고,
`office-site` 와 `office-slides` 가 셸을 옮기면서 따라왔다 — 셋 다 `Controls`·`SlashMenu`·
`useEditorRevision` 을 앱이 아니라 **패키지에서** 쓴다. 넷째(`office-word`)가 5에 남아 있는 이유는
하나뿐이다: 그 셸이 아직 `apps/word` 에 있다.

**그러니 깊이 6은 뒤처짐이 아니라 영수증이다** — 아래로 한 겹 더 재사용했다는.

## 규칙: **제품은 제품에 의존하지 않는다**

기능이 같은 것과 **의존하는 것은 다르다.** 두 제품이 표를 그린다면 표는 아래층의 것이고, 한쪽이
다른 쪽에서 가져오는 것이 아니다.

**왜 이것이 규칙인가 — 재서 나온 이유 셋:**

1. **다섯째 제품이 사슬 어디에 끼는지가 매번 질문이 된다.** `office-site` 가 `office-note` 를
   의존하면, 새 제품은 *나는 site 위인가 아래인가* 를 물어야 하고 그 답은 임의적이다. 형제끼리는
   그 질문이 없다.
2. **빌린 쪽이 빌려준 쪽의 결정에 묶인다.** `office-word` 가 `frameCss` 를 바꾸면 `office-site` 가
   따라 바뀐다 — 사이트 빌더가 워드의 판단에 묶일 이유가 없다.
3. **아래로 안 내려간 것은 셋째 제품에서 다시 발명된다.** 이 저장소가 매 회차 찾는 모양이 그것이다.
   `installCellSelection` 379줄이 `office-word` 안에 갇혀 **표를 가진 넷 중 둘만 닿았다.**

**그러므로 두 제품이 같은 것을 원하면, 그것은 부품으로 내려간다** — `office-text`(글의 낱말),
`office-canvas`(그림의 낱말), `office-controls`(제품 UI 모델), `office-ui`(순수 UI).

`conformance` 가 이것을 센다: 제품 → 제품 변은 **0** 이어야 한다.

## 넷이 형제가 아니다 — 그리고 원인은 변 셋이다

제품 넷이 **5·6·6·7** 에 흩어져 있다. 제품이 제품을 의존하기 때문이고, 재보니 그 변이 **셋뿐이며
각각 심볼 하나**다:

| 변 | 무엇 | 어디로 가야 하나 |
|---|---|---|
| `office-slides` → `office-word` | `createWordTables` | **`office-text`** — 표는 글의 낱말이다 |
| `office-site` → `office-word` | `frameCss` | **`office-canvas`** — 프레임은 캔버스의 것이다 |
| `office-site` → `office-note` | `NOTE_CONTENT` | **`office-text`** — *쓰인 몸이 무엇으로 이루어지나* 는 note 의 것이 아니라 **글** 의 것이다 |

셋째는 `site-schema.ts` 가 스스로 적어 뒀다 — *"그 논증은 이제 `office-note` 에 산다"*. 그때는
맞는 이동이었다: 두 번째 철자를 만들지 않으려는 것이었다. 그런데 **읽는 쪽이 둘이 되면 그 선언은
둘 중 하나의 것이 아니라 아래층의 것**이다.

걷어내면 계산이 이렇게 바뀐다:

```
office-word    5 → 5
office-slides  6 → 5     ← 형제가 된다
office-site    7 → 5     ← 형제가 된다
office-note    6 → 6
최대 깊이       7 → 6
```

### 그런데 **깊이는 제품의 서열이 아니다**

넷을 5·6·6·6 으로 적으면 word 가 위에 있는 것처럼 읽힌다. 아니다. **깊이는 *내 아래에 패키지가
몇 겹인가* 이고, 그건 재사용의 양이지 제품의 지위가 아니다.**

셋이 6인 이유는 하나다: `office-editor-ui`(부품, 5)를 **패키지에서** 쓴다 —
`Controls` · `SlashMenu` · `useEditorRevision`. 남은 하나는 **같은 것을 앱에서** 쓴다:

```
apps/word  →  @barocss/office-editor-ui
```

**즉 6은 아래가 아니라 앞서 있다는 영수증이다** — 자기 셸을 패키지로 옮겼고, 그래서 부품을 한 겹 더
재사용한다. word 가 셸을 옮기면 **그것도 6이 된다.**

그 깊이를 심볼을 옮겨서 줄일 수는 없다. 재본 사슬이 전부 값 의존이다:

```
shared(0) → datastore(1) → model(2) → editor-core(3) → office-controls(4)
          → office-editor-ui(5) → office-note(6)
```

`office-controls` 는 `markAttribute`·`markState` 를 값으로 쓰고, `office-editor-ui` 는
`office-controls` 를 값으로 쓴다. **부품이 부품 위에 서면 제품과 깊이가 겹치거나 넘어선다** — 그건
그래프의 성질이지 결함이 아니다.

**목표 상태: 바탕·부품 0–5, 제품 **넷 다 6**, 형제.**

## 층은 선언이 아니라 결과다

어떤 패키지의 깊이는 계산된다. 그러므로 **새 의존을 하나 더하면 깊이가 저절로 바뀌고**, 제품이
제품을 의존하는 순간 형제 관계가 깨진다. `conformance/dependency-graph.test.ts` 가 순환을 막지만
*형제여야 할 것이 형제인가* 는 아직 아무도 안 센다.

## 네 제품이 같은 것 위에 선다

```
standard-schema                    ← document · paragraph · inline-text · marks
      ↓  getStandardSchemaDefinition()
office-schema                      ← surface 로 뿌리를 바꾸고, 표준 노드를 하나하나 정산한다
      ↓  getOfficeSchemaDefinition()
   ┌──┴───────────┬──────────────┬───────────────┐
word-schema   slides-schema   site-schema   note-schema
```

`getOfficeSchemaDefinition()` 은 표준 노드를 **하나도 빠뜨리지 않게 강제한다** — 어느 목록에도 없는
이름이 있으면 던진다. 표준 스키마에 노드를 더하면 office 가 *취한다/안 취한다* 를 말할 때까지 실패한다.

그리고 편집기도 하나다:

```
Editor  ←  ProductEditorOptions { kit?, keybindings?, …EditorOptions }
              ↑              ↑              ↑              ↑
        createWordEditor  createSlidesEditor  createSiteEditor  createNoteEditor
```

`DEFAULT_KEYBINDINGS` **마흔**이 그 문을 지나는 모든 편집기에 실린다 — ⌘B·⌘Z·Enter·화살표.
제품은 그 위에 자기 것을 얹는다(`docs/specs/keybindings.md`).

## 셸을 제품으로 옮길 때 — **뷰는 별도 진입점**

`office-note` 가 그 모양을 이미 갖고 있고, `office-site` 가 첫 조각(`PageFrame`)을 옮기면서 왜
그런지를 값을 치르고 배웠다.

```json
"exports": {
  ".":      "./src/index.ts",        // 모델 — 어디서나 읽힌다
  "./view": "./src/page-frame.tsx"   // React 뷰 — React 가 있는 곳에서만
}
```

**루트에 React 뷰를 두면 모델만 원하는 쪽이 DOM 까지 끌고 온다.** 재본 것:
`apps/site/tests/site.spec.ts` 가 Node 에서 `siteControlsIn` 하나를 가져오는데, 루트가
`page-frame` 을 지나면 `editor-view-dom` 이 딸려 오고 Node 가 *Named export 'EditorViewDOM' not
found* 로 죽는다. **283개짜리 브라우저 회차 전체가 그것 하나로 안 돌았다.**

### 진입점은 **조각마다가 아니라 경계마다** 둔다

첫 두 조각은 `./view`(판)와 `./rail`(왼쪽 레일)로 하나씩 뒀다. 그건 조각이 둘일 때의 답이고,
셸 이주가 끝나면 사이트 빌더의 React 조각은 열 개쯤 된다 — 진입점 열 개는 경계가 아니라 목록이다.

**경계는 *React 가 필요한가* 이지 *어느 조각인가* 가 아니다.** 그래서 둘이면 된다:

```json
".":    "./src/index.ts"     // 모델 — Node 에서도 읽힌다
"./ui": "./src/ui.ts"        // React 부품 전부
```

조각이 늘어도 진입점이 안 늘고, 읽는 쪽이 *이건 어느 문인가* 를 안 물어도 된다.

그리고 그 사실을 **회차 스크립트가 잡았다** — 결과 줄이 없는 앱을 *(결과 줄 없음)* 으로 적고
요약에 세운다. 앞 판이었으면 `site` 줄이 통째로 없는 채 초록으로 읽혔을 것이다.

**React 는 peerDependency 다.** 어느 React 를 쓸지는 호스트가 정한다.

### 그리고 **제품끼리의 조립은 슬롯으로** 한다

셸을 옮기다 보면 *두 제품을 함께 쓰는 조각* 이 나온다. `apps/site/src/data-editor.tsx` 가 그렇다 —
사이트의 데이터 행이 서식 있는 본문을 갖고, 그것을 `office-note` 의 `NoteEditor` 로 편집한다.

그대로 옮기면 **`office-site` 가 `office-note` 를 의존하게 된다** — 방금 걷어낸 그 변이다.

**답은 이미 옮긴 코드 안에 있다.** `PageFrameProps` 가 그 모양을 쓴다:

```ts
/** 판 위에 무엇이 그려지나 — 포인터의 주인이거나, 아무것도 아니거나. */
overlay?: (host: React.RefObject<HTMLDivElement | null>) => React.ReactNode;
```

**제품은 슬롯을 선언하고, 앱이 채운다.** 사이트는 *행의 본문을 그릴 무언가* 가 필요하다고 말하고,
그것이 노트인지 텍스트 상자인지는 **앱이 정한다.** 그러면 조각은 제품으로 가고 조립은 앱에 남는다 —
그리고 그게 앱이 하는 일이다.

## 어디에 무엇이 사는가 — 찾는 사람을 위해

| 질문 | 어디 |
|---|---|
| 문서에 무엇이 들어갈 수 있나 | `schema` |
| 문서를 어떻게 담나 | `datastore` |
| 문서를 어떻게 바꾸나 | `model` — 연산마다 역이 있다 |
| 화면에 어떻게 그리나 | `dsl` → `renderer-dom` · `renderer-react` |
| 캐럿·선택·명령·역사·키 | `editor-core` |
| DOM 의 한 점 ↔ 모델의 한 점 | `shared/text-position` (`specs/text-position.md`) |
| 키를 어느 층이 갖나 | `specs/keybindings.md` |
| 글의 낱말 (문단·표·주석) | `office-text` |
| 그림의 낱말 (도형·프레임·좌표) | `office-canvas` |
| 제품이 공유하는 UI 부품 | `office-ui`(순수 UI) · `office-controls`(모델) · `office-icons` |

## 그래서 제대로 가고 있나 — 재서 본 것

| 질문 | 답 | 근거 |
|---|---|---|
| 그래프가 DAG 인가 | **예** | 순환 0, `dependency-graph.test.ts` 가 지킨다 |
| 스키마 하나가 넷을 담나 | **예** | 넷이 `getOfficeSchemaDefinition()` 위에 서고, 정산이 강제된다 |
| 제품 계약이 있나 | **예, 이제** | `ProductEditorOptions`. 없던 동안 넷째가 벗어나 있었다 |
| 기본 키가 공유되나 | **예** | 엔진 마흔, 모든 제품 |
| 셸이 제품에 있나 | **셋은 예, 워드는 아니오** | 앱에 남은 `.ts`/`.tsx`: note 257 · slide **2,520**(조립 2,360 + 부트 160) · site 4,221 · **word 5,535**. slide 의 셸 **스물세 조각 16,449줄**이 `office-slides` 로 갔다 |
| 서비스 층이 있나 | **거의 없다** | 문서 목록·저장소·계정·권한이 0에 가깝다 |

## 아직 나뉘어 있는 것 — 2026-09-05 측정

같은 이름이 둘 이상의 패키지에 **선언된 것 61개**를 셌다(재내보내기는 안 센다). 그 중 값이
확인된 것:

| 이름 | 어디 | 무엇 |
|---|---|---|
| `DecoratorPosition` | `shared` · `renderer-dom` · `renderer-react` | **여섯 문자열의 동일한 유니온, 세 벌.** `shared` 가 이미 갖고 있다 |
| `DecoratorPosition` | `editor-view-dom` | **같은 이름, 다른 뜻** — `{top,left,width,height}` 사각형이다 |
| `MutationObserverManager` | `dom-observer` · `editor-view-dom` | **글자까지 같다.** 그리고 `editor-view-dom` 은 이미 `dom-observer` 를 의존한다 |
| `ClassifiedChange` · `ClassifyOptions` · `InputHint` | `editor-view-dom` · `editor-view-react` | 두 뷰 층 — 선택 층은 합쳤고 입력 층이 남았다 |
| `TextRun` | `shared` · `renderer-dom` · `renderer-react` | 확인 필요 — `shared` 의 것은 런 색인의 것이고 렌더러의 것은 마크가 붙은 조각일 수 있다 |
| `childrenOf` | `office-canvas` · `office-text` | 같은 이름, **다른 질문**(캔버스 노드 / 문서 노드). `office-slides` 것은 별칭이라 정당하다 |

**이 저장소가 매 회차 찾는 결함의 모양이 하나다 — *있는데 못 닿는다*.** 위의 목록은 그 앞 단계다:
있는데 **다시 적었다**. 둘은 같은 결함의 앞뒤이고, 다시 적힌 것은 반드시 갈라진다 — 이 회차에만
`ModelSelection` 다섯 벌, `isDecoratorElement` 네 벌, `ResolvedBoundaries` 두 벌(내가 만들었다),
`taughtKeys` 가 고친 반쪽 읽기 다섯 자리가 나왔다.

## 이 구조를 틀리게 만들 것

- **셸이 앱에 남는 것.** 35,927줄이 제품이 아니라 앱에 있으면, 새 제품은 그것을 다시 쓴다.
- **서비스 층이 비어 있는 것.** B2B 는 대부분 그 층이다.
