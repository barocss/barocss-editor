import { Editor, Extension, selectedNodeIds } from '@barocss/editor-core';
import { CANVAS_GEOMETRY_ATTRS, CANVAS_STYLE_ATTRS } from '@barocss/schema';
import { transaction } from '@barocss/model';
import { laysOut } from '@barocss/office-word';
import { copyOf, deckSlides, layoutPlaceholders, noteFor, type DeckAccess, type DeckNode } from './deck';
import { boxOf, slideSize } from './geometry';
import { isSceneType, slideAt, toSurface } from './selection';
import { THEME_COLOUR_SLOTS, themeFor } from './theme';
import { reorderSteps, shiftedDelays, slideTimeline, withTiming } from './timeline';
import { DIRECTIONS, KNOWN_EFFECT_IDS, easingCss, effectDefinition } from './motion-effects';
import { TEXT_UNITS } from './text-units';
import { FACINGS, pathPointsOf, pathPreset } from './motion-path';
import { comboAttrs, comboById } from './motion-presets';
import { trimChanges, trimOf } from './media-trim';
import { guidePlace, readGuides, withGuide } from './guides';
import { flipChange, type FlipAxis } from './flip';
import {
  BUILD_STARTS,
  DEFAULT_TRANSITION_MS,
  TRANSITIONS,
  trackFor,
  transitionStepOf
} from './motion';
import { SLIDE_16_9 } from './geometry';

/** One attribute as the schema declares it: enough to check a value against. */
interface AttrShape {
  type?: string;
  required?: boolean;
  default?: unknown;
}

/**
 * The commands that are a deck's own.
 *
 * Everything else Slides offers is text editing, which is the shared kit's and
 * Word's. These are the ones with no counterpart in a document: a page is a
 * consequence of how much text there is, and a slide is a thing the author
 * makes, moves, hides and throws away — and the things on it are boxes with a
 * position rather than paragraphs in a flow.
 *
 * Without them the product is a deck *viewer*, which is what it was until now.
 * `setBoxGeometry` and `setBoxStyle` join them: the first thing here that edits
 * a *box* rather than a slide, and the first thing anywhere to read `locked`.
 *
 * ## One transaction each
 *
 * Every command here commits exactly one transaction, and the operations it is
 * built from — `addChild`, `removeChild`, `moveNode`, `setAttrs` — each declare
 * an inverse. That is not incidental: `transaction` collects those inverses and
 * *is* undo, so a command assembled from operations that refuse to say how to
 * undo them is a command a reader cannot take back. Duplicating a slide is a
 * single `addChild` of a copied tree rather than a clone-then-move for the same
 * reason: two steps that each undo cleanly still leave a reader pressing Ctrl+Z
 * twice for one action they took once.
 */
export class SlidesExtension implements Extension {
  name = 'slides';
  priority = 45;

