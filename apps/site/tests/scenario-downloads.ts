import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { promisify } from 'node:util';
import type { Download, TestInfo } from '@playwright/test';

const execute = promisify(execFile);

export async function retainDownload(download: Download, info: TestInfo) {
  expectDownload(await download.failure());
  const path = await download.path();
  if (!path) throw new Error('Downloaded file has no local path');
  const bytes = await readFile(path);
  await info.attach(download.suggestedFilename(), { path });
  await info.attach(`${download.suggestedFilename()}-audit`, {
    body: JSON.stringify({ name: download.suggestedFilename(), bytes: bytes.length,
      sha256: createHash('sha256').update(bytes).digest('hex') }, null, 2),
    contentType: 'application/json',
  });
  return { path, text: bytes.toString('utf8') };
}

function expectDownload(failure: string | null) {
  if (failure) throw new Error(`Download failed: ${failure}`);
}

export async function readSiteArchive(path: string): Promise<Record<string, string>> {
  // Python reads the actual downloaded bytes independently of the product's ZIP writer.
  const { stdout } = await execute('python3', ['-c',
    'import json,sys,zipfile;z=zipfile.ZipFile(sys.argv[1]);bad=z.testzip();assert bad is None,bad;print(json.dumps({n:z.read(n).decode("utf-8") for n in z.namelist() if n.endswith((".html",".xml",".txt"))},ensure_ascii=False))', path]);
  return JSON.parse(stdout) as Record<string, string>;
}
