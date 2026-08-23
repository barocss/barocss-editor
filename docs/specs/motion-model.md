# What a browser can animate, and what that means for a deck

Written because the answer is not "CSS animates everything" and the exceptions
are exactly where a presentation tool wants to live: a gradient sweeping across a
title, a shadow lifting off a card, a photograph drifting behind text, a word
appearing one letter at a time.

Everything below was checked against what this product actually draws — HTML
boxes on a slide, animated through the Web Animations API — rather than taken
from a compatibility table. Where a claim was measured in this repository, the
measurement is quoted.

## 1. The one that changed the whole table: `transform` is not composable

A shape's rotation is a document attribute, and the renderer writes it as
`transform: rotate(30deg)`. An animation of `transform` **replaces** that:

```
before: matrix(0.866, 0.5, -0.5, 0.866, 0, 0)   ← rotate(30deg)
during: matrix(1, 0, 0, 1, -208, 0)             ← the fly-in, rotation gone
after:  none                                     ← left straight, permanently
```

Measured on 2026-08-20 with a rotated rectangle and a fly-in build.

**So every effect animates `translate`, `rotate` and `scale` — the individual
properties — and never the shorthand.** They compose with `transform` instead of
replacing it, and they compose *in front of* it, which is also the behaviour a
reader expects: the shape flies in from the left of the **screen** and keeps its
own turn, rather than flying in along its own rotated axis.

Support: Chrome 104, Safari 14.1, Firefox 72. The same rule applies to anything
this product animates later — a motion path (§5) has the same collision.

## 2. What interpolates, and what jumps

Every row below was **measured** in this product's own browser, by pausing a Web
Animation at its midpoint and reading the computed value. Two of the claims this
file was first written with turned out to be wrong, which is the reason for the
column of evidence.

| Property | Midpoint of 0 → target | Verdict |
|---|---|---|
| `opacity`, `translate`, `rotate`, `scale` | interpolated | yes, and on the compositor |
| `filter: blur(0px)` → `blur(10px)` | `blur(5px)` | yes, per function |
| `clip-path: inset(0 100% 0 0)` → `inset(0)` | `inset(0px 50% 0px 0px)` | yes, same function |
| `background-size: 100%` → `160%` | `130% 130%` | yes — Ken Burns works |
| `box-shadow`, one shadow → one shadow | `0px 10px 20px` | yes |
| `box-shadow`, one → **two** | `0px 10px 20px, rgba(255,255,255,0.5) 0px 1px 0px inset` | **yes** — the browser pads the short side with a transparent shadow |
| `box-shadow`, `inset` → outer | the end value | **no — discrete** |
| `background-image`, two matching gradients differing only in angle | the end value | **no — discrete in Chromium** |
| `background-image`, `url()` → `url()` | the end value | no — discrete |

A "discrete" interpolation is not a failure a reader sees as broken: it is a
**hard swap at the halfway point**, which looks like a glitch and reads as a bug
in the deck.

### `box-shadow`: the browser does the padding, and `inset` is the real wall

This file first claimed a shadow list had to match in length or it would jump.
Measured: it does not. Animating one shadow to two produced *two* shadows at the
midpoint, the second half-transparent — the browser pads the shorter list with
transparent shadows, exactly as the transitions spec says. So a shadow *stack*
animation needs no normalisation at all.

What is a wall is `inset`: an inner shadow and an outer one do not interpolate,
and the animation swaps at the halfway point. An effect that animates a stack has
to treat inner and outer as separate slots.

### Gradients: not interpolable, and the way round it

The other wrong claim, and the more consequential one. `linear-gradient(0deg, a,
b)` → `linear-gradient(90deg, a, b)` — same function, same stop count — **is
discrete in Chromium**: at the midpoint the computed value is the end gradient.
The sweep everybody wants cannot be had by animating `background-image`.

What does work, measured:

```
CSS.registerProperty({ name: '--sweep', syntax: '<angle>',
                       initialValue: '0deg', inherits: false })
background-image: linear-gradient(var(--sweep), red, blue)
animate: { '--sweep': '0deg' } → { '--sweep': '90deg' }
midpoint: --sweep = 45deg, background-image = linear-gradient(45deg, red, blue)
```

A registered custom property of type `<angle>` interpolates, and the gradient is
recomputed from it every frame. `CSS.registerProperty` is Chrome 85, Safari 16.4,
Firefox 128 — and where it is missing the animation degrades to a swap rather
than to nothing, which is the right failure.

That is the technique for **any** composite value this product wants to animate:
put the animatable number in a registered property and let the composite be a
function of it. It is how a gradient sweep, a stop moving, and a shadow's colour
would all be built.

### A spring: `linear()`, not resampled keyframes

The one timing a cubic-bezier cannot say. A bezier overshoots **once**; a spring
passes its destination, comes back past it, and settles over several diminishing
swings — which is what makes a motion read as physical, and what Figma's Spring,
Framer's `type: 'spring'` and iOS's `UISpringTimingParameters` all are.

The obvious implementation is to resample the effect's keyframes: interpolate
every property at sixty points along the spring and emit sixty frames. That needs
an interpolator for `translate`, `scale`, `rotate`, `clip-path` and colour, in
this product, forever, beside the browser's own.

CSS's `linear()` makes it unnecessary — it is a curve given as *samples* rather
than as a formula, which is precisely what a spring is:

```
easing: 'linear(0, 0.5 25%, 1.4 50%, 0.9 75%, 1)'
at 25%: translate  50px    ← honoured
at 50%: translate 140px    ← the overshoot is real, not clamped
scale 0.5 → 1 at a 1.2 point: 1.1
120 stops: accepted;  round-trips through CSS as `linear(0 0%, …)`
```

