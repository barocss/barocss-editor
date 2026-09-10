import { useEffect, useState } from "react";
import { Button } from "@toss/tds-mobile";
import { catalog } from "./database";
import { getRound, type Progress } from "./game";
import {
  newPreset,
  presetQuestions,
  scopeLabels,
  type StudyPreset,
  type PresetState,
} from "./presets";
import { PresetEditor } from "./PresetEditor";
export function PresetManager({
  state,
  initial,
  progress,
  onSave,
  onDelete,
  onStart,
}: {
  state: PresetState;
  initial?: string;
  progress: Progress;
  onSave: (p: StudyPreset) => void;
  onDelete: (id: string) => void;
  onStart: (p: StudyPreset) => void;
}) {
  const [selected, setSelected] = useState(
    initial === "new" ? undefined : initial,
  );
  const [draft, setDraft] = useState<StudyPreset | undefined>(() =>
    initial === "new" ? newPreset() : undefined,
  );
  const [query, setQuery] = useState("");
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [selected, draft?.id]);
  if (draft)
    return (
      <PresetEditor
        key={draft.id}
        initial={draft}
        onCancel={() => setDraft(undefined)}
        onSave={(p) => {
          onSave(p);
          setSelected(p.id);
          setDraft(undefined);
        }}
      />
    );
  const preset = state.items.find((p) => p.id === selected);
  if (preset) {
    const bank = presetQuestions(catalog, preset),
      available = getRound(bank, preset.count, preset.mode, progress).length;
    return (
      <section className="settings-screen enter">
        <button className="text-button" onClick={() => setSelected(undefined)}>
          ‹ 내 학습
        </button>
        <h1>{preset.name}</h1>
        {preset.scopes.map((scope, i) => (
          <div className="scope-description" key={i}>
            <span>범위 {i + 1}</span>
            <p>{scopeLabels(catalog, scope).join(" · ") || "모든 공식"}</p>
          </div>
        ))}
        <div className="preset-preview">
          <strong>
            공식 {new Set(bank.map((q) => q.formulaId)).size}개 · 연습{" "}
            {bank.length}문제
          </strong>
        </div>
        <Button
          size="xlarge"
          display="block"
          disabled={!available}
          onClick={() => onStart(preset)}
        >
          {available
            ? `${available}문제 시작`
            : bank.length
              ? "지금은 복습할 문제가 없어요"
              : "콘텐츠 준비 중"}
        </Button>
        <div className="preset-tools">
          <button onClick={() => setDraft(structuredClone(preset))}>
            학습 편집
          </button>
          <button
            onClick={() =>
              setDraft(
                newPreset({
                  ...preset,
                  id: crypto.randomUUID(),
                  name: `${preset.name.slice(0, 55)} 복사`,
                  createdAt: Date.now(),
                  updatedAt: Date.now(),
                }),
              )
            }
          >
            복제
          </button>
          <button
            onClick={() => {
              onDelete(preset.id);
              setSelected(undefined);
            }}
          >
            삭제
          </button>
        </div>
      </section>
    );
  }
  const items = state.items.filter((p) =>
    `${p.name} ${p.scopes.flatMap((s) => scopeLabels(catalog, s)).join(" ")}`
      .toLowerCase()
      .includes(query.toLowerCase()),
  );
  return (
    <section className="settings-screen enter">
      <h1>내 학습</h1>
      <Button
        size="xlarge"
        display="block"
        onClick={() => setDraft(newPreset())}
      >
        새 학습 만들기
      </Button>
      <label className="history-search">
        학습 검색
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="이름이나 학습 범위"
        />
      </label>
      <div className="preset-list">
        {items.map((p) => {
          const qs = presetQuestions(catalog, p);
          return (
            <button
              key={p.id}
              className="preset-row"
              onClick={() => setSelected(p.id)}
            >
              <strong>{p.name}</strong>
              <span>
                {p.scopes.flatMap((s) => scopeLabels(catalog, s)).join(" · ") ||
                  "모든 공식"}
              </span>
              <small>
                공식 {new Set(qs.map((q) => q.formulaId)).size}개 · {qs.length}
                문제 {qs.length ? "" : "· 준비 중"}
              </small>
            </button>
          );
        })}
      </div>
      {!items.length && (
        <div className="catalog-empty">
          {state.items.length ? "검색 결과가 없어요." : "저장한 학습이 없어요."}
        </div>
      )}
      {
        <>
          <h2>공식 연습</h2>
          {[
            {
              name: "초등 도형",
              subjectIds: ["math"],
              schoolLevels: ["elementary"],
              domainIds: ["plane-geometry"],
            },
            {
              name: "공통수학2 · 도형의 방정식",
              courseId: "kr-2022-common2",
              unitIds: ["kr-2022-common2-coordinates"],
            },
            {
              name: "물리 · 회로와 운동",
              subjectIds: ["physics"],
              schoolLevels: ["high"],
              domainIds: ["circuits", "mechanics"],
            },
            {
              name: "대학 응용통계",
              subjectIds: ["statistics"],
              schoolLevels: ["university"],
              domainIds: ["applied-statistics"],
            },
          ].map(({ name, ...scope }) => {
            const template = newPreset({
              name,
              scopes: [{ ...emptyTemplate, ...scope }],
            });
            const questions = presetQuestions(catalog, template);
            return (
              <button
                className="preset-row"
                key={name}
                onClick={() => setDraft(template)}
              >
                <strong>{name}</strong>
                <span>
                  공식{" "}
                  {
                    new Set(questions.map((question) => question.formulaId))
                      .size
                  }
                  개 · {questions.length}문제
                </span>
              </button>
            );
          })}

          <button
            className="preset-row"
            onClick={() =>
              setDraft(
                newPreset({
                  name: "공통수학1 다항식",
                  scopes: [
                    {
                      ...emptyTemplate,
                      courseId: "kr-2022-common1",
                      unitIds: ["kr-2022-common1-polynomials"],
                    },
                  ],
                }),
              )
            }
          >
            <strong>공통수학1 · 다항식</strong>
            <span>곱셈 공식 · 인수분해</span>
          </button>
          <button
            className="preset-row"
            onClick={() =>
              setDraft(
                newPreset({
                  name: "직각삼각형",
                  scopes: [
                    {
                      ...emptyTemplate,
                      courseId: "kr-ebs-m2",
                      unitIds: ["kr-ebs-m2-pythagorean"],
                    },
                  ],
                }),
              )
            }
          >
            <strong>직각삼각형</strong>
            <span>중학교 2학년 · 피타고라스 정리</span>
          </button>
        </>
      }
    </section>
  );
}
const emptyTemplate = {
  subjectIds: [],
  schoolLevels: [],
  domainIds: [],
  topicIds: [],
};
