/**
 * A code block, **tokenized and drawn** — the same markup in the editor and on the published page.
 *
 * ## Why Prism does both jobs
 *
 * Syntax highlighting is two things: deciding what each character *is*, and drawing that. A scanner
 * written by hand can do the first badly for a handful of C-family languages; it cannot do HTML or
 * CSS at all, because those need a grammar rather than a word list. Prism has the grammars, and its
 * `highlight` fills the block's own element with its own escaped output — the code never reaches the
 * page as markup a document could have written.
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

/**
 * A code block, **drawing itself**.
 *
 * `external({ managesDOM: true })` is how a node type says *I own my element* — the equivalent of a
 * ProseMirror NodeView, and the honest home for a block whose content is a tokenized tree rather
 * than a list of children. Two things it buys over building vnodes:
 *
 * - **No wrapper and no keys.** The element the renderer places *is* this `pre`, and what is inside
 *   it is nobody else's to reconcile — so the tokens are set once with `Prism.highlight` instead of
 *   being mapped one for one into vnodes that then need keys to be told apart.
 * - **A place for the editor to live.** A code block is edited by a real editor, and an editor is
 *   exactly the kind of DOM a renderer cannot express: it has its own view, its own state and its
 *   own idea of what is in it. Owning the element is what lets one be put *in the block's own place*
 *   rather than over it.
 *
 * `innerHTML` here is Prism's own escaped output and nothing else — the code never reaches the page
 * as markup, which is what `Prism.highlight` guarantees and why it is used rather than a string this
 * file assembles.
 */
export const codeComponent = {
  managesDOM: true as const,

  mount(props: Record<string, any>, container: HTMLElement): HTMLElement {
    const pre = (container.ownerDocument ?? document).createElement('pre');
    pre.className = 'st-code';
    /*
     * The caret never enters a code block. That is what makes the token spans safe: they are this
     * component's, derived from the text, and nothing maps a caret through them.
     */
    pre.setAttribute('contenteditable', 'false');
    pre.setAttribute('spellcheck', 'false');
    paintInto(pre, props);
    return pre;
  },

  update(instance: { element?: HTMLElement }, _before: Record<string, any>, after: Record<string, any>): void {
    if (instance?.element) paintInto(instance.element, after);
  },

  unmount(): void {
    // Nothing held open: the editing layer is the app's and closes itself.
  }
};

/** The characters this node holds — its own when it has them, its children's when it does not. */
function wordsIn(props: Record<string, any>, depth = 0): string {
  if (typeof props?.text === 'string') return props.text;
  if (depth > 8) return '';
  return ((props?.content ?? []) as unknown[])
    .map((one) => (one && typeof one === 'object' ? wordsIn(one as Record<string, any>, depth + 1) : ''))
    .join('');
}

/** Fill an element with the code, coloured if the language is one Prism knows. */
function paintInto(pre: HTMLElement, props: Record<string, any>): void {
  const language = String(props?.attributes?.language ?? '');
  const code = wordsIn(props);
  const found = grammarFor(language);

  if (language) pre.setAttribute('data-language', language);
  else pre.removeAttribute('data-language');

  if (!found) {
    // No grammar: the characters, and no claim about what any of them are.
    pre.textContent = code;
    return;
  }
  pre.innerHTML = Prism.highlight(code, found.grammar as never, found.name);
}

/** The grammar for what a reader wrote, or nothing when Prism has never heard of it. */
export function grammarFor(language: unknown): { name: string; grammar: unknown } | undefined {
  const said = String(language ?? '').trim().toLowerCase();
  const name = ALIAS[said];
  const grammar = name ? (Prism.languages as Record<string, unknown>)[name] : undefined;
  return grammar ? { name, grammar } : undefined;
}

/**
 * What Prism's classes look like.
 *
 * ## Told apart by **weight**, not by hue — and that was measured
 *
 * The header above used to say the colours were "against `currentColor` rather than a fixed
 * palette", and six of the nine roles were hard-coded hex. Measured on the two grounds this product
 * actually draws code on:
 *
 * - on the light code ground, the string colour came out at **4.05:1** — under AA;
 * - on a dark band, **every one of the six failed**, between 3.17 and 4.05.
 *
 * One of them was `#0F7A5A`, a brand green that had not existed anywhere in this repository since
 * the palette was redrawn: a stale colour nobody could see, in a stylesheet nothing measured.
 *
 * So the roles are told apart the way a printed book tells them apart — weight, italics, and how
 * much of the ink they take — and every one of them is `currentColor`. A comment recedes, a string
 * leans, a keyword carries the weight, a function is solid. It reads on the paper and on the dark
 * band from the same rule, follows a repainted palette by construction, and is the only version of
 * this that a two-ink page could honestly ship.
 *
 * The cost is real and worth stating: six hues distinguish more roles than four weights do. For a
 * snippet on a page that is the right trade — the code is there to be *read*, not edited — and a
 * document that wants its own syntax palette is a feature, in `docs/BACKLOG.md`.
 *
 * Only the token types this product's languages actually produce; Prism has dozens and a stylesheet
 * naming all of them would be a claim about languages nobody has loaded.
 */
export const CODE_CSS = `
.token.comment, .token.prolog, .token.doctype, .token.cdata {
  color: color-mix(in srgb, currentColor 52%, transparent);
  font-style: italic;
}
.token.punctuation { color: color-mix(in srgb, currentColor 62%, transparent); }
.token.string, .token.char, .token.attr-value, .token.regex {
  color: color-mix(in srgb, currentColor 88%, transparent);
  font-style: italic;
}
.token.number, .token.boolean, .token.constant, .token.symbol {
  color: color-mix(in srgb, currentColor 88%, transparent);
}
.token.keyword, .token.atrule, .token.important, .token.selector {
  color: currentColor;
  font-weight: 700;
}
.token.function, .token.class-name, .token.tag { color: currentColor; font-weight: 600; }
.token.attr-name, .token.property, .token.variable { color: currentColor; }
.token.operator, .token.entity, .token.url { color: color-mix(in srgb, currentColor 75%, transparent); }
/*
 * The two that are genuinely about **change** rather than about syntax, and the only place a hue
 * still earns its keep: a diff says added and removed, and nothing about weight says which is which.
 * Written as a mix with the ink so they sit on either ground.
 */
.token.deleted { color: color-mix(in srgb, #C0392B 78%, currentColor); }
.token.inserted { color: color-mix(in srgb, #1E7A3C 78%, currentColor); }
`;
