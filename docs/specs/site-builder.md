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

**6. An override may be a map, because *this* map is checkable.**
`componentBind` refused a map and wrote down why: a binding names an attribute of a part it is not
on, and nothing over here can verify that part declares it — so a map there would be a value nothing
could check, which is the fault this schema keeps finding. A breakpoint override is the other case,
and the difference is the whole argument: it names attributes of **the node it is written on**, and
the schema has that node's declarations right there. `overrideFaults` makes the check — a width
nobody draws, an attribute this node does not have — and a test holds it. The alternative was a child
node, refused for a reason worth keeping: a paragraph and a heading would then carry non-text
children at the front of their content, and every offset in the text stack counts from there.

The cascade is CSS's own `max-width` shape — page, then tablet, then mobile, last word wins — so one
statement at the tablet covers both narrow widths, which is what a reader means by "on small
screens".

**7. A test that calls its own subject with `?.` cannot fail.**
`expect(editor.getDocumentFaults?.() ?? []).toEqual([])` passed from the day the product existed.
There is no `getDocumentFaults`; the getter is `documentFaults`. Optional chaining turned *the API is
not there* into *there are no faults*, while the editor logged a schema complaint on every single
load — the sample put its `components` and its `resources` before its pages, and the document's
content model puts resources after them. Two invalid documents, one silent test, and the fix was to
call the thing that exists.

**8. A snapshot has to be taken *of* the proxy, not around it.**
The per-width frames built their tree by walking the store's raw nodes, because the trap they were
avoiding is real: the proxy is live, and a live tree compared with itself reports that nothing has
changed. But the proxy is not only a lazy reader of children — it is **where a placement becomes its
definition's parts and a list becomes its rows**. Walking around it meant the reusable header drew as
an empty box on every frame for as long as the app had existed, and a browser test asserting "the
header is on both pages" passed on a placement with nothing in it. The data list is what exposed it,
by drawing its `componentValue` declarations and throwing: *Renderer for node type 'componentValue'
not found*. Read through the proxy, copy what comes out.

**9. A resolved node must not be resolved again.**
The proxy asks *what are this node's children* for every node a reader reaches, including the ones a
resolver has just returned. For a single placement that costs nothing — its parts are frames and
headings, none of them a placement. A **repeated** placement is the case that measured it: a list
draws one placement per row, so each row *is* an instance, and asking again threw the row away and
drew the definition's defaults three times. The test is not a guess: a stored node's children are
sids and only a resolved one's are nodes, so "did this come out of the document" is a question about
its shape.

**10. A dynamic attribute could be absent and a static one could not.**
The DSL has always let an attribute's *function* form return `undefined`, and the renderer has always
skipped an attribute that resolves to nothing. The direct form was typed without it. So a renderer
that moved its answers out of the callbacks — which is exactly what reading the env requires — stopped
type-checking on expressions that had not changed. Widened, with the reason. `override` had the same
shape of gap: it took `RenderTemplate` where `define` takes a function of the render context, so a
product that had to override a node *and* read the env could do neither without a cast.

**11. A page's stack stretches; a canvas's does not.**
`frameCss` aligns a stack's children to the start of the cross axis, which is right on a canvas — a
box on a slide is as wide as what is in it. On a page it produced a staircase: three cards stacked on
a phone, each as wide as its own longest line, so the card with the shortest sentence came out
narrowest. **No assertion in the suite could see it.** Every test asked about `flex-direction`, and
none about width. A screenshot found it in one glance. The site's renderer now supplies
`align-items: stretch` when the node says nothing, which also gives a row the equal-height cards
every landing page means by putting them side by side — and never overrides a stack that states its
own alignment.

**12. A data list needed no template language.**
The binding already existed. `componentVar` is a question a card asks, `componentBind` says which
part answers it and in what, `componentValue` is a placement's answer — written for a deck's cards,
and exactly the shape a row of data needs. What a list added is one node for the data, one node for
the repeat, and one prefix: `field:가격` where a value goes, which is the idiom `var:강조` has used
since the deck's variables. No expressions, no parser, no second document model.

