import { expect, it } from 'vitest';
import { gapBeforeRemoval } from '../../src/editing';
it('roundtrips every source subset and destination gap for one to eight siblings', () => {
  for (let size=1; size<=8; size++) {
    const content = Array.from({length:size},(_,index)=>String(index));
    for (let mask=1; mask<2**size; mask++) {
      const moved=content.filter((_,index)=>mask & 2**index), remaining=content.filter(id=>!moved.includes(id));
      for (let slot=0; slot<=remaining.length; slot++) {
        const gap=gapBeforeRemoval(content,moved,slot);
        expect(gap-content.slice(0,gap).filter(id=>moved.includes(id)).length).toBe(slot);
        const result=[...remaining]; result.splice(slot,0,...moved);
        expect(new Set(result).size).toBe(size); expect(result.filter(id=>moved.includes(id))).toEqual(moved);
      }
    }
  }
});
it('rejects undefined positions instead of guessing', () => {
  for (const index of [-1,1.5,NaN,2]) expect(()=>gapBeforeRemoval(['a','b'],['a'],index)).toThrow();
});