So a spring is stored as `spring(stiffness, damping)`, `easingCss` samples it into
a `linear()`, and **nothing else in the product changes**: the frames stay the
effect's, the duration stays the bar's, and the easing stays a string a document
already holds. Chrome 113, Safari 17.2, Firefox 112; where it is missing the
string is rejected and the step runs `ease`, which is a motion rather than none.

Two things the implementation has to get right, neither of them visible on screen:

- **The sample count comes from the ringing, not from the length.** `linear()`
  draws straight lines between its stops, so the intervals have to be short
  relative to how often the curve turns around. A bouncy spring gets 96 samples
  and a critically damped one 24.
- **The last sample is made exactly 1.** A spring approaches its destination
  forever; `fill: both` holds the last frame, so a build that ends a thousandth
  short leaves the shape a hairline off where the document puts it, permanently.

And one product decision: a spring's stiffness and damping *do* imply a length,
and letting them set the duration would take the bar's width away from the reader
— the timeline's whole gesture. The panel offers the settling time as a button
instead.

### The rest of the toolbox, also measured

`offset-path: path(...)` is supported; `translate`/`rotate` as individual
properties are supported; `Intl.Segmenter` is available. So §5's motion path and
§6's per-grapheme split are both buildable today, and neither needs a fallback
for the browser this product runs in.

## 3. What this means for a *paint* animation

The deck's fills are a stack (`fills`), and a stack is what makes animating them
hard: two states with different stack lengths cannot interpolate at all. Three
honest options, in increasing cost:

1. **Animate the numbers inside the paint** through registered custom
   properties — a gradient's angle, a stop's position, a colour's alpha — leaving
   the `background` itself a function of them. Measured above; cheap; covers the
   sweep, which is the thing anybody asks for first.
2. **Cross-fade two shapes**, which is what every tool actually does for "change
   the fill": the same box drawn twice, one fading out. No interpolation
   constraints at all, at the cost of a second element.
3. **Animate a pseudo-element's `opacity`** with the target paint on it, which is
   the cross-fade without a second node — but a pseudo-element cannot be
   addressed by the Web Animations API, so it needs a CSS animation and a class,
   which is a second animation system in the product.

Not decided. Written down so that the first person to want "animate the fill"
starts from the three options rather than from the assumption that it is a
keyframe.

## 4. Images: `background-image` does not cross-fade

A photograph fill cannot animate to another photograph. What *can* be animated
is where and how big it is — `background-position` and `background-size` — which
is the Ken Burns move and is worth having on its own: a still photograph that
drifts for six seconds is the difference between a slide and a video.

Two layers plus `opacity` is the cross-fade, and `cross-fade()` in CSS is not
portable enough to build on.

## 5. Motion path: `offset-path`, not animated x and y

CSS Motion Path gives `offset-path`, `offset-distance` and `offset-rotate`.
Animating `offset-distance` from 0% to 100% moves an element along a declared
path, optionally turning it to face the direction of travel — which is what
PowerPoint's motion paths and Keynote's "move along a line" are.

The alternative — animating `translate` from a list of points — cannot curve, and
cannot turn the shape to follow the curve.

**And it composes with everything — measured, against the claim this section
first made.** The first version of this file said a path would collide with
`translate`, because both are transforms, and that a path would therefore have to
own the slot. It is wrong:

```
offset-path: path("M 0 0 L 200 -100"), offset-distance 0% → 100%
    at   0%: (80, 180)      ← the element's *centre* is put on the path's start
    at  50%: (180, 130)
    at 100%: (280, 80)
+ a translate animation of 0 → -60px, at 100%: (280, 20)   ← added, not replaced
```

The offset transform is its own step in the transform chain: it does not appear
in the computed `transform` or `translate` at all, and an animation of either
composes on top of it. A shape on a path *can* also fly in, fade, pulse and keep
the rotation the document gave it — all four measured together.

Two things to know for authoring:

- **The element's centre lands on the path**, because `offset-anchor` defaults to
  the transform origin. A path drawn from a shape's top-left corner will look
  half a shape off unless the anchor is set or the path is offset.
- **The path's origin is the element's own static position**, so a path is
  authored *relative to where the shape already is* — which is also how a reader
  thinks about it, and means a path survives the shape being moved.
- **It scales with an ancestor's `transform`**, so a path authored in slide
  coordinates draws correctly at any zoom. Measured inside a `scale(0.5)`.

A path is still a *kind* of step rather than an effect, but for a smaller reason
than the one first given: it needs a path, and an effect's options are a direction
and an amount.

Support: `offset-path: path()` — Chrome 46, Firefox 72, Safari 16. Newer shapes
(`ray()`, a `<basic-shape>`) are less portable and not needed for a first
version.

## 5b. Two motions at once on one shape: `composite`

The thing a professional timeline is *for*. A shape that grows while it turns, or
flies in while it fades, or drifts on a path while it pulses, is two motions
overlapping in time on one element — and until this was measured, the second one
silently won.

Not because of the timeline: `withPrevious` has always been able to start two
steps together. Because of the Web Animations API's default. **Two animations of
the same property are `replace`, newest wins**, so a fly and a nudge on one shape
at one moment produced only the nudge.

`composite: 'add'` is the answer, and it does not behave the same way for every
property. Measured, all of it:

| Two animations at once | Result |
|---|---|
| Different properties (`translate`+`opacity`, `scale`) | just works — no `composite` needed |
| `translate` + `translate`, `add` | **added**, and percentages add to pixels correctly |
| `scale` + `scale`, `add` | **multiplied** — 2 × 2 = 4, which is the meaning anybody wants |
| `opacity` + `opacity`, `add` | added (1 + −0.5 = 0.5) |
| `filter` + `filter`, `add` | the function lists **concatenate**: `blur(5px) brightness(1.5)` |
| additive over a *static* value | correct (30° + 60° = 90°) |
| `rotate` + `rotate`, `add` | **wrong in Chromium** — see below |
| `iterationComposite: 'accumulate'` | **ignored** in Chromium |

