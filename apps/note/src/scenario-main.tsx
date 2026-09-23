import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { openNoteTree, type NoteSession } from '@barocss/office-note';
import { selectedNodeIds } from '@barocss/editor-core';
import { NoteEditor } from '@barocss/office-note/view';
import './scenario.css';

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

declare global {
  interface Window {
    /** Read-only diagnostics. Tests must perform edits through the rendered UI. */
    readNoteScenario?: () => ScenarioSnapshot;
  }
}

const query = new URLSearchParams(location.search);
const caseName = query.get('case') ?? 'empty';
const fixture = documents[caseName as keyof typeof documents];
if (!fixture) throw new Error(`Unknown Note scenario: ${caseName}`);
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

// The embedded host uses a real frame, as the documentation preview does. Its
// editor remains content-sized; extra host whitespace must not hide menu bugs.
createRoot(document.getElementById('root')!).render(<StrictMode>
  {embedded && !query.has('frame')
    ? <iframe title="Embedded Note scenario" className="scenario-frame" src={`/scenarios.html?host=embedded&frame=1&case=${encodeURIComponent(caseName)}`} />
    : <ScenarioEditor />}
</StrictMode>);
