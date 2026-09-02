# What a page can hold, and what it cannot yet

Sixteen things a reader can insert, twenty-two node types the schema declares, and a list of what a
real site asks for that this does not have. Written because the question was asked plainly — *추가할
수 있는 다양한 컴포넌트나 스키마 노드가 있는지* — and the answer needed measuring rather than
remembering.

## What is there

Measured from `toolbar-model.ts` and the site schema, not from memory.

| a reader inserts | what it makes | how it works |
|---|---|---|
| 섹션 · 가로 · 그리드 | `frame` | one node, three `layoutMode`s |
| 제목 · 본문 · 목록 · 인용 · 구분선 | the flow's own | shared with the word processor |
| 이미지 | `picture` | `asset:이름`, sized per width, `srcset` on publish |
| 표 | `bTable` | seven parts, shared |
| 코드 | `codeBlock` | tokenised by grammar, weight not hue |
| 버튼 | `frame` + `goes` | a box with a destination, not a node |
| 아코디언 · 탭 | `frame` + `opens` | a checkbox and a label, no script |
| 폼 | `form` + `field` | `sends` names a connection |
| 목록(데이터) | `collection` + `dataset` | one design, drawn per row |
| 컴포넌트 | `component` + `instance` | variables, bindings, per-placement answers |
| 이모지 · 스티커 | `emoji`, `inline-image` | in a line, beside the words |

**Twenty-two block and inline node types**, every one drawn, and every insert accounted for by the
conformance run. There is no node here that nothing draws and no insert that makes nothing — which is
what the harness is for and is worth stating as the baseline this list is measured against.

## What a real site asks for and this does not have

Split by what it would actually cost, which is the only useful way to write such a list.

### Already possible — a composition, not a node

These need no schema at all. What they need is a **starting shape** a reader can insert instead of
building it: the insert menu offers primitives, and a page is mostly patterns.

- **타임라인 / 단계** — a column of frames with a rule between them.
- **별점** — a row of stickers, or a picture per state.
- **브레드크럼** — a row of links with a separator.
- **가격표 · 비교표 · 팀 소개 · 후기 · FAQ** — the sample builds all five out of what is here.

The honest gap is that a reader has to build each one. **A pattern library** — insertable
compositions, the way `insertAccordion` already is one — is the cheapest thing on this page and would
close most of it.

### A new attribute, not a new node

- **가로 스크롤 영역** — `clipsContent` is a boolean that means `overflow: hidden`. A third state
  (`scroll`) makes a row of cards swipeable on a phone, which is how every product grid works. One
  attribute, one line of CSS.
- **드롭다운 메뉴** — `opens` already opens a block on press and holds it open. What is missing is
  *closing on the next press elsewhere*, which the checkbox mechanism cannot do without a script.
  Worth stating as the boundary: this product ships no runtime, and a menu that will not close is
  worse than none.

### Built, and it cost no library

| what | how | script |
|---|---|---|
| **가로 스크롤 · 캐러셀** | `scrolls: 옆으로 / 넘김` — `overflow-x` + `scroll-snap` | **0** |
| **비디오** | `mediaVideo` → `<video controls>` | **0** |
| **임베드 · 지도** | `mediaEmbed` → `<iframe>`, provider + id | **0** |
| **두 칸 · 카드 셋 · 단계** | compositions, like 아코디언 already was | **0** |

Three things each of those found, worth keeping because none was designed:

- **A carousel's children must not shrink**, and no stylesheet can say so: `sizing` is written
  inline. The first fix used an important flag and the browser suite refused it — *a page a reader
  cannot restyle with their own CSS is not theirs* — so the node asks the document who its parent is
  instead, through the same access a `var:이름` is resolved by. Inside a scrolling row, **Fill means
  something different**: there is no space left to take, because the children decide the width.
- **`muted` is the one media attribute a browser does not reflect.** A media attribute is the
  element's *initial* state, so setting it on an element already built leaves `video.muted` false —
  measured as `muted="true"` in the markup beside a video playing sound. A published page is parsed
  from markup so the attribute is the whole answer there; a board builds elements, so the board needs
  the property said as well. `value` and `checked` are deliberately **not** treated the same way:
  those are what a reader is typing into.
- **Seven panel rows accepted a value and dropped it.** `setBlockFormat` keeps a whitelist and none of
  the new names were on it. Found by a test asking the fault list about an embed with no id — and the
  harness then reported **seven exemptions as stale**, including one keyed on `id` that had been
  quietly covering two different ideas: a page's durable id, which is never typed, and an embed's,
  which is nothing but typed.

### The old classification, and why it was wrong

**Re-examined, because the first pass was an assumption rather than a measurement.** These were
written down as needing *a runtime, a floating layer, or a third-party embed* — and the browser does
most of them natively:

| what | what it actually needs | script |
|---|---|---|
| **비디오** | `<video controls>` | none |
| **임베드 · 지도** | `<iframe>` with the provider's own address | none |
| **캐러셀** | `overflow-x: auto` + `scroll-snap-type: x mandatory` | none |
| **툴팁** | `states.hover` + `position: absolute` — both already here | none |
| **가로 스크롤** | the same `scroll` state a carousel is | none |

A scroll-snap carousel is better than a scripted one, not a compromise: it takes a swipe, it takes a
trackpad, it takes a keyboard, and it works while a page's JavaScript is still downloading.

**So the external-library question has an answer, and it is *no library*.** The editor may use what
it likes — it already ships React and a code editor — because that budget is a person's working
session on a machine they chose. The **published page** is a stranger's phone on a train, and this
product ships **zero bytes** of script to one today: `liveScript` only when a dataset is live, and
`closerScript` only when a page has both an opener and a same-page link. Adding a library to draw a
box that slides sideways would spend somebody else's battery on a thing CSS does.

### What genuinely needs a script, and therefore waits

- **라이트박스** — opening a picture full-screen is a state change with no CSS equivalent that
  survives a reload. `<dialog>` needs one line of JS to open.
- **닫히는 드롭다운** — `opens` holds a menu open; closing it on a press *elsewhere* is the same one
  line `closerScript` already writes for same-page links, and could be earned the same way.
- **세는 숫자 · 스크롤 애니메이션** — `IntersectionObserver`, and worth stating plainly: nobody has
  asked, and a number that counts up is a number a reader cannot copy.

The rule this product has followed and should keep: **a script is written only where it is earned,
by the page that needs it, and never as a library**. Both existing ones are a handful of lines emitted
into the page that requires them; neither is a framework anybody has to learn or download.

### Still genuinely out

### A new node, and a real cost

- **비디오 / 임베드** — `mediaVideo`, `mediaAudio` and `mediaEmbed` exist in the standard schema and
  office deliberately leaves them behind (`OFFICE_LEAVES_BEHIND`): a document that cannot play one has
  no word for it. **A page is exactly the product whose domain they are.** Taking them means office
  declares nodes only one of its three products draws, which is the thing that list exists to prevent
  — so it is a schema *decision*, not a feature: either the site builder gets its own vocabulary
  beside the office one, or the rule bends.
- **지도** — an embed with a provider, so the same decision.
- **라이트박스** — needs a floating layer above the page, which nothing here has and which is a
  runtime.
- **툴팁 / 팝오버** — the same floating layer.
- **캐러셀** — `opens` shows one of several, and the sideways movement is a script.

### The pattern in that list

Everything below the first section needs one of three things this product has decided not to have: a
**runtime**, a **floating layer**, or a **third-party embed**. Those are one decision, not five, and
it is the decision that has kept every published page a file a browser can read with JavaScript off.

The next thing to build is the first section, and it needs none of them.
