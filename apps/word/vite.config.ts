import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwind from '@tailwindcss/vite';
import { mkdirSync, writeFileSync, appendFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

/**
 * Somewhere for a recording of hand-typed input to land.
 *
 * The input lab records what happened while somebody typed, and a recording is
 * only useful if it can be read afterwards by whoever is fixing the thing — in
 * a file, with the timeline intact, not pasted out of a console. So the dev
 * server takes one and writes it to `.input-lab/`, newest last, with a one-line
 * index beside it for reading at a glance.
 *
 * Development only: it writes to the working tree, which is exactly what is
 * wanted while a person is sitting at the keyboard and exactly what should never
 * exist in a build.
 */
function inputLab(): Plugin {
  const directory = resolve(here, '.input-lab');
  return {
    name: 'input-lab',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/__input-lab', (request, response) => {
        if (request.method !== 'POST') {
          response.statusCode = 405;
          response.end('POST only');
          return;
        }
        let body = '';
        request.on('data', (chunk) => {
          body += chunk;
        });
        request.on('end', () => {
          try {
            const report = JSON.parse(body);
            mkdirSync(directory, { recursive: true });
            const stamp = new Date().toISOString().replace(/[:.]/g, '-');
            const slug = String(report.scenario ?? 'run').replace(/[^a-zA-Z0-9-]/g, '_');
            const file = `${stamp}-${slug}.json`;
            writeFileSync(resolve(directory, file), JSON.stringify(report, null, 2));
            appendFileSync(
              resolve(directory, 'index.jsonl'),
              `${JSON.stringify({
                file,
                scenario: report.scenario,
                title: report.title,
                findings: (report.findings ?? []).map((finding: any) => `${finding.severity}: ${finding.what}`)
              })}\n`
            );
            response.setHeader('content-type', 'application/json');
            response.end(JSON.stringify({ file }));
          } catch (error) {
            response.statusCode = 400;
            response.end(String(error));
          }
        });
      });
    }
  };
}

export default defineConfig({
  plugins: [react(), tailwind(), inputLab()],
  server: { port: 5180 }
});
