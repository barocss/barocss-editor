import * as RadixToolbar from '@radix-ui/react-toolbar';
import * as RadixTooltip from '@radix-ui/react-tooltip';
import { Tip } from './tip';
import { createContext, useContext } from 'react';
import { cn } from './cn';
import { STATE } from './controls';

/**
 * On, off, or partly.
 *
 * Declared here rather than imported from the editor, because this package is
 * pure UI: a three-state toggle is a three-state toggle whether the thing it
 * describes is a mark on a selection, a permission or a filter. `editor-core`'s
 * `MarkState` is the identical union, so a caller passing one still typechecks —
 * and importing it would have made a button that draws three states depend on a
 * document model it never touches. It was this package's only tie to the editor;
 * with it gone, `office-ui` has no editor dependency at all.
 */
export type ToggleState = 'on' | 'mixed' | 'off';

/**
 * Whether there is a toolbar above this.
 *
 * A Radix toolbar button is a roving-focus **item**, and an item outside its group throws:
 * `RovingFocusGroupItem must be used within RovingFocusGroup`. `ColorPalette` draws one, so the
 * library had a component that crashed the page unless it happened to be inside a `Toolbar` — found
 * the first time a gallery drew every control on one page, and invisible until then because the
 * three products only ever put a palette in a ribbon.
 *
 * A prop would have made this the caller's problem to remember. It is not: whether there is a
 * toolbar around something is a fact the toolbar knows and nobody else does, so it says so, and a
 * control that wants roving focus takes it when it is there and a plain button when it is not.
 */
const InToolbar = createContext(false);

/** For a control that draws a roving-focus item — see `InToolbar`. */
export function useInToolbar(): boolean {
  return useContext(InToolbar);
}

/**
 * The toolbar shell, shared by every product in the suite.
 *
 * Radix rather than plain buttons, for the parts that are tedious to get right
 * and invisible when wrong: one tab stop for the whole toolbar with the arrow
 * keys moving between controls, focus that survives a disabled button, and a
 * tooltip that does not trap the pointer.
 *
 * It wraps. A ribbon is a band of grouped controls that reflows to the width it
 * is given — one row on a wide window, several on a narrow one — and this was a
 * single row that ran off the edge instead: at 1200px the table buttons were
 * past the right edge of the screen and there was no way to reach them. Wrapping
 * is what makes every control reachable at every width, and it is the whole
 * difference between a ribbon and a strip.
 */
export function Toolbar({
 children,
  className,
  label = 'Formatting'
}: {
 children: React.ReactNode;
  /**
   * The product's own hook class.
   *
   * Left to the caller rather than baked in: this used to carry `w-toolbar`,
   * which is Word's prefix, and a suite component that names one product is a
 * component the next product works around.
   */
  className?: string;
  label?: string;
}) {
  return (
    <RadixTooltip.Provider delayDuration={400}>
      <RadixToolbar.Root
        aria-label={label}
        className={cn(
          'sticky top-0 z-[var(--ou-z-toolbar)] flex flex-wrap items-center gap-x-1 gap-y-1',
          'border-b border-[color:var(--ou-line)] bg-[color:var(--ou-panel)] px-4 py-1.5',
          className
        )}
      >
        <InToolbar.Provider value={true}>{children}</InToolbar.Provider>
      </RadixToolbar.Root>
    </RadixTooltip.Provider>
  );
}

/**
 * A group of controls, which wraps as a unit.
 *
 * `shrink-0` on purpose: a group squeezed to fit is a row of half-visible
 * buttons, and moving the whole group to the next line is what a reader can
 * still use.
 */
export function ToolbarGroup({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <div data-group={id} className="office-toolbar-group flex shrink-0 items-center gap-0.5 px-1.5">
 {children}
    </div>
  );
}

export function ToolbarSeparator() {
  return (
    <RadixToolbar.Separator
      className="mx-1 h-5 w-px shrink-0 bg-[color:var(--ou-line)]"
 />
  );
}

/**
 * **One of these**, drawn as one control rather than as several toggles.
 *
 * ## Why this is not `ToolbarToggle` used twice
 *
 * Because they are different questions and a reader has to be able to tell which they are being
 * asked. Measured in the site builder before this existed: 선택/텍스트 (a tool mode — *one* of them
 * is on, always) and 데스크톱/태블릿/모바일 (which boards are shown — *any* of them, none of them)
 * were both a row of `ToolbarToggle`s with an accent border, side by side on one strip. Nothing said
 * that turning off 태블릿 is allowed and turning off 선택 is not, and a reader who tried the second
 * found out by nothing happening.
 *
 * A segmented control is what every platform draws for the first question, and it says it with
 * **shape**: one enclosure, the choices inside it, the current one lifted. There is visibly one
 * thing here with several settings, rather than several things that happen to be adjacent.
 *
 * `radiogroup` rather than a row of buttons, because that is the same sentence for a screen reader:
 * a reader hearing "선택, 선택됨, 1 / 2" knows there is a second answer and that they have the first.
 */
