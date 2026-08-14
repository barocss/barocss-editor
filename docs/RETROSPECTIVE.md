# Retrospective — building Word on this engine

Where the input path, the rendering, and the library stand, measured rather than
remembered. Written after 72 commits and one product.

Companion to [ROADMAP.md](./ROADMAP.md), which says where to go. This says what
was learned getting here, because the roadmap's phases only make sense if the
lessons under them are true.

---

## The headline numbers

| | |
|---|---|
| Unit tests passing | **4,740** across 17 packages |
| End-to-end tests | **291** in 33 files, against a real browser |
| Total | **5,031** |
| Skipped or `fixme` | **26** — 0.5%, each with a written reason |
| Commits this stretch | 72 — 43 fixes, 20 features, 6 tests, 2 docs, 1 revert |

**Forty-three fixes to twenty features.** That ratio is the retrospective in one
line, and the rest of this document is about why it is not a bad ratio.

---

## 1. Input — the most mature part, and it was earned

### Where it stands

**Sixteen end-to-end specs are about input alone**, thirteen of them driving
Chrome's own IME through CDP — `Input.imeSetComposition`, real composition
events, not synthesised key events. Two more run the whole thing with the CPU
throttled to a twelfth of its speed.

That is not normal coverage for an editor. It exists because Korean input broke
in ways nothing else would have found.

### What the architecture settled into

One rule, learned the hard way and now written in the code:

> **`beforeinput` writes typing. MutationObserver writes IME. Never both.**
> Composition events are used as *state signals only* — never to read text.

The faults that produced it, in order:

- **A burst guard that dropped keystrokes.** Fixed by making the burst last as
  long as the typing rather than a fixed window.
- **Renders landing on a document that had moved on.** Fixed by making only the
  newest render paint.
- **A composition flag that the composition never cleared** — keyCode 229 set a
  persistent flag that nothing turned off.
- **The fix for that caused a worse bug.** Deferring the clear meant the *next*
  composition's flag was stomped at Korean syllable boundaries, where
  `compositionend` and `compositionstart` fire in the same task. `안녕하세요`
  came back as `안ㄴ녕ㅎ하세세요`. Fixed with a generation counter — and pinned in
  a **unit** test, because CDP cannot produce a same-task boundary.
- **A space the user typed being swallowed** after a composition ended.
- **An owed render never paid.** A change during composition set a flag and
  nothing redeemed it.

### The honest weakness

The IME work is guarded by end-to-end tests because the browser is the only
thing that produces a real composition. **Two unit tests** cover the state
machine (`composition-boundary`, `typing-gate`) and the rest needs Chrome. That
is correct — a fake composition proves nothing — but it means the input path is
the slowest part of the suite to verify and the hardest to refactor.

`docs/SKIPPED_TESTS.md` records the other half: `InputHandler` has no composition
API, so a cluster of unit tests sits skipped with the unblock condition written
down. That is a real debt, honestly registered.

**Verdict: production-grade for Latin and CJK, with the cost that it can only be
proven in a browser.**

---

## 2. Rendering — stable, and the stability is structural

### Where it stands

`renderer-dom` is the largest package — **13,639 lines, 763 tests, 94 of them
about reconciliation alone**. It is a real virtual-DOM: templates from the DSL,
a VNode build, a reconcile against the previous tree.

Two properties do the work:

**Idempotent writes.** A test file exists for exactly this. An identical write
still costs a MutationRecord, and a MutationRecord is something the input path
then has to decide about — so "the same value" must mean "no DOM operation".
This is why rendering and input do not fight.

**Renderer-owned nodes.** The renderer marks the nodes it created, so the input
path can tell its own writes from the browser's. Without it, every render looks
like the user typed.

### What went wrong this month, and what it says

Three rendering faults, and none of them were in the reconciler:

- **A page drawn where it was not computed.** The layout pass compared only
  where the breaks fell and not where the blocks were *put*, so a document that
  changed height without moving a break kept stale pushes — 43px of drift.
- **Line heights measured as ink and scaled to fit.** Right for text, wrong for
  anything measured as a box: a floated picture's band was drawn 98px and
  reported as 117.
- **An attribute whose function resolved to `undefined` drew its own source.**
  `lang="(d) => typeof d.attributes?.lang === 'string' ? …"` in the document,
  on every element where the attribute did not apply.

The first two are *measurement* faults, not rendering faults — the pass that
reads the browser back, not the one that writes to it. The third was a genuine
renderer bug and had been latent since the attribute system was written.

### The honest weakness

