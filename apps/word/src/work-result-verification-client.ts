import { readProjectRecord, type ProjectExecution } from '@barocss/shared';
import { compareCriterionContext } from '../../../packages/office-word/src/criterion-confirmation';
import { createCriterionClient, criterionHash, type CriterionReceipt } from './criterion-confirmation-client';
import { ServerWordError } from './server-documents';

// The service rejects any other evaluator. Keep this exact literal covered by a
// test against its registered server definition; do not load Node code in Word.
export const WORD_PRESERVATION_EVALUATOR = {
  id: 'word-paragraph-preserved', version: 1,
  definition: 'Only the exact authored requirement sentence "Preserve the linked decision paragraph exactly as pinned." declares this condition. Compare the complete uniquely bookmarked native decision paragraph with its confirmed pinned Word reference. Require the same business pair and resolved native context for a pass. Missing or ambiguous coverage never passes.'
} as const;

export interface WordWorkOption {
  projectId: string; projectTitle: string; workId: string; resultId: string; resultName: string;
  requesterIdentityId: string; attemptActorIdentityId: string | null;
  attemptId: string | null; phase: ProjectExecution['phase'] | 'not-run';
  reason: string | null; proposal: string | null; pinId: string; referenceText: string;
  inputRevision: number | null; inputHash: string | null; inputText: string | null;
  outputRevision: number | null; outputHash: string | null;
}
export interface WordWorkRequest {
  schemaVersion: 1; projectId: string; workId: string; attemptId: string; resultId: string;
  confirmationId: string; expectedOutputRevision: number; expectedOutputHash: string;
  authorityEpoch: string; idempotencyKey: string; evaluator: typeof WORD_PRESERVATION_EVALUATOR;
}
export interface WordWorkReceipt {
  schemaVersion: 1; runId: string; tenantId: string; documentId: string; requesterIdentityId: string;
  confirmationId: string; documentRevision: number; snapshotHash: string;
  context: CriterionReceipt['context']; authorityEpoch: string; idempotencyKey: string;
  requestHash: string; specimen: {
    kind: 'native-word-work-result'; projectId: string; workId: string; attemptId: string; resultId: string;
    inputRevision: number; inputHash: string; outputRevision: number; outputHash: string;
  }; evaluator: typeof WORD_PRESERVATION_EVALUATOR; outcome: 'passed' | 'failed' | 'unsupported' | 'error';
  startedAt: string; endedAt: string; outputText: string; outputHash: string;
}
export interface WordWorkCatalog {
  options: WordWorkOption[]; confirmations: CriterionReceipt[]; runs: WordWorkReceipt[];
}
export interface WordWorkView extends WordWorkCatalog {
  currentRevision: number; currentHash: string; currentText: string; pendingKeys: string[];
  currentActorIdentityId: string | null; currentAuthorityEpoch: string | null;
  currentCriterionContext: 'available' | 'unavailable';
}
export interface WordWorkHost {
  load(): Promise<WordWorkView>;
  run(option: WordWorkOption, confirmation: CriterionReceipt, intent: () => boolean, fresh: boolean): Promise<WordWorkReceipt>;
}

const uuid = (v: unknown): v is string => typeof v === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(v);
const sha = (v: unknown): v is string => typeof v === 'string' && /^[a-f0-9]{64}$/.test(v);
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const same = (a: unknown, b: unknown): boolean => {
  if (Array.isArray(a) || Array.isArray(b)) return Array.isArray(a) && Array.isArray(b) &&
    a.length === b.length && a.every((value, index) => same(value, b[index]));
  if (object(a) || object(b)) return object(a) && object(b) &&
    Object.keys(a).length === Object.keys(b).length && Object.keys(a).every(key => Object.hasOwn(b, key) && same(a[key], b[key]));
  return a === b;
};
const invalid = (reason: string): never => { throw new ServerWordError(null, reason); };
const keys = (v: Record<string, unknown>, names: string[]) => Object.keys(v).length === names.length && names.every(name => Object.hasOwn(v, name));
const positive = (v: unknown): v is number => Number.isSafeInteger(v) && Number(v) > 0;
const validNativeComparison = async (value: unknown, outcome: WordWorkReceipt['outcome']): Promise<boolean> => {
  if (outcome === 'error') return value === null;
  if (!object(value) || value.status !== outcome) return false;
  if (outcome === 'unsupported') return keys(value, ['status', 'reason']) && typeof value.reason === 'string' && !!value.reason;
  if (!keys(value, ['status', 'referenceParagraphText', 'resultParagraphText',
    'referenceParagraphHash', 'resultParagraphHash']) ||
    typeof value.referenceParagraphText !== 'string' || typeof value.resultParagraphText !== 'string' ||
    !sha(value.referenceParagraphHash) || !sha(value.resultParagraphHash)) return false;
  return await criterionHash(value.referenceParagraphText) === value.referenceParagraphHash &&
    await criterionHash(value.resultParagraphText) === value.resultParagraphHash &&
    (value.referenceParagraphText === value.resultParagraphText) === (outcome === 'passed');
};