  onCreate(editor: Editor): void {
    const register = (name: string, execute: (payload?: any) => Promise<boolean> | boolean, canExecute: (payload?: any) => boolean) => {
      (editor as any).registerCommand({
        name,
        execute: async (_ed: Editor, payload?: any) => await execute(payload),
        canExecute: (_ed: Editor, payload?: any) => canExecute(payload)
      });
    };

    /**
     * A new slide, after the one given.
     *
     * It starts with its layout's placeholders, which is the first thing in
     * this repository to *read* a `slideLayout` — the node was declared,
     * rendered (hidden) and used by nothing, which is the fault this product
     * keeps finding elsewhere and had committed itself within the week.
     *
     * The layout is the one asked for, or the one the preceding slide follows,
     * because a deck is mostly runs of slides that look alike.
     */
    register(
      'insertSlide',
      (payload) => this._insertSlide(editor, payload),
      () => !!this._access(editor)
    );

    register(
      'deleteSlide',
      (payload) => this._deleteSlide(editor, payload?.slideId),
      (payload) => this._canDelete(editor, payload?.slideId)
    );

    register(
      'duplicateSlide',
      (payload) => this._duplicateSlide(editor, payload?.slideId),
      (payload) => !!this._slideAt(editor, payload?.slideId)
    );

    /** Reorder, by where the slide should end up — 0 is first. */
    register(
      'moveSlide',
      (payload) => this._moveSlide(editor, payload?.slideId, payload?.to),
      (payload) => this._canMove(editor, payload?.slideId, payload?.to)
    );

    /**
     * Keep the slide, skip it while presenting.
     *
     * A property of the slide and not of the reader: hiding a slide is an
     * editorial decision about the deck, unlike which slide is on screen, which
     * is a fact about one person looking at it.
     */
    register(
      'toggleSlideHidden',
      (payload) => this._toggleHidden(editor, payload?.slideId),
      (payload) => !!this._slideAt(editor, payload?.slideId)
    );

    /**
     * The guides a reader places on a slide, in one command.
     *
     * One rather than add/move/remove, because all three are the same write — the
     * slide's whole list — and a drag out of the ruler is *all three in sequence*:
     * it adds one, moves it every pointer event, and removes it if it is let go
     * off the slide. Three commands would make that one gesture three kinds of
     * history entry, and a reader pressing undo once would get a guide back at
     * the wrong place.
     *
     * The arithmetic — what is a duplicate, what is off the slide, how a guide is
     * named while it is being dragged — is `guides.ts`, and tested there.
     */
    register(
      'setSlideGuides',
      (payload) => this._setGuides(editor, payload?.guides, payload?.slideId),
      (payload) => Array.isArray(payload?.guides) && !!this._slideAt(editor, payload?.slideId)
    );

    /**
     * A guide placed, and all of them cleared, **without a pointer**.
     *
     * The rulers became controls when they became something to pull a guide out of, and
     * they say so — `role="separator"` with a label — but nothing placed one without a
     * drag, so the reader who most needs to be told the ruler is there could not use it.
     *
     * Where it goes is `guidePlace`: the middle of the selection on that axis, or the
     * slide's middle with nothing selected. A key has no position, and the useful answer is
     * not the middle of the slide — a reader placing a guide is nearly always lining
     * something up with what they have already picked.
     */
    register(
      'addSlideGuide',
      (payload) => this._addGuide(editor, payload),
      (payload) => (payload?.axis === 'x' || payload?.axis === 'y') && !!this._slideAt(editor, payload?.slideId)
    );

    register(
      'clearSlideGuides',
      (payload) => this._setGuides(editor, [], payload?.slideId),
      (payload) => {
        const doc = this._access(editor);
        const sid = this._slideAt(editor, payload?.slideId);
        // Refused when there are none: a command that would write the list it already has
        // is an undo entry a reader watches do nothing.
        return !!doc && !!sid && readGuides((doc.getNode(sid) as any)?.attributes).length > 0;
      }
    );

    /**
     * Where a box is and how big.
     *
     * One command for all four numbers rather than four, because a properties
     * panel changes one at a time and a drag changes two at once, and both have
     * to be one entry in the history. Only the values given are written: a panel
     * that sent all four would overwrite a width the reader had not touched with
     * whatever its field happened to be showing.
     *
     * Refused for a locked box. `locked` is in the schema, was read by nothing,
     * and the first command that could move something is the first one that owes
     * it an answer.
     */
    register(
      'setBoxGeometry',
      (payload) =>
        this._setBoxAttrsAll(editor, this._boxesNamed(payload), (nodeId) =>
          this._geometryOf(editor, { ...payload, nodeId })
        ),
      (payload) =>
        this._boxesNamed(payload).some(
          (nodeId) =>
            this._canEditBox(editor, nodeId) &&
            Object.keys(this._geometryOf(editor, { ...payload, nodeId })).length > 0
        )
    );

    /**
     * How big every slide is.
     *
     * Deck-wide, and applied to every surface rather than held once on the
     * document: a slide already carries its own size, because a deck may
     * genuinely mix them, and a second place saying the same thing is a second
     * place to disagree. So "the deck is 4:3" is what it looks like — every
     * slide is.
     *
     * Nothing on the slides is rescaled. A shape at 3in from the left is at 3in
     * from the left on a narrower slide too, which is what every presentation
     * tool does and what an author expects: the alternative silently rewrites
     * every coordinate in the deck.
     */
    register(
      'setDeckSize',
      (payload) => this._setDeckSize(editor, payload),
      (payload) =>
        Number.isFinite(payload?.width) &&
        Number.isFinite(payload?.height) &&
        payload.width > 0 &&
        payload.height > 0
    );

    /**
     * Which layout a slide follows.
     *
     * Only the binding. Re-applying the layout's placeholders to a slide that
     * already has content would throw away what the author wrote, and there is
     * no reading of "change layout" that a reader would want to undo twice.
     */
    register(
      'setSlideLayout',
      (payload) => this._setSlideLayout(editor, payload?.slideId, payload?.layoutId),
      (payload) => !!this._slideAt(editor, payload?.slideId)
    );

    /** Fill and stroke. `null` means none, which is not the same as white. */
    register(
      'setBoxStyle',
      (payload) =>
        this._setBoxAttrsAll(editor, this._boxesNamed(payload), (nodeId) =>
          this._styleOf(editor, { ...payload, nodeId })
        ),
      (payload) =>
        this._boxesNamed(payload).some(
          (nodeId) =>
            this._canEditBox(editor, nodeId) &&
            Object.keys(this._styleOf(editor, { ...payload, nodeId })).length > 0
        )
    );

    /**
     * How a slide arrives — the first reader of time in this model.
     *
     * Time lives beside the document (`docs/specs/canvas-model.md` §4): the
     * slide names a `motionTrack`, the track holds `motionStep`s, and a step of
     * kind `transition` is the whole slide arriving. So this command writes as
     * much of that structure as is missing and no more — the track the first
     * time, the step the first time, the two attributes every time after.
     *
     * `none` takes the step away rather than storing "none", because a document
     * that says a slide has no transition and a document that says nothing are
     * the same document, and keeping the second shape means every reader has to
     * know both.
     */
    register(
      'setSlideTransition',
      (payload) => this._setTransition(editor, payload?.slideId, payload?.effect, payload?.duration),
      (payload) =>
        !!this._slideAt(editor, payload?.slideId) &&
        typeof payload?.effect === 'string' &&
        (TRANSITIONS as readonly string[]).includes(payload.effect)
    );

    /**
     * Re-colour the deck: set the theme's slots, keeping everything that
     * overrode them.
     *
     * This is what a theme is *for*. A shape that named `theme:accent1` follows
     * the deck; a shape that named a hex chose that colour and keeps it — so
     * applying a theme is one edit to one resource rather than a walk over every
     * slide rewriting fills, and "keeping what a slide overrode" is not a rule
     * this has to implement. It is what naming a slot already means.
     *
     * The theme the master names, or the deck's only one. A deck with neither is
     * given a theme, because a reader asking for these colours means the deck to
     * have them — and a command that silently did nothing would look like the
     * theme not working.
     */
    register(
      'setDeckTheme',
      (payload) => this._setTheme(editor, payload),
      (payload) => Object.keys(this._themeValues(payload)).length > 0
    );

    /**
     * Give a shape a build, or take the one it has away.
     *
     * One command for both, because a reader choosing an effect from a list
     * whose first entry is "없음" is making one choice. `none` removes every
     * build naming that shape rather than storing the word — the same rule the
     * transition follows, and the same reason: a document that says a shape has
     * no build and one that says nothing are the same document.
     *
     * Where the *naming* happens. A step cannot hold a sid (see `motion.ts`), so
     * the shape is given a name it keeps — assigned here, in the same
     * transaction as the step that needs it, so a name is never written for a
     * build that failed to be made and a build never names something that was
     * not named.
     */
    register(
      'setBoxBuild',
      (payload) =>
        this._setBuild(
          editor,
          payload?.nodeId,
          payload?.effect,
          payload?.startsWith,
          false,
          this._stepChanges(payload)
        ),
      (payload) => {
        if (!this._canEditBox(editor, payload?.nodeId)) return false;
        if (typeof payload?.effect !== 'string') return false;
        if (payload.effect === 'none') return this._buildStepsFor(editor, payload.nodeId).length > 0;
        return KNOWN_EFFECT_IDS.includes(payload.effect);
      }
    );

    /**
     * The timeline's three edits: change a step, move it, throw it away.
     *
     * Every one of them names a *step*, not a shape. A shape can carry more than
     * one step — a film that plays and later fades out — and a panel that showed
     * a list and edited by shape would change the wrong row the moment it did.
     *
     * They are three commands rather than one `editStep({ what })` for the
     * reason the harness gave when media tried to be one: a command should say
     * what it does. These do not make nodes, so nothing checks them for it —
     * which is all the more reason to be honest without being made to.
     */
    register(
      'setMotionStep',
      (payload) => this._setStep(editor, payload),
      (payload) =>
        this._stepsNamed(editor, payload).length > 0 && this._stepChanges(payload) !== undefined
    );

    /**
     * Several bars dragged together, and the arrows that nudge them.
     *
     * Relative, because that is what the gesture is: six bars moved as one each
     * keep their offset from the others, which is the whole reason a reader
     * selected six.
     */
    register(
      'shiftMotionSteps',
      (payload) => this._shiftSteps(editor, payload),
      (payload) =>
        this._stepsNamed(editor, payload).length > 0 &&
        typeof payload?.by === 'number' &&
        Number.isFinite(payload.by) &&
        payload.by !== 0
    );

    register(
      'moveMotionStep',
      (payload) => this._moveStep(editor, payload?.stepId, payload?.by),
      (payload) => this._canMoveStep(editor, payload?.stepId, payload?.by)
    );

    /**
     * A *second* effect on a shape, which is what makes the list a sequence.
     *
     * `setBoxBuild` replaces — one shape, one effect, which is all a dropdown can
     * mean. A shape that appears, is emphasised while it is talked about and then
     * leaves is three steps on one shape, and that is the thing every tool this
     * is measured against calls animating: Canva stacks them per element, Figma
     * per object, CapCut per clip.
     *
     * Appends rather than replacing, which is the whole difference between the
     * two commands and the reason both exist.
     */
    register(
      'addBoxBuild',
      (payload) =>
        this._setBuild(
          editor,
          payload?.nodeId,
          payload?.effect,
          /**
           * A shape's *first* motion starts a press; its second follows the
           * first.
           *
           * Both halves matter and they are opposite. A second motion on a shape
           * is almost always a continuation — appear, then be emphasised, then
           * leave — so defaulting it to `onClick` would make the reader undo the
           * command's opinion to see what they added. But a *first* motion on a
           * shape that had none is a new thing happening, and stacking it onto
           * whatever the last shape does would mean two shapes animating together
           * because of the order they were clicked in.
           *
           * PowerPoint's rule exactly, and it fell out of a test: two shapes each
           * given one effect have to take two presses.
           */
          payload?.startsWith ??
            (this._buildStepsFor(editor, payload?.nodeId).length > 0
              ? 'afterPrevious'
              : 'onClick'),
          true,
          this._stepChanges(payload)
        ),
      (payload) =>
        this._canEditBox(editor, payload?.nodeId) && KNOWN_EFFECT_IDS.includes(payload?.effect)
    );

    /**
     * A named combination: two motions at once, in one gesture.
     *
     * Only expressible since the timeline learned to composite — before it, the
     * second motion on a shape silently lost. So these are the presets the model
     * could not hold last week, and they are the ones that read as *designed*: a
     * title that rises while it grows, a badge that pops while it flashes.
     *
     * Its own command because it writes *several* steps, and one transaction
     * because it is one click: a reader who picked 올라오며 커지기 and pressed undo
     * expects the combination back, not half of it.
     */
    register(
      'addBoxCombo',
      (payload) => this._addCombo(editor, payload),
      (payload) => this._canEditBox(editor, payload?.nodeId) && !!comboById(payload?.combo)
    );

    /**
     * One motion, given to several shapes at once, a beat apart.
     *
     * What every tool calls "apply to all" and what a reader means by animating a
     * *group*: three bullets that rise one after another, six cards that pop in
     * sequence. Two hundred milliseconds apart is the difference between a list
     * arriving and a list appearing.
     *
     * ## Why it writes N steps rather than one step naming N shapes
     *
     * A step could have held a list of targets and a gap. It would have needed
     * `target` to become a list — in the schema, in `slideTimeline`, in the
     * timeline's tracks, in every reader of it — to express something the model
     * already says perfectly well: three steps, `withPrevious`, with delays 0,
     * 200, 400.
     *
     * And the version that writes values is *better* to use. Each shape gets its
     * own bar the moment it is made, so a reader who wants the third one a little
     * later drags it, rather than dissolving a group to get at it. This is the
     * same argument the presets make: **the document holds values, and a gesture
     * is a gesture.**
     */
    register(
      'addBoxesMotion',
      (payload) => this._addBoxesMotion(editor, payload),
      (payload) =>
        Array.isArray(payload?.nodeIds) &&
        payload.nodeIds.length > 0 &&
        payload.nodeIds.every((nodeId: unknown) => this._canEditBox(editor, nodeId as string)) &&
        (KNOWN_EFFECT_IDS.includes(payload?.effect) ||
          !!(pathPointsOf(payload?.path) ?? pathPreset(payload?.preset)?.points))
    );

    /**
     * A path a shape travels, which is the first step that is not an effect.
     *
     * Its own command rather than a `path` option on `addBoxBuild`, because what
     * it makes is a different *kind* of step: it carries a path instead of an
     * effect, and the stage writes a style before animating it. A payload that
     * meant two things depending on which key was present is exactly the shape
     * the harness refused when media tried to be one command.
     *
     * The path is a preset's or the caller's, in twips relative to where the
     * shape rests — see `motion-path.ts`.
     */
    register(
      'addBoxPath',
      (payload) => this._addPath(editor, payload),
      (payload) =>
        this._canEditBox(editor, payload?.nodeId) &&
        !!(pathPointsOf(payload?.path) ?? pathPreset(payload?.preset)?.points)
    );

    register(
      'removeMotionStep',
      (payload) => this._removeStep(editor, payload),
      (payload) => this._stepsNamed(editor, payload).length > 0
    );

    /**
     * A film or a sound, made part of the sequence.
     *
     * The other half of what a timeline is for: until now a film started when its
     * slide arrived or waited for the browser's own controls, and there was no
     * "play on the third press". It is a `play` step naming the media the way a
     * build names a shape — the same list, so the presenter's key does not have
     * to know which kind it is about to run.
     */
    register(
      'setBoxPlayback',
      (payload) => this._setPlayback(editor, payload?.nodeId, payload?.startsWith),
      (payload) => {
        const node = payload?.nodeId ? this._access(editor)?.getNode(payload.nodeId) : undefined;
        if (node?.stype !== 'mediaVideo' && node?.stype !== 'mediaAudio') return false;
        if (payload?.startsWith === 'none') return this._playStepsFor(editor, payload.nodeId).length > 0;
        return (BUILD_STARTS as readonly string[]).includes(payload?.startsWith);
      }
    );

    /**
     * Trim a film: which part of it plays.
     *
     * The other half of what `setBoxPlayback` started. That command says *when* a
     * film starts, which is what an animation list says; this says which part of
     * it plays, which is what a video editor's timeline says — and without it a
     * deck can only ever play a file from its first frame to its last, when every
     * real use of video in a deck is a piece of one.
     *
     * On the media node rather than on the step, because a trim is a fact about
     * the film — see `media-trim.ts` for that argument and for why an out-point of
     * zero means "to the end" rather than "nothing".
     */
    register(
      'setMediaTrim',
      (payload) =>
        this._setTrim(
          editor,
          payload?.nodeId,
          payload?.trimStart,
          payload?.trimEnd,
          payload?.stepId,
          payload?.delay
        ),
      (payload) => {
        const node = payload?.nodeId ? this._access(editor)?.getNode(payload.nodeId) : undefined;
        if (node?.stype !== 'mediaVideo' && node?.stype !== 'mediaAudio') return false;
        // One of the two, or both: the panel writes whichever field was typed in.
        return typeof payload?.trimStart === 'number' || typeof payload?.trimEnd === 'number';
      }
    );

    /**
     * Flip a box: mirrored left-to-right, or top-to-bottom.
     *
     * A **toggle per box**, which is the one decision in it. With one mirrored
     * shape and one not, a reader pressing 좌우 뒤집기 could mean "make them both
     * mirrored" or "mirror each of them" — every tool means the second, and so
     * does the word: the gesture is *flip*, not *set flipped*. Which also makes it
     * its own undo, pressed twice.
     *
     * A mirror rather than a negative width, because every reader of a box — the
     * handles, the align arithmetic, a frame's layout — assumes a size is a size.
     * See `flip.ts`.
     */
    register(
      'flipBoxes',
      (payload) => {
        const axis: FlipAxis = payload?.axis === 'y' ? 'y' : 'x';
        return this._setBoxAttrsAll(editor, this._boxesNamed(payload, editor), (nodeId) =>
          flipChange(this._access(editor)?.getNode(nodeId)?.attributes as never, axis)
        );
      },
      (payload) => {
        if (payload?.axis !== 'x' && payload?.axis !== 'y') return false;
        // Every box a reader can edit can be flipped: an ellipse looks the same
        // mirrored and its *gradient* does not, which is the usual reason to.
        return this._boxesNamed(payload, editor).some((nodeId) => this._canEditBox(editor, nodeId));
      }
    );

    /**
     * Crop a picture: which part of the source shows, and the box that shows it.
     *
     * One command for both halves because they are one gesture. Dragging a crop
     * handle takes the left of a picture away *and* shrinks the box by the same
     * amount, so that the rest of the picture does not move — and a box that
     * shrank without its crop changing is a squashed picture, which is what a
     * reader would be looking at if the two were separate commands and they
     * pressed undo once. The arithmetic is `cropByHandle`, in `crop.ts`.
     *
     * Refused for anything that is not a picture. Every other scene node either
     * has no source to show part of, or holds children whose coordinates would
     * be silently wrong the moment its box changed without them.
     */
    register(
      'cropPicture',
      (payload) => this._setBoxAttrs(editor, payload?.nodeId, this._cropOf(editor, payload)),
      (payload) => {
        if (!this._canEditBox(editor, payload?.nodeId)) return false;
        if (this._access(editor)?.getNode(payload!.nodeId)?.stype !== 'picture') return false;
        return Object.keys(this._cropOf(editor, payload)).length > 0;
      }
    );

    /**
     * Give a slide a note to present from.
     *
     * `surfaceNote` has been declared since the deck was described and `noteFor`
     * has resolved one since; nothing could ever make one. A deck could show a
     * note an author had written by hand into the fixture and could not add a
     * note to a slide.
     *
     * Two steps in one transaction, because a note is *two* things: a resource
     * holding the text, and the slide naming it. Either alone is not a note —
     * a resource nobody names is unreachable, and a name pointing at nothing
     * resolves to nothing — so one command, one undo.
     *
     * The id is the slide's sid. It is unique by construction and it says which
     * slide the note belongs to when a person reads the file, which is more than
     * a counter would. The *binding* is still the slide naming the note, the way
     * a surface names its header: a note carrying a `surfaceId` reads better and
     * cannot work, because a sid is handed out at load and an authored document
     * has none to write.
     */
    register(
      'addSlideNote',
      (payload) => this._addNote(editor, payload?.slideId),
      (payload) => {
        const doc = this._access(editor);
        const slide = this._slideAt(editor, payload?.slideId);
        return !!doc && !!slide && !noteFor(doc, slide);
      }
    );

    /**
     * Lock a box, or let it go.
     *
     * Its own command because every other one is refused for a locked box — that
     * is what `locked` means and `_canEditBox` enforces it — so a lock set
     * through `setBoxStyle` could never be taken off again. The attribute was
     * readable and unsettable: the guard had been written, the schema had
     * declared it, and nothing in the product could produce a locked box at all.
     *
     * Guarded on being a box and nothing else. Locking a locked box is refused
     * as well, so the toolbar's state and the command agree and a no-op does not
     * get an entry in the history.
     */
    register(
      'setBoxLocked',
      (payload) =>
        this._setBoxAttrsAll(
          editor,
          this._boxesNamed(payload),
          () => ({ locked: payload?.locked === true }),
          { evenIfLocked: true }
        ),
      (payload) => {
        if (typeof payload?.locked !== 'boolean') return false;
        /**
         * Runnable when *any* of them would change.
         *
         * Not all: a selection of one locked and one unlocked box, told to lock,
         * is a reader asking for both to be locked — and refusing because one of
         * them already is would leave the lock looking broken.
         */
        return this._boxesNamed(payload).some((nodeId) => {
          const node = this._access(editor)?.getNode(nodeId);
          if (!isSceneType(node?.stype)) return false;
          return (node!.attributes?.locked === true) !== payload.locked;
        });
      }
    );

    /**
     * Hide a box while it is being worked on, and bring it back.
     *
     * `visible` was the same case `locked` had been: **declared in the shared
     * schema, read by the renderers** (`isVisible` → `display: none`, in this
     * product's and in Word's), and settable by nothing. The attribute worked and
     * no reader could reach it.
     *
     * `evenIfLocked`, like the lock itself: hiding is not editing the shape, and a
     * reader who locked something to stop moving it by accident has not asked to
     * lose the ability to get it out of the way.
     *
     * Not the same thing as a slide's `hidden`, which is *editorial* — a slide kept
     * in the deck and skipped in the show. A hidden box is hidden everywhere,
     * including the show, because there is no third state for "in the deck but not
     * on the slide".
     */
    register(
      'setBoxVisible',
      (payload) =>
        this._setBoxAttrsAll(
          editor,
          this._boxesNamed(payload),
          () => ({ visible: payload?.visible === true }),
          { evenIfLocked: true }
        ),
      (payload) => {
        if (typeof payload?.visible !== 'boolean') return false;
        // Runnable when any of them would change — the same rule as the lock, and
        // for the same reason.
        return this._boxesNamed(payload).some((nodeId) => {
          const node = this._access(editor)?.getNode(nodeId);
          if (!isSceneType(node?.stype)) return false;
          return (node!.attributes?.visible !== false) === !payload.visible;
        });
      }
    );
  }

