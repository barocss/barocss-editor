/** Diagnostic observation only. No replacement style maps or copied print engine. */
const METHOD = 'computedStyleMap';
const attemptedWindows = new WeakSet();

function nativeDescriptor(ElementClass) {
  const prototype = ElementClass?.prototype;
  const descriptor = prototype && Object.getOwnPropertyDescriptor(prototype, METHOD);
  if (!descriptor || typeof descriptor.value !== 'function') {
    throw new Error('Native Element.prototype.computedStyleMap data method is required; no fallback');
  }
  if (!descriptor.configurable && !descriptor.writable) throw new Error('Native computedStyleMap descriptor cannot be observed');
  return { prototype, descriptor };
}

/**
 * Observe only the synchronous operation. The operation receives the actual native
 * return values; this function returns numeric metadata, never its result or nodes.
 */
export function observeComputedStyleMap(sourceRoot, operation, { ElementClass = globalThis.Element } = {}) {
  const { prototype, descriptor } = nativeDescriptor(ElementClass);
  if (!(sourceRoot instanceof ElementClass) || typeof operation !== 'function') {
    throw new Error('An actual source Element and synchronous operation are required');
  }
  const elements = new WeakMap();
  const maps = new WeakMap();
  const perElementMaps = new WeakMap();
  const rows = [];
  const callerStackSamples = [];
  const boundaryExpected = 1 + [...sourceRoot.children].filter(element => element.classList.contains('w-surface')).length;
  let calls = 0, returnedObjects = 0, distinctReturnedMaps = 0, nativeThrows = 0, observationErrors = 0;
  const classify = element => element === sourceRoot ? 'source-root'
    : element.parentElement === sourceRoot && element.classList.contains('w-surface') ? 'direct-surface-boundary'
      : sourceRoot.contains(element) ? 'nested-nonboundary' : 'outside-source';
  function observed(...args) {
    calls++;
    let row;
    try {
      if (this instanceof ElementClass) {
        row = elements.get(this);
        if (!row) {
          row = { elementOrdinal: rows.length + 1, classification: classify(this), calls: 0, returnedObjects: 0, distinctReturnedMaps: 0, nativeThrows: 0 };
          elements.set(this, row);
          perElementMaps.set(this, new WeakMap());
          rows.push(row);
        }
        row.calls++;
      }
    } catch { observationErrors++; }
    try {
      if (callerStackSamples.length < 3) {
        const stack = new Error('computedStyleMap controlled-call observation').stack;
        callerStackSamples.push({ callOrdinal: calls, classification: row?.classification ?? 'non-element-receiver',
          stack: typeof stack === 'string' ? stack.slice(0, 2048) : null });
      }
    } catch { observationErrors++; }
    let result;
    try { result = Reflect.apply(descriptor.value, this, args); }
    catch (error) { nativeThrows++; if (row) row.nativeThrows++; throw error; }
    try {
      if (result !== null && (typeof result === 'object' || typeof result === 'function')) {
        returnedObjects++;
        if (!maps.has(result)) { maps.set(result, true); distinctReturnedMaps++; }
        if (row) {
          row.returnedObjects++;
          const seen = perElementMaps.get(this);
          if (!seen.has(result)) { seen.set(result, true); row.distinctReturnedMaps++; }
        }
      }
    } catch { observationErrors++; }
    return result;
  }
  try { Object.defineProperty(prototype, METHOD, { ...descriptor, value: observed }); }
  catch (error) { throw new Error('Native computedStyleMap descriptor cannot be observed', { cause: error }); }
  try { operation(); }
  finally { Object.defineProperty(prototype, METHOD, descriptor); }
  const classifications = {};
  for (const row of rows) {
    const group = classifications[row.classification] ??= { elements: 0, calls: 0, returnedObjects: 0, distinctReturnedMapsPerElement: 0 };
    group.elements++; group.calls += row.calls; group.returnedObjects += row.returnedObjects;
    group.distinctReturnedMapsPerElement += row.distinctReturnedMaps;
  }
  return { calls, returnedObjects, distinctReturnedMaps, nativeThrows, observationErrors, classifications, elements: rows, boundaryExpected, callerStackSamples,
    nestedCalls: classifications['nested-nonboundary']?.calls ?? 0,
    nonboundaryCalls: (classifications['nested-nonboundary']?.calls ?? 0) + (classifications['outside-source']?.calls ?? 0),
    descriptorRestored: Object.getOwnPropertyDescriptor(prototype, METHOD)?.value === descriptor.value,
    boundary: 'source root or its direct .w-surface child only; other source descendants are nonboundary',
    attribution: 'Whole synchronous operation scope. Nested results are unused only if the caller is independently bound to unchanged print-pages snapshot; prepare/render and other listeners are not attributed.',
    limits: 'Counts and return identity only. Up to3 first-call stack strings, each at most2048characters, add diagnostic allocation; no allocation bytes, lifetime, GC, RSS or retention inference' };
}

