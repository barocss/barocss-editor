import { documentLibrary } from '../document-library/document-library';
import { documentLocationWorkspace } from './document-location';

export interface ProductDocumentHost {
  product: 'note' | 'word' | 'slides' | 'site';
  id(): string;
  /** The product increments this lifetime when its document is replaced, including A → B → A. */
  identityEpoch?(): number;
  /** Resolve only after nested input and conditional storage writes settle. */
  beforeNavigate(): Promise<boolean>;
  /** Explicitly save an already-submitted local Word change without replacing its document. */
  saveCurrentSnapshot?(isCurrent: () => boolean): Promise<boolean>;
  /** Protect scoped private input for logout without retrying a failed server save. */
  beforeAccountExit?(): Promise<boolean>;
  /** Native server host owns preparation, authority checks and validated installation. */
  requestOpen?(documentId: string, isCurrent: () => boolean, intentCurrent?: () => boolean): Promise<ProductNavigationGuard | false>;
}
/** An isolated mounted target. Registration does not activate its commands or route. */
export interface NativeHostSlot { readonly token: symbol; }
interface Registration { host: ProductDocumentHost; slot?: SlotState; }
interface OpeningScope { opening?: { isCurrent: () => boolean }; }
interface SlotState extends OpeningScope {
  registration?: Registration;
  retired: boolean;
  disposed: boolean;
  onChange?: (guard: ProductNavigationGuard | undefined) => void;
}
let current: Registration | undefined;
let activeSlot: SlotState | undefined;
const defaultOpening: OpeningScope = {};
const slots = new WeakMap<NativeHostSlot, SlotState>();
const guards = new WeakMap<ProductNavigationGuard, { registration: Registration; slot?: SlotState }>();

export interface ProductReplacementPreparation {
  prepare(): Promise<boolean>;
  /** Recheck after the last native/catalog await, immediately before replacement. */
  isPrepared(): boolean;
}
let replacementPreparation: { capture: () => ProductReplacementPreparation } | undefined;
let replacementPreparationEpoch = 0;

/** A mounted integration can add its feedback boundary without changing native storage. */
export function registerProductReplacementPreparation(capture: () => ProductReplacementPreparation): () => void {
  const owner = { capture };
  replacementPreparation = owner;
  replacementPreparationEpoch++;
  return () => { if (replacementPreparation === owner) { replacementPreparation = undefined; replacementPreparationEpoch++; } };
}
export function captureProductReplacementPreparation(): ProductReplacementPreparation {
  const owner = replacementPreparation, epoch = replacementPreparationEpoch, witness = owner?.capture();
  let prepared = false;
  const current = () => replacementPreparation === owner && replacementPreparationEpoch === epoch;
  const isPrepared = () => prepared && current() && (!witness || witness.isPrepared());
  return {
    async prepare() {
      prepared = false;
      if (!current() || (witness && !await witness.prepare())) return false;
      prepared = current();
      return isPrepared();
    },
    isPrepared
  };
}

function slotState(slot: NativeHostSlot): SlotState {
  const state = slots.get(slot);
  if (!state) throw new Error('Unknown native host slot');
  return state;
}
function emitHostChange(): void {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event('wonffice:host-change'));
}
function retireActiveSlot(): void {
  if (activeSlot) activeSlot.retired = true;
  activeSlot = undefined;
}

/** Register only after the mounted target's actual native input delivery is ready. */
export function createNativeHostSlot(onChange?: SlotState['onChange']): NativeHostSlot {
  const slot = Object.freeze({ token: Symbol('native host slot') });
  slots.set(slot, { retired: false, disposed: false, onChange });
  return slot;
}
export function isNativeHostSlotActive(slot: NativeHostSlot): boolean {
  const state = slotState(slot);
  return !state.disposed && !state.retired && activeSlot === state;
}

export function registerProductDocumentHost(host: ProductDocumentHost, slot?: NativeHostSlot): () => void {
  const state = slot ? slotState(slot) : undefined;
  if (state?.disposed || state?.retired) throw new Error('Retired native host slot');
  const registration = { host, slot: state };
  if (state) {
    state.registration = registration;
    if (activeSlot === state) { current = registration; emitHostChange(); }
    state.onChange?.(captureProductNavigation(slot));
  } else {
    retireActiveSlot();
    current = registration;
    emitHostChange();
  }
  return () => {
    if (state) {
      if (state.registration !== registration) return;
      state.registration = undefined;
      if (current === registration) { current = undefined; emitHostChange(); }
      state.onChange?.(undefined);
    } else if (current === registration) {
      current = undefined;
      emitHostChange();
    }
  };
}
export function productDocumentHost(slot?: NativeHostSlot): ProductDocumentHost | undefined {
  if (!slot) return current?.host;
  const state = slotState(slot);
  return !state.disposed && !state.retired ? state.registration?.host : undefined;
}
export interface ProductNavigationGuard {
  readonly product: ProductDocumentHost['product'];
  readonly id: string;
  /** Recheck after every async catalog operation and immediately before changing the route. */
  isCurrent(): boolean;
  prepare(): Promise<boolean>;
  /** Optional current Word save; does not prepare navigation or replace input. */
  saveCurrentSnapshot?(intentCurrent?: () => boolean): Promise<boolean>;
  prepareAccountExit?(): Promise<boolean>;
  /** Returns the exact installed target guard; the old guard retires on replacement. */
  open?(documentId: string, intentCurrent?: () => boolean): Promise<ProductNavigationGuard | false>;
}

