import { useEffect, useState } from "react";
import { Button } from "@toss/tds-mobile";
import App from "./App";
import { createLearningLoader, type LearningState } from "./learning-state";
import { prepareLearningStorage } from "./storage-runtime";

const load = createLearningLoader(prepareLearningStorage);
export function AppLoader() {
  const [data, setData] = useState<LearningState>();
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    void load().then(
      (result) => {
        if (active) setData(result);
      },
      () => {
        if (active) setFailed(true);
      },
    );
    return () => {
      active = false;
    };
  }, [attempt]);
  if (data) return <App initial={data} />;
  return (
    <main className="app-shell">
      <h1>공식 한 칸</h1>
      <p role="status">
        {failed
          ? "학습 기록을 불러오지 못했어요. 다시 시도해 주세요."
          : "기록 불러오는 중"}
      </p>
      {failed && (
        <Button
          onClick={() => {
            setFailed(false);
            setAttempt((value) => value + 1);
          }}
        >
          다시 불러오기
        </Button>
      )}
    </main>
  );
}
