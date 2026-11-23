import { createHash } from 'node:crypto';
import { RelayError } from './service.ts';

/** Structural boundary for the existing configured OIDC implementation. */
export type AccountTokenClaims = Readonly<{
  issuer: string; subject: string; sessionId: string;
  /** Verified access-token expiry, in Unix seconds. */
  expiresAt: number;
}>;
export type AccountTokenVerifier = Readonly<{
  verifySession(accessToken: string): Promise<AccountTokenClaims>;
}>;
export type AccountSessionGateInput = Readonly<{
  accessToken: string; issuer: string; subject: string; sessionId: string;
  /** Verified access-token expiry, in Unix seconds. */
  expiresAt: number;
}>;
export type AccountSessionGate = (input: AccountSessionGateInput, signal: AbortSignal) => Promise<boolean>;
export type AccountLogoutSession = (input: AccountSessionGateInput, signal: AbortSignal) => Promise<boolean>;
export type VerifiedAccountLogin = Readonly<{
  issuer: string; subject: string; sessionId: string;
  /** Verified access-token expiry, in Unix seconds. */
  expiresAt: number; loginBindingId: string;
}>;
export type AccountAuthorityOptions = Readonly<{
  verifier: AccountTokenVerifier;
  sessionGate: AccountSessionGate;
  logoutSession?: AccountLogoutSession;
  /** Unix milliseconds. */
  clock?: () => number;
}>;

const GATE_DEADLINE_MS = 5000;
type Claims = AccountTokenClaims;

/** Reuses the configured OIDC verifier. The injected live provider gate is mandatory. */
export class AccountAuthority {
  readonly #verifier: AccountAuthorityOptions['verifier'];
  readonly #sessionGate: AccountSessionGate;
  readonly #logoutSession: AccountLogoutSession | undefined;
  readonly #clock: () => number;
  readonly #tokens = new WeakMap<VerifiedAccountLogin, string>();

  constructor(options: AccountAuthorityOptions) {
    this.#verifier = options.verifier;
    this.#sessionGate = options.sessionGate;
    this.#logoutSession = options.logoutSession;
    this.#clock = options.clock ?? Date.now;
  }

