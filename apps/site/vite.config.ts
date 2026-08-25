import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwind from '@tailwindcss/vite';

/**
 * Nothing but the defaults, and its own port.
 *
 * Its own, because the suites are run one at a time and a port a second app also claims is a suite
 * that hangs rather than fails — measured, on the day three of them were left running at once.
 */
export default defineConfig({
  plugins: [react(), tailwind()],
  server: { port: 5182 }
});
