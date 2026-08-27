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

### A state can be promised, but nothing gets between one and the next

- [ ] `states` gives a block a hover and a keyboard focus, published as real CSS. A hover that
  arrives **instantly** looks like a bug on anything larger than a link — every design system pairs
  the two, and this one has no word for the pairing. One attribute and one CSS property, and it is
  the doorway to the thing this product still has none of: motion. A page built here has no scroll
  reveal, no transition and no hover fade, and that is the single largest difference between it and a
  page built anywhere else.

- [ ] **No `pressed`.** `:active` is the third state every button has and it was left out on purpose
  for now: it is the one a designer reaches for last and the one a test cannot easily hold. The
  vocabulary has room — `STATES` is a list — and `stateFaults` will name it the day it is added.

- [ ] **A state cannot differ per width, and one day one will.** Deliberate: a card that lifts under
  the pointer lifts at every width, and a two-level map would have bought the case nobody has asked
  for at the price of every reader wondering which of two places to set. The escape is written down —
  an `overrides` *inside* the state, the same map one level down — and nothing implements it.

### A template can be rewired, and cannot be given a new wire

- [ ] **A question cannot be renamed or removed.** `bindPartText` declares one and binds it, which is
  the half a reader needs to grow a card. The other half — rename, retype (`text` → `color`), remove
  — is still hand work, and removing is the one that needs a sentence before it: it changes every
  placement of the card at once.

- [ ] **A placement cannot override what the definition did not ask about.** A card whose padding
  should differ on one page has to become a second definition. Every component system grows this and
  every one of them regrets the shape it chose first; worth reading the deck's variants note before
  picking one.

- [x] ~~**Nothing detaches.**~~ Built. 컴포넌트 해제 turns an instance into a frame holding what it
  drew, values and all; the component and every other page using it are untouched. A data list's
  card is refused — that instance is the thing the list draws once per row, and detaching it would
  leave a list with nothing to draw.

  One thing it found: a nested placement was being copied **as it was drawn**, so the header's
  button lost the header's own 무료로 시작하기 and drew the component's 시작하기. A placement inside
  the thing being detached has to be copied *as it is written*, because it goes on following its own
  component — detaching a header must not detach the button in it. The deck's detach had the same
  fault and now takes the same argument.

### A code block can be written in, and cannot be coloured or kept plain

- [ ] **No auto-indent.** Enter inserts a newline and does not carry the previous line's
  indentation, so every line of a nested block is typed from column zero. The cheapest real
  improvement left in a code block, and it needs no library.

- [ ] **No line numbers, no bracket matching.** Each a slice, each without a library.

- [ ] **Reading state and edit state could be drawn differently, and are not.** While nobody is
  typing in a block its DOM is nobody's arithmetic — token spans, folding, line numbers are all free
  there — and a real editor could be *attached on entry* rather than embedded always. Almost none of
  the objections to embedding CodeMirror apply to that shape: nothing is nested while reading, the
  export never sees it, the swap point is one gesture. Worth evaluating the day a code block needs
  completion or diagnostics; not before.

### A list's card can be edited, and three things around it cannot yet

- [ ] **The preview does not follow the data.** A reader who opens the product card against row 3 and
  then edits row 3 in the data panel goes on looking at the words it had when they opened it: the
  preview is computed when the definition is opened and the *document's* revision is deliberately
  not one of its dependencies, because recomputing it on every keystroke forces a full redraw of
  three boards. Cheap to fix once there is a reason to; noted so the staleness is a decision.

- [ ] **A bound part refuses the caret and offers nothing instead.** It says where the words come
  from — `데이터에서 옴 · 이름` — which is the honest answer and half an answer: the reader's next
  move is to open the data panel and find that row themselves. The chip should be the way there.

- [ ] **Only `text` binds are previewed.** A bind may name any attribute; the preview substitutes
  words and nothing else, so a card whose *colour* comes from a row draws the definition's colour
  while showing the row's words. Nothing in the sample does this yet, which is why it was left.

### The tool's own layer stands between the page and the pointer

- [ ] The boards are covered by `.st-overlay`, which is what makes a click mean something on this
  product — and it means a page's own `:hover` never fires, because the page underneath is never the
  topmost thing under the pointer. The panel draws the selected blocks in the state instead, which is
  what every tool of this kind does and is the better answer for *editing*.

  It is still not the answer for **looking**. A reader who wants to see the page behave like a page
  has no way to ask, and the product has no preview mode at all. That is one mode and one
  `pointer-events: none`, and it is also where a sticky header, a scroll reveal and a form would
  first become visible — so it is probably the next thing rather than a nicety.

### `undefined` never reached an operation, so nothing could be taken back

- [x] `transaction` copied every operation with `JSON.parse(JSON.stringify(...))`, and JSON has no
  word for `undefined`: a key holding one is not written, so it is not read back. `setAttrs` reads
  exactly those keys — its own comment says *"'not set' is expressible for every type, once, here"* —
  so the removal branch **could not be reached from a command at all**.

  What it cost, measured in the site builder's panel: emptying a number field did nothing. The field
  goes blank, the command reports success, and the attribute still holds its old value. Every
  product had it, for as long as the copy has been there, and no test could see it because every
  test that removes an attribute calls the operation directly.

  `structuredClone` keeps the keys. The lesson is the one worth keeping: **a test that skips the
  layer that transports the work cannot see the transport lose it.**

- [ ] **The other products' panels have not been checked against this.** The deck writes through
  `setFrameLayout` and `setBoxFormat`, and each filters its payload with `typeof x === 'number'`
  before it ever reaches an operation — so a cleared field there may still be dropped one layer
  earlier, for a different reason. Worth the same probe.

### A frame has one border, not four sides

- [ ] Found writing the blog page's list of posts: a row of posts wants a **hairline between rows**,
  and `stroke` draws all four sides — so ten posts is ten boxes. Word's blocks have `borderTop`…
  `borderLeft` and a frame has one `stroke`, which is the canvas's word for an outline. A page needs
  the block's reading, and the sample says so by using no rule at all for now.

### The viewport is a plane now, not a scrolling pane

- [x] A reader said the zoom still pinned the top-left corner, and they were right: a scrolling pane
  can only hold a point still while it has scroll to give, and a builder **opens fitted** — scroll
  zero in both axes. `useWheelZoom`'s own comment says it gives way at the edges; that edge is the
  opening view. Zooming *out* from a fit can never be anchored at all, because the correction it
  needs is negative.

  `useViewport` holds the plane's own offset and scale and draws `translate(x, y) scale(z)`. The
  arithmetic is exact — `x' = px - (px - x)·(z'/z)` — with nothing to measure afterwards. A plain
  wheel pans, shift swaps the axis, ⌘ zooms about the pointer, space or the middle button drags.

- [x] **Selection chrome no longer shrinks with the page.** The overlay lives inside the scaled
  plane, so at 40% a one-pixel outline was 0.4 of a pixel and the name chip was unreadable — worst
  exactly when a reader has stood back to see more. Every measurement is now divided by `--st-zoom`
  and the chip is counter-scaled.

- [x] And a fit that fitted the wrong thing: the opening view took the plane's **height** into
  account, and a page is as tall as it turns out — measured, a 5,000px plane in a 928px pane put the
  boards at **0.19**, a fifth of their size, with every click landing 8px from a corner on whatever
  happened to be there.

- [x] The caret is drawn in the brand colour. A browser draws it one CSS pixel wide in the text's own
  colour, and on a canvas at 70% that is two-thirds of a grey pixel among grey lines.

### The engine has a selection layer and the site draws its own

- [ ] `EditorViewDOM` builds five layers in every view — content, decorator, **selection**, context,
  custom — and the site builder uses none of them: it draws `.st-overlay` beside the board and puts
  its outlines, name chips and drop line there. Two systems both claiming "the layer over the
  document", and only one of them is the engine's.

  It is not a straight swap. What the site draws is a *builder's* chrome — what a click would select,
  what a drag would do, which block a name belongs to — and it needs the product's hit-testing, which
  the engine's layer knows nothing about. But the split should be decided rather than inherited: a
  text selection and a caret are the engine's, and a block outline is the product's.

  Either way the layer sits **inside the scaled plane**, so both scale with the zoom. That is fixed
  for the site by dividing every measurement by `--st-zoom`; a layer outside the plane, in the pane's
  own coordinates, is the other answer and the one Figma takes.

### One document, three views, and one browser selection

- [x] **The caret went to a board the reader was not in.** Reported in one sentence — *"entering text
  on the desktop board puts the caret on the mobile one"* — and it is the fault every other input
  oddity in the site builder turned out to hang from.

  There is one `document.getSelection()`. Every view hears `editor:selection.model` and wrote it in
  turn, so the **last view mounted** won; and `DOMSelectionHandlerImpl` scoped its element lookups to
  `editor._viewDOM`, which is one slot on the editor holding — again — the last view made. So a
  caret meant for the desktop board was looked up inside the mobile board's copy of the same node and
  set there.

  Two fixes, both narrow: a selection handler belongs to **its** view, and only the **focused** view
  writes the browser's one selection.

- [x] What it was causing downstream, measured with a real composition through CDP: typing Korean
  into an existing sentence destroyed it from the second syllable, because the caret was in another
  view, the render re-anchored what it found, and the next commit replaced 68 characters. With the
  two fixes the sentence survives.

- [ ] **A residue, and it is not clean yet.** Under the same synthetic composition the second
  syllable lands *before* the first (`나가` rather than `가나`). It may be the simulation rather than
  the product — CDP's `imeSetComposition` is not an IME, and the same sequence leaves a jamo behind
  that a real IME would replace — so it needs checking by hand with a Korean keyboard before anything
  is changed for it.

- [x] And a smaller one on the way past: the IME path **announced** a selection change without
  setting it (`emit` where every other path calls `updateSelection`), so the model kept the range the
  replace transaction had left while the DOM held the caret.

- [ ] **`editor._viewDOM` is one slot.** The scope fix works around it; the model is that an editor
  has *a* view. Three products draw one document once each, and the site builder draws it three
  times — the slot should be a set, and anything reading it should say which view it means.

### The studio was measured after a reader said it did not work

Five reports, each of which turned out to be measurable in a line or two, and none of whose causes
were where the symptom was:

- [x] **"확대 축소가 제대로 되지 않는다."** Two faults at once. The three elements above the shell had
  no height, so `AppShell`'s `h-full` resolved to `auto` and the **window** scrolled while the pane
  never did — measured, a pane 3280px tall inside a 1000px viewport. And a `transform` does not
  change layout, so the pane's `scrollWidth` was the same number at every zoom: the boards drew wider
  than anything a reader could scroll to. A room sized `natural × zoom` around the scaled plane is
  what every infinite canvas does and what this needed.

- [x] **"확대할 때 selection 위치가 맞지 않는다."** It was the same fault: the marks were right and the
  thing under them could not be scrolled to. Held now by a test that presses ⌘ six notches in and
  asks for the distance between the outline and the block — one pixel of rounding, no more.

- [x] **"캔버스의 글자가 너무 작다."** A heading on the page was **12px**. Tailwind's preflight resets
  `h1…h6` to `font-size: inherit` and the app's body is the chrome's 12px, so every board drew a page
  in panel-label type. The published page had the opposite fault from the same cause — no scale at
  all, so a browser applied its own. `PAGE_CSS` is one string used by both, with **container**
  queries rather than media queries: a 390 board inside a 1600 window has to get the phone's type.

- [x] **"텍스트 편집 상태가 아무것도 표시되지 않는다."** Entering the words clears the node selection —
  rightly — and the marks draw from that selection, so a reader in text mode saw nothing at all. The
  overlay remembers the block it entered and draws a dashed edge with the way out on it.

- [x] **A zoom with no pointer** — a button, a typed percentage, 맞춤 — anchored the plane's top-left
  corner, so the page a reader was reading left the window. `useWheelZoom` holds the previous
  rectangle and anchors the middle of the view when there is no pointer to hold.

### The sample was rebuilt to be looked at, and the tool around it with it

- [x] The sample is a **designed site** now rather than a fixture that happened to render: ink and
  paper with one accent (a deep green, because the blue it was is the colour every developer tool
  reaches for), one radius scale, a rhythm of 96/64 rather than one padding everywhere, a navigation
  bar whose ends are pushed apart, cards with a shadow, a hero with a texture behind it, and a single
  dark band at the foot of each page instead of stripes down it.

  It is also where the four schema gaps came from: none of them was found by reading the schema.

- [x] The **chrome** was measured against the tools it competes with and four things read as
  unfinished. A board wore its name in a grey bar *inside* the white; the studio was a blue grey,
  which is the surface a designer's blues were being judged against; every region was fenced with a
  border, so one window read as six; and selection was two pixels of solid accent with a
  hand-picked second blue for hover. The studio, the board and its shadow are **suite tokens** now,
  because a deck and a page builder are looking at the same kind of room.

- [x] And a defect the rewrite found: a comment had been pasted **into the middle of a selector**, so
  `.st-mark-hover` merged with the rule after it and every name chip was painted the hover blue. The
  selected block's name had never used the accent.

- [ ] **The deck's chrome has not been through this.** It maps its own `--sl-*` palette and draws its
  own studio at `#1f2126`; the tokens it would now take are `--ou-studio`, `--ou-board` and
  `--ou-board-lift`. Word has no studio at all and will want one the day a drawing is edited on a
  canvas rather than in the flow.

- [ ] **A site has no motion, and a landing page is mostly motion.** Nothing in the model says a
  section fades in on scroll, and the deck's `motion` node is a *slide's* answer. This is the largest
  single thing a visitor would notice between a page built here and one built anywhere else.

### A page can be painted, and two limits that turned up with it

- [x] A box on a page had a flat colour, a line and one radius — a diagram's vocabulary, which is
  the same gap the deck found in `fill` and answered with a paint stack. A page now takes a
  **gradient**, a **picture behind** with its own opacity, a **shadow** and **four corners**, and the
  attribute names are the deck's *exactly*: two products spelling one idea differently is the fault
  this repository keeps finding in itself, one word later.

  The arithmetic is not shared and cannot be as it stands: the deck computes a gradient's axis
  against a box whose size the document states, and a page's box has neither until the browser has
  laid it out. `office-site` must not import `office-slides` either — two products depending on each
  other is how a shared layer stops being one.

- [ ] **These names are now declared twice.** Two is a coincidence, three is a component nobody
  wrote: the day Word wants a gradient on a canvas frame, `gradientFrom`…`cornerBottomLeft` move to
  `office-canvas` beside `isVarRef`, and each product keeps its own CSS.

- [ ] **`every-property-can-be-edited` counts rows, not panes.** A row declared under 모양 for a
  `surface` was in a pane a reader can never open — a page is never in a selection — and the check
  called it settable. The product's answer is that 페이지 holds everything a page can say; the
  check's is still owed, and `paint.test.ts` asks the question the way a reader meets it.

- [ ] **An override carrying `var:이름` leaks into the exported CSS.** `mediaRules` writes the
  narrower widths' declarations without resolving a token, because resolution happens in the
  renderer and a media rule is not rendered. Nothing in the sample does it yet, which is why it is
  a note rather than a bug report.

### A page is a thing a reader can make now

- [x] `insertPage`, `duplicatePage`, `movePage`, `removePage` — the four a page had none of. The
  sample's five pages were five pages because `sample-site.ts` wrote them in TypeScript, which is the
  same finding the datasets produced and the same shape: the *view* was finished — five pages drawn
  at three widths, a rail listing them, a panel that renames one and changes its address — against a
  document only a developer could change.

  They live in the **rail's list**, and that is the decision worth keeping: a page is not a
  selection, so a toolbar button acting on "the page" would act on something a reader cannot point
  at. The list is where a page is a thing with a row.

  A new page arrives wearing the header and footer of the page it follows — as *placements*, so
  editing the header still changes it — and one heading to type into. `insertSlide` settled the same
  question for a deck, and a site is more so: every page carries the same navigation.

  Removing one is the only act in this product that asks first, because what it costs is not on
  screen: `linksTo` counts the links into that page and the dialog says the number.

- [ ] **The link count does not say that one link can be a whole navigation.** Deleting 제품 breaks
  one link — and that link is in the `site-header` *definition*, so it is drawn on all five pages.
  Counting marks is the number that can be checked and the one `linkFaults` reports; what is missing
  is telling the reader *where* the link lives, which for a definition is "everywhere".

### A copy kept the words and dropped what covered them

- [x] `copyOf` reproduced `stype`, `attributes`, `text` and children — and **not `marks`**. Five
  gestures share it: duplicating a slide, pasting cards, taking the placeholders out of a layout,
  and making a component out of a block a reader has already built. Every one of them promised "the
  same thing, somewhere else" and returned the text in the wrong weight, with no colour and no link.

  Found while reading it for something else, and it is worth being specific about *why nothing
  caught it*: the words are identical, and a mark is not a node — so every check in the suite,
  which compares nodes or compares text, passes either way. `every-mark-is-drawn` was written a day
  earlier for the same blind spot one layer up.

### A page links to a page — and two things it turned up

- [x] A link stores `page:<id>` and the address is resolved where the mark is drawn, so renaming
  `/제품` to `/products` moves every link into it rather than breaking them silently. The fourth
  reference of this shape in the schema, after `var:이름` for a colour, `componentId` for a
  placement and a dataset's `name` — and the reason the export publishes a real `href` without a
  second resolver: `exportSite` draws through the same renderers the editor does.

  The sample now navigates: four `<a>` elements where there were four words that looked like links.

- [ ] **No command removes a page, and none changes a page's id.** Found writing the test for
  `linkFaults`, which reports links naming a page that is not there — and the fault could not be
  *made* through the product, because `_chosen` refuses a surface by name ("the page itself is not a
  thing a reader can remove") and `id` is exempt from the panel on purpose. A site builder that
  cannot delete a page is a gap on its own; what the link work adds is that deleting one has to say
  what it breaks, which is what `linkFaults` is for. The test uses a fixture until then, and says so.

- [ ] **`linkFaults` has no reader-facing surface.** It is the sibling of `collectionFaults` and
  `overrideFaults` and, unlike those, nothing draws it yet. A link with nowhere to go draws as
  ordinary words — that is the honest drawing — so the *only* way a reader can find one is a list.

- [ ] **A link out of the site still has no control.** `toggleLink` is registered and reachable by
  nothing here: the picker offers pages, which is the half that needed a model. An address box is the
  other half, and it belongs with whatever answers the same question in Word.

### Editing a definition is pointing the boards at it

- [x] A board takes a `rootId` and draws whatever node it names — the mechanism that draws one page
  at three widths — so a component editor is that, aimed at the definition's **part**. A `component`
  itself has no renderer (a definition is never drawn where it is kept), and its part is an ordinary
  frame. Nothing else in the window changes: the same rail, the same panel, the same selection,
  because the thing being edited is a stack either way.

  Three faults on the way, each of which only a browser could have shown:

- [x] **A destroyed view left its layers in the container.** `cleanupLayers` emptied and *cloned*
  them, which removes their listeners and leaves five divs behind — so a second view appended five
  more and the board held two content layers, one live and one an empty shell. Every query written
  against that board had a one-in-two chance of reading the dead one. React's strict mode is what
  surfaced it, by mounting and unmounting an effect. **A view that is destroyed and one that was
  never created should be the same thing.**

- [x] **A replaced element was diffed against the vnode it replaced.** One board drew a page and was
  then pointed at a definition: a `surface` declares `display: flex` and so does a `frame`, the
  element was replaced because the tag changed — and the new one came out `display: block` with every
  *other* declaration in place. Skipping an unchanged property is right for an element being kept and
  wrong for one that has just been made, because a new element has none of it. Three unit tests in
  `renderer-dom`, for a root and for a child.

- [x] **A board's root is never selectable, and inside a definition that is the one stack a reader
  wants.** The root plays the page's role — a selection whose only meaning is "everything" is what
  clicking nothing already means — so the definition's own padding, direction and colour could not be
  reached at all. Fixed without a new flag: the pointer walks from the `component` one level above
  the part, so the part is an ordinary child. The **drawing** root and the **walking** root are two
  different questions, and the rail needed a third — where a new block *lands* — because a paragraph
  put among a definition's declarations is a transaction that silently does nothing.

### An index that exported only one kind of thing, and a name with two meanings

- [x] Following the merge, `operations/index.ts` was written to export the **builders** — and the app
  went white. `buildTableGrid` was gone: the old `operations-dsl/index.ts` had been reaching back
  across the fence with `export * from '../operations/tableStructure'` for a dozen files, so those
  files' *other* exports — the table helpers, the payload types — were part of the package's surface
  and nothing said so.

  **A list of what one kind of export is called decides for callers what the rest of a file is for.**
  Every operation file is exported whole now.

- [x] **Two `defineOperation`s, one package.** Exporting the operations made them collide, which is
  the only reason anybody found out: `src/operation-dsl.ts` held
  `defineOperation(type, { validate, translate })` with a registry of its own, beside the
  `defineOperation(name, executor)` that all 63 operation files use. Measured before removing it —
  `applyOperation`, `DSLLibraryEntry` and `ModelContext` had **no callers anywhere**, and neither did
  `utils/dsl-context.ts`, the only file importing them. An empty registry whose name shadows the real
  one is worse than nothing.

- [x] **`node`, `textNode` and `mark` were sitting in the same place as the operation builders**, and
  were used about as much. The site's inserts and its sample are written with them now — a fixture is
  exactly where a raw object literal hides best, because a misspelt `stype` reads as a document
  decision right up until the schema refuses it.

  One thing that surfaced: `INode` and a fixture's loose node type do not overlap, because `INode` has
  required fields a *tree being loaded* has not got yet — the store fills them in. That is the honest
  relationship between a document on disk and a document in memory, and `loadDocument` is where it is
  crossed.

### One operation, one file — and a builder nobody could import

- [x] Asked while reading a site command: *why don't the extensions use the operation DSL — is it
  harder?* Measured, and the answer was neither taste nor difficulty:

  - `packages/model/src/operations/` held **68 files**: every operation's runtime handler, and 24 of
    them the DSL builder beside it — which is exactly the shape this package's own README shows.
  - `packages/model/src/operations-dsl/` held **37 files**, every one of them a duplicate *name* of a
    file in the first directory, holding that operation's builder. One operation, two files, with the
    same doc comment copied into both.
  - `operations/index.ts` was a single side-effecting `import './register-operations'`. So the
    **documented** kind — builder beside handler — could not be imported at all.

  Including `setAttrs`, the most used operation in the repository: **84 hand-written**
  `{ type: 'setAttrs', payload: { … } }` across three products, against 0 uses of any builder. That
  is almost certainly where the habit came from — the first thing anyone reached for was not there,
  so they wrote the object, and everything after it followed the local style. `setMarks`, `setText`,
  `setNode`, `selectNode`, `selectRange`, `clearSelection` and **`batch`** were behind the same wall.

  Merged: one operation, one file, 65 builders exported. `test/dsl-builders.test.ts` is the
  instrument — it reads the directory, finds every `defineOperationDSL`, and asks whether that
  builder can be **imported**. Nothing else would have caught this: the types said yes, every test
  passed, and the value was `undefined`.

- [x] **Two files, one name, two meanings.** Bringing them together is what made it visible:
  `DeleteTextRangeOperation` was the whole operation on one side and the *payload* on the other, and
  `WrapInListPayload` carried `extends Record<string, unknown>` on one side and not the other — so
  which one an importer got depended on which file they reached.

- [x] **A slicing script cut a type in half.** Deduping the declarations the merge doubled, the first
  attempt found the end of `type X = …;` by searching for the next `;` — which sits *inside* a union
  of object literals. `applyMark.ts` came out unparseable. Reset, and done again brace-aware, with
  the removal refusing anything that was not byte-identical. The lesson is the one already in this
  file: **edit source with an editor, not with a slicer**, and when a script must do it, make it
  assert what it is about to destroy.

### Export is a render, and that is what makes it an instrument

- [x] The obvious exporter is a walk that builds HTML strings, and it is the wrong one for a reason
  that has nothing to do with effort: a site builder's claim is that the thing on screen **is** the
  page, and an exporter that computes its own `display: flex` is a second answer to "what does a
  stack look like". Two answers drift, and the first divergence is a page that looked right in the
  editor and wrong when published.

  So export renders — the same `DOMRenderer`, registry, renderers and env, into a detached element.
  Which is what makes comparing the two a real check rather than a tautology, and the check found a
  real fault on its first run:

- [x] **An inline style beats a stylesheet, so every media query was correct and did nothing.** The
  renderers produce inline styles, which is right for an editor and fatal for a published page.
  Measured in a real browser at 390 pixels, on a row that stayed a row. The export now lifts each
  drawn element's style into a class of its own, so base and narrow have the same weight and the
  order decides — and no `!important` anywhere, because a page a reader cannot override with their
  own CSS is a page that is not really theirs.

  A class **per element**, not per node: a node's id is stamped on every element of its template, so
  a rule keyed by the id would reach inside a heading and restyle the span in it.

- [x] **A list is resolved, not stored**, so an exporter that walked the document would publish a
  page with one card on it. Rendering is what puts three there, sorted and filtered exactly as the
  editor shows them — and the browser test asserts the published page and the editor agree on which
  three and in what order.

- [x] **A token publishes what it resolved to.** `var:강조` is a fact about the document; a visitor's
  browser has never heard of it. The editor keeps the reference — so changing the token changes the
  site — and the export writes the colour.

### A panel can only be judged against a document that uses the properties

- [x] The site's inspector had three groups and was written **from the schema**. It looked complete,
  and the sample it was tested against used six attributes. So the sample was made dense — five
  pages, a grid, a fixed sidebar, two data lists, design tokens, a bound button — and the panel was
  written from *that*. What the exercise found, in order:

  - **A list's whole question was invisible.** Which dataset, sorted by what, how many, filtered to
    what: all of it in the document, none of it on screen. It is a tab now, and the columns come from
    the dataset's declared `fields`, so a reader **picks** a column instead of typing one — which is
    the reason `fields` is declared rather than inferred from the first row.
  - **A placement's answers could not be answered.** A card asks questions and a placement answers
    them; the only way to answer one was to write the document by hand.
  - **A page could not be renamed or moved.** A page is the board rather than a block — `SELECTABLE`
    leaves it out on purpose — so its name and address belong in the panel with *nothing* selected,
    which is where every builder of this kind puts them.
  - **Nine attributes a reader could see and not change**: what a stack is called, what a picture is
    called and where it comes from, how a heading ranks, what a border is. The command did not need
    splitting for them — they are all the same sentence, *this, about the blocks I have chosen, at
    the width I am looking at* — so `setStackFormat` widened and was honestly renamed
    `setBlockFormat`.

- [x] **A design token is a colour that says what it follows.** A site's `fill` may hold `var:강조`,
  and `ColorField` — the deck's control for `theme:accent1` — offers the site's own variables the
  same way. Two blocks the same blue are a coincidence; two blocks on `var:강조` are a decision, and
  the panel shows the second as **카드 바탕** rather than as a hex.

- [x] **A picture in the flow has no width to have.** The third node to learn it and the second to
  learn it from a page: `frame` first, then `instance`, now `picture`. A sample with three
  photographs in a row was refused with *Required attribute 'width' is missing* — on pictures whose
  whole point is that the row decides how wide they are.

- [x] **A page's stack must hold a heading *and* a button.** The office model says
  `(scene | frame)* | block+` — one branch or the other — because a canvas frame holds placed things
  and a document frame holds prose. A landing page's most ordinary section is a heading, a paragraph
  and a placement, which is two blocks and a scene node. The site widens both `frame` and `surface`
  to one alternation: **on a page, everything in a stack is a block.**

### What the site builder owes, measured

The third product's first run through the conformance harness (`packages/office-site/test/conformance.test.ts`).
Deliberately a **report** before it is an assertion: the point of running it was to find out what the
product owes. Word discovered these checks over months in a browser; the deck got them on its first
day and its failures were a work list. This is that work list.

| check | examined | owes |
| --- | ---: | ---: |
| every-node-is-drawn | 49 | **16** |
| every-attribute-is-read | 128 | **80** |
| every-insert-is-accounted-for | 7 | **4** |
| every-command-can-be-reached | 12 | **7** |
| the other five | 104 / 3 / 0 | 0 |

**After the work: every check asserts, and nothing examines nothing.** Two more came off the floor on
the way — the canvas layout extension was installed for an arrangement pass a flow page can never
use (a walk of every frame on every content change, with nothing it could ever do), and the product
had no *word* for its own node types, so `every-drawing-can-be-named` was passing by examining zero.
`kindOfBlock` is that word, and it answers **nothing** for a type the product has no name for —
which is the point, because `labelOfBlock` falls back to the stype and a fallback makes a missing
name look like a name.

**The first four were real work, and they are done.** What follows is what each cost and what it
taught; the rest became exemptions with written reasons, and the harness now asserts.

- [x] **16 node types the schema declares and the page cannot draw.** Almost all of them are the
  canvas's — `rectangle`, `ellipse`, `line`, `connector`, `path`, `sticky`, `group`, `canvasBlock` —
  and a page has no coordinates, so those are exemptions with a reason rather than work. The
  interesting ones are the *resources*: `component`, `componentVar`, `componentBind`,
  `componentValue`, `components`, `variable`, `variables`. A definition is never drawn — a
  **placement** draws it — so those are exemptions too, and saying so is the point: the check will
  fail the day one of them grows a renderer.

- [x] **`sizing` on a heading and a paragraph was declared and never read.** The schema was
  **narrowed** — containers only. A schema that offers a reader something nothing draws is worse than
  one that offers less, and nothing is lost: a reader who wants a hugging heading puts it in a stack
  that hugs, which is how every auto-layout tool works. *Was:* The site widened the
  schema to say any block may state its width, and only the container renderers call `sizingCss` —
  a text block's does not, because it is `office-text`'s and a site does not own it. Six findings,
  and the honest fix is probably to **narrow the schema**: a reader who wants a hugging heading puts
  it in a stack that hugs, which is how every auto-layout tool works. Decide, then either narrow it
  or read it.

- [x] **`setOverride` and `clearOverride` were unreachable — because `setStackFormat` replaced them.**
  One command that says "this, at this width" made two older ones dead, and nothing noticed until the
  check counted what a reader can run. Delete them.

- [x] **The site's key map lived in the app, where the check cannot look.** It is `keymap.ts` in the
  package now, with the matching in it too, so a chord written `Mod+d` and a handler that forgot the
  modifier cannot be two statements about one binding. The toolbar is `toolbar-model.ts` for the same
  reason. `every-command-can-be-reached` went from **7 findings to 1**, and the one left is
  `moveBlockInto`, reached by a drag — a claim on the record rather than a gap. *Was:* `Delete` and `⌘D` reach
  `removeBlocks` and `duplicateBlocks` — from a `keydown` handler in `apps/site`. The deck's key map
  is *data in the package* precisely so this cannot drift, and the site owes the same. Same for its
  toolbar: `slidesToolbarCommands()` is what feeds the deck's check, and the site's ribbon declares
  its commands inline in JSX.

- [x] **Four `insert…` commands from the shared kit were covered by no command check** —
  `insertText`, `insertParagraph`, `insertHardBreak`, `insertImage`. The product has to say what each
  produces, or say why it does not apply.

- [x] **`moveBlockInto` is reached by a drag and by nothing else**, which is right and has to be
  written down as a claim rather than left as a gap.

### The site builder, as it is built

Kept the way Word's and the deck's entries are: what was measured, at the moment it was measured.
The design and the reuse argument are in `docs/specs/site-builder.md`; this is the list of things
that were **wrong**, and what each one taught.

- [x] **The drawing did not follow a reorder.** Model `[b, c, a]`, page `[c, b, a]`. The commit places
  each child *before the next one*, which is only correct if everything after it is already right —
  and the walk goes left to right, so it never is. A reversal came out as a rotation. **Every product
  had it**: a slide moved in the filmstrip, a block moved up in a document, a card dragged along a
  row, and nothing in any suite looked at the drawn order. Fixed by placing each child *after the one
  committed before it* — the one thing already known to be in the right place — and only when the two
  are genuinely inverted, so the caret filler and a decorator's chrome are not dragged along.

- [x] **A proxy over a node inside the document goes stale.** The document's root object lives as long
  as the document; a node inside it does not — an operation that changes a parent's children may hand
  the store a *new* object for that parent. A view drawing a subtree held a proxy over the old one and
  redrew four sections after one had been deleted, for ever. A view with a `rootId` now asks the
  editor again on every render; a proxy is lazy, so it costs one object.

- [x] **A node selection does not survive an edit.** After a duplicate it came back as a `range` with
  its ends rewritten into the new nodes, so `selectedNodeIds` answered nothing and the very next key a
  reader pressed refused. A command that acted on a *set* has to say what the set is afterwards rather
  than hope — and for a duplicate the answer a reader wants is the **copy**, which is what every tool
  of this kind selects.

- [x] **A design system whose tokens are optional is one every app forgets.** The site used
  `office-ui`'s components and never imported `office-ui/tokens.css`, so every `var(--ou-…)` those
  components ask for resolved to nothing: no borders, no panel ground, the wrong type scale. Word and
  the deck have imported it since their first day, which is exactly why nobody noticed it was
  possible not to. Using a design system means taking its **variables**, not only its components.

- [x] **A control that needs the app to finish its layout gets finished differently by every app.**
  `PropertyEmpty` carried `px-1` and nothing else, so the one thing a panel shows most often sat
  against the edge. Fixed in `office-ui` rather than in the app.

- [x] **A drill cannot be written against the selection.** A double-click is `pointerdown, click,
  pointerdown, click, dblclick`, and its first press is an ordinary click that has already put the
  selection back to the outermost block — so a heading three levels down could not be reached however
  many times it was tried. What has to be kept is **where the reader is**, not what is selected.

- [x] **Playwright cannot click a canvas the ordinary way**, and that is the product working: the
  layer that owns the pointer covers the target on purpose. `force: true` dispatches at the same point
  and lets that layer answer. A suite that worked around it by clicking elsewhere would be testing a
  product nobody uses.

- [x] **A selector that names a property the product changes is a selector that lies.** The card row
  was found with `[data-layout="row"]`, and at 390 it is a column — the whole point of it — so the
  mobile assertion failed as though the override had broken something.

- [ ] **A stale dev server makes a suite lie for fifty minutes.** One run took 52 minutes and failed
  five tests on `waitForSelector`: a `vite` from an earlier probe still held the port with an old
  bundle, and killing it mid-run left the rest with no server at all. Kill the port before running a
  suite; the clean run of the same suite was 24 seconds.

### A view of part of a document had no way to say so

- [x] Three widths of one page are three `EditorViewDOM`s over one editor, and the only way to tell a
  view what to draw was `render(tree)`. That has a consequence nothing had written down: **`render`
  mutates the tree it is given** — `_sanitizeTreeContent` assigns to `content`. So passing the store's
  proxy wrote resolved nodes back into the document and crashed the tab; passing a deep copy left the
  view holding a tree that could never change, which is why the app re-rendered every board on every
  keystroke — **and that is what lost the caret**, because a full out-of-band render replaces the DOM
  under a reader who is typing in it.

  Both answered by `EditorViewDOMOptions.rootId`: a view that draws part of a document says so, asks
  the editor for that subtree, and takes the same path the main view takes. Every `EditorViewDOM`
  already re-renders itself on `editor:content.change` — there was never a second view that "was not
  listening", only a second view redrawing a tree that could not change.

  The deck's notes pane still copies, with a comment naming the wrong reason (it supposes the
  reconciler compares the model with itself; `Reconciler.reconcile` matches a fresh vnode tree to the
  DOM). It works, so it is left alone — but it should move to `rootId` when it is next touched.

### A screenshot found what the whole suite could not

- [x] The site builder's cards drew as a staircase on a phone — three stacked cards, each as wide as
  its own longest line — because `frameCss` aligns a stack's children to the start of the cross axis,
  which is right on a canvas and wrong on a page. **Every browser assertion in the suite passed.**
  They all asked about `flex-direction`; not one asked about width. One glance at the rendered page
  found it in a second.

  Kept as a rule rather than a fix: when a slice is about *layout*, look at it. A layout test asserts
  the property it was told to assert, and a page has a hundred others.

- [x] **A test that calls its own subject with `?.` cannot fail.** In the same slice:
  `expect(editor.getDocumentFaults?.() ?? []).toEqual([])` had passed since the product existed. There
  is no such method — the getter is `documentFaults` — so optional chaining turned *the API is not
  there* into *there are no faults*, while the editor logged a schema complaint on every load. Two
  invalid sample documents hid behind it. Never optional-chain the thing under test.

- [x] **A snapshot taken around the proxy skips everything the proxy does.** The site's per-width
  frames walked the store's raw nodes to get a tree the reconciler could compare — a real trap, and
  the wrong way around it. The proxy is where a placement becomes its definition's parts; walking past
  it drew every reusable header as an empty box, and a browser test asserting "the header is on both
  pages" passed on a placement with nothing in it. Read *through* the proxy, then copy.

### Resolving a placement is not worth a cache, and the numbers say so

- [x] Twenty placements of a ten-part card is two hundred resolutions per render, so a cache looked
  obviously necessary. Timed instead (jsdom, counting the store's resolver): a 20-card slide renders in
  **35ms**, re-renders in **16ms**, and asks for **1,000 parts** — because the view reads a node's
  `content` about five times in a pass. Those same 1,000 resolutions cost **2.7ms** on their own,
  0.003ms each.

  So resolution is a sixth of a re-render at worst, and a cache would buy ~2ms for an invalidation
  rule, somewhere to keep it, and a new way to be wrong — a stale part drawn after an edit, which is
  the fault the whole reference design exists to avoid. **No cache**, and §10b-15 keeps the table so
  nobody has to guess again.

  Re-run it with a probe rather than a test — a timing assertion in CI is a flake with a schedule:

  ```ts
  // packages/office-slides/test/zz-perf.test.ts (temporary)
  // Build a deck of N placements of a card with M parts, wrap `store.contentResolver` with a
  // counter, render twice with EditorViewDOM({ sync: true }), and print calls / ms / parts.
  ```

- [x] **Why five, answered — and three of the five were nobody's.** The stack behind every
  resolution, counted over a render of the sample deck: 520 resolutions, 3.19 per node, and the
  biggest caller was `separatePropsAndModel` building `{ ...data }` — a full copy of the node, which
  on a document whose children are *resolved* means resolving them again — for a half its only caller
  threw away. 162 of 520, 31%, for an object with no reader. Two more were the same mistake in our
  own code: `childrenOf` and `childCount` each testing `content` and then reading it, which is two
  questions where there is one answer. Read once into a name, all three: **520 → 324** resolutions on
  the sample deck, **742 → 488** on the 20×10 deck, and a placement's five reads are three (props,
  children, and the one question its renderer asks). About a millisecond, which is why the cache
  refusal above stands unchanged — the finding is that a third of the work had no reader, not that
  the reads were expensive (§10b-15).

- [x] **A chain of cards is drawn nine deep and then stops** (`NEST_LIMIT`), which is the cycle guard
  rather than a taste: a card holding a badge is ordinary, a card holding itself is an infinite
  descent, and a depth catches the mutual case a visited set alone does not. Measured: a chain twelve
  deep drew nine levels and **lost the rest in silence**. `nestingOf` walks the definitions — the only
  way to see past the point the resolution gave up — and the deck's own check now says it: 고칠 것 for a
  card that holds itself (a document cannot mean that), 볼 것 for reaching the limit (a fact about this
  product). Asked only of placements *in the document*, or a twelve-deep chain reports the same fault
  once per level at the same box.

### A placement draws its definition, and every walk had to say which tree it reads

A component follows its definition now (`canvas-model` §10b-2a): a placement holds no copies, and
what it draws is resolved in the proxy the view reads children through. The design is settled and
tested; what this entry is for is the thing that came *out* of it, which is more general than
components.

**There are now two trees, and every walk has to decide which one it means.** The document (what a
file holds, what a command may act on, what undo can take back) and the drawing (what an audience
sees). Measured, one walk at a time:

- **The deck's own check** read the document and went blind: a deck of twenty cards audited as
  twenty empty boxes — every picture without alt text, every 8pt caption, every unreadable
  contrast inside a definition the slide only *names*. Fixed by resolving each placement in the
  sweep (`auditDeck`), reporting the fault against the placement, because a drawn part's sid is
  synthetic and no command accepts it.
- **The arrangement** read and wrote the document, and could not write a part that is not in it.
  Moved into the resolution, where it costs no writes at all — and a resize of a card is now
  **zero** document changes rather than one per part per placement.
- **The layer list** reads the document, deliberately: a card is one row, and its parts are worked
  on by opening the card. The cost is written down in §10b-13 rather than hidden — a badge inside
  a card cannot be hidden, locked or reordered per placement.
- **The save** reads the document, structurally: `exportToTree` walks the stored nodes and the
  resolver is only consulted by the proxy. This is what makes the whole design safe.

**Still to decide, in order:**

1. - [x] **Find and replace see a placement's words now.** Measured on the sample deck first, and it
     is why this was wrong rather than incomplete: `매출`, `1,240만`, `이탈` are all drawn on the
     cards slide and all came back **없음**, while an ordinary title and a row in a card's slot were
     found. `deckMatches` resolves each placement (the audit's answer), and the question replace
     had turned out to have **three** answers rather than two:

     - the words are this **placement's answer** → replaceable, and the write is that placement's
       `componentValue`, so fixing a name on slide 6 changes slide 6;
     - the words are the **card's own** → found, named 카드, and **refused**: rewriting them from a
       find box would change every placement in the deck without saying so, so 바꾸기 greys out with
       the reason and 모두 says how many it left;
     - the words are the reader's own in a **slot** → ordinary document text, and the resolution walk
       skips anything with a real sid so they are not found twice.

     A value that is itself a reference to a document variable is refused with the second group: a
     literal written over it would quietly stop that card following the document. `replacePlan` puts
     a slide's run rewrites and value rewrites in **one** transaction, so a slide's replacement is
     one press of undo.
2. - [x] **Motion by name reads the document, and that turned out to be the smaller half.** The
     measurement found a fault nobody was looking for: `namedBoxes` read `name` off *every* node it
     walked, so the sample deck's cards slide offered a reader five things to animate that cannot be
     — `title`, `value`, `showBadge`, `accent` (a placement's `componentValue` answers, whose `name`
     says which variable they answer) and `One card, three places`, which is the **slide**. A step
     naming one of those animates nothing, silently. `isSceneType` is the one list of what a canvas
     places; asking it is the fix, and it took one line.

     The original question is answered by **refusing** it, with the reason written down (`timeline.ts`,
     §10b-2a): a card's parts are the definition's and are resolved at draw time, so naming one from a
     slide's track names something the document does not have — and two placements of one card draw
     two parts with the same name, so the ambiguity is systemic rather than accidental. A placement
     *is* offered, because animating a card as a whole is ordinary, and so is anything the reader put
     in its slot.

   - [x] **A card's own motion** (§10l), and the measurement made it small: given a `component`
     carrying a `trackId`, `trackFor`, `namedBoxes` and `slideTimeline` **already answered** — time
     lives beside the document, so nothing in the timeline model knew it was reading a slide. One
     schema attribute (`component.trackId`) and one reader (`cardSteps`) were the whole feature.

     Both questions answered by what the alternative would cost: the track hangs from the card, and a
     card's steps land in the **arrival group** so they add no presses — a slide with three of one card
     would otherwise cost three times the presses for one decision made inside the card. `withTiming`
     needed one correction for it: the first step of each placement's block restarts the chain, or the
     second card's `afterPrevious` waits for the first card to finish.

     Found on the way, and fixed first: motion addresses a shape by its sid, and a drawn part's sid was
     made of the *definition's* id — three placements of one card drew three elements claiming one
     identity. And the motion commands all refused a card's part, because `slideAt` walks to the
     nearest `surface` and a part has a `component` above it; `trackHostAt` is that walk, kept separate
     from `slideAt` rather than widening it, because the clipboard, the arrangement and the layout
     cascade all mean the surface when they say slide.

   - [x] **The slide's timeline says which cards animate themselves** — one line above the axis,
     naming them, with a press that opens the card. Not rows: the motion belongs to the card and has
     no per-placement copy to edit, which is the layer list's call about a card's parts (§10b-13). And
     not a lane, because these cost no presses and a lane would have nowhere to sit on the clock.

   - [x] **A card's motion in a scrolling show** — held at its end state, not replayed, because a
     scroll is scrubbing with another input device and a card's motion costs no presses. Measured on
     the way, and it was a fault: `group: 0` reads as *already played*, so an **exit** hid the shape
     before it had run — absent the moment the slide arrived, and absent for good in a scrolling show,
     where the arrival group is never run. The arrival group now never hides anything (§10l).

   - [x] **The presenter's screen names what has to be pressed.** It said *애니메이션 2 / 2* and
     nothing else, which reads as finished — so a presenter pressed forward and a reveal waiting for a
     click on a *shape* never came. `pressCount` is honest (a trigger costs no press), so the number
     could not be fixed; the missing thing was the other half of the sentence. `pressablesOn` reads
     the slide's steps and its cards' steps together and **names** each waited-for box — words rather
     than a count, because with cards the button may be a badge inside one of three identical
     placements: *지표 카드 · 타원* is a thing on the screen where `card-badge` is a name in a file. A
     slide's own shape is answered by `labelOfBox`, so the presenter reads the same words as the layer
     list; a card's part splits its drawn sid at the last `~` and the card supplies the first half.
     Nothing to say is said with nothing — a line that is always there is a line a presenter stops
     reading (§10l).

   - [x] **A trigger inside a card** works, and the belief that stopped it was half wrong: the show's
     click walk asks the **innermost** `[data-bc-sid]` first, so the element a reader pressed *is* the
     drawn part — only a name for it was missing. A card's trigger carries the placement in its `on`,
     `drawnNames` maps that name to the element, and pressing the badge on the second card leaves the
     first one still. Kept out of `namedBoxes`, because that list is what a *slide's* track may name
     and a card's part is not one of those (§10k).
3. - [x] **Copy of a placement carries the card now.** Measured first, and it was the worst shape a
     fault takes: pasting a placement into a deck without its definition **succeeded**, drew an
     invisible empty box, and no check anywhere mentioned it. The clipboard payload carries what the
     boxes need — the definitions they name, the definitions *those* name (a card holding a badge),
     and the document variables the bindings and the copied attributes reference — and the paste adds
     what the destination has not got, in the paste's own transaction so one undo takes back one
     gesture.

     Three decisions worth keeping: a pasted card is a **plain copy**, not a brand-kit import,
     because a clipboard has no library name to record and a reference that cannot be resolved should
     not be written; a destination that already has that id keeps **its own** card and the arriving
     one is renamed (comparing by signature, not by id), because overwriting would change every
     slide already using it; and a variable of the same name keeps the **destination's** value,
     because a paste that re-colours the deck it lands in is changing slides nobody was looking at.

     The net beside it: the audit reports `missing-card` (고칠 것), because a clipboard is not the
     only way to get one — an older file, or a definition deleted while placements of it sat on
     slide 40.

### A name means "a box motion can find", in both places that ask

- [x] **And a surface's `name` is the other thing entirely** — what the slide is *called*, drawn in
  the rail. Two namespaces in one attribute, which is safe only while every reader knows which it is
  asking about, and the last three faults here were all a walk reading `name` off whatever it stood
  on. Measured in both directions and pinned by tests: a slide called `shape-1` is not offered to
  motion, and a shape called `shape-2` never reaches the rail — `nameOf` falls back to the title
  placeholder's **words**, because `shape-2` in a rail is a name no reader would recognise (§10k-2).


- [x] `_nameTaken` and `_freeShapeName` read `name` off **every** node, while `namedBoxes` — the map a
  step's target is actually resolved through — offers only what a canvas places. So a `variable`
  called `shape-1`, or a `componentValue` whose `name` says which variable it answers, made `shape-1`
  "taken" for a name nothing could ever resolve to it.

  Harmless in practice, which is why it sat: the generator only ever asks about `shape-N` and skipping
  a number costs nothing. Narrowed to scene nodes anyway, because two readers of one idea that answer
  differently is how the next person gets the idea wrong — and `namedBoxes` is the one that decides
  what a name means.

### All four selection types have a producer now

`SelectionType` is `'range' | 'node' | 'cell' | 'table'`, and for a long time two
of them were declared, accepted by the validator, passed through by `setNode`,
and produced by nothing. Both have readers now — see Done — and what is left of
this entry is the *other* product.

Found by asking why the two products' selection modes differ. They do not: the
engine has one set and Word simply never makes a node selection, because a page
flows and every editable thing is in the flow, so "where the reader is" is always
a text position. Slides places, so the objects themselves are selectable and
their text is inside them — which is why it is the one product where both kinds
are live at once, and why `_nodeSelectionHoldsUntilGesture` exists at all.

**Kept, with a reader named.** Two cells in different rows are a *set*, which is
what `node` already means; what `cell` adds is that the set is cells, and the
code that needed to know was table editing. A selection of cells answers
different questions than a selection of shapes does: merge, split, insert a row
above, and what the toolbar should even offer.

- [x] **Table editing produces them**, in Word: drag across cells, or Shift+click.
- [x] **Slides' tables produce them too**, and it *was* the one-line install —
  the first attempt was wrong about why it failed. The deck's overlay is
  `pointer-events: none` while the reader is editing a box, so a pointer inside
  an entered text frame reaches the document exactly as it does in a page; the
  probe that "proved" otherwise had clicked once where it needed to click and
  then double-click. See Done for the four real faults underneath it.
- [x] **`table` has one too**, from the handle at a table's corner: the gesture
  that means "this table, as one thing". Delete removes it, guarded by
  `tableSelected` rather than `inTable` — with a caret in a cell, Delete is a
  character.

### Shell and navigation


### Attributes the schema declares and nothing reads

**This list is gone, and that is the point.** It is a conformance check now —
`every-attribute-is-read` — which renders a node with an attribute set and again
without it and asks whether the drawing changed. Nobody re-measures it; the tests do,
every run.

What was here was the failure the harness is built around, in miniature: a line each,
and a date — *"Re-measured 2026-08-18, and five came off"*. Between one look and the
next it said things that were no longer true, exactly like the fourteen stale
exemptions in the operation roster. Six entries had survived that re-measure; the
check found **thirty-three** in Slides and **362** in Word.

Three things came out of building it, and they are the reusable part:

- **A check that reports a finding falsely is worse than one that misses.** Seventy of
  the first hundred and nine were the probe's fault, not the product's: one value for
  every number made `cornerRadius` and its four corners indistinguishable; a made-up
  string is not a legal value of an enumerated attribute, so the renderer drew its
  default; an out-of-range crop was clamped to a crop of the whole picture; and asking
  each attribute *alone* missed every attribute that only matters in combination — a
  `strokeWidth` with no `stroke` draws nothing at all. Each of those cost a round of
  measurement, and each is now a test in `packages/conformance/test`.
- **The check pushed the schema to declare what it means.** `AttributeDefinition` has
  `options` and `min`/`max` because a fixed set written in a comment is readable by
  nothing: the same set was written again in every toolbar that offers it, and a value
  added to the drawing and not to the prose was invisible. The validator reads them
  too, so they are not a harness-only declaration.
- **Some attributes are read by something that is not a renderer**, and that is a
  decision rather than a fault. Those are exemptions keyed by the *attribute* rather
  than by the node — `Finding.family` — because `locked` came back on eleven node
  types for one reason, and eleven copies of a reason is the thing this repository
  keeps finding in itself.

What it found that was real, in Slides: a **numbered list drawn with bullets** (the
renderer read `listType`, a name nothing writes, while `wrapInList` writes `type` —
and the sample deck agreed with the renderer, so every test passed); **vector ink with
no paint at all** (a `path` read `d`, `fill`, `stroke` and `strokeWidth`, so the
deck's gradient and shadow drew nothing on it — now `svg-paint.ts`); a path that could
not be dashed; and a slide that did not record its own `kind` the way Word's surface
always had.

**Word's went 362 → 185 in one pass**, and how it split is the useful part:

- **108 were read somewhere that is not a renderer**, and are exemptions now, keyed by
  attribute: the paginator's (`keepNext`, `keepLines`, `pageBreakBefore`,
  `widowControl`, `cantSplit`, `isHeader`), the page-furniture pass's (the header and
  footer margins, the page numbering), the page the paginator measures (`marginTop`,
  `orientation`, a surface's width and height), the image-layout pass's (`distance*`,
  `offset*`, `side`, `shapeMargin`), the three resolvers' (`numId`, `numLevel`,
  `styleId`), and the contents page's (`caption`, `levels`, `styleFilter`,
  `outlineLevel`).
- **45 went by deleting them.** `boxBorderAttrs()` handed every block, table, cell and
  page all seven edge groups, so a *page* was declared to have interior borders and a
  *cell* a between-border. Each kind gets the edges it has now — the office schema's
  inheritance fault one level down, fixed the same way.
- **24 went by drawing them.** The four `*Space` values are the room a border leaves
  the text, declared on every kind of box and drawn nowhere: every bordered paragraph
  in the product had its line hard against the letters. Added to any padding already
  there rather than replacing it — a hanging indent is a `padding-left` and it is
  applied first.
- **A new rule came out of it, and it is the general one.** `options` is right only
  where the reader treats the set as **closed**. Word's border styles are
  `BORDER_STYLE[style] ?? 'solid'` and its stipples run `pct5` to `pct95`: declaring a
  closed set there would make the validator reject values the renderer draws, and a
  schema stricter than its product is a worse fault than a check that cannot see. Those
  are exemptions saying *"read, and the probe has no legal value to try"*.

Still open, each in a place that cannot go quietly out of date:

- [ ] **Word's 185**, as a ratchet in `packages/office-word/test/conformance.test.ts`
  with the four piles written out beside it.
- [ ] **Block revisions are recorded and never shown** (44 of the 185). `revisionId`,
  `revisionType`, `revisionAuthor` and `revisionDate` on eleven node types:
  `revision-record.ts` writes all four, and the only thing that reads any of them is
  `recordParagraphMerge` checking whether it already proposed one. Nothing draws a
  tracked change on a block and nothing accepts or rejects one — a whole feature
  written down and invisible. Run-level tracking is marks and does draw.
- [ ] **`borderBetween*` and `borderInside*`** (40 of the 185) — the single line Word
  draws where two bordered paragraphs meet, which needs the neighbour the way
  `suppressedSpacing` already asks for one; and a table's interior, which needs the
  cell's position and so belongs with the per-cell style layers rather than in
  `applyBorders`.
- [ ] **The OMML switches** (~25) — `hideSub`, `hideSup`, `hideDegree`, `plcHide`,
  `zeroWidth`, `strikeHorizontal`, `noBreak`, `operatorEmulator` and the rest: the
  maths model this schema follows, drawn by nothing, and not round-tripped either since
  there is no `.docx` converter.
- [ ] **`headerId` and the four other header and footer names.** A section names its
  header and nothing looks the name up. `sectionStart` likewise.
- [ ] **`paragraph.placeholder`** — nothing reads it. The prompt would show on an
  *empty* paragraph, and an empty paragraph here holds a caret filler, so `:empty` is
  not the test. Slides prompts from its layouts instead.
- [ ] **A conic or image fill on a path, and an inner shadow.** `svg-paint.ts` draws a
  solid, a linear and a radial; a conic has no SVG equivalent, an image fill needs a
  `<pattern>` sized to the shape, and an inner shadow needs a composited filter chain.
  Not half-drawn on purpose: a gradient that silently becomes a flat colour is worse
  than one that is not offered.
- [ ] **A reader-given name.** `name` is taken: it is how motion names a box
  (`shape-1`, `shape-2`, assigned by `setBoxBuild`, resolved by `namedBoxes`, and
  written into the deck file). Labelling the layer list by it put `shape-2` in the
  timeline where `동영상` had been — two tests caught it. A name a *reader* types is a
  different attribute, and the layer list is where it would be read.
- [ ] **`fitText`** (cell) — deliberate: a measurement rather than a format.
- [ ] **`overlap`** (table) — whether two floating tables may sit on top of one
  another. Needs floating tables first, which nothing here has.
- [ ] **`columnsEqualWidth`** (section) — blocked on something more interesting
  than effort. CSS multi-column *only* does equal columns: `column-count` divides
  the box evenly and there is no property for "three columns, the first twice the
  others". Unequal columns with text flowing between them is not expressible in
  CSS at all, so it would have to be the paginator's — measure and split per
  column, the way pages are already measured and split. The schema is also only
  half there: `columnsEqualWidth: false` has nothing to be unequal *by*, because
  there is no per-column width to state. Both halves are one piece of work.
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
- [ ] **Word does not wire `every-command-can-be-reached`.** Slides passes `own` and `reachable` and
  the check examines 96 commands; Word passes neither, so the check never runs for it and a Word
  command nobody can press is invisible to the harness — which is the exact fault the check exists
  for, in the product that has twice the commands. Measured while fixing `bgColor`: Word adds **131**
  commands of its own, and a naive `reachable` built from the ribbon model and the keymap leaves 69
  unaccounted for. Most of those 69 are reached some other way — the input handler owns the movement
  and delete commands, the palettes own the colours, the choice controls own the font and the size —
  which is precisely what an exemption is for. The work is building Word's `reachable` from its real
  chrome and writing the exemptions, and the answer at the end is a number nobody can guess today.

- [ ] **A command that makes a node and is not called `insert…` still slips
  through.** The honest limit of a convention check, written in the check
  itself.
- [x] **A command nothing surfaces is a finding.** `every-command-can-be-reached`
  asks the question underneath the other command checks: can a reader get at it
  at all. Written after the failure it would have caught — three clipboard
  commands registered, working, tested and reachable by nothing for a day, with
  every check passing, because the harness could read a toolbar and not a key
  map. A deck's keys are data in the package now, for the same reason its
  toolbar is, and the check reads both. The subject is the commands a product
  *adds*, measured as the difference between an editor built with its own
  extensions and one built with none — a list would be a fourth place to forget
  the thing the check exists to catch.
- [x] **Slides conforms.** Was a ratchet at 64 of 64 undrawn on its first day;
  now `assertConforms` with ten written exemptions and no findings — the other
  seventeen went when the office schema stopped inheriting what no office
  product draws.
- [x] **A renderer that exists and draws the wrong thing no longer passes.**
  `every-drawing-can-hold-what-it-contains` reads the tag a product draws each
  node type as and compares it with the tags of the types the schema lets that
  node contain: `<svg>` may hold only SVG, so a container and its contents drawn
  in different namespaces is a box that draws empty. It found six pairs in
  Slides, four more than the comment that reported the problem had named.
- [x] **A renderer whose children the parser moves is a finding**, by asking the
  parser rather than a list — `every-drawing-keeps-its-children`. See Done.
- [ ] **A renderer that draws the wrong thing for a reason no parser can see
  still passes.** Namespaces and HTML's structure are both decidable from
  outside; a renderer that draws the right element with the wrong geometry is
  still only visible to a person looking at the page.
- [x] **An attribute nothing reads is a finding**, and the hand-kept list of them
  is deleted — `every-attribute-is-read`, above. It found a numbered list drawn with
  bullets, vector ink with no paint, and a slide that did not record its own kind.
  Two mechanisms came out of it that the other checks now share: `Finding.family`,
  so a fact about an attribute is one entry rather than one per node type, and
  `Ratchets`, so a product can adopt a check that finds hundreds at once as a number
  that has to come down — which is how Slides adopted the harness in the first place,
  and which is now a feature of it rather than a thing each product improvises.
- [x] **The tests are type-checked**, held to a per-package number by
  `pnpm type-check:tests` — the same ratchet idea in another medium, and the entry
  above for what 1,359 unchecked errors were hiding.
- [x] **What a product renders *with* is part of the answer**, and now so is what its
  values *look like*. The probe reported 483 of Word's 597 attributes as unread until
  it was handed Word's own environment; the second half of the same trap was that it
  had no value to invent for an `array` or an `object`, so it answered "cannot be
  asked" — correctly — and skipped without counting. **A product now teaches it the
  shape** (`attributeReadFrom`'s `probes`), and the skips are counted and reported
  beside `examined`. All three products are at zero unanswered; see Done for what the
  count turned out to be hiding.

  What is still unsolved is the *combination* half. The probe asks about one attribute
  against one value of every other, so an attribute that only means something in a
  particular combination is invisible to it — `wrapPolygon` is read as `shape-outside`
  and only when `wrap` is `tight`, which the probe cannot arrange. That one is an
  exemption with the reason written; the general form would need the schema to say
  which attributes govern which.
- [x] **A document that is loaded is checked against the schema**, and it found a
  fault in Word's own fixture on its first run — see Done.
- [x] **The office schema declares what it offers** rather than inheriting the
  whole standard node set. Forty-six exemption lines across two products became
  zero, and the two products' undrawn sets turned out to be *identical* rather
  than merely similar — see Done.

The full list, with a reason each, is the exemption map in
`packages/office-word/test/conformance.test.ts` — and fixing one without deleting
its line there fails the build, which is the point.

### Slides — the work list

One list, ordered, and the only one: the phases are `docs/ROADMAP.md`'s Deck 1–5
and this is what each is made of. Every item names what already exists, because
an entry that does not is a research task wearing a feature's clothes.

Measured on 2026-08-19 rather than remembered — the deck has 139 commands and
fifteen canvas node types, and the last list that was written from memory had six
shipped features marked undone.

**Deck 1 — depth on the objects that exist.**

- [x] **Gradients, shadows, dashed strokes.** `paint.ts`, declared on the nodes
  Slides draws as HTML, reached through the panel.
- [x] **Text colour and highlight in the deck.** Word's two palettes, drawn by
  the deck's ribbon for the same reason it draws Word's font boxes. It turned up
  two faults nobody was looking for: applying a mark *appended* it, so **coloured
  text could not be recoloured** in any product — red then green kept the red —
  and `setBgColor` writes its colour into an attribute the schema does not
  declare, so it reports success and paints nothing. See Done, and the entry
  below for what is left of the second.
- [x] **A shape's text inset and vertical alignment.** A 텍스트 group in the
  panel, drawn for whatever declares `verticalAlign` — and `textInset` is new,
  because text with a fill behind it had nowhere to stand away from its own
  border. See Done.
- [x] **Crop a picture.** Double-click a picture and the handles take source
  away instead of resizing it; `fit` has a row in the panel, and so does the way
  back. See Done.
- [x] **Per-corner radius.** Four numbers, clockwise from the top left — and
  every box a reader rounds can be rounded now, where only the rectangle could.
  See Done.
- [x] **Nothing deselects a box** — and it turned out not to be the gesture that
  was missing. See Done.

**Deck 2 — transitions, then builds.**

- [x] **A track beside the document.** `motionTrack` and `motionStep`, declared
  with their first reader and not before. See Done.
- [x] **Slide transitions.** Seven effects and a length, played in the show and
  not in the editor — the smallest possible first use of time, and the one that
  names no shape. See Done.
- [x] **Builds on the objects.** Seven effects on the same track, one press per
  group, and the shape naming that a build needed and a transition did not. See
  Done. Emphasis effects, per-build timing and reordering are the timeline's,
  below.
- [x] **A presenter view.** The next slide, the note, the position and a clock,
  in one window with `S`. See Done — and the second window is its own item below.

**Deck 3 — masters and themes.**

- [x] **A master above the layouts.** `slideMaster`, one more level in the same
  cascade, plus the background coming down it. See Done.
- [x] **A theme.** Twelve colour slots and two faces, written where a colour
  goes — `theme:accent1` beside `#0ea5e9` — and resolved wherever the deck paints.
  See Done.
- [x] **Applying a theme to an existing deck**, keeping what a slide overrode —
  which turned out to be nothing to implement. See Done.

**Deck 4 — media, and then the timeline.**

- [x] **`mediaVideo` and `mediaAudio` come back**, with a renderer, a command and
  a control — enforced twice by the harness on the way in. See Done.
- [x] **Playback while presenting**, and stopping on the way out. See Done.
- [x] **A timeline.** A slide's steps as one list: the order, the timing, the
  presses, and a film in the sequence. See Done. What it is *not* is a strip of
  tracks with clips on it — see the entry below.
- [x] **Export to a file** rather than to a screen. See Done — and the thing it
  depended on was decided a fortnight earlier, when a build was made to name its
  shape by a name rather than by a sid.

**Deck 5 — templates, and what a reader starts from.**

- [x] **`component` and `instance` get a producer.** Done. Reading (1) below is what
  shipped — a placement holds real copies and following the definition is a command —
  and every "measured before starting" note under it turned out to be *half* right,
  which is why they are kept.

  What the notes got wrong, and how: a definition is not on a slide (it is in a
  **library** of its own, `components`, beside `resources`; the schema refused it in
  `resources` because it was in the scene group, and the answer was to give it a group
  and a container rather than to put it on a page); and the shared-schema decision the
  note said was needed was made — `instance` is not an atom, because a placement has to
  be able to hold a whole region a reader added.

  Four things measured *after* starting, each of which changed the design:

  - **Apply compared against the wrong thing and did nothing.** Comparing a part with
    its origin as it stands means every part differs the moment the definition changes,
    so the "an edited part is the reader's" rule protected all of them. A part now
    records what it was **given** (canvas-model §10b-9).
  - **A slot is always "edited"**, because the reader's boxes are in it — so a
    definition's change to the frame itself could never reach a placement anybody had
    used. A slot is compared without its contents and rewritten keeping them.
  - **A definition holding a literal colour is off-brand for ever.** The theme test
    found it: a colour variable's default names a theme slot (§10b-10).
  - **The library must contribute no box.** The ruler test found the same six pixels
    twice — once for `resources`, once for a library left visible because its children
    were hidden. `display: contents` is the answer (§10b-6).

  Still open, and each is a real gap rather than a tidy-up:

  - ~~**Nothing declares a variable yet.**~~ Done: the 변수 list in the components panel
    while a definition is open, and a part's 컴포넌트 부품 group for the bindings. Two
    panels because they are two questions — a variable belongs to the card, a binding to
    the box the reader has selected. A variable's **name** cannot be changed and the
    label can: the name is what a part binds to and what every placement answers, in the
    document, so renaming one is a migration through every deck that copied the card.
    Removing one takes the bindings and the placements' answers with it, in one
    transaction, because a binding pointing at nothing draws whatever it last had.
  - ~~**Resizing a placement** does nothing to its parts.~~ Answered by refusing it, and
    the measurement is why: a corner drag wrote 8280×6440 onto a card whose parts stayed
    5040×3960, so the outline grew and the card did not change. A placement's extent *is*
    its definition's — no resize handles, greyed fields with the reason, and a 크기 row on
    the definition that moves every placement with it. Scaling **one** placement still
    waits for a constraint model; the half-guess puts a badge outside its card.
  - ~~**A placement's parts are not in the layer list.**~~ Fixed: the list descends into a
    placement too, marks the rows that came from the card (`data-layer-part`), and skips
    the `componentValue` children — which is what keeps the conformance exemption saying
    "it never appears in such a list" true.
  - ~~**The stage scales a focused definition by the slide's size.**~~ Fixed, and it was
    worse than the note said: the stage fitted the **constant** `SLIDE_16_9`, so a 4:3
    deck drew at the scale for a wider one with 662px of ruler across a 497px slide, and
    a definition drew at that same scale whatever its size. `stageFit` in the model
    answers it now — the surface the reader is on, or the widest slide for a strip — and
    presenting a deck that is not 16:9 was fixed by the same line.

  The original notes, kept because they are the argument the design came out of:

  **Two things measured before starting, because they decide the shape of it.**

  *A component is a scene node, not a resource.* Putting one in `resources` is
  refused by the schema — "type 'component' is not allowed here by content model
  `resource*`" — because it is in the SCENE group. So a definition lives *on a
  slide* the way Figma keeps components on a canvas, which also means a deck needs
  somewhere to put them (a library slide, or the master) before any of this is
  usable.

  *And the engine cannot draw one node's subtree inside another.* `slot('content')`
  renders **this** node's children and there is no builder for "render that node
  here"; `component(name, props)` is a registered *component* by name, not a model
  node by sid. Measured: an `instance` renderer sees `content: []` and draws an
  empty box, with the definition nowhere in it.

  Which leaves three readings, and they are not the same work:

  1. **An instance holds children** (copies), and following the definition is a
     command that re-copies. Draws, edits and animates for free — everything
     already works on ordinary boxes — and makes overrides nearly free too, since
     an instance's own children are edited in place. Costs a **schema change**
     (`instance` is `atom: true` today) in the *shared* office schema, so it is
     Word's decision as much as Slides'.
  2. **The view expands instances**, cloning the definition's rendered DOM the way
     the echo trail does. No engine work and no schema change; instances are not
     editable and their text is not real text, which is wrong for a template.
  3. **Placing a component inserts a copy** with no live link — PowerPoint's reuse,
     Canva's elements. Simplest, genuinely useful, and does not use the `instance`
     node at all, which is worth saying out loud rather than pretending otherwise.

  (1) is the one the engine supports and the one Figma's own format resembles. It
  needs a decision on the shared schema first.
- [x] **The deck's own check looked at half the deck.** Measured while reading how the layer
  list stops at a placement: `auditDeck` filtered the slide's **direct children** and never
  descended — so a picture with no alt text inside a group, a frame or a card was not looked at,
  and the panel said *"훑었습니다. 걸린 것이 없습니다"* about a deck full of them. `PLACED` even
  named `group` and `frame`, so the containers were counted as shapes while their contents were
  not, and `instance` was not in it at all.

  Three things fell out of fixing it, each its own small correction:

  - A nested box is measured against the slide, not against its container — a rectangle 1000
    twips inside a group at 18000 is at 19000, and the raw number called it safely inside.
    `spaceOriginOf` is the one implementation of that rule.
  - The **text** checks now ask the box that holds the text. `textRuns` walks a subtree, so a
    group reported its child's small text with the group's sid: a row that selects the group and
    leaves the reader looking for the words.
  - A fault inside a card says the fix is in the card, because otherwise the reader is about to
    write the same alt text on twenty slides. The fault is still counted once per placement:
    three slides with an undescribed picture are three slides.

- [x] **Four answers to "what can a reader go inside".** The overlay's (for the double-click
  that enters one), the layer list's (which rows have children), the deck's own check (which got
  it wrong and never looked inside a group at all) and the slide's *name* (which did not descend,
  so a title inside a frame or a placed card left the filmstrip blank). `isContainerType` is the
  one list now — a frame, a group and a placement — and the reason a placement is on it is
  written where the list is: its parts are real boxes a reader may edit, which is how an
  override is made.

- [x] **A frame arranged its children and never sized them.** `layoutStretch` (fill the frame
  across the axis) and `layoutGrow` (share what is left along it) — the part of Figma's
  constraint model that auto-layout actually spends. Measured on the way: a frame **could not
  hold a frame** unless it held nothing else (`frame > [rectangle, frame]` was refused), so the
  ordinary card shape — a frame with a title and a row of cells — was impossible; `frame` is
  `(scene | frame)* | block+` now. And the word 채우기 was already taken in the properties panel
  by *paint*, so the switch is 가득.

- [x] **A card built out of a frame can be resized in place.** A placement has no arrangement,
  but a part told to fill it is as big as it is — so the drag reaches the card, the part, and the
  rows that part arranges: three levels from one gesture. The handles are offered exactly where
  that answer exists and refused where it does not. Two measured corrections came with it: a part
  whose box an arrangement decided is left out of its signature (or a resized placement looks
  edited in every part and apply leaves the whole card alone for ever), and the arrangement had
  to converge in **one** pass — the reaction guards against re-entering while its own write is in
  flight, so a pass whose writes changed a deeper pass's inputs left the tree half-arranged and
  nothing ran again to fix it.

- [ ] **Per-edge constraints** for an absolutely placed box — pin to an edge, scale with the
  parent. What Figma answers the general question with, and what a *placement* would need to be
  resized on its own (canvas-model §10b-12). The measured reason to wait: nothing propagates to
  a placed box at all today, so a half-answer (scale everything proportionally) puts a badge
  outside its card the first time a reader drags a corner sideways. The frame's arrangement is
  the answer for anything built out of frames, which is the recommended shape for a resizable
  card.

- [x] **The definitions a deck inherits from are editable.** A layout and the master open the
  way a component's definition does — the mechanism §10c said would serve all three — with their
  own panel group (name, background, how many slides a change reaches) and 따르는 장에 적용.
  Three measurements came out of it: `slideMaster` and `theme` were **drawn by nothing**, so a
  master's placeholders could be read and clicked by nobody; a layout has **no size of its own**
  (it is the shape of the slides that follow it, so the fit arrives from `stageFit`); and
  `setBoxStyle` refuses a node that is not a box, which is why nothing could ever change what a
  layout *was*.

- [ ] **A layout's own graphics do not appear on the slides that follow it.** Measured: a
  rectangle added to a layout draws on no slide. Which is the components' rule in a second place
  — a template cannot draw a foreign node — so the honest options are what `applyDesign` does
  (copy the arrangement when asked) or a real transclusion, and the second one has the hazard
  written up in §10b-2: everything that walks the tree, including the save, would see children
  that are not in the document. PowerPoint draws master graphics live; this does not, and says so.

- [x] **A deck that is not a line.** A shape a reader presses and the page it shows: `surface.id`
  (a page had no durable name at all), `goTo`/`goToKind` on the shape, `setBoxJump` (which mints
  the target page's id, like motion naming a shape), the show honouring a press, and two audit
  faults — a button pointing nowhere, and a page nothing leads to. Measured first, and it is why
  this was small: `present.tsx` already collected the shapes whose press runs something and
  already had the rule *a press that fires one does not also advance the deck*.

- [x] **The deck's map.** Pages as a graph — `layoutGraph` for the ranks, the deck's own
  connector router for the arrows, the spine drawn faint beside the jumps, and the two things a
  filmstrip cannot say (a page nothing leads to, a button that leads nowhere). A view: nothing is
  written, so a page cannot be dragged. It found a real modelling error — the first reachability
  rule reported five of the sample's six pages as unreachable the moment one button existed,
  because *pressing on* still reaches them; an island is a **hidden** page nothing links to.

- [x] **Dragging a jump in the map.** An arrow's end, dropped on another page — the connector's
  own gesture. The question that decided it: *which button* is not answerable by a drag between
  two pages (a page holds one, four or none), so the drag takes hold of the button that is already
  there and making a new one stays in the panel.

- [x] **Links only.** `document.advance` — the first deck-level setting this schema has, because
  "what does a click mean here" cannot be answered per page. A press plays the next build and then
  stops; the scroll show is refused (a scroll is a line); the presenter is not promised a next
  page; the map draws no spine and the check asks the larger reachability question.

- [x] **A button that opens another deck** at a page. `goToDeck` + `goTo`, where what can be
  pointed at is a **source the product can fetch** — there is no library of decks, so there is no
  id for "the pricing deck". Three things follow from *another document is not in this one*: the
  model resolves nothing, the check warns (볼 것) rather than telling, and a failure to open is
  said out loud instead of being a button that does nothing in front of a room.

- [x] **A library of decks.** The reader's own, by name — the naming in the model
  (`deck-library.ts`: durable, unique, derived from the deck's title) and the bytes in the app
  (IndexedDB, chosen by measurement: a pictureless deck is 8–42KB and one photograph is a base64
  megabyte, so `localStorage`'s five would fail by throwing in the middle of a save). `goToDeck`
  now holds a name *or* an address, resolved by the host, because the same deck is a name here and
  an address on a machine that has never seen this library.

- [x] **A shared component library.** A definition copied in from another deck, remembering the
  deck, its id there and what it said (`fromDeck`/`fromId`/`fromSignature`) — so "the brand kit has
  moved on" is a string comparison and the newer copy is *offered*. A reference was never available
  (a template cannot draw a foreign node), which is why this is the same shape Figma has across
  files. `accessOfTree` is the piece that made it possible at all: another deck answered like a
  store, without being loaded.

- [x] **A definition behind its brand kit says so in the components panel**, not only in the
  library dialog. The comparison is pure and the reading is storage, so the app reads (when the
  panel opens — a keystroke is not a reason to open three files) and the panel is handed a set.

- [x] **The 다른 덱 field offers the library's names**, and keeps 직접 입력 for an address. It was a
  free-text box asking a reader to type a name they had no way to see.



- [x] **A variable could drive exactly three things.** Measured: `bindText`/`bindFill`/`bindVisible`
  were three attributes on every canvas node, so a `number` could only ever be text and a card's
  corner radius, a frame's gap and a badge's opacity were unreachable — and the only way to reach
  them was more attributes in the *shared* vocabulary, each costing an exemption in every product
  that does not read it (Word had three). A binding is a **declaration node** on the definition
  now (canvas-model §10g-2): any attribute a part declares, any named piece however deep, one list
  per card, nothing on the placement's copies, and three exemptions off Word's list. The panel
  offers what the part declares and the command refuses the rest, which is the check a content
  model cannot make.

  Two things fell out of it. A placement is now created with the card's **defaults** substituted —
  an empty value map meant the bindings were skipped, which only looked right while they lived on
  the parts and the author had written the same words twice. And a `number` variable becomes a
  **number** where it lands, because the document keeps a variable's value as a string (one shape to
  write, diff and check) and an attribute that means a length has to be one.

- [ ] **Variants, instance swap and document-wide variables** are deliberately not taken from
  Figma; the reasons are in canvas-model §10g. Worth revisiting only with a measurement: a card that
  genuinely needs a *structurally* different shape per state is the case a `choice` cannot cover.

- [x] **A placement draws its definition, live.** The engine can transclude after all, and the first
  answer was wrong about *where*: a renderer that builds the parts' elements evaluates every one of
  them against the placement (measured — two parts with the placement's box and sid), while a
  resolver in the proxy the view reads children through gives each part its own data. One hook on the
  store (`setContentResolver`), and the save is untouched because the save has its own walk.

- [x] **Took out the machinery that copies belonged to.** `applyComponent`, `componentApplyPlan`,
  `instanceState`, `componentStale`, `partCopy`, `placementFills`, `instanceSlot` and the `partOf` /
  `appliedFrom` attributes are gone, with the 적용 button, the 모두 적용 button and the 뒤처짐 badge.
  What stays is the brand kit's copy (§10f), where a definition really is in another document — now
  the only place in the product where anything can fall behind anything. What replaced the panel's
  count is the question a reader actually has: **how many places use this card**, so an edit is made
  knowing what it reaches.

  The resize moved into the resolver as planned, and it turned out to be the better place rather
  than the necessary one: `fillChildren` and `layoutChildren` run over the resolved tree, parent
  before child, so one drag changes the placement's own box and **nothing else** in the document.
  Two things fell out of it — `setBoxLayout` refused 가득 on a card's own part (its guard demanded a
  laying-out frame for a parent, and a card's part has a `component`), and the deck's own check went
  blind to everything inside a placement. Both fixed; the second is the entry at the top of this
  file, because it is a question every walk in the product now has to answer.

- [x] **The component model moved to the shared canvas layer** (`canvas-component.ts`,
  `canvas-instance.ts` in `office-word`), because the schema that declares `component` and
  `instance` is the office schema — Word's canvas already has cards in its document format and just
  has nothing that reads them, so two readings would be one of them wrong. The commands, the panels
  and the deck library stayed: making a card out of a selection needs "the surface the reader is
  on", which is a deck's question. Found by the move: `DeckAccess`/`DeckNode` were declared
  field-for-field twice, and `deckComponents` had a product's name on a shared function
  (`componentsOf` now). Re-measured what Slides takes from Word — **22 import sites, 65 symbols**,
  up from four — and `docs/SHARED-LAYER.md` now proposes a second package, `office-canvas`, out of
  the seven `canvas-*` files that a word processor reads none of.

- [x] **Document-wide variables.** A `variables` container beside `components`, `variable` nodes, a
  reference written where the value goes (`fill: 'var:주의'`), one walk resolving it beside the
  theme's, a panel that says how many places use each one, and the picker offering the document's
  colours beside the theme's twelve — so nobody types `var:`. A `componentBind` may name either the
  card's variable or the document's, **card first**, so importing a card into a deck with the same
  name cannot change what the card means. §10h.

  What the measurement allowed, and it shaped the whole scope: a reference **commits** into a string
  attribute and is **refused** in a number or a boolean (`cornerRadius`, `width`, `visible` — the
  whole transaction fails, which is the validator doing its job). So a number or a state reaches a
  shape through a card, where a binding is a declaration and the conversion happens off the
  document.

- [x] **A bare shape takes a number, a state or its words from a variable now** — `varBinds` on the
  shape, `{attr, var}` like a card's binding, resolved in the content resolver (§10h-2). Both open
  questions were answered by measurement rather than by argument:

  - **Where the declaration lives.** Not a child node: every scene shape is `atom: true`, so that
    would turn rectangles, ellipses, lines and pictures into containers — changing what an atom means
    for selection, editing, the DOM mapping and paste normalisation, to hold two strings. Not a list
    beside `variables` either: a shape's only durable name is `name` and it is not unique
    (`namedBoxes` takes the first of a name per surface), so a binding would silently apply to one of
    two same-named shapes.
  - **Where it is resolved.** The renderers cannot: `attrsOf` is read in **62 places** inside them
    and takes no environment, so a bound corner radius would have reached the paint and not the
    border radius. The resolver it is — and it resolves *attributes* there for the first time, by a
    parent handing back a child as it is drawn, with a node's own words resolved as its children
    because characters are content.

  Found by the **full browser suite**, which is what a milestone run is for: the first rule for which
  rows to draw was "every attribute the shape declares", and that put a `flipX` row in the panel
  labelled `flipX`, because the product has no word for it — a panel of raw attribute names, and a
  test broken by accident because `getByLabel('X')` matches "flipX 문서 변수". The rule is now *a row
  exists where the product has a word for the attribute* (`BINDABLE_ROWS` against `LABELS`), which
  bounds the list and puts adding one in a single place. Two specs also learned to ask for their
  labels **exactly**: two controls about 간격 in one panel is ordinary, and a substring match is the
  loose half.

  And one refusal that has since been lifted: `x`, `y` and `rotation` were refused with a sentence
  about **behaviour** — "a box that snaps back when you drag it is a worse thing to meet than a size
  you cannot type" — and a behaviour can be fixed. Measured: a **locked** box is refused one step
  earlier still (the hit test goes through it), which is right for "I have decided where this goes"
  and wrong here, since a reader must be able to select a shape to unbind it. So the move drag is left
  out **before it previews** — the shape never follows the pointer — and the rotate grip goes with it.
  What `UNBINDABLE` holds now is nothing; what `OFF_LIMITS` holds is identity and reference, where a
  variable would mean a document naming things by a value that can change under it.

- [x] **A shape's *size* follows a variable now, and the count decided how.** The places that read
  geometry were counted first, as this entry asked: `boxOf` in **31 call sites across 14 files**, plus
  six direct reads — the outline, the handles, the guides, the snapping, alignment, group bounds, the
  audit's "off the edge" check, hit testing. Teaching all 37 to ask the resolution is not the
  expensive part; the expensive part is that every *new* reader would be silently wrong until somebody
  noticed.

  So a bound size is **written** into the document by the pass that already settles derived geometry,
  which leaves all 37 readers and every writer untouched. It is derived state in the document — and
  the same trade the arrangement already made, for the same reason, with the same convergence rule
  (answer only what differs). Three things fell out, each measured: the **container wins** over a
  binding (parent before child in one pass — written the other way first, and the test said 2400 where
  the frame said 6000); the reader's own size is **refused** while a variable owns it (greyed fields,
  no handles, `setBoxGeometry` says no), because a width written there is put back by the next pass;
  and `x`/`y`/`rotation` stay refused, because a box that snaps back when you drag it is worse to meet
  than a size you cannot type, and what a drag on one should mean wants its own measurement.

- [x] **A page can declare its own variables** (§10h-3), which is the scope a deck wanted beside the
  document's: "every card is our accent, except on the summary page" is one declaration on that page
  rather than an override on nine shapes. `surface` content is `variable* (block+ | (scene | frame)*)`,
  the order is document → page → card → placement, and the one exception is written where it lives: a
  **card's own** declaration beats both, because a card carried onto a page must not change meaning.

  The question behind it was really about vocabulary — *a deck **is** a document*, one `document`
  node and one file, so the `variables` container was already document-wide. What did not exist was
  the narrower scope.

- [x] **Variables shared across documents** (§10h-4): `fromDeck` and `fromValue` on a `variable`,
  `importVariable`, and the library dialog listing a deck's **values beside its cards** — three states
  each, like a definition's. A clash **overwrites** where a card's clash renames, because a variable's
  name *is* the reference: importing under another name would change nothing that already names it.
  Which is also what separates an import from a paste — a paste keeps the destination's value because
  nobody asked, and an import is somebody asking.

  And the naming problem dissolved rather than being solved: an imported value **is this document's
  own**, drawing and resolving and scoping like any other, so there is no third list and no third
  word. What the two remembered fields buy is one badge on one row.

- [x] **A variable's value is authored in the control its kind asks for.** It was a text box whatever
  the kind: a `boolean` typed as the word `true`, a `choice` typed instead of chosen from the options
  declared right beside it, a `number` with no arrows. A *placement's* variables were already drawn
  this way (`ComponentGroup`), so the product had two controls for one idea — which is how it ends up
  with two kinds of colour picker. The document still holds one string whatever the kind; the control
  is how a reader authors it correctly. Changing a `choice`'s options now moves the value onto one of
  them, because a select drawing a value nobody can pick again is what the free-text field left behind
  every time.

  Found on the way: the value control's `data-` marker only existed on the text branch, so a test
  looking for it was tied to the kind it was not testing. The **row** carries the marker and the
  control carries its name, and that pair holds for every kind.

- [x] **A variable can be renamed now**, and it is the migration the entry said it would be: one walk
  finds every attribute, every shape binding and every card binding that means *this* declaration,
  one transaction writes them, and the name field on the row is the gesture. What the walk found on
  its first day was two faults in the **count** the panel had been showing all along: a shape's own
  binding was never counted (the walk looked for `var:` references and a `varBinds` entry holds a
  bare name, so a variable three shapes took their width from said *0곳*), and a page declaring the
  same name was counted as the document's — the small half being an overstated number and the large
  half being that renaming one of those references would have changed what a shape draws. One walk
  answers both questions now, so the number a reader is shown is exactly the set that gets rewritten,
  and a *place* became a node's attribute rather than a reference: a gradient naming it in two stops
  is one thing to go and look at (§10h-5).

- [ ] **A card's own variable still cannot be renamed** (`componentVar`), and it is the same shape of
  migration one scope down: every `componentBind` in the definition and every `componentValue` on
  every placement — *in every deck that ever copied this card*, which is the half the document's
  rename does not have. Left until the walk is asked for: the pieces exist (`componentsOf`,
  `instanceValues`), and what is missing is the answer to what happens to a copy that is not here.

- [ ] **Word's canvas half: measured, and what is missing is a producer and a pointer.** Asked
  because inline atoms and block objects are not one question. An inline image, an inline formula and
  an emoji are *in the flow*, so a **range** selects them and that is right — every word processor
  agrees, and "two non-adjacent inline images at once" is a gesture none of them has. The block
  objects are the other half, and there the earlier answer was wrong: "Word never makes a node
  selection because a page flows" is true of the flow and hides that **Word's canvas is declared,
  drawn, arranged and paginated — and has no command that makes one and nothing that can select
  one.**

  Measured 2026-08-25 (`docs/SHARED-LAYER.md`, "What a canvas *editor* would share"):

  - the deck's overlay imports **75** symbols and **24 already live in `office-word`**;
  - of the other 51, **2,387 lines name no product at all** (crop, paints, gradients, corners, flip,
    group bounds, layout-arrange, text-box) and **1,078 more name one only as a parameter** —
    `manipulate.ts` is 630 lines of move, resize, rotate, snap, marquee and hit-testing a turned box,
    and the word "slide" appears in its code three times;
  - the commands need **one seam**: `slideAt` walks to the nearest `surface`, and a canvas node's
    container is a `canvasBlock` in a page. "Which canvas is this on" has one answer per product,
    the same shape `surfaceOf` and `trackHostAt` already have;
  - the overlay itself is **3,754 lines** of React whose features are *interleaved* — crop, gradient,
    path, connector, guides, marquee and handles appear across the whole file — so it cannot be
    extracted by copying;
  - and the question nobody has answered: a deck has one stage holding one surface, a page has
    **many** canvas blocks at their own rectangles inside a scrolling, paginated, zoomed document, so
    the overlay's founding rule — one measurement, then arithmetic — has to be re-answered per canvas
    block.

  The first slice, if this is taken: `insertDrawing` plus the shapes, and a **thin** overlay over one
  canvas block — select, move, resize, marquee. Crop, gradients, paths and connector bending are
  already-shared arithmetic and can be turned on after.

  - [x] **The producer.** `insertRectangle`, `insertEllipse`, `insertLine` and `insertDrawing` in
    Word, on a 그리기 group of the ribbon. The gesture is "insert a shape" and not "insert a canvas":
    a reader who presses 사각형 means a rectangle in their document, so the command makes the
    `canvasBlock` when there is none — **in the same transaction**, because one press has to be one
    undo and an empty canvas left behind is the editor keeping half a gesture nobody made. Where the
    shape goes is the canvas the selection is on (`canvasAt`, the shared "which container places
    what is in it") and otherwise a new drawing after the block the caret is in, which is what
    "insert" means everywhere else in a document. A drawing starts as wide as the *text* is —
    computed from the section's page setup, not a constant — and half as tall, which is Word's own
    drawing canvas at default margins.

    The arithmetic went to the canvas layer (`office-word/canvas-insert.ts`) and the deck now
    **calls it**: "a new rectangle is blue, a quarter of what holds it, in the middle" names no
    product, the same renderer draws both, and a shape that changed colour on its way from a deck
    into a document would be two answers to one question.

    And the harness caught the fifth command before it shipped: `insertTextBox` would have put a
    `textFrame` in the document and **Word has no renderer for one** — a reader pressing a button,
    seeing nothing, and having changed their file (`every-command-can-be-seen`). Text inside an SVG
    canvas is `<foreignObject>` and is its own question, below.

  - [x] **The arithmetic moved**, which is the half the pointer needs before it exists:
    `canvas-manipulate.ts` (move, resize with the aspect and centre modifiers, rotate, snap,
    marquee, hit-testing a turned box) and `canvas-box.ts` under it. Nothing changed but where it
    lives and one parameter name — `guidesFor(others, slide)` is `canvas` now, which was one of the
    three product words the measurement counted. The deck keeps `manipulate.ts` as a name that
    re-exports, so its forty callers did not churn.

    It closed a duplicate on the way: `boxOf` existed in the deck's `geometry.ts` **and** in
    `canvas-layout.ts`, the second written from scratch with a comment saying it could not import
    the first because the dependency runs this way. Both are one function now, and the rule it
    carries is not a taste — a negative extent is what dragging a handle past the opposite edge
    means, and a reader that forgot it would draw nothing where a shape is.

  - [x] **The pointer**, and it is *thin* on purpose. `apps/word/src/drawing-overlay.tsx` is a few
    hundred lines against the deck's 3,754, because it does **not** swallow the pointer: it is
    `pointer-events: none` and listens on the document, so the **browser** hit-tests the shapes —
    including a rotated one, where an SVG transform is exactly the sum the deck's `unrotate` has to
    compute. What that costs is that a drag has to start on the shape itself, which is what it does.

    Multi-selection from the first line, because that was the ask: a press replaces the set, Shift
    or Ctrl toggles one, a band takes everything it **touches** (intersects, not contains — a reader
    dragging across three shapes means those three), and a press on something already selected keeps
    the set so three shapes drag together. A press on the empty part of a drawing clears.

    A drag does not touch the document until it is dropped — the drawn elements move with a CSS
    transform and one `moveShapes` writes the finished move, so one gesture is one entry in the
    history rather than thirty. Two pixels of slack before it counts as a drag, because a pointer
    moves a little while a finger presses.

    `moveShapes` is Word's own for now, with the reason written where it lives: the deck's
    `setBoxGeometry` refuses a locked box and a size a **variable** owns, and a page has neither
    yet, so this is the honest small version rather than a shared command with half its guards
    switched off.

- [ ] **Unify `moveShapes` and the deck's `setBoxGeometry`**, when a page grows the second half — a
  lock, or a value something else decides. Two commands that move a shape is exactly the shape of
  duplication this repository keeps finding, and it is deliberate today rather than accidental.

  - [x] **Handles, Delete and the arrow keys**, all of them written for a **set**. Eight handles
    around the union of what is selected — one frame, upright, which is what every drawing tool does
    with a multiple selection and what makes a set something a reader can act on. The same handle is
    pulled on every selected shape by the same amount, which is the deck's own answer, so the two
    products behave the same way. A resize is not previewed with a transform the way a move is:
    `translate` cannot say *bigger*, and a shape that scaled its stroke while being dragged would be
    showing something the model will never hold — the frame follows instead.

    `Delete` and `Backspace` are guarded by **`shapesSelected`**, the same shape `tableSelected`
    already had and for the same reason: with a caret in a paragraph, Delete is a character. The
    canvas itself stays when its last shape goes — a reader put it there.

    Two things measured on the way, both of them the harness of experience rather than a test:
    `getKeyString` normalises an arrow before the registry looks it up, so a map written `ArrowUp`
    matches **nothing** and the caret moves instead — the deck spells them the browser's way because
    it matches its own chords rather than going through the registry. And a browser test that
    clicked a paragraph and typed was testing the sample's `fieldDateTime`, where typing is refused
    correctly, and calling it a fault in the drawing; the caret is set through the editor now.

  - [x] **Getting back to writing**, from the question *"with shapes selected, can a reader type?"*.
    Measured in the browser first, in **both** products: a letter goes nowhere and Enter does
    nothing at all. Safe — the engine refuses a character that has no caret to go into, so nothing
    is silently written somewhere odd — and dead, because Enter means *give me a line* everywhere
    else in a document.

    A page can answer that and a deck cannot: a document is a column of blocks with a line always
    available after any of them, and a slide has nowhere for a caret to fall out to. So **Enter**
    makes a paragraph right after the drawing and puts the caret in it, and **Escape** only moves
    the caret — after the drawing, or before it when the drawing is last — because a reader who has
    finished with a drawing does not want an empty paragraph to delete afterwards. Enter *always*
    makes one rather than sometimes reusing what is below: one key that sometimes writes and
    sometimes navigates is two gestures a reader cannot tell apart before pressing.

  - [x] **What a set is for: lining it up, spreading it out, and what is in front.** Twelve commands
    on a 그리기 ribbon group of their own — six edges, two axes, four depths — over arithmetic the
    canvas layer already had and the deck has been calling for months. A page had none of it: a
    drawing was three shapes a reader could only line up by eye.

    Each greys out on its own answer rather than on a rule written in the app: aligning wants two
    shapes, distributing wants three (with two the gaps are equal by definition), ordering wants
    one. Equal **gaps** rather than equal centres, which is the reading that survives boxes of
    different widths — what a reader sees is the white between them. Depth is a `moveNode` inside
    the drawing, because document order *is* paint order in an SVG, and the deck's two orderings
    come with it: to the front in the order they already had, and towards an edge the nearest one
    first so two adjacent shapes do not swap through each other.

    A selection spanning **two** drawings acts on the first shape's canvas and leaves the rest
    alone: each drawing has its own origin, so a frame across two of them means nothing.

  - [x] **Snapping, and the lines that say why.** A drag builds its guides once at the start — every
    other shape's edges and middle, plus the drawing's own edges and centre, which is the position
    an author aims at most and can never hit by eye — and the whole selection snaps as **one box**,
    so a set lands together rather than each shape finding its own line. The threshold is eight
    *screen* pixels turned into model units, the deck's number and its reason: a fixed model
    threshold feels sticky on a page zoomed out and dead on one zoomed in. What is drawn is what is
    written — the snapped delta goes to the command, not the pointer's own.

    Two things it forced, both worth keeping. **Cmd/Ctrl is not a selection modifier** here: the
    deck already spends it on *exactly here, no snapping*, and a modifier that also changed the set
    would make that unreachable, because a press that changes the set never becomes a drag. Shift
    adds to the set; Cmd/Ctrl turns snapping off. And a test that aimed "left edge against left
    edge" with boxes of **different widths** was ambiguous by construction — the snap picks the
    closest edge-to-guide pair per axis, and centre-to-centre was nearer — which is correct, so the
    fixture uses two boxes of one size and the three pairings agree.

- [ ] **Typing with one shape selected should write into it**, which is what PowerPoint and Keynote
  do, and what neither product does today. It needs a shape that can hold text: the deck has
  `textFrame` and reaches it by double-click, and a page has none until `<foreignObject>` is
  answered. Then it is one rule for both — *one* selected shape takes the letters, several take
  nothing, because nobody can say which of them was meant.

- [ ] **A shape on a Word drawing cannot be rotated**, and nothing draws a rotate handle. The
  arithmetic is shared already (`angleOf`, `snapAngle`); what is missing is the gesture and a
  command.

- [ ] **A text box on a Word drawing** needs `<foreignObject>`, which is a design question rather
  than a fifth line in the insert list: what a caret does inside one, how the paginator measures it,
  what print does with it. Refused for now by the harness rather than by a person, which is the
  harness working.


**Still open and not in a phase**

- [ ] **Per-level formatting** for a body placeholder: PowerPoint formats by
  outline level and the resolver approximates by paragraph index, written down in
  `layout-format.ts`.
- [ ] **A second reader.** Every test is one person editing one deck, which is
  the only thing the product does.
- [ ] **Cell selection inside a slide's table needs the overlay's cooperation** —
  it works today only because the overlay goes inert while a box is being edited.
- [x] **The presenter's screen is a window of its own**, and this entry was **stale** — the second
  window shipped (`presenter-window.tsx`, `window.open` plus the deck drawn into it) and the item
  sat here open. Found by sweeping the open list rather than by anyone meeting it, which is the same
  fault the stale exemptions were: a list that says a shipped thing is missing costs the next person
  the time to find out.

- [ ] **A film's out-point is enforced to about a quarter of a second.**
  `timeupdate` fires roughly four times a second, so a trimmed clip overshoots its
  end by up to that much. Deliberate over a timer, which measures wall time and
  cannot survive a buffering stall — see Done. The honest fix is
  `requestVideoFrameCallback`, which reports every *presented frame* and is the
  only clock a film actually keeps.

- [ ] **Two commands in one tick can each create the slide's motion track, and
  one of them loses its step.** Found while fixing the naming version of this (see
  Done): with no track yet, two `setBoxBuild`s issued before either commits both
  build a transaction that creates one, and the timeline comes out with **one**
  step instead of two — measured. With the track already there, both land. The
  naming had a fix that fits in the command; this one does not: it wants commands
  to be serialised, or a create-if-absent that is safe to run twice, which is an
  engine question rather than a Slides one. Nothing reaches it today because the
  panel awaits between clicks.

- [ ] **A SMIL filter cannot be eased.** Its `<animate>` runs `calcMode="linear"`
  through a list of values, so a melt swells and recedes at a constant rate while
  every other motion in the product has a curve. SMIL has `calcMode="spline"` and
  `keySplines`, which is exactly a cubic-bezier — so the step's own easing could
  be handed to it, for the presets that are curves rather than springs.

- [ ] **A step's colour cannot be picked on the canvas.** A glow's colour is typed
  into a field; a gradient's stops are dragged on the shape. The second is better,
  and the machinery (`data-paint-canvas`) exists.

- [ ] **A motion cannot be aimed at a fill as a *target*.** Every effect animates
  the box a step names, or a track the box's fills read — which now covers every
  property a layer has (its opacity, its pan, its zoom). What is not expressible is
  a step whose *target* is "the second fill", and that is a model question — a step
  would have to name a part of a node — rather than the CSS wall it used to be.
  Nothing has asked for it; written down because the drawing no longer stands in
  the way.

- [ ] **What is left of the chrome's own controls is an instrument and a
  gallery**, counted and held by the ratchet in
  `apps/slide/tests/shared-controls.spec.ts`: the timeline's axis and transport
  (16), the preset gallery (3), the paint panel's gradient stop (1), the rail (1).
  Down from 34 — the shell, the properties panel, the notes and the file row are
  migrated, and the file picker became a primitive. Each of the four that remain is
  a *drawing* rather than a form (bars, a playhead, a ruler, a curve editor; tiles
  that play their own motion; a handle dragged along a bar; a row that is a
  picture and two badges), which is why the number stops going down here rather
  than at zero.

  **`office-ui`'s older components still draw their own buttons** — the zoom's
  three icon buttons, the palette's swatches, the colour field's trigger. Left
  alone deliberately: they are already drawn from the tokens, so what they do not
  share is *code* rather than *look*, and each one is in both products' chrome
  where a change is two suites to re-run for no visible gain. What is worth having
  eventually is a borderless tone on `Button`, which is what the zoom's buttons
  actually are.

  **And the transport is deliberately not shared yet.** Word will want one the day
  it plays anything, and today it plays nothing — one user is a component nobody
  can design. The rule this repository has been using holds: two copies is a
  coincidence, three is a component nobody wrote. Written down so the next person
  finds a decision rather than an omission.

- [ ] **Word maps no tokens.** It imports `tokens.css` and takes the defaults,
  which is correct today — its chrome *is* Tailwind's palette — and means the two
  products still do not provably agree. When Word gets a palette of its own, the
  mapping is one block, and the check that it resolves is one test.

- [ ] **A radial gradient cannot be rotated, and never will be through CSS.**
  `radial-gradient` has no rotation syntax — measured, `/ 30deg` is rejected — so
  the rotated ellipse Figma draws would need the gradient painted some other way
  entirely (an SVG fill, or a rotated child element that is clipped). Written down
  as a *wall* rather than a task, so nobody looks for the missing handle.

- [ ] **An additive `opacity` cannot mean what a reader means.** A fade over a
  shape at 50% opacity ends at 100%, because `replace` ignores the shape's own
  value — and `add` cannot be used instead: an additive fade *starts* at the
  shape's own 1, so it would not fade at all. What is meant is a **multiple**, and
  the Web Animations API composites by adding. The way round it is the shape's
  opacity through a registered `<number>` track, which is a track for a property
  that has another way — so it waits until something else needs the same trick.

- [ ] **Nothing draws the *travelling* shape while scrubbing a path.** The
  playhead shows the moment on the slide, so the shape is where the path puts it —
  but the path itself is only drawn when its bar is selected. A reader dragging the
  playhead along a path is watching the shape without the route.

- [ ] **The `paragraph` unit knows a class name.** The stage finds a paragraph
  with `.w-paragraph`, which is Word's renderer's class — the one place the
  deck's playback knows what the renderer called something. A `data-` marker the
  renderer owns would be the honest seam, and the same question is open for the
  caret filler.

- [ ] **The conformance harness cannot see a resource.** `every-node-is-drawn`
  walks what a document can *contain*, and a resource is referenced by id rather
  than placed — so `slideLayout`, `surfaceNote` and now `motionTrack` and
  `motionStep` are never examined. All four are read by something today, so
  nothing is wrong; what is missing is the check that would say so if one stopped
  being. Measured on 2026-08-19: the placeable set is 42 of the schema's types,
  and none of the four is in it.

- [ ] **A selection dropped for pointing at a deleted node says nothing.**
  `updateSelection` refuses a selection whose nodes are gone, clears what was
  there and emits neither `editor:selection.model` nor `editor:selection.change`
  — and `editor.test.ts` asserts that silence deliberately. Nothing is broken by
  it today: every case that drops a selection this way also changes the content,
  and a host listening to `editor:content.change` re-reads anyway. Measured on
  2026-08-19 by announcing the clear and then taking it out again — the deck's
  suite is green either way. Left alone rather than changed on a hunch, and
  written down because a host that redraws on selection alone would be stale and
  would have no way to find out why.

- [x] **`bgColor` painted nothing, and the test beside it passed the whole time.** The command wrote
  its colour into an attribute called `color`; the schema declares `bgColor`; every reader asks for
  it by name — the two apps that draw the mark (`attributes.bgColor`) and Word's format resolution
  (`attrs.bgColor`). So it committed, reported `true`, and did nothing, which is the one failure a
  reader cannot report.

  Fixed at the command rather than by deleting the mark, and the measurement is why: `bgColor` looked
  like a dead duplicate of `highlight` until the sweep showed it is drawn by two apps and used as
  *the* example mark in eight renderer tests. The two are Word's own pair — 음영 against 형광펜, a
  background of any colour against a pen with a palette — and the doc's two rows both saying
  "Highlight." was the whole confusion. Word maps both onto its one highlight format because
  `EffectiveFormat` has no shading, and says so where it does it.

  The test asserted which **mark type** was written and never what it carried, which is how this
  survived. `office-word/test/mark-commands-write-what-the-schema-declares.test.ts` is the guard now:
  every mark command runs on a real editor, the mark is read back out of the store, and each
  attribute is held to what the schema declares that mark has — in both directions, because an
  attribute the schema does not declare is one nothing will ever read.

### Slides has an end-to-end suite now

Word has 291 e2e tests and a deck had none, so everything about the deck was
verified by throwaway probes written for one measurement and deleted after it.
That is why a zoom control reading 10% survived a week of looking at the app:
nothing was watching, and the eye reads what it expects.

Thirteen to start, each one a bug that shipped or a behaviour a probe had
checked by hand a dozen times: the zoom says what the stage draws, the rail
shows names in full beside real pictures, a drag moves the shape and settles
where it is dropped, arrows nudge by 15 and 144 twips, the clipboard keys work,
Delete undoes, entering a box gives the *model* a caret, and a note is editable
and never drawn on the slide.

Run with `pnpm test:e2e:slide`, on its own port so a deck's suite and a
document's can run at once. Proved rather than assumed: the zoom test fails when
the scoping fix is taken out.

Twenty-one now: the thin places named when the suite was started — pictures,
layouts, snapping, going inside a container, presenting — are covered, each by
the behaviour a probe had been checking by hand.

- [x] **A group's box follows its children** — see Done.
- [x] **Nothing deselects a box** — both gestures already did; nothing heard
  them. See Done.
- [ ] **Nothing covers a second reader.** Every test here is one person editing
  one deck, which is the only thing the product does today.

### Slides — what is next, in order

The three model questions these depend on are settled in
[`docs/specs/canvas-model.md`](./specs/canvas-model.md): one unit, who owns a
coordinate, and where formatting comes from. They were settled together because
each was about to be answered twice — once by the clipboard, once by layouts —
and an answer given twice is an answer given differently.

Ordered so that each one is unblocked by the one before it.

1. - [x] **One unit.** Word read a canvas shape's numbers as pixels and Slides
     read them as twips, fifteen apart, with the schema declaring both as plain
     numbers and neither product disobeying it. Twips now, in one conversion:
     the view box keeps the model's own numbers so the shapes inside carry
     theirs untouched, and only the element's CSS size converts. The check is
     `office-slides/test/one-unit.test.ts`, which lives there because that is
     the package that can see both. On screen: a canvas that drew 360×140 still
     draws 360×140, from 5400×2100.
2. - [x] **`toSurface` / `fromSurface`.** The container-to-slide conversion, in
     one pair of functions in `office-slides/selection`, with the overlay's
     inline walk replaced by a call. Grouping turned out *not* to be a second
     derivation: it rebases against a frame it is creating, so there is no node
     to walk to and `intoFrame` is the right tool — the difference is whether
     the container exists yet, and the two are worth keeping apart.
3. - [x] **A clipboard for objects**, and reachable — which it was not for a
     day. The commands were registered with no key binding and no toolbar entry,
     which is the pattern this repository exists to catch, committed within a
     day of adding a check for it. Ctrl/Cmd+C, X and V now, bound in the overlay
     beside Delete and for the same reason: what Ctrl+V means depends on which
     kind of selection is live, and only the overlay knows. Paste is handled
     before the "boxes are selected" guard, because it is the one that needs
     somewhere to put them rather than something to act on. Copy, cut and paste between slides,
     containers and decks. Two clipboards on purpose: the system's carries a
     shape to another window and is the reason the payload is JSON in text, and
     the extension keeps its own because reading the system's needs a permission
     the browser may refuse — without the fallback, copy and paste inside one
     deck would work only where the permission happened to be granted. Cut is
     one command so it is one undo. Found on the way: `deleteBoxes`,
     `duplicateBoxes` and `nudgeBoxes` had the same slide-level assumption the
     arrange commands had, so none of them worked inside a frame either.
4. - [x] **Formatting through the layout.** A resolver shaped like Word's:
     the layout's placeholder of the same *role*, then direct. The ribbon's font
     controls now read 33pt for a title and 20pt for a body, from a deck where
     nothing on any slide sets a size. Two things found on the way:
     `layoutPlaceholders` returns *copies*, whose children are nested nodes
     rather than sids, so reading a placeholder's paragraphs found nothing —
     `layoutPlaceholderSids` is the reading half; and a size the presets do not
     offer left the control blank, which reads as "the selection disagrees with
     itself" when it agrees perfectly.
   - [x] **Applying a layout to a slide that already has content** works, and
     needed the other half of the resolver: the renderers read `WordEnv.styles`
     rather than a paragraph's attributes, so a layout the *toolbar* knew about
     and the drawing did not gave two answers — 54pt reported, 13px drawn.
     `withLayouts` puts the layer in `resolveNodeWith`, the seam Word already
     had for a table style's conditional formatting, and no renderer changed.
   - [ ] **Per-level formatting.** PowerPoint formats a body placeholder by
     outline level. A paragraph here carries no level, so the resolver takes the
     placeholder's paragraph at the same index and the last one after that —
     the nearest thing the schema can express, written down in the resolver.
   - [x] **Word's ribbon had the same blank-for-an-unlisted-size gap.** Not
     copied across — `choiceOptions` is in the toolbar model both products read,
     with the *unit* named on the model rather than in either app, because an app
     that divided a size by two would be an app that knew a `.docx` detail. Two
     products disagreeing about whether a 13.5pt selection shows blank is one of
     them being wrong, which is the rule for what belongs in one place.
5. - [x] **Snapping while resizing.** `snapResize`, a separate function from
     `snapBox` because a move and a resize are not one problem: a move shifts
     the whole box so any of its six lines is a candidate, and a resize holds
     the opposite edge still so only the lines the handle moves are. The box's
     *middle* is deliberately not a candidate for a resize — it moves as a
     consequence of the edge moving, and snapping it would put the edge where
     nobody aimed. The fight with the modifiers is settled by the modifier
     winning: Shift and Alt ask for an exact relationship a snap would break, so
     nothing snaps while one is held. Measured: aimed four pixels short of a
     neighbour's edge and landed on it; the same drag with Shift held stayed
     four pixels short.
6. - [x] **Pictures.** A `picture` scene node — placed, dragged and resized like
     every other object, distinct from the standard schema's `inline-image`,
     which flows with text. Declared, drawn and made in one change, which is the
     rule this schema learned the hard way. The button was permanently disabled
     before, and honestly so: `insertPicture` refuses a payload with no file in
     it, and nothing was opening a picker. `needsFile` is how the toolbar model
     says a control needs something only the reader can choose, without knowing
     what a file picker is. The file is read as a data URL so a saved deck keeps
     its pictures, and measured before it is placed so it arrives in its own
     proportions.
7. - [x] **Editable speaker notes.** A second `EditorViewDOM` over the *same*
     editor and store, rendering the note's subtree — which works because
     `render(tree)` takes any node with a sid. One history, one selection, no
     second copy of the text. Three things it cost, each worth knowing:
     `getDocumentProxy` hands back a *live* view of the store, so passing it to a
     second view means every diff compares the tree with itself and nothing
     redraws — a snapshot is needed; a view created against a region with
     nothing to draw never draws anything later, so it is made when there is
     something; and `surfaceNote` needed a renderer that knows *which view* it is
     in, because the stage renders resources too and would otherwise draw every
     note under the slide. `SLIDES_ENV_KEY` is that, the same seam Word uses for
     a header being edited.
8. - [x] **Real thumbnails** in the rail. A plain `DOMRenderer` per slide, not a
     second editor: a thumbnail is a picture, so it needs no contenteditable, no
     observer, no input path and no selection. Scaled with `transform` rather
     than laid out narrow — every box on a slide is placed by coordinate, so a
     tenth-size drawing is the same drawing, and re-laying-out would give a rail
     that lies about what the slide looks like.

     Two things it turned up. The overlay found the slide element with an
     unscoped `document.querySelector`, and a thumbnail is that slide with that
     sid — so the handles would have been placed inside a 128-pixel picture; the
     query is scoped to the stage now. And a content change is one event for the
     whole deck, so every thumbnail is asked to redraw when any slide changes:
     each compares the snapshot it drew last and skips if it is the same. Honest
     limit, written in the component — a hundred slides serialise a hundred
     slides per keystroke, and what that wants is an event that says which slide
     it touched.

### Slides — the second product

Chosen because the pieces were already there and because it is the one product
that forces a caret selection and a node selection to coexist. `packages/office-slides`.

**Six of these said `[ ]` while the feature was shipped and tested**, because the
work was tracked here *and* in "what is next, in order" below and only one list
was kept up. Measured rather than re-read on 2026-08-19: every one is registered
in the deck's kit, reachable from its chrome and covered by tests. A list kept in
two places is a list one of which is wrong — the same lesson the unread-attribute
list taught the same week. This section is the *shape* of the product; the
ordered list is what was done in what order, and neither is a second copy of the
other now.

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
- [x] **Slide commands** — add, delete, duplicate, reorder, hide, on the
  toolbar's own group.
- [x] **Multi-node selection.** `ModelSelection` had carried `nodeIds` since
  sets were first described and `Editor.setNode` dropped the field, so a set
  could be described and not made. And a node selection could not *survive*: the
  view writes it into the browser, the caret that leaves behind is read back as
  a range, and the shape was a caret in its text by the time anything looked. It
  now holds until the reader touches the text.
- [x] **Objects** — insert, select, marquee, drag, resize, rotate, z-order,
  align, distribute, duplicate, delete, nudge. The arithmetic is pure and
  tested; the app has pointers and two decisions.
- [x] **Presenting** — one slide filling the screen, hidden ones skipped, and
  the same elements the editor was already drawing rather than a second render.
- [x] **A properties panel** — `boxAt` finds the nearest box above the caret,
  `setBoxGeometry` and `setBoxStyle` change it, and the panel is the suite's.
  Not a stand-in for node selection: it is the honest answer to where the reader
  is while they are typing, which is what a properties panel is for most of the
  time. First thing anywhere to read `locked`.
- [x] **Direct manipulation** — handles, marquee, and double-click to type,
  alongside the caret inside a `textFrame`.
- [x] **Grouping.** `group` had been in the schema since the canvas nodes were
  declared, drawn since this product had renderers, and nothing had ever made
  one. Grouping and ungrouping are arithmetically one thing — rebasing the
  boxes onto their new parent — and the boxes are *moved* rather than copied, so
  their sids survive and nothing pointing at them is left pointing at nothing.
  `$alias` is what lets one transaction move things into a node it just made.
- [x] **Going inside a container.** A frame's and a group's children were
  unreachable: the overlay's candidates were the slide's *direct* children, so a
  rectangle in a frame could not be clicked, dragged, formatted or seen by the
  properties panel — clicking it selected the frame. A deck could make groups
  and could not edit anything in one. Double-click goes in and selects the child
  under the pointer, Escape or a click outside comes back out, and a dashed
  outline says where the reader is. The children's coordinates are their
  container's, so the overlay adds the container's origin when it reads and
  takes it off when it writes — in one place each, because that is a conversion
  two places eventually disagree about.
- [x] **A clipboard for objects**, between slides, containers and decks, on
  Ctrl/Cmd+C, X and V. Two clipboards on purpose — see the ordered list.
- [x] **Snapping and guides.** Both halves in one function, so the line drawn is
  computed from the same candidate that moved the box rather than being a second
  guess at what happened. The threshold is in model units and derived from the
  scale, because "close enough" is a distance on the reader's screen.
- [x] **Snapping while resizing** — `snapResize`, a separate function from
  `snapBox`, and the modifiers win: nothing snaps while Shift or Alt is held.
- [x] **A shape moves while it is dragged.** The overlay nudges the real element
  with the `translate` property for the length of the drag and clears it on
  release — `translate` and not `transform`, because the renderers write
  `transform` for a shape's rotation and the two compose without either having
  to know about the other. The document is still written once, at the end.

  A resize keeps the translucent stand-in: it changes the *size*, which
  `translate` cannot say, and scaling the element would scale the text inside it
  into something the model will never hold.

  Two things measured on the way. Using the overlay's `toScreen` applied the
  zoom twice, because the element is already inside the scaled stage — the shape
  trailed the pointer by exactly the zoom. And a pointer-down that misses every
  box starts a marquee without clearing the drag, so the release took the
  marquee branch and returned before putting the element back; settling is the
  first thing the release does now, whatever else it turns out to be.
- [x] **Dialogs** — slide size and layout picker, the first things to draw the
  suite's `Dialog`. Deck size is applied to every slide rather than held once on
  the document: a slide already carries its own size, and a second place saying
  it is a second place to disagree.
- [x] **Editable speaker notes** — a second `EditorViewDOM` over the same
  editor and store, so one history and one selection.
- [x] **Real thumbnails** in the rail — a plain `DOMRenderer` per slide, not a
  second editor: a thumbnail is a picture.
- [x] **Applying a layout**, and taking formatting from it: `withLayouts` puts
  the layout's placeholders in `resolveNodeWith`, the seam a table style already
  used, and no renderer changed.

### Zoom

- [x] **Zooming the slide in the viewport** — a shared `ZoomControl`, Ctrl/Cmd
  with the wheel anchored to the pointer, space-drag to pan, and a `fit` that is
  a *state* rather than a number so a fitted deck re-fits when the window
  changes and a deck at 150% does not.
- [x] **Word draws the shared widget** and keeps its own semantics, which is
  the whole shape of the answer: what is shared is where the minus button is;
  what is not is what "fit" means, how far it goes, and whether the wheel holds
  the point under the pointer. Measured, all four differences are right for
  their product — a page fits to its *width* because it is tall and scrolls, and
  its wheel does not anchor because a reader zooming a document is reading
  rather than pointing.
- [ ] **A pinch on a trackpad is a Ctrl+wheel**, which is why it works — but a
  two-finger pan is a plain wheel and currently scrolls the pane, which is
  right. Worth checking on a touch screen, where neither is true.

### The suite's chrome

`packages/office-ui` — the toolbar, dialog and property components both products
draw with. The division it rests on already existed inside Word and was the right
one: the toolbar *model* is DOM-free and product-declared, and only the drawing
was shared.

- [x] **Extracted, with Word moved onto it** and its e2e unchanged. Two Word
  names came out of the components on the way — `w-toolbar` baked into the
  toolbar and `w-toolbar-style` as a default — because a suite component naming
  one product is one the next product works around.
- [x] **Slides declares its own toolbar** and looks identical, which is the test
  of whether the split was right.
- [x] **`Dialog` has a user.** Slides draws it for slide size and layout, which
  immediately found that `ChoiceSelect`'s menu was `z-30` — above a toolbar and
  *below* a dialog's overlay, so a select inside a dialog opened its list under
  the dim layer and no option could be clicked. A component no product has drawn
  is a component nobody has checked, which is exactly what that entry said.
- [ ] **Word still draws no dialog.** Its format dialogs are the next user.
- [x] **Ctrl+wheel zoom is shared** — `useWheelZoom`. The claim that Slides did not
  have it was wrong; both did, and the deck's copy had three corrections Word's
  lacked. Word gained pointer anchoring. See Done for the three faults the move
  turned up, one of which was a frame-late transform in `ZoomFrame` that had been
  making a *different* measurement silently wrong.
- [ ] **Tailwind has to be told where the components are.** `@source` in each
  app's stylesheet. Miss it and every class attribute is intact with no rules
  behind any of them: the deck's ribbon rendered as one control per line, with no
  error anywhere.
- [x] **The window's frame is shared** — `AppShell` / `AppChrome` / `AppBody` /
  `AppMain`. Layout only; each product keeps its own class name on each region,
  because those names are what its own code finds the panes by. `AppFooter` was
  written and deleted for want of an honest caller — see Done.
- [x] **The subscription is shared, and split in two.** Six panels were
  hand-rolling the same counter — `useReducer((n) => n + 1, 0)`, byte-identical —
  with **three different sets of events behind it**. Now: `useRevision(subscribe,
  deps)` here, which counts and knows nothing; `watchAnswers` in `editor-core`,
  which knows which of its own events mean "an answer could be different"; and one
  line in each app joining them. See Done for the bug the drift produced and for
  why the split is where it is.
- [x] **This package has no editor dependency at all.** Its last tie was a type
  import of `MarkState` for a three-state toggle, which is `'on' | 'mixed' |
  'off'` — declared here as `ToggleState` instead, structurally identical so
  callers still typecheck. A control that knows how the host announces its state
  is a control the host cannot reuse; the rule is that everything here works from
  props and callbacks alone, and the wrapping into an editor-shaped thing belongs
  to a product package or the app.
- [x] **The control vocabulary came out too** — `packages/office-controls`. What a
  control *is* and how it reads a selection: `Control`, `ChoiceControl`,
  `PaletteControl`, `choiceOptions`, `currentChoice`, `currentPaletteColor`,
  `stateOfMark`, `stateOfAttribute`, `markTypesIn`, `commandsIn`. It was in
  `office-word`, so Slides imported half of it from a sibling product and rewrote
  the other half. React-free and DOM-free, which is why the shared half is now 17
  tests in 4ms. See "The four layers a control is made of" above.
- [x] **The icons came back out again** — `packages/office-icons`, keyed by the
  act rather than by any product's control ids. The chrome re-exports `Icon`, so
  this cost its callers nothing; what it bought is that an editor can take the
  suite's pictures without taking Radix, a colour picker and a token stylesheet
  with them, and that `lucide-react` is imported in one file instead of six. See
  the entry in Done for what the sweep found.
- [x] **The tests are type-checked now — every package's, and both apps'.** It was
  not just Slides: `tsconfig.json` is the *build's* (`vite build` reads it to decide
  what to emit), so every package's `include` was `src/**` only and **twenty-two
  packages' tests had never been read by the compiler**. The apps had no
  `type-check` script at all, so neither their source nor their Playwright specs were
  either.

  Each now has a `tsconfig.typecheck.json` — src plus tests, `noEmit`, `rootDir` at
  the repository (a sibling package resolves to its *source* through `paths`, and
  without that every cross-package import reports as outside the root) — and
  `pnpm type-check:tests` holds the result to a number per package
  (`typecheck-budgets.json`). The budget is the conformance harness's ratchet in
  another medium: it fails when a pile grows **and** when it shrinks without the
  number coming down, because a budget above the truth leaves room to break exactly
  that much again, quietly.

  **1,359 errors** the first time it ran. 21 of 24 targets are at zero now; what the
  work turned up along the way:

  - **`hit.needs` was not the only one.** `word-indent.spec.ts` had nineteen reads of
    a property on `never`: Playwright maps what `evaluate` returns through its own
    serialisable type, and a `{ … } | null` comes back as `never`, so every
    `plain!.run` in the file was an error nothing could report.
  - **Tests written against shapes that no longer exist.** `selectionManager.setNode({
    nodeId, selectAll: true })` passes an option the method has never read and omits
    the `type` it requires; `InsertNodeCommand` is called with `{ id, type }` where the
    model's node is `{ sid, stype }`. They pass, and they describe a product that is
    not there.
  - **Fixtures that predate a required field.** A `TimelineStep` gained `echo`, `unit`,
    `stagger` and `units` when text animation landed, and three fixtures never did.
  - **Two real gaps in the types themselves.** `DeckNode` did not declare `text`, which
    `labelOfBox` reads through a cast, and `ExternalComponent` did not declare the
    `type: 'external'` discriminator the registry sorts on — both found by a test
    trying to write down what the product already does.
  - **`() => (x.length = 0)` in a `beforeEach`** hands vitest a number where it expects
    a cleanup function. Four of those.
  - **A guard should report its own package's files.** A package compiles its
    siblings' *source* through `paths`, and several packages switch the unused-symbol
    checks off in their own config: left in, ninety-five of `office-slides`'s
    hundred-and-seventy-four errors were other packages' unused locals. The script
    counts only the package's own files, which is also what let the apps go back to
    being strict about theirs.
- [ ] **976 left, in three packages** — `model` 512, `datastore` 341,
  `renderer-dom` 123, held by the budgets above. These are the oldest test suites and
  the same handful of patterns as the ones already done, at ten times the count.
- [ ] **Two rows of the motion track table still need connectors.** 선 두께 and
  선색 — a stroke's width and colour — are tracks on a `connector`, and there is no
  connector to put them on. The colour *mechanism* is done, so the day connectors
  exist these are two rows in a table.
- [x] **`office-ui` was missing two primitives, and the ratchet counted the
  callers.** Both are at three, which is the number this repository has been using
  to decide that a shape is known rather than guessed at.

  - **An icon button.** Done. `IconButton` — a hit target around one icon, in two
    sizes: `sm` for a list row (18px, from a token, because a 26px row cannot hold a
    28px form control) and `md` for one standing on its own. Seven callers came in:
    the layer list's eye, lock, close and reopen strip, Word's outline pane's close
    and reopen strip, and the find bar's three. Its **label is required**, and that
    is the point — of the seven, three had a `title` and no `aria-label` and one had
    neither. A browser check now asks the rendered chrome whether any button with no
    words has no name, so the next hand-rolled one is caught rather than reviewed.
    What is left in the layer list is the *row*, which wants a list-row primitive.
  - **A text field.** `NumberField` is numeric and `Field` is the label around one,
    so every plain text box in the suite is a raw `<input>` with its own classes:
    Word's find panel, Word's comments pane, and the deck's find bar. Which is also
    why the deck's find bar had to re-invent "a field's keys are the field's" —
    `stopPropagation` on every keystroke, written a fourth time.
- [x] **A guide can be placed from the keyboard.** `Alt+.` and `Alt+,` place one,
  `Alt+<` clears them, and all three are on the slide's own context menu with the
  chord drawn beside them — a menu is how a reader finds a chord.

  Where it goes is the interesting part: a key has no position, so `guidePlace`
  decides one, and the useful answer is not the middle of the slide but the middle
  of the **selection** on that axis, taken from the union rather than an average of
  the boxes (two shapes of different sizes have a middle that is neither of theirs).
  With nothing selected it is the slide's middle, which is also right for the first
  guide on an empty slide. A selection inside a group is translated with `toSurface`,
  because a guide is the *slide's* and a grouped shape's coordinates are its
  parent's.

  And the clear chord is written `Alt+<`, not `Alt+Shift+,` — **measured**: Shift
  composes the character before the event is dispatched, so a binding matched on `,`
  with Shift required matches nothing at all. The nudge bindings had hit the same
  trap from the other side, where `ArrowRight` matched with or without Shift and the
  coarse nudge silently did not happen.
- [x] **An icon a model asks for and nothing draws is a finding now** —
  `every-icon-has-a-picture`, and the place it needed to live turned out to be the
  conformance harness rather than either package: the product hands over the names
  (`iconsIn` in `office-controls`, beside `commandsIn` and `markTypesIn`) and the
  answer (`iconNames()`, which is the table `Icon` itself reads), so nothing new
  depends on anything new.

  The browser tests stay, and the difference between them is the point: they assert
  that nothing *drawn* fell back to writing its own name, and a control on a ribbon
  tab nobody opened — or one that appears only with a table selected — is declared
  exactly like a visible one. Measured on adoption: Slides asks for **56** and Word
  for **46**, all present, and the ten names the apps pass to `<Icon>` directly are
  too. A guard that finds nothing on the day it is written, which is the only kind
  worth having for a fallback that exists on purpose.

### The four layers a control is made of

Settled on 2026-08-21, when the toolbar vocabulary was taken out of `office-word`.
The rule that decides where a piece of chrome goes is **what it has to know**:

| Layer | Package | Knows | Examples |
|---|---|---|---|
| The drawing | `office-ui` | nothing but props | `ToolbarToggle`, `ChoiceSelect`, `ColorPalette`, `useRevision` |
| The picture | `office-icons` | nothing at all | the act→glyph table |
| The declaration | `office-controls` | `editor-core` | `Control`, `ChoiceControl`, `currentChoice`, `commandsIn` |
| The product | `office-word`, `office-slides` | its own document | `WORD_TOOLBAR`, `SLIDES_TOOLBAR`, the style cascade, a deck's slide |

The third one had no home, so it lived in whichever product existed first — and
the consequences were both of the two that are available: Slides **imported** what
it could from Word, and **rewrote** what it could not.

Measured before the move:

- `apps/slide/src/ribbon.tsx` took `ToolbarChoice`, `ToolbarPalette`,
  `choiceOptions`, `currentChoice` and `currentPaletteColor` from
  `@barocss/office-word`. A deck's font box was typed as a Word type.
- `SlidesToolbarControl` was `ToolbarControl` with three fields added, and
  `SlidesToolbarGroup` was `ToolbarGroup` — the shared half declared twice.
- `mark(type)` and `attribute(key, value)`, which build a control's state reader,
  were written in both products with **identical bodies**.
- So were the inventory functions each product's tests use to ask "does the editor
  register every command my toolbar names" — and each had to remember, separately,
  to include its own colour palettes, which is the half such a function forgets.
- And inside Word's own model, the read `currentChoice` does and the read
  `currentPaletteColor` does were the same three lines twice.

After: `office-word/src/toolbar-model.ts` 767 → 646 lines,
`office-slides/src/toolbar-model.ts` 470 → 379, and the shared half is 17 unit
tests in 4ms against a `SelectionSummary` literal — where before it was only ever
exercised through whichever shape a product's own toolbar happened to use.

**One regression, caught by the test that stayed behind.** `currentChoice` used to
return nothing the moment the selection disagreed; rewriting it over
`markAttribute` let a mixed selection fall through to what the text *inherits*, so
a selection spanning two fonts would have shown the style's font — saying *this
text is Georgia* about text that is half Georgia. Word's suite failed within a
minute. `markAttribute` returns nothing for two different reasons and only one of
them is a reason to look further, so the mixed case is now asked explicitly
through `markState`.

**What did not move, and why.** `WORD_FONTS`, `WORD_FONT_SIZES`,
`WORD_TEXT_COLOR` and `WORD_TEXT_HIGHLIGHT` are still imported from
`office-word` by the deck's ribbon. They are not vocabulary — they are shared
*content*, a font catalogue and a set of text colours, and two products
disagreeing about what a text-colour button offers would be one of them wrong. So
sharing them is right and the package they are shared *from* is the open question:
their home is the shared text model, which is `office-text` in the section below
and deliberately waiting for a third product. Moving them into `office-controls`
would put a font catalogue in a package about what a control is.

- [ ] **The keymap is the same shape of problem.** `keyLabel(chord, apple)` in
  `office-slides` is pure presentation — no editor, no product — so it belongs in
  `office-ui`, and `shortcutOf(command)` is a lookup over a product's own
  bindings. Word has bindings (`WORD_KEYBINDINGS`) and its toolbar draws no chords
  at all, which is the drift this would end.

### What of a timeline is the suite's

Asked on 2026-08-21, because a timeline may be wanted in Word and would certainly
be wanted in a design tool. The first answer given was "leave it in the app,
there is one caller" — and that was wrong, because it counted callers of *the
component* instead of callers of the thing inside it.

Counted instead: **this repository already draws three axes.**

| | Where | Tick step |
|---|---|---|
| Word's ruler | `apps/word/src/ruler.tsx` + `ticksFor` | inches, eighths, loops in twips |
| A slide's ruler | `apps/slide/src/stage.tsx` + `slideTicks` | the reader's unit, counted in the unit |
| The timeline | `apps/slide/src/timeline.tsx`, inline | **`ceil(span / 500)`, hard-coded, no test** |

*(The first two are one function now — `axisTicks` in `office-ui`. Word's is not;
see the list below.)*

All three are the same widget: a span mapped to pixels, ticks at a step a reader
can count, labels on some of them, a marker that can be dragged, and a readout of
where the pointer is. Three implementations, three answers, and the newest one —
`slideTicks`, which is the only one with the float-tolerance and the
labels-per-span judgement written down — is not reachable from the other two. The
timeline's is the worst of the three: at a 60-second sequence it draws 120 ticks
and 60 labels, which `slideTicks`' own doc calls "a grey band rather than a
scale", and it does not change when the axis is magnified.

So the split is not "the timeline is Slides' or the suite's". It is:

- **The suite's** (`office-ui`) — an **axis**: span → pixels, a step chosen so a
  reader gets a countable number of labels, ticks, a draggable marker, a pointer
  readout. And **lanes of bars**: `{id, lane, from, to, label}` that can be
  dragged, resized, snapped to given points and caught by a rubber band. None of
  that knows what a bar *is*. A Figma-like tool's prototype timeline, a Gantt
  chart and Word's ruler are all this widget with different items in it.
- **Slides'** (`office-slides`) — what a bar is made of: an effect, a direction,
  a spring, a press, a trigger, what it costs. Already there, 4,543 lines and 199
  unit tests, and none of it moves.
- **The app's** (`apps/slide`) — the step inspector, the effect gallery, the curve
  editor. These are about *motion*, not about time, and they are what a second
  product would not want.

Boundary check, measured: `slideTicks` is called from `apps/slide/src/stage.tsx`
and nowhere inside `office-slides`, so moving the tick arithmetic to `office-ui`
costs the model→chrome boundary nothing. The unit *table* (`rulerStep`) is already
there for the same reason.

- [x] **`axisTicks` in `office-ui`**, with a step chosen from a label budget
  rather than from a constant. `slideTicks` was retired into it — nothing inside
  `office-slides` had ever called it, so the boundary cost nothing — and the
  timeline's inline `ceil(span / 500)` became a caller. Its five unit tests came
  along and gained the clock's, which had none: **22 tests in `office-ui`**.
- [ ] **Word's ruler is still the third answer.** `ticksFor(contentWidth)` returns
  `{major: [{at, inch}], minor: [at]}` — a different shape from `AxisTick[]`, and
  converting it means changing what `apps/word/src/ruler.tsx` draws from. Its
  arithmetic is not wrong (eighths divide inches evenly, so there is no float
  problem to have), which is why it is last rather than first.
- [ ] **`Axis` and `Lanes` components**, after the arithmetic — the drawing is the
  cheap half and the one that should be designed with two callers in hand.
- [x] **The playback *decision* is a model** — `showing(where)` in
  `office-slides/playback.ts`. Four ways of watching one slide, three variables
  meaning "which press", and a mode test choosing between them — repeated four
  times, in a 1,100-line component, none of it checkable without a browser. Now
  one function, 12 tests, milliseconds. See Done.
- [ ] **The playback *state* is still twelve `useState`s**, and `TimelinePane`
  still takes 16 props of which 8 are `x`/`onX` pairs. Deliberately not done in the
  same step: the four mode tests were a measured defect (they had produced the
  "stepping back lands on an empty slide" bug), and consolidating the remaining
  transitions into a reducer is a refactor with **no measured defect behind it** —
  the transitions are already named functions (`goToPress`, `startPreview`,
  `stopPreview`). Worth doing when something goes wrong in them, or when a second
  caller needs them; not worth rewriting a component with 201 e2e tests as its only
  safety net on a hunch.

  The one part with a smell is the slide-change reset: a `pressFor` ref that says
  "a press deliberately set for *this* slide is not an arrival to reset". That is a
  transition rule pretending to be a ref, and it is exactly where the empty-slide
  bug lived.

- [ ] **A playhead dragged to exactly zero pops every shape on.** Certain from the
  code rather than measured on screen: `showing` treats `moment > 0` as scrubbing,
  so at 1ms the shapes press *N* brings on are hidden, and at 0ms the answer is
  `undefined` — the slide as edited, with everything visible. Every frame-accurate
  tool shows frame 0 as the pre-animation state; this product deliberately shows a
  slide at rest with everything on it, because that is what a reader arranging
  shapes wants. Both defensible, and the discontinuity between them is not: one
  pixel of drag changes what is on the slide. Deciding it means deciding what an
  editor looks like at rest, which is a product question and not a defect.

### The shared layer

Measured in `docs/SHARED-LAYER.md` rather than argued: Slides takes four symbols
from `office-word`, the Word-only half is already 33 files that nothing shared
touches, and the whole obstacle is one 1,077-line `renderers.ts` holding the text
renderers and the page renderers together.

- [x] **`renderers.ts` is split.** `surface`, the header and footer while they are being edited, the
  back matter and the contents page are `renderers/page.ts` — the four things that read the layout —
  and what is left draws text, tables, marks and shapes. `registerWordRenderers` is three lines in
  `renderers/word.ts` calling both halves, so Word is unchanged and anything else can take one.

  The deck took one straight away: it calls `registerTextRenderers` now, where it used to register
  Word's page renderers in order to override `surface` and ignore the rest. Registering something to
  override it is how a product comes to depend on the shape of another product's file.

  And the split exposed the next coupling, which was answered the same day: the env channel.
  `TextEnv` (`text-context.ts`) is the document and the resolvers; `WordEnv extends TextEnv` adds the
  layout, the pushes, the splits, the page numbers and the columns. One key, so every caller is
  unchanged, and `createWordEnv` builds the small one and puts the page's answers on top.

  Measuring what the text renderers read corrected a claim on the way: they read `styles`,
  `numbering`, `fields`, `doc`, `getTab` — **and three page answers, in `blockStyle` and nowhere
  else**. Mirrored indents need the side of the paper, a section in columns positions every block,
  and the block opening a page is pushed to its sheet. Those three read from the text side, because
  the *asking* is text behaviour: a product with no pages answers `undefined` and the paragraph sits
  where it falls.

  The text half's closure went **29 files / 7,220 lines → 21 / 5,488**, and nothing about a page is
  in it. The last thread was misfiled rather than coupled: `table-style` imported `tableRowsOf` and
  `columnsOf` from `table-pagination`, so drawing a table pulled in the paginator — and those two are
  what a table *is*, not how it breaks. They are `table-format` now.

- [x] **The registry seam says what it is doing.** `override(nodeType, template)` in the DSL is how a
  product says it means to draw something instead of whatever is drawing it now; `define` on a name
  that is already registered is **recorded** rather than refused, because this runs while a product
  is being built and a registry that threw would take an app down for something a test should report.
  Two findings, opposite failures: `silentlyOverridden()` — a definition that landed on top of
  another without saying so — and `overrodeNothing()` — an override of a name nothing has defined,
  which means the thing being replaced moved or was renamed and the product is answering a question
  nobody asks.

  The count in this entry was **stale in both directions**. It was nine, not five — `canvasBlock`,
  `ellipse`, `frame`, `line`, `list`, `path`, `picture`, `rectangle`, `surface` — and it is **one**
  now: the day the deck started asking for the text renderers alone, eight of those stopped being
  overrides at all, because nobody else defines a `rectangle` for a slide. `list` is the one that is
  genuinely shared and genuinely different, and it says `override` now. `office-slides/test/overrides.test.ts`
  holds both findings at empty.
- [x] **`office-canvas` — the extraction, and the coupling named with a number.** Thirteen files into
  a package of their own, measured before anything moved: they import each other, `editor-core` and
  `model`, and **nothing else in either product**, so it was moving files rather than untangling one.
  The deck took **99** symbols from `@barocss/office-word` and **79 of them were the canvas's**; it
  takes 20 now and none of them is. What is left is honestly the page's — fonts, the colour
  palettes, the Word env, tables, cell selection, find, the renderers.

  The argument for waiting had expired: it was about the *text* stack, where Slides reused Word's
  answers, and the canvas had nothing on the other side of the line until Word grew a drawing. It has
  now, and it reads every file in there.

  The two shape *command* files stayed in `office-word`, and that is the seam: they call the shared
  arithmetic but answer **where am I**, which is the one question a product must answer for itself —
  a deck puts a shape on the surface the reader is looking at, a page walks the flow for the block
  the caret is in. `shapes.ts` stayed for the same shape of reason: it draws, and the two products
  draw a rectangle differently on purpose.

  Found on the way and fixed rather than budgeted: `CanvasNode` never declared `parentId`, so every
  walk that climbs reached for it through a cast — the type denying something the store writes on
  every node.

- [x] **`office-text` — the extraction, once the closure was honest.** Nineteen files, 4,452 lines:
  the document access, the style, numbering and field resolvers, formatting, spacing, css, tabs,
  image layout, marks, revisions, the table format and style, the equations, the text environment,
  the text renderers — and `text.css`, which is the thing this whole document started from.

  It took three cuts to get there, each measured rather than argued. The page renderers out of
  `renderers.ts`; the environment into a text half and a page half; and then two threads that were
  only visible once the closure was small: `block-style` imported **one constant** — half an inch in
  twips — from a *command* file, dragging 563 lines of editing into every renderer, and Word's own
  SVG drawing was still in the text file that a deck overrides entirely.

  The deck's imports from `@barocss/office-word`: **99 → 14**. What is left is find and replace, the
  ribbon's font and colour models, the table commands and cell selection, and one test that
  deliberately compares Word's canvas CSS with the deck's. Find is text behaviour and will move when
  something needs it to; the rest are a page's, a ribbon's, a table's.

  The move surfaced one defect a package index is uniquely able to see: **two `tableCss`** functions,
  one in `css.ts` and one in `table-format.ts`. Two of one name in one package is a coin toss for the
  caller; the second is `tableElementCss`.

- [x] **A package's `exports` map is part of moving a file, and two thousand unit tests cannot see
  it.** `office-word/package.json` carried `"./text.css": "./src/text.css"`; the new package did not,
  so both apps' stylesheets asked for `@barocss/office-text/text.css`, vite answered *Missing
  "./text.css" specifier*, and every browser test waited thirty seconds for an editor that had no
  styles. Measured as it happened: the deck's suite reached 179 of 389 tests in **31 minutes**
  instead of 389 in five and a half.

  Nothing below the browser could have caught it. A unit test imports the source directly; the
  `exports` map is what a *bundler* reads, and only an app going through vite ever asks. The lesson
  for the next extraction is one line long: **move the exports map with the files.**

- [ ] **Find and replace could be `office-text`'s.** `findMatches`, `replaceOperations` and `step`
  are about text in a document, and the deck imports all three from the word processor. Left where
  they are because nothing yet needs them elsewhere — and moving code because it *could* move is how
  a shared layer fills up with things one product uses.

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
- [x] **`canvasBlock` in a deck drew nothing, and no check could see it.** It was
  Word's `<svg>` holding the four shape types, which in a deck are `<div>`s.
  Slides draws its own now — a relative HTML box, like every other thing it
  places — and the check that would have found it exists: see
  `every-drawing-can-hold-what-it-contains` above. It reported six pairs, not the
  two the comment had named: `frame`, `group`, `sticky` and `textFrame` are
  scene nodes too, and a canvas may hold any of them.
- [ ] **A canvas carries a size with no unit, and the two products read it
  differently.** The schema declares `canvasBlock`'s `width` and `height` as
  plain numbers. Word reads them as pixels — its `viewBox` is those numbers —
  and Slides reads them as twips, like everything else a deck places. A canvas
  authored in one product and opened in the other is the wrong size by a factor
  of fifteen, and the shapes inside it are placed by the same ambiguity. Neither
  reading is wrong; the schema saying nothing is. Found while drawing the box:
  the renderer had to pick, and a renderer picking is how this kind of thing
  becomes permanent.
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
- [ ] **The chrome and the document fight over keys, in both directions.** Two
  faults, opposite ways round, both found by building a deck's chrome:
  Ctrl+Z from a toolbar button reached nothing, because the editor binds keys on
  its own contenteditable and the focus was on a button; and Enter in a property
  field reached the *document*, because Enter's default action was still pending
  when the field blurred and the browser delivered the resulting `beforeinput` to
  whatever was editable next. So a chrome control has to route the keys it wants
  and prevent the defaults of the keys it handles, and neither of those is
  discoverable — the first does nothing at all, and the second commits a second
  edit. Worth a stated rule the suite's components carry, rather than two
  work-arounds.
- [ ] **Removing an attribute means restating every other one.** `setAttrs`
  merges, so a caller taking one away has to read the node, rebuild the whole
  attribute set without that key, and pass `replace: true` —
  `SlidesExtension._setBoxAttrs` does exactly that to clear a fill. A
  `removeAttrs` (or a documented `null` convention in `setAttrs`) would put it in
  the operation vocabulary where it belongs, with one inverse instead of every
  caller's.
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

- [x] **A selection can name a set, and the last door that had not been told is open.** This entry
  was **stale in the interesting direction**: `ModelSelection.nodeIds`, `createNodeSelection`,
  `selectedNodeIds` and `Editor.setNode` had all answered it — but `SelectionManager.setNode`, the
  way the spike itself reaches a selection, read `nodeId` and `startNodeId` and a set has neither, so
  it answered **null**. Not "kept one of the three": no selection at all, from the method that shares
  its name with the one that works. Two doors of one name with opposite outcomes is worse than a
  missing feature — the caller cannot tell which they are holding.

  And the fault underneath it, measured the same hour: **a deleted member stayed selected.** The
  guard against a dead selection asks about `startNodeId` and `endNodeId` — the whole of a range, and
  half a story for a set, where the deleted node is usually neither end. Select three shapes, delete
  the middle one, and all three were still selected with one of them gone from the store; the next
  command acted on a node that is not there. `withLiveNodes` prunes the set and moves the ends onto
  the survivors, and clears only when nothing is left — because two of my three shapes are still here
  is what a reader means, not "never mind then".
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
- [x] **`input-enter-sweep.spec.ts` was flaky, and one of its checks had never
  once passed.** Caught in the act rather than re-run — see Done.

---

- [ ] **The slide suite still sleeps in 318 places.** Five tests that actually
  failed under load are fixed — see Done — and the pattern they came from is
  everywhere: `waitForTimeout` then assert. Most of those sleeps are harmless
  (waiting for a command to land before *pressing* something else), and the
  dangerous ones are specifically **a sleep followed by an assertion about an
  animation**. Counted: 69 of the 318 are a wait followed straight by an
  assertion, and most of those are about the *document* after a command rather
  than about something still moving. Worth converting when a test is touched for
  another reason rather than in one sweep, and worth knowing the rule: *if the
  thing being waited for is readable and still moving, poll for it; a fixed wait is
  honest before a gesture — and it is the only way to assert that nothing
  happened.*

- [ ] **The chrome's audit list, measured on 2026-08-21.** Counted rather than
  guessed, at 1440×900 with a shape selected:

  - ~~**No context menu at all.**~~ Done — and the last of it too: a right-click on
    the **grey around the slide** used to get the browser's menu, because the
    overlay is the slide's box and there was nothing out there to act on.
    Suppressing it needed something to offer instead, and the guides were that
    something — the slide's menu has items now that are not about a shape. A window
    listener rather than a bigger element, because growing that layer to cover the
    stage would put its coordinate space and the slide's out of step.
  - ~~**No ruler and no draggable guide.**~~ Both done — see below.
  - ~~**Nothing says what a drag is doing.**~~ Done — see below.
  - ~~**No status bar.**~~ **Re-measured 2026-08-23 and mostly answered already**: the
    zoom, `화면에 맞춤` and the slide number (`1 / 5`) are all in the top bar, and the
    selection count is the properties panel's heading (`3개 선택`). What a status bar
    would add over that is a *place*, not an answer — so it stays unbuilt on purpose
    rather than by omission. Worth knowing that the entry was written before the fit
    control existed: a list of gaps rots exactly like a list of anything else.
  - The ribbon is **61 icon buttons in two rows with 10 unnamed groups**. Word's
    ribbon has the same shape and both are tested for fitting at 620px. Whether a
    deck's toolbar should have *tabs* (Home / Insert / Animate) is a product
    question rather than a defect, and it is the one thing here that would change
    how the app is used rather than how it looks.

- [x] **A reader can choose a theme colour** — the 테마 색 dialog. See Done.

  *(The entry that asked for this had lost its body to an editing accident and was
  one line long. Kept in the history because the accident is instructive: a backlog
  item with no reason in it is indistinguishable from a note somebody left
  themselves.)*

## Done

- **Code is coloured, in both grounds, by one function.** `paintCode` paints **ranges** through the
  CSS Custom Highlight API: no element is added and no text node is split, so the run under the caret
  is the same flat piece of text it was — which is the only reason a block *being typed in* can be
  coloured. The published page runs the same function from a copy of its own source inlined by the
  export, so the editor and the visitor cannot disagree about a colour; that is why the module has no
  imports and references nothing outside its body.

  The tokenizer is a scanner rather than a parser and will be wrong about a regular expression
  containing a quote. That is the trade a code *sample* can make.

- **`tsc` was not run anywhere across the repository.** `pnpm test` runs vitest, and vitest does not
  type-check — so a renderer given a `spellcheck` attribute the DSL's element types did not declare
  shipped with 4,700 tests green, and sat there for a commit. `scripts/typecheck-all.mjs` checks all
  35 projects, as a ratchet: three demo apps that predate the products are listed as known-broken
  with the reason, and an entry that starts passing is reported as stale.

- **`marks` is read, and it was the last of the family.** A node definition may say which marks a run
  inside it takes — absent is anything, `[]` is none — and nothing had ever consulted it. `applyMark`
  and `toggleMark` do now, which is why bold inside a code block is refused rather than published as
  a `<strong>` inside a `<pre>`: nothing a highlighter expects, and lost the moment the code is
  copied out as text.

  Two lines drawn while doing it. The **operation** reads it rather than the toolbar, because a mark
  arrives through a paste, a command, a loaded document and a test and only one of those passes a
  button. And **`setMarks` is not guarded**: it writes a list wholesale and is how an inverse
  restores what an operation took, so a guard there would make undo refuse to put a document back
  into a state it was actually in. A mark already on a run is still removable.

  `code` was read the round before, and `whitespace` is deliberately never declared — the whitespace
  is literal because the element is a `pre`, and a second answer nothing consults is the fault itself.

- **`insertText` had never worked, so Shift+Enter has never inserted a line break.** The command
  guards itself by asking whether `replaceText` can run — and asked it with **no payload**, while
  `replaceText` declares `canExecute: payload => payload?.range != null && payload?.text != null`. So
  the guard asked *can you replace no text in no range*, the answer was correctly no, and `insertText`
  returned `false` every time it was called, in all three products, for as long as it has existed.
  `EditorViewDOM.insertLineBreak` **is** `insertText('\n')`.

  Nothing caught it because a command that declines is indistinguishable from a key nobody pressed.
  Found while giving a code block its own Enter, which goes through the same door. `backspace` was
  guarded the same way and is fixed with it; `editor-can-run.test.ts` holds both.

- **Three blocks could be placed and not selected.** `blockQuote`, `horizontalRule` and `codeBlock`
  went onto the rail and not into `SELECTABLE`, so they drew perfectly and could not be moved,
  deleted, given a colour or typed into. The round that added them checked that each *appears* and
  never checked that a reader can get hold of one — which is the same shape as the check that a
  command exists without asking whether anything can reach it.

- **`editor as any` came down four, from 343 to 339.** Every one of them was over a door that is
  already open: `getRootId()` and `dataStore` are public members, cast away by a `never` in code
  written this month. The ratchet in `editor-is-typed.test.ts` is what said so — and it says so about
  the whole repository, which is why running only the packages a change touches is not enough.

- **A node that changed type disappeared off the page.** `transformNode` changes a node's type where
  it stands, which is the right shape for a detach — the block keeps its sid, its place and
  everything written on it. Measured in the browser it also vanished: the document held the result
  perfectly and there was nothing on screen until a reload.

  Two faults, one behind the other, and the first one hid the second.

  The reconciler asked whether the DOM could be reused by comparing **tags**, and two different node
  types can draw the same element — a placement and a frame are both a `div`. So it took the update
  path and kept the element; then `ComponentManager.updateComponent`, which compares `stype` and is
  right to, unmounted the old component and **took that very element out of the document**, leaving
  the new one nothing to attach to. Two answers to *is this the same thing*, one of them made after
  the other had already acted on its answer.

  With the element back, everything **inside** it was gone. A replaced node was handing its history
  down: its children found alternates in the old subtree, called themselves updates, and reused DOM
  elements that had just been removed with their old parent. React deletes the old fiber and mounts
  a fresh subtree; this kept it — in two places, and clearing the first alone left the second, which
  finds a previous child by sid straight out of the old vnode.

  The fix is three lines in `renderer-dom` and it is held by `test/replaced-root.test.ts`, which now
  covers a node changing type *while keeping its sid* — the shape a detach has, and the one no test
  had. The site's detach uses `transformNode` again; the deck's, which shares the line, is covered
  by the same fix.

- **A list was not a list.** It drew `<div class="w-list">` holding `<div class="w-list-item"
  data-marker="">`: no bullet, no number, no `<ul>`. The marker is Word's — it comes from a
  *numbering definition* through the env, which is right for a document with eight list styles and
  resolves to the empty string for a product that has none. So 목록 in the toolbar put an
  indistinguishable pile of sentences on the page, and `PAGE_CSS` carried rules for `ul`, `ol` and
  `li` that could never match anything. A site draws `<ul>`/`<ol>` and lets the browser mark them,
  which is also the two elements that *mean* a list to a screen reader and to a search engine.

  Under it: the insert wrote `kind: 'bullet'` and the schema declares `type`. An attribute nothing
  reads, on the one node whose whole question is *which kind* — and invisible for as long as a list
  was not a list. The exemption saying `type` was "office-text's to draw" went stale the same minute
  and the harness said so, which is exactly what an exemption is for.

- **The rail restated the model.** 담는 것 and 넣는 것 were two arrays of command names written out
  in `rail.tsx`, so five newly registered inserts were reachable by no button and nothing could see
  it — a hard-coded array is not a claim about anything. A control now says whether it makes a thing
  that holds other things or a thing that goes in one.

- **A component's nodes were in no stylesheet at all.** The export keyed a rule by a node's id and
  found the nodes by walking the page — and a component definition lives *beside* the pages rather
  than in one. So the header, the footer and both buttons, the four things on the sample that appear
  on every page, could say `overrides: { mobile: … }` and the published page carried no media query
  for any of them. Since media queries were written; found a month later, and only because a hover
  set on the button did not reach the export either.

  A drawn part carries `placement~part`, so one definition placed five times is five ids for the
  thing a reader edited once. `[data-b$="~part"]` is the one selector that says *every placement of
  this*, which is exactly what placing a component means. `styledNodes` is the walk that includes
  them, and the export test that caught the change now walks the definitions too.

- **Three checks nobody ran.** `overrideFaults`, `linkFaults` and `stateFaults` each had a unit test
  beside it and nothing had ever asked any of them about a real document. That is worse than not
  having them: a check nobody runs reads, to the next person, exactly like a check that passes — the
  same failure this repository has now written down three times about itself. `documentFaults` is the
  one walk that asks all three, it reports rather than validates, and the sample answers clean.

- **Four words that looked like navigation.** Each item was a bare paragraph: a 14-pixel-tall target
  on a phone where every guideline asks for something near 44, and nowhere for a hover to live, since
  a state is paint and a paragraph is not painted in this schema. One fix for both — each item is a
  box with the word in it. When the hit area and the hover turn out to be the same fix, the structure
  rather than the styling was what was wrong.

Newest first. The surprise each one produced is the part worth keeping.

- **Where the shared sheet stops paying, measured — and the hole it left, closed.**

  Five of the deck's twelve groups moved and then the arithmetic turned. Each of the remaining seven
  wants a **new concept in the shared model** to save fifteen to thirty-five lines: 재생 needs a
  group-level note, 화면 전환 needs a slide-level command target rather than a box's, 문서 변수 연결
  *is* its sub-component (the row list comes from `BINDABLE_ROWS` filtered by the schema and the
  options from the document's variables), and the geometry group's 다른 덱 row carries a library
  list, a cross-field payload (`deck` and `to` together) and local state.

  That is the shared model absorbing product specifics one at a time, which is the opposite of what a
  shared system is for. Written down as a **boundary** rather than a to-do: the sheet pays for rows
  that are *a value with a label*, and that is five groups of twelve. The other seven are not panels
  of fields; they are small applications.

  **So the remaining value was in the guard, not the conversion.** The 배치 mistake — geometry rows
  and a frame's arrangement declared under one heading, drawn as two for as long as the panel has
  existed — went through a real gap: the unit test reads the rows, the browser check asked whether a
  control is *drawn*, and **where** it is drawn was nobody's question. That gap covered all twelve
  groups, converted or not.

  The check asks it now, and not by comparing text: a panel's first group is headed by what is
  selected — 제목 상자, 프레임, 연결선 — so the declaration cannot name it and does not try. What it
  can promise is that a declared group is **one** group on screen, every row of it under the same
  heading whatever that heading says. Re-introducing the bug fails it by name; that is the promise
  배치 broke, and it now holds for the seven groups that will never be converted as well as the five
  that were.

- **The deck's groups are moving to the shared sheet, one at a time: 328 lines gone so far.**
  Five groups now: 연결선 (214 lines), 채우기와 선 (103), 배치 (77), 텍스트 (35), 그림 (31) — each
  replaced by `{sheet('...')}` against a declaration. `properties.tsx` is 2,863 → 2,535, and the
  browser suite is 392/392 at every step.

  **And 배치 was in the wrong group in the declaration.** The panel's *first* group is headed by what
  is selected — 위치, 크기, 회전, 상태 — and 배치 is the arrangement a **frame** imposes on what is in
  it. The declaration had both under one heading, and neither the unit test nor the browser check
  could see it: one reads the rows and the other asks whether a control is drawn, and *where* it is
  drawn is a question nothing asked. A heading nobody checks is a heading that can be wrong.

  What each group taught, beyond the four findings below:

  - **A stack is a section, not a row.** `PaintList` and `EffectList` draw their own `PropertyGroup`
    because a paint stack adds, reorders, switches off and deletes — so `fills` and `effects` are
    declared in groups of their own rather than as rows of 채우기와 선, and the sheet does not try to
    draw them. The declaration still carries them, which is how the harness sees them at all.
  - **A corner with no number of its own follows the radius**, so each field shows what the box is
    actually drawing rather than a zero. That is a *dynamic* fallback — another attribute's value —
    and it lives in the deck's `read()` rather than in the shared row: if a second panel ever wants
    "this value follows that one", it becomes a field on `PanelRow` instead of a second copy of the
    line.


  `연결선` — nine rows, two buttons and a count — is now `{sheet('연결선')}` against a declaration in
  `panel-model.ts`. `properties.tsx` went 2,863 → 2,747, and eleven more groups are the same shape.
  Converted one group at a time on purpose: the file has a 392-test browser suite and
  `panel-model.spec.ts` checks each group against what the panel actually draws as it moves.

  Four things the conversion found, and the first is the one worth keeping:

  - **The shared sheet was using the ribbon's dropdown in a panel.** `canvas-model.md` §6 has said
    since before the sheet existed: *"Native dropdown in a panel, Radix in a ribbon … a panel's
    dropdown is a list of words, where the platform's control is smaller, faster and already knows
    how to be typed into."* The sheet used `ChoiceSelect`, and the deck's suite said so in one line —
    `selectOption` on a Radix trigger is *"Element is not a `<select>` element"*. **The site
    builder's panel had been using the ribbon's control all along** and nothing had noticed, because
    nothing had a reason to open it.
  - **A `title` wins the accessible name over a button's own words.** 뒤집기 announced as
    *"시작과 끝을 바꿉니다"* — its tooltip — so a reader hears a sentence where a word belongs, and a
    check asking for the button by what it says found nothing.
  - **An emptied text field means two different things.** A page reads it as `undefined` — taking a
    value back at a narrow width is how a reader says "the page's answer again" — and a connector's
    label reads it as `''`, because emptied means *no label* and `undefined` reaches the command as
    "you did not mention this".
  - **`[]` is not `null`.** Clearing a line's bends says a reader took them out; `null` says the line
    never had any, and the route reads them differently.

  One control kind disappeared on the way: `length` — a number in the reader's chosen unit — became
  the shared `number` once `PropertySheet` learned to **ask** for a suffix. A length's unit is a fact
  about the session rather than about the row, so a deck that declared `unit: 'px'` would print the
  wrong word beside all eleven of them. Two of the deck's own kinds are left (`list`, `binds`) plus
  `action`, a button that runs a command — which took `reverseConnector`'s exemption off the books
  the moment it was declared.

- **A check that has nothing to look at is a check that passes.**

  The deck's panel declaration had eleven connector rows and **four of them were wrong** — `경로`
  declared as `연결선 모양`, `흐름` as `화살표`, `구부리기` as `휘어짐` — and the browser check that
  exists to catch exactly that had been green the whole time. The sample deck holds no connector, so
  the check selected what was there, found no connector, and asserted nothing about eleven rows.

  That is the failure this harness is named after, committed by the harness. The repair is the one
  `connector.spec.ts` already uses: **make** the thing rather than look for it — two shapes, a join,
  and the panel has a connector in it.

  Two smaller things fell out of putting a connector in front of it:

  - **`when` needed a second reading.** A grid has columns *when `layoutMode` is grid*; a label's
    size, colour and weight appear *when there is a label at all*. Both were needed within a day of
    each other, so `is` is optional now and its absence means "has any value" — and a row that is
    always drawn and inert half the time is a row a reader learns to ignore.
  - **A conditional row skipped by every check is a row nobody has ever looked at.** The three label
    decorations were declared without anyone knowing whether the panel drew them. The check now
    *types a label* and then asks, which is the difference between skipped and checked.

- **Where a row belongs is the schema's answer, and a hand-written list got 27 entries wrong.**

  Found on the way into converting the deck's panel: `properties.tsx` gates each group with
  `declares('layoutMode')` — it asks the **schema** whether the selected node type has the attribute
  — and the declaration written to replace it carried five hand-written lists of node types instead.
  Measured against the schema, **27 of their entries were wrong**, and every one was a fault in one
  of two directions:

  - a control that writes nothing: `너비` on a connector, which has no width; `채우기 추가` on a
    picture and on a placement, which have no `fills`; `세로 맞춤` on a sticky note.
  - a control a reader cannot reach: `선 색` and `선 두께` hidden from a line and from a connector,
    both of which have a stroke; every corner row hidden from a video.

  The site builder had the same class of fault and a worse instance of it: **a heading and a
  paragraph were each offered 폭, 최소, 최대, 배경, 테두리 색 and 테두리 두께** — seven controls,
  on every text block on every page, none of which those types declare. The schema was narrowed for
  exactly this reason months ago (*"a reader who wants a hugging heading puts it in a stack that
  hugs"*) and the panel had not been told.

  So `on` is a **narrowing** now, not the answer. A row with no list appears wherever the schema
  declares its attribute, and both products are at zero divergence. Three kinds of row still cannot
  be asked about and fall back: one that writes a node, one that writes nothing, and any row at all
  where a product has no schema to hand. The first version missed the middle one and the 종류 row
  vanished from every panel in the site builder — caught by a browser test, not by the unit test,
  which is the argument for having both.

  **And one of my own exemptions was wrong in the expensive direction.** `startCap` and `endCap`
  were exempt from `every-property-can-be-edited` as *"not offered — owed"*, and the panel has drawn
  them all along as 시작 모양 and 끝 모양. A prose claim about a React tree, in the file whose whole
  purpose is to stop prose claims about React trees. Somebody would have built a control that already
  existed.

- **A panel is one thing now, not three — and the third product was the reason to build it.**

  Asked, while converting the deck's panel, to keep the UI a shared system rather than a per-product
  one. The measurement said the same: the two panel declarations written a week apart shared **eight
  of their fields and five of their control kinds**, and Word's ruler is a fourth surface of the same
  shape. Two copies is a coincidence; this was the third.

  Split three ways — the declaration is the product's (`office-controls`' `PanelRow`), the drawing is
  the suite's (`office-ui`'s `PropertySheet`), and the **kinds stay open at the edges** so a page can
  have a dataset picker and a deck a paint stack without either knowing about the other. The site
  builder's inspector now draws through it; the deck's is next and has a browser check to convert
  against.

  Three things fell out that were not planned:

  - **The shared type wanted a field the deck's declaration did not have.** `PanelRow` requires both
    `label` and `ariaLabel`, and the deck had only the second — so 23 rows gained the short name a
    reader actually reads, and the ones where they differ (`맞춤` / `교차 축 맞춤`, `열` / `열 수`,
    `가득` / `프레임 가득 채우기`) stopped being invisible.
  - **The sheet must convert nothing.** The first version left the unit conversion out and a gap read
    `480` where a reader expects `32`. Twips to pixels is a fact about a document model, so it
    belongs in the product's `value` callback — a sheet that converted would be a second place that
    knows what a length means.
  - **`render` needs three answers, not two.** A node, `undefined` (the sheet draws it) — and `null`,
    *hide the row*. Without the third the panel drew a labelled row with an empty right-hand side for
    the note that only means something at a narrow width, which reads as a control that failed to
    load.

- **Word can answer the check now, and its answer is a list of four dialogs it has never had.**

  The last `notYet`. Word has **no property panel** — its chrome is a ribbon, a ruler, an overlay for
  shapes and three read-only panes — so the site's and the deck's answer (a panel as data) does not
  apply, and the missing declaration turned out to be one level up: `office-controls`' `Control`
  declares `command` and `payload` and never **which attribute pressing it writes**. Those are
  different questions with different answers — `setBlockFormat` is one command and twenty-four fields
  in the site builder — and until `writes` existed the only surface that could answer "can a reader
  set this value" was a panel.

  `Control.writes` plus `ruler-model.ts` — the ruler being the only place in Word a paragraph's
  indents or its tab stops can be changed at all — cover **17 of the 77 attribute names Word draws**.
  Findings went 252 → 178, and the 60 names left are not scattered:

  | owed | names |
  |---|---:|
  | a borders dialog (`borderTop*` … `borderLeft*`) | 16 |
  | a field's own settings (`tag`, `literal`, `sequence`, `limitLocation`, …) | 12 |
  | page setup (page size, margins, columns) | 8 |
  | table properties (`cellSpacing`, `hide*`, `noWrap`, `heightRule`) | 7 |
  | paragraph spacing (`spacingBefore`, `spacingLine`, `spacingLineRule`, …) | 5 |

  plus a handful a **drag** writes on a drawing. That is a ratchet rather than sixty exemptions,
  because none of them is a decision: every one is a control somebody will build, and writing "owed"
  sixty times is a hand-kept list wearing a harness's clothes.

  **The measurement that mattered was reading the right number.** 252 findings looked like a
  migration and 77 *names* is a session — an exemption is keyed by the attribute, not by the node
  type, so `x` on twelve node types is one decision. The same correction applied to the deck: 334
  findings, 80 names.

  All three products answer every check now, and `notYet` has no callers — which is exactly what a
  deferral should end up as.

- **Three mocks found dead the same way, and 20 switched-off checks came back.**

  The other half of watching the tests: a skipped test is a check somebody turned off, and nobody had
  asked why. 18 skipped blocks, and enabling each one to find out gave the same answer three times —
  **not the reason written beside it**.

  | switched off | the note said | the measurement said |
  | --- | --- | --- |
  | 15 IME/composition tests | *(nothing)* | `handleCompositionStart is not a function` — the behaviour moved to `EditorViewDOM._isComposing` |
  | 5 MutationObserver tests | *(nothing)* | `editor.executeCommand is not a function` — a hand-rolled mock with eight methods |
  | 16 selection tests | *"requires full DOM/selection sync"* | `dataStore.setActiveSchema is not a function` — a hand-rolled store with nine |

  **A fake that has to keep up with a real type drifts, and the drift shows up as a skipped test
  rather than as a failure anybody sees.** That is the same fault as `(editor as any)` — a shape
  asserted rather than checked — and it hides better, because a skip is quiet where a cast at least
  compiles against something.

  What each turned into:

  - **The IME file was deleted.** Rewriting it would have been the mistake twice: a synthetic
    `compositionstart` in jsdom is a string with a name on it, and every composition fault this
    product has had is about *interleaving* with `beforeinput` — a jongseong committed twice, a space
    after a composition eaten, a syllable boundary split. Held by **47 browser tests**, and
    `input-hangul-jongseong.spec.ts` now says so at the top so the next person finds a decision.
  - **The MutationObserver file lost five tests and kept three.** The five asserted on
    `handleTextContentChange`, and `mutation-observer-manager.ts` says in its own comment that the
    route is retired — *"onTextChange is disabled … handleDomMutations path is authoritative"*. The
    mock is gone; the file builds a real editor over a real store.
  - **The selection suite went from 16 off to 4 running and 12 named.** The note was *half* right:
    twelve of them end at `window.getSelection()` and belong in a browser, and four were never
    waiting for anything. Twelve named skips beat one blanket skip — each says what it is waiting for.

  Skipped blocks: **18 → 8**, and of the 8 left, 4 carry a written "current implementation limitation"
  that is its own work list.

- **19 of 6,851 tests asserted nothing, and three of them were wrong about the code they described.**

  Asked to watch the tests, on the grounds that there may be odd ones. There were — and the bold
  finding had already shown how: a unit test asserting *"bold and italic mean one thing; there is
  nothing to read off them"*, which was a belief rather than a behaviour.

  Swept for tests that assert **nothing at all**: 19 of 6,851 blocks. What they were:

  - **A documentation script.** `vnode-structure-snapshot.test.ts` — seven tests, fourteen
    `console.log`s, feeding `docs/vnode-structure-examples.md`, which does not exist. It ran on every
    CI run, printed JSON nobody read, and could not fail. Now seven real snapshots, which guard a
    VNode shape every other test here is blind to: they all assert on the DOM, and two different
    trees produce the same DOM until the day they do not.
  - **"Should not throw", said by not throwing.** A bare call passes both when the function behaved
    and when it did nothing, and a reader of the report cannot tell which.
  - **Three tests that argued themselves out of their own names** in comments — *"may be called …
    it's normal if it is not"*, *"may not occur in practice … may differ from actual usage"*,
    *"need to verify actual behavior"* — and printed instead of asking.
  - **Two `describe.skip`s holding one empty `it`**, kept as notes about where the real tests live. A
    note that runs, costing a line in every report.

  **Three of the four hedged comments were wrong about the code.** `updateComponent` *is* called;
  the mutation observer *never reaches* its handler for a node with no sid; a store with no schema
  *does* hand back a proxy. A printed number nobody reads cannot correct a belief — only an
  assertion has to, which is the whole argument for asking rather than logging.

  **And the sweep itself was wrong three times before it was right**, which is the reusable part.
  850 → 69 → 39 → 25 → 19, and every wrong answer was the tool: the body taken as `{ page }` (a
  Playwright test's destructured argument), `expect.poll` missed for having a dot in it, brace
  counting running through a `${…}` inside a string, and a body that is one call to a local helper
  that asserts. A check that reports falsely is worse than one that misses, because the false one is
  believed — and this repository has now produced that finding about a probe, an exemption, a browser
  check and a sweep.

  `packages/conformance/test/every-test-asserts.test.ts` keeps it at zero, and fails by name — checked
  by adding a silent test on purpose.

- **Bold was not bold. Eleven marks drew nothing, in all three products, and no check could see a mark.**

  Asked whether the site builder is finished. Measuring it found something much larger than the
  answer: **the sample site has five pages with addresses, a navigation row reading 제품 · 가격 ·
  소개 · 블로그, and zero `<a>` elements.** The blue words in its hero are a `fontColor` mark that
  looks like a link and is not one.

  Following that down: the `link` mark has been in the standard schema since it was written — `href`
  required — and `toggleLink` has been a registered command for as long. It drew nothing. And it was
  not alone: `bold`, `italic`, `underline`, `strikethrough`, `code`, `subscript`, `superscript`,
  `kbd`, `mention`, `spoiler` and `footnoteRef` appear in **none** of `office-text`'s three format
  tables. A mark with no entry becomes `<span class="mark-bold">`, and nothing styles that class in
  any of the three products.

  Measured in Word rather than reasoned: press 굵게, and `.mark-bold` exists as a `<span>` with
  computed **`font-weight: 400`**.

  **Why 351 browser tests and 470 unit tests passed over it.** Three reasons, and each is a lesson:

  - **A mark is neither a node nor an attribute**, so all eight conformance checks step over it.
    `every-node-is-drawn` walks node types, `every-attribute-is-read` probes a node's attributes, and
    a mark falls between them — the same shape of blind spot as an attribute the probe could not
    invent a value for, one vocabulary along.
  - **The two weight assertions the suite has are about a *style's* formatting**, which resolves
    through the cascade rather than through a mark. Nothing had ever asked whether the bold *button*
    does anything.
  - **A unit test asserted the false belief out loud.** `mark-format.test.ts` said *"bold and italic
    mean one thing; there is nothing to read off them"* and checked they were absent from
    `VALUED_MARKS`. The assumption was that the default `mark-bold` class was styled somewhere. It
    was not, anywhere.

  Fixed in the shared layer, so all three get it: the plain marks are CSS entries now and `link` is a
  real `<a>` — because half of what a link *is* lives in the element (a keyboard reaches it, a
  screen reader announces it, a middle click opens it elsewhere) and a styled span can never be given
  that. `every-mark-is-drawn` is the ninth check; it examines 24 marks in the site builder and found
  four more in Word, three of which are honest exemptions (`commentRef` drawn by the overlay,
  `bookmark` deliberately invisible, `noProof` which must not draw) and one — `endnoteRef` — a real
  gap now drawn like a footnote's.

  Two smaller things worth keeping: `text-decoration` is a **shorthand**, so two marks each writing
  it would leave whichever was applied second — a struck-through underline silently losing its
  underline, which reads as "underline stopped working" rather than as a cascade. And `draggable`
  was missing from the DSL's global attributes, which matters most in an editor: the default for an
  `<a>` is that dragging it drags the link, making a paragraph with a link in it the one paragraph a
  reader cannot select across.

- **Word has a spec now, and its numbers are held by a test.**

  Asked whether the products need a written definition. The answer that came out of measuring: a
  whitepaper is the wrong shape — `list-feature-checklist.md` is what one becomes, 62 lines of
  unchecked boxes pointing at a `.cursor/skills` path that no longer exists. The split that works is
  **intent in prose, state in the harness**: intent does not rot (a word processor still needs page
  setup next year) and state rots the moment it is written down.

  `site-builder.md` was already the right shape, and Word had nothing at all. `docs/specs/word.md`
  is that, with one difference worth naming: the site builder's was written *before* the product
  existed, because a boundary recorded after the fact is a rationalisation. Word's is the other case
  and says so — everything in it is measured out of what exists.

  **And a spec full of numbers is a hand-kept list.** *"Re-measured 2026-08-18, and five came off"*
  is what a document does when nothing checks it, and this one states 107 node types, 1,053 attribute
  slots, 166 commands, 60 toolbar controls, 21 settable attributes and two ratchets.
  `spec-numbers.test.ts` reads them out of the product and fails by name when one drifts — verified
  by drifting one on purpose.

  What the document turned out to be *for*, which was not obvious before writing it: the harness
  produced the work list (four dialogs Word has never had, 60 attribute names) but cannot say **what
  is missing from the vocabulary** — `cornerRadius` did not exist on a frame, so nothing was absent,
  and a schema that declares less passes more easily. That gap is the one part a person has to keep
  honest, and now there is somewhere to keep it.

- **`(editor as any)` appeared 942 times, the type was already right, and switching the compiler back on found four real faults.**

  Asked why it is written everywhere. Measured: **942 casts across 152 files**, reaching for
  `dataStore` (147), `executeCommand` (140), `registerCommand` (124), `getRootId` (119) and
  `selection` (94) — and `Editor` declares every one of them as a public member. A file that calls
  all seven **without** a cast typechecks unchanged; so does one that walks a document through
  `dataStore.getNode`. There was never a reason. The idiom copied itself.

  It is not a style problem. `(editor as any).exectueCommand?.()` is valid TypeScript, evaluates to
  `undefined` and does nothing at run time — and the `?.` makes it worse, because a call on a method
  that always exists cannot be absent, so the optional chain only hides the day it becomes absent.
  That is this repository's own signature failure, one layer down: a thing that looks done, breaks
  nothing, and does nothing.

  **599 of the 942 are gone** — `apps/slide` from 226 to zero, `packages/extensions`,
  `editor-view-dom`, `office-word`, `office-slides`, `office-site`, `office-canvas` and `office-text`
  all cleared of the mechanical ones — and the compiler reported four latent faults the moment it
  could see again:

  - **`currentNode.text.length` on a node with no text** (`move-selection.ts`), guarded by a boolean
    TypeScript cannot narrow through. The guard was the only thing between this and a crash, and
    nothing said so.
  - **`?.` on the wrong thing, nineteen times** (`apps/slide`). `editor.executeCommand?.()` guards a
    method that always exists; `editor` is the part that can be null, and it was bare.
  - **A `ModelSelection` with no `type`** handed to `toggleMark` (`input-handler.ts`) — a range in
    every sense except the one nobody had to write down.
  - **A command returning a string** (`revision-commands.ts`). `_move` answers *which* revision it
    landed on and a command answers *whether it ran*; a string is truthy, so it worked and told every
    caller checking `=== true` that it had not.

  plus `getRootId()` being `string | undefined` — a document that is not loaded has no root — at six
  sites that assumed one.

  **And one lesson about running the suite, not about the code.** Two runs mid-way came back with
  four and five failures against a set that varies run to run, and the cause was mine: the package
  edits were happening **while the browser suite ran**, so Vite rebuilt underneath it. Re-run with no
  concurrent edits: 392/392. A green suite is only evidence if nothing was writing to the tree while
  it ran.

  `packages/editor-core/test/editor-is-typed.test.ts` holds it: it asserts the seven are public, and
  ratchets the count in **both** directions — up means a new cast was written, down means the number
  has become a lie about how much is left. Lowered once, 942 → 343, which is the only way a ratchet
  is supposed to move. What is left is mostly tests and `packages/model`, where the cast is often on
  a *fixture* rather than on an editor.

- **The deck's panel is a declaration too, and it was wrong in six places.**

  The second product through the same door. Its panel is 2,863 lines against the site's 615, so the
  measurement came first: the check would examine **337** attributes, and with nothing declared, 334
  had no surface — but only **80 distinct names**, because an exemption is keyed by the attribute and
  not by the node type. Eighty is a session; 334 is not.

  `panel-model.ts` declares its 44 rows, `slidesPanelCommands()` and `slidesPanelAttrs()` answer the
  harness, and **13 exemptions went stale** — every one a sentence describing a row. Findings went
  334 → 60 → 0, the last step being exemptions with reasons in four kinds: dragged rather than typed
  (a connector's ends, a path's outline), a durable reference a reader must never retype, a
  resource's own fields edited where the resource is, and four that are simply **owed** — a
  connector's cap shapes, a film's `autoplay`/`controls`/`loop`/`muted`, a frame's `clipsContent`,
  and the table and code panels neither product has.

  **The declaration was wrong six times, and every one was caught rather than shipped.** `playback`
  is not an attribute of anything (the row writes `startsWith`); `motion` is not a node type
  (`motionTrack` is); `맞춤` is `교차 축 맞춤` and `열` is `열 수`; `가득` is `프레임 가득 채우기`;
  and `채우기`/`색`/`효과` are not rows at all — a paint stack's control is its **add** button and a
  shape's one colour is the stack's first entry, so three declared rows described controls that do
  not exist. A declaration read out of JSX is a hand-kept list until something checks it.

  **And the check that caught them was itself wrong first.** Playwright's `getByLabel(string)`
  matches a *substring*, so asking for `간격` found `간격 문서 변수` — a different row — and two
  assertions passed over controls that were not drawn. `{ exact: true }` is the fix and the lesson is
  the sharper one: a check that can pass by finding the wrong thing is worse than no check, because
  it is believed.

  **What is honestly weaker here than in the site**, and written down rather than glossed: the site's
  panel is *drawn from* its model — `inspector.tsx` maps over it, so there is nothing to drift from —
  and the deck's still draws its own rows. So the guard is `apps/slide/tests/panel-model.spec.ts`,
  which opens the deck and asserts every declared row is a control the panel draws. A check catches
  drift; only mapping over the model makes drift impossible. Converting `properties.tsx` is the next
  step, and it now has a test to convert against.

  **Word is a different job and was measured, not started.** It has no property panel at all — its
  chrome is a ribbon and dialogs — and its ribbon's `Control` declares `command` and `payload` but
  never *which attribute it writes*. With nothing declared the check finds **252**, so word needs
  `writes` on `office-controls`' control types and then a ratchet, which is a haul rather than a
  sitting. `notYet` still names it, which is the point of `notYet`.

- **The panel was the escape route, and it was the same rule this repo had already applied twice.**

  Asked directly why the harness kept missing things and why the code kept ending up outside it. The
  measurement is unambiguous: **44 exemptions across the three products are prose claims about a
  property panel**, eight of them added in one week. The site's own conformance test says why in as
  many words — *"The property panel is a third surface and the harness has no notion of one — it can
  read a toolbar model and a key map, and a panel is a React tree."*

  Which is not a limit of the harness. It is the rule that produced `toolbar-model.ts` and
  `keymap.ts` — *"a ribbon that declares its own commands in JSX is a declaration nothing can read"* —
  not applied a third time. Both of those moved into the package after the harness asked a question
  the app could not answer; the panel never did, so it became the place a claim could go to stop
  being checked.

  `panel-model.ts` is the third application, and `inspector.tsx` maps over it the way `ribbon.tsx`
  maps over `siteControlsIn()`. **Mapped, not agreed with** — a model the panel merely matched would
  have been the forty-fifth prose claim. Three exemptions went stale the moment it landed, which is
  the harness reporting its own escape hatch closing.

  **And it made a question askable.** `every-attribute-is-read` asks whether an attribute reaches the
  drawing; `every-command-can-be-reached` asks whether a command has a control. An attribute nobody
  can change passes **both**: it is read, and `setBlockFormat` — which writes 24 fields — is
  reachable. `every-property-can-be-edited` is the missing question, and its first run said: **64
  attributes drawn, 41 offered.** The 14 it named sorted into three honest kinds — written by every
  row (`overrides`), a durable reference a reader must never type (`id`, `kind`), and Word's
  vocabulary the shared text kit draws on a page with no UI here yet (`caption`, `colspan`,
  `rowspan`, `language`) — plus `componentId`, which is instance-swap, deferred with variants.

  Two things fell out that were not planned:

  - **A declaration is only worth what is checked about it.** `panel-model.test.ts` immediately found
    that one field meant two things: the 값 row's `attr` was `componentValue`, which is a *node type*
    and not an attribute of `instance`. The model now says `writes: 'attr' | 'child'`, which is a
    distinction the schema already makes and the panel was blurring.
  - **Adding a check breaks every product that cannot answer it**, because a check with no subjects
    is a failure here on purpose. `only` is the wrong shape for that — a product listing what it
    *does* run would silently skip the next check added, forever. `notYet` names what is deferred, so
    a new check makes every product either answer it or say out loud that it does not, and a
    deferral that stops being true is reported like a stale exemption.

  **Still open, and named because it is the harness's own shape:** it holds one relationship, schema
  ↔ product, so it cannot see whether what is read is read *correctly* (`clipsContent` was read and
  wrong), nor a vocabulary that is *missing* (`cornerRadius` did not exist, so nothing was absent) —
  and that second one is a perverse incentive worth saying out loud: **a schema that declares less
  passes more easily.** The only counterweight available is that three products share one schema, so
  an asymmetry between them is measurable even when an absence is not. Word's and the deck's panels
  are the next two to become declarations.

- **The harness was not answering a third of its own questions, and said so nowhere.**

  `every-attribute-is-read` renders a node with an attribute absent and again with it set, and calls
  it read if the drawing changed. For an `array` or an `object` there is no value to invent, so it
  answers `null` — "cannot be asked" — and skips. That part is right: guessing produces false
  findings, and a false finding costs a person an afternoon proving the tool wrong.

  The skips were **not counted**. So the number every product reported was the number of questions it
  had answered, printed as though it were the number asked:

  | | examined | unanswered, before | after |
  |---|---:|---:|---:|
  | word | 600 | **125** | 0 |
  | slides | 422 | **29** | 0 |
  | site | 127 | **201** | 0 |

  That is this file's own doctrine failing against itself. The check's header describes the operation
  roster's fourteen stale notes — *"the checks they silenced stayed off for months looking exactly
  like coverage"* — and then does the same thing quietly.

  Two fixes, and the first one shrank the problem more than the second:

  1. **An attribute of a node type the product does not draw is not a blind spot.** `every-node-is-drawn`
     owns that question and the product has already answered it there with a reason — a page has no
     coordinates, so it draws no `rectangle`, and asking whether its `cornerRadius` is read is asking
     about a drawing that does not exist. The site inherits a whole canvas vocabulary it draws none
     of: **201 became 8.**
  2. **A product teaches the probe what its values look like.** The same rule as `env` and as
     everything else here — a `varBinds` is `[{ attr, var }]`, an `overrides` is `{ mobile: { … } }`,
     and only the product knows.

  **What the count was hiding, once it could be asked:**

  - **The site's `overrides` — its entire responsive mechanism — had never been checked**, on any of
    the four node types that carry it. Two things had to be handed over before it could be: the
    breakpoint env (a product hands over what it renders with) *and* an override worth making. The
    first probe overrode a `gap`, which is a stack's word, and reported two findings about a picture
    and a placement that draw no gap — a question about the value rather than about the attribute,
    which is the trap the number probe already documents. `sizing` is the one thing all four draw.
  - **Slides' `fills` and `effects` — the whole paint system — on six shape types each.**
  - Word's `tabs`, read by the tab layout pass into the environment rather than by any renderer.

  **And teaching the harness one thing made it wrong about seven others.** With `fills` in the
  everything-set, `paintsOf` takes the list branch every time and never reaches its flat fallback, so
  `gradientFrom`, `gradientTo`, `gradientAngle`, `gradientKind` and three `shadow*` attributes came
  back unread on six types each — **57 findings, 42 of them false**, about a mechanism that works.
  The rule that fell out: **a taught value answers its own question and stays out of everybody
  else's.** A value the schema could not describe is a whole sub-system in one attribute, and a
  sub-system supersedes the flat attributes it replaces; the `alone` question is what sees a
  superseded attribute, and it only works when the superseding one is absent.

  Everything left is an exemption with a written reason rather than a silence: `varBinds` is read by
  the deck's instance resolver and by nothing in Word or the site; `waypoints` by the connector pass;
  `guides` by the overlay, which is the point of a guide.

- **The data feature was exactly half built, and the finished half was the one you can see.**

  Same sweep, next row: `dataset` offered **one of its six** declared attributes in the panel.
  Following that down found something worse than a panel gap — **no command anywhere in the product
  made a dataset, renamed one, added a column, or wrote a cell.** Every dataset that existed had been
  authored in `sample-site.ts`, in TypeScript.

  So a reader could see the datasets, make a list from one, and filter, sort and limit that list —
  the whole *view*, which is the part that demos — and could not change a price. The half that was
  missing is the half somebody uses every day.

  Six commands at the grain this package already had (`setComponentValue`: one command, one named
  thing, one value), with one deliberate exception. `setDatasetField` does add, rename *and* remove,
  because all three have to keep `records` in step with `fields` and that is **one invariant**: a
  rename that changed the columns and left the rows keyed by the old name is a dataset that looks
  correct in the panel and draws nothing on the page. Three commands would be three places for that
  to go wrong. `removeDataset` refuses while a collection names it, the way `createComponentFrom`
  refuses a block already inside a definition — refusing while it is still a gesture beats letting a
  reader make a document that cannot be drawn.

  **It is a dialog, and that is the interesting UI decision.** Everything else a reader edits here is
  a block, and a block is edited beside the page it is on — rail, drawing, properties. A dataset is
  not on the page: it is a resource the page names, and what it needs is the one thing neither side
  of the shell can give, **width**. A catalogue is five columns by twenty rows and a 280px rail draws
  that as slivers. It also matches what the act *is* — filling a table in is a stint, not an
  adjustment.

  Two smaller things the browser found rather than the tests: the rail listed every dataset **twice**
  once the editor existed — once to edit and once to make a list from — which reads as a bug; one row
  with two controls says it instead, and they are not equally available anyway (making a list needs a
  design chosen first, editing the rows never does). And the dialog title was `${label} 데이터`, which
  is right for `상품 목록` and comes out **새 데이터 데이터** for a dataset just made — and "새 데이터"
  is the name this product gives one, so the doubling was the common case.

  Still not fetched: `kind: 'url'` sets an address and nothing reads it. That is the design `data.ts`
  already writes down — the document keeps the address and the handful of rows a reader designs
  against, and who fetches is a question about the *published* page — and the grid now says so in
  words rather than leaving a reader typing into a box that appears to do nothing.

- **A page's box: rounded, and not a window unless it is asked to be.**

  The sweep, this time pointed at the panel rather than at the renderers: for each node type, which
  of its declared attributes the property panel offers. Filtered to what this product actually
  draws — the canvas vocabulary a page inherits and the harness already exempts is most of the
  noise — **47 of 83**. Two of the gaps were the model's rather than the panel's, which is why they
  are in `box.test.ts` and not only in a browser:

  - **`frameCss` writes `overflow: hidden` unless told otherwise, and a page had no way to tell it.**
    Right on a canvas, where a frame is a stated size and a window onto what it holds. A page's box
    has no stated size, so clipping never shows until something deliberately leaves the box — and
    then it shows by *deleting it*: an image bleeding past its section, a badge on a card's corner, a
    portrait lifted into the band above. Measured on the sample: **nine** stacks clipping on the
    desktop board and no control anywhere. So every overlapping design this builder could have made
    was unreachable, silently, because a clipped element looks exactly like one that was never drawn.
    A page now means *visible* by silence, and `clipsContent: true` still means what it says — which
    makes the control a reader asking for a window rather than a reader escaping a default.
  - **Only a `rectangle` could be rounded.** A card is a frame — it arranges what is in it — and the
    shape that could have a corner radius arranges nothing, so the most ordinary box on a web page
    was undrawable except as a rectangle behind a frame: two nodes for one box, and neither of them
    the one a reader would select. `cornerRadius` is on `frame` in the office schema now and
    `frameCss` reads it, so it is a rounded card in all three products rather than a site feature.

  **The surprise was the third thing, and the export test found it before a human did.** Changing the
  renderer's default broke `says at 390 exactly what the editor draws at 390`: the editor drew
  `overflow: visible` and the published page said `hidden`. `cssFor` was calling `frameCss` and then
  re-implementing the page's defaults itself — it had one of the two, with a comment saying the
  export "has to carry it". So export-as-a-render had grown a second path after all, and the second
  path is not a second implementation of a rule; it is a place for the rule to be *older*. `cssFor`
  calls the renderer's own `stackCss` now, and the check that caught it is the one whose entire job
  is that those two agree.

- **A `var()` is a snapshot, and the third time it bit was the fix for the second.**

  Three instances in one afternoon, all the same fact: **a custom property is substituted where it
  is declared**, so a token written in terms of another freezes that other's value at the element the
  declaration is on, and everything below inherits the frozen copy.

  1. The gallery aliased `--ga-ground: var(--ou-ground)` on `:root`. In a `[data-theme='dark']`
     subtree the shell read `--ou-panel: #171717` and painted itself `#f5f5f5` in the same frame.
  2. So `--ou-accent-soft` was derived instead of stated — a pressed toolbar button should be a wash
     of *whatever accent a product mapped*, and the deck maps seven of the twelve colour tokens with
     that not among them. Derived on `:root` only, it painted `color(srgb 0.86 0.90 0.99)` in the
     dark and at a remapped accent alike: one wash, everywhere, forever.
  3. And `--ou-lift-1/2/3`, added an hour earlier to stop shadows being Tailwind's black, had it
     too — `--ou-shadow` flipped to `rgb(0 0 0 / 0.5)` in the dark and `--ou-lift-2` stayed
     `0 4px 12px rgb(15 23 42 / 0.12)`. Every menu, select and dialog in a dark subtree drew a shadow
     tuned for a white page.

  The rule, and it is mechanical: **a derived token is repeated in every block that redeclares what
  it derives from.** What deriving still buys is that the recipe lives in one place — the repetition
  is a line, not a colour somebody has to pick twice and keep in step. `tokens.test.ts` reads the
  dependency out of the `:root` block and checks each of the other blocks against it; removing one
  `--ou-lift-2` line fails it by name.

  Worth keeping for the next person: **the measurement was the only way to see any of this.** All
  three looked right in the source, all three passed a typecheck, and two of them were written *by
  the person who had just written down the rule they broke*.

- **Two of the three products' browser suites could not be run.**

  `pnpm test:e2e:slide` has been in the root `package.json` for as long as the deck has existed. It
  prints `None of the selected packages has a "test:e2e" script` — and **exits 0** while doing it,
  which is the part that made it survive: a command that fails loudly gets fixed, and one that
  reports success for doing nothing is indistinguishable from a green suite in every log anybody
  reads. Thirty-nine spec files and a `playwright.config.ts` sat behind it. The site app was the
  same, minus even the root script.

  Both are one line each (`"test:e2e": "playwright test"`), and `test:e2e:site` is now beside its
  two siblings. Run after adding: **351 word, 389 slide**, green.

- **A gallery is the only view a component library has of itself.**

  `office-ui` is thirty-six components used across three products, and the only way to look at one
  was to open the product that happened to draw it. So every fault below had been shipped for
  months, in all three products, and none of them was visible one component at a time. One page that
  draws all thirty-six, with a theme switch and a density switch on it, found them in an afternoon:

  | measured | before | after |
  |---|---|---|
  | `transition` in the whole library | **0** | 7 |
  | `focus-visible` | 3 of 36 | 8 |
  | `dark:` variants a product's own theme switch cannot reach | 15 | 0 |
  | components naming Tailwind's palette instead of the token | 4 | 0 |
  | hardcoded z-indexes | 6 | 0 |
  | tooltips legible in the light theme | **0** | all |

  The three that were not merely untidy:

  - **Every tooltip in the suite was white on white.** `bg-[color:var(--ou-panel)]` with
    `text-white`, and `--ou-panel` is `#ffffff`. It read correctly only in the dark, where a `dark:`
    variant swapped the background — so the theme nobody develops in was the only one it worked in.
    Nobody reported it because a tooltip you cannot read looks exactly like a tooltip that did not
    open. The repair is that a tooltip is an *inverted surface*: `--ou-ink` on `--ou-panel` needs no
    variant, because both tokens flip together.
  - **`ColorPalette` threw wherever it was not inside a `Toolbar`** —
    `RovingFocusGroupItem must be used within RovingFocusGroup`, a crashed page, not a mis-drawn
    control. The three products only ever put a palette in a ribbon, so the library had a component
    that could not be used and no way to know. A prop would have made it the caller's job to
    remember; instead `Toolbar` publishes the one fact only it has (`useInToolbar`), and the palette
    takes roving focus where there is a group to rove in and is a plain button where there is not.
  - **The second accent.** Four components painted their pressed state `sky-100` / `sky-950` while
    `--ou-accent` is `blue-600` — so a product that remapped the accent got a toolbar in its colour
    and a *pressed* toolbar in someone else's. The fourth was the best hidden: a checkbox's
    `accent-blue-600`, which is the one CSS property a checkbox actually colours itself with.

  **The surprise is what the instrument found about itself.** The gallery's own density switch was
  dead — it stamped `data-density="compact"` and the token file defines `[data-density='dense']`, so
  half of what the page existed to measure was measuring nothing. And its shell kept a private
  palette (`--ga-ground`, `--ga-ink`, `--ga-line`) with a dark set of its own: with `data-theme` set
  on the document rather than on the shell, the library's tokens flipped and those did not, and the
  page title went white on a white header. The obvious repair — `--ga-ground: var(--ou-ground)` —
  changed nothing, and that is the fact worth keeping: **a custom property is substituted where it
  is declared**, so an alias on `:root` freezes the light value and every element below inherits the
  snapshot. An alias to a themed token is not a reference to it. The rules name the token at the
  point of use instead.

  What keeps it found is `packages/office-ui/test/tokens.test.ts` — nine assertions, five
  milliseconds, no browser: every `var(--ou-*)` a component reads exists; no component names a
  colour of its own; no `dark:` variants; no hardcoded z; the two dark blocks in `tokens.css` declare
  the identical set (they must be written twice — a media query cannot be combined into a selector
  list — and `--ou-accent-soft` and `--ou-shadow` had already been added to one and not the other);
  and the dense block changes only sizes, never the palette. A gallery finds a thing once; a test in
  milliseconds keeps it found.

  Also fixed on the way, all of them things the page made obvious by putting rows side by side: a
  layer row drew `␡` (U+2421) as a literal, which has no glyph in most fonts and came out as a box
  with `DL` in it, next to `●` / `◌` for visibility — all three are in `office-icons` at the right
  stroke weight; a field row read `32 px px` because `Field`'s third column and `NumberField`'s
  suffix are two different things and the page passed both; shadows were Tailwind's black on a
  tinted panel and identically black in the dark, now `--ou-lift-1/2/3` built out of `--ou-shadow`;
  and a dialog's scrim was `bg-black/25`, which separates a dialog from a white page and is very
  nearly nothing over `#0a0a0a` — the one place a modal most needs to be modal.

- **A route belongs to the render — and the reaction was the redraw all along.**

  The plan was to stop the reaction rewriting a line's ends on every edit and freeze them
  only when a shape is deleted: less churn, fewer conflicts on a shared board. The first
  measurement killed the premise. Writing a shape's new position **straight to the store**
  — no reaction, nothing touching the connector — left the line exactly where it was. The
  lines had never been following their shapes because a route was recomputed; they
  followed because the reaction *wrote to the connector node*, and changing a node is what
  makes the view draw it again.

  So the reaction was not remembering where the ends were. It was the redraw mechanism, by
  accident, and it was paying for that with an entry in the history and four numbers of
  document churn on every drag.

  The engine already has the right mechanism, and its own doc comment names this exact
  case: *"the same shape appears wherever geometry decides the result — fitting text to a
  shape, **routing a connector between two boxes**"*. A **layout pass** computes every
  route once per render and merges them into the environment; the renderer prefers the
  pass's answer and works one out itself only where there is no pass (a thumbnail built
  before the deck is loaded).

  What that leaves is a design that says what it means:

  - the **document** holds what a reader decided — which shapes, which magnets, which
    route, the bow, the label;
  - the **render** holds where the line goes, because that is derived;
  - the stored end points mean one thing again — *where an end was* — and are written at
    the two moments they matter: when the line is made, and in the transaction that
    deletes the shape it holds. The second is the only moment the live position can still
    be read, and it puts the freeze in the reader's own undo entry (undo brings the shape
    back **and** the line's hold with it).
  - the reaction keeps the one job neither can do: releasing a hold whose shape went by
    another path — a dangling reference in a loaded document, another product's command, a
    peer's deletion in a shared deck.

  A test had to change with it, and that is the part worth keeping. "Follows the shape when
  it moves" was asserting the stored `endX` — the *mechanism* — and it passed for the wrong
  reason. It measures the drawn path now, and asserts the document is **unchanged**: the
  line moved and nothing was written.

- **Drag out of a shape, let go, and the next shape is there — joined.**

  The gesture a flow chart is *made* of, and the reason connectors matter beyond a deck:
  a flow editor, a FigJam-style board and a scenario editor are all mostly this one
  move. Drag out of a magnet, release on empty canvas, and `insertConnectedShape` makes a
  shape of the **same kind, size and look** as the one it grew out of and joins it —
  because a reader who re-chooses the size and the fill for every step is doing the
  tool's work. The *shape* is selected afterwards, not the line: what they do next is
  type.

  One command rather than two, and the reason is undo: a shape whose line has to be
  undone separately is half a gesture. Which meant the line had to point at a shape whose
  sid does not exist yet — so the command **names the shape itself** (`addChild` honours a
  provided `sid`), the same trick the paste now uses.

  A line with a free end is still reachable, by the gesture that means it: dragging an
  existing end *off* the shape it holds.

- **A reaction must not eat the reader's undo.**

  Found by the test above, and it is the most important thing in this batch. The connector
  reaction runs on every document change and writes the ends whenever a shape has moved —
  so **every drag put two entries in the history**: the reader's move, and the reaction's.
  Undo undid the reaction; the reaction ran again (an undo is a document change) and wrote
  the same numbers back. Measured: undo pressed twice, `historyUndo` reporting success
  both times, and the slide unchanged. *The reader could not undo their own move at all.*

  `TransactionOptions.recordInHistory: false` is the answer, and it is a model-level
  capability rather than a patch: a write that maintains **derived** state is not an edit,
  and nobody should have to undo it. Nothing is lost, because recomputing is what makes it
  safe — the reaction runs after the undo and works the answer out from what the document
  now says. The frame-layout reaction had the same latent fault and takes the same option.

  Worth keeping for what comes next: for a **collaborative** board this is more than
  undo. A reaction that rewrites four numbers on every shape move is four numbers of
  needless traffic and four chances to conflict, on every drag, for every line. The
  cheaper design — freeze an end only at the moment its shape is deleted — is now the
  obvious next step rather than a guess.

- **Two bugs a connector found by being the first thing to walk *up* the tree.**

  Not features. A connector has to put itself and the shape it holds into **one
  coordinate space**, and every placed thing's `x` is its container's — so it asks
  "which container is this shape in?". Nothing had ever asked before; everything else
  in the editor walks *down*. Two faults came out at once, and they had been **cancelling
  each other**.

  **`moveNode` wrote an alias into `parentId`.** A transaction may name a node it is
  about to create (`$alias`), and every *read* in `moveNode` resolved one — the two
  *writes* did not. So a grouped child's back-link was `sl-new-group`: a name that
  existed only inside that transaction. Measured: the line drew to the corner of the
  slide, a group's width from the shape it was attached to. A datastore test had pinned
  this as expected behaviour with a note saying the implementation "has issues with alias
  resolution" — which is worse than the bug, because it makes it look intended.

  **And a group could not be emptied, so ungrouping was impossible.** With `parentId`
  fixed, four grouping tests failed: ungrouping *has to pass through* an empty group —
  the children leave one at a time and the group is removed after the last — and a
  transaction is validated as a whole, so `(scene | frame)+` rejected every ungroup with
  "Content of 'group' ended early". It had never been seen because the alias bug meant
  the children never actually left the group's content. The content model is `*` now and
  the rule lives with the commands that make and unmake groups, where it can be enforced
  without governing the inside of a gesture.

  **Two more, in the connector itself.** A copied diagram's lines pointed at the
  **originals** — copy two shapes and the line joining them, paste, and both lines
  attached to the first set. The clipboard payload now carries its own numbering
  (`copyForPaste`/`pastable`): a sid is `session:counter`, so the same sid exists in
  another deck open in the same session, and remapping by sid would attach the line to
  whatever happens to hold that number. And the paste names the pasted nodes **itself**
  rather than reading the sids back after the commit, so it stays one transaction and one
  undo — `addChild` honours a `sid` a caller provides. `duplicateBoxes` had the same
  fault and takes the same fix.

  **The last of it was mine to fix twice.** The drawing knew about coordinate spaces and
  the *reaction* that remembers where the ends are did not, so a line drawn correctly to
  a shape inside a group **stored** an end at the corner of the slide — and the stored
  end is exactly what a deleted shape leaves behind, so it would only have shown up in
  the one case it exists for. There is now one function that says what a connector's
  route depends on (`connectorInputsOf`), and the drawing, the overlay's handles and the
  reaction all read it.

- **The reference implementation's connector, gone through concept by concept.**

  A gap analysis rather than a feature: every exported symbol of `zero-core-best`'s
  connector against ours. Most of it we already had under another name — `autoSides` is
  `nearestSides`, `axisOf` is `sideTowards`, `connectorGeometry` is `connectorBounds`,
  `midPointOf` is `midHandleOf` — and the storage differs on purpose (they keep the whole
  spec as JSON in one attribute; ours is flat typed attributes, which is what lets the
  schema declare `options` and the harness probe them). **Four things were genuinely
  missing.**

  **Rounded elbow corners.** A hard right angle sits badly against shapes with rounded
  corners, and where two lines cross it is hard to see which goes which way. The radius
  shrinks to half of each adjoining segment, or two corners close together eat into each
  other and meet in a kink that reads as a mistake.

  **The arc — a fourth route, and the one with no magnets.** The control point is placed
  first and each end is clipped *towards it*, so the line points at the shape however the
  shape is turned; on a rotated shape the difference from a curve is obvious. Its bow
  grows with distance, it draws straight within four degrees of an axis (a grid layout
  with faintly bent lines looks untidy rather than organic), and each end stands off the
  border because a cap whose tip is exactly on the edge is drawn into it.

  That turned up a distinction worth having a word for: **the route is what is drawn, the
  track is what is measured**. A curve's control points are not the curve — the straight
  lines between them are the triangle it sits inside — so the label, an end attached at a
  fraction, and the nearest point to a drop all walk the *flattened* curve. Using one
  word for both is how a label ends up beside its own line.

  **A line that flows.** Dashes travelling along it, which says direction while *moving* —
  stronger than an arrowhead standing still, and what a presenter wants when six lines
  are on a slide and they are talking about one path. A solid line is drawn dashed while
  it flows, because a flow is dashes travelling and a solid line has none. The animation
  is CSS, for two reasons worth keeping: the presenting view is a **clone** of this DOM,
  so it flows there with nothing to re-run, and `prefers-reduced-motion` stops it without
  anything having to remember to check. The offset is one **period** of that line's own
  pattern — a fixed distance judders on any line whose weight is not the one it was
  chosen for.

  **The ninth cap: a cross.** "Blocked", "not this way", "no". The one people otherwise
  draw by deleting the arrow, which loses the fact that the relationship exists *and* is
  refused.

- **`null` takes an attribute off a node, for every type.**

  There was no way to do it. A string could pretend with `''`, an array with `null` —
  which *stored* a null rather than removing anything — and a **number** had nothing:
  `0` is a value and the schema refuses `''`, so the transaction was rejected and the
  edit silently did nothing. Found on a connector's `endT`, the fraction along a line
  one of its ends holds: moving that end onto a shape returned false and the reader's
  drag did nothing at all.

  The first fix was a workaround — leave the stale fraction, since it only means
  anything beside a connector — and that was the wrong answer to the right question.
  **The model could not say "not set" about a number**, which is a gap in the model, not
  a fact to design around. `setAttrs` removes the key when it is given `null` or
  `undefined`; `replace` (the inverse's path) stays exact, so a document that arrived
  with a null keeps it through an undo.

  Two things came off the back of it. A blank is not a value: `startNodeId: ''` would
  make every reader learn that an empty string is this product's word for "holds
  nothing", when the schema already has one — the attribute is not there. And the
  connector's `''` conventions are gone, which is the whole reason the workaround was
  visible.

- **A word at each end, and a curve that goes through a placed point.**

  Two attributes (`startLabel`, `endLabel`) for the notation everyone knows: UML's
  multiplicity, `1` here and `0..*` there. Placed a fixed distance in from each end and
  offset to one side — from the direction *there* rather than from the line between the
  ends, or an elbow's two words both come out at 45° — and clamped to a third of the line,
  or on a short line the two of them meet each other and the label already in the middle.
  In the panel rather than on the canvas, because the double-click already means the middle
  label and a second gesture that depended on how near an end the pointer was would be one
  nobody could aim.

  **And the curve bug behind the restriction.** Waypoints had been kept off curves with the
  note "a hand-placed point on one would have to straighten it to obey", which was wrong
  about the reason: a curve's points are *control* points, so a waypoint handed over in that
  list **became** one — the line leaned towards the reader's point and never reached it. Two
  of them drew a polyline, because five points match no branch. `splineThrough` is
  Catmull-Rom converted to cubics, answering **1 + 3n** points — the shape `connectorPath`
  and `flattenCurve` already read — so a curve's points still mean "control points" whatever
  their number.

  Then two grip findings, both from the browser. A curve's segment dots have to sit on the
  **track**: the middle of two control points is not on the line at all. And the bow grip
  must go once a point is placed, because `connectorPoints` ignores `bend` entirely then —
  which also meant a curve with *no* points had no dot at all, since its one span's middle
  is exactly where the bow grip stands. Two dots at a quarter and three quarters, either
  side of it.

- **The label's own type — and the theme colour a line could not take.**

  `labelSize`, `labelColor`, `labelBold`, where there had been a constant: the reference
  implementation's last unbuilt row. Twips for the size like every other length, points in
  the panel, and the size goes into `labelBox` as well as into the type — a pill drawn for
  the old size has the letters hanging out of it, which is what the browser test asserts.

  The find was the neighbour. Writing the label's colour meant resolving `theme:accent2`,
  and a connector's `stroke` was read **raw** — so a line could not use a theme colour at
  all. Re-colouring a deck re-coloured the shapes and left the lines between them behind,
  which is the theme's whole promise ("one edit rather than forty") broken for exactly the
  nodes that join the forty. Fixed by resolving the connector's attributes the way every
  other painted thing in that file already did.

- **Putting a slide *into* a layout — the arrangement, not the inheritance.**

  Asked whether templates could work "like Canva", the answer needed measuring rather than
  guessing. The substrate is **stronger** than Canva's: master → layout → slide inheritance
  and `theme:accent1` references mean re-colouring a deck is already one edit, which Canva
  imitates with per-element styles. What was missing was Canva's *Layouts* gesture — "make
  this page look like that one", with the content a reader already has. `setSlideLayout` said
  which layout a slide **follows** (what its formatting inherits) and moved nothing.

  So `layoutMoves`, and it follows the rule the formatting cascade already had: **matched by
  role, never by position.** Repeating that rule is the point — pairing the slide's third box
  with the layout's third slot moves the wrong one, and does it more often the more a reader
  has edited, which is the worst failure shape there is because it looks like the tool
  rearranging your work at random.

  Two decisions worth the words. **Nothing is added and nothing is deleted**: a box with a
  role the layout does not declare keeps its place, and a slot with no box is left empty
  rather than filled — Canva does fill them, and doing that would let "apply a layout" put a
  box on the slide that nobody typed, which then prints as nothing, shows up in the deck's own
  check, and has to be found and deleted. And it is **one transaction** with the change of
  which layout the slide follows, because a reader pressed one button.

  The harness caught the button before I did, again: `applySlideLayout` was registered,
  tested and reachable by nothing.

  What is left of Canva-likeness: a **gallery** to start a deck from, and `component` /
  `instance` — declared since the canvas nodes were written, made by nothing, and what a
  template is actually made *of*.

- **Showing a deck by scrolling it, and what that does to the motion.**

  A presenter clicks; a reader sent a link scrolls. The design is one sentence — **a scroll
  is a playhead** — and the reason it is worth writing down is that the other two answers
  are both wrong: play a build when its slide arrives and a fast reader sees them all at
  once while a returning one watches them replay; ignore the builds and the author's timing
  is thrown away.

  It needed **nothing new** in the motion model. `showing()` already had four ways to watch
  one slide (presenting, going back, previewing, scrubbing) and a scroll is a fifth that
  answers the same `Showing` with `hold: { kind: 'moment' }` — scrubbing with a different
  input device. So the stage, the hiding rule and the scrubber's off-by-one all came for
  free, and two questions answered themselves: no slide transition (the scroll *is* the
  transition) and no film starts (a reader moving through a deck is not watching a film).

  **Three things were measured, and each looked like the feature not working.**

  A key press moved the offset by one build's worth — which is *less than a slide's reading
  room*, so on a slide with no builds the first press changed nothing on screen. A key that
  appears to do nothing is the worst control there is, so a press now goes to the next
  **stop**: the start of a slide, or a build finished, which is the same picture a press
  gives in a clicked show.

  Then the same fault twice, in two memos: **a memo that reads a value has to name it.** The
  stretches were computed once with every slide at zero presses, because the *document* was
  not in the dependency list — so a build added afterwards changed nothing about the layout.
  And the animations kept the `seekTo` they were built with, because the *scroll* was not in
  the list of the memo that builds them — the offset moved, the model answered a new moment,
  and nothing on screen moved. Both are now asserted in the browser against a real
  animation's `currentTime`: 150px in holds it at 903ms, 300px at 1806ms, and scrolling back
  to 150px holds it at 903ms again rather than replaying.

- **The presenter's screen in a window of its own.**

  A real showing has two screens: the projector shows the slide, the laptop shows the next
  slide and the notes. One window could only *split*, which is what a presenter with one
  display needs and exactly what a presenter with two cannot use — the audience would be
  reading the notes. The presenter view was already built and already read everything out of
  the document; what was missing was somewhere to put it.

  **One truth, drawn twice.** The showing's state is the app's and there is one copy of it,
  so the second window is a `createPortal` into another document rather than a second React
  root with its own copy — and there is no channel, no serialisation and nothing to keep in
  step. Measured, because I did not expect it to work: a **click** inside that window reaches
  the opener's React tree, and so does a key.

  Four things had to be carried across by hand, and three of them were measured:

  - **The styles.** A new window's document has none of the opener's, so both kinds are
    cloned — `<style>` elements in dev, a `<link>` in a build. Without them the presenter
    view draws as unstyled text, which reads as a broken feature rather than a missing link.
  - **The callbacks must not be dependencies.** With `onGo` in the effect's deps, every
    render made new closures, the effect re-ran, and its cleanup **closed the window** — the
    presenter screen opened and vanished in the same frame. A window is opened once, for as
    long as it is asked for.
  - **The keys.** The audience screen's handler is on the *opener's* window, so with a
    second window open the arrow keys went where focus was — here, where nothing was
    listening. Which turned the advance rule into a model function: `advanceShow` was a
    `useCallback` inside the audience screen, right while that was the only place a press
    could arrive from. Two windows made it two rules, so it is one now, with its three cases
    (a build plays before the slide leaves; back un-plays one at a time; a slide entered
    backwards arrives **finished**) tested in milliseconds.
  - **The lifecycle.** The app closes it when the show ends and when the opener goes, and
    the window tells the app when the *reader* closes it — with a flag so the app does not
    hear its own close as the reader's.

- **A hop where two lines cross.**

  A plain crossing is ambiguous — branch, or pass? — and the fix is the schematic
  convention every diagram tool draws. Automatic, with nothing in the document, for the
  same reason the fan is (§8.8): what it prevents is not a look but a picture that reads
  wrongly. Which of the two lines hops is the **layout pass's** decision and could not be
  anywhere else: it is a fact about the *pair*, and a renderer asking "does anything cross
  me?" answers twice and draws two hops at one crossing.

  The three exclusions are where the work was. A crossing **near an end** is two lines
  arriving at the same shape, not a crossing. Lines **running along** each other never pass
  at a point. And a **curve** is left alone, because a hop cut into a Bézier is not one arc
  — better a plain crossing than a wrong one. Then two more from the drawing itself: a
  crossing within a corner's radius of a corner is skipped (the arc and the rounded corner
  would meet in a kink), and the hop is one fixed-radius semicircle bulging to a fixed side,
  because a hop that grew with the run would be a different size at each crossing of the
  same line.

  The part worth keeping: **nothing is written down**, so a hop stops existing when a shape
  moves and the lines no longer cross. No attribute to clear, no undo entry, and a browser
  test that asserts exactly that.

- **Editing a chain: a shape dropped into a line, and a line turned round.**

  Drawing a diagram was covered; *editing* one had two gaps. Dropping a shape on a line now
  splices it into the chain — the gesture every diagram tool answers the same way — with the
  line highlighting while the shape is held from the same answer the release uses, and the
  drop's own move inside the same transaction so it is one press of undo. And a line can be
  turned round, which before meant deleting it and drawing it again.

  **The reverse taught me something by disagreeing with my design.** I swapped the ends
  *and* the caps, reasoning that a half-swapped line is inconsistent. Measured in the
  browser: the arrowhead stayed on the shape it was already on and **nothing visible
  happened** — a cap drawn at a shape looks identical whether it is that line's start or its
  end, so swapping both moves nothing. A cap is notation attached to the *direction*, not to
  the shape; leaving the two attributes alone is what moves the drawn caps. The first
  version also put an arrow at *both* ends, because `endCap`'s schema default is an arrow
  and writing `null` where the other end had no attribute restored it by default — a
  reminder that absence and "none" are different answers when a default is not empty.

  A test-side one: `dash` is `strokeDash`, and naming it wrongly in the list of things a
  splice carries over quietly carried nothing. The test caught it by asking for the value
  back rather than asserting the write succeeded.

- **The derived-state finding, taken through the rest of the product.**

  §8.11 was found on a connector. The sweep afterwards asked where else the same thing is
  true, and measured rather than reasoned: every reaction that writes the document
  (`editor:content.change` listeners that commit), every renderer that reads a node other
  than its own, and every place a reader's gesture lands on state something else owns.

  **Two real faults, both worse than predicted.**

  *A move inside a group could not be undone at all.* Not "took two presses" — three
  presses of `historyUndo` reported success and changed nothing, because each undid the
  group's re-fit and the reaction wrote it straight back. And the obvious fix was also
  wrong: unrecorded, the child came back and the group did not, because the fit is not
  only derived numbers — it **re-origins**, moving the group one way and every child the
  other by the same amount. Undo restored the reader's relative `x` into a coordinate space
  that had since moved. So the engine gained the third answer it was missing:
  `appendToPreviousEntry` puts a write into the entry of the edit that *caused* it, ahead
  of it in the inverse order. It refuses when there is no edit to belong to or when the top
  of the stack is still redoable — and refusing is safe, which is the property that makes it
  usable at all.

  *A drag inside a frame that arranges reported success and did nothing.* The frame owns
  its children's coordinates (§5), so the write was put straight back and the reader's own
  undo entry restored the number the layout had already restored. The comment on `laysOut`
  had said "which decides what a drag means" since it was written; the drag had never been
  told. It means the **order** now — `reorderIndexAt` in the model with its own tests, the
  slot drawn while dragging from the same answer the release uses — and the panel's `X`/`Y`
  are greyed with the command refusing those two keys, because there a number has no other
  meaning to be given. `moveBoxTo` learned to take several shapes, which needed the whole
  final order computed at once: `moveNode` removes before it inserts, so moving `[a, b]` to
  place 2 of `[a, b, c, d]` one at a time gives `[c, a, d, b]`.

  **A finding for later, from the full browser sweep.** A shape dragged so that part of it
  hangs over the slide's edge has its handles on that side **clipped**: the overlay may not
  draw outside the stage, so the handle is in the DOM with a rectangle and
  `elementFromPoint` there answers `.sl-stage`. A reader cannot resize from that side
  without scrolling. PowerPoint gives a slide scratch space around it for exactly this. It
  was found because a test in the existing suite had been asking for the east handle of a
  box nearly as wide as the slide, right after dragging it right — failing on `main`, not on
  anything in this batch — and now asks for a handle it can actually press.

  **And four places that turned out to be right, which is worth writing down.** Word's
  contents page follows a heading being typed in (measured, not assumed). A slide follows
  its theme changing — white to green, blue to magenta — so the master/layout inheritance
  redraws. The frame layout's unrecorded write is correct, because there a child's position
  is derived from nothing the reader writes. And the reactions in `math-commands`,
  `list-commands` and `table-commands` write no document at all: they set context keys,
  which is app state. A survey that finds nothing in four of six places is the survey
  working.

- **One button that tidies a diagram, and the check that caught it before a reader did.**

  A reader draws a flow chart the way they think of it, and after a dozen boxes the
  picture is right and the *placement* is a mess. `layoutGraph` is the layered algorithm
  — rank by longest path, order by barycentre, place and then pull each node onto the
  centre of its children — and every one of the twelve unit tests is a picture that came
  out wrong without one of those passes. The two that were not obvious: a diamond's join
  ranks by its *deepest* parent (by shortest path it sits beside one of them and an edge
  points sideways), and two diagrams that share no edge are laid out **side by side**
  rather than ranked together, or a reader sees two pictures shuffled into each other.

  The interesting half is what the command decides, not what the arithmetic answers.
  Only shapes a line touches move — a title is not part of the diagram, and that is what
  makes the button safe with everything selected. The tidied graph starts at the corner
  the diagram already occupied, because a tidy that also moves the picture is two changes
  wearing one name. It is **one transaction**, which is not a detail: nobody presses a
  button that rearranges everything they drew unless one keystroke undoes it. And the
  hand-placed bends come off the lines it tidied, in that same transaction — a waypoint
  describes a detour around a shape that has moved.

  **The conformance harness caught the button before I did.** `arrangeGraph` was
  registered, unit-tested and working, and `every-command-can-be-reached` failed the
  build: on no toolbar, bound to no key, so a reader could not run it however well it
  worked. That is the whole argument for the harness in one line — the command was
  *finished* by every measure I had, and it was unreachable.

  **"Is it a mode?" — no, and the reason matters.** A live layout would make a shape's
  `x`/`y` derived, and then a reader's drag has nowhere to go: the §8.11 trap, in the one
  place where the document is unambiguously the authority. What that leaves is the *second*
  press, which would take the reader's own arrangement with it — so a **locked** shape is a
  pin: it keeps its place and the diagram is laid out around it. No new attribute, because
  `locked` already means "I have decided where this goes" and already has a command and a
  control.

  My first version *excluded* locked shapes, which quietly took their lines out of the
  graph: one locked box in a chain made the whole diagram untidiable — and I had written a
  test asserting exactly that, as though it were the design. That is the third time in this
  batch that a test pinned my own wrong assumption; it is a faster way to be wrong than
  having no test, and the only guard is that the assertion has to say *why*.

  **And the two gap numbers were picked, which is half an answer.** Asked where they came
  from, the honest reply was "I chose 1440 and 360" — so now the floor is `dot`'s own
  `ranksep`/`nodesep` (there is no reason to invent proportions that thirty years of
  diagrams have been read at) and above that the rank gap is **measured**: a label pill
  sits on the middle of the line between two ranks, and a gap that does not hold it draws
  the reader's word over the shape below. Which of the pill's two sizes matters depends on
  the direction, which is invisible on `A` and unmissable on a Korean sentence. The
  arrowhead it also has to clear is asked of the model — `capSizeOf`, extracted from the
  renderer, because `max(180, width * 4)` written twice is the restatement this repository
  keeps finding.

  A smaller one: the icon key `tidy-right` reuses the picture `connect` already uses,
  deliberately. Joining shapes and tidying what they make are the two halves of drawing a
  diagram; a second near-identical glyph would be a distinction without a difference. And
  the duplicate `import` that came of adding it did not break the *build* — vite's
  pre-transform failed at run time and every browser test in the file failed at
  `openDeck`, which is a reminder that a green `vite build` is not a loaded page.

- **A bend the reader places, and two gestures that wanted the same pixel.**

  Waypoints — the points a reader tells a line to go through — are the one part of a
  route that is *not* derived (§8.12): there is nothing to work a hand-placed bend out
  from, and a reader who has routed a line around a table they mean to move later means
  that route to stay. So they are stored, the route is still derived from them, and a
  placed point **stops the router avoiding obstacles**: they have said where the line
  goes.

  Three things the browser found that the arithmetic could not.

  **A new point's place is not a segment count.** An elbow turns one waypoint into two
  route points, so the third segment is not the third bend. It comes from how far along
  the *track* the drop was (`nearestOnPath`) — the measured line rather than the drawn
  one, which is the distinction §8.5 already needed.

  **A drag and a double-click on one dot.** `preventDefault()` on `pointerdown`
  suppresses the compatibility mouse events, and a pointer capture retargets the click
  at the capturing element; together they sent the double-click to the overlay, which
  opened the *label* editor instead of taking the bend away. The gradient's axis had
  already found half of this and the finding did not travel. The other half is new and
  better: a press that does not travel now writes nothing at all — a click has no
  business in the history, and the commit was replacing the handle's element, so the
  second click landed on a new one and never became a double-click.

  **The bow grip and the segment dot both bend an elbow's middle run**, and whichever is
  drawn last takes the press. I took the bow grip off elbows to make room, and that made
  a *fan* impossible to undo by hand — the one thing the grip is needed for (§8.8). Both
  stay: the segment dot that would land on the grip is skipped, and whether a route has
  a draggable bow at all is now the model's answer (`canBendByDrag`) rather than a
  condition the overlay repeats. It has to agree with `bendFromDrag`, so a unit test
  asserts exactly that — a grip that appears where a drag answers "unchanged" is a
  handle that moves and does nothing.

- **A line's own gestures: fanning, the bend grip, and the label on the line.**

  Three things that only turn up when the connector is used rather than described.

  **Two lines between the same pair no longer hide each other.** Routed identically,
  they are drawn one on top of the other — the reader sees one line, cannot tell there
  are two, and cannot select the one underneath. A broken state rather than a styling
  choice, so the *drawing* fans them (`(index - (count - 1) / 2) * step`, document
  order) and the document says nothing. The reference implementation leaves this to the
  reader's `bend`; automatic is right because the state it prevents is not a look, it is
  a line nobody can reach. A `bend` the reader set still wins.

  **A grip in the middle bends it.** On the part of the route a bow actually moves — an
  elbow's middle segment, a curve's own midpoint, which for a cubic is
  `(p0 + 3c₁ + 3c₂ + p3) / 8` rather than halfway between the ends. A drag is projected
  onto the one axis that can change (the rest is dropped, not invented) and **added** to
  the bow already there — without that, grabbing the second of two fanned lines snapped
  it onto the first before it moved. And there is no grip on an elbow with a single
  corner, because that corner is where its two sides meet and a drag would mean nothing.

  **The label is typed on the line.** Double-click, the same gesture as everything else
  on this canvas: the first click says which thing, the second says "work on what is in
  it". Naming a relationship in a side panel means looking away from the diagram.

  The test caught two of my own wrong assumptions, both about *which axis*: a bow slides
  an east-west elbow **sideways**, not up; and the largest x in a right-to-left route is
  its own start, so a max hides the whole change. Neither was a bug in the code.

- **The connector, finished: the gesture, the routing, the branch and the label.**

  Four things the spec listed as next, done in order, and each one turned something up.

  **Pulling a line out of a shape.** A selected shape shows its magnets and a line comes
  out of one; either end of a selected line can be moved onto another shape, or dropped
  in empty space to be attached later. Two collisions found by tests, both the same
  fault: *two gestures must not share a pixel*. A side's magnet is exactly where that
  side's **resize handle** is, so the handle took every press — the dots sit outside the
  edge now, which is also where Canva puts them. And a selected connector was drawing
  eight resize handles that swallowed the presses aimed at its ends — a connector has no
  box to resize (§8.1), so it gets none.

  **Routing around what is in the way.** An elbow goes around, a straight line moves to
  another magnet (never one the reader chose), a curve bows further. Three rules make it
  behave: touching obstacles are one **clump** (candidates are built around a box, so two
  boxes side by side make every candidate land in the other — what looks like a maze is
  almost always a clump); the choice is **clean and shortest**, not "fewer crossings" (a
  crossing count depends on how many segments a route has); and if nothing is clean the
  **direct line stands**, because a reader can follow a line that crosses a box and
  cannot follow one that wanders. That last rule showed up immediately in a browser test:
  on the sample slide the route never changed, because the title and body placeholders
  are shapes too and nothing can avoid them. Measured with a probe on the renderer —
  three obstacles seen, line still straight — which is the difference between a bug and a
  rule.

  **A branch off the middle of a flow.** An end can hold another *line*, at a fraction of
  its **length** — a line has no sides to be a magnet of, and the halfway of an elbow
  whose first leg is twice its second is on that leg rather than at the corner. The
  arithmetic is handed a *point*: resolving a held line means routing it, which means
  knowing what it holds, so the document walk and the cycle it must refuse belong to the
  caller. `connectorRouteOf` is that one answer, and the renderer, the overlay and the
  gesture all go through it.

  **A word on the line.** The pill behind it is **estimated** from the characters, not
  measured: the label is in the same SVG as the route so it travels with the line for
  free, and SVG cannot measure text before it draws it. A CJK character is about as wide
  as the type is tall and a Latin one a little over half — the other way round makes a
  Korean label hang out of its own pill.

  **Two surprises worth keeping.** A number attribute has nothing to be *cleared* to:
  `endT: null` became `''`, the schema refused it, and `setConnector` returned false —
  so an end moved off a line went nowhere at all. It needs no clearing, because a
  fraction only means anything beside a `nodeId` that names a connector. And the label
  needed a **text field**, which `office-ui` had none of and three callers were waiting
  for; extracting it showed the three did not want the same control — a *name* is
  committed (a keystroke per history entry is not an edit log anybody wants) and a
  *search box* is live (its count answers the query as it grows). `TextField` does both,
  and the deck's find bar came off the raw-control ratchet.

  110 unit tests on the arithmetic, 10 in a browser.

- **A line that remembers what it joins.**

  A `line` remembers a place; a **connector** remembers the pair, so moving either
  shape moves the line. That is the whole feature: a flowchart, an org chart or an
  architecture diagram is mostly the work of re-drawing lines after moving a box, and
  it disappears. `connector` had been declared in the office schema, named in the
  shared vocabulary and exempted in the conformance report as *"a board arrow between
  two nodes; a deck has no arrows yet"* — that exemption is deleted, which is the
  harness doing its job.

  The research is written down as **`docs/specs/canvas-model.md` §8**, decision by
  decision, because every one of them was reachable two ways. The four that matter:

  - **It stores no box.** `CANVAS_GEOMETRY_ATTRS` declares `width` as *required* and a
    connector cannot honestly have one — its extent is whatever the two shapes make.
    The alternative was to store the computed bounds and chase them with a reaction,
    which is right for a laid-out frame (a child *is* a box a reader drags) and wrong
    here: nobody drags a connector's box, so a stored copy is a second source of truth.
    So the schema grew `CANVAS_PRESENCE_ATTRS` — `visible`, `locked`, `opacity`, the
    three a connector does have — and every consumer derives the rest.
  - **Both ends keep coordinates anyway.** When the shape an end holds is deleted, the
    attachment is dropped and the line stays where it last was. A line that vanished
    with the shape would take the relationship out of the picture *silently*, and a
    reader cannot see what is missing.
  - **A straight connector uses only the centre magnet.** Drawn to a side's midpoint
    it cuts visibly through its own shape as soon as the two boxes are offset — so a
    straight line joins the centres and is clipped where it leaves each **outline**,
    ellipse on the ellipse. Figma draws the same distinction; the reason is geometry.
  - **Nine end shapes, because they mean things.** A flow is an arrow, an association a
    dot, UML's inheritance and composition a hollow triangle and a diamond. Ship one
    and readers stack shapes on the line's end to fake the rest — and the fake drifts
    every time the line moves, which is the thing a connector exists to prevent.

  **50 unit tests, 4 in a browser**, and the split is the usual one: every piece of the
  arithmetic draws a *plausible* wrong picture, so all of it is milliseconds — where a
  line leaves a rotated square, which pair of magnets is nearest (and why the nearest
  pair is not the angle between the centres), why a curve's handle is measured along
  its normal rather than between the ends. What only the browser could say is that two
  shapes can be joined, that the line **follows** a drag, and that deleting a shape
  leaves the line behind.

  **The surprise, and it is a good one.** `deleteBoxes` reported success, the shape was
  gone from the slide — and `store.getNode(sid)` still returned it. A deleted node is
  taken out of its parent's content and stays addressable by its sid, so the connector
  asked "does this shape exist", was told yes, and never let go. *Existence in the
  store is not presence in the document*: a node in the document has a parent, and the
  root is the only one that does not. Anything else that asks a store whether something
  was deleted has the same trap waiting for it.

  Deferred, with the reasons in §8.5: routing **around** the shapes in between, an end
  attached to another connector (a flowchart's branch off the middle of a flow), and a
  word on the line. Dragging an end from one shape to another is the same `setConnector`
  command and is the next piece of work — today the two shapes are chosen by selecting
  them, which is one of the two gestures every diagram tool offers.

- **A film's sound is drawn, and the trim is dragged onto it.**

  Trimming was two number fields in seconds and a reader typed them **blind**: nobody
  knows where eight seconds of dead air end without playing the clip and watching a
  clock. Now the sound is a strip in the 필름 group, the kept part bright and the
  trimmed part dim, with a handle at each end.

  **The reduction is the feature, and it is arithmetic.** A minute of audio is 2.6
  million samples and the strip is two hundred pixels: the drawing is one peak per
  pixel and everything else is a decision about which sample wins. Each of those is a
  way to draw a *plausible* wrong picture, so each is a test in `office-ui`'s
  `waveform.test.ts` — eighteen of them, milliseconds:

  - **Peak, not mean.** A bucket of silence with one click in it: a mean draws nothing
    at all, and the click is the one thing a reader is looking for.
  - **Normalised, with a floor.** A quiet recording is a flat line at its true scale
    and a reader hunting a gap is looking at *relative* loudness — but a silent clip
    has no loudest sample, and dividing by it makes noise out of nothing.
  - **The louder channel, not a mix-down.** Summing two channels and halving cancels
    anything panned hard the other way: a voice on the left would draw as the room.
  - **Silence is a line, not a gap.** A bar of zero height reads as *no data*, which is
    exactly the thing being hunted for. One pixel is the floor.

  **Three things only the browser could say**, and they are the browser test: the file
  decodes, the strip has the shape of the file (a tone in the middle quarter, flat at
  the ends — a test that only counted bars would pass on the wrong file), and a handle
  dragged across it writes the moment it was dropped on.

  **`0` still means "to the end".** A handle dropped on the right edge writes zero
  rather than the film's length, because a length written into the document is a
  measurement, and it is wrong the moment the file changes. That knowledge stays in
  the deck: the strip is in fractions and knows nothing about milliseconds.

  **Where it lives, and one accessibility fault it found.** The arithmetic and the
  strip are `office-ui`'s — a sound's shape is not a fact about decks, and a document
  editor with a voice note wants the same picture — and the decode is a hook there too,
  cached by source, because a panel re-decoding a minute of audio on every render is a
  panel that stutters. The failure path is silent on purpose: a codec the browser
  refuses leaves the strip absent and the number fields exactly as they were.

  The fault: the handle and the number field were both called 시작점, so a screen
  reader announced the same name twice and a test could not tell them apart. The
  handles are verbs now — 시작점 옮기기 — which is what a **test that could not find
  its own control** was really reporting.

- **The deck checks itself before it is given to anybody.**

  A deck's problems are invisible while it is being made. Alt text does not appear on
  screen. A shape five pixels off the slide is not clipped in the editor — a canvas
  draws outside itself — and is clipped by the projector. Whether 11pt reads from the
  back of a room is a thing you find out in the room. Nobody re-reads twenty slides
  by eye looking for these, so nobody finds them.

  Six kinds: **alt text**, **text too small**, **shapes off the slide**, **contrast**,
  **empty slides**, and **text over a photograph**. 25 unit tests, milliseconds.

  **The model only, and the cost written down.** No DOM — which is what lets it sweep
  every slide at once, including the hidden ones, and keeps an answer from depending
  on the zoom or a font that has not loaded. What that costs is stated rather than
  worked around: text overflowing its box is not measured (that is the font's answer
  and there is no font here), and neither is the contrast of text over a *photograph*
  (the photo's pixels are not in the model). Both are reported as **things to look
  at** instead of things to fix.

  Four decisions, three of them adopted from `zero-core-best`'s own notes:

  - **Two levels and no more.** `must` for what is certainly wrong, `check` for what
    a person has to look at. Three grades and a reader spends the time reading
    grades, then only looks at the red ones — which is one grade with extra steps.
  - **Two thresholds for small text**, because one does not work. A 12pt footnote is
    2.2% of a 16:9 slide's height and a 24pt body is 4.4%, so a single 3% line puts
    every label and caption on the wrong side of it: *if everything is red, nothing
    is red.*
  - **A fraction of the slide, not a number of points.** The same 14pt is small on a
    16:9 slide and enormous on a square one made for a phone.
  - **Nothing rather than a guess.** A contrast ratio needs numbers, and a document's
    colour may be an `rgb()`, a named colour or a `color-mix()`. The parser reads the
    two hex notations and answers *nothing* for the rest — including a hex with
    alpha, because a colour with alpha is a colour over something, and what it is
    over is the question being asked.

  **Two things the writing turned up.** A run's colour is a **mark**, not character
  formatting — `resolveDeckFormat` answers about the size and says nothing about the
  colour, so the first version of the contrast check never fired and 25 tests passed
  around it. And the two checks that both walk a shape's text now share one walk,
  because walking it twice is two chances to disagree about which runs count.

  And it found something real on the first run against our own sample deck: **slide
  4's body text is 16pt**, which is 2.96% of the slide's height — just under the line,
  reported as a look rather than a fix, which is exactly the band the second threshold
  exists for.

- **A colour can be animated, and the mechanism was already there.**

  The last row of `zero-core-best`'s track table that we could reach, and their guide
  is where the difficulty is written down: *a registered custom property always
  carries its initial value, so `var(--x, fallback)` never reaches the fallback.* A
  length's neutral is 0 and an angle's is 0deg — the same for every shape. A colour
  has no such value: a shape's fill is whatever the document says.

  Their answer is for the renderer to *plant* the current colour on the element and
  have the CSS read only the variable. Ours needed no new mechanism at all: a shape
  **already declares its own neutrals**, to stop the tracks inheriting into the
  shapes inside it (`fillBoxCss`). A colour is that same declaration with a value
  that is not the same for everyone — one field on the track (`own: 'color'`) says
  which of the item's fields to read it from.

  **Two measurements decided the design.** The obvious version returned to `inherit`
  at offsets 0 and 1, and that reads the *parent's* value rather than this element's
  declaration — so a shape whose parent declares nothing inherits the registration's
  `initial-value` and the emphasis started from `rgba(255, 0, 0, 0.004)`, an
  interpolation out of transparent. What works is **one keyframe, in the middle**: an
  animation with no start and no end takes the underlying value for both, so it goes
  from the document's colour, through the reader's, and back — and the effect never
  learns what the document's colour is.

  It also costs the commonest shape on a slide one extra declaration. A single opaque
  solid is still the box's own `background`, and it now reads
  `var(--sl-f0-color)` with the colour declared beside it — because a fill-colour
  motion that only worked on shapes with a stack of two would be a motion nobody
  could find.

  **The test shape from the previous item paid for itself three times.** Adding the
  track: the generic "something the product draws writes it" failed, because the
  fixtures had a gradient, a picture and a shadow but no *solid*. Adding `recolor`:
  the generic "animates something" rule (written as `> 1` frames) reported a
  deliberately one-frame effect as broken — the rule now says what it meant. And a
  **new** generic check, written after `fillStop` shipped with its renderer reading a
  variable that `TRACKS_OF` never declared: *every track a fill's CSS reads is a
  track the shape declares.* Without that entry the drawing was right and the
  containment was gone — a build on a frame would have slid the gradients of every
  shape inside it, silently, in the one case nobody tests.

  One test-only casualty worth writing down: **jsdom does not resolve custom
  properties**, so a render test that read a computed `background` now reads the
  `var()` untouched. It asserts the declaration instead, and the resolved colour is
  checked where a browser is — `theme.spec.ts` still reads `rgb(37, 99, 235)` off the
  computed style.

- **One more motion track — and a test shape that found four defects.**

  The third thing from `zero-core-best`'s list, and the first two thirds of it were
  **already done by a cheaper mechanism**. Their table has eight property tracks;
  ours had the equivalent of five, and the three that looked missing — corner
  radius, blur, backdrop blur — needed no track at all: they are in `MUST_ADD`, so
  the Web Animations API's own additive composition already means "however much more
  than the document drew". Tracks for two of them were written, wired into the
  renderers, and deleted. `TrackPart` now says what a track is *for*: a value the
  CSS property cannot express additively.

  The one genuinely missing row was **the gradient's stops** (`fillStop`), with the
  `shine` effect over it: every stop moves by the same amount, so the band of colour
  travels and the shape the designer gave it is kept.

  **And on the way, a cost-table row was added and taken back out.** `borderRadius`
  seemed to belong in tier 2 — "a rounded corner is a clip, so the shape repaints" —
  and the spec's *tier 1* list has `clip-path` in it, which is the same argument for
  the opposite answer. That table's own rule is that an unnamed property is treated
  as cheap **and the spec is where the argument happens**; adding a row on the
  strength of a comment was deciding it in the wrong file.

  ## The part worth keeping: two table-driven test blocks

  Adding `fillStop` passed 688 tests while **nothing in the product read it** — the
  track was declared, registered as a `@property`, offered by the table, and no CSS
  mentioned its name. This repository's signature fault, produced by the file whose
  own comment warns about it. So the tests were rewritten to loop the tables instead
  of naming rows:

  - **Every track**: its neutral parses as its syntax; it is in the cost table under
    the name a frame actually uses; and **something the product draws writes it**.
  - **Every effect**: it animates something (frames *or* an SVG filter); every
    custom property it names is a real track; the tracks it writes belong to the part
    it declares; `propertiesOf` reports every key its frames carry; and **an emphasis
    comes back to where it started**.

  The last one found **four defects in one run**, all the same shape — an amount
  range that does not land on a returning value:

  | | ended at | left the shape |
  |---|---|---|
  | `spin` | 450° | turned 90°, then snapping back |
  | `hueShift` | 225° | every colour shifted — and its own comment said "a full turn and back… 360° is the same colour as 0°" |
  | `sweep` | 225° | gradient turned |
  | `frost` | blurred | the slide behind it frosted, under a section titled "out and back" |

  Three of the four had a comment describing the behaviour they did not have. The
  four are turns now (`amount` counts them, so every value returns), and `frost` goes
  out and back — which also made a preset's comment obsolete in the right direction:
  `turnOnce` was `0.334` with a paragraph explaining that a whole turn was an awkward
  third of the range, and it is `0` now.

  Four effects genuinely *are* one way — `drift`, the two halves of the Ken Burns,
  and a fill cross-fade — and they say so with `oneWay`, **checked in both
  directions**: an effect claiming it and then returning fails on the claim. Which is
  the rule the conformance harness applies to its own exemptions, applied here
  because a comment cannot be told from an oversight by anything that checks.

- **The deck can be searched, and replaced through.**

  The second thing brought over from `zero-core-best`. Changing an old product name
  in a hundred-slide deck cannot be done by hand: turning the pages and reading each
  one, two or three get missed every time — and unlike a document there is no
  scrollbar to run an eye down, so a match on slide 61 is invisible until you are on
  slide 61.

  **Almost none of it is new code.** Word's `findMatches` already answers "where in
  this tree", and `DeckAccess` and `DocumentAccess` are the same shape — a `getNode`
  and a root — so scoping a search to one slide is *handing it a different root*.
  Nothing in Word's function had to change for a deck to use it. What a deck adds is
  the question Word's cannot answer: **which slide**, because the next match is a
  different slide rather than a scroll.

  Three decisions, two of them adopted from `zero-core-best`'s own notes:

  - **Not the resources.** Searching from the deck's root would be wrong in two
    directions at once: Word's walk skips `resources`, so every **speaker note**
    would be invisible — and it would skip a layout's placeholder text only by
    luck, when offering to replace inside a layout is offering to break every slide
    that follows it from a search box. So it is a walk over the slides, plus each
    slide's note.
  - **A match is inside one run.** Runs split where formatting changes, so a word
    with its first half bold is not found. Joining a paragraph's runs to search them
    would mean splitting them again to replace — and *we* would be deciding which
    side's formatting the replacement keeps. Written down as a limit rather than
    worked around, which is what their guide does too.
  - **Replace all, slide by slide.** One transaction per slide: undoing "all" in a
    sixty-slide deck as a single step is not an undo anybody wants.

  `boxOfMatch` is the small piece worth naming: a match's own sid is the **run of
  text** it was found in, three levels below anything a reader has a name for, so a
  slide with nine text boxes on it could not say which. It walks up to the nearest
  thing the canvas placed — and answers nothing for a note, where there is no shape
  and the count has already said 노트.

  **And this is where the new verification protocol started.** Model first (14 tests,
  milliseconds — including the two a deck gets wrong by accident), then only the new
  spec and the two things the change touches. The whole browser suite was taking 6.5
  minutes a round, most of it re-running specs the change could not reach.

- **The slide has a layer list.**

  The first thing brought over from `zero-core-best`, whose slide editor has one at
  1,387 lines. Two things a canvas cannot answer, and every design tool answers
  both with this control: **picking what is underneath** something — on the canvas
  it is reached by luck, click through it or move the thing on top away and put it
  back — and **where in the stack** a thing goes, which the deck's four order
  buttons answer four ways when the answer is a *position*.

  The rows are a model (`layerRows`, 17 tests, milliseconds): what is on the slide,
  what each is called, which is hidden or locked, which has motion, how deep inside
  a group. Front at the top, because document order is paint order — a list running
  the other way would be correct about the model and wrong about the reader.

  **Three things it found.**

  `visible` was `locked` all over again: **declared in the shared schema, read by
  the renderers of both products** (`isVisible` → `display: none`), and settable by
  nothing. The attribute worked and no reader could reach it.

  And it did not even work, for half the drawings. `placed()` spreads a renderer's
  own styles *after* the placement, so a renderer that sets its own `display` — the
  text frame is `flex`, so is a frame — **overwrote the `display: none` that
  `visible: false` had just produced**. Measured: the attribute written, the node
  saying `visible: false`, the shape still on the slide. Not drawn is not a style
  choice, so it is applied last now and none of the twelve renderers had to change.

  `childrenOf` was written **seven times** in `office-slides` — and the seventh was
  different: `motion.ts`'s copy had no filter, so it treated anything in a
  `content` array as a sid. Nothing had gone wrong yet, which is what seven copies
  of a predicate is for.

  **And it needed a new harness check.** The rows are named from a table, and a
  table is what this harness distrusts: `every-drawing-can-be-named` asks the
  product for a word for every node type a *canvas* can hold, and a product with a
  fallback has to return nothing for the types it does not really know — a fallback
  makes a missing name look like a name. Its first run found `connector`,
  `component` and `instance`, all declared and all coming out as the same word as
  everything else the table did not know.

  Two things about writing that check are worth keeping. It first asked about every
  *placeable* type and produced **thirty** findings — paragraphs, table cells, the
  document itself — and thirty exemptions would have been thirty notes; the set is
  derived from the schema instead (the `scene` group, plus what a scene container's
  content says it holds, which is how `frame` is included and how a `textFrame`'s
  paragraphs are not). And Word had to *adopt* it: a check examining nothing is a
  failure in this harness, so Word's conformance test now supplies the names too —
  it draws shapes on a canvas and had no word for any of them.

  Which put the shared names in `office-controls` (`CANVAS_NAMES`) rather than in
  each product, before the second copy existed. A deck adds `mediaVideo` and
  `mediaAudio`; nothing else in the suite puts a film on a page.

  The raw-control ratchet objected, correctly, and the entry it gained names the
  next shared component: `office-ui` has **no icon button**, and one now has three
  callers — this list's toggles, the filmstrip's row, and the close on every pane
  in both products.

- **The theme's own colours can be typed in.**

  The one thing every real deck starts with — the company's own accent — was the
  one thing that could not be set. A deck could be *given* a designed theme and a
  shape could *reference* a slot (`theme:accent1`, offered as swatches in every
  colour field); the slots themselves were whatever the preset said.

  **The command was already able to do it.** `setDeckTheme` merges any subset of
  the twelve into the deck's theme and makes one if there is none, which it had
  done since the theme existed. What was missing was somewhere to type — so this is
  a dialog, fourteen rows, and two model functions.

  The two are where the interesting part is:

  - **`themeNow`** fills the gaps from the first preset. A theme node carries
    whichever slots have been written, so a deck may name a theme and have four of
    its twelve colours. Every reader of a *single* slot is fine with that —
    `resolveThemeValue` answers nothing and the caller draws nothing rather than
    black. A reader that wants to *edit* is not: a colour field with nothing in it
    cannot be nudged, and four blanks in a row of twelve read as a broken panel.
  - **`themeMatching`** answers which preset the theme *is*, from its values rather
    than its stored name — and that fixed a latent lie. The theme row read the
    `name` attribute, so a deck whose accent had been changed to the company's red
    went on calling itself "Office", and a reader who cannot see that they have a
    theme of their own cannot see why the list will not put the old one back.

  **And the control put the lie straight back.** With no match the row's value was
  `''`, and a `<select>` whose value is none of its options shows the *first* one —
  so "nothing chosen" rendered as "Office" again. `CUSTOM_THEME` (`사용자 지정`) is
  offered while it is the answer and gone once a preset is picked, which is also
  the truer thing to say to a reader than a blank.

  Two smaller decisions: applied on 적용 rather than as it is typed, because a
  theme re-colours every shape that follows the deck and twelve fields typed one at
  a time would be twelve re-colourings and twelve entries of history — which is
  also what makes 취소 mean something. And the preset list is *inside* the dialog
  as well as in the panel, so a reader who has changed three things has one way
  back.

  Two guards objected on the way, both usefully. `every-command-can-be-reached` was
  satisfied already (the row existed); the **raw-control ratchet** was not, and its
  finding was a *comment* of mine containing the word `<select>` — it reads the file
  as text. Left that way on purpose, with the reason written down: a
  comment-stripper safe enough for this would have to tell a string from a comment
  (`'http://…'` begins with two slashes), and a check that silently mis-parses is
  worse than one that occasionally objects to a sentence.

- **A reader can place a guide.**

  The last item on the chrome audit that PowerPoint, Keynote and Figma all have:
  the deck drew snap lines while a shape was dragged and there was **nothing to
  measure against and nothing a reader could place**. Found guides answer "is this
  aligned with that"; a placed guide answers "is this where I decided things go",
  which is a question asked across a whole deck.

  **The snapping needed no change at all.** A `Guide` is `{ axis, at }` and
  `snapBox` takes a list, so a placed guide is one more item in it — the machinery
  was general before there was anything general to put through it. What the work
  actually was: where they live, and the four rules that make a list of them behave
  (rounded, dropped-if-not-a-guide, de-duplicated, and ordered so a drag can hold
  onto one). 19 unit tests, milliseconds.

  Four decisions worth keeping:

  - **On the slide, not the deck.** A reader places a guide to line up the things
    on *this* slide, and a deck-wide one would follow them onto slides where it
    means nothing. It is what PowerPoint does; the cost is placing it again on the
    next slide, which every tool that does it this way pays.
  - **A tie goes to the reader.** `snapBox` keeps the *first* of two equally close
    candidates, so putting the placed guides first is what decides a draw between
    a placed guide and a found one. Checked by identity in the test, because the
    two are structurally identical and comparing values could not tell which line
    the drag reported — and which one it reports is what gets drawn.
  - **One command, not three.** A drag out of the ruler *is* add, move and remove
    in sequence, so three commands would make one gesture three kinds of history
    entry and undo would walk back through the drag.
  - **The guide in flight is the app's.** The gesture starts in the stage (the
    rulers are there) and has to be drawn over the slide (the overlay is there).
    Neither child can see the other, and a ruler cannot draw its own preview
    because it is a strip along one edge.

  **And it found a real fault the moment the ruler became clickable.** The fit
  never subtracted the rulers: the slide was fitted to the whole pane, the ruler's
  18px column was added beside it, and the grid overflowed by exactly one ruler.
  `justify-content: center` centres tracks that overflow, so the whole grid sat 9px
  to the left — putting the right half of the *vertical* ruler underneath the
  slide's overlay, where no pointer could reach it. Measured: ruler at 240–258,
  slide starting at 249. Invisible while a ruler was only something to look at.

  The harness caught the last step, exactly as designed: `setSlideGuides` is on no
  toolbar control and bound to no key, so `every-command-can-be-reached` refused
  the product until the third way a reader reaches it — a drag on the ruler — was
  written down as an exemption.

- **Ctrl+wheel zoom: both products had it, and the better copy won.**

  The entry above this list said Slides did not have this gesture. That was wrong —
  a grep that looked for `ctrlKey` and `wheel` on the same line — and the truth was
  more useful: **both** had it, neither knew the other did, and they were not the
  same implementation. The deck's carried three measured corrections that Word's
  never had, because Word's never anchored at all.

  - **Hit-test the rectangle; do not ask what the event hit.** Word scoped its
    listener with `closest('.w-shell-document')`. A canvas draws its selection
    overlay as a fixed layer *above* the pane, so a wheel over the slide never
    reached a listener on the pane — measured, the count of events seen was zero.
  - **Anchor on the drawn content, not the scaled container.** A deck's container
    holds the hidden definitions and the gaps between slides, so its rectangle
    grows by more than the slide does: 0.8% of the slide's width per notch.
  - **Correct in a layout effect, not `requestAnimationFrame`.** rAF races React's
    commit, so the rectangle measured is the old one: 0.8% a notch again.

  `useWheelZoom` in `office-ui` is that version, with `anchorOf`/`anchorShift` and
  their tests moved out of `office-slides` — nothing about them was ever a slide's.
  **Word gained pointer anchoring** by asking for it: zooming in on a paragraph
  half way down the page no longer walks that paragraph off the screen.

  Three things this cost, each worth keeping:

  **The extraction put the drift back, and a test caught it in the same minute.**
  `content` is naturally written as an inline arrow, so it is a new function every
  render; with it in the layout effect's dependencies the effect ran on *every*
  render, and any render between the wheel and the zoom's commit consumed the
  pending correction against a rectangle that had not changed. Measured: 7% drift
  over four notches with the scroll never leaving zero. The hand-written version's
  `[scale]` was load-bearing. Neither product had a test for this gesture before —
  in either app — so the test was written first, and it earned its keep before it
  was green.

  **A test can aim at nothing and read like a broken listener.** Word's `.w-surface`
  is every page stacked — measured 7,536px tall against a 900px window — so 35% of
  it is 2,800px down the page and the pointer lands on no element at all. Zero
  wheel events reached the window, which looks exactly like a listener that was
  never attached.

  **And Word's transform was one frame late.** `ZoomFrame` wrote
  `el.style.transform` in a `useEffect`, so the box's width came from the render
  and the scale inside it arrived after — and anything measuring the page from a
  *layout* effect read the untransformed rectangle. The anchoring computed a shift
  of exactly zero and reported success. Written in the render instead, the
  transform is in the DOM at commit, which is before every effect in every subtree.
  A `useEffect` that writes a style the same render's layout depends on is a frame
  of disagreement nobody sees until something measures it.

- **The window's frame is five named regions.**

  `AppShell` / `AppChrome` / `AppBody` / `AppMain` in `office-ui`, and both apps
  are drawn in them. The measured duplication was small and worth being honest
  about — eight CSS declarations, identical in both products:

  ```css
  .w-shell / .sl-shell     { display:flex; flex-direction:column; height:100%; min-height:0 }
  .w-shell-body / .sl-body { display:flex; flex:1; min-height:0 }
  ```

  The value is not the eight lines; it is that two of them are the lines everyone
  gets wrong. `min-height: 0` on a flex child is the whole difference between a
  pane that scrolls and a pane that pushes the window past the bottom of the
  screen — the default `min-height: auto` refuses to shrink below its content —
  and `min-width: 0` on the middle region is the same fault sideways, which is
  what stops a wide table from shoving the right-hand pane off the screen.
  Neither is discoverable from the symptom, and both were written twice.

  Three decisions worth keeping:

  - **Layout only.** No colours, no padding, no borders. Those are what make Word
    look like Word and a deck look like a deck, and a frame carrying them is a
    frame with a house style.
  - **The product keeps its own class name on every region.** Not politeness about
    churn: `.w-shell-document` is what Word's ruler and its zoom *find the
    scrolling pane by*, in three places, and what five browser tests select. A
    shared frame that renamed it would break three files to save eight
    declarations.
  - **`as` and the landmarks.** A deck's chrome was a `<header>` and its centre a
    `<main>` before this existed, and a frame rendering five anonymous `div`s
    would have quietly taken landmark navigation away from both products. Verified
    on screen: `header, nav, main, aside, aside`.

  **There is no `AppFooter`, and that is the interesting part.** A deck has a fifth
  region — the timeline along the bottom — and it does not want a wrapper:
  `.sl-timeline` already carries `flex: none`, and its height is `max-height: 70%`
  *of the window*, which a `flex-none` box between them would turn into 70% of a
  box sized by its own content. So the product's own pane is the region. It was
  written, found to have no honest caller, and deleted before it shipped — which is
  the rule this file keeps stating: a component no product has drawn is a component
  nobody has checked.

  One real behaviour change went with it: Tailwind's `flex-1` is `flex: 1 1 0%`
  where the hand-written CSS said `flex: 1 1 auto`. Different flex-basis, same
  outcome for a region that is the only growing child — measured on both windows
  before and after (48 + 736 + 43 in the deck, 147 + 753 in Word) and cleared by
  both suites.

- **Three axes became one, and the clock got a step.**

  A span, ticks at a countable step, labels on some of them, a marker that can be
  dragged: this repository drew that three times — Word's ruler, a slide's ruler,
  and the timeline — with three different answers. `axisTicks` in `office-ui` is
  the one that had worked out the two hard parts, now reachable by all of them:
  count in the axis's own unit (a centimetre is 566.9 twips, so stepping in twips
  labels the third tick 2.99cm) and compare the major step with a tolerance
  (`0.5 × 6` is 2.9999999999999996, so a `%` test drops a third of the labels).

  The timeline's was the one with a defect: `ceil(span / 500)` with a label on
  every other tick, inline in a component and untested. At a sixty-second
  sequence that is 120 ticks and 60 labels — which the slide ruler's own notes
  call "a grey band rather than a scale". `timeStep(span)` picks the finest round
  length of time that keeps the labels countable, from a ladder (100ms, 250,
  500, 1s, 2s, 5s, 10s, 30s, 60s) rather than by arithmetic, because a *round*
  length of time is a convention: 250ms is round and 300ms is not, the same way a
  clock face is quarters and not thirds.

  **A correction worth keeping.** The first version of this claimed the old step
  "did not change when the axis was magnified, which is the one thing magnifying
  is for" — and that was wrong: magnifying keeps the span and spreads it over more
  pixels, so the step had no reason to change. But reading the code to check the
  claim found the real version of it: the budget is labels *per pixel*, so an axis
  drawn at four times the width of its pane has room for four times as many
  numbers. `timeStep(span / magnify)` — and magnifying now does something to the
  scale rather than only to the spacing.

  Which broke an existing assertion, correctly: the magnify test checked "the same
  seconds" by comparing the tick *labels*, a proxy that stopped being one. It
  checks the intent directly now — the axis still ends where it ended — and the new
  behaviour beside it.

  `office-slides/src/ruler.ts` is gone. Nothing inside that package had ever called
  it; only the app had, which is what made the move free.

- **What the stage is showing is one question now.**

  A slide's animation is watched four ways — presenting, stepping back through a
  show, previewing in the editor, dragging the playhead — and the app held one
  variable per way, three of which meant the same thing:

  ```ts
  const at = presenting ? played : scrubbing ? pressShown : previewAt;
  ```

  Then everything downstream repeated the mode test to know what to do with it:
  `scrubbing ? at - 1 : at` for what is still hidden, `presenting && settled ?
  step.endAt : undefined` for where to hold, `presenting && settled ? [] : started`
  for whether sound plays. Four mode tests, in a 1,100-line component, and not one
  of them checkable without presenting a deck in a browser.

  `showing(where)` is that question in `office-slides` — 12 tests, milliseconds —
  and the two rules it now states out loud are the two that are easy to get wrong:

  - **Scrubbing counts one press fewer as played.** A reader dragging through press
    3 is watching press 3 *happen*, so what it brings on must not already be on
    screen; a presenter who has clicked three times has finished press 3. Off by
    one either way and a shape is either missing or already there before the
    animation that brings it in.
  - **Going back holds; it does not replay.** The press gets the same animations
    seeked to their end, and its films and sounds are *not* started — a film that
    has been watched does not play again when the presenter steps back past it.

  It also made the transport's design legible: nothing in the function knows that a
  pause happened. Pausing sets the playhead and clears the run, which is a state
  that already had a meaning — so a paused deck and a dragged playhead are the same
  answer, and frame-stepping is scrubbing by another name.

  The state itself is still twelve `useState`s and that was left alone on purpose;
  the reason is in the open list above.

- **The subscription every panel needs is one subscription now.**

  Six files were hand-rolling it — five in Slides, one in Word — with the counter
  byte-identical and **the events different**: Slides listened to
  `selection.model`, `selection.change` and `content.change`; Word listened to two
  of the three.

  The measurement that made it a bug rather than a tidy-up: `updateSelection(null)`
  emits **only** `editor:selection.change`. The model event is for a selection that
  *is* something; a selection cleared is announced on the other one and nowhere
  else. And `office-word/src/table-commands.ts` clears the selection when
  `deleteTable` succeeds — so Word's ribbon had a path where it keeps describing
  cells that no longer exist, from a lesson Slides had already learnt and written
  down in its own copy. **A duplicated subscription means the fix lands in one
  copy**, and this one had been sitting in the other for months.

  It drifted the other way too, and there Word was right: Word bumped the counter
  once *after* subscribing and Slides did not. That is not a wasted render — a
  document is loaded asynchronously, so `content.change` can be emitted between a
  panel's first render and its effect running, and an event nobody is subscribed
  to yet never arrives. Slides' five panels gained that.

  Two names with no arguments rather than one with an option, because the only
  reason to want the narrower one is cost, and a caller that can half-choose is
  exactly how six copies ended up listening to three different subsets.

  **And it was put in the wrong package first, which is the more useful lesson.**
  The first version was `useEditorRevision(editor)` in `office-ui`: it took an
  `Editor` and named the three events. That reads as sharing and is a layering
  mistake — `office-ui` is *pure UI*, and a component or hook that knows how the
  host announces its state is one the host cannot reuse. Corrected into three
  pieces, each where its knowledge actually lives:

  - **`useRevision(subscribe, deps)`** in `office-ui` — counts, and has never
    heard of an editor. Takes a subscribe function and returns a number.
  - **`watchAnswers` / `watchContent`** in `editor-core` — *which* events mean an
    answer could be different. This is where the bug belonged all along: the panels
    were guessing at the editor's own event semantics, and the editor never said.
  - **One line in each app**, where both are in scope. Duplicated in two apps
    deliberately: what could drift was the event set, and that is now one constant
    in `editor-core`, so the copies cannot disagree about anything. A third caller
    is the data point that would justify an `office-react` package.

  Taking `Editor` out also took away `office-ui`'s last import of it — see the
  chrome section. A shared-UI package with no dependency on the document layer is
  the version of "shared" that a page builder or a design tool can actually use.

- **The suite's icons are a package, keyed by the act.**

  Two steps, and the first was the one with the finding in it.

  **The table was keyed by control id** — `slide-new`, `look-banded-rows`,
  `duplicate-boxes` — which meant the *shared* chrome held both products'
  vocabularies and a third would have added a third. Re-keyed to the act:
  `add`, `duplicate`, `delete`. That merged three entries the ids had kept apart
  (a slide and a shape are deleted by the same act; the highlighter's colour is
  the highlighter) and split one they had conflated (`first-column` and
  `frame-row` share a drawing and are not the same idea). 83 entries became 80,
  and all 104 toolbar-model entries name an act.

  The re-key was done twice, because the first pass was wrong in a way that
  passed: a regex matching `id: … icon: …` with DOTALL paired a **group's** id
  with its first control's icon and skipped 18 controls silently. A scripted
  edit that finds fewer things than there are does not fail — it succeeds on the
  subset.

  **Then `@barocss/office-icons`.** The value is the boundary, and it is only
  visible from outside: an editor that wants the suite's pictures should not have
  to take `office-ui` to get them — four Radix packages, a colour picker, and a
  token stylesheet, none of which is needed to draw a plus sign. `office-ui`
  re-exports `Icon`, so nothing that already imported it changed.

  What it found on the way out: **`lucide-react` was imported in six files across
  three packages**, so the library was six files' worth of a decision. It is one
  now, and the three packages that no longer draw an icon no longer depend on it.
  Routing those five files through the table also meant naming the chrome's own
  *furniture* — `close`, `open`, `chosen`, the zoom's three, the comment thread's
  four — which are not acts and belong in the table for exactly the same reason.

  And the sweep found the letters. Two side panes had never been swept because
  nothing asked: the outline strip drew `☰`, the comments strip drew `💬`, and
  both panes' close buttons drew `×` — a multiplication sign at whatever weight
  the body face has, beside a ribbon of drawn icons. There is a test for the
  panes now, and it asserts it *looked at something*: a list of buttons that came
  back empty would have satisfied the old assertion while proving nothing.

  One drawing changed twice over, for a reason worth keeping: **`previous`/`next`
  and `move-up`/`move-down` were the same picture**. Walking a document and
  reordering a thing in a list are different acts, and one picture for two ideas
  is the fault this table exists to prevent — so walking is a chevron (only the
  view moves) and reordering is an arrow (the thing moves).

- **A slide has a ruler.**

  The interesting part is not the ticks, it is the **step**. A ruler is only
  useful if a reader can count it, which means the step is a round number of
  *their* unit and not of twips: one centimetre is 566.9 twips, so a ruler
  stepping in twips draws ticks at 566, 1133, 1700 and labels the third one
  2.99cm. `slideTicks` counts in the unit and converts per tick.

  Two things it ran into:

  - **The label test needs a tolerance.** `0.5 × 6` is 2.9999999999999996 in
    binary, so a major-tick test by `%` skips the 3cm label on a third of the
    ticks. Compared with `1e-9`.
  - **The step could not live where the ticks do.** `slideTicks(length, unit)`
    would not compile: `office-slides` is a model package and `LengthUnit` is the
    chrome's. Split — `office-ui` owns `rulerStep(unit)` (which numbers to count
    in, a judgement about how many labels fit across a slide) and `office-slides`
    owns the counting. The boundary did the arguing for us.

  And two browser faults that only a browser shows: the vertical ruler sat 46px
  out because `.sl-stage-frame` centres itself with `margin: auto`, and the
  pointer marks never appeared at all — the overlay covers the slide, so the
  stage never sees a `pointermove`. A window-level listener.

- **A drag says what it is doing.**

  It said nothing, so a reader resizing a box to a size had to let go, read the
  panel, and try again — twice per attempt. The arithmetic was already there: the
  drag's preview **is** the box it would write, so this is a label, not a
  calculation.

  Which number depends on the gesture, because that is what the reader is asking:
  a move is about *where* (`5.67cm, 7.41cm`), a resize about *how big*
  (`30.14cm × 4.23cm`, the way Figma writes it), a turn about *how far round*
  (`65°`). One badge for a selection of six rather than six overlapping labels —
  the gesture is one thing.

  And it moved a piece of state: **the unit is the app's now**, not the properties
  panel's. It was the panel's own `useState` and that was right until a second
  thing had to say a length; a badge reading millimetres beside a panel reading
  centimetres is two answers to one question, which is the same fault as the zoom
  box that disagreed with the screen. The same rule the zoom and the pane height
  already follow: *how a reader has set up their window is the app's.*

- **A right-click does something.**

  It did nothing — measured, zero menus in the document, so the browser's own
  appeared instead and offered "이미지를 다른 이름으로 저장" over a shape. Every
  command it needed already existed; what was missing was the menu.

  Three decisions worth keeping, and one bug the change walked into:

  - **The list is a model.** `slideMenu(target)` in `office-slides` — which items
    for which selection — because *what* a reader can do to a selection is a fact
    about the document, and a menu assembled inside a component would be a second
    answer to the question `toolbar-model.ts` already answers. Eight unit tests,
    milliseconds.
  - **Offered and disabled, never missing.** Whether each item *can* run is the
    command's own guard, asked once through `canExecuteCommand`. An item that is
    greyed out teaches a reader it exists; an item that is absent teaches them it
    does not.
  - **A right-click selects what it found** unless that is already selected —
    every tool does this, and the reason is the sentence a menu has to finish:
    "delete **what**". A right-click inside a selection leaves it alone, so a menu
    can act on six shapes.
  - **And the chords come from the keymap.** `⌘D` beside 복제 is teaching; a stale
    chord would be worse than none, so `shortcutOf` reads the one table that binds
    them.

  **The bug:** the menu is opened by the canvas overlay, because that layer is
  what knows *what was clicked* — and the overlay had just been given a
  `clip-path`, so a menu near the slide's bottom corner was **cut away and could
  not be clicked at all**. A child of a clipped element is clipped with it. It is
  a portal into the body now, which fixed positioning made free anyway, and that
  removes the whole class of "some ancestor clips or scrolls this".

  Hand-rolled rather than Radix, deliberately: Radix's context menu owns the
  *trigger*, and what is being right-clicked here is a canvas where the target is
  hit-tested against the model rather than read off an element.

- **The empty timeline was taking a quarter of the window — and the zoom box was
  lying about what it drew.**

  Audited the chrome against the tools this is measured against, starting by
  measuring rather than by listing opinions. The first finding was not a missing
  feature: on a 1440×900 screen the timeline pane held **240 pixels — 27% of the
  window — for the sentence "이 슬라이드에는 애니메이션이 없습니다"**, and that is
  why a slide drew at 57% when there was room for 69%. An empty instrument taking
  a quarter of the window is the difference between a tool and a demo of one.

  So the pane's default follows the slide: a strip (43px) with nothing to draw,
  open the moment the slide has a step — which is also the moment the reader wants
  it, because the gesture that made the step was about time. A reader's own fold
  **wins** from then on; a pane that reopened itself after being folded would be
  arguing with the person using it.

  **And that uncovered the real bug.** The zoom box read the slide's own box
  through a `ResizeObserver`, and it cannot work: **a slide is scaled with a
  `transform`, and a transform is not a resize.** The observer fires when the pane
  takes room from the stage, reads the slide *before* the new scale is applied, and
  is never told again — so the box said 57% while the screen drew 69%, until some
  unrelated render came along. Measured in all four states, then again after the
  fix:

  ```
  before   pane open 240px   slide 732px   box 69%   ← disagrees
  before   folded     43px   slide 888px   box 57%   ← disagrees
  after    pane open 240px   slide 732px   box 57%
  after    folded     43px   slide 888px   box 69%
  ```

  The stage computes the scale, so the stage reports it — forty lines of DOM
  measurement deleted. Which is what the comment there always claimed ("read back
  from the stage, so the number in the box is the number on the screen") and now
  literally is, rather than a second measurement hoping to agree with the first.

- **Three more filters, and they really were a row each.**

  The claim the SMIL seam made when it was built was that the next filter would be
  a table row. Tested by adding three: `thickenIn` and `thinOut` (an
  `feMorphology` erode run backwards and forwards — text swelling into place, text
  thinning away) and `shimmer` (`feTurbulence`'s `baseFrequency` moving while the
  displacement stays small, so every pixel shifts a little and nothing shifts
  far). No change to the seam, the cost table, the timeline or the stage: the tier
  comes from *having* a filter and the clash from writing `filter`, both already
  read from the definition rather than from a list of names.

  The detail worth keeping is the one that only a projector would have taught:
  **the static attribute has to equal the animation's first value.** A morphology
  whose `radius="0"` while its animation starts at 2.8 shows one frame of the
  untouched shape before the SMIL clock starts. Now asserted for all three by a
  regex over the markup, which is cheaper than seeing it.

  And measured rather than assumed, because a filter that attaches and does
  nothing looks exactly like one that works: dark pixels inside the shape, over
  one run of `thinOut` — **5925 → 2997 → 1174**. It really erases.

- **The pane says when a trigger's button can be pressed.**

  A trigger waits for a *shape* rather than for a press, and a shape that has not
  arrived yet cannot be clicked — it is hidden, so it is not hit-testable. True,
  correct, and invisible: a reader who puts a trigger on a box that arrives on the
  second press has built something that does nothing for the first two clicks and
  no way to find that out.

  Both halves were already in the pane — what is on the slide after N presses, and
  how many presses there are — so this is arithmetic (`triggerWindow`) and a
  sentence, not a feature. What the arithmetic makes obvious is that the answer is
  a **range** rather than a moment: a shape can leave again, so a trigger on a box
  that exits on press 4 is clickable from 2 *until* 4 and never after. And there is
  a third answer worth having: **never**, for a shape that is itself waiting to be
  clicked — two triggers waiting for each other, which is a deck built wrongly and
  now says so.

  Said only when there is something to say. A shape that is on the slide from the
  start gets no note at all, because every note a reader learns to ignore costs the
  next one its meaning.

- **Two shapes named in one tick used to get one name.**

  `_freeShapeName` counts the `shape-N`s in the document and takes the next
  number, which is exactly right and cannot survive two commands in the same tick:
  the second reads the document the first has not committed to yet, and both come
  out `shape-1`. Two shapes with one name is a motion step that animates whichever
  the timeline finds first — a fault that surfaces as "the wrong shape moved" long
  after the click that caused it.

  The number is remembered as well as read now: the next name is past both the
  document and the last answer this session gave out. Which makes names **sparse**
  after an undo (`shape-1`, `shape-4`) and that is the right trade — a name has to
  be unique, not dense.

  **And the fix uncovered a bigger one.** With the naming fixed, the same two
  commands still produced *one* step instead of two — because with no track on the
  slide yet, both transactions create one and the second replaces the first. So the
  naming was the visible symptom of a read-then-write race, and the rest of it is
  logged as its own item: it wants commands serialised or a create-if-absent that
  is safe to run twice, which is the engine's question rather than this product's.
  The test written for the naming says so out loud, by making the track exist first.

- **The popover no longer eats the click — and it stopped doing so without anyone
  fixing it.**

  Went to fix a logged fault (a colour panel that closed on a pointer outside took
  the reader's click with it, so pressing 미리 보기 with the picker open closed the
  picker and did not start the preview) and measured it first. In the exact
  scenario the entry names — a glow step, the inspector's 모션 색 picker open, one
  press of 미리 보기 — the picker closes **and** the preview runs: one click, one
  listener call, `data-playing="true"`.

  It went away when the three copies of the dismiss logic became one
  (`useDismiss`); the old ones did something extra that cost the click. So the fix
  for this entry is a *test*, not code — the behaviour was unheld, which is the
  same as being luck. Two things worth keeping from it:

  - **A fixed fault is not fixed until something holds it.** This one had been
    fixed for a day and nothing said so.
  - **Read the entry, then measure the entry.** The cheapest work in this session
    was the piece that turned out to be already done, and the only way to find that
    out was to reproduce it rather than trust the note.

- **Five flaky tests, and what made them flaky was the same sentence every time.**

  Four full runs in a row each failed exactly **one** test, a different one each
  time — the transport's rewind, a build restored after a show, an echo trail, the
  running playhead, the scrubbed playhead — and every one of them passed alone and
  repeated. That pattern is not a product fault, it is a *test* fault, and the
  shape of it was identical in all five:

  ```
  await page.waitForTimeout(500);          // hope the animation got there
  expect(await moment(page)).toBeGreaterThan(0);
  ```

  A fixed wait before an assertion is a race with whatever else is running, and
  what was actually being waited for was readable in every case: an animation's
  `playState`, a shape's visibility, a clock that only goes up. All five are
  `expect.poll` now, on the condition itself.

  Two distinctions worth keeping, because "no sleeps" would be the wrong lesson:

  - **A sleep before a *gesture* is fine** — waiting for a command to land before
    pressing the next button races nothing. A sleep before an assertion about
    something **still moving** is the bug. And the one that can never be a poll is
    "nothing happened": `expect(await turned()).toBe(before)` has no condition to
    wait for, so polling would pass on its first read and prove nothing. Those wait
    on purpose.
  - **A poll's timeout is a ceiling, not a delay.** Raising one from 3s to 8s is
    not the dishonest fix a longer sleep would be: nothing waits for it once the
    condition holds, and it only has to outlast the worst start-up under load.

  **And then the failures moved.** With the five fixed, two runs failed two
  *different* tests — a turned shape's transform, a fill's eye — each of which
  passes alone, in its own file, and six times in parallel. So the five were worth
  fixing on their own terms and they were not the whole story: what is left is not
  five flaky tests but a suite of 188 with 318 sleeps in it, run on a machine that
  was also running Word's 329.

  One suspect was measured and **cleared**: the new `:has([data-bc-filler])` rules
  for the placeholder prompt, which have to be re-evaluated whenever anything
  inside a text frame changes and are exactly the kind of selector that makes
  typing slow. Timed with the rules on and off — 20 Korean characters typed in
  551/522ms against 431/505ms, forced style recalc 0ms either way. Overlapping
  noise, no cost. Worth writing down because the *next* person to see wandering
  failures will suspect it too.

- **A deck a reader can start — and the engine could not draw it.**

  The app could save a deck and open one, so the only way to begin your own was to
  delete somebody else's slides out of the sample. What a new deck *is* turned out
  to be the easy half: one title slide, plus the definitions a first edit needs —
  a theme (so `theme:accent1` resolves), a master to inherit from, and the layouts
  a new slide is made from. An empty document is not an answer; it is a white
  rectangle with nothing to click.

  **Then it did not draw.** Measured: after 새로 만들기 the model held one slide and
  the DOM held the previous five, and an explicit `view.render()` changed nothing
  at all. The fault is four lines in `editor-view-dom`:

  ```
  // No tree passed: prefer last rendered tree … so we don't replace it with empty editor document
  if (this._lastRenderedModelData) modelData = this._lastRenderedModelData;
  ```

  Which is *right* for an edit — the last tree is a **proxy** over the store, so
  every change appears in it without exporting anything again — and wrong for a
  replacement, because a proxy is live for **its root** and `loadDocument` makes a
  new one. So the view was pinned to the first document it ever drew, permanently,
  and every product that opens a file has been getting away with it for one
  reason: an identical tree reloads to identical sids, so the DOM happened to
  match. A *different* document is what breaks it.

  The fix needed one more thing than the obvious comparison, and the comment above
  is what said so: the last rendered tree is only stale if it came **from the
  editor**. A caller-supplied tree is the caller's — the layer tests render one by
  hand into an editor with no document, and preferring the editor's there drew an
  empty document over their content. Provenance is not written in a tree, so that
  one *is* a flag, and it is the only thing here that could not be read.

  And a **second** captured root, one layer up: the environment the renderers
  resolve formatting against held the root id from the moment the app mounted, so
  the new deck's title drew in `system-ui` where the sample's draws in Georgia —
  the theme and the master were being looked for under the old document's root.
  `rootId` is a getter now rather than a value: making it a *question* instead of
  an answer is the whole of that fix, and it is the same lesson as the one above.

  A smaller thing worth keeping: **the prompt in an empty placeholder is drawn
  from the DOM, not from the document.** An empty run renders a marked zero-width
  filler, so `:has([data-bc-filler])` is "this placeholder has nothing in it" as a
  fact a stylesheet can see — no attribute, no renderer change, and it disappears
  on the first keystroke because the filler does. Sized at 40px rather than 14,
  because the stage scales the whole slide and 14 came out at eight on screen.

- **A film is trimmed by dragging its bar, and the decision was which edge means
  what.**

  A bar's edges mean *when* and *how long* everywhere else on this axis. A film's
  do not: what a film's bar is as long as is the part of the **file** that plays,
  which is an attribute of the film and not of the step. So the question this was
  waiting on was not how to drag anything — it was what a play step's edges are
  allowed to mean.

  Every video editor answers it the same way and answers **both at once**: the
  head dragged in makes the clip start later *and* begin further in, so the frame
  under the pointer stays still and the tail does not move. Which is expressible
  here exactly — `delay += Δ` on the step, `trimStart += Δ` on the film — and it is
  the reading a reader who has ever trimmed a clip already knows. The alternative
  (the left edge moving while the right edge slides left) is a bar that shrinks
  from the end nobody is touching.

  Three things worth keeping:

  - **The tail is where a film *gets* an out-point.** `0` means "to the end"
    because a file's length is not in the document, so the first drag of the tail
    is the moment the deck learns a length — the one the reader dragged to. Which
    is why the arithmetic takes a *length* rather than a point: the bar's width is
    what the reader is holding.
  - **One gesture, one undo.** The trim is on the film and the delay is on the
    step — two nodes — so the head drag is one command writing both. Two commands
    would be two entries in the history that each undo half of what happened.
  - **Three clamps, all reachable with one flick**: never before the first frame,
    never before the press it plays in, and never past its own out-point. Measured:
    dragging the head to the far right of the axis leaves a quarter-second of film
    rather than an inverted one.

- **Backwards through a show — and the two faults it uncovered were worse than
  the thing it was asked to fix.**

  Stepping back was supposed to un-play one press. Measuring it first turned up
  three separate things, and only one of them was the missing feature:

  ```
  back into the previous slide   0 / 2, both shapes hidden      ← a blank slide
  press 1  the shape flies out   translate -65%, opacity 0
  press 2  …and it comes back    opacity 1                      ← the exit stopped holding
  a shape whose one motion is 날아가기                          ← invisible from the start
  ```

  The comment in `present.tsx` said Back "goes back to the previous slide with
  everything on it, which is the reading a presenter who has lost their place
  actually wants". It went back to the previous slide with **nothing** on it — the
  presenter's key set the press to zero — so the sentence describing the deliberate
  choice was describing something the code did not do. Worth remembering as a
  failure mode of comments: this one was *load-bearing* and wrong.

  The exit was the real bug. An exit held its end state through its own animation
  (`fill: both`) and the next press does not run that animation, so a shape you
  animated away reappeared on the next click. And its mirror: every build's target
  was hidden until it played, with `fadeOut` excused **by name** — one of the four
  exits this product has — so a shape whose only motion was 날아가기 was invisible
  from the moment the slide arrived. Both are one sentence now: what is on the
  slide is decided by **the last step of that shape's that has played**, and what
  counts as an exit comes from the effect table rather than from a name.

  **Nothing new had to be built for "backwards".** A press arrived at backwards is
  handed its own animations *seeked to their end and held* — `seekTo`, the same
  mechanism the playhead uses to look at a moment. So Back is a state rather than
  a run, which is what it is in every tool, and the stage learned nothing.

  The last one was a two-halves-disagreeing bug of the kind this repository keeps
  finding: an effect keyed on "the slide changed" set the press to zero, because
  arriving at a slide from the rail or the filmstrip *does* mean starting at its
  beginning. A press now says which slide it belongs to, so a deliberate one is
  not an arrival to reset.

- **The chrome stopped drawing its own controls — and the stylesheet was the
  half nobody was counting.**

  Thirteen more hand-rolled controls migrated (the shell's four, the properties
  panel's five, the notes' one, the file row's three), one new primitive, and the
  ratchet down from 34 to 21. The primitive is the interesting part and so is the
  fault:

  **`FilePick`**, because `<input type="file">` is the one form control a product
  cannot style — it draws its own button, in the browser's language, and no rule
  reaches it. So every app on the web hides the input, draws a real button, and
  clicks the input from it; and every app gets the same detail wrong the first
  time: **an input keeps its value, and `change` only fires on a change**, so
  picking the same file twice is one opening and then silence. That is three lines
  and a comment that should exist once.

  **And the same fault one level in.** `office-ui` itself had two copies of its
  number field: `PropertyNumber` and `NumberField`, the same `key`/`defaultValue`
  trick, the same "an emptied field means leave it alone", the same Enter that has
  to be *prevented* rather than merely stopped — and `controls.tsx` even claimed
  they were "the same code rather than a second copy of it", which was true of the
  rule and false of the code. The panel row delegates now, and the lesson that took
  a browser to find (Enter's pending `beforeinput` splitting the paragraph inside
  the box being resized) lives in one place. What a row genuinely wants differently
  turned out to be two things and both are now parameters: two decimals, because a
  third decimal of a centimetre is noise — and *not* fewer, because 125ms shown in
  seconds is `0.125` and rounding that to `0.13` would write 130ms back.

  `DialogButton` was the other one: a hand-rolled button whose primary tone was
  `bg-sky-600`, the only place in the package that named a colour instead of
  `--ou-accent`. So a product that mapped the token got a dialog disagreeing with
  its own toolbar. It is `Button` now, one size up, and the size is the only
  difference that stayed.

  **The fault: a file can reach zero on the ratchet and still draw its own
  controls.** `.sl-topbar-actions button` was four rules of this app's border,
  padding and radius — and as a descendant selector it beat every class
  `office-ui` could put on its own button, so the *shared* buttons in that row were
  drawn in this app's language too. The count was measuring the JSX and the CSS was
  quietly undoing it. Both files' worth of rules are deleted; a control that needs
  tuning is tuned through `className`, where `tailwind-merge` settles it at the
  call site rather than whichever stylesheet loaded last.

- **A shape's fills are drawn as elements, and three walls fell at once.**

  A stack of paints fits in `background` exactly until a reader wants to do
  something to **one** of them. Three things were waiting on this, each measured
  and none of them a matter of taste:

  ```
  background-size: calc(100% * 1.4)   a different fit, not a nearer view — no numeric `cover`
  opacity on a picture fill           drawn as a fully transparent wash: a no-op, at full strength
  two photographs cross-fading        not expressible in `background` in any form
  ```

  The middle one is the embarrassing one: the panel has had an opacity control for
  every fill, and on a *picture* it did nothing at all. An element has `opacity`,
  `translate` and `scale` — all three animatable, two of them composited — so the
  Ken Burns zoom, a real per-fill opacity and a cross-fade arrive together with one
  change. Which is why it was worth waiting for rather than special-casing the
  zoom.

  **Where the layers go was the measurement.** Behind the shape's own content,
  which for a text frame means behind real editable paragraphs. Sampling pixels of
  a red layer against black text:

  ```
  z-index: auto                     red 35502, text    0    the fill covers the text
  z-index: -1                       red     0, text 5688    invisible — the same as no layer
  z-index: -1 + isolation: isolate  red 28598, text 5882    correct
  ```

  The middle row is the trap: a negative-`z` child of a box that is **not** a
  stacking context is painted in the nearest ancestor that is — the slide — whose
  own opaque background then covers it. The alternative was a wrapper around the
  content, which would have put a `<div>` of this product's between a text frame
  and the paragraphs Word's renderers draw. A painting problem is not a reason to
  reshape the editable tree.

  Two more things fell out, both of which changed something written down:

  - **The registrations had to start inheriting.** A track is animated on the
    shape and read *inside* it now, and with `inherits: false` the image's own
    computed value is the initial one — measured, the variable reached 1.32 on the
    shape while the picture stayed at exactly 1. `inherits: false` was there for a
    reason, though (a track on a frame would turn every gradient inside it), so the
    bleed is stopped where it happens instead: **a shape that draws layers declares
    its own neutrals**, and an element's own animation still beats its own inline
    declaration. Measured, because a cascade is worth checking:

    ```
    ancestor animating                       child 2, picture 2
    child declares the neutral               child 1, picture 1   ← the bleed stops
    child declares it and animates its own   child 3, picture 3   ← its own still wins
    ```
  - **The pan changed its neutral from `50%` to `0%`.** A background's position is
    where the picture *sits*; an element's `translate` is a move from where it is.
    The track kept its name and changed its meaning, which is the kind of change
    that deserves the comment it got: a step written against the old neutral would
    jump the picture half a box on its first frame.

  And two lines held: one opaque solid is still the box's own `background` (a stack
  of one colour is not a stack, and there is nothing an element would buy), and a
  *tiled* fill is still a background because `object-fit` has no repeat.

  What it cost: ten browser tests that had been asking the box what it was painted
  with. They ask the layer now, through one helper — which is the honest shape of
  the change, since "what is this shape painted with" genuinely has a different
  answer. `backgroundLayers` and its four parallel comma lists are deleted rather
  than left beside the new path — a fill drawn two ways is a fill that can
  disagree with itself. `backgroundCss` stayed, because a swatch in the panel
  really is one paint in a small square.

- **The canvas gradient editor, finished — and one gradient, one selected stop.**

  Three gestures the two-point model made possible, and one fault it exposed.

  **Sliding the whole gradient** by its line: both ends by the same delta, which
  could not be expressed while a gradient was an angle. The interesting part is
  that one element now serves a *drag* and a *double-click*, and the two get along
  only because the drag has a threshold — two quick clicks travel nothing, so they
  write nothing and the `dblclick` adds a stop. Two attempts before that worked:
  `preventDefault()` on `pointerdown` suppresses the compatibility mouse events, so
  the double-click stopped adding stops the moment the drag existed, and the
  pointer capture took the editor's dismiss check with it.

  **One selected stop.** This was the fault: a gradient has one and *three* places
  held it — the panel's bar (`useState(0)`), the overlay (`stopPicked`) and nothing
  joining them. A reader clicked a dot on the shape and the picker went on editing
  a different stop. It is the app's now, beside `paintEdit`, for the same reason
  that is: a gesture spanning the panel and the canvas is one piece of state or two
  halves that disagree.

  **A radial's ellipse**, with what CSS actually allows, measured:

  ```
  radial-gradient(circle at 30% 60%, …)              ✓ a centre a reader can move
  radial-gradient(ellipse 80px 30px at 30% 60%, …)   ✓ two radii
  radial-gradient(ellipse 40% 25% at 30% 60%, …)     ✓ radii as percentages
  radial-gradient(… at 50% 50% / 30deg, …)           ✗ rejected — no rotation
  ```

  So a radial gets a centre and two radii and stops there; the **rotated** ellipse
  Figma draws is a wall in CSS, not a gap here. The radii come out of the same two
  points — `from` is the centre and `to` the corner — so a radial needs no
  attribute a linear does not have, and switching between them keeps the placement.
  Two handles rather than one, because `to` is a corner and one handle would drag
  both radii at once.

  And the thing that took three tries: **which of three overlapping controls takes
  the press.** For a radial, the last stop, the linear's aim handle and the
  horizontal-radius handle all wanted the same pixel — `elementFromPoint` there
  answered "stop 1", so dragging the radius moved a colour. The aim handle is now
  linear-only, the radius handles are drawn *after* the dots, and both are pushed
  out past them the way the linear's ends are.

  A smaller one worth keeping: `0.8 − 0.5` is `0.30000000000000004`, which reaches
  no drawing (the CSS output is two decimals of a per cent) and reaches every
  *comparison*. Rounded where it is derived, for the reason the `twip` helper two
  hundred lines above already gives.

- **A gradient runs between two points, and can be edited where it is drawn.**

  Four items off the Figma audit, in one pass. The last is the interesting one:
  **a gradient's shape stopped being an angle.**

  An angle runs across the whole box, centred, with its length derived
  (`|w·sin a| + |h·cos a|`). So "it starts a quarter of the way in and ends past
  the edge" — most of what anybody does with a gradient in Figma — could not be
  said, only approximated by moving the stops, which is a different thing: it
  changes where the *colours* are and not where the gradient *is*, and the two come
  apart the first time the shape is resized.

  Measured before choosing how: **CSS has no syntax for two points.** The obvious
  route — paint the gradient into a smaller `background-size`/`position` layer —
  places the axis exactly and is *transparent outside that layer*, where CSS and
  Figma both hold the end colour. What works is arithmetic: project the reader's
  segment onto CSS's own axis and squeeze the stops into the part it covers. The
  picture is right, the colours hold outside it, and the declaration stays one
  `linear-gradient`.

  Decisions worth keeping:

  - **Fractions of the box, not twips.** A point at `{0.25, 0.5}` is a quarter
    across whatever size the shape becomes. The motion path chose the opposite for
    the opposite reason — a journey is a distance, not a proportion.
  - **The angle goes when the points arrive.** Holding both would be two answers
    to one question, and the reader who dragged the handle has just said which.
  - **Clamping is a *write* rule, not only a read rule.** The overlay wrote the raw
    fraction and a drag to the far side of the slide put `x: 2.48` in the document
    — two and a half box-widths out. It drew fine, because the read clamps; the
    document was the casualty, and it round-trips through a file.
  - **The end handles sit just outside the segment.** A gradient's first stop is at
    its start, so the square and the dot landed on the same pixel and the handle
    swallowed the stop — measured, the first stop could not be dragged at all. (The
    far end had always had this and nobody had tried it.)

  And three smaller ones, each a gesture moved to where the reader is looking:

  - **Stops added and deleted on the canvas** — a double-click on the axis, Delete
    on the picked dot. `addStop`/`removeStop` are the model's, shared with the
    panel's bar, because it is one gesture in two places. The refusal below two
    stops matters twice over: on the canvas, a Delete that cannot do what it means
    must not fall through to deleting the shape.
  - **Flip**, which every drawing tool has and this one did not. Two attributes
    rather than a negative width, because every reader of a box assumes a size is a
    size; the mirror goes *after* the rotation in one `transform`, so a flip never
    changes the turn a reader typed; and it is a **toggle per box**, because with
    one mirrored shape and one not, "flip" means mirror each of them — every tool
    means that, and so does the word.
  - **The stacks say when a selection disagrees.** A number can be blanked and a
    list cannot: "these two have no shared fills" is not a list, and an empty panel
    would hide the rows a reader is about to replace. So the rows are one box's and
    a note says so — Figma's *Mixed* chip, in a sentence — and editing writes to
    all of them. The comparison is of the **read** rather than the attribute,
    because two documents can hold the same fill with its keys in a different
    order.

- **The properties panel stopped lying about a selection.**

  Found by auditing the two panels against Figma, and it was a *fault* rather than
  a gap. Measured with a 6000-twip rectangle and a 2000-twip ellipse both selected:

  - the panel showed **10.58cm** — the rectangle's width, presented as the
    selection's;
  - typing a width changed the rectangle and **left the ellipse alone**.

  The controls had been ready for this since Word's ruler: `PropertyNumber`'s own
  comment says a `null` value is drawn as an empty field with a placeholder so that
  *committing* it is a no-op rather than setting both to zero. **Nothing had ever
  passed it one.** A primitive that knows something the panel never asks is the
  same fault as a schema attribute nothing reads.

  Four decisions, each measured after:

  - **`null`, not the first value.** A panel showing one of two values applies it
    to both the next time anything else changes — a reformat nobody asked for.
    Agreement is a state of its own (`agreed`/`agreedAttr`, in the model, so the
    overlay gets the same answer).
  - **One transaction, one undo.** Six shapes retyped once is one thing a reader
    did; six undo entries to get back is the ruler's mistake one level up.
  - **The attributes are computed per box, not once.** What a box accepts is what
    it *declares*, so a mixed selection writes the corner radius to the rectangles
    and skips the ellipses — measured, the ellipse never gained the attribute at
    all. Which also means the row is **offered** whenever *any* of them has it;
    greying it out would answer a question nobody asked.
  - **The heading says how many.** Fields that change six things under a heading
    naming one shape is exactly the surprise this was about.

  What the audit also found, and did not fix: the timeline pane had this **right
  all along** — "6개 선택", and a length typed there changes six. Two panels in one
  app disagreeing about what a selection means is the §3a failure shape again,
  inside a single product.

- **The paint stacks are a shared list control, and no component draws in
  Tailwind's greys any more.**

  The next one off the ratchet, and the one that was waiting on a *primitive*
  rather than on effort. A fill row and an effect row are the same row — a grip,
  the thing, an eye, a delete, and an editor that opens from the swatch — and this
  repository had it **twice** with a third coming (a layer panel). Twice is a
  coincidence; three times is a component nobody wrote.

  `StackList`, `StackRow`, `useStackOrder` and `useDismiss` are in `office-ui`
  now, and the two browser measurements the local copies had learned went with
  them, because neither is visible in the code:

  - **The dismiss host is the whole row, not the editor.** With the ref on the
    editor alone, pressing the swatch to *close* it was two events fighting — the
    pointer landed outside the editor, which dismissed it, and then the click
    toggled it open again. A reader saw a panel that would not close.
  - **An editor can have handles somewhere else.** A gradient's axis is dragged on
    the *slide* while its row is open, so "a pointer outside this row" closed the
    editor and unmounted the handles in the capture phase, before React's
    `pointerdown` reached them. Hence `keep`, which is how the panel half knows
    about the canvas half — `[data-paint-canvas]` at this call site.

  `useDismiss` was the **third** copy: `ColorField` had one too.

  Then the rest of the palette. Every component in the package drew with
  Tailwind's own greys, so the tokens only fixed the controls written that day —
  measured in the paint panel, 40 controls with **five** border colours and one
  stray `oklch(0.87)` on the unit picker. Now: one grey, `#d8dce4`, the deck's own,
  and zero `neutral-*` classes left in `office-ui`. The panel is 19 raw controls
  down to **1** — a gradient stop, which is a handle dragged along a bar and not a
  field.

  One thing the migration taught about the ratchet itself: a test that only fails
  when a number goes *up* is half a ratchet. It fails when one comes down without
  being recorded too, so a file that has been fixed cannot quietly regress.

- **The suite's controls are the suite's, and there is a ratchet now.**

  Noticed while reading the code rather than while using it: most of the deck's
  chrome does not use `office-ui`. Measured before deciding anything, and the
  reason was not laziness — it was two things that made hand-rolling *cheaper*:

  - **The package had no button and no bare field.** It exported a colour field, a
    Radix dropdown, a dialog, a toolbar and nine property rows. So every new
    control was a choice between inventing one and inventing one: 47 `<button>`s,
    17 `<select>`s and 15 `<input>`s in this app, with their own rules in a
    1,619-line stylesheet.
  - **Two palettes, so a shared control looked foreign.** In *one row* of the step
    inspector: a hand-rolled select at 22px, `#d8dce4`, 3px corners beside the
    shared colour field at 28px, `#d4d4d4`, 4px. Two greys, three heights, eight
    pixels apart.

  And one of the hand-rolled ones was not merely different, which is the finding
  that made this urgent: **the inspector's number fields wrote on every
  keystroke**, so typing `1.8` a character at a time put **10.68 seconds** in the
  document — React rewrote the field from the model between keystrokes and the
  characters interleaved — and took two undos to get back. `PropertyNumber` had
  had the answer since Word's ruler: a number a reader is *typing* is not a value
  yet. Now: one write on blur, one undo, and Escape abandons.

  What was built, in the order the blockers demanded:

  1. **`tokens.css`** — every control in the package draws with `var(--ou-…)` and
     nothing else; a product maps its own palette once. **Density is a token**
     (`[data-density="dense"]`), not a second set of components, because a panel
     row and an instrument's row are the same control at 28px and 22px.
  2. **The missing primitives**: `Button` (with `pressed`, so a toggle is a state
     rather than a variant), `Choice` (native — the rule the products had already
     found by themselves: Radix in a ribbon where options draw themselves, native
     in a panel where they are words), `NumberField`, `Field`, `FieldGroup`.
  3. **The step inspector migrated** — 10 selects, 5 number fields, 6 buttons and
     both of its local components deleted, along with 57 lines of duplicated
     control CSS. Measured after: every control in the row is 22px, `#d8dce4`,
     3px, including the colour field.
  4. **A ratchet**, because the rest is real work: a test that counts raw controls
     per file against a written allowance, with the canvas files exempt by name.
     It fails if a number goes **up** *or* if one comes down without being
     recorded — a ratchet that is not tightened is a ratchet that slips.

  One thing worth keeping about the token contract: a `var()` with no value is
  **invalid at computed-value time and takes the whole declaration with it**. So a
  product that imports the components and not the tokens gets a panel with *no
  borders*, not one with the wrong grey — silent and total, which is why there is
  a test asserting the tokens resolve.


- **A motion no longer erases what the shape already looks like** — and the two
  mechanisms that reach the properties a keyframe cannot.

  Read the reference implementation's motion guide (`zero-core-best`, a slide
  editor on the se-zero core) and measured its central claim in our own browser:
  *writing `filter` in a keyframe makes two motions erase each other and the
  static value too.* True — and it found a **live fault here**, in two halves:

  - A shape with a 흐림 effect carries `filter: blur(3px)` from `effectsCss`. One
    glow step over it is the first of its press, so it ran `replace`, and `filter`
    holds a **list**: the computed value came out as the glow alone. The blur was
    gone while the motion ran.
  - And gone *for good* after it, because the stage's cleanup cleared `filter` to
    `''` — a property the **renderer** had been the one to write. React writes a
    style prop only when it changes, so nothing put it back. The cleanup restores
    each element's own inline value now, snapshotted before anything is written
    (which had to be got right twice: the first version snapshotted *after* the
    hide, so a shape came back hidden).

  Their answer is a registered custom property per filter function. Measured, ours
  is smaller: **`composite: 'add'` already does it** — `blur(3px) drop-shadow(…)`,
  the list concatenates and the static value stays. What that cost was one real
  design decision: `composite` belongs to an *animation*, not to a property, and
  adding is wrong for the rest (an additive `opacity` starts at the shape's own 1,
  so a fade would not fade). So a step that touches both kinds is **two animations
  on one timing** — `splitAdditive`, and the stage already made several animations
  per step for a trail and for letters, so it cost nothing.

  Then the honest remainder, each measured before it was built:

  - **`box-shadow` cannot be scaled.** Additive shadows *concatenate* (`0 4px 8px,
    0 10px 20px` — two shadows, not one bigger one) and replacing erases the
    shape's own. A track would fix it, at four `calc()`s in every shadowed shape's
    style attribute forever. A lift is an appended `drop-shadow()` instead:
    additive by construction, free, and it follows the **silhouette** rather than
    the box, so a title and a star lift as themselves. **A track is for a property
    with no other way, not for every property with a better way.**
  - **A gradient has no other way.** `background-image` is discrete, so a gradient
    that turns is not a keyframe of any kind. That one gets the track:
    `calc(90deg + var(--sl-sweep, 0deg))` written by the renderer, `@property`
    registered from the table so a row is the whole of adding one.
  - **The fallback in `var(--sl-sweep, 0deg)` is not decoration.** A registered
    property ignores it; an *un*registered one makes `var()` invalid at
    computed-value time and takes the whole declaration with it. A second host
    that skipped the registration would draw shapes with **no gradient** rather
    than shapes with no animation.
  - **`border-radius` needed neither mechanism** — one length, so the browser
    interpolates it, and additive means what a reader means (8px + 16 = 24px).

  Three effects that were impossible: 들어올리기, 그라디언트 돌기, 모서리가 펴지며.

- **And then the track was asked the wrong question.** A day later, on a shape
  with **two** gradient fills: one 그라디언트 돌기 step turned *both*, 0°→50° and
  90°→140° from a single animation. `--sl-sweep` was "the gradient's angle", and a
  shape does not have *the* gradient — it has a **list**.

  Which is true of nearly everything worth animating: fills are a stack, shadows
  and blurs are a stack, `filter` is a function list. A motion that names
  `background-image` or `box-shadow` is naming a list rather than a thing in it. So
  a track's identity is now *(what kind of thing, which one)* — `--sl-f1-angle` is
  the second fill's angle and nothing else's — the effect declares which list it is
  about (`part`) and the step declares which item (`partAt`), offered in the
  inspector's 대상 row and numbered as the paint panel draws them.

  What the naming buys, beyond the fix: **two sweeps on two fills of one shape both
  run** (different properties, so nothing clashes), and **a card with a soft shadow
  and a hard key line can deepen the soft one**. Which is what made `box-shadow`
  worth a track after all — the earlier decision weighed "multiply vs add" and
  missed that only a track can *address one of several*. Its cost is paid by the
  shapes that have a shadow, not by every shape.

  Four things this decided:

  - **The indexes are bounded, because `@property` needs a static list of names.**
    Four per list. Past the cap a part is *not offered* rather than offered and
    silent — which is the failure the whole mechanism exists to avoid — and the
    lengths are written plainly.
  - **The index is the model's, not the CSS slot's.** A translucent image is two
    CSS layers where the reader sees one fill, so a variable numbered by the comma
    list would be numbered differently from the row a reader clicked.
  - **An index past the shape's list clamps rather than refuses.** A step outlives
    the fill it named the moment a reader deletes a layer, and animating the last
    item there is is a reading they can see and correct.
  - **`filter` still gets no track.** It is the list this product animates most and
    `composite: 'add'` concatenates it, so a track per function would buy the
    ability to animate *one existing function of a static list* — which nothing has
    asked for — at the price of a `calc()` around every filter argument every shape
    carries. **A track is for a list CSS gives no other way into, not for every
    list.**

  And the same trap as `takes`, hit again on the way: on the validator's first pass
  there is no step to ask, so an unknown effect has to mean *accept*. Reading that
  as "no part, refuse" made the 대상 row move and the document not — caught by the
  test that asked what the document held.

- **Trimming a film: which part of it plays.**

  The other half of what a timeline is. The list said *when* a film starts, which
  is what an animation list says; nothing said which part of it plays, so a deck
  could only ever play a file from its first frame to its last — when every real
  use of video in a deck is a piece of one. Two points on the media node
  (`trimStart`, `trimEnd`), a `setMediaTrim`, a 필름 group in the step inspector,
  and the stage seeking to the in-point before it plays.

  Four things this decided rather than discovered:

  - **The trim is on the film, not on the step.** PowerPoint's Trim Video writes
    it on the video, and a deck that played one file twice would mean the same
    piece both times. Two different pieces of one file is two media nodes, which
    is also how a reader would think about it.
  - **An out-point of `0` means "to the end".** The file's own length is *not in
    the document* — it is in the file, known only once a browser has loaded enough
    of it to say — so there is no honest default for an out-point. Which is why
    `trimmedLength` returns `undefined` rather than a number it would have had to
    invent, and why the bar keeps the step's placeholder duration until there is a
    real out-point. A bar drawn from a guessed length is a timeline that lies.
  - **A trimmed film's length is not a field.** The step's `duration` was always a
    placeholder for a film; once there is an out-point the length *is* the trim, so
    the inspector says it as a number rather than offering a field the document
    would ignore.
  - **The out-point is enforced by `timeupdate`, not by a timer.** A timer measures
    wall time and a film is not obliged to keep up with it: a buffering stall or a
    slow decode makes the two disagree, and the disagreement is a clip that stops
    in the wrong place. The event's ~4Hz resolution is the cost, written down in
    Open rather than pretended about.

- **The playhead runs while the preview plays.**

  It showed only where a *pause* landed, which is what the transport needed and
  not what a reader needs. The moment is read from the stage's own animations —
  the same reading a pause takes, so pressing pause does not make it jump — and
  the reason it took a design rather than a `setState` is the interesting part:

  - **The clock cannot go through React.** The app's state is what *builds* the
    animations, and the stage rebuilds everything in `builds` whenever that object
    changes. A playhead that updated state sixty times a second would restart the
    motion it was timing, once per frame. So the stage hands out a `clock` ref, the
    pane asks it once per frame, and the pane writes the playhead's position and
    the readout straight to the DOM. Nothing re-renders.
  - **Which means the pane has to put it back.** React does not know those two
    elements were touched, so a stopped playhead would stay wherever the last frame
    left it.
  - **And the restore has to read the *new* playhead.** Pausing sets it, React
    writes it to the element, and *then* the old effect's cleanup runs — so a
    cleanup restoring its own closure's value put the playhead back to zero right
    after the pause had placed it. Measured: the paused playhead went backwards.
  - **The pane follows what is playing.** `previewAt` and `pressShown` are set in
    one update, because a playhead running along the axis of a press the reader had
    chosen to look at instead would be a clock timing something else.

- **The step inspector is a column.**

  It was a row, and the row had outgrown the screen: measured at a 1280 window,
  eighteen controls came to 1340px inside an 1100px box, so 삭제 sat 76px past the
  edge of the screen and the page grew a sideways scrollbar to reach it. The row
  was right when a step had four attributes. A column costs a row per attribute
  and never runs out of width, which is why every tool with sixteen of them has
  one — Premiere, CapCut and After Effects all put the clip's detail beside the
  strip rather than under it.

  Grouped by the question each group answers — 모션 · 타이밍 · 모양 · 대상 — with
  PowerPoint's own name for the timing one, because that is the naming a reader
  arrives already knowing. Two of the groupings say something true that the row
  could not: 반복 is in 타이밍 because a repeat is *more time*, and 단위 sits with
  잔상 because those are the two controls that multiply the number of repainting
  elements the cost note warns about.

  What the column then broke, and both were real bugs the row had been hiding:

  - **A popover in a scrolling column is clipped whichever way it opens.** So both
    — the colour picker and the curve — are placed in the *window* now, measured
    once drawn, flipped when there is no room, and clamped both ways. Which fixed
    something that was already broken: the colour field at the bottom of the pane
    used to open a 360px picker 260px below the window's edge, so its notation
    field could not be reached at all.
  - **A fixed popover does not move when its anchor scrolls.** Measured: the panel
    stayed where it was drawn, the button that opens it slid underneath, and the
    click that should have closed it landed on the panel. It follows its anchor on
    `scroll` (captured, because scroll does not bubble) and on `resize`.

  And the delay is typeable at last: it has always been in the document and only
  ever been *dragged*, which is exact to the pixel a reader can hit and no finer.

- **A trigger: a shape that is a button.**

  The third kind of start condition, and the first that is not about the sequence
  at all. `startsWith` places a step among the presses and every press is
  anonymous — a click anywhere advances. A trigger says **that shape**, out of
  order, as many times as it is clicked, or never. Which is what makes a quiz, a
  menu, or an explanation revealed on demand possible.

  A step carrying `on` has `group: 0` — outside the sequence — so every reader of
  the sequence skips it for free. Two of those readers had to be fixed, and both
  had been *right* until a step could sit outside the order:

  - **`pressCount` was the last step's group.** A slide whose last step waited for
    a click reported no presses at all, and the presenter's forward key left
    immediately. It is the highest group now.
  - **Press 0 is also "before the first press".** So asking what press 0 runs
    answered *every trigger on the slide*, and a shape waiting to be clicked
    animated the moment the slide arrived — measured, in the show. `stepsAtPress`
    excludes triggers; `stepsWaitingFor` is the other question, honestly named.

  **The behavioural question is the interesting one**, and only a browser answers
  it: a click on a slide has meant "next" since the first slide projector, and now
  one shape means something else. The show walks up from what was clicked to the
  innermost *watched* shape and fires it instead of advancing — because if the
  click did both, a quiz answer would advance past its own tick.

  **A trigger's animations are delivered beside the press, not inside it.** The
  stage rebuilds everything in `builds` whenever that object changes, so a firing
  folded into it would restart what the press had already run. Each firing carries
  an id — the step and a *count*, because clicking twice runs it twice — and the
  stage starts the ones it has not started and leaves the rest alone.

  Two true things the measurements turned up. **A button has to be there to be
  clicked**: a shape hidden until its own entrance is not hit-testable, so a
  trigger on it cannot fire until its press has run. And **two `addBoxBuild`s in
  one tick name both shapes `shape-1`**, because each reads the document before the
  other commits — the panel awaits between clicks, but nothing makes it.

- **The pane says what a press costs to draw.**

  §7b of the motion spec has sorted every animatable property into tiers for a
  week and the pane said nothing about them, so a reader could put a `filter`
  emphasis on the letters of a title and find out what that costs in front of an
  audience.

  **What is expensive is not the number of animations.** `opacity` and `translate`
  are composited; a slide runs dozens without a repaint. What costs is a property
  whose change makes the browser paint the shape again every frame — and the cost
  is per *element*, which is where the cliff is: one dropdown, 상자 전체 to
  글자마다, turns one repaint into forty-one. Measured in the app, and it is the
  number the pane now shows.

  **Overlapping, not existing.** Three filters one after another is three repaints
  in turn, which no machine minds; three at once is three times the work every
  frame. So the count is the busiest *instant* — and because an animation's cost is
  constant while it runs, the busiest instant is always at an edge, so no sampling
  is needed.

  **And no promised frame rate**, deliberately: it depends on the shapes' size and
  the reader's machine, neither knowable here. Four at once is a note, a dozen is a
  warning, and both say *what* is expensive rather than predicting milliseconds
  nothing measured. A trail and a text unit multiply, which is stated where it is
  counted.

- **SMIL: the filters CSS cannot reach, under the playhead.**

  `feDisplacementMap`'s `scale` and `feOffset`'s `dx` are XML attributes, so no
  Web Animation will ever touch them. SMIL can, and the question that had to be
  answered first was whether it could be *looked at* rather than only played.
  Measured, and yes:

  - `pauseAnimations()` + `setCurrentTime(t)` is **exact and repeatable** —
    `values="0;60;0"` gives 0/30/60/30/0 at the fifths, and the same moment twice
    gives the same value. So the playhead drives a melt as readily as a fly.
  - **`begin` counts from insertion**, so a step's delay is written into the
    `<animate>` and there is no second notion of "when".
  - **One clock per `<svg>`** — and this product already makes one `<svg>` per
    step, so every step has its own clock by construction.

  Two effects on it: 녹아 흐르기 (turbulence into a displacement map — the title
  warps like ink in water) and 색이 갈라지기 (the red channel pulled off the cyan
  one and back, small and fast, because an artefact that lasts is a mistake).
  Which mechanism an effect uses is said by whether it has `frames`, rather than
  by a flag that could disagree with its markup.

  **And a SMIL step has no Web Animation at all**, which the transport learned the
  hard way: pausing a melt read the moment from the animations, found none, sent
  the playhead to zero and made the filter disappear. The moment is read from both
  kinds of clock now — an `<svg>`'s clock measures the same thing `currentTime`
  does, because both start when the press does.

  One label collision, and it is worth knowing about: **프레임 now means two
  things** in this app — a shape that arranges what is in it, and 1/60 of a
  second. Two frame-step buttons broke a frame-tool test, because an accessible
  name is matched by substring unless it is asked not to be.

- **A transport, and the preview bug it found.**

  Play is also pause, a frame each way, back to the start, and the moment read to
  the hundredth. The model is what makes it small: **pausing is scrubbing.** The
  stage freezes what is running and reports the moment; the moment becomes the
  playhead; the preview ends. So a paused deck is a state the pane already knew
  how to draw, frame-stepping is *already* scrubbing, and play resumes from
  wherever the playhead is — one state rather than two.

  The moment is `currentTime`, which counts from an animation's own start
  *including* its delay, so it is the press-relative moment the playhead measures.
  The largest across the press's animations, because a step that starts late would
  otherwise report a moment before it began.

  **And building it found that a preview ended before the animation it was
  showing.** The end was a flat 600ms after the final press *began*, so a
  two-second build was previewed for eight hundred milliseconds and then snapped
  back. It surfaced as a transport bug — pausing at 800ms worked and pausing at a
  second restarted the preview, because there was no longer one running — which is
  the second time this week a new control has been the thing that noticed an old
  fault.

  One thing deliberately left: **the playhead does not run while the preview
  does.** It shows where a pause landed and where play will resume from, which is
  what the transport needs; a playhead that follows playback needs the stage to
  report every frame, and that is a clock rather than a control.

- **Filters as motion: a colour on a step, an SVG filter this product makes
  itself, and a reader who asked for less movement.**

  **`filter` is two vocabularies**, and the measurement that shaped the design is
  that they do not mix: `filter: url(#f) blur(0px)` → `blur(10px)` is **discrete**
  — a `url()` anywhere in the list stops the whole list interpolating. So the
  obvious arrangement (an SVG look on the shape, an animated blur on top) is
  impossible, and an SVG filter's animation has to run *inside the filter*.

  Which is affordable because `flood-color` and `flood-opacity` are presentation
  attributes — CSS properties — so the Web Animations API interpolates them with
  no second animation system. Measured: 0.1 → 0.9 gives 0.5 at the midpoint on the
  `<feFlood>` element, with the attribute untouched. An SVG effect therefore
  declares its markup and the frames for **one primitive**, and the stage makes a
  copy of the filter per step, animates it, and takes it away — the same shape as
  the echo copies and the per-letter spans. 빛이 번지기 is the first reader of the
  seam.

  **A step has a colour now**, which is the first value on one that is not a
  number, a name or a duration — and it exists because `filter` does:
  `drop-shadow` and `feFlood` both take one, and `currentColor` is only right for
  text. Offered by the same rule as the direction and the amount (the effect table
  declares which effects take one), it accepts a `theme:` slot so a glow can
  *follow* the deck's accent, and `null` clears it — `undefined` does not, because
  a merged undefined is dropped rather than written. Measured: the colour survived
  being cleared.

  **Five more filter effects**: 색이 돌기 (a full turn of the wheel, so a loop does
  not jump), 물들기, 뒤가 흐려지기 (`backdrop-filter` — the one filter that is
  about the *slide* rather than the shape), and the bloom. With 빛나기, 흐린 데서
  나타내기 and 흑백으로 사라지기 that is eight, from a property nothing used a week
  ago.

  **And `prefers-reduced-motion` is honoured.** A duty rather than a feature. Not
  "show nothing" — the shape still arrives, at the end of its animation
  immediately — and it falls out of the numbers: a duration of zero collapses the
  stagger, the trail and the path with it. The trail needs saying separately,
  because copies are not timing.

  Three faults on the way. The stage's guard was `frames.length === 0 → skip`, so
  **every SVG effect was skipped before it was reached** — its frames belong to a
  primitive, not to the shape. A test asserting "every preset produces frames" was
  asserting the *old* invariant and had to learn the new one. And Playwright's
  describe-level `reducedMotion` did not survive the project's device descriptor
  (measured: `matchMedia` was `false` inside the test), so the test emulates it on
  the page, which says what it means anyway.

- **The contents of a box, a trail behind a shape, a rubber band, and two more
  `filter` effects.** Four entries that were each a measurement away from being
  written, and the two that touched the *view* both found a fault only a browser
  shows.

  **A container offers its contents.** "Animate this group" means the group half
  the time and the eight cards in it the other half, so the panel says which:
  `안의 8개에 하나씩`, which is `addBoxesMotion` pointed at `boxesInside`. One
  level down, deliberately — a frame holding two groups of four is a reader who
  means the two groups, and they can point at a group when they mean it.

  **A trail is copies of the rendered element**, which is the same shape of answer
  as the per-letter split: a rendered thing no node describes, put back when the
  animation is. The document holds one number. Two things had to be got right, and
  both are about *where the copy lives*: appended to the shape's **own parent**, so
  every inherited style matches by construction (measured — same box, same
  box-shadow, same font), and wrapped in a positioned, inert box whose `opacity`
  does the fading, because an animation of `opacity` *replaces* an element's own
  value rather than multiplying it. And the spacing is derived from the duration
  (`echoGap`) rather than stored: eighty milliseconds behind a 200ms dash is a
  separate shape, and behind a two-second drift it is invisible.

  **The rubber band moved the thing it was measuring.** Rendered inside the
  scrolling track column, its appearance shifted the tracks up by 73 pixels — so
  every bar was compared against a band that was no longer over it and a sweep
  caught *nothing*. Measured: the tracks' top went from 725 to 652 between the
  pointerdown and the first move. An overlay belongs at the top of the pane, which
  is the rule the selection overlay already follows one component up.

  **And its test looked for the spread along the wrong axis.** The trail was
  compared by `x` while the motion flew *upwards*, so it waited three seconds for
  a spread that was all in `y`. Distance from the shape is the claim worth making,
  and it is the one that survives the preset changing.

  **`filter` has three readers now**: `glow`, `blurIn` (a focus pull — the eye
  reads focus more slowly than brightness, so 800ms rather than 300) and `grayOut`
  (colour first, then the shape).

- **Multi-select, a motion clipboard, a path drawn by hand, and the presets the
  reference tools have.** Four entries, and the last of them found the two the
  others had been waiting for.

  **A bar's selection is a set.** Shift-click adds, and the arrows, the drag, the
  length field and Delete all act on every selected bar — one transaction each, so
  six motions moved together take one undo. The row says `2개 선택` rather than a
  shape's name, because the controls beside it write to all of them.

  **Shifting several bars is not "add to each delay".** `withPrevious` measures
  from the *previous step's start*, so adding 100ms to two chained steps moved the
  first by 100 and the second by **200**. The delta goes onto what a reader sees —
  the start — and comes back as a delay through the same rule `withTiming` reads
  (`shiftedDelays`). The browser test read it off the bars.

  **And `slideAt` cannot find a step's slide.** A step lives in a `motionTrack`
  inside `resources`, beside the document — so walking *up* from it finds no
  surface, `slideAt` answered `undefined`, and a multi-bar drag silently did
  nothing. The link runs the other way: a slide names its track by `trackId`.

  **A motion travels between shapes** through `motionValues` — the effect, the
  length, the curve, the options — and pointedly *not* what it names or when it
  starts, because those are facts about a step's place rather than about the
  motion. Buttons rather than Ctrl+C/V: those keys belong to the deck, and one
  pair cannot mean two things depending on where the focus happens to be.

  **A path can be drawn by clicking the slide**, and while that mode is on a click
  is a *point* — including a click on a resize handle, which is the part that had
  to be measured: the handles sit over the middle of the selected shape, so one
  click in three was being swallowed.

  **A path can turn sharply.** Every path was smoothed through its points, which
  drew the zigzag preset as a *wave* — the one shape of travel that is entirely
  about its corners. The flag travels with the points, because a zigzag with
  rounded corners is a different route rather than a different drawing of one.

  **The preset list doubled, from reading the reference tools.** Canva, Figma and
  CapCut come to about thirty names for a dozen ideas; most of them this table
  could already say (Typewriter is a letter unit with a 55ms beat; Baseline is a
  word-unit wipe upward; CapCut's whole *loop* category is `repeat: 0`). **Three
  it could not**, and they became effects: `slamIn` lands from *bigger* (`grow`
  only ever arrives from smaller), `drift` moves one way and stays there (`nudge`
  comes back, which is what makes it a shake), and `glow` is a `filter` — the first
  reader of tier two in this product, closing a backlog entry that said so.

  **A test that pinned a table's length was a test of the table.** Asserting
  exactly six combination tiles made *adding a preset* a failing test. A lower
  bound and the tile the test is actually about is the assertion that survives the
  table growing — which it did, twice, in the same afternoon.

  **And the joining-script guard went in as insurance**, at ten lines: a letter
  unit on Arabic, Devanagari or Thai is served as a *word* unit, because letters
  drawn disconnected are not a different style but the wrong text. No deck this
  product ships can reach it; the first one that could would have reached it
  silently.

- **A timeline that magnifies, snaps and takes the arrows; a motion given to
  several shapes at once; and combinations.** Three entries that turned out to be
  one piece of work, because all three needed the composite that landed with
  them.

  **The axis magnifies.** At 4× a 300ms step is 120 pixels of bar rather than 30,
  and a two-frame delay is a thing a reader can see and drag. The first version
  divided the *span* by the magnification, which was wrong in a way only a
  measurement showed: at 4× the axis covered 500ms while a 1200ms bar was still
  240% of it, so the bar ran off the end of the ruler into a region with no ticks
  and the pane scrolled further than the clock went. Magnifying is a fact about
  *drawing* — the same time over four times the pixels — so it belongs in the
  lane's width and nowhere near the arithmetic.

  It also found a six-pixel lie that was already there: the ruler's margins and
  the name column were two hand-tuned numbers that had drifted apart, so a tick
  was never quite over its bar. Both read `--sl-labels` and `--sl-tail` now.

  **Bars snap** to zero, to the playhead, and to the other bars' edges, with the
  guide drawn where they caught — feeling a bar stop is not the same as knowing
  what it lined up with. The tolerance is eight *pixels* converted to
  milliseconds at the point of use, so snapping is as sticky at 4× as at fit.

  **The arrows nudge** the focused bar: 10ms, 100ms with Shift, resize with Alt.
  Two faults on the way. A bar could not be focused at all, because the drag's
  `preventDefault()` is what stops the browser focusing it — measured,
  `document.activeElement` was the body after a click. And the *overlay's* key
  handler swallowed every arrow: it listens in the capture phase and stops
  propagation so it beats the editor's key map. Restating its rule as "only when
  the focus is on the slide" broke three other tests, because **focus stays on
  whatever chrome button was clicked last** while the reader is plainly working on
  the slide. The rule that holds is the narrow one: the chrome owns its keys
  exactly where it *has* keys — a field, and the timeline pane.

  **One motion on several shapes, a beat apart** — "apply to all", and it writes a
  step *per shape* rather than one step naming three. The model already says it,
  and each shape then has its own bar to drag rather than a group to dissolve to
  get at the third one. The e2e caught the arithmetic: `withPrevious` means "with
  the step *before* this one", so writing absolute delays made three shapes start
  at 0, 200 and **600**. The gap is what a step stores; the accumulation is the
  timeline's.

  **Combinations** — 올라오며 커지기, 밀려오며 돌기 — are the presets this model
  could not hold last week, since a second motion on one shape used to lose
  silently. A combination is a list of ordinary preset ids and writes exactly what
  picking each of them by hand would write; no combination pairs two *turning*
  effects, because two additive rotations end at zero.

- **Two motions at once, and a path to travel.** The two things a professional
  timeline is for, and both of them started as a measurement that contradicted
  this repository's own spec.

  **A second motion on one shape used to lose silently.** Two animations of the
  same property are `replace` by default — newest wins — so a fly and a grow at
  one moment produced only the grow. `composite: 'add'` fixes it, and measured, it
  does not mean the same thing for every property: translates add (percentages and
  pixels alike), scales *multiply* (2 × 2 = 4, which is the meaning anybody wants),
  opacities add, filters concatenate their function lists. Which step adds is the
  timeline's answer, because only it knows what overlaps what: within a press, for
  one shape, the first replaces and every later overlapping one adds.

  **`rotate` is the exception, and it is a browser fault.** Two additive `rotate`
  animations in Chromium interpolate as 90·t·(1−t) — they rise, fall and **end at
  zero**, so a shape turns and then untwists itself. Measured at four points
  against a single animation's 22.5°/45°/90°. Additive rotation over a *static*
  rotate is correct, so the fault is specifically two animations. A turning step
  therefore stays `replace` and the bar *says* it clashed: two bars that quietly
  cancel each other is the worst version of this.

  **A bar had to become a lane.** A shape with two motions at one moment is two
  bars at one moment, and the track was 24px tall — the second bar drew outside
  the row, where a reader could neither see it nor grab it.

  **And the path spec was wrong.** `motion-model.md` §5 said a path would collide
  with `translate` and would have to own the slot. Measured: the offset transform
  is its own slot — it does not appear in the computed `transform` or `translate`
  at all — so a shape travelling a path can also fade, pulse, grow and keep the
  rotation the document gave it. Four of them measured together.

  So a path is a *kind* of step for a smaller reason than the one first given: it
  needs a **style written before the animation** (`offset-path`), and no effect has
  a prerequisite. The document holds **points in twips relative to where the shape
  rests** rather than a `path()` string — a path has to be editable, and a parser
  for the SVG path grammar is a liability for a feature that only writes lines and
  curves. `(0, 0)` is "where it already is", which needs the path shifted by half
  the shape, because `offset-anchor` puts the element's *centre* on the path while
  the path's origin is its static top-left. Measured: a 40×40 box at (100, 200)
  with a path from `0 0` drew at (80, 180).

  The path is drawn **on the shape** — a route across a slide cannot be edited as
  numbers — with a dot per point to drag, a half-dot between each pair to add a
  bend, and a double-click to remove one. Six presets, each drawn as the path it
  is, because a chip travelling 4800 twips inside a 28-pixel tile is a chip that
  leaves the tile.

- **A deck that leaves the app and comes back.** 저장 writes a
  `{ format, version, savedAt, document }` file the browser downloads, named after
  the words on the opening slide; 열기 reads one, and refuses four ways with the
  sentence a reader needs rather than the one a parser produces.

  **The sids are stripped, and that is a fortnight-old decision being paid off.**
  A sid is `session:counter`, so a file that kept them would be unloadable in the
  session that wrote it. Stripping them is only *safe* because nothing in a deck
  points at a node by sid: a build names its shape by a name the shape carries, a
  slide names its layout by `layoutId`, its track by `trackId`. That was decided
  when the first build was written, for exactly this reason, and this is the first
  code to depend on it. The test loads the file into a session with no sid in
  common and the letter-by-letter animation still finds its title.

  **Opening is the one gesture in this app that can lose work**, because a new
  document takes the history with it — so it asks, and only when there is
  something to lose. And the file's name is read from the *title text* rather than
  from the slide's `name`, which is "Title" in the sample deck and a filename
  nobody chose.

- **Text by the piece: a title arriving a letter at a time.** A build gains a
  `unit` — 상자 전체, 문단마다, 단어마다, 글자마다 — and a `stagger`, and the
  stage splits the renderer's output at play time, staggers the delays, and puts
  the text back when it ends. Two presets came with it (글자마다 나타내기,
  단어마다 나타내기) and needed nothing but a row in the table.

  **The spec asked for a kind and an option would do.** `motion-model.md` §7 said
  this needed a `text` *kind* of step. It did not: every one of the twelve effects
  works on a piece of text exactly as it works on a box, so a kind would have held
  a second copy of the whole effect table. The test for the next one — a path, a
  paint, a camera — is whether it needs the effect vocabulary to *mean* something
  different. A path does; letters do not.

  **A transform is ignored on an inline box.** Measured: `translate` and `scale`
  do nothing at all to a `display: inline` span, so a letter that flies has to be
  `inline-block` — and inline-blocks let a line break *inside a word*, which is
  text that reflows the moment it animates. The fix is a second wrapper: the words
  become `inline-block; white-space: pre` holders and the letters sit inside them,
  so the break opportunities stay at the spaces. Measured after: same line count,
  same box width, to the pixel.

  **A space is not a beat.** Fading in a gap is invisible and spends a beat of the
  stagger doing it — so a space is drawn and never animated, and the *timeline*
  has to count pieces the same way or the bar is wider than the animation. It was,
  by three letters on a four-word title, and the total said 0.3초 for an animation
  that took 1.3.

  **The caret's block is off limits.** The editor's MutationObserver is scoped to
  the block the caret is in, and everything outside it is "our own writing, by
  definition" — so splitting the text of the box being typed in would be read back
  as an edit. A box holding the caret animates whole, which is an e2e test of its
  own.

- **A spring, which is the one timing a curve cannot say.** A bezier overshoots
  once; a spring passes its destination, comes back past it and settles over
  several diminishing swings. The document holds `spring(180, 9)` — two numbers,
  adjustable — and the curve panel grows a second half: the sampled curve drawn
  as a polyline, two sliders, and the spring's own settling time offered as a
  button.

  **`linear()` made the hard version unnecessary.** The first design resampled
  the effect's keyframes, which needs an interpolator for `translate`, `scale`,
  `rotate`, `clip-path` and colour in this repository forever, beside the
  browser's own. CSS's `linear()` easing *is* a curve given as samples, so a
  spring is sampled into one and **nothing else in the product changed** — same
  frames, same duration, same string in the document. Measured first: a
  `linear()` with a 1.4 point moved a box 140px at its halfway mark, so the
  overshoot is real rather than clamped, and 120 stops are accepted.

  **The sample count comes from the ringing, not the length.** `linear()` draws
  straight lines between stops, so a bouncy spring needs 96 of them and a
  critically damped one 24 — and the last sample is *made* exactly 1, because a
  spring approaches forever and `fill: both` would leave the shape a hairline off
  where the document puts it, permanently.

  **A spring implies a length, and does not get to set it.** The bar's width is
  the reader's; the panel says "자연 길이 1.54초로" and lets them ask.

  The panel it first drew reused the bezier's viewBox, which reserves seventy
  units above the bed for a *handle* — a spring has none — so the popover was
  tall enough to be clipped by the top of the pane and the curve was drawn off
  screen. It looked like sliders with no picture.

- **Motion presets: a whole motion under a name, and a tile that plays it.**
  Thirteen named motions — 부드럽게 올라오기, 톡 튀어나오기, 두 번 두근거리기 —
  each of them an effect, a length, a curve, a direction and an amount. The
  gallery is the *adding* gesture in the 모션 tab, and a tile **runs the motion it
  promises** on a chip when you point at it, through the same `framesFor` and the
  same easing the slide will use. Anything else would be a second implementation
  of the effect table, and a preview that lies is worse than none.

  **A preset that is stored lies on the second edit.** The tempting model is an
  attribute — `preset: 'rise'` — and it is wrong the moment a reader drags the
  bar a little longer: the document says `rise` and means something else. So a
  preset *writes and disappears*, and the panel answers "which one is this?" by
  comparing values (`matchingPreset`). A step that was nudged reports 직접 설정,
  which is the truth. Same rule as the paints, and as the direction that came out
  of the effect's name: **one vocabulary, and the document holds values.**

  **`repeat` has to be written even when it is 1.** A step already beating twice,
  given a preset that does not repeat, has to *stop* — and a value left out of a
  patch is a value left alone. The only preset default that is written explicitly,
  for a reason that only appears on the second preset applied to one step.

  **A comment that promised something the code did not do.** `_stepChanges` said
  it checked an effect's options against *the effect the step has*; it checked
  only that the value was a legal direction. Nothing noticed until a preset
  applied a bundle of five values over another effect's five and left a direction
  on a flash. The fix had its own trap: `takes` missing means *unknown effect,
  accept*, and `takes.direction` missing means *the effect says no* — two
  different absences, read as one, and the test caught it.

  **One label meaning two things.** The 속성 tab's 효과 추가 is a shadow and the
  모션 tab's was a build, in one panel; the motion one is 모션 추가 now, which is
  also what a tile actually is.

- **A gradient aimed on the shape.** The angle was a number in a box, and nobody
  aims a gradient by typing 135 — they point at the corner they want it to come
  from. The axis is drawn on the slide while the fill's row is open: a line, a
  dot per stop, and a handle at the far end that turns it.

  **The line is CSS's line, not a guess at one.** A linear gradient runs through
  the box's centre for `|w·sin a| + |h·cos a|` — the length that puts the end
  stops exactly on the corners the direction points at — so a stop dragged to the
  end of the drawn line is a colour that stops *there*. That formula is why this
  is a tested module rather than four lines in the overlay: being wrong by a few
  per cent looks like nothing on screen.

  Three bugs, and the third is the interesting one.

  The aim handle sits exactly where the south resize handle does, so the drag
  resized the shape instead — two handles the same size in the same place, one of
  them simply in front. Drawn after them now.

  A `useMemo` below the early return blanked the app for the **second** time in
  this session, so the boundary now carries a line saying no hooks below it. Both
  times the calculation was put next to the thing it is drawn beside, which is
  exactly where it reads best and cannot go.

  And the panel's editor dismisses itself on a pointer outside it, in the
  *capture* phase — so it closed the editor and unmounted the handles **before
  React's own pointerdown reached them**. The handle was the topmost element
  under the pointer, a native listener saw the event, and the drag did nothing at
  all. The fix is the idea rather than a special case: the panel row and the
  canvas handles are *one editor in two places*, and the canvas half says so with
  `data-paint-canvas`.

- **A stack that is one: an order, an image, and a blend.** Three entries closed
  by the same property of the model — the list took all of them *without
  changing shape*, which is the whole argument for having made it a list.

  **The order can be dragged.** A stack is an order — which fill is over which,
  which shadow is drawn first — and the only way to change it was to delete a row
  and add it back, losing everything about it. Pointer-driven rather than the
  browser's drag-and-drop: a list that only moves when you let go is a list you
  have to aim at.

  **A picture is a fill.** Which is where the CSS gets interesting: a layered
  background is *four parallel lists* — the images, their sizes, their repeats
  and their blend modes, matched by position — so writing `background` alone is
  how an image ends up tiled at its natural size beside a gradient that ignores
  it. And `background-image` has no alpha, so a translucent photograph is drawn
  as the picture with a transparent wash over it: one paint in the model,
  **two** entries in every one of those lists, which they all have to agree
  about.

  **A blend mode, in CSS's own names**, because they are also Figma's and
  Photoshop's — one of the few vocabularies the whole industry already agrees on,
  and renaming it would be this product inventing a dialect. It lives in the
  paint's editor rather than its row: it is the setting touched least, and it
  only *means* anything when there is a layer beneath, which is the moment a
  reader is in there arranging them.

- **The panel a designer can work in.** Nine UI changes, and the four that
  mattered were all the same shape of fault: *the model could say more than the
  panel could ask for.*

  **Fills and effects are stacks now** (`paints.ts`). A shape had one fill and
  one shadow spelled out as flat attributes, which cannot say a photograph tinted
  by a colour over it, or a card with a soft shadow *and* a hard key line — the
  first two things anybody does in a design tool. The schema already took
  `type: 'array'`; the alternative was `fill2`, which caps the count and cannot
  reorder. Every deck already written keeps meaning what it meant: a shape with
  no list is read *as* a list of one, on every read, and gains a real one the
  first time a reader edits it — at which point the flat attributes it supersedes
  are cleared, because a document holding both would have two answers to one
  question.

  **A gradient is a bar with stops**, dragged, double-clicked to add, with a
  position and an angle — where the model held two ends and the panel held four
  rows. **A colour is chosen in a real picker**: saturation and value, hue, alpha,
  hex, and the eyedropper where the browser has one. Opacity is half of every
  fill in a real design and neither the OS dialog nor a hex string can express
  it.

  **The panel has tabs**, because a shape's two kinds of answer — what it *is*
  and what it *does* — are used at different times, and nine sections in one
  column made the motion half something a reader scrolled past. Sections are
  divided by a rule with a header that can hold an action, which is where "add a
  fill" belongs.

  **The timeline moved to the bottom of the window**, across the whole width. It
  had been inside the stage's column, at the same level as the presenter's note —
  a *slide's* text — which gave a left-to-right instrument half the width it
  needs.

  **A box being typed in is outlined.** While a reader is in the text the overlay
  goes inert, and that meant nothing at all was drawn: on a slide with two
  transparent text boxes there was no way to tell which one the keystrokes were
  going to.

  Three faults found on the way, each caught by something other than looking.
  A `useMemo` written below an early return blanked the whole app — a component
  whose hook count changes with its props — and it was written there because that
  was the tidy place for it. `addBoxBuild` defaulted every new motion to
  `afterPrevious`, so two shapes given one effect each animated together; a test
  said two shapes must take two presses. And a theme slot inside a fill did not
  resolve, because `resolveThemeAttrs` walked only the top level — a reader could
  pick a theme colour and watch the shape lose its colour entirely.

- **A pane the reader sizes, and a repeat that is finally read.**

  The timeline was a fixed 40% of the window, always open. A timeline is looked
  at *while* the slide is — a reader arranging when things happen keeps glancing
  up — so how much of the window each gets changes with what is being done: one
  bar wants a strip, eight tracks want half the screen, and writing text wants it
  gone. It drags from its top edge and folds to a labelled strip, and both are
  the app's state, because how a reader has arranged their window is not a fact
  about the deck.

  **`repeat` was declared in the schema beside the easing and read by nothing**
  — this repository's own favourite fault, made fresh a day earlier. It is one
  field on the animation's timing (`iterations`), and `0` means *until the slide
  moves on*: a count of zero is not a thing anybody can mean by "how many times",
  so it is the one unambiguous way to say "no count" in a number, which is what
  PowerPoint's own repeat does too.

  The arithmetic had a hole the screen would have hidden: `withTiming` ended a
  step after one pass, so a step set to run *after* a pulse that beats three
  times started two beats early. A unit test found it, which is the reason the
  timing is arithmetic and not a rendering detail. An endless step counts as one
  pass for sequencing — otherwise whatever follows it never runs, and the slide
  stops.

- **An effect, and its options.** `flyInLeft`, `flyInRight` and `flyInUp` were
  three effects. Eight directions across six entrances is forty-eight names for
  six ideas — and worse, a reader who had set a duration, a curve and an order
  and then wanted the shape to come from the other side would have been changing
  *which effect they chose*, losing all three.

  So an effect is **what happens** and its options are **which way and how
  much**: `fly` with `direction: 'right'`, `grow` with `amount: 0.8`. Each effect
  declares which options it takes, and a panel offers exactly those — a direction
  on a flash is a control that changes nothing, which is the same rule the
  properties panel already follows for a shape's attributes. PowerPoint stores
  the identical shape: a preset, and a subtype.

  **The old names still read.** A deck written last week says `flyInLeft`, and it
  resolves to `fly` *carrying* `direction: 'left'` — one table, read every time,
  rewriting nothing. A deck that silently changed on being opened would be the
  worst outcome of a refactor like this, so the fallbacks are tested by name.

  The sign that reads backwards, written down because it is wrong in every
  implementation of this: an entrance comes **from** the direction it names and
  an exit goes **to** it, and a wipe's `inset` names the side that is *hidden* —
  revealing from the left insets from the right.

- **The timeline, properly this time.** The first version was a list of rows in
  order with numbers for the timing, which is PowerPoint's animation pane — and
  it was shipped as "the timeline", which it was not. Measured against Canva,
  CapCut and Figma, four things were missing, and every one of them is the same
  thing: **time has to be a dimension you can see and drag, not a number you
  type.**

  - **A track per shape.** A shape that appears, is emphasised while it is talked
    about and then leaves is *one row of three bars*. A flat list says three
    unrelated things — and `setBoxBuild` replaced rather than appended, so a
    shape could not have three motions at all. `addBoxBuild` appends, defaulting
    to `afterPrevious` because a second motion on a shape almost always follows
    the first.
  - **Bars on an axis.** A bar's left edge is when it starts and its width is how
    long it takes; dragging it sets the delay, dragging its edge sets the
    duration. `delayForStart` is the conversion — the moment is the reader's and
    the delay is what the document holds.
  - **A playhead.** Dragging it seeks every animation of that press and *holds*
    them there, which is a thing a CSS transition cannot do at all: it has no
    moment you can ask for.
  - **A curve.** Every step in the product ran `ease`, because the word was in a
    template string in the renderer. Six presets and a draggable cubic-bezier,
    the control Figma and After Effects put in the same corner of the same panel.

  **All of it followed from replacing the transition with the Web Animations
  API.** A transition has two ends, so an emphasis — out and back — could not be
  expressed; it has no easing a document can carry; and it has no `currentTime`,
  so nothing could be scrubbed. Keyframes are what WAAPI takes, so effects became
  a table of them: a name, a category, and what it animates. The old vocabulary
  — `buildMotion`, `buildGroups`, `hiddenUntilBuilt` — was **deleted** rather
  than left beside the new one: two ways to ask what a slide animates is two
  answers to keep in agreement, and the second only has to be wrong once.

  Two bugs that only a pointer could find, both of the same kind — a control that
  is *there* and cannot be used. An overshoot preset puts its handle above the
  unit square, and the curve's viewBox stopped below it, so choosing `backOut`
  and then adjusting it grabbed nothing. And the pane scrolled as a whole, so the
  curve panel — which opens upward from the bottom row — was clipped by its own
  container: the handle had a position, and the pointer landed on the scroller.

- **The timeline: a slide's steps as one list.** Three entries in the backlog
  pointed here, which is how you know it was one piece of work and not three. A
  shape could be given an effect from a dropdown and nothing else — no order, no
  timing, no way to run two together, and no way to make a film part of the
  sequence at all — and every one of those is a property of *the slide's list*
  rather than of any one shape. A per-shape control could never have grown into
  them.

  **One list, two kinds of step.** A build animates a shape and a `play` step
  starts a film; to a presenter they are the same thing — press, and the next
  thing happens — so they are one list and the presenter's key does not have to
  know which it is about to run. The document's vocabulary did not change: the
  track already held both shapes of step, and this reads what was always
  expressible.

  **The presses are computed, never stored.** Which press runs a step is the
  consequence of the `startsWith` values before it, so it is recomputed on every
  read — a stored group number would be a second place saying the same thing, and
  the two would disagree the first time a step moved. The number is drawn once
  per group, so the list says how many presses the slide takes rather than how
  many steps it has.

  **A step whose shape was deleted is kept and labelled** — "없는 상자" — because
  dropping it would hide the fault: a reader whose presses are one out should be
  able to see the leftover and remove it.

  **미리 보기 plays it in the editor**, through exactly the same code the show
  uses. A preview of something else is the one thing it must not be, so the
  build state is one calculation with two callers rather than two calculations.

  The pane found a lag nobody had noticed: the zoom box read its number from a
  400ms interval, so when the pane took room from the stage the box said a number
  the screen had already stopped drawing — caught as 60 against 59. It watches
  the slide's own box now. And a snapping test that asserted an exact screen
  pixel at a particular zoom had to say "to within a pixel", which is what it
  always meant.

- **A film and a sound come back, with their readers.** `mediaVideo` and
  `mediaAudio` were taken out of the office schema the day it stopped declaring
  what nothing drew — fifteen node types with no renderer between them — and they
  return the way that rule requires: a renderer, a command, a control.

  The harness enforced it twice on the way in, both times within a minute. It
  refused the schema until there were renderers. Then it refused a single
  `insertMedia({ kind })`: a command named as though it puts a node in the
  document has to say *which* node, and "it depends" is the answer that check
  exists to refuse. So `insertVideo` and `insertAudio`, which is what the
  standard schema's own media commands are called anyway.

  **`data-autoplay`, never `autoplay`.** A real `autoplay` starts the film the
  moment it is *drawn*, and it is drawn in the editor — a deck with three films
  would begin playing all three the moment it opened, and again after every
  keystroke that redrew one. What a document means by autoplay is "start when
  this slide comes up in the show", which is a fact about presenting, so the
  stage starts them and stops them: paused and rewound on the way out, because a
  film left playing on a slide nobody is looking at is a voice from an empty
  room, and one left half-way through starts in the middle next time.

  The test for that measures `play()` and `pause()` rather than `paused` — a data
  URI with no frames in it never leaves the paused state however hard it is
  asked, so `paused` would have measured the fixture's codec instead of the
  product's decision.

- **Applying a theme, and the control that made a slot writable.** Choosing a
  theme re-colours every shape that *follows* the deck and leaves alone every
  shape that chose its own colour — and "keeping what a slide overrode", which
  the backlog had written down as the hard half, turned out to be nothing to
  implement. It is what naming a slot already means. The test says so rather than
  the comment: one shape on `theme:accent1` moves with the theme, one shape on
  `#111111` does not, and the first one's document never changes.

  **The panel could not write a slot at all.** Every colour control was an
  `<input type="color">` — the browser's dialog, which can produce a hex string
  and nothing else — so a slot could be read from an imported document and never
  chosen in the product. Radix has no colour primitive (it stops at behaviour;
  a picker is a canvas), so the field is `react-colorful` — 2.8kB, no
  dependencies — inside the same pointer-driven panel the toolbar's palette
  already uses, with the theme's slots above the standard row. A slot is drawn as
  the colour it resolves to and *labelled* with its name, because two shapes the
  same blue are a coincidence and two shapes on accent 1 are a decision.

  And it answered the question the master had left open, which a badly-written
  test had failed to ask: **changing a resource does redraw the slides that
  follow it.** Measured — applying Ember repainted a rectangle from
  `rgb(37, 99, 235)` to `rgb(234, 88, 12)` while its own `fill` stayed
  `theme:accent1`.

- **A theme, so a colour has a name.** A shape's fill is a hex string, so a deck
  built by hand has that string copied onto forty shapes — and re-colouring it
  means finding all forty, including the ones on the slide nobody scrolled to.
  Twelve colour slots and two faces, by the names PowerPoint's own format uses.

  **A slot is written where a colour goes**: `fill: 'theme:accent1'` beside
  `fill: '#0ea5e9'`, not a second attribute. Two attributes would mean every
  reader checking both and deciding which wins, and a document carrying both is a
  document with no answer. The prefix is what makes it safe — no CSS colour can
  begin with `theme:`, so nothing that is already a colour changes meaning, and a
  slot the theme cannot fill resolves to *nothing* rather than to black: a deck
  from a tool with more slots should lose the colour it cannot express, not gain
  one nobody chose.

  The sample deck was rewritten to prove it rather than to show it off: two
  shapes name slots, the master's faces are `theme:major` and `theme:minor`, and
  the deck's own hex for its accent appears exactly once — in the theme.

  What this cost, and it is the second time in two items: **an attribute function
  cannot see the environment**, and the environment is where the document lives.
  Eight renderers became function templates to resolve a slot at all. And a
  render test had been mounting a view with *no* environment — so it drew a
  rectangle with no fill and reported it honestly, which is not what the product
  does; it builds `createDeckEnv` now, like the stage, the notes pane and every
  thumbnail.

- **A master above the layouts.** Without one, every layout repeats the deck's
  background and the deck's idea of what a title looks like — and two layouts
  that disagree about the title's font are a deck with no design and no way to
  tell which of the two was the mistake.

  It is **one more level in the cascade that already existed**, not a second
  mechanism: master, then layout, then the node, matched by *role* at every level
  and never by position, for the reason the layout resolver already gives — a
  slide that has moved or deleted a box would otherwise be formatted from
  whichever placeholder happened to be third. A layout with no master resolves
  exactly as it did, which is what every deck written before this keeps doing.

  The background comes down the same chain — slide, layout, master — and that is
  the half a reader sees first: one place now says what colour this deck is. The
  sample deck was rewritten to prove it rather than to demonstrate it: its
  layouts no longer name a font at all, and its titles are still set in Georgia.

  Two things this turned up. The `surface` renderer had to become a function
  template to see the environment at all — an attribute function is handed the
  node's data and nothing else, and the document a master is looked up in travels
  on the environment. And a test written to pin down what happens when a master
  *changes* was measuring its own mistake: `setAttrs` is an operation, not a
  command, so `executeCommand('setAttrs', …)` changed nothing and the test passed
  by asserting the colour had not moved. It was deleted rather than kept as a
  green test of nothing, and what it was trying to ask is in the open list.

- **The presenter's screen.** Presenting showed *the audience's* screen — the
  half a projector needs and the half a presenter cannot use. Everything added
  here was already in the document: the next slide, the note the author wrote,
  and how far through the deck they are. The clock is the only thing on it that
  is a fact about this showing rather than about the deck, so it is the only
  thing the app remembers.

  **The next slide is a thumbnail and the current one is not.** The slide the
  audience sees stays the one the editor is already drawing, made smaller by CSS,
  because presenting from a second render would mean two drawings of one deck
  that could disagree. The next slide has no such drawing to reuse — it is the
  slide that is *not* on screen — so it is the rail's `Thumbnail`, which already
  knows how to draw a slide small without re-laying it out.

  The surprise was one word of CSS. The panel was given room with
  `padding-right`, and the stage fits its slide to the room it is drawn in by
  re-measuring on a `ResizeObserver` — which watches the element's *box*. Padding
  changes the room inside a box of the same size, so the observer never fired and
  a third of the slide sat behind the panel: 1280 pixels wide before, 1280 after.
  A margin changes the box, and the fit followed.

- **Builds, and the name a shape had to be given.** What happens *on* a slide,
  in the order a presenter clicks through: seven effects on the same track the
  transition uses, one step per build, grouped into presses.

  This is where the question a transition let us postpone had to be answered.
  **A step cannot hold a sid.** A sid is `session:counter`, handed out at load in
  document order, so a stored one points at a different shape the moment a slide
  above it gains a box, and at nothing at all in another session — the presenter's
  note taught this the expensive way, having been written the other way round
  first. So a shape being animated is given a `name` it keeps: `shape-1`,
  readable in the file, assigned in the *same transaction* as the step that needs
  it, so a name is never written for a build that failed to be made and a build
  never names something that was not named. A shape nobody animates carries
  nothing.

  The surprise was in the app, and it was one line of consequence from a comment
  Word had already written down. `addChild` says where the caret goes afterwards
  — into the node it just made — so choosing an effect turned a node selection on
  a box into a caret inside the `motionStep`, and the properties panel went back
  to showing the slide *while the reader was using it*. Both motion commands now
  commit through one helper that puts the selection back; the transition had the
  same fault and no test had caught it, because the transition's panel is the
  slide's.

  Two things only the screen decides, both about giving things back. A press
  plays the next group and does **not** leave the slide until every group has
  played — that is what a build is for. And every shape is restored when the show
  ends: a shape left `visibility: hidden` by a build nobody finished would be
  invisible in the editor afterwards, present in the document and impossible to
  find.

- **Time, and where it lives.** The first thing in this product with a
  *duration*. The decision was made and written down in
  `docs/specs/canvas-model.md` §4 long before anything needed it — precisely
  because it is the one that would have been expensive to make by accident — and
  this is the first reader, so this is where it was finally declared: a
  `motionTrack` resource holding `motionStep`s, named by the slide the same way
  the presenter's note is. A node that knows nothing about animation can still be
  animated, and a deck with no motion holds no track at all.

  **A transition names nothing**, which is why it could ship first: it is the
  whole slide arriving, so the hardest question a track raises — how a step names
  a *shape*, when a sid cannot be written into a saved document — did not have to
  be answered to get motion into the product. `motionStep.target` is declared and
  read by nothing, and that is written down in the open list rather than counted
  as finished.

  **`none` deletes the step** rather than storing the word. A document that says
  a slide has no transition and a document that says nothing are the same
  document, and keeping the second shape means every reader has to know both.

  Two things only the screen decides. The transition plays **in the show and not
  in the editor** — a deck is edited by clicking through it, and a slide that
  faded in on every click of the rail would feel like buffering. And the slide is
  **put back** afterwards, whatever ends the transition: an inline transform left
  behind by a presenter who moved on faster than the duration would move every
  handle on that slide for the rest of the session.

- **Letting a box go, and who was told.** "Neither Escape nor a click on empty
  stage deselects" had been written down as a missing gesture, and it was not
  one: both already cleared the model's selection. `editor.selection` was `null`
  while the properties panel went on offering the shape's position and the
  overlay went on drawing handles around it. **Nobody heard the clear.**

  A selection that *is* something announces itself on `editor:selection.model`; a
  selection cleared announces itself on `editor:selection.change` and on nothing
  else. The deck's overlay, panel and ribbon listened to the first alone — three
  components, one line each, and the reason the item read as a missing feature
  for a week.

  A second Escape handler was written before that was measured, and taken out
  again: the key map already had the branch, ordered so that one press comes out
  of a container *or* lets the selection go and never both. The habit of
  measuring before building is what stopped that from shipping as a key that did
  two things at once.

- **Four corners, and the boxes that had none.** One `cornerRadius` for all four
  corners is a diagram's vocabulary; a card with two rounded corners at the top
  and square ones at the bottom is what a designer asks for, and Canva, Figma and
  Keynote all give four numbers.

  The surprise was the other half. `cornerRadius` was declared on `rectangle` and
  read by the rectangle's renderer, and by nothing else: a text box, a frame, a
  sticky and a picture could not be rounded **at all** — and a rounded text box
  is what half the cards in every template are. The corners went into
  `deckPaintCss` beside the fill and the shadow, which is where "what this box
  looks like" belongs, and every box that declares them got them in one line.

  **Unset, not zero.** A corner with no number of its own follows `cornerRadius`,
  so the single field still rounds the whole box and the four are an override.
  That is why they are declared `required: false` rather than `default: 0`: a
  default would have written four zeroes nobody asked for over the radius the
  document does carry, and it would have looked like the schema working.

  A test had to change with it, which is the honest kind of churn: the check that
  a shape refuses an attribute it does not declare was written with
  `cornerRadius` on a text frame, and a text frame has corners now. It asks with
  `layoutMode` instead — a frame's, and a frame's alone.

- **Cropping a picture.** The deck could put a photograph on a slide whole or
  not at all: `picture` declared `fit`, which nothing could set, and there was no
  crop at all — the most-missed thing in every tool this product is measured
  against, where cropping is not an effect somebody goes looking for but what
  putting a photograph on a slide *is*.

  **Four fractions of the source**, which is what OOXML's `a:srcRect` stores, so
  a deck authored here and one that came from PowerPoint mean the same thing by
  the same numbers. Not pixel offsets, which stop meaning anything the moment the
  picture is replaced with one of another size.

  **The picture does not move.** Dragging the left handle cuts the left away and
  leaves the rest exactly where it was, because the box shrinks with the handle
  and the same amount of source comes off that side. The other reading of the
  gesture — hold the box still, rescale what is left to fill it — makes the whole
  picture jump and zoom while one edge is dragged, and no tool does that. Both
  halves are one command, `cropPicture`, because a box that shrank without its
  crop is a squashed picture and that is what one undo would leave.

  Three things only a browser could have said, each of which type-checked and was
  wrong. A function template takes `(props, node, ctx)` and it was written
  `(d) => …`, so every style came out empty and the picture drew zero by zero —
  indistinguishable, on screen, from one that failed to load. A resize dragged
  past the opposite edge *flips* the box, which is right for a shape and
  impossible for a picture, so the box is recomputed from the crop that was
  actually kept rather than taken from `resizeBox`. And the preflight's
  `img { max-width: 100% }` clamped a cropped picture back to its box — a crop
  that scaled nothing, with the model, the schema and the renderer all correct.

- **Where the text sits in its box.** `verticalAlign` was declared on
  `textFrame` the day the node was written and read by the renderer ever since,
  with nothing anywhere that could set it: a title centred in its placeholder was
  a document you could write by hand and not by editing. The panel has the row
  now, drawn for whatever declares the attribute rather than for a list of
  stypes — the same rule the corner radius and the frame's layout follow.

  **`textInset` is new.** PowerPoint calls it the internal margin and gives it
  four sides; this is one value, like the `padding` a frame already carries, and
  zero by default — a default is what every document that says nothing gets, and
  PowerPoint's 0.1in would have shifted the text in every deck already written.

  The part worth keeping is why it is a module and not two lines in the renderer:
  it *was* two lines in the renderer, which is why nothing tested them. A padding
  without `boxSizing` grows the box past the width the model gave it, so two
  boxes placed edge to edge overlap by their insets and the slide stops being
  what the document says. Six unit tests in `office-slides/test/text-box.test.ts`
  and one browser check that the box did not get wider — the only part of it
  jsdom cannot answer.

- **Colour, and the reason it could never be changed.** The deck's ribbon grew
  Word's two colour palettes — the text's colour and the highlighter's — and
  behind them the fix for something older than either.

  **Applying a mark appended it.** So text that was red and was then made green
  carried both `fontColor` marks over the same characters, and the reader kept
  the red: **coloured text could not be recoloured, in any product, by any
  route.** Word's palette had shipped the day before with this behind it and
  every test passed, because every test coloured text that had no colour yet.
  A run has one colour; two marks claiming otherwise is not a document anyone can
  draw, and which of them wins is whatever the renderer nested last. Applying now
  makes room first — trimmed rather than dropped, so colouring one word of a red
  sentence leaves the rest of it red — and the arithmetic is nine cases in
  `datastore/test/mark-range.test.ts`, found in one Playwright round and pinned
  down in milliseconds.

  Undo had to change with it. `applyMark` reported an inverse that took the mark
  off the range, which was near enough while applying only added; now that it
  replaces, only the list of marks the node carried can say what was cut, so both
  ends of a selection restore theirs exactly.

  **`setHighlight`, not the toggle.** `toggleHighlight` takes a colour and has
  since it was written, but it *toggles*: pressing turquoise on text that is
  already yellow takes the highlight off rather than turning it turquoise. So the
  palette applies and the button in the character group still means one press of
  Word's yellow — the same pair `setFontColor` has always had.

  **The mark that could not have been used.** `setBgColor` writes its colour into
  an attribute called `color` while the schema declares `bgColor` and the only
  reader looks for `bgColor`: it returns success and paints nothing, measured. It
  is left alone and written down in the open list, because which of the three
  ways to close it is right is a document-format decision and a control is not
  the place to make one.

  A note on where the palettes live: the deck draws Word's, not a copy, the same
  way it already draws Word's font and size boxes. Two products disagreeing about
  what a text-colour button does would be one of them wrong.

- **A shape can be designed, not just filled.** Gradients, shadows and dashed
  strokes — the first of the five steps to the level of PowerPoint, Keynote,
  Canva and CapCut, written into `docs/ROADMAP.md` the same day. A shape's whole
  style was `fill`, `stroke` and `strokeWidth`: a flat colour and a solid line,
  which is a diagram's vocabulary. It is first because everything after it needs
  it — a theme has no colour slots to resolve until a shape has more than one
  colour, and an animation has nothing worth watching until the thing it moves
  looks designed.

  **Attributes rather than a mini-language.** A gradient could be one string —
  `linear 90deg #fff 0%, #000 100%` — and then every reader needs a parser, and
  every parser is a place to disagree about a document. Four plain attributes, in
  the style of a table's `grid`: the schema stays flat, the panel binds a control
  per value, and a document that says half of it still draws. Two stops rather
  than a list, for the same reason.

  **Declared where they are read.** Word draws its shapes as SVG, where a
  gradient is a `<defs><linearGradient>` and a shadow is a filter — a different
  implementation of the same idea. Putting these in the shared schema would give
  Word attributes it does not read, which is the fault this repository keeps
  finding in itself, so they are Slides' and Word adds the SVG half when it wants
  them.

  **The command needed no change**, which is the schema-driven panel paying off:
  `setBoxStyle` builds its payload from the node's *declared* attributes, so five
  new ones flowed through it the moment the schema had them. The panel's rows are
  chosen the same way — a rectangle gets a corner radius and a group does not,
  and now a rectangle gets a gradient and a group does not.

  One measured detail worth keeping: the document stores a shadow as an angle and
  a distance, which is how every drawing tool asks for one, and CSS wants x and y.
  `cos(90°)` is 6.1e-17 rather than zero, so a shadow thrown straight sideways
  rounded to `-0px` — legal, meaningless, and the sort of thing that sits in a
  saved document's diff forever.

- **A group's box follows what is in it.** A group is not a shape a reader drew
  — it is the fact that these things move together — so its rectangle has one
  honest value: the bounds of its children. Nothing kept it there. Measured in
  the deck: a child nudged 6000 twips right stuck that far outside a group whose
  width never changed, and the handles, the marquee, the hit test and aligning
  were all reading a rectangle that had stopped describing its contents.

  **A reaction, not a step in each command**, because *anything* moves a child: a
  drag, a nudge, an align, a paste, an undo. Adding the fit to each would be one
  rule written six times, and the seventh command would forget it. It converges
  for the reason the frame layout does — the arithmetic answers with what
  *differs*, so a group that already agrees produces nothing.

  **The children move too, and that is what makes it invisible.** A child's
  coordinates are its container's, so a group's origin is the zero its children
  are measured from: when the bounds start above or left of that origin the group
  moves to meet them and every child shifts back by the same amount. Without it a
  group would jump across the slide the moment one child was nudged.

  Found by re-measuring rather than re-reading: it was the only real defect in a
  Slides list that had six features marked undone which had shipped. One test
  fixture had to change with it — a coordinate test whose group described an area
  its single child did not fill, which the rule now tightens.

- **Ctrl+Enter splits at the caret, and the caret goes with the text.** It used
  to put the break after the whole block and leave the caret *on the break node*
  — measured: the paragraph stayed whole, nothing moved, and the next keystroke
  had nowhere sensible to go. Word's own `insertPageBreak` now runs a new
  operation that splits at the caret, puts the break between the halves and
  leaves the caret at the start of the second one, all as one thing to undo.

  Three positions, because they are not the same operation: **inside** the text
  splits it; at the **end** there is nothing to move, so the new page gets an
  empty block to type in; at the **start** the whole block moves, so the break
  goes before it and the caret stays exactly where it is. Splitting at the start
  would leave an empty paragraph behind on the old page.

  One operation rather than two, because the index the break goes at is only
  known *after* the split has made the second half — a static list of two
  operations cannot express that, the second would need a value the first
  produces. The roster demanded an entry the moment it was registered, which is
  that check doing its job.

  **The column break goes the same way**, with the node type as the operation's
  only argument: "break here" means the same thing whatever is being broken, and
  two commands disagreeing about where a break lands is a difference a reader has
  to learn rather than guess. `_insertBreak`, which put a break after the whole
  block, is gone — a private method nothing calls is a second answer to a question
  that has one.

  **And the break itself had to be told where to go.** `pageBreak` was drawn as a
  bare `<div>` that never asked the layout how far down the page to sit, while
  every other block gets that from `blockStyle`. A break is *exactly* the block
  that must ask: the paginator ends the page before it and makes the break the
  first fragment of the next one, so the push that carries the flow onto that page
  is set on the break's own sid — and nothing applied it. The document grew a page
  with no break anywhere on it.

  Measured before: first half at y=427, break at 469, second half at 482, all
  three on the first sheet. After: 427, then 1176 and 1185 — the break and the
  text it moved are both on the second sheet, which starts at 1080.

  Ruled out along the way, each by measurement, which is why the renderer was the
  answer rather than a guess: the document had the three nodes in the right order,
  the break was a direct child of the surface, it rendered with its own sid so
  `measureBlocks` found it and gave it `breakBefore: true`, and `paginate` flushes
  the page on `breakBefore`. A later render and a nudge changed nothing, so it was
  not the layout pass failing to converge.


- **The Enter sweep was flaky, and its last check could never pass.** Three
  faults, all in the test.

  It reloads the whole document once per paragraph — deliberately, so one bad
  split cannot explain the next — which is around forty page loads and forty
  paginations inside one 30-second budget. That fits on an idle machine and not
  on a busy one, so it failed inside `settled()` and passed alone. It says
  `test.slow()` now, which is the honest description.

  Then a flat `waitForTimeout(450)` after Enter: a guess at how long pagination
  takes, and wrong under load. The split was *correct* — right head, right tail,
  right order — and the paginator had not placed the new paragraph yet, so the
  sweep reported "새 문단이 페이지 밖에 그려졌습니다" about a document that was
  about to be fine. It polls for the state the assertions are about now, and a
  paragraph that never lands still fails with the same message.

  **And the check underneath that was `closest('.w-page')`, which matches
  nothing.** There is no `.w-page` in this product — only a stale mention in a
  stylesheet comment — so the last of the sweep's five conditions had never been
  satisfied once, and only surfaced at all when a split got past the other four.
  A test-side version of exactly the fault this repository keeps finding in its
  own code: a name that nothing writes. The sheets are drawn *behind* the flow
  rather than around it, so "on a page" is geometry — does the paragraph's middle
  fall inside a sheet — and it is that now.

- **A page number can carry its chapter** — Word's `1-1`, `1-2`, which is how a
  manual is numbered so a chapter can be revised and reprinted without
  renumbering the book. `pageNumberChapterStyle` had been in the schema since
  page setup was written and nothing read it.

  **Every part existed; what was missing was the join.** `page-furniture.ts`
  resolved a page number, `toc.ts` found the headings and which page each was on,
  and `numbering-resolver.ts` computed what a heading is *numbered*. The new code
  is one small pure module that asks "which chapter is this page under" and
  "what is that chapter's number", and the section renderer handing the answer
  to the furniture. That is the shape most of this product's gaps have had, and
  it is the argument for re-running the sweep rather than reading the list.

  Three decisions worth keeping. The chapter's number is what the *numbering*
  gives its heading, not the heading's position — a document whose chapter
  headings are not numbered has no chapter number to print, and Word behaves the
  same way; inventing one from the position would print a page number that
  disagrees with the heading it claims to be under. It reads `counters[0]`
  rather than the rendered text, because `numberFor` renders "2." or "II." in the
  *level's* format and a prefix wants the bare number in the *page number's*.
  And the page *count* takes no chapter: `1-12` in "page 1-1 of 1-12" would claim
  the document has twelve pages in chapter one.

  `pageNumberChapterSeparator` was added with its reader, not before it —
  Word's `w:chapSep`, stored as a name, hyphen by default because `1.1` reads as
  a decimal.

- **A renderer that rearranges what it was built as is a finding.**
  `every-drawing-keeps-its-children`, the sibling of the namespace check and the
  second way a renderer can exist, run without error, produce elements and put
  the wrong thing on the page: HTML *moves a child out* of a parent that may not
  hold it. `<thead><th>` becomes a `<thead>` with a `<tr>` nobody wrote.

  Written after meeting exactly that by hand a day earlier, and it catches it —
  put the fault back and the check reports it by name.

  **Asked of the parser, not of a list**, like the namespace oracle before it: it
  writes the markup and reads back what came out. The one subtlety is *context* —
  parsing with the parent itself as the context element hides the loudest
  rearrangement HTML makes, because a `<p>` fostered out of a `<table>` lands at
  the fragment root and looks like a child that was kept. The parent is written
  inside a real wrapper, and which wrapper is asked of the parser too: anything
  the parser drops from a `<div>` is tested inside a `<table>`.

  **Two harness faults surfaced under it, both of which were making checks
  abstain while looking like they passed.**

  `drawnTagFrom` called a renderer with *one* argument where the DSL passes
  `(props, node, ctx)`. Every component that reads its own node — which is every
  interesting one — threw on `undefined` and came back as "cannot say", so Word's
  table cells and its `surface` were skipped by both drawing checks. The
  `examined` counts said so, and nobody read them as a warning; that is the
  argument for having them. Fixing it took the namespace check from 348 pairs
  examined to 442, and six real `surface > scene` pairs came with it.

  And containment turned out to be two questions, not one. `drawnAs` says what a
  node *is*; `holdsIn` says where its children *land*, which for a header drawn as
  `<thead>` holding a `<tr>` is the `<tr>`. With one function the checks reported
  the fix for a fault as being the fault.

  **One schema fault, found by the check on its first run.** All seven of a
  table's parts carried `group: 'block'`, so the schema said a blockquote may
  contain a bare `<tbody>` and a list item a loose `<tr>` — twelve pairs no
  product could draw. Only `bTable` is a block now; its six parts are reachable
  through its content expression and nowhere else. The advice was already in this
  repository's own spec, in §9.1, about vector nodes.

- **A document that is loaded is checked against the schema.** Every *operation*
  validates what it writes, so a document built by editing is checked at every
  step — and one handed to `loadDocument` went in exactly as written. A product's
  fixtures are the only documents that arrive that way, and they were the one
  place nothing looked. `validateTree` walks the whole tree and says what is
  wrong *and where*, in a path a reader can follow:
  `document/surface[1]/bTable[0]`.

  **It found a fault in Word's own document on its first run.** `docMeta` is
  `docTitle? docSubtitle? docAuthor*` and the fixture had author before subtitle
  — wrong for as long as it has existed, and invisible because the title bar
  draws the three by name rather than in document order.

  **What it adds is the arrangement.** The loader already refuses a node type the
  schema has never heard of, throwing on the way in; nobody invents a node type
  by accident and everybody nests one wrongly. And `Validator.validateDocument`,
  which existed, is one level deep — it checks the top node and its children and
  stops, which in a `document → surface → block → …` tree is the two nodes least
  likely to be wrong.

  Two smaller things fell out. `Validator.validateNode` reads `node.attrs`, and
  every document in this repository writes `attributes`: it has been validating
  an empty object for every node it was ever given, so a missing required
  attribute has never once been found by it. And the report is a *report* — the
  document opens anyway, because a reader with a file that will not open and no
  way to see why is worse off than one whose file opens with a warning.

- **A table on a slide can be edited at all.** Dragging across its cells selects
  them, the deck's toolbar has the nine commands that change a table's shape, and
  merging works. `installCellSelection` is the same install Word makes; the
  deck's overlay goes `pointer-events: none` while a box is being edited, so a
  pointer inside an entered text frame reaches the document exactly as it does in
  a page.

  **Four faults were hiding behind each other**, each only visible once the one
  before it was fixed.

  The deck ran the *shared kit's* table commands, written for a schema without
  the header/body group between a table and its rows — the reason Word replaced
  them long ago. It installs Word's now, which also read a `cell` selection.

  Then `every-command-can-be-reached` reported sixteen commands a reader could
  not reach, because the deck's conformance measured "the product's own commands"
  from **a list written in the test**: four extensions, while the kit installed
  six. The check's own note says a list "would be a fourth place to forget the
  thing the check exists to catch", and it was one. The list lives in the product
  now, as `createSlidesOwnExtensions`, and the kit and the check both read it.
  Six of the sixteen were table *formatting* commands with nowhere in a deck to
  put them, so `createWordTables({ formatting: false })` declines them rather
  than registering commands nobody can run.

  Then merging failed with "cell not found in table": **the sample deck's table
  was a document the schema refuses.** Its rows sat directly under `bTable`,
  where the schema says `(bTableHeader)? bTableBody+ (bTableFooter)?`. It drew
  perfectly — loading a document does not validate it — and every table operation
  rejected it, because `buildTableGrid` reads a table's children as groups and a
  group's children as rows, so it read each row as a group and each cell as a
  row.

  With the shape fixed, merging failed again: the deck's cells held *paragraphs*,
  and `bTableCell` is `inline*`. Word's document, `insertTable` and the schema
  all agree that a cell holds runs directly; the deck's hand-written table was
  the one thing that did not.

  **One more, found on the way out.** `bTableHeader` holds its cells directly —
  "a header IS a row" — and the renderer drew that literally: `<thead>` with
  `<th>` children, which browsers render and which is not HTML. Anything reading
  the table as a table sees a header with no rows. The header draws its own
  `<tr>` now, in the renderer rather than in the model, because the row is not in
  the document.

- **A table can be selected as one thing, and deleted.** A handle at its
  top-left corner, shown while the pointer is over the table — the gesture that
  produces a `table` selection, the last of the four kinds with nothing making
  one. Delete takes the table away.

  **The guard is the design.** `inTable` is true with a caret in any cell, and
  binding Delete to it would make Backspace the most destructive key in the
  product: a reader deleting a character loses the table. So there is a second
  context, `tableSelected`, true only after the handle has been used — and a test
  that fails if anything else ever takes a plain Delete, because a looser binding
  on the same key would win somewhere.

  **Two failures, both invisible outside a browser.** The handle sits *outside*
  the table's corner so it covers no text — which means moving towards it takes
  the pointer off the table, and the first version hid the handle on the way to
  it: it appeared on hover and the click landed on nothing. And every key binding
  is guarded by `editorFocus`; taking the gesture without letting the browser move
  focus to the button left focus nowhere at all, so Delete did nothing, which
  looks exactly like a broken command. The handle focuses the document itself
  now, which is safe because the DOM selection has already been cleared.

- **A block of table cells can be selected, and `mergeCells` works for the first
  time.** Drag across cells, or Shift+click; the block is a `cell` selection, the
  type the engine has declared since selections were written and nothing had ever
  produced. `table-selection.ts` is the arithmetic — the rectangle between two
  cells, grown until it clips no merge — and `table-selection-view.ts` is the
  pointer half.

  **Merging had never once worked.** It is the one table operation that cannot be
  expressed as "the cell the caret is in", because it needs two, and it was being
  called with `cellId` — which `mergeTableCells` does not read; it wants
  `fromCellId` and `toCellId`. So the operation saw two undefined cells and
  failed on every press, invisibly, for as long as the command has existed. There
  was no way to select the two cells it needed, so there was no way to notice.

  **Three surprises, all in the browser.** The block was computed correctly and
  written to the model correctly, and a `selectionchange` after the button came up
  replaced it with a caret — the browser places one on mouseup and neither
  `user-select: none` nor `preventDefault` stops it. The guard already existed
  for exactly this and was spelled `type === 'node'`; it is a question now
  (`holdsAgainstTheCaret`), because a selection of *whole things* has no text
  position to be overwritten by, and that was never specific to shapes. Second:
  the selected cells were marked, reported as painted, and looked identical,
  because a cell's shading is resolved onto it as an **inline** `background-color`
  and inline beats a stylesheet — the wash is an inset `box-shadow`, a property no
  renderer here writes. Third: `_cell` required `selection.type === 'range'`, so
  selecting a block turned every button on the table toolbar off.

  One decision worth keeping: a one-cell drag is a caret, not a selection.
  Washing a single cell in blue the moment the mouse moves two pixels would make
  it impossible to select a word.

  **Everything that acts on cells now acts on the block**, not on the first one:
  shading, vertical alignment, text direction, row height — all in one
  transaction, so four shaded cells are one undo. Deleting is per *line* rather
  than per cell, because four cells in one row are one row to delete; inserting
  is per cell, because two selected rows means two new rows. Guessing one answer
  for all three would have been wrong in two ways at once.

  And a test-writing lesson worth keeping: the first version of the browser test
  dragged between `nth(2)` and `nth(5)` and asserted "two cells" — then adding
  four buttons to the ribbon made it three, because a taller ribbon moves the
  table down and a straight line between two centres crossed a different set of
  boxes. It now drags between the cells that *say* `A1` and `A2`, and waits for
  each box to stop moving before pressing: `settled()` waits for the page count
  to stabilise and the table is still being placed after that.

- **The text has a colour control, and it never had one.** `setFontColor` and
  `removeFontColor` have been in Word's kit since the kit had marks, registered
  and working, on no toolbar and bound to no key — **this word processor could
  not change the colour of its text.** They are the *shared kit's* commands, so
  `every-command-can-be-reached`, which asks about the commands a product adds,
  could not see them. That is the check's honest limit and it is written in the
  check; what it means in practice is that a gap this size sat in plain sight.

  Found by pulling on the shading control's own comment: three fixed fills and a
  note admitting a colour picker was "a second dialog to build before the common
  case works at all". True of the picker and not of the *control* — text colour
  was the same shape with nothing at all, so **one `ColorPalette` answers both**,
  and neither is three colours a reader has to accept.

  **What made it more than a dropdown.** Nothing in a ribbon may take focus from
  the editor: a command acts on the selection and the selection goes with focus,
  which is why every control here fires on `pointerdown` with the default
  prevented. A colour panel is the first with something *inside* it that could
  take focus, so the swatches are pointer-driven too and the one focusable
  element is deliberate — the browser's own `<input type="color">`, which is the
  picker the reader already knows and the answer to "what about the sixteenth
  colour".

  Two smaller ones: the palette had to be added to `toolbarCommands()` by hand,
  because it is not a `ToolbarControl` and the list that proves every button has
  a command behind it would otherwise have been quietly incomplete. And `canRun`
  has to be asked with a real colour in the payload — `setFontColor` refuses one
  without, so asking with an empty payload reports the control as permanently
  unavailable, which is exactly how the deck's picture button came to be dead.

- **Cell shading can be set, and all three of its parts are read.** `shadingFill`
  had been drawn since tables were drawn and nothing had ever set it — a document
  that arrived shaded looked right and a reader could not shade anything.
  `setCellShading` acting on the selected block, which is why this had to wait for
  a cell selection: shading one cell at a time is not what anybody means by
  shading a header. It arrived as four fixed buttons and is a palette now — see
  the entry above.

  **The surprise was in the reading, not the writing.** The same two fill-only
  lines were written out four times in `css.ts` — table, row, cell, paragraph —
  and `shadingColor` and `shadingPattern` were both on the list of attributes the
  schema declares and nothing reads. One `shadingCss` replaced all four and reads
  the pattern: `solid` shows the *pattern* colour and ignores the fill, which is
  Word's reading and surprises people; `pctN` is N% of the pattern colour over
  the fill, as a `color-mix` rather than a stipple, because a real dot pattern
  aliases into stripes at any zoom; stripes and crosses are repeating gradients
  at the angle their name says.

- **Word offered commands for things it could not draw, and no longer does.**
  Found by the conformance harness within an hour of it existing and confirmed in
  the running app: `insertCallout` reported success, put a `callout` in the
  document, and drew nothing — the reader's text in the model and invisible on
  the page. `word-kit` was calling `createRichExtensions()`, the whole
  rich-editor bundle, so Word registered an insert command for every node in it
  and had renderers for about half.

  Closed in two halves, months apart. The commands went first: Word names the
  extensions it can draw one at a time, an extension may bring a *default*
  renderer registered only if nothing has claimed the type, and three checks were
  written so it cannot come back — `every-command-can-be-seen`,
  `every-command-makes-something-real`, `every-insert-is-accounted-for`. The
  schema was the other half and stayed open: the node types were still declared,
  so a document arriving with one still drew nothing. That is the entry below.

- **The office schema declares what it offers.** It used to take the standard
  schema's node set entire, so both products wrote off what they could not draw:
  Word thirteen lines marked `BUG:` and ten marked "inherited", Slides
  twenty-three marked "inherited". `OFFICE_STANDARD_NODES` now names the
  thirty-one types an office document is made of, and forty-six exemption lines
  across two products became zero.

  **The surprise** was how exactly the two lists agreed. Not "nearly the same
  list", which is what this was logged as — measured against each product's
  renderer registry, the sets are *identical*: the same twenty-five standard
  types undrawn by both, of which two (`footnoteDef`, `commentThread`) are drawn
  by the layout pass and the app and keep their reasons. There was nothing to
  reconcile between the products; the schema was simply claiming a domain it did
  not have.

  Second surprise: the ones office keeps *and does differently* were hiding in
  the list. Equations are OMML node names, a contents page is `tableOfContents`
  computed from the headings, and page numbers are `page-furniture.ts` resolving
  a node to text mid-draw. Each had a standard-schema twin sitting unused beside
  it — a second way to say the same thing, which is not a spare but a second
  thing to keep working.

  And one that only the app could catch: `fieldPageNumber` and `fieldPageCount`
  looked inherited and are Word's — the sample document's footer holds both,
  among the words and tabs of an ordinary paragraph. They are in `word-schema.ts`
  now, because a slide has no page it is on. Every unit suite passed with them
  wrongly dropped; the document that used them lives in `apps/`.

- **A frame is a block, so a document can have one.** Two columns of text or a
  row of cards in Word without drawing a table and switching its borders off:
  `insertFrame` and three ribbon buttons, a `<div>` with `display: flex` or
  `grid`, and paragraphs inside it that the browser lays out.

  **Three surprises.** The schema refused it, because every placed node must
  state a width and a frame in the flow has none to state — the requirement
  belongs to *placed*, not to *frame*, and a width written into a document would
  go stale the first time a margin moved. Eight conformance exemptions
  (`frame > rectangle`, `group > frame`, six more) each carried one sentence —
  "in Word a frame is a div and a drawing is SVG" — which is a **content model**,
  not something a check cannot know: `word-schema.ts` now says `frame: 'block+'`
  and `group: 'scene+'`, and all eight exemptions are gone. An exemption that can
  be turned back into a rule was never an exemption.

  And the one that decides how a single arrangement serves two products:
  `childrenToLayOut` gives the arithmetic only the children that **have a size**.
  Every scene node has one and no flow block does, so a canvas frame computes
  coordinates and a document frame computes nothing and lets CSS do it. Written
  up as §5.1 of `docs/specs/canvas-model.md`.

  Two smaller ones, both "a box with nowhere to put a caret": an empty frame, and
  then an empty *paragraph* inside it — 307 pixels wide and zero high, so neither
  half of a new frame could be clicked into.

- **Typing in the same tick as the click went to the previous paragraph.**
  `selectionchange` is asynchronous, so for a moment the DOM knows where the
  caret is and the model does not. The edit was always right —
  `getTargetRanges()` reads the DOM — but the render after it restored the caret
  from `editor.selection`, which still held the position from before the click,
  and every character after the first went there. The input handler now tells the
  model where the typing is *before* committing, with `applySelectionToView:
  false`, because the browser's caret is already correct and a second writer is
  how carets start fighting.

  **The surprise** was where it reproduces. Two ordinary paragraphs do not, even
  with an edit immediately before the click — tried, green with the fix reverted.
  Two halves of one frame do, every time: editing one child of a frame redraws
  the frame's subtree, so the node the click is about to land in is a *new* node.
  How much the render replaces is what opens the window.

  A second thing fell out of it: `apps/word/tests/helpers.ts` `placeCaret` was
  polling for `selection.type === 'range'`, which is already true whenever
  anything has been clicked before — so it returned instantly on the *previous*
  caret and 56 tests were quietly waiting for nothing.

- **Nothing could make a frame in Slides.** Drawn, arranged, and adjustable from
  the properties panel since auto-layout was written; the only frames that
  existed were the two in `sample-deck.ts`. One line in `box-commands.ts` and a
  toolbar entry. It starts unarranged — turning layout on is the reader's
  decision — and with a pale fill and an outline, because a container arrives
  empty and one that is neither filled nor outlined cannot be found or dropped
  onto.

- **A selection could not be extended past the end of a marked run**, and an
  inline decorator's text was missing from the run index. One cause, found by
  measuring the second: `buildTextRunIndex` took a `normalizeWhitespace` option,
  on by default, that trimmed every run and skipped any run made only of
  whitespace. Five of its six callers passed `false`. The sixth was the
  DOM→model direction of the selection handler, so **the two directions of one
  conversion were reading indexes that differed by exactly the whitespace**.

  What that looks like from the outside: bold a word, hold Shift and the right
  arrow, and the selection grows to the end of the marked run and stops dead. A
  mark splits the paragraph, one of the pieces is a lone space, a lone space got
  no run — so the browser's position inside it was absent from the reverse map,
  the conversion snapped to a run boundary, and the model answered with the
  offset it started from. The app then wrote that answer back to the DOM, undoing
  the browser's move, once per press. The raw event log is two lines and says the
  whole thing:

      press 1   dom " "@1  ->  model 35  ->  dom " "@0
      press 2   dom " "@1  ->  model 35  ->  dom " "@0

  The option is gone rather than defaulted the other way: an index whose purpose
  is to say which character sits where cannot hold a different text than the page
  does, and five callers already knew it.

  With the boundary crossing again, the decorator half could land. A comment
  anchor is a decorator and the index skipped decorators wholesale, so ten
  commented characters were absent and a paragraph of 68 indexed as 58 — every
  offset at or past the comment resolved to the wrong text node. The distinction
  that fixes it is the decorator system's own: `data-decorator-category="inline"`
  means the decorator *wraps* text that is already there, and only the other
  categories draw content the model has no character for.

  The two were logged as separate entries, one blocking the other. They were one
  bug, and the second was only visible because the first had been masking it.

- **A second overlapping mark corrupted the text, in both products.** Bold then
  italic rewrote the paragraph — "Contents" became "Conten" nineteen times over,
  and undo could not get it back. Four things are worth keeping from it.

  *The cause was the reconciler, not the observer.* Nesting a second mark inserts
  a wrapper, so the new inner span pairs with the outer one — which is holding
  the text — and kept it while the inner span drew it again: `a bb c` became
  `a bbbb c`. The observer then read that doubled DOM back as typing and wrote it
  into the model, which is where the nineteen came from. Fixing the reconciler
  made the observer change unnecessary; it was measured working and is not
  needed, and sits in a stash if it is ever wanted for its own sake.

  *It only happens where the wrappers share a tag.* Marks defined as `<strong>`
  and `<em>` cannot pair with a plain `<span>`, so a fresh element is built and
  the stale text goes with the old one. Every test in `renderer-dom` defined its
  marks that way. Both products define theirs as spans with classes.

  *The mark tests could not see the size of the text they asserted on.*
  `normalizeHTML` runs each text node through `.replace(/\s+/g,' ').trim()` and
  strips whitespace between tags, so ` and `, `and` and `` all compare equal.
  Under it, a second defect had been sitting in the open: a whitespace-only run
  was pruned as an "empty" wrapper, so bolding a single space **deleted** it —
  and double-clicking between two words selects exactly that. The DOM was then a
  character shorter than the model at every offset past the mark.

  *So characters are now asserted separately from structure*, in
  `mark-keeps-every-character.test.ts`, which compares `textContent` with nothing
  normalized. It fails on four counts without the whitespace fix and six without
  the reconciler fix, and it took milliseconds to write once the question was
  "how much text" rather than "what shape".

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
