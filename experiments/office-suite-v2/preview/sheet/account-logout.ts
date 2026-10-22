import { SHEET_RELAY_ACCOUNT_LOGOUT_PATH, SHEET_RELAY_ACCOUNT_LIMITS,
  parseSheetRelayAccountLogoutRequest, parseSheetRelayAccountLogoutResponse } from '../../src/sheet-preview-protocol.ts';
import type { SheetRelayAccountLogoutRequest, SheetRelayAccountLogoutResponse } from '../../src/sheet-preview-protocol.ts';

const responseLimit = 1024;

/** Uses the caller's captured Office login. Local retirement remains the caller's responsibility. */
export async function endAccountLogin(capturedRequestFetch: typeof fetch): Promise<boolean> {
  const controller = new AbortController();
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  let responseBody: ReadableStream<Uint8Array> | null = null;
  const cancelBody = () => {
    try { void (reader ? reader.cancel() : responseBody?.cancel())?.catch(() => {}); }
    catch { /* A custom response cannot prevent local retirement. */ }
  };
  const aborted = new Promise<boolean>(resolve => {
    controller.signal.addEventListener('abort', () => {
      cancelBody();
      resolve(false);
    }, { once: true });
  });
  const timer = setTimeout(() => { controller.abort(); }, Math.min(SHEET_RELAY_ACCOUNT_LIMITS.authorizationMs, 5000));
  const perform = async (): Promise<boolean> => {
    try {
      const request: SheetRelayAccountLogoutRequest = parseSheetRelayAccountLogoutRequest({ protocolVersion: 1 });
      const response = await capturedRequestFetch(SHEET_RELAY_ACCOUNT_LOGOUT_PATH, {
        method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(request), credentials: 'same-origin', cache: 'no-store', redirect: 'error', signal: controller.signal,
      });
      responseBody = response.body;
      if (controller.signal.aborted || !response.ok || response.redirected || response.type === 'opaqueredirect' ||
          response.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase() !== 'application/json') return false;
      const declared = response.headers.get('content-length');
      if (declared !== null && (!/^\d+$/.test(declared) || Number(declared) > responseLimit)) return false;
      if (!responseBody) return false;
      reader = responseBody.getReader();
      const parts: Uint8Array[] = [];
      let size = 0;
      for (;;) {
        const part = await reader.read();
        if (controller.signal.aborted) return false;
        if (part.done) break;
        size += part.value.byteLength;
        if (size > responseLimit) return false;
        parts.push(part.value);
      }
      const bytes = new Uint8Array(size);
      let offset = 0;
      for (const part of parts) { bytes.set(part, offset); offset += part.length; }
      const decoded: unknown = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
      const result: SheetRelayAccountLogoutResponse = parseSheetRelayAccountLogoutResponse(decoded);
      return !controller.signal.aborted && result.status === 'logged-out';
    } catch { return false; }
    finally {
      cancelBody();
      if (reader) {
        try { reader.releaseLock(); } catch { /* Cancellation can retire a pending read. */ }
      }
    }
  };
  try { return await Promise.race([perform(), aborted]); }
  finally { clearTimeout(timer); controller.abort(); }
}
