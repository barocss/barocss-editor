import { isDeepStrictEqual } from 'node:util';
import { createHash, randomUUID } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import { TenantAccessDeniedError, type VerifiedPrincipal } from './membership-store.js';
import { ProjectError, ProjectStore, type ProjectExecutionContext, type ProjectRecord, type ProjectTarget } from './project-store.js';
import { captureExecutionTarget, expectedExecutionSnapshot, type ExecutionTarget } from './project-execution-native.js';
import { withTenant } from './tenant-store.js';

export interface ExecutionPin { id: string; documentId: string; revision: number; snapshotHash: string; snapshotText: string }
export interface LocalExecutionInput {
  attemptId: string; tenantId: string; workspaceId: string; projectId: string; workId: string; actorId: string;
  request: string; documentId: string; revision: number; snapshotHash: string; snapshotText: string;
  target: ExecutionTarget; inputs: ExecutionPin[];
}
export interface ExecutionProposal { replacement: string; reason: string; assumptions: string[] }
export interface ExecutionProvenance {
  kind: 'live-local-model'; adapterVersion: string; model: string; modelDigest: string; runtimeVersion: string;
  inputHash: string; responseHash: string; proposalHash: string; startedAt: string; completedAt: string;
  contextTokens: number; outputTokenLimit: number; promptBytes: number;
  totalDurationNs?: number; promptEvalCount: number; evalCount: number;
}
export interface LocalExecutionAdapter {
  generate(input: LocalExecutionInput): Promise<{ proposal: ExecutionProposal; provenance: ExecutionProvenance }>;
}
export type ExecutionPhase = 'unknown' | 'proposal' | 'blocked' | 'failed' | 'accepted' | 'applied' | 'rejected' | 'unsupported';
export interface ProjectExecutionView {
  id: string; tenantId: string; workspaceId: string; projectId: string; workId: string; resultId: string;
  documentId: string; actorId: string; phase: ExecutionPhase; reason: string | null;
  binding?: { product: 'note'; operation: 'note.paragraph.replace/v1'; schema: 'barocss-note@1'; target: Extract<ProjectTarget, { kind: 'note-paragraph' }> };
  input: Pick<LocalExecutionInput, 'request' | 'revision' | 'snapshotHash' | 'snapshotText' | 'target' | 'inputs'>;
  proposal?: ExecutionProposal; provenance?: ExecutionProvenance;
  expectedSnapshotText?: string; expectedSnapshotHash?: string; appliedRevision?: number;
  pendingOutputs: Array<{ resultId: string; reason: 'unsupported_target'; inputs: ExecutionPin[] }>;
}
interface Attempt extends Omit<ProjectExecutionView, 'phase'> {
  phase: ExecutionPhase | 'started'; projectRevision: number; projectContextHash?: string; authorityEpoch: string; target: ProjectTarget;
}
interface AttemptRow { data: Attempt }
const hash = (text: string) => createHash('sha256').update(text).digest('hex');
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const sha = /^[a-f0-9]{64}$/;
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const id = (value: unknown) => { if (typeof value !== 'string' || !uuid.test(value)) throw new ProjectError(400, 'invalid_request'); };
const revision = (value: unknown) => { if (!Number.isSafeInteger(value) || (value as number) < 1) throw new ProjectError(400, 'invalid_revision'); };
function shape(value: unknown, keys: string[]): asserts value is Record<string, unknown> {
  if (!object(value) || Object.keys(value).length !== keys.length || keys.some(key => !Object.hasOwn(value, key)))
    throw new ProjectError(400, 'invalid_request');
}
const text = (value: unknown, max: number): value is string => typeof value === 'string' && !!value.trim()
  && value.length <= max && ![...value].some(char => char.charCodeAt(0) < 32 && !'\t\n\r'.includes(char));

/** Sort JSON object keys for PostgreSQL JSONB, preserving every relevant value and array order. */
function projectContextHash(record: ProjectRecord, workId: string): string {
  const stable = (value: unknown): unknown => Array.isArray(value) ? value.map(stable)
    : object(value) ? Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])])) : value;
  const relevant = Object.fromEntries(Object.entries(record).filter(([key]) => !['activities', 'drafts'].includes(key)));
  relevant.works = record.works.map(work => work.id === workId
    ? Object.fromEntries(Object.entries(work).filter(([key]) => !['state', 'reason'].includes(key))) : work);
  return hash(JSON.stringify(stable(relevant)));
}

