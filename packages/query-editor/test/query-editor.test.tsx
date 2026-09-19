import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { QueryEditor } from '../src/query-editor';
import { JqlEditor } from '../src/jql-editor';

describe('QueryEditor', () => {
  it('renders parsed default filters without an Office UI dependency', () => {
    const markup = renderToStaticMarkup(<QueryEditor defaultValue="예산 from:minsu -has:attachment" />);
    expect(markup).toContain('value="예산"');
    expect(markup).toContain('작성자');
    expect(markup).toContain('minsu');
    expect(markup).toContain('제외 · 포함: attachment 제거');
  });

  it('uses host operator labels and option labels', () => {
    const markup = renderToStaticMarkup(<QueryEditor
      defaultValue="owner:jiho"
      operators={[{
        key: 'owner',
        label: '담당자',
        options: [{ value: 'jiho', label: '박지호', description: '디자인팀' }],
      }]}
    />);
    expect(markup).toContain('담당자');
    expect(markup).toContain('박지호');
  });
});

describe('JqlEditor', () => {
  it('renders a standalone JQL input with templates and diagnostics', () => {
    const html = renderToStaticMarkup(<JqlEditor defaultValue="project =" />);

    expect(html).toContain('aria-label="JQL 검색"');
    expect(html).toContain('내 미해결 업무');
    expect(html).toContain('1개 오류');
  });
});