  // ── Reading ────────────────────────────────────────────────────────────────

  private _access(editor: Editor): DeckAccess | null {
    const store = (editor as any).dataStore;
    const rootId = (editor as any).getRootId?.();
    if (!store || !rootId) return null;
    return { rootId, getNode: (sid: string) => store.getNode(sid) };
  }

  /** The slide asked for, or the first one, so a command with no argument works. */
  private _slideAt(editor: Editor, slideId?: string): string | undefined {
    const doc = this._access(editor);
    if (!doc) return undefined;

    const slides = deckSlides(doc);
    if (slideId) return slides.some((slide) => slide.sid === slideId) ? slideId : undefined;
    return slides[0]?.sid;
  }

  /**
   * A deck with no slides is not a deck.
   *
   * The last one cannot be deleted, the way a document keeps one paragraph: an
   * editor with nothing in it has nowhere to put a caret and nothing to draw,
   * and the reader's next action would have to create one implicitly.
   */
  private _canDelete(editor: Editor, slideId?: string): boolean {
    const doc = this._access(editor);
    if (!doc) return false;
    return deckSlides(doc).length > 1 && !!this._slideAt(editor, slideId);
  }

  private _canMove(editor: Editor, slideId?: string, to?: number): boolean {
    const doc = this._access(editor);
    const sid = this._slideAt(editor, slideId);
    if (!doc || !sid || typeof to !== 'number' || !Number.isInteger(to)) return false;

    const slides = deckSlides(doc);
    if (to < 0 || to >= slides.length) return false;
    // Moving a slide to where it already is is not an edit, and committing one
    // would put an entry in the history that undoes to the same document.
    return slides.findIndex((slide) => slide.sid === sid) !== to;
  }

  /**
   * Where a slide sits among the document's children.
   *
   * Not the same as its number in the deck: `docMeta` and `resources` are the
   * document's children too, so slide 1 is rarely child 0. Every position
   * passed to an operation is this one, and every position shown to a reader is
   * the other.
   */
  private _childIndexOf(editor: Editor, sid: string): number {
    const doc = this._access(editor);
    const root = doc && doc.getNode(doc.rootId);
    const children = Array.isArray(root?.content) ? (root!.content as string[]) : [];
    return children.indexOf(sid);
  }

  // ── Editing ────────────────────────────────────────────────────────────────

  private async _insertSlide(
    editor: Editor,
    payload?: { after?: string; layoutId?: string }
  ): Promise<boolean> {
    const doc = this._access(editor);
    if (!doc) return false;

    const slides = deckSlides(doc);
    const after = payload?.after ?? slides[slides.length - 1]?.sid;
    const previous = slides.find((slide) => slide.sid === after);
    const layoutId = payload?.layoutId ?? previous?.layoutId;

    const placeholders = layoutPlaceholders(doc, layoutId);

    /**
     * A slide with no layout still needs somewhere to type.
     *
     * An empty `surface` is legal and useless: `scene*` accepts nothing at all,
     * so the reader would get a blank rectangle with no box to put a caret in
     * and no way to make one. One title frame, at the size the layouts use.
     */
    const content =
      placeholders.length > 0
        ? placeholders
        : [
            {
              stype: 'textFrame',
              attributes: {
                role: 'title',
                x: 1440,
                y: 960,
                width: SLIDE_16_9.width - 2880,
                height: 1680
              },
              content: [{ stype: 'paragraph', attributes: {}, content: [] }]
            }
          ];

    const at = after ? this._childIndexOf(editor, after) : -1;

    const result = await transaction(editor, [
      {
        type: 'addChild',
        payload: {
          parentId: doc.rootId,
          child: {
            stype: 'surface',
            attributes: { kind: 'slide', ...(layoutId ? { layoutId } : {}) },
            content
          },
          // After the slide it follows. Appended when there is nothing to
          // follow, which `addChild` does when the position is out of range.
          ...(at >= 0 ? { position: at + 1 } : {})
        }
      }
    ] as never).commit();

    return result.success;
  }

  private async _deleteSlide(editor: Editor, slideId?: string): Promise<boolean> {
    if (!this._canDelete(editor, slideId)) return false;
    const sid = this._slideAt(editor, slideId)!;
    const doc = this._access(editor)!;

    const result = await transaction(editor, [
      { type: 'removeChild', payload: { parentId: doc.rootId, childId: sid } }
    ] as never).commit();

    return result.success;
  }

  private async _duplicateSlide(editor: Editor, slideId?: string): Promise<boolean> {
    const doc = this._access(editor);
    const sid = this._slideAt(editor, slideId);
    if (!doc || !sid) return false;

    // A tree with no sids in it, so the copy is a different node all the way
    // down rather than a second thing claiming the original's identity.
    const copy = copyOf(doc, sid);
    if (!copy) return false;

    const at = this._childIndexOf(editor, sid);

    const result = await transaction(editor, [
      {
        type: 'addChild',
        payload: {
          parentId: doc.rootId,
          child: copy,
          ...(at >= 0 ? { position: at + 1 } : {})
        }
      }
    ] as never).commit();

    return result.success;
  }

  private async _moveSlide(editor: Editor, slideId?: string, to?: number): Promise<boolean> {
    if (!this._canMove(editor, slideId, to)) return false;
    const sid = this._slideAt(editor, slideId)!;
    const doc = this._access(editor)!;

    /**
     * The target, in the document's children rather than in the deck.
     *
     * A reader says "third slide"; `moveNode` wants a child index, and the
     * document's children include `docMeta` and `resources`. Translating
     * through the slide already at the target position is the only way that
     * stays right whatever else the document holds.
     */
    const slides = deckSlides(doc);
    const target = this._childIndexOf(editor, slides[to!].sid);
    if (target < 0) return false;

    const result = await transaction(editor, [
      { type: 'moveNode', payload: { nodeId: sid, newParentId: doc.rootId, position: target } }
    ] as never).commit();

    return result.success;
  }

  // ── Boxes ──────────────────────────────────────────────────────────────────

  /**
   * Whether this box can be edited at all.
   *
   * `locked` has been in the schema since the canvas nodes were declared and
   * nothing had ever read it, because nothing could move a box. A command that
   * ignored it would make the attribute a lie rather than leave it unread.
   */
  private _canEditBox(editor: Editor, nodeId?: string): boolean {
    const doc = this._access(editor);
    if (!doc || !nodeId) return false;

    const node = doc.getNode(nodeId);
    if (!isSceneType(node?.stype)) return false;
    return node!.attributes?.locked !== true;
  }

  /**
   * Which attributes each command may write, asked of the schema.
   *
   * These were two hardcoded lists — `['x','y','width','height','rotation']` and
   * `['fill','stroke','strokeWidth','opacity']` — and they had already drifted
   * from what the schema declares. `cornerRadius`, `locked` and `visible` were
   * declared, drawn by the renderers, and named by neither list: three
   * attributes a document could hold, a reader could see on the page, and
   * nothing in the product could change. Found by reading a rectangle's
   * attributes in a browser, which is not a way of finding things that scales.
   *
   * So the split is stated once, in the schema, and read here:
   *
   * - **Geometry** is `CANVAS_GEOMETRY_ATTRS` — where the box is, how big, how
   *   turned, how solid, whether drawn. Less `locked`, which has its own command
   *   because every other one is refused for a locked box.
   * - **Style** is `CANVAS_STYLE_ATTRS`, plus whatever else the node type itself
   *   declares: `cornerRadius` on a rectangle, `verticalAlign` on a text frame,
   *   `clipsContent` on a frame. There is nowhere else for a per-shape
   *   presentation attribute to go, and a new one added to the schema is
   *   settable the same day rather than the day somebody notices.
   * - **Identity is excluded**: an extra the schema marks `required` is what
   *   makes the node that node — a `path` without `d` is not a path — and is not
   *   something a formatting command may take away. Required attributes *inside*
   *   the geometry group are not identity and stay settable, which is what keeps
   *   `width` and `height` writable.
   *
   * A node with no declaration in the schema gets nothing written to it, rather
   * than everything.
   */
  private _declaredAttrs(editor: Editor, nodeId?: string): Record<string, AttrShape> {
    const stype = nodeId ? this._access(editor)?.getNode(nodeId)?.stype : undefined;
    if (!stype) return {};
    const schema = (editor as any).dataStore?.getActiveSchema?.();
    return (schema?.getNodeType?.(stype)?.attrs ?? {}) as Record<string, AttrShape>;
  }

