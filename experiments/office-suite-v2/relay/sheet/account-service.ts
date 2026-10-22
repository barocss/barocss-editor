import { randomBytes } from 'node:crypto';
import { AccountAuthority } from './account-authority.ts';
import type { VerifiedAccountLogin } from './account-authority.ts';
import { createAccountBootstrap } from './account-bootstrap.ts';
import { SheetRelayService, RelayError } from './service.ts';
import type { AccountScope } from './storage.ts';
import type { WorkbookContext } from '../../src/contracts.ts';
import { SHEET_RELAY_ACCOUNT_LIMITS, isRelayCredential, parseSheetRelayAccountBinding, sameSheetRelayAccountBinding, sameRelayContext } from '../../src/sheet-preview-protocol.ts';
import type { SheetRelayAccountAdmissionResponse, SheetRelayAccountBinding, SheetRelayAccountSession } from '../../src/sheet-preview-protocol.ts';
import { SheetAccessError } from '../../../../apps/office-service/src/sheet-access-store.ts';
import type { CurrentSheetGrant, SheetAccessIntent, SheetAccessStore } from '../../../../apps/office-service/src/sheet-access-store.ts';

export type AccountRelayOptions = Readonly<{
  scope: AccountScope; context: WorkbookContext; authority: AccountAuthority;
  accessStore: Pick<SheetAccessStore, 'withCurrentAccess'>;
  allowedOrigins: readonly string[];
  clock?: () => number;
}>;
export type AccountAdmissionInput = Readonly<{ tenantId: string; documentId: string; bearer: string; origin: string; resumeCredential?: string }>;
/** Server-only capability. Clones and capabilities from other instances are refused. */
export type BoundAccountSession = Readonly<{ sessionId: string }>;
type Bound = { proof: VerifiedAccountLogin; credential: string; binding: SheetRelayAccountBinding };
type Ticket = { proof: VerifiedAccountLogin; origin: string; expiresAt: number; binding: SheetRelayAccountBinding; resumeCredential?: string };

/** Real authority ports surround the unchanged synchronous native append path. */
export class AccountSheetRelay {
  readonly scope: AccountScope;
  readonly context: WorkbookContext;
  readonly directory: string;
  readonly #authority: AccountAuthority;
  readonly #access: AccountRelayOptions['accessStore'];
  readonly #native: SheetRelayService;
  readonly #clock: () => number;
  readonly #origins: ReadonlySet<string>;
  readonly #tickets = new Map<string, Ticket>();
  readonly #bindings = new WeakMap<BoundAccountSession, Bound>();
  readonly #controls = new Set<AbortController>();
  #tail: Promise<void> = Promise.resolve();
  #queued = 0;
  #closed = false;

