import { randomUUID } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import { DocumentError } from './document-store.js';
import { MembershipStore, TenantAccessDeniedError, type TenantRole,
  type VerifiedPrincipal } from './membership-store.js';
import { withTenant } from './tenant-store.js';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const requestKey = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,119}$/;
const documentKey = /^wonffice-([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})-([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;

export interface SeedTask {
  tenantId: string;
  documentId: string;
  documentKey: string;
  providerProject: string;
  providerBuild: string;
  seedId: string;
  snapshotRevision: number;
  snapshotHash: string;
  snapshotText: string;
}

export type SeedProof = Omit<SeedTask, 'tenantId' | 'documentId' | 'snapshotText'> & {
  /** Provider-native durable checkpoint, obtained by read-back after sync. */
  providerCheckpoint: string;
  /** Hash of the provider's stored seed body, not the outgoing request. */
  providerSnapshotHash: string;
};

/** A server-owned adapter must read back the durable provider state before returning proof. */
export interface CollaborationSeeder {
  seed(task: SeedTask): Promise<void>;
  inspect(task: SeedTask): Promise<SeedProof | null>;
}

interface SeedRow {
  seedId: string;
  requestKey: string;
  snapshotRevision: number;
  snapshotHash: string;
  providerProject: string;
  providerBuild: string;
  status: 'initializing' | 'uncertain' | 'confirmed';
}

interface DocumentRow {
  documentId: string;
  tenantId: string;
  documentKey: string;
  mode: 'snapshot' | 'initializing' | 'collaborative';
  revision: number;
  snapshotHash: string;
  snapshotText: string;
}

const selectDocument = `SELECT d.id AS "documentId", d.tenant_id AS "tenantId",
  d.document_key AS "documentKey", d.mode, s.revision, s.snapshot_hash AS "snapshotHash",
  s.snapshot_text AS "snapshotText"
  FROM wonffice.documents d JOIN wonffice.document_snapshots s
  ON s.tenant_id = d.tenant_id AND s.document_id = d.id`;
const selectSeed = `SELECT seed_id AS "seedId", request_key AS "requestKey",
  snapshot_revision AS "snapshotRevision", snapshot_hash AS "snapshotHash",
  provider_project AS "providerProject", provider_build AS "providerBuild", status
  FROM wonffice.document_collaboration_seeds WHERE tenant_id = $1 AND document_id = $2`;

function validateId(value: string) {
  if (!uuid.test(value)) throw new DocumentError(400, 'invalid_request');
}
function requireWriter(role: TenantRole) {
  if (role === 'viewer') throw new DocumentError(403, 'forbidden');
}
function matches(task: SeedTask, proof: SeedProof | null): proof is SeedProof {
  return proof !== null && typeof proof.providerCheckpoint === 'string' &&
    proof.providerCheckpoint.length > 0 && proof.providerCheckpoint.length <= 120 &&
    proof.providerSnapshotHash === task.snapshotHash && proof.documentKey === task.documentKey &&
    proof.providerProject === task.providerProject && proof.providerBuild === task.providerBuild &&
    proof.seedId === task.seedId && proof.snapshotRevision === task.snapshotRevision &&
    proof.snapshotHash === task.snapshotHash;
}

/** Keeps PostgreSQL snapshot ownership closed until a pinned provider seed is verified. */
export class CollaborationStore {
  private readonly membership: MembershipStore;
  constructor(private readonly pool: Pool, private readonly providerProject: string,
    private readonly providerBuild: string, private readonly seeder?: CollaborationSeeder) {
    if (!providerProject || providerProject.length > 120 || !providerBuild || providerBuild.length > 120) {
      throw new Error('invalid_collaboration_provider_identity');
    }
    this.membership = new MembershipStore(pool);
  }

  private async task(client: PoolClient, tenantId: string, documentId: string): Promise<SeedTask> {
    const found = await client.query<DocumentRow>(selectDocument +
      ' WHERE d.tenant_id = $1 AND d.id = $2', [tenantId, documentId]);
    const seed = await client.query<SeedRow>(selectSeed, [tenantId, documentId]);
    const document = found.rows[0], attempt = seed.rows[0];
    if (!document || !attempt) throw new Error('collaboration_seed_missing');
    return { tenantId, documentId, documentKey: document.documentKey,
      providerProject: attempt.providerProject, providerBuild: attempt.providerBuild,
      seedId: attempt.seedId, snapshotRevision: attempt.snapshotRevision,
      snapshotHash: attempt.snapshotHash, snapshotText: document.snapshotText };
  }

  private async markUncertain(principal: VerifiedPrincipal, task: SeedTask) {
    // The requester can lose membership while the provider call is in flight. This
    // internal state update uses the previously authorized, server-created seed ID.
    void principal;
    await withTenant(this.pool, task.tenantId, async client => {
      await client.query(`UPDATE wonffice.document_collaboration_seeds SET status = 'uncertain', updated_at = now()
        WHERE tenant_id = $1 AND document_id = $2 AND seed_id = $3 AND status = 'initializing'`,
      [task.tenantId, task.documentId, task.seedId]);
    });
  }

  private async promote(principal: VerifiedPrincipal, task: SeedTask, proof: SeedProof | null) {
    if (!matches(task, proof)) throw new DocumentError(409, 'seed_uncertain');
    return this.membership.withAuthorizedTenant(principal, task.tenantId, async (client, role) => {
      requireWriter(role);
      const found = await client.query<DocumentRow>(selectDocument +
        ' WHERE d.tenant_id = $1 AND d.id = $2 FOR UPDATE OF d, s',
      [task.tenantId, task.documentId]);
      const current = found.rows[0];
      if (!current || current.documentKey !== task.documentKey) throw new DocumentError(404, 'not_found');
      const seed = await client.query<SeedRow>(selectSeed + ' FOR UPDATE',
        [task.tenantId, task.documentId]);
      const attempt = seed.rows[0];
      if (!attempt || attempt.seedId !== task.seedId || current.revision !== task.snapshotRevision ||
        current.snapshotHash !== task.snapshotHash || attempt.snapshotRevision !== task.snapshotRevision ||
        attempt.snapshotHash !== task.snapshotHash || attempt.providerProject !== task.providerProject ||
        attempt.providerBuild !== task.providerBuild || current.mode !== 'initializing') {
        throw new DocumentError(409, 'mode_conflict');
      }
      await client.query(`UPDATE wonffice.document_collaboration_seeds
        SET status = 'confirmed', confirmed_at = now(), updated_at = now(),
          confirmed_provider_checkpoint = $3, confirmed_provider_snapshot_hash = $4
        WHERE tenant_id = $1 AND document_id = $2`,
      [task.tenantId, task.documentId, proof.providerCheckpoint, proof.providerSnapshotHash]);
      await client.query(`UPDATE wonffice.documents SET mode = 'collaborative', updated_at = now()
        WHERE tenant_id = $1 AND id = $2`, [task.tenantId, task.documentId]);
      return { documentId: task.documentId, documentKey: task.documentKey, mode: 'collaborative' as const };
    });
  }

  async requestTransition(principal: VerifiedPrincipal, tenantId: string, documentId: string,
    input: { expectedRevision: number; idempotencyKey: string }) {
    validateId(tenantId); validateId(documentId);
    if (!Number.isSafeInteger(input.expectedRevision) || input.expectedRevision < 1 ||
      !requestKey.test(input.idempotencyKey)) throw new DocumentError(400, 'invalid_request');
    if (!this.seeder) throw new Error('collaboration_seeder_unconfigured');
    const reservation = await this.membership.withAuthorizedTenant(principal, tenantId, async (client, role) => {
      requireWriter(role);
      const found = await client.query<DocumentRow>(selectDocument +
        ' WHERE d.tenant_id = $1 AND d.id = $2 FOR UPDATE OF d, s', [tenantId, documentId]);
      const current = found.rows[0];
      if (!current) throw new DocumentError(404, 'not_found');
      if (current.mode !== 'snapshot') {
        const existing = await client.query<SeedRow>(selectSeed, [tenantId, documentId]);
        const attempt = existing.rows[0];
        if (attempt?.requestKey !== input.idempotencyKey ||
          attempt.snapshotRevision !== input.expectedRevision) {
          throw new DocumentError(409, 'initialization_in_progress');
        }
        return { kind: 'existing' as const, result:
          current.mode === 'collaborative' && attempt.status === 'confirmed'
            ? { documentId, documentKey: current.documentKey, mode: 'collaborative' as const }
            : { documentId, documentKey: current.documentKey, mode: 'initializing' as const,
                transitionStatus: attempt.status } };
      }
      if (current.revision !== input.expectedRevision) throw new DocumentError(409, 'revision_conflict');
      const seedId = randomUUID();
      await client.query(`INSERT INTO wonffice.document_collaboration_seeds
        (tenant_id, document_id, provider, provider_project, provider_build, seed_id,
          request_key, snapshot_revision, snapshot_hash, status)
        VALUES ($1, $2, 'yorkie', $3, $4, $5, $6, $7, $8, 'initializing')`,
      [tenantId, documentId, this.providerProject, this.providerBuild, seedId,
        input.idempotencyKey, current.revision, current.snapshotHash]);
      await client.query(`UPDATE wonffice.documents SET mode = 'initializing', updated_at = now()
        WHERE tenant_id = $1 AND id = $2`, [tenantId, documentId]);
      return { kind: 'new' as const, task: { tenantId, documentId, documentKey: current.documentKey,
        providerProject: this.providerProject, providerBuild: this.providerBuild, seedId,
        snapshotRevision: current.revision, snapshotHash: current.snapshotHash,
        snapshotText: current.snapshotText } satisfies SeedTask };
    });
    if (reservation.kind === 'existing') return reservation.result;
    const task = reservation.task;
    try {
      await this.seeder.seed(task);
      const proof = await this.seeder.inspect(task);
      if (!matches(task, proof)) throw new Error('provider_seed_unconfirmed');
      return await this.promote(principal, task, proof);
    } catch (error) {
      await this.markUncertain(principal, task);
      if (error instanceof DocumentError || error instanceof TenantAccessDeniedError) throw error;
      throw new Error('provider_seed_uncertain');
    }
  }

  /** Reconciliation reads the pinned provider state. It never retries an unknown seed write. */
  async reconcile(principal: VerifiedPrincipal, tenantId: string, documentId: string) {
    validateId(tenantId); validateId(documentId);
    if (!this.seeder) throw new Error('collaboration_seeder_unconfigured');
    const task = await this.membership.withAuthorizedTenant(principal, tenantId, async (client, role) => {
      requireWriter(role);
      const found = await client.query<DocumentRow>(selectDocument +
        ' WHERE d.tenant_id = $1 AND d.id = $2', [tenantId, documentId]);
      if (!found.rows[0]) throw new DocumentError(404, 'not_found');
      if (found.rows[0].mode !== 'initializing') throw new DocumentError(409, 'mode_conflict');
      return this.task(client, tenantId, documentId);
    });
    if (task.providerProject !== this.providerProject || task.providerBuild !== this.providerBuild) {
      throw new DocumentError(409, 'provider_mismatch');
    }
    const proof = await this.seeder.inspect(task);
    return this.promote(principal, task, proof);
  }

  /** An address alone never grants provider access. The principal and current DB role are checked. */
  async resolve(principal: VerifiedPrincipal, key: string, intent: 'read' | 'write') {
    const match = documentKey.exec(key);
    if (!match || (intent !== 'read' && intent !== 'write')) throw new DocumentError(404, 'not_found');
    const [, tenantId, documentId] = match;
    return this.membership.withAuthorizedTenant(principal, tenantId, async (client, role) => {
      if (intent === 'write') requireWriter(role);
      const found = await client.query<{ providerProject: string; providerBuild: string;
        providerCheckpoint: string; providerSnapshotHash: string }>(`SELECT
        cs.provider_project AS "providerProject", cs.provider_build AS "providerBuild",
        cs.confirmed_provider_checkpoint AS "providerCheckpoint",
        cs.confirmed_provider_snapshot_hash AS "providerSnapshotHash"
        FROM wonffice.documents d JOIN wonffice.document_collaboration_seeds cs
        ON cs.tenant_id = d.tenant_id AND cs.document_id = d.id
        WHERE d.tenant_id = $1 AND d.id = $2 AND d.document_key = $3
          AND d.mode = 'collaborative' AND cs.status = 'confirmed'`,
      [tenantId, documentId, key]);
      const row = found.rows[0];
      if (!row) throw new DocumentError(404, 'not_found');
      return { tenantId, documentId, documentKey: key, role, intent,
        providerProject: row.providerProject, providerBuild: row.providerBuild,
        providerCheckpoint: row.providerCheckpoint, providerSnapshotHash: row.providerSnapshotHash };
    });
  }
}
