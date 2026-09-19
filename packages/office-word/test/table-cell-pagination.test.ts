import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DocumentAccess, DocumentNode } from '@barocss/office-text';
import { measureTableSegments, withoutCellBreaks } from '../src/table-cell-pagination';

afterEach(() => { document.body.replaceChildren(); vi.unstubAllGlobals(); });

function fixture() {
  vi.stubGlobal('CSS', { escape: (value: string) => value });
  const paragraphs: DocumentNode[] = Array.from({ length: 4 }, (_, i) => ({ sid: `p${i}`, stype: 'paragraph', content: [] }));
  const cell: DocumentNode = { sid: 'cell', stype: 'bTableCell', attributes: { colspan: 2, rowspan: 2 }, content: paragraphs };
  const row: DocumentNode = { sid: 'r0', stype: 'bTableRow', content: [cell] };
  const covered: DocumentNode = { sid: 'r1', stype: 'bTableRow', content: [] };
  const table: DocumentNode = { sid: 'table', stype: 'bTable', content: [row, covered] };
  const nodes = [table, row, covered, cell, ...paragraphs];
  const doc: DocumentAccess = { rootId: 'table', getNode: sid => nodes.find(node => node.sid === sid) };
  const el = document.createElement('table');
  el.innerHTML = '<tbody><tr data-bc-sid="r0"><td data-bc-sid="cell" style="vertical-align:top;padding:8px;border:1px solid">'
    + paragraphs.map(p => `<p data-bc-sid="${p.sid}">text</p>`).join('') + '</td></tr><tr data-bc-sid="r1"></tr></tbody>';
  document.body.append(el);
  const bounds = (sid: string, top: number, height: number) => {
    el.querySelector<HTMLElement>(`[data-bc-sid="${sid}"]`)!.getBoundingClientRect = () => ({
      top, bottom: top + height, left: 0, right: 300, width: 300, height, x: 0, y: top, toJSON: () => ({}),
    });
  };
  bounds('r0', 0, 100); bounds('r1', 100, 100); bounds('cell', 0, 200);
  paragraphs.forEach((p, i) => bounds(p.sid!, i * 50, 50));
  const measure = (pageHeight = 120) => measureTableSegments(el, doc, table, [100, 100], pageHeight);
  return { el, doc, table, cell, row, covered, paragraphs, measure, nodes, bounds };
}

function parallelFixture(count = 4, shift = 0) {
  const f = fixture();
  f.cell.attributes!.colspan = 1;
  const paragraphs = Array.from({ length: count }, (_, i) => ({ sid: `q${i}`, stype: 'paragraph', content: [] }));
  const cell = { sid: 'other', stype: 'bTableCell', attributes: { rowspan: 2 }, content: paragraphs };
  f.row.content = [f.cell, cell];
  f.nodes.push(cell, ...paragraphs);
  const el = document.createElement('td'); el.dataset.bcSid = 'other'; el.style.verticalAlign = 'top';
  el.innerHTML = paragraphs.map(p => `<p data-bc-sid="${p.sid}">other</p>`).join('');
  f.el.querySelector('tr')!.append(el);
  f.bounds('other', 0, 200);
  paragraphs.forEach((p, i) => f.bounds(p.sid, i * 50 + shift, 50));
  return { ...f, other: cell };
}

describe('parallel cell continuation', () => {
  it('advances sibling cells at the same safe boundary without changing the model', () => {
    const f = parallelFixture(), before = JSON.stringify(f.table);
    const result = f.measure();
    expect(result.lines).toEqual([50, 50, 50, 50]);
    expect(result.boundaries.get(2)?.cell?.blockSid).toBe('p2');
    expect(result.boundaries.get(2)?.cell?.peers).toEqual([{ blockSid: 'q2', left: 0, right: 0, spacerOnly: true }]);
    expect(JSON.stringify(f.table)).toBe(before);
  });
  it('continues the longer column after the other column ends', () => {
    const f = parallelFixture(2);
    const result = f.measure();
    expect(result.breakLines).toEqual([1, 2, 3, 4]);
    expect(result.boundaries.get(3)?.cell?.peers).toEqual([]);
  });
  it('does not cut through text when columns have incompatible boundaries', () => {
    const f = parallelFixture(4, 20);
    expect(f.measure().breakLines).toEqual([2]);
  });
  it('uses shared whitespace when paragraph tops differ and offsets the full-width mask', () => {
    const f = parallelFixture(4, -5);
    f.paragraphs.forEach((p, i) => f.bounds(p.sid!, i * 50, 40));
    f.other.content.forEach((p, i) => f.bounds(p.sid, i * 50 - 5, 40));
    const result = f.measure();
    expect(result.lines).toEqual([45, 50, 50, 55]);
    expect(result.boundaries.get(1)?.cell?.maskOffset).toBe(-5);
    expect(result.boundaries.get(1)?.cell?.peers?.[0].blockSid).toBe('q1');
  });
  it('honors keepNext in either column', () => {
    const f = parallelFixture();
    Object.assign(f.other.content[1], { attributes: { keepNext: true } });
    const result = f.measure();
    expect(result.lines).toEqual([50, 100, 50]);
    expect([...result.boundaries.values()].flatMap(boundary => boundary.cell?.blockSid ?? [])).toEqual(['p1', 'p3']);
  });
  it('keeps staggered spans and vertically centered sibling cells whole', () => {
    const f = parallelFixture();
    f.other.attributes.rowspan = 1;
    expect(f.measure().breakLines).toEqual([2]);
    f.other.attributes.rowspan = 2;
    f.el.querySelector<HTMLElement>('[data-bc-sid="other"]')!.style.verticalAlign = 'middle';
    expect(f.measure().breakLines).toEqual([2]);
  });
});

