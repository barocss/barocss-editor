import { describe, expect, it } from 'vitest';
import {
  addQueryFilter,
  commonQueryOperators,
  filterQueryOperators,
  filterQueryOptions,
  mergeQueryText,
  parseQuery,
  stringifyQuery,
  type QueryOperator,
} from '../src/core';

describe('query model', () => {
  it('parses text, filters, quoted values, aliases, and exclusions', () => {
    const operators: QueryOperator[] = [
      ...commonQueryOperators,
      { key: 'owner', label: '담당자', aliases: ['assignee'] },
    ];
    expect(parseQuery('분기 보고서 from:@minsu in:"기획 팀" -has:attachment assignee:jiho', operators)).toEqual({
      text: '분기 보고서',
      filters: [
        { key: 'from', value: '@minsu', negated: false },
        { key: 'in', value: '기획 팀', negated: false },
        { key: 'has', value: 'attachment', negated: true },
        { key: 'owner', value: 'jiho', negated: false },
      ],
    });
  });

  it('leaves unknown operators in the free text', () => {
    expect(parseQuery('budget unknown:value from:mina')).toEqual({
      text: 'budget unknown:value',
      filters: [{ key: 'from', value: 'mina', negated: false }],
    });
  });

  it('preserves unsupported query syntax without removing quotes', () => {
    const jql = 'project = PRODUCT AND status IN ("To Do", "In Progress") ORDER BY updated DESC';
    expect(parseQuery(jql)).toEqual({ text: jql, filters: [] });
  });

  it('reads a quoted filter value while preserving quoted free text', () => {
    expect(parseQuery('"quarterly plan" in:"Design Team"')).toEqual({
      text: '"quarterly plan"',
      filters: [{ key: 'in', value: 'Design Team', negated: false }],
    });
  });

  it('round-trips spaces, quotes, and backslashes', () => {
    const document = {
      text: 'quarterly plan',
      filters: [
        { key: 'in', value: 'Design Team' },
        { key: 'has', value: 'a"b\\c', negated: true },
      ],
    };
    expect(parseQuery(stringifyQuery(document))).toEqual({
      text: document.text,
      filters: [
        { key: 'in', value: 'Design Team', negated: false },
        { key: 'has', value: 'a"b\\c', negated: true },
      ],
    });
  });

  it('replaces single-value filters and keeps multiple-value filters', () => {
    const start = { text: '', filters: [{ key: 'after', value: '2026-01-01' }, { key: 'from', value: 'a' }] };
    const dated = addQueryFilter(start, { key: 'after', value: '2026-09-01' });
    const authors = addQueryFilter(dated, { key: 'from', value: 'b' });
    expect(authors.filters).toEqual([
      { key: 'from', value: 'a' },
      { key: 'after', value: '2026-09-01' },
      { key: 'from', value: 'b' },
    ]);
  });

  it('extracts pasted filters from the editable text', () => {
    expect(mergeQueryText({ text: '예산 from:mina after:2026-09-01', filters: [{ key: 'in', value: 'finance' }] })).toEqual({
      text: '예산',
      filters: [
        { key: 'in', value: 'finance' },
        { key: 'from', value: 'mina', negated: false },
        { key: 'after', value: '2026-09-01', negated: false },
      ],
    });
  });
});

describe('suggestion filtering', () => {
  it('finds operators by key, label, and description', () => {
    expect(filterQueryOperators('작성').map(item => item.key)).toContain('from');
    expect(filterQueryOperators('channel').map(item => item.key)).toEqual([]);
    expect(filterQueryOperators('date').map(item => item.key)).toEqual([]);
  });

  it('finds values by metadata', () => {
    const options = [
      { value: 'attachment', label: '첨부 파일', keywords: ['file'] },
      { value: 'mention', label: '멘션' },
    ];
    expect(filterQueryOptions(options, 'file')).toEqual([options[0]]);
    expect(filterQueryOptions(options, '멘')).toEqual([options[1]]);
  });
});
