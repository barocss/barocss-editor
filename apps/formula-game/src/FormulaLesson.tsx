import { useState } from "react";
import type { FormulaDefinition } from "./content/types";
import { Formula } from "./Formula";
function PythagoreanArea() {
  const [a, setA] = useState(3),
    b = 10 - a;
  const x = a * 20,
    y = b * 20;
  return (
    <figure className="area-demo">
      <svg
        viewBox="-25 -30 255 260"
        role="img"
        aria-label="큰 정사각형 안의 직각삼각형 네 개와 가운데 정사각형"
      >
        <rect
          width="200"
          height="200"
          fill="#eaf2ff"
          stroke="#3182f6"
          strokeWidth="2"
        />
        <polygon
          points={`${x},0 200,${x} ${y},200 0,${y}`}
          fill="#3182f6"
          stroke="white"
          strokeWidth="2"
        />
        <text x="100" y="108" textAnchor="middle" fill="white" fontSize="25">
          c²
        </text>
        <text x={x / 2} y="-10" textAnchor="middle">
          a
        </text>
        <text x={(x + 200) / 2} y="-10" textAnchor="middle">
          b
        </text>
        <text x="218" y={x / 2} textAnchor="middle">
          a
        </text>
        <text x="218" y={(x + 200) / 2} textAnchor="middle">
          b
        </text>
        <path
          d="M 0 12 H 12 V 0 M 188 0 V 12 H 200 M 200 188 H 188 V 200 M 12 200 V 188 H 0"
          fill="none"
          stroke="#6b7684"
        />
      </svg>
      <label>
        a의 길이{" "}
        <input
          aria-label="a의 길이"
          type="range"
          min="2"
          max="8"
          step="1"
          value={a}
          onChange={(e) => setA(Number(e.target.value))}
        />
      </label>
      <figcaption aria-live="polite">
        a = {a}, b = {b}
        <br />큰 정사각형 100 − 삼각형 네 개 {2 * a * b} = 가운데 넓이{" "}
        {a * a + b * b}
      </figcaption>
      <p>
        길이를 바꿔도 가운데 넓이는 a²+b²예요. 가운데 도형의 각은 삼각형의 두
        예각을 180°에서 뺀 90°예요.
      </p>
    </figure>
  );
}
export function FormulaLesson({ formula }: { formula: FormulaDefinition }) {
  const lesson = formula.lesson;
  return (
    <article className="formula-lesson" aria-label={`${formula.title} 해설`}>
      <div className="eyebrow">공식 이해하기</div>
      <h2>{formula.title}</h2>
      <div className="lesson-equation">
        <Formula value={formula.latex} />
      </div>
      <h3>언제 성립하나요?</h3>
      <ul>
        {formula.conditions.map((c, i) => (
          <li key={i}>{c}</li>
        ))}
      </ul>
      <dl className="variable-list">
        {formula.variables.map((v) => (
          <div key={v.symbol}>
            <dt>
              <Formula value={v.symbol} />
            </dt>
            <dd>
              {v.meaning}
              {v.unit ? ` (${v.unit})` : ""}
            </dd>
          </div>
        ))}
      </dl>
      {lesson ? (
        <>
          <h3>{lesson.title}</h3>
          <p>{lesson.introduction}</p>
          {lesson.diagram === "pythagorean-area" && <PythagoreanArea />}
          <ol className="lesson-steps">
            {lesson.steps.map((step, i) => (
              <li key={i}>
                <p>{step.text}</p>
                {step.latex && (
                  <div className="lesson-equation">
                    <Formula value={step.latex} />
                  </div>
                )}
              </li>
            ))}
          </ol>
          {lesson.history && (
            <aside className="formula-history">
              <h3>{lesson.history.title}</h3>
              <p>{lesson.history.text}</p>
              <a
                href={lesson.history.sourceUrl}
                target="_blank"
                rel="noreferrer"
              >
                역사 자료 읽기 ↗
              </a>
            </aside>
          )}
        </>
      ) : (
        <p>자세한 유도 과정은 준비 중이에요.</p>
      )}
      <details className="lesson-sources">
        <summary>참고 자료</summary>
        <ul>
          {formula.sources.map((s, i) => (
            <li key={i}>
              <a href={s.url} target="_blank" rel="noreferrer">
                {s.title} ↗
              </a>
            </li>
          ))}
        </ul>
      </details>
    </article>
  );
}
