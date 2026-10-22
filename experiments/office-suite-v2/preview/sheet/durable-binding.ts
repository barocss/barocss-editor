import { SheetController } from './controller.ts';
import { mountSheetPreview } from './binding.ts';
import { DurableSession } from './durable-session.ts';
import { openOutbox, openAccountOutbox } from './outbox.ts';
import type { OutboxStore, AccountOutboxStore } from './outbox.ts';
import { acquireClientWriter } from './client-lock.ts';
import { PeerLifecycle } from './lifecycle.ts';
import { WebSocketTransport } from './websocket-transport.ts';
import type { SheetRelayAccountBinding, SheetRelayAccountAdmissionResponse } from '../../src/sheet-preview-protocol.ts';
import { SHEET_RELAY_WS_PATH } from '../../src/sheet-preview-protocol.ts';

const element = (id: string): HTMLElement => {
  const found = document.getElementById(id);
  if (!found) throw new Error(`Missing durable control: ${id}`);
  return found;
};
const clientUrl = (clientId: string): URL => {
  const url = new URL(location.origin + location.pathname);
  url.searchParams.set('client', clientId);
  url.searchParams.set('new', '1');
  return url;
};

/** Page-owned writer lease. Credentials and packet bodies never enter the observer. */
export interface AccountDurableOptions { binding: SheetRelayAccountBinding; isCurrent: () => boolean; admit: (resumeCredential?: string) => Promise<SheetRelayAccountAdmissionResponse> }
export interface DurablePageHandle { freeze(): void; prepareExit(): Promise<void> }
export function startDurableMode(mode: 'http' | 'websocket' = 'http', account?: AccountDurableOptions): DurablePageHandle {
  const scopedClientUrl = (clientId: string): URL => {
    const url = clientUrl(clientId);
    if (account) { url.searchParams.set('tenant', account.binding.tenantId); url.searchParams.set('document', account.binding.documentId); url.searchParams.set('workspace', account.binding.workspaceId); }
    return url;
  };
  const controls = element('durable-controls');
  const workbook = element('sheet-workbook');
  const create = element('create-client');
  const open = element('open-client');
  const another = element('new-client');
  const pause = element('pause-relay');
  const retry = element('retry-relay');
  if (!(open instanceof HTMLAnchorElement) || !(another instanceof HTMLAnchorElement) ||
      !(pause instanceof HTMLButtonElement) || !(retry instanceof HTMLButtonElement)) throw new Error('Invalid durable controls');
  controls.hidden = false;
  workbook.hidden = true;
  workbook.inert = true;
  element('alternative-panel').hidden = false;
  element('session-label').textContent = `${account ? 'Account WebSocket' : mode === 'websocket' ? 'WebSocket' : 'Controlled'} relay · Per-update save receipts`;
  element('preview-scope').textContent = account ? 'Account-bound Sheet session. The server checks current permissions for reads and writes. Original browser records stay bound to this account and login session.' : 'Experimental local relay and browser outbox. Controlled session permissions are enforced by this server. Production account authorization, backup, installation and production storage are outside this preview.';
  element('preview-status').textContent = 'Start a client or reopen its original client link.';
  another.href = scopedClientUrl(crypto.randomUUID()).href;

  let disposed = false;
  let frozen = false;
  let suspended = false;
  let starting = false;
  let writer: Awaited<ReturnType<typeof acquireClientWriter>> | undefined;
  let store: OutboxStore | undefined;
  let session: DurableSession | undefined;
  let lifecycle: PeerLifecycle | undefined;
  let controller: SheetController | undefined;
  let view: ReturnType<typeof mountSheetPreview> | undefined;
  let timer: ReturnType<typeof setInterval> | undefined;
  let lockState = 'not-acquired';
  let startedClient: string | null = null;
  const failure = (error: unknown): void => {
    if (disposed) return;
    controls.dataset.phase = 'blocked';
    element('durable-status').textContent = `Client blocked: ${error instanceof Error ? error.message : String(error)}. Original browser records are retained.`;
    element('save-state').textContent = 'Save confirmation is unavailable.';
    workbook.inert = true;
  };
  const update = (): void => {
    if (disposed || !session) return;
    if (account && !account.isCurrent()) { freeze(); return; }
    const state = session.inspect();
    // Opening can finish while this page is in BFCache. Suspend only after admission;
    // interrupting an opening request would leave no admitted client to resume.
    if (suspended && state.phase === 'ready' && lifecycle) { lifecycle.suspend(); return; }
    if (session.replica && !view && state.phase !== 'blocked' && state.phase !== 'opening') {
      controller = new SheetController(session.replica, change => {
        try { session?.publish(change.event.eventId, change.update); }
        catch (error) { failure(error); throw error; }
      }, 'durable', account ? () => session?.inspect().canEdit ?? false : undefined);
      view = mountSheetPreview(controller);
      workbook.hidden = false;
      const url = new URL(location.href);
      url.searchParams.delete('new');
      history.replaceState(null, '', url);
    }
    view?.refresh();
    workbook.inert = frozen || !view || state.phase === 'blocked' || state.phase === 'closed' || state.persistenceBlocked || !!controller?.transportWarning ||
      (mode === 'websocket' && !state.canEdit && !(account && state.access === 'read-only'));
    if (account && state.access === 'denied') { workbook.hidden = true; element('alternative-panel').hidden = true; delete window.sheetPreview; }
    controls.dataset.phase = state.phase;
    element('client-identity').textContent = `Client: ${state.clientId} · Session: ${state.sessionId ?? 'not admitted'}${mode === 'websocket' ? ` · Access: ${state.access ?? 'unconfirmed'} · Link: ${state.transport?.phase ?? 'opening'}` : ''}`;
    element('durable-status').textContent = `${state.notice}${controller?.transportWarning ? ` ${controller.transportWarning}` : ''}`;
    element('save-state').textContent = controller?.transportWarning ? 'Local delivery failed. Save confirmation is unavailable.' :
      mode === 'websocket' && state.access === 'denied' ? 'Session access denied. Original input and outbox are retained.' :
      mode === 'websocket' && state.access === 'read-only' ? 'Read-only access. New edits and delivery are disabled.' :
      mode === 'websocket' && !state.canEdit && !state.persistenceBlocked ? 'WebSocket permission is unconfirmed. Original records are retained.' :
      state.localOnly > 0 ? 'Local input is not yet stored in this browser.' :
      state.pending + state.ackUnknown + state.rejected > 0 ? 'Some local input has no server confirmation.' :
      state.phase === 'ready' || state.phase === 'paused' ? 'All current local updates have server confirmation.' : 'Save confirmation is unavailable.';
    element('outbox-state').textContent = `Local only: ${state.localOnly} · Pending: ${state.pending} · ACK unknown: ${state.ackUnknown} · Rejected: ${state.rejected} · Server confirmed: ${state.confirmed}`;
    pause.disabled = state.phase === 'opening' || state.phase === 'blocked' || state.phase === 'closed';
    pause.textContent = mode === 'websocket' ? state.outgoingPaused ? 'Resume outgoing changes' : 'Pause outgoing changes' :
      state.phase === 'paused' ? 'Resume relay link' : 'Pause relay link';
    retry.disabled = state.phase === 'opening' || state.phase === 'paused' || state.phase === 'closed' || state.phase === 'blocked';
  };
  const release = async (): Promise<void> => {
    session?.close();
    await session?.settled();
    if (view) view.destroy(); else session?.replica?.destroy();
    store?.close();
    writer?.release();
    lockState = 'released';
  };
  const start = async (clientId: string, newClient: boolean): Promise<void> => {
    if (starting || disposed || frozen || (account && !account.isCurrent())) return;
    starting = true;
    startedClient = clientId;
    create.hidden = true;
    const url = account ? scopedClientUrl(clientId) : new URL(location.origin + location.pathname);
    url.searchParams.set('client', clientId);
    url.searchParams.delete('new');
    if (newClient) url.searchParams.set('new', '1');
    history.replaceState(null, '', url);
    try {
      writer = await acquireClientWriter(clientId);
      lockState = 'held';
      if (disposed) { writer.release(); lockState = 'released'; return; }
      if (account && !account.isCurrent()) throw new Error('account-retired');
      store = account ? await openAccountOutbox(account.binding, account.isCurrent) : await openOutbox();
      if (disposed) { store.close(); writer.release(); lockState = 'released'; return; }
      const endpoint = new URL(SHEET_RELAY_WS_PATH, location.origin);
      endpoint.protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
      session = new DurableSession({ clientId, newClient, store, changed: update,
        ...(account ? { account: { binding: account.binding, isCurrent: account.isCurrent } } : {}),
        ...(mode === 'websocket' ? { transport: events => new WebSocketTransport({ url: endpoint.href, ...events, ...(account ? { account: { admit: account.admit, isCurrent: account.isCurrent } } : {}) }) } : {}) });
      lifecycle = new PeerLifecycle(session);
      window.sheetDurable = Object.freeze({ inspect: () => ({ ...session?.inspect(), mode: account ? 'account' : mode === 'websocket' ? 'websocket' : 'durable', clientId: startedClient, lockState }) });
      await session.start();
      if (disposed) return;
      update();
      if (session.inspect().phase !== 'blocked') {
        open.href = scopedClientUrl(crypto.randomUUID()).href;
        open.hidden = false;
        if (mode === 'http') timer = setInterval(() => { void session?.refresh(); }, 1500);
      }
    } catch (error) {
      failure(error);
      await release();
    }
  };
  const freeze = (): void => {
    frozen = true; workbook.inert = true; workbook.hidden = true; controls.inert = true;
    if (account) { controls.hidden = true; delete window.sheetDurable; }
    element('alternative-panel').hidden = true; delete window.sheetPreview;
    session?.close();
  };
  const prepareExit = async (): Promise<void> => {
    frozen = true; workbook.inert = true; controls.inert = true;
    if (account && store && startedClient) {
      if (!account.isCurrent()) throw new Error('account-retired; original records retained');
      await (store as AccountOutboxStore).saveDraft(startedClient, {
        version: 1, clientId: startedClient, accountBinding: account.binding,
        context: session?.inspect().context, identity: session?.inspect().identity, draft: controller?.draft ?? null,
      });
    }
    session?.close(); await session?.settled();
    if ((session?.inspect().localOnly ?? 0) > 0) throw new Error('Local input is not persisted. Keep this page open.');
  };
  create.addEventListener('click', () => { void start(crypto.randomUUID(), true); });
  pause.addEventListener('click', () => {
    if (session) {
      if (mode === 'websocket') session.setOutgoingPaused(!session.inspect().outgoingPaused);
      else session.setPaused(session.inspect().phase !== 'paused');
    }
  });
  retry.addEventListener('click', () => { void session?.retry(); });
  window.addEventListener('beforeunload', event => {
    if ((session?.inspect().localOnly ?? 0) > 0 || (account && controller?.draft)) { event.preventDefault(); event.returnValue = ''; }
  });
  window.addEventListener('pagehide', event => {
    if (event.persisted) {
      suspended = true;
      if (session && session.inspect().phase !== 'opening') lifecycle?.suspend();
      return;
    }
    disposed = true;
    workbook.inert = true;
    if (timer) clearInterval(timer);
    delete window.sheetDurable;
    void release();
  });
  window.addEventListener('pageshow', event => {
    if (event.persisted && !disposed) { suspended = false; lifecycle?.resume(); }
  });
  const url = new URL(location.href);
  const clientId = url.searchParams.get('client');
  if (clientId !== null) void start(clientId, url.searchParams.get('new') === '1');
  return { freeze, prepareExit };
}

declare global {
  interface Window { sheetDurable?: { readonly inspect: () => unknown } }
}
