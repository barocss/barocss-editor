import { describe, expect, it } from 'vitest';
import { createSchema } from '../src/schema';
import { getOfficeSchemaDefinition } from '../src/office-schema';
import { getProseNodeDefinitions } from '../src/prose-schema';
import { validateTree } from '../src/validate-tree';

const content = '(paragraph | taskItem | bDetails | callout)+';
const definition = getOfficeSchemaDefinition();
const schema = createSchema('prose-test', {
  ...definition,
  topNode: 'note',
  nodes: {
    ...definition.nodes, ...getProseNodeDefinitions(content),
    note: { name: 'note', content }
  }
});
const paragraph = { stype: 'paragraph', content: [{ stype: 'inline-text', text: 'Discuss' }] };

describe('optional prose vocabulary', () => {
  it('validates nested tasks, disclosures and callouts with durable state', () => {
    expect(validateTree(schema, { stype: 'note', content: [
      { stype: 'bDetails', attributes: { open: false }, content: [
        { stype: 'bSummary', content: [{ stype: 'inline-text', text: 'Agenda' }] },
        { stype: 'callout', attributes: { type: 'tip' }, content: [
          { stype: 'calloutTitle', content: [{ stype: 'inline-text', text: 'Decision' }] },
          { stype: 'taskItem', attributes: { checked: true }, content: [{ stype: 'inline-text', text: 'Ship' }] }
        ] }
      ] }
    ] })).toEqual([]);
  });

  it('does not admit layout nodes into a nested body', () => {
    expect(validateTree(schema, { stype: 'note', content: [
      { stype: 'callout', content: [{ stype: 'frame', content: [] }] }
    ] }).some(finding => finding.stype === 'callout')).toBe(true);
  });

  it('requires a disclosure summary before its body and validates state types', () => {
    expect(validateTree(schema, { stype: 'note', content: [
      { stype: 'bDetails', attributes: { open: 'false' }, content: [paragraph] }
    ] }).length).toBeGreaterThan(0);
  });

  it('allows an optional inline title only before a nonempty body', () => {
    const title = { stype: 'calloutTitle', content: [{ stype: 'inline-text', text: 'Title', marks: [{ type: 'bold' }] }] };
    for (const children of [[paragraph], [title, paragraph]]) {
      expect(validateTree(schema, { stype: 'note', content: [{ stype: 'callout', content: children }] })).toEqual([]);
    }
    for (const children of [[title], [paragraph, title], [title, title, paragraph]]) {
      expect(validateTree(schema, { stype: 'note', content: [{ stype: 'callout', content: children }] }).length).toBeGreaterThan(0);
    }
  });

  it('keeps the base Office vocabulary unchanged', () => {
    for (const name of ['taskItem', 'bDetails', 'bSummary', 'callout', 'calloutTitle']) {
      expect(getOfficeSchemaDefinition().nodes[name]).toBeUndefined();
    }
  });
});
