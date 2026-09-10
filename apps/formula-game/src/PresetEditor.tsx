import { useState } from "react";
import { Button } from "@toss/tds-mobile";
import { AdvancedPresetEditor } from "./AdvancedPresetEditor";
import { schoolCourses, courseUnits } from "./curriculum";
import { catalog } from "./database";
import {
  emptyScope,
  presetQuestions,
  type StudyPreset,
  type StudyScope,
} from "./presets";

export function PresetEditor(props: {
  initial: StudyPreset;
  onSave: (p: StudyPreset) => void;
  onCancel: () => void;
}) {
  const existing = !!props.initial.name;
  const [route, setRoute] = useState(
    existing && !props.initial.scopes.some((s) => s.courseId)
      ? "direct"
      : "school",
  );
  return (
    <>
      {!existing && (
        <div
          className="round-modes navigation-routes"
          role="group"
          aria-label="공식 찾는 방법"
        >
          <button
            aria-pressed={route === "school"}
            onClick={() => setRoute("school")}
          >
            학교 과목으로 찾기
          </button>
          <button
            aria-pressed={route === "direct"}
            onClick={() => setRoute("direct")}
          >
            분야로 직접 찾기
          </button>
        </div>
      )}
      <div hidden={route !== "school"}>
        <SchoolPresetEditor {...props} />
      </div>
      <div hidden={route !== "direct"}>
        <AdvancedPresetEditor {...props} />
      </div>
    </>
  );
}
function SchoolPresetEditor({
  initial,
  onSave,
  onCancel,
}: {
  initial: StudyPreset;
  onSave: (p: StudyPreset) => void;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState<StudyPreset>(() => ({
    ...structuredClone(initial),
    scopes: initial.scopes.some((s) => s.courseId)
      ? structuredClone(initial.scopes)
      : [{ ...emptyScope(), courseId: schoolCourses[0].id, unitIds: [] }],
  }));
  const [query, setQuery] = useState("");
  const bank = presetQuestions(catalog, draft);
  const suggestedName = draft.scopes
    .map((s) =>
      s.unitIds?.length === 1
        ? courseUnits.find((u) => u.id === s.unitIds![0])?.name
        : schoolCourses.find((c) => c.id === s.courseId)?.name,
    )
    .filter(Boolean)
    .join(" + ")
    .slice(0, 60);
  function change(index: number, scope: StudyScope) {
    setDraft({
      ...draft,
      scopes: draft.scopes.map((s, i) => (i === index ? scope : s)),
    });
  }
  return (
    <section className="settings-screen enter">
      <button className="text-button" onClick={onCancel}>
        ‹ 취소
      </button>
      <h1>{initial.name ? "학습 편집" : "학습 만들기"}</h1>
      {draft.scopes.map((scope, index) => {
        const course = schoolCourses.find((c) => c.id === scope.courseId);
        const units = courseUnits.filter((u) => u.courseId === scope.courseId);
        const visibleUnits = units.filter((u) =>
          u.name.toLowerCase().includes(query.trim().toLowerCase()),
        );
        return (
          <section
            className="scope-block"
            key={index}
            aria-label={`선택한 과목 ${index + 1}`}
          >
            <div className="section-heading">
              <h2>선택한 과목 {index + 1}</h2>
              {draft.scopes.length > 1 && (
                <button
                  className="text-button"
                  onClick={() =>
                    setDraft({
                      ...draft,
                      scopes: draft.scopes.filter((_, i) => i !== index),
                    })
                  }
                >
                  빼기
                </button>
              )}
            </div>
            <div className="filter-grid">
              <label>
                학교
                <select
                  aria-label="학교"
                  value={course?.school ?? ""}
                  onChange={(e) =>
                    change(index, {
                      ...emptyScope(),
                      courseId: schoolCourses.find(
                        (c) => c.school === e.target.value,
                      )!.id,
                      unitIds: [],
                    })
                  }
                >
                  {!course && <option value="">찾을 수 없는 학교</option>}
                  {[...new Set(schoolCourses.map((c) => c.school))].map((s) => (
                    <option key={s}>{s}</option>
                  ))}
                </select>
              </label>
              <label>
                배우는 과목
                <select
                  aria-label="배우는 과목"
                  value={scope.courseId}
                  onChange={(e) =>
                    change(index, {
                      ...emptyScope(),
                      courseId: e.target.value,
                      unitIds: [],
                    })
                  }
                >
                  {!course && (
                    <option aria-label="배우는 과목" value={scope.courseId}>
                      찾을 수 없는 과목
                    </option>
                  )}
                  {schoolCourses
                    .filter((c) => c.school === course?.school)
                    .map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                </select>
              </label>
            </div>
            <p className="catalog-note">{course?.edition} · 일부 단원 제공</p>
            <h3>단원 선택</h3>
            <div className="condition-options school-units">
              <label>
                <input
                  type="checkbox"
                  checked={!scope.unitIds?.length}
                  onChange={() => change(index, { ...scope, unitIds: [] })}
                />
                등록된 단원 전체
              </label>
              {visibleUnits.map((u) => {
                const count = new Set(
                  presetQuestions(catalog, {
                    ...draft,
                    difficulty: undefined,
                    scopes: [{ ...scope, unitIds: [u.id] }],
                  }).map((q) => q.formulaId),
                ).size;
                return (
                  <label key={u.id}>
                    <input
                      type="checkbox"
                      checked={!!scope.unitIds?.includes(u.id)}
                      onChange={() =>
                        change(index, {
                          ...scope,
                          unitIds: scope.unitIds?.includes(u.id)
                            ? scope.unitIds.filter((id) => id !== u.id)
                            : [...(scope.unitIds ?? []), u.id],
                        })
                      }
                    />
                    <span>
                      {u.name}
                      <small>
                        {count ? `연습 가능한 공식 ${count}개` : "문제 준비 중"}
                      </small>
                    </span>
                  </label>
                );
              })}
              {!visibleUnits.length && (
                <p className="catalog-note" role="status">
                  {query.trim()
                    ? "검색 조건에 맞는 단원이 없어요."
                    : "등록된 단원이 없어요."}
                </p>
              )}
              {scope.unitIds
                ?.filter((id) => !units.some((u) => u.id === id))
                .map((id) => (
                  <label key={id}>
                    <input
                      type="checkbox"
                      checked
                      onChange={() =>
                        change(index, {
                          ...scope,
                          unitIds: scope.unitIds!.filter((v) => v !== id),
                        })
                      }
                    />
                    찾을 수 없는 단원 ({id})
                  </label>
                ))}
            </div>
          </section>
        );
      })}
      <button
        className="add-scope"
        onClick={() =>
          setDraft({
            ...draft,
            scopes: [
              ...draft.scopes,
              { ...emptyScope(), courseId: schoolCourses[0].id, unitIds: [] },
            ],
          })
        }
      >
        + 과목 추가
      </button>
      <details className="condition-picker">
        <summary>단원 이름으로 찾기</summary>
        <label className="condition-search">
          선택한 과목에서 단원 검색
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="예: 피타고라스"
          />
        </label>
      </details>
      <label className="preset-name">
        학습 이름
        <input
          maxLength={60}
          value={draft.name}
          placeholder={suggestedName}
          onChange={(e) => setDraft({ ...draft, name: e.target.value })}
        />
      </label>
      <details className="condition-picker">
        <summary>
          풀이 설정 <strong>한 번에 {draft.count}문제</strong>
        </summary>
        <div className="filter-grid">
          <label>
            한 번에 풀 문제
            <select
              value={draft.count}
              onChange={(e) =>
                setDraft({ ...draft, count: Number(e.target.value) })
              }
            >
              {[5, 10, 20].map((n) => (
                <option key={n} value={n}>
                  {n}문제
                </option>
              ))}
            </select>
          </label>
          <label>
            풀이 순서
            <select
              value={draft.mode}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  mode: e.target.value as StudyPreset["mode"],
                })
              }
            >
              <option value="learn">안 푼 문제부터</option>
              <option value="mix">섞어 풀기</option>
              <option value="review">복습하기</option>
            </select>
          </label>
        </div>
      </details>
      <div className="preset-preview" role="status">
        <strong>
          공식 {new Set(bank.map((q) => q.formulaId)).size}개 · 연습{" "}
          {bank.length}문제
        </strong>
        {!bank.length && <p>등록된 문제 없음 · 학습 저장 가능</p>}
      </div>
      <Button
        size="xlarge"
        display="block"
        disabled={!(draft.name.trim() || suggestedName)}
        onClick={() =>
          onSave({
            ...draft,
            name: draft.name.trim() || suggestedName,
            updatedAt: Date.now(),
          })
        }
      >
        학습 저장
      </Button>
    </section>
  );
}
