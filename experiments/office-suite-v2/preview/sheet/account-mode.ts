import { createBrowserAccountLogin, readSheetReturnLocation } from './account-login.ts';
import type { AuthClientPort, SheetAccountIdentity, SheetReturnLocation } from './account-login.ts';
import { createAccountAdmission } from './account-admission.ts';
import { startDurableMode } from './durable-binding.ts';
import type { DurablePageHandle } from './durable-binding.ts';
import type { AccountBindingGuard } from './account-binding.ts';

const element = (id: string): HTMLElement => {
  const node = document.getElementById(id);
  if (!node) throw new Error(`Missing account control: ${id}`);
  return node;
};

/** The standalone runner supplies this same-origin source module. Office owns all OIDC. */
async function officeAuthentication(): Promise<AuthClientPort> {
  const configured = document.querySelector('meta[name="sheet-account-auth-module"]')?.getAttribute('content');
  if (!configured) throw new Error('Account authentication is not configured.');
  const url = new URL(configured, location.origin);
  if (url.origin !== location.origin || url.username || url.password || url.search || url.hash) throw new Error('Invalid authentication module origin.');
  const module: unknown = await import(/* @vite-ignore */ url.href);
  if (!module || typeof module !== 'object') throw new Error('Authentication module unavailable.');
  for (const name of ['beginLogin', 'finishLogin', 'consumeResumeIntent', 'consumeLogoutReturn', 'loadIdentity', 'confirmTenant', 'listWorkspaces', 'captureAuthorizedSession', 'announceLogout', 'clearSession', 'isLogoutEvent']) {
    if (typeof Reflect.get(module, name) !== 'function') throw new Error('Authentication module contract unavailable.');
  }
  return module as AuthClientPort;
}

export interface AccountModeOptions {
  auth?: AuthClientPort;
  /** Supplied only after the owner publishes the immutable server logout contract. */
  logout?: (requestFetch: typeof fetch) => Promise<boolean>;
}
export async function startAccountMode(options: AccountModeOptions = {}): Promise<void> {
  element('sheet-workbook').hidden = true;
  element('sheet-workbook').inert = true;
  element('account-controls').hidden = false;
  element('session-label').textContent = 'Account Sheet session';
  element('preview-scope').textContent = 'Sign in to open a Sheet with current account permissions. Original pending changes remain bound to their account and login session.';
  const status = element('account-status');
  const signIn = element('account-sign-in');
  const logout = element('account-logout');
  const open = element('account-open');
  const tenant = element('account-tenant');
  const documentId = element('account-document');
  if (!(tenant instanceof HTMLSelectElement) || !(documentId instanceof HTMLInputElement) || !(signIn instanceof HTMLButtonElement) || !(logout instanceof HTMLButtonElement) || !(open instanceof HTMLButtonElement)) throw new Error('Invalid account controls.');
  logout.textContent = options.logout ? 'Sign out' : 'End local session';
  const login = createBrowserAccountLogin(options.auth ?? await officeAuthentication());
  let target: SheetReturnLocation = {};
  let identity: SheetAccountIdentity | undefined;
  let page: DurablePageHandle | undefined;
  let guard: AccountBindingGuard | undefined;
  let busy = false;
  let retired = false;
  const retire = (): void => {
    retired = true; guard?.retire(); page?.freeze();
    element('sheet-workbook').hidden = true; element('sheet-workbook').inert = true;
    element('alternative-panel').hidden = true;
    element('durable-controls').hidden = true;
    delete window.sheetPreview; delete window.sheetDurable;
    signIn.disabled = true; open.disabled = true; tenant.disabled = true; documentId.disabled = true;
    const fresh = element('account-fresh-login');
    if (fresh instanceof HTMLAnchorElement) {
      const url = new URL('/', location.origin);
      if (target.tenantId && target.documentId) { url.searchParams.set('tenant', target.tenantId); url.searchParams.set('document', target.documentId); }
      fresh.href = url.href; fresh.hidden = false;
    }
    element('account-identity').textContent = '';
    status.textContent = 'Session ended or expired. Original drafts and delivery records are retained in their account scope. Sign in again to check current access.';
  };
  login.subscribeRetirement(retire);
  const error = (): void => { status.textContent = 'Account operation refused or unavailable. Original records are retained.'; };
  signIn.addEventListener('click', () => {
    if (busy) return;
    busy = true;
    void login.beginLogin(target, retired).catch(error).finally(() => { busy = false; });
  });
  open.addEventListener('click', () => {
    if (busy || page || !identity || retired) return;
    busy = true;
    void (async () => {
      const requested = readSheetReturnLocation(`/?tenant=${encodeURIComponent(tenant.value)}&document=${encodeURIComponent(documentId.value)}`, location.origin);
      if (!requested.tenantId || !requested.documentId) throw new Error('Missing Sheet scope.');
      await login.confirmTenant(requested.tenantId);
      const lease = login.captureAuthorizedSession();
      const admitted = await createAccountAdmission(lease, { tenantId: requested.tenantId, documentId: requested.documentId,
        ...(target.workspaceId && target.documentId === requested.documentId && target.tenantId === requested.tenantId ? { workspaceId: target.workspaceId } : {}) }, identity!);
      admitted.guard.assertCurrent(); guard = admitted.guard;
      target = { ...requested, workspaceId: admitted.binding.workspaceId, ...(target.clientId ? { clientId: target.clientId } : {}), ...(target.new ? { new: true } : {}) };
      const url = new URL(location.href);
      url.searchParams.set('tenant', admitted.binding.tenantId); url.searchParams.set('document', admitted.binding.documentId); url.searchParams.set('workspace', admitted.binding.workspaceId);
      history.replaceState(null, '', url);
      tenant.disabled = true; documentId.disabled = true; open.disabled = true;
      status.textContent = 'Account and Sheet access verified. Start a new client or open the original client link.';
      page = startDurableMode('websocket', { binding: admitted.binding, isCurrent: () => admitted.guard.isCurrent(), admit: admitted.admit });
    })().catch(error).finally(() => { busy = false; });
  });
  logout.addEventListener('click', () => {
    if (busy) return;
    busy = true;
    // Keep this page and its frozen draft in place. The server ends only this verified login.
    page?.freeze();
    void login.logout(options.logout).then(result => {
      status.textContent = result === 'confirmed' ? 'Signed out. Original drafts and delivery records are retained.' : 'Signed out locally. Provider logout is unconfirmed. Original records are retained.';
    }).catch(error).finally(() => { busy = false; });
  });
  try {
    target = location.pathname === '/auth/callback' ? await login.finishLogin() : readSheetReturnLocation(location.href, location.origin);
    identity = await login.loadIdentity();
    if (retired) return;
    element('account-identity').textContent = `Account: ${identity.currentUserId ?? 'unavailable'}`;
    tenant.replaceChildren(...identity.tenants.map(item => { const option = document.createElement('option'); option.value = item.tenantId; option.textContent = item.name; return option; }));
    if (target.tenantId) tenant.value = target.tenantId;
    documentId.value = target.documentId ?? '';
    signIn.hidden = true; logout.disabled = false; open.disabled = identity.currentUserId == null || identity.tenants.length === 0;
    status.textContent = 'Choose your company and enter the Sheet document ID.';
    if (target.tenantId && target.documentId && !open.disabled) open.click();
  } catch {
    status.textContent = 'Sign in to verify your current account and Sheet permissions.';
  }
  window.addEventListener('pagehide', event => { if (!event.persisted) { guard?.retire(); login.dispose(); } });
}
