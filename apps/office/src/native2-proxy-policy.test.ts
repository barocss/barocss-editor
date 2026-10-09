import { describe, expect, it } from 'vitest';
import * as policy from './native2-proxy-policy';
import { createNative2ReadProxyPolicy, isAllowedNative2ReadRequest } from './native2-proxy-policy';

const tenant = '11111111-1111-4111-8111-111111111111';
const document = '22222222-2222-4222-8222-222222222222';
const root = `/api/v1/tenants/${tenant}/note-native2`;
const documentPath = `${root}/documents/${document}`;
const config = { authMode: 'oidc', flag: 'enabled', target: 'http://127.0.0.1:4101' };

describe('explicit Note native2 read proxy', () => {
  it('leaves the ordinary proxy map untouched when disabled', () => {
    expect(createNative2ReadProxyPolicy({ ...config, flag: undefined })).toEqual({});
    expect(createNative2ReadProxyPolicy({ ...config, flag: '' })).toEqual({});
  });

  it('accepts only an explicit OIDC mode and a root-only loopback target', () => {
    expect(() => createNative2ReadProxyPolicy({ ...config, authMode: undefined })).toThrow();
    expect(() => createNative2ReadProxyPolicy({ ...config, flag: 'true' })).toThrow();
    for (const target of [undefined, 'https://127.0.0.1:4101', 'http://other.test:4101',
      'http://user@127.0.0.1:4101', 'http://127.0.0.1:4101/private',
      'http://127.0.0.1:4101?x=1', 'http://127.0.0.1:0', 'http://127.0.0.1:65536']) {
      expect(() => createNative2ReadProxyPolicy({ ...config, target })).toThrow();
    }
    const entries = createNative2ReadProxyPolicy({ ...config, target: 'http://localhost:4101/' });
    const context = Object.keys(entries)[0];
    expect(context).toBeDefined();
    expect(new RegExp(context).test(documentPath)).toBe(true);
    expect(new RegExp(context).test(`${root}?unexpected=1`)).toBe(true);
    expect(new RegExp(context).test(`${root}%2Fdocuments/${document}`)).toBe(true);
    expect(entries[context]).toMatchObject({ target: 'http://localhost:4101', changeOrigin: false, ws: false });
    expect(entries[context].rewrite?.(documentPath)).toBe(documentPath.replace(/^\/api/, ''));
  });

  it('allows only raw bodyless GET document and exact bundle paths', () => {
    expect(isAllowedNative2ReadRequest(documentPath, 'GET', {})).toBe(true);
    expect(isAllowedNative2ReadRequest(`${documentPath}/schema-bundle`, 'GET', {})).toBe(true);
    for (const path of [root, `${root}?unexpected=1`, `${root}%2Fdocuments/${document}`,
      `${documentPath}?x=1`, `${documentPath}/receipts/key`, `${documentPath}/schema-bundle/extra`,
      `${root}/documents/NOT-A-UUID`, `${root}/registry/versions`]) {
      expect(isAllowedNative2ReadRequest(path, 'GET', {})).toBe(false);
    }
    for (const method of ['HEAD', 'OPTIONS', 'POST', 'PUT', 'DELETE']) {
      expect(isAllowedNative2ReadRequest(documentPath, method, {})).toBe(false);
    }
    for (const headers of [{ 'content-length': '0' }, { 'transfer-encoding': 'chunked' },
      { upgrade: 'websocket' }, { connection: 'keep-alive, Upgrade' }, { expect: '100-continue' }]) {
      expect(isAllowedNative2ReadRequest(documentPath, 'GET', headers)).toBe(false);
    }
  });
});

it('exposes an explicit mutation policy while the original read policy refuses writes', () => {
  expect(isAllowedNative2ReadRequest(`${documentPath}/snapshot`, 'PUT', {})).toBe(false);
  expect(Reflect.get(policy, 'createNative2MutationProxyPolicy')).toBeTypeOf('function');
});

const bodyHeaders = { 'content-type': 'application/json', 'content-length': '250' };
it('executes the original bounded bridge refusal of exact existing POST/PUT operations with valid JSON headers', () => {
  const entries = createNative2ReadProxyPolicy(config);
  const rule = Object.values(entries)[0];
  for (const [method, url] of [['POST', `${documentPath}/validation`], ['PUT', `${documentPath}/snapshot`]]) {
    expect(rule.bypass).toBeTypeOf('function');
    expect(isAllowedNative2ReadRequest(url, method, bodyHeaders)).toBe(false);
  }
});

