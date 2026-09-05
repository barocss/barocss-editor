# Barocss Suite — Roadmap

One document engine, several products. Three questions decide whether that is a
plan or a wish, and each is answered from what the repository actually contains
rather than from what it could contain. Every claim below has a measurement behind it; where
something is a guess it says so.

Kept beside [BACKLOG.md](./BACKLOG.md), which holds the next thing to do, and
[RETROSPECTIVE.md](./RETROSPECTIVE.md), which holds what building the first
product taught. This holds the reason there is a next thing.
[TECHNICAL-ROADMAP.md](./TECHNICAL-ROADMAP.md) holds the layer-by-layer version of the same thing.

---

## 한 눈에 — 어디로 가고, 무엇이 남았나 (2026-09-04)

**하나의 문서 엔진 위에 여러 제품.** 그게 계획인지 소원인지를 판단하는 근거는 지금 **다섯이 서 있다**는
것이다. 처음 이 문서가 적힐 때는 하나였다.

```
                     [ 어휘·부품 ]  office-text · office-canvas · office-controls · office-ui · office-icons
                            ↑
[ 바탕 ]  shared · dsl · schema  →  [ 문서 ]  datastore · model  →  [ 편집 ]  editor-core · editor-view-* · extensions
                            ↓
                     [ 제품 ]  word · slides · site · note        →  [ 앱 ]  각자의 셸
                            ↓
                     [ 서비스 ]  거의 비어 있다
```

### 공통 스키마 — 사슬을 재봤다 (2026-09-05)

*"우리는 공통 스키마를 기반으로 word, slide, note, site 를 만들고 있는 중"* — 그게 실제로 하나인지
읽어서 확인했다. **넷 다 `getOfficeSchemaDefinition()` 위에 선다:**

```
standard-schema                      ← document · paragraph · inline-text · marks. group 을 선언하는 곳
      ↓  getStandardSchemaDefinition()
office-schema                        ← surface 로 뿌리를 바꾸고, 표준 노드를 하나하나 taken/leaves-behind 로 정산
      ↓  getOfficeSchemaDefinition()
   ┌──┴───────────┬──────────────┬───────────────┐
word-schema   slides-schema   site-schema   note-schema
  +문서          +캔버스         +페이지·데이터    +NOTE_CONTENT (노드 3개)
```

그리고 `office-schema` 가 표준 노드를 **하나도 빠뜨리지 않게 강제한다**: 어느 목록에도 없는 이름이
있으면 `getOfficeSchemaDefinition()` 이 던진다 — *"office schema neither takes nor explains a
standard node"*. 표준 스키마에 노드를 더하면 **office 가 그것을 취하는지 아닌지 말할 때까지 실패**
한다. 조용히 사라지던 것을 그 검사가 막았다.

**그래서 §2 의 답이 근거를 갖는다.** 스키마가 담는다는 것은 추론이 아니라, 넷이 같은 함수 위에 서
있고 그 함수가 정산을 강제한다는 사실이다.

| 질문 | 답 | 근거 |
|---|---|---|
| 코어를 라이브러리로 열 수 있나 | **예** | 순환 0, DAG, 층 0~8. 그리고 **넷이 같은 코어 위에 섰다** |
| 스키마 하나가 여러 제품을 담나 | **예, 스키마는** | 노트가 **노드 3개**로 선다. 렌더러와 입력은 담지 않는다 |
| 각자 프로그램으로 낼 수 있나 | **예, 아직 셸이 앱에 있다** | 노트만 통과(앱 257줄). 나머지 셋은 35,927줄 |

**남은 큰 것 넷, 값이 다르다:**

1. **셸을 제품으로** — 35,927줄이 앱에 있다. 노트가 이미 통과했으니 방법은 증명됐고 크기가 남았다.
2. **서비스 층** — 문서 목록·저장소·계정·권한이 거의 0이다. **B2B 는 대부분 이 층이다.**
3. **Excel** — 다음 진짜 시험. 선택 종류 `cell` 이 표에서만이 아니라 그리드에서도 성립하는지, 그리고
   연산 하네스가 그리드를 가진 스키마에서 버티는지.
4. **캔버스(Figma)** — 벽은 렌더러가 아니라 **글자 셰이핑**이다. 글자를 DOM 오버레이로 올리는 시제품이
   며칠, 셰이핑 엔진은 달. **시제품으로 먼저 결정한다.**

**그리고 매 회차 반복해서 찾는 결함의 모양이 하나다 — *있는데 못 닿는다.*** 이번 회차만 해도:
`installCellSelection` 379줄이 Word 안에 갇혀 넷 중 둘만 닿았고, `editor-core` 의 `NoSelection` 이
선언된 채 두 파일이 그것을 다시 발명했고, 죽은 `ModelNodeSelection` 을 향해 두 뷰 층이 읽고 있었다.
**그래서 새 기능보다 먼저 묻는 질문이 늘 같다: 이미 있는데 닿지 못하는 것은 무엇인가.**

---

### React 갈래는 얼려 둔다 — 재고 정한 것 (2026-09-05)

*"editor-react 를 계속 개선하는 게 맞나, 아니면 제품 넷을 먼저 맞추는 게 맞나"* 를 재서 답했다.

**React 갈래는 끝에 제품이 없는 닫힌 고리다:**

```
renderer-react → editor-view-react → apps/editor-react
```

이 셋이 서로만 쓴다(그리고 `apps/docs-site` 하나). **제품 넷은 전부 `editor-view-dom`** 이다.

| | src | test() | 상태 |
|---|---|---|---|
| slide | 18,971줄 | 397 | 초록 |
| site | 11,409줄 | 283 | 초록 |
| word | 5,547줄 | 354 | 초록 |
| note | 257줄 | 22 | 초록 |
| **editor-react** | 666줄 | 14 | **3 실패 / 11** |

그 3 실패는 한 회차에만 그런 것이 아니라 **다섯 회차 전부 같은 셋**이었다 — IME 조합 둘과
`insertParagraph` 하나. **가장 기본적인 글자 동작 둘이 계속 빨갛고 아무 제품도 거기 안 걸려 있다.**
그리고 React 입력 층은 얇다: 931줄 대 DOM 2,015줄이고, 특히 **`insideLockedRegion` 이 없다** —
그 파일 자신이 *"키보드에만 버티는 잠금은 잠금이 아니다"* 라고 적어 둔 바로 그것이다.

**그래도 공짜였던 것은 아니다.** 이번 회차에 두 판을 대본 것이 결함 **다섯**을 찾았고 그 중 **넷이
제품 경로에 있었다.** 즉 React 의 값은 *제품* 이 아니라 **거울** 이었다. 그런데 자리 층을 `shared`
로 합쳤으므로 **그 거울은 이제 쓴 것**이다 — 그 층에서는 갈라질 수가 없다.

**정한 것 (사용자 결정):** *"일단 react 쪽은 보지 말고, 제품을 먼저 계속 진행하자. 제품을 더
만들어야 할 수도 있으니 제품이 안정화 되어야 해."*

그래서 이 절의 기준은 *React 를 어떻게 할까* 가 아니라 **제품 다섯째가 수술 없이 설 수 있나** 다.

1. `editor-view-react` 는 **컴파일과 단위 검사만 유지**하고 기능 동등성은 쫓지 않는다. 남은 값은
   *엔진이 DOM 에 묶이지 않았다* 는 컴파일 타임 증거뿐이고, 그건 싸게 유지되지만 키우면 비싸다.
