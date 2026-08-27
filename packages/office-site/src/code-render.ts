/**
 * A code block, **tokenized and drawn** — the same markup in the editor and on the published page.
 *
 * ## Why Prism does both jobs
 *
 * Syntax highlighting is two things: deciding what each character *is*, and drawing that. A scanner
 * written by hand can do the first badly for a handful of C-family languages; it cannot do HTML or
 * CSS at all, because those need a grammar rather than a word list. Prism has the grammars, and its
 * `tokenize` hands back a tree rather than a string — so the drawing stays this repository's, made
 * of the same `element()` calls as every other renderer.
 *
 * The alternative that was tried first was the CSS Custom Highlight API, painting ranges over an
 * untouched flat run. It works and it was the wrong idea: it is a way to *colour* something, not a
 * way to say what a code block is, and it made the published page depend on running a script.
 *
 * ## The block is not typed into
 *
 * `contenteditable="false"`, and the caret never enters. Which is what makes the spans safe: they
 * are the renderer's, derived from the text, and nothing maps a caret through them. Editing happens
 * in a layer of its own — see `code-editor.tsx` in the app — so the text stack never meets a code
 * block at all, and every question about offsets, IME, marks, Enter and Tab stops being asked.
 *
 * ## One markup, both grounds
 *
 * The export renders through these same renderers, so the page a visitor gets carries the same
 * `<span class="token keyword">` the editor drew, with **no script at all**. That is the property the
 * Highlight API could not have: it paints at runtime, so a published page had to run our function to
 * be coloured.
 */
import Prism from 'prismjs';
import 'prismjs/components/prism-typescript.js';
import 'prismjs/components/prism-jsx.js';
import 'prismjs/components/prism-tsx.js';
import 'prismjs/components/prism-css.js';
import 'prismjs/components/prism-json.js';
import 'prismjs/components/prism-bash.js';
import 'prismjs/components/prism-python.js';
import 'prismjs/components/prism-go.js';
import 'prismjs/components/prism-rust.js';
import 'prismjs/components/prism-sql.js';
import 'prismjs/components/prism-yaml.js';
import 'prismjs/components/prism-markdown.js';
import { element, type ElementChild } from '@barocss/dsl';

/**
 * What a reader may write in the panel, and which grammar it means.
 *
 * Prism's own names on the right. A language it does not know draws as plain text rather than
 * guessing — a block nobody has told is not a block in the wrong language.
 */
const ALIAS: Record<string, string> = {
  js: 'javascript',
  javascript: 'javascript',
  jsx: 'jsx',
  mjs: 'javascript',
  node: 'javascript',
  ts: 'typescript',
  typescript: 'typescript',
  tsx: 'tsx',
  html: 'markup',
  xml: 'markup',
  svg: 'markup',
  markup: 'markup',
  vue: 'markup',
  css: 'css',
  scss: 'css',
  less: 'css',
  json: 'json',
  sh: 'bash',
  bash: 'bash',
  shell: 'bash',
  zsh: 'bash',
  console: 'bash',
  py: 'python',
  python: 'python',
  go: 'go',
  golang: 'go',
  rs: 'rust',
  rust: 'rust',
  sql: 'sql',
  yaml: 'yaml',
  yml: 'yaml',
  md: 'markdown',
  markdown: 'markdown'
};

/** The grammar for what a reader wrote, or nothing when Prism has never heard of it. */
export function grammarFor(language: unknown): { name: string; grammar: unknown } | undefined {
  const said = String(language ?? '').trim().toLowerCase();
  const name = ALIAS[said];
  const grammar = name ? (Prism.languages as Record<string, unknown>)[name] : undefined;
  return grammar ? { name, grammar } : undefined;
}

/**
 * The code, as elements.
 *
 * Prism's token tree turned into `element()` calls one for one: a token becomes a span carrying its
 * type and its aliases as classes, a string becomes text, and a token whose content is itself a list
 * of tokens becomes a span around them. Which is Prism's own `Token.stringify` written as this
 * repository's renderer rather than as an HTML string — a string would have to be inserted as raw
 * markup, and raw markup is a hole in the reconciler and a place for a document to inject into a
 * published page.
 */
export function codeElements(code: string, language: unknown): ElementChild[] {
  const found = grammarFor(language);

  /**
   * Every child is an **element with a key**, including the plain one.
   *
   * Measured before it was: with no grammar the block drew one bare text child, and with one it drew
   * a list of spans — so the child list changed *shape*, the reconciler had nothing to pair the text
   * with, and the old characters stayed on the page underneath the new spans. A code block that had
   * been given a language showed its program twice.
   *
   * A key is what says which child is which among siblings, and a node's own id is not: it is
   * stamped on every element of its template, so all forty spans carry the same one. Told plainly
   * here rather than left to a guess.
   */
  const wrap = (key: string, className: string | undefined, inside: ElementChild[]): ElementChild =>
    element('span', className ? { key, className } : { key }, inside);

  if (!found || code.length === 0) return [wrap('code', undefined, [code])];

  let next = 0;
  const drawn = (one: unknown): ElementChild => {
    const key = `t${next++}`;
    if (typeof one === 'string') return wrap(key, undefined, [one]);

    const token = one as { type: string; alias?: string | string[]; content: unknown };
    const names = ['token', token.type, ...(Array.isArray(token.alias) ? token.alias : token.alias ? [token.alias] : [])];
    /*
     * A token whose content is just characters gets them **directly**, not wrapped again: Prism's
     * tree has a string there and a span around a span is one element per token more than the page
     * needs, on every token, in every code block.
     */
    const inside: ElementChild[] = Array.isArray(token.content)
      ? (token.content.map(drawn) as ElementChild[])
      : [String(token.content)];

    return wrap(key, names.join(' '), inside);
  };

  return (Prism.tokenize(code, found.grammar as never) as unknown[]).map(drawn);
}

/**
 * What Prism's classes look like.
 *
 * Prism's own token names, coloured against `currentColor` rather than a fixed palette: a code block
 * is drawn on whatever ground the page gives it, and a theme that assumed white would be unreadable
 * in a dark band. The hues are the ones every editor theme has agreed on — a comment recedes, a
 * string is warm, a keyword carries the weight.
 *
 * Only the token types this product's languages actually produce; Prism has dozens and a stylesheet
 * naming all of them would be a claim about languages nobody has loaded.
 */
export const CODE_CSS = `
.token.comment, .token.prolog, .token.doctype, .token.cdata {
  color: color-mix(in srgb, currentColor 45%, transparent);
  font-style: italic;
}
.token.punctuation { color: color-mix(in srgb, currentColor 60%, transparent); }
.token.string, .token.char, .token.attr-value, .token.regex { color: #B25E28; }
.token.number, .token.boolean, .token.constant, .token.symbol { color: #7A4FBF; }
.token.keyword, .token.atrule, .token.important, .token.selector { color: #0F7A5A; font-weight: 600; }
.token.function, .token.class-name, .token.tag { color: #1E6FB8; }
.token.attr-name, .token.property, .token.variable { color: #8A5A00; }
.token.operator, .token.entity, .token.url { color: color-mix(in srgb, currentColor 75%, transparent); }
.token.deleted { color: #B23A3A; }
.token.inserted { color: #2E7D32; }
`;
