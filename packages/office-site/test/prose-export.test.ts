import { describe, expect, it } from 'vitest';
import { createSchema, validateTree } from '@barocss/schema';
import { DataStore } from '@barocss/datastore';
import { getSiteSchemaDefinition } from '../src/site-schema';
import { createSiteEditor } from '../src/site-kit';
import { registerSiteRenderers } from '../src/renderers';
import { exportSite } from '../src/export-html';

describe('shared written bodies in Site', () => {
  it('accepts and exports saved checklist, disclosure and callout states', () => {
    registerSiteRenderers();
    const schema = createSchema('site-prose', getSiteSchemaDefinition());
    const body = [
      { stype: 'taskItem', attributes: { checked: true }, content: [{ stype: 'inline-text', text: 'Ship Note' }] },
      { stype: 'bDetails', attributes: { open: false }, content: [
        { stype: 'bSummary', content: [{ stype: 'inline-text', text: 'Agenda' }] },
        { stype: 'callout', attributes: { type: 'warning', title: 'Decision' }, content: [
          { stype: 'paragraph', content: [{ stype: 'inline-text', text: 'Keep the final input' }] }
        ] }
      ] }
    ];
    const document = { stype: 'document', content: [
      { stype: 'surface', attributes: { kind: 'flow', path: '/', name: 'Notes' }, content: body }
    ] };
    expect(validateTree(schema, document)).toEqual([]);
    // The same body is also legal in a stored rich-text field.
    expect(schema.getNodeType('richText')?.content).toContain('taskItem');
    const store = new DataStore(undefined as never, schema);
    const editor = createSiteEditor({ schema, dataStore: store } as never);
    try {
      editor.loadDocument(document, 'site-prose');
      const html = new DOMParser().parseFromString(exportSite(editor)[0].html, 'text/html');
      expect(html.querySelector('[role="checkbox"]')?.getAttribute('aria-checked')).toBe('true');
      expect(html.querySelector('[role="checkbox"]')?.hasAttribute('disabled')).toBe(true);
      expect(html.querySelector('details')?.hasAttribute('open')).toBe(false);
      expect(html.querySelector('summary')?.textContent).toBe('Agenda');
      expect(html.querySelector('.w-callout')?.getAttribute('data-callout-type')).toBe('warning');
      expect(html.querySelector('.w-callout-title')?.textContent).toBe('Decision');
      expect(html.body.textContent).toContain('Keep the final input');
    } finally {
      editor.destroy();
    }
  });
});