/** Only the exact semantic refusal keeps an authenticated catalog visible. */
export async function readCurrentWorkAuthority(fetcher: typeof fetch, tenantId: string, documentId: string,
  revision: number, hash: string) {
  try {
    const basis = await createCriterionClient(fetcher, tenantId, documentId).context();
    if (basis.documentRevision !== revision || basis.snapshotHash !== hash)
      throw new ServerWordError(409, 'work_source_changed');
    return { kind: 'available' as const, actorIdentityId: basis.actorIdentityId, authorityEpoch: basis.authorityEpoch };
  } catch (error) {
    if (error instanceof ServerWordError && error.status === 409 && error.code === 'criterion_unavailable')
      return { kind: 'unavailable' as const, actorIdentityId: null, authorityEpoch: null };
    throw error;
  }
}

export function wordWorkRequest(option: WordWorkOption, confirmation: CriterionReceipt, idempotencyKey: string = crypto.randomUUID()): WordWorkRequest {
  if (!uuid(option.projectId) || !uuid(option.workId) || !uuid(option.resultId) || !uuid(option.attemptId) ||
    !positive(option.outputRevision) || !sha(option.outputHash) || !uuid(confirmation.confirmationId) ||
    confirmation.documentRevision !== option.inputRevision || confirmation.snapshotHash !== option.inputHash ||
    confirmation.actorIdentityId !== option.requesterIdentityId || !option.inputText ||
    !compareCriterionContext(option.inputText, confirmation.context) || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,119}$/.test(idempotencyKey))
    return invalid('work_confirmation_mismatch');
  return { schemaVersion: 1, projectId: option.projectId, workId: option.workId,
    attemptId: option.attemptId, resultId: option.resultId, confirmationId: confirmation.confirmationId,
    expectedOutputRevision: option.outputRevision, expectedOutputHash: option.outputHash,
    authorityEpoch: confirmation.authorityEpoch, idempotencyKey, evaluator: WORD_PRESERVATION_EVALUATOR };
}

export function wordWorkKey(option: WordWorkOption, confirmation: CriterionReceipt) {
  return [option.projectId, option.workId, option.attemptId, option.resultId, confirmation.confirmationId,
    option.outputRevision, option.outputHash].join(':');
}

export function matchingWorkConfirmations(option: WordWorkOption, confirmations: CriterionReceipt[]) {
  return confirmations.filter(one => one.actorIdentityId === option.requesterIdentityId &&
    one.documentRevision === option.inputRevision && one.snapshotHash === option.inputHash &&
    !!option.inputText && compareCriterionContext(option.inputText, one.context));
}

export function matchingWordWorkRun(option: WordWorkOption, confirmation: CriterionReceipt, run: WordWorkReceipt,
  currentRevision: number, currentHash: string) {
  const specimen = run.specimen;
  let output: Record<string, unknown> | null = null;
  try { const parsed: unknown = JSON.parse(run.outputText); if (object(parsed)) output = parsed; } catch { /* Invalid output is historical, never current. */ }
  return option.phase === 'applied' && specimen.projectId === option.projectId && specimen.workId === option.workId &&
    specimen.resultId === option.resultId && specimen.attemptId === option.attemptId &&
    specimen.inputRevision === option.inputRevision && specimen.inputHash === option.inputHash &&
    specimen.outputRevision === option.outputRevision && specimen.outputHash === option.outputHash &&
    run.confirmationId === confirmation.confirmationId && run.requesterIdentityId === option.requesterIdentityId &&
    run.authorityEpoch === confirmation.authorityEpoch && same(run.context, confirmation.context) &&
    output?.confirmationSnapshotHash === confirmation.snapshotHash && run.documentRevision === currentRevision &&
    run.snapshotHash === currentHash && run.documentRevision === option.outputRevision && run.snapshotHash === option.outputHash;
}

