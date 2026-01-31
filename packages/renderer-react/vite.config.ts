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
      name: 'BarocssRendererReact',
      fileName: 'index',
      formats: ['es', 'cjs'],
    },
    rollupOptions: {
      // Do not bundle react/react-dom; host app provides them (peerDependencies)
      external: (id) => id === 'react' || id === 'react/jsx-runtime' || id === 'react-dom' || id.startsWith('react/'),
    },
  },
});
