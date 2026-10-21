import type { IncomingHttpHeaders } from 'node:http';
import type { ProxyOptions } from 'vite';

const uuid = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const readPath = new RegExp(`^/api/v1/tenants/${uuid}/note-native2/documents/${uuid}(?:/schema-bundle)?$`);

// Vite checks proxy contexts in insertion order. Match malformed suffixes here too,
// so they cannot fall through to the ordinary /api proxy.
const native2Context = '^/api/v1/tenants/[^/]*/note-native2';

function bodyless(headers: IncomingHttpHeaders): boolean {
  return headers['content-length'] === undefined && headers['transfer-encoding'] === undefined &&
    headers.upgrade === undefined && headers.expect === undefined &&
    !/(?:^|,)\s*upgrade\s*(?:,|$)/i.test(headers.connection ?? '');
}

export function isAllowedNative2ReadRequest(rawUrl: string | undefined, method: string | undefined,
  headers: IncomingHttpHeaders): boolean {
  if (method !== 'GET' || !rawUrl || !readPath.test(rawUrl)) return false;
  return bodyless(headers);
}

function loopbackTarget(value: string | undefined): string {
  const match = value?.match(/^http:\/\/(127\.0\.0\.1|localhost):([1-9][0-9]{0,4})\/?$/);
  if (!match || Number(match[2]) > 65535) throw new Error('SCHEMA_SERVER_PROXY_TARGET must be a loopback HTTP origin');
  return `http://${match[1]}:${match[2]}`;
}

/** Private, explicit read-only bridge. This proxy is routing, never an authority grant. */
export function createNative2ReadProxyPolicy({ authMode, flag, target }: {
  authMode: string | undefined; flag: string | undefined; target: string | undefined;
}): Record<string, ProxyOptions> {
  if (flag === undefined || flag === '') return {};
  if (flag !== 'enabled' || authMode !== 'oidc') throw new Error('VITE_OFFICE_NATIVE2_READ_BRIDGE requires OIDC and enabled');
  return {
    [native2Context]: {
      target: loopbackTarget(target), changeOrigin: false, ws: false,
      rewrite: path => path.replace(/^\/api(?=\/|$)/, ''),
      bypass: request => isAllowedNative2ReadRequest(request.url, request.method, request.headers) ? undefined : false,
    },
  };
}

const validationPath = new RegExp(`^/api/v1/tenants/${uuid}/note-native2/documents/${uuid}/validation$`);
const snapshotPath = new RegExp(`^/api/v1/tenants/${uuid}/note-native2/documents/${uuid}/snapshot$`);
const receiptPath = new RegExp(`^/api/v1/tenants/${uuid}/note-native2/receipts/update/[A-Za-z0-9][A-Za-z0-9._:-]{0,119}$`);

/** Only these existing service operations may cross the explicit mutation bridge. */
export function isAllowedNative2MutationRequest(rawUrl: string | undefined, method: string | undefined,
  headers: IncomingHttpHeaders): boolean {
  if (!rawUrl || headers.cookie !== undefined || headers['proxy-authorization'] !== undefined ||
    headers['x-http-method-override'] !== undefined || headers.forwarded !== undefined ||
    headers['x-forwarded-host'] !== undefined || Array.isArray(headers.authorization)) return false;
  if (isAllowedNative2ReadRequest(rawUrl, method, headers)) return true;
  if (method === 'GET' && receiptPath.test(rawUrl)) {
    return bodyless(headers);
  }
  if (!((method === 'POST' && validationPath.test(rawUrl)) || (method === 'PUT' && snapshotPath.test(rawUrl)))) return false;
  const size = headers['content-length'];
  return typeof size === 'string' && /^[1-9][0-9]{0,6}$/.test(size) && Number(size) <= 1048576 &&
    typeof headers['content-type'] === 'string' && /^application\/json(?:;\s*charset=utf-8)?$/i.test(headers['content-type']) &&
    headers['transfer-encoding'] === undefined && headers.upgrade === undefined && headers.expect === undefined &&
    !/(?:^|,)\s*upgrade\s*(?:,|$)/i.test(headers.connection ?? '');
}

/** Integration opts in separately; never combine two competing native2 prefix maps. */
export function createNative2MutationProxyPolicy({ authMode, flag, target }: {
  authMode: string | undefined; flag: string | undefined; target: string | undefined;
}): Record<string, ProxyOptions> {
  if (flag === undefined || flag === '') return {};
  if (flag !== 'enabled' || authMode !== 'oidc') throw new Error('VITE_OFFICE_NATIVE2_MUTATION_BRIDGE requires OIDC and enabled');
  return {
    [native2Context]: {
      target: loopbackTarget(target), changeOrigin: false, ws: false,
      rewrite: path => path.replace(/^\/api(?=\/|$)/, ''),
      bypass: request => isAllowedNative2MutationRequest(request.url, request.method, request.headers) ? undefined : false,
    },
  };
}
