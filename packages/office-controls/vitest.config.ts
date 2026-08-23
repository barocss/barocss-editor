import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    // node, not jsdom: nothing here touches the DOM. That is the point of the
    // package — a control's declaration and how it reads a selection are
    // arithmetic, and arithmetic runs in milliseconds without a document.
    environment: 'node',
    include: ['test/**/*.{test,spec}.{js,ts}'],
    exclude: ['node_modules', 'dist']
  }
});
