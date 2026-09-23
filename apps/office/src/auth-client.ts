export type EntryIntent = 'user' | 'admin';
export type TenantRole = 'owner' | 'admin' | 'editor' | 'viewer';
export type TenantAccess = { tenantId: string; name: string; role: TenantRole };
export type Identity = { issuer: string; subject: string; tenants: TenantAccess[] };

type Discovery = {
  issuer: string;
  authorization_endpoint: string;
  token_endpoint: string;
  end_session_endpoint?: string;
};
type PendingLogin = { state: string; verifier: string; intent: EntryIntent };
type Session = { accessToken: string; idToken?: string; expiresAt: number; intent: EntryIntent };

const pendingKey = 'wonffice.oidc.pending';
const logoutKey = 'wonffice.oidc.logout';
const forcePromptKey = 'wonffice.oidc.prompt-login';
const logoutReturnKey = 'wonffice.oidc.logout-return';
const resumeKey = 'wonffice.oidc.resume-intent';
const issuer = import.meta.env.VITE_OFFICE_OIDC_ISSUER?.replace(/\/$/, '');
const clientId = import.meta.env.VITE_OFFICE_OIDC_CLIENT_ID;
let activeSession: Session | null = null;

export class AuthError extends Error {
  constructor(public readonly kind: 'cancelled' | 'login' | 'unauthorized' | 'forbidden' | 'unavailable' | 'configuration', message: string) {
    super(message);
  }
}

function configuration() {
  if (!issuer || !clientId) throw new AuthError('configuration', '로그인 서버 설정이 없습니다. 운영 담당자에게 알려 주세요.');
  const url = new URL(issuer);
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname))) {
    throw new AuthError('configuration', '로그인 서버 주소가 안전하지 않습니다.');
  }
  return { issuer, clientId };
}

function callbackUrl() {
  return new URL('/auth/callback', location.origin).href;
}

function base64url(bytes: Uint8Array) {
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function randomValue() {
  return base64url(crypto.getRandomValues(new Uint8Array(32)));
}

async function challenge(verifier: string) {
  return base64url(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))));
}

async function discover(): Promise<Discovery> {
  const config = configuration();
  let response: Response;
  try {
    response = await fetch(`${config.issuer}/.well-known/openid-configuration`, { cache: 'no-store', signal: AbortSignal.timeout(10000) });
  } catch {
    throw new AuthError('unavailable', '로그인 서버에 연결하지 못했습니다. 다시 시도해 주세요.');
  }
  if (!response.ok) throw new AuthError('unavailable', '로그인 서버가 응답하지 않습니다. 다시 시도해 주세요.');
  const body = await response.json() as Partial<Discovery>;
  const sameOrigin = (value: unknown) => {
    if (typeof value !== 'string') return false;
    try { return new URL(value).origin === new URL(config.issuer).origin && new URL(value).protocol === new URL(config.issuer).protocol; }
    catch { return false; }
  };
  if (body.issuer !== config.issuer || !sameOrigin(body.authorization_endpoint) || !sameOrigin(body.token_endpoint) ||
    (body.end_session_endpoint !== undefined && !sameOrigin(body.end_session_endpoint))) {
    throw new AuthError('configuration', '로그인 서버 정보가 설정과 일치하지 않습니다.');
  }
  return body as Discovery;
}

export async function beginLogin(intent: EntryIntent, forceAccountChoice = false, silent = false) {
  const config = configuration();
  const discovery = await discover();
  const state = randomValue();
  const verifier = randomValue();
  sessionStorage.setItem(pendingKey, JSON.stringify({ state, verifier, intent } satisfies PendingLogin));
  const url = new URL(discovery.authorization_endpoint);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('client_id', config.clientId);
  url.searchParams.set('redirect_uri', callbackUrl());
  url.searchParams.set('scope', 'openid');
  url.searchParams.set('state', state);
  url.searchParams.set('code_challenge_method', 'S256');
  url.searchParams.set('code_challenge', await challenge(verifier));
  if (silent) url.searchParams.set('prompt', 'none');
  else if (forceAccountChoice || sessionStorage.getItem(forcePromptKey) === '1') url.searchParams.set('prompt', 'login');
  sessionStorage.removeItem(forcePromptKey);
  location.assign(url.href);
}