Two things it decided, both against this schema's usual grain and both for measured reasons:

- **The rows are an attribute, not nodes.** A 500-row catalogue would be 4,000 nodes that nothing
  ever selects, edits or puts a caret in — carried by the store, walked by the validator and by every
  save. The cost of the other choice is real and is written where it happens: editing one cell
  rewrites the array, so an inline dataset is for the tens of rows a person curates and anything
  larger is `kind: 'url'`.
- **A list resolves in the store's content resolver, where a breakpoint may not.** They look like the
  same question and are not: every view draws the same rows — a product list is the same forty
  products on a phone — while three views want three different answers about a width at the same
  instant. What changes at 390 is how the rows are arranged, which is the stack's own overrides doing
  their job.

## The product, not only the model

Written after the first shell was built, because the order the work went in was wrong and saying so
is the useful part: three slices in a row added *model* — breakpoints, then data — to a product a
reader could not select anything in. The measurement that made it plain:

| | office-ui used | app files | overlay / panel / toolbar / zoom |
| --- | ---: | ---: | --- |
| word | 17 | 17 | 1 / 1 / 1 / 2 |
| slide | 53 | 27 | 2 / 5 / 1 / 0 |
| **site** (before) | **5** | **4** | **0 / 0 / 0 / 0** |

Five of the fifty-three shared controls, and none of the four things that make a builder. The engine
half was measured at every step; the product half had never been asked about at all.

### The shape

Four regions, because a reader has four questions at once: **what can I do** (top), **what is this
page made of** (left), **what does it look like** (middle), **what is this thing** (right). The
middle is a **canvas** rather than a pane — a plane the boards sit on, panned with space and zoomed
about the pointer — and the reason is the product's own claim: a reader is not looking at *a* page,
they are looking at the same page at three widths and comparing them.

The boards are *not* canvas objects. No coordinates, no dragging, no z-order: each is a page laid out
by the browser exactly as it will be published. **The canvas is the studio; the board is the page.**

### The interaction, which is the part that had to be decided

A board is a real editor view — `contenteditable`, caret, input path, mutation observer. That is what
makes the text editable and it is also what makes a builder impossible on its own: every click would
put a caret and nothing would ever select a section. So the pointer has an owner, and it is stated:

- **Select** (default) — a layer over the board takes every pointer event, so the board never sees
  one. A click selects, a double-click goes in, and the caret is never disturbed because it is never
  asked for.
- **Text** — the layer stops taking events and the board is an ordinary editor again.

One gesture each way: double-click in, `Escape` out. And what each gesture *means* lives in
`office-site/selection.ts` with tests, because it is a fact about the product rather than about the
DOM.

**13. A drill cannot be written against the selection.** The obvious rule — a double-click selects one
level deeper than what is selected — cannot work, and the reason is the event sequence rather than
the idea: a double-click is `pointerdown, click, pointerdown, click, dblclick`, and its **first press
is an ordinary click** that has already put the selection back to the outermost block. So every
double-click drilled from the top and a heading three levels down could not be reached however many
times it was tried. What has to be kept is not *what is selected* but **where the reader is** — the
container they have entered. `childOfScope` is that, and it is also why clicking one card and then
its neighbour keeps you inside the row instead of jumping back out to it.

**14. Entering the text is a decision, so the caret has to be asked for.** The layer swallowed the
double-click that would have placed it. Measured: the mode changed, the outline went dashed, and
typing did nothing at all. `firstRunIn` + `updateSelection` + focusing the board is what a click
would have done.

**15. `Escape` belongs to the reader, not to a board.** Three overlays each listening on the document
meant one press stepped out three levels — a bug only a second board could produce. One listener, in
the app.