2. **제품 넷이 먼저다.** 셸 **35,927줄이 아직 앱에 있고** 서비스 층이 거의 0이다.
3. `apps/editor-react` 의 3 실패는 **고치지 말고 기록한다** — 초록/빨강을 읽을 때의 잡음이다.

**접지 않고 얼려 두는 이유:** 접으면 `renderer-react` 도 같이 죽고, §1 의 *host 가 여럿* 이라는
주장이 근거를 잃는다. 캔버스(Figma) 시제품이 세 번째 host 후보이고, 그때 두 번째 host 가 있었던
자리가 값을 낸다.

---

## Where this actually stands

*Re-measured 2026-09-04. The table below was written when there was one product; there are four.*

**29개 패키지, 소스 175,315줄, 앱 9개** (2026-09-04 재측정). 크기가 아니라 모양이 중요하다:

| 층 | 패키지 | 무엇을 아나 |
|---|---|---|
| **바탕** | `shared`, `dsl`, `schema` | 위의 아무것도 |
| **문서** | `datastore`, `model` | 스키마 |
| **그리기** | `renderer-dom`, `renderer-react` | DSL |
| **편집** | `editor-core`, `editor-view-dom`, `editor-view-react`, `extensions`, `dom-observer`, `text-analyzer` | 문서와 렌더러 |
| **어휘·부품** | `office-canvas`, `office-text`, `office-icons`, `office-controls`, `office-ui` | 제품을 모른다 |
| **에디터를 아는 UI** | `office-editor-ui` | 에디터를 알고, 제품을 모른다 |
| **제품** | `office-word`, `office-slides`, `office-site`, `office-note` | 전부 |
| **서비스** | `collaboration` (+`-yjs`, `-liveblocks`), `converter`, `devtool`, `conformance` | 문서 |

두 층이 이 표에 없었다. `office-ui`(원시 부품, 에디터를 모름)와 `office-editor-ui`(선언을 읽어 표면으로,
에디터를 알고 제품을 모름) 사이의 구분이 이 저장소에서 가장 늦게 생긴 것이고, 그것이 없는 동안 세 개의
리본이 같은 다섯 단계를 각자 썼다. `docs/SHARED-LAYER.md` 가 그 층에 대한 문서다.

**아직 표대로가 아닌 것 (2026-09-04 재측정):**

- ~~**편집 층에 순환이 셋.**~~ **끝. 순환 0개, DAG, 층 0~8.** 검사가 지킨다
  (`conformance/test/dependency-graph.test.ts`). Phase 1 의 그 절을 보라 — 셋 중 둘이 유령이었다.
- **제품이 제품을 의존하는 변이 셋.** 아홉이었다가 여섯을 옮겼다. 남은 셋:

  | 변 | 무엇 | 판단 |
  |---|---|---|
  | `office-slides → office-word` | `createWordTables`(508줄) | 옮겨야 한다 |
  | `office-site → office-word` | `frameCss` | 옮겨야 한다 |
  | `office-site → office-note` | `NOTE_CONTENT` | **의도한 것** — *무엇을 담을 수 있나* 를 두 번 적지 않으려고 |

- **그리고 앱 층에도 교차가 있다** — 표에 없던 것이다. `apps/slide` 가 `@barocss/office-word` 에서
  `WORD_FONTS`·`WORD_FONT_SIZES`·`step`·`installCellSelection` 을 가져가고, `apps/site` 가
  `@barocss/office-note` 를 가져간다. `installCellSelection` 은 이번에 `office-text` 로 갔고 나머지는
  글꼴 목록과 찾기 도우미 — **Word 것이 아닌 것에 Word 이름이 붙어 있는 쪽**이다.
- **`ModelSelection` 이 셋 선언되어 있고 둘이 서로 다르다.** Phase 1 의 첫 단계가 *"`ModelSelection`
  을 아래로 내린다"* 였고 **하지 않았다** — 순환은 다른 방법으로 풀렸다. 그 미룬 값이 지금 보인다:
  `editor-view-react` 가 자기 것을 **두 번** 선언하고(`types.ts:19`, `selection-handler.ts:9`) 그 둘은
  `cell` 도 `table` 도 표현할 수 없으며 `node` 의 필드 이름도 다르다(`nodeId` 단수 vs `nodeIds`).
  게다가 `editor-core` 에는 `NoSelection` 과 `Selection = ModelSelection | NoSelection` 이 **이미
  있고 아무도 쓰지 않는다** — 두 파일이 그것을 각자 다시 발명했다.

Every package already declares `exports` and types, carries a version, and none
is `private`. Nothing structural stops them being published today.

---

## 1. Can the core be opened as a library?

**Structurally, yes — and closer than the manifests suggest.**

The dependency graph looks cyclic and mostly is not. Measured:

- `editor-core` declares `extensions` and `renderer-dom` as dependencies and
  **imports neither** — zero references in `src`. Two cycles that exist only in
  `package.json`.
- `model` imports from `editor-core` in eleven places. Eight are already
  `import type`. The other three — `SelectionManager` twice, `Editor` once —
  are **used only in type positions** and are missing the `type` keyword.

So the real cycle count is **zero**. What is left is a naming problem:
`ModelSelection` is a document concept that lives in the editing layer, and
`model` reaching up for it is what makes the graph read wrong.

### What "React-like" would mean here

React ships one idea — a component tree reconciled into a host — and lets a host
be a DOM, a canvas, a terminal. This repository already has that shape:

- `dsl` is the template language. Pure functions, no host.
- `renderer-dom` is one host. `renderer-react` is another.
- `schema` says what a document may contain; `datastore` holds it; `model` is
  the operations over it, each with an inverse.

The part that is *not* React-like is that `editor-core` assumes a text editor:
a caret, a selection, contenteditable. A page builder or a spreadsheet wants the
document layer and the renderer and none of that.

### Steps — 2026-09-04 대조

1. **`ModelSelection` 을 아래로.** ⬜ **안 했다, 그리고 그 값이 이제 보인다.** 순환은 다른 방법으로
   풀렸으므로(`import type` 과 devDependency) *그래프를 위해서는* 필요 없었다. 필요한 이유는 다른
   것이었다: 그 타입이 편집 층에 살아서 **다른 층이 자기 것을 다시 선언한다.** 지금 셋이고 둘이 서로
   다르다 — `editor-view-react` 의 두 판은 `cell` 도 `table` 도 표현할 수 없다. 게다가
   `editor-core` 에 `NoSelection` 과 `Selection` 이 이미 있고 **아무도 쓰지 않는다.**
   *끝났음의 기준:* 선언이 하나이고, 검사가 그것을 지킨다.
2. **`editor-core` 를 둘로** — *어떤 제품이든*(명령·트랜잭션·역사·맥락·키바인딩)과 *글자 제품*(캐럿인
   선택, contenteditable 조율). ⬜ **안 했고, 막고 있던 것도 아니었다.** 사이트가 이 분리 없이
   만들어졌다. 그러면 지금의 근거는 무엇인가: **Excel 과 Figma 는 캐럿이 없고 문서 층은 필요하다.**
   사이트는 캐럿을 *안 쓰는* 것으로 됐지만, 그리드와 캔버스는 캐럿의 가정이 틀린 자리다.
   *끝났음의 기준:* 캐럿에 대해 아무것도 import 하지 않고 명령과 역사를 쓰는 패키지가 하나 있다.
