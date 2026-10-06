import { defineConfig } from 'vite';
import dts from 'vite-plugin-dts';
import { readFileSync } from 'node:fs';

// The source workspace root stays unchanged; services get a separate pure JS entry.
export default defineConfig({
  plugins: [dts({ entryRoot: 'src', outDir: 'dist', include: ['src/**/*'],
    exclude: ['**/*.test.ts', '**/*.spec.ts'], pathsToAliases: false,
    compilerOptions: { rootDir: undefined, paths: {}, declarationMap: false }, insertTypesEntry: true }),
  { name: 'schema-license', generateBundle() {
    this.emitFile({ type: 'asset', fileName: 'LICENSE', source: readFileSync(new URL('../../LICENSE', import.meta.url), 'utf8') });
  } }],
  build: { lib: { entry: { index: 'src/index.ts', 'registry-contract': 'src/registry-contract.ts' },
    formats: ['es'], fileName: (_format, name) => `${name}.js` } },
});
