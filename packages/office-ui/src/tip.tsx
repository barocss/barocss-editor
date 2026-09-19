import * as RadixTooltip from '@radix-ui/react-tooltip';
import { cn } from './cn';
import { createContext, useContext, useCallback, useRef, useState } from 'react';

const visibleTips = new WeakMap<Document, Set<() => void>>();

/** A tooltip closes before the contextual surface that contains its trigger. */
export function dismissVisibleTooltip(event: KeyboardEvent): boolean {
  const doc = event.target instanceof Document ? event.target : event.target instanceof Node ? event.target.ownerDocument : null;
  const close = doc && [...(visibleTips.get(doc) ?? [])].at(-1);
  if (!close) return false;
  event.preventDefault(); event.stopPropagation(); close();
  return true;
}

const HasTipProvider = createContext(false);

/**
 * What a control is called, and the chord that reaches it — on hover and on focus.
 *
 * ## Two answers to one question, and the browser's was the worse one
 *
 * Counted across the suite: **one** control had a real tooltip — a ribbon's `ToolbarToggle` — and
 * every other icon in every product used the native `title=`. Sixty-odd of them, including the eye
 * and the lock in a layer row, the × on every pane, the zoom's three buttons, and every `IconButton`
 * in all three apps.
 *
 * A native `title` is not a smaller version of this. It appears after about a second with no way to
 * change that, it is drawn by the operating system in a font and colour nothing in the product
 * chose, it cannot hold a shortcut legibly, and it **never appears for a reader using the keyboard**
 * — which is the reader who most needs to be told what a picture means.
 *
 * ## And the shortcut, which is the half that was impossible before
 *
 * Every design tool writes the chord beside the name here, because this is the reader who has
 * already found the button and is about to press it for the tenth time. It could not be done while a
 * chord was a string typed beside a label; it can be done now that a key map answers `chordFor` —
 * see `keys.ts`, where the chord became a fact a surface can ask for rather than one it restates.
 *
 * ## Where the grouping comes from
 *
 * `TipProvider` is what makes the second tooltip open instantly after the first — the behaviour that
 * separates a tooltip a reader tolerates from one they use. It belongs at the top of the window, so
 * `AppShell` renders one and a product gets it without knowing. Nested providers are legal, which is
 * what lets `Toolbar` keep its own and lets a `Tip` outside any shell still work.
 */
export function TipProvider({ children }: { children: React.ReactNode }) {
  return <HasTipProvider.Provider value={true}>
    <RadixTooltip.Provider delayDuration={400}>{children}</RadixTooltip.Provider>
  </HasTipProvider.Provider>;
}

export function Tip({
  label,
  /**
   * The chord, already written the way a reader reads it — `keyLabel` in `office-controls`.
   *
   * Written rather than derived here, because *which* key map a control belongs to is a fact about
   * the product and this package has never heard of one.
   */
  shortcut,
  /** Nothing at all when there is nothing to say, so a caller need not branch. */
  children
}: {
  label?: string;
  shortcut?: string;
  children: React.ReactNode;
}) {
  const hasProvider = useContext(HasTipProvider);
  const [open, setOpen] = useState(false);
  const unregister = useRef<(() => void) | null>(null);
  // Radix mounts portal content after the trigger renders. Register on attachment.
  const content = useCallback((node: HTMLDivElement | null) => {
    unregister.current?.(); unregister.current = null;
    if (!node || !open) return;
    const doc = node.ownerDocument;
    const tips = visibleTips.get(doc) ?? new Set<() => void>();
    const close = () => setOpen(false);
    tips.add(close); visibleTips.set(doc, tips);
    unregister.current = () => { tips.delete(close); };
  }, [open]);
  if (!label) return <>{children}</>;
  if (!hasProvider) return <TipProvider><Tip label={label} shortcut={shortcut}>{children}</Tip></TipProvider>;

  return (
    <RadixTooltip.Root open={open} onOpenChange={setOpen}>
      <RadixTooltip.Trigger asChild>{children}</RadixTooltip.Trigger>
      <RadixTooltip.Portal>
        <RadixTooltip.Content
          ref={content}
          sideOffset={6}
          collisionPadding={8}
          hideWhenDetached
          data-office-tooltip
          className={cn(
            /*
             * **Inverted**, and it was once white on white.
             *
             * The first version read `bg-[--ou-panel] text-white`, and `--ou-panel` is `#ffffff`:
             * every tooltip in every product was invisible in the light theme — the one every
             * product ships in — and legible only in the dark, where a `dark:` variant swapped the
             * background. Nobody saw it, because a tooltip you cannot read looks like a tooltip that
             * did not open.
             *
             * `--ou-ink` on `--ou-panel` needs no variant: both flip with the theme, so it is
             * dark-on-light in one and light-on-dark in the other.
             */
            'z-[var(--ou-z-tooltip)] rounded bg-[color:var(--ou-ink)] px-2 py-1 text-[length:var(--ou-text-small)]',
            'text-[color:var(--ou-panel)] shadow-[var(--ou-lift-2)]',
            // A tooltip must never be the thing under the pointer, or the hover it describes ends.
            'office-tooltip pointer-events-none select-none'
          )}
        >
          <span className="office-tooltip-label">{label}</span>
          {shortcut && (
            // Quieter than the name, which is the order a reader reads them in.
            <span className="office-tooltip-shortcut" data-shortcut>
              {shortcut}
            </span>
          )}
          <RadixTooltip.Arrow className="fill-[color:var(--ou-ink)]" />
        </RadixTooltip.Content>
      </RadixTooltip.Portal>
    </RadixTooltip.Root>
  );
}
