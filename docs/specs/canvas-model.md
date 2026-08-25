# What a coordinate on a canvas means

Decisions about what the model *means*, settled here so they are settled once.
The first three had to be made and were about to be made twice — once by a
clipboard, once by a layout — and a decision made twice is a decision made
differently. The fourth is written down early, because it is the one that would
otherwise be made by accident. The fifth arrived with a feature and belongs with
them.

Every number below is measured from the code as it stands. Where the answer is
"we chose", the cost of the choice is written down with it. All three of the
first are implemented; where a section says what something *will* buy, it has
been struck through with what it did.

---

## 1. One unit, and it is the twip

**What is true today.** The two products read the same attribute as two
different lengths.

- Word writes a shape's `x`, `y`, `width` and `height` straight into SVG user
  units, and sizes the canvas with `width: ${width}px`. So in Word **one model
  unit is one CSS pixel**.
- Slides converts every length through `twipToPx` — `value * 96 / 1440`. So in
  Slides **one model unit is one twip**, and fifteen of them make a pixel.

The schema declares both as `{ type: 'number' }` and says nothing about the
unit, so neither product is disobeying it. A canvas authored in one and opened
in the other is wrong by a factor of fifteen, and so is every shape on it.

**The decision: twips, everywhere, for everything a document measures.**

Three reasons, in the order they matter:

1. **The engine already does.** A page's size, a paragraph's indents, a tab
   stop, a table's column widths — all twips. The canvas is the only region that
   is not, and one region disagreeing with the rest of the document is the thing
   that makes a shared model stop being shared.
2. **A slide and a page are the same kind of thing.** Both are physical
   surfaces that get printed and projected. A pixel is a property of a screen; a
   twip is a property of the paper, and the paper is what the document is about.
3. **It is exact.** 1440 twips to the inch and 96 pixels to the inch means
   fifteen twips to the pixel with nothing left over, so a number typed into a
   panel comes back the same number. Choosing pixels would make the *other*
   direction lossy, since a page's 12240-twip width is not a whole number of
   anything else.

**What it costs.** Word's canvas renderers convert instead of passing the number
through: the `viewBox` stays in model units, so the shapes inside it keep their
own numbers untouched, and only the element's CSS size becomes
`twipToPx(width)px`. One function, in `office-word/shapes.ts`.

**How it is held.** Not by this paragraph. The check is a test that renders one
`canvasBlock` model through both products and requires the drawn size to be the
same — which is the only statement of "one unit" that cannot go stale, because
it fails the day somebody writes a raw number into a length again.

---

## 2. A coordinate belongs to its container

**What is true today.** A scene node's `x` and `y` are measured from its
*parent*, not from the slide. The renderers say so — a `frame` is drawn
`position: relative` and its children `position: absolute` — and two places in
the code already depend on it:

- the overlay adds the entered container's origin when it reads a box and takes
  it off when it writes one;
- grouping rebases the boxes it collects, because a group's children are placed
  against the group.

Nothing else says it, including the schema, and both places worked it out for
themselves. The second turns out to be a *different* problem in the same
arithmetic — it rebases against a frame it is in the middle of creating, so
there is no node to walk to and `intoFrame`, given the box explicitly, is the
right tool. What separates them is whether the container exists yet, and they
are worth keeping apart.

**The decision: state it once, and convert in one place.**

> A scene node's `x` and `y` are measured from the nearest scene ancestor. A node
> with no scene ancestor is measured from the slide, which is the container of
> last resort.

The conversion is a pair of functions in `office-slides/selection`, beside the
other answers that need to walk the tree:

```
toSurface(doc, sid, box)              a box in its container's coordinates -> the slide's
fromSurface(doc, containerId, box)    the slide's coordinates -> a container's
```

`fromSurface` names the container the box is going *into*, which is the whole
difference between the two: a move across containers has two of them, and naming
the destination is what makes that visible at the call site.

**What it bought.** The clipboard, immediately — copying a shape out of a frame
and pasting it onto a slide is exactly a coordinate changing meaning as it
moves, and it is one call in each direction rather than a third derivation.

---

## 3. Formatting comes down the layout

**What is true today.** Word resolves character and paragraph formatting through
a cascade, root-first, later winning:

1. `docDefaults`
2. the style's `basedOn` chain
3. direct formatting on the node

A deck has nothing. `slideLayout` is in the schema, is drawn (hidden), and is
read by exactly one thing: `insertSlide`, which copies the layout's placeholders
into a new slide. After that the copy is on its own — change the layout and
nothing already on a slide moves.

That is why the deck's font controls show "—" for text that plainly has a font:
the ribbon deliberately does not pass Word's `inherited` resolver, because a
deck's answer would be wrong.

**The decision: a slide's formatting resolves through its layout, in the same
shape as Word's cascade.**

1. the deck's defaults
2. the layout's placeholder **of the same role** — a title takes the layout's
   title formatting
3. direct formatting on the node

Role, not position, is what pairs a slide's box with a layout's: a slide may
have moved its title or added boxes the layout never had, and matching by index
would silently format the wrong one. A box with a role the layout does not
declare simply inherits nothing, which is the honest answer.

**What it bought.** "Apply this layout" means something for a slide that already
has content: it changes what is inherited rather than overwriting what was
typed. Measured — a title with nothing of its own draws at the layout's 54pt,
and switching the slide to a layout whose title is 33pt redraws it at 33pt,
with not a word of the slide touched.

**Where the layer goes, and the mistake worth keeping.** It was built for the
*toolbar* first, and that was half a job: Word's renderers do not read a
paragraph's attributes, they resolve it through `WordEnv.styles`, which is what
makes a paragraph with nothing on it look like anything at all. So the ribbon
knew about layouts and the drawing did not, and a title reported 54pt in the
toolbar while drawing at the document's 13px default — two answers to one
question, which is the failure this whole document exists to prevent, committed
while writing the document.

The fix is one seam Word already had: `resolveNodeWith` takes extra layers
"between the style chain and the node's own direct formatting", which is exactly
where a layout belongs. `withLayouts` wraps the resolver, no renderer changes,
and the layout goes *under* any layers the caller passes — a table style's
conditional formatting is a more specific statement about a block than the slide
layout is.

**What it costs.** One resolver, shaped like `office-word/style-resolver`, and
the same restraint that one has: only known formatting keys cascade. A layout
placeholder also carries `role`, `x`, `y` and a size, and cascading those would
move every title on every slide to where the layout's is.

---

## 3a. What a reader sees is not what the document stores

Settled after the question was asked out loud: **why do the two products show
different units?**

They did, and it was nobody's decision. Word shows a number in exactly one
place — the ruler, in inches, because a page is paper. Slides' properties panel
showed pixels, with a reason written in it: a reader is looking at a 1280×720
slide and thinking in pixels.

The reason does not survive the zoom control. The panel divided twips by fifteen
and stopped, so at half size a box occupying 48 screen pixels was reported as
96 — neither a physical length nor the reader's pixels, but *the pixels it would
be at 100%*. A number true at exactly one zoom is the worst of the three
options.

**The decision: a physical unit, the reader's to choose, converted in one shared
place.** `@barocss/office-ui`'s `toDisplay` / `fromDisplay`, defaulting to
centimetres because the interface is Korean, with millimetres, inches, points
and pixels on the menu. Pixels stay: a deck bound for a screen and never for
paper is a real thing to be making, and what a reader should not have is a panel
that decided for them.

The same argument that settled what a document *stores* settles what it shows —
a slide and a page are both surfaces that get printed and projected. And the
same failure shape is what made it worth settling: two products in one suite
showing the same kind of number differently is not a choice anybody makes, it is
one everybody inherits.

---

## 4. Time, when it comes, lives beside the document

Not a decision that has to be made yet, and written down because it is the one
that would be expensive to make by accident. Motion, a timeline and video all add
**time**, and the model has no dimension for it.

There are two shapes it could take, and they are not close:

- **In the document.** A node carries its own keyframes, so every node type
  grows a time field and every operation has to maintain one. `locked` is the
  small version of this — one boolean, and it reached every command that edits a
  box.
- **Beside the document.** A track references nodes by sid and holds the timing
  itself, so a node that knows nothing about animation can still be animated, and
  a document with no timeline pays nothing. It is what PowerPoint does — an
  animation list per slide, naming shapes — and what every editing tool with a
  timeline does.

**Beside**, when the time comes. The reason is the same one that settled the
unit: the alternative makes every existing node type and every existing
operation take on a concern that only some documents have.

Nothing is declared for it now. A node type declared before something reads it is
how this schema came to have fifteen of them with no renderer.

## 5. A frame that lays out owns its children's coordinates

`frame` has declared `layoutMode` since the canvas nodes were written and
nothing has ever read it. Reading it is what turns a frame from "a box that
holds things" into Figma's auto-layout: three shapes in a row with an even gap,
which stays even when a fourth arrives.

**The decision, and it is the whole of it: the layout is computed into the
model, not into CSS.**

The browser could do it — a frame with `display: flex` and the children made
static — and that is the wrong answer here for a reason this document has
already settled twice. A slide **places**: `x` and `y` say where a box is, the
selection handles are drawn from them, the properties panel reads them, an
exporter writes them. A frame that let CSS decide would leave every one of those
reading coordinates that no longer describe what is on the screen — handles
beside the shape rather than on it, and a panel reporting a position the reader
cannot see.

So `layoutMode` means **the frame owns its children's `x` and `y`**, and the
values in the document are the values on the screen, as they are everywhere
else. What follows from that:

- **A drag inside a laid-out frame reorders rather than moves.** Position is not
  the child's to set, so the only thing a drag can mean is "put this one before
  that one" — which is what every tool with auto-layout does.
- **The layout is a pure function**, from the frame's settings and its children's
  sizes to a position for each, so it can be tested in milliseconds and drawn
  by nothing but the ordinary renderers.
- **It re-runs when the frame changes** — a child added, removed, resized, or a
  gap edited — and writes only when the answer differs, which is what keeps a
  reaction from feeding itself.

**What it costs.** A frame's own size stays the author's; the children are
placed inside it and a frame too small to hold them clips or overflows as it
always did. Sizing a frame to its contents — Figma's "hug" — is a second
decision about who owns the *frame's* box, and is not made here.

### 5.1 The same frame in a document, arranged by the browser

`frame` is a block as well as a scene node, so it can sit in a Word document —
two columns of text, a row of cards, a grid of pictures, without drawing a table
with its borders switched off. There the rule above **does not apply**, and it is
worth being exact about why, because it looks like an exception and is not.

The rule is "the model holds what is on screen". On a canvas that forces the
arithmetic: a shape's position is read by the handles, the properties panel and
the exporter, so a position only CSS knew would be a position the product could
not answer questions about. In the flow *nothing reads a paragraph's `x`* —
there is no handle, no panel, no exporter that asks. A coordinate written there
would be a number no reader of the document consults, and it would still be in
the file after the margin that made it right had moved.

So the same principle lands on opposite answers, and the code says which one
applies by asking a question about the child rather than about the frame:

- **A child with a size** is a placed thing, and `childrenToLayOut` gives it to
  the arithmetic. Every scene node has one, because the schema requires it.
- **A child without one** is flow content, and is left out — so a frame full of
  paragraphs computes "nothing moves" and `frameCss`'s `display: flex` does the
  work.

The frame itself is the one node whose size is optional, and that is the same
distinction stated once more: a frame on a canvas is given a width by the
command that places it, and a frame in the flow is as wide as its column.

**What Word does not get.** A frame there holds `block+` and nothing else —
Word draws shapes as SVG and a frame is a `<div>`, so a frame of rectangles
would be markup that paints nothing. Said in Word's schema rather than exempted
in its conformance run, which is where eight identical exemptions used to live.

### 5a. So a drag in there is **the order**, and the position fields are grey

If the frame owns the coordinates, a reader's drag of one of its children has nowhere to
go. Measured, and it was the worst of the three possible answers: `setBoxGeometry`
reported **success**, the layout put the shape straight back, and undo did nothing —
because the reader's own history entry restored the number the layout had already
restored. A gesture that reports success and changes nothing is worse than one that is
refused, and it is the same family of fault as the connector's stale route (§8.11): a
number that means one thing where it is written and another where it is read.

The other two answers are refusing and re-aiming, and the product does one of each,
depending on whether there is anything else the gesture could mean:

- **A drag re-aims.** It means the child's **place in the order** — the one thing about an
  arranged child that is still the reader's to decide, and what every auto-layout tool
  settled on. `reorderIndexAt` answers which slot a pointer is over, in the model with its
  own tests for the same reason `positionFromRow` is: an off-by-one is a drag that reorders
  backwards, which is the one fault a reader cannot explain. The index is one **without the
  moving shape in the list**, because `moveNode` removes before it inserts. While the drag
  is live the slot is *drawn*, from the same answer the release uses — a drop indicator
  that disagrees with what happens is worse than none.
- **The panel refuses.** There is no other meaning for a number typed into `X`, so
  `setBoxGeometry` drops `x` and `y` for a child whose parent arranges, and the panel greys
  the two fields and says why. Its **size** is still its own: an arrangement places
  children and does not resize them.

Several shapes dragged together move together, keeping the order they already had between
them, in one history entry. That took a correction in `moveBoxTo`: `moveNode` removes and
then inserts into the *shortened* array, so moving `[a, b]` to place 2 of `[a, b, c, d]`
one at a time gives `[c, a, d, b]` — the second move's index was computed against a list
the first had already changed. The command builds the whole final order and realises it
left to right, which also costs nothing for a child that is already in place.

---

## 6. One control per idea, and the palette is the product's

The same failure shape as §3a, in the chrome instead of in a number: two products
in one suite drawing the same control differently is not a choice anybody makes,
it is one everybody inherits. Measured on 2026-08-20, and it had gone further than
that — **inside one row of one panel**:

```
 hand-rolled <select>    22px tall   border #d8dce4   radius 3px
 office-ui ColorField    28px tall   border #d4d4d4   radius 4px
```

47 hand-written buttons, 17 selects and 15 inputs in the deck app, with their own
rules in a 1,619-line stylesheet. And the cause was not carelessness — it was two
things that made hand-rolling the *cheaper* option:

1. **The package had no button and no bare field.** So every new control was a
   choice between inventing one and inventing one.
2. **The components hardcoded Tailwind's greys** while the product drew with its
   own tokens, so a shared control looked foreign in the panel it was dropped in.

### The rule

- **The palette is the product's, the components are the suite's.** Every control
  in `office-ui` draws with `var(--ou-…)` and nothing else; a product maps its own
  palette onto that contract once. A `var()` with no value is *invalid at
  computed-value time and takes the whole declaration with it*, so a product that
  imports the components and not the tokens gets a panel with **no borders** — a
  failure worth a test rather than a comment.
- **Density is a token, not a second component.** A properties panel's row and a
  timeline inspector's row are the same control at 28px and 22px.
  `[data-density="dense"]` on the subtree says which; written as two components
  they drift.
- **Native dropdown in a panel, Radix in a ribbon.** The products had already
  sorted themselves this way before anybody wrote it down: a ribbon's font picker
  draws its options in their own faces and has to be built; a panel's dropdown is a
  list of words, where the platform's control is smaller, faster and already knows
  how to be typed into.
- **A raw element is not a sin.** A canvas overlay's handles, a slider, a
  contenteditable — these are not fields and there should be no primitive for
  them. What is banned is a *second* button.

### And a selection is not one thing

The same shape again, one layer along. A panel *about* a selection has to say what
the selection agrees on, and the reason is not tidiness — measured on 2026-08-20,
a 6000-twip rectangle and a 2000-twip ellipse selected together showed
**10.58cm**, the rectangle's width presented as the selection's, and typing a
width changed the rectangle alone.

Three rules, and the third is the one that needs the schema:

- **Disagreement is a value.** `null`, drawn as an empty field, so committing it is
  a no-op. Showing one of two values means applying it to both the next time
  anything else changes.
- **One edit, one transaction.** Six shapes retyped once is one thing a reader
  did.
- **What a box accepts is what it declares.** So the attributes are computed *per
  box*: a mixed selection writes the corner radius to the rectangles and skips the
  ellipses, which the schema already knew. And the row is offered whenever *any*
  of them has it — greying it out would answer a question nobody asked.

The timeline pane had all three from the start ("6개 선택", and a length typed
there changes six). Two panels in one product disagreeing about what a selection
means is §3a's failure inside a single app.

### A gradient is two points, not an angle

The same argument as §1's unit and §3a's display, in the paint model. An angle is
a *derived* description of a gradient: CSS centres the axis on the box and gets its
length from the geometry, so an angle can say which way the colours run and never
where they start. Which is most of what a reader does with one.

Two points say it, and they are **fractions of the box** for the reason the
display unit is physical — so the answer survives the shape being resized. (The
motion path chose twips for the opposite reason: a journey is a distance, not a
proportion of anything.)

Three things fall out, and all three were measured:

- **CSS still only takes an angle**, so the segment is projected onto CSS's own
  axis and the stops are squeezed into the part it covers. The alternative —
  painting the gradient into a smaller background layer — places the axis exactly
  and goes transparent outside it, where both CSS and Figma hold the end colour.
