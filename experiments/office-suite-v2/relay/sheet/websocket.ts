import type { Server, IncomingMessage } from 'node:http';
import type { Duplex } from 'node:stream';
import { WebSocket, WebSocketServer } from 'ws';
import { decodeSheetRelayClientFrame, encodeSheetRelayWsFrame, SHEET_RELAY_ACCOUNT_LIMITS, SHEET_RELAY_WS_LIMITS, SHEET_RELAY_WS_PATH } from '../../src/sheet-preview-protocol.ts';
import type { SheetRelayAccess, SheetRelayClientFrame, SheetRelayReceipt, SheetRelayServerFrame } from '../../src/sheet-preview-protocol.ts';
import { RelayError } from './service.ts';
import type { SheetRelayService } from './service.ts';
import type { AccountSheetRelay, BoundAccountSession } from './account-service.ts';

type Peer = {
  socket: WebSocket; credential?: string; access?: SheetRelayAccess; alive: boolean;
  seen: Set<string>; pending: Set<string>; timers: Set<ReturnType<typeof setTimeout>>; controls: Set<AbortController>;
};
type CommonOptions = {
  allowedOrigins?: readonly string[];
  /** Trusted Node-only fault/control seam. Receives an actual committed receipt. */
  holdAppendAck?: (metadata: Readonly<{ requestId: string; receipt: SheetRelayReceipt }>, signal: AbortSignal) => Promise<void>;
};
export type SheetRelayWebSocketOptions = CommonOptions & (
  { mode?: 'controlled'; service: SheetRelayService } | { mode: 'account'; account: Pick<AccountSheetRelay, 'scope' | 'admit' | 'consumeTicket' | 'withAuthorized' | 'logout'> }
);

