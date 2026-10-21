import { defineConfig } from 'vite';
import dts from 'vite-plugin-dts';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// The source workspace root stays unchanged; services get a separate pure JS entry.
export default defineConfig({
  plugins: [dts({ entryRoot: 'src', outDir: 'dist', include: ['src/**/*'],
    exclude: ['**/*.test.ts', '**/*.spec.ts'], pathsToAliases: false,
    compilerOptions: { rootDir: undefined, paths: {}, declarationMap: false }, insertTypesEntry: true }),
  { name: 'schema-license', generateBundle() {
    this.emitFile({ type: 'asset', fileName: 'LICENSE', source: readFileSync(new URL('../../LICENSE', import.meta.url), 'utf8') });
  } }],
  build: { lib: { entry: { index: fileURLToPath(new URL('./src/index.ts', import.meta.url)), 'registry-contract': fileURLToPath(new URL('./src/registry-contract.ts', import.meta.url)) },
    formats: ['es'], fileName: (_format, name) => `${name}.js` } },
});
