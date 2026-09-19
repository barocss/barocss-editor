import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { cn } from './cn';
import { STATE } from './controls';

export interface MenuActionProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  selected?: boolean;
  preserveFocus?: boolean;
  [name: `data-${string}`]: string | number | boolean | undefined;
}

/** A menu label keeps its own line; secondary copy never competes for its width. */
export function MenuActionText({ label, description }: { label: ReactNode; description?: ReactNode }) {
  return <span className="flex min-w-0 flex-1 flex-col gap-0.5" style={{ whiteSpace: 'normal', overflowWrap: 'anywhere' }}>
    <span data-menu-label className="font-medium leading-5">{label}</span>
    {description && <span data-menu-description className="text-[length:var(--ou-text-small)] leading-4 text-[color:var(--ou-muted)]">{description}</span>}
  </span>;
}

/** One actionable menu row; the caller supplies its command and keyboard navigation. */
export function MenuAction({
  selected = false, preserveFocus = true, children, className, onMouseDown,
  type = 'button', role = 'menuitem', ...attributes
}: MenuActionProps) {
  return <button
    {...attributes}
    type={type}
    role={role}
    onMouseDown={event => {
      if (preserveFocus) event.preventDefault();
      onMouseDown?.(event);
    }}
    className={cn(
      STATE,
      'flex min-h-[var(--ou-control-h)] w-full shrink-0 items-center gap-2 rounded-[var(--ou-radius)] px-2 py-1 text-left',
      'text-[length:var(--ou-text)] text-[color:var(--ou-ink)] disabled:pointer-events-none disabled:opacity-40',
      selected ? 'bg-[color:var(--ou-accent-soft)]' : 'bg-transparent hover:bg-[color:var(--ou-ground)]',
      className
    )}
  >{children}</button>;
}