- **Clamping belongs to the write, not only the read.** A drag to the far side of
  the slide wrote `x: 2.48` — two and a half box-widths out. Drawing survived it
  because the read clamps; the document did not, and a document round-trips.
- **The angle is deleted when the points arrive.** Two answers to one question is
  the fault this file's closing section is about.

### What the two points bought, and the one thing they cost

Written after the canvas editor was finished, because each of these follows from
the model above rather than from the drawing code.

- **The whole gradient slides.** Both ends by the same delta — which is a sentence
  you cannot say about an angle. The gesture shares its element with "double-click
  to add a stop", and they get along only because the drag has a **3px threshold**:
  two quick clicks travel nothing, so they write nothing. Two earlier attempts did
  not: `preventDefault()` on `pointerdown` suppresses the compatibility mouse
  events, so the double-click stopped working the day the drag arrived.
- **A radial needs no attribute a linear does not have.** Its centre is `from` and
  its corner is `to`, so the two radii are the same subtraction, and switching a
  fill between linear and radial keeps the placement a reader set.
- **What CSS will not do**, measured, so nobody looks for the handle:

  ```
  radial-gradient(circle at 30% 60%, …)              ✓ a centre
  radial-gradient(ellipse 40% 25% at 30% 60%, …)     ✓ two radii
  radial-gradient(… at 50% 50% / 30deg, …)           ✗ rejected — no rotation
  ```

  Figma's rotated ellipse is a **wall** in CSS, not a gap here: it would need the
  gradient painted some other way entirely (an SVG fill, a clipped rotated child).

The cost: a gradient is now edited in **two places at once** — a bar in the panel
and handles on the shape — and each had its own idea of which stop was selected.
A reader clicked a dot on the slide and the panel's picker went on recolouring a
different one. One selected stop, held where both halves can see it, beside the
open fill; §3a's rule again, one panel down. *A gesture that spans the panel and
the canvas is one piece of state, or two halves that disagree.*

### And a number is not a keystroke

The one hand-rolled control that was **wrong** rather than merely different, which
is why this is a model decision and not a style guide. The deck's inspector wrote
its length on every keystroke: typing `1.8` a character at a time put **10.68
seconds** in the document, because React rewrote the field from the model between
keystrokes and the characters interleaved. Two undos to get back.

A number a reader is *typing* is not a value yet. The field holds its own text
until blur or Enter, redraws from the model when anything else changes it, and
abandons on Escape — which Word's ruler had already established and the deck had
re-derived wrongly. Exactly the pattern this file's closing section describes.

---

## 7. A view follows the document, and a proxy is live for **its** root

Written here because it is a fact about how this product's documents reach the
screen, and because it was wrong for as long as the deck app has existed.

`EditorViewDOM.render()` with no tree prefers the last tree it drew. That is not
a cache: the tree is a **proxy** over the datastore, so an ordinary edit shows up
in it without anything being exported again, and re-rendering for a decorator must
not replace it with an empty document. Both of those are right.

What is also true is that a proxy is live for the **root it was made from**, and
`loadDocument` makes a new root. So a document *replaced* under a view was never
drawn: measured in the deck, a new presentation left the model holding one slide
and the DOM holding the previous five, and an explicit `render()` changed nothing.

Two things kept it hidden:

- **Nobody replaces a document.** Word has no importer, so its only load is the
  one before the first render. The deck could open a file — and got away with it,
  because an identical tree reloads to identical sids and the DOM happened to
  match. It takes a *different* document to see it.
- **The obvious fix breaks the other case.** "The editor's root changed, so
  re-read" is wrong for a tree the *caller* supplied: a test or a preview renders
  one into an editor that has no document, and reaching for the editor's document
  there draws an empty one over it. Whether the last tree came from the editor is
  **not written in the tree**, which is why that one is a flag — the only thing in
  this whole area that could not simply be read.

The rule, stated: *a tree the editor gave is good while it is still the editor's
root; a tree a caller gave is the caller's until they say otherwise.*

### A transform is not a resize

The chrome shows the percentage the slide is drawn at, and it read that by
measuring the slide's box with a `ResizeObserver`. That cannot work, and the
reason is one line of the platform: **a `ResizeObserver` reports the border box,
and a scaled slide changes only its `transform`.** So the observer fires when
something takes room from the stage, reads the slide *before* the new scale is
applied, and is never notified again — the box says a number the screen has
stopped drawing until an unrelated render happens along.

Which makes the rule general: *whoever computes a number reports it.* The stage
computes the fit, so the stage says what it drew; the chrome asks. Measuring the
result a second time is a second answer, and the two will disagree exactly where
nobody is looking.

### And a renderer draws its own subtree, nobody else's

Worth stating because the next feature to want otherwise is already named in the
schema. `slot('content')` renders **this** node's children, and there is no
builder for "render that node here" — `component(name, props)` is a registered
component by name, not a model node by sid. Measured with an `instance` renderer
pointed at a `component`: it sees `content: []` and draws an empty box.

So a node that is *a reference to another node* has three possible shapes in this
engine — hold copies of the children, be expanded by the view, or be inserted as a
copy with no link — and which one is chosen is a **model** decision rather than a
drawing one. See `docs/BACKLOG.md` under `component`/`instance`.

And the same mistake one layer up, found by the same measurement: the environment
the renderers resolve *formatting* against was built once at mount with
`rootId: editor.getRootId()!` — a captured root, so a new document's theme and
master were looked for under the old one's and not found. The new deck's title
drew in `system-ui` where the sample's draws in Georgia. `rootId` is a getter now:
**a root is a question, not a value**, anywhere it is held across a load.

## 8. A connector remembers what it joins, not where it is

A `line` remembers a **place**: two coordinates, and moving a shape beside it changes
nothing. A `connector` remembers **what it joins**, so moving either shape moves the
line. That difference is the whole feature — a flowchart, an org chart or an
architecture diagram is mostly the work of re-drawing lines after moving a box, and
this removes that work entirely.

Everything below is a decision, and each one was reachable two ways.

### 8.1 A connector stores no box

`CANVAS_GEOMETRY_ATTRS` declares `width` and `height` as **required**, and a connector
cannot honestly have either: its extent is whatever the two shapes it joins happen to
make. So it takes the presence attributes a reader needs — `visible`, `locked`,
`opacity` — and none of the geometry.

The alternative was to store the computed bounds and keep them in step with a
reaction, the way a laid-out frame writes its children's positions. That is right for a
frame because a child *is* a box a reader can drag, and its `x` is the answer to a
question the reader asked. A connector's box answers nothing: nobody drags it, nothing
reads it but the drawing, and a stored copy is a second source of truth that every
edit has to chase. Every consumer derives it instead, from one function.

The cost is that a renderer needs the joined shapes, so it needs the document — which
Slides' renderers already take from the environment for themes and backgrounds.

### 8.2 Both ends keep coordinates anyway

An end names a node **and** carries `x`/`y`. Not redundancy: when the shape an end is
attached to is deleted, the attachment is dropped and the line stays where it last
was. A line that vanished with the shape would take the *relationship* out of the
picture silently, and a reader looking at a diagram cannot see what is missing.

So the ends are written back each time they are resolved, and a missing attachment
freezes rather than disappears.

### 8.3 Five magnets, and a straight line uses only the middle one

A shape offers four side midpoints and its centre. `auto` picks the nearest pair.

A **straight** connector joins the two *centres* and is clipped where the line leaves
each shape's outline. A straight line drawn to a side's midpoint cuts visibly through
the shape as soon as the two boxes are offset — so the centre magnet is the only one
that means anything for a straight line, and the side magnets are for the elbow and
the curve. Figma draws the same distinction; the reason is geometry, not taste.

Clipping is **outline-aware**. An ellipse, a diamond and a triangle are clipped on
their own outline, because a rectangle's corner is outside all three and a line that
stops there floats off the shape. Anything else is clipped as a rectangle.

Rotation carries: a rotated shape's side points, its outward normals and its outline
all rotate with it.

### 8.4 Four routes

- **straight** — two points.
- **elbow** — right angles. Two sides on the same axis bend twice at the midpoint,
  and `bend` slides that midpoint; two sides on different axes bend **once**, where
  `bend` has nothing to slide and is ignored.
- **curve** — a cubic, with each handle pulled along its side's outward normal. The
  handle's length is the distance *projected onto that normal*, not the straight-line
  distance: two boxes one above the other are far apart along the normal and near
  across it, and using the straight distance bulges the curve over the shapes beside
  it. Clamped at both ends — too short reads as a kink, too long as a balloon.
- **arc** — a quadratic, and the one route with **no magnets**. The control point is
  placed first, out to one side of the line between the two *centres*, and each end is
  then found by clipping the shape's outline **towards it** — so the line always points
  *at* the shape whatever angle the shape is turned to, and the cap sits along the
  tangent there. Its bow grows with the distance; within four degrees of an axis it is
  drawn straight, because a grid layout with faintly bent lines looks untidy rather than
  organic; and each end stands off the border a little, because a cap whose tip is
  exactly on the edge is drawn *into* it and reads as blunt.

An elbow's corners are **rounded**. A hard right angle sits badly against shapes that
have rounded corners, and where two lines cross it is genuinely hard to see which goes
which way. The radius shrinks to half of each adjoining segment, so two corners close
together cannot eat into each other.

**The route and the track are two things.** The route is what is *drawn*: for a curve or
an arc that is control points, and the straight lines between them are the triangle the
curve sits inside. Everything that measures *along* the line — the label's place, an end
attached at a fraction, the point nearest a drop — walks the flattened curve instead.
Using one word for both is how a label ends up beside its own line.

### 8.5 Getting past what is in the way

Each route avoids obstacles in the way that keeps it the route it is: an elbow goes
**around**, a straight line moves to another **magnet** (never one the reader chose),
and a curve **bows further**. Bending a curve into right angles to get past a box
throws away the reason a reader chose a curve.

Three rules make it behave:

- **Touching obstacles are one clump.** Candidates are generated around a box, so two
  boxes side by side make every candidate land in the other one. What looks like a maze
  the router cannot solve is almost always a clump. Crossings are still counted against
  the *original* boxes, because the gap inside a clump can be a perfectly good way
  through.
- **Clean and shortest wins, not "fewer crossings".** A crossing count depends on how
  many segments a route has, so a route with fewer segments can look better while being
  more blocked.
- **If nothing is clean, the direct line stands.** A reader can see a line passing over
  a shape and understand it; they cannot follow a line that wanders across the slide.
  This is also why a diagram drawn *inside* a slide's placeholders keeps its straight
  lines — the placeholders are shapes too, and nothing can avoid them.

### 8.6 An end may hold another line

`startT` / `endT` is a fraction **of length** along the held line — a flowchart's branch
off the middle of a flow. Length rather than a magnet, because a line has no sides; and
length rather than corners, because the halfway of an elbow whose first leg is twice its
second is on that leg, not at the corner.

Two consequences worth stating:

- **The arithmetic is handed a point, not a line.** Resolving a held line means routing
  it, and routing it means knowing what *it* holds — so the document walk (and the cycle
  it has to refuse) belongs to the caller. `connectorRouteOf` is the deck's one answer,
  and the renderer, the overlay and the gesture all go through it: three inputs and two
  callers is how a line and its own handles end up in different places.
- **A drop has to land near the line, not in its box.** A connector's box is the
  rectangle around its route and most of that rectangle is empty.

### 8.7 A word on the line

"yes", "no", "1..n", "on failure" — a flowchart without them is a picture of boxes. The
label is a plain string, short by construction, drawn in a pill at the middle of the
route so the line does not run through the text.

The pill's size is **estimated** from the characters rather than measured: the label is
drawn in the same SVG as the route so it travels with the line for free, and SVG cannot
measure text before it draws it. The rule that matters is that a CJK character is about
as wide as the type is tall and a Latin one a little over half — the other way round
makes a Korean label hang out of its own pill.

### 8.8 Two lines between the same pair are fanned by the drawing

Routed identically, they are drawn one on top of the other: the reader sees one line,
cannot tell there are two, and cannot select the one underneath. That is a **broken
state**, not a styling choice — so the drawing separates them and the document says
nothing.

Fanned symmetrically, `(index - (count - 1) / 2) * step` in document order. The cost is
that adding a third line moves the first two; the alternative — leave the first where it
is and push each new one aside — makes the first look like the *main* line, which is a
claim about the diagram nobody made. A `bend` the reader set is not overruled, for the
same reason a magnet they chose is not.

### 8.9 The gestures a line has

- **Its ends**, which attach it (§8.6) — round handles.
- **Its middle**, which bends it — a square grip, on the part of the route a bow
  actually moves: an elbow's middle segment, a curve's own midpoint (`(p0 + 3c₁ + 3c₂ +
  p3) / 8`, not halfway between the ends, which the handles pull it away from). A grip
  anywhere else runs away from the pointer the moment it is dragged. A drag is
  **projected onto the one axis that can change** — the rest of it is dropped rather
  than turned into something the route cannot express — and it is *added* to the bow the
  line already has, or grabbing the second of two fanned lines snaps it onto the first
  before it moves.
- **Its label**, on a double-click: the same gesture as everything else on this canvas,
  where the first click says which thing and the second says "work on what is in it".
  Naming a relationship in a side panel means looking away from the diagram to do it.

### 8.10 One coordinate space, and what asking for it turned up

A connector and the shape it holds may live in different containers, and every placed
thing's `x` is its *container's* (§2). So a line resolves both origins up to the surface
and subtracts: without that, grouping a shape a line is attached to moves the line to the
corner of the slide.

Being the first thing in the editor to walk **up** the tree found two faults that had
been cancelling each other out — `moveNode` writing an alias into `parentId`, and a group
that could not be emptied, so ungrouping was impossible. Both are in `docs/BACKLOG.md`;
the lesson worth keeping here is that a *back-link* is only as good as the thing that
maintains it, and nothing had been checking.

There is one function for what a route depends on — the shapes it joins, in its own
space; the shapes in the way; another line an end holds; and the bow, which may be the
fan's rather than the reader's. The drawing, the overlay's handles and the reaction that
remembers the ends all read it, because when two of them answered separately one of them
was wrong.

### 8.11 A route belongs to the render, not to the document

A connector's route is derived from nodes that are **not its own** — the shapes it joins,
the shapes in the way, another line an end holds. The view redraws a node when *that
node* changes, so a shape moving redrew the shape and left the line where it was.

For a while the lines appeared to follow, and the reason was an accident: a reaction wrote
the ends back into the connector on every change, and *that write* was what changed the
node and caused the redraw. Writing the same values straight to the store instead left the
line exactly where it was — which is how this was found.

So the routes are computed by a **layout pass** and merged into the environment, which is
the mechanism the engine already has for a drawing that geometry decides (its own doc
comment names this case). Three things follow:

- **The document stops churning.** No `startX` rewritten on every drag — which for a
  board two people share is four numbers of traffic and four chances to conflict, per
  line, per drag.
- **The history stops filling** with writes nobody asked for. A derived write that is
  recorded makes undo undo *it*, and then it runs again and writes the same thing back:
  measured, a reader could not undo their own move at all. `recordInHistory: false` is for
  exactly this.
- **The stored ends mean one thing again**: where an end *was*, for when the shape it held
  is gone. They are written when the line is made and again in the transaction that
  deletes the shape — the only moment the live position can still be read, and the moment
  that puts them in the reader's own undo entry.

### 8.11a Three answers about the history, not two

`recordInHistory: false` is right for state derived from **nothing the reader writes** — a
connector's route, a laid-out frame's children. There is a second kind, and it took a
measurement to see it: a **group's rectangle** is the bounds of its children *and* the
origin their coordinates are relative to, so keeping it honest **re-origins** them — the
group moves right by 3000 and every child moves left by 3000, which together change
nothing on screen.

Both of the obvious answers are wrong for that.

- **Recorded** as its own entry: a reader moved one shape inside a group and **three
  presses of undo changed nothing at all.** Each press undid the fit, and the reaction —
  which runs on every document change, an undo included — wrote it straight back.
- **Unrecorded**: the child came back and the group did not. Undo restored the reader's
  relative `x` into a coordinate space that had since moved, and put the shape somewhere it
  had never been.

The fit is a **consequence** of the edit, so it belongs in the edit's entry:
`appendToPreviousEntry` (and `HistoryManager.appendToLast`) puts it there, ahead of the
edit in the inverse order so it is undone first. Then one press takes back both halves
exactly and a redo replays both. It refuses when there is no edit to belong to, or when the
top of the stack is an entry the reader may still redo — and then nothing is recorded,
which is safe, because an undo restores a state the maintenance already agrees with.

The reaction that remains does the one thing neither of those can: releasing a hold whose
shape went by some other path — a document that arrives with a dangling reference,
another product's command, a peer's deletion in a shared deck.

### 8.12 A bend a reader places is a decision, and stays in the document

Everything else about a route is *derived* (§8.11) — it follows from the shapes and what
is in the way. A **waypoint** is the opposite: there is nothing to work a hand-placed bend
out from, and a reader who has routed a line around a table they mean to move later means
that route to stay. So `waypoints` is stored on the connector, and the route is still
derived — from the ends, the kind, and now these.

