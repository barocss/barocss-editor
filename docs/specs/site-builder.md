# A site builder, measured before it is built

The third product. Written 2026-08-25, after the shared layer was split into
`@barocss/office-canvas` (what two products place things with) and
`@barocss/office-text` (what two products draw text with), and before a line of the product
exists — because `docs/SHARED-LAYER.md` says a third product's *disagreement* is what makes a
boundary right, and a disagreement recorded after the fact is a rationalisation.

## What a site is, in this model

The schema answered this before anyone asked. `office-schema.ts` has said, since it was written:

> `surface` … a Word page and a **PageBuilder** page hold blocks, a slide and a FigJam board hold
> scene nodes.

and

> `SurfaceKind.Flow` — Word, PageBuilder: flow content, **paginated or responsive at the product
> layer**.

So a site page is a `surface` of kind `flow`, holding blocks. Word takes that surface and paginates
it; a site builder takes the same surface and makes it responsive. Neither is a new document shape.

What a page is *made of* is the part that reads oddly at first and is the whole reuse argument:

| a site builder's word | this model's node |
| --- | --- |
| section, stack, container | `frame` with `layoutMode: 'row' \| 'column' \| 'grid'` |
| heading, paragraph, list | `heading`, `paragraph`, `list` — the standard schema's |
| image | `picture` |
| card, header, footer (reused) | `component` + `instance` |
| design token | `variable`, referenced as `var:name` |
| link to another page | `goTo` / `setBoxJump`, which a deck already has |

**Nothing in a page carries coordinates.** That is not a limitation, it is the design: `canvas-layout`
already says so out loud —

> Flow children are left out rather than laid out … a frame of paragraphs therefore answers
> "nothing moves", and its arrangement is the CSS `frameCss` writes, **which is the browser's
> business and better at it**.

A site builder's output *is* that CSS. The product whose job is to produce HTML should be laid out
by the thing that lays out HTML.

## What is reused, and what that means in practice

- **`office-text`** — every text renderer, the style cascade, marks, tables. A site's typography is
  a document's typography.
- **`office-canvas`** — the frame's arrangement, components and instances (a reusable header *is* a
  card placed on three pages), variables (a colour token *is* a document variable), and the
  selection arithmetic where it applies.
- **`editor-core`** — a selection that is a **set** of nodes, which the engine grew this month, plus
  commands, history and the key map.
- **`renderer-dom` / `editor-view-dom`** — unchanged. A site page is a document being drawn.
- **The conformance harness** — a product here is a schema and a kit held to checks, and the third
  product gets the same treatment on its first day: every node drawn, every attribute read, every
  command reachable.

## What is genuinely new

Four things, and each is new because no existing product has ever had to answer it.

### 1. Sizing intent — fill, hug, fixed

Today a child of a frame either states `width`/`height` (and is *placed*) or states neither (and is
*flowed*). A site builder needs the third and fourth answers every layout tool has: **fill** the
container along the main axis, and **hug** the content. They are CSS one-liners (`flex: 1`,
`width: fit-content`) and a schema attribute apiece; what they are not is derivable from what exists,
because "no width" currently means "ask the browser", which is hug for a `div` and fill for a flex
child depending on the axis. Saying it out loud is the point.

### 2. Breakpoints

The same page drawn at several widths, with values that differ per width. This is the one new
*mechanism*, and it has a model already in this repository: a document variable is resolved in the
narrowest scope that declares it — document, then page, then card, then placement — and a breakpoint
is a scope keyed by a width instead of by a container. `varInScope` is the shape to follow, and its
lesson comes with it: the resolution must be one walk that the drawing and the panel both ask, or
the panel will say one thing while the page draws another.

What must **not** happen is a second document per breakpoint. A site is one document; a breakpoint
is an override on a node, the way a `variable` on a page overrides the document's.

### 3. Export

A `.html` file with the CSS the editor was already writing. The deck's `forFile` is the precedent
for "what is written is not what is stored" — sids are the store's, not the document's — and the
converter package already turns a document into HTML for the clipboard. The difference is that here
the export is *the product*, so it is the thing the tests measure.

### 4. Reordering rather than dragging

A canvas moves a box to a coordinate; a page moves a block to a **position in a list**. That gesture
exists — `reorderIndexAt` in `canvas-layout` computes where a dragged child lands in a frame's order,
and the deck's layer list already uses it — but the product built on it is different: on a page,
reordering *is* the primary gesture, and dragging to a coordinate is the exception.

## What is deliberately not in the first slice

- **Absolute positioning inside a page.** A site builder that starts with coordinates ends up as a
  slide editor with a scroll bar. Frames first; a placed box is an escape hatch to add when
  something honestly needs it.
- **Interactions and states** (hover, click, scroll animation). The deck's motion model is the
  precedent and it is a large piece; a page that cannot be styled has nothing to animate.
