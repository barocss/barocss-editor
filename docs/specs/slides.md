# Slides, measured after it was built

The second product, and the last of the four to be written down. `word.md` opens
by saying it is the other case from `site-builder.md` — one written after the
fact, one before — and `note.md` is the third case, a product built to test a
claim. This is the fourth and it is the least flattering: **the deck was written
down last because nothing was holding it to anything.**

The day that was measured, `apps/slide` went from **18,971 lines to 2,520**, an
87% cut, as the shell moved into the package. Nothing failed. Nothing said a
word. `note.md`'s numbers stopped a comparable move **five times** in one
afternoon, for one reason: they are in a test. So the reason this document exists
is the table in it, and `packages/office-slides/test/spec-numbers.test.ts` is the
half of it that cannot rot.

Every number below is produced by that test, out of the running product.

## What a deck is, in this model

A `document` holding `surface`s of kind `slide`, each holding `scene*`. The
schema said so before this product existed, and `slides-schema.ts` says so at
the top of itself:

> `office-schema` declares a `surface` whose content is `block+ | scene*` and
> whose `kind` records which… Word used one half of that surface and left the
> other half unread.

So a slide is not a new document; it is the half of `surface` a word processor
never asked for. A slide is **19200 × 10800 twips** — 16:9 in the unit every
length in this engine is in — and 14400 × 10800 for a deck that wants 4:3.

What it holds, measured: **64 node types, 529 attribute slots, 25 marks**. Word
holds 108 and 1,043, the site builder 71 and 862. The deck is the *smallest*
vocabulary of the three products that have one, which is the right answer: a deck
says less about text than a word processor and less about layout than a page
builder, and it says one thing neither of them can say at all.

Eleven of those slots arrived on one node, late, and the reason is the subject of
`what-a-save-carries.test.ts`: a `picture` had **drawn** a gradient, a shadow and a
dashed border since the day `paintCss` was written and the schema declared none of
them. Nothing was red, because the two checks either side of the gap both walk the
*schema* first — an attribute a product draws and no schema declares is not a
finding, it is not a subject, it is nowhere. See "What writing this down found".

## What is the deck's, and what only looks like it

| a presentation's word | this model's node |
| --- | --- |
| a slide | `surface`, `kind: slide` |
| a shape | `rectangle`, `ellipse`, `line`, `path` — the canvas vocabulary |
| a text box | `textFrame`, holding ordinary blocks |
| a picture, a film, a sound | `picture`, `mediaVideo`, `mediaAudio` |
| a group, an auto-layout box | `group`, `frame` |
| a table | `bTable` — inside a `textFrame`, because a surface holds `scene*` |
| a layout, a master | `slideLayout`, `slideMaster` |
| a theme | `theme`, a resource the deck resolves through |
| an animation | `motionTrack` / `motionStep`, **beside** the document |

**Seven node types are the deck's own** — `motionTrack`, `motionStep`,
`slideLayout`, `slideMaster`, `mediaVideo`, `mediaAudio`, `theme` — measured as
the difference from the office schema rather than listed. Everything else on that
table is shared, and `office-canvas` exists because *two* products wanted it:
Word has a `canvasBlock` holding the same shapes, drawn by the same renderers.

**What a reader can hold is a box**, and there are **13** kinds of one: the
schema's `scene` group (12) plus `frame`, which left the group to be a block a
document can use and is still a box on a slide. That exception is written down in
`selection.ts` and checked in `selection.test.ts` rather than absorbed, because
the day it is absorbed is the day a node type joins the group and is silently
unselectable.

**What is genuinely the deck's** is the part no other product has asked for:

- **Time.** A transition between slides, builds on the objects, a timeline with
  tracks per shape, a playhead, curves, springs, and the trim — which edits time
  *inside* a shape rather than time on a slide. `motion-model.md` is its own
  document.
- **Presenting.** A show, a presenter view with its own window, notes, and a
  scroll show for a deck read rather than given.
- **A deck that is not a line.** A shape a reader presses jumps to a page; the
  deck's map is drawn from those presses; `document.advance` is the first
  deck-level setting this schema has.
- **A library.** The reader's own decks by name in IndexedDB — chosen by
  measuring that a pictureless deck is 8–42KB and one photograph is a base64
  megabyte — and a brand kit that remembers where a definition came from.
- **An audit.** A look over the deck before it is given to anybody: alt text
  nobody sees on screen, a shape five pixels off the slide, a page a button does
  not name.

## What the chrome is, and what that costs

A **ribbon, a filmstrip, a properties panel, a layer panel, a timeline pane, a
notes pane, a components panel, an audit panel, a find bar and a deck map** —
**30 components and 4 hooks** behind `@barocss/office-slides/ui`, which is why
`apps/slide` is 2,433 lines of `app.tsx` and 160 of `main.tsx` and nothing else.