/** Even an injected adapter is an untrusted producer. Its output cannot choose a native edit. */
export function validateExecutionResponse(input: LocalExecutionInput, value: unknown): { proposal: ExecutionProposal; provenance: ExecutionProvenance } {
  if (!object(value) || Object.keys(value).some(k => !['proposal', 'provenance'].includes(k))
    || !object(value.proposal) || !object(value.provenance)) throw new ProjectError(422, 'invalid_proposal');
  const p = value.proposal, v = value.provenance;
  if (Object.keys(p).length !== 3 || !text(p.replacement, 8000) || !text(p.reason, 4000)
    || !Array.isArray(p.assumptions) || p.assumptions.length > 20 || p.assumptions.some(s => !text(s, 1000)))
    throw new ProjectError(422, 'invalid_proposal');
  const proposal: ExecutionProposal = { replacement: p.replacement, reason: p.reason, assumptions: p.assumptions as string[] };
  const required = ['kind', 'adapterVersion', 'model', 'modelDigest', 'runtimeVersion', 'inputHash', 'responseHash', 'proposalHash', 'startedAt', 'completedAt'];
  if (Object.keys(v).some(k => ![...required, 'contextTokens', 'outputTokenLimit', 'promptBytes', 'totalDurationNs', 'promptEvalCount', 'evalCount'].includes(k))
    || required.some(k => !text(v[k], 300)) || v.kind !== 'live-local-model'
    || !sha.test(String(v.modelDigest)) || !sha.test(String(v.responseHash))
    || v.contextTokens !== 32768 || v.outputTokenLimit !== 4096
    || !Number.isSafeInteger(v.promptBytes) || (v.promptBytes as number) < 1 || (v.promptBytes as number) > 24576
    || !Number.isSafeInteger(v.promptEvalCount) || (v.promptEvalCount as number) < 1 || (v.promptEvalCount as number) > 24576
    || !Number.isSafeInteger(v.evalCount) || (v.evalCount as number) < 1 || (v.evalCount as number) > 4096
    || v.inputHash !== hash(JSON.stringify(input)) || v.proposalHash !== hash(JSON.stringify(proposal))
    || !Number.isFinite(Date.parse(String(v.startedAt))) || !Number.isFinite(Date.parse(String(v.completedAt)))
    || Date.parse(String(v.completedAt)) < Date.parse(String(v.startedAt))
    || ['totalDurationNs', 'promptEvalCount', 'evalCount'].some(k => v[k] !== undefined && (!Number.isSafeInteger(v[k]) || (v[k] as number) < 0)))
    throw new ProjectError(422, 'invalid_provenance');
  return { proposal, provenance: v as unknown as ExecutionProvenance };
}

/** Durable attempts have no scheduler and no retry loop. Native writes remain in DocumentStore. */
export class ProjectExecutionStore {
  private readonly projects: Pick<ProjectStore, 'withExecutionContext'>;
  constructor(private readonly pool: Pool, private readonly adapter: LocalExecutionAdapter | null = null,
    projects?: Pick<ProjectStore, 'withExecutionContext'>) { this.projects = projects ?? new ProjectStore(pool); }

