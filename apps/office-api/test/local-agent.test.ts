import { createHash } from 'node:crypto';
import { createServer, request, type Server } from 'node:http';
import { once } from 'node:events';
import { describe, expect, it } from 'vitest';
import { createLocalAgent, createLocalGenerationTransport, decodeLocalAgentPromptContext, LocalAgentError, type LocalAgentInput } from '../src/local-agent.js';

// Deterministic transport fixtures verify the adapter boundary, not live inference.
const digest = '3a12a518a499223fc5be0a6b43589f5c2809275e59572c29a73e0506ff67a735';
const hash = (text: string) => createHash('sha256').update(text).digest('hex');
const id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const native = JSON.stringify({ document: { stype: 'document', content: [{ stype: 'inline-text', text: 'Original' }] } });
const input = (): LocalAgentInput => ({ attemptId: id, tenantId: id, workspaceId: id, projectId: id,
  workId: id, actorId: id, request: '앱이 켜져 있을 때의 조치도 안내하고, 교육자료에도 반영해줘.',
  documentId: id, revision: 3, snapshotHash: hash(native), snapshotText: native,
  target: { nodeId: 'comment-1', text: 'Original', from: 0, to: 8 }, inputs: [] });
const proposal = { replacement: 'First close the running app.', reason: 'The requested running-app step was absent.', assumptions: ['Fictional beta installer.'] };
const duplicateRootPin = (value: LocalAgentInput) => ({ id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
  documentId: value.documentId, revision: value.revision, snapshotHash: value.snapshotHash, snapshotText: value.snapshotText });
const promptContext = (calls: Array<{ url: string; init?: RequestInit }>) => {
  const prompt = JSON.parse(calls.find(call => call.url.endsWith('/api/generate'))!.init!.body as string).prompt as string;
  return prompt.slice(prompt.indexOf('Authorized request and exact pinned sources:\n') +
    'Authorized request and exact pinned sources:\n'.length);
};
function fixture(generate: () => Response | Promise<Response> = () => Response.json({ model: 'qwen3.6:27b-coding',
  done: true, done_reason: 'stop', response: JSON.stringify(proposal), thinking: 'Do not expose this.', total_duration: 123,
  prompt_eval_count: 1000, eval_count: 30 })) {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const transport = (async (url, init) => {
    calls.push({ url: String(url), init });
    if (String(url).endsWith('/api/tags')) return Response.json({ models: [{ name: 'qwen3.6:27b-coding', digest }] });
    if (String(url).endsWith('/api/version')) return Response.json({ version: '0.34.4' });
    if (String(url).endsWith('/api/show')) return Response.json({ model_info: { 'qwen35.context_length': 262144 }, thinking: { values: [false, true], default: true } });
    return generate();
  }) as typeof fetch;
  return { calls, agent: createLocalAgent({ OFFICE_LOCAL_AGENT_ENABLED: 'true' }, transport)! };
}