Measured: **10 toolbar groups, 60 controls, 61 commands, 59 icons**; **47 panel
rows over two tabs** (style, motion) offering **63 settable attributes**; **24
keys**; **4 menus**. Four surfaces, all four **declarations rather than JSX** —
which is the whole reason the harness can see them.

The panel is the one worth pausing on. It was a React tree until recently, and
`conformance.test.ts` carried `notYet: ['every-property-can-be-edited']` plus
**thirteen exemptions** that were sentences describing rows — *"the properties
panel — fill, stroke, corner radius"*. The day it became `panel-model.ts` the
deferral and all thirteen came back as **stale**, because the thing they were
excusing had arrived. A prose claim about a React tree is wrong in the direction
that costs most: somebody builds a control that already exists.

Word has no panel and says so on purpose; the deck has one and needs it, because
a slide is a plane and a reader is thinking about the box they are pointing at.

## What the harness measures

| | |
| --- | ---: |
| commands registered | 193 (99 the deck's own) |
| of those, reachable from a surface | toolbar 61 · keys 13 · panel 14 · menu 7 |
| attributes a reader can set, from the panel | 63 |
| box types a reader can hold | 13 |
| motion presets · effects · combos | 42 · 36 · 8 |
| slide transitions | 7 |
| deck templates · themes | 4 · 4 |
| theme slots — colour, font | 12 · 2 |
| components · hooks behind `./ui` | 30 · 4 |
| `apps/slide/src` | **2,593 lines** — `app.tsx` 2,433, `main.tsx` 160 |
| browser test declarations | 459 |

There is deliberately **no line count of this package** in that table, and finding
out why was worth the round. A package's total moves when somebody adds a
comment, so a check on it is red for everybody every day and gets deleted — which
is the same failure as having no check, arrived at more slowly. What the 87% move
actually changed is *where the shell lives*, and that is two numbers that only
move when a component does: the app's own size, and how many components the
package's door hands a host.

`conformance.test.ts` carries **no ratchet**. It asserts, and every exemption in
it is a written claim that fails when it stops being true — which is how the
thirteen panel sentences and seventeen "inherited" lines came off. It opened at
**64 of 64 undrawn**, because the product had registered nothing at all.

## What is owed, in the order the harness puts it

Read out of the exemptions rather than decided by anybody:

| owed | what it is |
| --- | --- |
| 1 | **an emoji picker** — the deck *draws* `emoji`, publishes it, and offers no way to make one. The command is shared; the surface is the site's |
| 2 | **a table panel** — `caption`, `colspan`, `rowspan` are drawn by the shared text kit and settable nowhere here. The site builder has the identical gap |
| 3 | **a code panel** — `language`, same shape as above |
| 4 | **a film's playback** — `autoplay`, `controls`, `loop`, `muted`. The 재생 row says *when* a film starts in the sequence, which is a different question |
| 5 | **`clipsContent`** — a frame on a slide always clips, which is not a decision anybody made |
| 6 | **instance swap** — `componentId`, deferred with variants |

Plus the three the roadmap keeps off this list on purpose: **charts**, which need
a data model rather than a drawing; **collaboration**, deferred for the whole
suite; and a **`.pptx` exporter**, which is worth doing when the model has
stopped moving.

## What is deliberately not here

- **A ratchet.** Word runs two and they are the right shape there — a hundred and
  eighty owed controls is a pile, not a list of decisions. The deck's gaps are
  six sentences, so they are six exemptions and each one fails by name.
- **A second selection rule.** `SCENE_TYPES` is what the overlay asks and what
  the harness is told, and `every-insert-can-be-held` reports seven findings here
  that are all one sentence: *on a slide, everything a reader points at is a
  placed box, and what is inside one is reached by the caret.* A table on a page
  answers the opposite way and both are right.
- **A time field on any node.** A track names shapes by `name`, never by sid,
  because a sid is `session:counter` and cannot survive a save. A deck with no
  timeline pays nothing.

## What writing this down found

Three claims about this product were being made by `ROADMAP.md` and by nothing
else, and two of them were wrong:

1. ***"139 commands"*** — it is **190**, of which 97 are the deck's own. The line
   was measured once and never again.
2. ***"fifteen canvas node types declared"*** — there are **13** box types a
   reader can hold, and the schema's `scene` group holds 12 of them.
3. ***"A shape's whole style is `fill`, `stroke` and `strokeWidth` today. No
   gradient, no shadow, no blur, no dashes, no per-corner radius, no image
   crop."*** — every one of those exists: `fills`, `effects`, `gradientKind` and
   its angle and stops, `shadowBlur`, `strokeDash`, four `corner*`, four `crop*`,
   all of them in the 63 the panel sets. **Deck 1 is done and the paragraph
   saying it is not was still the first thing a reader met.**

The third is the expensive kind. A roadmap that under-reports a finished item is
a roadmap that gets the same work done twice, and the only reason it survived is
that a sentence about a product is checked by nobody unless somebody writes the
check.

### And what correcting the third one found underneath it

Fixing that sentence raised a narrower question — *on which node types* is each of
the six declared — and the answer was **not all of them**. A `picture`'s renderer
calls `paintCss` and `fillElements`, the same two the rectangle's does, so a
photograph on a slide has always drawn a gradient wash, a drop shadow and a dashed
border. `slides-schema.ts` had widened the picture with the corners, the crop and
the flip, and stopped there.

Measured by `what-a-save-carries.test.ts`, which asks three questions of every pair
of a box and a settable attribute: **11 drawn and undeclared, 12 with no control
that reaches them, 11 that a save did not carry.** All on `picture`. A reader could
see the product draw something the panel would not offer, `setBoxStyle` would drop —
it filters its payload through `_declaredAttrs` — and no validator would object to.

Nothing was red, and the reason is structural rather than an oversight:
`every-attribute-is-read` and `every-property-can-be-edited` both walk the **schema**
and ask the product about each slot. An attribute the product draws and the schema
does not declare is not a finding in either — it is not a subject. The new check
starts from the **drawing** instead, which is the one direction neither of them can
face.

## What this document is not

An argument for the design. The canvas was argued in `canvas-model.md`, motion in
`motion-model.md`, and the shared layer in `architecture.md`. This records **what
the deck is now**, so that the next 87% goes through a test.


### Free canvas workspace (2026-09-13)

`Stage.boards` supplies each slide's workspace position and natural CSS-pixel size. Canvas view starts in two columns; dragging a slide title writes `surface.canvasX/canvasY` through `setSlideInfo`. These coordinates do not alter presentation order or local object coordinates. The viewport camera supports two-axis panning and pointer-anchored zoom without document writes. The stage notifies the selection overlay when camera geometry changes.

Clicking or moving the text caret into another slide updates the active editing slide. Navigation, notes, insertion, layers and properties use that same slide. The inspector uses the shared `office-ui` inspector density, grouped corner fields and collapsible `PropertySheet` sections. Shift-click selects objects across slides for common properties, deletion, duplication and keyboard nudging.

### Cross-slide object transfer (2026-09-13)

Dragging selected top-level objects onto another slide in canvas view previews the target and converts positions into that slide's local coordinates. `moveBoxesToSlide` accepts `{ slideId, positions: [{ nodeId, x, y }] }`, where x/y use the document's twip units. It preserves object IDs, child structure and relative stacking order in one undoable transaction. Successful transfer selects the destination; undo/redo follows the selected object's restored owner. Escape and pointer cancellation leave the document unchanged.

Whole groups can move. Extracting a nested object is not supported. Locked or bound objects, invalid coordinates, mixed source slides and same-slide transfers are rejected. A moving connector cannot retain a reference to an object on another slide; connectors left behind freeze their endpoints when referenced objects move away. The preview uses a viewport portal to avoid clipping at the source slide boundary.

Verification: command/spec/conformance unit checks 58 passed; transfer, free-canvas and existing editing browser checks 16 passed; production build passed. Whole-workspace TypeScript checks still report errors in other packages, with none in the changed transfer source files.

### Cross-slide copy and selection (2026-09-13)

Alt-drag uses `copyBoxesToSlide` with the same destination positions. The source remains unchanged; copies get new IDs and internal connector references. The shared copy path now retains text marks. A connector must travel with its referenced objects. Drag copying does not replace the system clipboard.

Shift-click adds/removes objects across slides. Viewport-clipped outlines remain visible on the other selected slides. The inspector applies common properties to all targets; delete, duplicate and nudge preserve each object's container and form one undo entry. Grouping, stacking, alignment and component/connector creation refuse incompatible cross-slide selections rather than partially editing them. A normal object click returns to that object for dragging; cross-slide marquee and collective pointer resizing remain future work.

Verification: full Slides unit suite 1,054 passed. The five transfer/selection browser scenarios passed; fourteen existing free-canvas/editing scenarios passed in the preceding run. Two initial new browser expectations were corrected: unset opacity has an effective value of 1, and deletion must check the original node ID rather than the next first text frame. Actual user-browser verification changed both selected titles to 60% opacity, then undid to 100%. Build passed; other-package TypeScript diagnostics remain.

`SlidePrintDialog` provides output previews. `createSlidePrint` renders physical pages from the model and attaches browser print events. See [exchange scope](slides-exchange.md).
