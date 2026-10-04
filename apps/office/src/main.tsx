import { OfficeLocaleProvider } from '@barocss/office-ui';
import { lazy, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import './style.css';
import { formatWorkspaceRoute } from '@barocss/office-workspace';
import { resolveLocalEntry } from './local-entry';
import { EntryBoundary, EntryStatus } from './entry-status';

const root = createRoot(document.getElementById('root')!);
if (import.meta.env.VITE_OFFICE_AUTH_MODE === 'oidc') {
  root.render(<EntryStatus />);
  // Load the server editor only after Office has checked this account and document.
  const ServerNoteWorkspace = lazy(() => import('../../note/src/server-workspace').then(module => ({ default: module.ServerNoteWorkspace })));
  const ServerWordWorkspace = lazy(() => import('../../word/src/server-workspace').then(module => ({ default: module.ServerWordWorkspace })));
  const ServerSlidesWorkspace = lazy(() => import('../../slide/src/server-workspace').then(module => ({ default: module.ServerSlidesWorkspace })));
  void import('./auth-app').then(({ AuthApp }) => root.render(<EntryBoundary><OfficeLocaleProvider><AuthApp editorRenderer={(context, principal, onUnsafeChange, onDocumentNavigate, headerNavigation) => {
    const Workspace = context.product === 'slides' ? ServerSlidesWorkspace : context.product === 'word' ? ServerWordWorkspace : ServerNoteWorkspace;
    return <Suspense fallback={<EntryStatus />}>
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
  }} /></OfficeLocaleProvider></EntryBoundary>)).catch(error => root.render(<EntryStatus error={error instanceof Error ? error.message : 'Unable to load the workspace.'} />));
} else {
  root.render(<EntryStatus />);
  void (async () => {
    try {
      const requestedURL = location.href;
      const assertRequested = () => { if (location.href !== requestedURL) throw new Error('The requested address changed before its original opened.'); };
      const { route, item } = await resolveLocalEntry(requestedURL); assertRequested();
      if (item?.kind === 'document') {
        const { mountWorkspaceProduct } = await import('./host'); assertRequested();
        root.unmount();
        const starts = {
          note: () => import('../../note/src/main'),
          word: () => import('../../word/src/main'),
          slides: () => import('../../slide/src/main'),
          site: () => import('../../site/src/main')
        };
        await mountWorkspaceProduct(item.product, starts[item.product]);
      } else {
        const { WorkspaceHome } = await import('@barocss/office-workspace/ui'); assertRequested();
        root.render(<OfficeLocaleProvider><WorkspaceHome initialProjectId={item?.id} /></OfficeLocaleProvider>);
        history.replaceState(history.state, '', formatWorkspaceRoute(route));
      }
    } catch (error) {
      root.render(<EntryStatus error={error instanceof Error ? error.message : 'Invalid workspace address.'} />);
    }
  })();
}
