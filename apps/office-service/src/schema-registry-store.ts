import { createHash } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import { parseRegistryDefinition, validateRegistryBundle, REGISTRY_DIGEST, REGISTRY_LIMITS, isRegistryUuid,
  type RegistryDefinition } from '@barocss/schema/registry-contract';
import { readNoteV1SnapshotFile as readNoteSnapshotFile } from '@barocss/office-note-file';
import { MembershipStore, TenantAccessDeniedError, type TenantRole, type VerifiedPrincipal } from './membership-store.js';
export class SchemaRegistryError extends Error {
  constructor(public readonly status: 400 | 403 | 404 | 409 | 413 | 422, public readonly reason: string) { super(reason); }
}
export interface RegistryScopePolicy { tenantId: string; workspaceId: string; readRoles: readonly TenantRole[];
  registerRoles: readonly TenantRole[]; capabilities: readonly string[] }
export interface SchemaVersion {
  schemaId: string; version: number; digest: string; digestAlgorithm: typeof REGISTRY_DIGEST;
  definitionText: string; canonicalText: string; definition: RegistryDefinition;
  actorIdentityId: string; createdAt: string;
}
export interface SchemaRegistrationReceipt {
  operation: 'register'; idempotencyKey: string; requestHash: string; requesterIdentityId: string;
  authorityEpoch: string; record: SchemaVersion; dependencies: SchemaVersion[];
}
interface Row { schema_id: string; version: number; digest: string; definition_text: string;
  canonical_text: string; actor_identity_id: string; created_at: Date }
const hash = (text: string) => createHash('sha256').update(text, 'utf8').digest('hex');
function error(status: SchemaRegistryError['status'], reason: string): never { throw new SchemaRegistryError(status, reason); }
const uuid = (id: string) => { if (!isRegistryUuid(id)) error(400, 'invalid_request'); };
const key = (value: string) => { if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,119}$/.test(value)) error(400, 'invalid_idempotency_key'); };
const refs = (d: RegistryDefinition) => [...(d.parent ? [{ kind: 'parent', ref: d.parent }] : []),
  ...d.dependencies.map(ref => ({ kind: 'dependency', ref }))];
