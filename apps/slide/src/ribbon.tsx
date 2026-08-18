import { useEffect, useMemo, useReducer } from 'react';
import type { Editor } from '@barocss/editor-core';
import {
  ChoiceSelect,
  ControlIcon,
  Toolbar,
  ToolbarGroup,
  ToolbarSeparator,
  ToolbarToggle
} from '@barocss/office-ui';
import {
  WORD_FONTS,
  WORD_FONT_SIZES,
  currentChoice,
  type ToolbarChoice
} from '@barocss/office-word';
import {
  SLIDES_TOOLBAR,
  resolveDeckFormat,
  type Slide,
  type SlidesToolbarControl
} from '@barocss/office-slides';

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
   * A count of the events that can change an answer here, not the answers
   * themselves. Keeping the answers would mean keeping a second copy of the
   * document's state, which is the thing this component exists not to do.
   */
  const [tick, bump] = useReducer((n: number) => n + 1, 0);
  useEffect(() => {
    if (!editor) return;
    // `selection.model`, not `selection.change`. Copied wrongly from Word's
    // ribbon at first, and nothing said so: the handler simply never ran, so the
    // toolbar and this panel kept whatever they had read at mount and looked
    // like a caret that never moved.
    editor.on('editor:selection.model', bump);
    editor.on('editor:content.change', bump);
    return () => {
      (editor as any).off?.('editor:selection.model', bump);
      (editor as any).off?.('editor:content.change', bump);
    };
  }, [editor]);

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
    const store = (editor as any).dataStore;
    const rootId = (editor as any).getRootId?.();
    const at = (editor as any).selection?.startNodeId as string | undefined;
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
  const payloadFor = (control: SlidesToolbarControl): Record<string, unknown> | undefined => {
    if (!control.needsSlide) return control.payload;
    if (control.id === 'slide-new') return { after: current };
    if (control.id === 'slide-up') return { slideId: current, to: (here?.number ?? 1) - 2 };
    if (control.id === 'slide-down') return { slideId: current, to: here?.number ?? 0 };
    return { slideId: current };
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
    const can = (editor as any).canExecuteCommand?.(control.command, payloadFor(control));
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
  const choice = (model: ToolbarChoice, width: string) => {
    const current = summary ? currentChoice(model, summary as never, () => inherited(model)) : null;
    const options = model.options.map((option) => ({
      id: String(option.value),
      label: option.label
    }));

    /**
     * A size the presets do not offer is still the size.
     *
     * The layouts in a deck are set in whatever the designer chose — this
     * deck's title is 54pt — and the control offers a dozen round numbers. A
     * value not among them left the box blank, which reads as "the selection
     * disagrees with itself" when it agrees perfectly. So the real value joins
     * the list.
     *
     * Word's ribbon has the same gap for the same reason; it is logged rather
     * than fixed in two places by copying this.
     */
    if (current !== null && !options.some((option) => option.id === current)) {
      const points = Number(current);
      options.unshift({
        id: current,
        label: model.id === 'font-size' && Number.isFinite(points) ? String(points / 2) : current
      });
    }

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
        void (editor as any).executeCommand?.(model.command, { [model.key]: chosen.value });
      }}
    />
    );
  };

  return (
    <Toolbar className="sl-toolbar" label="슬라이드 서식">
      {choice(WORD_FONTS, 'min-w-36')}
      {choice(WORD_FONT_SIZES, 'min-w-16')}
      <ToolbarSeparator />
      {SLIDES_TOOLBAR.map((group, index) => (
        <span key={group.id} className="contents">
          {index > 0 && <ToolbarSeparator />}
          <ToolbarGroup id={group.id}>
            {group.controls.map((control) => (
              <ToolbarToggle
                key={control.id}
                id={control.id}
                label={control.label}
                state={stateOf(control) as never}
                disabled={!enabled(control)}
                onActivate={() => {
                  void (editor as any).executeCommand?.(control.command, payloadFor(control));
                }}
              >
                <ControlIcon id={control.id} fallback={control.icon} />
              </ToolbarToggle>
            ))}
          </ToolbarGroup>
        </span>
      ))}
    </Toolbar>
  );
}
