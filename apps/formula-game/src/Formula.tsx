import { useMemo } from "react";
import katex from "katex";
export function Formula({ value }: { value: string }) {
  const html = useMemo(
    () =>
      katex.renderToString(value, {
        throwOnError: false,
        strict: "ignore",
        trust: false,
      }),
    [value],
  );
  return (
    <span className="formula" dangerouslySetInnerHTML={{ __html: html }} />
  );
}
