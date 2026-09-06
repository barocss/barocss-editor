# Word, measured after it was built

The first product, and the last to be written down. `site-builder.md` was written
*before* a line of that product existed, because a boundary recorded after the
fact is a rationalisation. This is the other case and has to be honest about it:
Word was built first, the shared layer was extracted from it, and everything
below is measured out of what exists rather than proposed.

Which makes it a different kind of document. The site builder's spec argues for
decisions; this one **states what is there, what is deliberately absent, and what
is owed** — and every number in it is produced by a test rather than by a person
looking.

## What a Word document is, in this model

A `surface` of kind `flow`, holding blocks, paginated at the product layer. The
schema said so before there were three products:

> `SurfaceKind.Flow` — Word, PageBuilder: flow content, **paginated or responsive
> at the product layer**.

So Word and the site builder take the *same* document shape and disagree about
one thing: Word cuts it into pages of a fixed size, and a site builder reflows it
to the width of a window. Neither is a new document.

What it holds, measured: **108 node types, 1,033 attribute slots** — which is
three times the deck's and eight times the site builder's, and is the whole
reason Word is where the shared vocabulary came from.

## What is Word's, and what only looks like it

| a word processor's word | this model's node |
| --- | --- |
| paragraph, heading, list | `paragraph`, `heading`, `list` — the standard schema's |
| character formatting | marks: `bold`, `italic`, `spanLang`, … |
| paragraph style | a `style` resource, resolved through `office-text` |
| table | `bTable`, `bTableRow`, `bTableCell` |
| section, page setup | `section` attributes on the surface |
| footnote, endnote, comment | `footnoteDef`, `endnoteDef`, `commentThread` |
| a drawing | `canvasBlock` holding the canvas vocabulary |

The last row is the one worth pausing on. **Word has a canvas**, and it is the
deck's canvas: a `canvasBlock` in the flow holds `rectangle`, `ellipse`, `line`,
`path`, `frame`, `group` — the same node types a slide places, drawn by the same
renderers. That is not Word borrowing from the deck; it is the reason
`office-canvas` exists, and it was extracted after both products wanted it.

**What is genuinely Word's** is the part no other product has asked for:

- **Pagination.** A page of a stated size, a header and a footer that repeat, a
  break that a reader forces and a break the text finds by itself. `office-word`
  owns the whole of it; nothing else in the suite pages anything.
- **Tab stops.** Measured by a layout pass into the environment the renderer
  draws from — which is why `tabs` is exempt from `every-attribute-is-read` (a
  renderer never sees it) and must never be exempt from
  `every-property-can-be-edited` (the ruler is the only place to set one).
- **Revisions and comments.** Tracked changes, accept and reject, a pane that
  lists them. The deck has comments; nothing else has revisions.
- **Fields.** A page number that knows its chapter, a cross-reference, a sequence.
- **Equations.** OMML, and a caret that moves between a fraction's slots.

## What the chrome is, and what that costs

Word's chrome is a **ribbon, a ruler, an overlay for shapes, and three read-only
panes** (comments, find, outline). Measured: **9 toolbar groups, 60 controls, 59
commands**.

All of it now lives in the package, its looks included: `@barocss/office-word/ui`
and `@barocss/office-word/ui.css`. Until this round the second door did not exist
— `office-word` was the only one of the four products with no `.css` door — so
every class that chrome draws was styled by `apps/word/src/style.css` and by
nothing else, and `@barocss/office-word/ui` drew correctly only inside that one
app. Two checks hold it: `office-ui/test/every-host-imports-the-style-door` (a host
loads the doors its dependencies open) and
`office-word/test/the-chrome-is-in-the-package` (no class this package draws is
styled only by the app). What is left in the app is its own frame — `.w-shell`,
`.w-chrome`, `.w-shell-document`, `.w-menubar` — and the input lab, which is an
instrument rather than chrome.

There is **no property panel**, and until 2026-09-06 there were no dialogs
either. That absence is the single fact that shapes everything below, and it was
not a style choice — it is where the product stopped. A ribbon is a good home for
a command that applies to a selection (bold, a list, an alignment) and a bad one
for a *value a reader types*, which is why every word processor that has ever
shipped has a paragraph dialog, a page-setup dialog, a borders dialog and a
table-properties dialog.

