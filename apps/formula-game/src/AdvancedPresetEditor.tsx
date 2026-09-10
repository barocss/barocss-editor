import { useState } from "react";
import { Button } from "@toss/tds-mobile";
import { catalog } from "./database";
import { matchesTerm, searchTerms } from "./content/taxonomy";
import type { TaxonomyTerm } from "./content/types";
import { difficulties } from "./content/catalog";
import {
  emptyScope,
  presetQuestions,
  scopeLabels,
  type StudyPreset,
  type StudyScope,
} from "./presets";
function Choices({
  title,
  items,
  values,
  onChange,
}: {
  title: string;
  items: readonly TaxonomyTerm[];
  values: string[];
  onChange: (ids: string[]) => void;
}) {
  const [query, setQuery] = useState("");
  const [limit, setLimit] = useState(12);
  const options: TaxonomyTerm[] = [
    ...items,
    ...values
      .filter((id) => !items.some((i) => i.id === id))
      .map((id) => ({ id, name: `찾을 수 없는 조건 (${id})` })),
  ];
  const visible = searchTerms(options, query);
  return (
    <details className="condition-picker">
      <summary>
        <span>{title}</span>
        <strong>
          {values.length
            ? values
                .map((id) => options.find((i) => i.id === id)!.name)
                .join(", ")
            : "전체"}
        </strong>
      </summary>
      <label className="condition-search">
        <input
          type="search"
          value={query}
          aria-label={`${title} 검색`}
          placeholder="검색"
          onChange={(e) => {
            setQuery(e.target.value);
            setLimit(12);
          }}
        />
      </label>
      <button className="text-button" onClick={() => onChange([])}>
        {title} 전체로 바꾸기
      </button>
      <div className="condition-options">
        {visible.slice(0, limit).map((i) => (
          <label key={i.id}>
            <input
              type="checkbox"
              checked={values.includes(i.id)}
              onChange={() =>
                onChange(
                  values.includes(i.id)
                    ? values.filter((id) => id !== i.id)
                    : [...values, i.id],
                )
              }
            />
            <span>
              {i.name}
              {i.parentId && (
                <small className="taxonomy-parent">
                  {items.find((t) => t.id === i.parentId)?.name}
                </small>
              )}
            </span>
          </label>
        ))}
      </div>
      {!visible.length && <p className="catalog-note">검색 결과가 없어요.</p>}
      {visible.length > limit && (
        <button className="text-button" onClick={() => setLimit(limit + 20)}>
          선택 항목 더 보기 ({visible.length - limit})
        </button>
      )}
    </details>
  );
}
export function AdvancedPresetEditor({
  initial,
  onSave,
  onCancel,
}: {
  initial: StudyPreset;
  onSave: (preset: StudyPreset) => void;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState(() => structuredClone(initial));
  const bank = presetQuestions(catalog, draft);
  function scopeChange(index: number, key: keyof StudyScope, values: string[]) {
    setDraft({
      ...draft,
      scopes: draft.scopes.map((s, i) =>
        i === index ? { ...s, [key]: values } : s,
      ),
    });
  }
  return (
    <section className="settings-screen enter">
      <button className="text-button" onClick={onCancel}>
        ‹ 취소
      </button>
      <h1>{initial.name ? "학습 편집" : "학습 만들기"}</h1>
      <label className="preset-name">
        학습 이름
        <input
          value={draft.name}
          maxLength={60}
          placeholder="예: 대학 응용통계"
          onChange={(e) => setDraft({ ...draft, name: e.target.value })}
        />
      </label>
      {draft.scopes.map((scope, index) => (
        <section
          className="scope-block"
          key={index}
          aria-label={`범위 ${index + 1}`}
        >
          <div className="section-heading">
            <h2>범위 {index + 1}</h2>
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
                이 범위 빼기
              </button>
            )}
          </div>
          <Choices
            title="과목"
            items={catalog.subjects}
            values={scope.subjectIds}
            onChange={(v) => scopeChange(index, "subjectIds", v)}
          />
          <Choices
            title="학습 수준"
            items={catalog.learningLevels}
            values={scope.schoolLevels}
            onChange={(v) => scopeChange(index, "schoolLevels", v)}
          />
          <Choices
            title="분야"
            items={catalog.domains.filter(
              (d) =>
                !scope.subjectIds.length ||
                scope.domainIds.includes(d.id) ||
                d.subjectIds.some((id) =>
                  matchesTerm(catalog.subjects, scope.subjectIds, id),
                ),
            )}
            values={scope.domainIds}
            onChange={(v) => scopeChange(index, "domainIds", v)}
          />
          <Choices
            title="주제"
            items={catalog.topics}
            values={scope.topicIds}
            onChange={(v) => scopeChange(index, "topicIds", v)}
          />
          <p className="scope-recap">
            {scopeLabels(catalog, scope).join(" · ") || "모든 공식"}
          </p>
        </section>
      ))}
      <button
        className="add-scope"
        onClick={() =>
          setDraft({ ...draft, scopes: [...draft.scopes, emptyScope()] })
        }
      >
        + 학습 범위 추가
      </button>
      <h2>풀이 설정</h2>
      <div className="filter-grid">
        <label>
          문제 난이도
          <select
            value={draft.difficulty ?? ""}
            onChange={(e) =>
              setDraft({
                ...draft,
                difficulty:
                  (e.target.value as StudyPreset["difficulty"]) || undefined,
              })
            }
          >
            <option value="">전체 난이도</option>
            {difficulties.map((d) => (
              <option value={d.id} key={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </label>
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
      </div>
      <div className="round-modes" role="group" aria-label="풀이 방식">
        {(
          [
            ["learn", "안 푼 문제부터"],
            ["mix", "섞어 풀기"],
            ["review", "복습하기"],
          ] as const
        ).map(([id, name]) => (
          <button
            key={id}
            aria-pressed={draft.mode === id}
            onClick={() => setDraft({ ...draft, mode: id })}
          >
            {name}
          </button>
        ))}
      </div>
      <div className="preset-preview" role="status">
        <strong>
          공식 {new Set(bank.map((q) => q.formulaId)).size}개 · 연습{" "}
          {bank.length}문제
        </strong>
        {!bank.length && <p>문제 준비 중</p>}
      </div>
      <Button
        size="xlarge"
        display="block"
        disabled={!draft.name.trim()}
        onClick={() =>
          onSave({ ...draft, name: draft.name.trim(), updatedAt: Date.now() })
        }
      >
        학습 저장
      </Button>
    </section>
  );
}
