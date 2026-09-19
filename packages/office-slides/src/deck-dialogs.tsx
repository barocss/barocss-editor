import { useMemo } from 'react';
import { useTemplateStart } from './use-template-start';
import type { Editor } from '@barocss/editor-core';
import { useEditorSettings } from '@barocss/office-editor-ui';
import {
  ChoiceSelect,
  ColorField,
  Dialog,
  DialogButton,
  StatusNotice,
  StatusIndicator,
  PropertyNumber,
  PropertyRow
} from '@barocss/office-ui';
/** The suite's font list — shared content, see the ribbon's note about it. */
/* 글꼴 목록은 공유 콘텐츠다 — 제품이 아니라 부품에서 온다. */
import { WORD_FONTS } from '@barocss/office-controls';
import { pxToTwip, twipToPx } from '@barocss/shared';
/* 자기 배럴을 거치지 않는다 — 심볼이 사는 모듈에서 곧장. */
import {
  CUSTOM_THEME,
  DECK_THEMES,
  THEME_COLOUR_SLOTS,
  themeFor,
  themeNow,
  type ThemeColourSlot
} from './theme';
import { DECK_TEMPLATES, templateSketch } from './templates';
import { deckDesigns, type DeckDesign } from './layout-format';
import { SLIDE_16_9, SLIDE_4_3, slideSize } from './geometry';
import type { Slide } from './deck';

/**
 * The deck's two dialogs.
 *
 * The first things to draw `office-ui`'s `Dialog`, which was written when the
 * suite's chrome was extracted and then sat unused — a component no product had
 * drawn, in the file written to hold the suite's agreements. That is the fault
 * this repository keeps finding, committed by the thing built to find it.
 *
 * Both follow the shape every Office dialog has: a titled panel, the settings in
 * the middle, and two buttons at the bottom right with the affirmative one last.
 * A reader who has changed a paragraph's spacing in Word should not have to work
 * out how a deck is resized.
 */

/** The sizes a deck is actually made in, plus whatever the author types. */
const PRESETS = [
  { id: '16:9', label: '와이드스크린 16:9', ...SLIDE_16_9 },
  { id: '4:3', label: '표준 4:3', ...SLIDE_4_3 }
];

/** What the size dialog is told. */
export interface SlideSizeDialogProps {
  editor: Editor | null;
  slides: Slide[];
  open: boolean;
  onClose: () => void;
}

export function SlideSizeDialog({ editor, slides, open, onClose }: SlideSizeDialogProps) {
  /**
   * What the deck is now — read from the first slide, because that is what
   * "the deck's size" means when every slide carries its own.
   */
  const current = useMemo(() => {
    const store = editor?.dataStore;
    const first = slides[0] ? store?.getNode(slides[0].sid) : undefined;
    return slideSize(first?.attributes);
  }, [editor, editor?.getRootId(), slides, open]);

  const { state: size, setState: setSize, busy, problem, close, apply: submit } = useEditorSettings(
    editor, open, () => current, onClose,
    { isEqual: (a, b) => a.width === b.width && a.height === b.height }
  );
  const usable = Number.isFinite(size.width) && Number.isFinite(size.height) && size.width > 0 && size.height > 0;

  const preset =
    PRESETS.find((entry) => entry.width === size.width && entry.height === size.height)?.id ??
    null;

  const apply = () => {
    if (editor && usable) void submit(() => editor.executeCommand('setDeckSize', size));
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => !next && close()}
      title="슬라이드 크기"
      description="덱의 모든 슬라이드에 적용됩니다. 슬라이드 위의 내용은 그대로 있습니다."
      footer={
        <>
          <DialogButton disabled={busy} onClick={close}>취소</DialogButton>
          <DialogButton variant="primary" data-size-apply disabled={!editor || !usable || busy} onClick={apply}>
            {busy ? '적용 중…' : '적용'}
          </DialogButton>
        </>
      }
    >
      <fieldset disabled={busy} aria-busy={busy || undefined} className="flex flex-col gap-3">
        <PropertyRow label="크기">
          <ChoiceSelect
            ariaLabel="슬라이드 크기"
            testClass="sl-dialog-size"
            className="min-w-48"
            options={PRESETS.map((entry) => ({ id: entry.id, label: entry.label }))}
            // Nothing selected when the numbers are the author's own, which is a
            // truthful third state rather than one of the two presets.
            value={preset}
            onChange={(id) => {
              const chosen = PRESETS.find((entry) => entry.id === id);
              if (chosen) setSize({ width: chosen.width, height: chosen.height });
            }}
          />
        </PropertyRow>

        <PropertyRow label="너비">
          <PropertyNumber
            ariaLabel="너비"
            suffix="px"
            min={1}
            value={twipToPx(size.width)}
            onCommit={(value) => setSize((was) => ({ ...was, width: Math.round(pxToTwip(value)) }))}
          />
        </PropertyRow>
        <PropertyRow label="높이">
          <PropertyNumber
            ariaLabel="높이"
            suffix="px"
            min={1}
            value={twipToPx(size.height)}
            onCommit={(value) => setSize((was) => ({ ...was, height: Math.round(pxToTwip(value)) }))}
          />
        </PropertyRow>
      </fieldset>
      {!usable && <StatusNotice tone="warning" title="너비와 높이를 0보다 크게 입력하세요." />}
      {busy && <StatusIndicator busy>슬라이드 크기 적용 중</StatusIndicator>}
      {problem && <StatusNotice tone="danger" title={problem} />}
    </Dialog>
  );
}