export function SegmentedControl<Id extends string>({
  id,
  label,
  value,
  options,
  onChange
}: {
  id: string;
  /** What the *choice* is, not what the options are — "포인터 모드". */
  label: string;
  value: Id;
  options: { id: Id; label: string; shortcut?: string }[];
  onChange: (id: Id) => void;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      data-segmented={id}
      className={cn(
        'inline-flex shrink-0 items-center gap-0.5 rounded-[var(--ou-radius)] p-0.5',
        // The enclosure is the whole point: it is what makes these one control and not three.
        'bg-[color:var(--ou-ground)]'
      )}
    >
      {options.map((one) => (
        <button
          key={one.id}
          type="button"
          role="radio"
          aria-checked={value === one.id}
          aria-keyshortcuts={one.shortcut}
          data-segment={one.id}
          data-state={value === one.id ? 'on' : 'off'}
          // Pointer down, like every other control on this bar: a click moves focus out of the
          // editor first, and the selection a command needs goes with it.
          onPointerDown={(event) => {
            event.preventDefault();
            onChange(one.id);
          }}
          className={cn(
            'h-[calc(var(--ou-control-h)-4px)] rounded-[calc(var(--ou-radius)-1px)] px-2',
            'text-[length:var(--ou-text)] text-[color:var(--ou-muted)]',
            STATE,
            /*
             * The chosen one is **lifted**, not outlined. An outline is what a toggle uses for *on*,
             * and reusing it here would put the two questions back into one vocabulary — which is
             * the thing this control exists to separate.
             */
            value === one.id &&
              'bg-[color:var(--ou-panel)] text-[color:var(--ou-ink)] shadow-[var(--ou-lift-1)]'
          )}
        >
          {one.label}
        </button>
      ))}
    </div>
  );
}

/**
 * A control with three states.
 *
 * `mixed` is a real value here, not a missing one: a selection across text that
 * is partly bold is neither bold nor not bold, and `aria-pressed="mixed"` is
 * what tells a screen reader "partially pressed". Drawn with a hatch so that it
 * is distinguishable from both on and off without reading anything.
 */
export function ToolbarToggle({
 id,
  label,
  shortcut,
  state,
  disabled,
  onActivate,
  children
}: {
  id: string;
  label: string;
  /**
   * The chord this control is bound to, drawn beside its name.
   *
   * Every professional tool says this here, and for one reason: a toolbar is how
   * a reader *finds* a command and a keyboard is how they use it a second time.
   * A tool that never shows the chord teaches nobody the chord.
   *
   * Already formatted — `⌘D` or `Ctrl+D` — because which of those to write is a
   * fact about the reader's platform and not about this component. It also lands
   * in `aria-keyshortcuts`, which is the attribute that means this rather than a
   * longer accessible name.
   */
  shortcut?: string;
  state: ToggleState;
  disabled?: boolean;
  onActivate: () => void;
  children: React.ReactNode;
}) {
  return (
    <Tip label={label} shortcut={shortcut}>
        <RadixToolbar.Button
          data-control={id}
          data-state={state}
          aria-label={label}
          aria-keyshortcuts={shortcut}
          aria-pressed={state === 'on' ? 'true' : state === 'mixed' ? 'mixed' : 'false'}
 disabled={disabled}
          // Pointer down, not click: a click moves focus out of the editor
          // first, and the selection the command needs goes with it.
          onPointerDown={(event) => {
            event.preventDefault();
            onActivate();
          }}
          className={cn(
            'inline-flex h-[var(--ou-control-h)] min-w-[var(--ou-control-h)] items-center justify-center rounded-[var(--ou-radius)] border border-transparent',
 'text-sm hover:bg-[color:var(--ou-ground)]',
 STATE,
 'disabled:pointer-events-none disabled:opacity-40',
            /*
             * The **suite's** accent, not Tailwind's sky.
             *
             * These were `sky-100` / `sky-950` while `--ou-accent` is `blue-600`: two accents in one
             * toolbar, and the one a product remapped was not the one it saw. Worse in the dark,
             * where a `dark:` variant answers the *system* and a product's own theme switch cannot
             * reach it — measured on a gallery page with a switch on it, where a pressed button kept
             * its pale blue wash and the icon inside it disappeared.
             *
             * `--ou-accent-soft` is that wash, and it changes with the theme: one accent, two values.
             */
 'data-[state=on]:border-[color:var(--ou-accent)] data-[state=on]:bg-[color:var(--ou-accent-soft)]',
 'data-[state=mixed]:border-[color:var(--ou-accent)] data-[state=mixed]:bg-[repeating-linear-gradient(135deg,var(--ou-accent-soft),var(--ou-accent-soft)_3px,transparent_3px,transparent_6px)]'
          )}
        >
          {children}
        </RadixToolbar.Button>
    </Tip>
  );
}
