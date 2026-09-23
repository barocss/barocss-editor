import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { exportJWK, generateKeyPair, SignJWT } from 'jose';
import { TenantAccessDeniedError } from '@barocss/office-service/membership-store';
import { readAuthConfig } from '../src/auth-config.js';
import { createOidcVerifier, AuthProviderUnavailableError, InvalidAccessTokenError } from '../src/oidc.js';
import { createApiServer } from '../src/server.js';

const tenant = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const otherTenant = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const jwks = createServer();
let issuer: string;
let jwksUrl: URL;
let privateKey: Awaited<ReturnType<typeof generateKeyPair>>['privateKey'];
let jwksMode: 'ok' | 'server-error' | 'invalid-json' = 'ok';

beforeAll(async () => {
  const keys = await generateKeyPair('RS256');
  privateKey = keys.privateKey;
  const publicJwk = await exportJWK(keys.publicKey);
  jwks.on('request', (_request, response) => {
    if (jwksMode === 'server-error') {
      response.writeHead(503).end();
      return;
    }
    if (jwksMode === 'invalid-json') {
      response.writeHead(200, { 'content-type': 'application/json' }).end('not-json');
      return;
    }
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ keys: [{ ...publicJwk, kid: 'local-test', alg: 'RS256', use: 'sig' }] }));
  });
  await new Promise<void>(resolve => jwks.listen(0, '127.0.0.1', resolve));
  const port = (jwks.address() as AddressInfo).port;
  issuer = `http://127.0.0.1:${port}/realms/test`;
  jwksUrl = new URL(`http://127.0.0.1:${port}/realms/test/certs`);
});
afterAll(async () => { await new Promise<void>(resolve => jwks.close(() => resolve())); });

function config() {
  const value = readAuthConfig({
    OFFICE_OIDC_ISSUER: issuer,
    OFFICE_OIDC_JWKS_URL: jwksUrl.href,
    OFFICE_OIDC_AUDIENCE: 'wonffice-api',
    OFFICE_API_DATABASE_URL: 'postgresql://local/app',
  });
  if (!value) throw new Error('missing_test_config');
  return value;
}

async function token(overrides: { issuer?: string; audience?: string; expires?: number; type?: string;
  key?: CryptoKey; kid?: string } = {}) {
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({ typ: overrides.type ?? 'Bearer' })
    .setProtectedHeader({ alg: 'RS256', kid: overrides.kid ?? 'local-test' })
    .setIssuer(overrides.issuer ?? issuer)
    .setAudience(overrides.audience ?? 'wonffice-api')
    .setSubject('alice')
    .setIssuedAt(now - 1)
    .setExpirationTime(overrides.expires ?? now + 300)
    .sign(overrides.key ?? privateKey);
}

