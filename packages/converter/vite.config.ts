import { defineConfig } from 'vite';
import dts from 'vite-plugin-dts';
import { resolve } from 'path';

export default defineConfig({
  plugins: [
    dts({
      insertTypesEntry: true,
      include: ['src/**/*'],
      exclude: ['src/**/*.test.ts']
    })
  ],
  build: {
    lib: {
      entry: resolve(__dirname, 'src/index.ts'),
      name: 'BarocssConverter',
      formats: ['es'],
      fileName: 'index'
    },
    rollupOptions: {
      external: ['@barocss/datastore'],
      output: {
        globals: {
          '@barocss/datastore': 'BarocssDataStore'
        }
      }
    }
  },
  test: {
    globals: true,
    environment: 'jsdom'
  }
});

