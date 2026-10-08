import { describe, expect, it } from 'vitest';
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