3. ~~**Word 가 아닌 예제 하나.**~~ ✅ **넷이다.** 이 단계가 적힐 때 제품이 하나였다. 지금
   `office-slides`·`office-site`·`office-note` 가 같은 코어 위에 서 있고, 노트는 **노드 3개**로 선다.
   *그리고 그것이 이 로드맵의 가장 큰 검증이다* — 한 사용자의 가정이 박혀 있었다면 셋이 못 섰다.
4. **패키지별 안정성 약속.** ⬜ `dsl` 과 `schema` 가 남이 기대는 것이고, 무엇이 바뀌지 않는지를
   말해야 한다. Phase 4.

**그래서 §1 의 답은 여전히 예이고, 근거가 추론에서 증거로 바뀌었다.** 처음 이 절이 적힐 때 근거는
*"그래프가 순환처럼 보이지만 대부분 아니다"* 였다. 지금 근거는 **넷이 서 있다**는 것이다.

---

## 2. Can one schema carry Word, Notion, ProseMirror, Summernote, builder.io, Figma, FigJam, Excel?

**The schema, yes. The renderer and the input, no — and that is the real
division, not DOM versus canvas.**

`packages/schema` already holds three schemas: `standard-schema` (a general
document), `office-schema` (Word's), and `figma-like-schema` — a flat
`DOCUMENT → PAGE → FRAME | RECTANGLE | TEXT | COMPONENT` node set, written and
marked *reference only*. So the question has already been partly answered in the
affirmative by whoever wrote that file: the node-and-attribute model is not the
thing that resists.

What resists is different per product, and it is worth being exact:

**2026-09-04 재측정 — 이 표는 제품이 하나일 때 적혔고, 그 뒤로 넷이 됐다.** 여덟 목표 중 **넷이
이미 서 있고**, 표에 없던 다섯째(Slides)가 생겼다. 무엇이 남았는지가 이 표의 값이다.

| 목표 | 지금 | schema | renderer | input | layout |
|---|---|---|---|---|---|
| **Word** | ✅ `office-word` (12,823줄) | done | done | done | done |
| **ProseMirror-like** (스키마 WYSIWYG) | ✅ **이 저장소가 그것이다** | done | done | done | 필요 없음 |
| **Notion-like** (블록·페이지) | ✅ `office-note` (2,027줄, **노드 3개**) | done | done | done | 필요 없음 |
| **builder.io-like** (페이지 빌더) | ✅ `office-site` (28,293줄) | done | done | done — 캐럿이 아닌 배치 | 필요 없음 |
| **PowerPoint/Canva-like** | ✅ `office-slides` (27,097줄) — *표에 없던 것* | done | done | done | done |
| **Summernote-like** (HTML WYSIWYG) | ⬜ 미착수 | `standard-schema` 있음 | done | done | 필요 없음 |
| **Excel-like** | ⬜ 미착수 | 그리드 노드 | 가상 스크롤 행 | **새로**: 2D 범위 선택, 수식 바 | 열·행 크기 |
| **Figma-like** | ⬜ 참고 스키마만 | `figma-like-schema` (reference only) | **새로: 캔버스** | **새로**: 직접 조작 | **새로: 글자 셰이핑** |
| **FigJam-like** | ⬜ 미착수 | Figma 와 같음 | Figma 와 같음 | Figma + 프레즌스 | Figma 와 같음 |

**노트가 노드 3개로 서는 것이 이 구조의 증거다.** 본문의 어휘는 `office-text` 가 이미 그리고 있고,
노트가 선언한 것은 *무엇을 담을 수 있나* 와 `note` 노드 하나다. 반대쪽 끝에 사이트가 28,293줄로 있다 —
같은 엔진 위에서 제품의 크기가 그만큼 벌어진다는 뜻이다.

### 그래서 확장은 세 갈래이고, 값이 다르다

1. **새 층이 필요 없는 것** — Summernote-like. 스키마 하나와 확장 몇 개. 새 층이 아니라 **어휘**의
   문제이고, 지금 구조가 그걸 위해 만들어졌다. *이미 넷이 그 길로 만들어졌다는 것이 근거다.*
2. **입력과 뷰포트가 새로운 것** — Excel-like. 문서 층은 그대로 쓴다. 선택이 문자 범위가 아니라 셀의
   사각형이어야 하고(그 종류는 `SelectionType` 에 **이미 있다** — `cell`), 백만 행 중 백 행을 그리는
   뷰포트가 필요하다. 둘 다 이상하지 않고 둘 다 새로 만든다.
3. **벽이 하나 있는 것** — Figma/FigJam. 렌더러는 하루짜리다(`dsl` 이 템플릿과 호스트를 이미 가른다).
   벽은 **글자 셰이핑**이다 — 아래의 절을 보라.

남은 셋 중 하나(Summernote-like)는 값이 낮다: 그 제품이 증명할 것을 이미 넷이 증명했다. **Excel 이
다음 진짜 시험이다** — 선택 종류 `cell` 이 표에서만이 아니라 그리드에서도 성립하는지, 그리고 연산
하네스가 그리드를 가진 스키마에서도 버티는지.

### 예측 둘이 맞았고 하나가 틀렸다 — 적어 두는 값이 여기 있다

전에 이 자리에 *"셋은 가깝고 넷은 아니다"* 가 적혀 있었다. 그 뒤로 셋이 만들어졌으니 대조할 수 있다.

**맞은 것:** *"Summernote-, ProseMirror-, Notion-like 는 새 층이 필요 없다 — 거리는 스키마와 명령으로
재고 아키텍처로 재지 않는다."* 노트가 그것을 증명했다. **노드 3개, 2,027줄.**

**맞은 것:** *"페이지 빌더는 캐럿을 직접 조작으로 바꾼다. 문서 층은 그대로 쓰이고 `editor-core` 의
선택은 아니다. 넷 중 가장 싸고 자연스러운 두 번째 제품이며, 새 렌더러 없이 2단계의 분리를 증명한다."*
사이트가 그것이다. 다만 **싸지 않았다** — 28,293줄이다. 새 *층* 이 필요 없다는 것과 새 *제품* 이
작다는 것은 다른 말이었다.

**틀린 것:** *"`editor-core` 의 선택은 페이지 빌더를 서지 못한다"* 는 이유로 2단계(편집 층 분리)가
먼저라고 봤다. **사이트는 그 분리 없이 만들어졌다.** `editor-core` 를 그대로 쓰면서 캐럿을 안 쓰는
것이 가능했고, 그래서 2단계는 *막고 있던 것* 이 아니라 *정돈* 이다. 순서가 그만큼 자유로워졌다는
뜻이고, 동시에 2단계의 근거를 다시 세워야 한다는 뜻이다 — 지금의 근거는 아래에 다시 적었다.

### 남은 셋

**스프레드시트**는 문자 범위가 아니라 셀의 사각형인 선택과, 백만 행 중 백 행을 그리는 뷰포트가
필요하다. 둘 다 이상하지 않고 둘 다 새로 만든다. **그리고 선택 쪽 절반은 이미 있다** —
`SelectionType` 의 `cell` 이 그것이고, 표에서 이미 쓰인다(`installCellSelection`). 그리드에서도
성립하는지가 그 타입의 진짜 시험이다.

**Canvas is the hard one, and not for the reason it looks.** The renderer is a
day's work — `dsl` already separates template from host. The problem is
underneath:

> `measurement.ts`, the file this repository's pagination is built on, opens by
> saying the browser has *already done* the hard part: "Character widths,
> kerning, script shaping and line breaking are all already done —
> `Range.getClientRects()` hands back one rectangle per line box, which *is* the
> line breaking result. Computing glyph metrics ourselves would be re-deriving
> an answer the layout engine has already given."

On a canvas there is no layout engine to ask. Text shaping — glyph metrics,
kerning pairs, bidi, Hangul and CJK line-breaking rules, ligatures — has to be
done, and it is the single largest piece of work in this document. Everything
else on the canvas side (hit testing, transforms, z-order, snapping) is
ordinary.

So: **the schema unifies; the renderer and the input do not, and text shaping is
the wall.** A design tool whose text is a DOM overlay would dodge it, and is
worth prototyping before committing to the wall.

---

## 3. Can each of these ship as its own program?

**Yes, and the repository is already arranged for it.** `apps/word` is a Vite
app that composes packages and adds a shell — a ribbon, panes, a ruler. Nothing
in it is privileged.

What is missing is not packaging but **the seam a product plugs into**. Today a
product is: a schema, a renderer registration, an extension set, a keymap, a
toolbar model, and a React shell.

**2026-09-04 — 넷을 대조했다.** 여섯 조각 중 넷은 네 제품이 다 같은 모양으로 갖고 있고, 하나는 하나만
갖고 있고, 하나는 앱마다 손으로 쓴다:

| 조각 | word | slides | site | note |
|---|---|---|---|---|
| 스키마 | `createSchema` | `createSchema` | `createSchema` | 상속 |
| 렌더러 등록 | `register*Renderers` | ✓ | ✓ | ✓ |
| 확장 집합 | `create*Extensions` | ✓ | ✓ | ✓ |
| 툴바 모델 | `WORD_TOOLBAR` | `SLIDES_TOOLBAR` | `SITE_TOOLBAR` | `NOTE_TOOLBAR` |
| **키맵** | `word-keymap.ts` **71개** | **없음** | **없음** | **없음** |
| React 셸 | 앱(5,507줄) | 앱(18,854줄) | 앱(11,366줄) | **패키지** |

**그리고 네 kit 이 같은 모양인데 그 모양을 선언한 타입이 없다.** 넷 다
`create<X>Extensions()` + `create<X>Editor(options)` 다 — 넷이 합의했고 아무것도 그걸 적어 두지
않았다. 이 저장소가 이미 검사를 가진 모양이다(`three-agree.test.ts`): **셋이 합의하고 하나가
어긋나는 것.** 다음 제품이 어긋날 자리다.

**키맵 쪽은 재보니 처음 본 것보다 작다.** 앱의 손으로 쓴 키 처리를 셌더니 slide 17 · site 10 ·
word 5 인데, **대부분은 정당하게 UI-지역이다** — 팝오버의 Escape, 목록의 화살표, 찾기 바의 Enter.
*제품의 키보드* 인 것은 여섯쯤이고 그게 진짜 어긋남이다: 예를 들어 **고른 도형을 `Delete` 로 지우는
것이 앱에 손으로 적혀 있고**, Word 는 같은 것을 `when:` 가드를 가진 데이터로 선언한다.

### Steps

1. **제품 계약을 이름 붙인다.** 넷이 이미 같은 모양이므로 **추론이 아니라 기록**이다.
   *끝났음의 기준:* `ProductKit` 같은 타입이 하나 있고, 네 kit 이 그것을 만족하는지 검사가 세고,
   다섯째 제품이 조각을 빠뜨리면 검사가 신고한다.
2. **셸이 제품의 것이 아니게 된다.** 노트가 이미 통과했다 — 뷰와 툴바를 패키지에 갖고 있어서
   `apps/note` 가 257줄이다. 나머지 셋은 35,927줄이 앱에 있다.
   *끝났음의 기준:* 남의 앱에 제품을 넣는 데 앱 코드를 베끼지 않아도 된다.
3. **Desktop and server.** The layout pass needs a browser for measurement and
   nothing else does; a server-side renderer is possible for every product whose
   pagination is not needed, and for Word only if text shaping arrives (which is
   the same wall as canvas, from the other side).

---

## The order these should happen in

Each step is chosen so the *next* one is cheaper, and each has a way to know it
worked.

**Phase 1 — make the graph honest.** Move `ModelSelection` down, add the missing
`type` keywords, drop the two phantom dependencies. *Done when* every package
builds against only the packages below it and the dependency graph is a DAG.

> **2026-09-04 — 끝났습니다. 순환 0개, DAG 입니다.** 그리고 이 단계가 *"작다"* 고 적혀 있었던 것이
> 맞았다 — 재보니 순환 셋 중 **둘이 유령**이었다. `datastore → model` 과 `editor-core → extensions` 가
> `package.json` 에 적혀 있고 import 는 **하나도 없었다.** 세 번째(`editor-core ↔ model`)는 한쪽만 진짜였다:
> `editor-core` 는 `new TransactionManager` 를 쓰지만 `model` 은 `Editor` 와 `SelectionManager` 를 타입
> 자리에서만 쓴다 — `import type` 으로 바꾸고 devDependency 로 내려서 풀렸다.
>
> **검사를 붙이자 유령이 열넷 나왔다.** 처음 여섯을 걷으면 셋이 더 나오고, 그것을 걷으면 넷이 더 나온다 —
> 유령은 빌드가 되기 때문에 보이지 않고, 무언가를 쓰려다 만 커밋 하나로 다시 생긴다.
> `conformance/test/dependency-graph.test.ts` 가 두 가지를 묻는다: 순환이 있나, 그리고 **선언했는데
> import 하지 않는 것이 있나.**
>
> 층이 0~8 로 정렬된다: `dsl schema shared` → `datastore` → `model` → `editor-core` → `office-text`
> `office-controls` → `extensions` → `office-editor-ui` `office-word` → `office-note` `office-slides`
> → `office-site`.
>
> **제품끼리의 변은 아홉에서 셋으로** 줄었고 남은 셋 중 하나는 의도한 것.

**Phase 2 — split the editing layer.** Separate "any product" from "a text
product" inside `editor-core`. *Done when* a package can use commands, history
and transactions without importing anything about a caret.

**Phase 3 — a second product.** A page builder, on the DOM renderer, sharing the
shell. *Done when* the shell in `apps/` belongs to no product, and when a
feature added to the kit appears in both.

> **2026-09-04 — 제품은 넷이고, 셸은 아직 앱에 있습니다.** `office-word`·`office-slides`·`office-site`·
> `office-note`. 마지막 하나가 이 조건을 통과한 유일한 제품이다: 자기 뷰와 툴바를 패키지에 갖고 있어서
> `apps/note` 는 **257줄**이다. 나머지 셋은 **35,927줄**이 앱에 있다(2026-09-04 재측정: slide 18,854 ·
> site 11,366 · word 5,507). 가장 큰 조각들: `slide/overlay` 3,765 · `slide/properties` 2,586 ·
> `slide/timeline` 2,443 · `slide/app` 2,350 · `site/inspector` 2,342 · `site/overlay` 1,997.
>
> **그리고 이 단계의 두 번째 조건 — *"kit 에 더한 기능이 둘 다에 나타난다"* — 은 아직 검증되지
> 않았다.** 넷이 서 있는 것은 첫 조건의 증거이고, 두 번째는 *같은 것을 한 번 적어 둘이 얻는가* 를
> 묻는다. 이번 회차에 그 예가 하나 나왔다: 셀 선택을 `office-text` 로 옮기자 노트가 두 명령을 얻었다.
> 반대 예도 하나 나왔다: 네 kit 이 같은 모양인데 **그 모양을 선언한 타입이 없어서**, 다섯째 제품이
> 조각을 빠뜨려도 아무것도 신고하지 않는다.
>
> **재보고 방향을 정한 것:** 옮길 것을 *중복이라서* 고르면 안 된다. 이름으로도 내용으로도 훑었고, 리본
> 셋과 `/` 메뉴와 팝오버 자리잡기 말고는 앱을 가로지르는 중복이 **없다**. 기준은 하나여야 한다 — *남의
> 앱에 이 편집기를 넣으려면 무엇이 같이 가야 하나.* 그 기준으로는 하나도 안 겹쳐도 다 가야 하고, 그건
> 크기의 문제지 중복의 문제가 아니다.
>
> **렌더러 레지스트리가 짝이다.** 크롬을 옮겨도 렌더러가 전역이면 두 제품이 한 화면에 못 선다 — Word 가
> 사이트의 렌더러 **125개 중 117개**를 덮는 것을 쟀다. `intoRegistry` 가 쓰는 쪽에 범위를 주는 한 줄이고,
> 나머지(`EditorViewDOM → DOMRenderer → VNodeBuilder`, `{global:false}` 의 전역 대체)는 이미 다 엮여
> 있었다.

**Phase 4 — publish.** Versioning, a stability promise for `dsl` and `schema`,
and documentation aimed at somebody who has not read this repository. *Done
when* a person outside it builds a third product without asking a question this
document should have answered.

**Phase 5 — decide about canvas.** Prototype text-as-DOM-overlay first, since it
is days rather than months, and let that decide whether the shaping engine is
worth building. *Done when* the decision is made on evidence rather than on
appetite.

### 지금 손에 잡히는 순서 — 2026-09-04

로드맵의 단계는 몇 달짜리다. 이건 그 안에서 **다음에 손댈 것**이고, 하나씩 지워 가며 쓴다. 각 줄은
`BACKLOG.md` 의 항목 하나를 가리키고, *왜* 는 거기 있다.

- [x] ~~**`Shift+→` 가 블록을 넘으면 모델 범위가 뒤집힌다.**~~ **끝 — 그리고 적어 둔 원인이 틀렸다.**
      *"`isTextContainer` 가 아무도 안 쓰는 속성을 물어서"* 라고 적혀 있었고, 그것도 사실이었지만 이
      결함의 원인은 아니었다. 그 수정 뒤에도 **다섯 번째 누름에서 그대로 뒤집혔다** — 검사를 쓰고 나서
      알았다. 원인은 둘이었고 둘 다 *"어느 쪽인가"* 를 잘못된 것에게 물은 것이다:

      1. `convertOffsetWithRuns` 가 요소 경계의 오프셋을 `isEnd ? 런의 끝 : 런의 시작` 으로 정했다.
         **`isEnd` 는 범위의 어느 쪽인가이고 요소 안의 어디인가가 아니다** — 그건 `offset` 이 말한다.
         그래서 다음 문단의 맨 앞(`offset: 0`)이 그 문단의 **끝**(28)이 됐다. 비교도 틀렸다:
         `t.compareDocumentPosition(child)` 로 물어서 `child` 가 `t` 를 포함하는 흔한 경우에
         `FOLLOWING` 이 서지 않았고, 그래서 `firstAtOrAfter` 가 한 번도 정해지지 않았다.
      2. `fromDOMSelection` 이 문서 순서를 **sid 문자열 비교**로 정했다
         (`compareNodeOrder ?? ((a, b) => a.localeCompare(b))`, 실제 호출자 셋 다 비교자를 안 준다).
         `"9"` 가 `"11"` 보다 커서 자리수가 넘어가는 순간 `startNodeId` 와 `endNodeId` 가 **맞바뀐다.**
         짧은 문서에서는 우연히 맞으므로 재현되지 않는다.

      고친 뒤 예순 번을 눌러 여러 블록을 넘어도 뒤집히지 않고 DOM 표시가 남는다 —
      `apps/note/tests/selection.spec.ts`. **배운 것:** 원인을 찾았다고 적은 것과 고쳐졌다고 적은 것은
      다른 문장이고, 그 사이를 잇는 것은 단정하는 검사뿐이다. 앞 회차의 프로브 둘(`zz-sh`, `zz-tc`)은
      콘솔에 찍기만 해서 `every-test-asserts` 가 잡았고, 그 잡힘이 이걸 다시 열게 했다.
- [x] ~~**`ModelSelection` 이 셋 선언되어 있고 둘이 서로 다르다.**~~ **끝 — 다섯이었고, 그 중 하나가
      오래된 결함의 출처였다.** `editor-core` 의 죽은 `ModelNodeSelection = { nodeId, selectAll }` 이
      아무도 안 쓰인 채 남아 있었고, **두 뷰 층이 그 모양을 향해 `nodeSelection.nodeId` 를 읽고
      있었다** — 생산자는 `nodeIds` 복수를 세우므로 그 분기는 한 번도 아무 일을 한 적이 없다. 그리고
      `cell`·`table` 은 `console.warn('Unsupported selection type')` 으로 갔다(셀 드래그 한 번에 한
      번, 브라우저에서 셌다).

      **사본을 걷자 타입 검사가 그 둘을 바로 찾았다** — `'none'` 은 `SelectionType` 이 아니고,
      `ModelSelection` 에 `nodeId` 가 없다. 그리고 사본이 검사를 실제로부터 **밀어낸** 자리도 나왔다:
      React 검사에 *"컴파일러가 그렇게 말했다"* 며 범위 필드 넷을 지운 주석이 있었고, 그 컴파일러가
      읽던 것이 좁은 사본이었다. `docs/specs/selection.md` 에 다 적었다.
- [x] ~~**엔진이 *글자인가* 를 이름으로 묻는다.**~~ **끝 — 그리고 스키마를 바꿀 필요가 없었다.**
      `stype === 'inline-text'` 가 엔진 층 **열여섯 자리**에 있었다(`editor-view-dom` 열,
      `editor-core` 하나, `model` 하나, `renderer-dom` 하나, `extensions` 셋). 원칙은
      `extensions/range-delete.ts` 의 `isInline` 에 이미 적혀 있었고 **한 파일이 그렇게 하고 열여섯이
      안 했다.**

      **먼저 재본 것이 답을 바꿨다.** *"스키마에 `text: true` 를 더해야 한다"* 고 볼 뻔했는데,
      런타임으로 세니 **스키마는 이미 답할 수 있었다**: office 의 `inline` 그룹 여덟 중 일곱이
      `atom: true` 라서 `group === 'inline' && !atom` 이 정확히 `inline-text` 하나다. 그리고 그
      열여섯은 **전부 인스턴스를 손에 쥐고 있었다**(`dataStore.getNode(id)` 를 부른 뒤였다) — 그러면
      `typeof node.text === 'string'` 이 더 짧고 더 옳다.

      `@barocss/shared` 의 `holdsText` 로 갔다(타입 술어라 `!modelNode ||` 가드도 같이 걷혔다).
      두 자리(`selection-summary` · `align`)는 *글자가 **아닌** 것* 을 찾는 걷기였고, 거기서는
      이름 조건이 **중복**이었다 — `typeof text !== 'string'` 이 이미 그것을 뺀다.

      **그리고 규칙은 세어야 규칙이다:** `conformance/text-is-asked-by-text.test.ts` 가 엔진 층의
      이름 결정을 센다(0이어야 한다). 처음 돌리자 내가 못 찾은 **여섯**을 바로 찾았다 — React 뷰
      다섯과 렌더러의 로그 하나. `model` 과 `extensions` 는 `shared` 의존이 없어서 새로 더했다
      (`shared` 는 의존이 0이므로 순환이 안 생긴다).

- [x] ~~**뷰 층이 두 벌.**~~ **끝 — 그리고 합칠 것은 열셋이 아니라 둘이었다.**
      1단계(선택 어휘를 `shared` 로)를 하고 2단계로 열셋을 대봤더니: **표기만 다른 것 여덟**(변수명,
      `??` vs `||`, 로그), 같은 것 둘, React 에 없는 것 둘, **논리가 다른 것 둘.** 326줄을 옮기는 것이
      답이 아니었고 — 여덟을 옮겼으면 순수한 churn 이다 — **그 둘이 다 살아 있는 결함이었다.**

      `isDecoratorElement` 는 `shared` 가 이미 가진 판단의 **네 번째 사본**이었다(`skipsInIndex` 로
      내보내고 지웠다, **탈출구 없이**). `findBestContainer` 는 DOM 판에만 **아래로 걷기**가 있었고,
      그것을 React 에 주자 더 깊은 결함이 드러났다: 시작은 첫 런, 끝은 마지막 런으로 내려가므로
      **캐럿이 갈라진다** — `t1:0 → t2:0`, `collapsed=false`. `range.collapsed` 를 아무도 안 묻고
      있었다. 사이트에서 `/` 를 칠 때 슬래시 메뉴와 버블 툴바가 같이 뜬 것이 그 증상이다.

      **배운 것:** 두 벌을 합치는 값은 코드를 옮기는 것이 아니라 **대보는 것**이었다. 대보기가 결함
      둘을 찾았고, 옮기기는 여덟 자리에서 아무것도 주지 않았을 것이다.

      **2026-09-05 정정 — 위의 `[x]` 를 너무 일찍 그었다.** `range.collapsed` 를 묻는 것만으로는
      안 끝났고, 남은 것이 둘이었다:

      1. **접을 때 어느 쪽으로 접는가.** 처음 쓴 가드는 늘 *시작* 으로 접었다. 그런데 경계가
         블록이면 두 해석은 서로 다른 그릇 안을 걷는다 — 시작은 첫 런 안을, 끝은 마지막 런 안을 —
         그래서 각자 자기 편에서만 맞다. 늘 시작으로 접으면 **문단 끝의 캐럿이 첫 런 끝** 으로
         간다. 런 둘인 문단에서는 글자 한복판이다.
      2. **타이핑 경로에는 그 질문이 아예 없었다.** `convertStaticRangeToModel` 은 `collapsed` 를
         묻지 않는다. `getTargetRanges()` 가 캐럿에 주는 것은 접힌 범위이고, 그러므로 같은 자리에서
         *둘째 런 전체* 를 고른 것으로 읽혔다. 그 값은 모델에 직접 쓰인다.

      규칙은 `shared` 의 `collapseBoundaries` 한 벌로 뒀다.

      **그리고 검사가 왜 못 잡았는지가 이 회차의 세 번째 같은 모양이다:** 내가 쓴 검사는 캐럿을
      `(p, 0)` 에만 두었는데, 거기는 **접는 방향이 결과를 안 바꾸는 유일한 자리** 다. 내가 고른
      자리가 내 결정을 시험하지 않았다. **끝났다고 적은 문장과 끝난 것 사이를 잇는 것은 여전히
      단정하는 검사뿐이고, 그 검사가 결정을 실제로 시험하는지까지 봐야 한다.**
- [ ] **편집기의 문에서도 선택의 답이 둘이다.** `Editor.updateSelection(selection: SelectionState |
      any)`, `EditorState.modelSelection: SelectionState | ModelSelection | null`. `SelectionState`
      는 DOM 스냅샷이고 `ModelSelection` 은 모델의 것인데 둘 다 *선택* 이라는 이름으로 같은 문을
      지난다. 모델 쪽 사본은 걷었고 이 문이 다음이다.
- [x] ~~**제품 계약에 이름이 없다.**~~ **끝 — 그리고 넷째가 이미 벗어나 있었다.**
      `word`·`slides`·`site` 의 옵션 타입이 **글자까지 같았다**(`extends EditorOptions` +
      `kit?` + `keybindings?`; word 만 `author` 를 더 받는다). 그런데 **가장 최근 제품인 `note` 가
      그것을 안 따랐다** — `EditorOptions` 를 안 물려받고, `keybindings` 를 아예 못 받고,
      `dataStore`·`schema` 를 `unknown` 으로 받았다. 아무도 막지 않았다: 선언이 없었기 때문이다.
      **다섯째가 걸릴 자리가 정확히 거기다.**

      `editor-core` 에 `ProductEditorOptions` 를 두고 넷이 그 위에 섰다. 그리고 재다가 하나가 더
      나왔다: **`keybindings` 를 넘기는 호출자가 0** 이고, 그래서 그 의미가 한 번도 시험된 적이
      없었다. 셋의 구현은 **대체** 였다 — `keybindings ?? WORD_KEYBINDINGS` 는 하나라도 주면 Word 의
      71개가 통째로 사라진다는 뜻이다. `word-kit.ts` 자신이 바로 윗 문단에 *레지스트리를 비우면
      Enter·Backspace·화살표까지 사라진다* 고 적어 두고, **한 줄 아래에서 부르는 쪽에게 그 문을 열어
      두고 있었다.** 이제 제품의 키가 먼저 실리고 이것이 그 위에 얹힌다. 넘기는 호출자가 0이므로
      오늘은 아무것도 안 바뀐다 — 바뀌는 것은 다음에 넘기는 사람이 얻는 답이다.

      `conformance/every-product-is-built-the-same-way.test.ts` 가 넷을 센다: 계약을 받는가, `kit` 이
      기본을 갈아끼우는가, `keybindings` 가 **층**인가.
- [ ] **키를 어느 층이 갖는가 — 기준을 적었다**(`docs/specs/keybindings.md`), **이주가 남았다.**

      *"키맵이 Word 에만 있다"* 고 적혀 있었고 **틀렸다.** 재보니 `editor-core` 의
      `DEFAULT_KEYBINDINGS` 가 **마흔**을 묶고 **모든 제품이 그것을 받는다** — Enter·Backspace·
      화살표·⌘B/I/U·목록·들여쓰기·제목·인용·undo/redo·복사/붙여넣기·전체선택. **note 에서 ⌘B 는
      된다.** 기본은 이미 공유되고 있었다.

      **문제는 반대쪽이었다:** `WORD_KEYBINDINGS` 70개 중 **18개가 엔진 것을 다시 적고 있었고**
      다시 적힌 것이 더 약했다(`editorFocus && editorEditable` → `editorFocus`). 레지스트리가
      출처로 충돌을 풀고 제품이 이기므로, 다시 적는 순간 편집 가드가 사라진다. 열여섯을 걷었다.
      못 본 이유는 **`DEFAULT_KEYBINDINGS` 가 안 나가고 있었기** 때문이다 — 볼 수 없는 것과 다시
      적는 것은 같은 결함의 앞뒤다.

      **기준(`specs/keybindings.md`):** *이 키가 하는 일이 문서에 남는가* 로 층이 갈린다. 남으면
      레지스트리(엔진/제품), 화면에만 남으면 앱. 그리고 **레지스트리가 유일한 디스패처다** —
      `slides`/`site` 가 호스트 디스패처를 쓰는 근거(*"호스트만 상자 안 타이핑을 안다"*)는 엔진의
      `keydown` 이 `window` 가 아니라 **`contentEditableElement` 에 붙기 때문에 성립하지 않는다.

      *남은 일:*
      - [x] note 에 `MoveBlockExtension` — 셋은 싣고 노트만 안 실어서 `Alt+↑` 가 죽어 있었다.
            기능은 손잡이로 있었다. `office-controls/every-engine-key-reaches-a-command.test.ts`
      - [ ] **slides 의 문서 키 23개를 레지스트리로.** `SLIDES_KEYS` 는 이미 `office-controls` 의
            `KeyModel` 이므로 모양은 같다. 실제 일은 **맥락을 세우는 것** 이다 — slides/site 는
            `setContext` 를 하나도 안 부른다(`when` 을 쓰는 것은 word 뿐이다)
      - [ ] site 도 같게 (문서 키 0, 앱의 손 keydown 셋은 전부 크롬)
      - [ ] 읽기 전용을 낼 때 `editorEditable` 을 걸 명령 목록 — 지금 Word 54 중 0, note 2 중 0.
            일괄로 걸면 안 된다: `copy`·`selectAll` 은 읽기 전용에서 되어야 한다
- [ ] **두 끝이 형제가 아닌 범위** — 인용문 안에서 바깥으로. **결정은 끝났다**(`specs/selection.md`):
      시작을 담은 블록이 살아남는다 — 추측이 아니라 *삭제 뒤 캐럿이 시작 자리에 있다* 에서 도출된다.
      남은 일은 **문서 순서 훑기** 하나이고, 이번 회차에 같은 것이 한 번 더 필요했다
      (`fromDOMSelection` 이 문서 순서를 sid 문자열로 정하고 있었다). 두 자리가 같은 것을 필요로 하면
      그 자리는 모델 쪽이다.
- [ ] **관리 화면 둘:** 컴포넌트 탭이 이름 목록이라 썸네일 카드여야 하고, 데이터 탭의 행 편집 Drawer 가
      다른 도구와 겹친다.
- [ ] **크롬 이주의 다음 조각.** 되돌리기 쉬운 것부터: `page-frame`(307, 오버레이와 이미 갈랐다) →
      `rail`(1,483) → `inspector`(2,343) → `overlay`(1,997, 좌표를 읽으니 마지막).
      `office-site` 가 React 를 갖게 되는 첫 걸음이다.
- [x] ~~**드래그 열셋을 `dragGesture` 로.**~~ **끝.** 그 수를 두 번 잘못 셌다(20 → 5 → **13**) —
      **세는 방법이 답을 바꾼다.** 남은 `window` `pointermove` 하나는 상시 리스너다. `abort` 가
      자리마다 다른 것이 이 이주의 값이고, `TECHNICAL-ROADMAP.md` §2.0 에 그 갈래를 적었다.
- [ ] **전역 키 리스너의 가드가 규칙이 아니라 관습이다.** *"스물둘, 인스턴스가 둘이면 둘 다 듣는다"*
      고 적었다가 다시 셌고 틀렸다 — 열다섯은 `apps/*` 이고 그 제품들은 창마다 편집기가 하나다.
      패키지 안에는 여섯이고 **여섯 다 인스턴스별 상태로 가드한다.** 살아 있는 결함이 아니다. 남은
      것은 그 규칙을 적고 새 리스너가 가드 없이 들어오는 것을 세는 검사 하나.
- [ ] **`toModel` 이 셋이고 같은 이름으로 서로 다른 질문 둘에 답한다** — 한 파일 안에 80줄 떨어져
      하나는 점, 하나는 거리다. 셋 다 세 줄이라 중복은 값이 아니고, 값은 두 질문에 다른 이름을 주는
      것이다: `pointIn` 과 `deltaIn`. 제스처가 `moved.x/y` 와 `moved.dx/dy` 를 주므로 자리는 그 옆.
- [ ] **`createWordTables`(508줄)와 `frameCss`** 를 제자리로. 제품끼리의 마지막 두 변.
- [x] ~~**엔진의 순환 셋** — Phase 1.~~ **끝.** 둘이 유령이었고 하나는 타입만이었다. 유령 열넷을 걷고
      `dependency-graph.test.ts` 로 못 박았다. 큰 일이라고 본 것이 틀렸다 — 로드맵이 맞았다.
- [x] ~~**셀 병합·분할.**~~ **끝 — 그리고 적어 둔 이유가 틀렸다.** *"제스처가 없다"* 고 적었는데
      `installCellSelection` 이 379줄로 있었고 `apps/word`·`apps/slide` 가 부르고 있었다. 진짜 결함은
      둘이었다: (1) 그 제스처가 **`office-word` 안**에 있어서 표를 가진 넷 중 둘만 닿았고, (2)
      `extensions/table.ts` 의 `_selectedCellRange` 가 **`cell` 선택을 못 알아봤다** — `cell` 은 이
      명령 하나를 위해 있는 선택 종류인데. Word 에서 되던 것은 `office-word/table-commands.ts` 가
      양 끝 셀 id 를 따로 넘겨 줬기 때문이다. 셀 선택은 `office-text` 로 갔고(`.w-cell` 과
      `[data-cell-selected]` 가 이미 거기 있었다), 노트가 자기 뷰에서 설치하고, 노트의 표 도구가
      여섯에서 여덟이 됐다. **남은 것:** 사이트가 캔버스에서 이 제스처를 설치할지 — 그 캔버스는
      포인터를 자기 오버레이가 먼저 받는다.

**끝난 것을 지우지 말고 `BACKLOG.md` 의 Done 으로 옮긴다** — 놀란 것과 함께. 그게 다음 사람이 다시
발견하지 않을 유일한 방법이다.

### 그리고 검사 결과를 읽는 법

이번 회차에 **같은 종류로 두 번** 속았다. 둘 다 요약의 마지막 줄을 읽은 결과다.

| 도구 | 마지막 줄 | 그 위에 있는 것 |
|---|---|---|
| `playwright --reporter=line` | `364 passed` | `10 failed` |
| `vitest run` | `Tests 458 passed` | `Test Files 4 failed` — 파일이 **열리지 않은** 것 |

두 번째가 더 나쁘다: 실패 개수가 **0** 이고 검사 개수만 조용히 줄어든다. `conformance` 의
`dependency-graph.test.ts` 가 이제 그것을 묻지만, 사람이 읽을 때도 규칙은 하나다 — **실패 줄을 먼저 세고,
통과 줄은 그다음에 읽는다.**

---

Phases 1 and 2 are small and unblock everything after them. Phase 5 should not
start before phase 3 finishes: a second product is what proves the core is a
core, and building a canvas first would prove only that a canvas can be drawn on.

---

## Slides, to the level of PowerPoint, Keynote, Canva and CapCut

Named as the target on 2026-08-19. Those four are not one product, and the
distance to each is different in kind — so this is what the deck already has,
what separates it from each of them, and the order that makes the next step
cheaper. Measured rather than guessed: 139 commands, fifteen canvas node types
declared, ten toolbar groups.

**What is already there.** Shapes, pictures, text frames, frames with auto
layout, groups whose box follows their children, tables with cell selection,
layouts with formatting that cascades through them, snapping and guides, align
and distribute, grouping and going inside a container, a clipboard, speaker
notes over one document, real thumbnails, presenting, zoom, and a properties
panel. Every one of those is drawn, reachable and covered by the harness. What
follows is not a rewrite of any of it.

### What separates the deck from each of them

- **PowerPoint and Keynote** — *animation*. Transitions between slides, builds on
  the objects, a presenter view. Without them this is a drawing tool that happens
  to be slide-shaped, and it is the largest single gap.
- **Canva** — *design depth*. A shape's whole style is `fill`, `stroke` and
  `strokeWidth` today. No gradient, no shadow, no blur, no dashes, no per-corner
  radius, no image crop. These are what a reader thinks of as "designing".
- **CapCut** — *time as a first-class dimension*. Video and audio on a slide, a
  timeline, keyframes, and an export that is a file rather than a screen.

### The order, and why

**Deck 1 — depth on the objects that already exist.** Gradients, shadows,
opacity, dashes, per-corner radii; crop and fit for a picture. Cheapest, most
visible, and the foundation for everything after it: a theme has nothing to
resolve until a shape has colour *slots*, and an animation has nothing worth
watching until the thing it moves looks designed. *Done when* the properties
panel can produce a slide a reader would show someone.

**Deck 2 — transitions, then builds.** A transition is one slide replacing
another, which needs no per-object timing and is the smallest possible first use
of time. Builds — entrance, emphasis, exit, in an order, with delays — come after
it and reuse the same track. Both live **beside** the document, per §4 of
`canvas-model.md`: a track naming shapes by sid, so a node that knows nothing
about animation can still be animated and a deck with no timeline pays nothing.
*Done when* a deck presents with motion and the document holding it has no time
field on any node.

**Deck 3 — masters and themes.** `slideLayout` exists; a master is the layer
above it, and a theme is the colour and font set the whole deck resolves through.
The resolver seam is already built — `withLayouts` puts a layer into
`resolveNodeWith` — so this is another layer rather than another mechanism.
*Done when* changing a theme changes every slide, and a slide that overrode
something keeps it.

**Deck 4 — media, and then the timeline. Done.** `mediaVideo` and `mediaAudio`
were taken out of the office schema the day it stopped declaring what nothing
drew; they came back *with* a renderer, a command and a control, and then the
timeline: tracks per shape, bars on an axis, a playhead that runs while the
preview does, curves, springs, presets, text animated by the letter, and the
trim — which was the last part open and is the first thing here that edits *time
inside a shape* rather than time on a slide. And a deck can be saved to a file and
opened again, which is what made the rest of it worth having.

The trim taught the thing worth keeping from this whole item: **a film is the one
step whose length is not in the document.** It is in the file, so the out-point
has no honest default and `0` means "to the end" — see `motion-model.md` §7g. It
is dragged now as well as typed, and its bar is the only one on the axis whose
edges are not "when" and "how long" (§7g-2).

Two things closed after this that belong to it: a shape's fills are drawn as
**elements**, which is what made the Ken Burns zoom, a real per-fill opacity and a
cross-fade between two photographs possible at all (§8d); and going **backwards**
through a show un-plays one press instead of leaving the slide, which turned up two
faults worse than the missing feature — an exit that came back on the next press,
and every exit but `fadeOut` hiding its shape from the moment the slide arrived
(§7h).

**Deck 5 — templates, and what a reader starts from. Done, and one claim in it was
wrong.** A new deck starts from something — one title slide with the definitions
under it, because an empty document is a white rectangle with nothing to click —
and a **gallery** now answers the question 새로 만들기 cannot: *what am I making?* A
talk has a contents slide and section dividers, a report puts its summary first,
and those are five slides in an order nobody types from memory. The design is one
sentence: **a template is a document**, the same shape as one opened from disk, so
everything that already reads a deck reads a template.

The claim this entry used to make — that `component` and `instance` "are what a
template is made of" — **conflated two features**, and it is worth correcting
rather than quietly dropping. A template is a whole document to *start from*, and
it needs no components at all. `component`/`instance` are about **reuse with
identity**: one definition, many placements, and the placements follow the
definition. Where the two meet is a template *library* — the card, the quote
block, the logo lockup a reader drops onto a page, and a brand template that stays
consistent because its slides are made *of* those pieces rather than of copies. So
components are what a **living** template is made of, and nothing a starting one
needs. They are still declared and still made by nothing; the design for them is
in `docs/specs/canvas-model.md` §10.

Two engine faults came out of the easy half, and both are the same shape: **a root
held across a load is the wrong root.** The view preferred the last tree it drew —
right for an edit, since that tree is a live proxy, wrong for `loadDocument`, which
makes a new root — and the environment the renderers resolve formatting against
had captured `rootId` at mount, so a new deck's theme was looked for under the old
document's. Both measured in the product, both fixed in the engine. See
`canvas-model.md` §7.

**Deck 6 — reuse, inheritance, and a deck that is not a line. Done.** Four things
that turned out to be one thing: *something defined once and used in many
places*, at four scales.

- **A component**, with variables a placement can be asked for, a slot for the
  reader's own things, and apply as a command. The measurement that shaped all of
  it: **a template cannot draw a foreign node**, so a placement holds real copies
  and following a definition is an edit rather than a lookup — which is the
  relationship Figma has across files, arrived at from the other direction.
- **A layout and a master**, editable at last: `applySlideLayout` had always said
  what a slide *follows* and nothing said what a layout **is**. The same
  editing-surface mechanism the first definition needed, which is what
  `canvas-model.md` §10c predicted when it was built.
- **A deck that is not a line**: a shape a reader presses, the deck's **map**
  drawn from those presses, and Keynote's *links only* as the first deck-level
  setting this schema has. The click was already there — `present.tsx` knew that
  a press which fires a trigger must not also advance the deck — so a jump was a
  new consequence rather than a new mechanism.
- **A library**: the reader's own decks by name (IndexedDB, chosen by measuring
  that a pictureless deck is 8–42KB and one photograph is a base64 megabyte), a
  button that opens another deck at a page, and a **brand kit** — a definition
  copied in from another deck that remembers where it came from and offers its
  newer self.

What this item kept teaching, in five different places: **the answer a reader
needs is usually one dialog away from where they are looking.** The way out of a
definition lived in a panel that might be closed; a stale brand kit said so only
in the dialog; a button pointing at another deck asked for a name nothing showed.
Each was a real fault and none of them was a missing feature.

**What is deliberately not on this list yet.** Charts, which need a data model
rather than a drawing; collaboration, which the whole product has no second
reader for; and an exporter to `.pptx`, which is worth doing when the model has
stopped moving.

---

## What would make this roadmap wrong

Worth writing down, so it is checked rather than assumed:

- **If the schema cannot express a spreadsheet's cell references.** A formula is
  a reference to another node, and this document model has no notion of one node
  pointing at another except by id in an attribute. That may be enough; nobody
  has tried.
- **If collaboration does not survive the split.** `collaboration` is 535 lines
  against `datastore`, and the id namespaces were only unified this month. A
  second product editing concurrently is the first real test.
- **If the operation harness does not generalise.** Every operation currently
  has an exact inverse and the four ratchets are at zero — for *this* schema.
  A schema with a grid, or with a canvas transform, is where that discipline
  either holds or is revealed as tuned to one document shape.
