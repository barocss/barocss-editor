import { useRef, useState } from 'react';
import {
  Button,
  Choice,
  ColorPicker,
  NumberField,
  PropertyEmpty,
  PropertyGroup,
  PropertyRow,
  StackList,
  StackRow,
  useDismiss,
  useStackOrder,
  type ThemeSwatch
} from '@barocss/office-ui';
import {
  BLEND_MODES,
  addStop,
  backgroundCss,
  imageLayout,
  newEffect,
  newPaint,
  removeStop,
  type Paint,
  type PaintKind,
  type ShapeEffect
} from '@barocss/office-slides';

/**
 * A shape's fills and effects, as stacks.
 *
 * The panel had one fill row and one shadow group, which is what a shape could
 * *have* — and the moment a shape can have several, the panel is a list: rows
 * that can be added to, switched off, reordered and thrown away. That is Figma's
 * shape, and Sketch's, and every design tool's, because the alternative is a
 * form that grows a section per possible fill.
 *
 * ## What each row is
 *
 * A swatch that opens the picker, the thing that says *what kind* of paint it
 * is, an opacity, an eye and a bin. The eye matters more than it looks: turning
 * a fill off and back on is how a designer compares two, and deleting it loses
 * the colour they were comparing.
 *
 * ## Why the gradient bar is here and not in a dialog
 *
 * A gradient is edited *against the shape* — a reader drags a stop and watches
 * the slide, which is the whole reason a stop is a thing you drag rather than a
 * number you type. A dialog would cover the thing being changed.
 */

/**
 * A popover that closes on Escape or on a pointer outside it.
 *
 * The paint and effect editors open in place and had no way out: a reader with
 * the caret in the hex field pressed Escape and *nothing happened* — the
 * overlay's Escape ignores keys from a field, quite rightly, and the popover was
 * not listening at all. So the editor stayed open over the panel and the reader
 * had to find the swatch again to close what they had opened.
 *
 * The same pair of rules the toolbar's palette follows, for the same reason:
 * `pointerdown` rather than `click`, so the panel is gone before the pointer
 * reaches whatever is underneath.
 */
/**
 * The dismiss rule and the reorder drag were both written here and both moved to
 * `@barocss/office-ui` — `useDismiss` and `useStackOrder`. Two copies of each
 * lived in this file (the paints' and the effects'), and a third was coming with
 * a layer panel; the comments that explained them, including the two browser
 * measurements, went with them.
 *
 * The one thing that did *not* generalise is the selector: a gradient's axis is
 * drawn on the slide and is part of this editor, so this file passes
 * `[data-paint-canvas]` as `keep`.
 */
const ON_CANVAS = ['[data-paint-canvas]'];

export function PaintList({
  label,
  paints,
  note,
  themeSwatches,
  varSwatches,
  disabled,
  /**
   * Which row is open, held by the app rather than by the row.
   *
   * Because the *overlay* needs it: a gradient's axis is drawn on the shape
   * while its editor is open, and the shape is not this component's to draw on.
   * A row that kept its own state would be a fact two components need and one
   * of them cannot see.
   */
  editing,
  onEditing,
  stopEditing,
  onStopEditing,
  onChange
}: {
  label: string;
  paints: Paint[];
  themeSwatches?: ThemeSwatch[];
  /** The document's own named colours, offered beside the theme's — the same shape, another list. */
  varSwatches?: ThemeSwatch[];
  disabled?: boolean;
  editing?: number | null;
  onEditing?: (index: number | null) => void;
  /** Which colour stop of the open gradient is selected — the app's; see below. */
  stopEditing?: number;
  onStopEditing?: (index: number) => void;
  onChange: (paints: Paint[]) => void;
  /**
   * Said when the selection does not agree about this list.
   *
   * A stack cannot be blanked the way a number can: "these two shapes have no
   * shared list of fills" is not a list, and an empty panel would hide the very
   * rows a reader is about to replace. So the rows shown are one box's and the
   * note says so — which is what Figma's *Mixed* chip says, in a sentence.
   */
  note?: string;
}) {
  const replace = (index: number, paint: Paint) =>
    onChange(paints.map((entry, at) => (at === index ? paint : entry)));
  const order = useStackOrder(paints, onChange);

  return (
    <PropertyGroup
      label={label}
      action={
        <Button
          square
          ariaLabel={`${label} 추가`}
          disabled={disabled}
          onClick={() => onChange([newPaint('solid'), ...paints])}
        >
          ＋
        </Button>
      }
    >
      {note && <PropertyEmpty>{note}</PropertyEmpty>}
      {paints.length === 0 ? (
        <PropertyEmpty>없음</PropertyEmpty>
      ) : (
        <StackList>
          {paints.map((paint, index) => (
            <PaintRow
              key={index}
              index={index}
              paint={paint}
              themeSwatches={themeSwatches}
              varSwatches={varSwatches}
              disabled={disabled}
              dragging={order.dragging === index}
              onGrab={order.grab(index)}
              open={editing === index}
              onOpen={(next) => onEditing?.(next ? index : null)}
              stopEditing={stopEditing ?? 0}
              onStopEditing={onStopEditing}
              onChange={(next) => replace(index, next)}
              onRemove={() => onChange(paints.filter((_, at) => at !== index))}
            />
          ))}
        </StackList>
      )}
    </PropertyGroup>
  );
}