  private work(context: ProjectExecutionContext, workId: string) {
    const work = context.project.data.works.find(item => item.id === workId);
    const comment = context.project.data.comments.find(item => item.id === work?.commentId);
    const result = context.project.data.results.find(item => item.id === comment?.resultId);
    if (!work || !comment || !result || comment.workId !== work.id || !work.outputs.includes(result.id))
      throw new ProjectError(404, 'work_not_found');
    return { work, comment, result };
  }
  private async find(context: ProjectExecutionContext, tenantId: string, workId: string, attemptId?: string) {
    const found = await context.client.query<AttemptRow>(`SELECT data FROM wonffice.project_executions
      WHERE tenant_id=$1 AND project_id=$2 AND work_id=$3${attemptId ? ' AND id=$4' : ''}`,
    attemptId ? [tenantId, context.project.id, workId, attemptId] : [tenantId, context.project.id, workId]);
    if (found.rows.length > 1) throw new Error('ambiguous_execution');
    return found.rows[0]?.data ?? null;
  }
  private view(attempt: Attempt): ProjectExecutionView {
    return { id: attempt.id, tenantId: attempt.tenantId, workspaceId: attempt.workspaceId, projectId: attempt.projectId,
      workId: attempt.workId, resultId: attempt.resultId, documentId: attempt.documentId, actorId: attempt.actorId,
      input: attempt.input, pendingOutputs: attempt.pendingOutputs,
      ...(attempt.target.kind === 'note-paragraph' ? { binding: { product: 'note' as const, operation: 'note.paragraph.replace/v1' as const, schema: 'barocss-note@1' as const, target: structuredClone(attempt.target) } } : {}),
      ...(attempt.proposal ? { proposal: attempt.proposal } : {}), ...(attempt.provenance ? { provenance: attempt.provenance } : {}),
      ...(attempt.expectedSnapshotText !== undefined ? { expectedSnapshotText: attempt.expectedSnapshotText, expectedSnapshotHash: attempt.expectedSnapshotHash } : {}),
      ...(attempt.appliedRevision !== undefined ? { appliedRevision: attempt.appliedRevision } : {}), phase: attempt.phase === 'started' ? 'unknown' : attempt.phase,
      reason: attempt.phase === 'started' ? 'execution_outcome_unknown' : attempt.reason };
  }
  private async inputs(context: ProjectExecutionContext, tenantId: string, workId: string) {
    const { work, comment, result } = this.work(context, workId);
    if (context.project.data.archived) throw new ProjectError(409, 'project_archived');
    if (work.state === 'paused') throw new ProjectError(409, 'work_paused');
    if (!['word', 'note'].includes(result.document.product) || comment.pin.document.product !== result.document.product || comment.pin.document.id !== result.document.id)
      throw new ProjectError(422, 'unsupported_target');
    const source = await context.document(result.document.id);
    if (source.product !== result.document.product || source.mode !== 'snapshot' || source.revision !== comment.pin.revision
      || source.snapshot_hash !== hash(comment.pin.text) || source.snapshot_text !== comment.pin.text)
      throw new ProjectError(409, 'source_conflict');
    const inputs: ExecutionPin[] = [];
    for (const pin of work.inputs) {
      const stored = await context.client.query<{ document_id: string; snapshot_revision: number; snapshot_hash: string; snapshot_text: string }>(
        `SELECT document_id,snapshot_revision,snapshot_hash,snapshot_text FROM wonffice.project_pins
          WHERE tenant_id=$1 AND project_id=$2 AND id=$3`, [tenantId, context.project.id, pin.id]);
      const row = stored.rows[0], current = await context.document(pin.document.id);
      if (!row || row.document_id !== pin.document.id || row.snapshot_revision !== pin.revision
        || row.snapshot_hash !== hash(pin.text) || row.snapshot_text !== pin.text || current.mode !== 'snapshot'
        || current.revision !== pin.revision || current.snapshot_hash !== row.snapshot_hash || current.snapshot_text !== pin.text)
        throw new ProjectError(409, 'source_conflict');
      inputs.push({ id: pin.id, documentId: pin.document.id, revision: pin.revision, snapshotHash: row.snapshot_hash, snapshotText: pin.text });
    }
    if (!inputs.some(pin => pin.id === comment.pin.id) || inputs.length > 20) throw new ProjectError(409, 'source_conflict');
    return { work, comment, result, source, inputs };
  }
  private sameProjectContext(context: ProjectExecutionContext, attempt: Attempt) {
    // Older attempts have no evidence for a semantic renewal: retain their strict revision gate.
    return attempt.projectContextHash === undefined ? context.project.revision === attempt.projectRevision
      : projectContextHash(context.project.data, attempt.workId) === attempt.projectContextHash;
  }
  private async current(context: ProjectExecutionContext, attempt: Attempt) {
    if (context.actor.id !== attempt.actorId || context.authorityEpoch !== attempt.authorityEpoch)
      throw new ProjectError(409, 'authority_changed');
    if (this.work(context, attempt.workId).work.state === 'paused') throw new ProjectError(409, 'work_paused');
    if (!this.sameProjectContext(context, attempt)) throw new ProjectError(409, 'project_conflict');
    const input = await this.inputs(context, attempt.tenantId, attempt.workId);
    if (input.work.request !== attempt.input.request || input.result.id !== attempt.resultId
      || input.source.revision !== attempt.input.revision || input.source.snapshot_hash !== attempt.input.snapshotHash
      || input.source.snapshot_text !== attempt.input.snapshotText || !isDeepStrictEqual(input.comment.target, attempt.target)
      || input.inputs.length !== attempt.input.inputs.length || input.inputs.some((pin, index) => {
        const held = attempt.input.inputs[index];
        return pin.id !== held.id || pin.documentId !== held.documentId || pin.revision !== held.revision
          || pin.snapshotHash !== held.snapshotHash || pin.snapshotText !== held.snapshotText;
      })) throw new ProjectError(409, 'source_conflict');
    captureExecutionTarget(input.source.snapshot_text, attempt.target);
  }
  private async save(context: ProjectExecutionContext, attempt: Attempt) {
    await context.client.query(`UPDATE wonffice.project_executions SET data=$4,updated_at=now()
      WHERE tenant_id=$1 AND project_id=$2 AND id=$3`, [attempt.tenantId, attempt.projectId, attempt.id, JSON.stringify(attempt)]);
    return { execution: this.view(attempt) };
  }
  /** Current follow-ups are observations, never additions to the captured model request. */
  private async pendingOutputs(context: ProjectExecutionContext, tenantId: string, workId: string, primaryResultId: string) {
    const { work } = this.work(context, workId);
    const outputs: ProjectExecutionView['pendingOutputs'] = [];
    for (const result of context.project.data.results) {
      if (result.id === primaryResultId || result.request !== workId || !work.outputs.includes(result.id)) continue;
      const inputs: ExecutionPin[] = [];
      for (const pin of result.inputs) {
        // Historical bytes remain evidence, but never grant current access to the original.
        await context.document(pin.document.id);
        const stored = await context.client.query<{ document_id: string; snapshot_revision: number; snapshot_hash: string; snapshot_text: string }>(
          `SELECT document_id,snapshot_revision,snapshot_hash,snapshot_text FROM wonffice.project_pins
            WHERE tenant_id=$1 AND project_id=$2 AND id=$3`, [tenantId, context.project.id, pin.id]);
        const row = stored.rows[0];
        if (!row || row.document_id !== pin.document.id || row.snapshot_revision !== pin.revision
          || row.snapshot_text !== pin.text || row.snapshot_hash !== hash(pin.text)) throw new ProjectError(409, 'source_conflict');
        inputs.push({ id: pin.id, documentId: row.document_id, revision: row.snapshot_revision,
          snapshotHash: row.snapshot_hash, snapshotText: row.snapshot_text });
      }
      outputs.push({ resultId: result.id, reason: 'unsupported_target', inputs });
    }
    return outputs;
  }
  async get(principal: VerifiedPrincipal, tenantId: string, projectId: string, workId: string) {
    id(workId);
    return this.projects.withExecutionContext(principal, tenantId, projectId, false, async context => {
      this.work(context, workId);
      const attempt = await this.find(context, tenantId, workId);
      return { execution: attempt ? { ...this.view(attempt),
        pendingOutputs: await this.pendingOutputs(context, tenantId, workId, attempt.resultId) } : null };
    });
  }
  async execute(principal: VerifiedPrincipal, tenantId: string, projectId: string, workId: string, body: unknown) {
    id(workId); shape(body, ['expectedRevision']); revision(body.expectedRevision);
    const claim = hash(randomUUID());
    const reserved = await this.projects.withExecutionContext(principal, tenantId, projectId, true, async context => {
      const old = await this.find(context, tenantId, workId);
      if (old) return { attempt: old, dispatch: false };
      if (context.project.revision !== body.expectedRevision) throw new ProjectError(409, 'revision_conflict');
      if (!this.adapter) throw new ProjectError(422, 'execution_unconnected');
      const captured = await this.inputs(context, tenantId, workId);
      let target: ExecutionTarget, unsupported = false;
      try { const held = captureExecutionTarget(captured.source.snapshot_text, captured.comment.target);
        target = { nodeId: held.nodeId, text: held.text, from: held.from, to: held.to }; }
      catch (error) {
        if (!(error instanceof ProjectError) || error.reason !== 'unsupported_target') throw error;
        unsupported = true; target = { nodeId: captured.comment.target.id, text: captured.comment.target.quote, from: 0, to: captured.comment.target.quote.length };
      }
      const attempt: Attempt = { id: randomUUID(), tenantId, workspaceId: context.project.workspace_id, projectId, workId,
        resultId: captured.result.id, documentId: captured.source.id, actorId: context.actor.id,
        phase: unsupported ? 'unsupported' : 'started', reason: unsupported ? 'unsupported_target' : null,
        projectRevision: context.project.revision, projectContextHash: projectContextHash(context.project.data, workId),
        authorityEpoch: context.authorityEpoch, target: structuredClone(captured.comment.target),
        input: { request: captured.work.request, revision: captured.source.revision, snapshotHash: captured.source.snapshot_hash,
          snapshotText: captured.source.snapshot_text, target, inputs: captured.inputs },
        pendingOutputs: await this.pendingOutputs(context, tenantId, workId, captured.result.id) };
      await context.client.query(`INSERT INTO wonffice.project_executions
        (tenant_id,project_id,work_id,result_id,document_id,id,actor_id,claim_hash,data) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [tenantId, projectId, workId, attempt.resultId, attempt.documentId, attempt.id, attempt.actorId, claim, JSON.stringify(attempt)]);
      return { attempt, dispatch: !unsupported };
    });
    if (!reserved.dispatch) return { execution: this.view(reserved.attempt) };
    const attempt = reserved.attempt;
    const input: LocalExecutionInput = { attemptId: attempt.id, tenantId, workspaceId: attempt.workspaceId, projectId, workId,
      actorId: attempt.actorId, request: attempt.input.request, documentId: attempt.documentId, revision: attempt.input.revision,
      snapshotHash: attempt.input.snapshotHash, snapshotText: attempt.input.snapshotText, target: attempt.input.target, inputs: attempt.input.inputs };
    let completion: Partial<Attempt>;
    try {
      const response = validateExecutionResponse(input, await this.adapter!.generate(input));
      const expectedSnapshotText = expectedExecutionSnapshot(input.snapshotText, attempt.target, response.proposal.replacement);
      completion = { phase: 'proposal', reason: null, ...response, expectedSnapshotText, expectedSnapshotHash: hash(expectedSnapshotText) };
    } catch (error) {
      const outcome = object(error) ? error.outcome : undefined;
      completion = { phase: error instanceof ProjectError || outcome === 'not_dispatched' || outcome === 'invalid_output' ? 'failed' : 'unknown',
        reason: error instanceof ProjectError ? error.reason : outcome === 'not_dispatched' ? 'adapter_unavailable'
          : outcome === 'invalid_output' ? 'invalid_proposal' : 'execution_outcome_unknown' };
    }
    const finish = async (client: PoolClient, result: Partial<Attempt>) => {
      await client.query('SELECT wonffice.complete_project_execution($1,$2,$3,$4,$5)',
        [tenantId, projectId, attempt.id, claim, JSON.stringify(result)]);
    };
    try {
      return await this.projects.withExecutionContext(principal, tenantId, projectId, true, async context => {
        try { await this.current(context, attempt); }
        catch (error) {
          if (!(error instanceof ProjectError)) throw error;
          if (completion.phase === 'proposal') completion = { ...completion, phase: 'blocked', reason: error.reason };
        }
        await finish(context.client, completion);
        return { execution: this.view({ ...attempt, ...completion }) };
      });
    } catch (error) {
      if (!(error instanceof TenantAccessDeniedError) && !(error instanceof ProjectError)) throw error;
      // Retain the outcome through the one-use server claim, but never return data to a revoked caller.
      await withTenant(this.pool, tenantId, client => finish(client, completion.phase === 'proposal'
        ? { ...completion, phase: 'blocked', reason: error instanceof ProjectError ? error.reason : 'authority_changed' }
        : completion));
      throw error;
    }
  }
  async authorizeAcceptance(principal: VerifiedPrincipal, tenantId: string, projectId: string, workId: string, attemptId: string, body: unknown) {
    id(workId); id(attemptId); shape(body, []);
    return this.projects.withExecutionContext(principal, tenantId, projectId, true, async context => {
      const attempt = await this.find(context, tenantId, workId, attemptId);
      if (!attempt) throw new ProjectError(404, 'not_found');
      const resumable = attempt.phase === 'blocked' && ['work_paused', 'project_conflict'].includes(attempt.reason ?? '');
      if ((!['proposal', 'accepted'].includes(attempt.phase) && !resumable) || !attempt.proposal)
        throw new ProjectError(409, 'execution_not_applicable');
      await this.current(context, attempt);
      const expected = expectedExecutionSnapshot(attempt.input.snapshotText, attempt.target, attempt.proposal.replacement);
      if (expected !== attempt.expectedSnapshotText || hash(expected) !== attempt.expectedSnapshotHash) throw new Error('execution_snapshot_mismatch');
      return attempt.phase === 'accepted' ? { execution: this.view(attempt) }
        : this.save(context, { ...attempt, phase: 'accepted', reason: null });
    });
  }
  async acknowledge(principal: VerifiedPrincipal, tenantId: string, projectId: string, workId: string, attemptId: string, body: unknown) {
    id(workId); id(attemptId); shape(body, ['revision', 'snapshotHash']); revision(body.revision);
    if (typeof body.snapshotHash !== 'string' || !sha.test(body.snapshotHash)) throw new ProjectError(400, 'invalid_request');
    return this.projects.withExecutionContext(principal, tenantId, projectId, true, async context => {
      const attempt = await this.find(context, tenantId, workId, attemptId);
      if (!attempt) throw new ProjectError(404, 'not_found');
      if (!['accepted', 'applied'].includes(attempt.phase)) throw new ProjectError(409, 'execution_not_accepted');
      if (context.actor.id !== attempt.actorId || context.authorityEpoch !== attempt.authorityEpoch) throw new ProjectError(409, 'authority_changed');
      const { work, result, comment } = this.work(context, workId);
      if (!isDeepStrictEqual(comment.target, attempt.target)) throw new ProjectError(409, 'target_conflict');
      if (work.state === 'paused') throw new ProjectError(409, 'work_paused');
      if (context.project.data.archived || !this.sameProjectContext(context, attempt)
        || work.request !== attempt.input.request || result.id !== attempt.resultId) throw new ProjectError(409, 'project_conflict');
      const current = await context.document(attempt.documentId);
      if (current.mode !== 'snapshot' || current.revision !== attempt.input.revision + 1 || current.revision !== body.revision
        || current.snapshot_hash !== attempt.expectedSnapshotHash || current.snapshot_hash !== body.snapshotHash
        || hash(current.snapshot_text) !== current.snapshot_hash || current.snapshot_text !== attempt.expectedSnapshotText)
        throw new ProjectError(409, 'output_conflict');
      // Other pinned inputs remain current; the edited original is the sole allowed revision change.
      for (const pin of attempt.input.inputs) {
        if (pin.documentId === attempt.documentId) continue;
        const source = await context.document(pin.documentId);
        if (source.mode !== 'snapshot' || source.revision !== pin.revision || source.snapshot_hash !== pin.snapshotHash
          || source.snapshot_text !== pin.snapshotText) throw new ProjectError(409, 'source_conflict');
      }
      return this.save(context, { ...attempt, phase: 'applied', reason: null, appliedRevision: current.revision });
    });
  }
  async reject(principal: VerifiedPrincipal, tenantId: string, projectId: string, workId: string, attemptId: string, body: unknown) {
    id(workId); id(attemptId); shape(body, []);
    return this.projects.withExecutionContext(principal, tenantId, projectId, true, async context => {
      const attempt = await this.find(context, tenantId, workId, attemptId);
      if (!attempt) throw new ProjectError(404, 'not_found');
      if (context.actor.id !== attempt.actorId) throw new ProjectError(403, 'forbidden');
      if (context.authorityEpoch !== attempt.authorityEpoch) throw new ProjectError(409, 'authority_changed');
      if (!['proposal', 'blocked'].includes(attempt.phase)) throw new ProjectError(409, 'execution_not_rejectable');
      return this.save(context, { ...attempt, phase: 'rejected', reason: 'rejected_by_human' });
    });
  }
}
