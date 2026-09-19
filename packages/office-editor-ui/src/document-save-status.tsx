import type { HTMLAttributes } from 'react';
import type { DocumentSessionStatus } from '@barocss/shared';
import { StatusIndicator } from '@barocss/office-ui';

/** Map persistence outcomes here; office-ui only knows visual status roles. */
export function DocumentSaveStatus({ status, ...props }: HTMLAttributes<HTMLSpanElement> & { status: DocumentSessionStatus }) {
  return <StatusIndicator {...props} busy={status === '불러오는 중' || status === '저장 중'}
    tone={status === '저장 실패' || status === '복원 실패' ? 'danger' : status === '충돌한 초안 보관됨' ? 'warning' : status === '저장됨' ? 'success' : 'neutral'}>{status}</StatusIndicator>;
}