/**
 * Which layout the current slide follows.
 *
 * Only the binding — the placeholders are not re-applied. A slide that already
 * has content would lose what the author wrote, and there is no reading of
 * "change layout" that a reader would want to undo twice.
 */
/** What the layout dialog is told. */
export interface SlideLayoutDialogProps {
  editor: Editor | null;
  current?: string;
  open: boolean;
  onClose: () => void;
  /**
   * Open a design for editing — the app's job, because *where the reader is* is app state.
   *
   * A dialog that set it itself would be a second place that decides which surface is being
   * worked on, and that variable has already cost this product one measured fault (a reader
   * bounced back to slide 1, canvas-model §10c).
   */
  onEdit?: (sid: string) => void;
}

export function SlideLayoutDialog({
  editor,
  current,
  open,
  onClose,
  onEdit
}: SlideLayoutDialogProps) {
  /**
   * The deck's designs, from the model.
   *
   * This walked `resources` itself and built its own list, while `resourceById` walked it again
   * to answer one question and the properties panel asked a third way. `deckDesigns` is the one
   * answer — and it carries what this dialog now needs beyond a label: where each design *is*,
   * so it can be opened, and how many slides a change to it would reach.
   */
  const designs = useMemo(() => {
    const store = editor?.dataStore;
    const rootId = editor?.getRootId?.();
    if (!store || !rootId) return [] as DeckDesign[];
    return deckDesigns({ rootId, getNode: (sid: string) => store.getNode(sid) } as never);
    // `open` is in here because a dialog that is closed is not re-rendered for a document
    // change, and its list has to be right the moment it opens.
  }, [editor, editor?.getRootId(), open]);

  const layouts = useMemo(
    () => designs.filter((one) => one.kind === 'layout').map((one) => ({ id: one.id, label: one.name || one.id })),
    [designs]
  );

  const following = useMemo(() => {
    const store = editor?.dataStore;
    const slide = current ? store?.getNode(current) : undefined;
    const id = slide?.attributes?.layoutId;
    return typeof id === 'string' ? id : 'none';
  }, [editor, editor?.getRootId(), current, open]);

  const { state: chosen, setState: setChosen, busy, problem, close, apply: submit } = useEditorSettings(
    editor, open, () => following, onClose, { context: current }
  );
  const hasTarget = !!editor && !!current && !!editor.dataStore.getNode(current);
  const apply = () => {
    if (editor && hasTarget) void submit(() => editor.executeCommand('setSlideLayout', {
      slideId: current,
      layoutId: chosen === 'none' ? undefined : chosen
    }));
  };

  /**
   * The other half of a layout: the **arrangement**.
   *
   * Following a layout decides what a slide's formatting inherits and moves nothing —
   * which is right, and is not what a reader means by "make this page look like that
   * one". This puts each box in the slot for what it is (matched by role, never by
   * position) and starts following the layout in the same transaction, so it is one press
   * of undo.
   *
   * A second button rather than a mode on the first, because the two are different
   * promises: one changes what a slide *is like*, the other moves the reader's boxes.
   */
  const arrange = () => {
    // Reapplying the same layout can still move boxes back to their slots.
    if (editor && hasTarget && chosen !== 'none') void submit(() => editor.executeCommand('applySlideLayout', {
      slideId: current, layoutId: chosen
    }), { skipUnchanged: false });
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => !next && close()}
      title="레이아웃"
      description="적용하면 이 슬라이드가 그 레이아웃을 따릅니다. 이 장을 이 배치로 옮기면 지금 있는 상자가 각자의 자리로 갑니다."
      footer={
        <>
          <DialogButton disabled={busy} onClick={close}>취소</DialogButton>
          <DialogButton
            data-layout-arrange
            disabled={busy || !hasTarget || chosen === 'none'}
            onClick={arrange}
          >
            이 장을 이 배치로
          </DialogButton>
          <DialogButton variant="primary" data-layout-apply disabled={busy || !hasTarget} onClick={apply}>
            적용
          </DialogButton>
        </>
      }
    >
      <fieldset disabled={busy} aria-busy={busy || undefined} className="flex flex-col gap-3">
        {layouts.length === 0 ? (
          <p className="text-xs text-neutral-500">이 덱에는 정의된 레이아웃이 없습니다.</p>
        ) : (
          <PropertyRow label="레이아웃">
            <ChoiceSelect
              ariaLabel="슬라이드 레이아웃"
              testClass="sl-dialog-layout"
              className="min-w-48"
              // A named option rather than an empty one: an empty value is how a
              // select spells "nothing chosen", and "no layout" is a choice.
              options={[{ id: 'none', label: '레이아웃 없음' }, ...layouts]}
              value={chosen}
              onChange={setChosen}
            />
          </PropertyRow>
        )}

        {/*
          * And the way **in**.
          *
          * Here rather than in a panel of its own, because this dialog is already where a reader
          * thinks about layouts: two of its buttons say what a slide should *follow*, and this one
          * says what the thing being followed **is**. Until now nothing said that at all — a deck
          * could point every slide at "Title and content" and no reader could change what that
          * looked like.
          */}
        {onEdit && (
          <PropertyRow label="정의 편집">
            <span className="flex flex-wrap items-center gap-1">
              {designs.map((design) => (
                <DialogButton
                  key={design.sid}
                  data-design-edit={design.id}
                  onClick={() => {
                    onEdit(design.sid);
                    close();
                  }}
                >
                  {design.kind === 'master' ? `마스터: ${design.name || design.id}` : design.name || design.id}
                </DialogButton>
              ))}
            </span>
          </PropertyRow>
        )}
      </fieldset>
      {busy && <StatusIndicator busy>레이아웃 적용 중</StatusIndicator>}
      {problem && <StatusNotice tone="danger" title={problem} />}
    </Dialog>
  );
}