export async function finishLogin(): Promise<EntryIntent> {
  const params = new URLSearchParams(location.search);
  const raw = sessionStorage.getItem(pendingKey);
  sessionStorage.removeItem(pendingKey);
  // Remove the one-time authorization code from browser history before any network request.
  history.replaceState(null, '', '/');
  let pending: PendingLogin | null = null;
  try { pending = raw ? JSON.parse(raw) as PendingLogin : null; } catch { /* invalid browser state */ }
  if (!pending || params.get('state') !== pending.state || !pending.verifier) {
    throw new AuthError('login', '로그인 요청을 확인하지 못했습니다. 다시 로그인해 주세요.');
  }
  if (params.has('error')) {
    throw new AuthError(params.get('error') === 'access_denied' ? 'cancelled' : 'login', '로그인이 완료되지 않았습니다. 다시 시도할 수 있습니다.');
  }
  const code = params.get('code');
  if (!code) throw new AuthError('login', '로그인 응답에 인증 코드가 없습니다.');
  const config = configuration();
  const discovery = await discover();
  let response: Response;
  try {
    response = await fetch(discovery.token_endpoint, {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, cache: 'no-store',
      body: new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: callbackUrl(), client_id: config.clientId, code_verifier: pending.verifier }),
      signal: AbortSignal.timeout(10000),
    });
  } catch {
    throw new AuthError('unavailable', '로그인 결과를 확인하지 못했습니다. 다시 시도해 주세요.');
  }
  if (!response.ok) throw new AuthError('login', '로그인이 완료되지 않았습니다. 다시 시도해 주세요.');
  const token = await response.json() as { access_token?: unknown; id_token?: unknown; token_type?: unknown; expires_in?: unknown };
  if (typeof token.access_token !== 'string' || token.token_type?.toString().toLowerCase() !== 'bearer' ||
    typeof token.expires_in !== 'number' || token.expires_in <= 0) {
    throw new AuthError('login', '로그인 서버 응답을 확인하지 못했습니다.');
  }
  activeSession = {
    accessToken: token.access_token,
    idToken: typeof token.id_token === 'string' ? token.id_token : undefined,
    expiresAt: Date.now() + token.expires_in * 1000,
    intent: pending.intent,
  };
  sessionStorage.setItem(resumeKey, pending.intent);
  return pending.intent;
}

export function currentIntent() { return activeSession?.intent ?? null; }
export function consumeResumeIntent(): EntryIntent | null {
  const value = sessionStorage.getItem(resumeKey);
  sessionStorage.removeItem(resumeKey);
  return value === 'user' || value === 'admin' ? value : null;
}
export function clearSession() { activeSession = null; sessionStorage.removeItem(pendingKey); sessionStorage.removeItem(resumeKey); }
export function announceLogout() { localStorage.setItem(logoutKey, String(Date.now())); }
export function isLogoutEvent(event: StorageEvent) { return event.key === logoutKey; }
export function consumeLogoutReturn() {
  const expected = sessionStorage.getItem(logoutReturnKey);
  const url = new URL(location.href);
  const returned = !!expected && url.searchParams.get('state') === expected;
  sessionStorage.removeItem(logoutReturnKey);
  if (url.searchParams.has('state')) {
    url.searchParams.delete('state');
    history.replaceState(null, '', url.pathname + url.search + url.hash);
  }
  return returned;
}

