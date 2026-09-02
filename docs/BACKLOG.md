# Backlog

What is worth doing next, and why. Kept in the repository rather than in a
conversation, because a list that lives in a conversation is a list that is
forgotten between them.

[ROADMAP.md](./ROADMAP.md) holds the reason there is a next thing — what this is
for, and in what order. This holds the next thing itself.

## How this is kept

- **One entry, one thing a reader could notice.** "The ruler scrolls away" is an
  entry; "refactor the ruler" is not.
- **Say what is already there.** Most of what has been done in this repository
  was not building a feature but *reading* one the schema already had — five
  times over. An entry that names the code that already exists is an entry
  somebody can finish in an afternoon; one that does not is a research task
  wearing a feature's clothes.
- **Move it to Done when it ships, with the surprise it produced.** The surprises
  are the part worth keeping: they are what the next person would otherwise
  rediscover.
- **Add to it while working.** Anything found and not fixed goes in Open before
  the commit that found it.

Find what the schema declares and nothing reads — the sweep that keeps producing
these — from `packages/office-word`:

```
pull the keys out of each *FormatAttrs() group in src/formatting.ts,
strip comments from every other file in src/, and grep
```

Stripping the comments matters: prose mentioning an attribute makes it look
read. Then grep each *surviving* name for `format.<name>` specifically, because
the first pass has a blind spot that has now cost something: a name read for a
different meaning counts as read. `shadow`, `emboss` and `imprint` are character
formats *and* marks, and the marks made the formats look answered — a run that
arrived embossed from a style drew flat, and the sweep said the attribute was
covered.

The second blind spot is the other way round: a key built by template
(``table[`cellMargin${side}`]``) counts as unread, and the four `cellMargin*`
entries are that.

---

## Open

### 캔버스의 휠이 미리보기의 스크롤을 먹고 있었다 — 2026-09-02 *(fixed)*

Reported as *미리 보기는 스크롤이 되어야 하는데, 마우스로 스크롤을 할 수가 없어, 뭔가 편집 상태에서
누군가 이벤트를 가로막고 있는 것 같아* — and that is exactly what it was, one layer further out than
the editor: `useViewport` listens for the wheel on **`window`, in the capture phase**, and called
`preventDefault` on every tick whose point fell inside the pane. Nothing downstream ever saw one, in
any mode, for any reason. A preview was a page a reader could look at the top of and nothing else.

**Measured before writing the rule**, because a rule that took the plane's pan away would have been
worse than the fault:

| | 편집 | 미리보기 |
| --- | --- | --- |
| `.st-frame` | `visible`, 5085/5085 | `visible`, 823/823 |
| `.st-frame-body` | `visible`, 5063/5063 | **`auto`, 5063/800** |
| `.st-page` | `visible`, 5063/5063 | `visible`, 5063/5063 |

Nothing inside the plane scrolls while editing. So the rule gives the gesture away in exactly the
case where the plane is not what the reader is pointing at, and in no other: **a wheel over something
that can scroll belongs to that thing** — no `preventDefault`, so the browser scrolls it as it would
anywhere else. Whether the scroller is *at its end* is deliberately not asked; a page scrolled to the
bottom does nothing more when you keep scrolling, which is what a browser does and what a reader in
preview is looking at.

⌘ with the wheel keeps the whole gesture regardless, because the browser's own page zoom is what that
means to a browser and a reader zooming the plane does not want the application to grow around it.

In `office-ui`, so all three products have it. The deck's 407 browser checks pass unchanged.

### 와이어프레임은 회색이 아니다 — 회색은 덜어내는 쪽이고, 그 자리에 정보가 들어가야 한다 — 2026-09-02

Asked straight after the view landed: *와이어프레임은 그냥 회색톤으로만 만들면 되는 것인가?* No —
and the four things already in it are the answer to why not. Grey is the **removal**; a wireframe's
job is what goes into the space it leaves.

What is in it: the colour, shadows and photographs taken down; the boxes whose content is unreadable
once grey **say what they are** (폼 · 데이터 목록 · 표 · 코드); anything with a rounded corner keeps a
hairline, so a control still reads as one; and the layout is untouched to the pixel.

What is **not** in it yet, all four of which are facts the document already holds and nothing draws:

- **Reading order** — 1 · 2 · 3 on the sections. Half the reason anybody shows a wireframe to someone
  else is *this is the order it reads in*, and the drawing does not say it.
- **What this width hides.** `neverShown` and the per-width hiding are in the schema. A section that
  drops out on the tablet currently looks identical to a section that does not exist, and it should
  be a dotted place holding its own space.
- **The one thing a visitor is here to do.** Already an open question of its own below. Five buttons
  at one weight is a page with no answer to it; in a wireframe the answer should be the one heavy
  outline.
- **Spacing and direction.** The bands and the gap strips exist while editing and are absent here,
  which is backwards: *여기가 좁다* is most of what a reviewer has to say.

And one thing that is deliberately out: **annotations**. A note is information the page does not have,
so putting it in the document makes it publishable — and the moment it is, "one document" is over.
The moment annotations are genuinely needed is the moment a **화면 흐름도** is needed, which is a
different product and is the other half of *선언하고, 검사한다*.

### 와이어프레임은 다른 문서가 아니다 — 필터도, 별도 에디터도 아니라 세 번째 보기 — 2026-09-02 *(built)*

Asked as a choice between two: *와이어프레임처럼 보이도록 필터를 입히는 게 좋을까, 아니면 와이어프레임
에디터를 따로 만드는 게 좋을까?* Measured before answering, and the measurement says neither.

**A separate editor is a second document.** The two would have to be kept in step, and keeping them in
step is exactly the work that makes a plan and a design drift apart — the thing *선언하고, 검사한다*
was chosen to avoid. This repository's premise is one schema and one renderer across three products; a
wireframe is not a different document but the same page **read at a lower fidelity**.

**A filter alone cannot say what a thing is.** `grayscale()` and hidden images produce a page with the
colour taken out, which is not a wireframe: a wireframe's job is to show structure and intent, so a
grey box has to be able to say 영상, 폼, 데이터 목록. Measured in the board's own DOM — it carries
`data-name`, `data-kind`, `data-layout` and `data-sizing` and **not the node's type**, so as things
stand a stylesheet has nothing to write in the box.

So: a third `view`, beside 미리보기 — which is already declared as a view rather than a command, and
already answered by one `switch` in the app. `view: 'wireframe'` in `menu-model.ts`, and a stylesheet
generated from the document the way `editorStateCss` and `revealRules` already generate one.

**Two of the three parts this entry first listed were wrong, and building it is what said so.**

- *"The renderer writes the node's type onto every drawn block"* — **not needed at all.** The
  generated half keys its selectors on `data-bc-sid`, exactly as the two sheets it sits beside do, so
  the name in the box comes from the model and the DOM learns nothing new. A renderer change that
  would have shipped in every published page, avoided by using the path that was already there.
- *"pictures to a hatched box"* — it worked, it looked right, and **it moved them.** `content:
  url(<a 1×1 svg>)` empties a replaced element and replaces the intrinsic size every `width: auto`
  image is laid out from: the browser check compared picture boxes before and after and found 266×199
  become 225×225 and four 61×20 logos become 2×2. A wireframe whose boxes are the wrong size is a
  layout the reader does not have, which is worse than a photograph with no caption on it. The media
  is **washed** instead — `contrast(0)` makes one flat grey — with an `outline` rather than a border,
  because a border made every picture a pixel wider.

Two more things a browser settled: a replaced element paints no `::before` (probed on an `img`, a
`video`, an `iframe` and a `div` — only the `div` drew one), and a button on this page is a *frame
with a fill*, so the rule that lays fills down to grey made the page's one call to action disappear.
What tells a band from a control in the drawing is the rounded corner, so anything with a radius keeps
a hairline — which draws the buttons back and every card as a box.

The text stays the text. A wireframe with real copy in it is the one that produces real decisions, and
lorem ipsum is how a layout gets approved for a paragraph nobody has written yet.

**And the one case that genuinely is a separate product**: when it has to *differ* from the real page —
annotations, arrows between screens, a screen that does not exist yet. That is not a wireframe, it is a
화면 흐름도, and it is the other half of *선언하고, 검사한다*.

### Six of Word's browser checks fail, and none of them is this branch's — 2026-09-02

Found while running the browser suites for a change in `office-ui`, and **proved not to be it**: the
two that looked most suspicious were re-run with `packages/office-ui` stashed and failed exactly the
same way. Five are pagination — lines drawn outside the printable area of a sheet the moment the sample
opens, a page that does not start at the top of its own sheet, a table longer than a page, and two
boundaries that land on a wrapped picture — and the sixth is `moving between slots › makes a place for
the caret in an empty slot` in the maths tests.

They fail in isolation as well as in the suite, so this is not the load-sensitivity already recorded
against the Enter sweep further down. Recorded rather than fixed here because this branch is the site
builder's, and a pagination fault deserves its own measurement rather than being tidied on the way
past.

### An extension called `dragDrop` that listens for no drop — 2026-09-02 *(fixed)*

Asked in three words — *드래그 드롭도 돼?* — and measured by dropping a real file on the boards:
nothing happened. `ReorderExtension` registers one command, `moveBlockToPosition`, about reordering
blocks in a stack. It listens for no `drop`, reads no `dataTransfer`, and has never had anything to do
with a file. The name is the whole of the misunderstanding.

So a file dropped on the editor was the browser navigating away from it — the default a page gets when
nobody cancels `dragover`.

The canvas takes one now, and where it lands is what it was dropped **on**: a picture takes the file,
anything else gets a new picture after it. Both go through the panel's own `addPicture`, so a dropped
file is read, sized, named and put in the assets box exactly the way a chosen one is.

**Still open**, and worth naming while it is fresh: a drop is only pictures. A `.csv` onto a
collection, a font, an SVG meant as a sticker rather than as a block — each is a different errand and
none is wired. And the extension keeps its misleading name.


### A decision that only prose was keeping — 2026-09-02 *(fixed)*

`emoji` and `mathInline` are declared in `standard-schema`, have an extension each
(`extensions/emoji.ts`, `extensions/math-inline.ts`) and are handled by the PDF exporter — and no
office schema inherits either, so no product can hold one and nothing draws one.

Asked as *why is there a schema for this if nothing uses it*, and the answer turned out to be that
**it was deliberate**: office takes what it offers from the standard schema by name, and the prose
above that list has named all twenty-three exclusions since the day they were made, with reasons.
Word draws equations from OMML, its page numbers are furniture the layout paints, its contents page
is computed from headings — a second way to say one thing is a second thing to keep working.

The fault was that prose was the only place it was said. A name in **neither** list disappeared in
silence, and no check here could see it: every check asks about the nodes a product *declares*, so a
node no product declares is a node nothing asks about — a fourth kind of blind spot next to the three
`operation-harness` names.

Fixed by making the exclusions data with a reason each, and refusing to build a schema when a
standard node is in neither list. Adding one to the standard schema now forces the question *does
office offer this?* at the moment somebody can answer it.

**One of the twenty-three is a decision rather than a difference**, and it is written apart for that
reason: `emoji` is out because nothing offered a picker, not because anything could not hold one. See
`docs/specs/inline-content.md`.


### The type check had been passing because the grep was wrong — 2026-08-31 *(fixed)*

`npx tsc --noEmit` run **from inside a package** prints `src/renderers.ts(...)`;
run from the repository root it prints `packages/office-site/src/...`. The check
was being filtered with `grep "office-site/src"` from inside the package, which
matched nothing — so every run reported clean and eight real errors accumulated
behind it.

What was hiding there, and it is the interesting part: **`ask()` became an
accordion row and four other call sites went with it.** The FAQ helper used to be
"a heading and a sentence" and was used twice — once for the questions and once
for four feature blurbs on the pricing page. Turning it into a row that opens
turned those four into accordions with no answers, and *the tests kept passing*:
`vitest` transpiles without type checking, so the only thing that could have said
so was the check that was being grepped away.

Fixed both: the four are `blurb()` now, and the pattern for reading `tsc` output
is `grep "^src/"` from inside a package.

### A form asks what a browser already knows how to ask — 2026-08-31 *(built)*

**A**, from `docs/specs/site-forms.md`. `choice` (every lead form has a 문의
유형), `checkbox` (**required in Korea** — consent has to be given rather than
assumed), `number`, `date`, and `min`/`max`/`maxLength`. All of it is the
browser's own validation: it runs with scripts off, in the visitor's language,
and it is what makes insisting on a real `<form>` worth the trouble.

- **A tick's label goes after its box and wraps it.** Every other field is a
  question with a box under it; a tick is a statement with a box in front. And it
  is the one field whose label a visitor *clicks* — a 14-pixel target becomes the
  whole sentence.
- **A `choice` gets an empty first option.** Without it a browser reports the
  first entry as the answer and every message arrives saying whatever happened to
  be at the top — a `required` list that is never actually unanswered.
- **The consent line needed nothing new.** A field's `label` is a string and
  cannot hold the policy link; a form holds **blocks**, so the link is an ordinary
  paragraph above the box. A rich label would be a second text model in an
  attribute.
- **`pattern` is refused.** A regular expression is a language a reader has to
  learn and cannot debug — the same call this schema made when a list's filter
  became `where` + `equals`.

### A visitor comes back to the site they were on — 2026-08-31 *(built)*

**B**. The worst thing about a form as it stood: pressing 보내기 took the visitor
to the **service's** page, and the site's design, header and footer were replaced
by a stranger's.

Every service solves it with a hidden field and every one spells it differently —
`_next`, `_redirect`, `_returnUrl` — which is exactly what a connection is for:
it is a fact about the service, so a site with five forms says it once.
`service.returnField` + `form.thanks` (a `page:id`, the fifth use of that shape),
and `service.trapField` for spam, which ships **empty** because a bot filling
every input is the whole mechanism.

Absolute or nothing: a service redirecting a browser has no page to resolve a
relative address against, so a site that has not said where it lives publishes no
return rather than one that sends somebody nowhere — the rule `og:url` already
follows.

Still zero script on the page.

### A picture keeps its shape, and comes at the size it is needed — 2026-08-31 *(built)*

The two things the asset work made possible, and neither was reachable before it
because both need the file itself.

**`aspect`** — the shape a picture keeps at every width. `minHeight` answered a
divider and a banner and cannot answer this: a picture in a column is 1200 wide
on a laptop and 350 on a phone, and what a designer means by "this is a banner"
is a ratio. Stating a height instead is how a hero ends up letterboxed at one
width and cropped at the other. Six named shapes rather than a free `w/h` field,
which every builder that offers one fills with `1.7778`.

`height: auto` goes with it, and it is the half everyone forgets: an `<img>`
carrying a `height` **attribute** is sized from it, so a ratio without releasing
the height is a box the browser ignores.

**`srcset`** — the single largest cost of a page built with a tool like this is a
photograph taken at 4000 pixels sent, whole, to a phone that is 390 wide. It is
most of what such a page weighs and no CSS shortens the download. The renditions
are made when the file arrives (640 / 1280 / 1920, in a canvas, which is the
app's for the same reason reading the file is), each is published as its own
file, and **which one to fetch is the browser's decision** — it knows the screen
and the connection and this product does not.

Three things it settled:

- **A rendition must be meaningfully smaller.** A 2000-wide file was producing a
  1920 rendition: four per cent narrower, another file, another `srcset` entry,
  a download nobody notices. Found in a browser on the first picture tried. The
  line is four fifths.
- **An SVG is left alone** — already every size at once, and a canvas would turn
  a few kilobytes of vector into a large picture of it.
- **The format is kept.** Re-encoding a PNG as JPEG is smaller and is also this
  product deciding, silently, that a reader's transparent background is gone.

**`defer`** is beside them and is the reader's rather than a rule: `lazy` on a
picture above the fold delays the one image a visitor is waiting for, and nothing
but the design knows which picture that is.

### A page's address was a free string, and two pages could share one — 2026-08-31 *(fixed)*

Asked whether to add a slug feature and prefer English URLs. Measured first, and
the valuable half turned out not to be the language: **`path` had no validation
at all.**

| typed | what a browser does |
|---|---|
| `My Page` | no leading slash — a **relative** link; from `/가격` it means `/가격/My%20Page` |
| `/제품?a=1` | `?` starts a query; that file can never be requested |
| `/제품#어디` | `#` is never sent to a server |
| `//x` | protocol-relative — a link to the host `x`, off the site |
| `/A/` | a trailing slash is a second address for one page |
| `/소개` twice | one page unreachable, every link lands on the other. **Zero faults** |

`pathFor` repairs on the way in — the one place this product changes what a
reader typed without asking, and the right one: every tool of this kind repairs a
slug as you type, the result is visible immediately, and the alternative is an
address the panel accepts and the site cannot serve. `pathFaults` reports the
duplicate, which is the one nothing could see.

**A name gives a page its address once** — while it is still the minted
`/page-3`, and never again, because an address is what has been shared and
indexed and a rename must not move a page.

**Hangul is not romanised.** `제품` stays `제품`, never `jepum`: romanisation
reads as neither language, and two people transliterate the same word
differently. A reader who wants an English address types one — theirs to decide,
which is what this schema already says about a component's name and a dataset's.
ASCII is lowercased, because a case-sensitive host makes `/Products` and
`/products` two pages and a case-insensitive one makes them one.

### `제품` and `제품` are the same word and different strings — 2026-08-31 *(fixed)*

Asked whether a Korean URL is all right. It is — every browser and static host
has served UTF-8 paths for a decade — with one hazard that nothing warns about
and that this product was standing in.

A Hangul syllable has two correct Unicode spellings: composed (NFC, 6 bytes for
`제품`) and decomposed (NFD, 9). They render identically and compare unequal. A
keyboard produces NFC and a browser requests NFC; **a macOS file picker has
handed over NFD for twenty years**, and an asset is named after the file that
arrived.

Two faults, both invisible:

- two pictures both showing `로고` are two different names, so the duplicate
  check passes and one of them is permanently unreachable — the exact thing that
  check exists to prevent;
- a page address that arrived decomposed publishes a folder no browser ever asks
  for: a 404 that looks right in the address bar *and* in the folder.

`names.ts` composes on the way in and compares composed on the way out. The test
for it fails with the finding written out: *expected '로고' to be '로고'*.

Measured while checking: modern macOS `ditto` preserves NFC — APFS does not force
decomposition the way HFS+ did — so the archive round-trips cleanly. The hazard
is the file picker, not the zip.

### Every link in a published site was broken — 2026-08-31 *(fixed)*

Found by asking what the asset work had made necessary. A link resolves to a
page's **address** — `/제품` — and publishing wrote **`제품.html`**. On any host
that does not quietly try `.html` for you, every link on every published page is
a 404.

It looked completely fine in the editor, and that is the interesting part: the
editor follows the *reference* (`page:products` → the page), never the file. The
mismatch is structurally invisible from inside the product, which is why nothing
had caught it in the weeks the export has existed.

`fileFor` is the model's now — `/` → `index.html`, `/제품` → `제품/index.html`.
The mapping from an address to a file is a fact about how a site is *served*,
not about how a browser saves a download. The sitemap had been naming its own
file since the day it existed, by accident, for the same reason.

Held by asking the published home page for every `href` that starts with `/` and
checking each one is a page the publish actually wrote.

### Publishing is one archive, because a site is a folder — 2026-08-31 *(built)*

Loose downloads were the shape until two things ended it on the same day: an
asset is written to `assets/로고.png`, and a browser cannot be handed a folder;
and `제품/index.html` above is a tree.

`zipOf` is in `office-site` rather than the app, and the line moved deliberately:
`publish` still says what a site *is* and the app still says what a file is —
turning a list of files into one array of bytes is arithmetic with no browser in
it, and belongs where it can be tested by asking what the bytes are.

- **Stored, not deflated.** A site's bytes are mostly pictures, which are already
  compressed; the HTML is tens of kilobytes that compress again on the wire. The
  alternative is a few hundred lines of bit-packing whose bugs are silent.
- **UTF-8 names with the flag bit set.** A zip's default name encoding is a code
  page from 1989; without bit 11 a Korean folder name is mojibake on somebody
  else's machine.
- **A fixed timestamp**, so two publishes of an unchanged document are two
  identical files. The same argument `formatDateField` makes about a renderer
  that reads the clock.

**And a finding about the test, not the code**: macOS's Info-ZIP `unzip` refuses
to *create* a UTF-8 directory name — `Illegal byte sequence` — whatever the
locale. The archive is correct: Python's `zipfile` lists the names and validates
every CRC, `ditto` extracts them, the Finder opens it. The first version of this
test failed and the bug was in the reader. The suite uses `ditto`.

### A reader could not put a picture in a page — 2026-08-31 *(built)*

Measured while asking whether the form work was the right next thing, and it was
not: a `picture` carried a `src` string and **nothing anywhere could put a file
in one.** The sample got away with it by drawing its art as SVG data URIs — a
thing a product's author can do and a reader cannot. Adding a photograph was not
possible at all, which is the second most common thing anybody does on a page
after writing on it.

`asset` is a resource with a name, a type and base64 bytes; a picture names one
as `asset:로고`. The sixth reference of the shape this schema uses everywhere.

The half worth writing down is that **one `src` has two right answers**:

- a **board** draws the bytes, because there is no server to ask;
- a **published page** points at `assets/로고.png`, because inlining a logo used
  on five pages writes its bytes five times, and a photograph in the middle of
  the HTML delays the first paint by exactly as long as it takes to download — a
  browser cannot start drawing a page it has not finished reading.

That is the second deliberate difference between the two drawings after a form's
`action`, and it uses the same one flag.

Four things it turned up:

- **`Published.files` could only carry words.** `{ file, text, type }` was enough
  until a site had a photograph in it. A PNG written through the text path is
  base64 in a file called `.png`, with a charset on it — a file no viewer opens,
  failing as a broken image rather than as a bad write. `bytes` is a separate
  field, not a union, because a caller that has to guess which it got will guess
  wrong on the file that matters.
- **The file's own width and height are stored.** An `<img>` with no intrinsic
  size is a hole of zero height until it loads, so every word under it jumps down
  when it arrives. A builder that keeps only a URL cannot fix that because it has
  never seen the file; this one has.
- **A name is deduped, never overwritten.** Two files called 로고 is one of them
  unreachable. Overwriting is the more helpful-looking answer and the wrong one.
- **The size is reported, not refused.** Base64 is a third larger than the file.
  `assetFaults` says so past 8MB, against the document itself — there is no block
  to click on for "this is 12MB".

**Still open, and connected**: publishing is still a browser download of loose
files, so a folder with `assets/` in it cannot actually be produced — a zip is
the missing half. Also open: a picture that must keep an aspect ratio, and
responsive images (`srcset`), which is what the stored size makes possible.

### Where a form's answers go — a connection with a name on it — 2026-08-31 *(built)*

The question was framed three ways and only one of them is possible: **a
published page is a static file.** It cannot write into the `.baro` document, so
`resources` cannot be a destination and neither can a "answers as rows" store —
both need something running. What already existed was the third: a real
`<form action method="post">` posting straight to a service the reader chose,
with nothing of ours in between.

So the open question was never *where*. It was **how much the product helps you
connect one**, and the answer the address-on-the-form shape got wrong: a site
with five forms carried five copies of one address. Changing services meant
finding all five, and the one that was missed goes on posting to an endpoint
nobody reads — silently, because a form that posts somewhere wrong looks exactly
like one that works.

`service` is a resource with a name, an endpoint and a method; `form.sends`
names one. The fourth reference of the shape this schema uses everywhere —
`var:이름`, `componentId`, a dataset's `name` — and the same argument won it.

Decisions worth the record:

- **No default address and none of this product's own.** A builder that quietly
  posted a stranger's message to its own server would be doing something nobody
  asked for with somebody else's data. A new form arrives with a connection and
  the connection arrives **empty**, reported by `documentFaults`.
- **Two nodes, one transaction, one undo.** `insertForm` mints the connection
  only when the document has none; otherwise it points at the one that is there.
- **A connection with no address publishes no `action` at all** — not `action=""`,
  which a browser resolves to *this page*, so 보내기 would reload and look for all
  the world like the message went somewhere.
- **The count is on the row.** Editing the address from one form's panel changes
  every form that names it, so the row says 폼 2개가 함께 씁니다. A named
  reference is worth having *because* one edit reaches every use, which is
  exactly why a reader has to be told before making one.
- **Three faults, told apart**: nothing chosen (a reader who has not finished), a
  name pointing at nothing (somebody removed the connection out from under a
  form that still names it), and a connection with no address.

**A first-party inbox is still open** and is a product decision rather than a
schema one: it needs a server, storage, spam handling and a retention policy.
The schema is ready for it — `sends: 'barocss'` is a connection like any other.

### The panel has two kinds of picker, and the control sweep reaches one — 2026-08-31 *(fixed)*

`PropertyChoice` is a native `<select>`; `ChoiceSelect` is a Radix listbox with a
`<button>` trigger. Nine custom rows used the second, so they looked different
from the rows above them in the same column **and** were outside the sweep that
presses every control and checks the document moved.

One picker now — the sheet's. Which turned the sweep on nine rows it had never
reached, and then turned up two things about the *sweep* rather than the panel:

- **It swept one selection.** A stack. Every row that belongs to a picture, a
  form, a field or a list — the ones added most recently and therefore least
  looked at — was never pressed. It sweeps five node types and both panes now.
- **It compared one node.** Two rows deliberately write somewhere else: a form's
  주소 and 방식 write the *connection* it names, which is the whole reason a
  connection has a name. Against one node they read as controls that do nothing.
  It compares the whole document now.
- **It wrote the value already there.** 37 into 투명도, whose bounds are 0 and 1,
  clamps to 1 — which is what it already said. A sweep that writes the value
  already present is measuring itself.

**And one thing I got wrong on the way, kept here because the shape of the
mistake is the useful part**: a field's 보낼 이름 looked as though it collided
with the generic 이름 row, and I added a narrowing to exclude it. It did not
collide — `field` is not in `SELECTABLE`, so that row was never offered for one.
The narrowing was reverted. What stayed is a **model-level check** that no two
rows write one attribute for one node type, which is a guard with nothing to
catch today and is worth having because the browser sweep structurally cannot see
that fault: it asks *did this control write something*, and the second row does
write something — over the first.


### The sample's pricing page had been sorting wrong, in a browser, since it was written — 2026-08-31 *(fixed)*

A card's question was answered with a string and drawn exactly as stored, so
the only way to make a price read as `월 9,900원` was to **store those words**.

Which is a value nothing can compare. `요금제` says
`sortBy: '가격', sortDir: 'desc', limit: 3`, so it was comparing
`'월 9,900원'` against `'월 19,900원'` as text — `9` comes after `1` — and the
page showed **문서 · 사이트 · 스위트** where it claims to show the three most
expensive plans in order. It looked completely fine. Nothing but asking the
document what order it was in could have found it.

The blog had the quiet version of the same fault: the feed sorts by an ISO date,
correctly, and then showed the reader `2026-08-02`.

**The data stores the value; the card says how it reads.** `componentVar` gains
`kind: 'date'` and a `format` picture string (`'월 #,##0원'`, `'yyyy년 M월 d일'`),
read by `readValue`. Two panel rows — 값 종류 and 표시 형식 — on the part a
variable is bound to.

Three things it turned up on the way:

- **Order matters and got it wrong first.** A data list replaces a placement's
  answers *after* they are resolved, so formatting inside `instanceValues` reached
  every card except the ones with data in them — which are exactly the cards a
  format is for. `readValues` runs last, and is idempotent so that running last is
  survivable.
- **The preview needs it too.** A designer editing the post card against a row
  must see what the page will show, or the preview is showing them something else.
- **A card's default was the empty string**, so opening the post card showed a
  blank where the date goes. A default is what a card draws when nobody has
  answered; blank reads as broken.

`format` is on the **card**, not the data — which is the point of it: one dataset
can feed a price list that says `9,900원` and a summary that says `9.9천`.

### A narrower width could change a value and could not un-say one — 2026-08-31 *(fixed)*

`attrsAt` merged the base and then the override, so `{ mobile: { maxWidth: … } }`
could say *this much instead* and had no way to say *none at all here*. The
workaround is a number chosen to mean nothing — and **the sample was already
writing it, in three places**: `minWidth: 0`.

Found by drawing the sample's contact form rather than by reading the file. It
wants to be 340 wide beside the words and the whole column under them, and the
second half was unsayable.

`null` in an override now un-says the key. Which forced the second half of it:
**`null` and `undefined` are different sentences**, and the panel had one gesture
for both.

- *nothing at this width* — an emptied field while a narrower width is being
  edited. Writes `null`.
- *the same as the page* — **the mark beside the label**, which is a button now.
  Writes `undefined`, which `withOverride` and `withState` already understood.

The mark had been a `·` saying *this width owns this value* with no way to stop
it owning one. Typing the page's number back in looks identical and is a
different document: the width still states a value, it now happens to match, and
it stops following the day the page's changes. `onUnmark` is in `office-ui`, so
the deck and Word get it the day either grows something to take back.

One thing the fix found on the way: the button was named from `row.label` and was
unfindable — two rows in different panes can each be called 최대, which is
exactly why a row carries `ariaLabel` as well.

### Seven things a site builder needed, measured and closed — 2026-08-31 *(built)*

Asked "is the site builder done", re-measured, and found the answer was no in
seven specific ways. All seven are built; `docs/specs/site-builder.md` has the
reasoning. The findings worth keeping here are the ones that were surprises:

- **A schema gap shows up as artwork.** The product's own hamburger had to be an
  SVG because a box with nothing in it was a box of no height. `minHeight` made
  it three boxes and deleted a function from `sample-art.ts`.
- **`position: sticky` inside a component silently cannot work.** A block in a
  definition has the placement's box as its parent, and that box is exactly that
  block's height — 82 pixels, measured. `display: contents` on the wrapper fixes
  it and breaks selection: an element with no box cannot be pressed or measured,
  and thirteen browser tests said so at once. A position belongs on the
  **placement**, which is also where it belongs conceptually.
- **A form is the one place the board may differ from the page**, rather than the
  page being the board minus removals. A designer arranging a form must not be
  able to send a stranger a message. One flag, `SiteEnv.published`, read in one
  place.
- **A `url` dataset is fetched in the editor, not in the page.** The other way
  ships a script everywhere, hands a crawler an empty list, and shows a visitor
  whose request failed an empty section. The cost is stated on the button.
- **The one line of script.** Closing a menu when a visitor taps a same-page
  anchor has no CSS answer — three were tried on paper and all three fail. So
  the product ships one listener, only on a page that has both an opener and a
  `#` link. The sample still exports with no `<script>`.

### `visible: false` meant a draft and a closed menu, and both were deleted — 2026-08-31 *(fixed)*

A hidden block is cut from the published page, on purpose: a section a reader hid
is a section they did not mean to publish, and `display: none` still ships the
words to a crawler.

Two designs write the same attribute and mean the opposite:

- a block shown **only on a phone** — a hamburger is `visible: false` with
  `{ mobile: { visible: true } }`, which is how a page has two navigations;
- a block a visitor **opens**.

Both were being removed. Measured in the exported sample: the hamburger was gone
from the markup, its `<label>` published empty, and the menu's media query and
state rule stayed in the stylesheet naming an element that was not there.

`neverShown` is the question that was meant — hidden at *every* width and in
every state — and it is now asked in the three places that have to agree: the
markup (`clean`), the media and state rules (`styledNodes`), and the scroll
reveals. **The width half of this predates states**: a block shown only at 390
had been losing its rules for as long as media queries have existed here, and
nothing noticed because the sample had no such block until now.

### The third state: a visitor opens a menu, and the page ships no script — 2026-08-31 *(built)*

`hover` and `focus` are states a visitor happens into. 열림 is the one they
decide, and it is what stands between "this model can express two navigations"
and "the phone menu works". Details in `docs/specs/site-builder.md`; the four
decisions in short:

- **remembered, not held, so it may move things** — `OPENABLE` = `STATEABLE` +
  `visible`, `layoutMode`, `gap`; `stateableIn(state)` is now asked by the
  schema check, the command and the panel, which had a copy of one list each;
- **published as a checkbox** — `openSwitches` writes an `<input>` and a
  `<label for>`, the rule is `.st-open-switch:checked + [data-b="…"]`, and the
  exported page still contains no `<script>`;
- **the switch sits outside the block it opens** — inside, it is inside that
  block's `display: none`, and an unrendered control is not in the focus order:
  열림 would have been pointer-only. `openerRules` puts the ring on the block
  being looked at, named per switch;
- **`opens` holds a `partId`** — a sid is given out at load, so nothing written
  down can hold one. `setOpens` mints the name, which is why the row has its own
  command: it writes two blocks.

Held in `states.test.ts` (arithmetic, rules, markup) and in `site.spec.ts` at
390 with nothing but the file — pressed by pointer and by keyboard.

### 아코디언과 탭 are one mechanism and one attribute apart — 2026-08-31 *(built)*

An accordion's answer and a tab's panel are the identical node. What separates
them is `opensOne` on the container: the switches under it become **radios
sharing a name**, so choosing the second tab unchecks the first and every other
panel falls back to `visible: false`. Nothing keeps them in step because a radio
group already does. Plus `openAtRest` on an opener, which a tab strip needs
exactly one of.

Both are inserts (추가 › 아코디언, 탭). The knowledge they carry is that the body
must be a **sibling** of the header, that it needs a `partId`, and that the name
must be unused — the last of which is a *silent* fault: two accordions both
calling their body 내용 means the second header opens the first body, in the
published page only. `freshPartId` mints against the page and against the names
the same insert is about to make.

One rule could not be written as `switch:checked + block`: **which tab is
chosen**. The tab is not beside its switch, so an opener's `states.open` is
published as `body:has(#id:checked) [for="id"] > *`. A block's `states.open` now
has one meaning in two shapes — what it becomes if it is opened, what it looks
like having opened something if it opens.

Held in `states.test.ts` and in the browser: two tabs pressed at 1280 and a
third at 390 (a radio genuinely closing the other), and an accordion with two
answers open at once (a checkbox genuinely not).

**Still open in the same mechanism**: a menu that closes when a link inside it
is followed needs `:target` or one line of script, and has not been decided. A
`opensOne` accordion cannot be fully closed, because a radio cannot be
unpressed — correct for tabs, and an author choosing 하나만 should probably be
told.

### A hamburger cannot be three boxes, because a page cannot say how tall a block is — 2026-08-31 *(fixed)*

The site schema has `sizing`, `minWidth` and `maxWidth` and **no height at
all**. Every other builder's hamburger is three empty divs of a fixed height;
here the honest way to draw a 2px rule was to draw it, so `sample-art.ts` has
one as an SVG.

That is fine for a mark and wrong as a general answer: a divider, a spacer, a
banner of a fixed height and a card with a picture at a set aspect are all the
same missing pair. Once `minHeight`/`maxHeight` exist the hamburger can be three
boxes and the lines can *move* when it opens, which is the animation everyone
expects and this cannot currently express.

### Every border in the product was an invalid CSS declaration — 2026-08-30 *(fixed)*

Word writes a colour as six hex digits and no `#` — `2C5282`. Every other colour
in `css.ts` went through `normalizeColor`, which puts the `#` back. **The borders
did not.** `1pt solid 2C5282` is an invalid shorthand and a browser drops the
*entire* declaration, so a bordered paragraph got no line at all — not a black
one, none — and so did every table drawing its rules from a style. The sample's
own `GridTable` states its inside borders exactly that way.

The unit test for it **asserted the broken string**: `expect(css.borderTop).toBe(
'1pt solid 000000')`. The same shape as the deck's sample writing `listType` to
match a renderer rather than the schema — a test that agrees with the bug.

Found the first time a bordered paragraph was put in the sample document and the
*computed* width came back `0px`. A unit test compares the string the function
returns; only a browser knows whether a browser accepts it.

### Word's fifth border, and a schema that described a document this model cannot hold — 2026-08-30 *(fixed)*

Two piles off the unread list, and they wanted opposite answers.

**`borderBetween` — write the drawing.** A run of consecutive paragraphs asking
for the same borders is one bordered *box* in Word: the top above the first, the
bottom below the last, and a single rule between each pair. Drawn as each
paragraph's own edges it is two solid lines between every pair with the margin
showing through. `sharedBorders` answers it beside `suppressedSpacing`, for the
same reason that one is there — it is a question about the block's **neighbours**,
and the paginator has to reach the same answer. 12 findings.

**A cell's `borderInsideH` / `borderInsideV` — take the declaration away.** An
inside border is a line *between* cells, and a cell has no interior in this
model: merging leaves the surviving cell carrying a span and the cells it
swallowed are gone. So there was nothing for it to draw, ever, and `cellBorders`
correctly reads the pair off the **table**. OOXML has `tcBorders/insideH`, which
is why it was copied, and it means something there only for a merged region with
the covered cells still present. Eight attributes on two node types describing a
document this model cannot hold. 16 findings.

**And 12 more that were read all along**: a table's `borderInside*` and
`cellMargin*` are applied when a **cell** is drawn (`cellBorders`, `cellMargins`),
and rendering a bare `bTable` draws no cells. Exemptions, like the header ids.

**The sample document had no bordered paragraph at all**, which is why no test
could have seen the doubled line — or the invalid colour. It has a three-paragraph
box now, and `word-rendering.spec.ts` measures the *computed* border of each.

### Two locks, and a fraction that was never linear — 2026-08-30 *(fixed)*

**`lockDelete`.** Word's content control has two locks and keeps them apart on
purpose: a form's instructions may be read and not edited *and* not thrown away,
while a field a reader fills in is the first without the second. `lockContent`
got its guard on the typing path; without this one a reader could not type in a
protected region and could **delete the whole of it**. `insideLockedRegion` moved
to `editor-core` and takes which lock to ask about — both layers need it and
neither can reach the other: the typing gates are in `editor-view-dom` and the
delete command is in `extensions`.

**A linear fraction has never been drawn as one.** `style.css` has had
`.w-math-frac[data-type='lin']` rules since it was written — the solidus, the
missing bar — and **no renderer ever emitted `data-type`**. Two rules matching an
attribute nothing wrote. Found while giving the fraction its other three values:
`skw` sets the slots on a diagonal and `noBar` stacks them with no rule, which is
how a binomial coefficient is written, and the style function looked only at
`lin` — the one value whose CSS could not match anyway.

The same shape as the deck's `listType` and Word's `borderTopColor`: a name
written on one side of a seam and not the other, with nothing in between to
notice. Three of those in one session is the argument for a check that reads
`data-*` out of a renderer and out of a stylesheet and compares them.

And two more of the maths pile: a **radical**'s `hideDegree` (a square root is
`√` and a cube root `³√`, and the two were the same drawing) and a **group
character**'s `verticalAlign` — where the *label* sits, which is not where the
brace does. One was read and the other was not, so the label always followed the
brace.

**185 → 16.**

### Three faults in one command, found by its first test — 2026-08-30 *(fixed)*

`toggleLink` and `removeLink` are two commands and one gesture, and they had no
test of their own. The conformance probe asked whether each moves the document
and got yes, which is true of both and says nothing about what a reader ends up
with. Writing that test found three:

1. **A new address took the link off.** `toggleLink` asked *"do these words carry
   a link at all"* and, if so, removed it — the `href` in the payload was read
   only on the branch that adds one. So pressing 링크 on linked words with a
   different address was silently a removal. It asks whether they point at *this*
   address now: a toggle takes off what it would have put on, and a link is a
   **value**, so the same gesture with a different value is a change.
2. **Then two links stacked.** `applyMark` appends, so laying a second address
   over the first left both marks on the run — two links over the same
   characters, and which one a reader followed depended on which the drawing
   read first. Off, then on.
3. **`removeLink` laid `href: ''` on the words.** It took a link off by toggling
   an *empty* address, which worked only while the first fault existed. It calls
   `removeMark` now, which is what its name says — saying it through a toggle was
   borrowing a gesture to do the opposite of what the gesture means.

`find-replace` got its first test the same afternoon and had **none** — eight
assertions about what a reader gets, all green.

### Can the extensions be used properly in all three products — 2026-08-30 *(measured)*

Asked directly, so measured rather than claimed. For each product: take the
extension commands it *installs*, take the node types the probe watched each one
produce, and ask whether that product's registry can draw them.

| | inserts installed whose node the product cannot draw |
|---|---:|
| the deck | **0** |
| the site | **0** |
| Word | 3, and all three are honest |

Word's three are `fieldPageNumber`, `fieldPageCount` and `footnoteDef`, and none
is in the node registry because none is drawn *in the flow*: the first two are
drawn by `page-furniture.ts` inside a header or footer, and a footnote's body by
`footnoteAreaTemplate` at the foot of the page its reference is on. A registry
entry for any of them would put a second copy in the text.

So: **yes.** Every insert each product installs makes something that product can
draw, and Word's kit is why — it lists its extensions one at a time rather than
taking `createRichExtensions()`, which registers inserts for ten node types Word
has no renderer for.

### Word's `produces` list was believed by two checks and compared to nothing — 2026-08-30 *(fixed)*

`conformance.test.ts` carries 23 hand-written pairs of a command and the node it
makes. Two checks read that list — is the type in the schema, is every `insert…`
on the list at all — and **neither asks whether it is true.** A hand-kept list
that nothing compares to the document is the hand-kept list this whole harness
replaced.

The probe already knew: `made` is what it watched appear, counted before and
after, with the payloads Word's own test gives each command. Comparing them costs
nothing.

It found one disagreement and the disagreement was the **check's** limit, not the
product's: `insertParagraph` is declared `paragraph` and was watched making a
`heading`. Both are right — Enter in the middle of a heading splits the heading,
Enter at the end of one starts a paragraph — and the probe stops at the first
state a command can run in, which is the sample's first heading. Reporting it
would have been reporting where the fixture's first block is, so it is out of the
comparison with the reason written down.

### When is `packages/extensions` finished — 2026-08-30

Asked directly, so answered with the measurements rather than a feeling. What the
harness can ask of a model package, and where each stands:

| | |
|---|---|
| moves the document when it says it can | **0** left, and the list is named |
| gives it back when undone | 0 |
| does it again when redone | 0 |
| leaves a valid tree | 0 |
| leaves the selection pointing at nodes that exist | 0 |
| a toggle is its own inverse | 0 |
| an `insert…` puts a node in | 0 |
| lights up over a held box and declines | **0**, an equality rather than a ceiling |
| every extension is in a kit | 0 outside one, one chosen by a product |
| the model layer draws nothing | 0 files build DOM, 0 `canExecute: () => true` |
| makes a node the schema has | 0 |
| every `insert…` is accounted for | 0, four exempted out loud |
| commands the probe cannot ask about | **2**, and permanently |

The two are `indentNode` and `outdentNode`. Measured today rather than assumed:
mark `paragraph` as `indentable` in a scratch schema and both **work** — a
paragraph moves inside the quotation before it and the tree validates. No schema
here sets it, which `types.ts` already explains: Word nests a list by giving a
paragraph a numbering *level*, not by putting one node inside another. A capability
no product wants, kept for the outliner that would.

**So the checks are answered.** What is not finished is what a check cannot see,
and today gave the example: 글머리 목록 pressed inside a *numbered* list did
nothing at all. The probe asks whether a command moves the document and takes the
first state it can run in — a caret in an ordinary paragraph, where wrapping is
right. `listAround`'s own comment named this case as the reason it exists, and
the code then called `wrapInList`, which wraps the block the caret is in; there
was already a list around it, so there was nothing to wrap.

Found by writing the three block toggles their first test by hand. Which is the
answer to *when is it finished*: **the checks are, and the hand-written tests are
not.**

Measured properly rather than by filename: **seven** extension classes were named
in no test but the generic sweeps — `Blockquote`, `FindReplace`, `Image`, `Link`,
`List`, `SelectAll`, `Text`. All seven have one now, and between them they held
**four faults the probe could not see**: a link taken off when a reader gave it a
new address, two links stacked on one word, a 링크 제거 that laid `href: ''` on
the text, and a numbered list that could not be made a bullet list. The other
three — `image`, `text`, `select-all` — came back clean in eighteen assertions.

**And the sweep is a check now**, so it is not measured by hand again:
`every-extension-is-in-a-kit.test.ts` asks whether each of the 50 classes is
*named* in a test that is about it, with the three generic sweeps excluded —
because they name every class by construction and counting them would make the
check say what it is there to disprove. Verified by renaming one and watching it
fail.

Two of the seven had to be *imported by name* to satisfy it, having been built
out of a kit. That is not bookkeeping: building them from `createBasicExtensions()`
is exactly how three of them had no test that mentioned them while their commands
were being exercised.

So the answer, today: **every check is answered and every extension has a test of
its own.** What is left is not a list of gaps but a rate — the last four faults
came out of the last two tests written, and the next ones will come from asking
what a reader gets rather than what the document does.

### `packages/extensions` ran one of the harness's thirteen checks — 2026-08-30 *(two more, and one taken out)*

Reasonable when the probe was written: the other twelve are about *drawing*, and
a model package does not draw. **Two of them are not.**
`every-command-makes-something-real` asks whether the node a command produces is
one the schema declares; `every-insert-is-accounted-for` asks whether every
command named `insert…` has said what it makes. Neither needs a renderer, and
this package registers **31 inserts** that nothing had asked either question of.

The `produces` list is **observed** — `answers.made`, counted before and after by
the probe — so it cannot go stale the way a written one can. Four commands are
exempted out loud (`insertMention`, the two note references, `insertText`): they
write a mark or a letter, and a command called `insert…` that makes no node is a
claim somebody has to make where a reader of the file can check it.

And one was written, passed, and **taken out again**: *"every node this package
can make is drawn by something a product would have."* It cannot fail. A node
type outside the schema is one the validator refuses, so the insert rolls back
and the probe records that the command made nothing; every node it does make is
in the standard schema, which is what `office-text` draws. Kept as a note in the
file rather than as a passing test, because this repository has been caught twice
by a check reporting an empty list for the wrong reason.

The question is real and belongs to the **products**, which ask it as
`every-node-is-drawn` against their own registries — and Word already answers it
by not taking `createRichExtensions()`, a bundle that registers inserts for ten
node types Word cannot draw.

### Word does not run `every-command-can-be-reached`, and has not declined it

The deck runs it and examines 97. Word runs neither it nor a `notYet` saying why.
Measured by hand: Word registers **167** commands and its four surfaces — ribbon,
menubar, key map, ruler — name **93** of them. Most of the 74 are the engine's
(`backspace`, `deleteForward`, `escape`, the selection extensions) and arrive
through `beforeinput` or the engine's own bindings rather than a product surface,
which is exactly the shape the check's exemptions are for. Turning it on is a
pass of its own: ~74 findings, each of which is either a surface Word is missing
or a reason nobody has written down.

### A check for `data-*` written on one side of a seam — 2026-08-30 *(built)*

Three faults this session were one name on two sides that did not match: the
deck's renderer wrote `listType` where the schema said `type`; `style.css` drew
`.w-math-frac[data-type='lin']` where **no renderer wrote `data-type`**; and the
site's `insertBulletList` wrote `kind` where the schema said `type`. Each cost
months and each is mechanical to find.

`deadSelectors` asks one direction only: **does anything a product draws with
write the names its stylesheets select on?** The other direction is noise — half
of this repository's `data-*` are for a test to find an element by or an event
handler to read, and a check reporting thirty of those beside one fault is a
check nobody reads.

Building it was four wrong answers, and each is in the code:

1. **The whole repository on both sides** did not catch the fraction:
   `data-type` is written by the *site's* list renderer, so Word's dead rule
   looked answered by a product Word shares no stylesheet with. The scope is a
   product's dependency graph now — **read from `package.json`**, because a
   hand-kept list of what a product draws with put `office-word` in Word's tree
   only, and `apps/slide` imports `installCellSelection` out of it.
2. **Only `data-x` literals** reported nine of the deck's names dead when eight
   were written as `data={{ presenting: 'true' }}` — `office-ui`'s convention.
3. **Every object key in the source** reported none of them, and would have
   missed `data-type`: `type:` appears in a thousand places.
4. **Comments and tests counted as writes.** Taking the fraction's fix back out
   left the check quiet twice — once on the sentence in the comment explaining
   that nothing wrote `data-type`, and once on two converter fixtures carrying
   whole pages of HTML.

Verified by taking the fix out and watching it fail, which is the only way to
know a check is one.

### The maths pile wanted code, not a decision — 2026-08-30 *(fixed)*

Twenty-five attributes, the largest thing on Word's unread list, and this
repository had described them twice as *"the maths model this schema follows,
drawn by nothing"* — with the note that they wanted a decision about maths before
they wanted code. **Reading the list turned them into twenty lines.**

Every one is a setting Word's own constructs carry, and every one is drawable:

- A **matrix** says how its columns line up and how far apart they sit
  (`m:mcJc`, `m:cGp`, `m:rSp`) and whether an empty cell shows its placeholder.
  The stylesheet drew a fixed `gap: 0.15em 0.5em` and a fixed centring.
- An **n-ary operator** says whether its limits are shown (`m:subHide`) — a sum
  with no lower limit is written `∑`, not `∑` with an empty box under it, and
  Word says so with a switch rather than by removing the slot so an author can
  put it back. It came out as an empty box.
- A **phantom** says which of its dimensions it gives up. All three were
  declared, none read, so every phantom took all of its room.
- A **border box** says whether a rule is drawn *through* it — which is how a
  cancelled factor is written. The four `hide*` were read and the two `strike*`
  were not: the half of a border box that is not a border.
- A **run** says which **alphabet** its letters are in. In maths these are
  meanings and not fonts: ℝ is the real numbers and R is a variable called R,
  and a reader must be able to tell them apart. Every one came out as an
  ordinary italic letter.

The number had been hiding the work rather than describing it, which is the same
finding this whole sweep keeps producing.

The stylesheet's half is the product's: which face carries a fraktur letter, how
a strike is painted. The renderer says only which one, which is the split the
list markers and the table of contents both arrived at.

**185 → 20.**

### A locked shape was not locked either — 2026-08-30 *(fixed)*

`locked` is on every scene node the office schema declares and it means one
thing: *I have decided where this goes.* The deck has read it since its arrange
commands were written — `box-commands.ts` skips locked boxes when it moves,
duplicates or deletes them, and the tidy pass treats one as a pin. **Word read it
nowhere**, so a shape a reader locked could still be dragged, nudged, resized,
aligned, spread and deleted.

One line, in `_movable`, because every one of those commands comes through it:
`resizeShapes` calls it, `deleteShapes` calls it with a distance of one, and the
align and spread commands read the same list. It **filters** rather than refusing
the set, so a drag holding a locked shape and a loose one moves the loose one —
which is what a reader pulling a marquee across a diagram means.

Distinct from `lockContent`, which is a region of *text* that may not be edited.
A locked shape's text is still text.

### The probe's filler was setting the one attribute that made the rest impossible — 2026-08-30 *(fixed)*

`attributeReadFrom` fills every *other* attribute before asking about one, so an
attribute that only matters in combination is still visible. It built that filler
from the schema's own values and **deliberately not** from what a product taught,
for a good reason recorded when a deck was taught what a `fills` is: an array
value is usually a whole sub-system that *supersedes* the flat attributes it
replaces, and teaching the harness one thing made it wrong about fourteen others.

That reasoning is about **arrays**. A string does not supersede anything — it is
usually the switch that turns the others on. A frame reads `alignItems`,
`justifyContent`, `gap` and `columns` only when `layoutMode` says `row`, `column`
or `grid`, and the schema's first option is `none`; a text box reads
`horizontalAlign` only for a `wrapType` that floats. In both cases the filler was
setting the one attribute that made the rest impossible to see.

A taught **array or object** still stays out of everybody else's question; a
taught **scalar** joins the filler. Six findings came off that were never faults.

### Values the probe could not guess, told by the product

Four more of the same class, all of them attributes a product plainly reads whose
values it cannot invent: `grid` (a table's column widths, which `gridOf` splits
on commas), `layout` (`fixed` or `auto`), `wrapType`, and a date field's picture
string — `formatDateField` honours a subset of Word's and falls back to the ISO
date for anything else, which is right and means an invented string draws exactly
what no string draws.

None of them belongs in the schema as `options`: a page and a deck take the CSS
property's whole vocabulary for `fit` and `layout`, and Word maps a subset. What
the values are is the **product's** to say, which is what the `probes` hook is
for.

**185 → 44.**

### A locked region was not locked — 2026-08-30 *(fixed)*

Word's content control is how a form or a template says *this part is yours to
fill in and that part is not*. The renderer read **one of its eight attributes**,
so a locked control could be typed over, one with a placeholder showed an empty
box, and one with a title was announced to a screen reader as an unlabelled
group. The sample document had no content control at all, which is why nothing
could have seen any of it.

The lock took three goes and each one is worth keeping:

1. `contenteditable="false"` on the element. It went on and **the text still
   went in.**
2. The keydown gate already refuses a caret the DOM puts inside one — and a
   browser will not put a caret inside `contenteditable="false"`, so it leaves
   the DOM selection *outside* while the model's still points *in*, and
   `beforeinput` writes at the model's. The second gate then let the key through
   because *either* selection naming somewhere is enough, which is a rule written
   for a real problem: the DOM selection is momentarily wrong while a render is
   in flight, and a character refused then is refused for good. So the model has
   to be able to answer the same question, which is `insideLockedRegion`.
3. It still went in, through `tryHandleInsertViaGetTargetRanges` — the path that
   writes the model straight from a `beforeinput`'s target range, and asked only
   whether the ends were inline text. **A lock that only holds against the
   keyboard is not a lock**: a paste, a replacement and an IME's committed text
   all arrive there.

`lockContent` is read as a convention rather than a node name — the engine does
not know what a content control is and must not. Deliberately not `locked`, which
the canvas nodes carry and means something else: a locked *shape* cannot be moved
or resized, and its text is still text.

`lockDelete` and `dataBinding` are still unread and stay in the count: one wants
a guard on the delete path and the other wants a custom XML part to resolve
against, and neither is a drawing.

### A frame could not be hidden, faded or turned — 2026-08-30 *(fixed)*

`visible`, `opacity` and `rotation` are on the shared geometry, so a rectangle,
an ellipse, a line, a path and a picture all honour them: `isVisible` and
`shapeTransform` are applied to each by name. A frame took neither, because it is
a `<div>` and both helpers answer in SVG — `display: none` happens to be the same
in both, and a `rotate(deg cx cy)` about a point in the canvas's coordinates is
not a CSS `transform` at all. So a reader could hide, fade or turn any box on the
canvas **except a frame**, which is the one they are most likely to want to turn.

And the first fix was wrong in a way worth recording: `display: none` was set
before the layout switch, and every branch of that switch writes its own
`display`. The unit test agreed, because it asked with no `layoutMode` — a frame
nobody arranges, which is not the frame a reader hides. **The fixture was not
wearing the thing the fault needed**, one more time.

### A frame's arrangement is read, and the probe cannot build the combination

`frameCss` reads `alignItems`, `justifyContent`, `gap` and `columns` inside its
`row`, `column` and `grid` branches and nowhere else, which is right: CSS
`align-items` on a box that is not a flex or grid container does nothing. The
probe fills every *other* attribute from the schema's own values and takes the
first — and `layoutMode`'s first option is `none`, the value that switches the
family off. Left as the schema's order rather than one arranged to suit the
probe: `none` is what a frame means when it says nothing, and documenting it
second to make a check happy would be the schema describing the tool.

### A content control has no author's surface

Word sets every one of a control's properties from Developer → Properties. This
product has nothing — the sample writes them and no reader can. A control a
*template author* sets up and a reader fills in is the shape of the feature, and
the author's half is the part that is missing.

### The canvas overlay has no handle for hiding, fading or turning

It drags and resizes a box. Hiding one, fading one and turning one are three
things the model now draws and no reader can ask for — on a frame or on any other
shape.

### A picture on a canvas had no name, and a contents page ignored how it was set — 2026-08-30 *(fixed)*

**`picture.alt`.** It has been in the schema for as long as `picture` has, and
`inline-image` — the same idea in the flow — has drawn it since it was written.
The canvas version drew nothing. So a picture a reader *dragged onto the page*
was invisible to a screen reader and one they *typed into a paragraph* was not:
one node, two drawings, one of them nameless. `aria-label` and `role` now, not
`alt`, because this is an SVG `<image>` and `alt` means nothing on one.

**`picture.fit` was reported unread and was not**, which is worth keeping. It
draws as `preserveAspectRatio`, but the schema does not declare which values it
takes — a page and a deck pass it straight through as CSS `object-fit` and take
everything that property takes. So the probe invented strings, all of them fell
to the same default, and a working attribute looked dead. Told through the
product's `probes` hook rather than narrowed in the schema, because the schema
is right and it was the probe that could not guess.

**A table of contents had three switches and read none of them.** `leader` — the
character filling the gap to the page number, Word's tab leader — lost to a
stylesheet that drew a dotted rule and called the leader *"a viewer concern"*.
That folded two decisions into one: **which** leader is the document's, and how
it is painted is the viewer's. `rightAlignPageNumbers` was always on.
`useHyperlinks` was always on, because the click handler matched every
`.w-toc-entry` there was.

### A text box read none of the seven things it says about itself — 2026-08-30 *(fixed)*

A `textBox` is Word's anchored box: a size, something to be anchored to, a way
the text around it behaves, an order in the stack. The renderer drew a plain
`<aside>`, so a box a reader gave a width and a wrap to came out **the width of
the column, in the flow, pushing everything below it down**.

The rules were already written and one node over. A floating box of text and a
floating picture do the same thing to the lines around them — that is what
`wrapType` means, and Word spells it the same way for both. What differed was the
vocabulary: a picture says `wrap` and `side`, a text box says `wrapType` and
`horizontalAlign`, and `inFront` against `front` is the one place the two
disagree on a value rather than a name. `textBoxCss` is that translation, plus
the one thing a text box says that a picture has no word for — `zOrder`, and only
where the box is out of the flow, because two floats in the flow are ordered by
where they are.

`anchorTo` and `verticalAlign` are deliberately not drawn: they say *what the
offsets are measured from* — the paragraph, the page, the margin — and answering
that needs the laid-out position of the anchor, which is the paginator's.

**185 → 70.**

### A page border nothing ever drew — 2026-08-30 *(fixed)*

`pageSetupAttrs` has carried the four edges and their `*Space` since the schema
was written. `pageCss` has known how to turn them into CSS for just as long.
**Nothing ever called `pageCss`** — it was exported from `index.ts` and reachable
from a console, and that was the whole of its life. Twelve of Word's unread
attributes were this one feature.

Drawn on the **sheet** now, which is where a page border is: inside the paper's
edge, once per page. `pageBorderCss` rather than `pageCss`, because that one also
answers how wide the page is and what room it leaves — a sheet already knows both
from the layout, and handing it those measured as a sheet the wrong size.

The browser test loads a document that asks for one rather than running a
command, because **Word has no page-setup dialog yet** — page size, margins,
columns and these four edges are one of the four dialogs its own conformance file
lists as owed. It measures seven sheets with the rule and one without, because
the sample has two sections and only the first asked: putting the border on the
surface instead of the sheet would give eight or none.

### A paragraph's `verticalAlign` was a property Word does not have — 2026-08-30 *(fixed)*

Declared on paragraphs, headings and list items as *"baseline | superscript |
subscript (for the run default)"*, and there is no such thing. Raising and
lowering text is `w:vertAlign` on a **run**, and in this model it is a pair of
marks — `subscript` and `superscript`, drawn by `mark-format.ts` with the size
change Word applies too. Three node types carrying a property that meant nothing.

A section keeps its own `verticalAlign` — Word's `w:vAlign`, where the text block
sits between the top and bottom margins — and so does a cell. Three attributes,
three different questions, and only one of them was fictional.

The second finding on the unread list whose answer is to take the declaration
away rather than write a drawing for it; the first was a cell's `borderInside*`.

**185 → 79.** Well over half, and what came off divides in three: features
finished at one layer with nothing above reaching down (block revisions, the page
border, `borderBetween`), attributes read in a context the probe cannot build
(header ids, a table's interior, the between border), and declarations describing
a document this model cannot hold (a cell's interior, a paragraph's vertical
alignment).

### A text box has no overlay, so it can only be dragged on a canvas

Word sets a box's anchor and its wrap from Format Shape → Layout, and its size by
dragging it. This product has an overlay that drags a shape on a **canvas** and
nothing at all for a box anchored in the flow — the ruler writes its width and
height and there is no way to say where it is anchored or how the text should
behave around it. A surface rather than a dialog, and the last thing standing
between `textBox` and being a feature rather than a node.

### `surface.verticalAlign` needs the paginator, not CSS

Word's `w:vAlign` on a section puts the text block at the top, centre or bottom
of **each page** — which is what a title page is usually made with. `flowCss` has
no vertical padding on purpose (*"where a page starts is what the computed break
produces"*), so this cannot be drawn as CSS on the flow without fighting the
layout's absolute positioning. It belongs in the pass that computes each page's
block positions, beside the rule that pushes the first block down to meet its
sheet. Left in the count, unexempted, because it is genuinely unread.

### A whole feature was written down and invisible — 2026-08-30 *(fixed)*

`every-attribute-is-read` reported **185** attributes Word declares and nothing
draws. Reading the list rather than the number, the largest pile was one thing:
**44 of them were block-level tracked changes.** `revisionId`, `revisionType`,
`revisionAuthor` and `revisionDate`, on eleven node types, written by
`revision-record.ts` — and the only code that read any of them was
`recordParagraphMerge`, checking whether it had already proposed one.

So with 변경 내용 추적 on, pressing Backspace at the start of a paragraph
proposed the merge, recorded who and when, and **the screen showed nothing at
all**. The paragraphs stayed apart with no mark on them and a reviewer had
nothing to accept or reject. Tracked changes to *text* had been drawn since the
feature was written, because those are marks; a block's revision is not a mark —
what it proposes is not about a range of characters — and nobody had drawn the
other half.

`blockRevision` draws it now: a change bar in the margin in the author's colour,
from the same `authorColor` the marks use, so one reviewer is one colour whether
they changed a word or a boundary; and a struck-through ¶ where a paragraph mark
is the thing being deleted. Nine node types carry it, through one
`revisionDrawing` helper — *the repetition is how six of them would be
forgotten, which is what happened to all nine.*

**The browser test for this already existed and passed the whole time.** It
asserted `blockAttrs` and never looked at the page. Asserting the model and not
the drawing is exactly how a feature stays written down and invisible.

**185 → 134**, and six of the fifty came off without a line of product code:
`headerId`, `footerId` and the four first-page and even-page names are read by
`renderers/page.ts` through `furnitureFor`, which picks a header per page in
Word's order. The check cannot see it because the whole branch is behind
`if (doc && layout)` — choosing a header needs a **paginated layout**, and
rendering a `surface` on its own has no pages to choose between. They had been
sitting in the pile described as *"five names nothing looks up"*, which was
wrong. Reading the list is what found it; counting it is what hid it.

### A numbered list drew nothing at all, off Word — 2026-08-30 *(fixed)*

A marker comes from the numbering definition in `resources`: `listItem` draws
`data-marker` from `numberFor(sid)`. That is Word's model and the right one. But
the shared `toggleBulletList` / `toggleOrderedList` write `type` on the list and
**no `numId` on anything**, so the resolver had nothing to resolve, the marker
was the empty string, and a list on a page drew no bullet and no number.

**All three products had already fixed it, each in its own way, and the shared
default stayed wrong.** Word numbers from a `numId` definition in `resources`.
The deck draws CSS counters from a `data-list-type` its own renderer writes —
added when `every-attribute-is-read` reported a numbered list wearing bullets.
The site overrides the node entirely and emits real `ul` / `ol` — added when
`insertBulletList` turned out to be writing `kind: 'bullet'`, an attribute
nothing reads.

Three products, three separate discoveries of one fault, three separate repairs,
and `office-text` went on drawing a plain `div` through all of them. Nobody was
wrong in any one file, which is the shape this whole harness is for.

It is shared now (`listTypeOf`), the deck's override keeps only what is really
the deck's, and `text.css` draws the fallback **only where `data-marker` is
empty** so a resolved number always wins. No product needs it today — Word
suppresses it, the deck and the site override the node — and the fourth product
gets a list that draws like a list without finding this out for itself.

### A caret has no pending format, so the font controls go grey on one

`setFontFamily` joined `setFontSize` and `setFontColor` in asking for a range
that covers **something** — a mark over zero characters is written nowhere, so
over a caret the dropdown was live and inert. The three agree now, and Word's
toolbar test had to select words rather than place a caret, which is the tell:
it had been asserting that a dead control looked alive.

What Word actually does with a caret is hold the choice for the **next character
typed** — a pending format, which this engine has no concept of. That is the
feature the grey control is standing in for: a `pendingMarks` on the selection
that `insertText` applies and any selection move clears. Until it exists, grey
is the honest answer and a live dropdown is a lie.

### What the sweep found and ruled out

Run for the reflection that this repository lists code without reading it, and
worth recording so it is not run again from scratch:

- **13 `RangeOperations` methods nothing above calls** — `expandToWord`,
  `expandToLine`, `findAll`, `moveText`, `duplicateText`, `trimText`,
  `normalizeWhitespace`, `constrainMarksToRange` and five more. Not faults:
  double-click word selection is the browser's inside a contenteditable, and
  find-replace has its own collect because it needs whole-word and case. Worth
  a look the day one of them is about to be written a second time.
- **Every mark the office schema declares has a writer.** All 25.
- **Every chord in all three products names a command that exists.** The check
  that found four in Word now runs for the deck and the site too.
- **Every toolbar, panel, ruler and menu entry names a command that exists**, in
  all three products.

### What is left of Word's 16

Nothing left is a pile. Each of these is one node's answer, and three of them are
the same answer twice:
- **A `picture`'s `fill`, `stroke` and `strokeWidth`** — Word's picture border.
  An SVG `<image>` paints neither, so it wants a companion `<rect>`, which turns
  the element into a group and changes what the overlay hit-tests.
- **`fitText` on the two cell types** — Word shrinks a cell's text to its width
  rather than wrapping it, which CSS has no property for: it is a measurement,
  and it belongs beside `tab-layout.ts` where the other measured-then-drawn
  values live.
- **`contentControl.dataBinding`** wants a custom XML part to resolve against,
  which no document here has.
- **The four field switches** — `fieldSeq.restartLevel`,
  `fieldStyleRef.searchFromBottom`, and `format` on three field types. The last
  three are read by the field resolver and unaskable rather than unread: the
  probe renders against an environment with no resolver and no clock, so every
  format draws the empty string.
- **`surface.sectionStart` and `columnsEqualWidth`**, both the paginator's:
  where a section begins (`nextPage`, `evenPage`…) is a decision about sheets,
  and unequal columns cannot be drawn with `column-count` at all — CSS's
  multi-column always divides evenly, so honouring `columnsEqualWidth: false`
  means a different mechanism.
- **The rest, one node each**: `bTable.overlap`, `fitText` on the two cell types,
  a `group`'s two, `contentControl`'s `lockDelete` and `dataBinding`, and the
  field switches (`useHyperlink`, `restartLevel`, `searchFromBottom`).

### Accepting or rejecting a block's revision

The bar is drawn and the ¶ says what is proposed; 적용 and 되돌리기 still act on
marks only. A rejected paragraph-mark deletion has to put the `revision*`
attributes back and nothing else; an accepted one has to actually merge the two
blocks, which is `mergeBlockNodes` plus taking the attributes off.

### A key that names a command nobody registers — 2026-08-30 *(fixed, and now asked)*

Nothing had ever asked the question *does every chord this product prints name a
command it registers?* Word printed **72** and answered **68**. The four are
worth reading one at a time, because they are four different failures:

- **⌘H → `replace`.** The command is `replaceText`. A misspelling, and 바꾸기 had
  never worked from the keyboard.
- **Shift+Enter → `insertLineBreak`.** No such command — and the key works
  anyway, because it arrives as a `beforeinput` of that type and the input
  handler answers it. Two mechanisms on one key, one of them a name. The binding
  is gone; see the open item below about which document a line break should make.
- **⌘Space → `clearFormatting`.** 서식 지우기, and **nothing had ever built it**.
  Eleven `remove…` commands each take off one mark; the gesture takes off all of
  them. `DataStore.range.clearFormatting` had existed as long as the range API
  with nothing above it able to reach it — no operation, no command, one binding
  naming a command that did not exist. Now an operation with an inverse, a
  command, and the fixture grew a bold run so the check can run it.
- **⌥⌘D → `insertEndnote`.** Not missing — *unfinished*, which took longer to
  see. The name was registered in `doc-structure.ts`, a shared extension **no
  product installs**, and what it did was put an *empty* `endnoteDef` into the
  flow with **no reference pointing at it**. A body nothing refers to is not a
  note, and the mark that refers to one, `endnoteRef`, was never declared at all
  — `office-text` had been drawing it in superscript for months with nothing able
  to write one. Under the office schema it is worse: `endnoteDef` is a resource
  there and cannot sit in the flow, so every insert built a tree the validator
  refused. It is one command now, beside the footnote, and `doc-structure.ts`
  no longer claims the name.

`keyFaults(keys, knows?)` asks it now, and all three products' tests pass their
editor's command names. The two questions it already asked — a binding runs a
command or changes a view and says exactly one, no chord bound twice in a mode —
did not need an editor, which is why the third had been missing.

### Replace all, then undo, and the formatting came back wrong — 2026-08-30 *(fixed)*

`replaceText` has two payload forms. The **range** form captured the run's marks
so its inverse could put them back — with the reason written above it, that
`range.replaceText` re-derives marks by the store's rules for an *edit*, which
are right for a reader making one and are not reversible. The **single-node**
form, which is the one `replaceAll` builds, did not.

So 모두 바꾸기 followed by ⌘Z returned the words and not the emphasis: a bold
span over `[4, 7]` came back as `[4, 5]`. Silently, in every product.

Invisible until the extensions' conformance fixture grew a bold run and a link —
which it grew for an unrelated reason. **A document with no formatted text in it
cannot notice a fault about formatting**, and this fixture had none for as long
as it has existed. Worth remembering when the next fixture is written.

### Four more controls that lit up over a caret and did nothing — 2026-08-30 *(fixed)*

Found by sweeping every `toggle…`/`set…`/`remove…` command over a **collapsed
caret** and asking whether the document moved — the state the probe reaches only
after a range state has already succeeded, so it stops there.

- **`setHighlight`, `setFontFamily`** — hand-written guards asking only for a
  range, three lines different from `font-size.ts` and `font-color.ts`, which had
  been given `'something'` for exactly this.
- **`removeLink`** — its own comment named the tighter answer, *"and there is a
  link here"*, and left it for *"the day a reader complains that it is offered on
  unlinked words"*. The day arrived as a measurement. `wears(editor, selection,
  kind?)` in `guards.ts` is that question now, shared with 서식 지우기.
- **`setParagraph`** — the run answers *"no-op if already paragraph"* with
  `return true`. Success, and the document untouched, on every paragraph in the
  document. Worse than a refusal: a caller that trusts the answer believes the
  conversion happened.

### The guard against marking a caret read a field nothing sets — 2026-08-30 *(fixed)*

`hasRange(editor, payload, 'something')` is the argument that separates *a
command needing text between two points* from *one needing a caret*, and it is
asked in **seventeen** places — every colour, size, family, link and note. It
answered by reading `selection.collapsed`.

**Nothing sets that field.** `SelectionManager` stores what it is handed and the
view builds a range from two points; neither computes it. So it is `undefined`
essentially always, `!undefined` is `true`, and the argument written to stop a
mark being applied over zero characters permitted exactly that, everywhere.

It reads the offsets now, and honours `collapsed` where a caller sets it — the
probe does, which is why the harness never saw this. Found writing a test for
미주's guard by hand: it lit up over a caret.

### No footnote had ever been inserted, in any product — 2026-08-30 *(fixed)*

Found by the other half of the probe, *does it move the document*, with a caret
in a run where the guard says yes. Two faults stacked:

1. The body went to the **document root**. Office says `document` holds
   `docMeta? surface+ resources?` and re-declares `footnoteDef` as a *resource*
   precisely so a body cannot sit between two paragraphs. Every insert built a
   tree the validator refused and rolled back.
2. Under that, `footnoteDef` held `block+` in office and `inline*` in the
   standard schema, and the command wrote the inline one. **One node meant two
   things.** The schema says `block+` in both places now — which is what Word's
   own sample document had been writing all along.

The endnote inherits the fixed path rather than a copy of it.

### Word's two probe questions are answered — 2026-08-30 *(measured)*

`moved` and `saysYesAndDeclines` opened at 33 and 45. Both are **23** and both
are the *same* 23, and every one of them changes the application rather than the
document: caret moves, selection extensions, clipboard, focus, cell and math-slot
navigation, reading the tracking flag. So both are equalities against a named
list now rather than ceilings — a 24th has to be looked at rather than absorbed.
`packages/extensions` is at **zero** by the same measure.

What came off on the way, beyond the notes above: `toggleTableLook` wanted a
`flag`, `insertColumnBreak` a range, `setParagraphIndents` an `indents` object,
`insertTab` a collapsed caret, and `splitCell` a cell that is actually **merged**
— one helper had given all seven table commands *"the caret is in a cell"*, so
셀 나누기 lit up over every cell in every table and worked on the merged ones.
The same fault, in the same shape, as the one `packages/extensions` had, and a
private helper is why both lasted: a sweep reading `canExecute:` at each command's
own declaration sees one guard, not seven.

### Shift+Enter should probably make a `hardBreak`, not a `\n`

`EditorViewDOM.insertLineBreak` is `insertText('\n')`, and `hardBreak` is a real
node in both schemas with a command (`insertHardBreak`) and a renderer. OOXML's
`<w:br/>` is the node, not the character, so a document round-tripping through
Word loses the distinction. Not changed now because the input handler owns that
key through `beforeinput` and moving it to the key map would mean **two**
mechanisms answering one press — the trap this session already fell into twice.
The fix is to have the input handler run `insertHardBreak` for that inputType,
which is a change to typing and wants its own measurement.

### An endnote's body has nowhere to be drawn yet

The node, the mark, the command and the superscript reference all work. Word lays
out footnotes at the foot of the page their reference is on; the endnote's body
should be at the end of the *document*, and Word has no pass that does that. The
`resources` node holds it and nothing reads it, so it is invisible rather than
wrong.

### The model layer does not draw, and does not guess — 2026-08-30 *(asserted)*

Two claims, each false in several files a week ago, each now a test — because
both grew back once already.

**It does not draw.** Five files did. Three built whole surfaces
(`FindReplaceExtension`, `SlashCommandExtension`, `FloatingToolbarExtension`) and
two carried a stylesheet and a drag handle. A shared model package drawing UI is
one a product **cannot use** — it cannot be themed, placed or styled by it — and
what each cost is on the record:

- `FindReplaceExtension` was called a **stub** in three places for months. It was
  complete; nothing installed it, which from a keyboard is the same thing. Word
  removed a key binding over that belief and the site deleted a menu entry.
- `FloatingToolbarExtension` registered **no commands at all**, and no product
  had ever built the equivalent. Deleted.
- `styles.ts` held `.callout`, `.code-block`, `.task-item` — a **product's**
  stylesheet — and its `injectEditorStyles` was called by the slash menu and by
  nothing else. Once that stopped drawing, it was dead. Deleted.
- **`ReorderExtension` was the one that was installed** — by all three — and
  used by none. Four global pointer listeners, a handle styled by a stylesheet
  nothing injected, and `document.querySelector('[data-bc-layer="content"]')` to
  find *the* editor in a product that draws three boards at once. Meanwhile every
  product does its own dragging. 180 of its 230 lines were drawing and listening;
  what is left is one command and two lookups.

**It does not guess.** `canExecute: () => true` is not a guard, it is the absence
of one, and it was in **nineteen** files. 37 of the 42 "lights up over a held box
and declines" findings were this, almost all one sentence written thirty times.

Both are `the-model-layer-does-not-draw.test.ts` now. The cast count fell
**328 → 327** with the drag-drop rewrite — the third time a *layer* being wrong
has shown up here as a number.

### And where a drag actually belongs, measured

Not per product. Three layers, and the hard one is already shared:

| | | |
| --- | --- | --- |
| **where a drop lands** | `reorderIndexAt` in `office-canvas` | the deck **and** the site use it |
| **what moves** | `moveBlockToPosition`, `moveBlockInto`, `moveShapes`, `movePage` | by *kind of surface* |
| **the pointer and the drawing** | each app's overlay | the app's, and rightly |

And the middle row does not divide by product. A **flow** — Word's paragraphs,
the site's blocks — is a parent and a place in it. A **canvas** — the deck's
boxes, Word's shapes — is coordinates. A **list** — slides, pages — is an index.
Word and the site share the first; the deck and Word's shapes share the second.
**Three surfaces, not three products.**

### 42 controls light up over a held box and do nothing — 2026-08-29 *(37 fixed, 5 left)*

Nineteen files in `packages/extensions` still carried `canExecute: () => true`,
and the probe said **0 findings**. Both were true, and the gap between them is
the finding.

*Does it move the document* stops at the **first** state a command can run in. So
a command that works from a caret and declines over a node selection comes back
as **works** — and half the products on this engine spend their time with a node
selected rather than a caret. The fault this harness is named after was found by
hand in exactly that state: *"measured on a deck with a box held, both toggles lit
up and did nothing."*

So the probe asks a second question now — **is there a state where the guard says
yes and the run refuses** — from the two states a builder has: a node held, and
nothing held. On its own editor, because asking means running, and the loop above
stops at the first success so a working command would never be asked.

**42 appeared that nothing had ever seen** (60 before the application-command
exemptions, which are the same exemptions for the same reason: a command that
moves the caret or opens a menu has not refused, it has changed the application).
Word's is **45** on the same question, and Word is a text editor — it lives in
the state that hides this.

**Thirty-seven went the same afternoon**, and almost all of them were one
sentence written thirty times: `canExecute: () => true` beside an execute whose
first line is `if (!selection || selection.type !== 'range') return false`. That
is what `guards.ts` exists for, and **nineteen files had not used it**.

The others were each their own:

- **`toggleChecklistItem`** asked nothing at all and needed a `taskItem`, *named*.
- **`toggleLink` and `insertImage`** asked about the address and not about the
  words: a mark covers the text between two points, and over a caret both write
  nothing.
- **`deleteForward`, `backspace` and the two word deletes** asked
  `selection != null`, which a **node** selection passes — and a delete acts on
  text between two points.
- **`deleteNode`** asked `payload.nodeId != null`, a claim about the payload
  rather than about the document: an id naming nothing passes it.

Word's count went **45 → 30 without Word changing**, because most of what it
registers is the shared kit's. That is what a shared layer is for, and it is why
the count is kept on both sides: the next fifteen are Word's own, and nothing
else will find them.

**Four of the forty-two were the probe's own fault** and are worth keeping: the
payload was built from the main editor and handed to the *builder* editor, so
every command taking a node was given an id that named nothing there. A probe
that hands a command a dangling reference is measuring its own mistake — the
third time this week a measurement has been wrong in the direction of reporting
a working product as broken.

**Five left, and they are all in one state: nothing selected at all.** Every one
takes a node by id, so none should need a selection, and every one examined so
far turned out to be the probe rather than the product.
`moveBlockToPosition` was measured three times: `targetIndex: 0` and then `1`
were both the index the block was already at, because `wantsNode` hands over the
*first* paragraph and where that sits is a fact about the fixture. **A payload
written as a number is wrong the moment the document changes shape**, so it is
derived now.

They stay on the ceiling rather than being exempted, because *"probably the
probe"* is not a reason — it is where to look next.

One thing the attempt taught: a **scripted** rewrite across nineteen files
matched `guards.ts`' own documentation and broke the file that defines the fix.
Reverted, and the three that were genuinely mechanical were kept. The repository
already had this written down about a different day.

### `numId` is a position dressed as a name — 2026-08-29 *(design, before collaboration)*

Asked while fixing Word's list toggles: if definitions live in `resources`, what
happens when two people open the document at once?

**One `resources` is right**, and it is what Word itself does — OOXML keeps
`numbering.xml`, `styles.xml`, `comments.xml` and `footnotes.xml` as parts
separate from the body, referenced by id. The reason is that **one of them serves
many**: ten paragraphs share a numbering, a footnote is referenced from one
place, a comment thread is anchored by a mark. Put a definition in the flow and
deleting the paragraph that holds it takes the other nine's numbering with it. A
definition has to outlive its references, so it lives outside them. Nine kinds
are in there today: `numberingDef`, `footnoteDef`, `endnoteDef`, `commentThread`,
`surfaceNote`, `docHeader`, `docFooter`, `bibliography`, `indexBlock`.

**And the nesting is not the problem — the naming is.** A sid is
`${sessionId}:${counter}` and cannot collide across sessions, so two peers each
adding a definition make two nodes with two sids and a sound tree.

What collides is `numId`, which is **not a sid**. It is a name a command invents:

```ts
for (let n = 1; ; n++) if (!taken.has(`${kind}-${n}`)) return `${kind}-${n}`;
```

Both peers look at their own document and both choose `bullet-1`. After a merge
there are two definitions with one name, each side's paragraphs point at the
other's, and the numbering continues from somebody else's list. Nothing breaks
and nothing is lost — **it is quietly wrong**, which is worse than a sid
collision, because a sid collision corrupts the tree and announces itself.

The fix is one line and it is the decision this repository has already made four
times — a colour is `var:강조`, a placement is a `componentId`, a link is
`page:<id>`, a list names its dataset by `name`. Every one of them says *a
reference is a name, not a position*. `bullet-1` looks like a name and **is a
position**: it is decided by how many the document happens to hold.

So: `numId` should come from `generateId()`. Session-stamped, collision-free,
and nothing is lost — it is not a name a reader ever sees, because it appears in
no list.

Worth sweeping for others of the same shape before doing it; a naming rule broken
once is rarely broken once.

**And the question that is genuinely collaboration's**, left for when
collaboration is: two peers making *the same* bullet definition independently.
Not merging them grows `resources` by one per session; merging them needs a
definition of "the same", which is a product decision a CRDT cannot make. Per
`collaboration-is-deferred`, that is decided when collaboration is switched on,
not built ahead of it.

### The `/` menu, and the test of the split — 2026-08-29

The point of publishing *where the selection is* was that a **second** floating
surface should be a list rather than a mechanism. The site's `/` menu is that
test, and it held: rows, a keydown handler, and one more published thing.

**Its rows are the toolbar's insert group, read** — `siteSlashItems()`. Two lists
is how a slash menu and an insert toolbar come apart: an insert added to one and
not the other is a thing a reader can find by pressing and not by typing, which
is the same fault already on record here as a menubar printing eleven chords the
key handler answered none of.

**`Editor.getExtension` was the one thing still missing.** The suite's shape is
that an extension holds commands and *state* and a product draws it — a menu's
open flag, its rows, the highlighted one. `_extensions` was private, so a
product's only route to a piece of state was to keep its own copy and hope the
two agreed. **Which is why the two extensions with state to show drew it
themselves.** Publishing the object took two casts with it: 330 → **328**.

Two faults of my own, both found by a screenshot rather than a state dump:

- **`useLayoutEffect` with `children` in its deps** — a new array every render,
  so measure, set state, render, measure. React stopped it with *"Maximum update
  depth exceeded"*, the surface threw and unmounted, and the menu was **built
  perfectly and never appeared**: the state dump showed nine correct rows and the
  page had nothing on it.
- **The effect that opens the menu depended on `revision` and raised it.** Filter,
  tell, re-render, filter. It calls only when the query actually changed now.

Both are the same shape and worth naming together: *a measurement that is also a
cause*. The state was right at every point and the page was empty, which is
exactly the class of fault a screenshot finds and a log does not.

And one design note taken while wiring it: **`/` is not a chord.** A key map
answers a key with modifiers in a mode; `/` is a character typed into the
document, and the menu opens *because the document now ends with one*. Binding it
would mean a reader could never type a slash. So the app watches what was typed —
its own business — and everything after that is a command the key map can bind.

### A floating surface needed four layers and the repository had three — 2026-08-29 *(fixed)*

Asked: *how do you build a floating toolbar or a `/` menu properly in an app?*
Measured rather than answered, and the answer is that almost all of it was
already built:

| layer | what it is | state |
| --- | --- | --- |
| what it offers | a declaration, `toolbar-model.ts`'s shape | ✅ `SlashMenuItem[]` |
| when it is open, where the reader is | a command and a piece of state | ✅ today's rewrite |
| what it looks like | `office-ui` — tokens, theme, portal | ✅ `Toolbar`, `Menu`, `Tip` |
| **where it goes** | the selection's rectangle on screen | ❌ reachable by nobody |

`DOMQuery.calculateTextPosition` has answered the fourth since the decorator
system was written, and lives inside it. So a surface needing all four could not
be built by a product at all — **which is why the two that existed were built
inside a model package, drawing their own DOM, installed by nobody.** The same
sentence as `find`: the mechanism exists, in one place, unpublished.

`selectionRectIn` publishes it, `FloatingSurface` draws it in the suite's
tokens, and the site's selection toolbar is a list of two buttons. That is the
test of the split: a **second** floating surface is now a list, not a mechanism.

Four things it took measuring to get right:

- **A product may hold several views of one document.** The site makes an
  `EditorViewDOM` per board and draws three at once, so a view's own
  contains-check answers `null` for two of them. `EditorViewDOM.selectionRect()`
  passes its content layer, which is right for Word; a multi-view product passes
  a root holding them all. Asking each view in turn would be three answers to a
  question with one.
- **`getClientRects()[0]`, not the range's bounding box.** A selection wrapping
  across lines has a box covering the whole paragraph, and a toolbar centred on
  that sits in the middle of the text.
- **Measured in `useLayoutEffect` with the element's own size.** In an effect it
  paints at 0,0 for a frame first, which reads as a flicker in the corner; from
  a constant it is wrong the first time a product puts a longer label in it.
- **`office-ui`'s own guard caught a hardcoded `z-50`** — the check written the
  day a select opened underneath a dialog. It is `--ou-z-popover` now.

Corrected on the way: *"three apps each call `window.getSelection()` for this"*
was wrong. All four calls **set** the selection; nothing had ever asked where it
is.

### The layer is three, not two — 2026-08-29 *(the last two UI extensions resolved)*

Asked directly: *if an extension draws its own DOM, does every application have
to build its own copy?* Half right, and the missing half is the one that makes
this engine worth having. The split is **three**, not two:

| layer | what it holds | shared? |
| --- | --- | --- |
| `extensions` | commands, state, no DOM | yes, by every product |
| `office-ui` | the drawing — tokens, themes, `Toolbar`, `PropertyPanel`, `Tip` | **yes, by every product** |
| the app | which command, which panel, where | no, and that is the point |

So UI *is* shared. What cannot be shared is UI **in the model package**, because
a product cannot theme it, place it or style it — which is exactly why three
extensions sat in no kit.

`SlashCommandExtension` was the last one with a model half worth keeping, and it
had three faults in one file:

- **It drew its own menu** — the reason nothing installed it.
- **Its icons were unicode characters**: `¶ • ☑ — ⊞ ℹ ⚠ ∑ 💬`. This repository
  has one absolute rule there and a character is not an icon. The defaults name
  none now: `office-icons` has no heading, quotation, code block or divider yet,
  and inventing eight for a menu nobody renders is the same mistake in a new
  package. A product that draws this menu names icons from its own vocabulary.
- **It listed commands a product may not have.** `insertComment` is Word's;
  `insertCallout` and `insertMathBlock` are ones Word deliberately leaves out.
  A shared default list offering rows that decline is
  `every-command-does-something`'s fault waiting to happen — so the menu answers
  with **what this editor actually registers** and cannot show a dead row.

`FloatingToolbarExtension` was **deleted**, not rewritten. It registered *no
commands at all* — a selection toolbar, entirely UI, in the model layer, and no
product had ever built the equivalent. Writing it into `office-ui` instead would
be a component nobody renders at a new address; the day a product wants one, it
belongs there, where it can take the tokens all three theme by.

Two more faults fell out of the rewrite:

- **`runSlashMenuItem` reported success before the work happened** — it fired the
  row's command without awaiting and returned `true`, so it would have said yes
  even for a row whose command declined. The same fault as *says it can run and
  then does nothing*, one moment earlier.
- The cast count went **331 → 330**, and the exemption list on
  `every-extension-is-in-a-kit` is now **empty**: every extension this package
  exports is one a product can install.

### Four extensions were in no kit, and three of them drew their own UI — 2026-08-29 *(fixed)*

`FindReplaceExtension` was called a stub in three places for months and was
complete all along — nothing installed it. The obvious next question is whether
anything else is in that position, and the answer is a check this package can
run on itself: **every extension it exports is in a kit a product can take.**

Four were not: `FindReplaceExtension`, `EmojiExtension`, `SlashCommandExtension`,
`FloatingToolbarExtension`.

**Three of the four build their own DOM**, and that is not a coincidence. A
shared model package drawing UI is a package a product cannot use, in a
repository whose whole shape is that `office-ui` draws and the packages below it
do not. It is the same fault that kept `find` unused, seen from the other end —
and the measurement that names it is *"which of these is in no kit"*, not
*"which of these looks wrong"*.

`FindReplaceExtension` had its panel removed earlier today, so it is installable
now and is in `createRichExtensions()`. `EmojiExtension` was a plain wiring gap
and went in with it. The other two are exemptions naming what would have to
change first — 14 lines of `document.createElement` in one, `background: white`
in the other — and the day either stops drawing, the check fails and it goes in
a kit.

**Word names its extensions one at a time and that is not a counter-example.**
Its kit takes core and basic and then lists twenty-two by hand, with the reason
written down: `createRichExtensions()` registers an insert for every node in it,
including ten Word cannot draw, so `insertCallout` reported success and left the
reader's text invisible. That is the right decision, and it is one **only a
reader of these exports can make**. A product that reads the list can choose; a
product that takes a kit gets what the kit has; an extension in neither is one
nobody chooses *or* inherits. The next application starts from a kit.

### The six questions are a shared probe now, and Word answers them — 2026-08-29

The probe that found eleven faults in `packages/extensions` was answering six
questions about **one package** and nothing about the products standing on it.
Word registers **164** commands and only about 136 come from that layer; the
rest are its revisions, comments, tables, shapes, maths, fields and tab stops,
and **not one of them had ever been asked whether it can be undone**.

Which is the same shape as the fault the probe was built to find: *a mechanism
that exists and is wired in one place.* It is `@barocss/conformance`'s now —
`askEveryCommand` — and a product wires it with a document fixture, a payload
table and four lines. That is what the next application has to write to inherit
all six.

**Word's first run: 98 move the document, 33 do not, 33 cannot be asked.** No
undo, redo, validity, selection or self-inverse fault among the 164, which is
the good news and the reason to keep the count rather than a list.

The 33 that say yes and change nothing are not all faults — about twenty are
caret moves, selection extensions, clipboard, focus and a flag read. What is
left is a work list, and its shape is already familiar: `list-commands.ts`
registers **seven** commands through one helper whose guard is *"there is a
block"*, which is looser than what any of the seven needs.
`TextFormattingExtension` had exactly this, in exactly this shape, and a private
helper is why a sweep reading `canExecute:` at each command's own declaration
never sees it. Held as a ceiling so it cannot grow quietly.

Three things the move itself taught:

- **`says` and `wantsNode` are not enough.** A merge wants the cell *beside* the
  first; a split wants the one cell that is actually merged; three commands take
  the **span** they act on rather than reading the editor's. Those are facts
  about one command and one fixture, so `derive` belongs to the product — the
  alternative is the conformance package knowing what `mergeCells` is.
- **A probe should not make its callers reach for the escape hatch.** It exports
  the shape it needs of an editor, so a product's tables are typed by that. The
  cast count went 332 → **331** across the move.
- **That count reads prose.** Two of the matches it found were *comments* — the
  phrase written inside a note about avoiding it. Worth knowing about the
  measurement rather than working around: a count that can be argued with is
  cheaper than a count nobody keeps.

### Enter at the end of a heading made another heading — 2026-08-29 *(fixed)*

Two more questions on the extensions' probe. The first found nothing and is not
shipped; the second found the everyday gesture producing the wrong block.

**The negative direction is structurally true, and that is worth knowing.** Every
fault this harness has found is a `canExecute` *looser* than its `execute`. The
opposite was measured — run each command where its guard says no, see whether the
document moves — and came back **0**, and always will: `Editor.executeCommand`
consults `canExecute` before running anything. The check is not shipped, because
it cannot fail through the path every caller uses; the reason is kept, because it
explains why every guard fault here points the same way.

**What an `insert…` actually puts in the document, observed rather than
declared.** `every-command-makes-something-real` asks this of a written list a
product maintains; the probe already runs every command over a real document, so
the answer can be *what appeared* — which cannot go stale and cannot name a type
the schema does not have. 40 inserts, and the table is now asserted.

The first version compared the **set** of node types and reported thirteen
inserts as adding nothing. All thirteen were fine: the fixture holds a `columns`,
a `descList`, a `bFigure` and a table on purpose, so an insert that added one
*more* of something already present looked like an insert that added nothing. A
fixture rich enough to let a command run is rich enough to hide what it did, and
counting is the difference.

Counted, one entry was wrong: **`insertParagraph → heading`.** Pressing Enter at
the end of a heading gives you **another heading**, in all three products. Every
editor of this kind gives a paragraph, for a reason a reader could state: a
heading is a title, and the thing after a title is prose.

The operation has taken `blockType: 'paragraph'` since it was written and nothing
ever asked for it. **At the end and nowhere else** — Enter in the middle of a
heading splits a title into two titles, which is what a reader means by a break
inside one; only the split that leaves the second half empty is *this heading is
finished*.

And fixing it surfaced the same stray-attribute fault `transformNode` had, in the
other operation that changes a block's type: the new paragraph came out carrying
`level: 2`. Filtered by what the schema declares, the same way, found the same
afternoon.

### Backspace across two paragraphs could not be undone — 2026-08-29 *(fixed)*

Closing the probe's last *unanswered* commands, 8 → **2**. Every one of the six
turned out to be a fault rather than a blank, and the last of them is the worst
thing this repository has found:

**Select across two paragraphs, press Backspace, press ⌘Z — the words are gone
for good.** The everyday gesture, in all three products, losing text in silence.

`deleteRange` offered **no inverse at all** for a range spanning more than one
run, and said why: *"a deletion spanning several nodes removes structure as well
as characters, and re-inserting a string would not rebuild it — so rather than
offer an inverse that half-works, it offers none."*

Careful reasoning from a **wrong premise**. `range.deleteText` removes no
structure: it truncates the run the range starts in, empties the runs between,
and trims the run it ends in. Nothing is added, nothing is taken away, and every
node involved survives — so the deletion is exactly reversible, and declining to
try is what cost the text. `restoreRuns` is the way back, and its argument is
`restoreTextNodes`': an operation that cannot be undone can usually be **told**
what it would need to know. That precedent is in this file, about
`autoMergeTextNodes`, recorded as a decision and then reversed for the same
reason.

The other five, all the same class — a guard looser than its run:

- **`insertEmoji`** asked only whether an emoji had been named; the run refuses
  without a range. A picker with nothing selected lit up and did nothing.
- **`moveBlockUp`/`moveBlockDown`** said yes on the **first** block of a page.
  Their guards also demanded `payload.selection` while their runs read the
  editor's — the same asymmetry as the ten heading commands.
- **`splitCell`** needed a merged cell to be exercised at all; the probe was
  handing it the one case the operation declines.
- **`hideSlashMenu`** needed a menu open first.

And **two** left, which are not a probe gap: `indentNode` and `outdentNode` act
only on a node type the schema marks `indentable`, and **no schema here marks
one** — not the standard schema, not the office schema. Word found this and
worked around it (`word-keymap.ts` binds `indentText` instead, with the reason
written down); the commands are still registered, still reachable, and still
impossible to run. Recorded as a claim rather than a blank: the day something
declares `indentable`, the ceiling in the test fails.

### `find` was never a stub — 2026-08-29 *(record corrected; extension rewritten)*

The last four *unanswered* commands were blocked on `find`, which three places in
this repository called a stub:

- `word-keymap.ts`, explaining why ⌘F was taken out;
- `every-command-does-something.ts`, opening with it as the fault that check
  exists for;
- `BACKLOG.md`, as an open item.

**None of it was true.** `editor-core` registers no `find` at all, and
`FindReplaceExtension` has been a complete implementation since the day it was
written — measured: three matches found in a two-paragraph document, all three
replaced correctly, undone correctly. What was true is smaller and stranger:
**nothing installed it.** Not Word's kit, not the deck's, not the site's, not
`createDefaultExtensions` — which from a keyboard is indistinguishable from
reaching a stub.

The symptom was recorded honestly (편집 › 찾기 lit up, ran, drew nothing); the
**cause was guessed, written down, and then quoted for months**. Word removed a
key binding over it and the site deleted a menu entry over it. The BACKLOG entry
even had the right answer in its own last paragraph — *"the real
`FindReplaceExtension` exists and is in nobody's kit"* — under a headline that
contradicted it.

**Why nothing installed it** was in that paragraph too: it drew its own panel.
`document.createElement`, `position: fixed`, `background: white`, `#e2e8f0`
borders, appended to `document.body` — a shared model package building UI, in a
repository whose whole shape is that `office-ui` draws and the packages below it
do not. It could not be themed, placed or styled by a product, and would have
been white-on-white in the dark theme all three now honour.

The highlighting told the same story from the other end: `_highlightMatches` was
an **empty method** under a comment saying the drawing was *"deferred to the DOM
layer"*. A search found twelve matches and showed the reader none of them.

It is a search and a place in it now, with no DOM. `findNext` and `findPrev` move
through the results by **moving the editor's selection onto the match** — what
every editor of this kind does, needing no injected layer, and making the match
a thing a reader can act on rather than look at. A product draws the panel it
wants and reads `state`.

The `editor as any` count fell **337 → 332** with it. Five at once is what a
*layer* being wrong looks like from the outside: a model package building UI
reaches for the escape hatch at every line, and the count is the symptom.

Unanswered went 14 → **8**, and `replaceOne`/`replaceAll` are now exercised by
all six questions rather than skipped.

### A heading's level could not be changed — 2026-08-29 *(fixed)*

Closing the probe's *unanswered* column is the work of exercising the commands
nothing had exercised, and it went 23 → **14** with one change and found two
faults on the way.

**Ten guards demanded `payload.selection` while their `execute` read the
editor's.** `setHeading`, `setHeading1`–`6`, `setParagraph` and
`insertParagraph` all answered *no* to any caller that asks "can this run right
now" without threading a selection — which is what a toolbar does on every
render. `Editor.canRun` fills it in and hides the asymmetry; `canExecuteCommand`
does not, and both are used side by side. Ten commands sat in the unaskable
column reading exactly like ten nobody had got round to.

Asking them properly then found the real one:

**`transformNode` treated *same type* as *nothing to do*, whatever the
attributes said.** `node.stype === newType` was the whole test, so turning a
heading 1 into a heading 2 returned success and wrote nothing. **A heading's
level could not be changed** — in Word, whose toolbar offers all six. Measured
by putting a caret in a heading and asking `setHeading2` whether it had done
anything.

And fixing that surfaced the one underneath it: **a transform merged the old
node's attributes into the new one's.** Right for a heading becoming a heading,
wrong for a heading becoming a paragraph — `level` is a heading's. Nothing drew
it and nothing complained, so it sat there; what made it visible is **undo**.
Turning a paragraph into a heading 1 and pressing ⌘Z produced
`paragraph { level: 1 }`, because the inverse is a transform back and the stray
attribute rode home with it. The attributes are filtered by what the new type
declares now, and a type that declares nothing is left alone.

The same-type path updates **in place** rather than recreating: a heading whose
level changed is the same heading, and every selection, comment anchor and link
pointing at it should survive.

### A list could not be turned back into paragraphs — 2026-08-29 *(fixed)*

Two more questions on the extensions' probe, both free — it already has the
document before and after:

- **Does the selection still name nodes that exist?** 0 findings. A command that
  takes away what the caret was in has to leave the caret somewhere, and a
  selection pointing at a deleted sid is the state the site builder records
  having had once: *"a panel describing something nobody can see."*
- **Is a toggle its own inverse?** **3 findings**, and they are the three block
  toggles: `toggleBulletList`, `toggleOrderedList`, `toggleBlockquote`.

Every **mark** toggle was self-inverse. The three that change the *shape* of the
document each called a `wrapIn…` operation **and nothing else**. A paragraph
became a bullet the first time and stayed one for ever: pressing the control
again ran the command, wrapped nothing, reported success and changed nothing.

So **there was no way to turn a list or a quotation back into paragraphs** in
any of the three products. The only route out was undo, and only if it was the
last thing you did. Three toolbar buttons, in three shipping products, that a
reader can press twice and only the first press means anything.

The way out is composed rather than a new operation (`lift.ts`): move the blocks
up to where the wrapper sits, then take the wrapper away — two operations this
package already has, so the inverse comes for nothing and the pair undoes as one
gesture. Two things it took measuring to get right:

- **The wrapper goes with its children.** `removeChild` takes the list's
  reference out of its parent and leaves the `listItem`s in the store, by then
  empty. The transaction validates what it touched at commit and refused the
  whole thing: *"Content of 'listItem' ended early; 'block+' requires more
  children."* `deleteOp` takes the descendants with it.
- **A list holds items which hold blocks; a quotation holds blocks.** The level
  between is named rather than guessed — a walk that guessed would lift a
  `listItem` onto the page, and nothing accepts one there.

`toggleBlockquote`'s guard was `() => true` besides, on an operation that reads
the selection and refuses without one.

### Three more questions, asked in the same run — 2026-08-29

The extensions' probe already had the document before and after every command,
so each further question costs a line. The point of writing them down is that
each is a **different claim**, and two of the three cannot be reached by asking
the others harder.

| question | asks | result |
| --- | --- | ---: |
| moves the document | the command does something | 0 findings |
| gives it back | undo replays an **inverse** | 1 (fixed — see below) |
| does it again | redo replays the **original**, against a document undo rewrote | 0 |
| still a valid tree | `validateTree` over the whole document | 0 |

**Undo and redo are not one mechanism tested twice.** Undo replays an inverse;
redo replays the original against a document the undo has just rewritten, so a
command whose operation is not repeatable against its own result fails there and
nowhere else.

And they are compared **differently**, which is the part worth keeping:

- **Undo is strict, sids included.** *Back* means the same nodes — a selection, a
  comment anchor or a link points at a sid, and an undo that returned an
  equivalent document made of new nodes would break every one of them. That
  strictness is what caught `deleteNode` returning an empty paragraph.
- **Redo ignores sids.** Doing something again makes new nodes, exactly as doing
  it the first time did. Compared strictly, **15** commands looked broken — every
  insert and every block toggle — and every one had reproduced the document
  perfectly with fresh sids.

The validity check found nothing today, and that is the point: operations
validate what they *write*, one node as it goes in, and nothing had asked whether
the tree they add up to is still a tree the schema describes. It has a companion
test proving it **can** fail, because an empty result is the same shape whether
nothing is wrong or nothing is being asked.

### Undo gave a paragraph back without its words — 2026-08-29 *(fixed)*

The extensions' conformance run asks whether a command changes the document.
**Undo is the other half of the same run and costs one line** — the probe has
the document before and after already, so putting it back and comparing is free.
`every-command-does-something`'s own documentation says so: *"two answers for
the price of one, because a command that cannot be undone is its own fault and a
worse one."* Nothing had ever collected the second answer.

**`deleteNode` returned the node empty.** `delete`'s inverse carried the node
from `getNode`, whose `content` is a list of **sids**, and the next lines delete
every one of those descendants — so undo put an empty paragraph back. Delete a
paragraph, press ⌘Z, and the words are gone for good. `removeChild` and
`removeChildren` had the same fault and were mended with it (`subtree.ts`).

Everything about it looked right, which is why it lasted: the delete works, the
undo runs, the node reappears, the paragraph count is correct, and no test had
ever looked *inside* one. `delete`'s inverse had even been mended once before —
the comment above it records adding the parent and the index because a `create`
left the node unattached — and the contents were not looked at then either.

Three smaller things the same run turned up:

- **The fix took two goes, and the second is the lesson.** Written beside the
  inverse it ran *after* the descendant loop and captured a node whose children
  were already gone. A record of a deletion has to be taken before the deletion.
- **`outdentText` said yes over text with no indent** — and the *operation* had
  already fixed exactly this in its range branch, with the reason written down.
  Its single-node branch never learned it, and handed back an `indentText`
  inverse, so undoing an outdent that had done nothing **added an indent the
  text had never had**. One body now, two ways of naming the same stretch.
- **The comparison is `meaning`, not `JSON.stringify`.** Undo a `toggleBold` and
  the run comes back carrying `marks: []` where it had no `marks` key: the same
  document, a different string. Before that was allowed for, **45** commands
  looked un-undoable — a finding so large it can only be the probe.

### The extensions had no self-test — measured 2026-08-29 *(harness written; 11 findings, all closed)*

Asked after a reader's question: *"shouldn't the extensions test themselves,
independent of Word, Slides and the site? Why didn't they?"* Both halves are
right, and the answer is worth keeping.

**They have tests. The tests are the wrong shape.** 97 commands, 22 test files:

| | |
| --- | ---: |
| commands registered in `packages/extensions` | 97 |
| never named in any test | 36 |
| test files that mock `commit` | 18 of 22 |

`setFontSize`'s is representative. It builds a **fake** editor, mocks
`transaction().commit()`, hands the command a good range, and asserts the
*operation it would have built*. It never loads a document, never applies
anything, never asks `canExecute`. So when its guard turned out to accept a
collapsed range — where `applyMark` commits and changes nothing — every one of
its tests passed, and **the passing tests are what made it invisible**.

**And the mechanism that catches this already existed.** `every-command-does-
something` runs a command over a real document and asks whether the document
moved. It had only ever been wired **per product**, so whether a command was
checked at all depended on whether Word's, the deck's or the site's probe
happened to reach it. The deck caught `setFontColor` doing exactly this months
ago; `setFontSize`, three lines away in a neighbouring file, survived because no
product had put a size control on a surface.

`packages/extensions/test/conformance.test.ts` is that check, wired where the
commands live: a real editor with all 50 extensions, the standard schema, a
document with one of most things in it. **136 commands — 113 examined, 0 findings, 23
cannot be asked**, and the third number is asserted as a ceiling so a probe that
stops setting things up fails rather than looking greener.

**Nine findings on the first run. Six fixed the same afternoon:**

- **`TextFormattingExtension`: `canExecute: () => true` on six commands** whose
  execute refuses without a range *and* without a value. Alive because they are
  registered through a private helper, so a sweep reading `canExecute:` at each
  command's own declaration never saw them.
- **`DocStructureExtension`: four inserts that drew nothing.** `hasContent: true`
  gave every node a **paragraph** as its empty content, and `docHeader`,
  `docFooter` and `endnoteDef` hold `inline*` — the schema refused the child,
  while the three beside them in the same table and through the same code worked.
  `chart` was the fourth: it *requires* a `values` attribute and nothing checked.
  Its seven guards were `() => true` as well.
- **`removeHeading`: `return true`** under a comment reading *"conservative
  default"*. 제목 해제 lit up with the caret in an ordinary paragraph.
- **`splitListItem`: asked for a range and not for a list item.** There is
  nothing to split outside one, and the operation knows that and quietly produces
  nothing.

**And then the last three, so the ratchet is gone rather than set to zero:**

- **`setFigcaption` only ever *added* a caption.** A `bFigure` holds at most one,
  so on a figure that already had one — which is every figure `insertFigure`
  makes — the schema refused the second and the command reported success. It
  works exactly once per figure and then silently stops, which is the subtlest
  of the nine.
- **`splitCell` over a cell that is not merged.** `splitTableCell` refuses one
  with the reason written into the operation: there is nothing to split. 셀 나누기
  lit up over every cell in every table.
- **`removeColumn` needed two ids and its guard asked for neither**, and would
  take the **last** column out of a `column+` besides.

Eight of the nine were a `canExecute` looser than its `execute` — the class
`guards.ts` names and the reason it exists.

Fixing them turned four into *unanswered*, because the probe's single caret was
in a paragraph. So the probe walks **every run in the document** now: 28
unanswered → 23, examined 108 → 113, and two more findings fell out of the five
it unlocked (`nextCell`/`previousCell`, now exempt with the reason — moving the
caret is what they are for, and only Tab past the last cell grows a table).

What is still unanswered is a **probe** gap rather than a product one, and it is
written down in the test: a find that has not been run, a menu that is not open,
history that has not moved forward, and six commands wanting a payload in a
shape nobody has written down yet.

Two things the probe itself taught:

- **A payload table is not cheating, and guessing at one is.** Six commands came
  back broken because the keys were guessed from the registration call
  (`spacing`, `height`, `shadow`) when the helper always uses `value`. A table
  that had kept guessing would have reported six working commands as faults.
- **A caret in a table cell was the wrong idea.** Nine table commands were added
  a selection state and nothing changed, because their guards take a `cellId` and
  never look at the selection at all.

### A panel with one row, and no way back up — measured 2026-08-29 *(fixed)*

Started by asking what the site builder's panel offers per block kind, in the
declaration and then in a browser. Select a paragraph and the whole 240px panel
holds **one** row — `종류 · 본문` — restating what the reader just clicked, over
six hundred pixels of nothing.

That is **not** a fault in the panel. The schema deliberately keeps width off
text blocks, and the recorded reason is right: the renderer that would read it
is `office-text`'s and a site does not own it, so "a schema that offers a reader
something nothing draws is worse than one that offers less." Two other readings
were tried on the way and both were wrong, which is worth keeping:

- *"138 frames for 137 flow blocks — the page is one wrapper per block."* No: 62
  of the 66 frames holding flow blocks set a `gap`. Stacking with a gap is a
  container's job, not a workaround.
- *"Give the flow blocks spacing and colour attributes."* That would have undone
  a narrowing the schema already made on purpose.

What was actually missing is the **second half of the schema's own sentence**.
It says where the decision does live — "text sizing is the stack's question,
asked one level up" — and nothing in the product said so or could get you there:

- **There is no *select what holds this*.** `Escape` was a `keydown` handler in
  the app, declared in no key map, so it was in no menu, printable beside
  nothing, and invisible to the harness. It climbed only while the reader was
  inside a **drill**; a selection made by a click, the layer list, ⌘A or a paste
  carried no scope. Measured: a paragraph seven levels deep, `Escape` → nothing
  selected, four times running.
- **`labelOfBlock` printed the stype for six selectable kinds** — `listItem`,
  `blockQuote`, `codeBlock`, `horizontalRule`, `textFrame`, `canvasBlock`. In
  the layer list and now in a panel row: English stypes in a reader's panel.
- **`every-drawing-can-be-named` could not see any of them.** It derives its
  list from the `scene` group, which is a canvas's answer written on the deck.
  Half a page is flow, so the check passed over four rows it exists to catch.
- **`PropertyPanel` had no data attribute at all.** A probe written to read the
  panel's rows matched the left rail's `aside` instead and reported two groups
  the panel has never had.

Fixed as a command (`selectParent`), declared in the key map and the menu, a
shared `PropertyLink` in `office-ui`, a `담는 곳` row that names the holder and
presses through to it, and `nameable` on the conformance input so a product can
say what a reader may select. Also `onApple()` moved into `office-ui` — the
sniff `keys.ts` refuses to do was about to exist twice in one app.

Two faults of my own found by a browser, both the same shape:

- **`return` one indent from where I meant it.** The refusal check went inside
  the `if (bound)` block, so it returned from the whole handler and `Escape` at
  the top of a page did nothing rather than falling through. It belongs in the
  condition — whether the binding *applies*, not a branch inside it.
- **Two mechanisms on one key.** After the command climbed out, the scope left
  over from a drill made the next press re-select the scope instead of clearing,
  so `Escape` stuck one level short of nothing. The app's half is now only *let
  go of everything*, which is all it still has to do.

### White on white, in all three products — measured 2026-08-28 *(fixed)*

The suite ships a dark theme. Nothing in the repository asked a single question
about it: across three apps, **zero** tests mentioned `colorScheme`. What that
cost, found by opening each product in a dark browser and comparing:

| Product | In the dark | Why |
| --- | --- | --- |
| Word | the whole document unreadable | the flow inherited `--ou-ink` over a `#fff` sheet |
| Site builder | **every heading** unreadable, 57 elements at 1.04:1 | boards are `--ou-board`, and nothing said what was written on them |
| Deck | every bullet and table cell, 23 runs | `body { color: var(--sl-ink) }`, inherited past a comment saying this file stops at the slide's edge |

One fault, three times, and the same shape each time: a **background** that
correctly stays paper-coloured in both themes, and **nothing at all** saying what
colour the words on it are. Each product got the first half right, which is why
it survived — a rule half-written looks like a rule.

The missing half is now a token, `--ou-board-written`, deliberately absent from
every dark block. **The chrome follows the theme; the paper does not — and
neither does the ink on it.**

Three things this turned up that were not the fault itself:

- **The obvious probe is wrong on a canvas.** Walking up from a word to its first
  painted ancestor and comparing luminance reported 75 unreadable elements in a
  Word document that reads perfectly and 3 in a deck card that is white-on-green.
  Word's sheet is drawn *behind* the flow and a deck's card is a rectangle with
  its text placed *over* it — on a canvas, what is behind a word is not among its
  parents. The check that works asks whether a colour **moved between the two
  themes**, which needs no ancestry and is exactly the rule.
- **The same mistake put the first fix on the wrong selector.** `color` went
  beside `background` on `.w-sheet`, which changed nothing, because the sheet is
  not an ancestor of the text either. A CSS rule written from the intent rather
  than from the tree.
- **"The deck is the good one" was a claim about the chrome.** It was written
  down in these notes as a claim about the product, and the check added to
  confirm it failed on its first run.

And one product gap, found in the same pass and from the other direction: the
sample's closing band paints itself near-black and its heading was near-black
too, 1.06:1, in **both** themes. Not a theming fault — the band had no way to say
what was written on it, because the panel offered a 배경 row and no 글자 row. A
builder could paint a section dark and had no control that made the words light;
the only way was to select each run. That is `ink` on a box now, inherited, so
one statement reaches everything added to the band afterwards — which is what the
sample's own author had done run by run, and missed one.

Guarded by `word-theme.spec.ts`, `site-theme.spec.ts` and `slide-theme.spec.ts`.
Each was checked against the un-fixed source: Word's fails on 25 words.

### The chrome, measured — 2026-08-30 *(fixed, and now a check)*

Four things separate a tool from a mock-up that a **measurement** can answer, and
every one of them found something the eye had walked past for weeks. Asked of
every control in the app's own chrome — 108 of them — with the boards left out,
because a reader's page is not this product's design.

| | |
|---|---|
| a target a pointer can hit | **3**: the width switches were 22×20 |
| a name a screen reader can read | 0 |
| ink a reader can see | **5**: the rail's tabs at 4.3:1 |
| a ring the keyboard can follow | **8**: six swatches, a clear, the zoom field |

**`--ou-muted` was chosen against the wrong surface.** `#737373` is 4.74:1 on
white — over the 4.5 a reader needs — and 4.35:1 on `--ou-ground`, which is where
most of it is actually drawn: a rail's unselected tabs, a panel's row labels, a
chip's caption. It is `#6b6b6b` now, which answers both. The dark theme's was
already 7.11:1.

**A swatch takes `CONTROL`, which answers focus by drawing the border in the
accent** — a field's rule, and the right one for a field: one pixel of accent
where the caret is. A swatch is a *button* whose border is a hairline around a
filled square, so the accent landed on the part of the control a reader is least
likely to be looking at. `STATE` as well, which every other button has.

**Two ways the measurement itself was wrong first**, both worth keeping:

- It read the whole document and reported eleven faint controls, **six of them
  the reader's own page** drawn on the boards. A check that reports somebody
  else's design is a check nobody can act on.
- It called `el.focus()`, which does not raise `:focus-visible` — so it reported
  nine controls with no ring that all have one. **Tabbing is the only honest way
  to ask**, because tabbing is what a reader does.

`chrome-is-a-tool.spec.ts` asks all four now.

### Found walking the site builder in a browser

- [ ] **A feed is the other thing the address unlocks.** A blog page draws a `collection` over a
  dataset, which is exactly the shape an RSS or JSON feed is made of — and `Published.files` is now
  the place a second site-level file would go. What it needs that nothing here has is a **date** per
  row, which is a dataset column rather than a schema field.


- [x] ~~**`PropertyNumber` in `office-ui` is called by nobody.**~~ **Wrong, and corrected within the
  hour** — it is called by the deck's `component-panel.tsx` and `deck-dialogs.tsx`. What is true is
  narrower: `PropertySheet` renders `NumberField` *directly* rather than through it, so a change to
  the wrapper does not reach the panel, which is how the wrong conclusion was reached. The reason it
  could not use it was real — the wrapper had no `onClear`, `min` or `max` — and it does now, so
  there is one path. See Done.

  Kept rather than deleted because the *mistake* is instructive: "I edited it and nothing happened"
  is evidence about one caller, and it was written down as evidence about all of them. The count that
  settled it took thirty seconds and should have come first.


- [x] ~~**Three rail panels have no group headings.**~~ **Not a finding.** 페이지, 컴포넌트 and 구성
  hold **one** list each and 추가 and 데이터 hold **two kinds** — so they are not lists of the same
  shape, and a heading over a single list repeats the tab above it. Written down as a finding and
  withdrawn on the second look, which is what the second look is for.


- [ ] **A pasted block that names a component or a dataset carries neither.** Within one document
  that is fine — the definition is already there. Across documents it is the gap the deck already
  solved (`cardsFor` / `pasteCardsPlan`): a payload is a copy of a *name*, and pasting one into a
  fresh site gives an invisible empty box with nothing saying so. The payload is versioned by its
  marker, so the fix is additive.

- [x] ~~**The bands measure and cannot be dragged.**~~ **They can be pulled now.** The number beside
  them in the panel was where a padding was changed, so a reader looking at the band had to look away
  to change the thing they were looking at — and the whole argument for drawing the band is that
  *how much* is the question. Answering it and then sending them elsewhere to act is half a tool.

  Four things it needed, and three of them were found by the drag not working:

  - **Every side gets a band, drawn or not.** It was `pad > 0`, so a section with no padding had no
    band — and a band with nothing in it is the one a reader most wants to pull. A zero side draws
    as a 3px hairline, fainter than a measurement because it is an offer rather than a fact.
  - **The bands take the pointer** (they were `pointer-events: none`), and **the number does not**:
    it sits in the middle of the band it measures, so it caught the press meant for the band.
    Measured as a drag that started on `<em>48</em>` and did nothing at all.
  - **Twips, not pixels.** The band is read out of `getComputedStyle`, so it is CSS pixels; the
    document keeps twips, which is why the panel's own field multiplies by 15. Written in pixels the
    first time and the document took a `0`.
  - **Inward is bigger.** A padding band is drawn *inside* the block, so its far edge is the one that
    moves: pulling the bottom band **up** grows the bottom padding. With the opposite sign a bottom
    band pulled down came out as less, and less than none is none.

  Written **once, on release** — the drag moves the drawing and the document hears about it when the
  pointer comes up. Word learned that on its ruler: writing on every pointer move made one drag into
  ten entries of the history, and a reader's undo then walked back through positions the box was
  never meant to be in. The test asserts the count, not just the value.

  A **gap** is deliberately not draggable: it is the space between two children and belongs to
  neither, so pulling one would have to decide which child moves — a question the drag cannot answer
  and the panel's `gap` field can.


- [x] ~~**A corner wants a drawing, not a word.**~~ **Drawn.** 상좌/상우/하우/하좌 was honest and it
  was four words where every design tool draws four pictures — and the version before it was
  `↖ ↗ ↘ ↙`, four arrows standing in for four drawings, which is an icon made out of a character.
  Eight now: the four corners and the four sides of a padding, in `office-icons`, and the **first
  pictures in that package that are not a library's**. `lucide` has nothing that means *this corner
  of this box* — its one corner icon is a single shape and its padding icons say *padding* rather
  than *which side*.

  Deliberately the same drawing eight times over with one part filled in: a reader picking a field
  out of eight is matching a shape, not reading a diagram. The 16×16 box and the 2px stroke are
  lucide's, so a row of them sits with the rest of a toolbar rather than beside it.

  The second surface arrived the same afternoon rather than later — the deck's panel spells the same
  eight (왼쪽 위, 위, …) and takes the same pictures. Two products, one set.

  What it needed underneath: `PanelRow.icon`, so a *field* can carry a picture the way a choice's
  options already could, and `NumberField.prefixIcon`, because these four share one row and one
  label — the shape every inspector draws a box's four sides in — so each carries its own short name
  **inside** its field, and that is where the drawing goes. The label stays as the fallback and
  `ariaLabel` is still the accessible name: an icon with no name is the fault this replaces, not a
  new one.


### A surface can name a command that does nothing

- [x] ~~**`find` and `findAndReplace` are registered by `editor-core` as `execute: () => true`.**~~
  **The headline was wrong and this entry's own last paragraph said so.** `editor-core` registers no
  `find` at all, and `FindReplaceExtension` has been a complete implementation since the day it was
  written — measured: three matches found in a two-paragraph document, all three replaced correctly.

  What was true is smaller and stranger: **nothing installed it.** Not Word's kit, not the deck's,
  not the site's, and not `createDefaultExtensions` — which from a keyboard is indistinguishable
  from reaching a stub. The symptom was recorded honestly (편집 › 찾기 lit up, ran, drew nothing) and
  the cause was guessed, written down, and then quoted for months: Word's key map took ⌘F out over
  it, the site deleted its 찾기 entry over it, and `every-command-does-something` opened by naming
  it as the fault that check was written for. All three are corrected.

  And the reason nothing installed it was in the last paragraph too: **it drew its own panel.**
  `document.createElement`, `position: fixed`, `background: white`, `#e2e8f0` borders, appended to
  `document.body` — a shared model package building UI, in a repository whose whole shape is that
  `office-ui` draws and the packages below it do not. It could not be themed, placed or styled by a
  product, and would have been white-on-white in the dark theme all three now honour.

  The highlighting told the same story from the other end: `_highlightMatches` was an **empty
  method** under a comment saying the drawing was *"deferred to the DOM layer"*. A search found
  twelve matches and showed the reader none of them.

  It is a search and a place in it now, with no DOM. `findNext` and `findPrev` move through the
  results by **moving the editor's selection onto the match** — which is what every editor of this
  kind does, needs no injected layer, and makes the match a thing a reader can act on rather than
  look at. A product draws the panel it wants and reads `state`.

- [x] ~~**Nothing checks that a surface's command does anything.**~~ `every-command-does-something`
  — see Done. It found four in the site builder (all exempt, all application-level) and **nine in the
  deck**, seven of which look like real faults.


- [x] ~~**Word and the deck type their menu hints.**~~ All three derive them now — `withHints` in
  `office-controls`, and each product's own `menu-model.test.ts` holds the derivation. Written as an
  open item and closed in the same commit that opened it; kept because the *finding* is the entry.


### A check for a `canExecute` that is looser than its `execute`

Four in one sweep, all the same shape and none of them visible:

| command | said | did |
| --- | --- | --- |
| `moveBlockUp` / `moveBlockDown` | *there is a selection* | needed a **range**, returned false to a console |
| `copy` | *there is a range* | wanted one with **something in it**; copying nothing emptied the clipboard |
| `removeLink` | `() => true` | a mark covers a range; taking one off a caret changes nothing |

A `canExecute` looser than its `execute` is **worse than one that is wrong**, because the product
looks like it works: the control lights up, the reader presses it, and nothing happens. And the
harness cannot see it — `every-command-can-be-reached` asks whether a command is *reachable*, never
whether it is telling the truth about when it can run.

- [ ] **The check, and why it is not obvious.** The naive version — run every command in every state
  and compare — is not available: running a command *changes the document*, so a probe would be
  measuring a moving target and would need a fresh editor per command per state. The tractable shape
  is narrower and still catches all four: for each command, in a handful of **named states** (nothing
  selected, a node selected, a collapsed caret, a range), assert that `canExecute` and a *dry* run
  agree. That needs commands to be able to answer "would you do anything" without doing it, which
  most cannot — so the honest first version may be a **list of states each command claims to need**,
  declared beside it, with the check comparing the claim against `canExecute`.

  Worth doing: this is the third class of fault this repository has found that every part of works.
  The first was *declared and unread*, the second was *lists of the same shape with different
  answers*, and this is *a control that lies about itself*.

### `editor._viewDOM` is one slot — swept, and the engine is clean

Recorded as a limitation, then found to be the cause of a large fault (see Done). Swept afterwards
rather than waiting for the next symptom, since anything on the editor that a *view* should own is
wrong the moment a document is drawn twice — and the site builder draws every page four times.

**Nothing else.** Two live readers in the engine, both in `selection-handler.ts` and both already
preferring `this.view`; the slot's own assignment; and `__lastInputDebug`, which is a debug field.
`devtool` and `auto-tracer` read it and are not the product. Recorded as a *result* rather than left
as an open worry.

### The same eye on the deck's and Word's lists — 2026-08-28

The site's sidebar work found three of its four gaps by **putting the lists side by side** rather
than by anything reporting them, so the three products' own lists got the same comparison.

The deck came out **better than the site did**, which is what a product two rounds older should look
like: a slide can be made, duplicated, deleted and moved; a document variable can be made, renamed
and removed; a layout has a name and a background a reader can set. One gap, and it is now closed
(see Done). Word has no resource lists at all — its panes are an outline and comments, both of which
are views of the document rather than lists of things a reader makes.

- [ ] **A check that asks it.** Three of the four gaps this whole sweep found were *"lists of the
  same shape with different answers"*, and the harness cannot see that: it asks whether a command is
  reachable, never whether a list offering three of four acts has a reason for the fourth. It would
  need what the toolbar, the panel, the menubar and the key map all needed — a declaration of what
  each list offers — which is a fifth surface model. Worth it the day a fourth list appears;
  recorded now so the shape of the question is not lost.

### The sidebar, measured — 2026-08-28 *(worked through)*

Five tabs, and what each can do:

| tab | what it offers | what it does not |
| --- | --- | --- |
| **추가** | 15 inserts, each with a picture | — |
| **구성** | a tree: open/close, select, hide, lock, drag to reorder or reparent, **rename in place** | — |
| **페이지** | list · 위로 · 복제 · 삭제(asks first) | 아래로; reorder by drag |
| **컴포넌트** | list · 놓기 · 편집 · **이름** · **삭제**(refused while placed, and says why) | where-used |
| **데이터** | list · 만들기 · **복제**; rename and delete in the data editor | — |

The **구성** list is the one that was a selector where every other builder's is a manipulator, and
the first half of that is fixed (see Done). What is left, in the order a reader would miss it:

- [x] ~~**2 · 3. Hide and lock a block.**~~ Built — see Done.

- [x] ~~**1. Reorder by dragging a row.**~~ Built — see Done.




- [x] ~~**5. The three lists that only add.**~~ The component library can be renamed and cleaned out
  now — see Done. 데이터's rename and delete were already there, **inside the data editor** rather
  than on the rail row, which is where a dataset is edited and is defensible.


### The chrome, looked at as a professional tool would be — measured 2026-08-27

Three products on one shared chrome package, screenshotted at 1600×1000 and counted.

| | Word | 덱 | 사이트 |
| --- | --- | --- | --- |
| toolbar controls, one flat strip | **71** | **60** | 19 |
| toolbar rows always on screen | 2 | 2 | 1 |
| application-level commands (파일/보기/도구) | **0** | **12, as title-bar buttons** | **0** |
| keyboard shortcuts bound | **72** | 21 | 6 |
| places a reader can *see* a shortcut | tooltip only | tooltip only | tooltip only |
| menubar | — | — | — |

**The finding that is not a matter of taste: the site builder cannot export.** `exportSite` renders
every page and it is reachable from `window.exportSite` and from tests, and **from no control in the
product**. A site builder that cannot publish is not finished, and the reason nothing caught it is
worth as much as the fault: `every-command-can-be-reached` counts *commands*, and this is a function.
A capability that is not a command is invisible to the harness.

**And the deck has already grown a menubar, without having one.** 새로 만들기 · 저장 · 열기 ·
라이브러리 · 템플릿 · 크기 · 레이아웃 · 검사 · 지도 · 발표 · 스크롤 상영 · 전체 보기 — twelve
application-level commands as equal-weight text buttons in the title bar, because there was nowhere
else for them to go. That is the shape a menubar takes when a product does not have one, and it is
evidence rather than opinion: the same twelve are *missing entirely* from the other two products.

- [x] **1. A menubar, in all three products, beside the toolbar rather than instead of it.** Built.
  See Done.

- [x] **1a. The deck's twelve title-bar buttons retired into it.** Ten of them; 발표 and 전체 보기
  stayed. See Done.


- [x] ~~**1c. 새로 만들기 · 저장 · 열기 are not in the deck's 파일 menu.**~~ They are — `FileActions`
  publishes them through an imperative handle and keeps the picker's input, which is the one part
  that cannot move. See Done.

- [x] **1b. The site's toolbar stopped carrying what is not a tool**, and its menubar grew from 11
  entries to 33. See Done. Word's and the deck's toolbars are still what they were.


- [x] ~~**1b-ii · 4 · 6**~~ — the toolbar's object actions, the panel's truncated widths and wrapping
  clear buttons, and the insert palette. All pictures now. See Done.

- [x] ~~**1b-iii. The 링크 row is a property on a toolbar.**~~ It is contextual now — see Done.

### A frame has one border, not four sides

- [ ] Found writing the blog page's list of posts: a row of posts wants a **hairline between rows**,
  and `stroke` draws all four sides — so ten posts is ten boxes. Word's blocks have `borderTop`…
  `borderLeft` and a frame has one `stroke`, which is the canvas's word for an outline. A page needs
  the block's reading, and the sample says so by using no rule at all for now.

### The viewport is a plane now, not a scrolling pane

- [x] A reader said the zoom still pinned the top-left corner, and they were right: a scrolling pane
  can only hold a point still while it has scroll to give, and a builder **opens fitted** — scroll
  zero in both axes. `useWheelZoom`'s own comment says it gives way at the edges; that edge is the
  opening view. Zooming *out* from a fit can never be anchored at all, because the correction it
  needs is negative.

  `useViewport` holds the plane's own offset and scale and draws `translate(x, y) scale(z)`. The
  arithmetic is exact — `x' = px - (px - x)·(z'/z)` — with nothing to measure afterwards. A plain
  wheel pans, shift swaps the axis, ⌘ zooms about the pointer, space or the middle button drags.

- [x] **Selection chrome no longer shrinks with the page.** The overlay lives inside the scaled
  plane, so at 40% a one-pixel outline was 0.4 of a pixel and the name chip was unreadable — worst
  exactly when a reader has stood back to see more. Every measurement is now divided by `--st-zoom`
  and the chip is counter-scaled.

- [x] And a fit that fitted the wrong thing: the opening view took the plane's **height** into
  account, and a page is as tall as it turns out — measured, a 5,000px plane in a 928px pane put the
  boards at **0.19**, a fifth of their size, with every click landing 8px from a corner on whatever
  happened to be there.

- [x] The caret is drawn in the brand colour. A browser draws it one CSS pixel wide in the text's own
  colour, and on a canvas at 70% that is two-thirds of a grey pixel among grey lines.

### The engine has a selection layer and the site draws its own

- [ ] `EditorViewDOM` builds five layers in every view — content, decorator, **selection**, context,
  custom — and the site builder uses none of them: it draws `.st-overlay` beside the board and puts
  its outlines, name chips and drop line there. Two systems both claiming "the layer over the
  document", and only one of them is the engine's.

  It is not a straight swap. What the site draws is a *builder's* chrome — what a click would select,
  what a drag would do, which block a name belongs to — and it needs the product's hit-testing, which
  the engine's layer knows nothing about. But the split should be decided rather than inherited: a
  text selection and a caret are the engine's, and a block outline is the product's.

  Either way the layer sits **inside the scaled plane**, so both scale with the zoom. That is fixed
  for the site by dividing every measurement by `--st-zoom`; a layer outside the plane, in the pane's
  own coordinates, is the other answer and the one Figma takes.

### One document, three views, and one browser selection

- [x] **The caret went to a board the reader was not in.** Reported in one sentence — *"entering text
  on the desktop board puts the caret on the mobile one"* — and it is the fault every other input
  oddity in the site builder turned out to hang from.

  There is one `document.getSelection()`. Every view hears `editor:selection.model` and wrote it in
  turn, so the **last view mounted** won; and `DOMSelectionHandlerImpl` scoped its element lookups to
  `editor._viewDOM`, which is one slot on the editor holding — again — the last view made. So a
  caret meant for the desktop board was looked up inside the mobile board's copy of the same node and
  set there.

  Two fixes, both narrow: a selection handler belongs to **its** view, and only the **focused** view
  writes the browser's one selection.

- [x] What it was causing downstream, measured with a real composition through CDP: typing Korean
  into an existing sentence destroyed it from the second syllable, because the caret was in another
  view, the render re-anchored what it found, and the next commit replaced 68 characters. With the
  two fixes the sentence survives.

- [ ] **A residue, and it is not clean yet.** Under the same synthetic composition the second
  syllable lands *before* the first (`나가` rather than `가나`). It may be the simulation rather than
  the product — CDP's `imeSetComposition` is not an IME, and the same sequence leaves a jamo behind
  that a real IME would replace — so it needs checking by hand with a Korean keyboard before anything
  is changed for it.

- [x] And a smaller one on the way past: the IME path **announced** a selection change without
  setting it (`emit` where every other path calls `updateSelection`), so the model kept the range the
  replace transaction had left while the DOM held the caret.

- [ ] **`editor._viewDOM` is one slot.** The scope fix works around it; the model is that an editor
  has *a* view. Three products draw one document once each, and the site builder draws it three
  times — the slot should be a set, and anything reading it should say which view it means.

### The studio was measured after a reader said it did not work

Five reports, each of which turned out to be measurable in a line or two, and none of whose causes
were where the symptom was:

- [x] **"확대 축소가 제대로 되지 않는다."** Two faults at once. The three elements above the shell had
  no height, so `AppShell`'s `h-full` resolved to `auto` and the **window** scrolled while the pane
  never did — measured, a pane 3280px tall inside a 1000px viewport. And a `transform` does not
  change layout, so the pane's `scrollWidth` was the same number at every zoom: the boards drew wider
  than anything a reader could scroll to. A room sized `natural × zoom` around the scaled plane is
  what every infinite canvas does and what this needed.

- [x] **"확대할 때 selection 위치가 맞지 않는다."** It was the same fault: the marks were right and the
  thing under them could not be scrolled to. Held now by a test that presses ⌘ six notches in and
  asks for the distance between the outline and the block — one pixel of rounding, no more.

- [x] **"캔버스의 글자가 너무 작다."** A heading on the page was **12px**. Tailwind's preflight resets
  `h1…h6` to `font-size: inherit` and the app's body is the chrome's 12px, so every board drew a page
  in panel-label type. The published page had the opposite fault from the same cause — no scale at
  all, so a browser applied its own. `PAGE_CSS` is one string used by both, with **container**
  queries rather than media queries: a 390 board inside a 1600 window has to get the phone's type.

- [x] **"텍스트 편집 상태가 아무것도 표시되지 않는다."** Entering the words clears the node selection —
  rightly — and the marks draw from that selection, so a reader in text mode saw nothing at all. The
  overlay remembers the block it entered and draws a dashed edge with the way out on it.

- [x] **A zoom with no pointer** — a button, a typed percentage, 맞춤 — anchored the plane's top-left
  corner, so the page a reader was reading left the window. `useWheelZoom` holds the previous
  rectangle and anchors the middle of the view when there is no pointer to hold.

### The sample was rebuilt to be looked at, and the tool around it with it

- [x] The sample is a **designed site** now rather than a fixture that happened to render: ink and
  paper with one accent (a deep green, because the blue it was is the colour every developer tool
  reaches for), one radius scale, a rhythm of 96/64 rather than one padding everywhere, a navigation
  bar whose ends are pushed apart, cards with a shadow, a hero with a texture behind it, and a single
  dark band at the foot of each page instead of stripes down it.

  It is also where the four schema gaps came from: none of them was found by reading the schema.

- [x] The **chrome** was measured against the tools it competes with and four things read as
  unfinished. A board wore its name in a grey bar *inside* the white; the studio was a blue grey,
  which is the surface a designer's blues were being judged against; every region was fenced with a
  border, so one window read as six; and selection was two pixels of solid accent with a
  hand-picked second blue for hover. The studio, the board and its shadow are **suite tokens** now,
  because a deck and a page builder are looking at the same kind of room.

- [x] And a defect the rewrite found: a comment had been pasted **into the middle of a selector**, so
  `.st-mark-hover` merged with the rule after it and every name chip was painted the hover blue. The
  selected block's name had never used the accent.

- [ ] **The deck's chrome has not been through this.** It maps its own `--sl-*` palette and draws its
  own studio at `#1f2126`; the tokens it would now take are `--ou-studio`, `--ou-board` and
  `--ou-board-lift`. Word has no studio at all and will want one the day a drawing is edited on a
  canvas rather than in the flow.

- [x] ~~**A site has no motion, and a landing page is mostly motion.**~~ **Stale for a while** — a
  page has had scroll arrivals since `reveal.ts`, five of them, in pure CSS with no script in the
  export. Written before that landed and never struck out, which is the note-that-rots this file is
  shaped around, in the file itself.

  What is genuinely left of motion, now that the item has been looked at rather than reread:

- [ ] **A reveal scrubs; it cannot fire once.** A scroll-driven animation is tied to scroll position,
  so scrolling back up plays it backwards. That is what the Apple-style pages do and it is not what
  most builders mean by 등장. Fire-once needs a trigger, which needs a script or `animation-trigger`
  — too new to publish against. `reveal.ts` says so in its own header; this is the entry that would
  have to change when the browser catches up.

- [ ] **Where the arrival happens is chosen, not offered.** `entry 0% entry 70%`, one range for every
  page length. It is the knob a designer wants second — after which kind and after 차례로 — and the
  cap the stagger discovered (thirty points of headroom) is the constraint any control here has to
  respect.

### A page can be painted, and two limits that turned up with it

- [x] A box on a page had a flat colour, a line and one radius — a diagram's vocabulary, which is
  the same gap the deck found in `fill` and answered with a paint stack. A page now takes a
  **gradient**, a **picture behind** with its own opacity, a **shadow** and **four corners**, and the
  attribute names are the deck's *exactly*: two products spelling one idea differently is the fault
  this repository keeps finding in itself, one word later.

  The arithmetic is not shared and cannot be as it stands: the deck computes a gradient's axis
  against a box whose size the document states, and a page's box has neither until the browser has
  laid it out. `office-site` must not import `office-slides` either — two products depending on each
  other is how a shared layer stops being one.

- [ ] **These names are now declared twice.** Two is a coincidence, three is a component nobody
  wrote: the day Word wants a gradient on a canvas frame, `gradientFrom`…`cornerBottomLeft` move to
  `office-canvas` beside `isVarRef`, and each product keeps its own CSS.

- [ ] **`every-property-can-be-edited` counts rows, not panes.** A row declared under 모양 for a
  `surface` was in a pane a reader can never open — a page is never in a selection — and the check
  called it settable. The product's answer is that 페이지 holds everything a page can say; the
  check's is still owed, and `paint.test.ts` asks the question the way a reader meets it.

- [ ] **An override carrying `var:이름` leaks into the exported CSS.** `mediaRules` writes the
  narrower widths' declarations without resolving a token, because resolution happens in the
  renderer and a media rule is not rendered. Nothing in the sample does it yet, which is why it is
  a note rather than a bug report.

### A page is a thing a reader can make now

- [x] `insertPage`, `duplicatePage`, `movePage`, `removePage` — the four a page had none of. The
  sample's five pages were five pages because `sample-site.ts` wrote them in TypeScript, which is the
  same finding the datasets produced and the same shape: the *view* was finished — five pages drawn
  at three widths, a rail listing them, a panel that renames one and changes its address — against a
  document only a developer could change.

  They live in the **rail's list**, and that is the decision worth keeping: a page is not a
  selection, so a toolbar button acting on "the page" would act on something a reader cannot point
  at. The list is where a page is a thing with a row.

  A new page arrives wearing the header and footer of the page it follows — as *placements*, so
  editing the header still changes it — and one heading to type into. `insertSlide` settled the same
  question for a deck, and a site is more so: every page carries the same navigation.

  Removing one is the only act in this product that asks first, because what it costs is not on
  screen: `linksTo` counts the links into that page and the dialog says the number.

- [ ] **The link count does not say that one link can be a whole navigation.** Deleting 제품 breaks
  one link — and that link is in the `site-header` *definition*, so it is drawn on all five pages.
  Counting marks is the number that can be checked and the one `linkFaults` reports; what is missing
  is telling the reader *where* the link lives, which for a definition is "everywhere".

### A copy kept the words and dropped what covered them

- [x] `copyOf` reproduced `stype`, `attributes`, `text` and children — and **not `marks`**. Five
  gestures share it: duplicating a slide, pasting cards, taking the placeholders out of a layout,
  and making a component out of a block a reader has already built. Every one of them promised "the
  same thing, somewhere else" and returned the text in the wrong weight, with no colour and no link.

  Found while reading it for something else, and it is worth being specific about *why nothing
  caught it*: the words are identical, and a mark is not a node — so every check in the suite,
  which compares nodes or compares text, passes either way. `every-mark-is-drawn` was written a day
  earlier for the same blind spot one layer up.

### A page links to a page — and two things it turned up

- [x] A link stores `page:<id>` and the address is resolved where the mark is drawn, so renaming
  `/제품` to `/products` moves every link into it rather than breaking them silently. The fourth
  reference of this shape in the schema, after `var:이름` for a colour, `componentId` for a
  placement and a dataset's `name` — and the reason the export publishes a real `href` without a
  second resolver: `exportSite` draws through the same renderers the editor does.

  The sample now navigates: four `<a>` elements where there were four words that looked like links.

- [x] ~~**No command removes a page, and none changes a page's id.**~~ Done and the box was never
  ticked, which is its own small lesson: `insertPage`, `duplicatePage`, `removePage`, `movePage` and
  `setPageInfo` are all in `page-commands.ts` and all four are in the 파일 menu. Found while
  answering "is the site builder finished" — an open item that is closed reads exactly like one that
  is open, which is the same failure as a check nobody runs.

- [x] ~~**`linkFaults` has no reader-facing surface.**~~ Nor did the other two. The rail has a footer
  now — see Done. The entry was right about the shape of it and understated the size: *nothing* ran
  any of the three over a real document.

- [x] ~~**A link out of the site still has no control.**~~ `linkToAddress` is a command, declared in
  `toolbar-model.ts` and drawn as a field beside the page picker. The drawing end had been finished
  the whole time — `hrefFor` passes a non-`page:` href straight through and the export writes it —
  so the gap was one field wide and no check could see it: a command nothing offers is not a command
  a surface got wrong.

  Three things it turned up:

  - **`addressFor` is why this is not one line.** A reader types `barocss.com`, which written into an
    `href` unchanged is *relative* — followed from `/제품` it goes to `/제품/barocss.com`. The link
    draws, it is clickable, it looks right, and it is wrong only when somebody follows it. What is
    left alone is as important: a scheme, a root-relative path, a fragment and a protocol-relative
    address are all deliberate, and prefixing them would break the three most useful ones.
  - **링크 없음 would have greyed over the new link.** The ribbon asked `pageLinkOf` two questions —
    *which page* and *is there a link* — which agreed for exactly as long as a page link was the only
    kind this product could write.
  - **`isPageRef` was typed `href is string`.** So the *false* branch of a call on a known string
    narrows to `never`, and the first function to ask "not a page reference, then what kind of address
    is it" could not call a method on the answer. `page:${string}` leaves a string a string.

- [x] ~~**A reader cannot set the size or the colour of the words.**~~ The third of this shape in two
  days: `FontSizeExtension` and `FontColorExtension` are installed by this product's kit and have
  been since it existed, all four commands work, and **no surface anywhere offered one**. The sample
  uses both twenty times through helpers written by hand — a reader of this product could not make
  the page it ships as its own example.

  It is a **pane**, not two toolbar buttons, because of what the panel did instead: select some
  words and it showed the *page's* background and shadow under a sentence asking the reader to
  select a block, at the moment they had selected the most specific thing in the document.

  Four things it turned up:

  - **`setFontSize`'s guard was looser than its execute.** `canExecute` accepted a collapsed range;
    `applyMark` over zero characters commits and changes nothing. That is the class `guards.ts` was
    written for and these two were missed when it was applied to the nine beside them.
  - **`unit: 'px'` meant two things at once** — *print px* and *the document stores twips*. Every
    length in this schema is twips so they never came apart; a mark's size is a CSS length, and
    through the twips arithmetic a reader typing 44 would have written `660px`.
  - **`as never` on a partial `Shown` blanked the whole app.** `PropertySheet` asks
    `shown.overridden.has(...)` per row and an undefined `Set` throws during render, which React
    answers by unmounting. A cast is a promise, and that one was false.
  - **Two rows were about to share an accessible name.** A block's `ink` and a run's colour were both
    글자 색; `calls no two rows the same thing` caught it the minute the row was declared, and both
    names are more precise now than the one they collided over.

- [ ] **`every-command-does-something` can ask about 31 of 44, and the 13 are worth naming.** The
  probe sets up one state — a block selected, the page named — and that is one of the **two** a
  builder has. Adding a range over some words took it from 24 asked to 31: the whole link group and
  all four mark toggles had been in the *could not be asked* column, silently, and `linkToAddress`
  went straight into it the day it was written. What is left is a payload gap rather than a state
  one: `setBlockFormat` — the command **35 panel rows** write through, the busiest in the product —
  cannot be asked because the probe has no attribute to give it. Same for `setPageInfo`,
  `setSiteAddress`, `bindPartText` and the three `component*` writers. `undo`, `redo`, `pasteBlocks`,
  `selectParent` and `moveBlockUp` are honest `null`s: nothing to undo, nothing on the clipboard,
  nothing above the first block on a page.

- [ ] **The fault list reads and cannot repair.** A row goes to the block and the reader fixes it with
  the ordinary controls, which is the honest first version — but the commonest fault by far has one
  obvious repair (*point this link at another page*) and the picker that would do it is already on the
  toolbar. A row with a fix on it is the second version, and it is worth waiting for a second kind of
  fault that has one, so the mechanism is not designed around a single case.

- [ ] **`documentFaults` names two different lists.** `editor.documentFaults` is the **core**'s — what
  `validateTree` says about a loaded document, a `TreeFinding[]` with a `path`. `documentFaults(doc)`
  is this package's — what is wrong with a site a reader is building, a `Fault[]` with a `sid`. Both
  are "what is wrong with this document" and neither knows about the other, and the rail draws one of
  them while `loadDocument` records the other and nothing shows it. Two lists of the same shape with
  different answers, which is the check at the top of this file, found in the file that implements it.

- [ ] **Word and the deck have no such surface.** The rail's footer is the pattern — a status line
  that says the check ran, quiet when there is nothing to say — and it wants to be `office-ui`'s the
  day a second product draws one, not before.

### Editing a definition is pointing the boards at it

- [x] A board takes a `rootId` and draws whatever node it names — the mechanism that draws one page
  at three widths — so a component editor is that, aimed at the definition's **part**. A `component`
  itself has no renderer (a definition is never drawn where it is kept), and its part is an ordinary
  frame. Nothing else in the window changes: the same rail, the same panel, the same selection,
  because the thing being edited is a stack either way.

  Three faults on the way, each of which only a browser could have shown:

- [x] **A destroyed view left its layers in the container.** `cleanupLayers` emptied and *cloned*
  them, which removes their listeners and leaves five divs behind — so a second view appended five
  more and the board held two content layers, one live and one an empty shell. Every query written
  against that board had a one-in-two chance of reading the dead one. React's strict mode is what
  surfaced it, by mounting and unmounting an effect. **A view that is destroyed and one that was
  never created should be the same thing.**

- [x] **A replaced element was diffed against the vnode it replaced.** One board drew a page and was
  then pointed at a definition: a `surface` declares `display: flex` and so does a `frame`, the
  element was replaced because the tag changed — and the new one came out `display: block` with every
  *other* declaration in place. Skipping an unchanged property is right for an element being kept and
  wrong for one that has just been made, because a new element has none of it. Three unit tests in
  `renderer-dom`, for a root and for a child.

- [x] **A board's root is never selectable, and inside a definition that is the one stack a reader
  wants.** The root plays the page's role — a selection whose only meaning is "everything" is what
  clicking nothing already means — so the definition's own padding, direction and colour could not be
  reached at all. Fixed without a new flag: the pointer walks from the `component` one level above
  the part, so the part is an ordinary child. The **drawing** root and the **walking** root are two
  different questions, and the rail needed a third — where a new block *lands* — because a paragraph
  put among a definition's declarations is a transaction that silently does nothing.

### An index that exported only one kind of thing, and a name with two meanings

- [x] Following the merge, `operations/index.ts` was written to export the **builders** — and the app
  went white. `buildTableGrid` was gone: the old `operations-dsl/index.ts` had been reaching back
  across the fence with `export * from '../operations/tableStructure'` for a dozen files, so those
  files' *other* exports — the table helpers, the payload types — were part of the package's surface
  and nothing said so.

  **A list of what one kind of export is called decides for callers what the rest of a file is for.**
  Every operation file is exported whole now.

- [x] **Two `defineOperation`s, one package.** Exporting the operations made them collide, which is
  the only reason anybody found out: `src/operation-dsl.ts` held
  `defineOperation(type, { validate, translate })` with a registry of its own, beside the
  `defineOperation(name, executor)` that all 63 operation files use. Measured before removing it —
  `applyOperation`, `DSLLibraryEntry` and `ModelContext` had **no callers anywhere**, and neither did
  `utils/dsl-context.ts`, the only file importing them. An empty registry whose name shadows the real
  one is worse than nothing.

- [x] **`node`, `textNode` and `mark` were sitting in the same place as the operation builders**, and
  were used about as much. The site's inserts and its sample are written with them now — a fixture is
  exactly where a raw object literal hides best, because a misspelt `stype` reads as a document
  decision right up until the schema refuses it.

  One thing that surfaced: `INode` and a fixture's loose node type do not overlap, because `INode` has
  required fields a *tree being loaded* has not got yet — the store fills them in. That is the honest
  relationship between a document on disk and a document in memory, and `loadDocument` is where it is
  crossed.

### One operation, one file — and a builder nobody could import

- [x] Asked while reading a site command: *why don't the extensions use the operation DSL — is it
  harder?* Measured, and the answer was neither taste nor difficulty:

  - `packages/model/src/operations/` held **68 files**: every operation's runtime handler, and 24 of
    them the DSL builder beside it — which is exactly the shape this package's own README shows.
  - `packages/model/src/operations-dsl/` held **37 files**, every one of them a duplicate *name* of a
    file in the first directory, holding that operation's builder. One operation, two files, with the
    same doc comment copied into both.
  - `operations/index.ts` was a single side-effecting `import './register-operations'`. So the
    **documented** kind — builder beside handler — could not be imported at all.

  Including `setAttrs`, the most used operation in the repository: **84 hand-written**
  `{ type: 'setAttrs', payload: { … } }` across three products, against 0 uses of any builder. That
  is almost certainly where the habit came from — the first thing anyone reached for was not there,
  so they wrote the object, and everything after it followed the local style. `setMarks`, `setText`,
  `setNode`, `selectNode`, `selectRange`, `clearSelection` and **`batch`** were behind the same wall.

  Merged: one operation, one file, 65 builders exported. `test/dsl-builders.test.ts` is the
  instrument — it reads the directory, finds every `defineOperationDSL`, and asks whether that
  builder can be **imported**. Nothing else would have caught this: the types said yes, every test
  passed, and the value was `undefined`.

- [x] **Two files, one name, two meanings.** Bringing them together is what made it visible:
  `DeleteTextRangeOperation` was the whole operation on one side and the *payload* on the other, and
  `WrapInListPayload` carried `extends Record<string, unknown>` on one side and not the other — so
  which one an importer got depended on which file they reached.

- [x] **A slicing script cut a type in half.** Deduping the declarations the merge doubled, the first
  attempt found the end of `type X = …;` by searching for the next `;` — which sits *inside* a union
  of object literals. `applyMark.ts` came out unparseable. Reset, and done again brace-aware, with
  the removal refusing anything that was not byte-identical. The lesson is the one already in this
  file: **edit source with an editor, not with a slicer**, and when a script must do it, make it
  assert what it is about to destroy.

### Export is a render, and that is what makes it an instrument

- [x] The obvious exporter is a walk that builds HTML strings, and it is the wrong one for a reason
  that has nothing to do with effort: a site builder's claim is that the thing on screen **is** the
  page, and an exporter that computes its own `display: flex` is a second answer to "what does a
  stack look like". Two answers drift, and the first divergence is a page that looked right in the
  editor and wrong when published.

  So export renders — the same `DOMRenderer`, registry, renderers and env, into a detached element.
  Which is what makes comparing the two a real check rather than a tautology, and the check found a
  real fault on its first run:

- [x] **An inline style beats a stylesheet, so every media query was correct and did nothing.** The
  renderers produce inline styles, which is right for an editor and fatal for a published page.
  Measured in a real browser at 390 pixels, on a row that stayed a row. The export now lifts each
  drawn element's style into a class of its own, so base and narrow have the same weight and the
  order decides — and no `!important` anywhere, because a page a reader cannot override with their
  own CSS is a page that is not really theirs.

  A class **per element**, not per node: a node's id is stamped on every element of its template, so
  a rule keyed by the id would reach inside a heading and restyle the span in it.

- [x] **A list is resolved, not stored**, so an exporter that walked the document would publish a
  page with one card on it. Rendering is what puts three there, sorted and filtered exactly as the
  editor shows them — and the browser test asserts the published page and the editor agree on which
  three and in what order.

- [x] **A token publishes what it resolved to.** `var:강조` is a fact about the document; a visitor's
  browser has never heard of it. The editor keeps the reference — so changing the token changes the
  site — and the export writes the colour.

### A panel can only be judged against a document that uses the properties

- [x] The site's inspector had three groups and was written **from the schema**. It looked complete,
  and the sample it was tested against used six attributes. So the sample was made dense — five
  pages, a grid, a fixed sidebar, two data lists, design tokens, a bound button — and the panel was
  written from *that*. What the exercise found, in order:

  - **A list's whole question was invisible.** Which dataset, sorted by what, how many, filtered to
    what: all of it in the document, none of it on screen. It is a tab now, and the columns come from
    the dataset's declared `fields`, so a reader **picks** a column instead of typing one — which is
    the reason `fields` is declared rather than inferred from the first row.
  - **A placement's answers could not be answered.** A card asks questions and a placement answers
    them; the only way to answer one was to write the document by hand.
  - **A page could not be renamed or moved.** A page is the board rather than a block — `SELECTABLE`
    leaves it out on purpose — so its name and address belong in the panel with *nothing* selected,
    which is where every builder of this kind puts them.
  - **Nine attributes a reader could see and not change**: what a stack is called, what a picture is
    called and where it comes from, how a heading ranks, what a border is. The command did not need
    splitting for them — they are all the same sentence, *this, about the blocks I have chosen, at
    the width I am looking at* — so `setStackFormat` widened and was honestly renamed
    `setBlockFormat`.

- [x] **A design token is a colour that says what it follows.** A site's `fill` may hold `var:강조`,
  and `ColorField` — the deck's control for `theme:accent1` — offers the site's own variables the
  same way. Two blocks the same blue are a coincidence; two blocks on `var:강조` are a decision, and
  the panel shows the second as **카드 바탕** rather than as a hex.

- [x] **A picture in the flow has no width to have.** The third node to learn it and the second to
  learn it from a page: `frame` first, then `instance`, now `picture`. A sample with three
  photographs in a row was refused with *Required attribute 'width' is missing* — on pictures whose
  whole point is that the row decides how wide they are.

- [x] **A page's stack must hold a heading *and* a button.** The office model says
  `(scene | frame)* | block+` — one branch or the other — because a canvas frame holds placed things
  and a document frame holds prose. A landing page's most ordinary section is a heading, a paragraph
  and a placement, which is two blocks and a scene node. The site widens both `frame` and `surface`
  to one alternation: **on a page, everything in a stack is a block.**

### What the site builder owes, measured

The third product's first run through the conformance harness (`packages/office-site/test/conformance.test.ts`).
Deliberately a **report** before it is an assertion: the point of running it was to find out what the
product owes. Word discovered these checks over months in a browser; the deck got them on its first
day and its failures were a work list. This is that work list.

| check | examined | owes |
| --- | ---: | ---: |
| every-node-is-drawn | 49 | **16** |
| every-attribute-is-read | 128 | **80** |
| every-insert-is-accounted-for | 7 | **4** |
| every-command-can-be-reached | 12 | **7** |
| the other five | 104 / 3 / 0 | 0 |

**After the work: every check asserts, and nothing examines nothing.** Two more came off the floor on
the way — the canvas layout extension was installed for an arrangement pass a flow page can never
use (a walk of every frame on every content change, with nothing it could ever do), and the product
had no *word* for its own node types, so `every-drawing-can-be-named` was passing by examining zero.
`kindOfBlock` is that word, and it answers **nothing** for a type the product has no name for —
which is the point, because `labelOfBlock` falls back to the stype and a fallback makes a missing
name look like a name.

**The first four were real work, and they are done.** What follows is what each cost and what it
taught; the rest became exemptions with written reasons, and the harness now asserts.

- [x] **16 node types the schema declares and the page cannot draw.** Almost all of them are the
  canvas's — `rectangle`, `ellipse`, `line`, `connector`, `path`, `sticky`, `group`, `canvasBlock` —
  and a page has no coordinates, so those are exemptions with a reason rather than work. The
  interesting ones are the *resources*: `component`, `componentVar`, `componentBind`,
  `componentValue`, `components`, `variable`, `variables`. A definition is never drawn — a
  **placement** draws it — so those are exemptions too, and saying so is the point: the check will
  fail the day one of them grows a renderer.

- [x] **`sizing` on a heading and a paragraph was declared and never read.** The schema was
  **narrowed** — containers only. A schema that offers a reader something nothing draws is worse than
  one that offers less, and nothing is lost: a reader who wants a hugging heading puts it in a stack
  that hugs, which is how every auto-layout tool works. *Was:* The site widened the
  schema to say any block may state its width, and only the container renderers call `sizingCss` —
  a text block's does not, because it is `office-text`'s and a site does not own it. Six findings,
  and the honest fix is probably to **narrow the schema**: a reader who wants a hugging heading puts
  it in a stack that hugs, which is how every auto-layout tool works. Decide, then either narrow it
  or read it.

- [x] **`setOverride` and `clearOverride` were unreachable — because `setStackFormat` replaced them.**
  One command that says "this, at this width" made two older ones dead, and nothing noticed until the
  check counted what a reader can run. Delete them.

- [x] **The site's key map lived in the app, where the check cannot look.** It is `keymap.ts` in the
  package now, with the matching in it too, so a chord written `Mod+d` and a handler that forgot the
  modifier cannot be two statements about one binding. The toolbar is `toolbar-model.ts` for the same
  reason. `every-command-can-be-reached` went from **7 findings to 1**, and the one left is
  `moveBlockInto`, reached by a drag — a claim on the record rather than a gap. *Was:* `Delete` and `⌘D` reach
  `removeBlocks` and `duplicateBlocks` — from a `keydown` handler in `apps/site`. The deck's key map
  is *data in the package* precisely so this cannot drift, and the site owes the same. Same for its
  toolbar: `slidesToolbarCommands()` is what feeds the deck's check, and the site's ribbon declares
  its commands inline in JSX.

- [x] **Four `insert…` commands from the shared kit were covered by no command check** —
  `insertText`, `insertParagraph`, `insertHardBreak`, `insertImage`. The product has to say what each
  produces, or say why it does not apply.

- [x] **`moveBlockInto` is reached by a drag and by nothing else**, which is right and has to be
  written down as a claim rather than left as a gap.

### The site builder, as it is built

Kept the way Word's and the deck's entries are: what was measured, at the moment it was measured.
The design and the reuse argument are in `docs/specs/site-builder.md`; this is the list of things
that were **wrong**, and what each one taught.

- [x] **The drawing did not follow a reorder.** Model `[b, c, a]`, page `[c, b, a]`. The commit places
  each child *before the next one*, which is only correct if everything after it is already right —
  and the walk goes left to right, so it never is. A reversal came out as a rotation. **Every product
  had it**: a slide moved in the filmstrip, a block moved up in a document, a card dragged along a
  row, and nothing in any suite looked at the drawn order. Fixed by placing each child *after the one
  committed before it* — the one thing already known to be in the right place — and only when the two
  are genuinely inverted, so the caret filler and a decorator's chrome are not dragged along.

- [x] **A proxy over a node inside the document goes stale.** The document's root object lives as long
  as the document; a node inside it does not — an operation that changes a parent's children may hand
  the store a *new* object for that parent. A view drawing a subtree held a proxy over the old one and
  redrew four sections after one had been deleted, for ever. A view with a `rootId` now asks the
  editor again on every render; a proxy is lazy, so it costs one object.

- [x] **A node selection does not survive an edit.** After a duplicate it came back as a `range` with
  its ends rewritten into the new nodes, so `selectedNodeIds` answered nothing and the very next key a
  reader pressed refused. A command that acted on a *set* has to say what the set is afterwards rather
  than hope — and for a duplicate the answer a reader wants is the **copy**, which is what every tool
  of this kind selects.

- [x] **A design system whose tokens are optional is one every app forgets.** The site used
  `office-ui`'s components and never imported `office-ui/tokens.css`, so every `var(--ou-…)` those
  components ask for resolved to nothing: no borders, no panel ground, the wrong type scale. Word and
  the deck have imported it since their first day, which is exactly why nobody noticed it was
  possible not to. Using a design system means taking its **variables**, not only its components.

- [x] **A control that needs the app to finish its layout gets finished differently by every app.**
  `PropertyEmpty` carried `px-1` and nothing else, so the one thing a panel shows most often sat
  against the edge. Fixed in `office-ui` rather than in the app.

- [x] **A drill cannot be written against the selection.** A double-click is `pointerdown, click,
  pointerdown, click, dblclick`, and its first press is an ordinary click that has already put the
  selection back to the outermost block — so a heading three levels down could not be reached however
  many times it was tried. What has to be kept is **where the reader is**, not what is selected.

- [x] **Playwright cannot click a canvas the ordinary way**, and that is the product working: the
  layer that owns the pointer covers the target on purpose. `force: true` dispatches at the same point
  and lets that layer answer. A suite that worked around it by clicking elsewhere would be testing a
  product nobody uses.

- [x] **A selector that names a property the product changes is a selector that lies.** The card row
  was found with `[data-layout="row"]`, and at 390 it is a column — the whole point of it — so the
  mobile assertion failed as though the override had broken something.

- [ ] **A stale dev server makes a suite lie for fifty minutes.** One run took 52 minutes and failed
  five tests on `waitForSelector`: a `vite` from an earlier probe still held the port with an old
  bundle, and killing it mid-run left the rest with no server at all. Kill the port before running a
  suite; the clean run of the same suite was 24 seconds.

### A view of part of a document had no way to say so

- [x] Three widths of one page are three `EditorViewDOM`s over one editor, and the only way to tell a
  view what to draw was `render(tree)`. That has a consequence nothing had written down: **`render`
  mutates the tree it is given** — `_sanitizeTreeContent` assigns to `content`. So passing the store's
  proxy wrote resolved nodes back into the document and crashed the tab; passing a deep copy left the
  view holding a tree that could never change, which is why the app re-rendered every board on every
  keystroke — **and that is what lost the caret**, because a full out-of-band render replaces the DOM
  under a reader who is typing in it.

  Both answered by `EditorViewDOMOptions.rootId`: a view that draws part of a document says so, asks
  the editor for that subtree, and takes the same path the main view takes. Every `EditorViewDOM`
  already re-renders itself on `editor:content.change` — there was never a second view that "was not
  listening", only a second view redrawing a tree that could not change.

  The deck's notes pane still copies, with a comment naming the wrong reason (it supposes the
  reconciler compares the model with itself; `Reconciler.reconcile` matches a fresh vnode tree to the
  DOM). It works, so it is left alone — but it should move to `rootId` when it is next touched.

### A screenshot found what the whole suite could not

- [x] The site builder's cards drew as a staircase on a phone — three stacked cards, each as wide as
  its own longest line — because `frameCss` aligns a stack's children to the start of the cross axis,
  which is right on a canvas and wrong on a page. **Every browser assertion in the suite passed.**
  They all asked about `flex-direction`; not one asked about width. One glance at the rendered page
  found it in a second.

  Kept as a rule rather than a fix: when a slice is about *layout*, look at it. A layout test asserts
  the property it was told to assert, and a page has a hundred others.

- [x] **A test that calls its own subject with `?.` cannot fail.** In the same slice:
  `expect(editor.getDocumentFaults?.() ?? []).toEqual([])` had passed since the product existed. There
  is no such method — the getter is `documentFaults` — so optional chaining turned *the API is not
  there* into *there are no faults*, while the editor logged a schema complaint on every load. Two
  invalid sample documents hid behind it. Never optional-chain the thing under test.

- [x] **A snapshot taken around the proxy skips everything the proxy does.** The site's per-width
  frames walked the store's raw nodes to get a tree the reconciler could compare — a real trap, and
  the wrong way around it. The proxy is where a placement becomes its definition's parts; walking past
  it drew every reusable header as an empty box, and a browser test asserting "the header is on both
  pages" passed on a placement with nothing in it. Read *through* the proxy, then copy.

### Resolving a placement is not worth a cache, and the numbers say so

- [x] Twenty placements of a ten-part card is two hundred resolutions per render, so a cache looked
  obviously necessary. Timed instead (jsdom, counting the store's resolver): a 20-card slide renders in
  **35ms**, re-renders in **16ms**, and asks for **1,000 parts** — because the view reads a node's
  `content` about five times in a pass. Those same 1,000 resolutions cost **2.7ms** on their own,
  0.003ms each.

  So resolution is a sixth of a re-render at worst, and a cache would buy ~2ms for an invalidation
  rule, somewhere to keep it, and a new way to be wrong — a stale part drawn after an edit, which is
  the fault the whole reference design exists to avoid. **No cache**, and §10b-15 keeps the table so
  nobody has to guess again.

  Re-run it with a probe rather than a test — a timing assertion in CI is a flake with a schedule:

  ```ts
  // packages/office-slides/test/zz-perf.test.ts (temporary)
  // Build a deck of N placements of a card with M parts, wrap `store.contentResolver` with a
  // counter, render twice with EditorViewDOM({ sync: true }), and print calls / ms / parts.
  ```

- [x] **Why five, answered — and three of the five were nobody's.** The stack behind every
  resolution, counted over a render of the sample deck: 520 resolutions, 3.19 per node, and the
  biggest caller was `separatePropsAndModel` building `{ ...data }` — a full copy of the node, which
  on a document whose children are *resolved* means resolving them again — for a half its only caller
  threw away. 162 of 520, 31%, for an object with no reader. Two more were the same mistake in our
  own code: `childrenOf` and `childCount` each testing `content` and then reading it, which is two
  questions where there is one answer. Read once into a name, all three: **520 → 324** resolutions on
  the sample deck, **742 → 488** on the 20×10 deck, and a placement's five reads are three (props,
  children, and the one question its renderer asks). About a millisecond, which is why the cache
  refusal above stands unchanged — the finding is that a third of the work had no reader, not that
  the reads were expensive (§10b-15).

- [x] **A chain of cards is drawn nine deep and then stops** (`NEST_LIMIT`), which is the cycle guard
  rather than a taste: a card holding a badge is ordinary, a card holding itself is an infinite
  descent, and a depth catches the mutual case a visited set alone does not. Measured: a chain twelve
  deep drew nine levels and **lost the rest in silence**. `nestingOf` walks the definitions — the only
  way to see past the point the resolution gave up — and the deck's own check now says it: 고칠 것 for a
  card that holds itself (a document cannot mean that), 볼 것 for reaching the limit (a fact about this
  product). Asked only of placements *in the document*, or a twelve-deep chain reports the same fault
  once per level at the same box.

### A placement draws its definition, and every walk had to say which tree it reads

A component follows its definition now (`canvas-model` §10b-2a): a placement holds no copies, and
what it draws is resolved in the proxy the view reads children through. The design is settled and
tested; what this entry is for is the thing that came *out* of it, which is more general than
components.

**There are now two trees, and every walk has to decide which one it means.** The document (what a
file holds, what a command may act on, what undo can take back) and the drawing (what an audience
sees). Measured, one walk at a time:

- **The deck's own check** read the document and went blind: a deck of twenty cards audited as
  twenty empty boxes — every picture without alt text, every 8pt caption, every unreadable
  contrast inside a definition the slide only *names*. Fixed by resolving each placement in the
  sweep (`auditDeck`), reporting the fault against the placement, because a drawn part's sid is
  synthetic and no command accepts it.
- **The arrangement** read and wrote the document, and could not write a part that is not in it.
  Moved into the resolution, where it costs no writes at all — and a resize of a card is now
  **zero** document changes rather than one per part per placement.
- **The layer list** reads the document, deliberately: a card is one row, and its parts are worked
  on by opening the card. The cost is written down in §10b-13 rather than hidden — a badge inside
  a card cannot be hidden, locked or reordered per placement.
- **The save** reads the document, structurally: `exportToTree` walks the stored nodes and the
  resolver is only consulted by the proxy. This is what makes the whole design safe.

**Still to decide, in order:**

1. - [x] **Find and replace see a placement's words now.** Measured on the sample deck first, and it
     is why this was wrong rather than incomplete: `매출`, `1,240만`, `이탈` are all drawn on the
     cards slide and all came back **없음**, while an ordinary title and a row in a card's slot were
     found. `deckMatches` resolves each placement (the audit's answer), and the question replace
     had turned out to have **three** answers rather than two:

     - the words are this **placement's answer** → replaceable, and the write is that placement's
       `componentValue`, so fixing a name on slide 6 changes slide 6;
     - the words are the **card's own** → found, named 카드, and **refused**: rewriting them from a
       find box would change every placement in the deck without saying so, so 바꾸기 greys out with
       the reason and 모두 says how many it left;
     - the words are the reader's own in a **slot** → ordinary document text, and the resolution walk
       skips anything with a real sid so they are not found twice.

     A value that is itself a reference to a document variable is refused with the second group: a
     literal written over it would quietly stop that card following the document. `replacePlan` puts
     a slide's run rewrites and value rewrites in **one** transaction, so a slide's replacement is
     one press of undo.
2. - [x] **Motion by name reads the document, and that turned out to be the smaller half.** The
     measurement found a fault nobody was looking for: `namedBoxes` read `name` off *every* node it
     walked, so the sample deck's cards slide offered a reader five things to animate that cannot be
     — `title`, `value`, `showBadge`, `accent` (a placement's `componentValue` answers, whose `name`
     says which variable they answer) and `One card, three places`, which is the **slide**. A step
     naming one of those animates nothing, silently. `isSceneType` is the one list of what a canvas
     places; asking it is the fix, and it took one line.

     The original question is answered by **refusing** it, with the reason written down (`timeline.ts`,
     §10b-2a): a card's parts are the definition's and are resolved at draw time, so naming one from a
     slide's track names something the document does not have — and two placements of one card draw
     two parts with the same name, so the ambiguity is systemic rather than accidental. A placement
     *is* offered, because animating a card as a whole is ordinary, and so is anything the reader put
     in its slot.

   - [x] **A card's own motion** (§10l), and the measurement made it small: given a `component`
     carrying a `trackId`, `trackFor`, `namedBoxes` and `slideTimeline` **already answered** — time
     lives beside the document, so nothing in the timeline model knew it was reading a slide. One
     schema attribute (`component.trackId`) and one reader (`cardSteps`) were the whole feature.

     Both questions answered by what the alternative would cost: the track hangs from the card, and a
     card's steps land in the **arrival group** so they add no presses — a slide with three of one card
     would otherwise cost three times the presses for one decision made inside the card. `withTiming`
     needed one correction for it: the first step of each placement's block restarts the chain, or the
     second card's `afterPrevious` waits for the first card to finish.

     Found on the way, and fixed first: motion addresses a shape by its sid, and a drawn part's sid was
     made of the *definition's* id — three placements of one card drew three elements claiming one
     identity. And the motion commands all refused a card's part, because `slideAt` walks to the
     nearest `surface` and a part has a `component` above it; `trackHostAt` is that walk, kept separate
     from `slideAt` rather than widening it, because the clipboard, the arrangement and the layout
     cascade all mean the surface when they say slide.

   - [x] **The slide's timeline says which cards animate themselves** — one line above the axis,
     naming them, with a press that opens the card. Not rows: the motion belongs to the card and has
     no per-placement copy to edit, which is the layer list's call about a card's parts (§10b-13). And
     not a lane, because these cost no presses and a lane would have nowhere to sit on the clock.

   - [x] **A card's motion in a scrolling show** — held at its end state, not replayed, because a
     scroll is scrubbing with another input device and a card's motion costs no presses. Measured on
     the way, and it was a fault: `group: 0` reads as *already played*, so an **exit** hid the shape
     before it had run — absent the moment the slide arrived, and absent for good in a scrolling show,
     where the arrival group is never run. The arrival group now never hides anything (§10l).

   - [x] **The presenter's screen names what has to be pressed.** It said *애니메이션 2 / 2* and
     nothing else, which reads as finished — so a presenter pressed forward and a reveal waiting for a
     click on a *shape* never came. `pressCount` is honest (a trigger costs no press), so the number
     could not be fixed; the missing thing was the other half of the sentence. `pressablesOn` reads
     the slide's steps and its cards' steps together and **names** each waited-for box — words rather
     than a count, because with cards the button may be a badge inside one of three identical
     placements: *지표 카드 · 타원* is a thing on the screen where `card-badge` is a name in a file. A
     slide's own shape is answered by `labelOfBox`, so the presenter reads the same words as the layer
     list; a card's part splits its drawn sid at the last `~` and the card supplies the first half.
     Nothing to say is said with nothing — a line that is always there is a line a presenter stops
     reading (§10l).

   - [x] **A trigger inside a card** works, and the belief that stopped it was half wrong: the show's
     click walk asks the **innermost** `[data-bc-sid]` first, so the element a reader pressed *is* the
     drawn part — only a name for it was missing. A card's trigger carries the placement in its `on`,
     `drawnNames` maps that name to the element, and pressing the badge on the second card leaves the
     first one still. Kept out of `namedBoxes`, because that list is what a *slide's* track may name
     and a card's part is not one of those (§10k).
3. - [x] **Copy of a placement carries the card now.** Measured first, and it was the worst shape a
     fault takes: pasting a placement into a deck without its definition **succeeded**, drew an
     invisible empty box, and no check anywhere mentioned it. The clipboard payload carries what the
     boxes need — the definitions they name, the definitions *those* name (a card holding a badge),
     and the document variables the bindings and the copied attributes reference — and the paste adds
     what the destination has not got, in the paste's own transaction so one undo takes back one
     gesture.

     Three decisions worth keeping: a pasted card is a **plain copy**, not a brand-kit import,
     because a clipboard has no library name to record and a reference that cannot be resolved should
     not be written; a destination that already has that id keeps **its own** card and the arriving
     one is renamed (comparing by signature, not by id), because overwriting would change every
     slide already using it; and a variable of the same name keeps the **destination's** value,
     because a paste that re-colours the deck it lands in is changing slides nobody was looking at.

     The net beside it: the audit reports `missing-card` (고칠 것), because a clipboard is not the
     only way to get one — an older file, or a definition deleted while placements of it sat on
     slide 40.

### A name means "a box motion can find", in both places that ask

- [x] **And a surface's `name` is the other thing entirely** — what the slide is *called*, drawn in
  the rail. Two namespaces in one attribute, which is safe only while every reader knows which it is
  asking about, and the last three faults here were all a walk reading `name` off whatever it stood
  on. Measured in both directions and pinned by tests: a slide called `shape-1` is not offered to
  motion, and a shape called `shape-2` never reaches the rail — `nameOf` falls back to the title
  placeholder's **words**, because `shape-2` in a rail is a name no reader would recognise (§10k-2).


- [x] `_nameTaken` and `_freeShapeName` read `name` off **every** node, while `namedBoxes` — the map a
  step's target is actually resolved through — offers only what a canvas places. So a `variable`
  called `shape-1`, or a `componentValue` whose `name` says which variable it answers, made `shape-1`
  "taken" for a name nothing could ever resolve to it.

  Harmless in practice, which is why it sat: the generator only ever asks about `shape-N` and skipping
  a number costs nothing. Narrowed to scene nodes anyway, because two readers of one idea that answer
  differently is how the next person gets the idea wrong — and `namedBoxes` is the one that decides
  what a name means.

### All four selection types have a producer now

`SelectionType` is `'range' | 'node' | 'cell' | 'table'`, and for a long time two
of them were declared, accepted by the validator, passed through by `setNode`,
and produced by nothing. Both have readers now — see Done — and what is left of
this entry is the *other* product.

Found by asking why the two products' selection modes differ. They do not: the
engine has one set and Word simply never makes a node selection, because a page
flows and every editable thing is in the flow, so "where the reader is" is always
a text position. Slides places, so the objects themselves are selectable and
their text is inside them — which is why it is the one product where both kinds
are live at once, and why `_nodeSelectionHoldsUntilGesture` exists at all.

**Kept, with a reader named.** Two cells in different rows are a *set*, which is
what `node` already means; what `cell` adds is that the set is cells, and the
code that needed to know was table editing. A selection of cells answers
different questions than a selection of shapes does: merge, split, insert a row
above, and what the toolbar should even offer.

- [x] **Table editing produces them**, in Word: drag across cells, or Shift+click.
- [x] **Slides' tables produce them too**, and it *was* the one-line install —
  the first attempt was wrong about why it failed. The deck's overlay is
  `pointer-events: none` while the reader is editing a box, so a pointer inside
  an entered text frame reaches the document exactly as it does in a page; the
  probe that "proved" otherwise had clicked once where it needed to click and
  then double-click. See Done for the four real faults underneath it.
- [x] **`table` has one too**, from the handle at a table's corner: the gesture
  that means "this table, as one thing". Delete removes it, guarded by
  `tableSelected` rather than `inTable` — with a caret in a cell, Delete is a
  character.

### Shell and navigation


### Attributes the schema declares and nothing reads

**This list is gone, and that is the point.** It is a conformance check now —
`every-attribute-is-read` — which renders a node with an attribute set and again
without it and asks whether the drawing changed. Nobody re-measures it; the tests do,
every run.

What was here was the failure the harness is built around, in miniature: a line each,
and a date — *"Re-measured 2026-08-18, and five came off"*. Between one look and the
next it said things that were no longer true, exactly like the fourteen stale
exemptions in the operation roster. Six entries had survived that re-measure; the
check found **thirty-three** in Slides and **362** in Word.

Three things came out of building it, and they are the reusable part:

- **A check that reports a finding falsely is worse than one that misses.** Seventy of
  the first hundred and nine were the probe's fault, not the product's: one value for
  every number made `cornerRadius` and its four corners indistinguishable; a made-up
  string is not a legal value of an enumerated attribute, so the renderer drew its
  default; an out-of-range crop was clamped to a crop of the whole picture; and asking
  each attribute *alone* missed every attribute that only matters in combination — a
  `strokeWidth` with no `stroke` draws nothing at all. Each of those cost a round of
  measurement, and each is now a test in `packages/conformance/test`.
- **The check pushed the schema to declare what it means.** `AttributeDefinition` has
  `options` and `min`/`max` because a fixed set written in a comment is readable by
  nothing: the same set was written again in every toolbar that offers it, and a value
  added to the drawing and not to the prose was invisible. The validator reads them
  too, so they are not a harness-only declaration.
- **Some attributes are read by something that is not a renderer**, and that is a
  decision rather than a fault. Those are exemptions keyed by the *attribute* rather
  than by the node — `Finding.family` — because `locked` came back on eleven node
  types for one reason, and eleven copies of a reason is the thing this repository
  keeps finding in itself.

What it found that was real, in Slides: a **numbered list drawn with bullets** (the
renderer read `listType`, a name nothing writes, while `wrapInList` writes `type` —
and the sample deck agreed with the renderer, so every test passed); **vector ink with
no paint at all** (a `path` read `d`, `fill`, `stroke` and `strokeWidth`, so the
deck's gradient and shadow drew nothing on it — now `svg-paint.ts`); a path that could
not be dashed; and a slide that did not record its own `kind` the way Word's surface
always had.

**Word's went 362 → 185 in one pass**, and how it split is the useful part:

- **108 were read somewhere that is not a renderer**, and are exemptions now, keyed by
  attribute: the paginator's (`keepNext`, `keepLines`, `pageBreakBefore`,
  `widowControl`, `cantSplit`, `isHeader`), the page-furniture pass's (the header and
  footer margins, the page numbering), the page the paginator measures (`marginTop`,
  `orientation`, a surface's width and height), the image-layout pass's (`distance*`,
  `offset*`, `side`, `shapeMargin`), the three resolvers' (`numId`, `numLevel`,
  `styleId`), and the contents page's (`caption`, `levels`, `styleFilter`,
  `outlineLevel`).
- **45 went by deleting them.** `boxBorderAttrs()` handed every block, table, cell and
  page all seven edge groups, so a *page* was declared to have interior borders and a
  *cell* a between-border. Each kind gets the edges it has now — the office schema's
  inheritance fault one level down, fixed the same way.
- **24 went by drawing them.** The four `*Space` values are the room a border leaves
  the text, declared on every kind of box and drawn nowhere: every bordered paragraph
  in the product had its line hard against the letters. Added to any padding already
  there rather than replacing it — a hanging indent is a `padding-left` and it is
  applied first.
- **A new rule came out of it, and it is the general one.** `options` is right only
  where the reader treats the set as **closed**. Word's border styles are
  `BORDER_STYLE[style] ?? 'solid'` and its stipples run `pct5` to `pct95`: declaring a
  closed set there would make the validator reject values the renderer draws, and a
  schema stricter than its product is a worse fault than a check that cannot see. Those
  are exemptions saying *"read, and the probe has no legal value to try"*.

Still open, each in a place that cannot go quietly out of date:

- [ ] **Word's 185**, as a ratchet in `packages/office-word/test/conformance.test.ts`
  with the four piles written out beside it.
- [ ] **Block revisions are recorded and never shown** (44 of the 185). `revisionId`,
  `revisionType`, `revisionAuthor` and `revisionDate` on eleven node types:
  `revision-record.ts` writes all four, and the only thing that reads any of them is
  `recordParagraphMerge` checking whether it already proposed one. Nothing draws a
  tracked change on a block and nothing accepts or rejects one — a whole feature
  written down and invisible. Run-level tracking is marks and does draw.
- [ ] **`borderBetween*` and `borderInside*`** (40 of the 185) — the single line Word
  draws where two bordered paragraphs meet, which needs the neighbour the way
  `suppressedSpacing` already asks for one; and a table's interior, which needs the
  cell's position and so belongs with the per-cell style layers rather than in
  `applyBorders`.
- [ ] **The OMML switches** (~25) — `hideSub`, `hideSup`, `hideDegree`, `plcHide`,
  `zeroWidth`, `strikeHorizontal`, `noBreak`, `operatorEmulator` and the rest: the
  maths model this schema follows, drawn by nothing, and not round-tripped either since
  there is no `.docx` converter.
- [ ] **`headerId` and the four other header and footer names.** A section names its
  header and nothing looks the name up. `sectionStart` likewise.
- [ ] **`paragraph.placeholder`** — nothing reads it. The prompt would show on an
  *empty* paragraph, and an empty paragraph here holds a caret filler, so `:empty` is
  not the test. Slides prompts from its layouts instead.
- [ ] **A conic or image fill on a path, and an inner shadow.** `svg-paint.ts` draws a
  solid, a linear and a radial; a conic has no SVG equivalent, an image fill needs a
  `<pattern>` sized to the shape, and an inner shadow needs a composited filter chain.
  Not half-drawn on purpose: a gradient that silently becomes a flat colour is worse
  than one that is not offered.
- [ ] **A reader-given name.** `name` is taken: it is how motion names a box
  (`shape-1`, `shape-2`, assigned by `setBoxBuild`, resolved by `namedBoxes`, and
  written into the deck file). Labelling the layer list by it put `shape-2` in the
  timeline where `동영상` had been — two tests caught it. A name a *reader* types is a
  different attribute, and the layer list is where it would be read.
- [ ] **`fitText`** (cell) — deliberate: a measurement rather than a format.
- [ ] **`overlap`** (table) — whether two floating tables may sit on top of one
  another. Needs floating tables first, which nothing here has.
- [ ] **`columnsEqualWidth`** (section) — blocked on something more interesting
  than effort. CSS multi-column *only* does equal columns: `column-count` divides
  the box evenly and there is no property for "three columns, the first twice the
  others". Unequal columns with text flowing between them is not expressible in
  CSS at all, so it would have to be the paginator's — measure and split per
  column, the way pages are already measured and split. The schema is also only
  half there: `columnsEqualWidth: false` has nothing to be unequal *by*, because
  there is no per-column width to state. Both halves are one piece of work.
- [ ] **`langEastAsia`** — Word keeps a separate language for East Asian text.
  One element takes one language, so this needs a decision about which wins
  rather than a reader.
- [ ] **`hyphenationZone`** — the space Word allows at the end of a line before
  reaching for a hyphen. No equivalent in CSS.
- [ ] **`lang` arrives two ways.** The `spanLang` *mark* writes a `lang`
  attribute and the character format now writes one too. Two mechanisms for one
  attribute is one too many; which should own it is the open question — a mark
  spans a range of characters and an attribute belongs to a run, and Word's own
  model is the run.


### The harness, and what it still cannot see

- [x] **Reachability replaced the group heuristic.** A node can appear in a
  document if the content expressions lead to it from the top node without
  passing through `resources`. No groups, no exemption for `numberingLevel`, and
  Word's examined count went from 61 to 106.
- [x] **`every-insert-is-accounted-for`** holds a product to the naming its own
  commands follow. Word's list covered 9 of its 23 `insert…` commands; it covers
  all of them now, and two of the nine were wrong — `insertMention` applies a
  mark rather than making a node, and `insertBookmark` makes a
  `bookmarkAnchor`, not a `bookmark`.
- [ ] **Word does not wire `every-command-can-be-reached`.** Slides passes `own` and `reachable` and
  the check examines 96 commands; Word passes neither, so the check never runs for it and a Word
  command nobody can press is invisible to the harness — which is the exact fault the check exists
  for, in the product that has twice the commands. Measured while fixing `bgColor`: Word adds **131**
  commands of its own, and a naive `reachable` built from the ribbon model and the keymap leaves 69
  unaccounted for. Most of those 69 are reached some other way — the input handler owns the movement
  and delete commands, the palettes own the colours, the choice controls own the font and the size —
  which is precisely what an exemption is for. The work is building Word's `reachable` from its real
  chrome and writing the exemptions, and the answer at the end is a number nobody can guess today.

- [ ] **A command that makes a node and is not called `insert…` still slips
  through.** The honest limit of a convention check, written in the check
  itself.
- [x] **A command nothing surfaces is a finding.** `every-command-can-be-reached`
  asks the question underneath the other command checks: can a reader get at it
  at all. Written after the failure it would have caught — three clipboard
  commands registered, working, tested and reachable by nothing for a day, with
  every check passing, because the harness could read a toolbar and not a key
  map. A deck's keys are data in the package now, for the same reason its
  toolbar is, and the check reads both. The subject is the commands a product
  *adds*, measured as the difference between an editor built with its own
  extensions and one built with none — a list would be a fourth place to forget
  the thing the check exists to catch.
- [x] **Slides conforms.** Was a ratchet at 64 of 64 undrawn on its first day;
  now `assertConforms` with ten written exemptions and no findings — the other
  seventeen went when the office schema stopped inheriting what no office
  product draws.
- [x] **A renderer that exists and draws the wrong thing no longer passes.**
  `every-drawing-can-hold-what-it-contains` reads the tag a product draws each
  node type as and compares it with the tags of the types the schema lets that
  node contain: `<svg>` may hold only SVG, so a container and its contents drawn
  in different namespaces is a box that draws empty. It found six pairs in
  Slides, four more than the comment that reported the problem had named.
- [x] **A renderer whose children the parser moves is a finding**, by asking the
  parser rather than a list — `every-drawing-keeps-its-children`. See Done.
- [ ] **A renderer that draws the wrong thing for a reason no parser can see
  still passes.** Namespaces and HTML's structure are both decidable from
  outside; a renderer that draws the right element with the wrong geometry is
  still only visible to a person looking at the page.
- [x] **An attribute nothing reads is a finding**, and the hand-kept list of them
  is deleted — `every-attribute-is-read`, above. It found a numbered list drawn with
  bullets, vector ink with no paint, and a slide that did not record its own kind.
  Two mechanisms came out of it that the other checks now share: `Finding.family`,
  so a fact about an attribute is one entry rather than one per node type, and
  `Ratchets`, so a product can adopt a check that finds hundreds at once as a number
  that has to come down — which is how Slides adopted the harness in the first place,
  and which is now a feature of it rather than a thing each product improvises.
- [x] **The tests are type-checked**, held to a per-package number by
  `pnpm type-check:tests` — the same ratchet idea in another medium, and the entry
  above for what 1,359 unchecked errors were hiding.
- [x] **What a product renders *with* is part of the answer**, and now so is what its
  values *look like*. The probe reported 483 of Word's 597 attributes as unread until
  it was handed Word's own environment; the second half of the same trap was that it
  had no value to invent for an `array` or an `object`, so it answered "cannot be
  asked" — correctly — and skipped without counting. **A product now teaches it the
  shape** (`attributeReadFrom`'s `probes`), and the skips are counted and reported
  beside `examined`. All three products are at zero unanswered; see Done for what the
  count turned out to be hiding.

  What is still unsolved is the *combination* half. The probe asks about one attribute
  against one value of every other, so an attribute that only means something in a
  particular combination is invisible to it — `wrapPolygon` is read as `shape-outside`
  and only when `wrap` is `tight`, which the probe cannot arrange. That one is an
  exemption with the reason written; the general form would need the schema to say
  which attributes govern which.
- [x] **A document that is loaded is checked against the schema**, and it found a
  fault in Word's own fixture on its first run — see Done.
- [x] **The office schema declares what it offers** rather than inheriting the
  whole standard node set. Forty-six exemption lines across two products became
  zero, and the two products' undrawn sets turned out to be *identical* rather
  than merely similar — see Done.

The full list, with a reason each, is the exemption map in
`packages/office-word/test/conformance.test.ts` — and fixing one without deleting
its line there fails the build, which is the point.

### Slides — the work list

One list, ordered, and the only one: the phases are `docs/ROADMAP.md`'s Deck 1–5
and this is what each is made of. Every item names what already exists, because
an entry that does not is a research task wearing a feature's clothes.

Measured on 2026-08-19 rather than remembered — the deck has 139 commands and
fifteen canvas node types, and the last list that was written from memory had six
shipped features marked undone.

**Deck 1 — depth on the objects that exist.**

- [x] **Gradients, shadows, dashed strokes.** `paint.ts`, declared on the nodes
  Slides draws as HTML, reached through the panel.
- [x] **Text colour and highlight in the deck.** Word's two palettes, drawn by
  the deck's ribbon for the same reason it draws Word's font boxes. It turned up
  two faults nobody was looking for: applying a mark *appended* it, so **coloured
  text could not be recoloured** in any product — red then green kept the red —
  and `setBgColor` writes its colour into an attribute the schema does not
  declare, so it reports success and paints nothing. See Done, and the entry
  below for what is left of the second.
- [x] **A shape's text inset and vertical alignment.** A 텍스트 group in the
  panel, drawn for whatever declares `verticalAlign` — and `textInset` is new,
  because text with a fill behind it had nowhere to stand away from its own
  border. See Done.
- [x] **Crop a picture.** Double-click a picture and the handles take source
  away instead of resizing it; `fit` has a row in the panel, and so does the way
  back. See Done.
- [x] **Per-corner radius.** Four numbers, clockwise from the top left — and
  every box a reader rounds can be rounded now, where only the rectangle could.
  See Done.
- [x] **Nothing deselects a box** — and it turned out not to be the gesture that
  was missing. See Done.

**Deck 2 — transitions, then builds.**

- [x] **A track beside the document.** `motionTrack` and `motionStep`, declared
  with their first reader and not before. See Done.
- [x] **Slide transitions.** Seven effects and a length, played in the show and
  not in the editor — the smallest possible first use of time, and the one that
  names no shape. See Done.
- [x] **Builds on the objects.** Seven effects on the same track, one press per
  group, and the shape naming that a build needed and a transition did not. See
  Done. Emphasis effects, per-build timing and reordering are the timeline's,
  below.
- [x] **A presenter view.** The next slide, the note, the position and a clock,
  in one window with `S`. See Done — and the second window is its own item below.

**Deck 3 — masters and themes.**

- [x] **A master above the layouts.** `slideMaster`, one more level in the same
  cascade, plus the background coming down it. See Done.
- [x] **A theme.** Twelve colour slots and two faces, written where a colour
  goes — `theme:accent1` beside `#0ea5e9` — and resolved wherever the deck paints.
  See Done.
- [x] **Applying a theme to an existing deck**, keeping what a slide overrode —
  which turned out to be nothing to implement. See Done.

**Deck 4 — media, and then the timeline.**

- [x] **`mediaVideo` and `mediaAudio` come back**, with a renderer, a command and
  a control — enforced twice by the harness on the way in. See Done.
- [x] **Playback while presenting**, and stopping on the way out. See Done.
- [x] **A timeline.** A slide's steps as one list: the order, the timing, the
  presses, and a film in the sequence. See Done. What it is *not* is a strip of
  tracks with clips on it — see the entry below.
- [x] **Export to a file** rather than to a screen. See Done — and the thing it
  depended on was decided a fortnight earlier, when a build was made to name its
  shape by a name rather than by a sid.

**Deck 5 — templates, and what a reader starts from.**

- [x] **`component` and `instance` get a producer.** Done. Reading (1) below is what
  shipped — a placement holds real copies and following the definition is a command —
  and every "measured before starting" note under it turned out to be *half* right,
  which is why they are kept.

  What the notes got wrong, and how: a definition is not on a slide (it is in a
  **library** of its own, `components`, beside `resources`; the schema refused it in
  `resources` because it was in the scene group, and the answer was to give it a group
  and a container rather than to put it on a page); and the shared-schema decision the
  note said was needed was made — `instance` is not an atom, because a placement has to
  be able to hold a whole region a reader added.

  Four things measured *after* starting, each of which changed the design:

  - **Apply compared against the wrong thing and did nothing.** Comparing a part with
    its origin as it stands means every part differs the moment the definition changes,
    so the "an edited part is the reader's" rule protected all of them. A part now
    records what it was **given** (canvas-model §10b-9).
  - **A slot is always "edited"**, because the reader's boxes are in it — so a
    definition's change to the frame itself could never reach a placement anybody had
    used. A slot is compared without its contents and rewritten keeping them.
  - **A definition holding a literal colour is off-brand for ever.** The theme test
    found it: a colour variable's default names a theme slot (§10b-10).
  - **The library must contribute no box.** The ruler test found the same six pixels
    twice — once for `resources`, once for a library left visible because its children
    were hidden. `display: contents` is the answer (§10b-6).

  Still open, and each is a real gap rather than a tidy-up:

  - ~~**Nothing declares a variable yet.**~~ Done: the 변수 list in the components panel
    while a definition is open, and a part's 컴포넌트 부품 group for the bindings. Two
    panels because they are two questions — a variable belongs to the card, a binding to
    the box the reader has selected. A variable's **name** cannot be changed and the
    label can: the name is what a part binds to and what every placement answers, in the
    document, so renaming one is a migration through every deck that copied the card.
    Removing one takes the bindings and the placements' answers with it, in one
    transaction, because a binding pointing at nothing draws whatever it last had.
  - ~~**Resizing a placement** does nothing to its parts.~~ Answered by refusing it, and
    the measurement is why: a corner drag wrote 8280×6440 onto a card whose parts stayed
    5040×3960, so the outline grew and the card did not change. A placement's extent *is*
    its definition's — no resize handles, greyed fields with the reason, and a 크기 row on
    the definition that moves every placement with it. Scaling **one** placement still
    waits for a constraint model; the half-guess puts a badge outside its card.
  - ~~**A placement's parts are not in the layer list.**~~ Fixed: the list descends into a
    placement too, marks the rows that came from the card (`data-layer-part`), and skips
    the `componentValue` children — which is what keeps the conformance exemption saying
    "it never appears in such a list" true.
  - ~~**The stage scales a focused definition by the slide's size.**~~ Fixed, and it was
    worse than the note said: the stage fitted the **constant** `SLIDE_16_9`, so a 4:3
    deck drew at the scale for a wider one with 662px of ruler across a 497px slide, and
    a definition drew at that same scale whatever its size. `stageFit` in the model
    answers it now — the surface the reader is on, or the widest slide for a strip — and
    presenting a deck that is not 16:9 was fixed by the same line.

  The original notes, kept because they are the argument the design came out of:

  **Two things measured before starting, because they decide the shape of it.**

  *A component is a scene node, not a resource.* Putting one in `resources` is
  refused by the schema — "type 'component' is not allowed here by content model
  `resource*`" — because it is in the SCENE group. So a definition lives *on a
  slide* the way Figma keeps components on a canvas, which also means a deck needs
  somewhere to put them (a library slide, or the master) before any of this is
  usable.

  *And the engine cannot draw one node's subtree inside another.* `slot('content')`
  renders **this** node's children and there is no builder for "render that node
  here"; `component(name, props)` is a registered *component* by name, not a model
  node by sid. Measured: an `instance` renderer sees `content: []` and draws an
  empty box, with the definition nowhere in it.

  Which leaves three readings, and they are not the same work:

  1. **An instance holds children** (copies), and following the definition is a
     command that re-copies. Draws, edits and animates for free — everything
     already works on ordinary boxes — and makes overrides nearly free too, since
     an instance's own children are edited in place. Costs a **schema change**
     (`instance` is `atom: true` today) in the *shared* office schema, so it is
     Word's decision as much as Slides'.
  2. **The view expands instances**, cloning the definition's rendered DOM the way
     the echo trail does. No engine work and no schema change; instances are not
     editable and their text is not real text, which is wrong for a template.
  3. **Placing a component inserts a copy** with no live link — PowerPoint's reuse,
     Canva's elements. Simplest, genuinely useful, and does not use the `instance`
     node at all, which is worth saying out loud rather than pretending otherwise.

  (1) is the one the engine supports and the one Figma's own format resembles. It
  needs a decision on the shared schema first.
- [x] **The deck's own check looked at half the deck.** Measured while reading how the layer
  list stops at a placement: `auditDeck` filtered the slide's **direct children** and never
  descended — so a picture with no alt text inside a group, a frame or a card was not looked at,
  and the panel said *"훑었습니다. 걸린 것이 없습니다"* about a deck full of them. `PLACED` even
  named `group` and `frame`, so the containers were counted as shapes while their contents were
  not, and `instance` was not in it at all.

  Three things fell out of fixing it, each its own small correction:

  - A nested box is measured against the slide, not against its container — a rectangle 1000
    twips inside a group at 18000 is at 19000, and the raw number called it safely inside.
    `spaceOriginOf` is the one implementation of that rule.
  - The **text** checks now ask the box that holds the text. `textRuns` walks a subtree, so a
    group reported its child's small text with the group's sid: a row that selects the group and
    leaves the reader looking for the words.
  - A fault inside a card says the fix is in the card, because otherwise the reader is about to
    write the same alt text on twenty slides. The fault is still counted once per placement:
    three slides with an undescribed picture are three slides.

- [x] **Four answers to "what can a reader go inside".** The overlay's (for the double-click
  that enters one), the layer list's (which rows have children), the deck's own check (which got
  it wrong and never looked inside a group at all) and the slide's *name* (which did not descend,
  so a title inside a frame or a placed card left the filmstrip blank). `isContainerType` is the
  one list now — a frame, a group and a placement — and the reason a placement is on it is
  written where the list is: its parts are real boxes a reader may edit, which is how an
  override is made.

- [x] **A frame arranged its children and never sized them.** `layoutStretch` (fill the frame
  across the axis) and `layoutGrow` (share what is left along it) — the part of Figma's
  constraint model that auto-layout actually spends. Measured on the way: a frame **could not
  hold a frame** unless it held nothing else (`frame > [rectangle, frame]` was refused), so the
  ordinary card shape — a frame with a title and a row of cells — was impossible; `frame` is
  `(scene | frame)* | block+` now. And the word 채우기 was already taken in the properties panel
  by *paint*, so the switch is 가득.

- [x] **A card built out of a frame can be resized in place.** A placement has no arrangement,
  but a part told to fill it is as big as it is — so the drag reaches the card, the part, and the
  rows that part arranges: three levels from one gesture. The handles are offered exactly where
  that answer exists and refused where it does not. Two measured corrections came with it: a part
  whose box an arrangement decided is left out of its signature (or a resized placement looks
  edited in every part and apply leaves the whole card alone for ever), and the arrangement had
  to converge in **one** pass — the reaction guards against re-entering while its own write is in
  flight, so a pass whose writes changed a deeper pass's inputs left the tree half-arranged and
  nothing ran again to fix it.

- [ ] **Per-edge constraints** for an absolutely placed box — pin to an edge, scale with the
  parent. What Figma answers the general question with, and what a *placement* would need to be
  resized on its own (canvas-model §10b-12). The measured reason to wait: nothing propagates to
  a placed box at all today, so a half-answer (scale everything proportionally) puts a badge
  outside its card the first time a reader drags a corner sideways. The frame's arrangement is
  the answer for anything built out of frames, which is the recommended shape for a resizable
  card.

- [x] **The definitions a deck inherits from are editable.** A layout and the master open the
  way a component's definition does — the mechanism §10c said would serve all three — with their
  own panel group (name, background, how many slides a change reaches) and 따르는 장에 적용.
  Three measurements came out of it: `slideMaster` and `theme` were **drawn by nothing**, so a
  master's placeholders could be read and clicked by nobody; a layout has **no size of its own**
  (it is the shape of the slides that follow it, so the fit arrives from `stageFit`); and
  `setBoxStyle` refuses a node that is not a box, which is why nothing could ever change what a
  layout *was*.

- [ ] **A layout's own graphics do not appear on the slides that follow it.** Measured: a
  rectangle added to a layout draws on no slide. Which is the components' rule in a second place
  — a template cannot draw a foreign node — so the honest options are what `applyDesign` does
  (copy the arrangement when asked) or a real transclusion, and the second one has the hazard
  written up in §10b-2: everything that walks the tree, including the save, would see children
  that are not in the document. PowerPoint draws master graphics live; this does not, and says so.

- [x] **A deck that is not a line.** A shape a reader presses and the page it shows: `surface.id`
  (a page had no durable name at all), `goTo`/`goToKind` on the shape, `setBoxJump` (which mints
  the target page's id, like motion naming a shape), the show honouring a press, and two audit
  faults — a button pointing nowhere, and a page nothing leads to. Measured first, and it is why
  this was small: `present.tsx` already collected the shapes whose press runs something and
  already had the rule *a press that fires one does not also advance the deck*.

- [x] **The deck's map.** Pages as a graph — `layoutGraph` for the ranks, the deck's own
  connector router for the arrows, the spine drawn faint beside the jumps, and the two things a
  filmstrip cannot say (a page nothing leads to, a button that leads nowhere). A view: nothing is
  written, so a page cannot be dragged. It found a real modelling error — the first reachability
  rule reported five of the sample's six pages as unreachable the moment one button existed,
  because *pressing on* still reaches them; an island is a **hidden** page nothing links to.

- [x] **Dragging a jump in the map.** An arrow's end, dropped on another page — the connector's
  own gesture. The question that decided it: *which button* is not answerable by a drag between
  two pages (a page holds one, four or none), so the drag takes hold of the button that is already
  there and making a new one stays in the panel.

- [x] **Links only.** `document.advance` — the first deck-level setting this schema has, because
  "what does a click mean here" cannot be answered per page. A press plays the next build and then
  stops; the scroll show is refused (a scroll is a line); the presenter is not promised a next
  page; the map draws no spine and the check asks the larger reachability question.

- [x] **A button that opens another deck** at a page. `goToDeck` + `goTo`, where what can be
  pointed at is a **source the product can fetch** — there is no library of decks, so there is no
  id for "the pricing deck". Three things follow from *another document is not in this one*: the
  model resolves nothing, the check warns (볼 것) rather than telling, and a failure to open is
  said out loud instead of being a button that does nothing in front of a room.

- [x] **A library of decks.** The reader's own, by name — the naming in the model
  (`deck-library.ts`: durable, unique, derived from the deck's title) and the bytes in the app
  (IndexedDB, chosen by measurement: a pictureless deck is 8–42KB and one photograph is a base64
  megabyte, so `localStorage`'s five would fail by throwing in the middle of a save). `goToDeck`
  now holds a name *or* an address, resolved by the host, because the same deck is a name here and
  an address on a machine that has never seen this library.

- [x] **A shared component library.** A definition copied in from another deck, remembering the
  deck, its id there and what it said (`fromDeck`/`fromId`/`fromSignature`) — so "the brand kit has
  moved on" is a string comparison and the newer copy is *offered*. A reference was never available
  (a template cannot draw a foreign node), which is why this is the same shape Figma has across
  files. `accessOfTree` is the piece that made it possible at all: another deck answered like a
  store, without being loaded.

- [x] **A definition behind its brand kit says so in the components panel**, not only in the
  library dialog. The comparison is pure and the reading is storage, so the app reads (when the
  panel opens — a keystroke is not a reason to open three files) and the panel is handed a set.

- [x] **The 다른 덱 field offers the library's names**, and keeps 직접 입력 for an address. It was a
  free-text box asking a reader to type a name they had no way to see.



- [x] **A variable could drive exactly three things.** Measured: `bindText`/`bindFill`/`bindVisible`
  were three attributes on every canvas node, so a `number` could only ever be text and a card's
  corner radius, a frame's gap and a badge's opacity were unreachable — and the only way to reach
  them was more attributes in the *shared* vocabulary, each costing an exemption in every product
  that does not read it (Word had three). A binding is a **declaration node** on the definition
  now (canvas-model §10g-2): any attribute a part declares, any named piece however deep, one list
  per card, nothing on the placement's copies, and three exemptions off Word's list. The panel
  offers what the part declares and the command refuses the rest, which is the check a content
  model cannot make.

  Two things fell out of it. A placement is now created with the card's **defaults** substituted —
  an empty value map meant the bindings were skipped, which only looked right while they lived on
  the parts and the author had written the same words twice. And a `number` variable becomes a
  **number** where it lands, because the document keeps a variable's value as a string (one shape to
  write, diff and check) and an attribute that means a length has to be one.

- [ ] **Variants, instance swap and document-wide variables** are deliberately not taken from
  Figma; the reasons are in canvas-model §10g. Worth revisiting only with a measurement: a card that
  genuinely needs a *structurally* different shape per state is the case a `choice` cannot cover.

- [x] **A placement draws its definition, live.** The engine can transclude after all, and the first
  answer was wrong about *where*: a renderer that builds the parts' elements evaluates every one of
  them against the placement (measured — two parts with the placement's box and sid), while a
  resolver in the proxy the view reads children through gives each part its own data. One hook on the
  store (`setContentResolver`), and the save is untouched because the save has its own walk.

- [x] **Took out the machinery that copies belonged to.** `applyComponent`, `componentApplyPlan`,
  `instanceState`, `componentStale`, `partCopy`, `placementFills`, `instanceSlot` and the `partOf` /
  `appliedFrom` attributes are gone, with the 적용 button, the 모두 적용 button and the 뒤처짐 badge.
  What stays is the brand kit's copy (§10f), where a definition really is in another document — now
  the only place in the product where anything can fall behind anything. What replaced the panel's
  count is the question a reader actually has: **how many places use this card**, so an edit is made
  knowing what it reaches.

  The resize moved into the resolver as planned, and it turned out to be the better place rather
  than the necessary one: `fillChildren` and `layoutChildren` run over the resolved tree, parent
  before child, so one drag changes the placement's own box and **nothing else** in the document.
  Two things fell out of it — `setBoxLayout` refused 가득 on a card's own part (its guard demanded a
  laying-out frame for a parent, and a card's part has a `component`), and the deck's own check went
  blind to everything inside a placement. Both fixed; the second is the entry at the top of this
  file, because it is a question every walk in the product now has to answer.

- [x] **The component model moved to the shared canvas layer** (`canvas-component.ts`,
  `canvas-instance.ts` in `office-word`), because the schema that declares `component` and
  `instance` is the office schema — Word's canvas already has cards in its document format and just
  has nothing that reads them, so two readings would be one of them wrong. The commands, the panels
  and the deck library stayed: making a card out of a selection needs "the surface the reader is
  on", which is a deck's question. Found by the move: `DeckAccess`/`DeckNode` were declared
  field-for-field twice, and `deckComponents` had a product's name on a shared function
  (`componentsOf` now). Re-measured what Slides takes from Word — **22 import sites, 65 symbols**,
  up from four — and `docs/SHARED-LAYER.md` now proposes a second package, `office-canvas`, out of
  the seven `canvas-*` files that a word processor reads none of.

- [x] **Document-wide variables.** A `variables` container beside `components`, `variable` nodes, a
  reference written where the value goes (`fill: 'var:주의'`), one walk resolving it beside the
  theme's, a panel that says how many places use each one, and the picker offering the document's
  colours beside the theme's twelve — so nobody types `var:`. A `componentBind` may name either the
  card's variable or the document's, **card first**, so importing a card into a deck with the same
  name cannot change what the card means. §10h.

  What the measurement allowed, and it shaped the whole scope: a reference **commits** into a string
  attribute and is **refused** in a number or a boolean (`cornerRadius`, `width`, `visible` — the
  whole transaction fails, which is the validator doing its job). So a number or a state reaches a
  shape through a card, where a binding is a declaration and the conversion happens off the
  document.

- [x] **A bare shape takes a number, a state or its words from a variable now** — `varBinds` on the
  shape, `{attr, var}` like a card's binding, resolved in the content resolver (§10h-2). Both open
  questions were answered by measurement rather than by argument:

  - **Where the declaration lives.** Not a child node: every scene shape is `atom: true`, so that
    would turn rectangles, ellipses, lines and pictures into containers — changing what an atom means
    for selection, editing, the DOM mapping and paste normalisation, to hold two strings. Not a list
    beside `variables` either: a shape's only durable name is `name` and it is not unique
    (`namedBoxes` takes the first of a name per surface), so a binding would silently apply to one of
    two same-named shapes.
  - **Where it is resolved.** The renderers cannot: `attrsOf` is read in **62 places** inside them
    and takes no environment, so a bound corner radius would have reached the paint and not the
    border radius. The resolver it is — and it resolves *attributes* there for the first time, by a
    parent handing back a child as it is drawn, with a node's own words resolved as its children
    because characters are content.

  Found by the **full browser suite**, which is what a milestone run is for: the first rule for which
  rows to draw was "every attribute the shape declares", and that put a `flipX` row in the panel
  labelled `flipX`, because the product has no word for it — a panel of raw attribute names, and a
  test broken by accident because `getByLabel('X')` matches "flipX 문서 변수". The rule is now *a row
  exists where the product has a word for the attribute* (`BINDABLE_ROWS` against `LABELS`), which
  bounds the list and puts adding one in a single place. Two specs also learned to ask for their
  labels **exactly**: two controls about 간격 in one panel is ordinary, and a substring match is the
  loose half.

  And one refusal that has since been lifted: `x`, `y` and `rotation` were refused with a sentence
  about **behaviour** — "a box that snaps back when you drag it is a worse thing to meet than a size
  you cannot type" — and a behaviour can be fixed. Measured: a **locked** box is refused one step
  earlier still (the hit test goes through it), which is right for "I have decided where this goes"
  and wrong here, since a reader must be able to select a shape to unbind it. So the move drag is left
  out **before it previews** — the shape never follows the pointer — and the rotate grip goes with it.
  What `UNBINDABLE` holds now is nothing; what `OFF_LIMITS` holds is identity and reference, where a
  variable would mean a document naming things by a value that can change under it.

- [x] **A shape's *size* follows a variable now, and the count decided how.** The places that read
  geometry were counted first, as this entry asked: `boxOf` in **31 call sites across 14 files**, plus
  six direct reads — the outline, the handles, the guides, the snapping, alignment, group bounds, the
  audit's "off the edge" check, hit testing. Teaching all 37 to ask the resolution is not the
  expensive part; the expensive part is that every *new* reader would be silently wrong until somebody
  noticed.

  So a bound size is **written** into the document by the pass that already settles derived geometry,
  which leaves all 37 readers and every writer untouched. It is derived state in the document — and
  the same trade the arrangement already made, for the same reason, with the same convergence rule
  (answer only what differs). Three things fell out, each measured: the **container wins** over a
  binding (parent before child in one pass — written the other way first, and the test said 2400 where
  the frame said 6000); the reader's own size is **refused** while a variable owns it (greyed fields,
  no handles, `setBoxGeometry` says no), because a width written there is put back by the next pass;
  and `x`/`y`/`rotation` stay refused, because a box that snaps back when you drag it is worse to meet
  than a size you cannot type, and what a drag on one should mean wants its own measurement.

- [x] **A page can declare its own variables** (§10h-3), which is the scope a deck wanted beside the
  document's: "every card is our accent, except on the summary page" is one declaration on that page
  rather than an override on nine shapes. `surface` content is `variable* (block+ | (scene | frame)*)`,
  the order is document → page → card → placement, and the one exception is written where it lives: a
  **card's own** declaration beats both, because a card carried onto a page must not change meaning.

  The question behind it was really about vocabulary — *a deck **is** a document*, one `document`
  node and one file, so the `variables` container was already document-wide. What did not exist was
  the narrower scope.

- [x] **Variables shared across documents** (§10h-4): `fromDeck` and `fromValue` on a `variable`,
  `importVariable`, and the library dialog listing a deck's **values beside its cards** — three states
  each, like a definition's. A clash **overwrites** where a card's clash renames, because a variable's
  name *is* the reference: importing under another name would change nothing that already names it.
  Which is also what separates an import from a paste — a paste keeps the destination's value because
  nobody asked, and an import is somebody asking.

  And the naming problem dissolved rather than being solved: an imported value **is this document's
  own**, drawing and resolving and scoping like any other, so there is no third list and no third
  word. What the two remembered fields buy is one badge on one row.

- [x] **A variable's value is authored in the control its kind asks for.** It was a text box whatever
  the kind: a `boolean` typed as the word `true`, a `choice` typed instead of chosen from the options
  declared right beside it, a `number` with no arrows. A *placement's* variables were already drawn
  this way (`ComponentGroup`), so the product had two controls for one idea — which is how it ends up
  with two kinds of colour picker. The document still holds one string whatever the kind; the control
  is how a reader authors it correctly. Changing a `choice`'s options now moves the value onto one of
  them, because a select drawing a value nobody can pick again is what the free-text field left behind
  every time.

  Found on the way: the value control's `data-` marker only existed on the text branch, so a test
  looking for it was tied to the kind it was not testing. The **row** carries the marker and the
  control carries its name, and that pair holds for every kind.

- [x] **A variable can be renamed now**, and it is the migration the entry said it would be: one walk
  finds every attribute, every shape binding and every card binding that means *this* declaration,
  one transaction writes them, and the name field on the row is the gesture. What the walk found on
  its first day was two faults in the **count** the panel had been showing all along: a shape's own
  binding was never counted (the walk looked for `var:` references and a `varBinds` entry holds a
  bare name, so a variable three shapes took their width from said *0곳*), and a page declaring the
  same name was counted as the document's — the small half being an overstated number and the large
  half being that renaming one of those references would have changed what a shape draws. One walk
  answers both questions now, so the number a reader is shown is exactly the set that gets rewritten,
  and a *place* became a node's attribute rather than a reference: a gradient naming it in two stops
  is one thing to go and look at (§10h-5).

- [ ] **A card's own variable still cannot be renamed** (`componentVar`), and it is the same shape of
  migration one scope down: every `componentBind` in the definition and every `componentValue` on
  every placement — *in every deck that ever copied this card*, which is the half the document's
  rename does not have. Left until the walk is asked for: the pieces exist (`componentsOf`,
  `instanceValues`), and what is missing is the answer to what happens to a copy that is not here.

- [ ] **Word's canvas half: measured, and what is missing is a producer and a pointer.** Asked
  because inline atoms and block objects are not one question. An inline image, an inline formula and
  an emoji are *in the flow*, so a **range** selects them and that is right — every word processor
  agrees, and "two non-adjacent inline images at once" is a gesture none of them has. The block
  objects are the other half, and there the earlier answer was wrong: "Word never makes a node
  selection because a page flows" is true of the flow and hides that **Word's canvas is declared,
  drawn, arranged and paginated — and has no command that makes one and nothing that can select
  one.**

  Measured 2026-08-25 (`docs/SHARED-LAYER.md`, "What a canvas *editor* would share"):

  - the deck's overlay imports **75** symbols and **24 already live in `office-word`**;
  - of the other 51, **2,387 lines name no product at all** (crop, paints, gradients, corners, flip,
    group bounds, layout-arrange, text-box) and **1,078 more name one only as a parameter** —
    `manipulate.ts` is 630 lines of move, resize, rotate, snap, marquee and hit-testing a turned box,
    and the word "slide" appears in its code three times;
  - the commands need **one seam**: `slideAt` walks to the nearest `surface`, and a canvas node's
    container is a `canvasBlock` in a page. "Which canvas is this on" has one answer per product,
    the same shape `surfaceOf` and `trackHostAt` already have;
  - the overlay itself is **3,754 lines** of React whose features are *interleaved* — crop, gradient,
    path, connector, guides, marquee and handles appear across the whole file — so it cannot be
    extracted by copying;
  - and the question nobody has answered: a deck has one stage holding one surface, a page has
    **many** canvas blocks at their own rectangles inside a scrolling, paginated, zoomed document, so
    the overlay's founding rule — one measurement, then arithmetic — has to be re-answered per canvas
    block.

  The first slice, if this is taken: `insertDrawing` plus the shapes, and a **thin** overlay over one
  canvas block — select, move, resize, marquee. Crop, gradients, paths and connector bending are
  already-shared arithmetic and can be turned on after.

  - [x] **The producer.** `insertRectangle`, `insertEllipse`, `insertLine` and `insertDrawing` in
    Word, on a 그리기 group of the ribbon. The gesture is "insert a shape" and not "insert a canvas":
    a reader who presses 사각형 means a rectangle in their document, so the command makes the
    `canvasBlock` when there is none — **in the same transaction**, because one press has to be one
    undo and an empty canvas left behind is the editor keeping half a gesture nobody made. Where the
    shape goes is the canvas the selection is on (`canvasAt`, the shared "which container places
    what is in it") and otherwise a new drawing after the block the caret is in, which is what
    "insert" means everywhere else in a document. A drawing starts as wide as the *text* is —
    computed from the section's page setup, not a constant — and half as tall, which is Word's own
    drawing canvas at default margins.

    The arithmetic went to the canvas layer (`office-word/canvas-insert.ts`) and the deck now
    **calls it**: "a new rectangle is blue, a quarter of what holds it, in the middle" names no
    product, the same renderer draws both, and a shape that changed colour on its way from a deck
    into a document would be two answers to one question.

    And the harness caught the fifth command before it shipped: `insertTextBox` would have put a
    `textFrame` in the document and **Word has no renderer for one** — a reader pressing a button,
    seeing nothing, and having changed their file (`every-command-can-be-seen`). Text inside an SVG
    canvas is `<foreignObject>` and is its own question, below.

  - [x] **The arithmetic moved**, which is the half the pointer needs before it exists:
    `canvas-manipulate.ts` (move, resize with the aspect and centre modifiers, rotate, snap,
    marquee, hit-testing a turned box) and `canvas-box.ts` under it. Nothing changed but where it
    lives and one parameter name — `guidesFor(others, slide)` is `canvas` now, which was one of the
    three product words the measurement counted. The deck keeps `manipulate.ts` as a name that
    re-exports, so its forty callers did not churn.

    It closed a duplicate on the way: `boxOf` existed in the deck's `geometry.ts` **and** in
    `canvas-layout.ts`, the second written from scratch with a comment saying it could not import
    the first because the dependency runs this way. Both are one function now, and the rule it
    carries is not a taste — a negative extent is what dragging a handle past the opposite edge
    means, and a reader that forgot it would draw nothing where a shape is.

  - [x] **The pointer**, and it is *thin* on purpose. `apps/word/src/drawing-overlay.tsx` is a few
    hundred lines against the deck's 3,754, because it does **not** swallow the pointer: it is
    `pointer-events: none` and listens on the document, so the **browser** hit-tests the shapes —
    including a rotated one, where an SVG transform is exactly the sum the deck's `unrotate` has to
    compute. What that costs is that a drag has to start on the shape itself, which is what it does.

    Multi-selection from the first line, because that was the ask: a press replaces the set, Shift
    or Ctrl toggles one, a band takes everything it **touches** (intersects, not contains — a reader
    dragging across three shapes means those three), and a press on something already selected keeps
    the set so three shapes drag together. A press on the empty part of a drawing clears.

    A drag does not touch the document until it is dropped — the drawn elements move with a CSS
    transform and one `moveShapes` writes the finished move, so one gesture is one entry in the
    history rather than thirty. Two pixels of slack before it counts as a drag, because a pointer
    moves a little while a finger presses.

    `moveShapes` is Word's own for now, with the reason written where it lives: the deck's
    `setBoxGeometry` refuses a locked box and a size a **variable** owns, and a page has neither
    yet, so this is the honest small version rather than a shared command with half its guards
    switched off.

- [ ] **Unify `moveShapes` and the deck's `setBoxGeometry`**, when a page grows the second half — a
  lock, or a value something else decides. Two commands that move a shape is exactly the shape of
  duplication this repository keeps finding, and it is deliberate today rather than accidental.

  - [x] **Handles, Delete and the arrow keys**, all of them written for a **set**. Eight handles
    around the union of what is selected — one frame, upright, which is what every drawing tool does
    with a multiple selection and what makes a set something a reader can act on. The same handle is
    pulled on every selected shape by the same amount, which is the deck's own answer, so the two
    products behave the same way. A resize is not previewed with a transform the way a move is:
    `translate` cannot say *bigger*, and a shape that scaled its stroke while being dragged would be
    showing something the model will never hold — the frame follows instead.

    `Delete` and `Backspace` are guarded by **`shapesSelected`**, the same shape `tableSelected`
    already had and for the same reason: with a caret in a paragraph, Delete is a character. The
    canvas itself stays when its last shape goes — a reader put it there.

    Two things measured on the way, both of them the harness of experience rather than a test:
    `getKeyString` normalises an arrow before the registry looks it up, so a map written `ArrowUp`
    matches **nothing** and the caret moves instead — the deck spells them the browser's way because
    it matches its own chords rather than going through the registry. And a browser test that
    clicked a paragraph and typed was testing the sample's `fieldDateTime`, where typing is refused
    correctly, and calling it a fault in the drawing; the caret is set through the editor now.

  - [x] **Getting back to writing**, from the question *"with shapes selected, can a reader type?"*.
    Measured in the browser first, in **both** products: a letter goes nowhere and Enter does
    nothing at all. Safe — the engine refuses a character that has no caret to go into, so nothing
    is silently written somewhere odd — and dead, because Enter means *give me a line* everywhere
    else in a document.

    A page can answer that and a deck cannot: a document is a column of blocks with a line always
    available after any of them, and a slide has nowhere for a caret to fall out to. So **Enter**
    makes a paragraph right after the drawing and puts the caret in it, and **Escape** only moves
    the caret — after the drawing, or before it when the drawing is last — because a reader who has
    finished with a drawing does not want an empty paragraph to delete afterwards. Enter *always*
    makes one rather than sometimes reusing what is below: one key that sometimes writes and
    sometimes navigates is two gestures a reader cannot tell apart before pressing.

  - [x] **What a set is for: lining it up, spreading it out, and what is in front.** Twelve commands
    on a 그리기 ribbon group of their own — six edges, two axes, four depths — over arithmetic the
    canvas layer already had and the deck has been calling for months. A page had none of it: a
    drawing was three shapes a reader could only line up by eye.

    Each greys out on its own answer rather than on a rule written in the app: aligning wants two
    shapes, distributing wants three (with two the gaps are equal by definition), ordering wants
    one. Equal **gaps** rather than equal centres, which is the reading that survives boxes of
    different widths — what a reader sees is the white between them. Depth is a `moveNode` inside
    the drawing, because document order *is* paint order in an SVG, and the deck's two orderings
    come with it: to the front in the order they already had, and towards an edge the nearest one
    first so two adjacent shapes do not swap through each other.

    A selection spanning **two** drawings acts on the first shape's canvas and leaves the rest
    alone: each drawing has its own origin, so a frame across two of them means nothing.

  - [x] **Snapping, and the lines that say why.** A drag builds its guides once at the start — every
    other shape's edges and middle, plus the drawing's own edges and centre, which is the position
    an author aims at most and can never hit by eye — and the whole selection snaps as **one box**,
    so a set lands together rather than each shape finding its own line. The threshold is eight
    *screen* pixels turned into model units, the deck's number and its reason: a fixed model
    threshold feels sticky on a page zoomed out and dead on one zoomed in. What is drawn is what is
    written — the snapped delta goes to the command, not the pointer's own.

    Two things it forced, both worth keeping. **Cmd/Ctrl is not a selection modifier** here: the
    deck already spends it on *exactly here, no snapping*, and a modifier that also changed the set
    would make that unreachable, because a press that changes the set never becomes a drag. Shift
    adds to the set; Cmd/Ctrl turns snapping off. And a test that aimed "left edge against left
    edge" with boxes of **different widths** was ambiguous by construction — the snap picks the
    closest edge-to-guide pair per axis, and centre-to-centre was nearer — which is correct, so the
    fixture uses two boxes of one size and the three pairings agree.

- [ ] **Typing with one shape selected should write into it**, which is what PowerPoint and Keynote
  do, and what neither product does today. It needs a shape that can hold text: the deck has
  `textFrame` and reaches it by double-click, and a page has none until `<foreignObject>` is
  answered. Then it is one rule for both — *one* selected shape takes the letters, several take
  nothing, because nobody can say which of them was meant.

- [ ] **A shape on a Word drawing cannot be rotated**, and nothing draws a rotate handle. The
  arithmetic is shared already (`angleOf`, `snapAngle`); what is missing is the gesture and a
  command.

- [ ] **A text box on a Word drawing** needs `<foreignObject>`, which is a design question rather
  than a fifth line in the insert list: what a caret does inside one, how the paginator measures it,
  what print does with it. Refused for now by the harness rather than by a person, which is the
  harness working.


**Still open and not in a phase**

- [ ] **Per-level formatting** for a body placeholder: PowerPoint formats by
  outline level and the resolver approximates by paragraph index, written down in
  `layout-format.ts`.
- [ ] **A second reader.** Every test is one person editing one deck, which is
  the only thing the product does.
- [ ] **Cell selection inside a slide's table needs the overlay's cooperation** —
  it works today only because the overlay goes inert while a box is being edited.
- [x] **The presenter's screen is a window of its own**, and this entry was **stale** — the second
  window shipped (`presenter-window.tsx`, `window.open` plus the deck drawn into it) and the item
  sat here open. Found by sweeping the open list rather than by anyone meeting it, which is the same
  fault the stale exemptions were: a list that says a shipped thing is missing costs the next person
  the time to find out.

- [ ] **A film's out-point is enforced to about a quarter of a second.**
  `timeupdate` fires roughly four times a second, so a trimmed clip overshoots its
  end by up to that much. Deliberate over a timer, which measures wall time and
  cannot survive a buffering stall — see Done. The honest fix is
  `requestVideoFrameCallback`, which reports every *presented frame* and is the
  only clock a film actually keeps.

- [ ] **Two commands in one tick can each create the slide's motion track, and
  one of them loses its step.** Found while fixing the naming version of this (see
  Done): with no track yet, two `setBoxBuild`s issued before either commits both
  build a transaction that creates one, and the timeline comes out with **one**
  step instead of two — measured. With the track already there, both land. The
  naming had a fix that fits in the command; this one does not: it wants commands
  to be serialised, or a create-if-absent that is safe to run twice, which is an
  engine question rather than a Slides one. Nothing reaches it today because the
  panel awaits between clicks.

- [ ] **A SMIL filter cannot be eased.** Its `<animate>` runs `calcMode="linear"`
  through a list of values, so a melt swells and recedes at a constant rate while
  every other motion in the product has a curve. SMIL has `calcMode="spline"` and
  `keySplines`, which is exactly a cubic-bezier — so the step's own easing could
  be handed to it, for the presets that are curves rather than springs.

- [ ] **A step's colour cannot be picked on the canvas.** A glow's colour is typed
  into a field; a gradient's stops are dragged on the shape. The second is better,
  and the machinery (`data-paint-canvas`) exists.

- [ ] **A motion cannot be aimed at a fill as a *target*.** Every effect animates
  the box a step names, or a track the box's fills read — which now covers every
  property a layer has (its opacity, its pan, its zoom). What is not expressible is
  a step whose *target* is "the second fill", and that is a model question — a step
  would have to name a part of a node — rather than the CSS wall it used to be.
  Nothing has asked for it; written down because the drawing no longer stands in
  the way.

- [ ] **What is left of the chrome's own controls is an instrument and a
  gallery**, counted and held by the ratchet in
  `apps/slide/tests/shared-controls.spec.ts`: the timeline's axis and transport
  (16), the preset gallery (3), the paint panel's gradient stop (1), the rail (1).
  Down from 34 — the shell, the properties panel, the notes and the file row are
  migrated, and the file picker became a primitive. Each of the four that remain is
  a *drawing* rather than a form (bars, a playhead, a ruler, a curve editor; tiles
  that play their own motion; a handle dragged along a bar; a row that is a
  picture and two badges), which is why the number stops going down here rather
  than at zero.

  **`office-ui`'s older components still draw their own buttons** — the zoom's
  three icon buttons, the palette's swatches, the colour field's trigger. Left
  alone deliberately: they are already drawn from the tokens, so what they do not
  share is *code* rather than *look*, and each one is in both products' chrome
  where a change is two suites to re-run for no visible gain. What is worth having
  eventually is a borderless tone on `Button`, which is what the zoom's buttons
  actually are.

  **And the transport is deliberately not shared yet.** Word will want one the day
  it plays anything, and today it plays nothing — one user is a component nobody
  can design. The rule this repository has been using holds: two copies is a
  coincidence, three is a component nobody wrote. Written down so the next person
  finds a decision rather than an omission.

- [ ] **Word maps no tokens.** It imports `tokens.css` and takes the defaults,
  which is correct today — its chrome *is* Tailwind's palette — and means the two
  products still do not provably agree. When Word gets a palette of its own, the
  mapping is one block, and the check that it resolves is one test.

- [ ] **A radial gradient cannot be rotated, and never will be through CSS.**
  `radial-gradient` has no rotation syntax — measured, `/ 30deg` is rejected — so
  the rotated ellipse Figma draws would need the gradient painted some other way
  entirely (an SVG fill, or a rotated child element that is clipped). Written down
  as a *wall* rather than a task, so nobody looks for the missing handle.

- [ ] **An additive `opacity` cannot mean what a reader means.** A fade over a
  shape at 50% opacity ends at 100%, because `replace` ignores the shape's own
  value — and `add` cannot be used instead: an additive fade *starts* at the
  shape's own 1, so it would not fade at all. What is meant is a **multiple**, and
  the Web Animations API composites by adding. The way round it is the shape's
  opacity through a registered `<number>` track, which is a track for a property
  that has another way — so it waits until something else needs the same trick.

- [ ] **Nothing draws the *travelling* shape while scrubbing a path.** The
  playhead shows the moment on the slide, so the shape is where the path puts it —
  but the path itself is only drawn when its bar is selected. A reader dragging the
  playhead along a path is watching the shape without the route.

- [ ] **The `paragraph` unit knows a class name.** The stage finds a paragraph
  with `.w-paragraph`, which is Word's renderer's class — the one place the
  deck's playback knows what the renderer called something. A `data-` marker the
  renderer owns would be the honest seam, and the same question is open for the
  caret filler.

- [ ] **The conformance harness cannot see a resource.** `every-node-is-drawn`
  walks what a document can *contain*, and a resource is referenced by id rather
  than placed — so `slideLayout`, `surfaceNote` and now `motionTrack` and
  `motionStep` are never examined. All four are read by something today, so
  nothing is wrong; what is missing is the check that would say so if one stopped
  being. Measured on 2026-08-19: the placeable set is 42 of the schema's types,
  and none of the four is in it.

- [ ] **A selection dropped for pointing at a deleted node says nothing.**
  `updateSelection` refuses a selection whose nodes are gone, clears what was
  there and emits neither `editor:selection.model` nor `editor:selection.change`
  — and `editor.test.ts` asserts that silence deliberately. Nothing is broken by
  it today: every case that drops a selection this way also changes the content,
  and a host listening to `editor:content.change` re-reads anyway. Measured on
  2026-08-19 by announcing the clear and then taking it out again — the deck's
  suite is green either way. Left alone rather than changed on a hunch, and
  written down because a host that redraws on selection alone would be stale and
  would have no way to find out why.

- [x] **`bgColor` painted nothing, and the test beside it passed the whole time.** The command wrote
  its colour into an attribute called `color`; the schema declares `bgColor`; every reader asks for
  it by name — the two apps that draw the mark (`attributes.bgColor`) and Word's format resolution
  (`attrs.bgColor`). So it committed, reported `true`, and did nothing, which is the one failure a
  reader cannot report.

  Fixed at the command rather than by deleting the mark, and the measurement is why: `bgColor` looked
  like a dead duplicate of `highlight` until the sweep showed it is drawn by two apps and used as
  *the* example mark in eight renderer tests. The two are Word's own pair — 음영 against 형광펜, a
  background of any colour against a pen with a palette — and the doc's two rows both saying
  "Highlight." was the whole confusion. Word maps both onto its one highlight format because
  `EffectiveFormat` has no shading, and says so where it does it.

  The test asserted which **mark type** was written and never what it carried, which is how this
  survived. `office-word/test/mark-commands-write-what-the-schema-declares.test.ts` is the guard now:
  every mark command runs on a real editor, the mark is read back out of the store, and each
  attribute is held to what the schema declares that mark has — in both directions, because an
  attribute the schema does not declare is one nothing will ever read.

### Slides has an end-to-end suite now

Word has 291 e2e tests and a deck had none, so everything about the deck was
verified by throwaway probes written for one measurement and deleted after it.
That is why a zoom control reading 10% survived a week of looking at the app:
nothing was watching, and the eye reads what it expects.

Thirteen to start, each one a bug that shipped or a behaviour a probe had
checked by hand a dozen times: the zoom says what the stage draws, the rail
shows names in full beside real pictures, a drag moves the shape and settles
where it is dropped, arrows nudge by 15 and 144 twips, the clipboard keys work,
Delete undoes, entering a box gives the *model* a caret, and a note is editable
and never drawn on the slide.

Run with `pnpm test:e2e:slide`, on its own port so a deck's suite and a
document's can run at once. Proved rather than assumed: the zoom test fails when
the scoping fix is taken out.

Twenty-one now: the thin places named when the suite was started — pictures,
layouts, snapping, going inside a container, presenting — are covered, each by
the behaviour a probe had been checking by hand.

- [x] **A group's box follows its children** — see Done.
- [x] **Nothing deselects a box** — both gestures already did; nothing heard
  them. See Done.
- [ ] **Nothing covers a second reader.** Every test here is one person editing
  one deck, which is the only thing the product does today.

### Slides — what is next, in order

The three model questions these depend on are settled in
[`docs/specs/canvas-model.md`](./specs/canvas-model.md): one unit, who owns a
coordinate, and where formatting comes from. They were settled together because
each was about to be answered twice — once by the clipboard, once by layouts —
and an answer given twice is an answer given differently.

Ordered so that each one is unblocked by the one before it.

1. - [x] **One unit.** Word read a canvas shape's numbers as pixels and Slides
     read them as twips, fifteen apart, with the schema declaring both as plain
     numbers and neither product disobeying it. Twips now, in one conversion:
     the view box keeps the model's own numbers so the shapes inside carry
     theirs untouched, and only the element's CSS size converts. The check is
     `office-slides/test/one-unit.test.ts`, which lives there because that is
     the package that can see both. On screen: a canvas that drew 360×140 still
     draws 360×140, from 5400×2100.
2. - [x] **`toSurface` / `fromSurface`.** The container-to-slide conversion, in
     one pair of functions in `office-slides/selection`, with the overlay's
     inline walk replaced by a call. Grouping turned out *not* to be a second
     derivation: it rebases against a frame it is creating, so there is no node
     to walk to and `intoFrame` is the right tool — the difference is whether
     the container exists yet, and the two are worth keeping apart.
3. - [x] **A clipboard for objects**, and reachable — which it was not for a
     day. The commands were registered with no key binding and no toolbar entry,
     which is the pattern this repository exists to catch, committed within a
     day of adding a check for it. Ctrl/Cmd+C, X and V now, bound in the overlay
     beside Delete and for the same reason: what Ctrl+V means depends on which
     kind of selection is live, and only the overlay knows. Paste is handled
     before the "boxes are selected" guard, because it is the one that needs
     somewhere to put them rather than something to act on. Copy, cut and paste between slides,
     containers and decks. Two clipboards on purpose: the system's carries a
     shape to another window and is the reason the payload is JSON in text, and
     the extension keeps its own because reading the system's needs a permission
     the browser may refuse — without the fallback, copy and paste inside one
     deck would work only where the permission happened to be granted. Cut is
     one command so it is one undo. Found on the way: `deleteBoxes`,
     `duplicateBoxes` and `nudgeBoxes` had the same slide-level assumption the
     arrange commands had, so none of them worked inside a frame either.
4. - [x] **Formatting through the layout.** A resolver shaped like Word's:
     the layout's placeholder of the same *role*, then direct. The ribbon's font
     controls now read 33pt for a title and 20pt for a body, from a deck where
     nothing on any slide sets a size. Two things found on the way:
     `layoutPlaceholders` returns *copies*, whose children are nested nodes
     rather than sids, so reading a placeholder's paragraphs found nothing —
     `layoutPlaceholderSids` is the reading half; and a size the presets do not
     offer left the control blank, which reads as "the selection disagrees with
     itself" when it agrees perfectly.
   - [x] **Applying a layout to a slide that already has content** works, and
     needed the other half of the resolver: the renderers read `WordEnv.styles`
     rather than a paragraph's attributes, so a layout the *toolbar* knew about
     and the drawing did not gave two answers — 54pt reported, 13px drawn.
     `withLayouts` puts the layer in `resolveNodeWith`, the seam Word already
     had for a table style's conditional formatting, and no renderer changed.
   - [ ] **Per-level formatting.** PowerPoint formats a body placeholder by
     outline level. A paragraph here carries no level, so the resolver takes the
     placeholder's paragraph at the same index and the last one after that —
     the nearest thing the schema can express, written down in the resolver.
   - [x] **Word's ribbon had the same blank-for-an-unlisted-size gap.** Not
     copied across — `choiceOptions` is in the toolbar model both products read,
     with the *unit* named on the model rather than in either app, because an app
     that divided a size by two would be an app that knew a `.docx` detail. Two
     products disagreeing about whether a 13.5pt selection shows blank is one of
     them being wrong, which is the rule for what belongs in one place.
5. - [x] **Snapping while resizing.** `snapResize`, a separate function from
     `snapBox` because a move and a resize are not one problem: a move shifts
     the whole box so any of its six lines is a candidate, and a resize holds
     the opposite edge still so only the lines the handle moves are. The box's
     *middle* is deliberately not a candidate for a resize — it moves as a
     consequence of the edge moving, and snapping it would put the edge where
     nobody aimed. The fight with the modifiers is settled by the modifier
     winning: Shift and Alt ask for an exact relationship a snap would break, so
     nothing snaps while one is held. Measured: aimed four pixels short of a
     neighbour's edge and landed on it; the same drag with Shift held stayed
     four pixels short.
6. - [x] **Pictures.** A `picture` scene node — placed, dragged and resized like
     every other object, distinct from the standard schema's `inline-image`,
     which flows with text. Declared, drawn and made in one change, which is the
     rule this schema learned the hard way. The button was permanently disabled
     before, and honestly so: `insertPicture` refuses a payload with no file in
     it, and nothing was opening a picker. `needsFile` is how the toolbar model
     says a control needs something only the reader can choose, without knowing
     what a file picker is. The file is read as a data URL so a saved deck keeps
     its pictures, and measured before it is placed so it arrives in its own
     proportions.
7. - [x] **Editable speaker notes.** A second `EditorViewDOM` over the *same*
     editor and store, rendering the note's subtree — which works because
     `render(tree)` takes any node with a sid. One history, one selection, no
     second copy of the text. Three things it cost, each worth knowing:
     `getDocumentProxy` hands back a *live* view of the store, so passing it to a
     second view means every diff compares the tree with itself and nothing
     redraws — a snapshot is needed; a view created against a region with
     nothing to draw never draws anything later, so it is made when there is
     something; and `surfaceNote` needed a renderer that knows *which view* it is
     in, because the stage renders resources too and would otherwise draw every
     note under the slide. `SLIDES_ENV_KEY` is that, the same seam Word uses for
     a header being edited.
8. - [x] **Real thumbnails** in the rail. A plain `DOMRenderer` per slide, not a
     second editor: a thumbnail is a picture, so it needs no contenteditable, no
     observer, no input path and no selection. Scaled with `transform` rather
     than laid out narrow — every box on a slide is placed by coordinate, so a
     tenth-size drawing is the same drawing, and re-laying-out would give a rail
     that lies about what the slide looks like.

     Two things it turned up. The overlay found the slide element with an
     unscoped `document.querySelector`, and a thumbnail is that slide with that
     sid — so the handles would have been placed inside a 128-pixel picture; the
     query is scoped to the stage now. And a content change is one event for the
     whole deck, so every thumbnail is asked to redraw when any slide changes:
     each compares the snapshot it drew last and skips if it is the same. Honest
     limit, written in the component — a hundred slides serialise a hundred
     slides per keystroke, and what that wants is an event that says which slide
     it touched.

### Slides — the second product

Chosen because the pieces were already there and because it is the one product
that forces a caret selection and a node selection to coexist. `packages/office-slides`.

**Six of these said `[ ]` while the feature was shipped and tested**, because the
work was tracked here *and* in "what is next, in order" below and only one list
was kept up. Measured rather than re-read on 2026-08-19: every one is registered
in the deck's kit, reachable from its chrome and covered by tests. A list kept in
two places is a list one of which is wrong — the same lesson the unread-attribute
list taught the same week. This section is the *shape* of the product; the
ordered list is what was done in what order, and neither is a second copy of the
other now.

- [x] **Schema.** Needed no new node type: a deck uses six stypes and all six are
  Word's. See below.
- [x] **Renderers** for a slide surface: absolute placement from `geometry`, and
  the scene nodes Word never drew. No `zOrder`: the model is a tree and a tree is
  ordered, so paint order is document order and bring-to-front is `moveNode`,
  which already has an inverse.
- [x] **A deck shell** — `apps/slide`. Not sharing `apps/word`'s chrome, which
  turned out to be the right answer rather than a shortcut: a deck has no ruler,
  no page furniture and no fit-to-width, and what it does share (the correctness
  CSS) moved into a package instead.
- [x] **Held to the harness.** Was a ratchet at 64 of 64 undrawn on day one; now
  `assertConforms` with 27 written exemptions.
- [x] **Slide commands** — add, delete, duplicate, reorder, hide, on the
  toolbar's own group.
- [x] **Multi-node selection.** `ModelSelection` had carried `nodeIds` since
  sets were first described and `Editor.setNode` dropped the field, so a set
  could be described and not made. And a node selection could not *survive*: the
  view writes it into the browser, the caret that leaves behind is read back as
  a range, and the shape was a caret in its text by the time anything looked. It
  now holds until the reader touches the text.
- [x] **Objects** — insert, select, marquee, drag, resize, rotate, z-order,
  align, distribute, duplicate, delete, nudge. The arithmetic is pure and
  tested; the app has pointers and two decisions.
- [x] **Presenting** — one slide filling the screen, hidden ones skipped, and
  the same elements the editor was already drawing rather than a second render.
- [x] **A properties panel** — `boxAt` finds the nearest box above the caret,
  `setBoxGeometry` and `setBoxStyle` change it, and the panel is the suite's.
  Not a stand-in for node selection: it is the honest answer to where the reader
  is while they are typing, which is what a properties panel is for most of the
  time. First thing anywhere to read `locked`.
- [x] **Direct manipulation** — handles, marquee, and double-click to type,
  alongside the caret inside a `textFrame`.
- [x] **Grouping.** `group` had been in the schema since the canvas nodes were
  declared, drawn since this product had renderers, and nothing had ever made
  one. Grouping and ungrouping are arithmetically one thing — rebasing the
  boxes onto their new parent — and the boxes are *moved* rather than copied, so
  their sids survive and nothing pointing at them is left pointing at nothing.
  `$alias` is what lets one transaction move things into a node it just made.
- [x] **Going inside a container.** A frame's and a group's children were
  unreachable: the overlay's candidates were the slide's *direct* children, so a
  rectangle in a frame could not be clicked, dragged, formatted or seen by the
  properties panel — clicking it selected the frame. A deck could make groups
  and could not edit anything in one. Double-click goes in and selects the child
  under the pointer, Escape or a click outside comes back out, and a dashed
  outline says where the reader is. The children's coordinates are their
  container's, so the overlay adds the container's origin when it reads and
  takes it off when it writes — in one place each, because that is a conversion
  two places eventually disagree about.
- [x] **A clipboard for objects**, between slides, containers and decks, on
  Ctrl/Cmd+C, X and V. Two clipboards on purpose — see the ordered list.
- [x] **Snapping and guides.** Both halves in one function, so the line drawn is
  computed from the same candidate that moved the box rather than being a second
  guess at what happened. The threshold is in model units and derived from the
  scale, because "close enough" is a distance on the reader's screen.
- [x] **Snapping while resizing** — `snapResize`, a separate function from
  `snapBox`, and the modifiers win: nothing snaps while Shift or Alt is held.
- [x] **A shape moves while it is dragged.** The overlay nudges the real element
  with the `translate` property for the length of the drag and clears it on
  release — `translate` and not `transform`, because the renderers write
  `transform` for a shape's rotation and the two compose without either having
  to know about the other. The document is still written once, at the end.

  A resize keeps the translucent stand-in: it changes the *size*, which
  `translate` cannot say, and scaling the element would scale the text inside it
  into something the model will never hold.

  Two things measured on the way. Using the overlay's `toScreen` applied the
  zoom twice, because the element is already inside the scaled stage — the shape
  trailed the pointer by exactly the zoom. And a pointer-down that misses every
  box starts a marquee without clearing the drag, so the release took the
  marquee branch and returned before putting the element back; settling is the
  first thing the release does now, whatever else it turns out to be.
- [x] **Dialogs** — slide size and layout picker, the first things to draw the
  suite's `Dialog`. Deck size is applied to every slide rather than held once on
  the document: a slide already carries its own size, and a second place saying
  it is a second place to disagree.
- [x] **Editable speaker notes** — a second `EditorViewDOM` over the same
  editor and store, so one history and one selection.
- [x] **Real thumbnails** in the rail — a plain `DOMRenderer` per slide, not a
  second editor: a thumbnail is a picture.
- [x] **Applying a layout**, and taking formatting from it: `withLayouts` puts
  the layout's placeholders in `resolveNodeWith`, the seam a table style already
  used, and no renderer changed.

### Zoom

- [x] **Zooming the slide in the viewport** — a shared `ZoomControl`, Ctrl/Cmd
  with the wheel anchored to the pointer, space-drag to pan, and a `fit` that is
  a *state* rather than a number so a fitted deck re-fits when the window
  changes and a deck at 150% does not.
- [x] **Word draws the shared widget** and keeps its own semantics, which is
  the whole shape of the answer: what is shared is where the minus button is;
  what is not is what "fit" means, how far it goes, and whether the wheel holds
  the point under the pointer. Measured, all four differences are right for
  their product — a page fits to its *width* because it is tall and scrolls, and
  its wheel does not anchor because a reader zooming a document is reading
  rather than pointing.
- [ ] **A pinch on a trackpad is a Ctrl+wheel**, which is why it works — but a
  two-finger pan is a plain wheel and currently scrolls the pane, which is
  right. Worth checking on a touch screen, where neither is true.

### The suite's chrome

`packages/office-ui` — the toolbar, dialog and property components both products
draw with. The division it rests on already existed inside Word and was the right
one: the toolbar *model* is DOM-free and product-declared, and only the drawing
was shared.

- [x] **Extracted, with Word moved onto it** and its e2e unchanged. Two Word
  names came out of the components on the way — `w-toolbar` baked into the
  toolbar and `w-toolbar-style` as a default — because a suite component naming
  one product is one the next product works around.
- [x] **Slides declares its own toolbar** and looks identical, which is the test
  of whether the split was right.
- [x] **`Dialog` has a user.** Slides draws it for slide size and layout, which
  immediately found that `ChoiceSelect`'s menu was `z-30` — above a toolbar and
  *below* a dialog's overlay, so a select inside a dialog opened its list under
  the dim layer and no option could be clicked. A component no product has drawn
  is a component nobody has checked, which is exactly what that entry said.
- [ ] **Word still draws no dialog.** Its format dialogs are the next user.
- [x] **Ctrl+wheel zoom is shared** — `useWheelZoom`. The claim that Slides did not
  have it was wrong; both did, and the deck's copy had three corrections Word's
  lacked. Word gained pointer anchoring. See Done for the three faults the move
  turned up, one of which was a frame-late transform in `ZoomFrame` that had been
  making a *different* measurement silently wrong.
- [ ] **Tailwind has to be told where the components are.** `@source` in each
  app's stylesheet. Miss it and every class attribute is intact with no rules
  behind any of them: the deck's ribbon rendered as one control per line, with no
  error anywhere.
- [x] **The window's frame is shared** — `AppShell` / `AppChrome` / `AppBody` /
  `AppMain`. Layout only; each product keeps its own class name on each region,
  because those names are what its own code finds the panes by. `AppFooter` was
  written and deleted for want of an honest caller — see Done.
- [x] **The subscription is shared, and split in two.** Six panels were
  hand-rolling the same counter — `useReducer((n) => n + 1, 0)`, byte-identical —
  with **three different sets of events behind it**. Now: `useRevision(subscribe,
  deps)` here, which counts and knows nothing; `watchAnswers` in `editor-core`,
  which knows which of its own events mean "an answer could be different"; and one
  line in each app joining them. See Done for the bug the drift produced and for
  why the split is where it is.
- [x] **This package has no editor dependency at all.** Its last tie was a type
  import of `MarkState` for a three-state toggle, which is `'on' | 'mixed' |
  'off'` — declared here as `ToggleState` instead, structurally identical so
  callers still typecheck. A control that knows how the host announces its state
  is a control the host cannot reuse; the rule is that everything here works from
  props and callbacks alone, and the wrapping into an editor-shaped thing belongs
  to a product package or the app.
- [x] **The control vocabulary came out too** — `packages/office-controls`. What a
  control *is* and how it reads a selection: `Control`, `ChoiceControl`,
  `PaletteControl`, `choiceOptions`, `currentChoice`, `currentPaletteColor`,
  `stateOfMark`, `stateOfAttribute`, `markTypesIn`, `commandsIn`. It was in
  `office-word`, so Slides imported half of it from a sibling product and rewrote
  the other half. React-free and DOM-free, which is why the shared half is now 17
  tests in 4ms. See "The four layers a control is made of" above.
- [x] **The icons came back out again** — `packages/office-icons`, keyed by the
  act rather than by any product's control ids. The chrome re-exports `Icon`, so
  this cost its callers nothing; what it bought is that an editor can take the
  suite's pictures without taking Radix, a colour picker and a token stylesheet
  with them, and that `lucide-react` is imported in one file instead of six. See
  the entry in Done for what the sweep found.
- [x] **The tests are type-checked now — every package's, and both apps'.** It was
  not just Slides: `tsconfig.json` is the *build's* (`vite build` reads it to decide
  what to emit), so every package's `include` was `src/**` only and **twenty-two
  packages' tests had never been read by the compiler**. The apps had no
  `type-check` script at all, so neither their source nor their Playwright specs were
  either.

  Each now has a `tsconfig.typecheck.json` — src plus tests, `noEmit`, `rootDir` at
  the repository (a sibling package resolves to its *source* through `paths`, and
  without that every cross-package import reports as outside the root) — and
  `pnpm type-check:tests` holds the result to a number per package
  (`typecheck-budgets.json`). The budget is the conformance harness's ratchet in
  another medium: it fails when a pile grows **and** when it shrinks without the
  number coming down, because a budget above the truth leaves room to break exactly
  that much again, quietly.

  **1,359 errors** the first time it ran. 21 of 24 targets are at zero now; what the
  work turned up along the way:

  - **`hit.needs` was not the only one.** `word-indent.spec.ts` had nineteen reads of
    a property on `never`: Playwright maps what `evaluate` returns through its own
    serialisable type, and a `{ … } | null` comes back as `never`, so every
    `plain!.run` in the file was an error nothing could report.
  - **Tests written against shapes that no longer exist.** `selectionManager.setNode({
    nodeId, selectAll: true })` passes an option the method has never read and omits
    the `type` it requires; `InsertNodeCommand` is called with `{ id, type }` where the
    model's node is `{ sid, stype }`. They pass, and they describe a product that is
    not there.
  - **Fixtures that predate a required field.** A `TimelineStep` gained `echo`, `unit`,
    `stagger` and `units` when text animation landed, and three fixtures never did.
  - **Two real gaps in the types themselves.** `DeckNode` did not declare `text`, which
    `labelOfBox` reads through a cast, and `ExternalComponent` did not declare the
    `type: 'external'` discriminator the registry sorts on — both found by a test
    trying to write down what the product already does.
  - **`() => (x.length = 0)` in a `beforeEach`** hands vitest a number where it expects
    a cleanup function. Four of those.
  - **A guard should report its own package's files.** A package compiles its
    siblings' *source* through `paths`, and several packages switch the unused-symbol
    checks off in their own config: left in, ninety-five of `office-slides`'s
    hundred-and-seventy-four errors were other packages' unused locals. The script
    counts only the package's own files, which is also what let the apps go back to
    being strict about theirs.
- [ ] **976 left, in three packages** — `model` 512, `datastore` 341,
  `renderer-dom` 123, held by the budgets above. These are the oldest test suites and
  the same handful of patterns as the ones already done, at ten times the count.
- [ ] **Two rows of the motion track table still need connectors.** 선 두께 and
  선색 — a stroke's width and colour — are tracks on a `connector`, and there is no
  connector to put them on. The colour *mechanism* is done, so the day connectors
  exist these are two rows in a table.
- [x] **`office-ui` was missing two primitives, and the ratchet counted the
  callers.** Both are at three, which is the number this repository has been using
  to decide that a shape is known rather than guessed at.

  - **An icon button.** Done. `IconButton` — a hit target around one icon, in two
    sizes: `sm` for a list row (18px, from a token, because a 26px row cannot hold a
    28px form control) and `md` for one standing on its own. Seven callers came in:
    the layer list's eye, lock, close and reopen strip, Word's outline pane's close
    and reopen strip, and the find bar's three. Its **label is required**, and that
    is the point — of the seven, three had a `title` and no `aria-label` and one had
    neither. A browser check now asks the rendered chrome whether any button with no
    words has no name, so the next hand-rolled one is caught rather than reviewed.
    What is left in the layer list is the *row*, which wants a list-row primitive.
  - **A text field.** `NumberField` is numeric and `Field` is the label around one,
    so every plain text box in the suite is a raw `<input>` with its own classes:
    Word's find panel, Word's comments pane, and the deck's find bar. Which is also
    why the deck's find bar had to re-invent "a field's keys are the field's" —
    `stopPropagation` on every keystroke, written a fourth time.
- [x] **A guide can be placed from the keyboard.** `Alt+.` and `Alt+,` place one,
  `Alt+<` clears them, and all three are on the slide's own context menu with the
  chord drawn beside them — a menu is how a reader finds a chord.

  Where it goes is the interesting part: a key has no position, so `guidePlace`
  decides one, and the useful answer is not the middle of the slide but the middle
  of the **selection** on that axis, taken from the union rather than an average of
  the boxes (two shapes of different sizes have a middle that is neither of theirs).
  With nothing selected it is the slide's middle, which is also right for the first
  guide on an empty slide. A selection inside a group is translated with `toSurface`,
  because a guide is the *slide's* and a grouped shape's coordinates are its
  parent's.

  And the clear chord is written `Alt+<`, not `Alt+Shift+,` — **measured**: Shift
  composes the character before the event is dispatched, so a binding matched on `,`
  with Shift required matches nothing at all. The nudge bindings had hit the same
  trap from the other side, where `ArrowRight` matched with or without Shift and the
  coarse nudge silently did not happen.
- [x] **An icon a model asks for and nothing draws is a finding now** —
  `every-icon-has-a-picture`, and the place it needed to live turned out to be the
  conformance harness rather than either package: the product hands over the names
  (`iconsIn` in `office-controls`, beside `commandsIn` and `markTypesIn`) and the
  answer (`iconNames()`, which is the table `Icon` itself reads), so nothing new
  depends on anything new.

  The browser tests stay, and the difference between them is the point: they assert
  that nothing *drawn* fell back to writing its own name, and a control on a ribbon
  tab nobody opened — or one that appears only with a table selected — is declared
  exactly like a visible one. Measured on adoption: Slides asks for **56** and Word
  for **46**, all present, and the ten names the apps pass to `<Icon>` directly are
  too. A guard that finds nothing on the day it is written, which is the only kind
  worth having for a fallback that exists on purpose.

### The four layers a control is made of

Settled on 2026-08-21, when the toolbar vocabulary was taken out of `office-word`.
The rule that decides where a piece of chrome goes is **what it has to know**:

| Layer | Package | Knows | Examples |
|---|---|---|---|
| The drawing | `office-ui` | nothing but props | `ToolbarToggle`, `ChoiceSelect`, `ColorPalette`, `useRevision` |
| The picture | `office-icons` | nothing at all | the act→glyph table |
| The declaration | `office-controls` | `editor-core` | `Control`, `ChoiceControl`, `currentChoice`, `commandsIn` |
| The product | `office-word`, `office-slides` | its own document | `WORD_TOOLBAR`, `SLIDES_TOOLBAR`, the style cascade, a deck's slide |

The third one had no home, so it lived in whichever product existed first — and
the consequences were both of the two that are available: Slides **imported** what
it could from Word, and **rewrote** what it could not.

Measured before the move:

- `apps/slide/src/ribbon.tsx` took `ToolbarChoice`, `ToolbarPalette`,
  `choiceOptions`, `currentChoice` and `currentPaletteColor` from
  `@barocss/office-word`. A deck's font box was typed as a Word type.
- `SlidesToolbarControl` was `ToolbarControl` with three fields added, and
  `SlidesToolbarGroup` was `ToolbarGroup` — the shared half declared twice.
- `mark(type)` and `attribute(key, value)`, which build a control's state reader,
  were written in both products with **identical bodies**.
- So were the inventory functions each product's tests use to ask "does the editor
  register every command my toolbar names" — and each had to remember, separately,
  to include its own colour palettes, which is the half such a function forgets.
- And inside Word's own model, the read `currentChoice` does and the read
  `currentPaletteColor` does were the same three lines twice.

After: `office-word/src/toolbar-model.ts` 767 → 646 lines,
`office-slides/src/toolbar-model.ts` 470 → 379, and the shared half is 17 unit
tests in 4ms against a `SelectionSummary` literal — where before it was only ever
exercised through whichever shape a product's own toolbar happened to use.

**One regression, caught by the test that stayed behind.** `currentChoice` used to
return nothing the moment the selection disagreed; rewriting it over
`markAttribute` let a mixed selection fall through to what the text *inherits*, so
a selection spanning two fonts would have shown the style's font — saying *this
text is Georgia* about text that is half Georgia. Word's suite failed within a
minute. `markAttribute` returns nothing for two different reasons and only one of
them is a reason to look further, so the mixed case is now asked explicitly
through `markState`.

**What did not move, and why.** `WORD_FONTS`, `WORD_FONT_SIZES`,
`WORD_TEXT_COLOR` and `WORD_TEXT_HIGHLIGHT` are still imported from
`office-word` by the deck's ribbon. They are not vocabulary — they are shared
*content*, a font catalogue and a set of text colours, and two products
disagreeing about what a text-colour button offers would be one of them wrong. So
sharing them is right and the package they are shared *from* is the open question:
their home is the shared text model, which is `office-text` in the section below
and deliberately waiting for a third product. Moving them into `office-controls`
would put a font catalogue in a package about what a control is.

- [ ] **The keymap is the same shape of problem.** `keyLabel(chord, apple)` in
  `office-slides` is pure presentation — no editor, no product — so it belongs in
  `office-ui`, and `shortcutOf(command)` is a lookup over a product's own
  bindings. Word has bindings (`WORD_KEYBINDINGS`) and its toolbar draws no chords
  at all, which is the drift this would end.

### What of a timeline is the suite's

Asked on 2026-08-21, because a timeline may be wanted in Word and would certainly
be wanted in a design tool. The first answer given was "leave it in the app,
there is one caller" — and that was wrong, because it counted callers of *the
component* instead of callers of the thing inside it.

Counted instead: **this repository already draws three axes.**

| | Where | Tick step |
|---|---|---|
| Word's ruler | `apps/word/src/ruler.tsx` + `ticksFor` | inches, eighths, loops in twips |
| A slide's ruler | `apps/slide/src/stage.tsx` + `slideTicks` | the reader's unit, counted in the unit |
| The timeline | `apps/slide/src/timeline.tsx`, inline | **`ceil(span / 500)`, hard-coded, no test** |

*(The first two are one function now — `axisTicks` in `office-ui`. Word's is not;
see the list below.)*

All three are the same widget: a span mapped to pixels, ticks at a step a reader
can count, labels on some of them, a marker that can be dragged, and a readout of
where the pointer is. Three implementations, three answers, and the newest one —
`slideTicks`, which is the only one with the float-tolerance and the
labels-per-span judgement written down — is not reachable from the other two. The
timeline's is the worst of the three: at a 60-second sequence it draws 120 ticks
and 60 labels, which `slideTicks`' own doc calls "a grey band rather than a
scale", and it does not change when the axis is magnified.

So the split is not "the timeline is Slides' or the suite's". It is:

- **The suite's** (`office-ui`) — an **axis**: span → pixels, a step chosen so a
  reader gets a countable number of labels, ticks, a draggable marker, a pointer
  readout. And **lanes of bars**: `{id, lane, from, to, label}` that can be
  dragged, resized, snapped to given points and caught by a rubber band. None of
  that knows what a bar *is*. A Figma-like tool's prototype timeline, a Gantt
  chart and Word's ruler are all this widget with different items in it.
- **Slides'** (`office-slides`) — what a bar is made of: an effect, a direction,
  a spring, a press, a trigger, what it costs. Already there, 4,543 lines and 199
  unit tests, and none of it moves.
- **The app's** (`apps/slide`) — the step inspector, the effect gallery, the curve
  editor. These are about *motion*, not about time, and they are what a second
  product would not want.

Boundary check, measured: `slideTicks` is called from `apps/slide/src/stage.tsx`
and nowhere inside `office-slides`, so moving the tick arithmetic to `office-ui`
costs the model→chrome boundary nothing. The unit *table* (`rulerStep`) is already
there for the same reason.

- [x] **`axisTicks` in `office-ui`**, with a step chosen from a label budget
  rather than from a constant. `slideTicks` was retired into it — nothing inside
  `office-slides` had ever called it, so the boundary cost nothing — and the
  timeline's inline `ceil(span / 500)` became a caller. Its five unit tests came
  along and gained the clock's, which had none: **22 tests in `office-ui`**.
- [ ] **Word's ruler is still the third answer.** `ticksFor(contentWidth)` returns
  `{major: [{at, inch}], minor: [at]}` — a different shape from `AxisTick[]`, and
  converting it means changing what `apps/word/src/ruler.tsx` draws from. Its
  arithmetic is not wrong (eighths divide inches evenly, so there is no float
  problem to have), which is why it is last rather than first.
- [ ] **`Axis` and `Lanes` components**, after the arithmetic — the drawing is the
  cheap half and the one that should be designed with two callers in hand.
- [x] **The playback *decision* is a model** — `showing(where)` in
  `office-slides/playback.ts`. Four ways of watching one slide, three variables
  meaning "which press", and a mode test choosing between them — repeated four
  times, in a 1,100-line component, none of it checkable without a browser. Now
  one function, 12 tests, milliseconds. See Done.
- [ ] **The playback *state* is still twelve `useState`s**, and `TimelinePane`
  still takes 16 props of which 8 are `x`/`onX` pairs. Deliberately not done in the
  same step: the four mode tests were a measured defect (they had produced the
  "stepping back lands on an empty slide" bug), and consolidating the remaining
  transitions into a reducer is a refactor with **no measured defect behind it** —
  the transitions are already named functions (`goToPress`, `startPreview`,
  `stopPreview`). Worth doing when something goes wrong in them, or when a second
  caller needs them; not worth rewriting a component with 201 e2e tests as its only
  safety net on a hunch.

  The one part with a smell is the slide-change reset: a `pressFor` ref that says
  "a press deliberately set for *this* slide is not an arrival to reset". That is a
  transition rule pretending to be a ref, and it is exactly where the empty-slide
  bug lived.

- [ ] **A playhead dragged to exactly zero pops every shape on.** Certain from the
  code rather than measured on screen: `showing` treats `moment > 0` as scrubbing,
  so at 1ms the shapes press *N* brings on are hidden, and at 0ms the answer is
  `undefined` — the slide as edited, with everything visible. Every frame-accurate
  tool shows frame 0 as the pre-animation state; this product deliberately shows a
  slide at rest with everything on it, because that is what a reader arranging
  shapes wants. Both defensible, and the discontinuity between them is not: one
  pixel of drag changes what is on the slide. Deciding it means deciding what an
  editor looks like at rest, which is a product question and not a defect.

### The shared layer

Measured in `docs/SHARED-LAYER.md` rather than argued: Slides takes four symbols
from `office-word`, the Word-only half is already 33 files that nothing shared
touches, and the whole obstacle is one 1,077-line `renderers.ts` holding the text
renderers and the page renderers together.

- [x] **`renderers.ts` is split.** `surface`, the header and footer while they are being edited, the
  back matter and the contents page are `renderers/page.ts` — the four things that read the layout —
  and what is left draws text, tables, marks and shapes. `registerWordRenderers` is three lines in
  `renderers/word.ts` calling both halves, so Word is unchanged and anything else can take one.

  The deck took one straight away: it calls `registerTextRenderers` now, where it used to register
  Word's page renderers in order to override `surface` and ignore the rest. Registering something to
  override it is how a product comes to depend on the shape of another product's file.

  And the split exposed the next coupling, which was answered the same day: the env channel.
  `TextEnv` (`text-context.ts`) is the document and the resolvers; `WordEnv extends TextEnv` adds the
  layout, the pushes, the splits, the page numbers and the columns. One key, so every caller is
  unchanged, and `createWordEnv` builds the small one and puts the page's answers on top.

  Measuring what the text renderers read corrected a claim on the way: they read `styles`,
  `numbering`, `fields`, `doc`, `getTab` — **and three page answers, in `blockStyle` and nowhere
  else**. Mirrored indents need the side of the paper, a section in columns positions every block,
  and the block opening a page is pushed to its sheet. Those three read from the text side, because
  the *asking* is text behaviour: a product with no pages answers `undefined` and the paragraph sits
  where it falls.

  The text half's closure went **29 files / 7,220 lines → 21 / 5,488**, and nothing about a page is
  in it. The last thread was misfiled rather than coupled: `table-style` imported `tableRowsOf` and
  `columnsOf` from `table-pagination`, so drawing a table pulled in the paginator — and those two are
  what a table *is*, not how it breaks. They are `table-format` now.

- [x] **The registry seam says what it is doing.** `override(nodeType, template)` in the DSL is how a
  product says it means to draw something instead of whatever is drawing it now; `define` on a name
  that is already registered is **recorded** rather than refused, because this runs while a product
  is being built and a registry that threw would take an app down for something a test should report.
  Two findings, opposite failures: `silentlyOverridden()` — a definition that landed on top of
  another without saying so — and `overrodeNothing()` — an override of a name nothing has defined,
  which means the thing being replaced moved or was renamed and the product is answering a question
  nobody asks.

  The count in this entry was **stale in both directions**. It was nine, not five — `canvasBlock`,
  `ellipse`, `frame`, `line`, `list`, `path`, `picture`, `rectangle`, `surface` — and it is **one**
  now: the day the deck started asking for the text renderers alone, eight of those stopped being
  overrides at all, because nobody else defines a `rectangle` for a slide. `list` is the one that is
  genuinely shared and genuinely different, and it says `override` now. `office-slides/test/overrides.test.ts`
  holds both findings at empty.
- [x] **`office-canvas` — the extraction, and the coupling named with a number.** Thirteen files into
  a package of their own, measured before anything moved: they import each other, `editor-core` and
  `model`, and **nothing else in either product**, so it was moving files rather than untangling one.
  The deck took **99** symbols from `@barocss/office-word` and **79 of them were the canvas's**; it
  takes 20 now and none of them is. What is left is honestly the page's — fonts, the colour
  palettes, the Word env, tables, cell selection, find, the renderers.

  The argument for waiting had expired: it was about the *text* stack, where Slides reused Word's
  answers, and the canvas had nothing on the other side of the line until Word grew a drawing. It has
  now, and it reads every file in there.

  The two shape *command* files stayed in `office-word`, and that is the seam: they call the shared
  arithmetic but answer **where am I**, which is the one question a product must answer for itself —
  a deck puts a shape on the surface the reader is looking at, a page walks the flow for the block
  the caret is in. `shapes.ts` stayed for the same shape of reason: it draws, and the two products
  draw a rectangle differently on purpose.

  Found on the way and fixed rather than budgeted: `CanvasNode` never declared `parentId`, so every
  walk that climbs reached for it through a cast — the type denying something the store writes on
  every node.

- [x] **`office-text` — the extraction, once the closure was honest.** Nineteen files, 4,452 lines:
  the document access, the style, numbering and field resolvers, formatting, spacing, css, tabs,
  image layout, marks, revisions, the table format and style, the equations, the text environment,
  the text renderers — and `text.css`, which is the thing this whole document started from.

  It took three cuts to get there, each measured rather than argued. The page renderers out of
  `renderers.ts`; the environment into a text half and a page half; and then two threads that were
  only visible once the closure was small: `block-style` imported **one constant** — half an inch in
  twips — from a *command* file, dragging 563 lines of editing into every renderer, and Word's own
  SVG drawing was still in the text file that a deck overrides entirely.

  The deck's imports from `@barocss/office-word`: **99 → 14**. What is left is find and replace, the
  ribbon's font and colour models, the table commands and cell selection, and one test that
  deliberately compares Word's canvas CSS with the deck's. Find is text behaviour and will move when
  something needs it to; the rest are a page's, a ribbon's, a table's.

  The move surfaced one defect a package index is uniquely able to see: **two `tableCss`** functions,
  one in `css.ts` and one in `table-format.ts`. Two of one name in one package is a coin toss for the
  caller; the second is `tableElementCss`.

- [x] **A package's `exports` map is part of moving a file, and two thousand unit tests cannot see
  it.** `office-word/package.json` carried `"./text.css": "./src/text.css"`; the new package did not,
  so both apps' stylesheets asked for `@barocss/office-text/text.css`, vite answered *Missing
  "./text.css" specifier*, and every browser test waited thirty seconds for an editor that had no
  styles. Measured as it happened: the deck's suite reached 179 of 389 tests in **31 minutes**
  instead of 389 in five and a half.

  Nothing below the browser could have caught it. A unit test imports the source directly; the
  `exports` map is what a *bundler* reads, and only an app going through vite ever asks. The lesson
  for the next extraction is one line long: **move the exports map with the files.**

- [ ] **Find and replace could be `office-text`'s.** `findMatches`, `replaceOperations` and `step`
  are about text in a document, and the deck imports all three from the word processor. Left where
  they are because nothing yet needs them elsewhere — and moving code because it *could* move is how
  a shared layer fills up with things one product uses.

### What building the second product cost the first

Kept separate from the list above because these are engine and Word findings that
only a second product could produce.

- [ ] **A renderer cannot know its container.** Word draws `rectangle` as an SVG
  `<rect>` because in Word it only appears inside a `canvasBlock`; a deck places
  the same node on a surface among contenteditable text. The registry holds one
  renderer per node type, so Slides overrides the four shape types. A renderer
  *could* ask — a function renderer gets the node, and a node has `parentId` —
  except `exportToTree` drops `parentId` and `renderer-react`'s context stub has
  no `env`, so the answer does not reliably arrive. A renderer that draws
  correctly under one renderer and wrongly under another is worse than one that
  draws one way and says so.
- [x] **`canvasBlock` in a deck drew nothing, and no check could see it.** It was
  Word's `<svg>` holding the four shape types, which in a deck are `<div>`s.
  Slides draws its own now — a relative HTML box, like every other thing it
  places — and the check that would have found it exists: see
  `every-drawing-can-hold-what-it-contains` above. It reported six pairs, not the
  two the comment had named: `frame`, `group`, `sticky` and `textFrame` are
  scene nodes too, and a canvas may hold any of them.
- [ ] **A canvas carries a size with no unit, and the two products read it
  differently.** The schema declares `canvasBlock`'s `width` and `height` as
  plain numbers. Word reads them as pixels — its `viewBox` is those numbers —
  and Slides reads them as twips, like everything else a deck places. A canvas
  authored in one product and opened in the other is the wrong size by a factor
  of fifteen, and the shapes inside it are placed by the same ambiguity. Neither
  reading is wrong; the schema saying nothing is. Found while drawing the box:
  the renderer had to pick, and a renderer picking is how this kind of thing
  becomes permanent.
- [x] **A tag the browser owns is never a component.** A template child was
  dispatched through the registry by tag name with no exclusion for element
  names, so `element('line', …)` inside the `line` renderer rebuilt itself with
  the same model data until the stack ran out. Four node types collide today.
  The rule was already written in `native-html-tags.ts` and honoured nowhere.
- [x] **Correctness CSS lived in one app.** The list marker and the caret filler
  were in `apps/word/src/style.css`, so the second product to draw the same text
  got neither and the deck's bullets drew as four bare lines. Now
  `office-word/text.css`, imported by both.
- [ ] **`surfaceId` is declared and read by nothing.** `docHeader`, `docFooter`
  and (until this week) `surfaceNote` all carry it; Word binds headers the other
  way, by `surface.headerId` → `docHeader.id`. It cannot work as written: a
  surface's identity is its sid, and a sid is `session:counter` handed out at
  load, so no authored document can name one. Either delete it or decide what
  resolves it.
- [ ] **The chrome and the document fight over keys, in both directions.** Two
  faults, opposite ways round, both found by building a deck's chrome:
  Ctrl+Z from a toolbar button reached nothing, because the editor binds keys on
  its own contenteditable and the focus was on a button; and Enter in a property
  field reached the *document*, because Enter's default action was still pending
  when the field blurred and the browser delivered the resulting `beforeinput` to
  whatever was editable next. So a chrome control has to route the keys it wants
  and prevent the defaults of the keys it handles, and neither of those is
  discoverable — the first does nothing at all, and the second commits a second
  edit. Worth a stated rule the suite's components carry, rather than two
  work-arounds.
- [ ] **Removing an attribute means restating every other one.** `setAttrs`
  merges, so a caller taking one away has to read the node, rebuild the whole
  attribute set without that key, and pass `replace: true` —
  `SlidesExtension._setBoxAttrs` does exactly that to clear a fill. A
  `removeAttrs` (or a documented `null` convention in `setAttrs`) would put it in
  the operation vocabulary where it belongs, with one inverse instead of every
  caller's.
- [ ] **`th` centres its text and Word does not say otherwise.** The browser's
  default reaches the document because no renderer overrides it. Cosmetic in
  Word, obvious on a slide.

### The spike — what a document with no text in it found

`packages/editor-core/test/spike-no-caret.test.ts` stands an `Editor` up on the
Figma-like schema — boxes with coordinates, nothing that can hold a caret — and
records what works and what does not. It is a measurement kept as a test, so the
answer stays true rather than being taken once and remembered wrong.

**Works already, with no selection at all:** boots, holds the document, runs an
operation that names its target, and undoes it. The document layer is not
text-shaped.

- [x] **A selection can name a set, and the last door that had not been told is open.** This entry
  was **stale in the interesting direction**: `ModelSelection.nodeIds`, `createNodeSelection`,
  `selectedNodeIds` and `Editor.setNode` had all answered it — but `SelectionManager.setNode`, the
  way the spike itself reaches a selection, read `nodeId` and `startNodeId` and a set has neither, so
  it answered **null**. Not "kept one of the three": no selection at all, from the method that shares
  its name with the one that works. Two doors of one name with opposite outcomes is worse than a
  missing feature — the caller cannot tell which they are holding.

  And the fault underneath it, measured the same hour: **a deleted member stayed selected.** The
  guard against a dead selection asks about `startNodeId` and `endNodeId` — the whole of a range, and
  half a story for a set, where the deleted node is usually neither end. Select three shapes, delete
  the middle one, and all three were still selected with one of them gone from the store; the next
  command acted on a node that is not there. `withLiveNodes` prunes the set and moves the ends onto
  the survivors, and clears only when nothing is left — because two of my three shapes are still here
  is what a reader means, not "never mind then".
- [ ] **`editor.selection` is read-only**, so every product goes through the
  caret-shaped manager to set one. Fine while there is one shape of selection.

### Structure — from the roadmap's phase 1

- [ ] **`ModelSelection` lives in the editing layer and the document layer
  reaches up for it.** `model` imports from `editor-core` eleven times; eight
  are already `import type` and the other three are used only in type positions
  and are missing the keyword. Moving the type down to `schema` or `shared`
  makes the dependency graph a DAG.
- [ ] **`editor-core` declares `extensions` and `renderer-dom` and imports
  neither.** Two cycles that exist only in `package.json`.

### Known and unfixed

- [ ] **Outdenting a top-level list item lifts it out of the list.** The parent's
  parent of a top-level item is the document, and the engine has no rule against
  it — `indentParentTypes` constrains what a node may nest *under* and has no
  counterpart for lifting one out. Recorded in
  `packages/model/test/operations/indentable-schema.exec.test.ts`. A product has
  to ask for the constraint before it is worth adding.
- [ ] **No `.docx` importer.** The converter reads HTML, Markdown, LaTeX and
  writes PDF. Everything the schema knows about Word arrives only from
  `sample-document.ts`, which is why "the schema declares it and nothing reads
  it" keeps being the shape of the work.
- [x] **`input-enter-sweep.spec.ts` was flaky, and one of its checks had never
  once passed.** Caught in the act rather than re-run — see Done.

---

- [ ] **The slide suite still sleeps in 318 places.** Five tests that actually
  failed under load are fixed — see Done — and the pattern they came from is
  everywhere: `waitForTimeout` then assert. Most of those sleeps are harmless
  (waiting for a command to land before *pressing* something else), and the
  dangerous ones are specifically **a sleep followed by an assertion about an
  animation**. Counted: 69 of the 318 are a wait followed straight by an
  assertion, and most of those are about the *document* after a command rather
  than about something still moving. Worth converting when a test is touched for
  another reason rather than in one sweep, and worth knowing the rule: *if the
  thing being waited for is readable and still moving, poll for it; a fixed wait is
  honest before a gesture — and it is the only way to assert that nothing
  happened.*

- [ ] **The chrome's audit list, measured on 2026-08-21.** Counted rather than
  guessed, at 1440×900 with a shape selected:

  - ~~**No context menu at all.**~~ Done — and the last of it too: a right-click on
    the **grey around the slide** used to get the browser's menu, because the
    overlay is the slide's box and there was nothing out there to act on.
    Suppressing it needed something to offer instead, and the guides were that
    something — the slide's menu has items now that are not about a shape. A window
    listener rather than a bigger element, because growing that layer to cover the
    stage would put its coordinate space and the slide's out of step.
  - ~~**No ruler and no draggable guide.**~~ Both done — see below.
  - ~~**Nothing says what a drag is doing.**~~ Done — see below.
  - ~~**No status bar.**~~ **Re-measured 2026-08-23 and mostly answered already**: the
    zoom, `화면에 맞춤` and the slide number (`1 / 5`) are all in the top bar, and the
    selection count is the properties panel's heading (`3개 선택`). What a status bar
    would add over that is a *place*, not an answer — so it stays unbuilt on purpose
    rather than by omission. Worth knowing that the entry was written before the fit
    control existed: a list of gaps rots exactly like a list of anything else.
  - The ribbon is **61 icon buttons in two rows with 10 unnamed groups**. Word's
    ribbon has the same shape and both are tested for fitting at 620px. Whether a
    deck's toolbar should have *tabs* (Home / Insert / Animate) is a product
    question rather than a defect, and it is the one thing here that would change
    how the app is used rather than how it looks.

- [x] **A reader can choose a theme colour** — the 테마 색 dialog. See Done.

  *(The entry that asked for this had lost its body to an editing accident and was
  one line long. Kept in the history because the accident is instructive: a backlog
  item with no reason in it is indistinguishable from a note somebody left
  themselves.)*

## Done

- **A site knows where it lives, and three things wanted it.** Found writing the Open Graph tags:
  `og:url` needs an **absolute** address, and so does a canonical link, and so does every `<loc>` in
  a sitemap. The document knew its pages' paths and nothing about where the site is published.

  It is the first fact this model has wanted that is about **publishing** rather than about the
  document — everything else here is what the pages *are*. It goes on the document all the same, for
  the reason a page's own address does: two people editing one site do not publish it to two places,
  and a thing kept beside a document rather than in it is a thing that goes missing the first time
  the file is opened somewhere else.

  What it bought, and what each cost:

  - **`<link rel="canonical">` and `og:url`.** A site that has not said gets neither, rather than a
    relative one — Open Graph will not take a relative address, and a relative canonical says the
    page is canonical to itself, which is what a duplicate looks like to a crawler.
  - **A sitemap**, handed back as a **sibling** of the pages rather than one of them. `ExportedPage`
    carries an `html`, and a field called `html` holding XML is the small lie this repository spends
    its time finding. So `Published` grew a `files`, each naming its own file and type — which is
    also how the app stopped having to know that a page at `/` is written as `index.html`.
  - **No `<lastmod>`.** This model records no times, and stamping the export's own clock would tell a
    crawler that every page changed every time anybody published, which is how a site teaches a
    crawler to stop believing its sitemap.

  **And a row that lied about what it writes.** The address appears in the pane a reader reaches by
  selecting nothing — which is the *page's* pane — and writes the **document**. `sets only attributes
  those node types declare` looked the attribute up on `surface`, correctly found nothing, and
  reported it. `PanelRow.of` is the field that says so, one row in the whole product uses it, and the
  check reads it: a row whose `on` and `attr` disagree is now something a product has to *say* rather
  than something that quietly happens.

- **The other half of what makes a published page real.** The same reading that found forty `<div>`s
  found two more things missing from the `<head>` and the top of the body, and both are one line each
  once the page can say what it is.

  **What a crawler and a chat read.** A page carried a name and an address and said neither to
  anything but a browser tab — no `description`, no Open Graph at all. So a search result showed
  whatever an engine could scrape from the first paragraph, and a page pasted into a chat unfurled as
  a bare address. `description` is on the page now, and it is the third thing a page is: a title is
  what it is *called*, an address is where it *answers*, and this is what it is *about*.

  Two decisions:

  - **Nothing written is nothing said.** An empty `<meta name="description" content="">` is worse
    than none — it tells an engine the page has been described and the description is nothing — and
    an `og:title` with no body is an unfurl that looks like a template. Both are written only when a
    reader has written one, and they go together.
  - **Not guessed from the first paragraph.** Every builder that guesses gets it wrong on the page it
    matters most — a hero whose first words are *무료로 시작하기* — and a guess a reader cannot see is
    a guess they cannot correct.

  **A way past the navigation.** The first thing on every page of the sample is a header with four
  links, so a visitor tabbing reaches the words on the fifth press, on every page, every time. The
  link every accessible site has is one line — and it could not be written until a page could say
  **where its body is**, which landed an hour earlier. A page that has not said gets no link at all,
  because one that points nowhere is worse than none: it looks like the page has one.

  And the bug that only a real export found: the lookup used `data-bc-sid`, which is the **editor's**
  name for a node's id. `lift` has already renamed it to `data-b` by then — the published page keeps
  the id under a shorter name so a media query can point at it — so the query found nothing and the
  page shipped silently without the link. Silently is the word: a missing skip link is invisible to
  everyone who is not using it.

- **One control in the suite had a tooltip; the other sixty had the browser's.** Counted: a ribbon's
  `ToolbarToggle` opened a real one, and every other icon in all three products used `title=` — the
  eye and the lock in a layer row, the × on every pane, the zoom's three buttons, every `IconButton`
  in twelve files.

  A native `title` is not a smaller version of the same thing. It appears after about a second with
  no way to change that, is drawn by the operating system in a font and colour nothing in the product
  chose, cannot hold a chord legibly, and **never appears for a reader using the keyboard** — which
  is the reader who most needs to be told what a picture means.

  `Tip` and `TipProvider` in `office-ui`, `IconButton` uses them, and `AppShell` renders the provider
  so a product gets the *grouping* — the second tooltip opening instantly after the first — without
  knowing it exists. That grouping is most of what separates a tooltip a reader tolerates from one
  they use.

  **And the chord beside the name**, which is where every design tool puts it: this is the reader who
  has already found the button and is about to press it for the tenth time. It could not be done
  while a chord was a string typed beside a label; it is one line now that a key map answers
  `chordFor`. The shortcut work pays for the UI work.

  Two things found in the doing:

  - **Readers were being shown `Mod+D`.** The site's toolbar model types its chords, and `Mod` is how
    a chord is *written down* so one line can mean ⌘ on a Mac and Ctrl elsewhere — it is not a key
    anybody has. Asked of `SITE_KEYS` and written with `keyLabel` now, falling back to the model for
    the chords the **engine** binds (bold, italic, underline), which this product does not own.
  - **A disabled button receives no pointer events**, so the good tooltip never opens on one — and
    the disabled case is exactly where a control most needs to say something (*3곳에서 쓰는 중이라
    지울 수 없습니다*). The browser's `title` still shows there, so that is what is used, and only
    there. Caught by a browser test that had been asserting the attribute: it looked like it was
    protecting a detail and was protecting the behaviour.

- **The published page was forty `<div>`s.** Read the export rather than the editor for the first
  time, which is the surface the whole product is for. It gets a great deal right — `lang`, a
  `<title>`, a viewport, **no script at all**, and **not one inline style**: 286 classes and zero
  `style=`. And the tags it used were `div, section, p, h1…h4, a, img, span, blockquote`, with
  nothing saying which of forty divs was the page's header, its navigation, its body or its footer.

  The document **knew**: the sample places a `site-header` and a `site-footer` on every page and the
  four links in the bar are a navigation. Nothing had a word for it, so nothing was said — the shape
  of finding this repository keeps making, arriving at the one surface where being unsaid costs a
  **visitor** rather than a reader. A screen reader jumps between landmarks; a search engine reads
  `<main>`; a reader-mode looks for the body.

  `landmark` on a container — 머리말 / 둘러보기 / 본문 / 곁들이 / 꼬리말 — and the block publishes as
  that element. Four decisions:

  - **The export follows for free.** It is drawn through the same renderers, so there is no second
    place where the tag could be older. That is the whole argument for export-as-a-render, collected.
  - **Silence stays `div`, not `section`.** A `<section>` with no accessible name is a landmark a
    screen reader announces as "section" and cannot tell from the next one — worse than a plain box.
    A stack that means something says so; one that is a stack stays a stack.
  - **Narrowed, not exempted.** The check reported it on `picture` the moment it existed: an `<img>`
    cannot be a header, so `landmark` moved out of `everyBlockAttrs` into a container-only group.
    Which is the rule this schema already followed about `sizing`.
  - **A placement can carry it**, and that is the case that matters — the sample's header *is* one.
    The panel offered it on stacks only at first and a browser caught that in the first run;
    `every-property-can-be-edited` passed, because it counts rows against a schema rather than asking
    what a reader can reach with a given thing selected. That open item now has evidence.

  **And the fault the field creates the moment it exists.** One header, one body, one footer per
  page: a screen reader offers a list of landmarks to jump between, and two things both calling
  themselves the body is a list nobody can use. Reported against **both** offenders, so a reader can
  go to each and decide which is the real one — and `nav` and `aside` are deliberately not counted,
  because several navigations is ordinary. That is the difference between a rule and a habit.

- **차례로 — a row of cards that arrives one after another.** Three cards appearing at the same
  instant is the tell of a template, and every landing page staggers them. The site could choose
  *how* a block arrives and not *whose* arrival it is.

  **The fix cannot be an animation on the row**, and that is the whole shape of it: a scroll
  animation on a parent moves the parent, children and all. So a container carrying `revealStagger`
  gives its `reveal` to its **children** and takes none itself — which is why the two are one choice
  in the panel and not two. A block either arrives, or what is in it does.

  **What shifts is the scroll, not the time.** `animation-delay` is time, and a scroll-driven
  animation has no clock: its progress is *how far this element has entered the viewport*, so 200ms
  against that means nothing at all. Each child's `animation-range` starts a little further along —
  the first is arriving while the third has not begun, and the reader's own scrolling spaces them.

  **And the step shrinks with the count**, which is the arithmetic worth keeping: the range ends at
  `entry 70%` and everything to `entry 100%` is reachable for every block including the last — the
  property the range was chosen for in the first place. So a stagger has **thirty points** to spend.
  Ten each is right for three cards and would put the sixth of six at 120%, where there is no scroll
  left to reach it, and that card would sit half-arrived forever — the same fault the range itself was
  written to avoid, arriving from the other direction. `min(10, 30 / (n - 1))`.

  Two small things the tests found rather than the reading:

  - `blocksIn({ getNode: store.getNode })` **loses its `this`** — `DataStore.getNode` resolves an
    alias through it, so the bound method threw. Caught in the first run, which is the argument for a
    unit test that stands up the real store rather than a fake with one method on it.
  - The rules exist **in preview only** and the probe looked for them while editing. Deliberate, and
    the reason is in `app.tsx`: every arrival starts at `opacity: 0`, and a builder that hid half a
    page from the person building it would be unusable.

- **The pile that had been measured and left, paid off — and two of my own findings were wrong.**
  Asked directly whether anything was being recorded rather than fixed. Counted: of the last twelve
  commits, eleven changed code and one was the deliberate *write the harness idea down first* step.
  What was true is that four small findings had been written down and left, so they are done, and
  two of them turned out not to be what the note said.

  - **A press on the grey now deselects in select mode too.** The overlay owns every press on a board
    and already decides what one means; the plane *around* the boards was covered by nothing, so
    letting go of a selection meant pressing Escape — a key a reader has no reason to know, for the
    gesture every tool of this kind answers with a click on nothing. Written down twice and left
    while it was one condition away from the handler that already did it for text mode.
  - **The panel's "블록을 선택하면 …" is a section now.** It was a bare paragraph under the last of the
    page's six rows, so top to bottom the panel read *here is the background, here is the shadow,
    select a block and its properties will appear here* — which says the panel is empty while six
    rows of it are on screen. A heading is the whole fix.
  - **`ComponentsPanel` called `useState` after an early return.** A rules-of-hooks violation, and a
    reachable one: the component rendered one hook with an empty library and two with a full one, so
    the *first* definition a reader made and the last they deleted each threw. A sweep of the other
    five files in the app found no second instance. No browser test, and that is worth saying rather
    than implying: the sample's six definitions are all placed and two of the placements are inside
    other definitions, so the empty state cannot be reached cheaply from it. The fix stands on the
    rule, not on a measurement.
  - **`PropertyNumber` is called by the deck**, so the note saying nothing called it was wrong —
    corrected within the hour. What was true is narrower: `PropertySheet` drew `NumberField`
    *directly*, so a decision made in the wrapper reached the deck's dialogs and not the panel. The
    wrapper could not be used because it had no `onClear`, `min` or `max`; it has them now and there
    is one path.

  The instructive one is the last, and the lesson is about evidence rather than about the code: *"I
  edited it and nothing happened"* is a fact about **one caller**, and it was written down as a fact
  about all of them. The count that settled it took thirty seconds and should have come first. The
  same shape as the rail-headings note beside it, which claimed *lists of the same shape with
  different answers* about three panels holding **one** list each and two holding **two kinds** — not
  the same shape, and so not a finding.

- **A page could not say how much of a block comes through.** Measured by asking, for every
  selectable node type, which of its declared attributes the panel offers: the unsettable lists are
  almost all canvas coordinates and a deck's jump targets, which a flow page rightly has none of —
  and then `opacity`, on **all five** of `frame`, `collection`, `instance`, `picture` and `textFrame`.

  It was exempt from `every-attribute-is-read` with the reason *"a canvas idea; a page has no z-order
  to see through"*, and that is not what opacity is. Z-order decides **which** of two overlapping
  things you see; opacity decides **how much** of one you see, and a flow page uses it constantly — a
  scrim over a hero, a caption at 60%, a card that reads as not-yet-available.

  What the wrong reason cost is in the same file: `backgroundOpacity` exists because a hero is words
  over a photograph and the photograph has to be faded. A special case was built for the one place
  the need could not be argued away, beside a general answer a sentence had ruled out. It stays —
  it fades the **picture and not the words**, which `opacity` cannot — but it should not have been
  the only one.

  Drawn, settable, and stateable, and each has a reason:

  - **Silence is not `opacity: 1`.** A block that says nothing gets no `opacity` in its style at all.
    The two look identical and are not: a value below 1 makes a **stacking context**, which changes
    what a `position: sticky` header inside it can escape. Stating 1 everywhere would break sticky
    headers for a value nobody set.
  - **`picture` and `instance` draw it themselves**, which the harness is what settled: adding the
    panel row made `every-attribute-is-read` report both immediately, because `paintCss` is a
    stack's and neither of those goes through it. A picture is the node a reader reaches for this on
    first, and a placement's opacity is the one paint decision a placement gets to make.
  - **It is in `STATEABLE`**, for the reason `strokeWidth` is not: opacity moves nothing, so a block
    cannot fade itself out from under the pointer. A card that lifts to full on hover is this number.

  **And two roundings, one value.** A typed `0.4` came out as `0`, twice over: `<input type="number">`
  sanitises against `step`, which was the default 1; and the panel's commit rounded anything without
  a `px` unit to a whole number — right while every such row was a count or a degree (열, 전환 시간,
  그림자 방향). `PanelRow.step` is the one number that answers both, and the commit rounds to its
  decimals rather than to an integer.

- **One chrome row, which is what every design tool's top is.** The toolbar was counted in four
  states and the number is the argument: **six buttons across 1600 pixels**, four of them greyed with
  nothing selected. A full-width strip is what a *ribbon* is — Word's carries 69 controls and needs
  the width — and this is a mode switch and four things a reader can do to what they are holding,
  which is Figma's toolbar and fits beside the menu with room over.

  It reads the way a design tool's top row reads now: who you are, what the document can do, what the
  pointer is, where you are, and how you are looking. **42 pixels of canvas back**, on every screen.

  Two things it needed to be safe:

  - **The page's name is anchored to the right**, beside the zoom, with `margin-left: auto`. The
    toolbar grows by about 360 pixels the moment a reader selects words — the character controls and
    the link picker appear — and the free space collapses *before* the name, so the toolbar grows
    into it instead of dragging the name across the row. A row that moves while somebody is working
    is the one thing a single chrome row must not do, and there is a test that presses on it.
  - **It fits at 960**, in both modes, measured rather than hoped: at that width everything gives a
    little and nothing overflows.

- **The deck's eight, worked off — and seven were one decision each side of a boundary.** The check
  opened at nine on its first run; one was a clipboard and the rest were faults. **9 → 1 → 0.**

  **Five were in `@barocss/extensions`, which means every product had them.** `setFontColor`,
  `removeFontColor`, `toggleBulletList`, `toggleOrderedList` and `insertTable` are all the same two
  lines: an `execute` that reads the selection, refuses anything that is not a range, and a
  `canExecute: () => true` beside it. `insertTable` is the sharpest — the operation reads
  `context.selection.current` and **throws** without a range, so with a box selected it said yes,
  threw, and the transaction failed where nobody was looking.

  Why it stayed invisible: **in a word processor the selection is a range essentially always**, so the
  guard and the command agree in every state anybody had looked at. It takes a product where a *node*
  can be selected — a deck, a page builder — for the two to come apart, and then they come apart
  everywhere at once. `hasRange` in `guards.ts` is the one line, and it takes the one argument the
  distinction needs: a colour wants *something* selected, and a list toggle is happy with a caret
  because it acts on the block the caret is in.

  **Two were the deck's own.** `sendBackward` and `sendToBack` had a guard asking *is anything
  selected* and a command asking *does anything move* — so on a box already at the back they lit up,
  committed a `moveNode` to the place it was already in, and changed nothing. `_reorderPlan` answers
  both questions now, by computing the order the moves would leave behind and comparing it with the
  one there is.

  **And one was a payload.** `nudgeBoxes` offered with no `dx`/`dy`. Every surface that runs it
  supplies a delta, so nothing was broken for a reader — and a guard that is true where the command
  is false is the fault class either way, at a cost of one line.

  The ratchet is gone and the deck has one exemption: `copyBoxes`, which puts boxes on a clipboard.

- **`editor as any` is back to 338, having drifted to 344 unnoticed.** Six casts came in over four
  commits while the check was not being run — the clipboard extension copied five of them from the
  file it was modelled on, and all five were over **public** members: `registerCommand`, `dataStore`,
  `exportDocument`, `executeCommand`. Which is the finding the ratchet exists for, arriving the way
  it always does: not as a decision, as a habit copied from the neighbouring file.

  Worth recording about the *process* rather than the code: the drift happened because the whole-repo
  typecheck and the touched packages' tests were run each time and `editor-core`'s were not. A ratchet
  in a package nobody is editing is a ratchet nobody is reading.

- **`every-command-does-something` — the question every other command check could not ask.** The
  others are all about a command's *description*: what the schema says it makes, whether the product
  draws that, whether anything surfaces it. None of them can see what a reader meets — a control that
  lights up, runs, and changes nothing. The last several faults were all that shape:
  `find`/`findAndReplace` registered by the **engine** as `execute: () => true`, four `canExecute`s
  looser than their `execute`, a whole 삽입 menu greyed on a fresh page.

  **How it can be asked at all.** The naive version is not available — running a command changes the
  document, so a probe measures a moving target — and the BACKLOG entry that scoped this concluded the
  tractable shape was *a list of states each command claims to need*. It turned out to be simpler: one
  **fresh editor per command**, the product's own canonical state, run, compare. One editor each looks
  expensive and is what makes the answer trustworthy — undoing instead would be testing the undo as
  well, and a command that does not undo would then read as a command that does nothing.

  The running is the **product's**: what state a command needs is a fact about that product, and a
  harness that guessed would guess differently for each of three. The probe answers three ways —
  moved, did not move, or *could not be asked*, which is counted separately so a probe that quietly
  stopped setting anything up is visible rather than looking like coverage.

  **The measurement it was written for.** Wired to two products the same afternoon:

  | | offered and runnable | moved the document | findings |
  | --- | ---: | ---: | ---: |
  | the site builder | 24 | 20 | **4** |
  | the deck | 27 | 18 | **9** |

  The site's four were all the kind the check's own header predicts — a clipboard, a selection and
  two exports — and are exemptions with reasons. The deck's are the other kind and are a **ratchet**
  at 8, because none of them is a decision yet:

  - `setFontColor`, `removeFontColor`, `toggleBulletList`, `toggleOrderedList` — **text** commands,
    offered with a *box* selected. They say yes to a node selection and have no range to write to,
    which is exactly the `canExecute` looser than its `execute` this repository has found four of.
  - `sendBackward`, `sendToBack` — the box is already at the back. Every design tool greys these
    there; this one offers them and does nothing.
  - `insertTable` — says it can and puts no table on the slide. The one that looks like a plain bug.
  - `nudgeBoxes` — offered with no `dx`/`dy`, which no surface actually does.

  And one thing the probe taught about itself: measured the wrong way first — comparing the document
  on the line after `executeCommand`, which is `async` — and **all 24** came back "changed nothing",
  including inserts the browser suite watches work. A probe that is wrong in that direction fails
  loudly; wrong the other way it reports a broken product as fine, which is the failure this harness
  exists to prevent. The answers are awaited in a `beforeAll` and the check reads them.

  Word gets it free the day it wires its surfaces — the check keys off `reachable`, which Word does
  not pass yet (see Open).

- **The four surfaces, counted in each of their states.** Opened the toolbar, the rail, the menubar
  and the panel in every state a reader can put them in and wrote down what each offers. Two faults
  were sitting in plain sight, and both are the shape this repository keeps finding.

  **삽입 was dead on a freshly opened page.** Twelve entries, **twelve greyed** — because an insert
  lands after what is selected and, with nothing selected, at the end of the page the reader is
  looking at, which the model has no notion of and should not grow one. The rail's 추가 has been
  passing `pageId` since the day it was written; the menu was not, so from a fresh document every
  entry refused. It is the same fault `duplicatePage` and `removePage` had, in the same file, and it
  recurred because these entries are **derived from the toolbar**, where the app supplies the page a
  different way. The test writes the whole list out rather than counting it: an entry that needs the
  page and does not say so is greyed forever, and one that says so and does not need it sends a
  `nodeId` to a command that will use it for something else.

  **The layer list could not be searched.** 110 rows, four levels. Closed-by-default made that
  navigable and did not make it findable: a reader who knows the block is called 요금 still had to
  guess which of nine bands it is under and open them one at a time. There is a field now, and the
  two things that make a filtered tree readable rather than a flat list of names:

  - **A row is kept if it matches or holds something that does**, so the answer arrives with the
    branch it hangs off. A list of bare matches has lost the one thing a layer list is for.
  - **The two kinds are told apart** — what was found is ink, what is kept for the shape is faint.
    Without that, one match in a four-deep tree reads as four.

  Searching also opens what it kept: a match three levels down that a reader has to click to see is a
  search that found nothing as far as they can tell. And the field stays when nothing matches,
  because a search that disappears cannot be corrected.

  What the count also said, and is not a defect: the site's toolbar is **six buttons across 1600
  pixels**, four of them greyed with nothing selected. Figma's toolbar is a small island of *tools*
  and everything else is in the panel; ours is a full-width strip with almost nothing on it. That is
  a shape question rather than a gap — see Open.

- **A builder can copy a block.** `cut`, `copy` and `paste` are the shared kit's and take a caret's
  **range**, so a reader holding a card had all three greyed — correctly, and uselessly. Measured
  from the other end: ⌘D was the only way to get a second copy of anything, and there was **no way at
  all** to move a block from one page to another.

  `copyBlocks` / `cutBlocks` / `pasteBlocks`, and the whole extension is a fifth the size of the
  deck's for a reason worth keeping: `SlidesClipboardExtension` is long because a slide has
  **coordinates** — a box copied out of a frame has to arrive with different numbers to stay in the
  same place — and a page is a **flow**. There is no x, no y and no z-order; where a paste lands is a
  parent and a place in its content, and both are the paste's to decide.

  - **After what is selected**, in its parent, which is `duplicateBlocks`' answer to the same
    question: a copy that jumps to the bottom of the page is a copy the reader has to go and find.
    With nothing selected, the end of the page on screen — which only the app knows, so `pageId` is
    the app's to give.
  - **Cut is copy and then remove, in one command.** Not two from the app: undo after a cut gives the
    blocks back once.
  - **One transaction for the paste**, so one press of undo takes it back — and the blocks are added
    from the last backwards at one index, because inserting forwards at a fixed place reverses them.
  - **Two clipboards**, for the deck's reason: the system's carries a block to another tab and JSON in
    text is the only format two windows agree on, but reading it needs a permission the browser may
    refuse. Without the in-memory fallback this would be a feature that works on the developer's
    machine.

  The menu's three entries point at these now rather than at the kit's, and the chords come from the
  key map — which is how ⌘X/⌘C/⌘V came back after being deliberately unbound: the note then said the
  missing thing was a binding, and it was a **command for blocks**.

- **A ruler, answered as the thing behind the question.** Asked for directly, and a ruler is the wrong
  instrument for a page — which is worth writing down rather than finding out after building one:

  | | what the ruler measures | does the reader set it |
  | --- | --- | :---: |
  | Word | margins, indents, tab stops | yes |
  | the deck | a box's x and y on the slide | yes |
  | a page | an absolute coordinate | **no** |

  A page is a flow. A block's position is what its parent's stacking, gap, padding and order come out
  as, so a ruler along the top would be measuring numbers a reader cannot type anywhere.

  The two numbers they *can* type are the **padding** and the **gap**, and neither was visible: a
  section is 112 above and 48 below with nothing on the page saying so, and the 64 between two cards
  looks exactly like the 40 between two others. Both are drawn on the selected block now, as a wash
  with the number on it — which is what Figma and Webflow both do, and for this reason.

  Three decisions:

  - **Read from the drawing, not the document.** `getComputedStyle`, because an override at this
    width, a fallback the renderer chose and a gap a grid resolved are all already in the number the
    browser used and none of them is in the attribute. It also means the bands are right for a block
    whose padding is not set at all, which is the case a reader most wants to see.
  - **The gaps are measured between drawn children**, not taken from `gap`: a grid's wrap and an
    absolutely placed child both make that one number a poor description of the spaces on screen.
  - **One block, and only in select mode.** Four bands and six gaps on each of three selected sections
    is not a measurement, it is a pattern.

  A thing that fell out of it and is better than the feature: the three boards each draw **their own**
  numbers, so a reader sees 112/72 on desktop, 96/40 on tablet and 56 on mobile at once. The
  responsive padding is a thing this product could only be told about one width at a time.

- **A stack's direction is three pictures now, and a field says where the caret is.** The second half
  of the panel work, and both came out of *asking whether it still works* rather than looking at it.

  **The sweep it had never had.** Every enabled control in the panel, on four kinds of block and on
  the page, pressed once with the document read before and after: **thirty-five controls, thirty-five
  writes, nothing dead.** The only ones that did nothing were the ones that are correctly greyed —
  a gradient's angle with no gradient, a shadow's blur with no shadow — and the one that looked dead
  was the probe's fault: `진하기` is `max: 1` and the sweep was writing 37. It is a test now, so a
  control that stops writing fails by name in the commit that stopped it.

  **A `<select>` where three buttons belong.** `PanelOption.icon` turns a choice row into a segmented
  group, and `방향` is the row that earns it: a stack's direction is what a reader changes while they
  are arranging, over and over, and a dropdown costs a gesture to open before it costs one to choose.
  Three pictures cost one, and the current answer is *visible* rather than remembered. The decision is
  the declaration's — six choices stay a list, because six unlabelled glyphs across 159 pixels is a
  puzzle — and `every-icon-has-a-picture` now reads the panel's names as well as the toolbar's, which
  it could not before because a panel had no icons to collect.

  **A focused field drew nothing.** Measured: at rest a panel's field has no edge (right — twenty
  edges down a column is a fence), on hover a hairline (right), and focused by a click it drew the
  **hover** edge — so the moment the pointer moved away there was nothing on screen at all, with the
  caret inside it. `STATE` answers focus with `focus-visible` and a ring, and that reasoning is about
  **buttons**: a ring left behind by every mouse click is what made rings get avoided. A field is the
  other case, so `CONTROL` answers `:focus` with one pixel of accent, which is what every tool of this
  kind draws and what the border was already the right shape for.

- **The properties panel is an inspector now, not a form.** Asked for as *"figma 수준으로, 좀 더
  컴팩트하게, 전문가 툴처럼"*, and measured before and after rather than adjusted by eye.

  | | before | after |
  | --- | ---: | ---: |
  | panel width | 288px | **240px** |
  | control height | 28px | **24px** |
  | text | 12px | **11px** |
  | label column | 68px | **58px** |
  | section padding | 10/12px | **8px** |

  240 is what a design tool's inspector is — Figma 240, Sketch 240, Illustrator 232 — and the number
  is not a taste: it is how far the eye travels between a label and its value. The panel had grown
  256 → 288 because a fill row would not fit, which was the right observation and the wrong remedy:
  the answer to a row that does not fit is a row that **wraps**, and a panel grows once and never
  comes back. 48 pixels of canvas returned, on every screen, for the life of the product.

  The scale is set **on the surface** rather than in the tokens — the same mechanism
  `[data-density='dense']` already uses, applied where it was needed. A ribbon's control is a thing
  to press once and wants a press-sized target; a panel is twenty rows a reader scans.

  Four things changed shape, and each was a defect as well as a density win:

  - **A field carries its own name.** Figma's `W`/`H`/`X`/`Y`: a number sharing a line with three
    others cannot borrow the row's one label, and the label was drawn nowhere at all — so 안쪽 여백
    was five identical boxes. `상 112 · 우 72 · 하 48 · 좌 72` now, inside the fields, costing no line.
  - **Three or more numbers go two to a line.** Four sides strung along one row are 34 pixels each;
    two lines of two are 80, which is a number a reader can read and retype. Only for a set of the
    **same kind** — `그라디언트` is a colour, an angle and a shape, three different questions, and
    equal cells cut the colour's name to `없` to make room for one it had nothing to do with.
  - **A switch says its word once.** Every toggle read `보임  ☐ 보임`: the row's label and the
    control's, side by side, on every one of them.
  - **No spin buttons.** Chrome reserves 15 pixels for a pair of arrows on every `type="number"`
    whether they show or not — which is where `180` came to be drawn as `18` in a 40-pixel field. No
    tool of this kind shows them: a value is typed, dragged, or stepped with the arrow keys.

  And one thing the change *exposed*: the corner-radius companions were labelled `↖ ↗ ↘ ↙`, four
  arrows standing in for four pictures of a corner. Nothing drew a companion's label before, so
  nobody had seen them. 상좌/상우/하우/하좌 now, in the same vocabulary the padding uses.

- **A viewport's scale was a React change.** Reported by a reader in two halves — *"viewport 에 scale
  만 바꿔도 렌더링이 계속 깨진다"* and *"scale 이 바뀌는 건 viewport 만의 문제라, transform 이랑
  transform-origin 만 바뀌어야 하는 것 아니냐"* — and the second half is the whole answer.

  The overlay took `zoom` as a **prop**. So every wheel tick re-rendered three boards' overlays and
  recomputed every marker box with `getBoundingClientRect` — for an answer that **cannot change**: a
  box is measured in the board's own pixels, which is scale-invariant by construction, and the
  division by the scale is exactly what makes it so. The number is read off the board now
  (`getBoundingClientRect().width / offsetWidth`), and `--st-zoom` is set on the plane beside the
  transform it describes, where the browser inherits it for free.

  Measured after: **not one DOM mutation** on any of the three boards across eight ⌘-wheel zooms,
  held by a test. The document was never being redrawn — that part was already right — but three
  overlays' worth of layout reads per frame is what a reader sees as the drawing coming apart.

  And the drift, found while measuring it: ⌘+ five times then ⌘− five times left **69% having
  started at 70%**. The steps were `round(z * 110) / 100` and `round(z * 90) / 100` — not inverses,
  1.1 × 0.9 is 0.99, with a round-to-two-decimals inside each compounding it. The `ZoomControl`'s own
  buttons had it right all along (`z * 1.25`, `z / 1.25`), so the suite held the answer in one place
  and the wrong answer in another. One `zoomIn`/`zoomOut` in `office-ui` now, and a round trip is
  exact.

- **Editing text was a mode a reader could get stuck in.** Two more of the same report — *"편집 커서가
  있어서 selection 된 대상이 바뀌지 않는다"* and *"모바일에서 내가 원하는 편집요소를 클릭할 수 없다,
  계속 엉뚱한 데 텍스트 커서가 들어가서"* — and they are one fault.

  The mode is the **app's**, which is right: there is one reader and one caret. But the layer that
  owns the pointer switches itself off in `text` on **all three boards at once**. So the moment a
  reader double-clicked into a heading on the desktop board, every board became a plain
  `contenteditable`: a press anywhere on any of them could only place a caret, the block selection
  could not be changed at all, and the way out was `Escape` — which a reader has no reason to know.

  A press outside the block being edited now ends the editing and selects what was pressed, which is
  what Figma, Framer and Webflow all do and is what makes text editing a state a reader is *in*
  rather than a mode they are stuck in. Caught on `pointerdown` in the **capture** phase, because the
  caret is placed by the default action and the only way not to place one is to get there first.

  Three cases, and each is a test: inside the edited block the caret moves and nothing else; on
  another block — including on **another board**, which is where the reader met it — the mode ends
  and that block is selected; on the grey around the boards the mode ends and nothing is selected,
  because pressing nothing has always meant selecting nothing here.

- **Four controls in a 263-pixel row were simply not on screen.** Found by measuring every row of the
  properties panel at its own width: 그라디언트 carries a start colour, an end colour, an angle and a
  shape and needs **296 pixels in 263**; 배경 그림 needs 273. The angle and the shape were not clipped
  in a way a reader could scroll to — they were **gone**, so a gradient's direction and whether it
  was linear or radial could not be reached at all.

  `PropertyRow` wraps now, which costs nothing until a row overflows and then costs one line. The
  alternative — capping what a row may carry — moves the decision into every declaration and gets it
  wrong the first time somebody adds a fifth control.

- **The menubar taught eleven shortcuts and the product answered none of them.** Measured in a
  browser, chord by chord, with a block selected: ⌘Z, ⇧⌘Z, ⌘X, ⌘C, ⌘V, ⌘A, ⌘F and the four zoom keys
  each pressed once, and the document, the selection and the zoom compared before and after.
  **Fourteen chords printed, three answered.** A hint beside a menu label is not decoration — it is
  the product telling a reader they can stop opening the menu.

  The cause was three statements of one fact: the hints typed into `menu-model.ts`, the bindings in
  `keymap.ts`, and a `keydown` in the app that had `Delete` and `⌘D` written into it. `SITE_KEYS`
  existed so `every-command-can-be-reached` could see two commands — a declaration only a check read,
  which is what its own header warns about one level further in than it looked.

  One list now. The app dispatches on it, the menu derives its chords from it (`hintFor`), and an
  entry with no binding prints nothing rather than a promise. What that bought, in order of size:

  - **⌘Z and ⇧⌘Z work at all.** Undo was reachable only through the menu, in a builder.
  - **모두 선택 selects the page's blocks.** It ran the kit's `selectAll`, and the browser found what
    that does here: with a card held, ⌘A **cleared the selection**. Not an error, not a refusal — a
    control that leaves the reader with less than they had. `selectAllBlocks` takes the blocks *on*
    the page, one level, which is what every design tool means by it and what stops the next nudge
    pulling the page apart.
  - **The four zoom keys**, which are views rather than commands — so a binding names a command or a
    view now, exactly as a menu entry does, and `runEntry` performs either. Two ways to reach one
    act, one place that does it.
  - **⌘X, ⌘C and ⌘V are deliberately *not* bound**, and that is the same finding from the other end.
    Bound in select mode they never fired: the kit's clipboard commands take a caret's range. In text
    they are the platform's, and a builder that intercepted them would break copying. The menu prints
    those three chords itself, marked, and a test holds the marking to a written list.

  Two things only a browser could have settled:

  - **⇧1 cannot be matched on `event.key`.** Shift and `1` types `!` on a US layout and something else
    on several others. Matched on `event.code` for digits, compared as typed for everything else.
  - **Who wins when both layers bind the same chord.** The board is a real editor and resolves its own
    key map on the element, and the event bubbles to the app afterwards — so ⌘Z ran twice. The damage
    was exact and the suite caught it: a reader typed in a code block, pressed Escape, pressed ⌘Z, and
    the engine's undo took the code edit back while the app's took the block away. The split is
    `mode`, which is the claim `elsewhere()` already makes: `select` is the builder's, because the
    reader is not typing by definition and the engine's `editorFocus` is a lie there — the board is
    `contenteditable` and holds focus either way. `any` defers to `defaultPrevented`, because a key
    another layer has answered is not this app's to answer twice.

- **The fault list spoke two languages.** `linkFaults`' sentence was composed in Korean in
  `documentFaults`, and `overrideFaults`, `stateFaults` and `collectionFaults` returned
  developer-English — *"this list has nothing to draw for each row"*, *"'hover' sets 'gap', which
  moves the thing out from under the pointer"*. They were internal until a panel drew them, and
  `Fault.said`'s own line says *in the words a reader would use*.

  All eleven now do. And the link's leads with the **missing page** rather than with *이 링크가*: six
  broken links read as six copies of one sentence when the differing part is at the end of a wrapped
  line. The other checks already led with the name; this is the reading of a *list*, not of a
  sentence.

- **A site could be broken and say nothing.** Three checks — `overrideFaults`, `linkFaults`,
  `collectionFaults` — each written with a unit test beside it, and `faults.ts` walking a real
  document with all three. **Nothing drew the result.** Which `faults.ts`'s own header says is worse
  than not having them: a check nobody runs reads, to the next person, exactly like a check that
  passes.

  The gesture it exists for is exact, and the browser suite now runs it end to end: removing a page
  says *이 페이지로 가는 링크 2개가 끊어집니다*, the reader accepts, and there are two links in the
  site that go nowhere. A broken link's honest drawing is **ordinary words** — no underline, no
  pointer, no announcement, which is what an `<a>` with no `href` is and the whole reason `linkFaults`
  was written — so the canvas cannot show it and a list is the only way to find one.

  **A footer on the rail, not a sixth tab**, and the stylesheet had predicted the wrong half of that:
  it says five is what fits before the words truncate and that a sixth makes this an icon rail. True,
  and beside the point. The other five answer a question the reader arrived with; this one answers a
  question they do not know to ask yet, and a tab is a surface you have to choose. So it sits under
  all five, and it opens **upward** — a drawer that grew downward would push its own trigger out of
  the rail, and the trigger is what closes it.

  Four decisions, each with an easier wrong answer:

  - **It says 문제 없음 when there is nothing wrong.** A footer that vanished when it was happy would
    reproduce at the surface exactly the fault it was built to fix. Not a disabled button either —
    that reads as *you may not look at the problems*; it is plain text, faint, 28 pixels.
  - **Every kind is named, in `FAULT_KINDS`, beside the checks.** A heading written in the panel is a
    heading nothing can read, which is what `toolbar-model.ts` and `panel-model.ts` already say about
    their own surfaces. A fifth `kind` on `Fault` with no line there is a group of rows with no title,
    and a test refuses it. Each carries a **why**, once per group: a list that says only what is wrong
    teaches a reader to dismiss it.
  - **Each row says where it is**, which is the half that makes it somewhere to go rather than a
    complaint. `holderOf` walks up to the page or the definition — and *both* of these links are in
    the 머리말 and 꼬리말 definitions, which is why the dialog counts two and the site draws ten. A
    reader told only 링크 would look through five pages and find it on none of them.
  - **It goes to the block, not to the node the check named.** `linkFaults` reports the **run of text**
    carrying the mark, correctly — that is where the fault is — and a run is not a thing anybody can
    select. `selectableAt` is the walk up, and it deliberately ignores a **lock**, unlike
    `pathFromPage`: a lock means *do not pick this up while pointing at the canvas*, and a reader who
    pressed a row in a list has already said which block they mean.

  And it is not a gate. Nothing refuses an edit and nothing is marked on the canvas — a page a reader
  is midway through building is *supposed* to be half-wrong, and a builder that underlines it in red
  while they work is one they turn off.

- **The token system could not say "something is wrong".** Found needing to paint *문제 2개*: twelve
  colour tokens, and every one of them is a surface, a rule, an ink or the accent. So there was no
  honest choice — the accent means *this is the thing you chose*, and painting a warning with it says
  a reader selected their own broken links.

  `--ou-warn` and `--ou-warn-soft`, in all three blocks. **Amber and not red**, and the distinction is
  the whole of what the token is for: red is refusal, the edit did not happen, and nothing in this
  suite refuses — a link whose page was deleted is a document a reader still has to be able to open
  and fix. Amber is *look at this when you have a moment*, which is what every one of these findings
  actually is. Lifted rather than deepened in the dark, because `#B45309` on `#171717` is a brown
  nobody reads as a warning.

  The wash is `color-mix`ed rather than stated, for the reason `--ou-accent-soft` gives at length —
  and therefore repeated in each dark block, because substitution happens where the property is
  declared. `tokens.test.ts` was already asking both of those questions and needed no change, which is
  the first time that has been true of a new token.

- **`pnpm type-check` ran the wrong thing, and esbuild had been saying so.** `package.json` declared
  `type-check` twice — `pnpm -r type-check` at line 24 and `node scripts/typecheck-all.mjs` at 33.
  JSON keeps the last, so the whole-suite check is what ran and the per-package one was dead; the
  warning was printed by every vitest run in the repository. The per-package form is `type-check:each`
  now. A duplicate key is the one kind of defect where both readings are plausible and only one runs.

- **A state now eases in one way and out another.** `transitionMs` shipped with one curve,
  `cubic-bezier(0.2, 0, 0, 1)`, on the block's own rule — which governs **both directions**, so a
  card eased *in* the same way it eased *out*. Every considered system uses ease-out arriving and
  ease-in leaving, for a reason about eyes rather than taste: arriving, fast-to-leave is what makes a
  change *noticed* and slow-to-settle is what makes it *followable*; leaving, the opposite, so the
  thing reads as letting go rather than being snatched away and the eye is not pulled back to
  something the reader has moved on from.

  **The whole of how two curves fit on one property**: a browser reads the transition of the ruleset
  it is going *to*. So the block's own rule carries `LEAVE` and the state's rule carries `ENTER`, and
  the hover's curve governs the arrival while the base's governs the return. One extra declaration
  rather than a mechanism — `transitionsFor` grew a fifth parameter and `stateRules` calls it twice,
  keying the second pass by selector so each state rule can pick up its own arriving line.

  Both notations, because a state has always had two: the published rule and the board's
  `!important` one. The test states the contract in the shape the old one denied — the previous
  assertion was `expect(line).not.toContain(':hover')`, and it still passed, because it found the
  *first* line with a `transition:` in it. A test whose premise had changed and whose subject had
  not: it was asserting the base rule exists, which is true either way. It now finds both lines and
  names the curve each carries.

  This closes the refinement the original entry left on the table with the reasoning attached — the
  bullet below reading **It is on the block, not in the `:hover`** was right about the fault and
  wrong about the remedy being exclusive. It is on the block *and* in the `:hover`, with a different
  curve each way.

- **The link picker is offered when there are words to link.** The last item of the chrome audit: a
  144-pixel dropdown reading 링크 없음 sat on the site's toolbar at all times, and what a block links
  to is a fact about *words* — a reader who has selected a card is not being asked about it.

  Chasing whether it could ever be enabled is what found the selection sync, so the item that looked
  like a placement quibble was the visible end of the largest fault in this sweep.

  And it would not go away even once the group was made contextual, because **`removeLink` answered
  `() => true` in every state**. A link is a mark and a mark covers a range, so taking one off a caret
  is a transaction that commits and changes nothing — and a control offered in every state says
  nothing about the document. It asks for a range with something in it now, which is the same answer
  `copy` and `cut` and the move commands all needed this week. Four `canExecute`s that were looser
  than their `execute`, in one sweep.

- **A page builder had no way to make a word bold.** The site registers `toggleBold`,
  `toggleItalic`, `toggleUnderline` and `toggleStrikeThrough` and offered **not one of them** — not
  on the toolbar, not in the panel.

  Two things kept it invisible, and both are worth knowing. Text **could not be selected** at all
  (above), so every one of those commands was correctly refusing a collapsed caret and looked like a
  control that was merely unavailable. And `every-command-can-be-reached` counts the commands a
  product *adds*: these come from the shared kit, so the harness never asked this product for a
  control. A gap that two separate mechanisms were each explaining away.

  Four and no more. A colour, a size and a font are the panel's the day a page needs them; these are
  the ones a reader reaches for mid-sentence, which is what a toolbar is for. Contextual, for the
  reason Word's and the deck's groups are — they mean nothing to a reader holding a block, and a page
  builder's reader is holding a block most of the time. And `state` rather than a plain toggle,
  because bold on a partly-bold selection is neither on nor off.

- **Text could not be selected on a page.** `editor.selection` **never moved**: wherever a reader
  clicked or dragged, the model held the collapsed caret that entering text had put there.

  So every command that needs a range was unavailable — **굵게, 기울임, 복사, 잘라내기 and the link
  picker**, all permanently grey, each of them correct at its own end. Nothing reported it because
  every `canExecute` was answering *honestly* about a selection that was genuinely collapsed. A page
  builder where text cannot be selected is not a text editor, and the product had been in that state
  for as long as it has had three boards.

  The cause is one line. `DOMSelectionHandlerImpl` compared the reader's caret against
  `editor._viewDOM.contentEditableElement` — **one slot on the editor**, holding whichever view was
  created last — decided the selection was *outside the editor*, and returned. A page is drawn at
  three widths and the app mounts a fourth view of the whole document. The handler already carried
  `this.view` for exactly this reason, with a comment recording what it cost the last time
  (*"entering text on the desktop board puts the caret on the mobile one"*); this call site had not
  been changed to use it.

  Found by chasing the last chrome-audit item — *the link picker is a property on a toolbar* — and
  measuring whether the picker could ever be enabled. It could not, in any state. Which is the third
  time this sweep that "a control that can never be enabled" turned out to be the visible end of
  something else.

  Two things it uncovered on the way:

  - **A range selection was carrying `nodeIds` from the node selection before it.** A selection
    object that lies about itself, and a browser test was reading that leftover. Fixing the sync took
    it away.
  - **Detaching a component left a caret inside the frame rather than the frame selected.** Every
    tool leaves the result of an ungroup selected, because the next thing a reader does is to that
    object. It had always been happening; the stale `nodeIds` made the document *say* the frame was
    selected while the model's own type said otherwise.

- **The deck's toolbar answers to the selection too.** Measured the way Word's was, with one box
  selected: of **60 controls**, `align` was 10 of 12 disabled, `table` 9 of 9, `character` 5 of 5 and
  `group` 2 of 4 — twenty-six that could do nothing. With **nothing** selected it was forty-four, in
  two rows. It is 31 controls and one row now, and 51 once a box is chosen.

  The boundary Word's version settled held here without re-deciding: `character` is dead for want of
  a **selection** and these four for want of a *kind* of one. Both are answered by asking the group's
  own controls, where Word answers `table` from the caret's own table because it already computes one
  for the look flags — same rule, one product with a shortcut, and `when`'s value says which context
  a group is about.

  Two things the browser said that a probe got wrong first:

  - **A cell selected is not a caret in a table.** A probe that selected a `bTableCell` node found
    every table command refused and looked like a dead group of nine; `findAncestorCell` walks up
    from a **range**, so it takes two double-clicks — into the box, then into the words. The product
    was right and the measurement was not.
  - **A pane that grows has less scroll to give**, and the wheel-zoom's anchoring gives way at the
    edges by design. Losing a toolbar row made the pane 32 pixels taller, and a test that aimed near
    the top of a *fitted* deck then measured the clamp rather than the correction — 1.8% out, with
    nothing wrong. It zooms in once first now, so the correction has room to act.

- **A slide can be named** — the one thing the deck's sample writes and the product could not.

  `sample-deck.ts` gives every slide a `name` in TypeScript (*Title*, *Shapes*, *Table*) and `nameOf`
  falls back to the title placeholder for a slide with none. Between them the filmstrip always said
  *something*, which is exactly why nobody noticed that **a reader could not write one**. The same
  finding this backlog has had about a site's pages and a component's name: the thing exists because
  a sample file said so.

  It matters because four surfaces list slides *by name* — the filmstrip, the map, the audit and the
  누르면 → 이 슬라이드로 picker — so a slide whose only content is a picture is **nameless in all
  four**, and a reader looking at the map to find where a button goes is shown a blank. `nameOf`'s
  own comment already had the half that decides it: *"a name invented here would be indistinguishable
  from one the author chose"*. So the author chooses.

  Renamed **in the filmstrip**, for the reason the site's layer list gave: that is where a reader is
  looking at a list of names. And emptying it is *removal* rather than an empty name — a slide called
  `""` would sit there as a blank row the title fallback can no longer fill, which is worse than the
  fallback.

- **The last two the sidebar owed: a layer row renames in place, and a dataset can be copied.**

  Every other list in the rail renamed in place and the **layer list sent a reader to the panel** for
  it — a different pane, a different tab and a scroll, for the one edit somebody is most likely to be
  making *while looking at a list of names*. Double-click, which is what a list of names has meant
  since before any of this existed.

  And the fourth act a dataset could not do. The second one is nearly the first — a reader with a
  상품 dataset who wants 지난-상품 wants those columns and those rows and then a few edits — and the
  alternative is typing the columns again and getting one slightly wrong, which is the fault that
  makes a `field:` reference draw nothing. Two things it has to get right: a **name nothing else
  has**, because a name is what a collection points at and two datasets called 상품 is a list drawing
  one of them with nobody able to say which; and **rows of its own**, because two datasets sharing
  one records array is one document with two names for the same rows, which the next edit proves.

- **The component library can be renamed and cleaned out.** `createComponentFrom` has existed since
  components did and **nothing has ever renamed one or removed one** — a reader who made a card,
  called it what they were thinking at the time, and made three more had a list that only grew and a
  name that was wrong forever.

  Found by comparing the three lists the rail draws rather than by anything reporting it: a page can
  be made, renamed, duplicated and removed; a dataset can be made, renamed and removed; a component
  could **only be made**. One shape, three answers — and the kind of gap no check catches, because
  every part of it works.

  Two decisions:

  - **The name and not the id.** `name` is what a reader calls it; `componentId` is what a placement
    points at. Renaming the id would be `setComponentVar`'s job — the same rewrite across every
    placement — for no gain, since an id nobody sees is not a thing a reader is dissatisfied with.
  - **Removing refuses while anything places it**, which is `removeDataset`'s rule for
    `removeDataset`'s reason: a placement whose definition has gone draws *nothing*, and nothing is
    exactly what a reader would be looking at while wondering what they broke. The button says
    *3곳에서 쓰는 중이라 지울 수 없습니다* rather than greying in silence — which needed `IconButton`
    to grow a `title` that is longer than its accessible name.

  The field **replaces the row** rather than opening a dialog: renaming is the smallest edit there
  is, and a modal for it is three gestures where one would do.

- **A layer row can be dragged — to a place, or into a container.** Which is the only way to reach
  some blocks at all: an empty stack and a block behind another block cannot be grabbed on the
  canvas, because there is nothing to aim at, and the list is where they have a row.

  `office-ui`'s `useStackOrder` is **not** the tool, and saying why is the useful part. It assumes
  what the deck's list is — a flat row of shapes in one container, all the same height — so a drop is
  `(pointerY - top) / rowHeight`. A page's list is a **tree**: rows at four depths with different
  parents, and index arithmetic cannot say *which parent*, which is the whole question.

  The **thirds** are what it uses instead: top is *before this*, bottom is *after this*, middle is
  *inside this* — offered only by a row that can hold something, because a drop into a paragraph has
  no meaning and a target that sometimes lies is worse than one that is smaller. Reparenting by
  indent is the other convention and it is the one that needs a tutorial; a line between two rows is
  a place and a filled row is a container, which a reader can see. Two marks, because one highlight
  for both would make *after the card row* and *into the card row* the same picture.

  Three things measured rather than assumed, each of which stopped the drag dead:

  - **`setPointerCapture` sends every later `pointermove` to the row that was grabbed**, so no other
    row's handler fires and the drop marker never appears. A window listener ends the drag instead,
    which also survives a pointer released outside the list.
  - **The row *is* a `<button>`**, so a guard written as `closest('button')` to let the eye and the
    padlock through found the row itself and refused every drag. What has to be excluded is only what
    is inside it.
  - **Moving down inside one parent loses a place as the row leaves it**, so the index a reader
    pointed at is one too many. The off-by-one everywhere this has ever been written, said out loud
    rather than left to a `+1` nobody can explain a year later.

  The model half was already there: `moveBlockInto` is the drag's transaction and it already refuses
  a move into itself or into something it holds.

- **A block can be hidden and locked.** The two words the office schema already had — for things
  placed on a canvas — and a page needed both anyway, which is the third time these two worlds have
  turned out to share more than the shape of a coordinate.

  **Hiding** is the commonest reason anybody opens a layer list: a reader drafting a section wants it
  off the page for a week, and the only move available before this was *delete it and undo later* —
  which is not a move, it is a thing they get wrong once and never try again.

  The editor and the visitor are told **different things**, on purpose:

  - the editor draws it `display: none` and goes on listing it in 구성 with the properties panel
    still working, because a block a reader cannot get back to is a block they have lost. Gone from
    the canvas, present in the list, is what Figma, Sketch and Photoshop all do.
  - the export **removes** it. `display: none` still ships the words — to a crawler, to a reader with
    styles off, to anybody who opens the source — and a section somebody hid is a section they did
    not mean to publish.

  And measured after that landed: the element was gone and **its media query, its `:hover` and its
  arrival were all still in the stylesheet naming it**. Harmless to a browser and not to a reader —
  those rules were the one remaining trace that the section exists. `styledNodes` skips a hidden
  block now, which is the single place all three rule-writers walk.

  **Locking** is the cheaper half: nothing about the drawing changes, only what the overlay hands
  back. Left out of the selection chain entirely rather than *selectable but refused*, so a press on
  a locked background picture finds what is behind it — which is the point of locking one, since the
  only way past a full-width picture today is to find something on top of it and walk up. Its
  children stay selectable: locking a section to stop nudging it is not a statement about the words
  in it.

  The rows show the eye and the padlock **only when they say something**, or under the pointer.
  Twelve rows each carrying two grey glyphs is a column of noise a reader reads past, and the deck's
  layer panel already records the reason: *"drawing the act would put a crossed-out eye on all
  twelve, which reads as twelve hidden layers"*.

  The harness did its half twice: it reported `visible` was **read now** the moment the exemption
  saying otherwise came off, and then reported that nothing could **set** it until the panel rows and
  `setBlockFormat` existed. `locked` keeps an exemption with a truer sentence than it had — it is
  read by the overlay, which is a place a probe that compares drawings cannot reach.

- **The layer list is a tree rather than a wall.** Measured on the sample's home page: **110 rows,
  2,923 pixels of them, in a 928-pixel pane** — three screens of list, every row expanded because
  there was nothing to close, and a reader looking for the footer scrolling past a hundred rows of
  things they were not looking for. It opens at **twelve**.

  Closed by default is what every tool of this kind does, and the reason here is that number rather
  than the convention. Two halves make it work, and each is easy to leave out:

  - **The ancestors of what is selected are always open.** A reader clicks a card on the canvas and
    the list opens the path to it, rather than showing a closed band and leaving them to guess which
    one to press.
  - **A tree that fits on a screen is simply open.** Closed-by-default answers 110 rows; it does not
    answer two. The boards' root changes when a definition is being edited — a stack with a word in
    it — and being shown one closed row there is being made to press a triangle for something you
    could have been shown. Twenty-four rows, which is what the pane holds with room to spare.

  And a triangle shows what is inside where the row beside it selects: a reader who had their
  selection replaced every time they went looking would lose it constantly. The disclosure is a
  `span` with a role rather than a nested `<button>`, because a button inside a button is invalid and
  the browser's recovery is to close the outer one early — the whole row after it would stop being
  clickable.

- **A sweep that pressed all 33 menu entries, and the four faults it found.** Worth more than any of
  the fixes: an entry that can *never* be enabled looks exactly like one that is merely unavailable
  right now, and nothing short of running the whole bar tells them apart.

  - **`moveBlockUp` / `moveBlockDown` lit up, ran, and did nothing.** Their `canExecute` asked only
    *is there a selection*, while `execute` required a **range** — a caret in text — and returned
    false to a console nobody is watching. A `canExecute` looser than its `execute` is worse than one
    that is wrong, because the product looks like it works, and it is a class of fault the harness
    cannot see: it asks whether a command is *reachable*, never whether it is telling the truth.

    Fixed in the shared extension. And the site got **its own pair**, because the shared ones mean
    the other thing: they move the block the *caret* is in, and a page builder's reader selects a
    card and wants it one place up — clicking a card is how you stop being in its text.
  - **Three entries could never be enabled.** `insertPlacement` answers against a `componentId`,
    `insertDataList` against a dataset *and* a definition, `insertDataset` against neither. A menu
    has none of those to give, so 삽입 points at the **rail** instead, which is where the choice can
    be made — what 삽입 › 표 does in every word processor. Two exemptions came back to the
    conformance test saying something sharper than before: not merely where these are reached, but
    *why they cannot be reached anywhere else*.
  - **복사 was offered with nothing selected.** Copying nothing is not a no-op — it reports success
    and leaves the clipboard holding an empty string, so the reader's *previous* copy is gone. `cut`
    already asked for a range with something in it; the two are the same question about the same
    selection and disagreed about it.
  - **A React warning that was right about the code and wrong about today.** `TextField` passed its
    `key` inside a spread, which React 19 warns about — *keys must be passed directly* — and still
    honoured, so nothing was visibly broken. A warning in that state is exactly the kind that gets
    ignored until the day it stops being wrong.

- **Seven places drew a unicode character where an icon belonged.** A typed glyph is drawn by
  whatever font resolves it, at that font's weight and baseline, so it never matches the 16px
  lucide set beside it. `office-icons`' own header records this being learned once — the alignment
  controls were `⟸ ⟺ ⟹` and the character controls were the letters B, I, U, S — and `stack.tsx`
  records it a second time about `␡`, *which had no glyph in most fonts and came out as a box with
  DL in it*. Four `␡` were still in the deck, and I had just added a `✓` to the menubar.

  All seven are `office-icons` now, and the set grew four names — `back` (a full arrow, where
  `previous` is a chevron: one leaves a place and the other moves the view one step) and
  `screen-desktop` / `screen-tablet` / `screen-mobile`.

- **The site's chrome stopped saying things in words that pictures say better.**

  - **The toolbar's four object actions** — 복제 · 삭제 · 컴포넌트로 · 컴포넌트 해제 — were plain
    text on a strip where everything else in the suite is an icon with a tooltip, so they read as
    links and nothing among them was primary. All four already declared an icon that nothing drew.
  - **The panel said which width it writes to with the first syllable of the name** — 데 / 태 / 모.
    A one-syllable Korean truncation is not an abbreviation; it carries no meaning at all. Which
    glyph means *tablet* is declared with the breakpoint, since it is a fact about the breakpoint.
  - **지우기 wrapped to two lines** inside the 그라디언트 and 그림자 rows, where two colour fields
    share one row's control column: three characters and their padding is 46px in a column with 40
    to give. It is the `close` glyph now, and `shrink-0` — the fault underneath was a button that
    agreed to be squeezed.
  - **The insert palette was a column of unadorned words**, which is a menu rather than a palette:
    a reader picking a shape scans for the shape. The three containers each carried `add`, which is
    one drawing for three arrangements a picture can tell apart at a glance and a word cannot.

  One thing the icons found: `.st-rail-item` is `space-between` because a page's row puts its
  address on the right and a component's puts its use count there. An insert row has no right-hand
  fact, so the same rule threw the label to the far edge with the icon alone on the left.

- **Word's toolbar shows what the selection can be asked.** Measured with a caret in an ordinary
  paragraph: of 69 controls, **arrange was 12 of 12 disabled and table 15 of 15**, and everything
  else was live. Twenty-seven glyphs that could do nothing, on screen always — and the second row of
  the strip existed because of them. It is eight controls long now.

  The interesting part is the boundary. *"Hide a group where nothing can run"* is nearly the right
  rule and needs no declaration at all — and it would have hidden almost the whole toolbar, because
  measured with **nothing** selected, `character`, `list`, `paragraph`, `drawing` and `layout` are
  all wholly disabled too. A reader who has just opened a document would meet an empty bar that
  fills in when they click, which is worse than the problem. Those are disabled for want of a
  *selection*; these are disabled for want of a *kind* of one, and that is a fact about the product,
  so the product says it: `ControlGroup.when`.

  Two contexts, answered differently, and both readings are real rather than one guessing at the
  other's question. A **table** is the one around the caret, which the ribbon already computes for
  the look flags. A **shape** has no such anchor — what "a shape is selected" means is exactly what
  the arrange commands answer, so the group asks its own controls.

  Which also produced a two-level answer worth keeping: the arrange group is absent while there is
  no shape, and *inside* it a control that needs a **set** greys while there is only one, because
  aligning one thing against itself is a gesture with no meaning.

  And the menubar moved while doing this. It was beside the document title, which was wrong for a
  reason only the screenshot showed: `doc-title-bar` is not an app brand, it is the *document's*
  title, subtitle and author as editable fields, and a menubar dropped among them reads as one more
  field.

- **The deck's title bar went from twelve buttons to four things.** 파일 · 편집 · 슬라이드 · 보기,
  the slide count, the zoom, and two buttons: **발표** and **전체 보기**. Ten retired into the menus.

  Which two stay is the decision worth recording. A menubar does not mean no buttons — it means the
  buttons left are the ones a reader reaches for **without reading**, and a presentation tool has
  exactly one of those. Everything else on that bar was a dialog opened twice in a deck's life
  (크기, 레이아웃) or a pane looked at occasionally (검사, 지도), sitting at the same size and weight
  as the thing the product is for.

  Three things came out of doing it:

  - **`FileActions` publishes its three acts through an imperative handle.** What could not move is
    the picker's hidden input — a file cannot be handed to a browser by clicking a button, so the
    input has to be in the DOM whether or not a button stands beside it. What moved is only *where
    the reader asks*, which is what a ref is for.
  - **A menu entry can say why it is greyed.** 스크롤 상영 is refused in a links-only deck, with the
    reason in its tooltip — *a scroll is a line, and a deck that is not one has nothing to run
    along*. Moving it into a menu would have thrown that sentence away, and a disabled control that
    says nothing is the commonest small cruelty in a tool. `MenuEntry` carries a `title` now.
  - **A pressed toggle and a primary action were the same colour.** 전체 보기 was blue because its
    view is on, beside a plain 발표 — so the accent read as *this is the main button* and pointed at
    the wrong one. 발표 is the accent now and the toggle is plain; its label already says which state
    it is in.

  Costed at 78 checks naming the buttons by `data-*`; the ones that moved did so through one helper,
  `pickMenu(page, 'file.document.0')`, which asks by the id the model gives an entry rather than by
  words — a menu entry's words being the one thing a product is free to change.

- **The site's menubar grew from 11 entries to 33, and its toolbar gave up what was not a tool.**
  Measured first: the product registers **128 commands** and the menubar reached eleven of them.

  What was missing and is not any more:

  - **잘라내기 · 복사 · 붙여넣기 · 모두 선택.** All four registered, all four keyboard-only, in no
    menu and on no control. The four oldest items in the oldest menu there is, and a reader on a
    borrowed laptop had no first way to any of them.
  - **찾기**, same shape. And **위로/아래로 옮기기** — ordering, which is what a page has instead of
    a z-order — registered, bound to nothing, on nothing.
  - **삽입**, fifteen entries, **derived from `SITE_TOOLBAR` rather than written again**. The inserts
    are already declared once with their labels and the words that say what each makes; a menu that
    listed them a second time would be one more copy to go out of date. Two blocks, because `puts`
    already distinguishes a container from a block that goes in one.
  - **확대 · 축소 · 실제 크기 · 화면에 맞춤.** Zoom was a `ZoomControl` in the corner, which is right
    for a reader who drags and useless for one who wants 100% exactly or is on a keyboard.

  And the toolbar lost the board toggles, which is the division working: which boards are on screen
  is a *view* setting changed rarely, and a toolbar holds what acts on the selection.

  Two things that came out of drawing it, both shared:

  - **`SegmentedControl`**, because *one of these* and *any of these* were the same control. 선택/텍스트
    and 데스크톱/태블릿/모바일 were both accent-bordered toggles side by side, so nothing said that
    turning all three boards off is allowed and turning both modes off is not. A segmented control
    says it with **shape**: one enclosure, the current choice lifted rather than outlined.
  - **A check mark on a menu entry.** A menu of settings drawn as a menu of actions makes a reader
    press one to find out what it was. `checked` is `undefined` for everything that *does* something,
    which is what makes the mark mean something.

  Two more prose exemptions went **stale** the minute 삽입 existed — `insertPlacement` and
  `insertDataList` had claims describing rail buttons. That is four so far.

  And one thing the menu had to learn: **the last board cannot be turned off.** A builder showing no
  boards is a builder showing nothing, and the reader who got there has no board left to press.

- **A menubar in all three products, beside the toolbar rather than instead of it.** Both surfaces,
  because they answer different questions: a **menubar** holds what acts on the *document and the
  application* — things done occasionally, which need to be **found** — and a **toolbar** holds what
  acts on the *selection*, done constantly, which needs to be **reached**. One strip cannot be both,
  and Word's 71 controls in one flat wall is what happens when it tries.

  The shape is shared (`office-controls`' `MenuModel`) and the content is not, which is the split
  `PanelRow` already makes: *which* commands a product puts in 파일 is a fact about that product, and
  *what a menu entry is* is the same everywhere. `office-ui`'s `MenuBar` is built on the context menu
  rather than beside it — `Menu` already draws a keyboard-walkable list at a point, portalled, with
  shortcut hints and disabled entries.

  What it made reachable, and the pattern that connects them: **`window.exportSite`** in the site
  builder and **`window.wordPrintPages`** in Word were both capabilities parked on `window` for want
  of anywhere to put them, and Word's 찾기 was bound to a chord and on no control at all — so a
  reader who did not already know ⌘F could not find it. A shortcut is a *second* way to reach
  something, never the only one. The **99 bindings** across three products now have somewhere to be
  read.

  Three things measured rather than assumed:

  - **An entry that could never be enabled.** A command whose `canExecute` needs a `nodeId` is greyed
    *forever* from a menubar that sends none — the site's page commands first, then the deck's slide
    commands. `needs` is the model asking the app for something only the app knows, rather than the
    app guessing.
  - **The arrows did not work.** Left/right were handled on the menubar element, and the open menu is
    portalled to the body with the trigger's `pointerdown` prevented — so by the time a reader
    presses an arrow the focus is nowhere near that element. On the document while one is open, which
    is how `Menu` already takes its own up/down.
  - **A default is only safe where being wrong is cheap.** Publishing falls back to the home page;
    deleting does not.

- **The site builder can publish.** `exportSite` rendered every page of a site for weeks, was held by
  a test that compares it property by property against what the editor draws, and was reachable from
  `window.exportSite` — put there for the console — and from **nothing a reader could press**.

  The fix that matters is not the button. It is that publishing became a **command**: the harness
  counts commands, and a capability that is not one is invisible to every check here. It reported
  both new commands as unreachable within a minute of their existing, which is the check working.

  `exportSite` and `exportPage` are two commands rather than one with a flag — a keyboard can bind to
  one of them, and a reader publishing the page they are looking at is doing a different thing from a
  reader publishing the site. They hand back what to write and write nothing: what a *file* is (a
  download, a zip, a POST to a host) is the app's question, which is also what keeps the export
  usable from a test with no download in it.

- **A menubar, and the division it exists for.** `office-ui`'s `MenuBar`, built on the context menu
  rather than beside it — `Menu` already draws a keyboard-walkable list at a point, portalled out of
  whatever clips it, with shortcut hints and disabled entries. What a menubar adds is two behaviours:
  left and right walk between menus, and once one is open, pointing at another opens it.

  The division is the point and it is not a convention being followed: a **menubar** holds what acts
  on the *document and the application* — things a reader does occasionally and needs to **find** —
  and a **toolbar** holds what acts on the *selection*, which they do constantly and need to
  **reach**. One strip cannot be both without becoming the wall of glyphs Word's second row is.

  Declared in `menu-model.ts`, for the reason this backlog has now paid for four times: a surface that
  declares nothing cannot be asked. Adding it made three prose exemptions **stale** the same minute —
  `insertPage`, `duplicatePage` and `removePage` had claims describing rail buttons, and a declaration
  says it now.

  Two things measured rather than assumed:

  - **An entry that could never be enabled.** `duplicatePage` and `removePage` answer `canExecute`
    against a `nodeId` and return false without one, so from a menubar with no payload they were
    greyed *forever*. The model declares `needs: 'page'` and the app fills in the page a reader is on
    — which is genuinely the app's to know, since the document has no notion of one being open.
  - **A default is only safe where being wrong is cheap.** Publishing falls back to the home page;
    deleting does not. One costs a reader a file in their downloads folder and the other costs them
    the page, and the two sit next to each other in the same menu.

  It also gives the **99 keyboard shortcuts** across three products their first home: a tooltip
  teaches a shortcut to a reader who has already found the button, which is the reader who needs it
  least.

- **A block can say how it arrives as a visitor scrolls to it.** `reveal` — five of the deck's own
  names (`rise`, `slideIn`, `pop`, `focusIn`, `appearSlowly`), because the deck arrived at that
  vocabulary first and a second product spelling the same idea differently is the fault this backlog
  keeps finding. What is *not* shared is the arithmetic: a slide's motion is a timeline played on
  arrival, and a page has no timeline — a visitor scrolls, and how far they have scrolled is the only
  clock there is. The deck's other nine are deliberately not offered: they either need a script
  (`typewriter` is per-glyph) or say something a scroll cannot (`springIn` rings over its own
  settling time).

  **No script**, which is the property `states.ts` already argued for and this keeps:
  `animation-timeline: view()` is the browser's own answer to *how far has this entered the
  viewport*. Every other builder does this with an `IntersectionObserver` that adds a class.

  Two guards that are not optional, because the hidden half of every one of these is `opacity: 0`:
  `@supports (animation-timeline: view())`, or a browser that cannot run it applies the start state
  and never advances — a page whose content is invisible forever; and
  `prefers-reduced-motion: no-preference`, dropping the whole block rather than shortening it,
  because there is no reduced version of an animation whose first frame is invisible.

  It runs **only in preview**. Every one of these starts invisible, and a builder that hid half a
  page from the person building it would be unusable — so while editing every block is simply there.
  That is the same argument the state switch makes, with the mode doing the switch's work.

  Two things only a browser could have said, and both were wrong first:

  - **The last block on a page never finished arriving.** The range ended at `cover 30%` — a third of
    the way through the block covering the window — and there is no scroll left underneath the last
    block, so that point is unreachable and it sat at 14% opacity forever. A page's footer is the one
    thing on it that is always last. Everything inside the `entry` phase is reachable for every block
    including the last, because a scroller's end still brings its final element fully into view.
  - **The animation was attached to the wrong scroller** — see the next entry.

- **`EditorViewDOM` was making every editor container a scroll container, in all three products.**
  `container.style.overflow = 'hidden'`, which says *do not paint outside me* **and** *I am a scroll
  container*. The second half is a claim nothing here meant to make and that nothing could see: a
  scroll container with no scrollable content behaves exactly like a clipped box.

  Until something asks which element scrolls. `view()` takes its clock from the nearest scrollport,
  found this container, and this container has nothing to scroll — so a block told to arrive on
  scroll never arrived, while the pane that actually scrolls moved underneath it. The rule was
  written correctly and the browser accepted it.

  `overflow: clip` clips and is not a scroll container, which is what was meant. Nothing in the three
  products scrolls this element — they scroll a pane above it — so the only behaviour that changed is
  the one that was wrong. Word 353 and the deck 395 say so.

- **A component's variable can be renamed and taken away.** `bindPartText` gave a template the half a
  reader needs to grow a card — name a variable that does not exist and it is declared. The other
  half was hand work, so a typo in a variable's name was permanent and a variable added by mistake
  could only be *unbound*: the card kept accumulating questions nobody answers, and every placement
  grew a field with nothing behind it.

  The reason it is a command and not four panel writes is that a variable's name is written down in
  **three** places and only one of them is the declaration — the `componentVar`, every
  `componentBind` that says which part takes it, and a `componentValue` in every placement, on every
  page, **including the template instance a data list draws and nothing can select**. Move any two
  and the third names something that no longer exists: the parts fall back to the definition's own
  words and every placement silently loses its answer. One transaction, one undo.

  Three decisions written into the commands:

  - **A rename onto a name that exists is refused, in `canExecute`.** Two variables with one name is
    a card where the second silently answers the first, and every placement then has two answers to
    one question with no rule about which wins. A reader who means to merge two is doing something
    else. Checked in `canExecute` and not only in the command, so the panel greys it out rather than
    letting a reader press Enter on a name that does nothing.
  - **The answers are not converted when the kind changes.** A `componentValue` is a string whatever
    the kind, and the schema says why. Converting would be the command deciding what `0원` is as a
    number, in every placement, silently.
  - **Removing a variable is not removing the part.** The block goes back to drawing its own words —
    the fallback the definition already held. A card that lost its price row every time somebody
    regretted a variable is a card a reader has to rebuild to undo a decision.

  The harness found the thing that was wrong about the first attempt: the removal was a button this
  app rendered and no model mentioned, so `every-command-can-be-reached` reported a command a reader
  could run that nothing declared. It is the row's `with` now, which is what `with` is for. That also
  turned up a real limit one level down — `PropertySheet` keyed rows by `group.attr`, and two rows in
  one group may legitimately both name `componentVar`, because a row that writes a **child node**
  names a node type rather than an attribute. Keyed by the accessible name as well, which a panel
  already guarantees is unique.

- **A block can say how long it takes to answer the pointer.** `transitionMs` — one number, on the
  block, `0`–`2000`. The pairing every design system has and this one had no word for: a hover that
  arrives instantly reads as a *replacement* rather than a change, and the eye cannot tell what
  caused it.

  Three decisions worth keeping, each of which had an easier wrong answer:

  - **The properties are named, not `all`.** A hand-written page says `all` because it does not know
    what will change; this one does — `stateChanges` has already computed the exact declarations
    every state alters, so the rule names those and nothing else. Which is not tidiness: `all`
    transitions whatever the browser considers animatable, and it is why a hover on a hand-written
    page so often drags something unrelated with it. It also means the list can never fall behind
    `STATEABLE`, because it is not a list — it is what the block actually promised.
  - **It is on the block, not in the `:hover`.** Declared inside the state it would animate the
    arrival and not the leaving: eased in over 160ms and snapped back the instant the pointer goes.
    One line's difference, and it is the classic half-built hover. *(Superseded: it is on the block
    **and** in the `:hover` now, carrying a different curve each way — see the enter/leave entry at
    the top of Done. The fault this names is real; "not in the `:hover`" was one remedy too few.)*
  - **Unset is not zero.** A block nobody has told answers the way it always did and carries no rule;
    `0` is a reader saying *instantly*, on purpose. Same drawing, different documents — and both are
    reachable only because the number field learned what an emptied field means, one commit earlier.

  The harness found the one thing that was not obvious: `every-attribute-is-read` reported it on four
  node types, correctly, because a renderer does *not* read it. It is the second thing on a page
  published as a **rule** rather than folded into a drawing, after `states` itself — which never
  appeared there only because an `object` attribute is unaskable. The exemption names where the
  reading is held, so it fails the day that stops being true.

- **A component that says it owns its DOM is now left to.** `external({ managesDOM: true, mount,
  update, unmount })` is how a node type says *I will draw myself* — the equivalent of a ProseMirror
  NodeView, and the right home for anything the renderer cannot express as elements. It was declared
  and not honoured, in **four** separate places:

  - `mount` was handed `{ id }` and nothing else, so a component could not draw what the node says.
    It gets the model's own fields now — `attributes`, `text`, `content` — flattened as props, which
    is what a template already reads through `data('text')`.
  - The element it returned was **wiped**: `removeStaleChildren` removes every child of a host that
    no fiber accounts for, and a component's own DOM has no fibers. It now keeps out of a node that
    owns its element.
  - `update` looked the component up through `context.getComponent` alone where `mount` also looks
    in the registry — so with a registry it was always undefined and the branch never ran.
  - …and even when it ran it compared `prevVNode.props` with `nextVNode.props`, which for an external
    component are **always both `{}`**, and then called `update(instance.element, …)` where the type
    says `update(instance, …)`.

  Four faults stacked, each of which alone was enough to make the feature do nothing. Held by
  `test/external-owns-its-dom.test.ts`, which states the contract rather than the current behaviour.

- **…and the element it returns is now the node's, with nothing around it.** The fifth fault, and the
  one that made the other four only half worth fixing: `createComponentVNode` hard-coded `tag: 'div'`,
  so the renderer created a `div`, mounted the component *inside* it, and the page got two elements
  where the component had made one. Every consequence of that was silent and wrong in a different
  way — the block's own rect was the wrapper's, the editing layer opened over the wrong box, and a
  `pre` inside a `div` is a different thing to CSS than a `pre`.

  It mounts in the **render** phase now and adopts what `mount` returns as the fiber's element
  (`mountOwnElement`, with `fiber.meta.mounted` so the commit does not mount it twice). Which is the
  correct shape and not a smaller fix: what the renderer places is what the component made, so the
  node's id, its class, its rect and its place in the tree are all one element's.

  One more thing had to become honest for a component to be able to draw itself: `props.content` held
  child **ids** when the tree came from a store and child **objects** when it came from a detached
  one, and both reach a renderer — the boards draw through a live document, an export renders a tree
  it just built. A component asked about a node should not have to know which it got, so
  `childrenOf` resolves ids through the datastore the renderer is already holding.

- **The code block is the first thing on `managesDOM`, and stopped needing keys.** It was mapped
  token-for-token into vnodes, which needed a `key` on every span for the reconciler to tell them
  apart, which is a lot of machinery to describe a tree that is not the document's and that nothing
  else will ever reconcile. It fills its own `pre` with `Prism.highlight` now — the escaped output
  Prism guarantees, so the code still never reaches the page as markup — and `codeElements` is gone.
  Held by `packages/office-site/test/code.test.ts`, which draws it through an `EditorViewDOM` over a
  store: a `pre` with the node's id and no wrapper, the same element kept across a language change,
  and the export carrying the spans the reader saw.

- **A flaky deck test made honest.** `filters as motion` waited a flat 1800ms for a filter to clean
  itself up and then asserted it had. It lost the day three browser suites ran at once and reported
  a leak that was not there. It polls now. A check that fails when the machine is busy is a check
  nobody trusts the next time it fails.

- **A code block is drawn by Prism and edited in a layer of its own.** Two decisions, and each
  removes a class of question rather than answering it. Prism tokenizes **in the renderer**, so the
  spans are in the markup the editor draws and the export writes — the same bytes in both, with no
  script for a visitor to run. And the caret **never enters** one: `contenteditable="false"`, so
  offsets through spans nothing owns, IME, marks, Enter and Tab all stop being asked about.

  Editing opens a real code editor (CodeMirror 6) in a layer over the block, on the same double-click
  that means *the caret* everywhere else, and the document takes **one transaction** when it closes.
  Which is safe for a reason worth stating: the objection to embedding an editor was about the
  *always-embedded* shape, and a layer that opens on a gesture is a different proposition — nothing
  nested, nothing for the export to see, one undo.

  It replaced painting ranges through the CSS Custom Highlight API. That worked and was the wrong
  idea twice over: a way to *colour* something rather than a way to say what a code block is, and a
  published page that had to run our function to be coloured.

- **`key` was reaching the DOM as an attribute.** `initializeElementVNode` takes it off a **copy** of
  the template's attributes, and `_setAttributes` re-applies the original — so it went straight back,
  and nothing later cleared it because the next vnode had no `key` to diff against. Invisible until
  a template in this repository actually used one, which the code block's token spans are the first
  to do.

  Under it, a second: every child of the block is an element with a key **including the untokenized
  one**, because with no grammar it drew a bare text child and with one a list of spans — the child
  list changed *shape*, the reconciler had nothing to pair the text with, and a block given a
  language showed its program twice.

- **A reader can look at the site instead of building it.** A page has no height of its own, so what
  a visitor sees is decided by the window they open it in — and a board drawing the whole page at
  full height on a plane could never show a sticky header, a scroll reveal or a `:hover` the tool's
  own layer was not standing on top of. In preview each board becomes a **window** of a typical
  height for its width and the page scrolls inside it, the overlay is gone so the pointer reaches the
  page, `contenteditable` is off so a link is followed rather than swallowed into a caret, and the
  link goes to *this site's* page rather than navigating the browser away from the builder.

  The hover written two rounds ago could be *drawn* on request and never actually hovered. Here it
  is, by pointing at it.

- **Code is coloured, in both grounds, by one function.** `paintCode` paints **ranges** through the
  CSS Custom Highlight API: no element is added and no text node is split, so the run under the caret
  is the same flat piece of text it was — which is the only reason a block *being typed in* can be
  coloured. The published page runs the same function from a copy of its own source inlined by the
  export, so the editor and the visitor cannot disagree about a colour; that is why the module has no
  imports and references nothing outside its body.

  The tokenizer is a scanner rather than a parser and will be wrong about a regular expression
  containing a quote. That is the trade a code *sample* can make.

- **`tsc` was not run anywhere across the repository.** `pnpm test` runs vitest, and vitest does not
  type-check — so a renderer given a `spellcheck` attribute the DSL's element types did not declare
  shipped with 4,700 tests green, and sat there for a commit. `scripts/typecheck-all.mjs` checks all
  35 projects, as a ratchet: three demo apps that predate the products are listed as known-broken
  with the reason, and an entry that starts passing is reported as stale.

- **`marks` is read, and it was the last of the family.** A node definition may say which marks a run
  inside it takes — absent is anything, `[]` is none — and nothing had ever consulted it. `applyMark`
  and `toggleMark` do now, which is why bold inside a code block is refused rather than published as
  a `<strong>` inside a `<pre>`: nothing a highlighter expects, and lost the moment the code is
  copied out as text.

  Two lines drawn while doing it. The **operation** reads it rather than the toolbar, because a mark
  arrives through a paste, a command, a loaded document and a test and only one of those passes a
  button. And **`setMarks` is not guarded**: it writes a list wholesale and is how an inverse
  restores what an operation took, so a guard there would make undo refuse to put a document back
  into a state it was actually in. A mark already on a run is still removable.

  `code` was read the round before, and `whitespace` is deliberately never declared — the whitespace
  is literal because the element is a `pre`, and a second answer nothing consults is the fault itself.

- **`insertText` had never worked, so Shift+Enter has never inserted a line break.** The command
  guards itself by asking whether `replaceText` can run — and asked it with **no payload**, while
  `replaceText` declares `canExecute: payload => payload?.range != null && payload?.text != null`. So
  the guard asked *can you replace no text in no range*, the answer was correctly no, and `insertText`
  returned `false` every time it was called, in all three products, for as long as it has existed.
  `EditorViewDOM.insertLineBreak` **is** `insertText('\n')`.

  Nothing caught it because a command that declines is indistinguishable from a key nobody pressed.
  Found while giving a code block its own Enter, which goes through the same door. `backspace` was
  guarded the same way and is fixed with it; `editor-can-run.test.ts` holds both.

- **Three blocks could be placed and not selected.** `blockQuote`, `horizontalRule` and `codeBlock`
  went onto the rail and not into `SELECTABLE`, so they drew perfectly and could not be moved,
  deleted, given a colour or typed into. The round that added them checked that each *appears* and
  never checked that a reader can get hold of one — which is the same shape as the check that a
  command exists without asking whether anything can reach it.

- **`editor as any` came down four, from 343 to 339.** Every one of them was over a door that is
  already open: `getRootId()` and `dataStore` are public members, cast away by a `never` in code
  written this month. The ratchet in `editor-is-typed.test.ts` is what said so — and it says so about
  the whole repository, which is why running only the packages a change touches is not enough.

- **A node that changed type disappeared off the page.** `transformNode` changes a node's type where
  it stands, which is the right shape for a detach — the block keeps its sid, its place and
  everything written on it. Measured in the browser it also vanished: the document held the result
  perfectly and there was nothing on screen until a reload.

  Two faults, one behind the other, and the first one hid the second.

  The reconciler asked whether the DOM could be reused by comparing **tags**, and two different node
  types can draw the same element — a placement and a frame are both a `div`. So it took the update
  path and kept the element; then `ComponentManager.updateComponent`, which compares `stype` and is
  right to, unmounted the old component and **took that very element out of the document**, leaving
  the new one nothing to attach to. Two answers to *is this the same thing*, one of them made after
  the other had already acted on its answer.

  With the element back, everything **inside** it was gone. A replaced node was handing its history
  down: its children found alternates in the old subtree, called themselves updates, and reused DOM
  elements that had just been removed with their old parent. React deletes the old fiber and mounts
  a fresh subtree; this kept it — in two places, and clearing the first alone left the second, which
  finds a previous child by sid straight out of the old vnode.

  The fix is three lines in `renderer-dom` and it is held by `test/replaced-root.test.ts`, which now
  covers a node changing type *while keeping its sid* — the shape a detach has, and the one no test
  had. The site's detach uses `transformNode` again; the deck's, which shares the line, is covered
  by the same fix.

- **A list was not a list.** It drew `<div class="w-list">` holding `<div class="w-list-item"
  data-marker="">`: no bullet, no number, no `<ul>`. The marker is Word's — it comes from a
  *numbering definition* through the env, which is right for a document with eight list styles and
  resolves to the empty string for a product that has none. So 목록 in the toolbar put an
  indistinguishable pile of sentences on the page, and `PAGE_CSS` carried rules for `ul`, `ol` and
  `li` that could never match anything. A site draws `<ul>`/`<ol>` and lets the browser mark them,
  which is also the two elements that *mean* a list to a screen reader and to a search engine.

  Under it: the insert wrote `kind: 'bullet'` and the schema declares `type`. An attribute nothing
  reads, on the one node whose whole question is *which kind* — and invisible for as long as a list
  was not a list. The exemption saying `type` was "office-text's to draw" went stale the same minute
  and the harness said so, which is exactly what an exemption is for.

- **The rail restated the model.** 담는 것 and 넣는 것 were two arrays of command names written out
  in `rail.tsx`, so five newly registered inserts were reachable by no button and nothing could see
  it — a hard-coded array is not a claim about anything. A control now says whether it makes a thing
  that holds other things or a thing that goes in one.

- **A component's nodes were in no stylesheet at all.** The export keyed a rule by a node's id and
  found the nodes by walking the page — and a component definition lives *beside* the pages rather
  than in one. So the header, the footer and both buttons, the four things on the sample that appear
  on every page, could say `overrides: { mobile: … }` and the published page carried no media query
  for any of them. Since media queries were written; found a month later, and only because a hover
  set on the button did not reach the export either.

  A drawn part carries `placement~part`, so one definition placed five times is five ids for the
  thing a reader edited once. `[data-b$="~part"]` is the one selector that says *every placement of
  this*, which is exactly what placing a component means. `styledNodes` is the walk that includes
  them, and the export test that caught the change now walks the definitions too.

- **Three checks nobody ran.** `overrideFaults`, `linkFaults` and `stateFaults` each had a unit test
  beside it and nothing had ever asked any of them about a real document. That is worse than not
  having them: a check nobody runs reads, to the next person, exactly like a check that passes — the
  same failure this repository has now written down three times about itself. `documentFaults` is the
  one walk that asks all three, it reports rather than validates, and the sample answers clean.

- **Four words that looked like navigation.** Each item was a bare paragraph: a 14-pixel-tall target
  on a phone where every guideline asks for something near 44, and nowhere for a hover to live, since
  a state is paint and a paragraph is not painted in this schema. One fix for both — each item is a
  box with the word in it. When the hit area and the hover turn out to be the same fix, the structure
  rather than the styling was what was wrong.

Newest first. The surprise each one produced is the part worth keeping.

- **Where the shared sheet stops paying, measured — and the hole it left, closed.**

  Five of the deck's twelve groups moved and then the arithmetic turned. Each of the remaining seven
  wants a **new concept in the shared model** to save fifteen to thirty-five lines: 재생 needs a
  group-level note, 화면 전환 needs a slide-level command target rather than a box's, 문서 변수 연결
  *is* its sub-component (the row list comes from `BINDABLE_ROWS` filtered by the schema and the
  options from the document's variables), and the geometry group's 다른 덱 row carries a library
  list, a cross-field payload (`deck` and `to` together) and local state.

  That is the shared model absorbing product specifics one at a time, which is the opposite of what a
  shared system is for. Written down as a **boundary** rather than a to-do: the sheet pays for rows
  that are *a value with a label*, and that is five groups of twelve. The other seven are not panels
  of fields; they are small applications.

  **So the remaining value was in the guard, not the conversion.** The 배치 mistake — geometry rows
  and a frame's arrangement declared under one heading, drawn as two for as long as the panel has
  existed — went through a real gap: the unit test reads the rows, the browser check asked whether a
  control is *drawn*, and **where** it is drawn was nobody's question. That gap covered all twelve
  groups, converted or not.

  The check asks it now, and not by comparing text: a panel's first group is headed by what is
  selected — 제목 상자, 프레임, 연결선 — so the declaration cannot name it and does not try. What it
  can promise is that a declared group is **one** group on screen, every row of it under the same
  heading whatever that heading says. Re-introducing the bug fails it by name; that is the promise
  배치 broke, and it now holds for the seven groups that will never be converted as well as the five
  that were.

- **The deck's groups are moving to the shared sheet, one at a time: 328 lines gone so far.**
  Five groups now: 연결선 (214 lines), 채우기와 선 (103), 배치 (77), 텍스트 (35), 그림 (31) — each
  replaced by `{sheet('...')}` against a declaration. `properties.tsx` is 2,863 → 2,535, and the
  browser suite is 392/392 at every step.

  **And 배치 was in the wrong group in the declaration.** The panel's *first* group is headed by what
  is selected — 위치, 크기, 회전, 상태 — and 배치 is the arrangement a **frame** imposes on what is in
  it. The declaration had both under one heading, and neither the unit test nor the browser check
  could see it: one reads the rows and the other asks whether a control is drawn, and *where* it is
  drawn is a question nothing asked. A heading nobody checks is a heading that can be wrong.

  What each group taught, beyond the four findings below:

  - **A stack is a section, not a row.** `PaintList` and `EffectList` draw their own `PropertyGroup`
    because a paint stack adds, reorders, switches off and deletes — so `fills` and `effects` are
    declared in groups of their own rather than as rows of 채우기와 선, and the sheet does not try to
    draw them. The declaration still carries them, which is how the harness sees them at all.
  - **A corner with no number of its own follows the radius**, so each field shows what the box is
    actually drawing rather than a zero. That is a *dynamic* fallback — another attribute's value —
    and it lives in the deck's `read()` rather than in the shared row: if a second panel ever wants
    "this value follows that one", it becomes a field on `PanelRow` instead of a second copy of the
    line.


  `연결선` — nine rows, two buttons and a count — is now `{sheet('연결선')}` against a declaration in
  `panel-model.ts`. `properties.tsx` went 2,863 → 2,747, and eleven more groups are the same shape.
  Converted one group at a time on purpose: the file has a 392-test browser suite and
  `panel-model.spec.ts` checks each group against what the panel actually draws as it moves.

  Four things the conversion found, and the first is the one worth keeping:

  - **The shared sheet was using the ribbon's dropdown in a panel.** `canvas-model.md` §6 has said
    since before the sheet existed: *"Native dropdown in a panel, Radix in a ribbon … a panel's
    dropdown is a list of words, where the platform's control is smaller, faster and already knows
    how to be typed into."* The sheet used `ChoiceSelect`, and the deck's suite said so in one line —
    `selectOption` on a Radix trigger is *"Element is not a `<select>` element"*. **The site
    builder's panel had been using the ribbon's control all along** and nothing had noticed, because
    nothing had a reason to open it.
  - **A `title` wins the accessible name over a button's own words.** 뒤집기 announced as
    *"시작과 끝을 바꿉니다"* — its tooltip — so a reader hears a sentence where a word belongs, and a
    check asking for the button by what it says found nothing.
  - **An emptied text field means two different things.** A page reads it as `undefined` — taking a
    value back at a narrow width is how a reader says "the page's answer again" — and a connector's
    label reads it as `''`, because emptied means *no label* and `undefined` reaches the command as
    "you did not mention this".
  - **`[]` is not `null`.** Clearing a line's bends says a reader took them out; `null` says the line
    never had any, and the route reads them differently.

  One control kind disappeared on the way: `length` — a number in the reader's chosen unit — became
  the shared `number` once `PropertySheet` learned to **ask** for a suffix. A length's unit is a fact
  about the session rather than about the row, so a deck that declared `unit: 'px'` would print the
  wrong word beside all eleven of them. Two of the deck's own kinds are left (`list`, `binds`) plus
  `action`, a button that runs a command — which took `reverseConnector`'s exemption off the books
  the moment it was declared.

- **A check that has nothing to look at is a check that passes.**

  The deck's panel declaration had eleven connector rows and **four of them were wrong** — `경로`
  declared as `연결선 모양`, `흐름` as `화살표`, `구부리기` as `휘어짐` — and the browser check that
  exists to catch exactly that had been green the whole time. The sample deck holds no connector, so
  the check selected what was there, found no connector, and asserted nothing about eleven rows.

  That is the failure this harness is named after, committed by the harness. The repair is the one
  `connector.spec.ts` already uses: **make** the thing rather than look for it — two shapes, a join,
  and the panel has a connector in it.

  Two smaller things fell out of putting a connector in front of it:

  - **`when` needed a second reading.** A grid has columns *when `layoutMode` is grid*; a label's
    size, colour and weight appear *when there is a label at all*. Both were needed within a day of
    each other, so `is` is optional now and its absence means "has any value" — and a row that is
    always drawn and inert half the time is a row a reader learns to ignore.
  - **A conditional row skipped by every check is a row nobody has ever looked at.** The three label
    decorations were declared without anyone knowing whether the panel drew them. The check now
    *types a label* and then asks, which is the difference between skipped and checked.

- **Where a row belongs is the schema's answer, and a hand-written list got 27 entries wrong.**

  Found on the way into converting the deck's panel: `properties.tsx` gates each group with
  `declares('layoutMode')` — it asks the **schema** whether the selected node type has the attribute
  — and the declaration written to replace it carried five hand-written lists of node types instead.
  Measured against the schema, **27 of their entries were wrong**, and every one was a fault in one
  of two directions:

  - a control that writes nothing: `너비` on a connector, which has no width; `채우기 추가` on a
    picture and on a placement, which have no `fills`; `세로 맞춤` on a sticky note.
  - a control a reader cannot reach: `선 색` and `선 두께` hidden from a line and from a connector,
    both of which have a stroke; every corner row hidden from a video.

  The site builder had the same class of fault and a worse instance of it: **a heading and a
  paragraph were each offered 폭, 최소, 최대, 배경, 테두리 색 and 테두리 두께** — seven controls,
  on every text block on every page, none of which those types declare. The schema was narrowed for
  exactly this reason months ago (*"a reader who wants a hugging heading puts it in a stack that
  hugs"*) and the panel had not been told.

  So `on` is a **narrowing** now, not the answer. A row with no list appears wherever the schema
  declares its attribute, and both products are at zero divergence. Three kinds of row still cannot
  be asked about and fall back: one that writes a node, one that writes nothing, and any row at all
  where a product has no schema to hand. The first version missed the middle one and the 종류 row
  vanished from every panel in the site builder — caught by a browser test, not by the unit test,
  which is the argument for having both.

  **And one of my own exemptions was wrong in the expensive direction.** `startCap` and `endCap`
  were exempt from `every-property-can-be-edited` as *"not offered — owed"*, and the panel has drawn
  them all along as 시작 모양 and 끝 모양. A prose claim about a React tree, in the file whose whole
  purpose is to stop prose claims about React trees. Somebody would have built a control that already
  existed.

- **A panel is one thing now, not three — and the third product was the reason to build it.**

  Asked, while converting the deck's panel, to keep the UI a shared system rather than a per-product
  one. The measurement said the same: the two panel declarations written a week apart shared **eight
  of their fields and five of their control kinds**, and Word's ruler is a fourth surface of the same
  shape. Two copies is a coincidence; this was the third.

  Split three ways — the declaration is the product's (`office-controls`' `PanelRow`), the drawing is
  the suite's (`office-ui`'s `PropertySheet`), and the **kinds stay open at the edges** so a page can
  have a dataset picker and a deck a paint stack without either knowing about the other. The site
  builder's inspector now draws through it; the deck's is next and has a browser check to convert
  against.

  Three things fell out that were not planned:

  - **The shared type wanted a field the deck's declaration did not have.** `PanelRow` requires both
    `label` and `ariaLabel`, and the deck had only the second — so 23 rows gained the short name a
    reader actually reads, and the ones where they differ (`맞춤` / `교차 축 맞춤`, `열` / `열 수`,
    `가득` / `프레임 가득 채우기`) stopped being invisible.
  - **The sheet must convert nothing.** The first version left the unit conversion out and a gap read
    `480` where a reader expects `32`. Twips to pixels is a fact about a document model, so it
    belongs in the product's `value` callback — a sheet that converted would be a second place that
    knows what a length means.
  - **`render` needs three answers, not two.** A node, `undefined` (the sheet draws it) — and `null`,
    *hide the row*. Without the third the panel drew a labelled row with an empty right-hand side for
    the note that only means something at a narrow width, which reads as a control that failed to
    load.

- **Word can answer the check now, and its answer is a list of four dialogs it has never had.**

  The last `notYet`. Word has **no property panel** — its chrome is a ribbon, a ruler, an overlay for
  shapes and three read-only panes — so the site's and the deck's answer (a panel as data) does not
  apply, and the missing declaration turned out to be one level up: `office-controls`' `Control`
  declares `command` and `payload` and never **which attribute pressing it writes**. Those are
  different questions with different answers — `setBlockFormat` is one command and twenty-four fields
  in the site builder — and until `writes` existed the only surface that could answer "can a reader
  set this value" was a panel.

  `Control.writes` plus `ruler-model.ts` — the ruler being the only place in Word a paragraph's
  indents or its tab stops can be changed at all — cover **17 of the 77 attribute names Word draws**.
  Findings went 252 → 178, and the 60 names left are not scattered:

  | owed | names |
  |---|---:|
  | a borders dialog (`borderTop*` … `borderLeft*`) | 16 |
  | a field's own settings (`tag`, `literal`, `sequence`, `limitLocation`, …) | 12 |
  | page setup (page size, margins, columns) | 8 |
  | table properties (`cellSpacing`, `hide*`, `noWrap`, `heightRule`) | 7 |
  | paragraph spacing (`spacingBefore`, `spacingLine`, `spacingLineRule`, …) | 5 |

  plus a handful a **drag** writes on a drawing. That is a ratchet rather than sixty exemptions,
  because none of them is a decision: every one is a control somebody will build, and writing "owed"
  sixty times is a hand-kept list wearing a harness's clothes.

  **The measurement that mattered was reading the right number.** 252 findings looked like a
  migration and 77 *names* is a session — an exemption is keyed by the attribute, not by the node
  type, so `x` on twelve node types is one decision. The same correction applied to the deck: 334
  findings, 80 names.

  All three products answer every check now, and `notYet` has no callers — which is exactly what a
  deferral should end up as.

- **Three mocks found dead the same way, and 20 switched-off checks came back.**

  The other half of watching the tests: a skipped test is a check somebody turned off, and nobody had
  asked why. 18 skipped blocks, and enabling each one to find out gave the same answer three times —
  **not the reason written beside it**.

  | switched off | the note said | the measurement said |
  | --- | --- | --- |
  | 15 IME/composition tests | *(nothing)* | `handleCompositionStart is not a function` — the behaviour moved to `EditorViewDOM._isComposing` |
  | 5 MutationObserver tests | *(nothing)* | `editor.executeCommand is not a function` — a hand-rolled mock with eight methods |
  | 16 selection tests | *"requires full DOM/selection sync"* | `dataStore.setActiveSchema is not a function` — a hand-rolled store with nine |

  **A fake that has to keep up with a real type drifts, and the drift shows up as a skipped test
  rather than as a failure anybody sees.** That is the same fault as `(editor as any)` — a shape
  asserted rather than checked — and it hides better, because a skip is quiet where a cast at least
  compiles against something.

  What each turned into:

  - **The IME file was deleted.** Rewriting it would have been the mistake twice: a synthetic
    `compositionstart` in jsdom is a string with a name on it, and every composition fault this
    product has had is about *interleaving* with `beforeinput` — a jongseong committed twice, a space
    after a composition eaten, a syllable boundary split. Held by **47 browser tests**, and
    `input-hangul-jongseong.spec.ts` now says so at the top so the next person finds a decision.
  - **The MutationObserver file lost five tests and kept three.** The five asserted on
    `handleTextContentChange`, and `mutation-observer-manager.ts` says in its own comment that the
    route is retired — *"onTextChange is disabled … handleDomMutations path is authoritative"*. The
    mock is gone; the file builds a real editor over a real store.
  - **The selection suite went from 16 off to 4 running and 12 named.** The note was *half* right:
    twelve of them end at `window.getSelection()` and belong in a browser, and four were never
    waiting for anything. Twelve named skips beat one blanket skip — each says what it is waiting for.

  Skipped blocks: **18 → 8**, and of the 8 left, 4 carry a written "current implementation limitation"
  that is its own work list.

- **19 of 6,851 tests asserted nothing, and three of them were wrong about the code they described.**

  Asked to watch the tests, on the grounds that there may be odd ones. There were — and the bold
  finding had already shown how: a unit test asserting *"bold and italic mean one thing; there is
  nothing to read off them"*, which was a belief rather than a behaviour.

  Swept for tests that assert **nothing at all**: 19 of 6,851 blocks. What they were:

  - **A documentation script.** `vnode-structure-snapshot.test.ts` — seven tests, fourteen
    `console.log`s, feeding `docs/vnode-structure-examples.md`, which does not exist. It ran on every
    CI run, printed JSON nobody read, and could not fail. Now seven real snapshots, which guard a
    VNode shape every other test here is blind to: they all assert on the DOM, and two different
    trees produce the same DOM until the day they do not.
  - **"Should not throw", said by not throwing.** A bare call passes both when the function behaved
    and when it did nothing, and a reader of the report cannot tell which.
  - **Three tests that argued themselves out of their own names** in comments — *"may be called …
    it's normal if it is not"*, *"may not occur in practice … may differ from actual usage"*,
    *"need to verify actual behavior"* — and printed instead of asking.
  - **Two `describe.skip`s holding one empty `it`**, kept as notes about where the real tests live. A
    note that runs, costing a line in every report.

  **Three of the four hedged comments were wrong about the code.** `updateComponent` *is* called;
  the mutation observer *never reaches* its handler for a node with no sid; a store with no schema
  *does* hand back a proxy. A printed number nobody reads cannot correct a belief — only an
  assertion has to, which is the whole argument for asking rather than logging.

  **And the sweep itself was wrong three times before it was right**, which is the reusable part.
  850 → 69 → 39 → 25 → 19, and every wrong answer was the tool: the body taken as `{ page }` (a
  Playwright test's destructured argument), `expect.poll` missed for having a dot in it, brace
  counting running through a `${…}` inside a string, and a body that is one call to a local helper
  that asserts. A check that reports falsely is worse than one that misses, because the false one is
  believed — and this repository has now produced that finding about a probe, an exemption, a browser
  check and a sweep.

  `packages/conformance/test/every-test-asserts.test.ts` keeps it at zero, and fails by name — checked
  by adding a silent test on purpose.

- **Bold was not bold. Eleven marks drew nothing, in all three products, and no check could see a mark.**

  Asked whether the site builder is finished. Measuring it found something much larger than the
  answer: **the sample site has five pages with addresses, a navigation row reading 제품 · 가격 ·
  소개 · 블로그, and zero `<a>` elements.** The blue words in its hero are a `fontColor` mark that
  looks like a link and is not one.

  Following that down: the `link` mark has been in the standard schema since it was written — `href`
  required — and `toggleLink` has been a registered command for as long. It drew nothing. And it was
  not alone: `bold`, `italic`, `underline`, `strikethrough`, `code`, `subscript`, `superscript`,
  `kbd`, `mention`, `spoiler` and `footnoteRef` appear in **none** of `office-text`'s three format
  tables. A mark with no entry becomes `<span class="mark-bold">`, and nothing styles that class in
  any of the three products.

  Measured in Word rather than reasoned: press 굵게, and `.mark-bold` exists as a `<span>` with
  computed **`font-weight: 400`**.

  **Why 351 browser tests and 470 unit tests passed over it.** Three reasons, and each is a lesson:

  - **A mark is neither a node nor an attribute**, so all eight conformance checks step over it.
    `every-node-is-drawn` walks node types, `every-attribute-is-read` probes a node's attributes, and
    a mark falls between them — the same shape of blind spot as an attribute the probe could not
    invent a value for, one vocabulary along.
  - **The two weight assertions the suite has are about a *style's* formatting**, which resolves
    through the cascade rather than through a mark. Nothing had ever asked whether the bold *button*
    does anything.
  - **A unit test asserted the false belief out loud.** `mark-format.test.ts` said *"bold and italic
    mean one thing; there is nothing to read off them"* and checked they were absent from
    `VALUED_MARKS`. The assumption was that the default `mark-bold` class was styled somewhere. It
    was not, anywhere.

  Fixed in the shared layer, so all three get it: the plain marks are CSS entries now and `link` is a
  real `<a>` — because half of what a link *is* lives in the element (a keyboard reaches it, a
  screen reader announces it, a middle click opens it elsewhere) and a styled span can never be given
  that. `every-mark-is-drawn` is the ninth check; it examines 24 marks in the site builder and found
  four more in Word, three of which are honest exemptions (`commentRef` drawn by the overlay,
  `bookmark` deliberately invisible, `noProof` which must not draw) and one — `endnoteRef` — a real
  gap now drawn like a footnote's.

  Two smaller things worth keeping: `text-decoration` is a **shorthand**, so two marks each writing
  it would leave whichever was applied second — a struck-through underline silently losing its
  underline, which reads as "underline stopped working" rather than as a cascade. And `draggable`
  was missing from the DSL's global attributes, which matters most in an editor: the default for an
  `<a>` is that dragging it drags the link, making a paragraph with a link in it the one paragraph a
  reader cannot select across.

- **Word has a spec now, and its numbers are held by a test.**

  Asked whether the products need a written definition. The answer that came out of measuring: a
  whitepaper is the wrong shape — `list-feature-checklist.md` is what one becomes, 62 lines of
  unchecked boxes pointing at a `.cursor/skills` path that no longer exists. The split that works is
  **intent in prose, state in the harness**: intent does not rot (a word processor still needs page
  setup next year) and state rots the moment it is written down.

  `site-builder.md` was already the right shape, and Word had nothing at all. `docs/specs/word.md`
  is that, with one difference worth naming: the site builder's was written *before* the product
  existed, because a boundary recorded after the fact is a rationalisation. Word's is the other case
  and says so — everything in it is measured out of what exists.

  **And a spec full of numbers is a hand-kept list.** *"Re-measured 2026-08-18, and five came off"*
  is what a document does when nothing checks it, and this one states 107 node types, 1,053 attribute
  slots, 166 commands, 60 toolbar controls, 21 settable attributes and two ratchets.
  `spec-numbers.test.ts` reads them out of the product and fails by name when one drifts — verified
  by drifting one on purpose.

  What the document turned out to be *for*, which was not obvious before writing it: the harness
  produced the work list (four dialogs Word has never had, 60 attribute names) but cannot say **what
  is missing from the vocabulary** — `cornerRadius` did not exist on a frame, so nothing was absent,
  and a schema that declares less passes more easily. That gap is the one part a person has to keep
  honest, and now there is somewhere to keep it.

- **`(editor as any)` appeared 942 times, the type was already right, and switching the compiler back on found four real faults.**

  Asked why it is written everywhere. Measured: **942 casts across 152 files**, reaching for
  `dataStore` (147), `executeCommand` (140), `registerCommand` (124), `getRootId` (119) and
  `selection` (94) — and `Editor` declares every one of them as a public member. A file that calls
  all seven **without** a cast typechecks unchanged; so does one that walks a document through
  `dataStore.getNode`. There was never a reason. The idiom copied itself.

  It is not a style problem. `(editor as any).exectueCommand?.()` is valid TypeScript, evaluates to
  `undefined` and does nothing at run time — and the `?.` makes it worse, because a call on a method
  that always exists cannot be absent, so the optional chain only hides the day it becomes absent.
  That is this repository's own signature failure, one layer down: a thing that looks done, breaks
  nothing, and does nothing.

  **599 of the 942 are gone** — `apps/slide` from 226 to zero, `packages/extensions`,
  `editor-view-dom`, `office-word`, `office-slides`, `office-site`, `office-canvas` and `office-text`
  all cleared of the mechanical ones — and the compiler reported four latent faults the moment it
  could see again:

  - **`currentNode.text.length` on a node with no text** (`move-selection.ts`), guarded by a boolean
    TypeScript cannot narrow through. The guard was the only thing between this and a crash, and
    nothing said so.
  - **`?.` on the wrong thing, nineteen times** (`apps/slide`). `editor.executeCommand?.()` guards a
    method that always exists; `editor` is the part that can be null, and it was bare.
  - **A `ModelSelection` with no `type`** handed to `toggleMark` (`input-handler.ts`) — a range in
    every sense except the one nobody had to write down.
  - **A command returning a string** (`revision-commands.ts`). `_move` answers *which* revision it
    landed on and a command answers *whether it ran*; a string is truthy, so it worked and told every
    caller checking `=== true` that it had not.

  plus `getRootId()` being `string | undefined` — a document that is not loaded has no root — at six
  sites that assumed one.

  **And one lesson about running the suite, not about the code.** Two runs mid-way came back with
  four and five failures against a set that varies run to run, and the cause was mine: the package
  edits were happening **while the browser suite ran**, so Vite rebuilt underneath it. Re-run with no
  concurrent edits: 392/392. A green suite is only evidence if nothing was writing to the tree while
  it ran.

  `packages/editor-core/test/editor-is-typed.test.ts` holds it: it asserts the seven are public, and
  ratchets the count in **both** directions — up means a new cast was written, down means the number
  has become a lie about how much is left. Lowered once, 942 → 343, which is the only way a ratchet
  is supposed to move. What is left is mostly tests and `packages/model`, where the cast is often on
  a *fixture* rather than on an editor.

- **The deck's panel is a declaration too, and it was wrong in six places.**

  The second product through the same door. Its panel is 2,863 lines against the site's 615, so the
  measurement came first: the check would examine **337** attributes, and with nothing declared, 334
  had no surface — but only **80 distinct names**, because an exemption is keyed by the attribute and
  not by the node type. Eighty is a session; 334 is not.

  `panel-model.ts` declares its 44 rows, `slidesPanelCommands()` and `slidesPanelAttrs()` answer the
  harness, and **13 exemptions went stale** — every one a sentence describing a row. Findings went
  334 → 60 → 0, the last step being exemptions with reasons in four kinds: dragged rather than typed
  (a connector's ends, a path's outline), a durable reference a reader must never retype, a
  resource's own fields edited where the resource is, and four that are simply **owed** — a
  connector's cap shapes, a film's `autoplay`/`controls`/`loop`/`muted`, a frame's `clipsContent`,
  and the table and code panels neither product has.

  **The declaration was wrong six times, and every one was caught rather than shipped.** `playback`
  is not an attribute of anything (the row writes `startsWith`); `motion` is not a node type
  (`motionTrack` is); `맞춤` is `교차 축 맞춤` and `열` is `열 수`; `가득` is `프레임 가득 채우기`;
  and `채우기`/`색`/`효과` are not rows at all — a paint stack's control is its **add** button and a
  shape's one colour is the stack's first entry, so three declared rows described controls that do
  not exist. A declaration read out of JSX is a hand-kept list until something checks it.

  **And the check that caught them was itself wrong first.** Playwright's `getByLabel(string)`
  matches a *substring*, so asking for `간격` found `간격 문서 변수` — a different row — and two
  assertions passed over controls that were not drawn. `{ exact: true }` is the fix and the lesson is
  the sharper one: a check that can pass by finding the wrong thing is worse than no check, because
  it is believed.

  **What is honestly weaker here than in the site**, and written down rather than glossed: the site's
  panel is *drawn from* its model — `inspector.tsx` maps over it, so there is nothing to drift from —
  and the deck's still draws its own rows. So the guard is `apps/slide/tests/panel-model.spec.ts`,
  which opens the deck and asserts every declared row is a control the panel draws. A check catches
  drift; only mapping over the model makes drift impossible. Converting `properties.tsx` is the next
  step, and it now has a test to convert against.

  **Word is a different job and was measured, not started.** It has no property panel at all — its
  chrome is a ribbon and dialogs — and its ribbon's `Control` declares `command` and `payload` but
  never *which attribute it writes*. With nothing declared the check finds **252**, so word needs
  `writes` on `office-controls`' control types and then a ratchet, which is a haul rather than a
  sitting. `notYet` still names it, which is the point of `notYet`.

- **The panel was the escape route, and it was the same rule this repo had already applied twice.**

  Asked directly why the harness kept missing things and why the code kept ending up outside it. The
  measurement is unambiguous: **44 exemptions across the three products are prose claims about a
  property panel**, eight of them added in one week. The site's own conformance test says why in as
  many words — *"The property panel is a third surface and the harness has no notion of one — it can
  read a toolbar model and a key map, and a panel is a React tree."*

  Which is not a limit of the harness. It is the rule that produced `toolbar-model.ts` and
  `keymap.ts` — *"a ribbon that declares its own commands in JSX is a declaration nothing can read"* —
  not applied a third time. Both of those moved into the package after the harness asked a question
  the app could not answer; the panel never did, so it became the place a claim could go to stop
  being checked.

  `panel-model.ts` is the third application, and `inspector.tsx` maps over it the way `ribbon.tsx`
  maps over `siteControlsIn()`. **Mapped, not agreed with** — a model the panel merely matched would
  have been the forty-fifth prose claim. Three exemptions went stale the moment it landed, which is
  the harness reporting its own escape hatch closing.

  **And it made a question askable.** `every-attribute-is-read` asks whether an attribute reaches the
  drawing; `every-command-can-be-reached` asks whether a command has a control. An attribute nobody
  can change passes **both**: it is read, and `setBlockFormat` — which writes 24 fields — is
  reachable. `every-property-can-be-edited` is the missing question, and its first run said: **64
  attributes drawn, 41 offered.** The 14 it named sorted into three honest kinds — written by every
  row (`overrides`), a durable reference a reader must never type (`id`, `kind`), and Word's
  vocabulary the shared text kit draws on a page with no UI here yet (`caption`, `colspan`,
  `rowspan`, `language`) — plus `componentId`, which is instance-swap, deferred with variants.

  Two things fell out that were not planned:

  - **A declaration is only worth what is checked about it.** `panel-model.test.ts` immediately found
    that one field meant two things: the 값 row's `attr` was `componentValue`, which is a *node type*
    and not an attribute of `instance`. The model now says `writes: 'attr' | 'child'`, which is a
    distinction the schema already makes and the panel was blurring.
  - **Adding a check breaks every product that cannot answer it**, because a check with no subjects
    is a failure here on purpose. `only` is the wrong shape for that — a product listing what it
    *does* run would silently skip the next check added, forever. `notYet` names what is deferred, so
    a new check makes every product either answer it or say out loud that it does not, and a
    deferral that stops being true is reported like a stale exemption.

  **Still open, and named because it is the harness's own shape:** it holds one relationship, schema
  ↔ product, so it cannot see whether what is read is read *correctly* (`clipsContent` was read and
  wrong), nor a vocabulary that is *missing* (`cornerRadius` did not exist, so nothing was absent) —
  and that second one is a perverse incentive worth saying out loud: **a schema that declares less
  passes more easily.** The only counterweight available is that three products share one schema, so
  an asymmetry between them is measurable even when an absence is not. Word's and the deck's panels
  are the next two to become declarations.

- **The harness was not answering a third of its own questions, and said so nowhere.**

  `every-attribute-is-read` renders a node with an attribute absent and again with it set, and calls
  it read if the drawing changed. For an `array` or an `object` there is no value to invent, so it
  answers `null` — "cannot be asked" — and skips. That part is right: guessing produces false
  findings, and a false finding costs a person an afternoon proving the tool wrong.

  The skips were **not counted**. So the number every product reported was the number of questions it
  had answered, printed as though it were the number asked:

  | | examined | unanswered, before | after |
  |---|---:|---:|---:|
  | word | 600 | **125** | 0 |
  | slides | 422 | **29** | 0 |
  | site | 127 | **201** | 0 |

  That is this file's own doctrine failing against itself. The check's header describes the operation
  roster's fourteen stale notes — *"the checks they silenced stayed off for months looking exactly
  like coverage"* — and then does the same thing quietly.

  Two fixes, and the first one shrank the problem more than the second:

  1. **An attribute of a node type the product does not draw is not a blind spot.** `every-node-is-drawn`
     owns that question and the product has already answered it there with a reason — a page has no
     coordinates, so it draws no `rectangle`, and asking whether its `cornerRadius` is read is asking
     about a drawing that does not exist. The site inherits a whole canvas vocabulary it draws none
     of: **201 became 8.**
  2. **A product teaches the probe what its values look like.** The same rule as `env` and as
     everything else here — a `varBinds` is `[{ attr, var }]`, an `overrides` is `{ mobile: { … } }`,
     and only the product knows.

  **What the count was hiding, once it could be asked:**

  - **The site's `overrides` — its entire responsive mechanism — had never been checked**, on any of
    the four node types that carry it. Two things had to be handed over before it could be: the
    breakpoint env (a product hands over what it renders with) *and* an override worth making. The
    first probe overrode a `gap`, which is a stack's word, and reported two findings about a picture
    and a placement that draw no gap — a question about the value rather than about the attribute,
    which is the trap the number probe already documents. `sizing` is the one thing all four draw.
  - **Slides' `fills` and `effects` — the whole paint system — on six shape types each.**
  - Word's `tabs`, read by the tab layout pass into the environment rather than by any renderer.

  **And teaching the harness one thing made it wrong about seven others.** With `fills` in the
  everything-set, `paintsOf` takes the list branch every time and never reaches its flat fallback, so
  `gradientFrom`, `gradientTo`, `gradientAngle`, `gradientKind` and three `shadow*` attributes came
  back unread on six types each — **57 findings, 42 of them false**, about a mechanism that works.
  The rule that fell out: **a taught value answers its own question and stays out of everybody
  else's.** A value the schema could not describe is a whole sub-system in one attribute, and a
  sub-system supersedes the flat attributes it replaces; the `alone` question is what sees a
  superseded attribute, and it only works when the superseding one is absent.

  Everything left is an exemption with a written reason rather than a silence: `varBinds` is read by
  the deck's instance resolver and by nothing in Word or the site; `waypoints` by the connector pass;
  `guides` by the overlay, which is the point of a guide.

- **The data feature was exactly half built, and the finished half was the one you can see.**

  Same sweep, next row: `dataset` offered **one of its six** declared attributes in the panel.
  Following that down found something worse than a panel gap — **no command anywhere in the product
  made a dataset, renamed one, added a column, or wrote a cell.** Every dataset that existed had been
  authored in `sample-site.ts`, in TypeScript.

  So a reader could see the datasets, make a list from one, and filter, sort and limit that list —
  the whole *view*, which is the part that demos — and could not change a price. The half that was
  missing is the half somebody uses every day.

  Six commands at the grain this package already had (`setComponentValue`: one command, one named
  thing, one value), with one deliberate exception. `setDatasetField` does add, rename *and* remove,
  because all three have to keep `records` in step with `fields` and that is **one invariant**: a
  rename that changed the columns and left the rows keyed by the old name is a dataset that looks
  correct in the panel and draws nothing on the page. Three commands would be three places for that
  to go wrong. `removeDataset` refuses while a collection names it, the way `createComponentFrom`
  refuses a block already inside a definition — refusing while it is still a gesture beats letting a
  reader make a document that cannot be drawn.

  **It is a dialog, and that is the interesting UI decision.** Everything else a reader edits here is
  a block, and a block is edited beside the page it is on — rail, drawing, properties. A dataset is
  not on the page: it is a resource the page names, and what it needs is the one thing neither side
  of the shell can give, **width**. A catalogue is five columns by twenty rows and a 280px rail draws
  that as slivers. It also matches what the act *is* — filling a table in is a stint, not an
  adjustment.

  Two smaller things the browser found rather than the tests: the rail listed every dataset **twice**
  once the editor existed — once to edit and once to make a list from — which reads as a bug; one row
  with two controls says it instead, and they are not equally available anyway (making a list needs a
  design chosen first, editing the rows never does). And the dialog title was `${label} 데이터`, which
  is right for `상품 목록` and comes out **새 데이터 데이터** for a dataset just made — and "새 데이터"
  is the name this product gives one, so the doubling was the common case.

  Still not fetched: `kind: 'url'` sets an address and nothing reads it. That is the design `data.ts`
  already writes down — the document keeps the address and the handful of rows a reader designs
  against, and who fetches is a question about the *published* page — and the grid now says so in
  words rather than leaving a reader typing into a box that appears to do nothing.

- **A page's box: rounded, and not a window unless it is asked to be.**

  The sweep, this time pointed at the panel rather than at the renderers: for each node type, which
  of its declared attributes the property panel offers. Filtered to what this product actually
  draws — the canvas vocabulary a page inherits and the harness already exempts is most of the
  noise — **47 of 83**. Two of the gaps were the model's rather than the panel's, which is why they
  are in `box.test.ts` and not only in a browser:

  - **`frameCss` writes `overflow: hidden` unless told otherwise, and a page had no way to tell it.**
    Right on a canvas, where a frame is a stated size and a window onto what it holds. A page's box
    has no stated size, so clipping never shows until something deliberately leaves the box — and
    then it shows by *deleting it*: an image bleeding past its section, a badge on a card's corner, a
    portrait lifted into the band above. Measured on the sample: **nine** stacks clipping on the
    desktop board and no control anywhere. So every overlapping design this builder could have made
    was unreachable, silently, because a clipped element looks exactly like one that was never drawn.
    A page now means *visible* by silence, and `clipsContent: true` still means what it says — which
    makes the control a reader asking for a window rather than a reader escaping a default.
  - **Only a `rectangle` could be rounded.** A card is a frame — it arranges what is in it — and the
    shape that could have a corner radius arranges nothing, so the most ordinary box on a web page
    was undrawable except as a rectangle behind a frame: two nodes for one box, and neither of them
    the one a reader would select. `cornerRadius` is on `frame` in the office schema now and
    `frameCss` reads it, so it is a rounded card in all three products rather than a site feature.

  **The surprise was the third thing, and the export test found it before a human did.** Changing the
  renderer's default broke `says at 390 exactly what the editor draws at 390`: the editor drew
  `overflow: visible` and the published page said `hidden`. `cssFor` was calling `frameCss` and then
  re-implementing the page's defaults itself — it had one of the two, with a comment saying the
  export "has to carry it". So export-as-a-render had grown a second path after all, and the second
  path is not a second implementation of a rule; it is a place for the rule to be *older*. `cssFor`
  calls the renderer's own `stackCss` now, and the check that caught it is the one whose entire job
  is that those two agree.

- **A `var()` is a snapshot, and the third time it bit was the fix for the second.**

  Three instances in one afternoon, all the same fact: **a custom property is substituted where it
  is declared**, so a token written in terms of another freezes that other's value at the element the
  declaration is on, and everything below inherits the frozen copy.

  1. The gallery aliased `--ga-ground: var(--ou-ground)` on `:root`. In a `[data-theme='dark']`
     subtree the shell read `--ou-panel: #171717` and painted itself `#f5f5f5` in the same frame.
  2. So `--ou-accent-soft` was derived instead of stated — a pressed toolbar button should be a wash
     of *whatever accent a product mapped*, and the deck maps seven of the twelve colour tokens with
     that not among them. Derived on `:root` only, it painted `color(srgb 0.86 0.90 0.99)` in the
     dark and at a remapped accent alike: one wash, everywhere, forever.
  3. And `--ou-lift-1/2/3`, added an hour earlier to stop shadows being Tailwind's black, had it
     too — `--ou-shadow` flipped to `rgb(0 0 0 / 0.5)` in the dark and `--ou-lift-2` stayed
     `0 4px 12px rgb(15 23 42 / 0.12)`. Every menu, select and dialog in a dark subtree drew a shadow
     tuned for a white page.

  The rule, and it is mechanical: **a derived token is repeated in every block that redeclares what
  it derives from.** What deriving still buys is that the recipe lives in one place — the repetition
  is a line, not a colour somebody has to pick twice and keep in step. `tokens.test.ts` reads the
  dependency out of the `:root` block and checks each of the other blocks against it; removing one
  `--ou-lift-2` line fails it by name.

  Worth keeping for the next person: **the measurement was the only way to see any of this.** All
  three looked right in the source, all three passed a typecheck, and two of them were written *by
  the person who had just written down the rule they broke*.

- **Two of the three products' browser suites could not be run.**

  `pnpm test:e2e:slide` has been in the root `package.json` for as long as the deck has existed. It
  prints `None of the selected packages has a "test:e2e" script` — and **exits 0** while doing it,
  which is the part that made it survive: a command that fails loudly gets fixed, and one that
  reports success for doing nothing is indistinguishable from a green suite in every log anybody
  reads. Thirty-nine spec files and a `playwright.config.ts` sat behind it. The site app was the
  same, minus even the root script.

  Both are one line each (`"test:e2e": "playwright test"`), and `test:e2e:site` is now beside its
  two siblings. Run after adding: **351 word, 389 slide**, green.

- **A gallery is the only view a component library has of itself.**

  `office-ui` is thirty-six components used across three products, and the only way to look at one
  was to open the product that happened to draw it. So every fault below had been shipped for
  months, in all three products, and none of them was visible one component at a time. One page that
  draws all thirty-six, with a theme switch and a density switch on it, found them in an afternoon:

  | measured | before | after |
  |---|---|---|
  | `transition` in the whole library | **0** | 7 |
  | `focus-visible` | 3 of 36 | 8 |
  | `dark:` variants a product's own theme switch cannot reach | 15 | 0 |
  | components naming Tailwind's palette instead of the token | 4 | 0 |
  | hardcoded z-indexes | 6 | 0 |
  | tooltips legible in the light theme | **0** | all |

  The three that were not merely untidy:

  - **Every tooltip in the suite was white on white.** `bg-[color:var(--ou-panel)]` with
    `text-white`, and `--ou-panel` is `#ffffff`. It read correctly only in the dark, where a `dark:`
    variant swapped the background — so the theme nobody develops in was the only one it worked in.
    Nobody reported it because a tooltip you cannot read looks exactly like a tooltip that did not
    open. The repair is that a tooltip is an *inverted surface*: `--ou-ink` on `--ou-panel` needs no
    variant, because both tokens flip together.
  - **`ColorPalette` threw wherever it was not inside a `Toolbar`** —
    `RovingFocusGroupItem must be used within RovingFocusGroup`, a crashed page, not a mis-drawn
    control. The three products only ever put a palette in a ribbon, so the library had a component
    that could not be used and no way to know. A prop would have made it the caller's job to
    remember; instead `Toolbar` publishes the one fact only it has (`useInToolbar`), and the palette
    takes roving focus where there is a group to rove in and is a plain button where there is not.
  - **The second accent.** Four components painted their pressed state `sky-100` / `sky-950` while
    `--ou-accent` is `blue-600` — so a product that remapped the accent got a toolbar in its colour
    and a *pressed* toolbar in someone else's. The fourth was the best hidden: a checkbox's
    `accent-blue-600`, which is the one CSS property a checkbox actually colours itself with.

  **The surprise is what the instrument found about itself.** The gallery's own density switch was
  dead — it stamped `data-density="compact"` and the token file defines `[data-density='dense']`, so
  half of what the page existed to measure was measuring nothing. And its shell kept a private
  palette (`--ga-ground`, `--ga-ink`, `--ga-line`) with a dark set of its own: with `data-theme` set
  on the document rather than on the shell, the library's tokens flipped and those did not, and the
  page title went white on a white header. The obvious repair — `--ga-ground: var(--ou-ground)` —
  changed nothing, and that is the fact worth keeping: **a custom property is substituted where it
  is declared**, so an alias on `:root` freezes the light value and every element below inherits the
  snapshot. An alias to a themed token is not a reference to it. The rules name the token at the
  point of use instead.

  What keeps it found is `packages/office-ui/test/tokens.test.ts` — nine assertions, five
  milliseconds, no browser: every `var(--ou-*)` a component reads exists; no component names a
  colour of its own; no `dark:` variants; no hardcoded z; the two dark blocks in `tokens.css` declare
  the identical set (they must be written twice — a media query cannot be combined into a selector
  list — and `--ou-accent-soft` and `--ou-shadow` had already been added to one and not the other);
  and the dense block changes only sizes, never the palette. A gallery finds a thing once; a test in
  milliseconds keeps it found.

  Also fixed on the way, all of them things the page made obvious by putting rows side by side: a
  layer row drew `␡` (U+2421) as a literal, which has no glyph in most fonts and came out as a box
  with `DL` in it, next to `●` / `◌` for visibility — all three are in `office-icons` at the right
  stroke weight; a field row read `32 px px` because `Field`'s third column and `NumberField`'s
  suffix are two different things and the page passed both; shadows were Tailwind's black on a
  tinted panel and identically black in the dark, now `--ou-lift-1/2/3` built out of `--ou-shadow`;
  and a dialog's scrim was `bg-black/25`, which separates a dialog from a white page and is very
  nearly nothing over `#0a0a0a` — the one place a modal most needs to be modal.

- **A route belongs to the render — and the reaction was the redraw all along.**

  The plan was to stop the reaction rewriting a line's ends on every edit and freeze them
  only when a shape is deleted: less churn, fewer conflicts on a shared board. The first
  measurement killed the premise. Writing a shape's new position **straight to the store**
  — no reaction, nothing touching the connector — left the line exactly where it was. The
  lines had never been following their shapes because a route was recomputed; they
  followed because the reaction *wrote to the connector node*, and changing a node is what
  makes the view draw it again.

  So the reaction was not remembering where the ends were. It was the redraw mechanism, by
  accident, and it was paying for that with an entry in the history and four numbers of
  document churn on every drag.

  The engine already has the right mechanism, and its own doc comment names this exact
  case: *"the same shape appears wherever geometry decides the result — fitting text to a
  shape, **routing a connector between two boxes**"*. A **layout pass** computes every
  route once per render and merges them into the environment; the renderer prefers the
  pass's answer and works one out itself only where there is no pass (a thumbnail built
  before the deck is loaded).

  What that leaves is a design that says what it means:

  - the **document** holds what a reader decided — which shapes, which magnets, which
    route, the bow, the label;
  - the **render** holds where the line goes, because that is derived;
  - the stored end points mean one thing again — *where an end was* — and are written at
    the two moments they matter: when the line is made, and in the transaction that
    deletes the shape it holds. The second is the only moment the live position can still
    be read, and it puts the freeze in the reader's own undo entry (undo brings the shape
    back **and** the line's hold with it).
  - the reaction keeps the one job neither can do: releasing a hold whose shape went by
    another path — a dangling reference in a loaded document, another product's command, a
    peer's deletion in a shared deck.

  A test had to change with it, and that is the part worth keeping. "Follows the shape when
  it moves" was asserting the stored `endX` — the *mechanism* — and it passed for the wrong
  reason. It measures the drawn path now, and asserts the document is **unchanged**: the
  line moved and nothing was written.

- **Drag out of a shape, let go, and the next shape is there — joined.**

  The gesture a flow chart is *made* of, and the reason connectors matter beyond a deck:
  a flow editor, a FigJam-style board and a scenario editor are all mostly this one
  move. Drag out of a magnet, release on empty canvas, and `insertConnectedShape` makes a
  shape of the **same kind, size and look** as the one it grew out of and joins it —
  because a reader who re-chooses the size and the fill for every step is doing the
  tool's work. The *shape* is selected afterwards, not the line: what they do next is
  type.

  One command rather than two, and the reason is undo: a shape whose line has to be
  undone separately is half a gesture. Which meant the line had to point at a shape whose
  sid does not exist yet — so the command **names the shape itself** (`addChild` honours a
  provided `sid`), the same trick the paste now uses.

  A line with a free end is still reachable, by the gesture that means it: dragging an
  existing end *off* the shape it holds.

- **A reaction must not eat the reader's undo.**

  Found by the test above, and it is the most important thing in this batch. The connector
  reaction runs on every document change and writes the ends whenever a shape has moved —
  so **every drag put two entries in the history**: the reader's move, and the reaction's.
  Undo undid the reaction; the reaction ran again (an undo is a document change) and wrote
  the same numbers back. Measured: undo pressed twice, `historyUndo` reporting success
  both times, and the slide unchanged. *The reader could not undo their own move at all.*

  `TransactionOptions.recordInHistory: false` is the answer, and it is a model-level
  capability rather than a patch: a write that maintains **derived** state is not an edit,
  and nobody should have to undo it. Nothing is lost, because recomputing is what makes it
  safe — the reaction runs after the undo and works the answer out from what the document
  now says. The frame-layout reaction had the same latent fault and takes the same option.

  Worth keeping for what comes next: for a **collaborative** board this is more than
  undo. A reaction that rewrites four numbers on every shape move is four numbers of
  needless traffic and four chances to conflict, on every drag, for every line. The
  cheaper design — freeze an end only at the moment its shape is deleted — is now the
  obvious next step rather than a guess.

- **Two bugs a connector found by being the first thing to walk *up* the tree.**

  Not features. A connector has to put itself and the shape it holds into **one
  coordinate space**, and every placed thing's `x` is its container's — so it asks
  "which container is this shape in?". Nothing had ever asked before; everything else
  in the editor walks *down*. Two faults came out at once, and they had been **cancelling
  each other**.

  **`moveNode` wrote an alias into `parentId`.** A transaction may name a node it is
  about to create (`$alias`), and every *read* in `moveNode` resolved one — the two
  *writes* did not. So a grouped child's back-link was `sl-new-group`: a name that
  existed only inside that transaction. Measured: the line drew to the corner of the
  slide, a group's width from the shape it was attached to. A datastore test had pinned
  this as expected behaviour with a note saying the implementation "has issues with alias
  resolution" — which is worse than the bug, because it makes it look intended.

  **And a group could not be emptied, so ungrouping was impossible.** With `parentId`
  fixed, four grouping tests failed: ungrouping *has to pass through* an empty group —
  the children leave one at a time and the group is removed after the last — and a
  transaction is validated as a whole, so `(scene | frame)+` rejected every ungroup with
  "Content of 'group' ended early". It had never been seen because the alias bug meant
  the children never actually left the group's content. The content model is `*` now and
  the rule lives with the commands that make and unmake groups, where it can be enforced
  without governing the inside of a gesture.

  **Two more, in the connector itself.** A copied diagram's lines pointed at the
  **originals** — copy two shapes and the line joining them, paste, and both lines
  attached to the first set. The clipboard payload now carries its own numbering
  (`copyForPaste`/`pastable`): a sid is `session:counter`, so the same sid exists in
  another deck open in the same session, and remapping by sid would attach the line to
  whatever happens to hold that number. And the paste names the pasted nodes **itself**
  rather than reading the sids back after the commit, so it stays one transaction and one
  undo — `addChild` honours a `sid` a caller provides. `duplicateBoxes` had the same
  fault and takes the same fix.

  **The last of it was mine to fix twice.** The drawing knew about coordinate spaces and
  the *reaction* that remembers where the ends are did not, so a line drawn correctly to
  a shape inside a group **stored** an end at the corner of the slide — and the stored
  end is exactly what a deleted shape leaves behind, so it would only have shown up in
  the one case it exists for. There is now one function that says what a connector's
  route depends on (`connectorInputsOf`), and the drawing, the overlay's handles and the
  reaction all read it.

- **The reference implementation's connector, gone through concept by concept.**

  A gap analysis rather than a feature: every exported symbol of `zero-core-best`'s
  connector against ours. Most of it we already had under another name — `autoSides` is
  `nearestSides`, `axisOf` is `sideTowards`, `connectorGeometry` is `connectorBounds`,
  `midPointOf` is `midHandleOf` — and the storage differs on purpose (they keep the whole
  spec as JSON in one attribute; ours is flat typed attributes, which is what lets the
  schema declare `options` and the harness probe them). **Four things were genuinely
  missing.**

  **Rounded elbow corners.** A hard right angle sits badly against shapes with rounded
  corners, and where two lines cross it is hard to see which goes which way. The radius
  shrinks to half of each adjoining segment, or two corners close together eat into each
  other and meet in a kink that reads as a mistake.

  **The arc — a fourth route, and the one with no magnets.** The control point is placed
  first and each end is clipped *towards it*, so the line points at the shape however the
  shape is turned; on a rotated shape the difference from a curve is obvious. Its bow
  grows with distance, it draws straight within four degrees of an axis (a grid layout
  with faintly bent lines looks untidy rather than organic), and each end stands off the
  border because a cap whose tip is exactly on the edge is drawn into it.

  That turned up a distinction worth having a word for: **the route is what is drawn, the
  track is what is measured**. A curve's control points are not the curve — the straight
  lines between them are the triangle it sits inside — so the label, an end attached at a
  fraction, and the nearest point to a drop all walk the *flattened* curve. Using one
  word for both is how a label ends up beside its own line.

  **A line that flows.** Dashes travelling along it, which says direction while *moving* —
  stronger than an arrowhead standing still, and what a presenter wants when six lines
  are on a slide and they are talking about one path. A solid line is drawn dashed while
  it flows, because a flow is dashes travelling and a solid line has none. The animation
  is CSS, for two reasons worth keeping: the presenting view is a **clone** of this DOM,
  so it flows there with nothing to re-run, and `prefers-reduced-motion` stops it without
  anything having to remember to check. The offset is one **period** of that line's own
  pattern — a fixed distance judders on any line whose weight is not the one it was
  chosen for.

  **The ninth cap: a cross.** "Blocked", "not this way", "no". The one people otherwise
  draw by deleting the arrow, which loses the fact that the relationship exists *and* is
  refused.

- **`null` takes an attribute off a node, for every type.**

  There was no way to do it. A string could pretend with `''`, an array with `null` —
  which *stored* a null rather than removing anything — and a **number** had nothing:
  `0` is a value and the schema refuses `''`, so the transaction was rejected and the
  edit silently did nothing. Found on a connector's `endT`, the fraction along a line
  one of its ends holds: moving that end onto a shape returned false and the reader's
  drag did nothing at all.

  The first fix was a workaround — leave the stale fraction, since it only means
  anything beside a connector — and that was the wrong answer to the right question.
  **The model could not say "not set" about a number**, which is a gap in the model, not
  a fact to design around. `setAttrs` removes the key when it is given `null` or
  `undefined`; `replace` (the inverse's path) stays exact, so a document that arrived
  with a null keeps it through an undo.

  Two things came off the back of it. A blank is not a value: `startNodeId: ''` would
  make every reader learn that an empty string is this product's word for "holds
  nothing", when the schema already has one — the attribute is not there. And the
  connector's `''` conventions are gone, which is the whole reason the workaround was
  visible.

- **A word at each end, and a curve that goes through a placed point.**

  Two attributes (`startLabel`, `endLabel`) for the notation everyone knows: UML's
  multiplicity, `1` here and `0..*` there. Placed a fixed distance in from each end and
  offset to one side — from the direction *there* rather than from the line between the
  ends, or an elbow's two words both come out at 45° — and clamped to a third of the line,
  or on a short line the two of them meet each other and the label already in the middle.
  In the panel rather than on the canvas, because the double-click already means the middle
  label and a second gesture that depended on how near an end the pointer was would be one
  nobody could aim.

  **And the curve bug behind the restriction.** Waypoints had been kept off curves with the
  note "a hand-placed point on one would have to straighten it to obey", which was wrong
  about the reason: a curve's points are *control* points, so a waypoint handed over in that
  list **became** one — the line leaned towards the reader's point and never reached it. Two
  of them drew a polyline, because five points match no branch. `splineThrough` is
  Catmull-Rom converted to cubics, answering **1 + 3n** points — the shape `connectorPath`
  and `flattenCurve` already read — so a curve's points still mean "control points" whatever
  their number.

  Then two grip findings, both from the browser. A curve's segment dots have to sit on the
  **track**: the middle of two control points is not on the line at all. And the bow grip
  must go once a point is placed, because `connectorPoints` ignores `bend` entirely then —
  which also meant a curve with *no* points had no dot at all, since its one span's middle
  is exactly where the bow grip stands. Two dots at a quarter and three quarters, either
  side of it.

- **The label's own type — and the theme colour a line could not take.**

  `labelSize`, `labelColor`, `labelBold`, where there had been a constant: the reference
  implementation's last unbuilt row. Twips for the size like every other length, points in
  the panel, and the size goes into `labelBox` as well as into the type — a pill drawn for
  the old size has the letters hanging out of it, which is what the browser test asserts.

  The find was the neighbour. Writing the label's colour meant resolving `theme:accent2`,
  and a connector's `stroke` was read **raw** — so a line could not use a theme colour at
  all. Re-colouring a deck re-coloured the shapes and left the lines between them behind,
  which is the theme's whole promise ("one edit rather than forty") broken for exactly the
  nodes that join the forty. Fixed by resolving the connector's attributes the way every
  other painted thing in that file already did.

- **Putting a slide *into* a layout — the arrangement, not the inheritance.**

  Asked whether templates could work "like Canva", the answer needed measuring rather than
  guessing. The substrate is **stronger** than Canva's: master → layout → slide inheritance
  and `theme:accent1` references mean re-colouring a deck is already one edit, which Canva
  imitates with per-element styles. What was missing was Canva's *Layouts* gesture — "make
  this page look like that one", with the content a reader already has. `setSlideLayout` said
  which layout a slide **follows** (what its formatting inherits) and moved nothing.

  So `layoutMoves`, and it follows the rule the formatting cascade already had: **matched by
  role, never by position.** Repeating that rule is the point — pairing the slide's third box
  with the layout's third slot moves the wrong one, and does it more often the more a reader
  has edited, which is the worst failure shape there is because it looks like the tool
  rearranging your work at random.

  Two decisions worth the words. **Nothing is added and nothing is deleted**: a box with a
  role the layout does not declare keeps its place, and a slot with no box is left empty
  rather than filled — Canva does fill them, and doing that would let "apply a layout" put a
  box on the slide that nobody typed, which then prints as nothing, shows up in the deck's own
  check, and has to be found and deleted. And it is **one transaction** with the change of
  which layout the slide follows, because a reader pressed one button.

  The harness caught the button before I did, again: `applySlideLayout` was registered,
  tested and reachable by nothing.

  What is left of Canva-likeness: a **gallery** to start a deck from, and `component` /
  `instance` — declared since the canvas nodes were written, made by nothing, and what a
  template is actually made *of*.

- **Showing a deck by scrolling it, and what that does to the motion.**

  A presenter clicks; a reader sent a link scrolls. The design is one sentence — **a scroll
  is a playhead** — and the reason it is worth writing down is that the other two answers
  are both wrong: play a build when its slide arrives and a fast reader sees them all at
  once while a returning one watches them replay; ignore the builds and the author's timing
  is thrown away.

  It needed **nothing new** in the motion model. `showing()` already had four ways to watch
  one slide (presenting, going back, previewing, scrubbing) and a scroll is a fifth that
  answers the same `Showing` with `hold: { kind: 'moment' }` — scrubbing with a different
  input device. So the stage, the hiding rule and the scrubber's off-by-one all came for
  free, and two questions answered themselves: no slide transition (the scroll *is* the
  transition) and no film starts (a reader moving through a deck is not watching a film).

  **Three things were measured, and each looked like the feature not working.**

  A key press moved the offset by one build's worth — which is *less than a slide's reading
  room*, so on a slide with no builds the first press changed nothing on screen. A key that
  appears to do nothing is the worst control there is, so a press now goes to the next
  **stop**: the start of a slide, or a build finished, which is the same picture a press
  gives in a clicked show.

  Then the same fault twice, in two memos: **a memo that reads a value has to name it.** The
  stretches were computed once with every slide at zero presses, because the *document* was
  not in the dependency list — so a build added afterwards changed nothing about the layout.
  And the animations kept the `seekTo` they were built with, because the *scroll* was not in
  the list of the memo that builds them — the offset moved, the model answered a new moment,
  and nothing on screen moved. Both are now asserted in the browser against a real
  animation's `currentTime`: 150px in holds it at 903ms, 300px at 1806ms, and scrolling back
  to 150px holds it at 903ms again rather than replaying.

- **The presenter's screen in a window of its own.**

  A real showing has two screens: the projector shows the slide, the laptop shows the next
  slide and the notes. One window could only *split*, which is what a presenter with one
  display needs and exactly what a presenter with two cannot use — the audience would be
  reading the notes. The presenter view was already built and already read everything out of
  the document; what was missing was somewhere to put it.

  **One truth, drawn twice.** The showing's state is the app's and there is one copy of it,
  so the second window is a `createPortal` into another document rather than a second React
  root with its own copy — and there is no channel, no serialisation and nothing to keep in
  step. Measured, because I did not expect it to work: a **click** inside that window reaches
  the opener's React tree, and so does a key.

  Four things had to be carried across by hand, and three of them were measured:

  - **The styles.** A new window's document has none of the opener's, so both kinds are
    cloned — `<style>` elements in dev, a `<link>` in a build. Without them the presenter
    view draws as unstyled text, which reads as a broken feature rather than a missing link.
  - **The callbacks must not be dependencies.** With `onGo` in the effect's deps, every
    render made new closures, the effect re-ran, and its cleanup **closed the window** — the
    presenter screen opened and vanished in the same frame. A window is opened once, for as
    long as it is asked for.
  - **The keys.** The audience screen's handler is on the *opener's* window, so with a
    second window open the arrow keys went where focus was — here, where nothing was
    listening. Which turned the advance rule into a model function: `advanceShow` was a
    `useCallback` inside the audience screen, right while that was the only place a press
    could arrive from. Two windows made it two rules, so it is one now, with its three cases
    (a build plays before the slide leaves; back un-plays one at a time; a slide entered
    backwards arrives **finished**) tested in milliseconds.
  - **The lifecycle.** The app closes it when the show ends and when the opener goes, and
    the window tells the app when the *reader* closes it — with a flag so the app does not
    hear its own close as the reader's.

- **A hop where two lines cross.**

  A plain crossing is ambiguous — branch, or pass? — and the fix is the schematic
  convention every diagram tool draws. Automatic, with nothing in the document, for the
  same reason the fan is (§8.8): what it prevents is not a look but a picture that reads
  wrongly. Which of the two lines hops is the **layout pass's** decision and could not be
  anywhere else: it is a fact about the *pair*, and a renderer asking "does anything cross
  me?" answers twice and draws two hops at one crossing.

  The three exclusions are where the work was. A crossing **near an end** is two lines
  arriving at the same shape, not a crossing. Lines **running along** each other never pass
  at a point. And a **curve** is left alone, because a hop cut into a Bézier is not one arc
  — better a plain crossing than a wrong one. Then two more from the drawing itself: a
  crossing within a corner's radius of a corner is skipped (the arc and the rounded corner
  would meet in a kink), and the hop is one fixed-radius semicircle bulging to a fixed side,
  because a hop that grew with the run would be a different size at each crossing of the
  same line.

  The part worth keeping: **nothing is written down**, so a hop stops existing when a shape
  moves and the lines no longer cross. No attribute to clear, no undo entry, and a browser
  test that asserts exactly that.

- **Editing a chain: a shape dropped into a line, and a line turned round.**

  Drawing a diagram was covered; *editing* one had two gaps. Dropping a shape on a line now
  splices it into the chain — the gesture every diagram tool answers the same way — with the
  line highlighting while the shape is held from the same answer the release uses, and the
  drop's own move inside the same transaction so it is one press of undo. And a line can be
  turned round, which before meant deleting it and drawing it again.

  **The reverse taught me something by disagreeing with my design.** I swapped the ends
  *and* the caps, reasoning that a half-swapped line is inconsistent. Measured in the
  browser: the arrowhead stayed on the shape it was already on and **nothing visible
  happened** — a cap drawn at a shape looks identical whether it is that line's start or its
  end, so swapping both moves nothing. A cap is notation attached to the *direction*, not to
  the shape; leaving the two attributes alone is what moves the drawn caps. The first
  version also put an arrow at *both* ends, because `endCap`'s schema default is an arrow
  and writing `null` where the other end had no attribute restored it by default — a
  reminder that absence and "none" are different answers when a default is not empty.

  A test-side one: `dash` is `strokeDash`, and naming it wrongly in the list of things a
  splice carries over quietly carried nothing. The test caught it by asking for the value
  back rather than asserting the write succeeded.

- **The derived-state finding, taken through the rest of the product.**

  §8.11 was found on a connector. The sweep afterwards asked where else the same thing is
  true, and measured rather than reasoned: every reaction that writes the document
  (`editor:content.change` listeners that commit), every renderer that reads a node other
  than its own, and every place a reader's gesture lands on state something else owns.

  **Two real faults, both worse than predicted.**

  *A move inside a group could not be undone at all.* Not "took two presses" — three
  presses of `historyUndo` reported success and changed nothing, because each undid the
  group's re-fit and the reaction wrote it straight back. And the obvious fix was also
  wrong: unrecorded, the child came back and the group did not, because the fit is not
  only derived numbers — it **re-origins**, moving the group one way and every child the
  other by the same amount. Undo restored the reader's relative `x` into a coordinate space
  that had since moved. So the engine gained the third answer it was missing:
  `appendToPreviousEntry` puts a write into the entry of the edit that *caused* it, ahead
  of it in the inverse order. It refuses when there is no edit to belong to or when the top
  of the stack is still redoable — and refusing is safe, which is the property that makes it
  usable at all.

  *A drag inside a frame that arranges reported success and did nothing.* The frame owns
  its children's coordinates (§5), so the write was put straight back and the reader's own
  undo entry restored the number the layout had already restored. The comment on `laysOut`
  had said "which decides what a drag means" since it was written; the drag had never been
  told. It means the **order** now — `reorderIndexAt` in the model with its own tests, the
  slot drawn while dragging from the same answer the release uses — and the panel's `X`/`Y`
  are greyed with the command refusing those two keys, because there a number has no other
  meaning to be given. `moveBoxTo` learned to take several shapes, which needed the whole
  final order computed at once: `moveNode` removes before it inserts, so moving `[a, b]` to
  place 2 of `[a, b, c, d]` one at a time gives `[c, a, d, b]`.

  **A finding for later, from the full browser sweep.** A shape dragged so that part of it
  hangs over the slide's edge has its handles on that side **clipped**: the overlay may not
  draw outside the stage, so the handle is in the DOM with a rectangle and
  `elementFromPoint` there answers `.sl-stage`. A reader cannot resize from that side
  without scrolling. PowerPoint gives a slide scratch space around it for exactly this. It
  was found because a test in the existing suite had been asking for the east handle of a
  box nearly as wide as the slide, right after dragging it right — failing on `main`, not on
  anything in this batch — and now asks for a handle it can actually press.

  **And four places that turned out to be right, which is worth writing down.** Word's
  contents page follows a heading being typed in (measured, not assumed). A slide follows
  its theme changing — white to green, blue to magenta — so the master/layout inheritance
  redraws. The frame layout's unrecorded write is correct, because there a child's position
  is derived from nothing the reader writes. And the reactions in `math-commands`,
  `list-commands` and `table-commands` write no document at all: they set context keys,
  which is app state. A survey that finds nothing in four of six places is the survey
  working.

- **One button that tidies a diagram, and the check that caught it before a reader did.**

  A reader draws a flow chart the way they think of it, and after a dozen boxes the
  picture is right and the *placement* is a mess. `layoutGraph` is the layered algorithm
  — rank by longest path, order by barycentre, place and then pull each node onto the
  centre of its children — and every one of the twelve unit tests is a picture that came
  out wrong without one of those passes. The two that were not obvious: a diamond's join
  ranks by its *deepest* parent (by shortest path it sits beside one of them and an edge
  points sideways), and two diagrams that share no edge are laid out **side by side**
  rather than ranked together, or a reader sees two pictures shuffled into each other.

  The interesting half is what the command decides, not what the arithmetic answers.
  Only shapes a line touches move — a title is not part of the diagram, and that is what
  makes the button safe with everything selected. The tidied graph starts at the corner
  the diagram already occupied, because a tidy that also moves the picture is two changes
  wearing one name. It is **one transaction**, which is not a detail: nobody presses a
  button that rearranges everything they drew unless one keystroke undoes it. And the
  hand-placed bends come off the lines it tidied, in that same transaction — a waypoint
  describes a detour around a shape that has moved.

  **The conformance harness caught the button before I did.** `arrangeGraph` was
  registered, unit-tested and working, and `every-command-can-be-reached` failed the
  build: on no toolbar, bound to no key, so a reader could not run it however well it
  worked. That is the whole argument for the harness in one line — the command was
  *finished* by every measure I had, and it was unreachable.

  **"Is it a mode?" — no, and the reason matters.** A live layout would make a shape's
  `x`/`y` derived, and then a reader's drag has nowhere to go: the §8.11 trap, in the one
  place where the document is unambiguously the authority. What that leaves is the *second*
  press, which would take the reader's own arrangement with it — so a **locked** shape is a
  pin: it keeps its place and the diagram is laid out around it. No new attribute, because
  `locked` already means "I have decided where this goes" and already has a command and a
  control.

  My first version *excluded* locked shapes, which quietly took their lines out of the
  graph: one locked box in a chain made the whole diagram untidiable — and I had written a
  test asserting exactly that, as though it were the design. That is the third time in this
  batch that a test pinned my own wrong assumption; it is a faster way to be wrong than
  having no test, and the only guard is that the assertion has to say *why*.

  **And the two gap numbers were picked, which is half an answer.** Asked where they came
  from, the honest reply was "I chose 1440 and 360" — so now the floor is `dot`'s own
  `ranksep`/`nodesep` (there is no reason to invent proportions that thirty years of
  diagrams have been read at) and above that the rank gap is **measured**: a label pill
  sits on the middle of the line between two ranks, and a gap that does not hold it draws
  the reader's word over the shape below. Which of the pill's two sizes matters depends on
  the direction, which is invisible on `A` and unmissable on a Korean sentence. The
  arrowhead it also has to clear is asked of the model — `capSizeOf`, extracted from the
  renderer, because `max(180, width * 4)` written twice is the restatement this repository
  keeps finding.

  A smaller one: the icon key `tidy-right` reuses the picture `connect` already uses,
  deliberately. Joining shapes and tidying what they make are the two halves of drawing a
  diagram; a second near-identical glyph would be a distinction without a difference. And
  the duplicate `import` that came of adding it did not break the *build* — vite's
  pre-transform failed at run time and every browser test in the file failed at
  `openDeck`, which is a reminder that a green `vite build` is not a loaded page.

- **A bend the reader places, and two gestures that wanted the same pixel.**

  Waypoints — the points a reader tells a line to go through — are the one part of a
  route that is *not* derived (§8.12): there is nothing to work a hand-placed bend out
  from, and a reader who has routed a line around a table they mean to move later means
  that route to stay. So they are stored, the route is still derived from them, and a
  placed point **stops the router avoiding obstacles**: they have said where the line
  goes.

  Three things the browser found that the arithmetic could not.

  **A new point's place is not a segment count.** An elbow turns one waypoint into two
  route points, so the third segment is not the third bend. It comes from how far along
  the *track* the drop was (`nearestOnPath`) — the measured line rather than the drawn
  one, which is the distinction §8.5 already needed.

  **A drag and a double-click on one dot.** `preventDefault()` on `pointerdown`
  suppresses the compatibility mouse events, and a pointer capture retargets the click
  at the capturing element; together they sent the double-click to the overlay, which
  opened the *label* editor instead of taking the bend away. The gradient's axis had
  already found half of this and the finding did not travel. The other half is new and
  better: a press that does not travel now writes nothing at all — a click has no
  business in the history, and the commit was replacing the handle's element, so the
  second click landed on a new one and never became a double-click.

  **The bow grip and the segment dot both bend an elbow's middle run**, and whichever is
  drawn last takes the press. I took the bow grip off elbows to make room, and that made
  a *fan* impossible to undo by hand — the one thing the grip is needed for (§8.8). Both
  stay: the segment dot that would land on the grip is skipped, and whether a route has
  a draggable bow at all is now the model's answer (`canBendByDrag`) rather than a
  condition the overlay repeats. It has to agree with `bendFromDrag`, so a unit test
  asserts exactly that — a grip that appears where a drag answers "unchanged" is a
  handle that moves and does nothing.

- **A line's own gestures: fanning, the bend grip, and the label on the line.**

  Three things that only turn up when the connector is used rather than described.

  **Two lines between the same pair no longer hide each other.** Routed identically,
  they are drawn one on top of the other — the reader sees one line, cannot tell there
  are two, and cannot select the one underneath. A broken state rather than a styling
  choice, so the *drawing* fans them (`(index - (count - 1) / 2) * step`, document
  order) and the document says nothing. The reference implementation leaves this to the
  reader's `bend`; automatic is right because the state it prevents is not a look, it is
  a line nobody can reach. A `bend` the reader set still wins.

  **A grip in the middle bends it.** On the part of the route a bow actually moves — an
  elbow's middle segment, a curve's own midpoint, which for a cubic is
  `(p0 + 3c₁ + 3c₂ + p3) / 8` rather than halfway between the ends. A drag is projected
  onto the one axis that can change (the rest is dropped, not invented) and **added** to
  the bow already there — without that, grabbing the second of two fanned lines snapped
  it onto the first before it moved. And there is no grip on an elbow with a single
  corner, because that corner is where its two sides meet and a drag would mean nothing.

  **The label is typed on the line.** Double-click, the same gesture as everything else
  on this canvas: the first click says which thing, the second says "work on what is in
  it". Naming a relationship in a side panel means looking away from the diagram.

  The test caught two of my own wrong assumptions, both about *which axis*: a bow slides
  an east-west elbow **sideways**, not up; and the largest x in a right-to-left route is
  its own start, so a max hides the whole change. Neither was a bug in the code.

- **The connector, finished: the gesture, the routing, the branch and the label.**

  Four things the spec listed as next, done in order, and each one turned something up.

  **Pulling a line out of a shape.** A selected shape shows its magnets and a line comes
  out of one; either end of a selected line can be moved onto another shape, or dropped
  in empty space to be attached later. Two collisions found by tests, both the same
  fault: *two gestures must not share a pixel*. A side's magnet is exactly where that
  side's **resize handle** is, so the handle took every press — the dots sit outside the
  edge now, which is also where Canva puts them. And a selected connector was drawing
  eight resize handles that swallowed the presses aimed at its ends — a connector has no
  box to resize (§8.1), so it gets none.

  **Routing around what is in the way.** An elbow goes around, a straight line moves to
  another magnet (never one the reader chose), a curve bows further. Three rules make it
  behave: touching obstacles are one **clump** (candidates are built around a box, so two
  boxes side by side make every candidate land in the other — what looks like a maze is
  almost always a clump); the choice is **clean and shortest**, not "fewer crossings" (a
  crossing count depends on how many segments a route has); and if nothing is clean the
  **direct line stands**, because a reader can follow a line that crosses a box and
  cannot follow one that wanders. That last rule showed up immediately in a browser test:
  on the sample slide the route never changed, because the title and body placeholders
  are shapes too and nothing can avoid them. Measured with a probe on the renderer —
  three obstacles seen, line still straight — which is the difference between a bug and a
  rule.

  **A branch off the middle of a flow.** An end can hold another *line*, at a fraction of
  its **length** — a line has no sides to be a magnet of, and the halfway of an elbow
  whose first leg is twice its second is on that leg rather than at the corner. The
  arithmetic is handed a *point*: resolving a held line means routing it, which means
  knowing what it holds, so the document walk and the cycle it must refuse belong to the
  caller. `connectorRouteOf` is that one answer, and the renderer, the overlay and the
  gesture all go through it.

  **A word on the line.** The pill behind it is **estimated** from the characters, not
  measured: the label is in the same SVG as the route so it travels with the line for
  free, and SVG cannot measure text before it draws it. A CJK character is about as wide
  as the type is tall and a Latin one a little over half — the other way round makes a
  Korean label hang out of its own pill.

  **Two surprises worth keeping.** A number attribute has nothing to be *cleared* to:
  `endT: null` became `''`, the schema refused it, and `setConnector` returned false —
  so an end moved off a line went nowhere at all. It needs no clearing, because a
  fraction only means anything beside a `nodeId` that names a connector. And the label
  needed a **text field**, which `office-ui` had none of and three callers were waiting
  for; extracting it showed the three did not want the same control — a *name* is
  committed (a keystroke per history entry is not an edit log anybody wants) and a
  *search box* is live (its count answers the query as it grows). `TextField` does both,
  and the deck's find bar came off the raw-control ratchet.

  110 unit tests on the arithmetic, 10 in a browser.

- **A line that remembers what it joins.**

  A `line` remembers a place; a **connector** remembers the pair, so moving either
  shape moves the line. That is the whole feature: a flowchart, an org chart or an
  architecture diagram is mostly the work of re-drawing lines after moving a box, and
  it disappears. `connector` had been declared in the office schema, named in the
  shared vocabulary and exempted in the conformance report as *"a board arrow between
  two nodes; a deck has no arrows yet"* — that exemption is deleted, which is the
  harness doing its job.

  The research is written down as **`docs/specs/canvas-model.md` §8**, decision by
  decision, because every one of them was reachable two ways. The four that matter:

  - **It stores no box.** `CANVAS_GEOMETRY_ATTRS` declares `width` as *required* and a
    connector cannot honestly have one — its extent is whatever the two shapes make.
    The alternative was to store the computed bounds and chase them with a reaction,
    which is right for a laid-out frame (a child *is* a box a reader drags) and wrong
    here: nobody drags a connector's box, so a stored copy is a second source of truth.
    So the schema grew `CANVAS_PRESENCE_ATTRS` — `visible`, `locked`, `opacity`, the
    three a connector does have — and every consumer derives the rest.
  - **Both ends keep coordinates anyway.** When the shape an end holds is deleted, the
    attachment is dropped and the line stays where it last was. A line that vanished
    with the shape would take the relationship out of the picture *silently*, and a
    reader cannot see what is missing.
  - **A straight connector uses only the centre magnet.** Drawn to a side's midpoint
    it cuts visibly through its own shape as soon as the two boxes are offset — so a
    straight line joins the centres and is clipped where it leaves each **outline**,
    ellipse on the ellipse. Figma draws the same distinction; the reason is geometry.
  - **Nine end shapes, because they mean things.** A flow is an arrow, an association a
    dot, UML's inheritance and composition a hollow triangle and a diamond. Ship one
    and readers stack shapes on the line's end to fake the rest — and the fake drifts
    every time the line moves, which is the thing a connector exists to prevent.

  **50 unit tests, 4 in a browser**, and the split is the usual one: every piece of the
  arithmetic draws a *plausible* wrong picture, so all of it is milliseconds — where a
  line leaves a rotated square, which pair of magnets is nearest (and why the nearest
  pair is not the angle between the centres), why a curve's handle is measured along
  its normal rather than between the ends. What only the browser could say is that two
  shapes can be joined, that the line **follows** a drag, and that deleting a shape
  leaves the line behind.

  **The surprise, and it is a good one.** `deleteBoxes` reported success, the shape was
  gone from the slide — and `store.getNode(sid)` still returned it. A deleted node is
  taken out of its parent's content and stays addressable by its sid, so the connector
  asked "does this shape exist", was told yes, and never let go. *Existence in the
  store is not presence in the document*: a node in the document has a parent, and the
  root is the only one that does not. Anything else that asks a store whether something
  was deleted has the same trap waiting for it.

  Deferred, with the reasons in §8.5: routing **around** the shapes in between, an end
  attached to another connector (a flowchart's branch off the middle of a flow), and a
  word on the line. Dragging an end from one shape to another is the same `setConnector`
  command and is the next piece of work — today the two shapes are chosen by selecting
  them, which is one of the two gestures every diagram tool offers.

- **A film's sound is drawn, and the trim is dragged onto it.**

  Trimming was two number fields in seconds and a reader typed them **blind**: nobody
  knows where eight seconds of dead air end without playing the clip and watching a
  clock. Now the sound is a strip in the 필름 group, the kept part bright and the
  trimmed part dim, with a handle at each end.

  **The reduction is the feature, and it is arithmetic.** A minute of audio is 2.6
  million samples and the strip is two hundred pixels: the drawing is one peak per
  pixel and everything else is a decision about which sample wins. Each of those is a
  way to draw a *plausible* wrong picture, so each is a test in `office-ui`'s
  `waveform.test.ts` — eighteen of them, milliseconds:

  - **Peak, not mean.** A bucket of silence with one click in it: a mean draws nothing
    at all, and the click is the one thing a reader is looking for.
  - **Normalised, with a floor.** A quiet recording is a flat line at its true scale
    and a reader hunting a gap is looking at *relative* loudness — but a silent clip
    has no loudest sample, and dividing by it makes noise out of nothing.
  - **The louder channel, not a mix-down.** Summing two channels and halving cancels
    anything panned hard the other way: a voice on the left would draw as the room.
  - **Silence is a line, not a gap.** A bar of zero height reads as *no data*, which is
    exactly the thing being hunted for. One pixel is the floor.

  **Three things only the browser could say**, and they are the browser test: the file
  decodes, the strip has the shape of the file (a tone in the middle quarter, flat at
  the ends — a test that only counted bars would pass on the wrong file), and a handle
  dragged across it writes the moment it was dropped on.

  **`0` still means "to the end".** A handle dropped on the right edge writes zero
  rather than the film's length, because a length written into the document is a
  measurement, and it is wrong the moment the file changes. That knowledge stays in
  the deck: the strip is in fractions and knows nothing about milliseconds.

  **Where it lives, and one accessibility fault it found.** The arithmetic and the
  strip are `office-ui`'s — a sound's shape is not a fact about decks, and a document
  editor with a voice note wants the same picture — and the decode is a hook there too,
  cached by source, because a panel re-decoding a minute of audio on every render is a
  panel that stutters. The failure path is silent on purpose: a codec the browser
  refuses leaves the strip absent and the number fields exactly as they were.

  The fault: the handle and the number field were both called 시작점, so a screen
  reader announced the same name twice and a test could not tell them apart. The
  handles are verbs now — 시작점 옮기기 — which is what a **test that could not find
  its own control** was really reporting.

- **The deck checks itself before it is given to anybody.**

  A deck's problems are invisible while it is being made. Alt text does not appear on
  screen. A shape five pixels off the slide is not clipped in the editor — a canvas
  draws outside itself — and is clipped by the projector. Whether 11pt reads from the
  back of a room is a thing you find out in the room. Nobody re-reads twenty slides
  by eye looking for these, so nobody finds them.

  Six kinds: **alt text**, **text too small**, **shapes off the slide**, **contrast**,
  **empty slides**, and **text over a photograph**. 25 unit tests, milliseconds.

  **The model only, and the cost written down.** No DOM — which is what lets it sweep
  every slide at once, including the hidden ones, and keeps an answer from depending
  on the zoom or a font that has not loaded. What that costs is stated rather than
  worked around: text overflowing its box is not measured (that is the font's answer
  and there is no font here), and neither is the contrast of text over a *photograph*
  (the photo's pixels are not in the model). Both are reported as **things to look
  at** instead of things to fix.

  Four decisions, three of them adopted from `zero-core-best`'s own notes:

  - **Two levels and no more.** `must` for what is certainly wrong, `check` for what
    a person has to look at. Three grades and a reader spends the time reading
    grades, then only looks at the red ones — which is one grade with extra steps.
  - **Two thresholds for small text**, because one does not work. A 12pt footnote is
    2.2% of a 16:9 slide's height and a 24pt body is 4.4%, so a single 3% line puts
    every label and caption on the wrong side of it: *if everything is red, nothing
    is red.*
  - **A fraction of the slide, not a number of points.** The same 14pt is small on a
    16:9 slide and enormous on a square one made for a phone.
  - **Nothing rather than a guess.** A contrast ratio needs numbers, and a document's
    colour may be an `rgb()`, a named colour or a `color-mix()`. The parser reads the
    two hex notations and answers *nothing* for the rest — including a hex with
    alpha, because a colour with alpha is a colour over something, and what it is
    over is the question being asked.

  **Two things the writing turned up.** A run's colour is a **mark**, not character
  formatting — `resolveDeckFormat` answers about the size and says nothing about the
  colour, so the first version of the contrast check never fired and 25 tests passed
  around it. And the two checks that both walk a shape's text now share one walk,
  because walking it twice is two chances to disagree about which runs count.

  And it found something real on the first run against our own sample deck: **slide
  4's body text is 16pt**, which is 2.96% of the slide's height — just under the line,
  reported as a look rather than a fix, which is exactly the band the second threshold
  exists for.

- **A colour can be animated, and the mechanism was already there.**

  The last row of `zero-core-best`'s track table that we could reach, and their guide
  is where the difficulty is written down: *a registered custom property always
  carries its initial value, so `var(--x, fallback)` never reaches the fallback.* A
  length's neutral is 0 and an angle's is 0deg — the same for every shape. A colour
  has no such value: a shape's fill is whatever the document says.

  Their answer is for the renderer to *plant* the current colour on the element and
  have the CSS read only the variable. Ours needed no new mechanism at all: a shape
  **already declares its own neutrals**, to stop the tracks inheriting into the
  shapes inside it (`fillBoxCss`). A colour is that same declaration with a value
  that is not the same for everyone — one field on the track (`own: 'color'`) says
  which of the item's fields to read it from.

  **Two measurements decided the design.** The obvious version returned to `inherit`
  at offsets 0 and 1, and that reads the *parent's* value rather than this element's
  declaration — so a shape whose parent declares nothing inherits the registration's
  `initial-value` and the emphasis started from `rgba(255, 0, 0, 0.004)`, an
  interpolation out of transparent. What works is **one keyframe, in the middle**: an
  animation with no start and no end takes the underlying value for both, so it goes
  from the document's colour, through the reader's, and back — and the effect never
  learns what the document's colour is.

  It also costs the commonest shape on a slide one extra declaration. A single opaque
  solid is still the box's own `background`, and it now reads
  `var(--sl-f0-color)` with the colour declared beside it — because a fill-colour
  motion that only worked on shapes with a stack of two would be a motion nobody
  could find.

  **The test shape from the previous item paid for itself three times.** Adding the
  track: the generic "something the product draws writes it" failed, because the
  fixtures had a gradient, a picture and a shadow but no *solid*. Adding `recolor`:
  the generic "animates something" rule (written as `> 1` frames) reported a
  deliberately one-frame effect as broken — the rule now says what it meant. And a
  **new** generic check, written after `fillStop` shipped with its renderer reading a
  variable that `TRACKS_OF` never declared: *every track a fill's CSS reads is a
  track the shape declares.* Without that entry the drawing was right and the
  containment was gone — a build on a frame would have slid the gradients of every
  shape inside it, silently, in the one case nobody tests.

  One test-only casualty worth writing down: **jsdom does not resolve custom
  properties**, so a render test that read a computed `background` now reads the
  `var()` untouched. It asserts the declaration instead, and the resolved colour is
  checked where a browser is — `theme.spec.ts` still reads `rgb(37, 99, 235)` off the
  computed style.

- **One more motion track — and a test shape that found four defects.**

  The third thing from `zero-core-best`'s list, and the first two thirds of it were
  **already done by a cheaper mechanism**. Their table has eight property tracks;
  ours had the equivalent of five, and the three that looked missing — corner
  radius, blur, backdrop blur — needed no track at all: they are in `MUST_ADD`, so
  the Web Animations API's own additive composition already means "however much more
  than the document drew". Tracks for two of them were written, wired into the
  renderers, and deleted. `TrackPart` now says what a track is *for*: a value the
  CSS property cannot express additively.

  The one genuinely missing row was **the gradient's stops** (`fillStop`), with the
  `shine` effect over it: every stop moves by the same amount, so the band of colour
  travels and the shape the designer gave it is kept.

  **And on the way, a cost-table row was added and taken back out.** `borderRadius`
  seemed to belong in tier 2 — "a rounded corner is a clip, so the shape repaints" —
  and the spec's *tier 1* list has `clip-path` in it, which is the same argument for
  the opposite answer. That table's own rule is that an unnamed property is treated
  as cheap **and the spec is where the argument happens**; adding a row on the
  strength of a comment was deciding it in the wrong file.

  ## The part worth keeping: two table-driven test blocks

  Adding `fillStop` passed 688 tests while **nothing in the product read it** — the
  track was declared, registered as a `@property`, offered by the table, and no CSS
  mentioned its name. This repository's signature fault, produced by the file whose
  own comment warns about it. So the tests were rewritten to loop the tables instead
  of naming rows:

  - **Every track**: its neutral parses as its syntax; it is in the cost table under
    the name a frame actually uses; and **something the product draws writes it**.
  - **Every effect**: it animates something (frames *or* an SVG filter); every
    custom property it names is a real track; the tracks it writes belong to the part
    it declares; `propertiesOf` reports every key its frames carry; and **an emphasis
    comes back to where it started**.

  The last one found **four defects in one run**, all the same shape — an amount
  range that does not land on a returning value:

  | | ended at | left the shape |
  |---|---|---|
  | `spin` | 450° | turned 90°, then snapping back |
  | `hueShift` | 225° | every colour shifted — and its own comment said "a full turn and back… 360° is the same colour as 0°" |
  | `sweep` | 225° | gradient turned |
  | `frost` | blurred | the slide behind it frosted, under a section titled "out and back" |

  Three of the four had a comment describing the behaviour they did not have. The
  four are turns now (`amount` counts them, so every value returns), and `frost` goes
  out and back — which also made a preset's comment obsolete in the right direction:
  `turnOnce` was `0.334` with a paragraph explaining that a whole turn was an awkward
  third of the range, and it is `0` now.

  Four effects genuinely *are* one way — `drift`, the two halves of the Ken Burns,
  and a fill cross-fade — and they say so with `oneWay`, **checked in both
  directions**: an effect claiming it and then returning fails on the claim. Which is
  the rule the conformance harness applies to its own exemptions, applied here
  because a comment cannot be told from an oversight by anything that checks.

- **The deck can be searched, and replaced through.**

  The second thing brought over from `zero-core-best`. Changing an old product name
  in a hundred-slide deck cannot be done by hand: turning the pages and reading each
  one, two or three get missed every time — and unlike a document there is no
  scrollbar to run an eye down, so a match on slide 61 is invisible until you are on
  slide 61.

  **Almost none of it is new code.** Word's `findMatches` already answers "where in
  this tree", and `DeckAccess` and `DocumentAccess` are the same shape — a `getNode`
  and a root — so scoping a search to one slide is *handing it a different root*.
  Nothing in Word's function had to change for a deck to use it. What a deck adds is
  the question Word's cannot answer: **which slide**, because the next match is a
  different slide rather than a scroll.

  Three decisions, two of them adopted from `zero-core-best`'s own notes:

  - **Not the resources.** Searching from the deck's root would be wrong in two
    directions at once: Word's walk skips `resources`, so every **speaker note**
    would be invisible — and it would skip a layout's placeholder text only by
    luck, when offering to replace inside a layout is offering to break every slide
    that follows it from a search box. So it is a walk over the slides, plus each
    slide's note.
  - **A match is inside one run.** Runs split where formatting changes, so a word
    with its first half bold is not found. Joining a paragraph's runs to search them
    would mean splitting them again to replace — and *we* would be deciding which
    side's formatting the replacement keeps. Written down as a limit rather than
    worked around, which is what their guide does too.
  - **Replace all, slide by slide.** One transaction per slide: undoing "all" in a
    sixty-slide deck as a single step is not an undo anybody wants.

  `boxOfMatch` is the small piece worth naming: a match's own sid is the **run of
  text** it was found in, three levels below anything a reader has a name for, so a
  slide with nine text boxes on it could not say which. It walks up to the nearest
  thing the canvas placed — and answers nothing for a note, where there is no shape
  and the count has already said 노트.

  **And this is where the new verification protocol started.** Model first (14 tests,
  milliseconds — including the two a deck gets wrong by accident), then only the new
  spec and the two things the change touches. The whole browser suite was taking 6.5
  minutes a round, most of it re-running specs the change could not reach.

- **The slide has a layer list.**

  The first thing brought over from `zero-core-best`, whose slide editor has one at
  1,387 lines. Two things a canvas cannot answer, and every design tool answers
  both with this control: **picking what is underneath** something — on the canvas
  it is reached by luck, click through it or move the thing on top away and put it
  back — and **where in the stack** a thing goes, which the deck's four order
  buttons answer four ways when the answer is a *position*.

  The rows are a model (`layerRows`, 17 tests, milliseconds): what is on the slide,
  what each is called, which is hidden or locked, which has motion, how deep inside
  a group. Front at the top, because document order is paint order — a list running
  the other way would be correct about the model and wrong about the reader.

  **Three things it found.**

  `visible` was `locked` all over again: **declared in the shared schema, read by
  the renderers of both products** (`isVisible` → `display: none`), and settable by
  nothing. The attribute worked and no reader could reach it.

  And it did not even work, for half the drawings. `placed()` spreads a renderer's
  own styles *after* the placement, so a renderer that sets its own `display` — the
  text frame is `flex`, so is a frame — **overwrote the `display: none` that
  `visible: false` had just produced**. Measured: the attribute written, the node
  saying `visible: false`, the shape still on the slide. Not drawn is not a style
  choice, so it is applied last now and none of the twelve renderers had to change.

  `childrenOf` was written **seven times** in `office-slides` — and the seventh was
  different: `motion.ts`'s copy had no filter, so it treated anything in a
  `content` array as a sid. Nothing had gone wrong yet, which is what seven copies
  of a predicate is for.

  **And it needed a new harness check.** The rows are named from a table, and a
  table is what this harness distrusts: `every-drawing-can-be-named` asks the
  product for a word for every node type a *canvas* can hold, and a product with a
  fallback has to return nothing for the types it does not really know — a fallback
  makes a missing name look like a name. Its first run found `connector`,
  `component` and `instance`, all declared and all coming out as the same word as
  everything else the table did not know.

  Two things about writing that check are worth keeping. It first asked about every
  *placeable* type and produced **thirty** findings — paragraphs, table cells, the
  document itself — and thirty exemptions would have been thirty notes; the set is
  derived from the schema instead (the `scene` group, plus what a scene container's
  content says it holds, which is how `frame` is included and how a `textFrame`'s
  paragraphs are not). And Word had to *adopt* it: a check examining nothing is a
  failure in this harness, so Word's conformance test now supplies the names too —
  it draws shapes on a canvas and had no word for any of them.

  Which put the shared names in `office-controls` (`CANVAS_NAMES`) rather than in
  each product, before the second copy existed. A deck adds `mediaVideo` and
  `mediaAudio`; nothing else in the suite puts a film on a page.

  The raw-control ratchet objected, correctly, and the entry it gained names the
  next shared component: `office-ui` has **no icon button**, and one now has three
  callers — this list's toggles, the filmstrip's row, and the close on every pane
  in both products.

- **The theme's own colours can be typed in.**

  The one thing every real deck starts with — the company's own accent — was the
  one thing that could not be set. A deck could be *given* a designed theme and a
  shape could *reference* a slot (`theme:accent1`, offered as swatches in every
  colour field); the slots themselves were whatever the preset said.

  **The command was already able to do it.** `setDeckTheme` merges any subset of
  the twelve into the deck's theme and makes one if there is none, which it had
  done since the theme existed. What was missing was somewhere to type — so this is
  a dialog, fourteen rows, and two model functions.

  The two are where the interesting part is:

  - **`themeNow`** fills the gaps from the first preset. A theme node carries
    whichever slots have been written, so a deck may name a theme and have four of
    its twelve colours. Every reader of a *single* slot is fine with that —
    `resolveThemeValue` answers nothing and the caller draws nothing rather than
    black. A reader that wants to *edit* is not: a colour field with nothing in it
    cannot be nudged, and four blanks in a row of twelve read as a broken panel.
  - **`themeMatching`** answers which preset the theme *is*, from its values rather
    than its stored name — and that fixed a latent lie. The theme row read the
    `name` attribute, so a deck whose accent had been changed to the company's red
    went on calling itself "Office", and a reader who cannot see that they have a
    theme of their own cannot see why the list will not put the old one back.

  **And the control put the lie straight back.** With no match the row's value was
  `''`, and a `<select>` whose value is none of its options shows the *first* one —
  so "nothing chosen" rendered as "Office" again. `CUSTOM_THEME` (`사용자 지정`) is
  offered while it is the answer and gone once a preset is picked, which is also
  the truer thing to say to a reader than a blank.

  Two smaller decisions: applied on 적용 rather than as it is typed, because a
  theme re-colours every shape that follows the deck and twelve fields typed one at
  a time would be twelve re-colourings and twelve entries of history — which is
  also what makes 취소 mean something. And the preset list is *inside* the dialog
  as well as in the panel, so a reader who has changed three things has one way
  back.

  Two guards objected on the way, both usefully. `every-command-can-be-reached` was
  satisfied already (the row existed); the **raw-control ratchet** was not, and its
  finding was a *comment* of mine containing the word `<select>` — it reads the file
  as text. Left that way on purpose, with the reason written down: a
  comment-stripper safe enough for this would have to tell a string from a comment
  (`'http://…'` begins with two slashes), and a check that silently mis-parses is
  worse than one that occasionally objects to a sentence.

- **A reader can place a guide.**

  The last item on the chrome audit that PowerPoint, Keynote and Figma all have:
  the deck drew snap lines while a shape was dragged and there was **nothing to
  measure against and nothing a reader could place**. Found guides answer "is this
  aligned with that"; a placed guide answers "is this where I decided things go",
  which is a question asked across a whole deck.

  **The snapping needed no change at all.** A `Guide` is `{ axis, at }` and
  `snapBox` takes a list, so a placed guide is one more item in it — the machinery
  was general before there was anything general to put through it. What the work
  actually was: where they live, and the four rules that make a list of them behave
  (rounded, dropped-if-not-a-guide, de-duplicated, and ordered so a drag can hold
  onto one). 19 unit tests, milliseconds.

  Four decisions worth keeping:

  - **On the slide, not the deck.** A reader places a guide to line up the things
    on *this* slide, and a deck-wide one would follow them onto slides where it
    means nothing. It is what PowerPoint does; the cost is placing it again on the
    next slide, which every tool that does it this way pays.
  - **A tie goes to the reader.** `snapBox` keeps the *first* of two equally close
    candidates, so putting the placed guides first is what decides a draw between
    a placed guide and a found one. Checked by identity in the test, because the
    two are structurally identical and comparing values could not tell which line
    the drag reported — and which one it reports is what gets drawn.
  - **One command, not three.** A drag out of the ruler *is* add, move and remove
    in sequence, so three commands would make one gesture three kinds of history
    entry and undo would walk back through the drag.
  - **The guide in flight is the app's.** The gesture starts in the stage (the
    rulers are there) and has to be drawn over the slide (the overlay is there).
    Neither child can see the other, and a ruler cannot draw its own preview
    because it is a strip along one edge.

  **And it found a real fault the moment the ruler became clickable.** The fit
  never subtracted the rulers: the slide was fitted to the whole pane, the ruler's
  18px column was added beside it, and the grid overflowed by exactly one ruler.
  `justify-content: center` centres tracks that overflow, so the whole grid sat 9px
  to the left — putting the right half of the *vertical* ruler underneath the
  slide's overlay, where no pointer could reach it. Measured: ruler at 240–258,
  slide starting at 249. Invisible while a ruler was only something to look at.

  The harness caught the last step, exactly as designed: `setSlideGuides` is on no
  toolbar control and bound to no key, so `every-command-can-be-reached` refused
  the product until the third way a reader reaches it — a drag on the ruler — was
  written down as an exemption.

- **Ctrl+wheel zoom: both products had it, and the better copy won.**

  The entry above this list said Slides did not have this gesture. That was wrong —
  a grep that looked for `ctrlKey` and `wheel` on the same line — and the truth was
  more useful: **both** had it, neither knew the other did, and they were not the
  same implementation. The deck's carried three measured corrections that Word's
  never had, because Word's never anchored at all.

  - **Hit-test the rectangle; do not ask what the event hit.** Word scoped its
    listener with `closest('.w-shell-document')`. A canvas draws its selection
    overlay as a fixed layer *above* the pane, so a wheel over the slide never
    reached a listener on the pane — measured, the count of events seen was zero.
  - **Anchor on the drawn content, not the scaled container.** A deck's container
    holds the hidden definitions and the gaps between slides, so its rectangle
    grows by more than the slide does: 0.8% of the slide's width per notch.
  - **Correct in a layout effect, not `requestAnimationFrame`.** rAF races React's
    commit, so the rectangle measured is the old one: 0.8% a notch again.

  `useWheelZoom` in `office-ui` is that version, with `anchorOf`/`anchorShift` and
  their tests moved out of `office-slides` — nothing about them was ever a slide's.
  **Word gained pointer anchoring** by asking for it: zooming in on a paragraph
  half way down the page no longer walks that paragraph off the screen.

  Three things this cost, each worth keeping:

  **The extraction put the drift back, and a test caught it in the same minute.**
  `content` is naturally written as an inline arrow, so it is a new function every
  render; with it in the layout effect's dependencies the effect ran on *every*
  render, and any render between the wheel and the zoom's commit consumed the
  pending correction against a rectangle that had not changed. Measured: 7% drift
  over four notches with the scroll never leaving zero. The hand-written version's
  `[scale]` was load-bearing. Neither product had a test for this gesture before —
  in either app — so the test was written first, and it earned its keep before it
  was green.

  **A test can aim at nothing and read like a broken listener.** Word's `.w-surface`
  is every page stacked — measured 7,536px tall against a 900px window — so 35% of
  it is 2,800px down the page and the pointer lands on no element at all. Zero
  wheel events reached the window, which looks exactly like a listener that was
  never attached.

  **And Word's transform was one frame late.** `ZoomFrame` wrote
  `el.style.transform` in a `useEffect`, so the box's width came from the render
  and the scale inside it arrived after — and anything measuring the page from a
  *layout* effect read the untransformed rectangle. The anchoring computed a shift
  of exactly zero and reported success. Written in the render instead, the
  transform is in the DOM at commit, which is before every effect in every subtree.
  A `useEffect` that writes a style the same render's layout depends on is a frame
  of disagreement nobody sees until something measures it.

- **The window's frame is five named regions.**

  `AppShell` / `AppChrome` / `AppBody` / `AppMain` in `office-ui`, and both apps
  are drawn in them. The measured duplication was small and worth being honest
  about — eight CSS declarations, identical in both products:

  ```css
  .w-shell / .sl-shell     { display:flex; flex-direction:column; height:100%; min-height:0 }
  .w-shell-body / .sl-body { display:flex; flex:1; min-height:0 }
  ```

  The value is not the eight lines; it is that two of them are the lines everyone
  gets wrong. `min-height: 0` on a flex child is the whole difference between a
  pane that scrolls and a pane that pushes the window past the bottom of the
  screen — the default `min-height: auto` refuses to shrink below its content —
  and `min-width: 0` on the middle region is the same fault sideways, which is
  what stops a wide table from shoving the right-hand pane off the screen.
  Neither is discoverable from the symptom, and both were written twice.

  Three decisions worth keeping:

  - **Layout only.** No colours, no padding, no borders. Those are what make Word
    look like Word and a deck look like a deck, and a frame carrying them is a
    frame with a house style.
  - **The product keeps its own class name on every region.** Not politeness about
    churn: `.w-shell-document` is what Word's ruler and its zoom *find the
    scrolling pane by*, in three places, and what five browser tests select. A
    shared frame that renamed it would break three files to save eight
    declarations.
  - **`as` and the landmarks.** A deck's chrome was a `<header>` and its centre a
    `<main>` before this existed, and a frame rendering five anonymous `div`s
    would have quietly taken landmark navigation away from both products. Verified
    on screen: `header, nav, main, aside, aside`.

  **There is no `AppFooter`, and that is the interesting part.** A deck has a fifth
  region — the timeline along the bottom — and it does not want a wrapper:
  `.sl-timeline` already carries `flex: none`, and its height is `max-height: 70%`
  *of the window*, which a `flex-none` box between them would turn into 70% of a
  box sized by its own content. So the product's own pane is the region. It was
  written, found to have no honest caller, and deleted before it shipped — which is
  the rule this file keeps stating: a component no product has drawn is a component
  nobody has checked.

  One real behaviour change went with it: Tailwind's `flex-1` is `flex: 1 1 0%`
  where the hand-written CSS said `flex: 1 1 auto`. Different flex-basis, same
  outcome for a region that is the only growing child — measured on both windows
  before and after (48 + 736 + 43 in the deck, 147 + 753 in Word) and cleared by
  both suites.

- **Three axes became one, and the clock got a step.**

  A span, ticks at a countable step, labels on some of them, a marker that can be
  dragged: this repository drew that three times — Word's ruler, a slide's ruler,
  and the timeline — with three different answers. `axisTicks` in `office-ui` is
  the one that had worked out the two hard parts, now reachable by all of them:
  count in the axis's own unit (a centimetre is 566.9 twips, so stepping in twips
  labels the third tick 2.99cm) and compare the major step with a tolerance
  (`0.5 × 6` is 2.9999999999999996, so a `%` test drops a third of the labels).

  The timeline's was the one with a defect: `ceil(span / 500)` with a label on
  every other tick, inline in a component and untested. At a sixty-second
  sequence that is 120 ticks and 60 labels — which the slide ruler's own notes
  call "a grey band rather than a scale". `timeStep(span)` picks the finest round
  length of time that keeps the labels countable, from a ladder (100ms, 250,
  500, 1s, 2s, 5s, 10s, 30s, 60s) rather than by arithmetic, because a *round*
  length of time is a convention: 250ms is round and 300ms is not, the same way a
  clock face is quarters and not thirds.

  **A correction worth keeping.** The first version of this claimed the old step
  "did not change when the axis was magnified, which is the one thing magnifying
  is for" — and that was wrong: magnifying keeps the span and spreads it over more
  pixels, so the step had no reason to change. But reading the code to check the
  claim found the real version of it: the budget is labels *per pixel*, so an axis
  drawn at four times the width of its pane has room for four times as many
  numbers. `timeStep(span / magnify)` — and magnifying now does something to the
  scale rather than only to the spacing.

  Which broke an existing assertion, correctly: the magnify test checked "the same
  seconds" by comparing the tick *labels*, a proxy that stopped being one. It
  checks the intent directly now — the axis still ends where it ended — and the new
  behaviour beside it.

  `office-slides/src/ruler.ts` is gone. Nothing inside that package had ever called
  it; only the app had, which is what made the move free.

- **What the stage is showing is one question now.**

  A slide's animation is watched four ways — presenting, stepping back through a
  show, previewing in the editor, dragging the playhead — and the app held one
  variable per way, three of which meant the same thing:

  ```ts
  const at = presenting ? played : scrubbing ? pressShown : previewAt;
  ```

  Then everything downstream repeated the mode test to know what to do with it:
  `scrubbing ? at - 1 : at` for what is still hidden, `presenting && settled ?
  step.endAt : undefined` for where to hold, `presenting && settled ? [] : started`
  for whether sound plays. Four mode tests, in a 1,100-line component, and not one
  of them checkable without presenting a deck in a browser.

  `showing(where)` is that question in `office-slides` — 12 tests, milliseconds —
  and the two rules it now states out loud are the two that are easy to get wrong:

  - **Scrubbing counts one press fewer as played.** A reader dragging through press
    3 is watching press 3 *happen*, so what it brings on must not already be on
    screen; a presenter who has clicked three times has finished press 3. Off by
    one either way and a shape is either missing or already there before the
    animation that brings it in.
  - **Going back holds; it does not replay.** The press gets the same animations
    seeked to their end, and its films and sounds are *not* started — a film that
    has been watched does not play again when the presenter steps back past it.

  It also made the transport's design legible: nothing in the function knows that a
  pause happened. Pausing sets the playhead and clears the run, which is a state
  that already had a meaning — so a paused deck and a dragged playhead are the same
  answer, and frame-stepping is scrubbing by another name.

  The state itself is still twelve `useState`s and that was left alone on purpose;
  the reason is in the open list above.

- **The subscription every panel needs is one subscription now.**

  Six files were hand-rolling it — five in Slides, one in Word — with the counter
  byte-identical and **the events different**: Slides listened to
  `selection.model`, `selection.change` and `content.change`; Word listened to two
  of the three.

  The measurement that made it a bug rather than a tidy-up: `updateSelection(null)`
  emits **only** `editor:selection.change`. The model event is for a selection that
  *is* something; a selection cleared is announced on the other one and nowhere
  else. And `office-word/src/table-commands.ts` clears the selection when
  `deleteTable` succeeds — so Word's ribbon had a path where it keeps describing
  cells that no longer exist, from a lesson Slides had already learnt and written
  down in its own copy. **A duplicated subscription means the fix lands in one
  copy**, and this one had been sitting in the other for months.

  It drifted the other way too, and there Word was right: Word bumped the counter
  once *after* subscribing and Slides did not. That is not a wasted render — a
  document is loaded asynchronously, so `content.change` can be emitted between a
  panel's first render and its effect running, and an event nobody is subscribed
  to yet never arrives. Slides' five panels gained that.

  Two names with no arguments rather than one with an option, because the only
  reason to want the narrower one is cost, and a caller that can half-choose is
  exactly how six copies ended up listening to three different subsets.

  **And it was put in the wrong package first, which is the more useful lesson.**
  The first version was `useEditorRevision(editor)` in `office-ui`: it took an
  `Editor` and named the three events. That reads as sharing and is a layering
  mistake — `office-ui` is *pure UI*, and a component or hook that knows how the
  host announces its state is one the host cannot reuse. Corrected into three
  pieces, each where its knowledge actually lives:

  - **`useRevision(subscribe, deps)`** in `office-ui` — counts, and has never
    heard of an editor. Takes a subscribe function and returns a number.
  - **`watchAnswers` / `watchContent`** in `editor-core` — *which* events mean an
    answer could be different. This is where the bug belonged all along: the panels
    were guessing at the editor's own event semantics, and the editor never said.
  - **One line in each app**, where both are in scope. Duplicated in two apps
    deliberately: what could drift was the event set, and that is now one constant
    in `editor-core`, so the copies cannot disagree about anything. A third caller
    is the data point that would justify an `office-react` package.

  Taking `Editor` out also took away `office-ui`'s last import of it — see the
  chrome section. A shared-UI package with no dependency on the document layer is
  the version of "shared" that a page builder or a design tool can actually use.

- **The suite's icons are a package, keyed by the act.**

  Two steps, and the first was the one with the finding in it.

  **The table was keyed by control id** — `slide-new`, `look-banded-rows`,
  `duplicate-boxes` — which meant the *shared* chrome held both products'
  vocabularies and a third would have added a third. Re-keyed to the act:
  `add`, `duplicate`, `delete`. That merged three entries the ids had kept apart
  (a slide and a shape are deleted by the same act; the highlighter's colour is
  the highlighter) and split one they had conflated (`first-column` and
  `frame-row` share a drawing and are not the same idea). 83 entries became 80,
  and all 104 toolbar-model entries name an act.

  The re-key was done twice, because the first pass was wrong in a way that
  passed: a regex matching `id: … icon: …` with DOTALL paired a **group's** id
  with its first control's icon and skipped 18 controls silently. A scripted
  edit that finds fewer things than there are does not fail — it succeeds on the
  subset.

  **Then `@barocss/office-icons`.** The value is the boundary, and it is only
  visible from outside: an editor that wants the suite's pictures should not have
  to take `office-ui` to get them — four Radix packages, a colour picker, and a
  token stylesheet, none of which is needed to draw a plus sign. `office-ui`
  re-exports `Icon`, so nothing that already imported it changed.

  What it found on the way out: **`lucide-react` was imported in six files across
  three packages**, so the library was six files' worth of a decision. It is one
  now, and the three packages that no longer draw an icon no longer depend on it.
  Routing those five files through the table also meant naming the chrome's own
  *furniture* — `close`, `open`, `chosen`, the zoom's three, the comment thread's
  four — which are not acts and belong in the table for exactly the same reason.

  And the sweep found the letters. Two side panes had never been swept because
  nothing asked: the outline strip drew `☰`, the comments strip drew `💬`, and
  both panes' close buttons drew `×` — a multiplication sign at whatever weight
  the body face has, beside a ribbon of drawn icons. There is a test for the
  panes now, and it asserts it *looked at something*: a list of buttons that came
  back empty would have satisfied the old assertion while proving nothing.

  One drawing changed twice over, for a reason worth keeping: **`previous`/`next`
  and `move-up`/`move-down` were the same picture**. Walking a document and
  reordering a thing in a list are different acts, and one picture for two ideas
  is the fault this table exists to prevent — so walking is a chevron (only the
  view moves) and reordering is an arrow (the thing moves).

- **A slide has a ruler.**

  The interesting part is not the ticks, it is the **step**. A ruler is only
  useful if a reader can count it, which means the step is a round number of
  *their* unit and not of twips: one centimetre is 566.9 twips, so a ruler
  stepping in twips draws ticks at 566, 1133, 1700 and labels the third one
  2.99cm. `slideTicks` counts in the unit and converts per tick.

  Two things it ran into:

  - **The label test needs a tolerance.** `0.5 × 6` is 2.9999999999999996 in
    binary, so a major-tick test by `%` skips the 3cm label on a third of the
    ticks. Compared with `1e-9`.
  - **The step could not live where the ticks do.** `slideTicks(length, unit)`
    would not compile: `office-slides` is a model package and `LengthUnit` is the
    chrome's. Split — `office-ui` owns `rulerStep(unit)` (which numbers to count
    in, a judgement about how many labels fit across a slide) and `office-slides`
    owns the counting. The boundary did the arguing for us.

  And two browser faults that only a browser shows: the vertical ruler sat 46px
  out because `.sl-stage-frame` centres itself with `margin: auto`, and the
  pointer marks never appeared at all — the overlay covers the slide, so the
  stage never sees a `pointermove`. A window-level listener.

- **A drag says what it is doing.**

  It said nothing, so a reader resizing a box to a size had to let go, read the
  panel, and try again — twice per attempt. The arithmetic was already there: the
  drag's preview **is** the box it would write, so this is a label, not a
  calculation.

  Which number depends on the gesture, because that is what the reader is asking:
  a move is about *where* (`5.67cm, 7.41cm`), a resize about *how big*
  (`30.14cm × 4.23cm`, the way Figma writes it), a turn about *how far round*
  (`65°`). One badge for a selection of six rather than six overlapping labels —
  the gesture is one thing.

  And it moved a piece of state: **the unit is the app's now**, not the properties
  panel's. It was the panel's own `useState` and that was right until a second
  thing had to say a length; a badge reading millimetres beside a panel reading
  centimetres is two answers to one question, which is the same fault as the zoom
  box that disagreed with the screen. The same rule the zoom and the pane height
  already follow: *how a reader has set up their window is the app's.*

- **A right-click does something.**

  It did nothing — measured, zero menus in the document, so the browser's own
  appeared instead and offered "이미지를 다른 이름으로 저장" over a shape. Every
  command it needed already existed; what was missing was the menu.

  Three decisions worth keeping, and one bug the change walked into:

  - **The list is a model.** `slideMenu(target)` in `office-slides` — which items
    for which selection — because *what* a reader can do to a selection is a fact
    about the document, and a menu assembled inside a component would be a second
    answer to the question `toolbar-model.ts` already answers. Eight unit tests,
    milliseconds.
  - **Offered and disabled, never missing.** Whether each item *can* run is the
    command's own guard, asked once through `canExecuteCommand`. An item that is
    greyed out teaches a reader it exists; an item that is absent teaches them it
    does not.
  - **A right-click selects what it found** unless that is already selected —
    every tool does this, and the reason is the sentence a menu has to finish:
    "delete **what**". A right-click inside a selection leaves it alone, so a menu
    can act on six shapes.
  - **And the chords come from the keymap.** `⌘D` beside 복제 is teaching; a stale
    chord would be worse than none, so `shortcutOf` reads the one table that binds
    them.

  **The bug:** the menu is opened by the canvas overlay, because that layer is
  what knows *what was clicked* — and the overlay had just been given a
  `clip-path`, so a menu near the slide's bottom corner was **cut away and could
  not be clicked at all**. A child of a clipped element is clipped with it. It is
  a portal into the body now, which fixed positioning made free anyway, and that
  removes the whole class of "some ancestor clips or scrolls this".

  Hand-rolled rather than Radix, deliberately: Radix's context menu owns the
  *trigger*, and what is being right-clicked here is a canvas where the target is
  hit-tested against the model rather than read off an element.

- **The empty timeline was taking a quarter of the window — and the zoom box was
  lying about what it drew.**

  Audited the chrome against the tools this is measured against, starting by
  measuring rather than by listing opinions. The first finding was not a missing
  feature: on a 1440×900 screen the timeline pane held **240 pixels — 27% of the
  window — for the sentence "이 슬라이드에는 애니메이션이 없습니다"**, and that is
  why a slide drew at 57% when there was room for 69%. An empty instrument taking
  a quarter of the window is the difference between a tool and a demo of one.

  So the pane's default follows the slide: a strip (43px) with nothing to draw,
  open the moment the slide has a step — which is also the moment the reader wants
  it, because the gesture that made the step was about time. A reader's own fold
  **wins** from then on; a pane that reopened itself after being folded would be
  arguing with the person using it.

  **And that uncovered the real bug.** The zoom box read the slide's own box
  through a `ResizeObserver`, and it cannot work: **a slide is scaled with a
  `transform`, and a transform is not a resize.** The observer fires when the pane
  takes room from the stage, reads the slide *before* the new scale is applied, and
  is never told again — so the box said 57% while the screen drew 69%, until some
  unrelated render came along. Measured in all four states, then again after the
  fix:

  ```
  before   pane open 240px   slide 732px   box 69%   ← disagrees
  before   folded     43px   slide 888px   box 57%   ← disagrees
  after    pane open 240px   slide 732px   box 57%
  after    folded     43px   slide 888px   box 69%
  ```

  The stage computes the scale, so the stage reports it — forty lines of DOM
  measurement deleted. Which is what the comment there always claimed ("read back
  from the stage, so the number in the box is the number on the screen") and now
  literally is, rather than a second measurement hoping to agree with the first.

- **Three more filters, and they really were a row each.**

  The claim the SMIL seam made when it was built was that the next filter would be
  a table row. Tested by adding three: `thickenIn` and `thinOut` (an
  `feMorphology` erode run backwards and forwards — text swelling into place, text
  thinning away) and `shimmer` (`feTurbulence`'s `baseFrequency` moving while the
  displacement stays small, so every pixel shifts a little and nothing shifts
  far). No change to the seam, the cost table, the timeline or the stage: the tier
  comes from *having* a filter and the clash from writing `filter`, both already
  read from the definition rather than from a list of names.

  The detail worth keeping is the one that only a projector would have taught:
  **the static attribute has to equal the animation's first value.** A morphology
  whose `radius="0"` while its animation starts at 2.8 shows one frame of the
  untouched shape before the SMIL clock starts. Now asserted for all three by a
  regex over the markup, which is cheaper than seeing it.

  And measured rather than assumed, because a filter that attaches and does
  nothing looks exactly like one that works: dark pixels inside the shape, over
  one run of `thinOut` — **5925 → 2997 → 1174**. It really erases.

- **The pane says when a trigger's button can be pressed.**

  A trigger waits for a *shape* rather than for a press, and a shape that has not
  arrived yet cannot be clicked — it is hidden, so it is not hit-testable. True,
  correct, and invisible: a reader who puts a trigger on a box that arrives on the
  second press has built something that does nothing for the first two clicks and
  no way to find that out.

  Both halves were already in the pane — what is on the slide after N presses, and
  how many presses there are — so this is arithmetic (`triggerWindow`) and a
  sentence, not a feature. What the arithmetic makes obvious is that the answer is
  a **range** rather than a moment: a shape can leave again, so a trigger on a box
  that exits on press 4 is clickable from 2 *until* 4 and never after. And there is
  a third answer worth having: **never**, for a shape that is itself waiting to be
  clicked — two triggers waiting for each other, which is a deck built wrongly and
  now says so.

  Said only when there is something to say. A shape that is on the slide from the
  start gets no note at all, because every note a reader learns to ignore costs the
  next one its meaning.

- **Two shapes named in one tick used to get one name.**

  `_freeShapeName` counts the `shape-N`s in the document and takes the next
  number, which is exactly right and cannot survive two commands in the same tick:
  the second reads the document the first has not committed to yet, and both come
  out `shape-1`. Two shapes with one name is a motion step that animates whichever
  the timeline finds first — a fault that surfaces as "the wrong shape moved" long
  after the click that caused it.

  The number is remembered as well as read now: the next name is past both the
  document and the last answer this session gave out. Which makes names **sparse**
  after an undo (`shape-1`, `shape-4`) and that is the right trade — a name has to
  be unique, not dense.

  **And the fix uncovered a bigger one.** With the naming fixed, the same two
  commands still produced *one* step instead of two — because with no track on the
  slide yet, both transactions create one and the second replaces the first. So the
  naming was the visible symptom of a read-then-write race, and the rest of it is
  logged as its own item: it wants commands serialised or a create-if-absent that
  is safe to run twice, which is the engine's question rather than this product's.
  The test written for the naming says so out loud, by making the track exist first.

- **The popover no longer eats the click — and it stopped doing so without anyone
  fixing it.**

  Went to fix a logged fault (a colour panel that closed on a pointer outside took
  the reader's click with it, so pressing 미리 보기 with the picker open closed the
  picker and did not start the preview) and measured it first. In the exact
  scenario the entry names — a glow step, the inspector's 모션 색 picker open, one
  press of 미리 보기 — the picker closes **and** the preview runs: one click, one
  listener call, `data-playing="true"`.

  It went away when the three copies of the dismiss logic became one
  (`useDismiss`); the old ones did something extra that cost the click. So the fix
  for this entry is a *test*, not code — the behaviour was unheld, which is the
  same as being luck. Two things worth keeping from it:

  - **A fixed fault is not fixed until something holds it.** This one had been
    fixed for a day and nothing said so.
  - **Read the entry, then measure the entry.** The cheapest work in this session
    was the piece that turned out to be already done, and the only way to find that
    out was to reproduce it rather than trust the note.

- **Five flaky tests, and what made them flaky was the same sentence every time.**

  Four full runs in a row each failed exactly **one** test, a different one each
  time — the transport's rewind, a build restored after a show, an echo trail, the
  running playhead, the scrubbed playhead — and every one of them passed alone and
  repeated. That pattern is not a product fault, it is a *test* fault, and the
  shape of it was identical in all five:

  ```
  await page.waitForTimeout(500);          // hope the animation got there
  expect(await moment(page)).toBeGreaterThan(0);
  ```

  A fixed wait before an assertion is a race with whatever else is running, and
  what was actually being waited for was readable in every case: an animation's
  `playState`, a shape's visibility, a clock that only goes up. All five are
  `expect.poll` now, on the condition itself.

  Two distinctions worth keeping, because "no sleeps" would be the wrong lesson:

  - **A sleep before a *gesture* is fine** — waiting for a command to land before
    pressing the next button races nothing. A sleep before an assertion about
    something **still moving** is the bug. And the one that can never be a poll is
    "nothing happened": `expect(await turned()).toBe(before)` has no condition to
    wait for, so polling would pass on its first read and prove nothing. Those wait
    on purpose.
  - **A poll's timeout is a ceiling, not a delay.** Raising one from 3s to 8s is
    not the dishonest fix a longer sleep would be: nothing waits for it once the
    condition holds, and it only has to outlast the worst start-up under load.

  **And then the failures moved.** With the five fixed, two runs failed two
  *different* tests — a turned shape's transform, a fill's eye — each of which
  passes alone, in its own file, and six times in parallel. So the five were worth
  fixing on their own terms and they were not the whole story: what is left is not
  five flaky tests but a suite of 188 with 318 sleeps in it, run on a machine that
  was also running Word's 329.

  One suspect was measured and **cleared**: the new `:has([data-bc-filler])` rules
  for the placeholder prompt, which have to be re-evaluated whenever anything
  inside a text frame changes and are exactly the kind of selector that makes
  typing slow. Timed with the rules on and off — 20 Korean characters typed in
  551/522ms against 431/505ms, forced style recalc 0ms either way. Overlapping
  noise, no cost. Worth writing down because the *next* person to see wandering
  failures will suspect it too.

- **A deck a reader can start — and the engine could not draw it.**

  The app could save a deck and open one, so the only way to begin your own was to
  delete somebody else's slides out of the sample. What a new deck *is* turned out
  to be the easy half: one title slide, plus the definitions a first edit needs —
  a theme (so `theme:accent1` resolves), a master to inherit from, and the layouts
  a new slide is made from. An empty document is not an answer; it is a white
  rectangle with nothing to click.

  **Then it did not draw.** Measured: after 새로 만들기 the model held one slide and
  the DOM held the previous five, and an explicit `view.render()` changed nothing
  at all. The fault is four lines in `editor-view-dom`:

  ```
  // No tree passed: prefer last rendered tree … so we don't replace it with empty editor document
  if (this._lastRenderedModelData) modelData = this._lastRenderedModelData;
  ```

  Which is *right* for an edit — the last tree is a **proxy** over the store, so
  every change appears in it without exporting anything again — and wrong for a
  replacement, because a proxy is live for **its root** and `loadDocument` makes a
  new one. So the view was pinned to the first document it ever drew, permanently,
  and every product that opens a file has been getting away with it for one
  reason: an identical tree reloads to identical sids, so the DOM happened to
  match. A *different* document is what breaks it.

  The fix needed one more thing than the obvious comparison, and the comment above
  is what said so: the last rendered tree is only stale if it came **from the
  editor**. A caller-supplied tree is the caller's — the layer tests render one by
  hand into an editor with no document, and preferring the editor's there drew an
  empty document over their content. Provenance is not written in a tree, so that
  one *is* a flag, and it is the only thing here that could not be read.

  And a **second** captured root, one layer up: the environment the renderers
  resolve formatting against held the root id from the moment the app mounted, so
  the new deck's title drew in `system-ui` where the sample's draws in Georgia —
  the theme and the master were being looked for under the old document's root.
  `rootId` is a getter now rather than a value: making it a *question* instead of
  an answer is the whole of that fix, and it is the same lesson as the one above.

  A smaller thing worth keeping: **the prompt in an empty placeholder is drawn
  from the DOM, not from the document.** An empty run renders a marked zero-width
  filler, so `:has([data-bc-filler])` is "this placeholder has nothing in it" as a
  fact a stylesheet can see — no attribute, no renderer change, and it disappears
  on the first keystroke because the filler does. Sized at 40px rather than 14,
  because the stage scales the whole slide and 14 came out at eight on screen.

- **A film is trimmed by dragging its bar, and the decision was which edge means
  what.**

  A bar's edges mean *when* and *how long* everywhere else on this axis. A film's
  do not: what a film's bar is as long as is the part of the **file** that plays,
  which is an attribute of the film and not of the step. So the question this was
  waiting on was not how to drag anything — it was what a play step's edges are
  allowed to mean.

  Every video editor answers it the same way and answers **both at once**: the
  head dragged in makes the clip start later *and* begin further in, so the frame
  under the pointer stays still and the tail does not move. Which is expressible
  here exactly — `delay += Δ` on the step, `trimStart += Δ` on the film — and it is
  the reading a reader who has ever trimmed a clip already knows. The alternative
  (the left edge moving while the right edge slides left) is a bar that shrinks
  from the end nobody is touching.

  Three things worth keeping:

  - **The tail is where a film *gets* an out-point.** `0` means "to the end"
    because a file's length is not in the document, so the first drag of the tail
    is the moment the deck learns a length — the one the reader dragged to. Which
    is why the arithmetic takes a *length* rather than a point: the bar's width is
    what the reader is holding.
  - **One gesture, one undo.** The trim is on the film and the delay is on the
    step — two nodes — so the head drag is one command writing both. Two commands
    would be two entries in the history that each undo half of what happened.
  - **Three clamps, all reachable with one flick**: never before the first frame,
    never before the press it plays in, and never past its own out-point. Measured:
    dragging the head to the far right of the axis leaves a quarter-second of film
    rather than an inverted one.

- **Backwards through a show — and the two faults it uncovered were worse than
  the thing it was asked to fix.**

  Stepping back was supposed to un-play one press. Measuring it first turned up
  three separate things, and only one of them was the missing feature:

  ```
  back into the previous slide   0 / 2, both shapes hidden      ← a blank slide
  press 1  the shape flies out   translate -65%, opacity 0
  press 2  …and it comes back    opacity 1                      ← the exit stopped holding
  a shape whose one motion is 날아가기                          ← invisible from the start
  ```

  The comment in `present.tsx` said Back "goes back to the previous slide with
  everything on it, which is the reading a presenter who has lost their place
  actually wants". It went back to the previous slide with **nothing** on it — the
  presenter's key set the press to zero — so the sentence describing the deliberate
  choice was describing something the code did not do. Worth remembering as a
  failure mode of comments: this one was *load-bearing* and wrong.

  The exit was the real bug. An exit held its end state through its own animation
  (`fill: both`) and the next press does not run that animation, so a shape you
  animated away reappeared on the next click. And its mirror: every build's target
  was hidden until it played, with `fadeOut` excused **by name** — one of the four
  exits this product has — so a shape whose only motion was 날아가기 was invisible
  from the moment the slide arrived. Both are one sentence now: what is on the
  slide is decided by **the last step of that shape's that has played**, and what
  counts as an exit comes from the effect table rather than from a name.

  **Nothing new had to be built for "backwards".** A press arrived at backwards is
  handed its own animations *seeked to their end and held* — `seekTo`, the same
  mechanism the playhead uses to look at a moment. So Back is a state rather than
  a run, which is what it is in every tool, and the stage learned nothing.

  The last one was a two-halves-disagreeing bug of the kind this repository keeps
  finding: an effect keyed on "the slide changed" set the press to zero, because
  arriving at a slide from the rail or the filmstrip *does* mean starting at its
  beginning. A press now says which slide it belongs to, so a deliberate one is
  not an arrival to reset.

- **The chrome stopped drawing its own controls — and the stylesheet was the
  half nobody was counting.**

  Thirteen more hand-rolled controls migrated (the shell's four, the properties
  panel's five, the notes' one, the file row's three), one new primitive, and the
  ratchet down from 34 to 21. The primitive is the interesting part and so is the
  fault:

  **`FilePick`**, because `<input type="file">` is the one form control a product
  cannot style — it draws its own button, in the browser's language, and no rule
  reaches it. So every app on the web hides the input, draws a real button, and
  clicks the input from it; and every app gets the same detail wrong the first
  time: **an input keeps its value, and `change` only fires on a change**, so
  picking the same file twice is one opening and then silence. That is three lines
  and a comment that should exist once.

  **And the same fault one level in.** `office-ui` itself had two copies of its
  number field: `PropertyNumber` and `NumberField`, the same `key`/`defaultValue`
  trick, the same "an emptied field means leave it alone", the same Enter that has
  to be *prevented* rather than merely stopped — and `controls.tsx` even claimed
  they were "the same code rather than a second copy of it", which was true of the
  rule and false of the code. The panel row delegates now, and the lesson that took
  a browser to find (Enter's pending `beforeinput` splitting the paragraph inside
  the box being resized) lives in one place. What a row genuinely wants differently
  turned out to be two things and both are now parameters: two decimals, because a
  third decimal of a centimetre is noise — and *not* fewer, because 125ms shown in
  seconds is `0.125` and rounding that to `0.13` would write 130ms back.

  `DialogButton` was the other one: a hand-rolled button whose primary tone was
  `bg-sky-600`, the only place in the package that named a colour instead of
  `--ou-accent`. So a product that mapped the token got a dialog disagreeing with
  its own toolbar. It is `Button` now, one size up, and the size is the only
  difference that stayed.

  **The fault: a file can reach zero on the ratchet and still draw its own
  controls.** `.sl-topbar-actions button` was four rules of this app's border,
  padding and radius — and as a descendant selector it beat every class
  `office-ui` could put on its own button, so the *shared* buttons in that row were
  drawn in this app's language too. The count was measuring the JSX and the CSS was
  quietly undoing it. Both files' worth of rules are deleted; a control that needs
  tuning is tuned through `className`, where `tailwind-merge` settles it at the
  call site rather than whichever stylesheet loaded last.

- **A shape's fills are drawn as elements, and three walls fell at once.**

  A stack of paints fits in `background` exactly until a reader wants to do
  something to **one** of them. Three things were waiting on this, each measured
  and none of them a matter of taste:

  ```
  background-size: calc(100% * 1.4)   a different fit, not a nearer view — no numeric `cover`
  opacity on a picture fill           drawn as a fully transparent wash: a no-op, at full strength
  two photographs cross-fading        not expressible in `background` in any form
  ```

  The middle one is the embarrassing one: the panel has had an opacity control for
  every fill, and on a *picture* it did nothing at all. An element has `opacity`,
  `translate` and `scale` — all three animatable, two of them composited — so the
  Ken Burns zoom, a real per-fill opacity and a cross-fade arrive together with one
  change. Which is why it was worth waiting for rather than special-casing the
  zoom.

  **Where the layers go was the measurement.** Behind the shape's own content,
  which for a text frame means behind real editable paragraphs. Sampling pixels of
  a red layer against black text:

  ```
  z-index: auto                     red 35502, text    0    the fill covers the text
  z-index: -1                       red     0, text 5688    invisible — the same as no layer
  z-index: -1 + isolation: isolate  red 28598, text 5882    correct
  ```

  The middle row is the trap: a negative-`z` child of a box that is **not** a
  stacking context is painted in the nearest ancestor that is — the slide — whose
  own opaque background then covers it. The alternative was a wrapper around the
  content, which would have put a `<div>` of this product's between a text frame
  and the paragraphs Word's renderers draw. A painting problem is not a reason to
  reshape the editable tree.

  Two more things fell out, both of which changed something written down:

  - **The registrations had to start inheriting.** A track is animated on the
    shape and read *inside* it now, and with `inherits: false` the image's own
    computed value is the initial one — measured, the variable reached 1.32 on the
    shape while the picture stayed at exactly 1. `inherits: false` was there for a
    reason, though (a track on a frame would turn every gradient inside it), so the
    bleed is stopped where it happens instead: **a shape that draws layers declares
    its own neutrals**, and an element's own animation still beats its own inline
    declaration. Measured, because a cascade is worth checking:

    ```
    ancestor animating                       child 2, picture 2
    child declares the neutral               child 1, picture 1   ← the bleed stops
    child declares it and animates its own   child 3, picture 3   ← its own still wins
    ```
  - **The pan changed its neutral from `50%` to `0%`.** A background's position is
    where the picture *sits*; an element's `translate` is a move from where it is.
    The track kept its name and changed its meaning, which is the kind of change
    that deserves the comment it got: a step written against the old neutral would
    jump the picture half a box on its first frame.

  And two lines held: one opaque solid is still the box's own `background` (a stack
  of one colour is not a stack, and there is nothing an element would buy), and a
  *tiled* fill is still a background because `object-fit` has no repeat.

  What it cost: ten browser tests that had been asking the box what it was painted
  with. They ask the layer now, through one helper — which is the honest shape of
  the change, since "what is this shape painted with" genuinely has a different
  answer. `backgroundLayers` and its four parallel comma lists are deleted rather
  than left beside the new path — a fill drawn two ways is a fill that can
  disagree with itself. `backgroundCss` stayed, because a swatch in the panel
  really is one paint in a small square.

- **The canvas gradient editor, finished — and one gradient, one selected stop.**

  Three gestures the two-point model made possible, and one fault it exposed.

  **Sliding the whole gradient** by its line: both ends by the same delta, which
  could not be expressed while a gradient was an angle. The interesting part is
  that one element now serves a *drag* and a *double-click*, and the two get along
  only because the drag has a threshold — two quick clicks travel nothing, so they
  write nothing and the `dblclick` adds a stop. Two attempts before that worked:
  `preventDefault()` on `pointerdown` suppresses the compatibility mouse events, so
  the double-click stopped adding stops the moment the drag existed, and the
  pointer capture took the editor's dismiss check with it.

  **One selected stop.** This was the fault: a gradient has one and *three* places
  held it — the panel's bar (`useState(0)`), the overlay (`stopPicked`) and nothing
  joining them. A reader clicked a dot on the shape and the picker went on editing
  a different stop. It is the app's now, beside `paintEdit`, for the same reason
  that is: a gesture spanning the panel and the canvas is one piece of state or two
  halves that disagree.

  **A radial's ellipse**, with what CSS actually allows, measured:

  ```
  radial-gradient(circle at 30% 60%, …)              ✓ a centre a reader can move
  radial-gradient(ellipse 80px 30px at 30% 60%, …)   ✓ two radii
  radial-gradient(ellipse 40% 25% at 30% 60%, …)     ✓ radii as percentages
  radial-gradient(… at 50% 50% / 30deg, …)           ✗ rejected — no rotation
  ```

  So a radial gets a centre and two radii and stops there; the **rotated** ellipse
  Figma draws is a wall in CSS, not a gap here. The radii come out of the same two
  points — `from` is the centre and `to` the corner — so a radial needs no
  attribute a linear does not have, and switching between them keeps the placement.
  Two handles rather than one, because `to` is a corner and one handle would drag
  both radii at once.

  And the thing that took three tries: **which of three overlapping controls takes
  the press.** For a radial, the last stop, the linear's aim handle and the
  horizontal-radius handle all wanted the same pixel — `elementFromPoint` there
  answered "stop 1", so dragging the radius moved a colour. The aim handle is now
  linear-only, the radius handles are drawn *after* the dots, and both are pushed
  out past them the way the linear's ends are.

  A smaller one worth keeping: `0.8 − 0.5` is `0.30000000000000004`, which reaches
  no drawing (the CSS output is two decimals of a per cent) and reaches every
  *comparison*. Rounded where it is derived, for the reason the `twip` helper two
  hundred lines above already gives.

- **A gradient runs between two points, and can be edited where it is drawn.**

  Four items off the Figma audit, in one pass. The last is the interesting one:
  **a gradient's shape stopped being an angle.**

  An angle runs across the whole box, centred, with its length derived
  (`|w·sin a| + |h·cos a|`). So "it starts a quarter of the way in and ends past
  the edge" — most of what anybody does with a gradient in Figma — could not be
  said, only approximated by moving the stops, which is a different thing: it
  changes where the *colours* are and not where the gradient *is*, and the two come
  apart the first time the shape is resized.

  Measured before choosing how: **CSS has no syntax for two points.** The obvious
  route — paint the gradient into a smaller `background-size`/`position` layer —
  places the axis exactly and is *transparent outside that layer*, where CSS and
  Figma both hold the end colour. What works is arithmetic: project the reader's
  segment onto CSS's own axis and squeeze the stops into the part it covers. The
  picture is right, the colours hold outside it, and the declaration stays one
  `linear-gradient`.

  Decisions worth keeping:

  - **Fractions of the box, not twips.** A point at `{0.25, 0.5}` is a quarter
    across whatever size the shape becomes. The motion path chose the opposite for
    the opposite reason — a journey is a distance, not a proportion.
  - **The angle goes when the points arrive.** Holding both would be two answers
    to one question, and the reader who dragged the handle has just said which.
  - **Clamping is a *write* rule, not only a read rule.** The overlay wrote the raw
    fraction and a drag to the far side of the slide put `x: 2.48` in the document
    — two and a half box-widths out. It drew fine, because the read clamps; the
    document was the casualty, and it round-trips through a file.
  - **The end handles sit just outside the segment.** A gradient's first stop is at
    its start, so the square and the dot landed on the same pixel and the handle
    swallowed the stop — measured, the first stop could not be dragged at all. (The
    far end had always had this and nobody had tried it.)

  And three smaller ones, each a gesture moved to where the reader is looking:

  - **Stops added and deleted on the canvas** — a double-click on the axis, Delete
    on the picked dot. `addStop`/`removeStop` are the model's, shared with the
    panel's bar, because it is one gesture in two places. The refusal below two
    stops matters twice over: on the canvas, a Delete that cannot do what it means
    must not fall through to deleting the shape.
  - **Flip**, which every drawing tool has and this one did not. Two attributes
    rather than a negative width, because every reader of a box assumes a size is a
    size; the mirror goes *after* the rotation in one `transform`, so a flip never
    changes the turn a reader typed; and it is a **toggle per box**, because with
    one mirrored shape and one not, "flip" means mirror each of them — every tool
    means that, and so does the word.
  - **The stacks say when a selection disagrees.** A number can be blanked and a
    list cannot: "these two have no shared fills" is not a list, and an empty panel
    would hide the rows a reader is about to replace. So the rows are one box's and
    a note says so — Figma's *Mixed* chip, in a sentence — and editing writes to
    all of them. The comparison is of the **read** rather than the attribute,
    because two documents can hold the same fill with its keys in a different
    order.

- **The properties panel stopped lying about a selection.**

  Found by auditing the two panels against Figma, and it was a *fault* rather than
  a gap. Measured with a 6000-twip rectangle and a 2000-twip ellipse both selected:

  - the panel showed **10.58cm** — the rectangle's width, presented as the
    selection's;
  - typing a width changed the rectangle and **left the ellipse alone**.

  The controls had been ready for this since Word's ruler: `PropertyNumber`'s own
  comment says a `null` value is drawn as an empty field with a placeholder so that
  *committing* it is a no-op rather than setting both to zero. **Nothing had ever
  passed it one.** A primitive that knows something the panel never asks is the
  same fault as a schema attribute nothing reads.

  Four decisions, each measured after:

  - **`null`, not the first value.** A panel showing one of two values applies it
    to both the next time anything else changes — a reformat nobody asked for.
    Agreement is a state of its own (`agreed`/`agreedAttr`, in the model, so the
    overlay gets the same answer).
  - **One transaction, one undo.** Six shapes retyped once is one thing a reader
    did; six undo entries to get back is the ruler's mistake one level up.
  - **The attributes are computed per box, not once.** What a box accepts is what
    it *declares*, so a mixed selection writes the corner radius to the rectangles
    and skips the ellipses — measured, the ellipse never gained the attribute at
    all. Which also means the row is **offered** whenever *any* of them has it;
    greying it out would answer a question nobody asked.
  - **The heading says how many.** Fields that change six things under a heading
    naming one shape is exactly the surprise this was about.

  What the audit also found, and did not fix: the timeline pane had this **right
  all along** — "6개 선택", and a length typed there changes six. Two panels in one
  app disagreeing about what a selection means is the §3a failure shape again,
  inside a single product.

- **The paint stacks are a shared list control, and no component draws in
  Tailwind's greys any more.**

  The next one off the ratchet, and the one that was waiting on a *primitive*
  rather than on effort. A fill row and an effect row are the same row — a grip,
  the thing, an eye, a delete, and an editor that opens from the swatch — and this
  repository had it **twice** with a third coming (a layer panel). Twice is a
  coincidence; three times is a component nobody wrote.

  `StackList`, `StackRow`, `useStackOrder` and `useDismiss` are in `office-ui`
  now, and the two browser measurements the local copies had learned went with
  them, because neither is visible in the code:

  - **The dismiss host is the whole row, not the editor.** With the ref on the
    editor alone, pressing the swatch to *close* it was two events fighting — the
    pointer landed outside the editor, which dismissed it, and then the click
    toggled it open again. A reader saw a panel that would not close.
  - **An editor can have handles somewhere else.** A gradient's axis is dragged on
    the *slide* while its row is open, so "a pointer outside this row" closed the
    editor and unmounted the handles in the capture phase, before React's
    `pointerdown` reached them. Hence `keep`, which is how the panel half knows
    about the canvas half — `[data-paint-canvas]` at this call site.

  `useDismiss` was the **third** copy: `ColorField` had one too.

  Then the rest of the palette. Every component in the package drew with
  Tailwind's own greys, so the tokens only fixed the controls written that day —
  measured in the paint panel, 40 controls with **five** border colours and one
  stray `oklch(0.87)` on the unit picker. Now: one grey, `#d8dce4`, the deck's own,
  and zero `neutral-*` classes left in `office-ui`. The panel is 19 raw controls
  down to **1** — a gradient stop, which is a handle dragged along a bar and not a
  field.

  One thing the migration taught about the ratchet itself: a test that only fails
  when a number goes *up* is half a ratchet. It fails when one comes down without
  being recorded too, so a file that has been fixed cannot quietly regress.

- **The suite's controls are the suite's, and there is a ratchet now.**

  Noticed while reading the code rather than while using it: most of the deck's
  chrome does not use `office-ui`. Measured before deciding anything, and the
  reason was not laziness — it was two things that made hand-rolling *cheaper*:

  - **The package had no button and no bare field.** It exported a colour field, a
    Radix dropdown, a dialog, a toolbar and nine property rows. So every new
    control was a choice between inventing one and inventing one: 47 `<button>`s,
    17 `<select>`s and 15 `<input>`s in this app, with their own rules in a
    1,619-line stylesheet.
  - **Two palettes, so a shared control looked foreign.** In *one row* of the step
    inspector: a hand-rolled select at 22px, `#d8dce4`, 3px corners beside the
    shared colour field at 28px, `#d4d4d4`, 4px. Two greys, three heights, eight
    pixels apart.

  And one of the hand-rolled ones was not merely different, which is the finding
  that made this urgent: **the inspector's number fields wrote on every
  keystroke**, so typing `1.8` a character at a time put **10.68 seconds** in the
  document — React rewrote the field from the model between keystrokes and the
  characters interleaved — and took two undos to get back. `PropertyNumber` had
  had the answer since Word's ruler: a number a reader is *typing* is not a value
  yet. Now: one write on blur, one undo, and Escape abandons.

  What was built, in the order the blockers demanded:

  1. **`tokens.css`** — every control in the package draws with `var(--ou-…)` and
     nothing else; a product maps its own palette once. **Density is a token**
     (`[data-density="dense"]`), not a second set of components, because a panel
     row and an instrument's row are the same control at 28px and 22px.
  2. **The missing primitives**: `Button` (with `pressed`, so a toggle is a state
     rather than a variant), `Choice` (native — the rule the products had already
     found by themselves: Radix in a ribbon where options draw themselves, native
     in a panel where they are words), `NumberField`, `Field`, `FieldGroup`.
  3. **The step inspector migrated** — 10 selects, 5 number fields, 6 buttons and
     both of its local components deleted, along with 57 lines of duplicated
     control CSS. Measured after: every control in the row is 22px, `#d8dce4`,
     3px, including the colour field.
  4. **A ratchet**, because the rest is real work: a test that counts raw controls
     per file against a written allowance, with the canvas files exempt by name.
     It fails if a number goes **up** *or* if one comes down without being
     recorded — a ratchet that is not tightened is a ratchet that slips.

  One thing worth keeping about the token contract: a `var()` with no value is
  **invalid at computed-value time and takes the whole declaration with it**. So a
  product that imports the components and not the tokens gets a panel with *no
  borders*, not one with the wrong grey — silent and total, which is why there is
  a test asserting the tokens resolve.


- **A motion no longer erases what the shape already looks like** — and the two
  mechanisms that reach the properties a keyframe cannot.

  Read the reference implementation's motion guide (`zero-core-best`, a slide
  editor on the se-zero core) and measured its central claim in our own browser:
  *writing `filter` in a keyframe makes two motions erase each other and the
  static value too.* True — and it found a **live fault here**, in two halves:

  - A shape with a 흐림 effect carries `filter: blur(3px)` from `effectsCss`. One
    glow step over it is the first of its press, so it ran `replace`, and `filter`
    holds a **list**: the computed value came out as the glow alone. The blur was
    gone while the motion ran.
  - And gone *for good* after it, because the stage's cleanup cleared `filter` to
    `''` — a property the **renderer** had been the one to write. React writes a
    style prop only when it changes, so nothing put it back. The cleanup restores
    each element's own inline value now, snapshotted before anything is written
    (which had to be got right twice: the first version snapshotted *after* the
    hide, so a shape came back hidden).

  Their answer is a registered custom property per filter function. Measured, ours
  is smaller: **`composite: 'add'` already does it** — `blur(3px) drop-shadow(…)`,
  the list concatenates and the static value stays. What that cost was one real
  design decision: `composite` belongs to an *animation*, not to a property, and
  adding is wrong for the rest (an additive `opacity` starts at the shape's own 1,
  so a fade would not fade). So a step that touches both kinds is **two animations
  on one timing** — `splitAdditive`, and the stage already made several animations
  per step for a trail and for letters, so it cost nothing.

  Then the honest remainder, each measured before it was built:

  - **`box-shadow` cannot be scaled.** Additive shadows *concatenate* (`0 4px 8px,
    0 10px 20px` — two shadows, not one bigger one) and replacing erases the
    shape's own. A track would fix it, at four `calc()`s in every shadowed shape's
    style attribute forever. A lift is an appended `drop-shadow()` instead:
    additive by construction, free, and it follows the **silhouette** rather than
    the box, so a title and a star lift as themselves. **A track is for a property
    with no other way, not for every property with a better way.**
  - **A gradient has no other way.** `background-image` is discrete, so a gradient
    that turns is not a keyframe of any kind. That one gets the track:
    `calc(90deg + var(--sl-sweep, 0deg))` written by the renderer, `@property`
    registered from the table so a row is the whole of adding one.
  - **The fallback in `var(--sl-sweep, 0deg)` is not decoration.** A registered
    property ignores it; an *un*registered one makes `var()` invalid at
    computed-value time and takes the whole declaration with it. A second host
    that skipped the registration would draw shapes with **no gradient** rather
    than shapes with no animation.
  - **`border-radius` needed neither mechanism** — one length, so the browser
    interpolates it, and additive means what a reader means (8px + 16 = 24px).

  Three effects that were impossible: 들어올리기, 그라디언트 돌기, 모서리가 펴지며.

- **And then the track was asked the wrong question.** A day later, on a shape
  with **two** gradient fills: one 그라디언트 돌기 step turned *both*, 0°→50° and
  90°→140° from a single animation. `--sl-sweep` was "the gradient's angle", and a
  shape does not have *the* gradient — it has a **list**.

  Which is true of nearly everything worth animating: fills are a stack, shadows
  and blurs are a stack, `filter` is a function list. A motion that names
  `background-image` or `box-shadow` is naming a list rather than a thing in it. So
  a track's identity is now *(what kind of thing, which one)* — `--sl-f1-angle` is
  the second fill's angle and nothing else's — the effect declares which list it is
  about (`part`) and the step declares which item (`partAt`), offered in the
  inspector's 대상 row and numbered as the paint panel draws them.

  What the naming buys, beyond the fix: **two sweeps on two fills of one shape both
  run** (different properties, so nothing clashes), and **a card with a soft shadow
  and a hard key line can deepen the soft one**. Which is what made `box-shadow`
  worth a track after all — the earlier decision weighed "multiply vs add" and
  missed that only a track can *address one of several*. Its cost is paid by the
  shapes that have a shadow, not by every shape.

  Four things this decided:

  - **The indexes are bounded, because `@property` needs a static list of names.**
    Four per list. Past the cap a part is *not offered* rather than offered and
    silent — which is the failure the whole mechanism exists to avoid — and the
    lengths are written plainly.
  - **The index is the model's, not the CSS slot's.** A translucent image is two
    CSS layers where the reader sees one fill, so a variable numbered by the comma
    list would be numbered differently from the row a reader clicked.
  - **An index past the shape's list clamps rather than refuses.** A step outlives
    the fill it named the moment a reader deletes a layer, and animating the last
    item there is is a reading they can see and correct.
  - **`filter` still gets no track.** It is the list this product animates most and
    `composite: 'add'` concatenates it, so a track per function would buy the
    ability to animate *one existing function of a static list* — which nothing has
    asked for — at the price of a `calc()` around every filter argument every shape
    carries. **A track is for a list CSS gives no other way into, not for every
    list.**

  And the same trap as `takes`, hit again on the way: on the validator's first pass
  there is no step to ask, so an unknown effect has to mean *accept*. Reading that
  as "no part, refuse" made the 대상 row move and the document not — caught by the
  test that asked what the document held.

- **Trimming a film: which part of it plays.**

  The other half of what a timeline is. The list said *when* a film starts, which
  is what an animation list says; nothing said which part of it plays, so a deck
  could only ever play a file from its first frame to its last — when every real
  use of video in a deck is a piece of one. Two points on the media node
  (`trimStart`, `trimEnd`), a `setMediaTrim`, a 필름 group in the step inspector,
  and the stage seeking to the in-point before it plays.

  Four things this decided rather than discovered:

  - **The trim is on the film, not on the step.** PowerPoint's Trim Video writes
    it on the video, and a deck that played one file twice would mean the same
    piece both times. Two different pieces of one file is two media nodes, which
    is also how a reader would think about it.
  - **An out-point of `0` means "to the end".** The file's own length is *not in
    the document* — it is in the file, known only once a browser has loaded enough
    of it to say — so there is no honest default for an out-point. Which is why
    `trimmedLength` returns `undefined` rather than a number it would have had to
    invent, and why the bar keeps the step's placeholder duration until there is a
    real out-point. A bar drawn from a guessed length is a timeline that lies.
  - **A trimmed film's length is not a field.** The step's `duration` was always a
    placeholder for a film; once there is an out-point the length *is* the trim, so
    the inspector says it as a number rather than offering a field the document
    would ignore.
  - **The out-point is enforced by `timeupdate`, not by a timer.** A timer measures
    wall time and a film is not obliged to keep up with it: a buffering stall or a
    slow decode makes the two disagree, and the disagreement is a clip that stops
    in the wrong place. The event's ~4Hz resolution is the cost, written down in
    Open rather than pretended about.

- **The playhead runs while the preview plays.**

  It showed only where a *pause* landed, which is what the transport needed and
  not what a reader needs. The moment is read from the stage's own animations —
  the same reading a pause takes, so pressing pause does not make it jump — and
  the reason it took a design rather than a `setState` is the interesting part:

  - **The clock cannot go through React.** The app's state is what *builds* the
    animations, and the stage rebuilds everything in `builds` whenever that object
    changes. A playhead that updated state sixty times a second would restart the
    motion it was timing, once per frame. So the stage hands out a `clock` ref, the
    pane asks it once per frame, and the pane writes the playhead's position and
    the readout straight to the DOM. Nothing re-renders.
  - **Which means the pane has to put it back.** React does not know those two
    elements were touched, so a stopped playhead would stay wherever the last frame
    left it.
  - **And the restore has to read the *new* playhead.** Pausing sets it, React
    writes it to the element, and *then* the old effect's cleanup runs — so a
    cleanup restoring its own closure's value put the playhead back to zero right
    after the pause had placed it. Measured: the paused playhead went backwards.
  - **The pane follows what is playing.** `previewAt` and `pressShown` are set in
    one update, because a playhead running along the axis of a press the reader had
    chosen to look at instead would be a clock timing something else.

- **The step inspector is a column.**

  It was a row, and the row had outgrown the screen: measured at a 1280 window,
  eighteen controls came to 1340px inside an 1100px box, so 삭제 sat 76px past the
  edge of the screen and the page grew a sideways scrollbar to reach it. The row
  was right when a step had four attributes. A column costs a row per attribute
  and never runs out of width, which is why every tool with sixteen of them has
  one — Premiere, CapCut and After Effects all put the clip's detail beside the
  strip rather than under it.

  Grouped by the question each group answers — 모션 · 타이밍 · 모양 · 대상 — with
  PowerPoint's own name for the timing one, because that is the naming a reader
  arrives already knowing. Two of the groupings say something true that the row
  could not: 반복 is in 타이밍 because a repeat is *more time*, and 단위 sits with
  잔상 because those are the two controls that multiply the number of repainting
  elements the cost note warns about.

  What the column then broke, and both were real bugs the row had been hiding:

  - **A popover in a scrolling column is clipped whichever way it opens.** So both
    — the colour picker and the curve — are placed in the *window* now, measured
    once drawn, flipped when there is no room, and clamped both ways. Which fixed
    something that was already broken: the colour field at the bottom of the pane
    used to open a 360px picker 260px below the window's edge, so its notation
    field could not be reached at all.
  - **A fixed popover does not move when its anchor scrolls.** Measured: the panel
    stayed where it was drawn, the button that opens it slid underneath, and the
    click that should have closed it landed on the panel. It follows its anchor on
    `scroll` (captured, because scroll does not bubble) and on `resize`.

  And the delay is typeable at last: it has always been in the document and only
  ever been *dragged*, which is exact to the pixel a reader can hit and no finer.

- **A trigger: a shape that is a button.**

  The third kind of start condition, and the first that is not about the sequence
  at all. `startsWith` places a step among the presses and every press is
  anonymous — a click anywhere advances. A trigger says **that shape**, out of
  order, as many times as it is clicked, or never. Which is what makes a quiz, a
  menu, or an explanation revealed on demand possible.

  A step carrying `on` has `group: 0` — outside the sequence — so every reader of
  the sequence skips it for free. Two of those readers had to be fixed, and both
  had been *right* until a step could sit outside the order:

  - **`pressCount` was the last step's group.** A slide whose last step waited for
    a click reported no presses at all, and the presenter's forward key left
    immediately. It is the highest group now.
  - **Press 0 is also "before the first press".** So asking what press 0 runs
    answered *every trigger on the slide*, and a shape waiting to be clicked
    animated the moment the slide arrived — measured, in the show. `stepsAtPress`
    excludes triggers; `stepsWaitingFor` is the other question, honestly named.

  **The behavioural question is the interesting one**, and only a browser answers
  it: a click on a slide has meant "next" since the first slide projector, and now
  one shape means something else. The show walks up from what was clicked to the
  innermost *watched* shape and fires it instead of advancing — because if the
  click did both, a quiz answer would advance past its own tick.

  **A trigger's animations are delivered beside the press, not inside it.** The
  stage rebuilds everything in `builds` whenever that object changes, so a firing
  folded into it would restart what the press had already run. Each firing carries
  an id — the step and a *count*, because clicking twice runs it twice — and the
  stage starts the ones it has not started and leaves the rest alone.

  Two true things the measurements turned up. **A button has to be there to be
  clicked**: a shape hidden until its own entrance is not hit-testable, so a
  trigger on it cannot fire until its press has run. And **two `addBoxBuild`s in
  one tick name both shapes `shape-1`**, because each reads the document before the
  other commits — the panel awaits between clicks, but nothing makes it.

- **The pane says what a press costs to draw.**

  §7b of the motion spec has sorted every animatable property into tiers for a
  week and the pane said nothing about them, so a reader could put a `filter`
  emphasis on the letters of a title and find out what that costs in front of an
  audience.

  **What is expensive is not the number of animations.** `opacity` and `translate`
  are composited; a slide runs dozens without a repaint. What costs is a property
  whose change makes the browser paint the shape again every frame — and the cost
  is per *element*, which is where the cliff is: one dropdown, 상자 전체 to
  글자마다, turns one repaint into forty-one. Measured in the app, and it is the
  number the pane now shows.

  **Overlapping, not existing.** Three filters one after another is three repaints
  in turn, which no machine minds; three at once is three times the work every
  frame. So the count is the busiest *instant* — and because an animation's cost is
  constant while it runs, the busiest instant is always at an edge, so no sampling
  is needed.

  **And no promised frame rate**, deliberately: it depends on the shapes' size and
  the reader's machine, neither knowable here. Four at once is a note, a dozen is a
  warning, and both say *what* is expensive rather than predicting milliseconds
  nothing measured. A trail and a text unit multiply, which is stated where it is
  counted.

- **SMIL: the filters CSS cannot reach, under the playhead.**

  `feDisplacementMap`'s `scale` and `feOffset`'s `dx` are XML attributes, so no
  Web Animation will ever touch them. SMIL can, and the question that had to be
  answered first was whether it could be *looked at* rather than only played.
  Measured, and yes:

  - `pauseAnimations()` + `setCurrentTime(t)` is **exact and repeatable** —
    `values="0;60;0"` gives 0/30/60/30/0 at the fifths, and the same moment twice
    gives the same value. So the playhead drives a melt as readily as a fly.
  - **`begin` counts from insertion**, so a step's delay is written into the
    `<animate>` and there is no second notion of "when".
  - **One clock per `<svg>`** — and this product already makes one `<svg>` per
    step, so every step has its own clock by construction.

  Two effects on it: 녹아 흐르기 (turbulence into a displacement map — the title
  warps like ink in water) and 색이 갈라지기 (the red channel pulled off the cyan
  one and back, small and fast, because an artefact that lasts is a mistake).
  Which mechanism an effect uses is said by whether it has `frames`, rather than
  by a flag that could disagree with its markup.

  **And a SMIL step has no Web Animation at all**, which the transport learned the
  hard way: pausing a melt read the moment from the animations, found none, sent
  the playhead to zero and made the filter disappear. The moment is read from both
  kinds of clock now — an `<svg>`'s clock measures the same thing `currentTime`
  does, because both start when the press does.

  One label collision, and it is worth knowing about: **프레임 now means two
  things** in this app — a shape that arranges what is in it, and 1/60 of a
  second. Two frame-step buttons broke a frame-tool test, because an accessible
  name is matched by substring unless it is asked not to be.

- **A transport, and the preview bug it found.**

  Play is also pause, a frame each way, back to the start, and the moment read to
  the hundredth. The model is what makes it small: **pausing is scrubbing.** The
  stage freezes what is running and reports the moment; the moment becomes the
  playhead; the preview ends. So a paused deck is a state the pane already knew
  how to draw, frame-stepping is *already* scrubbing, and play resumes from
  wherever the playhead is — one state rather than two.

  The moment is `currentTime`, which counts from an animation's own start
  *including* its delay, so it is the press-relative moment the playhead measures.
  The largest across the press's animations, because a step that starts late would
  otherwise report a moment before it began.

  **And building it found that a preview ended before the animation it was
  showing.** The end was a flat 600ms after the final press *began*, so a
  two-second build was previewed for eight hundred milliseconds and then snapped
  back. It surfaced as a transport bug — pausing at 800ms worked and pausing at a
  second restarted the preview, because there was no longer one running — which is
  the second time this week a new control has been the thing that noticed an old
  fault.

  One thing deliberately left: **the playhead does not run while the preview
  does.** It shows where a pause landed and where play will resume from, which is
  what the transport needs; a playhead that follows playback needs the stage to
  report every frame, and that is a clock rather than a control.

- **Filters as motion: a colour on a step, an SVG filter this product makes
  itself, and a reader who asked for less movement.**

  **`filter` is two vocabularies**, and the measurement that shaped the design is
  that they do not mix: `filter: url(#f) blur(0px)` → `blur(10px)` is **discrete**
  — a `url()` anywhere in the list stops the whole list interpolating. So the
  obvious arrangement (an SVG look on the shape, an animated blur on top) is
  impossible, and an SVG filter's animation has to run *inside the filter*.

  Which is affordable because `flood-color` and `flood-opacity` are presentation
  attributes — CSS properties — so the Web Animations API interpolates them with
  no second animation system. Measured: 0.1 → 0.9 gives 0.5 at the midpoint on the
  `<feFlood>` element, with the attribute untouched. An SVG effect therefore
  declares its markup and the frames for **one primitive**, and the stage makes a
  copy of the filter per step, animates it, and takes it away — the same shape as
  the echo copies and the per-letter spans. 빛이 번지기 is the first reader of the
  seam.

  **A step has a colour now**, which is the first value on one that is not a
  number, a name or a duration — and it exists because `filter` does:
  `drop-shadow` and `feFlood` both take one, and `currentColor` is only right for
  text. Offered by the same rule as the direction and the amount (the effect table
  declares which effects take one), it accepts a `theme:` slot so a glow can
  *follow* the deck's accent, and `null` clears it — `undefined` does not, because
  a merged undefined is dropped rather than written. Measured: the colour survived
  being cleared.

  **Five more filter effects**: 색이 돌기 (a full turn of the wheel, so a loop does
  not jump), 물들기, 뒤가 흐려지기 (`backdrop-filter` — the one filter that is
  about the *slide* rather than the shape), and the bloom. With 빛나기, 흐린 데서
  나타내기 and 흑백으로 사라지기 that is eight, from a property nothing used a week
  ago.

  **And `prefers-reduced-motion` is honoured.** A duty rather than a feature. Not
  "show nothing" — the shape still arrives, at the end of its animation
  immediately — and it falls out of the numbers: a duration of zero collapses the
  stagger, the trail and the path with it. The trail needs saying separately,
  because copies are not timing.

  Three faults on the way. The stage's guard was `frames.length === 0 → skip`, so
  **every SVG effect was skipped before it was reached** — its frames belong to a
  primitive, not to the shape. A test asserting "every preset produces frames" was
  asserting the *old* invariant and had to learn the new one. And Playwright's
  describe-level `reducedMotion` did not survive the project's device descriptor
  (measured: `matchMedia` was `false` inside the test), so the test emulates it on
  the page, which says what it means anyway.

- **The contents of a box, a trail behind a shape, a rubber band, and two more
  `filter` effects.** Four entries that were each a measurement away from being
  written, and the two that touched the *view* both found a fault only a browser
  shows.

  **A container offers its contents.** "Animate this group" means the group half
  the time and the eight cards in it the other half, so the panel says which:
  `안의 8개에 하나씩`, which is `addBoxesMotion` pointed at `boxesInside`. One
  level down, deliberately — a frame holding two groups of four is a reader who
  means the two groups, and they can point at a group when they mean it.

  **A trail is copies of the rendered element**, which is the same shape of answer
  as the per-letter split: a rendered thing no node describes, put back when the
  animation is. The document holds one number. Two things had to be got right, and
  both are about *where the copy lives*: appended to the shape's **own parent**, so
  every inherited style matches by construction (measured — same box, same
  box-shadow, same font), and wrapped in a positioned, inert box whose `opacity`
  does the fading, because an animation of `opacity` *replaces* an element's own
  value rather than multiplying it. And the spacing is derived from the duration
  (`echoGap`) rather than stored: eighty milliseconds behind a 200ms dash is a
  separate shape, and behind a two-second drift it is invisible.

  **The rubber band moved the thing it was measuring.** Rendered inside the
  scrolling track column, its appearance shifted the tracks up by 73 pixels — so
  every bar was compared against a band that was no longer over it and a sweep
  caught *nothing*. Measured: the tracks' top went from 725 to 652 between the
  pointerdown and the first move. An overlay belongs at the top of the pane, which
  is the rule the selection overlay already follows one component up.

  **And its test looked for the spread along the wrong axis.** The trail was
  compared by `x` while the motion flew *upwards*, so it waited three seconds for
  a spread that was all in `y`. Distance from the shape is the claim worth making,
  and it is the one that survives the preset changing.

  **`filter` has three readers now**: `glow`, `blurIn` (a focus pull — the eye
  reads focus more slowly than brightness, so 800ms rather than 300) and `grayOut`
  (colour first, then the shape).

- **Multi-select, a motion clipboard, a path drawn by hand, and the presets the
  reference tools have.** Four entries, and the last of them found the two the
  others had been waiting for.

  **A bar's selection is a set.** Shift-click adds, and the arrows, the drag, the
  length field and Delete all act on every selected bar — one transaction each, so
  six motions moved together take one undo. The row says `2개 선택` rather than a
  shape's name, because the controls beside it write to all of them.

  **Shifting several bars is not "add to each delay".** `withPrevious` measures
  from the *previous step's start*, so adding 100ms to two chained steps moved the
  first by 100 and the second by **200**. The delta goes onto what a reader sees —
  the start — and comes back as a delay through the same rule `withTiming` reads
  (`shiftedDelays`). The browser test read it off the bars.

  **And `slideAt` cannot find a step's slide.** A step lives in a `motionTrack`
  inside `resources`, beside the document — so walking *up* from it finds no
  surface, `slideAt` answered `undefined`, and a multi-bar drag silently did
  nothing. The link runs the other way: a slide names its track by `trackId`.

  **A motion travels between shapes** through `motionValues` — the effect, the
  length, the curve, the options — and pointedly *not* what it names or when it
  starts, because those are facts about a step's place rather than about the
  motion. Buttons rather than Ctrl+C/V: those keys belong to the deck, and one
  pair cannot mean two things depending on where the focus happens to be.

  **A path can be drawn by clicking the slide**, and while that mode is on a click
  is a *point* — including a click on a resize handle, which is the part that had
  to be measured: the handles sit over the middle of the selected shape, so one
  click in three was being swallowed.

  **A path can turn sharply.** Every path was smoothed through its points, which
  drew the zigzag preset as a *wave* — the one shape of travel that is entirely
  about its corners. The flag travels with the points, because a zigzag with
  rounded corners is a different route rather than a different drawing of one.

  **The preset list doubled, from reading the reference tools.** Canva, Figma and
  CapCut come to about thirty names for a dozen ideas; most of them this table
  could already say (Typewriter is a letter unit with a 55ms beat; Baseline is a
  word-unit wipe upward; CapCut's whole *loop* category is `repeat: 0`). **Three
  it could not**, and they became effects: `slamIn` lands from *bigger* (`grow`
  only ever arrives from smaller), `drift` moves one way and stays there (`nudge`
  comes back, which is what makes it a shake), and `glow` is a `filter` — the first
  reader of tier two in this product, closing a backlog entry that said so.

  **A test that pinned a table's length was a test of the table.** Asserting
  exactly six combination tiles made *adding a preset* a failing test. A lower
  bound and the tile the test is actually about is the assertion that survives the
  table growing — which it did, twice, in the same afternoon.

  **And the joining-script guard went in as insurance**, at ten lines: a letter
  unit on Arabic, Devanagari or Thai is served as a *word* unit, because letters
  drawn disconnected are not a different style but the wrong text. No deck this
  product ships can reach it; the first one that could would have reached it
  silently.

- **A timeline that magnifies, snaps and takes the arrows; a motion given to
  several shapes at once; and combinations.** Three entries that turned out to be
  one piece of work, because all three needed the composite that landed with
  them.

  **The axis magnifies.** At 4× a 300ms step is 120 pixels of bar rather than 30,
  and a two-frame delay is a thing a reader can see and drag. The first version
  divided the *span* by the magnification, which was wrong in a way only a
  measurement showed: at 4× the axis covered 500ms while a 1200ms bar was still
  240% of it, so the bar ran off the end of the ruler into a region with no ticks
  and the pane scrolled further than the clock went. Magnifying is a fact about
  *drawing* — the same time over four times the pixels — so it belongs in the
  lane's width and nowhere near the arithmetic.

  It also found a six-pixel lie that was already there: the ruler's margins and
  the name column were two hand-tuned numbers that had drifted apart, so a tick
  was never quite over its bar. Both read `--sl-labels` and `--sl-tail` now.

  **Bars snap** to zero, to the playhead, and to the other bars' edges, with the
  guide drawn where they caught — feeling a bar stop is not the same as knowing
  what it lined up with. The tolerance is eight *pixels* converted to
  milliseconds at the point of use, so snapping is as sticky at 4× as at fit.

  **The arrows nudge** the focused bar: 10ms, 100ms with Shift, resize with Alt.
  Two faults on the way. A bar could not be focused at all, because the drag's
  `preventDefault()` is what stops the browser focusing it — measured,
  `document.activeElement` was the body after a click. And the *overlay's* key
  handler swallowed every arrow: it listens in the capture phase and stops
  propagation so it beats the editor's key map. Restating its rule as "only when
  the focus is on the slide" broke three other tests, because **focus stays on
  whatever chrome button was clicked last** while the reader is plainly working on
  the slide. The rule that holds is the narrow one: the chrome owns its keys
  exactly where it *has* keys — a field, and the timeline pane.

  **One motion on several shapes, a beat apart** — "apply to all", and it writes a
  step *per shape* rather than one step naming three. The model already says it,
  and each shape then has its own bar to drag rather than a group to dissolve to
  get at the third one. The e2e caught the arithmetic: `withPrevious` means "with
  the step *before* this one", so writing absolute delays made three shapes start
  at 0, 200 and **600**. The gap is what a step stores; the accumulation is the
  timeline's.

  **Combinations** — 올라오며 커지기, 밀려오며 돌기 — are the presets this model
  could not hold last week, since a second motion on one shape used to lose
  silently. A combination is a list of ordinary preset ids and writes exactly what
  picking each of them by hand would write; no combination pairs two *turning*
  effects, because two additive rotations end at zero.

- **Two motions at once, and a path to travel.** The two things a professional
  timeline is for, and both of them started as a measurement that contradicted
  this repository's own spec.

  **A second motion on one shape used to lose silently.** Two animations of the
  same property are `replace` by default — newest wins — so a fly and a grow at
  one moment produced only the grow. `composite: 'add'` fixes it, and measured, it
  does not mean the same thing for every property: translates add (percentages and
  pixels alike), scales *multiply* (2 × 2 = 4, which is the meaning anybody wants),
  opacities add, filters concatenate their function lists. Which step adds is the
  timeline's answer, because only it knows what overlaps what: within a press, for
  one shape, the first replaces and every later overlapping one adds.

  **`rotate` is the exception, and it is a browser fault.** Two additive `rotate`
  animations in Chromium interpolate as 90·t·(1−t) — they rise, fall and **end at
  zero**, so a shape turns and then untwists itself. Measured at four points
  against a single animation's 22.5°/45°/90°. Additive rotation over a *static*
  rotate is correct, so the fault is specifically two animations. A turning step
  therefore stays `replace` and the bar *says* it clashed: two bars that quietly
  cancel each other is the worst version of this.

  **A bar had to become a lane.** A shape with two motions at one moment is two
  bars at one moment, and the track was 24px tall — the second bar drew outside
  the row, where a reader could neither see it nor grab it.

  **And the path spec was wrong.** `motion-model.md` §5 said a path would collide
  with `translate` and would have to own the slot. Measured: the offset transform
  is its own slot — it does not appear in the computed `transform` or `translate`
  at all — so a shape travelling a path can also fade, pulse, grow and keep the
  rotation the document gave it. Four of them measured together.

  So a path is a *kind* of step for a smaller reason than the one first given: it
  needs a **style written before the animation** (`offset-path`), and no effect has
  a prerequisite. The document holds **points in twips relative to where the shape
  rests** rather than a `path()` string — a path has to be editable, and a parser
  for the SVG path grammar is a liability for a feature that only writes lines and
  curves. `(0, 0)` is "where it already is", which needs the path shifted by half
  the shape, because `offset-anchor` puts the element's *centre* on the path while
  the path's origin is its static top-left. Measured: a 40×40 box at (100, 200)
  with a path from `0 0` drew at (80, 180).

  The path is drawn **on the shape** — a route across a slide cannot be edited as
  numbers — with a dot per point to drag, a half-dot between each pair to add a
  bend, and a double-click to remove one. Six presets, each drawn as the path it
  is, because a chip travelling 4800 twips inside a 28-pixel tile is a chip that
  leaves the tile.

- **A deck that leaves the app and comes back.** 저장 writes a
  `{ format, version, savedAt, document }` file the browser downloads, named after
  the words on the opening slide; 열기 reads one, and refuses four ways with the
  sentence a reader needs rather than the one a parser produces.

  **The sids are stripped, and that is a fortnight-old decision being paid off.**
  A sid is `session:counter`, so a file that kept them would be unloadable in the
  session that wrote it. Stripping them is only *safe* because nothing in a deck
  points at a node by sid: a build names its shape by a name the shape carries, a
  slide names its layout by `layoutId`, its track by `trackId`. That was decided
  when the first build was written, for exactly this reason, and this is the first
  code to depend on it. The test loads the file into a session with no sid in
  common and the letter-by-letter animation still finds its title.

  **Opening is the one gesture in this app that can lose work**, because a new
  document takes the history with it — so it asks, and only when there is
  something to lose. And the file's name is read from the *title text* rather than
  from the slide's `name`, which is "Title" in the sample deck and a filename
  nobody chose.

- **Text by the piece: a title arriving a letter at a time.** A build gains a
  `unit` — 상자 전체, 문단마다, 단어마다, 글자마다 — and a `stagger`, and the
  stage splits the renderer's output at play time, staggers the delays, and puts
  the text back when it ends. Two presets came with it (글자마다 나타내기,
  단어마다 나타내기) and needed nothing but a row in the table.

  **The spec asked for a kind and an option would do.** `motion-model.md` §7 said
  this needed a `text` *kind* of step. It did not: every one of the twelve effects
  works on a piece of text exactly as it works on a box, so a kind would have held
  a second copy of the whole effect table. The test for the next one — a path, a
  paint, a camera — is whether it needs the effect vocabulary to *mean* something
  different. A path does; letters do not.

  **A transform is ignored on an inline box.** Measured: `translate` and `scale`
  do nothing at all to a `display: inline` span, so a letter that flies has to be
  `inline-block` — and inline-blocks let a line break *inside a word*, which is
  text that reflows the moment it animates. The fix is a second wrapper: the words
  become `inline-block; white-space: pre` holders and the letters sit inside them,
  so the break opportunities stay at the spaces. Measured after: same line count,
  same box width, to the pixel.

  **A space is not a beat.** Fading in a gap is invisible and spends a beat of the
  stagger doing it — so a space is drawn and never animated, and the *timeline*
  has to count pieces the same way or the bar is wider than the animation. It was,
  by three letters on a four-word title, and the total said 0.3초 for an animation
  that took 1.3.

  **The caret's block is off limits.** The editor's MutationObserver is scoped to
  the block the caret is in, and everything outside it is "our own writing, by
  definition" — so splitting the text of the box being typed in would be read back
  as an edit. A box holding the caret animates whole, which is an e2e test of its
  own.

- **A spring, which is the one timing a curve cannot say.** A bezier overshoots
  once; a spring passes its destination, comes back past it and settles over
  several diminishing swings. The document holds `spring(180, 9)` — two numbers,
  adjustable — and the curve panel grows a second half: the sampled curve drawn
  as a polyline, two sliders, and the spring's own settling time offered as a
  button.

  **`linear()` made the hard version unnecessary.** The first design resampled
  the effect's keyframes, which needs an interpolator for `translate`, `scale`,
  `rotate`, `clip-path` and colour in this repository forever, beside the
  browser's own. CSS's `linear()` easing *is* a curve given as samples, so a
  spring is sampled into one and **nothing else in the product changed** — same
  frames, same duration, same string in the document. Measured first: a
  `linear()` with a 1.4 point moved a box 140px at its halfway mark, so the
  overshoot is real rather than clamped, and 120 stops are accepted.

  **The sample count comes from the ringing, not the length.** `linear()` draws
  straight lines between stops, so a bouncy spring needs 96 of them and a
  critically damped one 24 — and the last sample is *made* exactly 1, because a
  spring approaches forever and `fill: both` would leave the shape a hairline off
  where the document puts it, permanently.

  **A spring implies a length, and does not get to set it.** The bar's width is
  the reader's; the panel says "자연 길이 1.54초로" and lets them ask.

  The panel it first drew reused the bezier's viewBox, which reserves seventy
  units above the bed for a *handle* — a spring has none — so the popover was
  tall enough to be clipped by the top of the pane and the curve was drawn off
  screen. It looked like sliders with no picture.

- **Motion presets: a whole motion under a name, and a tile that plays it.**
  Thirteen named motions — 부드럽게 올라오기, 톡 튀어나오기, 두 번 두근거리기 —
  each of them an effect, a length, a curve, a direction and an amount. The
  gallery is the *adding* gesture in the 모션 tab, and a tile **runs the motion it
  promises** on a chip when you point at it, through the same `framesFor` and the
  same easing the slide will use. Anything else would be a second implementation
  of the effect table, and a preview that lies is worse than none.

  **A preset that is stored lies on the second edit.** The tempting model is an
  attribute — `preset: 'rise'` — and it is wrong the moment a reader drags the
  bar a little longer: the document says `rise` and means something else. So a
  preset *writes and disappears*, and the panel answers "which one is this?" by
  comparing values (`matchingPreset`). A step that was nudged reports 직접 설정,
  which is the truth. Same rule as the paints, and as the direction that came out
  of the effect's name: **one vocabulary, and the document holds values.**

  **`repeat` has to be written even when it is 1.** A step already beating twice,
  given a preset that does not repeat, has to *stop* — and a value left out of a
  patch is a value left alone. The only preset default that is written explicitly,
  for a reason that only appears on the second preset applied to one step.

  **A comment that promised something the code did not do.** `_stepChanges` said
  it checked an effect's options against *the effect the step has*; it checked
  only that the value was a legal direction. Nothing noticed until a preset
  applied a bundle of five values over another effect's five and left a direction
  on a flash. The fix had its own trap: `takes` missing means *unknown effect,
  accept*, and `takes.direction` missing means *the effect says no* — two
  different absences, read as one, and the test caught it.

  **One label meaning two things.** The 속성 tab's 효과 추가 is a shadow and the
  모션 tab's was a build, in one panel; the motion one is 모션 추가 now, which is
  also what a tile actually is.

- **A gradient aimed on the shape.** The angle was a number in a box, and nobody
  aims a gradient by typing 135 — they point at the corner they want it to come
  from. The axis is drawn on the slide while the fill's row is open: a line, a
  dot per stop, and a handle at the far end that turns it.

  **The line is CSS's line, not a guess at one.** A linear gradient runs through
  the box's centre for `|w·sin a| + |h·cos a|` — the length that puts the end
  stops exactly on the corners the direction points at — so a stop dragged to the
  end of the drawn line is a colour that stops *there*. That formula is why this
  is a tested module rather than four lines in the overlay: being wrong by a few
  per cent looks like nothing on screen.

  Three bugs, and the third is the interesting one.

  The aim handle sits exactly where the south resize handle does, so the drag
  resized the shape instead — two handles the same size in the same place, one of
  them simply in front. Drawn after them now.

  A `useMemo` below the early return blanked the app for the **second** time in
  this session, so the boundary now carries a line saying no hooks below it. Both
  times the calculation was put next to the thing it is drawn beside, which is
  exactly where it reads best and cannot go.

  And the panel's editor dismisses itself on a pointer outside it, in the
  *capture* phase — so it closed the editor and unmounted the handles **before
  React's own pointerdown reached them**. The handle was the topmost element
  under the pointer, a native listener saw the event, and the drag did nothing at
  all. The fix is the idea rather than a special case: the panel row and the
  canvas handles are *one editor in two places*, and the canvas half says so with
  `data-paint-canvas`.

- **A stack that is one: an order, an image, and a blend.** Three entries closed
  by the same property of the model — the list took all of them *without
  changing shape*, which is the whole argument for having made it a list.

  **The order can be dragged.** A stack is an order — which fill is over which,
  which shadow is drawn first — and the only way to change it was to delete a row
  and add it back, losing everything about it. Pointer-driven rather than the
  browser's drag-and-drop: a list that only moves when you let go is a list you
  have to aim at.

  **A picture is a fill.** Which is where the CSS gets interesting: a layered
  background is *four parallel lists* — the images, their sizes, their repeats
  and their blend modes, matched by position — so writing `background` alone is
  how an image ends up tiled at its natural size beside a gradient that ignores
  it. And `background-image` has no alpha, so a translucent photograph is drawn
  as the picture with a transparent wash over it: one paint in the model,
  **two** entries in every one of those lists, which they all have to agree
  about.

  **A blend mode, in CSS's own names**, because they are also Figma's and
  Photoshop's — one of the few vocabularies the whole industry already agrees on,
  and renaming it would be this product inventing a dialect. It lives in the
  paint's editor rather than its row: it is the setting touched least, and it
  only *means* anything when there is a layer beneath, which is the moment a
  reader is in there arranging them.

- **The panel a designer can work in.** Nine UI changes, and the four that
  mattered were all the same shape of fault: *the model could say more than the
  panel could ask for.*

  **Fills and effects are stacks now** (`paints.ts`). A shape had one fill and
  one shadow spelled out as flat attributes, which cannot say a photograph tinted
  by a colour over it, or a card with a soft shadow *and* a hard key line — the
  first two things anybody does in a design tool. The schema already took
  `type: 'array'`; the alternative was `fill2`, which caps the count and cannot
  reorder. Every deck already written keeps meaning what it meant: a shape with
  no list is read *as* a list of one, on every read, and gains a real one the
  first time a reader edits it — at which point the flat attributes it supersedes
  are cleared, because a document holding both would have two answers to one
  question.

  **A gradient is a bar with stops**, dragged, double-clicked to add, with a
  position and an angle — where the model held two ends and the panel held four
  rows. **A colour is chosen in a real picker**: saturation and value, hue, alpha,
  hex, and the eyedropper where the browser has one. Opacity is half of every
  fill in a real design and neither the OS dialog nor a hex string can express
  it.

  **The panel has tabs**, because a shape's two kinds of answer — what it *is*
  and what it *does* — are used at different times, and nine sections in one
  column made the motion half something a reader scrolled past. Sections are
  divided by a rule with a header that can hold an action, which is where "add a
  fill" belongs.

  **The timeline moved to the bottom of the window**, across the whole width. It
  had been inside the stage's column, at the same level as the presenter's note —
  a *slide's* text — which gave a left-to-right instrument half the width it
  needs.

  **A box being typed in is outlined.** While a reader is in the text the overlay
  goes inert, and that meant nothing at all was drawn: on a slide with two
  transparent text boxes there was no way to tell which one the keystrokes were
  going to.

  Three faults found on the way, each caught by something other than looking.
  A `useMemo` written below an early return blanked the whole app — a component
  whose hook count changes with its props — and it was written there because that
  was the tidy place for it. `addBoxBuild` defaulted every new motion to
  `afterPrevious`, so two shapes given one effect each animated together; a test
  said two shapes must take two presses. And a theme slot inside a fill did not
  resolve, because `resolveThemeAttrs` walked only the top level — a reader could
  pick a theme colour and watch the shape lose its colour entirely.

- **A pane the reader sizes, and a repeat that is finally read.**

  The timeline was a fixed 40% of the window, always open. A timeline is looked
  at *while* the slide is — a reader arranging when things happen keeps glancing
  up — so how much of the window each gets changes with what is being done: one
  bar wants a strip, eight tracks want half the screen, and writing text wants it
  gone. It drags from its top edge and folds to a labelled strip, and both are
  the app's state, because how a reader has arranged their window is not a fact
  about the deck.

  **`repeat` was declared in the schema beside the easing and read by nothing**
  — this repository's own favourite fault, made fresh a day earlier. It is one
  field on the animation's timing (`iterations`), and `0` means *until the slide
  moves on*: a count of zero is not a thing anybody can mean by "how many times",
  so it is the one unambiguous way to say "no count" in a number, which is what
  PowerPoint's own repeat does too.

  The arithmetic had a hole the screen would have hidden: `withTiming` ended a
  step after one pass, so a step set to run *after* a pulse that beats three
  times started two beats early. A unit test found it, which is the reason the
  timing is arithmetic and not a rendering detail. An endless step counts as one
  pass for sequencing — otherwise whatever follows it never runs, and the slide
  stops.

- **An effect, and its options.** `flyInLeft`, `flyInRight` and `flyInUp` were
  three effects. Eight directions across six entrances is forty-eight names for
  six ideas — and worse, a reader who had set a duration, a curve and an order
  and then wanted the shape to come from the other side would have been changing
  *which effect they chose*, losing all three.

  So an effect is **what happens** and its options are **which way and how
  much**: `fly` with `direction: 'right'`, `grow` with `amount: 0.8`. Each effect
  declares which options it takes, and a panel offers exactly those — a direction
  on a flash is a control that changes nothing, which is the same rule the
  properties panel already follows for a shape's attributes. PowerPoint stores
  the identical shape: a preset, and a subtype.

  **The old names still read.** A deck written last week says `flyInLeft`, and it
  resolves to `fly` *carrying* `direction: 'left'` — one table, read every time,
  rewriting nothing. A deck that silently changed on being opened would be the
  worst outcome of a refactor like this, so the fallbacks are tested by name.

  The sign that reads backwards, written down because it is wrong in every
  implementation of this: an entrance comes **from** the direction it names and
  an exit goes **to** it, and a wipe's `inset` names the side that is *hidden* —
  revealing from the left insets from the right.

- **The timeline, properly this time.** The first version was a list of rows in
  order with numbers for the timing, which is PowerPoint's animation pane — and
  it was shipped as "the timeline", which it was not. Measured against Canva,
  CapCut and Figma, four things were missing, and every one of them is the same
  thing: **time has to be a dimension you can see and drag, not a number you
  type.**

  - **A track per shape.** A shape that appears, is emphasised while it is talked
    about and then leaves is *one row of three bars*. A flat list says three
    unrelated things — and `setBoxBuild` replaced rather than appended, so a
    shape could not have three motions at all. `addBoxBuild` appends, defaulting
    to `afterPrevious` because a second motion on a shape almost always follows
    the first.
  - **Bars on an axis.** A bar's left edge is when it starts and its width is how
    long it takes; dragging it sets the delay, dragging its edge sets the
    duration. `delayForStart` is the conversion — the moment is the reader's and
    the delay is what the document holds.
  - **A playhead.** Dragging it seeks every animation of that press and *holds*
    them there, which is a thing a CSS transition cannot do at all: it has no
    moment you can ask for.
  - **A curve.** Every step in the product ran `ease`, because the word was in a
    template string in the renderer. Six presets and a draggable cubic-bezier,
    the control Figma and After Effects put in the same corner of the same panel.

  **All of it followed from replacing the transition with the Web Animations
  API.** A transition has two ends, so an emphasis — out and back — could not be
  expressed; it has no easing a document can carry; and it has no `currentTime`,
  so nothing could be scrubbed. Keyframes are what WAAPI takes, so effects became
  a table of them: a name, a category, and what it animates. The old vocabulary
  — `buildMotion`, `buildGroups`, `hiddenUntilBuilt` — was **deleted** rather
  than left beside the new one: two ways to ask what a slide animates is two
  answers to keep in agreement, and the second only has to be wrong once.

  Two bugs that only a pointer could find, both of the same kind — a control that
  is *there* and cannot be used. An overshoot preset puts its handle above the
  unit square, and the curve's viewBox stopped below it, so choosing `backOut`
  and then adjusting it grabbed nothing. And the pane scrolled as a whole, so the
  curve panel — which opens upward from the bottom row — was clipped by its own
  container: the handle had a position, and the pointer landed on the scroller.

- **The timeline: a slide's steps as one list.** Three entries in the backlog
  pointed here, which is how you know it was one piece of work and not three. A
  shape could be given an effect from a dropdown and nothing else — no order, no
  timing, no way to run two together, and no way to make a film part of the
  sequence at all — and every one of those is a property of *the slide's list*
  rather than of any one shape. A per-shape control could never have grown into
  them.

  **One list, two kinds of step.** A build animates a shape and a `play` step
  starts a film; to a presenter they are the same thing — press, and the next
  thing happens — so they are one list and the presenter's key does not have to
  know which it is about to run. The document's vocabulary did not change: the
  track already held both shapes of step, and this reads what was always
  expressible.

  **The presses are computed, never stored.** Which press runs a step is the
  consequence of the `startsWith` values before it, so it is recomputed on every
  read — a stored group number would be a second place saying the same thing, and
  the two would disagree the first time a step moved. The number is drawn once
  per group, so the list says how many presses the slide takes rather than how
  many steps it has.

  **A step whose shape was deleted is kept and labelled** — "없는 상자" — because
  dropping it would hide the fault: a reader whose presses are one out should be
  able to see the leftover and remove it.

  **미리 보기 plays it in the editor**, through exactly the same code the show
  uses. A preview of something else is the one thing it must not be, so the
  build state is one calculation with two callers rather than two calculations.

  The pane found a lag nobody had noticed: the zoom box read its number from a
  400ms interval, so when the pane took room from the stage the box said a number
  the screen had already stopped drawing — caught as 60 against 59. It watches
  the slide's own box now. And a snapping test that asserted an exact screen
  pixel at a particular zoom had to say "to within a pixel", which is what it
  always meant.

- **A film and a sound come back, with their readers.** `mediaVideo` and
  `mediaAudio` were taken out of the office schema the day it stopped declaring
  what nothing drew — fifteen node types with no renderer between them — and they
  return the way that rule requires: a renderer, a command, a control.

  The harness enforced it twice on the way in, both times within a minute. It
  refused the schema until there were renderers. Then it refused a single
  `insertMedia({ kind })`: a command named as though it puts a node in the
  document has to say *which* node, and "it depends" is the answer that check
  exists to refuse. So `insertVideo` and `insertAudio`, which is what the
  standard schema's own media commands are called anyway.

  **`data-autoplay`, never `autoplay`.** A real `autoplay` starts the film the
  moment it is *drawn*, and it is drawn in the editor — a deck with three films
  would begin playing all three the moment it opened, and again after every
  keystroke that redrew one. What a document means by autoplay is "start when
  this slide comes up in the show", which is a fact about presenting, so the
  stage starts them and stops them: paused and rewound on the way out, because a
  film left playing on a slide nobody is looking at is a voice from an empty
  room, and one left half-way through starts in the middle next time.

  The test for that measures `play()` and `pause()` rather than `paused` — a data
  URI with no frames in it never leaves the paused state however hard it is
  asked, so `paused` would have measured the fixture's codec instead of the
  product's decision.

- **Applying a theme, and the control that made a slot writable.** Choosing a
  theme re-colours every shape that *follows* the deck and leaves alone every
  shape that chose its own colour — and "keeping what a slide overrode", which
  the backlog had written down as the hard half, turned out to be nothing to
  implement. It is what naming a slot already means. The test says so rather than
  the comment: one shape on `theme:accent1` moves with the theme, one shape on
  `#111111` does not, and the first one's document never changes.

  **The panel could not write a slot at all.** Every colour control was an
  `<input type="color">` — the browser's dialog, which can produce a hex string
  and nothing else — so a slot could be read from an imported document and never
  chosen in the product. Radix has no colour primitive (it stops at behaviour;
  a picker is a canvas), so the field is `react-colorful` — 2.8kB, no
  dependencies — inside the same pointer-driven panel the toolbar's palette
  already uses, with the theme's slots above the standard row. A slot is drawn as
  the colour it resolves to and *labelled* with its name, because two shapes the
  same blue are a coincidence and two shapes on accent 1 are a decision.

  And it answered the question the master had left open, which a badly-written
  test had failed to ask: **changing a resource does redraw the slides that
  follow it.** Measured — applying Ember repainted a rectangle from
  `rgb(37, 99, 235)` to `rgb(234, 88, 12)` while its own `fill` stayed
  `theme:accent1`.

- **A theme, so a colour has a name.** A shape's fill is a hex string, so a deck
  built by hand has that string copied onto forty shapes — and re-colouring it
  means finding all forty, including the ones on the slide nobody scrolled to.
  Twelve colour slots and two faces, by the names PowerPoint's own format uses.

  **A slot is written where a colour goes**: `fill: 'theme:accent1'` beside
  `fill: '#0ea5e9'`, not a second attribute. Two attributes would mean every
  reader checking both and deciding which wins, and a document carrying both is a
  document with no answer. The prefix is what makes it safe — no CSS colour can
  begin with `theme:`, so nothing that is already a colour changes meaning, and a
  slot the theme cannot fill resolves to *nothing* rather than to black: a deck
  from a tool with more slots should lose the colour it cannot express, not gain
  one nobody chose.

  The sample deck was rewritten to prove it rather than to show it off: two
  shapes name slots, the master's faces are `theme:major` and `theme:minor`, and
  the deck's own hex for its accent appears exactly once — in the theme.

  What this cost, and it is the second time in two items: **an attribute function
  cannot see the environment**, and the environment is where the document lives.
  Eight renderers became function templates to resolve a slot at all. And a
  render test had been mounting a view with *no* environment — so it drew a
  rectangle with no fill and reported it honestly, which is not what the product
  does; it builds `createDeckEnv` now, like the stage, the notes pane and every
  thumbnail.

- **A master above the layouts.** Without one, every layout repeats the deck's
  background and the deck's idea of what a title looks like — and two layouts
  that disagree about the title's font are a deck with no design and no way to
  tell which of the two was the mistake.

  It is **one more level in the cascade that already existed**, not a second
  mechanism: master, then layout, then the node, matched by *role* at every level
  and never by position, for the reason the layout resolver already gives — a
  slide that has moved or deleted a box would otherwise be formatted from
  whichever placeholder happened to be third. A layout with no master resolves
  exactly as it did, which is what every deck written before this keeps doing.

  The background comes down the same chain — slide, layout, master — and that is
  the half a reader sees first: one place now says what colour this deck is. The
  sample deck was rewritten to prove it rather than to demonstrate it: its
  layouts no longer name a font at all, and its titles are still set in Georgia.

  Two things this turned up. The `surface` renderer had to become a function
  template to see the environment at all — an attribute function is handed the
  node's data and nothing else, and the document a master is looked up in travels
  on the environment. And a test written to pin down what happens when a master
  *changes* was measuring its own mistake: `setAttrs` is an operation, not a
  command, so `executeCommand('setAttrs', …)` changed nothing and the test passed
  by asserting the colour had not moved. It was deleted rather than kept as a
  green test of nothing, and what it was trying to ask is in the open list.

- **The presenter's screen.** Presenting showed *the audience's* screen — the
  half a projector needs and the half a presenter cannot use. Everything added
  here was already in the document: the next slide, the note the author wrote,
  and how far through the deck they are. The clock is the only thing on it that
  is a fact about this showing rather than about the deck, so it is the only
  thing the app remembers.

  **The next slide is a thumbnail and the current one is not.** The slide the
  audience sees stays the one the editor is already drawing, made smaller by CSS,
  because presenting from a second render would mean two drawings of one deck
  that could disagree. The next slide has no such drawing to reuse — it is the
  slide that is *not* on screen — so it is the rail's `Thumbnail`, which already
  knows how to draw a slide small without re-laying it out.

  The surprise was one word of CSS. The panel was given room with
  `padding-right`, and the stage fits its slide to the room it is drawn in by
  re-measuring on a `ResizeObserver` — which watches the element's *box*. Padding
  changes the room inside a box of the same size, so the observer never fired and
  a third of the slide sat behind the panel: 1280 pixels wide before, 1280 after.
  A margin changes the box, and the fit followed.

- **Builds, and the name a shape had to be given.** What happens *on* a slide,
  in the order a presenter clicks through: seven effects on the same track the
  transition uses, one step per build, grouped into presses.

  This is where the question a transition let us postpone had to be answered.
  **A step cannot hold a sid.** A sid is `session:counter`, handed out at load in
  document order, so a stored one points at a different shape the moment a slide
  above it gains a box, and at nothing at all in another session — the presenter's
  note taught this the expensive way, having been written the other way round
  first. So a shape being animated is given a `name` it keeps: `shape-1`,
  readable in the file, assigned in the *same transaction* as the step that needs
  it, so a name is never written for a build that failed to be made and a build
  never names something that was not named. A shape nobody animates carries
  nothing.

  The surprise was in the app, and it was one line of consequence from a comment
  Word had already written down. `addChild` says where the caret goes afterwards
  — into the node it just made — so choosing an effect turned a node selection on
  a box into a caret inside the `motionStep`, and the properties panel went back
  to showing the slide *while the reader was using it*. Both motion commands now
  commit through one helper that puts the selection back; the transition had the
  same fault and no test had caught it, because the transition's panel is the
  slide's.

  Two things only the screen decides, both about giving things back. A press
  plays the next group and does **not** leave the slide until every group has
  played — that is what a build is for. And every shape is restored when the show
  ends: a shape left `visibility: hidden` by a build nobody finished would be
  invisible in the editor afterwards, present in the document and impossible to
  find.

- **Time, and where it lives.** The first thing in this product with a
  *duration*. The decision was made and written down in
  `docs/specs/canvas-model.md` §4 long before anything needed it — precisely
  because it is the one that would have been expensive to make by accident — and
  this is the first reader, so this is where it was finally declared: a
  `motionTrack` resource holding `motionStep`s, named by the slide the same way
  the presenter's note is. A node that knows nothing about animation can still be
  animated, and a deck with no motion holds no track at all.

  **A transition names nothing**, which is why it could ship first: it is the
  whole slide arriving, so the hardest question a track raises — how a step names
  a *shape*, when a sid cannot be written into a saved document — did not have to
  be answered to get motion into the product. `motionStep.target` is declared and
  read by nothing, and that is written down in the open list rather than counted
  as finished.

  **`none` deletes the step** rather than storing the word. A document that says
  a slide has no transition and a document that says nothing are the same
  document, and keeping the second shape means every reader has to know both.

  Two things only the screen decides. The transition plays **in the show and not
  in the editor** — a deck is edited by clicking through it, and a slide that
  faded in on every click of the rail would feel like buffering. And the slide is
  **put back** afterwards, whatever ends the transition: an inline transform left
  behind by a presenter who moved on faster than the duration would move every
  handle on that slide for the rest of the session.

- **Letting a box go, and who was told.** "Neither Escape nor a click on empty
  stage deselects" had been written down as a missing gesture, and it was not
  one: both already cleared the model's selection. `editor.selection` was `null`
  while the properties panel went on offering the shape's position and the
  overlay went on drawing handles around it. **Nobody heard the clear.**

  A selection that *is* something announces itself on `editor:selection.model`; a
  selection cleared announces itself on `editor:selection.change` and on nothing
  else. The deck's overlay, panel and ribbon listened to the first alone — three
  components, one line each, and the reason the item read as a missing feature
  for a week.

  A second Escape handler was written before that was measured, and taken out
  again: the key map already had the branch, ordered so that one press comes out
  of a container *or* lets the selection go and never both. The habit of
  measuring before building is what stopped that from shipping as a key that did
  two things at once.

- **Four corners, and the boxes that had none.** One `cornerRadius` for all four
  corners is a diagram's vocabulary; a card with two rounded corners at the top
  and square ones at the bottom is what a designer asks for, and Canva, Figma and
  Keynote all give four numbers.

  The surprise was the other half. `cornerRadius` was declared on `rectangle` and
  read by the rectangle's renderer, and by nothing else: a text box, a frame, a
  sticky and a picture could not be rounded **at all** — and a rounded text box
  is what half the cards in every template are. The corners went into
  `deckPaintCss` beside the fill and the shadow, which is where "what this box
  looks like" belongs, and every box that declares them got them in one line.

  **Unset, not zero.** A corner with no number of its own follows `cornerRadius`,
  so the single field still rounds the whole box and the four are an override.
  That is why they are declared `required: false` rather than `default: 0`: a
  default would have written four zeroes nobody asked for over the radius the
  document does carry, and it would have looked like the schema working.

  A test had to change with it, which is the honest kind of churn: the check that
  a shape refuses an attribute it does not declare was written with
  `cornerRadius` on a text frame, and a text frame has corners now. It asks with
  `layoutMode` instead — a frame's, and a frame's alone.

- **Cropping a picture.** The deck could put a photograph on a slide whole or
  not at all: `picture` declared `fit`, which nothing could set, and there was no
  crop at all — the most-missed thing in every tool this product is measured
  against, where cropping is not an effect somebody goes looking for but what
  putting a photograph on a slide *is*.

  **Four fractions of the source**, which is what OOXML's `a:srcRect` stores, so
  a deck authored here and one that came from PowerPoint mean the same thing by
  the same numbers. Not pixel offsets, which stop meaning anything the moment the
  picture is replaced with one of another size.

  **The picture does not move.** Dragging the left handle cuts the left away and
  leaves the rest exactly where it was, because the box shrinks with the handle
  and the same amount of source comes off that side. The other reading of the
  gesture — hold the box still, rescale what is left to fill it — makes the whole
  picture jump and zoom while one edge is dragged, and no tool does that. Both
  halves are one command, `cropPicture`, because a box that shrank without its
  crop is a squashed picture and that is what one undo would leave.

  Three things only a browser could have said, each of which type-checked and was
  wrong. A function template takes `(props, node, ctx)` and it was written
  `(d) => …`, so every style came out empty and the picture drew zero by zero —
  indistinguishable, on screen, from one that failed to load. A resize dragged
  past the opposite edge *flips* the box, which is right for a shape and
  impossible for a picture, so the box is recomputed from the crop that was
  actually kept rather than taken from `resizeBox`. And the preflight's
  `img { max-width: 100% }` clamped a cropped picture back to its box — a crop
  that scaled nothing, with the model, the schema and the renderer all correct.

- **Where the text sits in its box.** `verticalAlign` was declared on
  `textFrame` the day the node was written and read by the renderer ever since,
  with nothing anywhere that could set it: a title centred in its placeholder was
  a document you could write by hand and not by editing. The panel has the row
  now, drawn for whatever declares the attribute rather than for a list of
  stypes — the same rule the corner radius and the frame's layout follow.

  **`textInset` is new.** PowerPoint calls it the internal margin and gives it
  four sides; this is one value, like the `padding` a frame already carries, and
  zero by default — a default is what every document that says nothing gets, and
  PowerPoint's 0.1in would have shifted the text in every deck already written.

  The part worth keeping is why it is a module and not two lines in the renderer:
  it *was* two lines in the renderer, which is why nothing tested them. A padding
  without `boxSizing` grows the box past the width the model gave it, so two
  boxes placed edge to edge overlap by their insets and the slide stops being
  what the document says. Six unit tests in `office-slides/test/text-box.test.ts`
  and one browser check that the box did not get wider — the only part of it
  jsdom cannot answer.

- **Colour, and the reason it could never be changed.** The deck's ribbon grew
  Word's two colour palettes — the text's colour and the highlighter's — and
  behind them the fix for something older than either.

  **Applying a mark appended it.** So text that was red and was then made green
  carried both `fontColor` marks over the same characters, and the reader kept
  the red: **coloured text could not be recoloured, in any product, by any
  route.** Word's palette had shipped the day before with this behind it and
  every test passed, because every test coloured text that had no colour yet.
  A run has one colour; two marks claiming otherwise is not a document anyone can
  draw, and which of them wins is whatever the renderer nested last. Applying now
  makes room first — trimmed rather than dropped, so colouring one word of a red
  sentence leaves the rest of it red — and the arithmetic is nine cases in
  `datastore/test/mark-range.test.ts`, found in one Playwright round and pinned
  down in milliseconds.

  Undo had to change with it. `applyMark` reported an inverse that took the mark
  off the range, which was near enough while applying only added; now that it
  replaces, only the list of marks the node carried can say what was cut, so both
  ends of a selection restore theirs exactly.

  **`setHighlight`, not the toggle.** `toggleHighlight` takes a colour and has
  since it was written, but it *toggles*: pressing turquoise on text that is
  already yellow takes the highlight off rather than turning it turquoise. So the
  palette applies and the button in the character group still means one press of
  Word's yellow — the same pair `setFontColor` has always had.

  **The mark that could not have been used.** `setBgColor` writes its colour into
  an attribute called `color` while the schema declares `bgColor` and the only
  reader looks for `bgColor`: it returns success and paints nothing, measured. It
  is left alone and written down in the open list, because which of the three
  ways to close it is right is a document-format decision and a control is not
  the place to make one.

  A note on where the palettes live: the deck draws Word's, not a copy, the same
  way it already draws Word's font and size boxes. Two products disagreeing about
  what a text-colour button does would be one of them wrong.

- **A shape can be designed, not just filled.** Gradients, shadows and dashed
  strokes — the first of the five steps to the level of PowerPoint, Keynote,
  Canva and CapCut, written into `docs/ROADMAP.md` the same day. A shape's whole
  style was `fill`, `stroke` and `strokeWidth`: a flat colour and a solid line,
  which is a diagram's vocabulary. It is first because everything after it needs
  it — a theme has no colour slots to resolve until a shape has more than one
  colour, and an animation has nothing worth watching until the thing it moves
  looks designed.

  **Attributes rather than a mini-language.** A gradient could be one string —
  `linear 90deg #fff 0%, #000 100%` — and then every reader needs a parser, and
  every parser is a place to disagree about a document. Four plain attributes, in
  the style of a table's `grid`: the schema stays flat, the panel binds a control
  per value, and a document that says half of it still draws. Two stops rather
  than a list, for the same reason.

  **Declared where they are read.** Word draws its shapes as SVG, where a
  gradient is a `<defs><linearGradient>` and a shadow is a filter — a different
  implementation of the same idea. Putting these in the shared schema would give
  Word attributes it does not read, which is the fault this repository keeps
  finding in itself, so they are Slides' and Word adds the SVG half when it wants
  them.

  **The command needed no change**, which is the schema-driven panel paying off:
  `setBoxStyle` builds its payload from the node's *declared* attributes, so five
  new ones flowed through it the moment the schema had them. The panel's rows are
  chosen the same way — a rectangle gets a corner radius and a group does not,
  and now a rectangle gets a gradient and a group does not.

  One measured detail worth keeping: the document stores a shadow as an angle and
  a distance, which is how every drawing tool asks for one, and CSS wants x and y.
  `cos(90°)` is 6.1e-17 rather than zero, so a shadow thrown straight sideways
  rounded to `-0px` — legal, meaningless, and the sort of thing that sits in a
  saved document's diff forever.

- **A group's box follows what is in it.** A group is not a shape a reader drew
  — it is the fact that these things move together — so its rectangle has one
  honest value: the bounds of its children. Nothing kept it there. Measured in
  the deck: a child nudged 6000 twips right stuck that far outside a group whose
  width never changed, and the handles, the marquee, the hit test and aligning
  were all reading a rectangle that had stopped describing its contents.

  **A reaction, not a step in each command**, because *anything* moves a child: a
  drag, a nudge, an align, a paste, an undo. Adding the fit to each would be one
  rule written six times, and the seventh command would forget it. It converges
  for the reason the frame layout does — the arithmetic answers with what
  *differs*, so a group that already agrees produces nothing.

  **The children move too, and that is what makes it invisible.** A child's
  coordinates are its container's, so a group's origin is the zero its children
  are measured from: when the bounds start above or left of that origin the group
  moves to meet them and every child shifts back by the same amount. Without it a
  group would jump across the slide the moment one child was nudged.

  Found by re-measuring rather than re-reading: it was the only real defect in a
  Slides list that had six features marked undone which had shipped. One test
  fixture had to change with it — a coordinate test whose group described an area
  its single child did not fill, which the rule now tightens.

- **Ctrl+Enter splits at the caret, and the caret goes with the text.** It used
  to put the break after the whole block and leave the caret *on the break node*
  — measured: the paragraph stayed whole, nothing moved, and the next keystroke
  had nowhere sensible to go. Word's own `insertPageBreak` now runs a new
  operation that splits at the caret, puts the break between the halves and
  leaves the caret at the start of the second one, all as one thing to undo.

  Three positions, because they are not the same operation: **inside** the text
  splits it; at the **end** there is nothing to move, so the new page gets an
  empty block to type in; at the **start** the whole block moves, so the break
  goes before it and the caret stays exactly where it is. Splitting at the start
  would leave an empty paragraph behind on the old page.

  One operation rather than two, because the index the break goes at is only
  known *after* the split has made the second half — a static list of two
  operations cannot express that, the second would need a value the first
  produces. The roster demanded an entry the moment it was registered, which is
  that check doing its job.

  **The column break goes the same way**, with the node type as the operation's
  only argument: "break here" means the same thing whatever is being broken, and
  two commands disagreeing about where a break lands is a difference a reader has
  to learn rather than guess. `_insertBreak`, which put a break after the whole
  block, is gone — a private method nothing calls is a second answer to a question
  that has one.

  **And the break itself had to be told where to go.** `pageBreak` was drawn as a
  bare `<div>` that never asked the layout how far down the page to sit, while
  every other block gets that from `blockStyle`. A break is *exactly* the block
  that must ask: the paginator ends the page before it and makes the break the
  first fragment of the next one, so the push that carries the flow onto that page
  is set on the break's own sid — and nothing applied it. The document grew a page
  with no break anywhere on it.

  Measured before: first half at y=427, break at 469, second half at 482, all
  three on the first sheet. After: 427, then 1176 and 1185 — the break and the
  text it moved are both on the second sheet, which starts at 1080.

  Ruled out along the way, each by measurement, which is why the renderer was the
  answer rather than a guess: the document had the three nodes in the right order,
  the break was a direct child of the surface, it rendered with its own sid so
  `measureBlocks` found it and gave it `breakBefore: true`, and `paginate` flushes
  the page on `breakBefore`. A later render and a nudge changed nothing, so it was
  not the layout pass failing to converge.


- **The Enter sweep was flaky, and its last check could never pass.** Three
  faults, all in the test.

  It reloads the whole document once per paragraph — deliberately, so one bad
  split cannot explain the next — which is around forty page loads and forty
  paginations inside one 30-second budget. That fits on an idle machine and not
  on a busy one, so it failed inside `settled()` and passed alone. It says
  `test.slow()` now, which is the honest description.

  Then a flat `waitForTimeout(450)` after Enter: a guess at how long pagination
  takes, and wrong under load. The split was *correct* — right head, right tail,
  right order — and the paginator had not placed the new paragraph yet, so the
  sweep reported "새 문단이 페이지 밖에 그려졌습니다" about a document that was
  about to be fine. It polls for the state the assertions are about now, and a
  paragraph that never lands still fails with the same message.

  **And the check underneath that was `closest('.w-page')`, which matches
  nothing.** There is no `.w-page` in this product — only a stale mention in a
  stylesheet comment — so the last of the sweep's five conditions had never been
  satisfied once, and only surfaced at all when a split got past the other four.
  A test-side version of exactly the fault this repository keeps finding in its
  own code: a name that nothing writes. The sheets are drawn *behind* the flow
  rather than around it, so "on a page" is geometry — does the paragraph's middle
  fall inside a sheet — and it is that now.

- **A page number can carry its chapter** — Word's `1-1`, `1-2`, which is how a
  manual is numbered so a chapter can be revised and reprinted without
  renumbering the book. `pageNumberChapterStyle` had been in the schema since
  page setup was written and nothing read it.

  **Every part existed; what was missing was the join.** `page-furniture.ts`
  resolved a page number, `toc.ts` found the headings and which page each was on,
  and `numbering-resolver.ts` computed what a heading is *numbered*. The new code
  is one small pure module that asks "which chapter is this page under" and
  "what is that chapter's number", and the section renderer handing the answer
  to the furniture. That is the shape most of this product's gaps have had, and
  it is the argument for re-running the sweep rather than reading the list.

  Three decisions worth keeping. The chapter's number is what the *numbering*
  gives its heading, not the heading's position — a document whose chapter
  headings are not numbered has no chapter number to print, and Word behaves the
  same way; inventing one from the position would print a page number that
  disagrees with the heading it claims to be under. It reads `counters[0]`
  rather than the rendered text, because `numberFor` renders "2." or "II." in the
  *level's* format and a prefix wants the bare number in the *page number's*.
  And the page *count* takes no chapter: `1-12` in "page 1-1 of 1-12" would claim
  the document has twelve pages in chapter one.

  `pageNumberChapterSeparator` was added with its reader, not before it —
  Word's `w:chapSep`, stored as a name, hyphen by default because `1.1` reads as
  a decimal.

- **A renderer that rearranges what it was built as is a finding.**
  `every-drawing-keeps-its-children`, the sibling of the namespace check and the
  second way a renderer can exist, run without error, produce elements and put
  the wrong thing on the page: HTML *moves a child out* of a parent that may not
  hold it. `<thead><th>` becomes a `<thead>` with a `<tr>` nobody wrote.

  Written after meeting exactly that by hand a day earlier, and it catches it —
  put the fault back and the check reports it by name.

  **Asked of the parser, not of a list**, like the namespace oracle before it: it
  writes the markup and reads back what came out. The one subtlety is *context* —
  parsing with the parent itself as the context element hides the loudest
  rearrangement HTML makes, because a `<p>` fostered out of a `<table>` lands at
  the fragment root and looks like a child that was kept. The parent is written
  inside a real wrapper, and which wrapper is asked of the parser too: anything
  the parser drops from a `<div>` is tested inside a `<table>`.

  **Two harness faults surfaced under it, both of which were making checks
  abstain while looking like they passed.**

  `drawnTagFrom` called a renderer with *one* argument where the DSL passes
  `(props, node, ctx)`. Every component that reads its own node — which is every
  interesting one — threw on `undefined` and came back as "cannot say", so Word's
  table cells and its `surface` were skipped by both drawing checks. The
  `examined` counts said so, and nobody read them as a warning; that is the
  argument for having them. Fixing it took the namespace check from 348 pairs
  examined to 442, and six real `surface > scene` pairs came with it.

  And containment turned out to be two questions, not one. `drawnAs` says what a
  node *is*; `holdsIn` says where its children *land*, which for a header drawn as
  `<thead>` holding a `<tr>` is the `<tr>`. With one function the checks reported
  the fix for a fault as being the fault.

  **One schema fault, found by the check on its first run.** All seven of a
  table's parts carried `group: 'block'`, so the schema said a blockquote may
  contain a bare `<tbody>` and a list item a loose `<tr>` — twelve pairs no
  product could draw. Only `bTable` is a block now; its six parts are reachable
  through its content expression and nowhere else. The advice was already in this
  repository's own spec, in §9.1, about vector nodes.

- **A document that is loaded is checked against the schema.** Every *operation*
  validates what it writes, so a document built by editing is checked at every
  step — and one handed to `loadDocument` went in exactly as written. A product's
  fixtures are the only documents that arrive that way, and they were the one
  place nothing looked. `validateTree` walks the whole tree and says what is
  wrong *and where*, in a path a reader can follow:
  `document/surface[1]/bTable[0]`.

  **It found a fault in Word's own document on its first run.** `docMeta` is
  `docTitle? docSubtitle? docAuthor*` and the fixture had author before subtitle
  — wrong for as long as it has existed, and invisible because the title bar
  draws the three by name rather than in document order.

  **What it adds is the arrangement.** The loader already refuses a node type the
  schema has never heard of, throwing on the way in; nobody invents a node type
  by accident and everybody nests one wrongly. And `Validator.validateDocument`,
  which existed, is one level deep — it checks the top node and its children and
  stops, which in a `document → surface → block → …` tree is the two nodes least
  likely to be wrong.

  Two smaller things fell out. `Validator.validateNode` reads `node.attrs`, and
  every document in this repository writes `attributes`: it has been validating
  an empty object for every node it was ever given, so a missing required
  attribute has never once been found by it. And the report is a *report* — the
  document opens anyway, because a reader with a file that will not open and no
  way to see why is worse off than one whose file opens with a warning.

- **A table on a slide can be edited at all.** Dragging across its cells selects
  them, the deck's toolbar has the nine commands that change a table's shape, and
  merging works. `installCellSelection` is the same install Word makes; the
  deck's overlay goes `pointer-events: none` while a box is being edited, so a
  pointer inside an entered text frame reaches the document exactly as it does in
  a page.

  **Four faults were hiding behind each other**, each only visible once the one
  before it was fixed.

  The deck ran the *shared kit's* table commands, written for a schema without
  the header/body group between a table and its rows — the reason Word replaced
  them long ago. It installs Word's now, which also read a `cell` selection.

  Then `every-command-can-be-reached` reported sixteen commands a reader could
  not reach, because the deck's conformance measured "the product's own commands"
  from **a list written in the test**: four extensions, while the kit installed
  six. The check's own note says a list "would be a fourth place to forget the
  thing the check exists to catch", and it was one. The list lives in the product
  now, as `createSlidesOwnExtensions`, and the kit and the check both read it.
  Six of the sixteen were table *formatting* commands with nowhere in a deck to
  put them, so `createWordTables({ formatting: false })` declines them rather
  than registering commands nobody can run.

  Then merging failed with "cell not found in table": **the sample deck's table
  was a document the schema refuses.** Its rows sat directly under `bTable`,
  where the schema says `(bTableHeader)? bTableBody+ (bTableFooter)?`. It drew
  perfectly — loading a document does not validate it — and every table operation
  rejected it, because `buildTableGrid` reads a table's children as groups and a
  group's children as rows, so it read each row as a group and each cell as a
  row.

  With the shape fixed, merging failed again: the deck's cells held *paragraphs*,
  and `bTableCell` is `inline*`. Word's document, `insertTable` and the schema
  all agree that a cell holds runs directly; the deck's hand-written table was
  the one thing that did not.

  **One more, found on the way out.** `bTableHeader` holds its cells directly —
  "a header IS a row" — and the renderer drew that literally: `<thead>` with
  `<th>` children, which browsers render and which is not HTML. Anything reading
  the table as a table sees a header with no rows. The header draws its own
  `<tr>` now, in the renderer rather than in the model, because the row is not in
  the document.

- **A table can be selected as one thing, and deleted.** A handle at its
  top-left corner, shown while the pointer is over the table — the gesture that
  produces a `table` selection, the last of the four kinds with nothing making
  one. Delete takes the table away.

  **The guard is the design.** `inTable` is true with a caret in any cell, and
  binding Delete to it would make Backspace the most destructive key in the
  product: a reader deleting a character loses the table. So there is a second
  context, `tableSelected`, true only after the handle has been used — and a test
  that fails if anything else ever takes a plain Delete, because a looser binding
  on the same key would win somewhere.

  **Two failures, both invisible outside a browser.** The handle sits *outside*
  the table's corner so it covers no text — which means moving towards it takes
  the pointer off the table, and the first version hid the handle on the way to
  it: it appeared on hover and the click landed on nothing. And every key binding
  is guarded by `editorFocus`; taking the gesture without letting the browser move
  focus to the button left focus nowhere at all, so Delete did nothing, which
  looks exactly like a broken command. The handle focuses the document itself
  now, which is safe because the DOM selection has already been cleared.

- **A block of table cells can be selected, and `mergeCells` works for the first
  time.** Drag across cells, or Shift+click; the block is a `cell` selection, the
  type the engine has declared since selections were written and nothing had ever
  produced. `table-selection.ts` is the arithmetic — the rectangle between two
  cells, grown until it clips no merge — and `table-selection-view.ts` is the
  pointer half.

  **Merging had never once worked.** It is the one table operation that cannot be
  expressed as "the cell the caret is in", because it needs two, and it was being
  called with `cellId` — which `mergeTableCells` does not read; it wants
  `fromCellId` and `toCellId`. So the operation saw two undefined cells and
  failed on every press, invisibly, for as long as the command has existed. There
  was no way to select the two cells it needed, so there was no way to notice.

  **Three surprises, all in the browser.** The block was computed correctly and
  written to the model correctly, and a `selectionchange` after the button came up
  replaced it with a caret — the browser places one on mouseup and neither
  `user-select: none` nor `preventDefault` stops it. The guard already existed
  for exactly this and was spelled `type === 'node'`; it is a question now
  (`holdsAgainstTheCaret`), because a selection of *whole things* has no text
  position to be overwritten by, and that was never specific to shapes. Second:
  the selected cells were marked, reported as painted, and looked identical,
  because a cell's shading is resolved onto it as an **inline** `background-color`
  and inline beats a stylesheet — the wash is an inset `box-shadow`, a property no
  renderer here writes. Third: `_cell` required `selection.type === 'range'`, so
  selecting a block turned every button on the table toolbar off.

  One decision worth keeping: a one-cell drag is a caret, not a selection.
  Washing a single cell in blue the moment the mouse moves two pixels would make
  it impossible to select a word.

  **Everything that acts on cells now acts on the block**, not on the first one:
  shading, vertical alignment, text direction, row height — all in one
  transaction, so four shaded cells are one undo. Deleting is per *line* rather
  than per cell, because four cells in one row are one row to delete; inserting
  is per cell, because two selected rows means two new rows. Guessing one answer
  for all three would have been wrong in two ways at once.

  And a test-writing lesson worth keeping: the first version of the browser test
  dragged between `nth(2)` and `nth(5)` and asserted "two cells" — then adding
  four buttons to the ribbon made it three, because a taller ribbon moves the
  table down and a straight line between two centres crossed a different set of
  boxes. It now drags between the cells that *say* `A1` and `A2`, and waits for
  each box to stop moving before pressing: `settled()` waits for the page count
  to stabilise and the table is still being placed after that.

- **The text has a colour control, and it never had one.** `setFontColor` and
  `removeFontColor` have been in Word's kit since the kit had marks, registered
  and working, on no toolbar and bound to no key — **this word processor could
  not change the colour of its text.** They are the *shared kit's* commands, so
  `every-command-can-be-reached`, which asks about the commands a product adds,
  could not see them. That is the check's honest limit and it is written in the
  check; what it means in practice is that a gap this size sat in plain sight.

  Found by pulling on the shading control's own comment: three fixed fills and a
  note admitting a colour picker was "a second dialog to build before the common
  case works at all". True of the picker and not of the *control* — text colour
  was the same shape with nothing at all, so **one `ColorPalette` answers both**,
  and neither is three colours a reader has to accept.

  **What made it more than a dropdown.** Nothing in a ribbon may take focus from
  the editor: a command acts on the selection and the selection goes with focus,
  which is why every control here fires on `pointerdown` with the default
  prevented. A colour panel is the first with something *inside* it that could
  take focus, so the swatches are pointer-driven too and the one focusable
  element is deliberate — the browser's own `<input type="color">`, which is the
  picker the reader already knows and the answer to "what about the sixteenth
  colour".

  Two smaller ones: the palette had to be added to `toolbarCommands()` by hand,
  because it is not a `ToolbarControl` and the list that proves every button has
  a command behind it would otherwise have been quietly incomplete. And `canRun`
  has to be asked with a real colour in the payload — `setFontColor` refuses one
  without, so asking with an empty payload reports the control as permanently
  unavailable, which is exactly how the deck's picture button came to be dead.

- **Cell shading can be set, and all three of its parts are read.** `shadingFill`
  had been drawn since tables were drawn and nothing had ever set it — a document
  that arrived shaded looked right and a reader could not shade anything.
  `setCellShading` acting on the selected block, which is why this had to wait for
  a cell selection: shading one cell at a time is not what anybody means by
  shading a header. It arrived as four fixed buttons and is a palette now — see
  the entry above.

  **The surprise was in the reading, not the writing.** The same two fill-only
  lines were written out four times in `css.ts` — table, row, cell, paragraph —
  and `shadingColor` and `shadingPattern` were both on the list of attributes the
  schema declares and nothing reads. One `shadingCss` replaced all four and reads
  the pattern: `solid` shows the *pattern* colour and ignores the fill, which is
  Word's reading and surprises people; `pctN` is N% of the pattern colour over
  the fill, as a `color-mix` rather than a stipple, because a real dot pattern
  aliases into stripes at any zoom; stripes and crosses are repeating gradients
  at the angle their name says.

- **Word offered commands for things it could not draw, and no longer does.**
  Found by the conformance harness within an hour of it existing and confirmed in
  the running app: `insertCallout` reported success, put a `callout` in the
  document, and drew nothing — the reader's text in the model and invisible on
  the page. `word-kit` was calling `createRichExtensions()`, the whole
  rich-editor bundle, so Word registered an insert command for every node in it
  and had renderers for about half.

  Closed in two halves, months apart. The commands went first: Word names the
  extensions it can draw one at a time, an extension may bring a *default*
  renderer registered only if nothing has claimed the type, and three checks were
  written so it cannot come back — `every-command-can-be-seen`,
  `every-command-makes-something-real`, `every-insert-is-accounted-for`. The
  schema was the other half and stayed open: the node types were still declared,
  so a document arriving with one still drew nothing. That is the entry below.

- **The office schema declares what it offers.** It used to take the standard
  schema's node set entire, so both products wrote off what they could not draw:
  Word thirteen lines marked `BUG:` and ten marked "inherited", Slides
  twenty-three marked "inherited". `OFFICE_STANDARD_NODES` now names the
  thirty-one types an office document is made of, and forty-six exemption lines
  across two products became zero.

  **The surprise** was how exactly the two lists agreed. Not "nearly the same
  list", which is what this was logged as — measured against each product's
  renderer registry, the sets are *identical*: the same twenty-five standard
  types undrawn by both, of which two (`footnoteDef`, `commentThread`) are drawn
  by the layout pass and the app and keep their reasons. There was nothing to
  reconcile between the products; the schema was simply claiming a domain it did
  not have.

  Second surprise: the ones office keeps *and does differently* were hiding in
  the list. Equations are OMML node names, a contents page is `tableOfContents`
  computed from the headings, and page numbers are `page-furniture.ts` resolving
  a node to text mid-draw. Each had a standard-schema twin sitting unused beside
  it — a second way to say the same thing, which is not a spare but a second
  thing to keep working.

  And one that only the app could catch: `fieldPageNumber` and `fieldPageCount`
  looked inherited and are Word's — the sample document's footer holds both,
  among the words and tabs of an ordinary paragraph. They are in `word-schema.ts`
  now, because a slide has no page it is on. Every unit suite passed with them
  wrongly dropped; the document that used them lives in `apps/`.

- **A frame is a block, so a document can have one.** Two columns of text or a
  row of cards in Word without drawing a table and switching its borders off:
  `insertFrame` and three ribbon buttons, a `<div>` with `display: flex` or
  `grid`, and paragraphs inside it that the browser lays out.

  **Three surprises.** The schema refused it, because every placed node must
  state a width and a frame in the flow has none to state — the requirement
  belongs to *placed*, not to *frame*, and a width written into a document would
  go stale the first time a margin moved. Eight conformance exemptions
  (`frame > rectangle`, `group > frame`, six more) each carried one sentence —
  "in Word a frame is a div and a drawing is SVG" — which is a **content model**,
  not something a check cannot know: `word-schema.ts` now says `frame: 'block+'`
  and `group: 'scene+'`, and all eight exemptions are gone. An exemption that can
  be turned back into a rule was never an exemption.

  And the one that decides how a single arrangement serves two products:
  `childrenToLayOut` gives the arithmetic only the children that **have a size**.
  Every scene node has one and no flow block does, so a canvas frame computes
  coordinates and a document frame computes nothing and lets CSS do it. Written
  up as §5.1 of `docs/specs/canvas-model.md`.

  Two smaller ones, both "a box with nowhere to put a caret": an empty frame, and
  then an empty *paragraph* inside it — 307 pixels wide and zero high, so neither
  half of a new frame could be clicked into.

- **Typing in the same tick as the click went to the previous paragraph.**
  `selectionchange` is asynchronous, so for a moment the DOM knows where the
  caret is and the model does not. The edit was always right —
  `getTargetRanges()` reads the DOM — but the render after it restored the caret
  from `editor.selection`, which still held the position from before the click,
  and every character after the first went there. The input handler now tells the
  model where the typing is *before* committing, with `applySelectionToView:
  false`, because the browser's caret is already correct and a second writer is
  how carets start fighting.

  **The surprise** was where it reproduces. Two ordinary paragraphs do not, even
  with an edit immediately before the click — tried, green with the fix reverted.
  Two halves of one frame do, every time: editing one child of a frame redraws
  the frame's subtree, so the node the click is about to land in is a *new* node.
  How much the render replaces is what opens the window.

  A second thing fell out of it: `apps/word/tests/helpers.ts` `placeCaret` was
  polling for `selection.type === 'range'`, which is already true whenever
  anything has been clicked before — so it returned instantly on the *previous*
  caret and 56 tests were quietly waiting for nothing.

- **Nothing could make a frame in Slides.** Drawn, arranged, and adjustable from
  the properties panel since auto-layout was written; the only frames that
  existed were the two in `sample-deck.ts`. One line in `box-commands.ts` and a
  toolbar entry. It starts unarranged — turning layout on is the reader's
  decision — and with a pale fill and an outline, because a container arrives
  empty and one that is neither filled nor outlined cannot be found or dropped
  onto.

- **A selection could not be extended past the end of a marked run**, and an
  inline decorator's text was missing from the run index. One cause, found by
  measuring the second: `buildTextRunIndex` took a `normalizeWhitespace` option,
  on by default, that trimmed every run and skipped any run made only of
  whitespace. Five of its six callers passed `false`. The sixth was the
  DOM→model direction of the selection handler, so **the two directions of one
  conversion were reading indexes that differed by exactly the whitespace**.

  What that looks like from the outside: bold a word, hold Shift and the right
  arrow, and the selection grows to the end of the marked run and stops dead. A
  mark splits the paragraph, one of the pieces is a lone space, a lone space got
  no run — so the browser's position inside it was absent from the reverse map,
  the conversion snapped to a run boundary, and the model answered with the
  offset it started from. The app then wrote that answer back to the DOM, undoing
  the browser's move, once per press. The raw event log is two lines and says the
  whole thing:

      press 1   dom " "@1  ->  model 35  ->  dom " "@0
      press 2   dom " "@1  ->  model 35  ->  dom " "@0

  The option is gone rather than defaulted the other way: an index whose purpose
  is to say which character sits where cannot hold a different text than the page
  does, and five callers already knew it.

  With the boundary crossing again, the decorator half could land. A comment
  anchor is a decorator and the index skipped decorators wholesale, so ten
  commented characters were absent and a paragraph of 68 indexed as 58 — every
  offset at or past the comment resolved to the wrong text node. The distinction
  that fixes it is the decorator system's own: `data-decorator-category="inline"`
  means the decorator *wraps* text that is already there, and only the other
  categories draw content the model has no character for.

  The two were logged as separate entries, one blocking the other. They were one
  bug, and the second was only visible because the first had been masking it.

- **A second overlapping mark corrupted the text, in both products.** Bold then
  italic rewrote the paragraph — "Contents" became "Conten" nineteen times over,
  and undo could not get it back. Four things are worth keeping from it.

  *The cause was the reconciler, not the observer.* Nesting a second mark inserts
  a wrapper, so the new inner span pairs with the outer one — which is holding
  the text — and kept it while the inner span drew it again: `a bb c` became
  `a bbbb c`. The observer then read that doubled DOM back as typing and wrote it
  into the model, which is where the nineteen came from. Fixing the reconciler
  made the observer change unnecessary; it was measured working and is not
  needed, and sits in a stash if it is ever wanted for its own sake.

  *It only happens where the wrappers share a tag.* Marks defined as `<strong>`
  and `<em>` cannot pair with a plain `<span>`, so a fresh element is built and
  the stale text goes with the old one. Every test in `renderer-dom` defined its
  marks that way. Both products define theirs as spans with classes.

  *The mark tests could not see the size of the text they asserted on.*
  `normalizeHTML` runs each text node through `.replace(/\s+/g,' ').trim()` and
  strips whitespace between tags, so ` and `, `and` and `` all compare equal.
  Under it, a second defect had been sitting in the open: a whitespace-only run
  was pruned as an "empty" wrapper, so bolding a single space **deleted** it —
  and double-clicking between two words selects exactly that. The DOM was then a
  character shorter than the model at every offset past the mark.

  *So characters are now asserted separately from structure*, in
  `mark-keeps-every-character.test.ts`, which compares `textContent` with nothing
  normalized. It fails on four counts without the whitespace fix and six without
  the reconciler fix, and it took milliseconds to write once the question was
  "how much text" rather than "what shape".

- **`mirrorIndents`, and hyphenation.** A paragraph that indents from the spine
  swaps its indents on a left-hand page — which needed the page a block lands on,
  and the shown number rather than the index, since a section that restarts its
  numbering restarts which side it is on. Hyphenation needed three attributes at
  once and had readers for none: the switch is the document's, the exception is a
  paragraph's, and a browser hyphenates by dictionary so neither is any use
  without a language on the text.
- **A function attribute that resolves to nothing drew its own source.** The
  vnode starts from the template's attributes, functions and all, and each is
  overwritten by what it resolves to — so one that resolved to `undefined` left
  the seed in place and the DOM read `lang="(d) => …"`. Returning nothing is how
  a template says an attribute does not apply, so every attribute that is
  sometimes absent was drawing its source the rest of the time. Fixed in
  `renderer-dom`, with a test.
- **Six character effects nobody could see.** `outline`, `shadow`, `emboss` and
  `imprint` drew nothing when they arrived as a character format — they are also
  *marks*, and the sweep counts a name read for a different meaning as read, so
  it reported three of them covered. They share one definition now, because a
  style and a mark saying the same thing have to draw the same. `kerning` is not
  a switch: Word stores the minimum font size it applies from, so the run's own
  size decides. `noProof` is not a format at all — the browser's spell checker is
  turned off by an attribute, so it goes on the element.
- **Zoom.** A `transform: scale`, not the `zoom` property — a page must break in
  the same place at every size, and a transform is visual where `zoom` is
  layout: measured, a paragraph keeps all eight of its lines under a transform
  and every length comes back multiplied by exactly the factor, where `zoom`
  gave 77.88px for 78. Three things it turned up. The measurement pass divides
  the factor back out, and reads it from the element rather than being told,
  because a measurement that has to be told the zoom is wrong whenever somebody
  forgets. A scaled element still occupies its *unscaled* room, so the frame
  around the page is given the drawn size. And the ruler's arithmetic needed no
  change — it works in fractions of the page — but it mixed the two scales:
  `getBoundingClientRect` reports the transformed box and `getComputedStyle` the
  untransformed value, so subtracting one margin from the other width put the
  text area 19px from where the text is.
- **A View group in the ribbon.** The only controls there that name no command:
  the editor has no idea a pane exists, which is the same reason the find box is
  the app's. Both switches drive one piece of state, so the pane's own close
  button and the ribbon button cannot disagree — two switches for one thing is
  two things a reader has to keep in their head.
- **The comments pane collapses.** It read the threads only while open, which
  was free and wrong the moment it could be closed on purpose — the strip that
  opens it says how many there are, and that is what a reader wants *before*
  deciding to look. Reading them either way also means the commented text stays
  marked while the pane is shut: closing it should put the discussion away, not
  hide the fact that there is one.
- **The shell, and the outline pane.** The window is the frame now — the chrome
  holds its place and the document scrolls in a pane of its own. Two things came
  out of it: the ruler had to learn to re-measure when that pane scrolls
  *sideways*, because a page wider than its pane moves under a ruler that does
  not; and a test that slept 800ms for a smooth scroll of seven thousand pixels
  was guessing at a number it should have been waiting for. The outline itself
  needed no new reading of the document — `tocEntries` already answered it,
  which is why a line there and a line in the contents agree by construction.

- **Tab leaders, and the paragraphs a contents list leaves out.** A menu on the
  ruler is drawn *inside* it, so every click in the menu was also a click on the
  ruler — a dot leader made a stop with no leader. And the dismiss-on-click-away
  listener runs at the capture phase, so it closed the menu ahead of the click it
  was meant to allow.
- **The ruler.** Three faults, all in the browser half: the margins are the
  *section's* padding and not the sheet's (a sheet is paper, drawn behind the
  text, and carries none); writing on every pointer move made one drag ten
  entries of the document's history and ended wherever the last processed move
  was; and taking hold of a stop and letting go is both how Word cycles its
  alignment and how a drag begins.
- **Tab and Ctrl+M.** Ctrl+M was bound to `indentNode`, which needs a schema to
  mark a node `indentable`, and none does — Word's own indent shortcut, dead.
- **One font per run.** Reading Word's three font slots was tried and reverted:
  CSS chooses by *coverage* where Word chooses by *script*, and a near-miss of a
  rule is harder to reason about than one font.
- **The operations a reader could not undo.** Fourteen roster exemptions saying
  "declares no inverse" about an operation that had since been given one. Ctrl+X
  and Ctrl+V were undone by nothing at all. `batch` is the primitive the nine
  that change more than one place were missing.
- **Reading a range that crosses two runs.** It came back empty — the iterator
  began at the document's root, and `getRootNodeId()` is undefined until one is
  registered, so the walk started at `undefined` and stopped before its first
  step. Five operations took that as "there is nothing here" and reported
  success.
- **A paragraph the text wraps around, when it will not fit.** Three separate
  faults, and the line heights were the subtle one: ink scaled up to the block's
  height is right for text and wrong for anything measured as a box, so the
  picture's band was drawn 98px and reported as 117.

- **Copying a block into another site.** A page's blocks refer to five things by
  name and a name means nothing elsewhere, so a paste into a second document
  produced an empty placement, an empty list, a broken image, a form that sends
  nowhere, or a colour nobody chose — and every one of them *succeeded*. The
  clipboard carries the definitions now and a paste adds the ones the
  destination has not got, by name and never renamed. Two findings on the way.
  `pasteBlocks` could not paste into a second window at all: its `canExecute`
  asked whether *this* extension was holding something, which is the careful
  answer and the one that makes the system clipboard unreachable in exactly the
  case it exists for — a greyed menu item reads as a decision, so nothing said
  so. And two of the five references had no check anywhere: a dataset is checked
  by the collection that reads it and a file by the picture that draws it, while
  a `componentId` and a `var:이름` pointing at nothing were reported by nobody.
- **A list the visitor's browser fetches again.** The deliberate second mode
  `refreshDataset` was written to avoid, now that there is a reason for it: a
  price that changes hourly. It does not re-render — shipping a renderer is the
  runtime this export exists without — it ships the drawing it already made,
  marked with where it came from, which row is which, and which words came from
  which column, and the script writes the cells. The filter-sort-limit is the
  one rule in this product written twice, so the test runs `rowsOf` and the
  shipped script against the same rows.
- **What opening a browser found, after all five features passed their
  tests.** Four faults, and every one of them was invisible to the checks that
  existed because each check asked the *document* a question the reader never
  asks.
  - **Every site-wide panel row was write-only.** `of` says which node a row
    writes — the document, for the site's address, its faces, its tab picture,
    what a crawler is told — and nothing read it, so the rows took their value
    from the selected node, which does not have the attribute. The address came
    back empty; the 검색 제외 switch flicked back up the moment it was let go,
    because React redraws a controlled checkbox from a value that was always
    `undefined`. Older than this week's work: `setSiteAddress` had it too.
  - **The site's type never reached the boards.** The rule was built from
    `root`, which on that screen is the *page* being drawn, so `typeRule` was
    handed attributes that never held a `scale` and emitted the defaults for
    ever. Changing the face changed the published page and nothing a designer
    could see.
  - **`baseSize` was the one length read as pixels.** The panel's `unit: 'px'`
    has always meant *stored in twips*; a reader typing 20 wrote 300, 300 is
    outside the bounds, and the site went on at 16 saying nothing. It is twips
    now, like everything else, with `baseSizeOf` the one place it converts.
  - **A table had no table in it.** Nothing in `page-css.ts` had ever mentioned
    one, so a comparison drew as four words in a row: no borders, no padding,
    156px wide. The model was right, the cells took text, the eight commands
    worked.

- **Two inks, and the nine sentences a layout could not say.** The sample was
  redrawn from a green SaaS page to a charcoal-and-signal-red editorial one, and
  the redraw is what found the list. `rotate`, `blend`, `backdropBlur`,
  `letterSpacing`, `lineHeight`, `overlay`, `span`, `centred` — and `opacity`,
  which `paintCss` had read and a panel row had offered since the day both were
  written while **the schema never declared it**, so the row wrote an attribute
  the validator threw away. The harness asks whether every declared attribute is
  drawn; nothing asked the question the other way round.
  - **An attribute has to be in four places to be alive**: schema, renderer,
    panel row, and the command's `FORMAT` whitelist. Six shipped with three of
    the four — controls that light up and write nothing — and the conformance
    check could not see it, because it asks whether a row exists and not whether
    the command the row names accepts what the row sends. The browser sweep
    caught them.
  - **A run cannot follow a token.** A mark's colour is a CSS string and `named`
    resolves references on a node's attributes; a mark is not one. Forty-seven
    hard-coded colours in a document with ten tokens. Most of them were the
    muted grey, which is now one rule against `currentColor` in `page-css.ts`;
    the accent ones became plates, which is what the discipline wanted anyway.
    Three statistics and two button labels are still literal.
  - **The footer went black on black** the moment those run colours went: it
    said what it was painted and never what it was written in, which is the
    fault `ink` exists to make impossible.
  - **A band with a centred measure could not be said.** It worked by accident —
    a centred flex child is as wide as its content — so seven headings of one
    page began at three different left edges. `centred` says it; deriving it
    from *has a maximum width* was the first attempt and centred every reading
    measure on the page.
  - **Korean wraps mid-word** without `word-break: keep-all`, which the sample's
    own headline demonstrated. Paired with `overflow-wrap`, or one long id
    pushes the page sideways.
  - **The header's frosted bar is a literal `rgba`**, because a token holds one
    colour and this needs that colour at a weight. The day 종이 changes, the bar
    does not follow. A token that can carry an alpha, or a way to say *this
    token at 82%*, is the thing missing.
- **`every-row-writes-what-it-names`, and the six dead controls it found.** The
  harness could ask whether an attribute has a panel row and not whether the
  command that row names will accept it — so six attributes shipped declared,
  drawn and offered, with the command refusing every one, and every check green.
  The new check uses each row for real and asks the document whether it moved.
  On its first run: `ink` had **never written anything** since the day it was
  added (the attribute a band's readability rests on, settable only by editing
  the document by hand); an accordion's `opens`, `openAtRest` and `opensOne` the
  same; and 제목 단계 sent `'4'` into a number attribute, because a `<select>`'s
  value is always a string — the panel asks the schema and converts now.
  The probe was wrong twice before it was right, both worth keeping: it wrote a
  value the node already held, and it walked one page while a third of the rows
  are for nodes on other pages or for the pages themselves. 38 unanswered became
  14, and those 14 are listed by name rather than left as a number.
- **A table in the sample, and every insert it broke.** Eight table commands
  were registered and measured by nothing, because the one document every probe
  runs against had no table in it. The pricing page's four boxes became a real
  comparison — which is what the sentence above them had been promising — and
  within the hour it turned up that **every insert in the product was dead while
  the caret was in a table cell**: both walks that climb from the caret to a
  place a block goes stopped at the cell, whose parent holds cells and nothing
  else, so each insert put a frame in a table row and the validator threw it
  away with the control still lit. The rule is one function now and it asks the
  schema rather than keeping a list. Command probe: 25 unanswered → 11, and the
  eleven are printed by name.
- **`var:이름/82` — a token at a weight.** The gap recorded when the sample's
  frosted header bar had to be a literal `rgba(...)`: a token holds one colour
  and a design wants it at a fraction constantly, and a hand-written fraction
  stops following the palette. A suffix rather than a second token (a token per
  weight is how a palette becomes forty names), a slash because that is CSS's
  own, mixed toward `transparent` because the resolver cannot see the ground and
  an alpha works wherever a colour goes, and only on a colour — a weight on a
  word would put `color-mix(in srgb, Barocss 82%, transparent)` into a
  stylesheet, which a browser drops silently. Everything that counts, renames or
  carries a reference reads through `varNameOf`, so none of them changed. The
  bar is `var:종이/82` now, and a test repaints the token to prove it follows.
- **The other three pages, redrawn — and three faults underneath them.** 제품,
  소개 and 블로그 had no plates, spent the second ink on decoration (one blog
  cover carried more red than every button and badge on the site together), and
  in 제품's case laid six identical cards in a 3×2 grid. Fixing the drawing
  turned up three things the drawing was hiding. **A form's controls had no CSS
  at all** — a label 290px wide over a box 147px wide, on every form this
  product has ever published, because a text input's width comes from a `size`
  attribute nobody set. **A date column stated only a minimum**, so one longer
  date pushed its row's title four pixels right. And **the accent could not
  carry words**: `#E03A1F` with the paper on it is 4.24:1, under AA at body
  size, on every button and price on the site, looking fine the whole time.
  `#D6341A` is 4.65:1 and indistinguishable beside it. The rule: an accent that
  carries words has to be measured against them. There is a browser check now
  that walks five published pages at two widths and composites every colour
  against the ground behind it — which is the only place it can run, because two
  of the three inputs it needs do not exist until there is a layout.
- **A code block in the sample, and the stale palette under it.** Prism
  highlighting, a language row and a whole renderer, and no document in the
  repository contained a code block — so nothing had ever drawn a highlighted
  line and every probe filed the language row under *could not ask*. Putting one
  on the blog turned up the theme: its header claimed the colours were against
  `currentColor` and six of nine roles were hard-coded hex, one of them the
  brand green that had not existed since the palette was redrawn. Measured, the
  string colour is 4.05:1 on the light code ground and **all six fail on a dark
  band**. Roles are told apart by weight now — every colour is `currentColor`,
  so it reads on either ground from one rule — with `deleted` and `inserted`
  keeping a hue, because no amount of weight says which of the two is which.
  A syntax palette the document owns is the feature this defers; it is in the
  spec's open list.
- **The row probe could not write a choice with two options.** 목록 종류 offers
  글머리 and 번호: one is the fallback and the sample's list is the other, so the
  probe found nothing to send and filed a working control as unaskable. It takes
  the fallback now when that is the only value the node does not already hold.
- **An exemption answered a question it was never asked.** `sends` had a panel
  row, a command, and no entry in that command's field list — the 보낼 곳 연결
  picker on every form had accepted a choice and thrown it away since forms
  existed. The row check *found* it, and an exemption written months earlier
  about whether the attribute is **read** silenced the finding, because an
  exemption is keyed by its subject and never by the check it was written for.
  An exemption can name the checks it covers now, and one excusing a check it
  does not name is a finding — not an error, since one reason genuinely can
  answer two (a page has no coordinates is why a rectangle is neither drawn nor
  nameable). Fifteen site exemptions, one deck, five word were exactly that and
  now say so. Also: a command's refusal is two answers — *no state* and *not
  this field* — and the second was hiding inside the first; they are told apart
  by asking the same command for something it certainly takes.
- **A file field.** The one kind `FIELDS` was missing, and the one whose
  presence changes the *form*: a browser cannot carry a file in the default
  encoding, so a form with a file field and no `enctype` sends every other
  answer and silently drops the attachment. `needsUpload` asks the fields and
  the form writes `enctype` only when one is a file, so every form already
  published is unchanged. Disabled rather than read-only on the board —
  `readonly` means nothing to a file input, so a designer would open a picker by
  clicking it. And whether the service at the far end accepts multipart is said
  as a fault rather than guessed: it is a fact about somebody else's server, and
  assuming it would tell a reader their form works while the file is dropped.
- **Resize handles, a `+` doorway, and the three icons that were words.** A flow
  page has no coordinates, so a block gets two handles rather than eight: the
  right edge writes `maxWidth` (and `minWidth` on a fixed block) and the bottom
  writes `minHeight` — never `maxHeight`, which clips. Written once on release
  in twips, the padding band's rule. The first version shared six pixels with
  that band and won them, so a padding drag silently stopped writing; handles
  are outside the box now — *inside the edge is the space in it, outside is how
  big it is*.
  The `+` beside the tool is a fourth **doorway**, not a fourth list: same
  declaration as the rail plus the document's definitions. It needed the page
  passed in, or every entry is greyed on a fresh site. And putting that list
  where somebody was looking at it found **three icons drawn as their own
  names** — `accordion`, `tabs`, `form` had no glyph, in the rail too, since the
  day those blocks were added, with `every-icon-has-a-picture` green because a
  missing icon's family is `icon` and an exemption about the *favicon attribute*
  is keyed `icon`.
- **Still not Excel.** The dataset grid (rail → 데이터 → ✎) edits column names,
  columns, rows and cells. A block of cells cannot be pasted into it and moving
  between cells is the browser's tabbing, not a grid's.
- **The data grid, made to feel like a spreadsheet.** A block of cells pasted at
  the focused cell, and movement by direction. The paste is **one command and
  one undo** — forty cell writes is forty presses of undo with a half-pasted
  table in between. Rows grow to fit (stopping short would silently drop the
  rest and look like it worked); columns are trimmed, because a column has a
  name a reference resolves through and a paste cannot invent one. A single
  value with no tab or newline is left to the browser, which does it better.
  The arrows: up and down always, sideways only from an end — those keys belong
  to the caret while there is a word to move in. Written first as a `keydown` on
  the container and it never fired: `TextField` stops the event on purpose so a
  committing Enter cannot reach the paragraph behind it, and `onKeys` is the
  door it declares for this.