**16. A test cannot click a canvas the ordinary way.** Playwright refuses a click when something
covers the target, and something always covers it here **on purpose**. `force: true` dispatches at
the same point and lets the layer that owns the pointer answer — which is exactly what a reader's
click does. A suite that worked around it by clicking elsewhere would be testing a product nobody
uses.

**17. A selector that names a property the product changes is a selector that lies.** The card row was
found with `[data-layout="row"]`, and at 390 it is a column — that is the whole point of it — so the
mobile assertion failed as though the override had broken something. Blocks are found by **where they
are**, never by what they currently look like.

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

## What the schema holds now

Everything a site draws is the office schema's, plus this. It is the whole list:

| what a site says | how it is written |
| --- | --- |
| a page's address | `surface.path` |
| how wide a block means to be | `sizing` (`fill` / `hug` / `fixed`), `minWidth`, `maxWidth` |
| what it says differently on a phone | `overrides: { tablet?, mobile? }` on the same nodes |
| the rows a list draws from | `dataset` — a `resource`, with `fields` and either `records` or a `url` |
| the list itself | `collection` — a stack holding exactly one `instance` |
| a cell where a value goes | `field:이름`, beside the `var:강조` this schema already had |

Two nodes, five attributes and a prefix. No new *shape* of document: a page is Word's surface, a
section is a canvas frame, a card is a deck component, and a repeated card is that component asked
one question forty times.

## What the sample found when it was asked to look good

The second sample was built to exercise every attribute the schema adds. It did, and it was ugly,
which turned out to be a measurement rather than a matter of taste. Asked to make it look like
something a person would ship, the vocabulary ran out in four places, all on the first screen:

| what a designer reached for | what the model could say | what it needed |
| --- | --- | --- |
| the mark at one end of the bar, the links at the other | `alignItems`, which is the *cross* axis | `justifyContent` |
| 96 above a heading, 64 below it | one `padding` for four sides | `paddingTop` … `paddingLeft` |
| words over a photograph | a `picture` node, which pushes the words off it | `backgroundImage`, `backgroundOpacity` |
| a card that is not a rectangle with a line round it | `fill`, `stroke`, one `cornerRadius` | `shadowColor`, four corners |

Two of the four are the **shared** frame — a navigation bar is a frame arranging what is in it, and
Word's frames and a deck's boxes want the same two words — so they are in the office schema and
`frameCss` draws them. The other two are paint, and paint is where the products differ: the deck
computes a gradient's axis against a box whose size the document states, and a page's box has no size
until the browser has laid it out. So the page builder borrows the deck's **names** exactly and
writes its own CSS, and the day a third product wants them the names move to `office-canvas`.

Three more things fell out of building it, and each is the kind of fault that reads as working:

- **A bound value lost its formatting past the second character.** A card's price said `0원` with the
  accent colour over `[0, 2]`; every row drew `월 9,900원` and coloured `월 ` and nothing else. A mark
  covers a *range of characters* and the characters had been replaced. `withText` now moves a mark
  that covered the whole run onto the whole new run, and drops one that covered part of it.
- **The panel offered a value the schema refused.** 맞춤 › 채움 writes `alignItems: 'stretch'`, which
  a page means by silence and the office schema did not list.
- **A media rule published `var:이름`.** Resolution happens in the renderer and a media rule is not
  rendered, so a narrower width whose card names a token shipped the literal token to a visitor.

## The page's ground is the page's, not the tool's

A board draws the document inside the editor's own window, and for as long as that has been true the
page inherited the *chrome's* typography: Tailwind's preflight resets `h1…h6` to `font-size: inherit`
and the app's body is 12px, so every heading on every board was drawn at the size of a panel label.
The published page had the opposite fault from the same cause — no scale at all, so a browser applied
its own `2em` and a margin the model never asked for.

