import { StrictMode, useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { NativeNoteError, openNoteTree, createNoteNative2Context, openNoteNativeSnapshot, noteNodeTreeOf, type NoteSession, type NativeNoteSession } from '@barocss/office-note';
import { selectedNodeIds, type ModelSelection } from '@barocss/editor-core';
import { NoteEditor, type NoteInputDelivery } from '@barocss/office-note/view';
import { transaction } from '../../../packages/model/src/index';
import { NATIVE_NOTE_FIXTURES, NATIVE_B_VARIANTS } from './native2-scenario-fixtures';
import { copyNoteSnapshotFile } from '@barocss/office-note/file';
import './scenario.css';
import { Native2TransportScenario } from './native2-transport-scenario';
import { Native2PreserveScenario } from './native2-preserve-scenario';
import { Native2AdoptScenario } from './native2-adopt-scenario';
import { Native2EditableTargetScenario } from './native2-editable-target-scenario';

const paragraph = (text: string) => ({ stype: 'paragraph', content: [{ stype: 'inline-text', text }] });
const documents = {
  empty: [paragraph('')],
  text: [paragraph('Start')],
  'heading-gap': [paragraph(''), { stype: 'heading', attributes: { level: 1 }, content: [{ stype: 'inline-text', text: 'Title' }] }],
  divider: [paragraph('Before'), { stype: 'horizontalRule' }, paragraph('After')],
};

export interface ScenarioSnapshot {
  document: unknown;
  selection: unknown;
  selectedNodeIds: string[];
}
export interface NativeScenarioSnapshot {
  rawSource: string;
  selection?: ModelSelection | null;
  document?: unknown;
  nativeDocument?: unknown;
  snapshotText?: string;
  error?: string;
  selectedNodeIds: string[];
}

declare global {
  interface Window {
    /** Read-only diagnostics. Tests must perform edits through the rendered UI. */
    readNoteScenario?: () => ScenarioSnapshot;
    readNativeNoteScenario?: () => NativeScenarioSnapshot;
  }
}

const query = new URLSearchParams(location.search);
const caseName = query.get('case') ?? 'empty';
const fixture = documents[caseName as keyof typeof documents];
const nativeCase = caseName === 'native2-A' || caseName === 'native2-A2' || caseName === 'native2-B' || caseName === 'native2-C' || caseName === 'native2-B-bare';
const nativeTransportCase = /^native2-transport-(A|A2|B|C)$/.test(caseName);
const nativeEditableTargetCase = caseName === 'native2-editable-target-A';
const nativeAdoptCase = caseName === 'native2-adopt-A';
const nativePreserveCase = /^native2-preserve-(A|A2|B|C)$/.test(caseName);
if (!fixture && !nativeCase && !nativeTransportCase && !nativePreserveCase && !nativeAdoptCase && !nativeEditableTargetCase) throw new Error(`Unknown Note scenario: ${caseName}`);
const embedded = query.get('host') === 'embedded';

function ScenarioEditor() {
  const [session, setSession] = useState<NoteSession | null>(null);
  useEffect(() => {
    const opened = openNoteTree({ stype: 'note', content: fixture });
    window.readNoteScenario = () => ({
      document: opened.editor.exportDocument(),
      selection: opened.editor.selection,
      selectedNodeIds: selectedNodeIds(opened.editor.selection),
    });
    setSession(opened);
    return () => { delete window.readNoteScenario; opened.close(); };
  }, []);
  return <main className={embedded ? 'scenario-embedded' : 'scenario-standalone'}>
    <h1>Note editing scenario: {caseName}</h1>
    <div className="scenario-host" data-testid="note-scenario">
      {session && <NoteEditor editor={session.editor} rootId={session.rootId} />}
    </div>
  </main>;
}

function BareOriginalB() {
  const [session, setSession] = useState<NoteSession | null>(null);
  useEffect(() => {
    // Readonly legacy engine investigation; no native2 admission, export or storage claim.
    const one = openNoteTree(NATIVE_NOTE_FIXTURES.SOURCE_B.document, { nativeSource: true });
    setSession(one);
    window.readNativeNoteScenario = () => ({ rawSource: JSON.stringify(NATIVE_NOTE_FIXTURES.SOURCE_B, null, 2) + '\n', document: one.editor.exportDocument(), nativeDocument: noteNodeTreeOf(one.editor.dataStore, one.rootId), selectedNodeIds: [] });
    return () => { delete window.readNativeNoteScenario; one.close(); };
  }, []);
  return <main><p>Bare readonly original B engine diagnostic. No native2 save.</p><div data-testid="native2-bare-host">{session && <NoteEditor editor={session.editor} rootId={session.rootId} />}</div></main>;
}

function NativeScenarioEditor() {

  const input = caseName === 'native2-B' ? NATIVE_NOTE_FIXTURES.SOURCE_B : caseName === 'native2-A2' ? NATIVE_NOTE_FIXTURES.TARGET_A2 : NATIVE_NOTE_FIXTURES.SOURCE_A;
  let source = JSON.stringify(input, null, 2) + '\n';
  if (caseName === 'native2-C') {
    const copied = copyNoteSnapshotFile(JSON.stringify(NATIVE_NOTE_FIXTURES.SOURCE_A, null, 2) + '\n', 'native2-copy-A');
    if ('error' in copied) throw new Error(copied.error); source = copied.snapshotText;
  }
  const [session, setSession] = useState<NativeNoteSession | null>(null);
  const [failure, setFailure] = useState('');
  const [snapshot, setSnapshot] = useState('');
  const [nested, setNested] = useState(false);
  const [childSession, setChildSession] = useState<NoteSession | null>(null);
  const parent = useRef<NoteSession | null>(null);
  const delivery = useRef<NoteInputDelivery | undefined>(undefined);
  const live = useRef<NativeNoteSession | null>(null);
  const nestedLive = useRef<NoteSession | null>(null);
  const writes = useRef<Promise<boolean>>(Promise.resolve(true));
  useEffect(() => {
    const host = openNoteTree({ stype: 'note', content: [{ stype: 'paragraph', content: [{ stype: 'inline-text', text: 'Local diagnostic authority' }] }] });
    parent.current = host;
    let opened: NativeNoteSession | undefined;
    try { opened = openNoteNativeSnapshot(createNoteNative2Context(source), { authority: host.editor, after: 60000 }); live.current = opened; setSession(opened); }
    catch (error) { setFailure(String(error)); }
    window.readNativeNoteScenario = () => {
      const one = live.current;
      if (!one) return { rawSource: source, error: 'unsupported_native_editor', selectedNodeIds: [] };
      return { rawSource: source, document: one.editor.exportDocument(), nativeDocument: noteNodeTreeOf(one.editor.dataStore, one.rootId),
        snapshotText: one.exportSnapshot(), selection: one.editor.selection, selectedNodeIds: selectedNodeIds(one.editor.selection) };
    };
    return () => { delete window.readNativeNoteScenario; nestedLive.current?.close(); nestedLive.current = null; live.current = null; opened?.close(); host.close(); parent.current = null; };
  }, [source]);
  useEffect(() => {
    if (!nested || !session) { setChildSession(null); return; }
    const all = [...session.editor.dataStore.getNodes().values()];
    const resource = all.find(node => node.stype === 'richText' && node.attributes?.id === (caseName === 'native2-B' ? 'row-B-1' : 'row-A-2'));
    if (!resource?.sid) { setFailure('Captured authored nested body does not exist'); return; }
    const body = noteNodeTreeOf(session.editor.dataStore, resource.sid);
    if (!body || !Array.isArray(body.content)) { setFailure('Complete nested content required'); return; }
    const child = session.openChildResource(resource.sid);
    nestedLive.current = child; setChildSession(child);
    return () => { child.close(); if (nestedLive.current === child) nestedLive.current = null; };
  }, [nested, session]);
  const exportLatest = async () => {
    try {
      if (!live.current || delivery.current && !await delivery.current()) throw new Error('Input delivery not settled');
      nestedLive.current?.flush();
      if (nestedLive.current) {
        const resource = [...live.current.editor.dataStore.getNodes().values()].find(node => node.stype === 'richText' && node.attributes?.id === (caseName === 'native2-B' ? 'row-B-1' : 'row-A-2'));
        if (!resource?.sid) throw new Error('Captured authored resource is missing');
        writes.current = live.current.commitChildResource(resource.sid, nestedLive.current);
      }
      if (!await writes.current) throw new Error('Nested host delivery refused');
      live.current.flush(); setSnapshot(live.current.exportSnapshot()); setFailure(''); return true;
    } catch (error) { setFailure(error instanceof NativeNoteError ? `${error.code}: ${error.detail ?? ''}` : String(error)); return false; }
  };
  const reopen = async () => {
    if (!await exportLatest()) return;
    const current = live.current, authority = parent.current;
    if (!current || !authority) return;
    try {
      const text = current.exportSnapshot(); nestedLive.current?.close(); nestedLive.current = null; current.close();
      const opened = openNoteNativeSnapshot(createNoteNative2Context(text), { authority: authority.editor, after: 60000 });
      live.current = opened; setSession(opened); setNested(false); setFailure('');
    } catch (error) { setFailure(String(error)); }
  };
  return <main className="scenario-standalone">
    <h1>Native2 local engine diagnostic: {caseName}</h1>
    <p>Imported local fixture. No authenticated product save, schema adoption or renderer installation.</p>
    {failure && <p role="alert" data-testid="native2-error">{failure}</p>}
    <div>
      <button onClick={() => { void exportLatest(); }}>Export native snapshot</button>
      <button onClick={() => { void reopen(); }}>Reopen native snapshot</button>
      <button onClick={() => { void session?.editor.undo(); }}>Undo local edit</button>
      <button onClick={() => { void session?.editor.redo(); }}>Redo local edit</button>
      <button onClick={() => setNested(value => !value)}>Show nested resource</button>
      {caseName === 'native2-B' && <>
        <button onClick={() => {
          const one = live.current; if (!one) return;
          void transaction(one.editor, [{ type: 'addChild', payload: { parentId: one.rootId, child: NATIVE_B_VARIANTS['new-block'].document.content[1], position: 1 } }]).commit();
        }}>Insert B block</button>
        <button onClick={() => {
          const one = live.current; if (!one) return;
          const run = [...one.editor.dataStore.getNodes().values()].find(node => node.text === '검토 B');
          if (run?.parentId) void one.editor.executeCommand('moveNoteBlockDown', { nodeId: run.parentId });
        }}>Move original B block down</button>
        <button onClick={() => {
          const one = live.current; if (!one) return;
          const run = [...one.editor.dataStore.getNodes().values()].find(node => node.text === '보조 검토 B');
          if (run?.parentId) void transaction(one.editor, [{ type: 'removeChild', payload: { parentId: one.rootId, childId: run.parentId } }]).commit();
        }}>Delete B block</button>
      </>}
      <button onClick={() => {
        const one = live.current, content = one?.editor.dataStore.getNode(one.rootId)?.content;
        const first = content?.[0], second = content?.[1];
        if (one && typeof first === 'string' && typeof second === 'string') void one.editor.executeCommand('batchNoteBlocks:down', { nodeIds: [first, second] });
      }}>Move first pair down</button>
    </div>
    <div data-testid="native2-host">
      {session && (!nested || childSession) && <NoteEditor key={`${session.session}:${nested}`} editor={nested && childSession ? childSession.editor : session.editor} rootId={nested && childSession ? childSession.rootId : session.rootId}
        registerBeforeSnapshot={flush => { delivery.current = flush; return () => { if (delivery.current === flush) delivery.current = undefined; }; }} />}
    </div>
    <pre data-testid="native2-export">{snapshot}</pre>
    {!session && <pre data-testid="native2-retained-source">{source}</pre>}
  </main>;
}

// The embedded host uses a real frame, as the documentation preview does. Its
// editor remains content-sized; extra host whitespace must not hide menu bugs.
createRoot(document.getElementById('root')!).render(<StrictMode>
  {embedded && !query.has('frame')
    ? <iframe title="Embedded Note scenario" className="scenario-frame" src={`/scenarios.html?host=embedded&frame=1&case=${encodeURIComponent(caseName)}`} />
    : nativeEditableTargetCase ? <Native2EditableTargetScenario />
    : nativeAdoptCase ? <Native2AdoptScenario />
      : nativePreserveCase ? <Native2PreserveScenario variant={caseName.slice('native2-preserve-'.length)} />
      : nativeTransportCase ? <Native2TransportScenario variant={caseName.slice('native2-transport-'.length)} />
      : caseName === 'native2-B-bare' ? <BareOriginalB /> : nativeCase ? <NativeScenarioEditor /> : <ScenarioEditor />}
</StrictMode>);
