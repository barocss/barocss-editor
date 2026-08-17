import * as RadixDialog from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { cn } from './cn';

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
        <RadixDialog.Overlay className="fixed inset-0 z-40 bg-black/25" />
        <RadixDialog.Content
          className={cn(
            'fixed left-1/2 top-1/2 z-50 w-[min(30rem,calc(100vw-2rem))]',
            '-translate-x-1/2 -translate-y-1/2 rounded-lg border shadow-xl',
            'border-neutral-200 bg-white text-neutral-900',
            'dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100',
            className
          )}
        >
          <div className="flex items-start justify-between gap-4 border-b border-neutral-200 px-4 py-3 dark:border-neutral-800">
            <div>
              <RadixDialog.Title className="text-sm font-semibold">{title}</RadixDialog.Title>
              {description && (
                <RadixDialog.Description className="mt-0.5 text-xs text-neutral-500">
                  {description}
                </RadixDialog.Description>
              )}
            </div>
            <RadixDialog.Close
              aria-label="닫기"
              className="rounded p-1 text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800"
            >
              <X size={16} aria-hidden />
            </RadixDialog.Close>
          </div>

          <div className="px-4 py-3">{children}</div>

          {footer && (
            <div className="flex justify-end gap-2 border-t border-neutral-200 px-4 py-3 dark:border-neutral-800">
              {footer}
            </div>
          )}
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
  return (
    <button
      type="button"
      {...rest}
      className={cn(
        'inline-flex h-8 items-center rounded px-3 text-sm',
        'disabled:pointer-events-none disabled:opacity-40',
        variant === 'primary'
          ? 'bg-sky-600 text-white hover:bg-sky-700'
          : 'border border-neutral-300 hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-800',
        rest.className
      )}
    >
      {children}
    </button>
  );
}