describe('OIDC configuration and token verification', () => {
  it('rejects partial, unsafe or symmetric-algorithm configuration without echoing values', () => {
    expect(readAuthConfig({})).toBeNull();
    expect(() => readAuthConfig({ OFFICE_OIDC_ISSUER: 'secret-value' })).toThrow(
      'Incomplete office authentication configuration');
    expect(() => readAuthConfig({ ...configEnv(), OFFICE_OIDC_ALGORITHMS: 'HS256' })).toThrow(
      'Invalid OFFICE_OIDC_ALGORITHMS');
    expect(() => readAuthConfig({ ...configEnv(), OFFICE_OIDC_JWKS_URL: 'https://other.example/certs' })).toThrow(
      'Invalid OFFICE_OIDC_JWKS_URL');
  });
  it('accepts only valid issuer, audience, signature and expiry', async () => {
    const verify = createOidcVerifier(config()).verify;
    expect(await verify(await token())).toEqual({ issuer, subject: 'alice' });
    await expect(verify(await token({ issuer: 'https://wrong.example' }))).rejects.toBeInstanceOf(InvalidAccessTokenError);
    await expect(verify(await token({ audience: 'wrong-api' }))).rejects.toBeInstanceOf(InvalidAccessTokenError);
    await expect(verify(await token({ type: 'ID' }))).rejects.toBeInstanceOf(InvalidAccessTokenError);
    await expect(verify(await token({ expires: Math.floor(Date.now() / 1000) - 30 }))).rejects.toBeInstanceOf(InvalidAccessTokenError);
    const forged = await generateKeyPair('RS256');
    await expect(verify(await token({ key: forged.privateKey }))).rejects.toBeInstanceOf(InvalidAccessTokenError);
    await expect(verify(await token({ kid: 'unknown-key' }))).rejects.toBeInstanceOf(InvalidAccessTokenError);
    await expect(verify('unsigned-or-malformed')).rejects.toBeInstanceOf(InvalidAccessTokenError);
  });
  it('classifies an actual JWKS HTTP outage or invalid provider response as unavailable', async () => {
    try {
      jwksMode = 'server-error';
      await expect(createOidcVerifier(config()).verify(await token())).rejects.toBeInstanceOf(AuthProviderUnavailableError);
      jwksMode = 'invalid-json';
      await expect(createOidcVerifier(config()).verify(await token())).rejects.toBeInstanceOf(AuthProviderUnavailableError);
    } finally {
      jwksMode = 'ok';
    }
  });
});

function configEnv() {
  return {
    OFFICE_OIDC_ISSUER: issuer,
    OFFICE_OIDC_JWKS_URL: jwksUrl.href,
    OFFICE_OIDC_AUDIENCE: 'wonffice-api',
    OFFICE_API_DATABASE_URL: 'postgresql://local/app',
  };
}

describe('authenticated Fastify boundary', () => {
  it('returns current principal and current tenant role, with 401/403 separation', async () => {
    const app = createApiServer({
      verifier: createOidcVerifier(config()),
      memberships: { async getTenantAccess(principal, tenantId) {
        if (principal.subject !== 'alice' || tenantId !== tenant) throw new TenantAccessDeniedError();
        return { tenantId, role: 'editor' as const };
      }, async listTenantAccess() {
        return { tenants: [{ tenantId: tenant, name: 'Alpha', role: 'editor' as const }], nextCursor: null };
      } },
    });
    try {
      expect((await app.inject('/v1/me')).statusCode).toBe(401);
      const bearer = `Bearer ${await token()}`;
      const me = await app.inject({ url: '/v1/me', headers: { authorization: bearer } });
      expect(me.statusCode).toBe(200);
      expect(me.json()).toEqual({ issuer, subject: 'alice',
        tenants: [{ tenantId: tenant, name: 'Alpha', role: 'editor' }], nextCursor: null });
      expect((await app.inject({ url: '/v1/me?after=bad', headers: { authorization: bearer } })).statusCode).toBe(400);
      const allowed = await app.inject({ url: `/v1/tenants/${tenant}/access`, headers: { authorization: bearer } });
      expect(allowed.json()).toEqual({ tenantId: tenant, role: 'editor' });
      const denied = await app.inject({ url: `/v1/tenants/${otherTenant}/access`, headers: { authorization: bearer } });
      expect(denied.statusCode).toBe(403);
      expect(denied.json()).toEqual({ status: 'forbidden' });
      expect((await app.inject({ url: '/v1/me', headers: { authorization: `Bearer ${await token({ audience: 'wrong' })}` } })).statusCode).toBe(401);
    } finally { await app.close(); }
  });
  it('fails closed without exposing provider errors', async () => {
    const app = createApiServer({
      verifier: { async verify() { throw new AuthProviderUnavailableError(); } },
      memberships: { async getTenantAccess() { throw new Error('not_called'); },
        async listTenantAccess() { throw new Error('not_called'); } },
    });
    try {
      const response = await app.inject({ url: '/v1/me', headers: { authorization: 'Bearer a.b.c' } });
      expect(response.statusCode).toBe(503);
      expect(response.json()).toEqual({ status: 'auth_unavailable' });
    } finally { await app.close(); }
  });
});
