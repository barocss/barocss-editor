# Backlog

What is worth doing next, and why. Kept in the repository rather than in a
conversation, because a list that lives in a conversation is a list that is
forgotten between them.

[ROADMAP.md](./ROADMAP.md) holds the reason there is a next thing — what this is
for, and in what order. This holds the next thing itself.

## How this is kept

- **One entry, one thing a reader could notice.** "The ruler scrolls away" is an
  entry; "refactor the ruler" is not.
- **Say what is already there.** Most of what has been done in this repository
  was not building a feature but *reading* one the schema already had — five
  times over. An entry that names the code that already exists is an entry
  somebody can finish in an afternoon; one that does not is a research task
  wearing a feature's clothes.
- **Move it to Done when it ships, with the surprise it produced.** The surprises
  are the part worth keeping: they are what the next person would otherwise
  rediscover.
- **Add to it while working.** Anything found and not fixed goes in Open before
  the commit that found it.

Find what the schema declares and nothing reads — the sweep that keeps producing
these — from `packages/office-word`:

```
pull the keys out of each *FormatAttrs() group in src/formatting.ts,
strip comments from every other file in src/, and grep
```

Stripping the comments matters: prose mentioning an attribute makes it look
read. Then grep each *surviving* name for `format.<name>` specifically, because
the first pass has a blind spot that has now cost something: a name read for a
different meaning counts as read. `shadow`, `emboss` and `imprint` are character
formats *and* marks, and the marks made the formats look answered — a run that
arrived embossed from a style drew flat, and the sweep said the attribute was
covered.

The second blind spot is the other way round: a key built by template
(``table[`cellMargin${side}`]``) counts as unread, and the four `cellMargin*`
entries are that.

---

## Open

### Shell and navigation


### Attributes the schema declares and nothing reads

Each of these is in `src/formatting.ts` with a comment saying what it is for.

- [ ] **`fitText`** (cell) — deliberate: a measurement rather than a format.
- [ ] **`overlap`** (table) — whether two floating tables may sit on top of one
  another. Needs floating tables first, which nothing here has.
- [ ] **`langEastAsia`** — Word keeps a separate language for East Asian text.
  One element takes one language, so this needs a decision about which wins
  rather than a reader.
- [ ] **`hyphenationZone`** — the space Word allows at the end of a line before
  reaching for a hyphen. No equivalent in CSS.
- [ ] **`lang` arrives two ways.** The `spanLang` *mark* writes a `lang`
  attribute and the character format now writes one too. Two mechanisms for one
  attribute is one too many; which should own it is the open question — a mark
  spans a range of characters and an attribute belongs to a run, and Word's own
  model is the run.

### Every product pays for the whole standard node set

The office schema is built on the standard schema and takes its node set entire,
so a product ends up declaring node types it has no command for and no renderer
for. Word writes 24 exemptions for this and Slides writes 23, and the two lists
are nearly the same list.

One product's list is an opinion. **Two nearly identical lists are a design
fault**: the schema should declare what it offers rather than inheriting
everything, and until it does, every product after this one writes the list
again. That is the argument that was missing when this was first logged with only
Word's half of it.

### Word offers commands for things it cannot draw

Found by the conformance harness within an hour of it existing, and confirmed in
the running app: **`insertCallout` reports success, puts a `callout` in the
document, and draws nothing.** The reader's text is in the model and invisible on
the page.

`word-kit` calls `createRichExtensions()` — the whole rich-editor bundle — so
Word registers an insert command for every node in it and has renderers for
about half. Ten undrawn node types are reachable from Word's 166 commands.

- [x] **Word composes the extensions it can draw**, one at a time, rather than
  taking `createRichExtensions()` whole.
- [x] **An extension may bring a default renderer** — a floor, registered only if
  nothing has claimed the type, so a product's own always wins. `CalloutExtension`
  has one; the rest of the bundle does not yet.
- [x] **The other extensions have default renderers** — `Details`, `Figure`,
  `DescriptionList`, `Media`, `Columns`, `PullQuote`, `Toc`, each drawing the
  HTML element its node is named for.
- [x] **A check makes it impossible to forget** — `every-command-can-be-seen`
  asks the other question: not what the schema declares, but what the product
  *offers*. A product lists what each command produces; the engine cannot see it,
  and a guess from the name would lie in both directions.