So `PAGE_CSS` is **one string used by both**: the editor injects it into the window the boards are
drawn in, and the export inlines it into the file. The scale itself is small — six headings, a
paragraph measure, a list, an anchor — and it sets **no margins**, because spacing between blocks is
the stack's `gap` and a page with two answers for one distance has one of them invisible in the
panel.

The sizes shrink with a **container query**, not a media query. A 390px board sits inside a 1600px
window, so a media query is false there and true on a phone: the editor would show a phone board with
a desktop headline, which is exactly the lie the three boards exist to prevent.

## What a page can say now, and what it cannot

Measured against the vocabulary rather than against an opinion — every row on the left is something a
designer reached for while the sample was being built.

| | |
| --- | --- |
| **arrangement** | row, column, grid; gap; padding as one number or four sides; align across the axis and distribute along it |
| **size** | `fill` / `hug` / `fixed`, with a minimum and a maximum |
| **paint** | a colour, a gradient, a picture behind the words with its own opacity, a shadow, one radius or four |
| **responsive** | three widths, each saying only what differs |
| **tokens** | a colour or a word written once and referred to as `var:이름` |
| **reuse** | a definition with variables, placed anywhere, edited in one place |
| **data** | a dataset, filtered, sorted, limited, drawn once per row — and its card edited against a row of it |
| **text** | the document model's — headings, lists, tables, footnotes, and 24 marks |
| **links** | to a page of this site, by durable id, resolved where they are drawn |
| **states** | what a block is painted with under a pointer, or under the keyboard's focus |
| **publishing** | one HTML file per page, with the media queries the editor drew from |

And what it cannot, which is the more useful list:

| | |
| --- | --- |
| **motion** | nothing. No scroll reveal, no transition, no hover. The single largest difference between a page built here and one built anywhere else |
| **interaction states** | ~~a link cannot be styled on hover~~ — **built**; a *pressed* state is not there, and neither is a transition between them |
| **position** | no sticky header, no overlap, no negative offset — a page is a column of boxes |
| **forms** | no node for one |
| **typography as a system** | a size or a face is a mark on a run, not a style a heading follows |
| **per-page metadata** | no title, description or social image, so a published page has none |
| **more than one fill** | the deck's paint *stack*; a page takes one of each |
| **a dataset from a URL** | declared, not fetched — deferred by design |

## A state is the first value on a page that is not a value

Everything else a block says is resolved before the page is drawn. A width is known — three boards,
three breakpoints, each view resolving its own. A token is known, a dataset is known, a link's page
is known. **A pointer is known to nobody at render time**, because the hovering is the visitor's and
happens after the drawing has finished.

So `states` is the first thing here that leaves the model as a *rule* rather than as a drawing, and
three things follow from that sentence rather than from taste:

- **It is published as CSS.** `stateRules` writes `.b12:hover { … }` beside the media queries, from
  the same `cssFor` the editor draws with — one calculation, compared against itself, which is what
  makes an exported hover impossible to disagree with the editor about.
- **The editor cannot show it by hovering.** The tool's own layer covers the board, and that layer is
  what makes a click mean something on this product; the page underneath is never the topmost thing
  under the pointer, so its `:hover` never fires. The panel opens a state and the selected blocks are
  **drawn** in it — which is what every tool of this kind does, and is better anyway: a hover that
  goes away when you move the mouse to the colour field cannot be looked at.
- **Only paint may change.** Not a rule anybody chose: a state that changed the arrangement would
  resize the block, the block would move out from under the pointer, the pointer would then not be on
  it, and the browser would draw the two states alternately for as long as a visitor held still.
  `STATEABLE` is the list, `stateFaults` is the check, and the panel does not offer the rows rather
  than offering them and refusing.

A state is deliberately **not per-width**: a card that lifts under the pointer lifts at 390 as well
as at 1280, because the gesture is the same gesture. The cascade is base → this width → this state,
so a width still applies underneath one. The day a hover genuinely has to differ at one width it
takes an `overrides` inside the state, which is the same map one level down rather than a new
mechanism.

