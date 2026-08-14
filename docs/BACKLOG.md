# Backlog

What is worth doing next, and why. Kept in the repository rather than in a
conversation, because a list that lives in a conversation is a list that is
forgotten between them.

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
