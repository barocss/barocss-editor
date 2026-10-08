import { useEffect, useRef, useState } from 'react';
import { createNoteNative2Context, openNoteNativeSnapshot, openNoteTree, type NativeNoteSession, type NoteSession } from '@barocss/office-note';
import { NoteEditor, type NoteInputDelivery } from '@barocss/office-note/view';
import { createExperimentalNative2NoteReader } from './experimental-native2-reader';
import { createExperimentalNative2Preserver, type Native2PreserveBase } from './experimental-native2-preserve';
import { createExperimentalNative2PendingJournal, type Native2RecoveryRecord } from './experimental-native2-preserve-pending';

const tenantId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', workspaceId = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const ids = { A: '33333333-3333-4333-8333-333333333333', A2: '33333333-3333-4333-8333-333333333333',
  B: '44444444-4444-4444-8444-444444444444', C: '55555555-5555-4555-8555-555555555555' } as const;
type Kind = keyof typeof ids;
type Journal = ReturnType<typeof createExperimentalNative2PendingJournal>;
type Writer = ReturnType<typeof createExperimentalNative2Preserver>;
interface Live {
  session: NativeNoteSession; authority: NoteSession; base: Native2PreserveBase; journal: Journal; writer: Writer;
  current: () => boolean; generation: number; lastCaptured: string; children: Map<string, NoteSession>;
}
export interface Native2PreserveObservation {
  nativeDocument: ReturnType<NativeNoteSession['exportNativeDocument']>; snapshotText: string;
  model: ReturnType<NativeNoteSession['editor']['exportDocument']>; history: ReturnType<NativeNoteSession['editor']['getHistoryStats']>;
  selection: NativeNoteSession['editor']['selection']; hostFocused: boolean; epoch: number; generation: number; writable: boolean;
  childModel?: ReturnType<NoteSession['editor']['exportDocument']>; childHistory?: ReturnType<NoteSession['editor']['getHistoryStats']>;
  childSelection?: NoteSession['editor']['selection']; journal?: Native2RecoveryRecord; journalKey: string; durableRaw: string | null;
  domRange?: { startNodeId: string; endNodeId: string; startOffset: number; endOffset: number; collapsed: boolean; text: string };
}
declare global { interface Window { readNative2Preserve?: () => Native2PreserveObservation | undefined } }