async function apiGet(path: string): Promise<unknown> {
  const token = activeSession;
  if (!token || token.expiresAt <= Date.now()) { clearSession(); throw new AuthError('unauthorized', '로그인이 만료되었습니다. 다시 로그인해 주세요.'); }
  let response: Response;
  try {
    response = await fetch(`/api${path}`, { headers: { Authorization: `Bearer ${token.accessToken}` }, cache: 'no-store', signal: AbortSignal.timeout(10000) });
  } catch {
    throw new AuthError('unavailable', '서버에 연결하지 못했습니다. 다시 확인해 주세요.');
  }
  if (response.status === 401) { clearSession(); throw new AuthError('unauthorized', '로그인이 만료되었습니다. 다시 로그인해 주세요.'); }
  if (response.status === 403) throw new AuthError('forbidden', '현재 계정에는 이 회사의 접근 권한이 없습니다.');
  if (!response.ok) throw new AuthError('unavailable', '접근 권한을 확인하지 못했습니다. 다시 확인해 주세요.');
  return response.json();
}

const roles = new Set<TenantRole>(['owner', 'admin', 'editor', 'viewer']);
export async function loadIdentity(): Promise<Identity> {
  let after: string | null = null;
  const seen = new Set<string>();
  const tenants: TenantAccess[] = [];
  let issuerValue = '';
  let subject = '';
  for (let page = 0; page < 100; page++) {
    const data = await apiGet(`/me${after ? `?after=${encodeURIComponent(after)}` : ''}`) as Record<string, unknown>;
    if (typeof data.issuer !== 'string' || typeof data.subject !== 'string' || !Array.isArray(data.tenants) ||
      (data.nextCursor !== null && typeof data.nextCursor !== 'string')) {
      throw new AuthError('unavailable', '회사 목록 응답을 확인하지 못했습니다.');
    }
    if (page && (data.issuer !== issuerValue || data.subject !== subject)) {
      throw new AuthError('unauthorized', '계정이 바뀌었습니다. 다시 로그인해 주세요.');
    }
    issuerValue = data.issuer;
    subject = data.subject;
    for (const item of data.tenants) {
      if (!item || typeof item !== 'object') throw new AuthError('unavailable', '회사 목록 응답을 확인하지 못했습니다.');
      const tenant = item as Record<string, unknown>;
      if (typeof tenant.tenantId !== 'string' || typeof tenant.name !== 'string' || !roles.has(tenant.role as TenantRole) || seen.has(tenant.tenantId)) {
        throw new AuthError('unavailable', '회사 목록 응답을 확인하지 못했습니다.');
      }
      seen.add(tenant.tenantId);
      tenants.push(tenant as TenantAccess);
    }
    if (data.nextCursor === null) return { issuer: issuerValue, subject, tenants };
    if (after === data.nextCursor) throw new AuthError('unavailable', '회사 목록을 끝까지 불러오지 못했습니다.');
    after = data.nextCursor;
  }
  throw new AuthError('unavailable', '회사 목록을 끝까지 불러오지 못했습니다.');
}

export async function confirmTenant(tenantId: string): Promise<TenantRole> {
  const data = await apiGet(`/tenants/${encodeURIComponent(tenantId)}/access`) as Record<string, unknown>;
  if (data.tenantId !== tenantId || !roles.has(data.role as TenantRole)) throw new AuthError('unavailable', '회사 접근 응답을 확인하지 못했습니다.');
  return data.role as TenantRole;
}

export async function providerLogout() {
  const idToken = activeSession?.idToken;
  clearSession();
  sessionStorage.setItem(forcePromptKey, '1');
  announceLogout();
  try {
    const discovery = await discover();
    if (!discovery.end_session_endpoint) return false;
    const url = new URL(discovery.end_session_endpoint);
    url.searchParams.set('client_id', configuration().clientId);
    url.searchParams.set('post_logout_redirect_uri', location.origin + '/');
    if (idToken) url.searchParams.set('id_token_hint', idToken);
    const state = randomValue();
    url.searchParams.set('state', state);
    sessionStorage.setItem(logoutReturnKey, state);
    location.replace(url.href);
    return true;
  } catch {
    sessionStorage.removeItem(logoutReturnKey);
    return false;
  }
}
