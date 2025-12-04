import { defineConfig } from 'vite';
import dts from 'vite-plugin-dts';

export default defineConfig({
  plugins: [
    dts({
      insertTypesEntry: true,
    }),
  ],
  build: {
    lib: {
      entry: 'src/index.ts',
      name: 'BarocssExtensions',
      fileName: 'index',
      formats: ['es'],
    },
    rollupOptions: {
      external: [
        '@barocss/editor-core',
        '@barocss/model'
      ],
    },
  },
});
