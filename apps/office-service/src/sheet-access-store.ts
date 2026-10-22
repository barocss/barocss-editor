import type { PoolClient } from 'pg';

/** Structural port to the unchanged canonical membership transaction. */
export interface SheetPrincipal { issuer: string; subject: string }
export interface SheetMembershipPort {
  withAuthorizedTenant<T>(principal: SheetPrincipal, tenantId: string,
    operation: (client: PoolClient, role: 'owner' | 'admin' | 'editor' | 'viewer') => Promise<T>): Promise<T>;
}

export type SheetAccess = 'read-write' | 'read-only';
export type SheetAccessIntent = 'read' | 'write';
export interface SheetAccessScope { tenantId: string; workspaceId: string; documentId: string }
export interface CurrentSheetGrant extends SheetAccessScope {
  /** The existing wonffice.identities.id, never a transport-generated account. */
  userId: string;
  access: SheetAccess;
  workbookId: string;
  generation: string;
  grantVersion: number;
  documentVersion: number;
}

export class SheetAccessError extends Error {
  readonly code: string;
  readonly status: number;
  constructor(code: string, status = 403) { super(code); this.code = code; this.status = status; }
}
/** The caller must inspect its own native side-effect boundary and retain ACK unknown.
 * PostgreSQL and the native store do not share an atomic transaction.
 */
export class SheetAccessOperationUncertainError extends SheetAccessError {
  readonly operationCompleted: boolean;
  constructor(operationCompleted: boolean) {
    super('sheet-operation-uncertain', 503); this.operationCompleted = operationCompleted;
  }
}

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function isUuid(value: unknown): value is string { return typeof value === 'string' && uuid.test(value); }
function object(value: unknown): value is Record<string, unknown> { return value !== null && typeof value === 'object' && !Array.isArray(value); }
function version(value: unknown): value is number { return typeof value === 'number' && Number.isSafeInteger(value) && value > 0; }
function checkedScope(value: SheetAccessScope): SheetAccessScope {
  if (!object(value) || Object.keys(value).sort().join(',') !== 'documentId,tenantId,workspaceId' ||
      !isUuid(value.tenantId) || !isUuid(value.workspaceId) || !isUuid(value.documentId)) throw new SheetAccessError('invalid-sheet-scope', 400);
  return { tenantId: value.tenantId.toLowerCase(), workspaceId: value.workspaceId.toLowerCase(), documentId: value.documentId.toLowerCase() };
}
function checkedPrincipal(value: SheetPrincipal): SheetPrincipal {
  if (!object(value) || typeof value.issuer !== 'string' || value.issuer.length < 1 || value.issuer.length > 2048 ||
      typeof value.subject !== 'string' || value.subject.length < 1 || value.subject.length > 255) throw new SheetAccessError('invalid-principal', 400);
  return { issuer: value.issuer, subject: value.subject };
}
function currentGrant(value: unknown, scope: SheetAccessScope): CurrentSheetGrant {
  if (!object(value) || !isUuid(value.userId) || !isUuid(value.tenantId) || !isUuid(value.workspaceId) || !isUuid(value.documentId) ||
      !isUuid(value.workbookId) || !isUuid(value.generation) || (value.access !== 'read-write' && value.access !== 'read-only') ||
      !version(value.grantVersion) || !version(value.documentVersion) || value.tenantId.toLowerCase() !== scope.tenantId ||
      value.workspaceId.toLowerCase() !== scope.workspaceId || value.documentId.toLowerCase() !== scope.documentId) throw new SheetAccessError('sheet-access-unavailable', 503);
  return Object.freeze({ ...scope, userId: value.userId.toLowerCase(), access: value.access,
    workbookId: value.workbookId.toLowerCase(), generation: value.generation.toLowerCase(), grantVersion: value.grantVersion, documentVersion: value.documentVersion });
}
function thenable(value: unknown): boolean {
  return value !== null && (typeof value === 'object' || typeof value === 'function') && typeof Reflect.get(value, 'then') === 'function';
}
function sanitized(error: unknown): SheetAccessError {
  if (error instanceof SheetAccessError) return error;
  if (object(error) && error.message === 'sheet_read_only') return new SheetAccessError('read-only-denied');
  if (object(error) && (error.message === 'tenant_access_denied' || error.message === 'sheet_access_denied' || error.code === '42501')) return new SheetAccessError('current-access-denied');
  return new SheetAccessError('sheet-access-unavailable', 503);
}

/** Reuses the canonical membership transaction and its verified OIDC/RLS context.
 * The SQL function locks membership -> Sheet document -> current person's grant.
 * Locks remain held during the trusted SYNCHRONOUS operation and until PG ends.
 * No network await, socket flush, or asynchronous native authorization belongs
 * inside operation. Transports may synchronously enqueue while the grant is held.
 */
export class SheetAccessStore {
  private readonly membership: SheetMembershipPort;
  constructor(membership: SheetMembershipPort) { this.membership = membership; }

  async withCurrentAccess<T>(principal: SheetPrincipal, requestedScope: SheetAccessScope, intent: SheetAccessIntent,
    operation: (grant: CurrentSheetGrant) => T): Promise<T> {
    const verified = checkedPrincipal(principal), scope = checkedScope(requestedScope);
    if (intent !== 'read' && intent !== 'write') throw new SheetAccessError('invalid-sheet-intent', 400);
    if (typeof operation !== 'function' || Object.prototype.toString.call(operation) === '[object AsyncFunction]') throw new SheetAccessError('sync-operation-required', 400);
    let entered = false, completed = false;
    try {
      return await this.membership.withAuthorizedTenant(verified, scope.tenantId, async client => {
        // Do not use withAuthorizedTenant's earlier role argument after a lock
        // wait. The function returns the fresh role/grant intersection itself.
        const result = await client.query(`SELECT user_id AS "userId", effective_access AS access,
          tenant_id AS "tenantId", workspace_id AS "workspaceId", document_id AS "documentId",
          workbook_id AS "workbookId", generation, grant_version AS "grantVersion", document_version AS "documentVersion"
          FROM wonffice.sheet_current_access($1::uuid,$2::uuid,$3::uuid,$4::text)`,
        [scope.tenantId, scope.workspaceId, scope.documentId, intent]);
        if (result.rows.length !== 1) throw new SheetAccessError('current-access-denied');
        const grant = currentGrant(result.rows[0], scope);
        if (intent === 'write' && grant.access !== 'read-write') throw new SheetAccessError('read-only-denied');
        entered = true;
        const outcome = operation(grant);
        if (thenable(outcome)) throw new SheetAccessError('sync-operation-required', 400);
        completed = true;
        return outcome;
      });
    } catch (error) {
      // Even a PG COMMIT or context-cleanup failure can follow native COMMIT.
      // Never rewrite such a boundary failure into a packet authorization denial.
      if (entered) throw new SheetAccessOperationUncertainError(completed);
      throw sanitized(error);
    }
  }
}
