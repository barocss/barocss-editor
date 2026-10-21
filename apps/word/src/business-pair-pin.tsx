import { readWordFile } from '@barocss/office-word';

export function PinnedContent({ text }: { text: string }) {
  const file = readWordFile(text);
  if ('error' in file) return <p role="status">보관한 자료를 읽을 수 없습니다.</p>;
  const paragraphs: string[] = [];
  const contentText = (value: unknown): string => {
    if (!value || typeof value !== 'object') return '';
    const node = value as { text?: string; content?: unknown[] };
    return (node.text ?? '') + (node.content?.map(contentText).join('') ?? '');
  };
  const collect = (value: unknown): void => {
    if (!value || typeof value !== 'object') return;
    const node = value as { stype?: string; content?: unknown[] };
    if (node.stype === 'resources') return;
    if (node.stype === 'paragraph' || node.stype === 'heading') paragraphs.push(contentText(node));
    else node.content?.forEach(collect);
  };
  collect(file.document);
  return <div className="w-business-pin"><p>보관된 내용 · 텍스트 보기</p>
    {paragraphs.map((paragraph, index) => <p key={index}>{paragraph || '\u00a0'}</p>)}
    <details><summary>전체 원본과 서식 데이터</summary><pre style={{ maxHeight: 240, overflow: 'auto', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{text}</pre></details>
  </div>;
}


/** Display evidence only. The native bookmark and stored pin remain the locator. */
export function PinnedItemExcerpt({ text, bookmarkId }: { text: string; bookmarkId: string }) {
  const file = readWordFile(text);
  if ('error' in file) return <p>보관한 원문을 읽을 수 없습니다.</p>;
  type Node = { stype?: string; text?: string; attributes?: { id?: string }; content?: unknown[] };
  const matches: Node[] = [];
  const visit = (value: unknown, paragraph?: Node): void => {
    if (!value || typeof value !== 'object') return;
    const node = value as Node, owner = node.stype === 'paragraph' ? node : paragraph;
    if (node.stype === 'bookmarkAnchor' && node.attributes?.id === bookmarkId && owner) matches.push(owner);
    node.content?.forEach(child => visit(child, owner));
  };
  const content = (value: unknown): string => {
    if (!value || typeof value !== 'object') return '';
    const node = value as Node;
    return (node.text ?? '') + (node.content?.map(content).join('') ?? '');
  };
  visit(file.document);
  return <p className="w-business-item-excerpt">{matches.length === 1 ? content(matches[0]) : '보관한 문단 위치를 확인할 수 없습니다.'}</p>;
}
