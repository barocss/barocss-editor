import { useEffect, useRef, useState } from "react";
import { Button } from "@toss/tds-mobile";
import { database } from "./database";
import { Formula } from "./Formula";
import { MathText } from "./MathText";
import { FormulaLesson } from "./FormulaLesson";
import { AnswerEditor } from "./AnswerEditor";
import { isCorrect } from "./game";
import { advanceDerivation } from "./derivations";
const definition = database.getDerivation("pythagorean-area")!;
const questions = database.getDerivationQuestions(definition.id);
const symbols = questions[0].formula.variables.map((v) => v.symbol);
export function DerivationPlayer({
  answers,
  onChange,
}: {
  answers: string[];
  onChange: (answers: string[]) => void;
}) {
  const [answer, setAnswer] = useState("");
  const [feedback, setFeedback] = useState<"correct" | "wrong">();
  const [hint, setHint] = useState(false);
  const currentHeading = useRef<HTMLHeadingElement>(null);
  const question = questions[answers.length];
  useEffect(() => {
    currentHeading.current?.focus();
  }, [answers.length]);
  function persist(next: string[]) {
    onChange(next);
  }
  function next() {
    if (feedback !== "correct") return;
    persist(advanceDerivation(questions, answers, answer));
    setAnswer("");
    setFeedback(undefined);
    setHint(false);
  }
  return (
    <section className="derivation-screen enter">
      <div className="eyebrow">한 줄씩 유도하기 · 넓이로 알아보기</div>
      <h1>{definition.title}</h1>
      <p className="description">
        <MathText symbols={symbols}>{definition.introduction}</MathText>
      </p>
      <figure className="proof-diagram">
        <svg
          viewBox="-24 -24 255 250"
          role="img"
          aria-label="한 변이 a+b인 정사각형 안에 같은 직각삼각형 네 개를 놓으면 한 변이 c인 정사각형이 남아요"
        >
          <rect
            width="200"
            height="200"
            fill="#eaf2ff"
            stroke="#3182f6"
            strokeWidth="2"
          />
          <polygon
            points="60,0 200,60 140,200 0,140"
            fill="#3182f6"
            stroke="white"
            strokeWidth="2"
          />
          <text x="100" y="108" fill="white" textAnchor="middle">
            가운데 넓이 c²
          </text>
          <text x="30" y="-9" textAnchor="middle">
            a
          </text>
          <text x="130" y="-9" textAnchor="middle">
            b
          </text>
          <text x="217" y="30" textAnchor="middle">
            a
          </text>
          <text x="217" y="130" textAnchor="middle">
            b
          </text>
          <text x="129" y="51" fill="white">
            c
          </text>
          <path
            d="M0 12 H12 V0 M188 0 V12 H200 M200 188 H188 V200 M12 200 V188 H0"
            fill="none"
            stroke="#6b7684"
          />
        </svg>
        <figcaption>
          <MathText symbols={symbols}>
            {"a, b는 양수예요. 가운데 도형의 네 변은 모두 c예요. 이웃한 두 삼각형의 예각 합이 90°이므로 가운데 각도 모두 90°예요."}
          </MathText>
        </figcaption>
      </figure>
      <div className="progress-meta">
        <span>완성한 줄</span>
        <strong>
          {answers.length} / {questions.length}
        </strong>
      </div>
      {answers.length > 0 && (
        <ol className="proof-completed" aria-label="완성한 풀이">
          {answers.map((a, i) => (
            <li key={questions[i].id}>
              <span>{questions[i].title}</span>
              <div className="lesson-equation">
                <Formula
                  value={
                    questions[i].before +
                    (questions[i].before.endsWith("-")
                      ? `\\left(${a}\\right)`
                      : a)
                  }
                />
              </div>
            </li>
          ))}
        </ol>
      )}
      {question ? (
        <div className="proof-current">
          <div className="eyebrow">{answers.length + 1}번째 줄</div>
          <h2 ref={currentHeading} tabIndex={-1}>
            {question.title}
          </h2>
          <p className="catalog-note">
            {answers.length === 0
              ? "괄호를 풀고 같은 항끼리 모은 식을 입력해요."
              : "빈칸에 들어갈 식을 입력해요."}
          </p>
          <div className="proof-equation">
            <Formula value={question.before} />
            <span className="proof-blank">
              {answer ? (
                <Formula
                  value={
                    question.before.endsWith("-")
                      ? `\\left(${answer}\\right)`
                      : answer
                  }
                />
              ) : (
                "?"
              )}
            </span>
          </div>
          {feedback !== "correct" && (
            <>
              <button
                className="hint-button"
                aria-expanded={hint}
                onClick={() => setHint(!hint)}
              >
                {hint ? "힌트 닫기" : "힌트 보기"}
              </button>
              {hint && (
                <p className="hint">
                  <MathText symbols={symbols}>{question.hint}</MathText>
                </p>
              )}
              <AnswerEditor
                key={question.id}
                profile={question.inputProfile}
                onChange={(value) => {
                  setAnswer(value);
                  setFeedback(undefined);
                }}
              />
            </>
          )}
          <div aria-live="polite">
            {feedback === "wrong" && (
              <p className="hint">식을 다시 확인해 주세요.</p>
            )}
            {feedback === "correct" && (
              <div className="proof-success">
                <strong>이 줄을 완성했어요.</strong>
                <p>
                  <MathText symbols={symbols}>{question.explanation}</MathText>
                </p>
              </div>
            )}
          </div>
          <Button
            size="xlarge"
            display="block"
            disabled={!answer.trim()}
            onClick={
              feedback === "correct"
                ? next
                : () =>
                    setFeedback(
                      isCorrect(question, answer) ? "correct" : "wrong",
                    )
            }
          >
            {feedback === "correct"
              ? answers.length === questions.length - 1
                ? "완성한 유도 보기"
                : "다음 줄 열기"
              : "이 줄 확인"}
          </Button>
          <p className="footer-note">
            {answers.length === questions.length - 1
              ? "완성한 유도를 볼 때 저장돼요."
              : "다음 줄을 열 때 저장돼요."}
          </p>
        </div>
      ) : (
        <section className="proof-success">
          <h2 ref={currentHeading} tabIndex={-1}>
            유도 완료
          </h2>
          <FormulaLesson formula={questions[0].formula} />
        </section>
      )}
      {answers.length > 0 && (
        <button
          className="text-button"
          onClick={() => {
            persist([]);
            setAnswer("");
            setFeedback(undefined);
            setHint(false);
          }}
        >
          처음부터 다시 유도하기
        </button>
      )}
    </section>
  );
}
