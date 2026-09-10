export type MathTextPart = {
  type: "text" | "math";
  value: string;
};

const mathRun =
  /[A-Za-zΑ-ω0-9²³⁰¹⁴⁵⁶⁷⁸⁹₀-₉+\-−=<>≤≥×÷/^,°][A-Za-zΑ-ω0-9²³⁰¹⁴⁵⁶⁷⁸⁹₀-₉+\-−=<>≤≥×÷/^,°\s]*/gu;

const replacements: readonly [RegExp, string][] = [
  [/−/g, "-"],
  [/×/g, "\\times "],
  [/÷/g, "\\div "],
  [/≤/g, "\\le "],
  [/≥/g, "\\ge "],
  [/²/g, "^2"],
  [/³/g, "^3"],
  [/⁰/g, "^0"],
  [/¹/g, "^1"],
  [/⁴/g, "^4"],
  [/⁵/g, "^5"],
  [/⁶/g, "^6"],
  [/⁷/g, "^7"],
  [/⁸/g, "^8"],
  [/⁹/g, "^9"],
  [/°/g, "^{\\circ}"],
  [/μ/g, "\\mu "],
  [/σ/g, "\\sigma "],
  [/Ω/g, "\\Omega "],
];

export function normalizeInlineLatex(value: string) {
  return replacements.reduce(
    (result, [pattern, replacement]) => result.replace(pattern, replacement),
    value,
  );
}

function inferMath(text: string, symbols: readonly string[]): MathTextPart[] {
  const parts: MathTextPart[] = [];
  let cursor = 0;
  for (const match of text.matchAll(mathRun)) {
    const raw = match[0];
    const start = match.index;
    const core = raw.trimEnd();
    const compact = core.replace(/\s/g, "");
    const isMath =
      symbols.some((symbol) => compact.includes(symbol)) ||
      /[Α-ω²³⁰¹⁴⁵⁶⁷⁸⁹₀-₉+\-−=<>≤≥×÷/^°]/u.test(compact);
    if (!isMath) continue;
    if (start > cursor) parts.push({ type: "text", value: text.slice(cursor, start) });
    parts.push({ type: "math", value: normalizeInlineLatex(core) });
    const trailing = raw.slice(core.length);
    if (trailing) parts.push({ type: "text", value: trailing });
    cursor = start + raw.length;
  }
  if (cursor < text.length) parts.push({ type: "text", value: text.slice(cursor) });
  return parts.length ? parts : [{ type: "text", value: text }];
}

/** `$...$` is the authoring format. Symbol inference keeps older content readable. */
export function splitMathText(
  text: string,
  symbols: readonly string[] = [],
): MathTextPart[] {
  const parts: MathTextPart[] = [];
  let cursor = 0;
  const explicit = /\$([^$]+)\$/g;
  for (const match of text.matchAll(explicit)) {
    const start = match.index;
    if (start > cursor) parts.push(...inferMath(text.slice(cursor, start), symbols));
    parts.push({ type: "math", value: match[1] });
    cursor = start + match[0].length;
  }
  if (cursor < text.length) parts.push(...inferMath(text.slice(cursor), symbols));
  return parts.length ? parts : [{ type: "text", value: text }];
}
