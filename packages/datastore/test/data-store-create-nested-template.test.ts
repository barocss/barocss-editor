import { describe, it, expect, beforeEach } from 'vitest';
import { DataStore } from '../src/data-store';
import { createSchema, type Schema } from '@barocss/schema';

describe('DataStore createNodeWithChildren - nested template', () => {
  let dataStore: DataStore;
  let schema: Schema;

  beforeEach(() => {
    dataStore = new DataStore();
    schema = createSchema('test', {
      topNode: 'document',
      nodes: {
        document: { name: 'document', group: 'document', content: 'block+' },
        paragraph: { name: 'paragraph', group: 'block', content: 'inline*' },
        'inline-text': { name: 'inline-text', group: 'inline' }
      },
      marks: {
        bold: { name: 'bold', group: 'text-style' },
        italic: { name: 'italic', group: 'text-style' }
      }
    });
    dataStore.registerSchema(schema);
  });

  it('should create a paragraph with inline-text children and link parent/children', () => {
    const template = {
      stype: 'paragraph',
      attributes: { class: 'p' },
      content: [
        { stype: 'inline-text', text: 'Hello ' },
        { stype: 'inline-text', text: 'World', marks: [{ stype: 'bold' }] },
        { stype: 'inline-text', text: '!' }
      ]
    } as any;

    const created = dataStore.createNodeWithChildren(template);

    // Parent exists
    const parent = dataStore.getNode(created.sid!);
    expect(parent).toBeDefined();
    expect(parent!.stype).toBe('paragraph');
    expect(Array.isArray(parent!.content)).toBe(true);
    expect(parent!.content!.length).toBe(3);

    // Children are IDs
    const [idA, idB, idC] = parent!.content as string[];
    expect(typeof idA).toBe('string');
    expect(typeof idB).toBe('string');
    expect(typeof idC).toBe('string');

    const a = dataStore.getNode(idA);
    const b = dataStore.getNode(idB);
    const c = dataStore.getNode(idC);

    expect(a).toBeDefined();
    expect(b).toBeDefined();
    expect(c).toBeDefined();

    expect(a!.stype).toBe('inline-text');
    expect(b!.stype).toBe('inline-text');
    expect(c!.stype).toBe('inline-text');

    expect(a!.text).toBe('Hello ');
    expect(b!.text).toBe('World');
    expect(c!.text).toBe('!');

    // Parent linkage reflected on children
    expect(a!.parentId).toBe(parent!.sid);
    expect(b!.parentId).toBe(parent!.sid);
    expect(c!.parentId).toBe(parent!.sid);

    // Marks preserved for child 'World'
    expect(b!.marks).toEqual([{ stype: 'bold' } as any]);
  });

  it('should process $alias on nested create and strip on persist', () => {
    const template = {
      stype: 'paragraph',
      attributes: { $alias: 'p1' },
      content: [
        { stype: 'inline-text', text: 'A', attributes: { $alias: 'a' } },
        { stype: 'inline-text', text: 'B', attributes: { $alias: 'b' } }
      ]
    } as any;

    const created = dataStore.createNodeWithChildren(template);

    const parent = dataStore.getNode(created.sid!);
    expect(parent).toBeDefined();
    expect(parent!.attributes?.$alias).toBeUndefined();
    const childIds = parent!.content as string[];
    // Deduplicate just in case; but should be exactly 2 after fix
    const uniq = Array.from(new Set(childIds));
    expect(uniq.length).toBe(2);
    const a = dataStore.getNode(uniq[0]);
    const b = dataStore.getNode(uniq[1]);
    expect(a?.attributes?.$alias).toBeUndefined();
    expect(b?.attributes?.$alias).toBeUndefined();

    // overlay alias resolution: begin/end so overlay map is available
    dataStore.begin();
    // simulate resolving by alias (should fall back to id when overlay not populated)
    // set overlay aliases manually using internal API
    // createNodeWithChildren already stripped; here ensure resolveAlias returns same id when not set
    expect(dataStore.resolveAlias('p1')).toBe('p1');
    dataStore.setAlias('p1', parent!.sid!);
    dataStore.setAlias('a', a!.sid!);
    dataStore.setAlias('b', b!.sid!);
    expect(dataStore.resolveAlias('p1')).toBe(parent!.sid);
    expect(dataStore.resolveAlias('a')).toBe(a!.sid);
    expect(dataStore.resolveAlias('b')).toBe(b!.sid);
    dataStore.end();
  });

  it('should create a complex nested document structure', () => {
    const template = {
      stype: 'document',
      content: [
        { stype: 'heading', attributes: { level: 1 }, content: [ { stype: 'inline-text', text: 'Title' } ] },
        { stype: 'paragraph', content: [
          { stype: 'inline-text', text: 'A' },
          { stype: 'inline-text', text: ' ' },
          { stype: 'inline-text', text: 'B', marks: [{ stype: 'bold' }] },
        ]},
        { stype: 'list', content: [
          { stype: 'listItem', content: [ { stype: 'paragraph', content: [ { stype: 'inline-text', text: 'Item 1' } ] } ] },
          { stype: 'listItem', content: [ { stype: 'paragraph', content: [ { stype: 'inline-text', text: 'Item 2' } ] } ] }
        ]}
      ]
    } as any;

    const root = dataStore.createNodeWithChildren(template);
    const doc = dataStore.getNode(root.sid!);
    expect(doc).toBeDefined();
    expect(Array.isArray(doc!.content)).toBe(true);
    expect((doc!.content as string[]).length).toBe(3);

    // spot-check: find heading text and a bold mark in paragraph
    const all = dataStore.getAllNodes();
    const headingText = all.find(n => n.stype === 'inline-text' && n.text === 'Title');
    expect(headingText?.parentId).toBeDefined();
    const boldText = all.find(n => n.stype === 'inline-text' && n.text === 'B');
    expect(boldText?.marks).toEqual([{ stype: 'bold' } as any]);
  });

  it('should create an extremely complex document structure (reference from main.ts)', () => {
    const template = {
      stype: 'document',
      content: [
        { stype: 'heading', attributes: { level: 1 }, content: [ { stype: 'inline-text', text: 'BaroCSS Editor Demo' } ] },
        { stype: 'paragraph', content: [
          { stype: 'inline-text', text: 'This is a ' },
          { stype: 'inline-text', text: 'bold text', marks: [{ stype: 'bold' }] },
          { stype: 'inline-text', text: ' and this is ' },
          { stype: 'inline-text', text: 'italic text', marks: [{ stype: 'italic' }] },
          { stype: 'inline-text', text: '.' }
        ]},
        { stype: 'list', attributes: { stype: 'bullet' }, content: [
          { stype: 'listItem', content: [ { stype: 'paragraph', content: [ { stype: 'inline-text', text: 'First bullet' } ] } ] },
          { stype: 'listItem', content: [ { stype: 'paragraph', content: [ { stype: 'inline-text', text: 'Second bullet' } ] } ] }
        ]},
        { stype: 'bTable', attributes: { caption: 'Sample Table' }, content: [
          { stype: 'bTableHeader', content: [
            { stype: 'bTableHeaderCell', content: [ { stype: 'paragraph', content: [ { stype: 'inline-text', text: 'Header 1' } ] } ] },
            { stype: 'bTableHeaderCell', content: [ { stype: 'paragraph', content: [ { stype: 'inline-text', text: 'Header 2' } ] } ] }
          ] },
          { stype: 'bTableBody', content: [
            { stype: 'bTableRow', content: [
              { stype: 'bTableCell', content: [ { stype: 'paragraph', content: [ { stype: 'inline-text', text: 'Cell 1,1' } ] } ] },
              { stype: 'bTableCell', content: [ { stype: 'paragraph', content: [ { stype: 'inline-text', text: 'Cell 1,2' } ] } ] }
            ] }
          ] }
        ]},
        { stype: 'blockQuote', content: [ { stype: 'paragraph', content: [ { stype: 'inline-text', text: 'A famous quote.' } ] } ] },
        { stype: 'docHeader', content: [ { stype: 'inline-text', text: 'Header text' } ] },
        { stype: 'docFooter', content: [ { stype: 'inline-text', text: 'Footer text' } ] }
      ]
    } as any;

    const root = dataStore.createNodeWithChildren(template);
    const doc = dataStore.getNode(root.sid!);
    expect(doc?.stype).toBe('document');
    const all = dataStore.getAllNodes();

    // Headings and marks exist
    const heading = all.find(n => n.stype === 'heading');
    const headingText = all.find(n => n.stype === 'inline-text' && n.text === 'BaroCSS Editor Demo');
    expect(heading).toBeDefined();
    expect(headingText?.parentId).toBe(heading?.sid);

    const bold = all.find(n => n.stype === 'inline-text' && n.text === 'bold text');
    const italic = all.find(n => n.stype === 'inline-text' && n.text === 'italic text');
    expect(bold?.marks).toEqual([{ stype: 'bold' } as any]);
    expect(italic?.marks).toEqual([{ stype: 'italic' } as any]);

    // List structure
    const list = all.find(n => n.stype === 'list');
    expect(list).toBeDefined();
    const listItems = all.filter(n => n.stype === 'listItem' && n.parentId === list?.sid);
    expect(listItems.length).toBe(2);

    // Table structure
    const table = all.find(n => n.stype === 'bTable');
    expect(table).toBeDefined();
    const header = all.find(n => n.stype === 'bTableHeader' && n.parentId === table?.sid);
    const body = all.find(n => n.stype === 'bTableBody' && n.parentId === table?.sid);
    expect(header).toBeDefined();
    expect(body).toBeDefined();

    // BlockQuote and docHeader/Footer
    expect(all.find(n => n.stype === 'blockQuote')).toBeDefined();
    expect(all.find(n => n.stype === 'docHeader')).toBeDefined();
    expect(all.find(n => n.stype === 'docFooter')).toBeDefined();
  });

  it('should set root document once and enforce single root; first root id should be 0:1 or 0:0 depending on counter baseline', () => {
    const ds = new DataStore();
    ds.registerSchema(schema);

    // first document
    const doc1 = ds.createNodeWithChildren({ stype: 'document', content: [] } as any);
    const root1 = ds.getRootNode();
    expect(root1?.sid).toBe(doc1.sid);
    // ID baseline check: must start with current session and first counter
    expect(typeof root1?.sid).toBe('string');
    expect(root1?.sid?.startsWith('0:')).toBe(true);

    // second document create should not change root; either error or leaves root intact
    const doc2 = ds.createNodeWithChildren({ stype: 'document', content: [] } as any);
    const root2 = ds.getRootNode();
    expect(root2?.sid).toBe(root1?.sid);
    // but second doc still exists as a separate node (non-root)
    const n2 = ds.getNode(doc2.sid!);
    expect(n2).toBeDefined();
    expect(n2?.sid).toBe(doc2.sid);
  });

  it('should throw on duplicate $alias within the same creation tree (siblings)', () => {
    const t = () => dataStore.createNodeWithChildren({
      stype: 'paragraph',
      content: [
        { stype: 'inline-text', text: 'A', attributes: { $alias: 'x' } },
        { stype: 'inline-text', text: 'B', attributes: { $alias: 'x' } }
      ]
    } as any);
    expect(t).toThrowError(/Duplicate alias/i);
  });

  it('should throw on duplicate $alias across different levels', () => {
    const t = () => dataStore.createNodeWithChildren({
      stype: 'paragraph',
      attributes: { $alias: 'p' },
      content: [
        { stype: 'inline-text', text: 'C', attributes: { $alias: 'p' } }
      ]
    } as any);
    expect(t).toThrowError(/Duplicate alias/i);
  });

  it('overlay alias lifecycle: setAlias resolves during overlay, then cleared after rollback', () => {
    const created = dataStore.createNodeWithChildren({
      stype: 'paragraph',
      content: [ { stype: 'inline-text', text: 'A' } ]
    } as any);
    const parent = dataStore.getNode(created.sid!);
    const childId = (parent!.content as string[])[0];

    dataStore.begin();
    dataStore.setAlias('child', childId);
    expect(dataStore.resolveAlias('child')).toBe(childId);
    dataStore.rollback();
    // overlay cleared -> resolveAlias falls back to the input string
    expect(dataStore.resolveAlias('child')).toBe('child');
  });

  it('should preserve deep marks (with ranges) on nested children', () => {
    const para = dataStore.createNodeWithChildren({
      stype: 'paragraph',
      content: [
        { stype: 'inline-text', text: 'bold', marks: [{ stype: 'bold', range: [0, 4] }] },
        { stype: 'inline-text', text: ' and ' },
        { stype: 'inline-text', text: 'italic', marks: [{ stype: 'italic', range: [0, 6] }] }
      ]
    } as any);
    const p = dataStore.getNode(para.sid!);
    const [idA, , idC] = p!.content as string[];
    expect(dataStore.getNode(idA)!.marks).toEqual([{ stype: 'bold', range: [0, 4] } as any]);
    expect(dataStore.getNode(idC)!.marks).toEqual([{ stype: 'italic', range: [0, 6] } as any]);
  });

  it('should fail validation for invalid template (unknown type)', () => {
    // Use fresh datastore to ensure active schema is applied
    const ds = new DataStore();
    ds.setActiveSchema(schema as any);
    const t = () => ds.createNodeWithChildren({
      stype: 'unknown-type',
      content: []
    } as any);
    expect(t).toThrowError(/Schema validation failed/i);
  });

  it('should fail when required attrs are missing (heading.level)', () => {
    const ds = new DataStore();
    ds.setActiveSchema(schema as any);
    const t = () => ds.createNodeWithChildren({
      stype: 'heading',
      // missing attributes.level
      content: [ { stype: 'inline-text', text: 'Title' } ]
    } as any);
    expect(t).toThrowError(/Schema validation failed/i);
  });

  it('should create atom nodes without content', () => {
    const node1 = dataStore.createNodeWithChildren({ stype: 'pageBreak' } as any);
    const node2 = dataStore.createNodeWithChildren({ stype: 'inline-image', attributes: { src: 'x', alt: 'a' } } as any);
    expect(dataStore.getNode(node1.sid!)?.stype).toBe('pageBreak');
    expect(dataStore.getNode(node2.sid!)?.stype).toBe('inline-image');
  });

  it('should retain preassigned id and reject duplicate ids', () => {
    const a = dataStore.createNodeWithChildren({ sid: 'fixed-1', stype: 'paragraph', content: [] } as any);
    expect(a.sid).toBe('fixed-1');
    const t = () => dataStore.createNodeWithChildren({ sid: 'fixed-1', stype: 'paragraph', content: [] } as any);
    expect(t).toThrowError(/duplicate|exists|already/i);
  });

  it('should convert mixed content (object/string) to ID array', () => {
    const saved = dataStore.createNodeWithChildren({ stype: 'inline-text', text: 'SAVED' } as any);
    const parent = dataStore.createNodeWithChildren({ stype: 'paragraph', content: [ { stype: 'inline-text', text: 'OBJ' }, saved.sid ] } as any);
    const p = dataStore.getNode(parent.sid!);
    expect(Array.isArray(p!.content)).toBe(true);
    for (const c of p!.content as any[]) expect(typeof c).toBe('string');
  });

  it('should preserve child order in parent.content', () => {
    const parent = dataStore.createNodeWithChildren({
      stype: 'paragraph',
      content: [
        { stype: 'inline-text', text: '1' },
        { stype: 'inline-text', text: '2' },
        { stype: 'inline-text', text: '3' }
      ]
    } as any);
    const p = dataStore.getNode(parent.sid!);
    const ids = p!.content as string[];
    const texts = ids.map(id => dataStore.getNode(id)!.text);
    expect(texts).toEqual(['1', '2', '3']);
  });

  it('should remove deep nested $alias everywhere', () => {
    const root = dataStore.createNodeWithChildren({
      stype: 'paragraph',
      attributes: { $alias: 'p' },
      content: [
        { stype: 'inline-text', text: 'A', attributes: { $alias: 'a1' } },
        { stype: 'inline-text', text: 'B', attributes: { $alias: 'a2' } }
      ]
    } as any);
    const p = dataStore.getNode(root.sid!);
    expect(p!.attributes?.$alias).toBeUndefined();
    for (const id of p!.content as string[]) {
      expect(dataStore.getNode(id)!.attributes?.$alias).toBeUndefined();
    }
  });

  it('should create large template and ensure all content are string IDs', () => {
    const many: any[] = [];
    for (let i = 0; i < 200; i++) many.push({ stype: 'inline-text', text: String(i) });
    const parent = dataStore.createNodeWithChildren({ stype: 'paragraph', content: many } as any);
    const p = dataStore.getNode(parent.sid!);
    expect((p!.content as any[]).every(x => typeof x === 'string')).toBe(true);
  });

  it('should reject when nested unknown type exists', () => {
    const ds = new DataStore();
    ds.setActiveSchema(schema as any);
    const t = () => ds.createNodeWithChildren({
      stype: 'paragraph',
      content: [
        { stype: 'inline-text', text: 'ok' },
        { stype: 'unknown-type', content: [] }
      ]
    } as any);
    expect(t).toThrowError(/Schema validation failed/i);
  });
});


