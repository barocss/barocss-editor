import { useMemo } from 'react';
import type { Editor } from '@barocss/editor-core';
import {
  ChoiceSelect,
  ColorPalette,
  Icon,
  Toolbar,
  ToolbarGroup,
  ToolbarSeparator,
  ToolbarToggle
} from '@barocss/office-ui';
import { useEditorRevision } from '@barocss/office-editor-ui';
/**
 * The vocabulary from the shared layer, the *content* from the text model.
 *
 * These were one import from `@barocss/office-word` — a deck's font box typed as
 * `ToolbarChoice`, a Word type, and read with Word's functions. The shapes and
 * the readers are nobody's product now (`office-controls`), which is what lets
 * this ribbon be declared without Word in it.
 *
 * The four constants below are shared *content* — a font catalogue and a set of text colours.
 * Two products disagreeing about what a text-colour button offers would be one of them wrong.
 *
 * **That open question is closed.** They live in `office-controls`, which already held the two
 * palettes while `office-word` merely re-sold them. A product importing from another product is
 * what `docs/specs/architecture.md` forbids, and this line was the last one doing it here.
 */
import {
  choiceOptions,
  currentChoice,
  currentPaletteColor,
  type ChoiceControl,
  type PaletteControl
} from '@barocss/office-controls';
import { WORD_FONTS, WORD_FONT_SIZES, WORD_TEXT_COLOR, WORD_TEXT_HIGHLIGHT } from '@barocss/office-controls';
import {
  SLIDES_TOOLBAR,
  keyLabel,
  resolveDeckFormat,
  shortcutOf,
  type Slide,
  type SlidesToolbarControl
} from '@barocss/office-slides';
import { ControlRows } from '@barocss/office-editor-ui';

/**
 * The deck's ribbon.
 *
 * It draws the toolbar model the product ships and holds nothing else — the
 * same rule Word's follows, and for the same reason: state held here could
 * disagree with the document, and a bold button that remembers being pressed is
 * a button that lies after an undo. So the summary is re-read whenever the
 * selection or the content changes, which are the only two things that can
 * change any answer.
 *
 * The components are `@barocss/office-ui`, shared with Word. The *model* is
 * Slides', which is what lets a deck have a slide group and a word processor
 * have tracked changes while both look like the same suite.
 */
