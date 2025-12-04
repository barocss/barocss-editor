import { defineConfig } from 'vite';
import dts from 'vite-plugin-dts';

export default defineConfig({
  plugins: [
    dts({
      insertTypesEntry: true,
    }),
  ],
  build: {
    minify: true,
    lib: {
      entry: 'src/index.ts',
      name: 'BarocssRendererDOM',
      fileName: 'index',
      formats: ['es', 'cjs'],
    }
  },
});