function version(row: Row, tenantId: string, workspaceId: string): SchemaVersion {
  let parsed: ReturnType<typeof parseRegistryDefinition>;
  try { parsed = parseRegistryDefinition(row.definition_text); }
  catch { return error(409, 'schema_store_unavailable'); }
  if (parsed.canonicalText !== row.canonical_text || hash(parsed.canonicalText) !== row.digest ||
    parsed.definition.scope.tenantId !== tenantId || parsed.definition.scope.workspaceId !== workspaceId ||
    parsed.definition.schemaId !== row.schema_id || parsed.definition.version !== row.version) return error(409, 'schema_store_unavailable');
  return { schemaId: row.schema_id, version: row.version, digest: row.digest, digestAlgorithm: REGISTRY_DIGEST,
    definitionText: row.definition_text, canonicalText: row.canonical_text, definition: parsed.definition,
    actorIdentityId: row.actor_identity_id, createdAt: row.created_at.toISOString() };
}
export type DocumentSchemaAction = 'read' | 'preserve' | 'adopt';
/** Trusted operator configuration, separate from schema registration permission. */
export interface DocumentSchemaScopePolicy {
  tenantId: string; workspaceId: string; readRoles: readonly TenantRole[];
  preserveRoles: readonly TenantRole[]; adoptRoles: readonly TenantRole[]; capabilities: readonly string[];
}
export interface CurrentSchemaActor { readonly id: string; readonly role: TenantRole; readonly epoch: string }
const actorClients = new WeakMap<CurrentSchemaActor, { client: PoolClient; tenantId: string }>();
/** Caller must already be inside withAuthorizedTenant on this exact client. */
export async function currentSchemaActor(client: PoolClient, tenantId: string, write = false): Promise<CurrentSchemaActor> {
    const result = await client.query<{ id: string; role: TenantRole }>('SELECT id,role FROM wonffice.project_current_actor($1)', [tenantId]);
    const actor = result.rows[0]; if (!actor) throw new TenantAccessDeniedError();
    if (write && actor.role === 'viewer') return error(403, 'forbidden');
    const epochs = await client.query<{ epoch: string }>('SELECT epoch FROM wonffice.project_execution_actor_epoch($1)', [tenantId]);
    if (!epochs.rows[0]) throw new TenantAccessDeniedError();
    const current = Object.freeze({ ...actor, epoch: epochs.rows[0].epoch });
    actorClients.set(current, { client, tenantId });
    return current;
}
async function schemaRow(client: PoolClient, tenantId: string, workspaceId: string, schemaId: string, v: number) {
    return (await client.query<Row>('SELECT * FROM wonffice.schema_versions WHERE tenant_id=$1 AND workspace_id=$2 AND schema_id=$3 AND version=$4',
      [tenantId, workspaceId, schemaId, v])).rows[0];
}
async function schemaClosure(client: PoolClient, tenantId: string, workspaceId: string, root: SchemaVersion) {
    const found = new Map<string, SchemaVersion>(), visiting = new Set<string>();
    const visit = async (record: SchemaVersion) => {
      const id = `${record.schemaId}:${record.version}`;
      if (visiting.has(id)) error(422, 'dependency_cycle');
      const previous = found.get(id);
      if (previous) { if (previous.digest !== record.digest) error(409, 'dependency_digest_conflict'); return; }
      if (found.size >= REGISTRY_LIMITS.closure) error(413, 'schema_bundle_too_large');
      found.set(id, record); visiting.add(id);
      const expected = refs(record.definition);
      const edges = (await client.query<{ kind: string; dependency_id: string; dependency_version: number; dependency_digest: string }>(
        'SELECT kind,dependency_id,dependency_version,dependency_digest FROM wonffice.schema_dependencies WHERE tenant_id=$1 AND workspace_id=$2 AND schema_id=$3 AND version=$4 ORDER BY ordinal',
        [tenantId, workspaceId, record.schemaId, record.version])).rows;
      if (JSON.stringify(edges.map(e => ({ kind: e.kind, ref: { schemaId: e.dependency_id, version: e.dependency_version, digest: e.dependency_digest } }))) !== JSON.stringify(expected)) error(409, 'bundle_incomplete');
      for (const { ref } of expected) {
        const row = await schemaRow(client, tenantId, workspaceId, ref.schemaId, ref.version);
        if (!row) error(422, 'dependency_missing');
        const next = version(row, tenantId, workspaceId);
        if (next.digest !== ref.digest) error(409, 'dependency_digest_conflict'); await visit(next);
      }
      visiting.delete(id);
    };
    await visit(root); const records = [...found.values()];
    if (Buffer.byteLength(JSON.stringify(records), 'utf8') > REGISTRY_LIMITS.bundleBytes) error(413, 'schema_bundle_too_large');
    return records.filter(r => r !== root);
}
/** Admission only: no pool, nested transaction, registry effects or native rewriting. */
export async function admitDocumentSchemaBundle(client: PoolClient, scope: { tenantId: string; workspaceId: string },
  bundle: unknown, actor: CurrentSchemaActor, action: DocumentSchemaAction, policies: readonly DocumentSchemaScopePolicy[]) {
  const issued = actorClients.get(actor);
  if (!issued || issued.client !== client || issued.tenantId !== scope.tenantId) error(403, 'forbidden');
  let checked: ReturnType<typeof validateRegistryBundle>;
  try { checked = validateRegistryBundle(bundle); }
  catch (failure) {
    const reason = failure instanceof Error ? failure.message : '';
    error(reason === 'schema_bundle_too_large' ? 413 : 422, reason === 'schema_bundle_too_large' ? reason : 'invalid_snapshot');
  }
  const policy = policies.find(p => p.tenantId === scope.tenantId && p.workspaceId === scope.workspaceId);
  const roles = action === 'read' ? policy?.readRoles : action === 'preserve' ? policy?.preserveRoles : policy?.adoptRoles;
  if (!policy || !Array.isArray(roles) || !roles.includes(actor.role) || !Array.isArray(policy.capabilities) ||
    checked.requiredCapabilities.some(c => !policy.capabilities.includes(c))) error(403, 'scope_forbidden');
  const entries = new Map(checked.bundle.definitions.map(entry => {
    const parsed = parseRegistryDefinition(entry.definitionText);
    if (parsed.definition.scope.tenantId !== scope.tenantId || parsed.definition.scope.workspaceId !== scope.workspaceId) error(403, 'scope_forbidden');
    return [`${entry.reference.schemaId}:${entry.reference.version}`, { ...entry, canonicalText: parsed.canonicalText }];
  }));
  const verified = new Set<string>();
  for (const ref of checked.bundle.selected) {
    const row = await schemaRow(client, scope.tenantId, scope.workspaceId, ref.schemaId, ref.version);
    if (!row) error(422, 'dependency_missing');
    const root = version(row, scope.tenantId, scope.workspaceId);
    if (root.digest !== ref.digest) error(409, 'dependency_digest_conflict');
    const records = [root, ...await schemaClosure(client, scope.tenantId, scope.workspaceId, root)];
    for (const record of records) {
      const id = `${record.schemaId}:${record.version}`, submitted = entries.get(id);
      if (!submitted || submitted.reference.digest !== record.digest || submitted.canonicalText !== record.canonicalText) error(409, 'schema_store_unavailable');
      if (record.definition.requiredCapabilities.some(c => !policy.capabilities.includes(c))) error(403, 'scope_forbidden');
      verified.add(id);
    }
  }
  if (verified.size !== entries.size) error(409, 'bundle_incomplete');
  // Preserve the caller's exact bundle/texts; authoritative canonical identity is not a replacement serializer.
}

