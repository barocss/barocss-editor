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

