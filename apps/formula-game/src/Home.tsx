import { Button } from "@toss/tds-mobile";
import { catalog } from "./database";
import { getRound, type Progress } from "./game";
import {
  presetQuestions,
  scopeLabels,
  type PresetState,
  type StudyPreset,
} from "./presets";
export function Home({
  state,
  progress,
  seenCount,
  onOpen,
  onStart,
  onLibrary,
  onDerive,
}: {
  state: PresetState;
  progress: Progress;
  seenCount: number;
  onOpen: (id?: string) => void;
  onStart: (p: StudyPreset) => void;
  onLibrary: () => void;
  onDerive: () => void;
}) {
  const recent =
    state.items.find((p) => p.id === state.lastUsedId) ?? state.items.at(-1);
  const count = recent
    ? getRound(
        presetQuestions(catalog, recent),
        recent.count,
        recent.mode,
        progress,
      ).length
    : 0;
  return (
    <section className="dashboard-home enter">
      <h1>
        빈칸을 채우며
        <br />
        익히는 공식
      </h1>
      {recent ? (
        <section className="continue-study">
          <h2>{recent.name}</h2>
          <p>
            {recent.scopes
              .flatMap((s) => scopeLabels(catalog, s))
              .join(" · ") || "모든 공식"}
          </p>
          <Button
            size="xlarge"
            display="block"
            disabled={!count}
            onClick={() => onStart(recent)}
          >
            {count ? `${count}문제 풀기` : "지금 풀 수 있는 문제가 없어요"}
          </Button>
          <button className="text-button" onClick={() => onOpen(recent.id)}>
            학습 내용 보기 →
          </button>
        </section>
      ) : (
        <section className="first-study">
          <Button size="xlarge" display="block" onClick={() => onOpen("new")}>
            첫 학습 만들기
          </Button>
        </section>
      )}
      <div className="home-menu">
        <button onClick={() => onOpen()}>
          <span>
            <strong>내 학습</strong>
            <small>{state.items.length}개</small>
          </span>
          <span aria-hidden="true">›</span>
        </button>
        <button onClick={onDerive}>
          <span>
            <strong>한 줄씩 유도하기</strong>
            <small>피타고라스 정리</small>
          </span>
          <span aria-hidden="true">›</span>
        </button>
        <button onClick={onLibrary}>
          <span>
            <strong>내가 본 문제</strong>
            <small>{seenCount}문제 · 답안과 공식 해설</small>
          </span>
          <span aria-hidden="true">›</span>
        </button>
      </div>
    </section>
  );
}
