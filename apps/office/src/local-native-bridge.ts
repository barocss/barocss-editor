import type { ProductNavigationGuard } from '@barocss/shared';

const frameQuery = '__native_frame';
export interface LocalNativeConnection {
  isCurrent(): boolean;
  ready(guard: ProductNavigationGuard): Promise<boolean>;
  changed(guard: ProductNavigationGuard): void;
  error(error: unknown): void;
  navigate(url: string): Promise<boolean>;
}
export interface LocalNativeChild {
  /** Includes the native header's feedback boundary and exact native guard. */
  prepare(guard: ProductNavigationGuard): Promise<boolean>;
  isPrepared(guard: ProductNavigationGuard): boolean;
}
export type LocalNativeFrameElement = HTMLIFrameElement & {
  __wonfficeNativeFrameFailure?: (child: Window, token: string, error: unknown) => void;
  __wonfficeNativeFrameConnect?: (child: Window, token: string, bridge: LocalNativeChild) => LocalNativeConnection | undefined;
};

/** Remove only the private lifecycle marker before using the unchanged route parser. */
export function localNativeFrameRoute(input: string): { url: string; token?: string } {
  const url = new URL(input, location.origin);
  const markers = url.searchParams.getAll(frameQuery);
  if (!markers.length) return { url: url.href };
  if (markers.length !== 1 || !/^[a-f\d-]{36}$/.test(markers[0])) throw new Error('Invalid native frame marker.');
  // Do not normalize other query bytes: the route parser must still reject bad UTF-8.
  const fields = url.search.slice(1).split('&');
  const marker = fields.find(field => field.split('=', 1)[0] === frameQuery);
  if (!marker || fields.filter(field => field.split('=', 1)[0] === frameQuery).length !== 1) throw new Error('Invalid native frame marker.');
  url.search = fields.filter(field => field !== marker).join('&');
  return { url: url.href, token: markers[0] };
}
export function localNativeFrameURL(input: string, token: string): string {
  const route = localNativeFrameRoute(input);
  if (route.token) throw new Error('Nested native frame route.');
  const url = new URL(route.url);
  if (url.origin !== location.origin) throw new Error('Foreign native frame route.');
  if (!/^[a-f\d-]{36}$/.test(token)) throw new Error('Invalid native frame marker.');
  url.search = `${url.search.slice(1)}${url.search ? '&' : ''}${frameQuery}=${token}`;
  return url.href;
}
export function connectLocalNativeChild(token: string, bridge: LocalNativeChild): LocalNativeConnection {
  const frame = window.frameElement as LocalNativeFrameElement | null;
  const connection = frame?.__wonfficeNativeFrameConnect?.(window, token, bridge);
  if (!connection?.isCurrent()) throw new Error('The native frame owner is unavailable.');
  return connection;
}

/** Native restore/render owners call this on an actual failure; no timeout infers failure. */
export function reportLocalNativeFrameFailure(error: unknown): boolean {
  let route: ReturnType<typeof localNativeFrameRoute>;
  try { route = localNativeFrameRoute(location.href); } catch { return false; }
  if (!route.token) return false;
  const frame = window.frameElement as LocalNativeFrameElement | null;
  if (!frame?.__wonfficeNativeFrameFailure) return false;
  frame.__wonfficeNativeFrameFailure(window, route.token, error);
  return true;
}
