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
- **Only paint may change** — in a state a visitor *holds*. Not a rule anybody chose: a state that
  changed the arrangement would resize the block, the block would move out from under the pointer,
  the pointer would then not be on it, and the browser would draw the two states alternately for as
  long as a visitor held still. `STATEABLE` is the list, `stateFaults` is the check, and the panel
  does not offer the rows rather than offering them and refusing.

A state is deliberately **not per-width**: a card that lifts under the pointer lifts at 390 as well
as at 1280, because the gesture is the same gesture. The cascade is base → this width → this state,
so a width still applies underneath one. The day a hover genuinely has to differ at one width it
takes an `overrides` inside the state, which is the same map one level down rather than a new
mechanism.

### And a third state, which a visitor decides

`hover` and `focus` are things a visitor happens into. **열림** is the one they choose, and adding it
was the difference between a page that has two navigations and a page whose phone menu works.

The model could already say the hard-looking half: the wide menu is `visible: false` at mobile, the
hamburger is `visible: false` everywhere and `true` at mobile, both live in `overrides`, and every
placement of the component follows. What it could not say was what happens when the hamburger is
**pressed** — and a hamburger that does not open is a picture of a menu.

One mechanism answers a hamburger, an accordion, a tab strip, a 더보기 and a filter drawer. All five
are *a visitor asked for more of this block*, and all five were going to be asked for separately.

Four decisions, each of which had a wrong answer that also works:

- **It is remembered, not held — so it may move things.** `OPENABLE` is `STATEABLE` plus `visible`,
  `layoutMode` and `gap`. The flicker argument above is about a state that *depends on where the
  pointer is*; nothing is holding this one, so nothing alternates, and a menu that appears is the
  entire point. `stateableIn(state)` is now the question, asked by the schema check, by the command
  and by the panel — three places that had a copy of one list between them.
- **It publishes as a checkbox, and the page ships no script.** The browser already has one thing
  that remembers a choice a visitor made and can be styled on it. `openSwitches` puts an
  `<input type="checkbox">` in the exported markup and wraps whatever the designer drew in a
  `<label for>`; the rule is `.st-open-switch:checked + [data-b="…"]`. A menu that opens on a page
  whose script failed, in a crawler, on a phone on a train — and this product still ships no runtime,
  which is where every other builder's runtime starts.
- **The switch goes *before* the block, not inside it.** Both work as CSS; only one can be reached
  from a keyboard. A closed menu is `display: none`, and a checkbox inside that `none` is not
  rendered, so it is not in the focus order: 열림 would have been a pointer-only gesture. Outside, it
  is one Tab and one Space. Its own ring is off the page, so `openerRules` puts one on the block
  being looked at — named per switch, or one accordion taking focus rings all four.
- **`opens` holds a `partId`, not a sid.** `componentBind`'s rule, for `componentBind`'s reason: a
  sid is given out at load, so nothing *written down* can hold one — not a library component, not
  this product's own sample, not a page pasted from another document. `setOpens` mints the name on
  the block being opened when it has none, which is why the row has its own command: it writes two
  blocks. Resolution is scoped to the page or the definition, so each placement opens **its own**
  copy for nothing.

#### 아코디언과 탭, which turned out to be one thing

An accordion's answer and a tab strip's panel are the **identical node**: `visible: false` with
`states: { open: { visible: true } }`, opened by a sibling that names it. Everything that separates
the two is one attribute on the container.

- **`opensOne`** on the block that holds the openers — *only one of these at a time*. The switches
  under it become **radios sharing a name** instead of checkboxes, and that *is* the rule: choosing
  the second tab unchecks the first, its panel falls back to what it says at rest, and nothing keeps
  them in step because a radio group has kept them in step since 1993. No extra CSS, no script, and
  nothing that can drift.
- **`openAtRest`** on an opener — *already pressed when the page loads*. A tab strip needs exactly
  one; a menu needs none. It comes with the one behaviour that is not a choice: a radio cannot be
  unpressed, so the last-chosen panel in a `opensOne` group stays open. That is what a tab strip
  wants and what an accordion's author agrees to by turning 하나만 on.

**The one rule that could not be adjacent.** A tab strip where a visitor cannot tell which tab they
are on does not work — and the tab is not next to its switch (the *panel* is). So an opener's
`states.open` is published by `openerRules` as `body:has(#id:checked) [for="id"] > *`, keyed by the
switch's id. A block's `states.open` therefore has one meaning and two shapes: for a block that is
opened it is what it becomes, and for a block that opens it is what it looks like having done so.

Both are inserts — 추가 › 아코디언 and 탭 — because *the composition is the knowledge*. Every piece
already existed; what a reader would have had to know is that the body must be a **sibling** of the
header, that it needs a `partId` because `opens` records a name, and that the name has to be one
nothing else in the page is using. That last one is a silent fault rather than a visible one: two
accordions both calling their body 내용 is the second header opening the first body, in the published
page only, because `opens` resolves by name and the first match wins. `freshPartId` mints against the
page **and against the names the same insert is about to make**.

Three walks were minting or resolving these names, and two of the three stopped at `stype === 'page'`
— a page here is a `surface`, so they walked past it to the document root. `scopeOf` is the one walk
now.

#### What it found: `visible: false` meant two opposite things

A hidden block is cut from the published page — the words of a draft should not reach a crawler. A
**closed menu** and a **phone-only hamburger** write exactly the same attribute and mean the
opposite, and both were being deleted: the hamburger vanished, its `<label>` was published empty, and
the media query and state rule for the menu stayed in the stylesheet naming an element that was not
there.

`neverShown` is the honest question — hidden at *every* width and in every state — and it is now
asked in three places that must agree: the markup (`clean`), the media queries and the state rules
(`styledNodes`), and the scroll reveals. A block shown only on a phone had been losing its rules to
the same fault since before states existed.

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

### Where it is edited: **not in the page**

A code block is drawn `contenteditable="false"` and the caret never enters one. Everything follows
from that: the text stack never meets a code block, so every question it would have had to answer —
offsets through spans nothing in the document owns, IME, marks, what Enter and Tab mean — stops being
asked rather than being answered carefully.

Editing happens in a **layer of its own**, opened by the same double-click that means *the caret*
everywhere else, carrying a real code editor (CodeMirror 6). Which is safe here for a reason worth
being precise about: the objection to embedding one was always about the *always-embedded* shape — a
nested `contenteditable` inside the board's editable region, a second undo stack fighting the
document's, a second render path for the export. **None of those apply to a layer that opens on a
gesture.** It is a sibling of the boards rather than inside one, it is gone when the reader is done,
the export never sees it, and the document takes **one transaction** when it closes: one undo,
whatever happened inside.

It opens in **screen coordinates**, at the rectangle the block has on screen. The boards live on a
plane that zooms and pans, and a layer inside the plane would line up exactly and be drawn at the
reader's zoom — code at 70% is code nobody can read. The same call the selection chrome made: the
tool is drawn at the reader's size, not at the page's.

### And the highlighting: Prism, in the renderer

Syntax highlighting is two things — deciding what each character *is*, and drawing that. A scanner
written by hand can do the first badly for a handful of C-family languages and cannot do HTML or CSS
at all, because those need a grammar rather than a word list. Prism has the grammars, and its
`tokenize` returns a **tree** rather than a string, so the drawing stays this repository's: the same
`element()` calls as every other renderer.

The site **overrides** `codeBlock` to do it. `office-text` keeps drawing a plain `pre` for a
document, which has no language to tokenize by and no panel to say one in — so the dependency stays
with the product that publishes code rather than in a kit two products would carry it for nothing.

**The export writes the same spans, and carries no script.** That is the property the previous
attempt could not have: it painted ranges through the CSS Custom Highlight API at runtime, so a
published page had to run our function to be coloured at all. Painting ranges is a way to *colour*
something; it is not a way to say what a code block is.

Two things measured on the way. Every child of the block is an **element with a key**, including the
untokenized one — with no grammar it drew a bare text child and with one a list of spans, so the
child list changed *shape*, the reconciler had nothing to pair the text with, and a block given a
language showed its program twice. And `key` was reaching the DOM as an attribute: `initializeElement
VNode` takes it off a *copy* of the template's attributes and `_setAttributes` re-applied the
original, so a span carried `key="code"` from the render before. Fixed in `renderer-dom`, held by a
test.

### What is next: the code block should own its own DOM

`managesDOM` is the right home for all of this and it is **declared and not honoured**. A component
registered with `external({ managesDOM: true, mount, update, unmount })` is meant to own its element
— the equivalent of a ProseMirror NodeView. Measured: `mount` receives `{ id }` and nothing else, no
model and no text; the element it returns is **wiped by the reconciler**; and `update` and `unmount`
are never called at all.

When that path works, the code block moves onto it and two things get better: Prism fills the element
directly instead of being mapped through vnodes and keys, and CodeMirror mounts **in the block's own
place** rather than as an overlay in screen coordinates — which removes the one awkward part of the
design above.


## What a site builder still needs

Re-measured 2026-08-31 twice: once to see what the last list had missed, and again after building
the seven things it named. Six of the original ten had quietly been done; the seven that were open
are now closed. What is below is what is left, and it is a different list from any of the previous
ones — which is the point of measuring rather than remembering.

