import { captureExecutableCriterion, evaluateRenderedCriterion, CRITERION_EVALUATOR, getCriterionSpecimen, listCriterionSpecimens, compareCriterionContext, type CriterionContext, type CriterionSpecimen, type RenderedCriterionInput } from '../../../packages/office-word/src/criterion-confirmation';
import { contextShape, criterionHash, criterionRequest, type CriterionBasis, type CriterionRequest } from './criterion-confirmation-client';
import { ServerWordError } from './server-documents';

export interface VerificationBasis extends CriterionBasis {
  confirmationId: string | null;
  executable: ReturnType<typeof captureExecutableCriterion>;
  specimens: CriterionSpecimen[];
  evaluator: typeof CRITERION_EVALUATOR;
}
export interface VerificationRequest extends CriterionRequest {
  confirmationId: string; specimen: CriterionSpecimen; evaluator: typeof CRITERION_EVALUATOR;
}
export interface VerificationReceipt {
  schemaVersion: 1; runId: string; tenantId: string; documentId: string; requesterIdentityId: string;
  confirmationId: string; documentRevision: number; snapshotHash: string; context: CriterionContext;
  authorityEpoch: string; idempotencyKey: string; requestHash: string; specimen: CriterionSpecimen;
  evaluator: typeof CRITERION_EVALUATOR; outcome: 'passed' | 'failed' | 'unsupported' | 'error';
  startedAt: string; endedAt: string; outputText: string; outputHash: string;
}
export interface VerificationView { basis: VerificationBasis; runs: VerificationReceipt[]; pendingSpecimenIds?: string[] }
export interface CriterionVerificationHost {
  load(): Promise<VerificationView>;
  run(basis: VerificationBasis, specimen: CriterionSpecimen, current: () => boolean, fresh?: boolean): Promise<VerificationReceipt>;
}
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const uuid = (v: unknown): v is string => typeof v === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(v);
const sha = (v: unknown): v is string => typeof v === 'string' && /^[a-f0-9]{64}$/.test(v);
function normalized(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(normalized);
  if (!object(value)) return value;
  return Object.fromEntries(Object.keys(value).sort().map(key => [key, normalized(value[key])]));
}
const equal = (left: unknown, right: unknown) => JSON.stringify(normalized(left)) === JSON.stringify(normalized(right));
const invalid = (): never => { throw new ServerWordError(null, 'invalid_verification_response'); };
export function verificationRequest(basis: VerificationBasis, specimen: CriterionSpecimen, key: string = crypto.randomUUID()): VerificationRequest {
  if (!basis.confirmationId) return invalid();
  return { ...criterionRequest(basis, key), confirmationId: basis.confirmationId, specimen: structuredClone(specimen), evaluator: structuredClone(basis.evaluator) };
}
export function currentVerification(basis: VerificationBasis, run: VerificationReceipt, specimen: CriterionSpecimen) {
  return run.requesterIdentityId === basis.actorIdentityId && run.confirmationId === basis.confirmationId &&
    run.documentRevision === basis.documentRevision && run.snapshotHash === basis.snapshotHash &&
    run.authorityEpoch === basis.authorityEpoch && compareCriterionContext(basis.snapshotText, run.context) &&
    equal(run.specimen, specimen) && equal(run.evaluator, basis.evaluator);
}
export function createVerificationClient(fetcher: typeof fetch, tenantId: string, documentId: string) {
  if (!uuid(tenantId) || !uuid(documentId)) return invalid();
  const path = `/api/v1/tenants/${tenantId}/documents/${documentId}/criterion-verifications`;
  const send = async (suffix: string, body?: VerificationRequest): Promise<unknown> => {
    let response: Response;
    try { response = await fetcher(path + suffix, body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : undefined); }
    catch { throw new ServerWordError(null, 'verification_network_unknown'); }
    const value: unknown = await response.json().catch(() => invalid());
    if (!response.ok) throw new ServerWordError(response.status, object(value) && typeof value.status === 'string' ? value.status : 'verification_refused');
    return value;
  };
  const receipt = async (v: unknown): Promise<VerificationReceipt> => {
    if (!object(v) || Object.keys(v).length !== 19 || v.schemaVersion !== 1 || !uuid(v.runId) || v.tenantId !== tenantId || v.documentId !== documentId ||
      !uuid(v.requesterIdentityId) || !uuid(v.confirmationId) || !Number.isSafeInteger(v.documentRevision) || Number(v.documentRevision) < 1 ||
      !sha(v.snapshotHash) || !sha(v.requestHash) || typeof v.authorityEpoch !== 'string' || !v.authorityEpoch ||
      typeof v.idempotencyKey !== 'string' || !['passed', 'failed', 'unsupported', 'error'].includes(String(v.outcome)) ||
      typeof v.startedAt !== 'string' || typeof v.endedAt !== 'string' || !Number.isFinite(Date.parse(v.startedAt)) || !Number.isFinite(Date.parse(v.endedAt)) || Date.parse(v.endedAt) < Date.parse(v.startedAt) ||
      typeof v.outputText !== 'string' || !sha(v.outputHash) || await criterionHash(v.outputText) !== v.outputHash ||
      !object(v.specimen) || !equal(v.specimen, getCriterionSpecimen(String(v.specimen.id))) || !equal(v.evaluator, CRITERION_EVALUATOR) || !contextShape(v.context)) return invalid();
    let output: unknown;
    try { output = JSON.parse(v.outputText); } catch { return invalid(); }
    if (!object(output) || Object.keys(output).length !== (v.outcome === 'error' ? 22 : 21) || output.schemaVersion !== 1 || output.executionId !== v.runId || output.outcome !== v.outcome ||
      output.tenantId !== tenantId || output.documentId !== documentId || output.requesterIdentityId !== v.requesterIdentityId ||
      output.confirmationId !== v.confirmationId || output.documentRevision !== v.documentRevision || output.snapshotHash !== v.snapshotHash ||
      output.authorityEpoch !== v.authorityEpoch || output.requestHash !== v.requestHash || output.startedAt !== v.startedAt || output.endedAt !== v.endedAt ||
      !equal(output.context, v.context) || !equal(output.evaluator, v.evaluator) || !object(output.specimen) ||
      !equal(output.specimen, { ...v.specimen, sourceHash: await criterionHash(String(v.specimen.sourceText)) }) || !object(output.request)) return invalid();
    const request = output.request as unknown as VerificationRequest;
    if (Object.keys(request).length !== 10 || request.schemaVersion !== 1 || request.confirmationId !== v.confirmationId ||
      request.expectedRevision !== v.documentRevision || request.snapshotHash !== v.snapshotHash || request.authorityEpoch !== v.authorityEpoch ||
      request.idempotencyKey !== v.idempotencyKey || typeof request.snapshotText !== 'string' ||
      !compareCriterionContext(request.snapshotText, request.context) || !equal(request.context, v.context) ||
      await criterionHash(request.snapshotText) !== v.snapshotHash || !equal(request.specimen, v.specimen) || !equal(request.evaluator, v.evaluator) ||
      await criterionHash(JSON.stringify(['criterion-verification-v1', tenantId, documentId, v.requesterIdentityId, request])) !== v.requestHash) return invalid();
    const executable = captureExecutableCriterion(request.context);
    if (executable.status !== 'executable' || !equal(output.criterion, executable.criterion)) return invalid();
    if (v.outcome === 'error') {
      if (output.executor !== null || output.rendered !== null || output.evaluation !== null || typeof output.error !== 'string' || !output.error) return invalid();
    } else {
      if (!object(output.executor) || Object.keys(output.executor).length !== 3 || output.executor.id !== 'local-playwright-chromium' || output.executor.version !== 1 ||
        typeof output.executor.browserVersion !== 'string' || !output.executor.browserVersion || !object(output.rendered) ||
        Object.keys(output.rendered).length !== 9 || !Array.isArray(output.rendered.ancestorOpacities) || !output.rendered.ancestorOpacities.every(value => typeof value === 'string') ||
        typeof output.rendered.disabled !== 'boolean' || ['color', 'backgroundColor', 'opacity', 'backgroundImage', 'tagName', 'visibility', 'display'].some(key => typeof (output.rendered as Record<string, unknown>)[key] !== 'string')) return invalid();
      const evaluated = evaluateRenderedCriterion(executable.criterion, output.rendered as unknown as RenderedCriterionInput);
      if (evaluated.status !== v.outcome || !equal(evaluated, output.evaluation) || Object.hasOwn(output, 'error')) return invalid();
    }
    return structuredClone(v) as unknown as VerificationReceipt;
  };
  return {
    async context(): Promise<VerificationBasis> {
      const v = await send('/context');
      if (!object(v) || v.schemaVersion !== 1 || !Number.isSafeInteger(v.documentRevision) || Number(v.documentRevision) < 1 ||
        !sha(v.snapshotHash) || typeof v.snapshotText !== 'string' || typeof v.authorityEpoch !== 'string' || !uuid(v.actorIdentityId) ||
        !compareCriterionContext(v.snapshotText, v.context) || await criterionHash(v.snapshotText) !== v.snapshotHash ||
        !(v.confirmationId === null || uuid(v.confirmationId)) || !equal(v.specimens, listCriterionSpecimens()) || !equal(v.evaluator, CRITERION_EVALUATOR) ||
        !equal(v.executable, captureExecutableCriterion(v.context as CriterionContext))) return invalid();
      return structuredClone(v) as unknown as VerificationBasis;
    },
    async list(): Promise<VerificationReceipt[]> {
      const v = await send('');
      if (!object(v) || !Array.isArray(v.runs)) return invalid();
      return Promise.all(v.runs.map(receipt));
    },
    async run(attempt: VerificationRequest, actorIdentityId: string): Promise<VerificationReceipt> {
      if (!uuid(actorIdentityId) || Object.keys(attempt).length !== 10 || !uuid(attempt.confirmationId) ||
        !compareCriterionContext(attempt.snapshotText, attempt.context) || await criterionHash(attempt.snapshotText) !== attempt.snapshotHash ||
        !equal(attempt.specimen, getCriterionSpecimen(attempt.specimen.id)) || !equal(attempt.evaluator, CRITERION_EVALUATOR)) return invalid();
      const expectedHash = await criterionHash(JSON.stringify(['criterion-verification-v1', tenantId, documentId, actorIdentityId, attempt]));
      const v = await receipt(await send('', attempt));
      if (v.requesterIdentityId !== actorIdentityId || v.requestHash !== expectedHash || v.idempotencyKey !== attempt.idempotencyKey ||
        v.confirmationId !== attempt.confirmationId || v.documentRevision !== attempt.expectedRevision || v.snapshotHash !== attempt.snapshotHash ||
        v.authorityEpoch !== attempt.authorityEpoch || !compareCriterionContext(attempt.snapshotText, v.context) ||
        !equal(v.specimen, attempt.specimen) || !equal(v.evaluator, attempt.evaluator)) return invalid();
      return v;
    }
  };
}
