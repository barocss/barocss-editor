import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Editor } from '@barocss/editor-core';
import { selectedNodeIds } from '@barocss/editor-core';
import type { EditorViewDOM } from '@barocss/editor-view-dom';
import { FileActions, type DeckFileActions } from './file-actions';
import { Filmstrip } from './filmstrip';
import { SelectionOverlay } from './overlay';
import { NotesPane } from './notes';
import { TimelinePane } from './timeline';
import {
  AppBody,
  AppChrome,
  MenuBar,
  AppMain,
  AppShell,
  Button,
  ZoomControl,
  type LengthUnit
} from '@barocss/office-ui';
import {
  advanceShow,
  accessOfTree,
  componentBehindSource,
  componentSourceOf,
  deckAdvance,
  componentsOf,
  deckSlides,
  isLibraryName,
  readDeckFile,
  slideById,
  deckDesigns,
  jumpsOn,
  jumpTarget,
  stageFit,
  type Jump,
  scrollToStop,
  scrollStops,
  scrollTopOf,
  scrollAt,
  scrollHeight,
  scrollStretches,
  axisSpan,
  clampZoom,
  easingCss,
  effectDefinition,
  framesFor,
  guideIsDropped,
  hiddenUntilPlayed,
  pressCount,
  readGuides,
  showing,
  slideSize,
  withGuide,
  namedBoxes,
  slideTimeline,
  cardSteps,
  drawnNames,
  stepMoment,
  triggersOn,
  stepsAtPress,
  transitionFrom,
  withTiming,
  transitionOf,
  type TimelineStep
} from '@barocss/office-slides';
import {
  SlideLayoutDialog,
  SlideSizeDialog,
  TemplateDialog,
  ThemeDialog
} from './deck-dialogs';
import { LayerPanel } from './layer-panel';
import { ComponentPanel } from './component-panel';
import { FindBar } from './find-bar';
import { AuditPanel } from './audit-panel';
import { Present } from './present';
import { Presenter } from './presenter';
import { PresenterWindow } from './presenter-window';
import { Properties } from './properties';
import { Ribbon } from './ribbon';
import { SLIDES_MENUS, slidesMenuEntry, slidesMenuId } from '@barocss/office-slides';

import { Stage } from './stage';
import { DeckMapView } from './deck-map-view';
import { LibraryDialog } from './library-dialog';
import { libraryDeck, libraryRows } from './library';
import { useDeck, useRevision } from './deck-model';
import { useEditorRevision } from './revision';

/**
 * The deck app.
 *
 * The same division as Word's: React owns the chrome and the DOM view owns the
 * document surface, mounted into an element React creates and then leaves
 * alone. What is different is how little chrome there is between them — no
 * ruler, because a slide has no margins to drag; no page furniture, because a
 * slide has no headers; no zoom-to-fit-width, because a slide fits both ways at
 * once or not at all.
 */
