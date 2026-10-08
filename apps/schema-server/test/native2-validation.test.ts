import { describe, expect, it } from 'vitest';
import { DocumentError } from '@barocss/office-service/document-store';
import { createSchemaServer, type SchemaServerDependencies } from '../src/server.js';
import type { Native2Documents } from '../src/native2-routes.js';

const tenantId = '11111111-1111-4111-8111-111111111111';
const documentId = '22222222-2222-4222-8222-222222222222';
const principal = { issuer: 'https://controlled.example', subject: 'writer' };
const path = `/v1/tenants/${tenantId}/note-native2/documents/${documentId}/validation`;
const headers = { authorization: 'Bearer controlled.token' };
const source = { kind: 'document', expectedRevision: 1, expectedSnapshotHash: 'a'.repeat(64), expectedPriorPinDigest: 'b'.repeat(64) };
const candidate = { ...source, kind: 'candidate', snapshotText: '{"format":"barocss-note","version":2}', intendedAction: 'preserve' };

function controlled() {
  const calls: Array<{ principal: unknown; tenantId: string; documentId: string; input: unknown }> = [];
  let denied = false;
  const documents = {
    validateNative2: async (verified: unknown, tenant: string, document: string, input: unknown) => {
      if (denied) throw new DocumentError(403, 'scope_forbidden');
      calls.push({ principal: verified, tenantId: tenant, documentId: document, input });
      return { status: 'structurally_valid', kind: 'document', documentId: document,
        documentRevision: 1, snapshotHash: source.expectedSnapshotHash, priorPinDigest: source.expectedPriorPinDigest,
        checks: ['current_authority', 'current_source', 'native2_file', 'registered_bundle', 'source_preconditions'] };
    },
    create: async () => { throw new Error('unexpected_create'); },
    open: async () => { throw new Error('unexpected_open'); },
    updateSnapshot: async () => { throw new Error('unexpected_update'); },
    getReceipt: async () => { throw new Error('unexpected_receipt'); },
  } as unknown as Native2Documents;
  const deps: SchemaServerDependencies = { verifier: { verify: async () => principal },
    memberships: { getTenantAccess: async () => ({ tenantId, role: 'editor' }) },
    registry: { ready: async () => true } as unknown as SchemaServerDependencies['registry'], policy: [], documents };
  const app = createSchemaServer(deps);
  return { app, calls, deny: () => { denied = true; } };
}

describe('strict read-only native2 validation HTTP seam', () => {
  it('uses the verified principal and exact request without dispatching a write', async () => {
    const x = controlled();
    try {
      const response = await x.app.inject({ method: 'POST', url: path, headers, payload: source });
      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({ status: 'structurally_valid', kind: 'document', documentId });
      expect(x.calls).toEqual([{ principal, tenantId, documentId, input: source }]);
      expect(response.headers['cache-control']).toBe('no-store');
    } finally { await x.app.close(); }
  });

  it('rejects extra grants, missing preconditions, malformed hashes, queries and wrong candidate action before store dispatch', async () => {
    const x = controlled();
    try {
      for (const payload of [{ ...source, approved: true }, { ...source, expectedRevision: undefined },
        { ...source, expectedSnapshotHash: 'A'.repeat(64) }, { ...candidate, intendedAction: 'publish' },
        { ...candidate, role: 'owner' }, { ...source, kind: 'candidate' }]) {
        expect((await x.app.inject({ method: 'POST', url: path, headers, payload })).statusCode).toBe(400);
      }
      expect((await x.app.inject({ method: 'POST', url: path + '?approved=true', headers, payload: source })).statusCode).toBe(400);
      expect(x.calls).toEqual([]);
    } finally { await x.app.close(); }
  });

  it('requires a bearer token and forwards current service denial as a named status', async () => {
    const x = controlled();
    try {
      expect((await x.app.inject({ method: 'POST', url: path, payload: source })).statusCode).toBe(401);
      x.deny();
      const response = await x.app.inject({ method: 'POST', url: path, headers, payload: candidate });
      expect(response.statusCode).toBe(403); expect(response.json()).toEqual({ status: 'scope_forbidden' });
      expect(x.calls).toEqual([]);
    } finally { await x.app.close(); }
  });
});
