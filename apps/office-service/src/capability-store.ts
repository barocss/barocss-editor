import { createHash, randomBytes } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import { MembershipStore, TenantAccessDeniedError, type TenantRole,
  type VerifiedPrincipal } from './membership-store.js';

export type CapabilityAccess = 'r' | 'rw';
export interface CapabilitySession extends VerifiedPrincipal { sessionId: string }
export type SessionGate = (session: CapabilitySession) => Promise<boolean>;
export interface IssueCapabilityInput {
  principal: VerifiedPrincipal;
  sessionId: string;
  /** Verified OIDC session expiry, in Unix seconds. */
  oidcExpiresAt: number;
  tenantId: string;
  documentId: string;
  access: CapabilityAccess;
}
export interface YorkieAuthRequest {
  token: string;
  method: string;
  attributes: Array<{ key: string; verb: string }>;
}
export interface CapabilityDecision {
  allowed: boolean;
  status: 200 | 401 | 403 | 503;
  reason: 'allowed' | 'invalid_token' | 'forbidden' | 'unavailable';
}

export class CapabilityError extends Error {
  constructor(readonly status: 400 | 401 | 403 | 503, readonly reason: string) { super(reason); }
}

interface StoredCapability extends CapabilitySession {
  tenantId: string;
  documentId: string;
  providerProject: string;
  providerBuild: string;
  access: CapabilityAccess;
}

const documentMethods = new Set(['AttachDocument', 'DetachDocument', 'PushPull',
  'Watch', 'WatchDocument']);
const clientMethods = new Set(['ActivateClient', 'DeactivateClient']);
const tokenPattern = /^[A-Za-z0-9_-]{43}$/;
const allowed = { allowed: true, status: 200, reason: 'allowed' } as const;
const invalidToken = { allowed: false, status: 401, reason: 'invalid_token' } as const;
const forbidden = { allowed: false, status: 403, reason: 'forbidden' } as const;
const unavailable = { allowed: false, status: 503, reason: 'unavailable' } as const;

function roleAllows(role: TenantRole, access: CapabilityAccess) {
  return access === 'r' || role !== 'viewer';
}

/** Keeps provider tokens short lived and checks the current session and database state on every call. */
export class CapabilityStore {
  private readonly membership: MembershipStore;

  constructor(private readonly pool: Pool, private readonly providerProject: string,
    private readonly providerBuild: string, private readonly sessionGate: SessionGate) {
    if (!providerProject || providerProject.length > 120 ||
      !providerBuild || providerBuild.length > 120 || typeof sessionGate !== 'function') {
      throw new Error('invalid_capability_configuration');
    }
    this.membership = new MembershipStore(pool);
  }

  private async sessionCurrent(session: CapabilitySession) {
    return (await this.sessionGate(session)) === true;
  }

  private async currentDocument(client: PoolClient, tenantId: string, documentId: string) {
    const found = await client.query<{ documentKey: string }>(`SELECT d.document_key AS "documentKey"
      FROM wonffice.documents d JOIN wonffice.document_collaboration_seeds s
        ON s.tenant_id = d.tenant_id AND s.document_id = d.id
      WHERE d.tenant_id = $1 AND d.id = $2 AND d.mode = 'collaborative'
        AND s.status = 'confirmed' AND s.provider = 'yorkie'
        AND s.provider_project = $3 AND s.provider_build = $4`,
    [tenantId, documentId, this.providerProject, this.providerBuild]);
    return found.rows[0]?.documentKey;
  }

