import { cpus, freemem, platform, release, totalmem } from 'node:os';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

export function summarize(samples: readonly number[]) {
  if (!samples.length || samples.some(n => !Number.isFinite(n) || n < 0)) throw new Error('Expected nonempty finite nonnegative samples');
  const sorted = [...samples].sort((a,b) => a-b);
  const percentile = (p: number) => sorted[Math.max(0, Math.ceil(p * sorted.length)-1)]!;
  return { count: sorted.length, min: sorted[0]!, p50: percentile(.5), p95: percentile(.95), p99: percentile(.99), max: sorted.at(-1)!, method: 'nearest-rank' };
}

export function sourceBinding(cwd: string, paths: readonly string[]) {
  const git = (...args: string[]) => execFileSync('git', args, {cwd, encoding:'utf8'}).trim();
  return { head: git('rev-parse','HEAD'), tree: git('rev-parse','HEAD^{tree}'), dirty: git('status','--porcelain=v1'),
    files: paths.map(path => ({path,sha256:createHash('sha256').update(readFileSync(`${cwd}/${path}`)).digest('hex')})) };
}

export function environment() {
  return {node:process.version,platform:platform(),release:release(),arch:process.arch,cpu:cpus()[0]?.model ?? 'unknown',logicalCpus:cpus().length,totalMemoryBytes:totalmem(),freeMemoryBytesAtStart:freemem(),capturedUtc:new Date().toISOString()};
}
