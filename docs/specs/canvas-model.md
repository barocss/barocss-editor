# What a coordinate on a canvas means

Three decisions that had to be made, settled together because each was about to
be made twice — once by a clipboard, once by a layout — and a decision made
twice is a decision made differently. A fourth is written down early, because it
is the one that would otherwise be made by accident.

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

**What it bought.** The ribbon's font and size controls read 33pt for a title
and 20pt for a body, in a deck where no slide sets a size anywhere. And "apply
this layout" now means something for a slide that already has content, because
applying it changes what is inherited rather than overwriting what was typed —
which is the next thing to build on it.

**What it costs.** One resolver, shaped like `office-word/style-resolver`, and
the same restraint that one has: only known formatting keys cascade. A layout
placeholder also carries `role`, `x`, `y` and a size, and cascading those would
move every title on every slide to where the layout's is.

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

## What the first three have in common

Each was a fact that the code already depended on and no single place stated:
the unit was implied by a conversion, the coordinate space by two renderers, the
inheritance by a comment explaining why a control was left switched off. All
three were about to be re-derived by the next feature.

That is the pattern this repository keeps finding, in the schema and now in the
model's semantics. The remedy is the same each time — one declaration, read
rather than restated, and a check that fails when the restatement creeps back.
