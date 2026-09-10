import { useEffect, useState } from "react";
import { Button } from "@toss/tds-mobile";
import type { History } from "./history";
import type { PlayQuestion } from "./content/types";
import { Formula } from "./Formula";
import { FormulaLesson } from "./FormulaLesson";
const date = (value: number) =>
  new Date(value).toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
export function HistoryLibrary({
  history,
  questions,
  onRetry,
}: {
  history: History;
  questions: readonly PlayQuestion[];
  onRetry: (q: PlayQuestion) => void;
}) {
  const [query, setQuery] = useState(""),
    [filter, setFilter] = useState("all"),
    [selected, setSelected] = useState<string>();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [selected]);
  const entry = selected ? history[selected] : undefined;
  if (entry) {
    const q = entry.question,
      current = questions.find((item) => item.id === q.id);
    return (
      <section className="library-screen enter">
        <button className="text-button" onClick={() => setSelected(undefined)}>
          ‹ 본 문제 목록
        </button>
        <div className="eyebrow">{date(entry.firstSeen)} 처음 본 문제</div>
        <h1>{q.title}</h1>
        <p className="question-instruction">{q.condition}</p>
        <div className="lesson-equation">
          <Formula value={q.before} />
          <span className="history-blank">?</span>
          <Formula value={q.after} />
        </div>
        {entry.lastAttempt ? (
          <div className="saved-answer">
            <strong>
              마지막 답안 · {entry.lastAttempt.correct ? "정답" : "오답"}
              {entry.lastAttempt.hinted ? " · 힌트 사용" : ""}
            </strong>
            <Formula value={entry.lastAttempt.answer} />
          </div>
        ) : (
          <p className="catalog-note">아직 정답을 확인하지 않은 문제예요.</p>
        )}
        <details className="saved-solution">
          <summary>정답과 문제 해설 보기</summary>
          <div className="lesson-equation">
            <Formula value={q.answer} />
          </div>
          <p>{q.explanation}</p>
        </details>
        <FormulaLesson formula={q.formula} />
        {current ? (
          <>
            <Button
              size="xlarge"
              display="block"
              onClick={() => onRetry(current)}
            >
              이 문제 다시 풀기
            </Button>
            {(current.revision !== q.revision ||
              current.formula.revision !== q.formula.revision) && (
              <p className="catalog-note">
                당시 본 내용을 표시했어요. 다시 풀면 현재 버전으로 시작해요.
              </p>
            )}
          </>
        ) : (
          <p className="catalog-note">
            현재 출제에서 제외된 문제예요. 저장된 내용과 해설은 계속 볼 수
            있어요.
          </p>
        )}
      </section>
    );
  }
  const entries = Object.values(history)
    .sort((a, b) => b.lastSeen - a.lastSeen)
    .filter((e) => {
      const matches = `${e.question.title} ${e.question.formula.title}`
        .toLowerCase()
        .includes(query.trim().toLowerCase());
      return (
        matches &&
        (filter === "all" ||
          (filter === "unanswered"
            ? !e.lastAttempt
            : filter === "correct"
              ? e.lastAttempt?.correct
              : e.lastAttempt && !e.lastAttempt.correct))
      );
    });
  return (
    <section className="library-screen enter">
      <h1>내가 본 문제</h1>
      <label className="history-search">
        문제·공식 찾기
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="예: 피타고라스"
        />
      </label>
      <div className="round-modes" role="group" aria-label="본 문제 필터">
        {[
          ["all", "전체"],
          ["unanswered", "미풀이"],
          ["wrong", "오답"],
          ["correct", "정답"],
        ].map(([id, name]) => (
          <button
            key={id}
            aria-pressed={filter === id}
            onClick={() => setFilter(id)}
          >
            {name}
          </button>
        ))}
      </div>
      <p className="catalog-note">{entries.length}문제 · 최근 본 순서</p>
      {entries.length ? (
        <div className="history-list">
          {entries.map((e) => (
            <button
              key={e.key}
              className="history-card"
              onClick={() => setSelected(e.key)}
            >
              <span className="history-card-meta">
                {e.question.formula.title} · {date(e.lastSeen)}
              </span>
              <strong>{e.question.title}</strong>
              <span>
                {e.lastAttempt
                  ? e.lastAttempt.correct
                    ? "정답"
                    : "오답"
                  : "미풀이"}
                {e.lastAttempt?.hinted ? " · 힌트 사용" : ""}
                <span aria-hidden="true"> · 해설 읽기 →</span>
              </span>
            </button>
          ))}
        </div>
      ) : (
        <div className="catalog-empty">
          {Object.keys(history).length
            ? "검색 조건에 맞는 문제가 없어요."
            : "아직 본 문제가 없어요."}
        </div>
      )}
      <p className="catalog-note">이 기기에만 저장</p>
    </section>
  );
}