Three rules fall out of that:

- **A placed point overrules the router.** With any waypoint, `connectorPoints` stops
  avoiding obstacles: the reader has said where the line goes, and a router moving it
  anyway is a control that does not work — the same rule as a magnet a reader chose.
- **A new point's place is worked out on release**, from how far along the *track* it was
  dropped (`nearestOnPath`). Counting segments would put the second bend before the first:
  an elbow turns one waypoint into two route points, so route index and waypoint index are
  not the same number.
- **Only where a point means something.** A curve and an arc are shaped by their bow, and
  a hand-placed point on one would have to straighten it to obey.

The gesture is draw.io's, because it is the one readers already know: a small mark in the
middle of every run, dragged to bend the line there; the bend then has a handle of its own,
dragged to move it and pressed twice to take it away. Two things had to be measured:

- **A drag and a double-click on one dot.** `preventDefault()` on `pointerdown` suppresses
  the compatibility mouse events, and a pointer capture retargets the click at the
  capturing element — together they sent the double-click to the overlay, which opened the
  label editor instead. And a press that does not travel now writes nothing: apart from
  being right on its own (a click has no business in the history), the commit replaced the
  handle's element, so the second click landed on a new one and never became a
  double-click at all. The gradient's axis had already found half of this.
- **The bow grip and the segment dot wanted the same pixel.** Both bend an elbow's middle
  run, and whichever is drawn last takes the press. The bow grip stays — it is the only
  way to undo a *fan* by hand (§8.8) — and the segment dot that would land on it is
  skipped. Whether a route's bow can be dragged at all is the model's answer
  (`canBendByDrag`), not a condition the overlay repeats: a straight line has no bow, and
  an elbow with one corner has nothing between its sides to slide.

### 8.12a Editing the chain: a shape dropped **into** a line, and a line turned round

Drawing a diagram is one set of gestures and *editing* one is another, and two of the
second set were missing.

**A shape dropped on a line is spliced into the chain.** `수집 → 저장` needs a check in
between, and every tool built for diagrams answers a drop on an edge the same way: the
edge splits and the shape is in the middle of it. Four decisions:

- The **look** is carried onto both halves — kind, stroke, dash, flow, caps. A reader who
  dashed a line green has not asked for one green line and one default one. What is left
  behind is where it *went*: the bow and the bends they placed describe a route through a
  picture that no longer exists (the rule §9 follows).
- The **outer magnets** stay and the two new inner ends are left to `nearestSides`, because
  nobody has said anything about them yet.
- The **label** goes on the first half only. It named the relationship, and the first half
  is the one that still starts where the relationship did; on both it would be said twice.
- The drop's own **move is in the same transaction**, so it is one press of undo. Three
  entries would have a reader undoing a drop three times and watching the diagram rebuild
  itself in stages.

The line highlights while the shape is held, from the same answer the release uses — a
gesture nothing acknowledges is a gesture nobody learns. It is refused, and says so by not
highlighting, for a shape that is already an end of that line (`a → b` with `b` dropped on
it would become `b → b`), for a line with a free end (there is no second relationship to
make), and across surfaces.

**A line can be turned round.** A connector is a relationship and a relationship has a
direction; drawn the wrong way — which happens whenever a reader picks the two shapes in
the order they were *thinking* of them — the ways back were deleting it or dragging both
ends past each other. Everything tied to an end swaps: the shape, the magnet, the fraction
along another line, the frozen place. The bends read backwards and the bow is mirrored,
because a waypoint list is walked from the start and a bow is measured across the line from
start to end.

**The caps do not swap, and that is the whole point.** I wrote it the other way first and
measured it: swapping the ends *and* the caps leaves every arrowhead on the shape it was
already on, and a reader watching sees **nothing happen** — a cap drawn at a shape looks
the same whether it is that line's start or its end. A cap is notation attached to the
*direction* (the arrow at the end, UML's diamond at the whole), so leaving the two
attributes alone is what moves the drawn caps to the other shapes.

### 8.12b Where two lines cross, one hops

A crossing drawn plainly is **ambiguous**: a reader cannot tell whether one flow branches
into another or merely passes it. Every drawing convention for schematics answers it with a
small hop, and the argument is the fan's (§8.8) — what is prevented is not a look but a
picture that can be read the wrong way. So it is automatic and the document says nothing
about it, exactly like the fan.

**Which line hops is decided by the layout pass**, and it has to be: it is a fact about the
*pair*, and neither line can see the other. A renderer asking "does anything cross me?"
would answer twice and draw two hops at one crossing, which reads as a broken line rather
than as a crossing. The **later** line in document order carries it — the same order that
decides which of two overlapping shapes is on top, so the line drawn over is the line that
hops over.

Three exclusions, each for a hop that would read as a mistake:

- **Near an end** (⅓ inch). Two lines arriving at the same shape meet *at the shape*; they
  are not crossing, they are both arriving.
- **Running along each other.** Parallel runs do not pass at a point, and a bump somewhere
  along the shared stretch is a bump in the middle of nothing.
- **On a curve.** A hop cut into a Bézier is not one arc — it needs the curve split — so a
  curve crosses plainly rather than wrongly. Better a plain crossing than a wrong one.

The hop is one **semicircle** of a fixed radius (8px) bulging to a fixed side. A hop that
grew with the run would be a different size at each crossing of the same line, and hops
that bulged either way at random read as a drawing mistake rather than as a convention. A
crossing within a corner's radius of a corner is skipped, or the arc and the rounded corner
meet in a kink.

Nothing is written down, which is what lets a hop simply *stop existing* when a shape moves
and the lines no longer cross — no attribute to clear, no undo entry. If a deck ever wants
them off, that is a switch on the deck rather than an attribute per line, for the same
reason the fan has none: a crossing is not something one line decides.

### 8.12c The label is set, not just written

Three attributes where there was a constant: `labelSize`, `labelColor`, `labelBold`. A
diagram's words carry weight the line cannot — a red 실패 on the path nobody wants, a bold
필수 on the one they must take — and the reference implementation had all three.

Three attributes rather than one style object, for the reason the whole connector is flat
(§8.1): the schema can then declare the *range*, and the validator and the conformance probe
can both read it. A blob of JSON in one attribute is a value nothing can check.

The size is **twips**, like every other length here (§1), and the panel does the points —
twenty twips to a point, converted in the one place that has to know, so the document never
holds a unit an app invented. It goes into `labelBox` as well as into the type, or the pill
is drawn for a size the text is not and the letters hang out of it. The row appears only
when there *is* a label, the same rule the 경유점 row follows: a size field on a line with
no label is a control for nothing.

**And it turned up that a line could not take a theme colour at all.** Its `stroke` was read
raw, so re-colouring a deck re-coloured the shapes and left the lines between them behind —
a theme's whole promise ("one edit rather than forty") broken for exactly the nodes that
join the forty. The label's colour had to resolve through the theme, and there was no reason
the stroke should not; the connector now resolves its attributes the way every other painted
thing here does.

### 8.12d Three words, and a curve that goes through what a reader placed

**A word for each end.** The middle label names the relationship; a word at an end says
something about *that* end — UML's multiplicity, which is the difference between "an order
has items" and "an order has many items". Two attributes rather than a list of
`{ t, text }`, for the reason the whole connector is flat (§8.1): a list of objects is a
value the validator and the probe cannot read, and the notation readers actually draw is
these three words. All three share one type, because a diagram whose multiplicity is set in
a different size from the name it belongs to is a diagram with a typo in it.

An end's word sits a fixed distance in from that end, **offset to one side** so it neither
lies on the line nor overlaps the shape. The offset is taken from the direction *there*
rather than from the line between the ends, or an elbow's two words are both at 45°; it is
always to the same side, for the reason the hop always bulges one way; and the inset is
clamped to a third of the line, or on a short line the two of them meet each other and the
label already in the middle. They are typed in the **panel** and not on the canvas: the
double-click already means the middle label, and a second gesture that depended on how near
an end the pointer was would be one a reader could not aim.

**A curve now goes through the points a reader places.** It could not before, and the reason
is worth keeping: a curve's `points` are *control* points, so a waypoint handed over in that
list **became** one — the line leaned towards the reader's point and never reached it, which
is the one thing a placed bend means. Two of them drew a polyline, because five points match
no branch.

`splineThrough` converts the stops to Catmull-Rom cubics: one `C` per span, handles a sixth
of the way along the neighbours' chord, which is what makes the joins smooth instead of
kinked. The answer is a flat list of **1 + 3n** points — the shape `connectorPath` and
`flattenCurve` already read for one cubic — so a curve's points still mean "control points"
whatever their number, and nothing has to guess which kind of list it is holding.

Two grips follow from it:

- The waypoint dots are on every route now, and for a curve they are placed on the
  **track**: the middle of two control points is not on the line at all.
- The **bow grip disappears** once a point is placed, because `connectorPoints` ignores
  `bend` entirely when there are waypoints — a grip there is a control wired to nothing,
  which is the fault `canBendByDrag` exists to prevent. And a curve with *no* points gets
  its two dots at a quarter and three quarters along, because its one span's middle is
  exactly where the bow grip stands: with the middle dot skipped there was no way to place a
  first point on a curve at all.

### 8.13 Nothing here is deferred

Everything this section has listed as next is done: the drag gesture, routing around
obstacles (§8.5), an end held by another line (§8.6), the label (§8.7), fanning (§8.8),
the bend grip (§8.9), the bends a reader places (§8.12), editing the chain (§8.12a), the
hop at a crossing (§8.12b) and the label's own type (§8.12c). A connector gets **no resize handles** — it has no box to
resize (§8.1), and they sat exactly where its ends are, which is how that was found.

### 8.14 Ends, caps and dashes are a vocabulary, not a preference

Nine cap shapes, because a diagram's arrowhead *means* something: a flow is an arrow,
an association is a dot, and UML's inheritance and composition are a hollow triangle
and a diamond. Ship one and readers stack shapes on the line's end to fake the rest —
and then the fake drifts every time the line moves. A hollow cap must be unfilled, or
the line appears to run through it.

A dash pattern scales with the stroke width: a thick dotted line drawn with a thin
line's pattern joins up into a solid one.

**A line may flow**: its dashes travel along it. An arrowhead says where the
relationship points and says it standing still; a flow says the same thing moving, which
is stronger — with six lines on a slide, the one that flows is the one the eye follows,
and that is what a presenter wants while talking about one path through a diagram. A
solid line is drawn dashed while it flows, because a flow is dashes *travelling* and a
solid line has none. The animation is **CSS**: the presenting view is a clone of this
DOM, so it goes on flowing there with nothing to re-run, and it stops under
`prefers-reduced-motion` without anything having to remember to check. The offset it
travels is one **period** of that line's own pattern — a fixed distance judders on every
line whose weight is not the one it was chosen for.

## 9. Tidying a diagram is the *shapes* moving, and one entry in the history

A connector's route is derived (§8.11). Tidying is the opposite decision: it **moves the
shapes**, and where a shape is is the document's to say. So the arithmetic answers a list
of moves and a command writes them — and writes them in **one transaction**, because a
reader will only dare press a button that rearranges everything they have drawn if it
costs one keystroke to change their mind.

The algorithm is the layered one — what Sugiyama named, what Graphviz's `dot` does, what
a flow chart already looks like — and its three passes are separate because each is there
for a fault that shows without it:

1. **Rank** by *longest* path from the sources. By shortest path a diamond's join lands
   beside its own parent and an edge points sideways: the picture the reader pressed the
   button to be rid of.
2. **Order** within a rank by the average position of what a node is joined to, swept a
   few times. This is the pass that stops two unrelated branches weaving through each
   other; crossing minimisation is NP-hard and no diagram needs the exact answer.
3. **Place**, then pull each node towards the centre of what it is joined to, stopped by
   the node beside it. Without the pull a parent sits over the left edge of its children
   and the picture reads as a list; without the stop, a node slides past its neighbour and
   undoes the ordering pass.

What is deliberately absent is `dot`'s dummy nodes for edges that skip a rank. Our edges
are connectors, and a connector routes itself around what is in the way (§8.5) — inventing
invisible nodes to feed a router we already have would be work for nothing.

Four decisions the command makes, each with a reason a reader could state:

- **Only the shapes a line touches.** A title, a note, a logo is not part of the diagram,
  and moving it because it shares the slide is the button doing something nobody asked
  for. It is also what makes the button safe to press with everything selected.
- **Two or more selected means those**, so a slide holding two diagrams can have one of
  them tidied. One or none means the whole slide, because "tidy this" said about a single
  shape cannot mean that shape alone.
- **The picture stays where the reader put it.** The tidied graph starts at the corner the
  diagram already occupies, not at the corner of the slide: a tidy that also *moves* the
  picture is two changes wearing one name.
- **The hand-placed bends come off** the lines it tidied — a waypoint (§8.12) and a `bend`
  describe a route through a picture that no longer exists. They are decisions, so only a
  reader's gesture may clear them; asking for a tidy is that gesture. In the same
  transaction, so one undo puts the diagram *and* its bends back.

### 9a. The gaps are measured, not picked

The obvious way to write this is two constants, and it is half wrong. What sits between
two ranks is a line, an **arrowhead**, and — if the reader named the relationship — a
**label pill on the middle of that line**; a gap that does not hold the pill draws the
reader's own word across the shape below, which is the commonest way an automatic layout
looks broken. So `rankGapFor` reads the diagram's own labels and line weights and answers
the gap. Which of the pill's two sizes matters depends on the direction — a flow chart's
gap runs down, a process's runs across — and getting that the wrong way round is
invisible on a short label and unmissable on a Korean one.

The **floor** underneath it is `dot`'s own `ranksep` (0.5in), with `nodesep` (0.25in)
between siblings: a diagram with no labels still needs ranks a reader can tell apart, and
picking our own numbers would be picking numbers, where those two have been read for
thirty years. And the arrowhead's size is asked of the model (`capSizeOf`) rather than
copied out of the renderer that draws it — `max(180, width × 4)` in two places is the
restatement this repository keeps finding, right up until one of them changes.

A caller may name a gap — a console, a test, a panel that does not exist yet — and a
value that is not a positive number is not an answer: it falls back to the measured one
rather than being written.

The two directions on the toolbar are the whole vocabulary: a flow chart runs down and a
process runs across, and everything else a layout engine can be asked would be a dialog —
which is what stops a reader pressing the button to see what it does.

### 9b. It is not a mode, and a lock is how a reader keeps their own placement

The tidy runs **once** and writes plain coordinates. It is not an option left switched on,
and that is a decision rather than an omission: a live layout would make a shape's `x`/`y`
derived, and then a reader's drag has nowhere to go — the trap §8.11 is about, in the one
place where the document is unambiguously the authority. §5's frames avoid it by making a
drag mean *reorder* instead of *move*, and a graph has no order for a drag to mean.

What that leaves is the second press: the reader arranges freely afterwards, and pressing
tidy again would take their arrangement with it. So a **locked** shape is a pin — it keeps
its place, and the diagram is laid out *around* it. `locked` already means "I have decided
where this goes", already has a command and a control, and a second attribute beside it
would be a second word for the same decision.

Anchoring, not excluding. The first version dropped a locked shape from the graph, which
took its lines out with it: one locked box in a chain made the whole diagram untidiable,
and the test asserted that as though it were the design. Two rules fall out:

- **A pinned shape is never written**, not even to the numbers it already has: a move that
  lands where the shape already is is still an entry in the history.
- **The first pin anchors, and only that one.** Two pins can simply disagree, and honouring
  both would mean stretching the ranks to reach them — a picture neither reader asked for.
  A diagram where *everything* is pinned reports nothing to do.

### 5b. What a child asks of the frame that arranges it

Two attributes, and the measurement that made them worth having. A frame with a `layoutMode`
decided **where** its children went and never how big they were: widening one from 6000 to 10000
twips moved its children — re-centred on the new width — and left every one of them its old
size. So a card built out of a frame could be made wider and its rows would sit in the middle of
it, which is not what anybody means by a wider card.

- `layoutStretch` — as big as the frame **across** the axis (its width in a column, its height in
  a row, its cell in a grid), less the padding. A stretched child starts at the padding, because
  there is no room left to align it in.
- `layoutGrow` — `flex-grow`'s share of what is left **along** the axis, with the child's own size
  as the basis. Nothing shrinks: a frame too small for its children overflows, which is what a
  canvas does everywhere else here, and shrinking needs a minimum size per shape to be anything
  but a guess. In a grid `grow` is ignored — a grid wraps, so "along the axis" is a question it
  does not have.

Both are the **child's** decision and not the frame's, because two rows in one frame — one
filling its width, one keeping its own — is an ordinary card.

#### What propagates when a container is resized, measured

The question this settles is whether a resizable card is possible at all. Four answers, and only
one of them is the browser's:

| resized | what reaches its children | how |
| --- | --- | --- |
| a frame that arranges | positions **and** the sizes of the children that asked | the reaction on `editor:content.change` runs `layoutChildren`, which answers "what differs" |
| a nest of such frames | all the way down, one level per pass | each write is a document change, and the passes converge because the answer empties |
| a group | **nothing** | a group's box is derived from its children: writing 8000×4000 came back 2000×1000 and no child moved |
| flow content — a `textFrame`'s blocks, a table cell | reflows | the browser, and this is the only case where it is |
| an absolutely placed box | **nothing** | `x`/`y`/`width`/`height` are written from the model into inline styles; an absolutely positioned child does not reflow |

So "we are on the DOM, surely it propagates" is half true: it propagates for text and for an
arranging frame's children, and not at all for placed boxes. Figma's **constraints** are the
answer to the last row — what is pinned to which edge, what scales — and that stays out of this
schema until something needs it; these two attributes are the part of it auto-layout actually
spends.

#### And a frame may hold a frame, which it could not

Measured while writing the nested test: `frame > [frame]` validated — through the `block+` branch,
since a frame is a block — and `frame > [rectangle, frame]` was **refused**. So a card could not
be a frame holding a title and a row of cells, which is the shape almost every card has. The
comment beside `frame`'s content model already claimed the canvas containers named `frame`
explicitly; the container most likely to hold another was the one that did not. It is
`(scene | frame)* | block+` now, like `surface` and `group`.

## 10. A component is a definition, and an instance is a drawing of it

`component` and `instance` have been in the schema since the canvas nodes were declared and
nothing makes one. Before building them, two questions had to be answered honestly.

### 10a. They are not what a *template* is made of

That claim was in the roadmap and it conflated two features. A **template** is a whole
document to start from; the gallery needs no components at all, because a template is a
deck. **Components** are reuse with identity: one definition, many placements, and the
placements *follow* the definition.

Where they meet is a template **library** — the card, the quote block, the logo lockup a
reader drops onto a page — and a brand template that stays consistent because its slides are
made *of* those pieces rather than of copies of them. So a component is what a **living**
template is made of, and nothing a starting one needs.

### 10b. What it costs to get wrong, and the six answers this engine already has

Every question a component model has to answer already has a precedent here, which is the
argument for building it this way rather than Figma's way.

1. **A definition is not drawn where it sits, and it is not a page.** `component` was
   declared in the scene group, so it could sit on a slide — drawn twice (once as itself, once
   through each placement) and selectable by clicking the master copy. That is Figma's model,
   and it is why a Figma file has a page of furniture belonging to no design.

   The next answer was *a surface of its own kind*, and it was also wrong: a surface is a
   **page**, so saying a definition was one made every reader of the page sequence ask whether
   each page counted — the slide list, the strip, the presenter, the count — and two of them
   leaked before the third was written. A `slideLayout`, a `slideMaster` and a `theme` live in
   `resources`; a component belongs there, and then there is nothing to filter anywhere.

   The fear that put it in the wrong place was that a resource has no editing surface. It was
   unfounded, and `slideLayout` says why in the place that decided it: a definition is **drawn
   hidden**, because *a node with no element has no place in the sid map, and every mapping
   from a DOM position back to the model goes through that*. So the stage shows the definition
   it is focused on, and the overlay, the panel and the guides key on a sid rather than on what
   kind of thing they are looking at.
2. **An instance's content is derived from a node that is not its own**, which is exactly the
   connector's case (§8.11) and the one this repository has already been bitten by: the view
   redraws a node when *that node* changes, so editing a definition would leave every
   instance stale. The mechanism is built — a layout pass whose answer changes when the
   definition does — and an instance that skipped it would look like it worked until the
   second edit.
3. **Overrides are values, and a part is named rather than matched.** This started as "matched by
   role, like a layout's placeholders", became "paired by the id of the part it was copied from"
   when placements held copies (§10b-2), and ended as neither: a placement holds nothing, so there
   is nothing to pair. What a card takes is *declared* (`componentVar`) and what drives a part is
   *declared* (`componentBind`, naming the part by its `partId`) — never a structural match, which
   mis-applies the moment the definition is reordered. (A role keeps its other job: the formatting
   cascade, §3.)

   What this model does *not* do, and it is a real limit rather than an oversight: the
   granularity is a **whole part**. If a placement has changed a card's text and the
   definition then changes that same part's colour, apply leaves the part alone and the
   colour does not arrive. Per-attribute overrides are what Figma has for this, and they are
   also where its complexity lives. The middle path — take the definition's attributes and
   keep the placement's children — is a *guess* about which half is the reader's, so it is
   not taken until something measures that readers want it.
4. **The instance's stored box means "where it was".** Its extent is the definition's, so the
   numbers on the node are the frozen answer for when the definition is gone — the same rule
   as a connector's remembered ends (§8.2).
5. **Detaching is a copy**, and `copyOf` already exists for it: a layout's placeholders are
   copied into a new slide for the same reason, because a shared node would make editing one
   slide rewrite every other.
6. **Going inside is not editing the definition.** The double-click gesture means "work on
   what is in this" for a frame and a group, and on an instance it would mean editing every
   other placement — a reader who double-clicks a card on slide 3 does not expect slide 7 to
   change. `instance` is declared `atom: true`, and that is the right answer: it is selected,
   moved and overridden, and the definition is edited where the definition lives.

What is deliberately *not* answered yet: whether resizing an instance scales its content or
re-lays it out. Figma answers "it depends on the child's constraints", which is a layout
model this schema does not have — so an instance is drawn at its definition's own size until
that decision is made, rather than half-guessed.

### 10b-2a. And then it was **transcluded** after all: a component follows its definition

The section below was the first answer and it was wrong about the engine, which is worth keeping in
full because of *how* it was wrong. It said a placement cannot draw its definition's parts, because
the only thing that renders nodes is `slot(name)`, which reads this node's own data. That is true of
a **renderer** and it is not true of the product: children are resolved in exactly one place, and it
is not the renderer.

**The distinction that settled it: a template is not a component.** A template is a document you
copy and then own, and it is right for it not to change under the reader. A component has to follow
its definition as the definition is edited, or it is a copy with extra steps.

#### Where the resolution belongs, measured twice

- **In a renderer**: the instance's template resolves the definition and builds the parts' elements
  itself. Tried, and it draws — but every part is evaluated against the **placement**, because the
  vnode's attribute functions are called later with the node the renderer is rendering. Measured:
  two parts came out with the placement's box and the placement's sid, and a text frame's words were
  empty because its `slot('content')` read the placement's children.
- **In the proxy the view reads children through** (`DataStoreExporter.toProxy`): a resolver there
  returns the definition's parts, and each one arrives *as itself* — its own coordinates, its own
  colour, its own words, its own children. Measured: the parts drew at `left: 0px` and `left:
  13.3px` with the definition's fill, and the text was the **placement's** value rather than the
  definition's default.

So the store gained one hook — `setContentResolver` — and it knows nothing about components: it asks
a function what a node's children are for a reader. Slides registers `instanceParts`.

#### Why this is safe where the first answer feared it would not be

The hazard written below is that everything walking the tree would see children that are not in the
document, **including the save**. It does not, and the reason is structural rather than lucky: the
save has its own walk (`exportToTree` reads the stored nodes), and the resolver is only consulted by
the proxy. A resolver can change what is **drawn** and cannot change what is **written**. So a file
still says exactly what a reader has: a placement, where it sits, and the values it was given.

#### What follows from a placement holding nothing

- **Nothing to apply, and nothing to fall behind.** The plan, the per-part recorded signature and
  the badge that offered the work all belonged to copies. A definition's change is already on the
  screen. What is left of "apply" belongs to the **brand kit** (§10f), where a copy really is a copy
  because another deck's definition is not in this document.
- **Overrides are values.** A placement differs by what it *says* — its variables — and by what it
  puts in the slot. There is no per-placement copy of a part to edit, which is also why the layer
  list shows a placement's slot contents and not the card's parts: the parts are worked on by
  opening the card.
- **A drawn part has a synthetic id**, made of **the placement** and the part: `<placement
  sid>~<part sid>`. Nothing in a store's ids contains `~`, so a reader of the DOM can tell a piece of
  a placement from a node a reader can select.

  It was `<component id>~<part sid>` first, and that was measured as exactly the fault the id exists
  to avoid: the sample deck's three placements of one card each drew `metric-card~slides:138`, so
  three elements claimed one identity and `querySelector` answered the first for all three. Anything
  aimed at a part — a motion, a hit test, a lookup — reached the wrong placement. Nothing had failed
  yet, because the audit and find both report against the *placement*; it was found while measuring
  whether a card could animate at all.
- **A placement's text is not in the document.** A spell checker does not see it. That is inherent
  to a reference and it is the price of the thing being a component; the way out is a second walk
  that reads the resolved tree, and two walks now do it: the deck's own check (`auditDeck` — the
  alternative was measured, and it was a deck of twenty cards auditing as twenty empty boxes) and
  **find and replace** (`deckMatches`, §10i).
