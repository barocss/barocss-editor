import { useLayoutEffect, useRef, useState } from 'react';
import {
  captureProductNavigation, createNativeHostSlot, disposeNativeHostSlot, isNativeHostSlotActive,
  promoteProductNavigation, registerProductDocumentHost,
  type NativeHostSlot, type ProductNavigationGuard
} from '@barocss/shared';
import { Button, OfficeLocaleProvider, useOfficeLocale } from '@barocss/office-ui';
import { OfficeWorkspace, readProductDocument, parseWorkspaceRoute, formatWorkspaceRoute, type Product } from '@barocss/office-workspace';
import { WorkspaceFrame } from '../../../packages/office-workspace/src/workspace-frame';
import { workspaceReturnURL } from '../../../packages/office-workspace/src/catalog-origin';
import { resolveLocalEntry } from './local-entry';
import { localNativeFrameRoute, localNativeFrameURL, type LocalNativeChild, type LocalNativeFrameElement } from './local-native-bridge';

export interface LocalNativeTarget { product: Product; id: string; url: string; }
interface MountedFrame {
  element: LocalNativeFrameElement;
  target: LocalNativeTarget;
  slot?: NativeHostSlot;
  bridge?: LocalNativeChild;
  window?: Window;
  document?: Document;
  guard?: ProductNavigationGuard;
  unregister?: () => void;
  epoch: number;
  live: boolean;
  failed?: boolean;
  ready: Promise<void>;
  resolve(): void;
  reject(error: unknown): void;
}

interface NativeHistoryEntry { owner: string; index: number; }
interface NativeTraversal { entry: NativeHistoryEntry; epoch: number; }
interface NativeHistoryRestore extends NativeHistoryEntry { ready: Promise<boolean>; finish(restored: boolean): void; }
const historyKey = '__wonfficeNativeHistory';
function nativeHistoryEntry(state: unknown): NativeHistoryEntry | undefined {
  if (!state || typeof state !== 'object') return;
  const entry = (state as Record<string, unknown>)[historyKey];
  if (!entry || typeof entry !== 'object') return;
  const { owner, index } = entry as Partial<NativeHistoryEntry>;
  if (typeof owner === 'string' && typeof index === 'number' && Number.isSafeInteger(index) && index >= 0)
    return { owner, index };
}

/** Read only a real owned realm error's message. Opaque throws keep the generic reason. */
function nativeFrameError(error: unknown, child: Window): Error {
  let message: unknown;
  try {
    const realm = child as Window & typeof globalThis;
    if (error instanceof realm.DOMException)
      message = Object.getOwnPropertyDescriptor(realm.DOMException.prototype, 'message')?.get?.call(error);
    else if (error instanceof Error || error instanceof realm.Error) message = Object.getOwnPropertyDescriptor(error, 'message')?.value;
  } catch { /* A retired realm or an opaque accessor cannot supply a failure reason. */ }
  return new Error(typeof message === 'string' && message.trim() ? message : '자료를 열지 못했습니다.');
}