### Done since, with what each one turned out to cost

1. **Height.** `minHeight`/`maxHeight`, the same shape as the width pair. The argument against a
   stated `height` is the one a reader already knows: a box with a promised height either spills or
   clips, and both are the tool lying. The measurement that closed it is small and exact — the
   product's own hamburger had to be an **SVG**, because a box with nothing in it was a box of no
   height. It is three boxes now, and `sample-art.ts` is one function shorter. *A schema gap shows up
   as artwork standing in for a layout.*
2. **Position.** `sticky` and `absolute`, four insets that take a negative number, and `zOrder`.
   `fixed` is deliberately absent — it positions against the window, which in this editor is the
   tool's own chrome, and on a phone it is the commonest way a page becomes unusable.

   Three things fell out of it:
   - **every stack is `position: relative`**, so a badge put in a card's corner is placed against the
     card. Not a `positionsChildren` switch to remember: it changes no layout, makes no stacking
     context on its own, and is the only answer a reader ever means;
   - **a sticky block with no inset gets `top: 0`.** `position: sticky` with no `top` never sticks —
     valid rule, browser accepts it, nothing happens — and it is the most-made mistake with the
     property;
   - **a position goes on the placement, not inside the definition.** A block inside a component has
     the placement's box as its parent, and that box is exactly that block's height, so sticky there
     has nowhere to travel. Measured at 82 pixels in a browser. `display: contents` on the wrapper
     fixes it and costs more than it is worth — an element with no box cannot be pressed, measured or
     selected, and thirteen browser tests said so at once.
3. **Forms.** The one genuinely new thing: `form` and `field`, and a real `<form>` in the published
   page. What that buys is four things every div-and-script form throws away — the Enter key submits,
   the browser's own validation runs, a password manager can see it, and a page whose script failed
   still works. `kind` decides the control, `submit` among them, because a submit that is a styled box
   is a form a keyboard cannot send.

   Two decisions worth the record. **The label is always drawn**: labelling a form with its
   placeholders is the commonest accessibility fault on the web, and the words vanish the moment
   somebody types. And **a form has no default destination and none of this product's own** — a
   builder that quietly posted a stranger's message to its own server would be doing something nobody
   asked for with somebody else's data. So a new form arrives *broken on purpose*, and `formFaults`
   says so; a form with nowhere to send looks exactly like one that works.

   It is also the one place the board's drawing is allowed to differ from the published page rather
   than being a removal made afterwards: on a board the fields are read-only, the button is disabled
   and there is no `action`. `SiteEnv.published` is the one flag, read in one place.
4. **Fetching a `url` dataset.** The fetch happens **in the editor, into the document** —
   `refreshDataset` — not in the published page. The other way ships a script on every page, hands a
   crawler an empty list, and gives a visitor whose request failed a section with nothing in it. This
   way the rows are in the HTML, and the contract is what the button says: what a visitor sees is what
   was here when somebody last pressed it. It **never empties a dataset**: a service that answers with
   an object, with nothing, or not at all leaves the rows exactly where they were, because one bad
   deploy of somebody's API must not delete the content of their page.
5. **`og:image`.** Absolute or absent — a relative one is joined onto the site's address, and a site
   that has not said where it lives gets no tag rather than a broken one. On the **page** rather than
   the site, because the card that matters most is a post's.
6. **Closing a menu a visitor tapped through.** The only item here with no CSS answer, having looked
   for one: a `<label>` around the link does not fire (HTML skips label activation on interactive
   content), `:target` goes on matching so the hamburger cannot reopen the menu, and a second switch
   is two controls for one gesture. So this product now ships **one line of script** — a single
   listener that unchecks the switches — and only on a page that has both an opener and a same-page
   link. Every page of the sample still exports with no `<script>` in it.
7. **What 하나만 열림 costs.** A radio cannot be unpressed, so the last-opened panel in a `opensOne`
   group stays open. Right for a tab strip, a surprise for an accordion. Not a fault — nothing is
   wrong with the document — so it is a line in the panel at the moment the reader chooses, rather
   than a row in a list of problems.

### What designing the sample with them found

The sample was still drawn the way a product without these features has to draw: the FAQ was four
cards in a grid, the contact section was a heading and a button that opened a mail client, and
nothing on any page was ever *over* anything. All three are designs **forced by a missing schema**,
and a sample that keeps them cannot find the next gap either.

Redrawing them found one thing, and it is the kind that only shows up in use:

**A narrower width could change a value and could not un-say one.** The contact form wants to be 340
wide beside the words and the whole column under them, and `attrsAt` merges — so an override could
say *this much instead* and never *none at all here*. The workaround is a number large enough to mean
nothing, and the sample had already been writing it in three places: `minWidth: 0`.

`null` in an override un-says the key. That forced the half that matters more: **`null` and
`undefined` are different sentences and the panel had one gesture for both.**

- *nothing at this width* — an emptied field, while a narrower width is being edited.
- *the same as the page* — the **mark beside the label**, which is a button now rather than a `·`.

That dot had been saying *this width owns this value* with no way to stop it owning one. A reader
could type the page's number back in, which looks identical and is a different document: the width
still states a value, it now happens to match, and it stops following the day the page's changes.
`onUnmark` lives in `office-ui`, so the deck and Word get it the day either grows something to take
back.

### And redrawing the data found the best-shaped fault yet

**The sample's pricing page had been sorting wrong, in a real browser, for as long as it existed.**

A card's question was answered with a string and drawn exactly as stored, so the only way to make a
price read as `월 9,900원` was to *store those words*. `요금제` sorts by that column descending and
takes the top three — comparing `'월 9,900원'` against `'월 19,900원'` as text, where `9` comes after
`1`. The page showed 문서 · 사이트 · 스위트 and looked completely fine.

The fix is one sentence: **the data stores the value, and the card says how it reads.** `componentVar`
gains `kind: 'date'` and a `format` picture string; `readValue` is the whole vocabulary and it is two
placeholders wide (`#,##0` and the date tokens). Everything else in a pattern is literal, which is
what a fixed list of named formats cannot do — every product that ships `currency | percent | decimal`
grows a second attribute for the prefix within a month.

`format` is on the **card** rather than on the data, which is the point: one dataset now feeds a price
list that says `9,900원` and a summary that says `9.9천`.

Three things it turned up:

- **It has to run last.** A data list replaces a placement's answers *after* they are resolved, so
  formatting inside `instanceValues` reached every card except the ones with data in them — which are
  exactly the cards a format is for. `readValues` is applied after the rewrite and is idempotent, so
  running last is survivable rather than fragile.
- **The preview needs the same answer.** A designer editing the post card against a row has to see
  what the page will show, or the preview is showing them a different product.
- **A value it cannot read comes back unchanged**, never blank. A card whose column has one bad row
  should draw that row's own text, which a reader can see and go and fix; a blank is a row that has
  silently disappeared.

### Where a form's answers go

Framed three ways and only one is possible: **a published page is a static file.** It cannot write
into the `.baro` document, so `resources` cannot be a *destination* and neither can an "answers as
rows" store — both need something running. What already existed is the third: a real
`<form action method="post">` posting straight to a service the reader chose, with nothing of this
product's in between.

So the open question was never *where*. It was how much the product helps you connect one — and the
address-on-the-form shape got that wrong in the way this schema has three times refused elsewhere: a
site with five forms carried five copies of one address, so changing services meant finding all five,
and the one that was missed goes on posting to an endpoint nobody reads.

**`service` is a resource with a name; `form.sends` names one.** The fourth reference of the shape
`var:이름`, `componentId` and a dataset's `name` already use.

- **No default and no address of this product's own.** A builder that quietly posted a stranger's
  message to its own server would be doing something nobody asked for with somebody else's data. A
  form arrives with a connection, and the connection arrives empty and reported.
- **Two nodes, one transaction, one undo** — `insertForm` mints a connection only when there is none.
- **No address means no `action` at all**, never `action=""` — which a browser resolves to *this page*,
  so 보내기 reloads and looks exactly like a message that went somewhere.
- **The panel says how many forms share it**, because one edit reaching every use is the whole reason
  the name exists and therefore the one thing a reader must be told before making one.

A first-party inbox is a product decision rather than a schema one — a server, storage, spam and a
retention policy — and the schema is ready for it the day it exists.

### A picture a reader can add

The largest gap left, and it was found by asking whether the *form* work was the right next thing:
a `picture` carried a `src` string and **nothing anywhere could put a file in one**. The sample got
away with it by drawing its art as SVG data URIs — a thing a product's author can do and a reader
cannot.

`asset` is a resource with a name, a type and base64 bytes; `asset:로고` is the sixth use of the
reference shape. **The bytes live in the document** because a site here is one file a reader owns:
an image kept elsewhere would break that in the worst way — a document that draws correctly on the
machine that made it and shows broken images everywhere else.

**One `src`, two right answers.** A board draws the bytes (there is no server to ask); a published
page points at `assets/로고.png` (inlining a logo used on five pages writes its bytes five times, and
a photograph inside the HTML delays the first paint by exactly as long as it takes to download). The
second deliberate difference between the two drawings, after a form's `action`, and the same flag.