export function currentWordWorkRun(option: WordWorkOption, confirmation: CriterionReceipt, run: WordWorkReceipt,
  currentRevision: number, currentHash: string, currentActorIdentityId: string | null, currentAuthorityEpoch: string | null) {
  return matchingWordWorkRun(option, confirmation, run, currentRevision, currentHash) &&
    run.requesterIdentityId === currentActorIdentityId && run.authorityEpoch === currentAuthorityEpoch;
}

/** Decode the existing registered native receipt with an explicit document scope. */
export async function readWordWorkReceipt(value: unknown, { tenantId, documentId }: Readonly<{
  tenantId: string; documentId: string;
}>): Promise<WordWorkReceipt> {
  if (!uuid(tenantId) || !uuid(documentId)) return invalid('invalid_work_scope');
  if (!object(value) || !keys(value, ['schemaVersion','runId','tenantId','documentId','requesterIdentityId','confirmationId',
    'documentRevision','snapshotHash','context','authorityEpoch','idempotencyKey','requestHash','specimen','evaluator',
    'outcome','startedAt','endedAt','outputText','outputHash']) || value.schemaVersion !== 1 || !uuid(value.runId) ||
    value.tenantId !== tenantId || value.documentId !== documentId || !uuid(value.requesterIdentityId) ||
    !uuid(value.confirmationId) || !positive(value.documentRevision) || !sha(value.snapshotHash) ||
    typeof value.authorityEpoch !== 'string' || !value.authorityEpoch || typeof value.idempotencyKey !== 'string' ||
    !sha(value.requestHash) || !same(value.evaluator, WORD_PRESERVATION_EVALUATOR) ||
    !['passed','failed','unsupported','error'].includes(String(value.outcome)) ||
    typeof value.startedAt !== 'string' || !Number.isFinite(Date.parse(value.startedAt)) ||
    typeof value.endedAt !== 'string' || !Number.isFinite(Date.parse(value.endedAt)) ||
    typeof value.outputText !== 'string' || !sha(value.outputHash) ||
    await criterionHash(value.outputText) !== value.outputHash || !object(value.specimen)) return invalid('invalid_work_receipt');
  const specimen = value.specimen;
  if (!keys(specimen, ['kind','projectId','workId','attemptId','resultId','inputRevision','inputHash','outputRevision','outputHash']) ||
    specimen.kind !== 'native-word-work-result' ||
    ![specimen.projectId,specimen.workId,specimen.attemptId,specimen.resultId].every(uuid) ||
    !positive(specimen.inputRevision) || !sha(specimen.inputHash) || !positive(specimen.outputRevision) ||
    !sha(specimen.outputHash) || specimen.outputRevision !== value.documentRevision || specimen.outputHash !== value.snapshotHash)
    return invalid('invalid_work_receipt');
  let output: unknown;
  try { output = JSON.parse(value.outputText); } catch { return invalid('invalid_work_receipt'); }
  if (!object(output) || !keys(output, ['schemaVersion','executionId','tenantId','documentId','requestHash','request',
    'confirmationId','confirmationSnapshotHash','contextHash','requesterIdentityId','executor','startedAt',
    'endedAt','specimen','evaluator','comparison','outcome',...(value.outcome === 'error' ? ['error'] : [])]) ||
    !object(output.request) || !keys(output.request, ['schemaVersion','projectId','workId','attemptId','resultId',
      'confirmationId','expectedOutputRevision','expectedOutputHash','authorityEpoch','idempotencyKey','evaluator']) ||
    !object(output.executor) || keys(output.executor, ['id','version']) === false ||
    output.schemaVersion !== 1 || output.executionId !== value.runId || output.tenantId !== tenantId ||
    output.documentId !== documentId || output.requesterIdentityId !== value.requesterIdentityId ||
    output.confirmationId !== value.confirmationId || output.requestHash !== value.requestHash ||
    output.outcome !== value.outcome || output.startedAt !== value.startedAt || output.endedAt !== value.endedAt ||
    output.executor.id !== 'registered-local-native-evaluator' || output.executor.version !== 1 ||
    !same(output.specimen, specimen) || !same(output.evaluator, WORD_PRESERVATION_EVALUATOR) ||
    !sha(output.contextHash) || await criterionHash(JSON.stringify(value.context)) !== output.contextHash ||
    !sha(output.confirmationSnapshotHash) || !same(output.request.evaluator, WORD_PRESERVATION_EVALUATOR) ||
    output.request.confirmationId !== value.confirmationId || output.request.authorityEpoch !== value.authorityEpoch ||
    output.request.expectedOutputRevision !== value.documentRevision || output.request.expectedOutputHash !== value.snapshotHash ||
    output.request.idempotencyKey !== value.idempotencyKey ||
    output.request.schemaVersion !== 1 || output.request.projectId !== specimen.projectId ||
    output.request.workId !== specimen.workId || output.request.attemptId !== specimen.attemptId ||
    output.request.resultId !== specimen.resultId ||
    await criterionHash(JSON.stringify(['native-work-verification-v1',tenantId,documentId,value.requesterIdentityId,output.request])) !== value.requestHash ||
    !(await validNativeComparison(output.comparison, value.outcome as WordWorkReceipt['outcome'])) ||
    (value.outcome === 'error' ? typeof output.error !== 'string' : Object.hasOwn(output, 'error')))
    return invalid('invalid_work_receipt');
  return structuredClone(value) as unknown as WordWorkReceipt;
}