function PaintRow({
  index,
  paint,
  themeSwatches,
  varSwatches,
  disabled,
  dragging,
  onGrab,
  open,
  onOpen,
  stopEditing,
  onStopEditing,
  onChange,
  onRemove
}: {
  index: number;
  paint: Paint;
  themeSwatches?: ThemeSwatch[];
  /** The document's own named colours, offered beside the theme's — the same shape, another list. */
  varSwatches?: ThemeSwatch[];
  disabled?: boolean;
  dragging?: boolean;
  onGrab?: (event: React.PointerEvent) => void;
  open?: boolean;
  onOpen?: (open: boolean) => void;
  /** The selected colour stop, which the canvas and this row share. */
  stopEditing?: number;
  onStopEditing?: (index: number) => void;
  onChange: (paint: Paint) => void;
  onRemove: () => void;
}) {
  const setOpen = (next: boolean) => onOpen?.(next);
  const editor = useDismiss(open === true, () => setOpen(false), ON_CANVAS);
  const preview = backgroundCss([{ ...paint, visible: true }]) ?? 'transparent';

  /**
   * The editor opens *from the swatch*, rather than living under the row.
   *
   * A gradient's bar, its stop controls and a picker are three tall things, and a
   * shape with three fills would have pushed everything else off the panel —
   * including the fills themselves. Figma opens the same three from the swatch
   * for the same reason, and a popover has the room to be comfortable where a
   * list row does not. `StackRow` draws the box; what is in it is this file's.
   */
  const paintEditor = (
    <>
      {paint.kind === 'solid' ? (
        <ColorPicker
          value={paint.color ?? '#000000'}
          themeSwatches={themeSwatches}
          varSwatches={varSwatches}
          onChange={(colour) => onChange({ ...paint, color: colour })}
        />
      ) : paint.kind === 'image' ? (
        <ImageFill index={index} paint={paint} disabled={disabled} onChange={onChange} />
      ) : (
        <GradientBar
          index={index}
          paint={paint}
          disabled={disabled}
          themeSwatches={themeSwatches}
          varSwatches={varSwatches}
          chosen={stopEditing ?? 0}
          onChosen={onStopEditing}
          onChange={onChange}
        />
      )}

      {/*
        * How this layer mixes with the ones under it.
        *
        * In the editor rather than the row, because it is the setting a reader
        * touches least and the row is already five controls wide — and because it
        * only *means* anything when there is a layer beneath, which is the moment
        * they are in here arranging them.
        */}
      <PropertyRow label="혼합">
        <Choice
          ariaLabel={`${index + 1}번 혼합 모드`}
          value={paint.blend ?? 'normal'}
          disabled={disabled}
          onChange={(blend) => onChange({ ...paint, blend: blend as Paint['blend'] })}
        >
          {BLEND_MODES.map((mode) => (
            <option key={mode} value={mode}>
              {BLEND_LABELS[mode] ?? mode}
            </option>
          ))}
        </Choice>
      </PropertyRow>
    </>
  );

  return (
    <StackRow
      index={index}
      name="채우기"
      /**
       * The whole row is the dismiss host, not just the editor — see
       * `useDismiss`, which carries the measurement that decided it.
       */
      hostRef={editor}
      disabled={disabled}
      dragging={dragging}
      onGrab={onGrab}
      visible={paint.visible !== false}
      onVisible={(visible) => onChange({ ...paint, visible })}
      onRemove={onRemove}
      data={{ paint: String(index) }}
      editor={open ? paintEditor : undefined}
    >
        <Button
          square
          ariaLabel={`${index + 1}번 채우기`}
          data={{ 'paint-swatch': String(index) }}
          disabled={disabled}
          className="p-0.5"
          onClick={() => setOpen(open !== true)}
        >
          <span className="block h-full w-full rounded-sm" style={{ background: preview }} />
        </Button>

        <Choice
          ariaLabel={`${index + 1}번 채우기 종류`}
          value={paint.kind}
          disabled={disabled}
          onChange={(kind) => onChange(changeKind(paint, kind as PaintKind))}
        >
          {/*
            * Short names, because the row has five controls in 288 pixels and
            * "선형 그라디언트" pushed the opacity box down to three characters —
            * it read "10C". The kind is also the one control whose *swatch* is
            * right beside it, so the word carries less than it looks.
            */}
          <option value="solid">단색</option>
          <option value="linear">선형</option>
          <option value="radial">원형</option>
          <option value="angular">각형</option>
          <option value="image">이미지</option>
        </Choice>

        <NumberField
          ariaLabel={`${index + 1}번 불투명도`}
          min={0}
          max={100}
          value={Math.round((paint.opacity ?? 1) * 100)}
          disabled={disabled}
          className="w-12 flex-none"
          onCommit={(percent) =>
            onChange({ ...paint, opacity: Math.min(100, Math.max(0, percent)) / 100 })
          }
        />

    </StackRow>
  );
}


