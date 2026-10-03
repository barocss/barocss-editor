import type { HTMLAttributes } from 'react';
import type { DocumentSessionStatus } from '@barocss/shared';
import { StatusIndicator, useOfficeLocale } from '@barocss/office-ui';

/** Persistence codes select behavior; the application locale selects their labels. */
export function DocumentSaveStatus({ status, ...props }: HTMLAttributes<HTMLSpanElement> & { status: DocumentSessionStatus }) {
  const { t } = useOfficeLocale();
  return <StatusIndicator {...props} busy={status === 'loading' || status === 'saving'}
    tone={status === 'save-error' || status === 'restore-error' || status === 'recovery-required' ? 'danger' : status === 'conflict' ? 'warning' : status === 'saved' ? 'success' : 'neutral'}>{t(`document.save.status.${status}`)}</StatusIndicator>;
}