/** Actual native editor and browser Storage; identity/authority and HTTP are controlled diagnostics, not genuine account/PG proof. */
export function Native2PreserveScenario({ variant }: { variant: string }) {
  const kind: Kind = variant === 'B' || variant === 'A2' || variant === 'C' ? variant : 'A';
  const subject = new URLSearchParams(location.search).get('controlled-subject') ?? 'controlled-writer';
  const mounted = useRef(false), owner = useRef(0), writable = useRef(true), live = useRef<Live | undefined>(undefined);
  const child = useRef<NoteSession | undefined>(undefined), deliveries = useRef(new Map<NoteSession | NativeNoteSession, NoteInputDelivery>());
  const durable = useRef<Native2RecoveryRecord | undefined>(undefined);
  const [shown, setShown] = useState<NativeNoteSession>(), [nested, setNested] = useState<NoteSession>();
  const [status, setStatus] = useState('loading'), [problem, setProblem] = useState('');
  const assert = (one: Live) => { if (live.current !== one || !one.current()) throw new Error('stale_native2_writable_context'); };
  const remember = (record: Native2RecoveryRecord) => { durable.current = record; };
  const domRange = () => {
    const selection = document.getSelection(); if (!selection || selection.rangeCount !== 1) return undefined;
    const range = selection.getRangeAt(0), editor = child.current?.editor ?? live.current?.session.editor;
    const point = (node: Node, offset: number) => {
      const element = node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement;
      if (!(element instanceof Element)) return undefined;
      const leaf = element.closest('[data-bc-sid]'), sid = leaf?.getAttribute('data-bc-sid');
      if (!sid || !leaf?.closest('[data-testid="native2-preserve-host"]')) return undefined;
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
  const error = (e: unknown) => { setProblem(e instanceof Error ? e.message : 'native2_preserve_refused'); };
  useEffect(() => {
    mounted.current = true; writable.current = true; const captured = ++owner.current;
    const authority = openNoteTree({ stype: 'note', content: [{ stype: 'paragraph', content: [{ stype: 'inline-text', text: 'Local diagnostic authority' }] }] });
    const epoch = authority.editor.dataStore.getDocumentEpoch(), root = authority.rootId, sessionId = authority.session;
    const current = () => mounted.current && owner.current === captured && writable.current && authority.editor.isEditable &&
      authority.editor.dataStore.getDocumentEpoch() === epoch && authority.rootId === root && authority.session === sessionId;
    const scope = { issuer: 'controlled-issuer', subject, tenantId, workspaceId };
    const journal = createExperimentalNative2PendingJournal({ scope, documentId: ids[kind], isWritableCurrent: current });
    const writer = createExperimentalNative2Preserver({ scope, apiBase: '/controlled-native2', authorizedFetch: fetch,
      isCurrent: current, isWritableCurrent: current, readDurableAttempt: async () => (await journal.read())?.fixed });
    let provisional: NativeNoteSession | undefined;
    void (async () => {
      try {
        const reader = createExperimentalNative2NoteReader({ tenantId, workspaceId, apiBase: '/controlled-native2', authorizedFetch: fetch, isCurrent: current });
        const read = await reader.open(ids[kind]); if (!current()) return;
        const recovered = await journal.read(); if (!current()) return;
        const base = recovered?.base ?? { document: read.document, snapshotText: read.snapshotText };
        const text = recovered?.latestDraft.snapshotText ?? read.snapshotText;
        provisional = openNoteNativeSnapshot(createNoteNative2Context(text), { authority: authority.editor, after: 60000 });
        provisional.exportNativeDocument(); provisional.exportSnapshot(); if (!current()) return;
        const one = { session: provisional, authority, base, journal, writer, current, generation: recovered?.latestDraft.generation ?? 1,
          lastCaptured: text, children: new Map<string, NoteSession>() };
        live.current = one; provisional = undefined; durable.current = recovered; setShown(one.session); setStatus(recovered ? 'recovered-unsent-or-unknown' : 'local-original');
      } catch (e) { if (mounted.current) error(e); } finally { provisional?.close(); }
    })();
    window.readNative2Preserve = () => {
      const one = live.current; if (!one) return undefined;
      return { nativeDocument: one.session.exportNativeDocument(), snapshotText: one.session.exportSnapshot(), model: one.session.editor.exportDocument(),
        history: one.session.editor.getHistoryStats(), selection: one.session.editor.selection,
        hostFocused: !!document.activeElement?.closest('[data-testid="native2-preserve-host"]'), epoch: one.session.editor.dataStore.getDocumentEpoch(),
        generation: one.generation, writable: one.current(), journal: durable.current, journalKey: one.journal.key,
        durableRaw: localStorage.getItem(one.journal.key), domRange: domRange(),
        ...(child.current ? { childModel: child.current.editor.exportDocument(), childHistory: child.current.editor.getHistoryStats(), childSelection: child.current.editor.selection } : {}) };
    };
    return () => {
      // An abrupt unmount is not a durable flush or logout claim. Never send/retry here.
      mounted.current = false; owner.current++; delete window.readNative2Preserve;
      const one = live.current; live.current = undefined;
      if (one) { for (const value of one.children.values()) { try { value.close(); } catch { /* Retired child cannot deliver. */ } } try { one.session.close(); } catch { /* Unprotected input not claimed durable. */ } }
      child.current = undefined; deliveries.current.clear(); try { authority.close(); } catch { /* Already retired host. */ }
    };
  }, []);
  const perform = async (operation: 'save' | 'retry' | 'check') => {
    const one = live.current; if (!one) return;
    try {
      assert(one); setProblem(''); let record = await protect(one); assert(one);
      if (operation === 'save') {
        if (record.fixed) throw new Error('fixed_request_requires_explicit_retry');
        const attempt = await one.writer.freeze(one.base, record.latestDraft.snapshotText, 'native2-preserve-test-1', record.latestDraft.generation); assert(one);
        record = await one.journal.fix(attempt); assert(one); remember(record);
      }
      const attempt = record.fixed; if (!attempt) throw new Error('native2_no_fixed_request');
      setStatus(operation === 'check' ? 'checking-receipt' : 'sending-fixed');
      const receipt = operation === 'check' ? await one.writer.checkReceipt(attempt) : await one.writer.send(attempt); assert(one);
      if (operation !== 'check') { record = await one.journal.observeDirect(attempt, receipt); assert(one); remember(record); }
      // A later real edit must be protected separately before an older generation is confirmed.
      record = await protect(one); assert(one);
      const proof = await one.writer.confirm(attempt, receipt, record.directRequestHash); assert(one);
      if (proof.status !== 'fixed-confirmed') { setStatus(proof.reason); return; }
      record = await one.journal.confirmFixed(proof); assert(one); remember(record);
      setStatus(record.latestDraft.generation === attempt.generation && record.latestDraft.snapshotText === attempt.snapshotText ? 'fixed-confirmed' : 'fixed-confirmed-later-draft-dirty');
    } catch (e) {
      error(e);
      if (!one.current()) { setStatus('revoked-unprotected-input-retained'); return; }
      try {
        const record = await protect(one); if (record.fixed && record.phase !== 'fixed-confirmed') remember(await one.journal.markUnknown(record.fixed));
        setStatus('unknown-or-unprotected');
      } catch (protectError) { error(protectError); setStatus('unprotected-input-retained'); }
    }
  };
  const showNested = async () => {
    const one = live.current; if (!one) return;
    try {
      await capture(one); assert(one);
      const resources = [...one.session.editor.dataStore.getNodes().values()].filter(node => node.stype === 'richText');
      const resource = resources.at(-1); if (!resource || typeof resource.sid !== 'string') throw new Error('Original last nested resource missing');
      let value = one.children.get(resource.sid);
      if (!value) { value = one.session.openChildResource(resource.sid); one.children.set(resource.sid, value); }
      child.current = value; setNested(value);
    } catch (e) { error(e); }
  };
  const leave = async () => {
    const one = live.current; if (!one) return;
    try {
      await protect(one); assert(one); writable.current = false; one.authority.editor.setEditable(false); owner.current++;
      setStatus('explicit-leave-protected-no-send'); setProblem('');
    } catch (e) { error(e); setStatus('leave-blocked-input-unprotected'); }
  };
  const activeSession = nested ?? shown;
  return <main className="scenario-standalone">
    <h1>Controlled native2 preserve: real editor and Storage; controlled identity/HTTP only</h1>
    <div>
      <button onClick={() => void perform('save')}>Save fixed request</button>
      <button onClick={() => void perform('check')}>Check receipt</button>
      <button onClick={() => void perform('retry')}>Retry fixed request</button>
      <button onClick={() => { const one = live.current; if (one) void protect(one).then(() => setStatus('latest-draft-protected')).catch(error); }}>Protect latest draft</button>
      <button onClick={() => void showNested()}>Show last nested resource</button>
      <button onClick={() => {
        const one = live.current; if (one) void capture(one).then(() => { child.current = undefined; setNested(undefined); }).catch(error);
      }}>Show parent</button>
      <button onClick={() => void leave()}>Leave after protecting input</button>
      <button onClick={() => { const one = live.current; if (one) { writable.current = false; one.authority.editor.setEditable(false); setStatus('revoked-unprotected-input-retained'); } }}>Revoke controlled role</button>
      <button onClick={() => { const editor = child.current?.editor ?? live.current?.session.editor; void editor?.undo(); }}>Undo local edit</button>
      <button onClick={() => { const editor = child.current?.editor ?? live.current?.session.editor; void editor?.redo(); }}>Redo local edit</button>
      {(['toggleBold', 'toggleItalic', 'toggleUnderline', 'toggleStrikeThrough'] as const).map(command => <button key={command}
        onMouseDown={event => event.preventDefault()} onClick={() => { void (child.current?.editor ?? live.current?.session.editor)?.executeCommand(command); }}>{command}</button>)}
      <button onClick={() => {
        const one = live.current, first = one?.session.editor.dataStore.getNode(one.session.rootId)?.content?.[0];
        if (one && typeof first === 'string') void one.session.editor.executeCommand('moveNoteBlockDown', { nodeId: first });
      }}>Move first block down</button>
    </div>
    <output data-testid="preserve-status">{status}</output>
    {problem && <p role="alert" data-testid="preserve-error">{problem}</p>}
    <div className="scenario-host" data-testid="native2-preserve-host" tabIndex={0} onInput={() => setStatus('local-dirty')}>
      {activeSession && <NoteEditor key={activeSession.session} editor={activeSession.editor} rootId={activeSession.rootId}
        registerBeforeSnapshot={delivery => { deliveries.current.set(activeSession, delivery); return () => { if (deliveries.current.get(activeSession) === delivery) deliveries.current.delete(activeSession); }; }} />}
    </div>
  </main>;
}
