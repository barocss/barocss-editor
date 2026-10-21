import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { captureNative2ParagraphReview, type Native2ParagraphReviewWitness } from '@barocss/office-service/project-execution';
import { createNative2AgentProposal } from '../src/native2-agent-proposal.js';
import { decodeLocalAgentPromptContext, type LocalAgentInput } from '../src/local-agent.js';

// Independently authored whole source literals, loaded as data without application/editor construction.
const literal = readFileSync(new URL('../../note/src/native2-scenario-fixtures.ts', import.meta.url), 'utf8');
const start = literal.indexOf('{'), end = literal.indexOf('\n};', start);
const fixtures = JSON.parse(literal.slice(start, end + 2));
const raw = (value: unknown) => JSON.stringify(value, null, 2) + '\n';
const hash = (text: string) => createHash('sha256').update(text).digest('hex');
const id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const digest = '3a12a518a499223fc5be0a6b43589f5c2809275e59572c29a73e0506ff67a735';
const proposal = { replacement: 'Review replacement.', reason: 'Requested clarification.', assumptions: ['Controlled fixture.'] };
function input(name = 'SOURCE_A', index = 1): LocalAgentInput {
  const snapshotText = raw(fixtures[name]), text = JSON.stringify(fixtures[name].document.content[index]);
  return { attemptId: id, tenantId: id, workspaceId: id, projectId: id, workId: id, actorId: id,
    request: 'Review the whole paragraph.', documentId: id, revision: 3, snapshotText, snapshotHash: hash(snapshotText),
    target: { nodeId: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', text, from: 0, to: text.length }, inputs: [] };
}
function fixture(generate: () => Response | Promise<Response> = () => Response.json({ model: 'qwen3.6:27b-coding',
  done: true, done_reason: 'stop', response: JSON.stringify(proposal), prompt_eval_count: 1000, eval_count: 30 })) {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const transport: typeof fetch = async (url, init) => {
    calls.push({ url: String(url), init });
    if (String(url).endsWith('/api/tags')) return Response.json({ models: [{ name: 'qwen3.6:27b-coding', digest }] });
    if (String(url).endsWith('/api/version')) return Response.json({ version: '0.34.4' });
    if (String(url).endsWith('/api/show')) return Response.json({ model_info: { 'qwen35.context_length': 262144 }, thinking: { values: [false, true], default: true } });
    return generate();
  };
  return { calls, agent: createNative2AgentProposal({ OFFICE_LOCAL_AGENT_ENABLED: 'true' }, transport)! };
}
const witness = (value: LocalAgentInput, index = 1) => captureNative2ParagraphReview(value.snapshotText, index);
const restored = (value: Native2ParagraphReviewWitness) => JSON.parse(JSON.stringify(value)) as Native2ParagraphReviewWitness;
function reorder(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(reorder);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).reverse().map(([key, entry]) => [key, reorder(entry)]));
  return value;
}

