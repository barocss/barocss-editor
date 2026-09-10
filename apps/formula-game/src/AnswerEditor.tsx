import { useEffect, useRef, useState } from "react";
import {
  createMathSession,
  createMathDocument,
  findStateSuggestions,
  findSuggestions,
  acceptSuggestion,
  insertStructure,
  mathStructures,
  setText,
  moveCaret,
  type MathSuggestion,
  wrapRange,
  type WrappingKind,
} from "@barocss/math-editor/core";
import { mountMathEditor, type DOMMathEditor } from "@barocss/math-editor/dom";
import type { InputProfile } from "./content/types";
export function AnswerEditor({
  profile,
  onChange,
}: {
  profile: InputProfile;
  onChange: (latex: string) => void;
}) {
  const [session] = useState(() =>
    createMathSession({ mode: "inline", locale: "ko" }),
  );
  const [snapshot, setSnapshot] = useState(() => session.getSnapshot());
  const [composing, setComposing] = useState(false);
  const hasSelection =
    !!snapshot.range || snapshot.state.caret.start !== snapshot.state.caret.end;
  const fullQuery = findStateSuggestions(snapshot.state, "ko");
  // Adjacent game variables denote multiplication. Offer a structure on the
  // last letter (3ab → 3ab²), never square the whole product without selection.
  const found =
    fullQuery.query.length > 1 &&
    [...fullQuery.query].every((char) => profile.symbols.includes(char))
      ? findSuggestions(fullQuery.query.slice(-1), 1, "ko")
      : fullQuery;
  const candidates = profile.structures
    .map((kind) => (kind === "square" ? "superscript" : kind))
    .flatMap((kind) => {
      const candidate = found.candidates.find(
        (item) =>
          item.kind === kind &&
          !item.transformRootId &&
          !item.transformFenceId &&
          (item.wrapOperand ||
            item.aliases.includes(found.query.replace(/^\\/, ""))),
      );
      if (candidate) return [candidate];
      // Start a fraction/root before its contents, so multi-term numerators
      // do not require selecting text or wrapping only the last letter.
      if (!found.query && (kind === "fraction" || kind === "root")) {
        const structure = mathStructures.find((item) => item.kind === kind)!;
        return [{ ...structure, id: `insert-${kind}` }];
      }
      return [];
    });
  const host = useRef<HTMLDivElement>(null);
  const editor = useRef<DOMMathEditor>();
  const change = useRef(onChange);
  change.current = onChange;
  useEffect(() => {
    const inputHost = host.current!;
    // The DOM editor can replace its input while handling compositionend.
    // Capture the native event before replacement; React delegation can miss it.
    const beginComposition = () => setComposing(true);
    const endComposition = () => setComposing(false);
    inputHost.addEventListener("compositionstart", beginComposition, true);
    inputHost.addEventListener("compositionend", endComposition, true);
    editor.current = mountMathEditor(inputHost, {
      session,
      suggestionMenu: false,
      toolbar: false,
      contextTools: false,
      showLineNumbers: false,
      onChange: (_document, latex) => change.current(latex),
      onRender: () => {
        // The editor calls onRender only after native composition has finished.
        setComposing(false);
        host.current?.querySelectorAll("input").forEach((input) => {
          input.setAttribute("inputmode", "none");
          input.setAttribute("aria-label", "수식 답 입력");
        });
      },
    });
    const unsubscribe = session.subscribe(setSnapshot);
    return () => {
      unsubscribe();
      inputHost.removeEventListener("compositionstart", beginComposition, true);
      inputHost.removeEventListener("compositionend", endComposition, true);
      editor.current?.destroy();
    };
  }, [session]);
  const choose = (candidate: MathSuggestion) => {
    if (composing) return;
    const state = session.getSnapshot().state;
    let next =
      candidate.id.startsWith("insert-") && candidate.kind
        ? insertStructure(state, candidate.kind)
        : acceptSuggestion(state, found.query, candidate);
    if (next === state) return;
    // A square is one editor transaction, including exponent and caret movement.
    if (candidate.kind === "superscript")
      next = moveCaret(setText(next, "2", 1), 1);
    session.apply(next);
    editor.current?.focus();
  };
  const chooseSelection = (
    kind: WrappingKind,
    fractionSlot: "numerator" | "denominator" = "numerator",
  ) => {
    if (composing) return;
    const current = session.getSnapshot();
    const { caret } = current.state;
    const range =
      current.range ??
      (caret.start !== caret.end
        ? {
            anchor: { id: caret.id, offset: caret.start },
            focus: { id: caret.id, offset: caret.end },
          }
        : undefined);
    if (!range) return;
    let next = wrapRange(current.state, range, kind, fractionSlot);
    if (next === current.state) return;
    if (kind === "superscript") next = moveCaret(setText(next, "2", 1), 1);
    session.apply(next);
    editor.current?.focus();
  };
  const insert = (value: string) => {
    session.execute({ type: "text", value });
    editor.current?.focus();
  };
  return (
    <section className="answer-panel" aria-label="답안 편집기">
      <div className="answer-heading">
        <span>답안</span>
        <button
          className="text-button"
          onClick={() => session.load(createMathDocument())}
        >
          지우기
        </button>
      </div>
      <div
        className="editor-field"
        onClick={(event) => {
          if (event.target === event.currentTarget) editor.current?.focus();
        }}
      >
        <div ref={host} className="math-input" />
      </div>
      <div className="structure-suggestions" aria-label="수식 구조 추천">
        {hasSelection ? (
          profile.structures.flatMap((kind) =>
            kind === "fraction"
              ? [
                  <button
                    key="numerator"
                    className="structure-chip"
                    disabled={composing}
                    onPointerDown={(event) => event.preventDefault()}
                    onClick={() => chooseSelection("fraction")}
                  >
                    <span aria-hidden="true">▧/□</span>분자로 넣기
                  </button>,
                  <button
                    key="denominator"
                    className="structure-chip"
                    disabled={composing}
                    onPointerDown={(event) => event.preventDefault()}
                    onClick={() => chooseSelection("fraction", "denominator")}
                  >
                    <span aria-hidden="true">□/▧</span>분모로 넣기
                  </button>,
                ]
              : [
                  <button
                    key={kind}
                    className="structure-chip"
                    disabled={composing}
                    onPointerDown={(event) => event.preventDefault()}
                    onClick={() =>
                      chooseSelection(
                        kind === "square" ? "superscript" : "root",
                      )
                    }
                  >
                    <span aria-hidden="true">
                      {kind === "square" ? "x²" : "√□"}
                    </span>
                    {kind === "square" ? "제곱" : "루트"}
                  </button>,
                ],
          )
        ) : candidates.length ? (
          candidates.map((candidate) => (
            <button
              key={candidate.id}
              disabled={composing}
              className="structure-chip"
              onPointerDown={(event) => event.preventDefault()}
              onClick={() => choose(candidate)}
            >
              <span aria-hidden="true">
                {candidate.kind === "superscript"
                  ? "x²"
                  : candidate.kind === "fraction"
                    ? "□/□"
                    : "√□"}
              </span>
              {candidate.kind === "superscript"
                ? "제곱"
                : candidate.kind === "fraction"
                  ? "분수"
                  : "루트"}
            </button>
          ))
        ) : (
          <span className="suggestion-prompt">문자나 숫자 입력</span>
        )}
      </div>
      <div className="keypad" aria-label="수학 키패드">
        {[...profile.symbols, ...profile.numbers, ...profile.operators].map(
          (value) => (
            <button
              key={value}
              className="math-key"
              aria-label={`${value} 입력`}
              onPointerDown={(e) => e.preventDefault()}
              onClick={() => insert(value === "−" ? "-" : value)}
            >
              {value}
            </button>
          ),
        )}
        <button
          className="math-key next-slot"
          aria-label="다음 칸으로 이동"
          onPointerDown={(event) => event.preventDefault()}
          onClick={() => {
            session.apply(moveCaret(session.getSnapshot().state, 1));
            editor.current?.focus();
          }}
        >
          다음 칸 →
        </button>
        <button
          className="math-key"
          aria-label="입력 되돌리기"
          onPointerDown={(e) => e.preventDefault()}
          onClick={() => {
            session.execute({ type: "undo" });
            editor.current?.focus();
          }}
        >
          ↶
        </button>
      </div>
      {(hasSelection ||
        found.query ||
        profile.structures.includes("fraction")) && (
        <p className="input-note">
          {hasSelection
            ? "선택한 식 전체에 적용"
            : found.query
              ? `마지막 “${found.query}”에 적용`
              : "분수 선택 → 분자·분모 입력"}
        </p>
      )}
    </section>
  );
}
