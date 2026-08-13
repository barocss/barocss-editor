import { useCallback, useMemo, useRef, useState } from 'react';
import { InputRecorder, type Report } from './recorder';
import { SCENARIOS, type Scenario } from './scenarios';

/**
 * The scenario list, and the button that records one.
 *
 * Two things about this panel matter more than how it looks.
 *
 * The first is that nothing in it may take the caret. A reader puts the caret
 * where the scenario says, reaches over here to press start, and types — and if
 * pressing start moved the caret, every recording would be of the wrong place.
 * So every control refuses focus on mousedown, which leaves the document's
 * selection exactly where the reader left it.
 *
 * The second is that a recording is worth nothing if it has to be described
 * afterwards. Each one goes to disk whole — timeline, before and after text, and
 * the verdict — so it can be read as evidence rather than recalled.
 */

type Saved = { report: Report; savedAs?: string; error?: string };

const keepCaret = (event: React.MouseEvent) => event.preventDefault();

async function save(report: Report): Promise<{ savedAs?: string; error?: string }> {
  try {
    const response = await fetch('/__input-lab', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(report)
    });
    if (!response.ok) return { error: `${response.status} ${response.statusText}` };
    const body = await response.json();
    return { savedAs: body.file };
  } catch (error) {
    return { error: String(error) };
  }
}

function Verdict({ report }: { report: Report }) {
  const bugs = report.findings.filter((finding) => finding.severity === 'bug');
  const suspects = report.findings.filter((finding) => finding.severity === 'suspect');
  if (report.findings.length === 0) {
    return <p className="lab-verdict lab-ok">이상 없음 — 문서와 화면이 같고, 친 대로 들어갔습니다.</p>;
  }
  return (
    <div className="lab-verdict">
      {bugs.map((finding, index) => (
        <p key={`bug-${index}`} className="lab-bug">
          <strong>{finding.what}</strong>
          <span>{finding.detail}</span>
        </p>
      ))}
      {suspects.map((finding, index) => (
        <p key={`suspect-${index}`} className="lab-suspect">
          <strong>{finding.what}</strong>
          <span>{finding.detail}</span>
        </p>
      ))}
    </div>
  );
}

function ScenarioCard({
  scenario,
  active,
  saved,
  onStart,
  onStop
}: {
  scenario: Scenario;
  active: boolean;
  saved: Saved | undefined;
  onStart: (scenario: Scenario) => void;
  onStop: () => void;
}) {
  return (
    <li className={`lab-card${active ? ' lab-card-active' : ''}`}>
      <div className="lab-card-head">
        <h3>{scenario.title}</h3>
        <button
          type="button"
          className={active ? 'lab-stop' : 'lab-start'}
          onMouseDown={keepCaret}
          onClick={() => (active ? onStop() : onStart(scenario))}
        >
          {active ? '완료' : '시작'}
        </button>
      </div>
      <dl>
        <dt>어디</dt>
        <dd>{scenario.where}</dd>
        <dt>무엇을</dt>
        <dd>{scenario.does}</dd>
        <dt>이렇게 되어야</dt>
        <dd>{scenario.expects}</dd>
      </dl>
      <p className="lab-why">{scenario.hunting}</p>
      {saved && (
        <div className="lab-result">
          <Verdict report={saved.report} />
          <p className="lab-saved">
            {saved.savedAs
              ? `기록 저장: ${saved.savedAs}`
              : `기록을 저장하지 못했습니다: ${saved.error ?? '알 수 없음'}`}
          </p>
        </div>
      )}
    </li>
  );
}

export function InputLab({ editor, view }: { editor: any; view: any }) {
  const [open, setOpen] = useState(true);
  const [active, setActive] = useState<Scenario | null>(null);
  const [saved, setSaved] = useState<Record<string, Saved>>({});
  const recorder = useRef<InputRecorder | null>(null);

  const groups = useMemo(() => {
    const byGroup = new Map<string, Scenario[]>();
    for (const scenario of SCENARIOS) {
      const list = byGroup.get(scenario.group) ?? [];
      list.push(scenario);
      byGroup.set(scenario.group, list);
    }
    return Array.from(byGroup);
  }, []);

  const start = useCallback(
    (scenario: Scenario) => {
      recorder.current ??= new InputRecorder(editor, view);
      recorder.current.start(scenario);
      setActive(scenario);
    },
    [editor, view]
  );

  const stop = useCallback(async () => {
    if (!recorder.current || !active) return;
    const report = recorder.current.stop();
    // The last recording, reachable without the network round trip — for a
    // browser test asserting the recorder saw what was typed, and for reading in
    // the console when the dev server is not the one holding the file.
    (window as any).__lastLabReport = report;
    setActive(null);
    setSaved((previous) => ({ ...previous, [report.scenario]: { report } }));
    const outcome = await save(report);
    setSaved((previous) => ({ ...previous, [report.scenario]: { report, ...outcome } }));
  }, [active]);

  if (!open) {
    return (
      <button type="button" className="lab-reopen" onMouseDown={keepCaret} onClick={() => setOpen(true)}>
        입력 시나리오
      </button>
    );
  }

  return (
    <aside className="lab" aria-label="입력 시나리오">
      <header className="lab-head">
        <div>
          <h2>입력 시나리오</h2>
          <p>
            커서를 “어디”에 둔 다음 <strong>시작</strong>을 누르고, 손으로 치고, <strong>완료</strong>를 누르세요.
            버튼은 커서를 가져가지 않습니다.
          </p>
        </div>
        <button type="button" className="lab-close" onMouseDown={keepCaret} onClick={() => setOpen(false)}>
          닫기
        </button>
      </header>
      {active && (
        <p className="lab-recording" role="status">
          기록 중 — <strong>{active.title}</strong>
        </p>
      )}
      {groups.map(([group, scenarios]) => (
        <section key={group}>
          <h4>{group}</h4>
          <ul>
            {scenarios.map((scenario) => (
              <ScenarioCard
                key={scenario.id}
                scenario={scenario}
                active={active?.id === scenario.id}
                saved={saved[scenario.id]}
                onStart={start}
                onStop={stop}
              />
            ))}
          </ul>
        </section>
      ))}
    </aside>
  );
}
