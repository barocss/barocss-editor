import { useEffect, useRef, useState } from 'react';
import { createNoteNative2Context, openNoteNativeSnapshot, type NativeNoteSession, type NoteSession } from '@barocss/office-note';
import { NoteEditor } from '@barocss/office-note/view';
import { createExperimentalNative2NoteReader, type ExperimentalNative2Read } from './experimental-native2-reader';

export interface Native2TransportObservation {
  nativeDocument: ReturnType<NativeNoteSession['exportNativeDocument']>;
  snapshotText: string;
  sourceText: string;
  document: ExperimentalNative2Read['document'];
  model: ReturnType<NativeNoteSession['editor']['exportDocument']>;
  history: ReturnType<NativeNoteSession['editor']['getHistoryStats']>;
  selection: NativeNoteSession['editor']['selection'];
  editable: boolean;
  epoch: number;
  domRange?: { startNodeId: string; endNodeId: string; startOffset: number; endOffset: number; collapsed: boolean; text: string };
  childModel?: ReturnType<NoteSession['editor']['exportDocument']>;
  childHistory?: ReturnType<NoteSession['editor']['getHistoryStats']>;
}
declare global { interface Window { readNative2Transport?: () => Native2TransportObservation | undefined } }
const ids = { A: '33333333-3333-4333-8333-333333333333', A2: '33333333-3333-4333-8333-333333333333',
  B: '44444444-4444-4444-8444-444444444444', C: '55555555-5555-4555-8555-555555555555' } as const;
type Kind = keyof typeof ids;

