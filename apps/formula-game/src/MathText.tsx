import { useMemo } from "react";
import { Formula } from "./Formula";
import { splitMathText } from "./math-text";

export function MathText({
  children,
  symbols = [],
}: {
  children: string;
  symbols?: readonly string[];
}) {
  const parts = useMemo(
    () => splitMathText(children, symbols),
    [children, symbols],
  );
  return (
    <span className="math-text">
      {parts.map((part, index) =>
        part.type === "math" ? (
          <Formula key={index} value={part.value} />
        ) : (
          part.value
        ),
      )}
    </span>
  );
}