describe('local Agent deterministic transport boundary', () => {
  it('sends one exact complete root snapshot for an identical pin and reconstructs original input bytes', async () => {
    const value = input();
    const completeNative = JSON.stringify({ format: 'barocss-word', version: 1, document: { stype: 'document',
      attributes: { locale: 'ko-KR' }, content: [{ stype: 'paragraph', attributes: { id: 'protected' },
        content: [{ stype: 'inline-text', text: '원문😀'.repeat(1600), marks: [{ type: 'bold' }] }] }] } });
    value.snapshotText = completeNative; value.snapshotHash = hash(completeNative);
    value.inputs = [duplicateRootPin(value)];
    const original = JSON.stringify(value);
    expect(Buffer.byteLength(original)).toBeGreaterThan(24576);
    const before = structuredClone(value);
    const { agent, calls } = fixture();
    const result = await agent.generate(value);
    const wire = promptContext(calls);
    expect(decodeLocalAgentPromptContext(wire)).toBe(original);
    expect(wire.split(JSON.stringify(completeNative)).length - 1).toBe(1);
    expect(JSON.parse(wire).input.inputs[0].snapshotText).toEqual({ $snapshotRef: 'root' });
    expect(result.provenance.inputHash).toBe(hash(original));
    expect(result.provenance.adapterVersion).toBe('4');
    expect(result.provenance.promptBytes).toBe(Buffer.byteLength(JSON.parse(calls[3].init!.body as string).prompt));
    expect(value).toEqual(before);
  });
  it('keeps other documents, versions and distinct valid content complete and rejects false root reuse', async () => {
    const value = input();
    const sameText = duplicateRootPin(value);
    const otherDocument = { ...sameText, id: 'cccccccc-cccc-cccc-cccc-cccccccccccc',
      documentId: 'dddddddd-dddd-dddd-dddd-dddddddddddd' };
    const otherVersion = { ...sameText, id: 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', revision: 4 };
    const otherText = `${native} different`;
    const otherHash = { ...sameText, id: 'ffffffff-ffff-ffff-ffff-ffffffffffff',
      snapshotText: otherText, snapshotHash: hash(otherText) };
    value.inputs = [sameText, otherDocument, otherVersion, otherHash];
    const { agent, calls } = fixture();
    await agent.generate(value);
    const wire = promptContext(calls);
    const pins = JSON.parse(wire).input.inputs;
    expect(pins.map((pin: { id: string }) => pin.id)).toEqual(value.inputs.map(pin => pin.id));
    expect(pins.map((pin: { snapshotText: unknown }) => pin.snapshotText)).toEqual([
      { $snapshotRef: 'root' }, native, native, otherText]);
    expect(decodeLocalAgentPromptContext(wire)).toBe(JSON.stringify(value));
    for (const changed of [
      { ...JSON.parse(wire), input: { ...JSON.parse(wire).input, snapshotText: null } },
      { ...JSON.parse(wire), input: { ...JSON.parse(wire).input, inputs: [{ ...pins[0], documentId: otherDocument.documentId }] } },
      { ...JSON.parse(wire), input: { ...JSON.parse(wire).input, inputs: [{ ...pins[0], snapshotHash: 'f'.repeat(64) }] } },
      { ...JSON.parse(wire), input: { ...JSON.parse(wire).input, inputs: [{ ...pins[0], snapshotText: { $snapshotRef: 'other' } }] } },
      { ...JSON.parse(wire), input: { ...JSON.parse(wire).input, inputs: [{ ...pins[0], snapshotText: { $snapshotRef: 'root', extra: true } }] } },
      { ...JSON.parse(wire), input: { ...JSON.parse(wire).input, inputs: [{ ...pins[0], snapshotText: undefined }] } },
      { ...JSON.parse(wire), input: { ...JSON.parse(wire).input, inputs: [{ ...pins[0], id: undefined }] } },
    ]) expect(() => decodeLocalAgentPromptContext(JSON.stringify(changed))).toThrow(LocalAgentError);
    const invalid = { ...value, inputs: [{ ...sameText, snapshotText: `${native} changed` }] };
    const separate = fixture();
    await expect(separate.agent.generate(invalid)).rejects.toMatchObject({ outcome: 'not_dispatched', reason: 'invalid_input' });
    expect(separate.calls).toEqual([]);
  });
  it('retains Unicode, exact property order and refusal for omitted or duplicated pin identity', async () => {
    const original = input(); original.snapshotText = `${native}\n😀\u2028`; original.snapshotHash = hash(original.snapshotText);
    const reordered = { inputs: [duplicateRootPin(original)], target: original.target,
      snapshotText: original.snapshotText, snapshotHash: original.snapshotHash, revision: original.revision,
      documentId: original.documentId, request: original.request, actorId: original.actorId,
      workId: original.workId, projectId: original.projectId, workspaceId: original.workspaceId,
      tenantId: original.tenantId, attemptId: original.attemptId };
    const { agent, calls } = fixture();
    await agent.generate(reordered);
    expect(decodeLocalAgentPromptContext(promptContext(calls))).toBe(JSON.stringify(reordered));
    for (const invalid of [{ ...original, inputs: [{ ...duplicateRootPin(original), id: undefined }] },
      { ...original, inputs: [duplicateRootPin(original), duplicateRootPin(original)] },
      { ...original, inputs: [{ ...duplicateRootPin(original), snapshotText: null }] }]) {
      const refusal = fixture();
      await expect(refusal.agent.generate(invalid as LocalAgentInput)).rejects.toMatchObject({ outcome: 'not_dispatched', reason: 'invalid_input' });
      expect(refusal.calls).toEqual([]);
    }
  });
  it('still refuses an encoded root and pin when the full prompt exceeds the unchanged bound', async () => {
    const value = input(); value.snapshotText = `${native}${' '.repeat(24500)}`;
    value.snapshotHash = hash(value.snapshotText); value.inputs = [duplicateRootPin(value)];
    const { agent, calls } = fixture();
    await expect(agent.generate(value)).rejects.toMatchObject({ outcome: 'not_dispatched', reason: 'context_limit' });
    expect(calls).toEqual([]);
  });
  it('requires explicit opt-in and never uses a caller-selected endpoint or model', async () => {
    expect(createLocalAgent({})).toBeNull();
    expect(() => createLocalAgent({ OFFICE_LOCAL_AGENT_ENABLED: 'yes' })).toThrow(LocalAgentError);
    const { agent, calls } = fixture();
    const result = await agent.generate(input());
    expect(calls.map(c => c.url)).toEqual(['http://127.0.0.1:11434/api/tags', 'http://127.0.0.1:11434/api/version',
      'http://127.0.0.1:11434/api/show', 'http://127.0.0.1:11434/api/generate']);
    const body = JSON.parse(calls[3].init!.body as string);
    expect(body.think).toBe(false); expect(body.model).toBe('qwen3.6:27b-coding'); expect(body.stream).toBe(false);
    expect(body.options).toEqual({ num_ctx: 32768, num_predict: 4096 }); expect(body.raw).toBe(true);
    expect(body.prompt).toContain(input().request); expect(body.prompt).toContain(native.replaceAll('"', '\\"'));
    expect(body.format.additionalProperties).toBe(false); expect(body.tools).toBeUndefined();
    expect(result.proposal).toEqual(proposal);
    expect(result.provenance).toMatchObject({ kind: 'live-local-model', modelDigest: digest, runtimeVersion: '0.34.4', totalDurationNs: 123,
      contextTokens: 32768, outputTokenLimit: 4096, promptBytes: Buffer.byteLength(body.prompt), promptEvalCount: 1000 });
    expect(JSON.stringify(result)).not.toContain('Do not expose this.');
  });
  it('rejects full prompt plus schema overhead above the byte budget before any provider request', async () => {
    const { agent, calls } = fixture();
    const value = input(); value.snapshotText = native + ' '.repeat(24500); value.snapshotHash = hash(value.snapshotText);
    expect(Buffer.byteLength(JSON.stringify(value))).toBeLessThan(262144);
    await expect(agent.generate(value)).rejects.toMatchObject({ outcome: 'not_dispatched', reason: 'context_limit' });
    expect(calls).toEqual([]);
  });
  it('rejects extra fields, mismatched source bytes and excessive context before transport', async () => {
    const { agent, calls } = fixture();
    for (const value of [{ ...input(), endpoint: 'https://external.invalid' }, { ...input(), snapshotHash: 'f'.repeat(64) },
      { ...input(), request: 'x'.repeat(8001) }, { ...input(), target: { ...input().target, from: 1 } },
      (() => { const text = 'x'.repeat(262144); return { ...input(), snapshotText: text, snapshotHash: hash(text) }; })()]) {
      await expect(agent.generate(value as LocalAgentInput)).rejects.toMatchObject({ outcome: 'not_dispatched' });
    }
    expect(calls).toEqual([]);
  });
  it('rejects missing or changed installed model rather than downloading it', async () => {
    let count = 0;
    const transport = (async () => { count++; return Response.json({ models: [{ name: 'qwen3.6:27b-coding', digest: 'f'.repeat(64) }] }); }) as typeof fetch;
    await expect(createLocalAgent({ OFFICE_LOCAL_AGENT_ENABLED: 'true' }, transport)!.generate(input()))
      .rejects.toMatchObject({ outcome: 'not_dispatched', reason: 'model_unavailable' });
    expect(count).toBe(1);
  });
  it('refuses metadata that cannot support the configured context before inference', async () => {
    const calls: string[] = [];
    const transport = (async url => {
      calls.push(String(url));
      if (String(url).endsWith('/api/tags')) return Response.json({ models: [{ name: 'qwen3.6:27b-coding', digest }] });
      if (String(url).endsWith('/api/version')) return Response.json({ version: '0.34.4' });
      return Response.json({ model_info: { 'qwen35.context_length': 4096 } });
    }) as typeof fetch;
    await expect(createLocalAgent({ OFFICE_LOCAL_AGENT_ENABLED: 'true' }, transport)!.generate(input()))
      .rejects.toMatchObject({ outcome: 'not_dispatched', reason: 'context_unavailable' });
    expect(calls.some(url => url.endsWith('/api/generate'))).toBe(false);
  });
  it('refuses a model that does not explicitly support disabling thinking before dispatch', async () => {
    for (const thinking of [undefined, { values: [true], default: true }]) {
      const calls: string[] = [];
      const transport = (async url => {
        calls.push(String(url));
        if (String(url).endsWith('/api/tags')) return Response.json({ models: [{ name: 'qwen3.6:27b-coding', digest }] });
        if (String(url).endsWith('/api/version')) return Response.json({ version: '0.34.4' });
        return Response.json({ model_info: { 'qwen35.context_length': 262144 }, thinking });
      }) as typeof fetch;
      await expect(createLocalAgent({ OFFICE_LOCAL_AGENT_ENABLED: 'true' }, transport)!.generate(input()))
        .rejects.toMatchObject({ outcome: 'not_dispatched', reason: 'thinking_unavailable' });
      expect(calls.some(url => url.endsWith('/api/generate'))).toBe(false);
    }
  });
  it('validates proposal shape independently and rejects extra or oversized output', async () => {
    for (const response of [JSON.stringify({ ...proposal, apply: true }), JSON.stringify({ ...proposal, replacement: 'x'.repeat(16001) }),
      JSON.stringify({ ...proposal, assumptions: ['ok', 1] }), 'not json']) {
      const { agent } = fixture(() => Response.json({ model: 'qwen3.6:27b-coding', done: true, done_reason: 'stop', response,
        prompt_eval_count: 1000, eval_count: 30 }));
      await expect(agent.generate(input())).rejects.toMatchObject({ outcome: 'invalid_output', reason: 'invalid_proposal' });
    }
  });
  it('rejects truncated or mismatched completed responses without claiming a proposal', async () => {
    for (const result of [{ model: 'different-model', done: true, done_reason: 'stop', response: JSON.stringify(proposal) },
      { model: 'qwen3.6:27b-coding', done: true, done_reason: 'length', response: JSON.stringify(proposal) }]) {
      const { agent, calls } = fixture(() => Response.json(result));
      await expect(agent.generate(input())).rejects.toMatchObject({ outcome: 'invalid_output', reason: 'incomplete_provider_response' });
      expect(calls.filter(call => call.url.endsWith('/api/generate'))).toHaveLength(1);
    }
  });
  it('binds provenance hashes to exact request bytes and parsed declared output', async () => {
    const response = JSON.stringify({ model: 'qwen3.6:27b-coding', done: true, done_reason: 'stop', response: JSON.stringify(proposal), prompt_eval_count: 1000, eval_count: 30 });
    const { agent } = fixture(() => new Response(response));
    const value = input();
    const { provenance } = await agent.generate(value);
    expect(provenance.inputHash).toBe(hash(JSON.stringify(value)));
    expect(provenance.responseHash).toBe(hash(response));
    expect(provenance.proposalHash).toBe(hash(JSON.stringify(proposal)));
    expect(Date.parse(provenance.completedAt)).toBeGreaterThanOrEqual(Date.parse(provenance.startedAt));
  });
  it('rejects missing, excessive or invalid reported token counts before accepting a proposal', async () => {
    for (const counts of [{}, { prompt_eval_count: 24577, eval_count: 30 }, { prompt_eval_count: 1000, eval_count: 4097 },
      { prompt_eval_count: 1.5, eval_count: 30 }, { prompt_eval_count: 0, eval_count: 30 }]) {
      const { agent } = fixture(() => Response.json({ model: 'qwen3.6:27b-coding', done: true, done_reason: 'stop', response: JSON.stringify(proposal), ...counts }));
      await expect(agent.generate(input())).rejects.toMatchObject({ outcome: 'invalid_output', reason: 'invalid_token_counts' });
    }
  });
  it('retains unknown outcome on transport loss, redirect, incomplete generation and oversized body without retry', async () => {
    for (const generate of [() => { throw new Error('private-provider-detail'); }, () => new Response('', { status: 302, headers: { location: 'https://external.invalid' } }),
      () => Response.json({ done: false }), () => new Response('x'.repeat(65537))]) {
      const { agent, calls } = fixture(generate);
      try { await agent.generate(input()); throw new Error('expected failure'); }
      catch (error) { expect(error).toBeInstanceOf(LocalAgentError); expect(error).toMatchObject({ outcome: 'unknown_result' }); expect(String(error)).not.toContain('private-provider-detail'); }
      expect(calls.filter(c => c.url.endsWith('/api/generate'))).toHaveLength(1);
      expect(calls.every(c => c.init?.redirect === 'error')).toBe(true);
    }
  });
});

// Real ephemeral loopback HTTP tests exercise transport timing, not model inference.
async function closeServer(server: Server) {
  server.closeAllConnections();
  await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
}
const generationUrl = 'http://127.0.0.1:11434/api/generate';
const generationInit: RequestInit = { method: 'POST', redirect: 'error', body: '{}' };
describe('local generation native HTTP transport', () => {
  it('waits for delayed headers within its complete-response deadline on the fixed route', async () => {
    let count = 0;
    const server = createServer((_req, res) => { count++; setTimeout(() => res.end('delayed complete response'), 60); });
    server.listen(0, '127.0.0.1'); await once(server, 'listening');
    const port = (server.address() as { port: number }).port;
    const transport = createLocalGenerationTransport((options, callback) => {
      expect(options).toMatchObject({ hostname: '127.0.0.1', port: 11434, path: '/api/generate', method: 'POST' });
      return request({ ...options, port }, callback);
    }, 500);
    try {
      const started = Date.now();
      const response = await transport(generationUrl, generationInit);
      expect(await response.text()).toBe('delayed complete response');
      expect(Date.now() - started).toBeGreaterThanOrEqual(50);
      expect(count).toBe(1);
    } finally { await closeServer(server); }
  });
  it('aborts delayed headers and stalled body at an absolute deadline without retry', async () => {
    for (const headersFirst of [false, true]) {
      let count = 0;
      const server = createServer((_req, res) => { count++; if (headersFirst) { res.writeHead(200); res.write('partial'); } });
      server.listen(0, '127.0.0.1'); await once(server, 'listening');
      const port = (server.address() as { port: number }).port;
      const transport = createLocalGenerationTransport((options, callback) => request({ ...options, port }, callback), 50);
      try { await expect(transport(generationUrl, generationInit)).rejects.toThrow(); expect(count).toBe(1); }
      finally { await closeServer(server); }
    }
  });
  it('honors caller abort while waiting for the complete response', async () => {
    let count = 0;
    const server = createServer(() => { count++; });
    server.listen(0, '127.0.0.1'); await once(server, 'listening');
    const port = (server.address() as { port: number }).port;
    const controller = new AbortController();
    const transport = createLocalGenerationTransport((options, callback) => request({ ...options, port }, callback), 500);
    try {
      const pending = transport(generationUrl, { ...generationInit, signal: controller.signal });
      setTimeout(() => controller.abort(), 40);
      await expect(pending).rejects.toThrow(); expect(count).toBe(1);
    } finally { await closeServer(server); }
  });
  it('caps bytes, never follows redirects and rejects other routes before dispatch', async () => {
    let count = 0;
    const server = createServer((_req, res) => { count++; if (count === 1) res.end('x'.repeat(65537));
      else { res.writeHead(302, { location: '/other' }); res.end(); } });
    server.listen(0, '127.0.0.1'); await once(server, 'listening');
    const port = (server.address() as { port: number }).port;
    const transport = createLocalGenerationTransport((options, callback) => request({ ...options, port }, callback), 500);
    try {
      await expect(transport(generationUrl, generationInit)).rejects.toThrow();
      expect((await transport(generationUrl, generationInit)).status).toBe(302);
      await expect(transport('http://external.invalid/api/generate', generationInit)).rejects.toThrow(); expect(count).toBe(2);
    } finally { await closeServer(server); }
  });
});