  private constructor(native: SheetRelayService, options: AccountRelayOptions) {
    this.#native = native;
    this.#authority = options.authority; this.#access = options.accessStore; this.#clock = options.clock ?? Date.now;
    this.scope = Object.freeze({ ...options.scope }); this.context = native.context; this.directory = native.directory;
    this.#origins = new Set(options.allowedOrigins);
    if (this.#origins.size < 1 || this.#origins.size > 16 || [...this.#origins].some(origin => {
      try { const url = new URL(origin); return url.origin !== origin || url.protocol !== 'http:' || url.hostname !== '127.0.0.1'; } catch { return true; }
    })) throw new RelayError('invalid-account-origins');
    const storedScope = native.accountScope();
    if (storedScope.tenantId !== this.scope.tenantId || storedScope.workspaceId !== this.scope.workspaceId || storedScope.documentId !== this.scope.documentId ||
        !sameRelayContext(native.context, options.context)) throw new RelayError('account-store-scope-mismatch', 409);
  }

  static create(options: AccountRelayOptions & { bootstrapActorId: string }): AccountSheetRelay {
    const initial = createAccountBootstrap(options.context, options.bootstrapActorId);
    const native = SheetRelayService.createAccount(initial, options.scope);
    try { return new AccountSheetRelay(native, options); } catch (error) { native.close(); throw error; }
  }
  static resume(directory: string, options: AccountRelayOptions): AccountSheetRelay {
    const native = SheetRelayService.resumeAccount(directory);
    try { return new AccountSheetRelay(native, options); } catch (error) { native.close(); throw error; }
  }
  #assert(proof: VerifiedAccountLogin, signal: AbortSignal, assertCurrent: () => void, deadline?: number): void {
    if (this.#closed || signal.aborted) throw new RelayError('account-operation-aborted', 409);
    assertCurrent();
    this.#authority.assertCurrent(proof, signal);
    const now = this.#clock();
    if (!Number.isFinite(now)) throw new RelayError('account-authority-unavailable', 503);
    if (deadline !== undefined && now >= deadline) throw new RelayError('account-authority-unavailable', 503);
    if (now >= proof.expiresAt * 1000) throw new RelayError('account-session-expired', 401);
  }
  #binding(proof: VerifiedAccountLogin, grant: CurrentSheetGrant): SheetRelayAccountBinding {
    if (grant.tenantId !== this.scope.tenantId || grant.workspaceId !== this.scope.workspaceId || grant.documentId !== this.scope.documentId ||
        grant.workbookId !== this.context.workbookId || grant.generation !== this.context.generation ||
        (grant.access !== 'read-only' && grant.access !== 'read-write')) throw new RelayError('account-store-scope-mismatch', 409);
    return Object.freeze(parseSheetRelayAccountBinding({ issuer: proof.issuer, subject: proof.subject, userId: grant.userId,
      loginBindingId: proof.loginBindingId, ...this.scope }));
  }
  #sanitize(error: unknown): RelayError {
    if (error instanceof RelayError) return error;
    if (error instanceof SheetAccessError && ['read-only-denied', 'current-access-denied'].includes(error.code)) return new RelayError(error.code, 403);
    return new RelayError('account-authority-unavailable', 503);
  }

  /** Slot is retained until underlying PG work settles, even after caller timeout. */
  async #authorized<T>(proof: VerifiedAccountLogin, intent: SheetAccessIntent, signal: AbortSignal, assertCurrent: () => void,
    operation: (grant: CurrentSheetGrant, binding: SheetRelayAccountBinding, check: () => void) => T): Promise<T> {
    this.#assert(proof, signal, assertCurrent);
    const deadline = this.#clock() + SHEET_RELAY_ACCOUNT_LIMITS.authorizationMs;
    if (this.#queued >= SHEET_RELAY_ACCOUNT_LIMITS.queuedOperations) throw new RelayError('account-queue-limit', 503);
    this.#queued++;
    const control = new AbortController(); this.#controls.add(control);
    let onAbort: () => void = () => {};
    let timer: ReturnType<typeof setTimeout> | undefined;
    const startCommit = this.#native.commitEpoch;
    const interrupted = new Promise<never>((_resolve, reject) => {
      const stop = (code: string, status: number) => {
        control.abort();
        reject(new RelayError(this.#native.commitEpoch !== startCommit ? 'native-commit-acknowledgment-unknown' : code, status));
      };
      onAbort = () => stop('account-operation-aborted', 409);
      signal.addEventListener('abort', onAbort, { once: true });
      timer = setTimeout(() => stop('account-authority-unavailable', 503), SHEET_RELAY_ACCOUNT_LIMITS.authorizationMs);
      if (signal.aborted) onAbort();
    });
    const work = this.#tail.then(async () => {
      const check = () => this.#assert(proof, control.signal, assertCurrent, deadline);
      check(); await this.#authority.current(proof, control.signal); check();
      const commitBefore = this.#native.commitEpoch;
      try {
        return await this.#access.withCurrentAccess(proof, this.scope, intent, grant => {
          check(); const binding = this.#binding(proof, grant);
          if (intent === 'write' && grant.access !== 'read-write') throw new RelayError('read-only-denied', 403);
          return this.#native.withAccountGrant(grant.userId, grant.access, check, () => operation(grant, binding, check));
        });
      } catch (error) {
        if (this.#native.commitEpoch !== commitBefore) throw new RelayError('native-commit-acknowledgment-unknown', 503);
        throw this.#sanitize(error);
      }
    });
    this.#tail = work.then(() => {}, () => {});
    void work.finally(() => { this.#queued--; this.#controls.delete(control); }).catch(() => {});
    try { return await Promise.race([work, interrupted]); }
    finally { if (timer !== undefined) clearTimeout(timer); signal.removeEventListener('abort', onAbort); }
  }

  async admit(input: AccountAdmissionInput, signal: AbortSignal): Promise<SheetRelayAccountAdmissionResponse> {
    if (this.#closed || input.tenantId !== this.scope.tenantId || input.documentId !== this.scope.documentId || !this.#origins.has(input.origin) ||
        (input.resumeCredential !== undefined && !isRelayCredential(input.resumeCredential))) throw new RelayError('account-admission-denied', 403);
    const proof = await this.#authority.authenticate(input.bearer, signal);
    return this.#authorized(proof, 'read', signal, () => {}, (_grant, binding, check) => {
      // Admission probe never creates a native session or changes the registry.
      if (input.resumeCredential !== undefined) this.#native.issueAccountSession(binding, input.resumeCredential);
      check(); const now = this.#clock();
      for (const [key, value] of this.#tickets) if (value.expiresAt <= now) this.#tickets.delete(key);
      if (this.#tickets.size >= SHEET_RELAY_ACCOUNT_LIMITS.tickets) throw new RelayError('account-ticket-limit', 503);
      const ticket = randomBytes(32).toString('hex'), expiresAt = Math.min(now + SHEET_RELAY_ACCOUNT_LIMITS.ticketMs, proof.expiresAt * 1000);
      this.#tickets.set(ticket, { proof, origin: input.origin, expiresAt, binding, ...(input.resumeCredential === undefined ? {} : { resumeCredential: input.resumeCredential }) });
      return { protocolVersion: 1, ticket, expiresAt, grantExpiresAt: proof.expiresAt * 1000, accountBinding: binding };
    });
  }
  async consumeTicket(ticket: string, origin: string, signal: AbortSignal, assertCurrent: () => void): Promise<BoundAccountSession> {
    const stored = this.#tickets.get(ticket);
    this.#tickets.delete(ticket); // Burn before any asynchronous gate, including failed consumption.
    if (!stored || !isRelayCredential(ticket) || stored.origin !== origin || this.#clock() >= stored.expiresAt) throw new RelayError('account-ticket-denied', 403);
    return this.#authorized(stored.proof, 'read', signal, assertCurrent, (_grant, binding, check) => {
      check(); if (this.#clock() >= stored.expiresAt || !sameSheetRelayAccountBinding(binding, stored.binding)) throw new RelayError('account-ticket-denied', 403);
      const native = this.#native.issueAccountSession(binding, stored.resumeCredential);
      const bound = Object.freeze({ sessionId: native.identity.sessionId });
      this.#bindings.set(bound, { proof: stored.proof, credential: native.credential, binding });
      return bound;
    });
  }
  async withAuthorized<T>(bound: BoundAccountSession, intent: SheetAccessIntent, signal: AbortSignal, assertCurrent: () => void,
    operation: (native: SheetRelayService, session: SheetRelayAccountSession, check: () => void) => T): Promise<T> {
    const stored = bound && this.#bindings.get(bound);
    if (!stored || Object.prototype.toString.call(operation) === '[object AsyncFunction]') throw new RelayError('account-session-denied', 403);
    return this.#authorized(stored.proof, intent, signal, assertCurrent, (_grant, binding, check) => {
      if (!sameSheetRelayAccountBinding(stored.binding, binding)) throw new RelayError('account-session-mismatch', 403);
      const native = this.#native.issueAccountSession(binding, stored.credential);
      check();
      return operation(this.#native, { ...native, controlled: false, accountBinding: binding, expiresAt: stored.proof.expiresAt * 1000 }, check);
    });
  }
  async logout(token: string, signal: AbortSignal): Promise<void> {
    if (this.#closed) throw new RelayError('relay-closed', 503);
    await this.#authority.logout(token, signal); // No Sheet grant is required to end one's own verified login.
  }
  binding(): Readonly<Record<string, unknown>> { return Object.freeze({ ...this.#native.binding(), mode: 'account', scope: this.scope }); }
  close(): void {
    if (this.#closed) return; this.#closed = true; this.#tickets.clear();
    for (const control of this.#controls) control.abort();
    this.#native.close();
  }
}