- **The arrangement moved into the resolution too**, and it had to: a reaction writes document
  nodes, and a resolved part is not one. So `fillChildren` and `layoutChildren` — the same
  functions the canvas uses — run over the resolved tree, parent before child, so a part given the
  placement's box arranges its own children against **that** box (`canvas-instance.ts`).
- **A resize now costs nothing.** One drag used to write a box into every part of every placement;
  it writes the placement's own box and nothing else, and twenty placements cost twenty
  arrangements at draw time. The write cost that made apply a *command* rather than a reaction
  (§10b-4) is simply gone.

### 10b-2. Measured: a placement is **materialised**, not transcluded (superseded by §10b-2a)

Kept in full because of *how* it was wrong: a true measurement of the renderer, taken as an answer
about the engine. Everything below is correct about templates and wrong about where children come
from.

The design above assumed an instance could *draw* its definition's parts. The render pipeline
says otherwise, and it is worth writing down because it is the kind of assumption that
survives a whole feature and then collapses:

**A template cannot render a foreign node.** The only thing that renders nodes is
`slot(name)`, which reads `data[name]` — and the data is the store's own proxy of *this*
node. A function template may build elements, but a raw node object placed among an element's
children is silently dropped: no branch in the factory handles it. So there is no way for an
instance's renderer to say "and now draw those five nodes from over there".

The general fix would be **transclusion** — teaching the proxy that an instance's `content`
resolves to the definition's parts. That is the deepest possible place to put it and it would
make everything work at once, and it carries a hazard this repository is already careful
about: everything that walks the tree would see children that **are not in the document**,
and one of those walkers is the *save*. A file would either be written with resolved copies
in it (a lie about what the reader has) or would need every walker to learn the difference.

So a placement is **materialised**: it holds real nodes, and the document says exactly what is
on the slide. Which is this engine's own precedent rather than a compromise —
`layoutPlaceholders` copies a layout's placeholders into a new slide, with the reason written
beside it: *"a new slide owns its boxes, and editing the title of slide four must not rewrite
the layout every other slide follows."*

#### What makes it a component rather than a copy

The link is not a render-time lookup; it is an **edit-time consequence**. Editing a definition
is the reader's edit, and updating its placements is a consequence of it — which is the exact
shape the engine gained a primitive for two items ago: `appendToPreviousEntry` (§8.11a) puts a
consequence-write into the entry of the edit that caused it. So:

- Edit the definition, and every placement follows **in the same history entry** — one press
  of undo takes back the definition's change *and* the forty placements it rewrote.
- A placement's **overrides survive**, because the re-apply skips the parts whose role the
  placement has taken over (§10b, and the same role rule).
- **Detaching is free**: take the `componentId` off, and what is left is what was already
  there. No copy, no cliff.
- Everything downstream — selection, motion, the audit, the exporter, the save — keeps
  working, because there is nothing unusual in the tree.

What it costs, honestly: a deck with forty placements writes forty subtrees when the
definition changes, and the file holds forty copies. For a deck that is the right trade — the
alternative is a save that has to know which children are real.

### 10b-4. What apply did, and why it is gone (history)

**Removed.** Everything in this section was about carrying a definition's change into copies, and
there are no copies (§10b-2a). It is kept because the *reason* it worked this way is what makes the
new answer cheap: the whole design was shaped around a write cost that resolution does not have.

Four rules, each a decision about **whose** a box is:

1. A part with **no origin** is untouched — it is the reader's own, including a whole region
   they added (§10e), and there is nothing to compare it against.
2. A part that **still says what its origin says** is rewritten from the definition. This is
   how a change arrives.
3. A part that **differs** from its origin is left. That is what an override is here: nothing
   declared, nothing hidden, and no "reset" to hunt for.
4. A part whose **origin is gone** goes. Otherwise a definition could never lose a part — every
   placement would keep its copy for ever, and a reader deleting something from the card would
   watch it stay on forty slides. The risk this takes is a part the reader had *edited* whose
   original was then deleted; it is removed, in the reader's own undo entry, which is where a
   decision they might disagree with belongs.

And it was a **command**, not a reaction, for the write cost: a reaction per edit means typing one
character in a definition rewrites every placement — forty placements of a five-node card is two
hundred writes per keystroke, which is the ruler's fault (a document write per pointer move) in a
new place.

That cost is what the resolution removes. Nothing is written, so nothing has to be batched, offered
or asked for, and the relationship Figma has **across files** is now the only place this product has
it too: a brand kit (§10f), where the other deck's definition really is in another document.

### 10b-3. Two leaks the design has not closed yet, measured rather than assumed

Written down because the *frame* being right is not the same as the implementation being
finished, and both of these are in the layer below the model:

- ~~**An instance draws nothing.**~~ Closed. Measured first: a deck holding one rendered
  *without error* and put nothing on the slide — not a crash, which is worse in one way,
  because it looks like it worked. The renderer is a `div` that places its children, the same
  shape as a group's, plus the three things a group's does not do: it says what it is a
  placement of, it is findable when it holds nothing yet, and it reads **nothing foreign** —
  whether the definition has moved on is the overlay's to draw, because an instance's node
  does not change when its definition does (§8.11 in a new place).
- ~~**A definition surface is drawn as a page.**~~ Closed, and in the view rather than the
  renderer. The renderer draws what the document has, which is its job; *which surface is a
  page* is the view's question, and the answer is the mechanism slides already use — the stage
  hides what is not focused, and one rule hides a definition from the strip where nothing is
  focused at all.

### 10b-6. The library: a container of its own, beside `resources`

`resources` was the second answer and it *worked* — a definition drew hidden exactly as a
layout does, and the stage's focus rule showed the one a reader had opened. What moved it out is
**display and ownership**, and both are about the screen rather than the model:

- Everything in `resources` is hidden **as a group**, because none of it belongs on the screen.
  A definition being edited is the one thing that does, so showing it meant reaching past a
  `display: none` written to hide layouts and themes — a `:has()` rule, written because
  un-hiding that container outright put the ruler six pixels off the slide it measures.
- A library is a thing to **own**: a name, a source, a brand kit. `resources` is a bag of what
  this document refers to; `components` is what it defines.

So `document` is `docMeta? surface+ resources? components?`, and the container is hidden with
its children hidden too — the stage shows the focused definition with the container set to
`display: contents`, which contributes no box at all. That third answer is the first one the
ruler agrees with: a library left *visible* because its children carried their own
`display: none` still put a box in the stage's flow, and the same ruler test found the same six
pixels a second time.

### 10b-7. What a placement can be **asked for**: variables

A placement holds no parts, so a variable is the *only* way it can differ from the card — but the
argument for declaring them was made when a reader could edit anything in a placement, and it is
worth keeping, because it is what a component property is for. Three things free editing cannot do:

- **One value in more than one place.** An accent colour used by three parts is one decision,
  and editing three copies of it is three chances to disagree.
- **A state.** "Show the badge" is a `boolean`, and a set of them is a `choice` with its options
  declared — which is what stops variants multiplying into the matrix Figma had to bolt
  component properties on to escape.
- **A panel worth having.** "This card: title, number, badge" is a list a reader can be shown.
  Free editing gives no list at all.

A definition declares them as `componentVar` **nodes** (`name`, `label`, `kind`, `choices`,
`value`) and a placement answers with `componentValue` nodes. Nodes rather than a blob in one
attribute, for the third time in this schema: a declaration made of nodes is one the validator
checks, the conformance probe reads, and a panel draws without a parser.

A **binding** is a declaration of the definition's — a `componentBind` node saying *this variable
drives this attribute of the part called `title`* — rather than three attributes on the part. The
three attributes (`bindText`, `bindFill`, `bindVisible`) were the first answer and they were a
ceiling: a variable could drive exactly three things, so a card's corner radius, a frame's gap and a
badge's opacity were unreachable, and a `number` could only ever be text (§10g-2).

**Substituted where the children are resolved, so the renderer never sees a binding.** By the time a
part reaches a template it is an ordinary node with an ordinary fill and ordinary words. A bound part
draws the value and **nothing else** — the runs collapse to one, keeping the first one's formatting —
because writing into the first run and leaving the others puts the value on the page followed by
whatever the definition happened to say next.

What that costs is the other half of §10b-2a: the value is not in the document as text, so
find-and-replace and a spell checker do not see it.

#### Where a variable is declared, and why a name is fixed

Two panels, because they are two questions and the reader has selected a different thing in
each: the **card's** variables are declared beside the definition being edited (the components
panel's 변수 list), and a **part's** bindings are set in the properties panel where that part
is. A variable belongs to the card — an accent colour used by three parts is one decision,
which is the whole reason a declaration exists rather than three copies of a value.