export function App({
  mount
}: {
  mount: (host: HTMLElement) => { editor: Editor; view: EditorViewDOM };
}) {
  const host = useRef<HTMLDivElement>(null);
  const mounted = useRef(false);
  const [instance, setInstance] = useState<{ editor: Editor; view: EditorViewDOM } | null>(null);

  useEffect(() => {
    if (!host.current || mounted.current) return;
    // Guarded because StrictMode runs effects twice on purpose. Not cleaned up
    // on unmount either: the editor owns this subtree for the life of the page,
    // and rebuilding it would throw away the caret and the history for a
    // re-render nobody asked for.
    mounted.current = true;
    setInstance(mount(host.current));
  }, [mount]);

  const editor = instance?.editor ?? null;
  const view = instance?.view ?? null;
  const slides = useDeck(editor);
  const revision = useRevision(editor);
  /**
   * And the **selection**, which is a different question: `revision` counts content changes,
   * and clicking a shape changes no content. `useEditorRevision` is the one that knows which of
   * the editor's events mean an answer could be different now (`watchAnswers`).
   */
  const answers = useEditorRevision(editor);

  /**
   * The surface being worked on: a slide, or a **definition** the reader has opened.
   *
   * The app's, not the document's. Two people editing one deck are not looking at the same
   * slide, and a document that recorded "the current slide" would be saying something about a
   * reader rather than about itself.
   *
   * One state and not two, and that was decided by a measurement: the insert commands
   * validate their `slideId`, so a second variable would mean every call site that forgot it
   * inserted onto slide 1 while the reader looked at a component — silently — and every call
   * site that remembered was refused (canvas-model §10c).
   */
  const [current, setCurrent] = useState<string | undefined>();

  /**
   * Where to go back to when a definition is closed.
   *
   * Remembered when one is opened rather than worked out on the way out: "the slide I was on"
   * is a fact about the moment the reader left it, and a deck they have since edited may not
   * have the slide that was showing.
   */
  const [wasOn, setWasOn] = useState<string | undefined>();
  const components = useMemo(() => {
    const store = editor?.dataStore;
    const rootId = editor?.getRootId?.();
    if (!store || !rootId) return [];
    return componentsOf({ rootId, getNode: (sid: string) => store.getNode(sid) } as never);
  }, [editor, revision]);

  /**
   * What the deck **inherits from**: its layouts and its master.
   *
   * Openable for the same reason a component's definition is, and the argument is the one
   * canvas-model §10c made when the first definition was opened: the same mechanism serves all
   * three, and building it for components alone would be building it twice. Until now a reader
   * could say which layout a slide *follows* and nothing could change what the layout was.
   */
  const designs = useMemo(() => {
    const store = editor?.dataStore;
    const rootId = editor?.getRootId?.();
    if (!store || !rootId) return [];
    return deckDesigns({ rootId, getNode: (sid: string) => store.getNode(sid) } as never);
  }, [editor, revision]);
  /**
   * Follow the deck: the first slide to start, and never somewhere the reader is no longer.
   *
   * Two measurements shaped this. It used to fall back whenever `current` was not one of the
   * deck's **slides**, which is the same sentence right up until a definition can be opened —
   * and then it bounced the reader back to slide 1 the instant they opened one. So it became
   * "does this node still exist", and that was wrong in the other direction: loading a new
   * document leaves the old nodes in the store, so the old `current` still *existed* and the
   * deck came up with its count reading `—`.
   *
   * The precise question is neither: is the reader on a page of **this** deck, or on one of
   * its definitions.
   */
  useEffect(() => {
    const here =
      !!current &&
      (slides.some((slide) => slide.sid === current) ||
        components.some((one) => one.sid === current) ||
        designs.some((one) => one.sid === current));
    if (here) return;
    if (slides.length === 0) return setCurrent(undefined);
    setCurrent(slides[0].sid);
  }, [slides, components, designs, current]);

  /** The component's definition being edited, if the reader has opened one. */
  const editingComponent = useMemo(
    () => components.find((one) => one.sid === current),
    [components, current]
  );

  /** Or the layout, or the master — the same question with three answers. */
  const editingDesign = useMemo(
    () => designs.find((one) => one.sid === current),
    [designs, current]
  );
  /**
   * And the selection goes with the surface.
   *
   * Measured: opening a definition with a box selected left the box selected — so the
   * properties panel went on showing a shape that is on a slide the reader is no longer
   * looking at, and the definition's own row (its size) never appeared because the panel
   * thought it was about a box. The overlay drew that box's handles over the card, too.
   *
   * A selection is "what I am working on", and a reader who has changed surfaces is not
   * working on it any more. The same reason the entered container is dropped when a reader
   * leaves it.
   */
  const leaveSelection = useCallback(() => {
    void editor?.executeCommand?.('setNode', { nodeIds: [] });
  }, [editor]);

  /**
   * Open a definition — a component's, a layout, a master.
   *
   * One function, because "where to go back to" has one rule: the slide the reader was on when
   * they left it, remembered at that moment rather than worked out on the way out (a deck they
   * have since edited may not have the slide that was showing). Opening a *second* definition
   * from inside the first must not overwrite it, which is what the guard says.
   */
  const openDefinition = useCallback(
    (sid: string) => {
      const inside = (one: { sid: string }) => one.sid === current;
      setWasOn((was) => (components.some(inside) || designs.some(inside) ? was : current));
      setCurrent(sid);
      leaveSelection();
    },
    [components, designs, current, leaveSelection]
  );
  const closeDefinition = useCallback(() => {
    setCurrent(wasOn ?? slides[0]?.sid);
    leaveSelection();
  }, [wasOn, slides, leaveSelection]);

  /**
   * The three things a reader does to a component from the panel.
   *
   * Wired here, and not in the panel, for the reason every other command in this app is: the
   * app is the only thing that knows **where the reader is** — a slide, or a definition they
   * have opened. A panel that passed no `slideId` would put every card on slide 1, which was
   * measured once already with the ribbon's insert buttons.
   */
  /**
   * Whether there is anything to make a component *of*.
   *
   * Watched with `useEditorRevision`, not the app's `revision`: that one counts
   * `editor:content.change`, and a **selection** is not a content change — so the button stayed
   * disabled however many boxes a reader clicked. The one line that knows which events mean
   * "an answer could be different now" is `watchAnswers`, and this is a reader of the
   * selection like the ribbon and the properties panel.
   */
  const canMakeComponent = useMemo(() => {
    const chosen = selectedNodeIds(editor?.selection);
    return chosen.length > 0;
  }, [editor, answers]);

  const makeComponent = useCallback(() => {
    void editor?.executeCommand?.('createComponent', {});
  }, [editor]);

  const placeComponent = useCallback(
    (componentId: string) => {
      void editor?.executeCommand?.('placeComponent', { componentId, slideId: current });
    },
    [editor, current]
  );

  /**
   * One slide, or the deck as a strip.
   *
   * One by default, because that is what a deck editor is — the strip is for
   * seeing the shape of a deck, which is a different question and a rarer one.
   */
  const [focused, setFocused] = useState(true);

  /**
   * Presenting.
   *
   * A mode of the shell rather than a different screen: the slide on show is
   * the one the editor was already drawing, and presenting from a second render
   * would mean two drawings of one deck that could disagree.
   */
  const [presenting, setPresenting] = useState(false);

  /**
   * Whether the reader is looking at the deck's **map** instead of a page.
   *
   * Instead of, not beside: what a map is for is the shape of the whole deck, and a picture of
   * twenty pages squeezed beside a slide is one nobody can read either way. The same decision
   * 전체 보기 made — the strip replaces the one page — one step further.
   */
  const [mapping, setMapping] = useState(false);

  /**
   * The name this deck is kept under in the library, when it came from there.
   *
   * The app's, because it is a fact about *this session* — which deck on screen is which row —
   * and not about the document: a deck that is emailed and opened elsewhere is the same deck and
   * is in nobody's library. Kept so that saving again overwrites the row rather than minting a
   * second name, which would leave every button pointing at the old copy.
   */
  const [libraryName, setLibraryName] = useState<string | undefined>();

  /**
   * How this deck is moved through: by pressing on, or by its **links only**.
   *
   * Read from the document, because it is the deck's own answer and has to survive being saved —
   * and read *here* because four things need it: the show (a press stops at the end of a page's
   * builds), the scroll show (refused — a scroll is a line), the presenter's next-page preview
   * (there is no next) and the map (no spine to draw).
   */
  const moveBy = useMemo(() => {
    const store = editor?.dataStore;
    const rootId = editor?.getRootId?.();
    if (!store || !rootId) return 'press' as const;
    return deckAdvance({ rootId, getNode: (sid: string) => store.getNode(sid) } as never);
  }, [editor, revision]);

  /**
   * The surface the stage draws **alone** — or nothing, when it draws the deck as a strip.
   *
   * One expression, because two readers of it are two chances to disagree: the stage hides
   * every other surface by this sid, and the *fit* is the size of this one. A definition is
   * always focused while it is open, whatever the 전체 보기 toggle says — it is not part of the
   * strip, so a reader who opened one in strip mode would be looking at a deck with nothing to
   * edit.
   */
  const stageFocus = editingComponent ? current : presenting || focused ? current : undefined;

  /**
   * The box the stage has to fit, and the length its rulers measure.
   *
   * `stageFit` is the model's answer — a slide's own size, a definition's own size, or the
   * widest slide for a strip — and it is asked here because this is what knows where the
   * reader is. Measured before it existed: the stage fitted the constant 16:9, so a 4:3 deck
   * drew at the scale for a wider one with 662px of ruler across a 497px slide, and a
   * definition drew at the slide's scale whatever its own size — a 5040×3960 card 128px wide
   * in a 486px pane.
   */
  const fit = useMemo(() => {
    const store = editor?.dataStore;
    const rootId = editor?.getRootId?.();
    if (!store || !rootId) return undefined;
    return stageFit({ rootId, getNode: (sid: string) => store.getNode(sid) } as never, stageFocus);
  }, [editor, stageFocus, revision]);
  /**
   * Whether the presenter's own half of the screen is showing.
   *
   * Kept across shows on purpose: a presenter who turns it on wants it on the
   * next time too, and it costs nothing when the deck is being edited.
   */
  const [presenterView, setPresenterView] = useState(false);
  /**
   * Whether the presenter's screen is in a **window of its own**.
   *
   * The shape a real showing has: the projector shows the slide, the laptop shows the next
   * slide and the notes. With one display the split screen is what a presenter needs; with
   * two, the split is exactly what they cannot use, because the audience would be reading
   * the notes.
   *
   * Kept across shows like `presenterView`, and *off* by default: opening a window is a
   * thing a reader asks for, and a browser blocks one that arrives unasked.
   */
  const [presenterWindow, setPresenterWindow] = useState(false);
  /**
   * Whether the show is **scrolled** rather than clicked, and how far the reader has scrolled.
   *
   * A presenter clicks; a reader sent a link scrolls. The offset is this app's state exactly
   * like `played` is — one number saying where the reader has got to — and everything else
   * follows from it through `scroll-show.ts`: which slide, which build, and how far into that
   * build the animation is held.
   */
  const [scrolling, setScrolling] = useState(false);
  const [scrolled, setScrolled] = useState(0);
  /**
   * When this showing began, for the clock.
   *
   * The one thing on the presenter's screen that is not in the document, so it
   * is the one thing the app has to remember — and it is remembered per *show*,
   * which is why it is stamped when presenting turns on rather than at mount.
   */
  const [showStarted, setShowStarted] = useState(() => Date.now());
  useEffect(() => {
    if (presenting) setShowStarted(Date.now());
  }, [presenting]);

  /**
   * Which dialog is open, if any.
   *
   * The app's, like every other piece of chrome state: a dialog is a fact about
   * one reader's screen, and the editor has no idea one exists.
   */
  const [dialog, setDialog] = useState<
    'size' | 'layout' | 'theme' | 'template' | 'library' | null
  >(null);

  /**
   * The three file acts, which live with the picker because the picker's input cannot move.
   *
   * A file cannot be handed to a browser by clicking a button, so the input has to be in the DOM
   * whether or not a button stands beside it. What moved is where a reader *asks* — 파일 — and an
   * imperative handle is exactly what that situation is for.
   */
  const files = useRef<DeckFileActions>(null);


  /**
   * How large the slide is drawn.
   *
   * `undefined` means "fit the pane", which is a different state from any
   * particular number: a fitted deck re-fits when the window changes, and a
   * deck at 150% stays at 150%. Collapsing the two would mean either losing the
   * reader's zoom on every resize or never fitting again after the first.
   */
  const [zoom, setZoom] = useState<number | undefined>(undefined);

  const here = useMemo(
    () => slides.find((slide) => slide.sid === current),
    [slides, current]
  );

  /**
   * How the slide on screen arrives, read from the deck.
   *
   * Time lives beside the document — the slide names a `motionTrack` and the
   * track holds the timing — so this is a read of the document rather than a
   * piece of state the app keeps. Recomputed when the deck changes, which is the
   * only thing that can change the answer.
   */
  /**
   * How far through the current slide's builds the presenter has clicked.
   *
   * The app's, like which slide is on screen: how far one reader has got is not
   * a fact about the deck. Reset whenever the slide changes or the show starts,
   * so a slide is never entered halfway through its own animation.
   */
  const [played, setPlayed] = useState(0);
  /**
   * Whether the press on screen was arrived at **backwards**.
   *
   * Which changes what the stage is asked to do, not what it draws: going back a
   * press shows the slide as it was *before* the last one, and re-running that
   * press's animations would replay a build the presenter has already seen — a
   * shape flying in again on the way back is not what Back means anywhere.
   *
   * So a settled press is handed the same animations, seeked to their end and
   * held. The machinery is the playhead's (`seekTo`), which is the other place
   * this product asks for a moment rather than a run.
   *
   * Kept beside `played` rather than derived from it: the direction is a fact
   * about the *gesture*, and a `useRef` compared during render would be a frame
   * behind whichever effect updated it.
   */
  const [settled, setSettled] = useState(false);
  /**
   * The slide a press was set for, when it is not the slide on screen yet.
   *
   * Because arriving at a slide otherwise means arriving at its beginning — the
   * rail, the filmstrip, PageDown — and that reset is what made stepping *back*
   * land on an empty slide: the presenter set the last press, the slide changed,
   * and the effect below immediately set it to zero. Measured in the show, and
   * invisible in either half on its own.
   */
  const pressFor = useRef<string | undefined>(undefined);
  const goToPress = useCallback((next: number, how?: { back?: boolean; slide?: string }) => {
    setSettled(how?.back === true);
    setPlayed(next);
    if (how?.slide) pressFor.current = how.slide;
  }, []);
  useEffect(() => {
    // A press deliberately set for *this* slide is not an arrival to reset.
    if (pressFor.current === current) {
      pressFor.current = undefined;
      return;
    }
    setPlayed(0);
    setSettled(false);
  }, [current, presenting]);

  /**
   * What is animated on this slide, resolved to elements.
   *
   * The document names shapes by a *name* they carry, because a sid cannot be
   * written into a saved file (see `motion.ts`). The stage draws elements by
   * sid. This is the one place that crosses between them, so nothing downstream
   * has to know both.
   */
  const built = useMemo(() => {
    const store = editor?.dataStore;
    const rootId = editor?.getRootId?.();
    if (!store || !rootId || !current) return { steps: [] as TimelineStep[], presses: 0 };

    const doc = { rootId, getNode: (sid: string) => store.getNode(sid) };
    /**
     * The slide's whole timeline, not its builds.
     *
     * A `play` step is a press like any other — the film starts when the reader
     * gets to it — and reading only the builds meant the presenter's key skipped
     * straight past a row the timeline pane was drawing. One list, one count.
     */
    /*
     * And what the slide's **cards** animate, which is not in the slide's own track: a card's motion
     * belongs to the card and plays in every placement of it, on arrival, costing no presses (§10l).
     * Concatenated here because this is already the one place that crosses from names to sids.
     */
    const steps = [...slideTimeline(doc as never, current), ...cardSteps(doc as never, current)];
    return { steps, presses: pressCount(steps) };
  }, [editor, current, revision]);

  /**
   * How many presses **any** slide holds, for a presenter stepping backwards into
   * one.
   *
   * The same read as `built`, of a different slide: a slide entered from behind
   * arrives finished, and only the document knows how many presses that is. Here
   * rather than in `Present` so there is one answer to the question, and a
   * function rather than a map because it is asked once per keypress.
   */
  const pressesOf = useCallback(
    (sid: string) => {
      const store = editor?.dataStore;
      const rootId = editor?.getRootId?.();
      if (!store || !rootId) return 0;
      const doc = { rootId, getNode: (id: string) => store.getNode(id) };
      return pressCount(slideTimeline(doc as never, sid));
    },
    [editor, revision]
  );

  /**
   * Moving the show by one press, from **whichever window** the key arrived in.
   *
   * The rule is `advanceShow` in the model — forward plays the next build before it leaves
   * the slide, back un-plays one at a time, and a slide entered backwards arrives finished.
   * The *wiring* is here because the app is the one thing both windows can reach: the
   * audience screen is in this one and the presenter's screen may be in another, and a
   * press in either has to mean the same thing.
   */
  const advance = useCallback(
    (step: number) => {
      const shown = slides.filter((slide) => !slide.hidden);
      const at = shown.findIndex((slide) => slide.sid === current);
      const next = advanceShow(step, {
        shown,
        at,
        played,
        builds: built.presses,
        /*
         * A links-only deck stops at the end of a page's builds: the deck moves when a reader
         * presses a **button**, and landing on the next page by accident is the thing the mode
         * exists to make impossible.
         */
        linksOnly: moveBy === 'links',
        pressesOf
      });
      if (!next) return;
      goToPress(next.played, { back: next.back, slide: next.slide });
      if (next.slide) setCurrent(next.slide);
    },
    [slides, current, played, built.presses, pressesOf, goToPress]
  );

  /**
   * Where every slide sits in one long scroll, and where the reader is in it.
   *
   * The height of the view is the unit: a slide gets one view of reading room plus a share
   * of scrolling per build (`scrollStretches`). Recomputed when the deck changes, because a
   * slide added in the middle moves every stretch after it.
   */
  /**
   * The view's own height, which is the unit the layout is measured in.
   *
   * The window's, not the stage's: a scrolling show is full-screen, so the room a slide has
   * to be read in *is* the window. Re-read on resize, because a reader turning a tablet
   * changes how much scrolling a build is worth.
   */
  const [scrollView, setScrollView] = useState(() =>
    typeof window === 'undefined' ? 720 : window.innerHeight
  );
  useEffect(() => {
    const measure = () => setScrollView(window.innerHeight);
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, []);
  const stretches = useMemo(
    () =>
      scrollStretches(
        slides.filter((slide) => !slide.hidden).map((slide) => ({
          sid: slide.sid,
          presses: pressesOf(slide.sid)
        })),
        scrollView
      ),
    /**
     * The **document** is a dependency, not just the function that reads it.
     *
     * Measured: with only `pressesOf` named, a build added to a slide did not change the
     * layout — the stretches were computed once with every slide at zero presses and kept.
     * How many builds a slide has is the document's answer, so the thing that changes when
     * the document changes has to be in the list.
     */
    [slides, pressesOf, scrollView, revision]
  );
  const scrollSpan = scrollHeight(stretches);
  /**
   * Where a key press lands: the next **stop**, not an amount.
   *
   * Measured: moving the offset by one build's worth meant a press on a slide with no builds
   * changed nothing on screen, because the reading room is bigger than a build's share. A key
   * that appears to do nothing is the worst control there is — so a press goes to the next
   * picture the deck has (`scrollStops`).
   */
  const stops = useMemo(() => scrollStops(stretches, scrollView), [stretches, scrollView]);

  const scrollBy = useCallback(
    (delta: number) => {
      setScrolled((was) => Math.max(0, Math.min(scrollSpan, was + delta)));
    },
    [scrollSpan]
  );

  /** A key: to the next stop rather than by an amount. See `stops`. */
  const scrollToNext = useCallback(
    (step: number) => setScrolled((was) => scrollToStop(was, step, stops)),
    [stops]
  );

  /**
   * The slide, the build and the moment the scroll has reached.
   *
   * The moment is in **milliseconds**, and that conversion is here rather than in the model
   * because how long a press takes is the *document's* answer: `axisSpan` reads the slide's
   * own timeline. The model says how far *into* the press the reader is, as a fraction.
   */
  const scrollShows = useMemo(() => {
    if (!scrolling) return undefined;
    const at = scrollAt(scrolled, stretches, scrollView);
    if (!at) return undefined;

    const store = editor?.dataStore;
    const rootId = editor?.getRootId?.();
    if (!store || !rootId || at.press <= 0) return { ...at, moment: 0 };

    const doc = { rootId, getNode: (id: string) => store.getNode(id) };
    const span = axisSpan(withTiming(slideTimeline(doc as never, at.sid)), at.press);
    return { ...at, moment: Math.round(span * at.fraction) };
  }, [scrolling, scrolled, stretches, scrollView, editor, revision]);

  /**
   * The scroll moves the show, which means it moves the *slide*.
   *
   * An effect rather than part of the scroll handler, because the answer is a function of the
   * offset and the deck — so a slide added, or a build added, changes which slide an offset
   * means, and the show has to follow that too.
   */
  useEffect(() => {
    if (!scrollShows || scrollShows.sid === current) return;
    setCurrent(scrollShows.sid);
  }, [scrollShows, current]);

  /**
   * Playing the slide's animation in the editor, which is what makes a timeline
   * usable at all.
   *
   * A counter rather than a flag: pressing 미리 보기 again while it is running
   * has to *restart* it, and a boolean that is already true says nothing. Each
   * press is a new run, and the run walks the groups on their own timing.
   */
  const [preview, setPreview] = useState(0);
  const [previewAt, setPreviewAt] = useState(0);
  /**
   * Where a resumed preview picks up: a press, and how far into it.
   *
   * The transport's whole model is that **pausing becomes a scrub** — the stage
   * reports the moment it stopped at, the playhead moves there, and the preview
   * ends. Which means the state a paused deck is in is a state the pane could
   * already draw, frame-stepping is *already* scrubbing, and the only new thing
   * is starting a preview somewhere other than the beginning.
   */
  const [resume, setResume] = useState<{ press: number; at: number } | undefined>();
  /** Asked of the stage: freeze what is running and say where it stopped. */
  const [pausing, setPausing] = useState(false);
  /**
   * The clock: what moment the press being played is at, asked of the stage.
   *
   * A ref that the stage fills in and the pane reads, rather than state, because
   * the answer changes every frame and this app's state is what *builds* the
   * animations — a playhead that updated `playhead` sixty times a second would
   * rebuild and restart the very animation it was timing. So the number never
   * enters React at all while it is running: the pane draws it.
   */
  const stageClock = useRef<() => number>(undefined);

  /**
   * Which triggers have been clicked, and how many times.
   *
   * A count rather than a flag, because clicking a trigger twice runs it twice —
   * that is what a trigger *is*, and a flag would make the second press do
   * nothing. Keyed by the watched shape's name, which is what a step holds.
   *
   * Cleared with the slide, like everything else about where a reader is.
   */
  const [fired, setFired] = useState<Record<string, number>>({});
  useEffect(() => setFired({}), [current]);
  /**
   * Which press the timeline is looking at, and where the playhead is in it.
   *
   * A slide's clock stops at every click, so "the moment" is only meaningful
   * within one press — the pane's tabs choose which, and this is the app's
   * because it is a fact about a reader rather than about the deck.
   */
  const [pressShown, setPressShown] = useState(1);
  const [playhead, setPlayhead] = useState(0);
  /**
   * Which step the timeline has selected, held here rather than in the pane.
   *
   * Because two things draw it: the pane's editor row, and — for a path — the
   * *overlay*, which draws the path on the shape so a reader can drag its points.
   * The same reason `paintEdit` is here: a gesture that spans the panel and the
   * canvas has to be one piece of state, or the two halves disagree about what is
   * being edited.
   */
  /**
   * A guide being pulled out of a ruler, before it exists.
   *
   * The app's, because the gesture starts in one child and is *drawn* in another:
   * the ruler is in the stage and the layer over the slide is the overlay. Neither
   * can see the other, and the alternative — the ruler drawing its own preview —
   * cannot work, because a ruler is a strip along one edge and the line has to
   * cross the slide.
   *
   * Nothing is written to the document until it is let go. See `guides.ts` for
   * what happens then.
   */
  const [draftGuide, setDraftGuide] = useState<{ axis: 'x' | 'y'; at: number } | undefined>();
  const placeGuide = useCallback(
    (guide: { axis: 'x' | 'y'; at: number }) => {
      if (!editor || !current) return;
      const doc = editor.dataStore;
      const placed = readGuides(doc?.getNode(current)?.attributes);
      // Dropped outside the slide is a guide the reader pulled out and changed
      // their mind about — the same gesture that deletes one already on it.
      const next = guideIsDropped(guide, slideSize(doc?.getNode(current)?.attributes))
        ? placed
        : withGuide(placed, guide);
      if (next === placed) return;
      void editor?.executeCommand('setSlideGuides', { guides: next, slideId: current });
    },
    [editor, current]
  );

  /**
   * Whether the layer list is showing.
   *
   * Closed by default and remembered while the app is open, like the timeline's
   * fold: a reader who wants it wants it for a session, and a panel that opens
   * itself takes room from the slide every time the app starts.
   */
  const [layersOpen, setLayersOpen] = useState(false);
  /**
   * Whether the components list is showing.
   *
   * Closed by default and remembered for the session, like the layer list: a deck with no
   * components has nothing to say here, and a panel that opens itself takes room from the
   * slide every time the app starts.
   */
  const [componentsOpen, setComponentsOpen] = useState(false);

  /**
   * Which of this deck's **imported** definitions are behind the deck they came from.
   *
   * The comparison is pure — a recorded signature against the source's current one — and the
   * reading is not: it means opening another deck out of the library. So the reading happens here,
   * once, when the reader opens the panel that shows it, and the panel is handed the answer.
   *
   * Not on every document change: a keystroke is not a reason to open three files, and a brand kit
   * does not change while somebody is typing in *this* deck.
   */
  const [behindSource, setBehindSource] = useState<Set<string>>(new Set());

  /**
   * The names in the reader's library, for the panel that offers them.
   *
   * Read once and after the library dialog has been used, because that is the only thing in this
   * app that changes them — and a list of names is cheap enough to keep while a deck is edited.
   */
  const [libraryDecks, setLibraryDecks] = useState<string[]>([]);
  useEffect(() => {
    void libraryRows()
      .then((rows) => setLibraryDecks(rows.map((row) => row.name)))
      .catch(() => setLibraryDecks([]));
  }, [dialog]);

  useEffect(() => {
    if (!componentsOpen || components.length === 0) return;
    let dropped = false;

    void (async () => {
      const store = editor?.dataStore;
      const rootId = editor?.getRootId?.();
      if (!store || !rootId) return;
      const doc = { rootId, getNode: (sid: string) => store.getNode(sid) };

      /** One read per deck, however many definitions came from it. */
      const decks = new Set<string>();
      for (const one of components) {
        const from = componentSourceOf(doc as never, one);
        if (from) decks.add(from.deck);
      }
      if (decks.size === 0) return setBehindSource(new Set());

      const found = new Set<string>();
      for (const deck of decks) {
        // eslint-disable-next-line no-await-in-loop
        const text = isLibraryName(deck) ? await libraryDeck(deck) : undefined;
        if (!text) continue;
        const read = readDeckFile(text);
        if ('error' in read) continue;
        const source = accessOfTree(read.document as never);
        for (const one of components) {
          if (componentBehindSource(doc as never, one, source)) found.add(one.sid);
        }
      }
      if (!dropped) setBehindSource(found);
    })();

    return () => {
      dropped = true;
    };
    // On opening, and when the deck's own definitions change — a definition just re-imported is no
    // longer behind, and the badge has to stop saying so.
  }, [componentsOpen, components, editor]);

  /**
   * Whether the find bar is showing.
   *
   * Opened by Ctrl/Cmd+F, which is what every reader already presses — and by
   * nothing else, so it is not a button taking room in the top bar for something
   * used once a session.
   */
  const [finding, setFinding] = useState(false);

  /**
   * Whether the deck's own check is showing.
   *
   * Opened from the top bar, beside 발표 — the two things a reader does *before*
   * giving a deck to somebody, in the order they do them.
   */
  const [auditing, setAuditing] = useState(false);

  /**
   * The menubar, drawn from `SLIDES_MENUS` and greyed against the deck.
   *
   * An entry a reader can press that then does nothing is worse than one that is not there, and
   * every command in the model already answers `canExecute`. A `view` entry has no command to ask,
   * so it is never disabled: whether the audit pane is up is always a question a reader may answer.
   */
  const menus = useMemo(
    () =>
      SLIDES_MENUS.map((menu) => ({
        id: menu.id,
        label: menu.label,
        blocks: menu.blocks.map((block) => ({
          id: block.id,
          items: block.items.map((item, index) => ({
            id: slidesMenuId(menu, block, index),
            label: item.label,
            hint: item.hint,
            /*
             * Why a greyed entry is greyed. A disabled control that says nothing is the commonest
             * small cruelty in a tool: the reader can see the thing they want and has no way to
             * learn what would make it available.
             */
            title:
              item.view === 'scroll' && moveBy === 'links'
                ? '버튼으로만 이동하는 덱은 스크롤로 볼 수 없습니다 — 스크롤은 한 줄이기 때문입니다'
                : undefined,
            checked:
              item.view === 'audit'
                ? auditing
                : item.view === 'map'
                  ? mapping
                  : item.view === 'focus'
                    ? focused
                    : undefined,
            disabled: item.view === 'scroll' ? moveBy === 'links' : item.command
              ? !editor?.canExecuteCommand?.(
                  item.command,
                  // `needs: 'slide'` is the model asking for the slide on screen, which only the app
                  // knows — the document has no notion of one being current. Without it
                  // 슬라이드 복제 answers `canExecute` against nothing and is greyed forever.
                  (item.needs === 'slide' ? { ...item.payload, slideId: current } : item.payload) as never
                )
              : false
          }))
        }))
      })),
    [editor, answers, current, moveBy, auditing, mapping, focused]
  );

  /**
   * What a pick does — a command, or a change to how the reader is looking.
   *
   * The `view` branch is the one `switch` the model promises, and it is most of this menubar: opening
   * a dialog, showing a pane, starting a presentation. None of those is a fact about the deck, which
   * is why none of them is a command.
   */
  const onMenu = useCallback(
    (id: string) => {
      const entry = slidesMenuEntry(id);
      if (!entry) return;

      switch (entry.view) {
        case 'file.new':
          return files.current?.create();
        case 'file.open':
          return files.current?.open();
        case 'file.save':
          return files.current?.save();
        case 'library':
          return setDialog((was) => (was === 'library' ? null : 'library'));
        case 'template':
          return setDialog('template');
        case 'dialog.size':
          return setDialog('size');
        case 'dialog.layout':
          return setDialog('layout');
        case 'dialog.theme':
          return setDialog('theme');
        case 'audit':
          return setAuditing((was) => !was);
        case 'map':
          return setMapping((was) => !was);
        case 'focus':
          return setFocused((on) => !on);
        case 'present':
          return setPresenting(true);
        case 'scroll':
          /*
           * The whole act, which was the button's: where the reader already is, then the show.
           * A scroll show that started at the top would lose the slide they were looking at.
           */
          if (moveBy === 'links') return;
          setScrolled(scrollTopOf(current, stretches));
          setScrolling(true);
          return setPresenting(true);
        default:
          break;
      }

      if (entry.command) {
        void editor?.executeCommand(
          entry.command,
          (entry.needs === 'slide' ? { ...entry.payload, slideId: current } : entry.payload) as never
        );
      }
    },
    [editor, current, moveBy, stretches]
  );
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== 'f') return;
      event.preventDefault();
      setFinding(true);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const [stepEdit, setStepEdit] = useState<string[]>([]);
  /**
   * Whether the reader is placing a path's points by clicking the slide.
   *
   * The control is in the timeline (where the path's step is) and the gesture is
   * on the canvas (where a route can be drawn), so — like `paintEdit` and
   * `stepEdit` — it is one piece of state up here rather than two that disagree.
   */
  const [pathDrawing, setPathDrawing] = useState(false);
  /**
   * How much of the window the timeline gets, and whether it is open.
   *
   * The app's, like the zoom: how a reader has arranged their window is not a
   * fact about the deck. A third of a laptop screen when it is open, which is
   * enough for four tracks — a reader animating eight drags it taller.
   *
   * ## Open because there is something in it, not because it exists
   *
   * It used to open always, and measured on a 1440×900 screen that is **240
   * pixels — 27% of the window — given to the sentence "이 슬라이드에는
   * 애니메이션이 없습니다"**, which is why a slide drew at 57% instead of about
   * 75%. An empty instrument taking a quarter of the window is the difference
   * between a tool and a demo of a tool.
   *
   * So the default follows the slide: folded with nothing to draw, open the
   * moment the slide has a step — which is also the moment a reader wants it,
   * because the gesture that made the step was about time.
   *
   * `undefined` is "nobody has said", and a reader's own fold **wins** from then
   * on: a pane that reopened itself after being folded would be arguing with the
   * person using it.
   */
  /**
   * Which unit the reader is looking at — the app's, like the zoom.
   *
   * It was the properties panel's own state, which was right until a *second*
   * thing had to say a length: the readout the overlay draws while a shape is
   * dragged. Two components choosing their own unit is a panel saying 2.5cm about
   * the box a badge calls 25mm, which is the same fault as the zoom box that
   * disagreed with the screen.
   */
  const [unit, setUnit] = useState<LengthUnit>('cm');

  const [timelineHeight, setTimelineHeight] = useState(240);
  const [timelineChoice, setTimelineChoice] = useState<boolean | undefined>(undefined);

  /**
   * Which of the selected shape's paints is open in the panel.
   *
   * The app's, because two components need it and neither owns the other: the
   * panel knows a reader has opened a fill's editor, and the *overlay* is what
   * draws that fill's axis on the shape. The alternative — the overlay reading
   * the panel's DOM, or the panel drawing on the canvas — is two components
   * reaching into each other to share one fact.
   *
   * The same shape as `inside` and `editing`: where a reader is, which is never
   * a fact about the deck.
   */
  const [paintEdit, setPaintEdit] = useState<number | null>(null);
  useEffect(() => setPaintEdit(null), [current]);
  /**
   * Which of that fill's colour stops is being edited — the app's, for the same
   * reason the fill is.
   *
   * A gradient has **one** selected stop and two places that show it: the dot on
   * the shape and the colour picker in the panel. They were two pieces of state
   * for a day, and it was exactly the fault this repository keeps finding — a
   * reader clicked a dot on the canvas and the picker went on editing a different
   * stop, which is one question with two answers.
   *
   * Reset with the fill, because a stop only means anything inside one.
   */
  const [stopEdit, setStopEdit] = useState(0);
  useEffect(() => setStopEdit(0), [paintEdit, current]);
  useEffect(() => {
    setPressShown(1);
    setPlayhead(0);
  }, [current]);

  useEffect(() => {
    if (preview === 0 || presenting) return;

    const groups = built.presses;
    if (groups === 0) return;

    /**
     * Where this run starts: the beginning, or where a pause left off.
     *
     * A resumed preview begins at the press it was paused in, and its first
     * advance comes sooner by however far into that press the reader was — so the
     * rest of the slide keeps the pace it would have had.
     */
    const from = resume && resume.press < groups ? resume.press : 0;
    setPreviewAt(from);
    let step = from;
    const timers: number[] = [];

    /**
     * One timer per press, at the pace the steps themselves declare.
     *
     * The slide's own presses become time here — a preview cannot wait for a
     * click, because the reader is looking at the list rather than at the slide
     * — so each group is given its longest step plus a beat to be read in.
     */
    const advance = () => {
      step += 1;
      setPreviewAt(step);
      /**
       * The pane follows what is playing.
       *
       * Because the playhead runs along *this* press's axis while it plays, and a
       * playhead running along the axis of a press the reader had chosen to look
       * at instead would be a clock timing something else. Set in the same update
       * as `previewAt`, so the two are one render and the animations are built
       * once rather than twice.
       */
      setPressShown(Math.max(1, step));

      /**
       * How long this press takes, which the *last* one used not to be given.
       *
       * The end was a flat 600ms after the final press began, so a two-second
       * build was previewed for eight hundred milliseconds and then snapped back
       * — the preview cut off the animation it existed to show. Found by building
       * the transport: pausing eight hundred milliseconds in worked, and pausing
       * a second in restarted the preview, because there was no longer one
       * running.
       */
      const longest = Math.max(
        400,
        ...stepsAtPress(withTiming(built.steps), step).map((entry) => entry.endAt)
      );

      if (step >= groups) {
        // A beat after the last thing finishes, so the reader sees it land.
        timers.push(window.setTimeout(() => setPreview(0), longest + 600));
        return;
      }
      timers.push(window.setTimeout(advance, longest + 250));
    };

    if (from === 0) {
      timers.push(window.setTimeout(advance, 200));
    } else {
      // Resuming: the press is already on screen, so what is timed is the rest
      // of it.
      const longest = Math.max(
        400,
        ...stepsAtPress(withTiming(built.steps), from).map((entry) => entry.endAt)
      );
      timers.push(window.setTimeout(advance, Math.max(120, longest - (resume?.at ?? 0) + 250)));
    }

    return () => {
      for (const timer of timers) window.clearTimeout(timer);
      setPreviewAt(0);
    };
  }, [preview, presenting, built]);

  /**
   * The transport: play, pause, back to the start, and a frame at a time.
   *
   * A timeline that can only play from the beginning is a video player with no
   * scrubber, and one that cannot be stopped is one a reader cannot look at.
   */
  const playing = preview > 0;
  /**
   * How far a frame-step may go: the axis the pane is drawing.
   *
   * The same number the pane computes, from the same function — a playhead that
   * could be stepped past the end of the axis would be a moment the timeline
   * cannot draw.
   */
  const timelineSpan = axisSpan(withTiming(built.steps), pressShown);
  const startPreview = (fromMoment?: { press: number; at: number }) => {
    setResume(fromMoment);
    setPreview((n) => n + 1);
  };
  const stopPreview = (moment?: number) => {
    // Pausing *is* scrubbing: the moment becomes the playhead and the preview
    // ends, which is a state the pane already knows how to draw.
    if (typeof moment === 'number') {
      setPressShown(Math.max(1, previewAt));
      setPlayhead(Math.max(0, Math.round(moment)));
    }
    setPausing(false);
    setResume(undefined);
    setPreview(0);
  };

  const stagedBuilds = useMemo(() => {
    /**
     * The show, or a preview in the editor — the same arithmetic either way.
     *
     * A preview that drew the builds differently from the show would be a
     * preview of something else, which is the one thing it must not be.
     */
    /**
     * The show, a preview, or a playhead being dragged.
     *
     * All three draw through this one calculation. A preview that drew the
     * builds differently from the show would be a preview of something else —
     * and a playhead that showed a *fourth* thing would be worse: a reader
     * arranging an animation would be looking at a picture nothing else agrees
     * with.
     */
    /**
     * Which press, and what to do with it — one question, asked once.
     *
     * These were three variables meaning "which press" and a mode test choosing
     * between them, and then the same mode test again for what is hidden, again
     * for where to hold, and again for whether sound plays. `showing` is that
     * question in `office-slides`, with the two rules that are easy to get wrong
     * (scrubbing counts one press fewer; going back holds rather than replays)
     * written down and tested in milliseconds.
     */
    const shows = showing({
      presenting,
      played,
      settled,
      run: preview,
      playing: previewAt,
      shown: pressShown,
      moment: playhead,
      // The fifth way: the scroll is the clock. Asked first inside `showing`, because a
      // scrolling show *is* presenting — what differs is where its position comes from.
      ...(scrollShows && scrollShows.press > 0
        ? { scroll: { press: scrollShows.press, moment: scrollShows.moment } }
        : {})
    });
    if (!shows) return undefined;
    const at = shows.press;

    const timed = withTiming(built.steps);
    const hiddenNames = hiddenUntilPlayed(built.steps, shows.playedThrough);
    const hidden = timed
      .filter((step) => hiddenNames.has(step.target))
      .map((step) => step.targetSid)
      .filter((sid): sid is string => !!sid);

    /**
     * What this press runs, as animations rather than as styles.
     *
     * Each step becomes a keyframe list, a delay, a duration and a curve — the
     * Web Animations API's own vocabulary — so the stage starts them and does
     * not have to know what any of them mean. It is also what makes the delay
     * real: a transition released two frames later could not express "half a
     * second after the one before".
     */
    const started = stepsAtPress(timed, at);

    const playing = started
      .filter((step) => (step.kind === 'build' || step.kind === 'path') && !!step.targetSid)
      .map((step) => ({
        sid: step.targetSid as string,
        /**
         * A path animates one property and needs a style written first.
         *
         * `offsetDistance` 0 → 100% is the whole animation; `offset-path` and
         * `offset-rotate` are a *prerequisite*, which is why a path is a kind of
         * step rather than an entry in the effect table. The stage writes them,
         * because only it has the element and its size — and the path's CSS
         * depends on the shape's size (the element's centre is what lands on the
         * path, so the path is shifted by half the shape).
         */
        frames:
          step.kind === 'path'
            ? ([{ offsetDistance: '0%' }, { offsetDistance: '100%' }] as Array<
                Record<string, unknown>
              >)
            : (framesFor(step.effect, {
                direction: step.direction as never,
                amount: step.amount,
                color: step.color,
                partAt: step.partAt
              }) as Array<Record<string, unknown>>),
        /**
         * An SVG filter, for the looks CSS has no function for.
         *
         * The markup and the frames come from the effect table; making the filter,
         * pointing the shape at it and taking it away again is the stage's, for
         * the same reason the per-letter spans are: only it has the element.
         */
        svg: (() => {
          const svg = effectDefinition(step.effect)?.svg;
          if (!svg) return undefined;
          const options = { amount: step.amount, color: step.color };
          /**
           * The timing goes *into the markup* for a filter that animates itself.
           *
           * SMIL's `<animate>` carries its own `begin`, `dur` and `repeatCount`,
           * and the step's numbers are the only place those come from. A filter
           * with `frames` is the other kind — animated by the Web Animations API
           * like everything else — and ignores this.
           */
          const timing = {
            duration: step.duration,
            delay: step.startAt,
            repeat: step.repeat
          };
          return {
            markup: svg.markup(options, timing),
            frames: svg.frames ? (svg.frames(options) as never) : undefined
          };
        })(),
        path: step.path,
        facing: step.facing,
        smooth: step.smooth,
        echo: step.echo,
        /**
         * Where in this animation the playhead is, when one is being dragged.
         *
         * The stage seeks the animation to it and holds it there rather than
         * playing — which is the whole of what a scrubber is, and the reason the
         * steps are Web Animations rather than CSS transitions: a transition has
         * no moment you can ask for.
         */
        /**
         * A moment rather than a run: a playhead being dragged, or a press the
         * presenter arrived at **backwards**.
         *
         * The second is `settled` — see where it is declared. Its moment is the
         * step's own end, so the press is drawn finished and nothing replays; the
         * same `seekTo` the scrubber uses, which is why going back needed no new
         * machinery in the stage at all.
         */
        seekTo:
          shows.hold.kind === 'moment'
            ? shows.hold.at
            : shows.hold.kind === 'end'
              ? step.endAt
              : undefined,
        /**
         * Where a resumed preview starts this animation, rather than holding it.
         *
         * `seekTo` is a *moment* — paused, so a reader can look at it — and this
         * is the same number meaning "start here and run". One press only: the
         * ones after it begin at their own beginning.
         */
        playFrom: resume && previewAt === resume.press ? resume.at : undefined,
        /**
         * What the effect applies to, and how far apart the pieces are.
         *
         * Passed through rather than acted on here: *how many* pieces there are
         * is a fact about the document (the timeline reads it, so a bar is the
         * right width), and *which* pieces they are is a fact about what the
         * renderer drew. Only the stage has the second, so only the stage can
         * split — see `stage.tsx`.
         */
        unit: step.unit,
        stagger: step.stagger,
        timing: {
          duration: step.duration,
          delay: step.startAt,
          easing: easingCss(step.easing),
          /**
           * How many passes, where `0` in the document means "until the slide
           * moves on" — which the Web Animations API spells `Infinity`.
           *
           * The attribute was declared with the easing and read by *nothing* for
           * a day: exactly the fault this repository keeps finding in its own
           * schema, made fresh. One field on the timing object is the whole of
           * what it needed.
           */
          iterations: step.repeat === 0 ? Infinity : Math.max(1, step.repeat),
          /**
           * Whether this one adds to what is already on the shape.
           *
           * The whole of what makes two motions at once possible: two animations
           * of one property are `replace` by default and the newest wins, so a
           * fly and a nudge together produced only the nudge. Which steps add is
           * the *timeline's* answer (it knows what overlaps what) — this only
           * passes it on.
           */
          composite: step.composite,
          /**
           * `both`, which is what an entrance needs and an exit needs *more*.
           *
           * Backwards: the first frame applies during the delay, so a shape with
           * a half-second delay is not visible for that half second and then
           * suddenly transparent. Forwards: an exit stays gone afterwards rather
           * than snapping back the moment the animation ends.
           */
          fill: 'both' as const
        }
      }));

    /**
     * The films this press starts, which the stage plays rather than animates.
     *
     * With the part of each that plays — the step carries its target's trim, so
     * the stage is told where to start and where to stop rather than having to
     * read the document for it. `end: 0` is the file's own end; see
     * `media-trim.ts`.
     */
    const plays = (shows.plays ? started : [])
      .filter((step) => step.kind === 'play' && !!step.targetSid)
      .map((step) => ({
        sid: step.targetSid as string,
        from: step.trim?.start ?? 0,
        to: step.trim?.end ?? 0
      }));

    return { hidden, playing, plays };
    /**
     * `scrollShows` is in the list, and leaving it out was measured.
     *
     * The offset moved, the model answered a new moment — and the animations kept the
     * `seekTo` they were built with, because this is where they are built. A memo that reads
     * a value has to name it, and the scroll is the one input here that changes on every
     * notch of a wheel.
     */
  }, [
    presenting,
    settled,
    built,
    played,
    preview,
    previewAt,
    playhead,
    pressShown,
    resume,
    scrollShows
  ]);

  /**
   * What a click on a shape has started, as animations — separate from the press.
   *
   * Its own payload rather than part of `builds` for one reason that matters: the
   * stage rebuilds *everything* in `builds` whenever that object changes, so
   * firing a trigger would restart the animations the press had already run. A
   * trigger is a thing that happens *beside* the sequence, and it is delivered
   * beside it too.
   *
   * Each firing carries an id — the step and the count — so the stage can start
   * the new ones and leave the ones it has already started alone.
   */
  const triggered = useMemo(() => {
    if (!presenting && preview === 0) return [];

    const timed = withTiming(built.steps);
    const out: Array<Record<string, unknown>> = [];

    for (const step of timed) {
      const count = step.on ? fired[step.on] : undefined;
      if (!step.on || !count || !step.targetSid) continue;

      out.push({
        id: `${step.sid}#${count}`,
        sid: step.targetSid,
        frames: framesFor(step.effect, {
          direction: step.direction as never,
          amount: step.amount,
          color: step.color,
          partAt: step.partAt
        }) as Array<Record<string, unknown>>,
        svg: (() => {
          const svg = effectDefinition(step.effect)?.svg;
          if (!svg) return undefined;
          const options = { amount: step.amount, color: step.color };
          const timing = { duration: step.duration, delay: step.delay, repeat: step.repeat };
          return {
            markup: svg.markup(options, timing),
            frames: svg.frames ? (svg.frames(options) as never) : undefined
          };
        })(),
        unit: step.unit,
        stagger: step.stagger,
        echo: step.echo,
        path: step.path,
        facing: step.facing,
        smooth: step.smooth,
        timing: {
          duration: step.duration,
          // Its own delay, not a place in the press: a trigger starts when it is
          // clicked.
          delay: step.delay,
          easing: easingCss(step.easing),
          iterations: step.repeat === 0 ? Infinity : Math.max(1, step.repeat),
          fill: 'both' as const,
          composite: 'replace' as const
        }
      });
    }
    return out;
  }, [presenting, preview, built, fired]);

  /**
   * Which shapes on this slide are buttons: their sid, and the name a step
   * watches.
   *
   * By sid because that is what a click lands on, and by name because that is what
   * a step holds — the same translation `slideTimeline` does in the other
   * direction, and the reason a trigger survives a deck being saved and reopened.
   */
  const triggers = useMemo(() => {
    const store = editor?.dataStore;
    const rootId = editor?.getRootId?.();
    if (!store || !rootId || !current) return {};

    const doc = { rootId, getNode: (sid: string) => store.getNode(sid) };
    const watched = triggersOn(built.steps);
    if (watched.size === 0) return {};

    const out: Record<string, string> = {};
    for (const [name, sid] of namedBoxes(doc as never, current)) {
      if (watched.has(name)) out[sid] = name;
    }
    /*
     * And the parts a **card** draws, whose names carry their placement (§10l). The show's click walk
     * asks the innermost element first, so a press on a badge inside the second card finds that
     * card's step and not the first one's.
     */
    for (const [name, sid] of drawnNames(doc as never, current)) {
      if (watched.has(name)) out[sid] = name;
    }
    return out;
  }, [editor, current, built, revision]);

  /**
   * The **buttons** on this page: press one and the show goes where it says.
   *
   * By sid, like the motion triggers beside it, because a click lands on a sid — and the answer
   * is the model's (`jumpsOn`), so the show and the editor's panel cannot disagree about where a
   * button goes.
   */
  const jumps = useMemo(() => {
    const store = editor?.dataStore;
    const rootId = editor?.getRootId?.();
    if (!store || !rootId || !current) return {} as Record<string, Jump>;
    const doc = { rootId, getNode: (sid: string) => store.getNode(sid) };
    const out: Record<string, Jump> = {};
    for (const jump of jumpsOn(doc as never, current)) out[jump.sid] = jump;
    return out;
  }, [editor, current, revision]);

  /**
   * Where the reader has **been**, while the show is running.
   *
   * The only part of a jump that is not in the document, and the reason is the whole point of
   * 돌아가기: a reader who jumped from the menu to section four means *the menu*, not section
   * three. That is their own history, not a link — so it lives here, for as long as the show
   * does, and is thrown away when it ends.
   */
  const [visited, setVisited] = useState<string[]>([]);
  useEffect(() => {
    if (!presenting) return setVisited([]);
    // Only while presenting, and only the page that is showing: a click through the deck in the
    // editor is not somewhere a reader "came from".
    if (!current) return;
    setVisited((was) => (was[was.length - 1] === current ? was : [...was, current]));
  }, [presenting, current]);

  /**
   * A press on a button, answered by the model.
   *
   * `jumpTarget` is the one place that knows what 다음/처음/돌아가기 mean, so the show asks it
   * rather than deciding — and a button pointing at a page the deck no longer has does nothing at
   * all here, which is what the deck's own check exists to say out loud beforehand.
   */
  const takeJump = useCallback(
    (sid: string) => {
      const store = editor?.dataStore;
      const rootId = editor?.getRootId?.();
      if (!store || !rootId) return;
      const jump = jumps[sid];

      /**
       * A button into **another deck**: fetched, read and opened, then the page.
       *
       * Here because opening a document is the app's business — the model cannot follow a source
       * it has no way to read, and the show should not be the thing that knows about the network.
       * `readDeckFile` is the same reader the 열기 button uses, so a bad file says the same thing
       * in both places rather than failing differently in a show.
       *
       * Nothing is confirmed on the way: a reader **presenting** has already chosen this by
       * pressing the button, and a dialog in the middle of a show in front of an audience is
       * worse than any work it could save. The editor's own 열기 asks, because there it is a
       * reader's file being replaced by another.
       */
      if (jump?.deck) {
        void (async () => {
          try {
            /**
             * A **name** in the reader's own library first, then an address.
             *
             * One attribute holds both (`goToDeck`), and this is where the difference is resolved
             * — because it is a fact about the *host* rather than about the document: the same
             * deck is a name here and an address on a machine that has never seen this library.
             * `isLibraryName` decides by what a name is allowed to be rather than by guessing at
             * a string, so the rule stays true when addresses change shape.
             */
            const source = jump.deck as string;
            const kept = isLibraryName(source) ? await libraryDeck(source) : undefined;
            const text = kept ?? (await (await fetch(source)).text());
            const read = readDeckFile(text);
            if ('error' in read) return setAway(read.error);

            editor?.loadDocument?.(read.document, 'slides');
            /*
             * And the page *in that deck*, by its durable id — resolved after the load, because
             * until then the page does not exist in this session.
             */
            const opened = {
              rootId: editor?.getRootId?.(),
              getNode: (one: string) => editor?.dataStore?.getNode(one)
            };
            const page = jump.to ? slideById(opened as never, jump.to) : undefined;
            setCurrent(page ?? deckSlides(opened as never)[0]?.sid);
            setVisited([]);
          } catch {
            // Said, not swallowed: a button that silently does nothing in front of a room is the
            // fault this whole feature's check exists to prevent.
            setAway('다른 덱을 열 수 없습니다.');
          }
        })();
        return;
      }

      const doc = { rootId, getNode: (one: string) => store.getNode(one) };
      const to = jumpTarget(doc as never, jump, { at: current, history: visited });
      if (to) setCurrent(to);
    },
    [editor, jumps, current, visited]
  );

  /** What went wrong following a button out of the deck, if anything. */
  const [away, setAway] = useState<string | undefined>();

  const arrival = useMemo(() => {
    const store = editor?.dataStore;
    const rootId = editor?.getRootId?.();
    if (!store || !rootId || !current) return undefined;
    return transitionFrom(
      transitionOf({ rootId, getNode: (sid: string) => store.getNode(sid) }, current)
    );
  }, [editor, current, revision]);

  /**
   * What the control shows while the deck is fitted: the scale the stage drew at,
   * reported by the stage.
   *
   * This was forty lines of measuring the slide's own box, with a
   * `ResizeObserver` on it and on the stage — and it could not work, for a reason
   * worth keeping: **a slide is scaled with a `transform`, and a transform is not
   * a resize.** The observer fires when the pane takes room from the stage, reads
   * the slide *before* the new scale is applied, and is never told again, so the
   * box says a number the screen has stopped drawing until some unrelated render
   * comes along. Measured: folding the timeline re-fitted the slide from 732 to
   * 888 pixels and the control went on saying 57%.
   *
   * The stage computes the scale, so the stage is asked. Which is what the
   * comment here always claimed — "read back from the stage, so the number in the
   * box is the number on the screen" — and now it is literally that rather than a
   * second measurement hoping to agree.
   */
  const [fitted, setFitted] = useState(1);

  /**
   * Undo and redo, when the reader is not in the text.
   *
   * The editor already binds these and they work — with the caret in a slide.
   * A deck is edited from its chrome as much as from its text, and the moment a
   * reader clicks "새 슬라이드" the focus is on a button, the key never reaches
   * the editor, and Ctrl+Z does nothing. Measured in the browser: five presses,
   * no change, no error.
   *
   * Routing the key is the host's business, the same way opening a search box
   * is; undoing is still the editor's, and this calls it rather than
   * reimplementing it. Handed straight back when the focus *is* in the text, so
   * one press is never two undos.
   */
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey)) return;
      if (event.key.toLowerCase() !== 'z') return;

      const target = event.target as HTMLElement | null;
      if (target?.closest?.('[contenteditable="true"]')) return;

      event.preventDefault();
      void (event.shiftKey ? editor?.redo?.() : editor?.undo?.());
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [editor]);

  // Arrow keys move between slides when the caret is not in the text, which is
  // the one shortcut a deck cannot do without.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      // Inside the document, the arrows belong to the caret.
      if (target?.closest?.('[contenteditable="true"]')) return;
      if (event.key !== 'PageDown' && event.key !== 'PageUp') return;

      const at = slides.findIndex((slide) => slide.sid === current);
      if (at < 0) return;
      const next = event.key === 'PageDown' ? at + 1 : at - 1;
      if (next < 0 || next >= slides.length) return;

      event.preventDefault();
      setCurrent(slides[next].sid);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [slides, current]);

  return (
    <AppShell
      className="sl-shell"
      data={{
        ...(presenting ? { presenting: 'true' } : {}),
        ...(presenting && presenterView ? { presenter: 'true' } : {}),
        /**
         * How far a scrolling show has been scrolled, and how far it can go.
         *
         * On the shell because it is the show's *position*, the way `presenting` is its
         * mode — and because a test cannot ask a React state where the reader is. Two
         * numbers rather than a fraction: a reader who scrolls to the end and a deck that
         * has no room to scroll are different things, and one number hides the difference.
         */
        ...(scrolling ? { scrolled: String(Math.round(scrolled)), 'scroll-span': String(scrollSpan) } : {})
      }}
    >
      <AppChrome as="header" className="sl-topbar">
        <h1>Barocss Slides</h1>
        {/*
          The **menubar**, beside the deck's name.

          This product had already grown one without having one: twelve application-level commands as
          equal-weight text buttons along this bar, because there was nowhere else for them. A row of
          twelve buttons groups nothing (저장 sits beside 지도 with no sign one is a file operation
          and the other a way of looking), prioritises nothing, and does not scale — the thirteenth
          has to displace something, which is how a title bar becomes a toolbar.

          The buttons are still here and the retirement is its own move: 78 checks name them by
          `data-*`. What the menubar changes today is that there is somewhere for the thirteenth to
          go, and somewhere the 21 shortcuts can be read.
        */}
        <MenuBar className="sl-menubar" label="덱 메뉴" menus={menus} onPick={onMenu} />
        <span className="sl-count">
          {slides.length > 0 && here ? `${here.number} / ${slides.length}` : '—'}
        </span>

        <div className="sl-topbar-actions">
          <ZoomControl
            zoom={zoom ?? fitted}
            onChange={(next) => setZoom(clampZoom(next))}
            onFit={() => setZoom(undefined)}
            fitLabel="화면에 맞춤"
          />

          <FileActions
            ref={files}
            editor={editor}
            onOpened={() => {
              // A new document is a new deck: the slide that was on screen is not
              // in it, and neither is the press the presenter was on.
              setStepEdit([]);
              setCurrent(undefined);
              setPlayed(0);
              setPlayhead(0);
              /*
               * And it is not the deck the library was keeping either. A file opened from disk is
               * not a library row, so the name goes — otherwise the next 라이브러리 저장 would
               * overwrite a deck the reader never meant to touch.
               */
              setLibraryName(undefined);
            }}
          />

          {/*
            * The suite's button, four times — and the stylesheet's
            * `.sl-topbar-actions button` rules are gone with them.
            *
            * That descendant selector was more specific than anything the shared
            * control could say about itself, so every button in this row was drawn
            * in this app's border and this app's padding *including* the ones that
            * came from `office-ui`. Which is the fault the ratchet exists for,
            * arriving from the other side: not a hand-rolled control, but a
            * hand-rolled control's leftover rules restyling a shared one.
            */}
          {/*
            The two that stay, and which of them is **the** button.
            
            발표 is what a presentation tool is for, so it is the accent — the one thing on this bar
            a reader can find without reading. It was plain while 전체 보기 beside it was blue,
            because a *pressed toggle* and a *primary action* were the same colour: the blue meant
            "this view is on" and read as "this is the main button".
          */}
          <Button
            tone="accent"
            title="처음부터 발표"
            onClick={() => setPresenting(true)}
            data={{ present: '' }}
          >
            발표
          </Button>
          <Button
            title="한 장만 보기 / 전체 보기"
            /*
             * Not `pressed`, which draws the accent: a view toggle beside the app's headline action
             * cannot wear the same colour as it. The label already says which state it is in — it
             * reads 전체 보기 when a reader is on one slide and 한 장 보기 when they are not.
             */
            onClick={() => setFocused((on) => !on)}
            data={{ 'focus-toggle': '' }}
          >
            {focused ? '전체 보기' : '한 장 보기'}
          </Button>
        </div>
      </AppChrome>

      {/*
       * The suite's toolbar, drawing the model `office-slides` declares with the
       * components `office-word` draws its own with. The two products look alike
       * because they draw with the same components, not because they share a
       * list of controls.
       */}
      {editor && !presenting && <Ribbon editor={editor} slides={slides} current={current} />}

      <AppBody className="sl-body">
        <Filmstrip
            editor={editor}
            revision={revision}
            slides={slides} current={current} onSelect={setCurrent} />

        {/*
          * What is on the slide, beside the strip of slides.
          *
          * On the left, under the filmstrip, because both answer "which thing" —
          * one across the deck and one within a slide — and a reader looking for
          * something looks left. The properties panel on the right answers a
          * different question: what the thing they found *is*.
          */}
        <LayerPanel
          editor={editor}
          slideSid={current}
          open={layersOpen}
          onToggle={() => setLayersOpen((was) => !was)}
        />

        {/*
          * The components a deck defines, and the way in and out of one.
          *
          * Beside the layer list because both answer "which thing" — and a definition has to
          * be opened from *somewhere*: it is a resource rather than a page, so there is no
          * filmstrip row to click. See `component-panel.tsx` for why that is the right place
          * for it rather than a page of the file you scroll to.
          */}
        <ComponentPanel
          editor={editor}
          open={componentsOpen}
          editing={editingComponent}
          onOpen={openDefinition}
          onClose={() => setComponentsOpen((was) => !was)}
          behindSource={behindSource}
          canMake={canMakeComponent}
          onMake={makeComponent}
          onPlace={placeComponent}
          slideId={current}
        />

        <AppMain as="main" className="sl-main">
          {/*
            * Where the reader is, when it is not a slide — and the way back.
            *
            * Above the stage rather than in a panel, and that is the correction: the way out of
            * a component's definition lived in the components panel, so opening a **layout**
            * would have needed a second one somewhere else. What all three share is the
            * sentence "you are not on a slide"; a reader who cannot see how to get back to
            * their deck has been trapped by a feature, whichever kind of definition they
            * opened.
            */}
          {/*
            * What went wrong following a button **out** of the deck.
            *
            * Said where the reader is looking, and not swallowed: a button that silently does
            * nothing in front of a room is the fault this feature's own check exists to prevent.
            * Drawn while presenting too — it is the one message an audience being shown a broken
            * link is better off with than without.
            */}
          {away && (
            <div className="sl-away" role="alert" data-jump-away>
              <span>{away}</span>
              <Button title="닫기" data={{ 'away-close': '' }} onClick={() => setAway(undefined)}>
                닫기
              </Button>
            </div>
          )}

          {(editingComponent || editingDesign) && !presenting && (
            <div
              className="sl-editing"
              data-editing={editingComponent ? 'component' : editingDesign?.kind}
              data-editing-id={editingComponent?.id ?? editingDesign?.id}
              data-editing-sid={current}
            >
              <span>
                {editingComponent
                  ? `컴포넌트 편집 중: ${editingComponent.name || '이름 없음'}`
                  : editingDesign?.kind === 'master'
                    ? `마스터 편집 중: ${editingDesign.name || '이름 없음'}`
                    : `레이아웃 편집 중: ${editingDesign?.name || '이름 없음'}`}
              </span>
              {/*
                * And what the change reaches, said as a number: 스무 장 is a different decision
                * from 한 장. A component's count is in its panel; a design's is here, because a
                * layout is the one thing a reader edits *in order to* change other slides.
                */}
              {editingDesign && (
                <span className="sl-editing-reach" data-editing-reach={editingDesign.slides}>
                  {editingDesign.slides}장에 적용됩니다
                </span>
              )}
              <Button
                title="슬라이드로 돌아가기"
                data={{ 'editing-close': '' }}
                onClick={closeDefinition}
              >
                슬라이드로 돌아가기
              </Button>
            </div>
          )}

          {/*
            * Across the top of the slide's own column, not the window.
            *
            * A find bar belongs over the thing being searched — and this one changes
            * which *slide* is showing, so it has to be somewhere that stays put while
            * the slide under it changes.
            */}
          <FindBar
            editor={editor}
            slides={slides}
            open={finding}
            onClose={() => setFinding(false)}
            onGoTo={setCurrent}
          />

          {/*
            * The check's findings, above the slide like the find bar.
            *
            * Every row is somewhere to go, so it has to stay put while the slide
            * under it changes — the same reason the find bar is here.
            */}
          <AuditPanel
            editor={editor}
            open={auditing}
            onClose={() => setAuditing(false)}
            onGoTo={setCurrent}
          />
          {/*
           * The host is created once and handed to the view. It stays mounted
           * in both modes — switching to the strip must not tear the editor
           * down and build it again.
           */}
          {/*
           * Presenting always shows one slide and fills the window; editing
           * shows one or the strip and never grows past natural size.
           */}
          {/*
            * The deck's map, in the stage's place.
            *
            * Not while presenting: an audience is looking at a page, not at the deck's plumbing.
            */}
          {mapping && !presenting && (
            <DeckMapView
              editor={editor}
              revision={revision}
              current={current}
              onGoTo={(sid) => {
                setCurrent(sid);
                /*
                 * And it closes. A press in the map is "take me there", so staying would make the
                 * reader press twice for one intention — the same rule the check's rows follow.
                 */
                setMapping(false);
              }}
              /*
               * Rewiring, from the map: an arrow's end dropped on another page. `setBoxJump` is
               * the same command the properties panel runs — the map decides nothing about the
               * document, it just says where the reader let go.
               */
              advance={moveBy}
              onAdvance={(next) =>
                void editor?.executeCommand?.('setDeckShow', { advance: next })
              }
              onRetarget={(sid, pageSid) =>
                void editor?.executeCommand?.('setBoxJump', {
                  nodeIds: [sid],
                  to: pageSid
                })
              }
              onClose={() => setMapping(false)}
            />
          )}

          <Stage
            host={host}
            /** One page, one definition, or the deck as a strip — see `stageFocus`. */
            focus={stageFocus}
            /*
             * The transition, while presenting and not while editing.
             *
             * A deck is edited by clicking through it, and a slide that faded in
             * every time the rail was clicked would make the editor feel like it
             * was buffering. PowerPoint and Keynote both play transitions in the
             * show and not in the editor, for the same reason.
             */
            /**
             * No transition while the deck is being **scrolled**.
             *
             * The scroll *is* the transition: a slide that faded in on top of it would be
             * two answers to "how do we get from this slide to the next", and the reader
             * moving back through the same offset would watch the fade play forwards again.
             * The same reasoning that makes the scroll the build's clock (`scroll-show.ts`).
             */
            arrival={presenting && !scrolling ? arrival : undefined}
            builds={stagedBuilds}
            /** Freeze what is running, and say where it stopped — see `stopPreview`. */
            pausing={pausing}
            onPaused={stopPreview}
            /** The running clock, which only the stage can read — see `stageClock`. */
            clock={stageClock}
            triggered={triggered}
            playing={presenting}
            zoom={presenting ? undefined : zoom}
            onZoom={presenting ? undefined : setZoom}
            /**
             * The scale it drew at, for the control that says so.
             *
             * Not while presenting: the show fills the screen, and a percentage
             * of a projector is not a number anybody wants.
             */
            onScale={presenting ? undefined : setFitted}
            /**
             * The rulers, in the reader's unit — and only while editing: a
             * projector is not a place to measure things.
             */
            unit={presenting ? undefined : unit}
            /** Pulling a guide out of a ruler; the app holds it in flight. */
            onGuideDraft={setDraftGuide}
            onGuidePlace={placeGuide}
            fill={presenting}
            /**
             * What to fit and what the rulers measure: **the surface the reader is on**.
             *
             * Here rather than in the stage because this is what knows where the reader is, and
             * `stageFit` in the model is the arithmetic — a slide's own size, a definition's own
             * size, or the widest slide when the deck is drawn as a strip.
             */
            fit={fit}
          />

          {/*
           * Selecting and dragging what is on the slide, drawn over it.
           *
           * A layer rather than something inside the document: the view owns
           * every element in there and rewrites them on each render, so a handle
           * put in the tree would last until the next keystroke.
           */}
          {!presenting && (
            <SelectionOverlay
              editor={editor}
              view={view}
              slideSid={current}
              revision={revision}
              /** The guide being pulled out of a ruler, drawn where it will land. */
              draftGuide={draftGuide}
              /**
               * What the stage drew at, so the overlay re-measures when the slide
               * is re-fitted — a pane opening changes the scale and nothing else
               * would tell it. See the prop's comment in `overlay.tsx`.
               */
              drawnAt={zoom ?? fitted}
              /** The same unit the panel shows, for the drag readout. */
              unit={unit}
              paintEdit={paintEdit}
              stopEdit={stopEdit}
              onStopEdit={setStopEdit}
              stepEdit={stepEdit[0]}
              pathDrawing={pathDrawing}
              onPathDrawing={setPathDrawing}
            />
          )}

          {/*
           * The note, editable, and drawn by a second view over the same
           * document — see `notes.tsx` for why that rather than a textarea. It
           * used to be read-only prose with a comment saying this was the next
           * thing the app needed; this is that thing.
           */}
          {!presenting && (
            <NotesPane editor={editor} slideSid={current} revision={revision} />
          )}

        </AppMain>

        {/*
         * The panel on the right, where every Office product keeps it. Drawn with
         * the suite's components; what is in it is a deck's — a box has a
         * position, which is the whole difference between a slide and a page.
         */}
        <Properties
          editor={editor}
          slides={slides}
          current={current}
          paintEdit={paintEdit}
          onPaintEdit={setPaintEdit}
          stopEdit={stopEdit}
          onStopEdit={setStopEdit}
          /** The reader's unit, shared with the overlay's readout — see above. */
          unit={unit}
          onUnit={setUnit}
          /** The theme's own slots, which the panel's 테마 row names. */
          onEditTheme={() => setDialog('theme')}
          /** The reader's own decks, for a button that points at one by name. */
          libraryDecks={libraryDecks}
        />
      </AppBody>

      {/*
        * The timeline, across the whole window.
        *
        * It was inside the stage's column, between the filmstrip and the
        * properties panel, which made it the *slide's* timeline in the layout
        * as well as in the model — and gave it about half the width it needs.
        * A timeline is read left to right against a clock: the axis is the
        * thing that wants room, and every editor that has one gives it the
        * bottom of the window rather than the middle of a column.
        *
        * Below the body rather than inside it, so the filmstrip and the panel
        * stop at its top edge — which is also what makes dragging it taller
        * take room from *everything* rather than only from the slide.
        */}
      {!presenting && (
        <TimelinePane
          editor={editor}
          slideSid={current}
          /*
           * Opening the card the pane names, by its durable id — the pane says *which* cards on this
           * slide animate themselves, and where the reader has to go to change that. Resolved here
           * because the sid a definition happens to have is this session's, and where the reader is
           * belongs to the app.
           */
          onOpenCard={(componentId) => {
            const found = components.find((one) => one.id === componentId);
            if (found) openDefinition(found.sid);
          }}
          revision={revision}
          previewing={playing}
          onPreview={() =>
            playing
              ? setPausing(true)
              : startPreview(playhead > 0 ? { press: pressShown, at: playhead } : undefined)
          }
          onRewind={() => {
            setPlayhead(0);
            stopPreview();
          }}
          onStepFrame={(frames: number) => {
            if (playing) return setPausing(true);
            setPlayhead((at) => stepMoment(at, frames, timelineSpan));
          }}
          playhead={playhead}
          onPlayhead={setPlayhead}
          /** The running clock, so the playhead follows playback — see `stageClock`. */
          moment={stageClock}
          press={pressShown}
          onPress={setPressShown}
          selected={stepEdit}
          onSelected={(sids) => {
            setStepEdit(sids);
            // Choosing another bar ends the drawing: the points being placed
            // belong to *a* path, and the reader has just pointed at another one.
            setPathDrawing(false);
          }}
          drawing={pathDrawing}
          onDrawing={setPathDrawing}
          height={timelineHeight}
          onHeight={setTimelineHeight}
          open={timelineChoice ?? built.steps.length > 0}
          onOpen={setTimelineChoice}
        />
      )}

      <SlideSizeDialog
        editor={editor}
        slides={slides}
        open={dialog === 'size'}
        onClose={() => setDialog(null)}
      />
      {/* The reader's own decks, by name — what a `goToDeck` points at. */}
      <LibraryDialog
        editor={editor}
        open={dialog === 'library'}
        onClose={() => setDialog(null)}
        name={libraryName}
        onName={setLibraryName}
        onOpened={() => {
          setStepEdit([]);
          setCurrent(undefined);
          setPlayed(0);
          setPlayhead(0);
        }}
      />

      <SlideLayoutDialog
        editor={editor}
        current={current}
        open={dialog === 'layout'}
        onClose={() => setDialog(null)}
        /* The way into a layout or the master: the same opening a component's definition uses. */
        onEdit={openDefinition}
      />
      {/*
        * The theme's own slots.
        *
        * Opened from the properties panel's 테마 row rather than from the top bar:
        * the row is where a reader already goes to see which theme a deck is in,
        * and the twelve colours are what that row was naming all along.
        */}
      <ThemeDialog
        editor={editor}
        open={dialog === 'theme'}
        onClose={() => setDialog(null)}
      />
      {/*
        * What a reader is *making*, which 새로 만들기 cannot ask.
        *
        * That button makes the least a deck can be, and it stays exactly that. This is the
        * other question — a talk, a report, a proposal — and it is five slides in an order
        * nobody types from memory.
        */}
      <TemplateDialog
        editor={editor}
        open={dialog === 'template'}
        onClose={() => setDialog(null)}
        onOpened={() => {
          // A new document is a new deck: the slide that was on screen is not in it, and
          // neither is the press the presenter was on. The same forgetting `FileActions`
          // does when a file is opened.
          setStepEdit([]);
          setCurrent(undefined);
          setPlayed(0);
          setPlayhead(0);
        }}
      />

      {presenting && (
        <Present
          slides={slides}
          current={current}
          onCurrent={setCurrent}
          onExit={() => {
            setPresenting(false);
            // Scrolling is a way of *showing*, so it ends with the show — otherwise a
            // reader who scrolled once finds the editor's wheel taken over.
            setScrolling(false);
          }}
          builds={built.presses}
          played={played}
          onGo={advance}
          onWindow={() => setPresenterWindow((was) => !was)}
          windowOpen={presenterWindow}
          scrolling={scrolling}
          onScrollBy={scrollBy}
          onScrollStep={scrollToNext}
          presenterView={presenterView}
          onPresenterView={setPresenterView}
          triggers={triggers}
          onTrigger={(name) =>
            setFired((was) => ({ ...was, [name]: (was[name] ?? 0) + 1 }))
          }
          /*
           * And the buttons. Passed beside the motion triggers because they are the same
           * gesture with a different consequence, and the rule the show already had is the one
           * they need: a press that fires one does not also advance the deck.
           */
          jumps={jumps}
          onJump={takeJump}
        />
      )}

      {/*
        * The presenter's half of the screen, which is the audience's screen with
        * everything the presenter needs beside it — all of it already in the
        * document except the clock.
        */}
      {/*
        * The presenter's screen — beside the slide, or in a window of its own.
        *
        * One state, drawn in one of two places: with the second window open the audience's
        * screen is the whole of *this* one, which is what makes the arrangement usable on
        * two displays. The same element either way, so the two cannot disagree about what
        * a presenter is shown.
        */}
      {presenting && presenterView && !presenterWindow && (
        <Presenter
          editor={editor}
          slides={slides}
          current={current}
          revision={revision}
          builds={built.presses}
          played={played}
          since={showStarted}
          /* No next page to promise when the deck moves by its buttons. */
          links={moveBy === 'links'}
        />
      )}

      <PresenterWindow
        open={presenting && presenterWindow}
        onClosed={() => setPresenterWindow(false)}
        onGo={advance}
        onExit={() => setPresenting(false)}
      >
        <Presenter
          editor={editor}
          slides={slides}
          current={current}
          revision={revision}
          builds={built.presses}
          played={played}
          since={showStarted}
          onGo={advance}
          onExit={() => setPresenting(false)}
        />
      </PresenterWindow>
    </AppShell>
  );
}