### The one that does not work

Two additive `rotate` animations do not add. Measured at four points, with both
animations running 0° → 90°:

```
t = 0.25 → 16.875°     one animation alone: 22.5°
t = 0.50 → 22.5°       one alone: 45°
t = 1.00 → 0°          expected 180°
```

Which is 90·t·(1−t): it rises, falls and **ends at zero** — a shape that turns
and then untwists itself. Additive rotation over a *static* rotate is correct
(30° + 60° = 90°), so the fault is specifically compositing two animations of the
individual `rotate` property.

So: **a shape may have one turning motion at a time.** A second one stays
`replace` and wins, which is today's behaviour and at least ends where it says it
will. Anything that lets two motions overlap has to say so where a reader can see
it, rather than drawing two bars that quietly cancel.

### The rule this product uses

Within one press, for one shape: the **first** step replaces and every later
overlapping step **adds**. First because it is the one that establishes where the
shape is coming from, and later-adds because that is what "and also" means.

Two consequences the pane had to grow for. A shape with two motions at one moment
is **two bars at one moment**, so a track is lanes rather than a row — a fixed
24px track drew the second bar outside itself, where a reader could neither see it
nor grab it. And a *combination* preset becomes expressible: 올라오며 커지기 is
`rise` and `pop` written together, the second one adding.

## 6. Per-character motion needs the view to split the text — and is an *option*

A build animates an element. A word appearing letter by letter needs one element
*per letter*, and the document has none: text is `inline-text` runs, and a run is
one node however many characters it holds.

The split belongs to the **view**, not the model — the same reasoning as the
caret filler, which is a rendered element that no node describes. A model that
stored a node per character would make every text operation — typing, marks,
selection offsets — walk a tree of graphemes, which is the cost the run model
exists to avoid.

**Built, and this section's first claim was wrong about where it belongs.** §7
below said a text animation would need a `text` *kind* of step. It does not: every
one of the twelve effects works on a piece of text exactly as it works on a box —
letters that fade, words that fly in, a paragraph that wipes — so a `text` kind
would have to hold a copy of the whole effect table. What is actually new is
*what the effect is applied to*, which is an **option on a build**: `unit` (box,
paragraph, word, letter) and `stagger`. PowerPoint stores exactly that shape — an
entrance effect with "group text: by paragraph / by word / by letter" beside it.

So: the stage splits the renderer's output at play time, staggers the delays, and
puts the text back when the animation ends. Five consequences to be honest about,
two of which only appeared once it was running in a browser:

- **Graphemes, not characters.** `for (const ch of text)` breaks an emoji with a
  skin-tone modifier into pieces that are not letters. `Intl.Segmenter` with
  `granularity: 'grapheme'` is the correct split and is available everywhere this
  product runs.
- **Ligatures and shaping.** Splitting a word into spans stops the browser
  shaping across the boundaries. For Latin text at slide sizes this is invisible;
  for Arabic it is *wrong* — the letters stop joining. A per-letter build has to
  be refused, or done per-word, for scripts that join.
- **A transform is ignored on an inline box.** Measured: `translate` and `scale`
  do nothing at all to a `display: inline` span, so a letter that flies in *has*
  to be `inline-block`. Only `opacity` and `filter` would work on an inline one,
  which is a fade and nothing else.
- **So line breaking is the real problem, and the fix is a second wrapper.** A
  line may break between any two inline-blocks, so letters as inline-blocks let a
  title wrap *inside a word* — text that reflows the moment it animates. The
  words are wrapped first, in `inline-block; white-space: pre` holders, and the
  letters go inside those: break opportunities stay exactly where they were, at
  the spaces. Measured after the fix: same line count, same box width, to the
  pixel.
- **A space is drawn and never animated.** Fading in a gap is invisible and would
  spend a beat of the stagger doing it. The number of pieces the *timeline* sizes
  a bar from has to follow the same rule, or the bar is wider than the animation —
  it was, by three letters on a four-word title.
- **The caret's block is off limits.** The editor's MutationObserver is scoped to
  the block the caret is in, and everything outside it is "our own writing, by
  definition" — so splitting the text of the box being typed in would be read
  back as an edit. A box holding the caret animates whole instead.

## 7. The kinds of step this model has room for

Today: `transition` (the slide arriving), `build` (a shape's entrance, emphasis
or exit), `play` (a film or a sound). The track can hold more, and each of these
is a kind rather than an effect because it needs something an effect does not:

### A trigger is not a kind of step

Worth saying here because the table below would have made it one. A trigger needs
no new frames, no new prerequisite and no new animator: it is an ordinary build
whose *start condition* is a shape rather than a press. So it is an attribute —
`on`, the watched shape's name — and the whole of its implementation is that every
reader of the press sequence skips it.

Which is the same test the `text` row failed: **does the new thing need the effect
vocabulary to mean something different?** A path does. A trigger does not.

| Kind | What it needs that a build does not |
|---|---|
| `path` | a path, and the `translate` slot to itself (§5) |
| ~~`text`~~ | **nothing — built as an option on a build.** See §6: the effects are the same twelve, so a kind would have been a second copy of them |
| `paint` | a target paint in the stack, and one of §3's three strategies |
| `camera` | a whole-slide zoom, which is not any one shape's |
| ~~`trigger`~~ | **nothing — built as an attribute.** See above: a shape to watch is a start condition, not a kind of motion |

This table is here so that the next one to be built is built as a kind rather
than smuggled in as an effect with a strange name — which is exactly what
`flyInLeft` was, and what it cost to undo. The `text` row is the other error the
table can make, and it made it: **asking for a kind when an option would do.**
The test is whether the new thing needs the effect vocabulary to mean something
different. A path does (it owns the `translate` slot). Letters do not.