A variable's `name` cannot be edited. It is what a part binds to and what every placement
answers, both written in the document, so renaming one means rewriting every part of the
definition and every placement's answers in every deck that ever copied the card — a migration,
not an edit. The **label** is what a reader changes. Which is the rule this document already
follows for a definition's `id`, a part's `partId` and a shape's motion name, for the same
reason: a durable reference is only durable if nothing renames it.

Removing one takes the bindings that name it and the placements' answers to it with it, in one
transaction. A binding pointing at a variable that is gone is a part that silently draws
whatever it last had, and an answer to a question nobody asks is junk in the file that would
come back to life the day the name was declared again.

### 10b-8. The slot: where the reader's own things go

Figma added slots because instance-swap could not say "put whatever you like here", and paid for
it with a second layout system inside components. Here a slot is an ordinary part — very often a
`frame`, so the arrangement is the frame's, which already exists, is already tested, and already
knows that a drag inside it means the order (§5a) — and the `slot` marker buys exactly one
sentence: a placement's own children go **in** it rather than beside the definition's parts.

It used to be the one place apply could destroy a reader's work — their boxes live *under* a part
that has an origin, where rule 1 does not reach — and two careful readings of the marker existed to
stop that. Both are gone with apply: a placement's own children are simply *put inside* the resolved
slot, keeping their own sids, so they are the reader's nodes in the card's frame. Nothing rewrites
them, so nothing can lose them.

### 10b-9. Measured: apply compared against the wrong thing, and did nothing (history)

**About a mechanism that no longer exists** (§10b-2a), and kept for one reason: this is the fault
that made the copy design expensive enough to look at again. Every fix for it added a thing the
document had to *remember* — a signature per part, a signature per placement — and derived state in
the document is what this repository keeps finding as its own worst fault. The reference design
remembers nothing.

The four rules as first written compared each part with **its origin as it stands**. The command
tests found what that means: the moment a definition changes, *every* part differs from it — so
rule 3 ("a part that differs is the reader's") protected all of them and apply changed nothing
whatever. The rule reads correctly and is unimplementable as stated.

The question is not "does this part match the definition" but **"has the reader touched it since
it was written"**. So a copy records what it was *given* — `appliedFrom` on the part, the
signature of the copy at the moment it was made — and "changed" is that record against the part
now. Two records, two questions, and both are needed: the part's answers *whose* a part is, and
the placement's answers *is there anything new to take*.

A part with no record is one from before this existed — a hand-authored placement, a deck saved
by an earlier version — and the honest fallback is the old comparison: it cannot tell a stale
part from an edited one, so it treats a difference as the reader's and leaves it alone.

Two smaller faults from the same afternoon, both the kind that look like a working feature:

- The panel's "how many placements are behind" compared a placement's `componentId` with the
  definition's **sid**, so it matched nothing and the count was always zero — a badge that could
  never appear, about the one thing that panel is there to say.
- `transformNode`'s `newAttrs` **merges**, so a detached placement kept its `componentId` and
  would have been picked up by the next 모두 적용. Removing an attribute is `setAttrs` with
  `null`, which is the one way to say "not set" for every type. Still true and still needed:
  detaching now materialises the resolved parts into the document and then takes the
  `componentId` off, and a placement that kept it would draw the definition *and* the copies.

### 10b-10. A definition's colours are the deck's

Found by the theme test, which asserts that nothing in the document repeats the theme's hex: the
sample card's back held `#2563eb`, so a deck re-coloured to another theme kept three off-brand
cards — and a *definition* holding a literal makes more of them for ever. A colour variable
whose default names a theme slot (`theme:accent1`) is what a brand kit is: the card follows the
deck, and a placement that wants its own colour still says so.

### 10b-11. A definition is fitted and measured as itself

The stage fitted the constant `SLIDE_16_9` — not the deck's size, and not the surface being
shown. Measured in the browser, three faults from one line:

| shown | drew at | ruler | slide |
| --- | --- | --- | --- |
| 16:9 deck | 0.5172 | 662px | 662px |
| 4:3 deck | 0.5172 | 662px | **497px** |
| a 5040×3960 definition | 0.3797 | 486px | **128px** |

A ruler measuring a slide that is not there, and a card drawn 128 pixels wide in a 486-pixel
pane. `stageFit` answers it in the model — the surface the reader is on (a slide's own size, a
definition's own width and height) or the **widest** slide when the deck is drawn as a strip,
because fitting the first would let a wider one overflow. Presenting a deck that is not 16:9
was fixed by the same line, since the show goes through the same stage.

### 10b-12. How big a card is, and why a placement cannot be resized

Measured: dragging a placement's corner handle wrote a box of 8280×6440 onto a card whose parts
stayed exactly 5040×3960. The selection outline grew, the card did not change, and nothing said
so — the refused frame drag (§5a) in a new place, and the lesson from that one was to make the
refusal *visible* rather than accept a gesture with no answer.

A placement's extent **is** its definition's, unless something in the card says otherwise. So:

- The overlay draws a placement **no resize handles**, and the panel's size fields are greyed
  with the reason written beside them. Rotation stays: turning a card is a transform of the
  whole thing and needs no answer about what is inside it.
- A card's size is changed where the card is — the definition's own 크기 row, which appears when
  a reader is standing in one with nothing selected — and every placement's box moves with it,
  in one transaction, so one press of undo takes back "the card is bigger" rather than leaving
  twenty placements at the new size and the card at the old one.
- There is nothing left to carry the size *to*: a placement draws the definition (§10b-2a), so a
  card that grows is drawn bigger in every placement of it, including in a deck saved by an
  earlier version.

**And then it *was* done, for the cards that have an answer.** A placement has no arrangement of
its own, but a part told to fill it (`layoutStretch`, §5b) is as big as it is — so a card built
out of a frame carries a reader's drag all the way down: the placement's box, the part that fills
it, and the rows that frame arranges, three levels from one gesture. So the rule is not "a
placement cannot be resized" but **"a placement is resized where the model can say what that
means"**:

- Something in it fills it → the handles are offered, the fields are live, and apply does not
  drag the box back to the card's size. The definition says how big the card is *by default*, not
  how big every placement must stay.
- Nothing in it fills it → refused as above, because the drag would write a box and change
  nothing that can be seen.

**Where that arithmetic runs changed with the references, and it is the better place.** A reaction
wrote those boxes into the document; it cannot, because a resolved part is not a document node. So
`fillChildren` and `layoutChildren` run inside the resolution (`canvas-instance.ts`), parent before
child — the placement's box gives the filling part its size, and that part arranges its own children
against the size it has just been given. The convergence problem the reaction had (a pass whose
writes changed a deeper pass's inputs, with a re-entry guard stopping the pass that would have fixed
it) does not exist here: one walk, top down, and nothing is written at all.

The same "parent before child" fault was measured in both places, which is why it is worth stating
twice: rows of a frame that had just been given a new width computed against the old one — a card
that grew with its contents still the size of the library's copy.

The `setBoxLayout` guard had to widen for this to be *reachable*: it offered 가득 only inside a frame
that arranges, and a card's own part has a `component` for a parent. So the one gesture §5b exists
for was refused exactly where the feature needs it (`fillsChildren`).

**Still not done:** per-edge constraints for the absolutely placed parts — a badge that should
stay in the top-right corner of a card that grows. It stays where it was put, which is honest and
is the reason the general case waits for a real constraint model.

One thing found on the way, and it is not about size at all: **opening a definition left the
reader's selection on the slide's box.** So the properties panel went on being about a shape
the reader could no longer see, the definition's own row never appeared, and the overlay drew
that box's handles over the card. A selection is "what I am working on", and a reader who has
changed surfaces is not working on it any more.

### 10b-13. What a card is in the layer list, and what it is not

The list descends into a `group` and a `frame`, and into a placement — but what it finds in a
placement is only what the **document** holds there: the reader's own things in the slot. The card's
parts are the definition's, so they are worked on by opening the card, and the list says nothing
about them.

That is a real loss and it is written down rather than hidden: a badge inside a card cannot be picked
from the list, hidden, locked or reordered per placement. It is the same loss as "a placement's text
is not in the document" and it has the same cause — the thing being a reference. What is offered
instead is the card itself: one row, one press to open it, and a change there is a change everywhere.

The other side of the same list: inside a definition, a part carries the name the card gave it
(`partName` on the row, `data-layer-part` in the markup), because "the badge" is a different thing to
be looking at from "a rectangle". A placement's `componentValue` children are skipped everywhere:
they are what the card was *asked for*, not boxes, and "값" is not a name a reader could tell one row
from another with. That is also the code that keeps the conformance exemption for `componentValue`
true.

### 10b-15. What resolving a placement costs, measured

Asked because a cache looked obviously necessary: twenty placements of a ten-part card is two hundred
resolutions per render, and nobody had timed one. Rendered in jsdom, counting what the store's
resolver is asked and how long a render takes:

| deck | first render | re-render | resolver calls | parts handed back | elements |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 card × 10 parts | 23ms | 2ms | 97 | 50 | 31 |
| 5 × 10 | 13 | 4 | 265 | 250 | 83 |
| 20 × 10 | 35 | 16 | 895 | 1,000 | 278 |
| 20 × 20 | 45 | 18 | 1,525 | 2,000 | 488 |
| 60 × 10 | 67 | 27 | 2,575 | 3,000 | 798 |

Two things fall out, and they point in opposite directions.

**A placement's parts are resolved five times per render.** 20 cards × 10 parts = 200, and 1,000 parts
came back — the view reads a node's `content` about five times in a pass (children, keys, then
drawing). That looks like the thing to fix.

**And it is not worth fixing.** The same 1,000 resolutions, timed on their own, cost **2.7ms** —
0.003ms per part. The 16ms re-render is the renderer and the DOM; resolution is a sixth of it at
worst. A cache would buy about two milliseconds and cost an invalidation rule, a place to keep it, and
a new way to be wrong: a stale part drawn after an edit is the fault this whole design exists to
avoid, and it would appear exactly where nobody looks.

So: **no cache**, recorded with the numbers so the next person does not have to guess either. The
measurement is a probe rather than a test, because a timing assertion in CI is a flake with a
schedule; the script is in `docs/BACKLOG.md`.

#### Who the five readers were, and what three of them were for

The number was left as a curiosity, so it was measured next: the resolver wrapped in a counter that
records a stack, over a render of the sample deck (163 nodes with children, 3 placements). Five reads
of a placement's `content`, and **520 resolutions across the deck** — 3.19 per node. Named:

| reads | who asks | what for |
| ---: | --- | --- |
| 163 | `sanitizeProps` ← `separatePropsAndModel` ← `attachComponentInfo` | props for the vnode |
| 162 | `separatePropsAndModel` — `{ ...data }` | **a copy nobody read** |
| 97 | `_renderSlotGetChildren` | drawing the children — the real one |
| 60 | `childrenOf` (`document-access.ts`) | Word's per-paragraph language lookup, asking twice |
| 28 | `_finalizeElementVNode` | the element's own children |
| 6 | `childCount` (`renderers.ts`) | "is this placement empty", asking twice |

Three of the six are the same mistake in three places: **asking twice for one answer.** On a document
whose children are *resolved* rather than stored, `if (node.content)` followed by `for (node.content)`
is two questions, and a property that can answer differently each time is a property to read once into
a name. `separatePropsAndModel` was the largest: it built `{ ...data }` — a whole copy of the node,
which on a proxy means resolving its children again — and its only caller used the other half.

Measured again with the three read once (same machine, same probe):

| deck | resolver calls | parts handed back | re-render |
| --- | ---: | ---: | ---: |
| sample deck, before | 520 | — | 8.0ms |
| sample deck, after | 324 | — | 7.1ms |
| 20 × 10, before | 742 | 1,000 | 9ms |
| 20 × 10, after | 488 | 600 | 8ms |

A third of every content resolution in a render existed for an object with no reader, and a
placement's five reads are **three**: its props, its children, and the one question its renderer asks.
The time saved is about a millisecond, which is the point: this is not a performance fix, and the
previous section's refusal of a cache stands. It is the same finding as the cache — the reads are
cheap, and there were more of them than anyone had said out loud.

### 10b-14. Where this lives: the canvas layer, not the deck

The model and the resolution are in `office-word` (`canvas-component.ts`, `canvas-instance.ts`),
re-exported by `office-slides` the way the arrangement and the connector geometry are. The reason is
the **schema**: `component`, `instance`, `componentVar`, `componentBind` and `componentValue` are
declared in the *office* schema, so Word's canvas already has cards in its document format and
simply has nothing that reads them. Two products reading the same node types differently is not a
design choice — it is one of them being wrong, which is `docs/SHARED-LAYER.md`'s rule.

Its test for a shared thing is the one that decided the split: **can it be stated without naming a
product?**

| Shared | Stays with the deck |
| --- | --- |
| what a card declares, what a placement was asked for, which part a binding names | making a card out of a selection — it needs *the surface the reader is on* |
| what a placement draws, and how the parts arrange inside it | the panels, the layer list's reading, the deck library |
| a signature, so a copy can be compared with its source | `isSlideSurface` — which surfaces the deck counts as pages |
| a copy carries no sid (`copyOf`), a node's children as sids | the sample deck, the audit's sweep of slides |

Two things fell out of the move, and both are the kind that only a move finds. `DeckAccess` and
`DeckNode` were declared field-for-field identically in both packages — two places for one of them
to gain a field — and are now the canvas's, aliased under the deck's names because every reader in
that package is written in them. And `deckComponents` was renamed `componentsOf`: a function in the
shared layer whose name says "deck" fails the test in its signature.

### 10b-5. Everything is pointed at by a **durable** id

`componentId` and the part references held sids, and that would have destroyed placements the first
time a deck was saved and reopened: `forFile` strips `sid` and `parentId` — *they are the store's,
not the document's* — so every reference would have come back pointing at nothing.

The document already knew this. A layout is referenced by its `id` attribute, and motion names
a shape by a name it carries, with the reason written beside it: *a sid is handed out at load,
so a saved animation cannot be written in sids.* So a definition carries `id`, each of its parts
carries `partId`, and a placement names a definition by `componentId` and a binding names a part by
`partId`.

A part's name is left out of its **signature**, because it is how this deck refers to the part rather
than something the part says: two libraries that named the same part differently are not two
different cards.

### 10f. A brand kit: a definition from another deck

The other half of what a library is for (§11i). A brand kit **is** a deck — the card, the quote
block, the logo lockup — and using one here cannot be a reference for a reason no engine trick gets
around: the definition is **not in this document**. So it is **copied**, and what makes that a
library rather than a paste is that the copy remembers where it came from.

Which is, again, the relationship Figma has **across files** — offered and accepted rather than live.
Since placements became references (§10b-2a) this is the *only* place in the product where anything
can fall behind anything, and that is the right shape: within a deck a card is followed live, across
decks it is copied and the newer copy is offered.

A copy records three things: the deck (`fromDeck`, a library name or an address, resolved by the
host), the definition's id **there** (`fromId` — two decks can both define a `card`, and the one
that arrives second is renamed here), and what that definition said at the moment it was copied
(`fromSignature`). The last is a signature rather than a version for the reason every derived thing
here is computed rather than stored: a number would have to be maintained by a write on every edit of the brand
kit, and a signature is maintained by nobody.

Four decisions fell out of building it:

- **Reading another deck must not load it.** Everything that reads a deck takes `rootId` +
  `getNode(sid)`, which is what a *loaded* document is; a parsed file is nested nodes with no sids.
  So `accessOfTree` answers a file like a store — which is what lets the library dialog say what a
  deck defines while the deck on screen stays where it is.
- **The command takes the source in its payload.** Whether `brand-kit` is a name in the reader's
  library or an address to fetch is the host's question (§11i), and a model that reached for storage
  is a model nobody can test in milliseconds.
- **Bringing the same definition in twice replaces the copy**, in place, keeping its id here — so
  every placement of it is still a placement of it. What it does *not* do is touch the placements:
  taking the new parts is `applyComponent`, offered by the badge, because a reader who refreshes a
  brand kit and finds forty slides rearranged has lost forty slides.
- **A stale list is worse than no list.** Measured in the dialog: the definitions of one deck stayed
  from the last time it was open, so the button that opens the list closed it — and that list is
  precisely the thing that may have changed in between, which is the case the feature exists for.

#### Where a library's answers have to appear

Two faults of the same shape, found by using it: the answer existed and was **one dialog away**.

