# Word, measured after it was built

The first product, and the last to be written down. `site-builder.md` was written
*before* a line of that product existed, because a boundary recorded after the
fact is a rationalisation. This is the other case and has to be honest about it:
Word was built first, the shared layer was extracted from it, and everything
below is measured out of what exists rather than proposed.

Which makes it a different kind of document. The site builder's spec argues for
decisions; this one **states what is there, what is deliberately absent, and what
is owed** — and every number in it is produced by a test rather than by a person
looking.

## What a Word document is, in this model

A `surface` of kind `flow`, holding blocks, paginated at the product layer. The
schema said so before there were three products:

> `SurfaceKind.Flow` — Word, PageBuilder: flow content, **paginated or responsive
> at the product layer**.

So Word and the site builder take the *same* document shape and disagree about
one thing: Word cuts it into pages of a fixed size, and a site builder reflows it
to the width of a window. Neither is a new document.

What it holds, measured: **107 node types, 1,053 attribute slots** — which is
three times the deck's and eight times the site builder's, and is the whole
reason Word is where the shared vocabulary came from.

## What is Word's, and what only looks like it

| a word processor's word | this model's node |
| --- | --- |
| paragraph, heading, list | `paragraph`, `heading`, `list` — the standard schema's |
| character formatting | marks: `bold`, `italic`, `spanLang`, … |
| paragraph style | a `style` resource, resolved through `office-text` |
| table | `bTable`, `bTableRow`, `bTableCell` |
| section, page setup | `section` attributes on the surface |
| footnote, endnote, comment | `footnoteDef`, `endnoteDef`, `commentThread` |
| a drawing | `canvasBlock` holding the canvas vocabulary |

The last row is the one worth pausing on. **Word has a canvas**, and it is the
deck's canvas: a `canvasBlock` in the flow holds `rectangle`, `ellipse`, `line`,
`path`, `frame`, `group` — the same node types a slide places, drawn by the same
renderers. That is not Word borrowing from the deck; it is the reason
`office-canvas` exists, and it was extracted after both products wanted it.

**What is genuinely Word's** is the part no other product has asked for:

- **Pagination.** A page of a stated size, a header and a footer that repeat, a
  break that a reader forces and a break the text finds by itself. `office-word`
  owns the whole of it; nothing else in the suite pages anything.
- **Tab stops.** Measured by a layout pass into the environment the renderer
  draws from — which is why `tabs` is exempt from `every-attribute-is-read` (a
  renderer never sees it) and must never be exempt from
  `every-property-can-be-edited` (the ruler is the only place to set one).
- **Revisions and comments.** Tracked changes, accept and reject, a pane that
  lists them. The deck has comments; nothing else has revisions.
- **Fields.** A page number that knows its chapter, a cross-reference, a sequence.
- **Equations.** OMML, and a caret that moves between a fraction's slots.

## What the chrome is, and what that costs

Word's chrome is a **ribbon, a ruler, an overlay for shapes, and three read-only
panes** (comments, find, outline). Measured: **9 toolbar groups, 60 controls, 59
commands**.

There is **no property panel**, and no dialogs at all. That is the single fact
that shapes everything below, and it is not a style choice — it is where the
product stopped. A ribbon is a good home for a command that applies to a
selection (bold, a list, an alignment) and a bad one for a *value a reader types*,
which is why every word processor that has ever shipped has a paragraph dialog, a
page-setup dialog, a borders dialog and a table-properties dialog. Word has none
of the four.

## What the harness measures, and what it is measuring against

Four numbers, all produced by `packages/office-word/test/conformance.test.ts`:

| | |
| --- | ---: |
| commands registered | 166 (152 Word's own) |
| attributes the product **draws** | 611 |
| of those, **unread** — declared and reaching nothing | 184 *(ratchet)* |
| of those, **unsettable** — drawn and reachable by nothing | 178 *(ratchet)* |
| attributes a reader can set, from the two declared surfaces | 21 |

Both counts are ratchets rather than exemption lists, and for the same reason:
neither is a set of decisions. Every entry is a control somebody will build, and
writing "owed" a hundred and eighty times is a hand-kept list wearing a harness's
clothes.

**The second number is the more interesting one**, because it could not be asked
at all until recently. `Control` declared which command a control runs and never
which *attribute* it writes — different questions, and a product whose only other
writing surface is a ruler had nowhere else for the answer to come from. With
`Control.writes` and `ruler-model.ts`, Word's two surfaces cover 21 of the 77
attribute names it draws.

## What is owed, in the order the harness puts it

The 60 names left group themselves, and the grouping *is* the work list:

| owed | names | what it is |
| ---: | ---: | --- |
| 1 | 16 | **a borders dialog** — `borderTop*` … `borderLeft*`, colour, style, width, spacing |
| 2 | 12 | **a field's own settings** — `tag`, `literal`, `sequence`, `limitLocation`, `showContents` |
| 3 | 8 | **page setup** — page size, margins, gutter, columns and their spacing and separator |
| 4 | 7 | **table properties** — `cellSpacing`, `hide*`, `noWrap`, `heightRule` |
| 5 | 5 | **paragraph spacing** — `spacingBefore`, `spacingAfter`, `spacingLine`, `spacingLineRule` |

plus a handful a **drag** writes on a drawing, which are exemptions rather than
work.

Read the other way, that table says: *Word can draw a bordered, multi-column,
precisely-spaced document and can only make one by opening a file that already
is one.* Every one of the five is a dialog, and Word has no dialogs — so the
first of them is also the decision about **what a dialog is in this suite**, and
that decision is shared work rather than Word's.

## What is deliberately not here

- **A property panel.** The deck and the site builder have one and Word should
  not: a document is a column of text, and a panel that describes "the selected
  block" beside a page of prose is describing something a reader is not thinking
  about. The four dialogs above are the right shape for the same values — modal,
  entered on purpose, left behind. Said out loud because the alternative is
  cheaper to build and would be wrong.
- **Collaboration.** Deferred for the whole suite, with the order that was agreed
  instead — see `BACKLOG.md`.
- **Text shaping.** Word maps no tokens onto `office-ui` either: it imports
  `tokens.css` and takes the defaults, which is correct while its chrome *is*
  that palette.

## What the numbers have already changed

Three things about this document are worth keeping, because they are what a spec
written *after* the fact can offer that one written before cannot:

1. **The work list is not a judgement.** It is a query. Nobody decided Word needs
   a borders dialog; the check counted sixteen attributes it draws and cannot set,
   and they happen to be the borders.
2. **The absences are checked.** Every "owed" line above is a ratchet entry, so
   building one lowers a number and *failing to lower it* fails the build. A spec
   whose claims rot is the thing this repository has spent its whole history
   replacing.
3. **The one thing the harness cannot ask is what is missing from the
   vocabulary.** `cornerRadius` did not exist on a frame, so nothing was absent —
   a schema that declares less passes more easily. That gap is what this document
   is for, and it is the only part of it a person has to keep honest.
