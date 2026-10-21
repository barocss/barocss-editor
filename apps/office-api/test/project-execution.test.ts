import { describe, expect, it, vi } from 'vitest';
import { ProjectError } from '@barocss/office-service/project-store';
import { TenantAccessDeniedError } from '@barocss/office-service/membership-store';
import type { ProjectExecutionStore, ProjectExecutionView } from '@barocss/office-service/project-execution';
import { createApiServer } from '../src/server.js';

const tenantId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', projectId = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const workId = 'cccccccc-cccc-cccc-cccc-cccccccccccc', attemptId = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
const principal = { issuer: 'https://synthetic.example.test', subject: 'editor' };
const headers = { authorization: 'Bearer valid' };
const prefix = `/v1/tenants/${tenantId}/projects/${projectId}/works/${workId}/execution`;
const unavailable = async () => { throw new Error('unused'); };
const setup = (executions: Pick<ProjectExecutionStore, 'get' | 'execute' | 'authorizeAcceptance' | 'acknowledge' | 'reject'>) => createApiServer({
  verifier: { verify: async token => { if (token !== 'valid') throw new Error('invalid'); return principal; } },
  memberships: { getTenantAccess: unavailable, listTenantAccess: unavailable },
  projects: { list: unavailable, get: unavailable, create: unavailable, update: unavailable, getPin: unavailable }, projectExecutions: executions,
});
const deps = { get: unavailable, execute: unavailable, authorizeAcceptance: unavailable, acknowledge: unavailable, reject: unavailable };

describe('durable execution HTTP boundary', () => {
  it('read-only status requires authentication and cannot dispatch inference', async () => {
    const get = vi.fn(async () => ({ execution: null })), execute = vi.fn(unavailable);
    const app = setup({ ...deps, get, execute });
    try {
      expect((await app.inject(prefix)).statusCode).toBe(401);
      expect((await app.inject({ url: prefix, headers: { authorization: 'Bearer invalid' } })).statusCode).toBe(401);
      const result = await app.inject({ url: prefix, headers });
      expect(result.statusCode).toBe(200); expect(result.json()).toEqual({ execution: null });
      expect(result.headers['cache-control']).toBe('no-store'); expect(execute).not.toHaveBeenCalled();
      expect(get).toHaveBeenCalledExactlyOnceWith(principal, tenantId, projectId, workId);
    } finally { await app.close(); }
  });
  it('routes reserve, explicit accept, acknowledgement and reject to separate verified-principal operations', async () => {
    const execution: ProjectExecutionView = { id: attemptId, tenantId, workspaceId: tenantId, projectId, workId,
      resultId: attemptId, documentId: workId, actorId: tenantId, phase: 'unknown', reason: 'execution_outcome_unknown',
      input: { request: 'Captured request', revision: 3, snapshotHash: 'a'.repeat(64), snapshotText: 'exact source',
        target: { nodeId: 'native-thread', text: 'source', from: 0, to: 6 }, inputs: [] }, pendingOutputs: [] };
    const reply = async () => ({ execution });
    const execute = vi.fn(reply), authorizeAcceptance = vi.fn(reply), acknowledge = vi.fn(reply), reject = vi.fn(reply);
    const app = setup({ ...deps, execute, authorizeAcceptance, acknowledge, reject });
    try {
      const actions = [
        [prefix, { expectedRevision: 3 }, execute, [principal, tenantId, projectId, workId, { expectedRevision: 3 }]],
        [`${prefix}/${attemptId}/accept`, {}, authorizeAcceptance, [principal, tenantId, projectId, workId, attemptId, {}]],
        [`${prefix}/${attemptId}/ack`, { revision: 4, snapshotHash: 'a'.repeat(64) }, acknowledge,
          [principal, tenantId, projectId, workId, attemptId, { revision: 4, snapshotHash: 'a'.repeat(64) }]],
        [`${prefix}/${attemptId}/reject`, {}, reject, [principal, tenantId, projectId, workId, attemptId, {}]],
      ] as const;
      for (const [url, payload, spy, args] of actions) {
        const result = await app.inject({ method: 'POST', url, payload, headers });
        expect(result.statusCode).toBe(200); expect(result.json()).toEqual({ execution });
        expect(spy).toHaveBeenCalledExactlyOnceWith(...args);
      }
    } finally { await app.close(); }
  });
  it('rejects invalid identities, query transport and oversized execution bodies before dispatch', async () => {
    const execute = vi.fn(unavailable), get = vi.fn(unavailable), app = setup({ ...deps, get, execute });
    try {
      expect((await app.inject({ url: prefix.replace(workId, 'guess'), headers })).statusCode).toBe(400);
      expect((await app.inject({ url: `${prefix}?actorId=forged`, headers })).statusCode).toBe(400);
      expect((await app.inject({ method: 'POST', url: prefix, headers, payload: { text: 'a'.repeat(1100) } })).statusCode).toBe(413);
      expect(get).not.toHaveBeenCalled(); expect(execute).not.toHaveBeenCalled();
    } finally { await app.close(); }
  });
  it('returns safe current authority, source conflict and failure reasons without provider or database secrets', async () => {
    let error: Error = new TenantAccessDeniedError();
    const app = setup({ ...deps, execute: async () => { throw error; } });
    try {
      for (const [failure, status, body] of [[error, 403, 'forbidden'], [new ProjectError(409, 'source_conflict'), 409, 'source_conflict'],
        [new ProjectError(422, 'execution_unconnected'), 422, 'execution_unconnected'], [new Error('private provider prompt'), 503, 'service_unavailable']] as const) {
        error = failure;
        const result = await app.inject({ method: 'POST', url: prefix, payload: { expectedRevision: 3 }, headers });
        expect(result.statusCode).toBe(status); expect(result.json()).toEqual({ status: body });
      }
    } finally { await app.close(); }
  });
});