  async issue(input: IssueCapabilityInput): Promise<{
    token: string; expiresAt: number; documentKey: string; access: CapabilityAccess;
  }> {
    if (!input || (input.access !== 'r' && input.access !== 'rw') ||
      !input.sessionId || input.sessionId.length > 255 ||
      !Number.isSafeInteger(input.oidcExpiresAt)) throw new CapabilityError(400, 'invalid_request');
    const session = { ...input.principal, sessionId: input.sessionId };
    try {
      if (!await this.sessionCurrent(session)) throw new CapabilityError(403, 'forbidden');
      if (input.oidcExpiresAt <= Date.now() / 1000) throw new CapabilityError(401, 'session_expired');
      return await this.membership.withAuthorizedTenant(input.principal, input.tenantId,
        async (client, role) => {
          if (!roleAllows(role, input.access)) throw new CapabilityError(403, 'forbidden');
          const documentKey = await this.currentDocument(client, input.tenantId, input.documentId);
          if (!documentKey) throw new CapabilityError(403, 'forbidden');
          const token = randomBytes(32).toString('base64url');
          const tokenHash = createHash('sha256').update(token).digest('hex');
          const clock = await client.query<{ now: number }>(
            'SELECT extract(epoch FROM clock_timestamp())::float8 AS now');
          const now = clock.rows[0].now;
          const expiresAt = Math.min(now + 60, input.oidcExpiresAt);
          if (expiresAt <= now) throw new CapabilityError(401, 'session_expired');
          await client.query(`INSERT INTO wonffice.document_capabilities
            (token_hash, tenant_id, document_id, issuer, subject, session_id,
             provider_project, provider_build, access, created_at, expires_at)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9,
              to_timestamp($10), to_timestamp($11))`,
          [tokenHash, input.tenantId, input.documentId, input.principal.issuer,
            input.principal.subject, input.sessionId, this.providerProject, this.providerBuild,
            input.access, now, expiresAt]);
          return { token, expiresAt, documentKey, access: input.access };
        });
    } catch (error) {
      if (error instanceof TenantAccessDeniedError) throw new CapabilityError(403, 'forbidden');
      if (error instanceof CapabilityError) throw error;
      throw new CapabilityError(503, 'unavailable');
    }
  }

  async authorize(request: YorkieAuthRequest): Promise<CapabilityDecision> {
    if (!request || typeof request.token !== 'string' || !tokenPattern.test(request.token)) {
      return invalidToken;
    }
    try {
      const hash = createHash('sha256').update(request.token).digest('hex');
      const found = await this.pool.query<{ tenant_id: string; document_id: string;
        issuer: string; subject: string; session_id: string; provider_project: string;
        provider_build: string; access: CapabilityAccess }>(
        'SELECT * FROM wonffice.lookup_document_capability($1)', [hash]);
      const row = found.rows[0];
      if (!row) return invalidToken;
      const capability: StoredCapability = { tenantId: row.tenant_id, documentId: row.document_id,
        issuer: row.issuer, subject: row.subject, sessionId: row.session_id,
        providerProject: row.provider_project, providerBuild: row.provider_build, access: row.access };
      if (capability.providerProject !== this.providerProject ||
        capability.providerBuild !== this.providerBuild) return forbidden;
      if (!await this.sessionCurrent(capability)) return forbidden;
      return await this.membership.withAuthorizedTenant(capability, capability.tenantId,
        async (client, role) => {
          if (!roleAllows(role, capability.access)) return forbidden;
          const documentKey = await this.currentDocument(client, capability.tenantId,
            capability.documentId);
          if (!documentKey) return forbidden;
          if (!request || typeof request.method !== 'string' || !Array.isArray(request.attributes)) {
            return forbidden;
          }
          if (clientMethods.has(request.method)) {
            return request.attributes.length === 0 ? allowed : forbidden;
          }
          if (!documentMethods.has(request.method) || request.attributes.length !== 1) return forbidden;
          const attribute = request.attributes[0];
          if (!attribute || typeof attribute !== 'object' ||
            Object.keys(attribute).length !== 2 ||
            !Object.hasOwn(attribute, 'key') || !Object.hasOwn(attribute, 'verb') ||
            attribute.key !== documentKey ||
            (attribute.verb !== 'r' && attribute.verb !== 'rw') ||
            (attribute.verb === 'rw' && capability.access !== 'rw')) return forbidden;
          return allowed;
        });
    } catch (error) {
      // A database or session-gate outage never grants provider access.
      return error instanceof TenantAccessDeniedError ? forbidden : unavailable;
    }
  }
}