**The first of the four now exists**: 「테두리 및 음영」, on `office-ui`'s `Dialog`
— which the deck and the site builder had been drawing and Word had not. So the
sentence this section used to carry, *the first of them is also the decision about
what a dialog is in this suite*, was already stale when it was written: the
decision had been made, in shared code, by two other products. Word's borders
dialog cost a model, a command and a menu.

## What the harness measures, and what it is measuring against

Four numbers, all produced by `packages/office-word/test/conformance.test.ts`:

| | |
| --- | ---: |
| commands registered | 168 (156 Word's own) |
| attributes the product **draws** | 611 |
| of those, **unread** — declared and reaching nothing | 16 *(ratchet)* |
| of those, **unsettable** — drawn and reachable by nothing | 136 *(ratchet)* |
| attributes a reader can set, from the two declared surfaces | 21 |

Both counts are ratchets rather than exemption lists, and for the same reason:
neither is a set of decisions. Every entry is a control somebody will build, and
writing "owed" a hundred and eighty times is a hand-kept list wearing a harness's
clothes.

**The second number is the more interesting one**, because it could not be asked
at all until recently. `Control` declared which command a control runs and never
which *attribute* it writes — different questions, and a product whose only other
writing surface is a ruler had nowhere else for the answer to come from. With
`Control.writes` and `ruler-model.ts`, Word's two surfaces cover 21 of the 77
attribute names it draws.

## What is owed, in the order the harness puts it

The names left group themselves, and the grouping *is* the work list:

| owed | names | what it is |
| ---: | ---: | --- |
| ~~1~~ | ~~16~~ | ~~**a borders dialog**~~ — **done**, and it took 48 off the ratchet rather than 16; see below |
| 1 | 12 | **a field's own settings** — `tag`, `literal`, `sequence`, `limitLocation`, `showContents` |
| 2 | 8 | **page setup** — page size, margins, gutter, columns and their spacing and separator |
| 3 | 7 | **table properties** — `cellSpacing`, `hide*`, `noWrap`, `heightRule` |
| 4 | 5 | **paragraph spacing** — `spacingBefore`, `spacingAfter`, `spacingLine`, `spacingLineRule` |

plus a handful a **drag** writes on a drawing, which are exemptions rather than
work.

### The borders dialog took 48, and the first measurement said 96

Sixteen names were owed and **forty-eight** came off, because the sixteen are
declared on `paragraph`, `heading` and `listItem` alike and one dialog answers all
three.

The first measurement said **ninety-six**, and that number was wrong in a way
worth recording. `every-property-can-be-edited` asked `settable.has(attr)` — the
attribute **name**, with no node attached. Word's dialog writes a paragraph's
borders; a table cell and a page declare the same names; so answering for the
paragraph silenced the check on all three, and a table cell's borders — which
still have nowhere to be set — stopped being counted.

The check now accepts `node.attr` beside a bare name (bare still means *settable
wherever it appears*, which is what a font size is), and Word declares only the
pairs it really writes — `borderEditable()`, whose nodes come from the command and
whose attributes come from asking `borderPatch` what it writes. Table, cell and
page borders stay owed, which is the truth.

That is the harness finding a fault in the harness, and it is the second time:
`every-attribute-is-read` walks the schema, so a drawn-but-undeclared attribute is
not even a subject. **A guard that enumerates from one side can only find gaps in
that direction.**

Both ratchets went **up by four and one** when the shared frame learned where its
children sit along the axis and what its four sides are worth: `justifyContent`
and `paddingTop`…`paddingLeft` are drawn by `frameCss`, which is Word's own file,
and Word has nowhere to set them because Word has no panel. A number going up is
the harness working — the attributes are real, the drawing is real, and the gap
is the sixth dialog rather than a regression.

Read the other way, that table used to say: *Word can draw a bordered,
multi-column, precisely-spaced document and can only make one by opening a file
that already is one.* The **bordered** half of that sentence is no longer true.
Multi-column and precisely-spaced still are, and each is a dialog — the shape is
settled now, so what is left is the four of them.

## What is deliberately not here

- **A property panel.** The deck and the site builder have one and Word should
  not: a document is a column of text, and a panel that describes "the selected
  block" beside a page of prose is describing something a reader is not thinking
  about. The four dialogs above are the right shape for the same values — modal,
  entered on purpose, left behind. Said out loud because the alternative is
  cheaper to build and would be wrong.
- **Collaboration.** Deferred for the whole suite, with the order that was agreed
  instead — see `BACKLOG.md`.
- **Text shaping.** Word maps no tokens onto `office-ui` either: it imports
  `tokens.css` and takes the defaults, which is correct while its chrome *is*
  that palette.

## What the numbers have already changed

Three things about this document are worth keeping, because they are what a spec
written *after* the fact can offer that one written before cannot:

1. **The work list is not a judgement.** It is a query. Nobody decided Word needs
   a borders dialog; the check counted sixteen attributes it draws and cannot set,
   and they happen to be the borders.
2. **The absences are checked.** Every "owed" line above is a ratchet entry, so
   building one lowers a number and *failing to lower it* fails the build. A spec
   whose claims rot is the thing this repository has spent its whole history
   replacing.
3. **The one thing the harness cannot ask is what is missing from the
   vocabulary.** `cornerRadius` did not exist on a frame, so nothing was absent —
   a schema that declares less passes more easily. That gap is what this document
   is for, and it is the only part of it a person has to keep honest.

## 문서를 지킨다 — 2026-09-06

이 제품은 오늘까지 **독자의 작업을 지킬 수 없었다.** `apps/word/src/main.tsx:83` 이 새로고침마다
`createSampleDocument()` 를 실었으므로 쓴 것은 돌아오면 없었고, 갖고 있는 파일을 열 방법도 없었고,
새 문서를 만들려면 각주·콘텐츠 컨트롤·변경 추적·병합된 셀을 시험하려고 만든 **픽스처에서 남의 쪽을
지워야** 했다. 파일 메뉴에는 인쇄뿐이었다.

덱만 할 수 있었고 덱은 그 전부를 혼자 만들었다(818줄). 읽어 보니 **덱의 것은 넷뿐**이었다.

| | 어디 | 줄 |
|---|---|---:|
| 봉투 · 세션 sid 걷기 · 네 가지 거절 · 안전한 파일 이름 | `@barocss/shared` | 192 |
| IndexedDB · 이름 짓기 | `@barocss/shared` | 158 |
| 블롭 · 앵커 · 사파리 revoke · 잃을 게 있을 때만 묻기 | `@barocss/office-editor-ui` | 179 |
| **Word 가 자기에 대해 말하는 것** | `word-file.ts` + `word-library.ts` | **149** |

Word 가 대는 것은 넷이다: `barocss-word`, 독자가 부르는 낱말 **문서**, 판 번호 1, `.word.json`.

### 목록이 세는 것은 흐름 표면이지 쪽 수가 아니다

덱은 슬라이드를 세고 사이트는 페이지를 센다. 둘 다 **문서가 담은 것**이라 브라우저가 무엇을 하든
맞다. Word 는 다르다 — 쪽 수는 조판의 답이고 조판에는 브라우저와 폭이 필요하다. 목록이 *"12쪽"* 이라
적었다가 열어 보니 아니면 **안 적은 것만 못하므로**, 문서가 실제로 담은 것을 세고 이름도 그렇게
붙인다(`surfaceCount`).

### 새 문서는 비어 있다

`createStarterDocument()` — 제목·표면·빈 문단, 그뿐이다. 지워야 시작할 수 있는 예시 글은 픽스처
문제의 축소판이고, 이 제품이 바로 그것 때문에 새 문서를 못 만들었다.

`docTitle` 은 **없는 것이 아니라 빈** 것이다: 제목 줄은 찾은 노드를 고치므로 `docTitle` 이 없는
문서는 독자가 이름 붙일 수 없는 문서다. `wordTitle` 은 빈 것에 `undefined` 로 답하므로, 채우기 전에
저장하면 **문서** 라고 불린다.

### 제목을 읽는 것은 이 패키지의 것이 아니다

`docMeta → docTitle` 은 사이트가 자기 `<title>`·canonical·Open Graph 를 뽑는 바로 그 자리다. 셋이
같은 모양을 읽으므로 읽기는 `office-text` 의 `documentTitle` 이고, 여기 남은 것은 Word 가 그것을
부르는 이름뿐이다. 덱은 예외로 남는다 — **덱의 제목은 슬라이드다.**