/**
 * The twelve slots a theme is, and their two faces.
 *
 * ## Why this exists
 *
 * The deck could be *given* a theme from a list and a shape's colour could
 * **reference** a slot — `theme:accent1`, offered as swatches in every colour
 * field — but the slots themselves were whatever the named preset said. So the
 * one thing every real deck starts with, the company's own accent, was the one
 * thing that could not be typed in.
 *
 * The command was ready: `setDeckTheme` takes any subset of the slots and merges
 * it into the deck's theme, making one if there is none. What was missing was
 * somewhere to type.
 *
 * ## A dialog, not a panel row
 *
 * Fourteen controls do not belong in a side panel beside a shape's position, and
 * PowerPoint puts these in a dialog for the same reason. It is also where a
 * reader looks: this product's other two deck-wide settings — the size and the
 * layout — are dialogs already.
 *
 * ## Applied on 적용, not as it is typed
 *
 * A theme re-colours every shape that follows the deck, so twelve fields typed
 * one at a time would be twelve re-colourings and twelve entries of history. The
 * dialog holds the whole set and writes it once, which is also what makes 취소
 * mean something.
 */
const SLOT_LABELS: { slot: ThemeColourSlot; label: string }[] = [
  { slot: 'dark1', label: '어두운 텍스트 1' },
  { slot: 'light1', label: '밝은 배경 1' },
  { slot: 'dark2', label: '어두운 텍스트 2' },
  { slot: 'light2', label: '밝은 배경 2' },
  { slot: 'accent1', label: '강조 1' },
  { slot: 'accent2', label: '강조 2' },
  { slot: 'accent3', label: '강조 3' },
  { slot: 'accent4', label: '강조 4' },
  { slot: 'accent5', label: '강조 5' },
  { slot: 'accent6', label: '강조 6' },
  { slot: 'hyperlink', label: '하이퍼링크' },
  { slot: 'followedHyperlink', label: '방문한 링크' }
];