  /**
   * The payload's values for a set of declared attributes, typed as declared.
   *
   * A value of the wrong type is dropped rather than coerced: a width of `"12"`
   * is a caller's mistake and writing 12 would hide it. `null` is kept for a
   * string attribute alone, because that is how a caller says "no fill" — see
   * `_setBoxAttrs`, which turns it into a removal.
   */
  private _valuesFor(
    payload: any,
    declared: Record<string, AttrShape>,
    allow: (key: string, shape: AttrShape) => boolean
  ): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (const [key, shape] of Object.entries(declared)) {
      if (!allow(key, shape)) continue;
      if (!(key in (payload ?? {}))) continue;

      const value = payload[key];
      if (shape.type === 'number' && typeof value === 'number' && Number.isFinite(value)) {
        out[key] = value;
      } else if (shape.type === 'boolean' && typeof value === 'boolean') {
        out[key] = value;
      } else if (shape.type === 'string' && (typeof value === 'string' || value === null)) {
        out[key] = value;
      } else if (shape.type === 'array' && (Array.isArray(value) || value === null)) {
        /**
         * A list, for the attributes that are one: a shape's paints and its
         * effects.
         *
         * Taken whole rather than merged. A reader reordering two fills, or
         * deleting the first of three, is describing the *list* — and a command
         * that merged would have to be told which of "changed", "moved" and
         * "removed" it was looking at, which is three commands wearing one name.
         *
         * `null` clears it, the same way it clears a colour, which is how a shape
         * goes back to having none.
         */
        out[key] = value;
      }
    }
    return out;
  }

  /** Where the box is and how it is drawn, less the lock. */
  private _geometryOf(editor: Editor, payload: any): Record<string, unknown> {
    /**
     * A child of a frame that **arranges** has no place of its own to write.
     *
     * The frame owns its children's coordinates (canvas-model §5), so an `x` written here
     * is put straight back by the layout: measured — the command reported success, the
     * shape did not move, and undo did nothing because the reader's own entry restored
     * the number the layout had already restored. Refusing says so, which is what lets
     * the panel grey the two fields and a drag mean something else instead (the order —
     * `reorderIndexAt`).
     *
     * Its **size** is still its own: the arrangement places children and does not resize
     * them.
     */
    const doc = this._access(editor);
    const parent = payload?.nodeId
      ? ((doc?.getNode(payload.nodeId) as any)?.parentId as string | undefined)
      : undefined;
    const arranged = !!parent && laysOut((doc?.getNode(parent) as any)?.attributes);

    return this._valuesFor(
      payload,
      this._declaredAttrs(editor, payload?.nodeId),
      (key) =>
        key !== 'locked' &&
        key in CANVAS_GEOMETRY_ATTRS &&
        !(arranged && (key === 'x' || key === 'y'))
    );
  }

  /**
   * A crop, and the box that shows it.
   *
   * Both halves through one declaration check, like everything else here: the
   * four fractions and the four numbers of the placement, taken from the schema
   * so a picture that declares them is croppable and one that does not is
   * refused rather than quietly written to.
   */
  private _cropOf(editor: Editor, payload: any): Record<string, unknown> {
    const declared = this._declaredAttrs(editor, payload?.nodeId);
    return this._valuesFor(
      payload,
      declared,
      (key) => key.startsWith('crop') || key in CANVAS_GEOMETRY_ATTRS
    );
  }

  /** How the box is painted, including whatever this shape declares of its own. */
  private _styleOf(editor: Editor, payload: any): Record<string, unknown> {
    return this._valuesFor(
      payload,
      this._declaredAttrs(editor, payload?.nodeId),
      (key, shape) =>
        !(key in CANVAS_GEOMETRY_ATTRS) && (key in CANVAS_STYLE_ATTRS || shape.required !== true)
    );
  }

  /**
   * Write attributes onto a box, including taking one away.
   *
   * Removal is the awkward half and it is awkward at the operation level, not
   * here: `setAttrs` merges, and an attribute set to `undefined` is dropped from
   * the merge rather than removed from the node — so clearing a fill left the
   * old colour in place and the command reported success.
   *
   * The only way to remove one is to state the whole set with `replace: true`,
   * which means reading the node first. So a payload carrying `null` becomes a
   * replacement built from what the node has, minus the keys being cleared;
   * anything else stays a merge, which is both cheaper and safe against a
   * concurrent write to an attribute this command was not asked about.
   *
   * That every caller wanting to remove an attribute has to reconstruct the set
   * is a gap in the operation vocabulary, not a fact about slides — noted in
   * `docs/BACKLOG.md`.
   */
  /**
   * The resource and the binding, together.
   *
   * `$alias` is what lets one transaction do both: the note is declared with a
   * name, and the step that points the slide at it refers to that name rather
   * than to a sid nobody can know until the transaction has run.
   */
  /**
   * Write a slide's transition, making only what is missing.
   *
   * Three shapes of edit in one command, which is right because they are one
   * intention: a reader choosing "fade" does not care whether this deck has ever
   * held a track. One transaction each way, so one undo takes the whole thing
   * back — including the track it had to create, which would otherwise be left
   * behind as a resource naming nothing.
   */
  private async _setTransition(
    editor: Editor,
    slideId?: string,
    effect?: string,
    duration?: number
  ): Promise<boolean> {
    const doc = this._access(editor);
    const slide = this._slideAt(editor, slideId);
    if (!doc || !slide || typeof effect !== 'string') return false;
    if (!(TRANSITIONS as readonly string[]).includes(effect)) return false;

    const ms =
      typeof duration === 'number' && Number.isFinite(duration) && duration > 0
        ? Math.round(duration)
        : DEFAULT_TRANSITION_MS;

    const step = transitionStepOf(doc, slide);

    // Taking it off: the step goes, and the deck is back to saying nothing.
    if (effect === 'none') {
      if (!step) return false;
      // `removeChild` takes the parent and the child, not the child alone — a
      // node is removed *from* somewhere.
      const track = trackFor(doc, slide);
      if (!track) return false;
      return await this._commitKeepingSelection(editor, [
        { type: 'removeChild', payload: { parentId: track, childId: step } }
      ]);
    }

    if (step) {
      return await this._commitKeepingSelection(editor, [
        {
          type: 'setAttrs',
          payload: {
            nodeId: step,
            attrs: { ...(doc.getNode(step)?.attributes ?? {}), effect, duration: ms }
          }
        }
      ]);
    }

    const track = trackFor(doc, slide);
    if (track) {
      return await this._commitKeepingSelection(editor, [
        {
          type: 'addChild',
          payload: {
            parentId: track,
            child: { stype: 'motionStep', attributes: { kind: 'transition', effect, duration: ms } }
          }
        }
      ]);
    }

    const resources = this._resourcesOf(doc);
    if (!resources) return false;

    const surface = doc.getNode(slide);
    return await this._commitKeepingSelection(editor, [
      {
        type: 'addChild',
        payload: {
          parentId: resources,
          child: {
            stype: 'motionTrack',
            // The slide's sid as the id, exactly as a note does: unique by
            // construction, and it says which slide the track belongs to when a
            // person reads the file.
            attributes: { id: slide },
            content: [
              { stype: 'motionStep', attributes: { kind: 'transition', effect, duration: ms } }
            ]
          }
        }
      },
      {
        type: 'setAttrs',
        payload: { nodeId: slide, attrs: { ...(surface?.attributes ?? {}), trackId: slide } }
      }
    ]);
  }

  /**
   * A combination: several steps on one shape, written together.
   *
   * The parts are ordinary presets and what this writes is exactly what picking
   * each of them by hand would write — the first starting a press, the rest
   * `withPrevious`. Which is the same principle as everything else here: a name is
   * the panel's, and the document holds values.
   */
  private async _addCombo(editor: Editor, payload: any): Promise<boolean> {
    const doc = this._access(editor);
    const nodeId = payload?.nodeId;
    const combo = comboById(payload?.combo);
    if (!doc || !nodeId || !combo) return false;

    const node = doc.getNode(nodeId);
    if (!node || !isSceneType(node.stype)) return false;

    const slide = slideAt(doc, nodeId);
    if (!slide) return false;

    const existing = typeof node.attributes?.name === 'string' ? node.attributes.name : '';
    const name = existing || this._freeShapeName(doc);
    const naming = existing
      ? []
      : [
          {
            type: 'setAttrs',
            payload: { nodeId, attrs: { ...(node.attributes ?? {}), name } }
          }
        ];

    // Whether the *first* part starts a press or joins one is the same question
    // `addBoxBuild` answers: a shape's first motion is a new thing happening, and
    // a later one is a continuation.
    const joins = this._buildStepsFor(editor, nodeId).length > 0;
    const steps = comboAttrs(combo).map((attrs, index) => ({
      stype: 'motionStep',
      attributes: {
        kind: 'build',
        ...attrs,
        target: name,
        startsWith:
          index === 0 ? (joins ? 'afterPrevious' : 'onClick') : (attrs.startsWith ?? 'withPrevious')
      }
    }));
    if (steps.length === 0) return false;

    const track = trackFor(doc, slide);
    if (track) {
      return await this._commitKeepingSelection(editor, [
        ...naming,
        ...steps.map((step) => ({ type: 'addChild', payload: { parentId: track, child: step } }))
      ]);
    }

    const resources = this._resourcesOf(doc);
    if (!resources) return false;

    return await this._commitKeepingSelection(editor, [
      ...naming,
      {
        type: 'addChild',
        payload: {
          parentId: resources,
          child: { stype: 'motionTrack', attributes: { id: slide }, content: steps }
        }
      },
      {
        type: 'setAttrs',
        payload: {
          nodeId: slide,
          attrs: { ...(doc.getNode(slide)?.attributes ?? {}), trackId: slide }
        }
      }
    ]);
  }

  /**
   * The same motion on several shapes, a beat apart, in one transaction.
   *
   * One transaction because it is one gesture: a reader who animated six cards
   * and pressed undo expects six cards' worth of undo, once. Which also means the
   * shape *names* are written here alongside the steps that need them — the same
   * rule `_setBuild` follows, six times over.
   *
   * The first step starts the press and the rest run *with* it, offset by the
   * gap. Not `afterPrevious`: that would wait for each shape to finish before the
   * next began, which is a queue rather than a wave, and takes six times as long
   * as anybody wants.
   */
  private async _addBoxesMotion(editor: Editor, payload: any): Promise<boolean> {
    const doc = this._access(editor);
    const nodeIds: string[] = Array.isArray(payload?.nodeIds) ? payload.nodeIds : [];
    if (!doc || nodeIds.length === 0) return false;

    const chosen = pathPreset(payload?.preset);
    const path = pathPointsOf(payload?.path) ?? chosen?.points;
    const effect = typeof payload?.effect === 'string' ? payload.effect : undefined;
    if (!path && !(effect && KNOWN_EFFECT_IDS.includes(effect))) return false;

    const slide = slideAt(doc, nodeIds[0]);
    if (!slide) return false;

    /**
     * How far apart, in milliseconds.
     *
     * 120 unless the caller says otherwise — far enough apart to read as a
     * sequence, close enough that six shapes are done inside a second. Clamped to
     * the same range a text stagger is, because it is the same kind of number.
     */
    const apart =
      typeof payload?.apart === 'number' && Number.isFinite(payload.apart)
        ? Math.min(1000, Math.max(0, Math.round(payload.apart)))
        : 120;

    const timing = this._stepChanges(payload) ?? {};
    const naming: any[] = [];
    const steps: any[] = [];
    const taken = new Set<string>();

    nodeIds.forEach((nodeId, index) => {
      const node = doc.getNode(nodeId);
      if (!node || !isSceneType(node.stype)) return;
      // Every shape on the same slide: a step lives in *a* slide's track, and
      // shapes from two slides would need two.
      if (slideAt(doc, nodeId) !== slide) return;

      const existing = typeof node.attributes?.name === 'string' ? node.attributes.name : '';
      let name = existing;
      if (!name) {
        // `_freeShapeName` reads the document, which does not change until this
        // transaction commits — so the names are counted here rather than asked
        // for one at a time, or six shapes would all be called `shape-1`.
        let next = 1;
        while (taken.has(`shape-${next}`) || this._nameTaken(doc, `shape-${next}`)) next += 1;
        name = `shape-${next}`;
        naming.push({
          type: 'setAttrs',
          payload: { nodeId, attrs: { ...(node.attributes ?? {}), name } }
        });
      }
      taken.add(name);

      steps.push({
        stype: 'motionStep',
        attributes: {
          kind: path ? 'path' : 'build',
          duration: DEFAULT_TRANSITION_MS,
          ...timing,
          ...(path
          ? {
              path,
              smooth: typeof payload?.smooth === 'boolean' ? payload.smooth : (chosen?.smooth ?? true),
              facing: payload?.facing === 'path' ? 'path' : 'fixed'
            }
          : { effect }),
          target: name,
          startsWith: index === 0 ? 'onClick' : 'withPrevious',
          /**
           * The gap, not the total — because `withPrevious` means "with the step
           * *before* this one", so a delay is measured from that step's start and
           * the offsets accumulate on their own.
           *
           * Written as `index * apart` at first, which made three shapes start at
           * 0, 200 and **600**: the third one's base was the second one's start,
           * not the first's. Caught by the browser test that read the bars.
           */
          delay: index === 0 ? 0 : apart
        }
      });
    });

    if (steps.length === 0) return false;

    const track = trackFor(doc, slide);
    if (track) {
      return await this._commitKeepingSelection(editor, [
        ...naming,
        ...steps.map((step) => ({ type: 'addChild', payload: { parentId: track, child: step } }))
      ]);
    }

    const resources = this._resourcesOf(doc);
    if (!resources) return false;

    return await this._commitKeepingSelection(editor, [
      ...naming,
      {
        type: 'addChild',
        payload: {
          parentId: resources,
          child: { stype: 'motionTrack', attributes: { id: slide }, content: steps }
        }
      },
      {
        type: 'setAttrs',
        payload: {
          nodeId: slide,
          attrs: { ...(doc.getNode(slide)?.attributes ?? {}), trackId: slide }
        }
      }
    ]);
  }

  /** Whether any node already carries a name, which `_freeShapeName` also asks. */
  private _nameTaken(doc: DeckAccess, name: string): boolean {
    const walk = (sid: string, depth: number): boolean => {
      if (depth > 32) return false;
      const node = doc.getNode(sid);
      if (node?.attributes?.name === name) return true;
      for (const child of Array.isArray(node?.content) ? (node!.content as string[]) : []) {
        if (typeof child === 'string' && walk(child, depth + 1)) return true;
      }
      return false;
    };
    return walk(doc.rootId, 0);
  }

  /**
   * Write a path step: the shape's name, the track, and the step.
   *
   * The same shape as `_setBuild` — and *appending* always, because a path is
   * something a shape does as well as whatever else it does. A path that replaced
   * the shape's entrance would be a command nobody could mean.
   */
  private async _addPath(editor: Editor, payload: any): Promise<boolean> {
    const doc = this._access(editor);
    const nodeId = payload?.nodeId;
    if (!doc || !nodeId) return false;

    const chosen = pathPreset(payload?.preset);
    const points = pathPointsOf(payload?.path) ?? chosen?.points;
    if (!points) return false;
    const smooth =
      typeof payload?.smooth === 'boolean' ? payload.smooth : (chosen?.smooth ?? true);

    const node = doc.getNode(nodeId);
    if (!node || !isSceneType(node.stype)) return false;

    const slide = slideAt(doc, nodeId);
    if (!slide) return false;

    const existing = typeof node.attributes?.name === 'string' ? node.attributes.name : '';
    const name = existing || this._freeShapeName(doc);
    const naming = existing
      ? []
      : [
          {
            type: 'setAttrs',
            payload: { nodeId, attrs: { ...(node.attributes ?? {}), name } }
          }
        ];

    const timing = this._stepChanges(payload) ?? {};
    const step = {
      stype: 'motionStep',
      attributes: {
        kind: 'path',
        duration: DEFAULT_TRANSITION_MS * 3,
        ...timing,
        path: points,
        smooth,
        facing: (FACINGS as readonly string[]).includes(payload?.facing ?? '')
          ? payload.facing
          : 'fixed',
        target: name,
        /**
         * A shape's *first* motion starts a press and a later one follows it —
         * the same rule `addBoxBuild` explains at length, and the same reason: a
         * path added to a shape that already appears is a continuation.
         */
        startsWith:
          (BUILD_STARTS as readonly string[]).includes(payload?.startsWith ?? '')
            ? payload.startsWith
            : this._buildStepsFor(editor, nodeId).length > 0
              ? 'afterPrevious'
              : 'onClick'
      }
    };

    // The track, or the track *and* the slide's binding to it — the same two
    // cases `_setBuild` has, and the same one transaction either way: a name
    // written for a step that was never made would leave the document carrying an
    // identifier nothing uses.
    const track = trackFor(doc, slide);
    if (track) {
      return await this._commitKeepingSelection(editor, [
        ...naming,
        { type: 'addChild', payload: { parentId: track, child: step } }
      ]);
    }

    const resources = this._resourcesOf(doc);
    if (!resources) return false;

    return await this._commitKeepingSelection(editor, [
      ...naming,
      {
        type: 'addChild',
        payload: {
          parentId: resources,
          child: { stype: 'motionTrack', attributes: { id: slide }, content: [step] }
        }
      },
      {
        type: 'setAttrs',
        payload: {
          nodeId: slide,
          attrs: { ...(doc.getNode(slide)?.attributes ?? {}), trackId: slide }
        }
      }
    ]);
  }

  /** A step by sid, when it really is one. */
  private _stepAt(editor: Editor, stepId?: string): DeckNode | undefined {
    const node = stepId ? this._access(editor)?.getNode(stepId) : undefined;
    return node?.stype === 'motionStep' ? node : undefined;
  }

  /**
   * The slide a step belongs to, which is not `slideAt`'s question.
   *
   * A step lives in a `motionTrack` inside `resources` — beside the document, per
   * `canvas-model.md` §4 — so walking *up* from it finds no surface at all.
   * `slideAt` answered `undefined` and a multi-bar drag silently did nothing.
   *
   * The link is the other way round: a slide names its track by `trackId`, so the
   * slide is the one whose id matches the track this step is in.
   */
  private _slideOfStep(editor: Editor, stepSid?: string): string | undefined {
    const doc = this._access(editor);
    const track = stepSid ? this._trackOfStep(editor, stepSid) : undefined;
    if (!doc || !track) return undefined;

    const id = doc.getNode(track)?.attributes?.id;
    if (typeof id !== 'string') return undefined;

    for (const slide of deckSlides(doc)) {
      if (doc.getNode(slide.sid)?.attributes?.trackId === id) return slide.sid;
    }
    return undefined;
  }

  /** The track a step is in, which every edit to it needs. */
  private _trackOfStep(editor: Editor, stepId: string): string | undefined {
    const doc = this._access(editor);
    const parent = (doc?.getNode(stepId) as { parentId?: unknown } | undefined)?.parentId;
    if (typeof parent !== 'string') return undefined;
    return doc?.getNode(parent)?.stype === 'motionTrack' ? parent : undefined;
  }

  /**
   * What a payload actually asks to change about a step, or nothing.
   *
   * Nothing is a refusal rather than a no-op write: a command that succeeds
   * having changed nothing puts an entry in the history that undoes to the same
   * document, and a reader pressing undo watches nothing happen.
   */
  private _stepChanges(payload: any, step?: DeckNode): Record<string, unknown> | undefined {
    const out: Record<string, unknown> = {};

    if (typeof payload?.effect === 'string' && KNOWN_EFFECT_IDS.includes(payload.effect)) {
      out.effect = payload.effect;
    }
    /**
     * The effect's options, which only the effects that declare them accept.
     *
     * Checked against the effect the step will *have* — the payload's if it
     * carries one, otherwise the step's — because a direction on a flash is a
     * value nothing will ever read, and writing it would leave the document
     * carrying a setting the panel does not show. That is what a preset makes
     * happen: one bundle of five values applied over another effect's five.
     *
     * Unknown, when there is no step to ask (the validator's first pass), means
     * *accept*: the option is checked again on the way to the document, and a
     * validator that refused would grey out a control for a step it cannot see.
     */
    const takes = effectDefinition(
      (out.effect as string | undefined) ??
        (typeof step?.attributes?.effect === 'string' ? step.attributes.effect : undefined)
    )?.takes;

    // `takes` missing is an unknown effect, which is *accept*; `takes.direction`
    // missing is the effect saying no. Two different absences, and reading them
    // as one wrote a direction onto a flash — caught by the test that asked.
    const offers = (option: 'direction' | 'amount' | 'color'): boolean =>
      !takes || !!takes[option];

    if (
      typeof payload?.direction === 'string' &&
      (DIRECTIONS as readonly string[]).includes(payload.direction) &&
      offers('direction')
    ) {
      out.direction = payload.direction;
    }
    /**
     * A colour, for the effects that take one.
     *
     * Checked the same way the options are — against what the effect *declares* —
     * so a colour on a fly is a value nothing will ever read. `null` clears it,
     * which is how a reader goes back to the effect's own default (a glow in the
     * shape's own colour).
     */
    /**
     * `null`, not `undefined`, to clear it.
     *
     * A merged `undefined` is dropped rather than written — measured: the colour
     * survived being cleared — and `null` is what this model already means by
     * "none" everywhere else a colour can be absent (`fill: null` on a box).
     * `attrString` reads anything that is not a string as nothing, so a `null`
     * colour is a step with no colour to every reader of it.
     */
    if (payload?.color === null && offers('color')) out.color = null;
    else if (typeof payload?.color === 'string' && payload.color && offers('color')) {
      out.color = payload.color;
    }

    if (
      typeof payload?.amount === 'number' &&
      Number.isFinite(payload.amount) &&
      offers('amount')
    ) {
      out.amount = Math.min(1, Math.max(0, payload.amount));
    }
    /**
     * Which of the target's fills or shadows — for the effects that animate one.
     *
     * Offered by the effect rather than accepted from anybody: `part` is the
     * declaration that this effect touches a *list*, and a `partAt` on a fade
     * would be a number in the document that nothing reads. The same rule as
     * `takes`, one field along.
     *
     * Not clamped to the shape's list here: the shape may gain a fill tomorrow,
     * and a step that named the third one should still mean the third one. The
     * *slot* cap is enforced where the variable is named — see `trackName`.
     */
    const named = effectDefinition(
      (out.effect as string | undefined) ??
        (typeof step?.attributes?.effect === 'string' ? step.attributes.effect : undefined)
    );
    /**
     * The two absences again, and they are not the same one.
     *
     * **No effect known** is the validator's first pass — there is no step to ask
     * — and it means *accept*, because refusing there greys out a control for a
     * step the validator cannot see. **A known effect with no `part`** is the
     * effect saying no. Reading them as one wrote nothing at all: the row moved
     * and the document did not, which is exactly what the comment above this one
     * says happened to `direction`.
     */
    const offersPart = !named || !!named.part;
    if (typeof payload?.partAt === 'number' && Number.isInteger(payload.partAt) && offersPart) {
      out.partAt = Math.max(0, payload.partAt);
    }

    // `0` is "until the slide moves on"; anything above ten is a reader holding
    // a key down rather than a thing they meant.
    if (typeof payload?.repeat === 'number' && Number.isInteger(payload.repeat)) {
      out.repeat = Math.min(10, Math.max(0, payload.repeat));
    }
    if (typeof payload?.startsWith === 'string' && (BUILD_STARTS as readonly string[]).includes(payload.startsWith)) {
      out.startsWith = payload.startsWith;
    }
    /**
     * An easing, which is a preset's name or a curve the reader drew.
     *
     * Checked by whether it *resolves*: `easingCss` answers `ease` for anything
     * it does not recognise, so a value that comes back as `ease` while not
     * being `ease` is a value this product cannot hold — and writing it would
     * leave a document saying something no reader of it can honour.
     */
    if (typeof payload?.easing === 'string' && payload.easing) {
      const resolved = easingCss(payload.easing);
      if (payload.easing === 'ease' || resolved !== 'ease') out.easing = payload.easing;
    }
    if (typeof payload?.duration === 'number' && Number.isFinite(payload.duration) && payload.duration > 0) {
      out.duration = Math.round(payload.duration);
    }
    if (typeof payload?.delay === 'number' && Number.isFinite(payload.delay) && payload.delay >= 0) {
      out.delay = Math.round(payload.delay);
    }
    /**
     * What the effect applies to, and how far apart the pieces are.
     *
     * A unit this product does not have is refused rather than stored: a step
     * saying `line` would animate as a box (see `slideTimeline`), so writing it
     * would leave the document claiming something the panel cannot show and the
     * stage does not do.
     */
    if (typeof payload?.unit === 'string' && (TEXT_UNITS as readonly string[]).includes(payload.unit)) {
      out.unit = payload.unit;
    }
    /**
     * A path, and which way the shape faces along it.
     *
     * Checked by `pathPointsOf`, which refuses a path of one point — a step that
     * travels nowhere is a bar a reader counts in their presses for nothing.
     */
    if (payload?.path !== undefined) {
      const points = pathPointsOf(payload.path);
      if (points) out.path = points;
    }
    if (typeof payload?.facing === 'string' && (FACINGS as readonly string[]).includes(payload.facing)) {
      out.facing = payload.facing;
    }
    /**
     * The shape whose click runs this step, or `null` to put it back in the
     * sequence.
     *
     * Any name, checked only for being a string: the shape it points at may not
     * exist yet (a reader can name a trigger before drawing the button), and a
     * step naming a shape that is gone is *kept and labelled* — the same rule the
     * targets follow, for the same reason.
     */
    if (payload?.on === null) out.on = null;
    else if (typeof payload?.on === 'string' && payload.on) out.on = payload.on;

    // Whether the path's corners are rounded off, which is a different path
    // rather than a different drawing of the same one.
    if (typeof payload?.smooth === 'boolean') out.smooth = payload.smooth;
    /**
     * How many trailing copies, and six is the ceiling.
     *
     * Not because seven would break, but because seven copies of a shape moving
     * is a smear rather than a trail, and every one of them is an animation the
     * browser has to run.
     */
    if (typeof payload?.echo === 'number' && Number.isInteger(payload.echo)) {
      out.echo = Math.min(6, Math.max(0, payload.echo));
    }
    if (typeof payload?.stagger === 'number' && Number.isFinite(payload.stagger) && payload.stagger >= 0) {
      // Ten to five hundred: below ten the stagger is invisible and above five
      // hundred a title of ten letters takes five seconds to arrive.
      out.stagger = Math.min(500, Math.max(10, Math.round(payload.stagger)));
    }

    return Object.keys(out).length > 0 ? out : undefined;
  }

  /**
   * Which steps a payload names: one, or a set.
   *
   * A set of one is not a different command — it is the same command with one
   * member — so `stepId` and `stepIds` are read here rather than by two commands
   * that would then have to be kept in step with each other. The harness's
   * objection to a polymorphic payload was to one command meaning two *different*
   * things; changing three steps and changing one is the same thing.
   */
  private _stepsNamed(editor: Editor, payload: any): DeckNode[] {
    const ids: unknown[] = Array.isArray(payload?.stepIds)
      ? payload.stepIds
      : payload?.stepId !== undefined
        ? [payload.stepId]
        : [];

    const found: DeckNode[] = [];
    for (const id of ids) {
      const step = typeof id === 'string' ? this._stepAt(editor, id) : undefined;
      if (step) found.push(step);
    }
    return found;
  }

  private async _setStep(editor: Editor, payload: any): Promise<boolean> {
    const steps = this._stepsNamed(editor, payload);
    if (steps.length === 0) return false;

    /**
     * The changes are worked out per step, not once.
     *
     * Because which options are *accepted* depends on the effect the step has —
     * a direction on a flash is a value nothing reads — so three steps with three
     * effects take three answers. Computing it once from the first step would
     * write a direction onto whichever of them could not use it.
     */
    const writes = steps
      .map((step) => ({ step, changes: this._stepChanges(payload, step) }))
      .filter((entry): entry is { step: DeckNode; changes: Record<string, unknown> } => !!entry.changes);
    if (writes.length === 0) return false;

    return await this._commitKeepingSelection(
      editor,
      writes.map(({ step, changes }) => ({
        type: 'setAttrs',
        payload: { nodeId: (step as { sid?: string }).sid, attrs: { ...(step.attributes ?? {}), ...changes } }
      }))
    );
  }

  /**
   * These steps, later or earlier by this many milliseconds.
   *
   * The multi-drag gesture, and a *relative* command because that is what the
   * gesture is: six bars dragged together each keep their own offset from the
   * others, which is the whole reason a reader selected six. An absolute delay
   * would need a value per step — a batch payload — to say the same thing worse.
   *
   * Never below zero: a bar dragged before the thing it follows means "as soon as
   * it can", which is the same rule `delayForStart` follows.
   */
  private async _shiftSteps(editor: Editor, payload: any): Promise<boolean> {
    const steps = this._stepsNamed(editor, payload);
    const by = payload?.by;
    if (steps.length === 0 || typeof by !== 'number' || !Number.isFinite(by) || by === 0) {
      return false;
    }

    /**
     * The arithmetic is the timeline's, because it is about the whole list.
     *
     * Adding `by` to each step's delay is the version that was written first and
     * is wrong for exactly the arrangement multi-select exists for: a
     * `withPrevious` step measures from the previous step's *start*, so two
     * chained bars shifted by 100ms moved by 100 and **200**. See `shiftedDelays`.
     */
    const doc = this._access(editor);
    const slide = doc ? this._slideOfStep(editor, (steps[0] as { sid?: string }).sid) : undefined;
    if (!doc || !slide) return false;

    const timed = withTiming(slideTimeline(doc, slide));
    const edits = shiftedDelays(
      timed,
      steps.map((step) => (step as { sid?: string }).sid as string),
      by
    );
    if (edits.length === 0) return false;

    return await this._commitKeepingSelection(
      editor,
      edits.map(({ sid, delay }) => ({
        type: 'setAttrs',
        payload: { nodeId: sid, attrs: { ...(doc.getNode(sid)?.attributes ?? {}), delay } }
      }))
    );
  }

  private _canMoveStep(editor: Editor, stepId?: string, by?: number): boolean {
    if (!stepId || (by !== 1 && by !== -1)) return false;
    const track = this._trackOfStep(editor, stepId);
    if (!track) return false;

    const order = ((this._access(editor)?.getNode(track)?.content ?? []) as string[]).filter(
      (sid) => typeof sid === 'string'
    );
    return reorderSteps(order, stepId, by) !== order;
  }

  /**
   * Move a step, which is a move within its track and nothing else.
   *
   * `moveChildren` rather than a remove and an add: the second is two entries in
   * the history for one gesture, and a reader who moved a step and pressed undo
   * would watch it come back somewhere else.
   */
  private async _moveStep(editor: Editor, stepId?: string, by?: number): Promise<boolean> {
    if (!this._canMoveStep(editor, stepId, by)) return false;
    const track = this._trackOfStep(editor, stepId!)!;
    const order = ((this._access(editor)?.getNode(track)?.content ?? []) as string[]).filter(
      (sid) => typeof sid === 'string'
    );
    const next = reorderSteps(order, stepId!, by!);

    return await this._commitKeepingSelection(editor, [
      { type: 'reorderChildren', payload: { parentId: track, childIds: next } }
    ]);
  }

  private async _removeStep(editor: Editor, payload: any): Promise<boolean> {
    const steps = this._stepsNamed(editor, payload);
    const removals = steps
      .map((step) => {
        const sid = (step as { sid?: string }).sid as string;
        return { sid, track: this._trackOfStep(editor, sid) };
      })
      .filter((entry): entry is { sid: string; track: string } => !!entry.track);
    if (removals.length === 0) return false;

    // One transaction for the lot: throwing away six motions is one gesture, and
    // a reader who pressed delete once presses undo once.
    return await this._commitKeepingSelection(
      editor,
      removals.map(({ sid, track }) => ({
        type: 'removeChild',
        payload: { parentId: track, childId: sid }
      }))
    );
  }

  /** The `play` steps that name a given media box. */
  private _playStepsFor(editor: Editor, nodeId?: string): string[] {
    const doc = this._access(editor);
    const node = nodeId ? doc?.getNode(nodeId) : undefined;
    const name = node?.attributes?.name;
    if (!doc || typeof name !== 'string' || !name) return [];

    const slide = slideAt(doc, nodeId!);
    if (!slide) return [];

    return slideTimeline(doc, slide)
      .filter((step) => step.kind === 'play' && step.target === name)
      .map((step) => step.sid);
  }

  /**
   * Put a film in the sequence, or take it out.
   *
   * The same shape as a build: the media is named if it has no name, the track is
   * made if the slide has none, and all of it is one transaction so that one undo
   * takes back the whole gesture.
   */
  private async _setPlayback(
    editor: Editor,
    nodeId?: string,
    startsWith?: string
  ): Promise<boolean> {
    const doc = this._access(editor);
    if (!doc || !nodeId) return false;

    const node = doc.getNode(nodeId);
    if (node?.stype !== 'mediaVideo' && node?.stype !== 'mediaAudio') return false;

    const slide = slideAt(doc, nodeId);
    if (!slide) return false;

    const existing = this._playStepsFor(editor, nodeId);

    if (startsWith === 'none') {
      const track = trackFor(doc, slide);
      if (!track || existing.length === 0) return false;
      return await this._commitKeepingSelection(
        editor,
        existing.map((sid) => ({ type: 'removeChild', payload: { parentId: track, childId: sid } }))
      );
    }

    if (!(BUILD_STARTS as readonly string[]).includes(startsWith ?? '')) return false;

    const name =
      typeof node.attributes?.name === 'string' && node.attributes.name
        ? (node.attributes.name as string)
        : this._freeShapeName(doc);
    const naming =
      typeof node.attributes?.name === 'string' && node.attributes.name
        ? []
        : [{ type: 'setAttrs', payload: { nodeId, attrs: { ...(node.attributes ?? {}), name } } }];

    const step = {
      stype: 'motionStep',
      attributes: { kind: 'play', target: name, startsWith, duration: DEFAULT_TRANSITION_MS }
    };

    const track = trackFor(doc, slide);
    if (track) {
      return await this._commitKeepingSelection(editor, [
        ...naming,
        ...existing.map((sid) => ({
          type: 'removeChild',
          payload: { parentId: track, childId: sid }
        })),
        { type: 'addChild', payload: { parentId: track, child: step } }
      ]);
    }

    const resources = this._resourcesOf(doc);
    if (!resources) return false;
    const surface = doc.getNode(slide);

    return await this._commitKeepingSelection(editor, [
      ...naming,
      {
        type: 'addChild',
        payload: {
          parentId: resources,
          child: { stype: 'motionTrack', attributes: { id: slide }, content: [step] }
        }
      },
      {
        type: 'setAttrs',
        payload: { nodeId: slide, attrs: { ...(surface?.attributes ?? {}), trackId: slide } }
      }
    ]);
  }

  /**
   * Which part of a film plays: two numbers on the film itself.
   *
   * `trimChanges` does the arithmetic — the clamping is the rule, and it is
   * unit-tested rather than argued about here. Written even when it comes out the
   * same, because a reader who typed 0 into 끝 meant "to the end" and the panel
   * has to be able to say it.
   */
  /**
   * A film's trim — and, when the gesture was a head dragged on the axis, the
   * step's delay with it.
   *
   * Two nodes in **one** transaction, which is the whole reason the delay is here
   * rather than left to `setMotionStep`: trimming a film's head moves where it
   * starts *and* where it begins (see `headTrim`), a reader did one thing, and two
   * commands would be two entries in the history that each undo half of it.
   *
   * The panel passes neither — its two fields are the trim and nothing else.
   */
  private async _setTrim(
    editor: Editor,
    nodeId?: string,
    trimStart?: number,
    trimEnd?: number,
    stepId?: string,
    delay?: number
  ): Promise<boolean> {
    const doc = this._access(editor);
    if (!doc || !nodeId) return false;

    const node = doc.getNode(nodeId);
    if (node?.stype !== 'mediaVideo' && node?.stype !== 'mediaAudio') return false;

    const next = trimChanges(trimOf(node), {
      start: typeof trimStart === 'number' ? trimStart : undefined,
      end: typeof trimEnd === 'number' ? trimEnd : undefined
    });

    const step = stepId && typeof delay === 'number' ? doc.getNode(stepId) : undefined;
    const moved =
      step && step.stype === 'motionStep'
        ? [
            {
              type: 'setAttrs',
              payload: {
                nodeId: stepId as string,
                attrs: { ...(step.attributes ?? {}), delay: Math.max(0, Math.round(delay as number)) }
              }
            }
          ]
        : [];

    return await this._commitKeepingSelection(editor, [
      {
        type: 'setAttrs',
        payload: {
          nodeId,
          attrs: { ...(node.attributes ?? {}), trimStart: next.start, trimEnd: next.end }
        }
      },
      ...moved
    ]);
  }

  /**
   * The build steps that name a given box, if any.
   *
   * By the box's *name*, which is the only thing a step can hold — so a box with
   * no name has no builds by construction, and asking is cheap.
   */
  private _buildStepsFor(editor: Editor, nodeId?: string): string[] {
    const doc = this._access(editor);
    const node = nodeId ? doc?.getNode(nodeId) : undefined;
    const name = node?.attributes?.name;
    if (!doc || typeof name !== 'string' || !name) return [];

    const slide = slideAt(doc, nodeId!);
    if (!slide) return [];

    return slideTimeline(doc, slide)
      .filter((step) => step.kind === 'build' && step.target === name)
      .map((step) => step.sid);
  }

  /**
   * A name for a shape that has none, unique in the deck.
   *
   * Readable rather than random: `shape-3` says something to a person opening
   * the file, where a uuid says only that a machine wrote it. The number is one
   * past the highest already taken, so removing a build and adding another does
   * not reuse a name a step elsewhere may still hold.
   *
   * ## Why the highest is remembered as well as read
   *
   * Reading the document is not enough, and this was measured: two commands
   * issued in the same tick — a second before the first has committed — read the
   * *same* document and both came out `shape-1`. Two shapes with one name is a
   * motion step that animates whichever the timeline finds first, which is the
   * kind of fault that shows up as "the wrong shape moved" a week later.
   *
   * So the number handed out is remembered, and the next one is past both the
   * document and the last answer. The counter is this session's and does not go
   * back on undo — names can be sparse (`shape-1`, `shape-4`), which is fine,
   * because what a name has to be is *unique*, not dense.
   */
  private _lastShapeNumber = 0;

  private _freeShapeName(doc: DeckAccess): string {
    let highest = 0;
    const walk = (sid: string, depth: number): void => {
      if (depth > 32) return;
      const node = doc.getNode(sid);
      const name = node?.attributes?.name;
      if (typeof name === 'string') {
        const match = /^shape-(\d+)$/.exec(name);
        if (match) highest = Math.max(highest, Number(match[1]));
      }
      for (const child of Array.isArray(node?.content) ? (node!.content as string[]) : []) {
        if (typeof child === 'string') walk(child, depth + 1);
      }
    };
    walk(doc.rootId, 0);

    const next = Math.max(highest, this._lastShapeNumber) + 1;
    this._lastShapeNumber = next;
    return `shape-${next}`;
  }

  /**
   * Write a box's build: the name, the track, the step, or the removal.
   *
   * One transaction each way, for the same reason the transition's is: a name
   * written for a step that was never made would leave the document carrying an
   * identifier nothing uses, and one undo has to take back the whole gesture.
   */
  private async _setBuild(
    editor: Editor,
    nodeId?: string,
    effect?: string,
    startsWith?: string,
    /** Append rather than replace — see `addBoxBuild`. */
    keepExisting = false,
    /**
     * The rest of what a motion is, when the caller knows it: a length, a curve,
     * a direction, an amount, a repeat.
     *
     * This is what makes a preset one command rather than five. A gallery click
     * means "arrive gently", which is a whole motion — and writing the effect
     * first and its timing after would put two entries in the history for one
     * gesture, and show the reader the effect at its default length in between.
     *
     * Already filtered and clamped by `_stepChanges`, so a caller cannot smuggle
     * a value the panel could not have produced.
     */
    values?: Record<string, unknown>
  ): Promise<boolean> {
    const doc = this._access(editor);
    if (!doc || !nodeId || typeof effect !== 'string') return false;

    const node = doc.getNode(nodeId);
    if (!node || !isSceneType(node.stype)) return false;

    const slide = slideAt(doc, nodeId);
    if (!slide) return false;

    if (effect === 'none') {
      const steps = this._buildStepsFor(editor, nodeId);
      if (steps.length === 0) return false;
      const track = trackFor(doc, slide);
      if (!track) return false;

      return await this._commitKeepingSelection(
        editor,
        steps.map((step) => ({
          type: 'removeChild',
          payload: { parentId: track, childId: step }
        }))
      );
    }

    if (!KNOWN_EFFECT_IDS.includes(effect)) return false;

    const start = (BUILD_STARTS as readonly string[]).includes(startsWith ?? '')
      ? (startsWith as string)
      : 'onClick';

    // The name the step will hold: the one it already has, or a new one written
    // in the same transaction as the step that needs it.
    const existing = typeof node.attributes?.name === 'string' ? node.attributes.name : '';
    const name = existing || this._freeShapeName(doc);
    const naming = existing
      ? []
      : [
          {
            type: 'setAttrs',
            payload: { nodeId, attrs: { ...(node.attributes ?? {}), name } }
          }
        ];

    const step = {
      stype: 'motionStep',
      attributes: {
        kind: 'build',
        // What the caller asked for wins over the defaults, and `kind` and
        // `target` win over the caller: a step that named something else would
        // animate a shape nobody chose.
        duration: DEFAULT_TRANSITION_MS,
        ...(values ?? {}),
        effect,
        target: name,
        startsWith: start
      }
    };

    /**
     * Replaced, or added to.
     *
     * Choosing from the *panel's* dropdown means "this shape's effect is now
     * that one" — two entrances from one list is not something a reader can
     * mean. Pressing "효과 추가" in the timeline means the other thing, and the
     * two commands say which.
     */
    const replaced = keepExisting ? [] : this._buildStepsFor(editor, nodeId);
    const track = trackFor(doc, slide);

    if (track) {
      return await this._commitKeepingSelection(editor, [
        ...naming,
        ...replaced.map((sid) => ({
          type: 'removeChild',
          payload: { parentId: track, childId: sid }
        })),
        { type: 'addChild', payload: { parentId: track, child: step } }
      ]);
    }

    const resources = this._resourcesOf(doc);
    if (!resources) return false;

    const surface = doc.getNode(slide);
    return await this._commitKeepingSelection(editor, [
      ...naming,
      {
        type: 'addChild',
        payload: {
          parentId: resources,
          child: { stype: 'motionTrack', attributes: { id: slide }, content: [step] }
        }
      },
      {
        type: 'setAttrs',
        payload: { nodeId: slide, attrs: { ...(surface?.attributes ?? {}), trackId: slide } }
      }
    ]);
  }

  /** The slots a payload actually names, typed as the schema declares them. */
  private _themeValues(payload: any): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (const key of [...THEME_COLOUR_SLOTS, 'majorFont', 'minorFont', 'name']) {
      const value = payload?.[key];
      if (typeof value === 'string' && value.length > 0) out[key] = value;
    }
    return out;
  }

  /**
   * Write the deck's theme, making one if the deck has none.
   *
   * One transaction, and the selection kept: re-colouring a deck is not a reason
   * to stop the reader working on the shape they had selected.
   */
  private async _setTheme(editor: Editor, payload: any): Promise<boolean> {
    const doc = this._access(editor);
    if (!doc) return false;

    const values = this._themeValues(payload);
    if (Object.keys(values).length === 0) return false;

    const theme = themeFor(doc, undefined);
    if (theme?.sid) {
      return await this._commitKeepingSelection(editor, [
        {
          type: 'setAttrs',
          payload: { nodeId: theme.sid, attrs: { ...(theme.attributes ?? {}), ...values } }
        }
      ]);
    }

    const resources = this._resourcesOf(doc);
    if (!resources) return false;

    /**
     * A new theme, and the master pointed at it in the same transaction.
     *
     * A theme nobody names is only found by the "there is exactly one" rule, and
     * a deck that later gains a second would silently stop resolving — so the
     * binding is written now, while there is something to bind.
     */
    const master = this._firstMaster(doc);
    const id = 'theme-1';

    return await this._commitKeepingSelection(editor, [
      {
        type: 'addChild',
        payload: {
          parentId: resources,
          child: { stype: 'theme', attributes: { id, ...values } }
        }
      },
      ...(master?.sid
        ? [
            {
              type: 'setAttrs',
              payload: {
                nodeId: master.sid,
                attrs: { ...(master.attributes ?? {}), themeId: id }
              }
            }
          ]
        : [])
    ]);
  }

  /** The deck's first master, which is the one a new theme binds to. */
  private _firstMaster(doc: DeckAccess): DeckNode | undefined {
    const root = doc.getNode(doc.rootId);
    for (const sid of (root?.content ?? []) as string[]) {
      const node = doc.getNode(sid);
      if (node?.stype !== 'resources') continue;
      for (const child of (node.content ?? []) as string[]) {
        const resource = doc.getNode(child);
        if (resource?.stype === 'slideMaster') return { ...resource, sid: child } as DeckNode;
      }
    }
    return undefined;
  }

  /**
   * Run a transaction that adds a resource, and leave the reader where they were.
   *
   * `addChild` says where the caret goes afterwards — into the node it just made
   * — which is right for inserting a paragraph and wrong for every command here:
   * adding a track is not a reason to take the selection off the shape the
   * reader is animating. Measured: choosing an effect turned a node selection on
   * a box into a caret inside the `motionStep`, and the properties panel went
   * back to showing the slide *while the reader was using it*.
   *
   * Word's comment command hit this exactly and fixed it the same way. It is
   * here rather than there because both of this product's motion commands need
   * it, and a third would too.
   */
  private async _commitKeepingSelection(
    editor: Editor,
    operations: unknown[]
  ): Promise<boolean> {
    const held = (editor as any).selection ? { ...(editor as any).selection } : undefined;
    const result = await transaction(editor, operations as never).commit();
    if (result.success && held) (editor as any).updateSelection?.(held);
    return result.success;
  }

  private async _addNote(editor: Editor, slideId?: string): Promise<boolean> {
    const doc = this._access(editor);
    const slide = this._slideAt(editor, slideId);
    if (!doc || !slide || noteFor(doc, slide)) return false;

    const resources = this._resourcesOf(doc);
    if (!resources) return false;

    const surface = doc.getNode(slide);
    const result = await transaction(editor, [
      {
        type: 'addChild',
        payload: {
          parentId: resources,
          child: {
            stype: 'surfaceNote',
            attributes: { id: slide },
            /**
             * A paragraph, and a run inside it.
             *
             * The caret filler gives an empty line its height and is drawn for
             * an empty `inline-text`; a paragraph with no run gets none, so a
             * new note was 0 pixels high — there and impossible to click into.
             */
            content: [
              {
                stype: 'paragraph',
                attributes: {},
                content: [{ stype: 'inline-text', text: '' }]
              }
            ]
          }
        }
      },
      {
        type: 'setAttrs',
        payload: { nodeId: slide, attrs: { ...(surface?.attributes ?? {}), noteId: slide } }
      }
    ] as never).commit();

    return result.success;
  }

  /** Where definitions live, which a note is one of. */
  private _resourcesOf(doc: DeckAccess): string | undefined {
    const root = doc.getNode(doc.rootId);
    const children = Array.isArray(root?.content) ? (root!.content as unknown[]) : [];
    for (const sid of children) {
      if (typeof sid !== 'string') continue;
      if (doc.getNode(sid)?.stype === 'resources') return sid;
    }
    return undefined;
  }

  /**
   * The boxes a payload names: one, or a selection.
   *
   * `nodeIds` beside `nodeId` rather than instead of it, for the same reason
   * `setMotionStep` took `stepIds`: every existing caller says `nodeId`, and a
   * document edit is not the place to find out that one of them was missed.
   */
  private _boxesNamed(payload: any, editor?: Editor): string[] {
    const many = Array.isArray(payload?.nodeIds)
      ? payload.nodeIds.filter((id: unknown): id is string => typeof id === 'string')
      : [];
    if (many.length > 0) return many;
    if (typeof payload?.nodeId === 'string') return [payload.nodeId];

    /**
     * And the selection, for the commands a *toolbar* runs.
     *
     * The panel knows which boxes it is about and says so; a ribbon button does
     * not, and asking it to rebuild what the selection already knows is the
     * duplication `arrange-commands` refused for the same reason ("the selection
     * is the argument"). Only when nothing was named, so a caller that means one
     * box still gets one box.
     */
    if (!editor) return [];
    return (selectedNodeIds((editor as any).selection) ?? []).filter(
      (sid: unknown): sid is string => typeof sid === 'string'
    );
  }

  /**
   * One attribute change, across every box a payload names, in **one**
   * transaction.
   *
   * One transaction because it is one edit: a reader who selects six shapes and
   * types a width has done one thing, and six undo entries to get back would be
   * the ruler's mistake again (see `PropertyNumber`).
   *
   * The attributes are computed **per node** rather than once, because what a node
   * accepts depends on what it declares — a rectangle takes a corner radius and an
   * ellipse has never heard of one. So a mixed selection writes the radius to the
   * rectangles and skips the ellipses, which is what a reader means and what the
   * schema already knows.
   */
  private async _setBoxAttrsAll(
    editor: Editor,
    nodeIds: string[],
    attrsFor: (nodeId: string) => Record<string, unknown>,
    options?: { evenIfLocked?: boolean }
  ): Promise<boolean> {
    const doc = this._access(editor);
    if (!doc) return false;

    const ops: Array<{ type: string; payload: Record<string, unknown> }> = [];
    for (const nodeId of nodeIds) {
      const allowed = options?.evenIfLocked
        ? isSceneType(doc.getNode(nodeId)?.stype)
        : this._canEditBox(editor, nodeId);
      if (!allowed) continue;

      const attrs = attrsFor(nodeId);
      if (Object.keys(attrs).length === 0) continue;

      // The clearing form is per node too: `null` means "take this away from
      // *this* box", and the box's other attributes are its own.
      const cleared = Object.keys(attrs).filter((key) => attrs[key] === null);
      if (cleared.length === 0) {
        ops.push({ type: 'setAttrs', payload: { nodeId, attrs } });
        continue;
      }

      const current = { ...(doc.getNode(nodeId)?.attributes ?? {}) };
      for (const [key, value] of Object.entries(attrs)) {
        if (value === null) delete current[key];
        else current[key] = value;
      }
      ops.push({ type: 'setAttrs', payload: { nodeId, attrs: current, replace: true } });
    }

    if (ops.length === 0) return false;
    const result = await transaction(editor, ops as never).commit();
    return result.success;
  }

  private async _setBoxAttrs(
    editor: Editor,
    nodeId: string | undefined,
    attrs: Record<string, unknown>,
    /**
     * `evenIfLocked` is for the one command that has to reach a locked box: the
     * one that unlocks it. Everything else goes through the guard, which is what
     * `locked` is for.
     */
    options?: { evenIfLocked?: boolean }
  ): Promise<boolean> {
    const allowed = options?.evenIfLocked
      ? !!nodeId && isSceneType(this._access(editor)?.getNode(nodeId)?.stype)
      : this._canEditBox(editor, nodeId);
    if (!allowed || Object.keys(attrs).length === 0) return false;

    const cleared = Object.keys(attrs).filter((key) => attrs[key] === null);

    let payload: Record<string, unknown>;
    if (cleared.length === 0) {
      payload = { nodeId, attrs };
    } else {
      const current = { ...(this._access(editor)!.getNode(nodeId!)?.attributes ?? {}) };
      for (const [key, value] of Object.entries(attrs)) {
        if (value === null) delete current[key];
        else current[key] = value;
      }
      payload = { nodeId, attrs: current, replace: true };
    }

    const result = await transaction(editor, [
      { type: 'setAttrs', payload }
    ] as never).commit();

    return result.success;
  }

  private async _setDeckSize(
    editor: Editor,
    payload?: { width?: number; height?: number }
  ): Promise<boolean> {
    const doc = this._access(editor);
    if (!doc) return false;

    const width = Number(payload?.width);
    const height = Number(payload?.height);
    if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
      return false;
    }

    const slides = deckSlides(doc);
    if (slides.length === 0) return false;

    // Only the slides that are not already that size, so resizing a deck that
    // is already 16:9 commits nothing.
    const steps = slides
      .filter((slide) => {
        const attrs = (doc.getNode(slide.sid) as any)?.attributes ?? {};
        return attrs.width !== width || attrs.height !== height;
      })
      .map((slide) => ({
        type: 'setAttrs',
        payload: { nodeId: slide.sid, attrs: { width, height } }
      }));

    if (steps.length === 0) return false;
    return (await transaction(editor, steps as never).commit()).success;
  }

  private async _setSlideLayout(
    editor: Editor,
    slideId?: string,
    layoutId?: string
  ): Promise<boolean> {
    const sid = this._slideAt(editor, slideId);
    const doc = this._access(editor);
    if (!sid || !doc) return false;

    const attributes = { ...((doc.getNode(sid) as any)?.attributes ?? {}) };
    const current = attributes.layoutId ?? null;
    const next = typeof layoutId === 'string' && layoutId.length > 0 ? layoutId : null;

    // Setting a slide to the layout it already follows is not an edit, and
    // committing one would put an entry in the history that undoes to itself.
    if (current === next) return false;

    /**
     * Clearing it means restating the rest.
     *
     * `setAttrs` merges and drops `undefined`, so "this slide follows no
     * layout" cannot be said by leaving the key out — the whole attribute set
     * has to be written with `replace`. Logged in `docs/BACKLOG.md` as a gap in
     * the operation vocabulary; this is the second command to work around it.
     */
    if (next === null) delete attributes.layoutId;
    else attributes.layoutId = next;

    return (
      await transaction(editor, [
        { type: 'setAttrs', payload: { nodeId: sid, attrs: attributes, replace: true } }
      ] as never).commit()
    ).success;
  }

  /**
   * The slide's whole list of guides, written as one attribute.
   *
   * Read back through `readGuides` before it is written, so a payload assembled
   * by a host cannot put a guide at `NaN` into the document — which would draw at
   * `NaN` pixels and snap every shape to nowhere. The same reading the renderer
   * does, so what is stored is what will be understood.
   */
  /**
   * One more guide, where the reader is looking.
   *
   * Reads the list, adds to it and writes the whole thing back through the same path a
   * drag uses — `withGuide` refuses a duplicate by answering the list unchanged, and this
   * reports that as "nothing happened" rather than writing an entry the reader would have
   * to undo to get back to where they already were.
   */
  private async _addGuide(editor: Editor, payload: any): Promise<boolean> {
    const doc = this._access(editor);
    const sid = this._slideAt(editor, payload?.slideId);
    if (!doc || !sid) return false;

    const axis = payload?.axis === 'y' ? 'y' : 'x';
    const slide = doc.getNode(sid) as any;
    const size = slideSize(slide?.attributes);

    /**
     * The boxes the guide is being lined up with: the selection, in the slide's own
     * coordinates.
     *
     * A box inside a frame or a group has its parent's coordinates, and a guide is the
     * *slide's* — so the same translation the arrange commands do (`toSurface`) is what
     * keeps a guide placed on a grouped shape from landing on the other side of the slide.
     */
    const chosen = selectedNodeIds((editor as any).selection)
      .map((one) => ({ sid: one, node: doc.getNode(one) as any }))
      .filter((entry) => entry.node && isSceneType(entry.node.stype))
      .map((entry) => toSurface(doc, entry.sid, boxOf(entry.node.attributes)));

    const at = typeof payload?.at === 'number' && Number.isFinite(payload.at)
      ? Math.round(payload.at)
      : guidePlace(axis, size, chosen);

    const was = readGuides(slide?.attributes);
    const next = withGuide(was, { axis, at });
    if (next.length === was.length) return false;

    return await this._setGuides(editor, next, payload?.slideId);
  }

  private async _setGuides(
    editor: Editor,
    guides: unknown,
    slideId?: string
  ): Promise<boolean> {
    const doc = this._access(editor);
    const sid = this._slideAt(editor, slideId);
    if (!doc || !sid || !Array.isArray(guides)) return false;

    const clean = readGuides({ guides });
    const result = await transaction(editor, [
      { type: 'setAttrs', payload: { nodeId: sid, attrs: { guides: clean } } }
    ] as never).commit();

    return result.success;
  }

  private async _toggleHidden(editor: Editor, slideId?: string): Promise<boolean> {
    const doc = this._access(editor);
    const sid = this._slideAt(editor, slideId);
    if (!doc || !sid) return false;

    const slide = doc.getNode(sid);
    const result = await transaction(editor, [
      {
        type: 'setAttrs',
        payload: { nodeId: sid, attrs: { hidden: slide?.attributes?.hidden !== true } }
      }
    ] as never).commit();

    return result.success;
  }
}

export function createSlideCommands(): SlidesExtension {
  return new SlidesExtension();
}
