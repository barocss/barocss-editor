import * as RadixDialog from '@radix-ui/react-dialog';
import { Icon } from '@barocss/office-icons';
import { cn } from './cn';
import { Button, STATE } from './controls';

/**
 * A dialog, as every product in the suite draws one.
 *
 * Office products agree about this and readers rely on that agreement: a titled
 * panel, the settings in the middle, and the two buttons at the bottom right
 * with the affirmative one last. Somebody who has changed a paragraph's spacing
 * in Word should not have to work out how a slide's box is sized.
 *
 * Radix for the parts that are tedious and invisible when wrong — the focus
 * trap, restoring focus to whatever opened it, Escape, the inert background,
 * and the `aria-modal` bookkeeping a screen reader needs to know the rest of the
 * page is unavailable.
 *
 * ## Why the caret survives it
 *
 * `onOpenAutoFocus` is not prevented and focus does move into the dialog, which
 * takes it out of the document — so a command run from here must be given the
 * selection rather than reading it at the moment it runs. That is the same rule
 * the toolbar follows with `onPointerDown`, and the reason it is written here
 * as well is that a dialog is where it is easiest to forget: the toolbar's
 * problem lasts one click, and a dialog's lasts as long as it is open.
 */
export function Dialog({
 open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  className
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  /** One line on what this changes. Announced with the title. */
  description?: string;
  children: React.ReactNode;
  /** The buttons. `DialogActions` lays them out the way the suite does. */
  footer?: React.ReactNode;
  className?: string;
}) {
  return (
    <RadixDialog.Root open={open} onOpenChange={onOpenChange}>
      <RadixDialog.Portal>
        <RadixDialog.Overlay className="fixed inset-0 z-[var(--ou-z-overlay)] bg-[color:var(--ou-scrim)]" />
 <RadixDialog.Content
          className={cn(
            'fixed left-1/2 top-1/2 z-[var(--ou-z-dialog)] w-[min(30rem,calc(100vw-2rem))]',
            '-translate-x-1/2 -translate-y-1/2 rounded-lg border shadow-[var(--ou-lift-3)]',
            'border-[color:var(--ou-line)] bg-[color:var(--ou-panel)] text-[color:var(--ou-ink)]',
            className
          )}
        >
          <div className="flex items-start justify-between gap-4 border-b border-[color:var(--ou-line)] px-4 py-3">
 <div>
              <RadixDialog.Title className="text-[length:var(--ou-text)] font-semibold">{title}</RadixDialog.Title>
 {description && (
                <RadixDialog.Description className="mt-0.5 text-[length:var(--ou-text-small)] text-[color:var(--ou-muted)]">
 {description}
                </RadixDialog.Description>
              )}
            </div>
            <RadixDialog.Close
              aria-label="닫기"
 className={cn('rounded-[var(--ou-radius)] p-1 text-[color:var(--ou-muted)] hover:bg-[color:var(--ou-ground)]', STATE)}
 >
              <Icon name="close" />
            </RadixDialog.Close>
          </div>

          <div className="px-4 py-3">{children}</div>

 {footer && (
            <div className="flex justify-end gap-2 border-t border-[color:var(--ou-line)] px-4 py-3">
 {footer}
            </div>
          )}
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}

/**
 * A **drawer** — the same modal machinery, against the right edge and the full height.
 *
 * ## Why this is not `Dialog` with a class
 *
 * It is a different act. A dialog is a **question**: it takes the middle of the window, dims what is
 * behind it, and is answered and dismissed. A drawer is a **place to work**: it sits beside what it
 * is about, stays as long as the reader is doing that job, and the page behind it goes on being the
 * thing they are looking at.
 *
 * That difference is what the props say. There is no `footer`, because a drawer has no two buttons
 * at the bottom right — its edits land as they are made, the way the panel's do. And the scrim is
 * lighter, because dimming the page to near-black while a reader edits a row *of that page* hides
 * the thing they are checking their edit against.
 *
 * Radix's `Dialog` underneath all the same, for the parts that are tedious and invisible when wrong:
 * the focus trap, restoring focus to whatever opened it, Escape, and the `aria-modal` bookkeeping.
 *
 * ## And it is modal, deliberately
 *
 * A non-modal drawer is the shape a reader can leave a half-typed field in and then not find again.
 * The panel is already the non-modal place to change one thing; this is for the stint — filling a
 * row in — and a stint has a beginning and an end.
 */
export function Drawer({
  open,
  onOpenChange,
  title,
  description,
  children,
  width = '22rem',
  className
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  /** One line on what this is about. Announced with the title. */
  description?: string;
  children: React.ReactNode;
  /** How wide, as a CSS length. Narrow enough that the page beside it is still readable. */
  width?: string;
  className?: string;
}) {
  return (
    <RadixDialog.Root open={open} onOpenChange={onOpenChange}>
      <RadixDialog.Portal>
        {/* Lighter than a dialog's: the page behind is what the reader is checking their edit against. */}
        <RadixDialog.Overlay className="fixed inset-0 z-[var(--ou-z-overlay)] bg-[color:var(--ou-scrim)] opacity-50" />
        <RadixDialog.Content
          className={cn(
            'fixed right-0 top-0 z-[var(--ou-z-dialog)] flex h-full flex-col border-l',
            'shadow-[var(--ou-lift-3)] border-[color:var(--ou-line)]',
            'bg-[color:var(--ou-panel)] text-[color:var(--ou-ink)]',
            className
          )}
          style={{ width: `min(${width}, calc(100vw - 2rem))` }}
        >
          <div className="flex items-start justify-between gap-4 border-b border-[color:var(--ou-line)] px-4 py-3">
            <div className="min-w-0">
              <RadixDialog.Title className="truncate text-[length:var(--ou-text)] font-semibold">{title}</RadixDialog.Title>
              {description && (
                <RadixDialog.Description className="mt-0.5 truncate text-[length:var(--ou-text-small)] text-[color:var(--ou-muted)]">
                  {description}
                </RadixDialog.Description>
              )}
            </div>
            <RadixDialog.Close
              aria-label="닫기"
              className={cn(
                'rounded-[var(--ou-radius)] p-1 text-[color:var(--ou-muted)] hover:bg-[color:var(--ou-ground)]',
                STATE
              )}
            >
              <Icon name="close" />
            </RadixDialog.Close>
          </div>

          {/* The one part that scrolls: a row of twenty columns is taller than a window. */}
          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">{children}</div>
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}

/**
 * A dialog's button.
 *
 * Two kinds and no more. A dialog with three equally weighted buttons is one
 * where the reader has to read all three, and every Office dialog that has ever
 * worked has one obvious way forward and one way out.
 */
export function DialogButton({
  variant = 'secondary',
 children,
  ...rest
}: {
  variant?: 'primary' | 'secondary';
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  /**
   * The suite's `Button`, one size up — and in the suite's accent.
   *
   * It was a hand-rolled button with `bg-sky-600` in it, which is the only place
   * in this package that named a colour instead of a token: every other accent is
   * `--ou-accent`, so a product that mapped the token got a dialog that disagreed
   * with its own toolbar. The height is the one real difference and stays: a
   * dialog's buttons are a reader's last decision, and 32px is the size that reads
   * as one.
   */
 return (
    <Button
      tone={variant === 'primary' ? 'accent' : 'plain'}
      disabled={rest.disabled}
      title={rest.title}
      ariaLabel={rest['aria-label'] as string | undefined}
      onClick={rest.onClick as (() => void) | undefined}
      /**
       * Whatever `data-` attributes the caller hung on it, forwarded by name.
       *
       * A dialog's buttons are what a product's tests press — `data-size-apply`,
       * `data-layout-apply` — and those belong to the product rather than to this
       * component, so they are passed through rather than enumerated.
       */
      data={Object.fromEntries(
        Object.entries(rest as Record<string, unknown>)
          .filter(([key]) => key.startsWith('data-'))
          .map(([key, value]) => [key.slice(5), value === true ? '' : String(value ?? '')])
      )}
      className={cn('h-8 px-3 text-[length:var(--ou-text)]', rest.className)}
    >
      {children}
    </Button>
  );
}
