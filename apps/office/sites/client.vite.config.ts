import { defineConfig, mergeConfig, type Plugin } from 'vite';
import original from '../vite.config';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const office = fileURLToPath(new URL('..', import.meta.url));
const bootstrap = fileURLToPath(new URL('./client-bootstrap.ts', import.meta.url));
function storageEntries(): Plugin {
  const entries = new Map<string, string>();
  return { name: 'sites-storage-before-native-import', enforce: 'pre',
    transformIndexHtml: { order: 'pre', handler(html, context) {
      if (context.filename.includes('/design-system/')) return html;
      return html.replace(/(<script\s+type="module"\s+src=")([^"]+)(")/, (_match, before, source, after) => {
        const originalEntry = source.startsWith('/') ? resolve(office, source.slice(1)) : resolve(dirname(context.filename), source);
        const id = `/wonffice-sites-entry-${entries.size}.js`; entries.set(id, originalEntry);
        return before + id + after;
      });
    } },
    resolveId(source) { if (entries.has(source)) return '\0' + source; },
    load(id) {
      const source = entries.get(id.slice(1)); if (!source) return;
      return `import { initializeOfficeStorage, showOfficeStorageFailure } from ${JSON.stringify(bootstrap)};\ninitializeOfficeStorage().then(() => import(${JSON.stringify(source)})).catch(showOfficeStorageFailure);`;
    }
  };
}
export default defineConfig(async environment => {
  const base = typeof original === 'function' ? await original(environment) : await original;
  return mergeConfig(base, { plugins: [storageEntries()] });
});
