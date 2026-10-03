import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { defineConfig } from 'vite';
import dts from 'vite-plugin-dts';

const root = fileURLToPath(new URL('.', import.meta.url));

/** Bundle the existing pure native validators and readers for Node services.
 * No second reduced schema or server-only approximation is maintained. */
export default defineConfig({
  plugins: [dts({ entryRoot: resolve(root, 'src'), outDir: resolve(root, 'dist/criterion'),
    tsconfigPath: resolve(root, 'tsconfig.json'), include: [resolve(root, 'src/criterion-confirmation.ts')],
    pathsToAliases: false, compilerOptions: { rootDir: undefined, paths: {}, declarationMap: false } })],
  build: {
    outDir: resolve(root, 'dist/criterion'),
    lib: { entry: resolve(root, 'src/criterion-confirmation.ts'), formats: ['es'], fileName: 'index' }
  }
});
