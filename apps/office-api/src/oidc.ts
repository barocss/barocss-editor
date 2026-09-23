import { createRemoteJWKSet, errors, jwtVerify } from 'jose';
import type { VerifiedPrincipal } from '@barocss/office-service/membership-store';
import type { AuthConfig } from './auth-config.js';

export class InvalidAccessTokenError extends Error {
  constructor() { super('invalid_access_token'); }
}
export class AuthProviderUnavailableError extends Error {
  constructor() { super('auth_provider_unavailable'); }
}

export function createOidcVerifier(config: AuthConfig) {
  const jwks = createRemoteJWKSet(config.jwksUrl, { timeoutDuration: 5000 });
  return {
    async verify(token: string): Promise<VerifiedPrincipal> {
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
        return { issuer: config.issuer, subject: payload.sub };
      } catch (error) {
        if (error instanceof AuthProviderUnavailableError || error instanceof InvalidAccessTokenError) throw error;
        if (error instanceof errors.JWKSTimeout || error instanceof TypeError) {
          throw new AuthProviderUnavailableError();
        }
        throw new InvalidAccessTokenError();
      }
    },
  };
}

export type OidcVerifier = ReturnType<typeof createOidcVerifier>;
