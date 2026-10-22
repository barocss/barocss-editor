/** Thin Sheet adapter. Office remains the sole owner of OIDC and bearer tokens. */
export type SheetTenantRole = 'owner' | 'admin' | 'editor' | 'viewer';
export type SheetAccountIdentity = {
  issuer: string;
  subject: string;
  currentUserId?: string | null;
  tenants: { tenantId: string; name: string; role: SheetTenantRole }[];
};
export type SheetReturnLocation = { tenantId?: string; workspaceId?: string; documentId?: string; clientId?: string; new?: true };
export type CapturedAccountSession = { requestFetch: typeof fetch; isCurrent: () => boolean };
export type AuthClientPort = {
  beginLogin: (intent: 'user', forceAccountChoice?: boolean) => Promise<void>;
  finishLogin: () => Promise<'user' | 'admin' | 'operator'>;
  consumeResumeIntent: () => 'user' | 'admin' | 'operator' | null;
  consumeLogoutReturn: () => boolean;
  loadIdentity: () => Promise<SheetAccountIdentity>;
  confirmTenant: (tenantId: string) => Promise<SheetTenantRole>;
  listWorkspaces: (tenantId: string, after?: string) => Promise<{ items: { id: string; name: string }[]; nextCursor: string | null }>;
  captureAuthorizedSession: () => CapturedAccountSession;
  announceLogout: () => void;
  clearSession: () => void;
  isLogoutEvent: (event: StorageEvent) => boolean;
};
export type AccountLoginBrowser = {
  href: () => string;
  replace: (path: string) => void;
  storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
  listenStorage: (listener: (event: StorageEvent) => void) => () => void;
  now: () => number;
  schedule: (callback: () => void, delayMs: number) => () => void;
};
export type SheetAccountLease = CapturedAccountSession & {
  setExpiresAt: (expiresAtMs: number) => void;
  retire: () => void;
};

const returnKey = 'wonffice.sheet.account-return-v1';
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const fields = { tenant: 'tenantId', workspace: 'workspaceId', document: 'documentId', client: 'clientId' } as const;

/** These are requested IDs only. Admission must verify every account and document. */
export function readSheetReturnLocation(href: string, origin: string): SheetReturnLocation {
  const url = new URL(href, origin);
  if (url.origin !== origin || url.pathname !== '/' || url.hash || url.username || url.password) throw new Error('Invalid Sheet return location.');
  const result: SheetReturnLocation = {};
  for (const key of url.searchParams.keys()) {
    if (key === 'new') {
      if (url.searchParams.getAll(key).length !== 1 || url.searchParams.get(key) !== '1') throw new Error('Invalid Sheet new-client request.');
      result.new = true;
      continue;
    }
    if (!Object.hasOwn(fields, key) || url.searchParams.getAll(key).length !== 1) throw new Error('Invalid Sheet return parameters.');
    const value = url.searchParams.get(key)!;
    if (!uuid.test(value)) throw new Error('Invalid Sheet return identity.');
    result[fields[key as keyof typeof fields]] = value.toLowerCase();
  }
  if (!!result.tenantId !== !!result.documentId || (result.workspaceId && !result.tenantId) || (result.new && !result.clientId)) throw new Error('Incomplete Sheet return scope.');
  return result;
}

export function sheetReturnPath(target: SheetReturnLocation): string {
  const params = new URLSearchParams();
  for (const [key, field] of Object.entries(fields)) {
    const value = target[field as Exclude<keyof SheetReturnLocation, 'new'>];
    if (value !== undefined) params.set(key, value);
  }
  if (target.new) params.set('new', '1');
  const path = `/${params.size ? `?${params}` : ''}`;
  readSheetReturnLocation(path, 'https://sheet.invalid');
  return path;
}

export class SheetAccountLogin {
  readonly #auth: AuthClientPort;
  readonly #browser: AccountLoginBrowser;
  readonly #removeStorageListener: () => void;
  readonly #retirements = new Set<() => void>();
  readonly #leases = new Set<() => void>();
  #generation = 0;
  #disposed = false;

