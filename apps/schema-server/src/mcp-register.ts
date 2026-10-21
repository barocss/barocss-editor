import { createHash } from 'node:crypto';
import { isRegistryUuid, parseRegistryDefinition, REGISTRY_DIGEST, REGISTRY_LIMITS,
  SchemaContractError } from '@barocss/schema/registry-contract';
import type { SchemaRegistrationReceipt, SchemaVersion } from '@barocss/office-service/schema-registry-store';
import { McpBundleReadError, schemaServerOrigin, type McpReadConfig } from './mcp-bundle-reader.js';

const sha = (value: string) => createHash('sha256').update(value, 'utf8').digest('hex');
const object = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);
const hex = (value: unknown): value is string => typeof value === 'string' && /^[0-9a-f]{64}$/.test(value);
const key = (value: unknown): value is string =>
  typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,119}$/.test(value);

export interface McpRegistration {
  tenantId: string; workspaceId: string; schemaId: string; version: number;
  definitionText: string; idempotencyKey: string;
}

function checkedInput(input: McpRegistration) {
  if (![input.tenantId, input.workspaceId, input.schemaId].every(isRegistryUuid) ||
    !Number.isSafeInteger(input.version) || input.version < 1 || input.version > 2147483647 ||
    !key(input.idempotencyKey)) throw new McpBundleReadError('invalid_request');
  let parsed: ReturnType<typeof parseRegistryDefinition>;
  try { parsed = parseRegistryDefinition(input.definitionText); }
  catch (error) {
    if (error instanceof SchemaContractError) throw new McpBundleReadError(error.reason);
    throw new McpBundleReadError('invalid_definition');
  }
  const definition = parsed.definition;
  if (definition.scope.tenantId !== input.tenantId || definition.scope.workspaceId !== input.workspaceId ||
    definition.schemaId !== input.schemaId || definition.version !== input.version) {
    throw new McpBundleReadError('schema_scope_conflict');
  }
  return { parsed, requestHash: sha(JSON.stringify(['schema-register-v1', input.tenantId, input.workspaceId,
    input.schemaId, input.version, input.definitionText])) };
}

function verifyReceipt(value: unknown, input: McpRegistration, canonicalText: string, requestHash: string):
  SchemaRegistrationReceipt {
  if (!object(value) || value.operation !== 'register' || value.idempotencyKey !== input.idempotencyKey ||
    value.requestHash !== requestHash || !isRegistryUuid(value.requesterIdentityId) ||
    typeof value.authorityEpoch !== 'string' || !value.authorityEpoch ||
    !object(value.record) || !Array.isArray(value.dependencies) ||
    value.dependencies.length >= REGISTRY_LIMITS.closure) throw new McpBundleReadError('invalid_service_response');
  const records = [value.record, ...value.dependencies];
  const found = new Map<string, SchemaVersion>();
  for (const unknown of records) {
    if (!object(unknown) || !isRegistryUuid(unknown.schemaId) ||
      !Number.isSafeInteger(unknown.version) || (unknown.version as number) < 1 ||
      !hex(unknown.digest) || unknown.digestAlgorithm !== REGISTRY_DIGEST ||
      typeof unknown.definitionText !== 'string' || typeof unknown.canonicalText !== 'string' ||
      !isRegistryUuid(unknown.actorIdentityId) || typeof unknown.createdAt !== 'string') {
      throw new McpBundleReadError('invalid_service_response');
    }
    let parsed: ReturnType<typeof parseRegistryDefinition>;
    let returned: ReturnType<typeof parseRegistryDefinition>;
    try {
      parsed = parseRegistryDefinition(unknown.definitionText);
      returned = parseRegistryDefinition(JSON.stringify(unknown.definition));
    }
    catch { throw new McpBundleReadError('invalid_service_response'); }
    if (parsed.definition.scope.tenantId !== input.tenantId ||
      parsed.definition.scope.workspaceId !== input.workspaceId ||
      parsed.definition.schemaId !== unknown.schemaId || parsed.definition.version !== unknown.version ||
      parsed.canonicalText !== unknown.canonicalText || sha(parsed.canonicalText) !== unknown.digest ||
      returned.canonicalText !== parsed.canonicalText) throw new McpBundleReadError('invalid_service_response');
    const id = `${unknown.schemaId}:${unknown.version}`;
    if (found.has(id)) throw new McpBundleReadError('invalid_service_response');
    found.set(id, unknown as unknown as SchemaVersion);
  }
  const root = value.record as unknown as SchemaVersion;
  if (root.schemaId !== input.schemaId || root.version !== input.version || root.canonicalText !== canonicalText) {
    throw new McpBundleReadError('invalid_service_response');
  }
  const seen = new Set<string>();
  const active = new Set<string>();
  const visit = (record: SchemaVersion) => {
    const id = `${record.schemaId}:${record.version}`;
    if (active.has(id)) throw new McpBundleReadError('invalid_service_response');
    if (seen.has(id)) return;
    active.add(id);
    const refs = [...(record.definition.parent ? [record.definition.parent] : []), ...record.definition.dependencies];
    for (const ref of refs) {
      const dependency = found.get(`${ref.schemaId}:${ref.version}`);
      if (!dependency || dependency.digest !== ref.digest) throw new McpBundleReadError('invalid_service_response');
      visit(dependency);
    }
    active.delete(id);
    seen.add(id);
  };
  visit(root);
  if (seen.size !== found.size) throw new McpBundleReadError('invalid_service_response');
  return value as unknown as SchemaRegistrationReceipt;
}

