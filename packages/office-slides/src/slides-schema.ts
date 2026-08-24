import { CANVAS_GEOMETRY_ATTRS, SurfaceKind, getOfficeSchemaDefinition } from '@barocss/schema';
import { DECK_STYLE_ATTRS } from './paint';
import { CROP_ATTRS } from './crop';
import { CORNER_ATTRS } from './corners';
import { FLIP_ATTRS } from './flip';
import { MEDIA_TRIM_ATTRS } from './media-trim';
import { THEME_ATTRS } from './theme';

/**
 * The name a shape keeps, so that something else can refer to it.
 *
 * A sid cannot be written into a saved document — it is `session:counter`,
 * handed out at load in document order — so a build that stored one would point
 * at a different shape the moment a slide above it gained a box, and at nothing
 * at all in another session. The presenter's note taught this the expensive way.
 *
 * Assigned when something first needs to name the shape, and absent otherwise: a
 * deck nobody has animated carries none of these, which is the same rule the
 * track itself follows.
 */
const SHAPE_NAME_ATTR = { name: { type: 'string' as const, required: false } };
import type { SchemaDefinition } from '@barocss/schema';

/**
 * What a deck is — which is a question the schema had already answered.
 *
 * Nothing here is new. `office-schema` declares a `surface` whose content is
 * `block+ | scene*` and whose `kind` records which, with a comment saying "a
 * Word page and a PageBuilder page hold blocks, a slide and a FigJam board hold
 * scene nodes". It declares `SurfaceKind.Slide`. It declares the whole scene
 * node set — `frame`, `rectangle`, `ellipse`, `line`, `connector`, `path`,
 * `sticky`, `textFrame`, `component`, `instance` — with shared `geometry` and
 * `style` groups. And `textFrame` carries the sentence this product is built on:
 *
 *   "Rich text placed on a canvas. Its children are ordinary blocks, so every
 *    text command written for Word works inside a slide or a FigJam frame."
 *
 * Word used one half of that surface and left the other half unread. This is the
 * fifth time in this repository that the schema declared something no code read,
 * and the largest: an entire second document shape, waiting.
 *
 * So the slides schema is the office schema. What this file adds is only what a
 * *deck* needs that a document does not — which turns out to be two attributes
 * and a set of names for what a placed thing is *for*.
 */

/** 16:9 in twips, the unit every length in this engine is in — 13.33in × 7.5in. */
export const SLIDE_WIDTH = 19200;
export const SLIDE_HEIGHT = 10800;

/** 4:3, for a deck that wants it. */
export const SLIDE_WIDTH_4_3 = 14400;
export const SLIDE_HEIGHT_4_3 = 10800;

/**
 * What a placed box is *for*, which a layout uses to style it.
 *
 * Not a node type: a title and a body are both `textFrame`, and the difference
 * is which of the layout's slots they fill. Making them separate types would
 * mean a command that changes one into the other has to replace the node, and
 * every text command would need to know about both.
 */
export const PLACEHOLDER_ROLES = ['title', 'subtitle', 'body', 'caption', 'notes'] as const;
export type PlaceholderRole = (typeof PLACEHOLDER_ROLES)[number];