  async authenticate(accessToken: string, signal: AbortSignal): Promise<VerifiedAccountLogin> {
    this.#token(accessToken);
    return this.#bounded(signal, async boundedSignal => {
      const claims = await this.#verify(accessToken, boundedSignal);
      await this.#live(accessToken, claims, boundedSignal);
      this.#check(claims, boundedSignal);
      const proof: VerifiedAccountLogin = Object.freeze({ ...claims,
        loginBindingId: createHash('sha256').update(JSON.stringify([
          'wonffice.sheet.login.v1', claims.issuer, claims.subject, claims.sessionId,
        ]), 'utf8').digest('hex'),
      });
      this.#tokens.set(proof, accessToken);
      return proof;
    });
  }

  /** A signed, unexpired access token may retire only its own verified provider sid. */
  async logout(accessToken: string, signal: AbortSignal): Promise<void> {
    this.#token(accessToken);
    return this.#bounded(signal, async boundedSignal => {
      const claims = await this.#verify(accessToken, boundedSignal);
      if (!await this.#active(accessToken, claims, boundedSignal)) return;
      if (!this.#logoutSession) throw new RelayError('account-logout-unconfirmed', 503);
      let confirmed: boolean;
      try { confirmed = await this.#logoutSession(Object.freeze({ accessToken, ...claims }), boundedSignal); }
      catch {
        if (boundedSignal.aborted) throw new RelayError('account-operation-aborted', 409);
        throw new RelayError('account-authority-unavailable', 503);
      }
      this.#check(claims, boundedSignal);
      if (confirmed !== true || await this.#active(accessToken, claims, boundedSignal)) {
        throw new RelayError('account-logout-unconfirmed', 503);
      }
      this.#check(claims, boundedSignal);
    });
  }

  #token(accessToken: string): void {
    if (typeof accessToken !== 'string' || accessToken.length > 8192 ||
      !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(accessToken)) {
      throw new RelayError('account-authentication-denied', 401);
    }
  }

  async current(proof: VerifiedAccountLogin, signal: AbortSignal): Promise<void> {
    const accessToken = proof && this.#tokens.get(proof);
    if (!accessToken) throw new RelayError('account-authentication-denied', 401);
    return this.#bounded(signal, async boundedSignal => {
      this.#check(proof, boundedSignal);
      const claims = await this.#verify(accessToken, boundedSignal);
      if (claims.issuer !== proof.issuer || claims.subject !== proof.subject ||
        claims.sessionId !== proof.sessionId || claims.expiresAt !== proof.expiresAt) {
        throw new RelayError('account-authentication-denied', 401);
      }
      await this.#live(accessToken, claims, boundedSignal);
      this.#check(proof, boundedSignal);
    });
  }

  #check(claims: Claims, signal: AbortSignal): void {
    if (signal.aborted) throw new RelayError('account-operation-aborted', 409);
    const now = this.#clock();
    if (!Number.isFinite(now)) throw new RelayError('account-authority-unavailable', 503);
    if (now >= claims.expiresAt * 1000) throw new RelayError('account-session-expired', 401);
  }

  async #verify(accessToken: string, signal: AbortSignal): Promise<Claims> {
    if (signal.aborted) throw new RelayError('account-operation-aborted', 409);
    let claims: Claims;
    try { claims = await this.#verifier.verifySession(accessToken); }
    catch (error) {
      if (signal.aborted) throw new RelayError('account-operation-aborted', 409);
      if (error instanceof Error && error.message === 'invalid_access_token') throw new RelayError('account-authentication-denied', 401);
      // Provider errors and unexpected verifier failures never expose their messages.
      throw new RelayError('account-authority-unavailable', 503);
    }
    if (!claims || typeof claims.issuer !== 'string' || claims.issuer.length < 1 || claims.issuer.length > 2048 ||
      typeof claims.subject !== 'string' || claims.subject.length < 1 || claims.subject.length > 255 ||
      typeof claims.sessionId !== 'string' || claims.sessionId.length < 1 || claims.sessionId.length > 255 ||
      !Number.isSafeInteger(claims.expiresAt) || claims.expiresAt < 1 || !Number.isSafeInteger(claims.expiresAt * 1000)) {
      throw new RelayError('account-authentication-denied', 401);
    }
    this.#check(claims, signal);
    // Explicit selection prevents a verifier extension from leaking token or other claims.
    return { issuer: claims.issuer, subject: claims.subject, sessionId: claims.sessionId, expiresAt: claims.expiresAt };
  }

  async #live(accessToken: string, claims: Claims, signal: AbortSignal): Promise<void> {
    if (!await this.#active(accessToken, claims, signal)) throw new RelayError('account-session-denied', 403);
  }

  async #active(accessToken: string, claims: Claims, signal: AbortSignal): Promise<boolean> {
    this.#check(claims, signal);
    let active: boolean;
    try { active = await this.#sessionGate(Object.freeze({ accessToken, ...claims }), signal); }
    catch {
      if (signal.aborted) throw new RelayError('account-operation-aborted', 409);
      throw new RelayError('account-authority-unavailable', 503);
    }
    this.#check(claims, signal);
    // A non-boolean adapter result is a failed authority response, never inactive confirmation.
    if (active !== true && active !== false) throw new RelayError('account-authority-unavailable', 503);
    return active;
  }

  async #bounded<T>(signal: AbortSignal, run: (boundedSignal: AbortSignal) => Promise<T>): Promise<T> {
    if (signal.aborted) throw new RelayError('account-operation-aborted', 409);
    const controller = new AbortController();
    let onAbort: () => void = () => {};
    let timer: ReturnType<typeof setTimeout> | undefined;
    const stopped = new Promise<never>((_resolve, reject) => {
      onAbort = () => {
        controller.abort();
        reject(new RelayError('account-operation-aborted', 409));
      };
      signal.addEventListener('abort', onAbort, { once: true });
      timer = setTimeout(() => {
        controller.abort();
        reject(new RelayError('account-authority-unavailable', 503));
      }, GATE_DEADLINE_MS);
    });
    try { return await Promise.race([stopped, run(controller.signal)]); }
    finally {
      if (timer !== undefined) clearTimeout(timer);
      signal.removeEventListener('abort', onAbort);
    }
  }
}
