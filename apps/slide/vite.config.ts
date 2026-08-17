import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwind from '@tailwindcss/vite';

/**
 * Nothing but the defaults.
 *
 * Word's config carries a dev-server plugin for the input lab, which records
 * hand-typed input to a file. A deck has the same input problem and will want
 * the same tool; it is not copied here until it is, because a config that
 * carries a feature the app does not have is a config nobody trusts.
 */
export default defineConfig({
  plugins: [react(), tailwind()],
  server: { port: 5174 }
});
