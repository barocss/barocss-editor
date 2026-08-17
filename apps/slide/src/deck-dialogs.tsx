import { useMemo, useState } from 'react';
import type { Editor } from '@barocss/editor-core';
import {
  ChoiceSelect,
  Dialog,
  DialogButton,
  PropertyNumber,
  PropertyRow
} from '@barocss/office-ui';
import {
  SLIDE_16_9,
  SLIDE_4_3,
  pxToTwip,
  slideSize,
  twipToPx,
  type Slide
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
