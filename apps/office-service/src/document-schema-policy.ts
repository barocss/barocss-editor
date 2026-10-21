import { readFileSync, statSync } from 'node:fs';
import { isAbsolute } from 'node:path';
import { isRegistryUuid, parseRegistryJson, NOTE_FIELD_CAPABILITIES } from '@barocss/schema/registry-contract';
import type { DocumentSchemaScopePolicy } from './schema-registry-store.js';

/** Operator-only policy. Preserve the existing Schema Server admission format and bounds. */
export function readDocumentSchemaPolicyFile(path: string | undefined, setting: string): DocumentSchemaScopePolicy[] {
  function invalid(): never { throw new Error('Invalid ' + setting); }
  if (path === undefined) return [];
  if (!isAbsolute(path)) invalid();
  let value: unknown;
  try {
    const stat = statSync(path);
    if (!stat.isFile() || stat.mode & 0o077 || stat.size > 65536) invalid();
    value = parseRegistryJson(readFileSync(path, 'utf8'));
  } catch { return invalid(); }
  if (!Array.isArray(value) || value.length > 100) invalid();
  const roles = ['owner', 'admin', 'editor', 'viewer'], seen = new Set<string>();
  return value.map(entry => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) invalid();
    const p = entry as Record<string, unknown>;
    if (Object.keys(p).length !== 6 || Object.keys(p).some(key => !['tenantId', 'workspaceId', 'readRoles', 'preserveRoles', 'adoptRoles', 'capabilities'].includes(key)) ||
      !isRegistryUuid(p.tenantId) || !isRegistryUuid(p.workspaceId)) invalid();
    const scope = p.tenantId + ':' + p.workspaceId;
    if (seen.has(scope)) invalid();
    seen.add(scope);
    for (const field of ['readRoles', 'preserveRoles', 'adoptRoles', 'capabilities']) {
      const list = p[field], allowed: readonly string[] = field === 'capabilities' ? NOTE_FIELD_CAPABILITIES : roles;
      if (!Array.isArray(list) || new Set(list).size !== list.length || list.some(item => !allowed.includes(item))) invalid();
    }
    return p as unknown as DocumentSchemaScopePolicy;
  });
}
