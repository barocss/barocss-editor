import type { HTMLAttributes, ReactNode } from 'react';
import { Icon } from '@barocss/office-icons';
import { cn } from './cn';

export type StatusTone = 'neutral' | 'success' | 'warning' | 'danger';

/** A compact status. The host supplies the message and owns the operation. */
export function StatusIndicator({ tone = 'neutral', busy = false, children, className, ...props }: HTMLAttributes<HTMLSpanElement> & {
  tone?: StatusTone; busy?: boolean;
}) {
  return <span {...props} role="status" aria-live="polite" aria-atomic="true"
    className={cn('office-status', className)} data-tone={tone} data-busy={busy || undefined}>
    <span className="office-status-symbol" aria-hidden="true">{busy
      ? <span className="office-status-spinner" />
      : <Icon name={tone === 'success' ? 'all-clear' : tone === 'danger' || tone === 'warning' ? 'problem' : 'type-page'} size={14} />}</span>
    <span>{children}</span>
  </span>;
}

/** Persistent feedback, with actions supplied by the feature that can recover. */
export function StatusNotice({ title, children, actions, tone = 'neutral', className, ...props }: Omit<HTMLAttributes<HTMLDivElement>, 'title'> & {
  title: string; tone?: StatusTone; actions?: ReactNode;
}) {
  return <div {...props} className={cn('office-status-notice', className)} data-tone={tone}>
    <div className="office-status-message" role={tone === 'danger' ? 'alert' : 'status'} aria-atomic="true">
      <span aria-hidden="true"><Icon name={tone === 'success' ? 'all-clear' : 'problem'} size={16} /></span>
      <div><strong>{title}</strong>{children && <div className="office-status-description">{children}</div>}</div>
    </div>
    {actions && <div className="office-status-actions">{actions}</div>}
  </div>;
}
