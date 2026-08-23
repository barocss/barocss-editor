# Barocss Suite — Roadmap

One document engine, several products. Three questions decide whether that is a
plan or a wish, and each is answered from what the repository actually contains
rather than from what it could contain. Every claim below has a measurement behind it; where
something is a guess it says so.

Kept beside [BACKLOG.md](./BACKLOG.md), which holds the next thing to do, and
[RETROSPECTIVE.md](./RETROSPECTIVE.md), which holds what building the first
product taught. This holds the reason there is a next thing.

---

## Where this actually stands

Nineteen packages, ~85,000 lines of source, five apps. What matters is not the
size but the shape:

| layer | packages | knows about |
|---|---|---|
| **substrate** | `shared`, `dsl`, `schema` | nothing above it |
| **document** | `datastore`, `model` | the schema |
| **rendering** | `renderer-dom`, `renderer-react` | the DSL |
| **editing** | `editor-core`, `editor-view-dom`, `editor-view-react`, `extensions`, `dom-observer`, `text-analyzer` | the document and a renderer |
| **product** | `office-word` | all of it |
| **services** | `collaboration` (+`-yjs`, `-liveblocks`), `converter`, `devtool` | the document |

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

### Steps

1. **Move `ModelSelection` down** into `schema` or `shared`, add the three
   missing `type` keywords, drop the two unused manifest dependencies. The
   graph becomes acyclic and each package can be reasoned about alone.
2. **Split `editor-core`** into what any product needs (commands, transactions,
   history, context, keybindings) and what a *text* product needs (selection as
   a caret, contenteditable coordination). The second depends on the first.
3. **One published example that is not Word.** A library nobody has built a
   second thing with is a library with one user's assumptions baked in — and
   this repository has exactly one product in it. This is the real test, not
   the packaging.
4. **A stability promise per package.** `dsl` and `schema` are the ones others
   would build against; they need to say what will not change.

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

| product | schema | renderer | input | layout |
|---|---|---|---|---|
| **Word** | done | done | done | done |
| **Summernote-like** (HTML WYSIWYG) | `standard-schema` | done | done | none needed |
| **ProseMirror-like** (schema WYSIWYG) | done — this *is* that | done | done | none needed |
| **Notion-like** (blocks, pages) | small additions | done | done | none needed |
| **builder.io-like** (page builder) | small additions | done | **new**: drag-to-place, not a caret | none needed |
| **Excel-like** | grid nodes | virtualised rows | **new**: 2D range selection, formula bar | column/row sizing |
| **Figma-like** | reference schema exists | **new: canvas** | **new**: direct manipulation | **new: text shaping** |
| **FigJam-like** | as Figma | as Figma | as Figma, plus presence | as Figma |

Three of these are near-term and four are not, for one reason each.

### The three that are near

**Summernote-, ProseMirror- and Notion-like products need no new layer.** They
are the same document, the same DOM renderer, the same input path, with a
different schema and a different set of extensions. The distance is measured in
schemas and commands, not in architecture.

### The four that are not

**A page builder** replaces the caret with direct manipulation. The document
layer serves it unchanged; `editor-core`'s selection does not. This is the
cheapest of the four and is the natural second product — it proves the split in
step 2 above without needing a new renderer.

**A spreadsheet** needs a selection that is a rectangle of cells rather than a
range of characters, and a viewport that draws a hundred rows out of a million.
Neither is exotic; both are new.

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
toolbar model, and a React shell. Five of those six are already data
(`WORD_TOOLBAR`, `WORD_KEYBINDINGS`, `registerWordRenderers`, the schema, the
extension list) and the sixth is hand-written per app.

### Steps

1. **Name the product interface.** What `office-word` exports as a bundle is
   nearly it already — `word-kit.ts` is the shape. Make that the contract.
2. **A second app that shares the shell** — the page builder, most likely — so
   the shell stops being Word's and becomes the kit's.
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

**Phase 2 — split the editing layer.** Separate "any product" from "a text
product" inside `editor-core`. *Done when* a package can use commands, history
and transactions without importing anything about a caret.

**Phase 3 — a second product.** A page builder, on the DOM renderer, sharing the
shell. *Done when* the shell in `apps/` belongs to no product, and when a
feature added to the kit appears in both.

**Phase 4 — publish.** Versioning, a stability promise for `dsl` and `schema`,
and documentation aimed at somebody who has not read this repository. *Done
when* a person outside it builds a third product without asking a question this
document should have answered.

**Phase 5 — decide about canvas.** Prototype text-as-DOM-overlay first, since it
is days rather than months, and let that decide whether the shaping engine is
worth building. *Done when* the decision is made on evidence rather than on
appetite.

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