/** Same-origin frames isolate native module lifetimes. They are not a security boundary. */
export function LocalNativeFrame({ initial, onReturn }: { initial: LocalNativeTarget; onReturn?: (url: string) => void }) {
  const [nativeRoot] = useState(() => document.createElement('div'));
  const source = useRef<MountedFrame | undefined>(undefined);
  const staged = useRef<MountedFrame | undefined>(undefined);
  const live = useRef(false), transition = useRef<symbol | undefined>(undefined);
  const [problem, setProblem] = useState('');
  const [initialFailure, setInitialFailure] = useState(false);
  const navigateRef = useRef<(url: string, traversal?: NativeTraversal) => Promise<boolean>>(async () => false);
  const [historyOwner] = useState(() => nativeHistoryEntry(history.state) ?? { owner: crypto.randomUUID(), index: 0 });
  const historyIndex = useRef(historyOwner.index), historyEpoch = useRef(0);
  const pendingNavigation = useRef<Promise<boolean> | undefined>(undefined);
  const restoringHistory = useRef<NativeHistoryRestore | undefined>(undefined);
  const changingIdentity = useRef<symbol | undefined>(undefined);
  const writeHistory = (url: string, push = false) => {
    const index = historyIndex.current + (push ? 1 : 0);
    const state = history.state && typeof history.state === 'object' ? history.state : {};
    history[push ? 'pushState' : 'replaceState']({ ...state, [historyKey]: { owner: historyOwner.owner, index } }, '', url);
    historyIndex.current = index;
  };

  const restoreHistory = (): Promise<boolean> => {
    if (!live.current) return Promise.resolve(false);
    if (restoringHistory.current) return restoringHistory.current.ready;
    const cursor = nativeHistoryEntry(history.state);
    if (cursor?.owner !== historyOwner.owner) return Promise.resolve(false);
    if (cursor.index === historyIndex.current) return Promise.resolve(true);
    let finish!: (restored: boolean) => void;
    const ready = new Promise<boolean>(resolve => { finish = resolve; });
    restoringHistory.current = { owner: historyOwner.owner, index: historyIndex.current, ready, finish };
    // Return to the retained source entry. Do not overwrite the refused destination.
    history.go(historyIndex.current - cursor.index);
    return ready;
  };
  const retire = (frame: MountedFrame) => {
    if (!frame.live) return;
    frame.live = false; frame.epoch++;
    delete frame.element.__wonfficeNativeFrameConnect;
    delete frame.element.__wonfficeNativeFrameFailure;
    frame.reject(new Error('The mounted native frame retired.'));
    frame.unregister?.();
    if (frame.slot) disposeNativeHostSlot(frame.slot);
    frame.element.remove();
  };
  const mounted = (frame: MountedFrame) => live.current && frame.live && frame.element.isConnected &&
    (source.current === frame || staged.current === frame);
  const owns = (frame: MountedFrame) => {
    if (!mounted(frame)) return false;
    try { return !frame.document || frame.element.contentWindow === frame.window && frame.window?.document === frame.document; }
    catch { return false; }
  };
  const currentGuard = (frame: MountedFrame) => !frame.failed && owns(frame) && frame.guard?.isCurrent() === true;
  const validate = async (url: string, isCurrent: () => boolean): Promise<LocalNativeTarget | undefined> => {
    const requested = new URL(url, location.origin);
    if (requested.origin !== location.origin || localNativeFrameRoute(requested.href).token) throw new Error('Invalid workspace destination.');
    const entry = await resolveLocalEntry(requested.href);
    if (!isCurrent()) throw new Error('The workspace destination retired.');
    if (!entry.item || entry.item.kind !== 'document') return undefined;
    const workspace = new OfficeWorkspace(entry.route.workspaceId);
    const original = await workspace.require(entry.item.product, entry.item.id);
    if (!isCurrent()) throw new Error('The workspace destination retired.');
    await readProductDocument(entry.item.product, original.text);
    if (!isCurrent()) throw new Error('The workspace destination retired.');
    if ((await workspace.meta(`${entry.item.product}:${entry.item.id}`)).trashedAt !== null) throw new Error('휴지통에 있는 자료입니다. 자료함에서 복원하세요.');
    if (!isCurrent()) throw new Error('The workspace destination retired.');
    return { product: entry.item.product, id: entry.item.id, url: new URL(formatWorkspaceRoute(entry.route), location.origin).href };
  };
  const installProxy = (frame: MountedFrame, guard: ProductNavigationGuard) => {
    frame.guard = guard; const epoch = ++frame.epoch;
    const current = () => !frame.failed && owns(frame) && frame.epoch === epoch && frame.guard === guard && guard.isCurrent();
    const prepare = async () => current() && !!frame.bridge && await frame.bridge.prepare(guard) && current();
    const oldCleanup = frame.unregister;
    frame.unregister = registerProductDocumentHost({ product: guard.product, id: () => guard.id,
      identityEpoch: () => current() ? epoch : -1, beforeNavigate: prepare }, frame.slot);
    oldCleanup?.();
  };
  const mount = (target: LocalNativeTarget, isStage: boolean): MountedFrame => {
    const element = document.createElement('iframe') as LocalNativeFrameElement;
    const token = crypto.randomUUID();
    element.title = `${target.product} native editor`;
    element.dataset.localNativeFrame = isStage ? 'staged' : 'active';
    element.style.cssText = 'border:0;width:100%;height:100%;display:block;' + (isStage ? 'position:absolute;inset:0;visibility:hidden;pointer-events:none;' : '');
    // Initial originals remain inaccessible until the parent validates the final
    // child-ready owner against its current address and fresh stored original.
    element.inert = true;
    const startupURL = location.href;
    let readyAttempt: Promise<boolean> | undefined;
    let resolve!: () => void, reject!: (error: unknown) => void;
    const ready = new Promise<void>((yes, no) => { resolve = yes; reject = no; });
    // Initial startup may fail before anyone awaits it. Keep the rejection observed.
    void ready.catch(() => {});
    const frame: MountedFrame = { element, target, epoch: 0, live: true, ready, resolve, reject,
      ...(isStage ? { slot: createNativeHostSlot() } : {}) };
    const failure = (error: unknown) => {
      if (!mounted(frame)) return;
      frame.failed = true; frame.epoch++; element.inert = true; frame.unregister?.(); frame.reject(error);
      if (source.current === frame) { setProblem(error instanceof Error ? error.message : '자료를 열지 못했습니다.'); if (!frame.guard) setInitialFailure(true); }
    };
    element.addEventListener('load', () => {
      if (mounted(frame) && frame.document && !owns(frame)) failure(new Error('The native frame document changed.'));
    });
    element.__wonfficeNativeFrameFailure = (child, presentedToken, error) => {
      if (owns(frame) && element.contentWindow === child && presentedToken === token) failure(nativeFrameError(error, child));
    };
    element.__wonfficeNativeFrameConnect = (child, presentedToken, bridge) => {
      if (!owns(frame) || element.contentWindow !== child || presentedToken !== token || frame.bridge) return undefined;
      frame.bridge = bridge; frame.window = child; frame.document = child.document;
      // Epoch advances on native identities. The connection itself survives those changes.
      const connectionCurrent = () => !frame.failed && owns(frame) && element.contentWindow === child && frame.bridge === bridge;
      return {
        isCurrent: connectionCurrent,
        ready: guard => {
          if (!connectionCurrent() || frame.guard) return Promise.resolve(false);
          if (readyAttempt) return readyAttempt;
          readyAttempt = (async () => {
            const current = () => connectionCurrent() && !frame.guard && guard.isCurrent() &&
              (isStage || location.href === startupURL) && guard.product === target.product && guard.id === target.id;
            try {
              if (!current()) throw new Error('The native editor did not install the requested original.');
              // The child may have awaited restore/input work after its discovery
              // read. No parent host, recent marker or public route is installed
              // until those awaits finish and the original is freshly rechecked.
              const latest = await validate(isStage ? target.url : startupURL, current);
              if (!latest || latest.product !== guard.product || latest.id !== guard.id || !current())
                throw new Error('The initial native original changed.');
              frame.target = latest;
              if (source.current === frame && !frame.slot) writeHistory(latest.url);
              installProxy(frame, guard);
              if (source.current === frame && !frame.slot) element.inert = false;
              frame.resolve();
              return true;
            } catch (error) {
              if (owns(frame)) failure(error instanceof Error ? error : new Error('자료를 확인하지 못했습니다.'));
              return false;
            }
          })();
          return readyAttempt;
        },
        changed: guard => {
          if (!connectionCurrent() || !frame.guard || !guard.isCurrent() || guard.product !== target.product) return;
          if (frame.guard.isCurrent() && frame.guard.product === guard.product && frame.guard.id === guard.id) return;
          if (staged.current === frame) { staged.current = undefined; retire(frame); return; }
          if (staged.current) { const obsolete = staged.current; staged.current = undefined; retire(obsolete); }
          const identity = Symbol('native identity reconciliation');
          changingIdentity.current = identity;
          const parentEpoch = ++historyEpoch.current, sourceURL = frame.target.url;
          installProxy(frame, guard);
          const epoch = frame.epoch;
          const actualURL = localNativeFrameRoute(child.location.href).url;
          const ownIdentity = () => connectionCurrent() && source.current === frame && frame.epoch === epoch &&
            guard.isCurrent() && changingIdentity.current === identity && historyEpoch.current === parentEpoch;
          void (async () => {
            if (!await bridge.prepare(guard) || !ownIdentity()) throw new Error('새 원본을 저장하지 못했습니다. 현재 화면에서 저장을 다시 시도하세요.');
            const actual = await validate(actualURL, ownIdentity);
            if (!actual || actual.product !== guard.product || actual.id !== guard.id || !ownIdentity()) return;
            while (!await restoreHistory()) {
              if (!ownIdentity()) return;
              if (nativeHistoryEntry(history.state)?.owner !== historyOwner.owner) throw new Error('The retained source history entry changed.');
            }
            if (!ownIdentity()) return;
            // Native input remains available while the parent cursor returns. Deliver it last.
            if (!await bridge.prepare(guard) || !ownIdentity() || !bridge.isPrepared(guard)) throw new Error('새 원본을 저장하지 못했습니다. 현재 화면에서 저장을 다시 시도하세요.');
            const cursor = nativeHistoryEntry(history.state);
            if (cursor?.owner !== historyOwner.owner || cursor.index !== historyIndex.current || location.href !== sourceURL)
              throw new Error('The retained source history entry changed.');
            writeHistory(actual.url); frame.target = actual;
            window.dispatchEvent(new Event('wonffice:catalog-refresh'));
          })().catch(error => { if (ownIdentity()) setProblem(error instanceof Error ? error.message : '자료를 확인하지 못했습니다.'); })
            .finally(() => { if (changingIdentity.current === identity) changingIdentity.current = undefined; });

        },
        error: error => {
          if (!connectionCurrent()) return;
          failure(nativeFrameError(error, child));
        },
        navigate: url => connectionCurrent() && source.current === frame && currentGuard(frame) ? navigateRef.current(url) : Promise.resolve(false)
      };
    };
    if (isStage) staged.current = frame; else source.current = frame;
    nativeRoot.append(element);
    element.src = localNativeFrameURL(target.url, token);
    return frame;
  };

  const navigate = async (url: string, traversal?: NativeTraversal) => {
    const previous = source.current;
    if (!previous || !currentGuard(previous) || transition.current || changingIdentity.current || restoringHistory.current && !traversal) return false;
    const parentURL = location.href, epoch = historyEpoch.current;
    if (traversal && traversal.epoch !== epoch) return false;
    const owner = Symbol('local native transition'); transition.current = owner;
    const sourceGuard = captureProductNavigation(), childGuard = previous.guard;
    const current = () => live.current && historyEpoch.current === epoch && location.href === parentURL && transition.current === owner && source.current === previous &&
      currentGuard(previous) && previous.guard === childGuard && sourceGuard?.isCurrent() === true;
    let target: MountedFrame | undefined;
    setProblem('');
    try {
      const destination = await validate(url, current);
      if (!current()) return false;
      if (!destination) {
        if (!await sourceGuard!.prepare() || !current()) throw new Error('마지막 입력을 저장하지 못했습니다. 현재 화면을 유지합니다.');
        if (onReturn) onReturn(url); else location.assign(url);
        return true;
      }
      if (destination.product === childGuard?.product && destination.id === childGuard.id) {
        if (traversal) { historyIndex.current = traversal.entry.index; previous.target = destination; }
        return true;
      }
      target = mount(destination, true);
      await target.ready;
      const targetGuard = captureProductNavigation(target.slot);
      if (!current() || !targetGuard?.isCurrent() || !currentGuard(target)) throw new Error('The staged native original retired.');
      const targetCurrent = () => current() && targetGuard.isCurrent() && currentGuard(target!);
      const latest = await validate(destination.url, targetCurrent);
      if (!latest || latest.product !== targetGuard.product || latest.id !== targetGuard.id || !targetCurrent()) throw new Error('The staged native original retired.');
      // Finish catalog awaits first. The final source input/save boundary has no await after it.
      if (!await sourceGuard!.prepare() || !current()) throw new Error('마지막 입력을 저장하지 못했습니다. 현재 화면을 유지합니다.');
      if (!targetCurrent() || !previous.bridge?.isPrepared(childGuard!)) throw new Error('The prepared native owner changed.');
      const installed = promoteProductNavigation(sourceGuard!, targetGuard);
      if (!installed || !isNativeHostSlotActive(target.slot!) || !installed.isCurrent()) throw new Error('The native transition could not commit.');
      source.current = target; staged.current = undefined;
      target.element.dataset.localNativeFrame = 'active'; target.element.style.cssText = 'border:0;width:100%;height:100%;display:block;'; target.element.inert = false;
      if (traversal) historyIndex.current = traversal.entry.index;
      else writeHistory(destination.url, true);
      retire(previous); target = undefined;
      return true;
    } catch (error) {
      if (current()) setProblem(error instanceof Error ? error.message : '자료를 열지 못했습니다.');
      return false;
    } finally {
      if (target) { if (staged.current === target) staged.current = undefined; retire(target); }
      if (transition.current === owner) transition.current = undefined;
    }
  };
  navigateRef.current = (url, traversal) => {
    if (transition.current) return Promise.resolve(false);
    const task = navigate(url, traversal);
    pendingNavigation.current = task;
    void task.finally(() => { if (pendingNavigation.current === task) pendingNavigation.current = undefined; });
    return task;
  };
  useLayoutEffect(() => {
    live.current = true;
    const pop = (event: PopStateEvent) => {
      const entry = nativeHistoryEntry(event.state);
      // These entries identify a position only. validate() still resolves the real original.
      if (!entry || entry.owner !== historyOwner.owner) return;
      const restoration = restoringHistory.current;
      if (restoration) {
        restoringHistory.current = undefined;
        restoration.finish(restoration.index === entry.index);
        if (restoration.index === entry.index) return;
      }
      if (changingIdentity.current) { void restoreHistory(); return; }
      const epoch = ++historyEpoch.current, url = location.href;
      if (staged.current) { const obsolete = staged.current; staged.current = undefined; retire(obsolete); }
      const pending = pendingNavigation.current;
      void (async () => {
        if (pending) await pending;
        if (!live.current || historyEpoch.current !== epoch || location.href !== url) return;
        const opened = await navigateRef.current(url, { entry, epoch });
        if (opened || !live.current || historyEpoch.current !== epoch || location.href !== url) return;
        await restoreHistory();
      })();
    };
    window.addEventListener('popstate', pop);
    nativeRoot.style.cssText = 'height:100%;min-height:0;position:relative;';
    const frame = mount(initial, false);
    void frame.ready.catch(error => { if (owns(frame)) setProblem(error instanceof Error ? error.message : '자료를 열지 못했습니다.'); });
    return () => {
      live.current = false; historyEpoch.current++; transition.current = undefined;
      window.removeEventListener('popstate', pop);
      changingIdentity.current = undefined;
      restoringHistory.current?.finish(false); restoringHistory.current = undefined;
      if (staged.current) retire(staged.current);
      if (source.current) retire(source.current);
      source.current = undefined; staged.current = undefined;
    };
  }, []);
  const retryInitial = () => {
    const failed = source.current;
    if (!failed || !failed.failed || failed.guard || transition.current) return;
    retire(failed); source.current = undefined;
    setProblem(''); setInitialFailure(false);
    const next = mount(initial, false);
    void next.ready.catch(error => { if (owns(next)) { setProblem(error instanceof Error ? error.message : '자료를 열지 못했습니다.'); if (!next.guard) setInitialFailure(true); } });
  };
  const returnInitial = () => {
    const failed = source.current;
    if (!failed?.failed || failed.guard) return;
    const parsed = parseWorkspaceRoute(localNativeFrameRoute(initial.url).url);
    if ('error' in parsed || !parsed.route) return;
    const url = workspaceReturnURL(parsed.route.workspaceId, parsed.route.kind === 'item' ? parsed.route.projectId : undefined);
    if (onReturn) onReturn(url); else location.assign(url);
  };
  return <OfficeLocaleProvider><WorkspaceFrame nativeRoot={nativeRoot} expected={{ product: initial.product, id: initial.id }} navigate={url => navigateRef.current(url)} entryRecovery={initialFailure ? <InitialFrameFailure problem={problem} onRetry={retryInitial} onReturn={returnInitial} /> : undefined}>
    {!initialFailure && problem && <p role="alert">{problem}</p>}
  </WorkspaceFrame></OfficeLocaleProvider>;
}

function InitialFrameFailure({ problem, onRetry, onReturn }: { problem: string; onRetry(): void; onReturn(): void }) {
  const { t } = useOfficeLocale();
  return <div data-local-native-failure role="alert" style={{ position: 'absolute', inset: 0, zIndex: 10, padding: 32, background: 'var(--ou-ground)', color: 'var(--ou-ink)' }}>
    <p>{problem}</p><Button onClick={onRetry}>{t('workspace.tree.retry')}</Button><Button onClick={onReturn}>{t('workspace.tree.library')}</Button>
  </div>;
}
