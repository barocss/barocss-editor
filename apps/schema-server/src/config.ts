import { isIP } from 'node:net';
import { readFileSync, statSync } from 'node:fs';
import { isAbsolute } from 'node:path';
import { readAuthConfig, type AuthConfig } from '@barocss/office-api/auth-config';
import { isRegistryUuid, parseRegistryJson, NOTE_FIELD_CAPABILITIES } from '@barocss/schema/registry-contract';
import type { RegistryScopePolicy } from '@barocss/office-service/schema-registry-store';
export type SchemaScopePolicy = RegistryScopePolicy;
export interface SchemaServerConfig { host: string; port: number; shutdownTimeoutMs: number; auth: AuthConfig; policy: SchemaScopePolicy[] }
function invalid(key: string): never { throw new Error(`Invalid ${key}`); }
function integer(value: string, key: string, max: number) {
  if (!/^\d+$/.test(value)) invalid(key); const n = Number(value);
  if (!Number.isSafeInteger(n) || n < 1 || n > max) invalid(key); return n;
}
export function readSchemaServerConfig(env: NodeJS.ProcessEnv): SchemaServerConfig {
  const host = env.SCHEMA_SERVER_HOST ?? '127.0.0.1'; if (!isIP(host)) invalid('SCHEMA_SERVER_HOST');
  const auth = readAuthConfig({ OFFICE_OIDC_ISSUER: env.SCHEMA_SERVER_OIDC_ISSUER,
    OFFICE_OIDC_AUDIENCE: env.SCHEMA_SERVER_OIDC_AUDIENCE, OFFICE_OIDC_JWKS_URL: env.SCHEMA_SERVER_OIDC_JWKS_URL,
    OFFICE_OIDC_ALGORITHMS: env.SCHEMA_SERVER_OIDC_ALGORITHMS, OFFICE_API_DATABASE_URL: env.SCHEMA_SERVER_DATABASE_URL });
  if (!auth) invalid('SCHEMA_SERVER_AUTH');
  const path = env.SCHEMA_SERVER_POLICY_FILE;
  if (!path || !isAbsolute(path)) invalid('SCHEMA_SERVER_POLICY_FILE');
  let value: unknown;
  try {
    const stat = statSync(path); if (!stat.isFile() || stat.mode & 0o077) invalid('SCHEMA_SERVER_POLICY_FILE');
    value = parseRegistryJson(readFileSync(path, 'utf8'));
  } catch { return invalid('SCHEMA_SERVER_POLICY_FILE'); }
  if (!Array.isArray(value) || !value.length || value.length > 100) invalid('SCHEMA_SERVER_POLICY_FILE');
  const roles = ['owner', 'admin', 'editor', 'viewer']; const seen = new Set<string>();
  const policy: SchemaScopePolicy[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) invalid('SCHEMA_SERVER_POLICY_FILE');
    const p = entry as Record<string, unknown>;
    if (Object.keys(p).length !== 5 || Object.keys(p).some(k => !['tenantId','workspaceId','readRoles','registerRoles','capabilities'].includes(k)) ||
      !isRegistryUuid(p.tenantId) || !isRegistryUuid(p.workspaceId)) invalid('SCHEMA_SERVER_POLICY_FILE');
    const id = `${p.tenantId}:${p.workspaceId}`; if (seen.has(id)) invalid('SCHEMA_SERVER_POLICY_FILE'); seen.add(id);
    for (const key of ['readRoles', 'registerRoles', 'capabilities']) {
      const list = p[key]; const allowed: readonly string[] = key === 'capabilities' ? NOTE_FIELD_CAPABILITIES : roles;
      if (!Array.isArray(list) || new Set(list).size !== list.length || list.some(v => !allowed.includes(v))) invalid('SCHEMA_SERVER_POLICY_FILE');
    }
    policy.push(p as unknown as SchemaScopePolicy);
  }
  return { host, port: integer(env.SCHEMA_SERVER_PORT ?? '4101', 'SCHEMA_SERVER_PORT', 65535),
    shutdownTimeoutMs: integer(env.SCHEMA_SERVER_SHUTDOWN_TIMEOUT_MS ?? '10000', 'SCHEMA_SERVER_SHUTDOWN_TIMEOUT_MS', 60000), auth, policy };
}
