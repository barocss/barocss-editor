import { SHEET_RELAY_ACCOUNT_LIMITS } from '../src/sheet-preview-protocol.ts';

const maxResponseBytes = 64_000;
async function readObject(response) {
  if (!response.ok || !response.body) return null;
  const reader = response.body.getReader();
  const chunks = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxResponseBytes) { await reader.cancel(); return null; }
      chunks.push(value);
    }
    const value = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    return value && typeof value === 'object' && !Array.isArray(value) ? value : null;
  } catch { return null; }
  finally { reader.releaseLock(); }
}

/** Private configuration and tokens remain inside the server process. */
export function createKeycloakAccountGates({ issuer, clientId, clientSecret }) {
  const trusted = new URL(issuer);
  const realm = /^\/realms\/([A-Za-z0-9_-]+)$/.exec(trusted.pathname)?.[1];
  if (!realm || trusted.username || trusted.password || trusted.search || trusted.hash ||
      (trusted.protocol !== 'https:' && !(trusted.protocol === 'http:' && trusted.hostname === '127.0.0.1')) ||
      typeof clientId !== 'string' || !clientId || typeof clientSecret !== 'string' || !clientSecret) {
    throw new Error('Invalid private Keycloak gate configuration.');
  }
  const basic = 'Basic ' + Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  const endpoint = `${issuer}/protocol/openid-connect`;
  const bounded = signal => AbortSignal.any([signal, AbortSignal.timeout(SHEET_RELAY_ACCOUNT_LIMITS.authorizationMs)]);
  const live = input => input?.issuer === issuer && typeof input.subject === 'string' && input.subject.length > 0 &&
    typeof input.sessionId === 'string' && input.sessionId.length > 0 && input.sessionId.length <= 255 &&
    Number.isSafeInteger(input.expiresAt) && input.expiresAt * 1000 > Date.now() &&
    typeof input.accessToken === 'string' && input.accessToken.length <= SHEET_RELAY_ACCOUNT_LIMITS.tokenBytes;
  const introspect = async (accessToken, signal) => readObject(await fetch(`${endpoint}/token/introspect`, {
    method: 'POST', headers: { authorization: basic, 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ token: accessToken, token_type_hint: 'access_token' }), cache: 'no-store', signal,
  }));
  const sameProof = (input, body) => body?.active === true && body.iss === issuer &&
    body.sub === input.subject && (body.sid ?? body.session_state) === input.sessionId && body.exp === input.expiresAt;
  return {
    async sessionGate(input, signal) {
      if (!live(input) || signal.aborted) return false;
      try { return sameProof(input, await introspect(input.accessToken, bounded(signal))) && live(input) && !signal.aborted; }
      catch { return false; }
    },
    async logoutSession(input, signal) {
      if (!live(input) || signal.aborted) return false;
      const deadline = bounded(signal);
      try {
        // The caller has already verified the JWT. Bind this exact token to the
        // provider's current subject and login before any privileged operation.
        if (!sameProof(input, await introspect(input.accessToken, deadline)) || !live(input) || deadline.aborted) return false;
        const token = await readObject(await fetch(`${endpoint}/token`, {
          method: 'POST', headers: { authorization: basic, 'content-type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({ grant_type: 'client_credentials' }), cache: 'no-store', signal: deadline,
        }));
        if (typeof token?.access_token !== 'string' || token.access_token.length > SHEET_RELAY_ACCOUNT_LIMITS.tokenBytes ||
            token.token_type?.toLowerCase() !== 'bearer' || !live(input) || deadline.aborted) return false;
        const response = await fetch(`${trusted.origin}/admin/realms/${realm}/sessions/${encodeURIComponent(input.sessionId)}`, {
          method: 'DELETE', headers: { authorization: `Bearer ${token.access_token}` }, cache: 'no-store', signal: deadline,
        });
        if (response.status !== 204) return false;
        const after = await introspect(input.accessToken, deadline);
        return after?.active === false && !deadline.aborted;
      } catch { return false; }
    },
  };
}