- [x] **A command that produces a node the schema does not declare** has its own
  check now — `every-command-makes-something-real`, asked before the drawing
  one, because a command whose node the schema does not know cannot work at all
  while one whose node is undrawn merely works invisibly.

### The harness, and what it still cannot see

- [x] **Reachability replaced the group heuristic.** A node can appear in a
  document if the content expressions lead to it from the top node without
  passing through `resources`. No groups, no exemption for `numberingLevel`, and
  Word's examined count went from 61 to 106.
- [x] **`every-insert-is-accounted-for`** holds a product to the naming its own
  commands follow. Word's list covered 9 of its 23 `insert…` commands; it covers
  all of them now, and two of the nine were wrong — `insertMention` applies a
  mark rather than making a node, and `insertBookmark` makes a
  `bookmarkAnchor`, not a `bookmark`.
- [ ] **A command that makes a node and is not called `insert…` still slips
  through.** The honest limit of a convention check, written in the check
  itself.
- [ ] **Slides: 61 of 61 node types undrawn**, ratcheted in
  `packages/office-slides/test/conformance.test.ts`. That number coming down is
  the renderer work, and it must never go up.
- [ ] **The office schema should declare what it offers** rather than inheriting
  the whole standard node set. Nine node types are declared and unreachable,
  which is harmless only until a document arrives holding one.

The full list, with a reason each, is the exemption map in
`packages/office-word/test/conformance.test.ts` — and fixing one without deleting
its line there fails the build, which is the point.

### Slides — the second product

Chosen because the pieces were already there and because it is the one product
that forces a caret selection and a node selection to coexist. `packages/office-slides`.

- [x] **Schema.** Needed no new node type: a deck uses six stypes and all six are
  Word's. See below.
- [x] **Renderers** for a slide surface: absolute placement from `geometry`, and
  the scene nodes Word never drew. No `zOrder`: the model is a tree and a tree is
  ordered, so paint order is document order and bring-to-front is `moveNode`,
  which already has an inverse.
- [x] **A deck shell** — `apps/slide`. Not sharing `apps/word`'s chrome, which
  turned out to be the right answer rather than a shortcut: a deck has no ruler,
  no page furniture and no fit-to-width, and what it does share (the correctness
  CSS) moved into a package instead.
- [x] **Held to the harness.** Was a ratchet at 64 of 64 undrawn on day one; now
  `assertConforms` with 27 written exemptions.
- [ ] **Slide commands** — add, delete, duplicate, reorder, hide. The gap that
  stops this being a deck editor rather than a deck viewer.
- [ ] **Multi-node selection** — the spike's finding, and the first thing a slide
  editor needs that Word never did.
- [ ] **Direct manipulation** — drag and resize handles, alongside the caret that
  still has to work inside a `textFrame`.
- [ ] **Applying a layout.** `slideLayout` is drawn (hidden) and read by nothing:
  a new slide should start with its layout's placeholders, and a slide that
  follows a layout should take its formatting from it. Declared and unread, in
  a product written this week — the pattern does not stop being easy to commit.

### The shared layer

Measured in `docs/SHARED-LAYER.md` rather than argued: Slides takes four symbols
from `office-word`, the Word-only half is already 33 files that nothing shared
touches, and the whole obstacle is one 1,077-line `renderers.ts` holding the text
renderers and the page renderers together.

- [ ] **Split `renderers.ts`** so `surface` and the page renderers are their own
  file. Worth doing alone, and it turns the eventual extraction into moving files
  rather than untangling one.
- [ ] **Make the registry seam explicit.** Slides overrides five node types by
  registering after Word and relying on last-write-wins. It works and is stated
  nowhere; a product should be able to say it is overriding, and be told when it
  overrides something nobody expected.
- [ ] **`office-text`** — the extraction itself. Deliberately *after* a third
  product: two products give one data point about where the line falls, and
  Slides is the one that reused everything.

### What building the second product cost the first

Kept separate from the list above because these are engine and Word findings that
only a second product could produce.

- [ ] **A renderer cannot know its container.** Word draws `rectangle` as an SVG
  `<rect>` because in Word it only appears inside a `canvasBlock`; a deck places
  the same node on a surface among contenteditable text. The registry holds one
  renderer per node type, so Slides overrides the four shape types. A renderer
  *could* ask — a function renderer gets the node, and a node has `parentId` —
  except `exportToTree` drops `parentId` and `renderer-react`'s context stub has
  no `env`, so the answer does not reliably arrive. A renderer that draws
  correctly under one renderer and wrongly under another is worse than one that
  draws one way and says so.