## 7a. Two motions the reference tools have and this model was asked about

Both measured before either was designed, and neither needs a change to the
engine.

### 군중: a parent's motion carries its children

Free, and it always was — a transform on a container applies to everything inside
it. What was worth measuring is whether a child can animate *at the same time*,
and it can:

```
parent translate 0 → 120px:      child moves from x 140 to x 260
+ the child's own translate 0 → −40px:   x 260, y 20   ← both applied
+ the child scaling 1 → 0.5:            w 60 → 30, about its own centre
cancel: the child is back at 140, 60
```

So "these eight cards move as one, and the third one also spins" needs no new
vocabulary. What was *missing* was the authoring gesture — a stagger over a
container's children rather than over a hand-picked selection — which is
`addBoxesMotion` pointed at `boxesInside`. **Built**, with one decision worth
keeping: `boxesInside` goes one level down and no further, because a frame holding
two groups of four is a reader who means the two groups, and they can point at a
group when they mean it.

### 분신: a clone animated while the original waits

Also possible, and the measurement matters because the obvious worry — that a
copy would not look like the original — is unfounded *if the copy is put in the
same parent*:

```
clone = shape.cloneNode(true), appended to the shape's own parent
  same box, same box-shadow, same font-family     ← every inherited style matches
original: visibility hidden, in place, holding its space
clone: translate −200px → 0, opacity 0 → 1        ← travels while the original waits
```

And a **trail** is the same trick N times over, which is the version worth
having — CapCut's afterimage, and what makes a fast motion read as fast:

```
3 clones, 80ms apart, opacity 0.35 → 0
at 500ms: positions −40 / −56 / −72, opacities 0.17 / 0.20 / 0.23
cleanup: original back in place, zero clones left
```

Which is the same shape of solution as the per-letter split (§6): a rendered
thing no node describes, put back when the animation is. So an `echo` count on a
step is the whole model change, and the stage does what it already does for
letters.

**Built.** Two things the measurement did not cover, found while writing it:

- **The fading has to be on a wrapper.** An animation of `opacity` *replaces* the
  element's own value rather than multiplying it, so a copy given
  `style.opacity = 0.3` loses it the moment a fade's frames run. The copy sits in
  a positioned, inert box whose opacity does the fading, and the two multiply.
- **The spacing is derived from the duration**, not stored: eighty milliseconds
  behind a 200ms dash is a separate shape, and behind a two-second drift it is
  invisible. An eighth of the duration, bounded — `echoGap`.

And a trail is a fact about *drawing*, so it does not touch the bar's width or
what follows the step: the copies are **behind** the shape, not after it.

## 7d. SVG filters, and the one measurement that shaped the design

`filter` is not one property but two vocabularies: ten CSS functions, and
`url(#id)` pointing at an SVG `<filter>` — which is a small image-processing
language (turbulence, displacement, morphology, colour matrices, lighting) and
enormously more expressive than the functions.

Measured, all of it, before anything was built:

| | Result |
|---|---|
| `url(#grain) blur(0px)` → `url(#grain) blur(10px)` | **discrete** — the midpoint is the *end* value |
| `url(#a)` → `url(#b)` | discrete |
| `flood-opacity` / `flood-color` on a primitive, by WAAPI | **interpolates** — 0.1 → 0.9 gives 0.5, attribute untouched |
| SMIL `<animate>` + `beginElement()` on `feDisplacementMap scale` | **works** — `animVal` 36.6 against a `baseVal` of 0 |
| A filter defined in another subtree, referenced by `url(#)` | resolves |
| `backdrop-filter: blur()` | interpolates |
| Three CSS filter functions at once | interpolates function by function |

**The first row is the one that decided the design.** A `url()` anywhere in the
list stops the whole list interpolating, so the obvious arrangement — the shape
carries an SVG look, the motion animates a blur on top of it — is impossible.
An SVG filter's animation has to run **inside the filter**.

Which is affordable, because of the third row: `flood-color` and `flood-opacity`
are *presentation attributes*, so they are CSS properties, so the Web Animations
API interpolates them with no second animation system. So an SVG effect declares
its markup and the frames for **one primitive inside it**, and the stage makes a
copy of the filter per step, animates the primitive, and takes it away again —
the same shape as the echo copies and the per-letter spans.

What that reaches: floods, and therefore blooms, tints, coloured light. What it
does *not* reach: `baseFrequency`, `scale`, `radius`, `values` — none of them CSS
properties. Those need **SMIL**, and it is built.

### SMIL, and why it is usable rather than merely available

The worry about SMIL is that it is a second animation system with a clock of its
own, which would mean a timeline that could play but not *look at* half of what it
plays. Measured, that worry is unfounded:

```
svg.pauseAnimations(); svg.setCurrentTime(t)
  values="0;60;0" at 0 / .25 / .5 / .75 / 1  →  0 / 30 / 60 / 30 / 0
  the same t twice gives the same value          ← exact, and repeatable
begin="0.3s"   measures from the element being *inserted*
two <svg>s     keep two independent clocks
feMorphology radius, feOffset dx               ← both animate
```

Three properties, and each one answers a design question:

- **Scrubbable and exact**, so the playhead drives a melt as readily as it drives
  a fly. Pausing is `pauseAnimations()`; a moment is `setCurrentTime()`.
- **`begin` counts from insertion**, so a step's delay is expressed by writing it
  into the `<animate>` — no offset arithmetic, no second notion of "when".
- **One clock per `<svg>`**, and this product already makes one `<svg>` per step.
  So every step has its own clock by construction, and two shapes melting at
  different moments do not interfere.

The one thing to remember is that a SMIL step has **no Web Animation at all**, so
anything that reads "where are we" from the animations alone reads zero. The
transport learned that the hard way: pausing a melt sent the playhead to the
beginning and the filter vanished. The moment is now read from both kinds of
clock, and an `<svg>`'s clock measures the same thing `currentTime` does because
both start when the press does.

