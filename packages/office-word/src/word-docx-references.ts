/** The bounded bookmark/REF bridge. No field instruction is evaluated. */
export type DocxNode = { stype?: string; text?: string; attributes?: Record<string, unknown>; marks?: { stype: string; range?: [number, number]; attrs?: Record<string, unknown> }[]; content?: DocxNode[] };
const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const attribute = (e: Element, name: string) => e.getAttributeNS(W, name) ?? '';
const locked = (e: Element) => ['1', 'true', 'on'].includes(attribute(e, 'fldLock'));
const paragraphOf = (e: Element): Element | undefined => {
  for (let p: Element | null = e; p; p = p.parentElement) if (p.namespaceURI === W && p.localName === 'p') return p;
};

export function parseDocxReference(instruction: string): DocxNode | undefined {
  // Only a complete REF grammar is accepted. Other fields/switches stay cached text.
  const match = /^\s*REF\s+(?:"([^"\\]+)"|([^\s"\\]+))((?:\s+\\(?:h|p)|\s+\\\*\s+MERGEFORMAT)*)\s*$/i.exec(instruction);
  if (!match) return;
  return { stype: 'fieldRef', attributes: { targetId: match[1] ?? match[2], format: /\\p(?:\s|$)/i.test(match[3]) ? 'aboveBelow' : 'text', useHyperlink: /\\h(?:\s|$)/i.test(match[3]) } };
}

export function docxBookmarkPairs(body: Element, warnings: Set<string>) {
  const starts = new Map<string, Element[]>(), ends = new Map<string, Element[]>();
  for (const e of [...body.getElementsByTagNameNS(W, 'bookmarkStart')]) {
    const id = attribute(e, 'id'); starts.set(id, [...(starts.get(id) ?? []), e]);
  }
  for (const e of [...body.getElementsByTagNameNS(W, 'bookmarkEnd')]) {
    const id = attribute(e, 'id'); ends.set(id, [...(ends.get(id) ?? []), e]);
  }
  const pairs = new Map<Element, { name: string; end: Element }>();
  const names = new Set<string>();
  for (const [id, elements] of starts) {
    const start = elements[0], end = ends.get(id)?.[0], name = attribute(start, 'name');
    if (!id || elements.length !== 1 || ends.get(id)?.length !== 1 || !end || !name || names.has(name.toLocaleLowerCase()) ||
      !paragraphOf(start) || paragraphOf(start) !== paragraphOf(end) || !(start.compareDocumentPosition(end) & 4) ||
      start.hasAttributeNS(W, 'colFirst') || start.hasAttributeNS(W, 'colLast')) {
      warnings.add('일부 책갈피는 중복·손상 또는 여러 문단/표 열 범위여서 가져오지 못했습니다.'); continue;
    }
    names.add(name.toLocaleLowerCase()); pairs.set(start, { name, end });
  }
  if ([...ends.keys()].some(id => !starts.has(id))) warnings.add('시작 위치가 없는 책갈피 끝 표식은 제외했습니다.');
  return pairs;
}