function namedFailure(status: number, value: unknown): string {
  if (status === 401) return 'unauthorized';
  if (status === 403) return 'scope_forbidden';
  if (status === 404) return 'not_found';
  if (status === 413) return 'request_too_large';
  if ([400, 409, 422].includes(status) && object(value) && typeof value.status === 'string' &&
    /^[a-z][a-z0-9_]{0,63}$/.test(value.status)) return value.status;
  return 'schema_service_unavailable';
}

async function responseJson(response: Response, signal?: AbortSignal): Promise<unknown> {
  if (!response.body) throw new McpBundleReadError('invalid_service_response');
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      if (signal?.aborted) throw new McpBundleReadError('cancelled');
      const next = await reader.read();
      if (next.done) break;
      size += next.value.byteLength;
      if (size > REGISTRY_LIMITS.bundleBytes + REGISTRY_LIMITS.definitionBytes) {
        throw new McpBundleReadError('response_too_large');
      }
      chunks.push(next.value);
    }
  } finally { reader.releaseLock(); }
  try { return JSON.parse(Buffer.concat(chunks, size).toString('utf8')) as unknown; }
  catch { throw new McpBundleReadError('invalid_service_response'); }
}

/** The HTTP server remains the sole authority and registry writer. */
export async function registerSchema(config: McpReadConfig, input: McpRegistration,
  signal?: AbortSignal, fetcher: typeof fetch = fetch): Promise<SchemaRegistrationReceipt> {
  const { parsed, requestHash } = checkedInput(input);
  const origin = schemaServerOrigin(config.baseUrl);
  const token = config.bearerToken;
  if (!token || token.length > 8000 || !/^[A-Za-z0-9_.-]+$/.test(token)) throw new McpBundleReadError('unauthorized');
  let response: Response;
  try {
    response = await fetcher(`${origin}/v1/tenants/${input.tenantId}/workspaces/${input.workspaceId}` +
      `/schemas/${input.schemaId}/versions/${input.version}`, {
      method: 'PUT', headers: { authorization: `Bearer ${token}`, accept: 'application/json',
        'content-type': 'application/json' },
      body: JSON.stringify({ definitionText: input.definitionText, idempotencyKey: input.idempotencyKey }),
      redirect: 'error', signal: AbortSignal.any([AbortSignal.timeout(10_000), ...(signal ? [signal] : [])]),
    });
  } catch { throw new McpBundleReadError(signal?.aborted ? 'cancelled' : 'schema_service_unavailable'); }
  try {
    if (response.status === 401 || response.status === 403 || response.status === 404 ||
      response.status === 413 || response.status >= 500) throw new McpBundleReadError(namedFailure(response.status, undefined));
    const value = await responseJson(response, signal);
    if (!response.ok) throw new McpBundleReadError(namedFailure(response.status, value));
    return verifyReceipt(value, input, parsed.canonicalText, requestHash);
  } catch (error) {
    if (error instanceof McpBundleReadError) throw error;
    throw new McpBundleReadError(signal?.aborted ? 'cancelled' : 'schema_service_unavailable');
  } finally { await response.body?.cancel().catch(() => { /* Already consumed or closed. */ }); }
}
