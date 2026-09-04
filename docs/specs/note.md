# Note, measured after it was built

`word.md` opens by saying it is the other case from `site-builder.md`: the site
builder's spec was written *before* a line of it existed, and Word's was written
after. This is the third case and a different one again — **note was built to test
a claim the other two had already made**, and the claim was about the
architecture rather than about a product.

The claim: *one document engine, several products.* Word came first and the
shared layer was extracted from it, so Word could not test it — a layer extracted
from one thing fits that thing. The site builder was the second and it is 28,293
lines, big enough that "it worked" says little about the seam.

Note is the small one. **The whole product declares three schema nodes**, and
`apps/note` is **257 lines**. If the seam were an illusion, that would not stand up.

Every number below is produced by a test or a script, not by a person looking.

## What a note is, in this model

A `note` node holding a sequence of blocks, and nothing else:

```
note                       ← topNode. `title` optional
  (heading | paragraph | list | blockQuote | codeBlock
   | bTable | horizontalRule | picture | mediaVideo | mediaEmbed)+
  resources?
```

That expression is `NOTE_CONTENT` and it is **ten block kinds**. The store
validates against it, which is the point of the package: a `form` written into a
body is refused **by the model**, not merely left off a toolbar. A toolbar that is
the only thing saying no is a toolbar somebody works around with a paste.

`title` is optional, because a body inside a site's data row is named by the cell
that points at it and has no title of its own — the same reason `richText.id`
stopped being required.

## What note declares, and what it inherits

Measured at runtime:

| | count |
| --- | ---: |
| schema nodes reachable | **60** |
| of those, **declared by note** | **3** — `note`, `mediaVideo`, `mediaEmbed` |
| attribute slots | 304 |
| marks | 25 |
| commands registered | **107** |
| of those, table commands | 12 |
| keybindings | 42 |
| of those, **added by note** | **2** — `Tab`, `Shift+Tab` |
| toolbar rows | 15 |
| block kinds a body admits | 10 |
| browser tests | **21** |

**Three nodes and two keys is the whole of what this product is.** Word declares
108 node types and 71 keybindings. The distance between those two numbers is the
measurement this product exists to take.

### Why `mediaVideo` and `mediaEmbed` had to be declared

Office leaves both behind on the argument that *a document that cannot play one
has no word for it*. True of a printed document and not of a written one: a post
with a clip in it is ordinary, and `office-site` takes the same two one layer over.

**Found by pressing the buttons.** `NOTE_BLOCKS` named both, the content
expression admitted both, the bar offered both — and the model answered *Unknown
node type*, because **naming a type in an expression does not declare it**. Three
places agreeing about a node that does not exist.

## What is deliberately absent, and the sentence for each

The extension list is short and every absence is an argument:

- **no `FontColorExtension`, `FontSizeExtension`, `FontFamilyExtension`** — the
  design's, not the writing's. This is the whole styling rule, enforced by *not
  registering the command* rather than by hiding a control.
- **no `ReorderExtension`** — z-order is a plane's idea; a body is a sequence.
- **no clipboard extension of its own** — a note has no pages to move a block between.
- **no `insert*` for a frame, a collection, a chart or a form** — a body is
  written, a page is arranged.
- **no keymap beyond two keys** — see below.

## Why the keymap is two lines

`word-keymap.ts` states the principle: *keys live with the product, not the
engine — `Mod+Alt+1` means "Heading 1" in a word processor and nothing at all on a
FigJam board.*

The engine's default keymap already gives Enter, Backspace, Delete, the arrows,
word-wise motion, bold, italic, underline, strikethrough, quote, both lists,
indent, undo/redo, copy/cut/paste and select-all. **That is almost everything
writing needs, and a note is writing.** Word's other 69 keys are a word
processor's conventions — fields, equations, comments, `Mod+Alt+i` for a row.
Note has none of that vocabulary, so it has none of those keys.

The two it does add are `Tab` and `Shift+Tab` in a table, and they are not note's
invention: they are **that node's convention** — the same in Word, Google Docs,
Notion and every spreadsheet. So they are declared once next to the commands they
drive (`TABLE_CELL_KEYBINDINGS`, beside `TableExtension`) and note spreads them.

That distinction is the useful part. *Keys belong to the product* is right for
`Mod+Alt+1`. It is wrong for `Tab` in a table, and following it too far is how
**the four products with tables ended up with only Word able to press Tab**.

## What building it found — and this is what it was for

Every item here is a defect in something **shared**, surfaced because a small
product used it plainly.

| what | the shared thing that was wrong |
| --- | --- |
| the `/` menu did not open on a click into a row's body | a caret is a range whose ends are equal; the code asked `collapsed !== true` and a press does not always set that flag |
| the table could be held but nothing could be done to it | `TableExtension` — already in note's kit — registered six commands note could not reach |
| four commands were written that already existed | `addNoteRow` and three siblings, over operations the model already had; `three-agree.test.ts` found it two hours later |
| `Tab` in a table did nothing | `nextCell` was registered by the shared extension and bound only in `word-keymap.ts` |
| inserting a table left the caret on `bTableHeader` | `addChild`'s `selectionAfter` read `content[0]` one level down and called it `firstTextNodeId` — a paragraph's first child *is* its text, a table's is a header |
| cells could not be selected in a body | `installCellSelection` existed, 379 lines, inside `office-word` — reachable by two of the four products |
| `mergeCells` refused a `cell` selection | `extensions/table.ts` asked `type !== 'range'`, and `cell` is the selection type that exists for that command |

**The caret one is worth reading twice.** Note's held-block toolbar passes the
pressed cell explicitly — `const on = { nodeId: sid, cellId: cell }` — so *Insert
row* worked while the model's caret sat on a structural node. The button had its
own path to the answer and the keyboard did not. **When the button's route and the
keyboard's route differ, the button hides the defect**, and the defect was in
`addChild`, which every insert in every product goes through.

## What the seam actually cost

`office-note` is **2,079 lines** and `apps/note` is **257**. For comparison, the chrome
still living in the other three apps is **35,727 lines**.

Note is the only product that passes the roadmap's Phase 3 condition — *the shell
in `apps/` belongs to no product* — and it passes it by holding its own view and
toolbar in the package, so the app mounts it in one line. That is not a nicety:
it is the reason multiple notes can be mounted on one page, which is what
`apps/note` exists to do.

**Rendering had to be scoped for that to be true.** Renderers register globally by
stype and the last write wins — measured, Word overwrote 117 of the site's 125.
`intoRegistry` gives the writing end a scope, and `noteRegistry()` is why a note
draws with note's renderers wherever it is mounted and a host's own `paragraph`
survives it.

## What is owed

In the order the measurements put it:

1. **Dragging a held block to move it.** Up and down are buttons; there is no
   drag. `shared/gesture.ts` now exists, so this is small.
2. **The service layer, which is most of what *standalone CMS* means.** A list of
   posts, storage, publishing, an author. Measured at roughly zero across the
   repository, not just here — `TECHNICAL-ROADMAP.md` §2.4.
3. **A body inside a site row is the one live cross-product edge.** `office-site`
   reads `NOTE_CONTENT` so that *what may a body hold* is written once. Intended,
   and the only one of the three product-to-product edges that is.

## What this document is not

An argument for the design. The design was argued in `site-builder.md` and
extracted in Word; this records **what a third product cost, and what it found
that the first two could not.** The findings table above is the whole reason to
have built it small.
