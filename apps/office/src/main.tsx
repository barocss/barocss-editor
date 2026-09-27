import { lazy, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import './style.css';

const root = createRoot(document.getElementById('root')!);
if (import.meta.env.VITE_OFFICE_AUTH_MODE === 'oidc') {
  // Load the server editor only after Office has checked this account and document.
  const ServerNoteWorkspace = lazy(() => import('../../note/src/server-workspace').then(module => ({ default: module.ServerNoteWorkspace })));
  void import('./auth-app').then(({ AuthApp }) => root.render(<AuthApp noteRenderer={(context, onUnsafeChange, onDocumentNavigate) =>
    <Suspense fallback={<p role="status">노트 화면을 불러오는 중입니다.</p>}>
      <ServerNoteWorkspace
        tenantId={context.tenantId}
        workspaceId={context.workspaceId}
        initialDocumentId={context.documentId}
        authorizedFetch={context.authorizedFetch}
        role={context.role}
        onUnsafeChange={onUnsafeChange}
        onNavigate={documentId => {
          onDocumentNavigate(documentId);
          const url = new URL(location.href);
          url.searchParams.set('tenant', context.tenantId);
          url.searchParams.set('workspace', context.workspaceId);
          url.searchParams.set('document', documentId);
          url.searchParams.set('product', 'note');
          history.replaceState(null, '', url);
        }}
      />
    </Suspense>
  } />));
} else {
  void import('@barocss/office-workspace/ui').then(({ WorkspaceHome }) => root.render(<WorkspaceHome />));
}
