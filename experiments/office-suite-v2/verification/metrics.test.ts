import test from 'node:test';
import assert from 'node:assert/strict';
import { summarize } from './metrics.ts';

test('nearest rank retains spikes and raw order is unchanged', () => {
  const samples=[100,1,2,3,4];
  assert.deepEqual(summarize(samples),{count:5,min:1,p50:3,p95:100,p99:100,max:100,method:'nearest-rank'});
  assert.deepEqual(samples,[100,1,2,3,4]);
});
test('empty, negative and nonfinite measurements cannot become zero-latency PASS', () => {
  for (const input of [[],[-1],[NaN],[Infinity]]) assert.throws(() => summarize(input));
});
