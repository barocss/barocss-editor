import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    // jsdom, not node: the kit installs extensions that touch the DOM
    // (drag/drop listeners), which is what a product editor actually does.
    environment: 'jsdom',
    include: ['test/**/*.{test,spec}.{js,ts}', 'src/**/*.{test,spec}.{js,ts}'],
    exclude: ['node_modules', 'dist']
  }
});