- **`Published.files` grew a `bytes`.** It could only carry words, which was enough until a site had
  a photograph in it: base64 written through the text path is a file no viewer opens, and it fails
  looking like a broken image rather than like a bad write.
- **The file's own size is stored**, so an `<img>` reserves its space and the words under it do not
  jump when it arrives. A builder that keeps only a URL has never seen the file and cannot.
- **The cost is reported rather than hidden.** Base64 is a third larger than the file; `assetFaults`
  says so past 8MB, against the document, because there is no block to click on for "this is 12MB".

### Publishing, and the links that had never worked

The asset work made a folder necessary, and asking what that meant found something older: **a link
resolves to a page's address — `/제품` — and publishing wrote `제품.html`.** Every link on every
published page was a 404 on any host that does not quietly try `.html` for you.

It looked fine in the editor, and that is the point worth keeping: the editor follows the *reference*
and never the file, so the mismatch is structurally invisible from inside the product. `fileFor` is
the model's now — the mapping from an address to a file is a fact about how a site is served rather
than about how a browser saves a download.

`제품/index.html` is a tree, and a browser cannot be handed a folder, so a publish is **one archive**.
`zipOf` lives in `office-site`: `publish` still says what a site *is* and the app still says what a
file is, but turning a list of files into one array of bytes is arithmetic with no browser in it and
belongs where the bytes can be asked about. Stored rather than deflated (a site's bytes are mostly
pictures, already compressed), UTF-8 names with the flag bit set (or a Korean folder is mojibake on
somebody else's machine), and a fixed timestamp so two publishes of an unchanged document are two
identical files.

The archive is checked by handing it to **somebody else's unarchiver** — a hand-written zip either is
the format or silently is not. That turned up a fact about the reader rather than the writer: macOS's
Info-ZIP `unzip` refuses to create a UTF-8 directory name whatever the locale, while `ditto`, the
Finder and Python's `zipfile` all read the same file without complaint.

### An address that is actually an address

Asked whether the product should have a slug feature and prefer English. The answer split in two, and
the useful half was not the language.

**`path` was a free string with no opinion about it.** Measured by typing each of these in and asking
the document what it kept:

| typed | stored | what a browser does |
|---|---|---|
| `My Page` | as typed | no leading slash, so it is **relative** — from `/가격` the link means `/가격/My%20Page` |
| `/제품?a=1` | as typed | `?` starts a query; the file `제품?a=1/index.html` can never be requested |
| `/제품#어디` | as typed | `#` is a fragment and is **never sent to a server** |
| `//x` | as typed | protocol-relative: a link to the host `x`, off the site |
| `/A/` | as typed | a trailing slash is a second address for one page |
| `/소개` on **two** pages | both | one page is unreachable; every link lands on the other. **Zero faults reported** |

Not one of those is a Korean problem. `pathFor` repairs an address on the way in — the one place this
product changes what a reader typed without asking, and the right one: a slug is the field every tool
of this kind repairs as you type, the result is visible in the box immediately, and the alternative is
an address the panel accepts and the site cannot serve. `pathFaults` reports the invisible one.

**A name gives a page its address — once.** A reader who calls a page 제품 means `/제품`, and typing
the word twice is what a tool should save them. Only while the address is still the minted `/page-3`,
because an address is what has been shared and indexed: a rename must never move a page.

**Hangul is not romanised**, and that is the answer to the English half. `제품` stays `제품`, never
`jepum` — romanisation reads as neither language, nobody types it, nobody recognises it in a search
result, and two people transliterate the same word differently. Every builder that does it
automatically is one whose Korean users turn it off first. A reader who wants an English address types
one; that is theirs to decide, which is the position this schema already takes about a component's
name and a dataset's. What the product *does* do is lowercase ASCII, because a case-sensitive host
turns `/Products` and `/products` into two pages and a case-insensitive one turns them into one.

### Is a Korean address all right?

Asked directly, and the answer is **yes, with one thing to get right that nothing warns about.**

It works. Every browser and every static host has served UTF-8 paths for over a decade: `/제품` is
sent as `%EC%A0%9C%ED%92%88` and shown as `제품`. The one cost a reader should know is that pasting
one into plain text — an old chat client, a text-only mail — leaves the encoded form, nine characters
per syllable.

**The thing that would have bitten**: `제품` has two correct spellings in Unicode.

```
NFC   eca09c ed9288                    6 bytes
NFD   e1848c e185a6 e18491 e185ae …    9 bytes
```

Identical on every screen, and `'제품' === '제품'` is `false` when one is each. A keyboard produces
the composed form and a browser requests it; **a macOS file picker has handed over the decomposed one
for twenty years**, and an asset is named after the file that arrived.

So without composing:

- two pictures both showing `로고` are two different names — the duplicate check passes, and one of
  them is permanently unreachable, which is exactly the fault that check exists to prevent;
- a page whose address arrived decomposed publishes a folder a browser never asks for: a 404 nobody
  can see by looking at either the address or the folder.

`names.ts` composes on the way in — an address, an asset's name — and compares composed on the way
out, so a document written somewhere else still resolves rather than half-working. Held by a test
whose failure message is the finding itself: *expected '로고' to be '로고'*.

Measured on the way: modern macOS `ditto` preserves NFC (APFS does not force decomposition the way
HFS+ did), so the archive round-trips cleanly here. The hazard is the file picker, not the archive.

### A picture at the size it is needed

Two things the asset work made possible, because both need the file rather than a URL.

**`aspect`** is the shape a picture keeps at every width, and a height cannot say it: a picture in a
column is 1200 wide on a laptop and 350 on a phone. Six named shapes — a banner, a video's frame, a
photograph, a square, a portrait — rather than a free `w/h` field, which every builder that offers one
fills with `1.7778`. `height: auto` goes with it, and that is the half everyone forgets: an `<img>`
carrying a `height` attribute is sized from the attribute, so a ratio without releasing it is a box
the browser ignores.

**`srcset`** is the largest performance decision a builder makes for its readers. A photograph taken
at 4000 pixels and sent whole to a 390-wide phone is most of what a builder-made page weighs, and no
CSS shortens the download. Renditions at 640 / 1280 / 1920 are made when the file arrives — in a
canvas, the app's for the same reason reading the file is — and each is published as its own file.
**Which one to fetch is the browser's**, which knows the screen and the connection; the product's job
is to hand it the list and say how wide the picture will be drawn.

- A rendition must be **meaningfully** smaller: a 2000-wide file was making a 1920 one, four per cent
  narrower, for another file and another entry. Found in a browser on the first picture tried; the
  line is four fifths.
- An **SVG** is left alone — already every size at once.
- The **format is kept**: re-encoding a PNG as JPEG is smaller and is also deciding, silently, that a
  reader's transparent background is gone.

`defer` sits beside them and stays the reader's: `lazy` on a picture above the fold delays the one
image a visitor is waiting for, and nothing but the design knows which that is.

### Still open

**This list is checked when it is read.** Three of its five entries were wrong the last time anybody
looked: an aspect ratio had been built (`aspect.ts`), two of the field kinds it called missing were
in `FIELDS`, and items 4 and 5 were the same item written twice. A list of open work that nobody
re-measures becomes a list of things that *were* open, which is worse than no list — it is a claim
with a date on it that nothing checks.

Checked again, and **two of the four were done**: a feed exists (`/블로그` draws a collection over
글 sorted by 날짜, and the date reads as a date because `value-format.ts` was written since), and the
probes' silent columns are empty. Which is the second time in a row this list was more than half
stale — the entries that survive are the ones nobody could close by writing code.

1. **Where a form's answers actually go.** The product takes an address a service gives you and does
   not have an opinion about which service. A first-party inbox is a product decision, not a schema
   one, and it is the next thing anybody will ask for.
2. **A syntax palette the document owns.** Code is told apart by weight now, because six hard-coded
   hues failed AA on a dark band and one of them was a brand colour that no longer existed. Weight
   distinguishes fewer roles than hue does; a document that wants its own is a feature nobody has
   asked for yet.
3. **What a page is *for*, beyond what it is about.** A page now says what it is about and the
   product checks that it does (below). The next thing a plan says — *what a visitor should do here*
   — has nowhere to live, and it is the one that would let the product check a drawing against an
   intention rather than against itself.


## What a page says about itself to everything that is not a browser

`description` and `image` have been on a page since the head was written. All four places were alive:
the schema declares them, `export-html` writes them, the panel offers a 설명 row and a 공유 그림 row,
and `setPageInfo` accepts both. The sample had never used either.

So the export of the one document anybody looks at was five pages carrying a `lang`, a `<title>`, a
viewport and nothing else. Every search result was whatever an engine could scrape out of the first
paragraph — on the landing page, the words 무료로 시작하기 — and every link pasted into a chat
unfurled as a bare address.

**A page that does not describe itself is a fault**, in the group `검색과 공유`, and it is the first
check in this product about something a reader cannot see while making it. Two pages are deliberately
not asked: a `notFound` page is served for a request that matched nothing, and a `noIndex` page has
*said* it does not want to be found — a fault list that argues with a reader's own settings is one
they learn to close. And a description over 160 characters is its own fault, because that is where a
search result cuts, mid-word, and the panel shows all three sentences while the world gets two.

### What describing the sample found

**A `data:` is not an address.** Every picture this sample draws is generated and inlined, so asking
what the home page's share image would be produced `og:image` pointing at a base64 string. A crawler
does not render the page: it reads the tag and *fetches* what it says. The first fix — dropping
`data:` from the absolute test — was worse, because the value then fell to the relative branch and
was pasted onto the site's address as `https://…/data:image/svg+xml;base64,…`. Refused before the
join now, which is the tag the surrounding comment already argued for and did not enforce.

**The sample did not say where it lives**, and four things need it: the canonical link, `og:url`, the
sitemap, and a share image written as a relative address. All four are written only when a site has
said — the right rule, and it meant the archive a reader downloads from the sample was missing
`sitemap.xml` and `robots.txt` with nothing anywhere explaining why. It says now.

**Five tests held because the fixture was thin.** Each read the bare sample and asserted an absence —
no canonical, no sitemap, no robots, no `_next`, no `og:image` — and each one was measuring the
document rather than the product. They empty the address on purpose now, which is the state they were
always about.


## Copying a block out of one site and into another

`clipboard-commands.ts` could copy a block and paste it — in **one** document. Measured against a
second one, the result was the fault the deck had already met once and this product had five copies
of: a page's blocks refer to things **by name**, and a name means nothing anywhere else.

| on a block | names | what a paste used to do |
|---|---|---|
| `instance.componentId` | a definition | an empty placement, drawing nothing |
| `collection.source` | a dataset | an empty list |
| `picture.src` = `asset:이름` | a file | a broken image |
| `form.sends` | a connection | a form that sends nowhere |
| any paint = `var:이름` | a variable | a colour nobody chose |

So the payload carries the definitions the copied blocks point at (`carriedFor`), and a paste adds
the ones the destination has not got (`missingFrom`), in one transaction with the blocks — a reader
who undoes a pasted card should not be left holding its dataset.

**By name, and never renamed.** A destination that already has a `강조` keeps its own, so a card
pasted into a site with a different brand comes out in *that* site's colours, which is what a reader
means by pasting a card into their site. The cost is stated rather than hidden: two documents that
use one name for two things produce a paste that draws the destination's. That is the smaller
surprise — the alternative is a document that accumulates `상품 2`, `상품 3` every time anybody pastes.

A definition inside a definition travels too. A card that holds a card is what the sample's header
already is, and carrying the first without the second is the same empty box one level down.

### Two things it found

**`pasteBlocks` could never paste into a second window.** Its `canExecute` asked whether *this*
extension was holding something — the careful-looking answer, and the one that made the system
clipboard unreachable from the window a block was **not** copied in, which is the only case the
system clipboard exists for. Nothing said so, because a greyed menu item reads as a decision. It
answers whether there is anywhere to paste now, and a paste that finds prose does nothing.

**Two of the five references had no check at all.** A dataset is checked by the collection that
reads it, a connection by the form, a file by the picture — and a `componentId` and a `var:이름`
pointing at nothing were reported by nobody. Both are now a `reference` fault, which is also what
tells a reader their paste landed in a document that could not resolve it.

## A list the visitor's browser fetches again

`refreshDataset` fetches a `kind: 'url'` dataset **in the editor**, into the document, and the
argument for that being the default has not changed: the page stays a file, a crawler reads the
rows, and a visitor whose network failed still sees something. The cost is that the rows are as
fresh as the last time somebody pressed 새로 가져오기.

For a price that changes hourly that cost is the whole problem, so `dataset.live` is the deliberate
second mode — off by default, and turning it on buys freshness with four things that are all real
and none of which are visible from the panel:

- the page ships a runtime, and a visitor whose script failed sees the published rows;
- a crawler indexes the published rows, not the live ones;
- the list moves after the first paint;
- the address has to let a stranger's browser read it, which the editor's own fetch never had to
  care about because it runs where the reader is.

**It does not re-render.** Shipping a renderer is the runtime this export exists without. It ships
the drawing it already made, marked — the list says where it came from and how it was queried, each
row says which one it is, and each drawn piece that took its words from a column says which column.
The script then fetches, runs the same filter-sort-limit, writes the cells, clones the first row when
there are more rows than were drawn, and hides the extras when there are fewer. A card that changes
*shape* per row is beyond it: a row is the design the page was published with, with different words.

That filter-sort-limit is the one rule in this product written twice — once in `rowsOf` and once in
the language the page has — so the test runs both against the same rows, including the case every
naive sort gets wrong: a price kept as a string.

And it never empties a list, which is `refreshDataset`'s rule for `refreshDataset`'s reason.


## What a browser found that the tests could not

Five features went in with unit tests, a conformance harness and 185 browser tests behind them. Then
they were opened in a browser and clicked, and four of them were broken in a way nothing had asked
about — because every check that existed asked the **document** a question, and a reader asks the
**panel**.

| what was wrong | what every check saw |
|---|---|
| every `of: 'document'` row was write-only | the command ran, the document held the value |
| the site's type never reached the boards | `typeRule` was called with the document's attributes and was right |
| `baseSize` was read as pixels and stored as twips | every unit test wrote the number it then read |
| a page table had no borders, padding or width | the model held a correct table |

The shape is the same in all four: **something writes and nothing reads, or two sides read the same
value in different units.** A test that calls a command and asks the document is blind to all of it.
`of` is the sharpest example — it had been documented for a year as *which node this row writes*, and
the word *writes* was doing all the work.

What changed as a result: the panel layers the document's attributes for those rows rather than each
control reading its own way (five controls read a value; a fix in four of them is the bug still
there), and there are now browser tests that assert a control **shows what the document holds** —
which is the only kind of test that could have caught any of this.


## Two inks, and the nine sentences a layout could not say

The sample was a green SaaS page: six hues with no dominance, three equal cards, a centred column of
prose, and forty-seven hard-coded colours in a document with ten tokens. Redrawn against a two-ink
editorial discipline — one plate dominant, one spent sparingly, the paper deliberately visible — and
the redraw is what found everything below.

### What the schema could not say, and now can

| | what it says | where the argument is |
|---|---|---|
| `rotate` | the one deliberate disruption | `effectsCss` |
| `opacity` | how much comes through — **it was read and never declared** | `site-schema.ts` |
| `blend` | how a box mixes with what is under it; `multiply` is a second ink on paper | `effectsCss` |
| `backdropBlur` | frosted glass, visible only through a translucent fill | `effectsCss` |
| `letterSpacing` / `lineHeight` | the rhythm the words in a box are set at, as **percentages of their own size** | `typeRhythmCss` |
| `overlay` / `overlayOpacity` | a sheet **over** the picture, which no layer could reach | `backgroundCss` |
| `span` | how many columns of a grid a block takes — what turns tiles into a bento | `sizingCss` |
| `centred` | where a capped block sits, which is a second decision from how wide | `sizingCss` |

Two of those are worth their own line. **`opacity` was read by `paintCss` and offered by a panel row
and never declared by the schema** — so the row wrote an attribute the validator threw away, a
control that lit up and changed nothing. The harness asks whether every declared attribute is drawn;
nothing asked the question the other way round. And **`centred`** exists because the first version
inferred it from *has a maximum width*, which is right nine times out of ten and pushed every reading
measure on the page into the middle the tenth.

### An attribute has to be in four places to be alive

Declared in the schema, drawn by a renderer, offered by a panel row, and named in the command's
`FORMAT` list. Three of the four is a control that lights up and writes nothing — six of these
shipped that way, and **the conformance harness could not see it**: it checks that a row exists, not
that the command the row names will accept what the row sends. What caught them was the browser
sweep that drives every control and asks the document whether anything moved.

### What the palette change found

- **A run cannot follow a token.** A mark's colour is a CSS string, and `named` resolves references
  on a node's *attributes* — a mark is not one. So every coloured word was a hard-coded hex. The
  answer is not to make marks resolve tokens; it is that **the accent belongs on a plate, not on a
  word**, which is what the two-ink discipline says anyway. The remaining inline colours are three
  statistics and two button labels, and they are listed in `BACKLOG.md`.
- **Quiet text is not a colour a document holds.** Forty-seven muted sentences each carried their own
  grey. Wrapping each in a box that states `ink` works and costs forty-seven boxes in the layer list.
  It is one rule in `page-css.ts` instead — body text is the band's own ink at three-quarters, written
  against `currentColor`, so a dark band gets a soft off-white from the same line.
- **The footer went black on black.** It stated `fill: 'var:먹'` and never said what was written on
  it, relying on those run colours; the day they went, so did the footer. Which is the fault `ink`
  was added to make impossible, sitting in the document the whole time the workaround was in place.
- **A band with a centred measure could not be said.** It worked by accident: the band centred its
  child, and a centred flex child is *as wide as its content* — so a section whose widest block was a
  row of cards began at the page margin and one whose widest block was a paragraph began 225px
  further in. Three different left edges for seven headings of one page.
- **Korean wraps mid-word by default.** The sample's own headline broke as 세 가 / 지를. `keep-all`,
  paired with `overflow-wrap`, or one unbreakable string pushes the page sideways.
- **A page table had no table in it** — no borders, no padding, 156px wide, because nothing in the
  stylesheet had ever mentioned one.

### And the tests that were asserting the design

Six checks held one of the sample's hex values — a hover colour, a band's ink, a card's ground — and
a change of palette broke every one of them. None is about a colour: what they claim is that a
*token resolves*. They ask the document now. The two that were genuinely about a colour the test
itself wrote keep their literal, named so it is obvious which is which; mixing the two is what made a
repaint look like a broken feature.


## The check that was missing, and the six dead controls it found

The redesign shipped six attributes that were declared, drawn and given a panel row, with the
command every one of those rows named refusing all six — controls that took a value and threw it
away. **Every conformance check was green**, and correctly: `every-property-can-be-edited` asks
whether an attribute has a row, and every one of them did.

So there is a new check, `every-row-writes-what-it-names`, and it asks the question a reader asks:
**use the row, and did the document move?** The product does the using, for the reason
`every-command-does-something` does — what a row needs before it can be used is a fact about that
product — and it answers three ways, the third being the one that keeps it honest: `null` for a row
the product could not get into a state to try, counted rather than passed.

### What it found on its first run

| row | what was wrong |
|---|---|
| 블록 안 글자 색 (`ink`) | never in the command's list — **the row had never written anything** |
| 여는 것 · 처음부터 열림 · 하나만 (`opens`, `openAtRest`, `opensOne`) | the same, on an accordion's three switches |
| 제목 단계 (`level`) | a `<select>`'s value is a string and the schema declares a number, so the validator threw the whole transaction away |
| 고를 것 (`choices`) | *the probe's* fault — it sent a word into an array attribute |

`ink` is the sharpest of them. It is the attribute a band's readability rests on — the sample's
footer went black on black the day its runs stopped carrying colours of their own, and `ink` is what
fixed that, **from the document literal, because from the panel it could not be set at all**.

`level` produced a fix in the product as well: the panel now asks the schema what kind an attribute
is and converts, rather than sending whatever the DOM handed it. Derived rather than listed, because
a list of numeric attributes is wrong the first time one is added.

### And what the probe itself had to learn

Twice the probe reported a working control as dead, and both are worth keeping:

- it picked the first option a choice offers, the first block of the home page is a sticky header,
  and 배치 방식's first option is 고정 — so it wrote 고정 onto something already 고정 and watched
  nothing change. *A sweep that writes the value already there is measuring itself*, which is the
  same sentence the browser's own sweep wrote about 투명도 before this check existed.
- it walked one page and skipped the pages themselves, leaving **38 of 92 rows unanswered** — the
  form is on 소개, a code block is on 블로그, and twelve rows are `on: ['surface']`, which is a page
  and never *inside* one. Fourteen remain, and they are listed by name in the test rather than left
  as a number, because a silent column is how a guard stops guarding without anyone noticing.


## A table in the sample, and the insert it broke

Eight table commands were registered, drawn, menued and **measured by nothing**: the one document
every probe in this repository runs against had no table in it, so there was no cell to put a caret
in and the harness counted all eight as *could not be asked*. Honestly, and silently.

The pricing page said *어느 요금제든 이건 됩니다* over four boxes, which is what a comparison looks
like when the model cannot hold one — a reader cannot scan a column and a screen reader gets a wall
of words with no column names. It is a real table now: features down the side, products across the
top, a header row from the start.

### What it found within the hour

**Every insert this product has was dead while the caret was in a table cell.** 섹션, 가로 스택,
그리드, 제목, 본문, 이미지, 목록, 인용, 코드, 구분선, 표, 버튼 — the whole 추가 rail and the whole
삽입 menu, each saying it could run, running, returning false, and changing nothing.

Two walks climb from the caret to a place a block goes, and both stopped at the cell: a cell is a
block a reader can select (it has to be — that is what lets them type in one), and its parent is a
`bTableRow`, which holds cells and nothing else. So each insert put a frame inside a table row, the
validator refused the transaction, and the control stayed lit.

The rule is one function now, `holdsABlock`, asked of the **schema** rather than kept as a list of
types a block may not go inside — a list is a second place to remember the schema and is wrong the
first time a type is added. A type the schema does not know answers *yes*, which is the safe
direction: a walk that stops too early is a refused insert a reader can see, and one that stops too
late is a block somewhere nobody put it.

### And the probe learned two things

- **`command.includes('Row')` also catches `insertRow`**, which is this product's 가로 스택 and has
  nothing to do with a table. The probe put a caret in a cell for it and reported a working insert as
  dead — a probe deciding what a command is about from its spelling.
- The command probe answered **25 of 62** commands with *could not ask*. It walked one page, held the
  first block, and knew one payload shape. It now names what each command needs, moves to the second
  block for `moveBlockUp`, makes an edit before asking about `undo`, and puts a caret in a cell for
  the eight. **25 became 11**, and the eleven are printed by name.


## A token at a weight

A palette holds one value per name. A design wants that value at a *fraction* constantly — a frosted
bar over a hero, a scrim, a hairline, a disabled control — and until now every one of those was a
literal `rgba(...)` written beside the token it was a fraction of. Which is a colour that **stops
following the palette**: change 종이 and the bar keeps the old paper at 82%, on every page, silently.
This sample's own header bar was exactly that, and it went into the backlog the day it was written.

A reference may carry one now: `var:종이/82`.

- **A suffix, not a second token.** A token per weight is how a palette becomes forty names — 종이,
  종이흐림, 종이더흐림 — each one a place the real decision can drift from. A weight is not a colour;
  it is something being done to one.
- **A slash**, because that is CSS's own in `rgb(0 0 0 / 40%)`, so a reader who has written a colour
  has seen it mean this. Nothing in a variable's name can contain one.
- **Mixed toward `transparent`**, not toward a ground: the resolver cannot see what is behind the
  colour, and a colour with an alpha works wherever a colour goes — a fill, a border, a shadow, the
  text. The same reason a background's veil composites a sheet instead of setting `opacity`.
- **Only on a colour.** A weight on a text variable is a typo, and mixing a word with transparent
  would put `color-mix(in srgb, Barocss 82%, transparent)` into a stylesheet — a value a browser
  drops without a word. It is handed back whole, where it reads as the mistake it is.

Everything that counts, renames or carries a reference reads its name through `varNameOf`, so a
weight cost none of them a change — which is the argument for putting it in the reference.

### And the panel had to be able to say it

`office-ui` must not learn how a document spells a weighted reference, so the colour field takes
three things from its caller: which swatch the value is **following**, how much of it, and what to do
when a reader changes that. A caller with no weights passes none of them and the control behaves
exactly as it did. The trigger draws the swatch *at* the weight, because a swatch that showed the
full colour would be a reader choosing the wrong thing twice.


## The other three pages, and what redrawing them found

제품, 소개 and 블로그 had never been redrawn against the two-ink discipline. Three things were wrong
in the same way on all three:

- **No plate.** The home page opens every section with a short accent bar and these opened with
  nothing, so a reader moving between them met two different sites.
- **The second ink spent on decoration.** The team portraits and the blog cover were drawn *in* the
  accent — one blog post put more red on the page than every button, badge and plate on the site put
  together. They are charcoal now, each with a single accent mark. A second plate spent on a
  decoration is a second plate that has stopped meaning anything.
- **Six equal cards.** 제품's feature grid was 3×2 of identical boxes, which is what a page looks like
  when the writer had six things and no opinion. The three the page is *about* take two columns each
  and the three that follow from them take one — visible before a word is read.

### Three faults it turned up

**A form's controls had no rule at all.** Measured on the sample's own contact form: the label was
290px wide and the box under it 147, because a text input's width comes from a `size` attribute
nobody set. Every published form this product has ever made looked like that, on the board and on the
page, and no check could see it — a field that draws is a field that draws.

**A date column that was only a minimum.** Three rows on the blog, two left edges: one date happened
to be a character longer, grew past its `minWidth`, and pushed its title four pixels right. A column
is a minimum *and* a maximum.

**The accent could not carry words.** `#E03A1F` with the paper on it is **4.24:1** — under AA for
text at body size, on every button, badge and price on the site, looking perfectly fine the whole
time. It is `#D6341A` now, at 4.65:1, and the two are indistinguishable side by side.

The rule: **an accent that carries words has to be measured against them.** A plate the words sit
beside can be any weight; a plate they sit *on* cannot.

### And a contrast check that runs on the published pages

It needs three things a unit test cannot have — the *composited* colour (a token at a weight is an
alpha, and its readability is the readability of what it becomes over the ground), the *inherited*
colour (body text is the band's own ink held back, which resolves differently on every band), and a
real layout to say which ground that is. Five pages at two widths, every run of words.

It has already earned its place twice: the accent above, and the footer that went black on black
because it said what it was painted and not what it was written in.


## A code block in the sample, and the stale palette under it

`code-render.ts` highlights with Prism, the panel offers a language, and **no document in this
repository contained a code block** — so every probe answered *could not ask* about the language row,
and no highlighted line had ever been drawn. The same argument the table made an hour earlier, and
the table found a real fault the same day.

This one did too. The syntax theme's header said its colours were "against `currentColor` rather
than a fixed palette" and six of the nine roles were hard-coded hex. Measured on the two grounds the
product actually draws code on:

- on the light code ground, the string colour is **4.05:1** — under AA;
- on a dark band, **all six fail**, between 3.17 and 4.05.

And one of them was `#0F7A5A` — the brand green, gone from every other file since the palette was
redrawn. A stale colour nobody could see, in a stylesheet nothing measured.

The roles are told apart by **weight** now, the way a printed book tells them apart: a comment
recedes, a string leans, a keyword carries the weight. Every one is `currentColor`, so it reads on
the paper and on the dark band from one rule and follows a repainted palette by construction. The
two that survive as hues are `deleted` and `inserted`, because a diff says *added* and *removed* and
no amount of weight says which is which.

The cost is stated rather than hidden: six hues distinguish more roles than four weights. For a
snippet on a page that is the right trade — the code is there to be read, not edited.


## An exemption that answered a question it was never asked

`sends` — which connection a form sends through — had a panel row, a command, and **no entry in that
command's list of fields**. The 보낼 곳 연결 picker on every form has accepted a choice and thrown it
away for as long as forms have existed.

The check that runs every row *found it*. And an exemption on `sends`, written months earlier about a
completely different question — whether the attribute is **read**, and the answer was a careful and
true "only on the published page" — swallowed the finding, because an exemption is keyed by its
**subject** and never by the check it was written for.

So a reason about reading answered a question about writing, and nothing could see it happen.

### What changed

An exemption may now say which checks its reason covers:

```ts
sends: { reason: '…', covers: ['every-attribute-is-read'] }
```

A bare string still means what it always did — one subject, one check, the ordinary case. What is new
is that an exemption excusing a check it does not name is a **finding**: somebody reads the reason
again and decides. Not an error, because one reason genuinely can answer two checks — *a page has no
coordinates* is why a rectangle is neither drawn nor nameable here, and writing it twice would be two
places to keep it true. Fifteen of the site's exemptions are exactly that and now say so.

The two that were not: `sends`, above, and `opens` — where the finding turned out to be the probe's
(the row runs `setOpens`, which takes a `target` and writes two blocks, and had been handed the
row's own attribute).

### And "it said no" is two answers

A row's command refusing is either *I could not build the state* — not a fault — or *this command
will not take this field*, which is the fault. Filed as one, the second hides inside the first, which
is where `sends` had been sitting. They are told apart by asking the same command for something it
certainly takes: every block has a `name`, so a command that says yes to that on this selection and
no to the row's own attribute was never short of state.


## A file field, and the one thing it changes about the form

`FIELDS` was missing exactly one kind, and it is the one whose presence changes the **form** rather
than only itself. A browser sends a form as `application/x-www-form-urlencoded` unless told
otherwise, and that encoding cannot carry a file — so a form with a file field and no `enctype` sends
every other answer and **silently drops the attachment**. Nothing errors, nothing is logged, and the
person who attached it has no idea.

So `needsUpload` asks the fields, and the form writes `enctype` only when one of them is a file —
every form already published is byte-for-byte what it was.

Three smaller decisions came with it:

- **Disabled on the board, not read-only.** `readonly` means nothing to a file input, so a designer
  arranging the form would open a file picker by clicking it. The same choice a tick and a list
  already make.
- **Derived, not stored.** Whether the form uploads is read from the fields it holds; a stored copy
  is a second thing to keep true the day the field is deleted — `hiddenFields`' argument exactly.
- **The far end is said, not guessed.** Whether the service accepts `multipart/form-data` is a fact
  about somebody else's server. A builder that assumed it does would be telling a reader their form
  works while the file is dropped at the other end, which is this fault list's whole subject: a thing
  that looks completely fine and loses the one answer that mattered.


## Three things a reader asked for

### Pulling a block bigger

A page has **no coordinates** — where a block sits is a parent and a place in that parent's content —
so seven of the eight handles a canvas offers would be lying about what they can do. Two are honest:
how wide a block may be, and how tall it must be. The right edge writes `maxWidth` (and `minWidth` as
well on a `fixed` block, which takes its width from the pair), and the bottom writes `minHeight` and
deliberately not `maxHeight` — a maximum clips what is inside, and a reader pulling a box taller
means *at least this tall*.

The drag is the padding band's drag: the drawing moves, and the document hears once, on release, in
twips. Word learned that on its ruler and this file learned it again on the bands.

**And the rule that keeps the two apart**, which cost a working gesture to find: the first version
shared six pixels with the padding band and won them, so a padding drag silently stopped writing. The
handles are entirely outside the box now, and the sentence is one a reader can hold — **inside the
edge is the space in it, outside the edge is how big it is.**

### A `+` beside the tool

Everything it opens is already reachable: the 추가 rail draws it, the 삽입 menu names it, the slash
menu offers it at the caret. What none of those is, is *here* — where the pointer already is, on a
screen whose rail may be showing pages or data or nothing at all.

So it is a **fourth doorway and not a fourth list**: it reads `siteControlsIn('insert')`, the same
declaration the rail reads, plus the document's own definitions — which sit in a different panel only
because a rail has one column, and a reader wanting a button on the page does not first decide
whether a button is an element or one of their definitions.

It also needed the page: the model has no notion of *on screen*, so every surface that inserts is
handed it, and without it every entry was greyed on a freshly opened site — the exact fault the rail
had before it was given one.

**And it found three icons that were words.** 아코디언, 탭 and 폼 named `accordion`, `tabs` and
`form`, none of which this suite draws, so all three rendered as their own names in Latin letters —
in the rail as well, since the day those blocks were added. `every-icon-has-a-picture` was green,
because a missing icon is reported with the family `icon` and an exemption written about the
**favicon attribute** happens to be keyed `icon` too. That exemption says which check it covers now,
and the three have pictures.

### Where the data is edited

It already exists: the left rail's 데이터 panel, and the ✎ beside each dataset. A real grid — column
names, add and delete a column, add and delete a row, every cell. What it was not yet was *Excel*,
and the two gestures that made the difference are below.


## Making the data grid feel like a spreadsheet

The reason a dataset exists is that the data is **somewhere else** — a spreadsheet, a page, a CSV
somebody was sent — and typing forty cells back in one at a time is the work this feature was
supposed to remove. Two gestures were missing.

### A block of cells, pasted

At the focused cell, from tabs and newlines, which is what every spreadsheet puts on a clipboard.

- **One command, one undo.** Forty `setDatasetCell`s would be forty entries in the history: the undo
  that puts it back is forty presses, and the thirty-ninth leaves a half-pasted table that nothing on
  screen explains. `setDatasetCells` writes the block in one transaction — the padding drag's rule,
  and the ruler's before it.
- **Rows grow; columns do not.** Eight rows into a table of three means eight, because stopping at
  three would silently drop five and look exactly like a paste that worked. A wider paste is trimmed,
  because a column has a **name** — one `field:가격` refers to and a card is bound through — and a
  paste cannot invent one. `엑셀 열 6` in a document is worse than five columns.
- **A single value is left to the browser.** A paste with no tab and no newline is one value, and
  handling it here would take a gesture the browser does perfectly and do it worse — the box would
  lose its selection, its caret and its own undo.

The command is reachable by **pasting into a cell** and by nothing else, which is an event rather
than a surface. That is an exemption with a reason, and the reason names the two checks it answers.

### Moving by direction

Tab already worked, and that is exactly the problem: tab order walks *along a row and into the delete
button at the end of it*, which is where a reader pressing it to reach the next column arrives.

Up and down always. Left and right **only from an end** — those keys are the caret's while there is
a word to move in, and taking them would make the grid useless for what it is mostly used for. Enter
is down, Shift+Enter is up. Landing on a cell selects it, because that is what a grid means by
arriving somewhere.

It was written once as a `keydown` on the scroll box and never fired: `TextField` stops the event on
purpose, so an Enter that commits a field cannot also reach the paragraph inside the shape being
edited. `onKeys` is the door that control declares for exactly this — and going through it is the
better shape anyway, because the handler is handed its own row and column rather than parsing them
back out of an attribute.

## Three gestures a designer's hands already know

Measured against Figma with a real page open, asking only *what would my hands try*. Three answers,
and each one turned out to be a gap the model could describe and the product could not do.

### 묶기 is a frame

A page has no `group` node and should not get one: a group in a drawing tool is a z-order over shapes
that place themselves, and a page **stacks**. What a group means here is *these blocks are one thing
in the flow*, and a frame is already exactly that — the same argument `detachComponent` makes about a
component being a frame with a name.

So the decisions are all about not disturbing what it wraps:

- **The parent's direction**, so a row groups into a row. A grid counts as a row, because its children
  sit beside each other and three cells grouped into a column would stack where nothing around them
  does. The grid keeps its columns; the group takes one cell's worth.
- **The first block's index**, so the group appears where the reader was looking rather than at the
  end of the page.
- **Where they sit, not the order they were clicked.** A reader who shift-clicked bottom-to-top did
  not mean to reverse them.
- **It refuses blocks in different parents.** Grouping across two sections has to move at least one of
  them somewhere else, and a reader who wanted that would have dragged it.
- **Ungrouping leaves the children selected.** A reader takes a group apart in order to do something
  to the things that were in it, and being left holding a frame that no longer exists is being left
  holding nothing. The children come back as new marks — they are rebuilt from exported trees — so
  they are read back out of the page rather than remembered.

### A number field can be dragged

Measured by watching a padding get set: click the field, select the digits, type, tab out, look at the
page, click again. **Six actions to try one number**, and trying numbers is most of what laying out a
page is. Every inspector of this kind answers it on the same target — the small name or picture to the
left of the digits, which is otherwise decoration.

One pixel is one `step`, which matters more here than it looks: the model's unit is the twip, so a
field counting in screen pixels would need fifteen of them to move a point. Shift is ten times, Alt a
tenth — the arrow keys' own modifiers in the same field.

**One write, on release.** Not a choice about feel: Word's ruler measured that writing on every
pointer move turns one drag into ten entries of history, and a reader's undo then walks back through
positions the box was never meant to be in. The number under the pointer is live; the document is
written once, exactly as if it had been typed. The board's own drags follow the same rule from the
other side, previewing with inline style and writing at release.

And the arithmetic is a **function** — `scrubbedTo` — rather than a pointer handler, for the reason
`readNumberField` is: it is wrong at the edges (a step of 0.1 with a modifier on it, a minimum a fast
drag flies past) and a rule inside a handler can only be measured by moving a real pointer thirty
times.

### A field keeps only the keys it has a meaning for

Found by the drag above. With the caret in a panel field, ⌘Z did nothing at all: the field's own
keydown handler stops every key so that *`Delete` in a number box is a digit* — which is true of bare
keys and of almost no chord. A reader had to click the board before they could undo what they had just
done in the panel.

`fieldKeeps` is the one answer both layers ask for, exported from `office-ui` because the app's key
handler asks the same question of `document.activeElement`. The clipboard and select-all stay the
field's, because a reader copying digits out of a box means the box; everything else held with ⌘ or
Ctrl is the document's, which is what undo, group, duplicate and save do from a panel in every tool of
this kind.

### And the size is drawn the whole time

Reported as *여전히 객체 resize 가 어떻게 동작하는지 모르겠어*, and half of it was that the readout only
existed **while** a block was being pulled: there was nothing to compare a pull against, and no way to
tell a block that fills its stack from one set to exactly that width. The settled size is under the
selection now, where every design tool draws it, quieter than the live one and only for a single
selection — six chips over six cards is six numbers a reader has to match to boxes by eye.

## 와이어프레임은 보기이지 문서가 아니다

Asked as a choice between two things — a filter over the page, or a wireframe editor beside the site
builder — and it is neither.

**A separate editor is a second document.** Two documents have to be kept in step, and keeping them in
step is the work that makes a plan and a design drift apart; it is the thing *선언하고, 검사한다* was
chosen to avoid. The premise of this repository is one schema and one renderer across three products.
A wireframe is not a different document. It is the same page with the finish taken off.

**A filter alone cannot say what a thing is.** `grayscale()` gives a page with the colour taken out,
which is a different thing from a wireframe: the job is to show structure and intent, so the grey box
where a form was has to be able to say 폼.

So it is a third **view**, beside 미리보기 — which is already a view rather than a command, because
nothing in the site changes and there is nothing to undo. The sheet is generated from the document the
way `editorStateCss` and `revealRules` already are, and keys its selectors on `data-bc-sid` the way
they do, so nothing new is written into the drawing and nothing reaches a published page.

### Grey is the removal. The wireframe is what goes in its place

Four things are in it, and each one arrived because the version without it was wrong:

1. **Colour, shadow and photographs down**, so what is left drawing the eye is size, order and space.
2. **The boxes that go unreadable say what they are** — 폼 · 데이터 목록 · 표 · 코드. Not everything:
   `instance` was on that list for one screenshot and put 컴포넌트 on a dozen things at once, over the
   words on a button among them. A placement draws its own content; a reader can see what it is.
3. **Anything with a rounded corner keeps a hairline.** A button here is a frame with a fill, so
   laying fills down to grey made the page's one call to action vanish. What separates a band from a
   control in the drawing is the radius — and the same rule draws every card as a box, which is what
   a wireframe is for.
4. **The layout is untouched to the pixel**, which cost the nicest version of this. Emptying the media
   with `content: url()` gave a hatched box with a caption in it and changed every picture's size,
   because it replaces the intrinsic size an auto-width image lays out from. Washing with
   `contrast(0)` changes nothing a layout can see. An `outline` rather than a border, for the same
   reason at one pixel.

### And four things it should draw and does not

Every one is a fact the document already holds:

- **Reading order** — 1 · 2 · 3 down the sections. Half the reason anybody shows a wireframe to
  somebody else is *this is the order it reads in*.
- **What this width hides.** `neverShown` and the per-width hiding are in the schema; a section that
  drops out on the tablet currently looks exactly like a section that does not exist.
- **The one thing a visitor is here to do**, which is an open question of its own. Five buttons at one
  weight is a page with no answer; in a wireframe the answer is the one heavy outline.
- **Spacing and direction**, which the editor draws as bands and gap strips and this does not — and
  *여기가 좁다* is most of what a reviewer has to say.

### What is deliberately out

**Annotations.** A note is information the page does not have, so putting it in the document makes it
publishable, and at that moment "one document" is over. The point where annotations become genuinely
necessary — arrows between screens, a screen that does not exist yet — is the point where a **화면
흐름도** is necessary, and that is a different product.

## 폭은 문서의 것이다

Asked as three things that turned out to be one: *사이즈를 더 추가할 수도 있지 않을까 / 순서도 바꿀 수
있어야할 듯 / 미리보기에 실제 장치 테두리가 있으면*. All three are the same missing fact — **the list of
widths belongs to the document** — and today it is a `const` in `breakpoints.ts` with three entries.

### Why a node and not an array

A width is **referred to by name**. Every `overrides` key in every document is one (`{ mobile: … }`),
the boards are keyed by it, and `attrsAt` walks it. That is this repository's reference shape, used
seven times already, and the answer it has always given is a **declared node**: `variable` is the
closest match and settles the two-field question as well — a **durable `name`** that references point
at and cannot be renamed, and a `label` a reader changes freely.

    widths: { content: 'width*' }
    width:  { name, label?, size, viewport?, icon? }

`size` rather than `width`, because an attribute called `width` on a node called `width` is a sentence
nobody can read. Both are CSS pixels, which is the unit a breakpoint is written in everywhere on the
web; the document is still in twips and the conversion stays where a length is drawn.

### What stops being a constant

- `BASE_BREAKPOINT` — the widest, computed rather than named. `desktop` is the widest *today*.
- `OVERRIDABLE` — every width but the base.
- `scopesFor` — narrowest-first from the width being drawn up to the base, which is a sort by `size`
  rather than the hard-coded `['mobile', 'tablet', 'desktop']`.
- `BreakpointId` — a `string`, because a reader can name one.

An override written at a width the document no longer has is **kept and not applied**. Deleting a
width is not a reason to destroy the work done at it, and a file that silently lost half a design
because somebody tidied a list is the worst kind of data loss: invisible.

### The order is the document's

Weighed both ways. It is a fact about how *this site's author* works rather than about the site — but
there is no per-reader store in this product, so a reader-owned order would vanish on reload, and an
order that will not stay put is worse than one kept in a slightly wrong place. The published CSS does
not care either way: its media queries are sorted by `size` regardless, so the list's order is purely
which board sits where.

### The device is a width's, not a mode's

A device frame in preview is *what this width is a window onto*, so it belongs beside `size` and
`viewport` rather than being a second idea. Choosing a device fills all three in — which is the answer
to *장치별로 사이즈가 자동으로 바뀌던가*: the device is a shorthand for the numbers, and the numbers stay
the thing the document holds.

## 폭이 문서의 것이 되고 나서 드러난 것들

The list of widths moving into the document was one change, and it turned four other things into
faults that had been sitting there — which is the usual shape of this work: a constant is a place
where nothing can be wrong, and the moment it becomes data every reader of it has to be honest.

### `desktop` was not the base. The widest is

`BASE_BREAKPOINT` said `'desktop'`, and that was true of the three there were rather than of anything.
The widest **is** the base, because a node's own attributes are what the widest width draws — so it is
computed, and a reader who adds a wider width moves it.

`scopesFor` was `['mobile', 'tablet', 'desktop']` and is a sort by size. A width added between two
resolves between them, which is the whole reason for being able to add one.

### An override at a width the document no longer has is kept

`overridesOf` filtered to the three ids it knew. Now it keeps every scope it finds, and `scopesFor`
decides which apply — so deleting a width leaves the work done at it in the file, and putting the
width back brings the design back with it. A file that silently lost half a design because somebody
tidied a list is the worst kind of data loss, because nothing on screen says it happened.

### The scopes travel in the env, not the list

A renderer is handed a node and an env, and which widths a drawing resolves through is a fact about the
**document**. So `createSiteEnv` works the order out once per view and the renderer asks for it —
`scopesOf(env)` — which is the same seam that told one view it was the notes pane and one view which
width it is. The env is the only per-view channel there is.

### The first change writes the list down

Three widths with no `widths` box is a document drawing at the **default**, and the default is not
nodes. So every command that acts on a width materialises the list first — which is what `insertWidth`
had done from the day it existed, for the mirror-image reason: a first insert that wrote one width
alone would make `widthsOf` return it by itself and three boards would silently become one.

A document that never touches its widths never grows a box. Nothing changes in any file already
written until a reader asks for something the constant could not say.

### A device is a shorthand for the numbers

Choosing one writes the width, the window height and the picture, and remembers which device they came
from. Typing a number afterwards keeps the name and stops matching it, and the panel says 직접 입력
rather than claiming a phone the page is not drawn at. The frame preview draws is a **shape** — a
bezel of the right thickness and the right corner radius — because a photograph of a phone is a
licensing question, 200KB per device, and wrong the year the phone changes.

## 이 제품은 사이트를 발행하는 문서 도구다

Asked directly, after a session of building: *실제로 업무에서 쓴다고 생각해보자. 우리가 지금 만들고 있는
개념이 맞는 개념이야?* Two concepts are possible for a tool of this kind, and they are not variations
of each other — they disagree about what the document **is**.

**(가) A design tool that emits a site.** The model is boxes at coordinates; the output is an
application with a runtime that reproduces the design. Figma Sites and Framer are this.

**(나) A document tool that publishes a site.** The model is structured content — pages, stacks,
text, data — and the output is documents: HTML and CSS that a browser draws by itself.

**This is (나), and the choice is now on the record.** Everything this product is unusual for comes
from it:

- The published page carries **zero bytes of script** but the two named exceptions, so it is fast,
  findable, and readable in ten years.
- The editor and the export **cannot disagree**, because they are the same renderers. The commonest
  distrust of this kind of tool — *the preview lied* — is structurally impossible here.
- One document holds pages, widths, components, variables, datasets, files and connections, so there
  is one thing to version and one thing to diff.

The UI, meanwhile, is (가)-shaped: free placement, snapping, eight handles, marquee selection. That
tension is deliberate and worth naming rather than resolving — a designer's hands know that UI, and
the model underneath does not have to be the one their last tool had.

### What choosing (나) settles by itself

**Absolute placement is a decoration layer, not a peer of stacking.** The premise of (나) is that a
page **re-flows**, and `position: absolute` is the one attribute that opts out of it. Per-width
overrides make the cost double: a block placed by coordinates has to be re-placed at **every width,
by hand**, and a document that does not say so is a document that let a reader promise something they
did not know they were promising.

Demoted by **honesty rather than by removal**: the gesture stays — it is what makes a page rich, and
it was asked for — and the document says where it is incomplete. Which is what `faults.ts` is for.

### And what it puts in order

1. **A page from a template.** The biggest modelling question left, and the one that is a migration if
   it is answered late. `collection` + `dataset` answers *a list on a page*; a blog is **one template,
   N entries, each with its own address and its own rich body**. A body is not a cell in a table: an
   address, a search result and formatted text are a page's properties, not a datum's. So an entry is
   a page from a template, and data is what makes *lists*.
2. **Where a publish goes, and what went.** `exportSite` hands back HTML, and `publish-commands.ts`
   already says the day this grows a deploy target it is a different answer. That day is the first day
   anybody uses it at work: where it goes, who pressed it, what shipped, how to roll back. There is no
   publish history at all today.
3. **A place for whoever only writes.** Not collaboration — that is deferred and the order was agreed.
   The half that is not: in real work the owner of the layout and the owner of the words are different
   people, and today changing a word comes with permission to break the layout.
4. **Relative lengths.** The document keeps twips, which is Word's unit and an absolute one. The web's
   lengths are relative — `%`, `rem`, `vw`, `min()`, `clamp()` — and `sizing: fill | hug | fixed` with
   twip bounds covers a great deal and cannot say *half the parent* or *min(90vw, 1200px)*. That is a
   boundary of the model rather than an omission, and the schema is not frozen.

## 한 템플릿, N개의 페이지

The biggest modelling question this product had left, and the answer turned out to be **one
attribute** — because the machinery had been built two years' worth of decisions ago, for something
else.

### An entry is a page, not a row

`collection` answers *a list on a page*: cards drawn from a dataset. It cannot answer *a page of the
list's own*, and a blog needs that. An **address** a visitor can be sent, a **description** a search
result shows, and a body that is **formatted text** are a page's properties; a datum has none of
them, and a body is not a cell in a table.

So: an entry is a `surface` with a `template`, and data is what makes lists. Deciding it the other way
round — an entry as a dataset row with a rich-text column — would have made every page property a
column and every column a page property, and the migration out of that is the whole document.

### Why it is one attribute

A definition may hold a part marked `slot`, and `instanceParts` puts the placement's **own children**
there. A template page is that sentence with a page in the placement's position: it names a
definition, and what a reader sees is the definition with this page's blocks in its slot. The store's
content resolver is where it happens — the same seam a placement is resolved through, and for the
same measured reason a renderer cannot do it.

The page's **stored** children are untouched, so the save says what a reader has: a page, its blocks,
and the name of the thing that draws them.

### Two things it found

- **`slot` was declared and drawn and offered nowhere.** Three of the four places an attribute has to
  be in to be alive. A reader could name a template for a page and had no way to say where the page's
  blocks go — and a template with no slot draws none of them, which is the worst kind of silence: the
  words are in the file, in the layer list, and nowhere on screen. There is a row now, and a fault
  that says it when a page is drawn through a slotless template.
- **`instanceParts` searched for the slot in the top-level parts only.** `resolvePart` has always
  *filled* a nested one; what was shallow was the finding. So a definition whose slot was two levels
  down dropped the placement's children in silence — which is the ordinary shape, not an exotic one:
  a card with a header above its slot, or a page template with the site's header above and its footer
  below. Measured on the first template ever chosen.

## 발행은 내보내기가 아니다

`exportSite` hands back what to write and records nothing. That is exactly right for the gesture it
is — *give me the files*, which a reader does to look at something or to hand it to somebody — and it
is not a publish.

Work needs four things, and the shape says which of them are answerable:

| | |
| --- | --- |
| **어디로** | `document.publishTo`, a connection's name — a deploy target is exactly what a `service` already is |
| **무엇이·언제** | a `publish` record: the instant, how many pages, a digest |
| **누가** | empty until there are accounts. A name the tool invented would be a lie in a record whose entire value is being trustworthy |
| **되돌리기** | **not offered.** A copy of every published page would multiply the file by the number of publishes, and a document that grows every time a reader presses a button is one they stop pressing |

What is left is the question a reader actually asks — *is what is live the same as what I have?* —
answered by comparing two strings, with no rendering and no network. Three answers, because **never
published is not behind**: a builder that said 바뀐 것이 있습니다 on the day somebody started would
be one that cried wolf on day one.

### What the digest counts, and what it must not

Of the **document** rather than of the output: comparing outputs means rendering the whole site to
find out, and a publish that produced identical HTML from an edited document is still one a reader
wants to know about.

And it took two corrections, both the same shape — *counting things the reader did not change*:

- **The record itself.** Writing a publish changes the document, so a digest taken before the write
  stopped matching the instant it landed: a site was *behind* one moment after being published, every
  time.
- **`sid` and `metadata.loadedAt`.** Sids are minted per session and `loadedAt` is *when this file was
  opened*, so the same document read thirteen milliseconds apart hashed differently. A reader who
  opens their site and is told it has changed learns to ignore the answer.

## 글만 고치는 자리

The third thing work needs, and the one that is **not** collaboration — that is deferred, and the
order was agreed. This is the half of it that is not about two people editing at once: in real work
the owner of the layout and the owner of the words are different people, and today changing a word
comes with permission to break the layout.

### A mode, not a permission — and saying so

There are no accounts, so *this person may only write* cannot be enforced and must not be claimed. A
mode is what can honestly be built: a reader **chooses** to be in it, the way they choose preview.
Which is what Webflow's Editor and a locked Notion page are, and it is genuinely useful — most of the
damage a writer does to a layout is done by accident, and a mode stops all of it.

The day this product has accounts, the mode becomes the shape a permission is expressed in. Nothing
about the declaration changes; what changes is who may leave it.

### One declaration, four surfaces

`stateableIn` is the precedent: a list of what may change in a state, read by the panel so a row that
cannot apply is not drawn. The same shape here, and it has to be **commands** rather than attributes,
because what a writer is refused is mostly *acts* — adding a block, deleting one, dragging one.

Read by four surfaces, which is the whole point of declaring it once:

- the **panel** draws only rows whose command a writer may run;
- the **toolbar** greys the rest;
- the **key map** does not answer a chord for one;
- and a check can ask the question that matters — *is there a way to change the layout from inside
  writing mode?* — which is a question no amount of hiding controls answers on its own.

### What a writer may do

Type, in any text on the page. Replace a picture. Change where a link goes. Rename the page and write
its description, because a title and a summary are **words**, and the person who writes the words
writes those too.

### What they may not

Everything that moves or resizes anything, adds a block or takes one away, changes a colour, a
width, a padding or a template. Not because those are dangerous — because they are somebody else's
work, and the whole value of the mode is that a writer can stop being careful.