- A definition that is behind its brand kit said so only in the library dialog. It says so in the
  **components panel** now — and the split holds: the *comparison* is pure (a recorded signature
  against the source's current one) and the *reading* is storage, so the app reads and the panel is
  handed a set. It reads when the panel is opened, not on every document change: a keystroke is not
  a reason to open three files, and a brand kit does not change while somebody is typing in this
  deck.
- A button pointing at another deck asked a reader to **type a name they had no way to see**. The
  row offers the library's names, and keeps 직접 입력 for an address — because `goToDeck` is both, and
  which one it is depends on the machine (§11i).

### 10g. How far this goes: what maps to Figma, what maps to PowerPoint, what we refuse

Worth writing down before the next change, because the concepts this section has been adding —
components, variables, a slot, jumps, a brand kit — are **not in a traditional presentation tool**,
and half of them are in a design tool. So the question "how far do we go" has to be answered
deliberately rather than by drifting toward whichever tool is being copied that week.

#### What each of our ideas already is, in the other two tools

| ours | PowerPoint / Keynote | Figma |
| --- | --- | --- |
| `role` + layout/master cascade (§3) | **the whole mechanism** — placeholders in a layout | nothing; Figma has no placeholder idea |
| `theme` slots (`theme:accent1`) | theme colours — the same idea, same place | **variable modes**, at collection scope rather than document scope |
| `component` / `instance` | nothing | components / instances |
| `componentVar` (text, colour, number, boolean, choice) | nothing | **component properties** (text, boolean, instance-swap) *plus* **variables** (string, colour, number, boolean) |
| `slot` (a frame part) | nothing | slots (added late, and to escape instance-swap) |
| `goTo` / `goToKind` (§11) | **action settings / hyperlinks**, and "advance on click of object only" | prototyping flows |
| `advance: links` (§11g) | kiosk browsing with click-advance off | prototype-only navigation |
| deck library + brand kit (§10f, §11i) | nothing (a template file, at best) | team libraries |

Two things fall out of that table and both are load-bearing.

**We already have both worlds, and they must not collide.** A layout's placeholder and a card's
variable are two answers to *"the text that varies"*, and they are for different questions: a
placeholder is *this deck's* structure (every page has a title), a variable is *this component's*
interface (every card has a number). The rule is the one this document already follows for
formatting: a placeholder is matched by **role** and inherited by a page; a variable is **named**
and answered by a placement. Nothing should ever resolve one through the other.

**The theme is our mode system.** Figma's variable modes exist because a colour has to mean one
thing in a light frame and another in a dark one. A deck already answers that at deck level, and a
colour variable whose default is `theme:accent1` (§10b-10) composes the two: the card follows the
deck, the deck follows the theme. So *modes* are not a thing to add — they are a thing we have,
one level up.

#### What we deliberately do not take from Figma

- **Variants (component sets).** A matrix of definitions keyed by variant properties. Figma added
  component *properties* precisely because variants were being used for what a boolean or a choice
  should do, and the matrix is the part practitioners complain about. Our answer for a state is a
  `choice` variable bound to what it changes; the one thing variants do that this cannot is a
  **structurally different** card per state, and the honest version of that is two definitions.
- **Instance swap.** A property whose value is *another component*. Our placement holds real nodes
  and a reader may already put anything in a slot, which is most of what swap is used for. Noted as
  possible later; not needed to make a card usable.
- ~~**Bound variables everywhere**~~ (a variable on any property of any node, at document scope).
  **Taken, in the half that measures well** — see §10h. What is still refused is the rest of Figma's
  data model: collections, scoping, and aliasing between variables. One flat list of names, one
  value each, and a reference written where the value goes.

### 10h. The document's own variables

Asked for directly — *"변수는 문서 전역 + 컴포넌트 속성으로 해야해"* — and the design is what the
measurement allowed rather than what Figma has.

#### Three things that name a value, and they are not each other

| | who names it | how many | where it round-trips |
| --- | --- | --- | --- |
| `theme` slot | the **format** — a fixed twelve | one set per theme | PowerPoint, exactly |
| `variable` | the **author** — any name, any kind | one value per document | nowhere; it is ours |
| `componentVar` | the **card**, as a question | one answer per placement | Figma's component properties |

They were conflated twice while this was being designed, and both times the symptom was the same: a
value that belongs to one document offered as though every deck had it, or a document-wide decision
copied onto forty placements. So the table is the section's first paragraph.

#### How a reference is written, and the measurement that shaped it

`fill: 'var:주의'`, in the attribute where a colour goes — the theme's shape (§10b-10) for the theme's
reason: a second attribute beside the first means every reader checks two places and decides which
wins. The prefix makes it unambiguous, because no CSS colour and no font name begins with `var:`.

**Measured with a transaction rather than assumed**, and it decided the whole scope:

| written into | result |
| --- | --- |
| `fill: 'var:주의'` (a string attribute) | **commits** |
| `name: 'var:x'` (a string attribute) | **commits** |
| `cornerRadius: 'var:둥글기'` | **refused** — the whole transaction fails |
| `width: 'var:넓이'` | **refused** |
| `visible: 'var:켜짐'` | **refused** |

That is the validator doing its job: an attribute whose type is "a number, *or* a string that might
name something" is an attribute no reader can trust. So the honest shape of this feature is:

- **A string attribute takes a reference directly.** Colours (including inside a paint and inside a
  gradient stop), font names, anything declared `string`.
- **A number or a state reaches a shape through a card.** A `componentBind` is a *declaration*, and
  the conversion happens while a placement's parts are resolved — off the document, where the schema
  is not the constraint (§10b-2a). This is why a card's corner radius can follow a variable and a
  bare rectangle's cannot.
- **Text is content, not an attribute**, so the same is true of words: a card's part can be bound to
  a text variable; a text box on a slide cannot name one. In `docs/BACKLOG.md`.

#### One walk for both prefixes

`resolveDeckAttrs` resolves `theme:` and `var:` in a single traversal, because both hide in the same
three places — an attribute, a paint in a list of paints, a stop in a gradient — and two walks are
two chances for one of them to miss the third. Which is not hypothetical: the theme's own walk read
only the top level at first, so choosing a theme colour for a fill made the shape lose its colour.

A variable may hold a theme slot (`variable 주의 = theme:accent1`), so resolution follows the chain,
depth-limited: a document that pointed two variables at each other must not take the editor down
with it. A theme slot may **not** hold a variable — the theme's values are colours and faces, and a
slot holding a reference would be a second indirection nothing can check.

#### The card is looked in first

A `componentBind` names a variable; the **card's** declaration wins over the document's of the same
name. Because of what the other order would do: a card carried into a deck that happens to have a
variable of that name would quietly change meaning, and a brand kit whose cards meant something
different per deck is not a brand kit. With that rule, a card can be built *against the document* —
a badge that takes the deck's accent, a footer that takes the company name — without declaring the
same thing again per card and answering it again per placement.

#### What removing one does, and why it is not tidied up

The declaration goes, and every **binding** that names it goes with it — a part pointing at a name
nothing declares draws whatever it last had, which is the one outcome worse than losing the colour.

**References in attributes are left exactly as they were.** There is no honest value to put in their
place: a shape whose fill quietly became `#000000` is worse than one that plainly lost it, because a
reader can see the second. So the shape draws nothing and the deck's own check reports it
(`dead-var`, 고칠 것) — which is the same division the audit already makes everywhere the model
cannot answer for the author.

The panel says **how many places use it** before the reader presses 지우기, counted from the document
rather than remembered: a number kept on the declaration would have to be maintained by a write on
every shape that took the colour.

#### 10h-2. What a **shape** takes from a variable

The table above is the whole reason this section has a second half: a reference reaches every
attribute the schema declares as a string and is refused, correctly, in a number or a boolean. So a
corner radius, an opacity, a stroke width, a state and a shape's words could follow a variable **only
inside a card** — and "make it a component first" is an arbitrary thing to say to somebody who wants
one rectangle's corners to follow the deck.

A shape says it in a **declaration** instead: `varBinds: [{ attr, var }]`, the same two fields a
card's `componentBind` has, on the shape itself.

##### Three shapes were measured; two are worse

| | why not |
| --- | --- |
| a child node, like a card's `componentBind` | every scene shape is `atom: true` — this would make rectangles, ellipses, lines and pictures *containers*, changing what an atom means for selection, editing, the DOM mapping and paste normalisation, to hold two strings |
| a list beside `variables`, naming its target | a shape's only durable name is `name`, and it is not unique: `namedBoxes` already takes the **first** shape of a name per surface, so a binding would silently apply to one of two same-named shapes |
| one attribute per bindable attribute (`cornerRadiusVar`, …) | the `bindText`/`bindFill`/`bindVisible` ceiling that `componentBind` was created to escape (§10g-2): one entry in the *shared* canvas vocabulary per attribute, each costing an exemption in every product that does not read it |

What is left costs the shared vocabulary one attribute, travels with a copy, and survives grouping
and reordering — and it is the fourth time this schema has been asked for a map in an attribute. The
three refusals were about **declarations with an interface** (a variable's name, kind and label; a
placement's answers; a connector's ends and waypoints) that a panel draws rows for and a validator
can hold a document to. This is a list of two strings whose target the schema could not check anyway
— which is exactly what `componentBind` says about `attr`, and why the *command* checks it.

##### Where it is resolved, and why not in the renderers

In the content resolver, beside the placements (§10b-2a). Asked of the renderers first and answered
no by measurement: `attrsOf` is read in **62 places** inside them and takes no environment, so a
bound corner radius would have reached the paint (which does have the document) and not the border
radius (which does not).

Two halves, for the same reason the card's binding has two: a child's **attributes** are resolved by
the parent handing back the child as it is drawn, and a node's own **words** are resolved as its
children, because characters are content and not an attribute. The resolver answers `undefined`
unless something is actually bound, so a deck with no bindings copies nothing.

##### Geometry takes a different road, and the count is why

A bound value resolved at draw time is drawn at one number while `getNode` answers another, and the
geometry readers were counted before anything was decided:

| | |
| --- | ---: |
| `boxOf(…)` call sites | **31**, in 14 files |
| direct reads of `x`/`y`/`width`/`height` | 6 |

The outline, the handles, the guides, the snapping, alignment, group bounds, the audit's "off the
edge" check, hit testing. Teaching all 37 to ask the resolution is not the expensive part — the
expensive part is that every *new* reader would be silently wrong until somebody noticed.

So a bound **size** is *written* into the document, by the pass that already settles derived geometry
(`canvas-layout-commands.ts`). All 37 readers and every writer keep working unchanged, and the write
is derived state in the document — the fault this repository keeps finding, and the **same trade the
arrangement already made**, for the same reason, with the same convergence rule: `boundGeometry`
answers only what differs, so a document that already agrees writes nothing and the reaction cannot
feed itself.

Three consequences, each measured:

- **The container wins.** A child told to fill its frame *and* bound to a variable is a contradiction
  the reader made. The walk is parent before child, so the frame's answer is already decided when the
  binding is asked — written the other way first, and the test said 2400 where the frame had said
  6000.
- **The reader's own size is refused while a variable owns it.** A width typed into the panel would be
  put back by the next pass: the command would report success, nothing would move, and undo would do
  nothing. So `setBoxGeometry` refuses `width`/`height` on a bound shape, the panel greys the two
  fields and says why, and the overlay draws no resize handles — the same visible refusal a
  placement's size gets (§10b-12).
- **A position and a rotation are bound the same way**, and getting there was a lesson about what a
  refusal is *for*. They were refused with a sentence about **behaviour** — "a box that snaps back
  when you drag it is a worse thing to meet than a size you cannot type" — and a behaviour can be
  fixed. Measured: a **locked** box is already refused one step earlier (the hit test goes straight
  through it), which is right for "I have decided where this goes" and wrong here, since a reader
  must be able to select a shape to take its binding off. So the drag is left out **before it
  previews**: the shape does not follow the pointer at all, nothing jumps back, and the panel says
  which fields are greyed and why. The rotate grip goes the same way.

  What is refused now is only identity and reference — a durable name, a role, a link, a lock. A
  variable driving one of those would be a document naming things by a value that can change under
  it, which is what every durable id here exists to prevent.

##### A binding that points at nothing keeps the shape's own value

Different from a dead *reference*, and the difference is what the document said. `fill: 'var:주의'`
says *this value **is** the variable*, so a missing name draws nothing (고칠 것). `varBinds` says *take
it from the variable if there is one*, so a missing name leaves the shape drawing what it holds — the
slide is not broken, and the reader has a declaration that does nothing, which the check reports as
볼 것.

#### 10h-3. Two scopes: the document, and **one page**

Asked as a question — *"덱에도 변수가 있지만 문서 전체에도 변수가 있을 수 있는 거 아니야?"* — and the answer
begins with vocabulary, because two words were doing one job. **A deck *is* a document**: one
`document` node, one file (`barocss-slides`), holding many `surface` slides. So the `variables`
container was already document-wide, and "문서 변수" in the panel is exactly what it says.

What was missing is the scope *inside* it: **a page saying something else for itself.**

`surface` content is `variable* (block+ | (scene | frame)*)` now — declarations first, the way a
`component` declares before it draws. "Every card is our accent, except on the summary page" is one
declaration on that page instead of an override on each of nine shapes.

##### The order, and the one exception

Widest to narrowest: **document → page → card's own declaration → the placement's answer.** The
narrower wins, which is the ordinary rule and needs no argument. The exception does:

> A **card's own** declaration beats the page as well as the document.

Because a card carried onto a page that happens to declare that name must not change meaning — a
brand kit whose cards meant something different per page is not a brand kit. And it is the
**placement's** page that counts, not the card's: a definition is not on a page at all.

##### Where a reference is resolved, and why there are two places

| what | resolved where | scope it can see |
| --- | --- | --- |
| a shape on a page | the content resolver, as its parent hands it back | the page, then the document |
| a card's binding | `instanceValues`, from the placement | the placement's page, then the document |
| a page's own attribute (its background) | `resolveDeckFormat` | that page, then the document |
| a master's paint, a layout's placeholder, a theme slot | the renderers | the document — they are on no page |

Two mechanisms, and they do not overlap: a shape on a page has been through the resolver first and
arrives at the renderer holding *values*, so what is left for the renderer is exactly what has no page
to be on. Scope is a property of **where a node is**, so it is resolved where a node's identity is
known — which is why this could not live in `attrsOf`, read in 62 places with no document and no sid.

##### What the check has to know

`dead-var` is asked in the shape's scope now: a name this page declares is not missing, and reporting
it would send a reader to fix something that is right.

##### Removing one, and an asymmetry that is on purpose

Taking a variable away takes the **card** bindings that named it — a card is a definition the whole
deck follows, so a binding left pointing at nothing is a fault in a shared thing, repaired at the
source. A **shape's** binding is left exactly where it is: that is the reader's own declaration on
their own box, they may re-declare the name in a minute, and the shape goes on drawing what it holds.
The check reports it as 볼 것 rather than the command editing their slide behind them.

#### 10h-5. Renaming one, which is a migration

Refused for as long as there was no walk that could find every place: a variable's `name` *is* the
reference — `fill: 'var:강조'` — so renaming means rewriting every attribute, every shape binding and
every card binding in the deck that names it. The panel said so, and the label was what a reader
could change.

Two faults were found the moment the walk was written, and both were in the **count** the panel had
been showing all along:

- **A shape's own binding was not counted.** The walk looked for `var:` references, and a `varBinds`
  entry holds a bare name. A variable three shapes took their width from reported *zero* uses, so the
  panel offered to delete it with a shrug.
- **A page that declares the same name was counted as the document's.** Overstating a count is the
  small half; rewriting one of those references would have *changed what a shape draws*, which is the
  reason the scope question could not be left until later.

So there is one walk, and both questions ask it: `varSites(doc, name, declaredAt?)` answers the
places, `varUses` is its length, and `renameVarPlan` is its writes. The number a reader is shown
before renaming is exactly the set that gets rewritten, which is the property two separate walks
cannot have.

##### What a place is

A node's **attribute**, not a reference. A gradient naming a variable in two stops is one thing a
reader can go and look at; counting it as two told them their one fill was two places. The count
changed with this — it was references before — and the rename is why: an attribute is the unit of the
write, so it had better be the unit of the count.

##### Which declaration is meant

`varInScope` decides, per site — the same rule the drawing uses. A reference on a page that declares
the name means the page's; inside a card that declares it as a `componentVar`, a `componentBind` means
the card's. A plain `var:` reference inside a card is *not* shadowed, because a card variable reaches
a part through a binding and only through one.

##### One transaction, and what it refuses

Every write and the declaration go in one transaction, so one press of undo takes the rename back
whole: a half-renamed deck is a deck where some shapes draw nothing, and undoing it one shape at a
time is not a thing a reader can do.

Refused: a name the same scope already declares. That would merge two variables into one and quietly
change what half the deck draws, and unlike a clash on import (§10h-4) nobody asked for it — the
reader is editing a name. A **page's** variable may take a name the *document* declares, because the
page was already shadowing it.

##### Where it is, and how a refusal is seen

The name field on the row, in both lists. A reader who wants to change a name types where the name is
written; a rename button beside a name that is drawn as text would be a second gesture for one idea.
The name used to be drawn as a faint caption, which was the honest drawing of a thing that could not
be changed — it is a field now, because it can.

A refusal has to be visible, and this one was not: a committed field keeps what was typed until the
*document* changes it back, and a refused rename changes nothing, so the field sat there showing a
name the deck does not have. The panel asks `canExecute` first, puts the document's name back, and
says 이미 있는 이름 in the row.

#### 10h-4. A value from **another** document

The third scope, and the one no resolver can reach: a brand's colours used by twenty decks. Another
document is **not in this one**, which is the same wall §10f hit with components — so the answer is
the same, a **copy that remembers its source**, and remembering is the whole difference between a
library and a paste.

A `variable` gains `fromDeck` (a library name or an address, resolved by the host, §11i) and
`fromValue` (what the source said when it was copied, so "the brand has moved on" is a string
comparison and nothing has to be maintained). The library dialog lists a deck's **values beside its
cards** — one read of one file, three states each: not here, here, here and behind.

##### A clash overwrites, where a card's clash renames

A card that clashes is renamed and goes on being the same card: `fromId` remembers what it is called
there, and every placement of *this* deck's card still points at this deck's card. A variable cannot
do that, because its **name is the reference** — every attribute and every binding in the deck is
written in that string, so an import under another name would change nothing that already names it,
and the reader would be looking at a value that does nothing.

So a clash is read as what the gesture plainly is: *give me the library's value for this name.* And
that is the difference from a **paste**, which keeps the destination's value (§10j) because nobody
asked about it — an import is somebody asking.

##### There is no third word, and that is the finding

The question that started this ("변수가 문서 전체에도 있을 수 있는 거 아니야?") looked like it needed a new
name for a layer above the document — 라이브러리 변수, 브랜드 값. It does not. An imported value **is
this document's own**: it draws, resolves and scopes exactly like any other document variable, and
what the two remembered fields buy is one badge on one row. A third list with a third word would have
been a scope the model does not have.

#### Where the containers go, measured

`document` is `docMeta? surface+ resources? components? variables?`, and the order is not decoration:
a container **appended** in the wrong place is refused. Measured — a deck that gained a variable
before its first card could not then have a card at all, because the library was appended and landed
after `variables`. So `documentChildSpot` answers where a container goes, from the same list the
content model is written in, and both commands ask it.

### 10l. A card that animates

The feature §10k left open, and the measurement made it small: given a `component` carrying a
`trackId`, `trackFor`, `namedBoxes` and `slideTimeline` **already answered correctly**. Time lives
beside the document (§4) and a track is named rather than nested, so nothing about the timeline model
knew or cared that it was reading a slide. What was missing was one schema attribute and one reader.

- **Where the track hangs**: `trackId` on `component`, the same attribute a surface carries. A card is
  the other thing a reader opens and puts shapes in.
- **What the slide plays**: `cardSteps(doc, slideSid)` — for every placement on the slide, its card's
  own steps with both the target's **name** and its **sid** prefixed by that placement
  (`<placement>~<part>`). The name as well as the sid, because `hiddenUntilPlayed` works in names and
  two placements sharing one would hide as a single thing.

#### The press question, answered by what it would cost

A card's steps arrive in **group 0** — the arrival — so they run when the slide comes up and add no
presses (`pressCount` takes the highest group). Because the alternative prices it absurdly: a slide
with three of one card would cost three times the presses for one decision made inside the card, and
the reader who made that decision made it once.

It is also what "a card animates" should mean: the motion belongs to the card, so it plays wherever
the card is, on its own targets, at the same moment.

One thing had to be got right for that: `withTiming` chains within a group in list order, so the
second placement's `afterPrevious` would have waited for the first placement to *finish* — three
cards fading in one after another. The first step of each placement's block starts its chain again.

#### A button **inside** a card

Left out at first, on the belief that a click inside a placement can only resolve to the placement.
Half true, and the measurement is what settled it: the show's click walk asks the **innermost**
`[data-bc-sid]` first and works outwards, so the element a reader pressed *is* the drawn part. What
was missing was a name for it.

So a card's trigger carries the placement in its `on` as well, and `drawnNames` is the map from that
name to the element — the same translation `namedBoxes` does for a slide's own shapes, in the one
direction the show needs it. Pressing the badge on the second card runs the second card's step and
leaves the first one sitting still.

`drawnNames` is deliberately **not** part of `namedBoxes`: that map is what the panel offers as things
to animate and to wait for on a *slide's* track, and a card's part is not one of those (§10k) — two
placements would offer one name twice and neither would mean anything there.

#### What the slide's timeline says about it

Not rows. The motion belongs to the card, so it is arranged inside the card — once, for every
placement — and rows in the slide's pane would offer a reader the chance to edit one placement's copy
of a decision that has no copies. The same call the layer list makes about a card's parts (§10b-13).

But a reader standing on the slide has to be *told*, or the cards move on arrival and nothing on
screen says why. So one line above the axis names the cards that animate themselves and offers the way
in — the same shape as the "you are not on a slide" banner: say where the decision lives rather than
draw a badge. Above the axis rather than in it, because these cost no presses and a lane for them
would be a lane with nowhere to sit on the clock.

#### In a **scrolling** show it is held, not replayed

Never measured until it was asked for, and the answer follows the scrolling show's own principle: a
scroll is *scrubbing with a different input device*, so a build is held at the moment the scroll has
reached rather than played on arrival. A card's motion costs no presses, so the scroll's clock has
nothing to say about it — the parts are simply **held at their end state**, which is what scrubbing
does to every build it has passed.

What a reader must never see is a card that is *missing* because its animation never ran, and that
was a real fault: `group: 0` means "outside the sequence", so `0 <= played` reads as *already played*
— and an **exit** read that way hid the shape before its exit had run. A card part given 날아가기 was
absent the moment the slide arrived, the animation playing on something already invisible, and in a
scrolling show, where the arrival group is never run, it stayed absent for good.

So the arrival group never hides anything: before it runs it has not happened, and after it runs the
stage's `fill: 'both'` holds its own end state. Which is the fault `hiddenUntilPlayed` was written to
fix once already, arriving through a door that did not exist then.

#### The fault this found on the way

Motion addresses a shape by its sid in the DOM, and a drawn part's sid was made of the **definition's**
id — so three placements of one card each drew `metric-card~slides:138`. Three elements claiming one
identity, `querySelector` answering the first for all three, and per-placement motion impossible. The
prefix is the placement's own sid now (§10b-2a).

#### What the presenter's screen must say about it

The count is the wrong sentence for a trigger, and the presenter's screen was saying only the count:
*애니메이션 2 / 2*, which reads as finished. Then the reveal that was waiting for a **click on a
shape** never came, because the presenter pressed forward instead. `pressCount` is honest — a trigger
costs no press — so the number cannot be fixed; what was missing is the other half of the sentence.

`pressablesOn(doc, surfaceSid)` answers it, from the slide's own steps and its cards' steps together:
every `on` some step waits for, named. Named and not counted, because with cards the button may be a
badge inside one of three identical placements — *지표 카드 · 타원* is a thing on the screen where
`card-badge` is a name in a file. A slide's own shape is a document node, so `labelOfBox` answers it
in the layer list's own words (§10b-13); a card's part is a drawn sid, so the name splits at its last
`~` and the card supplies the first half.

Nothing to say is said with nothing: a line that is always there is a line a presenter stops reading,
and that would cost the next slide's trigger its warning.

### 10k-2. One attribute, two things a `name` means

Worth stating because the last three faults in this area were the same shape: a walk reading `name`
off whatever it was standing on.

| carried by | means | read by |
| --- | --- | --- |
| a **surface** | what the slide is **called** — a reader typed it | the filmstrip, the presenter, the outline (`nameOf` / `deckSlides`) |
| a **scene node** | the durable **id** a step's target resolves through, generated as `shape-1` | motion (`namedBoxes`, `_freeShapeName`, `_nameTaken`) |

Two namespaces in one attribute, which is safe only while every reader knows which it is asking
about. Measured, three times over: `namedBoxes` offered the slide itself and a placement's *answers*
as things to animate (§10k); `_nameTaken` counted a `variable` called `shape-1` as taken; and
`nameOf` has always been careful — it reads the surface it was handed and falls back to the **title
placeholder's words**, never to a shape's name, because `shape-2` in a rail is a name no reader would
recognise.

The separation is by node type and by *which track is read*: the motion panel filters the timeline of
the surface the reader is on, so a shape on a slide and a part inside a card can carry the same name
and never meet. Both directions are pinned by tests now, in `deck.test.ts` and `timeline.test.ts`.

### 10k. What motion may name, and what a card's parts cannot be

A step names its target by the `name` the shape carries, and one map — `namedBoxes` — is what every
step, trigger and "wait for a click on" is read through. So what is in that map is exactly what a
reader is offered to animate, and it was read off **every node the walk touched**.

Measured on the sample deck's cards slide, which offered five things that cannot be animated:

| offered | what it actually is |
| --- | --- |
| `title`, `value`, `showBadge`, `accent` | a placement's **answers** — `componentValue` nodes, whose `name` says which variable they answer |
| `One card, three places` | the **slide**, because the walk starts at the surface and a slide has a name |

A step naming one of those animates nothing, and says nothing about it. `isSceneType` is this
model's one list of what a canvas places (§5), and asking it is the whole fix — the same shape of
fault as the audit filtering a slide's direct children, and the same shape of fix.

**A card's parts are refused, deliberately.** They are the definition's and are resolved at draw time
(§10b-2a), so naming one from a slide's track names something the document does not have; and two
placements of one card draw two parts with the same name, so the ambiguity would be systemic rather
than accidental — `namedBoxes` already keeps the *first* of a name, which is tolerable for a mistake
and not for a rule.

What **is** offered: the placement itself, because animating a card as a whole is an ordinary thing
to want, and anything the reader put in its slot, because those are their nodes with their own sids.
A card's *own* motion — a track on the definition, played inside every placement — is the feature
this leaves open, and `docs/BACKLOG.md` holds the two questions it needs answered first (where the
track hangs, since a `component` is not a surface; and what a placement's own step means when the
card also animates).

### 10j. Carrying a card to another deck

A copy of a placement is a copy of a **name** — that is what a reference means — so the clipboard has
to carry what the name needs. Measured before it did, and it is the worst shape a fault takes: the
paste **succeeded**, the placement drew nothing, and the deck's own check said nothing either.

What travels: the definitions the copied boxes name, the definitions *those* name (a card holding a
badge is the ordinary case), and the document variables the bindings and the copied attributes
reference (§10h). What the paste adds is only what the destination has not got, **in the paste's own
transaction** — a definition arriving in an entry of its own would mean two presses of undo for one
gesture, with a library left behind after the first.

Three decisions, each a refusal of the obvious thing:

- **A pasted card is a plain copy, not a brand-kit import.** `importComponentPlan` records where a
  definition came from (`fromDeck`, a library name or an address the host can resolve, §11i), which
  is what makes "the library has moved on" answerable later. A clipboard has no such name: what was
  copied may have come from a deck that was never saved, in another window. Writing the source
  document's *title* there would be a reference nothing can resolve.
- **A name the destination already uses keeps the destination's card.** Compared by **signature**,
  not by id: the same card means the pasted placement points at the deck's own (the common case —
  two slides of one deck, two windows on one file), and a *different* card of that name means the
  arriving one comes in renamed and the pasted placements are repointed. Overwriting would change
  every slide already using it, from a paste.
