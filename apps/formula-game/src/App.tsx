import { useEffect, useState } from "react";
import { Button } from "@toss/tds-mobile";
import { Formula } from "./Formula";
import { AnswerEditor } from "./AnswerEditor";
import {
  isCorrect,
  getRound,
  recordAttempts,
  writeProgress,
  type Attempt,
  type Question,
} from "./game";
import { catalog, database } from "./database";
import { difficulties } from "./content/catalog";
import { DerivationPlayer } from "./DerivationPlayer";
import { Home } from "./Home";
import { PresetManager } from "./PresetManager";
import {
  writePresets,
  upsertPreset,
  removePreset,
  presetQuestions,
  type StudyPreset,
  type PresetState,
} from "./presets";
import { recordSeen, recordAnswer, writeHistory } from "./history";
import { HistoryLibrary } from "./HistoryLibrary";
import { FormulaLesson } from "./FormulaLesson";
import "./App.css";

import type { LearningState } from "./learning-state";
import { derivationStorageKey, writeDerivation } from "./derivations";

export default function App({ initial }: { initial: LearningState }) {
  const [screen, setScreen] = useState<
    "home" | "play" | "result" | "library" | "sets" | "derive"
  >("home");
  const viewerId = initial.viewerId;
  const [history, setHistory] = useState(initial.history);
  const [historySaved, setHistorySaved] = useState(true);
  function remember(q: Question, attempt?: Attempt) {
    const next = attempt
      ? recordAnswer(history, q, attempt)
      : recordSeen(history, q);
    setHistory(next);
    void writeHistory(viewerId, next).then(setHistorySaved);
  }
  const [round, setRound] = useState<readonly Question[]>([]);
  const [index, setIndex] = useState(0);
  const [answer, setAnswer] = useState("");
  const [attempts, setAttempts] = useState<Attempt[]>([]);
  const [checked, setChecked] = useState(false);
  const [hinted, setHinted] = useState(false);
  const [progress, setProgress] = useState(initial.progress);
  const [progressSaved, setProgressSaved] = useState(true);
  const [derivations, setDerivations] = useState(initial.derivations);
  const [derivationSaved, setDerivationSaved] = useState(true);
  function persistDerivation(id: string, answers: string[]) {
    const definition = database.getDerivation(id)!;
    const questions = database.getDerivationQuestions(id);
    setDerivations((previous) => ({ ...previous, [id]: answers }));
    const key = derivationStorageKey(
      viewerId,
      definition,
      questions[0].formula.revision,
    );
    void writeDerivation(key, answers).then(setDerivationSaved);
  }
  const [review, setReview] = useState(false);
  const [presets, setPresets] = useState(initial.presets);
  const [presetsSaved, setPresetsSaved] = useState(true);
  const [deleted, setDeleted] = useState<StudyPreset>();
  const [manager, setManager] = useState<{ id?: string; visit: number }>({
    visit: 0,
  });
  const [activePreset, setActivePreset] = useState<StudyPreset>();
  const nextCount = activePreset
    ? getRound(
        presetQuestions(catalog, activePreset),
        activePreset.count,
        activePreset.mode,
        progress,
      ).length
    : 0;
  function persistPresets(next: PresetState) {
    setPresets(next);
    void writePresets(viewerId, next).then(setPresetsSaved);
  }
  function openSets(id?: string) {
    setManager({ id, visit: manager.visit + 1 });
    setScreen("sets");
  }
  function startPreset(p: StudyPreset) {
    const next = getRound(
      presetQuestions(catalog, p),
      p.count,
      p.mode,
      progress,
    );
    if (!next.length) return;
    setActivePreset(p);
    persistPresets({ ...presets, lastUsedId: p.id });
    start(next, p.mode === "review");
  }
  const [usedHint, setUsedHint] = useState(false);
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [screen, index]);
  const question = round[index];
  const score = attempts.filter((attempt) => attempt.correct).length;
  const correct = checked && attempts[attempts.length - 1]?.correct;
  function start(next: readonly Question[], isReview = false) {
    if (!next.length) return;
    remember(next[0]);
    setReview(isReview);
    setUsedHint(false);
    setRound(next);
    setIndex(0);
    setAnswer("");
    setAttempts([]);
    setChecked(false);
    setHinted(false);
    setScreen("play");
  }
  function check() {
    if (!answer.trim() || checked) return;
    const attempt = {
      questionId: question.id,
      answer,
      correct: isCorrect(question, answer),
      hinted: usedHint,
    };
    setAttempts((previous) => [...previous, attempt]);
    remember(question, attempt);
    setChecked(true);
  }
  function next() {
    if (index === round.length - 1) {
      const nextProgress = recordAttempts(round, attempts, progress);
      setProgress(nextProgress);
      void writeProgress(nextProgress).then(setProgressSaved);
      setScreen("result");
    } else {
      remember(round[index + 1]);
      setIndex(index + 1);
      setAnswer("");
      setChecked(false);
      setHinted(false);
      setUsedHint(false);
    }
  }
  const missed = round.filter((q) =>
    attempts.some((a) => a.questionId === q.id && (!a.correct || a.hinted)),
  );
  return (
    <main className="app-shell">
      <header className="app-header">
        {screen === "home" ? (
          <span className="brand-symbol" aria-hidden="true">
            ƒ
          </span>
        ) : (
          <button
            className="back-button"
            aria-label="처음으로"
            onClick={() => setScreen("home")}
          >
            ‹
          </button>
        )}
        <span className="brand-name">공식 한 칸</span>
      </header>
      {!presetsSaved && (
        <p className="history-warning" role="status">
          학습을 저장하지 못했어요. 앱을 닫기 전에 다시 저장해 주세요.
          <button onClick={() => persistPresets(presets)}>다시 저장</button>
        </p>
      )}
      {deleted && (screen === "home" || screen === "sets") && (
        <div className="undo-preset" role="status">
          학습을 삭제했어요. 풀이 기록은 남아 있어요.
          <button
            onClick={() => {
              persistPresets(upsertPreset(presets, deleted));
              setDeleted(undefined);
            }}
          >
            되돌리기
          </button>
        </div>
      )}
      {screen === "sets" && (
        <PresetManager
          key={manager.visit}
          initial={manager.id}
          state={presets}
          progress={progress}
          onSave={(p) => {
            persistPresets(upsertPreset(presets, p));
            setDeleted(undefined);
          }}
          onDelete={(id) => {
            setDeleted(presets.items.find((p) => p.id === id));
            persistPresets(removePreset(presets, id));
          }}
          onStart={startPreset}
        />
      )}
      {!historySaved && (
        <p role="status" className="history-warning">
          기록을 저장하지 못했어요. 앱을 닫기 전에 다시 저장해 주세요.
          <button
            onClick={() =>
              void writeHistory(viewerId, history).then(setHistorySaved)
            }
          >
            다시 저장
          </button>
        </p>
      )}
      {screen === "library" && (
        <HistoryLibrary
          history={history}
          questions={database.listQuestions()}
          onRetry={(q) => {
            setActivePreset(undefined);
            start([q], true);
          }}
        />
      )}
      {!progressSaved && (
        <p className="history-warning" role="status">
          풀이 결과를 저장하지 못했어요.
          <button
            onClick={() => void writeProgress(progress).then(setProgressSaved)}
          >
            다시 저장
          </button>
        </p>
      )}
      {!derivationSaved && (
        <p className="history-warning" role="status">
          유도 진행 상황을 저장하지 못했어요.
          <button
            onClick={() =>
              persistDerivation(
                "pythagorean-area",
                derivations["pythagorean-area"],
              )
            }
          >
            다시 저장
          </button>
        </p>
      )}
      {screen === "derive" && (
        <DerivationPlayer
          answers={derivations["pythagorean-area"] ?? []}
          onChange={(answers) => persistDerivation("pythagorean-area", answers)}
        />
      )}
      {screen === "home" && (
        <Home
          state={presets}
          progress={progress}
          seenCount={Object.keys(history).length}
          onOpen={openSets}
          onStart={startPreset}
          onLibrary={() => setScreen("library")}
          onDerive={() => setScreen("derive")}
        />
      )}
      {screen === "play" && (
        <div className="play-screen">
          <div className="progress-meta">
            <span>
              {difficulties.find((d) => d.id === question.difficulty)?.name} ·{" "}
              {review ? "복습" : question.formula.title}
            </span>
            <span>
              <strong>{index + 1}</strong> / {round.length}
            </span>
          </div>
          <div
            className="progress-track"
            role="progressbar"
            aria-label="문제 진행"
            aria-valuenow={index + 1}
            aria-valuemin={0}
            aria-valuemax={round.length}
          >
            <div style={{ width: `${((index + 1) / round.length) * 100}%` }} />
          </div>
          <section key={question.id} className="question enter">
            <div className="eyebrow">
              {String(index + 1).padStart(2, "0")} · {question.title}
            </div>
            <h1>{question.condition}</h1>
            <p className="question-instruction">
              빈칸에 들어갈 식을 입력해 주세요.
            </p>
            <div
              className={`question-equation ${checked ? (correct ? "is-correct" : "is-wrong") : ""}`}
            >
              <Formula value={question.before} />
              <button
                className="answer-slot"
                aria-label="공식의 빈칸"
                onClick={() =>
                  document.querySelector<HTMLElement>(".editor-field")?.click()
                }
                disabled={checked}
              >
                {answer ? (
                  <Formula value={answer} />
                ) : (
                  <span className="slot-question">?</span>
                )}
              </button>
              {question.after && <Formula value={question.after} />}
            </div>
          </section>
          {!checked ? (
            <>
              <button
                className="hint-button"
                onClick={() => {
                  setHinted(!hinted);
                  setUsedHint(true);
                }}
                aria-expanded={hinted}
              >
                <span aria-hidden="true">✧</span>{" "}
                {hinted ? "힌트 닫기" : "힌트 보기"}
              </button>
              {hinted && <p className="hint enter">{question.hint}</p>}
              <AnswerEditor
                key={question.id}
                profile={question.inputProfile}
                onChange={setAnswer}
              />
              <div className="bottom-action">
                <Button
                  size="xlarge"
                  display="block"
                  disabled={!answer.trim()}
                  onClick={check}
                >
                  정답 확인
                </Button>
              </div>
            </>
          ) : (
            <section className="feedback enter" aria-live="polite">
              <div className="feedback-mark" aria-hidden="true">
                {correct ? "✓" : "↗"}
              </div>
              <h2>{correct ? "정답이에요" : "정답을 확인해 주세요"}</h2>
              {!correct && (
                <div className="correct-answer">
                  빈칸의 정답 <Formula value={question.grading.answer} />
                </div>
              )}
              <p>{question.explanation}</p>
              <details className="feedback-lesson">
                <summary>공식 원리와 배경 읽기</summary>
                <FormulaLesson formula={question.formula} />
              </details>
              <Button size="xlarge" display="block" onClick={next}>
                {index === round.length - 1 ? "결과 보기" : "다음 공식"}
              </Button>
            </section>
          )}
        </div>
      )}
      {screen === "result" && (
        <div className="result-screen enter">
          <div className="eyebrow">
            {round.length}문제 · {review ? "복습 완료" : "연습 완료"}
          </div>
          <h1>
            {score === round.length ? (
              <>
                이번 문제를
                <br />
                모두 맞혔어요!
              </>
            ) : (
              "풀이 완료"
            )}
          </h1>
          <div className="score-circle">
            <span>
              <strong>{score}</strong>
              <span> / {round.length}</span>
            </span>
            <small>맞힌 문제</small>
          </div>
          <p className="result-note">
            {attempts.filter((item) => item.hinted).length
              ? `힌트 사용 ${attempts.filter((item) => item.hinted).length}문제`
              : "힌트 없이 끝까지 풀었어요."}
          </p>
          <div className="result-list">
            {round.map((q, i) => (
              <div key={q.id} className="result-row">
                <span
                  className={`result-icon ${attempts[i]?.correct ? "correct" : ""}`}
                >
                  {attempts[i]?.correct ? "✓" : "↗"}
                </span>
                <span>{q.title}</span>
                <span>
                  {attempts[i]?.hinted
                    ? "힌트 사용"
                    : attempts[i]?.correct
                      ? "정답"
                      : "다시 익히기"}
                </span>
              </div>
            ))}
          </div>
          <button
            className="library-entry"
            onClick={() => setScreen("library")}
          >
            본 문제와 공식 해설 보기 →
          </button>
          <div className="result-actions">
            {activePreset && (
              <Button
                size="xlarge"
                display="block"
                disabled={!nextCount}
                onClick={() => startPreset(activePreset)}
              >
                {nextCount
                  ? `이 학습에서 다음 ${nextCount}문제`
                  : "이 목록의 복습을 마쳤어요"}
              </Button>
            )}
            {missed.length > 0 && (
              <button className="add-scope" onClick={() => start(missed, true)}>
                복습할 {missed.length}문제 다시 풀기
              </button>
            )}
            <button className="library-entry" onClick={() => openSets()}>
              다른 학습 고르기 →
            </button>
            <button className="text-button" onClick={() => setScreen("home")}>
              처음으로
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