/**
 * A picture as a fill: the file, and how it sits in the shape.
 *
 * Read as a data URI for the same reason a `picture` node is — a blob URL dies
 * with the page, so a deck saved with one comes back with a broken fill and no
 * way to tell what it had been.
 */
function ImageFill({
  index,
  paint,
  disabled,
  onChange
}: {
  index: number;
  paint: Paint;
  disabled?: boolean;
  onChange: (paint: Paint) => void;
}) {
  const choose = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        const src = String(reader.result ?? '');
        if (src) onChange({ ...paint, src });
      };
      reader.readAsDataURL(file);
    };
    input.click();
  };

  return (
    <div className="flex flex-col gap-1.5">
      <div
        aria-hidden
        className="h-20 rounded border border-neutral-200 bg-neutral-100 dark:border-neutral-700 dark:bg-neutral-800"
        style={
          paint.src
            ? {
                backgroundImage: `url("${paint.src}")`,
                backgroundSize: imageLayout(paint).size,
                backgroundRepeat: imageLayout(paint).repeat,
                backgroundPosition: 'center'
              }
            : undefined
        }
      />
      <div className="flex items-center gap-1.5">
        <Button
          ariaLabel={`${index + 1}번 이미지 선택`}
          disabled={disabled}
          onClick={choose}
          className="flex-1"
        >
          {paint.src ? '바꾸기' : '이미지 선택'}
        </Button>
        <Choice
          ariaLabel={`${index + 1}번 이미지 맞춤`}
          value={paint.fit ?? 'cover'}
          disabled={disabled}
          onChange={(fit) => onChange({ ...paint, fit: fit as Paint['fit'] })}
        >
          <option value="cover">채우기</option>
          <option value="contain">맞추기</option>
          <option value="stretch">늘이기</option>
          <option value="tile">바둑판</option>
        </Choice>
      </div>
    </div>
  );
}

/** The blend modes in a reader's words, in the order CSS lists them. */
const BLEND_LABELS: Record<string, string> = {
  normal: '기본',
  multiply: '곱하기',
  screen: '스크린',
  overlay: '오버레이',
  darken: '어둡게',
  lighten: '밝게',
  'color-dodge': '컬러 닷지',
  'color-burn': '컬러 번',
  'hard-light': '하드 라이트',
  'soft-light': '소프트 라이트',
  difference: '차이',
  exclusion: '제외',
  hue: '색조',
  saturation: '채도',
  color: '색상',
  luminosity: '광도'
};