- **A variable of the same name keeps the destination's value.** A paste that re-coloured the deck it
  landed in would be changing slides nobody was looking at. The pasted card follows the destination's
  decision, which is what a variable is for.

And the net beside it, because a clipboard is not the only way to get a placement with no definition
— an older file, a card deleted while placements of it sat on slide 40: the audit reports
`missing-card` as 고칠 것, naming the id, because "a component is missing" is not something a reader
can act on and "metric-card is missing" tells them which deck to go back to.

### 10i. Finding and replacing what a card draws

Measured on the sample deck, and the numbers are why this counted as *wrong* rather than
unfinished:

| query | on the screen | found, before |
| --- | --- | --- |
| `매출` | a card's title, from the placement's own value | 0 |
| `1,240만` | the same | 0 |
| `지표` | the card's own default text | 0 |
| `One card` | an ordinary title on the slide | 1 |
| `목표 1.5%` | a row the reader put in a card's slot | 1 |

A search that cannot find words a reader is looking at is not a search. So `deckMatches` resolves
each placement on the slide as well — the same answer the audit needed — and the interesting half is
what **replace** then means, because it is three different acts and not two:

1. **This placement's answer.** The words are a `componentBind` on `text` with this placement's
   value behind them, so the write is that placement's `componentValue`: fixing a product name on
   slide 6 changes slide 6. A placement that had answered nothing gets its **first** answer, which
   is exactly what an override is here.
2. **The card's own words.** Rewriting them would change every placement of the card in the deck,
   from a find box, without saying so. **Refused**: found, named 카드, taken to — and 바꾸기 greys out
   with the reason while 모두 says how many it left. The same division the audit makes when the fix
   belongs to the card.
3. **The reader's own things in a slot.** Ordinary document nodes with ordinary sids, found by the
   ordinary walk. The resolution walk skips anything whose sid has no `~`, or every one of them would
   be reported twice — measured as exactly that.

A value that is itself a reference to a document variable (§10h) is refused with group 2, one layer
along: writing a literal over it would quietly stop that card following the document, which is not
what "replace" means.

**One transaction per slide, for both kinds of write.** `replacePlan` puts the run rewrites and the
value rewrites in one list, so a slide's replacement is one press of undo — a slide with half its
occurrences replaced is not a state anybody asked for. Two matches inside one value are one write,
spliced from the end so the earlier offsets are still true.

#### What interop costs, when it comes

Written now because it decides nothing today and will decide the shape of an exporter:

- A **placement** flattens to a group: PowerPoint has no instance, so a `.pptx` export writes the
  parts and loses the link. It is the same work `detachComponent` already does — resolve the parts,
  copy them in, drop the `componentId` — so the exporter has a tested answer to reach for rather
  than a new walk to write (§10b-2a).
- A **jump** is a PowerPoint *action setting*, which is a real round trip: `goTo` ↔ "hyperlink to
  slide". `back`/`next`/`first`/`last` map to its own "previous/next/first/last slide" actions.
- **Links only** is PowerPoint's "advance slide on mouse click" switched off, deck-wide.
- A **layout/master** is the same idea in both, and the closest thing to a lossless part of a round
  trip.
- **Variables and the brand kit** have nowhere to go. An export loses them; an import cannot invent
  them. That is the honest cost of being more than a slide deck, and the reason the exporter should
  say what it dropped rather than pretend.

#### 10g-2. So what does "variables, properly" mean here? A binding is a **declaration**

Measured before deciding: a variable can drive exactly **three** things — the words, the fill, and
whether a part is there — because there are exactly three attributes (`bindText`, `bindFill`,
`bindVisible`). Which means a `number` variable can only ever be *text*: a card's corner radius, a
frame's gap, a badge's opacity are all out of reach, and the way to reach them is to keep adding
attributes to every canvas node in the shared schema — where each one costs an exemption in every
product that does not read it (Word has three today).

