import { OfficeLocaleProvider } from '@barocss/office-ui';
import { lazy, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import './style.css';
import { formatWorkspaceRoute } from '@barocss/office-workspace';
import { resolveLocalEntry } from './local-entry';
import { EntryBoundary, EntryStatus } from './entry-status';
import { LocalNativeFrame } from './local-native-frame';
import { localNativeFrameRoute, reportLocalNativeFrameFailure } from './local-native-bridge';
import type { NativeEntryBinding } from './auth-app';
import type { AuthenticatedNative2Read, Native2ReadScope } from './native2-authenticated-reader';
import { noteMutationLeaseFactory, noteReceiptRecoveryLeaseFactory } from './native2-authenticated-host';

type Native2ReadFactory = Readonly<{
  open: (scope: Native2ReadScope) => Promise<AuthenticatedNative2Read>;
  isCurrent: () => boolean;
  retire: () => void;
  subscribeRetirement: (callback: () => void) => () => void;
}>;

function noteReadLeaseFactory(tenantId: string, workspaceId: string, binding?: NativeEntryBinding): () => Promise<Native2ReadFactory> {
  return async () => {
    const isAuthorized = binding?.isAuthorized;
    const subscribeAuthority = binding?.subscribeAuthority;
    const unavailable = () => new Error('현재 Note 문서 읽기 권한을 확인하지 못했습니다.');
    if (!isAuthorized || !subscribeAuthority || !isAuthorized()) throw unavailable();
    const { createAuthenticatedNative2Reader } = await import('./native2-authenticated-reader');
    if (!isAuthorized()) throw unavailable();

    const reader = createAuthenticatedNative2Reader();
    let retired = false;
    let unsubscribe: (() => void) | undefined;
    let unsubscribeReader: (() => void) | undefined;
    const retire = () => {
      const stop = unsubscribe, stopReader = unsubscribeReader;
      unsubscribe = undefined;
      unsubscribeReader = undefined;
      if (!retired) { retired = true; reader.retire(); }
      stop?.();
      stopReader?.();
    };
    const isCurrent = () => {
      if (retired) return false;
      if (!isAuthorized() || !reader.isCurrent()) { retire(); return false; }
      return true;
    };
    try {
      unsubscribeReader = reader.subscribeRetirement(retire);
      if (!retired) unsubscribe = subscribeAuthority(retire);
    }
    catch (error) { retire(); throw error; }
    if (retired) retire();
    if (!isCurrent()) { retire(); throw unavailable(); }

    return Object.freeze({
      open: async (scope: Native2ReadScope) => {
        if (!isCurrent()) throw unavailable();
        if (scope.tenantId !== tenantId || scope.workspaceId !== workspaceId) throw unavailable();
        let result: AuthenticatedNative2Read;
        try { result = await reader.open(scope); }
        catch (error) { if (!isCurrent()) retire(); throw error; }
        if (!isCurrent()) { result.retire(); retire(); throw unavailable(); }
        return Object.freeze({ ...result, isCurrent: () => isCurrent() && result.isCurrent() });
      },
      isCurrent,
      retire,
      subscribeRetirement: reader.subscribeRetirement,
    });
  };
}

const root = createRoot(document.getElementById('root')!);
if (import.meta.env.VITE_OFFICE_AUTH_MODE === 'oidc') {
  root.render(<EntryStatus />);
  // Load the server editor only after Office has checked this account and document.
  const ServerNoteWorkspace = lazy(() => import('../../note/src/server-workspace').then(module => ({ default: module.ServerNoteWorkspace })));
  const ServerWordWorkspace = lazy(() => import('../../word/src/server-workspace').then(module => ({ default: module.ServerWordWorkspace })));
  const ServerSlidesWorkspace = lazy(() => import('../../slide/src/server-workspace').then(module => ({ default: module.ServerSlidesWorkspace })));
  const ServerSiteWorkspace = lazy(() => import('../../site/src/server-workspace').then(module => ({ default: module.ServerSiteWorkspace })));
  void import('./auth-app').then(({ AuthApp }) => root.render(<EntryBoundary><OfficeLocaleProvider><AuthApp editorRenderer={(context, principal, onUnsafeChange, onDocumentNavigate, headerNavigation, binding) => {
    const Workspace = context.product === 'site' ? ServerSiteWorkspace : context.product === 'slides' ? ServerSlidesWorkspace : context.product === 'word' ? ServerWordWorkspace : ServerNoteWorkspace;
    return <Suspense fallback={<EntryStatus />}>
      <Workspace key={`${principal.issuer}\0${principal.subject}\0${context.tenantId}\0${context.workspaceId}\0${context.product}`}
        headerNavigation={headerNavigation}
        {...binding}
        {...(context.product !== 'slides' ? { workspaceNavigation: true } : {})}
        tenantId={context.tenantId}
        workspaceId={context.workspaceId}
        issuer={principal.issuer}
        subject={principal.subject}
        {...(context.product === 'note' ? { currentUserId: principal.currentUserId,
          createNative2MutationLease: noteMutationLeaseFactory(context.tenantId, context.workspaceId, binding),
          createNative2ReceiptRecoveryLease: noteReceiptRecoveryLeaseFactory(context.tenantId, context.workspaceId, binding),
          createNative2ReadLease: noteReadLeaseFactory(context.tenantId, context.workspaceId, binding) } : {})}
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
      const frameRoute = localNativeFrameRoute(requestedURL);
      const { route, item } = await resolveLocalEntry(frameRoute.url); assertRequested();
      if (item?.kind === 'document') {
        if (!frameRoute.token) {
          root.render(<EntryBoundary><LocalNativeFrame initial={{ product: item.product, id: item.id, url: frameRoute.url }} /></EntryBoundary>);
          return;
        }
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
        if (frameRoute.token) throw new Error('The native frame address does not identify an original document.');
        const { WorkspaceHome } = await import('@barocss/office-workspace/ui'); assertRequested();
        root.render(<OfficeLocaleProvider><WorkspaceHome initialProjectId={item?.id} /></OfficeLocaleProvider>);
        history.replaceState(history.state, '', formatWorkspaceRoute(route));
      }
    } catch (error) {
      if (reportLocalNativeFrameFailure(error)) return;
      root.render(<EntryStatus error={error instanceof Error ? error.message : 'Invalid workspace address.'} />);
    }
  })();
}