**The seam's own test: three filters added later, no seam changed.** `feMorphology`
run backwards (text swelling into place) and forwards (text thinning away), and
`feTurbulence`'s `baseFrequency` moving while the displacement stays small (a
shimmer rather than a flow). Each is one row of the effect table — the cost tier
comes from *having* a filter and the clash from writing `filter`, both read from
the definition rather than from a list of names.

One rule came out of it, and it is the kind that only a projector teaches: **a
SMIL filter's static attribute has to equal its animation's first value.** A
morphology whose `radius="0"` while its `values` start at 2.8 shows one frame of
the untouched shape before the clock starts.

### And `backdrop-filter` is a filter about the *slide*

The one animatable filter that is not about the element: a shape that blurs what
is behind it. Frosted glass, which every operating system has done to a sidebar
for a decade and no presentation tool offers.

## 7b. Which properties this product animates, and which it will not

The question that has to be answered *once*, or every effect added later argues it
again. Three tiers, and a rule for deciding which tier a new property is in.

**Tier 1 — animated, and cheap.** On the compositor, or close enough that a slide
can run several at once: `opacity`, `translate`, `rotate`, `scale`, `clip-path`,
`offset-distance`. Everything the effect table uses today. **A new effect that
needs only these needs no argument at all.**

**Tier 2 — animated, and a repaint.** `filter`, `backdrop-filter`, `box-shadow`,
`background-position`, `background-size`, `color`, `background-color`,
`border-color`. Every one of them interpolates (measured, §2, §7d), and every one
costs a repaint of the shape per frame. Fine for one shape being emphasised; not
fine for twenty at once, and worth saying so in the panel rather than in a
release note.

**Tier 2b — an SVG filter's own primitives.** `flood-color` and `flood-opacity`
are CSS properties and animate like any other (§7d). Every other filter attribute
is not, and needs SMIL — measured to work, and the seam a melt or a displacement
would be built on.

**Tier 3 — reachable only through a registered custom property.** A gradient's
angle or a stop's position, because `background-image` is discrete (§2). The
technique is general: put the animatable number in a `CSS.registerProperty`'d
`<angle>` or `<percentage>` and make the composite a function of it.

**And the tiers are read by the product, not only by this file.** `motion-cost.ts`
turns them into a number the pane shows: how many *elements* are repainting at the
busiest instant of a press. Which is the honest unit, because the cost is per
element and a text unit multiplies it — a filter on a box is one, and the same
filter on its letters is forty. No frame rate is promised, because it depends on
the shapes' size and the reader's machine; what is said is *what* is expensive.

**Never, and the reason is the same for all of them:** `width`, `height`, `left`,
`top`, `margin`, `padding`, `font-size`. They lay out every frame — and on a slide
they lay out *the text inside the shape* every frame, which is the one thing this
product cannot afford to do sixty times a second. `scale` and `translate` say the
same thing to a reader and cost nothing. A future effect that seems to need one of
these needs `scale` instead.

**The rule for a new property:** does the browser interpolate it (§2 measured, not
assumed), does it compose with what a shape already carries (§1, §5b), and does it
avoid layout? Three yeses is a row in the effect table. Two is a registered custom
property. One is a cross-fade of two elements (§3).

## 7c. What the reference tools' preset lists actually contain

Canva's element and text animations, Figma's prototyping transitions and CapCut's
in/out/loop lists come to about thirty names between them, for a dozen ideas. Read
against this product's effect table, the names divide three ways:

**Already expressible, and now shipped as presets.** Canva's Typewriter is a
letter unit with a 60ms duration and a 55ms beat — the rhythm is the effect.
Baseline is `wipe` upward with a *word* unit. Roll, Skate and Tumble are
combinations of a fly and a turn. CapCut's whole **loop** category is `repeat: 0`,
which this model has always had: 숨쉬기, 네온 and 글자 물결 are loops.

**Three ideas the table could not say**, so they became effects:

- **`slamIn`** — from *bigger*, not smaller (Canva's Stomp, CapCut's 쿵). `grow`
  only ever arrives from smaller, so this was not a matter of options.