export function Ribbon({
  editor,
  slides,
  current
}: {
  editor: Editor;
  slides: Slide[];
  /** Which slide the reader is on — the app's fact, not the document's. */
  current?: string;
}) {
  /**
   * Which way to draw a chord, asked once.
   *
   * Apple writes `⌘⇧G` and everyone else writes `Ctrl+Shift+G`; a tool that shows
   * the wrong one looks ported. `userAgentData` where it exists and the old
   * `platform` where it does not, which is the only pair that covers every
   * browser this runs in today.
   */
  const apple = useMemo(() => {
    const nav = navigator as Navigator & { userAgentData?: { platform?: string } };
    const name = nav.userAgentData?.platform ?? nav.platform ?? '';
    return /mac|iphone|ipad/i.test(name);
  }, []);

  /**
   * A count of the events that can change an answer here, not the answers
   * themselves. Keeping the answers would mean keeping a second copy of the
   * document's state, which is the thing this component exists not to do.
   */
  /**
   * Which events those are is the suite's answer, not this file's — see
   * `useEditorRevision`, where the three of them and the reason for each are
   * written down once. It was hand-rolled here, and the copy in Word's ribbon
   * was missing one of the three for months.
   */
  const tick = useEditorRevision(editor);

  /**
   * `getSelectionSummary`, not `selectionSummary`.
   *
   * The third name copied wrongly out of Word's ribbon, and the third to fail
   * silently — an optional call on a method that does not exist is `undefined`,
   * so every control read "off" and the whole formatting half of this toolbar
   * was dead. Bold on bold text, italic on italic text, alignment on a centred
   * paragraph: all off, all the time, with nothing in the console.
   *
   * Not optional any more. A missing summary is a broken toolbar and should say
   * so at the first render rather than looking like a document with no
   * formatting in it.
   */
  const summary = useMemo(() => editor.getSelectionSummary(), [editor, tick]);

  /**
   * What the layout says, for a control the selection does not answer.
   *
   * Read at the moment a control asks rather than computed for every render:
   * most of the time nothing is asking, and this walks the deck's resources.
   */
  const inherited = (model: { markType: string }): string | number | undefined => {
    const store = editor.dataStore;
    const rootId = editor?.getRootId();
    const at = editor?.selection?.startNodeId as string | undefined;
    if (!store || !rootId || !at) return undefined;

    const format = resolveDeckFormat(
      { rootId, getNode: (sid: string) => store.getNode(sid) },
      at,
      'character'
    );
    const value = format[model.markType];
    if (typeof value === 'number') return value;
    if (typeof value !== 'string') return undefined;
    // A stylesheet writes a stack — `Georgia, serif` — where a control offers
    // one name. The same trim Word's own resolver does, for the same reason.
    return value.split(',')[0].trim().replace(/^["']|["']$/g, '');
  };
  const here = useMemo(
    () => slides.find((slide) => slide.sid === current),
    [slides, current]
  );

  /**
   * What a slide control does when it is pressed.
   *
   * The model says a control needs a slide; this is the only place that knows
   * which one, and the two directions of `moveSlide` are the one case where the
   * control's id is the whole difference. Numbers here are the reader's — slide
   * one is number one — and the command translates them.
   */
  /**
   * Choosing a picture, which is the one thing a button press cannot supply.
   *
   * Read as a data URL rather than kept as a blob URL: a blob URL dies with the
   * page, so a deck saved with one would come back with a broken picture and no
   * way to tell what it had been. The file travels *in* the document, which is
   * also what makes copy between decks work without a server.
   *
   * Measured before it is placed, because a picture dropped into a box of the
   * wrong shape is either stretched or cropped, and a reader who has just chosen
   * a photograph expects neither. The natural size is scaled to fit a quarter of
   * the slide, keeping its proportions.
   */
  const pickPicture = (
    run: (payload: Record<string, unknown>) => void,
    accept = 'image/*'
  ) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = () => {
        const src = String(reader.result ?? '');
        if (!src) return;

        /**
         * A film is measured the same way a picture is, from the file itself.
         *
         * `videoWidth` is only known once the browser has read the metadata, so
         * this waits for that event rather than the load — a film's first frame
         * may be megabytes away and its dimensions are in the first kilobyte.
         *
         * A sound has no dimensions at all, so it takes a strip: full width of a
         * quarter-slide and the height of the browser's own player.
         */
        if (file.type.startsWith('video/')) {
          const video = document.createElement('video');
          video.preload = 'metadata';
          const place = () => {
            const limit = { width: 19200 / 2, height: 10800 / 2 };
            const natural = {
              width: (video.videoWidth || 640) * 15,
              height: (video.videoHeight || 360) * 15
            };
            const scale = Math.min(limit.width / natural.width, limit.height / natural.height, 1);
            run({
              src,
              width: Math.round(natural.width * scale),
              height: Math.round(natural.height * scale)
            });
          };
          video.onloadedmetadata = place;
          // A file the browser cannot decode still goes in, at the default box,
          // rather than silently doing nothing to a reader who chose it.
          video.onerror = () => run({ src });
          video.src = src;
          return;
        }

        if (file.type.startsWith('audio/')) {
          run({ src, width: 9600, height: 810 });
          return;
        }

        const image = new Image();
        image.onload = () => {
          // A quarter of a 16:9 slide, in twips, and never larger than that.
          const limit = { width: 19200 / 2, height: 10800 / 2 };
          const scale = Math.min(
            limit.width / Math.max(1, image.naturalWidth * 15),
            limit.height / Math.max(1, image.naturalHeight * 15),
            1
          );
          run({
            src,
            alt: file.name,
            width: Math.round(image.naturalWidth * 15 * scale),
            height: Math.round(image.naturalHeight * 15 * scale)
          });
        };
        // A file the browser cannot decode still goes in, at the default size,
        // rather than silently doing nothing to a reader who chose it.
        image.onerror = () => run({ src, alt: file.name });
        image.src = src;
      };
      reader.readAsDataURL(file);
    };
    input.click();
  };

  const payloadFor = (control: SlidesToolbarControl): Record<string, unknown> | undefined => {
    if (control.id === 'slide-new') return { after: current };
    if (control.id === 'slide-up') return { slideId: current, to: (here?.number ?? 1) - 2 };
    if (control.id === 'slide-down') return { slideId: current, to: here?.number ?? 0 };
    /**
     * **Where the reader is**, on every control, whether the model says it needs one or not.
     *
     * `needsSlide` gated this, which was right while "where" could only ever be a slide: an
     * insert command with no `slideId` falls back to the deck's first slide, and that is the
     * correct answer for a console or a test. It is the wrong answer for a *reader*, and
     * measured: with a component's definition open, pressing 타원 put the ellipse on slide 1.
     *
     * The app is the only thing that knows where the reader is (canvas-model §10c), so it
     * says so every time. A command that does not take a `slideId` reads the keys it wants and
     * ignores this one.
     */
    return { ...(control.payload ?? {}), ...(current ? { slideId: current } : {}) };
  };

  /**
   * Whether a control can run.
   *
   * Asked of the editor rather than decided here, so the toolbar and the
   * command agree by construction: `deleteSlide` refuses the last slide, and
   * this draws that refusal rather than restating the rule and drifting from it.
   */
  const enabled = (control: SlidesToolbarControl): boolean => {
    if (control.needsSlide && !current) return false;
    // A file-picking control is asking whether a *picture* could be placed, and
    // the command cannot answer that without a file. Whether there is a slide is
    // the whole of what it can be asked before one is chosen.
    if (control.needsFile) return !!current;
    const can = editor?.canExecuteCommand(control.command, payloadFor(control));
    return can !== false;
  };

  const stateOf = (control: SlidesToolbarControl) => {
    if (control.slideFlag === 'hidden') return here?.hidden ? 'on' : 'off';
    if (control.state && summary) return control.state(summary);
    return 'off';
  };

  /**
   * The font controls, which are Word's.
   *
   * Not a copy: the same model and the same commands, because a slide's text
   * *is* Word's text — a `textFrame` holds `block+`, so a title is a paragraph
   * and every character command written for the first product already works
   * here. Slides had none of them on its toolbar, so `setFontFamily`,
   * `setFontSize` and `setFontColor` were registered, working, and unreachable.
   *
   * `inherited` resolves through the layout, which is a deck's answer to the
   * question Word answers with its style cascade. Without it these controls
   * read "—" for a title that is plainly 66pt, because nothing on the slide
   * sets a size — the layout does, and the slide follows it.
   */
  const choice = (model: ChoiceControl, width: string) => {
    const current = summary ? currentChoice(model, summary as never, () => inherited(model)) : null;
    /**
     * A size the presets do not offer is still the size — see `choiceOptions`.
     *
     * This block lived here, with a comment saying Word's ribbon had the same
     * gap and it was logged rather than copied. A gap logged in one product and
     * fixed in the other is the state this repository keeps finding and calling
     * a defect, so it moved to the toolbar model both products read.
     */
    const options = choiceOptions(model, current);

    return (
    <ChoiceSelect
      key={model.id}
      testClass={`sl-toolbar-${model.id}`}
      ariaLabel={model.label}
      className={width}
      options={options}
      value={current}
      disabled={!summary || (summary as never as { empty?: boolean }).empty === true}
      onChange={(id) => {
        const chosen = model.options.find((option) => String(option.value) === id);
        if (!chosen) return;
        void editor?.executeCommand(model.command, { [model.key]: chosen.value });
      }}
    />
    );
  };

  /**
   * A colour control, which is Word's for the same reason the font boxes are.
   *
   * Asked with a real colour in the payload: `setFontColor` refuses a payload
   * with no colour, so asking with an empty one would report every colour
   * control as permanently unavailable — the trap the picture button fell into
   * here.
   */
  const palette = (model: PaletteControl) => (
    <ColorPalette
      key={model.id}
      id={model.id}
      label={model.label}
      icon={<Icon name={model.icon} />}
      value={summary ? currentPaletteColor(model, summary as never) : null}
      swatches={model.swatches}
      disabled={
        !summary ||
        editor?.canExecuteCommand(model.command, {
          [model.key]: model.swatches[0].value
        }) === false
      }
      clearLabel={model.clearCommand ? '없음' : undefined}
      onPick={(value) =>
        void editor?.executeCommand(model.command, { [model.key]: value })
      }
      onClear={() => void editor?.executeCommand(model.clearCommand!)}
    />
  );

  return (
    <Toolbar className="sl-toolbar" label="슬라이드 서식">
      {choice(WORD_FONTS, 'min-w-36')}
      {choice(WORD_FONT_SIZES, 'min-w-16')}
      {/*
        * Word's palettes, because a colour means the same thing in both.
        *
        * `setFontColor` and `removeFontColor` were registered in this deck from
        * the day it had marks and were on no toolbar and bound to no key — the
        * deck could not change the colour of its text. They come from the shared
        * kit rather than from the deck's own extensions, so the check that finds
        * an unreachable command could not see them; Word had the identical gap
        * and grew this control a day earlier.
        *
        * The same precedent as the font and size boxes above, which are also
        * Word's: two products disagreeing about what a text-colour button does
        * would be one of them wrong, and that is the rule for what belongs in one
        * place.
        */}
      {palette(WORD_TEXT_COLOR)}
      {palette(WORD_TEXT_HIGHLIGHT)}
      <ToolbarSeparator />
      {/*
        A **contextual** group is drawn only when there is something for it to act on.

        Measured with one box selected: of 60 controls, `align` was 10 of 12 disabled, `table` 9 of 9,
        `character` 5 of 5 and `group` 2 of 4 — twenty-six glyphs that could do nothing, and with
        nothing selected it was forty-four. Word's ribbon reached the same place and the boundary is
        the same: `character` is dead for want of a **selection** and these four for want of a *kind*
        of one, which is a fact about the product and so the product says it (`ControlGroup.when`).

        Both kinds are answered here by asking the group's own controls, where Word answers `table`
        from the caret's own table because it already computes one for the look flags. Same rule, one
        product with a shortcut — and `when`'s value is what says which context a group is about.
      */}
      {SLIDES_TOOLBAR.filter(
        (group) =>
          !group.when || group.controls.some((control) => editor.canRun(control.command, control.payload))
      ).map((group, index) => (
        <span key={group.id} className="contents">
          {index > 0 && <ToolbarSeparator />}
          <ToolbarGroup id={group.id}>
            {/*
              **`useControls` is the shared chrome** — subscribing to the editor, keying each
              control, working out whether it may run and running it. All four of those were written
              here, and again in Word's ribbon, and again in the site's.

              What stays is what is the deck's own: a slide's commands take a `slideId`, a few of
              them need a file before they can run at all, and the state comes from `stateOf` rather
              than from a mark.
            */}
            {/*
              **`ControlRows` is the shared chrome** — subscribing, keying, chord, may-it-run, run.
              A render prop because a hook cannot be called inside a `.map`.

              What stays is the deck's own: a slide's commands take a `slideId`, a few need a file
              before they can run at all, and the state comes from `stateOf` rather than a mark.
            */}
            <ControlRows
              editor={editor}
              controls={group.controls}
              options={{
                apple,
                can: (control) => enabled(control),
                state: (control) => stateOf(control) as never,
                onRun: (control) => {
                  if (control.needsFile) {
                    /*
                     * What the picker will accept, from what the command makes: a video button that
                     * offered every image is a button that produces a film with a picture in it.
                     */
                    const accept =
                      control.command === 'insertVideo'
                        ? 'video/*'
                        : control.command === 'insertAudio'
                          ? 'audio/*'
                          : 'image/*';
                    pickPicture(
                      (payload) =>
                        void editor?.executeCommand(control.command, {
                          ...payloadFor(control),
                          ...payload
                        }),
                      accept
                    );
                    return;
                  }
                  void editor?.executeCommand(control.command, payloadFor(control));
                }
              }}
            >
              {(rows) =>
                rows.map((one) => (
                  <ToolbarToggle
                    key={one.key}
                    id={one.key}
                    label={one.label}
                    /**
                     * The chord, from the keymap rather than from a second list.
                     *
                     * A toolbar is how a reader finds a command and the keyboard is how they use it
                     * the next time — a tool that never shows the chord teaches nobody the chord.
                     * Which symbols to draw is the reader's platform's business, which is why
                     * `apple` goes in rather than being decided inside the model.
                     */
                    shortcut={keyLabel(shortcutOf(one.control.command), apple)}
                    state={one.state as never}
                    disabled={one.disabled}
                    onActivate={one.run}
                  >
                    {one.control.icon ? <Icon name={one.control.icon} /> : one.label}
                  </ToolbarToggle>
                ))
              }
            </ControlRows>
          </ToolbarGroup>
        </span>
      ))}
    </Toolbar>
  );
}
