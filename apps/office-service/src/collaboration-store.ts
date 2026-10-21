import { createHash, randomUUID } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import { NOTE_FULL_SEED_V2, canonicalFullNoteSeedHash, createFullNoteSeed, decodeFullNoteSeedTree,
  parseFullNoteSeedSource, type FullNoteSeed } from '@barocss/office-note-file';
import { DocumentError } from './document-store.js';
import { MembershipStore, TenantAccessDeniedError, type TenantRole,
  type VerifiedPrincipal } from './membership-store.js';
import { withTenant } from './tenant-store.js';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const requestKey = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,119}$/;
const documentKey = /^wonffice-([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})-([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;

/** Current verified caller authority. Never persist it in the frozen seed attempt. */
export interface CollaborationSession extends VerifiedPrincipal {
  readonly sessionId: string;
  /** Verified access-token expiry in Unix seconds. */
  readonly expiresAt: number;
}
export class CollaborationAuthorityError extends Error {
  constructor(readonly status: 401 | 403 | 503, readonly reason: string) { super(reason); }
}

export type CollaborationSessionGate = (session: CollaborationSession) => Promise<boolean>;

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
  canonicalSeed: FullNoteSeed;
}

export type SeedProof = Omit<SeedTask, 'tenantId' | 'documentId' | 'snapshotText' | 'canonicalSeed'> & {
  /** Provider-native durable checkpoint, obtained by read-back after sync. */
  providerCheckpoint: string;
  /** Hash of the independently read typed Note tree. The legacy field name is retained in SQL. */
  providerSnapshotHash: string;
};

/** A server-owned adapter must read back the durable provider state before returning proof. */
export interface CollaborationSeeder {
  seed(task: SeedTask, session: CollaborationSession): Promise<void>;
  inspect(task: SeedTask, session: CollaborationSession): Promise<SeedProof | null>;
}

interface SeedRow {
  seedId: string;
  requestKey: string;
  snapshotRevision: number;
  snapshotHash: string;
  providerProject: string;
  providerBuild: string;
  status: 'initializing' | 'uncertain' | 'confirmed';
  codecVersion: string | null;
  canonicalSeed: FullNoteSeed | null;
  canonicalSeedHash: string | null;
  sourceSnapshotText: string | null;
  confirmedProviderSnapshotHash: string | null;
}

interface DocumentRow {
  documentId: string;
  tenantId: string;
  documentKey: string;
  mode: 'snapshot' | 'initializing' | 'collaborative';
  revision: number;
  snapshotHash: string;
  snapshotText: string;
  pageId: string | null;
  product: string;
}

const selectDocument = `SELECT d.id AS "documentId", d.tenant_id AS "tenantId",
  d.document_key AS "documentKey", d.mode, d.page_id AS "pageId", d.product, s.revision, s.snapshot_hash AS "snapshotHash",
  s.snapshot_text AS "snapshotText"
  FROM wonffice.documents d JOIN wonffice.document_snapshots s
  ON s.tenant_id = d.tenant_id AND s.document_id = d.id`;
const selectSeed = `SELECT seed_id AS "seedId", request_key AS "requestKey",
  snapshot_revision AS "snapshotRevision", snapshot_hash AS "snapshotHash",
  provider_project AS "providerProject", provider_build AS "providerBuild", status,
  codec_version AS "codecVersion", canonical_seed AS "canonicalSeed",
  canonical_seed_hash AS "canonicalSeedHash", source_snapshot_text AS "sourceSnapshotText",
  confirmed_provider_snapshot_hash AS "confirmedProviderSnapshotHash"
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
    proof.providerSnapshotHash === task.canonicalSeed.canonicalTreeHash && proof.documentKey === task.documentKey &&
    proof.providerProject === task.providerProject && proof.providerBuild === task.providerBuild &&
    proof.seedId === task.seedId && proof.snapshotRevision === task.snapshotRevision &&
    proof.snapshotHash === task.snapshotHash;
}

function restoredSeed(row: SeedRow, snapshotText: string, snapshotHash: string): FullNoteSeed {
  if (row.codecVersion !== NOTE_FULL_SEED_V2 || !row.canonicalSeed ||
    row.sourceSnapshotText !== snapshotText || row.snapshotHash !== snapshotHash ||
    createHash('sha256').update(snapshotText).digest('hex') !== snapshotHash ||
    row.canonicalSeed.version !== NOTE_FULL_SEED_V2 ||
    row.canonicalSeed.sourceHash !== snapshotHash ||
    row.canonicalSeed.canonicalTreeHash !== row.canonicalSeedHash) {
    throw new DocumentError(409, 'seed_uncertain');
  }
  try {
    const tree = decodeFullNoteSeedTree(row.canonicalSeed.tree);
    if (tree.attributes?.pageId !== row.canonicalSeed.pageId ||
      canonicalFullNoteSeedHash(tree) !== row.canonicalSeedHash) {
      throw new Error('canonical_seed_mismatch');
    }
  } catch { throw new DocumentError(409, 'seed_uncertain'); }
  return row.canonicalSeed;
}

/** Keeps PostgreSQL snapshot ownership closed until a pinned provider seed is verified. */
export class CollaborationStore {
  private readonly membership: MembershipStore;
  constructor(private readonly pool: Pool, private readonly providerProject: string,
    private readonly providerBuild: string, private readonly seeder?: CollaborationSeeder,
    private readonly sessionGate?: CollaborationSessionGate) {
    if (!providerProject || providerProject.length > 120 || !providerBuild || providerBuild.length > 120) {
      throw new Error('invalid_collaboration_provider_identity');
    }
    this.membership = new MembershipStore(pool);
  }

  private operationSession(session: CollaborationSession): CollaborationSession {
    if (!session || typeof session.issuer !== 'string' || !session.issuer || session.issuer.length > 2048 ||
      typeof session.subject !== 'string' || !session.subject || session.subject.length > 255 ||
      typeof session.sessionId !== 'string' || !session.sessionId || session.sessionId.length > 255 ||
      !Number.isSafeInteger(session.expiresAt)) throw new CollaborationAuthorityError(401, 'unauthorized');
    return Object.freeze({ issuer: session.issuer, subject: session.subject,
      sessionId: session.sessionId, expiresAt: session.expiresAt });
  }

  private async requireSession(session: CollaborationSession) {
    if (session.expiresAt <= Date.now() / 1000) throw new CollaborationAuthorityError(401, 'session_expired');
    if (!this.sessionGate) throw new CollaborationAuthorityError(503, 'auth_unavailable');
    let current: boolean;
    try { current = await this.sessionGate(session); }
    catch { throw new CollaborationAuthorityError(503, 'auth_unavailable'); }
    if (current !== true) throw new CollaborationAuthorityError(403, 'forbidden');
    // A session check can itself take time. Never admit an expired token afterward.
    if (session.expiresAt <= Date.now() / 1000) throw new CollaborationAuthorityError(401, 'session_expired');
  }

  private async requireAuthority(client: PoolClient, session: CollaborationSession, tenantId: string) {
    await this.requireSession(session);
    // Re-read after the session gate and any document-lock wait. The transaction's
    // RLS identity is the present caller, never the initiating SeedTask.
    const found = await client.query<{ role: TenantRole }>(`SELECT role FROM wonffice.tenant_memberships
      WHERE tenant_id = $1 AND revoked_at IS NULL`, [tenantId]);
    if (!found.rows[0]) throw new TenantAccessDeniedError();
    requireWriter(found.rows[0].role);
    if (session.expiresAt <= Date.now() / 1000) throw new CollaborationAuthorityError(401, 'session_expired');
  }

  private async currentWriter(session: CollaborationSession, tenantId: string) {
    await this.membership.withAuthorizedTenant(session, tenantId,
      async client => { await this.requireAuthority(client, session, tenantId); });
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
      snapshotHash: attempt.snapshotHash, snapshotText: attempt.sourceSnapshotText ?? '',
      canonicalSeed: restoredSeed(attempt, document.snapshotText, document.snapshotHash) };
  }

  private async markUncertain(task: SeedTask) {
    // The requester can lose membership while the provider call is in flight. This
    // internal state update uses the previously authorized, server-created seed ID.
    await withTenant(this.pool, task.tenantId, async client => {
      await client.query(`UPDATE wonffice.document_collaboration_seeds SET status = 'uncertain', updated_at = now()
        WHERE tenant_id = $1 AND document_id = $2 AND seed_id = $3 AND status = 'initializing'`,
      [task.tenantId, task.documentId, task.seedId]);
    });
  }

  private async promote(session: CollaborationSession, task: SeedTask, proof: SeedProof | null) {
    if (!matches(task, proof)) throw new DocumentError(409, 'seed_uncertain');
    return this.membership.withAuthorizedTenant(session, task.tenantId, async (client, role) => {
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
        attempt.providerBuild !== task.providerBuild || current.mode !== 'initializing' ||
        current.snapshotText !== task.snapshotText ||
        restoredSeed(attempt, current.snapshotText, current.snapshotHash).canonicalTreeHash !==
          task.canonicalSeed.canonicalTreeHash) {
        throw new DocumentError(409, 'mode_conflict');
      }
      await this.requireAuthority(client, session, task.tenantId);
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

  async requestTransition(caller: CollaborationSession, tenantId: string, documentId: string,
    input: { expectedRevision: number; idempotencyKey: string }) {
    validateId(tenantId); validateId(documentId);
    if (!Number.isSafeInteger(input.expectedRevision) || input.expectedRevision < 1 ||
      !requestKey.test(input.idempotencyKey)) throw new DocumentError(400, 'invalid_request');
    const session = this.operationSession(caller);
    await this.requireSession(session);
    if (!this.seeder) throw new Error('collaboration_seeder_unconfigured');
    const reservation = await this.membership.withAuthorizedTenant(session, tenantId, async (client, role) => {
      requireWriter(role);
      const found = await client.query<DocumentRow>(selectDocument +
        ' WHERE d.tenant_id = $1 AND d.id = $2 FOR UPDATE OF d, s', [tenantId, documentId]);
      await this.requireAuthority(client, session, tenantId);
      const current = found.rows[0];
      if (!current) throw new DocumentError(404, 'not_found');
      if (current.mode !== 'snapshot') {
        const existing = await client.query<SeedRow>(selectSeed, [tenantId, documentId]);
        const attempt = existing.rows[0];
        if (attempt?.requestKey !== input.idempotencyKey ||
          attempt.snapshotRevision !== input.expectedRevision) {
          throw new DocumentError(409, 'initialization_in_progress');
        }
        const seed = restoredSeed(attempt, current.snapshotText, current.snapshotHash);
        if (current.mode === 'collaborative' &&
          (attempt.status !== 'confirmed' ||
            attempt.confirmedProviderSnapshotHash !== seed.canonicalTreeHash)) {
          throw new DocumentError(409, 'seed_uncertain');
        }
        return { kind: 'existing' as const, result:
          current.mode === 'collaborative' && attempt.status === 'confirmed'
            ? { documentId, documentKey: current.documentKey, mode: 'collaborative' as const }
            : { documentId, documentKey: current.documentKey, mode: 'initializing' as const,
                transitionStatus: attempt.status } };
      }
      if (current.revision !== input.expectedRevision) throw new DocumentError(409, 'revision_conflict');
      if (current.product !== 'note' || !current.pageId) throw new DocumentError(422, 'unsupported_collaboration_product');
      if (createHash('sha256').update(current.snapshotText).digest('hex') !== current.snapshotHash) {
        throw new DocumentError(409, 'snapshot_hash_mismatch');
      }
      let canonicalSeed: FullNoteSeed;
      try {
        canonicalSeed = createFullNoteSeed(parseFullNoteSeedSource(current.snapshotText),
          { pageId: current.pageId, mintNodeId: () => `node:${randomUUID()}` });
      } catch { throw new DocumentError(422, 'unsupported_note_snapshot'); }
      const seedId = randomUUID();
      await client.query(`INSERT INTO wonffice.document_collaboration_seeds
        (tenant_id, document_id, provider, provider_project, provider_build, seed_id,
          request_key, snapshot_revision, snapshot_hash, status, codec_version,
          canonical_seed, canonical_seed_hash, source_snapshot_text)
        VALUES ($1, $2, 'yorkie', $3, $4, $5, $6, $7, $8, 'initializing', $9, $10, $11, $12)`,
      [tenantId, documentId, this.providerProject, this.providerBuild, seedId,
        input.idempotencyKey, current.revision, current.snapshotHash, NOTE_FULL_SEED_V2,
        JSON.stringify(canonicalSeed), canonicalSeed.canonicalTreeHash, current.snapshotText]);
      await client.query(`UPDATE wonffice.documents SET mode = 'initializing', updated_at = now()
        WHERE tenant_id = $1 AND id = $2`, [tenantId, documentId]);
      return { kind: 'new' as const, task: { tenantId, documentId, documentKey: current.documentKey,
        providerProject: this.providerProject, providerBuild: this.providerBuild, seedId,
        snapshotRevision: current.revision, snapshotHash: current.snapshotHash,
        snapshotText: current.snapshotText, canonicalSeed } satisfies SeedTask };
    });
    if (reservation.kind === 'existing') return reservation.result;
    const task = reservation.task;
    try {
      await this.currentWriter(session, tenantId);
      await this.seeder.seed(task, session);
      await this.currentWriter(session, tenantId);
      const proof = await this.seeder.inspect(task, session);
      if (!matches(task, proof)) throw new Error('provider_seed_unconfirmed');
      return await this.promote(session, task, proof);
    } catch (error) {
      await this.markUncertain(task);
      if (error instanceof DocumentError || error instanceof CollaborationAuthorityError ||
        error instanceof TenantAccessDeniedError) throw error;
      throw new Error('provider_seed_uncertain');
    }
  }

  /** Reconciliation reads the pinned provider state. It never retries an unknown seed write. */
  async reconcile(caller: CollaborationSession, tenantId: string, documentId: string) {
    validateId(tenantId); validateId(documentId);
    const session = this.operationSession(caller);
    await this.requireSession(session);
    if (!this.seeder) throw new Error('collaboration_seeder_unconfigured');
    const task = await this.membership.withAuthorizedTenant(session, tenantId, async (client, role) => {
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
    try {
      await this.currentWriter(session, tenantId);
      const proof = await this.seeder.inspect(task, session);
      return await this.promote(session, task, proof);
    } catch (error) {
      await this.markUncertain(task);
      throw error;
    }
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
          AND d.mode = 'collaborative' AND cs.status = 'confirmed'
          AND cs.codec_version = 'note-full-seed-v2'
          AND cs.canonical_seed_hash = cs.confirmed_provider_snapshot_hash`,
      [tenantId, documentId, key]);
      const row = found.rows[0];
      if (!row) throw new DocumentError(404, 'not_found');
      return { tenantId, documentId, documentKey: key, role, intent,
        providerProject: row.providerProject, providerBuild: row.providerBuild,
        providerCheckpoint: row.providerCheckpoint, providerSnapshotHash: row.providerSnapshotHash };
    });
  }
}