/** All effects, immutable edges and receipts use one current-authority transaction. */
export class SchemaRegistryStore {
  private readonly membership: MembershipStore;
  constructor(private readonly pool: Pool, private readonly policy: readonly RegistryScopePolicy[]) { this.membership = new MembershipStore(pool); }
  private actor(client: PoolClient, tenantId: string, write: boolean) {
    return currentSchemaActor(client, tenantId, write);
  }
  private allow(role: TenantRole, tenantId: string, workspaceId: string, action: 'read' | 'register', definitions: readonly RegistryDefinition[] = []) {
    const policy = this.policy.find(p => p.tenantId === tenantId && p.workspaceId === workspaceId);
    if (!policy || !(action === 'read' ? policy.readRoles : policy.registerRoles).includes(role) ||
      definitions.some(d => d.requiredCapabilities.some(c => !policy.capabilities.includes(c)))) error(403, 'scope_forbidden');
  }
  private receiptDefinitions(receipt: SchemaRegistrationReceipt, tenantId: string, workspaceId: string, actorId: string, idempotencyKey: string) {
    if (receipt.operation !== 'register' || receipt.idempotencyKey !== idempotencyKey || receipt.requesterIdentityId !== actorId ||
      !Array.isArray(receipt.dependencies) || receipt.dependencies.length >= REGISTRY_LIMITS.closure) error(409, 'receipt_unavailable');
    return [receipt.record, ...receipt.dependencies].map(record => {
      const parsed = parseRegistryDefinition(record.definitionText);
      if (parsed.definition.scope.tenantId !== tenantId || parsed.definition.scope.workspaceId !== workspaceId ||
        parsed.definition.schemaId !== record.schemaId || parsed.definition.version !== record.version ||
        parsed.canonicalText !== record.canonicalText || hash(parsed.canonicalText) !== record.digest ||
        parseRegistryDefinition(JSON.stringify(record.definition)).canonicalText !== parsed.canonicalText) error(409, 'receipt_unavailable');
      return parsed.definition;
    });
  }
  private async workspace(client: PoolClient, tenantId: string, workspaceId: string) {
    const found = await client.query('SELECT 1 FROM wonffice.workspaces WHERE tenant_id=$1 AND id=$2', [tenantId, workspaceId]);
    if (!found.rowCount) error(404, 'not_found');
  }
  private row(client: PoolClient, tenantId: string, workspaceId: string, schemaId: string, v: number) {
    return schemaRow(client, tenantId, workspaceId, schemaId, v);
  }
  private closure(client: PoolClient, tenantId: string, workspaceId: string, root: SchemaVersion) {
    return schemaClosure(client, tenantId, workspaceId, root);
  }
  async register(principal: VerifiedPrincipal, tenantId: string, workspaceId: string, schemaId: string, v: number,
    input: { definitionText: string; idempotencyKey: string }): Promise<SchemaRegistrationReceipt> {
    uuid(tenantId); uuid(workspaceId); uuid(schemaId); key(input.idempotencyKey);
    const definitionText = input.definitionText, idempotencyKey = input.idempotencyKey;
    const parsed = parseRegistryDefinition(definitionText), d = parsed.definition;
    if (d.scope.tenantId !== tenantId || d.scope.workspaceId !== workspaceId || d.schemaId !== schemaId || d.version !== v) error(400, 'schema_scope_conflict');
    const digest = hash(parsed.canonicalText), requestHash = hash(JSON.stringify(['schema-register-v1', tenantId, workspaceId, schemaId, v, definitionText]));
    return this.membership.withAuthorizedTenant(principal, tenantId, async client => {
      const actor = await this.actor(client, tenantId, true); this.allow(actor.role, tenantId, workspaceId, 'register'); await this.workspace(client, tenantId, workspaceId);
      await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,495))', [JSON.stringify([tenantId, actor.id, idempotencyKey])]);
      const prior = (await client.query<{ request_hash: string; result: SchemaRegistrationReceipt }>(
        'SELECT request_hash,result FROM wonffice.schema_registry_receipts WHERE tenant_id=$1 AND identity_id=$2 AND idempotency_key=$3', [tenantId, actor.id, idempotencyKey])).rows[0];
      if (prior) { if (prior.request_hash !== requestHash) error(409, 'key_reuse');
        this.allow(actor.role, tenantId, workspaceId, 'register', this.receiptDefinitions(prior.result, tenantId, workspaceId, actor.id, idempotencyKey)); return prior.result; }
      this.allow(actor.role, tenantId, workspaceId, 'register', [d]);
      for (const { ref } of refs(d)) {
        const target = await this.row(client, tenantId, workspaceId, ref.schemaId, ref.version);
        if (!target) error(422, 'dependency_missing'); if (target.digest !== ref.digest) error(409, 'dependency_digest_conflict');
        const dependency = version(target, tenantId, workspaceId);
        this.allow(actor.role, tenantId, workspaceId, 'register', [dependency.definition, ...(await this.closure(client, tenantId, workspaceId, dependency)).map(r => r.definition)]);
      }
      const inserted = await client.query<Row>(`INSERT INTO wonffice.schema_versions
        (tenant_id,workspace_id,schema_id,version,digest,definition_text,canonical_text,actor_identity_id)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT DO NOTHING RETURNING *`,
      [tenantId, workspaceId, schemaId, v, digest, definitionText, parsed.canonicalText, actor.id]);
      const row = inserted.rows[0] ?? await this.row(client, tenantId, workspaceId, schemaId, v);
      if (!row || row.digest !== digest) error(409, 'immutable_version_conflict');
      if (inserted.rowCount) {
        for (const [ordinal, edge] of refs(d).entries()) await client.query(`INSERT INTO wonffice.schema_dependencies
          (tenant_id,workspace_id,schema_id,version,ordinal,kind,dependency_id,dependency_version,dependency_digest)
          VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`, [tenantId, workspaceId, schemaId, v, ordinal, edge.kind, edge.ref.schemaId, edge.ref.version, edge.ref.digest]);
      }
      const record = version(row, tenantId, workspaceId), dependencies = await this.closure(client, tenantId, workspaceId, record);
      this.allow(actor.role, tenantId, workspaceId, 'register', [record.definition, ...dependencies.map(r => r.definition)]);
      const receipt: SchemaRegistrationReceipt = { operation: 'register', idempotencyKey, requestHash, requesterIdentityId: actor.id,
        authorityEpoch: actor.epoch, record, dependencies };
      if (Buffer.byteLength(JSON.stringify(receipt), 'utf8') > REGISTRY_LIMITS.bundleBytes) error(413, 'schema_bundle_too_large');
      await client.query(`INSERT INTO wonffice.schema_registry_receipts(tenant_id,workspace_id,identity_id,idempotency_key,request_hash,result)
        VALUES($1,$2,$3,$4,$5,$6)`, [tenantId, workspaceId, actor.id, idempotencyKey, requestHash, JSON.stringify(receipt)]);
      return receipt;
    });
  }
  async get(principal: VerifiedPrincipal, tenantId: string, workspaceId: string, schemaId: string, v: number) {
    uuid(tenantId); uuid(workspaceId); uuid(schemaId); if (!Number.isSafeInteger(v) || v < 1 || v > 2147483647) error(400, 'invalid_request');
    return this.membership.withAuthorizedTenant(principal, tenantId, async client => {
      const actor = await this.actor(client, tenantId, false); this.allow(actor.role, tenantId, workspaceId, 'read'); await this.workspace(client, tenantId, workspaceId);
      const row = await this.row(client, tenantId, workspaceId, schemaId, v); if (!row) error(404, 'not_found');
      const record = version(row, tenantId, workspaceId), dependencies = await this.closure(client, tenantId, workspaceId, record);
      this.allow(actor.role, tenantId, workspaceId, 'read', [record.definition, ...dependencies.map(r => r.definition)]); return { record, dependencies };
    });
  }
  async receipt(principal: VerifiedPrincipal, tenantId: string, workspaceId: string, idempotencyKey: string) {
    uuid(tenantId); uuid(workspaceId); key(idempotencyKey);
    return this.membership.withAuthorizedTenant(principal, tenantId, async client => {
      const actor = await this.actor(client, tenantId, true); this.allow(actor.role, tenantId, workspaceId, 'register'); await this.workspace(client, tenantId, workspaceId);
      const found = (await client.query<{ result: SchemaRegistrationReceipt }>(
        'SELECT result FROM wonffice.schema_registry_receipts WHERE tenant_id=$1 AND workspace_id=$2 AND identity_id=$3 AND idempotency_key=$4',
        [tenantId, workspaceId, actor.id, idempotencyKey])).rows[0];
      if (!found) error(404, 'not_found');
      this.allow(actor.role, tenantId, workspaceId, 'register', this.receiptDefinitions(found.result, tenantId, workspaceId, actor.id, idempotencyKey)); return found.result;
    });
  }
  async legacyDocument(principal: VerifiedPrincipal, tenantId: string, workspaceId: string, documentId: string) {
    uuid(tenantId); uuid(workspaceId); uuid(documentId);
    return this.membership.withAuthorizedTenant(principal, tenantId, async client => {
      const actor = await this.actor(client, tenantId, false); this.allow(actor.role, tenantId, workspaceId, 'read');
      const found = await client.query<{ documentId: string; product: string; mode: string; pageId: string;
        fileFormat: string; fileVersion: number; revision: number; snapshotHash: string; snapshotText: string }>(
        `SELECT d.id AS "documentId", d.product,d.mode,d.page_id AS "pageId",s.file_format AS "fileFormat",s.file_version AS "fileVersion",
          s.revision,s.snapshot_hash AS "snapshotHash",s.snapshot_text AS "snapshotText" FROM wonffice.documents d
          JOIN wonffice.document_snapshots s ON s.tenant_id=d.tenant_id AND s.document_id=d.id
          WHERE d.tenant_id=$1 AND d.workspace_id=$2 AND d.id=$3 FOR SHARE OF d,s`, [tenantId, workspaceId, documentId]);
      const row = found.rows[0]; if (!row) error(404, 'not_found');
      if (row.product !== 'note' || row.mode !== 'snapshot' || row.fileFormat !== 'barocss-note' || row.fileVersion !== 1 ||
        typeof row.snapshotText !== 'string' || hash(row.snapshotText) !== row.snapshotHash) error(422, 'unsupported_native_format');
      const read = readNoteSnapshotFile(row.snapshotText);
      if ('error' in read || read.document.attributes.pageId !== row.pageId) error(422, 'unsupported_native_format');
      return { status: 'legacy_unpinned' as const, documentId: row.documentId, documentRevision: row.revision,
        snapshotHash: row.snapshotHash, nativeFormat: { format: row.fileFormat, version: row.fileVersion } };
    });
  }
  async ready(): Promise<boolean> {
    const client = await this.pool.connect(); let safe = false;
    try {
      const result = await client.query<{ safe: boolean }>(`SELECT current_user='wonffice_app' AND NOT rolsuper AND NOT rolbypassrls
        AND NOT pg_has_role(current_user,'wonffice_owner','MEMBER') AND NOT pg_has_role(current_user,'wonffice_backup','MEMBER')
        AND NULLIF(current_setting('wonffice.tenant_id',true),'') IS NULL
        AND NULLIF(current_setting('wonffice.oidc_issuer',true),'') IS NULL
        AND NULLIF(current_setting('wonffice.oidc_subject',true),'') IS NULL AS safe FROM pg_roles WHERE rolname=current_user`);
      if (!result.rows[0]?.safe) return false;
      await client.query('SELECT schema_id,version,digest,definition_text,canonical_text FROM wonffice.schema_versions WHERE false');
      await client.query('SELECT dependency_id,dependency_version,dependency_digest FROM wonffice.schema_dependencies WHERE false');
      await client.query('SELECT identity_id,request_hash,result FROM wonffice.schema_registry_receipts WHERE false');
      const grants = await client.query<{ safe: boolean }>(`SELECT
        has_function_privilege(current_user,'wonffice.project_current_actor(uuid)','EXECUTE')
        AND has_function_privilege(current_user,'wonffice.project_execution_actor_epoch(uuid)','EXECUTE')
        AND bool_and(has_table_privilege(current_user,tab,'SELECT') AND has_table_privilege(current_user,tab,'INSERT')
          AND NOT has_table_privilege(current_user,tab,'UPDATE') AND NOT has_table_privilege(current_user,tab,'DELETE')) AS safe
        FROM unnest(ARRAY['wonffice.schema_versions','wonffice.schema_dependencies','wonffice.schema_registry_receipts']) AS required_tables(tab)`);
      safe = grants.rows[0]?.safe === true; return safe;
    } catch { return false; } finally { client.release(!safe); }
  }
}
