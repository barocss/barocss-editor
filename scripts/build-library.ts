import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import dts from 'vite-plugin-dts';

interface LibraryManifest {
  exports: Record<string, string | { import: string }>;
  dependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
}

/** Build the same public entry points used by the source workspace. */
export function defineLibraryConfig(configUrl: string) {
  const root = dirname(fileURLToPath(configUrl));
  const manifest: LibraryManifest = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));
  const externalPackages = Object.keys({ ...manifest.dependencies, ...manifest.peerDependencies });
  const entries: Record<string, string> = {};
  const styles: Array<{ name: string; source: string }> = [];

  for (const [subpath, target] of Object.entries(manifest.exports)) {
    const name = subpath === '.' ? 'index' : subpath.slice(2);
    const source = typeof target === 'string' ? target : target.import;
    if (subpath.endsWith('.css')) styles.push({ name, source });
    else entries[name] = resolve(root, source);
  }

  return defineConfig({
    plugins: [
      dts({
        entryRoot: resolve(root, 'src'),
        outDir: resolve(root, 'dist'),
        tsconfigPath: resolve(root, existsSync(resolve(root, 'tsconfig.build.json')) ? 'tsconfig.build.json' : 'tsconfig.json'),
        include: [resolve(root, 'src/**/*')],
        exclude: ['**/*.test.ts', '**/*.test.tsx', '**/*.spec.ts', '**/*.spec.tsx'],
        pathsToAliases: false,
        compilerOptions: { rootDir: undefined, paths: {}, declarationMap: false },
        insertTypesEntry: true,
      }),
      {
        name: 'public-library-assets',
        generateBundle: {
          order: 'post',
          handler(_options, bundle) {
            // Vite extracts CSS imports from library entries. Keep those imports active for consumers.
            for (const item of Object.values(bundle)) {
              if (item.type === 'chunk') {
                const metadata = (item as typeof item & { viteMetadata?: { importedCss: Set<string> } }).viteMetadata;
                item.code = [...(metadata?.importedCss ?? [])].map((file) => `import './${file}';\n`).join('') + item.code;
              }
            }
            for (const style of styles) {
              this.emitFile({ type: 'asset', fileName: style.name, source: readFileSync(resolve(root, style.source)) });
            }
            this.emitFile({ type: 'asset', fileName: 'LICENSE', source: readFileSync(resolve(root, '../../LICENSE')) });
          },
        },
      },
    ],
    build: {
      cssCodeSplit: true,
      lib: { entry: entries, formats: ['es'], fileName: (_format, name) => `${name}.js` },
      rollupOptions: {
        external: (id) => externalPackages.some((name) => id === name || id.startsWith(`${name}/`)),
        output: { assetFileNames: 'assets/[name]-[hash][extname]' },
      },
    },
  });
}
