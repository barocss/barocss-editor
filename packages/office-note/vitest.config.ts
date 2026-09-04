import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    // jsdom: the renderers here are templates the DSL turns into elements, and several tests draw
    // them to check what a paragraph, a table or a mark actually becomes.
    environment: 'jsdom',
    include: ['test/**/*.{test,spec}.{js,ts}', 'src/**/*.{test,spec}.{js,ts}'],
    exclude: ['node_modules', 'dist']
  }
});