export function readDocxInlines(
  paragraph: Element, readText: (run: Element, text: string) => DocxNode,
  pairs: ReturnType<typeof docxBookmarkPairs>, warnings: Set<string>,
): DocxNode[] {
  const result: DocxNode[] = [];
  type Frame = { code: string; cached: DocxNode[]; separated: boolean; nested: boolean; simple?: boolean };
  const fields: Frame[] = [];
  const active = new Map<Element, { name: string; anchor: DocxNode; texts: DocxNode[]; invalid: boolean }>();
  const append = (node: DocxNode) => {
    const field = fields.at(-1);
    if (field) { if (field.separated) field.cached.push(node); return; }
    for (const bookmark of active.values()) {
      if (node.stype === 'inline-text' && node.text) {
        node.marks = [...(node.marks ?? []), { stype: 'bookmark', attrs: { name: bookmark.name }, range: [0, node.text.length] }];
        bookmark.texts.push(node);
      } else if (node.stype !== 'inline-text') bookmark.invalid = true;
    }
    result.push(node);
  };
  const finishBookmark = (end: Element) => {
    const entry = active.get(end); if (!entry) return;
    if (entry.texts.length || entry.invalid) result.splice(result.indexOf(entry.anchor), 1);
    if (entry.invalid) {
      for (const node of entry.texts) node.marks = node.marks?.filter(m => m.stype !== 'bookmark' || m.attrs?.name !== entry.name);
      warnings.add('필드나 객체를 포함한 책갈피 범위는 가져오지 못했습니다.');
    }
    active.delete(end);
  };
  const walk = (e: Element) => {
    if (e.namespaceURI !== W) { warnings.add('일부 수식 또는 그림은 가져오지 못했습니다.'); for (const b of active.values()) b.invalid = true; return; }
    switch (e.localName) {
      case 'pPr': case 'rPr': case 'proofErr': return;
      case 'bookmarkStart': {
        const pair = pairs.get(e); if (!pair) return;
        if (fields.length) { warnings.add('필드 내부의 책갈피는 가져오지 못했습니다.'); return; }
        const anchor = { stype: 'bookmarkAnchor', attributes: { id: pair.name } };
        result.push(anchor); active.set(pair.end, { name: pair.name, anchor, texts: [], invalid: false }); return;
      }
      case 'bookmarkEnd': finishBookmark(e); return;
      case 'fldSimple': {
        const reference = parseDocxReference(attribute(e, 'instr'));
        if (reference && !locked(e) && !fields.length && !e.getElementsByTagNameNS(W, 'fldSimple').length && !e.getElementsByTagNameNS(W, 'fldChar').length && !e.getElementsByTagNameNS(W, 'bookmarkStart').length) append(reference);
        else {
          warnings.add('지원하지 않는 필드는 저장된 표시 텍스트로 가져왔습니다.');
          if (fields.length >= 64) throw new Error('필드 중첩이 지원 한도를 초과합니다.');
          const base = fields.length;
          fields.push({ code: '', cached: [], separated: true, nested: true, simple: true });
          [...e.children].forEach(walk);
          while (fields.length > base + 1) { const broken = fields.pop()!; warnings.add('끝나지 않은 필드는 저장된 표시 텍스트로 가져왔습니다.'); broken.cached.forEach(append); }
          const cached = fields.pop()!; cached.cached.forEach(append);
        }
        return;
      }
      case 'fldChar': {
        const kind = attribute(e, 'fldCharType');
        if (kind === 'begin') {
          if (fields.length >= 64) throw new Error('필드 중첩이 지원 한도를 초과합니다.');
          if (fields.length) fields[fields.length - 1].nested = true;
          fields.push({ code: '', cached: [], separated: false, nested: fields.length > 0 || locked(e) });
        } else if (kind === 'separate' && fields.length && !fields.at(-1)!.simple) fields[fields.length - 1].separated = true;
        else if (kind === 'end' && fields.length && !fields.at(-1)!.simple) {
          const field = fields.pop()!;
          const reference = !field.nested && parseDocxReference(field.code);
          if (reference) append(reference);
          else { warnings.add('지원하지 않는 필드는 저장된 표시 텍스트로 가져왔습니다.'); field.cached.forEach(append); }
        } else warnings.add('짝이 맞지 않는 필드 표식은 제외했습니다.');
        return;
      }
      case 'instrText': {
        const field = fields.at(-1);
        if (field && !field.separated) field.code += e.textContent ?? '';
        else warnings.add('필드 밖의 명령 문자열은 제외했습니다.');
        return;
      }
      case 't': case 'tab': case 'br': case 'cr': {
        const run = e.parentElement;
        if (run?.localName !== 'r') return;
        const text = e.localName === 't' ? e.textContent ?? '' : e.localName === 'tab' ? '\t' : '\n';
        if (e.localName === 'br' && attribute(e, 'type') === 'page') warnings.add('문단 안의 페이지 나누기는 줄바꿈으로 가져왔습니다.');
        if (text) append(readText(run, text)); return;
      }
      case 'del': warnings.add('삭제로 표시된 변경 내용은 본문에서 제외했습니다.'); return;
      case 'r': case 'p': [...e.children].forEach(walk); return;
      default:
        warnings.add('일부 링크·변경 추적·객체는 표시 텍스트만 가져왔습니다.');
        if (!e.children.length) for (const b of active.values()) b.invalid = true;
        [...e.children].forEach(walk);
    }
  };
  [...paragraph.children].forEach(walk);
  while (fields.length) { const field = fields.pop()!; warnings.add('끝나지 않은 필드는 저장된 표시 텍스트로 가져왔습니다.'); field.cached.forEach(append); }
  for (const [end, entry] of active) { entry.invalid = true; finishBookmark(end); }
  // An atom at either boundary needs an editable text position next to it.
  if (result[0]?.stype !== 'inline-text') result.unshift({ stype: 'inline-text', text: '' });
  if (result.at(-1)?.stype !== 'inline-text') result.push({ stype: 'inline-text', text: '' });
  return result.length ? result : [{ stype: 'inline-text', text: '' }];
}

