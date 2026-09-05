/**
 * **문서가 실제로 쓰는 글꼴** — 카탈로그는 `@barocss/office-controls` 로 갔다.
 *
 * 목록 자체(`WORD_FONT_CATALOGUE`·`isWebFont`·`googleFontUrl`·`fontFaceSpecs`)는 *읽는 사람에게
 * 내놓는 선택지* 이고 덱도 그것을 쓴다. 여기 남은 것은 **이 문서를 훑는** 질문이다.
 */
import { isWebFont } from '@barocss/office-controls';
import type { DocumentAccess, DocumentNode } from '@barocss/office-text';

/**
 * Every family the document names, whether by a style or by direct formatting.
 *
 * A host has to know this before the first measurement, not after: the document
 * arrives already set in something, and pagination measures whatever is on the
 * page when it runs. Finding out from the toolbar would be finding out too late.
 *
 * Stacks are reduced to their first family for the same reason the toolbar does
 * it — a stylesheet writes fallbacks, and the first name is the one that has to
 * be fetched.
 */
export function documentFontFamilies(doc: DocumentAccess): string[] {
  const found = new Set<string>();

  const add = (value: unknown): void => {
    if (typeof value !== 'string' || value.length === 0) return;
    const first = value.split(',')[0].trim().replace(/^["']|["']$/g, '');
    if (first) found.add(first);
  };

  const visit = (node: DocumentNode | undefined, depth: number): void => {
    if (!node || depth > 64) return;
    add(node.attributes?.fontFamily);
    for (const mark of node.marks ?? []) {
      if (mark?.stype === 'fontFamily') add(mark.attrs?.family);
    }
    // Style definitions are where most of the answer is: a document usually
    // names its fonts once, in its styles, and never again.
    for (const child of node.content ?? []) {
      visit(typeof child === 'string' ? doc.getNode(child) : child, depth + 1);
    }
  };

  visit(doc.getNode(doc.rootId), 0);
  return [...found].filter(isWebFont);
}
