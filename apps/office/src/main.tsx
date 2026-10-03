import { OfficeLocaleProvider } from '@barocss/office-ui';
import { lazy, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import './style.css';

const root = createRoot(document.getElementById('root')!);
if (import.meta.env.VITE_OFFICE_AUTH_MODE === 'oidc') {
  // Load the server editor only after Office has checked this account and document.
  const ServerNoteWorkspace = lazy(() => import('../../note/src/server-workspace').then(module => ({ default: module.ServerNoteWorkspace })));
  const ServerWordWorkspace = lazy(() => import('../../word/src/server-workspace').then(module => ({ default: module.ServerWordWorkspace })));
  const ServerSlidesWorkspace = lazy(() => import('../../slide/src/server-workspace').then(module => ({ default: module.ServerSlidesWorkspace })));
  void import('./auth-app').then(({ AuthApp }) => root.render(<OfficeLocaleProvider><AuthApp editorRenderer={(context, principal, onUnsafeChange, onDocumentNavigate, headerNavigation) => {
    const Workspace = context.product === 'slides' ? ServerSlidesWorkspace : context.product === 'word' ? ServerWordWorkspace : ServerNoteWorkspace;
    return <Suspense fallback={<p role="status">문서 화면을 불러오는 중입니다.</p>}>
      <Workspace key={`${principal.issuer}\0${principal.subject}\0${context.tenantId}\0${context.workspaceId}\0${context.product}`}
        headerNavigation={headerNavigation}
        {...(context.product !== 'slides' ? { workspaceNavigation: true } : {})}
        tenantId={context.tenantId}
        workspaceId={context.workspaceId}
        issuer={principal.issuer}
        subject={principal.subject}
        initialDocumentId={context.documentId}
        authorizedFetch={context.authorizedFetch}
        role={context.role}
        onUnsafeChange={onUnsafeChange}
        onNavigate={onDocumentNavigate}
      />
    </Suspense>;
  }} /></OfficeLocaleProvider>));
} else {
  void import('@barocss/office-workspace/ui').then(({ WorkspaceHome }) => root.render(<OfficeLocaleProvider><WorkspaceHome /></OfficeLocaleProvider>));
}
