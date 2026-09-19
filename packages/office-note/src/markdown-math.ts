/** Single-dollar math deliberately excludes edge whitespace, newlines and double-dollar fences. */
export function inlineMathAt(source: string, start: number): { tex: string; end: number } | undefined {
  if (source[start] !== '$' || source[start + 1] === '$' || source[start - 1] === '$') return;
  let slashes = 0; for (let i = start - 1; i >= 0 && source[i] === '\\'; i--) slashes++;
  if (slashes % 2) return;
  for (let end = start + 1; end < source.length; end++) {
    if (source[end] === '\n' || source[end] === '\r') return;
    if (source[end] !== '$') continue;
    let escaped = 0; for (let i = end - 1; i > start && source[i] === '\\'; i--) escaped++;
    if (escaped % 2) continue;
    const tex = source.slice(start + 1, end);
    if (!tex || /^\s|\s$/.test(tex) || source[end + 1] === '$' || /\d/.test(source[end + 1] ?? '')) return;
    return { tex, end: end + 1 };
  }
}

/** Use markdown-it's tokenization so code, escapes and link destinations stay literal. */
export function installMarkdownMath(md: any, save: (tex: string, block: boolean) => string) {
  md.inline.ruler.before('escape', 'note_math', (state: any, silent: boolean) => {
    const match = inlineMathAt(state.src, state.pos); if (!match) return false;
    if (!silent) { const token = state.push('text', '', 0); token.content = save(match.tex, false); }
    state.pos = match.end; return true;
  });
  md.block.ruler.before('fence', 'note_math_block', (state: any, start: number, end: number, silent: boolean) => {
    if (state.sCount[start] - state.blkIndent >= 4) return false;
    const line = (index: number) => state.src.slice(state.bMarks[index] + state.tShift[index], state.eMarks[index]);
    const first = line(start).trim(); if (!first.startsWith('$$')) return false;
    let tex: string, next: number;
    if (first.length > 4 && first.endsWith('$$')) { tex = first.slice(2, -2); next = start + 1; }
    else {
      if (first !== '$$') return false;
      next = start + 1;
      while (next < end && line(next).trim() !== '$$') next++;
      if (next === end) return false;
      tex = state.getLines(start + 1, next, state.blkIndent, false).replace(/\n$/, ''); next++;
    }
    if (!tex.trim()) return false;
    if (!silent) {
      state.push('paragraph_open', 'p', 1);
      const token = state.push('inline', '', 0); token.content = save(tex, true); token.children = [];
      state.push('paragraph_close', 'p', -1);
    }
    state.line = next; return true;
  }, { alt: ['paragraph', 'reference', 'blockquote', 'list'] });
}