describe('native2 review wrapper with controlled provider transport', () => {
  it('exposes only trusted review dispatch and preserves opt-in', () => {
    expect(createNative2AgentProposal({})).toBeNull();
    expect(createNative2AgentProposal({ OFFICE_LOCAL_AGENT_ENABLED: 'false' })).toBeNull();
    expect(() => createNative2AgentProposal({ OFFICE_LOCAL_AGENT_ENABLED: 'yes' })).toThrow('invalid_configuration');
    expect(Object.keys(fixture().agent)).toEqual(['generateNative2Review']);
  });
  it.each([['SOURCE_A', 1], ['SOURCE_B', 0]] as const)('preserves complete %s raw/bundle/paragraph and model DTO/provenance', async (name, index) => {
    const value = input(name, index), before = raw(value), w = witness(value, index), { agent, calls } = fixture();
    const result = await agent.generateNative2Review(value, w);
    const body = JSON.parse(calls[3].init!.body as string), marker = 'Authorized request and exact pinned sources:\n';
    const wire = body.prompt.slice(body.prompt.indexOf(marker) + marker.length);
    expect(JSON.parse(wire)).toEqual(value); expect(Object.keys(JSON.parse(wire))).toHaveLength(13);
    expect(w.snapshotHash).toBe(hash(value.snapshotText));
    expect(w.bundleHash).toBe(hash(JSON.stringify(['wonffice.note.paragraph.review.bundle.v1', fixtures[name].schemaBundle])));
    expect(w.witnessHash).toBe(hash(JSON.stringify(['wonffice.note.paragraph.review.witness.v1', fixtures[name].document.attributes.pageId, [index], value.target.text])));
    expect(JSON.parse(wire).snapshotText).toBe(raw(fixtures[name]));
    expect(JSON.parse(wire).target.text).toBe(JSON.stringify(fixtures[name].document.content[index]));
    expect(result.proposal).toEqual(proposal);
    expect(result.provenance).toMatchObject({ adapterVersion: '4-native2-review-v1', inputHash: hash(JSON.stringify(value)),
      proposalHash: hash(JSON.stringify(proposal)), modelDigest: digest, contextTokens: 32768, outputTokenLimit: 4096 });
    expect(body.options).toEqual({ num_ctx: 32768, num_predict: 4096 }); expect(body.tools).toBeUndefined();
    expect(calls.map(call => call.url)).toEqual(['http://127.0.0.1:11434/api/tags', 'http://127.0.0.1:11434/api/version',
      'http://127.0.0.1:11434/api/show', 'http://127.0.0.1:11434/api/generate']);
    expect(raw(value)).toBe(before); expect('apply' in result).toBe(false);
  });
  it('accepts JSON-restored and reordered records without losing own fields', async () => {
    const value = input(), { agent } = fixture();
    for (const w of [restored(witness(value)), reorder(restored(witness(value))) as Native2ParagraphReviewWitness]) {
      expect((await agent.generateNative2Review(value, w)).proposal).toEqual(proposal);
    }
  });
  it.each(['version', 'kind', 'pageId', 'paragraphIndex', 'nativePath', 'snapshotText', 'snapshotHash', 'schemaBundle',
    'bundleHash', 'paragraph', 'paragraphJSON', 'witnessHash', 'segments'])('refuses missing or individually changed %s before transport', async key => {
    const value = input(), original = restored(witness(value)), { agent, calls } = fixture();
    for (const mutation of ['missing', 'changed']) {
      const changed: Record<string, unknown> = { ...original };
      if (mutation === 'missing') delete changed[key]; else changed[key] = key === 'paragraphIndex' ? 0 : null;
      await expect(agent.generateNative2Review(value, changed as unknown as Native2ParagraphReviewWitness)).rejects.toMatchObject({ outcome: 'not_dispatched' });
    }
    expect(calls).toEqual([]);
  });
  it('refuses extra undefined, symbol, non-enumerable, accessor and nested fields and array reordering', async () => {
    const value = input(), w = restored(witness(value)), { agent, calls } = fixture();
    const variants = [{ ...w, extra: undefined }, { ...w, [Symbol('extra')]: true },
      Object.defineProperty({ ...w }, 'extra', { value: true }),
      Object.defineProperty({ ...w }, 'pageId', { get: () => w.pageId, enumerable: true }),
      { ...w, paragraph: { ...w.paragraph, extra: undefined } },
      { ...w, segments: [...w.segments].reverse() },
      { ...w, schemaBundle: { ...w.schemaBundle, definitions: [...w.schemaBundle.definitions].reverse() } }];
    for (const changed of variants) await expect(agent.generateNative2Review(value, changed as unknown as Native2ParagraphReviewWitness)).rejects.toMatchObject({
      outcome: 'not_dispatched', reason: 'native2_paragraph_review_witness_mismatch' });
    expect(calls).toEqual([]);
  });
  it('binds a supplied index without quote searching repeated equal paragraphs', async () => {
    const file = JSON.parse(raw(fixtures.SOURCE_A));file.document.content.splice(2, 0, structuredClone(file.document.content[1]));
    const value = input();value.snapshotText = raw(file);value.snapshotHash = hash(value.snapshotText);
    const first = witness(value), last = witness(value, 2), { agent, calls } = fixture();
    expect(first.paragraphJSON).toBe(last.paragraphJSON);expect(first.witnessHash).not.toBe(last.witnessHash);
    await expect(agent.generateNative2Review(value, { ...first, paragraphIndex: last.paragraphIndex })).rejects.toMatchObject({ reason: 'native2_paragraph_review_witness_mismatch' });
    expect(calls).toEqual([]);
    // A coherent alternate index is data-consistent. Only canonical stored-selector authority can decide which was requested.
    expect((await agent.generateNative2Review(value, last)).proposal).toEqual(proposal);
  });
  it('refuses different raw/hash/target and extra model input fields before transport', async () => {
    const value = input(), w = witness(value), { agent, calls } = fixture();
    for (const changed of [{ ...value, snapshotHash: 'f'.repeat(64) }, { ...value, snapshotText: value.snapshotText + ' ' },
      { ...value, target: { ...value.target, text: 'different' } }, { ...value, target: { ...value.target, from: 1 } },
      { ...value, target: { ...value.target, to: value.target.to - 1 } }, { ...value, mode: 'native2-review' }]) {
      await expect(agent.generateNative2Review(changed, w)).rejects.toMatchObject({ outcome: 'not_dispatched' });
    }
    expect(calls).toEqual([]);
  });
  it('uses the actual whole-source guard for missing/partial bundle, unsupported sibling and empty target', async () => {
    const value = input(), { agent, calls } = fixture();
    for (const mutate of [
      (file: typeof fixtures.SOURCE_A) => { delete file.schemaBundle; },
      (file: typeof fixtures.SOURCE_A) => { file.schemaBundle.definitions.pop(); },
      (file: typeof fixtures.SOURCE_A) => { file.document.content.push({ stype: 'mathBlock', content: [] }); },
      (file: typeof fixtures.SOURCE_A) => { file.document.content[1].content = []; },
      (file: typeof fixtures.SOURCE_A) => { file.document.content[1].content = [{ stype: 'pageReference', attributes: { pageId: id } }]; },
    ]) {
      const file = JSON.parse(raw(fixtures.SOURCE_A));mutate(file);
      const changed = { ...value, snapshotText: raw(file), snapshotHash: hash(raw(file)) };
      await expect(agent.generateNative2Review(changed, witness(value))).rejects.toMatchObject({ outcome: 'not_dispatched' });
    }
    expect(calls).toEqual([]);
  });
  it('preserves native raw and prompt bounds without cropping or inference', async () => {
    const value = input(), { agent, calls } = fixture();
    const large = JSON.parse(raw(fixtures.SOURCE_A));large.document.metadata.labels = ['x'.repeat(65536)];
    const changed = { ...value, snapshotText: raw(large), snapshotHash: hash(raw(large)) };
    await expect(agent.generateNative2Review(changed, witness(value))).rejects.toMatchObject({ reason: 'native2_paragraph_review_too_large' });
    const full = { ...value, snapshotText: value.snapshotText + ' '.repeat(24000) };full.snapshotHash = hash(full.snapshotText);
    await expect(agent.generateNative2Review(full, witness(full))).rejects.toMatchObject({ reason: 'context_limit' });
    expect(calls).toEqual([]);
  });
  it('keeps duplicate root pins lossless and provenance bound to the original thirteen-field input', async () => {
    const value = input();value.inputs = [{ id: 'cccccccc-cccc-cccc-cccc-cccccccccccc', documentId: value.documentId,
      revision: value.revision, snapshotHash: value.snapshotHash, snapshotText: value.snapshotText }];
    const { agent, calls } = fixture();const result = await agent.generateNative2Review(value, witness(value));
    const body = JSON.parse(calls[3].init!.body as string), marker = 'Authorized request and exact pinned sources:\n';
    const wire = body.prompt.slice(body.prompt.indexOf(marker) + marker.length);
    expect(decodeLocalAgentPromptContext(wire)).toBe(JSON.stringify(value));
    expect(result.provenance.inputHash).toBe(hash(JSON.stringify(value)));
  });
  it('freezes the dispatched context across a held response without claiming current server authority', async () => {
    let release!: (response: Response) => void;
    const held = new Promise<Response>(resolve => { release = resolve; });
    const { agent, calls } = fixture(() => held), value = input(), w = restored(witness(value));
    const original = JSON.stringify(value), pending = agent.generateNative2Review(value, w);
    while (!calls.some(call => call.url.endsWith('/api/generate'))) await new Promise(resolve => setTimeout(resolve, 0));
    value.request = 'Changed after dispatch';value.snapshotText = 'Changed after dispatch';value.target.text = 'Changed';
    Object.assign(w, { paragraphJSON: 'Changed', pageId: 'Changed' });
    release(Response.json({ model: 'qwen3.6:27b-coding', done: true, done_reason: 'stop', response: JSON.stringify(proposal),
      prompt_eval_count: 1000, eval_count: 30 }));
    const result = await pending, body = JSON.parse(calls[3].init!.body as string), marker = 'Authorized request and exact pinned sources:\n';
    expect(body.prompt.slice(body.prompt.indexOf(marker) + marker.length)).toBe(original);
    expect(result.provenance.inputHash).toBe(hash(original));
    // Source/actor retirement, cancellation and persistence require the canonical service/Integration checks.
    expect(calls.filter(call => call.url.endsWith('/api/generate'))).toHaveLength(1);
  });
  it('preserves malformed output refusal and unknown transport outcome without retries', async () => {
    for (const [generate, outcome] of [
      [() => Response.json({ model: 'qwen3.6:27b-coding', done: true, done_reason: 'stop', response: JSON.stringify({ ...proposal, applied: true }), prompt_eval_count: 1000, eval_count: 30 }), 'invalid_output'],
      [() => { throw new Error('lost'); }, 'unknown_result'],
    ] as const) {
      const { agent, calls } = fixture(generate);const value = input();
      await expect(agent.generateNative2Review(value, witness(value))).rejects.toMatchObject({ outcome });
      expect(calls.filter(call => call.url.endsWith('/api/generate'))).toHaveLength(1);
    }
  });
});
