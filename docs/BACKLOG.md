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

### Two of the four selection types are declared and read by nothing

`SelectionType` is `'range' | 'node' | 'cell' | 'table'`. The validator accepts
all four and `setNode` passes `cell` and `table` through unchanged, and **nothing
in either product ever produces one** — `readSelectionSummary` treats them
exactly like `node`, by way of `selectedNodeIds`.

Found by asking why the two products' selection modes differ. They do not: the
engine has one set and Word simply never makes a node selection, because a page
flows and every editable thing is in the flow, so "where the reader is" is always
a text position. Slides places, so the objects themselves are selectable and
their text is inside them — which is why it is the one product where both kinds
are live at once, and why `_nodeSelectionHoldsUntilGesture` exists at all.

**Kept, with a reader named.** Two cells in different rows are a *set*, which is
what `node` already means; what `cell` adds is that the set is cells, and the
code that will need to know is table editing — in both products. A selection of
cells answers different questions than a selection of shapes does: merge, split,
insert a row above, and what the toolbar should even offer.

- [ ] **Table editing produces them.** Until it does they are declared and
  unread, and this entry is what stops that from being forgotten rather than
  discovered again.

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
  now `assertConforms` with 27 written exemptions and no findings.
- [x] **A renderer that exists and draws the wrong thing no longer passes.**
  `every-drawing-can-hold-what-it-contains` reads the tag a product draws each
  node type as and compares it with the tags of the types the schema lets that
  node contain: `<svg>` may hold only SVG, so a container and its contents drawn
  in different namespaces is a box that draws empty. It found six pairs in
  Slides, four more than the comment that reported the problem had named.
- [ ] **A renderer that draws the wrong thing for any other reason still
  passes.** The namespace is the one way this is decidable from outside; a
  renderer that draws the right element with the wrong geometry is still only
  visible to a person looking at the page.
- [ ] **The office schema should declare what it offers** rather than inheriting
  the whole standard node set — now with a second product's worth of evidence;
  see "Every product pays for the whole standard node set" above.

The full list, with a reason each, is the exemption map in
`packages/office-word/test/conformance.test.ts` — and fixing one without deleting
its line there fails the build, which is the point.

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

- [ ] **A group's box does not follow its children.** Aligning across containers
  can move a child outside the group that holds it — legitimate in the model, and
  the group's own rectangle stops describing what is in it. PowerPoint recomputes
  the bounds; nothing here does.
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
   - [ ] **Word's ribbon has the same blank-for-an-unlisted-size gap**, fixed in
     Slides' and deliberately not copied across.
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
- [ ] **A clipboard for objects.** Copy and paste of shapes between slides and
  between decks; `copyOf` is already the tree-copy half of it.
- [x] **Snapping and guides.** Both halves in one function, so the line drawn is
  computed from the same candidate that moved the box rather than being a second
  guess at what happened. The threshold is in model units and derived from the
  scale, because "close enough" is a distance on the reader's screen.
- [ ] **Snapping while resizing.** Move only today: snapping a resize would
  fight the aspect and centre modifiers, which are the two things a reader is
  already holding a key to get. Worth doing, and worth doing carefully.
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
- [ ] **Editable speaker notes** — a second editable region over one document.
- [ ] **Real thumbnails** in the rail, which needs a second render of the same
  deck and is the first thing to want one.
- [ ] **Applying a layout.** `slideLayout` is drawn (hidden) and read by nothing:
  a new slide should start with its layout's placeholders, and a slide that
  follows a layout should take its formatting from it. Declared and unread, in
  a product written this week — the pattern does not stop being easy to commit.

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
- [ ] **Tailwind has to be told where the components are.** `@source` in each
  app's stylesheet. Miss it and every class attribute is intact with no rules
  behind any of them: the deck's ribbon rendered as one control per line, with no
  error anywhere.

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