export function createWordWorkClient(fetcher: typeof fetch, tenantId: string, workspaceId: string, documentId: string) {
  if (!uuid(tenantId) || !uuid(workspaceId) || !uuid(documentId)) return invalid('invalid_work_scope');
  const projectBase = `/api/v1/tenants/${tenantId}/projects`;
  const runBase = `/api/v1/tenants/${tenantId}/documents/${documentId}/criterion-verifications`;
  const request = async (path: string, init?: RequestInit): Promise<unknown> => {
    let response: Response;
    try { response = await fetcher(path, init); }
    catch { throw new ServerWordError(null, 'work_verification_network_unknown'); }
    const value: unknown = await response.json().catch(() => invalid('invalid_work_response'));
    if (!response.ok) throw new ServerWordError(response.status, object(value) && typeof value.status === 'string' ? value.status : 'work_verification_refused');
    return value;
  };
  const readReceipt = (value: unknown) => readWordWorkReceipt(value, { tenantId, documentId });
  return {
    async load(): Promise<WordWorkCatalog> {
      const confirmations = await createCriterionClient(fetcher, tenantId, documentId).list();
      const options: WordWorkOption[] = [], seen = new Set<string>();
      let after: string | null = null, finished = false;
      for (let page = 0; page < 100; page++) {
        const value = await request(`${projectBase}?${new URLSearchParams({ workspaceId, ...(after ? { after } : {}) })}`);
        if (!object(value) || !keys(value, ['projects','nextCursor']) || !Array.isArray(value.projects) ||
          value.projects.length > 50 || !(value.nextCursor === null || uuid(value.nextCursor))) return invalid('invalid_project_catalog');
        for (const raw of value.projects) {
          if (!object(raw) || raw.tenantId !== tenantId || raw.workspaceId !== workspaceId || !object(raw.actor) ||
            raw.actor.kind !== 'human' || !uuid(raw.actor.id) || !object(raw.project) || !positive(raw.project.revision))
            return invalid('invalid_project_catalog');
          const record = readProjectRecord(raw.project.record);
          if (!uuid(record.id) || seen.has(record.id) || after && record.id <= after) return invalid('invalid_project_catalog');
          seen.add(record.id);
          for (const result of record.results.filter(one => one.document.product === 'word' && one.document.id === documentId)) {
            for (const work of record.works.filter(one => one.outputs.includes(result.id))) {
              const comment = record.comments.find(one => one.id === work.commentId && one.workId === work.id &&
                one.resultId === result.id && one.pin.document.product === 'word' && one.pin.document.id === documentId);
              if (!comment || !uuid(work.id) || !uuid(result.id) || !uuid(comment.pin.id)) continue;
              const rawExecution = await request(`${projectBase}/${record.id}/works/${work.id}/execution`);
              if (!object(rawExecution) || !keys(rawExecution, ['execution'])) return invalid('invalid_work_execution');
              const execution = rawExecution.execution;
              const input = object(execution) && object(execution.input) ? execution.input : null;
              if (execution !== null && (!object(execution) || !uuid(execution.id) || !uuid(execution.actorId) || execution.tenantId !== tenantId ||
                execution.workspaceId !== workspaceId || execution.projectId !== record.id || execution.workId !== work.id ||
                execution.resultId !== result.id || execution.documentId !== documentId || !input ||
                !positive(input.revision) || !sha(input.snapshotHash) ||
                typeof input.snapshotText !== 'string' ||
                await criterionHash(input.snapshotText) !== input.snapshotHash ||
                !Array.isArray(input.inputs) ||
                !input.inputs.some(pin => object(pin) && pin.id === comment.pin.id &&
                  pin.documentId === documentId && pin.revision === comment.pin.revision && pin.snapshotText === comment.pin.text &&
                  pin.snapshotHash === input.snapshotHash) ||
                !['unknown','proposal','blocked','failed','accepted','applied','rejected','unsupported'].includes(String(execution.phase))))
                return invalid('invalid_work_execution');
              const one = execution as ProjectExecution | null;
              if (one?.phase === 'applied' && (!positive(one.appliedRevision) || !sha(one.expectedSnapshotHash) ||
                typeof one.expectedSnapshotText !== 'string' || await criterionHash(one.expectedSnapshotText) !== one.expectedSnapshotHash ||
                one.appliedRevision !== one.input.revision + 1)) return invalid('invalid_work_execution');
              options.push({ projectId: record.id, projectTitle: record.title, workId: work.id, resultId: result.id,
                resultName: result.name, requesterIdentityId: String(raw.actor.id),
                attemptActorIdentityId: one?.actorId ?? null, attemptId: one?.id ?? null,
                phase: one?.phase ?? 'not-run', reason: one?.reason ?? null, proposal: one?.proposal?.replacement ?? null,
                pinId: comment.pin.id, referenceText: comment.pin.text,
                inputRevision: one?.input.revision ?? null, inputHash: one?.input.snapshotHash ?? null,
                inputText: one?.input.snapshotText ?? null, outputRevision: one?.appliedRevision ?? null,
                outputHash: one?.expectedSnapshotHash ?? null });
              if (options.length > 200) return invalid('work_catalog_too_large');
            }
          }
        }
        if (value.nextCursor === null) { finished = true; break; }
        if (value.projects.length === 0 || after && value.nextCursor <= after) return invalid('invalid_project_catalog');
        after = value.nextCursor;
      }
      if (!finished) return invalid('work_catalog_too_large');
      const rawRuns = await request(runBase);
      if (!object(rawRuns) || !keys(rawRuns, ['runs']) || !Array.isArray(rawRuns.runs)) return invalid('invalid_work_runs');
      const runs: WordWorkReceipt[] = [];
      for (const value of rawRuns.runs) {
        if (!object(value) || !object(value.specimen)) return invalid('invalid_work_runs');
        if (value.specimen.kind === 'native-word-work-result') runs.push(await readReceipt(value));
      }
      return { options, confirmations, runs };
    },
    async run(attempt: WordWorkRequest, actorIdentityId: string): Promise<WordWorkReceipt> {
      if (!uuid(actorIdentityId) || !keys(attempt as unknown as Record<string, unknown>,
        ['schemaVersion','projectId','workId','attemptId','resultId','confirmationId','expectedOutputRevision',
          'expectedOutputHash','authorityEpoch','idempotencyKey','evaluator']) ||
        !same(attempt.evaluator, WORD_PRESERVATION_EVALUATOR)) return invalid('invalid_work_request');
      const expectedHash = await criterionHash(JSON.stringify(['native-work-verification-v1',tenantId,documentId,actorIdentityId,attempt]));
      const receipt = await readReceipt(await request(`${runBase}/work-results`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(attempt) }));
      if (receipt.requestHash !== expectedHash || receipt.requesterIdentityId !== actorIdentityId ||
        receipt.idempotencyKey !== attempt.idempotencyKey || receipt.confirmationId !== attempt.confirmationId ||
        receipt.documentRevision !== attempt.expectedOutputRevision || receipt.snapshotHash !== attempt.expectedOutputHash ||
        receipt.specimen.projectId !== attempt.projectId || receipt.specimen.workId !== attempt.workId ||
        receipt.specimen.attemptId !== attempt.attemptId || receipt.specimen.resultId !== attempt.resultId)
        return invalid('invalid_work_acknowledgement');
      return receipt;
    }
  };
}