### Two things it found on the way

**A definition's nodes were in no stylesheet at all.** Rules were keyed by a node's id and the nodes
were found by walking the page — and a component lives *beside* the pages, not in one. So the header,
the footer and both buttons, the four things on this sample that are on every page, could say
`overrides: { mobile: … }` and the published page carried no media query for any of them. Older than
states by a month, and found only because a hover on the button did not reach the export. A drawn
part carries `placement~part`, so one definition placed five times is five ids for the thing a reader
edited once; `[data-b$="~part"]` is the one selector that says *every placement of this*, which is
exactly what placing a component means.

**The navigation was four words, not four targets.** A state is paint and a paragraph is not painted
— text sizing and text paint are the *stack's* question in this schema, asked one level up — so there
was nowhere for a hover to live. There was also a 14-pixel-tall thing to hit on a phone where every
guideline asks for something near 44. One fix: each item is a box with the word in it. When the hit
area and the hover turn out to be the same fix, the structure rather than the styling was what was
wrong.

**And three checks nobody ran.** `overrideFaults`, `linkFaults` and now `stateFaults` each had a unit
test beside it and nothing asked any of them about a real document. A check nobody runs reads, to the
next person, exactly like a check that passes. `documentFaults` is the walk that asks all three, and
the sample answers clean.

## A list's card is edited against the list's data

A `collection` draws one card per row and the rows are **resolved at draw time** — forty products
cost zero nodes. Which means the chain of document nodes stops at the list itself: everything below
it carries a synthetic `${collection}~${index}` id, and `documentSidOf` collapses that back to the
list. So a double-click on a product had nowhere further to go and did nothing at all.

The card is a `component`, so the door already existed — a double-click on a *placement* opens what
it draws. A list now uses the same door, opening the definition its template places.

**And it opens against the row that was pointed at.** A card designed against `상품`, `설명` and
`0원` is a card designed against nothing: every real title is longer, every real price has a comma in
it, and the two-line description that breaks the layout is in the data rather than in the
placeholder. The bar gains a row picker, because the row that breaks a card is rarely the first one
and going back to the page to double-click a different product is the editor's bookkeeping handed to
the reader.

Three decisions in that, each of which could have gone the other way:

- **The preview is not written to the document.** Which row a designer is looking at is a fact about
  *this reader, this minute* — the same kind of fact as which width they are editing — and a document
  that carried it would hand the next person a card mysteriously showing the eleventh product. It
  lives beside the editor and the drawing asks for it.
- **Only the words are substituted, and each node keeps its own id.** Resolving the definition through
  `instanceParts` would have been shorter and would have given every part a synthetic `owner~part`
  id — so a reader looking at a real product could not have selected the heading showing it. A
  preview you cannot edit in is a screenshot.
- **A bound part refuses the caret.** The card's title draws the row's name, so typing there changes
  the definition's fallback and the data overwrites it a frame later: not an error, not a refusal,
  just a change that does not survive. The part says where its words come from instead — the
  variable's name, and that the data is where to change them.

One thing fell out of it that was not about lists. `sidAtElement` collapses a drawn `${owner}~${part}`
to the owner, which is right for every question about *what a reader can change* — a part of a
placement is not something anybody edits — and it is exactly what throws the row number away. There
is now a `drawnSidAtElement` beside it for the one question that is about the drawing rather than the
document, and a double-click on the second product opens the second product.

## Where a change to a template belongs

The question a reader actually has is never *"how do I edit the component"*. It is one of four
questions, and the whole design is that each has exactly one answer:

| what the reader wants | where it happens | how they get there |
| --- | --- | --- |
| this card's design, for every row | the **definition** | double-click a row, or the rail's 컴포넌트 list |
| this row's words | the **data** | the data grid |
| where each slot's words come from | the list's **template** | 데이터 › 카드에 넣을 값 |
| a slot the card does not have yet | the **definition**, as a question | 블록 › 카드 › 새 질문 |
| what *this one* placement says | the placement's **values** | select it, 값 |

The fourth is the one every component system has and the third is the one this product was missing.
Without it a list is a dataset and a card with a fixed wiring between them: a reader could add a
column to the data and had no way to make the card show it, because the answers live on the list's
template placement and **nothing selects a template**. So a template stopped being editable at
whatever the sample's author wrote, which is the point at which a component system becomes a
decoration.

Three properties are worth stating as rules rather than as behaviour:

- **A change is global by default and the product says how global.** Editing a definition changes
  every placement of it, and the bar says *5곳에서 사용 중* before anything is typed. That sentence
  is read from the document rather than remembered, because a stored count is a stale count.
- **A bound part is not editable where it is drawn.** The card's title draws the row's name, so
  typing there changes the definition's fallback and the data overwrites it a frame later — not an
  error, just a change that does not survive. The part says where its words come from instead.
- **What a reader is looking at is not in the document.** Which row the card is being designed
  against is a fact about this reader, this minute. A document that carried it would hand the next
  person a card mysteriously showing the eleventh product.

### And the card can be asked something new

The fourth row of that table is only worth having if the *first column* of it can grow. Wiring a
question to a column is editing a template; adding a question is what makes it a template at all.

`bindPartText` is one command because it is one sentence — *this text comes from the card's data, and
the question is called 할인.* Naming a question the card does not ask declares it; naming one it does
binds to it; naming nothing unbinds. Which is the rule `setBlockFormat` already follows about widths
and states, and for the same reason: a reader choosing between two commands is a reader keeping the
editor's books.

Two things it does that nobody sees, and both are decisions:

- **The part is named after the question, not after its words.** A binding names a part by its
  `partId`, which is durable where a sid is not — and a block a reader just added has none, because
  until a binding names it nothing needed one. Minting it from the words would put `본문을 입력하세요`
  in a saved file as the name of a slot; the question is the name that still makes sense next year.
- **A new question is declared holding the part's current words as its default.** So a placement that
  answers nothing draws what the card already drew: declaring a question cannot empty a page, which
  is the property that makes it safe to try.

And unbinding **leaves the question**. Taking it away would change every placement of the card at
once, which is not what a reader unhooking one slot means — and another part may be answering it.

What is still missing, in the order it will be wanted:

1. **A question cannot be renamed or removed from the panel.** It can be declared and bound; the
   other two halves of managing one are still hand work.
2. **A placement cannot override anything the definition did not ask about.** A card whose padding
   should differ on one page has to become a second definition.
3. ~~**Nothing detaches.**~~ **Built** — 컴포넌트 해제. An instance becomes a **frame** holding what
   it drew, values and all; the component and the other pages using it are untouched. Not loose
   blocks: the reader arranged those pieces against each other, and a detach that scattered them
   across the page would have destroyed the thing they were detaching. A page has no `group` — that
   is a z-order over placed shapes and a page places nothing — so a frame is the shape a stack of
   blocks already has here.

   It is `transformNode` — the node changes type **where it stands**, keeping its sid, its place and
   every override on it. That was a replace-and-reinsert for one round: a node that changed type
   disappeared off the page while the document held it perfectly, which turned out to be two faults
   in the reconciler and is fixed there.

   A **data list's card** is refused. That instance is not on the page; it is the thing the list
   draws once per row, and detaching it would leave a list with nothing to draw and a stray card
   beside it — which is a reader asking for something else, to stop the list being a list.

   And a **placement inside** the thing being detached is copied as it is *written* rather than as it
   is drawn, because it goes on following its own component: detaching a header must not detach the
   button in it. Copying the drawn form stored a placement with no values in it and the resolver
   redrew the component's defaults — measured as the header's 무료로 시작하기 becoming 시작하기.

