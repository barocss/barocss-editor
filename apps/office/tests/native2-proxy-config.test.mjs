import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { loadConfigFromFile } from 'vite';

const directory = fileURLToPath(new URL('../', import.meta.url));
const configuration = fileURLToPath(new URL('../vite.config.ts', import.meta.url));
const keys = ['VITE_OFFICE_AUTH_MODE', 'VITE_OFFICE_NATIVE2_READ_BRIDGE',
  'VITE_OFFICE_NATIVE2_MUTATION_BRIDGE', 'SCHEMA_SERVER_PROXY_TARGET', 'OFFICE_API_PROXY_TARGET'];
const tenant = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const document = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const base = `/api/v1/tenants/${tenant}/note-native2`;
const jsonHeaders = { 'content-type': 'application/json', 'content-length': '2' };

async function configured(overrides, verify) {
  const saved = Object.fromEntries(keys.map(key => [key, process.env[key]]));
  const cwd = process.cwd();
  try {
    for (const key of keys) delete process.env[key];
    Object.assign(process.env, { VITE_OFFICE_AUTH_MODE: 'oidc',
      OFFICE_API_PROXY_TARGET: 'http://127.0.0.1:14101',
      SCHEMA_SERVER_PROXY_TARGET: 'http://127.0.0.1:14102', ...overrides });
    process.chdir(directory);
    const loaded = await loadConfigFromFile({ command: 'serve', mode: 'test' }, configuration);
    assert.ok(loaded);
    return await verify(loaded.config);
  } finally {
    process.chdir(cwd);
    for (const key of keys) {
      if (saved[key] === undefined) delete process.env[key]; else process.env[key] = saved[key];
    }
  }
}

function nativePolicy(config) {
  const entries = Object.entries(config.server.proxy).filter(([key]) => key.includes('note-native2'));
  assert.equal(entries.length, 1, 'Exactly one native2 prefix must precede the ordinary API proxy');
  assert.equal(Object.keys(config.server.proxy)[0], entries[0][0]);
  assert.equal(entries[0][1].target, 'http://127.0.0.1:14102');
  assert.equal(entries[0][1].ws, false);
  return entries[0][1];
}

test('read opt-in still denies mutation and unknown paths before ordinary API fallback', async () => {
  await configured({ VITE_OFFICE_NATIVE2_READ_BRIDGE: 'enabled' }, config => {
    const policy = nativePolicy(config);
    assert.equal(policy.bypass({ url: `${base}/documents/${document}`, method: 'GET', headers: {} }), undefined);
    assert.equal(policy.bypass({ url: `${base}/documents/${document}/snapshot`, method: 'PUT', headers: jsonHeaders }), false);
    assert.equal(policy.bypass({ url: `${base}/unknown`, method: 'GET', headers: {} }), false);
  });
});

test('explicit mutation opt-in selects the existing bounded policy instead of a second read map', async () => {
  await configured({ VITE_OFFICE_NATIVE2_READ_BRIDGE: 'enabled', VITE_OFFICE_NATIVE2_MUTATION_BRIDGE: 'enabled' }, config => {
    const policy = nativePolicy(config);
    assert.equal(policy.bypass({ url: `${base}/documents/${document}/validation`, method: 'POST', headers: jsonHeaders }), undefined);
    assert.equal(policy.bypass({ url: `${base}/documents/${document}/snapshot`, method: 'PUT', headers: jsonHeaders }), undefined);
    assert.equal(policy.bypass({ url: `${base}/receipts/update/original-key`, method: 'GET', headers: {} }), undefined);
    assert.equal(policy.bypass({ url: `${base}/documents`, method: 'POST', headers: jsonHeaders }), false);
    assert.equal(policy.bypass({ url: `${base}/documents/${document}/snapshot`, method: 'PUT', headers: { ...jsonHeaders, cookie: 'not-forwarded' } }), false);
    assert.ok(config.plugins.some(plugin => typeof plugin.configureServer === 'function'));
  });
});

test('invalid explicit mutation configuration refuses before a listener can open', async () => {
  for (const overrides of [
    { VITE_OFFICE_NATIVE2_MUTATION_BRIDGE: 'invalid' },
    { VITE_OFFICE_NATIVE2_MUTATION_BRIDGE: 'enabled', VITE_OFFICE_AUTH_MODE: 'local' },
    { VITE_OFFICE_NATIVE2_MUTATION_BRIDGE: 'enabled', SCHEMA_SERVER_PROXY_TARGET: 'https://example.invalid' },
  ]) {
    await assert.rejects(configured(overrides, () => undefined));
  }
});