**Measurement is the fragile layer, and it is fragile because it is a
feedback loop.** The pass measures the DOM, computes a layout, applies the
layout to the DOM, and must converge. Everything that has gone wrong there went
wrong because applying the layout changed what would be measured next time:

- A page break drawn *inside* a paragraph made the paragraph taller.
- A gap inside a paragraph the text wrapped around changed its line count.
- A zoom changed every measured length by a factor nothing divided back out.

Each was fixed by making the measurement subtract what the layout itself had
drawn. There is no test that *proves* convergence in general — only tests that
each known cause is handled.

**Verdict: the write path is stable and well-tested. The read-back path is
correct today and has no structural guarantee that it stays that way.**

---

## 3. The library — the parts are ready, the seams are not

### Where it stands

Nineteen packages, all versioned, all with `exports` and types, none private.
The layering is real:

```
shared · dsl · schema        ← knows nothing above it
datastore · model            ← knows the schema
renderer-dom · renderer-react ← knows the DSL
editor-core · view · extensions
office-word
```

**Measured**: the dependency graph has **zero real cycles**. `editor-core`
declares two packages it never imports; `model`'s eleven imports from
`editor-core` are all types, three of them only missing the keyword.

### What one product taught us about the library

This is the part worth dwelling on. **Roughly a third of this month's fixes were
not bugs in the ordinary sense — they were features the schema declared and no
code read.**

- Six character effects (`outline`, `shadow`, `emboss`, `imprint`) drew nothing
  when they arrived as formatting rather than as marks.
- `mirrorIndents`, `outlineLevel`, `hyphenationAuto`, `suppressAutoHyphens`,
  `lang` — all declared, none read.
- Tab **leaders** were fully drawn by the layout and no control could set one.
- Six table structure operations existed with no buttons.
- `indentNode`/`outdentNode` were bound to Ctrl+M and could never fire, because
  no schema marks a node `indentable`.

The sweep that finds these — pull the attribute names out of the schema, strip
comments from every other file, grep — has now produced findings **five separate
times**, and this month it was caught being *wrong*: a name read for a different
meaning counts as read, so three character effects were reported covered when
they were not.

**This is the single most important lesson for a suite.** A schema is a promise,
and a promise nothing reads is a lie the tests cannot see. A second product will
declare a second schema, and the same gap will open unless the sweep becomes
part of the build rather than a thing somebody remembers to run.

### The undo discipline

The other third of the fixes: **operations whose inverse did not restore.**

The roster now enforces that every registered operation appears with a scenario,
runs against a document with the shapes a document has, and has its inverse
checked. Four fuzz ratchets sit at zero. But the way that state was reached is
the lesson:

- The roster allowed an operation to be *exempted* with a written reason.
- Fourteen of those reasons had gone stale — they said "declares no inverse"
  about operations that had since been given one.
- So the check was switched off for fourteen operations that could have passed.

**The exemption is now itself a checked claim.** A note is not a guarantee; a
note that can rot is worse than no note, because it looks like coverage.

### The honest weakness

`collaboration` is **535 lines and 2 tests**. It is the least proven package in
the repository and it is the one a suite depends on most — several products
editing one document is the whole premise. The id namespaces were only unified
this month, and that was a prerequisite nobody had noticed was broken.

**Verdict: the parts are ready to publish; the contract between them is not
written down; collaboration is unproven.**

---

## What to carry into the suite

Five things this product taught that the next one should not have to relearn.

1. **A schema declaration is not a feature.** Make the unread-attribute sweep a
   build step. Five findings in five sweeps is not luck.

2. **An exemption must be checkable.** Every "this is fine because…" in a test
   should fail when it stops being true. The fourteen stale roster notes cost
   more than having no notes would have.

3. **Measure before designing.** Every good decision this month came from a
   measurement taken first: zoom uses `transform` because `zoom` drifted 77.88px
   where the transform gave 78; the East Asian font work was *reverted* because
   measuring showed CSS chooses by coverage where Word chooses by script.

4. **The fixture is part of the test.** Half the faults hid because every test
   used one document shape — one run per paragraph, no bold word, no link. Enter
   inserted a paragraph *above* instead of splitting for the life of the project
   and every test passed.

5. **Write down what was surprising, next to the code.** The comments in this
   repository carry the failure that produced each rule. That is why this
   retrospective could be written from the source rather than from memory.

---

## The one number that matters

**43 fixes to 20 features.** Not because the code was bad — because a word
processor is a specification with a thousand clauses, and this month was spent
finding out which of them the code only *claimed* to implement.

A suite multiplies that. The answer is not to be more careful; it is to make the
claims checkable, which is what all five lessons above have in common.