## A code block: what it stores, and where it is edited

Two questions get asked as one and they have different answers.

### What it stores is text, and the schema was wrong about it

`codeBlock` declared `content: 'text*'` — a group **no node in this schema is in**. Every text node
here is `inline-text`, whose group is `inline`, and nothing anywhere declares `text`. So a code block
could hold nothing at all: it refused every child it was offered, in silence, and any command that
made one made an empty block. Since the standard schema was written; found the day a site builder put
코드 on its rail and the insert reported success with nothing on the page.

`inline*` is the right shape and it is what every editor of this kind stores — a run of characters,
plus a `language`. Two things it must **not** store, and both are worth saying out loud:

- **The highlighting.** Colours are derived from the text and the language, so storing them means
  storing a value that goes stale the instant either changes. A published page carries `<pre>` with
  `data-language`, and whatever highlights it does so at draw time, on the reader's side.
- **Marks.** Bold inside code is meaningless, and a `<strong>` inside a `<pre>` is something no
  highlighter expects and no round-trip survives. The schema has a place to say this — a node
  definition may carry `marks: string[]` — and **nothing reads it**. So the constraint cannot be
  enforced today, which is the second half of why the insert is not offered.

### Where it is edited is a **mode**, and it is built now

Inside prose, Enter makes a new block, Tab moves to the next control, and the formatting commands
apply marks. All three are correct for prose and all three are wrong inside code. Two of them are
answered:

- **Enter is a newline.** Not a preference: a code block is one run of characters, and splitting it
  would give a reader a page of code blocks, none of which is the program and none of which can be
  copied back out as text.
- **Tab is two spaces.** Only inside code — taking Tab from a document at large would take away the
  one key that moves between the things on a page, and a rich text editor that swallows it has
  broken keyboard navigation for everyone who does not use a mouse. Two spaces rather than a tab
  character, because a real tab is eight columns wide in a `pre` unless something says otherwise.

Both are decided by a field the schema has always had and **nothing had ever read**: `code: true` on
the node definition. That is the third member of this family — `marks` and `whitespace` are the other
two, and `whitespace` is deliberately still not written on `codeBlock`, because the whitespace is
literal by virtue of the element being a `pre` and a second answer nothing consults is the fault
itself.

Two things it found on the way out:

- **`insertText` had never worked.** It guards itself by asking whether `replaceText` can run and
  asked with **no payload**, while `replaceText`'s predicate is entirely about the payload. So the
  answer was correctly no, every time. `EditorViewDOM.insertLineBreak` *is* `insertText('\n')` —
  which means **Shift+Enter has never inserted a line break in any of the three products**. A command
  that declines looks exactly like a key nobody pressed.
- **Three blocks could be placed and not selected.** `blockQuote`, `horizontalRule` and `codeBlock`
  were added to the rail and not to `SELECTABLE`, so they drew perfectly and could not be moved,
  deleted, coloured or typed into. The round that added them checked that each *appears* and never
  checked that a reader can get hold of one.

### And the highlighting, which is a different question

It is a **drawing**, never a value: the colours are derived from the text and the language, so
storing them means storing something that goes stale the moment either changes. The published page
carries `<pre spellcheck="false" data-language="…">` and the text, which is everything a highlighter
needs and nothing it would have to undo.

**No CodeMirror, and no Monaco.** Not because they are bad — because of what embedding one costs
here. Each brings its own DOM, its own selection model and its own undo stack, and this editor has
exactly one of each: `Ctrl+Z` would undo inside the widget rather than in the document, the site's
three boards already fought over `document.getSelection()` once, and the published page must be a
plain `pre` rather than a library's markup. Monaco is also megabytes for one block type out of
fifteen. What a code block on a page actually needs — type, newline, indent, and see it coloured — is
*less* than a paragraph, not more.

