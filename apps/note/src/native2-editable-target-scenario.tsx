import { useEffect, useRef, useState } from 'react';
import { createNoteNative2Context, openNoteNativeSnapshot, openNoteTree, type NativeNoteSession, type NoteSession } from '@barocss/office-note';
import { NoteEditor, type NoteInputDelivery } from '@barocss/office-note/view';
import { createProtectedNative2Handoff, type ProtectedNative2Target } from './experimental-native2-editable-target';
import { createNative2TargetPreserve } from './experimental-native2-target-preserve';
import type { Native2RecoveryRecord } from './experimental-native2-preserve-pending';
import { createExperimentalNative2NoteReader } from './experimental-native2-reader';
import { createExperimentalNative2Adopter, type ResolvedNative2Version } from './experimental-native2-adopt';
import { type Native2PreserveBase, native2Record } from './experimental-native2-preserve';
import { createExperimentalNative2PendingJournal } from './experimental-native2-preserve-pending';
import { createServerPendingStore } from './server-pending';
import { NATIVE_NOTE_FIXTURES } from './native2-scenario-fixtures';
import { createExperimentalNative2AdoptJournal, type Native2AdoptRecovery } from './experimental-native2-adopt-pending';

const tenantId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', workspaceId = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const ids = { A: '33333333-3333-4333-8333-333333333333', A2: '33333333-3333-4333-8333-333333333333',
  B: '44444444-4444-4444-8444-444444444444', C: '55555555-5555-4555-8555-555555555555' } as const;
type Kind = keyof typeof ids;
type Journal = ReturnType<typeof createExperimentalNative2AdoptJournal>;
type Writer = ReturnType<typeof createExperimentalNative2Adopter>;
interface Live {
  session: NativeNoteSession; authority: NoteSession; base: Native2PreserveBase; journal: Journal; writer: Writer;
  current: () => boolean; generation: number; lastCaptured: string; children: Map<string, NoteSession>; choice?: ResolvedNative2Version; preparedSource?: string; datasetPath?: number[]; datasetSid?: string; datasetNode?: unknown;
}
export interface Native2EditableTargetObservation {
  nativeDocument: ReturnType<NativeNoteSession['exportNativeDocument']>; snapshotText: string;
  model: ReturnType<NativeNoteSession['editor']['exportDocument']>; history: ReturnType<NativeNoteSession['editor']['getHistoryStats']>;
  selection: NativeNoteSession['editor']['selection']; hostFocused: boolean; epoch: number; generation: number; writable: boolean;
  childModel?: ReturnType<NoteSession['editor']['exportDocument']>; childHistory?: ReturnType<NoteSession['editor']['getHistoryStats']>;
  childSelection?: NoteSession['editor']['selection']; journal?: Native2AdoptRecovery; journalKey: string; durableRaw: string | null;
  handoffState?: string; sourceRetired: boolean; sourceModel: ReturnType<NativeNoteSession['editor']['exportDocument']>;
  sourceNative: ReturnType<NativeNoteSession['exportNativeDocument']>; sourceHistory: ReturnType<NativeNoteSession['editor']['getHistoryStats']>;
  sourceEpoch: number; sourceContext: NativeNoteSession['context']; parkedHistoryRetained?: boolean; targetRecovery?: Native2RecoveryRecord; targetKey?: string; targetRaw?: string | null;
  domRange?: { startNodeId: string; endNodeId: string; startOffset: number; endOffset: number; collapsed: boolean; text: string };
}
declare global { interface Window { readNative2EditableTarget?: () => Native2EditableTargetObservation | undefined } }

