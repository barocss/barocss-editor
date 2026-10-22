import { SHEET_RELAY_WS_PATH, SHEET_RELAY_WS_LIMITS, encodeSheetRelayWsFrame, decodeSheetRelayServerFrame,
  parseSheetRelaySessionRequest, parseSheetRelayAppendRequest, sameRelayContext } from '../../src/sheet-preview-protocol.ts';
import type { SheetRelayAccess, SheetRelaySession, SheetRelayWsSession, SheetRelaySessionRequest,
  SheetRelayState, SheetRelayAppendRequest, SheetRelayAppendResult, SheetRelayClientFrame, SheetRelayServerFrame } from '../../src/sheet-preview-protocol.ts';

export type AuthenticatedBundle = { session: SheetRelayWsSession; state: SheetRelayState };
export type BrowserSocket = Pick<WebSocket, 'readyState' | 'bufferedAmount' | 'send' | 'close' | 'addEventListener' | 'removeEventListener'>;
export interface WebSocketTransportOptions {
  url: string;
  createSocket?: (url: string) => BrowserSocket;
  accepted: (state: SheetRelayState) => void;
  access: (access: SheetRelayAccess | 'denied') => void;
  disconnected: (reason: string) => void;
  changed?: () => void;
  /** Returns a cancellation function. The default uses browser deadlines. */
  schedule?: (action: () => void, delayMs: number) => () => void;
}
export interface WebSocketRequestMetadata {
  requestId: string; operation: 'authenticate' | 'open' | 'append'; packetId: string | null; sha256: string | null; generation: number;
}
export interface WebSocketTransportView {
  kind: 'websocket'; phase: 'idle' | 'connecting' | 'authenticating' | 'ready' | 'waiting' | 'paused' | 'denied' | 'closed';
  generation: number; framesSent: number; framesReceived: number; access: SheetRelayAccess | 'denied' | null; reconnectAttempt: number;
  pending: readonly WebSocketRequestMetadata[];
  history: readonly (WebSocketRequestMetadata & { outcome: 'reply' | 'rejected' | 'disconnected' | 'timeout' | 'aborted' })[];
}
type Outcome = WebSocketTransportView['history'][number]['outcome'];
type Pending = { metadata: WebSocketRequestMetadata; expected: 'authenticated' | 'state' | 'append-result';
  resolve: (frame: SheetRelayServerFrame) => void; reject: (error: Error) => void; cancelDeadline: () => void; cancelAbort: () => void };
const BACKOFF = [250, 500, 1000, 2000, 4000, 5000] as const;
const sameOwner = (a: SheetRelaySession, b: SheetRelaySession): boolean => a.protocolVersion === b.protocolVersion && a.controlled === b.controlled &&
  a.credential === b.credential && a.identity.actorId === b.identity.actorId && a.identity.sessionId === b.identity.sessionId && sameRelayContext(a.context, b.context);
const sameAuthentication = (a: SheetRelaySessionRequest, b: SheetRelaySessionRequest): boolean => a.resumeCredential === b.resumeCredential;
const failure = (code: string): Error => new Error(`websocket-${code}`);

/** Browser WebSocket framing only. Native admission, SHA, receipts and outbox replay stay with DurableSession. */
export class WebSocketTransport {
  readonly #options: WebSocketTransportOptions;
  readonly #url: string;
  readonly #schedule: (action: () => void, delayMs: number) => () => void;
  #socket: BrowserSocket | undefined;
  #cleanupSocket: (() => void) | undefined;
  #owner: SheetRelaySession | undefined;
  #bundle: AuthenticatedBundle | undefined;
  #initialRequest: SheetRelaySessionRequest | undefined;
  #authFlight: Promise<AuthenticatedBundle> | undefined;
  #phase: WebSocketTransportView['phase'] = 'idle';
  #access: WebSocketTransportView['access'] = null;
  #generation = 0;
  #requests = 0;
  #framesSent = 0;
  #framesReceived = 0;
  #attempt = 0;
  #cancelReconnect: (() => void) | undefined;
  #paused = false;
  #closed = false;
  readonly #pending = new Map<string, Pending>();
  readonly #history: (WebSocketRequestMetadata & { outcome: Outcome })[] = [];

