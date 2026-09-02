# What can sit inside a line

A block holds a **flow**: runs of text, and the things that take their place in a line beside them.
This is the list of those things, what each one is for, and — the part that needed writing down — how
far this product goes and where it deliberately stops.

Written because the question was asked in the ordinary way somebody asks it: *스티커라던가, 이모지라던가,
수식이라던가 등등 많을 수 있음.* All three of those are real, two of them are already half-built, and
nothing anywhere said which.

## The survey, measured rather than remembered

Eighteen node types across the repository declare `group: 'inline'`. Asked of each: does a schema a
product actually loads know it, does a renderer draw it, and can a reader make one.

| node | where it is declared | drawn | a reader can make one | what it is |
|---|---|---|---|---|
| `inline-text` | standard | ✓ | — (it *is* the text) | a run of characters carrying marks |
| `hardBreak` | standard | ✓ | ✓ `insertHardBreak` | a line break inside one paragraph |
| `inline-image` | standard | ✓ | ✓ `insertImage` | a picture that flows with the words |
| `bookmarkAnchor` | standard | ✓ | — | a named place a link can point at |
| `fieldDateTime` `fieldDocTitle` `fieldAuthor` | office | ✓ | — | values the *document* resolves |
| `fieldPageNumber` `fieldPageCount` | word | ✓ | ✓ | values the *page* resolves |
| `fieldRef` `fieldSeq` `fieldStyleRef` | word | ✓ | ✓ | cross-references and numbering |
| `noteNumber` | word | ✓ | — | the mark a footnote leaves in the text |
| `tab` `softHyphen` `noBreakHyphen` | word | ✓ | ✓ | typesetting a word processor needs |
| `emoji` | office | ✓ | ✓ `insertEmoji` | a character **and the name for it** |
| **`mathInline`** | standard | **✗** | **✗** | a formula, `tex` and an engine |

**The two at the bottom look like a gap and are a decision.** Both are declared, both have an
extension, both are handled by the PDF exporter — and no office schema inherits either, so no product
can hold one and nothing draws one.

Office takes what it offers from the standard schema **by name**, and twenty-three standard nodes are
deliberately left behind: `OFFICE_LEAVES_BEHIND` in `office-schema.ts` names each with its reason.
Most are the web's vocabulary an office document has no word for (`bFigure`, `descList`, `mediaVideo`)
or something office does its own way (`mathInline` against Word's OMML, `fieldPageNumber` against
furniture the layout paints, `toc` against a contents page computed from headings). A second spelling
of one idea is a second thing to keep working.

That was prose until this was written, which was the actual fault: a name in **neither** list vanished
in silence, and no check here could see it — every check asks about the nodes a product *declares*.
Building the office schema now refuses a standard node that is neither taken nor explained.

**`emoji` was the one that was a decision rather than a difference**, and the decision expired: there
is nothing an office document cannot do with one, and it was out because nothing offered a picker.
The site builder asked, so it came in — schema, renderer, picker, and a browser test.

### What an emoji being a *node* buys

A character in a run needs none of this. The node exists for the other half:

- The document keeps **`:tada:` beside the glyph**, so a search finds the word a reader typed rather
  than a character nobody can type into a search box.
- A screen reader is told **the name they meant** rather than whatever its own table calls the
  codepoint.
- A document that travels between products means the same thing in each.

And it is an **atom**, which is a claim the DOM has to be told about. Left alone the browser put the
caret *inside* the new node, at offset 0 of the character — where the next keystroke goes into a node
that cannot hold one, and where the run index has no entry for the reader's position. Three things
together, all needed:

1. `contenteditable="false"` on the element, so a caret cannot go in. **On its own it made things
   worse**: the caret was already in there and could no longer get out.
2. The insert says where the caret lands — the start of the text that now follows, or the end of the
   run before it. Both are a caret in text, which is the only place a caret belongs.
3. It says it to the **model and the DOM**. Setting the model alone leaves the browser's caret where
   it put it, and the next read writes that back over the answer.

Word and the deck draw it and offer no picker, which is written down in each rather than exempted
away: the command is shared, the surface is not.

## What an inline thing has to have to be alive

The same four places every attribute needs, one level up:

1. **Declared** in a schema a product loads — not only in `standard-schema`.
2. **Drawn** by a renderer registered for that product.
3. **Reachable** — a command, on a menu or a key or the `/` list.
4. **Exported** — the published page and the PDF both draw it, or it is a thing that only exists
   while editing and says so.

`emoji` and `mathInline` have 3 and 4 and neither 1 nor 2. `bookmarkAnchor` and the office fields
have 1, 2 and 4 and no 3 — they are made by other gestures (a link target, a header) rather than
inserted, which is a legitimate answer and is written here so nobody adds a redundant button.

## Where this product stops, and why

**Built:**

- **Emoji.** A character in a run needs nothing at all — it is text, and a picker is a convenience.
  The `emoji` *node* is for the other case: a shortcode a document keeps as `:tada:` and draws from a
  set, so a document is searchable and a rename of the set changes every use. That is the same
  reference shape this model has six of, and the reason to have the node rather than the character.
~~- **A sticker**~~ — **built**. An `inline-image` naming a file, which is the whole of it: no new node
  type and no second box. Two things were missing and neither was in the model: somewhere to pick one
  from, and one line in the renderer — the *block* `picture` has always resolved `asset:이름` and the
  inline one did not, so a sticker would have drawn a broken image with `asset:하트` in its `src`.

  In the same dialog as the emoji, because from a reader's side they are one errand — *put a small
  picture here* — and two buttons would be the model's shape leaking into the toolbar. It draws at
  the line's height: a picture that decides its own height mid-paragraph is a paragraph whose lines
  are different heights, and a reader who wants a big one wants a block.

**Yes, but not free:**

- **A formula.** `mathInline` carries `tex` and an `engine`, and drawing one means shipping a
  typesetter: KaTeX is ~280 KB, which this product currently ships zero of. That is a decision about
  what a published page costs a visitor, not about the model — a site that renders formulas to SVG at
  publish time pays nothing at run time and cannot re-flow them. **Open**, and the trade is written
  here so it is made on purpose.

**No, deliberately:**

- **An arbitrary embed** — a tweet, a video, a map — as an *inline* node. Those are blocks: they have
  a size and an aspect and they interrupt the reading. A page already has `picture` and `code`, and
  the shape for the rest is a block with a `src`, not something that sits between two words.
- **Anything that needs its own caret.** A formula a reader edits *in the line* is a second editor
  inside the first, and this model has one caret. A formula is edited in a panel or a dialog and
  drawn as an atom, which is what every editor that survived does.

## The rule for adding one

An inline node earns its place when it is **a thing a sentence contains that is not characters** and
it can be drawn as an **atom** — one indivisible unit the caret moves over rather than into. If a
reader would want to put a caret inside it, it is a block. If it can be written as characters and a
mark, it is characters and a mark.

That test is what keeps this list short: `tab` and `softHyphen` pass it because a tab is not a run of
spaces and a soft hyphen is not a hyphen; a "highlighted word" fails it because that is a mark.
