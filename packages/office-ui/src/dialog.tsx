import { useRef } from 'react';
import { dismissOwnedControlLayer } from './stack';
import { dismissOwnedFloatingLayer } from './floating';
import * as RadixDialog from '@radix-ui/react-dialog';
import { Icon } from '@barocss/office-icons';
import { cn } from './cn';
import { Button, keepsDraftTextAreaEscape } from './controls';

function useModalFocus(onClosed?: () => void) {
  const returnTo = useRef<HTMLElement | null>(null);
  return {
    onOpenAutoFocus: () => { returnTo.current = document.activeElement instanceof HTMLElement ? document.activeElement : null; },
    onCloseAutoFocus: (event: Event) => {
      event.preventDefault();
      if (returnTo.current?.isConnected) returnTo.current.focus({ preventScroll: true });
      if (onClosed) requestAnimationFrame(onClosed);
    },
    onEscapeKeyDown: (event: KeyboardEvent) => {
      if (keepsDraftTextAreaEscape(event)) { event.preventDefault(); return; }
      if (event.isComposing || event.keyCode === 229) { event.preventDefault(); return; }
      dismissOwnedControlLayer(event) || dismissOwnedFloatingLayer(event);
    },
  };
}

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
  className,
  onClosed
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
  /** Run follow-up UI after dismissal has restored focus. */
  onClosed?: () => void;
}) {
  const focus = useModalFocus(onClosed);
  return (
    <RadixDialog.Root open={open} onOpenChange={onOpenChange}>
      <RadixDialog.Portal>
        <RadixDialog.Overlay data-office-dialog-overlay className="fixed inset-0 z-[var(--ou-z-overlay)] bg-[color:var(--ou-scrim)]" />
 <RadixDialog.Content
          data-office-dialog
          {...focus}
          {...(!description ? { 'aria-describedby': undefined } : {})}
          className={cn(
            'office-modal office-modal-dialog fixed left-1/2 top-1/2 z-[var(--ou-z-dialog)] w-[min(30rem,calc(100vw-2rem))]',
            '-translate-x-1/2 -translate-y-1/2 rounded-lg border shadow-[var(--ou-lift-3)]',
            'border-[color:var(--ou-line)] bg-[color:var(--ou-panel)] text-[color:var(--ou-ink)]',
            className
          )}
        >
          <div className="office-modal-header">
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
 data-button-kind="icon" data-button-tone="quiet" data-button-size="sm" className="office-button"
 >
              <Icon name="close" />
            </RadixDialog.Close>
          </div>

          <div className="office-modal-body">{children}</div>

 {footer && (
            <div className="office-modal-footer">
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
  const focus = useModalFocus();
  return (
    <RadixDialog.Root open={open} onOpenChange={onOpenChange}>
      <RadixDialog.Portal>
        {/* Lighter than a dialog's: the page behind is what the reader is checking their edit against. */}
        <RadixDialog.Overlay data-office-dialog-overlay="drawer" className="fixed inset-0 z-[var(--ou-z-overlay)] bg-[color:var(--ou-scrim)] opacity-50" />
        <RadixDialog.Content
          data-office-dialog
          {...focus}
          {...(!description ? { 'aria-describedby': undefined } : {})}
          className={cn(
            'office-modal office-modal-drawer fixed right-0 top-0 z-[var(--ou-z-dialog)] flex h-full flex-col border-l',
            'shadow-[var(--ou-lift-3)] border-[color:var(--ou-line)]',
            'bg-[color:var(--ou-panel)] text-[color:var(--ou-ink)]',
            className
          )}
          style={{ width: `min(${width}, calc(100vw - 2rem))` }}
        >
          <div className="office-modal-header">
            <div className="min-w-0">
              <RadixDialog.Title className="text-[length:var(--ou-text)] font-semibold">{title}</RadixDialog.Title>
              {description && (
                <RadixDialog.Description className="mt-0.5 text-[length:var(--ou-text-small)] text-[color:var(--ou-muted)]">
                  {description}
                </RadixDialog.Description>
              )}
            </div>
            <RadixDialog.Close
              aria-label="닫기"
              data-button-kind="icon" data-button-tone="quiet" data-button-size="sm" className="office-button"
            >
              <Icon name="close" />
            </RadixDialog.Close>
          </div>

          {/* The one part that scrolls: a row of twenty columns is taller than a window. */}
          <div className="office-modal-body">{children}</div>
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
  return <Button {...rest} tone={variant === 'primary' ? 'accent' : 'plain'}
    className={cn('[--ou-button-height:32px] px-3', rest.className)}>{children}</Button>;
}
