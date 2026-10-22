import { SheetController } from './controller.ts';
import { mountSheetPreview } from './binding.ts';
import { DurableSession } from './durable-session.ts';
import { openOutbox } from './outbox.ts';
import type { OutboxStore } from './outbox.ts';
import { acquireClientWriter } from './client-lock.ts';
import { PeerLifecycle } from './lifecycle.ts';

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
export function startDurableMode(): void {
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
  element('session-label').textContent = 'Controlled relay · Per-update save receipts';
  element('preview-scope').textContent = 'Experimental local relay and browser outbox. Account authorization, backup, installation and production storage are outside this preview.';
  element('preview-status').textContent = 'Start a client or reopen its original client link.';
  another.href = clientUrl(crypto.randomUUID()).href;

  let disposed = false;
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
    const state = session.inspect();
    // Opening can finish while this page is in BFCache. Suspend only after admission;
    // interrupting an opening request would leave no admitted client to resume.
    if (suspended && state.phase === 'ready' && lifecycle) { lifecycle.suspend(); return; }
    if (session.replica && !view && state.phase !== 'blocked' && state.phase !== 'opening') {
      controller = new SheetController(session.replica, change => {
        try { session?.publish(change.event.eventId, change.update); }
        catch (error) { failure(error); throw error; }
      }, 'durable');
      view = mountSheetPreview(controller);
      workbook.hidden = false;
      const url = new URL(location.href);
      url.searchParams.delete('new');
      history.replaceState(null, '', url);
    }
    view?.refresh();
    workbook.inert = !view || state.phase === 'blocked' || state.phase === 'closed' || state.persistenceBlocked || !!controller?.transportWarning;
    controls.dataset.phase = state.phase;
    element('client-identity').textContent = `Client: ${state.clientId} · Session: ${state.sessionId ?? 'not admitted'}`;
    element('durable-status').textContent = `${state.notice}${controller?.transportWarning ? ` ${controller.transportWarning}` : ''}`;
    element('save-state').textContent = controller?.transportWarning ? 'Local delivery failed. Save confirmation is unavailable.' :
      state.localOnly > 0 ? 'Local input is not yet stored in this browser.' :
      state.pending + state.ackUnknown + state.rejected > 0 ? 'Some local input has no server confirmation.' :
      state.phase === 'ready' || state.phase === 'paused' ? 'All current local updates have server confirmation.' : 'Save confirmation is unavailable.';
    element('outbox-state').textContent = `Local only: ${state.localOnly} · Pending: ${state.pending} · ACK unknown: ${state.ackUnknown} · Rejected: ${state.rejected} · Server confirmed: ${state.confirmed}`;
    pause.disabled = state.phase === 'opening' || state.phase === 'blocked' || state.phase === 'closed';
    pause.textContent = state.phase === 'paused' ? 'Resume relay link' : 'Pause relay link';
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
    if (starting || disposed) return;
    starting = true;
    startedClient = clientId;
    create.hidden = true;
    const url = new URL(location.origin + location.pathname);
    url.searchParams.set('client', clientId);
    if (newClient) url.searchParams.set('new', '1');
    history.replaceState(null, '', url);
    try {
      writer = await acquireClientWriter(clientId);
      lockState = 'held';
      if (disposed) { writer.release(); lockState = 'released'; return; }
      store = await openOutbox();
      if (disposed) { store.close(); writer.release(); lockState = 'released'; return; }
      session = new DurableSession({ clientId, newClient, store, changed: update });
      lifecycle = new PeerLifecycle(session);
      window.sheetDurable = Object.freeze({ inspect: () => ({ ...session?.inspect(), mode: 'durable', clientId: startedClient, lockState }) });
      await session.start();
      if (disposed) return;
      update();
      if (session.inspect().phase !== 'blocked') {
        open.href = clientUrl(crypto.randomUUID()).href;
        open.hidden = false;
        timer = setInterval(() => { void session?.refresh(); }, 1500);
      }
    } catch (error) {
      failure(error);
      await release();
    }
  };
  create.addEventListener('click', () => { void start(crypto.randomUUID(), true); });
  pause.addEventListener('click', () => { if (session) session.setPaused(session.inspect().phase !== 'paused'); });
  retry.addEventListener('click', () => { void session?.retry(); });
  window.addEventListener('beforeunload', event => {
    if ((session?.inspect().localOnly ?? 0) > 0) { event.preventDefault(); event.returnValue = ''; }
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
}

declare global {
  interface Window { sheetDurable?: { readonly inspect: () => unknown } }
}
