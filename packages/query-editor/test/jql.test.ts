import { describe, expect, it } from 'vitest';
import {
  applyJqlSuggestion,
  getJqlSuggestions,
  jiraJqlCatalog,
  parseJql,
  stringifyJql,
} from '../src/jql';

describe('JQL parser', () => {
  it('parses logical clauses, lists, and sorting', () => {
    const source = 'project = PRODUCT AND status IN ("To Do", "In Progress") ORDER BY updated DESC';
    const result = parseJql(source, jiraJqlCatalog);

    expect(result.valid).toBe(true);
    expect(result.document.expression?.type).toBe('logical');
    expect(result.document.orderBy).toEqual([
      expect.objectContaining({ field: 'updated', direction: 'DESC' }),
    ]);
    expect(stringifyJql(result.document)).toBe(source);
  });

  it('parses functions and EMPTY values', () => {
    const result = parseJql('assignee = currentUser() AND resolution IS EMPTY', jiraJqlCatalog);

    expect(result.valid).toBe(true);
    expect(stringifyJql(result.document)).toBe('assignee = currentUser() AND resolution IS EMPTY');
  });

  it('supports groups and OR expressions', () => {
    const source = 'project = PRODUCT AND (status = "To Do" OR status = Done)';
    const result = parseJql(source, jiraJqlCatalog);

    expect(result.valid).toBe(true);
    expect(stringifyJql(result.document)).toBe(source);
  });

  it('reports invalid operators and incomplete values', () => {
    const invalidOperator = parseJql('summary = login', jiraJqlCatalog);
    const incomplete = parseJql('project =', jiraJqlCatalog);

    expect(invalidOperator.valid).toBe(false);
    expect(invalidOperator.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'invalid-operator' }),
    ]));
    expect(incomplete.valid).toBe(false);
    expect(incomplete.diagnostics[0]?.message).toContain('값이 필요');
  });

  it('keeps unknown fields as warnings', () => {
    const result = parseJql('customField = enabled', jiraJqlCatalog);

    expect(result.valid).toBe(true);
    expect(result.diagnostics[0]).toEqual(expect.objectContaining({ code: 'unknown-field', severity: 'warning' }));
  });
});

describe('JQL suggestions', () => {
  it('suggests fields, operators, values, and sort fields by cursor context', () => {
    expect(getJqlSuggestions('', 0).some(item => item.id === 'field:project')).toBe(true);
    expect(getJqlSuggestions('status ', 7).some(item => item.id === 'operator:IN')).toBe(true);
    expect(getJqlSuggestions('status IN (', 11).some(item => item.id === 'value:In Progress')).toBe(true);
    expect(getJqlSuggestions('ORDER BY ', 9).some(item => item.id === 'sort:updated')).toBe(true);
  });

  it('suggests boolean keywords after a complete clause', () => {
    const suggestions = getJqlSuggestions('project = PRODUCT ', 18);

    expect(suggestions.map(item => item.label)).toEqual(expect.arrayContaining(['AND', 'OR', 'ORDER BY']));
  });

  it('applies a suggestion to its replacement range', () => {
    const suggestion = getJqlSuggestions('proj', 4).find(item => item.id === 'field:project');
    expect(suggestion).toBeDefined();

    expect(applyJqlSuggestion('proj', suggestion!)).toEqual({ source: 'project ', cursor: 8 });
  });
});