export function inlinePixelSize(css) {
  if (typeof css !== 'string' || css.length === 0) return { status: 'ABSENT', pixels: null };
  if (!/^(?:\d+(?:\.\d*)?|\.\d+)px$/.test(css)) return { status: 'INVALID_OR_NOT_PX', pixels: null };
  const pixels = Number(css.slice(0, -2));
  if (!Number.isFinite(pixels)) return { status: 'INVALID_OR_NOT_PX', pixels: null };
  return { status: pixels > 0 ? 'AVAILABLE' : 'NONPOSITIVE', pixels };
}

function rectangle(element) {
  const { x, y, width, height } = element.getBoundingClientRect();
  if (![x, y, width, height].every(Number.isFinite)) throw new Error('Nonfinite source/output geometry');
  return { x, y, width, height };
}

function selectionPath(root, node) {
  if (!node || (node !== root && !root.contains(node))) return null;
  const path = [];
  for (let current = node; current !== root; current = current.parentNode) {
    if (!current.parentNode) return null;
    path.unshift(Array.prototype.indexOf.call(current.parentNode.childNodes, current));
  }
  return path;
}

function state(view, source, editor) {
  const selection = view.getSelection();
  const current = view.document.querySelector('.w-document');
  const faults = editor.documentFaults;
  if (!Array.isArray(faults)) throw new Error('Actual native document fault array is required');
  const exported = typeof editor.exportDocument === 'function' ? JSON.stringify(editor.exportDocument()) : null;
  return {
    source: source.outerHTML, nativeDocument: typeof exported === 'string' ? exported : null,
    nativeRoot: JSON.stringify(editor.getRootId() ?? null), domRoot: JSON.stringify(current?.getAttribute('data-bc-sid') ?? null),
    faults: JSON.stringify(faults), faultCount: faults.length, modelSelection: JSON.stringify(editor.selection ?? null),
    domSelection: JSON.stringify(selection ? { rangeCount: selection.rangeCount, anchor: selectionPath(source, selection.anchorNode),
      anchorOffset: selection.anchorOffset, focus: selectionPath(source, selection.focusNode), focusOffset: selection.focusOffset, collapsed: selection.isCollapsed } : null),
    sourceIdentityPreserved: source === current, geometry: rectangle(source),
    sheetGeometry: [...source.querySelectorAll('.w-sheet')].map(rectangle),
    counts: { sheets: source.querySelectorAll('.w-sheet').length, paragraphs: source.querySelectorAll('.w-paragraph').length },
  };
}

