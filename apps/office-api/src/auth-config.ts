import { isIP } from 'node:net';

export interface AuthConfig {
  issuer: string;
  audience: string;
  jwksUrl: URL;
  algorithms: string[];
  databaseUrl: string;
}

const allowedAlgorithms = new Set(['RS256', 'PS256', 'ES256']);

function trustedUrl(value: string, key: string): URL {
  let url: URL;
  try { url = new URL(value); } catch { throw new Error(`Invalid ${key}`); }
  const host = url.hostname.replace(/^\[|\]$/g, '');
  if (url.username || url.password || url.hash || url.search || !url.pathname ||
    (url.protocol !== 'https:' && !(url.protocol === 'http:' && isIP(host) !== 0 &&
      ['127.0.0.1', '::1'].includes(host)))) throw new Error(`Invalid ${key}`);
  return url;
}

/** All auth settings are required together. Error text never contains settings or secrets. */
export function readAuthConfig(env: NodeJS.ProcessEnv): AuthConfig | null {
  const keys = ['OFFICE_OIDC_ISSUER', 'OFFICE_OIDC_AUDIENCE', 'OFFICE_OIDC_JWKS_URL',
    'OFFICE_API_DATABASE_URL'] as const;
  if (keys.every(key => env[key] === undefined)) return null;
  if (keys.some(key => !env[key])) throw new Error('Incomplete office authentication configuration');
  const issuer = trustedUrl(env.OFFICE_OIDC_ISSUER!, 'OFFICE_OIDC_ISSUER');
  const jwksUrl = trustedUrl(env.OFFICE_OIDC_JWKS_URL!, 'OFFICE_OIDC_JWKS_URL');
  if (issuer.origin !== jwksUrl.origin) throw new Error('Invalid OFFICE_OIDC_JWKS_URL');
  const audience = env.OFFICE_OIDC_AUDIENCE!;
  if (audience.length > 255 || !/^[A-Za-z0-9._:/-]+$/.test(audience)) {
    throw new Error('Invalid OFFICE_OIDC_AUDIENCE');
  }
  const algorithms = (env.OFFICE_OIDC_ALGORITHMS ?? 'RS256').split(',');
  if (algorithms.length === 0 || algorithms.some(value => !allowedAlgorithms.has(value)) ||
    new Set(algorithms).size !== algorithms.length) throw new Error('Invalid OFFICE_OIDC_ALGORITHMS');
  const databaseUrl = env.OFFICE_API_DATABASE_URL!;
  if (!databaseUrl.startsWith('postgresql://') && !databaseUrl.startsWith('postgres://')) {
    throw new Error('Invalid OFFICE_API_DATABASE_URL');
  }
  return { issuer: issuer.href, audience, jwksUrl, algorithms, databaseUrl };
}
