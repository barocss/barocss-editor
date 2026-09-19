import { describe, expect, it } from 'vitest';
import { parseQuery, stringifyQuery, type QueryDocument } from '../src/core';

describe('real search scenarios', () => {
  it.each([
    {
      name: 'Korean free text and filters',
      source: '오피스 통합 in:product status:review',
      text: '오피스 통합',
      filters: [['in', 'product', false], ['status', 'review', false]],
    },
    {
      name: 'date range',
      source: 'after:2026-09-01 before:2026-09-17',
      text: '',
      filters: [['after', '2026-09-01', false], ['before', '2026-09-17', false]],
    },
    {
      name: 'repeated values',
      source: 'from:minsu from:jiho',
      text: '',
      filters: [['from', 'minsu', false], ['from', 'jiho', false]],
    },
    {
      name: 'excluded value',
      source: 'type:comment -has:attachment',
      text: '',
      filters: [['type', 'comment', false], ['has', 'attachment', true]],
    },
    {
      name: 'unknown host syntax',
      source: 'owner:mina unknown:value',
      text: 'owner:mina unknown:value',
      filters: [],
    },
  ])('parses $name', ({ source, text, filters }) => {
    const document = parseQuery(source);
    expect(document.text).toBe(text);
    expect(document.filters.map(filter => [filter.key, filter.value, Boolean(filter.negated)])).toEqual(filters);
  });

  it.each([
    'project = PRODUCT AND assignee = currentUser()',
    'status IN ("To Do", "In Progress") AND priority >= Medium',
    '(status = resolved AND project = SYS) OR assignee = bobsmith',
    'text ~ "jira software" ORDER BY updated DESC',
  ])('passes unsupported JQL through: %s', source => {
    const parsed = parseQuery(source);
    expect(parsed).toEqual<QueryDocument>({ text: source, filters: [] });
    expect(stringifyQuery(parsed)).toBe(source);
  });
});
