import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { validateExecutionResponse, type LocalExecutionInput } from '../src/project-execution.js';
const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const input: LocalExecutionInput = { attemptId: 'attempt', tenantId: 'tenant', workspaceId: 'workspace', projectId: 'project',
  workId: 'work', actorId: 'verified', request: '실제 요청', documentId: 'doc', revision: 2, snapshotHash: 'a'.repeat(64),
  snapshotText: '{"actual":"unmodified input"}', target: { nodeId: 'native-thread', text: '원문', from: 0, to: 2 }, inputs: [] };
const response = () => {
  const proposal = { replacement: '변경 제안', reason: '명시한 요청을 반영', assumptions: ['본문의 다른 영역은 보존'] };
  return { proposal, provenance: { kind: 'live-local-model', adapterVersion: '2', model: 'synthetic-fixture', modelDigest: 'b'.repeat(64),
    runtimeVersion: 'synthetic', inputHash: hash(input), responseHash: 'c'.repeat(64), proposalHash: hash(proposal),
    startedAt: '2026-10-03T00:00:00Z', completedAt: '2026-10-03T00:00:01Z', contextTokens: 32768,
    outputTokenLimit: 4096, promptBytes: 2000, promptEvalCount: 500, evalCount: 100 } };
};
describe('untrusted execution response validation', () => {
  it('preserves literal proposal and hashes of the exact captured input', () => {
    const value = response(); expect(validateExecutionResponse(input, value)).toEqual(value);
    expect(() => validateExecutionResponse({ ...input, request: '다른 요청' }, value)).toThrow('invalid_provenance');
  });
  it.each(['empty-replacement', 'extra-model-write', 'bad-proposal-hash', 'bad-input-hash', 'fake-kind', 'missing-context', 'over-context', 'truncated-output', 'impossible-time'])(
    'refuses %s without adapting observed native output', mode => {
      const value = response();
      if (mode === 'empty-replacement') value.proposal.replacement = '';
      if (mode === 'extra-model-write') Object.assign(value.proposal, { nativeDocument: {} });
      if (mode === 'bad-proposal-hash') value.proposal.replacement = 'Changed after capture';
      if (mode === 'bad-input-hash') value.provenance.inputHash = '0'.repeat(64);
      if (mode === 'fake-kind') value.provenance.kind = 'fixture';
      if (mode === 'missing-context') Reflect.deleteProperty(value.provenance, 'contextTokens');
      if (mode === 'over-context') value.provenance.promptBytes = 24577;
      if (mode === 'truncated-output') value.provenance.evalCount = 4097;
      if (mode === 'impossible-time') value.provenance.completedAt = '2025-10-03T00:00:00Z';
      expect(() => validateExecutionResponse(input, value)).toThrow();
    });
});
