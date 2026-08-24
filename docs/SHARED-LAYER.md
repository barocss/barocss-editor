# What two products should share

Written after Slides shipped, from what it actually needed — not from a guess at
what a third product might. Every number here is measured; the script is in the
last section so it can be re-run when it stops being true.

## The rule

**Share what two implementations disagreeing about would be a bug. Copy
everything else.**

That is the whole of it, and both halves were demonstrated the week Slides was
built:

- The list marker and the caret filler lived in `apps/word/src/style.css`. The
  second product to draw the same text got neither, and a deck's bullets came
  out as four unmarked lines. Two products disagreeing about whether a computed
  marker is drawn is not a design choice — it is one of them being wrong. **Now
  shared** (`office-word/text.css`).
- Word draws `rectangle` as an SVG `<rect>`; Slides draws it as a placed HTML
  box. Word's list marker comes from its numbering; Slides' comes from
  `listType`. Neither is wrong. **Copied and adjusted**, and the second one lives
  in `office-slides/slides.css` rather than as a branch inside a shared renderer.

The trap is the third category: things that *look* shareable but are two
products' answers to one question. `list` was one. A shared renderer would have
had to ask which product it was rendering for, which is worse than two
renderers — a shared thing that knows about its callers is not shared, it is
coupled in both directions.

## The zoom control, as a worked example

The clearest case so far, because the two products' zooms *feel* different and
the question is what that means for the code. Measured:

| | Word | Slides |
| --- | --- | --- |
| Range | 0.25 – 4 | 0.1 – 8 |
| Fit | the **width** | both dimensions |
| Wheel | changes the number | anchored to the pointer |
| Panning | scrollbars | space-drag |

Every one of those is right for its product. A page is tall and scrolls, so
fitting its height leaves the text too small to read; a slide is a fixed aspect
looked at one at a time, so fitting one dimension leaves it clipped. A page at
10% is unreadable and a deck at 10% is a contact sheet. A reader zooming a
document is *reading* and the text stays against the left margin either way; a
reader zooming a canvas is *pointing at something*.

So none of that is shared. What is shared is the **widget** — minus, a
percentage you can type into, plus, a fit button — because two products
disagreeing about where those are, or about whether "150%" can be typed, is one
of them being wrong.

That is the rule applied to something that felt like a hard case and was not:
the split is not between products, it is between *how a control is drawn* and
*what the product does with it*. The same seam as the toolbar.

## What Slides actually took

It began as three import sites and four symbols:

| From `@barocss/office-word` | Used for |
| --- | --- |
| `registerWordRenderers()` | the entire text stack — paragraphs, runs, marks, lists, tables |
| `WORD_ENV_KEY`, `createWordEnv()` | style resolution: a renderer resolves a node against the document rather than reading its attributes |
| `text.css` | the two rules CSS has to finish |

Four symbols out of a package of ~13,800 lines: **narrow and load-bearing**.

### Re-measured, and it has grown a second half

**22 import sites, 65 symbols**, and the growth is all one thing: the *canvas* moved here as it
was built, one feature at a time.

| What Slides now takes | Why it is here and not there |
| --- | --- |
| the text stack (the original four) | two products drawing a paragraph differently is one of them wrong |
| the **arrangement** — `layoutChildren`, `fillChildren`, `laysOut` | a frame is a scene node; one document must arrange the same way in both |
| the **connector** — geometry, caps, labels, routing, `layoutGraph` | two answers for where a line leaves a circle is one document drawn two ways |
| the **component** — `componentsOf`, `instanceParts`, the signatures, the import plan | the office schema declares `component` and `instance`, so a card is in the document format both products read |
| `canvasChildrenOf`, `copyOf`, `CanvasAccess` | a copy that keeps its sid gives two nodes one identity, and every DOM-to-model mapping resolves through a sid |

Each move passed the test at the bottom of this file — *can it be stated without naming a
product?* — and each one left the product's half behind: the panels, the commands that need "the
surface the reader is on", the deck library, `isSlideSurface`.

**Which makes the naming problem worse rather than better, and that is the finding.** A deck now
takes a third of its canvas from a package called `office-word`, and none of the five rows above is
about a word processor. The extraction below is no longer only tidiness; the dependency it would
straighten is now load-bearing in both directions of the reader's understanding.

## Where the seam actually is

Measured by following relative imports from `renderers.ts`:

| | files | lines |
| --- | ---: | ---: |
| Reachable from `renderers.ts` | 24 | 6,111 |
| Not reachable — already Word-only | 33 | 7,726 |

The Word-only half is already separate and needs nothing done to it: commands,
key map, kit, schema, toolbar, ruler, print, find, revisions, tracking,
comments, measurement, the layout pass, math authoring.

**The obstacle is one file.** `renderers.ts` is 1,077 lines and defines both the
text renderers and Word's `surface` — a section drawn as the pages its text
reached — so importing the first drags in the second, and with it `pagination`,
`layout`, `table-pagination`, `page-furniture`, `line-numbers` and `toc`: about
1,400 lines of page machinery that a deck has no use for and, being renderers,
cannot tree-shake away.