- [ ] **`canvasBlock` in a deck draws nothing, and no check can see it.** It is
  Word's `<svg>` holding the four shape types, which in a deck are `<div>`s.
  `every-node-is-drawn` asks whether a renderer *exists*, one does, and the check
  passes on a node this product draws wrongly. The harness's own blind spot,
  found from the other side.
- [x] **A tag the browser owns is never a component.** A template child was
  dispatched through the registry by tag name with no exclusion for element
  names, so `element('line', …)` inside the `line` renderer rebuilt itself with
  the same model data until the stack ran out. Four node types collide today.
  The rule was already written in `native-html-tags.ts` and honoured nowhere.
- [x] **Correctness CSS lived in one app.** The list marker and the caret filler
  were in `apps/word/src/style.css`, so the second product to draw the same text
  got neither and the deck's bullets drew as four bare lines. Now
  `office-word/text.css`, imported by both.
- [ ] **`surfaceId` is declared and read by nothing.** `docHeader`, `docFooter`
  and (until this week) `surfaceNote` all carry it; Word binds headers the other
  way, by `surface.headerId` → `docHeader.id`. It cannot work as written: a
  surface's identity is its sid, and a sid is `session:counter` handed out at
  load, so no authored document can name one. Either delete it or decide what
  resolves it.
- [ ] **`th` centres its text and Word does not say otherwise.** The browser's
  default reaches the document because no renderer overrides it. Cosmetic in
  Word, obvious on a slide.

### The spike — what a document with no text in it found

`packages/editor-core/test/spike-no-caret.test.ts` stands an `Editor` up on the
Figma-like schema — boxes with coordinates, nothing that can hold a caret — and
records what works and what does not. It is a measurement kept as a test, so the
answer stays true rather than being taken once and remembered wrong.

**Works already, with no selection at all:** boots, holds the document, runs an
operation that names its target, and undoes it. The document layer is not
text-shaped.

- [ ] **A selection cannot name more than one node.** `SelectionManager.setNode`
  takes exactly one, and `ModelSelection` has no shape for a set — the type is
  start/end and offsets. Marquee three boxes and align them is the first thing a
  page builder does and the first thing this cannot express. **The first thing
  phase 2 has to answer.**
- [ ] **`editor.selection` is read-only**, so every product goes through the
  caret-shaped manager to set one. Fine while there is one shape of selection.

### Structure — from the roadmap's phase 1

- [ ] **`ModelSelection` lives in the editing layer and the document layer
  reaches up for it.** `model` imports from `editor-core` eleven times; eight
  are already `import type` and the other three are used only in type positions
  and are missing the keyword. Moving the type down to `schema` or `shared`
  makes the dependency graph a DAG.
- [ ] **`editor-core` declares `extensions` and `renderer-dom` and imports
  neither.** Two cycles that exist only in `package.json`.

### Known and unfixed

- [ ] **Outdenting a top-level list item lifts it out of the list.** The parent's
  parent of a top-level item is the document, and the engine has no rule against
  it — `indentParentTypes` constrains what a node may nest *under* and has no
  counterpart for lifting one out. Recorded in
  `packages/model/test/operations/indentable-schema.exec.test.ts`. A product has
  to ask for the constraint before it is worth adding.
- [ ] **No `.docx` importer.** The converter reads HTML, Markdown, LaTeX and
  writes PDF. Everything the schema knows about Word arrives only from
  `sample-document.ts`, which is why "the schema declares it and nothing reads
  it" keeps being the shape of the work.

---

## Done

Newest first. The surprise each one produced is the part worth keeping.

- **`mirrorIndents`, and hyphenation.** A paragraph that indents from the spine
  swaps its indents on a left-hand page — which needed the page a block lands on,
  and the shown number rather than the index, since a section that restarts its
  numbering restarts which side it is on. Hyphenation needed three attributes at
  once and had readers for none: the switch is the document's, the exception is a
  paragraph's, and a browser hyphenates by dictionary so neither is any use
  without a language on the text.
- **A function attribute that resolves to nothing drew its own source.** The
  vnode starts from the template's attributes, functions and all, and each is
  overwritten by what it resolves to — so one that resolved to `undefined` left
  the seed in place and the DOM read `lang="(d) => …"`. Returning nothing is how
  a template says an attribute does not apply, so every attribute that is
  sometimes absent was drawing its source the rest of the time. Fixed in
  `renderer-dom`, with a test.