/**
 * Turning one kind of paint into another without losing what the reader chose.
 *
 * A solid becoming a gradient keeps its colour as the first stop, and a gradient
 * becoming a solid keeps its first stop as the colour. The alternative — reset
 * to a default — throws away the one thing they had decided, which is what makes
 * a "kind" dropdown feel like it is fighting you.
 */
function changeKind(paint: Paint, kind: PaintKind): Paint {
  if (kind === paint.kind) return paint;

  if (kind === 'solid') {
    return {
      kind,
      color: paint.stops?.[0]?.color ?? paint.color ?? '#000000',
      opacity: paint.opacity,
      visible: paint.visible
    };
  }

  if (kind === 'image') {
    // The picture is chosen next; the kind is the reader saying what they are
    // about to do, and a fill with no picture draws nothing until they do it.
    return { kind, src: paint.src, fit: paint.fit ?? 'cover', opacity: paint.opacity, blend: paint.blend, visible: paint.visible };
  }

  if (paint.kind === 'solid' || paint.kind === 'image') {
    const base = newPaint(kind, paint.color ?? '#93c5fd');
    return { ...base, opacity: paint.opacity, blend: paint.blend, visible: paint.visible };
  }

  // Gradient to gradient: only the way it is drawn changes.
  return { ...paint, kind };
}

/**
 * The gradient bar: the stops, where they are, and the angle.
 *
 * Dragging a stop is the gesture — a gradient is a thing you *see* the shape of,
 * and a table of offsets is a description of one. Clicking the bar adds a stop
 * where the pointer is, which is how every tool does it and the only way to add
 * one where you meant.
 */