/** Actual native editor and browser Storage; identity/authority and HTTP are controlled diagnostics, not genuine account/PG proof. */
export function Native2EditableTargetScenario() {
  const kind: Kind = 'A';
  const subject = new URLSearchParams(location.search).get('controlled-subject') ?? 'controlled-writer';
  type TargetLive = { target: ProtectedNative2Target; service: ReturnType<typeof createNative2TargetPreserve>; base: Native2PreserveBase; generation: number; lastCaptured: string; children: Map<string, NoteSession> };
  const targetLive = useRef<TargetLive | undefined>(undefined), handoff = useRef<ReturnType<typeof createProtectedNative2Handoff> | undefined>(undefined), sourceRetired = useRef(false);
  const targetRecovery = useRef<Native2RecoveryRecord | undefined>(undefined);
  const mounted = useRef(false), owner = useRef(0), writable = useRef(true), live = useRef<Live | undefined>(undefined);
  const child = useRef<NoteSession | undefined>(undefined), deliveries = useRef(new Map<NoteSession | NativeNoteSession, NoteInputDelivery>());
  const durable = useRef<Native2AdoptRecovery | undefined>(undefined);
  const [shown, setShown] = useState<NativeNoteSession>(), [nested, setNested] = useState<NoteSession>();
  const [status, setStatus] = useState('loading'), [problem, setProblem] = useState('');
  const assert = (one: Live) => { if (live.current !== one || !one.current()) throw new Error('stale_native2_writable_context'); };
  const remember = (record: Native2AdoptRecovery) => { durable.current = record; };
  const domRange = () => {
    const selection = document.getSelection(); if (!selection || selection.rangeCount !== 1) return undefined;
    const range = selection.getRangeAt(0), editor = child.current?.editor ?? targetLive.current?.target.session.editor ?? live.current?.session.editor;
    const point = (node: Node, offset: number) => {
      const element = node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement;
      if (!(element instanceof Element)) return undefined;
      const leaf = element.closest('[data-bc-sid]'), sid = leaf?.getAttribute('data-bc-sid');
      if (!sid || !leaf?.closest('[data-testid="native2-editable-target-host"]')) return undefined;
      const model = editor?.dataStore.getNode(sid); if (model?.stype !== 'inline-text' || typeof model.text !== 'string') return undefined;
      const prefix = document.createRange(); prefix.selectNodeContents(leaf); prefix.setEnd(node, offset);
      const position = prefix.toString().length; return position <= model.text.length ? { sid, position } : undefined;
    };
    const start = point(range.startContainer, range.startOffset), end = point(range.endContainer, range.endOffset);
    return start && end ? { startNodeId: start.sid, endNodeId: end.sid, startOffset: start.position, endOffset: end.position,
      collapsed: range.collapsed, text: selection.toString() } : undefined;
  };
  const capture = async (one: Live) => {
    assert(one);
    for (const delivery of deliveries.current.values()) { if (!await delivery()) throw new Error('native2_input_unprotected'); assert(one); }
    for (const [resourceId, value] of one.children) {
      assert(one); value.flush(); if (!await one.session.commitChildResource(resourceId, value)) throw new Error('native2_child_delivery_refused'); assert(one);
    }
    one.session.flush(); assert(one); const text = one.session.exportSnapshot();
    if (text !== one.lastCaptured) { one.generation++; one.lastCaptured = text; }
    return { generation: one.generation, snapshotText: text };
  };
  const protect = async (one: Live) => {
    const draft = await capture(one); assert(one); const record = await one.journal.writeDraft(one.base, draft); assert(one); remember(record); return record;
  };
  const captureDataset = (one: Live) => {
    const found: Array<{ path: number[]; sid: string }> = [];
    const visit = (node: unknown, path: number[]) => {
      if (!native2Record(node) || typeof node.sid !== 'string') throw new Error('actual_source_model_required');
      if (node.stype === 'dataset') found.push({ path, sid: node.sid });
      if (Array.isArray(node.content)) node.content.forEach((value, i) => visit(value, [...path, i]));
    };
    visit(one.session.editor.exportDocument(), []);
    if (found.length !== 1) throw new Error('ambiguous_source_dataset');
    one.datasetPath = found[0].path; one.datasetSid = found[0].sid;
    one.datasetNode = one.session.editor.dataStore.getNode(found[0].sid);
  };
  const prepare = async () => {
    const one = live.current; if (!one) return;
    try {
      const record = await protect(one); assert(one); captureDataset(one);
      const source = record.latestSourceDraft.snapshotText;
      const choice = await one.writer.resolveExact(NATIVE_NOTE_FIXTURES.TARGET_A2.schemaBundle.selected[0]); assert(one);
      const fresh = await protect(one); assert(one);
      if (fresh.latestSourceDraft.snapshotText !== source) throw new Error('adoption_source_changed_prepare_again');
      one.choice = choice; one.preparedSource = source; setProblem(''); setStatus('exact-version-prepared-source-protected');
    } catch (e) { error(e); }
  };
  const error = (e: unknown) => { setProblem(e instanceof Error ? e.message : 'native2_preserve_refused'); };
  useEffect(() => {
    mounted.current = true; writable.current = true; sourceRetired.current = false; const captured = ++owner.current;
    const authority = openNoteTree({ stype: 'note', content: [{ stype: 'paragraph', content: [{ stype: 'inline-text', text: 'Local diagnostic authority' }] }] });
    const epoch = authority.editor.dataStore.getDocumentEpoch(), root = authority.rootId, sessionId = authority.session;
    const current = () => mounted.current && !sourceRetired.current && owner.current === captured && writable.current && authority.editor.isEditable &&
      authority.editor.dataStore.getDocumentEpoch() === epoch && authority.rootId === root && authority.session === sessionId;
    const scope = { issuer: 'controlled-issuer', subject, tenantId, workspaceId };
    const journal = createExperimentalNative2AdoptJournal({ scope, documentId: ids[kind], isWritableCurrent: () => live.current?.current() ?? current() });
    const legacy = createServerPendingStore(scope);
    const preserved = createExperimentalNative2PendingJournal({ scope, documentId: ids[kind], isWritableCurrent: current });
    const writerCurrent = () => {
      const one = live.current;
      return current() && (!one || one.current() && (!one.datasetSid || one.session.editor.dataStore.getNode(one.datasetSid) === one.datasetNode));
    };
    const writer = createExperimentalNative2Adopter({ scope, apiBase: '/controlled-native2', authorizedFetch: fetch,
      isCurrent: writerCurrent, isAdoptWritableCurrent: writerCurrent, readDurableAttempt: async () => (await journal.read())?.fixed,
      hasUnresolvedPrior: async () => {
        const old = legacy.list();
        if (old.some(r => r.base.operation === 'update' && r.base.documentId === ids[kind] && r.status !== 'confirmed')) return true;
        const prior = await preserved.read();
        return !!prior && (prior.phase !== 'fixed-confirmed' || !prior.fixed || prior.latestDraft.generation !== prior.fixed.generation || prior.latestDraft.snapshotText !== prior.fixed.snapshotText);
      } });
    let provisional: NativeNoteSession | undefined;
    void (async () => {
      try {
        const reader = createExperimentalNative2NoteReader({ tenantId, workspaceId, apiBase: '/controlled-native2', authorizedFetch: fetch, isCurrent: current });
        const read = await reader.open(ids[kind]); if (!current()) return;
        const recovered = await journal.read(); if (!current()) return;
        const base = recovered?.base ?? { document: read.document, snapshotText: read.snapshotText };
        const text = recovered?.latestSourceDraft.snapshotText ?? read.snapshotText;
        provisional = openNoteNativeSnapshot(createNoteNative2Context(text), { authority: authority.editor, after: 60000 });
        provisional.exportNativeDocument(); provisional.exportSnapshot(); if (!current()) return;
        const opened = provisional, sourceRoot = opened.rootId, sourceSession = opened.session, sourceEpoch = opened.editor.dataStore.getDocumentEpoch();
        const sourceCurrent = () => current() && opened.rootId === sourceRoot && opened.session === sourceSession && opened.editor.dataStore.getDocumentEpoch() === sourceEpoch;
        const one: Live = { session: opened, authority, base, journal, writer, current: sourceCurrent, generation: recovered?.latestSourceDraft.generation ?? 1,
          lastCaptured: text, children: new Map<string, NoteSession>() };
        live.current = one; if (recovered?.fixed) captureDataset(one); provisional = undefined; durable.current = recovered; setShown(one.session); setStatus(recovered ? 'recovered-unsent-or-unknown' : 'local-original');
      } catch (e) { if (mounted.current) error(e); } finally { provisional?.close(); }
    })();
    window.readNative2EditableTarget = () => {
      const one = live.current; if (!one) return undefined;
      const fresh = targetLive.current, active = fresh?.target.session ?? one.session;
      return { nativeDocument: active.exportNativeDocument(), snapshotText: active.exportSnapshot(), model: active.editor.exportDocument(),
        history: active.editor.getHistoryStats(), selection: active.editor.selection,
        sourceRetired: sourceRetired.current, sourceModel: one.session.editor.exportDocument(), sourceNative: one.session.exportNativeDocument(),
        sourceContext: one.session.context, sourceHistory: one.session.editor.getHistoryStats(), sourceEpoch: one.session.editor.dataStore.getDocumentEpoch(),
        handoffState: handoff.current?.state, parkedHistoryRetained: handoff.current?.observeParked().oldHistoryRetained,
        targetRecovery: targetRecovery.current, targetKey: fresh?.service.physicalKey, targetRaw: fresh ? localStorage.getItem(fresh.service.physicalKey) : null,
        hostFocused: !!document.activeElement?.closest('[data-testid="native2-editable-target-host"]'), epoch: active.editor.dataStore.getDocumentEpoch(),
        generation: fresh?.generation ?? one.generation, writable: fresh?.target.isCurrent() ?? one.current(), journal: durable.current, journalKey: one.journal.key,
        durableRaw: localStorage.getItem(one.journal.key), domRange: domRange(),
        ...(child.current ? { childModel: child.current.editor.exportDocument(), childHistory: child.current.editor.getHistoryStats(), childSelection: child.current.editor.selection } : {}) };
    };
    return () => {
      // An abrupt unmount is not a durable flush or logout claim. Never send/retry here.
      mounted.current = false; owner.current++; delete window.readNative2EditableTarget;
      handoff.current?.dispose(); handoff.current = undefined;
      for (const c of targetLive.current?.children.values() ?? []) { try { c.close(); } catch { /* Abrupt cleanup is not protected exit. */ } }
      targetLive.current = undefined;
      const one = live.current; live.current = undefined;
      if (one) { for (const value of one.children.values()) { try { value.close(); } catch { /* Retired child cannot deliver. */ } } try { one.session.close(); } catch { /* Unprotected input not claimed durable. */ } }
      child.current = undefined; deliveries.current.clear(); try { authority.close(); } catch { /* Already retired host. */ }
    };
  }, []);
  const perform = async (operation: 'adopt' | 'retry' | 'check') => {
    const one = live.current; if (!one) return;
    try {
      assert(one); setProblem(''); let record = await protect(one); assert(one);
      if (operation === 'adopt') {
        if (record.fixed) throw new Error('fixed_request_requires_explicit_retry');
        if (!one.choice || !one.datasetPath || one.preparedSource !== record.latestSourceDraft.snapshotText) throw new Error('adoption_source_changed_prepare_again');
        const attempt = await one.writer.freeze(one.base, record.latestSourceDraft.snapshotText, one.choice, one.datasetPath, 'native2-adopt-test-1', record.latestSourceDraft.generation); assert(one);
        record = await one.journal.fix(attempt); assert(one); remember(record);
      }
      const attempt = record.fixed; if (!attempt) throw new Error('native2_no_fixed_request');
      setStatus(operation === 'check' ? 'checking-receipt' : 'sending-fixed');
      const receipt = operation === 'check' ? await one.writer.checkReceipt(attempt) : await one.writer.send(attempt); assert(one);
      if (operation !== 'check') { record = await one.journal.observeDirect(attempt, receipt); assert(one); remember(record); }
      // A later real edit must be protected separately before an older generation is confirmed.
      record = await protect(one); assert(one);
      const proof = await one.writer.confirm(attempt, receipt, record.directRequestHash); assert(one);
      if (proof.status !== 'adoption-fixed-confirmed') { setStatus(proof.reason); return; }
      record = await one.journal.confirmFixed(proof); assert(one); remember(record);
      setStatus(record.latestSourceDraft.generation === attempt.generation && record.latestSourceDraft.snapshotText === attempt.sourceSnapshotText ? 'adoption-fixed-confirmed-source-session-retained' : 'adoption-fixed-confirmed-later-source-dirty');
    } catch (e) {
      error(e);
      if (!one.current()) { setStatus('revoked-unprotected-input-retained'); return; }
      try {
        const record = await protect(one); if (record.fixed && record.phase !== 'adoption-fixed-confirmed') remember(await one.journal.markUnknown(record.fixed));
        setStatus('unknown-or-unprotected');
      } catch (protectError) { error(protectError); setStatus('unprotected-input-retained'); }
    }
  };
  const captureTarget = async (one: TargetLive) => {
    const requireCurrent = () => { if (targetLive.current !== one || !one.target.isCurrent()) throw new Error('stale_native2_writable_context'); };
    requireCurrent();
    for (const delivery of deliveries.current.values()) { if (!await delivery()) throw new Error('native2_input_unprotected'); requireCurrent(); }
    for (const [id, value] of one.children) {
      value.flush(); requireCurrent(); if (!await one.target.session.commitChildResource(id, value)) throw new Error('native2_child_delivery_refused'); requireCurrent();
    }
    one.target.session.flush(); requireCurrent(); const snapshotText = one.target.session.exportSnapshot();
    if (snapshotText !== one.lastCaptured) { one.lastCaptured = snapshotText; one.generation++; }
    return { snapshotText, generation: one.generation };
  };
  const protectTarget = async (one: TargetLive) => {
    const draft = await captureTarget(one); const record = await one.service.protect(one.base, draft.snapshotText, draft.generation);
    targetRecovery.current = record; return record;
  };
  const begin = async (retry = false) => {
    const source = live.current; if (!source) return;
    try {
      setProblem('');
      if (!handoff.current) {
        const scope = { issuer: 'controlled-issuer', subject, tenantId, workspaceId };
        // This reader lifetime is captured separately from source writer/authority.
        const actor = () => mounted.current && writable.current;
        const reader = createExperimentalNative2NoteReader({ tenantId, workspaceId, apiBase: '/controlled-native2', authorizedFetch: fetch, isCurrent: actor });
        handoff.current = createProtectedNative2Handoff({ source: { session: source.session, authority: source.authority, children: () => [...source.children.values()],
          isCurrent: source.current, protect: () => protect(source),
          qualify: async record => {
            if (!record.fixed || !record.directRequestHash) throw new Error('native2_adoption_unconfirmed');
            const receipt = await source.writer.checkReceipt(record.fixed); const proof = await source.writer.confirm(record.fixed, receipt, record.directRequestHash);
            if (proof.status !== 'adoption-fixed-confirmed') throw new Error(proof.reason); return proof;
          }, retire: () => { sourceRetired.current = true; } }, isActorWritableCurrent: actor,
          readFreshTarget: () => reader.open(ids.A), activate: target => {
            const fixed = durable.current?.fixed; if (!fixed) throw new Error('native2_adoption_unconfirmed');
            const service = createNative2TargetPreserve({ scope, documentId: ids.A, adoptionKey: fixed.idempotencyKey, targetSeedHash: target.read.document.snapshotHash,
              storage: localStorage, apiBase: '/controlled-native2', authorizedFetch: fetch, isCurrent: target.isCurrent });
            targetLive.current = { target, service, base: { document: target.read.document, snapshotText: target.read.snapshotText }, generation: 1, lastCaptured: target.read.snapshotText, children: new Map() };
            child.current = undefined; setNested(undefined); setShown(target.session);
          } });
      }
      if (retry) await handoff.current.retry(); else await handoff.current.begin();
      setStatus('target-active-old-history-parked');
    } catch (e) { error(e); setStatus(handoff.current?.state ?? 'handoff-refused'); }
  };
  // The newly mounted target gets an explicit fresh heading-end caret. No old SID/selection migration.
  useEffect(() => {
    const one = targetLive.current; if (!one || shown !== one.target.session) return;
    const frame = requestAnimationFrame(() => {
      if (!one.target.isCurrent()) return;
      const heading = document.querySelector<HTMLElement>('[data-testid="native2-editable-target-host"] h2');
      const leaf = heading?.querySelector<HTMLElement>('[data-bc-sid]'); const sid = leaf?.getAttribute('data-bc-sid');
      const node = sid ? one.target.session.editor.dataStore.getNode(sid) : undefined;
      if (!heading || !leaf || !sid || typeof node?.text !== 'string') { error(new Error('native2_target_initial_caret_unavailable')); return; }
      const range = { type: 'range' as const, startNodeId: sid, endNodeId: sid, startOffset: node.text.length, endOffset: node.text.length, collapsed: true };
      heading.closest<HTMLElement>('[contenteditable="true"]')?.focus({ preventScroll: true });
      const dom = document.createRange(); dom.selectNodeContents(leaf); dom.collapse(false);
      const selection = document.getSelection(); selection?.removeAllRanges(); selection?.addRange(dom);
      one.target.session.editor.selectionManager.setSelection(range);
    });
    return () => cancelAnimationFrame(frame);
  }, [shown]);
  const saveTarget = async (mode: 'save' | 'check' | 'retry') => {
    const one = targetLive.current; if (!one) return;
    try {
      setProblem(''); let record = await protectTarget(one);
      if (mode === 'save') { const attempt = await one.service.freeze(one.base, record.latestDraft.snapshotText, record.latestDraft.generation, 'native2-target-preserve-test-1'); record = (await one.service.journal.read())!; targetRecovery.current = record; if (record.fixed?.bodyText !== attempt.bodyText) throw new Error('native2_fixed_not_durable'); }
      const fixed = record.fixed; if (!fixed) throw new Error('native2_no_fixed_request'); setStatus('sending-target-fixed');
      const receipt = mode === 'check' ? await one.service.writer.checkReceipt(fixed) : await one.service.writer.send(fixed);
      if (mode !== 'check') targetRecovery.current = await one.service.journal.observeDirect(fixed, receipt);
      record = await protectTarget(one);
      const proof = await one.service.writer.confirm(fixed, receipt, record.directRequestHash);
      if (proof.status !== 'fixed-confirmed') { setStatus(proof.reason); return; }
      targetRecovery.current = await one.service.journal.confirmFixed(proof);
      setStatus(record.latestDraft.generation === fixed.generation && record.latestDraft.snapshotText === fixed.snapshotText ? 'target-fixed-confirmed' : 'target-fixed-confirmed-later-dirty');
    } catch (e) {
      error(e); setStatus('target-unknown-or-unprotected');
      if (one.target.isCurrent()) { try { const record = await protectTarget(one); if (record.fixed && record.phase !== 'fixed-confirmed') targetRecovery.current = await one.service.journal.markUnknown(record.fixed); } catch (protectError) { error(protectError); } }
    }
  };
  const showNested = async () => {
    const old = live.current, fresh = targetLive.current; if (!old) return;
    try {
      if (fresh) await captureTarget(fresh); else await capture(old);
      const session = fresh?.target.session ?? old.session, children = fresh?.children ?? old.children;
      const resource = [...session.editor.dataStore.getNodes().values()].filter(n => n.stype === 'richText').at(-1);
      if (!resource?.sid) throw new Error('Original last nested resource missing');
      let value = children.get(resource.sid); if (!value) { value = session.openChildResource(resource.sid); children.set(resource.sid, value); }
      child.current = value; setNested(value);
    } catch (e) { error(e); }
  };
  const leave = async (reopen = false) => {
    const old = live.current, fresh = targetLive.current; if (!old) return;
    try {
      if (fresh) { await protectTarget(fresh); fresh.target.retire(); } else { await protect(old); old.authority.editor.setEditable(false); }
      writable.current = false; owner.current++; setStatus('explicit-leave-protected-no-send'); setProblem('');
      if (reopen) location.href = '/scenarios.html?case=native2-transport-A2';
    } catch (e) { error(e); setStatus('leave-blocked-input-unprotected'); }
  };
  const protectActive = async () => {
    try { const one = live.current, fresh = targetLive.current; if (fresh) await protectTarget(fresh); else if (one) await protect(one); setStatus('latest-draft-protected'); } catch (e) { error(e); }
  };
  const activeSession = nested ?? shown;
  return <main className="scenario-standalone">
    <h1>Controlled native2 protected fresh target: parked source history; separate explicit target save</h1>
    <div>
      <button onClick={() => void begin()}>Begin target editing</button>
      <button onClick={() => void begin(true)}>Retry target qualification</button>
      <button onClick={() => void saveTarget('save')}>Save target change</button>
      <button onClick={() => void saveTarget('check')}>Check target receipt</button>
      <button onClick={() => void saveTarget('retry')}>Retry target fixed request</button>
      <button onMouseDown={event => event.preventDefault()} onClick={() => { const one = live.current, fixed = durable.current?.fixed; if (one && fixed) void one.writer.checkReceipt(fixed).then(() => error(new Error('retired-origin-unexpected-success'))).catch(error); }}>Probe retired source callback</button>
      <button onClick={() => void prepare()}>Prepare exact schema 111 v2</button>
      <button onClick={() => void perform('adopt')}>Adopt fixed target</button>
      <button onClick={() => void perform('check')}>Check receipt</button>
      <button onClick={() => void perform('retry')}>Retry fixed request</button>
      <button onClick={() => void protectActive()}>Protect latest draft</button>
      <button onClick={() => void showNested()}>Show last nested resource</button>
      <button onClick={() => {
        const one = live.current; if (one) void (targetLive.current ? captureTarget(targetLive.current) : capture(one)).then(() => { child.current = undefined; setNested(undefined); }).catch(error);
      }}>Show parent</button>
      <button onClick={() => void leave()}>Leave after protecting input</button>
      <button onClick={() => void leave(true)}>Leave protected and open target read-only</button>
      <button onClick={() => { const one = live.current; if (one) { writable.current = false; one.authority.editor.setEditable(false); targetLive.current?.target.retire(); setStatus('revoked-unprotected-input-retained'); } }}>Revoke controlled role</button>
      <button onClick={() => { const editor = child.current?.editor ?? targetLive.current?.target.session.editor ?? live.current?.session.editor; void editor?.undo(); }}>Undo local edit</button>
      <button onClick={() => { const editor = child.current?.editor ?? targetLive.current?.target.session.editor ?? live.current?.session.editor; void editor?.redo(); }}>Redo local edit</button>
      {(['toggleBold', 'toggleItalic', 'toggleUnderline', 'toggleStrikeThrough'] as const).map(command => <button key={command}
        onMouseDown={event => event.preventDefault()} onClick={() => { void (child.current?.editor ?? targetLive.current?.target.session.editor ?? live.current?.session.editor)?.executeCommand(command); }}>{command}</button>)}
      <button onClick={() => {
        const one = targetLive.current?.target.session ?? live.current?.session, first = one?.editor.dataStore.getNode(one.rootId)?.content?.[0];
        if (one && typeof first === 'string') void one.editor.executeCommand('moveNoteBlockDown', { nodeId: first });
      }}>Move first block down</button>
    </div>
    <output data-testid="target-status">{status}</output>
    {problem && <p role="alert" data-testid="target-error">{problem}</p>}
    <div className="scenario-host" data-testid="native2-editable-target-host" tabIndex={0} onInput={() => setStatus('local-dirty')}>
      {activeSession && <NoteEditor key={activeSession.session} editor={activeSession.editor} rootId={activeSession.rootId}
        registerBeforeSnapshot={delivery => { deliveries.current.set(activeSession, delivery); return () => { if (deliveries.current.get(activeSession) === delivery) deliveries.current.delete(activeSession); }; }} />}
    </div>
  </main>;
}