/** What the theme dialog is told. */
export interface ThemeDialogProps {
  editor: Editor | null;
  open: boolean;
  onClose: () => void;
}

export function ThemeDialog({ editor, open, onClose }: ThemeDialogProps) {
  /** The deck's theme now, with the gaps filled — see `themeNow`. */
  const current = useMemo(() => {
    const store = editor?.dataStore;
    const rootId = editor?.getRootId?.();
    if (!store || !rootId) return themeNow(undefined);
    const doc = { rootId, getNode: (sid: string) => store.getNode(sid) } as never;
    return themeNow(themeFor(doc, undefined));
  }, [editor, editor?.getRootId(), open]);

  const { state: draft, setState: setDraft, busy, problem, close, apply: submit } = useEditorSettings(
    editor, open, () => current, onClose, {
      isEqual: (a, b) => a.majorFont === b.majorFont && a.minorFont === b.minorFont &&
        THEME_COLOUR_SLOTS.every(slot => a.colours[slot] === b.colours[slot])
    }
  );

  /**
   * Which preset the draft is, if it is one.
   *
   * Read from the values and not from the name, so changing one accent takes the
   * list back to nothing chosen rather than leaving it claiming "Office". A
   * truthful third state, like the size dialog's when the numbers are the
   * author's own.
   */
  const preset = DECK_THEMES.find(
    (entry) =>
      entry.majorFont === draft.majorFont &&
      entry.minorFont === draft.minorFont &&
      THEME_COLOUR_SLOTS.every((slot) => entry.colours[slot] === draft.colours[slot])
  );

  const apply = () => {
    if (editor) void submit(() => editor.executeCommand('setDeckTheme', {
      // The name is the preset's when the draft *is* one, and this product's word
      // for "not a preset any more" when it is not. A theme called Office with a
      // red accent is a name that outlived the thing it named.
      name: preset ? preset.name : CUSTOM_THEME,
      ...draft.colours,
      majorFont: draft.majorFont,
      minorFont: draft.minorFont
    }));
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => !next && close()}
      title="테마 색"
      className="sl-theme-dialog"
      description="덱 전체에 적용됩니다. 슬롯을 따라가는 도형만 다시 칠해지고, 자기 색을 고른 도형은 그대로 있습니다."
      footer={
        <>
          <DialogButton disabled={busy} onClick={close}>취소</DialogButton>
          <DialogButton variant="primary" data-theme-apply disabled={busy || !editor} onClick={apply}>
            적용
          </DialogButton>
        </>
      }
    >
      <fieldset disabled={busy} aria-busy={busy || undefined} className="flex flex-col gap-3">
        <PropertyRow label="테마">
          <ChoiceSelect
            ariaLabel="테마 프리셋"
            testClass="sl-dialog-theme"
            className="min-w-48"
            options={DECK_THEMES.map((entry) => ({ id: entry.name, label: entry.name }))}
            value={preset?.name ?? null}
            onChange={(name) => {
              const chosen = DECK_THEMES.find((entry) => entry.name === name);
              // Choosing a preset fills every field, so a reader who has changed
              // three things and wants to start again has one way back.
              if (chosen) setDraft({ ...chosen });
            }}
          />
        </PropertyRow>

        {/*
          Two columns, because twelve stacked rows is a dialog taller than the
          window on a laptop — measured at 14 rows in the size dialog's own shape.
        */}
        <div className="grid grid-cols-2 gap-x-4 gap-y-1" data-theme-slots>
          {SLOT_LABELS.map(({ slot, label }) => (
            <PropertyRow key={slot} label={label}>
              <ColorField
                ariaLabel={label}
                value={draft.colours[slot]}
                onChange={(value) =>
                  setDraft((was) => ({ ...was, colours: { ...was.colours, [slot]: value } }))
                }
              />
            </PropertyRow>
          ))}
        </div>

        {/*
          The two faces. Every theme has them — one for headings and one for
          everything else — and nothing in this product could set either.
        */}
        <PropertyRow label="제목 글꼴">
          <ChoiceSelect
            ariaLabel="제목 글꼴"
            className="min-w-48"
            options={WORD_FONTS.options.map((option) => ({
              id: String(option.value),
              label: option.label
            }))}
            value={draft.majorFont}
            onChange={(family) => setDraft((was) => ({ ...was, majorFont: family }))}
          />
        </PropertyRow>
        <PropertyRow label="본문 글꼴">
          <ChoiceSelect
            ariaLabel="본문 글꼴"
            className="min-w-48"
            options={WORD_FONTS.options.map((option) => ({
              id: String(option.value),
              label: option.label
            }))}
            value={draft.minorFont}
            onChange={(family) => setDraft((was) => ({ ...was, minorFont: family }))}
          />
        </PropertyRow>
      </fieldset>
      {busy && <StatusIndicator busy>테마 적용 중</StatusIndicator>}
      {problem && <StatusNotice tone="danger" title={problem} />}
    </Dialog>
  );
}