/** Attaches transport only. The caller owns the HTTP listener and durable service. */
export function attachSheetRelayWebSocket(server: Server, options: SheetRelayWebSocketOptions): { close(): Promise<void> } {
  if (options.mode === 'account') return attachAccountWebSocket(server, options);
  return attachControlledWebSocket(server, options);
}
function attachControlledWebSocket(server: Server, options: CommonOptions & { service: SheetRelayService }): { close(): Promise<void> } {
  const limits = SHEET_RELAY_WS_LIMITS;
  // A typed options variable retains compatible ws typings while passing the
  // pinned runtime's finite fragment/chunk bounds without casting them away.
  const socketOptions = { noServer: true, clientTracking: true, maxPayload: limits.frameBytes, maxFragments: limits.fragments,
    maxBufferedChunks: limits.bufferedChunks, perMessageDeflate: false, closeTimeout: 1_000, skipUTF8Validation: false };
  const sockets = new WebSocketServer(socketOptions);
  const peers = new Set<Peer>();
  let closed = false;

  function clearPeer(peer: Peer): void {
    for (const timer of peer.timers) clearTimeout(timer);
    for (const control of peer.controls) control.abort();
    peer.controls.clear(); peer.timers.clear(); peer.pending.clear(); peers.delete(peer);
  }
  function terminate(peer: Peer): void { clearPeer(peer); peer.socket.terminate(); }
  function send(peer: Peer, frame: SheetRelayServerFrame): boolean {
    if (peer.socket.readyState !== WebSocket.OPEN) return false;
    try {
      const encoded = encodeSheetRelayWsFrame(frame);
      if (peer.socket.bufferedAmount + Buffer.byteLength(encoded) > limits.bufferedBytes) { terminate(peer); return false; }
      peer.socket.send(encoded, error => { if (error) terminate(peer); });
      return true;
    } catch { terminate(peer); return false; }
  }
  function denial(peer: Peer, code: string, requestId?: string): void {
    send(peer, { protocolVersion: 1, type: 'rejected', code, ...(requestId === undefined ? {} : { requestId }) });
  }
  function current(peer: Peer, requestId?: string): boolean {
    if (!peers.has(peer) || peer.socket.readyState !== WebSocket.OPEN) return false;
    if (!peer.credential) { denial(peer, 'authentication-required', requestId); return false; }
    try {
      const session = options.service.issueSession({ protocolVersion: 1, resumeCredential: peer.credential });
      if (session.access !== peer.access) {
        peer.access = session.access;
        if (!send(peer, { protocolVersion: 1, type: 'access', access: session.access })) return false;
      }
      return true;
    } catch (error) {
      denial(peer, error instanceof RelayError ? error.code : 'current-access-denied', requestId);
      // close() permits the explicit refusal to flush, but prevents further data.
      clearPeer(peer); peer.socket.close(1008, 'current-access-denied');
      return false;
    }
  }
  function reply(peer: Peer, requestId: string, frame: SheetRelayServerFrame): void {
    if (current(peer, requestId)) {
      if (frame.type === 'append-result' && peer.access !== 'read-write') denial(peer, 'read-only-denied', requestId);
      else send(peer, frame);
    }
    peer.pending.delete(requestId);
  }
  function processFrame(peer: Peer, frame: SheetRelayClientFrame): void {
    const requestId = frame.requestId;
    if (peer.seen.has(requestId)) { denial(peer, 'duplicate-request-id', requestId); return; }
    if (peer.seen.size >= limits.requestsPerConnection) { denial(peer, 'request-count-limit', requestId); peer.socket.close(1008, 'request-count-limit'); return; }
    peer.seen.add(requestId);
    if (peer.pending.size >= limits.pendingRequests) { denial(peer, 'pending-request-limit', requestId); return; }
    peer.pending.add(requestId);
    let delayed = false;
    let committed = false;
    try {
      if (frame.type === 'authenticate-account') { denial(peer, 'account-mode-required', requestId); clearPeer(peer); peer.socket.close(1008, 'account-mode-required'); return; }
      if (frame.type === 'authenticate') {
        if (peer.credential) { denial(peer, 'already-authenticated', requestId); return; }
        const session = options.service.issueSession(frame.session);
        peer.credential = session.credential; peer.access = session.access;
        for (const timer of peer.timers) clearTimeout(timer);
        peer.timers.clear();
        reply(peer, requestId, { protocolVersion: 1, type: 'authenticated', requestId, session, state: options.service.open(session.credential) });
        return;
      }
      if (!current(peer, requestId) || !peer.credential) return;
      if (frame.type === 'open') {
        reply(peer, requestId, { protocolVersion: 1, type: 'state', requestId, state: options.service.open(peer.credential) }); return;
      }
      if (frame.type === 'checkpoint') {
        reply(peer, requestId, { protocolVersion: 1, type: 'checkpoint', requestId, checkpoint: options.service.checkpoint(peer.credential) }); return;
      }
      if (frame.type !== 'append') return;
      // Execute the SAME serialized native validator/store path. The transport
      // learns a real durable receipt before injecting deliberate reply loss.
      const result = options.service.append(peer.credential, { ...frame.request, loseAck: false });
      if (result.status === 'acknowledgment-unknown') { terminate(peer); return; }
      if (result.status === 'durable') {
        committed = true;
        for (const other of peers) {
          if (other === peer || !other.credential || !current(other)) continue;
          try { send(other, { protocolVersion: 1, type: 'accepted', receipt: result.receipt, state: options.service.open(other.credential) }); }
          catch { terminate(other); }
        }
        if (frame.request.loseAck === true) { terminate(peer); return; }
      }
      const response = { protocolVersion: 1 as const, type: 'append-result' as const, requestId, result };
      const schedule = (done: () => void): boolean => {
        if ((frame.delayAckMs ?? 0) <= 0) { done(); return false; }
        const timer = setTimeout(() => { peer.timers.delete(timer); done(); }, frame.delayAckMs);
        peer.timers.add(timer); return true;
      };
      if (result.status === 'durable' && options.holdAppendAck) {
        const control = new AbortController(); peer.controls.add(control);
        const deadline = setTimeout(() => { control.abort(); terminate(peer); }, limits.replyMs); peer.timers.add(deadline);
        const release = () => {
          clearTimeout(deadline); peer.timers.delete(deadline); peer.controls.delete(control);
          if (!control.signal.aborted && peers.has(peer)) reply(peer, requestId, response);
        };
        delayed = true;
        void options.holdAppendAck({ requestId, receipt: result.receipt }, control.signal)
          .then(() => { if (!control.signal.aborted && peers.has(peer)) schedule(release); })
          .catch(() => terminate(peer));
        return;
      }
      if ((frame.delayAckMs ?? 0) > 0) {
        delayed = schedule(() => reply(peer, requestId, response)); return;
      }
      reply(peer, requestId, response);
    } catch (error) {
      if (committed) { terminate(peer); return; }
      denial(peer, error instanceof RelayError ? error.code : 'invalid-request', requestId);
      if (frame.type === 'authenticate') { clearPeer(peer); peer.socket.close(1008, 'authentication-denied'); }
    } finally {
      // Delayed replies alone retain a pending slot. Each timer is one reply.
      if (!delayed) peer.pending.delete(requestId);
    }
  }
  function connect(socket: WebSocket): void {
    const peer: Peer = { socket, alive: true, seen: new Set(), pending: new Set(), timers: new Set(), controls: new Set() };
    peers.add(peer);
    const handshake = setTimeout(() => { denial(peer, 'authentication-timeout'); clearPeer(peer); socket.close(1008, 'authentication-timeout'); }, limits.handshakeMs);
    peer.timers.add(handshake);
    socket.on('pong', () => { peer.alive = true; });
    socket.on('error', () => terminate(peer));
    socket.on('close', () => clearPeer(peer));
    socket.on('message', (bytes, binary) => {
      if (!peers.has(peer) || socket.readyState !== WebSocket.OPEN) return;
      if (binary) { denial(peer, 'text-frame-required'); socket.close(1003, 'text-frame-required'); return; }
      try { processFrame(peer, decodeSheetRelayClientFrame(bytes.toString())); }
      catch { denial(peer, 'invalid-client-frame'); socket.close(1008, 'invalid-client-frame'); }
    });
  }
  function refuse(socket: Duplex, code: number): void { socket.end(`HTTP/1.1 ${code} Rejected\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`); }
  function upgrade(request: IncomingMessage, socket: Duplex, head: Buffer): void {
    const address = server.address();
    if (closed || sockets.clients.size >= limits.connections) { refuse(socket, 503); return; }
    if (!address || typeof address === 'string' || request.headers.host !== `127.0.0.1:${address.port}` || request.url !== SHEET_RELAY_WS_PATH || request.method !== 'GET' || request.headers.authorization !== undefined || request.headers['sec-websocket-protocol'] !== undefined) { refuse(socket, 403); return; }
    const origin = request.headers.origin;
    if (origin !== undefined && origin !== `http://127.0.0.1:${address.port}` && !(options.allowedOrigins ?? []).includes(origin)) { refuse(socket, 403); return; }
    try { sockets.handleUpgrade(request, socket, head, connect); } catch { socket.destroy(); }
  }
  server.on('upgrade', upgrade);
  const ping = setInterval(() => {
    for (const peer of peers) {
      if (!peer.alive) { terminate(peer); continue; }
      if (peer.credential && !current(peer)) continue;
      peer.alive = false; peer.socket.ping();
    }
  }, limits.pingIntervalMs);
  ping.unref();
  const unsubscribe = options.service.subscribeAccess(credential => {
    for (const peer of peers) if (peer.credential === credential) current(peer);
  });
  return { close: () => new Promise<void>((resolve, reject) => {
    if (closed) { resolve(); return; }
    closed = true; server.off('upgrade', upgrade); clearInterval(ping); unsubscribe();
    for (const peer of peers) terminate(peer);
    sockets.close(error => error ? reject(error) : resolve());
  }) };
}