/** Captures a lifetime, not only the document ID seen at both ends of an async operation. */
export function captureProductNavigation(slot?: NativeHostSlot): ProductNavigationGuard | undefined {
  const state = slot ? slotState(slot) : undefined;
  if (state?.disposed || state?.retired) return undefined;
  const registration = state ? state.registration : current;
  if (!registration) return undefined;
  const host = registration.host, id = host.id(), identity = host.identityEpoch?.();
  const isCurrent = () => (!state ? current === registration :
    !state.disposed && !state.retired && state.registration === registration &&
      (activeSlot === state ? current === registration : registration.slot === state)) &&
    host.id() === id && host.identityEpoch?.() === identity;
  const currentSave = host.product === 'word' ? host.saveCurrentSnapshot : undefined;
  const saveCurrentSnapshot = currentSave ? async (intentCurrent = () => true): Promise<boolean> => {
    const owns = () => isCurrent() && intentCurrent();
    return owns() && await currentSave.call(host, owns) && owns();
  } : undefined;
  const requestOpen = host.requestOpen;
  const open = requestOpen ? async (documentId: string, intentCurrent = () => true): Promise<ProductNavigationGuard | false> => {
    const owns = () => isCurrent() && intentCurrent();
    const scope = state && activeSlot !== state ? state : defaultOpening;
    if (!owns() || !documentId || scope.opening?.isCurrent()) return false;
    const lease = { isCurrent: owns };
    scope.opening = lease;
    try {
      // Product checks this captured owner after every await and before replacement.
      // Its own beforeNavigate may change fixed save state, but never bypasses input.
      const installed = await requestOpen.call(host, documentId, owns, intentCurrent);
      const captured = installed ? guards.get(installed) : undefined;
      // Default capture still belongs to the active registration's slot. A
      // current staged guard is not evidence that this source was replaced.
      const sameScope = !!captured && captured.registration.slot === (state ?? registration.slot) &&
        (!!state || current === captured.registration);
      return scope.opening === lease && intentCurrent() && installed && sameScope &&
        installed.product === host.product && installed.id === documentId && installed.isCurrent() ? installed : false;
    } finally { if (scope.opening === lease) scope.opening = undefined; }
  } : undefined;
  const guard = Object.freeze({ product: host.product, id, isCurrent, open, saveCurrentSnapshot,
    prepare: async () => isCurrent() && await host.beforeNavigate() && isCurrent(),
    prepareAccountExit: async () => isCurrent() && !!host.beforeAccountExit && await host.beforeAccountExit() && isCurrent() });
  guards.set(guard, { registration, slot: state });
  return guard;
}

/**
 * Caller must finish source native preparation and parent authority checks immediately
 * before this synchronous commit. A captured lifetime does not certify saved input.
 */
export function promoteProductNavigation(source: ProductNavigationGuard, target: ProductNavigationGuard): ProductNavigationGuard | false {
  const sourceOwner = guards.get(source), targetOwner = guards.get(target);
  const state = targetOwner?.slot;
  if (!sourceOwner || !targetOwner || !state || state.disposed || state.retired || activeSlot === state ||
    current !== sourceOwner.registration || state.registration !== targetOwner.registration ||
    !source.id || !target.id || !source.isCurrent() || !target.isCurrent()) return false;
  // Recheck after product-supplied identity accessors, before changing the active owner.
  if (current !== sourceOwner.registration || state.registration !== targetOwner.registration ||
    state.disposed || state.retired || !source.isCurrent() || !target.isCurrent()) return false;
  retireActiveSlot();
  activeSlot = state;
  current = targetOwner.registration;
  const installed = captureProductNavigation()!;
  emitHostChange();
  return installed;
}

/** Cancels only this mounted target; late source/target cleanup cannot clear another owner. */
export function disposeNativeHostSlot(slot: NativeHostSlot): void {
  const state = slotState(slot);
  if (state.disposed) return;
  state.disposed = true;
  state.registration = undefined;
  if (activeSlot === state) {
    activeSlot = undefined;
    current = undefined;
    emitHostChange();
  }
  state.onChange?.(undefined);
  state.onChange = undefined;
}

export async function prepareProductNavigation(): Promise<boolean> {
  return await captureProductNavigation()?.prepare() ?? false;
}

/** Account exit needs explicit private protection, never ordinary save-on-navigation. */
export async function prepareProductAccountExit(): Promise<boolean> {
  return await captureProductNavigation()?.prepareAccountExit?.() ?? false;
}

/** The local workspace owns trash state. Standalone development hosts have no workspace policy. */
export class ProductDocumentTrashedError extends Error {
  constructor() { super('휴지통에 있는 자료입니다. 자료함에서 복원하세요.'); }
}

export async function assertProductDocumentOpen(product: string, id: string): Promise<void> {
  const workspace = documentLocationWorkspace();
  if (!workspace) return;
  if (workspace !== localStorage.getItem('wonffice.local-workspace')) throw new Error('다른 작업 공간의 자료입니다.');
  if (await isProductDocumentTrashed(product, id)) throw new ProductDocumentTrashedError();
}

/** Lists use the catalog as a hint; opening checks the current policy again. */
export async function isProductDocumentTrashed(product: string, id: string): Promise<boolean> {
  const workspace = documentLocationWorkspace();
  if (!workspace || workspace !== localStorage.getItem('wonffice.local-workspace')) return false;
  const catalog = documentLibrary({ db: `wonffice-workspace-${workspace}`, store: 'catalog' });
  const snapshot = await catalog.read(`${product}:${id}`);
  const trashedAt = snapshot ? JSON.parse(snapshot.text).trashedAt : null;
  return trashedAt !== null && trashedAt !== undefined;
}