export function getSlidesSchemaDefinition(): SchemaDefinition {
  const office = getOfficeSchemaDefinition();

  return {
    ...office,
    nodes: {
      ...office.nodes,

      /**
       * A surface that is a slide.
       *
       * The same node Word uses, with two attributes added: which layout it
       * follows, and whether it is skipped while presenting. Both are the deck's
       * business and neither means anything to a page.
       *
       * Left as `block+ | scene*` rather than narrowed to `scene*`: a slide
       * holding a single flow of blocks is what a Word document looks like, and
       * a deck imported from one should round-trip rather than be refused.
       */
      /**
       * A **card**, which may hold a track of its own.
       *
       * The same attribute a slide carries, on the one other thing a reader opens and puts shapes
       * in: a definition. What it buys is *a card that animates* — its badge fading in wherever the
       * card is placed — and nothing else about it is new, because `trackFor`, `namedBoxes` and
       * `slideTimeline` all read whatever node they are handed. Measured before this attribute
       * existed: given a `component` with a `trackId`, all three already answered correctly, so the
       * feature was one attribute and one reader away (§10l).
       */
      component: {
        ...(office.nodes as Record<string, any>).component,
        attrs: {
          ...(office.nodes as Record<string, any>).component?.attrs,
          trackId: { type: 'string', required: false }
        }
      },

      surface: {
        ...office.nodes.surface,
        attrs: {
          ...office.nodes.surface.attrs,
          /** The layout this slide takes its placeholder formatting from. */
          layoutId: { type: 'string', required: false },
          /** Kept in the deck, skipped while presenting. */
          hidden: { type: 'boolean', default: false },
          /**
           * The note shown to the presenter, named by the `surfaceNote`'s `id`.
           *
           * The slide names the note, matching `headerId` and `footerId`
           * exactly. It went the other way first — the note carrying a
           * `surfaceId` — which reads better and cannot work: a surface's
           * identity is its sid, and a sid is `session:counter`, handed out at
           * load. A deck written before its sids exist could not name one, and
           * the fixture that tried pointed at a slide that was never there.
           */
          noteId: { type: 'string', required: false },
          /**
           * The motion track this slide follows, named the same way the note is.
           *
           * Time lives *beside* the document — `docs/specs/canvas-model.md` §4,
           * decided in advance precisely so it would not be decided by accident
           * — so this is a name, not a keyframe. See `motion.ts`.
           */
          trackId: { type: 'string', required: false },
          /**
           * The guides a reader has placed on this slide.
           *
           * An array of `{ axis, at }` in twips — see `guides.ts` for what is
           * allowed in it and why. `type: 'array'` is what the schema takes for a
           * list, the same way a shape's `fills` is expressed.
           *
           * On the slide rather than on the deck, which is a decision: a reader
           * places a guide to line up the things *on this slide*, and a deck-wide
           * guide would follow them onto slides where it means nothing. It is
           * also what PowerPoint does. The cost is that a guide has to be placed
           * again on the next slide, which is the same cost every tool that does
           * it this way pays.
           */
          guides: { type: 'array', required: false }
        }
      },

      /**
       * Rich text placed on a slide is `textFrame` with one thing added: which
       * slot of the layout it fills. A title is a `textFrame` with
       * `role: 'title'`, so every command that works on a paragraph works on a
       * title — which is the whole reason this product is cheap. It is given its
       * `role` in the loop below, beside the design attributes.
       */

      // What the presenter says is a `surfaceNote`, which the office schema
      // already declares — a resource named by the slide that shows it, and
      // named for how it binds rather than for who reads it, because the same
      // relationship is an author's note beside a page and a facilitator's note
      // beside a board. I wrote a `slideNotes` before reading for one, which is
      // the mistake this whole product keeps finding in other people's code and
      // is why the check belongs in the build rather than in somebody's memory.

      /**
       * The shapes a reader designs with, given the vocabulary to be designed.
       *
       * A shape's whole style was `fill`, `stroke` and `strokeWidth` — a flat
       * colour and a solid line, which is a diagram's vocabulary. A gradient and
       * a shadow are not effects somebody goes looking for in Keynote or Canva;
       * they are what "designing" means there.
       *
       * Declared here rather than in the office schema, and only on the nodes
       * this product draws as HTML: Word draws its shapes as SVG, where a
       * gradient is a `<defs><linearGradient>` and a shadow is a filter. Giving
       * Word attributes it does not read is the fault this repository keeps
       * finding in itself, so these live where they are read — see `paint.ts`.
       */
      ...Object.fromEntries(
        ['rectangle', 'ellipse', 'path', 'textFrame', 'frame', 'sticky'].map((stype) => [
          stype,
          {
            ...(office.nodes as Record<string, any>)[stype],
            attrs: {
              ...(office.nodes as Record<string, any>)[stype]?.attrs,
              ...((stype === 'textFrame'
                ? { role: { type: 'string', required: false } }
                : {}) as Record<string, unknown>),
              ...DECK_STYLE_ATTRS,
              /**
               * Corners, for the boxes that have them.
               *
               * Not the ellipse, which is round by construction, and not the
               * path, whose corners are in its own `d`. Declaring them there
               * would be four fields in the panel that change nothing — the
               * exact fault the panel's schema-driven rows exist to avoid.
               */
              ...((stype === 'ellipse' || stype === 'path' ? {} : CORNER_ATTRS) as Record<
                string,
                unknown
              >),
              /**
               * Mirrored, for every box a reader can flip — which is all of them.
               *
               * An ellipse and a rectangle look the same flipped and are still
               * offered it, deliberately: what a reader flips is usually the
               * *gradient* or the picture inside, and a control that appeared for
               * some shapes and not others would be a rule nobody could learn.
               * See `flip.ts`.
               */
              ...FLIP_ATTRS,
              ...SHAPE_NAME_ATTR
            }
          }
        ])
      ),

      /**
       * A connector, with the dash the deck draws.
       *
       * Not the whole of `DECK_STYLE_ATTRS`: a connector has no interior, so a fill, a
       * gradient and a shadow are three things nothing could put anywhere — the same
       * reason it has no `fill` at all (`docs/specs/canvas-model.md` §8.1). What it
       * does have is the **dash**, because a dashed line means something in a diagram:
       * a broken relationship, a planned one, or drafting's own convention that a
       * dash-dot line is an imaginary thing.
       *
       * `svgDash` is what reads it, which is Slides' — Word draws its shapes as SVG
       * and would answer this differently — so it is declared here beside the other
       * design attributes rather than in the office schema.
       */
      connector: {
        ...(office.nodes as Record<string, any>).connector,
        attrs: {
          ...(office.nodes as Record<string, any>).connector?.attrs,
          strokeDash: DECK_STYLE_ATTRS.strokeDash,
          ...SHAPE_NAME_ATTR
        }
      },

      /**
       * A picture, and which part of it is shown.
       *
       * Declared here for the same reason the design attributes above are: this
       * product draws a picture as HTML and crops it by placing the image inside
       * the box that clips it. Word draws its pictures in a flow, where the same
       * four numbers are a different implementation entirely, and giving Word
       * attributes it does not read is the fault this repository keeps finding in
       * itself. See `crop.ts` for what the numbers mean and why they are
       * fractions of the source.
       */
      picture: {
        ...(office.nodes as Record<string, any>).picture,
        attrs: {
          ...(office.nodes as Record<string, any>).picture?.attrs,
          ...CROP_ATTRS,
          // A rounded photograph, which is one line of CSS here and a different
          // piece of work in a word processor — see `corners.ts`.
          ...CORNER_ATTRS,
          // And a mirrored one, which is the commonest flip there is.
          ...FLIP_ATTRS,
          ...SHAPE_NAME_ATTR
        }
      },

      /**
       * A layout: the placeholders a slide of this kind starts with, and how
       * they are formatted.
       *
       * A definition, like a style — it is referenced by `layoutId` and never
       * drawn. Its children are the placeholder boxes at the positions the
       * layout puts them.
       */
      /**
       * Time, beside the document rather than in it.
       *
       * A track holds the timing and names what it animates, so a node that
       * knows nothing about animation can still be animated and a deck with no
       * motion pays nothing — the alternative was every node type growing a time
       * field and every operation maintaining one. Declared now and not before,
       * because its first reader exists now: a slide transition.
       */
      motionTrack: {
        name: 'motionTrack',
        group: 'resource',
        content: 'motionStep*',
        attrs: {
          id: { type: 'string', required: true },
          name: { type: 'string', required: false }
        }
      },

      /**
       * One thing that happens, in the order it happens.
       *
       * `kind: 'transition'` is the whole slide arriving and names nothing.
       * `target` is what a *build* will name a shape with, and is the one
       * attribute here that nothing reads: a sid cannot be written into a saved
       * document, so a build needs shapes to carry a stable name of their own,
       * which is not settled. It is declared because leaving it out would mean
       * changing the schema in the middle of writing a build, and it is in the
       * backlog as undeclared work rather than counted as finished.
       */
      motionStep: {
        name: 'motionStep',
        attrs: {
          kind: { type: 'string', default: 'transition' },
          effect: { type: 'string', required: false },
          /** Milliseconds — the one measurement in this model that is not twips. */
          duration: { type: 'number', default: 400 },
          delay: { type: 'number', default: 0 },
          /** `onClick`, `withPrevious`, `afterPrevious` — PowerPoint's three. */
          startsWith: { type: 'string', default: 'onClick' },
          /**
           * How the step is eased: a preset's name, or a `cubic-bezier(...)` the
           * document wrote itself.
           *
           * Every step in the product ran `ease` because there was nowhere to
           * say otherwise — the word was in a template string in the renderer.
           * A curve is what separates a build that feels made from one that
           * feels computed, and it is the one thing every design tool lets a
           * reader draw by hand.
           */
          easing: { type: 'string', default: 'ease' },
          /**
           * How many times it runs. One, unless a reader asks for more.
           *
           * `0` means *until the slide moves on* — a count of zero is not a
           * thing anybody can mean by "how many times", so it is the one
           * unambiguous way to say "no count" in a number, and PowerPoint's own
           * repeat has the same special value. An emphasis that keeps going is
           * how a slide points at something for as long as it is talked about.
           */
          repeat: { type: 'number', default: 1 },
          /**
           * Which way, and how much — an effect's *options*, where the direction
           * used to be part of its name.
           *
           * `flyInLeft` and `flyInRight` were two effects, which is a list that
           * grows by multiplication: eight directions and six entrances is
           * forty-eight names for six ideas. And a reader who had set a duration,
           * a curve and an order would have been changing *which effect* to make
           * the shape come from the other side. PowerPoint stores the same shape
           * — a preset and a subtype — and the old names still read, in one
           * table, in `motion-effects.ts`.
           */
          direction: { type: 'string', required: false },
          amount: { type: 'number', required: false },
          /**
           * **Which one** of the target's fills or shadows this step animates.
           *
           * A shape's fills are a list and so are its effects, so a motion that
           * says "the gradient" or "the shadow" is naming a list rather than a
           * thing in it — measured, one shared variable turned *both* gradients of
           * a two-fill shape. Which list is the effect's business
           * (`EffectDefinition.part`); which item is the reader's, and this is it.
           *
           * Absent means the first, which is the top one — the order the panel
           * draws and Figma lists. An index past the shape's list animates the
           * last item there is rather than nothing, because a step outlives the
           * fill it named the moment a reader deletes a layer.
           */
          partAt: { type: 'number', required: false },
          /**
           * What the effect is applied to: the box, or the pieces of its text.
           *
           * `box`, `paragraph`, `word`, `letter` — PowerPoint's "group text" and
           * Canva's text animations, and an *option* rather than a kind of step
           * for a reason worth keeping: every one of the twelve effects works on
           * a piece of text exactly as it works on a box. A `text` kind would
           * have to hold a copy of the whole effect table. See `text-units.ts`.
           */
          unit: { type: 'string', required: false },
          /**
           * Milliseconds between one piece and the next.
           *
           * Only read where `unit` is not `box`. Absent means 60, which is the
           * interval at which a run of letters reads as one thing arriving in
           * sequence rather than as many things arriving separately.
           */
          stagger: { type: 'number', required: false },
          /**
           * A path the shape travels, as points in twips relative to where it
           * rests — `(0, 0)` is "where it already is".
           *
           * Only read on a step of kind `path`, which is a kind rather than an
           * effect because it needs a *style* written before the animation
           * (`offset-path`) and no effect has a prerequisite. See
           * `motion-path.ts`, and `docs/specs/motion-model.md` §5 for the
           * measurement that says it composes with everything else.
           */
          path: { type: 'array', required: false },
          /** `fixed` or `path`: whether the shape turns to face its travel. */
          facing: { type: 'string', required: false },
          /**
           * Whether a path's corners are rounded off. Absent is *yes*, which is
           * what a curve through placed points wants — and what drew the zigzag
           * preset as a wave until this existed.
           */
          smooth: { type: 'boolean', required: false },
          /**
           * The shape whose click runs this step, by the name that shape carries.
           *
           * The third kind of start condition, and the one that is not about the
           * sequence: `startsWith` places a step among the presses, and this
           * takes it *out* of them — a trigger runs when its shape is clicked, as
           * often as it is clicked, or never. See `timeline.ts`.
           */
          on: { type: 'string', required: false },
          /**
           * A colour the effect needs, for the effects that need one.
           *
           * A glow's colour, a bloom's, a tint's. The first attribute on a step
           * that is not a number, a name or a duration — and it exists because
           * `filter` does: `drop-shadow` and `feFlood` both take a colour, and
           * `currentColor` is only the right answer for text.
           *
           * A `theme:` slot resolves like every other colour in this model, so a
           * deck whose accent changes changes its glows with it.
           */
          color: { type: 'string', required: false },
          /**
           * How many trailing copies follow the shape: an afterimage.
           *
           * `0` is none, which is what absent means. The copies are the *view's*
           * — clones of the rendered element, put back when the animation is,
           * like the per-letter spans — so what the document holds is only how
           * many. See `docs/specs/motion-model.md` §7a for the measurement.
           */
          echo: { type: 'number', required: false },
          /** The shape a build animates, by a name it carries. Nothing reads it. */
          target: { type: 'string', required: false }
        }
      },

      slideLayout: {
        name: 'slideLayout',
        group: 'resource',
        content: 'scene*',
        attrs: {
          id: { type: 'string', required: true },
          name: { type: 'string', required: false },
          /**
           * The master this layout follows, if it follows one.
           *
           * Optional, because a layout that says everything itself is a complete
           * layout — and because every deck written before masters existed has
           * none, and must keep drawing exactly as it did.
           */
          masterId: { type: 'string', required: false },
          /** The slide's background, when the layout is the one that sets it. */
          fill: { type: 'string', required: false }
        }
      },

      /**
       * The master: what every layout starts from.
       *
       * PowerPoint's own shape — master above layouts above slides — and the
       * reason it exists is that without it a layout has to repeat the deck's
       * background and the deck's idea of where a title goes, once per layout.
       * Two layouts that disagree about the title's font are then a deck with no
       * design, and nobody can tell which of the two was the mistake.
       *
       * Its children are placeholders like a layout's, matched the same way — by
       * *role*, never by position. A master's `title` is where a title's
       * formatting comes from when the layout says nothing about it.
       */
      slideMaster: {
        name: 'slideMaster',
        group: 'resource',
        content: 'scene*',
        attrs: {
          id: { type: 'string', required: true },
          name: { type: 'string', required: false },
          /** The background every slide under it shows, unless something nearer says otherwise. */
          fill: { type: 'string', required: false },
          /**
           * The theme this master is designed in.
           *
           * PowerPoint binds a theme to a master, and this deck already resolves
           * formatting and background up that chain — so a theme is one step
           * further along a road that exists rather than a second one.
           */
          themeId: { type: 'string', required: false }
        }
      },

      /**
       * A film and a sound, placed on a slide.
       *
       * They were taken out of the office schema the day it stopped declaring
       * what nothing drew — fifteen node types with no renderer between them —
       * and they come back the same way: with a renderer, a command and a
       * control, in the product that draws them.
       *
       * Scene nodes, not the standard schema's flow ones. A video *in the text*
       * and a video *placed on a slide* are both real and are not the same node:
       * the deck's is dragged, resized and put behind the title, which is the
       * same distinction `picture` and `inline-image` already make.
       *
       * `atom`, because a film has no children a document can describe, and the
       * three playback attributes are the ones a slide actually uses — a
       * background video loops silently and starts itself, and a clip a
       * presenter talks over does not.
       */
      mediaVideo: {
        name: 'mediaVideo',
        group: 'scene',
        atom: true,
        attrs: {
          src: { type: 'string', required: true },
          /** The still shown before it plays, which is what a slide mostly shows. */
          poster: { type: 'string', required: false },
          autoplay: { type: 'boolean', default: false },
          loop: { type: 'boolean', default: false },
          muted: { type: 'boolean', default: false },
          controls: { type: 'boolean', default: true },
          ...MEDIA_TRIM_ATTRS,
          ...CANVAS_GEOMETRY_ATTRS,
          ...CORNER_ATTRS
        }
      },

      mediaAudio: {
        name: 'mediaAudio',
        group: 'scene',
        atom: true,
        attrs: {
          src: { type: 'string', required: true },
          autoplay: { type: 'boolean', default: false },
          loop: { type: 'boolean', default: false },
          controls: { type: 'boolean', default: true },
          ...MEDIA_TRIM_ATTRS,
          ...CANVAS_GEOMETRY_ATTRS
        }
      },

      /**
       * A theme: the colours and faces a deck is designed in, named rather than
       * repeated.
       *
       * A shape's fill is a hex string, so a deck built by hand has that string
       * copied onto forty shapes — and re-colouring it means finding all forty,
       * including the ones on the slide nobody scrolled to. A slot is written
       * where a colour goes, `theme:accent1` beside `#0ea5e9`, and one place says
       * what the slots are. See `theme.ts`.
       */
      theme: {
        name: 'theme',
        group: 'resource',
        attrs: THEME_ATTRS
      }
    }
  };
}

/** The kind a slide surface carries, so a product can tell one from a page. */
export const SLIDE_KIND = SurfaceKind.Slide;
