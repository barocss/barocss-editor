import { useMemo, useState } from 'react';
import type { Editor } from '@barocss/editor-core';
import {
  ChoiceSelect,
  ColorField,
  Dialog,
  DialogButton,
  PropertyNumber,
  PropertyRow
} from '@barocss/office-ui';
/** The suite's font list — shared content, see the ribbon's note about it. */
import { WORD_FONTS } from '@barocss/office-word';
import {
  CUSTOM_THEME,
  DECK_THEMES,
  SLIDE_16_9,
  SLIDE_4_3,
  THEME_COLOUR_SLOTS,
  pxToTwip,
  slideSize,
  themeFor,
  themeNow,
  twipToPx,
  type Slide,
  type ThemeColourSlot
} from '@barocss/office-slides';

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

export function SlideSizeDialog({
  editor,
  slides,
  open,
  onClose
}: {
  editor: Editor | null;
  slides: Slide[];
  open: boolean;
  onClose: () => void;
}) {
  /**
   * What the deck is now — read from the first slide, because that is what
   * "the deck's size" means when every slide carries its own.
   */
  const current = useMemo(() => {
    const store = (editor as any)?.dataStore;
    const first = slides[0] ? store?.getNode(slides[0].sid) : undefined;
    return slideSize(first?.attributes);
  }, [editor, slides, open]);

  const [size, setSize] = useState(current);
  // Reopened, so it shows the deck rather than whatever was typed last time.
  const [was, setWas] = useState(open);
  if (was !== open) {
    setWas(open);
    if (open) setSize(current);
  }

  const preset =
    PRESETS.find((entry) => entry.width === size.width && entry.height === size.height)?.id ??
    null;

  const apply = () => {
    void (editor as any)?.executeCommand?.('setDeckSize', size);
    onClose();
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => !next && onClose()}
      title="슬라이드 크기"
      description="덱의 모든 슬라이드에 적용됩니다. 슬라이드 위의 내용은 그대로 있습니다."
      footer={
        <>
          <DialogButton onClick={onClose}>취소</DialogButton>
          <DialogButton variant="primary" data-size-apply onClick={apply}>
            적용
          </DialogButton>
        </>
      }
    >
      <div className="flex flex-col gap-3">
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
            value={twipToPx(size.width)}
            onCommit={(value) => setSize((was) => ({ ...was, width: Math.round(pxToTwip(value)) }))}
          />
        </PropertyRow>
        <PropertyRow label="높이">
          <PropertyNumber
            ariaLabel="높이"
            suffix="px"
            value={twipToPx(size.height)}
            onCommit={(value) => setSize((was) => ({ ...was, height: Math.round(pxToTwip(value)) }))}
          />
        </PropertyRow>
      </div>
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
export function SlideLayoutDialog({
  editor,
  current,
  open,
  onClose
}: {
  editor: Editor | null;
  current?: string;
  open: boolean;
  onClose: () => void;
}) {
  /** Every layout the deck defines, read from `resources`. */
  const layouts = useMemo(() => {
    const store = (editor as any)?.dataStore;
    const rootId = (editor as any)?.getRootId?.();
    if (!store || !rootId) return [] as { id: string; label: string }[];

    const root = store.getNode(rootId);
    const found: { id: string; label: string }[] = [];

    for (const sid of (root?.content ?? []) as string[]) {
      const node = store.getNode(sid);
      if (node?.stype !== 'resources') continue;
      for (const child of (node.content ?? []) as string[]) {
        const layout = store.getNode(child);
        if (layout?.stype !== 'slideLayout') continue;
        const id = layout.attributes?.id;
        if (typeof id === 'string') {
          found.push({ id, label: String(layout.attributes?.name ?? id) });
        }
      }
    }
    return found;
  }, [editor, open]);

  const following = useMemo(() => {
    const store = (editor as any)?.dataStore;
    const slide = current ? store?.getNode(current) : undefined;
    const id = slide?.attributes?.layoutId;
    return typeof id === 'string' ? id : 'none';
  }, [editor, current, open]);

  const [chosen, setChosen] = useState(following);
  const [was, setWas] = useState(open);
  if (was !== open) {
    setWas(open);
    if (open) setChosen(following);
  }

  const apply = () => {
    void (editor as any)?.executeCommand?.('setSlideLayout', {
      slideId: current,
      layoutId: chosen === 'none' ? undefined : chosen
    });
    onClose();
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => !next && onClose()}
      title="레이아웃"
      description="새 슬라이드가 이 레이아웃의 자리 표시자로 시작합니다."
      footer={
        <>
          <DialogButton onClick={onClose}>취소</DialogButton>
          <DialogButton variant="primary" data-layout-apply onClick={apply}>
            적용
          </DialogButton>
        </>
      }
    >
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

export function ThemeDialog({
  editor,
  open,
  onClose
}: {
  editor: Editor | null;
  open: boolean;
  onClose: () => void;
}) {
  /** The deck's theme now, with the gaps filled — see `themeNow`. */
  const current = useMemo(() => {
    const store = (editor as any)?.dataStore;
    const rootId = (editor as any)?.getRootId?.();
    if (!store || !rootId) return themeNow(undefined);
    const doc = { rootId, getNode: (sid: string) => store.getNode(sid) } as never;
    return themeNow(themeFor(doc, undefined));
  }, [editor, open]);

  const [draft, setDraft] = useState(current);
  // Reopened, so it shows the deck rather than whatever was typed last time —
  // the same rule the size dialog beside it follows.
  const [was, setWas] = useState(open);
  if (was !== open) {
    setWas(open);
    if (open) setDraft(current);
  }

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
    void (editor as any)?.executeCommand?.('setDeckTheme', {
      // The name is the preset's when the draft *is* one, and this product's word
      // for "not a preset any more" when it is not. A theme called Office with a
      // red accent is a name that outlived the thing it named.
      name: preset ? preset.name : CUSTOM_THEME,
      ...draft.colours,
      majorFont: draft.majorFont,
      minorFont: draft.minorFont
    });
    onClose();
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => !next && onClose()}
      title="테마 색"
      description="덱 전체에 적용됩니다. 슬롯을 따라가는 도형만 다시 칠해지고, 자기 색을 고른 도형은 그대로 있습니다."
      footer={
        <>
          <DialogButton onClick={onClose}>취소</DialogButton>
          <DialogButton variant="primary" data-theme-apply onClick={apply}>
            적용
          </DialogButton>
        </>
      }
    >
      <div className="flex flex-col gap-3">
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
      </div>
    </Dialog>
  );
}