- **A CMS, collections, or data binding.** Variables are the seed of it; a repeater over a data set
  is a different product decision and the user has deferred collaboration and data work.

## The first slice, and what it has to prove

A page a reader can look at, built out of what already exists, with a number attached:

1. `packages/office-site` — the schema (the office schema plus what a site adds), a kit, the
   renderers a site draws differently (the `surface`, which must scroll rather than paginate), and
   a sample site.
2. `apps/site` — the app: a canvas that draws one page, a page list, and nothing else.
3. The conformance harness, pointed at it on day one.

**What it proves** is the claim this whole month has been about: that a third product is a schema,
a kit and a handful of renderers, and that the shared layer needs no third answer to anything. Every
place the site product has to reach into `@barocss/office-word` is a **finding**, recorded here as
it happens — that is the disagreement `SHARED-LAYER.md` asked a third product for, and it is worth
more than the feature it turns up in.

## Findings from building it

Kept here as they arrive, most recent last. This is the list `docs/SHARED-LAYER.md` asked a third
product for: every place the site had to reach into another product, or found the shared layer
answering the wrong question.

**1. `instance` required a size, and a placement in the flow has none.**
The very first load of the sample site was refused by the schema: *Required attribute 'width' is
missing*, on a header that has no width to have. The `frame` had learned this already — its own
comment says a box on a canvas is given a size by the command that places it, and a box in the flow
is as wide as the column it sits in — and the requirement had simply never been questioned one node
over. A reusable header is one definition placed on every page, which is the deck's mechanism doing
the job it is most obviously for, and it is a block in a column. `width`/`height` on `instance` are
optional now, with the reason written where it happened. A slide loses nothing that was being
checked: a placement with no size drew nothing before and draws nothing now.

**2. "A placement draws its definition" was a product's line, and had to be the layer's.**
The deck installs a content resolver in its kit; the site needed the same three lines on its first
day. Two products answering *what does a placement draw* is one of them being wrong, so
`installInstanceResolution` is `office-canvas`'s now — and it takes the product's own resolver as a
second half, which is how the deck keeps resolving variable bindings and theme references that a
page has never heard of.

**3. A placement had no renderer outside a canvas.**
Installed the resolver, the definition resolved, and the page still drew nothing: the only product
that had ever drawn an `instance` draws it as a positioned box in an `<svg>`. On a page it is a
block in the column — a `<div>` holding whatever the definition resolved to. Not a defect in the
shared layer; a reminder of where the line is. **Resolution is shared, drawing is the product's**,
and that is the same sentence that keeps Word's SVG rectangle and the deck's HTML box apart.

**4. `frameCss` is Word's, and the site builder's layout engine is exactly it.**
Flex row and column, grid with N columns, gap, padding, alignment, background, border — a function
written for a document's layout boxes, reused unchanged as the thing that lays out a landing page.
It lives in `office-word/shapes.ts` and the site imports it from there, which is a coupling with a
name: *the third product reaches into the word processor for the one function that turns a stack
into CSS.* It should move — to `office-canvas`, beside the arrangement it belongs with — and it is
recorded rather than done in the same breath, because moving it is a change to two products and this
slice is about whether the third one stands up at all.

**5. Several widths at once is the notes pane, three times.**
Asked while the app was being built: *can it edit more than one screen size at a time, like Figma
Sites?* It can, and the mechanism was already here — the deck's notes pane is a second
`EditorViewDOM` over **the same editor and the same store**, with an env of its own. Three frames
side by side are that, three times: one history, one selection, no second copy of the text, and
typing in the 390-pixel frame is typing in the page.

Two things came with it, one design and one fault:

- **A breakpoint's overrides cannot live in the content resolver.** That resolver belongs to the
  *store*, and the store has one — every view would get the same answer to the one question whose
  whole point is that the answers differ. The env is the only per-view channel there is, so a
  breakpoint is resolved from there, which is the same seam Word uses to tell one view it is drawing
  a header being edited.
- **A view that renders once is a picture.** Measured the first time three frames were on screen:
  typing in the mobile frame changed the document and the other two went on showing what they had
  drawn. The editor's own view redraws itself on a content change; every *other* view is the host's
  to keep up to date.

## What the first slice cost

| | lines |
| --- | ---: |
| `packages/office-site` — schema, kit, renderers, sizing, stack commands, sample | **793** |
| …of which the sample site itself | 123 |

Seven hundred lines, three renderers (`surface`, `frame`, `instance`, plus a picture that is an
`<img>` rather than an SVG image), one new concept written down (`sizing`), one new attribute
(`path`), and three insert commands. Everything else — the text stack, the style cascade, the marks,
the arrangement, components, the selection, the history, the commands — is what the first two
products already had.
