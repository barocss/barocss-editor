import { createRemoteJWKSet, customFetch, errors, jwtVerify } from 'jose';
import type { VerifiedPrincipal } from '@barocss/office-service/membership-store';
import type { AuthConfig } from './auth-config.js';

export class InvalidAccessTokenError extends Error {
  constructor() { super('invalid_access_token'); }
}
export class AuthProviderUnavailableError extends Error {
  constructor() { super('auth_provider_unavailable'); }
}

export function createOidcVerifier(config: AuthConfig) {
  const jwks = createRemoteJWKSet(config.jwksUrl, {
    timeoutDuration: 5000,
    [customFetch]: async (url, options) => {
      try {
        const response = await fetch(url, options);
        if (response.status !== 200) throw new AuthProviderUnavailableError();
        return response;
      } catch {
        throw new AuthProviderUnavailableError();
      }
    },
  });
  const verifyClaims = async (token: string) => {
    if (token.length > 8192 || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(token)) {
      throw new InvalidAccessTokenError();
    }
    try {
      const { payload } = await jwtVerify(token, jwks, {
        issuer: config.issuer,
        audience: config.audience,
        algorithms: config.algorithms,
        requiredClaims: ['exp', 'iat', 'sub'],
      });
      // Keycloak marks access tokens as Bearer. This also rejects an ID token
      // signed by the same realm for the same client.
      if (payload.typ !== 'Bearer' || !payload.sub || payload.sub.length > 255) {
        throw new InvalidAccessTokenError();
      }
      return payload;
    } catch (error) {
      if (error instanceof AuthProviderUnavailableError || error instanceof InvalidAccessTokenError) throw error;
      if (error instanceof errors.JWKSTimeout || error instanceof errors.JWKSInvalid ||
        error instanceof errors.JWKInvalid || error instanceof TypeError ||
        (error instanceof errors.JOSEError && error.code === 'ERR_JOSE_GENERIC')) {
        throw new AuthProviderUnavailableError();
      }
      throw new InvalidAccessTokenError();
    }
  };
  return {
    async verify(token: string): Promise<VerifiedPrincipal> {
      const payload = await verifyClaims(token);
      return { issuer: config.issuer, subject: payload.sub! };
    },
    /** A provider capability needs a bounded, identifiable login session. */
    async verifySession(token: string) {
      const payload = await verifyClaims(token);
      const sessionId = payload.sid ?? payload.session_state;
      if (typeof sessionId !== 'string' || sessionId.length < 1 || sessionId.length > 255 ||
        typeof payload.exp !== 'number' || !Number.isSafeInteger(payload.exp)) {
        throw new InvalidAccessTokenError();
      }
      return { issuer: config.issuer, subject: payload.sub!, sessionId, expiresAt: payload.exp };
    },
  };
}

export type OidcVerifier = ReturnType<typeof createOidcVerifier>;
