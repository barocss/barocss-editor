// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { loadConfigFromFile } from 'vite';

// The library build is now shared. Read evaluated configs rather than matching
// literal entry keys in each file. CI's npm consumer job verifies actual archives.
const ROOT = join(__dirname, '..', '..', '..');
const PACKAGES = join(ROOT, 'packages');
type Json = Record<string, unknown>;
const packages = readdirSync(PACKAGES)
  .filter((name) => existsSync(join(PACKAGES, name, 'package.json')))
  .map((name) => ({ name, json: JSON.parse(readFileSync(join(PACKAGES, name, 'package.json'), 'utf8')) as Json }))
  .filter(({ json }) => json.private !== true);
const configs = new Map<string, ReturnType<typeof loadConfigFromFile>>();
function config(name: string) {
  if (!configs.has(name)) configs.set(name, loadConfigFromFile({ command: 'build', mode: 'production' }, join(PACKAGES, name, 'vite.config.ts')));
  return configs.get(name)!;
}

describe('패키지가 여는 문', () => {
  it('모든 공개 진입점은 발행 설정에도 있다', () => {
    for (const { name, json } of packages) {
      const publish = (json.publishConfig as Json)?.exports as Json | undefined;
      expect(publish, name).toBeDefined();
      expect(Object.keys(publish ?? {}).sort(), name).toEqual(Object.keys(json.exports as Json).sort());
    }
  });

  it('평가한 빌드 설정이 각 코드 진입점을 원본 파일에 연결한다', async () => {
    for (const { name, json } of packages) {
      const loaded = await config(name);
      expect(loaded, name).not.toBeNull();
      const library = loaded!.config.build?.lib;
      expect(library, name).toBeTruthy();
      if (!library) continue;
      const entries = library.entry as Record<string, string>;
      for (const [key, target] of Object.entries(json.exports as Json)) {
        if (key.endsWith('.css')) continue;
        const source = typeof target === 'string' ? target : (target as Json).import as string;
        expect(entries[key === '.' ? 'index' : key.slice(2)], `${name}/${key}`).toBe(resolve(PACKAGES, name, source));
      }
    }
  }, 30000);

  it('공개 CSS 파일을 원래 내용으로 발행한다', async () => {
    for (const { name, json } of packages) {
      const css = Object.entries(json.exports as Json).filter(([key]) => key.endsWith('.css'));
      if (!css.length) continue;
      const loaded = await config(name);
      const plugins = loaded!.config.plugins as unknown as Array<{ name?: string; generateBundle?: { handler?: (this: { emitFile: (asset: { fileName: string; source: Buffer }) => number }, options: object, bundle: object) => void } }>;
      const handler = plugins.find((plugin) => plugin?.name === 'public-library-assets')?.generateBundle?.handler;
      expect(handler, name).toBeTypeOf('function');
      const assets: Array<{ fileName: string; source: Buffer }> = [];
      handler!.call({ emitFile: (asset: { fileName: string; source: Buffer }) => assets.push(asset) }, {}, {});
      for (const [key, source] of css) {
        const asset = assets.find((item) => item.fileName === key.slice(2));
        expect(asset?.source.toString(), `${name}/${key}`).toBe(readFileSync(resolve(PACKAGES, name, source as string), 'utf8'));
      }
    }
  });
});
