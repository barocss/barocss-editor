import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  build: {
    lib: {
      entry: resolve(__dirname, 'src/index.ts'),
      name: 'BarocssDOMObserver',
      fileName: 'index',
      formats: ['es']
    },
    rollupOptions: {
      external: ['@barocss/text-analyzer'],
      output: {
        globals: {
          '@barocss/text-analyzer': 'BarocssTextAnalyzer'
        }
      }
    },
    sourcemap: true,
    minify: false
  },
  plugins: [
    {
      name: 'generate-types',
      generateBundle() {
        // TypeScript 컴파일러로 타입 선언 파일 생성
        this.emitFile({
          type: 'asset',
          fileName: 'index.d.ts',
          source: `export { MutationObserverManagerImpl } from './src/index';
export type { MutationObserverManager, DOMStructureChangeEvent, NodeUpdateEvent, TextChangeEvent, MutationObserverOptions } from './src/index';`
        });
      }
    }
  ]
});
