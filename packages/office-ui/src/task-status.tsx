import { useLayoutEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Button } from './controls';
import { Icon } from '@barocss/office-icons';

export type TaskPhase = 'running' | 'success' | 'error' | 'cancelled';

const taskStacks = new WeakMap<Document, { element: HTMLDivElement; users: number }>();
/** Concurrent file/export notices share a stack instead of covering one another. */
export function TaskStatusRegion({ label, children }: { label: string; children: ReactNode }) {
  const [target, setTarget] = useState<HTMLElement>();
  useLayoutEffect(() => {
    let stack = taskStacks.get(document);
    if (!stack) {
      const element = document.createElement('div');
      element.className = 'office-task-region';
      document.body.append(element);
      stack = { element, users: 0 }; taskStacks.set(document, stack);
    }
    stack.users++; setTarget(stack.element);
    return () => { if (--stack.users === 0) { stack.element.remove(); taskStacks.delete(document); } };
  }, []);
  return target ? createPortal(<aside aria-label={label}>{children}</aside>, target) : null;
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