/** Controlled diagnostic only: no ordinary application imports this private transport. */
export function Native2TransportScenario({ variant }: { variant: string }) {
  const initial: Kind = variant === 'B' || variant === 'A2' || variant === 'C' ? variant : 'A';
  const owner = useRef(0), mounted = useRef(false);
  const live = useRef<{ session: NativeNoteSession; read: ExperimentalNative2Read } | undefined>(undefined);
  const child = useRef<NoteSession | undefined>(undefined);
  const [opened, setOpened] = useState<typeof live.current>();
  const [nested, setNested] = useState<NoteSession>();
  const [problem, setProblem] = useState('');
  const [rejectedRaw, setRejectedRaw] = useState('');
  const [exported, setExported] = useState('');
  const [commandResult, setCommandResult] = useState('');
  const domRange = (session: NativeNoteSession) => {
    const selection = document.getSelection();
    if (!selection || selection.rangeCount !== 1) return undefined;
    const range = selection.getRangeAt(0);
    const point = (node: Node, offset: number) => {
      const element = (node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement);
      if (!(element instanceof Element)) return undefined;
      const leaf = element.closest('[data-bc-sid]');
      const sid = leaf?.getAttribute('data-bc-sid');
      if (!sid || !leaf || !leaf.closest('[data-testid="native2-transport-host"]')) return undefined;
      const model = session.editor.dataStore.getNode(sid);
      if (model?.stype !== 'inline-text' || typeof model.text !== 'string') return undefined;
      const prefix = document.createRange(); prefix.selectNodeContents(leaf); prefix.setEnd(node, offset);
      const position = prefix.toString().length;
      if (position > model.text.length) return undefined;
      return { sid, position };
    };
    const start = point(range.startContainer, range.startOffset), end = point(range.endContainer, range.endOffset);
    return start && end ? { startNodeId: start.sid, endNodeId: end.sid, startOffset: start.position,
      endOffset: end.position, collapsed: range.collapsed, text: selection.toString() } : undefined;
  };
  const load = async (kind: Kind) => {
    const captured = ++owner.current;
    const current = () => mounted.current && owner.current === captured;
    const reader = createExperimentalNative2NoteReader({
      tenantId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', workspaceId: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
      apiBase: '/controlled-native2', authorizedFetch: fetch, isCurrent: current });
    let provisional: NativeNoteSession | undefined;
    let raw = '';
    try {
      const read = await reader.open(ids[kind]); raw = read.snapshotText;
      if (!current()) return;
      provisional = openNoteNativeSnapshot(createNoteNative2Context(raw));
      // Intrinsic transport context never authorizes a writable native session.
      if (!current()) return;
      provisional.exportNativeDocument(); provisional.exportSnapshot();
      const previous = live.current;
      child.current?.close(); child.current = undefined; setNested(undefined);
      live.current = { session: provisional, read };
      setOpened(live.current); provisional = undefined;
      previous?.session.close();
      setProblem(''); setRejectedRaw(''); setExported('');
    } catch (error) {
      if (!mounted.current) return;
      const code = error && typeof error === 'object' && 'code' in error && typeof error.code === 'string'
        ? error.code : error instanceof Error ? error.message : 'native2_read_refused';
      if (owner.current === captured || code === 'stale_native2_context') {
        setProblem(code);
        if (raw) setRejectedRaw(raw);
      }
    } finally { provisional?.close(); }
  };
  useEffect(() => {
    mounted.current = true;
    window.readNative2Transport = () => {
      const one = live.current;
      if (!one) return undefined;
      return { nativeDocument: one.session.exportNativeDocument(), snapshotText: one.session.exportSnapshot(),
        sourceText: one.read.snapshotText, document: one.read.document, model: one.session.editor.exportDocument(),
        history: one.session.editor.getHistoryStats(), selection: one.session.editor.selection,
        editable: one.session.editor.isEditable, epoch: one.session.editor.dataStore.getDocumentEpoch(), domRange: domRange(one.session),
        ...(child.current ? { childModel: child.current.editor.exportDocument(), childHistory: child.current.editor.getHistoryStats() } : {}) };
    };
    void load(initial);
    return () => {
      mounted.current = false; owner.current++;
      child.current?.close(); child.current = undefined;
      live.current?.session.close(); live.current = undefined; delete window.readNative2Transport;
    };
  }, []);
  const openNested = () => {
    const one = live.current; if (!one) return;
    const resource = [...one.session.editor.dataStore.getNodes().values()].find(node => node.stype === 'richText');
    if (!resource || typeof resource.sid !== 'string') throw new Error('Original nested resource missing');
    child.current?.close();
    const value = one.session.openChildResource(resource.sid);
    child.current = value; setNested(value);
  };
  return <main className="scenario-standalone">
    <h1>Controlled native2 read transport; no server-saved or login claim</h1>
    <div>
      {(Object.keys(ids) as Kind[]).map(kind => <button key={kind} onClick={() => void load(kind)}>Open {kind}</button>)}
      <button onClick={() => { owner.current++; }}>Retire read owner</button>
      <button onClick={openNested} disabled={!opened}>Show nested resource</button>
      <button onClick={() => { child.current?.close(); child.current = undefined; setNested(undefined); }}>Show parent</button>
      <button onClick={() => { const one = live.current; if (one) setExported(one.session.exportSnapshot()); }}>Export readonly snapshot</button>
      <button onClick={() => {
        const one = live.current; if (!one) return;
        const replacement = openNoteNativeSnapshot(createNoteNative2Context(one.session.exportSnapshot()));
        child.current?.close(); child.current = undefined; setNested(undefined);
        live.current = { ...one, session: replacement }; setOpened(live.current); one.session.close();
      }}>Reopen readonly snapshot</button>
      {(['toggleBold', 'toggleItalic', 'toggleUnderline', 'toggleStrikeThrough'] as const).map(command =>
        <button key={command} onClick={async () => {
          const one = live.current; if (one) setCommandResult(String(await one.session.editor.executeCommand(command)));
        }}>Try readonly {command}</button>)}
      <button onClick={async () => {
        const one = live.current;
        const first = one?.session.editor.dataStore.getNode(one.session.rootId)?.content?.[0];
        if (!one || typeof first !== 'string') throw new Error('Original first block missing');
        setCommandResult(String(await one.session.editor.executeCommand('batchNoteBlocks:down', { nodeIds: [first] })));
      }}>Try readonly structure</button>
    </div>
    {problem && <p role="alert" data-testid="transport-error">{problem}</p>}
    <div data-testid="native2-transport-host" className="scenario-host" tabIndex={0}>
      {opened && <NoteEditor key={nested?.session ?? opened.session.session}
        editor={nested?.editor ?? opened.session.editor} rootId={nested?.rootId ?? opened.session.rootId} />}
    </div>
    <pre data-testid="transport-export">{exported}</pre>
    <pre data-testid="transport-rejected-raw">{rejectedRaw}</pre>
    <output data-testid="readonly-command-result">{commandResult}</output>
  </main>;
}