- **Six character effects nobody could see.** `outline`, `shadow`, `emboss` and
  `imprint` drew nothing when they arrived as a character format — they are also
  *marks*, and the sweep counts a name read for a different meaning as read, so
  it reported three of them covered. They share one definition now, because a
  style and a mark saying the same thing have to draw the same. `kerning` is not
  a switch: Word stores the minimum font size it applies from, so the run's own
  size decides. `noProof` is not a format at all — the browser's spell checker is
  turned off by an attribute, so it goes on the element.
- **Zoom.** A `transform: scale`, not the `zoom` property — a page must break in
  the same place at every size, and a transform is visual where `zoom` is
  layout: measured, a paragraph keeps all eight of its lines under a transform
  and every length comes back multiplied by exactly the factor, where `zoom`
  gave 77.88px for 78. Three things it turned up. The measurement pass divides
  the factor back out, and reads it from the element rather than being told,
  because a measurement that has to be told the zoom is wrong whenever somebody
  forgets. A scaled element still occupies its *unscaled* room, so the frame
  around the page is given the drawn size. And the ruler's arithmetic needed no
  change — it works in fractions of the page — but it mixed the two scales:
  `getBoundingClientRect` reports the transformed box and `getComputedStyle` the
  untransformed value, so subtracting one margin from the other width put the
  text area 19px from where the text is.
- **A View group in the ribbon.** The only controls there that name no command:
  the editor has no idea a pane exists, which is the same reason the find box is
  the app's. Both switches drive one piece of state, so the pane's own close
  button and the ribbon button cannot disagree — two switches for one thing is
  two things a reader has to keep in their head.
- **The comments pane collapses.** It read the threads only while open, which
  was free and wrong the moment it could be closed on purpose — the strip that
  opens it says how many there are, and that is what a reader wants *before*
  deciding to look. Reading them either way also means the commented text stays
  marked while the pane is shut: closing it should put the discussion away, not
  hide the fact that there is one.
- **The shell, and the outline pane.** The window is the frame now — the chrome
  holds its place and the document scrolls in a pane of its own. Two things came
  out of it: the ruler had to learn to re-measure when that pane scrolls
  *sideways*, because a page wider than its pane moves under a ruler that does
  not; and a test that slept 800ms for a smooth scroll of seven thousand pixels
  was guessing at a number it should have been waiting for. The outline itself
  needed no new reading of the document — `tocEntries` already answered it,
  which is why a line there and a line in the contents agree by construction.

- **Tab leaders, and the paragraphs a contents list leaves out.** A menu on the
  ruler is drawn *inside* it, so every click in the menu was also a click on the
  ruler — a dot leader made a stop with no leader. And the dismiss-on-click-away
  listener runs at the capture phase, so it closed the menu ahead of the click it
  was meant to allow.
- **The ruler.** Three faults, all in the browser half: the margins are the
  *section's* padding and not the sheet's (a sheet is paper, drawn behind the
  text, and carries none); writing on every pointer move made one drag ten
  entries of the document's history and ended wherever the last processed move
  was; and taking hold of a stop and letting go is both how Word cycles its
  alignment and how a drag begins.
- **Tab and Ctrl+M.** Ctrl+M was bound to `indentNode`, which needs a schema to
  mark a node `indentable`, and none does — Word's own indent shortcut, dead.
- **One font per run.** Reading Word's three font slots was tried and reverted:
  CSS chooses by *coverage* where Word chooses by *script*, and a near-miss of a
  rule is harder to reason about than one font.
- **The operations a reader could not undo.** Fourteen roster exemptions saying
  "declares no inverse" about an operation that had since been given one. Ctrl+X
  and Ctrl+V were undone by nothing at all. `batch` is the primitive the nine
  that change more than one place were missing.
- **Reading a range that crosses two runs.** It came back empty — the iterator
  began at the document's root, and `getRootNodeId()` is undefined until one is
  registered, so the walk started at `undefined` and stopped before its first
  step. Five operations took that as "there is nothing here" and reported
  success.
- **A paragraph the text wraps around, when it will not fit.** Three separate
  faults, and the line heights were the subtle one: ink scaled up to the block's
  height is right for text and wrong for anything measured as a box, so the
  picture's band was drawn 98px and reported as 117.
