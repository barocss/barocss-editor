import { createPreviewReplica } from './fixture.ts';
import { SheetController } from './controller.ts';
import { mountSheetPreview } from './binding.ts';
import { PeerSession } from './peer-session.ts';
import { PeerLifecycle } from './lifecycle.ts';
import { startDurableMode } from './durable-binding.ts';

const element = (id: string): HTMLElement => {
  const found = document.getElementById(id);
  if (!found) throw new Error(`Missing preview control: ${id}`);
  return found;
};
const showFailure = (error: unknown): void => {
  element('preview-status').textContent = `Preview could not start: ${error instanceof Error ? error.message : String(error)}`;
};

function startPeerMode(): void {
  const controls = element('peer-controls');
  const workbook = element('sheet-workbook');
  const create = element('create-room');
  const open = element('open-peer');
  const pause = element('pause-link');
  const retry = element('retry-link');
  const another = element('new-room');
  if (!(open instanceof HTMLAnchorElement) || !(another instanceof HTMLAnchorElement) || !(pause instanceof HTMLButtonElement) || !(retry instanceof HTMLButtonElement)) throw new Error('Invalid peer controls');
  controls.hidden = false;
  workbook.hidden = true;
  element('alternative-panel').hidden = false;
  element('session-label').textContent = 'Two-screen session · No durable storage';
  element('preview-scope').textContent = 'Controlled same-browser collaboration. Saving, server recovery, account authorization and XLSX are outside Phase B.';
  element('preview-status').textContent = 'Create a session or join its room link.';
  another.href = `${location.origin}${location.pathname}`;
  if (!('BroadcastChannel' in globalThis)) throw new Error('This browser does not provide BroadcastChannel.');

  let peer: PeerSession | undefined;
  let lifecycle: PeerLifecycle | undefined;
  let channel: BroadcastChannel | undefined;
  let controller: SheetController | undefined;
  let view: ReturnType<typeof mountSheetPreview> | undefined;
  let bootstrapHash: string | null = null;
  let bootstrapBytes = 0;
  let fingerprintStarted = false;
  let retryTimer: ReturnType<typeof setInterval> | undefined;
  let attempts = 0;
  let disposed = false;
  const update = (): void => {
    if (!peer || disposed) return;
    const state = peer.inspect();
    const replica = peer.replica;
    if (replica && !controller) {
      controller = new SheetController(replica, change => { peer?.publish(change.event.eventId, change.update); }, 'peer');
      view = mountSheetPreview(controller);
      workbook.hidden = false;
    }
    view?.refresh();
    if (replica && retryTimer) { clearInterval(retryTimer); retryTimer = undefined; }
    const bootstrap = peer.bootstrap;
    if (bootstrap && !fingerprintStarted) {
      fingerprintStarted = true;
      bootstrapBytes = bootstrap.length;
      void crypto.subtle.digest('SHA-256', new Uint8Array(bootstrap)).then(digest => {
        bootstrapHash = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
        update();
      }).catch(error => { element('peer-status').textContent = `Bootstrap fingerprint unavailable: ${String(error)}`; });
    }
    element('peer-session').textContent = `This tab: ${state.sessionId.slice(0, 8)} · Room: ${state.roomId} · Other tabs observed: ${state.peers}`;
    element('peer-status').textContent = `${state.notice} · Pending peer receipts: ${state.pending} · Received updates: ${state.received} · Base recoveries: ${state.recovered}${controller?.transportWarning ? ` · ${controller.transportWarning}` : ''}`;
    pause.disabled = !replica;
    pause.textContent = state.phase === 'paused' ? 'Resume tab link' : 'Pause tab link';
    retry.disabled = state.phase === 'closed' || state.phase === 'paused';
    controls.dataset.phase = state.phase;
  };
  const start = (roomId: string, isCreator: boolean): void => {
    if (peer) return;
    if (!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(roomId)) throw new Error('Invalid room identity. Open the original room link or start another room.');
    const roomUrl = new URL(location.href);
    roomUrl.search = '';
    roomUrl.searchParams.set('room', roomId);
    roomUrl.hash = '';
    history.replaceState(null, '', roomUrl);
    open.href = roomUrl.href;
    open.hidden = false;
    create.hidden = true;
    channel = new BroadcastChannel(`wonffice-sheet-preview-v1:${roomId}`);
    peer = new PeerSession({ roomId, create: isCreator, send: packet => { channel?.postMessage(packet); }, changed: update });
    lifecycle = new PeerLifecycle(peer);
    channel.addEventListener('message', (event: MessageEvent<unknown>) => { peer?.receive(event.data); });
    peer.start();
    update();
    if (!peer.replica) retryTimer = setInterval(() => {
      if (++attempts > 8) {
        if (retryTimer) clearInterval(retryTimer);
        retryTimer = undefined;
        return;
      }
      peer?.requestState();
    }, 1500);
    window.sheetPeer = Object.freeze({ inspect: () => ({ ...peer?.inspect(),
      context: peer?.replica?.context, bootstrapId: bootstrapHash, bootstrapHash, bootstrapBytes,
      mode: 'peer', durable: false }) });
  };
  create.addEventListener('click', () => { try { start(crypto.randomUUID(), true); } catch (error) { showFailure(error); } });
  pause.addEventListener('click', () => { if (peer) peer.setPaused(peer.inspect().phase !== 'paused'); });
  retry.addEventListener('click', () => { peer?.requestState(); });
  const room = new URL(location.href).searchParams.get('room');
  if (room !== null) { create.hidden = true; start(room, false); }
  window.addEventListener('pagehide', event => {
    if (event.persisted) { lifecycle?.suspend(); return; }
    disposed = true;
    if (retryTimer) clearInterval(retryTimer);
    peer?.close(); channel?.close();
    if (view) view.destroy(); else peer?.replica?.destroy();
    delete window.sheetPeer;
  });
  window.addEventListener('pageshow', event => { if (event.persisted) lifecycle?.resume(); });
}

try {
  const mode = document.querySelector('meta[name="sheet-collaboration-mode"]')?.getAttribute('content');
  if (mode === 'peer') startPeerMode();
  else if (mode === 'durable') startDurableMode();
  else {
    const controller = new SheetController(createPreviewReplica());
    const view = mountSheetPreview(controller);
    window.addEventListener('pagehide', event => { if (!event.persisted) view.destroy(); });
  }
} catch (error) {
  showFailure(error);
  throw error;
}

declare global {
  interface Window { sheetPeer?: { readonly inspect: () => unknown } }
}