So highlighting, when it comes, is one of two shapes and neither is a widget:

1. **The CSS Custom Highlight API** in the editor. Ranges are painted without wrapping anything in
   elements, so the run stays one flat piece of text and the caret, the selection and the model are
   untouched. It is the only approach that adds colour without adding DOM for the text stack to trip
   over.
2. **Token spans at export**, so a visitor's page is coloured without shipping a script. That does
   make the editor's markup and the export's differ, which is the one thing export-as-a-render exists
   to prevent — so it needs the same declarations to come out of the same tokenizer, and a test that
   says so.

Deferred rather than half-done: a code block that can be typed into is useful today, and a colour
scheme that only one of the two grounds has is worse than none.

### The mode that is not built



Inside prose, Enter makes a new block, Tab moves to the next control, and the formatting commands
apply marks. All three are correct for prose and all three are wrong inside code: Enter is a newline,
Tab is an indent, and there is no formatting. That is not a renderer's problem or a schema's — it is
an input mode, and the text stack is shared by three products, so growing one is a change Word and
the deck feel too.

**Marks are still not refused.** Bold inside code is meaningless and a `<strong>` inside a `<pre>` is
something no highlighter expects and no round-trip survives. The schema has a place to say it — a
node definition may carry `marks: string[]` — and nothing reads it. That is the one part of the mode
that is not built.

## What a site builder still needs

Measured against what the product can do today, in the order the next slices should take them:

1. **A panel for the data, and a command that makes a list.** A dataset a reader cannot see is a
   dataset only a developer has — the rows, the fields, and which of them each part of the card
   takes. `collection` has no insert yet on purpose: making one means choosing a dataset and a
   component, which is a panel's question, and a command nothing can call is the thing
   `every-command-can-be-reached` exists to catch.
2. **HTML export.** The product's actual output, and the thing that makes every layout decision above
   testable against a real browser rather than this one.
3. ~~**Links between pages.**~~ **Built**, and the shape is the one this schema uses everywhere else:
   a link stores `page:<id>` — the page's durable id, never its address — and the address is resolved
   where the mark is drawn (`page-link.ts`). So renaming `/제품` to `/products` moves every link into
   it, and the published page carries a real `href` because `exportSite` draws through the same
   renderers the editor does. The fourth reference of this shape after `var:이름`, `componentId` and a
   dataset's `name`; a deck's `goTo` is the same question answered for slides.

   Two things fell out of it that are not links. Nothing in this product **removes a page** or
   changes a page's **id**, so a link that names a page which is not there cannot be made through the
   product at all today — and `linkFaults` reports them, with nothing yet drawing that report. Both
   are in `BACKLOG.md`.
4. **Fetching a `url` dataset.** Declared and not read: today only `records` draws. The design already
   says the editor keeps a few rows to design against and the published page fetches.
5. **Per-page metadata.** Title, description, social image — a page of a site has them and a page of a
   document does not.
6. **Filling in the override panel.** `overriddenAt` says which attributes a width changes, so a
   reader can be shown that the value in front of them is this width's rather than the page's; the
   commands exist, the marks are not on screen yet.
7. **Forms.** The one common site block with no node behind it — and the first thing here that would
   genuinely be new rather than reused.
8. **A code mode.** The node is fixed and draws; Enter, Tab and the mark commands all answer the
   prose question inside it. See above — it is the one insert this round deliberately did not ship.
9. **A transition between the states.** A hover that arrives instantly is a hover that looks like a
   bug on a large card. It is one attribute and one CSS property, and it is the doorway to motion —
   which is still the single largest difference between a page built here and one built anywhere
   else.
10. **Position.** No sticky header, no overlap, no negative offset: a page is a column of boxes. The
   editor cannot show a sticky header at all — a board is drawn at its full height on a plane and
   never scrolls — so this is the first thing the product would have to *communicate* rather than
   draw, which is a decision worth taking deliberately.