async function digest(view, value) {
  const data = new TextEncoder().encode(value);
  return [...new Uint8Array(await view.crypto.subtle.digest('SHA-256', data))].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

async function metadata(view, snapshot) {
  if (!snapshot) return null;
  const fields = ['source', 'nativeDocument', 'nativeRoot', 'domRoot', 'faults', 'modelSelection', 'domSelection'];
  const hashes = Object.fromEntries(await Promise.all(fields.map(async key => [key, snapshot[key] === null ? null : await digest(view, snapshot[key])])));
  return { sha256: hashes, faultCount: snapshot.faultCount, counts: snapshot.counts, geometry: snapshot.geometry, sheetGeometry: snapshot.sheetGeometry,
    sourceIdentityPreserved: snapshot.sourceIdentityPreserved };
}

function nextFrame(view) {
  return new Promise((resolve, reject) => {
    const timer = view.setTimeout(() => { view.cancelAnimationFrame(frame); reject(new Error('Controlled print cleanup frame exceeded2s')); }, 2000);
    const frame = view.requestAnimationFrame(() => { view.clearTimeout(timer); resolve(); });
  });
}

/** One controlled normal ?sample beforeprint/afterprint cycle, never an OS print. */
export async function runWordPrintCallProbe(view = globalThis.window) {
  if (!view?.document || !view.crypto?.subtle) throw new Error('Actual Word browser window with SHA256 is required');
  const query = new URL(view.location.href).searchParams;
  if (!query.has('sample') || query.get('sample') !== '' || query.has('lab')) throw new Error('Only the normal Word ?sample is permitted');
  nativeDescriptor(view.Element);
  const editor = view.editor, printer = view.wordPrintPages;
  const sources = view.document.querySelectorAll('.w-document');
  if (sources.length !== 1 || !editor || typeof editor.getRootId !== 'function'
    || typeof printer?.build !== 'function' || typeof printer.clear !== 'function') throw new Error('One actual native Word source/editor/print hook is required');
  if (view.document.querySelector('.w-print-pages')) throw new Error('Existing print output must not be replaced by this probe');
  if (attemptedWindows.has(view)) throw new Error('This controlled print probe already attempted this window; no retry');
  attemptedWindows.add(view);
  const source = sources[0], before = state(view, source, editor);
  let during, after, output, observation, failure, phase = 'beforeprint', beforeEvents = 0, afterEvents = 0, listenerErrors = 0;
  const recordError = () => { listenerErrors++; };
  view.addEventListener('error', recordError);
  try {
    observation = observeComputedStyleMap(source, () => { beforeEvents++; view.dispatchEvent(new view.Event('beforeprint')); }, { ElementClass: view.Element });
    phase = 'output-readout';
    during = state(view, source, editor);
    const containers = view.document.querySelectorAll('.w-print-pages');
    const container = containers[0];
    output = { containerCount: containers.length, pageCount: container?.children.length ?? 0, markup: container?.outerHTML ?? '',
      geometry: container ? rectangle(container) : null, pageGeometry: container ? [...container.children].map(rectangle) : [],
      inlinePageGeometry: container ? [...container.children].map(page => ({ width: inlinePixelSize(page.style.width), height: inlinePixelSize(page.style.height) })) : [] };
  } catch (error) { failure = { phase, name: error?.name ?? 'Error', message: String(error) }; }
  finally {
    try { phase = 'afterprint'; afterEvents++; view.dispatchEvent(new view.Event('afterprint')); }
    catch (error) { failure ??= { phase, name: error?.name ?? 'Error', message: String(error) }; }
    try { phase = 'cleanup-two-frames'; await nextFrame(view); await nextFrame(view); }
    catch (error) { failure ??= { phase, name: error?.name ?? 'Error', message: String(error) }; }
    view.removeEventListener('error', recordError);
  }
  after = state(view, source, editor);
  const comparisons = {
    sourceIdentityPreserved: before.sourceIdentityPreserved && !!during?.sourceIdentityPreserved && after.sourceIdentityPreserved,
    nativeRootMatchesDOM: before.nativeRoot === before.domRoot && after.nativeRoot === after.domRoot,
    nativeDocumentPreserved: before.nativeDocument === null || during?.nativeDocument === null || after.nativeDocument === null ? null
      : before.nativeDocument === after.nativeDocument && before.nativeDocument === during?.nativeDocument,
    nativeRootPreserved: before.nativeRoot === after.nativeRoot && before.nativeRoot === during?.nativeRoot,
    nativeFaultsPreserved: before.faults === after.faults && before.faults === during?.faults && after.faultCount === 0,
    sourceMarkupPreserved: before.source === after.source && before.source === during?.source,
    modelSelectionPreserved: before.modelSelection === after.modelSelection,
    domSelectionPreserved: before.domSelection === after.domSelection,
    sourceGeometryPreserved: JSON.stringify(before.geometry) === JSON.stringify(after.geometry),
    printedPageCountMatchesSource: output?.containerCount === 1 && output.pageCount === before.counts.sheets && output.pageCount > 0,
    outputInlineDimensionsPositive: !!output?.inlinePageGeometry.length && output.inlinePageGeometry.every(page => page.width.status === 'AVAILABLE' && page.height.status === 'AVAILABLE'),
    printOutputRemoved: view.document.querySelectorAll('.w-print-pages').length === 0,
    printHookPreserved: view.wordPrintPages === printer,
  };
  return { schema: 'office-v2-m0/word-print-call-probe-v1', status: failure || listenerErrors ? 'FAILED controlled observation' : 'COMPLETED controlled observation; inspect comparisons',
    path: 'Controlled beforeprint once / actual attached native hook / afterprint once / two RAF; not OS print or PDF',
    eventCounts: { beforeprint: beforeEvents, afterprint: afterEvents }, directBuildCallsByProbe: 0, listenerErrors, observation, comparisons,
    boundaryExpected: observation?.boundaryExpected ?? null,
    nativeDocumentObservation: before.nativeDocument === null ? 'UNAVAILABLE: native export API/JSON absent; no replacement serialization'
      : 'Actual editor.exportDocument hashes; runtime export reconciliation is outside this observation',
    snapshots: { before: await metadata(view, before), during: await metadata(view, during), after: await metadata(view, after) },
    output: output ? { sha256: await digest(view, output.markup), containerCount: output.containerCount, pageCount: output.pageCount,
      geometry: output.geometry, pageGeometry: output.pageGeometry, inlinePageGeometry: output.inlinePageGeometry,
      screenRectangleStatus: output.pageGeometry.length && output.pageGeometry.every(rect => rect.width > 0 && rect.height > 0) ? 'OBSERVED' : 'NOT_OBSERVABLE',
      inlineVsSourceRectangles: 'NOT_COMPARED: print inline dimensions divide source sheet rectangles by production scale; no scale proof or copied measurement algorithm',
      media: 'Unchanged screen media; zero hidden output rectangles do not fail the inline dimension observation' } : null,
    failure: failure ? { phase: failure.phase, name: failure.name, messageSha256: await digest(view, failure.message) } : null,
    limits: ['Metadata contains hashes/counts/geometry only; no raw native document, DOM nodes or returned style maps.',
      'Method calls and distinct returned map identities do not measure allocation size, native retention, RSS or GC.',
      'Pure Node tests verify observation semantics only; native browser behavior remains a separate Integration observation.'] };
}