  constructor(auth: AuthClientPort, browser: AccountLoginBrowser) {
    this.#auth = auth;
    this.#browser = browser;
    this.#removeStorageListener = browser.listenStorage(event => {
      if (!auth.isLogoutEvent(event)) return;
      this.retire();
      auth.clearSession();
    });
  }

  subscribeRetirement(callback: () => void): () => void {
    this.#retirements.add(callback);
    return () => { this.#retirements.delete(callback); };
  }

  retire(): void {
    ++this.#generation;
    for (const retire of [...this.#leases]) retire();
    for (const callback of [...this.#retirements]) {
      try { callback(); } catch { /* Each consumer must receive retirement. */ }
    }
  }

  async beginLogin(target: SheetReturnLocation, forceAccountChoice = false): Promise<void> {
    this.#checkAlive();
    const path = sheetReturnPath(target);
    const previous = this.#browser.href();
    const origin = new URL(previous).origin;
    this.retire();
    const generation = this.#generation;
    const record = JSON.stringify({ version: 1, origin, path });
    this.#browser.storage.setItem(returnKey, record);
    // Office's route parser does not recognize standalone Sheet query fields.
    this.#browser.replace('/');
    try { await this.#auth.beginLogin('user', forceAccountChoice); }
    catch (error) {
      if (this.#ownsGeneration(generation) && this.#browser.storage.getItem(returnKey) === record) {
        this.#browser.storage.removeItem(returnKey);
        this.#browser.replace(new URL(previous).pathname + new URL(previous).search + new URL(previous).hash);
      }
      throw error;
    }
  }

  async finishLogin(): Promise<SheetReturnLocation> {
    this.#checkAlive();
    const generation = this.#generation;
    const origin = new URL(this.#browser.href()).origin;
    const raw = this.#browser.storage.getItem(returnKey);
    this.#browser.storage.removeItem(returnKey);
    // Office consumes state/PKCE and scrubs the callback code before network I/O.
    const intent = await this.#auth.finishLogin();
    this.#checkGeneration(generation);
    const resume = this.#auth.consumeResumeIntent();
    if (intent !== 'user' || resume !== 'user' || !raw) throw new Error('Missing Sheet login return context.');
    const saved: unknown = JSON.parse(raw);
    if (!saved || typeof saved !== 'object' || Array.isArray(saved)) throw new Error('Invalid Sheet login return context.');
    const value = saved as Record<string, unknown>;
    if (value.version !== 1 || value.origin !== origin || typeof value.path !== 'string' || Object.keys(value).length !== 3) throw new Error('Invalid Sheet login return context.');
    const target = readSheetReturnLocation(value.path, origin);
    this.#browser.replace(sheetReturnPath(target));
    return target;
  }

  consumeLogoutReturn(): boolean { return this.#auth.consumeLogoutReturn(); }

  async loadIdentity(): Promise<SheetAccountIdentity> {
    const lease = this.captureAuthorizedSession();
    try { const result = await this.#auth.loadIdentity(); this.#checkLease(lease); return result; }
    finally { lease.retire(); }
  }

  async confirmTenant(tenantId: string): Promise<SheetTenantRole> {
    if (!uuid.test(tenantId)) throw new Error('Invalid tenant identity.');
    const lease = this.captureAuthorizedSession();
    try { const result = await this.#auth.confirmTenant(tenantId); this.#checkLease(lease); return result; }
    finally { lease.retire(); }
  }

  async listWorkspaces(tenantId: string, after?: string): Promise<{ items: { id: string; name: string }[]; nextCursor: string | null }> {
    if (!uuid.test(tenantId) || (after !== undefined && !uuid.test(after))) throw new Error('Invalid workspace scope.');
    const lease = this.captureAuthorizedSession();
    try { const result = await this.#auth.listWorkspaces(tenantId, after); this.#checkLease(lease); return result; }
    finally { lease.retire(); }
  }

  /** Before admission, omit expiry only for the admission request. Bind its verified expiry immediately. */
  captureAuthorizedSession(expiresAtMs?: number): SheetAccountLease {
    this.#checkAlive();
    const captured = this.#auth.captureAuthorizedSession();
    const generation = this.#generation;
    let expiry = Infinity;
    let retired = false;
    let cancelTimer = () => {};
    const retire = () => {
      if (retired) return;
      retired = true;
      cancelTimer();
      this.#leases.delete(retire);
    };
    const isCurrent = () => {
      if (!retired && (this.#disposed || generation !== this.#generation || !captured.isCurrent() || this.#browser.now() >= expiry)) {
        retire();
        this.retire();
      }
      return !retired;
    };
    const check = () => { if (!isCurrent()) throw new Error('Sheet account session retired.'); };
    const requestFetch: typeof fetch = async (input, init) => {
      check();
      const response = await captured.requestFetch(input, init);
      check();
      const decode = response.json.bind(response);
      response.json = async () => { check(); const value: unknown = await decode(); check(); return value; };
      return response;
    };
    const setExpiresAt = (value: number) => {
      if (!Number.isSafeInteger(value) || value <= this.#browser.now()) { retire(); this.retire(); throw new Error('Invalid or expired Sheet account proof.'); }
      check();
      // One lease cannot extend authority with an unverified replacement timestamp.
      expiry = Math.min(expiry, value);
      cancelTimer();
      const arm = () => {
        cancelTimer = this.#browser.schedule(() => {
          if (retired) return;
          if (this.#browser.now() >= expiry) { retire(); this.retire(); }
          else arm();
        }, Math.min(expiry - this.#browser.now(), 2_147_483_647));
      };
      arm();
    };
    this.#leases.add(retire);
    if (expiresAtMs !== undefined) setExpiresAt(expiresAtMs);
    check();
    return Object.freeze({ requestFetch, isCurrent, setExpiresAt, retire });
  }

  /** The owner decodes the server DTO before returning true. Failure always retires local authority. */
  async logout(serverLogout?: (requestFetch: typeof fetch) => Promise<boolean>): Promise<'confirmed' | 'unconfirmed'> {
    this.#checkAlive();
    const captured = this.#auth.captureAuthorizedSession();
    this.retire();
    const generation = this.#generation;
    this.#browser.storage.removeItem(returnKey);
    try {
      if (!serverLogout || !captured.isCurrent()) return 'unconfirmed';
      const confirmed = await serverLogout(captured.requestFetch);
      return confirmed === true && captured.isCurrent() && generation === this.#generation ? 'confirmed' : 'unconfirmed';
    } catch { return 'unconfirmed'; }
    finally {
      if (this.#ownsGeneration(generation) && captured.isCurrent()) {
        this.#auth.clearSession(); this.#auth.announceLogout();
      }
    }
  }

  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    this.retire();
    this.#removeStorageListener();
    this.#retirements.clear();
  }

  #checkAlive(): void { if (this.#disposed) throw new Error('Sheet account login disposed.'); }
  #ownsGeneration(generation: number): boolean { return !this.#disposed && generation === this.#generation; }
  #checkGeneration(generation: number): void {
    this.#checkAlive();
    if (generation !== this.#generation) throw new Error('Sheet account session retired.');
  }
  #checkLease(lease: SheetAccountLease): void { if (!lease.isCurrent()) throw new Error('Sheet account session retired.'); }
}

/** The entry point supplies the existing Office module through its approved browser graph. */
export function createBrowserAccountLogin(auth: AuthClientPort): SheetAccountLogin {
  return new SheetAccountLogin(auth, {
    href: () => location.href,
    replace: path => { history.replaceState(null, '', path); },
    storage: sessionStorage,
    listenStorage: listener => { window.addEventListener('storage', listener); return () => { window.removeEventListener('storage', listener); }; },
    now: () => Date.now(),
    schedule: (callback, delayMs) => { const timer = setTimeout(callback, delayMs); return () => { clearTimeout(timer); }; },
  });
}
