import { useLayoutEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useOfficePortalContainer } from './portal-owner';
import { Button } from './controls';
import { Icon } from '@barocss/office-icons';

export type TaskPhase = 'running' | 'success' | 'error' | 'cancelled';

const taskStacks = new WeakMap<Document | HTMLElement, { element: HTMLDivElement; users: number }>();
/** Concurrent file/export notices share a stack instead of covering one another. */
export function TaskStatusRegion({ label, children }: { label: string; children: ReactNode }) {
  const container = useOfficePortalContainer();
  const owner = container === undefined ? (typeof document === 'undefined' ? null : document) : container;
  const [target, setTarget] = useState<{ owner: Document | HTMLElement; element: HTMLElement }>();
  useLayoutEffect(() => {
    if (!owner) return;
    let stack = taskStacks.get(owner);
    if (!stack) {
      const doc = owner instanceof Document ? owner : owner.ownerDocument;
      const element = doc.createElement('div');
      element.className = 'office-task-region';
      (owner instanceof Document ? owner.body : owner).append(element);
      stack = { element, users: 0 }; taskStacks.set(owner, stack);
    }
    stack.users++; setTarget({ owner, element: stack.element });
    return () => { if (--stack.users === 0) { stack.element.remove(); taskStacks.delete(owner); } };
  }, [owner]);
  return target && target.owner === owner ? createPortal(<aside aria-label={label}>{children}</aside>, target.element) : null;
}

/** The host owns the task. Omit progress and actions when the operation cannot provide them. */
export function TaskStatus({ title, phase, description, progress, actions, onDismiss }: {
  title: string; phase: TaskPhase; description?: string; progress?: number;
  actions?: ReactNode; onDismiss?: () => void;
}) {
  const running = phase === 'running';
  const percent = typeof progress === 'number' && Number.isFinite(progress) ? Math.round(Math.min(100, Math.max(0, progress))) : undefined;
  return <section className="office-task-status" aria-label={title} data-phase={phase}>
    <div className="office-task-heading">
      <div role={phase === 'error' ? 'alert' : 'status'} aria-live={phase === 'error' ? 'assertive' : 'polite'} aria-atomic="true">
        <span className="office-status" data-tone={phase === 'error' ? 'danger' : phase === 'success' ? 'success' : 'neutral'}><span className="office-status-symbol" aria-hidden="true">{running ? <span className="office-status-spinner" /> : <Icon name={phase === 'success' ? 'all-clear' : phase === 'error' ? 'problem' : 'type-page'} size={14} />}</span><strong>{title}</strong></span>
        {description && <p className="office-task-description">{description}</p>}
      </div>
      {!running && onDismiss && <Button tone="quiet" square ariaLabel={`${title} 알림 닫기`} onClick={onDismiss}><Icon name="close" size={14} /></Button>}
    </div>
    {running && percent !== undefined && <div className="office-task-progress-row"><progress aria-label={`${title} 진행률`} max={100} value={percent} /><span>{percent}%</span></div>}
    {actions && <div className="office-task-actions">{actions}</div>}
  </section>;
}