describe('full-width cell continuation eligibility', () => {
  it('maps a cut inside one long paragraph to its model text position', () => {
    const f = fixture();
    f.cell.content = [f.paragraphs[0]];
    const before = JSON.stringify(f.cell);
    const read = vi.fn(() => ({ cuts: [{ top: 100, anchor: { sid: 'run', offset: 450 } }] }));
    const result = measureTableSegments(f.el, f.doc, f.table, [100, 100], 120, read);
    expect(result.lines).toEqual([100, 100]);
    expect(result.boundaries.get(1)?.cell).toEqual({ blockSid: 'p0', left: 9, right: 9, inline: { sid: 'run', offset: 450 } });
    expect(read).toHaveBeenCalledWith(expect.anything(), f.paragraphs[0], 120);
    expect(JSON.stringify(f.cell)).toBe(before);
  });
  it('keeps a single paragraph whole when no safe text anchor is available', () => {
    const f = fixture(); f.cell.content = [f.paragraphs[0]];
    const result = measureTableSegments(f.el, f.doc, f.table, [100, 100], 120, () => ({ cuts: [] }));
    expect(result.lines).toEqual([200]);
    expect(result.breakLines).toEqual([1]);
    expect(result.boundaries.get(1)).toEqual({ row: 2 });
  });
  it('maps paragraph cuts to the original cell without changing the document', () => {
    const f = fixture(), before = JSON.stringify(f.cell);
    const result = f.measure();
    expect(result.lines).toEqual([50, 50, 50, 50]);
    expect(result.boundaries.get(2)).toEqual({ row: 0, cell: { blockSid: 'p2', left: 9, right: 9 } });
    expect(result.boundaries.get(4)).toEqual({ row: 2 });
    expect(JSON.stringify(f.cell)).toBe(before);
  });
  it('restores ordinary row measurement when the cell fits on a page', () => {
    const f = fixture();
    expect(f.measure(240).lines).toEqual([100, 100]);
    expect(f.measure(240).breakLines).toEqual([2]);
  });
  it.each([{ cantSplit: true }, { heightRule: 'exact' }])('honors row constraints %j', attributes => {
    const f = fixture(); f.row.attributes = attributes;
    expect(f.measure().breakLines).toEqual([2]);
  });
  it('does not split mixed-column merges', () => {
    const f = fixture();
    f.covered.content = [{ sid: 'other', stype: 'bTableCell', content: [] }];
    expect(f.measure().breakLines).toEqual([2]);
  });
  it('honors vertical alignment applied by the style renderer', () => {
    const f = fixture();
    f.el.querySelector<HTMLElement>('td')!.style.verticalAlign = 'middle';
    expect(f.measure().breakLines).toEqual([2]);
  });
  it('keeps a heading and an explicit keepNext paragraph with their next block', () => {
    const f = fixture();
    f.paragraphs[0].stype = 'heading'; f.paragraphs[2].attributes = { keepNext: true };
    expect(f.measure().breakLines).toEqual([2, 4]);
  });
  it('restores display after a measurement failure without changing editable DOM', () => {
    const f = fixture();
    const gap = document.createElement('div'); gap.className = 'w-table-cell-break';
    f.el.querySelector('td')!.append(gap);
    const before = f.el.innerHTML;
    expect(() => withoutCellBreaks(f.el, () => {
      expect([...document.styleSheets].some(sheet => [...sheet.cssRules].some(rule => rule.cssText.includes('display: none')))).toBe(true);
      throw new Error('measurement failed');
    })).toThrow('measurement failed');
    expect([...document.styleSheets].some(sheet => [...sheet.cssRules].some(rule => rule.cssText.includes('.w-table-cell-break')))).toBe(false);
    expect(f.el.innerHTML).toBe(before);
  });
});
