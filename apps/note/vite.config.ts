import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwind from '@tailwindcss/vite';

/**
 * Its own port, for the reason the site's config gives: the suites run one at a time and a port a
 * second app also claims is a suite that hangs rather than fails.
 */
export default defineConfig({
  plugins: [react(), tailwind()],
  server: { port: 5183 }
});