/**
 * The decks a reader can start from.
 *
 * ## Why a gallery at all
 *
 * 새로 만들기 makes the least a reader can begin from — one title slide and the definitions
 * under it — and that is the right answer for a *default*. It is the wrong answer for the
 * question a reader actually has, which is "what am I making": a talk has a contents slide
 * and section dividers, a report puts its summary first, a proposal runs from the problem to
 * the ask. Those are five slides in a particular order, and nobody types them from memory.
 *
 * ## The tile draws the document
 *
 * Not a screenshot — a file that goes stale the day the theme changes and has to be
 * regenerated by somebody — and not a hidden editor per tile, which is a whole document
 * loaded for a picture two centimetres wide. `templateSketch` answers where each slide's
 * boxes are **as fractions**, so the tile draws the *shape* of the deck: a title slide, a
 * title with a body, five of them in a row. Which is what a reader is choosing between.
 */
/** What the template dialog is told. */
export interface TemplateDialogProps {
  editor: Editor | null;
  open: boolean;
  onClose: () => void;
  /** A new deck is a new document: the app has a showing and a selection to forget. */
  onOpened?: () => void;
  beforeReplace?: () => Promise<boolean>;
}

export function TemplateDialog({ editor, open, onClose, onOpened, beforeReplace }: TemplateDialogProps) {
  const { chosen, setChosen, busy, problem, close, start } = useTemplateStart(
    editor, open, onClose, onOpened, beforeReplace
  );

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => !next && close()}
      title="템플릿"
      description="고른 것으로 새 프레젠테이션을 시작합니다. 지금 열려 있는 덱은 닫힙니다."
      footer={
        <>
          <DialogButton disabled={busy} onClick={close}>취소</DialogButton>
          <DialogButton variant="primary" data-template-start disabled={busy || !editor} onClick={() => void start()}>
            {busy ? '준비 중…' : '시작'}
          </DialogButton>
        </>
      }
    >
      {problem && <StatusNotice tone="danger" title={problem} />}
      {busy && <StatusIndicator busy>현재 자료 저장 및 새 자료 준비 중</StatusIndicator>}
      <div className="sl-templates">
        {DECK_TEMPLATES.map((template) => {
          const sketch = templateSketch(template.make());
          return (
            <button
              key={template.id}
              type="button"
              disabled={busy}
              className="sl-template"
              data-template={template.id}
              aria-pressed={chosen === template.id}
              onClick={() => setChosen(template.id)}
            >
              {/*
                * The deck's shape: its slides in a row, each with its boxes where the
                * document says they are. Two slides' worth is enough to tell a title deck
                * from a report — the rest is drawn small and says "there are five".
                */}
              <span className="sl-template-slides" aria-hidden>
                {sketch.slice(0, 5).map((slide, index) => (
                  <span key={index} className="sl-template-slide">
                    {slide.boxes.map((box, at) => (
                      <span
                        key={at}
                        className="sl-template-box"
                        data-role={box.role}
                        style={{
                          left: `${box.x * 100}%`,
                          top: `${box.y * 100}%`,
                          width: `${box.width * 100}%`,
                          height: `${box.height * 100}%`
                        }}
                      />
                    ))}
                  </span>
                ))}
              </span>
              <span className="sl-template-name">{template.name}</span>
              <span className="sl-template-note">{template.note}</span>
              <span className="sl-template-count">{sketch.length}장</span>
            </button>
          );
        })}
      </div>
    </Dialog>
  );
}
