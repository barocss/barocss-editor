import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DocumentAccess, DocumentNode } from '@barocss/office-text';
import { measureTableSegments } from '../src/table-cell-pagination';

afterEach(() => { document.body.replaceChildren(); vi.unstubAllGlobals(); });

function fixture() {
  vi.stubGlobal('CSS', { escape: (text: string) => text });
  const p = (sid: string): DocumentNode => ({ sid, stype: 'paragraph', content: [] });
  const paragraphs = [p('p0'), p('p1'), p('p2')];
  const merged: DocumentNode = { sid: 'merged', stype: 'bTableCell', attributes: { rowspan: 3 }, content: paragraphs };
  const regular: DocumentNode[] = Array.from({ length: 3 }, (_, i) => ({ sid: `c${i}`, stype: 'bTableCell', content: [p(`q${i}`)] }));
  const rows: DocumentNode[] = regular.map((cell, i) => ({ sid: `r${i}`, stype: 'bTableRow', content: i === 0 ? [merged, cell] : [cell] }));
  const table: DocumentNode = { sid: 'table', stype: 'bTable', content: rows };
  const nodes = [table, ...rows, merged, ...paragraphs, ...regular, ...regular.flatMap(cell => cell.content as DocumentNode[])];
  const doc: DocumentAccess = { rootId: 'table', getNode: sid => nodes.find(node => node.sid === sid) };
  const el = document.createElement('table');
  el.innerHTML = `<tbody>${rows.map((row, i) => `<tr data-bc-sid="${row.sid}">${i === 0 ? `<td data-bc-sid="merged" rowspan="3" style="vertical-align:top;padding:5px">${paragraphs.map(p => `<p data-bc-sid="${p.sid}">text</p>`).join('')}</td>` : ''}<td data-bc-sid="c${i}" style="vertical-align:top;padding:5px"><p data-bc-sid="q${i}">row</p></td></tr>`).join('')}</tbody>`;
  document.body.append(el);
  const bounds = (sid: string, top: number, height: number, left = 0, width = 200) => {
    el.querySelector<HTMLElement>(`[data-bc-sid="${sid}"]`)!.getBoundingClientRect = () => ({
      top, bottom: top + height, left, right: left + width, width, height, x: left, y: top, toJSON: () => ({}),
    });
  };
  bounds('merged', 0, 150);
  for (let i = 0; i < 3; i++) {
    bounds(`r${i}`, i * 50, 50, 0, 400); bounds(`c${i}`, i * 50, 50, 200);
    bounds(`p${i}`, i * 50 + 5, 35); bounds(`q${i}`, i * 50 + 5, 40, 200);
  }
  const measure = () => measureTableSegments(el, doc, table, [50, 50, 50], 90);
  return { el, rows, merged, regular, paragraphs, table, measure, bounds };
}

describe('continuous merge beside ordinary rows', () => {
  it('anchors each cut inside the spanning cell and the following ordinary row', () => {
    const f = fixture(), before = JSON.stringify(f.table);
    const result = f.measure();
    expect(result.lines).toEqual([55, 50, 45]);
    expect(result.boundaries.get(1)?.cell?.blockSid).toBe('p1');
    expect(result.boundaries.get(1)?.cell?.right).toBe(205);
    expect(result.boundaries.get(1)?.cell?.peers).toEqual([{ blockSid: 'q1', left: 0, right: 0, spacerOnly: true }]);
    expect(result.boundaries.get(2)?.cell?.peers?.[0].blockSid).toBe('q2');
    expect(JSON.stringify(f.table)).toBe(before);
  });
  it('continues the ordinary rows when merged content has ended', () => {
    const f = fixture(); f.merged.content = [f.paragraphs[0]];
    const cut = f.measure().boundaries.get(1)?.cell;
    expect(cut?.blockSid).toBe('q1');
    expect(cut?.left).toBe(205);
  });
  it('does not let the browser redistribute merge-driven excess height between rows', () => {
    const f = fixture(); f.bounds('q1', 55, 10, 200);
    expect(f.measure().breakLines).toEqual([3]);
  });
  it('excludes a boundary through a kept pair of merged paragraphs', () => {
    const f = fixture(); f.paragraphs[0].attributes = { keepNext: true };
    expect([...f.measure().boundaries.values()].flatMap(boundary => boundary.cell?.blockSid ?? [])).toEqual(['p2']);
  });
  it('keeps explicit minimum-height slack after a continuation row’s content', () => {
    const f = fixture(); f.bounds('q1', 55, 10, 200);
    f.rows[1].attributes = { height: 750, heightRule: 'atLeast' };
    const targets = f.measure().boundaries.get(1)?.cell?.peers;
    expect(targets).toContainEqual(expect.objectContaining({ blockSid: 'q1', after: true, spacerOnly: true, spacerHeight: expect.any(Number) }));
  });
  it.each([{ cantSplit: true }, { heightRule: 'exact' }])('honors row constraints %j', attributes => {
    const f = fixture(); f.rows[1].attributes = attributes;
    expect(f.measure().breakLines).toEqual([3]);
  });
  it('retains unsupported intersecting merges and non-top alignment', () => {
    const f = fixture(); f.regular[1].attributes = { rowspan: 2 };
    expect(f.measure().breakLines).toEqual([3]);
    f.regular[1].attributes = {};
    f.el.querySelector<HTMLElement>('[data-bc-sid="merged"]')!.style.verticalAlign = 'middle';
    expect(f.measure().breakLines).toEqual([3]);
  });
});
