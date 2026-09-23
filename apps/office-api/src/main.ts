import { readConfig } from './config.js';
import { createApiServer } from './server.js';

async function main(): Promise<void> {
  const config = readConfig(process.env);
  const app = createApiServer();
  let stopping = false;
  const stop = async () => {
    if (stopping) return;
    stopping = true;
    const deadline = setTimeout(() => {
      app.server.closeAllConnections();
      console.error(JSON.stringify({ event: 'api_shutdown_timeout' }));
      process.exit(1);
    }, config.shutdownTimeoutMs);
    try {
      await app.close();
      console.log(JSON.stringify({ event: 'api_stopped' }));
    } catch {
      console.error(JSON.stringify({ event: 'api_stop_failed' }));
      process.exitCode = 1;
    } finally {
      clearTimeout(deadline);
    }
  };
  process.on('SIGTERM', () => { void stop(); });
  process.on('SIGINT', () => { void stop(); });
  await app.listen({ port: config.port, host: config.host });
  console.log(JSON.stringify({ event: 'api_listening', port: config.port }));
}

main().catch(() => {
  console.error(JSON.stringify({ event: 'api_start_failed' }));
  process.exitCode = 1;
});