The industry shape is a **map on the node** (Figma's `boundVariables`), and this repository has
refused a map three times for one reason: a value nothing can check is the fault it keeps finding.
The way out is the one it has already taken twice — for `componentVar` and `componentValue` — which
is that **a declaration made of nodes is checkable**:

```
component
  componentVar   name=accent kind=color
  componentBind  part=back attr=fill  var=accent
  componentBind  part=back attr=cornerRadius var=round
  rectangle      partId=back …
```

What that buys, and each of these was a real limit five minutes ago:

- **Any attribute a part declares**, with no schema growth: `cornerRadius`, `opacity`, `gap`,
  `strokeWidth`, a size. The panel offers what the part *declares* (it already asks the schema) and
  the command refuses what it does not, so a binding cannot name an attribute nothing would read.
- **Any piece of a definition**, not only its top-level parts: a bind names a durable `partId`, and
  a nested node may carry one. (Which the attribute form did allow, by accident, and nothing said
  so.)
- **One list per card.** "What does this card bind" is a question a panel can answer, and a reader
  can see that `accent` drives three things — which is the whole reason a variable beats editing
  three copies.
- **A placement's parts carry nothing.** The bindings live with the definition, so a copy is a plain
  box again: no `bind*` attributes in the file, and no exemptions in the products that do not have
  components.

`attr` is an attribute name, or the reserved word **`text`** — because the words in a part are its
*content* rather than an attribute, and pretending otherwise (a `text` attribute on every shape)
would be a schema lying about what a text frame is.

The three attributes are **removed** rather than kept alongside. The schema is not frozen (nothing
outside this repository reads it yet), two ways to say one thing is the duplication this repository
keeps finding, and the migration is the sample deck plus the tests that were written against it.

### 10c. Editing one: a **definition the reader opens**, not a place on a canvas

Figma keeps a main component on the canvas, and it is worth being clear that this is not a
design decision — it is a consequence of Figma having exactly one kind of container. There is
nowhere else to put anything. What follows from it is the part readers complain about: a page
of furniture that is not part of any design, a master that can be moved or deleted by
accident, and navigation by panning to wherever somebody left it.

This engine keeps definitions in `resources` — a layout, a master, a theme — so it has
somewhere to put one that is neither "on a canvas at coordinates" nor a page: **a definition
the reader opens.** Which is the shape readers already know from PowerPoint's *slide master
view*: a separate view, its own list, and a way back.

**The argument that settles it is not about components.** The same mechanism is what a master
and a layout need, and neither has ever been editable in this product: the definitions a deck
inherits from can be *read* by everything and changed by nobody. One notion — "a surface the
reader has opened for editing" — answers all three, and building it for components alone
would be building it twice.

#### Five faults on the way in, all measured

Written down because the *design* being right did not stop any of them, and each is the same
shape: a thing that was true for slides and stopped being true when a definition could be
opened.

1. **The reader was bounced out.** The app fell back to slide 1 whenever `current` was not one
   of the deck's slides — right for "never a slide deleted out from under them", and it undid
   the opening instantly. Then the fix that only asked "does this node exist" was wrong the
   other way: loading a new document leaves the old nodes in the store, so the old `current`
   still existed and the count came up `—`. The precise question is neither: *is the reader on
   a page of this deck, or on one of its definitions.*
2. **A definition stayed hidden with the stage focused on it.** Its renderer writes
   `display: none` inline — so that it stays hidden in a thumbnail or an export, with no app
   stylesheet at all — and an inline style beats any rule.
3. **And its container was hidden too.** Definitions are drawn inside `resources`, hidden as a
   group, so the definition came out `display: block` inside a `display: none` parent.
   Un-hiding the group *unconditionally* then put a block into the flow on every slide and the
   ruler came out six pixels off the slide it measures — so the rule names the group that holds
   the focused definition (`:has()`) rather than all of them.
4. **The ribbon put a new shape on slide 1.** It passed `slideId` only for controls the toolbar
   model marks `needsSlide`, which was right while "where" could only be a slide. The app is the
   only thing that knows where the reader is, so it says so on every control.
5. **A strip for a feature no deck used.** The components panel's closed strip took 24px from
   every deck, the slide re-fitted, and the ruler test found the misalignment. It draws nothing
   at all when there are no components.

#### 10c-2. And then it was built for the other two

The paragraph above says the argument settles it because a master and a layout need the same
mechanism. They have it now, and building it for them found two things a component's definition
had hidden:

- **A master was drawn by nothing.** `slideMaster` had no renderer, and neither did `theme` —
  so a master's placeholders were read by the formatting cascade and could be clicked by nobody,
  which is the sentence beside `slideLayout` biting: *a node with no element has no place in the
  sid map.* The conformance harness could not see it either (`every-node-is-drawn` walks what a
  canvas can hold, and a resource is reachable only through `resources`) — a known blind spot in
  the backlog, and this is the second thing it hid.
- **A layout has no size of its own.** It is the shape of the slides that follow it, so the fit
  comes from `stageFit` and arrives in the stage's generated rule. A renderer resolving the
  deck's size through the environment would have put a foreign read in the one place this design
  keeps plain.

And one thing a reader can now do that no command allowed: **change what a layout is.**
`setBoxStyle` refuses a node that is not a box, so a layout's name and the background every slide
following it draws were unreachable. `setDesign` is that, in the panel of the thing the reader is
standing in.

**A layout's boxes are copied, not drawn from the layout**: a slide draws its layout's *formatting*
and *background* live and its boxes never. `applyDesign` puts the arrangement onto every slide that
follows — offered rather than automatic, because a reader who edits a layout and watches twenty
slides rearrange themselves without asking has lost twenty slides.

This is now a **decision** rather than a limit, and it is worth being explicit: a placement follows
its definition live (§10b-2a) and the same machinery could make a slide follow its layout's boxes.
It should not. A slide's boxes are the reader's — they type in them — and a layout that owned them
would take their words away when it changed. A layout is a *template* in the sense §10b-2a draws:
something you copy and then own.

#### One state, one meaning

`current` becomes **the surface the reader is on**: a slide, or a definition being edited.
Not a second variable beside it, and the reason is a measured fault rather than tidiness.

The insert commands take a `slideId` and validate it against `deckSlides` — so with a second
variable, every call site that forgot to pass it would insert onto **slide 1** while the
reader was looking at a component, silently; and every call site that did pass it would be
*refused*, because a definition is not in `deckSlides`. Both were measured. So the commands
learn one thing instead: a `slideId` may name any **editable surface**, a slide or a
definition, and defaults to the first slide.

The readers that need something narrower ask a named question, which they should have been
asking anyway — `isSlideSurface`. The cost is small and was measured too: the deck's count
already draws `—` when the current surface is not one of its slides, and the filmstrip simply
highlights nothing.

**What is off while a definition is open**, and why: presenting (a definition is not in the
sequence and has no audience), the timeline (it has no motion of its own — an instance's
motion belongs to the slide it is placed on), and the deck's own check (a definition has no
alt text to be missing, and counting its faults would double-count every placement's).

#### 10d. What a reader does most: an override made on demand

The commonest edit is "this card, with this heading". With overrides declared by role, that
needs the placement to *have* a child with that role — and asking a reader to declare one
first would be asking them to learn the model before they can type.

So the gesture is the one they already have: **double-click the part**, and the placement
gains its own copy of it with the caret in it. Which is exactly what a new slide does with a
layout's placeholders (`layoutPlaceholders` copies, because a shared node would make editing
one slide rewrite every other), and it means the reader never learns the word "override" —
they type, and what they typed is theirs.

Two guards the model needs, both of which a definition can otherwise walk into:

- **A cycle.** A definition may hold an instance — a card containing a badge is the ordinary
  case — so it may hold an instance of *itself*, and drawing that is an infinite descent.
  Refused where the parts are resolved, with a depth limit as well as a visited set: the limit
  catches the mutual case (A holds B, B holds A) that a per-instance check does not.
- **A definition that is gone.** The placement draws what it holds and nothing else, which
  keeps the boxes a reader typed into rather than making them vanish with the definition.

## 11. A deck that is not a line

A shape a reader presses, and the page it shows. Keynote calls a deck built this way *links
only*; PowerPoint spells it 하이퍼링크/동작 설정; Figma's prototyping is the same idea with the
pages drawn as a graph.

### 11a. Measured first: the click was already there

`present.tsx` collects the shapes whose press **runs** something (`triggers`, by sid) and already
had the rule a jump needs — *a press that fires one does not also advance the deck* — written when
a build could be fired by a click, with the reason that a quiz answer must not advance past its
own tick. And `advanceShow` already answers with a `slide` to show. So a jump is a new kind of
thing to trigger, not a new mechanism, and that is why it is small.

What was **not** there: a page had no durable name. `surface` declared `kind`, `name`, `width`,
`height` (plus the deck's own `layoutId`, `hidden`, `noteId`, `trackId`, `guides`) and nothing a
document could point at. `name` cannot do it — it is what the author calls the page, it is shown
in the filmstrip, and two pages may be called the same thing — and a sid cannot, because `forFile`
strips those. So `surface.id`, absent until something needs it, like every other durable id here.

### 11b. The fact is on the shape; the connector is a **view** of it

`goTo` (a page's durable id) and `goToKind` (`page | back | next | previous | first | last`) live
on the shape. Not as a `connector` node, and the reason is the audience: a connector is a line
**they can see**, and an arrow pointing off the edge of a slide means nothing to them.

So the deck's **map** — pages as a graph, with the presses drawn as connectors between them — is
a *view* derived from these attributes, using the graph layout the tidy feature already has. One
fact, one place; the drawing is a view of it. Which is the same split the components model
reached from the other side: two representations of one fact is how they come to disagree.

`goToKind` is a closed set rather than reserved words in `goTo`, because a page whose id is
literally `next` is a page that would have lied about.

### 11c. Going back is not a link

`back` is the reader's **own history** — which page they came from — so it is runtime state, held
by whatever is running the show, and the model only says that a button asked for it. The
distinction is the reason it exists at all: a reader who jumped from the menu to section four
means *the menu* when they press 돌아가기, and the page before section four in the deck is section
three.

`next`/`previous`/`first`/`last` walk the pages a show moves through — the deck less what it skips
— and **stop at the ends rather than wrapping**: a deck is not a carousel, and a button that
quietly went back to the start would be a reader's talk starting again in front of an audience. A
hidden page is still somewhere a *named* jump can go, because a reader who linked to it meant it.

### 11d. What the reader picks and what the document holds

The panel offers the pages **by name**, because that is what a reader knows. `setBoxJump` takes
where they pointed and writes the page's durable `id` — **minting one if the page has none**, in
the same transaction, so one press of undo takes back "I made a button". Exactly what motion does
when a build first names a shape.

### 11e. What the deck's own check says

Two faults, both invisible while the deck is being made and certain to be found by an audience:

- **A button pointing at a page that is gone** — 고칠 것, because a press that does nothing in
  front of a room is not a matter of taste.
- **A page nothing leads to** — 볼 것, and asked *only of a deck that has buttons at all*: in a
  linear deck every page is reached by pressing on, and reporting all of them would be the check
  telling a reader off for making an ordinary deck. A page carrying 다음 or 이전 keeps the linear
  order alive, so its neighbours count as reached.

### 11f. The map: a view of the buttons, not a second place to keep them

Pages as a graph, laid out by the tidy's own `layoutGraph`, with the presses drawn as connectors
between them — routed by the deck's **own** `connectorPoints`/`connectorPath`, because a second
answer to "how does a line get from this box to that one" is how a map and a slide come to
disagree about the same picture.

Nothing in it is written. There is no position on a page to keep, which is also what decides what
a reader may do in it: **a page cannot be dragged**, because dragging would be asking the map to
remember a place and it remembers nothing. What it is for is *seeing the shape of the deck* and
going to a page — every page in it is somewhere to go, the rule the check's rows already follow.

The deck's own order is drawn as well as its buttons. A map without the spine is a page of
islands: a reader who has added two buttons to a twenty-page deck should see a deck with two
buttons, not two pairs of pages. The spine is faint and dashed; a jump is in the accent, because
it is the thing the reader added — the same distinction the timeline makes between a sequence and
a trigger.

A `back` button gets no arrow: where it goes depends on where the reader came from, which is not a
fact about the deck (§11c).

#### What the map found: the first reachability rule was wrong

It said *once a deck has a button, every page must be named by something*, and a browser test on
the real sample deck reported **five of its six pages** as unreachable the moment one button
existed. Nonsense — pressing on still reaches them. A deck with buttons is not automatically a
deck that is *only* buttons; Keynote has a mode for that and this product does not yet, so the
order is alive whatever else is in the deck.

So an island is a **hidden** page nothing links to: one the show skips by design, kept for the
questions afterwards and never wired up. Which is a fault a filmstrip cannot show and an audience
will find. (The sample deck's hidden page has a button now, and that is the pattern a hidden page
is for.)

#### Rewiring in the map

An arrow's end is taken hold of and dropped on another page — the gesture a connector already has,
and the right one here for a reason worth stating: **"which button" is a question a drag between
two pages cannot answer.** A page holds one, four or none; a drag from page to page would have the
map choosing, which is the map deciding what a reader meant. Taking hold of the button that is
already there asks nothing.

So making a *new* button stays in the properties panel's 누르면 row, and the map moves the ones
that exist. Dropped on nothing changes nothing: a button that quietly lost its page because a
reader let go in the wrong place is worse than a drag that fails.

Where a route *arrives* is the model's answer (`MapLink.end`), because the grip sits on it — an
app drawing a grip "somewhere near the end" would be a second answer to where the line ends. And
which page is under the pointer is asked of the browser (`elementsFromPoint`) rather than by
comparing the pointer with the model's scaled boxes: a second conversion is a second chance to be
a pixel out, and the page a reader can see under their finger is the honest answer.

### 11g. Links only, which is one decision about the whole deck

`document.advance` — `press` or `links`. The first deck-level setting this schema has, and it has
to be one: *what does a click mean here* cannot be answered per page, because a deck where half
the pages advance and half do not is a deck nobody can present.

`links` is Keynote's mode, and the behaviour is the whole of it: a press plays the next build and
then **stops**. The builds still run, because a build is a press about *this* page and has nothing
to do with the order of the deck. What a quiz, a menu of sections or a kiosk needs is precisely
that landing on the next page by accident is impossible.

Four things follow, and every one of them is somewhere a reader would otherwise be lied to:

- **The show** stops at the end of a page (`advanceShow`'s `linksOnly`).
- **The scroll show is refused**, greyed with the reason: a scroll is a *line*, and a deck that is
  not one has nothing for it to run along. The rule this product follows wherever the model has no
  answer — the frame's refused drag, a placement's size fields.
- **The presenter's next page** is not shown, because there is not one: a thumbnail of "the page
  after this in the file" would be telling a presenter something that is not going to happen.
- **The map draws no spine** — there is none — so the picture becomes the whole truth about where a
  reader can get to, which is the point of drawing a map of such a deck at all. And the deck's own
  check asks the larger question: every page a button does not name is an island (the same
  function, §11f).

Written as **absent** when it is `press`, because that is what every deck has always been and an
attribute on every document saying so is noise in every file — the same rule a placement's
`visible` and a child's `layoutStretch` follow.

### 11h. A button into another deck

A deck of a hundred slides is really four decks, and the link between them is the thing every other
tool makes you fake: export to one file, or paste the pages in and let them go stale. `goToDeck`
names the other document and `goTo` names the page **inside it**, so the pair reads as one
sentence.

**What it can point at is a source the product can fetch**, and that is a limit rather than a shape
to be generous about: this engine has no library of decks, so there is no id space for "the deck
about pricing" and anything but a name the runtime can resolve would be a reference nothing could
follow. When a library exists, this is where its id goes and a fetchable source stays legal.

Three things follow from *another document is not in this one*:

- **Nothing in the model resolves it.** `jumpOf` reports the deck and no `toSid`; `jumpTarget`
  answers nothing. The **show** is what opens it — a fetch, `readDeckFile` (the same reader the
  열기 button uses, so a bad file says the same thing in a show as in the editor), `loadDocument`,
  and then the page by its durable id, resolved *after* the load because until then it does not
  exist in this session.
- **The check warns rather than telling.** A cross-deck button is 볼 것, not 고칠 것: whether that
  page is there is not a question this document can answer, and a reader who deleted the button on
  a 고칠 것 would have lost a working link. What the check *can* say is worth saying — the deck it
  points at has to exist wherever they are presenting from.
- **A failure is said, not swallowed.** A button that silently does nothing in front of a room is
  the fault this whole feature's check exists to prevent, so an unreachable deck puts a message
  where the reader is looking — including while presenting, because an audience being shown a
  broken link is better off with the message than without it.

And nothing is confirmed on the way: a reader presenting has already chosen this by pressing the
button, and a dialog in the middle of a show is worse than any work it could save. The editor's own
열기 still asks, because there it is the reader's own file being replaced.

### 11i. A library of decks: the reader's own, by name

Two features asked for the same thing. A button into another deck could only point at *a source the
product can fetch* (§11h), so a reader's own deck had no name to be pointed at by — and a shared
component library (§10) is the same want from the other side: definitions that live in a document
other than this one. Neither is possible while *"the decks I have"* is not something this product
can say.

**The naming is a question about documents; the storage is not.** So `deck-library.ts` in
`office-slides` answers what an entry *is* — a durable name, unique, derived from the deck's own
title, plus the facts a list shows — and the app keeps the bytes. A different host would keep them
in a directory or on a server; the naming rules would not change.

**IndexedDB, and the choice was measured.** The sample deck is 42KB of JSON and the starter 8KB,
both pictureless; one photograph is a base64 megabyte. `localStorage` has about five in total and
fails by **throwing in the middle of a save** — a store whose predictable failure is "the reader
loses the deck they were saving" is not one to build on. The cost is sixty lines of
promise-wrapping.

**One attribute, resolved by the host.** `goToDeck` holds a name *or* an address, and which it is
is decided where it matters: the same deck is a name on the machine whose library has it and an
address on one that has never seen it. `isLibraryName` decides by **what a name may be** — a
library name cannot contain a slash, a dot, a colon or a space, because `libraryName` strips them —
rather than by guessing whether a string looks like a URL, so the rule stays true when addresses
change shape.

Three smaller decisions, each a reference that would otherwise break:

- Saving a deck the reader already has **keeps its name**. Minting a second would leave every
  button pointing at the old copy, which is the one thing a durable reference must not do.
- Opening a file from disk **clears** the remembered name: a file is not a library row, and the
  next 라이브러리 저장 would otherwise overwrite a deck the reader never meant to touch.
- Taking a deck out does not change the decks that point at it. Their buttons warn, which is what
  the check already says about a link out of a deck (§11h) — and is honest, because the deck may
  come back.

A library row is not a replacement for a file. A file is the deck a reader can email and open on
another machine; a row is the deck they can **point at from inside a document**. So the button sits
beside 저장 rather than instead of it.

### 11j. Still open

**Between decks.** A button that opens another deck at a page needs a reference to a *document* —
a file, an address — and that is a decision outside the model: there is no library of decks yet.
The attribute is shaped so it can be added beside `goTo` rather than inside it.

**The map view.** §11b's derived graph. The pieces are there — `layoutGraph`, `connectorRouteOf`,
`deckJumps` — and it is the next item.

## What the first three have in common

Each was a fact that the code already depended on and no single place stated:
the unit was implied by a conversion, the coordinate space by two renderers, the
inheritance by a comment explaining why a control was left switched off. All
three were about to be re-derived by the next feature.

That is the pattern this repository keeps finding, in the schema and now in the
model's semantics. The remedy is the same each time — one declaration, read
rather than restated, and a check that fails when the restatement creeps back.