export function prepareDocxReferences(root: DocxNode, warnings: Set<string>, esc: (value: unknown) => string) {
  type Fragment = { node: DocxNode; from: number; to: number; offset: number; block: DocxNode };
  type Bookmark = { name: string; id: number; fragments: Fragment[]; anchor?: DocxNode; order: number; valid: boolean };
  const bookmarks = new Map<string, Bookmark>(), order = new Map<DocxNode, number>();
  let sequence = 0;
  const inspect = (block: DocxNode) => {
    let offset = 0;
    for (const node of block.content ?? []) {
      order.set(node, sequence++);
      if (node.stype === 'bookmarkAnchor' && typeof node.attributes?.id === 'string') {
        const name = node.attributes.id;
        if (bookmarks.has(name)) bookmarks.get(name)!.valid = false;
        else bookmarks.set(name, { name, id: bookmarks.size, fragments: [], anchor: node, order: order.get(node)!, valid: true });
      }
      for (const mark of node.marks ?? []) {
        if (mark.stype !== 'bookmark' || typeof mark.attrs?.name !== 'string' || typeof node.text !== 'string') continue;
        const name = mark.attrs.name, [from, to] = mark.range ?? [0, node.text.length];
        let bookmark = bookmarks.get(name);
        if (!bookmark) { bookmark = { name, id: bookmarks.size, fragments: [], order: order.get(node)!, valid: true }; bookmarks.set(name, bookmark); }
        if (bookmark.anchor || from < 0 || to > node.text.length || from >= to) bookmark.valid = false;
        bookmark.fragments.push({ node, from, to, offset: offset + from, block });
      }
      offset += node.text?.length ?? (node.stype === 'bookmarkAnchor' ? 0 : 1);
    }
  };
  const walk = (node: DocxNode) => {
    if (['paragraph', 'heading', 'bTableCell', 'bTableHeaderCell'].includes(node.stype ?? '')) inspect(node);
    else if (['document', 'surface', 'bTable', 'bTableBody', 'bTableRow', 'bTableHeader'].includes(node.stype ?? '') && !(node.stype === 'surface' && node.attributes?.kind === 'canvas')) node.content?.forEach(walk);
  };
  walk(root);
  const names = new Map<string, string>(), used = new Set<string>();
  const safeName = (name: string) => {
    const found = names.get(name); if (found) return found;
    let base = name.replace(/[^\p{L}\p{N}_]/gu, '_');
    if (!/^[\p{L}_]/u.test(base)) base = `B_${base}`;
    base = [...base].slice(0, 40).join('');
    let safe = base, i = 1;
    while (used.has(safe.toLocaleLowerCase())) { const suffix = `_${i++}`; safe = [...base].slice(0, 40 - suffix.length).join('') + suffix; }
    names.set(name, safe); used.add(safe.toLocaleLowerCase());
    if (safe !== name) warnings.add(`DOCX 책갈피 이름을 “${name}”에서 “${safe}”로 변경했습니다. 참조 대상도 함께 변경합니다.`);
    return safe;
  };
  const boundaries = new Map<DocxNode, Map<number, { starts: Bookmark[]; ends: Bookmark[] }>>();
  const boundary = (node: DocxNode, offset: number) => {
    if (!boundaries.has(node)) boundaries.set(node, new Map());
    const map = boundaries.get(node)!; if (!map.has(offset)) map.set(offset, { starts: [], ends: [] }); return map.get(offset)!;
  };
  for (const bookmark of bookmarks.values()) {
    const fragments = bookmark.fragments;
    for (let i = 1; i < fragments.length; i++) {
      const before = fragments[i - 1], after = fragments[i];
      if (before.block !== after.block || before.offset + before.to - before.from !== after.offset) bookmark.valid = false;
    }
    if (!bookmark.valid) { warnings.add('분리되거나 중복된 책갈피 범위는 DOCX로 보존하지 못했습니다.'); continue; }
    safeName(bookmark.name);
    if (fragments.length) {
      boundary(fragments[0].node, fragments[0].from).starts.push(bookmark);
      const last = fragments[fragments.length - 1]; boundary(last.node, last.to).ends.push(bookmark);
    }
  }
  const start = (b: Bookmark) => `<w:bookmarkStart w:id="${b.id}" w:name="${esc(safeName(b.name))}"/>`;
  const end = (b: Bookmark) => `<w:bookmarkEnd w:id="${b.id}"/>`;
  return {
    offsets: (node: DocxNode) => [...(boundaries.get(node)?.keys() ?? [])],
    at: (node: DocxNode, offset: number) => { const at = boundaries.get(node)?.get(offset); return at ? at.ends.map(end).join('') + at.starts.map(start).join('') : ''; },
    anchor: (node: DocxNode) => { const b = bookmarks.get(String(node.attributes?.id)); return b?.valid && b.anchor === node ? start(b) + end(b) : ''; },
    field: (node: DocxNode) => {
      const a = node.attributes ?? {}, target = String(a.targetId ?? '');
      if (a.targetKind && a.targetKind !== 'bookmark') return;
      if (!target || !['text', 'aboveBelow'].includes(String(a.format ?? 'text'))) return;
      const bookmark = bookmarks.get(target);
      const text = !bookmark?.valid ? 'Error! Reference source not found.' : a.format === 'aboveBelow' ? bookmark.order < (order.get(node) ?? 0) ? 'above' : 'below' : bookmark.anchor ? safeName(target) : bookmark.fragments.map(f => f.node.text!.slice(f.from, f.to)).join('').trim();
      if (bookmark?.anchor && a.format !== 'aboveBelow') warnings.add('위치 책갈피의 텍스트 참조는 외부 Word에서 필드를 갱신하면 빈 문자열이 될 수 있습니다.');
      const instruction = ` REF ${safeName(target)}${a.useHyperlink ? ' \\h' : ''}${a.format === 'aboveBelow' ? ' \\p' : ''} `;
      return `<w:fldSimple w:instr="${esc(instruction)}"><w:r><w:t xml:space="preserve">${esc(text)}</w:t></w:r></w:fldSimple>`;
    },
  };
}