- **`drift`** — a slow one-way movement that does not come back (Canva's Pan).
  `nudge` returns, which is what makes it a shake.
- **`glow`** — a `filter`, which §7b calls tier two and nothing here had used.
  Canva's Neon and CapCut's 네온, and the first reader of `filter` in the product.

**Deliberately not taken.** Canva's Merge (two halves sliding in from both sides)
needs the shape drawn twice; Photo Flow and Scrapbook are image treatments rather
than motions; Figma's Smart Animate is a *diff between two frames*, which is a
different product. Written down so the absence is a decision.

## 7h. Backwards: a press un-played, and what a shape's story leaves behind

A show goes forwards by *playing* the next press, and it cannot go backwards by
playing anything. What Back means is a **state**, and the state is exactly what
this model already computes for the forward direction — which is why this turned
out to need no new machinery, only two things said properly.

### What is on the slide after N presses

A shape's own steps in order are a little story — appear, be emphasised, leave —
so what is on the slide after N presses is decided by **the last step of that
shape's that has played**:

- it was an *exit* → the shape is gone;
- anything else → the shape is there;
- nothing of its has played → it is there unless its first step is an *entrance*,
  because a shape that only ever leaves has to be there to leave from.

That sentence is the fix for two faults that were live in the show, both measured
rather than reasoned about:

```
press 1   the shape flies out           translate -65%, opacity 0
press 2   …and comes back               opacity 1          ← the exit stopped holding
```

An exit was only holding its end state through its own animation (`fill: both`),
and the next press does not run that animation. The other fault was the mirror of
it: every build's target was hidden until it played, with **`fadeOut` excused by
name** — so a shape whose one motion was 날아가기 was invisible from the moment
the slide arrived. The category comes from the effect table now (`categoryOf`),
which is the only place that knows what an effect *is*; a name-check there is the
fifth exit's bug waiting to happen.

### A press arrived at backwards is *settled*, not replayed

Going back to press N and re-running it would replay a build the presenter has
already seen — a shape flying in again on the way back is not what Back means in
any tool. So the press's animations are handed over **seeked to their own end and
held**, which is `seekTo`: the same mechanism the playhead uses to look at a
moment (§7f). Nothing in the stage had to learn anything.

Two details fall out of it, and both are the kind that are invisible until
somebody presents:

- **A film does not start.** A settled press hands over no `plays`: arriving
  backwards at the press that starts a video should not start the video.
- **A slide entered backwards arrives finished.** It used to arrive *blank*: the
  presenter's key set the previous slide's press count, the slide changed, and an
  effect keyed on "the slide changed" immediately set the press back to zero —
  because arriving at a slide anywhere else (the rail, the filmstrip, PageDown)
  does mean starting at its beginning. The press now says which slide it belongs
  to, so a deliberate one is not an arrival to reset.

## 7i. A deck being **scrolled**: the scroll is the clock

A presenter clicks; a reader sent a link scrolls. That is a way of *showing*, not a new
animation system — and the whole design is one sentence: **a scroll is a playhead.**

A build is an animation with a duration and a scroll is a position, and there are exactly
three ways to join them:

- **Play a build when its slide arrives.** Then a reader who scrolls quickly sees every
  build at once, and one who scrolls back watches them replay: the animation and the reader
  are two clocks that do not agree.
- **Ignore the builds.** Then a deck made to reveal a point one line at a time shows the
  whole point immediately, and the author's timing is thrown away.
- **Make the scroll the clock.** Scrolling forward plays a build, scrolling back un-plays
  it, and stopping half way holds it half way.

The third needed **nothing new** in this model to say. `showing()` already had four ways to
watch one slide — presenting, going back, previewing, scrubbing — and a scroll is a fifth
that answers the same `Showing` with `hold: { kind: 'moment', at }`. It is scrubbing with a
different input device, so the stage, the hiding rule and the off-by-one all came for free:
one press fewer counts as finished, because the press at this offset is *happening*.

Three consequences fall out of the same sentence:

- **No slide transition.** The scroll *is* the transition; a fade on top of it would be two
  answers to "how do we get from this slide to the next", and a reader moving back through
  the same offset would watch the fade play forwards again.
- **No film starts**, for the reason a dragged playhead starts none: a reader moving through
  a deck is not watching a film.
- **A key press is a *stop*, not an amount.** Measured: moving the offset by one build's
  worth meant a press on a slide with no builds changed nothing on screen, because the
  reading room is bigger than a build's share. So a press goes to the next picture the deck
  has — the start of a slide, or a build **finished**, which is the same picture a press
  gives in a clicked show. That is what makes the two ways of showing agree.

The layout is `scroll-show.ts`: a slide's stretch is its builds (a share of scrolling each)
plus one view of room to read the finished slide, and the offset is app state exactly like
`played` is. Two faults were measured in the wiring, both the same shape — **a memo that
reads a value has to name it**: the stretches were computed once with every slide at zero
presses (the document was not in the list), and the animations kept the `seekTo` they were
built with (the scroll was not in the list). Each looked like the feature not working at
all.

## 7f. Looking at a moment: why pausing is scrubbing

A transport — play, pause, a frame either way — looks like a second playback
system beside the one that plays a press. It is not, and the reason is the same
property that made the playhead possible in the first place: a Web Animation has a
`currentTime` you can *read* as well as set.

So the model is one state, not two:

1. Pause asks the stage to freeze what is running and to **report the moment**.
2. The moment becomes the playhead, and the preview ends.
3. Which is a *scrub* — a state the pane already drew, and the state
   frame-stepping already produces.
4. Play, with the playhead anywhere but zero, resumes **from** it.

The moment is `currentTime`, which counts from an animation's own start *including*
its delay — so it is the press-relative moment the playhead measures, with no
conversion. The largest across the press's animations, because a step that starts
late would otherwise report a moment before it began.

### The running playhead: a clock, and why it cannot go through React

Reporting the moment *every frame* rather than when asked sounds like the same
mechanism with a faster caller. It is not, and the obstacle is not performance:

**The app's state is what builds the animations.** The stage rebuilds everything
in `builds` whenever that object changes, and `builds` is computed from the app's
state. So a playhead that wrote the moment into state sixty times a second would
restart the very motion it was timing, once per frame — not a slow playhead, no
playback at all.

So the clock goes the other way round: the stage — the only thing that knows,
because it owns the animations — hands out a function, and the pane calls it once
per frame and writes the playhead's position and the readout **straight to the
DOM**. Nothing re-renders. Three consequences, all of which had to be found:

1. **The pane must put it back.** React does not know those two elements were
   touched, so a stopped playhead stays wherever the last frame left it.
2. **The restore must read the *new* playhead.** Pausing sets it, React writes it
   to the element, and *then* the previous effect's cleanup runs — so a cleanup
   restoring its own closure's value undoes the pause. Measured: the paused
   playhead went backwards.
3. **The pane follows what is playing.** The playhead runs along one press's axis,
   so the press being previewed and the press being shown are set in one update.

And because the running clock and the pause read the *same* function, pressing
pause cannot make the playhead jump — which is the property a second reading of a
second clock would have quietly broken.

## 7g. A film is the one step whose length is not in the document

Every other step's length is its own attribute. A film's is the *file's*, and a
file's length is not knowable until a browser has loaded enough of it to say — so
a `play` step's `duration` was only ever a placeholder, and the timeline could
only say *when* a film starts, never which part of it plays.

Which part it plays is two points — an in-point and an out-point — and four
decisions:

1. **They live on the media node, not on the step.** A trim is a fact about the
   film. PowerPoint's Trim Video writes it on the video, and a deck that played
   one file twice would mean the same piece both times; two different pieces of
   one file is two media nodes, which is also how a reader thinks about it.
2. **An out-point of `0` means "to the end".** There is no honest default,
   because the number would have to be the file's length. So the arithmetic
   returns *nothing* rather than a guess, and the bar keeps its placeholder until
   there is a real out-point: a bar drawn from a guessed length is a timeline that
   lies about the film.
3. **A trimmed film's length is not a field.** Once there is an out-point the
   length *is* the trim, so the panel says the number rather than offering a field
   the document would ignore.
4. **The out-point is enforced by `timeupdate`, not by a timer.** A timer measures
   wall time and a film is not obliged to keep up with it — a buffering stall or a
   slow decode makes the two disagree, and the disagreement is a clip that stops in
   the wrong place. The cost is the event's ~4Hz resolution; the clock that would
   fix it is `requestVideoFrameCallback`, which reports presented frames.

The film's own length is still *shown* — read off the element on the stage,
because a reader typing an end has to know what the end is. Read, never stored: a
measurement in the document is the mistake `fitText` is deliberately not making.

## 7g-2. A film's bar is the one whose edges are not "when" and "how long"

Every other bar on the axis is a step's delay and a step's duration. A film's bar
is as long as the part of the **file** that plays — an attribute of the film, not
of the step (`media-trim.ts`) — so its two edges mean something this axis does not
otherwise have, and that is why dragging them waited for a decision rather than
for code.

The decision is a video editor's, because it is the one a reader already knows:

| edge | what it writes | what stays still |
|---|---|---|
| head | `trimStart += Δ` **and** the step's `delay += Δ` | the tail, and the frame under the pointer |
| tail | `trimEnd = trimStart + length` | the head |
| the bar itself | the step's `delay` | the trim |

Two consequences that are easy to get wrong:

- **The tail is where a film gets an out-point at all.** `0` means "to the end"
  precisely because the file's length is not in the document, so the first drag of
  the tail is the moment the deck learns a length — the one the reader dragged to.
  The arithmetic therefore takes a *length* rather than a point: the bar's width is
  what the reader is holding.
- **A head drag is two nodes in one transaction.** The trim is the film's and the
  delay is the step's; a reader did one thing, so two commands would be two entries
  in the history that each undo half of it.

A build has no head grip, and that asymmetry is the point: there is nothing at the
front of an entrance to skip.

## 7e. A reader who has asked for less motion

`prefers-reduced-motion: reduce` is set by people who are made ill by movement,
and a presentation tool that ignores it is one they cannot sit through. It is a
duty rather than a feature, and it is not "show nothing": a build's whole job is
to bring a shape on, so **the shape still arrives** — at the end of its animation,
immediately, instead of travelling there.

Which falls out of the numbers rather than needing a second code path: a duration
of zero and no delay collapses the stagger, the trail and the path with it,
because all three are made of those numbers. The one thing that has to be said
separately is the trail, which is *copies* rather than timing — a reader who asked
for less motion gets none of them.

Read as a live query, not once at startup, so a reader who changes it while the
app is open is honoured on the next press.

## 8. The properties a keyframe cannot reach, and the two mechanisms that do

§2 says what interpolates. This says what to do about the rest, and the answer
turned out to be **two** mechanisms rather than one — which is the whole finding,
because the reference implementation this was measured against uses the second for
everything and pays for it in every shape's style attribute.

### 8a. Adding, which is almost always the answer

A motion must not erase what the shape already looks like. Measured, and it was
live in this product: a shape with a 흐림 effect carries `filter: blur(3px)` from
`effectsCss`, and one glow step over it — `replace`, because it was the first of
its press — computed to the glow **alone**.

| Property | `replace` over a static value | `composite: 'add'` |
|---|---|---|
| `filter: blur(3px)` + a glow | `drop-shadow(…)` — the blur is gone | `blur(3px) drop-shadow(…)` |
| `backdrop-filter: saturate(1.4)` + a blur | the blur alone | `saturate(1.4) blur(4px)` |
| `border-radius: 8px` + 0 → 16px | the frame's own value | **24px** — arithmetic |
| `box-shadow: 0 4px 8px` + 0 → `0 10px 20px` | the frame's own shadow | `0 4px 8px, 0 10px 20px` — **two shadows** |
| `opacity: 1` + 0 → 1 | 0 → 1, which is a fade | starts at 1: **no fade at all** |

So the rule is per *property*, and `composite` belongs to an *animation* — which
is why a step that touches both kinds is **two animations on one timing**
(`splitAdditive`). `MUST_ADD` is the list, and `opacity` is deliberately not in
it: what a reader means there is a *multiple* of the shape's opacity, which the
Web Animations API cannot express.

### 8b. Almost everything a shape looks like is a **list**

The mechanism below was first built with one variable per property — `--sl-sweep`,
"the gradient's angle". Measured the next day on a shape with **two** gradient
fills: one 그라디언트 돌기 step turned *both* of them, 0°→50° and 90°→140° from a
single animation.

That is not a fault in the mechanism. It is the mechanism being asked the wrong
question, and the question is wrong for almost every property worth animating:

| what a shape has | how many | CSS |
|---|---|---|
| fills | a stack | one element each — and before that, one `background-image` with four parallel comma lists |
| shadows and blurs | a stack | one `box-shadow` list, one `filter` list |
| filter functions | a list | one `filter` |

The first row is the one that changed since: the fills are **elements** now (8d),
which is a better answer than a track for the properties an element has — an
opacity, a translate, a scale. It does not remove the need for a track, because a
gradient's *angle* is still inside a property whose value has no midpoint, and it
does not change the naming: a layer element is numbered by the fill a reader
clicked, exactly as `--sl-f1-angle` is.

So a motion that names `background-image` or `box-shadow` is naming **a list**
rather than a thing in it. A track's identity has to be *(what kind of thing,
which one)* — `--sl-f1-angle` is the second fill's angle and nothing else's — and
the step has to be able to say which (`partAt`), which means the effect has to
declare which list it is about (`part`).

