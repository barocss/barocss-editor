import type { HTMLAttributes } from 'react';
import type { DocumentSessionStatus } from '@barocss/shared';
import { StatusIndicator, useOfficeLocale } from '@barocss/office-ui';

/** Persistence codes select behavior; the application locale selects their labels. */
export function DocumentSaveStatus({ status, quiet = false, ...props }: HTMLAttributes<HTMLSpanElement> & { status: DocumentSessionStatus; quiet?: boolean }) {
  const { t } = useOfficeLocale();
  return <StatusIndicator {...props} quiet={quiet} busy={status === 'loading' || status === 'saving'}
    tone={status === 'save-error' || status === 'restore-error' || status === 'recovery-required' ? 'danger' : status === 'conflict' ? 'warning' : status === 'saved' ? 'success' : 'neutral'}>{t(`document.save.status.${status}`)}</StatusIndicator>;
}
