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
      name: 'BarocssEditorViewReact',
      fileName: 'index',
      formats: ['es'],
    },
    rollupOptions: {
      external: [
        '@barocss/schema',
        '@barocss/model',
        '@barocss/datastore',
        '@barocss/renderer-react',
        'react',
        'react-dom'
      ],
    },
  },
});