describe('separately enabled native2 mutation policy', () => {
  it('retains disabled maps and requires explicit OIDC/root-only loopback enablement', () => {
    expect(policy.createNative2MutationProxyPolicy({ ...config, flag: undefined })).toEqual({});
    expect(policy.createNative2MutationProxyPolicy({ ...config, flag: '' })).toEqual({});
    for (const options of [{ ...config, flag: 'true' }, { ...config, authMode: 'demo' },
      { ...config, target: 'http://other.test:4101' }, { ...config, target: 'http://localhost:4101/private' }]) {
      expect(() => policy.createNative2MutationProxyPolicy(options)).toThrow();
    }
    const entries = policy.createNative2MutationProxyPolicy(config);
    expect(Object.keys(entries)).toHaveLength(1);
    expect(Object.keys(entries)).toEqual(Object.keys(createNative2ReadProxyPolicy(config)));
    expect(Object.values(entries)[0]).toMatchObject({ target: config.target, changeOrigin: false, ws: false });
  });

  it('permits only existing exact read/validation/snapshot/update receipt endpoints', () => {
    const allowed = policy.isAllowedNative2MutationRequest;
    expect(allowed(documentPath, 'GET', {})).toBe(true);
    expect(allowed(`${documentPath}/schema-bundle`, 'GET', {})).toBe(true);
    expect(allowed(`${documentPath}/validation`, 'POST', bodyHeaders)).toBe(true);
    expect(allowed(`${documentPath}/snapshot`, 'PUT', bodyHeaders)).toBe(true);
    expect(allowed(`${root}/receipts/update/fixed:503._-`, 'GET', {})).toBe(true);
    for (const path of [`${documentPath}/snapshot?extra=1`, `${documentPath}/%73napshot`, `${documentPath}/snapshot/extra`,
      `${root}/documents`, `${root}/registry/versions`, `${root}/receipts/create/key`, `${root}/receipts/update/%61`,
      `${root}/receipts/update/.`, `${root}/receipts/update/../key`, `${root}/receipts/update/key?x=1`,
      `http://foreign.test${documentPath}/snapshot`, documentPath.replace(tenant, 'NOT-A-UUID') + '/snapshot']) {
      for (const method of ['GET', 'PUT', 'POST']) expect(allowed(path, method, bodyHeaders)).toBe(false);
    }
    for (const method of ['GET', 'POST', 'DELETE', 'HEAD', 'OPTIONS']) expect(allowed(`${documentPath}/snapshot`, method, bodyHeaders)).toBe(false);
    expect(allowed(`${root}/receipts/update/key`, 'GET', { 'content-length': '0' })).toBe(false);
  });

  it('refuses unbounded or ambiguous JSON bodies and unsafe forwarding/upgrade headers', () => {
    for (const extra of [{ 'content-length': undefined }, { 'content-length': '0' }, { 'content-length': '1048577' },
      { 'content-length': '0250' }, { 'content-type': 'text/plain' },
      { 'transfer-encoding': 'chunked' }, { upgrade: 'websocket' }, { connection: 'keep-alive, Upgrade' },
      { expect: '100-continue' }, { cookie: 'session=untrusted' }, { 'x-http-method-override': 'DELETE' },
      { 'x-forwarded-host': 'foreign.test' }, { forwarded: 'host=foreign' }]) {
      expect(policy.isAllowedNative2MutationRequest(`${documentPath}/snapshot`, 'PUT', { ...bodyHeaders, ...extra })).toBe(false);
    }
    const ambiguous = { ...bodyHeaders };
    Object.defineProperty(ambiguous, 'content-length', { value: ['250', '250'] });
    expect(policy.isAllowedNative2MutationRequest(`${documentPath}/snapshot`, 'PUT', ambiguous)).toBe(false);
    const ambiguousAuthorization = { ...bodyHeaders };
    Object.defineProperty(ambiguousAuthorization, 'authorization', { value: ['one', 'two'] });
    expect(policy.isAllowedNative2MutationRequest(`${documentPath}/snapshot`, 'PUT', ambiguousAuthorization)).toBe(false);
    expect(policy.isAllowedNative2MutationRequest(`${documentPath}/snapshot`, 'PUT', {
      'content-type': 'application/json; charset=utf-8', 'content-length': '1048576' })).toBe(true);
  });
});