type AccountPeer = {
  socket: WebSocket; origin: string; binding?: BoundAccountSession; access?: SheetRelayAccess; expiresAt?: number;
  authenticating: boolean; alive: boolean; epoch: number; seen: Set<string>; pending: Set<symbol>;
  timers: Set<ReturnType<typeof setTimeout>>; controls: Set<AbortController>;
  handshake?: ReturnType<typeof setTimeout>; pushing: boolean; queuedReceipt?: SheetRelayReceipt; latestPublished: number;
};
type AccountOperation = { signal: AbortSignal; assertCurrent(): void; markCommitted(): void };

/** Account authorization stays under the facade's PG lock through native work and publication. */
function attachAccountWebSocket(server: Server, options: CommonOptions & { account: Pick<AccountSheetRelay, 'scope' | 'admit' | 'consumeTicket' | 'withAuthorized' | 'logout'> }): { close(): Promise<void> } {
  const limits = SHEET_RELAY_WS_LIMITS;
  const socketOptions = { noServer: true, clientTracking: true, maxPayload: limits.frameBytes, maxFragments: limits.fragments,
    maxBufferedChunks: limits.bufferedChunks, perMessageDeflate: false, closeTimeout: 1_000, skipUTF8Validation: false };
  const sockets = new WebSocketServer(socketOptions), peers = new Set<AccountPeer>();
  let closed = false, active = 0;
  function current(peer: AccountPeer): boolean { return !closed && peers.has(peer) && peer.socket.readyState === WebSocket.OPEN; }
  function clear(peer: AccountPeer): void {
    if (peers.delete(peer)) peer.epoch++;
    for (const timer of peer.timers) clearTimeout(timer);
    for (const control of peer.controls) control.abort();
    peer.timers.clear(); peer.controls.clear(); delete peer.queuedReceipt;
  }
  function terminate(peer: AccountPeer): void { clear(peer); peer.socket.terminate(); }
  function send(peer: AccountPeer, frame: SheetRelayServerFrame, check?: () => void): void {
    if (!current(peer)) return;
    try {
      const encoded = encodeSheetRelayWsFrame(frame);
      if (peer.socket.bufferedAmount + Buffer.byteLength(encoded) > limits.bufferedBytes) { terminate(peer); return; }
      check?.(); // Full facade deadline/login fence, after synchronous encoding.
      peer.socket.send(encoded, error => { if (error) terminate(peer); });
    } catch { terminate(peer); }
  }
  function denial(peer: AccountPeer, code: string, requestId?: string): void {
    send(peer, { protocolVersion: 1, type: 'rejected', code, ...(requestId === undefined ? {} : { requestId }) });
  }
  function refusePeer(peer: AccountPeer, code: string, requestId?: string): void {
    denial(peer, code, requestId); clear(peer); peer.socket.close(1008, 'account-authority-denied');
  }
  function authorityError(error: unknown): string {
    return error instanceof RelayError && /^[A-Za-z0-9_:#-]{1,200}$/.test(error.code) ? error.code : 'account-authority-unavailable';
  }
  function access(peer: AccountPeer, value: SheetRelayAccess, check: () => void): void {
    if (peer.access !== undefined && peer.access !== value) send(peer, { protocolVersion: 1, type: 'access', access: value }, check);
    peer.access = value;
  }
  function start(peer: AccountPeer, requestId: string | undefined, work: (operation: AccountOperation) => Promise<void>): boolean {
    if (!current(peer)) return false;
    if (peer.pending.size >= limits.pendingRequests || active >= SHEET_RELAY_ACCOUNT_LIMITS.queuedOperations) {
      if (requestId !== undefined) denial(peer, peer.pending.size >= limits.pendingRequests ? 'pending-request-limit' : 'account-queue-limit', requestId);
      return false;
    }
    const key = Symbol(), epoch = peer.epoch, control = new AbortController();
    let committed = false;
    peer.pending.add(key); peer.controls.add(control); active++;
    const timer = setTimeout(() => { control.abort(); terminate(peer); }, limits.replyMs); peer.timers.add(timer);
    const assertCurrent = () => {
      if (control.signal.aborted || epoch !== peer.epoch || !current(peer)) throw new RelayError('connection-closed', 409);
      if (peer.expiresAt !== undefined && Date.now() >= peer.expiresAt) throw new RelayError('session-expired', 401);
    };
    void work({ signal: control.signal, assertCurrent, markCommitted: () => { committed = true; } }).catch(error => {
      if (control.signal.aborted || epoch !== peer.epoch || !current(peer)) return;
      const code = authorityError(error);
      // Authority can change after native COMMIT. Close without reporting rejection.
      if (committed || /(?:unknown|post-commit)/.test(code)) { terminate(peer); return; }
      if (error instanceof RelayError && (error.status === 401 || error.status === 403)) {
        if (code === 'read-only-denied') denial(peer, code, requestId);
        else refusePeer(peer, code, requestId);
        return;
      }
      if (code === 'read-only-denied') denial(peer, code, requestId);
      else refusePeer(peer, code, requestId);
    }).finally(() => {
      clearTimeout(timer); peer.timers.delete(timer); peer.controls.delete(control); peer.pending.delete(key); active--;
      control.abort();
      for (const candidate of peers) push(candidate);
    });
    return true;
  }
  function push(peer: AccountPeer): void {
    if (!peer.binding || peer.pushing || !peer.queuedReceipt || !current(peer)) return;
    const receipt = peer.queuedReceipt;
    const started = start(peer, undefined, async operation => {
      peer.pushing = true; delete peer.queuedReceipt;
      try {
        const binding = peer.binding; if (!binding) return;
        await options.account.withAuthorized(binding, 'read', operation.signal, operation.assertCurrent, (native, session, check) => {
          operation.assertCurrent(); access(peer, session.access, check); operation.assertCurrent();
          const state = native.open(session.credential);
          if (state.latestSequence >= peer.latestPublished) {
            send(peer, { protocolVersion: 1, type: 'accepted', receipt, state }, check); peer.latestPublished = state.latestSequence;
          }
        });
        operation.assertCurrent();
      } finally { peer.pushing = false; }
    });
    if (!started) peer.pushing = false;
  }
  function broadcast(origin: AccountPeer, receipt: SheetRelayReceipt): void {
    for (const peer of peers) {
      if (peer === origin || !peer.binding) continue;
      if (!peer.queuedReceipt || peer.queuedReceipt.sequence <= receipt.sequence) peer.queuedReceipt = receipt;
      push(peer);
    }
  }
  function wait(peer: AccountPeer, milliseconds: number, signal: AbortSignal): Promise<void> {
    if (milliseconds <= 0) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const abort = () => { clearTimeout(timer); peer.timers.delete(timer); reject(new RelayError('connection-closed', 409)); };
      const timer = setTimeout(() => { peer.timers.delete(timer); signal.removeEventListener('abort', abort); resolve(); }, milliseconds);
      peer.timers.add(timer); signal.addEventListener('abort', abort, { once: true });
      if (signal.aborted) abort();
    });
  }
  function process(peer: AccountPeer, frame: SheetRelayClientFrame): void {
    const requestId = frame.requestId;
    if (peer.seen.has(requestId)) { denial(peer, 'duplicate-request-id', requestId); return; }
    if (peer.seen.size >= limits.requestsPerConnection) { refusePeer(peer, 'request-count-limit', requestId); return; }
    peer.seen.add(requestId);
    if (frame.type === 'authenticate') { refusePeer(peer, 'account-authentication-required', requestId); return; }
    if (frame.type === 'authenticate-account') {
      if (peer.binding || peer.authenticating) { denial(peer, 'already-authenticating', requestId); return; }
      peer.authenticating = true; // Reserve BEFORE ticket consumption can yield.
      if (!start(peer, requestId, async operation => {
        const binding = await options.account.consumeTicket(frame.ticket, peer.origin, operation.signal, operation.assertCurrent);
        operation.assertCurrent();
        await options.account.withAuthorized(binding, 'read', operation.signal, operation.assertCurrent, (native, session, check) => {
          operation.assertCurrent(); peer.binding = binding; peer.access = session.access; peer.expiresAt = session.expiresAt;
          operation.assertCurrent();
          const state = native.open(session.credential);
          send(peer, { protocolVersion: 1, type: 'account-authenticated', requestId, session, state }, check); peer.latestPublished = state.latestSequence;
          if (peer.handshake) { clearTimeout(peer.handshake); peer.timers.delete(peer.handshake); }
          const expire = () => {
            if (!current(peer)) return;
            const remaining = session.expiresAt - Date.now();
            if (remaining <= 0) { refusePeer(peer, 'session-expired'); return; }
            const expiry = setTimeout(() => { peer.timers.delete(expiry); expire(); }, Math.min(2_147_483_647, remaining));
            peer.timers.add(expiry);
          };
          expire();
        });
        operation.assertCurrent(); peer.authenticating = false;
      })) peer.authenticating = false;
      return;
    }
    if (!peer.binding) { denial(peer, 'account-authentication-required', requestId); return; }
    const binding = peer.binding;
    start(peer, requestId, async operation => {
      if (frame.type === 'open') {
        await options.account.withAuthorized(binding, 'read', operation.signal, operation.assertCurrent, (native, session, check) => {
          operation.assertCurrent(); access(peer, session.access, check); operation.assertCurrent();
          const state = native.open(session.credential);
          if (state.latestSequence >= peer.latestPublished) { send(peer, { protocolVersion: 1, type: 'state', requestId, state }, check); peer.latestPublished = state.latestSequence; }
        }); operation.assertCurrent(); return;
      }
      if (frame.type === 'checkpoint') {
        await options.account.withAuthorized(binding, 'write', operation.signal, operation.assertCurrent, (native, session, check) => {
          operation.assertCurrent(); access(peer, session.access, check); operation.assertCurrent();
          send(peer, { protocolVersion: 1, type: 'checkpoint', requestId, checkpoint: native.checkpoint(session.credential) }, check);
        }); operation.assertCurrent(); return;
      }
      if (frame.type !== 'append') return;
      const result = await options.account.withAuthorized(binding, 'write', operation.signal, operation.assertCurrent, (native, session, check) => {
        operation.assertCurrent(); access(peer, session.access, check); operation.assertCurrent();
        const result = native.append(session.credential, { ...frame.request, loseAck: false });
        if (result.status !== 'rejected') operation.markCommitted();
        return result;
      });
      operation.assertCurrent();
      if (result.status === 'acknowledgment-unknown') { terminate(peer); return; }
      if (result.status === 'durable') {
        broadcast(peer, result.receipt);
        if (frame.request.loseAck) { terminate(peer); return; }
        if (options.holdAppendAck) { await options.holdAppendAck({ requestId, receipt: result.receipt }, operation.signal); operation.assertCurrent(); }
      }
      await wait(peer, frame.delayAckMs ?? 0, operation.signal); operation.assertCurrent();
      await options.account.withAuthorized(binding, 'write', operation.signal, operation.assertCurrent, (_native, session, check) => {
        operation.assertCurrent(); access(peer, session.access, check); operation.assertCurrent();
        send(peer, { protocolVersion: 1, type: 'append-result', requestId, result }, check);
      }); operation.assertCurrent();
    });
  }
  function connect(socket: WebSocket, origin: string): void {
    const peer: AccountPeer = { socket, origin, authenticating: false, alive: true, epoch: 0, seen: new Set(), pending: new Set(),
      timers: new Set(), controls: new Set(), pushing: false, latestPublished: 0 };
    peers.add(peer);
    peer.handshake = setTimeout(() => refusePeer(peer, 'authentication-timeout'), limits.handshakeMs); peer.timers.add(peer.handshake);
    socket.on('pong', () => { peer.alive = true; }); socket.on('error', () => terminate(peer)); socket.on('close', () => clear(peer));
    socket.on('message', (bytes, binary) => {
      if (!current(peer)) return;
      if (binary) { refusePeer(peer, 'text-frame-required'); return; }
      try { process(peer, decodeSheetRelayClientFrame(bytes.toString())); } catch { refusePeer(peer, 'invalid-client-frame'); }
    });
  }
  function upgrade(request: IncomingMessage, socket: Duplex, head: Buffer): void {
    const reject = (status: number) => socket.end(`HTTP/1.1 ${status} Rejected\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`);
    const address = server.address();
    if (closed || sockets.clients.size >= limits.connections) { reject(503); return; }
    if (!address || typeof address === 'string' || request.headers.host !== `127.0.0.1:${address.port}` || request.url !== SHEET_RELAY_WS_PATH || request.method !== 'GET' || request.headers.authorization !== undefined || request.headers['sec-websocket-protocol'] !== undefined) { reject(403); return; }
    const ownOrigin = `http://127.0.0.1:${address.port}`, origin = request.headers.origin ?? ownOrigin;
    if (origin !== ownOrigin && !(options.allowedOrigins ?? []).includes(origin)) { reject(403); return; }
    try { sockets.handleUpgrade(request, socket, head, connection => connect(connection, origin)); } catch { socket.destroy(); }
  }
  server.on('upgrade', upgrade);
  const ping = setInterval(() => {
    for (const peer of peers) {
      if (!peer.alive) { terminate(peer); continue; }
      peer.alive = false; peer.socket.ping();
      const binding = peer.binding;
      if (binding) start(peer, undefined, async operation => {
        await options.account.withAuthorized(binding, 'read', operation.signal, operation.assertCurrent, (_native, session, check) => { operation.assertCurrent(); access(peer, session.access, check); });
        operation.assertCurrent();
      });
    }
  }, limits.pingIntervalMs); ping.unref();
  let closing: Promise<void> | undefined;
  return { close: () => closing ??= new Promise<void>((resolve, reject) => {
    closed = true; server.off('upgrade', upgrade); clearInterval(ping);
    for (const peer of peers) terminate(peer);
    sockets.close(error => error ? reject(error) : resolve());
  }) };
}
