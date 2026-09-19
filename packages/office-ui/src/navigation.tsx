import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { cn } from './cn';

/** A navigation button, not a listbox option. The host supplies the destination. */
export function NavigationItem({ selected = false, leading, trailing, children, className, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & {
  selected?: boolean; leading?: ReactNode; trailing?: ReactNode;
}) {
  return <button {...props} type={props.type ?? 'button'} className={cn('office-navigation-item', className)} data-selected={selected || undefined}>
    {leading && <span className="office-navigation-icon" aria-hidden="true">{leading}</span>}
    <span className="office-navigation-label">{children}</span>
    {trailing && <span className="office-navigation-meta">{trailing}</span>}
  </button>;
}

/** Empty content is a state with guidance, not a disabled control. */
export function EmptyState({ title, children, action, icon, className }: {
  title: string; children?: ReactNode; action?: ReactNode; icon?: ReactNode; className?: string;
}) {
  return <div className={cn('office-empty-state', className)}>
    {icon && <span className="office-empty-icon" aria-hidden="true">{icon}</span>}
    <div role="status"><strong>{title}</strong>{children && <div className="office-empty-description">{children}</div>}</div>
    {action && <div className="office-empty-action">{action}</div>}
  </div>;
}