Two consequences worth stating, because they are what the naming buys:

- **Two sweeps on two fills of one shape both run.** `--sl-f0-angle` and
  `--sl-f1-angle` are different properties, so the timeline does not see them as
  clashing and neither has to add.
- **A card with a soft shadow and a hard key line can deepen the soft one.**

### 8c. The mechanism, and its three measured details

A **registered custom property** the renderer writes into the value it builds:
`linear-gradient(calc(90deg + var(--sl-f1-angle, 0deg)), …)`, and the animation
moves only the variable. `@property` is what makes it interpolate — an
unregistered custom property is a string, and measured, one animated 0px → 40px
jumped rather than travelled.

1. **A registered property ignores the `var(--x, fallback)` fallback** — it always
   has its initial value. The fallback is written anyway, and it is not
   decoration: without the registration, `var()` is invalid at computed-value time
   and takes the **whole declaration** with it. A second host that skipped the
   registration would show shapes with no gradient rather than shapes with no
   animation.
2. **Tracks add** (90deg + 90deg = 180deg), so two motions on one track compose
   the way two motions on one property do.
3. **`inherits: true`** — and it was `false` until a fill became an element,
   which is the one line in this file that has been reversed by a measurement
   rather than extended. A track is animated on the shape and read *inside* it now
   (a picture's zoom is `scale` on an `<img>` in the fill layer), and a
   non-inheriting property gives that image its **initial** value: measured, the
   variable animated correctly on the shape at 1.32 while the picture stayed at 1.
   The reason it was `false` — a track on a frame turning every gradient inside it
   — is answered where it happens rather than by the registration: **a shape that
   draws layers declares its own neutrals**, which stops the inheritance at each
   shape. Also measured, because a cascade is worth checking rather than assuming:
   an element's own animation still beats its own inline declaration.

   ```
   ancestor animating                       child 2, picture 2
   child declares the neutral               child 1, picture 1   ← the bleed stops
   child declares it and animates its own   child 3, picture 3   ← its own still wins
   ```

The indexes have to be **bounded**, because `@property` needs a static list of
names — four per list, which is the judgement rather than the measurement (three
fills is a photograph, a tint and a vignette). Past the cap a part is *not
offered* rather than offered and silent, and the lengths are written plainly.

**Who writes them: whoever has the numbers.** A shadow's four lengths, a
gradient's angle and a layer's position are the renderer's — and it is the only
thing that knows which *slot* of a comma list each item is in, because an image
with an opacity is two CSS layers where the model has one fill. A `filter` list is
appended to, which needs no numbers, so the stage does that one.

### 8c-2. And why `filter` and `box-shadow` are not the same case

`filter` is the list this product animates most and it needs **no** track:
`composite: 'add'` concatenates it (8a), so a motion's functions land beside the
shape's own and beside each other. A track per function would buy the ability to
animate *one existing function of a static list* — which nothing has asked for, at
the price of a `calc()` around every filter argument every shape carries.

`box-shadow` is the opposite: neither composite reaches an item in it (8a), so
without a track a shadow cannot be scaled at all. It gets one — and only the
shapes that *have* a shadow pay for it.

The line between them is worth keeping: **a track is for a list CSS gives no other
way into, not for every list.**

### 8d. What the fills being **elements** settled, and what is still out of reach

This section used to be a list of things waiting on one change. The change
happened — a shape's fills are drawn as elements rather than as one `background`
(see `packages/office-slides/src/fill-layers.ts`) — and it settled all three at
once, which is why it was worth waiting for rather than special-casing:

- **The Ken Burns zoom.** The wall was specific: `cover` cannot be multiplied.
  `background-size: calc(100% * 1.4)` is a different *fit* rather than a closer
  view of the same one, and there is no numeric `cover` without the picture's
  proportions against the box's. On an `<img>` it is `scale` — composited, so the
  zoom is *cheaper* than the pan used to be.
- **A layer's own opacity**, which `background-image` does not have at all. The
  wash that stood in for it was a fully transparent gradient over the picture —
  measured, a photograph at `opacity: 0.4` drew at full strength, so the panel had
  a control that did nothing.
- **A cross-fade between two photographs**, which is the first thing anybody does
  with two pictures and was not expressible in `background` in any form.

Two things came out of it that were not the point:

- **The pan changed its neutral**, from `50%` to `0%`. A background's position is
  where the picture *sits*, so "as drawn" was the centre; an element's `translate`
  is a move *from* where it is, so "as drawn" is nothing. The track kept its name
  and changed its meaning, which is the sort of change worth writing down: a step
  written against the old neutral would jump the picture half a box.
- **A tiled fill is the one that stays a background**, because `object-fit` has no
  repeat. Its pan is written `calc(50% + var(…))` so zero means the same thing in
  both forms; the *distance* differs, and that is accepted rather than papered
  over — a tiled fill has no edge to run out of, so there is no distance that
  would be the same.

Still out of reach, and now for reasons that are not about the drawing:

**A motion aimed at something other than the shape.** A step names a box, and
every effect animates that box or a track on it. Aiming one at "the second fill"
as a *target* — rather than at a track the fill reads — would need the step to name
a part of a node, which is a model question rather than a CSS one. Nothing has
asked for it: the tracks reach every property a layer has.

**A rotated radial gradient**, which is a CSS wall rather than a gap here —
`radial-gradient(… / 30deg, …)` is rejected outright. See `docs/BACKLOG.md`.
