import * as RadixToolbar from '@radix-ui/react-toolbar';
import * as RadixTooltip from '@radix-ui/react-tooltip';
import type { MarkState } from '@barocss/editor-core';
import { cn } from './cn';

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
          'sticky top-0 z-20 flex flex-wrap items-center gap-x-1 gap-y-1',
          'border-b border-neutral-300 bg-white px-4 py-1.5',
          'dark:border-neutral-700 dark:bg-neutral-900',
          className
        )}
      >
        {children}
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
      className="mx-1 h-5 w-px shrink-0 bg-neutral-300 dark:bg-neutral-700"
    />
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
  state,
  disabled,
  onActivate,
  children
}: {
  id: string;
  label: string;
  state: MarkState;
  disabled?: boolean;
  onActivate: () => void;
  children: React.ReactNode;
}) {
  return (
    <RadixTooltip.Root>
      <RadixTooltip.Trigger asChild>
        <RadixToolbar.Button
          data-control={id}
          data-state={state}
          aria-label={label}
          aria-pressed={state === 'on' ? 'true' : state === 'mixed' ? 'mixed' : 'false'}
          disabled={disabled}
          // Pointer down, not click: a click moves focus out of the editor
          // first, and the selection the command needs goes with it.
          onPointerDown={(event) => {
            event.preventDefault();
            onActivate();
          }}
          className={cn(
            'inline-flex h-7 min-w-7 items-center justify-center rounded border border-transparent',
            'text-sm hover:bg-neutral-100 dark:hover:bg-neutral-800',
            'disabled:pointer-events-none disabled:opacity-40',
            'data-[state=on]:border-sky-300 data-[state=on]:bg-sky-100',
            'dark:data-[state=on]:border-sky-700 dark:data-[state=on]:bg-sky-950',
            'data-[state=mixed]:border-sky-300 data-[state=mixed]:bg-[repeating-linear-gradient(135deg,theme(colors.sky.100),theme(colors.sky.100)_3px,transparent_3px,transparent_6px)]'
          )}
        >
          {children}
        </RadixToolbar.Button>
      </RadixTooltip.Trigger>
      <RadixTooltip.Portal>
        <RadixTooltip.Content
          sideOffset={6}
          className="rounded bg-neutral-900 px-2 py-1 text-xs text-white shadow dark:bg-neutral-100 dark:text-neutral-900"
        >
          {label}
          <RadixTooltip.Arrow className="fill-neutral-900 dark:fill-neutral-100" />
        </RadixTooltip.Content>
      </RadixTooltip.Portal>
    </RadixTooltip.Root>
  );
}
