import type { Server, IncomingMessage } from 'node:http';
import type { Duplex } from 'node:stream';
import { WebSocket, WebSocketServer } from 'ws';
import { decodeSheetRelayClientFrame, encodeSheetRelayWsFrame, SHEET_RELAY_WS_LIMITS, SHEET_RELAY_WS_PATH } from '../../src/sheet-preview-protocol.ts';
import type { SheetRelayAccess, SheetRelayClientFrame, SheetRelayReceipt, SheetRelayServerFrame } from '../../src/sheet-preview-protocol.ts';
import { RelayError } from './service.ts';
import type { SheetRelayService } from './service.ts';

type Peer = {
  socket: WebSocket; credential?: string; access?: SheetRelayAccess; alive: boolean;
  seen: Set<string>; pending: Set<string>; timers: Set<ReturnType<typeof setTimeout>>; controls: Set<AbortController>;
};
export type SheetRelayWebSocketOptions = {
  service: SheetRelayService; allowedOrigins?: readonly string[];
  /** Trusted Node-only fault/control seam. Receives an actual committed receipt. */
  holdAppendAck?: (metadata: Readonly<{ requestId: string; receipt: SheetRelayReceipt }>, signal: AbortSignal) => Promise<void>;
};

/** Attaches transport only. The caller owns the HTTP listener and durable service. */
export function attachSheetRelayWebSocket(server: Server, options: SheetRelayWebSocketOptions): { close(): Promise<void> } {
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
