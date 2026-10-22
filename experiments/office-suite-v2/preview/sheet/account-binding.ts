import { parseSheetRelayAccountBinding, sameSheetRelayAccountBinding } from '../../src/sheet-preview-protocol.ts';
import type { SheetRelayAccountBinding } from '../../src/sheet-preview-protocol.ts';

/** The shared P3 scope. A structurally valid value is not proof of authority. */
export type AccountBinding = SheetRelayAccountBinding;

const bindingFields = ['issuer', 'subject', 'userId', 'loginBindingId', 'tenantId', 'workspaceId', 'documentId'] as const;

/** Reject unknown fields so credentials or ephemeral proof cannot enter the stored scope. */
export function normalizeAccountBinding(value: unknown): Readonly<AccountBinding> {
  return Object.freeze({ ...parseSheetRelayAccountBinding(value) });
}

export function sameAccountBinding(left: AccountBinding, right: AccountBinding): boolean {
  return sameSheetRelayAccountBinding(left, right);
}

/** Exact strings are retained. In particular, neither an issuer nor a login SID is aliased. */
export function accountNamespace(binding: AccountBinding): string {
  const normalized = normalizeAccountBinding(binding);
  return `wonffice-sheet-account-v1:${JSON.stringify(bindingFields.map(key => normalized[key]))}`;
}

/** Opaque within this gate; a token from another gate cannot resume old work. */
export interface AccountWorkToken { readonly generation: number }
export type AccountRetirement = 'logout' | 'account-switch' | 'revoked' | 'expired' | 'session-retired';
export interface AccountBindingGuardOptions {
  readonly binding: AccountBinding;
  /** Absolute Unix time in milliseconds. Never stored as part of the account binding. */
  readonly proofExpiresAt: number;
  readonly isCurrent: () => boolean;
  readonly now?: () => number;
}

/** Local callback fence only. The server must still check the current account and grant. */
export class AccountBindingGuard {
  readonly binding: Readonly<AccountBinding>;
  readonly namespace: string;
  readonly proofExpiresAt: number;
  readonly #sessionIsCurrent: () => boolean;
  readonly #now: () => number;
  readonly #tokens = new WeakSet<AccountWorkToken>();
  #generation = 0;
  #retirement: AccountRetirement | null = null;

  constructor(options: AccountBindingGuardOptions) {
    this.binding = normalizeAccountBinding(options.binding);
    this.namespace = accountNamespace(this.binding);
    if (!Number.isSafeInteger(options.proofExpiresAt) || options.proofExpiresAt <= 0) throw new Error('account-proof-expiry-invalid');
    this.proofExpiresAt = options.proofExpiresAt;
    this.#sessionIsCurrent = options.isCurrent;
    this.#now = options.now ?? Date.now;
  }

  get retirement(): AccountRetirement | null { return this.#retirement; }

  retire(reason: AccountRetirement = 'session-retired'): void {
    if (this.#retirement !== null) return;
    this.#retirement = reason;
    this.#generation += 1;
  }

  isCurrent(token?: AccountWorkToken): boolean {
    if (this.#retirement !== null) return false;
    try {
      const now = this.#now();
      if (!Number.isFinite(now) || now < 0 || now >= this.proofExpiresAt) { this.retire('expired'); return false; }
      if (!this.#sessionIsCurrent()) { this.retire(); return false; }
    } catch { this.retire(); return false; }
    return token === undefined || (this.#tokens.has(token) && token.generation === this.#generation);
  }

  assertCurrent(token?: AccountWorkToken): void {
    if (!this.isCurrent(token)) throw new Error('account-work-retired; original draft and outbox preserved');
  }

  capture(): AccountWorkToken {
    this.assertCurrent();
    const token = Object.freeze({ generation: this.#generation });
    this.#tokens.add(token);
    return token;
  }

  /** For reads/decodes: callers must not publish or mutate state inside the async operation. */
  async run<T>(token: AccountWorkToken, operation: () => Promise<T>): Promise<T> {
    this.assertCurrent(token);
    let result: T;
    try { result = await operation(); }
    catch (error) { this.assertCurrent(token); throw error; }
    this.assertCurrent(token);
    return result;
  }
}