So the boundary is not a refactor of a package. It is a split of one file.

## The proposal

**Two** packages, and the second one is what building the canvas discovered.

An `office-text` package holding what both products *draw text with*:

    document-access   style-resolver   formatting   css
    numbering-resolver   field-resolver   footnotes
    table-format   table-style   tabs   shapes   image-layout
    renderers for: paragraph, heading, run, marks, list, table, image, math
    render-context (the env channel)
    text.css

An `office-canvas` package holding what both products *place things with* — every file already
named `canvas-*` in `office-word`, which is the boundary drawing itself:

    canvas-access   canvas-layout   canvas-layout-commands
    canvas-connector   canvas-graph-layout
    canvas-component   canvas-instance

That list is not a plan; it is a measurement. Those seven files arrived one at a time, each because
a deck needed it and *neither product could be allowed a second answer* — and every one of them
would read the same if Word had never existed.

Word keeps everything about a *page*: `surface`, pagination, layout,
furniture, line numbers, contents, plus all 33 files already outside the
closure. Slides keeps everything about *placement*: `surface`, geometry, the
scene renderers, `slides.css`.

Note what moves and what does not: `surface` is in **both** products and in
neither shared package. It is the node where a page and a slide genuinely
disagree, and that is the shape the whole boundary takes.

### Do it before the third product, not now

Two products give one data point about where the line is; the numbers above are
that data point and they are worth keeping. A third — a board, a page builder —
will disagree with both, and its disagreement is what makes the boundary right
rather than merely tidy. Extracting now would mean drawing it from Slides alone,
and Slides is the product that reused everything.

What should happen first is smaller and unblocks it:

1. **Split `renderers.ts`** so `surface` and the page renderers are in their own
   file. This is worth doing on its own merits, costs nothing, and turns the
   extraction into moving files rather than untangling one.
2. **Make the registry seam explicit.** Slides overrides five node types by
   registering after Word and relying on last-write-wins. It works and it is
   nowhere stated. A product should be able to say it is overriding, and be told
   when it overrides something nobody expected.
3. **Name the coupling.** `@barocss/office-slides` depending on
   `@barocss/office-word` means "Word" is load-bearing in a product that is not
   Word. `office-slides/slides.css` importing `office-word/text.css` is not
   sharing, it is a dependency pointed at a sibling. This got heavier, not
   lighter: a third of what a deck's canvas does now lives in `canvas-*` files
   inside the word processor, and none of it is about a word processor.
4. **`office-canvas` may not need the third product.** The argument for waiting
   is that Slides alone cannot say where the line is — true of the *text* stack,
   where Slides reused Word's answers. It is not true of the canvas: those files
   were written for a deck and Word reads none of them, so the line is already
   drawn by which package the code was written in. Waiting there is buying a data
   point about a boundary that has nothing on the other side of it.

### The test for anything proposed as shared

**Can it be stated without naming a product?** `text.css` fails that test on its
filename today, which is exactly why it is on the list above rather than
considered finished.

## Re-running the measurement

```sh
# What Slides takes from Word: import sites, and distinct symbols
python3 - <<'PY'
import re, glob
sites, syms = 0, set()
for f in glob.glob('packages/office-slides/src/*.ts') + glob.glob('packages/office-slides/test/*.ts'):
    for m in re.finditer(r"import\s+(?:type\s+)?\{([^}]*)\}\s*from\s*'@barocss/office-word'",
                         open(f).read(), re.S):
        sites += 1
        for part in re.sub(r'/\*.*?\*/', '', m.group(1), flags=re.S).split(','):
            name = part.strip().replace('type ', '').split(' as ')[0].strip()
            if name:
                syms.add(name)
print(f"{sites} import sites, {len(syms)} symbols")
PY
```

```sh
# The import closure of the renderers, against the whole package
python3 - <<'PY'
import re, os
def deps(entry):
    seen, stack = set(), [entry]
    while stack:
        f = stack.pop()
        if f in seen or not os.path.exists(f): continue
        seen.add(f)
        for m in re.findall(r"from '(\./[^']+)'", open(f).read()):
            for cand in (m + '.ts', m + '/index.ts'):
                p = os.path.normpath(os.path.join(os.path.dirname(f), cand))
                if os.path.exists(p):
                    stack.append(p); break
    return seen

os.chdir('packages/office-word/src')
text = deps('renderers.ts')
allf = {os.path.normpath(os.path.join(r, f))
        for r, _, fs in os.walk('.') for f in fs
        if f.endswith('.ts') and not f.endswith('.d.ts')}
line = lambda fs: sum(len(open(f).readlines()) for f in fs)
print(f"reachable {len(text):3} files {line(text):5} lines")
print(f"word-only {len(allf - text):3} files {line(allf - text):5} lines")
PY
```