function GradientBar({
  index,
  paint,
  disabled,
  themeSwatches,
  varSwatches,
  /**
   * Which stop is selected — the *app's*, not this bar's.
   *
   * It was `useState(0)` here, and that was the fault: a gradient has one selected
   * stop and two places that show it, so a reader clicking a dot on the shape left
   * this picker editing a different one. One question with two answers, which is
   * the shape of mistake this repository keeps finding in its own code.
   */
  chosen,
  onChosen,
  onChange
}: {
  index: number;
  paint: Paint;
  disabled?: boolean;
  themeSwatches?: ThemeSwatch[];
  /** The document's own named colours, offered beside the theme's — the same shape, another list. */
  varSwatches?: ThemeSwatch[];
  chosen: number;
  onChosen?: (index: number) => void;
  onChange: (paint: Paint) => void;
}) {
  const stops = paint.stops ?? [];
  const bar = useRef<HTMLDivElement>(null);
  const setChosen = (at: number) => onChosen?.(at);

  const at = (event: { clientX: number }): number => {
    const box = bar.current?.getBoundingClientRect();
    if (!box) return 0;
    return Math.min(1, Math.max(0, (event.clientX - box.left) / box.width));
  };

  const setStops = (next: typeof stops) =>
    onChange({ ...paint, stops: [...next].sort((a, b) => a.offset - b.offset) });

  const drag = (event: React.PointerEvent, stopIndex: number) => {
    event.preventDefault();
    event.stopPropagation();
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    setChosen(stopIndex);

    const move = (pointer: PointerEvent) => {
      const offset = at(pointer);
      onChange({
        ...paint,
        // Not re-sorted mid-drag: a stop that overtook its neighbour would
        // change index under the pointer and the drag would jump to the other
        // one. The sort happens when the pointer is let go.
        stops: stops.map((stop, index) => (index === stopIndex ? { ...stop, offset } : stop))
      });
    };
    const up = (pointer: PointerEvent) => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      const offset = at(pointer);
      setStops(stops.map((stop, index) => (index === stopIndex ? { ...stop, offset } : stop)));
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  const stop = stops[chosen] ?? stops[0];

  return (
    <div className="flex flex-col gap-1" data-gradient={index}>
      <div
        ref={bar}
        data-gradient-bar={index}
        className="relative h-5 rounded-[var(--ou-radius)] border border-[color:var(--ou-line)]"
        style={{
          background: `linear-gradient(90deg, ${stops
            .map((entry) => `${entry.color} ${Math.round(entry.offset * 100)}%`)
            .join(', ')})`
        }}
        onDoubleClick={(event) => {
          if (disabled) return;
          // A double-click adds one where the pointer is — `addStop`, shared with
          // the axis on the canvas, because it is one gesture in two places.
          setStops(addStop(stops, at(event)));
        }}
      >
        {stops.map((entry, stopIndex) => (
          <button
            key={stopIndex}
            type="button"
            data-stop={stopIndex}
            aria-label={`${index + 1}번 색 지점 ${stopIndex + 1}`}
            disabled={disabled}
            onPointerDown={(event) => drag(event, stopIndex)}
            className={cnStop(stopIndex === chosen)}
            style={{ left: `${entry.offset * 100}%`, background: entry.color }}
          />
        ))}
      </div>

      <div className="flex items-center gap-1.5">
        <NumberField
          ariaLabel={`${index + 1}번 각도`}
          min={0}
          max={360}
          step={15}
          value={Math.round(paint.angle ?? 180)}
          disabled={disabled || paint.kind === 'radial'}
          onCommit={(angle) => onChange({ ...paint, angle })}
          className="w-14 flex-none"
          suffix="°"
        />

        {stop && (
          <>
            <NumberField
              ariaLabel={`${index + 1}번 지점 위치`}
              min={0}
              max={100}
              value={Math.round(stop.offset * 100)}
              disabled={disabled}
              onCommit={(percent) =>
                setStops(
                  stops.map((entry, entryIndex) =>
                    entryIndex === chosen
                      ? { ...entry, offset: Math.min(100, Math.max(0, percent)) / 100 }
                      : entry
                  )
                )
              }
              className="w-14 flex-none"
              suffix="%"
            />

            <Button
              square
              ariaLabel={`${index + 1}번 지점 삭제`}
              // Two stops is the least a gradient can be; taking one away would
              // leave a colour pretending to be a gradient.
              disabled={disabled || stops.length <= 2}
              onClick={() => setStops(removeStop(stops, chosen))}
              className="ml-auto"
            >
              ␡
            </Button>
          </>
        )}
      </div>

      {stop && (
        <ColorPicker
          value={stop.color}
          themeSwatches={themeSwatches}
          varSwatches={varSwatches}
          onChange={(colour) =>
            setStops(
              stops.map((entry, entryIndex) =>
                entryIndex === chosen ? { ...entry, color: colour } : entry
              )
            )
          }
        />
      )}
    </div>
  );
}

const cnStop = (selected: boolean) =>
  [
    'absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2',
    selected ? 'border-sky-500 shadow' : 'border-white shadow-sm'
  ].join(' ');

/**
 * A shape's effects: shadows and blurs, in a list like the fills.
 *
 * The same reasoning one property along. A card with a soft shadow *and* a hard
 * key line is two effects, and a group with one shadow attribute cannot say it —
 * so the panel had four rows describing one shadow, and this has a row per
 * effect with the four inside it.
 */
export function EffectList({
  effects,
  themeSwatches,
  varSwatches,
  disabled,
  note,
  onChange
}: {
  effects: ShapeEffect[];
  themeSwatches?: ThemeSwatch[];
  /** The document's own named colours, offered beside the theme's — the same shape, another list. */
  varSwatches?: ThemeSwatch[];
  disabled?: boolean;
  /** Said when the selection does not agree about this list — see `PaintList`. */
  note?: string;
  onChange: (effects: ShapeEffect[]) => void;
}) {
  const replace = (index: number, effect: ShapeEffect) =>
    onChange(effects.map((entry, at) => (at === index ? effect : entry)));
  const order = useStackOrder(effects, onChange);

  return (
    <PropertyGroup
      label="효과"
      action={
        <Button
          square
          ariaLabel="효과 추가"
          disabled={disabled}
          onClick={() => onChange([...effects, newEffect('drop')])}
        >
          ＋
        </Button>
      }
    >
      {note && <PropertyEmpty>{note}</PropertyEmpty>}
      {effects.length === 0 ? (
        <PropertyEmpty>없음</PropertyEmpty>
      ) : (
        <StackList>
          {effects.map((effect, index) => (
            <EffectRow
              key={index}
              index={index}
              effect={effect}
              themeSwatches={themeSwatches}
              varSwatches={varSwatches}
              disabled={disabled}
              dragging={order.dragging === index}
              onGrab={order.grab(index)}
              onChange={(next) => replace(index, next)}
              onRemove={() => onChange(effects.filter((_, at) => at !== index))}
            />
          ))}
        </StackList>
      )}
    </PropertyGroup>
  );
}

function EffectRow({
  index,
  effect,
  themeSwatches,
  varSwatches,
  disabled,
  dragging,
  onGrab,
  onChange,
  onRemove
}: {
  index: number;
  effect: ShapeEffect;
  themeSwatches?: ThemeSwatch[];
  /** The document's own named colours, offered beside the theme's — the same shape, another list. */
  varSwatches?: ThemeSwatch[];
  disabled?: boolean;
  dragging?: boolean;
  onGrab?: (event: React.PointerEvent) => void;
  onChange: (effect: ShapeEffect) => void;
  onRemove: () => void;
}) {
  const [open, setOpen] = useState(false);
  const editorHost = useDismiss(open, () => setOpen(false), ON_CANVAS);
  const isBlur = effect.kind === 'blur';

  /** Twips in the document, points in the panel: 20 twips is a point. */
  const pt = (twips: number | undefined) => Math.round(((twips ?? 0) / 20) * 10) / 10;
  const twips = (points: number) => Math.round(points * 20);

  return (
    <StackRow
      index={index}
      name="효과"
      // The whole row, for the reason `useDismiss` gives.
      hostRef={editorHost}
      disabled={disabled}
      dragging={dragging}
      onGrab={onGrab}
      visible={effect.visible !== false}
      onVisible={(visible) => onChange({ ...effect, visible })}
      onRemove={onRemove}
      data={{ effect: String(index) }}
      editor={
        open && !isBlur ? (
          <ColorPicker
            value={effect.color ?? 'rgba(0, 0, 0, 0.25)'}
            themeSwatches={themeSwatches}
            varSwatches={varSwatches}
            onChange={(colour) => onChange({ ...effect, color: colour })}
          />
        ) : undefined
      }
    >
      <span className="flex min-w-0 flex-1 flex-col gap-1">
      <span className="flex items-center gap-1.5">
        <Choice
          ariaLabel={`${index + 1}번 효과 종류`}
          value={effect.kind}
          disabled={disabled}
          onChange={(kind) => onChange({ ...effect, kind: kind as ShapeEffect['kind'] })}
        >
          <option value="drop">바깥 그림자</option>
          <option value="inner">안쪽 그림자</option>
          <option value="blur">흐리게</option>
        </Choice>

        {!isBlur && (
          <Button
            square
            ariaLabel={`${index + 1}번 효과 색`}
            data={{ 'effect-swatch': String(index) }}
            disabled={disabled}
            className="p-0.5"
            onClick={() => setOpen((wasOpen) => !wasOpen)}
          >
            <span className="block h-full w-full rounded-sm" style={{ background: effect.color }} />
          </Button>
        )}
      </span>

      <div className="flex items-center gap-1">
        {!isBlur && (
          <>
            <NumberBox
              label={`${index + 1}번 가로`}
              value={pt(effect.x)}
              disabled={disabled}
              onChange={(value) => onChange({ ...effect, x: twips(value) })}
            />
            <NumberBox
              label={`${index + 1}번 세로`}
              value={pt(effect.y)}
              disabled={disabled}
              onChange={(value) => onChange({ ...effect, y: twips(value) })}
            />
          </>
        )}
        <NumberBox
          label={`${index + 1}번 흐림`}
          value={pt(effect.blur)}
          disabled={disabled}
          onChange={(value) => onChange({ ...effect, blur: twips(Math.max(0, value)) })}
        />
        {!isBlur && (
          <NumberBox
            label={`${index + 1}번 확산`}
            value={pt(effect.spread)}
            disabled={disabled}
            onChange={(value) => onChange({ ...effect, spread: twips(value) })}
          />
        )}
      </div>

      </span>
    </StackRow>
  );
}

function NumberBox({
  label,
  value,
  disabled,
  onChange
}: {
  label: string;
  value: number;
  disabled?: boolean;
  onChange: (value: number) => void;
}) {
  return (
    <NumberField
      ariaLabel={label}
      step={0.5}
      value={value}
      disabled={disabled}
      onCommit={onChange}
      className="min-w-0"
    />
  );
}

/** Re-exported so the panel can lay a row out beside them. */
export { PropertyRow };
