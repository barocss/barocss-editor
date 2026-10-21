import test from 'node:test';
import assert from 'node:assert/strict';
import { SHEET_PROFILE, sheetInputs, wordDocument } from './profiles.ts';
test('scale workload has exact population, formulas and bounds without materializing empty cells',()=>{
  let cells=0,formulas=0; const keys=new Set<string>();
  for(const cell of sheetInputs()) {
    assert.ok(cell.row>=0 && cell.row<SHEET_PROFILE.rows);
    assert.ok(cell.column>=0 && cell.column<SHEET_PROFILE.columns);
    assert.ok(!keys.has(`${cell.row}:${cell.column}`)); keys.add(`${cell.row}:${cell.column}`);
    cells++; if(cell.kind==='formula') formulas++;
  }
  assert.equal(cells,50000); assert.equal(formulas,10000);
});
test('Word workload names explicit breaks and scales linear source content',()=>{
  for(const pages of [100,300] as const) {
    const paragraphs=wordDocument(pages).content?.find(n=>n.stype==='surface')?.content;
    assert.equal(paragraphs?.length,pages*8);
    assert.equal(paragraphs?.filter(n=>n.attributes?.pageBreakBefore===true).length,pages-1);
    assert.ok(paragraphs?.every(n=>n.content?.[0]?.text?.includes('한글')));
  }
});