  constructor(options: WebSocketTransportOptions) {
    const url = new URL(options.url);
    if (!['ws:', 'wss:'].includes(url.protocol) || url.username || url.password || url.search || url.hash || url.pathname !== SHEET_RELAY_WS_PATH) throw failure('invalid-url');
    this.#url = url.href; this.#options = options;
    this.#schedule = options.schedule ?? ((action, delay) => { const timer = setTimeout(action, delay); return () => clearTimeout(timer); });
  }
  #notify(action: () => void): void { try { action(); } catch { /* Observers do not own transport admission. */ } }
  #changed(): void { this.#notify(() => this.#options.changed?.()); }
  inspect(): WebSocketTransportView {
    return { kind: 'websocket', phase: this.#phase, generation: this.#generation, framesSent: this.#framesSent, framesReceived: this.#framesReceived,
      access: this.#access, reconnectAttempt: this.#attempt,
      pending: [...this.#pending.values()].map(pending => ({ ...pending.metadata })), history: this.#history.map(entry => ({ ...entry })) };
  }
  #usable(): void {
    if (this.#closed) throw failure('closed');
    if (this.#paused) throw failure('paused');
    if (this.#access === 'denied') throw failure('access-denied');
  }
  #cancelBackoff(): void { this.#cancelReconnect?.(); this.#cancelReconnect = undefined; }
  #finish(requestId: string, outcome: Outcome, frame?: SheetRelayServerFrame, code: string = outcome): void {
    const pending = this.#pending.get(requestId);
    if (!pending) return;
    this.#pending.delete(requestId); pending.cancelDeadline(); pending.cancelAbort();
    this.#history.push({ ...pending.metadata, outcome });
    if (this.#history.length > 128) this.#history.splice(0, this.#history.length - 128);
    if (frame) pending.resolve(frame); else pending.reject(failure(code));
    this.#changed();
  }
  #disconnect(code: string, reconnect: boolean, outcome: Outcome = 'disconnected'): void {
    this.#cancelBackoff();
    const socket = this.#socket; this.#socket = undefined;
    this.#cleanupSocket?.(); this.#cleanupSocket = undefined;
    if (socket && socket.readyState < 2) { try { socket.close(1000); } catch { /* The socket is already detached. */ } }
    this.#phase = this.#closed ? 'closed' : this.#paused ? 'paused' : this.#access === 'denied' ? 'denied' : 'waiting';
    for (const requestId of [...this.#pending.keys()]) this.#finish(requestId, outcome, undefined, code);
    this.#notify(() => this.#options.disconnected(code)); this.#changed();
    if (reconnect && this.#owner && !this.#closed && !this.#paused && this.#access !== 'denied') this.#backoff();
  }
  #deny(): void {
    this.#access = 'denied'; this.#notify(() => this.#options.access('denied'));
    this.#disconnect('access-denied', false);
  }
  #backoff(): void {
    if (this.#cancelReconnect || this.#attempt >= BACKOFF.length || !this.#owner || this.#closed || this.#paused || this.#access === 'denied') return;
    this.#cancelReconnect = this.#schedule(() => {
      this.#cancelReconnect = undefined;
      if (!this.#owner || this.#closed || this.#paused || this.#access === 'denied') return;
      this.#attempt++;
      void this.#begin({ protocolVersion: 1, resumeCredential: this.#owner.credential }, undefined, true).catch(() => {});
    }, BACKOFF[this.#attempt]!);
  }
  #reserve(frame: SheetRelayClientFrame, expected: Pending['expected'], signal: AbortSignal | undefined, deadlineMs: number): Promise<SheetRelayServerFrame> {
    if (signal?.aborted) return Promise.reject(failure('aborted'));
    if (this.#pending.size >= SHEET_RELAY_WS_LIMITS.pendingRequests) return Promise.reject(failure('pending-limit'));
    return new Promise((resolve, reject) => {
      const metadata: WebSocketRequestMetadata = { requestId: frame.requestId, operation: frame.type === 'authenticate' ? 'authenticate' : frame.type === 'append' ? 'append' : 'open',
        packetId: frame.type === 'append' ? frame.request.packet.updateId : null, sha256: frame.type === 'append' ? frame.request.packet.sha256 : null, generation: this.#generation };
      const abort = (): void => {
        if (frame.type === 'authenticate') this.#disconnect('aborted', false, 'aborted');
        else this.#finish(frame.requestId, 'aborted');
      };
      const pending: Pending = { metadata, expected, resolve, reject, cancelDeadline: () => {}, cancelAbort: () => signal?.removeEventListener('abort', abort) };
      this.#pending.set(frame.requestId, pending);
      pending.cancelDeadline = this.#schedule(() => this.#disconnect('timeout', true, 'timeout'), deadlineMs);
      signal?.addEventListener('abort', abort, { once: true });
      this.#changed();
    });
  }
  #id(): string {
    if (this.#requests >= SHEET_RELAY_WS_LIMITS.requestsPerConnection) { this.#disconnect('request-limit', true); throw failure('request-limit'); }
    this.#requests++;
    return `g${this.#generation}-r${this.#requests}`;
  }
  #send(frame: SheetRelayClientFrame): void {
    const socket = this.#socket;
    if (!socket || socket.readyState !== 1) { this.#disconnect('not-open', true); return; }
    try {
      const encoded = encodeSheetRelayWsFrame(frame);
      const bytes = new TextEncoder().encode(encoded).length;
      if (!Number.isFinite(socket.bufferedAmount) || socket.bufferedAmount < 0 || socket.bufferedAmount + bytes > SHEET_RELAY_WS_LIMITS.bufferedBytes) {
        this.#disconnect('buffer-limit', true); return;
      }
      socket.send(encoded); this.#framesSent++; this.#changed();
    } catch { this.#disconnect('send-failed', true); }
  }
  #receive(event: Event, generation: number, socket: BrowserSocket, reconnect: boolean): void {
    if (this.#socket !== socket || this.#generation !== generation || this.#closed || this.#paused) return;
    this.#framesReceived++;
    let frame: SheetRelayServerFrame;
    try {
      const data: unknown = (event as MessageEvent<unknown>).data;
      if (typeof data !== 'string') throw failure('text-only');
      frame = decodeSheetRelayServerFrame(data);
    } catch { this.#disconnect('invalid-frame', true); return; }
    if (frame.type === 'rejected') {
      const pending = frame.requestId ? this.#pending.get(frame.requestId) : undefined;
      if (frame.code === 'session-denied' || frame.code === 'current-access-denied') {
        // A matched server rejection belongs to this packet. Revocation alone does not reject another packet.
        if (pending?.metadata.operation === 'append' && (frame.updateId === undefined || frame.updateId === pending.metadata.packetId)) {
          this.#finish(frame.requestId!, 'rejected', { protocolVersion: 1, type: 'append-result', requestId: frame.requestId!,
            result: { protocolVersion: 1, status: 'rejected', code: frame.code, updateId: pending.metadata.packetId! } });
        }
        this.#deny(); return;
      }
      if (frame.code === 'read-only-denied') {
        this.#access = 'read-only'; this.#notify(() => this.#options.access('read-only'));
      }
      if (!pending) { if (!frame.requestId) this.#disconnect('server-rejected', true); return; }
      if (frame.updateId !== undefined && frame.updateId !== pending.metadata.packetId) { this.#disconnect('packet-id-mismatch', true); return; }
      if (pending.metadata.operation === 'append') {
        this.#finish(frame.requestId!, 'rejected', { protocolVersion: 1, type: 'append-result', requestId: frame.requestId!,
          result: { protocolVersion: 1, status: 'rejected', code: frame.code, updateId: pending.metadata.packetId! } });
      } else {
        this.#finish(frame.requestId!, 'rejected', undefined, 'request-rejected');
        if (pending.metadata.operation === 'authenticate') this.#disconnect('authentication-rejected', false);
      }
      this.#changed(); return;
    }
    if (frame.type === 'accepted' || frame.type === 'access') {
      if (this.#phase !== 'ready') { this.#disconnect('unauthenticated-frame', true); return; }
      if (frame.type === 'accepted') this.#notify(() => this.#options.accepted(frame.state));
      else { this.#access = frame.access; this.#notify(() => this.#options.access(frame.access)); }
      this.#changed(); return;
    }
    const pending = this.#pending.get(frame.requestId);
    if (!pending) return; // Duplicate/old correlation never resolves a newer original packet.
    if (frame.type !== pending.expected) { this.#disconnect('reply-operation-mismatch', true); return; }
    if (frame.type === 'authenticated') {
      if (this.#owner && !sameOwner(frame.session, this.#owner)) { this.#deny(); return; }
      if (this.#initialRequest?.resumeCredential !== undefined && frame.session.credential !== this.#initialRequest.resumeCredential) { this.#deny(); return; }
      this.#bundle = { session: frame.session, state: frame.state }; this.#phase = 'ready'; this.#access = frame.session.access; this.#attempt = 0;
      this.#notify(() => this.#options.access(frame.session.access));
      if (reconnect) this.#notify(() => this.#options.accepted(frame.state));
    } else if (frame.type === 'append-result') {
      const updateId = frame.result.status === 'durable' ? frame.result.receipt.updateId : frame.result.updateId;
      if (updateId !== undefined && updateId !== pending.metadata.packetId) { this.#disconnect('packet-id-mismatch', true); return; }
      if (frame.result.status === 'rejected' && frame.result.code === 'read-only-denied') {
        this.#access = 'read-only'; this.#notify(() => this.#options.access('read-only'));
      }
      if (frame.result.status === 'rejected' && (frame.result.code === 'session-denied' || frame.result.code === 'current-access-denied')) {
        this.#finish(frame.requestId, 'rejected', frame); this.#deny(); return;
      }
    }
    this.#finish(frame.requestId, 'reply', frame);
  }
  #begin(request: SheetRelaySessionRequest, signal: AbortSignal | undefined, reconnect: boolean): Promise<AuthenticatedBundle> {
    try { this.#usable(); } catch (error) { return Promise.reject(error); }
    if (signal?.aborted) return Promise.reject(failure('aborted'));
    if (this.#authFlight) return this.#authFlight;
    this.#cancelBackoff(); this.#generation++; this.#requests = 0; this.#phase = 'connecting';
    let socket: BrowserSocket;
    try { socket = (this.#options.createSocket ?? (url => new WebSocket(url)))(this.#url); }
    catch { this.#disconnect('socket-create-failed', true); return Promise.reject(failure('socket-create-failed')); }
    this.#socket = socket;
    const frame: SheetRelayClientFrame = { protocolVersion: 1, type: 'authenticate', requestId: this.#id(), session: request };
    const pending = this.#reserve(frame, 'authenticated', signal, SHEET_RELAY_WS_LIMITS.handshakeMs);
    const generation = this.#generation;
    let sent = false;
    const open: EventListener = () => {
      if (sent || this.#socket !== socket || this.#closed || this.#paused) return;
      sent = true; this.#phase = 'authenticating'; this.#send(frame);
    };
    const message: EventListener = event => this.#receive(event, generation, socket, reconnect);
    const close: EventListener = () => { if (this.#socket === socket) this.#disconnect('socket-closed', true); };
    const error: EventListener = () => { if (this.#socket === socket) this.#disconnect('socket-error', true); };
    socket.addEventListener('open', open); socket.addEventListener('message', message);
    socket.addEventListener('close', close); socket.addEventListener('error', error);
    this.#cleanupSocket = () => {
      socket.removeEventListener('open', open); socket.removeEventListener('message', message);
      socket.removeEventListener('close', close); socket.removeEventListener('error', error);
    };
    const flight = pending.then(reply => {
      if (reply.type !== 'authenticated') throw failure('authentication-required');
      return { session: structuredClone(reply.session), state: structuredClone(reply.state) };
    });
    this.#authFlight = flight;
    void flight.then(() => { if (this.#authFlight === flight) this.#authFlight = undefined; }, () => { if (this.#authFlight === flight) this.#authFlight = undefined; });
    if (socket.readyState === 1) queueMicrotask(() => open(new Event('open')));
    this.#changed(); return flight;
  }
  authenticate(request: SheetRelaySessionRequest, signal?: AbortSignal): Promise<AuthenticatedBundle> {
    try {
      this.#usable();
      const parsed = parseSheetRelaySessionRequest(request);
      if (this.#owner && parsed.resumeCredential !== this.#owner.credential) throw failure('original-credential-required');
      if (!this.#owner && this.#initialRequest && !sameAuthentication(parsed, this.#initialRequest)) throw failure('original-authentication-required');
      if (this.#phase === 'ready' && this.#bundle) return Promise.resolve(structuredClone(this.#bundle));
      if (this.#initialRequest && parsed.resumeCredential === undefined && !this.#authFlight) throw failure('unconfirmed-new-session');
      this.#initialRequest = parsed;
      return this.#begin(parsed, signal, false);
    } catch (error) { return Promise.reject(error); }
  }
  async #ensure(signal: AbortSignal | undefined): Promise<void> {
    this.#usable(); if (signal?.aborted) throw failure('aborted');
    if (!this.#owner) throw failure('owner-not-pinned');
    if (this.#phase === 'ready' && this.#socket?.readyState === 1) return;
    if (this.#authFlight) { await this.#authFlight; this.#usable(); return; }
    this.#cancelBackoff(); this.#attempt = 0;
    await this.#begin({ protocolVersion: 1, resumeCredential: this.#owner.credential }, signal, true);
  }
  async #operation(type: 'open' | 'append', request: SheetRelayAppendRequest | undefined, signal: AbortSignal | undefined): Promise<SheetRelayServerFrame> {
    await this.#ensure(signal);
    if (this.#pending.size >= SHEET_RELAY_WS_LIMITS.pendingRequests) throw failure('pending-limit');
    const requestId = this.#id();
    const frame: SheetRelayClientFrame = type === 'append' ? { protocolVersion: 1, type, requestId, request: parseSheetRelayAppendRequest(request) } : { protocolVersion: 1, type, requestId };
    const reply = this.#reserve(frame, type === 'append' ? 'append-result' : 'state', signal, SHEET_RELAY_WS_LIMITS.replyMs);
    // Abort may synchronously settle a request; do not send a settled correlation.
    if (this.#pending.has(requestId)) this.#send(frame);
    return reply;
  }
  async open(owner: SheetRelaySession, signal?: AbortSignal): Promise<SheetRelayState> {
    this.#usable();
    if (this.#owner ? !sameOwner(owner, this.#owner) : !this.#bundle || !sameOwner(owner, this.#bundle.session)) throw failure('original-session-mismatch');
    if (!this.#owner) this.#owner = { protocolVersion: 1, controlled: true, credential: owner.credential, identity: { ...owner.identity }, context: { ...owner.context } };
    return this.state(signal);
  }
  async append(request: SheetRelayAppendRequest, signal?: AbortSignal): Promise<SheetRelayAppendResult> {
    const reply = await this.#operation('append', request, signal);
    if (reply.type !== 'append-result') throw failure('reply-operation-mismatch');
    return reply.result;
  }
  async state(signal?: AbortSignal): Promise<SheetRelayState> {
    const reply = await this.#operation('open', undefined, signal);
    if (reply.type !== 'state') throw failure('reply-operation-mismatch');
    return reply.state;
  }
  setPaused(paused: boolean): void {
    if (this.#closed || this.#paused === paused) return;
    this.#paused = paused;
    if (paused) this.#disconnect('paused', false);
    else { this.#phase = this.#access === 'denied' ? 'denied' : 'waiting'; this.#attempt = 0; this.#backoff(); this.#changed(); }
  }
  close(): void {
    if (this.#closed) return;
    this.#closed = true; this.#disconnect('closed', false);
  }
}
