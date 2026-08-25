import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    /*
     * `node`, not jsdom: nothing here touches the DOM.
     *
     * That is the whole claim of this package — a box, a drag, an arrangement and a definition are
     * arithmetic, and the products draw them. A test that needed a browser here would mean
     * something had crept in that belongs on the other side of the seam.
     */
    environment: 'node',
    include: ['test/**/*.{test,spec}.{js,ts}', 'src/**/*.{test,spec}.{js,ts}'],
    exclude: ['node_modules', 'dist']
  }
});
